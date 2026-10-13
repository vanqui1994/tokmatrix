"""Danh sách video công khai của một tài khoản TikTok, đọc như khách (guest).

Không cookie, không đăng nhập, không VPN: Chrome mở `tiktok.com/@user`,
để chính JS của TikTok ký và gọi `api/post/item_list`, rồi cuộn trang để lấy
các trang tiếp theo. Request HTTP trần (curl) không dùng được: sau lượt đầu
TikTok trả trang WAF "Please wait…" thay cho HTML có dữ liệu. Chrome headless
cũng chỉ được vài lượt rồi item_list trả HTTP 200 body rỗng (10/2026), nên mặc
định mở Chrome có cửa sổ (đặt ngoài màn hình) khi có màn hình; VPS không có
DISPLAY hoặc TOKMATRIX_GUEST_HEADLESS=1 thì chạy headless.

Mỗi item chứa `penaltyContext`, `CategoryType`, `diversificationId`
(xem `tiktok_metadata`). Hàm chỉ đọc, không ghi DB.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys

USERNAME = re.compile(r"^[A-Za-z0-9._]{2,24}$")
GUEST_SLOTS = asyncio.Semaphore(int(os.environ.get("TOKMATRIX_GUEST_SCAN_SLOTS", "2") or 2))


class GuestScanError(RuntimeError):
    pass


class GuestBlocked(GuestScanError):
    """item_list chỉ trả body rỗng: TikTok chặn mềm khách từ IP này (thử lại qua VPN của kênh)."""


def clean_username(value: str) -> str:
    name = (value or "").strip()
    match = re.search(r"tiktok\.com/@([^/?#]+)", name)
    if match:
        name = match.group(1)
    name = name.lstrip("@")
    if not USERNAME.match(name):
        raise GuestScanError("Username TikTok không hợp lệ")
    return name


def _headless() -> bool:
    forced = os.environ.get("TOKMATRIX_GUEST_HEADLESS", "").strip()
    if forced in ("0", "1"):
        return forced == "1"
    return sys.platform.startswith("linux") and not os.environ.get("DISPLAY")


def _chrome_path() -> str:
    try:
        from bkt_web import vpn_manager
        exe = getattr(vpn_manager, "CHROME_EXEC_PATH", "")
    except Exception:
        exe = ""
    return exe if exe and os.path.exists(exe) else ""


async def fetch_guest_items(username: str, max_items: int = 60, timeout: float = 90.0,
                            socks_port: int | None = None) -> dict:
    """Trả {username, items, pages, has_more}; GuestBlocked / GuestScanError nếu TikTok không trả item_list.

    `socks_port`: đi qua tunnel SOCKS (VPN của kênh) thay vì IP máy; vẫn không cookie.
    """
    from playwright.async_api import async_playwright

    username = clean_username(username)
    max_items = max(1, min(int(max_items or 60), 500))
    pages: list[dict] = []
    errors: list[str] = []
    empty = 0
    arrived = asyncio.Event()

    async def run():
        headless = _headless()
        args = ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        if not headless:
            args += ["--window-position=-2400,-2400", "--window-size=1280,900"]
        launch = {"headless": headless, "args": args}
        if socks_port:
            launch["proxy"] = {"server": f"socks5://127.0.0.1:{int(socks_port)}"}
        exe = _chrome_path()
        if exe:
            launch["executable_path"] = exe
        async with async_playwright() as p:
            browser = await p.chromium.launch(**launch)
            try:
                context = await browser.new_context(locale="en-US", viewport={"width": 1280, "height": 900})
                page = await context.new_page()

                async def on_response(response):
                    if "api/post/item_list" not in response.url:
                        return
                    nonlocal empty
                    try:
                        body = await response.body()
                        if not body:
                            empty += 1
                            errors.append(f"HTTP {response.status}: body rỗng (TikTok chặn mềm khách)")
                            arrived.set()
                            return
                        data = json.loads(body)
                    except Exception as exc:
                        errors.append(f"HTTP {response.status}: {str(exc)[:80]}")
                        arrived.set()
                        return
                    if isinstance(data, dict) and isinstance(data.get("itemList"), list):
                        pages.append(data)
                    else:
                        errors.append(f"HTTP {response.status}: phản hồi không có itemList")
                    arrived.set()

                page.on("response", on_response)
                try:
                    await page.goto(f"https://www.tiktok.com/@{username}", wait_until="domcontentloaded", timeout=40000)
                except Exception as exc:
                    errors.append(f"Không mở được trang: {str(exc)[:120]}")
                try:
                    await asyncio.wait_for(arrived.wait(), 20)
                except asyncio.TimeoutError:
                    return
                idle = 0
                while idle < 2 and sum(len(pg["itemList"]) for pg in pages) < max_items:
                    if pages and not pages[-1].get("hasMore"):
                        break
                    before = len(pages)
                    await page.mouse.wheel(0, 6000)
                    await page.wait_for_timeout(2500)
                    idle = idle + 1 if len(pages) == before else 0
            except Exception as exc:  # cửa sổ bị đóng / Chrome thoát: giữ các trang đã nhận
                errors.append(f"Chrome dừng giữa chừng: {str(exc)[:120]}")
            finally:
                try:
                    await browser.close()
                except Exception:
                    pass

    async with GUEST_SLOTS:
        try:
            await asyncio.wait_for(run(), timeout)
        except asyncio.TimeoutError:
            errors.append("Hết giờ chờ")
    if not pages and empty and empty == len(errors):
        raise GuestBlocked(f"TikTok chặn mềm khách ({empty} lần item_list body rỗng)")
    if not pages:
        raise GuestScanError("TikTok không trả danh sách video cho khách"
                             + (f" ({'; '.join(errors[:3])})" if errors else " (có thể bị captcha hoặc kênh riêng tư)"))
    seen, items = set(), []
    for data in pages:
        for item in data["itemList"]:
            vid = str(item.get("id") or "")
            author = ((item.get("author") or {}).get("uniqueId") or "").lower()
            if vid and vid not in seen and (not author or author == username.lower()):
                seen.add(vid)
                items.append(item)
    return {"username": username, "items": items[:max_items], "pages": len(pages),
            "has_more": bool(pages[-1].get("hasMore"))}
