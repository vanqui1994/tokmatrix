"""Tải video nhiều nền tảng cho tab "Tải Video (No-Logo)".

TikTok vẫn đi chocode → tikwm (bản không logo) trong server.py; yt-dlp là nguồn dự phòng cho TikTok và là nguồn chính
cho mọi nền tảng khác trong PLATFORMS. Chỉ nhận link https thuộc các host đã liệt kê (không cho yt-dlp tải URL bất kỳ).

YouTube chặn IP trung tâm dữ liệu: trên VPS (/opt/tokmatrix) link YouTube đi qua một tunnel NordVPN riêng, dùng một
config chưa gán cho tài khoản TikTok nào (một IP một tài khoản), giống Story Remake. TOKMATRIX_DL_PROXY=<url> ép dùng
proxy đó cho mọi nền tảng; TOKMATRIX_DL_PROXY=0 tắt tunnel.

Kuaishou không có trong yt-dlp: link được mở trong Chrome riêng đã đăng nhập Kuaishou bằng QR (service
tokmatrix-kuaishou-chrome, CDP TOKMATRIX_KUAISHOU_CDP mặc định 127.0.0.1:9340), lấy địa chỉ MP4 trang đang phát rồi tải.

Instagram, Douyin, Facebook thường đòi cookie trình duyệt: đặt file cookie Netscape (xuất bằng tiện ích
"Get cookies.txt LOCALLY") tại bkt_web/storage/download_cookies/<nền tảng>.txt, vd. instagram.txt, douyin.txt.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import threading
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Optional

REPO = Path(__file__).resolve().parent.parent
ON_VPS = str(REPO) == "/opt/tokmatrix"
MAX_BYTES = 500 * 1024 * 1024
COOKIES_DIR = REPO / "bkt_web" / "storage" / "download_cookies"

# nền tảng → các host (khớp đúng host hoặc tên miền con)
PLATFORMS: Dict[str, Dict[str, Any]] = {
    "kuaishou": {"label": "Kuaishou", "hosts": ["kuaishou.com", "chenzhongtech.com", "gifshow.com", "kwai.com"]},
    "tiktok": {"label": "TikTok", "hosts": ["tiktok.com"]},
    "douyin": {"label": "Douyin", "hosts": ["douyin.com", "iesdouyin.com"]},
    "youtube": {"label": "YouTube", "hosts": ["youtube.com", "youtu.be", "youtube-nocookie.com"]},
    "instagram": {"label": "Instagram", "hosts": ["instagram.com"]},
    "facebook": {"label": "Facebook", "hosts": ["facebook.com", "fb.watch", "fb.com"]},
    "x": {"label": "X (Twitter)", "hosts": ["x.com", "twitter.com"]},
    "threads": {"label": "Threads", "hosts": ["threads.net", "threads.com"]},
    "bilibili": {"label": "Bilibili", "hosts": ["bilibili.com", "b23.tv"]},
    "pinterest": {"label": "Pinterest", "hosts": ["pinterest.com", "pin.it"]},
    "reddit": {"label": "Reddit", "hosts": ["reddit.com", "redd.it"]},
    "vimeo": {"label": "Vimeo", "hosts": ["vimeo.com"]},
    "dailymotion": {"label": "Dailymotion", "hosts": ["dailymotion.com", "dai.ly"]},
    "snapchat": {"label": "Snapchat", "hosts": ["snapchat.com"]},
}
NEEDS_TUNNEL = {"youtube"}
KUAISHOU_CDP = os.environ.get("TOKMATRIX_KUAISHOU_CDP", "http://127.0.0.1:9340")
_kuaishou_lock = threading.Lock()  # một tab Kuaishou một lúc: tránh bị coi là bot

_tunnel_lock = threading.Lock()
_tunnel: Dict[str, Optional[str]] = {"url": None}


def detect_platform(url: str) -> Optional[str]:
    """Tên nền tảng của link https, None khi không phải nền tảng hỗ trợ."""
    try:
        parsed = urllib.parse.urlparse((url or "").strip())
    except ValueError:
        return None
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        return None
    for name, spec in PLATFORMS.items():
        if any(host == h or host.endswith("." + h) for h in spec["hosts"]):
            return name
    return None


def label(platform: str) -> str:
    return PLATFORMS.get(platform, {}).get("label", platform)


def cookie_file(platform: str) -> Optional[Path]:
    path = COOKIES_DIR / f"{platform}.txt"
    return path if path.is_file() and path.stat().st_size > 0 else None


def _ytdlp_bin() -> str:
    venv = REPO / "venv" / "bin" / "yt-dlp"
    found = str(venv) if venv.exists() else shutil.which("yt-dlp")
    if not found:
        raise RuntimeError("Chưa cài yt-dlp")
    return found


def _proxy(platform: str) -> Optional[str]:
    forced = os.environ.get("TOKMATRIX_DL_PROXY", "")
    if forced == "0":
        return None
    if forced:
        return forced
    if not (ON_VPS and platform in NEEDS_TUNNEL):
        return None
    with _tunnel_lock:
        if _tunnel["url"]:
            return _tunnel["url"]
        os.environ.setdefault("TOKMATRIX_WIREPROXY_PATH", "/usr/local/bin/wireproxy")
        try:
            from bkt_web import vpn_manager
        except ImportError:
            import vpn_manager
        db = REPO / "bkt_web" / "bkt_channels.db"
        with sqlite3.connect(str(db)) as conn:
            used = {r[0] for r in conn.execute("select vpn_config from channels where vpn_config!=''")}
        base = REPO / "bkt_web" / "vpn_configs"
        # Story Remake lấy config từ cuối danh sách; ở đây lấy từ đầu để hai luồng không tranh một IP.
        free = [c for c in sorted(base.glob("NordVPN_Germany/**/*.conf")) if str(c.relative_to(base)) not in used]
        for conf in free[:3]:  # mỗi lần thử ~1 phút: không quét hết hàng nghìn config
            rel = str(conf.relative_to(base))
            try:
                _tunnel["url"] = vpn_manager.start_verified_wireguard_proxy("downloader", rel)["socks5_url"]
                return _tunnel["url"]
            except Exception as e:  # noqa: BLE001
                print(f"[Downloader] tunnel {rel}: {e}", flush=True)
        raise RuntimeError("Không mở được tunnel NordVPN cho YouTube")


def download_ytdlp(url: str, platform: str, out_dir: Path) -> Dict[str, Any]:
    """Tải một video bằng yt-dlp vào out_dir; trả thông tin cho bảng downloaded_videos. Lỗi → RuntimeError."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [_ytdlp_bin(), "--no-playlist", "--no-progress", "--no-warnings", "--restrict-filenames",
           "--max-filesize", str(MAX_BYTES), "--js-runtimes", "node",
           "-f", "bv*[ext=mp4][height<=1920]+ba[ext=m4a]/b[ext=mp4][height<=1920]/bv*[height<=1920]+ba/b",
           "--merge-output-format", "mp4", "--remux-video", "mp4",
           "-o", str(out_dir / f"{platform}_%(id).80s.%(ext)s"),
           "--print", "after_move:%()j", "--no-simulate"]
    cookies = cookie_file(platform)
    if cookies:
        cmd += ["--cookies", str(cookies)]
    proxy = _proxy(platform)
    if proxy:
        cmd += ["--proxy", proxy]
    cmd += ["--", url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    except subprocess.TimeoutExpired:
        raise RuntimeError("yt-dlp quá 15 phút")
    lines = [l for l in r.stdout.splitlines() if l.startswith("{")]
    if r.returncode != 0 or not lines:
        err = [l for l in (r.stderr or "").splitlines() if "ERROR" in l] or (r.stderr or "").splitlines()[-1:] or ["yt-dlp lỗi"]
        raise RuntimeError(err[-1].replace("ERROR: ", "")[:300])
    info = json.loads(lines[-1])
    path = Path(info.get("filepath") or info.get("_filename") or "")
    if not path.is_file():
        raise RuntimeError("yt-dlp không tạo ra file")
    if path.suffix.lower() != ".mp4":
        raise RuntimeError(f"File tải về không phải MP4 ({path.suffix})")
    return {
        "provider": "yt-dlp",
        "id": str(info.get("id") or path.stem),
        "title": info.get("title") or info.get("description") or path.stem,
        "author": info.get("uploader") or info.get("channel") or info.get("uploader_id") or "",
        "duration": int(info.get("duration") or 0),
        "cover": info.get("thumbnail") or "",
        "path": path,
    }


def _ks_photos(obj: Any, out: Optional[list] = None, depth: int = 0) -> list:
    """Các video trong JSON của /rest/v/* (profile/feed, photo detail…): dict có id + photoUrls/manifest."""
    out = [] if out is None else out
    if depth > 12:
        return out
    if isinstance(obj, dict):
        if obj.get("id") and (obj.get("photoUrls") or obj.get("manifest") or obj.get("photoUrl")):
            out.append(obj)
        for v in obj.values():
            _ks_photos(v, out, depth + 1)
    elif isinstance(obj, list):
        for v in obj:
            _ks_photos(v, out, depth + 1)
    return out


def _ks_play_url(ph: Dict[str, Any]) -> str:
    for u in ph.get("photoUrls") or []:  # H.264 trước (H.265 nhiều máy không phát được)
        if isinstance(u, dict) and u.get("url"):
            return u["url"]
    if ph.get("photoUrl"):
        return ph["photoUrl"]
    for aset in ((ph.get("manifest") or {}).get("adaptationSet") or []):
        for rep in aset.get("representation") or []:
            if rep.get("url"):
                return rep["url"]
    return ""


def _ks_item(ph: Dict[str, Any], author: str = "") -> Dict[str, Any]:
    dur = int(float(ph.get("duration") or 0))
    return {"id": str(ph["id"]), "title": (ph.get("caption") or "").replace("\xa0", " ").strip()[:200],
            "duration": dur // 1000 if dur > 1000 else dur, "cover": ph.get("coverUrl") or "",
            "play_url": _ks_play_url(ph), "author": author, "url": f"https://www.kuaishou.com/short-video/{ph['id']}",
            "posted": int(float(ph.get("timestamp") or 0) / 1000)}


_KS_SCROLL = """()=>{[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+50&&
 ['auto','scroll'].includes(getComputedStyle(e).overflowY)).forEach(e=>e.scrollTop=e.scrollHeight);
 window.scrollTo(0,document.body.scrollHeight)}"""


def is_kuaishou_profile(url: str) -> bool:
    return detect_platform(url) == "kuaishou" and "/profile/" in urllib.parse.urlparse(url).path


async def _ks_capture(url: str, want: int, target: str = "") -> Dict[str, Any]:
    """Mở link trong Chrome Kuaishou, để trang tự gọi /rest/v/* (có chữ ký), cuộn tới khi đủ `want` video."""
    import asyncio
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        try:
            browser = await p.chromium.connect_over_cdp(KUAISHOU_CDP)
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"Chrome Kuaishou chưa mở ({KUAISHOU_CDP}): {e}")
        page = await browser.contexts[0].new_page()
        photos: Dict[str, Dict[str, Any]] = {}
        state = {"end": False, "author": "", "rest": 0}

        async def on_response(r):
            if not ("/rest/v/" in r.url or "/graphql" in r.url) or "/log/" in r.url:
                return
            try:
                data = await r.json()
            except Exception:  # noqa: BLE001
                return
            state["rest"] += 1
            if isinstance(data, dict) and "feeds" in data and str(data.get("pcursor")) == "no_more":
                state["end"] = True
            for f in (data.get("feeds") or []) if isinstance(data, dict) else []:
                if isinstance(f, dict) and (f.get("author") or {}).get("name"):
                    state["author"] = f["author"]["name"]
            for ph in _ks_photos(data):
                photos.setdefault(str(ph["id"]), ph)
        page.on("response", lambda r: asyncio.ensure_future(on_response(r)))
        try:
            try:
                await page.goto(url, wait_until="commit", timeout=45000)
            except Exception as e:  # noqa: BLE001 — trang tự chuyển hướng hay làm goto báo ERR_ABORTED
                print(f"[Kuaishou] goto {url}: {e}", flush=True)
            idle = 0
            for _ in range(80):
                await page.wait_for_timeout(1500)
                before = len(photos)
                if target:  # một video: chờ tới khi có đúng video đó (không cuộn)
                    for ph in _ks_photos(await page.evaluate("window.__APOLLO_STATE__ || null")):
                        photos.setdefault(str(ph["id"]), ph)
                    if target in photos or _ > 28:  # ~45 s rồi bỏ: trang video lẻ của Kuaishou có lúc tải mãi từ VPS
                        break
                    continue
                if len(photos) >= want or state["end"]:
                    break
                await page.evaluate(_KS_SCROLL)  # profile cuộn trong DIV.wb-content, không phải window
                idle = idle + 1 if len(photos) == before else 0
                if idle >= 8:  # ~12 s không có video mới
                    break
            # trang một video: video đó nằm trong __APOLLO_STATE__ (SSR); graphql sau đó chỉ là video gợi ý
            for ph in _ks_photos(await page.evaluate("window.__APOLLO_STATE__ || null")):
                photos.setdefault(str(ph["id"]), ph)
            m = __import__("re").search(r"/short-video/([0-9A-Za-z_-]+)", page.url)
            if m and m.group(1) not in photos:
                src = await page.evaluate("[...document.querySelectorAll('video')].map(v=>v.currentSrc||v.src).filter(s=>s.startsWith('http'))")
                if src:
                    photos[m.group(1)] = {"id": m.group(1), "photoUrl": src[0],
                                          "caption": (await page.title()).replace(" - 快手", "")}
            if not photos and ("passport" in page.url or "login" in page.url):
                raise RuntimeError("Kuaishou đòi đăng nhập: quét QR lại trong Chrome Kuaishou (noVNC)")
            return {"photos": list(photos.values()), "author": state["author"], "page": page.url}
        finally:
            await page.close()


def kuaishou_ready() -> bool:
    import urllib.request
    try:
        urllib.request.urlopen(f"{KUAISHOU_CDP}/json/version", timeout=2).read()
        return True
    except Exception:  # noqa: BLE001
        return False


def _run(coro):
    import asyncio
    with _kuaishou_lock:
        return asyncio.run(coro)


def resolve_kuaishou(url: str) -> Dict[str, Any]:
    """Một video Kuaishou → {play_url, title, …}."""
    m = __import__("re").search(r"/(?:short-video|photo|fw/photo)/([0-9A-Za-z_-]+)", url)
    got = _run(_ks_capture(url, 1, m.group(1) if m else ""))
    if not m:  # link rút gọn v.kuaishou.com: mã video nằm ở trang đích
        m = __import__("re").search(r"/(?:short-video|photo|fw/photo)/([0-9A-Za-z_-]+)", got["page"])
    pid = m.group(1) if m else ""
    photos = got["photos"]
    ph = next((x for x in photos if str(x["id"]) == pid), None if pid else (photos[0] if photos else None))
    if not ph or not _ks_play_url(ph):
        raise RuntimeError("Kuaishou tải trang video chậm hoặc video không còn: thử lại, hoặc dán link profile của kênh")
    return _ks_item(ph, got["author"])


def kuaishou_profile(url: str, limit: int = 20) -> list:
    """Profile Kuaishou → tối đa `limit` video mới nhất [{url, play_url, title, …}]."""
    got = _run(_ks_capture(url, limit))
    items = [_ks_item(ph, got["author"]) for ph in got["photos"]]
    items = [i for i in items if i["play_url"]][:limit]
    if not items:
        raise RuntimeError("Profile Kuaishou không có video nào tải được (chưa đăng nhập, hoặc profile riêng tư)")
    return items
