"""
Khoá bản port nuoinickbaosam 11.10.14 vào hành vi của bản Windows gốc.

Ground truth là source đã giải obfuscation từ FastBoxPhone.dll: tên bảng, tên cột,
51 tác vụ mẫu, thông báo lỗi của ProxyParser, và prompt của AiVisionClient.
"""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from bkt_web import nuoinick_db as db
from bkt_web import nuoinick_proxy as pp
from bkt_web.ai_vision import (
    AiVisionFlowStep,
    AiVisionSettings,
    AiVisionStepType,
    AiVisionTargetKind,
    UiElement,
    build_prompt,
    parse_action,
)
from bkt_web.chrome_runner import substitute


class ProxyParserTest(unittest.TestCase):
    """Đối chiếu từng nhánh của testTuongTacWPF.ProxyParser."""

    def test_ipv4_pair_and_quad(self):
        r = pp.parse("1.2.3.4:8080")
        self.assertTrue(r.is_valid)
        self.assertEqual((r.host, r.port, r.user), ("1.2.3.4", "8080", None))

        r = pp.parse("1.2.3.4:8080:bob:secret")
        self.assertEqual((r.user, r.password), ("bob", "secret"))

    def test_scheme_is_stripped_and_remembered(self):
        r = pp.parse("socks5://1.2.3.4:1080")
        self.assertEqual(r.scheme, "socks5")
        self.assertEqual(r.build_proxy_string(None), "socks5://1.2.3.4:1080")

    def test_build_without_scheme_keeps_colon_form(self):
        r = pp.parse("1.2.3.4:8080:bob:secret")
        self.assertEqual(r.build_proxy_string(None), "1.2.3.4:8080:bob:secret")
        self.assertEqual(r.build_proxy_string("http"), "http://bob:secret@1.2.3.4:8080")

    def test_ipv6_single_and_range(self):
        r = pp.parse("[2001:db8::1]:8080")
        self.assertEqual(r.kind, pp.ProxyKind.IPV6_SINGLE)
        self.assertEqual(r.host, "[2001:db8::1]")

        r = pp.parse("[2001:db8::]/64:8080")
        self.assertEqual(r.kind, pp.ProxyKind.IPV6_RANGE)
        self.assertEqual(r.host, "[2001:db8::]/64")

    def test_original_error_messages(self):
        self.assertEqual(pp.parse("").error, "Dòng rỗng")
        self.assertEqual(
            pp.parse("1.2.3.4").error,
            "Sai cấu trúc - cần ip:port hoặc ip:port:user:pass",
        )
        self.assertEqual(pp.parse("999.1.1.1:80").error, '"999.1.1.1" không phải IPv4 hợp lệ')
        self.assertEqual(
            pp.parse("1.2.3.4:70000").error,
            '"70000" không phải port hợp lệ (1-65535)',
        )
        self.assertEqual(pp.parse("[2001:db8::1").error, "Thiếu dấu ] đóng địa chỉ IPv6")
        self.assertIn("/1 - /128", pp.parse("[2001:db8::]/999:80").error)

    def test_playwright_proxy_shape(self):
        self.assertEqual(
            pp.to_playwright_proxy("1.2.3.4:8080:bob:secret"),
            {"server": "http://1.2.3.4:8080", "username": "bob", "password": "secret"},
        )
        self.assertIsNone(pp.to_playwright_proxy("rác"))


class DatabaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.conn = sqlite3.connect(Path(self.tmp.name) / "t.db")
        db.ensure_created(self.conn)
        self.enc = lambda v: v
        self.dec = lambda v: v

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def test_seeds_all_51_original_actions(self):
        self.assertEqual(len(db.SEED_ACTIONS), 51)
        self.assertEqual(len(db.load_actions(self.conn)), 51)
        self.assertEqual(len(db.load_actions(self.conn, "Chrome")), 1)

    def test_ensure_created_is_idempotent(self):
        db.ensure_created(self.conn)
        self.assertEqual(len(db.load_actions(self.conn)), 51)
        folders = db.load_folders(self.conn, "Facebook")
        self.assertEqual(len([f for f in folders if f["is_system"]]), 1)

    def test_default_system_folder_named_like_original(self):
        folders = db.load_folders(self.conn, "Facebook")
        self.assertEqual(folders[0]["name"], db.DEFAULT_FOLDER_NAME)
        self.assertEqual(db.DEFAULT_FOLDER_NAME, "Mặc định")

    def test_import_assigns_sequential_idx(self):
        parsed = db.parse_import_lines("uid1|p1|2fa1\nuid2|p2\n\nuid3")
        self.assertEqual(len(parsed["rows"]), 3)
        folder = db.default_folder_id(self.conn, "Facebook")
        db.insert_accounts(self.conn, "Facebook", parsed["rows"], self.enc, folder)
        rows = db.load_accounts(self.conn, "Facebook", self.dec)
        self.assertEqual([r["Idx"] for r in rows], [1, 2, 3])
        self.assertEqual([r["Uid"] for r in rows], ["uid1", "uid2", "uid3"])
        self.assertEqual(rows[1]["TwoFA"], "")

    def test_import_skips_lines_without_uid(self):
        parsed = db.parse_import_lines("|pass|2fa\nuid1|p")
        self.assertEqual(len(parsed["rows"]), 1)
        self.assertEqual(len(parsed["skipped"]), 1)

    def test_deleting_folder_moves_nicks_to_default(self):
        folder = db.create_folder(self.conn, "Facebook", "Kho A")
        db.insert_accounts(
            self.conn, "Facebook", db.parse_import_lines("uid1")["rows"], self.enc, folder["id"]
        )
        db.delete_folder(self.conn, "Facebook", folder["id"])
        rows = db.load_accounts(self.conn, "Facebook", self.dec)
        self.assertEqual(rows[0]["FolderId"], db.default_folder_id(self.conn, "Facebook"))

    def test_system_folder_cannot_be_deleted(self):
        with self.assertRaises(ValueError):
            db.delete_folder(self.conn, "Facebook", db.default_folder_id(self.conn, "Facebook"))

    def test_reindex_after_delete(self):
        db.insert_accounts(
            self.conn, "Facebook", db.parse_import_lines("a\nb\nc")["rows"], self.enc,
            db.default_folder_id(self.conn, "Facebook"),
        )
        rows = db.load_accounts(self.conn, "Facebook", self.dec)
        db.delete_accounts(self.conn, "Facebook", [rows[1]["Id"]])
        db.reindex(self.conn, "Facebook")
        self.assertEqual([r["Idx"] for r in db.load_accounts(self.conn, "Facebook", self.dec)], [1, 2])

    def test_assign_script_copies_name(self):
        script = db.create_script_folder(self.conn, "Nuôi nick sáng", "Chrome")
        db.insert_accounts(
            self.conn, "Facebook", db.parse_import_lines("a")["rows"], self.enc,
            db.default_folder_id(self.conn, "Facebook"),
        )
        rows = db.load_accounts(self.conn, "Facebook", self.dec)
        db.assign_script(self.conn, "Facebook", [rows[0]["Id"]], script["id"])
        row = db.load_accounts(self.conn, "Facebook", self.dec)[0]
        self.assertEqual(row["ScriptId"], script["id"])
        self.assertEqual(row["ScriptName"], "Nuôi nick sáng")

    def test_deleting_script_detaches_nicks(self):
        script = db.create_script_folder(self.conn, "S", "Chrome")
        db.insert_accounts(
            self.conn, "Facebook", db.parse_import_lines("a")["rows"], self.enc,
            db.default_folder_id(self.conn, "Facebook"),
        )
        rows = db.load_accounts(self.conn, "Facebook", self.dec)
        db.assign_script(self.conn, "Facebook", [rows[0]["Id"]], script["id"])
        db.delete_script_folder(self.conn, script["id"])
        row = db.load_accounts(self.conn, "Facebook", self.dec)[0]
        self.assertEqual((row["ScriptId"], row["ScriptName"]), (0, ""))

    def test_secret_columns_are_encrypted_on_write(self):
        marker = lambda v: f"ENC({v})"
        db.insert_accounts(
            self.conn, "Facebook", db.parse_import_lines("uid|secret")["rows"], marker,
            db.default_folder_id(self.conn, "Facebook"),
        )
        raw = self.conn.execute("SELECT Pass, Uid FROM FacebookAccounts").fetchone()
        self.assertEqual(raw[0], "ENC(secret)")
        self.assertEqual(raw[1], "uid")  # Uid không phải cột bí mật

    def test_export_respects_column_choice(self):
        db.insert_accounts(
            self.conn, "Facebook", db.parse_import_lines("uid1|p1")["rows"], self.enc,
            db.default_folder_id(self.conn, "Facebook"),
        )
        rows = db.load_accounts(self.conn, "Facebook", self.dec)
        self.assertEqual(db.export_accounts(rows, ["Uid", "Pass"]), "uid1|p1")

    def test_flow_round_trip(self):
        script = db.create_script_folder(self.conn, "S", "Chrome")
        db.save_script_flow(self.conn, script["id"], [{"type": "Tap", "x": 500, "y": 500}])
        loaded = db.load_script_folders(self.conn)[0]
        self.assertEqual(loaded["step_count"], 1)
        self.assertEqual(loaded["flow"][0]["x"], 500)

    def test_every_platform_has_its_own_tables(self):
        for platform in db.PLATFORMS:
            db.insert_accounts(
                self.conn, platform, db.parse_import_lines("x")["rows"], self.enc,
                db.default_folder_id(self.conn, platform),
            )
            self.assertEqual(len(db.load_accounts(self.conn, platform, self.dec)), 1)

    def test_unknown_platform_is_rejected(self):
        with self.assertRaises(ValueError):
            db.account_table("Zalo")


class AiVisionTest(unittest.TestCase):
    def test_prompt_matches_original_wording(self):
        prompt = build_prompt(
            "đăng nhập", ["mở trang"], [UiElement(label="Đăng nhập")],
            AiVisionTargetKind.CHROME, send_screenshot=True,
        )
        self.assertIn("Nhiệm vụ trên trang web đang mở trong trình duyệt Chrome: đăng nhập", prompt)
        self.assertIn("Đã làm:\n1. mở trang", prompt)
        self.assertIn('0: "Đăng nhập"', prompt)
        self.assertIn("tap|text|keyevent|navigate|wait|done", prompt)
        self.assertIn("thang TỈ LỆ 0-1000", prompt)
        # nhánh Chrome không có mô tả swipe, nhưng có navigate
        self.assertNotIn("- swipe:", prompt)
        self.assertIn("- navigate: mở thẳng URL", prompt)

    def test_phone_prompt_has_swipe_and_keycode(self):
        prompt = build_prompt("x", [], [], AiVisionTargetKind.PHONE, send_screenshot=True)
        self.assertIn("tap|swipe|text|keyevent|wait|done", prompt)
        self.assertIn("- swipe:", prompt)
        self.assertIn("tên keycode (BACK, HOME, ENTER...)", prompt)
        self.assertIn("WebView/game", prompt)

    def test_prompt_without_image_forbids_guessing_coordinates(self):
        prompt = build_prompt(
            "x", [], [UiElement(label="a")], AiVisionTargetKind.CHROME, send_screenshot=False
        )
        self.assertIn("KHÔNG có ảnh đính kèm lần này", prompt)
        self.assertIn("KHÔNG đoán toạ độ tap", prompt)

    def test_empty_history_placeholder(self):
        self.assertIn(
            "(chưa làm bước nào)",
            build_prompt("x", [], [], AiVisionTargetKind.CHROME, True),
        )

    def test_prompt_caps_element_list_at_40(self):
        elements = [UiElement(label=f"e{i}") for i in range(60)]
        prompt = build_prompt("x", [], elements, AiVisionTargetKind.CHROME, True)
        self.assertIn('39: "e39"', prompt)
        self.assertNotIn('40: "e40"', prompt)

    def test_parse_action_handles_fenced_json(self):
        action = parse_action('```json\n{"action":"tap","elementIndex":3,"reason":"ok"}\n```')
        self.assertEqual(action.action, "tap")
        self.assertEqual(action.element_index, 3)

    def test_parse_action_rejects_non_json(self):
        with self.assertRaises(Exception):
            parse_action("xin chào")

    def test_settings_default_priority_targets_to_provider(self):
        settings = AiVisionSettings.from_dict({"provider": "Gemini"})
        self.assertEqual(settings.priority_targets, ["Gemini"])

    def test_settings_redacts_keys(self):
        settings = AiVisionSettings.from_dict({"api_key": "sk-real", "google_api_key": ""})
        redacted = settings.redacted()
        self.assertEqual(redacted["api_key"], "***")
        self.assertEqual(redacted["google_api_key"], "")

    def test_flow_step_round_trip_keeps_type(self):
        step = AiVisionFlowStep.from_dict({"type": "Swipe", "x": 1, "y": 2, "x2": 3, "y2": 4})
        self.assertEqual(step.type, AiVisionStepType.SWIPE)
        self.assertEqual(step.to_dict()["type"], "Swipe")

    def test_unknown_step_type_falls_back_to_tap(self):
        self.assertEqual(AiVisionFlowStep.from_dict({"type": "Nope"}).type, AiVisionStepType.TAP)

    def test_variable_substitution(self):
        self.assertEqual(substitute("xin chào {uid}", {"uid": "123"}), "xin chào 123")
        self.assertEqual(substitute("{chua_co}", {}), "{chua_co}")


if __name__ == "__main__":
    unittest.main()


class VpnBridgeTest(unittest.TestCase):
    """Cầu nối VPN dùng chung — mọi module đi ra bằng WireGuard, không dùng proxy ngoài."""

    def test_tunnel_keys_are_namespaced_per_module(self):
        from bkt_web import vpn_bridge

        # Kênh TikTok dùng id số trong cùng một dict tunnel, nên các module khác
        # phải có tiền tố riêng để không ghi đè lẫn nhau
        keys = {
            vpn_bridge.tunnel_key(vpn_bridge.SCOPE_FACEBOOK, 7),
            vpn_bridge.tunnel_key(vpn_bridge.SCOPE_NUOINICK, 7),
            vpn_bridge.tunnel_key(vpn_bridge.SCOPE_FBREG, 7),
        }
        self.assertEqual(len(keys), 3)
        self.assertNotIn(7, keys)

    def test_open_tunnel_without_config_is_rejected(self):
        from bkt_web import vpn_bridge

        with self.assertRaises(vpn_bridge.VpnError):
            vpn_bridge.open_tunnel(vpn_bridge.SCOPE_FACEBOOK, 1, "")

    def test_playwright_proxy_uses_local_socks(self):
        from bkt_web import vpn_bridge

        self.assertEqual(
            vpn_bridge.to_playwright_proxy("socks5://127.0.0.1:12345"),
            {"server": "socks5://127.0.0.1:12345"},
        )


class NoProxyLeftBehindTest(unittest.TestCase):
    """Chốt lại: không còn đường nào trong ứng dụng nhận proxy ngoài từ người dùng."""

    def test_account_columns_carry_vpn_not_proxy_input(self):
        self.assertIn("VpnConfig", db.ACCOUNT_COLUMNS)
        self.assertIn("VpnLocation", db.ACCOUNT_COLUMNS)
        self.assertIn("Country", db.ACCOUNT_COLUMNS)
        # Cột Proxy của bản gốc còn trong bảng nhưng không còn là dữ liệu bí mật
        # được ghi vào, vì không nơi nào nhận proxy nữa
        self.assertNotIn("Proxy", db.SECRET_COLUMNS)

    def test_import_last_field_is_vpn_country(self):
        self.assertEqual(db.IMPORT_FIELD_ORDER[-1], "Country")
        parsed = db.parse_import_lines("uid1|pw|2fa|tok|ck|m@m.com|pm|mk|GB")
        self.assertEqual(parsed["rows"][0]["Country"], "GB")
