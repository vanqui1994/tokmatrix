import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class VectorLibraryTest(unittest.TestCase):
    def test_showreel_preserves_namespaced_attachments_and_timing(self):
        from bkt_web.remake_vector import sample_stories, showreel, validate_story
        story = showreel()
        validate_story(story)
        self.assertEqual(story["duration"], 3 + 5 * len(sample_stories()))
        self.assertEqual(story["fidelity"], "technical-demo")
        ids = {c["id"] for c in story["characters"]}
        self.assertEqual(len(ids), len(story["characters"]))
        for character in story["characters"]:
            if character.get("attach_to"):
                self.assertIn(character["attach_to"]["id"], ids)
        for sample in sample_stories():
            self.assertIn(f"{sample['id']}-{sample['characters'][0]['id']}", ids)
        self.assertIn("sea-monsters-ss_monster", ids)
        self.assertIn("fishing-bobber", ids)

    def test_catalog_and_five_examples_validate(self):
        from bkt_web.remake_vector import catalog, examples, validate_story
        self.assertGreaterEqual(len(catalog()["assets"]), 15)
        self.assertEqual(len(examples()), 5)
        for story in examples():
            validate_story(story)
            self.assertEqual(story["fidelity"], "technical-demo")

    def test_agriculture_studies_cover_sow_harvest_and_latex_contacts(self):
        from bkt_web.remake_vector import agriculture_examples, validate_story
        stories = agriculture_examples()
        self.assertEqual([item["id"] for item in stories], ["farm-sow-grow", "farm-harvest", "farm-papaya-latex"])
        for story in stories:
            validate_story(story)
        harvest = stories[1]
        tomato = next(item for item in harvest["characters"] if item["id"] == "tomato")
        self.assertEqual(tomato["attach_to"]["anchor"], "branch_1")

    def test_invalid_assets_actions_and_times_are_rejected(self):
        from bkt_web.remake_vector import examples, validate_story
        for mutate in (
            lambda s: s["characters"][0].update(asset="unknown"),
            lambda s: s["scenes"][0]["poses"][s["characters"][0]["id"]][0].update(x=float("nan")),
            lambda s: s["scenes"][0]["actions"][0].update(type="invented"),
            lambda s: s["scenes"][0]["actions"][0].update(target="missing"),
            lambda s: s["scenes"][0]["actions"][0].update(end=999),
        ):
            story = copy.deepcopy(examples()[0])
            mutate(story)
            with self.assertRaises(ValueError):
                validate_story(story)

    def test_hand_drawn_material_and_exposure_contract(self):
        from bkt_web.remake_vector import examples, validate_story
        story = examples()[0]
        character = story["characters"][0]
        character["material"] = "ink"
        keys = story["scenes"][0]["poses"][character["id"]]
        keys[0].update(drawing_id="anticipation", exposure="twos")
        validate_story(story)
        character["material"] = "watercolor"
        with self.assertRaisesRegex(ValueError, "material"):
            validate_story(story)

    def test_catalog_declares_whole_pose_cel_rigs_for_every_requested_class(self):
        from bkt_web.remake_vector import catalog
        rig = catalog()["rig_style"]
        self.assertEqual(rig["name"], "hand-drawn-whole-pose-cel")
        self.assertTrue({"human", "plant", "fruit", "tool", "fish", "monster"}.issubset(rig["classes"]))

    def test_hand_drawn_exposure_holds_drawing_identity(self):
        import subprocess
        from bkt_web.remake_vector import STATIC_DIR, catalog
        program = r'''
require(process.argv[1]); const V=RemakeVector;
const keys=[{time:0,x:0,drawing_id:'rest',exposure:'twos'},{time:1,x:10,drawing_id:'lean'}];
if(V.track(keys,V.exposureTime(keys,.078),{}).drawing_id!=='rest')throw Error('twos jumped drawing');
if(V.exposureTime([{time:0,drawing_id:'a',exposure:'hold'},{time:1,drawing_id:'b'}],.8)!==0)throw Error('hold changed drawing');
console.log('hand-drawn exposure is deterministic');
'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_composer_rejects_path_traversal(self):
        from bkt_web.remake_vector import examples
        from bkt_web.remake_composer import compose_animated_video
        story = examples()[0]
        with self.assertRaisesRegex(ValueError, "an toàn"):
            compose_animated_video("../escape", story["characters"], story["scenes"], story["cues"], Path("audio.mp3"), Path("out.mp4"), story["duration"])

    def test_composer_embeds_native_library_without_sprites(self):
        from bkt_web.remake_vector import examples
        from bkt_web import remake_composer as composer
        story = examples()[0]
        story["cues"][0]["text"] = '</script><script>window.injected=true</script>'
        with tempfile.TemporaryDirectory() as tmp, patch.object(composer, "STATIC_DIR", Path(tmp)), patch.object(composer, "_record_with_playwright", return_value=None):
            composer.compose_animated_video("library-test", story["characters"], story["scenes"], story["cues"], Path(tmp) / "missing.mp3", Path(tmp) / "out.mp4", story["duration"])
            html = (Path(tmp) / "remake_library-test_animated.html").read_text()
            self.assertIn("RemakeVector", html)
            self.assertNotIn("{{", html)
            self.assertNotIn('src="http', html)
            self.assertNotIn('</script><script>window.injected', html)
            self.assertIn('"asset": "watermelon"', html)


class VectorValidationTest(unittest.TestCase):
    def test_overlapping_motion_and_attachment_cycles_rejected(self):
        from bkt_web.remake_vector import examples, validate_story
        story = examples()[0]
        story["scenes"][0]["actions"][1]["start"] = 2
        with self.assertRaisesRegex(ValueError, "chồng lấn"):
            validate_story(story)
        story = examples()[3]
        story["characters"][0]["attach_to"] = {"id": "shoot", "anchor": "root"}
        with self.assertRaisesRegex(ValueError, "vòng lặp"):
            validate_story(story)

    def test_unknown_anchor_mixed_renderer_and_gap_rejected(self):
        from bkt_web.remake_vector import examples, validate_story
        for mutate in (
            lambda s: s["scenes"][0]["actions"][0].update(target_anchor="missing"),
            lambda s: s["scenes"][1].update(renderer="papaya-native-v1"),
            lambda s: s["scenes"][1].update(start_time=8.01),
        ):
            story = examples()[0]
            mutate(story)
            with self.assertRaises(ValueError):
                validate_story(story)

    def test_visemes_and_expression_checked(self):
        from bkt_web.remake_vector import examples, validate_story
        story = examples()[0]
        story["cues"][0]["visemes"] = [{"time": .2, "open": 0}, {"time": .8, "open": 1}]
        validate_story(story)
        story["cues"][0]["visemes"][1]["open"] = 2
        with self.assertRaises(ValueError):
            validate_story(story)

    def test_every_default_action_anchor_exists(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        for spec in cat["actions"].values():
            for role in ("actor", "target"):
                for asset in spec[role + "s"]:
                    self.assertIn(spec[role + "_anchor"], cat["assets"][asset]["anchors"])

    def test_graze_lowers_head_to_the_grass_without_sinking_the_body(self):
        """Gặm cỏ: mõm chạm ngọn cỏ nhờ CÚI ĐẦU; thân/chân không bị kéo xuống dưới mặt đất."""
        import subprocess
        from bkt_web.remake_vector import catalog, STATIC_DIR, RENDERER
        cat = catalog()
        stories = []
        for asset in cat["actions"]["graze"]["actors"]:
            stories.append({"id": f"graze-{asset}", "renderer": RENDERER, "duration": 4, "characters": [
                {"id": "animal", "name": asset, "asset": asset}, {"id": "grass", "name": "grass", "asset": "grass_tuft", "face": False}],
                "scenes": [{"renderer": RENDERER, "kind": "scene", "index": 0, "start_time": 0, "end_time": 4,
                            "characters_present": ["animal", "grass"], "background": {"preset": "garden"},
                            "poses": {"animal": [{"time": 0, "x": 200, "y": 840, "height": 300}],
                                      "grass": [{"time": 0, "x": 430, "y": 845, "height": 180}]},
                            "actions": [{"type": "graze", "start": .5, "end": 3.8, "actor": "animal", "target": "grass"}]}]})
        program = r'''
const fs=require('fs');require(process.argv[1]);
const {stories,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const V=RemakeVector;const out=[];
for(const s of stories){
  const f=V.sample(s,cat,3.0),a=f.states.animal,g=f.states.grass;
  const m=V.worldAnchor(cat,a,'mouth'),top=V.worldAnchor(cat,g,'top');
  out.push({asset:a.asset,dist:Math.hypot(m.x-top.x,m.y-top.y),y:a.y,down:a.head_down||0});
}
console.log(JSON.stringify(out));'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")],
                                input=json.dumps({"stories": stories, "cat": cat}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for row in json.loads(result.stdout):
            with self.subTest(asset=row["asset"]):
                self.assertLess(row["dist"], 12, row)             # mõm chạm ngọn cỏ
                self.assertAlmostEqual(row["y"], 840, delta=.01)  # chân vẫn trên mặt đất
                self.assertGreater(row["down"], .2, row)          # đạt được là nhờ cúi đầu

    def test_scene_wind_bends_plants_and_moves_their_anchors(self):
        """weather: wind làm cây nghiêng sang phải (anchor ngọn đi theo); keyframe wind ghi đè; người không bị nghiêng."""
        import subprocess
        from bkt_web.remake_vector import catalog, STATIC_DIR, RENDERER, validate_story
        def story(weather, flower_key=None):
            flower = {"time": 0, "x": 200, "y": 830, "height": 300, "growth": 1, **(flower_key or {})}
            return {"id": f"wind-{weather}", "renderer": RENDERER, "duration": 3, "characters": [
                {"id": "flower", "name": "flower", "asset": "sunflower"}, {"id": "man", "name": "man", "asset": "farmer"}],
                "scenes": [{"renderer": RENDERER, "kind": "scene", "index": 0, "start_time": 0, "end_time": 3,
                            "characters_present": ["flower", "man"], "background": {"preset": "garden", "weather": weather},
                            "poses": {"flower": [flower], "man": [{"time": 0, "x": 400, "y": 830, "height": 300}]}, "actions": []}]}
        stories = [story("clear"), story("wind"), story("wind", {"wind": 0})]
        for item in stories:
            validate_story(item)
        program = r'''
const fs=require('fs');require(process.argv[1]);
const {stories,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const V=RemakeVector;
console.log(JSON.stringify(stories.map(s=>{const f=V.sample(s,cat,1.5);
  return {top:V.worldAnchor(cat,f.states.flower,'top').x,root:V.worldAnchor(cat,f.states.flower,'root').x,man:V.worldAnchor(cat,f.states.man,'top').x};})));'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")],
                                input=json.dumps({"stories": stories, "cat": catalog()}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        calm, windy, pinned = json.loads(result.stdout)
        self.assertGreater(windy["top"] - calm["top"], 15)          # ngọn hoa nghiêng theo gió
        self.assertAlmostEqual(windy["root"], calm["root"], 3)      # gốc đứng yên
        self.assertAlmostEqual(pinned["top"], calm["top"], 3)       # keyframe wind: 0 ghi đè gió của cảnh
        self.assertAlmostEqual(windy["man"], calm["man"], 3)        # người không bị shear

    def test_packs_cannot_replace_existing_rigs_or_backgrounds(self):
        import subprocess
        from bkt_web.remake_vector import STATIC_DIR
        program = r'''
require(process.argv[1]);const V=RemakeVector;const out=[];
for(const pack of [{rigs:{apple:{group:'fruit',draw(){}}}},{backgrounds:{garden:{draw(){}}}},{rigs:{new_rig:{group:'prop'}}}]){
  try{V.register(pack);out.push('ok');}catch(e){out.push('refused');}
}
V.register({rigs:{test_only_rig:{group:'prop',draw(){}}}});
console.log(JSON.stringify(out));'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), ["refused", "refused", "refused"])

    def test_engine_sources_refuses_missing_pack_files(self):
        from unittest.mock import patch
        from bkt_web import remake_vector
        cat = {**remake_vector.catalog(), "engine_packs": ["does_not_exist"]}
        with patch.object(remake_vector, "_catalog", return_value=cat):
            with self.assertRaises(FileNotFoundError):
                remake_vector.engine_sources()

    def test_ground_warnings_flag_only_floating_people(self):
        from bkt_web.remake_vector import RENDERER, ground_warnings
        def story(y, asset="farmer"):
            return {"duration": 2, "characters": [{"id": "p", "asset": asset}], "scenes": [{"renderer": RENDERER, "start_time": 0, "end_time": 2,
                    "characters_present": ["p"], "background": {"preset": "garden"}, "poses": {"p": [{"time": 0, "x": 200, "y": y, "height": 300}]}, "actions": []}]}
        self.assertEqual(len(ground_warnings(story(600))), 1)       # lơ lửng trên mặt đất
        self.assertEqual(ground_warnings(story(900)), [])           # đứng gần máy quay
        self.assertEqual(ground_warnings(story(500, "hand")), [])   # tay cận cảnh
        self.assertEqual(ground_warnings(story(400, "butterfly")), [])  # con biết bay

    def test_sparrow_perches_and_only_flaps_while_flying(self):
        import subprocess
        from bkt_web.remake_vector import catalog, STATIC_DIR, RENDERER
        story = {"id": "sparrow", "renderer": RENDERER, "duration": 4, "characters": [{"id": "bird", "name": "sparrow", "asset": "sparrow"}],
                 "scenes": [{"renderer": RENDERER, "kind": "scene", "index": 0, "start_time": 0, "end_time": 4, "characters_present": ["bird"],
                             "background": {"preset": "garden"}, "poses": {"bird": [{"time": 0, "x": 288, "y": 600, "height": 200}]},
                             "actions": [{"type": "fly", "start": 1, "end": 3, "actor": "bird"}]}]}
        program = r'''
const fs=require('fs');require(process.argv[1]);
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const V=RemakeVector;
console.log(JSON.stringify([.5,2,3.5].map(t=>Boolean(V.sample(story,cat,t).states.bird.flying))));'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")],
                                input=json.dumps({"story": story, "cat": catalog()}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), [False, True, False])

    def test_contact_and_attachments_are_deterministic(self):
        import subprocess
        from bkt_web.remake_vector import catalog, examples, STATIC_DIR
        program = r'''
const fs=require('fs');
require(process.argv[1]);
const {stories,cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const V=RemakeVector;
const before=JSON.stringify(stories);
for(const s of stories){
  const a=JSON.stringify(V.sample(s,cat,.5));
  V.sample(s,cat,s.duration-.01);V.sample(s,cat,3.25);
  if(a!==JSON.stringify(V.sample(s,cat,.5)))throw Error('non-deterministic');
}
if(before!==JSON.stringify(stories))throw Error('mutated input');
const cut=V.sample(stories[0],cat,2);
const tip=V.worldAnchor(cat,cut.states.blade,'tip');
const point=V.worldAnchor(cat,cut.states.left,'cut');
const stroke=Math.min(65,cut.states.left.height*.25)*.6;
if(Math.hypot(tip.x-point.x,tip.y-point.y-stroke)>1e-6)throw Error('knife missed fruit');
const press=V.sample(stories[3],cat,2.5);
const sole=V.worldAnchor(cat,press.states.foot,'sole');
const shoot=V.worldAnchor(cat,press.states.plant,'shoot');
if(Math.hypot(sole.x-shoot.x,sole.y-shoot.y)>1e-6)throw Error('foot missed plant');
if(Math.hypot(press.states.shoot.x-shoot.x,press.states.shoot.y-shoot.y-35)>1e-6)throw Error('face detached');
const speaking=V.sample(stories[0],cat,.5);
if(!speaking.states.left.speaking||speaking.states.right.speaking)throw Error('wrong speaker');
console.log('contact, attachment, immutability, seek and speaker checks passed');
'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")], input=json.dumps({"stories": examples(), "cat": catalog()}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class ArticulatedRigTest(unittest.TestCase):
    def test_articulation_examples_validate(self):
        from bkt_web.remake_vector import articulation_examples, validate_story
        self.assertEqual(len(articulation_examples()), 3)
        for story in articulation_examples():
            validate_story(story)

    def test_release_requires_ownership_and_no_double_holder(self):
        from bkt_web.remake_vector import articulation_examples, validate_story
        story = articulation_examples()[0]
        story["scenes"][0]["actions"] = [story["scenes"][0]["actions"][1]]
        with self.assertRaises(ValueError):
            validate_story(story)
        story = articulation_examples()[0]
        story["scenes"][0]["actions"].append({"type": "grip", "actor": "hand", "target": "tool", "start": 2, "end": 3})
        with self.assertRaises(ValueError):
            validate_story(story)

    def test_wrist_and_attached_holder_release(self):
        import subprocess
        from bkt_web.remake_vector import articulation_examples, catalog, STATIC_DIR
        story = articulation_examples()[0]
        story["characters"].append({"id": "parent", "asset": "farmer"})
        story["characters"][0]["attach_to"] = {"id": "parent", "anchor": "hand_l"}
        scene = story["scenes"][0]
        scene["characters_present"].append("parent")
        scene["poses"]["parent"] = [{"time": 0, "x": 200, "y": 850, "height": 430}, {"time": 8, "x": 420, "y": 800, "height": 480, "rotation": 20}]
        scene["poses"]["hand"] = [{"time": 0, "x": 0, "y": 0, "height": 100, "hand_pose": "open", "wrist": 0}, {"time": 8, "x": 0, "y": 0, "height": 100, "hand_pose": "open", "wrist": 60}]
        program = r'''
const fs=require('fs');require(process.argv[1]);const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8')),V=RemakeVector;
const h={...cat.pose_defaults,asset:'hand',id:'hand',height:100,x:0,y:0};
const a=V.worldAnchor(cat,h,'grip'),b=V.worldAnchor(cat,{...h,wrist:60},'grip');
if(Math.hypot(a.x-b.x,a.y-b.y)<1)throw Error('wrist does not move palm/grip');
const held=V.sample(story,cat,3),pa=V.worldAnchor(cat,held.states.hand,'grip'),pb=V.worldAnchor(cat,held.states.tool,'grip');
if(Math.hypot(pa.x-pb.x,pa.y-pb.y)>1e-6)throw Error('attached holder loses tool');
const before=V.sample(story,cat,5-1e-7).states.tool,after=V.sample(story,cat,5).states.tool;
if(Math.hypot(before.x-after.x,before.y-after.y)>.001)throw Error('opening hand jumps released object');
console.log('wrist and attached holder passed');
'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")], input=json.dumps({"story": story, "cat": catalog()}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_hold_release_and_joint_frames(self):
        import subprocess
        from bkt_web.remake_vector import articulation_examples, catalog, STATIC_DIR
        program = r'''
const fs=require('fs'); require(process.argv[1]);
const {stories,cat}=JSON.parse(fs.readFileSync(0,'utf8')),V=RemakeVector;
const story=stories[0],before=JSON.stringify(story);
const held=V.sample(story,cat,3);
const a=V.worldAnchor(cat,held.states.hand,'grip'),b=V.worldAnchor(cat,held.states.tool,'grip');
if(Math.hypot(a.x-b.x,a.y-b.y)>1e-6)throw Error('grip detached');
const release=story.scenes[0].actions.find(a=>a.type==='release');
const at=V.sample(story,cat,release.start),prior=V.sample(story,cat,release.start-1e-7);
if(Math.hypot(at.states.tool.x-prior.states.tool.x,at.states.tool.y-prior.states.tool.y)>.001)throw Error('release jumped');
const late=V.sample(story,cat,release.end+.1),later=V.sample(story,cat,story.duration-.1);
if(Math.hypot(late.states.tool.x-later.states.tool.x,late.states.tool.y-later.states.tool.y)>1e-6)throw Error('released tool follows hand');
if(JSON.stringify(held)!==JSON.stringify(V.sample(story,cat,3)))throw Error('seek not stable');
if(before!==JSON.stringify(story))throw Error('input mutated');
const branch=V.sample(stories[2],cat,3),origin=V.worldAnchor(cat,branch.states.plant,'branch_2');
if(Math.hypot(origin.x-branch.states.face.x,origin.y-branch.states.face.y)>1e-6)throw Error('branch face detached');
const open=V.handSkeleton({...cat.pose_defaults,hand_pose:'open'}),fist=V.handSkeleton({...cat.pose_defaults,hand_pose:'fist'});
if(JSON.stringify(open)===JSON.stringify(fist))throw Error('no finger articulation');
console.log('grip, release, branch and hand kinematics passed');
'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")], input=json.dumps({"stories": articulation_examples(), "cat": catalog()}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class FarmerIkTest(unittest.TestCase):
    def test_ik_examples_validate(self):
        from bkt_web.remake_vector import ik_examples, validate_story
        self.assertEqual(len(ik_examples()), 2)
        for story in ik_examples():
            validate_story(story)

    def test_reach_and_two_hand_carry_contacts(self):
        import subprocess
        from bkt_web.remake_vector import ik_examples, catalog, STATIC_DIR
        program = r'''
const fs=require('fs'); require(process.argv[1]);
const {stories,cat}=JSON.parse(fs.readFileSync(0,'utf8')),V=RemakeVector;
const reach=V.sample(stories[0],cat,5);
const hand=V.worldAnchor(cat,reach.states.farmer,'hand_r'),grip=V.worldAnchor(cat,reach.states.object,'grip');
if(Math.hypot(hand.x-grip.x,hand.y-grip.y)>1e-6)throw Error('right hand missed reach target');
const carry=V.sample(stories[1],cat,5);
const center=V.worldAnchor(cat,carry.states.farmer,'carry'),root=V.worldAnchor(cat,carry.states.object,'root');
if(Math.hypot(center.x-root.x,center.y-root.y)>1e-6)throw Error('carried object missed torso anchor');
for(const side of ['l','r']){
  const a=V.worldAnchor(cat,carry.states.farmer,`hand_${side}`),b=V.worldAnchor(cat,carry.states.object,`grip_${side}`);
  if(Math.hypot(a.x-b.x,a.y-b.y)>1e-6)throw Error(`${side} hand missed carry grip`);
}
if(JSON.stringify(carry)!==JSON.stringify(V.sample(stories[1],cat,5)))throw Error('IK seek not deterministic');
console.log('farmer reach and two-hand carry passed');
'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")], input=json.dumps({"stories": ik_examples(), "cat": catalog()}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class PackContractTest(unittest.TestCase):
    """Hợp đồng giữa gói JS và catalog: cây/dây leo, hái/rung, đăng ký rig."""

    def _node(self, program, payload=None):
        import subprocess
        from bkt_web.remake_vector import engine_sources
        prelude = "const fs=require('fs');for(const f of JSON.parse(process.argv[1]))require(f);const V=RemakeVector;"
        result = subprocess.run(["node", "-e", prelude + program, json.dumps([str(p) for p in engine_sources()])],
                                input=json.dumps(payload or {}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_every_pack_rig_is_in_the_catalog_with_its_pack_and_specs_match(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        # Nạp lõi, rồi từng gói với register được bọc để biết gói nào đăng ký rig nào.
        import subprocess
        from bkt_web.remake_vector import STATIC_DIR
        program = r"""
const fs=require('fs');require(process.argv[1]);const V=RemakeVector;const cat=JSON.parse(fs.readFileSync(0,'utf8'));
const orig=V.register, owner={}, specs={};let current=null;
V.register=p=>{for(const [id,d] of Object.entries(p.rigs||{})){owner[id]=current; if(d.spec&&d.spec.slots) specs[id]=d.spec;} return orig(p);};
for(const p of cat.engine_packs){current=p;require(process.argv[2]+'/'+p+'.js');}
console.log(JSON.stringify({owner,specs}));"""
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js"), str(STATIC_DIR / "remake_vector_packs")],
                                input=json.dumps(cat), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        for rig, pack in data["owner"].items():
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"], "gói đăng ký rig không có trong catalog")
                self.assertEqual(cat["assets"][rig].get("pack"), pack)
        for rig, meta in cat["assets"].items():
            if meta.get("pack"):
                self.assertEqual(data["owner"].get(rig), meta["pack"], f"{rig} khai pack nhưng gói không vẽ")
        for rig, spec in data["specs"].items():
            with self.subTest(spec=rig):
                self.assertEqual(cat["assets"][rig]["spec"], spec, "catalog spec phải đồng bộ với gói")
                slots = spec["slots"]
                for n in range(1, 9):
                    self.assertEqual(cat["assets"][rig]["anchors"][f"fruit_{n}"], slots[min(n, len(slots)) - 1])

    def test_spawned_fruit_sits_exactly_on_the_drawn_fruit(self):
        """tree_fruit_placement == worldAnchor(fruit_N) của engine ở mọi growth/lật, cho cả cây (co theo growth) và dây leo (fixed_anchors)."""
        from bkt_web.remake_vector import catalog, tree_fruit_placement
        cat = catalog()
        cases = []
        for rig in ("mango_tree", "jackfruit_tree", "pineapple_plant", "persimmon_tree", "cherry_tree", "cucumber_vine", "grape_vine"):
            slots = len(cat["assets"][rig]["spec"]["slots"])
            for growth in (0.5, 0.75, 1):
                for flip in (False, True):
                    pos = {"x": 250, "y": 820, "height": 480, "growth": growth, "flip": flip}
                    cases.append({"rig": rig, "slot": slots, "pos": pos, "py": tree_fruit_placement(rig, slots, pos)})
        out = self._node(r"""
const {cases,cat}=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(cases.map(c=>{const s={...cat.pose_defaults,...c.pos,rotation:0,asset:c.rig,id:'t',style:{}};
  const a=V.worldAnchor(cat,s,'fruit_'+c.slot);return {x:a.x,y:a.y};})));""", {"cases": cases, "cat": cat})
        for case, js in zip(cases, out):
            with self.subTest(rig=case["rig"], growth=case["pos"]["growth"], flip=case["pos"]["flip"]):
                self.assertAlmostEqual(case["py"]["x"], js["x"], delta=1)
                self.assertAlmostEqual(case["py"]["center_y"], js["y"], delta=1)
                self.assertAlmostEqual(case["py"]["y"] - case["py"]["height"] / 2, js["y"], delta=1)

    def test_scene_season_reaches_trees_and_winter_strips_fruit(self):
        """background.season → s.season; mùa đông cây trụi lá không còn quả (trừ winterFruit như hồng)."""
        from bkt_web.remake_vector import catalog, RENDERER, validate_story
        def story(tree, season):
            return {"id": f"{tree}-{season}", "renderer": RENDERER, "duration": 2, "characters": [{"id": "t", "asset": tree}],
                    "scenes": [{"renderer": RENDERER, "start_time": 0, "end_time": 2, "characters_present": ["t"],
                                "background": {"preset": "garden", "season": season},
                                "poses": {"t": [{"time": 0, "x": 288, "y": 810, "height": 480, "growth": 1}]}, "actions": []}]}
        stories = [story(t, s) for t in ("pear_tree", "persimmon_tree") for s in ("summer", "winter")]
        for item in stories:
            validate_story(item)
        out = self._node(r"""
const {stories,cat}=JSON.parse(fs.readFileSync(0,'utf8'));globalThis.Path2D=globalThis.Path2D||class{};
// Đếm lời gọi vẽ thân quả của cây để biết quả có được vẽ không.
const res=[];for(const st of stories){const f=V.sample(st,cat,0.5),s=f.states.t;const fruit=cat.assets[s.asset].spec.fruit;
  const body=V.kit.FRUIT_BODIES[fruit];let n=0;V.kit.FRUIT_BODIES[fruit]=(...a)=>{n++;};
  const noop=new Proxy({},{get:(o,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{} ,set:()=>true});
  V.kit.RIG_DRAWERS[s.asset](noop,s,0.5,cat);V.kit.FRUIT_BODIES[fruit]=body;res.push({season:s.season,fruits:n});}
console.log(JSON.stringify(res));""", {"stories": stories, "cat": catalog()})
        self.assertEqual([r["season"] for r in out], ["summer", "winter", "summer", "winter"])
        pear_summer, pear_winter, persimmon_summer, persimmon_winter = [r["fruits"] for r in out]
        self.assertGreater(pear_summer, 0)
        self.assertEqual(pear_winter, 0)                  # lê trụi lá, không quả
        self.assertEqual(persimmon_winter, persimmon_summer)  # hồng còn quả trên cành

    def test_pack_fruits_and_vegetables_declare_their_limb_colour(self):
        """Quả/củ của gói tự tính màu thân; thiếu limbColor thì tay chân rơi về đỏ mặc định của lõi."""
        from bkt_web.remake_vector import catalog
        cat = catalog()
        out = self._node(r"""
const {cat}=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(Object.keys(cat.assets).filter(id=>cat.assets[id].pack&&['fruit','vegetable'].includes(cat.assets[id].group)&&!(V.kit.FRUIT_LIMBS[id]||{}).limbColor)));""", {"cat": cat})
        self.assertEqual(out, [])

    def test_people_pick_by_reaching_not_by_moving_their_body(self):
        from bkt_web.remake_vector import catalog, orchard_harvest_examples
        story = orchard_harvest_examples()[0]
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const rows=[];
for(const t of [1.0,1.3,1.6,1.9]){const f=V.sample(story,cat,t),a=f.states.farmer;
  const h=V.worldAnchor(cat,a,'hand_l'),fr=V.worldAnchor(cat,f.states.mango_tree,'fruit_6');rows.push({t,y:a.y,d:Math.hypot(h.x-fr.x,h.y-fr.y)});}
console.log(JSON.stringify(rows));""", {"story": story, "cat": catalog()})
        for row in out:
            self.assertAlmostEqual(row["y"], 810, delta=0.01)   # chân vẫn trên mặt đất
        self.assertLess(out[2]["d"], 3)                           # tay chạm quả lúc start + 0.6

    def _medical_distances(self, story, pairs, start, end):
        """Khoảng cách thế giới giữa các cặp (id, anchor) mỗi 0.1 s trong [start, end]."""
        from bkt_web.remake_vector import catalog
        return self._node(r"""
const {story,cat,pairs,start,end}=JSON.parse(fs.readFileSync(0,'utf8'));const rows=[];
for(let i=0;start+i*0.1<=end+1e-9;i++){const t=+(start+i*0.1).toFixed(3),f=V.sample(story,cat,t);
  rows.push({t,d:pairs.map(([a,an,b,bn])=>{const p=V.worldAnchor(cat,f.states[a],an),q=V.worldAnchor(cat,f.states[b],bn);return Math.hypot(p.x-q.x,p.y-q.y);})});}
console.log(JSON.stringify(rows));""", {"story": story, "cat": catalog(), "pairs": pairs, "start": start, "end": end})

    @staticmethod
    def _action(story, kind):
        return next(a for sc in story["scenes"] for a in sc.get("actions", []) if a["type"] == kind)

    def test_wash_hands_keeps_both_hands_rubbing_together(self):
        """Plan §9: rửa tay 6 bước — hai bàn tay trong 14 px của nhau mỗi 0.1 s (ngoài lúc đưa tay vào/ra)."""
        from bkt_web.remake_vector import handwashing_examples
        story = handwashing_examples()[0]
        a = self._action(story, "wash_hands")
        d = a["end"] - a["start"]
        rows = self._medical_distances(story, [["kid", "hand_l", "kid", "hand_r"]], a["start"] + .1 * d, a["end"] - .1 * d)
        self.assertGreater(len(rows), 40)
        for row in rows:
            self.assertLessEqual(row["d"][0], 14, row)

    def test_held_tools_touch_their_target_during_the_action(self):
        """brush_teeth: lông bàn chải; take_temperature: đầu nhiệt kế; listen: mặt ống nghe — trong 14 px quanh đích."""
        from bkt_web.remake_vector import doctor_visit_examples, tooth_examples
        cases = [
            (tooth_examples()[0], "brush_teeth", ["brush", "bristles", "tooth", "mouth"], .15, .85),
            (doctor_visit_examples()[0], "take_temperature", ["thermo", "tip", "patient", "forehead"], .2, .85),
            (doctor_visit_examples()[0], "listen", ["stetho", "chest_piece", "patient", "chest"], .2, .85),
        ]
        for story, kind, pair, lo, hi in cases:
            with self.subTest(kind):
                a = self._action(story, kind)
                d = a["end"] - a["start"]
                rows = self._medical_distances(story, [pair], a["start"] + lo * d, a["start"] + hi * d)
                self.assertGreater(len(rows), 15)
                for row in rows:
                    self.assertLessEqual(row["d"][0], 14, (kind, row))

    def test_vaccinate_needle_touches_the_arm_only_inside_the_contact_window(self):
        """Kim chạm arm_l trong khoảng tiếp xúc [0.4, 0.6] và không chạm ngoài [0.35, 0.65] của action."""
        from bkt_web.remake_vector import doctor_visit_examples
        story = doctor_visit_examples()[0]
        a = self._action(story, "vaccinate")
        d = a["end"] - a["start"]
        rows = self._medical_distances(story, [["syringe", "needle", "patient", "arm_l"]], a["start"] - .3, a["end"] + .2)
        inside = [r for r in rows if a["start"] + .4 * d <= r["t"] <= a["start"] + .6 * d]
        outside = [r for r in rows if not a["start"] + .35 * d <= r["t"] <= a["start"] + .65 * d]
        self.assertTrue(inside and outside)
        for row in inside:
            self.assertLessEqual(row["d"][0], 14, row)
        for row in outside:
            self.assertGreater(row["d"][0], 14, row)
        after = self._node(r"""
const {story,cat,t}=JSON.parse(fs.readFileSync(0,'utf8'));const b=V.sample(story,cat,t-1.2).states.patient,f=V.sample(story,cat,t).states.patient;
console.log(JSON.stringify([b.expression,f.expression,!!f.vaccinated]));""", {"story": story, "cat": __import__("bkt_web.remake_vector", fromlist=["catalog"]).catalog(), "t": a["end"] - .05})
        self.assertEqual(after, ["worried", "happy", True])

    def test_medical_tool_must_be_held_by_the_actor(self):
        import copy
        from bkt_web.remake_vector import doctor_visit_examples, validate_story
        story = doctor_visit_examples()[0]
        bad = copy.deepcopy(story)
        next(c for c in bad["characters"] if c["id"] == "syringe")["attach_to"]["id"] = "patient"
        with self.assertRaisesRegex(ValueError, "tool"):
            validate_story(bad)
        bad = copy.deepcopy(story)
        self._action(bad, "vaccinate")["tool"] = "thermo_missing"
        with self.assertRaisesRegex(ValueError, "tool"):
            validate_story(bad)

    def test_tug_chain_holds_the_one_in_front_until_the_pop(self):
        """Plan §14: tug — tay (thú: miệng) của mỗi người kéo nằm trong 12 px quanh điểm nắm của người phía trước."""
        from bkt_web.remake_vector import giant_radish_examples
        story = giant_radish_examples()[0]
        a = next(x for sc in story["scenes"] for x in sc["actions"] if x["type"] == "tug" and x.get("helpers"))
        pairs = [["grandpa", "hand_l", "radish", "grip"], ["grandpa", "hand_r", "radish", "grip"],
                 ["grandma", "hand_l", "grandpa", "waist"], ["kid", "hand_r", "grandma", "waist"],
                 ["dog", "mouth", "kid", "waist"], ["cat", "mouth", "dog", "tail"], ["mouse", "mouth", "cat", "tail"]]
        rows = self._medical_distances(story, pairs, a["start"], a["pop_at"] - .05)
        self.assertGreater(len(rows), 30)
        for row in rows:
            self.assertLess(max(row["d"]), 12, row)
        after = self._medical_distances(story, pairs[:1], a["end"] - .05, a["end"] - .05)
        self.assertGreater(after[0]["d"][0], 40)   # đã buông tay, ngã ra sau

    def test_spray_drift_only_poisons_whoever_the_wind_carries_it_to(self):
        """spray_drift: người cuối gió nhiễm toxic sau khi luồng sương chạm; lặng gió thì luồng không tới được."""
        import copy
        from bkt_web.remake_vector import catalog, safe_spraying_examples
        story = safe_spraying_examples()[0]
        calm = copy.deepcopy(story)
        calm["scenes"][1]["background"]["weather"] = "clear"
        out = self._node(r"""
const {story,calm,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const tox=(st,t,id)=>V.sample(st,cat,t).states[id].toxic||0;
console.log(JSON.stringify({start:tox(story,6.0,'bystander'),late:tox(story,9.0,'bystander'),held:tox(story,9.9,'bystander'),
  sprayer:tox(story,9.0,'farmer'),calm:tox(calm,9.0,'bystander'),face:V.sample(story,cat,9.9).states.bystander.expression}));""",
            {"story": story, "calm": calm, "cat": catalog()})
        self.assertEqual(out["start"], 0)
        self.assertGreater(out["late"], .8)
        self.assertGreater(out["held"], .8)        # hold: vẫn nhiễm sau khi ngừng phun
        self.assertEqual(out["sprayer"], 0)
        self.assertEqual(out["calm"], 0)
        self.assertEqual(out["face"], "sick")

    def test_wilt_holds_and_perk_up_recovers(self):
        from bkt_web.remake_vector import catalog, validate_story
        def scene(start, end, actions):
            return {"renderer": "native-vector-v1", "kind": "scene", "start_time": start, "end_time": end, "characters_present": ["p"],
                    "poses": {"p": [{"time": start, "x": 288, "y": 810, "height": 300}]}, "actions": actions, "background": {"preset": "garden"}}
        story = validate_story({"id": "wilt", "renderer": "native-vector-v1", "duration": 4, "characters": [{"id": "p", "asset": "chili_plant" if "chili_plant" in catalog()["assets"] else "tomato_plant"}],
                                "scenes": [scene(0, 4, [{"type": "wilt", "target": "p", "start": .5, "end": 1.5}, {"type": "perk_up", "target": "p", "start": 2.5, "end": 3.5}])]})
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify([0.2,2.0,3.9].map(t=>V.sample(story,cat,t).states.p.damage)));""", {"story": story, "cat": catalog()})
        self.assertLess(out[0], .05)
        self.assertGreater(out[1], .9)    # héo và giữ nguyên sau khi wilt kết thúc
        self.assertLess(out[2], .05)      # perk_up đưa về tươi, không đẩy damage lên 1

    def test_validator_rejects_bad_pick_and_shake(self):
        import copy
        from bkt_web.remake_vector import orchard_harvest_examples, validate_story
        story = orchard_harvest_examples()[0]
        validate_story(story)
        short = copy.deepcopy(story)
        pick = next(a for a in short["scenes"][0]["actions"] if a["type"] == "pick")
        pick["contact"] = pick["end"] + 0.5
        with self.assertRaisesRegex(ValueError, "contact"):
            validate_story(short)
        floating = copy.deepcopy(story)
        floating["scenes"][2]["poses"]["durian_dropped"] = [dict(k, y=600) for k in floating["scenes"][2]["poses"]["durian_dropped"]]
        with self.assertRaisesRegex(ValueError, "chạm mặt đất"):
            validate_story(floating)
        wrong = copy.deepcopy(story)
        next(c for c in wrong["characters"] if c["id"] == "durian_dropped")["asset"] = "mango"
        with self.assertRaisesRegex(ValueError, "sai loại"):
            validate_story(wrong)

    def test_phase_e_vegetables_catalog_assets_and_specs(self):
        """Mọi rau củ (nhóm vegetable) và cây trong đất (nhóm plant) có đầy đủ anchor, spec và action targets."""
        from bkt_web.remake_vector import catalog
        cat = catalog()
        self.assertIn("vegetables", cat.get("engine_packs", []))
        self.assertIn("vegetable", cat.get("rig_style", {}).get("classes", []))

        # 1. 15 củ/bông đã thu hoạch (nhóm vegetable)
        harvested = [
            "kohlrabi", "potato", "sweet_potato", "cassava", "taro",
            "radish", "beet", "onion", "garlic", "ginger",
            "cauliflower", "broccoli", "okra", "chili", "mushroom"
        ]
        req_veg_anchors = {"root", "face", "top", "grip", "surface", "mouth", "hand_l", "hand_r", "foot_l", "foot_r"}
        for vid in harvested:
            with self.subTest(vegetable=vid):
                self.assertIn(vid, cat["assets"])
                meta = cat["assets"][vid]
                self.assertEqual(meta["group"], "vegetable")
                self.assertEqual(meta.get("pack"), "vegetables")
                self.assertTrue(req_veg_anchors.issubset(set(meta["anchors"].keys())))

        # 2. 18 cây trong đất (nhóm plant, face: true)
        soil_plants = [
            "kohlrabi_plant", "potato_plant", "sweet_potato_plant", "cassava_plant", "taro_plant",
            "radish_plant", "beet_plant", "onion_plant", "garlic_plant", "ginger_plant",
            "cauliflower_plant", "broccoli_plant", "lettuce", "napa_cabbage", "water_spinach",
            "mustard_greens", "spring_onion", "giant_radish"
        ]
        req_soil_anchors = {"root", "soil", "stem", "face", "top", "leaf", "fruit"}
        for pid in soil_plants:
            with self.subTest(soil_plant=pid):
                self.assertIn(pid, cat["assets"])
                meta = cat["assets"][pid]
                self.assertEqual(meta["group"], "plant")
                self.assertEqual(meta.get("pack"), "vegetables")
                self.assertTrue(meta.get("face"), f"{pid} phải có face: true")
                self.assertTrue(req_soil_anchors.issubset(set(meta["anchors"].keys())), f"{pid} thiếu anchor bắt buộc")
                spec = meta.get("spec", {})
                self.assertIn("underground", spec)
                self.assertIn("tuberY", spec)
                if spec["underground"]:
                    self.assertGreater(meta["anchors"]["fruit"][1], 0)
                    self.assertGreater(spec["tuberY"], 0)

        # giant_radish có thêm grip
        self.assertIn("grip", cat["assets"]["giant_radish"]["anchors"])

        # 3. Hình nền vegetable_rows
        self.assertIn("vegetable_rows", cat["backgrounds"])
        self.assertIn("vegetable_rows", cat["background_specs"])
        bg_spec = cat["background_specs"]["vegetable_rows"]
        self.assertEqual(bg_spec["theme"], "garden")
        self.assertEqual(bg_spec["ground_y"], 810)

        # 4. Actions targets
        for act in ("uproot", "water", "fertilize", "grow"):
            targets = cat["actions"][act]["targets"]
            for pid in soil_plants:
                self.assertIn(pid, targets, f"{pid} thiếu trong targets của action {act}")

    def test_phase_e_soil_plants_underground_roots_spy(self):
        """Ở roots = 0 và cutaway = 0, hàm vẽ KHÔNG vẽ gì ở vùng y > 4. Với roots = 1, có vẽ củ/rễ (y > 4)."""
        from bkt_web.remake_vector import catalog
        soil_plants = [
            "kohlrabi_plant", "potato_plant", "sweet_potato_plant", "cassava_plant", "taro_plant",
            "radish_plant", "beet_plant", "onion_plant", "garlic_plant", "ginger_plant",
            "cauliflower_plant", "broccoli_plant", "lettuce", "napa_cabbage", "water_spinach",
            "mustard_greens", "spring_onion", "giant_radish"
        ]
        program = r"""
const { plants, cat } = JSON.parse(fs.readFileSync(0, 'utf8'));

function parseSvgPathPoints(d) {
  const pts = [];
  const re = /([MLQCZ])([^MLQCZ]*)/gi;
  let match;
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1].toUpperCase();
    const nums = match[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i+1] });
    } else if (cmd === 'Q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        pts.push({ x: nums[i], y: nums[i+1] });
        pts.push({ x: nums[i+2], y: nums[i+3] });
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        pts.push({ x: nums[i], y: nums[i+1] });
        pts.push({ x: nums[i+2], y: nums[i+3] });
        pts.push({ x: nums[i+4], y: nums[i+5] });
      }
    }
  }
  return pts;
}

globalThis.Path2D = class {
  constructor(d) {
    this.d = d || '';
    this.points = parseSvgPathPoints(this.d);
  }
};

function createSpyCtx() {
  const points = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  function transformPoint(x, y) {
    return {
      x: matrix[0] * x + matrix[2] * y + matrix[4],
      y: matrix[1] * x + matrix[3] * y + matrix[5]
    };
  }
  const ctx = {
    save() { stack.push([...matrix]); },
    restore() { if (stack.length) matrix = stack.pop(); },
    scale(sx, sy) {
      matrix[0] *= sx; matrix[1] *= sx;
      matrix[2] *= sy; matrix[3] *= sy;
    },
    translate(tx, ty) {
      matrix[4] += matrix[0] * tx + matrix[2] * ty;
      matrix[5] += matrix[1] * tx + matrix[3] * ty;
    },
    rotate(rad) {
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const a = matrix[0], b = matrix[1], c = matrix[2], d = matrix[3];
      matrix[0] = a * cos + c * sin;
      matrix[1] = b * cos + d * sin;
      matrix[2] = -a * sin + c * cos;
      matrix[3] = -b * sin + d * cos;
    },
    beginPath() {},
    closePath() {},
    moveTo(x, y) { points.push(transformPoint(x, y)); },
    lineTo(x, y) { points.push(transformPoint(x, y)); },
    quadraticCurveTo(cpx, cpy, x, y) {
      points.push(transformPoint(cpx, cpy));
      points.push(transformPoint(x, y));
    },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      points.push(transformPoint(cp1x, cp1y));
      points.push(transformPoint(cp2x, cp2y));
      points.push(transformPoint(x, y));
    },
    ellipse(x, y, rx, ry) {
      points.push(transformPoint(x, y - ry));
      points.push(transformPoint(x, y + ry));
      points.push(transformPoint(x - rx, y));
      points.push(transformPoint(x + rx, y));
    },
    arc(x, y, r) {
      points.push(transformPoint(x, y - r));
      points.push(transformPoint(x, y + r));
    },
    fill(p) {
      if (p && p.points) {
        for (const pt of p.points) points.push(transformPoint(pt.x, pt.y));
      }
    },
    stroke(p) {
      if (p && p.points) {
        for (const pt of p.points) points.push(transformPoint(pt.x, pt.y));
      }
    },
    clip() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    setLineDash() {},
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
  };
  return { ctx, points };
}

const results = {};
for (const pid of plants) {
  const s0 = { ...cat.pose_defaults, asset: pid, id: pid, growth: 1, roots: 0, cutaway: 0, lift: 0 };
  const spy0 = createSpyCtx();
  V.kit.RIG_DRAWERS[pid](spy0.ctx, s0, 0, cat);
  const deep0 = spy0.points.filter(p => p.y > 4).length;

  const s1 = { ...cat.pose_defaults, asset: pid, id: pid, growth: 1, roots: 1, cutaway: 0, lift: 0 };
  const spy1 = createSpyCtx();
  V.kit.RIG_DRAWERS[pid](spy1.ctx, s1, 0, cat);
  const deep1 = spy1.points.filter(p => p.y > 4).length;

  results[pid] = { deep0, deep1 };
}
console.log(JSON.stringify(results));
"""
        out = self._node(program, {"plants": soil_plants, "cat": catalog()})
        for pid in soil_plants:
            with self.subTest(plant=pid):
                self.assertEqual(out[pid]["deep0"], 0, f"{pid} ở roots=0 không được vẽ ở y > 4")
                self.assertGreater(out[pid]["deep1"], 0, f"{pid} ở roots=1 phải vẽ củ/rễ ở y > 4")

    def test_phase_e_uproot_maintains_constant_distance_between_fruit_and_stem(self):
        """Trong suốt động tác uproot, khoảng cách giữa anchor fruit và stem không đổi (củ đi theo cây)."""
        from bkt_web.remake_vector import catalog, validate_story
        story = {
            "id": "test_uproot_constant_distance",
            "renderer": "native-vector-v1",
            "duration": 3,
            "characters": [
                {"id": "hand", "asset": "hand"},
                {"id": "sp", "asset": "sweet_potato_plant"}
            ],
            "scenes": [{
                "renderer": "native-vector-v1",
                "start_time": 0,
                "end_time": 3,
                "characters_present": ["hand", "sp"],
                "background": {"preset": "soil_cutaway"},
                "poses": {
                    "hand": [{"time": 0, "x": 288, "y": 700, "height": 240}],
                    "sp": [{"time": 0, "x": 288, "y": 810, "height": 380, "growth": 1}]
                },
                "actions": [
                    {"type": "uproot", "actor": "hand", "target": "sp", "start": 0.5, "end": 2.5}
                ]
            }]
        }
        validate_story(story)
        program = r"""
const { story, cat } = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 2.5; t += 0.2) {
  const f = V.sample(story, cat, t);
  const fruit = V.worldAnchor(cat, f.states.sp, 'fruit');
  const stem = V.worldAnchor(cat, f.states.sp, 'stem');
  rows.push({ t, lift: f.states.sp.lift, y: f.states.sp.y, dist: Math.hypot(fruit.x - stem.x, fruit.y - stem.y) });
}
console.log(JSON.stringify(rows));
"""
        rows = self._node(program, {"story": story, "cat": catalog()})
        initial_dist = rows[0]["dist"]
        self.assertGreater(rows[-1]["lift"], 100, "Cây phải được nâng lên khi nhổ")
        for row in rows:
            self.assertAlmostEqual(row["dist"], initial_dist, delta=0.01,
                                   msg=f"Khoảng cách fruit-stem bị thay đổi lúc t={row['t']}")

    def test_phase_e_fruit_anchor_matches_drawn_bulb_center_within_6px(self):
        """Anchor fruit trùng tâm củ đang vẽ, sai lệch dưới 6 px ở growth 0.5 và 1."""
        from bkt_web.remake_vector import catalog
        cat = catalog()
        soil_plants = [
            "kohlrabi_plant", "potato_plant", "sweet_potato_plant", "cassava_plant", "taro_plant",
            "radish_plant", "beet_plant", "onion_plant", "garlic_plant", "ginger_plant",
            "cauliflower_plant", "broccoli_plant", "lettuce", "napa_cabbage", "water_spinach",
            "mustard_greens", "spring_onion", "giant_radish"
        ]
        program = r"""
const { plants, cat } = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = [];
for (const pid of plants) {
  const spec = cat.assets[pid].spec;
  for (const growth of [0.5, 1.0]) {
    const s = { ...cat.pose_defaults, asset: pid, id: pid, growth, bend: 0, roots: 1 };
    const anchor = V.localAnchor(cat, s, 'fruit');
    let drawnY;
    if (spec.underground) {
      drawnY = spec.tuberY;
    } else {
      drawnY = spec.tuberY * (0.7 + 0.3 * growth);
    }
    const dist = Math.hypot(anchor[0] - 0, anchor[1] - drawnY);
    results.push({ pid, growth, dist });
  }
}
console.log(JSON.stringify(results));
"""
        results = self._node(program, {"plants": soil_plants, "cat": cat})
        for r in results:
            with self.subTest(plant=r["pid"], growth=r["growth"]):
                self.assertLessEqual(r["dist"], 6.0, f"{r['pid']} sai lệch tâm củ {r['dist']}px > 6px ở growth {r['growth']}")

    def test_phase_e_vegetable_group_in_capability_registry_and_validator(self):
        """Nhóm vegetable được validator nhận và có trong capability_registry."""
        from bkt_web.capability_registry import inspect_registry, match_renderer, validate_registry
        from bkt_web.remake_vector import validate_story

        doc = inspect_registry()
        validate_registry(doc)
        self.assertIn("vegetable", doc["renderers"]["native-vector-v1"]["supports"]["entities"])

        potato_cap = doc["assets"]["potato"]
        self.assertEqual(potato_cap["entity_types"], ["vegetable"])
        self.assertTrue({"growth", "slice", "cut", "damage"}.issubset(set(potato_cap["states"])))

        match_res = match_renderer("native-vector-v1", {"required": [{"kind": "entity", "id": "vegetable"}]})
        self.assertTrue(match_res["eligible"])

        story = {
            "id": "test_veg_validation",
            "renderer": "native-vector-v1",
            "duration": 2,
            "characters": [{"id": "veg", "asset": "potato"}],
            "scenes": [{
                "renderer": "native-vector-v1",
                "start_time": 0,
                "end_time": 2,
                "characters_present": ["veg"],
                "background": {"preset": "vegetable_rows"},
                "poses": {"veg": [{"time": 0, "x": 288, "y": 810, "height": 200, "slice": 0.5}]},
                "actions": []
            }]
        }
        valid = validate_story(story)
        self.assertEqual(valid["id"], "test_veg_validation")

    def test_phase_e_vegetable_cutaway_examples_story_validates(self):
        """Story mẫu vegetable_cutaway_examples() hợp lệ với validator."""
        from bkt_web.remake_vector import vegetable_cutaway_examples, validate_story
        stories = vegetable_cutaway_examples()
        self.assertEqual(len(stories), 1)
        valid = validate_story(stories[0])
        self.assertEqual(valid["id"], "vegetable_cutaway")

    def test_phase_f_agrochem_catalog_assets_and_specs(self):
        """Mọi rig gói agrochem, 2 hình nền farm_warehouse/kitchen và 6 động tác mới có đầy đủ specs/anchors."""
        from bkt_web.remake_vector import catalog
        cat = catalog()
        self.assertIn("agrochem", cat.get("engine_packs", []))

        # 1. 15 rigs mới
        agro_rigs = {
            "fertilizer_sack": "prop",
            "compost_heap": "prop",
            "manure_pile": "prop",
            "compost_bin": "prop",
            "granules": "prop",
            "pesticide_bottle": "prop",
            "backpack_sprayer": "tool",
            "jerrycan": "prop",
            "chem_cabinet": "prop",
            "ppe_gloves": "prop",
            "ppe_mask": "prop",
            "ppe_goggles": "prop",
            "ppe_boots": "prop",
            "warning_sign": "prop",
            "rinse_basin": "prop",
        }
        for aid, group in agro_rigs.items():
            with self.subTest(rig=aid):
                self.assertIn(aid, cat["assets"])
                meta = cat["assets"][aid]
                self.assertEqual(meta["group"], group)
                self.assertEqual(meta.get("pack"), "agrochem")
                self.assertIn("root", meta["anchors"])

        # Specific anchors
        self.assertIn("tip", cat["assets"]["backpack_sprayer"]["anchors"])
        self.assertIn("nozzle", cat["assets"]["backpack_sprayer"]["anchors"])
        self.assertIn("spout", cat["assets"]["pesticide_bottle"]["anchors"])
        self.assertIn("spout", cat["assets"]["jerrycan"]["anchors"])

        # 2. 2 hình nền mới
        for bg, theme in (("farm_warehouse", "farm"), ("kitchen", "home")):
            with self.subTest(bg=bg):
                self.assertIn(bg, cat["backgrounds"])
                self.assertIn(bg, cat["background_specs"])
                self.assertEqual(cat["background_specs"][bg]["theme"], theme)
                self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        # 3. 6 động tác mới
        for act in ("pour", "scatter", "spray_drift", "wash_produce", "wilt", "perk_up"):
            with self.subTest(action=act):
                self.assertIn(act, cat["actions"])
                action_def = cat["actions"][act]
                actor_anchor = action_def.get("actor_anchor")
                if actor_anchor:
                    for a in action_def.get("actors", []):
                        self.assertIn(actor_anchor, cat["assets"][a]["anchors"], f"{a} lacks {actor_anchor}")
                target_anchor = action_def.get("target_anchor")
                if target_anchor:
                    for t in action_def.get("targets", []):
                        self.assertIn(target_anchor, cat["assets"][t]["anchors"], f"{t} lacks {target_anchor}")

        # 4. Pose defaults & ranges
        for p in ("open", "flies", "toxic"):
            self.assertIn(p, cat["pose_ranges"])
            self.assertEqual(cat["pose_ranges"][p], [0, 1])
            self.assertEqual(cat["pose_defaults"][p], 0)

    def test_phase_f_safe_spraying_examples_story_validates(self):
        """Story mẫu safe_spraying_examples() hợp lệ với validator và nằm trong sample_stories()."""
        from bkt_web.remake_vector import safe_spraying_examples, sample_stories, validate_story
        stories = safe_spraying_examples()
        self.assertEqual(len(stories), 1)
        valid = validate_story(stories[0])
        self.assertEqual(valid["id"], "safe_spraying")
        self.assertEqual(valid["duration"], 15.0)
        self.assertEqual(len(valid["scenes"]), 3)

        all_stories = sample_stories()
        self.assertTrue(any(s["id"] == "safe_spraying" for s in all_stories))

    def test_phase_f_chem_cabinet_open_state(self):
        """Tủ hoá chất chem_cabinet vẽ cửa đóng và ổ khoá ở open=0, mở hé lộ kệ bên trong ở open=1."""
        from bkt_web.remake_vector import catalog
        program = r"""
globalThis.Path2D = class { constructor() {} };
const { cat } = JSON.parse(fs.readFileSync(0, 'utf8'));
function createSpyCtx() {
  const calls = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const ctx = {
    save() { stack.push([...matrix]); },
    restore() { if (stack.length) matrix = stack.pop(); },
    scale(sx, sy) { matrix[0] *= sx; matrix[1] *= sx; matrix[2] *= sy; matrix[3] *= sy; },
    translate(tx, ty) { matrix[4] += matrix[0] * tx + matrix[2] * ty; matrix[5] += matrix[1] * tx + matrix[3] * ty; },
    rotate(rad) {},
    beginPath() {},
    closePath() {},
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    quadraticCurveTo(cx, cy, x, y) { calls.push(['quadraticCurveTo', x, y]); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { calls.push(['bezierCurveTo', x, y]); },
    arc(x, y, r) { calls.push(['arc', x, y, r]); },
    ellipse(x, y, rx, ry) { calls.push(['ellipse', x, y, rx, ry]); },
    fill(p) { calls.push(['fill']); },
    stroke(p) { calls.push(['stroke']); },
    clip() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    setLineDash() {},
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
  };
  return { ctx, calls };
}

const s0 = { ...cat.pose_defaults, asset: 'chem_cabinet', id: 'cab', open: 0 };
const spy0 = createSpyCtx();
V.kit.RIG_DRAWERS['chem_cabinet'](spy0.ctx, s0, 0, cat);

const s1 = { ...cat.pose_defaults, asset: 'chem_cabinet', id: 'cab', open: 1 };
const spy1 = createSpyCtx();
V.kit.RIG_DRAWERS['chem_cabinet'](spy1.ctx, s1, 0, cat);

console.log(JSON.stringify({ calls0: spy0.calls.length, calls1: spy1.calls.length }));
"""
        out = self._node(program, {"cat": catalog()})
        self.assertGreater(out["calls0"], 0)
        self.assertGreater(out["calls1"], 0)
        self.assertNotEqual(out["calls0"], out["calls1"], "Tủ mở thay đổi các đường vẽ cửa và kệ bên trong")

    def test_phase_g_farm_fun_catalog_and_specs(self):
        """Catalog khai báo gói farm_fun, 2 hình nền farmyard_barn/village_market, 4 biểu cảm và 9 động tác mới."""
        from bkt_web.remake_vector import catalog
        cat = catalog()
        self.assertIn("farm_fun", cat.get("engine_packs", []))

        # 1. 2 hình nền mới
        for bg, theme in (("farmyard_barn", "farm"), ("village_market", "market")):
            with self.subTest(bg=bg):
                self.assertIn(bg, cat["backgrounds"])
                self.assertIn(bg, cat["background_specs"])
                self.assertEqual(cat["background_specs"][bg]["theme"], theme)
                self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        # 2. 4 biểu cảm mới
        for expr in ("sick", "cold", "hot", "dizzy"):
            with self.subTest(expr=expr):
                self.assertIn(expr, cat["expressions"])

        # 3. 9 động tác mới
        for act in ("emote", "dizzy", "celebrate", "shiver", "sweat", "run_away", "bounce", "grow_fast", "tug"):
            with self.subTest(action=act):
                self.assertIn(act, cat["actions"])
                action_def = cat["actions"][act]
                actor_anchor = action_def.get("actor_anchor")
                if actor_anchor:
                    for a in action_def.get("actors", []):
                        self.assertIn(actor_anchor, cat["assets"][a]["anchors"], f"{a} lacks {actor_anchor}")
                target_anchor = action_def.get("target_anchor")
                if target_anchor:
                    for t in action_def.get("targets", []):
                        self.assertIn(target_anchor, cat["assets"][t]["anchors"], f"{t} lacks {target_anchor}")

        # 4. Pose defaults & ranges
        for p in ("shiver", "sweat", "bounce", "dizzy", "celebrate"):
            self.assertIn(p, cat["pose_ranges"])
            self.assertEqual(cat["pose_ranges"][p], [0, 1])
            self.assertEqual(cat["pose_defaults"][p], 0)

    def test_phase_g_giant_radish_examples_story_validates(self):
        """Story mẫu giant_radish_examples() hợp lệ với validator và nằm trong sample_stories()."""
        from bkt_web.remake_vector import giant_radish_examples, sample_stories, validate_story
        stories = giant_radish_examples()
        self.assertEqual(len(stories), 1)
        valid = validate_story(stories[0])
        self.assertEqual(valid["id"], "giant_radish")
        self.assertEqual(valid["duration"], 16.0)
        self.assertEqual(len(valid["scenes"]), 3)

        all_stories = sample_stories()
        self.assertTrue(any(s["id"] == "giant_radish" for s in all_stories))

    def test_phase_g_tug_hook_and_pop_at_lift(self):
        """Động tác kéo co tug: trước pop_at củ cải chưa bật (lift=0), sau pop_at củ cải bật lên cao (lift>50) và người kéo ngã."""
        from bkt_web.remake_vector import catalog, giant_radish_examples
        story = giant_radish_examples()[0]
        program = r"""
const { story, cat } = JSON.parse(fs.readFileSync(0, 'utf8'));
const fBefore = V.sample(story, cat, 7.0);
const fAfter = V.sample(story, cat, 10.0);
console.log(JSON.stringify({
  radishLiftBefore: fBefore.states.radish.lift || 0,
  radishLiftAfter: fAfter.states.radish.lift || 0,
  farmerRotAfter: fAfter.states.grandpa.rotation || 0,
}));
"""
        out = self._node(program, {"story": story, "cat": catalog()})
        self.assertLess(out["radishLiftBefore"], 15)   # trước pop_at củ chỉ rung, nhú vai
        self.assertGreater(out["radishLiftAfter"], 50)
        # Củ ở bên trái đoàn kéo: ngã ngửa = xoay theo chiều dương (đỉnh đầu ra xa củ)
        self.assertGreater(out["farmerRotAfter"], 15, "Người kéo phải ngã ngửa ra sau khi củ cải bật lên")

    def test_phase_g_new_expressions_rendering_spy(self):
        """Hàm face() vẽ thành công không lỗi với 4 biểu cảm mới sick, cold, hot, dizzy."""
        from bkt_web.remake_vector import catalog
        program = r"""
globalThis.Path2D = class { constructor() {} ellipse() {} rect() {} arc() {} };
const { cat } = JSON.parse(fs.readFileSync(0, 'utf8'));
function createDummyCtx() {
  return {
    reset() {}, clearRect() {}, fillRect() {},
    save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, ellipse() {},
    fill() {}, stroke() {}, clip() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    setLineDash() {},
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '',
  };
}
const ctx = createDummyCtx();
const canvas = { getContext() { return ctx; }, width: 576, height: 1024 };

const exprs = ['sick', 'cold', 'hot', 'dizzy'];
for (const e of exprs) {
  const story = {
    id: 'test-expr-' + e, renderer: 'native-vector-v1', duration: 2,
    characters: [{ id: 'f', asset: 'farmer' }],
    scenes: [{
      renderer: 'native-vector-v1', start_time: 0, end_time: 2,
      characters_present: ['f'],
      background: { preset: 'farmyard_barn' },
      poses: { f: [{ time: 0, x: 288, y: 810, height: 360, expression: e }] },
      actions: []
    }]
  };
  const r = new V.Renderer(canvas, cat, story);
  r.render(0.5);
}
console.log(JSON.stringify({ success: true, count: exprs.length }));
"""
        out = self._node(program, {"cat": catalog()})
        self.assertTrue(out["success"])
        self.assertEqual(out["count"], 4)



class VectorBrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def test_all_examples_render_offline_and_seek_back_to_identical_pixels(self):
        from bkt_web.remake_vector import examples
        from bkt_web import remake_composer as composer
        with tempfile.TemporaryDirectory() as tmp, patch.object(composer, "STATIC_DIR", Path(tmp)), patch.object(composer, "_record_with_playwright", return_value=None):
            page = self.browser.new_page(viewport={"width": 576, "height": 1024})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            for story in examples():
                with self.subTest(story=story["id"]):
                    slug = "test-" + story["id"]
                    composer.compose_animated_video(slug, story["characters"], story["scenes"], story["cues"], Path(tmp) / "missing.mp3", Path(tmp) / "out.mp4", story["duration"])
                    page.goto((Path(tmp) / f"remake_{slug}_animated.html").as_uri() + "?render=1")
                    page.evaluate("renderFrame(.5)")
                    first = page.locator("canvas").screenshot()
                    for scene in story["scenes"]:
                        page.evaluate("t=>renderFrame(t)", (scene["start_time"] + scene["end_time"]) / 2)
                    page.evaluate("renderFrame(.5)")
                    self.assertEqual(first, page.locator("canvas").screenshot())
                    self.assertEqual(page.locator("img,video").count(), 0)
            self.assertEqual(errors, [])
            page.close()

    def test_growth_visually_changes_every_supported_target(self):
        from bkt_web.remake_vector import catalog
        from bkt_web import remake_composer as composer
        with tempfile.TemporaryDirectory() as tmp, patch.object(composer, "STATIC_DIR", Path(tmp)), patch.object(composer, "_record_with_playwright", return_value=None):
            page = self.browser.new_page()
            for asset in catalog()["actions"]["grow"]["targets"]:
                with self.subTest(asset=asset):
                    characters = [{"id": "plant", "asset": asset, "face": False}]
                    scenes = [{"renderer": "native-vector-v1", "start_time": 0, "end_time": 6, "characters_present": ["plant"], "poses": {"plant": [{"time": 0, "x": 288, "y": 800, "height": 440, "growth": .1}]}, "actions": [{"type": "grow", "target": "plant", "start": 1, "end": 4}]}]
                    composer.compose_animated_video("grow-test", characters, scenes, [], Path(tmp) / "missing.mp3", Path(tmp) / "out.mp4", 6)
                    page.goto((Path(tmp) / "remake_grow-test_animated.html").as_uri() + "?render=1")
                    page.evaluate("renderFrame(0)")
                    before = page.locator("canvas").screenshot()
                    page.evaluate("renderFrame(5)")
                    self.assertNotEqual(before, page.locator("canvas").screenshot())
            page.close()

    def test_showcase_assets_actions_and_mobile_layout(self):
        import functools
        import http.server
        import threading
        from bkt_web.remake_vector import STATIC_DIR, validate_story
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(STATIC_DIR.parent))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        page = self.browser.new_page(viewport={"width": 375, "height": 812})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(f"http://127.0.0.1:{server.server_port}/static/remake_vector_library.html")
            page.wait_for_function("window.vectorShowcase")
            self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            for action in page.evaluate("Object.keys(vectorShowcase.catalog.actions)"):
                page.evaluate("id=>vectorShowcase.selectAction(id)", action)
                validate_story(page.evaluate("vectorShowcase.story"))
                page.evaluate("vectorShowcase.seek(2.5)")
            page.locator('[data-tab="assets"]').click()
            for button in page.locator('#items button').all():
                button.click()
                page.evaluate("vectorShowcase.seek(2.5)")
                validate_story(page.evaluate("vectorShowcase.story"))
            self.assertEqual(errors, [])
        finally:
            page.close()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_library_cels_are_loaded_first_deterministic_and_cached(self):
        import functools
        import http.server
        import threading
        from bkt_web.remake_vector import STATIC_DIR
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(STATIC_DIR.parent))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        page = self.browser.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            page.goto(f"http://127.0.0.1:{server.server_port}/static/remake_vector_library.html")
            page.wait_for_function("window.vectorShowcase")
            # Cel được nạp xong TRƯỚC khi renderer đầu tiên được dựng; mặc định xem
            # bản vector (đúng hình video xuất ra), bật ô cel mới vẽ bằng cel.
            self.assertTrue(page.evaluate("RemakeVector.celsReady() && !vectorShowcase.renderer.cels"))
            page.evaluate("document.getElementById('cels').click()")
            self.assertTrue(page.evaluate("vectorShowcase.renderer.cels"))
            result = page.evaluate("""() => {
                const cat = vectorShowcase.catalog, asset = Object.keys(RemakeVector.CEL_CELLS)[0];
                const story = { id: 'cel-test', renderer: cat.renderer, fidelity: 'technical-demo', duration: 4,
                  characters: [{ id: 'a', asset }], cues: [],
                  scenes: [{ renderer: cat.renderer, kind: 'scene', start_time: 0, end_time: 4, characters_present: ['a'],
                             poses: { a: [{ time: 0, x: 288, y: 780, height: 460 }, { time: 4, x: 320, y: 760, height: 480 }] }, actions: [] }] };
                const shot = (cels, t) => { const c = document.createElement('canvas'); new RemakeVector.Renderer(c, cat, story, { cels }).render(t); return c.toDataURL(); };
                const renderer = new RemakeVector.Renderer(document.createElement('canvas'), cat, story, { cels: true });
                const created = [], original = document.createElement.bind(document);
                document.createElement = (tag, ...rest) => { created.push(tag); return original(tag, ...rest); };
                const a = (renderer.render(1), renderer.canvas.toDataURL());
                renderer.render(3);
                const b = (renderer.render(1), renderer.canvas.toDataURL());
                document.createElement = original;
                return { same: a === b, canvases: created.filter(t => t === 'canvas').length, differsFromVector: shot(true, 1) !== shot(false, 1) };
            }""")
            self.assertEqual(result, {"same": True, "canvases": 0, "differsFromVector": True})
            self.assertEqual(errors, [])
        finally:
            page.close()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_exported_remake_never_uses_cels(self):
        from bkt_web.remake_vector import examples
        from bkt_web import remake_composer as composer
        story = examples()[0]
        with tempfile.TemporaryDirectory() as tmp, patch.object(composer, "STATIC_DIR", Path(tmp)), patch.object(composer, "_record_with_playwright", return_value=None):
            composer.compose_animated_video("cel-off", story["characters"], story["scenes"], story["cues"], Path(tmp) / "missing.mp3", Path(tmp) / "out.mp4", story["duration"])
            page = self.browser.new_page()
            requests = []
            page.on("request", lambda req: requests.append(req.url))
            page.goto((Path(tmp) / "remake_cel-off_animated.html").as_uri() + "?render=1")
            page.evaluate("renderFrame(1)")
            self.assertFalse(page.evaluate("RemakeVector.celsReady() || renderer.cels"))
            self.assertFalse([u for u in requests if "handdrawn_" in u])
            # Bật cels khi chưa nạp phải báo lỗi rõ, không lặng lẽ vẽ vector.
            self.assertTrue(page.evaluate("""() => { try { new RemakeVector.Renderer(document.createElement('canvas'), renderer.catalog, renderer.story, { cels: true }); return false; } catch (e) { return /loadCelSheets/.test(e.message); } }"""))
            page.close()


class MonsterTierTest(unittest.TestCase):
    def test_fishing_and_monster_are_first_class_themes(self):
        from bkt_web.remake_vector import fishing_examples, monster_examples, validate_story
        fishing, monster = fishing_examples()[0], monster_examples()[0]
        self.assertEqual(fishing["theme"], "fishing")
        self.assertEqual(monster["theme"], "sea-monster")
        self.assertGreaterEqual(len(fishing["story_beats"]), 4)
        self.assertGreaterEqual(len(monster["story_beats"]), 4)
        self.assertTrue(all(character.get("material") in {"ink", "pencil"} for character in fishing["characters"]))
        validate_story(fishing); validate_story(monster)
    def test_monster_examples_validate_with_tiers(self):
        from bkt_web.remake_vector import catalog, monster_examples, validate_story
        cat = catalog()
        self.assertEqual(cat["assets"]["sea_monster_s"]["tier"], "S")
        self.assertEqual(cat["assets"]["sea_monster_ss"]["tier"], "SS")
        for story in monster_examples():
            validate_story(story)
            self.assertEqual(story["id"], "sea-monsters")
            assets = {c["asset"] for c in story["characters"]}
            self.assertIn("sea_monster_s", assets)
            self.assertIn("sea_monster_ss", assets)

    def test_monster_actions_deterministic_and_contact(self):
        import subprocess
        from bkt_web.remake_vector import STATIC_DIR, catalog, monster_examples
        program = r'''
const fs=require('fs');require(process.argv[1]);const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8')),V=RemakeVector;
const before=JSON.stringify(story);
const risen=V.sample(story,cat,5);
if(Math.abs(risen.states.s_monster.rise-.8)>1e-9)throw Error('emerge did not raise');
const half=V.sample(story,cat,10);
if(Math.abs(half.states.ss_monster.rise-.5)>1e-6)throw Error('ss emerge wrong');
const whipped=V.sample(story,cat,6.2);
if(Math.abs(whipped.states.s_monster.tentacle)<=1)throw Error('whip tentacle too small');
const strike=V.sample(story,cat,18.4);
const mouth=V.worldAnchor(cat,strike.states.s_monster,'mouth'),root=V.worldAnchor(cat,strike.states.boat,'root');
if(Math.hypot(mouth.x-root.x,mouth.y-root.y)>3)throw Error('strike missed boat');
if(JSON.stringify(V.sample(story,cat,18.4))!==JSON.stringify(strike))throw Error('seek not stable');
if(before!==JSON.stringify(story))throw Error('input mutated');
console.log('monster tier checks passed');
'''
        result = subprocess.run(["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")], input=json.dumps({"story": monster_examples()[0], "cat": catalog()}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class VectorApiTest(unittest.IsolatedAsyncioTestCase):
    async def test_catalog_validation_and_rejection(self):
        import httpx
        from fastapi import FastAPI
        from bkt_web.remake_routes import remake_router
        from bkt_web.remake_vector import examples
        app = FastAPI()
        app.include_router(remake_router)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/remake/library")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["catalog"]["renderer"], "native-vector-v1")
            data = examples()[0]
            result = await client.post("/api/remake/library/validate", json=data)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()["fidelity"], "not-reviewed")
            data["scenes"][0]["actions"][0]["actor"] = "missing"
            self.assertEqual((await client.post("/api/remake/library/validate", json=data)).status_code, 422)

    def test_sea_monsters_catalog_and_rigs(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        all_monsters = [
            "sea_monster_leviathan",
            "sea_monster_drake",
            "sea_monster_behemoth",
            "sea_monster_crystal_whale",
            "sea_monster_magma",
            "sea_monster_megalodon"
        ]
        required_anchors = {"root", "face", "mouth", "jaw", "eye", "surface", "top", "grip", "tail", "tail_tip", "dorsal", "chest", "flipper_l", "flipper_r"}
        for monster_id in all_monsters:
            self.assertIn(monster_id, cat["assets"])
            entry = cat["assets"][monster_id]
            self.assertEqual(entry["group"], "monster")
            self.assertEqual(entry["tier"], "SS")
            self.assertTrue(required_anchors.issubset(set(entry["anchors"].keys())))
            for action_name in ("emerge", "whip", "roar"):
                self.assertIn(monster_id, cat["actions"][action_name]["targets"])
            self.assertIn(monster_id, cat["actions"]["strike"]["actors"])

    def test_phase_b_fruit_trees_catalog_and_anchors(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        trees = [
            "mango_tree", "orange_tree", "lime_tree", "apple_tree",
            "coconut_palm", "durian_tree", "jackfruit_tree", "lychee_tree",
            "rambutan_tree", "guava_tree", "avocado_tree", "dragon_fruit_cactus",
            "pineapple_plant", "strawberry_plant", "mangosteen_tree", "starfruit_tree"
        ]
        required_anchors = {"root", "soil", "face", "top", "grip", "trunk", "canopy", "fruit"}
        for i in range(1, 9):
            required_anchors.add(f"fruit_{i}")

        for tree_id in trees:
            self.assertIn(tree_id, cat["assets"])
            entry = cat["assets"][tree_id]
            self.assertEqual(entry["group"], "plant")
            self.assertTrue(entry.get("face"))
            self.assertEqual(entry.get("pack"), "farm_trees")
            self.assertTrue(required_anchors.issubset(set(entry["anchors"].keys())), f"{tree_id} thiếu anchor")
            self.assertEqual(entry["anchors"]["fruit"], entry["anchors"]["fruit_1"])
            tree_x, tree_y, tree_h = 288, 760, 400
            scale = tree_h / 100.0
            for i in range(1, 9):
                fx, fy = entry["anchors"][f"fruit_{i}"]
                wx = tree_x + fx * scale
                wy = tree_y + fy * scale
                self.assertTrue(0 <= wx <= 576, f"{tree_id} fruit_{i} out of x bounds: {wx}")
                self.assertTrue(0 <= wy <= 1024, f"{tree_id} fruit_{i} out of y bounds: {wy}")

    def test_phase_b_backgrounds_catalog_and_specs(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        new_bgs = ["rice_paddy", "terraced_field", "fruit_orchard"]
        for bg in new_bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            spec = cat["background_specs"][bg]
            self.assertIn("label", spec)
            self.assertIn("theme", spec)
            self.assertIn("ground_y", spec)
            self.assertTrue(isinstance(spec["ground_y"], (int, float)))

    def test_phase_b_fruit_rendered_at_growth_1_matches_anchor_within_6px(self):
        from bkt_web.remake_vector import catalog, engine_sources
        cat = catalog()
        sources = [str(s) for s in engine_sources()]
        program = '''
const fs = require('fs');
for (const s of process.argv.slice(1)) eval(fs.readFileSync(s, 'utf8'));
const cat = JSON.parse(fs.readFileSync('bkt_web/static/remake_vector_catalog.json', 'utf8'));
const trees = [
  'mango_tree', 'orange_tree', 'lime_tree', 'apple_tree',
  'coconut_palm', 'durian_tree', 'jackfruit_tree', 'lychee_tree',
  'rambutan_tree', 'guava_tree', 'avocado_tree', 'dragon_fruit_cactus',
  'pineapple_plant', 'strawberry_plant', 'mangosteen_tree', 'starfruit_tree'
];
for (const tid of trees) {
  const spec = cat.assets[tid].spec;
  const anchors = cat.assets[tid].anchors;
  for (let i = 0; i < spec.slots.length; i++) {
    const slot = spec.slots[i];
    const anchor = anchors[`fruit_${i + 1}`];
    const dist = Math.hypot(slot[0] - anchor[0], slot[1] - anchor[1]);
    if (dist > 6) throw new Error(`${tid} slot ${i + 1} deviates by ${dist}px from anchor`);
  }
}
console.log('ALL_SLOTS_MATCH_ANCHORS');
'''
        result = subprocess.run(["node", "-e", program] + sources, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ALL_SLOTS_MATCH_ANCHORS", result.stdout)

    def test_phase_b_pick_action_workflow_and_fruit_conservation(self):
        from bkt_web.remake_vector import catalog, engine_sources, tree_pick_events
        cat = catalog()
        sources = [str(s) for s in engine_sources()]
        p = tree_pick_events("tree", "mango_tree", fruits_before=6, t=1.0, hand_char_id="hand", fruit_char_id="mango_picked", tree_pos={"x": 288, "y": 760, "height": 400})
        m_pos = p["fruit_pos"]
        story = {
            "id": "test-pick-flow",
            "renderer": "native-vector-v1",
            "duration": 3.0,
            "characters": [
                {"id": "tree", "asset": "mango_tree"},
                {"id": "hand", "asset": "hand"},
                p["fruit_character"]
            ],
            "scenes": [{
                "renderer": "native-vector-v1",
                "start_time": 0,
                "end_time": 3.0,
                "characters_present": ["tree", "hand", "mango_picked"],
                "poses": {
                    "tree": [
                        {"time": 0, "x": 288, "y": 760, "height": 400, "fruits": 6},
                        {"time": 1.6, "x": 288, "y": 760, "height": 400, "fruits": 5},
                        {"time": 3.0, "x": 288, "y": 760, "height": 400, "fruits": 5}
                    ],
                    "hand": [
                        {"time": 0, "x": 420, "y": 600, "height": 160},
                        {"time": 1.6, "x": m_pos["x"], "y": m_pos["y"], "height": 160},
                        {"time": 3.0, "x": m_pos["x"], "y": m_pos["y"], "height": 160}
                    ],
                    "mango_picked": [
                        {"time": 1.6, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]},
                        {"time": 3.0, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]}
                    ]
                },
                "actions": [
                    p["pick_action"],
                    {"type": "grip", "actor": "hand", "target": "mango_picked", "start": 1.6, "end": 3.0}
                ]
            }]
        }
        program = '''
const fs = require('fs');
for (const s of process.argv.slice(1)) eval(fs.readFileSync(s, 'utf8'));
const cat = JSON.parse(fs.readFileSync('bkt_web/static/remake_vector_catalog.json', 'utf8'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const canvas = { getContext: () => ({ save(){}, restore(){}, beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, stroke(){}, fill(){}, arc(){}, ellipse(){}, fillRect(){}, strokeRect(){}, clearRect(){}, getImageData: () => ({ data: new Uint8Array(4) }) }) };
const renderer = new RemakeVector.Renderer(canvas, cat, input.story);

const frameContact = renderer.sample(1.7);
const handState = frameContact.states.hand;
const fruitState = frameContact.states.mango_picked;
const handGrip = RemakeVector.worldAnchor(cat, handState, 'grip');
const fruitGrip = RemakeVector.worldAnchor(cat, fruitState, 'grip');
const gripDist = Math.hypot(handGrip.x - fruitGrip.x, handGrip.y - fruitGrip.y);
if (gripDist >= 10) throw new Error(`Quả cách tay ${gripDist.toFixed(2)}px (vượt quá 10px)`);

const frameBefore = renderer.sample(1.5);
const frameAfter = renderer.sample(1.7);
if (frameBefore.states.tree.fruits !== 6 || frameAfter.states.tree.fruits !== 5) {
  throw new Error(`fruits không giảm đúng 1: trước=${frameBefore.states.tree.fruits}, sau=${frameAfter.states.tree.fruits}`);
}

for (let t = 0.5; t <= 2.5; t = Math.round((t + 0.05) * 100) / 100) {
  const f = renderer.sample(t);
  const treeFruits = f.states.tree.fruits;
  const fruitActorVisible = (f.states.mango_picked.opacity > 0 && t >= 1.6) ? 1 : 0;
  const total = treeFruits + fruitActorVisible;
  if (total !== 6) throw new Error(`Tại t=${t}, tổng số quả là ${total} (mong đợi 6)`);
}

console.log('PICK_CONSERVATION_PASSED');
'''
        result = subprocess.run(["node", "-e", program] + sources, input=json.dumps({"story": story}), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PICK_CONSERVATION_PASSED", result.stdout)

    def test_phase_b_shake_action_drops_fruit_deterministically(self):
        from bkt_web.remake_vector import catalog, engine_sources, tree_shake_events
        cat = catalog()
        sources = [str(s) for s in engine_sources()]
        ground_y = 810.0
        s = tree_shake_events("tree", "durian_tree", fruits_before=5, t=1.0, shaker_char_id="hand", fruit_char_id="durian_dropped", tree_pos={"x": 288, "y": 760, "height": 400}, ground_y=ground_y)
        story = {
            "id": "test-shake-flow",
            "renderer": "native-vector-v1",
            "duration": 3.0,
            "characters": [
                {"id": "tree", "asset": "durian_tree"},
                {"id": "hand", "asset": "hand"},
                s["fruit_character"]
            ],
            "scenes": [{
                "renderer": "native-vector-v1",
                "start_time": 0,
                "end_time": 3.0,
                "characters_present": ["tree", "hand", "durian_dropped"],
                "poses": {
                    "tree": [
                        {"time": 0, "x": 288, "y": 760, "height": 400, "fruits": 5},
                        {"time": s["t_drop"], "x": 288, "y": 760, "height": 400, "fruits": 4},
                        {"time": 3.0, "x": 288, "y": 760, "height": 400, "fruits": 4}
                    ],
                    "hand": [
                        {"time": 0, "x": 350, "y": 700, "height": 160},
                        {"time": 3.0, "x": 350, "y": 700, "height": 160}
                    ],
                    "durian_dropped": s["fruit_keyframes"]
                },
                "actions": s["actions"]
            }]
        }
        program = '''
const fs = require('fs');
for (const s of process.argv.slice(1)) eval(fs.readFileSync(s, 'utf8'));
const cat = JSON.parse(fs.readFileSync('bkt_web/static/remake_vector_catalog.json', 'utf8'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

const mockCanvas = { getContext: () => ({ save(){}, restore(){}, beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, stroke(){}, fill(){}, arc(){}, ellipse(){}, fillRect(){}, strokeRect(){}, clearRect(){}, getImageData: () => ({ data: new Uint8Array(4) }) }) };
const renderer = new RemakeVector.Renderer(mockCanvas, cat, input.story);

const frameEnd = renderer.sample(2.8);
const fruitY = frameEnd.states.durian_dropped.y;
if (Math.abs(fruitY - input.ground_y) > 2.0) {
  throw new Error(`Quả dừng ở y=${fruitY}, lệch ground_y=${input.ground_y} > 2px`);
}

const s1 = renderer.sample(1.8).states.durian_dropped;
renderer.sample(2.8);
const s2 = renderer.sample(1.8).states.durian_dropped;
if (Math.abs(s1.x - s2.x) > 0.0001 || Math.abs(s1.y - s2.y) > 0.0001) {
  throw new Error(`Tua lại không tất định: y trước=${s1.y}, y sau=${s2.y}`);
}

console.log('SHAKE_DETERMINISTIC_PASSED');
'''
        result = subprocess.run(["node", "-e", program] + sources, input=json.dumps({"story": story, "ground_y": ground_y}), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SHAKE_DETERMINISTIC_PASSED", result.stdout)

    def test_phase_b_validator_rejects_invalid_pick_cases(self):
        from bkt_web.remake_vector import validate_vector_scenes, tree_pick_events
        base_pick = tree_pick_events("mango_tree", "mango_tree", fruits_before=6, t=1.0, hand_char_id="farmer", fruit_char_id="mango_picked")
        m_pos = base_pick["fruit_pos"]
        characters = [
            {"id": "farmer", "name": "Nông dân", "asset": "farmer"},
            {"id": "tree", "name": "Cây xoài", "asset": "mango_tree"},
            {"id": "fruit", "name": "Quả xoài", "asset": "mango"},
            {"id": "apple_wrong", "name": "Quả táo", "asset": "apple"},
        ]

        scenes_bad_slot = [{
            "renderer": "native-vector-v1",
            "start_time": 0, "end_time": 3.0,
            "characters_present": ["farmer", "tree", "fruit"],
            "poses": {
                "farmer": [{"time": 0, "x": 300, "y": 800, "height": 450}, {"time": 3.0, "x": 300, "y": 800, "height": 450}],
                "tree": [{"time": 0, "x": 200, "y": 800, "height": 450, "fruits": 6}, {"time": 1.6, "x": 200, "y": 800, "height": 450, "fruits": 5}, {"time": 3.0, "x": 200, "y": 800, "height": 450, "fruits": 5}],
                "fruit": [{"time": 1.6, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]}, {"time": 3.0, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]}]
            },
            "actions": [
                {"type": "pick", "actor": "farmer", "target": "tree", "target_anchor": "fruit_4", "start": 1.0, "end": 2.2},
                {"type": "grip", "actor": "farmer", "target": "fruit", "start": 1.6, "end": 3.0}
            ]
        }]
        with self.assertRaisesRegex(ValueError, "hái sai slot"):
            validate_vector_scenes(characters, scenes_bad_slot)

        scenes_bad_fruit = [{
            "renderer": "native-vector-v1",
            "start_time": 0, "end_time": 3.0,
            "characters_present": ["farmer", "tree", "apple_wrong"],
            "poses": {
                "farmer": [{"time": 0, "x": 300, "y": 800, "height": 450}, {"time": 3.0, "x": 300, "y": 800, "height": 450}],
                "tree": [{"time": 0, "x": 200, "y": 800, "height": 450, "fruits": 6}, {"time": 1.6, "x": 200, "y": 800, "height": 450, "fruits": 5}, {"time": 3.0, "x": 200, "y": 800, "height": 450, "fruits": 5}],
                "apple_wrong": [{"time": 1.6, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]}, {"time": 3.0, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]}]
            },
            "actions": [
                {"type": "pick", "actor": "farmer", "target": "tree", "target_anchor": "fruit_6", "start": 1.0, "end": 2.2},
                {"type": "grip", "actor": "farmer", "target": "apple_wrong", "start": 1.6, "end": 3.0}
            ]
        }]
        with self.assertRaisesRegex(ValueError, "quả sai loại"):
            validate_vector_scenes(characters, scenes_bad_fruit)

        scenes_early_fruit = [{
            "renderer": "native-vector-v1",
            "start_time": 0, "end_time": 3.0,
            "characters_present": ["farmer", "tree", "fruit"],
            "poses": {
                "farmer": [{"time": 0, "x": 300, "y": 800, "height": 450}, {"time": 3.0, "x": 300, "y": 800, "height": 450}],
                "tree": [{"time": 0, "x": 200, "y": 800, "height": 450, "fruits": 6}, {"time": 1.6, "x": 200, "y": 800, "height": 450, "fruits": 5}, {"time": 3.0, "x": 200, "y": 800, "height": 450, "fruits": 5}],
                "fruit": [{"time": 1.0, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]}, {"time": 3.0, "x": m_pos["x"], "y": m_pos["y"], "height": m_pos["height"]}]
            },
            "actions": [
                {"type": "pick", "actor": "farmer", "target": "tree", "target_anchor": "fruit_6", "start": 1.0, "end": 2.2},
                {"type": "grip", "actor": "farmer", "target": "fruit", "start": 1.6, "end": 3.0}
            ]
        }]
        with self.assertRaisesRegex(ValueError, "actor quả xuất hiện trước lúc fruits giảm"):
            validate_vector_scenes(characters, scenes_early_fruit)

    def test_phase_c_trellis_catalog_assets_and_specs(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        self.assertIn("trellis", cat.get("engine_packs", []))

        props = ["trellis_a", "trellis_net", "pergola"]
        for pid in props:
            self.assertIn(pid, cat["assets"])
            self.assertEqual(cat["assets"][pid]["group"], "prop")
            self.assertEqual(cat["assets"][pid].get("pack"), "trellis")
            anchors = cat["assets"][pid]["anchors"]
            for c in range(1, 7):
                self.assertIn(f"climb_{c}", anchors)
            for req in ["root", "soil", "top", "grip", "surface"]:
                self.assertIn(req, anchors)

        fruits = ["cucumber", "bitter_melon", "luffa", "bottle_gourd", "winter_melon", "passion_fruit", "chayote", "long_bean", "kiwi"]
        for fid in fruits:
            self.assertIn(fid, cat["assets"])
            self.assertEqual(cat["assets"][fid]["group"], "fruit")
            self.assertEqual(cat["assets"][fid].get("pack"), "trellis")
            anchors = cat["assets"][fid]["anchors"]
            for req in ["root", "face", "top", "grip", "surface", "mouth", "hand_l", "hand_r", "foot_l", "foot_r"]:
                self.assertIn(req, anchors)

        vines = [
            "cucumber_vine", "bitter_melon_vine", "luffa_vine", "bottle_gourd_vine",
            "winter_melon_vine", "passion_fruit_vine", "chayote_vine", "long_bean_vine",
            "grape_vine", "kiwi_vine"
        ]
        for vid in vines:
            self.assertIn(vid, cat["assets"])
            self.assertEqual(cat["assets"][vid]["group"], "plant")
            self.assertEqual(cat["assets"][vid].get("pack"), "trellis")
            spec = cat["assets"][vid]["spec"]
            self.assertIn(spec["fruit"], cat["assets"])
            self.assertIn(spec["support"], props)
            anchors = cat["assets"][vid]["anchors"]
            for i in range(1, len(spec["slots"]) + 1):
                self.assertIn(f"fruit_{i}", anchors)
            self.assertIn("fruit", anchors)

        bgs = ["trellis_garden", "greenhouse"]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            spec = cat["background_specs"][bg]
            self.assertIn("label", spec)
            self.assertIn("theme", spec)
            self.assertIn("ground_y", spec)

    def test_phase_c_vine_slots_match_anchors_within_6px(self):
        import math
        from bkt_web.remake_vector import catalog
        cat = catalog()
        vines = [
            "cucumber_vine", "bitter_melon_vine", "luffa_vine", "bottle_gourd_vine",
            "winter_melon_vine", "passion_fruit_vine", "chayote_vine", "long_bean_vine",
            "grape_vine", "kiwi_vine"
        ]
        for vid in vines:
            spec = cat["assets"][vid]["spec"]
            anchors = cat["assets"][vid]["anchors"]
            for i, slot in enumerate(spec["slots"], 1):
                anchor = anchors[f"fruit_{i}"]
                dist = math.hypot(slot[0] - anchor[0], slot[1] - anchor[1])
                self.assertLessEqual(dist, 6.0, f"{vid} slot {i} deviates by {dist}px from anchor")

    def test_phase_c_trellis_examples_story_validates(self):
        from bkt_web.remake_vector import trellis_examples, validate_story
        stories = trellis_examples()
        self.assertEqual(len(stories), 1)
        valid = validate_story(stories[0])
        self.assertEqual(valid["id"], "trellis_cucumber")

    def test_phase_d_temperate_catalog_assets_and_specs(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        self.assertIn("temperate_fruits", cat.get("engine_packs", []))

        fruits = ["pear", "peach", "plum", "cherry", "persimmon", "blueberry", "raspberry", "apricot", "pomegranate"]
        for fid in fruits:
            self.assertIn(fid, cat["assets"])
            self.assertEqual(cat["assets"][fid]["group"], "fruit")
            self.assertEqual(cat["assets"][fid].get("pack"), "temperate_fruits")
            anchors = cat["assets"][fid]["anchors"]
            for req in ["root", "face", "top", "grip", "surface", "mouth", "hand_l", "hand_r", "foot_l", "foot_r"]:
                self.assertIn(req, anchors)

        trees = ["persimmon_tree", "peach_tree", "pear_tree", "cherry_tree"]
        for tid in trees:
            self.assertIn(tid, cat["assets"])
            self.assertEqual(cat["assets"][tid]["group"], "plant")
            self.assertEqual(cat["assets"][tid].get("pack"), "farm_trees")  # dùng chung template drawFruitTree
            spec = cat["assets"][tid]["spec"]
            self.assertIn(spec["fruit"], cat["assets"])
            anchors = cat["assets"][tid]["anchors"]
            for i in range(1, 9):
                self.assertIn(f"fruit_{i}", anchors)
            self.assertIn("fruit", anchors)
            for req in ["root", "soil", "trunk", "face", "canopy", "top", "grip"]:
                self.assertIn(req, anchors)

        bgs = ["highland_farm", "snowy_orchard"]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            spec = cat["background_specs"][bg]
            self.assertIn("label", spec)
            self.assertEqual(spec["theme"], "highland")
            self.assertEqual(spec["ground_y"], 810)

    def test_phase_d_tree_slots_match_anchors(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        trees = ["persimmon_tree", "peach_tree", "pear_tree", "cherry_tree"]
        for tid in trees:
            spec = cat["assets"][tid]["spec"]
            anchors = cat["assets"][tid]["anchors"]
            for n in range(1, 9):
                expected = spec["slots"][min(n, len(spec["slots"])) - 1]
                self.assertEqual(anchors[f"fruit_{n}"], expected, f"{tid} fruit_{n} does not match expected slot")

    def test_phase_d_highland_examples_story_validates(self):
        from bkt_web.remake_vector import highland_examples, validate_story
        stories = highland_examples()
        self.assertEqual(len(stories), 1)
        valid = validate_story(stories[0])
        self.assertEqual(valid["id"], "highland_temperate")

    def test_phase_h_chibi_anchors_and_specs(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        chibi_ids = [
            "chibi_boy", "chibi_girl", "chibi_kid", "chibi_teacher",
            "chibi_doctor", "chibi_nurse", "chibi_dentist", "chibi_pharmacist",
            "chibi_patient", "chibi_grandma", "chibi_grandpa", "chibi_farmer", "chibi_chef"
        ]
        self.assertEqual(len(chibi_ids), 13)
        required_anchors = {
            "root", "face", "mouth", "forehead", "ear_l", "ear_r", "teeth", "head_top", "top",
            "neck", "chest", "belly", "back", "waist", "hip", "shoulder_l", "shoulder_r",
            "elbow_l", "elbow_r", "wrist_l", "wrist_r", "hand_l", "hand_r",
            "knee_l", "knee_r", "foot_l", "foot_r"
        }
        for cid in chibi_ids:
            self.assertIn(cid, cat["assets"])
            asset = cat["assets"][cid]
            self.assertEqual(asset["group"], "chibi")
            self.assertEqual(asset["pack"], "chibi")
            self.assertTrue(asset["face"])
            for anchor in required_anchors:
                self.assertIn(anchor, asset["anchors"], f"{cid} thiếu anchor {anchor}")

    def test_phase_h_medical_assets_and_backgrounds(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        medical_props = [
            "stethoscope", "thermometer", "syringe", "pill", "pill_bottle",
            "syrup_bottle", "spoon", "band_aid", "bandage_roll", "face_mask",
            "soap", "sanitizer", "towel", "toothbrush", "toothpaste",
            "water_glass", "first_aid_kit", "ice_pack", "hospital_bed", "wheelchair",
            "crutches", "scale", "height_chart", "lunch_tray"
        ]
        microbes_organs = ["good_bacteria", "bacteria_rod", "virus_spike", "tooth_chibi"]
        for aid in medical_props + microbes_organs:
            self.assertIn(aid, cat["assets"])
            self.assertEqual(cat["assets"][aid]["pack"], "medical")

        bgs = [
            "living_room", "bathroom_sink", "classroom", "school_yard", "playground",
            "clinic_room", "hospital_ward", "pharmacy", "dentist_room", "science_lab", "body_inside"
        ]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            spec = cat["background_specs"][bg]
            self.assertIn("label", spec)
            self.assertIn("theme", spec)
            self.assertEqual(spec["ground_y"], 810)

    def test_phase_h_layer_over_face_ordering(self):
        from bkt_web.remake_vector import STATIC_DIR
        program = r'''
require(process.argv[1]);
const R = RemakeVector;
const cat = require(process.argv[2]);
const story = {
  id: "test-layer",
  renderer: "native-vector-v1",
  duration: 2.0,
  characters: [
    { id: "kid", asset: "chibi_kid" },
    { id: "mask", asset: "face_mask", layer: "over_face", attach_to: { id: "kid", anchor: "face" } }
  ],
  scenes: [{
    renderer: "native-vector-v1",
    kind: "scene",
    start_time: 0,
    end_time: 2.0,
    characters_present: ["kid", "mask"],
    background: { preset: "clinic_room" },
    poses: {
      kid: [{ time: 0, x: 200, y: 810, height: 320 }],
      mask: [{ time: 0, x: 200, y: 730, height: 40 }]
    }
  }]
};
const sampled = R.sample(story, cat, 0.5);
if (sampled.states.mask.z <= sampled.states.kid.z) {
  throw new Error("mask z should be greater than kid z when layer is over_face");
}
console.log("layer over_face test passed");
'''
        result = subprocess.run(
            ["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js"), str(STATIC_DIR / "remake_vector_catalog.json")],
            text=True, capture_output=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_phase_h_sample_stories_validate(self):
        from bkt_web.remake_vector import (
            handwashing_examples, doctor_visit_examples,
            tooth_examples, nutrition_examples, validate_story
        )
        for fn in (handwashing_examples, doctor_visit_examples, tooth_examples, nutrition_examples):
            stories = fn()
            self.assertEqual(len(stories), 1)
            valid = validate_story(stories[0])
            self.assertIn("id", valid)
            self.assertGreaterEqual(valid["duration"], 12.0)
            self.assertLessEqual(valid["duration"], 20.0)


if __name__ == "__main__":
    unittest.main()


