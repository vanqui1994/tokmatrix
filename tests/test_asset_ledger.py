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

    def _stock_video(self, slug, clip_id="551", data=b"clip bytes"):
        vdir = self.videos / slug
        (vdir / "assets" / "video").mkdir(parents=True, exist_ok=True)
        (vdir / "assets" / "video" / "scene-1.mp4").write_bytes(data)
        (vdir / "meta.json").write_text(json.dumps({"creative": {"stock_clips": [
            {"scene": 1, "file": "assets/video/scene-1.mp4", "provider": "pexels", "provider_clip_id": clip_id}]}}))

    def _stock_ledger(self, owner):
        from bkt_web import stock_video
        conn = stock_video.connect(Path(self.tmp.name) / "stock.db")
        conn.execute("INSERT INTO clips(provider, provider_clip_id, content_sha256, owner_account, created_at) VALUES ('pexels','551','x',?,0)", (owner,))
        conn.commit()
        self.addCleanup(conn.close)
        return conn

    def test_stock_clip_is_blocked_on_an_account_that_does_not_own_it(self):
        self._stock_video("a")
        conn = asset_ledger.connect(self.db)
        stock = self._stock_ledger(owner=1)
        self.assertIsNone(asset_ledger.verdict("a", 1, conn=conn, videos_dir=self.videos, stock_conn=stock))
        reason = asset_ledger.verdict("a", 2, conn=conn, videos_dir=self.videos, stock_conn=stock)
        self.assertIn("pexels:551", reason)
        self.assertIn("acc #1", reason)
        # Không có trong stock ledger (hoặc chưa có ledger) → không đăng.
        self._stock_video("b", clip_id="999")
        self.assertIn("không có trong stock ledger", asset_ledger.verdict("b", 1, conn=conn, videos_dir=self.videos, stock_conn=stock))
        from bkt_web import stock_video
        with mock.patch.object(stock_video, "DB_PATH", Path(self.tmp.name) / "missing.db"):
            self.assertIn("chưa có stock ledger", asset_ledger.stock_verdict("a", 1, videos_dir=self.videos))
        # Kiểm tra sở hữu stock vẫn chạy khi tắt asset ledger.
        with mock.patch.dict(os.environ, {"TOKMATRIX_ASSET_LEDGER": "0"}):
            self.assertIn("acc #1", asset_ledger.verdict("a", 2, conn=conn, videos_dir=self.videos, stock_conn=stock))

    def test_stock_clip_files_are_recorded_and_caught_by_sha256(self):
        self._stock_video("a")
        self._stock_video("b")  # cùng byte clip ở video khác
        conn = asset_ledger.connect(self.db)
        assets = asset_ledger.video_assets("a", self.videos)
        clip = next(a for a in assets if a["path"] == "assets/video/scene-1.mp4")
        self.assertEqual((clip["provider"], clip["provider_id"], clip["scope"]), ("pexels", "551", "VIDEO"))
        asset_ledger.record("a", 1, conn=conn, videos_dir=self.videos)
        hits = asset_ledger.conflicts(conn, asset_ledger.video_assets("b", self.videos), 2)
        self.assertIn(("assets/video/scene-1.mp4", "sha256"), [(h["path"], h["match"]) for h in hits])

    def test_disabled_and_missing_db_write_nothing(self):
        with mock.patch.dict(os.environ, {"TOKMATRIX_ASSET_LEDGER": "0"}):
            self.assertIsNone(asset_ledger.verdict("a", 1, videos_dir=self.videos))
            self.assertEqual(asset_ledger.record("a", 1, videos_dir=self.videos), 0)
        with mock.patch.object(asset_ledger, "DB_PATH", Path(self.tmp.name) / "none.db"):
            self.assertIsNone(asset_ledger.verdict("a", 1, videos_dir=self.videos))
            self.assertFalse((Path(self.tmp.name) / "none.db").exists())


if __name__ == "__main__":
    unittest.main()
