"""Hỏi bot @tiktok_check_video_bot qua Telegram Web (không cần api_id/api_hash).

my.telegram.org không tạo được app (26/09) nên thay Telethon bằng trình duyệt: một profile Chrome
riêng đăng nhập Telegram Web một lần (quét QR trên màn hình ảo, xem qua noVNC /vnc/), sau đó mỗi
lần kiểm: mở chat với bot → dán link video → chờ tin trả lời có "Shadowban"/"Trùng lặp" → đọc chữ
và link "VIDEO GỐC" → tiktok_dup_bot.parse_reply.

    python3 -m bkt_web.telegram_web_checker login       # mở Telegram Web trên DISPLAY, chờ quét QR (10 phút)
    python3 -m bkt_web.telegram_web_checker status
    python3 -m bkt_web.telegram_web_checker check <link video>
    python3 -m bkt_web.telegram_web_checker snapshot    # ảnh chụp chat với bot (gỡ lỗi)
"""
from __future__ import annotations

import argparse
import asyncio
import fcntl
import json
import os
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
PROFILE_DIR = BASE_DIR / "storage" / "telegram_web_profile"
LOCK_PATH = BASE_DIR / "storage" / "telegram_web.lock"
STATE_PATH = BASE_DIR / "storage" / "telegram_web_state.json"
DEBUG_DIR = BASE_DIR / "storage" / "publish_debug"
BOT = "tiktok_check_video_bot"
HOME_URL = "https://web.telegram.org/k/"
CHAT_URL = f"https://web.telegram.org/k/#@{BOT}"
REPLY_TIMEOUT = 120

# Telegram Web K: đã đăng nhập khi có danh sách chat; chưa thì trang hiện mã QR.
LOGGED_IN = "#column-left .chatlist, #column-left .input-search"
LOGIN_PAGE = ".qr-container canvas, .auth-image, #auth-pages"
INPUT = "div.input-message-input[contenteditable='true']:not(.input-field-input-fake)"
START_LABELS = ("start", "bắt đầu", "khởi động")


def _chrome_path() -> Optional[str]:
    return os.environ.get("TOKMATRIX_CHROME_PATH") or None


@contextmanager
def _lock():
    """Một profile chỉ mở được một lần: xếp hàng các lượt kiểm (tối đa 5 phút)."""
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_PATH, "w") as handle:
        deadline = time.time() + 300
        while True:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.time() > deadline:
                    raise TimeoutError("Telegram Web đang bận (một lượt kiểm khác chưa xong)")
                time.sleep(2)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _state() -> Dict[str, Any]:
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save_state(**values: Any) -> None:
    state = {**_state(), **values}
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


def logged_in() -> bool:
    """Lần đăng nhập gần nhất còn hiệu lực (theo lượt mở cuối)."""
    return bool(_state().get("logged_in")) and PROFILE_DIR.exists()


async def _open(playwright, headless: bool = False):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    return await playwright.chromium.launch_persistent_context(
        str(PROFILE_DIR),
        executable_path=_chrome_path(),
        headless=headless,
        viewport={"width": 1280, "height": 860},
        locale="vi-VN",
        args=["--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"],
    )


async def _is_logged_in(page, wait_ms: int = 15000) -> bool:
    try:
        await page.wait_for_selector(f"{LOGGED_IN}, {LOGIN_PAGE}", timeout=wait_ms)
    except Exception:
        return False
    return await page.locator(LOGGED_IN).count() > 0


async def _login(timeout_seconds: int = 600) -> str:
    from playwright.async_api import async_playwright

    with _lock():
        async with async_playwright() as p:
            context = await _open(p, headless=False)
            try:
                page = context.pages[0] if context.pages else await context.new_page()
                await page.goto(HOME_URL, wait_until="domcontentloaded", timeout=60000)
                if await _is_logged_in(page):
                    _save_state(logged_in=True, login_at=int(time.time()))
                    return "Đã đăng nhập sẵn."
                print("Mở noVNC (/vnc/) và quét mã QR trên màn hình bằng app Telegram: "
                      "Cài đặt → Thiết bị → Liên kết thiết bị.", flush=True)
                deadline = time.time() + timeout_seconds
                while time.time() < deadline:
                    if await page.locator(LOGGED_IN).count():
                        await page.wait_for_timeout(5000)  # để Telegram Web ghi xong phiên vào profile
                        _save_state(logged_in=True, login_at=int(time.time()))
                        return "Đăng nhập Telegram Web thành công."
                    await page.wait_for_timeout(2000)
                raise TimeoutError("Chưa quét mã QR trong thời gian chờ")
            finally:
                await context.close()


async def _bubbles(page) -> List[Dict[str, Any]]:
    # Telegram Web vẽ emoji thành <img alt="✅">: innerText làm mất ✅/❌ — mà bot dùng đúng hai emoji đó
    # cho Shadowban/Trùng lặp ở câu trả lời theo kênh. Nhân bản tin, thay ảnh emoji bằng alt, bỏ giờ gửi.
    return await page.evaluate(r"""() => Array.from(document.querySelectorAll('.bubbles-inner .bubble[data-mid]')).map(b => {
        const src = b.querySelector('.message, .translatable-message') || b;
        const copy = src.cloneNode(true);
        copy.querySelectorAll('img.emoji, img[alt]').forEach(img => img.replaceWith(document.createTextNode(img.alt || '')));
        copy.querySelectorAll('.time, .time-inner, .reactions').forEach(el => el.remove());
        copy.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
        return {
            mid: Number(b.dataset.mid) || 0,
            incoming: b.classList.contains('is-in'),
            text: copy.textContent || '',
            links: Array.from(src.querySelectorAll('a[href]')).map(a => a.href),
        };
    })""")


async def _ask(url: str, reply_timeout: int = REPLY_TIMEOUT) -> Dict[str, Any]:
    from playwright.async_api import async_playwright
    from bkt_web.tiktok_dup_bot import parse_reply

    with _lock():
        async with async_playwright() as p:
            context = await _open(p, headless=False)
            page = None
            try:
                page = context.pages[0] if context.pages else await context.new_page()
                await page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60000)
                if not await _is_logged_in(page, 30000):
                    _save_state(logged_in=False)
                    raise RuntimeError("Telegram Web chưa đăng nhập / phiên hết hạn — chạy telegram_web_checker login")
                # Lần đầu nói chuyện với bot: ô nhập bị thay bằng nút START.
                for label in START_LABELS:
                    button = page.get_by_role("button", name=label, exact=False)
                    if await button.count() and await button.first.is_visible():
                        await button.first.click()
                        await page.wait_for_timeout(1500)
                        break
                await page.wait_for_selector(INPUT, timeout=30000)
                await page.wait_for_timeout(1500)
                before = max((b["mid"] for b in await _bubbles(page)), default=0)
                box = page.locator(INPUT).last
                await box.click()
                await box.fill(url)
                await page.keyboard.press("Enter")
                deadline = time.time() + reply_timeout
                while time.time() < deadline:
                    await page.wait_for_timeout(2500)
                    for bubble in await _bubbles(page):
                        if bubble["mid"] <= before or not bubble["incoming"]:
                            continue
                        text = bubble["text"]
                        if "shadowban" not in text.lower() and "trùng" not in text.lower():
                            continue  # "đang kiểm tra…"
                        _save_state(logged_in=True, last_check_at=int(time.time()))
                        return {**parse_reply(text, bubble["links"]), "raw": text}
                raise TimeoutError(f"Bot không trả lời trong {reply_timeout}s")
            except Exception:
                if page is not None:
                    try:
                        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
                        await page.screenshot(path=str(DEBUG_DIR / f"telegram_web_error_{int(time.time())}.png"))
                    except Exception:
                        pass
                raise
            finally:
                await context.close()


async def _collect(text: str, wait_seconds: int = 90, quiet_seconds: int = 20) -> List[Dict[str, Any]]:
    """Gửi `text` cho bot rồi gom MỌI tin bot trả lời, dừng khi im lặng `quiet_seconds` (sau tin đầu)."""
    from playwright.async_api import async_playwright

    with _lock():
        async with async_playwright() as p:
            context = await _open(p, headless=False)
            try:
                page = context.pages[0] if context.pages else await context.new_page()
                await page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60000)
                if not await _is_logged_in(page, 30000):
                    raise RuntimeError("Telegram Web chưa đăng nhập")
                await page.wait_for_selector(INPUT, timeout=30000)
                await page.wait_for_timeout(1500)
                before = max((b["mid"] for b in await _bubbles(page)), default=0)
                box = page.locator(INPUT).last
                await box.click()
                await box.fill(text)
                await page.keyboard.press("Enter")
                seen: Dict[int, Dict[str, Any]] = {}
                deadline, last_new = time.time() + wait_seconds, None
                while time.time() < deadline:
                    await page.wait_for_timeout(2500)
                    for bubble in await _bubbles(page):
                        if bubble["mid"] > before and bubble["incoming"]:
                            if bubble["mid"] not in seen or seen[bubble["mid"]]["text"] != bubble["text"]:
                                last_new = time.time()
                            seen[bubble["mid"]] = bubble
                    if last_new and time.time() - last_new > quiet_seconds:
                        break
                return [seen[k] for k in sorted(seen)]
            finally:
                await context.close()


async def _snapshot() -> str:
    from playwright.async_api import async_playwright

    with _lock():
        async with async_playwright() as p:
            context = await _open(p, headless=False)
            try:
                page = context.pages[0] if context.pages else await context.new_page()
                await page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(6000)
                DEBUG_DIR.mkdir(parents=True, exist_ok=True)
                shot = DEBUG_DIR / f"telegram_web_{int(time.time())}.png"
                await page.screenshot(path=str(shot))
                return str(shot)
            finally:
                await context.close()


def check_url(url: str) -> Dict[str, Any]:
    return asyncio.run(_ask(url))


def ask_channel(username: str, wait_seconds: int = 150) -> Dict[str, Any]:
    """Gửi link kênh, trả {"text", "links"} của tin bot liệt kê video gần nhất của kênh."""
    bubbles = asyncio.run(_collect(f"https://www.tiktok.com/@{username.lstrip('@')}", wait_seconds))
    for bubble in reversed(bubbles):
        if "username" in bubble["text"].lower() and "#1" in bubble["text"]:
            _save_state(logged_in=True, last_check_at=int(time.time()))
            return {"text": bubble["text"], "links": bubble["links"]}
    for bubble in reversed(bubbles):
        if "username" in bubble["text"].lower():
            return {"text": bubble["text"], "links": bubble["links"]}  # kênh chưa có video
    raise TimeoutError("Bot không trả thông tin kênh" + (f": {bubbles[-1]['text'][:200]}" if bubbles else ""))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    login = sub.add_parser("login")
    login.add_argument("--timeout", type=int, default=600)
    sub.add_parser("status")
    chk = sub.add_parser("check")
    chk.add_argument("url")
    sub.add_parser("snapshot")
    raw = sub.add_parser("raw")
    raw.add_argument("text")
    raw.add_argument("--wait", type=int, default=120)
    args = parser.parse_args(argv)
    if args.cmd == "login":
        print(asyncio.run(_login(args.timeout)))
    elif args.cmd == "status":
        print(json.dumps({"logged_in": logged_in(), **_state()}, ensure_ascii=False))
    elif args.cmd == "check":
        print(json.dumps(check_url(args.url), ensure_ascii=False, indent=2))
    elif args.cmd == "raw":
        for bubble in asyncio.run(_collect(args.text, args.wait)):
            print(f"--- tin {bubble['mid']} ---\n{bubble['text']}\nlinks: {bubble['links']}")
    elif args.cmd == "snapshot":
        print(asyncio.run(_snapshot()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
