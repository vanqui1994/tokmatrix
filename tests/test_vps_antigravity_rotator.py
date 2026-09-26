"""deploy/vps_antigravity_rotator.py — không gọi Google, systemctl hay Antigravity thật."""
import argparse
import base64
import json
import os
import sqlite3
import stat
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from deploy import vps_antigravity_rotator as rotator


def _pool(**overrides):
    accounts = [
        {"email": "u1@x.com", "tier": "ultra", "refresh_token": "r1", "last_used_at": 300},
        {"email": "u2@x.com", "tier": "ultra", "refresh_token": "r2", "last_used_at": 100},
        {"email": "p1@x.com", "tier": "pro", "refresh_token": "r3", "last_used_at": 50},
        {"email": "p2@x.com", "tier": "pro", "refresh_token": "r4", "last_used_at": 10},
    ]
    pool = {"version": "1.0", "active_email": "u1@x.com", "google_client_id": "id",
            "google_client_secret": "secret", "accounts": accounts}
    pool.update(overrides)
    return pool


def _rotate_args(**kw):
    base = {"kind": "image", "account": "u1@x.com", "until": 0, "model": "gemini-3.1-flash-image"}
    base.update(kw)
    return argparse.Namespace(**base)


class RotatorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.pool_file = root / "pool.json"
        self.switched = []
        self.notes = []
        self.patches = [
            patch.object(rotator, "notify", lambda sev, text: self.notes.append((sev, text))),
            patch.object(rotator, "EXHAUSTED_STAMP", root / "exhausted"),
            patch.object(rotator, "POOL_FILE", self.pool_file),
            patch.object(rotator, "LOCK_FILE", root / "rotator.lock"),
            patch.object(rotator, "ACTIVE_FILE", root / "active_account"),
            patch.object(rotator, "STATUS_FILE", root / "accounts_status.json"),
            patch.object(rotator, "apply_session", lambda payload, token, email: self.switched.append(email)),
            patch.object(rotator, "refresh_google_access_token",
                         lambda cid, secret, rt: {"access_token": f"at-{rt}", "expires_in": 3600}),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def write(self, pool):
        self.pool_file.write_text(json.dumps(pool))

    def read(self):
        return json.loads(self.pool_file.read_text())

    def acc(self, email):
        return next(a for a in self.read()["accounts"] if a["email"] == email)

    def test_protobuf_encoding(self):
        raw = base64.b64decode(rotator.build_antigravity_oauth_payload("ya29.t", "Bearer", "1//r", 1790300000, "eyJ"))
        self.assertIn(b"oauthTokenInfoSentinelKey", raw)

    def test_rotate_blocks_only_that_kind_until_real_reset_and_prefers_ultra(self):
        self.write(_pool())
        until = int(time.time() + 1800)
        self.assertEqual(rotator.cmd_rotate(_rotate_args(until=until)), 0)
        self.assertEqual(self.switched, ["u2@x.com"])
        u1 = self.acc("u1@x.com")
        self.assertEqual(u1["blocked"], {"image": until, "text": 0})
        self.assertEqual(self.read()["active_email"], "u2@x.com")
        self.assertNotIn("access_token", self.acc("u2@x.com"))
        self.assertEqual(stat.S_IMODE(os.stat(self.pool_file).st_mode), 0o600)

    def test_active_account_is_published_for_the_web_app(self):
        self.write(_pool())
        rotator.cmd_rotate(_rotate_args(until=time.time() + 600))
        active_file = Path(self.tmp.name) / "active_account"
        self.assertEqual(active_file.read_text().strip(), "u2@x.com")
        self.assertEqual(stat.S_IMODE(os.stat(active_file).st_mode), 0o644)

    def test_status_file_for_the_web_dashboard_has_no_secrets(self):
        self.write(_pool())
        until = int(time.time() + 900)
        rotator.cmd_rotate(_rotate_args(until=until))
        status_file = Path(self.tmp.name) / "accounts_status.json"
        raw = status_file.read_text()
        for secret in ("refresh_token", "access_token", "google_client_secret", "google_client_id", "r1", "secret"):
            self.assertNotIn(secret, raw)
        status = json.loads(raw)
        self.assertEqual(status["active_email"], "u2@x.com")
        u1 = next(a for a in status["accounts"] if a["email"] == "u1@x.com")
        self.assertEqual(u1["blocked"]["image"], until)
        self.assertEqual(stat.S_IMODE(os.stat(status_file).st_mode), 0o644)

    def test_second_bridge_does_not_rotate_again(self):
        self.write(_pool(active_email="u2@x.com"))
        self.assertEqual(rotator.cmd_rotate(_rotate_args(account="u1@x.com")), 0)
        self.assertEqual(self.switched, [])
        u1 = next(a for a in rotator.load_pool()["accounts"] if a["email"] == "u1@x.com")
        self.assertEqual(u1["blocked"], {"image": 0, "text": 0})

    def test_image_block_does_not_hide_account_from_text_rotation(self):
        pool = _pool()
        later = int(time.time() + 3600)
        pool["accounts"][1]["blocked"] = {"image": later, "text": 0}   # u2 hết ảnh, còn chữ
        self.write(pool)
        rotator.cmd_rotate(_rotate_args(kind="text", model="gemini-3-flash"))
        # p1/p2 còn cả hai loại nên được ưu tiên hơn u2 dù u2 là Ultra
        self.assertEqual(self.switched, ["p2@x.com"])

    def test_broken_refresh_token_is_disabled_and_next_account_tried(self):
        self.write(_pool())

        def refresh(cid, secret, rt):
            if rt == "r2":
                raise rotator.RefreshError("invalid_grant")
            return {"access_token": "ok", "expires_in": 3600}

        with patch.object(rotator, "refresh_google_access_token", refresh):
            self.assertEqual(rotator.cmd_rotate(_rotate_args(until=time.time() + 600)), 0)
        self.assertEqual(self.switched, ["p2@x.com"])
        self.assertTrue(self.acc("u2@x.com")["disabled"])
        self.assertIn("invalid_grant", self.acc("u2@x.com")["disabled_reason"])

    def test_validation_required_disables_account_and_switches(self):
        self.write(_pool())
        self.assertEqual(rotator.cmd_rotate(_rotate_args(kind="text", model="VALIDATION_REQUIRED")), 0)
        self.assertTrue(self.acc("u1@x.com")["disabled"])
        self.assertIn("VALIDATION_REQUIRED", self.acc("u1@x.com")["disabled_reason"])
        self.assertEqual(self.acc("u1@x.com")["blocked"].get("text", 0), 0)  # disable, không phải khoá quota
        self.assertEqual(len(self.switched), 1)
        self.assertNotEqual(self.switched[0], "u1@x.com")

    def test_all_blocked_returns_error_without_switching(self):
        pool = _pool()
        for a in pool["accounts"]:
            a["blocked"] = {"image": int(time.time() + 900), "text": 0}
        self.write(pool)
        self.assertEqual(rotator.cmd_rotate(_rotate_args(until=time.time() + 600)), 1)
        self.assertEqual(self.switched, [])

    def test_notifies_rotation_with_old_and_new_account(self):
        self.write(_pool())
        rotator.cmd_rotate(_rotate_args(until=time.time() + 600))
        self.assertEqual(len(self.notes), 1)
        sev, text = self.notes[0]
        self.assertEqual(sev, "info")
        self.assertIn("Đổi tài khoản Antigravity", text)
        self.assertIn("u1@x.com", text)
        self.assertIn("u2@x.com", text)
        self.assertIn("gemini-3.1-flash-image", text)
        self.assertNotIn("r2", text.replace("u2@x.com", ""))  # không lộ refresh token

    def test_broken_token_makes_rotation_notice_warn(self):
        self.write(_pool())

        def refresh(cid, secret, rt):
            if rt == "r2":
                raise rotator.RefreshError("invalid_grant")
            return {"access_token": "ok", "expires_in": 3600}

        with patch.object(rotator, "refresh_google_access_token", refresh):
            rotator.cmd_rotate(_rotate_args(until=time.time() + 600))
        sev, text = self.notes[0]
        self.assertEqual(sev, "warn")
        self.assertIn("disable: u2@x.com", text)

    def test_exhausted_is_critical_once_per_hour(self):
        pool = _pool()
        for a in pool["accounts"]:
            a["blocked"] = {"image": int(time.time() + 900), "text": 0}
        self.write(pool)
        rotator.cmd_rotate(_rotate_args(until=time.time() + 600))
        rotator.cmd_rotate(_rotate_args(until=time.time() + 600))
        self.assertEqual([n[0] for n in self.notes], ["critical"])
        self.assertIn("Hết tài khoản Antigravity", self.notes[0][1])

    def test_second_bridge_sends_nothing(self):
        self.write(_pool())
        rotator.cmd_rotate(_rotate_args(account="someone-else@x.com"))
        self.assertEqual(self.notes, [])

    def test_manual_switch_notifies(self):
        self.write(_pool())
        self.assertEqual(rotator.cmd_switch(argparse.Namespace(email="p2@x.com")), 0)
        self.assertIn("(tay)", self.notes[0][1])
        self.assertIn("p2@x.com", self.notes[0][1])

    def test_notify_failure_never_breaks_rotation(self):
        self.patches[0].stop()
        try:
            with patch.object(rotator.subprocess, "run", side_effect=OSError("no python")):
                rotator.notify("info", "x")  # không raise
        finally:
            self.patches[0].start()

    def test_legacy_blocked_until_is_migrated(self):
        pool = _pool()
        pool["accounts"][3]["blocked_until"] = 123
        self.write(pool)
        acc = rotator.load_pool()["accounts"][3]
        self.assertEqual(acc["blocked"], {"image": 123, "text": 123})
        self.assertNotIn("blocked_until", acc)

    def test_reset_cooldown_keeps_disabled_unless_asked(self):
        pool = _pool()
        pool["accounts"][0].update(blocked={"image": 9e9, "text": 9e9}, disabled=True)
        self.write(pool)
        rotator.cmd_reset_cooldown(argparse.Namespace(email=None, include_disabled=False))
        self.assertEqual(self.acc("u1@x.com")["blocked"], {"image": 0, "text": 0})
        self.assertTrue(self.acc("u1@x.com")["disabled"])
        rotator.cmd_reset_cooldown(argparse.Namespace(email=None, include_disabled=True))
        self.assertNotIn("disabled", self.acc("u1@x.com"))


class ApplySessionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.jetski = root / ".gemini/jetski-standalone-oauth-token"
        self.storage = root / "app_storage.json"
        self.vscdb = root / "state.vscdb"
        self.jetski.parent.mkdir(parents=True)
        self.jetski.write_text('{"token": {"access_token": "old"}}')
        self.storage.write_text(json.dumps({"jetski.onboarding.lastLoginUsername": "old@x.com"}))
        conn = sqlite3.connect(self.vscdb)
        conn.execute("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)")
        conn.execute("INSERT INTO ItemTable VALUES (?, 'old-payload')", (rotator.VSCDB_KEY,))
        conn.commit()
        conn.close()
        self.calls = []
        self.patches = [
            patch.object(rotator, "JETSKI_TOKEN_PATH", self.jetski),
            patch.object(rotator, "APP_STORAGE_PATH", self.storage),
            patch.object(rotator, "VSCDB_PATH", self.vscdb),
            patch.object(rotator, "_systemctl", lambda *a: self.calls.append(a) or type("R", (), {"returncode": 0, "stderr": ""})()),
            patch.object(rotator, "wait_language_server", lambda timeout=0: True),
            patch.object(rotator, "_chown_app", lambda path: None),
        ]
        for p in self.patches:
            p.start()
        self.token = {"access_token": "new", "refresh_token": "r", "expiry_timestamp": int(time.time()) + 3600}

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def vscdb_value(self):
        conn = sqlite3.connect(self.vscdb)
        try:
            return conn.execute("SELECT value FROM ItemTable WHERE key=?", (rotator.VSCDB_KEY,)).fetchone()[0]
        finally:
            conn.close()

    def test_stops_before_writing_then_starts(self):
        rotator.apply_session("new-payload", self.token, "new@x.com")
        self.assertEqual(self.calls[0], ("stop", "antigravity"))
        self.assertEqual(self.calls[-1], ("start", "antigravity"))
        self.assertEqual(self.vscdb_value(), "new-payload")
        self.assertEqual(json.loads(self.jetski.read_text())["token"]["access_token"], "new")
        self.assertEqual(stat.S_IMODE(os.stat(self.jetski).st_mode), 0o600)
        self.assertRegex(json.loads(self.jetski.read_text())["token"]["expiry"], r"[+-]\d\d:\d\d$")
        self.assertEqual(json.loads(self.storage.read_text())["jetski.onboarding.lastLoginUsername"], "new@x.com")

    def test_failed_write_restores_old_session_and_restarts(self):
        def half_write(*args):
            self.jetski.write_text("half")
            raise RuntimeError("disk")

        with patch.object(rotator, "write_session", half_write):
            with self.assertRaises(RuntimeError):
                rotator.apply_session("new-payload", self.token, "new@x.com")
        self.assertEqual(json.loads(self.jetski.read_text())["token"]["access_token"], "old")
        self.assertEqual(self.vscdb_value(), "old-payload")
        self.assertEqual(self.calls[-1], ("start", "antigravity"))


if __name__ == "__main__":
    unittest.main()
