import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import pov_channel as pc


class PovChannelTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.chdb = d / "ch.db"
        with sqlite3.connect(self.chdb) as c:
            c.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT)")
            c.execute("INSERT INTO channels VALUES (259, 'rebeciqnkn2')")
            c.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INT, video_path TEXT, caption TEXT,"
                      " hashtags TEXT, schedule_time INT, status TEXT, created_at INT, ai_generated INT, run_id TEXT)")
        voice = {"language": "en", "voice": "en-US-AndrewNeural", "speed": 1.0, "niche": "philosophy_paradox"}
        self.p = [mock.patch.object(pc, "DB", d / "pov.db"), mock.patch.object(pc, "BASE", d / "files"),
                  mock.patch.object(pc, "CHANNELS_DB", self.chdb),
                  mock.patch.object(pc.muse_remake, "account_voice", lambda cid: voice),
                  mock.patch.object(pc.muse_remake, "_account_names", lambda: {259: "rebeciqnkn2"})]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()
        self.tmp.cleanup()

    def _fake_pipeline(self, seen):
        def plan(topic, lang, n, character=""):
            seen["character"] = character
            return {"title": "The Quiet Exit", "caption": "Calm is a choice.", "character": character,
                    "scenes": [{"line": "You stop.", "shot": "x"}] * 3}

        def assemble(work, story, images, ratio, lang, voice):
            out = Path(work) / "pov_9x16.mp4"
            out.write_bytes(b"mp4")
            seen["ratio"] = ratio
            return out
        return [mock.patch.object(pc.pov_story, "plan", plan), mock.patch.object(pc.pov_story, "draw", lambda w, s, r: []),
                mock.patch.object(pc.pov_story, "assemble", assemble),
                mock.patch.object(pc.gemini, "generate_json", lambda *a, **k: {"topic": "POV: You stopped upgrading"}),
                mock.patch("bkt_web.autopilot.scheduler.next_slot", lambda cid: int(time.time()) + 3600),
                mock.patch("bkt_web.autopilot.captions.hashtags_for", lambda n, l: "#pov")]

    def test_one_video_a_day_with_the_fixed_character_goes_to_the_upload_queue(self):
        pc.add_source(259, character="Leo, sandy hair, green linen shirt")
        with self.assertRaises(ValueError):
            pc.add_source(259, character="x")  # một tài khoản một nguồn
        seen = {}
        ps = self._fake_pipeline(seen)
        for x in ps:
            x.start()
        try:
            self.assertTrue(pc.run_once())
            self.assertFalse(pc.run_once())  # đủ 1 video trong 24 giờ
        finally:
            for x in ps:
                x.stop()
        v = pc.videos()[0]
        self.assertEqual(v["status"], "queued_upload")
        self.assertEqual(v["topic"], "POV: You stopped upgrading")
        self.assertEqual(seen, {"character": "Leo, sandy hair, green linen shirt", "ratio": "9:16"})
        with sqlite3.connect(self.chdb) as c:
            task = c.execute("SELECT channel_id, caption, run_id, status FROM upload_tasks").fetchall()
        self.assertEqual(task, [(259, "Calm is a choice.", f"pov:{v['id']}", "QUEUED")])
        self.assertEqual(pc.delete_video(v["id"])["note"], "")
        with sqlite3.connect(self.chdb) as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM upload_tasks").fetchone()[0], 0)


    def test_stock_cap_stops_production_while_videos_wait_to_be_posted(self):
        src = pc.add_source(259, character="Leo")
        now = int(time.time())
        with sqlite3.connect(self.chdb) as c:
            for tid in (1, 2, 3):
                c.execute("INSERT INTO upload_tasks(id, channel_id, status) VALUES (?, 259, 'QUEUED')", (tid,))
        with pc._conn() as c:
            for tid in (1, 2, 3):  # 3 video cũ (quá 24 giờ) vẫn chờ đăng
                c.execute("INSERT INTO videos(source_id, status, upload_task_id, created, updated) VALUES (?,?,?,?,?)",
                          (src["id"], "queued_upload", tid, now - 3 * 86400, now))
        pc._due()
        self.assertEqual(sum(v["status"] == "queued" for v in pc.videos()), 0)
        with sqlite3.connect(self.chdb) as c:
            c.execute("UPDATE upload_tasks SET status='SUCCESS' WHERE id=1")
        pc._due()
        self.assertEqual(sum(v["status"] == "queued" for v in pc.videos()), 1)


if __name__ == "__main__":
    unittest.main()
