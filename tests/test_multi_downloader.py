import unittest

from bkt_web import multi_downloader as m


class DetectPlatformTest(unittest.TestCase):
    def test_known_links(self):
        cases = {
            "https://www.tiktok.com/@a/video/1": "tiktok", "https://vt.tiktok.com/ZS1/": "tiktok",
            "https://www.youtube.com/shorts/abc": "youtube", "https://youtu.be/abc": "youtube",
            "https://v.douyin.com/abc/": "douyin", "https://www.instagram.com/reel/abc/": "instagram",
            "https://fb.watch/abc/": "facebook", "https://x.com/a/status/1": "x", "https://twitter.com/a/status/1": "x",
            "https://b23.tv/abc": "bilibili", "https://v.kuaishou.com/abc": "kuaishou",
        }
        for url, want in cases.items():
            self.assertEqual(m.detect_platform(url), want, url)

    def test_rejects_unsafe_or_unknown(self):
        for url in ("http://www.tiktok.com/@a/video/1", "https://eviltiktok.com/x", "https://tiktok.com.evil.net/x",
                    "https://127.0.0.1/x", "file:///etc/passwd", "-o /tmp/x", "", "https://example.com/v.mp4"):
            self.assertIsNone(m.detect_platform(url), url)


if __name__ == "__main__":
    unittest.main()
