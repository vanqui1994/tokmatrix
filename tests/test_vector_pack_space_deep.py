"""Unit tests for space_deep vector pack (Agent A)."""
from __future__ import annotations

import copy
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bkt_web.remake_vector import catalog, engine_sources
from bkt_web.vector_video.extents import load_extents
from bkt_web.vector_video.niches import merge

PACK_ID = "space_deep"
RIG_IDS = [
    "black_hole",
    "neutron_star",
    "spiral_galaxy",
    "nebula",
    "space_telescope",
    "space_probe",
    "pluto",
    "asteroid",
    "shooting_star",
    "exoplanet_lava"
]
BACKGROUND_IDS = [
    "deep_space_view",
    "observatory_night"
]
WEATHER_LIST = ["clear", "rain", "snow", "wind", "fog", "storm", "hot"]


class SpaceDeepPackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cat = catalog()
        cls.extents = load_extents()

    def test_catalog_metadata(self):
        self.assertIn(PACK_ID, self.cat.get("engine_packs", []))

        # Check rigs
        for rid in RIG_IDS:
            self.assertIn(rid, self.cat["assets"], f"Rig {rid} missing from catalog assets")
            spec = self.cat["assets"][rid]
            self.assertEqual(spec.get("pack"), PACK_ID)
            self.assertTrue(spec.get("label"), f"Rig {rid} missing label")
            self.assertTrue(spec.get("group"), f"Rig {rid} missing group")
            self.assertNotEqual(spec.get("group"), "monster", "Group monster is prohibited")
            self.assertTrue(spec.get("topics"), f"Rig {rid} missing topics")
            self.assertIsInstance(spec.get("anchors"), dict, f"Rig {rid} missing anchors")
            self.assertIn("root", spec["anchors"], f"Rig {rid} missing root anchor")
            self.assertIn("center", spec["anchors"], f"Rig {rid} missing center anchor")

        # Check backgrounds
        for bg in BACKGROUND_IDS:
            self.assertIn(bg, self.cat.get("backgrounds", []), f"Background {bg} missing from catalog backgrounds")
            self.assertIn(bg, self.cat.get("background_specs", {}), f"Background {bg} missing from background_specs")
            spec = self.cat["background_specs"][bg]
            self.assertEqual(spec.get("ground_y"), 810, f"Background {bg} ground_y must be 810")
            for w in WEATHER_LIST:
                self.assertIn(w, spec.get("weather", []), f"Background {bg} missing weather {w}")

    def test_no_filltext(self):
        pack_file = ROOT / "bkt_web" / "static" / "remake_vector_packs" / f"{PACK_ID}.js"
        self.assertTrue(pack_file.exists(), f"Pack JS file {pack_file} not found")
        content = pack_file.read_text(encoding="utf-8")
        # Remove comments before checking
        no_line_comments = re.sub(r"//.*", "", content)
        no_comments = re.sub(r"/\*[\s\S]*?\*/", "", no_line_comments)
        self.assertNotIn("fillText", no_comments, "fillText is strictly prohibited in vector pack JS")

    def test_rig_extents(self):
        for rid in RIG_IDS:
            self.assertIn(rid, self.extents, f"Rig {rid} not measured in extents")
            l, t, r, b = self.extents[rid]
            w = (r - l) * 200
            h = (b - t) * 200
            self.assertGreaterEqual(w, 60.0, f"Rig {rid} width {w:.1f} < 60px at height 200")
            self.assertGreaterEqual(h, 60.0, f"Rig {rid} height {h:.1f} < 60px at height 200")
            # Bottom touches or is near ground
            self.assertLessEqual(b, 0.05, f"Rig {rid} bottom {b:.2f} > 0.05 (floating above ground)")

    def test_niche_fragment(self):
        frag_path = ROOT / "compare_studio" / "config" / "vector_niches.d" / f"{PACK_ID}.json"
        self.assertTrue(frag_path.exists(), f"Fragment {frag_path} not found")
        frag = json.loads(frag_path.read_text(encoding="utf-8"))

        base_path = ROOT / "compare_studio" / "config" / "vector_niches.json"
        base = json.loads(base_path.read_text(encoding="utf-8"))
        merged = merge(copy.deepcopy(base), frag)

        # R1 requirement: black_hole and neutron_star must have float: true
        self.assertTrue(frag["subjects"]["black_hole"].get("float"), "black_hole must have float: true")
        self.assertTrue(frag["subjects"]["neutron_star"].get("float"), "neutron_star must have float: true")

        # Verify subjects present in deep_space
        deep_space_subjects = set(merged["niches"]["deep_space"]["subjects"])
        for rid in RIG_IDS:
            self.assertIn(rid, deep_space_subjects, f"Subject {rid} not in deep_space niche")

        # Verify asteroid, shooting_star, black_hole in mega_catastrophes
        catastrophe_subjects = set(merged["niches"]["mega_catastrophes"]["subjects"])
        for rid in ["asteroid", "shooting_star", "black_hole"]:
            self.assertIn(rid, catastrophe_subjects, f"Subject {rid} not in mega_catastrophes niche")

    def test_backgrounds_render_portrait_and_landscape(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.skipTest("Playwright not available")

        sources = engine_sources()
        js_code = "\n;\n".join(src.read_text(encoding="utf-8") for src in sources)

        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization"])
            page = browser.new_page()
            page.set_content(f"""
            <html><body>
            <canvas id="c"></canvas>
            <script>{js_code}</script>
            <script>
            window.cat = {json.dumps(self.cat)};
            window.renderBg = (bg, frameMode, timeOfDay) => {{
                const canvas = document.getElementById('c');
                const story = {{
                    id: 'test_bg', renderer: 'native-vector-v1', duration: 1,
                    frame: frameMode,
                    characters: [],
                    scenes: [{{
                        renderer: 'native-vector-v1', start_time: 0, end_time: 1,
                        background: {{ preset: bg, timeOfDay: timeOfDay }},
                        characters_present: [], poses: {{}}, actions: []
                    }}]
                }};
                const r = new RemakeVector.Renderer(canvas, window.cat, story);
                r.render(0.5);
                const w = canvas.width;
                const h = canvas.height;
                const ctx = canvas.getContext('2d');
                const data = ctx.getImageData(0, 0, w, h).data;
                // Check 64px borders (left and right) for blank columns
                let leftBlank = true, rightBlank = true;
                for (let y = 0; y < h; y += 8) {{
                    const iLeft = y * w * 4;
                    const iRight = (y * w + (w - 1)) * 4;
                    if (data[iLeft + 3] !== 0) leftBlank = false;
                    if (data[iRight + 3] !== 0) rightBlank = false;
                }}
                return {{ leftBlank, rightBlank }};
            }};
            </script>
            </body></html>
            """)

            for bg in BACKGROUND_IDS:
                for tod in ["day", "night"]:
                    # Portrait: 576x1024
                    res_p = page.evaluate("([bg, tod]) => window.renderBg(bg, 'portrait', tod)", [bg, tod])
                    self.assertFalse(res_p["leftBlank"], f"{bg} portrait left border is blank")
                    self.assertFalse(res_p["rightBlank"], f"{bg} portrait right border is blank")

                    # Landscape: 1820x1024
                    res_l = page.evaluate("([bg, tod]) => window.renderBg(bg, 'landscape', tod)", [bg, tod])
                    self.assertFalse(res_l["leftBlank"], f"{bg} landscape left border is blank")
                    self.assertFalse(res_l["rightBlank"], f"{bg} landscape right border is blank")

            browser.close()


if __name__ == "__main__":
    unittest.main()
