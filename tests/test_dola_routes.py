import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import dola_accounts as da
from bkt_web import dola_routes as dr
from bkt_web import dola_video as dv
from bkt_web.db_utils import connect_db

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"0" * 64


class FakeGateway:
    """Gateway giả: mỗi lần poll đi tiếp một bước trong `script` của task."""

    def __init__(self):
        self.posts = 0
        self.submit = []        # hàng đợi phản hồi cho POST (mặc định 200)
        self.script = ["processing", "completed"]
        self.polls = 0

    def __call__(self, req: httpx.Request):
        if req.method == "POST":
            self.posts += 1
            nxt = self.submit.pop(0) if self.submit else None
            if isinstance(nxt, Exception):
                raise nxt
            if isinstance(nxt, httpx.Response):
                return nxt
            return httpx.Response(200, json={"id": f"video_{self.posts}", "status": "queued"})
        if req.url.path.endswith(".mp4"):
            return httpx.Response(200, content=MP4)
        if req.url.path == "/health":
            return httpx.Response(200, json={"ok": True, "available": True, "pending_tasks": 0, "accounts": []})
        self.polls += 1
        step = self.script.pop(0) if self.script else "processing"
        if isinstance(step, httpx.Response):
            return step
        body = {"id": req.url.path.rsplit("/", 1)[-1], "status": step}
        if step == "completed":
            body["video_url"] = "http://gw/videos/out.mp4"
        if step == "failed":
            body["error"] = "content policy"
        return httpx.Response(200, json=body)


class DolaRoutesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.saved = (dr.DB_PATH, dr.VIDEO_DIR, dict(dr.CLIENT_KW), dr.accounts_override, dr.now_fn)
        dr.DB_PATH = root / "db.sqlite"
        dr.VIDEO_DIR = root / "videos"
        self.gw = FakeGateway()
        self.clock = [1000.0]
        dr.now_fn = lambda: self.clock[0]
        dr.CLIENT_KW.clear()
        dr.CLIENT_KW.update(poll_interval=0, transport=httpx.MockTransport(self.gw), sleep=lambda s: None)
        # Mặc định một mục, hạn mức lớn: các test luồng cũ không chạm tới giới hạn 2/ngày.
        dr.accounts_override = [da.DolaAccountConfig(id="default", base_url="http://gw", daily_limit=100)]
        dr.init_tables()
        app = FastAPI()
        app.include_router(dr.router)
        self.api = TestClient(app)

    def tearDown(self):
        dr.DB_PATH, dr.VIDEO_DIR, kw, dr.accounts_override, dr.now_fn = self.saved
        dr.CLIENT_KW.clear()
        dr.CLIENT_KW.update(kw)
        self.tmp.cleanup()

    def create(self, **kw):
        body = {"prompt": "fox in snow", **kw}
        res = self.api.post("/api/dola/tasks", json=body)
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["ids"]

    def task(self, tid):
        return self.api.get(f"/api/dola/tasks/{tid}").json()

    def run_ticks(self, n, step=10):
        for _ in range(n):
            dr.tick()
            self.clock[0] += step

    def test_full_flow_to_library(self):
        [tid] = self.create()
        self.run_ticks(4)
        t = self.task(tid)
        self.assertEqual(t["status"], "COMPLETED", t)
        self.assertEqual(t["remote_id"], "video_1")
        self.assertTrue(t["file_url"].endswith("dola-1.mp4"))
        self.assertEqual(Path(t["local_path"]).read_bytes(), MP4)
        [lib] = dr.library_videos()
        self.assertEqual(lib["source"], "dola")
        self.assertEqual(lib["video_path"], t["local_path"])
        self.assertEqual(self.gw.posts, 1)

    def test_invalid_params_rejected(self):
        self.assertEqual(self.api.post("/api/dola/tasks", json={"prompt": "x", "duration": 12}).status_code, 422)
        self.assertEqual(self.api.post("/api/dola/tasks", json={"prompt": "x", "count": 9}).status_code, 422)
        # Dola hỗ trợ 10, 15, 30: các giá trị ngoài danh sách như 25 bị từ chối với 422.
        self.assertEqual(self.api.post("/api/dola/tasks", json={"prompt": "x", "duration": 25}).status_code, 422)

    def test_quota_on_only_account_waits_for_reset(self):
        self.gw.submit = [httpx.Response(429, json={"detail": "Rate limited: All accounts reached Dola daily video limit"})]
        [tid] = self.create()
        dr.tick()
        t = self.task(tid)
        self.assertEqual(t["status"], "SUBMITTING")
        reset = dr.manager().next_reset()
        self.assertEqual(t["next_attempt_at"], reset)
        self.assertIn("hết lượt", t["error"])
        dr.tick()                       # chưa tới giờ reset: không gửi lại
        self.assertEqual(self.gw.posts, 1)
        self.clock[0] = reset + 1
        self.run_ticks(4)
        self.assertEqual(self.task(tid)["status"], "COMPLETED")
        self.assertEqual(self.gw.posts, 2)

    def test_pending_queue_full_is_a_short_cooldown(self):
        self.gw.submit = [httpx.Response(429, json={"detail": "Pending task queue has reached server limit (100)"})]
        [tid] = self.create()
        dr.tick()
        self.assertEqual(self.task(tid)["next_attempt_at"], self.clock[0] + da.SHORT_COOLDOWN)
        self.clock[0] += da.SHORT_COOLDOWN + 1
        self.run_ticks(4)
        self.assertEqual(self.task(tid)["status"], "COMPLETED")

    def test_connect_error_resubmits_but_read_timeout_does_not(self):
        self.gw.submit = [httpx.ConnectError("down")]
        [a] = self.create()
        dr.tick()
        self.assertEqual(self.task(a)["status"], "SUBMITTING")
        self.assertEqual(self.task(a)["next_attempt_at"], self.clock[0] + da.SHORT_COOLDOWN)
        # A được gửi lại (thành công) trước, rồi B gặp timeout đọc.
        self.gw.submit = [httpx.Response(200, json={"id": "video_a", "status": "queued"}), httpx.ReadTimeout("slow")]
        [b] = self.create()
        self.clock[0] += 3600
        dr.tick()
        self.assertEqual(self.task(b)["status"], "FAILED")
        self.assertIn("có thể đã nhận task", self.task(b)["error"])
        self.assertEqual(self.task(a)["remote_id"], "video_a")
        posts = self.gw.posts
        self.clock[0] += 3600
        dr.tick()
        self.assertEqual(self.gw.posts, posts)          # B không bị gửi lại

    def test_poll_jitter_and_remote_failure(self):
        self.gw.script = [httpx.Response(503), "processing", "failed"]
        [tid] = self.create()
        self.run_ticks(6, step=120)
        t = self.task(tid)
        self.assertEqual(t["status"], "FAILED")
        self.assertIn("content policy", t["error"])
        res = self.api.post(f"/api/dola/tasks/{tid}/retry")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.task(res.json()["ids"][0])["status"], "SUBMITTING")

    def test_timeout_then_recheck(self):
        self.gw.script = ["processing"] * 3 + ["completed"]
        [tid] = self.create()
        dr.tick()
        self.clock[0] += 301
        dr.tick()
        self.assertEqual(self.task(tid)["status"], "TIMEOUT")
        self.assertEqual(self.api.post(f"/api/dola/tasks/{tid}/recheck").status_code, 200)
        self.run_ticks(4)
        self.assertEqual(self.task(tid)["status"], "COMPLETED")
        self.assertEqual(self.gw.posts, 1)

    def test_delete_rules(self):
        [tid] = self.create()
        self.assertEqual(self.api.delete(f"/api/dola/tasks/{tid}").status_code, 409)   # đang chạy
        self.run_ticks(4)
        path = self.task(tid)["local_path"]
        conn = connect_db(dr.DB_PATH)
        conn.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, video_path TEXT, status TEXT)")
        conn.execute("INSERT INTO upload_tasks (video_path, status) VALUES (?, 'QUEUED')", (path,))
        conn.commit()
        self.assertEqual(self.api.delete(f"/api/dola/tasks/{tid}").status_code, 409)   # đang chờ đăng
        conn.execute("UPDATE upload_tasks SET status='SUCCESS'")
        conn.commit()
        conn.close()
        self.assertEqual(self.api.delete(f"/api/dola/tasks/{tid}").status_code, 200)
        self.assertFalse(Path(path).exists())

    def test_status_endpoint(self):
        s = self.api.get("/api/dola/status").json()
        self.assertTrue(s["gateway"]["online"])
        self.assertEqual(s["durations"], [10, 15, 30])

    def test_humanize_endpoint(self):
        resp = self.api.post("/api/dola/humanize-prompt", json={"prompt": "cat running 8k hdr photorealistic"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertNotIn("8k", data["humanized"])
        self.assertTrue(data["humanized"].startswith("A natural cinematic visual of cat running"))

    def test_create_with_humanize(self):
        resp = self.api.post("/api/dola/tasks", json={
            "prompt": "dog barking 8k masterpiece",
            "model": "seedance-2.0",
            "duration": 10,
            "ratio": "9:16",
            "humanize": True,
        })
        self.assertEqual(resp.status_code, 200)
        task = resp.json()["tasks"][0]
        self.assertNotIn("8k", task["prompt"])
        self.assertNotIn("masterpiece", task["prompt"])
        self.assertTrue(task["prompt"].startswith("A natural cinematic visual of dog barking"))

    def test_auto_routing_by_duration(self):
        # duration 30s -> automatically routed to seedance-2.5
        r30 = self.api.post("/api/dola/tasks", json={
            "prompt": "beach sunset",
            "model": "",
            "duration": 30,
            "ratio": "9:16",
        })
        self.assertEqual(r30.status_code, 200)
        t30 = r30.json()["tasks"][0]
        self.assertEqual(t30["model"], "seedance-2.5")

        # duration 15s -> automatically routed to seedance-2.0
        r15 = self.api.post("/api/dola/tasks", json={
            "prompt": "mountain river",
            "model": "seedance-2.5",  # Even if 2.5 was sent, 15s routes to 2.0
            "duration": 15,
            "ratio": "9:16",
        })
        self.assertEqual(r15.status_code, 200)
        t15 = r15.json()["tasks"][0]
        self.assertEqual(t15["model"], "seedance-2.0")

        # duration 10s -> automatically routed to seedance-2.0
        r10 = self.api.post("/api/dola/tasks", json={
            "prompt": "forest path",
            "model": "",
            "duration": 10,
            "ratio": "9:16",
        })
        self.assertEqual(r10.status_code, 200)
        t10 = r10.json()["tasks"][0]
        self.assertEqual(t10["model"], "seedance-2.0")


if __name__ == "__main__":
    unittest.main()

