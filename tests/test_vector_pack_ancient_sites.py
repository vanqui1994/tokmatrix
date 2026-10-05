"""Unit tests cho pack ancient_sites (R6)."""
import json
from pathlib import Path
import unittest

from playwright.sync_api import sync_playwright

from bkt_web.remake_vector import catalog, engine_sources
from bkt_web.vector_video.cli import build
from bkt_web.vector_video.extents import load_extents

ROOT = Path(__file__).resolve().parent.parent
PACK_JS = ROOT / "bkt_web" / "static" / "remake_vector_packs" / "ancient_sites.js"
NICHE_JSON = ROOT / "compare_studio" / "config" / "vector_niches.d" / "ancient_sites.json"

RIG_IDS = [
    "machu_picchu",
    "angkor_temple",
    "petra_facade",
    "nazca_geoglyph",
    "terracotta_warriors",
    "antikythera_mechanism",
    "gobekli_pillar",
    "underground_city",
    "ancient_library_scroll"
]

BACKGROUND_IDS = [
    "andes_terraces",
    "jungle_temple",
    "rock_canyon"
]


class TestVectorPackAncientSites(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cat = catalog()
        cls.extents = load_extents()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(args=["--disable-gpu"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def test_no_fill_text_in_source(self):
        source = PACK_JS.read_text(encoding="utf-8")
        self.assertNotIn("fillText", source, "File pack không được dùng fillText")

    def test_catalog_entries_and_pack_metadata(self):
        self.assertIn("ancient_sites", self.cat.get("engine_packs", []))

        for rid in RIG_IDS:
            self.assertIn(rid, self.cat["assets"])
            spec = self.cat["assets"][rid]
            self.assertEqual(spec.get("pack"), "ancient_sites")
            self.assertTrue(spec.get("label"), f"Rig {rid} phải có label tiếng Anh")
            self.assertIn("root", spec.get("anchors", {}))
            self.assertIn("center", spec.get("anchors", {}))
            self.assertIn("top", spec.get("anchors", {}))

        for bg in BACKGROUND_IDS:
            self.assertIn(bg, self.cat.get("backgrounds", []))
            self.assertIn(bg, self.cat.get("background_specs", {}))
            spec = self.cat["background_specs"][bg]
            self.assertEqual(spec.get("ground_y"), 810)
            self.assertTrue(spec.get("label"), f"Nền {bg} phải có label")

    def test_rigs_geometry_and_bounds_at_height_200(self):
        for rid in RIG_IDS:
            self.assertIn(rid, self.extents, f"Rig {rid} chưa đo extents")
            left, top, right, bottom = self.extents[rid]

            width_px = (right - left) * 200
            height_px = (bottom - top) * 200

            self.assertGreaterEqual(width_px, 60.0, f"Rig {rid} chiều rộng {width_px:.1f}px < 60px")
            self.assertGreaterEqual(height_px, 60.0, f"Rig {rid} chiều cao {height_px:.1f}px < 60px")
            self.assertGreaterEqual(top, -1.0, f"Rig {rid} có pixel ở y < -100 (top = {top:.3f})")

    def test_backgrounds_render_day_night_rain_and_wide_columns(self):
        js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        page = self.browser.new_page()
        page.set_content(f"""
        <canvas id="stage"></canvas>
        <script>{js}</script>
        <script>
        window.cat = {json.dumps(self.cat)};
        window.testBg = (preset, timeOfDay, weather, isLandscape) => {{
            const canvas = document.getElementById("stage");
            const frame = isLandscape ? "landscape" : "portrait";
            const story = {{
                id: "bg_t", renderer: "native-vector-v1", duration: 1, frame,
                characters: [],
                scenes: [{{ renderer: "native-vector-v1", kind: "scene", start_time: 0, end_time: 1,
                            characters_present: [], poses: {{}}, actions: [],
                            background: {{ preset, timeOfDay, weather }} }}]
            }};
            const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
            renderer.render(0.5);
            const w = canvas.width, h = canvas.height;
            const ctx = canvas.getContext("2d");
            const d = ctx.getImageData(0, 0, w, h).data;
            if (isLandscape) {{
                for (let x = 0; x < w - 64; x += 64) {{
                    const r0 = d[(0 * w + x) * 4], g0 = d[(0 * w + x) * 4 + 1], b0 = d[(0 * w + x) * 4 + 2];
                    let solid = true;
                    for (let y = 0; y < h; y += 16) {{
                        for (let cx = x; cx < x + 64; cx += 8) {{
                            const idx = (y * w + cx) * 4;
                            if (Math.abs(d[idx] - r0) > 6 || Math.abs(d[idx+1] - g0) > 6 || Math.abs(d[idx+2] - b0) > 6) {{
                                solid = false;
                                break;
                            }}
                        }}
                        if (!solid) break;
                    }}
                    if (solid) return {{ error: "Solid monochrome column found at x=" + x }};
                }}
            }}
            return {{ ok: true }};
        }};
        </script>
        """)

        variants = [("day", "clear"), ("night", "clear"), ("day", "rain")]
        for bg in BACKGROUND_IDS:
            for tod, wth in variants:
                for is_land in (False, True):
                    res = page.evaluate("([b, t, w, l]) => window.testBg(b, t, w, l)", [bg, tod, wth, is_land])
                    self.assertTrue(res.get("ok"), f"Lỗi render nền {bg} (tod={tod}, wth={wth}, land={is_land}): {res}")
        page.close()

    def test_niche_story_builder_qa_clean_for_all_subjects(self):
        niche_data = json.loads(NICHE_JSON.read_text(encoding="utf-8"))
        subjects = niche_data.get("subjects", {})

        lines = [
            "We travel back in time to an ancient wonder.",
            "A remarkable discovery appears before our eyes.",
            "Its timeless beauty continues to inspire us today."
        ]
        scenes = [
            {"start": 0.0, "duration": 4.0, "line": lines[0], "visual_intent": lines[0]},
            {"start": 4.2, "duration": 4.0, "line": lines[1], "visual_intent": lines[1]},
            {"start": 8.4, "duration": 4.0, "line": lines[2], "visual_intent": lines[2]}
        ]

        for sid, sdata in subjects.items():
            setting = sdata.get("settings", ["andes_terraces"])[0]
            board = {
                "scenes": [
                    {"scene_index": 1, "setting": setting, "subject": "none", "mood": "neutral",
                     "beats": [{"type": "enter", "who": "host"}]},
                    {"scene_index": 2, "setting": setting, "subject": sid, "mood": "neutral",
                     "beats": [{"type": "reveal", "who": "subject"}, {"type": "point", "who": "host"}]},
                    {"scene_index": 3, "setting": setting, "subject": "none", "mood": "neutral",
                     "beats": [{"type": "exit", "who": "host"}]}
                ]
            }
            res = build({
                "slug": f"test-build-{sid}",
                "lang": "en",
                "niche": "lost_civilizations",
                "channel_id": "lost_civilizations_en_test",
                "total": 13.0,
                "scenes": scenes,
                "storyboard": board
            })
            self.assertEqual(res["qa"], [], f"Subject {sid} bị lỗi QA: {res['qa']}")
            self.assertEqual(res["storyboard_source"], "llm", f"Subject {sid} không dùng được storyboard LLM")


if __name__ == "__main__":
    unittest.main()
