import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import mascot_channel as mc


class MascotChannelTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "c.db"
        with sqlite3.connect(self.db) as c:
            c.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INT, run_id TEXT, status TEXT, created_at INT)")
        self.cfg = Path(self.tmp.name) / "channels.json"
        self.cfg.write_text('[{"account": 266, "lang": "de", "per_day": 1}]')
        mc._state["tries"].clear()
        self.patches = [mock.patch.object(mc.paths, "DB_PATH", self.db), mock.patch.object(mc, "CONFIG", self.cfg)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def _task(self, status="QUEUED", created=None):
        with sqlite3.connect(self.db) as c:
            c.execute("INSERT INTO upload_tasks(channel_id, run_id, status, created_at) VALUES (266, 'mascot_explainer:x', ?, ?)",
                      (status, created or int(time.time())))

    def test_makes_one_video_when_none_today(self):
        with mock.patch.object(mc, "make_video", return_value={"topic": "t"}) as mk:
            self.assertTrue(mc.run_once())
        mk.assert_called_once()

    def test_skips_when_quota_reached_today(self):
        self._task(status="SUCCESS")
        with mock.patch.object(mc, "make_video") as mk:
            self.assertFalse(mc.run_once())
        mk.assert_not_called()

    def test_skips_when_stock_full(self):
        for _ in range(mc.STOCK_MAX):
            self._task(created=int(time.time()) - 3 * 86400)
        with mock.patch.object(mc, "make_video") as mk:
            self.assertFalse(mc.run_once())
        mk.assert_not_called()

    def test_failure_waits_before_retry(self):
        with mock.patch.object(mc, "make_video", side_effect=RuntimeError("x")) as mk:
            self.assertTrue(mc.run_once())
            self.assertFalse(mc.run_once())
        self.assertEqual(mk.call_count, 1)


if __name__ == "__main__":
    unittest.main()
