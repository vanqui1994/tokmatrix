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

    def test_phase_i_assets_and_backgrounds(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        cells = [
            "rbc_courier", "neutrophil_scout", "macrophage_chef", "dendritic_messenger",
            "helper_t_captain", "killer_t_knight", "b_cell_archer", "nk_ninja",
            "platelet_builder", "memory_cell_librarian", "mast_cell_alarm", "cilia_sweeper", "skin_guard"
        ]
        microbes = [
            "bacteria_chain", "bacteria_cluster", "infected_cell", "fungus_spore",
            "parasite_worm", "cavity_germ", "plaque_goo", "toxin_blob",
            "pollen_puff", "superbug_boss"
        ]
        organs = [
            "heart_chibi", "lungs_chibi", "brain_chibi", "stomach_chibi",
            "intestine_chibi", "liver_chibi", "kidney_chibi", "bladder_chibi",
            "tongue_chibi", "eye_chibi", "ear_chibi", "nose_chibi",
            "skin_patch", "bone_chibi", "muscle_chibi", "blood_drop_chibi", "body_xray"
        ]
        for aid in cells + microbes + organs:
            self.assertIn(aid, cat["assets"], f"Asset {aid} thiếu trong catalog")
            self.assertEqual(cat["assets"][aid]["pack"], "body_world")

        # Kiểm tra anchor bắt buộc của cell
        required_cell_anchors = {"root", "face", "mouth", "top", "surface", "back", "hand_l", "hand_r", "grip", "belly"}
        for cid in cells:
            for anc in required_cell_anchors:
                self.assertIn(anc, cat["assets"][cid]["anchors"], f"Cell {cid} thiếu anchor {anc}")

        # 12 Hình nền trong cơ thể
        bgs = [
            "blood_vessel", "lung_alveoli", "stomach_inside", "intestine_town",
            "skin_surface", "wound_site", "mouth_cave", "nose_cave",
            "lymph_node_base", "bone_marrow_factory", "brain_hq", "training_camp"
        ]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            spec = cat["background_specs"][bg]
            self.assertEqual(spec["theme"], "body")
            self.assertEqual(spec["ground_y"], 810)

        # Bảng kiến thức đối chiếu
        self.assertIn("body_world_facts", cat)
        self.assertGreaterEqual(len(cat["body_world_facts"]), 10)
        for item in cat["body_world_facts"]:
            self.assertIn("metaphor", item)
            self.assertIn("science", item)
            self.assertIn("forbidden", item)

    def test_phase_i_strike_infected_validator(self):
        from bkt_web.remake_vector import validate_story, RENDERER
        valid_story = {
            "id": "test-strike-valid",
            "renderer": RENDERER,
            "duration": 2.0,
            "characters": [
                {"id": "knight", "asset": "killer_t_knight"},
                {"id": "infected", "asset": "infected_cell"}
            ],
            "scenes": [{
                "renderer": RENDERER, "kind": "scene", "start_time": 0, "end_time": 2.0,
                "characters_present": ["knight", "infected"],
                "background": {"preset": "blood_vessel"},
                "poses": {
                    "knight": [{"time": 0, "x": 100, "y": 810, "height": 150}],
                    "infected": [{"time": 0, "x": 300, "y": 810, "height": 150, "infected": 1.0}]
                },
                "actions": [{"type": "strike_infected", "start": 0.5, "end": 1.5, "actor": "knight", "target": "infected"}]
            }]
        }
        self.assertTrue(validate_story(valid_story))

        # Rejected when target is healthy cell with infected <= 0.5
        invalid_story = {
            "id": "test-strike-invalid",
            "renderer": RENDERER,
            "duration": 2.0,
            "characters": [
                {"id": "knight", "asset": "killer_t_knight"},
                {"id": "healthy", "asset": "neutrophil_scout"}
            ],
            "scenes": [{
                "renderer": RENDERER, "kind": "scene", "start_time": 0, "end_time": 2.0,
                "characters_present": ["knight", "healthy"],
                "background": {"preset": "blood_vessel"},
                "poses": {
                    "knight": [{"time": 0, "x": 100, "y": 810, "height": 150}],
                    "healthy": [{"time": 0, "x": 300, "y": 810, "height": 150, "infected": 0.2}]
                },
                "actions": [{"type": "strike_infected", "start": 0.5, "end": 1.5, "actor": "knight", "target": "healthy"}]
            }]
        }
        with self.assertRaises(ValueError):
            validate_story(invalid_story)

    def test_phase_i_body_xray_anatomy_rules(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        xray = cat["assets"]["body_xray"]
        anchors = xray["anchors"]
        required_slots = [
            "brain", "eye_l", "eye_r", "nose", "mouth", "lungs",
            "heart", "stomach", "liver", "kidney_l", "kidney_r",
            "intestine", "bladder", "bone_arm", "muscle_arm"
        ]
        for slot in required_slots:
            self.assertIn(slot, anchors, f"body_xray thiếu slot {slot}")
            sx, sy = anchors[slot]
            # Mọi slot nằm trong bóng thân chibi (x trong [-25, 25], y trong [-95, 0])
            self.assertGreaterEqual(sx, -25)
            self.assertLessEqual(sx, 25)
            self.assertGreaterEqual(sy, -95)
            self.assertLessEqual(sy, 0)

        # Khi không flip: tim ở bên trái nhân vật = x > 0 (bên phải màn hình)
        heart_x, heart_y = anchors["heart"]
        self.assertGreater(heart_x, 0, "Slot heart phải có x > 0 (bên phải màn hình = bên trái nhân vật)")

        # Gan ở bên phải nhân vật = x < 0 (bên trái màn hình)
        liver_x, liver_y = anchors["liver"]
        self.assertLess(liver_x, 0, "Slot liver phải có x < 0 (bên trái màn hình = bên phải nhân vật)")

        # Dạ dày thấp hơn tim (y tiến gần 0 hơn)
        stomach_x, stomach_y = anchors["stomach"]
        self.assertGreater(stomach_y, heart_y, "Slot stomach phải thấp hơn heart (y lớn hơn / gần đáy hơn)")

    def test_phase_i_sample_stories_validate(self):
        from bkt_web.remake_vector import (
            scrape_battle_examples, virus_invasion_examples,
            vaccine_training_examples, body_tour_examples,
            gut_team_examples, cavity_examples, allergy_examples,
            validate_story
        )
        stories_fns = [
            scrape_battle_examples, virus_invasion_examples,
            vaccine_training_examples, body_tour_examples,
            gut_team_examples, cavity_examples, allergy_examples
        ]
        for fn in stories_fns:
            stories = fn()
            self.assertEqual(len(stories), 1)
            valid = validate_story(stories[0])
            self.assertIn("id", valid)
            self.assertGreaterEqual(valid["duration"], 12.0)
            self.assertLessEqual(valid["duration"], 20.0)


    def test_phase_j_outfits_catalog_and_anchor_invariance(self):
        from bkt_web.remake_vector import catalog, STATIC_DIR
        cat = catalog()
        self.assertIn("outfits", cat)
        outfits = cat["outfits"]
        self.assertGreaterEqual(len(outfits), 40)
        for oid, odef in outfits.items():
            self.assertIn("label", odef)
            self.assertIn("parts", odef)
            self.assertTrue(len(odef.get("topics", [])) >= 2 or "topics_exception" in odef)

        program = r'''
globalThis.Path2D = class { constructor() {} rect() {} arc() {} ellipse() {} };
const fs = require('fs');
const cat = require(process.argv[2]);
require(process.argv[1]);
for (const p of cat.engine_packs) {
  require(process.argv[3] + '/' + p + '.js');
}

const required_anchors = [
  'root', 'face', 'mouth', 'forehead', 'ear_l', 'ear_r', 'teeth', 'head_top', 'top',
  'neck', 'chest', 'belly', 'back', 'waist', 'hip', 'shoulder_l', 'shoulder_r',
  'elbow_l', 'elbow_r', 'wrist_l', 'wrist_r', 'hand_l', 'hand_r',
  'knee_l', 'knee_r', 'foot_l', 'foot_r'
];

const baseState = { asset: 'chibi_kid', height: 320, x: 200, y: 810, rotation: 0, flip: false, outfit: 'none' };
const baseAnchors = {};
for (const anc of required_anchors) {
  baseAnchors[anc] = RemakeVector.worldAnchor(cat, baseState, anc);
}

for (const outfitId of Object.keys(cat.outfits)) {
  const outfitState = { asset: 'chibi_kid', height: 320, x: 200, y: 810, rotation: 0, flip: false, outfit: outfitId };
  for (const anc of required_anchors) {
    const pt = RemakeVector.worldAnchor(cat, outfitState, anc);
    const basePt = baseAnchors[anc];
    if (Math.abs(pt.x - basePt.x) > 0.001 || Math.abs(pt.y - basePt.y) > 0.001) {
      throw new Error(`Anchor mismatch for outfit ${outfitId} on ${anc}`);
    }
  }
}
console.log('OK');
'''
        result = subprocess.run(
            ["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js"), str(STATIC_DIR / "remake_vector_catalog.json"), str(STATIC_DIR / "remake_vector_packs")],
            text=True, capture_output=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_phase_j_topics_coverage_and_exceptions(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        j_packs = {"vehicles", "buildings", "foods", "containers", "furniture", "tools_ext"}
        for rig_id, asset in cat["assets"].items():
            if asset.get("pack") in j_packs:
                topics = asset.get("topics", [])
                has_exception = "topics_exception" in asset or ("spec" in asset and "topics_exception" in asset["spec"])
                self.assertTrue(len(topics) >= 2 or has_exception, f"{rig_id} thiếu topics (>=2) hoặc topics_exception")

        for oid, odef in cat.get("outfits", {}).items():
            topics = odef.get("topics", [])
            has_exception = "topics_exception" in odef
            self.assertTrue(len(topics) >= 2 or has_exception, f"Outfit {oid} thiếu topics (>=2) hoặc topics_exception")

    def test_phase_j_localization_and_locales(self):
        from bkt_web.remake_vector import catalog, localize, validate_story, scrape_battle_examples
        cat = catalog()
        self.assertEqual(cat.get("locales"), ["neutral", "de", "us", "kr", "jp"])
        for loc in ["neutral", "de", "us", "kr", "jp"]:
            self.assertIn(loc, cat.get("locale_specs", {}))
            spec = cat["locale_specs"][loc]
            for key in ("bin_paper", "bin_plastic", "bin_glass", "bin_bio", "bin_residual", "school_bus", "traffic_light", "wall_style"):
                self.assertIn(key, spec, f"locale_specs[{loc}] thiếu {key}")

        story = scrape_battle_examples()[0]
        for loc in ["neutral", "de", "us", "kr", "jp"]:
            localized = localize(story, loc)
            validate_story(localized)
            for s in localized["scenes"]:
                self.assertEqual(s["background"]["locale"], loc)
            for c in localized["characters"]:
                self.assertEqual(c["style"]["locale"], loc)

        with self.assertRaises(ValueError):
            localize(story, "invalid_locale_xyz")

    def test_phase_j_zero_text_and_pictograms_spy(self):
        from bkt_web.remake_vector import STATIC_DIR
        program = r'''
globalThis.Path2D = class { constructor() {} rect() {} arc() {} ellipse() {} };
const cat = require(process.argv[2]);
require(process.argv[1]);
for (const p of cat.engine_packs) {
  require(process.argv[3] + '/' + p + '.js');
}

let fillTextCalls = 0;
let strokeTextCalls = 0;
const mockCtx = {
  save() {}, restore() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, bezierCurveTo() {}, quadraticCurveTo() {},
  arc() {}, arcTo() {}, ellipse() {}, rect() {}, roundRect() {},
  fill() {}, stroke() {}, clip() {},
  scale() {}, translate() {}, rotate() {}, transform() {}, setTransform() {}, resetTransform() {},
  clearRect() {}, fillRect() {}, strokeRect() {},
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  fillText() { fillTextCalls++; },
  strokeText() { strokeTextCalls++; },
  measureText() { return { width: 10 }; },
  lineWidth: 1, strokeStyle: '#000', fillStyle: '#000', lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
  globalAlpha: 1, globalCompositeOperation: 'source-over'
};

// 1. Pictograms
for (const catName of ['traffic', 'recycling', 'emergency', 'prohibition', 'first_aid', 'ghs']) {
  const table = RemakeVector.kit.PICTOGRAMS[catName];
  if (!table) continue;
  for (const [sym, fn] of Object.entries(table)) {
    fn(mockCtx, 0, 0, 40, '#000', '#fff');
  }
}

// 2. All Phase J rigs
const jPacks = ['vehicles', 'buildings', 'foods', 'containers', 'furniture', 'tools_ext'];
for (const [id, a] of Object.entries(cat.assets)) {
  if (jPacks.includes(a.pack)) {
    const drawer = RemakeVector.kit.RIG_DRAWERS[id];
    if (drawer) {
      drawer(mockCtx, { asset: id, height: 100, x: 0, y: 0, opacity: 1, vx: 5, growth: 0.5, cooked: 0.8, open: 0.5, fill: 0.5 }, 0, cat);
    }
  }
}

// 3. Modular backgrounds
for (const bgId of ['street', 'interior']) {
  const bg = RemakeVector.BACKGROUNDS[bgId];
  if (bg && bg.draw) {
    for (const loc of ['neutral', 'de', 'us', 'kr', 'jp']) {
      bg.draw(mockCtx, { width: 1080, height: 1080, ground_y: 810, locale: loc }, 0);
    }
  }
}

if (fillTextCalls > 0 || strokeTextCalls > 0) {
  throw new Error(`Spy failed: fillText=${fillTextCalls}, strokeText=${strokeTextCalls}`);
}
console.log('OK');
'''
        result = subprocess.run(
            ["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js"), str(STATIC_DIR / "remake_vector_catalog.json"), str(STATIC_DIR / "remake_vector_packs")],
            text=True, capture_output=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_phase_j_action_contacts_and_rules(self):
        from bkt_web.remake_vector import STATIC_DIR
        program = r'''
globalThis.Path2D = class { constructor() {} rect() {} arc() {} ellipse() {} };
const cat = require(process.argv[2]);
require(process.argv[1]);
for (const p of cat.engine_packs) {
  require(process.argv[3] + '/' + p + '.js');
}

// 1. DRIVE: car on road at ground_y 810
const storyDrive = {
  id: 'test-drive', renderer: 'native-vector-v1', duration: 2.0,
  characters: [{ id: 'auto', asset: 'car' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2.0,
    characters_present: ['auto'],
    background: { preset: 'street', ground_y: 810 },
    poses: { auto: [{ time: 0, x: 200, y: 810, height: 180, vx: 50 }, { time: 2, x: 600, y: 810, height: 180, vx: 50 }] },
    actions: [{ type: 'drive', start: 0, end: 2, actor: 'auto' }]
  }]
};
const sampDrive = RemakeVector.sample(storyDrive, cat, 1.0);
const carY = sampDrive.states.auto.y;
if (Math.abs(carY - 810) > 2) throw new Error('Drive car bottom not at ground_y: ' + carY);

// 2. RIDE: chibi riding bicycle (hip to seat_1 < 6px)
const storyRide = {
  id: 'test-ride', renderer: 'native-vector-v1', duration: 2.0,
  characters: [{ id: 'kid', asset: 'chibi_kid' }, { id: 'bike', asset: 'bicycle' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2.0,
    characters_present: ['kid', 'bike'],
    background: { preset: 'street', ground_y: 810 },
    poses: {
      bike: [{ time: 0, x: 300, y: 810, height: 160 }],
      kid: [{ time: 0, x: 300, y: 810, height: 280 }]
    },
    actions: [{ type: 'ride', start: 0, end: 2, actor: 'kid', target: 'bike' }]
  }]
};
const sampRide = RemakeVector.sample(storyRide, cat, 1.0);
const seatPt = RemakeVector.worldAnchor(cat, sampRide.states.bike, 'seat_1');
const hipPt = RemakeVector.worldAnchor(cat, sampRide.states.kid, 'hip');
const rideDist = Math.hypot(seatPt.x - hipPt.x, seatPt.y - hipPt.y);
if (rideDist > 6) throw new Error('Ride hip to seat distance too large: ' + rideDist);

// 3. TAKE_COVER: head_top must be lower than table top (head_top.y > table.top.y)
const storyCover = {
  id: 'test-cover', renderer: 'native-vector-v1', duration: 2.0,
  characters: [{ id: 'kid', asset: 'chibi_kid' }, { id: 'desk', asset: 'desk' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2.0,
    characters_present: ['kid', 'desk'],
    background: { preset: 'interior', ground_y: 810 },
    poses: {
      desk: [{ time: 0, x: 400, y: 810, height: 180 }],
      kid: [{ time: 0, x: 400, y: 810, height: 260 }]
    },
    actions: [{ type: 'take_cover', start: 0, end: 2, actor: 'kid', target: 'desk' }]
  }]
};
const sampCover = RemakeVector.sample(storyCover, cat, 1.0);
const tableTop = RemakeVector.worldAnchor(cat, sampCover.states.desk, 'top');
const headTop = RemakeVector.worldAnchor(cat, sampCover.states.kid, 'head_top');
if (headTop.y < tableTop.y) throw new Error('take_cover head is not below table top');

// 4. SORT: item grip distance to opening < 10px at contact
const storySort = {
  id: 'test-sort', renderer: 'native-vector-v1', duration: 2.0,
  characters: [{ id: 'apple', asset: 'apple' }, { id: 'bin', asset: 'bin_bio' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2.0,
    characters_present: ['apple', 'bin'],
    background: { preset: 'street', ground_y: 810 },
    poses: {
      bin: [{ time: 0, x: 500, y: 810, height: 160 }],
      apple: [{ time: 0, x: 300, y: 700, height: 40 }]
    },
    actions: [{ type: 'sort', start: 0, end: 2, actor: 'apple', target: 'bin' }]
  }]
};
const sampSort = RemakeVector.sample(storySort, cat, 1.4);
const binOpen = RemakeVector.worldAnchor(cat, sampSort.states.bin, 'opening');
const appleGrip = RemakeVector.worldAnchor(cat, sampSort.states.apple, 'grip');
const sortDist = Math.hypot(appleGrip.x - binOpen.x, appleGrip.y - binOpen.y);
if (sortDist > 10) throw new Error('sort item to opening distance too large: ' + sortDist);

// 5. BUILD: growth monotonic
const storyBuild = {
  id: 'test-build', renderer: 'native-vector-v1', duration: 2.0,
  characters: [{ id: 'worker', asset: 'chibi_farmer' }, { id: 'hut', asset: 'stone_hut' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2.0,
    characters_present: ['worker', 'hut'],
    background: { preset: 'street', ground_y: 810 },
    poses: {
      hut: [{ time: 0, x: 500, y: 810, height: 260 }],
      worker: [{ time: 0, x: 380, y: 810, height: 280 }]
    },
    actions: [{ type: 'build', start: 0, end: 2, actor: 'worker', target: 'hut' }]
  }]
};
const g0 = RemakeVector.sample(storyBuild, cat, 0.2).states.hut.growth;
const g1 = RemakeVector.sample(storyBuild, cat, 1.0).states.hut.growth;
const g2 = RemakeVector.sample(storyBuild, cat, 1.8).states.hut.growth;
if (!(g0 < g1 && g1 < g2)) throw new Error('build growth not monotonic: ' + [g0, g1, g2]);

console.log('OK');
'''
        result = subprocess.run(
            ["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js"), str(STATIC_DIR / "remake_vector_catalog.json"), str(STATIC_DIR / "remake_vector_packs")],
            text=True, capture_output=True
        )
    def test_phase_k_recycling_catalog_and_anchors(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        self.assertIn("recycling", cat.get("engine_packs", []))
        self.assertIn("recycling_yard", cat.get("backgrounds", []))
        bg_spec = cat.get("background_specs", {}).get("recycling_yard", {})
        self.assertEqual(bg_spec.get("ground_y"), 810)
        self.assertEqual(bg_spec.get("theme"), "urban")

        expected_rigs = [
            "plastic_bottle", "can", "glass_jar", "newspaper_bundle",
            "cardboard_box", "banana_peel", "apple_core", "battery",
            "garbage_truck", "recycling_plant"
        ]
        for rig_id in expected_rigs:
            self.assertIn(rig_id, cat["assets"])
            asset = cat["assets"][rig_id]
            self.assertEqual(asset.get("pack"), "recycling")
            self.assertGreaterEqual(len(asset.get("topics", [])), 2)
            self.assertIn("root", asset.get("anchors", {}))
            if rig_id in ["plastic_bottle", "can", "glass_jar", "newspaper_bundle", "cardboard_box", "banana_peel", "apple_core", "battery"]:
                self.assertTrue(asset.get("face"))
                self.assertIn("face", asset["anchors"])
                self.assertIn("grip", asset["anchors"])
                self.assertIn(rig_id, cat["actions"]["sort"]["actors"])

        self.assertIn("garbage_truck", cat["actions"]["drive"]["actors"])
        self.assertIn("recycling_plant", cat["actions"]["build"]["targets"])

    def test_phase_k_recycling_stories_validate(self):
        from bkt_web.remake_vector import recycling_sort_examples, bottle_journey_examples, validate_story
        for fn in (recycling_sort_examples, bottle_journey_examples):
            stories = fn()
            self.assertEqual(len(stories), 1)
            valid = validate_story(stories[0])
            self.assertGreaterEqual(valid["duration"], 12.0)
            self.assertLessEqual(valid["duration"], 20.0)

    def test_phase_k_sorting_and_truck_lift_actions(self):
        from bkt_web.remake_vector import STATIC_DIR
        program = r'''
globalThis.Path2D = class { constructor() {} rect() {} arc() {} ellipse() {} };
const cat = require(process.argv[2]);
require(process.argv[1]);
for (const p of cat.engine_packs) {
  require(process.argv[3] + '/' + p + '.js');
}

// 1. Sort plastic bottle into bin_plastic
const storySort = {
  id: 'test-k-sort', renderer: 'native-vector-v1', duration: 2.0,
  characters: [{ id: 'bottle', asset: 'plastic_bottle' }, { id: 'bin', asset: 'bin_plastic' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2.0,
    characters_present: ['bottle', 'bin'],
    background: { preset: 'recycling_yard', ground_y: 810 },
    poses: {
      bin: [{ time: 0, x: 400, y: 810, height: 160 }],
      bottle: [{ time: 0, x: 200, y: 750, height: 42 }]
    },
    actions: [{ type: 'sort', start: 0, end: 2, actor: 'bottle', target: 'bin' }]
  }]
};
const sampSort = RemakeVector.sample(storySort, cat, 1.4);
const binOpen = RemakeVector.worldAnchor(cat, sampSort.states.bin, 'opening');
const botGrip = RemakeVector.worldAnchor(cat, sampSort.states.bottle, 'grip');
const dist = Math.hypot(botGrip.x - binOpen.x, botGrip.y - binOpen.y);
if (dist > 10) throw new Error('Sort bottle to bin distance too large: ' + dist);

// 2. Garbage truck drive
const storyDrive = {
  id: 'test-k-drive', renderer: 'native-vector-v1', duration: 2.0,
  characters: [{ id: 'truck', asset: 'garbage_truck' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2.0,
    characters_present: ['truck'],
    background: { preset: 'recycling_yard', ground_y: 810 },
    poses: { truck: [{ time: 0, x: 200, y: 810, height: 180 }, { time: 2, x: 500, y: 810, height: 180 }] },
    actions: [{ type: 'drive', start: 0, end: 2, actor: 'truck' }]
  }]
};
const sampDrive = RemakeVector.sample(storyDrive, cat, 1.0);
if (Math.abs(sampDrive.states.truck.y - 810) > 2) throw new Error('Garbage truck y not at ground_y: ' + sampDrive.states.truck.y);

console.log('OK');
'''
        result = subprocess.run(
            ["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js"), str(STATIC_DIR / "remake_vector_catalog.json"), str(STATIC_DIR / "remake_vector_packs")],
            text=True, capture_output=True
        )
    def test_phase_l_safety_catalog_and_anchors(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        self.assertIn("safety", cat.get("engine_packs", []))

        expected_rigs = [
            "traffic_light", "crosswalk", "traffic_cone", "smoke_detector",
            "fire_blanket", "swim_ring", "rescue_buoy", "radio",
            "megaphone", "sandbag"
        ]
        for rig_id in expected_rigs:
            self.assertIn(rig_id, cat["assets"])
            asset = cat["assets"][rig_id]
            self.assertEqual(asset.get("pack"), "safety")
            self.assertGreaterEqual(len(asset.get("topics", [])), 2)
            self.assertIn("root", asset.get("anchors", {}))

        self.assertIn("light_red", cat["assets"]["traffic_light"]["anchors"])
        self.assertIn("light_green", cat["assets"]["traffic_light"]["anchors"])
        self.assertIn("center", cat["assets"]["crosswalk"]["anchors"])
        self.assertIn("led", cat["assets"]["smoke_detector"]["anchors"])
        self.assertIn("mount", cat["assets"]["fire_blanket"]["anchors"])
        self.assertIn("float", cat["assets"]["swim_ring"]["anchors"])
        self.assertIn("rope", cat["assets"]["rescue_buoy"]["anchors"])

        self.assertIn("wait_signal", cat["actions"])
        self.assertIn("crawl_low", cat["actions"])
        self.assertIn("traffic_light", cat["actions"]["wait_signal"]["targets"])
        self.assertIn("crosswalk", cat["actions"]["wait_signal"]["targets"])
        self.assertIn("smoke_detector", cat["actions"]["crawl_low"]["targets"])
        self.assertIn("fire_blanket", cat["actions"]["crawl_low"]["targets"])

    def test_phase_l_safety_stories_validate(self):
        from bkt_web.remake_vector import crossing_street_examples, disaster_safety_examples, validate_story
        for fn in (crossing_street_examples, disaster_safety_examples):
            stories = fn()
            self.assertEqual(len(stories), 1)
            valid = validate_story(stories[0])
            self.assertEqual(valid["duration"], 15.0)

    def test_phase_l_safety_actions(self):
        from bkt_web.remake_vector import STATIC_DIR
        program = r'''
globalThis.Path2D = class { constructor() {} rect() {} arc() {} ellipse() {} };
const cat = require(process.argv[2]);
require(process.argv[1]);
for (const p of cat.engine_packs) {
  require(process.argv[3] + '/' + p + '.js');
}

// 1. Test wait_signal with JP hand raise
const storyWait = {
  id: 'test-l-wait', renderer: 'native-vector-v1', duration: 3.0,
  characters: [{ id: 'kid', asset: 'chibi_kid' }, { id: 'light', asset: 'traffic_light' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 3.0,
    characters_present: ['kid', 'light'],
    background: { preset: 'street', ground_y: 810 },
    poses: {
      kid: [{ time: 0, x: 200, y: 810, height: 260 }],
      light: [{ time: 0, x: 400, y: 810, height: 135, light: 'red' }]
    },
    actions: [{ type: 'wait_signal', start: 0, end: 3, actor: 'kid', target: 'light', locale: 'jp' }]
  }]
};
const sampWait = RemakeVector.sample(storyWait, cat, 1.5);
if (sampWait.states.kid.hand_r_y !== -65) {
  throw new Error('wait_signal jp locale did not raise hand: ' + sampWait.states.kid.hand_r_y);
}

// 2. Test crawl_low posture
const storyCrawl = {
  id: 'test-l-crawl', renderer: 'native-vector-v1', duration: 3.0,
  characters: [{ id: 'kid', asset: 'chibi_kid' }],
  scenes: [{
    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 3.0,
    characters_present: ['kid'],
    background: { preset: 'interior', ground_y: 810 },
    poses: { kid: [{ time: 0, x: 200, y: 810, height: 260 }] },
    actions: [{ type: 'crawl_low', start: 0, end: 3, actor: 'kid' }]
  }]
};
const sampCrawl = RemakeVector.sample(storyCrawl, cat, 1.5);
if (sampCrawl.states.kid.sit !== 1.0) throw new Error('crawl_low did not sit: ' + sampCrawl.states.kid.sit);
if (sampCrawl.states.kid.lean !== 0.65) throw new Error('crawl_low did not lean: ' + sampCrawl.states.kid.lean);
if (sampCrawl.states.kid.hand_l_y !== -35) throw new Error('crawl_low did not cover mouth: ' + sampCrawl.states.kid.hand_l_y);

console.log('OK');
'''
        result = subprocess.run(
            ["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js"), str(STATIC_DIR / "remake_vector_catalog.json"), str(STATIC_DIR / "remake_vector_packs")],
            text=True, capture_output=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()





class PhaseJKLReviewTest(unittest.TestCase):
    """Canh các lỗi đã gặp khi review Giai đoạn I–L (28/09): hình âm thầm biến mất hoặc rơi về hình mặc định."""
    _node = PackContractTest._node

    def test_every_name_packs_take_from_the_kit_exists(self):
        import re
        from bkt_web.remake_vector import engine_sources
        keys = set(self._node("console.log(JSON.stringify(Object.keys(V.kit)));"))
        for src in engine_sources()[1:]:
            text = src.read_text(encoding="utf-8")
            for m in re.finditer(r"const\s*\{([^}]*)\}\s*=\s*(?:RemakeVector\.kit|kit)\s*;", text):
                names = {n.strip().split(":")[0].strip() for n in m.group(1).split(",") if n.strip()}
                self.assertEqual(names - keys, set(), f"{src.name}: tên không có trong RemakeVector.kit (sẽ là undefined)")

    def test_svg_path_strings_contain_only_numbers(self):
        """`M -w*0.5 0` trong template string là đường vẽ hỏng: không có gì được vẽ (kim tự tháp, lều tuyết…)."""
        import re
        from bkt_web.remake_vector import engine_sources
        for src in engine_sources():
            text = src.read_text(encoding="utf-8")
            for m in re.finditer(r"`([^`]*)`", text):
                body = re.sub(r"\$\{[^}]*\}", "0", m.group(1))
                if re.match(r"\s*M\s", body):
                    rest = re.sub(r"\b[MLQCAZHVSTmlqcazhvst]\b", " ", body)
                    self.assertIsNone(re.search(r"[A-Za-z_*]", rest), f"{src.name}: {m.group(1)[:60]}")

    def test_every_outfit_resolves_all_its_parts(self):
        from bkt_web.remake_vector import catalog
        out = self._node(r"""
const {cat}=JSON.parse(fs.readFileSync(0,'utf8'));const bad={};
for(const id of Object.keys(cat.outfits)){try{V.kit.resolveOutfit(cat,{outfit:id});}catch(e){bad[id]=String(e.message);}}
console.log(JSON.stringify(bad));""", {"cat": catalog()})
        self.assertEqual(out, {})

    def test_character_outfit_applies_and_warm_clothes_stop_the_snow_shiver(self):
        from bkt_web.remake_vector import catalog
        out = self._node(r"""
const {cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const mk=(outfit)=>({id:'o',renderer:'native-vector-v1',duration:2,characters:[{id:'k',asset:'chibi_kid',...(outfit?{outfit}:{})}],
 scenes:[{renderer:'native-vector-v1',kind:'scene',start_time:0,end_time:2,characters_present:['k'],background:{preset:'garden',weather:'snow'},poses:{k:[{time:0,x:288,y:810,height:300}]},actions:[]}]});
const a=V.sample(mk('astronaut'),cat,1).states.k,b=V.sample(mk('pilot'),cat,1).states.k,c=V.sample(mk(null),cat,1).states.k;
console.log(JSON.stringify([a.outfit,a.shiver,b.shiver,c.shiver]));""", {"cat": catalog()})
        self.assertEqual(out, ["astronaut", 0, 1, 1])

    def test_extended_tools_have_their_own_drawing_and_matching_anchors(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx=new Proxy({},{get:(o,k)=>k in o?o[k]:(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
const bad=[];for(const id of Object.keys(V.kit.TOOL_SPECS)){try{V.kit.RIG_DRAWERS[id](ctx,{...cat.pose_defaults,asset:id,style:{},id},1,cat);}catch(e){bad.push(id+': '+e.message);}}
console.log(JSON.stringify({bad,anchors:V.kit.TOOL_ANCHORS}));""", {"cat": cat})
        self.assertEqual(out["bad"], [])
        for tool, anchors in out["anchors"].items():
            for name, point in anchors.items():
                self.assertEqual(cat["assets"][tool]["anchors"][name], point, f"{tool}.{name}")

    def test_wheels_touch_the_ground(self):
        """Đáy mọi bánh xe (anchor wheel_N + bán kính) nằm ở gốc rig = ground_y (sai 0.5 đơn vị)."""
        from bkt_web.remake_vector import catalog
        cat = catalog()
        checked = 0
        for aid, asset in cat["assets"].items():
            spec = asset.get("spec") or {}
            if asset.get("group") != "vehicle" or spec.get("category") == "water" or not spec.get("wheels") or spec.get("tracks"):  # xe xích: bánh nằm trong xích
                continue
            bottoms = [asset["anchors"][f"wheel_{i + 1}"][1] + r for i, (_, _, r) in enumerate(spec["wheels"])]
            self.assertAlmostEqual(max(bottoms), 0, delta=0.5, msg=aid)
            checked += 1
        self.assertGreater(checked, 15)

    def test_action_channels_are_numeric_and_never_move_the_body(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        for aid, action in cat["actions"].items():
            channel = action.get("channel")
            if not channel:
                continue
            self.assertNotIn(channel, ("x", "y", "rotation", "height"), aid)   # kênh đẩy giá trị về `amount` (0–1)
            self.assertIsInstance(cat["pose_defaults"].get(channel, 0), (int, float), aid)

    def test_buildings_default_to_finished_and_cell_hands_sit_beside_the_body(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        out = self._node(r"""
const {cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const one=(asset)=>V.sample({id:'x',renderer:'native-vector-v1',duration:1,characters:[{id:'a',asset}],scenes:[{renderer:'native-vector-v1',kind:'scene',start_time:0,end_time:1,characters_present:['a'],background:{preset:'garden'},poses:{a:[{time:0,x:288,y:810,height:300}]},actions:[]}]},cat,0.5).states.a;
const b=Object.keys(cat.assets).filter(k=>cat.assets[k].group==='building').map(k=>[k,one(k).growth]);
const c=Object.keys(cat.assets).filter(k=>cat.assets[k].group==='cell').map(k=>{const s=one(k);return [k,s.hand_l_y,s.hand_r_y,cat.assets[k].anchors.top[1]];});
console.log(JSON.stringify({b,c}));""", {"cat": cat})
        for building, growth in out["b"]:
            self.assertEqual(growth, 1, building)
        for cell, left, right, top in out["c"]:
            self.assertGreater(left, top, cell)    # y âm là đi lên: tay thấp hơn đỉnh đầu
            self.assertGreater(right, top, cell)

    def test_take_cover_keeps_the_head_below_the_desk_top(self):
        from bkt_web.remake_vector import disaster_safety_examples
        story = disaster_safety_examples()[0]
        a = next(x for sc in story["scenes"] for x in sc["actions"] if x["type"] == "take_cover")
        from bkt_web.remake_vector import catalog
        out = self._node(r"""
const {story,cat,a}=JSON.parse(fs.readFileSync(0,'utf8'));const rows=[];
for(let t=a.start+(a.end-a.start)*0.3;t<=a.end;t+=0.25){const f=V.sample(story,cat,t);
  rows.push([V.worldAnchor(cat,f.states[a.actor],'head_top').y,V.worldAnchor(cat,f.states[a.target],'top').y,f.states[a.actor].y]);}
console.log(JSON.stringify(rows));""", {"story": story, "cat": catalog(), "a": a})
        self.assertTrue(out)
        for head, desk, foot in out:
            self.assertGreater(head, desk)          # đầu thấp hơn mặt bàn
            self.assertAlmostEqual(foot, 810, delta=0.5)   # không lún xuống sàn


class SharedActionContactTest(unittest.TestCase):
    """Plan §18.3: ride / haul / carry_together giữ điểm chạm suốt động tác (hold giữ trạng thái cuối)."""
    _node = PackContractTest._node

    @staticmethod
    def _story(chars, poses, actions, duration=5):
        from bkt_web.remake_vector import validate_story
        return validate_story({"id": "contact", "renderer": "native-vector-v1", "duration": duration, "characters": chars,
                               "scenes": [{"renderer": "native-vector-v1", "kind": "scene", "start_time": 0, "end_time": duration,
                                           "characters_present": list(poses), "poses": poses, "actions": actions, "background": {"preset": "street"}}]})

    def test_ride_keeps_the_hip_on_the_seat_while_the_car_drives(self):
        from bkt_web.remake_vector import catalog
        story = self._story([{"id": "kid", "asset": "chibi_kid"}, {"id": "car", "asset": "car"}],
                            {"kid": [{"time": 0, "x": 60, "y": 810, "height": 150}],
                             "car": [{"time": 0, "x": 120, "y": 810, "height": 200}, {"time": 5, "x": 430, "y": 810, "height": 200}]},
                            [{"type": "ride", "actor": "kid", "target": "car", "start": 0.5, "end": 4}])
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const d=[];
for(let t=0.5;t<=4.8;t+=0.25){const f=V.sample(story,cat,t);const h=V.worldAnchor(cat,f.states.kid,'hip'),s=V.worldAnchor(cat,f.states.car,'seat_1');d.push(Math.hypot(h.x-s.x,h.y-s.y));}
console.log(JSON.stringify(d));""", {"story": story, "cat": catalog()})
        self.assertLess(max(out), 6)   # cả sau end (hold) người vẫn ngồi trên xe đang chạy

    def test_haul_puts_every_hand_on_the_rope_and_moves_the_load(self):
        from bkt_web.remake_vector import catalog
        story = self._story([{"id": "cart", "asset": "horse_cart"}, {"id": "a", "asset": "chibi_boy"}, {"id": "b", "asset": "chibi_girl"}],
                            {"cart": [{"time": 0, "x": 150, "y": 810, "height": 180}],
                             "a": [{"time": 0, "x": 320, "y": 810, "height": 200}], "b": [{"time": 0, "x": 400, "y": 810, "height": 200}]},
                            [{"type": "haul", "actor": "a", "helpers": ["b"], "target": "cart", "start": 0.5, "end": 4, "distance": 90}])
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const rows=[];
for(let t=0.6;t<=4.6;t+=0.25){const f=V.sample(story,cat,t),r=f.actions.find(a=>a.type==='haul')._rope;
  const onRope=p=>{const [x1,y1,x2,y2]=r;const k=Math.max(0,Math.min(1,((p.x-x1)*(x2-x1)+(p.y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2)));return Math.hypot(p.x-(x1+k*(x2-x1)),p.y-(y1+k*(y2-y1)));};
  const d=[];for(const id of ['a','b'])for(const h of ['hand_l','hand_r'])d.push(onRope(V.worldAnchor(cat,f.states[id],h)));rows.push({t,d:Math.max(...d),cart:f.states.cart.x});}
console.log(JSON.stringify(rows));""", {"story": story, "cat": catalog()})
        for row in out:
            self.assertLess(row["d"], 12, row)
        self.assertAlmostEqual(out[-1]["cart"], 150 + 90, delta=0.5)   # hold: xe dừng ở chỗ đã kéo tới

    def test_carry_together_holds_both_ends_with_both_hands(self):
        from bkt_web.remake_vector import catalog
        story = self._story([{"id": "a", "asset": "chibi_boy"}, {"id": "b", "asset": "chibi_girl"}, {"id": "box", "asset": "barrel"}],
                            {"a": [{"time": 0, "x": 180, "y": 810, "height": 220}, {"time": 5, "x": 300, "y": 810, "height": 220}],
                             "b": [{"time": 0, "x": 330, "y": 810, "height": 220}, {"time": 5, "x": 450, "y": 810, "height": 220}],
                             "box": [{"time": 0, "x": 255, "y": 810, "height": 110}]},
                            [{"type": "carry_together", "actor": "a", "helper": "b", "target": "box", "start": 0.5, "end": 4.5}])
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const rows=[];const A=cat.assets.barrel.anchors,sc=110/100;
for(let t=1.4;t<=4.9;t+=0.25){const f=V.sample(story,cat,t),o=f.states.box;
  const ends=A.grip_l?[V.worldAnchor(cat,o,'grip_l'),V.worldAnchor(cat,o,'grip_r')]:[{x:o.x-40*sc,y:o.y-50*sc},{x:o.x+40*sc,y:o.y-50*sc}];
  const d=[];for(const [id,e] of [['a',ends[0]],['b',ends[1]]])for(const h of ['hand_l','hand_r']){const p=V.worldAnchor(cat,f.states[id],h);d.push(Math.hypot(p.x-e.x,p.y-e.y));}
  rows.push(Math.max(...d));}
console.log(JSON.stringify(rows));""", {"story": story, "cat": catalog()})
        self.assertLess(max(out), 10)


class PhaseMTest(unittest.TestCase):
    """Plan §22 & Giai đoạn M: Lịch sử cổ đại (ancient) - rigs, backgrounds, contacts, và stories."""
    _node = PackContractTest._node

    def test_every_ancient_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        ancient_rigs = [
            "mammoth", "camel", "stone_block", "sledge", "papyrus_roll",
            "campfire", "cave_wall", "laurel_torch", "discus", "javelin_training",
            "paving_stone", "chalkboard_wax_tablet", "olive"
        ]
        for rig in ancient_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"])
                self.assertEqual(cat["assets"][rig].get("pack"), "ancient")
                topics = cat["assets"][rig].get("topics", [])
                self.assertGreaterEqual(len(topics), 2, f"{rig} cần >= 2 topics")
        self.assertIn("olive_tree", cat["assets"])
        self.assertEqual(cat["assets"]["olive_tree"].get("pack"), "farm_trees")

        # Thử vẽ mọi rig cổ đại bằng mock context, không được throw
        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs}=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx=new Proxy({},{get:(o,k)=>k in o?o[k]:(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
const errors=[];
for(const id of rigs){
  try {
    V.kit.RIG_DRAWERS[id](ctx, {...cat.pose_defaults, asset: id, style: {}, id, lit: 0.5, walk: 1, stride: 0.5}, 1, cat);
  } catch(e) {
    errors.push(id + ': ' + e.message);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": ancient_rigs + ["olive_tree"]})
        self.assertEqual(out, [])

    def test_build_pyramid_contacts_and_monotonic_growth(self):
        from bkt_web.remake_vector import catalog, build_pyramid_examples
        cat = catalog()
        story = build_pyramid_examples()[0]
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const rows=[];
// 1. Kiểm tra haul và sledge seat_1 ↔ stone bottom ở cảnh 1
for(let t=0.6; t<=6.4; t+=0.25){
  const f=V.sample(story,cat,t);
  const a=f.actions.find(act=>act.type==='haul');
  const r=a._rope;
  const onRope=p=>{
    const [x1,y1,x2,y2]=r;
    const k=Math.max(0,Math.min(1,((p.x-x1)*(x2-x1)+(p.y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2)));
    return Math.hypot(p.x-(x1+k*(x2-x1)),p.y-(y1+k*(y2-y1)));
  };
  const d=[];
  for(const id of ['worker_1','worker_2']){
    for(const h of ['hand_l','hand_r']){
      d.push(onRope(V.worldAnchor(cat,f.states[id],h)));
    }
  }
  const sSeat=V.worldAnchor(cat,f.states.sledge_1,'seat_1');
  const stoneB=f.states.stone.y;
  rows.push({t, maxD: Math.max(...d), stoneGap: Math.abs(stoneB - sSeat.y), growth: f.states.pyramid_1.growth});
}
// 2. Lấy growth xuyên suốt 15s để kiểm tra tính đơn điệu
const growths=[];
for(let t=0; t<=15.0; t+=1.0){
  const f=V.sample(story,cat,t);
  growths.push(f.states.pyramid_1.growth);
}
console.log(JSON.stringify({rows, growths}));""", {"story": story, "cat": cat})

        for row in out["rows"]:
            self.assertLess(row["maxD"], 12, f"Tay kéo lệch khỏi dây haul ở t={row['t']}")
            self.assertLess(row["stoneGap"], 6, f"Khối đá lệch khỏi yên sledge ở t={row['t']}")

        # growth tăng đơn điệu
        growths = out["growths"]
        for i in range(len(growths) - 1):
            self.assertLessEqual(growths[i], growths[i+1] + 1e-4)
        self.assertGreater(growths[-1], growths[0])

    def test_silk_road_caravan_keeps_rider_on_camel_seat(self):
        from bkt_web.remake_vector import catalog, silk_road_caravan_examples
        cat = catalog()
        story = silk_road_caravan_examples()[0]
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const gaps=[];
for(let t=0.5; t<=15.5; t+=0.5){
  const f=V.sample(story,cat,t);
  const hip=V.worldAnchor(cat,f.states.rider,'hip');
  const seat=V.worldAnchor(cat,f.states.camel_1,'seat_1');
  gaps.push({t, d: Math.hypot(hip.x - seat.x, hip.y - seat.y)});
}
console.log(JSON.stringify(gaps));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLess(item["d"], 6, f"Hông người cưỡi lệch khỏi seat_1 lạc đà ở t={item['t']}")

    def test_first_fire_campfire_lit_is_deterministic(self):
        from bkt_web.remake_vector import catalog, first_fire_examples
        cat = catalog()
        story = first_fire_examples()[0]
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const litValues=[];
for(const t of [0.0, 1.0, 3.5, 5.5, 6.5]){
  const f=V.sample(story,cat,t);
  litValues.push({t, lit: f.states.fire.lit});
}
// Kiểm tra tua lại cho cùng trạng thái và pixel
const f1=V.sample(story,cat,3.5);
const f2=V.sample(story,cat,3.5);
const sameLit = (f1.states.fire.lit === f2.states.fire.lit);
console.log(JSON.stringify({litValues, sameLit}));""", {"story": story, "cat": cat})

        lits = out["litValues"]
        self.assertAlmostEqual(lits[0]["lit"], 0.0, delta=0.01)
        self.assertGreater(lits[2]["lit"], 0.0)
        self.assertAlmostEqual(lits[-1]["lit"], 1.0, delta=0.01)
        self.assertTrue(out["sameLit"])

    def test_mammoth_run_away_feet_stay_above_ground(self):
        from bkt_web.remake_vector import catalog, first_fire_examples
        cat = catalog()
        story = first_fire_examples()[0]
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const rows=[];
for(let t=7.0; t<=14.0; t+=0.25){
  const f=V.sample(story,cat,t);
  const m=f.states.mammoth_1;
  const root=V.worldAnchor(cat,m,'root');
  rows.push({t, my: m.y, rootY: root.y, running: m.running_away || false});
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLessEqual(item["my"], 810.05, f"Mammoth chìm quá ground_y ở t={item['t']}")
            self.assertLessEqual(item["rootY"], 810.05, f"Chân root mammoth lún dưới ground_y ở t={item['t']}")
        self.assertTrue(any(item["running"] for item in out))

    def test_new_backgrounds_have_zero_text_and_are_deterministic(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        new_bgs = ["stone_age_cave", "nile_bank", "desert_dunes", "roman_town", "greek_stadium"]
        for bg in new_bgs:
            with self.subTest(bg=bg):
                self.assertIn(bg, cat["backgrounds"])
                self.assertIn(bg, cat["background_specs"])
                self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx = new Proxy({}, {
  get:(o,k)=>{
    if (k === 'fillText' || k === 'strokeText') {
      textCalls++;
      return ()=>{};
    }
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:()=>true
});
for(const bg of bgs){
  for(const time of ['day', 'night']){
    for(const weather of ['clear', 'rain', 'snow', 'wind', 'fog', 'storm', 'hot']){
      V.BACKGROUNDS[bg].draw(ctx, {preset: bg, time, weather}, 1.5, V.kit);
    }
  }
}
console.log(JSON.stringify({textCalls}));""", {"cat": cat, "bgs": new_bgs})
        self.assertEqual(out["textCalls"], 0, "Hình nền không được gọi fillText/strokeText")



class PhaseMReviewTest(unittest.TestCase):
    """Story Giai đoạn M phải có hành động thật: khiêng đá bằng tay, đuốc trong tay, đĩa bay và rơi xuống đất."""
    _node = PackContractTest._node

    def test_roman_road_carries_the_stone_by_its_ends(self):
        from bkt_web.remake_vector import catalog, roman_road_examples
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));const d=[];
for(let t=1.5;t<=5.9;t+=0.5){const f=V.sample(story,cat,t),S=f.states;
  const L=V.worldAnchor(cat,S.stone,'grip_l'),R=V.worldAnchor(cat,S.stone,'grip_r');
  for(const [id,e] of [['builder',L],['soldier',R]])for(const h of ['hand_l','hand_r']){const p=V.worldAnchor(cat,S[id],h);d.push(Math.hypot(p.x-e.x,p.y-e.y));}}
console.log(JSON.stringify(d));""", {"story": roman_road_examples()[0], "cat": catalog()})
        self.assertLess(max(out), 10)

    def test_olympic_torch_is_in_hand_and_the_discus_lands(self):
        from bkt_web.remake_vector import catalog, first_olympics_examples
        out = self._node(r"""
const {story,cat}=JSON.parse(fs.readFileSync(0,'utf8'));
const f=V.sample(story,cat,3),g=V.worldAnchor(cat,f.states.torch,'grip'),h=V.worldAnchor(cat,f.states.runner,'hand_r');
const d0=V.sample(story,cat,8).states.disc,d1=V.sample(story,cat,14).states.disc;
console.log(JSON.stringify([Math.hypot(g.x-h.x,g.y-h.y),d1.x-d0.x,d1.y]));""", {"story": first_olympics_examples()[0], "cat": catalog()})
        self.assertLess(out[0], 3)
        self.assertGreater(out[1], 150)
        self.assertAlmostEqual(out[2], 812, delta=1)


class PhaseOTest(unittest.TestCase):
    """Plan §24 & Giai đoạn O: Lịch sử phát minh và đời sống xưa (inventions) - rigs, backgrounds, contacts, stories."""
    _node = PackContractTest._node

    def test_every_inventions_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        inventions_rigs = [
            "draisine_1817", "phonograph", "early_telephone", "movable_type_tray",
            "water_clock", "rain_gauge", "eyeglasses_early", "toothbrush_early",
            "paper_sheet_stack", "coin_stack", "workbench_clutter", "smartphone", "led_bulb"
        ]
        for rig in inventions_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"])
                self.assertEqual(cat["assets"][rig].get("pack"), "inventions")
                topics = cat["assets"][rig].get("topics", [])
                self.assertGreaterEqual(len(topics), 2, f"{rig} cần >= 2 topics")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIsInstance(anchors, dict)
                self.assertGreater(len(anchors), 0)

        # Kiểm tra hình nền mới
        for bg in ("workshop_1900", "old_town_1900"):
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg].get("ground_y"), 810)

        # Thử vẽ mọi rig phát minh bằng mock context, không được throw
        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs}=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx=new Proxy({},{get:(o,k)=>k in o?o[k]:(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
const errors=[];
for(const id of rigs){
  try {
    V.kit.RIG_DRAWERS[id](ctx, {...cat.pose_defaults, asset: id, style: {}, id, lit: 0.5, walk: 1, stride: 0.5, playing: 0.5, growth: 0.5}, 1, cat);
  } catch(e) {
    errors.push(id + ': ' + e.message);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": inventions_rigs})
        self.assertEqual(out, [])

        # Kiểm tra hình nền không có text và vẽ được với mọi thời tiết/đêm
        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        V.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": ["workshop_1900", "old_town_1900"]})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_first_flight_pilot_rides_seat_and_plane_takes_off(self):
        from bkt_web.remake_vector import catalog, first_flight_examples
        cat = catalog()
        story = first_flight_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const gaps = [];
for (let t = 0.5; t <= 13.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const hip = V.worldAnchor(cat, f.states.pilot, 'hip');
  const seat = V.worldAnchor(cat, f.states.plane, 'seat_1');
  gaps.push({t, d: Math.hypot(hip.x - seat.x, hip.y - seat.y), plane_y: f.states.plane.y});
}
console.log(JSON.stringify(gaps));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLess(item["d"], 6.0, f"Hông phi công lệch khỏi seat_1 ở t={item['t']}")
        # Cuối story máy bay cất cánh cao hơn mặt đất >= 150 px
        end_lift = 810 - out[-1]["plane_y"]
        self.assertGreaterEqual(end_lift, 150.0, f"Máy bay chưa cất cánh đủ cao: {end_lift} px")

    def test_printing_press_lever_contact_and_monotonic_paper_growth(self):
        from bkt_web.remake_vector import catalog, printing_press_examples
        cat = catalog()
        story = printing_press_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 6.6; t <= 13.4; t += 0.25) {
  const f = V.sample(story, cat, t);
  const hand = V.worldAnchor(cat, f.states.printer, 'hand_r');
  const lever = V.worldAnchor(cat, f.states.press, 'press');
  rows.push({t, d: Math.hypot(hand.x - lever.x, hand.y - lever.y), growth: f.states.paper.growth});
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLess(item["d"], 12.0, f"Tay thợ in lệch khỏi cần ép ở t={item['t']}")
        growths = [item["growth"] for item in out]
        for i in range(len(growths) - 1):
            self.assertLessEqual(growths[i], growths[i+1] + 1e-4, f"Độ dày xấp giấy không tăng đơn điệu ở bước {i}")
        self.assertGreater(growths[-1], growths[0])

    def test_first_car_wheels_touch_ground_and_driver_on_seat(self):
        from bkt_web.remake_vector import catalog, first_car_examples
        cat = catalog()
        story = first_car_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 13.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const hip = V.worldAnchor(cat, f.states.inventor, 'hip');
  const seat = V.worldAnchor(cat, f.states.car, 'seat_1');
  rows.push({t, d: Math.hypot(hip.x - seat.x, hip.y - seat.y), car_y: f.states.car.y});
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLess(item["d"], 6.0, f"Người lái lệch khỏi ghế ở t={item['t']}")
            self.assertAlmostEqual(item["car_y"], 810.0, delta=1.0, msg=f"Bánh xe không chạm ground_y ở t={item['t']}")

    def test_then_and_now_items_in_hand(self):
        from bkt_web.remake_vector import catalog, then_and_now_examples
        cat = catalog()
        story = then_and_now_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const checkHand = (f, charId, itemId) => {
  const h = V.worldAnchor(cat, f.states[charId], 'hand_r');
  const g = V.worldAnchor(cat, f.states[itemId], 'grip');
  return Math.hypot(h.x - g.x, h.y - g.y);
};
const f1 = V.sample(story, cat, 3.5);
const d1 = checkHand(f1, 'user_1', 'item_1');
const d2 = checkHand(f1, 'user_2', 'item_2');
const d3 = checkHand(f1, 'user_3', 'item_3');
const f2 = V.sample(story, cat, 11.0);
const d4 = checkHand(f2, 'user_1', 'item_4');
const d5 = checkHand(f2, 'user_2', 'item_5');
const d6 = checkHand(f2, 'user_3', 'item_6');
console.log(JSON.stringify([d1, d2, d3, d4, d5, d6]));""", {"story": story, "cat": cat})
        for idx, dist in enumerate(out):
            self.assertLess(dist, 3.0, f"Đồ vật thứ {idx+1} không nằm trong tay (grip ↔ hand = {dist:.2f}px >= 3px)")

    def test_phonograph_playing_is_deterministic(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        out = self._node(r"""
const {cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const story = {
  id: 'phono_det_test',
  renderer: 'native-vector-v1',
  duration: 5.0,
  characters: [{id: 'p', name: 'Phono', asset: 'phonograph'}],
  scenes: [{
    renderer: 'native-vector-v1',
    start_time: 0,
    end_time: 5.0,
    characters_present: ['p'],
    poses: {'p': [{time: 0, x: 288, y: 810, height: 120, playing: 1.0}, {time: 5.0, x: 288, y: 810, height: 120, playing: 1.0}]},
    actions: [],
    background: {preset: 'workshop_1900'}
  }],
  cues: []
};
const f1 = V.sample(story, cat, 2.5);
const f2 = V.sample(story, cat, 2.5);
const sameState = JSON.stringify(f1.states) === JSON.stringify(f2.states);
console.log(JSON.stringify({sameState, playing: f1.states.p.playing}));""", {"cat": cat})
        self.assertTrue(out["sameState"], "Phonograph playing state không tất định khi sample lại cùng thời điểm")
        self.assertEqual(out["playing"], 1.0)


class PhasePTest(unittest.TestCase):
    """Plan §25 & Giai đoạn P: Gói văn hoá Đức (de_culture) - rigs, backgrounds, contacts, stories."""
    _node = PackContractTest._node

    def test_every_de_culture_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        de_rigs = [
            "schultuete", "advent_wreath", "christmas_tree_decor",
            "gingerbread_house", "market_stall", "cuckoo_clock",
            "fox", "owl", "deer", "wolf", "stork", "wild_boar"
        ]
        for rig in de_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"])
                self.assertEqual(cat["assets"][rig].get("pack"), "de_culture")
                topics = cat["assets"][rig].get("topics", [])
                self.assertGreaterEqual(len(topics), 2, f"{rig} cần >= 2 topics")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIsInstance(anchors, dict)
                self.assertGreater(len(anchors), 0)

        # Kiểm tra hình nền mới
        bgs = ["black_forest_village", "christmas_market", "allotment_garden", "alpine_meadow"]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg].get("ground_y"), 810)

        # Thử vẽ mọi rig mới bằng mock context, không được throw
        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs}=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx=new Proxy({},{get:(o,k)=>k in o?o[k]:(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
const errors=[];
for(const id of rigs){
  try {
    V.kit.RIG_DRAWERS[id](ctx, {...cat.pose_defaults, asset: id, style: {}, id, lit: 2, open: 0.5, curl: 0.5, growth: 1}, 1, cat);
  } catch(e) {
    errors.push(id + ': ' + e.message);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": de_rigs})
        self.assertEqual(out, [])

        # Kiểm tra hình nền không có text và vẽ được với mọi thời tiết/đêm
        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        V.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_bremen_musicians_stacking_gap_under_6px(self):
        from bkt_web.remake_vector import catalog, bremen_musicians_examples
        cat = catalog()
        story = bremen_musicians_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 13.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const donkeyBack = V.worldAnchor(cat, f.states.donkey, 'back');
  const dogRoot = V.worldAnchor(cat, f.states.dog, 'root');
  const dogBack = V.worldAnchor(cat, f.states.dog, 'back');
  const catRoot = V.worldAnchor(cat, f.states.cat, 'root');
  const catBack = V.worldAnchor(cat, f.states.cat, 'back');
  const roosterRoot = V.worldAnchor(cat, f.states.rooster, 'root');
  rows.push({
    t,
    d_dog_donkey: Math.hypot(dogRoot.x - donkeyBack.x, dogRoot.y - donkeyBack.y),
    d_cat_dog: Math.hypot(catRoot.x - dogBack.x, catRoot.y - dogBack.y),
    d_rooster_cat: Math.hypot(roosterRoot.x - catBack.x, roosterRoot.y - catBack.y),
  });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            t = item["t"]
            self.assertLess(item["d_dog_donkey"], 6.0, f"Chân chó lệch khỏi lưng lừa ở t={t}")
            self.assertLess(item["d_cat_dog"], 6.0, f"Chân mèo lệch khỏi lưng chó ở t={t}")
            self.assertLess(item["d_rooster_cat"], 6.0, f"Chân gà lệch khỏi lưng mèo ở t={t}")

    def test_st_martin_lanterns_in_hand_and_night(self):
        from bkt_web.remake_vector import catalog, st_martin_lanterns_examples
        cat = catalog()
        story = st_martin_lanterns_examples()[0]
        for sc in story["scenes"]:
            self.assertEqual(sc.get("background", {}).get("time"), "night", "Cảnh rước đèn phải là ban đêm (time: night)")
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 13.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const check = (childId, itemId) => {
    const h = V.worldAnchor(cat, f.states[childId], 'hand_r');
    const g = V.worldAnchor(cat, f.states[itemId], 'grip');
    return Math.hypot(h.x - g.x, h.y - g.y);
  };
  rows.push({
    t,
    d1: check('child_1', 'lantern_1'),
    d2: check('child_2', 'lantern_2'),
    d3: check('child_3', 'lantern_3'),
  });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            t = item["t"]
            self.assertLess(item["d1"], 3.0, f"Đèn 1 lệch khỏi tay ở t={t}")
            self.assertLess(item["d2"], 3.0, f"Đèn 2 lệch khỏi tay ở t={t}")
            self.assertLess(item["d3"], 3.0, f"Đèn 3 lệch khỏi tay ở t={t}")

    def test_first_school_day_cone_in_hand_and_walks_forward(self):
        from bkt_web.remake_vector import catalog, first_school_day_examples
        cat = catalog()
        story = first_school_day_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 13.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const h = V.worldAnchor(cat, f.states.pupil, 'hand_r');
  const g = V.worldAnchor(cat, f.states.cone, 'grip');
  rows.push({
    t,
    d: Math.hypot(h.x - g.x, h.y - g.y),
    pupil_x: f.states.pupil.x
  });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLess(item["d"], 3.0, f"Schultuete lệch khỏi tay ở t={item['t']}")
        # Người đi từ trái sang phải: x tăng
        self.assertGreater(out[-1]["pupil_x"], out[0]["pupil_x"], "Người chưa đi từ trái sang phải (x phải tăng)")

    def test_hedgehog_winter_curls_and_weather_snow(self):
        from bkt_web.remake_vector import catalog, hedgehog_winter_examples
        cat = catalog()
        story = hedgehog_winter_examples()[0]
        sc2 = story["scenes"][1]
        self.assertEqual(sc2.get("background", {}).get("weather"), "snow", "Cảnh 2 phải có weather: snow")
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const fEnd = V.sample(story, cat, 13.5);
console.log(JSON.stringify({curl: fEnd.states.hedgehog.curl, sleepy: fEnd.states.hedgehog.sleepy}));
""", {"story": story, "cat": cat})
        self.assertGreaterEqual(out.get("curl", 0), 0.8, f"Nhím chưa cuộn tròn ở cuối: curl={out.get('curl')}")

    def test_rendered_actor_bounding_box_sizes(self):
        """MỚI - Quy tắc 15: Kiểm tra kích thước pixel thực tế khi render trên canvas.
        Đồ cầm tay >= 60 px, thú nhỏ/chim >= 80 px, thú lớn >= 180 px."""
        from playwright.sync_api import sync_playwright
        from bkt_web.remake_vector import catalog, engine_sources

        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())

        actors_to_test = [
            # handheld props >= 60 px
            {"asset": "schultuete", "height": 130, "min_size": 60, "kind": "prop"},
            {"asset": "lantern_star", "height": 150, "min_size": 60, "kind": "prop"},
            # small animals >= 80 px
            {"asset": "hedgehog", "height": 180, "min_size": 80, "kind": "small_animal"},
            {"asset": "cat", "height": 110, "min_size": 80, "kind": "small_animal"},
            {"asset": "rooster", "height": 95, "min_size": 80, "kind": "small_animal"},
            # large animals >= 180 px
            {"asset": "donkey", "height": 240, "min_size": 180, "kind": "large_animal"},
            {"asset": "dog", "height": 160, "min_size": 120, "kind": "medium_animal"},
            # new wild animals
            {"asset": "fox", "height": 160, "min_size": 120, "kind": "medium_animal"},
            {"asset": "deer", "height": 240, "min_size": 180, "kind": "large_animal"},
            {"asset": "wolf", "height": 200, "min_size": 160, "kind": "large_animal"},
            {"asset": "wild_boar", "height": 200, "min_size": 160, "kind": "large_animal"},
            {"asset": "stork", "height": 220, "min_size": 140, "kind": "bird"},
            {"asset": "owl", "height": 120, "min_size": 80, "kind": "small_animal"},
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.measureActor = function(asset, height) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const k = height / 100;
                ctx.scale(k, k);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) throw new Error('No drawer for ' + asset);
                const s = {{ ...cat.pose_defaults, asset, height, id: 'test', style: {{}} }};
                drawer(ctx, s, 1.0, cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let minX = 576, maxX = -1, minY = 1024, maxY = -1;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const a = img[(y * 576 + x) * 4 + 3];
                    if (a > 10) {{
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }}
                  }}
                }}
                if (maxX < 0) return {{ w: 0, h: 0, maxDim: 0 }};
                const w = maxX - minX + 1, h = maxY - minY + 1;
                return {{ w, h, maxDim: Math.max(w, h) }};
              }};
            </script>
            </body></html>
            """)
            for item in actors_to_test:
                res = page.evaluate("args => measureActor(args[0], args[1])", [item["asset"], item["height"]])
                with self.subTest(asset=item["asset"]):
                    self.assertGreaterEqual(
                        res["maxDim"], item["min_size"],
                        f"{item['asset']} (cao {item['height']}) có kích thước pixel thực tế {res['w']}x{res['h']} (max={res['maxDim']}px) < ngưỡng {item['min_size']}px"
                    )
            browser.close()


class PhaseQTest(unittest.TestCase):
    """Plan §26 & Giai đoạn Q: Gói văn hoá Nhật (jp_culture) - rigs, backgrounds, contacts, stories."""
    _node = PackContractTest._node

    def test_every_jp_culture_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        jp_rigs = [
            "koinobori", "tanabata_bamboo", "bamboo",
            "paper_lantern_jp", "school_bag_randoseru", "train_ticket_gate",
            "pheasant", "crab", "tanuki", "crane", "koi", "snow_monkey"
        ]
        for rig in jp_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"])
                self.assertEqual(cat["assets"][rig].get("pack"), "jp_culture")
                topics = cat["assets"][rig].get("topics", [])
                self.assertGreaterEqual(len(topics), 2, f"{rig} cần >= 2 topics")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIsInstance(anchors, dict)
                self.assertGreater(len(anchors), 0)

        # Kiểm tra hình nền mới
        bgs = ["edo_town", "jp_school", "train_platform", "shrine_generic", "onsen_snow"]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg].get("ground_y"), 810)

        # Thử vẽ mọi rig mới bằng mock context, không được throw
        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs}=JSON.parse(fs.readFileSync(0,'utf8'));
const ctx=new Proxy({},{get:(o,k)=>k in o?o[k]:(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
const errors=[];
for(const id of rigs){
  try {
    V.kit.RIG_DRAWERS[id](ctx, {...cat.pose_defaults, asset: id, style: {}, id, lit: 1, open: 0.5, wind: 0.5, growth: 1}, 1, cat);
  } catch(e) {
    errors.push(id + ': ' + e.message);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": jp_rigs})
        self.assertEqual(out, [])

        # Kiểm tra hình nền không có text và vẽ được với mọi thời tiết/đêm
        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        V.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y, dirty: 0.5}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_momotaro_travel_distance_and_peaceful_ending(self):
        from bkt_web.remake_vector import catalog, momotaro_examples
        cat = catalog()
        story = momotaro_examples()[0]
        # Kiểm tra cảnh 1: cả 4 nhân vật di chuyển >= 150 px
        sc1 = story["scenes"][0]
        for cid in ["momotaro", "dog", "monkey", "pheasant"]:
            keys = sc1["poses"][cid]
            dx = abs(keys[-1]["x"] - keys[0]["x"])
            self.assertGreaterEqual(dx, 150.0, f"{cid} di chuyển {dx}px < 150px trong cảnh đi đường")

        # Kiểm tra cảnh 2: có emote heart, không có hành động bạo lực (slash, charge, strike*)
        sc2 = story["scenes"][1]
        action_types = [a["type"] for a in sc2.get("actions", [])]
        self.assertIn("emote", action_types, "Cảnh 2 phải có emote")
        for atype in action_types:
            self.assertNotIn(atype, ["slash", "charge", "strike", "strike_infected"], f"Không được có hành động đánh nhau: {atype}")

    def test_bento_morning_randoseru_on_back_and_walks_forward(self):
        from bkt_web.remake_vector import catalog, bento_morning_examples
        cat = catalog()
        story = bento_morning_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 14.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const pBack = V.worldAnchor(cat, f.states.pupil, 'back');
  const bBack = V.worldAnchor(cat, f.states.bag, 'back');
  rows.push({
    t,
    d_back: Math.hypot(pBack.x - bBack.x, pBack.y - bBack.y),
    pupil_x: f.states.pupil.x
  });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLess(item["d_back"], 3.0, f"Cặp Randoseru lệch khỏi lưng ở t={item['t']}")
        # Cảnh 2 đi tới trường: x phải tăng >= 150 px
        sc2 = story["scenes"][1]
        keys = sc2["poses"]["pupil"]
        dx = abs(keys[-1]["x"] - keys[0]["x"])
        self.assertGreaterEqual(dx, 150.0, f"Học sinh di chuyển {dx}px < 150px khi tới trường")

    def test_school_cleaning_broom_in_hand_and_dirty_decreases_monotonically(self):
        from bkt_web.remake_vector import catalog, school_cleaning_examples
        cat = catalog()
        story = school_cleaning_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 7.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const h = V.worldAnchor(cat, f.states.pupil, 'hand_r');
  const g = V.worldAnchor(cat, f.states.broom, 'grip');
  rows.push({
    t,
    d_broom: Math.hypot(h.x - g.x, h.y - g.y),
    dirty: f.states.pupil.dirty
  });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        prev_dirty = 1.01
        for item in out:
            self.assertLess(item["d_broom"], 3.0, f"Chổi lệch khỏi tay ở t={item['t']}")
            self.assertLessEqual(item["dirty"], prev_dirty + 1e-4, f"Độ bẩn không giảm đơn điệu ở t={item['t']}")
            prev_dirty = item["dirty"]
        self.assertLessEqual(out[-1]["dirty"], 0.1, "Cuối giờ quét sàn phải sạch")

    def test_tanabata_wish_hand_touches_branch_and_night(self):
        from bkt_web.remake_vector import catalog, tanabata_wish_examples
        cat = catalog()
        story = tanabata_wish_examples()[0]
        for sc in story["scenes"]:
            self.assertEqual(sc.get("background", {}).get("time"), "night", "Cảnh Tanabata phải là ban đêm (time: night)")
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const f = V.sample(story, cat, 5.0);
const treeBranch = V.worldAnchor(cat, f.states.tree, 'branch_1');
const pupilHand = V.worldAnchor(cat, f.states.pupil, 'hand_r');
console.log(JSON.stringify({
  d_touch: Math.hypot(treeBranch.x - pupilHand.x, treeBranch.y - pupilHand.y)
}));""", {"story": story, "cat": cat})
        self.assertLess(out["d_touch"], 12.0, f"Tay bé chưa chạm cành tre: khoảng cách = {out['d_touch']}px")

    def test_koinobori_deterministic_and_changes_with_wind(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              function hashPixels(data) {{
                let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
                for (let i = 0; i < data.length; i += 4) {{
                  const v = (data[i] << 24) | (data[i+1] << 16) | (data[i+2] << 8) | data[i+3];
                  h1 = Math.imul(h1 ^ v, 2654435761);
                  h2 = Math.imul(h2 ^ (v >>> 16), 1597334677);
                }}
                return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
              }}
              window.renderKoinobori = function(wind, t) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 760);
                const s = {{ ...cat.pose_defaults, asset: 'koinobori', height: 260, wind, id: 'k' }};
                RemakeVector.kit.RIG_DRAWERS['koinobori'](ctx, s, t, cat);
                ctx.restore();
                return hashPixels(ctx.getImageData(0, 0, 576, 1024).data);
              }};
            </script>
            </body></html>
            """)
            h1 = page.evaluate("() => renderKoinobori(0.0, 1.5)")
            h1_repeat = page.evaluate("() => renderKoinobori(0.0, 1.5)")
            self.assertEqual(h1, h1_repeat, "Koinobori render không tất định khi tua lại")
            h2 = page.evaluate("() => renderKoinobori(1.0, 1.5)")
            self.assertNotEqual(h1, h2, "Koinobori không thay đổi hình dạng khi có gió (wind=0 vs wind=1)")
            browser.close()

    def test_rendered_actor_bounding_box_sizes(self):
        """Quy tắc 15: Kiểm tra kích thước pixel thực tế khi render trên canvas.
        Đồ cầm tay >= 60 px, thú nhỏ/chim/cá >= 80 px, thú lớn >= 150 px."""
        from playwright.sync_api import sync_playwright
        from bkt_web.remake_vector import catalog, engine_sources

        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())

        actors_to_test = [
            # handheld / cultural props >= 60 px
            {"asset": "paper_lantern_jp", "height": 130, "min_size": 60, "kind": "prop"},
            {"asset": "school_bag_randoseru", "height": 140, "min_size": 60, "kind": "prop"},
            {"asset": "train_ticket_gate", "height": 140, "min_size": 90, "kind": "prop"},
            {"asset": "bamboo", "height": 260, "min_size": 180, "kind": "plant"},
            {"asset": "koinobori", "height": 280, "min_size": 180, "kind": "prop"},
            {"asset": "tanabata_bamboo", "height": 260, "min_size": 180, "kind": "prop"},
            # small beasts / birds / fish >= 80 px
            {"asset": "pheasant", "height": 120, "min_size": 80, "kind": "bird"},
            {"asset": "crab", "height": 110, "min_size": 80, "kind": "marine"},
            {"asset": "koi", "height": 100, "min_size": 80, "kind": "fish"},
            {"asset": "snow_monkey", "height": 140, "min_size": 80, "kind": "medium_animal"},
            # large beasts >= 150 px
            {"asset": "crane", "height": 220, "min_size": 150, "kind": "large_bird"},
            {"asset": "tanuki", "height": 180, "min_size": 150, "kind": "large_animal"},
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.measureActor = function(asset, height) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const k = height / 100;
                ctx.scale(k, k);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) throw new Error('No drawer for ' + asset);
                const s = {{ ...cat.pose_defaults, asset, height, id: 'test', style: {{}} }};
                drawer(ctx, s, 1.0, cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let minX = 576, maxX = -1, minY = 1024, maxY = -1;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const a = img[(y * 576 + x) * 4 + 3];
                    if (a > 10) {{
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }}
                  }}
                }}
                if (maxX < 0) return {{ w: 0, h: 0, maxDim: 0 }};
                const w = maxX - minX + 1, h = maxY - minY + 1;
                return {{ w, h, maxDim: Math.max(w, h) }};
              }};
            </script>
            </body></html>
            """)
            for item in actors_to_test:
                res = page.evaluate("args => measureActor(args[0], args[1])", [item["asset"], item["height"]])
                with self.subTest(asset=item["asset"]):
                    self.assertGreaterEqual(
                        res["maxDim"], item["min_size"],
                        f"{item['asset']} (cao {item['height']}) có kích thước pixel thực tế {res['w']}x{res['h']} (max={res['maxDim']}px) < ngưỡng {item['min_size']}px"
                    )
            browser.close()


class PhaseRTest(unittest.TestCase):
    """Plan §27 & Giai đoạn R: Văn hoá Hàn Quốc (kr_culture) - rigs, backgrounds, contacts, và stories."""
    _node = PackContractTest._node

    def test_every_kr_culture_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        kr_rigs = [
            "hangul_brush_scroll", "yut_sticks", "jegi", "gourd",
            "low_dining_table_kr", "sebae_cushion", "bokjumeoni",
            "swallow", "magpie"
        ]
        for rig in kr_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"], f"{rig} phải có trong catalog")
                self.assertEqual(cat["assets"][rig].get("pack"), "kr_culture")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIn("root", anchors, f"{rig} thiếu anchor root")
                self.assertIn("top", anchors, f"{rig} thiếu anchor top")

        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs} = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = new Proxy({}, {
  get: (o, k) => k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const rig of rigs) {
  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
  if (!drawer) {
    errors.push(`Thiếu drawer cho rig ${rig}`);
    continue;
  }
  const s = { ...cat.pose_defaults, asset: rig, height: 100, x: 288, y: 512, rotation: 0, flip: false, style: {} };
  try {
    drawer(ctx, s, 1.0, cat);
  } catch (e) {
    errors.push(`Lỗi khi vẽ ${rig}: ${e.message}`);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": kr_rigs})
        self.assertEqual(out, [], f"Các rig bị lỗi vẽ: {out}")

    def test_kr_culture_backgrounds_render_all_weathers_without_text(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        bgs = ["hanok_village", "joseon_palace_generic", "kr_market", "kr_school", "apartment_street"]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        V.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y, dirty: 0.5}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_tiger_and_persimmon_travel_distance_and_peaceful_ending(self):
        from bkt_web.remake_vector import catalog, tiger_and_persimmon_examples
        cat = catalog()
        story = tiger_and_persimmon_examples()[0]
        # Cảnh 1 có emote !
        sc1 = story["scenes"][0]
        emotes = [a["emote"] for a in sc1.get("actions", []) if a["type"] == "emote"]
        self.assertIn("!", emotes, "Hổ phải emote '!' khi giật mình sợ hãi")

        # Cảnh 2 hổ bỏ chạy xa >= 150 px
        sc2 = story["scenes"][1]
        keys = sc2["poses"]["tiger"]
        dx = abs(keys[-1]["x"] - keys[0]["x"])
        self.assertGreaterEqual(dx, 150.0, f"Hổ chạy {dx}px < 150px")

        # Không có hành động bạo lực (slash, charge, strike*)
        for sc in story["scenes"]:
            for a in sc.get("actions", []):
                atype = a["type"]
                self.assertNotIn(atype, ["slash", "charge", "strike", "strike_infected"], f"Không được có hành động bạo lực: {atype}")

    def test_kimchi_day_carry_together_hands_to_handles(self):
        from bkt_web.remake_vector import catalog, kimchi_day_examples
        cat = catalog()
        story = kimchi_day_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 1.5; t <= 5.0; t += 0.5) {
  const f = V.sample(story, cat, t);
  const jarL = V.worldAnchor(cat, f.states.jar, 'grip_l');
  const jarR = V.worldAnchor(cat, f.states.jar, 'grip_r');
  const momHand = V.worldAnchor(cat, f.states.mom, 'hand_r');
  const kidHand = V.worldAnchor(cat, f.states.kid, 'hand_l');
  rows.push({
    t,
    d_mom: Math.hypot(momHand.x - jarL.x, momHand.y - jarL.y),
    d_kid: Math.hypot(kidHand.x - jarR.x, kidHand.y - jarR.y)
  });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out:
            self.assertLess(item["d_mom"], 10.0, f"Tay mẹ lệch khỏi quai vại tại t={item['t']} ({item['d_mom']}px)")
            self.assertLess(item["d_kid"], 10.0, f"Tay bé lệch khỏi quai vại tại t={item['t']} ({item['d_kid']}px)")

    def test_seollal_morning_bow_lowers_head_and_holds_and_kite_rises(self):
        from bkt_web.remake_vector import catalog, seollal_morning_examples
        cat = catalog()
        story = seollal_morning_examples()[0]
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 5.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const head = V.worldAnchor(cat, f.states.kid, 'head_top');
  const hand = V.worldAnchor(cat, f.states.kid, 'hand_r');
  const pouch = V.worldAnchor(cat, f.states.pouch, 'grip');
  rows.push({
    t,
    head_y: head.y,
    d_pouch: Math.hypot(hand.x - pouch.x, hand.y - pouch.y)
  });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        standing_head_y = out[0]["head_y"]
        bowing_head_y = out[-1]["head_y"]
        head_drop = bowing_head_y - standing_head_y
        self.assertGreaterEqual(head_drop, 20.0, f"Động tác bow phải hạ thấp đầu >= 20px (thực tế: {head_drop}px)")

        # Kiểm tra giữ tư thế tới hết cảnh
        for item in out[8:]:  # t >= 4.5
            self.assertGreaterEqual(item["head_y"] - standing_head_y, 20.0, f"Bow phải giữ tới hết tại t={item['t']}")
            self.assertLess(item["d_pouch"], 3.0, f"Túi phúc lệch khỏi tay tại t={item['t']} ({item['d_pouch']}px)")

        # Cảnh 2 thả diều lên cao dần (y diều giảm đơn điệu)
        sc2 = story["scenes"][1]
        keys = sc2["poses"]["kite"]
        y_start = keys[0]["y"]
        y_end = keys[-1]["y"]
        self.assertLess(y_end, y_start - 100.0, f"Diều phải bay lên cao: y_start={y_start}, y_end={y_end}")

    def test_rain_gauge_fill_increases_monotonically_in_rain(self):
        from bkt_web.remake_vector import catalog, rain_gauge_examples
        cat = catalog()
        story = rain_gauge_examples()[0]
        for sc in story["scenes"]:
            self.assertEqual(sc.get("background", {}).get("weather"), "rain", "Cảnh đo mưa phải có weather: rain")

        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 0.5; t <= 9.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  rows.push({ t, fill: f.states.gauge.fill });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        prev_fill = -0.01
        for item in out:
            self.assertGreaterEqual(item["fill"], prev_fill - 1e-4, f"Mực nước không tăng đơn điệu tại t={item['t']}")
            prev_fill = item["fill"]
        self.assertGreaterEqual(out[-1]["fill"], 0.8, "Mực nước cuối phải đạt đầy ống đo")

    def test_all_emotes_in_stories_belong_to_emote_symbols(self):
        from bkt_web.remake_vector import (
            EMOTE_SYMBOLS,
            tiger_and_persimmon_examples,
            kimchi_day_examples,
            seollal_morning_examples,
            rain_gauge_examples
        )
        stories = [
            tiger_and_persimmon_examples()[0],
            kimchi_day_examples()[0],
            seollal_morning_examples()[0],
            rain_gauge_examples()[0]
        ]
        for story in stories:
            for sc in story["scenes"]:
                for a in sc.get("actions", []):
                    if a.get("type") == "emote":
                        emote_val = a.get("emote")
                        self.assertIn(emote_val, EMOTE_SYMBOLS, f"{story['id']}: emote '{emote_val}' không nằm trong EMOTE_SYMBOLS")

    def test_real_canvas_pixel_bounding_box_sizes(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())

        actors_to_test = [
            # handheld props >= 60 px
            {"asset": "hangul_brush_scroll", "height": 100, "min_size": 60, "kind": "prop"},
            {"asset": "yut_sticks", "height": 100, "min_size": 60, "kind": "prop"},
            {"asset": "jegi", "height": 100, "min_size": 60, "kind": "prop"},
            {"asset": "gourd", "height": 100, "min_size": 60, "kind": "prop"},
            {"asset": "bokjumeoni", "height": 100, "min_size": 60, "kind": "prop"},
            # small beasts / birds >= 80 px
            {"asset": "swallow", "height": 120, "min_size": 80, "kind": "bird"},
            {"asset": "magpie", "height": 120, "min_size": 80, "kind": "bird"},
            # furniture / cushions >= 100 px
            {"asset": "low_dining_table_kr", "height": 100, "min_size": 100, "kind": "furniture"},
            {"asset": "sebae_cushion", "height": 100, "min_size": 100, "kind": "furniture"},
            # large animals >= 180 px
            {"asset": "cartoon_tiger", "height": 200, "min_size": 180, "kind": "large_animal"},
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.measureActor = function(asset, height) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const k = height / 100;
                ctx.scale(k, k);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) throw new Error('No drawer for ' + asset);
                const s = {{ ...cat.pose_defaults, asset, height, id: 'test', style: {{}} }};
                drawer(ctx, s, 1.0, cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let minX = 576, maxX = -1, minY = 1024, maxY = -1;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const a = img[(y * 576 + x) * 4 + 3];
                    if (a > 10) {{
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }}
                  }}
                }}
                if (maxX < 0) return {{ w: 0, h: 0, maxDim: 0 }};
                const w = maxX - minX + 1, h = maxY - minY + 1;
                return {{ w, h, maxDim: Math.max(w, h) }};
              }};
            </script>
            </body></html>
            """)
            for item in actors_to_test:
                res = page.evaluate("args => measureActor(args[0], args[1])", [item["asset"], item["height"]])
                with self.subTest(asset=item["asset"]):
                    self.assertGreaterEqual(
                        res["maxDim"], item["min_size"],
                        f"{item['asset']} (cao {item['height']}) có kích thước pixel thực tế {res['w']}x{res['h']} (max={res['maxDim']}px) < ngưỡng {item['min_size']}px"
                    )
            browser.close()


class PhaseNTest(unittest.TestCase):
    """Plan §23 & Giai đoạn N: Trung cổ, hiệp sĩ, Viking (medieval) - rigs, backgrounds, contacts, và stories."""
    _node = PackContractTest._node

    def test_every_medieval_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        medieval_rigs = [
            "well", "anvil", "forge", "horseshoe",
            "spinning_wheel", "wool_basket", "banner_plain",
            "star_compass_viking", "viking_longhouse"
        ]
        for rig in medieval_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"], f"{rig} phải có trong catalog")
                self.assertEqual(cat["assets"][rig].get("pack"), "medieval")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIn("root", anchors, f"{rig} thiếu anchor root")
                self.assertIn("top", anchors, f"{rig} thiếu anchor top")
                # Rule 5: anchors không được vượt quá khung y < -100
                for aname, apos in anchors.items():
                    self.assertGreaterEqual(apos[1], -100.0, f"{rig}.{aname} y={apos[1]} vượt quá khung trên y < -100")

        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs} = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = new Proxy({}, {
  get: (o, k) => k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const rig of rigs) {
  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
  if (!drawer) {
    errors.push(`Thiếu drawer cho rig ${rig}`);
    continue;
  }
  const s = { ...cat.pose_defaults, asset: rig, height: 100, x: 288, y: 512, rotation: 0, flip: false, style: {} };
  try {
    drawer(ctx, s, 1.0, cat);
  } catch (e) {
    errors.push(`Lỗi khi vẽ ${rig}: ${e.message}`);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": medieval_rigs})
        self.assertEqual(out, [], f"Các rig bị lỗi vẽ: {out}")

    def test_medieval_backgrounds_render_all_weathers_without_text(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        bgs = ["castle_yard", "medieval_village", "viking_fjord"]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        V.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y, dirty: 0.5}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_castle_life_drawbridge_opens_and_travel_distance(self):
        from bkt_web.remake_vector import catalog, castle_life_examples
        cat = catalog()
        story = castle_life_examples()[0]
        # castle.open tăng 0 -> 1
        sc1 = story["scenes"][0]
        castle_keys = sc1["poses"]["castle"]
        self.assertLessEqual(castle_keys[0].get("open", 0.0), 0.05)  # 0.03: cầu còn dựng đứng che cổng
        self.assertEqual(castle_keys[-1].get("open", 0.0), 1.0)

        # xe/ngựa đi >= 150 px vào sân
        cart_keys = sc1["poses"]["cart"]
        dx_cart = abs(cart_keys[-1]["x"] - cart_keys[0]["x"])
        self.assertGreaterEqual(dx_cart, 150.0, f"Xe ngựa đi {dx_cart}px < 150px")

        horse_keys = sc1["poses"]["horse"]
        dx_horse = abs(horse_keys[-1]["x"] - horse_keys[0]["x"])
        self.assertGreaterEqual(dx_horse, 150.0, f"Ngựa đi {dx_horse}px < 150px")

        # không có action slash / charge / strike*
        for sc in story["scenes"]:
            for a in sc.get("actions", []):
                atype = a["type"]
                self.assertNotIn(atype, ["slash", "charge", "strike", "strike_infected"], f"Không được có hành động bạo lực: {atype}")

    def test_blacksmith_hammer_strikes_anvil_surface_and_forge_lit(self):
        from bkt_web.remake_vector import catalog, blacksmith_examples
        cat = catalog()
        story = blacksmith_examples()[0]

        # 1. forge.lit tăng đơn điệu ở Scene 1
        sc1 = story["scenes"][0]
        forge_keys = sc1["poses"]["forge"]
        lits = [k.get("lit", 0) for k in forge_keys]
        for i in range(len(lits) - 1):
            self.assertLessEqual(lits[i], lits[i+1], "forge.lit phải tăng đơn điệu")
        self.assertGreaterEqual(lits[-1], 0.9, "forge.lit cuối phải đạt >= 0.9")

        # 2. Đầu búa ↔ anvil.surface < 12 px ở các nhịp gõ (hammer_anvil)
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 5.5; t <= 9.5; t += 0.05) {
  const f = V.sample(story, cat, t);
  const hammerHead = V.worldAnchor(cat, f.states.hammer, 'head');
  const anvilSurf = V.worldAnchor(cat, f.states.anvil, 'surface');
  const d = Math.hypot(hammerHead.x - anvilSurf.x, hammerHead.y - anvilSurf.y);
  rows.push({ t: Math.round(t * 100) / 100, d });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})

        min_dists = [r["d"] for r in out]
        min_d = min(min_dists)
        self.assertLess(min_d, 12.0, f"Đầu búa không chạm mặt đe < 12px (min={min_d:.2f}px)")

        # 3. horseshoe trong tay (grip ↔ hand < 3 px) khi mang tới ngựa ở Scene 3
        out_carry = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 10.5; t <= 14.5; t += 0.5) {
  const f = V.sample(story, cat, t);
  const hand = V.worldAnchor(cat, f.states.smith, 'hand_r');
  const grip = V.worldAnchor(cat, f.states.horseshoe, 'grip');
  rows.push({ t, d: Math.hypot(hand.x - grip.x, hand.y - grip.y) });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out_carry:
            self.assertLess(item["d"], 3.0, f"Móng ngựa lệch khỏi tay tại t={item['t']} ({item['d']}px >= 3px)")

    def test_viking_voyage_longship_travel_and_star_compass(self):
        from bkt_web.remake_vector import catalog, viking_voyage_examples
        cat = catalog()
        story = viking_voyage_examples()[0]

        # 1. longship đi >= 150 px
        sc1 = story["scenes"][0]
        ship_keys = sc1["poses"]["ship"]
        dx_ship = abs(ship_keys[-1]["x"] - ship_keys[0]["x"])
        self.assertGreaterEqual(dx_ship, 150.0, f"Thuyền rồng đi {dx_ship}px < 150px")

        # 2. người chèo ngồi đúng ghế (ride trên seat_1)
        ride_actions = [a for a in sc1.get("actions", []) if a["type"] == "ride" and a.get("actor") == "rower"]
        self.assertTrue(len(ride_actions) > 0, "Thuỷ thủ chèo phải có action ride")
        self.assertEqual(ride_actions[0].get("seat"), "seat_1")

        # 3. star_compass_viking trong tay (grip ↔ hand < 3 px)
        out_compass = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (let t = 1.0; t <= 11.0; t += 2.0) {
  const f = V.sample(story, cat, t);
  const hand = V.worldAnchor(cat, f.states.navigator, 'hand_r');
  const grip = V.worldAnchor(cat, f.states.compass, 'grip');
  rows.push({ t, d: Math.hypot(hand.x - grip.x, hand.y - grip.y) });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out_compass:
            self.assertLess(item["d"], 3.0, f"La bàn lệch khỏi tay tại t={item['t']} ({item['d']}px >= 3px)")

        # 4. cảnh cuối có emote heart
        sc2 = story["scenes"][1]
        heart_emotes = [a for a in sc2.get("actions", []) if a.get("type") == "emote" and a.get("emote") == "heart"]
        self.assertTrue(len(heart_emotes) > 0, "Cảnh cuối phải có emote heart biểu hiện hoà bình hữu nghị")

    def test_all_emotes_and_outfits_valid(self):
        from bkt_web.remake_vector import (
            EMOTE_SYMBOLS,
            catalog,
            castle_life_examples,
            blacksmith_examples,
            viking_voyage_examples,
            village_fair_examples
        )
        cat = catalog()
        stories = [
            castle_life_examples()[0],
            blacksmith_examples()[0],
            viking_voyage_examples()[0],
            village_fair_examples()[0]
        ]
        for story in stories:
            for sc in story["scenes"]:
                for a in sc.get("actions", []):
                    if a.get("type") == "emote":
                        emote_val = a.get("emote")
                        self.assertIn(emote_val, EMOTE_SYMBOLS, f"{story['id']}: emote '{emote_val}' không nằm trong EMOTE_SYMBOLS")
            for char in story["characters"]:
                outfit = char.get("outfit")
                if outfit and outfit != "none":
                    asset_group = cat["assets"][char["asset"]].get("group")
                    self.assertEqual(asset_group, "chibi", f"Outfit '{outfit}' chỉ được dùng cho rig chibi, không phải {char['asset']}")
            for sc in story["scenes"]:
                for cid, keys in sc.get("poses", {}).items():
                    for k in keys:
                        outfit = k.get("outfit")
                        if outfit and outfit != "none":
                            cdef = next(c for c in story["characters"] if c["id"] == cid)
                            asset_group = cat["assets"][cdef["asset"]].get("group")
                            self.assertEqual(asset_group, "chibi", f"Outfit '{outfit}' trong pose chỉ được dùng cho rig chibi, không phải {cdef['asset']}")

    def test_real_canvas_pixel_bounding_box_sizes(self):
        """Đo bounding box pixel thật của mỗi đạo cụ/thú/xe chính ở ĐÚNG chiều cao story dùng (không tự đặt)."""
        from bkt_web.remake_vector import catalog, engine_sources
        from bkt_web.remake_vector import castle_life_examples, blacksmith_examples, viking_voyage_examples, village_fair_examples
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        used = {}
        for story in castle_life_examples() + blacksmith_examples() + viking_voyage_examples() + village_fair_examples():
            assets = {c["id"]: c["asset"] for c in story["characters"]}
            for sc in story["scenes"]:
                for cid, keys in sc["poses"].items():
                    for k in keys:
                        used[assets[cid]] = min(used.get(assets[cid], 10 ** 6), k["height"])
        thresholds = {
            "horseshoe": 60, "star_compass_viking": 60, "wooden_shield": 60, "toy_sword": 60, "hammer": 60, "lantern_star": 60,
            "anvil": 100, "well": 100, "forge": 100, "spinning_wheel": 100, "wool_basket": 60, "viking_longhouse": 100,
            "horse": 180, "longship": 250, "horse_cart": 150,
        }
        actors_to_test = [{"asset": a, "height": used[a], "min_size": m} for a, m in thresholds.items()]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.measureActor = function(asset, height) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const k = height / 100;
                ctx.scale(k, k);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) throw new Error('No drawer for ' + asset);
                const s = {{ ...cat.pose_defaults, asset, height, id: 'test', style: {{}} }};
                drawer(ctx, s, 1.0, cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let minX = 576, maxX = -1, minY = 1024, maxY = -1;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const a = img[(y * 576 + x) * 4 + 3];
                    if (a > 10) {{
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }}
                  }}
                }}
                if (maxX < 0) return {{ w: 0, h: 0, maxDim: 0 }};
                const w = maxX - minX + 1, h = maxY - minY + 1;
                return {{ w, h, maxDim: Math.max(w, h) }};
              }};
            </script>
            </body></html>
            """)
            for item in actors_to_test:
                res = page.evaluate("args => measureActor(args[0], args[1])", [item["asset"], item["height"]])
                with self.subTest(asset=item["asset"]):
                    self.assertGreaterEqual(
                        res["maxDim"], item["min_size"],
                        f"{item['asset']} (cao {item['height']}) có kích thước pixel thực tế {res['w']}x{res['h']} (max={res['maxDim']}px) < ngưỡng {item['min_size']}px"
                    )
            browser.close()


class PhaseSTest(unittest.TestCase):
    """Plan §28 & Giai đoạn S: Gói văn hoá Mỹ (us_culture) - rigs, backgrounds, contacts, và stories."""
    _node = PackContractTest._node

    def test_every_us_culture_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        us_rigs = [
            "bison", "bear", "prairie_dog", "raccoon", "salmon",
            "jack_o_lantern", "harvest_basket", "lemonade_stand", "mailbox",
            "fire_hydrant", "liberty_statue_generic", "railroad_track",
            "moon_footprint", "seismometer"
        ]
        for rig in us_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"], f"{rig} phải có trong catalog")
                self.assertEqual(cat["assets"][rig].get("pack"), "us_culture")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIn("root", anchors, f"{rig} thiếu anchor root")
                self.assertIn("top", anchors, f"{rig} thiếu anchor top")
                # Rule 5: anchors không được vượt quá khung y < -100
                for aname, apos in anchors.items():
                    self.assertGreaterEqual(apos[1], -100.0, f"{rig}.{aname} y={apos[1]} vượt quá khung trên y < -100")

        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs} = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = new Proxy({}, {
  get: (o, k) => k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const rig of rigs) {
  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
  if (!drawer) {
    errors.push(`Thiếu drawer cho rig ${rig}`);
    continue;
  }
  const s = { ...cat.pose_defaults, asset: rig, height: 100, x: 288, y: 512, rotation: 0, flip: false, style: {} };
  try {
    drawer(ctx, s, 1.0, cat);
  } catch (e) {
    errors.push(`Lỗi khi vẽ ${rig}: ${e.message}`);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": us_rigs})
        self.assertEqual(out, [], f"Các rig bị lỗi vẽ: {out}")

    def test_us_culture_backgrounds_render_all_weathers_without_text(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        bgs = [
            "suburb_backyard", "national_park", "wild_west_town",
            "launch_pad", "pumpkin_patch", "moon_surface"
        ]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        V.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y, dirty: 0.5}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_apollo_11_story(self):
        from bkt_web.remake_vector import catalog, apollo_11_examples
        cat = catalog()
        story = apollo_11_examples()[0]

        # 1. Tên lửa bay lên >= 300 px
        sc1 = story["scenes"][0]
        rocket_poses = sc1["poses"]["rocket"]
        dy_rocket = abs(rocket_poses[-1]["y"] - rocket_poses[0]["y"])
        self.assertGreaterEqual(dy_rocket, 300.0, f"Tên lửa bay lên {dy_rocket}px < 300px")

        # 2. Phi hành gia mặc outfit astronaut
        astro_char = next(c for c in story["characters"] if c["id"] == "astronaut")
        self.assertEqual(astro_char.get("outfit"), "astronaut")
        self.assertEqual(cat["assets"][astro_char["asset"]]["group"], "chibi")

        # 3. Mô-đun hạ cánh chạm ground_y của moon_surface (810)
        sc2 = story["scenes"][1]
        lander_poses = sc2["poses"]["lander"]
        self.assertEqual(lander_poses[-1]["y"], 810.0, "Lander phải chạm ground_y=810")

    def test_thanksgiving_harvest_story(self):
        from bkt_web.remake_vector import catalog, thanksgiving_harvest_examples
        cat = catalog()
        story = thanksgiving_harvest_examples()[0]

        # 1. Bí ngô bỏ vào giỏ: grip/anchor < 12 px
        sc1 = story["scenes"][0]
        out_contact = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const f = V.sample(story, cat, 2.0);
const pRoot = V.worldAnchor(cat, f.states.pumpkin, 'root');
const bOpen = V.worldAnchor(cat, f.states.basket, 'opening');
const d = Math.hypot(pRoot.x - bOpen.x, pRoot.y - bOpen.y);
console.log(JSON.stringify({d}));""", {"story": story, "cat": cat})
        self.assertLess(out_contact["d"], 12.0, f"Bí ngô cách miệng giỏ {out_contact['d']}px >= 12px")

        # 2. Cảnh 2 có roast_turkey và apple_pie
        sc2 = story["scenes"][1]
        self.assertIn("turkey", sc2["poses"])
        self.assertIn("pie", sc2["poses"])

        # 3. Cảnh cuối có emote heart
        emotes = [a for a in sc2.get("actions", []) if a.get("type") == "emote" and a.get("emote") == "heart"]
        self.assertTrue(len(emotes) > 0, "Cảnh cuối phải có emote heart")

    def test_gold_rush_story(self):
        from bkt_web.remake_vector import catalog, gold_rush_examples
        cat = catalog()
        story = gold_rush_examples()[0]

        # 1. Chảo đãi vàng trong tay: grip <-> hand < 3 px
        out_pan = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = [];
for (const t of [0.5, 1.5, 2.5, 3.5]) {
  const f = V.sample(story, cat, t);
  const hand = V.worldAnchor(cat, f.states.cowboy, 'hand_r');
  const grip = V.worldAnchor(cat, f.states.pan, 'grip');
  rows.push({ t, d: Math.hypot(hand.x - grip.x, hand.y - grip.y) });
}
console.log(JSON.stringify(rows));""", {"story": story, "cat": cat})
        for item in out_pan:
            self.assertLess(item["d"], 3.0, f"Chảo vàng lệch khỏi tay tại t={item['t']} ({item['d']}px >= 3px)")

        # 2. Chảo lắc (rotation thay đổi giữa các keyframes)
        sc1 = story["scenes"][0]
        rots = [k.get("rotation", 0) for k in sc1["poses"]["pan"]]
        self.assertGreater(max(rots) - min(rots), 15.0, "Chảo phải có cử động lắc (rotation thay đổi)")

        # 3. Xe ngựa và ngựa đi >= 150 px
        sc2 = story["scenes"][1]
        wagon_poses = sc2["poses"]["wagon"]
        dx_wagon = abs(wagon_poses[-1]["x"] - wagon_poses[0]["x"])
        self.assertGreaterEqual(dx_wagon, 150.0, f"Wagon đi {dx_wagon}px < 150px")

        horse_poses = sc2["poses"]["horse"]
        dx_horse = abs(horse_poses[-1]["x"] - horse_poses[0]["x"])
        self.assertGreaterEqual(dx_horse, 150.0, f"Ngựa đi {dx_horse}px < 150px")

    def test_johnny_appleseed_story(self):
        from bkt_web.remake_vector import catalog, johnny_appleseed_examples
        cat = catalog()
        story = johnny_appleseed_examples()[0]

        # 1. Cây táo tăng trưởng đơn điệu trong cảnh 1
        sc1 = story["scenes"][0]
        tree_growths = [k.get("growth", 0.0) for k in sc1["poses"]["apple_tree"]]
        for i in range(len(tree_growths) - 1):
            self.assertLessEqual(tree_growths[i], tree_growths[i + 1], "Độ lớn của cây phải tăng đơn điệu")

        # 2. Nhân vật Johnny đi >= 150 px ở mỗi cảnh
        dx_sc1 = abs(sc1["poses"]["johnny"][-1]["x"] - sc1["poses"]["johnny"][0]["x"])
        self.assertGreaterEqual(dx_sc1, 150.0, f"Johnny cảnh 1 đi {dx_sc1}px < 150px")

        sc2 = story["scenes"][1]
        dx_sc2 = abs(sc2["poses"]["johnny"][-1]["x"] - sc2["poses"]["johnny"][0]["x"])
        self.assertGreaterEqual(dx_sc2, 150.0, f"Johnny cảnh 2 đi {dx_sc2}px < 150px")

        # 3. Động tác pick lấy đúng quả táo cuối cùng
        pick_actions = [a for a in sc2.get("actions", []) if a.get("type") == "pick"]
        self.assertTrue(len(pick_actions) > 0, "Thiếu động tác pick quả táo")
        self.assertEqual(pick_actions[0]["target_anchor"], "fruit_6", "Phải hái đúng quả cuối cùng trên cây")

    def test_compliance_no_flags_valid_emotes_outfits_no_autoframe(self):
        from bkt_web.remake_vector import (
            EMOTE_SYMBOLS,
            catalog,
            apollo_11_examples,
            thanksgiving_harvest_examples,
            gold_rush_examples,
            johnny_appleseed_examples
        )
        cat = catalog()
        stories = [
            apollo_11_examples()[0],
            thanksgiving_harvest_examples()[0],
            gold_rush_examples()[0],
            johnny_appleseed_examples()[0]
        ]
        for story in stories:
            # Không được gọi auto_frame
            for sc in story["scenes"]:
                self.assertNotIn("camera", sc, f"{story['id']}: không được gọi auto_frame")
                for a in sc.get("actions", []):
                    if a.get("type") == "emote":
                        emote_val = a.get("emote")
                        self.assertIn(emote_val, EMOTE_SYMBOLS, f"{story['id']}: emote '{emote_val}' không nằm trong EMOTE_SYMBOLS")
            for char in story["characters"]:
                outfit = char.get("outfit")
                if outfit and outfit != "none":
                    asset_group = cat["assets"][char["asset"]].get("group")
                    self.assertEqual(asset_group, "chibi", f"Outfit '{outfit}' chỉ được dùng cho rig chibi, không phải {char['asset']}")
                # Không asset cờ
                self.assertNotIn("flag", char["asset"].lower())

    def test_deterministic_fireworks_hash(self):
        """Pháo hoa tất định: render cùng thời gian t cho cùng hash."""
        from bkt_web.remake_vector import catalog, engine_sources
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              function hashPixels(data) {{
                let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
                for (let i = 0; i < data.length; i += 4) {{
                  const v = (data[i] << 24) | (data[i+1] << 16) | (data[i+2] << 8) | data[i+3];
                  h1 = Math.imul(h1 ^ v, 2654435761);
                  h2 = Math.imul(h2 ^ (v >>> 16), 1597334677);
                }}
                return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
              }}
              window.renderFireworksAt = function(t) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                const snapshot = {{
                  t,
                  actions: [{{ active: true, type: 'fireworks', start: 0, end: 10 }}],
                  states: {{}},
                  scene: {{ fireworks: true }}
                }};
                const ef = RemakeVector.kit.CUSTOM_EFFECTS || [];
                for (const f of ef) f(ctx, snapshot, window.cat, RemakeVector.kit);
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                return hashPixels(img);
              }};
            </script>
            </body></html>
            """)
            hash1 = page.evaluate("renderFireworksAt(1.5)")
            hash2 = page.evaluate("renderFireworksAt(1.5)")
            self.assertEqual(hash1, hash2, f"Pháo hoa tại cùng t=1.5 phải cho cùng hash: {hash1} vs {hash2}")
            browser.close()

    def test_real_canvas_pixel_bounding_box_sizes(self):
        """Đo bounding box pixel thật của mỗi đạo cụ/thú/xe chính ở ĐÚNG chiều cao story dùng."""
        from bkt_web.remake_vector import (
            catalog,
            engine_sources,
            apollo_11_examples,
            thanksgiving_harvest_examples,
            gold_rush_examples,
            johnny_appleseed_examples
        )
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        used = {}
        for story in apollo_11_examples() + thanksgiving_harvest_examples() + gold_rush_examples() + johnny_appleseed_examples():
            assets = {c["id"]: c["asset"] for c in story["characters"]}
            for sc in story["scenes"]:
                for cid, keys in sc["poses"].items():
                    for k in keys:
                        used[assets[cid]] = min(used.get(assets[cid], 10 ** 6), k["height"])

        thresholds = {
            "gold_pan": 60, "jack_o_lantern": 60, "harvest_basket": 60,
            "seismometer": 60, "moon_footprint": 20,  # vết in nhỏ hơn chiếc ủng (~30 px), không phải đồ cầm tay "seed": 60, "apple_pie": 60, "roast_turkey": 60,
            "horse": 180, "covered_wagon": 150, "lunar_lander": 180, "rocket": 300,
            "bison": 180, "bear": 180, "prairie_dog": 80, "raccoon": 80, "salmon": 80,
            "lemonade_stand": 100, "mailbox": 100, "fire_hydrant": 60,
            "liberty_statue_generic": 100, "railroad_track": 80,
        }
        # Thêm chiều cao cho các rig chưa có trong story
        default_heights = {
            "bison": 240, "bear": 240, "prairie_dog": 160, "raccoon": 150, "salmon": 120,
            "jack_o_lantern": 140, "lemonade_stand": 220, "mailbox": 160, "fire_hydrant": 140,
            "liberty_statue_generic": 300, "railroad_track": 150
        }
        for a, h in default_heights.items():
            if a not in used:
                used[a] = h

        actors_to_test = [{"asset": a, "height": used[a], "min_size": m} for a, m in thresholds.items()]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.measureActor = function(asset, height) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const k = height / 100;
                ctx.scale(k, k);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) throw new Error('No drawer for ' + asset);
                const rest = (cat.assets[asset] && cat.assets[asset].rest_pose) || {{}};
                const s = {{ ...cat.pose_defaults, ...rest, asset, height, id: 'test', style: {{}} }};
                drawer(ctx, s, 1.0, cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let minX = 576, maxX = -1, minY = 1024, maxY = -1;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const a = img[(y * 576 + x) * 4 + 3];
                    if (a > 10) {{
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }}
                  }}
                }}
                if (maxX < 0) return {{ w: 0, h: 0, maxDim: 0 }};
                const w = maxX - minX + 1, h = maxY - minY + 1;
                return {{ w, h, maxDim: Math.max(w, h) }};
              }};
            </script>
            </body></html>
            """)
            for item in actors_to_test:
                res = page.evaluate("args => measureActor(args[0], args[1])", [item["asset"], item["height"]])
                with self.subTest(asset=item["asset"]):
                    self.assertGreaterEqual(
                        res["maxDim"], item["min_size"],
                        f"{item['asset']} (cao {item['height']}) có kích thước pixel thực tế {res['w']}x{res['h']} (max={res['maxDim']}px) < ngưỡng {item['min_size']}px"
                    )
            browser.close()


class PhaseTTest(unittest.TestCase):
    """Plan §29 & Giai đoạn T: Thiên nhiên, vũ trụ và khoa học (nature, space) - rigs, backgrounds, contacts, và stories."""
    _node = PackContractTest._node

    def test_every_nature_and_space_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        phase_t_rigs = [
            # Space pack (6 rigs)
            "planet", "sun", "moon", "comet", "satellite", "space_station",
            # Nature pack (10 rigs)
            "cloud", "raindrop_chibi", "rainbow", "volcano", "earth_cutaway", "fossil",
            "lever", "pulley", "ramp", "wheel_axle"
        ]
        for rig in phase_t_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"], f"{rig} phải có trong catalog")
                pack = cat["assets"][rig].get("pack")
                self.assertIn(pack, ("space", "nature"), f"{rig} pack phải là space hoặc nature, nhận {pack}")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIn("root", anchors, f"{rig} thiếu anchor root")
                self.assertIn("top", anchors, f"{rig} thiếu anchor top")
                # Rule 5: anchors không được vượt quá khung y < -100
                for aname, apos in anchors.items():
                    self.assertGreaterEqual(apos[1], -100.0, f"{rig}.{aname} y={apos[1]} vượt quá khung trên y < -100")

        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs} = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = new Proxy({}, {
  get: (o, k) => k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const rig of rigs) {
  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
  if (!drawer) {
    errors.push(`Thiếu drawer cho rig ${rig}`);
    continue;
  }
  const s = { ...cat.pose_defaults, asset: rig, height: 100, x: 288, y: 512, rotation: 0, flip: false, style: {} };
  try {
    drawer(ctx, s, 1.0, cat);
  } catch (e) {
    errors.push(`Lỗi khi vẽ ${rig}: ${e.message}`);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": phase_t_rigs})
        self.assertEqual(out, [], f"Các rig bị lỗi vẽ: {out}")

    def test_nature_and_space_backgrounds_render_all_weathers_without_text(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        bgs = [
            "space_orbit", "mars_surface",
            "water_cycle_valley", "volcano_island", "dig_site"
        ]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        V.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y, dirty: 0.5}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_planet_8_specs_distinct_hashes_and_unknown_throws(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        planets = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]
        out = self._node(r"""
globalThis.Path2D = class { constructor() {} addPath() {} };
const { cat, planets } = JSON.parse(fs.readFileSync(0, 'utf8'));
const drawer = RemakeVector.kit.RIG_DRAWERS['planet'];
const crypto = require('crypto');
const hashes = {};
for (const p of planets) {
  const opList = [];
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: (...args) => opList.push(['gradStop', ...args]) });
      return (...args) => opList.push([k, ...args]);
    },
    set: (o, k, v) => { opList.push(['set', k, v]); return true; }
  });
  const s = { ...cat.pose_defaults, asset: 'planet', height: 100, x: 288, y: 512, variant: p, style: {} };
  drawer(ctx, s, 1.0, cat);
  const h = crypto.createHash('sha256').update(JSON.stringify(opList)).digest('hex');
  hashes[p] = h;
}
let unknownThrew = false;
try {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  drawer(ctx, { ...cat.pose_defaults, asset: 'planet', height: 100, variant: 'krypton', style: {} }, 1.0, cat);
} catch (e) {
  unknownThrew = true;
}
console.log(JSON.stringify({ hashes, unknownThrew }));
""", {"cat": cat, "planets": planets})
        hashes = out["hashes"]
        self.assertEqual(len(hashes), 8)
        self.assertEqual(len(set(hashes.values())), 8, "8 hành tinh phải có hình vẽ và hash phân biệt")
        self.assertTrue(out["unknownThrew"], "Variant hành tinh không xác định phải throw lỗi")

    def test_moon_phases_brightness_and_directions(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.testMoon = function() {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                const drawer = RemakeVector.kit.RIG_DRAWERS['moon'];
                const results = {{}};
                for (const phase of [0.0, 0.25, 0.5, 0.75, 1.0]) {{
                  ctx.clearRect(0, 0, 576, 1024);
                  ctx.save();
                  ctx.translate(288, 512);
                  const s = {{ ...cat.pose_defaults, asset: 'moon', height: 100, phase, style: {{}} }};
                  drawer(ctx, s, 1.0, cat);
                  ctx.restore();
                  const img = ctx.getImageData(288 - 50, 512 - 100, 100, 100).data;
                  let brightCount = 0, sumX = 0;
                  for (let y = 0; y < 100; y++) {{
                    for (let x = 0; x < 100; x++) {{
                      const r = img[(y * 100 + x) * 4];
                      const g = img[(y * 100 + x) * 4 + 1];
                      const a = img[(y * 100 + x) * 4 + 3];
                      if (a > 50 && r > 200 && g > 200) {{
                        brightCount++;
                        sumX += x;
                      }}
                    }}
                  }}
                  const meanX = brightCount > 0 ? sumX / brightCount : 50;
                  results[phase] = {{ brightCount, meanX }};
                }}
                return results;
              }};
            </script>
            </body></html>
            """)
            res = page.evaluate("testMoon()")
            browser.close()

            # phase 0 và 1 tối hoàn toàn
            self.assertEqual(res["0"]["brightCount"], 0)
            self.assertEqual(res["1"]["brightCount"], 0)
            # phase 0.5 sáng tròn đầy nhất
            self.assertGreater(res["0.5"]["brightCount"], 2500)
            # phase 0.25 và 0.75 sáng ở 2 phía ngược nhau
            self.assertGreater(res["0.25"]["brightCount"], 1000)
            self.assertGreater(res["0.75"]["brightCount"], 1000)
            self.assertGreater(res["0.25"]["meanX"], 55.0, "Pha 0.25 (trăng thượng huyền) phải sáng phía bên phải (meanX > 55)")
            self.assertLess(res["0.75"]["meanX"], 45.0, "Pha 0.75 (trăng hạ huyền) phải sáng phía bên trái (meanX < 45)")

    def test_water_cycle_story(self):
        from bkt_web.remake_vector import catalog, water_cycle_examples
        story = water_cycle_examples()[0]
        # 1. Giọt nước bay lên dy >= 300 px ở cảnh 1
        sc1 = story["scenes"][0]
        drop_poses_1 = sc1["poses"]["drop"]
        dy_drop = abs(drop_poses_1[-1]["y"] - drop_poses_1[0]["y"])
        self.assertGreaterEqual(dy_drop, 300.0, f"Giọt nước bốc hơi bay lên {dy_drop}px < 300px")

        # 2. Cảnh 2: mây mưa cloud.rain tăng 0 -> 1
        sc2 = story["scenes"][1]
        rain_vals = [k.get("rain", 0.0) for k in sc2["poses"]["cloud"]]
        self.assertEqual(rain_vals[0], 0.0)
        self.assertEqual(rain_vals[-1], 1.0)
        for i in range(len(rain_vals) - 1):
            self.assertLessEqual(rain_vals[i], rain_vals[i + 1])

        # 3. Cảnh 3: cầu vồng rainbow.growth tăng ở cảnh cuối
        sc3 = story["scenes"][2]
        growth_vals = [k.get("growth", 0.0) for k in sc3["poses"]["rainbow"]]
        self.assertEqual(growth_vals[0], 0.0)
        self.assertEqual(growth_vals[-1], 1.0)
        for i in range(len(growth_vals) - 1):
            self.assertLessEqual(growth_vals[i], growth_vals[i + 1])

    def test_volcano_story(self):
        from bkt_web.remake_vector import catalog, volcano_examples
        story = volcano_examples()[0]
        # 1. Núi lửa erupt tăng đơn điệu ở cảnh 2
        sc2 = story["scenes"][1]
        erupt_vals = [k.get("erupt", 0.0) for k in sc2["poses"]["volcano"]]
        self.assertEqual(erupt_vals[0], 0.0)
        self.assertEqual(erupt_vals[-1], 1.0)
        for i in range(len(erupt_vals) - 1):
            self.assertLessEqual(erupt_vals[i], erupt_vals[i + 1])

        # 2. Nhà khoa học quan sát cách miệng núi lửa >= 200 px suốt story
        for sc in story["scenes"]:
            volcano_x = sc["poses"]["volcano"][0]["x"]
            for pose in sc["poses"]["scientist"]:
                dist = abs(pose["x"] - volcano_x)
                self.assertGreaterEqual(dist, 200.0, f"Khoảng cách quan sát an toàn {dist}px < 200px")

    def test_dino_dig_story(self):
        from bkt_web.remake_vector import catalog, dino_dig_examples
        cat = catalog()
        story = dino_dig_examples()[0]
        # 1. fossil.exposed tăng 0 -> 1 trong cảnh 1
        sc1 = story["scenes"][0]
        exposed_vals = [k.get("exposed", 0.0) for k in sc1["poses"]["fossil"]]
        self.assertEqual(exposed_vals[0], 0.0)
        self.assertEqual(exposed_vals[-1], 1.0)
        for i in range(len(exposed_vals) - 1):
            self.assertLessEqual(exposed_vals[i], exposed_vals[i + 1])

        # 2. Xẻng cầm trong tay: grip <-> hand_r < 3 px
        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const f = V.sample(story, cat, 2.0);
const hand = V.worldAnchor(cat, f.states.paleo, 'hand_r');
const grip = V.worldAnchor(cat, f.states.shovel, 'grip');
const d = Math.hypot(hand.x - grip.x, hand.y - grip.y);
console.log(JSON.stringify({ d }));
""", {"story": story, "cat": cat})
        self.assertLess(out["d"], 3.0, f"Xẻng không nằm đúng trong tay (lệch {out['d']}px >= 3px)")

        # 3. Cảnh 2 có trex xuất hiện với emote heart thân thiện
        sc2 = story["scenes"][1]
        self.assertIn("trex", sc2["poses"])
        emotes = [a for a in sc2.get("actions", []) if a.get("type") == "emote" and a.get("emote") == "heart"]
        self.assertTrue(len(emotes) > 0, "Cảnh sau phải có khủng long T-rex với emote heart thân thiện")

    def test_solar_system_tour_story(self):
        from bkt_web.remake_vector import catalog, solar_system_tour_examples
        story = solar_system_tour_examples()[0]
        expected_order = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]
        actual_order = []
        for p_id in ["p1", "p2", "p3", "p4"]:
            actual_order.append(story["scenes"][0]["poses"][p_id][0]["variant"])
        for p_id in ["p5", "p6", "p7", "p8"]:
            actual_order.append(story["scenes"][1]["poses"][p_id][0]["variant"])
        self.assertEqual(actual_order, expected_order, "Thứ tự hành tinh phải đúng chuẩn từ Sao Thuỷ tới Sao Hải Vương")

        # Tàu di chuyển >= 150 px trong mỗi cảnh
        for idx, sc in enumerate(story["scenes"]):
            poses = sc["poses"]["ship"]
            dx = abs(poses[-1]["x"] - poses[0]["x"])
            self.assertGreaterEqual(dx, 150.0, f"Tàu ở cảnh {idx+1} phải bay >= 150px (đạt {dx}px)")

    def test_simple_machines_story(self):
        from bkt_web.remake_vector import catalog, simple_machines_examples
        story = simple_machines_examples()[0]
        # 1. Đòn bẩy tilt đổi chiều
        sc1 = story["scenes"][0]
        tilts = [k.get("tilt", 0.0) for k in sc1["poses"]["lever"]]
        # tilt dương = đầu phải (load_point) hạ; bé ấn đầu trái xuống → tilt âm, đầu phải nâng tảng đá lên.
        self.assertGreater(tilts[0], 0.0, "Ban đầu tảng đá nằm ở đầu phải đang hạ (tilt > 0)")
        self.assertLess(tilts[-1], 0.0, "Sau khi ấn đầu trái, đầu phải nâng lên (tilt < 0)")
        import math
        lev = sc1["poses"]["lever"]; stone = sc1["poses"]["stone"]
        load = catalog()["assets"]["lever"]["anchors"]["load_point"]
        for lk, sk in zip(lev, stone):
            k, r = lk["height"] / 100, math.radians(lk["tilt"])
            ex = lk["x"] + load[0] * k * math.cos(r)
            ey = lk["y"] + load[1] * k + load[0] * k * math.sin(r)
            self.assertLess(math.hypot(sk["x"] - ex, sk["y"] - ey), 3, f"Tảng đá không nằm trên đầu đòn bẩy tại t={lk['time']}")
        self.assertLess(stone[-1]["y"], stone[0]["y"] - 30, "Tảng đá phải được nâng lên ≥ 30 px")

        # 2. Ròng rọc lift tăng 0 -> 1
        sc2 = story["scenes"][1]
        lifts = [k.get("lift", 0.0) for k in sc2["poses"]["pulley"]]
        self.assertEqual(lifts[0], 0.0)
        self.assertEqual(lifts[-1], 1.0)

    def test_deterministic_effects(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        out = self._node(r"""
globalThis.Path2D = class { constructor() {} addPath() {} };
const { cat } = JSON.parse(fs.readFileSync(0, 'utf8'));
const crypto = require('crypto');
function hashEffect(effectName, t) {
  const opList = [];
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: (...args) => opList.push(['gradStop', ...args]) });
      return (...args) => opList.push([k, ...args]);
    },
    set: (o, k, v) => { opList.push(['set', k, v]); return true; }
  });
  const snapshot = {
    t,
    actions: [{ active: true, type: effectName, start: 0, end: 10 }],
    states: { drop: { x: 288, y: 512, height: 100 } }
  };
  const ef = RemakeVector.kit.CUSTOM_EFFECTS || [];
  for (const f of ef) f(ctx, snapshot, cat, RemakeVector.kit);
  return crypto.createHash('sha256').update(JSON.stringify(opList)).digest('hex');
}
const h1_evap = hashEffect('evaporate', 2.5);
const h2_evap = hashEffect('evaporate', 2.5);
const h1_cond = hashEffect('condense', 2.5);
const h2_cond = hashEffect('condense', 2.5);
console.log(JSON.stringify({ evapEqual: h1_evap === h2_evap, condEqual: h1_cond === h2_cond }));
""", {"cat": cat})
        self.assertTrue(out["evapEqual"], "Hiệu ứng evaporate cùng t phải cho cùng hash")
        self.assertTrue(out["condEqual"], "Hiệu ứng condense cùng t phải cho cùng hash")

    def test_emotes_outfits_auto_frame_compliance(self):
        from bkt_web.remake_vector import (
            EMOTE_SYMBOLS,
            catalog,
            water_cycle_examples,
            moon_phases_examples,
            volcano_examples,
            dino_dig_examples,
            solar_system_tour_examples,
            simple_machines_examples
        )
        cat = catalog()
        stories = [
            water_cycle_examples()[0],
            moon_phases_examples()[0],
            volcano_examples()[0],
            dino_dig_examples()[0],
            solar_system_tour_examples()[0],
            simple_machines_examples()[0]
        ]
        for story in stories:
            for sc in story["scenes"]:
                self.assertNotIn("camera", sc, f"{story['id']}: không được gọi auto_frame")
                for a in sc.get("actions", []):
                    if a.get("type") == "emote":
                        emote_val = a.get("emote")
                        self.assertIn(emote_val, EMOTE_SYMBOLS, f"{story['id']}: emote '{emote_val}' không nằm trong EMOTE_SYMBOLS")
            for char in story["characters"]:
                outfit = char.get("outfit")
                if outfit and outfit != "none":
                    asset_group = cat["assets"][char["asset"]].get("group")
                    self.assertEqual(asset_group, "chibi", f"Outfit '{outfit}' chỉ được mặc cho rig chibi, không phải {char['asset']}")

    def test_no_rig_draws_at_y_less_than_minus_100(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        rigs = [
            "planet", "sun", "moon", "comet", "satellite", "space_station",
            "cloud", "raindrop_chibi", "rainbow", "volcano", "earth_cutaway", "fossil",
            "lever", "pulley", "ramp", "wheel_axle"
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.checkMinY = function() {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                const results = {{}};
                for (const rig of {json.dumps(rigs)}) {{
                  ctx.clearRect(0, 0, 576, 1024);
                  ctx.save();
                  ctx.translate(288, 512);
                  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
                  const s = {{ ...cat.pose_defaults, asset: rig, height: 100, erupt: 1.0, rain: 1.0, storm: 1.0, exposed: 1.0, style: {{}} }};
                  drawer(ctx, s, 1.0, cat);
                  ctx.restore();
                  const img = ctx.getImageData(0, 0, 576, 1024).data;
                  let minY = 1024;
                  for (let y = 0; y < 1024; y++) {{
                    for (let x = 0; x < 576; x++) {{
                      const a = img[(y * 576 + x) * 4 + 3];
                      if (a > 10) {{
                        if (y < minY) minY = y;
                      }}
                    }}
                  }}
                  results[rig] = minY - 512;
                }}
                return results;
              }};
            </script>
            </body></html>
            """)
            res = page.evaluate("checkMinY()")
            browser.close()
            for rig, rel_y in res.items():
                with self.subTest(rig=rig):
                    self.assertGreaterEqual(rel_y, -100, f"{rig} vẽ vượt quá khung trên với y={rel_y} < -100")

    def test_real_canvas_pixel_bounding_box_sizes(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        actors_to_test = [
            {"asset": "telescope", "height": 160, "min_size": 60},
            {"asset": "thermometer", "height": 150, "min_size": 60},
            {"asset": "shovel", "height": 90, "min_size": 60},
            {"asset": "lever", "height": 180, "min_size": 100},
            {"asset": "pulley", "height": 200, "min_size": 100},
            {"asset": "ramp", "height": 180, "min_size": 100},
            {"asset": "wheel_axle", "height": 180, "min_size": 100},
            {"asset": "fossil", "height": 130, "min_size": 100},
            {"asset": "earth_cutaway", "height": 200, "min_size": 100},
            {"asset": "satellite", "height": 160, "min_size": 100},
            {"asset": "space_station", "height": 220, "min_size": 100},
            {"asset": "volcano", "height": 280, "min_size": 250},
            {"asset": "planet", "variant": "jupiter", "height": 160, "min_size": 120},
            {"asset": "planet", "variant": "saturn", "height": 150, "min_size": 120},
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.measureActor = function(asset, height, variant) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const k = height / 100;
                ctx.scale(k, k);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) throw new Error('No drawer for ' + asset);
                const s = {{ ...cat.pose_defaults, asset, height, variant, id: 'test', style: {{}} }};
                drawer(ctx, s, 1.0, cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let minX = 576, maxX = -1, minY = 1024, maxY = -1;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const a = img[(y * 576 + x) * 4 + 3];
                    if (a > 10) {{
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }}
                  }}
                }}
                if (maxX < 0) return {{ w: 0, h: 0, maxDim: 0 }};
                const w = maxX - minX + 1, h = maxY - minY + 1;
                return {{ w, h, maxDim: Math.max(w, h) }};
              }};
            </script>
            </body></html>
            """)
            for item in actors_to_test:
                res = page.evaluate("args => measureActor(args[0], args[1], args[2])", [item["asset"], item["height"], item.get("variant")])
                with self.subTest(asset=item["asset"], variant=item.get("variant")):
                    self.assertGreaterEqual(
                        res["maxDim"], item["min_size"],
                        f"{item['asset']} (cao {item['height']}) có kích thước pixel thực tế {res['w']}x{res['h']} (max={res['maxDim']}px) < ngưỡng {item['min_size']}px"
                    )
            browser.close()


class PhaseUTest(unittest.TestCase):
    """Plan §30 & Giai đoạn U: Đại dương, bí ẩn và ngụ ngôn (ocean, mysteries, fables) - rigs, backgrounds, contacts, và stories."""
    _node = PackContractTest._node

    def test_every_ocean_mysteries_fables_pack_rig_draws_and_is_in_catalog(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        phase_u_rigs = [
            # Ocean pack (9 rigs)
            "sea_turtle", "jellyfish", "octopus", "whale", "seal", "coral", "seaweed", "anglerfish", "plastic_bag",
            # Mysteries pack (3 new rigs)
            "sunken_ship", "atlantis_ruins", "excavation_grid",
            # Fables pack (3 rigs)
            "grasshopper", "tortoise", "city_mouse"
        ]
        for rig in phase_u_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"], f"{rig} phải có trong catalog")
                pack = cat["assets"][rig].get("pack")
                self.assertIn(pack, ("ocean", "mysteries", "fables"), f"{rig} pack phải thuộc ocean, mysteries hoặc fables, nhận {pack}")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIn("root", anchors, f"{rig} thiếu anchor root")
                self.assertIn("top", anchors, f"{rig} thiếu anchor top")
                # Rule 5: anchors không được vượt quá khung y < -100
                for aname, apos in anchors.items():
                    self.assertGreaterEqual(apos[1], -100.0, f"{rig}.{aname} y={apos[1]} vượt quá khung trên y < -100")

        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs} = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = new Proxy({}, {
  get: (o, k) => k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const rig of rigs) {
  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
  if (!drawer) {
    errors.push(`Thiếu drawer cho rig ${rig}`);
    continue;
  }
  const s = { ...cat.pose_defaults, asset: rig, height: 100, x: 288, y: 512, rotation: 0, flip: false, style: {} };
  try {
    drawer(ctx, s, 1.0, cat);
  } catch (e) {
    errors.push(`Lỗi khi vẽ ${rig}: ${e.message}`);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": phase_u_rigs})
        self.assertEqual(out, [], f"Các rig bị lỗi vẽ: {out}")

    def test_ocean_mysteries_backgrounds_render_all_weathers_without_text(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        bgs = [
            "coral_reef", "beach_cleanup", "deep_sea",
            "easter_island_generic", "stone_circle_field", "ruins_underwater"
        ]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg]["ground_y"], 810)

        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs}=JSON.parse(fs.readFileSync(0,'utf8'));
let textCalls = 0;
const ctx=new Proxy({},{
  get:(o,k)=>{
    if(k==='fillText'||k==='strokeText'){ textCalls++; return ()=>{}; }
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
    return ()=>{};
  },
  set:(o,k,v)=>(o[k]=v,true)
});
const errors=[];
for(const bg of bgs){
  const spec = cat.background_specs[bg];
  for(const night of [false, true]){
    for(const weather of ['clear','rain','snow','wind','fog','storm','hot']){
      try {
        RemakeVector.kit.BACKGROUNDS[bg].draw(ctx, {night, weather, theme: spec.theme, ground_y: spec.ground_y, dirty: 0.5}, 1.5);
      } catch(e) {
        errors.push(bg + ' ' + weather + (night?' night':'') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_coral_bleached_saturation_and_story_progression(self):
        from bkt_web.remake_vector import catalog, engine_sources, coral_reef_examples
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.testCoral = function() {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                const drawer = RemakeVector.kit.RIG_DRAWERS['coral'];
                const results = {{}};
                for (const bleached of [0.0, 1.0]) {{
                  ctx.clearRect(0, 0, 576, 1024);
                  ctx.save();
                  ctx.translate(288, 512);
                  const s = {{ ...cat.pose_defaults, asset: 'coral', height: 100, bleached, style: {{}} }};
                  drawer(ctx, s, 1.0, cat);
                  ctx.restore();
                  const img = ctx.getImageData(288 - 50, 512 - 100, 100, 100).data;
                  let satSum = 0, count = 0;
                  for (let y = 0; y < 100; y++) {{
                    for (let x = 0; x < 100; x++) {{
                      const a = img[(y * 100 + x) * 4 + 3];
                      if (a > 30) {{
                        const r = img[(y * 100 + x) * 4] / 255;
                        const g = img[(y * 100 + x) * 4 + 1] / 255;
                        const b = img[(y * 100 + x) * 4 + 2] / 255;
                        const max = Math.max(r, g, b);
                        const min = Math.min(r, g, b);
                        const sat = max > 0.01 ? (max - min) / max : 0;
                        satSum += sat;
                        count++;
                      }}
                    }}
                  }}
                  results[bleached] = count > 0 ? satSum / count : 0;
                }}
                return results;
              }};
            </script>
            </body></html>
            """)
            res = page.evaluate("testCoral()")
            browser.close()
            self.assertGreater(res["0"], 0.40, f"San hô tươi màu phải có độ bão hòa cao (nhận {res['0']})")
            self.assertLess(res["1"], 0.25, f"San hô bị tẩy trắng phải nhạt màu (nhận {res['1']})")
            self.assertGreater(res["0"], res["1"] * 2.0, "San hô bleached=0 phải nhiều màu hơn bleached=1 ít nhất 2 lần")

        story = coral_reef_examples()[0]
        sc2 = story["scenes"][1]
        bleached_sc2 = [k.get("bleached", 0.0) for k in sc2["poses"]["coral"]]
        self.assertEqual(bleached_sc2[0], 0.0)
        self.assertEqual(bleached_sc2[-1], 0.8)
        for i in range(len(bleached_sc2) - 1):
            self.assertLessEqual(bleached_sc2[i], bleached_sc2[i + 1])

        sc3 = story["scenes"][2]
        bleached_sc3 = [k.get("bleached", 0.0) for k in sc3["poses"]["coral"]]
        self.assertEqual(bleached_sc3[0], 0.8)
        self.assertEqual(bleached_sc3[-1], 0.3)
        for i in range(len(bleached_sc3) - 1):
            self.assertGreaterEqual(bleached_sc3[i], bleached_sc3[i + 1])

    def test_turtle_rescue_story(self):
        from bkt_web.remake_vector import turtle_rescue_examples
        story = turtle_rescue_examples()[0]
        sc1 = story["scenes"][0]
        sc2 = story["scenes"][1]
        dist1 = abs(sc1["poses"]["sea_turtle"][0]["x"] - sc1["poses"]["plastic_bag"][0]["x"])
        dist2 = abs(sc2["poses"]["sea_turtle"][-1]["x"] - sc2["poses"]["plastic_bag"][-1]["x"])
        self.assertGreater(dist2 - dist1, 60.0, f"Túi nilon phải tách xa rùa biển > 60px (tăng {dist2 - dist1}px)")

        sort_actions = [a for a in sc2.get("actions", []) if a.get("type") == "sort"]
        self.assertTrue(len(sort_actions) > 0, "Cảnh 2 phải có action sort thu gom rác")
        self.assertEqual(sort_actions[0].get("actor"), "plastic_bag")
        self.assertEqual(sort_actions[0].get("target"), "bin")

        start_x = sc1["poses"]["sea_turtle"][0]["x"]
        end_x = story["scenes"][2]["poses"]["sea_turtle"][-1]["x"]
        total_dx = abs(start_x - end_x)
        self.assertGreaterEqual(total_dx, 150.0, f"Rùa biển phải bơi đi >= 150px (đạt {total_dx}px)")

        all_emotes = [a.get("emote") for sc in story["scenes"] for a in sc.get("actions", []) if a.get("type") == "emote"]
        self.assertIn("heart", all_emotes, "Story phải có biểu cảm emote heart")

    def test_moai_mystery_story(self):
        from bkt_web.remake_vector import catalog, moai_mystery_examples
        cat = catalog()
        story = moai_mystery_examples()[0]

        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const f = V.sample(story, cat, 2.0);
const hand = V.worldAnchor(cat, f.states.arch, 'hand_r');
const grip = V.worldAnchor(cat, f.states.glass, 'grip');
const d = Math.hypot(hand.x - grip.x, hand.y - grip.y);
console.log(JSON.stringify({ d }));
""", {"story": story, "cat": cat})
        self.assertLess(out["d"], 3.0, f"Kính lúp không nằm đúng trong tay (lệch {out['d']}px >= 3px)")

        sc2 = story["scenes"][1]
        # haul tự dời tượng và người kéo (pose đứng yên) → đo vị trí THẬT do engine lấy mẫu.
        moved = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const a = V.sample(story, cat, 5.2).states.moai.x, b = V.sample(story, cat, 11.9).states.moai.x;
const people = ['arch', 'helper1', 'helper2'].map(id => V.sample(story, cat, 8.0).states[id].x).sort((p, q) => p - q);
console.log(JSON.stringify({ dx: Math.abs(b - a), gap: Math.min(people[1] - people[0], people[2] - people[1]) }));
""", {"story": story, "cat": cat})
        self.assertGreaterEqual(moved["dx"], 80.0, f"Tượng Moai khi haul phải dịch chuyển >= 80px (đạt {moved['dx']}px)")
        self.assertGreaterEqual(moved["gap"], 90.0, "Ba người kéo không được đứng chồng lên nhau")
        haul_actions = [a for a in sc2.get("actions", []) if a.get("type") == "haul"]
        self.assertTrue(len(haul_actions) > 0, "Cảnh 2 phải có action haul kéo tượng")

        all_text = " ".join([c.get("text", "") for c in story.get("cues", [])]).lower()
        self.assertTrue(
            "giả thuyết" in all_text or "đang nghiên cứu" in all_text,
            "Lời thoại phải chứa từ khóa 'giả thuyết' hoặc 'đang nghiên cứu' theo chuẩn khoa học"
        )

    def test_tortoise_and_hare_story(self):
        from bkt_web.remake_vector import tortoise_and_hare_examples
        story = tortoise_and_hare_examples()[0]

        sc1 = story["scenes"][0]
        hare_sc1 = sc1["poses"]["hare"]
        dx_hare1 = abs(hare_sc1[-1]["x"] - hare_sc1[0]["x"])
        self.assertGreaterEqual(dx_hare1, 300.0, f"Thỏ ở cảnh 1 phải chạy >= 300px (đạt {dx_hare1}px)")

        sc2 = story["scenes"][1]
        hare_sc2 = sc2["poses"]["hare"]
        dx_hare2 = abs(hare_sc2[-1]["x"] - hare_sc2[0]["x"])
        self.assertEqual(dx_hare2, 0.0, "Thỏ phải đứng yên dưới cây ở cảnh 2")
        zzz_emotes = [a for a in sc2.get("actions", []) if a.get("type") == "emote" and a.get("emote") == "zzz"]
        self.assertTrue(len(zzz_emotes) > 0, "Thỏ phải có emote zzz khi chợp mắt ở cảnh 2")

        for idx, sc in enumerate(story["scenes"]):
            tort_poses = sc["poses"]["tortoise"]
            dx_tort = abs(tort_poses[-1]["x"] - tort_poses[0]["x"])
            self.assertGreaterEqual(dx_tort, 150.0, f"Rùa ở cảnh {idx+1} phải di chuyển >= 150px (đạt {dx_tort}px)")

        sc3 = story["scenes"][2]
        tort_final_x = sc3["poses"]["tortoise"][-1]["x"]
        hare_final_x = sc3["poses"]["hare"][-1]["x"]
        self.assertGreater(tort_final_x, hare_final_x, f"Rùa phải cán đích trước thỏ (rùa x={tort_final_x} > thỏ x={hare_final_x})")

    def test_ant_and_grasshopper_story(self):
        from bkt_web.remake_vector import catalog, ant_and_grasshopper_examples
        cat = catalog()
        story = ant_and_grasshopper_examples()[0]

        out = self._node(r"""
const {story, cat} = JSON.parse(fs.readFileSync(0, 'utf8'));
const f = V.sample(story, cat, 2.0);
const back = V.worldAnchor(cat, f.states.ant, 'surface');
const base = V.worldAnchor(cat, f.states.food, 'root');
const d = Math.hypot(back.x - base.x, back.y - base.y);
console.log(JSON.stringify({ d }));
""", {"story": story, "cat": cat})
        # Kiến cõng ổ bánh trên lưng: đáy bánh (root) nằm trên anchor surface của kiến.
        self.assertLess(out["d"], 3.0, f"Ổ bánh không nằm trên lưng kiến (lệch {out['d']}px >= 3px)")

        sc1 = story["scenes"][0]
        ant_sc1 = sc1["poses"]["ant"]
        dx_ant = abs(ant_sc1[-1]["x"] - ant_sc1[0]["x"])
        self.assertGreaterEqual(dx_ant, 150.0, f"Kiến phải di chuyển >= 150px ở cảnh 1 (đạt {dx_ant}px)")

        sc2 = story["scenes"][1]
        sc3 = story["scenes"][2]
        self.assertGreater(sc2["poses"]["grasshopper"][0].get("shiver", 0), 0.0, "Châu chấu phải bị lạnh run (shiver > 0) ở cảnh 2")
        self.assertEqual(sc3["poses"]["grasshopper"][-1].get("shiver", 0), 0.0, "Châu chấu phải hết run (shiver = 0) khi vào tổ ấm ở cuối cảnh 3")

    def test_fox_and_grapes_story(self):
        from bkt_web.remake_vector import fox_and_grapes_examples
        story = fox_and_grapes_examples()[0]

        sc1 = story["scenes"][0]
        fox_sc1 = sc1["poses"]["fox"]
        dx_fox1 = abs(fox_sc1[-1]["x"] - fox_sc1[0]["x"])
        self.assertGreaterEqual(dx_fox1, 150.0, f"Cáo phải bước lại gần giàn nho >= 150px (đạt {dx_fox1}px)")

        sc2 = story["scenes"][1]
        hop_actions = [a for a in sc2.get("actions", []) if a.get("type") == "hop"]
        self.assertTrue(len(hop_actions) > 0, "Cảnh 2 phải có action hop")

        sc3 = story["scenes"][2]
        fox_sc3 = sc3["poses"]["fox"]
        dx_fox3 = abs(fox_sc3[-1]["x"] - fox_sc3[0]["x"])
        self.assertGreaterEqual(dx_fox3, 150.0, f"Cáo phải bước đi xa giàn nho >= 150px (đạt {dx_fox3}px)")

    def test_no_opacity_zero_leakage_and_character_presence(self):
        from bkt_web.remake_vector import (
            turtle_rescue_examples, coral_reef_examples, moai_mystery_examples,
            tortoise_and_hare_examples, ant_and_grasshopper_examples, fox_and_grapes_examples
        )
        stories = [
            turtle_rescue_examples()[0],
            coral_reef_examples()[0],
            moai_mystery_examples()[0],
            tortoise_and_hare_examples()[0],
            ant_and_grasshopper_examples()[0],
            fox_and_grapes_examples()[0]
        ]
        for story in stories:
            for sc in story["scenes"]:
                for cid in sc.get("characters_present", []):
                    self.assertIn(cid, sc["poses"], f"{story['id']}: character {cid} trong characters_present thiếu poses")
                    for p in sc["poses"][cid]:
                        self.assertNotEqual(p.get("opacity"), 0, f"{story['id']}: pose của {cid} không được mang opacity: 0 kéo dài")

    def test_emotes_outfits_no_auto_frame_compliance(self):
        from bkt_web.remake_vector import (
            EMOTE_SYMBOLS,
            catalog,
            turtle_rescue_examples,
            coral_reef_examples,
            moai_mystery_examples,
            tortoise_and_hare_examples,
            ant_and_grasshopper_examples,
            fox_and_grapes_examples
        )
        cat = catalog()
        stories = [
            turtle_rescue_examples()[0],
            coral_reef_examples()[0],
            moai_mystery_examples()[0],
            tortoise_and_hare_examples()[0],
            ant_and_grasshopper_examples()[0],
            fox_and_grapes_examples()[0]
        ]
        for story in stories:
            for sc in story["scenes"]:
                self.assertNotIn("camera", sc, f"{story['id']}: không được gọi auto_frame")
                for a in sc.get("actions", []):
                    if a.get("type") == "emote":
                        emote_val = a.get("emote")
                        self.assertIn(emote_val, EMOTE_SYMBOLS, f"{story['id']}: emote '{emote_val}' không nằm trong EMOTE_SYMBOLS")
            for char in story["characters"]:
                self.assertNotEqual(char["asset"], "chibi_farmer", f"{story['id']}: bối cảnh không dùng chibi_farmer")
                outfit = char.get("outfit")
                if outfit and outfit != "none":
                    asset_group = cat["assets"][char["asset"]].get("group")
                    self.assertEqual(asset_group, "chibi", f"Outfit '{outfit}' chỉ được mặc cho rig chibi, không phải {char['asset']}")

    def test_no_rig_draws_at_y_less_than_minus_100(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        rigs = [
            "sea_turtle", "jellyfish", "octopus", "whale", "seal", "coral", "seaweed", "anglerfish", "plastic_bag",
            "sunken_ship", "atlantis_ruins", "excavation_grid",
            "grasshopper", "tortoise", "city_mouse"
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.checkMinY = function() {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                const results = {{}};
                for (const rig of {json.dumps(rigs)}) {{
                  ctx.clearRect(0, 0, 576, 1024);
                  ctx.save();
                  ctx.translate(288, 512);
                  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
                  const s = {{ ...cat.pose_defaults, asset: rig, height: 100, spout: 1.0, lit: 1.0, fiddle: 1.0, bleached: 1.0, style: {{}} }};
                  drawer(ctx, s, 1.0, cat);
                  ctx.restore();
                  const img = ctx.getImageData(0, 0, 576, 1024).data;
                  let minY = 1024;
                  for (let y = 0; y < 1024; y++) {{
                    for (let x = 0; x < 576; x++) {{
                      const a = img[(y * 576 + x) * 4 + 3];
                      if (a > 10) {{
                        if (y < minY) minY = y;
                      }}
                    }}
                  }}
                  results[rig] = minY - 512;
                }}
                return results;
              }};
            </script>
            </body></html>
            """)
            res = page.evaluate("checkMinY()")
            browser.close()
            for rig, rel_y in res.items():
                with self.subTest(rig=rig):
                    self.assertGreaterEqual(rel_y, -100, f"{rig} vẽ vượt quá khung trên với y={rel_y} < -100")

    def test_real_canvas_pixel_bounding_box_sizes(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        actors_to_test = [
            # Handheld props >= 60 px
            {"asset": "plastic_bag", "height": 100, "min_size": 60},
            {"asset": "magnifier", "height": 70, "min_size": 60},
            # Small animals >= 80 px
            {"asset": "ant", "height": 130, "min_size": 80},
            {"asset": "grasshopper", "height": 130, "min_size": 80},
            {"asset": "city_mouse", "height": 120, "min_size": 80},
            {"asset": "rabbit", "height": 130, "min_size": 80},
            # Marine / medium animals >= 120 px
            {"asset": "sea_turtle", "height": 140, "min_size": 120},
            {"asset": "tortoise", "height": 140, "min_size": 120},
            {"asset": "seal", "height": 140, "min_size": 120},
            {"asset": "octopus", "height": 140, "min_size": 120},
            {"asset": "jellyfish", "height": 150, "min_size": 120},
            {"asset": "anglerfish", "height": 150, "min_size": 120},
            # Whale >= 300 px
            {"asset": "whale", "height": 320, "min_size": 300},
            # Large monuments/ruins >= 200 px
            {"asset": "moai_generic", "height": 220, "min_size": 200},
            {"asset": "sunken_ship", "height": 220, "min_size": 200},
            {"asset": "atlantis_ruins", "height": 260, "min_size": 200},
        ]

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.measureActor = function(asset, height, variant) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const k = height / 100;
                ctx.scale(k, k);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) throw new Error('No drawer for ' + asset);
                const s = {{ ...cat.pose_defaults, asset, height, variant, id: 'test', style: {{}} }};
                drawer(ctx, s, 1.0, cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let minX = 576, maxX = -1, minY = 1024, maxY = -1;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const a = img[(y * 576 + x) * 4 + 3];
                    if (a > 10) {{
                      if (x < minX) minX = x;
                      if (x > maxX) maxX = x;
                      if (y < minY) minY = y;
                      if (y > maxY) maxY = y;
                    }}
                  }}
                }}
                if (maxX < 0) return {{ w: 0, h: 0, maxDim: 0 }};
                const w = maxX - minX + 1, h = maxY - minY + 1;
                return {{ w, h, maxDim: Math.max(w, h) }};
              }};
            </script>
            </body></html>
            """)
            for item in actors_to_test:
                res = page.evaluate("args => measureActor(args[0], args[1], args[2])", [item["asset"], item["height"], item.get("variant")])
                with self.subTest(asset=item["asset"], variant=item.get("variant")):
                    self.assertGreaterEqual(
                        res["maxDim"], item["min_size"],
                        f"{item['asset']} (cao {item['height']}) có kích thước pixel thực tế {res['w']}x{res['h']} (max={res['maxDim']}px) < ngưỡng {item['min_size']}px"
                    )
            browser.close()


class PhaseVTest(unittest.TestCase):
    """Plan §6 & Giai đoạn V: Tận thế, sinh tồn, zombie, thành phố cũ kỹ (wasteland, zombies, survival_kit)."""
    _node = PackContractTest._node

    def test_phase_v_rigs_and_backgrounds_catalog_and_draw(self):
        from bkt_web.remake_vector import catalog
        cat = catalog()
        wasteland_rigs = [
            "barricade_boards", "rain_barrel_filter", "solar_panel_small", "tent", "sleeping_bag",
            "vine_wall", "street_lamp_old", "shopping_cart", "canned_food_stack", "water_filter_bottle",
            "signal_mirror", "walkie_talkie"
        ]
        survival_kit_rigs = [
            "water_pot_boiling", "cloth_filter", "firewood_bundle", "fishing_rod_simple", "snare_free",
            "seed_tray", "hand_crank_radio", "sos_stones", "cure_sprayer"
        ]
        all_rigs = wasteland_rigs + survival_kit_rigs
        self.assertEqual(len(all_rigs), 21)

        for rig in all_rigs:
            with self.subTest(rig=rig):
                self.assertIn(rig, cat["assets"], f"{rig} phải có trong catalog")
                pack = cat["assets"][rig].get("pack")
                self.assertIn(pack, ("wasteland", "survival_kit"), f"{rig} pack phải là wasteland hoặc survival_kit, nhận {pack}")
                anchors = cat["assets"][rig].get("anchors", {})
                self.assertIn("root", anchors, f"{rig} thiếu anchor root")
                self.assertIn("top", anchors, f"{rig} thiếu anchor top")
                for aname, apos in anchors.items():
                    self.assertGreaterEqual(apos[1], -100.0, f"{rig}.{aname} y={apos[1]} vượt quá khung trên y < -100")

        # 6 backgrounds
        bgs = ["abandoned_street", "overgrown_plaza", "rooftop_garden", "subway_tunnel", "flooded_downtown", "safe_camp"]
        for bg in bgs:
            self.assertIn(bg, cat["backgrounds"])
            self.assertIn(bg, cat["background_specs"])
            self.assertEqual(cat["background_specs"][bg].get("ground_y"), 810)
        self.assertTrue(cat["background_specs"]["flooded_downtown"].get("open_water"))

        # Render all rigs in node mock context
        out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, rigs} = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = new Proxy({}, {
  get: (o, k) => k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const rig of rigs) {
  const drawer = RemakeVector.kit.RIG_DRAWERS[rig];
  if (!drawer) {
    errors.push(`Thiếu drawer cho rig ${rig}`);
    continue;
  }
  const s = { ...cat.pose_defaults, asset: rig, height: 100, x: 288, y: 512, rotation: 0, flip: false, style: {} };
  try {
    drawer(ctx, s, 1.0, cat);
  } catch (e) {
    errors.push(`Lỗi khi vẽ ${rig}: ${e.message}`);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "rigs": all_rigs})
        self.assertEqual(out, [], f"Các rig bị lỗi vẽ: {out}")

        # Render all 6 backgrounds with day/night and all weather, assert zero fillText/strokeText
        bg_out = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, bgs} = JSON.parse(fs.readFileSync(0, 'utf8'));
let textCalls = 0;
const ctx = new Proxy({}, {
  get: (o, k) => {
    if (k === 'fillText' || k === 'strokeText') { textCalls++; return () => {}; }
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const bg of bgs) {
  const spec = cat.background_specs[bg];
  for (const night of [false, true]) {
    for (const weather of ['clear', 'rain', 'snow', 'wind', 'fog', 'storm', 'hot']) {
      try {
        RemakeVector.BACKGROUNDS[bg].draw(ctx, { night, weather, theme: spec.theme, ground_y: spec.ground_y }, 1.5);
      } catch (e) {
        errors.push(bg + ' ' + weather + (night ? ' night' : '') + ': ' + e.message);
      }
    }
  }
}
console.log(JSON.stringify({errors, textCalls}));""", {"cat": cat, "bgs": bgs})
        self.assertEqual(bg_out["errors"], [])
        self.assertEqual(bg_out["textCalls"], 0, "Hình nền không được vẽ text")

    def test_default_decay_zombie_cured_preserve_exact_pixels(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        test_cases = [
            ("school_building", "decay"),
            ("fire_station", "decay"),
            ("car", "decay"),
            ("city_bus", "decay"),
            ("school_bus", "decay"),
            ("chibi_boy", "zombie"),
            ("chibi_girl", "zombie"),
        ]
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              function hash(d) {{
                let h = 0;
                for (let i = 0; i < d.length; i++) h = ((h << 5) - h + d[i]) | 0;
                return h;
              }}
              window.comparePixelRenders = function(asset, prop) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const s1 = Object.assign({{}}, window.cat.pose_defaults, {{ asset, height: 200, id: 't1', style: {{}} }});
                delete s1[prop];
                RemakeVector.kit.RIG_DRAWERS[asset](ctx, s1, 1.0, window.cat);
                ctx.restore();
                const d1 = ctx.getImageData(0, 0, 576, 1024).data;
                const h1 = hash(d1);

                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const s2 = Object.assign({{}}, window.cat.pose_defaults, {{ asset, height: 200, id: 't2', style: {{}} }});
                s2[prop] = 0;
                RemakeVector.kit.RIG_DRAWERS[asset](ctx, s2, 1.0, window.cat);
                ctx.restore();
                const d2 = ctx.getImageData(0, 0, 576, 1024).data;
                const h2 = hash(d2);
                return {{ h1, h2, match: h1 === h2 }};
              }};
            </script>
            </body></html>
            """)
            for asset, prop in test_cases:
                res = page.evaluate("([a, p]) => comparePixelRenders(a, p)", [asset, prop])
                with self.subTest(asset=asset, prop=prop):
                    self.assertTrue(res["match"], f"{asset} với {prop}=0 khác pixel so với mặc định")
            browser.close()

    def test_zombie_zero_red_pixels(self):
        from bkt_web.remake_vector import catalog, engine_sources
        from playwright.sync_api import sync_playwright
        cat = catalog()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        test_chibis = ["chibi_boy", "chibi_girl", "chibi_kid", "chibi_grandpa", "chibi_teacher"]
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{engine_js}</script>
            <script>
              window.cat = {json.dumps(cat)};
              window.checkZombieRed = function(asset) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                ctx.save();
                ctx.translate(288, 512);
                const s = Object.assign({{}}, window.cat.pose_defaults, {{ asset, height: 220, zombie: 1.0, expression: 'dazed', id: 'test', style: {{}} }});
                RemakeVector.kit.RIG_DRAWERS[asset](ctx, s, 1.0, window.cat);
                ctx.restore();
                const img = ctx.getImageData(0, 0, 576, 1024).data;
                let total = 0, redCount = 0;
                for (let i = 0; i < img.length; i += 4) {{
                  if (img[i + 3] > 20) {{
                    total++;
                    if (img[i] > 150 && img[i+1] < 80 && img[i+2] < 80) redCount++;
                  }}
                }}
                return {{ total, redCount, pct: (redCount / Math.max(1, total)) * 100 }};
              }};
            </script>
            </body></html>
            """)
            for asset in test_chibis:
                res = page.evaluate("a => checkZombieRed(a)", asset)
                with self.subTest(asset=asset):
                    self.assertLess(res["pct"], 0.5, f"Zombie {asset} có {res['pct']:.2f}% pixel đỏ >= 0.5%")
            browser.close()

    def test_shamble_and_chase_slow_speed_and_distance(self):
        from bkt_web.remake_vector import (
            catalog, last_city_morning_examples, water_first_examples, quiet_street_examples,
            barricade_night_examples, flooded_escape_examples, the_cure_examples
        )
        cat = catalog()
        stories = [
            last_city_morning_examples()[0],
            water_first_examples()[0],
            quiet_street_examples()[0],
            barricade_night_examples()[0],
            flooded_escape_examples()[0],
            the_cure_examples()[0],
        ]
        res = self._node(r"""
const {cat, stories} = JSON.parse(fs.readFileSync(0, 'utf8'));
const reports = [];
for (const story of stories) {
  let minGap = 999999;
  let maxZombieSpeed = 0;
  let prevZombiePos = {};
  for (let t = 0.5; t <= story.duration - 0.5; t += 0.25) {
    const f = RemakeVector.sample(story, cat, t);
    const zombies = [];
    const humans = [];
    for (const [aid, st] of Object.entries(f.states)) {
      if (st.opacity <= 0) continue;
      const rig = cat.assets[st.asset] || {};
      const isHumanRig = rig.group === 'chibi' || rig.group === 'people';
      if (!isHumanRig) continue;
      const isZomb = (st.zombie > 0) || aid.includes('zombie');
      if (isZomb) {
        zombies.push({aid, x: st.x, y: st.y});
        if (prevZombiePos[aid] !== undefined) {
          const spd = Math.abs(st.x - prevZombiePos[aid]) / 0.25;
          if (spd > maxZombieSpeed) maxZombieSpeed = spd;
        }
        prevZombiePos[aid] = st.x;
      } else {
        humans.push({aid, x: st.x, y: st.y});
      }
    }
    for (const z of zombies) {
      for (const h of humans) {
        const gap = Math.abs(z.x - h.x);
        if (gap < minGap) minGap = gap;
      }
    }
  }
  reports.push({id: story.id, minGap, maxZombieSpeed});
}
console.log(JSON.stringify(reports));""", {"cat": cat, "stories": stories})

        for r in res:
            with self.subTest(story=r["id"]):
                if r["minGap"] < 9999:
                    self.assertGreaterEqual(r["minGap"], 80.0, f"{r['id']}: khoảng cách zombie-người={r['minGap']}px < 80px")
                self.assertLessEqual(r["maxZombieSpeed"], 40.0 + 1e-3, f"{r['id']}: tốc độ zombie={r['maxZombieSpeed']}px/s > 40px/s")

    def test_validator_rejects_weapons_and_zombie_attack(self):
        from bkt_web.remake_vector import validate_story, last_city_morning_examples
        import copy
        base_story = last_city_morning_examples()[0]

        # 1. Vũ khí cấm
        for weapon in ["gun", "rifle", "pistol", "sword", "real_sword", "chainsaw", "saw"]:
            bad_story = copy.deepcopy(base_story)
            bad_story["characters"].append({"id": "wpn", "asset": weapon})
            with self.subTest(weapon=weapon):
                with self.assertRaises(ValueError):
                    validate_story(bad_story)

        # 2. Axe chỉ hợp lệ khi target là firewood_bundle
        bad_axe_story = copy.deepcopy(base_story)
        bad_axe_story["characters"].append({"id": "my_axe", "asset": "axe"})
        bad_axe_story["characters"].append({"id": "other_tg", "asset": "tent"})
        bad_axe_story["scenes"][0]["actions"].append({
            "type": "chop", "start": 1.0, "end": 3.0, "actor": "mika", "tool": "my_axe", "target": "other_tg"
        })
        bad_axe_story["scenes"][0]["poses"]["my_axe"] = [
            {"time": 0, "x": 100, "y": 810, "height": 60}, {"time": 5, "x": 100, "y": 810, "height": 60}
        ]
        bad_axe_story["scenes"][0]["poses"]["other_tg"] = [
            {"time": 0, "x": 120, "y": 810, "height": 100}, {"time": 5, "x": 120, "y": 810, "height": 100}
        ]
        bad_axe_story["scenes"][0]["characters_present"].extend(["my_axe", "other_tg"])
        with self.assertRaises(ValueError):
            validate_story(bad_axe_story)

        # 3. Zombie tấn công người (trừ chase_slow) bị từ chối
        bad_zombie_story = copy.deepcopy(base_story)
        bad_zombie_story["characters"].append({"id": "zombie_attacker", "asset": "chibi_boy"})
        bad_zombie_story["scenes"][0]["poses"]["zombie_attacker"] = [
            {"time": 0, "x": 100, "y": 810, "height": 220, "zombie": 1.0},
            {"time": 5, "x": 100, "y": 810, "height": 220, "zombie": 1.0}
        ]
        bad_zombie_story["scenes"][0]["characters_present"].append("zombie_attacker")
        bad_zombie_story["scenes"][0]["actions"].append({
            "type": "shamble", "start": 1.0, "end": 3.0, "actor": "zombie_attacker", "target": "mika"
        })
        with self.assertRaises(ValueError):
            validate_story(bad_zombie_story)

    def test_the_cure_story_cured_monotonic_and_happy(self):
        from bkt_web.remake_vector import the_cure_examples
        story = the_cure_examples()[0]
        nora_poses = []
        for sc in story["scenes"]:
            for p in sc.get("poses", {}).get("nora", []):
                nora_poses.append(p)
        self.assertTrue(len(nora_poses) >= 2)
        cured_vals = [p.get("cured", 0.0) for p in nora_poses]
        for i in range(len(cured_vals) - 1):
            self.assertGreaterEqual(cured_vals[i+1], cured_vals[i], "cured của Nora không tăng đơn điệu")
        self.assertAlmostEqual(cured_vals[-1], 1.0, places=2, msg="Nora cuối story phải cured = 1.0")
        self.assertEqual(nora_poses[-1].get("expression"), "happy", "Biểu cảm cuối của Nora phải là happy")

    def test_water_first_story_clarity_monotonic_and_boil(self):
        from bkt_web.remake_vector import water_first_examples
        story = water_first_examples()[0]
        barrel_poses = []
        for sc in story["scenes"]:
            for p in sc.get("poses", {}).get("barrel", []):
                barrel_poses.append(p)
        clarity_vals = [p.get("clarity", 0.0) for p in barrel_poses]
        for i in range(len(clarity_vals) - 1):
            self.assertGreaterEqual(clarity_vals[i+1], clarity_vals[i], "clarity của nước không tăng đơn điệu")

        pot_poses = []
        for p in story["scenes"][1].get("poses", {}).get("pot", []):
            pot_poses.append(p)
        max_boil = max(p.get("boil", 0.0) for p in pot_poses)
        self.assertAlmostEqual(max_boil, 1.0, places=2, msg="Nước phải được đun sôi boil=1 trước cảnh uống")

    def test_general_rules_emotes_outfits_no_conical_no_vietnamese_cues(self):
        import re
        from bkt_web.remake_vector import (
            catalog, EMOTE_SYMBOLS, last_city_morning_examples, water_first_examples, quiet_street_examples,
            barricade_night_examples, flooded_escape_examples, the_cure_examples
        )
        cat = catalog()
        stories = [
            last_city_morning_examples()[0],
            water_first_examples()[0],
            quiet_street_examples()[0],
            barricade_night_examples()[0],
            flooded_escape_examples()[0],
            the_cure_examples()[0],
        ]
        vn_pattern = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.IGNORECASE)
        for story in stories:
            for cue in story.get("cues", []):
                text = cue.get("text", "")
                self.assertFalse(vn_pattern.search(text), f"{story['id']}: Cues chứa tiếng Việt: {text}")
            for char in story["characters"]:
                self.assertNotEqual(char.get("asset"), "chibi_farmer", f"{story['id']} không được dùng chibi_farmer")
                if char.get("style", {}).get("hat") == "conical":
                    self.fail(f"{story['id']} không được dùng hat conical")
            for sc in story["scenes"]:
                for act in sc.get("actions", []):
                    if act.get("type") == "emote":
                        self.assertIn(act.get("emote"), EMOTE_SYMBOLS, f"{story['id']}: emote không hợp lệ")
                for cid, p_list in sc.get("poses", {}).items():
                    char_def = next((c for c in story["characters"] if c["id"] == cid), {})
                    asset = char_def.get("asset", "")
                    group = cat["assets"].get(asset, {}).get("group", "")
                    for p in p_list:
                        if "outfit" in p and p["outfit"] != "none":
                            self.assertEqual(group, "chibi", f"{cid} ({asset}) có outfit nhưng không phải chibi")

    def test_character_library_roundtrip_and_crowd_roles(self):
        from bkt_web.vector_characters.compose import compose_story
        from bkt_web.remake_vector import STATIC_DIR, validate_story
        chars = json.loads((STATIC_DIR / "remake_vector_characters.json").read_text(encoding="utf-8"))
        clips = json.loads((STATIC_DIR / "remake_vector_clips.json").read_text(encoding="utf-8"))
        refs = json.loads((STATIC_DIR / "remake_vector_story_refs.json").read_text(encoding="utf-8"))

        phase_v_story_ids = ["last_city_morning", "water_first", "quiet_street", "barricade_night", "flooded_escape", "the_cure"]
        for sid in phase_v_story_ids:
            with self.subTest(story=sid):
                self.assertIn(sid, refs, f"{sid} phải có trong story_refs")
                composed = compose_story(refs[sid], chars, clips)
                validate_story(composed)

        for walker_id in ["zombie_walker_a", "zombie_walker_b", "zombie_walker_c"]:
            self.assertIn(walker_id, chars)
            meta = chars[walker_id]
            self.assertEqual(meta.get("role"), "crowd")
            markets = meta.get("markets", [])
            for m in ["de", "us", "kr", "jp"]:
                self.assertIn(m, markets, f"{walker_id} thiếu market {m}")

    def test_recurring_cast_integrity_and_clips(self):
        from bkt_web.vector_characters.cast import get_cast_data, get_all_cast_clips
        from bkt_web.remake_vector import catalog
        cat = catalog()
        cast_db = get_cast_data()
        self.assertEqual(len(cast_db), 10)
        palettes = set()
        for cid, info in cast_db.items():
            pal_str = "-".join(info.get("palette", []))
            self.assertNotIn(pal_str, palettes, f"Palette trùng lặp cho {cid}")
            palettes.add(pal_str)

        states_to_test = []
        for cid, info in cast_db.items():
            for sname, sconf in info.get("states", {}).items():
                states_to_test.append({
                    "cid": cid, "state": sname, "rig": info["rig"], "outfit": sconf.get("outfit"),
                    "zombie": sconf.get("zombie", 0), "cured": sconf.get("cured", 0)
                })

        errs = self._node(r"""
globalThis.Path2D=class{constructor(){}addPath(){}};
const {cat, states} = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = new Proxy({}, {
  get: (o, k) => k in o ? o[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: (o, k, v) => (o[k] = v, true)
});
const errors = [];
for (const item of states) {
  const drawer = RemakeVector.kit.RIG_DRAWERS[item.rig];
  if (!drawer) continue;
  const s = { ...cat.pose_defaults, asset: item.rig, height: 200, outfit: item.outfit, zombie: item.zombie, cured: item.cured, style: {}, id: 'test' };
  try {
    drawer(ctx, s, 1.0, cat);
  } catch (e) {
    errors.push(item.cid + ' ' + item.state + ': ' + e.message);
  }
}
console.log(JSON.stringify(errors));""", {"cat": cat, "states": states_to_test})
        self.assertEqual(errs, [])

        all_clips = get_all_cast_clips()
        for cid, clips in all_clips.items():
            for cname, cdata in clips.items():
                kfs = cdata.get("keyframes", [])
                for kf in kfs:
                    dy = kf.get("dy", 0)
                    self.assertLessEqual(abs(dy), 12.0, f"Clip {cid}/{cname} dy={dy} lệch mặt đất > 12px")


class WidescreenTest(unittest.TestCase):
    """Khổ ngang thật 1820×1024 (plan docs/PLAN_vector_widescreen.md nhóm B1 + B2)."""

    PAGE_JS = r"""
window.bgFor = (key, variant) => { const [preset, locale] = key.split('@'); const bg = ['day', 'night'].includes(variant) ? { preset, time: variant } : { preset, weather: variant }; if (locale) bg.locale = locale; return bg; };
window.storyFor = (background, frame, extra = {}) => ({ id: 'w', renderer: 'native-vector-v1', duration: 4, frame, characters: [], cues: [],
  scenes: [{ renderer: 'native-vector-v1', start_time: 0, end_time: 4, characters_present: [], background, poses: {}, actions: [] }], ...extra });
window.hashPixels = data => { let h1 = 0xdeadbeef, h2 = 0x41c64e6d; for (let i = 0; i < data.length; i += 4) { const v = (data[i] << 24) | (data[i+1] << 16) | (data[i+2] << 8) | data[i+3]; h1 = Math.imul(h1 ^ v, 2654435761); h2 = Math.imul(h2 ^ (v >>> 16), 1597334677); } return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16); };
// Cột 64 px: số màu khác nhau (lượng tử 8 mức) và màu trung bình của 3 dải ngang, để bắt phần phải bị vẽ thiếu.
window.columnStats = background => {
  const c = document.createElement('canvas'); new RemakeVector.Renderer(c, window.cat, storyFor(background, 'landscape')).render(2.0);
  const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const starts = []; for (let x = 0; x + 64 <= W; x += 64) starts.push(x); if (starts[starts.length - 1] !== W - 64) starts.push(W - 64);
  const colors = [], bands = [];
  for (const x0 of starts) {
    const seen = new Set(), b = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let y = 0; y < H; y += 4) for (let x = x0; x < x0 + 64; x += 4) {
      const i = (y * W + x) * 4, k = Math.min(2, Math.floor(y * 3 / H));
      seen.add(((d[i] >> 3) << 10) | ((d[i+1] >> 3) << 5) | (d[i+2] >> 3));
      b[k][0] += d[i]; b[k][1] += d[i+1]; b[k][2] += d[i+2]; b[k][3]++;
    }
    colors.push(seen.size); bands.push(b.map(v => [v[0] / v[3], v[1] / v[3], v[2] / v[3]]));
  }
  let jump = 0, at = -1;
  for (let i = 1; i < bands.length; i++) for (let k = 0; k < 3; k++) {
    const dd = Math.hypot(...bands[i][k].map((v, j) => v - bands[i - 1][k][j])); if (dd > jump) { jump = dd; at = starts[i]; }
  }
  return { size: [W, H], minColors: Math.min(...colors), jump, at };
};
window.countText = background => {
  const proto = CanvasRenderingContext2D.prototype, fill = proto.fillText, stroke = proto.strokeText; let n = 0;
  proto.fillText = function (...a) { n++; return fill.apply(this, a); }; proto.strokeText = function (...a) { n++; return stroke.apply(this, a); };
  try { new RemakeVector.Renderer(document.createElement('canvas'), window.cat, storyFor(background, 'landscape')).render(2.0); }
  finally { proto.fillText = fill; proto.strokeText = stroke; }
  return n;
};
window.cropMatch = background => {
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  new RemakeVector.Renderer(a, window.cat, storyFor(background, 'portrait')).render(2.0);
  new RemakeVector.Renderer(b, window.cat, storyFor(background, 'landscape')).render(2.0);
  const da = a.getContext('2d').getImageData(0, 0, 576, 1024).data, db = b.getContext('2d').getImageData(0, 0, 576, 1024).data;
  let same = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]) <= 6) same++;
  return same / (da.length / 4);
};
"""

    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        from bkt_web.remake_vector import catalog
        from tests.test_remake_vector_regression import LANDSCAPE_BACKGROUNDS, load_engine_code
        cls.backgrounds = LANDSCAPE_BACKGROUNDS
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
        cls.page = cls.browser.new_page()
        cls.page.set_content(f"<script>{load_engine_code()}</script><script>window.cat={json.dumps(catalog())};{cls.PAGE_JS}</script>")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def _node(self, program, payload=None):
        from bkt_web.remake_vector import engine_sources
        prelude = "const fs=require('fs');for(const f of JSON.parse(process.argv[1]))require(f);const V=RemakeVector;"
        result = subprocess.run(["node", "-e", prelude + program, json.dumps([str(p) for p in engine_sources()])],
                                input=json.dumps(payload or {}), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    # -- B1: khổ, kit, validate --------------------------------------------
    def test_frame_defaults_to_portrait_and_rejects_unknown_frames(self):
        from bkt_web.remake_vector import examples, frame_size, validate_story
        story = examples()[0]
        self.assertEqual(frame_size(story), (576, 1024))
        self.assertEqual(frame_size({**story, "frame": "landscape"}), (1820, 1024))
        validate_story({**story, "frame": "landscape"})
        with self.assertRaises(ValueError):
            validate_story({**story, "frame": "square"})
        sizes = self.page.evaluate("""() => ['portrait', 'landscape', undefined].map(f => {
          const c = document.createElement('canvas'); const s = storyFor({ preset: 'garden' }, f); if (!f) delete s.frame;
          new RemakeVector.Renderer(c, window.cat, s); return [c.width, c.height]; })""")
        self.assertEqual(sizes, [[576, 1024], [1820, 1024], [576, 1024]])
        error = self.page.evaluate("() => { try { new RemakeVector.Renderer(document.createElement('canvas'), window.cat, storyFor({ preset: 'garden' }, 'square')); return null; } catch (e) { return e.message; } }")
        self.assertIn("square", error or "")

    def test_kit_frame_helpers_are_deterministic(self):
        out = self._node(r"""
const k = V.kit;
console.log(JSON.stringify({
  portrait: k.frameW({}), landscape: k.frameW({ frame: { w: 1820, h: 1024 } }),
  a: k.spread(5, 1244, 60, 'x'), b: k.spread(5, 1244, 60, 'x'), c: k.spread(5, 1244, 60, 'y'), none: k.spread(3, 100, 60, 'x'),
  tiles: (() => { const r = []; k.tileX(1820, 576, (ox, i) => r.push([ox, i])); return r; })(),
  kitW: k.W, kitH: k.H }));""")
        self.assertEqual((out["portrait"], out["landscape"]), (576, 1820))
        self.assertEqual(out["a"], out["b"])
        self.assertNotEqual(out["a"], out["c"])
        self.assertEqual(len(out["a"]), 5)
        self.assertTrue(all(60 <= x <= 1244 - 60 for x in out["a"]))
        self.assertEqual(out["a"], sorted(out["a"]))
        self.assertEqual(out["none"], [])
        self.assertEqual(out["tiles"], [[0, 0], [576, 1], [1152, 2], [1728, 3]])
        self.assertEqual((out["kitW"], out["kitH"]), (576, 1024), "kit.W/H giữ khổ dọc cho gói chưa chuyển")

    # -- B2: hình nền khổ ngang ---------------------------------------------
    def test_landscape_backgrounds_have_no_empty_or_broken_columns(self):
        variants = ["day", "night"] + [w for w in self.page.evaluate("() => window.cat.weather") if w != "clear"]
        for key in self.backgrounds:
            for variant in variants:
                with self.subTest(background=key, variant=variant):
                    stats = self.page.evaluate("([k, v]) => columnStats(bgFor(k, v))", [key, variant])
                    self.assertEqual(stats["size"], [1820, 1024])
                    self.assertGreaterEqual(stats["minColors"], 2, "có cột 64 px chỉ một màu (dải trống)")
                    self.assertLess(stats["jump"], 150, f"cột tại x={stats['at']} lệch màu bất thường so với cột kề")

    def test_column_detector_flags_backgrounds_that_stop_at_576(self):
        self.page.evaluate("""() => { if (!RemakeVector.kit.BACKGROUNDS?.wide_test_empty) RemakeVector.register({ backgrounds: {
          wide_test_empty: { label: 'test', theme: 'garden', ground_y: 760, draw(ctx) { ctx.fillStyle = '#88c'; ctx.fillRect(0, 0, 576, 760); ctx.fillStyle = '#743'; ctx.fillRect(0, 760, 576, 264); } },
          wide_test_ground: { label: 'test', theme: 'garden', ground_y: 760, draw(ctx) { ctx.fillStyle = '#9cf'; ctx.fillRect(-2000, -2000, 4500, 5000); ctx.fillStyle = '#743'; ctx.fillRect(-2000, 760, 2576, 2240); } } } }); }""")
        empty = self.page.evaluate("() => columnStats({ preset: 'wide_test_empty' })")
        ground = self.page.evaluate("() => columnStats({ preset: 'wide_test_ground' })")
        self.assertLess(empty["minColors"], 2)
        self.assertLess(ground["minColors"], 2)
        self.assertGreaterEqual(ground["jump"], 150)
        self.assertEqual(ground["at"], 576)

    def test_landscape_backgrounds_draw_no_text_and_keep_ground_y(self):
        from bkt_web.remake_vector import catalog
        specs = catalog()["background_specs"]
        ground = self.page.evaluate("(keys) => Object.fromEntries(keys.map(k => [k, RemakeVector.kit.BACKGROUNDS?.[k.split('@')[0]]?.ground_y ?? null]))", self.backgrounds)
        for key in self.backgrounds:
            preset = key.split("@")[0]
            with self.subTest(background=key):
                for variant in ("day", "night", "rain", "snow"):
                    self.assertEqual(self.page.evaluate("([k, v]) => countText(bgFor(k, v))", [key, variant]), 0, "hình nền gọi fillText/strokeText")
                self.assertIsNotNone(ground[key])
                self.assertEqual(ground[key], specs[preset]["ground_y"])

    def test_landscape_left_panel_matches_portrait(self):
        # §6.4: phần 0–576 của khổ ngang trùng ≥ 98% khổ dọc (cùng mặt đất, cùng vật cố định).
        for key in self.backgrounds:
            for variant in ("day", "night"):
                with self.subTest(background=key, variant=variant):
                    self.assertGreaterEqual(self.page.evaluate("([k, v]) => cropMatch(bgFor(k, v))", [key, variant]), 0.98)

    # -- phụ đề, tất định ---------------------------------------------------
    def test_landscape_subtitle_stays_in_central_1200px_box(self):
        text = "Đây là một câu phụ đề rất dài để kiểm tra việc xuống dòng của khổ ngang " * 4
        box = self.page.evaluate("""(text) => {
          const make = cues => { const c = document.createElement('canvas');
            new RemakeVector.Renderer(c, window.cat, storyFor({ preset: 'garden' }, 'landscape', { cues })).render(1.0);
            return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
          const a = make([]), b = make([{ start: 0, end: 4, text, character_id: null }]);
          let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
          for (let y = 0; y < 1024; y++) for (let x = 0; x < 1820; x++) { const i = (y * 1820 + x) * 4;
            if (a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
          return { x0, x1, y0, y1 }; }""", text)
        self.assertGreater(box["x1"], box["x0"], "phụ đề không được vẽ")
        self.assertGreaterEqual(box["x0"], (1820 - 1200) / 2 - 1)
        self.assertLessEqual(box["x1"], (1820 + 1200) / 2 + 1)
        self.assertLessEqual(box["y1"], 1024 - 90 + 1)
        self.assertGreater(box["x1"] - box["x0"], 900, "câu dài phải dùng gần hết hộp 1200 px")

    def test_landscape_render_frame_is_deterministic(self):
        from bkt_web.remake_vector import quiet_street_examples, to_landscape
        story = to_landscape(quiet_street_examples()[0], "center")
        hashes = self.page.evaluate("""(story) => [1.3, 1.3, story.duration / 2].map((t, i) => {
          const c = document.createElement('canvas'); const r = new RemakeVector.Renderer(c, window.cat, story);
          r.render(t); if (i === 1) { r.render(0.2); r.render(t); }
          return [c.width, c.height, hashPixels(c.getContext('2d').getImageData(0, 0, c.width, c.height).data)]; })""", story)
        self.assertEqual(hashes[0][:2], [1820, 1024])
        self.assertEqual(hashes[0], hashes[1])

    # -- to_landscape ---------------------------------------------------------
    def _sampled(self, stories):
        return self._node(r"""
const { cat, stories } = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(stories.map(story => {
  const out = [];
  for (const scene of story.scenes) if (scene.kind !== 'title') {
    const a = scene.start_time, b = scene.end_time;
    for (const t of [a + 0.05, a + (b - a) * 0.33, a + (b - a) * 0.66, b - 0.05]) {
      const f = V.sample(story, cat, t);
      out.push({ t, cam: f.camera, states: Object.fromEntries(Object.entries(f.states).map(([id, s]) => [id, [s.x, s.y, s.height]])) });
    }
  }
  return out;
})));""", {"cat": __import__("bkt_web.remake_vector", fromlist=["catalog"]).catalog(), "stories": stories})

    def _hook_stories(self):
        from bkt_web.remake_vector import build_pyramid_examples, examples, first_car_examples, quiet_street_examples
        return {"haul": build_pyramid_examples()[0], "shamble": quiet_street_examples()[0],
                "ride": first_car_examples()[0], "basic": examples()[0]}

    def test_to_landscape_center_shifts_everyone_by_the_same_amount(self):
        from bkt_web.remake_vector import to_landscape, validate_story
        for name, story in self._hook_stories().items():
            with self.subTest(story=name):
                wide = to_landscape(story, "center")
                validate_story(wide)
                self.assertEqual(wide["frame"], "landscape")
                self.assertNotIn("frame", story, "story gốc không được sửa")
                portrait, landscape = self._sampled([story, wide])
                for p, l in zip(portrait, landscape):
                    self.assertEqual(set(p["states"]), set(l["states"]))
                    for cid, (x, y, h) in p["states"].items():
                        lx, ly, lh = l["states"][cid]
                        self.assertAlmostEqual(lx - x, 622, delta=0.05, msg=f"{cid} t={p['t']}")
                        self.assertAlmostEqual(ly, y, delta=0.05)
                    self.assertAlmostEqual(l["cam"]["x"] - p["cam"]["x"], 622, delta=0.05)
        with self.assertRaises(ValueError):
            to_landscape(to_landscape(self._hook_stories()["basic"]))
        with self.assertRaises(ValueError):
            to_landscape(self._hook_stories()["basic"], "zigzag")

    def test_to_landscape_spread_keeps_action_contacts_and_adds_no_overlap(self):
        from bkt_web.remake_vector import ACTION_ROLES, to_landscape, validate_story
        for name, story in self._hook_stories().items():
            with self.subTest(story=name):
                wide = to_landscape(story, "spread")
                validate_story(wide)
                portrait, landscape = self._sampled([story, wide])
                attached = {c["id"] for c in story["characters"] if c.get("attach_to")}
                for p, l in zip(portrait, landscape):
                    shift = {cid: l["states"][cid][0] - x for cid, (x, _, _) in p["states"].items()}
                    scene = next(s for s in story["scenes"] if s["start_time"] <= p["t"] <= s["end_time"])
                    for action in scene.get("actions", []):
                        if not action["start"] <= p["t"] <= action["end"]:
                            continue
                        members = [action[r] for r in ACTION_ROLES if isinstance(action.get(r), str) and action[r] in shift]
                        members += [h for h in action.get("helpers", []) or [] if h in shift]
                        for m in members[1:]:
                            self.assertAlmostEqual(shift[m], shift[members[0]], delta=0.05, msg=f"{action['type']} {m} t={p['t']}")
                    free = [cid for cid in p["states"] if cid not in attached]
                    for i, a in enumerate(free):
                        for b in free[i + 1:]:
                            (ax, _, ah), (bx, _, bh) = p["states"][a], p["states"][b]
                            if abs(ax - bx) >= 0.45 * (ah + bh):
                                (lax, _, _), (lbx, _, _) = l["states"][a], l["states"][b]
                                self.assertGreaterEqual(abs(lax - lbx), 0.45 * (ah + bh) - 0.05, f"{a}/{b} chồng nhau t={p['t']}")

    # -- composer / adapter ---------------------------------------------------
    def test_composer_exports_landscape_as_1920x1080(self):
        import sys
        from bkt_web import remake_composer as composer
        duration = 1.0
        characters = [{"id": "farmer", "asset": "farmer", "name": "Nông dân"}]
        scenes = [{"renderer": "native-vector-v1", "start_time": 0, "end_time": duration, "characters_present": ["farmer"],
                   "background": {"preset": "garden"}, "actions": [],
                   "poses": {"farmer": [{"time": 0, "x": 880, "y": 760, "height": 360}, {"time": duration, "x": 940, "y": 760, "height": 360}]}}]
        cues = [{"start": 0, "end": duration, "text": "Xin chào khổ ngang", "character_id": "farmer"}]
        # Composer dùng Playwright sync; lớp này đã giữ một Playwright đang chạy nên xuất video ở tiến trình con.
        program = r"""
import json, sys
from pathlib import Path
from unittest.mock import patch
from bkt_web import remake_composer as composer
args = json.loads(sys.stdin.read())
tmp = Path(args["tmp"])
with patch.object(composer, "STATIC_DIR", tmp):
    result = composer.compose_animated_video("wide-test", args["characters"], args["scenes"], args["cues"], tmp / "voice.wav", tmp / "out.mp4", args["duration"], frame="landscape")
print(json.dumps(str(result) if result else None))
"""
        with tempfile.TemporaryDirectory() as tmp:
            audio, out = Path(tmp) / "voice.wav", Path(tmp) / "out.mp4"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", str(duration), str(audio)], check=True)
            run = subprocess.run([sys.executable, "-c", program], cwd=str(Path(__file__).resolve().parent.parent), text=True, capture_output=True,
                                 input=json.dumps({"tmp": tmp, "characters": characters, "scenes": scenes, "cues": cues, "duration": duration}))
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(json.loads(run.stdout.strip().splitlines()[-1]), str(out))
            html = (Path(tmp) / "remake_wide-test_animated.html").read_text(encoding="utf-8")
            self.assertIn("frame:'landscape'", html)
            self.assertNotIn("{{", html)
            probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                    "-of", "csv=p=0", str(out)], capture_output=True, text=True, check=True).stdout.strip()
            self.assertEqual(probe, "1920,1080")
        with self.assertRaises(ValueError):
            composer.compose_animated_video("wide-test", characters, scenes, cues, Path("a.wav"), Path("o.mp4"), duration, frame="square")

    def test_native_adapter_compiles_landscape_canvas(self):
        from bkt_web.remake_vector import FRAMES, examples, to_landscape
        from bkt_web.renderer_adapters import get_adapter
        from bkt_web.renderer_adapters.native_vector import NativeVectorAdapter
        from bkt_web.storyboard_migration import migrate_v1_to_v2
        adapter = NativeVectorAdapter()
        sizes = {(c["width"], c["height"]) for c in adapter.supported_canvases}
        self.assertEqual(sizes, {FRAMES["portrait"], FRAMES["landscape"]})
        for story, size in ((examples()[0], (576, 1024)), (to_landscape(examples()[0], "center"), (1820, 1024))):
            migrated = migrate_v1_to_v2(copy.deepcopy(story))
            adapter = get_adapter("native-vector-v1")
            compiled = adapter.compile(migrated["scenes"][0], {"storyboard": migrated})
            self.assertEqual(compiled.plan["story"], story)
            self.assertEqual((compiled.canvas["width"], compiled.canvas["height"]), size)
            self.assertIn(f'width="{size[0]}" height="{size[1]}"', adapter.offline_bundle(compiled))


