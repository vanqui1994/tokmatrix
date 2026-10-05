import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class RemakeTaskStoreTest(unittest.TestCase):
    def store(self, folder):
        from bkt_web.remake_task_store import RemakeTaskStore

        return RemakeTaskStore(Path(folder) / "tasks.db")

    def test_task_survives_a_new_store_instance_and_processing_is_recovered(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = self.store(tmp)
            task, created = first.create_remake(
                task_id="task-one", source_sha256="a" * 64,
                video_path="/tmp/source.mp4", project_name="remake-aaaaaaaaaaaa",
                initial_log="created",
            )
            self.assertTrue(created)
            claimed = first.claim_next(now=100)
            self.assertEqual(claimed["status"], "processing")
            self.assertEqual(claimed["attempt_count"], 1)

            restarted = self.store(tmp)
            self.assertEqual(restarted.get(task["id"])["status"], "processing")
            self.assertEqual(restarted.recover_interrupted(), 1)
            recovered = restarted.get(task["id"])
            self.assertEqual(recovered["status"], "pending")
            self.assertIn("khởi động lại", recovered["current_step"])

    def test_source_sha256_is_an_atomic_idempotency_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = self.store(tmp)
            first, created = store.create_remake(
                task_id="task-one", source_sha256="b" * 64,
                video_path="/tmp/one.mp4", project_name="project-one", initial_log="one",
            )
            duplicate, duplicate_created = store.create_remake(
                task_id="task-two", source_sha256="b" * 64,
                video_path="/tmp/two.mp4", project_name="project-two", initial_log="two",
            )
            self.assertTrue(created)
            self.assertFalse(duplicate_created)
            self.assertEqual(duplicate["id"], first["id"])
            self.assertEqual(duplicate["project_name"], "project-one")

    def test_failure_requeues_with_backoff_then_stops_at_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = self.store(tmp)
            task, _ = store.create_remake(
                task_id="task-retry", source_sha256="c" * 64,
                video_path="/tmp/source.mp4", project_name="project", initial_log="created",
            )
            for attempt in range(1, 4):
                claimed = store.claim_next(now=100 + attempt * 100)
                self.assertEqual(claimed["attempt_count"], attempt)
                failed = store.fail_or_retry(task["id"], f"failure {attempt}", now=100 + attempt * 100)
                expected = "pending" if attempt < 3 else "error"
                self.assertEqual(failed["status"], expected)
            self.assertEqual(store.get(task["id"])["error"], "failure 3")
            retried = store.retry(task["id"])
            self.assertEqual(retried["status"], "pending")
            self.assertEqual(retried["attempt_count"], 0)
            self.assertIsNone(retried["error"])


class RemakeQueueIntegrationTest(unittest.TestCase):
    def test_enqueuing_the_same_bytes_reuses_one_task_and_project(self):
        from bkt_web import remake_routes
        from bkt_web.remake_task_store import RemakeTaskStore

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source_one = root / "one.mp4"
            source_two = root / "two.mp4"
            source_one.write_bytes(b"same-video")
            source_two.write_bytes(b"same-video")
            store = RemakeTaskStore(root / "tasks.db")
            with patch.object(remake_routes, "REMAKE_TASK_STORE", store):
                first, created = remake_routes._enqueue_remake(source_one, None, initial_log="one")
                duplicate, duplicate_created = remake_routes._enqueue_remake(source_two, "different", initial_log="two")
            self.assertTrue(created)
            self.assertFalse(duplicate_created)
            self.assertEqual(duplicate["id"], first["id"])
            self.assertEqual(duplicate["project_name"], first["project_name"])
            self.assertEqual(first["project_name"], f"remake-{first['source_sha256'][:12]}")

    def _enqueue_twice(self, root, first_status, registry):
        from bkt_web import remake_routes
        from bkt_web.remake_task_store import RemakeTaskStore

        source_one = root / "one.mp4"
        source_two = root / "two.mp4"
        source_one.write_bytes(b"same-video")
        source_two.write_bytes(b"same-video")
        store = RemakeTaskStore(root / "tasks.db")
        registry_path = root / "projects.json"
        with patch.object(remake_routes, "REMAKE_TASK_STORE", store), \
                patch.object(remake_routes, "PROJECTS_REGISTRY", registry_path):
            first, _ = remake_routes._enqueue_remake(source_one, None, initial_log="one")
            first.update(status=first_status, progress=100, result={"id": first["project_name"]})
            store.put(first)
            registry_path.write_text(json.dumps(registry(first)), encoding="utf-8")
            second, created = remake_routes._enqueue_remake(source_two, None, initial_log="two")
        return first, second, created

    def test_reupload_reruns_when_the_project_was_deleted(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second, created = self._enqueue_twice(Path(tmp), "completed", lambda _t: [])
            self.assertTrue(created)
            self.assertEqual(second["id"], first["id"])
            self.assertEqual(second["status"], "pending")
            self.assertEqual(second["progress"], 0)
            self.assertIsNone(second["result"])
            self.assertTrue(second["video_path"].endswith("two.mp4"))

    def test_reupload_reruns_a_task_that_ran_out_of_retries(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, second, created = self._enqueue_twice(
                Path(tmp), "error", lambda t: [{"id": t["project_name"]}])
            self.assertTrue(created)
            self.assertEqual(second["status"], "pending")
            self.assertEqual(second["attempt_count"], 0)

    def test_reupload_reuses_a_project_that_still_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, second, created = self._enqueue_twice(
                Path(tmp), "completed", lambda t: [{"id": t["project_name"]}])
            self.assertFalse(created)
            self.assertEqual(second["status"], "completed")

    def test_retry_reuses_completed_tts_cache_instead_of_calling_provider_again(self):
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_pipeline import RemakePipeline

        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(pipeline_module, "SCRATCH_DIR", Path(tmp) / "scratch"), \
                patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(tmp) / "public"), \
                patch.object(pipeline_module, "STATIC_DIR", Path(tmp) / "static"):
            source = Path(tmp) / "source.mp4"
            source.write_bytes(b"source")
            pipeline = RemakePipeline(str(source), "stable-project")
            pipeline.metadata = {"duration": 2.0}
            pipeline.adapted_cues = [{
                "start": 0.0, "end": 1.0, "text": "Xin chào", "speaker": "host",
                "engine": "capcut", "voice": "voice-one", "voice_role": "adult",
            }]

            def tts(_text, _engine, _voice, output, _role, **_kwargs):
                Path(output).write_bytes(b"a" * 1200)
                return True

            def command(args, **_kwargs):
                if args[0] == "ffprobe":
                    return type("Result", (), {"stdout": json.dumps({"format": {"duration": "0.8"}})})()
                pipeline.master_audio_path.parent.mkdir(parents=True, exist_ok=True)
                pipeline.master_audio_path.write_bytes(b"master")
                return type("Result", (), {"stdout": ""})()

            with patch.object(pipeline_module, "generate_tts", side_effect=tts) as generate, \
                    patch.object(pipeline_module.subprocess, "run", side_effect=command):
                pipeline._synthesize_timed_audio()
                pipeline._synthesize_timed_audio()

            self.assertEqual(generate.call_count, 1)
            cache = json.loads((pipeline.audio_dir / "cache.json").read_text(encoding="utf-8"))
            self.assertIn("0", cache)


if __name__ == "__main__":
    unittest.main()
