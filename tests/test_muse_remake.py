import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import muse_remake as mr


class MuseRemakeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.chdb = d / "ch.db"
        with sqlite3.connect(self.chdb) as c:
            c.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT)")
            c.executemany("INSERT INTO channels VALUES (?,?)", [(1, "acc_de"), (2, "acc_ko")])
            c.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INT, video_path TEXT, caption TEXT,"
                      " hashtags TEXT, schedule_time INT, status TEXT, created_at INT, ai_generated INT, run_id TEXT)")
        self.p = [mock.patch.object(mr, "DB", d / "mr.db"), mock.patch.object(mr, "CHANNELS_DB", self.chdb),
                  mock.patch.object(mr, "BASE", d / "files"),
                  mock.patch.object(mr, "account_voice", lambda cid: {"language": "de", "voice": "de-DE-ConradNeural", "speed": 1.0, "niche": ""})]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()
        self.tmp.cleanup()

    def test_one_profile_one_account(self):
        mr.add_source("https://www.kuaishou.com/profile/3xev268u3f9fnr2?x=1", 1)
        with self.assertRaises(ValueError):
            mr.add_source("https://www.kuaishou.com/profile/other", 1)  # tài khoản đã gán
        with self.assertRaises(ValueError):
            mr.add_source("https://www.kuaishou.com/profile/3xev268u3f9fnr2", 2)  # profile đã gán
        with self.assertRaises(ValueError):
            mr.add_source("https://www.tiktok.com/@x", 2)
        self.assertEqual(mr.sources()[0]["profile_url"], "https://www.kuaishou.com/profile/3xev268u3f9fnr2")

    def test_daily_quota_takes_newest_and_counts_deleted(self):
        s = mr.add_source("https://www.kuaishou.com/profile/abc", 1, per_day=2)
        items = [{"id": f"v{i}", "url": f"https://www.kuaishou.com/short-video/v{i}", "title": "t", "cover": "", "duration": 30,
                  "posted": 1000 + i, "author": "A"} for i in range(5)]
        with mock.patch.object(mr.multi_downloader, "kuaishou_profile", lambda url, n: items):
            self.assertEqual(mr.scan(s), 5)
            self.assertEqual(mr.scan(s), 0)  # quét lại không thêm trùng
        mr._start_due()
        with mr._conn() as c:
            new = [r["ks_id"] for r in c.execute("SELECT ks_id FROM videos WHERE status='new' ORDER BY ks_id")]
        self.assertEqual(new, ["v3", "v4"])  # hai video đăng gần nhất
        vid = mr.videos()[0]["id"]
        mr.delete_video(vid)
        mr._start_due()  # video đã xoá vẫn tính vào hạn mức ngày
        with mr._conn() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM videos WHERE status='new'").fetchone()[0], 1)

    def test_delete_removes_unposted_upload_task_only(self):
        s = mr.add_source("https://www.kuaishou.com/profile/abc", 1)
        now = int(time.time())
        with mr._conn() as c:
            c.execute("INSERT INTO videos(source_id, ks_id, url, status, created, updated) VALUES (?,?,?,?,?,?)", (s["id"], "a", "u", "queued", now, now))
            c.execute("INSERT INTO videos(source_id, ks_id, url, status, created, updated) VALUES (?,?,?,?,?,?)", (s["id"], "b", "u", "queued", now, now))
        with sqlite3.connect(self.chdb) as c:
            c.execute("INSERT INTO upload_tasks(id, channel_id, status) VALUES (10, 1, 'QUEUED')")
            c.execute("INSERT INTO upload_tasks(id, channel_id, status) VALUES (11, 1, 'SUCCESS')")
        mr._vid_update(1, upload_task_id=10)
        mr._vid_update(2, upload_task_id=11)
        self.assertEqual(mr.delete_video(1)["note"], "")
        self.assertIn("đã đăng", mr.delete_video(2)["note"])
        with sqlite3.connect(self.chdb) as c:
            self.assertEqual([r[0] for r in c.execute("SELECT id FROM upload_tasks")], [11])


if __name__ == "__main__":
    unittest.main()
