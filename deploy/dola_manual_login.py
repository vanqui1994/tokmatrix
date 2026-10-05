"""Đăng nhập tay một tài khoản Dola vào profile của gateway (Google, Facebook, Apple, SĐT…).

Chạy trên VPS dưới user `dola`, trong thư mục gateway, trên màn hình Xvfb :1 (xem/điều khiển qua VNC):
  sudo systemd-run --uid=dola --gid=dola -p WorkingDirectory=/opt/dola-gateway \
      -p EnvironmentFile=/etc/dola-gateway/gateway.env --unit dola-login-acc1 \
      /opt/dola-gateway/venv/bin/python /opt/dola-gateway/manual_login.py acc1

Mở Chrome với đúng tham số gateway dùng (browser.LAUNCH_ARGS, ja-JP, Asia/Tokyo, DOLA_PROXY) ở
dola.com/chat. Chrome KHÔNG tự đóng khi thấy cookie `sessionid` (cookie có thể có trước khi đăng nhập
xong): chỉ đóng khi người dùng tự đóng cửa sổ, hoặc sau DOLA_LOGIN_MAX_HOURS (mặc định 3) để không treo mãi.

Trong lúc mở, tài khoản bị tắt Dispatch qua API admin của gateway (gateway không được mở cùng profile
để render: hai Chrome chung một profile làm hỏng phiên). Đóng cửa sổ mà đã đăng nhập → bật lại Dispatch
như trước và gọi Verify; chưa đăng nhập → để Dispatch tắt.
"""

import asyncio
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

from patchright.async_api import async_playwright

import config
from browser import LAUNCH_ARGS

MAX_SECONDS = float(os.environ.get("DOLA_LOGIN_MAX_HOURS", "3")) * 3600
ADMIN = f"http://127.0.0.1:{os.environ.get('DOLA_PORT', '8000')}/api/admin"


def admin(method: str, path: str, body=None, timeout: float = 15.0):
    """Gọi API admin của gateway đang chạy; lỗi (gateway tắt…) chỉ in ra, không dừng việc đăng nhập."""
    req = urllib.request.Request(
        ADMIN + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "X-Admin-Key": os.environ.get("DOLA_ADMIN_KEY", "")})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read() or b"{}")
    except Exception as exc:
        print(f"  (API admin {method} {path}: {exc})", flush=True)
        return None


def scheduling_of(name: str):
    data = admin("GET", "/accounts") or {}
    acc = next((a for a in data.get("accounts", []) if a.get("name") == name), None)
    return None if acc is None else bool(acc.get("scheduling"))


async def logged_in(ctx) -> bool:
    cookies = await ctx.cookies("https://www.dola.com")
    return any(c["name"] == "sessionid" and c["value"] for c in cookies)


async def main(name: str) -> int:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", name):
        print("Tên tài khoản chỉ gồm chữ, số, _ và -", flush=True)
        return 2
    profile = Path("accounts") / name
    profile.mkdir(parents=True, exist_ok=True)

    was_scheduling = scheduling_of(name)
    if was_scheduling is not False:
        admin("PATCH", f"/accounts/{name}", {"scheduling": False})
        print(f"[{name}] Tạm tắt Dispatch trong lúc đăng nhập", flush=True)

    kwargs = {"headless": False, "args": LAUNCH_ARGS, "locale": "ja-JP", "timezone_id": "Asia/Tokyo"}
    if config.PROXY:
        kwargs["proxy"] = {"server": config.PROXY}
    ok = False
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(str(profile), **kwargs)
        closed = asyncio.Event()
        ctx.on("close", lambda *_: closed.set())
        try:
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await page.goto("https://www.dola.com/chat", timeout=60000)
            print(f"[{name}] Chrome đã mở trên DISPLAY :1. Đăng nhập xong thì TỰ ĐÓNG cửa sổ Chrome "
                  f"(tối đa {MAX_SECONDS / 3600:g} giờ).", flush=True)
            deadline = time.monotonic() + MAX_SECONDS
            announced = False
            while not closed.is_set() and time.monotonic() < deadline:
                if not ctx.pages:          # người dùng đóng tab cuối cùng
                    break
                try:
                    ok = await logged_in(ctx)
                except Exception:          # context đang đóng
                    break
                if ok and not announced:
                    print(f"[{name}] Đã thấy phiên đăng nhập (sessionid). Làm nốt các bước còn lại rồi đóng cửa sổ.",
                          flush=True)
                    announced = True
                try:
                    await asyncio.wait_for(closed.wait(), timeout=2)
                except asyncio.TimeoutError:
                    pass
            if not closed.is_set() and ctx.pages:
                print(f"[{name}] Hết {MAX_SECONDS / 3600:g} giờ, đóng Chrome", flush=True)
            try:
                ok = await logged_in(ctx)
            except Exception:
                pass                       # đã đóng: dùng kết quả lần kiểm tra cuối
        finally:
            try:
                await ctx.close()
            except Exception:
                pass

    if ok:
        print(f"[{name}] ✓ Đã đăng nhập, phiên lưu trong {profile}", flush=True)
        if was_scheduling is not False:
            admin("PATCH", f"/accounts/{name}", {"scheduling": True})
        result = admin("POST", f"/accounts/{name}/verify", timeout=120)
        print(f"[{name}] Verify: {'Active ✓' if result and result.get('ok') else 'chưa xác nhận được, bấm Verify trên trang'}",
              flush=True)
        return 0
    print(f"[{name}] ✗ Chưa đăng nhập; Dispatch của {name} vẫn tắt", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "acc1")))
