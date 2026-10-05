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


class StoryEnqueueTest(unittest.TestCase):
    """Remake xong → hàng đợi đăng của tài khoản đã chọn (một lần, đúng ngôn ngữ, MP4 chép vào storage)."""

    def setUp(self):
        import json, sqlite3
        self.tmp = Path(tempfile.mkdtemp())
        self.db = self.tmp / "ch.db"
        with sqlite3.connect(self.db) as c:
            c.execute("CREATE TABLE channels(id INTEGER PRIMARY KEY, username TEXT)")
            c.execute("INSERT INTO channels VALUES (7, 'acc_de'), (8, 'acc_ja')")
            c.execute("CREATE TABLE upload_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INT, video_path TEXT, caption TEXT, "
                      "hashtags TEXT, schedule_time INT, status TEXT, created_at INT, ai_generated INT, run_id TEXT)")
        for p in (patch.object(srr, "ROOT", self.tmp / "sr"), patch.object(srr, "CHANNELS_DB", self.db),
                  patch.object(srr, "UPLOAD_DIR", self.tmp / "storage"),
                  patch.object(srr, "_account_language", lambda a: {"language": {7: "de", 8: "ja"}[a], "niche": ""}),
                  patch("bkt_web.autopilot.scheduler.next_slot", lambda a: 1_900_000_000)):
            p.start()
        (self.tmp / "sr" / "out").mkdir(parents=True)

        def video(vid, lang, **state):
            w = self.tmp / "sr" / vid; w.mkdir()
            (w / "words.json").write_text(json.dumps({"lang": lang, "words": [[0, 1, "Hallo"], [1, 2, "Welt"]]}))
            (w / "state.json").write_text(json.dumps({"id": vid, "status": "done", **state}))
            (self.tmp / "sr" / "out" / f"{vid}.mp4").write_bytes(b"mp4")
        self.video = video
        self.json = json

    def tearDown(self):
        patch.stopall()

    def state(self, vid):
        return self.json.loads((self.tmp / "sr" / vid / "state.json").read_text())

    def tasks(self):
        import sqlite3
        with sqlite3.connect(self.db) as c:
            return c.execute("SELECT channel_id, video_path, caption, status, run_id, schedule_time FROM upload_tasks").fetchall()

    def test_done_video_is_queued_once_for_its_account(self):
        self.video("a1", "de", account_id=7, title="Die Nachbarin")
        self.video("a2", "de")  # không chọn tài khoản → không đăng
        self.assertEqual(srr.enqueue_done(), 1)
        self.assertEqual(srr.enqueue_done(), 0)
        [(ch, path, caption, status, run_id, slot)] = self.tasks()
        self.assertEqual((ch, caption, status, run_id, slot), (7, "Die Nachbarin", "QUEUED", "story_remake:a1", 1_900_000_000))
        self.assertTrue(path.startswith(str(self.tmp / "storage")) and Path(path).exists())
        self.assertTrue(self.state("a1")["upload_task_id"])
        self.assertNotIn("upload_task_id", self.state("a2"))

    def test_narration_in_another_language_is_not_posted(self):
        self.video("b1", "de", account_id=8)
        self.assertEqual(srr.enqueue_done(), 0)
        self.assertEqual(self.tasks(), [])
        self.assertIn("không đăng", self.state("b1")["upload_error"])
