"""
Khoá lại các lỗi đã sửa trong đợt rà soát 2026-09-16, để chúng không quay lại.
"""

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import httpx

from bkt_web import vpn_manager
from bkt_web import dashboard_routes, upload_routes
from bkt_web.ai_vision import encode_screenshot
from bkt_web.server import app, build_ffmpeg_render_cmd


class RouteCollisionTest(unittest.IsolatedAsyncioTestCase):
    """
    nn_router từng được mount cả ở /api lẫn /api/nn, nuốt mất ba endpoint của
    ứng dụng chính vì router được đăng ký trước các @app.get("/api/...").
    """

    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        await self.client.get("/")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_settings_is_the_system_settings_not_ai_vision(self):
        data = (await self.client.get("/api/settings")).json()
        self.assertIn("api_captcha_configured", data)
        self.assertIn("download_folder", data)
        self.assertNotIn("ai_vision", data)

    async def test_vpn_catalog_returns_a_bare_list(self):
        # Giao diện làm servers.map(...) nên phải là mảng, không phải
        # {country, configs} của nn_router.
        payload = (await self.client.get("/api/vpn/catalog/GB")).json()
        self.assertIsInstance(payload, list)

    async def test_vpn_stats_is_the_system_shape(self):
        data = (await self.client.get("/api/vpn/stats")).json()
        self.assertIn("countries", data)

    async def test_nuoinick_still_reachable_under_its_own_prefix(self):
        data = (await self.client.get("/api/nn/settings")).json()
        self.assertIn("ai_vision", data)

    async def test_gpm_compat_api_still_mounted_at_api_root(self):
        for path in ("/api/v1/profiles", "/api/v3/profiles"):
            self.assertEqual((await self.client.get(path)).status_code, 200, path)

    async def test_dashboard_router_is_mounted(self):
        response = await self.client.get("/api/dashboard/summary")
        self.assertEqual(response.status_code, 200)

    async def test_upload_task_router_is_mounted_without_shadowing_publish_now(self):
        self.assertEqual((await self.client.get("/api/upload/tasks")).status_code, 200)
        response = await self.client.post("/api/upload/tasks/999/retry")
        self.assertIn(response.status_code, (409, 404))
        # publish-now remains owned by server.py and must still resolve as a real route.
        response = await self.client.post("/api/upload/publish-now", json={})
        self.assertNotEqual(response.status_code, 404)


class LoginRateKeyTest(unittest.TestCase):
    def _request(self, peer, real_ip=""):
        return SimpleNamespace(client=SimpleNamespace(host=peer), headers={"x-real-ip": real_ip})

    def test_local_reverse_proxy_uses_valid_real_ip(self):
        from bkt_web.server import _login_rate_key
        self.assertEqual(_login_rate_key(self._request("127.0.0.1", "203.0.113.9")), "203.0.113.9")

    def test_direct_peer_cannot_spoof_real_ip_header(self):
        from bkt_web.server import _login_rate_key
        self.assertEqual(_login_rate_key(self._request("198.51.100.7", "203.0.113.9")), "198.51.100.7")

    def test_invalid_proxy_header_falls_back_to_peer(self):
        from bkt_web.server import _login_rate_key
        self.assertEqual(_login_rate_key(self._request("127.0.0.1", "not-an-ip")), "127.0.0.1")


class DashboardUploadStateTest(unittest.TestCase):
    def test_dashboard_uses_real_upload_states(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "dashboard.db"
            with sqlite3.connect(db) as conn:
                conn.execute("""
                    CREATE TABLE upload_tasks (
                        id INTEGER PRIMARY KEY, status TEXT, error_message TEXT DEFAULT '',
                        created_at INTEGER DEFAULT 0, caption TEXT DEFAULT '',
                        schedule_time INTEGER DEFAULT 0, channel_id INTEGER DEFAULT 0
                    )
                """)
                conn.executemany(
                    "INSERT INTO upload_tasks (status, error_message, created_at) VALUES (?,?,?)",
                    [("ERROR", "boom", 1), ("NEEDS_CHECK", "verify", 2), ("WAITING_RENDER", "", 3)],
                )
            upload = dashboard_routes.build_dashboard_summary(db)["data"]["upload"]
        self.assertEqual(upload["error"], 1)
        self.assertEqual(upload["needs_check"], 1)
        self.assertEqual(upload["waiting_render"], 1)
        self.assertNotIn("failed", upload)


class UploadApiStateTest(unittest.TestCase):
    def test_retry_confirm_and_cancel_use_canonical_transitions(self):
        from bkt_web import upload_states as us

        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "upload-api.db"
            with sqlite3.connect(db) as conn:
                conn.execute("""
                    CREATE TABLE upload_tasks (
                        id INTEGER PRIMARY KEY, status TEXT, schedule_time INTEGER DEFAULT 0,
                        error_message TEXT DEFAULT '', next_retry_at INTEGER DEFAULT 0,
                        attempt_count INTEGER DEFAULT 0, clicked_post_at INTEGER DEFAULT 0,
                        verify_attempts INTEGER DEFAULT 0, next_verify_at INTEGER DEFAULT 0,
                        verify_note TEXT DEFAULT '', published_video_id TEXT DEFAULT '',
                        uploaded_at INTEGER DEFAULT 0
                    )
                """)
                conn.executemany(
                    "INSERT INTO upload_tasks (id,status) VALUES (?,?)",
                    [(1, us.ERROR), (2, us.NEEDS_CHECK), (3, us.QUEUED)],
                )

            old_db = upload_routes.DB_PATH
            upload_routes.DB_PATH = db
            try:
                upload_routes.retry_upload_task(1)
                upload_routes.confirm_upload_task(2)
                upload_routes.cancel_upload_task(3)
            finally:
                upload_routes.DB_PATH = old_db

            with sqlite3.connect(db) as conn:
                states = dict(conn.execute("SELECT id,status FROM upload_tasks"))
        self.assertEqual(states, {1: us.QUEUED, 2: us.SUCCESS, 3: us.CANCELLED})


class FfmpegRenderCmdTest(unittest.TestCase):
    """
    Đã -map video tường minh thì ffmpeg tắt chọn stream mặc định; thiếu
    "-map 0:a?" là mất sạch tiếng gốc mà không báo lỗi. Tốc độ mặc định là
    1.04 nên lỗi này nằm đúng trên đường đi mặc định.
    """

    def _cmd(self, **kw):
        args = dict(
            in_file="in.mp4", out_file="out.mp4", flip=True, speed=1.04,
            crop_pct=3.0, color_adj=True, overlay_file="", audio_file="", use_gpu=True,
        )
        args.update(kw)
        return build_ffmpeg_render_cmd(**args)

    def _pairs(self, cmd):
        return list(zip(cmd, cmd[1:]))

    def test_source_audio_is_mapped_when_speed_changes(self):
        cmd = self._cmd(speed=1.04)
        self.assertIn(("-map", "0:a?"), self._pairs(cmd))
        self.assertIn(("-af", "atempo=1.04"), self._pairs(cmd))

    def test_source_audio_is_mapped_at_normal_speed(self):
        self.assertIn(("-map", "0:a?"), self._pairs(self._cmd(speed=1.0)))

    def test_source_audio_is_mapped_with_overlay(self):
        self.assertIn(("-map", "0:a?"), self._pairs(self._cmd(overlay_file="o.png")))

    def test_custom_audio_track_replaces_the_source_track(self):
        pairs = self._pairs(self._cmd(audio_file="bg.mp3"))
        self.assertIn(("-map", "1:a"), pairs)
        self.assertNotIn(("-map", "0:a?"), pairs)


class ScreenshotMediaTypeTest(unittest.TestCase):
    """Khai PNG là JPEG sẽ bị các API vision từ chối request."""

    def test_media_type_matches_the_bytes(self):
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (1200, 800)).save(buf, format="PNG")
        data, media_type = encode_screenshot(buf.getvalue())
        self.assertEqual(media_type, "image/jpeg")
        self.assertTrue(data.startswith(b"\xff\xd8"))
        # Bản gốc thu về cạnh dài 400px
        self.assertEqual(max(Image.open(io.BytesIO(data)).size), 400)

    def test_png_fallback_is_labelled_png(self):
        import builtins

        real_import = builtins.__import__

        def no_pil(name, *args, **kwargs):
            if name.startswith("PIL"):
                raise ImportError("Pillow không có sẵn")
            return real_import(name, *args, **kwargs)

        builtins.__import__ = no_pil
        try:
            data, media_type = encode_screenshot(b"\x89PNG\r\n\x1a\nrest")
        finally:
            builtins.__import__ = real_import
        self.assertEqual(media_type, "image/png")
        self.assertTrue(data.startswith(b"\x89PNG"))


class CookieHashIndexTest(unittest.TestCase):
    """
    Kênh chưa có cookie phải mang NULL chứ không phải '': SQLite coi hai chuỗi
    '' là trùng nhau nên index duy nhất sẽ ném IntegrityError ngay lúc khởi động.
    """

    def test_null_hashes_do_not_break_the_unique_index(self):
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, cookie_hash TEXT DEFAULT NULL, note TEXT)")
        conn.execute("INSERT INTO channels (cookie_hash) VALUES (NULL)")
        conn.execute("INSERT INTO channels (cookie_hash) VALUES (NULL)")
        conn.execute("CREATE UNIQUE INDEX idx ON channels(cookie_hash)")

        # Vẫn phải chống trùng với hash thật, và ON CONFLICT vẫn hoạt động.
        conn.execute("INSERT INTO channels (cookie_hash, note) VALUES ('H1','one')")
        conn.execute(
            "INSERT INTO channels (cookie_hash, note) VALUES ('H1','two') "
            "ON CONFLICT(cookie_hash) DO UPDATE SET note=excluded.note"
        )
        rows = conn.execute("SELECT count(*), max(note) FROM channels WHERE cookie_hash='H1'").fetchone()
        conn.close()
        self.assertEqual(rows, (1, "two"))


class DistinctVpnPickTest(unittest.TestCase):
    """README hứa mỗi tài khoản một server khác nhau nên IP không trùng.

    Các test này kiểm tra cách phân bổ, không kiểm tra liveness, nên đều tắt
    `require_alive`: config trong catalog giả không có file trên đĩa nên
    `is_vpn_config_alive` sẽ loại sạch, và bật nó lên còn khiến unit test đi
    phân giải DNS thật.
    """

    def test_picks_without_replacement(self):
        catalog = {"DE": [{"rel_path": f"NordVPN_Germany/Standard_P2P/Berlin/de{i}.conf"} for i in range(50)]}
        original = vpn_manager.get_vpn_catalog
        vpn_manager.get_vpn_catalog = lambda: catalog
        try:
            picks = vpn_manager.pick_distinct_vpns("DE", 50, require_alive=False)
        finally:
            vpn_manager.get_vpn_catalog = original
        self.assertEqual(len(picks), 50)
        self.assertEqual(len({p["rel_path"] for p in picks}), 50)

    def test_pool_smaller_than_demand_spreads_evenly(self):
        catalog = {"DE": [{"rel_path": f"NordVPN_Germany/Standard_P2P/Berlin/de{i}.conf"} for i in range(4)]}
        original = vpn_manager.get_vpn_catalog
        vpn_manager.get_vpn_catalog = lambda: catalog
        try:
            picks = vpn_manager.pick_distinct_vpns("DE", 12, require_alive=False)
        finally:
            vpn_manager.get_vpn_catalog = original
        counts = {}
        for p in picks:
            counts[p["rel_path"]] = counts.get(p["rel_path"], 0) + 1
        self.assertEqual(len(picks), 12)
        self.assertEqual(sorted(counts.values()), [3, 3, 3, 3])


if __name__ == "__main__":
    unittest.main()


class LocalModuleImportTest(unittest.TestCase):
    """
    Server chạy bằng `python3 -m bkt_web.server`, và server.py cố tình gỡ thư mục
    gốc dự án khỏi sys.path. Vì vậy `from fingerprint import ...` trần sẽ ném
    ModuleNotFoundError lúc chạy — mọi import module cục bộ phải có nhánh
    `bkt_web.<mod>` trước, rồi mới fallback sang tên trần.
    """

    def test_every_local_import_has_a_package_qualified_fallback(self):
        import ast
        import pathlib

        pkg = pathlib.Path(__file__).resolve().parent.parent / "bkt_web"
        local_modules = {p.stem for p in pkg.glob("*.py")}
        offenders = []

        for path in sorted(pkg.glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            guarded = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Try):
                    for child in ast.walk(node):
                        guarded.add(id(child))
            for node in ast.walk(tree):
                if id(node) in guarded:
                    continue
                if isinstance(node, ast.ImportFrom) and node.module in local_modules:
                    offenders.append(f"{path.name}:{node.lineno} from {node.module} import ...")
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name in local_modules:
                            offenders.append(f"{path.name}:{node.lineno} import {alias.name}")

        self.assertEqual(offenders, [], "Import module cục bộ không có fallback: " + "; ".join(offenders))

    def test_native_profile_starter_imports_under_package_layout(self):
        # Lỗi cũ chỉ lộ ra khi thư mục gốc không nằm trong sys.path.
        import pathlib
        import subprocess
        import sys

        root = pathlib.Path(__file__).resolve().parent.parent
        code = (
            "import sys\n"
            f"root = {str(root)!r}\n"
            "sys.path = [p for p in sys.path if p not in ('', '.', root)]\n"
            "sys.path.append(root)\n"
            "from bkt_web.fingerprint import generate_fingerprint_script\n"
            "from bkt_web.browser_engine import start_native_profile\n"
            "print('ok')\n"
        )
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=str(root))
        self.assertEqual(result.returncode, 0, result.stderr)


class NativeBrowserEngineTest(unittest.TestCase):
    """
    GPM đã được port vào chính web này (nó tự phục vụ /api/v1/profiles/*), nên
    mặc định phải trỏ về đây thay vì phần mềm GPM ngoài ở cổng 9495.
    """

    def test_default_engine_points_at_this_app(self):
        from bkt_web.browser_engine import (
            AntidetectSettings, BrowserEngineTypes, NATIVE_DEFAULT_API,
        )
        settings = AntidetectSettings()
        self.assertEqual(settings.engine, BrowserEngineTypes.NATIVE)
        self.assertEqual(settings.api_url, NATIVE_DEFAULT_API)

    def test_each_engine_keeps_its_own_default_api(self):
        from bkt_web.browser_engine import (
            AntidetectSettings, BrowserEngineTypes, GPM_DEFAULT_API,
            NATIVE_DEFAULT_API, OMO_DEFAULT_API,
        )
        cases = {
            BrowserEngineTypes.NATIVE: NATIVE_DEFAULT_API,
            BrowserEngineTypes.GPM: GPM_DEFAULT_API,
            BrowserEngineTypes.OMO: OMO_DEFAULT_API,
        }
        for engine, expected in cases.items():
            self.assertEqual(AntidetectSettings.from_dict({"engine": engine}).api_url, expected, engine)
        # Địa chỉ gõ tay luôn thắng mặc định
        typed = AntidetectSettings.from_dict({"engine": "Gpm", "api_url": "http://127.0.0.1:1234"})
        self.assertEqual(typed.api_url, "http://127.0.0.1:1234")

    def test_devtools_ws_url_is_read_from_chrome_not_guessed(self):
        """
        Chrome gắn một GUID vào cuối đường dẫn websocket. Tự ghép
        ws://127.0.0.1:PORT/devtools/browser sẽ bị 404 và Playwright không nối
        CDP được, nên phải đọc từ /json/version.
        """
        import inspect

        from bkt_web import browser_engine

        source = inspect.getsource(browser_engine.start_native_profile)
        self.assertNotIn('f"ws://127.0.0.1:{debug_port}/devtools/browser"', source)
        self.assertIn("_read_devtools_ws_url", source)
        self.assertIn("webSocketDebuggerUrl", inspect.getsource(browser_engine._read_devtools_ws_url))

    def test_chromium_rejects_socks5_with_credentials_early(self):
        import inspect

        from bkt_web import browser_engine

        source = inspect.getsource(browser_engine.start_native_profile)
        self.assertIn("SOCKS5", source)

    def test_facebook_cookie_jar_is_encrypted_and_round_trips(self):
        from bkt_web.browser_engine import (
            load_native_profile_cookies,
            persist_native_profile_cookies,
        )

        cookies = [
            {"name": "c_user", "value": "61594515236679", "domain": ".facebook.com", "path": "/"},
            {"name": "xs", "value": "session-secret", "domain": ".facebook.com", "path": "/"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(persist_native_profile_cookies("fb-61594515236679", cookies, tmp))
            cookie_file = Path(tmp) / "fb-61594515236679" / ".facebook-session.fernet"
            raw = cookie_file.read_text(encoding="utf-8")
            self.assertTrue(raw.startswith("enc:v1:"))
            self.assertNotIn("session-secret", raw)
            self.assertEqual(
                load_native_profile_cookies("fb-61594515236679", tmp),
                cookies,
            )


class FacebookSessionRegressionTest(unittest.TestCase):
    def test_profile_lookup_supports_dict_row_factory(self):
        from bkt_web import nuoinick_db

        conn = sqlite3.connect(":memory:")
        try:
            nuoinick_db.ensure_created(conn)
            nuoinick_db.save_browser_profile(conn, {"Id": "fb-123", "Name": "Account 123"})
            conn.row_factory = lambda cursor, row: {
                column[0]: row[index] for index, column in enumerate(cursor.description)
            }
            profile = nuoinick_db.get_browser_profile(conn, "fb-123")
            self.assertEqual(profile["Id"], "fb-123")
            self.assertEqual(profile["Name"], "Account 123")
        finally:
            conn.close()

    def test_cookie_parsers_preserve_required_session_cookies(self):
        from bkt_web.facebook_reg_routes import facebook_cookie_header_to_playwright
        from bkt_web.facebook_routes import _facebook_cookie_jar
        from bkt_web.nuoinick_routes import _facebook_cookie_jar as nn_cookie_jar

        header = "c_user=123456; xs=abc%3Adef; malformed"
        for parser in (facebook_cookie_header_to_playwright, _facebook_cookie_jar, nn_cookie_jar):
            parsed = {item["name"]: item["value"] for item in parser(header)}
            self.assertEqual(parsed["c_user"], "123456")
            self.assertEqual(parsed["xs"], "abc%3Adef")
            self.assertNotIn("malformed", parsed)

    def test_reg_success_requires_full_session_and_profile_page(self):
        import inspect

        from bkt_web.facebook_reg_engine import FacebookRegistrationRunner

        source = inspect.getsource(FacebookRegistrationRunner.run_single_registration)
        self.assertIn('validate_session_cookies(cookies)', source)
        self.assertIn('"https://www.facebook.com/me"', source)
        self.assertIn('is_blocked_facebook_url(final_url)', source)

    def test_registration_fails_closed_when_requested_vpn_cannot_start(self):
        import inspect

        from bkt_web.facebook_reg_engine import FacebookRegistrationRunner

        source = inspect.getsource(FacebookRegistrationRunner.run_single_registration)
        self.assertIn('status": "Lỗi VPN"', source)
        self.assertIn("Không tìm thấy cấu hình WireGuard", source)
        self.assertIn("Không khởi động được VPN", source)

    def test_session_cookie_validation_rejects_missing_or_wrong_identity(self):
        from bkt_web.facebook_session import validate_session_cookies

        valid = [
            {"name": "c_user", "value": "123"},
            {"name": "xs", "value": "secret"},
        ]
        self.assertEqual(validate_session_cookies(valid, "123")[:2], (True, "123"))
        self.assertFalse(validate_session_cookies(valid, "456")[0])
        self.assertIn("không khớp", validate_session_cookies(valid, "456")[2])
        self.assertFalse(validate_session_cookies(valid[:1], "123")[0])
        self.assertIn("xs", validate_session_cookies(valid[:1], "123")[2])

    def test_valid_session_is_synchronized_to_all_facebook_stores(self):
        from bkt_web.facebook_session import sync_session_cookie

        conn = sqlite3.connect(":memory:")
        try:
            conn.execute("CREATE TABLE fb_reg_accounts(uid TEXT, cookie TEXT, status TEXT, message TEXT)")
            conn.execute("CREATE TABLE fb_accounts(uid TEXT, cookie TEXT, status TEXT)")
            conn.execute("CREATE TABLE FacebookAccounts(Uid TEXT, Cookie TEXT, TrangThai TEXT, TinhTrang TEXT)")
            for sql in (
                "INSERT INTO fb_reg_accounts(uid) VALUES ('123')",
                "INSERT INTO fb_accounts(uid) VALUES ('123')",
                "INSERT INTO FacebookAccounts(Uid) VALUES ('123')",
            ):
                conn.execute(sql)
            result = sync_session_cookie(conn, "123", "c_user=123; xs=abc", lambda value: "ENC:" + value)
            self.assertEqual(result, {"fb_reg": 1, "fb_pro": 1, "nuoinick": 1})
            self.assertEqual(conn.execute("SELECT status FROM fb_reg_accounts").fetchone()[0], "Live (Phiên đã lưu)")
            self.assertEqual(conn.execute("SELECT status FROM fb_accounts").fetchone()[0], "Live")
            self.assertEqual(conn.execute("SELECT TrangThai FROM FacebookAccounts").fetchone()[0], "Live")
            self.assertTrue(conn.execute("SELECT Cookie FROM FacebookAccounts").fetchone()[0].startswith("ENC:"))
        finally:
            conn.close()

    def test_session_lifecycle_routes_are_mounted(self):
        from bkt_web.facebook_reg_routes import fb_reg_router
        from bkt_web.facebook_routes import fb_router
        from bkt_web.nuoinick_routes import nn_router

        routes = set()
        for prefix, router in (
            ("/api/fb-reg", fb_reg_router),
            ("/api/fb", fb_router),
            ("/api/nn", nn_router),
        ):
            routes.update(
                (prefix + route.path, method)
                for route in router.routes
                for method in getattr(route, "methods", set())
            )
        expected = {
            ("/api/fb-reg/accounts/{account_id}/session/capture", "POST"),
            ("/api/fb-reg/accounts/{account_id}/close", "POST"),
            ("/api/fb/accounts/{acc_id}/session/capture", "POST"),
            ("/api/fb/accounts/{acc_id}/close", "POST"),
            ("/api/nn/accounts/{account_id}/session/capture", "POST"),
            ("/api/nn/accounts/{account_id}/close-profile", "POST"),
        }
        self.assertTrue(expected.issubset(routes), expected - routes)


class FacebookTaskResourceRegressionTest(unittest.TestCase):
    def test_action_runner_always_closes_its_vpn_tunnel(self):
        """Direct GraphQL must not leave a WireGuard/SOCKS process behind."""
        import tempfile
        from pathlib import Path
        from unittest.mock import patch

        from bkt_web import facebook_routes

        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "facebook.db"
            conn = facebook_routes.connect_db(db_path)
            facebook_routes.init_fb_db(conn)
            conn.execute(
                """
                INSERT INTO fb_accounts
                    (uid, name, cookie, vpn_config, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    "10001",
                    "Test",
                    facebook_routes.encrypted("c_user=10001; xs=session"),
                    "test.conf",
                    1,
                ),
            )
            account_id = conn.execute("SELECT id FROM fb_accounts").fetchone()[0]
            conn.commit()
            conn.close()

            request = facebook_routes.ActionRunRequest(
                action_type="reaction-post",
                account_ids=[account_id],
                target_ids=["post-1"],
                payload={"reaction": "LIKE"},
            )
            with (
                patch.object(facebook_routes, "DB_PATH", db_path),
                patch.object(
                    facebook_routes.vpn_bridge,
                    "open_tunnel",
                    return_value="socks5://127.0.0.1:9999",
                ),
                patch.object(facebook_routes.vpn_bridge, "close_tunnel") as close_tunnel,
                patch.object(
                    facebook_routes.FacebookEngine,
                    "execute_action",
                    return_value={"success": True, "message": "ok"},
                ),
            ):
                result = facebook_routes.run_fb_action(request)

            self.assertEqual(result["count"], 1)
            close_tunnel.assert_called_once_with(
                facebook_routes.vpn_bridge.SCOPE_FACEBOOK, account_id
            )


class KeyVaultTest(unittest.TestCase):
    """
    Trước đây API key nằm rải ở bốn kho: fb_ai_settings, settings,
    fb_reg_settings và nuoinick_settings.json. Nhập ở màn hình này thì màn hình
    kia không dùng được, mức bảo vệ cũng không đồng đều. Giờ chỉ còn một kho.
    """

    def setUp(self):
        from bkt_web import key_vault

        self.vault = key_vault
        self._saved = {spec.name: key_vault.get_key(spec.name) for spec in key_vault.KEY_SPECS}

    def tearDown(self):
        for name, value in self._saved.items():
            if value:
                self.vault.set_key(name, value)
            else:
                self.vault.delete_key(name)

    def test_status_never_exposes_the_key_value(self):
        self.vault.set_key("ai.claude", "sk-ant-khong-duoc-lo-ra")
        blob = json.dumps(self.vault.status(), ensure_ascii=False)
        self.assertNotIn("sk-ant-khong-duoc-lo-ra", blob)
        entry = next(s for s in self.vault.status() if s["name"] == "ai.claude")
        self.assertTrue(entry["configured"])

    def test_key_is_encrypted_at_rest(self):
        import sqlite3

        self.vault.set_key("ai.claude", "sk-ant-bi-mat")
        conn = sqlite3.connect(self.vault.DB_PATH)
        raw = conn.execute("SELECT value FROM api_keys WHERE name='ai.claude'").fetchone()[0]
        conn.close()
        self.assertNotIn("sk-ant-bi-mat", raw)
        self.assertTrue(raw.startswith("enc:v1:"))
        self.assertEqual(self.vault.get_key("ai.claude"), "sk-ant-bi-mat")

    def test_empty_value_removes_the_key(self):
        self.vault.set_key("ai.claude", "tam-thoi")
        self.vault.set_key("ai.claude", "   ")
        self.assertEqual(self.vault.get_key("ai.claude"), "")

    def test_one_gemini_key_serves_every_module(self):
        from bkt_web.facebook_routes import FB_AI_KEY_NAMES
        from bkt_web.nuoinick_routes import AI_KEY_FIELDS

        self.vault.set_key("ai.gemini", "AIza-dung-chung")
        # Kịch bản AI Vision
        from bkt_web.nuoinick_routes import ai_settings
        self.assertEqual(ai_settings().google_api_key, "AIza-dung-chung")
        # Facebook Pro trỏ về đúng tên khoá đó
        self.assertEqual(FB_AI_KEY_NAMES["gemini"], "ai.gemini")
        self.assertEqual(AI_KEY_FIELDS["google_api_key"], "ai.gemini")

    def test_every_spec_name_is_unique_and_grouped(self):
        names = [spec.name for spec in self.vault.KEY_SPECS]
        self.assertEqual(len(names), len(set(names)))
        for spec in self.vault.KEY_SPECS:
            self.assertTrue(spec.label and spec.group, spec.name)


class KeyVaultApiTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from bkt_web import key_vault

        self._saved = {
            name: key_vault.get_key(name)
            for name in ("ai.vietapi", "mail.dongvanfb", "otp.funotp")
        }
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        await self.client.get("/")

    async def asyncTearDown(self):
        from bkt_web import key_vault

        for name, value in self._saved.items():
            if value:
                key_vault.set_key(name, value)
            else:
                key_vault.delete_key(name)
        await self.client.aclose()

    async def test_listing_returns_specs_without_values(self):
        data = (await self.client.get("/api/keys")).json()
        self.assertTrue(data["keys"])
        for item in data["keys"]:
            self.assertNotIn("value", item)

    async def test_unknown_key_name_is_rejected(self):
        self.assertEqual((await self.client.put("/api/keys/khong-co", json={"value": "x"})).status_code, 404)
        self.assertEqual((await self.client.post("/api/keys/khong-co/test")).status_code, 404)

    async def test_reg_settings_no_longer_leak_provider_keys(self):
        from bkt_web import key_vault

        key_vault.set_key("mail.dongvanfb", "DV-KHONG-DUOC-LO")
        try:
            body = (await self.client.get("/api/fb-reg/settings")).text
            self.assertNotIn("DV-KHONG-DUOC-LO", body)
            self.assertIn("dongvan_api_key_configured", body)
        finally:
            key_vault.delete_key("mail.dongvanfb")

    async def test_legacy_nn_key_is_redirected_to_vault_not_json(self):
        from bkt_web import key_vault
        from bkt_web.nuoinick_routes import SETTINGS_PATH

        existed = SETTINGS_PATH.exists()
        before = SETTINGS_PATH.read_bytes() if existed else b""
        try:
            response = await self.client.put(
                "/api/nn/settings",
                json={"ai_vision": {"provider": "VietApi", "vietapi_key": "VIET-BI-MAT"}},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(key_vault.get_key("ai.vietapi"), "VIET-BI-MAT")
            saved = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            self.assertNotIn("vietapi_key", saved.get("ai_vision", {}))
            self.assertNotIn("VIET-BI-MAT", SETTINGS_PATH.read_text(encoding="utf-8"))
        finally:
            if existed:
                SETTINGS_PATH.write_bytes(before)
            elif SETTINGS_PATH.exists():
                SETTINGS_PATH.unlink()

    async def test_reg_start_rejects_missing_central_provider_key(self):
        from bkt_web import key_vault

        key_vault.delete_key("mail.dongvanfb")
        response = await self.client.post(
            "/api/fb-reg/start",
            json={
                "thread_count": 1,
                "total_accounts": 1,
                "script_name": "Reg FB and Verify (M)",
                "mail_provider": "DongVanFb",
                "vpn_country": "US",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Kho Khoá API", response.json()["detail"])
