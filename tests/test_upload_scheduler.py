import asyncio
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import upload_scheduler as sched
from bkt_web import upload_states as us


class OneShotStop:
    def __init__(self):
        self.calls = 0

    def wait(self, _seconds):
        self.calls += 1
        return self.calls > 1


class UploadSchedulerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "q.db"
        with sqlite3.connect(self.db) as conn:
            conn.execute("""
                CREATE TABLE upload_tasks (
                    id INTEGER PRIMARY KEY, channel_id INTEGER, video_path TEXT, caption TEXT, hashtags TEXT,
                    attempt_count INTEGER DEFAULT 0, ai_generated INTEGER DEFAULT 1, status TEXT,
                    schedule_time INTEGER DEFAULT 0, next_retry_at INTEGER DEFAULT 0, started_at INTEGER DEFAULT 0,
                    clicked_post_at INTEGER DEFAULT 0, error_message TEXT DEFAULT ""
                )
            """)
            conn.execute("""
                INSERT INTO upload_tasks
                (id, channel_id, video_path, caption, hashtags, status, schedule_time)
                VALUES (1, 7, "v.mp4", "cap", "#x", ?, 0)
            """, (us.QUEUED,))

    def row(self):
        with sqlite3.connect(self.db) as conn:
            return conn.execute(
                "SELECT status, attempt_count, next_retry_at, error_message FROM upload_tasks WHERE id=1"
            ).fetchone()

    def run_once(self, result=None, error=None):
        async def publish(**_kwargs):
            if error:
                raise error
            return result or {"success": True}

        live = {"is_running": False, "logs": []}
        lock = threading.Lock()
        with mock.patch.object(sched, "upload_hold_active", return_value=False):
            sched.run_upload_scheduler(
                db_path=self.db, stop_event=OneShotStop(), upload_lock=lock,
                live_status=live, publish_func=publish,
            )
        return live, lock

    def test_success_claims_task_once(self):
        live, lock = self.run_once({"success": True})
        status, attempts, _retry, _err = self.row()
        self.assertEqual(status, us.UPLOADING)  # publisher owns SUCCESS transition
        self.assertEqual(attempts, 1)
        self.assertFalse(live["is_running"])
        self.assertFalse(lock.locked())

    def test_deferred_restores_queue_and_attempt_count(self):
        self.run_once({"success": False, "deferred": True})
        status, attempts, retry_at, err = self.row()
        self.assertEqual(status, us.QUEUED)
        self.assertEqual(attempts, 0)
        self.assertGreater(retry_at, 0)
        self.assertIn("hoãn 5 phút", err)

    def test_exception_after_click_never_retries(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("UPDATE upload_tasks SET clicked_post_at=123 WHERE id=1")
        self.run_once(error=RuntimeError("boom"))
        status, attempts, retry_at, err = self.row()
        self.assertEqual(status, us.NEEDS_CHECK)
        self.assertEqual(attempts, 1)
        self.assertEqual(retry_at, 0)
        self.assertIn("boom", err)


if __name__ == "__main__":
    unittest.main()
