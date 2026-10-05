import unittest

from bkt_web import muse_film


class ShotTextTest(unittest.TestCase):
    def test_quote_markers_and_bold_are_removed(self):
        self.assertEqual(muse_film.shot_text("> **[0-1s]** Hard cut: the window frosts over."),
                         "[0-1s] Hard cut: the window frosts over.")

    def test_lines_without_words_are_empty(self):
        for line in (">", "> ", ">>", "  ", "**", "- ", "> -"):
            self.assertEqual(muse_film.shot_text(line), "", line)

    def test_list_markers_are_removed(self):
        self.assertEqual(muse_film.shot_text("2) A wolf crosses the lake"), "A wolf crosses the lake")
        self.assertEqual(muse_film.shot_text("• Dawn over the hills"), "Dawn over the hills")


if __name__ == "__main__":
    unittest.main()


import tempfile
import threading
import time
from pathlib import Path
from unittest import mock

from bkt_web import muse_image


class AccountPoolTest(unittest.TestCase):
    def setUp(self):
        self.accounts = [muse_image._Account("http://a:1"), muse_image._Account("http://b:2")]
        self.patches = [mock.patch.object(muse_image, "_ACCOUNTS", self.accounts),
                        mock.patch.object(muse_image, "_reachable", lambda cdp: True)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def test_two_jobs_get_two_different_accounts(self):
        with muse_image.account("x") as one, muse_image.account("y") as two:
            self.assertNotEqual(one, two)

    def test_failing_account_rests_and_work_moves_on(self):
        with self.assertRaises(RuntimeError):
            with muse_image.account("x") as cdp:
                bad = cdp
                raise RuntimeError("đăng xuất")
        with muse_image.account("y") as cdp:
            self.assertNotEqual(cdp, bad)
        rest = [a for a in self.accounts if a.cdp == bad][0]
        self.assertGreater(rest.rest_until, time.time())
        self.assertIn("đăng xuất", rest.last_error)

    def test_unreachable_chrome_is_skipped(self):
        with mock.patch.object(muse_image, "_reachable", lambda cdp: cdp == "http://b:2"):
            with muse_image.account("x") as cdp:
                self.assertEqual(cdp, "http://b:2")


class ParallelFilmTest(unittest.TestCase):
    def test_scenes_are_shot_on_both_accounts_at_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            live, peak, lock = [0], [0], threading.Lock()

            def fake_clip(prompt, label="clip"):
                with lock:
                    live[0] += 1
                    peak[0] = max(peak[0], live[0])
                time.sleep(0.2)
                with lock:
                    live[0] -= 1
                return {"raw": b"mp4", "w": 720, "h": 1280, "d": 5.0, "sec": 1, "account": "x"}

            with mock.patch.object(muse_film, "BASE", Path(tmp)), \
                 mock.patch.object(muse_film.muse_image, "ACCOUNTS", ["a", "b"]), \
                 mock.patch.object(muse_film, "make_clip", fake_clip), \
                 mock.patch.object(muse_film, "assemble", lambda p: None), \
                 mock.patch.object(muse_film, "_wake"):
                p = muse_film.create("first shot\n>\nsecond shot\nthird shot\nfourth shot", 6, "cinematic", "9:16", True)
                muse_film.process(p["id"])
                done = muse_film.load(p["id"])
            self.assertEqual(done["status"], "done")
            self.assertEqual([s["status"] for s in done["scenes"]], ["done"] * 4)
            self.assertEqual(peak[0], 2)
