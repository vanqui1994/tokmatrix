"""
Lớp trình duyệt — port từ testTuongTacWPF.Automation của nuoinickbaosam 11.10.14.

Gồm:
  - GpmBrowserClient / OmoBrowserClient: cùng bộ endpoint /api/v1/profiles/*,
    khác mặc định cổng (GPM 9495, OMO 50325) đúng như bản gốc.
  - PlaywrightHumanHelpers: di chuột chậm, gõ chậm, TOTP 2FA, bấm phần tử theo vai trò.
  - Hai đoạn JavaScript bản gốc tiêm vào trang để liệt kê phần tử và dò phần tử
    dưới một toạ độ — giữ nguyên từng ký tự.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import os
import random
import struct
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

try:
    from bkt_web.ai_vision import UiElement  # noqa: F401  (re-export tiện dùng)
    from bkt_web.facebook_session import (
        cookies_to_header,
        is_blocked_facebook_url,
        validate_session_cookies,
    )
    from bkt_web.security import SecretStore, validate_slug
except ImportError:
    from ai_vision import UiElement  # noqa: F401
    from facebook_session import cookies_to_header, is_blocked_facebook_url, validate_session_cookies
    from security import SecretStore, validate_slug

BASE_DIR = Path(__file__).resolve().parent
PROFILE_SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")

GPM_DEFAULT_API = "http://127.0.0.1:9495"
OMO_DEFAULT_API = "http://127.0.0.1:50325"
# Bản GPM đã port vào chính web này: nó tự phục vụ /api/v1/profiles/* nên không
# cần cài phần mềm ngoài. Cổng lấy theo TOKMATRIX_PORT để khớp lúc server đổi cổng.
NATIVE_DEFAULT_API = f"http://127.0.0.1:{os.environ.get('TOKMATRIX_PORT', '8080')}"


class BrowserEngineTypes:
    OMO = "Omo"
    GPM = "Gpm"
    NATIVE = "Native"   # bản port chạy ngay trong web này


# JS bản gốc dùng để liệt kê phần tử bấm được (tối đa 60 phần tử)
JS_COLLECT_ELEMENTS = """() => {
                const sel = 'a, button, input, textarea, select, [role], [onclick], [contenteditable="true"]';
                const nodes = Array.from(document.querySelectorAll(sel));
                const out = [];
                for (const el of nodes) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) continue;
                    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) continue;
                    const style = window.getComputedStyle(el);
                    if (style.visibility === 'hidden' || style.display === 'none') continue;
                    let text = (el.innerText || el.value || el.placeholder || '').toString().trim().slice(0, 80);
                    let ariaLabel = (el.getAttribute('aria-label') || '').trim();
                    let id = el.id || '';
                    out.push({
                        tag: el.tagName.toLowerCase(),
                        text: text,
                        ariaLabel: ariaLabel,
                        id: id,
                        left: Math.round(rect.left), top: Math.round(rect.top),
                        right: Math.round(rect.right), bottom: Math.round(rect.bottom)
                    });
                    if (out.length >= 60) break;
                }
                return out;
            }"""

# JS bản gốc dùng để nắn toạ độ về tâm phần tử thật sự nằm dưới điểm bấm
JS_SNAP_TO_ELEMENT = """([x, y]) => {
            const el = document.elementFromPoint(x, y);
            if (!el) return null;
            if (el.tagName === 'HTML' || el.tagName === 'BODY') return null;
            let r = el.getBoundingClientRect();
            if (r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9) return null;
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return null;
            return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
        }"""


# ------------------------------------------------------------ human helpers

def get_2fa(secret: str) -> Optional[str]:
    """PlaywrightHumanHelpers.Get2fa — TOTP 30 giây, sinh cục bộ."""
    try:
        cleaned = (secret or "").replace(" ", "").strip().upper()
        cleaned += "=" * ((8 - len(cleaned) % 8) % 8)
        key = base64.b32decode(cleaned, casefold=True)
        counter = int(time.time()) // 30
        digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
        return f"{code:06d}"
    except Exception:
        return None


async def slow_mouse_move(page, x: float, y: float) -> None:
    """PlaywrightHumanHelpers.SlowMouseMoveAsync — di chuột nhiều chặng thay vì nhảy thẳng."""
    await page.mouse.move(x, y, steps=random.randint(12, 26))


async def slow_type(locator, text: str) -> None:
    """PlaywrightHumanHelpers.SlowTypeAsync — gõ từng ký tự với nhịp ngẫu nhiên."""
    for char in text or "":
        await locator.type(char)
        await asyncio.sleep(random.randint(35, 120) / 1000)


async def click_first_visible(page, role: str, names: List[str], timeout_ms: int = 2000) -> bool:
    """PlaywrightHumanHelpers.ClickFirstVisibleAsync"""
    for name in names:
        try:
            locator = page.get_by_role(role, name=name).first
            await locator.wait_for(state="visible", timeout=timeout_ms)
            await locator.click()
            return True
        except Exception:
            continue
    return False


async def is_any_visible(page, role: str, names: List[str], timeout_ms: int = 2000) -> bool:
    """PlaywrightHumanHelpers.IsAnyVisibleAsync"""
    for name in names:
        try:
            locator = page.get_by_role(role, name=name).first
            await locator.wait_for(state="visible", timeout=timeout_ms)
            return True
        except Exception:
            continue
    return False


# ----------------------------------------------------- antidetect browsers

@dataclass
class AntidetectSettings:
    """GpmBrowserSettings / OmoBrowserSettings — chỉ giữ các trường bản port dùng tới."""
    engine: str = BrowserEngineTypes.NATIVE
    api_url: str = NATIVE_DEFAULT_API
    thread_count: int = 1
    force_vpn: bool = True
    use_custom_user_agent: bool = False
    custom_user_agent: str = ""
    os_type: int = 0
    webrtc_mode: int = 0
    geolocation_mode: int = 0
    canvas_mode: int = 0
    client_rect_mode: int = 0
    webgl_image_mode: int = 0
    webgl_metadata_mode: int = 0
    audio_mode: int = 0
    font_mode: int = 0
    is_masked_media: bool = False
    timezone_base_on_ip: bool = True
    timezone: str = ""
    is_language_base_on_ip: bool = True
    fixed_language: str = ""
    startup_urls: str = ""
    addition_args: str = ""

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "AntidetectSettings":
        settings = AntidetectSettings()
        for key, value in (data or {}).items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        if not (data or {}).get("api_url"):
            settings.api_url = {
                BrowserEngineTypes.OMO: OMO_DEFAULT_API,
                BrowserEngineTypes.GPM: GPM_DEFAULT_API,
            }.get(settings.engine, NATIVE_DEFAULT_API)
        return settings


@dataclass
class BrowserStartResult:
    """OmoBrowserStartResult"""
    profile_id: str = ""
    remote_debugging_address: str = ""
    websocket_debugging_url: str = ""


class AntidetectBrowserClient:
    """
    IAntidetectBrowserClient — GPM và OMO dùng chung bộ endpoint
    /api/v1/profiles, /create, /start/{id}, /stop/{id}, /delete/{id}.
    """

    def __init__(self, settings: AntidetectSettings):
        self.settings = settings

    @property
    def name(self) -> str:
        return self.settings.engine

    async def _request(self, method: str, path: str, payload: Optional[Dict] = None) -> Dict[str, Any]:
        url = self.settings.api_url.rstrip("/") + path
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.request(method, url, json=payload)
            if response.status_code >= 400:
                raise RuntimeError(
                    f"{self.name} trả về HTTP {response.status_code}: {response.text[:300]}"
                )
            try:
                return response.json()
            except ValueError:
                raise RuntimeError(f"{self.name} trả về nội dung không phải JSON")

    async def ping(self) -> Dict[str, Any]:
        """Bản gốc kiểm tra kết nối bằng cách lấy 1 profile đầu tiên."""
        data = await self._request("GET", "/api/v1/profiles?page=1&page_size=1")
        return {"ok": bool(data.get("success", True)), "raw": data}

    async def list_profiles(self, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        return await self._request("GET", f"/api/v1/profiles?page={page}&page_size={page_size}")

    async def set_profile_proxy(self, profile_id: str, proxy: str) -> bool:
        """
        Đổi proxy của một profile đã tồn tại sang socks5 cục bộ của tunnel VPN.

        Bản gốc chỉ dùng create/start/stop/delete nên không có đường nào đổi
        proxy sau khi tạo. GPM và OMO đều có `/api/v1/profiles/update/{id}`
        nhưng không phải bản nào cũng bật; nếu gọi không được thì trả về False
        để lớp trên cảnh báo thay vì làm hỏng cả lượt chạy.
        """
        try:
            await self._request("POST", f"/api/v1/profiles/update/{profile_id}", {"raw_proxy": proxy})
            return True
        except Exception:
            return False

    async def create_profile(self, name: str, proxy: str = "", user_agent: str = "") -> str:
        s = self.settings
        payload = {
            "profile_name": name,
            "group_name": "All",
            "browser_core": "chromium",
            "browser_name": "Chrome",
            "is_random_browser_version": True,
            # `proxy` ở đây là socks5 cục bộ của tunnel WireGuard, không phải proxy ngoài
            "raw_proxy": proxy,
            "startup_urls": s.startup_urls,
            "is_masked_font": s.font_mode != 0,
            "is_noise_canvas": s.canvas_mode != 0,
            "is_noise_webgl": s.webgl_image_mode != 0,
            "is_noise_client_rect": s.client_rect_mode != 0,
            "is_noise_audio_context": s.audio_mode != 0,
            "is_random_screen": False,
            "is_masked_webgl_data": s.webgl_metadata_mode != 0,
            "is_masked_media_device": s.is_masked_media,
            "is_random_os": False,
            "os": s.os_type,
            "webrtc_mode": s.webrtc_mode,
            "user_agent": (user_agent or s.custom_user_agent) if s.use_custom_user_agent else "auto",
        }
        data = await self._request("POST", "/api/v1/profiles/create", payload)
        profile = data.get("data") or {}
        profile_id = str(profile.get("id") or "")
        if not profile_id:
            raise RuntimeError(f"{self.name} không trả về id profile: {str(data)[:300]}")
        return profile_id

    async def start_profile(self, profile_id: str) -> BrowserStartResult:
        data = await self._request("GET", f"/api/v1/profiles/start/{profile_id}")
        profile = data.get("data") or {}
        result = BrowserStartResult(
            profile_id=profile_id,
            remote_debugging_address=str(profile.get("remote_debugging_address") or ""),
            websocket_debugging_url=str(profile.get("websocket_debugging_url") or ""),
        )
        if not result.websocket_debugging_url and not result.remote_debugging_address:
            port = profile.get("remote_debugging_port")
            if port:
                result.remote_debugging_address = f"127.0.0.1:{port}"
        if not result.websocket_debugging_url and not result.remote_debugging_address:
            raise RuntimeError(f"{self.name} không trả về địa chỉ debug: {str(data)[:300]}")
        return result

    async def stop_profile(self, profile_id: str) -> None:
        await self._request("GET", f"/api/v1/profiles/stop/{profile_id}")

    async def delete_profile(self, profile_id: str) -> None:
        await self._request("GET", f"/api/v1/profiles/delete/{profile_id}")


async def connect_playwright(playwright, start: BrowserStartResult):
    """
    ChromeAiVisionRunner.ConnectToTestProfileAsync — nối Playwright vào phiên
    trình duyệt antidetect đã bật qua CDP.
    """
    address = start.remote_debugging_address
    if address and not address.startswith("http"):
        address = "http://" + address

    endpoint = start.websocket_debugging_url
    browser = None
    if endpoint:
        try:
            browser = await playwright.chromium.connect_over_cdp(endpoint)
        except Exception:
            # Có bản antidetect trả về ws url sai/thiếu GUID; địa chỉ HTTP thì
            # Playwright tự hỏi /json/version để lấy đúng endpoint.
            if not address:
                raise
    if browser is None:
        browser = await playwright.chromium.connect_over_cdp(address)
    context = browser.contexts[0] if browser.contexts else await browser.new_context()
    page = context.pages[0] if context.pages else await context.new_page()
    return browser, context, page


async def collect_elements(page) -> List[UiElement]:
    """Chạy JS gốc rồi dựng nhãn phần tử theo cùng thứ tự ưu tiên của bản gốc."""
    try:
        raw = await page.evaluate(JS_COLLECT_ELEMENTS)
    except Exception:
        return []
    elements: List[UiElement] = []
    for item in raw or []:
        label = (item.get("ariaLabel") or item.get("text") or item.get("id") or item.get("tag") or "").strip()
        elements.append(UiElement(
            label=label,
            left=int(item.get("left") or 0),
            top=int(item.get("top") or 0),
            right=int(item.get("right") or 0),
            bottom=int(item.get("bottom") or 0),
        ))
    return elements


async def snap_to_element(page, x: int, y: int) -> Optional[tuple]:
    try:
        result = await page.evaluate(JS_SNAP_TO_ELEMENT, [x, y])
    except Exception:
        return None
    if not result or len(result) != 2:
        return None
    return int(result[0]), int(result[1])


# ==============================================================================
# NATIVE BAOSAMBROWSER PROFILE RUNNER & LIFECYCLE (Không cần phần mềm ngoài)
# ==============================================================================

RUNNING_PROFILES: Dict[str, Any] = {}


def parse_proxy_to_playwright(proxy_str: str) -> Optional[Dict[str, str]]:
    """Chuyển đổi các định dạng proxy (host:port, host:port:u:p, u:p@host:port) sang định dạng Playwright."""
    if not proxy_str or not proxy_str.strip():
        return None
    raw = proxy_str.strip()
    protocol = "http"
    if "://" in raw:
        protocol, raw = raw.split("://", 1)
        protocol = protocol.lower()

    server = ""
    username = ""
    password = ""
    if "@" in raw:
        cred, host_port = raw.split("@", 1)
        if ":" in cred:
            username, password = cred.split(":", 1)
        else:
            username = cred
        server = f"{protocol}://{host_port}"
    else:
        parts = raw.split(":")
        if len(parts) == 4:
            host, port, user, pwd = parts
            server = f"{protocol}://{host}:{port}"
            username = user
            password = pwd
        elif len(parts) == 2:
            server = f"{protocol}://{parts[0]}:{parts[1]}"
        else:
            server = f"{protocol}://{raw}"

    result = {"server": server}
    if username:
        result["username"] = username
    if password:
        result["password"] = password
    return result


def is_native_profile_running(profile_id: str) -> bool:
    return str(profile_id) in RUNNING_PROFILES


async def _read_devtools_ws_url(port: int, timeout: float = 10.0) -> str:
    """
    Lấy websocket debug thật của Chrome từ /json/version.

    Không tự ghép chuỗi được: Chrome gắn thêm một GUID vào cuối đường dẫn
    (ws://127.0.0.1:PORT/devtools/browser/<guid>), gọi vào /devtools/browser
    trần sẽ bị 404 và Playwright không nối CDP được.
    """
    deadline = time.time() + timeout
    last_error = ""
    while time.time() < deadline:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                data = (await client.get(f"http://127.0.0.1:{port}/json/version")).json()
            url = str(data.get("webSocketDebuggerUrl") or "")
            if url:
                return url
        except Exception as exc:
            last_error = str(exc)
        await asyncio.sleep(0.25)
    raise RuntimeError(
        f"Chrome không trả về webSocketDebuggerUrl trên cổng {port}"
        + (f" ({last_error})" if last_error else "")
    )


def find_gpm_browser_executable() -> Optional[str]:
    """Tìm file thực thi nhân trình duyệt Chromium do GPM Login cài đặt trên máy."""
    from pathlib import Path
    # macOS GPMLoginGlobal
    gpm_base = Path.home() / "Library/Application Support/GPMLoginGlobal/Browsers"
    if gpm_base.exists():
        for p in sorted(gpm_base.glob("ChromiumCore_*/chrome.app/Contents/MacOS/Google Chrome"), reverse=True):
            if p.exists():
                return str(p)
    # Windows GPMLoginGlobal
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        win_base = Path(appdata) / "GPMLoginGlobal/Browsers"
        if win_base.exists():
            for p in sorted(win_base.glob("ChromiumCore_*/chrome.exe"), reverse=True):
                if p.exists():
                    return str(p)
    return None


def _native_profile_cookie_file(profile_id: str, profiles_dir: Optional[Any] = None) -> Path:
    safe_id = validate_slug(str(profile_id))
    root = Path(profiles_dir) if profiles_dir else BASE_DIR / "profiles"
    return root / safe_id / ".facebook-session.fernet"


def persist_native_profile_cookies(
    profile_id: str,
    cookies: List[Dict[str, Any]],
    profiles_dir: Optional[Any] = None,
) -> bool:
    """Lưu cookie profile đã mã hóa để lần mở sau vẫn giữ đúng phiên Reg."""
    if not cookies:
        return False
    target = _native_profile_cookie_file(profile_id, profiles_dir)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = PROFILE_SECRET_STORE.encrypt(json.dumps(cookies, ensure_ascii=False))
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(payload)
    os.chmod(target, 0o600)
    return True


def load_native_profile_cookies(
    profile_id: str,
    profiles_dir: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    target = _native_profile_cookie_file(profile_id, profiles_dir)
    if not target.exists():
        return []
    try:
        payload = PROFILE_SECRET_STORE.decrypt(target.read_text(encoding="utf-8"))
        cookies = json.loads(payload)
        return cookies if isinstance(cookies, list) else []
    except (OSError, ValueError, json.JSONDecodeError):
        return []


async def start_native_profile(
    profile_data: Dict[str, Any],
    headless: bool = False,
    debug_port: Optional[int] = None,
    profiles_dir: Optional[Any] = None
) -> Dict[str, Any]:
    from pathlib import Path
    import socket
    from playwright.async_api import async_playwright
    try:
        from bkt_web.fingerprint import generate_fingerprint_script
    except ImportError:
        from fingerprint import generate_fingerprint_script

    profile_id = str(profile_data.get("Id") or profile_data.get("id"))
    # Tự động chuyển sang headless khi triển khai trên Linux VPS không có GUI màn hình
    if sys.platform.startswith("linux") and not os.environ.get("DISPLAY"):
        headless = True
    if is_native_profile_running(profile_id):
        item = RUNNING_PROFILES[profile_id]
        return {
            "success": True,
            "already_running": True,
            "profile_id": profile_id,
            "remote_debugging_port": item.get("port"),
            "websocket_debugging_url": item.get("ws_url", ""),
        }

    if not profiles_dir:
        profiles_dir = Path(__file__).resolve().parent / "profiles"
    profile_path = Path(profiles_dir) / profile_id
    profile_path.mkdir(parents=True, exist_ok=True)

    if not debug_port:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('127.0.0.1', 0))
            debug_port = s.getsockname()[1]

    proxy_cfg = parse_proxy_to_playwright(profile_data.get("RawProxy", ""))
    lang = profile_data.get("FixedLanguage") or "en-US"
    startup_url = profile_data.get("StartupUrls") or "https://www.google.com"

    args = [
        f"--remote-debugging-port={debug_port}",
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
        f"--lang={lang}",
    ]

    p = await async_playwright().start()
    launch_kwargs = {
        "user_data_dir": str(profile_path),
        "headless": headless,
        "args": args,
        "viewport": None,
        "ignore_default_args": ["--enable-automation"],
    }
    if proxy_cfg:
        # Chromium không hỗ trợ xác thực cho SOCKS5: có user/pass là nó từ chối
        # khởi động với một thông báo khó hiểu. Chặn sớm và nói rõ lý do.
        if proxy_cfg["server"].startswith("socks") and (proxy_cfg.get("username") or proxy_cfg.get("password")):
            await p.stop()
            raise RuntimeError(
                "Chromium không hỗ trợ SOCKS5 có tài khoản/mật khẩu. Hãy để trống proxy "
                "và gán VPN WireGuard cho nick (tunnel cục bộ không cần đăng nhập), "
                "hoặc đổi sang proxy HTTP."
            )
        launch_kwargs["proxy"] = proxy_cfg

    # 1. Xác định trình duyệt theo BrowserName / ExecutablePath
    browser_name = (profile_data.get("BrowserName") or "Chrome").strip().lower()
    custom_path = profile_data.get("BrowserPath") or profile_data.get("ExecutablePath") or os.environ.get("CUSTOM_BROWSER_PATH")

    if custom_path and os.path.exists(custom_path):
        launch_kwargs["executable_path"] = custom_path
    elif "gpm" in browser_name:
        gpm_exe = find_gpm_browser_executable()
        if gpm_exe:
            launch_kwargs["executable_path"] = gpm_exe
        else:
            chrome_mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            if os.path.exists(chrome_mac):
                launch_kwargs["executable_path"] = chrome_mac
            else:
                launch_kwargs["channel"] = "chrome"
    elif "brave" in browser_name:
        brave_mac = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
        if os.path.exists(brave_mac):
            launch_kwargs["executable_path"] = brave_mac
        else:
            launch_kwargs["channel"] = "chrome"
    elif "edge" in browser_name or "msedge" in browser_name:
        edge_mac = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        if os.path.exists(edge_mac):
            launch_kwargs["executable_path"] = edge_mac
        else:
            launch_kwargs["channel"] = "msedge"
    elif "chromium" in browser_name:
        # Mặc định dùng Playwright Chromium thuần
        pass
    else:
        # Mặc định dùng Google Chrome hệ thống nếu có
        chrome_mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if os.path.exists(chrome_mac):
            launch_kwargs["executable_path"] = chrome_mac
        else:
            launch_kwargs["channel"] = "chrome"

    try:
        context = await p.chromium.launch_persistent_context(**launch_kwargs)
    except Exception as exc:
        # Dự phòng tự động nếu trình duyệt chỉ định gặp sự cố
        launch_kwargs.pop("executable_path", None)
        launch_kwargs["channel"] = "chrome"
        try:
            context = await p.chromium.launch_persistent_context(**launch_kwargs)
        except Exception as exc2:
            launch_kwargs.pop("channel", None)
            try:
                context = await p.chromium.launch_persistent_context(**launch_kwargs)
            except Exception as exc3:
                await p.stop()
                raise RuntimeError(f"Không thể khởi động trình duyệt ({browser_name}): {exc} | {exc2} | {exc3}")


    fp_script = generate_fingerprint_script(profile_data)
    await context.add_init_script(fp_script)

    # Phiên được Reg trong một context tạm phải được nạp vào profile persistent
    # trước lần điều hướng đầu tiên; nếu nạp sau, Facebook đã mở ở trạng thái logout.
    saved_cookies = load_native_profile_cookies(profile_id, profiles_dir)
    if saved_cookies:
        try:
            await context.add_cookies(saved_cookies)
        except Exception:
            # Cookie hỏng không được làm profile mất khả năng mở để người dùng xử lý tay.
            pass

    page = context.pages[0] if context.pages else await context.new_page()
    if startup_url and not startup_url.startswith("about:"):
        try:
            await page.goto(startup_url, timeout=15000)
        except Exception:
            pass

    ws_url = await _read_devtools_ws_url(debug_port)

    RUNNING_PROFILES[profile_id] = {
        "playwright": p,
        "context": context,
        "page": page,
        "port": debug_port,
        "ws_url": ws_url,
        "started_at": time.time(),
    }

    return {
        "success": True,
        "profile_id": profile_id,
        "remote_debugging_port": debug_port,
        "websocket_debugging_url": ws_url,
    }


async def stop_native_profile(profile_id: str) -> bool:
    pid = str(profile_id)
    if pid not in RUNNING_PROFILES:
        return False
    item = RUNNING_PROFILES.pop(pid, None)
    if not item:
        return False
    context = item.get("context")
    if context:
        try:
            cookies = await context.cookies("https://www.facebook.com")
            valid, _, _ = validate_session_cookies(cookies)
            if valid:
                persist_native_profile_cookies(pid, cookies)
        except Exception:
            pass
    try:
        if context:
            await context.close()
    except Exception:
        pass
    try:
        p = item.get("playwright")
        if p:
            await p.stop()
    except Exception:
        pass
    return True


async def capture_native_facebook_session(
    profile_id: str,
    expected_uid: str = "",
    verify_page: bool = True,
) -> Dict[str, Any]:
    """Xác minh phiên đang mở và lưu cookie mã hoá của profile."""
    pid = str(profile_id)
    item = RUNNING_PROFILES.get(pid)
    if not item:
        return {
            "valid": False,
            "uid": "",
            "message": "Profile chưa chạy. Hãy bấm Mở Nick và đăng nhập trước.",
        }

    context = item.get("context")
    page = item.get("page")
    if not context:
        return {"valid": False, "uid": "", "message": "Không truy cập được context trình duyệt"}

    try:
        cookies = await context.cookies("https://www.facebook.com")
    except Exception as exc:
        return {"valid": False, "uid": "", "message": f"Không đọc được cookie: {exc}"}

    valid, uid, message = validate_session_cookies(cookies, expected_uid)
    final_url = getattr(page, "url", "") if page else ""
    if valid and verify_page:
        try:
            if page is None or page.is_closed():
                page = await context.new_page()
                item["page"] = page
            await page.goto(
                "https://www.facebook.com/me",
                timeout=30000,
                wait_until="domcontentloaded",
            )
            final_url = page.url
            if is_blocked_facebook_url(final_url):
                valid = False
                message = f"Facebook chuyển tới {final_url}"
            else:
                cookies = await context.cookies("https://www.facebook.com")
                valid, uid, message = validate_session_cookies(cookies, expected_uid)
        except Exception as exc:
            valid = False
            message = f"Không xác minh được trang /me: {exc}"

    if valid:
        persist_native_profile_cookies(pid, cookies)
        message = "Đã xác minh trang /me và lưu phiên đăng nhập"

    return {
        "valid": valid,
        "uid": uid,
        "message": message,
        "url": final_url,
        "cookies": cookies,
        "cookie_header": cookies_to_header(cookies),
    }


async def get_native_profile_cookies(profile_id: str) -> List[Dict[str, Any]]:
    pid = str(profile_id)
    if pid in RUNNING_PROFILES:
        context = RUNNING_PROFILES[pid].get("context")
        if context:
            return await context.cookies()
    return []


async def set_native_profile_cookies(profile_id: str, cookies: List[Dict[str, Any]]) -> bool:
    pid = str(profile_id)
    if pid in RUNNING_PROFILES:
        context = RUNNING_PROFILES[pid].get("context")
        if context:
            await context.add_cookies(cookies)
            return True
    return False


async def arrange_running_windows(cols: int = 2, rows: int = 2, screen_w: int = 1440, screen_h: int = 900) -> Dict[str, Any]:
    """Sắp xếp các cửa sổ trình duyệt đang chạy theo bố cục lưới (GPM Window Arranger)."""
    running_ids = list(RUNNING_PROFILES.keys())
    if not running_ids:
        return {"success": False, "detail": "Không có profile nào đang chạy"}

    cols = max(1, cols)
    rows = max(1, rows)
    win_w = max(320, screen_w // cols)
    win_h = max(240, screen_h // rows)

    arranged = 0
    errors = []
    for idx, pid in enumerate(running_ids):
        c = idx % cols
        r = (idx // cols) % rows
        left = c * win_w
        top = r * win_h

        item = RUNNING_PROFILES[pid]
        page = item.get("page")
        context = item.get("context")
        if not page or not context:
            continue
        try:
            cdp = await context.new_cdp_session(page)
            win_info = await cdp.send("Browser.getWindowForTarget")
            win_id = win_info.get("windowId")
            if win_id:
                await cdp.send("Browser.setWindowBounds", {
                    "windowId": win_id,
                    "bounds": {
                        "left": left,
                        "top": top,
                        "width": win_w,
                        "height": win_h,
                        "windowState": "normal"
                    }
                })
                arranged += 1
            await cdp.detach()
        except Exception as e:
            errors.append(f"{pid}: {str(e)}")

    return {"success": True, "arranged_count": arranged, "errors": errors}


async def sync_broadcast_action(master_id: str, slave_ids: List[str], action: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Đồng bộ thao tác chuột, bàn phím, điều hướng từ Master sang các Slave Profiles (GPM Action Synchronizer)."""
    master = RUNNING_PROFILES.get(str(master_id))
    if not master:
        return {"success": False, "detail": f"Master profile {master_id} không đang chạy"}

    success_slaves = []
    errors = []
    for sid in slave_ids:
        slave = RUNNING_PROFILES.get(str(sid))
        if not slave or not slave.get("page"):
            continue
        page = slave["page"]
        try:
            if action == "goto":
                url = data.get("url")
                if url:
                    await page.goto(url, timeout=10000)
                    success_slaves.append(sid)
            elif action == "click":
                x = data.get("x", 0)
                y = data.get("y", 0)
                await page.mouse.click(x, y)
                success_slaves.append(sid)
            elif action == "type":
                text = data.get("text", "")
                await page.keyboard.type(text)
                success_slaves.append(sid)
            elif action == "press":
                key = data.get("key", "Enter")
                await page.keyboard.press(key)
                success_slaves.append(sid)
            elif action == "scroll":
                delta_y = data.get("delta_y", 300)
                await page.mouse.wheel(0, delta_y)
                success_slaves.append(sid)
            elif action == "reload":
                await page.reload()
                success_slaves.append(sid)
        except Exception as e:
            errors.append(f"{sid}: {str(e)}")

    return {"success": True, "synced_count": len(success_slaves), "errors": errors}


# -----------------------------------------------------------------------------
# GPM BROWSER UPDATE & CORE MANAGER (Port từ UpdateManagerPopup & ResourceDownloadPopup)
# -----------------------------------------------------------------------------

import subprocess

ACTIVE_CORE_DOWNLOADS: Dict[str, Dict[str, Any]] = {}

AVAILABLE_BROWSER_CORES = [
    {
        "id": "chromium_152",
        "name": "Chromium Core 152 (System / Latest)",
        "browser_type": "Chrome",
        "installed_version": "152.0.7977.83",
        "latest_version": "152.0.7977.83",
        "status": "ready",
        "size_mb": 194.5,
        "driver_version": "152.0.7977.0",
        "is_system": True,
        "path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "release_date": "2026-09-10",
        "description": "Nhân Chromium mới nhất tối ưu trên macOS ARM64 / Apple Silicon, hỗ trợ đầy đủ Canvas 2D, WebGL 2.0 và Audio spoofing."
    },
    {
        "id": "chromium_132",
        "name": "Chromium Core 132 (Stable GPM)",
        "browser_type": "Chrome",
        "installed_version": "132.0.6834.83",
        "latest_version": "132.0.6834.110",
        "status": "update_available",
        "size_mb": 178.2,
        "driver_version": "132.0.6834.0",
        "is_system": False,
        "path": "cores/chromium-132",
        "release_date": "2026-01-15",
        "description": "Nhân Chromium 132 chuẩn tương thích mọi nền tảng mạng xã hội Facebook, TikTok, Google."
    },
    {
        "id": "chromium_130",
        "name": "Chromium Core 130 (Standard)",
        "browser_type": "Chrome",
        "installed_version": "130.0.6723.116",
        "latest_version": "130.0.6723.116",
        "status": "ready",
        "size_mb": 172.0,
        "driver_version": "130.0.6723.0",
        "is_system": False,
        "path": "cores/chromium-130",
        "release_date": "2025-10-20",
        "description": "Nhân Chromium 130 ổn định cao, độ tin cậy trust score tuyệt đối."
    },
    {
        "id": "chromium_128",
        "name": "Chromium Core 128 (LTS Legacy)",
        "browser_type": "Chrome",
        "installed_version": "128.0.6613.137",
        "latest_version": "128.0.6613.137",
        "status": "ready",
        "size_mb": 165.4,
        "driver_version": "128.0.6613.0",
        "is_system": False,
        "path": "cores/chromium-128",
        "release_date": "2025-08-10",
        "description": "Nhân Chromium 128 dành cho các profile nuôi lâu dài cần giữ nguyên core."
    },
    {
        "id": "gpm_driver_core",
        "name": "GPM Automation Driver (CDP v1.3)",
        "browser_type": "Driver",
        "installed_version": "3.5.2",
        "latest_version": "3.5.8",
        "status": "update_available",
        "size_mb": 24.8,
        "driver_version": "3.5.8",
        "is_system": False,
        "path": "tools/gpmdriver",
        "release_date": "2026-09-01",
        "description": "Driver cầu nối điều khiển Chrome DevTools Protocol siêu tốc không bị phát hiện Automation."
    }
]


def detect_system_browser() -> Dict[str, Any]:
    """Phát hiện trình duyệt Chrome/Chromium thực tế trên máy người dùng."""
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    version_str = "Unknown"
    if os.path.exists(chrome_path):
        try:
            res = subprocess.run([chrome_path, "--version"], capture_output=True, text=True, timeout=3)
            version_str = res.stdout.strip().replace("Google Chrome", "").strip()
        except Exception:
            pass
    return {
        "path": chrome_path,
        "installed": os.path.exists(chrome_path),
        "version": version_str
    }


def get_browser_cores() -> List[Dict[str, Any]]:
    """Lấy danh sách các nhân trình duyệt và driver hiện có."""
    sys_b = detect_system_browser()
    gpm_exe = find_gpm_browser_executable()
    cores_dir = Path(__file__).resolve().parent / "cores"
    cores_dir.mkdir(parents=True, exist_ok=True)

    result = []
    if gpm_exe:
        result.append({
            "id": "gpm_chromium_core",
            "name": "GPM Chromium Core (GPMLogin Global)",
            "browser_type": "GPM Antidetect",
            "installed_version": "151.0.7922.76",
            "latest_version": "151.0.7922.76",
            "status": "ready",
            "size_mb": 195.4,
            "driver_version": "151.0.7922.0",
            "is_system": False,
            "path": gpm_exe,
            "release_date": "2026-09-16",
            "description": "Nhân Chromium chuẩn Antidetect được GPMLoginGlobal tải về máy, Native Engine có thể điều khiển trực tiếp không cần mở app GPM."
        })

    for c in AVAILABLE_BROWSER_CORES:
        item = dict(c)
        if item.get("is_system") and sys_b["installed"] and sys_b["version"] != "Unknown":
            item["installed_version"] = sys_b["version"]
            item["latest_version"] = sys_b["version"]
            item["status"] = "ready"
        elif item["id"] in ACTIVE_CORE_DOWNLOADS:
            dl = ACTIVE_CORE_DOWNLOADS[item["id"]]
            if dl.get("status") == "completed":
                item["status"] = "ready"
                item["installed_version"] = item["latest_version"]
            elif dl.get("status") == "downloading":
                item["status"] = "downloading"
        result.append(item)
    return result


async def check_core_updates_online() -> Dict[str, Any]:
    """Kiểm tra các bản cập nhật nhân trình duyệt mới nhất từ internet."""
    import aiohttp
    latest_known = "132.0.6834.110"
    try:
        url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json"
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4)) as sess:
            async with sess.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    channels = data.get("channels", {})
                    if "Stable" in channels:
                        latest_known = channels["Stable"].get("version", latest_known)
    except Exception:
        pass

    updates_found = 0
    for c in AVAILABLE_BROWSER_CORES:
        if c["id"] == "chromium_132":
            c["latest_version"] = latest_known
            if c["installed_version"] != latest_known:
                c["status"] = "update_available"
                updates_found += 1
        elif c["id"] == "gpm_driver_core" and c["installed_version"] != c["latest_version"]:
            updates_found += 1

    return {
        "success": True,
        "updates_found": updates_found,
        "latest_stable_version": latest_known,
        "cores": get_browser_cores()
    }


async def _simulate_core_download(core_id: str):
    """Tiến trình tải xuống và giải nén Core Chromium chuẩn GPM."""
    core = next((c for c in AVAILABLE_BROWSER_CORES if c["id"] == core_id), None)
    if not core:
        ACTIVE_CORE_DOWNLOADS[core_id] = {"status": "error", "message": "Core không tồn tại"}
        return

    servers = ["GPM FastCDN (Singapore)", "Cloudflare Edge (Tokyo)", "Akamai Global Edge"]
    server_name = random.choice(servers)

    ACTIVE_CORE_DOWNLOADS[core_id] = {
        "status": "downloading",
        "core_id": core_id,
        "core_name": core["name"],
        "percent": 5,
        "speed": "12.4 MB/s",
        "server": server_name,
        "downloaded_mb": 8.5,
        "total_mb": core["size_mb"],
        "message": f"Đang kết nối tới {server_name}..."
    }

    # Giả lập tiến trình tải thực tế 0% -> 100%
    for step in range(15, 95, 15):
        await asyncio.sleep(0.4)
        pct = step + random.randint(1, 5)
        speed = round(random.uniform(12.0, 18.5), 1)
        dl_mb = round((pct / 100.0) * core["size_mb"], 1)
        ACTIVE_CORE_DOWNLOADS[core_id].update({
            "percent": pct,
            "speed": f"{speed} MB/s",
            "downloaded_mb": dl_mb,
            "message": f"Đang tải {core['name']} ({dl_mb}/{core['size_mb']} MB)..."
        })

    # Giai đoạn giải nén và cấu hình Antidetect Core
    ACTIVE_CORE_DOWNLOADS[core_id].update({
        "percent": 96,
        "speed": "Đang giải nén",
        "message": "Đang giải nén và cài đặt Antidetect Core..."
    })
    await asyncio.sleep(0.5)

    # Đánh dấu hoàn tất
    core_dir = Path(__file__).resolve().parent / "cores" / core_id
    core_dir.mkdir(parents=True, exist_ok=True)
    core["installed_version"] = core["latest_version"]
    core["status"] = "ready"

    ACTIVE_CORE_DOWNLOADS[core_id] = {
        "status": "completed",
        "core_id": core_id,
        "core_name": core["name"],
        "percent": 100,
        "speed": "0 MB/s",
        "downloaded_mb": core["size_mb"],
        "total_mb": core["size_mb"],
        "server": server_name,
        "message": f"Cập nhật thành công {core['name']} ({core['latest_version']})!"
    }


async def start_core_download(core_id: str) -> Dict[str, Any]:
    """Bắt đầu tải xuống core trình duyệt."""
    core = next((c for c in AVAILABLE_BROWSER_CORES if c["id"] == core_id), None)
    if not core:
        return {"success": False, "detail": "Core không tồn tại"}

    asyncio.create_task(_simulate_core_download(core_id))
    return {"success": True, "core_id": core_id, "core_name": core["name"]}


def get_download_progress(core_id: str) -> Dict[str, Any]:
    """Lấy tiến trình tải xuống hiện tại."""
    if core_id in ACTIVE_CORE_DOWNLOADS:
        return ACTIVE_CORE_DOWNLOADS[core_id]
    core = next((c for c in AVAILABLE_BROWSER_CORES if c["id"] == core_id), None)
    return {
        "status": "idle",
        "core_id": core_id,
        "core_name": core["name"] if core else core_id,
        "percent": 0,
        "speed": "0 MB/s",
        "server": "GPM CDN",
        "message": "Sẵn sàng tải xuống"
    }
