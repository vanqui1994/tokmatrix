import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("story_remake_tool", REPO / "compare_studio" / "tools" / "story_remake.py")
sr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sr)
sys.path.insert(0, str(REPO))
from bkt_web import story_remake_routes as routes  # noqa: E402


class AssTimeTest(unittest.TestCase):
    def test_rounds_into_next_minute(self):
        self.assertEqual(sr._ass_time(59.999), "0:01:00.00")
        self.assertEqual(sr._ass_time(3599.996), "1:00:00.00")
        self.assertEqual(sr._ass_time(61.5), "0:01:01.50")
        self.assertEqual(sr._ass_time(-1), "0:00:00.00")

    def test_captions_escape_override_chars(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "c.ass"
            sr._captions_ass([[0.0, 0.5, "a{\\b1}b"], [1.0, 1.4, "x\ny"]], 2.0, f)
            events = f.read_text().split("[Events]")[1].split("Text\n", 1)[1]
            self.assertNotIn("{", events)
            self.assertNotIn("\\", events)
            self.assertEqual(len([l for l in events.splitlines() if l.startswith("Dialogue")]), 2)


class FrameCountTest(unittest.TestCase):
    def test_scene_frames_sum_to_audio_length(self):
        starts = [0.0, 1.27, 2.53, 3.79, 5.06, 6.31, 7.58]
        plan = {"scenes": [{"t": t} for t in starts]}
        frames = []

        def fake_filter(i, s, d, last, n=None):
            frames.append(n)
            return "null", n
        with tempfile.TemporaryDirectory() as d, mock.patch.object(sr, "_scene_filter", fake_filter), \
                mock.patch.object(sr.subprocess, "run"), mock.patch.object(sr, "_captions_ass"):
            sr.render_ffmpeg("v", Path(d), [[0.0, 9.97, "x"]], plan, jobs=1)
        self.assertEqual(sum(frames), round(round(9.97 + 0.4, 2) * sr.FPS))


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.patches = [mock.patch.object(routes, "ROOT", root), mock.patch.object(routes, "RUNNER", root / "runner.json"),
                        mock.patch.object(routes, "LOG", root / "runner.log"), mock.patch.object(routes, "EXIT", root / "runner_exit.json")]
        for x in self.patches:
            x.start()

    def tearDown(self):
        for x in self.patches:
            x.stop()
        self.tmp.cleanup()

    def _dead_pid(self):
        pr = subprocess.Popen([sys.executable, "-c", "pass"])
        pr.wait()
        return pr.pid

    def test_crashed_runner_is_not_resumed(self):
        pid = self._dead_pid()
        routes.RUNNER.write_text(json.dumps({"pid": pid, "url": "https://youtu.be/x", "active": True}))
        routes.EXIT.write_text(json.dumps({"pid": pid, "code": 1, "signal": False}))
        with mock.patch.object(routes, "_launch") as launch:
            routes.resume_interrupted()
        launch.assert_not_called()

    def test_killed_runner_resumes_at_most_max_times(self):
        pid = self._dead_pid()
        routes.RUNNER.write_text(json.dumps({"pid": pid, "url": "https://youtu.be/x", "active": True, "resumes": routes.MAX_RESUMES}))
        with mock.patch.object(routes, "_launch") as launch:
            routes.resume_interrupted()
        launch.assert_not_called()
        self.assertFalse(json.loads(routes.RUNNER.read_text())["active"])
        routes.RUNNER.write_text(json.dumps({"pid": pid, "url": "https://youtu.be/x", "active": True, "resumes": 0}))
        routes.EXIT.write_text(json.dumps({"pid": pid, "code": 143, "signal": True}))
        with mock.patch.object(routes, "_launch") as launch:
            routes.resume_interrupted()
        launch.assert_called_once()

    def test_unfinished_video_not_running_when_runner_dead(self):
        w = routes.ROOT / "abc"
        w.mkdir()
        (w / "vo.mp3").write_bytes(b"x")
        self.assertEqual(routes._videos(False)[0]["status"], "stopped")

    def test_url_must_be_http(self):
        for bad in ("--exec=touch /tmp/x", "/etc/passwd/xxxxx"):
            with self.assertRaises(Exception):
                routes.RunRequest(url=bad)
        routes.RunRequest(url="https://www.youtube.com/@x")


class MuseFilmStopTest(unittest.TestCase):
    def test_stop_during_clip_is_not_overwritten(self):
        from bkt_web import muse_film
        with tempfile.TemporaryDirectory() as d, mock.patch.object(muse_film, "BASE", Path(d)):
            p = muse_film.create("a\nb\nc", 3, "cinematic", "9:16", False)
            calls = []

            def clip(prompt):
                calls.append(prompt)
                muse_film.stop(p["id"])  # Dừng trong lúc clip đầu đang chạy
                return {"raw": b"x", "w": 720, "h": 1280, "d": 5.0, "sec": 1}
            with mock.patch.object(muse_film, "make_clip", clip), mock.patch.object(muse_film, "assemble") as asm:
                muse_film.process(p["id"])
            self.assertEqual(muse_film.load(p["id"])["status"], "stopped")
            self.assertEqual(len(calls), 1)
            asm.assert_not_called()


if __name__ == "__main__":
    unittest.main()
