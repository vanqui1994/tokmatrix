"""Verified TikTok read-only endpoints; all HTTP and VPN calls are mocked."""

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import paths, tiktok_verified, tiktok_video_checks, tiktok_video_ops, vpn_manager
from bkt_web.security import SecretStore
from bkt_web.routes import stats_routes


class Response:
    status_code = 200
    headers = {"content-type": "application/json"}

    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.proxies = {}
        self.headers = {}
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response

    def close(self):
        pass


class FetchTests(unittest.TestCase):
    def test_analytics_uses_channel_proxy_and_verified_contract(self):
        session = FakeSession(Response({"status_code": 0, "data": {"analytics_overview_views": {"total": 5}}}))
        with mock.patch.object(tiktok_verified.requests, "Session", return_value=session):
            result = tiktok_verified.fetch("sessionid=example", 9999, "analytics", date_range=3)
        self.assertTrue(result["ok"])
        self.assertEqual(session.proxies["https"], "socks5h://127.0.0.1:9999")
        url, options = session.calls[0]
        self.assertTrue(url.endswith("/tiktok/v1/analytics/insights/"))
        self.assertIn({"insight_type": 121, "data_date_range": 3}, json.loads(options["params"]["type_requests"]))
        self.assertEqual(session.headers["Cookie"], "sessionid=example")

    def test_video_uses_observed_insigh_type_spelling(self):
        session = FakeSession(Response({"status_code": 0, "data": {"video_info": {"views": 0}}}))
        with mock.patch.object(tiktok_verified.requests, "Session", return_value=session):
            result = tiktok_verified.fetch("cookie", 9999, "video", "12345")
        self.assertTrue(result["ok"])
        requests = json.loads(session.calls[0][1]["params"]["type_requests"])
        self.assertEqual(requests[0], {"insigh_type": "video_info", "aweme_id": "12345"})

    def test_rejects_unverified_or_empty_responses(self):
        for payload in ({"status_code": 20003, "data": {}}, {"status_code": 0}, {"data": {}}):
            session = FakeSession(Response(payload))
            with mock.patch.object(tiktok_verified.requests, "Session", return_value=session):
                self.assertFalse(tiktok_verified.fetch("cookie", 9999, "rewards")["ok"])

    def test_wallet_does_not_expose_payment_identity(self):
        session = FakeSession(Response({"status_code": 0, "data": {
            "balance": {"amount": "0", "code": "GBP", "symbol": "£"},
            "masked_instrument_identity": "sensitive", "kyc_status": 2,
        }}))
        with mock.patch.object(tiktok_verified.requests, "Session", return_value=session):
            result = tiktok_verified.fetch("cookie", 9999, "wallet")
        self.assertTrue(result["ok"])
        self.assertNotIn("sensitive", json.dumps(result))
        self.assertTrue(any("webcast.tiktok.com" in call[0] for call in session.calls))

    def test_missing_vpn_never_opens_session(self):
        with mock.patch.object(tiktok_verified.requests, "Session") as session:
            result = tiktok_verified.fetch("cookie", 0, "analytics")
        self.assertFalse(result["ok"])
        session.assert_not_called()


class VideoCheckTests(unittest.TestCase):
    def test_public_page_only_verifies_explicit_index_flag(self):
        def page(item):
            data = {"__DEFAULT_SCOPE__": {"webapp.reflow.video.detail": {
                "statusCode": 0, "itemInfo": {"itemStruct": item},
            }}}
            return '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">' + json.dumps(data) + '</script>'

        self.assertEqual(tiktok_video_checks.public_verdict(page({"indexEnabled": False}))["verdict"], "deindexed")
        self.assertEqual(tiktok_video_checks.public_verdict(page({"indexEnabled": True}))["verdict"], "indexed")
        self.assertEqual(tiktok_video_checks.public_verdict(page({"id": "123"}))["verdict"], "unknown")
        self.assertEqual(tiktok_video_checks.public_verdict("not a page")["verdict"], "unknown")

    def test_no_penalty_only_when_explicit_studio_status(self):
        self.assertEqual(tiktok_video_checks.official_penalty({"status_code": 0, "appeal_status": 2})["status"], "eligible")
        self.assertEqual(tiktok_video_checks.official_penalty({"status_code": 0})["status"], "unknown")
        self.assertEqual(tiktok_video_checks.official_penalty({"status_code": 10008})["status"], "unknown")
        penalty = {"status_code": 0, "appeal_status": 0, "penalties": [{"reason_codes": [10]}],
                   "top_penalty_details": {"penalty_type": 1}}
        self.assertEqual(tiktok_video_checks.official_penalty(penalty)["status"], "ineligible")

    def test_video_check_combines_public_index_and_official_nff(self):
        html = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">' + json.dumps({
            "__DEFAULT_SCOPE__": {"webapp.reflow.video.detail": {
                "statusCode": 0, "itemInfo": {"itemStruct": {"indexEnabled": False}},
            }}
        }) + '</script>'
        page = Response({})
        page.text = html
        official = Response({"status_code": 0, "appeal_status": 2, "penalties": []})
        session = FakeSession(page)
        cookies_at_request = []
        def respond(url, **kwargs):
            cookies_at_request.append(session.headers.get("Cookie"))
            session.calls.append((url, kwargs))
            return official if "getPenaltyDetails" in url else page
        session.get = respond
        with mock.patch.object(tiktok_video_checks.requests, "Session", return_value=session):
            result = tiktok_video_checks.check_video("sessionid=test", 9876, "1234567890123456789")
        self.assertTrue(result["ok"])
        self.assertEqual(result["public"]["verdict"], "deindexed")
        self.assertEqual(result["official"]["status"], "eligible")
        self.assertEqual(cookies_at_request, [None, "sessionid=test"])
        self.assertEqual(session.proxies["https"], "socks5h://127.0.0.1:9876")

    def test_cover_hash_matches_same_frame(self):
        import io
        from PIL import Image
        image = Image.new("L", (9, 8))
        image.putdata([255 if x < 4 else 0 for y in range(8) for x in range(9)])
        out = io.BytesIO()
        image.save(out, format="PNG")
        self.assertEqual(tiktok_video_checks.cover_hash(out.getvalue()),
                         tiktok_video_checks.cover_hash(out.getvalue()))
        class CoverResponse:
            status_code = 200
            content = out.getvalue()
        session = FakeSession(CoverResponse())
        rows = [(7, "111", "https://p16.tiktokcdn.com/first", 100),
                (7, "222", "https://p16.tiktokcdn.com/second", 200),
                (7, "333", "http://localhost/internal", 300)]
        with mock.patch.object(tiktok_video_checks.requests, "Session", return_value=session):
            result = tiktok_video_checks.compare_covers(rows, 9876)
        self.assertEqual(result["checked"], 2)
        self.assertEqual(result["pairs"][0]["original_video_id"], "111")
        self.assertEqual(result["pairs"][0]["duplicate_video_id"], "222")
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(len(session.calls), 2)


class VideoOpsTests(unittest.TestCase):
    def test_delete_uses_channel_profile_and_tiktok_confirmation(self):
        import asyncio
        from contextlib import asynccontextmanager
        from bkt_web import profile_session
        from unittest.mock import AsyncMock
        page = mock.Mock()
        page.goto = AsyncMock()
        page.evaluate = AsyncMock(return_value={"http_status": 200, "body": '{"status_code":0}'})
        context = mock.Mock()
        context.new_page = AsyncMock(return_value=page)
        captured = []
        @asynccontextmanager
        async def scan(playwright, channel_id, port, cookie_list, owner):
            captured.extend([channel_id, port, owner])
            yield context, "profile"
        with mock.patch.object(profile_session, "scan_context", scan), \
             mock.patch.object(tiktok_video_ops, "async_playwright"), \
             mock.patch.object(tiktok_video_ops.vpn_manager, "build_persistent_cookie_list", return_value=[]):
            result = asyncio.run(tiktok_video_ops.delete_video(7, "1234567890123456789", "cookie", 9876))
        self.assertTrue(result["ok"])
        self.assertEqual(captured, [7, 9876, "video-delete"])
        self.assertEqual(page.evaluate.call_args.args[1], "1234567890123456789")

    def test_delete_only_after_explicit_success(self):
        self.assertTrue(tiktok_video_ops.parse_delete_response({"http_status": 200, "body": '{"status_code":0}'})["ok"])
        for response in ({"http_status": 200, "body": ""},
                         {"http_status": 200, "body": '<html>blocked</html>'},
                         {"http_status": 200, "body": '{"status_code":5}'},
                         {"http_status": 403, "body": '{"status_code":0}'}):
            self.assertFalse(tiktok_video_ops.parse_delete_response(response)["ok"])


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / "channels.db"
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, cookie TEXT, vpn_config TEXT, country TEXT)")
        conn.execute("CREATE TABLE channel_videos (channel_id INTEGER, video_id TEXT, cover_url TEXT, create_time INTEGER)")
        conn.execute("INSERT INTO channels VALUES (7, 'encrypted-cookie', 'de1.conf', 'DE')")
        conn.execute("INSERT INTO channel_videos VALUES (7, '1234567890123456789', 'https://p16.tiktokcdn.com/cover.jpg', 100)")
        conn.commit()
        conn.close()
        for name, value in (("DB_PATH", self.db), ("SECRET_KEY_PATH", Path(self.temp.name) / "key")):
            patcher = mock.patch.object(paths, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        app = FastAPI()
        app.include_router(stats_routes.router)
        self.client = TestClient(app)

    def test_route_decrypts_cookie_and_uses_assigned_tunnel(self):
        with mock.patch.object(SecretStore, "decrypt", return_value="private-cookie") as dec, \
             mock.patch.object(vpn_manager, "start_verified_wireguard_proxy", return_value={"socks_port": 9876}) as proxy, \
             mock.patch.object(vpn_manager, "stop_wireguard_proxy") as stop, \
             mock.patch.object(tiktok_verified, "fetch", return_value={"ok": True, "data": {"value": 1}}) as fetch:
            response = self.client.get("/api/channels/7/tiktok-data?section=analytics")
        self.assertEqual(response.status_code, 200)
        dec.assert_called_once_with("encrypted-cookie")
        # Tunnel riêng của kênh (khoá = id kênh), không tắt giữa chừng: reaper tự tắt theo hạn.
        proxy.assert_called_once_with(7, "de1.conf")
        stop.assert_not_called()
        fetch.assert_called_once_with("private-cookie", 9876, "analytics", "", 1, "DE")

    def test_missing_channel_or_proxy_does_not_call_tiktok(self):
        with mock.patch.object(tiktok_verified, "fetch") as fetch:
            self.assertEqual(self.client.get("/api/channels/999/tiktok-data?section=wallet").status_code, 404)
            conn = sqlite3.connect(self.db)
            conn.execute("UPDATE channels SET vpn_config='' WHERE id=7")
            conn.commit()
            conn.close()
            self.assertEqual(self.client.get("/api/channels/7/tiktok-data?section=wallet").status_code, 503)
        fetch.assert_not_called()

    def test_verify_requires_owned_video_and_channel_vpn(self):
        with mock.patch.object(SecretStore, "decrypt", return_value="cookie"), \
             mock.patch.object(vpn_manager, "start_verified_wireguard_proxy", return_value={"socks_port": 9876}), \
             mock.patch.object(vpn_manager, "stop_wireguard_proxy"), \
             mock.patch.object(tiktok_video_checks, "check_video", return_value={"ok": True, "public": {"verdict": "deindexed"}}) as check:
            self.assertEqual(self.client.get("/api/channels/7/videos/9876543210987654321/verify").status_code, 404)
            result = self.client.get("/api/channels/7/videos/1234567890123456789/verify")
        self.assertEqual(result.json()["public"]["verdict"], "deindexed")
        check.assert_called_once_with("cookie", 9876, "1234567890123456789")

    def test_verify_unknown_is_error_not_success(self):
        with mock.patch.object(SecretStore, "decrypt", return_value="cookie"), \
             mock.patch.object(vpn_manager, "start_verified_wireguard_proxy", return_value={"socks_port": 9876}), \
             mock.patch.object(vpn_manager, "stop_wireguard_proxy"), \
             mock.patch.object(tiktok_video_checks, "check_video", return_value={"ok": False}):
            response = self.client.get("/api/channels/7/videos/1234567890123456789/verify")
        self.assertEqual(response.status_code, 502)

    def test_duplicates_are_scoped_to_channel(self):
        with mock.patch.object(SecretStore, "decrypt", return_value="cookie"), \
             mock.patch.object(vpn_manager, "start_verified_wireguard_proxy", return_value={"socks_port": 9876}), \
             mock.patch.object(vpn_manager, "stop_wireguard_proxy"), \
             mock.patch.object(tiktok_video_checks, "compare_covers", return_value={"checked": 1, "pairs": []}) as compare:
            result = self.client.post("/api/channels/7/videos/duplicates")
        self.assertEqual(result.json()["checked"], 1)
        self.assertEqual(compare.call_args.args[0][0][1], "1234567890123456789")

    def test_delete_requires_confirmation_and_owned_video(self):
        with mock.patch.object(tiktok_video_ops, "delete_video", new_callable=mock.AsyncMock) as deleter:
            self.assertEqual(self.client.post("/api/channels/7/videos/1234567890123456789/delete", json={}).status_code, 400)
            self.assertEqual(self.client.post("/api/channels/7/videos/9876543210987654321/delete", json={"confirm": True}).status_code, 404)
        deleter.assert_not_awaited()

    def test_delete_removes_local_row_only_after_confirmed_tiktok_success(self):
        def exists():
            conn = sqlite3.connect(self.db)
            try:
                return conn.execute("SELECT 1 FROM channel_videos WHERE channel_id=7 AND video_id='1234567890123456789'").fetchone()
            finally:
                conn.close()
        with mock.patch.object(SecretStore, "decrypt", return_value="cookie"), \
             mock.patch.object(vpn_manager, "start_verified_wireguard_proxy", return_value={"socks_port": 9876}), \
             mock.patch.object(vpn_manager, "stop_wireguard_proxy"), \
             mock.patch.object(tiktok_video_ops, "delete_video", new_callable=mock.AsyncMock) as deleter:
            deleter.return_value = {"ok": False, "error": "ticket guard"}
            response = self.client.post("/api/channels/7/videos/1234567890123456789/delete", json={"confirm": True})
            self.assertEqual(response.status_code, 502)
            self.assertIsNotNone(exists())
            deleter.return_value = {"ok": True}
            response = self.client.post("/api/channels/7/videos/1234567890123456789/delete", json={"confirm": True})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["cached_row_removed"])
        self.assertIsNone(exists())

    def test_tiktok_failure_is_not_reported_as_zero(self):
        with mock.patch.object(SecretStore, "decrypt", return_value="cookie"), \
             mock.patch.object(vpn_manager, "start_verified_wireguard_proxy", return_value={"socks_port": 9876}), \
             mock.patch.object(vpn_manager, "stop_wireguard_proxy"), \
             mock.patch.object(tiktok_verified, "fetch", return_value={"ok": False, "error": "Không có dữ liệu"}):
            response = self.client.get("/api/channels/7/tiktok-data?section=rewards")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Không có dữ liệu")

    def test_invalid_section_and_video_id(self):
        self.assertEqual(self.client.get("/api/channels/7/tiktok-data?section=withdraw").status_code, 422)
        self.assertEqual(self.client.get("/api/channels/7/tiktok-data?section=video&video_id=nope").status_code, 400)


class TimezoneTests(unittest.TestCase):
    def test_studio_timezone_follows_the_account_country(self):
        self.assertEqual(tiktok_verified.timezone_for("de")[0], "Europe/Berlin")
        self.assertEqual(tiktok_verified.timezone_for("JP"), ("Asia/Tokyo", 32400))
        self.assertEqual(tiktok_verified.timezone_for("??"), ("UTC", 0))

    def test_requests_carry_the_account_timezone_not_saigon(self):
        seen = []

        class Resp:
            status_code = 200
            headers = {"content-type": "application/json"}

            def json(self):
                return {"status_code": 0, "data": {}}

        class Session:
            def __init__(self, *a, **k):
                self.headers, self.proxies = {}, {}

            def get(self, url, params=None, **k):
                seen.append(params)
                return Resp()

            def close(self):
                pass

        with mock.patch.object(tiktok_verified.requests, "Session", Session):
            tiktok_verified.fetch("cookie", 9999, "analytics", date_range=1, country="KR")
        self.assertEqual(seen[0]["tz_name"], "Asia/Seoul")
        self.assertEqual(seen[0]["time_offset"], "32400")
        self.assertNotIn("Saigon", json.dumps(seen))
