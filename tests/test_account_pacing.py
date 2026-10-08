"""Nhịp đăng theo acc (owner 08/10): acc nghỉ không đăng, acc khởi động 1 bài/ngày cách ≥ 20 giờ; thiết bị riêng mỗi profile."""
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import account_pacing as ap, paths, profile_session


class PacingTest(unittest.TestCase):
    def setUp(self):
        self.db = Path(tempfile.mkdtemp()) / "c.db"
        c = sqlite3.connect(self.db)
        c.execute("CREATE TABLE channels(id INTEGER PRIMARY KEY, follower_count INT)")
        c.execute("CREATE TABLE upload_tasks(id INTEGER PRIMARY KEY, channel_id INT, status TEXT, schedule_time INT, started_at INT, uploaded_at INT)")
        c.executemany("INSERT INTO channels VALUES (?,?)", [(1, 0), (2, 5000)])
        c.commit(); c.close()
        p = mock.patch.object(paths, "DB_PATH", self.db); p.start(); self.addCleanup(p.stop)

    def test_rest_moves_queued_tasks_and_blocks_until_released(self):
        c = sqlite3.connect(self.db)
        c.execute("INSERT INTO upload_tasks VALUES (10, 2, 'QUEUED', ?, NULL, NULL)", (int(time.time()) + 60,)); c.commit()
        ap.set_rest([2], 14, "0 view")
        self.assertGreater(ap.rest_until(2), time.time() + 13 * 86400)
        self.assertGreater(c.execute("SELECT schedule_time FROM upload_tasks WHERE id=10").fetchone()[0], time.time() + 13 * 86400)
        self.assertGreater(ap.next_allowed(2, c), time.time())
        ap.release([2])
        self.assertEqual(ap.next_allowed(2, c), 0)

    def test_warming_account_posts_once_a_day_with_a_long_gap(self):
        c = sqlite3.connect(self.db)
        now = time.time()
        c.execute("INSERT INTO upload_tasks VALUES (11, 1, 'SUCCESS', 0, ?, ?)", (int(now - 3600), int(now - 3600))); c.commit()
        self.assertTrue(ap.is_warming(1)); self.assertFalse(ap.is_warming(2))
        self.assertEqual(ap.daily_limit(1, 6), 1); self.assertEqual(ap.daily_limit(2, 6), 6)
        self.assertGreaterEqual(ap.next_allowed(1, c, now), now + 18 * 3600)
        self.assertEqual(ap.next_allowed(2, c, now), 0)


class DeviceTest(unittest.TestCase):
    def test_each_channel_has_a_stable_device_and_profiles_differ(self):
        self.assertEqual(profile_session.device_for(7), profile_session.device_for(7))
        devices = {str(profile_session.device_for(i)) for i in range(60)}
        self.assertGreater(len(devices), 30)
        kw = profile_session.launch_kwargs({}, channel_id=7)
        self.assertEqual(kw["screen"], profile_session.device_for(7)["screen"])
        self.assertIn("Linux", profile_session.linux_user_agent("129.0.6668.58"))
        self.assertIn("Chrome/129.0.0.0", profile_session.linux_user_agent("129.0.6668.58"))


if __name__ == "__main__":
    unittest.main()
