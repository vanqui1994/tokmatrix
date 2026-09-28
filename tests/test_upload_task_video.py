"""Xem video của tác vụ đăng: chỉ phát MP4 nằm trong thư mục video/storage."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import upload_routes


class UploadTaskVideoFileTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        self.videos = root / "videos"
        (self.videos / "slug" / "renders").mkdir(parents=True)
        self.mp4 = self.videos / "slug" / "renders" / "slug.mp4"
        self.mp4.write_bytes(b"mp4")
        self.outside = root / "secret.mp4"
        self.outside.write_bytes(b"x")
        patch = mock.patch.object(upload_routes, "UPLOAD_VIDEO_ROOTS", (self.videos,))
        patch.start()
        self.addCleanup(patch.stop)

    def test_serves_mp4_inside_allowed_roots(self):
        self.assertEqual(upload_routes.upload_task_video_file(str(self.mp4)), self.mp4.resolve())

    def test_rejects_paths_outside_roots_traversal_and_non_mp4(self):
        self.assertIsNone(upload_routes.upload_task_video_file(str(self.outside)))
        self.assertIsNone(upload_routes.upload_task_video_file(str(self.videos / "slug" / ".." / ".." / "secret.mp4")))
        (self.videos / "slug" / "notes.txt").write_text("x")
        self.assertIsNone(upload_routes.upload_task_video_file(str(self.videos / "slug" / "notes.txt")))
        self.assertIsNone(upload_routes.upload_task_video_file(str(self.videos / "missing.mp4")))
        self.assertIsNone(upload_routes.upload_task_video_file(""))


if __name__ == "__main__":
    unittest.main()
