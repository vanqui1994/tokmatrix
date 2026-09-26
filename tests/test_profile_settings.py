"""API setting + số liệu Chrome profile (server.py) và thứ tự route /api/channels/*."""
import sqlite3
from contextlib import closing
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi import HTTPException
from starlette.routing import Match

from bkt_web import server


def resolve(method, path):
    scope = {"type": "http", "method": method, "path": path, "root_path": "", "query_string": b"", "headers": []}
    for route in server.app.router.routes:
        if route.matches(scope)[0] == Match.FULL:
            return route.endpoint.__name__
    return None


class RouteOrderTests(unittest.TestCase):
    def test_profile_settings_not_shadowed_by_channel_id(self):
        self.assertEqual(resolve("PUT", "/api/channels/profile-settings"), "put_profile_settings")
        self.assertEqual(resolve("GET", "/api/channels/profile-settings"), "get_profile_settings")
        self.assertEqual(resolve("GET", "/api/channels/profile-metrics"), "profile_metrics")

    def test_numeric_channel_routes_still_work(self):
        self.assertEqual(resolve("PUT", "/api/channels/5"), "update_channel_note")
        self.assertEqual(resolve("DELETE", "/api/channels/5"), "delete_channel")


class ServerDbBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Path(self._tmp.name) / "t.db"
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.executescript("""
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE channels (id INTEGER PRIMARY KEY, profile_dir TEXT DEFAULT '');
                CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, error_message TEXT DEFAULT '',
                    started_at INTEGER DEFAULT 0, publish_mode TEXT DEFAULT '');
                CREATE TABLE channel_session_events (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER,
                    state TEXT, source TEXT, created_at INTEGER);
            """)
            conn.execute("INSERT INTO channels VALUES (3, '/p/3'), (7, '/p/7'), (9, '')")
        p = mock.patch.object(server, "DB_PATH", self.db)
        p.start()
        self.addCleanup(p.stop)

    def tearDown(self):
        self._tmp.cleanup()


class SettingsTests(ServerDbBase):
    def test_defaults(self):
        s = server.get_profile_settings()
        self.assertEqual(s["publish_profile_channels"], "")
        self.assertEqual(s["needs_check_auto_confirm"], "false")

    def test_channel_list_normalised(self):
        s = server.put_profile_settings({"publish_profile_channels": "7, 3,7"})
        self.assertEqual(s["publish_profile_channels"], "3,7")
        self.assertEqual(server.put_profile_settings({"publish_profile_channels": ""})["publish_profile_channels"], "")

    def test_rejects_bad_values(self):
        for data in ({"publish_profile_channels": "3,9"},      # 9 chưa có profile
                     {"publish_profile_channels": "abc"},
                     {"needs_check_auto_confirm": "yes"},
                     {"profile_keeper_interval_hours": 5},
                     {"unknown_key": "1"}):
            with self.subTest(data=data), self.assertRaises(HTTPException) as ctx:
                server.put_profile_settings(dict(data))
            self.assertEqual(ctx.exception.status_code, 400)


class MetricsTests(ServerDbBase):
    def test_baseline_counts_tasks_before_profile_rollout(self):
        now = int(time.time())
        first = now - 3600
        with closing(sqlite3.connect(self.db)) as conn, conn:
            # Trước khi bật: publish_mode rỗng (task cũ) — vẫn phải vào mốc so sánh.
            conn.executemany("INSERT INTO upload_tasks (status, started_at, publish_mode) VALUES (?,?,?)", [
                ("SUCCESS", first - 100, ""), ("ERROR", first - 200, ""), ("SUCCESS", first - 300, "clean"),
                ("SUCCESS", first, "profile"), ("NEEDS_CHECK", first + 10, "profile"),
            ])
            conn.execute("INSERT INTO upload_tasks (status, error_message, started_at, publish_mode) VALUES "
                         "('QUEUED', ?, ?, 'profile')", (server.DEFERRED_PROFILE_BUSY, first + 20))
            conn.execute("INSERT INTO channel_session_events (channel_id, state, source, created_at) "
                         "VALUES (3, 'LOGGED_OUT', 'publish', ?)", (now,))
        m = server.profile_metrics(7)
        self.assertEqual(m["baseline"]["started"], 3)
        self.assertEqual(m["baseline"]["success"], 2)
        self.assertEqual(m["by_mode"]["profile"]["started"], 3)
        self.assertEqual(m["by_mode"]["profile"]["deferred"], 1)
        self.assertEqual(m["session_events"]["by_source"]["publish"]["events"], 1)

    def test_no_profile_task_yet(self):
        m = server.profile_metrics(7)
        self.assertIsNone(m["baseline"])
        self.assertIsNone(m["by_mode"]["profile"]["rate"])


class UploadTaskApiTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Path(self._tmp.name) / "t.db"
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.executescript("""
                CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT, note TEXT, country TEXT);
                CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INTEGER, video_path TEXT, caption TEXT,
                    hashtags TEXT, schedule_time INTEGER, status TEXT, result_url TEXT, error_message TEXT,
                    created_at INTEGER, uploaded_at INTEGER, attempt_count INTEGER, next_retry_at INTEGER,
                    started_at INTEGER, ai_generated INTEGER, video_slug TEXT, clicked_post_at INTEGER,
                    verify_attempts INTEGER DEFAULT 0, next_verify_at INTEGER DEFAULT 0, verify_note TEXT DEFAULT '',
                    published_video_id TEXT DEFAULT '', publish_mode TEXT DEFAULT '');
            """)
            conn.execute("INSERT INTO channels VALUES (1, 'kenh_a', '', 'DE')")
            conn.execute("INSERT INTO upload_tasks (id, channel_id, video_path, caption, hashtags, schedule_time, status, "
                         "result_url, error_message, created_at, uploaded_at, attempt_count, next_retry_at, started_at, "
                         "ai_generated, video_slug, clicked_post_at, verify_attempts, next_verify_at, verify_note, "
                         "published_video_id, publish_mode) VALUES (5, 1, '/v.mp4', '', '', 0, 'ERROR', '', 'x', 1, 0, 3, "
                         "99, 0, 1, 's', 1234, 2, 55, 'Tìm thấy video 7400', '7400', 'profile')")
        p = mock.patch.object(server, "DB_PATH", self.db)
        p.start()
        self.addCleanup(p.stop)

    def tearDown(self):
        self._tmp.cleanup()

    def test_tasks_include_verifier_fields(self):
        task = server.list_upload_tasks()["tasks"][0]
        self.assertEqual((task["verify_note"], task["published_video_id"], task["publish_mode"]),
                         ("Tìm thấy video 7400", "7400", "profile"))

    def test_retry_resets_attempts_and_verifier(self):
        server.retry_upload_task(5)
        with closing(sqlite3.connect(self.db)) as conn:
            row = conn.execute("SELECT status, attempt_count, clicked_post_at, verify_attempts, next_verify_at, "
                               "verify_note, published_video_id FROM upload_tasks WHERE id=5").fetchone()
        self.assertEqual(row, ("QUEUED", 0, 0, 0, 0, "", ""))


if __name__ == "__main__":
    unittest.main()
