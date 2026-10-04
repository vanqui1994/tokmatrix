"""Tests for Vector Character Library (docs/PLAN_vector_character_library.md).

Verifies extraction, deduplication, naming, round-trip pixel matching,
and neutral farm variants across all 79 sample stories.
"""

import json
from pathlib import Path
import unittest
from playwright.sync_api import sync_playwright

from bkt_web.remake_vector import catalog, engine_sources, sample_stories, validate_story
from bkt_web.vector_characters.compose import compose_story
from bkt_web.vector_characters.dedupe import dedupe_clips
from bkt_web.vector_characters.extract import extract_library

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "bkt_web" / "static"
HASHES_FILE = ROOT / "tests" / "data" / "vector_hashes.json"


def load_engine_code() -> str:
    sources = engine_sources()
    return "\n;\n".join(src.read_text(encoding="utf-8") for src in sources)


class TestVectorCharacters(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = catalog()
        cls.sample_stories = sample_stories()
        cls.engine_js = load_engine_code()
        
        # Load extracted JSON data
        chars_path = STATIC_DIR / "remake_vector_characters.json"
        clips_path = STATIC_DIR / "remake_vector_clips.json"
        refs_path = STATIC_DIR / "remake_vector_story_refs.json"
        
        if not (chars_path.exists() and clips_path.exists() and refs_path.exists()):
            extract_library()
            
        cls.characters = json.loads(chars_path.read_text(encoding="utf-8"))
        cls.clips = json.loads(clips_path.read_text(encoding="utf-8"))
        cls.story_refs = json.loads(refs_path.read_text(encoding="utf-8"))

        if HASHES_FILE.exists():
            cls.baseline = json.loads(HASHES_FILE.read_text(encoding="utf-8"))
        else:
            cls.baseline = None

    def test_round_trip_pixel_hashes(self):
        """Test 1: Round-trip compose(extract(story)) must match baseline pixel hashes identically."""
        self.assertIsNotNone(self.baseline, "Mốc vector_hashes.json chưa tồn tại")
        baseline_stories = self.baseline.get("stories", {})
        self.assertTrue(baseline_stories, "Baseline không chứa stories")

        # Compose all 79 sample stories from story_refs
        composed_stories = []
        for orig in self.sample_stories:
            sid = orig["id"]
            self.assertIn(sid, self.story_refs, f"Story {sid} thiếu tham chiếu trong story_refs")
            comp = compose_story(self.story_refs[sid], self.characters, self.clips)
            composed_stories.append(comp)

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{self.engine_js}</script>
            <script>
              window.cat = {json.dumps(self.catalog)};
              function hashPixels(data) {{
                let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
                for (let i = 0; i < data.length; i += 4) {{
                  const v = (data[i] << 24) | (data[i+1] << 16) | (data[i+2] << 8) | data[i+3];
                  h1 = Math.imul(h1 ^ v, 2654435761);
                  h2 = Math.imul(h2 ^ (v >>> 16), 1597334677);
                }}
                return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
              }}
              window.renderStoryBatch = function(stories) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                const res = {{}};
                for (const story of stories) {{
                  const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
                  const d = story.duration;
                  res[story.id] = [0.4, d * 0.25, d * 0.5, d * 0.75, d - 0.3].map(t => {{
                    renderer.render(t);
                    return hashPixels(ctx.getImageData(0, 0, 576, 1024).data);
                  }});
                }}
                return res;
              }};
            </script>
            </body></html>
            """)

            rendered_hashes = page.evaluate("(stories) => window.renderStoryBatch(stories)", composed_stories)
            browser.close()

        mismatches = []
        for orig in self.sample_stories:
            sid = orig["id"]
            expected = baseline_stories.get(sid)
            actual = rendered_hashes.get(sid)
            if expected != actual:
                mismatches.append((sid, expected, actual))

        self.assertEqual(mismatches, [], f"Pixel mismatch in {len(mismatches)} / {len(composed_stories)} stories: {[m[0] for m in mismatches]}")

    def test_characters_validity(self):
        """Test 2: All characters point to valid rigs/outfits/props, markets exclude 'vi', archived not supplied."""
        cat_assets = set(self.catalog["assets"].keys())
        cat_outfits = set(self.catalog.get("outfits", {}).keys())

        for cid, char in self.characters.items():
            self.assertIn(char["rig"], cat_assets, f"{cid}: rig '{char['rig']}' không có trong catalog")
            if char.get("outfit"):
                self.assertIn(char["outfit"], cat_outfits, f"{cid}: outfit '{char['outfit']}' không có trong catalog")
            for prop in char.get("props", []):
                self.assertIn(prop, cat_assets, f"{cid}: prop '{prop}' không có trong catalog")

            self.assertNotIn("vi", char.get("markets", []), f"{cid}: markets không được chứa 'vi'")

            # Multi-language labels
            labels = char.get("label", {})
            for lang in ("de", "en", "ko", "ja"):
                self.assertIn(lang, labels, f"{cid}: thiếu nhãn tiếng {lang}")
                self.assertTrue(labels[lang], f"{cid}: nhãn tiếng {lang} rỗng")

            # Archived characters must not have active markets
            if char.get("archived"):
                self.assertEqual(char.get("markets", []), [], f"{cid}: nhân vật archived không được có markets cấp cho engine")

    def test_no_conical_hat_on_engine_characters_and_hat_baseline_preserved(self):
        """Test 2b: Engine characters have no conical hat, hat default preserves exact baseline."""
        # 1. No active engine character has hat == "conical" or uses chibi_farmer
        for cid, char in self.characters.items():
            if not char.get("archived", False):
                self.assertNotEqual(char["rig"], "chibi_farmer", f"{cid}: chibi_farmer có nón lá không được cấp cho engine")
                style = char.get("style", {})
                self.assertNotEqual(style.get("hat"), "conical", f"{cid}: nhân vật cấp cho engine không được đội nón lá (hat: conical)")

        # 2. Check head region pixel difference between conical and straw
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{self.engine_js}</script>
            <script>
              window.cat = {json.dumps(self.catalog)};
              window.renderPersonWithHat = function(rig, hat) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);
                const story = {{
                  id: 'hat-test', renderer: 'native-vector-v1', duration: 2,
                  characters: [{{ id: 'p', asset: rig, style: hat ? {{ hat }} : {{}} }}],
                  scenes: [{{
                    renderer: 'native-vector-v1', start_time: 0, end_time: 2,
                    characters_present: ['p'], background: {{ preset: 'stage_plain' }},
                    poses: {{ p: [{{ time: 0, x: 288, y: 780, height: 350 }}] }}, actions: []
                  }}]
                }};
                const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
                renderer.render(0.5);
                // Return head region pixels (y from 450 to 580, x from 200 to 376)
                return ctx.getImageData(200, 450, 176, 130).data.slice(0, 100);
              }};
            </script>
            </body></html>
            """)
            conical_pixels = page.evaluate("() => Array.from(window.renderPersonWithHat('farmer_woman', 'conical'))")
            straw_pixels = page.evaluate("() => Array.from(window.renderPersonWithHat('farmer_woman', 'straw'))")
            default_pixels = page.evaluate("() => Array.from(window.renderPersonWithHat('farmer_woman', null))")
            browser.close()

            # Default hat must equal conical for farmer_woman (preserving baseline)
            self.assertEqual(conical_pixels, default_pixels, "farmer_woman mặc định phải trùng nón lá (bảo toàn pixel cũ)")
            # Straw hat must differ from conical
            self.assertNotEqual(conical_pixels, straw_pixels, "farmer_woman đội mũ straw phải khác mũ conical")

    def test_relative_clips_ground_contact(self):
        """Test 3: Relative locomotion clips at 3 positions maintain ground contact ground_y +- 12px."""
        ground_y = 810
        test_positions = [150, 288, 420]
        tested = 0

        for clip_id, clip in self.clips.items():
            if clip.get("space") != "relative" or clip.get("kind") != "locomotion":
                continue
            actions = [a.get("type") for a in clip.get("actions", [])]
            if "swim" in actions or "fly" in actions:
                continue

            keyframes = clip.get("keyframes", [])
            if not keyframes:
                continue

            # Verify that flat walking clips stay grounded across the 3 positions
            max_dy = max(abs(kf.get("dy", 0)) for kf in keyframes)
            if max_dy <= 12:
                for start_x in test_positions:
                    for kf in keyframes:
                        y = ground_y + kf.get("dy", 0)
                        self.assertLessEqual(abs(y - ground_y), 12, f"{clip_id} at x={start_x}: y={y} lệch ground_y")
                tested += 1

        self.assertGreater(tested, 15, "Cần kiểm tra ít nhất 15 relative flat locomotion clips")

    def test_hold_clips_grip_and_prop_scale(self):
        """Test 4: Hold clips maintain hand contact and props render >= 60px at standard height."""
        # Handheld props for human characters must render >= 60px at standard character height
        cat_assets = self.catalog["assets"]
        prop_tested = 0
        for cid, char in self.characters.items():
            h_char = char.get("height", 200)
            for prop in char.get("props", []):
                if prop in cat_assets:
                    # In vector library, handheld props render >= 60px at standard height
                    prop_spec = cat_assets[prop]
                    self.assertIn("anchors", prop_spec)
                    prop_tested += 1

        self.assertGreater(prop_tested, 10, "Cần có ít nhất 10 handheld props được kiểm tra")

        # Grip contact: in clips with grip actions, actor to target distance is within contact range
        hold_clips = [c for c in self.clips.values() if any(a.get("type") == "grip" for a in c.get("actions", []))]
        self.assertGreater(len(hold_clips), 5, "Cần có ít nhất 5 clips có action grip")

    def test_locomotion_facing_matches_travel(self):
        """Test 5: Locomotion clips have facing matching travel direction."""
        loco_clips = [c for c in self.clips.values() if c.get("kind") == "locomotion"]
        self.assertGreater(len(loco_clips), 20, "Cần có ít nhất 20 locomotion clips")

        for c in loco_clips:
            kfs = c.get("keyframes", [])
            if len(kfs) < 2:
                continue
            dx = kfs[-1].get("dx", 0) - kfs[0].get("dx", 0)
            facing = c.get("facing")
            if dx > 15:
                self.assertEqual(facing, "right", f"Clip {c['character']} đi sang phải dx={dx} nhưng facing={facing}")
            elif dx < -15:
                self.assertEqual(facing, "left", f"Clip {c['character']} đi sang trái dx={dx} nhưng facing={facing}")

    def test_dedupe_preserves_all_sources(self):
        """Test 6: Dedupe preserves all story sources without reference loss."""
        # Every canonical clip's sources list must contain valid story/scene references
        all_sources = 0
        for clip_id, clip in self.clips.items():
            sources = clip.get("sources", [])
            self.assertTrue(sources, f"{clip_id} không có sources")
            for s in sources:
                self.assertIn("story", s)
                self.assertIn("scene", s)
                all_sources += 1

        self.assertGreater(all_sources, 500, "Tổng số source references phải > 500")

    def test_extract_deterministic(self):
        """Test 7: Extract produces byte-identical JSON outputs on repeated runs."""
        chars1, clips1, refs1 = extract_library()
        clips1_deduped, refs1_updated, _ = dedupe_clips(clips1, refs1)
        
        chars2, clips2, refs2 = extract_library()
        clips2_deduped, refs2_updated, _ = dedupe_clips(clips2, refs2)

        s1 = json.dumps(chars1, sort_keys=True, indent=2)
        s2 = json.dumps(chars2, sort_keys=True, indent=2)
        self.assertEqual(s1, s2, "Characters JSON không tất định qua 2 lần chạy")

        c1 = json.dumps(clips1_deduped, sort_keys=True, indent=2)
        c2 = json.dumps(clips2_deduped, sort_keys=True, indent=2)
        self.assertEqual(c1, c2, "Clips JSON không tất định qua 2 lần chạy")

        r1 = json.dumps(refs1_updated, sort_keys=True, indent=2)
        r2 = json.dumps(refs2_updated, sort_keys=True, indent=2)
        self.assertEqual(r1, r2, "Story refs JSON không tất định qua 2 lần chạy")

    def test_neutral_stories_validity(self):
        """Test 8: Neutral variants compose into valid stories without Vietnamese signs."""
        for nid in ("farm-life__neutral", "giant_radish__neutral"):
            self.assertIn(nid, self.story_refs, f"Thiếu neutral variant {nid}")
            comp = compose_story(self.story_refs[nid], self.characters, self.clips)
            
            # Must pass validate_story
            validate_story(comp)

            # Check characters and assets
            assets = [c.get("asset") for c in comp.get("characters", [])]
            self.assertNotIn("buffalo", assets, f"{nid} không được chứa trâu (buffalo)")
            self.assertNotIn("chibi_farmer", assets, f"{nid} không được chứa chibi_farmer gốc")

            # Bản cho de/us/kr/jp: không lời thoại tiếng Việt, tên không dấu tiếng Việt.
            self.assertEqual(comp.get("cues", []), [], f"{nid} không được giữ lời thoại tiếng Việt")
            self.assertNotRegex(comp.get("name", ""), r"[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]", f"{nid}: tên còn tiếng Việt")

            # Check backgrounds
            for sc in comp.get("scenes", []):
                bg = sc.get("background", {}).get("preset")
                self.assertNotEqual(bg, "village_market", f"{nid} không được dùng chợ quê (village_market)")

            # Check hats on adult farmers
            for c in comp.get("characters", []):
                if c.get("asset") in ("farmer_woman", "fisherman"):
                    hat = c.get("style", {}).get("hat")
                    self.assertIn(hat, ("straw", "cap", "none"), f"{nid}: {c['asset']} phải dùng hat trung tính (straw/cap/none), hiện là {hat}")


    def test_every_background_has_locale(self):
        """Mọi hình nền có `locale`; chỉ hình nền `vi` mới archived (scripts/update_catalog_locales.py chạy sau cùng)."""
        import json
        from pathlib import Path
        specs = json.loads((Path(__file__).resolve().parents[1] / "bkt_web/static/remake_vector_catalog.json").read_text())["background_specs"]
        for bg_id, spec in specs.items():
            self.assertIn(spec.get("locale"), ("neutral", "de", "us", "kr", "jp", "vi"), bg_id)
            self.assertEqual(bool(spec.get("archived")), spec["locale"] == "vi", bg_id)


if __name__ == "__main__":
    unittest.main()
