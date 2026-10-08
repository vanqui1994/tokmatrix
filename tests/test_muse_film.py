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

            def fake_clip(prompt, label="clip", ref=None):
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
                 mock.patch.object(muse_film, "BATCH", 1), \
                 mock.patch.object(muse_film, "_wake"):
                p = muse_film.create("first shot\n>\nsecond shot\nthird shot\nfourth shot", 6, "cinematic", "9:16", True)
                muse_film.process(p["id"])
                done = muse_film.load(p["id"])
            self.assertEqual(done["status"], "done")
            self.assertEqual([s["status"] for s in done["scenes"]], ["done"] * 4)
            self.assertEqual(peak[0], 2)


class RefusalRewriteTest(unittest.TestCase):
    def test_retry_after_refusal_rewrites_the_shot_and_drops_the_reference(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []

            def fake_clip(prompt, label="clip", ref=None):
                calls.append((prompt, ref))
                return {"raw": b"mp4", "w": 720, "h": 1280, "d": 5.0, "sec": 1, "account": "x"}

            with mock.patch.object(muse_film, "BASE", Path(tmp)), mock.patch.object(muse_film, "_wake"), \
                 mock.patch.object(muse_film, "make_clip", fake_clip), mock.patch.object(muse_film, "assemble", lambda p: None), \
                 mock.patch.object(muse_film, "BATCH", 1), \
                 mock.patch.object(muse_film, "_gemini", lambda t: {"shot": "A seed mascot naps in a cosy pod."}):
                p = muse_film.create_shots("t", [{"prompt": "Style: x. Shot: A baby wiggles its toes.", "text": "a", "ref": "/r.jpg"},
                                                 {"prompt": "Style: x. Shot: A cat waves.", "text": "b"}])
                p["scenes"][0].update(status="error", tries=2, error="Muse từ chối: I can't make that one.")
                p["scenes"][1].update(status="done")
                p["status"] = "partial"
                muse_film.save(p)
                muse_film.retry_scene(p["id"], 0)
                muse_film.process(p["id"])
                done = muse_film.load(p["id"])
            self.assertEqual(calls, [("Style: x. Shot: A seed mascot naps in a cosy pod.", None)])
            self.assertEqual(done["scenes"][0]["status"], "done")
            self.assertEqual(done["scenes"][0]["softened"], 1)


class BatchShootTest(unittest.TestCase):
    def _run(self, batch_result):
        with tempfile.TemporaryDirectory() as tmp:
            single, batches = [], []

            def fake_batch(prompts, label="batch", refs=None):
                batches.append(list(prompts))
                if isinstance(batch_result, Exception):
                    raise batch_result
                return [{"raw": f"clip{i}".encode(), "w": 720, "h": 1280, "d": 5.0, "sec": 70, "account": "a"} for i in range(len(prompts))]

            def fake_clip(prompt, label="clip", ref=None):
                single.append(prompt)
                return {"raw": b"single", "w": 720, "h": 1280, "d": 5.0, "sec": 60, "account": "b"}

            with mock.patch.object(muse_film, "BASE", Path(tmp)), mock.patch.object(muse_film, "_wake"), \
                 mock.patch.object(muse_film.muse_image, "ACCOUNTS", ["a"]), mock.patch.object(muse_film, "BATCH", 4), \
                 mock.patch.object(muse_film, "make_batch", fake_batch), mock.patch.object(muse_film, "make_clip", fake_clip), \
                 mock.patch.object(muse_film, "assemble", lambda p: None):
                p = muse_film.create_shots("t", [{"prompt": f"Style: x. Shot: s{i}", "text": str(i)} for i in range(5)])
                muse_film.process(p["id"])
                done = muse_film.load(p["id"])
                clips = [(Path(tmp) / p["id"] / "clips" / f"scene{i:02d}.mp4").read_bytes() for i in range(5)]
            return done, batches, single, clips

    def test_scenes_go_in_batches_and_keep_their_order(self):
        done, batches, single, clips = self._run(None)
        self.assertEqual([len(b) for b in batches], [4])          # 4 cảnh một lô; cảnh lẻ cuối không cần lô
        self.assertEqual(single, ["Style: x. Shot: s4"])
        self.assertEqual(clips[:4], [b"clip0", b"clip1", b"clip2", b"clip3"])
        self.assertEqual(done["status"], "done")

    def test_incomplete_batch_falls_back_to_single_shots(self):
        done, batches, single, clips = self._run(muse_film.BatchIncomplete("lô về 3/4 clip"))
        self.assertEqual(len(batches), 1)
        self.assertEqual(len(single), 5)
        self.assertEqual(set(clips), {b"single"})
        self.assertEqual(done["status"], "done")

    def test_batch_prompt_lists_each_shot_once_with_shared_rules(self):
        pr = muse_film.batch_prompt(["Generate one short video clip (about 5 seconds), vertical 9:16. Style: flat. Shot: A cat.",
                                     "Generate one short video clip (about 5 seconds), vertical 9:16. Style: flat. Shot: A dog."], False)
        self.assertIn("Generate these 2 short video clips in parallel", pr)
        self.assertIn("1. A cat.", pr)
        self.assertIn("2. A dog.", pr)
        self.assertEqual(pr.count("Style: flat"), 1)
