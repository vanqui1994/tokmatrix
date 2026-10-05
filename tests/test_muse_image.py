import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import muse_image
from bkt_web.compare_native import task_image_source


class FakeRoutes:
    def __init__(self, root: Path):
        self.db_path = root / "q.db"
        self.GENERATED_DIR = root / "gen"
        self.GENERATED_DIR.mkdir()
        conn = self._db()
        conn.execute("""CREATE TABLE image_queue (id TEXT PRIMARY KEY, prompt TEXT, negative_prompt TEXT, aspect_ratio TEXT,
            model TEXT, seed INT, notes TEXT, status TEXT, attempt_count INT DEFAULT 0, next_retry_at INT, engine TEXT,
            error_message TEXT, image_url TEXT, image_filename TEXT, created_at TEXT, created_ts INT, updated_at TEXT)""")
        conn.commit()
        conn.close()

    def _db(self):
        return sqlite3.connect(self.db_path, isolation_level=None)

    @staticmethod
    def _now_str():
        return time.strftime("%Y-%m-%d %H:%M:%S")

    def add(self, task_id, engine):
        conn = self._db()
        conn.execute("INSERT INTO image_queue (id,prompt,negative_prompt,aspect_ratio,status,engine,created_ts,attempt_count) VALUES (?,?,?,?,?,?,?,0)",
                     (task_id, "a red fox", "", "9:16", "pending", engine, int(time.time())))
        conn.close()

    def row(self, task_id):
        conn = self._db()
        try:
            return conn.execute("select status, model, image_filename, attempt_count from image_queue where id=?", (task_id,)).fetchone()
        finally:
            conn.close()


class MuseImageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.routes = FakeRoutes(Path(self.tmp.name))
        patcher = mock.patch.object(muse_image, "_routes", return_value=self.routes)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_prompt_names_the_aspect_and_forbids_questions(self):
        p = muse_image.build_prompt("a red fox", "text", "9:16")
        self.assertIn("vertical 9:16", p)
        self.assertIn("Do not ask questions", p)
        self.assertTrue(p.endswith("Image: a red fox"))

    def test_only_muse_tasks_are_taken_and_completed_with_model_muse(self):
        self.routes.add("task_1_ag", "antigravity")
        self.routes.add("task_2_mu", "muse")
        with mock.patch.object(muse_image, "generate", return_value={"png": b"\x89PNG fake", "size": (1152, 2048), "seconds": 1}):
            self.assertTrue(muse_image.run_once())
            self.assertFalse(muse_image.run_once())  # task antigravity không bị đụng tới
        status, model, filename, _ = self.routes.row("task_2_mu")
        self.assertEqual((status, model), ("completed", "muse"))
        self.assertTrue((self.routes.GENERATED_DIR / filename).exists())
        self.assertEqual(self.routes.row("task_1_ag")[0], "pending")

    def test_failures_retry_then_fail(self):
        self.routes.add("task_3_mu", "muse")
        with mock.patch.object(muse_image, "generate", side_effect=RuntimeError("no image")):
            for _ in range(muse_image.MAX_ATTEMPTS):
                conn = self.routes._db()
                conn.execute("update image_queue set next_retry_at=0 where id='task_3_mu'")
                conn.close()
                muse_image.run_once()
        status, _, _, attempts = self.routes.row("task_3_mu")
        self.assertEqual((status, attempts), ("failed", muse_image.MAX_ATTEMPTS))

    def test_muse_images_are_never_relabelled_as_antigravity(self):
        self.assertEqual(task_image_source("muse"), "muse")

    def test_internal_worker_skips_muse_tasks(self):
        from bkt_web import image_routes
        self.assertIn("muse", image_routes._NOT_INTERNAL)
        self.assertNotIn("muse", image_routes.EXTERNAL_ENGINES)


if __name__ == "__main__":
    unittest.main()
