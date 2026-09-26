"""Điều kiện xác nhận TikTok đã nhận video; không mở trình duyệt hay đăng bài."""

import unittest

from bkt_web.tiktok_publisher import _post_is_confirmed


class PostConfirmationTests(unittest.TestCase):
    def test_task_68_redirect_is_confirmed(self):
        self.assertTrue(_post_is_confirmed("https://www.tiktok.com/tiktokstudio/content"))

    def test_video_published_toast_is_confirmed(self):
        self.assertTrue(_post_is_confirmed(
            "https://www.tiktok.com/tiktokstudio/upload?from=creator_center",
            "Video published",
        ))

    def test_login_or_home_redirect_is_not_confirmation(self):
        self.assertFalse(_post_is_confirmed("https://www.tiktok.com/login?redirect=studio"))
        self.assertFalse(_post_is_confirmed("https://www.tiktok.com/"))

    def test_untrusted_content_url_is_not_confirmation(self):
        self.assertFalse(_post_is_confirmed("https://example.com/tiktokstudio/content"))
        self.assertFalse(_post_is_confirmed("https://example.com/", "Video published"))


if __name__ == "__main__":
    unittest.main()
