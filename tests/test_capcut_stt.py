import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "compare_studio" / "tools"))

from capcut_tts_api.client import CapCutClient  # noqa: E402
from capcut_tts_api.exceptions import CapCutTaskError  # noqa: E402


class CapCutSttPollingTest(unittest.TestCase):
    """27/09: API STT trả status "succeed" — client chỉ so "success" nên task xong vẫn chờ tới hết timeout."""

    def client(self, statuses):
        client = CapCutClient.__new__(CapCutClient)
        client.upload_audio = mock.Mock(return_value=SimpleNamespace(vid="v1", md5="m", duration_ms=3000))
        client.create_stt_task = mock.Mock(return_value={"data": {"tasks": [{"id": "t1", "token": "k"}]}})
        replies = [{"data": {"tasks": [{"status": s, "payload": '{"utterances": []}'}]}} for s in statuses]
        client.query_stt_task = mock.Mock(side_effect=replies)
        return client

    def test_succeed_status_returns_immediately(self):
        client = self.client(["processing", "succeed"])
        with mock.patch("capcut_tts_api.client.time.sleep"):
            result = client.transcribe_file("x.mp3", language="de-DE", timeout=5)
        self.assertEqual(result["data"]["tasks"][0]["status"], "succeed")
        self.assertEqual(client.query_stt_task.call_count, 2)

    def test_fail_status_raises(self):
        client = self.client(["fail"])
        with mock.patch("capcut_tts_api.client.time.sleep"), self.assertRaises(CapCutTaskError):
            client.transcribe_file("x.mp3", language="de-DE", timeout=5)


if __name__ == "__main__":
    unittest.main()
