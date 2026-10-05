"""Test riêng cho gói wildlife_weird (Nhóm R3, docs/PLAN_vector_enrichment.md §4).
Yêu cầu kiểm thử:
- mọi rig/nền của gói có trong catalog, đúng pack, có label; register không trùng id;
- vẽ từng rig ở height 200 trên nền trơn: khung bao ≥ 60 px mỗi chiều, không pixel ở y < -100 tính theo khung rig;
- mỗi nền: ngày + đêm + mưa đều vẽ được ở khổ dọc và ngang, khổ ngang không có cột 64 px một màu;
- không gọi fillText trong file gói (đọc mã nguồn);
- mỗi subject trong vector_niches.d/wildlife_weird.json dựng được story qua bkt_web.vector_video.cli.build
  với storyboard có reveal + point vật đó, qa == [].
"""
from __future__ import annotations

import copy
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
from bkt_web.vector_video.extents import load_extents
from bkt_web.vector_video.niches import allowed, load

PACK_FILE = ROOT / "bkt_web" / "static" / "remake_vector_packs" / "wildlife_weird.js"
FRAGMENT_FILE = ROOT / "compare_studio" / "config" / "vector_niches.d" / "wildlife_weird.json"

RIGS = [
    "mantis_shrimp",
    "tardigrade",
    "axolotl",
    "greenland_shark",
    "electric_eel",
    "bombardier_beetle",
    "wood_frog",
    "naked_mole_rat",
    "archerfish",
    "arctic_tern"
]

BACKGROUNDS = [
    "micro_world"
]


class WildlifeWeirdPackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cat = catalog()
        sources = engine_sources()
        cls.js = "\n;\n".join(src.read_text(encoding="utf-8") for src in sources)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(args=["--disable-gpu"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def test_no_filltext_in_source(self):
        source = PACK_FILE.read_text(encoding="utf-8")
        self.assertNotIn("fillText", source, "Gói vector không được dùng fillText vẽ chữ lên canvas")

    def test_catalog_registration_and_labels(self):
        for rig in RIGS:
            self.assertIn(rig, self.cat["assets"], f"rig {rig} chưa có trong catalog['assets']")
            spec = self.cat["assets"][rig]
            self.assertEqual(spec.get("pack"), "wildlife_weird")
            self.assertTrue(spec.get("label"), f"rig {rig} thiếu label")
            self.assertTrue(spec["label"].startswith("a ") or spec["label"].startswith("an "), f"rig {rig} label phải bắt đầu bằng a/an")
            self.assertIn("root", spec.get("anchors", {}), f"rig {rig} thiếu anchor root")

        for bg in BACKGROUNDS:
            self.assertIn(bg, self.cat["backgrounds"], f"nền {bg} chưa có trong catalog['backgrounds']")
            self.assertIn(bg, self.cat["background_specs"], f"nền {bg} chưa có trong catalog['background_specs']")
            spec = self.cat["background_specs"][bg]
            self.assertEqual(spec.get("ground_y"), 810)

    def test_render_rigs_geometry_and_bounds(self):
        """Vẽ từng rig ở height 200 trên nền trơn: khung bao ≥ 60 px mỗi chiều, không pixel ở y < -100."""
        page = self.browser.new_page()
        page_js = """
        RemakeVector.register({ backgrounds: { measure_blank: { label: 'measure', theme: 'garden', ground_y: 900,
          draw(ctx, s) { const f = RemakeVector.kit.frameSpan(s); ctx.fillStyle = '#ff00ff'; ctx.fillRect(f.x0, 0, f.x1 - f.x0, 1024); } } } });
        window.probeRig = (asset) => {
            const canvas = document.createElement('canvas');
            canvas.width = 576; canvas.height = 1024;
            const probe = { x: 288, y: 700, height: 200 };
            const story = {
                id: 'p', renderer: 'native-vector-v1', duration: 1, cues: [],
                characters: [{ id: 'a', name: 'a', asset }],
                scenes: [{ renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 1,
                           characters_present: ['a'], poses: { a: [{ time: 0, x: probe.x, y: probe.y, height: probe.height }] },
                           actions: [], background: { preset: 'measure_blank' } }]
            };
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            new RemakeVector.Renderer(canvas, window.cat, story).render(0.5);
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                const r = d[i], g = d[i+1], b = d[i+2];
                if (g < 40 && r > 120 && b > 120 && Math.abs(r - b) < 40) continue;
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
            return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1, relTop: (y0 - probe.y) / (probe.height / 100) };
        };
        """
        page.set_content(f"<script>{self.js}</script><script>window.cat={json.dumps(self.cat)};</script><script>{page_js}</script>")
        for rig in RIGS:
            res = page.evaluate("(asset) => window.probeRig(asset)", rig)
            self.assertGreaterEqual(res["width"], 60, f"rig {rig} width {res['width']} < 60px")
            self.assertGreaterEqual(res["height"], 60, f"rig {rig} height {res['height']} < 60px")
            self.assertGreaterEqual(res["relTop"], -100.5, f"rig {rig} vẽ pixel ở y < -100 ({res['relTop']})")
        page.close()

    def test_backgrounds_render_vertical_and_widescreen(self):
        """Mỗi nền: ngày + đêm + mưa vẽ được ở khổ dọc và ngang; khổ ngang không có dải 64 px một màu."""
        page = self.browser.new_page()
        page_js = """
        window.probeBg = (preset, settings, isWide) => {
            const canvas = document.createElement('canvas');
            canvas.width = isWide ? 1820 : 576;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const story = {
                id: 'b', renderer: 'native-vector-v1', duration: 1, cues: [], characters: [],
                scenes: [{ renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 1,
                           characters_present: [], poses: {}, actions: [],
                           background: { preset, ...settings } }]
            };
            new RemakeVector.Renderer(canvas, window.cat, story).render(0.5);
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let magentaCount = 0;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i+1], b = d[i+2];
                if (g < 40 && r > 200 && b > 200) magentaCount++;
            }
            // Khổ ngang: không có cột 64px đơn sắc (tất cả pixel trong cột 64px có cùng màu từ trên xuống dưới)
            let solidBlocks = 0;
            if (isWide) {
                for (let x = 0; x < canvas.width - 64; x += 64) {
                    let mono = true;
                    const idx0 = x * 4;
                    const r0 = d[idx0], g0 = d[idx0+1], b0 = d[idx0+2];
                    for (let y = 100; y < 900; y += 100) {
                        for (let dx = 0; dx < 64; dx += 16) {
                            const idx = (y * canvas.width + (x + dx)) * 4;
                            if (Math.abs(d[idx] - r0) > 5 || Math.abs(d[idx+1] - g0) > 5 || Math.abs(d[idx+2] - b0) > 5) {
                                mono = false;
                                break;
                            }
                        }
                        if (!mono) break;
                    }
                    if (mono) solidBlocks++;
                }
            }
            return { drawn: magentaCount < d.length / 4 * 0.1, solidBlocks };
        };
        """
        page.set_content(f"<script>{self.js}</script><script>window.cat={json.dumps(self.cat)};</script><script>{page_js}</script>")
        for bg in BACKGROUNDS:
            for is_wide in (False, True):
                for weather, night in [("clear", False), ("clear", True), ("rain", False)]:
                    res = page.evaluate("([preset, s, w]) => window.probeBg(preset, s, w)", [bg, {"weather": weather, "night": night}, is_wide])
                    self.assertTrue(res["drawn"], f"nền {bg} không vẽ được (weather={weather}, night={night}, wide={is_wide})")
                    if is_wide:
                        self.assertEqual(res["solidBlocks"], 0, f"nền {bg} có khối cột 64px đơn sắc trong khổ ngang")
        page.close()

    def test_subjects_build_story_and_pass_qa(self):
        frag = json.loads(FRAGMENT_FILE.read_text(encoding="utf-8"))
        scenes = [
            {"start": 0.0, "duration": 3.6, "line": "Intro scene", "visual_intent": "Intro"},
            {"start": 3.8, "duration": 4.0, "line": "Subject reveal scene", "visual_intent": "Reveal"},
            {"start": 8.0, "duration": 3.5, "line": "Outro scene", "visual_intent": "Outro"}
        ]
        total = 12.0
        for sid, spec in frag.get("subjects", {}).items():
            setting = spec["settings"][0]
            board = {
                "scenes": [
                    {"scene_index": 1, "setting": setting, "subject": "none", "mood": "happy", "beats": [{"type": "enter", "who": "host"}]},
                    {"scene_index": 2, "setting": setting, "subject": sid, "mood": "surprised", "beats": [{"type": "reveal", "who": "subject"}, {"type": "point", "who": "host"}]},
                    {"scene_index": 3, "setting": setting, "subject": "none", "mood": "happy", "beats": [{"type": "celebrate", "who": "host"}]}
                ]
            }
            res = build({
                "slug": f"test_{sid}",
                "lang": "en",
                "niche": "extreme_wildlife",
                "channel_id": "test_weird",
                "total": total,
                "scenes": scenes,
                "storyboard": board
            })
            self.assertEqual(res["qa"], [], f"Subject {sid} thất bại QA: {res['qa']}")
            self.assertEqual(res["storyboard_source"], "llm")


if __name__ == "__main__":
    unittest.main()
