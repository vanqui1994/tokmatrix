"""ChatGPT web + Gemini web viết kịch bản: lấy JSON, chuyển nguồn khi một nguồn lỗi, nhường Antigravity khi hết nguồn."""
import unittest
from unittest import mock

from bkt_web import chatgpt_web as cg


class ExtractTest(unittest.TestCase):
    def test_code_block_wins_then_text(self):
        self.assertEqual(cg.extract_json({"code": ['{"a": 1}'], "text": "x"}), {"a": 1})
        self.assertEqual(cg.extract_json({"code": [], "text": 'Here:\n```json\n{"b": [1,2]}\n```'}), {"b": [1, 2]})
        self.assertEqual(cg.extract_json({"code": [], "text": 'sure {"c": "ok"} thanks'}), {"c": "ok"})
        with self.assertRaises(ValueError):
            cg.extract_json({"code": [], "text": "I cannot help with that."})


class WorkerTest(unittest.TestCase):
    def setUp(self):
        for name in cg.PROVIDERS:
            cg._states[name] = cg._new_state()
        for p in (mock.patch.dict("os.environ", {"TOKMATRIX_CHATGPT_WEB": "1", "TOKMATRIX_WEB_LLMS": "chatgpt,gemini"}),
                  mock.patch.object(cg, "_reachable", lambda *_a: True)):
            p.start(); self.addCleanup(p.stop)
        self.routes = mock.MagicMock()
        self.claimed = []
        p = mock.patch.object(cg, "_routes", lambda: self.routes); p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(cg, "_claim_next", lambda w: self.claimed.append(w) or {"id": "t1", "prompt": "write"}); p.start(); self.addCleanup(p.stop)

    def test_success_completes_with_chatgpt_first(self):
        with mock.patch.object(cg, "ask_json", return_value={"scenes": []}) as ask:
            self.assertTrue(cg.run_once())
        self.assertEqual(ask.call_args.args[1], "chatgpt")
        self.assertEqual(self.claimed, ["chatgpt-web"])
        self.routes.complete_script_task.assert_called_once()

    def test_chatgpt_failures_switch_to_gemini_then_antigravity(self):
        with mock.patch.object(cg, "ask_json", side_effect=RuntimeError("logged out")), mock.patch("bkt_web.notify.emit"):
            for _ in range(3):
                cg.run_once()
            self.assertEqual(cg.next_provider(), "gemini")
            for _ in range(3):
                cg.run_once()
        self.assertEqual(self.claimed, ["chatgpt-web"] * 3 + ["gemini-web"] * 3)
        self.assertFalse(cg.accepting())

    def test_daily_cap_or_off_means_no_provider(self):
        for name in cg.PROVIDERS:
            cg._states[name].update(day=cg._today(), count=cg.PROVIDERS[name]["daily"])
        self.assertFalse(cg.accepting())
        for name in cg.PROVIDERS:
            cg._states[name].update(count=0)
        with mock.patch.dict("os.environ", {"TOKMATRIX_CHATGPT_WEB": "0"}):
            self.assertFalse(cg.accepting())



class GeminiImageFallbackTest(unittest.TestCase):
    def test_gemini_web_draws_before_imagerouter_and_is_marked_as_its_own_source(self):
        import io
        from PIL import Image
        from bkt_web import cf_image_fallback as cf, compare_native
        buf = io.BytesIO(); Image.new("RGB", (576, 1024), "navy").save(buf, "PNG")
        delivered = {}
        task = {"id": "img_1", "prompt": "a lighthouse", "negative_prompt": "", "aspect_ratio": "9:16"}
        with mock.patch.object(cg, "image_ready", lambda: True), \
             mock.patch.object(cg, "generate_image", return_value={"raw": buf.getvalue(), "size": (576, 1024), "prompt": "p"}), \
             mock.patch.object(cf, "_deliver", lambda tid, res: delivered.update(tid=tid, **res)), \
             mock.patch.object(cf.imagerouter_image, "available", side_effect=AssertionError("ImageRouter must not be called")):
            self.assertTrue(cf.process_task(dict(task), token=""))
        self.assertEqual((delivered["tid"], delivered["engine"], delivered["model"]), ("img_1", "gemini_web", "gemini-web"))
        self.assertEqual(Image.open(io.BytesIO(delivered["png"])).size, (1080, 1920))
        self.assertEqual(compare_native.task_image_source("gemini-web"), "gemini_web")
        self.assertIn("gemini_web", cf.MARKER_ENGINES)


if __name__ == "__main__":
    unittest.main()

class AskWaitsForJsonTest(unittest.TestCase):
    """13/10: Gemini giữ nguyên chữ "đang nghĩ" vài giây rồi mới viết JSON; chốt sớm → "không có JSON object hợp lệ"."""

    def _run(self, answers, need_json):
        import asyncio

        class Box:
            first = None

            async def wait_for(self, **_):
                return None

            async def evaluate(self, *_):
                return None

        class Loc(Box):
            def __init__(self):
                self.first = Box()

        class Page:
            url = "https://gemini.google.com/app"

            def __init__(self):
                self.calls = 0
                self.keyboard = mock.Mock(press=mock.AsyncMock(), insert_text=mock.AsyncMock())

            async def goto(self, *_, **__):
                return None

            def locator(self, *_):
                return Loc()

            async def evaluate(self, *_):
                i = min(self.calls, len(answers) - 1)
                self.calls += 1
                return answers[i]

        page = Page()
        ctx = mock.Mock(pages=[page])
        browser = mock.Mock(contexts=[ctx])

        class PW:
            chromium = mock.Mock(connect_over_cdp=mock.AsyncMock(return_value=browser))

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return False

        fake_muse = mock.Mock(keep_awake=mock.AsyncMock())
        with mock.patch("playwright.async_api.async_playwright", lambda: PW()), \
                mock.patch.dict("sys.modules", {"bkt_web.muse_image": fake_muse}), \
                mock.patch.object(cg.asyncio, "sleep", mock.AsyncMock()):
            return asyncio.run(cg._ask("gemini", "p", need_json=need_json))

    def test_thinking_placeholder_is_not_accepted_when_json_is_required(self):
        thinking = {"text": "Gemini said Thinking", "code": [], "done": True, "busy": False}
        final = {"text": '{"angles":[1]}', "code": ['{"angles": [1]}'], "done": True, "busy": False}
        got = self._run([thinking] * 6 + [final] * 4, need_json=True)
        self.assertEqual(cg.extract_json(got), {"angles": [1]})

    def test_without_need_json_the_first_stable_answer_is_returned(self):
        thinking = {"text": "Gemini said Thinking", "code": [], "done": True, "busy": False}
        final = {"text": '{"a":1}', "code": ['{"a": 1}'], "done": True, "busy": False}
        got = self._run([thinking] * 6 + [final] * 4, need_json=False)
        self.assertEqual(got["text"], "Gemini said Thinking")


class SecondGeminiAccountTest(unittest.TestCase):
    def setUp(self):
        import importlib, os
        self.importlib, self.os = importlib, os
        self.env = mock.patch.dict(os.environ, {"TOKMATRIX_GEMINI2_CDP": "http://127.0.0.1:9344", "TOKMATRIX_CHATGPT_WEB": "1",
                                                "TOKMATRIX_WEB_LLMS": "gemini,gemini2"})
        self.env.start()
        self.cg = importlib.reload(cg)

    def tearDown(self):
        self.env.stop()
        self.importlib.reload(cg)

    def test_second_account_has_its_own_chrome_lock_and_counters(self):
        cg2 = self.cg
        self.assertEqual(cg2.PROVIDERS["gemini2"]["cdp"], "http://127.0.0.1:9344")
        self.assertNotEqual(cg2.PROVIDERS["gemini"]["cdp"], cg2.PROVIDERS["gemini2"]["cdp"])
        self.assertIsNot(cg2._locks["gemini"], cg2._locks["gemini2"])
        self.assertIs(cg2._locks["gemini"], cg2._lock)  # ảnh dùng chung Chrome chính
        self.assertIsNot(cg2._states["gemini"], cg2._states["gemini2"])
        self.assertEqual(cg2.GEMINI_ANSWER, cg2.PROVIDERS["gemini2"]["answer"])

    def test_each_provider_is_checked_against_its_own_chrome(self):
        cg2 = self.cg
        seen = []
        with mock.patch.object(cg2, "_reachable", side_effect=lambda cdp=None: (seen.append(cdp), cdp == "http://127.0.0.1:9344")[1]):
            self.assertEqual(cg2.next_provider(), "gemini2")  # Chrome chính chết → chuyển sang tài khoản 2
        self.assertEqual(seen, [cg2.CDP, "http://127.0.0.1:9344"])

    def test_run_once_only_serves_the_requested_account(self):
        cg2 = self.cg
        task = {"id": "t1", "prompt": "p"}
        routes = mock.Mock()
        with mock.patch.object(cg2, "_reachable", return_value=True), mock.patch.object(cg2, "_claim_next", return_value=task) as claim, \
                mock.patch.object(cg2, "_routes", return_value=routes), mock.patch.object(cg2, "ask_json", return_value={"ok": 1}) as ask:
            self.assertTrue(cg2.run_once("gemini2"))
        claim.assert_called_once_with("gemini2-web")
        ask.assert_called_once_with("p", "gemini2")
        self.assertEqual(cg2._states["gemini2"]["count"], 1)
        self.assertEqual(cg2._states["gemini"]["count"], 0)

    def test_start_runs_one_worker_per_provider_with_registered_names(self):
        cg2 = self.cg
        started = []
        real = cg2.threading.Thread
        with mock.patch.object(cg2.threading, "Thread", side_effect=lambda **kw: (started.append(kw["name"]), mock.Mock(is_alive=lambda: False, start=lambda: None))[1]):
            cg2.start()
        self.assertEqual(started, ["chatgpt-scripts", "chatgpt-scripts-gemini2"])
