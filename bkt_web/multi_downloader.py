"""Tải video nhiều nền tảng cho tab "Tải Video (No-Logo)".

TikTok vẫn đi chocode → tikwm (bản không logo) trong server.py; yt-dlp là nguồn dự phòng cho TikTok và là nguồn chính
cho mọi nền tảng khác trong PLATFORMS. Chỉ nhận link https thuộc các host đã liệt kê (không cho yt-dlp tải URL bất kỳ).

YouTube chặn IP trung tâm dữ liệu: trên VPS (/opt/tokmatrix) link YouTube đi qua một tunnel NordVPN riêng, dùng một
config chưa gán cho tài khoản TikTok nào (một IP một tài khoản), giống Story Remake. TOKMATRIX_DL_PROXY=<url> ép dùng
proxy đó cho mọi nền tảng; TOKMATRIX_DL_PROXY=0 tắt tunnel.

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
    "kuaishou": {"label": "Kuaishou", "hosts": ["kuaishou.com", "chenzhongtech.com"]},
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
        for conf in sorted(base.glob("NordVPN_Germany/**/*.conf")):
            rel = str(conf.relative_to(base))
            if rel in used:
                continue
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
