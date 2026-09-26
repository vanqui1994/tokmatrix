import tempfile
import unittest
import sqlite3
from pathlib import Path
from unittest.mock import patch

import httpx
from pydantic import ValidationError

from bkt_web.security import SecretStore, safe_child, validate_slug
from bkt_web.server import RenderTaskCreate, app
from bkt_web.facebook_engine import FacebookEngine
from bkt_web.facebook_routes import init_fb_db


class SecurityHelpersTest(unittest.TestCase):
    def test_secret_round_trip_and_stable_fingerprint(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SecretStore(Path(tmp) / "key")
            encrypted = store.encrypt("sessionid=secret")
            self.assertNotIn("sessionid=secret", encrypted)
            self.assertEqual(store.decrypt(encrypted), "sessionid=secret")
            self.assertEqual(store.fingerprint("x"), store.fingerprint("x"))
            encrypted_bytes = store.encrypt_bytes(b"sqlite-bytes")
            self.assertEqual(store.decrypt_bytes(encrypted_bytes), b"sqlite-bytes")

    def test_safe_child_rejects_parent_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                safe_child(Path(tmp), "../outside")

    def test_slug_validation(self):
        self.assertEqual(validate_slug("valid-video_01"), "valid-video_01")
        with self.assertRaises(ValueError):
            validate_slug("../../etc/passwd")


class ContractTest(unittest.TestCase):
    def test_render_contract_rejects_legacy_unknown_fields(self):
        with self.assertRaises(ValidationError):
            RenderTaskCreate.model_validate({"video_id": 1, "flip_horizontal": False})

    def test_render_contract_accepts_current_fields(self):
        item = RenderTaskCreate.model_validate({
            "video_id": 1,
            "task_name": "test",
            "flip": False,
            "color_adjust": False,
            "overlay_filename": None,
        })
        self.assertFalse(item.flip)
        self.assertFalse(item.color_adjust)


class FacebookSecurityTest(unittest.TestCase):
    def test_legacy_facebook_secrets_are_migrated(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "test.db"
            conn = sqlite3.connect(db_path)
            init_fb_db(conn)
            conn.execute(
                """
                INSERT INTO fb_accounts(uid,password,code2fa,cookie)
                VALUES('123','password','totpseed','c_user=123')
                """
            )
            conn.commit()
            init_fb_db(conn)
            row = conn.execute(
                "SELECT password,code2fa,cookie FROM fb_accounts WHERE uid='123'"
            ).fetchone()
            columns = {
                r[1] for r in conn.execute("PRAGMA table_info(fb_accounts)").fetchall()
            }
            conn.close()
            self.assertTrue(all(value.startswith("enc:v1:") for value in row))
            self.assertNotIn("c_user=123", " ".join(row))
            # Module đã chuyển sang VPN: cột proxy cũ còn đó nhưng không ai ghi nữa
            self.assertTrue({"vpn_config", "vpn_location", "country"} <= columns)

    def test_totp_is_generated_locally(self):
        secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        with patch("bkt_web.facebook_engine.time.time", return_value=59):
            self.assertEqual(FacebookEngine.get_2fa_code(secret), "287082")


class ApiSecurityTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_api_requires_bootstrap_session(self):
        response = await self.client.get("/api/channels")
        self.assertEqual(response.status_code, 401)

    async def test_channel_list_never_exposes_cookie(self):
        root = await self.client.get("/")
        self.assertEqual(root.status_code, 200)
        response = await self.client.get("/api/channels")
        self.assertEqual(response.status_code, 200)
        for channel in response.json().get("channels", []):
            self.assertNotIn("cookie", channel)

    async def test_settings_never_returns_secret_value(self):
        await self.client.get("/")
        response = await self.client.get("/api/settings")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("api_captcha"), "")


if __name__ == "__main__":
    unittest.main()
