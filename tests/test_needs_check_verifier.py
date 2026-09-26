"""Verifier NEEDS_CHECK (bkt_web/needs_check_verifier.py): chỉ đọc, không bao giờ đăng lại."""
import ast
import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import needs_check_verifier as v

CLICKED = 1_800_000_000


def item(vid, created, desc):
    # Đúng dạng chocode_tiktok.fetch_user_videos trả về (camelCase).
    return {"id": vid, "createTime": created, "desc": desc, "video": {}, "stats": {}}


class MatchTests(unittest.TestCase):
    task = {"clicked_post_at": CLICKED, "caption": "Mèo con dễ thương", "hashtags": "#cat #cute"}

    def test_real_payload_shape(self):
        payload = {"items": [item("7400", CLICKED + 30, "Mèo con dễ thương #cat #cute")], "details_ok": 0}
        self.assertEqual([x["id"] for x in v.match_candidates(self.task, payload)], ["7400"])

    def test_time_window(self):
        payload = {"items": [
            item("early", CLICKED - 121, "Mèo con dễ thương"),
            item("late", CLICKED + 3601, "Mèo con dễ thương"),
        ]}
        self.assertEqual(v.match_candidates(self.task, payload), [])

    def test_hashtags_alone_match(self):
        payload = {"items": [item("1", CLICKED + 5, "caption khác hẳn #cute #cat")]}
        self.assertEqual(len(v.match_candidates(self.task, payload)), 1)

    def test_one_shared_hashtag_is_not_enough(self):
        payload = {"items": [item("1", CLICKED + 5, "caption khác hẳn #cat")]}
        self.assertEqual(v.match_candidates(self.task, payload), [])

    def test_not_clicked(self):
        payload = {"items": [item("1", 5, "Mèo con dễ thương")]}
        self.assertEqual(v.match_candidates({"clicked_post_at": 0, "caption": "Mèo con dễ thương"}, payload), [])


class VerifyOnceTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Path(self._tmp.name) / "t.db"
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.executescript("""
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT);
                CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INTEGER, caption TEXT, hashtags TEXT,
                    status TEXT, clicked_post_at INTEGER, uploaded_at INTEGER DEFAULT 0, result_url TEXT DEFAULT '',
                    error_message TEXT DEFAULT '', verify_attempts INTEGER DEFAULT 0, next_verify_at INTEGER DEFAULT 0,
                    verify_note TEXT DEFAULT '', published_video_id TEXT DEFAULT '');
            """)
            conn.execute("INSERT INTO channels VALUES (1, 'kenh_a')")
            conn.execute("INSERT INTO upload_tasks (id, channel_id, caption, hashtags, status, clicked_post_at) "
                         "VALUES (10, 1, 'Mèo con dễ thương', '#cat #cute', 'NEEDS_CHECK', ?)", (CLICKED,))

    def tearDown(self):
        self._tmp.cleanup()

    def task(self):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.row_factory = sqlite3.Row
            return dict(conn.execute("SELECT * FROM upload_tasks WHERE id=10").fetchone())

    def run_verify(self, payload):
        with mock.patch.object(v.chocode_tiktok, "fetch_channel_videos", return_value=payload):
            return v.verify_once(10, self.db)

    def test_found_suggests_only_by_default(self):
        self.run_verify({"items": [item("7400", CLICKED + 30, "Mèo con dễ thương #cat #cute")]})
        t = self.task()
        self.assertEqual((t["status"], t["published_video_id"]), ("NEEDS_CHECK", "7400"))
        self.assertIn("7400", t["verify_note"])

    def test_found_auto_confirm(self):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute("INSERT INTO settings VALUES ('needs_check_auto_confirm', 'true')")
        self.run_verify({"items": [item("7400", CLICKED + 30, "Mèo con dễ thương")]})
        t = self.task()
        self.assertEqual(t["status"], "SUCCESS")
        self.assertEqual(t["result_url"], "https://www.tiktok.com/@kenh_a/video/7400")

    def test_task_left_needs_check_is_untouched(self):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute("INSERT INTO settings VALUES ('needs_check_auto_confirm', 'true')")
            conn.execute("UPDATE upload_tasks SET status='QUEUED' WHERE id=10")  # người vừa bấm Thử lại
        self.run_verify({"items": [item("7400", CLICKED + 30, "Mèo con dễ thương")]})
        self.assertEqual(self.task()["status"], "QUEUED")

    def test_multiple_matches_keep_status(self):
        self.run_verify({"items": [item("a", CLICKED + 1, "Mèo con dễ thương"), item("b", CLICKED + 2, "Mèo con dễ thương")]})
        t = self.task()
        self.assertEqual(t["status"], "NEEDS_CHECK")
        self.assertIn("a", t["verify_note"])
        self.assertEqual(t["published_video_id"], "")

    def test_schedule_progresses_then_stops(self):
        v.schedule_new(self.db)
        self.assertEqual(self.task()["next_verify_at"], CLICKED + 600)
        expected = [CLICKED + 1800, CLICKED + 7200, CLICKED + 21600, 0]
        for exp in expected:
            self.run_verify({"items": []})
            self.assertEqual(self.task()["next_verify_at"], exp)
        self.assertEqual(self.task()["verify_note"], v.FINAL_NOTE)
        # Đã có ghi chú → không bị đặt lịch lại từ đầu.
        v.schedule_new(self.db)
        self.assertEqual(self.task()["next_verify_at"], 0)

    def test_fetch_error_counts_as_no_data(self):
        with mock.patch.object(v.chocode_tiktok, "fetch_channel_videos", side_effect=RuntimeError("mock data")):
            v.verify_once(10, self.db)
        self.assertEqual(self.task()["verify_attempts"], 1)


class IsolationTests(unittest.TestCase):
    def test_never_imports_publisher(self):
        tree = ast.parse(Path(v.__file__).read_text(encoding="utf-8"))
        names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names.update(a.name for a in node.names)
            elif isinstance(node, ast.ImportFrom):
                names.add(node.module or "")
                names.update(a.name for a in node.names)
        self.assertFalse(any("tiktok_publisher" in n for n in names))


if __name__ == "__main__":
    unittest.main()
