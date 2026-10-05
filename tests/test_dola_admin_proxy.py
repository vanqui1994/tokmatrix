"""Trang quản trị gateway qua TokMatrix: chỉ chuyển tiếp tới gateway trong pool, đúng 3 nhóm đường dẫn."""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import dola_accounts as da
from bkt_web import dola_admin_proxy as proxy
from bkt_web import dola_routes as dr

PAGE = "<!DOCTYPE html><html><head><title>Dola Pool Dashboard</title></head><body>x</body></html>"


class Chunks(httpx.AsyncByteStream):
    """Thân response dạng stream như mạng thật (content=bytes thì httpx đọc sẵn hết)."""

    def __init__(self, data: bytes):
        self.data = data

    async def __aiter__(self):
        yield self.data


class Gateway:
    def __init__(self):
        self.seen = []

    def __call__(self, req: httpx.Request):
        self.seen.append((req.method, req.url.path, req.headers.get("x-admin-key"), req.headers.get("range"),
                          req.content))
        if req.url.path == "/":
            return httpx.Response(200, text=PAGE, headers={"content-type": "text/html"})
        if req.url.path.startswith("/videos/"):
            if req.headers.get("range"):
                return httpx.Response(206, stream=Chunks(b"ab"),
                                      headers={"content-type": "video/mp4", "content-range": "bytes 0-1/4"})
            return httpx.Response(200, stream=Chunks(b"abcd"), headers={"content-type": "video/mp4"})
        if req.url.path == "/api/admin/accounts" and req.headers.get("x-admin-key") != "adm":
            return httpx.Response(401, json={"detail": "invalid admin key"})
        return httpx.Response(200, json={"ok": True, "path": req.url.path, "q": str(req.url.query, "ascii")})


class AdminProxyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (dr.DB_PATH, dr.accounts_override)
        dr.DB_PATH = Path(self.tmp.name) / "db.sqlite"
        dr.accounts_override = [
            da.DolaAccountConfig(id="acc_01", base_url="http://gw1", admin_key="adm"),
            da.DolaAccountConfig(id="acc_02", base_url="http://gw1"),          # cùng gateway → 1 nút
            da.DolaAccountConfig(id="acc_03", base_url="http://gw3"),
        ]
        self.gw = Gateway()
        transport = httpx.MockTransport(self.gw)
        real_client, real_async, real_get = httpx.Client, httpx.AsyncClient, httpx.get
        self.patches = [
            mock.patch.object(proxy.httpx, "get", lambda url, **kw: real_client(transport=transport).get(url, **kw)),
            mock.patch.object(proxy.httpx, "AsyncClient",
                              lambda **kw: real_async(transport=httpx.MockTransport(self.gw), **kw)),
            mock.patch.dict("os.environ", {"DOLA_ADMIN_KEY": ""}),
            # Kho Khoá thật (VPS có video.dola_admin) không được lọt vào test.
            mock.patch("bkt_web.key_vault.get_key", lambda name: ""),
        ]
        for p in self.patches:
            p.start()
        app = FastAPI()
        app.include_router(proxy.router)
        self.api = TestClient(app)

    def tearDown(self):
        for p in self.patches:
            p.stop()
        dr.DB_PATH, dr.accounts_override = self.saved
        dr._managers.clear()
        self.tmp.cleanup()

    def test_offline_gateway_shows_explanation_not_5xx(self):
        def down(req):
            raise httpx.ConnectError("Connection refused")
        real_client = httpx.Client
        with mock.patch.object(proxy.httpx, "get",
                               lambda url, **kw: real_client(transport=httpx.MockTransport(down)).get(url, **kw)):
            res = self.api.get("/api/dola/gw/acc_03/")
        self.assertEqual(res.status_code, 200)              # 5xx thì Cloudflare thay bằng trang của nó
        self.assertEqual(res.headers["x-dola-gateway"], "offline")
        self.assertIn("Gateway Dola chưa chạy", res.text)
        self.assertIn("http://gw3", res.text)

    def test_gateways_one_button_per_base_url(self):
        gws = self.api.get("/api/dola/gateways").json()["gateways"]
        self.assertEqual([(g["id"], g["has_admin_key"]) for g in gws], [("acc_01", True), ("acc_03", False)])
        self.assertEqual(gws[0]["url"], "/api/dola/gw/acc_01/")

    def test_page_is_the_gateway_page_with_shim(self):
        res = self.api.get("/api/dola/gw/acc_01/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("<title>Dola Pool Dashboard</title>", res.text)
        self.assertIn('const P="/api/dola/gw/acc_01"', res.text)
        self.assertLess(res.text.index("const P="), res.text.index("<title>"))   # shim chạy trước script của trang
        self.assertEqual(res.headers["cache-control"], "no-store")

    def test_unknown_gateway_and_bad_paths_rejected(self):
        self.assertEqual(self.api.get("/api/dola/gw/evil/").status_code, 404)
        self.assertEqual(self.api.get("/api/dola/gw/evil/api/admin/stats").status_code, 404)
        self.assertEqual(self.api.get("/api/dola/gw/acc_01/api/admin/a/../../health").status_code, 404)
        self.assertEqual(self.api.get("/api/dola/gw/acc_01/videos/x.sh").status_code, 400)
        self.assertEqual(self.api.get("/api/dola/gw/acc_01/api/admin/a%3Fb").status_code, 400)

    def test_admin_key_server_fallback_and_browser_override(self):
        res = self.api.get("/api/dola/gw/acc_01/api/admin/accounts")            # khoá ở server
        self.assertEqual(res.status_code, 200)
        res = self.api.get("/api/dola/gw/acc_03/api/admin/accounts")            # không khoá → 401 như gateway
        self.assertEqual(res.status_code, 401)
        res = self.api.get("/api/dola/gw/acc_03/api/admin/accounts", headers={"X-Admin-Key": "adm"})
        self.assertEqual(res.status_code, 200)

    def test_methods_body_and_query_forwarded(self):
        res = self.api.patch("/api/dola/gw/acc_01/api/admin/keys/sk-1", json={"enabled": False})
        self.assertEqual(res.json()["path"], "/api/admin/keys/sk-1")
        self.assertEqual(self.gw.seen[-1][0], "PATCH")
        self.assertEqual(self.gw.seen[-1][4], b'{"enabled":false}')
        self.assertEqual(self.api.get("/api/dola/gw/acc_01/api/admin/tasks?limit=50").json()["q"], "limit=50")
        self.assertEqual(self.api.delete("/api/dola/gw/acc_01/api/admin/accounts/acc9").status_code, 200)

    def test_video_stream_with_range(self):
        res = self.api.get("/api/dola/gw/acc_01/videos/fox.mp4")
        self.assertEqual((res.status_code, res.content), (200, b"abcd"))
        res = self.api.get("/api/dola/gw/acc_01/videos/fox.mp4", headers={"Range": "bytes=0-1"})
        self.assertEqual((res.status_code, res.content, res.headers["content-range"]), (206, b"ab", "bytes 0-1/4"))


if __name__ == "__main__":
    unittest.main()
