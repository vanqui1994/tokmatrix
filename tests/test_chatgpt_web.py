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
                  mock.patch.object(cg, "_reachable", lambda: True)):
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


if __name__ == "__main__":
    unittest.main()
