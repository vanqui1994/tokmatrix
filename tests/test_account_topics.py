"""Chủ đề (niche) của từng TikTok acc cho trang Hàng Đợi (autopilot.channels.account_topics)."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from bkt_web.autopilot import channels, store


class AccountTopicsTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / "config" / "niches").mkdir(parents=True)
        (root / "config" / "channels").mkdir(parents=True)
        (root / "config" / "niches" / "05_geopolitics_maps.yaml").write_text(
            "niche_id: geopolitics_maps\nname: Địa Chính Trị & Biên Giới\n", encoding="utf-8")
        (root / "config" / "channels" / "geopolitics_maps_02.yaml").write_text(
            "channel_id: geopolitics_maps_02\nniche_id: geopolitics_maps\nname: Geopolitik & Grenzen 02\n", encoding="utf-8")
        for patch in (
            mock.patch.object(store, "AUTOPILOT_DB", root / "autopilot.db"),
            mock.patch.object(store, "COMPARE_DIR", root),
            mock.patch.object(store, "CHANNELS_CONFIG_DIR", root / "config" / "channels"),
            mock.patch.dict(channels._TOPIC_CACHE, {"at": 0.0, "data": {}}),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        store.init_db()

    def test_maps_tiktok_account_to_niche_and_matrix_channel(self):
        channels.set_channel_mapping("geopolitics_maps_02", "geopolitics_maps", 42, "DE", "de")
        self.assertEqual(channels.account_topics(force=True)[42], {
            "niche_id": "geopolitics_maps", "niche_name": "Địa Chính Trị & Biên Giới",
            "matrix_channel_id": "geopolitics_maps_02", "matrix_channel_name": "Geopolitik & Grenzen 02",
        })
        self.assertNotIn(7, channels.account_topics())

    def test_result_is_cached_until_forced(self):
        self.assertEqual(channels.account_topics(force=True), {})
        channels.set_channel_mapping("geopolitics_maps_02", "geopolitics_maps", 42, "DE", "de")
        self.assertEqual(channels.account_topics(), {})
        self.assertIn(42, channels.account_topics(force=True))


if __name__ == "__main__":
    unittest.main()
