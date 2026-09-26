"""Dự phòng Cloudflare Worker của hàng đợi ảnh (bkt_web/cf_image_fallback.py).

Không gọi worker thật: httpx.MockTransport đóng vai worker. Kiểm tra: rút gọn prompt,
cắt đúng tỉ lệ, chỉ nhận task khi Antigravity bị chặn hoặc chờ quá lâu, ảnh đi qua
bridge importer với model cf-worker, lỗi thì trả task cho Antigravity.
"""
import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from PIL import Image

from bkt_web import cf_image_fallback as cf
from bkt_web import image_routes

FOX = ("The fox character escaping back into the wild night forest, exhausted yet unbroken., "
       "Documentary evidence board, archival paper, restrained noir lighting, cinematic documentary still, "
       "restrained shadows, vertical composition, camera: editorial medium shot, palette: primary #111318, "
       "accent #D6A84F, text #F2EEE6, vertical 9:16 composition, documentary visual, coherent lighting, "
       "no embedded captions, restrained shadows")


def _png(w=1024, h=1024) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (40, 60, 80)).save(buf, format="PNG")
    return buf.getvalue()


class PromptAndImageTest(unittest.TestCase):
    def test_shorten_prompt_drops_what_sdxl_cannot_use(self):
        short = cf.shorten_prompt(FOX)
        self.assertTrue(short.startswith("The fox character escaping back into the wild night forest"))
        self.assertIn("editorial medium shot", short)
        self.assertNotIn("camera:", short)
        for gone in ("#111318", "#D6A84F", "palette", "9:16", "composition", "captions"):
            self.assertNotIn(gone, short)
        self.assertEqual(short.count("restrained shadows"), 1)
        self.assertLessEqual(len(short.split()), 55)

    def test_fit_to_ratio_crops_square_to_vertical_qa_size(self):
        with Image.open(io.BytesIO(cf.fit_to_ratio(_png(), "9:16"))) as im:
            self.assertEqual(im.size, (1080, 1920))
        with Image.open(io.BytesIO(cf.fit_to_ratio(_png(), "1:1"))) as im:
            self.assertEqual(im.size, (1024, 1024))
        with self.assertRaises(ValueError):
            cf.fit_to_ratio(b'{"error":"x"}', "9:16")


class BlockedUntilTest(unittest.TestCase):
    def test_quota_check_is_limited_to_the_active_account(self):
        with tempfile.TemporaryDirectory() as tmp:
            active = Path(tmp) / "active_account"
            active.write_text("now@x.com\n")
            calls = []

            def fake_run(cmd, **kw):
                calls.append(cmd)
                return type("R", (), {"returncode": 1, "stdout": ""})()

            with patch.object(cf, "ACTIVE_ACCOUNT_FILE", active), \
                 patch.object(cf, "QUOTA_HELPER", Path(tmp)), \
                 patch.object(cf, "_blocked_cache", (0.0, 0.0)), \
                 patch.object(cf.subprocess, "run", fake_run):
                self.assertEqual(cf.antigravity_blocked_until(), 0.0)
            self.assertEqual(calls[0][-2:], ["--account", "now@x.com"])


class FallbackQueueTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.patches = [
            patch("bkt_web.image_routes.DB_PATH", root / "queue.db"),
            patch("bkt_web.image_routes.GENERATED_DIR", root / "generated"),
            patch("bkt_web.image_routes.LEGACY_QUEUE_FILE", root / "missing.json"),
            patch("bkt_web.image_routes._BRIDGE_ROOT", root / "bridge"),
            patch.object(cf, "_token", lambda: "test-token"),
            patch.object(cf, "_cooldown_until", 0.0),
            patch.object(cf.imagerouter_image, "_token", lambda: ""),  # chỉ thử nhánh Cloudflare
        ]
        for p in self.patches:
            p.start()
        image_routes.GENERATED_DIR.mkdir()
        image_routes.init_image_tables()
        cf._in_flight.clear()
        self.requests = []

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        cf._in_flight.clear()
        self.tmp.cleanup()

    def _insert(self, task_id, age_minutes, status="pending"):
        conn = image_routes._db()
        conn.execute(
            """INSERT INTO image_queue (id, prompt, negative_prompt, aspect_ratio, status, engine,
                                        created_at, created_ts, updated_at)
               VALUES (?, ?, 'text', '9:16', ?, 'antigravity', 'now', ?, 'now')""",
            (task_id, FOX, status, int(time.time() - age_minutes * 60)),
        )
        conn.commit()
        conn.close()

    def _task(self, task_id):
        conn = image_routes._db()
        try:
            row = conn.execute(f"SELECT {image_routes.QUEUE_COLUMNS} FROM image_queue WHERE id=?", (task_id,)).fetchone()
        finally:
            conn.close()
        return image_routes._queue_row_to_dict(row)

    def _client(self, status=200, content=None):
        def handler(request):
            self.requests.append(json.loads(request.content))
            assert request.headers["Authorization"] == "Bearer test-token"
            return httpx.Response(status, content=content if content is not None else _png(),
                                  headers={"content-type": "image/jpeg"})
        return httpx.Client(transport=httpx.MockTransport(handler))

    def test_young_task_waits_for_antigravity_when_not_blocked(self):
        self._insert("task_1_young", age_minutes=5)
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: 0.0):
            self.assertEqual(cf.run_once(client=self._client()), 0)
        self.assertEqual(self.requests, [])

    def test_quota_block_hands_task_to_worker_and_importer_records_source(self):
        self._insert("task_1_blocked", age_minutes=5)
        self._insert("task_2_inbox", age_minutes=5, status="processing")
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: time.time() + 1800):
            self.assertEqual(cf.run_once(limit=2, client=self._client()), 2)
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.requests[0]["aspect_ratio"], "9:16")
        self.assertNotIn("#111318", self.requests[0]["prompt"])

        outbox = image_routes._bridge_dirs()["outbox"]
        self.assertTrue((outbox / "task_1_blocked.png").is_file())
        self.assertTrue((outbox / "task_1_blocked.cf.json").is_file())
        image_routes._bridge_auto_import()

        for task_id in ("task_1_blocked", "task_2_inbox"):
            task = self._task(task_id)
            self.assertEqual(task["status"], "completed")
            self.assertEqual(task["model"], "cf-worker")
            self.assertTrue(task["image_filename"].startswith("cfworker_"))
            sidecar = json.loads((image_routes.GENERATED_DIR / task["image_filename"]).with_suffix(".json").read_text())
            self.assertEqual(sidecar["engine"], "cf_worker")
            with Image.open(image_routes.GENERATED_DIR / task["image_filename"]) as im:
                self.assertEqual(im.size, (1080, 1920))
        self.assertEqual(list(outbox.iterdir()), [])

    def test_text_sensitive_task_waits_only_while_antigravity_is_available(self):
        self._insert("task_text_diagram", age_minutes=5)
        conn = image_routes._db()
        conn.execute(
            "UPDATE image_queue SET prompt=? WHERE id=?",
            ("Technical diagram with readable labels showing the reactor controls", "task_text_diagram"),
        )
        conn.commit()
        conn.close()

        with patch.object(cf, "antigravity_blocked_until", lambda now=None: 0.0):
            self.assertEqual(cf.run_once(client=self._client()), 0)
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: time.time() + 1800):
            self.assertEqual(cf.run_once(client=self._client()), 1)

        image_routes._bridge_auto_import()
        self.assertEqual(self._task("task_text_diagram")["model"], "cf-worker")

    def test_old_task_in_agent_inbox_is_left_to_agent(self):
        # Task cũ nhưng agent đang vẽ (processing, vừa giao) → worker không vẽ chen.
        self._insert("task_1_inbox_old", age_minutes=cf.MAX_WAIT_MINUTES + 30, status="processing")
        conn = image_routes._db()
        conn.execute("UPDATE image_queue SET updated_at=? WHERE id='task_1_inbox_old'", (image_routes._now_str(),))
        conn.commit()
        conn.close()
        self._insert("task_2_pending_old", age_minutes=cf.MAX_WAIT_MINUTES + 10)
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: 0.0):
            ids = [t["id"] for t in cf.eligible_tasks(5)]
        self.assertEqual(ids, ["task_2_pending_old"])

    def test_restart_keeps_inbox_tasks_with_agent(self):
        # App khởi động lại: task còn file trong inbox vẫn là của agent (không về pending
        # để worker vẽ chen); task processing không còn file thì trả về hàng đợi.
        self._insert("task_1_in_inbox", age_minutes=cf.MAX_WAIT_MINUTES + 30, status="processing")
        self._insert("task_2_lost", age_minutes=cf.MAX_WAIT_MINUTES + 30, status="processing")
        inbox = image_routes._bridge_dirs()["inbox"]
        (inbox / "task_1_in_inbox.md").write_text("task", encoding="utf-8")
        image_routes.init_image_tables()
        self.assertEqual(self._task("task_1_in_inbox")["status"], "processing")
        self.assertEqual(self._task("task_2_lost")["status"], "pending")

    def test_stale_inbox_task_goes_to_worker(self):
        self._insert("task_1_stuck", age_minutes=cf.MAX_WAIT_MINUTES + 30, status="processing")
        stale = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - (cf.INBOX_STALE_MINUTES + 5) * 60))
        conn = image_routes._db()
        conn.execute("UPDATE image_queue SET updated_at=? WHERE id='task_1_stuck'", (stale,))
        conn.commit()
        conn.close()
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: 0.0):
            self.assertEqual([t["id"] for t in cf.eligible_tasks(5)], ["task_1_stuck"])

    def test_old_task_uses_worker_even_without_quota_block(self):
        self._insert("task_1_old", age_minutes=cf.MAX_WAIT_MINUTES + 5)
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: 0.0):
            self.assertEqual(cf.run_once(client=self._client()), 1)

    def test_worker_error_returns_task_to_antigravity_and_cools_down(self):
        self._insert("task_1_err", age_minutes=5)
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: time.time() + 1800):
            cf.run_once(client=self._client(status=429, content=b'{"error":"limit"}'))
        task = self._task("task_1_err")
        self.assertEqual(task["status"], "pending")
        self.assertIn("429", task["error_message"])
        conn = image_routes._db()
        next_retry = conn.execute("SELECT next_retry_at FROM image_queue WHERE id='task_1_err'").fetchone()[0]
        conn.close()
        self.assertEqual(next_retry, 0)   # bridge kéo lại được ngay
        self.assertGreater(cf._cooldown_until, time.time() + 25 * 60)
        self.assertEqual(list(image_routes._bridge_dirs()["outbox"].iterdir()), [])

    def test_manual_import_leaves_fallback_images_to_auto_importer(self):
        self._insert("task_1_manual", age_minutes=5)
        with patch.object(cf, "antigravity_blocked_until", lambda now=None: time.time() + 1800):
            cf.run_once(client=self._client())
        image_routes.bridge_import_outbox()
        self.assertEqual(self._task("task_1_manual")["status"], "pending")
        image_routes._bridge_auto_import()
        self.assertEqual(self._task("task_1_manual")["model"], "cf-worker")


if __name__ == "__main__":
    unittest.main()
