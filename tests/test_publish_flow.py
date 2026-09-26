"""Luồng đăng TikTok của video Compare Studio (bkt_web/publish_flow.py).

Database SQLite tạm + thư mục video tạm — không đụng bkt_channels.db hay video thật.
"""
import json
import os
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import compare_native as cn
from bkt_web import publish_flow as pf

SCHEMA = """
CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT, note TEXT, country TEXT, cookie TEXT);
CREATE TABLE upload_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER, video_path TEXT, caption TEXT DEFAULT '',
    hashtags TEXT DEFAULT '', schedule_time INTEGER DEFAULT 0, status TEXT DEFAULT 'PENDING',
    result_url TEXT DEFAULT '', error_message TEXT DEFAULT '', created_at INTEGER DEFAULT 0, uploaded_at INTEGER DEFAULT 0
);
"""


class PublishFlowBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.db = root / "test.db"
        with sqlite3.connect(self.db) as conn:
            conn.executescript(SCHEMA)
            conn.execute("INSERT INTO channels VALUES (1, 'kenh_a', '', 'VN', 'enc-cookie')")
            conn.execute("INSERT INTO channels VALUES (2, 'kenh_khong_cookie', '', 'DE', '')")
        self.videos = root / "videos"
        self.videos.mkdir()
        (root / "tools").mkdir()
        self._patches = [
            mock.patch.object(pf, "DB_PATH", self.db),
            mock.patch.object(cn, "VIDEOS_DIR", self.videos),
            mock.patch.object(cn, "COMPARE_DIR", root),
            mock.patch.object(cn, "TOOLS_DIR", root / "tools"),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()
        self._tmp.cleanup()

    def video(self, slug, mp4=True, images=None, mtime=None):
        d = self.videos / slug
        (d / "renders").mkdir(parents=True, exist_ok=True)
        if mp4:
            f = d / "renders" / "out.mp4"
            f.write_bytes(b"mp4")
            if mtime:
                os.utime(f, (mtime, mtime))
        if images is not None:
            (d / "images.json").write_text(json.dumps({"version": 1, "items": images}))
            for it in images.values():
                img = d / it["dest"]
                img.parent.mkdir(parents=True, exist_ok=True)
                img.write_bytes(b"img")
        return d

    def rows(self):
        with sqlite3.connect(self.db) as conn:
            return conn.execute("SELECT id, status, channel_id, video_path, error_message, video_slug FROM upload_tasks").fetchall()


class EnqueueTests(PublishFlowBase):
    def test_channel_is_mandatory(self):
        self.video("vox-a-vi")
        for channel in (None, "", 0):
            with self.subTest(channel=channel):
                with self.assertRaises(pf.PublishError) as ctx:
                    pf.enqueue_upload("vox-a-vi", channel, "c", "#t")
                self.assertEqual(ctx.exception.status, 400)
        self.assertEqual(self.rows(), [])

    def test_unknown_channel_and_missing_cookie(self):
        self.video("vox-a-vi")
        with self.assertRaises(pf.PublishError) as ctx:
            pf.enqueue_upload("vox-a-vi", 99, "c", "#t")
        self.assertEqual(ctx.exception.status, 404)
        with self.assertRaises(pf.PublishError) as ctx:
            pf.enqueue_upload("vox-a-vi", 2, "c", "#t")
        self.assertIn("cookie", ctx.exception.message)

    def test_pending_antigravity_images_block_posting(self):
        self.video("mystery-a-vi", images={"scene-1": {"dest": "assets/images/scene-1.jpg", "source": "placeholder"}})
        with self.assertRaises(pf.PublishError) as ctx:
            pf.enqueue_upload("mystery-a-vi", 1, "c", "#t")
        self.assertEqual(ctx.exception.status, 409)
        self.assertEqual(ctx.exception.extra["pending"], ["scene-1"])

    def test_no_render_no_post(self):
        self.video("vox-a-vi", mp4=False)
        with self.assertRaises(pf.PublishError) as ctx:
            pf.enqueue_upload("vox-a-vi", 1, "c", "#t")
        self.assertEqual(ctx.exception.status, 404)

    def test_queued_with_latest_mp4_and_ai_flag(self):
        d = self.video("vox-a-vi", images={"sticker-1": {"dest": "assets/images/sticker-1.jpg", "source": "antigravity"}})
        task = pf.enqueue_upload("vox-a-vi", 1, "Tiêu đề", "#fyp", ai_generated=True)
        self.assertEqual(task["status"], "QUEUED")
        (row,) = self.rows()
        self.assertEqual(row[1], "QUEUED")
        self.assertEqual(Path(row[3]), (d / "renders" / "out.mp4").resolve())
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT ai_generated FROM upload_tasks").fetchone()[0], 1)

    def test_nearby_post_needs_confirmation(self):
        self.video("vox-a-vi")
        pf.enqueue_upload("vox-a-vi", 1, "c", "#t")
        with self.assertRaises(pf.PublishError) as ctx:
            pf.enqueue_upload("vox-a-vi", 1, "c2", "#t")
        self.assertTrue(ctx.exception.extra["needsConfirm"])
        pf.enqueue_upload("vox-a-vi", 1, "c2", "#t", confirm_nearby=True)
        self.assertEqual(len(self.rows()), 2)


class WaitingRenderTests(PublishFlowBase):
    def test_fresh_render_activates_task(self):
        self.video("wildlife-a-vi", mp4=False)
        pf.enqueue_upload("wildlife-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="run-1")
        started = time.time() * 1000
        self.video("wildlife-a-vi", mp4=True)
        activated = pf.activate_waiting("wildlife-a-vi", run_id="run-1", render_ok=True, started_at_ms=started)
        self.assertEqual(len(activated), 1)
        (row,) = self.rows()
        self.assertEqual(row[1], "QUEUED")
        self.assertTrue(row[3].endswith("out.mp4"))

    def test_old_render_is_not_posted(self):
        self.video("wildlife-a-vi", mtime=time.time() - 3600)
        pf.enqueue_upload("wildlife-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="run-1")
        pf.activate_waiting("wildlife-a-vi", run_id="run-1", render_ok=True, started_at_ms=time.time() * 1000)
        self.assertEqual(self.rows()[0][1], "ERROR")

    def test_failed_render_errors_only_its_own_tasks(self):
        self.video("wildlife-a-vi", mp4=False)
        pf.enqueue_upload("wildlife-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="run-1")
        pf.enqueue_upload("wildlife-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="run-2", confirm_nearby=True)
        pf.activate_waiting("wildlife-a-vi", run_id="run-1", render_ok=False, started_at_ms=time.time() * 1000)
        statuses = {r[0]: r[1] for r in self.rows()}
        self.assertEqual(sorted(statuses.values()), ["ERROR", "WAITING_RENDER"])

    def test_blocked_by_images_keeps_waiting(self):
        self.video("mystery-a-vi", mp4=False)
        pf.enqueue_upload("mystery-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="run-1")
        pf.activate_waiting("mystery-a-vi", run_id="run-1", render_ok=True, started_at_ms=0, blocked_by_images=True)
        self.assertEqual(self.rows()[0][1], "WAITING_RENDER")

    def test_deleted_channel_is_not_replaced(self):
        self.video("vox-a-vi", mp4=False)
        pf.enqueue_upload("vox-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="run-1")
        with sqlite3.connect(self.db) as conn:
            conn.execute("DELETE FROM channels WHERE id=1")
        self.video("vox-a-vi")
        pf.activate_waiting("vox-a-vi", run_id="run-1", render_ok=True, started_at_ms=0)
        (row,) = self.rows()
        self.assertEqual(row[1], "ERROR")
        self.assertEqual(row[2], 1)  # vẫn gắn kênh cũ, không đổi sang kênh khác


class StartupCleanupTests(PublishFlowBase):
    def test_restart_after_clicking_post_needs_check(self):
        with sqlite3.connect(self.db) as conn:
            pf.ensure_upload_columns(conn)
            conn.execute("INSERT INTO upload_tasks (channel_id, status, clicked_post_at) VALUES (1, 'UPLOADING', 123)")
            conn.execute("INSERT INTO upload_tasks (channel_id, status, clicked_post_at) VALUES (1, 'UPLOADING', 0)")
        pf.startup_cleanup()
        self.assertEqual([r[1] for r in self.rows()], ["NEEDS_CHECK", "QUEUED"])

    def test_waiting_render_errors_unless_waiting_for_images(self):
        self.video("mystery-a-vi", mp4=False, images={"scene-1": {"dest": "assets/images/scene-1.jpg", "source": "pending"}})
        self.video("vox-a-vi", mp4=False)
        pf.enqueue_upload("mystery-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="r1")
        pf.enqueue_upload("vox-a-vi", 1, "c", "#t", status="WAITING_RENDER", run_id="r2", confirm_nearby=True)
        pf.startup_cleanup()
        by_slug = {r[5]: r[1] for r in self.rows()}
        self.assertEqual(by_slug, {"mystery-a-vi": "WAITING_RENDER", "vox-a-vi": "ERROR"})


class RunsPublishBlockTests(PublishFlowBase):
    def setUp(self):
        super().setUp()
        app = FastAPI()
        app.include_router(cn.compare_native_router)
        self.client = TestClient(app)

    def test_publish_block_requires_channel(self):
        self.video("vox-a-vi")
        (self.videos / "vox-a-vi" / "package.json").write_text("{}")
        with mock.patch.object(cn, "start_run") as start:
            res = self.client.post("/api/runs", json={"slug": "vox-a-vi", "task": "render", "publish": {"caption": "x"}})
        self.assertEqual(res.status_code, 400)
        start.assert_not_called()
        self.assertEqual(self.rows(), [])

    def test_publish_block_creates_waiting_task_with_run_id(self):
        self.video("vox-a-vi")
        with mock.patch.object(cn, "start_run", side_effect=lambda slug, task, opts, run_id=None: {"id": run_id}) as start:
            res = self.client.post("/api/runs", json={"slug": "vox-a-vi", "task": "render",
                                                      "publish": {"channel_id": 1, "caption": "x", "hashtags": "#t"}})
        self.assertEqual(res.status_code, 201, res.text)
        (row,) = self.rows()
        self.assertEqual(row[1], "WAITING_RENDER")
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT run_id FROM upload_tasks").fetchone()[0], start.call_args.kwargs["run_id"])

    def test_render_refused_while_images_pending(self):
        self.video("mystery-a-vi", images={"scene-1": {"dest": "assets/images/scene-1.jpg", "source": "placeholder"}})
        with mock.patch.object(cn, "start_run") as start:
            res = self.client.post("/api/runs", json={"slug": "mystery-a-vi", "task": "render"})
        self.assertEqual(res.status_code, 409)
        start.assert_not_called()


if __name__ == "__main__":
    unittest.main()
