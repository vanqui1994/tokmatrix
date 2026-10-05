"""Unit tests for myth_world pack (R5: ancient_mythology & folklore_legends).

Verifies:
1. Catalog registration: all rigs & backgrounds present, pack matches, valid labels, no group monster, valid anchors.
2. No fillText in JavaScript source code (zero text rule).
3. Rig geometry at height 200: width >= 60px, height >= 60px, no pixels at y < -100 rig space.
4. Background rendering: day, night, rain in portrait & landscape, no 64px solid color columns.
5. Storyboard builder & QA: all subjects build clean story with reveal+point, qa == [].
"""
import json
import sys
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bkt_web.remake_vector import catalog
from bkt_web.vector_video.cli import build

PACK_NAME = "myth_world"

RIGS = [
    "chibi_deity_greek",
    "chibi_deity_norse",
    "chibi_deity_egypt",
    "chibi_deity_jp",
    "chibi_deity_kr",
    "world_tree_yggdrasil",
    "thunder_hammer",
    "scale_of_truth",
    "myth_labyrinth",
    "wooden_horse_trojan",
    "yamata_serpent",
    "pandora_jar",
    "sun_barge",
    "prometheus_torch",
    "icarus_wings",
    "golden_lyre",
    "sisyphus_boulder",
    "myth_dragon"
]

BACKGROUNDS = [
    "olympus_clouds",
    "asgard_bridge",
    "duat_river",
    "takamagahara",
    "underworld_river"
]


class TestMythWorldPack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cat = catalog()
        pack_js = ROOT / "bkt_web" / "static" / "remake_vector_packs" / f"{PACK_NAME}.js"
        core_js = ROOT / "bkt_web" / "static" / "remake_vector_engine.js"
        cls.pack_code = pack_js.read_text(encoding="utf-8")
        cls.engine_js = core_js.read_text(encoding="utf-8") + "\n;\n" + cls.pack_code

    def test_catalog_contract(self):
        self.assertIn(PACK_NAME, self.cat["engine_packs"])
        for rig in RIGS:
            self.assertIn(rig, self.cat["assets"], f"Rig {rig} missing from catalog assets")
            spec = self.cat["assets"][rig]
            self.assertEqual(spec.get("pack"), PACK_NAME)
            self.assertTrue(spec.get("label"), f"Rig {rig} missing label")
            self.assertNotEqual(spec.get("group"), "monster", f"Rig {rig} cannot use group monster")
            self.assertIn("anchors", spec, f"Rig {rig} missing anchors")
            anchors = spec["anchors"]
            self.assertIn("root", anchors, f"Rig {rig} missing root anchor")
            self.assertIn("center", anchors, f"Rig {rig} missing center anchor")
            self.assertIn("top", anchors, f"Rig {rig} missing top anchor")
            for aname, apos in anchors.items():
                self.assertGreaterEqual(apos[1], -100.0, f"{rig}.{aname} y={apos[1]} < -100")

        for bg in BACKGROUNDS:
            self.assertIn(bg, self.cat["backgrounds"], f"Background {bg} missing from backgrounds list")
            self.assertIn(bg, self.cat["background_specs"], f"Background {bg} missing from background_specs")
            bg_spec = self.cat["background_specs"][bg]
            self.assertEqual(bg_spec.get("ground_y"), 810)
            self.assertTrue(bg_spec.get("label"))

    def test_no_fill_text_in_source(self):
        self.assertNotIn("fillText", self.pack_code, "Pack source must not use fillText (zero text rule)")

    def test_rig_geometry_at_height_200(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu"])
            page = browser.new_page()
            page.set_content(f"""
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{self.engine_js}</script>
            <script>
              window.cat = {json.dumps(self.cat)};
              window.measureRig = function(asset) {{
                const canvas = document.getElementById('stage');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, 576, 1024);

                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) return {{ error: 'No drawer registered for ' + asset }};

                ctx.save();
                ctx.translate(288, 700);
                ctx.scale(2.0, 2.0); // 100 units -> 200 px
                drawer(ctx, {{ asset }}, 0.5, window.cat, RemakeVector.kit);
                ctx.restore();

                const d = ctx.getImageData(0, 0, 576, 1024).data;
                let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
                let count = 0;
                for (let y = 0; y < 1024; y++) {{
                  for (let x = 0; x < 576; x++) {{
                    const i = (y * 576 + x) * 4;
                    if (d[i + 3] > 20) {{
                      count++;
                      if (x < x0) x0 = x;
                      if (x > x1) x1 = x;
                      if (y < y0) y0 = y;
                      if (y > y1) y1 = y;
                    }}
                  }}
                }}
                return {{ count, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }};
              }};
            </script>
            """)

            for rig in RIGS:
                res = page.evaluate(f'window.measureRig("{rig}")')
                self.assertNotIn("error", res, f"{rig}: {res.get('error')}")
                self.assertGreater(res["count"], 50, f"Rig {rig} rendered virtually no pixels: {res}")
                self.assertGreaterEqual(res["w"], 60, f"Rig {rig} width {res['w']}px < 60px at height 200")
                self.assertGreaterEqual(res["h"], 60, f"Rig {rig} height {res['h']}px < 60px at height 200")
                # Origin is at y=700. For rig units y in [-100, 0], pixel y should be in [500, 705]
                # y0 must not be < 500 (allow 5px margin: 495)
                self.assertGreaterEqual(res["y0"], 495, f"Rig {rig} renders outside y < -100 (pixel y={res['y0']})")

            browser.close()

    def test_backgrounds_render_vertical_and_horizontal(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu"])
            page = browser.new_page()
            page.set_content(f"""
            <canvas id="stage"></canvas>
            <script>{self.engine_js}</script>
            <script>
              window.cat = {json.dumps(self.cat)};
              window.renderBgTest = function(preset, timeOfDay, weather, isWide) {{
                const canvas = document.getElementById('stage');
                const story = {{
                  duration: 5,
                  frame: isWide ? 'landscape' : 'portrait',
                  characters: [],
                  scenes: [
                    {{
                      start_time: 0,
                      end_time: 5,
                      characters_present: [],
                      poses: {{}},
                      background: {{
                        preset: preset,
                        time: timeOfDay,
                        weather: weather,
                        ground_y: 810
                      }}
                    }}
                  ]
                }};
                const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
                renderer.render(0.5);

                const ctx = canvas.getContext('2d');
                if (isWide && canvas.width !== 1820) return {{ error: 'Width not 1820' }};
                if (!isWide && canvas.width !== 576) return {{ error: 'Width not 576' }};

                // Check for 64px solid vertical column in wide mode
                if (isWide) {{
                  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                  let hasBlankBand = false;
                  for (let startX = 0; startX < 1820 - 64; startX += 64) {{
                    let isMonochrome = true;
                    const baseR = d[(400 * 1820 + startX) * 4];
                    const baseG = d[(400 * 1820 + startX) * 4 + 1];
                    const baseB = d[(400 * 1820 + startX) * 4 + 2];
                    for (let x = startX; x < startX + 64; x += 8) {{
                      for (let y = 100; y < 800; y += 40) {{
                        const idx = (y * 1820 + x) * 4;
                        if (Math.abs(d[idx] - baseR) > 5 ||
                            Math.abs(d[idx + 1] - baseG) > 5 ||
                            Math.abs(d[idx + 2] - baseB) > 5) {{
                          isMonochrome = false;
                          break;
                        }}
                      }}
                      if (!isMonochrome) break;
                    }}
                    if (isMonochrome && (startX < 400 || startX > 800)) {{
                      hasBlankBand = true;
                      break;
                    }}
                  }}
                  return {{ ok: true, hasBlankBand }};
                }}
                return {{ ok: true, hasBlankBand: false }};
              }};
            </script>
            """)

            for bg in BACKGROUNDS:
                for tod, weather in [("day", "clear"), ("night", "clear"), ("day", "rain")]:
                    res_v = page.evaluate(f'window.renderBgTest("{bg}", "{tod}", "{weather}", false)')
                    self.assertTrue(res_v.get("ok"), f"Background {bg} failed vertical render: {res_v}")

                    res_h = page.evaluate(f'window.renderBgTest("{bg}", "{tod}", "{weather}", true)')
                    self.assertTrue(res_h.get("ok"), f"Background {bg} failed horizontal render: {res_h}")
                    self.assertFalse(res_h.get("hasBlankBand"), f"Background {bg} has a blank 64px band in wide mode")

            browser.close()

    def test_story_build_and_qa_for_all_subjects(self):
        frag_path = ROOT / "compare_studio" / "config" / "vector_niches.d" / f"{PACK_NAME}.json"
        frag = json.loads(frag_path.read_text(encoding="utf-8"))

        for sid, spec in frag["subjects"].items():
            setting = spec.get("settings", ["olympus_clouds"])[0]
            board = {
                "scenes": [
                    {"scene_index": 1, "setting": setting, "subject": sid, "mood": "happy",
                     "beats": [{"type": "enter", "who": "host"}]},
                    {"scene_index": 2, "setting": setting, "subject": sid, "mood": "surprised",
                     "beats": [{"type": "reveal", "who": "subject"}, {"type": "point", "who": "host"}]},
                    {"scene_index": 3, "setting": setting, "subject": "none", "mood": "happy",
                     "beats": [{"type": "celebrate", "who": "host"}]}
                ]
            }
            scenes_input = [
                {"start": 0.0, "duration": 4.0, "line": "First scene intro", "visual_intent": "host enters"},
                {"start": 4.2, "duration": 4.5, "line": f"Behold {spec['label']}", "visual_intent": f"reveal {sid}"},
                {"start": 8.9, "duration": 3.8, "line": "A myth from ancient times", "visual_intent": "celebrate"}
            ]
            payload = {
                "slug": f"test_{sid}",
                "lang": "en",
                "niche": "ancient_mythology",
                "channel_id": "test_myth_en",
                "total": 13.0,
                "scenes": scenes_input,
                "storyboard": board
            }
            result = build(payload)
            self.assertEqual(result["qa"], [], f"Subject {sid} failed QA: {result['qa']}")


if __name__ == "__main__":
    unittest.main()
