import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import antigravity_scriptwriter as writer
from bkt_web import script_bridge_worker as worker
from bkt_web import script_routes as routes

ROOT = Path(__file__).resolve().parent.parent


class ScriptBridgeWorkerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.bridge = base / "bridge"
        for patch in (
            mock.patch.object(routes, "DB_PATH", base / "db.sqlite"),
            mock.patch.object(routes, "SCRIPTS_DIR", base / "scripts"),
            mock.patch.object(writer, "BRIDGE_ROOT", self.bridge),
            mock.patch.object(worker, "MAX_TASKS", 2),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        routes.SCRIPTS_DIR.mkdir()
        routes.init_script_tables()

    def enqueue(self, prompt="Return {\"angles\": []}"):
        return routes.enqueue_script(routes.EnqueueScriptRequest(video_type="matrix", lang="de", prompt=prompt))["task_ids"][0]

    def status(self, task_id):
        return routes.get_script_task(task_id)["task"]

    def write_outbox(self, task_id, content):
        path = self.bridge / "outbox" / f"{task_id}.json"
        path.write_text(content, encoding="utf-8")
        old = time.time() - 10
        os.utime(path, (old, old))

    def test_pull_respects_inbox_limit_and_writes_matrix_instructions(self):
        ids = [self.enqueue(f"task {i}") for i in range(3)]
        self.assertEqual(worker.pull_once(), 2)
        self.assertEqual(worker.pull_once(), 0)  # inbox đã đủ 2
        self.assertEqual([self.status(i)["status"] for i in ids], ["processing", "processing", "pending"])
        md = (self.bridge / "inbox" / f"{ids[0]}.md").read_text(encoding="utf-8")
        self.assertIn("JSON schema", md)
        self.assertIn("task 0", md)

    def test_import_completes_task_and_archives_bundle(self):
        task_id = self.enqueue()
        worker.pull_once()
        self.write_outbox(task_id, json.dumps({"angles": [{"title": "Kosmos"}]}))
        self.assertEqual(worker.import_once(), 1)
        task = self.status(task_id)
        self.assertEqual(task["status"], "completed")
        self.assertEqual(task["script_json"]["angles"][0]["title"], "Kosmos")
        self.assertFalse((self.bridge / "inbox" / f"{task_id}.md").exists())
        self.assertTrue((self.bridge / "archive" / f"{task_id}.json").exists())
        self.assertEqual(worker.pull_once(), 0)

    def test_file_still_being_written_is_not_imported(self):
        task_id = self.enqueue()
        worker.pull_once()
        (self.bridge / "outbox" / f"{task_id}.json").write_text("{}", encoding="utf-8")
        self.assertEqual(worker.import_once(), 0)
        self.assertEqual(self.status(task_id)["status"], "processing")

    def test_invalid_json_fails_task(self):
        task_id = self.enqueue()
        worker.pull_once()
        self.write_outbox(task_id, "{not json")
        worker.import_once()
        self.assertEqual(self.status(task_id)["status"], "failed")
        self.assertIn("JSON", self.status(task_id)["error_message"])
        self.assertFalse(list((self.bridge / "outbox").glob("*.json")))

    def test_stale_task_fails_and_frees_the_inbox(self):
        task_id = self.enqueue()
        worker.pull_once()
        self.assertEqual(worker.expire_stale_once(now=time.time() + worker.STALE_SECONDS + 5), 1)
        self.assertEqual(self.status(task_id)["status"], "failed")
        self.assertFalse(list((self.bridge / "inbox").glob("*.json")))


class ScriptWriterHttpAuthTest(unittest.TestCase):
    def test_internal_token_is_sent_as_bearer_header(self):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        with mock.patch.dict(os.environ, {"TOKMATRIX_INTERNAL_TOKEN": "test-secret"}, clear=False), \
             mock.patch("urllib.request.urlopen", return_value=response) as urlopen, \
             mock.patch("json.load", return_value={"success": True}):
            writer._request("http://127.0.0.1:8080", "/api/scripts/queue/stats")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret")


class ScriptQueueCliTest(unittest.TestCase):
    def call(self, payload):
        out = subprocess.run([sys.executable, "-m", "bkt_web.script_queue_cli"], input=json.dumps(payload),
                             capture_output=True, text=True, cwd=ROOT, timeout=60)
        return json.loads(out.stdout.strip().splitlines()[-1])

    def test_enqueue_get_fail_round_trip_without_resetting_claims(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = str(Path(tmp) / "q.db")
            created = self.call({"op": "enqueue", "prompt": "x", "lang": "ko", "db_path": db})
            self.assertTrue(created["ok"])
            task_id = created["result"]["task_id"]
            with mock.patch.object(routes, "DB_PATH", Path(db)):
                routes.claim_script_task(task_id, routes.ClaimRequest(worker_id="w"))
            self.assertEqual(self.call({"op": "get", "task_id": task_id, "db_path": db})["result"]["status"], "processing")
            self.assertTrue(self.call({"op": "fail", "task_id": task_id, "error": "boom", "db_path": db})["ok"])
            self.assertEqual(self.call({"op": "get", "task_id": task_id, "db_path": db})["result"]["status"], "failed")
            self.assertFalse(self.call({"op": "nope", "db_path": db})["ok"])


if __name__ == "__main__":
    unittest.main()
