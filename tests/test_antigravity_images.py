"""compare_studio/tools/antigravity-images.mjs với một hàng đợi Antigravity giả lập.

Không gọi Antigravity/Pollinations thật: một HTTP server nhỏ đóng vai
/api/ai-images/queue của bkt_web. Kiểm tra: ảnh về đúng chỗ, task lỗi được xin lại,
quá hạn thì ra nền tạm và đánh dấu đang chờ, chạy lại không tạo task trùng.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "compare_studio" / "tools"
PNG = bytes.fromhex("89504e470d0a1a0a") + b"\0" * 4096


class FakeQueue:
    def __init__(self):
        self.tasks = {}          # id -> dict
        self.posts = []          # prompts đã gửi
        self.behaviour = "complete"  # complete | fail_once | never
        self.lock = threading.Lock()
        self.counter = 0

    def handler(self):
        queue = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _json(self, code, body):
                data = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.path.startswith("/api/ai-images/queue"):
                    with queue.lock:
                        for t in queue.tasks.values():
                            t["polls"] += 1
                            if t["status"] == "pending" and t["polls"] >= 2:
                                if queue.behaviour == "complete" or (queue.behaviour == "fail_once" and t["attempt"] > 1):
                                    t.update(status="completed", image_url=f"/static/generated_images/{t['id']}.png",
                                             image_filename=f"{t['id']}.png")
                                elif queue.behaviour == "fail_once":
                                    t.update(status="failed", error_message="agent timeout")
                        return self._json(200, {"queue": [dict(t) for t in queue.tasks.values()]})
                if self.path.startswith("/static/generated_images/"):
                    self.send_response(200)
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Content-Length", str(len(PNG)))
                    self.end_headers()
                    self.wfile.write(PNG)
                    return
                self._json(404, {"detail": "not found"})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}")
                if self.path == "/api/ai-images/queue":
                    assert body.get("engine") == "antigravity", body
                    with queue.lock:
                        queue.counter += 1
                        tid = f"task_{queue.counter}"
                        attempt = sum(1 for p in queue.posts if p["prompt"] == body["prompt"]) + 1
                        queue.posts.append(body)
                        queue.tasks[tid] = {"id": tid, "status": "pending", "polls": 0, "attempt": attempt,
                                            "aspect_ratio": body.get("aspect_ratio")}
                    return self._json(200, {"task_ids": [tid]})
                self._json(404, {"detail": "not found"})

        return H


@unittest.skipUnless(shutil.which("node") and shutil.which("ffmpeg"), "cần node và ffmpeg")
class AntigravityImagesTests(unittest.TestCase):
    def setUp(self):
        self.queue = FakeQueue()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self.queue.handler())
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "vox-demo-vi"
        self.dir.mkdir()

    def tearDown(self):
        self.server.shutdown()
        self.tmp.cleanup()

    def run_ensure(self, items, timeout_min=0.05):
        script = (
            "import { ensureAntigravityImages } from " + json.dumps(str(TOOLS / "antigravity-images.mjs")) + ";"
            f"const r = await ensureAntigravityImages({{ dir: {json.dumps(str(self.dir))}, slug: 'vox-demo-vi',"
            f" items: {json.dumps(items)}, timeoutMin: {timeout_min}, log: () => {{}} }});"
            "console.log(JSON.stringify(r));"
        )
        env = {**os.environ, "TOKMATRIX_API": f"http://127.0.0.1:{self.server.server_address[1]}", "ANTIGRAVITY_POLL_MS": "100"}
        out = subprocess.run(["node", "--input-type=module", "-e", script], capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout.strip().splitlines()[-1])

    def state(self):
        return json.loads((self.dir / "images.json").read_text())["items"]

    ITEMS = [
        {"key": "sticker-1", "prompt": "a red apple", "aspect": "1:1", "dest": "assets/images/sticker-1.jpg"},
        {"key": "sticker-2", "prompt": "a blue cup", "aspect": "1:1", "dest": "assets/images/sticker-2.jpg"},
    ]

    def test_images_arrive_and_are_saved(self):
        res = self.run_ensure(self.ITEMS, timeout_min=0.5)
        self.assertEqual(sorted(res["ready"]), ["sticker-1", "sticker-2"])
        self.assertEqual(res["pending"], [])
        for it in self.ITEMS:
            self.assertEqual((self.dir / it["dest"]).read_bytes(), PNG)
        self.assertTrue(all(v["source"] == "antigravity" for v in self.state().values()))
        self.assertTrue(all(p["aspect_ratio"] == "1:1" for p in self.queue.posts))

    def test_failed_task_is_requested_again(self):
        self.queue.behaviour = "fail_once"
        res = self.run_ensure(self.ITEMS[:1], timeout_min=0.5)
        self.assertEqual(res["ready"], ["sticker-1"])
        self.assertEqual(len(self.queue.posts), 2)  # lần đầu lỗi → xin lại 1 lần
        self.assertEqual(self.state()["sticker-1"]["attempts"], 2)

    def test_timeout_writes_placeholder_and_marks_pending(self):
        self.queue.behaviour = "never"
        res = self.run_ensure(self.ITEMS, timeout_min=0)
        self.assertEqual(sorted(res["pending"]), ["sticker-1", "sticker-2"])
        st = self.state()
        self.assertTrue(all(v["source"] == "placeholder" for v in st.values()))
        self.assertTrue((self.dir / "assets/images/sticker-1.jpg").is_file())  # nền tạm để xem trước

    def test_rerun_reuses_live_tasks(self):
        self.queue.behaviour = "never"
        self.run_ensure(self.ITEMS, timeout_min=0)
        self.assertEqual(len(self.queue.posts), 2)
        self.run_ensure(self.ITEMS, timeout_min=0)
        self.assertEqual(len(self.queue.posts), 2)  # không tạo task trùng
        self.queue.behaviour = "complete"
        res = self.run_ensure(self.ITEMS, timeout_min=0.5)
        self.assertEqual(res["pending"], [])
        self.assertEqual(len(self.queue.posts), 2)


class NoPollinationsTests(unittest.TestCase):
    """Pipeline video không còn gọi Pollinations ở bất kỳ đâu."""

    def test_tools_and_backend_pipeline_have_no_pollinations(self):
        offenders = []
        files = list(TOOLS.glob("*.mjs")) + [ROOT / "bkt_web" / "compare_native.py", ROOT / "bkt_web" / "publish_kit.py"]
        for f in files:
            text = f.read_text(encoding="utf-8", errors="ignore")
            if re.search(r"pollinations\.ai|getAiImageUrl\(|generate_image_file", text, re.I):
                offenders.append(f.name)
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
