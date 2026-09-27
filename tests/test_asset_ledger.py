import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image

from bkt_web import asset_ledger


def _image(path: Path, seed: int) -> None:
    rng = np.random.default_rng(seed)
    Image.fromarray(rng.integers(0, 255, (96, 54, 3), dtype=np.uint8)).resize((270, 480)).save(path)


class AssetLedgerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.videos = root / "videos"
        self.db = root / "ledger.db"
        for slug, seeds in {"a": (1, 2), "b": (3, 4), "c": (2, 5)}.items():
            images = self.videos / slug / "assets" / "images"
            images.mkdir(parents=True)
            for n, seed in enumerate(seeds, start=1):
                _image(images / f"scene-{n}.jpg", seed)
        (self.videos / "a" / "images.json").write_text(json.dumps({"version": 1, "items": {
            "scene-1": {"dest": "assets/images/scene-1.jpg", "source": "antigravity", "taskId": "t1"}}}))

    def tearDown(self):
        self.tmp.cleanup()

    def test_scene_image_of_another_account_is_blocked(self):
        conn = asset_ledger.connect(self.db)
        self.assertEqual(asset_ledger.record("a", 1, conn=conn, videos_dir=self.videos), 2)
        row = conn.execute("SELECT provider, provider_id FROM assets WHERE path='assets/images/scene-1.jpg'").fetchone()
        self.assertEqual(row, ("antigravity", "t1"))
        self.assertIsNone(asset_ledger.verdict("b", 2, conn=conn, videos_dir=self.videos))
        reason = asset_ledger.verdict("c", 2, conn=conn, videos_dir=self.videos)
        self.assertIn("acc #1", reason)
        # Cùng acc được dùng lại ảnh của chính nó.
        self.assertIsNone(asset_ledger.verdict("c", 1, conn=conn, videos_dir=self.videos))

    def test_recompressed_copy_is_caught_by_phash(self):
        conn = asset_ledger.connect(self.db)
        asset_ledger.record("a", 1, conn=conn, videos_dir=self.videos)
        target = self.videos / "b" / "assets" / "images" / "scene-1.jpg"
        Image.open(self.videos / "a" / "assets" / "images" / "scene-2.jpg").save(target, quality=60)
        hits = asset_ledger.conflicts(conn, asset_ledger.video_assets("b", self.videos), 2)
        self.assertEqual([(h["path"], h["match"]) for h in hits], [("assets/images/scene-1.jpg", "phash")])

    def test_disabled_and_missing_db_write_nothing(self):
        with mock.patch.dict(os.environ, {"TOKMATRIX_ASSET_LEDGER": "0"}):
            self.assertIsNone(asset_ledger.verdict("a", 1, videos_dir=self.videos))
            self.assertEqual(asset_ledger.record("a", 1, videos_dir=self.videos), 0)
        with mock.patch.object(asset_ledger, "DB_PATH", Path(self.tmp.name) / "none.db"):
            self.assertIsNone(asset_ledger.verdict("a", 1, videos_dir=self.videos))
            self.assertFalse((Path(self.tmp.name) / "none.db").exists())


if __name__ == "__main__":
    unittest.main()
