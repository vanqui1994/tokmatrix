import sqlite3
import unittest

from bkt_web import upload_tasks


def _db(with_slug=True):
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INTEGER, video_path TEXT, caption TEXT, "
              "hashtags TEXT, schedule_time INTEGER, status TEXT, created_at INTEGER, ai_generated INTEGER, run_id TEXT"
              + (", video_slug TEXT DEFAULT ''" if with_slug else "") + ")")
    return c


class InsertTest(unittest.TestCase):
    def test_unique_run_returns_existing_task(self):
        c = _db()
        a = upload_tasks.insert(c, 7, "/v.mp4", "cap", "#x", 100, run_id="r:1", unique_run=True)
        b = upload_tasks.insert(c, 7, "/v.mp4", "cap", "#x", 200, run_id="r:1", unique_run=True)
        self.assertEqual(a, b)
        self.assertEqual(c.execute("SELECT COUNT(*) FROM upload_tasks").fetchone()[0], 1)
        # khác kênh vẫn là task riêng
        self.assertNotEqual(upload_tasks.insert(c, 8, "/v.mp4", "", "", 100, run_id="r:1", unique_run=True), a)

    def test_without_unique_run_inserts_again(self):
        c = _db()
        upload_tasks.insert(c, 7, "/v.mp4", "", "", 100, run_id="r:1")
        upload_tasks.insert(c, 7, "/v.mp4", "", "", 100, run_id="r:1")
        self.assertEqual(c.execute("SELECT COUNT(*) FROM upload_tasks").fetchone()[0], 2)

    def test_video_slug_only_written_when_given(self):
        upload_tasks.insert(_db(with_slug=False), 7, "/v.mp4", "", "", 100)
        c = _db()
        upload_tasks.insert(c, 7, "/v.mp4", "", "", 100, status="WAITING_RENDER", ai_generated=False, video_slug="s")
        self.assertEqual(c.execute("SELECT video_slug, status, ai_generated FROM upload_tasks").fetchone(), ("s", "WAITING_RENDER", 0))


if __name__ == "__main__":
    unittest.main()
