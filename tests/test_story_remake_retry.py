"""Nút "Làm lại" của Story Remake: chỉ video lỗi, xoá lỗi + số lần thử, chạy lại đúng thư mục video."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import HTTPException

from bkt_web import story_remake_routes as srr


class RetryTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        for p in (mock.patch.object(srr, "ROOT", self.root), mock.patch.object(srr, "_runner", lambda: {})):
            p.start()
        self.addCleanup(mock.patch.stopall)

    def state(self, vid, **kw):
        (self.root / vid).mkdir()
        (self.root / vid / "state.json").write_text(json.dumps({"id": vid, **kw}))

    def test_error_video_is_reset_and_relaunched_in_its_own_folder(self):
        self.state("abc123", url="https://youtube.com/shorts/abc123", status="error", error="Gemini 429", attempts=3,
                   account_id=168, translate_to="ja")
        with mock.patch.object(srr, "_launch", return_value=42) as launch:
            self.assertEqual(srr.retry("abc123")["pid"], 42)
        saved = json.loads((self.root / "abc123" / "state.json").read_text())
        self.assertNotIn("error", saved); self.assertNotIn("attempts", saved); self.assertNotIn("status", saved)
        self.assertEqual(launch.call_args.kwargs, {"account_id": 168, "translate_to": "ja", "vid": "abc123"})

    def test_only_error_videos_and_safe_ids(self):
        self.state("done1", url="u", status="done")
        with mock.patch.object(srr, "_launch") as launch:
            for vid, code in (("done1", 400), ("../x", 400), ("missing", 404)):
                with self.assertRaises(HTTPException) as cm:
                    srr.retry(vid)
                self.assertEqual(cm.exception.status_code, code)
        launch.assert_not_called()

    def test_busy_runner_is_refused(self):
        self.state("e1", url="u", status="error")
        with mock.patch.object(srr, "_runner", lambda: {"running": True}), self.assertRaises(HTTPException) as cm:
            srr.retry("e1")
        self.assertEqual(cm.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
