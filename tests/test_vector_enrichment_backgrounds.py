"""Chất lượng hình nền của các gói làm giàu (docs/PLAN_vector_enrichment.md).

Review 05/10: 14/34 nền để lộ màu nền mặc định của engine (#c0eff1, dải xanh nhạt giữa trời và đất) và nhiều nền
ngoài trời vẽ ngày y hệt đêm. Test vẽ từng nền ở khổ dọc + ngang, ngày + đêm:
- pixel màu mặc định ≤ 1 % khung;
- nền ngoài trời: ngày khác đêm (sai khác trung bình ≥ 4 / 255).
"""
import base64
import io
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PACKS = ["space_deep", "mystery_props", "wildlife_apex", "wildlife_weird", "deep_ocean", "body_more", "myth_world",
         "ancient_sites", "folk_spirits", "survival_scenes", "disaster_scenes", "tech_future"]
# Trong nhà / dưới đất / dưới biển sâu / ngoài không gian: không có ngày–đêm.
NO_DAYLIGHT = {"deep_space_view", "micro_world", "trench_floor", "hydrothermal_field", "sleep_lab", "mine_tunnel",
               "data_center", "chip_fab_clean_room", "duat_river", "underworld_river"}
DEFAULT_FILL = (192, 239, 241)


def pack_backgrounds(cat):
    out = {}
    for pack in PACKS:
        src = (ROOT / "bkt_web/static/remake_vector_packs" / f"{pack}.js").read_text(encoding="utf-8")
        for bg in re.findall(r"^\s{2,}['\"]?([a-z_0-9]+)['\"]?\s*:\s*\{\s*label", src, re.M):
            if bg in cat["background_specs"]:
                out[bg] = pack
    return out


class EnrichmentBackgroundTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        from PIL import Image
        from bkt_web.remake_vector import catalog, engine_sources

        cat = catalog()
        cls.backgrounds = pack_backgrounds(cat)
        js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        cls.images = {}
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu"])
            page = browser.new_page()
            page.set_content(f"<canvas id=s></canvas><script>{js}</script><script>window.cat={json.dumps(cat)};"
                             "window.f=(st,t)=>{const c=document.getElementById('s');new RemakeVector.Renderer(c,window.cat,st).render(t);return c.toDataURL('image/png')}</script>")
            for bg in cls.backgrounds:
                for time in ("day", "night"):
                    for frame in ("portrait", "landscape"):
                        story = {"id": "g", "renderer": "native-vector-v1", "duration": 1, "frame": frame, "cues": [], "characters": [],
                                 "scenes": [{"renderer": "native-vector-v1", "kind": "scene", "start_time": 0, "end_time": 1, "characters_present": [],
                                             "poses": {}, "actions": [], "background": {"preset": bg, "time": time}}]}
                        data = page.evaluate("a=>window.f(a,0.5)", story).split(",")[1]
                        cls.images[(bg, time, frame)] = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
            browser.close()

    def test_no_engine_default_fill_shows_through(self):
        for (bg, time, frame), im in self.images.items():
            with self.subTest(bg=bg, pack=self.backgrounds[bg], time=time, frame=frame):
                small = im.resize((im.width // 4, im.height // 4))
                px = list(small.getdata())
                share = sum(1 for c in px if all(abs(c[i] - DEFAULT_FILL[i]) < 3 for i in range(3))) / len(px)
                self.assertLessEqual(share, 0.01, f"{share:.0%} khung là màu mặc định #c0eff1 (nền vẽ thiếu)")

    def test_outdoor_backgrounds_change_between_day_and_night(self):
        from PIL import ImageChops, ImageStat
        for bg, pack in self.backgrounds.items():
            if bg in NO_DAYLIGHT:
                continue
            with self.subTest(bg=bg, pack=pack):
                diff = ImageStat.Stat(ImageChops.difference(self.images[(bg, "day", "portrait")], self.images[(bg, "night", "portrait")])).mean
                self.assertGreaterEqual(sum(diff) / 3, 4, "ngày và đêm vẽ y hệt nhau")


if __name__ == "__main__":
    unittest.main()
