import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from bkt_web import image_routes
from bkt_web.antigravity_agent import write_task_bundle


class AntigravityBridgeTest(unittest.TestCase):
    def test_task_bundle_is_machine_and_human_readable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "bridge"
            files = write_task_bundle({
                "id": "task_123_abc",
                "prompt": "Một cây lạc hoạt hình 2D",
                "negative_prompt": "watermark, text",
                "aspect_ratio": "9:16",
                "seed": 42,
                "notes": "giữ đúng nhân vật",
            }, root)

            payload = json.loads(Path(files["json"]).read_text(encoding="utf-8"))
            markdown = Path(files["markdown"]).read_text(encoding="utf-8")
            self.assertEqual(payload["schema"], "tokmatrix.antigravity-bridge/v1")
            self.assertEqual(payload["recommended_size"], {"width": 1440, "height": 2560})
            self.assertTrue(payload["output_path"].endswith("outbox/task_123_abc.png"))
            self.assertIn("Một cây lạc hoạt hình 2D", markdown)
            self.assertIn(payload["output_path"], markdown)

    def test_external_task_claim_is_atomic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with (
                patch("bkt_web.image_routes.DB_PATH", root / "queue.db"),
                patch("bkt_web.image_routes.GENERATED_DIR", root / "generated"),
                patch("bkt_web.image_routes.LEGACY_QUEUE_FILE", root / "missing.json"),
            ):
                image_routes.GENERATED_DIR.mkdir()
                image_routes.init_image_tables()
                conn = image_routes._db()
                conn.execute(
                    """INSERT INTO image_queue
                       (id,prompt,status,engine,created_at,created_ts,updated_at)
                       VALUES (?,?, 'pending','antigravity','now',1,'now')""",
                    ("task_atomic_1", "draw"),
                )
                conn.commit()
                conn.close()

                result = image_routes.claim_external_queue_item(
                    "task_atomic_1", image_routes.ClaimQueueItemRequest(worker_id="ide-a")
                )
                self.assertEqual(result["task"]["status"], "processing")
                self.assertIn("ide-a", result["task"]["notes"])

                with self.assertRaises(HTTPException) as raised:
                    image_routes.claim_external_queue_item(
                        "task_atomic_1", image_routes.ClaimQueueItemRequest(worker_id="ide-b")
                    )
                self.assertEqual(raised.exception.status_code, 409)


    def test_duplicate_outbox_image_for_completed_task_is_not_imported_again(self):
        # Agent chạy chồng / vẽ lại sau restart từng làm một task có 3 ảnh trong Thư viện.
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with (
                patch("bkt_web.image_routes.DB_PATH", root / "queue.db"),
                patch("bkt_web.image_routes.GENERATED_DIR", root / "generated"),
                patch("bkt_web.image_routes.LEGACY_QUEUE_FILE", root / "missing.json"),
                patch("bkt_web.image_routes._BRIDGE_ROOT", root / "bridge"),
            ):
                image_routes.GENERATED_DIR.mkdir()
                image_routes.init_image_tables()
                dirs = image_routes._bridge_dirs()
                for d in dirs.values():
                    d.mkdir(parents=True, exist_ok=True)
                conn = image_routes._db()
                conn.execute(
                    """INSERT INTO image_queue (id,prompt,status,engine,created_at,created_ts,updated_at)
                       VALUES ('task_dup_1','draw','processing','antigravity','now',1,'now')"""
                )
                conn.commit()
                conn.close()

                def drop_image(color):
                    Image.new("RGB", (8, 8), color).save(dirs["outbox"] / "task_dup_1.png")

                drop_image("red")
                image_routes._bridge_auto_import()
                conn = image_routes._db()
                first = conn.execute("SELECT status, image_filename FROM image_queue WHERE id='task_dup_1'").fetchone()
                conn.close()
                self.assertEqual(first[0], "completed")

                drop_image("blue")
                image_routes._bridge_auto_import()
                conn = image_routes._db()
                assets = conn.execute("SELECT COUNT(*) FROM image_assets WHERE engine='antigravity'").fetchone()[0]
                after = conn.execute("SELECT image_filename FROM image_queue WHERE id='task_dup_1'").fetchone()[0]
                conn.close()
                self.assertEqual(assets, 1)
                self.assertEqual(after, first[1])
                self.assertEqual(list(dirs["outbox"].iterdir()), [])
                self.assertEqual(len(list(dirs["archive"].glob("task_dup_1-dup-*.png"))), 1)


if __name__ == "__main__":
    unittest.main()
