"""Các nhánh đường profile của publish_tiktok_video (bkt_web/tiktok_publisher.py).

Playwright, VPN, ffprobe và Chrome profile đều giả. Không mở TikTok, không đăng gì.
"""
import asyncio
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from bkt_web import profile_session as ps
from bkt_web import tiktok_publisher as tp


class FakeStore:
    def __init__(self, *_):
        pass

    def decrypt(self, value):
        return value


class FakePage:
    def __init__(self, url):
        self.url = url

    async def goto(self, *a, **k):
        return None

    async def wait_for_timeout(self, *_):
        return None

    async def query_selector(self, *_):
        return None


class FakeContext:
    def __init__(self, url):
        self.url = url
        self.closed = False

    async def new_page(self):
        return FakePage(self.url)

    async def close(self):
        self.closed = True


class FakePlaywrightCM:
    async def __aenter__(self):
        return SimpleNamespace(chromium=None)

    async def __aexit__(self, *exc):
        return False


class PublisherProfileTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.db = root / "t.db"
        self.video = root / "clip.mp4"
        self.video.write_bytes(b"\0" * 1024)
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.executescript("""
                CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT, cookie TEXT, country TEXT,
                    vpn_config TEXT, vpn_location TEXT, profile_dir TEXT);
                CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, status TEXT, error_message TEXT DEFAULT '',
                    uploaded_at INTEGER DEFAULT 0, result_url TEXT DEFAULT '', publish_mode TEXT DEFAULT '',
                    clicked_post_at INTEGER DEFAULT 0);
            """)
            conn.execute("INSERT INTO channels VALUES (1, 'kenh_a', 'sessionid=abc', 'DE', 'de.conf', 'Berlin', ?)",
                         (str(root / "profile"),))
            conn.execute("INSERT INTO upload_tasks (id, status) VALUES (5, 'UPLOADING')")
        probe = SimpleNamespace(stdout=json.dumps({
            "streams": [{"width": 1080, "height": 1920, "codec_name": "h264"}], "format": {"duration": "12"},
        }))
        self.stop_vpn = mock.Mock()
        patches = [
            mock.patch.object(tp, "SecretStore", FakeStore),
            mock.patch.object(tp.subprocess, "run", return_value=probe),
            mock.patch.object(tp, "async_playwright", return_value=FakePlaywrightCM()),
            mock.patch("bkt_web.vpn_manager.start_verified_wireguard_proxy",
                       return_value={"socks_port": 1080, "location": "DE", "socks5_url": ""}),
            mock.patch("bkt_web.vpn_manager.stop_wireguard_proxy", self.stop_vpn),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self._tmp.cleanup()

    def publish(self, **kwargs):
        return asyncio.run(tp.publish_tiktok_video(
            channel_id=1, video_path=str(self.video), caption="x", hashtags="#a",
            db_path=str(self.db), task_id=5, use_profile=True, headless=True, **kwargs,
        ))

    def task(self):
        with closing(sqlite3.connect(self.db)) as conn:
            return conn.execute("SELECT status, error_message, publish_mode FROM upload_tasks WHERE id=5").fetchone()

    def test_busy_profile_defers_and_stops_tunnel(self):
        with mock.patch.object(ps, "acquire", side_effect=ps.ProfileBusy("external_chrome", 42)):
            res = self.publish()
        self.assertTrue(res["deferred"])
        self.assertEqual(self.task()[0], "UPLOADING")  # scheduler mới là nơi đưa về QUEUED
        self.stop_vpn.assert_called_once_with(1)

    def test_open_failure_marks_error_and_stops_tunnel(self):
        async def boom(*a, **k):
            raise RuntimeError("chrome crashed")
        with mock.patch.object(ps, "open_context", boom):
            res = self.publish()
        self.assertFalse(res["success"])
        self.assertNotIn("no_retry", res)  # lỗi mở profile vẫn được scheduler thử lại theo lượt
        status, error, mode = self.task()
        self.assertEqual((status, mode), ("ERROR", "profile"))
        self.assertIn("chrome crashed", error)
        self.stop_vpn.assert_called_once_with(1)

    def test_logged_out_profile_is_not_retried(self):
        ctx = FakeContext("https://www.tiktok.com/login?redirect=studio")

        async def fake_open(*a, **k):
            return ctx, {"cookie_source": "profile"}
        with mock.patch.object(ps, "open_context", fake_open), \
                mock.patch.object(ps, "mark_session") as mark, \
                mock.patch.object(ps, "write_back") as write_back:
            res = self.publish()
        self.assertTrue(res["no_retry"] and res["logged_out"])
        mark.assert_called_once_with(1, "LOGGED_OUT", "publish")
        write_back.assert_not_called()  # phiên chết thì không ghi ngược cookie
        self.assertEqual(self.task()[0], "ERROR")
        self.assertTrue(ctx.closed)
        self.stop_vpn.assert_called_once_with(1)

    def test_missing_video_does_not_start_tunnel(self):
        self.video.unlink()
        with mock.patch("bkt_web.vpn_manager.start_wireguard_proxy") as start:
            res = self.publish()
        self.assertFalse(res["success"])
        start.assert_not_called()


if __name__ == "__main__":
    unittest.main()
