"""GET /api/ai-images/antigravity-accounts — bảng Quota Antigravity trong Cài Đặt."""
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from bkt_web import cf_image_fallback, image_routes


class AntigravityAccountsApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.status_file = root / "accounts_status.json"
        self.patches = [
            patch("bkt_web.image_routes.DB_PATH", root / "queue.db"),
            patch("bkt_web.image_routes.GENERATED_DIR", root / "generated"),
            patch("bkt_web.image_routes.LEGACY_QUEUE_FILE", root / "missing.json"),
            patch("bkt_web.image_routes.ACCOUNT_STATUS_FILE", self.status_file),
            patch.object(cf_image_fallback, "status", lambda: {"enabled": True, "has_token": True, "in_flight": []}),
        ]
        for p in self.patches:
            p.start()
        image_routes.GENERATED_DIR.mkdir()
        image_routes.init_image_tables()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def _task(self, task_id, status, model="antigravity-ide"):
        conn = image_routes._db()
        conn.execute(
            """INSERT INTO image_queue (id, prompt, status, engine, model, created_at, created_ts, updated_at)
               VALUES (?, 'p', ?, 'antigravity', ?, 'now', 1, ?)""",
            (task_id, status, model, time.strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        conn.close()

    def test_without_rotator_status_returns_empty_pool(self):
        data = image_routes.antigravity_accounts()
        self.assertIsNone(data["pool"])
        self.assertEqual({k: v for k, v in data["completed_24h"].items() if v}, {})

    def test_reports_pool_queue_and_completed_by_source(self):
        pool = {"generated_at": 1, "active_email": "a@x.com",
                "accounts": [{"email": "a@x.com", "tier": "ultra", "blocked": {"image": 0, "text": 0}}]}
        self.status_file.write_text(json.dumps(pool))
        self._task("t1", "pending")
        self._task("t2", "processing")
        self._task("t3", "completed", "antigravity-ide")
        self._task("t4", "completed", "flux")          # task cũ trước khi có cột model đúng
        self._task("t5", "completed", "cf-worker")
        data = image_routes.antigravity_accounts()
        self.assertEqual(data["pool"]["active_email"], "a@x.com")
        self.assertEqual(data["queue"], {"pending": 1, "processing": 1})
        self.assertEqual(data["completed_24h"]["antigravity"], 2)
        self.assertEqual(data["completed_24h"]["cf_worker"], 1)
        self.assertTrue(data["cf_fallback"]["enabled"])


if __name__ == "__main__":
    unittest.main()
