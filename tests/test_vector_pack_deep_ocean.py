"""Tests for vector pack deep_ocean (Nhóm R4)."""
from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bkt_web.remake_vector import catalog, engine_sources
from bkt_web.vector_video.cli import build
from bkt_web.vector_video.extents import extent

PACK_NAME = "deep_ocean"
JS_FILE = ROOT / "bkt_web" / "static" / "remake_vector_packs" / f"{PACK_NAME}.js"
FRAG_FILE = ROOT / "compare_studio" / "config" / "vector_niches.d" / f"{PACK_NAME}.json"

EXPECTED_RIGS = [
    "giant_squid", "sperm_whale", "bathyscaphe", "research_submarine",
    "hydrothermal_vent", "tube_worms", "sunken_liner", "rogue_wave",
    "bioluminescent_fish_swarm"
]

EXPECTED_BACKGROUNDS = [
    "trench_floor", "hydrothermal_field", "stormy_sea"
]


class DeepOceanPackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cat = catalog()
        cls.engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        cls.frag = json.loads(FRAG_FILE.read_text(encoding="utf-8"))

    def test_catalog_entries_and_pack_assignment(self):
        self.assertIn(PACK_NAME, self.cat["engine_packs"])
        for rig in EXPECTED_RIGS:
            self.assertIn(rig, self.cat["assets"], f"Rig {rig} must be in catalog assets")
            meta = self.cat["assets"][rig]
            self.assertEqual(meta.get("pack"), PACK_NAME, f"Rig {rig} pack must be {PACK_NAME}")
            self.assertTrue(meta.get("label"), f"Rig {rig} must have a label")
            self.assertIn("root", meta.get("anchors", {}), f"Rig {rig} must have root anchor")

        for bg in EXPECTED_BACKGROUNDS:
            self.assertIn(bg, self.cat["backgrounds"], f"Background {bg} must be in catalog backgrounds")
            self.assertIn(bg, self.cat["background_specs"], f"Background {bg} must be in background_specs")
            spec = self.cat["background_specs"][bg]
            self.assertEqual(spec.get("ground_y"), 810)
            self.assertTrue(spec.get("label"))
            self.assertEqual(len(spec.get("weather", [])), 7)

    def test_no_fill_text_in_pack_source(self):
        source = JS_FILE.read_text(encoding="utf-8")
        # Ensure neither fillText nor strokeText is called
        clean_code = re.sub(r"//.*", "", source)
        clean_code = re.sub(r"/\*.*?\*/", "", clean_code, flags=re.S)
        self.assertNotIn("fillText", clean_code, "Pack code must not call fillText")
        self.assertNotIn("strokeText", clean_code, "Pack code must not call strokeText")

    def test_rig_bounds_and_rendering(self):
        probe = {"x": 288, "y": 700, "height": 200}
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu"])
            page = browser.new_page()
            page.set_content(f"""
            <canvas id="stage" width="576" height="1024"></canvas>
            <script>{self.engine_js}</script>
            <script>
              window.cat = {json.dumps(self.cat)};
              RemakeVector.register({{ backgrounds: {{ test_blank: {{ label: 'b', theme: 'garden', ground_y: 900,
                draw(ctx, s) {{ const f = RemakeVector.kit.frameSpan(s); ctx.fillStyle = '#ff00ff'; ctx.fillRect(f.x0, 0, f.x1 - f.x0, 1024); }} }} }} }});
              window.measureRig = function(asset) {{
                const canvas = document.getElementById('stage');
                const probe = {json.dumps(probe)};
                const story = {{
                  id: 't-' + asset, renderer: 'native-vector-v1', duration: 1, cues: [], characters: [{{ id: 'a', name: 'a', asset }}],
                  scenes: [{{ renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 1, characters_present: ['a'],
                             poses: {{ a: [{{ time: 0, x: probe.x, y: probe.y, height: probe.height }}] }}, actions: [], background: {{ preset: 'test_blank' }} }}]
                }};
                new RemakeVector.Renderer(canvas, window.cat, story).render(0.5);
                const ctx = canvas.getContext('2d');
                const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
                for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {{
                  const i = (y * canvas.width + x) * 4;
                  const r = d[i], g = d[i + 1], b = d[i + 2];
                  if (g < 40 && r > 120 && b > 120 && Math.abs(r - b) < 40) continue;
                  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                }}
                return {{ x0, y0, x1, y1 }};
              }};
            </script>
            """)

            for rig in EXPECTED_RIGS:
                res = page.evaluate("(r) => window.measureRig(r)", rig)
                self.assertLess(res["x0"], res["x1"], f"Rig {rig} rendered nothing")
                w = res["x1"] - res["x0"] + 1
                h = res["y1"] - res["y0"] + 1
                self.assertGreaterEqual(w, 60, f"Rig {rig} width {w}px < 60px")
                self.assertGreaterEqual(h, 60, f"Rig {rig} height {h}px < 60px")

                # Check top limit: y0 must not exceed y < -100 relative to origin
                # Origin is at probe.y = 700; height = 200, so y = -100 corresponds to 700 - 200 = 500.
                self.assertGreaterEqual(res["y0"], 500 - 2, f"Rig {rig} draws outside y < -100 (y0={res['y0']})")
            browser.close()

    def test_backgrounds_render_portrait_and_landscape_without_solid_columns(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu"])
            page = browser.new_page()
            page.set_content(f"""
            <canvas id="stage_p" width="576" height="1024"></canvas>
            <canvas id="stage_l" width="1820" height="1024"></canvas>
            <script>{self.engine_js}</script>
            <script>
              window.cat = {json.dumps(self.cat)};
              window.renderAndCheckBg = function(preset, variant, isLandscape) {{
                const canvas = document.getElementById(isLandscape ? 'stage_l' : 'stage_p');
                const background = {{ preset }};
                if (variant === 'night') background.time = 'night';
                else if (variant === 'rain') background.weather = 'rain';
                const story = {{
                  id: 'bg-' + preset, renderer: 'native-vector-v1', duration: 1,
                  frame: isLandscape ? 'landscape' : 'portrait',
                  characters: [],
                  scenes: [{{ renderer: 'native-vector-v1', start_time: 0, end_time: 1,
                             characters_present: [], poses: {{}}, actions: [], background }}]
                }};
                new RemakeVector.Renderer(canvas, window.cat, story).render(0.5);
                const ctx = canvas.getContext('2d');
                const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                // Check for solid columns in landscape mode: no 64px window should have zero variance
                if (isLandscape) {{
                  const W = canvas.width, H = canvas.height;
                  // Sample variance across columns in blocks of 64px
                  for (let bx = 0; bx < W - 64; bx += 64) {{
                    let diffPixels = 0;
                    const baseIdx = (Math.floor(H / 2) * W + bx) * 4;
                    const r0 = d[baseIdx], g0 = d[baseIdx + 1], b0 = d[baseIdx + 2];
                    for (let x = bx; x < bx + 64; x += 8) {{
                      for (let y = 100; y < H - 100; y += 64) {{
                        const idx = (y * W + x) * 4;
                        if (Math.abs(d[idx] - r0) > 4 || Math.abs(d[idx + 1] - g0) > 4 || Math.abs(d[idx + 2] - b0) > 4) {{
                          diffPixels++;
                        }}
                      }}
                    }}
                    if (diffPixels === 0) return {{ solidColumn: bx }};
                  }}
                }}
                return {{ ok: true }};
              }};
            </script>
            """)

            for bg in EXPECTED_BACKGROUNDS:
                for variant in ["day", "night", "rain"]:
                    # Portrait
                    res_p = page.evaluate("([b, v]) => window.renderAndCheckBg(b, v, false)", [bg, variant])
                    self.assertTrue(res_p.get("ok"), f"Background {bg} ({variant}) portrait error: {res_p}")
                    # Landscape
                    res_l = page.evaluate("([b, v]) => window.renderAndCheckBg(b, v, true)", [bg, variant])
                    self.assertTrue(res_l.get("ok"), f"Background {bg} ({variant}) landscape solid column at x={res_l.get('solidColumn')}")
            browser.close()

    def test_storyboard_build_for_all_subjects(self):
        for sid, sdata in self.frag.get("subjects", {}).items():
            setting = sdata.get("settings", ["deep_sea"])[0]
            board = {
                "scenes": [{
                    "scene_index": 1,
                    "setting": setting,
                    "subject": sid,
                    "mood": "happy",
                    "beats": [
                        {"type": "reveal", "who": "subject"},
                        {"type": "point", "who": "host"}
                    ]
                }]
            }
            res = build({
                "slug": f"test_build_{sid}",
                "lang": "en",
                "niche": "ocean_mysteries",
                "channel_id": "test_ocean_ch",
                "total": 6.0,
                "scenes": [{"start": 0.0, "duration": 5.0, "line": f"Look at {sid}", "visual_intent": sid}],
                "storyboard": board
            })
            self.assertEqual(res["qa"], [], f"Subject {sid} failed QA: {res['qa']}")


if __name__ == "__main__":
    unittest.main()
