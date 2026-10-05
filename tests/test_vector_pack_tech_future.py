"""Unit tests for tech_future pack (R11).

Verifies:
1. Catalog registration: all rigs & backgrounds present, pack matches, valid labels, no group monster.
2. No fillText in JavaScript source code.
3. Rig geometry at height 200: width >= 60px, height >= 60px, no pixels at y < -100 rig space.
4. Background rendering: day, night, rain in portrait & landscape, no 64px solid color columns.
5. Storyboard builder & QA: all subjects build clean story with reveal+point, qa == [].
"""
import json
import re
import sys
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bkt_web.remake_vector import catalog, engine_sources
from bkt_web.vector_video.cli import build

PACK_NAME = "tech_future"
RIGS = [
    "friendly_robot",
    "ai_chip",
    "server_rack",
    "undersea_cable",
    "satellite_gps",
    "lithium_battery",
    "autonomous_car",
    "quantum_computer",
    "ai_chat_bubble",
    "telecom_tower",
]
BACKGROUNDS = [
    "data_center",
    "smart_city",
    "chip_fab_clean_room",
]


class TestTechFuturePack(unittest.TestCase):
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
            self.assertIn("root", spec["anchors"])
            self.assertIn("center", spec["anchors"])
            self.assertIn("top", spec["anchors"])

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
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, 576, 1024);

                const story = {{
                  id: 'geo-test', renderer: 'native-vector-v1', duration: 1, cues: [],
                  characters: [{{ id: 'a', name: 'a', asset: asset }}],
                  scenes: [{{
                    renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 1,
                    characters_present: ['a'],
                    poses: {{ a: [{{ time: 0, x: 288, y: 700, height: 200 }}] }},
                    actions: [], background: {{ preset: 'garden' }}
                  }}]
                }};
                const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
                ctx.clearRect(0, 0, 576, 1024);
                const drawer = RemakeVector.kit.RIG_DRAWERS[asset];
                if (!drawer) return {{ error: 'No drawer registered for ' + asset }};

                ctx.save();
                ctx.translate(288, 700);
                ctx.scale(2.0, 2.0); // 100 units -> 200 px
                drawer(ctx, {{ asset }}, 0, window.cat, RemakeVector.kit);
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
              window.renderBgTest = function(preset, timeOfDay, weather) {{
                const canvas = document.getElementById('stage');
                canvas.width = 576; canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const bgDef = RemakeVector.kit.BACKGROUNDS[preset];
                if (!bgDef) return {{ error: 'No background registered for ' + preset }};
                const settings = {{ preset, time: timeOfDay, weather, ground_y: 810, frame: {{ w: 576, h: 1024 }} }};
                bgDef.draw(ctx, settings, 0.5, RemakeVector.kit);
                return {{ ok: true }};
              }};

              window.columnStats = function(preset, timeOfDay, weather) {{
                const canvas = document.getElementById('stage');
                canvas.width = 1820; canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const bgDef = RemakeVector.kit.BACKGROUNDS[preset];
                if (!bgDef) return {{ error: 'No background registered for ' + preset }};
                const settings = {{ preset, time: timeOfDay, weather, ground_y: 810, frame: {{ w: 1820, h: 1024 }} }};
                bgDef.draw(ctx, settings, 0.5, RemakeVector.kit);

                const W = 1820, H = 1024, d = ctx.getImageData(0, 0, W, H).data;
                const starts = [];
                for (let x = 0; x + 64 <= W; x += 64) starts.push(x);
                if (starts[starts.length - 1] !== W - 64) starts.push(W - 64);
                const colors = [], bands = [];
                for (const x0 of starts) {{
                  const seen = new Set(), b = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
                  for (let y = 0; y < H; y += 4) for (let x = x0; x < x0 + 64; x += 4) {{
                    const i = (y * W + x) * 4, k = Math.min(2, Math.floor(y * 3 / H));
                    seen.add(((d[i] >> 3) << 10) | ((d[i+1] >> 3) << 5) | (d[i+2] >> 3));
                    b[k][0] += d[i]; b[k][1] += d[i+1]; b[k][2] += d[i+2]; b[k][3]++;
                  }}
                  colors.push(seen.size);
                  bands.push(b.map(v => [v[0] / v[3], v[1] / v[3], v[2] / v[3]]));
                }}
                let jump = 0, at = -1;
                for (let i = 1; i < bands.length; i++) for (let k = 0; k < 3; k++) {{
                  if (starts[i] < 576) continue;
                  const dd = Math.hypot(...bands[i][k].map((v, j) => v - bands[i - 1][k][j]));
                  if (dd > jump) {{ jump = dd; at = starts[i]; }}
                }}
                return {{ ok: true, minColors: Math.min(...colors), jump, at }};
              }};
            </script>
            """)

            for bg in BACKGROUNDS:
                for tod, weather in [("day", "clear"), ("night", "clear"), ("day", "rain")]:
                    # Vertical
                    res_v = page.evaluate(f'window.renderBgTest("{bg}", "{tod}", "{weather}")')
                    self.assertTrue(res_v.get("ok"), f"Background {bg} failed vertical render: {res_v}")

                    # Horizontal standard columnStats check
                    stats = page.evaluate(f'window.columnStats("{bg}", "{tod}", "{weather}")')
                    self.assertTrue(stats.get("ok"), f"Background {bg} error: {stats.get('error')}")
                    self.assertGreaterEqual(stats["minColors"], 2, f"Background {bg} ({tod}, {weather}) has solid color band")
                    self.assertLess(stats["jump"], 150, f"Background {bg} ({tod}, {weather}) has jump at x={stats['at']}")

            browser.close()

    def test_story_build_and_qa_for_all_subjects(self):
        frag_path = ROOT / "compare_studio" / "config" / "vector_niches.d" / f"{PACK_NAME}.json"
        frag = json.loads(frag_path.read_text(encoding="utf-8"))

        for sid, spec in frag["subjects"].items():
            board = {
                "scenes": [
                    {"scene_index": 1, "setting": spec.get("settings", ["tech_lab"])[0], "subject": sid, "mood": "happy",
                     "beats": [{"type": "enter", "who": "host"}]},
                    {"scene_index": 2, "setting": spec.get("settings", ["tech_lab"])[0], "subject": sid, "mood": "surprised",
                     "beats": [{"type": "reveal", "who": "subject"}, {"type": "point", "who": "host"}]},
                    {"scene_index": 3, "setting": spec.get("settings", ["tech_lab"])[0], "subject": "none", "mood": "happy",
                     "beats": [{"type": "celebrate", "who": "host"}]}
                ]
            }
            scenes_input = [
                {"start": 0.0, "duration": 4.0, "line": "First scene intro", "visual_intent": "host enters"},
                {"start": 4.2, "duration": 4.5, "line": f"Look at this {spec['label']}", "visual_intent": f"reveal {sid}"},
                {"start": 8.9, "duration": 3.8, "line": "Future technology connects our world", "visual_intent": "celebrate"}
            ]
            payload = {
                "slug": f"test_{sid}",
                "lang": "en",
                "niche": "tech_ai_future",
                "channel_id": "test_tech_en",
                "total": 13.0,
                "scenes": scenes_input,
                "storyboard": board
            }
            result = build(payload)
            self.assertEqual(result["qa"], [], f"Subject {sid} failed QA: {result['qa']}")


if __name__ == "__main__":
    unittest.main()
