"""Story Remake: theo dõi kênh Shorts (thêm kênh → tự chạy, rồi định kỳ)."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import story_remake_routes as srr

T = 1_800_000_000


class StoryWatchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.patches = [patch.object(srr, "ROOT", self.tmp), patch.object(srr, "WATCH", self.tmp / "watch.json"),
                        patch.object(srr, "RUNNER", self.tmp / "runner.json"), patch.object(srr, "start_watch", lambda: None)]
        for p in self.patches:
            p.start()
        self.launched = []
        self.running = False
        patch.object(srr, "_launch", lambda url, *a, **k: self.launched.append(url) or 1).start()
        patch.object(srr, "_runner", lambda: {"running": self.running, "url": self.launched[-1] if self.launched else None}).start()
        app = FastAPI(); app.include_router(srr.router)
        self.client = TestClient(app)

    def tearDown(self):
        patch.stopall()

    def test_shorts_url_accepts_only_channel_links(self):
        self.assertEqual(srr.shorts_url("https://youtube.com/@abc.def/"), "https://www.youtube.com/@abc.def/shorts")
        self.assertEqual(srr.shorts_url("https://www.youtube.com/channel/UC12_x/shorts"), "https://www.youtube.com/channel/UC12_x/shorts")
        for bad in ("https://www.youtube.com/watch?v=abc", "https://evil.com/@x", "-x", "https://www.youtube.com/@x/videos"):
            with self.assertRaises(ValueError):
                srr.shorts_url(bad)

    def test_adding_a_channel_starts_it_at_once_when_idle(self):
        r = self.client.post("/api/story-remake/watch", json={"url": "https://www.youtube.com/@kenh1"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["started"], "https://www.youtube.com/@kenh1/shorts")
        self.assertEqual(self.client.post("/api/story-remake/watch", json={"url": "https://youtube.com/@kenh1/shorts"}).status_code, 409)
        self.assertEqual(self.client.post("/api/story-remake/watch", json={"url": "https://www.youtube.com/watch?v=x"}).status_code, 400)

    def test_tick_waits_for_a_free_runner_and_rotates_by_interval(self):
        self.running = True
        self.client.post("/api/story-remake/watch", json={"url": "https://www.youtube.com/@a"})
        self.client.post("/api/story-remake/watch", json={"url": "https://www.youtube.com/@b"})
        self.assertEqual(self.launched, [])  # bận → không chạy chồng
        self.running = False
        self.assertEqual(srr.watch_tick(T), "https://www.youtube.com/@a/shorts")
        self.assertEqual(srr.watch_tick(T + 1), "https://www.youtube.com/@b/shorts")
        self.assertIsNone(srr.watch_tick(T + 2))  # chưa tới hạn (60 phút)
        self.assertEqual(srr.watch_tick(T + 3600), "https://www.youtube.com/@a/shorts")

    def test_paused_channel_and_global_switch_are_skipped(self):
        self.running = True
        self.client.post("/api/story-remake/watch", json={"url": "https://www.youtube.com/@a"})
        self.client.post("/api/story-remake/watch/toggle", json={"url": "https://www.youtube.com/@a/shorts"})
        self.running = False
        self.assertIsNone(srr.watch_tick(T))
        self.client.post("/api/story-remake/watch/toggle", json={"url": "https://www.youtube.com/@a/shorts"})
        self.client.put("/api/story-remake/watch/config", json={"interval_min": 30, "enabled": False})
        self.assertIsNone(srr.watch_tick(T))
        self.client.put("/api/story-remake/watch/config", json={"interval_min": 30, "enabled": True})
        self.assertEqual(srr.watch_tick(T), "https://www.youtube.com/@a/shorts")
        self.client.post("/api/story-remake/watch/remove", json={"url": "https://www.youtube.com/@a/shorts"})
        self.assertEqual(self.client.get("/api/story-remake/watch").json()["channels"], [])


if __name__ == "__main__":
    unittest.main()
