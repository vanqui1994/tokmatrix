"""compare_native.auto_assign_images: ảnh Antigravity xong thì tự gán về đúng cảnh của video.

Dùng hàng đợi ảnh SQLite thật của image_routes trong thư mục tạm; không gọi Antigravity.
"""
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import compare_native as cn
from bkt_web import image_routes

IMG = b"\xff\xd8\xff\xe0" + b"\0" * 4096


class AutoAssignTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.videos = root / "videos"
        self.generated = root / "generated"
        self.generated.mkdir()
        patches = [
            mock.patch.object(cn, "VIDEOS_DIR", self.videos),
            mock.patch.object(cn, "GENERATED_IMAGES_DIR", self.generated),
            mock.patch.object(image_routes, "DB_PATH", root / "queue.db"),
            mock.patch.object(image_routes, "GENERATED_DIR", self.generated),
            mock.patch.object(image_routes, "LEGACY_QUEUE_FILE", root / "missing.json"),
            mock.patch.object(image_routes, "_BRIDGE_ROOT", root / "bridge"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)
        image_routes.init_image_tables()
        self.dir = self.videos / "demo-video"
        (self.dir / "assets" / "images").mkdir(parents=True)

    def task(self, task_id, status, model="antigravity-ide", filename=None, error=""):
        conn = image_routes._db()
        conn.execute(
            """INSERT INTO image_queue (id, prompt, negative_prompt, aspect_ratio, status, engine, model,
                                        image_filename, error_message, created_at, created_ts, updated_at)
               VALUES (?, 'p', '', '9:16', ?, 'antigravity', ?, ?, ?, 'now', ?, 'now')""",
            (task_id, status, model, filename, error, int(time.time())),
        )
        conn.commit()
        conn.close()
        if filename:
            (self.generated / filename).write_bytes(IMG)

    def state(self, items):
        (self.dir / "images.json").write_text(json.dumps({"version": 1, "items": items}), encoding="utf-8")

    def items(self):
        return json.loads((self.dir / "images.json").read_text(encoding="utf-8"))["items"]

    def test_completed_tasks_are_copied_to_their_own_scene_with_real_source(self):
        self.task("t1", "completed", filename="antigravity_1.png")
        self.task("t2", "completed", model="cf-worker", filename="cfworker_2.png")
        self.task("t3", "pending")
        (self.dir / "assets" / "images" / "scene-2.jpg").write_bytes(b"old image")
        self.state({
            "scene-1": {"dest": "assets/images/scene-1.jpg", "taskId": "t1", "source": "pending", "attempts": 1},
            "scene-2": {"dest": "assets/images/scene-2.jpg", "taskId": "t2", "source": "replacing", "attempts": 1},
            "scene-3": {"dest": "assets/images/scene-3.jpg", "taskId": "t3", "source": "pending", "attempts": 1},
        })
        res = cn.auto_assign_images("demo-video")
        self.assertEqual(res, {"assigned": 2, "retried": 0, "waiting": 1})
        items = self.items()
        self.assertEqual(items["scene-1"]["source"], "antigravity")
        self.assertEqual(items["scene-2"]["source"], "cf_worker")  # dự phòng không bao giờ ghi là Antigravity
        self.assertEqual(items["scene-3"]["source"], "pending")
        self.assertEqual((self.dir / "assets/images/scene-1.jpg").read_bytes(), IMG)
        self.assertEqual((self.dir / "assets/images/scene-2.jpg").read_bytes(), IMG)
        self.assertEqual(cn.pending_images("demo-video"), ["scene-3"])
        # Chạy lại: không làm gì với ảnh đã gán.
        self.assertEqual(cn.auto_assign_images("demo-video")["assigned"], 0)

    def test_failed_task_is_requested_again_up_to_the_limit(self):
        self.task("t1", "failed", error="agent timeout")
        self.state({"scene-1": {"dest": "assets/images/scene-1.jpg", "taskId": "t1", "source": "pending",
                                "attempts": 1, "prompt": "a red fox", "aspect": "9:16"}})
        self.assertEqual(cn.auto_assign_images("demo-video")["retried"], 1)
        item = self.items()["scene-1"]
        self.assertNotEqual(item["taskId"], "t1")
        self.assertEqual(item["attempts"], 2)
        self.assertIn("agent timeout", item["error"])
        # Đã tới giới hạn thì chỉ ghi lỗi, không xin thêm.
        self.task("t9", "failed", error="still failing")
        self.state({"scene-1": {**item, "taskId": "t9", "attempts": cn.IMAGE_MAX_ATTEMPTS}})
        self.assertEqual(cn.auto_assign_images("demo-video")["retried"], 0)
        self.assertEqual(self.items()["scene-1"]["taskId"], "t9")
        self.assertIn("still failing", self.items()["scene-1"]["error"])

    def test_scan_skips_videos_with_a_running_task(self):
        self.task("t1", "completed", filename="antigravity_1.png")
        self.state({"scene-1": {"dest": "assets/images/scene-1.jpg", "taskId": "t1", "source": "pending", "attempts": 1}})
        with cn.RUNS_LOCK:
            cn.RUNS["busy-run"] = {"slug": "demo-video", "done": False}
        try:
            self.assertEqual(cn.auto_assign_all(), {})
        finally:
            with cn.RUNS_LOCK:
                cn.RUNS.pop("busy-run", None)
        with mock.patch.object(cn, "_render_if_publish_waiting") as render:
            self.assertEqual(cn.auto_assign_all()["demo-video"]["assigned"], 1)
            render.assert_called_once_with("demo-video")

    def test_task_image_source_matches_node_tool(self):
        self.assertEqual(cn.task_image_source("cf-worker"), "cf_worker")
        self.assertEqual(cn.task_image_source("imagerouter:black-forest-labs/FLUX-2-klein-4b"), "imagerouter")
        self.assertEqual(cn.task_image_source("antigravity-ide"), "antigravity")
        self.assertEqual(cn.task_image_source(None), "antigravity")


if __name__ == "__main__":
    unittest.main()
