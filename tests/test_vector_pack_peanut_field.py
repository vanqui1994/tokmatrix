"""Tests for vector pack peanut_field (bụi lạc, mặt cắt đất, mặt gắn tóc/mi)."""
from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bkt_web.remake_vector import catalog, engine_sources, validate_story

PACK = "peanut_field"
JS_FILE = ROOT / "bkt_web" / "static" / "remake_vector_packs" / f"{PACK}.js"
RIGS = {"peanut_bush": "plant", "soil_inset": "prop", "face_tuft": "rig", "face_lashes": "rig"}


def story():
    """Bụi lạc 2 mặt bị chân ép, bong bóng mặt cắt, thẻ chuyển, tay trần nhổ cây."""
    def pose(t, x, y, h, **extra):
        return {"time": t, "x": x, "y": y, "height": h, **extra}

    chars = [
        {"id": "bush", "name": "Bụi lạc", "asset": "peanut_bush", "face": False},
        {"id": "top", "name": "Đọt", "asset": "face_tuft", "attach_to": {"id": "bush", "anchor": "shoot"}},
        {"id": "low", "name": "Gốc", "asset": "face_lashes", "attach_to": {"id": "bush", "anchor": "branch"}},
        {"id": "foot", "name": "Chân", "asset": "foot", "face": False},
        {"id": "inset", "name": "Mặt cắt", "asset": "soil_inset", "face": False},
        {"id": "hand", "name": "Tay", "asset": "hand", "face": False, "style": {"shirt": "#ecc9a0"}},
    ]
    scene = lambda start, end, poses, actions=(): {
        "renderer": "native-vector-v1", "kind": "scene", "start_time": start, "end_time": end,
        "characters_present": list(poses), "poses": poses, "actions": list(actions), "background": {"preset": "garden"}}
    return {
        "id": "peanut_field_check", "renderer": "native-vector-v1", "duration": 9, "characters": chars, "cues": [],
        "scenes": [
            scene(0, 4, {
                "bush": [pose(0, 288, 805, 360, growth=0.85)],
                "top": [pose(0, 0, 40, 95, z=3)], "low": [pose(0, 0, 22, 80, z=3, tears=1)],
                "foot": [pose(0, 420, 250, 240, z=4)],
                "inset": [pose(0, 288, 690, 360, growth=0, z=6), pose(4, 288, 690, 360, growth=1, z=6)],
            }, [{"type": "press", "start": 0.2, "end": 1.6, "target": "bush", "actor": "foot", "amount": 0.8}]),
            {"renderer": "native-vector-v1", "kind": "title", "start_time": 4, "end_time": 5, "text": "2000 năm sau",
             "characters_present": [], "poses": {}},
            scene(5, 9, {"bush": [pose(5, 270, 815, 330, growth=1)], "low": [pose(5, 0, 22, 80, z=3)],
                         "hand": [pose(5, 470, 560, 170, z=4)]},
                  [{"type": "uproot", "start": 5.2, "end": 7, "target": "bush", "actor": "hand"}]),
        ],
    }


class PeanutFieldPackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cat = catalog()

    def test_catalog_entries(self):
        self.assertIn(PACK, self.cat["engine_packs"])
        for rig, group in RIGS.items():
            meta = self.cat["assets"][rig]
            self.assertEqual(meta["pack"], PACK)
            self.assertEqual(meta["group"], group)
            self.assertIn("root", meta["anchors"])
        for anchor in ("shoot", "branch", "stem", "face"):
            self.assertIn(anchor, self.cat["assets"]["peanut_bush"]["anchors"])
        for action in ("press", "uproot", "grow"):
            self.assertIn("peanut_bush", self.cat["actions"][action]["targets"])
        for face in ("face_tuft", "face_lashes"):
            self.assertEqual(self.cat["assets"][face]["anchors"]["face"], self.cat["assets"]["face"]["anchors"]["face"])

    def test_pack_is_loaded_and_draws_no_text(self):
        self.assertIn(JS_FILE, engine_sources())
        source = re.sub(r"/\*.*?\*/", "", re.sub(r"//.*", "", JS_FILE.read_text(encoding="utf-8")), flags=re.S)
        self.assertNotIn("fillText", source)
        self.assertNotIn("strokeText", source)

    def test_plant_point_matches_core(self):
        # Hình bụi co theo cùng công thức plantPoint của core, nên mặt gắn shoot/branch bám đúng khi bị ép.
        core = (ROOT / "bkt_web" / "static" / "remake_vector_engine.js").read_text(encoding="utf-8")
        pack = JS_FILE.read_text(encoding="utf-8")
        self.assertIn("y * (.7 + .3 * s.growth) * (1 - .68 * s.bend)", core)
        self.assertIn("y * (.7 + .3 * clamp(s.growth)) * (1 - .68 * (s.bend || 0))", pack)
        self.assertIn("x * (1 + s.bend * .25)", core)
        self.assertIn("x * (1 + (s.bend || 0) * .25)", pack)

    def test_story_validates(self):
        validate_story(story())

    def test_story_renders_every_rig(self):
        from playwright.sync_api import sync_playwright

        js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--disable-gpu"])
            page = browser.new_page()
            page.set_content(f"<canvas id='c' width='576' height='1024'></canvas><script>{js}</script>")
            result = page.evaluate("""([story, cat]) => {
                const r = new RemakeVector.Renderer(document.getElementById('c'), cat, story);
                const out = {};
                for (const t of [0.1, 3.5, 4.5, 8.5]) {
                  const f = r.render(t);
                  out[t] = { scene: f.scene.kind, ids: Object.keys(f.states).filter(id => f.states[id].opacity > 0.5) };
                }
                const f = r.sample(3.5);
                out.bend = f.states.bush.bend;
                out.lift = r.sample(8.5).states.bush.lift;
                return out;
            }""", [story(), self.cat])
            browser.close()
        self.assertEqual(result["4.5"]["scene"], "title")
        self.assertTrue({"bush", "top", "low", "foot", "inset"} <= set(result["3.5"]["ids"]))
        self.assertTrue({"bush", "low", "hand"} <= set(result["8.5"]["ids"]))
        self.assertGreater(result["bend"], 0.7)  # press giữ bụi dẹt sau khi chân dừng (hold)
        self.assertGreater(result["lift"], 100)  # uproot nhấc bụi lên, lộ chùm củ


if __name__ == "__main__":
    unittest.main()
