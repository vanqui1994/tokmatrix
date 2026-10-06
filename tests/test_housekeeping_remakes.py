import json
import os
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web.autopilot import housekeeping as hk


def _touch(path: Path, size: int = 10, age: float = 0.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)
    t = time.time() - age
    os.utime(path, (t, t))


class StoryRemakeWorkTest(unittest.TestCase):
    def test_keeps_json_audio_and_out_but_drops_intermediates_of_finished_videos(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = 5 * 3600
            for vid, status, age in (("done1", "done", old), ("skip1", "skipped", old), ("run1", "rendering", old),
                                     ("fresh", "done", 60)):
                d = root / vid
                _touch(d / "ffm" / "story.mp4", 1000, age)
                _touch(d / "img" / "sc00.png", 500, age)
                _touch(d / "tts" / "l0.mp3", 50, age)
                _touch(d / "vo.mp3", 40, age)
                _touch(d / "words.json", 5, age)
                (d / "state.json").write_text(json.dumps({"status": status}))
                t = time.time() - age
                os.utime(d / "state.json", (t, t))
            _touch(root / "out" / "done1.mp4", 2000, old)
            res = hk.clean_story_remake_work(2, time.time(), root)
            self.assertEqual(res["dirs"], 2)
            self.assertEqual(res["bytes"], 2 * 1550)
            for vid in ("done1", "skip1"):
                self.assertFalse((root / vid / "ffm").exists())
                self.assertFalse((root / vid / "img").exists())
                self.assertTrue((root / vid / "vo.mp3").exists())
                self.assertTrue((root / vid / "words.json").exists())
            self.assertTrue((root / "run1" / "ffm").exists())   # chưa xong
            self.assertTrue((root / "fresh" / "img").exists())  # vừa xong
            self.assertTrue((root / "out" / "done1.mp4").exists())
            self.assertEqual(hk.clean_story_remake_work(0, time.time(), root)["bytes"], 0)


class MuseRemakeCleanTest(unittest.TestCase):
    def test_only_posted_videos_lose_their_intermediates(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            db, chdb = d / "mr.db", d / "ch.db"
            with sqlite3.connect(db) as c:
                c.execute("CREATE TABLE videos (id INTEGER PRIMARY KEY, film_id TEXT, upload_task_id INTEGER)")
                c.executemany("INSERT INTO videos VALUES (?,?,?)", [(1, "filmaaa1", 10), (2, "filmbbb2", 11)])
            with sqlite3.connect(chdb) as c:
                c.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, status TEXT)")
                c.executemany("INSERT INTO upload_tasks VALUES (?,?)", [(10, "SUCCESS"), (11, "QUEUED")])
            work, films = d / "muse_remake", d / "muse_films"
            for vid, film in ((1, "filmaaa1"), (2, "filmbbb2")):
                for name in ("source.mp4", "seg00.mp4", "ref00.jpg", "final.mp4", "plan.json"):
                    _touch(work / str(vid) / name, 100)
                _touch(films / film / "clips" / "scene00.mp4", 300)
                _touch(films / film / "project.json", 10)
            with mock.patch.object(hk, "MUSE_REMAKE_DIR", work), mock.patch.object(hk, "MUSE_FILMS_DIR", films):
                res = hk.clean_muse_remake(1, db, chdb)
            self.assertEqual(res, {"videos": 1, "bytes": 600})
            self.assertEqual(sorted(p.name for p in (work / "1").iterdir()), ["final.mp4", "plan.json"])
            self.assertFalse((films / "filmaaa1" / "clips").exists())
            self.assertTrue((films / "filmaaa1" / "project.json").exists())
            self.assertEqual(len(list((work / "2").iterdir())), 5)  # chưa đăng: giữ nguyên
            self.assertTrue((films / "filmbbb2" / "clips").exists())


if __name__ == "__main__":
    unittest.main()
