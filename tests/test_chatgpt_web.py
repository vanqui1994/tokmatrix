"""ChatGPT web viết kịch bản: lấy JSON từ câu trả lời, nhường Antigravity khi tắt/lỗi, đóng/báo lỗi task đúng."""
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
        cg._state.update(day="", count=0, fails=0, paused_until=0.0)
        for p in (mock.patch.dict("os.environ", {"TOKMATRIX_CHATGPT_WEB": "1"}), mock.patch.object(cg, "_reachable", lambda: True)):
            p.start(); self.addCleanup(p.stop)
        self.routes = mock.MagicMock()
        p = mock.patch.object(cg, "_routes", lambda: self.routes); p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(cg, "_claim_next", lambda: {"id": "t1", "prompt": "write"}); p.start(); self.addCleanup(p.stop)

    def test_success_completes_the_task(self):
        with mock.patch.object(cg, "ask_json", return_value={"scenes": []}):
            self.assertTrue(cg.run_once())
        self.routes.complete_script_task.assert_called_once()
        self.assertEqual(cg._state["count"], 1)

    def test_three_failures_pause_and_hand_back_to_antigravity(self):
        with mock.patch.object(cg, "ask_json", side_effect=RuntimeError("logged out")), mock.patch("bkt_web.notify.emit"):
            for _ in range(3):
                cg.run_once()
        self.assertEqual(self.routes.fail_script_task.call_count, 3)
        self.assertFalse(cg.accepting())

    def test_off_or_daily_cap_means_not_accepting(self):
        cg._state.update(day=cg._today(), count=cg.DAILY)
        self.assertFalse(cg.accepting())
        with mock.patch.dict("os.environ", {"TOKMATRIX_CHATGPT_WEB": "0"}):
            cg._state.update(count=0)
            self.assertFalse(cg.accepting())


if __name__ == "__main__":
    unittest.main()
