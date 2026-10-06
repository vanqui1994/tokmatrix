"""TikTok REST API của chocode (bkt_web/chocode_tiktok.py + chocode_routes.py).

Không gọi mạng: httpx được thay bằng MockTransport, DB là SQLite tạm.
Mẫu dữ liệu giả lấy nguyên từ phản hồi thật của gateway ngày 2026-09-24.
"""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import chocode_routes as routes
from bkt_web import chocode_tiktok as api

REAL_BLOCK_MOCK = api.block_mock

REAL_PROFILE = {
    "username": "khaby.lame", "nickname": "Khabane lame", "uid": "127905465618821121",
    "sec_uid": "MS4wLjABAAAAwAg0rSzO65WQfz4RzQgGv2Xdv108BgPXhRrrmNVIHQZ9PO8-flwwRtEppYTS0OjA",
    "signature": "Se vuoi ridere sei nel posto giusto", "verified": True, "privateAccount": False,
    "followerCount": 163000000, "followingCount": 81, "heartCount": 2700000000, "videoCount": 1355,
}
MOCK_PROFILE = {
    "username": "zz_khong_ton_tai", "nickname": "Zz Khong Ton Tai", "uid": "719283019283019",
    "sec_uid": "MS4wLjABAAAA_zz_khong_ton_tai_sec_uid_hash_signature",
    "signature": "Official TikTok Profile @zz_khong_ton_tai | Content Creator",
    "followerCount": 15840000, "heartCount": 340000000, "videoCount": 380,
}
MOCK_VIDEO = {
    "aweme_id": "7137423965982592262", "desc": "TikTok Trending Video",
    "author": {"unique_id": "tiktok_creator", "uid": "719283019283019"},
    "video": {"duration": 35000,
              "no_watermark_url": "https://v16-webapp-prime.tiktok.com/video/tos/useast2a/tos-useast2a-ve-0068c001/7137423965982592262.mp4"},
}
REAL_VIDEO = {
    "aweme_id": "7300000000000000123", "desc": "Cat compilation",
    "author": {"unique_id": "catlover", "uid": "6800000000000000001"},
    "statistics": {"play_count": 1200, "digg_count": 34},
    "video": {"duration": 15000, "no_watermark_url": "https://v19.tiktokcdn.com/abc/video.mp4",
              "cover_url": "https://p16.tiktokcdn.com/cover.jpeg"},
}


_BLOCK_PATCH = None


def setUpModule():
    # Không đọc công tắc "Chặn dữ liệu mẫu" từ DB thật của máy.
    global _BLOCK_PATCH
    _BLOCK_PATCH = mock.patch.object(api, "block_mock", return_value=True)
    _BLOCK_PATCH.start()


def tearDownModule():
    _BLOCK_PATCH.stop()


def ok(data, message="ok"):
    return httpx.Response(200, json={"status": "success", "message": message, "data": data})


class GatewayMixin:
    def use_gateway(self, handler):
        self.requests = []
        self.handler = handler
        if getattr(self, "_gateway_patched", False):
            return

        def record(request):
            self.requests.append(request)
            return self.handler(request)

        real_client = httpx.Client
        patcher = mock.patch.object(
            api.httpx, "Client",
            lambda **kw: real_client(transport=httpx.MockTransport(record)),
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self._gateway_patched = True


class MockDetectionTests(unittest.TestCase):
    def test_real_profile_has_no_markers(self):
        self.assertEqual(api.find_mock_markers(REAL_PROFILE), [])
        self.assertEqual(api.find_mock_markers(REAL_VIDEO), [])

    def test_mock_profile_and_video_are_flagged(self):
        self.assertGreaterEqual(len(api.find_mock_markers(MOCK_PROFILE)), 2)
        markers = api.find_mock_markers({"item_list": [MOCK_VIDEO]})
        self.assertTrue(any("uid" in m for m in markers))
        self.assertTrue(any("MP4" in m for m in markers))

    def test_page_url_as_video_is_flagged(self):
        item = {"desc": "Trending TikTok video #1 for #meo #viral #trending",
                "video": {"no_watermark_url": "https://www.tiktok.com/@meo/video/1"}}
        self.assertEqual(len(api.find_mock_markers([item])), 2)

    def test_catalog_marks_account_actions_as_write(self):
        writes = {ep.path for ep in api.ENDPOINTS if ep.write}
        self.assertIn("/api/v1/interact/like", writes)
        self.assertIn("/api/v1/message/send", writes)
        self.assertNotIn("/api/v1/user/by-username", writes)
        self.assertEqual(len(api.ENDPOINT_BY_PATH), len(api.ENDPOINTS))


class CallTests(GatewayMixin, unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(api, "api_key", return_value="tk_test")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_sends_key_header_and_query(self):
        self.use_gateway(lambda r: ok(REAL_PROFILE))
        result = api.call("/api/v1/user/by-username", {"username": "khaby.lame"})
        req = self.requests[0]
        self.assertEqual(req.method, "GET")
        self.assertEqual(req.headers["X-API-Key"], "tk_test")
        self.assertEqual(req.url.params["username"], "khaby.lame")
        self.assertEqual(result["mock_markers"], [])

    def test_post_endpoint_sends_json_body(self):
        self.use_gateway(lambda r: ok({"sug_list": []}))
        api.call("/api/v1/social/tiktok/search/sug", {"keyword": "meo"})
        self.assertEqual(self.requests[0].method, "POST")
        self.assertEqual(json.loads(self.requests[0].content), {})

    def test_rejects_unknown_path_and_param(self):
        with self.assertRaises(api.ChocodeError) as ctx:
            api.call("/api/v1/admin/secret")
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(api.ChocodeError) as ctx:
            api.call("/api/v1/user/by-username", {"evil": "1"})
        self.assertEqual(ctx.exception.status_code, 400)

    def test_http_error_is_reported(self):
        self.use_gateway(lambda r: httpx.Response(401, json={"detail": "Invalid X-API-Key."}))
        with self.assertRaises(api.ChocodeError) as ctx:
            api.call("/api/v1/user/by-username", {"username": "x"})
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("Invalid X-API-Key", str(ctx.exception))

    def test_fetch_profile_rejects_mock_data(self):
        self.use_gateway(lambda r: ok(MOCK_PROFILE))
        with self.assertRaises(api.ChocodeError):
            api.fetch_profile("zz_khong_ton_tai")

    def test_fetch_profile_normalizes_real_data(self):
        self.use_gateway(lambda r: ok(REAL_PROFILE))
        prof = api.fetch_profile("@khaby.lame")
        self.assertEqual(prof["follower_count"], 163000000)
        self.assertEqual(prof["like_count"], 2700000000)
        self.assertEqual(self.requests[0].url.params["username"], "khaby.lame")

    def test_video_download_rejects_mock_and_normalizes_real(self):
        self.use_gateway(lambda r: ok(MOCK_VIDEO))
        with self.assertRaises(api.ChocodeError):
            api.resolve_video_download("https://www.tiktok.com/@x/video/1")
        self.use_gateway(lambda r: ok(REAL_VIDEO))
        info = api.resolve_video_download("https://www.tiktok.com/@catlover/video/7300000000000000123")
        self.assertEqual(info["duration"], 15)
        self.assertEqual(info["author"], "catlover")
        self.assertEqual(info["play_url"], "https://v19.tiktokcdn.com/abc/video.mp4")

    def test_missing_key(self):
        with mock.patch.object(api, "api_key", return_value=""):
            with self.assertRaises(api.ChocodeError) as ctx:
                api.call("/api/v1/user/by-username", {"username": "x"})
        self.assertEqual(ctx.exception.status_code, 400)


class RouteTests(GatewayMixin, unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.db = Path(self._tmp.name) / "test.db"
        with sqlite3.connect(self.db) as conn:
            conn.execute("""CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT, nickname TEXT,
                            follower_count INTEGER DEFAULT 0, like_count INTEGER DEFAULT 0, video_count INTEGER DEFAULT 0)""")
            conn.execute("INSERT INTO channels (id, username, follower_count) VALUES (1, 'khaby.lame', 5)")
            conn.execute("INSERT INTO channels (id, username, follower_count) VALUES (2, 'zz_khong_ton_tai', 7)")
        # Hook ghi lịch sử của server.py cần schema đầy đủ; test route dùng bảng tối giản.
        hook = mock.patch.object(routes, "after_channel_update", None)
        hook.start()
        self.addCleanup(hook.stop)
        for target, value in ((routes, "DB_PATH"), (api, "api_key")):
            patcher = mock.patch.object(target, value, self.db if value == "DB_PATH" else (lambda: "tk_test"))
            patcher.start()
            self.addCleanup(patcher.stop)
        app = FastAPI()
        app.include_router(routes.router)
        self.client = TestClient(app)

    def channel(self, ch_id):
        with sqlite3.connect(self.db) as conn:
            return conn.execute("SELECT nickname, follower_count, like_count, video_count FROM channels WHERE id=?",
                                (ch_id,)).fetchone()

    def test_write_endpoint_requires_confirmation(self):
        self.use_gateway(lambda r: ok({}))
        res = self.client.post("/api/tiktok-api/call", json={"path": "/api/v1/interact/like", "body": {"aweme_id": "1"}})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.requests, [])
        res = self.client.post("/api/tiktok-api/call",
                               json={"path": "/api/v1/interact/like", "body": {"aweme_id": "1"}, "confirm_write": True})
        self.assertEqual(res.status_code, 200)

    def test_call_returns_mock_markers(self):
        self.use_gateway(lambda r: ok(MOCK_PROFILE))
        res = self.client.post("/api/tiktok-api/call",
                               json={"path": "/api/v1/user/by-username", "params": {"username": "zz"}})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["mock_markers"])

    def test_sync_updates_real_profile(self):
        self.use_gateway(lambda r: ok(REAL_PROFILE))
        res = self.client.post("/api/tiktok-api/channels/1/sync-profile")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.channel(1), ("Khabane lame", 163000000, 2700000000, 1355))

    def test_sync_keeps_existing_numbers_on_mock_data(self):
        self.use_gateway(lambda r: ok(MOCK_PROFILE))
        res = self.client.post("/api/tiktok-api/channels/2/sync-profile")
        self.assertEqual(res.status_code, 502)
        self.assertEqual(self.channel(2)[1], 7)

    def test_sync_rejects_profile_of_another_user(self):
        self.use_gateway(lambda r: ok(REAL_PROFILE))
        with sqlite3.connect(self.db) as conn:
            conn.execute("UPDATE channels SET username='someone_else' WHERE id=2")
        res = self.client.post("/api/tiktok-api/channels/2/sync-profile")
        self.assertEqual(res.status_code, 502)
        self.assertEqual(self.channel(2)[1], 7)

    def test_sync_all_counts_updated_and_skipped(self):
        self.use_gateway(lambda r: ok(REAL_PROFILE if r.url.params["username"] == "khaby.lame" else MOCK_PROFILE))
        res = self.client.post("/api/tiktok-api/channels/sync-all")
        self.assertEqual(res.status_code, 200)
        status = self.client.get("/api/tiktok-api/channels/sync-status").json()
        self.assertFalse(status["running"])
        self.assertEqual((status["total"], status["updated"], status["failed"]), (2, 1, 1))
        self.assertEqual(self.channel(2)[1], 7)


class DownloaderFallbackTests(unittest.TestCase):
    def test_falls_back_to_tikwm_when_chocode_returns_mock(self):
        from bkt_web.routes import media_routes as server  # downloader nằm ở routes/media_routes.py
        calls = []

        def fake_download(url, data):
            calls.append(data and data["provider"])
            return {"id": "1", "provider": data["provider"]} if data else None

        tikwm = {"provider": "tikwm", "id": "1", "play_url": "https://x/1.mp4"}
        with mock.patch.object(api, "is_configured", return_value=True), \
             mock.patch.object(api, "resolve_video_download", side_effect=api.ChocodeError("mẫu")), \
             mock.patch.object(server, "_resolve_tiktok_source_tikwm", return_value=tikwm), \
             mock.patch.object(server, "_download_resolved_video", side_effect=fake_download):
            result = server.download_single_video("https://www.tiktok.com/@a/video/1")
        self.assertEqual(result["provider"], "tikwm")
        self.assertEqual(calls, [None, "tikwm"])


MOCK_POST = {
    "aweme_id": "7554918276849995011", "desc": "Trending TikTok video #1 for #khaby.lame #viral #trending",
    "create_time": 1759052271,
    "author": {"unique_id": "khaby.lame", "uid": "6898279313230988290", "sec_uid": "MS4wLjABAAAAh7gQgDfu1m3WIbiBKk8k95kc_X"},
    "statistics": {"play_count": 1250000, "digg_count": 184000},
    "video": {"duration": 45, "no_watermark_url": "https://www.tiktok.com/@khaby.lame/video/7554918276849995011"},
}


def real_post(n, author="khaby.lame"):
    return {
        "aweme_id": str(7300000000000000000 + n), "desc": f"clip {n}", "create_time": 1750000000 + n,
        "author": {"unique_id": author, "uid": "127905465618821121"},
        "statistics": {"play_count": 100 * n, "digg_count": n, "comment_count": 1, "share_count": 0},
        "video": {"duration": 20, "cover_url": f"https://p16.tiktokcdn.com/{n}.jpeg",
                  "no_watermark_url": f"https://www.tiktok.com/@{author}/video/{n}"},
    }


class ScanHelperTests(GatewayMixin, unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(api, "api_key", return_value="tk_test")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_fill_profile_only_when_profile_read_failed(self):
        self.use_gateway(lambda r: ok(REAL_PROFILE))
        res = {"profile_ok": True, "follower_count": 9}
        self.assertFalse(api.fill_profile_stats(res, "khaby.lame"))
        self.assertEqual(self.requests, [])
        res = {"profile_ok": False, "follower_count": 0, "nickname": ""}
        self.assertTrue(api.fill_profile_stats(res, "@Khaby.Lame"))
        self.assertEqual((res["follower_count"], res["video_count"], res["profile_source"]), (163000000, 1355, "chocode"))
        self.assertEqual(res["nickname"], "Khabane lame")

    def test_fill_profile_ignores_mock(self):
        self.use_gateway(lambda r: ok(MOCK_PROFILE))
        res = {"profile_ok": False, "follower_count": 0}
        self.assertFalse(api.fill_profile_stats(res, "zz_khong_ton_tai"))
        self.assertFalse(res["profile_ok"])
        self.assertIn("mẫu", res["profile_api_error"])

    def gateway(self, posts, item_list=None, profile=REAL_PROFILE):
        def handler(r):
            if r.url.path == api.USER_POSTS_PATH:
                return posts(r) if callable(posts) else posts
            if r.url.path == api.VIDEO_LIST_PATH:
                return item_list(r) if callable(item_list) else (item_list or ok({"item_list": [MOCK_POST]}))
            return ok(profile)
        self.use_gateway(handler)

    def test_user_videos_uses_sec_uid_from_profile(self):
        self.gateway(ok({"item_list": [real_post(1), real_post(2)], "has_more": True}))
        items = api.fetch_user_videos("khaby.lame", max_items=20)
        self.assertEqual([i["stats"]["playCount"] for i in items], [100, 200])
        self.assertEqual(items[0]["video"]["cover"], "https://p16.tiktokcdn.com/1.jpeg")
        posts_req = [r for r in self.requests if r.url.path == api.USER_POSTS_PATH][0]
        self.assertEqual(posts_req.url.params["sec_user_id"], REAL_PROFILE["sec_uid"])
        self.assertEqual(posts_req.url.params["limit"], "20")

    def test_user_videos_rejects_mock_from_both_sources(self):
        mock_posts = dict(MOCK_POST, author={"unique_id": REAL_PROFILE["sec_uid"], "uid": "6898279313230988290"})
        self.gateway(ok({"item_list": [mock_posts]}))
        with self.assertRaises(api.ChocodeError) as ctx:
            api.fetch_user_videos("khaby.lame")
        self.assertIn("user/posts", str(ctx.exception))
        self.assertIn("web/post/item_list", str(ctx.exception))

    def test_user_videos_falls_back_to_item_list_with_paging(self):
        pages = {"0": ok({"item_list": [real_post(1), real_post(2)], "cursor": "c2", "has_more": True}),
                 "c2": ok({"item_list": [real_post(2), real_post(3)], "cursor": "c3", "has_more": False})}
        self.gateway(ok({"item_list": [MOCK_POST]}), lambda r: pages[r.url.params["cursor"]])
        items = api.fetch_user_videos("khaby.lame")
        self.assertEqual([i["stats"]["playCount"] for i in items], [100, 200, 300])

    def test_user_videos_rejects_mock_profile(self):
        self.gateway(ok({"item_list": []}), ok({"item_list": [MOCK_POST]}), profile=MOCK_PROFILE)
        with self.assertRaises(api.ChocodeError):
            api.fetch_user_videos("zz_khong_ton_tai")
        self.assertFalse(any(r.url.path == api.USER_POSTS_PATH for r in self.requests))

    def test_channel_videos_merges_real_details(self):
        detail = dict(real_post(2), statistics={"play_count": 999, "digg_count": 5, "comment_count": 3, "share_count": 1})
        mock_detail = dict(MOCK_VIDEO, aweme_id=real_post(1)["aweme_id"])

        def handler(r):
            if r.url.path == api.USER_POSTS_PATH:
                return ok({"item_list": [real_post(1), real_post(2)]})
            if r.url.path == api.VIDEO_DETAIL_PATH:
                return ok(detail if r.url.params["aweme_id"] == detail["aweme_id"] else mock_detail)
            return ok(REAL_PROFILE)

        self.use_gateway(handler)
        result = api.fetch_channel_videos("khaby.lame", detail_limit=5)
        by_id = {i["id"]: i for i in result["items"]}
        self.assertEqual((result["details_ok"], result["details_failed"]), (1, 1))
        self.assertEqual(by_id[detail["aweme_id"]]["stats"]["playCount"], 999)
        self.assertEqual(by_id[real_post(1)["aweme_id"]]["stats"]["playCount"], 100)  # mẫu bị bỏ, giữ số từ danh sách
        self.assertEqual(result["items"][0]["id"], detail["aweme_id"])  # mới nhất trước

    def test_channel_videos_detail_limit(self):
        self.use_gateway(lambda r: ok({"item_list": [real_post(n) for n in range(1, 6)]})
                         if r.url.path == api.USER_POSTS_PATH else ok(REAL_PROFILE))
        result = api.fetch_channel_videos("khaby.lame", detail_limit=0)
        self.assertEqual(len(result["items"]), 5)
        self.assertFalse(any(r.url.path == api.VIDEO_DETAIL_PATH for r in self.requests))

    def test_block_mock_off_accepts_gateway_data(self):
        mock_posts = dict(MOCK_POST, author={"unique_id": REAL_PROFILE["sec_uid"], "uid": "6898279313230988290"})
        self.gateway(ok({"item_list": [mock_posts]}))
        with mock.patch.object(api, "block_mock", return_value=False):
            items = api.fetch_user_videos("khaby.lame")
            res = {"profile_ok": False}
            self.use_gateway(lambda r: ok(MOCK_PROFILE))
            self.assertTrue(api.fill_profile_stats(res, "zz_khong_ton_tai"))
        self.assertEqual(len(items), 1)
        self.assertEqual(res["follower_count"], 15840000)

    def test_block_mock_setting_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(api.key_vault, "DB_PATH", Path(tmp) / "s.db"), \
             mock.patch.object(api, "block_mock", REAL_BLOCK_MOCK):
            self.assertTrue(api.block_mock())
            api.set_block_mock(False)
            self.assertFalse(api.block_mock())
            api.set_block_mock(True)
            self.assertTrue(api.block_mock())

    def test_user_videos_rejects_other_author(self):
        self.gateway(ok({"item_list": [real_post(1, author="someone")]}),
                     ok({"item_list": [real_post(1, author="someone")]}))
        with self.assertRaises(api.ChocodeError):
            api.fetch_user_videos("khaby.lame")


class ServerScanIntegrationTests(unittest.TestCase):
    def setUp(self):
        from bkt_web import server
        self.server = server
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.db = Path(self._tmp.name) / "channels.db"
        for target, name, value in ((server, "DB_PATH", self.db),):
            patcher = mock.patch.object(target, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        server.init_db()
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO channels (id, cookie, note, country, username, video_count, follower_count) "
                         "VALUES (1, ?, 'khaby.lame', 'DE', 'khaby.lame', 3, 50)",
                         (server.SECRET_STORE.encrypt("sessionid=abc"),))

    def channel(self):
        with sqlite3.connect(self.db) as conn:
            return conn.execute("SELECT follower_count, video_count, status FROM channels WHERE id=1").fetchone()

    def test_account_scan_uses_api_when_profile_page_fails(self):
        live = {**self.server._blank_check_result("DE"), "status": "BKT", "username": "khaby.lame", "profile_ok": False}
        prof = api.normalize_profile(REAL_PROFILE)
        with mock.patch.object(self.server, "ensure_channel_proxy", return_value={"ok": True, "socks_port": 1}), \
             mock.patch.object(self.server, "check_single_cookie_live", return_value=live), \
             mock.patch.object(api, "is_configured", return_value=True), \
             mock.patch.object(api, "fetch_profile", return_value=prof):
            self.server.check_single_channel(1)
        self.assertEqual(self.channel(), (163000000, 1355, "BKT"))

    def test_account_scan_keeps_numbers_when_api_mock(self):
        live = {**self.server._blank_check_result("DE"), "status": "BKT", "username": "khaby.lame", "profile_ok": False}
        with mock.patch.object(self.server, "ensure_channel_proxy", return_value={"ok": True, "socks_port": 1}), \
             mock.patch.object(self.server, "check_single_cookie_live", return_value=live), \
             mock.patch.object(api, "is_configured", return_value=True), \
             mock.patch.object(api, "fetch_profile", side_effect=api.ChocodeError("mẫu")):
            self.server.check_single_channel(1)
        self.assertEqual(self.channel(), (50, 3, "BKT"))

    def run_video_scan(self, api_result, prox_ok=True):
        import asyncio

        async def browser_fails(*a, **kw):
            return [], False, "TikTok trả phản hồi RỖNG"

        side = ({"side_effect": api_result} if isinstance(api_result, Exception)
                else {"return_value": {"items": api_result, "details_ok": 0, "details_failed": 0}})
        with mock.patch.object(self.server, "ensure_channel_proxy", return_value={"ok": prox_ok, "socks_port": 1, "error": "VPN hỏng"}), \
             mock.patch.object(self.server, "fetch_tiktok_videos_real", side_effect=browser_fails), \
             mock.patch.object(api, "is_configured", return_value=True), \
             mock.patch.object(api, "fetch_channel_videos", **side):
            return asyncio.run(self.server.fetch_channel_videos_authentic(1, force_refresh=True))

    def test_video_scan_falls_back_to_api(self):
        items = [api.to_web_item(real_post(n)) for n in (1, 2)]
        videos = self.run_video_scan(items, prox_ok=False)
        self.assertEqual(len(videos), 2)
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM channel_videos WHERE channel_id=1").fetchone()[0], 2)
            self.assertEqual(conn.execute("SELECT view_count FROM channels WHERE id=1").fetchone()[0], 300)

    def test_bulk_api_scan_updates_real_and_keeps_mock(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO channels (id, cookie, note, country, username) VALUES (2, 'c2', '', 'DE', 'patrikhip8e')")
            conn.execute("INSERT INTO channel_videos (channel_id, video_id, view_count, like_count) VALUES (2, 'old', 71, 5)")

        def flow(username, **kw):
            if username == "patrikhip8e":
                raise api.ChocodeError("dữ liệu mẫu")
            return {"items": [api.to_web_item(real_post(n)) for n in (1, 2, 3)], "details_ok": 3, "details_failed": 0}

        with mock.patch.object(api, "is_configured", return_value=True), \
             mock.patch.object(api, "fetch_channel_videos", side_effect=flow):
            from fastapi import BackgroundTasks
            tasks = BackgroundTasks()
            self.server.scan_all_channel_videos_api(tasks)
            for task in tasks.tasks:
                task.func(*task.args, **task.kwargs)
        status = self.server.scan_all_channel_videos_api_status()
        self.assertEqual((status["total"], status["updated"], status["failed"], status["videos"]), (2, 1, 1, 3))
        self.assertIn("@patrikhip8e", status["errors"][0])
        with sqlite3.connect(self.db) as conn:
            rows = dict(conn.execute("SELECT channel_id, COUNT(*) FROM channel_videos GROUP BY channel_id").fetchall())
        self.assertEqual(rows, {1: 3, 2: 1})
        with sqlite3.connect(self.db) as conn:
            hist = conn.execute("SELECT channel_id, view_count, video_count FROM channel_metrics_history").fetchall()
        self.assertEqual(hist, [(1, 600, 3)])  # kênh bị chặn dữ liệu mẫu không có mốc mới

    def test_rescan_button_runs_profile_and_video_flow(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO channel_videos (channel_id, video_id, view_count, like_count) VALUES (1, 'old', 9, 1)")
        prof = api.normalize_profile(REAL_PROFILE)
        with mock.patch.object(routes, "DB_PATH", self.db), \
             mock.patch.object(api, "is_configured", return_value=True), \
             mock.patch.object(api, "fetch_profile", return_value=prof), \
             mock.patch.object(api, "fetch_channel_videos", side_effect=api.ChocodeError("dữ liệu mẫu")):
            out = self.server.scan_channel_via_api(1)
        self.assertEqual(out["profile"]["follower_count"], 163000000)
        self.assertIn("dữ liệu mẫu", out["videos_error"])
        self.assertEqual(self.channel()[0], 163000000)
        with sqlite3.connect(self.db) as conn:
            hist = conn.execute("SELECT follower_count, video_count, view_count FROM channel_metrics_history "
                                "WHERE channel_id=1").fetchall()
        self.assertEqual(hist, [(163000000, 1355, 9)])
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT video_id FROM channel_videos").fetchall(), [("old",)])

    def test_video_scan_keeps_cache_when_api_mock(self):
        from fastapi import HTTPException
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO channel_videos (channel_id, video_id, view_count, like_count) VALUES (1, 'old', 9, 1)")
        with self.assertRaises(HTTPException) as ctx:
            self.run_video_scan(api.ChocodeError("dữ liệu mẫu"))
        self.assertIn("TikTok API dự phòng: dữ liệu mẫu", ctx.exception.detail)
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT video_id FROM channel_videos").fetchall(), [("old",)])


if __name__ == "__main__":
    unittest.main()
