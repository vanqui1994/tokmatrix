import os
import sys
import hmac
import ipaddress
import secrets
import socket
import threading
import urllib.parse
from contextlib import asynccontextmanager
from pathlib import Path

# Prevent local Windows binary directories from shadowing macOS packages
_project_root = str(Path(__file__).resolve().parent.parent)
sys.path = [p for p in sys.path if p not in ("", ".", _project_root)]
sys.path.append(_project_root)

import json
import re
import asyncio
import time
import datetime
import subprocess
import random
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse, HTMLResponse
from pydantic import BaseModel, Field, ConfigDict
from curl_cffi import requests
from playwright.async_api import async_playwright

try:
    from bkt_web.db_utils import connect_db, configure_database
    from bkt_web.security import SecretStore, harden_file_permissions, safe_child, validate_slug
    from bkt_web import key_vault


    from bkt_web.nuoinick_routes import nn_router
    from bkt_web.publish_kit import build_publish_kit as build_compare_publish_kit
    from bkt_web import publish_flow
    from bkt_web.matrix_routes import router as matrix_router
    from bkt_web.compare_native import compare_native_router, start_run as start_compare_run, stop_all_runs as stop_compare_runs, start_image_autoassign, stop_image_autoassign, video_detail as compare_video_detail, RUNS as COMPARE_RUNS, detect_video_type_for_slug, video_lang_title, pending_images as compare_pending_images
    from bkt_web.image_routes import (
        image_router, init_image_tables,
        start_image_queue_worker, stop_image_queue_worker,
    )
    from bkt_web.script_routes import script_router, init_script_tables
    from bkt_web import script_bridge_worker
    from bkt_web import notify
    from bkt_web.autopilot_routes import router as autopilot_router
    from bkt_web.chocode_routes import router as tiktok_api_router, sync_channel as tiktok_api_sync_channel
    from bkt_web.flow_routes import router as flow_router
    from bkt_web.story_remake_routes import router as story_remake_router
    from bkt_web.muse_film_routes import router as muse_film_router
    from bkt_web import chocode_routes
    from bkt_web import chocode_tiktok
    from bkt_web.autopilot import init_autopilot_db, start_autopilot, stop_autopilot
    from bkt_web.remake_routes import remake_router, start_remake_queue_worker, stop_remake_queue_worker
except ImportError:
    from db_utils import connect_db, configure_database
    from security import SecretStore, harden_file_permissions, safe_child, validate_slug
    import key_vault


    from nuoinick_routes import nn_router
    from publish_kit import build_publish_kit as build_compare_publish_kit
    import publish_flow
    from matrix_routes import router as matrix_router
    from compare_native import compare_native_router, start_run as start_compare_run, stop_all_runs as stop_compare_runs, start_image_autoassign, stop_image_autoassign, video_detail as compare_video_detail, RUNS as COMPARE_RUNS, detect_video_type_for_slug, video_lang_title, pending_images as compare_pending_images
    from image_routes import (
        image_router, init_image_tables,
        start_image_queue_worker, stop_image_queue_worker,
    )
    from script_routes import script_router, init_script_tables
    import script_bridge_worker
    import notify
    from autopilot_routes import router as autopilot_router
    from chocode_routes import router as tiktok_api_router, sync_channel as tiktok_api_sync_channel
    from flow_routes import router as flow_router
    from story_remake_routes import router as story_remake_router
    from muse_film_routes import router as muse_film_router
    import chocode_routes
    import chocode_tiktok
    from autopilot import init_autopilot_db, start_autopilot, stop_autopilot
    from remake_routes import remake_router, start_remake_queue_worker, stop_remake_queue_worker

CHROME_EXEC_PATH = os.environ.get(
    "TOKMATRIX_CHROME_PATH",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)

# Paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "bkt_channels.db"
DATA_COOKIES_PATH = PROJECT_ROOT / "data" / "Cookies"
SECRET_KEY_PATH = BASE_DIR / ".secret.key"
SECRET_STORE = SecretStore(SECRET_KEY_PATH)
SECRET_SETTING_KEYS = {"api_captcha", "proxy_list"}

STORAGE_DIR = BASE_DIR / "storage"
DOWNLOADS_DIR = STORAGE_DIR / "downloads"
RENDERED_DIR = STORAGE_DIR / "rendered"
OVERLAYS_DIR = STORAGE_DIR / "overlays"
AUDIO_DIR = STORAGE_DIR / "audio"
GENERATED_IMAGES_DIR = STATIC_DIR / "generated_images"

for _dir in [STORAGE_DIR, DOWNLOADS_DIR, RENDERED_DIR, OVERLAYS_DIR, AUDIO_DIR, GENERATED_IMAGES_DIR]:
    _dir.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def app_lifespan(_app: FastAPI):
    app_startup()
    try:
        yield
    finally:
        app_shutdown()


app = FastAPI(title="TokMatrix AI Studio", version="3.0.0", lifespan=app_lifespan)


app.include_router(nn_router, prefix="/api/nn", tags=["nuoinick"])

# Chỉ nhánh /v1 và /v3 của nn_router mới cần nằm thẳng dưới /api để giả lập API
# cục bộ của GPM/OMO. Mount cả router ở đây sẽ nuốt mất /api/settings,
# /api/vpn/stats và /api/vpn/catalog/{country} của chính ứng dụng này.
GPM_COMPAT_PREFIXES = ("/v1/", "/v2/", "/v3/")
gpm_compat_router = APIRouter()
gpm_compat_router.routes.extend(
    route for route in nn_router.routes
    if getattr(route, "path", "").startswith(GPM_COMPAT_PREFIXES)
)
app.include_router(gpm_compat_router, prefix="/api", tags=["baosam_local_api"])
app.include_router(image_router)
app.include_router(compare_native_router)
app.include_router(remake_router)
app.include_router(matrix_router)
app.include_router(script_router)
app.include_router(autopilot_router)
app.include_router(tiktok_api_router)
app.include_router(flow_router)
app.include_router(story_remake_router)
app.include_router(muse_film_router)
# Token phiên được giữ lại qua các lần khởi động lại server.
#
# Trước đây token sinh mới mỗi lần import, nên sau mỗi lần restart thì mọi tab
# đang mở đều mang cookie cũ và nhận 401 "Phiên truy cập không hợp lệ" cho toàn
# bộ /api/. Biểu hiện ra ngoài rất khó đoán: TTS không phát, ảnh không tải,
# nút bấm im lặng — trong khi backend hoàn toàn bình thường.
_SESSION_TOKEN_FILE = BASE_DIR / ".session_token"


def _load_or_create_session_token() -> str:
    try:
        existing = _SESSION_TOKEN_FILE.read_text(encoding="utf-8").strip()
        if len(existing) >= 32:
            return existing
    except OSError:
        pass
    token = secrets.token_urlsafe(32)
    try:
        _SESSION_TOKEN_FILE.write_text(token, encoding="utf-8")
        os.chmod(_SESSION_TOKEN_FILE, 0o600)
    except OSError:
        # Không ghi được thì vẫn chạy, chỉ là mất tính bền qua restart.
        pass
    return token


APP_SESSION_TOKEN = _load_or_create_session_token()

from bkt_web import webauth  # noqa: E402  (cần BASE_DIR ở trên)

# Khi chạy sau reverse proxy (nginx trên VPS), trình duyệt gửi Origin là hostname
# công khai chứ không phải 127.0.0.1, nên whitelist cứng sẽ chặn mọi POST. Chấp
# nhận thêm chính host mà request đi vào (same-origin) cùng danh sách cấu hình
# qua TOKMATRIX_ALLOWED_ORIGIN_HOSTS để không phải nới lỏng thành "cho phép tất".
LOCAL_ORIGIN_HOSTS = {"127.0.0.1", "localhost", "::1"}
EXTRA_ORIGIN_HOSTS = {
    h.strip().lower()
    for h in os.environ.get("TOKMATRIX_ALLOWED_ORIGIN_HOSTS", "").split(",")
    if h.strip()
}


def _origin_is_allowed(request: Request, origin: str) -> bool:
    hostname = (urllib.parse.urlparse(origin).hostname or "").lower()
    if not hostname:
        return False
    if hostname in LOCAL_ORIGIN_HOSTS or hostname in EXTRA_ORIGIN_HOSTS:
        return True
    forwarded = request.headers.get("x-forwarded-host", "")
    request_host = (forwarded.split(",")[0] or request.headers.get("host", "")).strip()
    # urlsplit tách cổng và IPv6 y hệt cách Origin được phân tích ở trên.
    request_hostname = (urllib.parse.urlsplit(f"//{request_host}").hostname or "").lower()
    return bool(request_hostname) and hostname == request_hostname


@app.middleware("http")
async def secure_local_session(request: Request, call_next):
    path = request.url.path
    client_host = request.client.host if request.client else ""
    is_local_api = (
        path.startswith("/api/v1/") or 
        path.startswith("/api/v2/") or 
        path.startswith("/api/v3/") or 
        path.startswith("/api/nn/v1/") or
        path.startswith("/api/gpm/") or
        path.startswith("/api/ai-images/") or
        path.startswith("/api/remake/")
    ) and client_host in {"127.0.0.1", "::1", "localhost", "testclient"}
    is_studio_public = path.startswith("/videos/")
    # Những đường dẫn ai cũng vào được: trang đăng nhập, tài nguyên tĩnh của nó,
    # và API nội bộ gọi từ chính máy chủ.
    is_login_path = path in {"/login", "/api/auth/login", "/favicon.ico"} or path.startswith("/static/")
    is_public_bootstrap = is_login_path or is_local_api

    # Chưa đặt tài khoản thì giữ nguyên hành vi cũ (cấp cookie cho mọi truy cập
    # vào "/") để không khoá người dùng ra ngoài sau khi cập nhật mã nguồn.
    auth_enabled = webauth.has_credentials()
    if not auth_enabled:
        is_public_bootstrap = is_public_bootstrap or path in {"/", "/favicon.ico"} or is_studio_public

    supplied = request.cookies.get("tokmatrix_session", "")
    logged_in = bool(
        webauth.read_session(request.cookies.get(webauth.COOKIE_NAME, ""), APP_SESSION_TOKEN)
    )

    # Cookie bootstrap kiểu cũ chỉ còn giá trị khi CHƯA đặt tài khoản. Nếu vẫn
    # chấp nhận nó sau khi bật đăng nhập thì bất kỳ ai từng mở trang trước đó
    # đều đi vòng qua được màn hình login.
    legacy_ok = (not auth_enabled) and hmac.compare_digest(supplied, APP_SESSION_TOKEN)

    if not is_public_bootstrap and not logged_in and not legacy_ok:
        # Trình duyệt mở trang thì đưa về màn hình đăng nhập; lời gọi API thì
        # trả 401 để phía JavaScript tự xử lý.
        wants_html = "text/html" in (request.headers.get("accept") or "")
        if auth_enabled and wants_html and request.method in {"GET", "HEAD"}:
            nxt = urllib.parse.quote(request.url.path, safe="/")
            return RedirectResponse(url=f"/login?next={nxt}", status_code=303)
        return JSONResponse(status_code=401, content={"detail": "Phiên truy cập không hợp lệ"})

    if request.method not in {"GET", "HEAD", "OPTIONS"} and not is_public_bootstrap:
        origin = request.headers.get("origin")
        if origin and not _origin_is_allowed(request, origin):
            return JSONResponse(status_code=403, content={"detail": "Origin không được phép"})

    response = await call_next(request)
    if path == "/" and (not auth_enabled or logged_in):
        response.set_cookie(
            "tokmatrix_session",
            APP_SESSION_TOKEN,
            httponly=True,
            samesite="strict",
            secure=False,
            path="/",
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    # Keep a compact audit trail for local state changes without ever storing
    # request bodies (which may contain cookies, API keys, or captions).
    if request.method not in {"GET", "HEAD", "OPTIONS"} and path.startswith("/api/"):
        try:
            conn = connect_db(DB_PATH)
            conn.execute(
                """
                INSERT INTO audit_events (method, path, status_code, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (request.method, path[:500], response.status_code, int(time.time())),
            )
            conn.commit()
            conn.close()
        except Exception:
            # Auditing must not turn an otherwise valid local request into a
            # failure; database health is covered by startup and smoke checks.
            pass
    return response


# ----------------------------------------------------------- Đăng nhập web ---
LOGIN_PAGE = BASE_DIR / "static" / "login.html"


@app.get("/login", include_in_schema=False)
def page_login(next: str = "/"):
    """Màn hình đăng nhập. Đã đăng nhập rồi thì khỏi hiện lại."""
    if not webauth.has_credentials():
        return RedirectResponse(url="/", status_code=303)
    try:
        return HTMLResponse(LOGIN_PAGE.read_text(encoding="utf-8"))
    except OSError:
        raise HTTPException(status_code=500, detail="Thiếu trang đăng nhập")


class LoginItem(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def api_auth_login(item: LoginItem, request: Request):
    if not webauth.has_credentials():
        raise HTTPException(status_code=409, detail="Chưa đặt tài khoản trên máy chủ")

    client = request.client.host if request.client else "?"
    if webauth.too_many_attempts(client):
        raise HTTPException(
            status_code=429,
            detail="Sai quá nhiều lần. Thử lại sau 10 phút.",
        )

    if not webauth.verify_password(item.username, item.password):
        webauth.record_failure(client)
        raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu")

    webauth.clear_attempts(client)
    token = webauth.issue_session(item.username.strip(), APP_SESSION_TOKEN)
    response = JSONResponse({"success": True, "username": item.username.strip()})
    secure = request.url.scheme == "https" or (
        request.headers.get("x-forwarded-proto", "") == "https"
    )
    response.set_cookie(
        webauth.COOKIE_NAME, token,
        max_age=webauth.SESSION_TTL_SECONDS,
        httponly=True, samesite="strict", secure=secure, path="/",
    )
    return response


@app.post("/api/auth/logout")
def api_auth_logout():
    response = JSONResponse({"success": True})
    response.delete_cookie(webauth.COOKIE_NAME, path="/")
    response.delete_cookie("tokmatrix_session", path="/")
    return response


@app.get("/api/auth/me")
def api_auth_me(request: Request):
    user = webauth.read_session(
        request.cookies.get(webauth.COOKIE_NAME, ""), APP_SESSION_TOKEN
    )
    return {
        "enabled": webauth.has_credentials(),
        "logged_in": bool(user),
        "username": user or "",
    }

# In-memory scan status tracking
scan_status = {
    "is_scanning": False,
    "total": 0,
    "completed": 0,
    "current_account": "",
    "errors": 0,
}
SCAN_LOCK = threading.Lock()

try:
    from bkt_web import vpn_manager
except ImportError:
    import vpn_manager

try:
    from bkt_web import nord_api
except ImportError:
    import nord_api

try:
    from bkt_web import profile_factory
except ImportError:
    import profile_factory

# --- Database Initialization ---
def record_channel_metrics(conn, ch_id: int, res: dict) -> None:
    """Ghi một mốc lịch sử mỗi lần quét kênh, để vẽ được biểu đồ tăng trưởng.

    Bảng `channels` chỉ giữ ảnh chụp hiện tại và bị ghi đè sau mỗi lần quét,
    nên nếu không lưu ở đây thì dữ liệu quá khứ mất vĩnh viễn.
    """
    try:
        conn.execute(
            """INSERT INTO channel_metrics_history
               (channel_id, captured_at, captured_ts, status, earned, balance, currency,
                rpm, follower_count, view_count, like_count, video_count)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                ch_id,
                time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
                int(time.time()),
                res.get("status", ""),
                res.get("earned", 0) or 0,
                res.get("balance", 0) or 0,
                res.get("currency", "") or "",
                res.get("rpm", 0) or 0,
                res.get("follower_count", 0) or 0,
                res.get("view_count", 0) or 0,
                res.get("like_count", 0) or 0,
                res.get("video_count", 0) or 0,
            ),
        )
    except Exception as exc:
        print(f"[History] Bỏ qua ghi lịch sử kênh {ch_id}: {exc}")


CHANNEL_CHECK_UPDATE_SQL = """
    UPDATE channels SET
        status=?,
        earned=?,
        balance=?,
        currency=?,
        rpm=?,
        country=?,
        kyc=?,
        username=CASE WHEN ?<>'' THEN ? ELSE username END,
        nickname=CASE WHEN ?<>'' THEN ? ELSE nickname END,
        video_count=CASE WHEN ?=1 THEN ? ELSE video_count END,
        follower_count=CASE WHEN ?=1 THEN ? ELSE follower_count END,
        like_count=CASE WHEN ?=1 THEN ? ELSE like_count END,
        view_count=CASE WHEN ?=1 THEN ? ELSE view_count END,
        last_checked=?
    WHERE id=?
"""


def refresh_channel_view_count(conn, ch_id: int) -> None:
    """Đồng bộ channels.view_count = tổng lượt xem các video đã lưu của kênh.

    Đây là nguồn duy nhất tính được tổng view: trang profile của TikTok không
    công bố tổng lượt xem của tài khoản, còn api/post/item_list thì đòi chữ ký.
    Chỉ ghi khi đã có ít nhất một video trong kho, để một lần quét hỏng không
    kéo con số thật về 0. Đồng thời bảo đảm video_count và like_count khớp với
    số lượng thực tế trong channel_videos (tránh bug có video/view nhưng video_count=0).
    """
    row = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(view_count), 0), COALESCE(SUM(like_count), 0) FROM channel_videos WHERE channel_id=?",
        (ch_id,),
    ).fetchone()
    if row and row[0]:
        conn.execute(
            """UPDATE channels SET
                view_count=?,
                video_count=MAX(video_count, ?),
                like_count=MAX(like_count, ?)
            WHERE id=?""",
            (row[1] or 0, row[0], row[2] or 0, ch_id),
        )


def apply_check_result(conn, ch_id: int, res: dict) -> None:
    """Ghi kết quả quét vào bảng channels rồi lưu một mốc lịch sử.

    Khi bước đọc profile hỏng (timeout, captcha, tunnel VPN rớt), res chỉ chứa
    giá trị mặc định 0. Ghi thẳng những số đó sẽ xoá sạch số liệu thật đang có —
    kênh có 1 video bỗng thành 0 video. Vì vậy video/follower/like/view chỉ được
    ghi đè khi res["profile_ok"] là True, còn username/nickname chỉ ghi đè khi
    lấy được giá trị khác rỗng.
    """
    ok = 1 if res.get("profile_ok") else 0
    uname = res.get("username") or ""
    nick = res.get("nickname") or ""
    conn.execute(CHANNEL_CHECK_UPDATE_SQL, (
        res["status"],
        res["earned"],
        res["balance"],
        res["currency"],
        res["rpm"],
        res["country"],
        res["kyc"],
        uname, uname,
        nick, nick,
        ok, res.get("video_count", 0),
        ok, res.get("follower_count", 0),
        ok, res.get("like_count", 0),
        0, 0,  # view_count: luôn giữ nguyên, do refresh_channel_view_count() quản
        int(time.time()),
        ch_id,
    ))
    refresh_channel_view_count(conn, ch_id)
    # Lịch sử phải khớp với giá trị thật sự đang lưu, nếu không biểu đồ tăng
    # trưởng sẽ có một cú rơi về 0 rồi bật lại ở lần quét sau.
    row = conn.execute(
        "SELECT video_count, follower_count, like_count, view_count FROM channels WHERE id=?",
        (ch_id,),
    ).fetchone()
    if row:
        res = {
            **res,
            "video_count": row[0] or 0,
            "follower_count": row[1] or 0,
            "like_count": row[2] or 0,
            "view_count": row[3] or 0,
        }
    record_channel_metrics(conn, ch_id, res)



def init_db():
    conn = connect_db(DB_PATH)
    configure_database(conn)
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cookie TEXT UNIQUE,
            note TEXT,
            status TEXT DEFAULT 'CHƯA CHECK',
            earned REAL DEFAULT 0.0,
            balance REAL DEFAULT 0.0,
            currency TEXT DEFAULT '#',
            rpm REAL DEFAULT 0.0,
            country TEXT DEFAULT 'KR',
            kyc TEXT DEFAULT 'No',
            username TEXT DEFAULT '',
            nickname TEXT DEFAULT '',
            last_checked INTEGER DEFAULT 0,
            video_count INTEGER DEFAULT 0,
            follower_count INTEGER DEFAULT 0,
            like_count INTEGER DEFAULT 0,
            view_count INTEGER DEFAULT 0,
            vpn_config TEXT DEFAULT '',
            vpn_location TEXT DEFAULT '',
            profile_dir TEXT DEFAULT ''
            , cookie_hash TEXT DEFAULT NULL
        )
    """)

    # Auto-migrate existing columns if missing
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS channel_metrics_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            captured_at TEXT,
            captured_ts INTEGER DEFAULT 0,
            status TEXT,
            earned REAL DEFAULT 0,
            balance REAL DEFAULT 0,
            currency TEXT DEFAULT '',
            rpm REAL DEFAULT 0,
            follower_count INTEGER DEFAULT 0,
            view_count INTEGER DEFAULT 0,
            like_count INTEGER DEFAULT 0,
            video_count INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_metrics_channel
        ON channel_metrics_history(channel_id, captured_ts DESC)
    """)
    cursor.execute("PRAGMA table_info(channels)")
    existing_cols = [row[1] for row in cursor.fetchall()]
    if "vpn_config" not in existing_cols:
        cursor.execute("ALTER TABLE channels ADD COLUMN vpn_config TEXT DEFAULT ''")
    if "vpn_location" not in existing_cols:
        cursor.execute("ALTER TABLE channels ADD COLUMN vpn_location TEXT DEFAULT ''")
    if "profile_dir" not in existing_cols:
        cursor.execute("ALTER TABLE channels ADD COLUMN profile_dir TEXT DEFAULT ''")
    if "cookie_hash" not in existing_cols:
        cursor.execute("ALTER TABLE channels ADD COLUMN cookie_hash TEXT DEFAULT NULL")
    if "session_state" not in existing_cols:
        cursor.execute("ALTER TABLE channels ADD COLUMN session_state TEXT DEFAULT ''")
    if "session_checked_at" not in existing_cols:
        cursor.execute("ALTER TABLE channels ADD COLUMN session_checked_at INTEGER DEFAULT 0")
    if "publisher" not in existing_cols:
        # Nhãn phân loại nguồn kênh (pub1 / pub2 / ...). '' = chưa gán.
        cursor.execute("ALTER TABLE channels ADD COLUMN publisher TEXT DEFAULT ''")
    if "nord_host" not in existing_cols:
        # Hostname NordVPN đang gán cho kênh (lấy động từ Nord API). '' = chưa gán.
        cursor.execute("ALTER TABLE channels ADD COLUMN nord_host TEXT DEFAULT ''")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS channel_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            video_id TEXT NOT NULL,
            desc TEXT DEFAULT '',
            cover_url TEXT DEFAULT '',
            duration INTEGER DEFAULT 0,
            create_time INTEGER DEFAULT 0,
            view_count INTEGER DEFAULT 0,
            like_count INTEGER DEFAULT 0,
            comment_count INTEGER DEFAULT 0,
            share_count INTEGER DEFAULT 0,
            is_original INTEGER DEFAULT 1,
            is_prohibited INTEGER DEFAULT 0,
            is_reviewing INTEGER DEFAULT 0,
            shadowban_status TEXT DEFAULT 'NORMAL',
            country TEXT DEFAULT 'DE',
            video_url TEXT DEFAULT '',
            UNIQUE(channel_id, video_id),
            FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS downloaded_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_url TEXT,
            platform TEXT DEFAULT 'TikTok',
            title TEXT DEFAULT '',
            author TEXT DEFAULT '',
            duration INTEGER DEFAULT 0,
            cover_url TEXT DEFAULT '',
            local_path TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            status TEXT DEFAULT 'COMPLETED',
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS download_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total INTEGER NOT NULL,
            completed INTEGER DEFAULT 0,
            failed INTEGER DEFAULT 0,
            status TEXT DEFAULT 'QUEUED',
            error_message TEXT DEFAULT '',
            created_at INTEGER DEFAULT 0,
            finished_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS render_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            input_video_path TEXT,
            output_video_path TEXT,
            title TEXT DEFAULT '',
            overlay_path TEXT DEFAULT '',
            audio_path TEXT DEFAULT '',
            flip INTEGER DEFAULT 1,
            speed REAL DEFAULT 1.04,
            crop_percent REAL DEFAULT 3.0,
            color_adjust INTEGER DEFAULT 1,
            use_gpu INTEGER DEFAULT 1,
            status TEXT DEFAULT 'COMPLETED',
            progress INTEGER DEFAULT 100,
            error_message TEXT DEFAULT '',
            created_at INTEGER DEFAULT 0,
            finished_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS upload_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER,
            video_path TEXT,
            caption TEXT DEFAULT '',
            hashtags TEXT DEFAULT '',
            schedule_time INTEGER DEFAULT 0,
            status TEXT DEFAULT 'PENDING',
            result_url TEXT DEFAULT '',
            error_message TEXT DEFAULT '',
            created_at INTEGER DEFAULT 0,
            uploaded_at INTEGER DEFAULT 0,
            FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    cursor.execute("PRAGMA table_info(upload_tasks)")
    upload_cols = [row[1] for row in cursor.fetchall()]
    upload_migrations = dict(publish_flow.UPLOAD_COLUMNS)
    for name, definition in upload_migrations.items():
        if name not in upload_cols:
            cursor.execute(f"ALTER TABLE upload_tasks ADD COLUMN {name} {definition}")

    # Encrypt legacy plaintext cookies and create a deterministic lookup hash.
    cursor.execute("SELECT id, cookie FROM channels")
    for channel_id, stored_cookie in cursor.fetchall():
        plain_cookie = SECRET_STORE.decrypt(stored_cookie or "")
        if not plain_cookie:
            continue
        cursor.execute(
            "UPDATE channels SET cookie=?, cookie_hash=? WHERE id=?",
            (SECRET_STORE.encrypt(plain_cookie), SECRET_STORE.fingerprint(plain_cookie), channel_id),
        )

    # Kênh chưa có cookie phải mang NULL, không phải '': SQLite coi hai chuỗi ''
    # là trùng nhau nên index duy nhất sẽ ném IntegrityError ngay lúc khởi động,
    # còn NULL thì luôn được coi là khác nhau. Dùng NULL giữ được ON CONFLICT
    # (cookie_hash) ở các lệnh upsert, thứ mà partial index sẽ làm hỏng.
    cursor.execute("UPDATE channels SET cookie_hash=NULL WHERE cookie_hash=''")
    # DB cũ mang partial index (WHERE cookie_hash != ''): CREATE ... IF NOT EXISTS
    # sẽ bỏ qua nó, khiến mọi lệnh ON CONFLICT(cookie_hash) ném lỗi "does not
    # match any PRIMARY KEY or UNIQUE constraint" và import luôn ra 0 dòng.
    legacy_index = cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_channels_cookie_hash'"
    ).fetchone()
    if legacy_index and legacy_index[0] and "WHERE" in legacy_index[0].upper():
        cursor.execute("DROP INDEX idx_channels_cookie_hash")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_cookie_hash ON channels(cookie_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channel_videos_channel_time ON channel_videos(channel_id, create_time DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_upload_tasks_due ON upload_tasks(status, schedule_time, next_retry_at)")
    cursor.execute("""CREATE TABLE IF NOT EXISTS channel_session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER, state TEXT,
        source TEXT, created_at INTEGER)""")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channel_session_events ON channel_session_events(channel_id, created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_render_tasks_status ON render_tasks(status, created_at)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_downloaded_videos_url ON downloaded_videos(original_url)")


    # Tự động đồng bộ video_count / like_count / view_count từ channel_videos nếu có video
    cursor.execute("""
        UPDATE channels SET
            view_count = (SELECT COALESCE(SUM(view_count), 0) FROM channel_videos WHERE channel_id = channels.id),
            video_count = MAX(video_count, (SELECT COUNT(*) FROM channel_videos WHERE channel_id = channels.id)),
            like_count = MAX(like_count, (SELECT COALESCE(SUM(like_count), 0) FROM channel_videos WHERE channel_id = channels.id))
        WHERE id IN (SELECT DISTINCT channel_id FROM channel_videos)
    """)

    conn.commit()
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC)")
    conn.commit()
    conn.close()

    moved = key_vault.migrate_legacy_keys()
    if moved:
        print(f"[KeyVault] Đã gom {len(moved)} khoá về kho chung: {', '.join(sorted(moved))}")

    sensitive_paths = [
        DB_PATH,
        SECRET_KEY_PATH,
        DATA_COOKIES_PATH,
        PROJECT_ROOT / "last_location" / "api_cookie.json",
        BASE_DIR / "37 uk.txt",
        BASE_DIR / "quy.txt",
    ]
    sensitive_paths.extend((BASE_DIR / "vpn_configs").glob("**/*.conf"))
    harden_file_permissions(sensitive_paths)

init_db()

# --- Helper: Parse Cookies ---
def parse_cookie_string(cookie_raw: str) -> Dict[str, str]:
    cookies = {}
    if not cookie_raw:
        return cookies
    for item in cookie_raw.strip().split(";"):
        if "=" in item:
            k, v = item.strip().split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies

def extract_country_from_cookie(cookie_dict: Dict[str, str]) -> str:
    for key in ["store-country-code", "store-country-code-src", "region"]:
        if key in cookie_dict and cookie_dict[key]:
            return cookie_dict[key].upper()
    return "KR"

def _blank_check_result(country: str = "") -> Dict[str, Any]:
    """Kết quả rỗng an toàn khi không quét được (giữ nguyên các cột số)."""
    return {
        "status": "CHƯA CHECK", "earned": 0.0, "balance": 0.0, "currency": "#",
        "rpm": 0.0, "country": (country or "").upper() or "KR", "kyc": "No",
        "username": "", "nickname": "", "video_count": 0, "follower_count": 0,
        "like_count": 0, "view_count": 0,
    }


def _note_username(note: str) -> str:
    return note.split(" ")[0].split("(")[0].strip().replace("@", "") if note else ""


def fill_profile_from_tiktok_api(res: Dict[str, Any], db_username: str = "", note: str = "") -> None:
    """Khi đọc trang profile qua VPN thất bại, lấy follower/tim/video từ TikTok API (chocode).

    Chỉ số liệu hồ sơ công khai; trạng thái BKT, doanh thu, ví, KYC vẫn chỉ đến
    từ cookie. API gọi từ máy chủ chocode nên không lộ IP/cookie của kênh.
    """
    username = res.get("username") or db_username or _note_username(note)
    if chocode_tiktok.fill_profile_stats(res, username):
        print(f"[Profile] @{username}: dùng số liệu hồ sơ từ TikTok API")
    elif res.get("profile_api_error"):
        print(f"[Profile] @{username}: TikTok API bỏ qua — {res['profile_api_error']}")


# --- VPN enforcement --------------------------------------------------------
# Chính sách: MỌI request chạm tới TikTok phải đi qua WireGuard VPN đúng vùng
# của kênh. Không có tunnel thì KHÔNG gọi thẳng (tránh lộ IP thật) — hàm gọi
# phải coi đó là lỗi và bỏ qua kênh.
CHANNEL_PROXY_IDLE_TTL = int(os.environ.get("TOKMATRIX_CHANNEL_PROXY_IDLE_TTL", "300"))


def _own_channel_proxy(ch_id: int, country: str = "", vpn_config: str = "") -> Dict[str, Any]:
    """Tunnel WireGuard từ config riêng của kênh (gán config chưa ai dùng nếu kênh chưa có). Lỗi thì
    báo lỗi, KHÔNG lùi về server dùng chung. Tunnel tự tắt sau CHANNEL_PROXY_IDLE_TTL giây không dùng."""
    from bkt_web import vpn_manager
    conf = (vpn_config or "").strip()
    if not conf:
        c = connect_db(DB_PATH)
        try:
            row = c.execute("SELECT vpn_config, country FROM channels WHERE id=?", (ch_id,)).fetchone()
        finally:
            c.close()
        conf = ((row[0] if row else "") or "").strip()
        country = country or ((row[1] if row else "") or "")
    if not conf:
        conf = vpn_manager.assign_unique_vpn(ch_id, country) or ""
        if not conf:
            return {"ok": False, "error": "Kênh chưa có VPN riêng và không còn config trống cùng nước để gán"}
    try:
        tunnel = vpn_manager.start_wireguard_proxy(ch_id, conf, idle_ttl=CHANNEL_PROXY_IDLE_TTL)
    except Exception as exc:
        return {"ok": False, "error": f"Không bật được VPN riêng của kênh ({vpn_manager.format_vpn_location(conf)}): {exc}"}
    return {
        "ok": True,
        "socks_port": tunnel["socks_port"],
        "socks5_url": tunnel["socks5_url"],
        "nord_host": "",
        "vpn_location": tunnel.get("location", ""),
    }


def ensure_channel_proxy(ch_id: int, country: str = "", vpn_config: str = "", nord_host: str = "") -> Dict[str, Any]:
    """Bảo đảm kênh có tunnel WireGuard đang chạy, trả về cổng SOCKS5.

    Nguồn VPN: lấy server WireGuard MỚI từ NordVPN API theo đúng quốc gia của
    kênh (không dùng file .conf tĩnh nữa). Server được chọn theo tải thấp nhất.
    Kênh nào đã gán sẵn hostname Nord thì tái dùng để giữ cùng một IP/vùng.
    Trả về {ok, socks_port, socks5_url, nord_host, vpn_location, error}.

    26/09: mặc định mỗi kênh dùng đúng config WireGuard riêng của nó (channels.vpn_config — cũng là
    đường lúc đăng bài), để một acc luôn ra từ MỘT IP riêng. Lối Nord động bên dưới dồn nhiều acc
    vào cùng server (61 acc trên uk6083, acc Đức ra IP Anh) → chỉ dùng khi TOKMATRIX_SHARED_NORD_PROXY=1.
    """
    if os.environ.get("TOKMATRIX_SHARED_NORD_PROXY", "0") != "1":
        return _own_channel_proxy(ch_id, country, vpn_config)
    VERIFIED_NORD_SERVERS = [
        ("uk2003.nordvpn.com", "K53l2wOIHU3262sX5N/5kAvCvt4r55lNui30EbvaDlE=", "GB • London #2003"),
        ("uk6083.nordvpn.com", "K53l2wOIHU3262sX5N/5kAvCvt4r55lNui30EbvaDlE=", "GB • London #6083"),
        ("uk6137.nordvpn.com", "K53l2wOIHU3262sX5N/5kAvCvt4r55lNui30EbvaDlE=", "GB • London #6137"),
        ("uk1741.nordvpn.com", "K53l2wOIHU3262sX5N/5kAvCvt4r55lNui30EbvaDlE=", "GB • London #1741"),
    ]

    cc = (country or "").strip().upper() or "DE"
    if cc == "UK":
        cc = "GB"

    host = (nord_host or "").strip()
    pub_key = ""
    city = ""
    name = ""

    # Các server Đức/Đông Âu hiện tại không nhận key WireGuard chung -> chuyển thẳng sang cụm UK đã xác thực
    use_fallback = (cc in {"DE", "BG", "LU"} or host.lower().startswith("de") or host.lower() == "uk6141.nordvpn.com")

    if not use_fallback and host:
        try:
            data = nord_api.get_nord_servers_for_country(cc)
            srv = next((x for x in data.get("servers", []) if x["hostname"].lower() == host.lower()), None)
            if srv:
                pub_key, city, name = srv["public_key"], srv.get("city", ""), srv.get("name", "")
            else:
                host = ""
        except Exception:
            host = ""

    if not use_fallback and not host:
        try:
            data = nord_api.get_nord_servers_for_country(cc)
            servers = data.get("servers", [])
            if servers:
                srv = servers[0]
                host, pub_key = srv["hostname"], srv["public_key"]
                city, name = srv.get("city", ""), srv.get("name", "")
            else:
                use_fallback = True
        except Exception:
            use_fallback = True

    if use_fallback or not host or not pub_key:
        fb_host, fb_key, fb_loc = VERIFIED_NORD_SERVERS[ch_id % len(VERIFIED_NORD_SERVERS)]
        host, pub_key, vpn_loc = fb_host, fb_key, fb_loc
    else:
        vpn_loc = " • ".join(x for x in (cc, city, name) if x) or host

    try:
        tunnel = nord_api.start_dynamic_nord_tunnel(host, pub_key)
    except Exception as exc:
        # Nếu server được chọn bị lỗi, thử fallback server an toàn
        fb_host, fb_key, fb_loc = VERIFIED_NORD_SERVERS[ch_id % len(VERIFIED_NORD_SERVERS)]
        try:
            tunnel = nord_api.start_dynamic_nord_tunnel(fb_host, fb_key)
            host, vpn_loc = fb_host, fb_loc
        except Exception:
            return {"ok": False, "error": f"Không bật được NordVPN tunnel ({host}): {exc}"}

    # Ghi lại server + nhãn hiển thị để lần sau tái dùng và hiện lên UI.
    try:
        c = connect_db(DB_PATH)
        c.execute("UPDATE channels SET nord_host=?, vpn_location=? WHERE id=?", (host, vpn_loc, ch_id))
        c.commit(); c.close()
    except Exception:
        pass

    return {
        "ok": True,
        "socks_port": tunnel["socks_port"],
        "socks5_url": tunnel["socks5_url"],
        "nord_host": host,
        "vpn_location": vpn_loc,
    }


# --- Core Checker Function ---
def check_single_cookie_live(cookie_str: str, note: str = "", socks_port: Optional[int] = None) -> Dict[str, Any]:
    cookie_dict = parse_cookie_string(cookie_str)
    country = extract_country_from_cookie(cookie_dict)

    res = {
        "status": "DIE",
        "earned": 0.0,
        "balance": 0.0,
        "currency": "#",
        "rpm": 0.0,
        "country": country,
        "kyc": "No",
        "username": "",
        "nickname": "",
        "note": note,
        "video_count": 0,
        "follower_count": 0,
        "like_count": 0,
        "view_count": 0,
        # Chỉ True khi thực sự đọc được stats từ trang profile. Khi False, các
        # chỉ số ở trên là giá trị mặc định chứ không phải số liệu thật, nên
        # người gọi KHÔNG được ghi đè dữ liệu cũ bằng chúng.
        "profile_ok": False,
    }

    # If it's a demo/mock cookie with prefilled notes from user screenshot
    if "demo" in cookie_str.lower() or "mock" in cookie_str.lower() or len(cookie_str) < 30:
        res["status"] = "BKT"
        res["country"] = country or "KR"
        res["currency"] = "#"
        return res

    if not socks_port:
        # Không có tunnel VPN => không gọi thẳng TikTok (chống lộ IP thật).
        res["status"] = "LỖI VPN"
        res["error"] = "Chưa thiết lập được VPN vùng cho kênh"
        return res

    session = requests.Session(impersonate="chrome120")
    if socks_port:
        # Ép toàn bộ lưu lượng (kể cả DNS: socks5h) qua tunnel WireGuard của kênh.
        proxy_url = f"socks5h://127.0.0.1:{socks_port}"
        session.proxies = {"http": proxy_url, "https": proxy_url}
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.tiktok.com/",
        "Accept": "application/json, text/plain, */*",
    })
    session.cookies.update(cookie_dict)

    # 1. Check Login / Account info
    try:
        acc_resp = session.get("https://www.tiktok.com/passport/web/account/info/", timeout=12)
        if acc_resp.status_code == 200:
            acc_data = acc_resp.json()
            if acc_data.get("message") == "success" and "data" in acc_data:
                ud = acc_data["data"]
                res["username"] = ud.get("username", "")
                res["nickname"] = ud.get("screen_name", "")
                if ud.get("country_code"):
                    res["country"] = ud["country_code"].upper()
                res["status"] = "CHƯA BKT"
            else:
                res["status"] = "DIE"
                return res
        else:
            res["status"] = "DIE"
            return res
    except Exception as exc:
        res["status"] = "LỖI MẠNG"
        res["error"] = str(exc)
        return res

    # 2. Check Creator Rewards
    apis = [
        "https://www.tiktok.com/creator-center/api/creator/overview",
        "https://www.tiktok.com/api/v1/creator_rewards/overview/",
        "https://www.tiktok.com/api/v1/creator/monetization/overview/",
    ]
    for url in apis:
        try:
            r = session.get(url, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if "data" in data and isinstance(data["data"], dict):
                    d = data["data"]
                    res["status"] = "BKT"
                    res["earned"] = float(d.get("estimated_rewards", d.get("total_earned", 0.0)) or 0.0)
                    res["rpm"] = float(d.get("rpm", d.get("qualified_views_rpm", 0.0)) or 0.0)
                    res["currency"] = d.get("currency", "#")
                    break
        except Exception:
            continue

    # 3. Check Wallet
    try:
        w_resp = session.get("https://www.tiktok.com/api/wallet/v1/home/", timeout=10)
        if w_resp.status_code == 200:
            wd = w_resp.json().get("data", {})
            if "balance" in wd:
                res["balance"] = float(wd.get("balance", 0.0) or 0.0)
            if wd.get("kyc_status") in (1, True, "VERIFIED"):
                res["kyc"] = "Yes"
    except Exception:
        pass

    # 4. Fetch Profile Stats (Videos, Followers, Likes, Views)
    target_username = res["username"] or (note.split(" ")[0].split("(")[0].strip().replace("@", "") if note else "")
    if target_username:
        try:
            prof_headers = {
                "Referer": f"https://www.tiktok.com/@{target_username}",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            prof_resp = session.get(f"https://www.tiktok.com/@{target_username}", headers=prof_headers, timeout=12)
            match = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">(.*?)</script>', prof_resp.text)
            if match:
                p_data = json.loads(match.group(1))
                p_ud = p_data.get("__DEFAULT_SCOPE__", {}).get("webapp.user-detail", {}).get("userInfo", {})
                st = p_ud.get("stats", {}) or p_ud.get("statsV2", {})
                u_info = p_ud.get("user", {})
                if u_info.get("nickname"):
                    res["nickname"] = u_info["nickname"]
                res["video_count"] = int(st.get("videoCount", 0))
                res["follower_count"] = int(st.get("followerCount", 0))
                res["like_count"] = int(st.get("heartCount", st.get("heart", 0)))
                res["profile_ok"] = bool(st)

                # KHÔNG gọi /api/post/item_list ở đây: TikTok đòi chữ ký thiết bị
                # (msToken/X-Bogus) cho endpoint này, request không ký nhận về
                # HTTP 200 với body RỖNG, nên .json() ném lỗi và view_count âm
                # thầm nằm lại 0 cho mọi kênh. Tổng lượt xem được tính từ bảng
                # channel_videos — dữ liệu do đường Playwright (trình duyệt thật,
                # có ký) lấy về — xem refresh_channel_view_count().
        except Exception as e:
            print(f"[Profile] Error {target_username}: {e}")

    return res

# --- API Models ---
class ImportItem(BaseModel):
    lines: str = Field(max_length=10 * 1024 * 1024)  # Format: "cookie" or "cookie | note"
    publisher: str = Field(default="", max_length=32)  # Nhãn nguồn kênh: pub1 / pub2 / ...

class UpdateNoteItem(BaseModel):
    note: str = Field(max_length=500)

# --- Endpoints ---
@app.get("/api/channels")
def get_channels():
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, note, status, earned, balance, currency, rpm, country, kyc, username, nickname, last_checked,
               video_count, follower_count, like_count, view_count, vpn_config, vpn_location, profile_dir,
               publisher, COALESCE(original_country, country) as original_country,
               COALESCE(session_state,''), COALESCE(session_checked_at,0)
        FROM channels ORDER BY id DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    channels = []
    total_earned = 0.0
    total_balance = 0.0
    total_bkt = 0
    total_rpm = 0.0
    total_followers = 0
    total_videos = 0
    total_likes = 0
    total_views = 0
    bkt_count_for_rpm = 0

    for r in rows:
        ch = {
            "id": r[0],
            "note": r[1] or "",
            "status": r[2] or "CHƯA CHECK",
            "earned": r[3] or 0.0,
            "balance": r[4] or 0.0,
            "currency": r[5] or "#",
            "rpm": r[6] or 0.0,
            "country": r[7] or "",
            "kyc": r[8] or "No",
            "username": r[9] or "",
            "nickname": r[10] or "",
            "last_checked": r[11] or 0,
            "video_count": r[12] or 0,
            "follower_count": r[13] or 0,
            "like_count": r[14] or 0,
            "view_count": r[15] or 0,
            "vpn_config": r[16] or "",
            "vpn_location": r[17] or "",
            "profile_dir": r[18] or "",
            "publisher": r[19] or "",
            "original_country": r[20] or r[7] or "",
            "session_state": r[21] or "",
            "session_checked_at": r[22] or 0,
            "has_cookie": True,
        }
        channels.append(ch)
        total_earned += ch["earned"]
        total_balance += ch["balance"]
        total_followers += ch["follower_count"]
        total_videos += ch["video_count"]
        total_likes += ch["like_count"]
        total_views += ch["view_count"]
        if ch["status"] == "BKT":
            total_bkt += 1
            if ch["rpm"] > 0:
                total_rpm += ch["rpm"]
                bkt_count_for_rpm += 1

    avg_rpm = round(total_rpm / bkt_count_for_rpm, 2) if bkt_count_for_rpm > 0 else 0.0

    return {
        "channels": channels,
        "stats": {
            "total_accounts": len(channels),
            "total_bkt": total_bkt,
            "total_earned": round(total_earned, 2),
            "total_balance": round(total_balance, 2),
            "total_followers": total_followers,
            "total_videos": total_videos,
            "total_likes": total_likes,
            "total_views": total_views,
            "avg_rpm": avg_rpm,
        },
        "scan_status": scan_status,
    }


@app.post("/api/channels/{ch_id}/cookie")
def reveal_channel_cookie(ch_id: int):
    """Reveal one cookie only after an explicit user action in the local UI."""
    conn = connect_db(DB_PATH)
    row = conn.execute("SELECT cookie FROM channels WHERE id=?", (ch_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")
    return {"cookie": SECRET_STORE.decrypt(row[0])}

def normalize_publisher(value: str) -> str:
    """Chuẩn hoá nhãn publisher: chỉ giữ a-z, 0-9, '_' và '-'; '' = chưa gán."""
    slug = re.sub(r"[^a-z0-9_-]", "", (value or "").strip().lower())
    return slug[:32]


def parse_account_line(line: str) -> tuple[str, str, str]:
    """
    Parses an account line.
    Returns: (cookie, note, username)
    Supports:
    - 7-part pipe format: idTiktok|password|email|passmail|refreshToken|clientId|cookie
    - 2-part pipe format: cookie | note or note | cookie
    - Raw cookie string
    """
    line = line.strip()
    if not line or line.startswith("Định dạng") or line.startswith("idTiktok"):
        return "", "", ""

    parts = line.split("|")
    if len(parts) >= 7:
        username = parts[0].strip()
        cookie = parts[6].strip()
        email = parts[2].strip() if len(parts) > 2 else ""
        note = f"{username} ({email})" if email else username
        return cookie, note, username

    if len(parts) == 2:
        p0, p1 = parts[0].strip(), parts[1].strip()
        if "sessionid" in p0 or "store-country" in p0 or "ttwid" in p0:
            return p0, p1, ""
        else:
            return p1, p0, ""

    # Raw cookie
    return line, "", ""

@app.post("/api/channels/import")
def import_channels(item: ImportItem):
    lines = [l.strip() for l in item.lines.split("\n") if l.strip()]
    if not lines:
        raise HTTPException(status_code=400, detail="Không có cookie nào được nhập")

    conn = connect_db(DB_PATH)
    cursor = conn.cursor()

    imported_count = 0
    now = int(time.time())
    publisher = normalize_publisher(item.publisher)

    for line in lines:
        cookie, note, username = parse_account_line(line)
        if not cookie:
            continue

        c_dict = parse_cookie_string(cookie)
        country = extract_country_from_cookie(c_dict)
        picked_vpn = vpn_manager.pick_random_vpn(country)
        vpn_conf = picked_vpn["rel_path"] if picked_vpn else ""
        vpn_loc = picked_vpn["label"] if picked_vpn else ""

        try:
            cookie_hash = SECRET_STORE.fingerprint(cookie)
            cursor.execute("""
                INSERT INTO channels (cookie, cookie_hash, note, status, country, username, vpn_config, vpn_location, last_checked, publisher)
                VALUES (?, ?, ?, 'CHƯA CHECK', ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cookie_hash) DO UPDATE SET
                    note=CASE WHEN excluded.note != '' THEN excluded.note ELSE channels.note END,
                    username=CASE WHEN excluded.username != '' THEN excluded.username ELSE channels.username END,
                    country=CASE WHEN excluded.country != '' THEN excluded.country ELSE channels.country END,
                    vpn_config=CASE WHEN channels.vpn_config = '' THEN excluded.vpn_config ELSE channels.vpn_config END,
                    vpn_location=CASE WHEN channels.vpn_location = '' THEN excluded.vpn_location ELSE channels.vpn_location END,
                    publisher=CASE WHEN excluded.publisher != '' THEN excluded.publisher ELSE channels.publisher END
            """, (SECRET_STORE.encrypt(cookie), cookie_hash, note, country, username, vpn_conf, vpn_loc, now, publisher))
            imported_count += 1
        except Exception as e:
            print(f"[Import] Warning: {e}")

    conn.commit()
    conn.close()
    return {"message": f"Đã nhập thành công {imported_count} tài khoản/cookie", "count": imported_count}

class ImportFileItem(BaseModel):
    file_path: str = Field(min_length=1, max_length=500)
    publisher: str = Field(default="", max_length=32)

@app.post("/api/channels/import-file")
def import_from_file(item: ImportFileItem):
    try:
        f_path = safe_child(PROJECT_ROOT, item.file_path, must_exist=True)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=400, detail="File phải nằm trong thư mục dự án")
    if not f_path.is_file() or f_path.stat().st_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File import không hợp lệ hoặc vượt quá 10 MB")

    try:
        with open(f_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return import_channels(ImportItem(lines=content, publisher=item.publisher))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file {f_path.name}: {e}")


class PublisherAssignItem(BaseModel):
    ids: List[int] = Field(default_factory=list, max_length=5000)
    publisher: str = Field(default="", max_length=32)


@app.post("/api/channels/publisher")
def assign_publisher(item: PublisherAssignItem):
    """Gán / gỡ nhãn publisher (pub1, pub2, ...) cho danh sách kênh."""
    ids = [int(i) for i in item.ids if isinstance(i, int) or str(i).isdigit()]
    if not ids:
        raise HTTPException(status_code=400, detail="Chưa chọn kênh nào")

    publisher = normalize_publisher(item.publisher)
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in ids)
    cursor.execute(
        f"UPDATE channels SET publisher=? WHERE id IN ({placeholders})",
        (publisher, *ids),
    )
    changed = cursor.rowcount
    conn.commit()
    conn.close()

    label = publisher.upper() if publisher else "Chưa gán"
    return {"message": f"Đã gán {changed} kênh vào {label}", "count": changed, "publisher": publisher}


@app.post("/api/channels/import-sample")
def import_sample_data():
    """Seeds the exact 12 sample accounts from the user's screenshot for instant demonstration."""
    sample_channels = [
        {"note": "News", "earned": 4.36, "rpm": 1.67, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_news_01; msToken=5Wo_demo_1"},
        {"note": "News", "earned": 3.24, "rpm": 1.68, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_news_02; msToken=5Wo_demo_2"},
        {"note": "News", "earned": 2.10, "rpm": 1.99, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_news_03; msToken=5Wo_demo_3"},
        {"note": "KNN NEWS", "earned": 0.30, "rpm": 2.41, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_knn; msToken=5Wo_demo_4"},
        {"note": "@newsenTV", "earned": 0.00, "rpm": 0.00, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_newsen; msToken=5Wo_demo_5"},
        {"note": "YTN News", "earned": 0.09, "rpm": 0.31, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_ytn; msToken=5Wo_demo_6"},
        {"note": "News SBS", "earned": 1.08, "rpm": 1.81, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_sbs; msToken=5Wo_demo_7"},
        {"note": "ChannelA ...", "earned": 0.11, "rpm": 1.30, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_channela; msToken=5Wo_demo_8"},
        {"note": "Newhan04", "earned": 0.00, "rpm": 0.00, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "msToken=5Wo_newhan04; store-country-code=kr; sessionid=demo_newhan04"},
        {"note": "Newhan05", "earned": 0.53, "rpm": 0.91, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_newhan05; msToken=5Wo_demo_9"},
        {"note": "Newhan06", "earned": 0.00, "rpm": 0.00, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_newhan06; msToken=5Wo_demo_10"},
        {"note": "SKK ...", "earned": 0.00, "rpm": 0.00, "kyc": "No", "status": "BKT", "qg": "KR", "cookie": "store-country-code=kr; sessionid=demo_skk; msToken=5Wo_demo_11"},
    ]

    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    now = int(time.time())

    for ch in sample_channels:
        cursor.execute("""
            INSERT INTO channels (cookie, cookie_hash, note, status, earned, rpm, country, kyc, currency, last_checked)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '#', ?)
            ON CONFLICT(cookie_hash) DO UPDATE SET
                note=excluded.note,
                status=excluded.status,
                earned=excluded.earned,
                rpm=excluded.rpm,
                country=excluded.country,
                kyc=excluded.kyc
        """, (SECRET_STORE.encrypt(ch["cookie"]), SECRET_STORE.fingerprint(ch["cookie"]), ch["note"], ch["status"], ch["earned"], ch["rpm"], ch["qg"], ch["kyc"], now))

    conn.commit()
    conn.close()
    return {"message": "Đã nạp 12 tài khoản mẫu chuẩn từ ảnh giao diện của bạn!", "count": len(sample_channels)}

@app.post("/api/channels/import-from-data-cookies")
def import_from_local_database():
    """Imports active sessions from data/Cookies if available."""
    if not DATA_COOKIES_PATH.exists():
        raise HTTPException(status_code=404, detail="File data/Cookies không tồn tại")

    try:
        from ssmatool_engine_mac.cookie_manager import CookieManager
        cookies = CookieManager.load_from_sqlite(DATA_COOKIES_PATH)
        c_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies if c.get("value")])

        if not c_str:
            raise HTTPException(status_code=400, detail="Không tìm thấy cookie hợp lệ trong data/Cookies")

        country = "KR"
        for c in cookies:
            if c.get("name") == "store-country-code":
                country = c.get("value", "KR").upper()

        conn = connect_db(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO channels (cookie, cookie_hash, note, status, country, last_checked)
            VALUES (?, ?, ?, 'CHƯA CHECK', ?, ?)
            ON CONFLICT(cookie_hash) DO NOTHING
        """, (SECRET_STORE.encrypt(c_str), SECRET_STORE.fingerprint(c_str), f"Profile Gốc ({country})", country, int(time.time())))
        conn.commit()
        conn.close()
        return {"message": "Đã nạp thành công Cookie từ database data/Cookies!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc data/Cookies: {e}")

def run_scan_worker():
    global scan_status
    try:
        _run_scan_worker_inner()
    finally:
        # Không có finally ở đây thì một lỗi sớm (DB khoá, file hỏng) sẽ để cờ
        # is_scanning kẹt True vĩnh viễn và chặn mọi lần quét sau.
        with SCAN_LOCK:
            scan_status["is_scanning"] = False


def _run_scan_worker_inner():
    global scan_status
    with SCAN_LOCK:
        scan_status["is_scanning"] = True

    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, cookie, note, country, nord_host, username FROM channels")
    rows = cursor.fetchall()
    conn.close()

    with SCAN_LOCK:
        scan_status["total"] = len(rows)
        scan_status["completed"] = 0
        scan_status["errors"] = 0

    def check_and_update(item):
        ch_id, stored_cookie, note, country, nord_host, db_username = item
        cookie = SECRET_STORE.decrypt(stored_cookie)
        with SCAN_LOCK:
            scan_status["current_account"] = note or f"ID {ch_id}"
        try:
            prox = ensure_channel_proxy(ch_id, country=country or "", nord_host=nord_host or "")
            if not prox["ok"]:
                res = {**_blank_check_result(country), "status": "LỖI VPN", "error": prox.get("error", "")}
            else:
                res = check_single_cookie_live(cookie, note=note, socks_port=prox["socks_port"])
            fill_profile_from_tiktok_api(res, db_username or "", note or "")
            c_conn = connect_db(DB_PATH)
            apply_check_result(c_conn, ch_id, res)
            c_conn.commit()
            c_conn.close()
        except Exception as e:
            with SCAN_LOCK:
                scan_status["errors"] += 1
            print(f"[Scan] Error checking ID {ch_id}: {e}")
        finally:
            with SCAN_LOCK:
                scan_status["completed"] += 1

    # Conservative concurrency avoids TikTok rate limits and SQLite write spikes.
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(check_and_update, rows))

    with SCAN_LOCK:
        scan_status["current_account"] = "Hoàn tất"

@app.post("/api/channels/check-all")
def check_all_channels(background_tasks: BackgroundTasks):
    global scan_status
    with SCAN_LOCK:
        if scan_status["is_scanning"]:
            return {"message": "Đang trong quá trình quét, vui lòng chờ..."}
        scan_status["is_scanning"] = True

    background_tasks.add_task(run_scan_worker)
    return {"message": "Bắt đầu quét hàng loạt toàn bộ kênh!"}

@app.post("/api/channels/check-single/{ch_id}")
def check_single_channel(ch_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT cookie, note, country, nord_host, username FROM channels WHERE id=?", (ch_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")

    cookie, note = SECRET_STORE.decrypt(row[0]), row[1]
    prox = ensure_channel_proxy(ch_id, country=row[2] or "", nord_host=row[3] or "")
    if not prox["ok"]:
        conn.close()
        raise HTTPException(status_code=502, detail=prox.get("error", "Không bật được VPN vùng cho kênh"))
    res = check_single_cookie_live(cookie, note=note, socks_port=prox["socks_port"])
    fill_profile_from_tiktok_api(res, row[4] or "", note or "")

    apply_check_result(conn, ch_id, res)
    conn.commit()
    conn.close()
    return {"message": "Đã cập nhật kênh thành công", "result": res}

def evaluate_video_diagnostics(video_item: dict, channel_country: str = "DE", author_username: str = "") -> dict:
    """
    Evaluates:
    - Shadowban / FYP status:
        - NORMAL: 🟢 Đạt xu hướng FYP (Bình thường)
        - UNORIGINAL_RESTRICTED: 🟠 Trùng lặp / Reup (Bị thuật toán loại khỏi FYP)
        - FLOP_0VIEW: 🟡 Cảnh báo Flop (0-View sau >24h)
        - LOW_REACH: 🟡 Phân phối thấp
        - BANNED: 🔴 Bị chặn / Vi phạm chính sách
        - REVIEWING: ⚪ Đang xét duyệt
        - PRIVATE_RESTRICTED: 🔒 Chỉ bạn bè / Riêng tư
    - Duplicate check (originalItem: True/False)
    - Time & duration
    - Target country
    """
    v_id = str(video_item.get("id") or video_item.get("video_id") or "")
    desc = video_item.get("desc") or ""
    create_time = int(video_item.get("createTime") or video_item.get("create_time") or time.time())
    
    v_obj = video_item.get("video", {})
    duration = int(v_obj.get("duration") or video_item.get("duration") or 0)
    cover_url = v_obj.get("cover") or v_obj.get("originCover") or video_item.get("cover_url") or ""
    
    st = video_item.get("stats", {}) or video_item.get("statsV2", {})
    view_count = int(st.get("playCount") or video_item.get("view_count") or 0)
    like_count = int(st.get("diggCount") or video_item.get("like_count") or 0)
    comment_count = int(st.get("commentCount") or video_item.get("comment_count") or 0)
    share_count = int(st.get("shareCount") or video_item.get("share_count") or 0)
    
    penalty_ctx = video_item.get("penaltyContext") or {}
    display_penalty_type = int(penalty_ctx.get("display_penalty_type") or 0)
    display_policy = int(penalty_ctx.get("display_policy") or 0)
    
    # Authentic TikTok unoriginal content check:
    # Do NOT rely on internal 'originalItem' flag which is False for all standard user uploads.
    # A true duplicate / reup penalty occurs when display_penalty_type > 0, display_policy > 0,
    # or an explicit unoriginal flag is set by moderation.
    is_unoriginal = (
        display_penalty_type > 0
        or display_policy > 0
        or video_item.get("is_unoriginal") is True
        or penalty_ctx.get("unoriginal") is True
    )
    is_orig = 0 if is_unoriginal else 1
    
    is_prohib = 1 if video_item.get("isProhibited") in (True, 1) else 0
    is_review = 1 if video_item.get("isReviewing") in (True, 1) else 0
    is_friend_only = 1 if video_item.get("forFriend") in (True, 1) or video_item.get("privateItem") in (True, 1) else 0
    
    now = int(time.time())
    age_hours = (now - create_time) / 3600
    
    if is_prohib:
        shadow_status = "BANNED"
    elif is_review:
        shadow_status = "REVIEWING"
    elif is_friend_only:
        shadow_status = "PRIVATE_RESTRICTED"
    elif is_orig == 0:
        shadow_status = "UNORIGINAL_RESTRICTED"
    elif age_hours > 24 and view_count == 0:
        shadow_status = "FLOP_0VIEW"
    elif age_hours > 24 and view_count < 10:
        shadow_status = "LOW_REACH"
    else:
        shadow_status = "NORMAL"

    lang_to_country = {
        "ko": "KR",
        "vi": "VN",
        "ja": "JP",
        "en": "US",
        "de": "DE",
        "fr": "FR",
        "es": "ES",
        "th": "TH",
        "id": "ID",
        "zh": "CN",
        "pt": "BR",
        "ru": "RU",
        "it": "IT",
    }
    raw_country = (channel_country or "").strip().upper()
    if len(raw_country) == 2 and raw_country != "KO":
        country = raw_country
    else:
        text_lang = (video_item.get("textLanguage") or "").lower()
        country = lang_to_country.get(text_lang) or "KR"
        
    v_url = video_item.get("video_url") or (f"https://www.tiktok.com/@{author_username}/video/{v_id}" if author_username and v_id else "")

    return {
        "video_id": v_id,
        "desc": desc,
        "cover_url": cover_url,
        "duration": duration,
        "create_time": create_time,
        "view_count": view_count,
        "like_count": like_count,
        "comment_count": comment_count,
        "share_count": share_count,
        "is_original": is_orig,
        "is_prohibited": is_prohib,
        "is_reviewing": is_review,
        "shadowban_status": shadow_status,
        "country": country.upper(),
        "video_url": v_url
    }

async def fetch_tiktok_videos_real(username: str, cookie_str: str, max_wait: float = 45.0, socks_port: Optional[int] = None, channel_id: Optional[int] = None) -> tuple[list, bool, str]:
    """
    Interception using system Chrome with authentic session cookies.
    Captures genuine TikTok item_list network response for the target account.

    Trả về (videos, captured, reason). `reason` mô tả vì sao không lấy được dữ
    liệu: trước đây mọi thất bại đều bị nuốt và người dùng chỉ thấy một lỗi 502
    trống, không phân biệt được "kênh không có video", "TikTok chặn" hay "hết
    giờ chờ" — ba tình huống cần ba cách xử lý khác hẳn nhau.
    """
    if not username:
        return [], False, "Kênh chưa có username để tra cứu"

    # Không có tunnel thì DỪNG, không gọi thẳng TikTok. Trước đây proxy chỉ được
    # gắn khi `socks_port` có giá trị, nên một lời gọi thiếu tham số sẽ lặng lẽ
    # mở TikTok bằng IP thật của máy chủ kèm cookie thật của kênh — đúng thứ
    # toàn bộ hệ thống VPN này sinh ra để tránh. check_single_cookie_live đã
    # chặn như vậy từ đầu; hai hàm Playwright thì chưa.
    if not socks_port:
        return [], False, "Chưa thiết lập được VPN vùng cho kênh; không gọi TikTok bằng IP máy chủ"

    cookie_list = []
    if cookie_str:
        for part in cookie_str.split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                cookie_list.append({
                    "name": k.strip(),
                    "value": v.strip(),
                    "domain": ".tiktok.com",
                    "path": "/",
                })

    videos = []
    response_captured = False
    event = asyncio.Event()
    # Ghi lại đúng những gì TikTok trả về cho item_list để chẩn đoán được.
    seen_item_list: list[tuple[int, int]] = []
    nav_error = ""

    from bkt_web import profile_session
    try:
        async with async_playwright() as p, \
                profile_session.scan_context(p, channel_id, socks_port, cookie_list, "scan-videos") as (context, mode):
            print(f"[Playwright] Quét video @{username} bằng đường {mode}")
            page = await context.new_page()

            async def on_response(response):
                nonlocal response_captured
                if "api/post/item_list" in response.url:
                    try:
                        body = await response.body()
                        seen_item_list.append((response.status, len(body)))
                        data = json.loads(body) if body else {}
                        if "itemList" in data:
                            response_captured = True
                            for item in data["itemList"]:
                                author_uid = (item.get("author", {}).get("uniqueId") or "").lower()
                                if not author_uid or author_uid == username.lower():
                                    videos.append(item)
                        event.set()
                    except Exception:
                        event.set()

            page.on("response", on_response)
            try:
                await page.goto(f"https://www.tiktok.com/@{username}", wait_until="domcontentloaded", timeout=int(max_wait * 1000))
                try:
                    await asyncio.wait_for(event.wait(), timeout=15.0)
                except asyncio.TimeoutError:
                    pass
            except Exception as e:
                nav_error = str(e)
                print(f"[Playwright] Notice navigating @{username}: {e}")
    except profile_session.ProfileBusy:
        return [], False, "Chrome profile của kênh đang mở — bỏ qua lần quét này"
    except Exception as e:
        nav_error = str(e)
        print(f"[Playwright] Error fetching videos for @{username}: {e}")

    if response_captured:
        return videos, True, ""
    if nav_error:
        return videos, False, f"Không mở được trang @{username}: {nav_error[:200]}"
    if not seen_item_list:
        return videos, False, (
            f"TikTok không gọi API danh sách video cho @{username} trong 15 giây "
            "(trang có thể đang hiện xác minh, hoặc kênh không tồn tại)"
        )
    empty = [s for s in seen_item_list if s[1] == 0]
    if empty:
        return videos, False, (
            f"TikTok trả phản hồi RỖNG cho API danh sách video của @{username} "
            f"(HTTP {empty[0][0]}, 0 byte). Máy chủ này đang bị TikTok chặn đọc "
            "danh sách video — thường do IP trung tâm dữ liệu/VPN. Cookie và VPN "
            "của kênh vẫn hoạt động bình thường."
        )
    return videos, False, (
        f"API danh sách video của @{username} trả dữ liệu không đọc được: {seen_item_list}"
    )

def store_channel_videos(cursor, ch_id: int, found_videos: List[dict], replace: bool) -> None:
    """Lưu video đã chẩn đoán vào channel_videos và cập nhật tổng của kênh."""
    if replace:
        cursor.execute("DELETE FROM channel_videos WHERE channel_id=?", (ch_id,))

    # Save authentic videos to SQLite
    total_views = 0
    total_likes = 0
    for v in found_videos:
        total_views += v["view_count"]
        total_likes += v["like_count"]
        cursor.execute("""
            INSERT INTO channel_videos (
                channel_id, video_id, desc, cover_url, duration, create_time,
                view_count, like_count, comment_count, share_count,
                is_original, is_prohibited, is_reviewing, shadowban_status,
                country, video_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel_id, video_id) DO UPDATE SET
                desc=excluded.desc,
                cover_url=excluded.cover_url,
                duration=excluded.duration,
                view_count=excluded.view_count,
                like_count=excluded.like_count,
                comment_count=excluded.comment_count,
                share_count=excluded.share_count,
                is_original=excluded.is_original,
                is_prohibited=excluded.is_prohibited,
                is_reviewing=excluded.is_reviewing,
                shadowban_status=excluded.shadowban_status,
                country=excluded.country,
                video_url=excluded.video_url
        """, (
            ch_id, v["video_id"], v["desc"], v["cover_url"], v["duration"], v["create_time"],
            v["view_count"], v["like_count"], v["comment_count"], v["share_count"],
            v["is_original"], v["is_prohibited"], v["is_reviewing"], v["shadowban_status"],
            v["country"], v["video_url"]
        ))

    if found_videos:
        cursor.execute(
            """UPDATE channels SET
                view_count=?,
                video_count=MAX(video_count, ?),
                like_count=MAX(like_count, ?)
            WHERE id=?""",
            (total_views, len(found_videos), total_likes, ch_id),
        )



async def fetch_channel_videos_authentic(ch_id: int, force_refresh: bool = False) -> List[dict]:
    """
    Fetches genuine channel videos. Never generates mock or fake data.
    If channel has 0 videos, returns empty list honestly.
    """
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, cookie, note, country, username, nickname, video_count, nord_host FROM channels WHERE id=?", (ch_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")

    ch_id, stored_cookie, note, country, username, nickname, video_count, ch_nord_host = row
    cookie = SECRET_STORE.decrypt(stored_cookie)
    clean_username = (username or "").strip()
    if not clean_username and note:
        clean_username = note.split(" ")[0].split("(")[0].strip().replace("@", "")

    if not force_refresh:
        cursor.execute("""
            SELECT video_id, desc, cover_url, duration, create_time, view_count, like_count,
                   comment_count, share_count, is_original, is_prohibited, is_reviewing,
                   shadowban_status, country, video_url
            FROM channel_videos WHERE channel_id=? ORDER BY create_time DESC
        """, (ch_id,))
        existing_rows = cursor.fetchall()
        if existing_rows:
            conn.close()
            videos = []
            for r in existing_rows:
                videos.append({
                    "video_id": r[0],
                    "desc": r[1],
                    "cover_url": r[2],
                    "duration": r[3],
                    "create_time": r[4],
                    "view_count": r[5],
                    "like_count": r[6],
                    "comment_count": r[7],
                    "share_count": r[8],
                    "is_original": r[9],
                    "is_prohibited": r[10],
                    "is_reviewing": r[11],
                    "shadowban_status": r[12],
                    "country": r[13],
                    "video_url": r[14],
                })
            return videos
        elif video_count == 0:
            # Verified 0 videos for this channel - return immediately with no artificial delay
            conn.close()
            return []

    found_videos = []
    fetch_succeeded = False
    fetch_reason = "Kênh chưa có username để tra cứu"
    if clean_username:
        prox = ensure_channel_proxy(ch_id, country=country or "", nord_host=ch_nord_host or "")
        if prox["ok"]:
            raw_items, fetch_succeeded, fetch_reason = await fetch_tiktok_videos_real(
                clean_username, cookie, socks_port=prox["socks_port"], channel_id=ch_id
            )
        else:
            raw_items, fetch_reason = [], prox.get("error", "Không bật được VPN vùng cho kênh")
        if not fetch_succeeded and chocode_tiktok.is_configured():
            # Trình duyệt qua VPN không lấy được danh sách (TikTok hay trả rỗng
            # cho IP VPN) → thử TikTok API. Dữ liệu mẫu bị từ chối, cache giữ nguyên.
            try:
                api_result = await asyncio.to_thread(chocode_tiktok.fetch_channel_videos, clean_username)
                raw_items = api_result["items"]
                fetch_succeeded = True
                print(f"[Videos] @{clean_username}: lấy {len(raw_items)} video từ TikTok API "
                      f"(chi tiết {api_result['details_ok']} ok / {api_result['details_failed']} lỗi)")
            except chocode_tiktok.ChocodeError as exc:
                fetch_reason = f"{fetch_reason.rstrip('. ')}. TikTok API dự phòng: {exc}"
        if not prox["ok"] and not fetch_succeeded:
            conn.close()
            raise HTTPException(status_code=502, detail=fetch_reason)
        for item in raw_items:
            diag = evaluate_video_diagnostics(item, channel_country=country, author_username=clean_username)
            found_videos.append(diag)

    if force_refresh and not fetch_succeeded:
        conn.close()
        raise HTTPException(
            status_code=502,
            detail=f"{fetch_reason.rstrip('. ')}. Dữ liệu cache cũ được giữ nguyên.",
        )

    store_channel_videos(cursor, ch_id, found_videos, replace=force_refresh)
    conn.commit()
    conn.close()
    return found_videos

@app.get("/api/channels/{ch_id}/videos")
async def get_channel_videos(ch_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, note, status, earned, balance, currency, rpm, country, kyc, username, nickname,
               video_count, follower_count, like_count, view_count
        FROM channels WHERE id=?
    """, (ch_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")

    ch_info = {
        "id": row[0],
        "note": row[1] or "",
        "status": row[2] or "CHƯA CHECK",
        "earned": row[3] or 0.0,
        "balance": row[4] or 0.0,
        "currency": row[5] or "#",
        "rpm": row[6] or 0.0,
        "country": row[7] or "KR",
        "kyc": row[8] or "No",
        "username": row[9] or "",
        "nickname": row[10] or "",
        "video_count": row[11] or 0,
        "follower_count": row[12] or 0,
        "like_count": row[13] or 0,
        "view_count": row[14] or 0,
    }

    videos = await fetch_channel_videos_authentic(ch_id, force_refresh=False)

    total_vids = len(videos)
    orig_count = sum(1 for v in videos if v["is_original"] == 1)
    dup_count = total_vids - orig_count
    orig_rate = round((orig_count / total_vids) * 100, 1) if total_vids > 0 else 100.0
    fyp_eligible = sum(1 for v in videos if v["shadowban_status"] == "NORMAL")
    shadow_or_flop = sum(1 for v in videos if v["shadowban_status"] in ("FLOP_0VIEW", "UNORIGINAL_RESTRICTED", "BANNED", "LOW_REACH"))
    v_views = sum(v["view_count"] for v in videos)
    v_likes = sum(v["like_count"] for v in videos)

    return {
        "channel": ch_info,
        "videos": videos,
        "health_summary": {
            "total_videos": total_vids,
            "original_count": orig_count,
            "duplicate_count": dup_count,
            "originality_rate": orig_rate,
            "fyp_eligible_count": fyp_eligible,
            "shadowban_or_flop_count": shadow_or_flop,
            "total_views": v_views,
            "total_likes": v_likes,
        }
    }

NOTICE_GROUP_LABELS = {
    1: "Lượt thích",
    2: "Bình luận",
    3: "Người theo dõi mới",
    4: "Nhắc đến (@Mentions)",
    5: "TikTok Team / Hệ thống",
    6: "Hoạt động khác",
    7: "Video được nhắc tới",
}


def _notice_text(item: dict) -> str:
    """Trích một đoạn mô tả dễ đọc từ một mục thông báo TikTok (cấu trúc rất
    đa dạng theo từng loại), ưu tiên nội dung văn bản, sau đó tới quan hệ user."""
    for key in ("content", "notice_content", "text", "title"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, dict):
            txt = val.get("text") or val.get("content") or val.get("desc")
            if isinstance(txt, str) and txt.strip():
                return txt.strip()
    # Một số loại gói thông tin trong các khối con
    for key in ("comment", "digg", "follow", "at", "mention", "system"):
        sub = item.get(key)
        if isinstance(sub, dict):
            from_user = sub.get("from_user") or sub.get("user") or {}
            name = from_user.get("nickname") or from_user.get("unique_id") or ""
            body = sub.get("content") or sub.get("comment_text") or ""
            joined = " ".join(x for x in (name, body) if x).strip()
            if joined:
                return joined
    return ""


async def fetch_tiktok_notifications_real(cookie_str: str, max_wait: float = 18.0, socks_port: Optional[int] = None, channel_id: Optional[int] = None) -> tuple[list, bool, str]:
    """Đọc thông báo (inbox notice) của một tài khoản qua Chrome + cookie thật.

    Không tự ký X-Bogus/X-Gnarly: điều hướng vào tiktok.com đã đăng nhập rồi để
    chính JS của TikTok gọi và ký `api/notice/multi`, ta chỉ chặn response.
    Bổ sung một lần gọi fetch trong page context làm phương án dự phòng.
    Trả về: (danh_sách_thông_báo, có_bắt_được_response, thông_điệp_lỗi).
    """
    # Cùng lý do như fetch_tiktok_videos_real: thiếu tunnel thì dừng hẳn, tuyệt
    # đối không mở TikTok bằng IP máy chủ với cookie thật của kênh.
    if not socks_port:
        return [], False, "Chưa thiết lập được VPN vùng cho kênh; không gọi TikTok bằng IP máy chủ"

    cookie_list = []
    for part in (cookie_str or "").split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            cookie_list.append({
                "name": k.strip(), "value": v.strip(),
                "domain": ".tiktok.com", "path": "/",
            })
    if not cookie_list:
        return [], False, "Cookie rỗng hoặc không hợp lệ"

    notices: list = []
    seen_ids: set = set()
    captured = False
    err = ""
    tiktok_status = {"msg": ""}

    def ingest(payload: dict):
        nonlocal captured
        # Nhận diện response hợp lệ dù rỗng: status_code == 0 là thành công.
        code = payload.get("status_code", payload.get("statusCode"))
        if code is not None and code != 0:
            tiktok_status["msg"] = payload.get("status_msg") or payload.get("statusMsg") or f"status_code={code}"
        elif code == 0:
            captured = True  # phiên còn sống, inbox có thể rỗng
        groups = payload.get("notice_lists") or payload.get("noticeLists") or []
        for grp in groups:
            gid = grp.get("group_id") or grp.get("groupId") or 0
            for item in (grp.get("list") or []):
                nid = str(item.get("nid") or item.get("notice_id") or id(item))
                if nid in seen_ids:
                    continue
                seen_ids.add(nid)
                captured = True
                notices.append({
                    "group_id": gid,
                    "group_label": NOTICE_GROUP_LABELS.get(gid, f"Nhóm {gid}"),
                    "type": item.get("type", 0),
                    "create_time": item.get("create_time") or item.get("createTime") or 0,
                    "has_read": bool(item.get("has_read", item.get("hasRead", False))),
                    "text": _notice_text(item),
                })

    from bkt_web import profile_session
    try:
        async with async_playwright() as p, \
                profile_session.scan_context(p, channel_id, socks_port, cookie_list, "scan-notices") as (context, _mode):
            page = await context.new_page()

            async def on_response(response):
                if "/api/notice/multi" in response.url:
                    try:
                        ingest(await response.json())
                    except Exception:
                        pass

            page.on("response", on_response)

            async def drive():
                await page.goto("https://www.tiktok.com/foryou", wait_until="domcontentloaded", timeout=int(max_wait * 1000))
                # Mở panel thông báo để TikTok tự gọi notice/multi (nếu có nút).
                try:
                    inbox = await page.query_selector('[data-e2e="nav-notification"], [data-e2e="inbox-icon"]')
                    if inbox:
                        await inbox.click()
                except Exception:
                    pass
                await page.wait_for_timeout(3500)
                # Dự phòng: gọi trong page context để webmssdk ký giúp.
                if not captured:
                    data = await page.evaluate(
                        """async () => {
                            const r = await fetch('/api/notice/multi/?aid=1988&count=20&scenario=0', {credentials:'include'});
                            return await r.json();
                        }"""
                    )
                    if isinstance(data, dict):
                        ingest(data)

            try:
                # Trần thời gian cứng để endpoint không bao giờ treo vô hạn dù
                # Chrome kẹt hay TikTok không phản hồi.
                await asyncio.wait_for(drive(), timeout=max_wait + 15)
            except asyncio.TimeoutError:
                err = "Quá thời gian chờ đọc thông báo (Chrome/TikTok không phản hồi)"
            except Exception as e:
                err = str(e)
    except profile_session.ProfileBusy:
        return [], False, "Chrome profile của kênh đang mở — bỏ qua lần đọc thông báo này"
    except Exception as e:
        err = str(e)

    notices.sort(key=lambda n: n.get("create_time", 0), reverse=True)
    return notices, captured, err or tiktok_status["msg"]


@app.get("/api/channels/{ch_id}/notifications")
async def get_channel_notifications(ch_id: int):
    """Đọc thông báo TikTok cho đúng tài khoản được bấm chọn."""
    conn = connect_db(DB_PATH)
    row = conn.execute(
        "SELECT cookie, username, note, status, country, nord_host FROM channels WHERE id=?", (ch_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")

    cookie = SECRET_STORE.decrypt(row[0] or "")
    if not cookie or len(cookie) < 30:
        raise HTTPException(status_code=400, detail="Kênh chưa có cookie hợp lệ để đọc thông báo")

    prox = ensure_channel_proxy(ch_id, country=row[4] or "", nord_host=row[5] or "")
    if not prox["ok"]:
        raise HTTPException(status_code=502, detail=prox.get("error", "Không bật được VPN vùng cho kênh"))
    notices, captured, err = await fetch_tiktok_notifications_real(cookie, socks_port=prox["socks_port"], channel_id=ch_id)
    unread = sum(1 for n in notices if not n["has_read"])
    return {
        "channel": {"id": ch_id, "username": row[1] or "", "note": row[2] or "", "status": row[3] or ""},
        "notifications": notices,
        "unread_count": unread,
        "captured": captured,
        "error": err,
        "vpn_location": prox.get("vpn_location", ""),
    }


def record_api_scan_snapshot(conn, ch_id: int) -> None:
    """Sau khi quét qua TikTok API: đồng bộ tổng view từ channel_videos và ghi một
    mốc channel_metrics_history bằng đúng số đang lưu (giống apply_check_result)."""
    refresh_channel_view_count(conn, ch_id)
    row = conn.execute(
        "SELECT status, earned, balance, currency, rpm, follower_count, view_count, like_count, video_count "
        "FROM channels WHERE id=?",
        (ch_id,),
    ).fetchone()
    if row:
        keys = ["status", "earned", "balance", "currency", "rpm",
                "follower_count", "view_count", "like_count", "video_count"]
        record_channel_metrics(conn, ch_id, dict(zip(keys, row)))


chocode_routes.after_channel_update = record_api_scan_snapshot

API_VIDEO_SCAN_LOCK = threading.Lock()
api_video_scan_status: Dict[str, Any] = {
    "running": False, "total": 0, "done": 0, "updated": 0, "failed": 0, "videos": 0,
    "details_ok": 0, "details_failed": 0, "current": "", "errors": [], "started_at": 0, "finished_at": 0,
}


def scan_channel_videos_via_api(ch_id: int, username: str, country: str, detail_limit: int = 30) -> int:
    """Flow TikTok API cho một kênh: username → sec_uid → danh sách → chi tiết → lưu.

    Không lấy được (hoặc dữ liệu mẫu khi đang bật chặn) thì ném ChocodeError và
    giữ nguyên video đã lưu của kênh.
    """
    result = chocode_tiktok.fetch_channel_videos(username, detail_limit=detail_limit)
    videos = [evaluate_video_diagnostics(item, channel_country=country or "DE", author_username=username)
              for item in result["items"]]
    conn = connect_db(DB_PATH)
    try:
        store_channel_videos(conn.cursor(), ch_id, videos, replace=True)
        record_api_scan_snapshot(conn, ch_id)
        conn.commit()
    finally:
        conn.close()
    with API_VIDEO_SCAN_LOCK:
        api_video_scan_status["details_ok"] += result["details_ok"]
        api_video_scan_status["details_failed"] += result["details_failed"]
    return len(videos)


def _api_video_scan_worker(rows, detail_limit: int) -> None:
    def one(row):
        ch_id, username, note, country = row
        clean = (username or "").strip() or _note_username(note or "")
        with API_VIDEO_SCAN_LOCK:
            api_video_scan_status["current"] = f"@{clean}"
        try:
            count = scan_channel_videos_via_api(ch_id, clean, country or "", detail_limit)
            ok, err = True, ""
        except chocode_tiktok.ChocodeError as exc:
            count, ok, err = 0, False, f"@{clean}: {exc}"
        except Exception as exc:  # một kênh lỗi không được dừng cả lượt quét
            count, ok, err = 0, False, f"@{clean}: {exc}"
        with API_VIDEO_SCAN_LOCK:
            api_video_scan_status["done"] += 1
            api_video_scan_status["videos"] += count
            if ok:
                api_video_scan_status["updated"] += 1
            else:
                api_video_scan_status["failed"] += 1
                api_video_scan_status["errors"] = (api_video_scan_status["errors"] + [err[:300]])[-50:]

    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            list(executor.map(one, rows))
    finally:
        with API_VIDEO_SCAN_LOCK:
            api_video_scan_status["running"] = False
            api_video_scan_status["current"] = "Hoàn tất"
            api_video_scan_status["finished_at"] = int(time.time())


@app.post("/api/channels/{ch_id}/scan-api")
def scan_channel_via_api(ch_id: int, detail_limit: int = 30):
    """Nút "Quét lại kênh này": hồ sơ + video của MỘT kênh qua TikTok API (chocode)."""
    if not chocode_tiktok.is_configured():
        raise HTTPException(status_code=400, detail="Chưa cấu hình khoá TikTok API (chocode) trong Kho Khoá API")
    conn = connect_db(DB_PATH)
    try:
        row = conn.execute("SELECT username, note, country FROM channels WHERE id=?", (ch_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")
    username = (row[0] or "").strip() or _note_username(row[1] or "")
    if not username:
        raise HTTPException(status_code=400, detail="Kênh chưa có username")

    out: Dict[str, Any] = {"username": username, "profile": None, "profile_error": "",
                           "video_count": 0, "videos_error": ""}
    try:
        out["profile"] = tiktok_api_sync_channel(ch_id)
    except chocode_tiktok.ChocodeError as exc:
        out["profile_error"] = str(exc)
    try:
        out["video_count"] = scan_channel_videos_via_api(ch_id, username, row[2] or "", max(0, min(detail_limit, 200)))
    except chocode_tiktok.ChocodeError as exc:
        out["videos_error"] = str(exc)
    return out


@app.post("/api/channels/scan-videos-api")
def scan_all_channel_videos_api(background_tasks: BackgroundTasks, detail_limit: int = 30):
    """Quét video của mọi kênh có username qua TikTok API (chocode), chạy nền."""
    if not chocode_tiktok.is_configured():
        raise HTTPException(status_code=400, detail="Chưa cấu hình khoá TikTok API (chocode) trong Kho Khoá API")
    detail_limit = max(0, min(int(detail_limit), 200))
    conn = connect_db(DB_PATH)
    try:
        rows = conn.execute(
            "SELECT id, username, note, country FROM channels "
            "WHERE COALESCE(username,'')<>'' OR COALESCE(note,'')<>'' ORDER BY id"
        ).fetchall()
    finally:
        conn.close()
    with API_VIDEO_SCAN_LOCK:
        if api_video_scan_status["running"]:
            return {"message": "Đang quét video qua API, vui lòng chờ...", **api_video_scan_status}
        api_video_scan_status.update(
            running=True, total=len(rows), done=0, updated=0, failed=0, videos=0, details_ok=0,
            details_failed=0, current="", errors=[], started_at=int(time.time()), finished_at=0,
        )
    background_tasks.add_task(_api_video_scan_worker, rows, detail_limit)
    return {"message": f"Bắt đầu quét video {len(rows)} kênh qua TikTok API", "total": len(rows)}


@app.get("/api/channels/scan-videos-api/status")
def scan_all_channel_videos_api_status():
    with API_VIDEO_SCAN_LOCK:
        return dict(api_video_scan_status)


@app.post("/api/channels/{ch_id}/scan-videos")
async def scan_channel_videos_endpoint(ch_id: int):
    videos = await fetch_channel_videos_authentic(ch_id, force_refresh=True)
    return {"message": f"Đã quét và cập nhật thành công {len(videos)} video thật từ TikTok!", "count": len(videos)}

@app.put("/api/channels/{ch_id:int}")
def update_channel_note(ch_id: int, item: UpdateNoteItem):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE channels SET note=? WHERE id=?", (item.note, ch_id))
    conn.commit()
    conn.close()
    return {"message": "Đã cập nhật ghi chú"}

@app.delete("/api/channels/{ch_id:int}")
def delete_channel(ch_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM channel_videos WHERE channel_id=?", (ch_id,))
    cursor.execute("DELETE FROM channels WHERE id=?", (ch_id,))
    conn.commit()
    conn.close()
    return {"message": "Đã xóa kênh"}

@app.delete("/api/channels")
def clear_all_channels():
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM channel_videos")
    cursor.execute("DELETE FROM channels")
    conn.commit()
    conn.close()
    return {"message": "Đã xóa toàn bộ danh sách kênh"}

@app.get("/api/scan-status")
def get_scan_status():
    with SCAN_LOCK:
        return dict(scan_status)

# --- VPN & Profile Management Endpoints ---
class AssignVpnItem(BaseModel):
    vpn_config: str

@app.get("/api/vpn/stats")
def api_get_vpn_stats():
    return vpn_manager.get_vpn_stats()

@app.get("/api/vpn/catalog/{country}")
def api_get_vpn_catalog_country(country: str):
    cat = vpn_manager.get_vpn_catalog()
    c = country.strip().upper()
    if c == "UK":
        c = "GB"
    return cat.get(c, [])

@app.post("/api/channels/vpn/auto-assign-all")
def api_auto_assign_vpn_all():
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, country, vpn_config FROM channels")
    rows = c.fetchall()

    # Gom theo quốc gia rồi bốc không hoàn lại, để mỗi kênh một server khác nhau.
    by_country: Dict[str, List[int]] = {}
    for ch_id, country, _vpn_conf in rows:
        by_country.setdefault((country or "KR").upper(), []).append(ch_id)

    updated = 0
    for target_country, ch_ids in by_country.items():
        picks = vpn_manager.pick_distinct_vpns(target_country, len(ch_ids))
        for ch_id, picked in zip(ch_ids, picks):
            c.execute("UPDATE channels SET vpn_config=?, vpn_location=? WHERE id=?",
                      (picked["rel_path"], picked["label"], ch_id))
            updated += 1
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Đã tự động gán WireGuard VPN cho {updated} kênh!", "count": updated}

@app.post("/api/channels/{ch_id}/vpn/assign")
def api_assign_channel_vpn(ch_id: int, item: AssignVpnItem):
    try:
        vpn_manager.resolve_vpn_config(item.vpn_config)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=400, detail="Cấu hình VPN không hợp lệ")
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    label = vpn_manager.format_vpn_location(item.vpn_config)
    c.execute("UPDATE channels SET vpn_config=?, vpn_location=? WHERE id=?", (item.vpn_config, label, ch_id))
    conn.commit()
    conn.close()
    return {"success": True, "vpn_config": item.vpn_config, "vpn_location": label}

@app.get("/api/vpn/dead-servers")
def api_list_dead_vpn_servers():
    """Liệt kê kênh đang trỏ vào server VPN đã khai tử (chỉ xem, không sửa)."""
    dead = vpn_manager.find_dead_vpn_assignments()
    return {"count": len(dead), "channels": dead}


@app.post("/api/vpn/reassign-dead")
def api_reassign_dead_vpn_servers(apply: bool = True):
    """Tự chuyển các kênh dính server chết sang server còn sống cùng quốc gia."""
    try:
        return vpn_manager.reassign_dead_vpns(apply=apply)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BuildProfilesItem(BaseModel):
    publisher: Optional[str] = None       # 'pub1' / 'pub2' / None = tất cả
    channel_ids: Optional[List[int]] = None
    inject_cookie: bool = True
    only_missing: bool = True             # bỏ qua kênh đã có profile


PROFILE_BUILD_STATUS: Dict[str, Any] = {
    "running": False, "total": 0, "completed": 0, "ok": 0, "failed": 0,
    "current": "", "errors": [],
}


def _run_profile_build(ch_ids: List[int], inject_cookie: bool) -> None:
    def on_progress(idx, total, done, failed):
        PROFILE_BUILD_STATUS.update({
            "completed": idx, "ok": len(done), "failed": len(failed),
            "current": (done[-1]["username"] if done else ""),
            "errors": failed[-5:],
        })
    try:
        vpn_manager.build_profiles_for_channels(ch_ids, inject_cookie=inject_cookie, progress_cb=on_progress)
    finally:
        PROFILE_BUILD_STATUS["running"] = False


@app.post("/api/channels/profiles/build")
def api_build_profiles(item: BuildProfilesItem, background: BackgroundTasks):
    """Dựng sẵn Chrome profile khớp quốc gia cho một dàn kênh (chạy nền)."""
    if PROFILE_BUILD_STATUS["running"]:
        raise HTTPException(status_code=409, detail="Đang có tiến trình dựng profile chạy dở")

    conn = connect_db(DB_PATH)
    if item.channel_ids:
        rows = conn.execute(
            f"SELECT id FROM channels WHERE id IN ({','.join('?' * len(item.channel_ids))})",
            item.channel_ids,
        ).fetchall()
    elif item.publisher:
        rows = conn.execute("SELECT id FROM channels WHERE publisher=? ORDER BY id", (item.publisher,)).fetchall()
    else:
        rows = conn.execute("SELECT id FROM channels ORDER BY id").fetchall()
    ch_ids = [r[0] for r in rows]

    if item.only_missing and ch_ids:
        have = {
            r[0] for r in conn.execute(
                f"SELECT id FROM channels WHERE id IN ({','.join('?' * len(ch_ids))}) AND trim(coalesce(profile_dir,''))<>''",
                ch_ids,
            ).fetchall()
        }
        ch_ids = [i for i in ch_ids if i not in have]
    conn.close()

    if not ch_ids:
        return {"message": "Không có kênh nào cần dựng profile", "total": 0}

    PROFILE_BUILD_STATUS.update({
        "running": True, "total": len(ch_ids), "completed": 0,
        "ok": 0, "failed": 0, "current": "", "errors": [],
    })
    background.add_task(_run_profile_build, ch_ids, item.inject_cookie)
    return {"message": f"Bắt đầu dựng profile cho {len(ch_ids)} kênh", "total": len(ch_ids)}


@app.get("/api/channels/profiles/build-status")
def api_build_profiles_status():
    return PROFILE_BUILD_STATUS


@app.post("/api/channels/{ch_id}/profile/build")
def api_build_one_profile(ch_id: int):
    import asyncio
    try:
        return asyncio.run(vpn_manager.build_channel_profile(ch_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Màn hình từ xa (noVNC) -------------------------------------------------
# Trên VPS, Chrome của mỗi kênh chạy trên màn hình ảo :1 nên bấm "mở trình duyệt"
# ở máy người dùng sẽ không thấy gì. Nếu websockify đang phục vụ, giao diện sẽ
# mở kèm tab noVNC. Chạy trên máy cá nhân thì không có cổng này và mọi thứ giữ
# nguyên như cũ.
NOVNC_INTERNAL_PORT = int(os.environ.get("TOKMATRIX_NOVNC_PORT", "6080"))
REMOTE_VIEW_URL = os.environ.get("TOKMATRIX_VNC_URL", "/vnc/")


def remote_view_available() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", NOVNC_INTERNAL_PORT), timeout=0.4):
            return True
    except OSError:
        return False


@app.get("/api/system/remote-view")
def api_remote_view():
    """Cho giao diện biết có màn hình từ xa để mở kèm hay không."""
    return {"available": remote_view_available(), "url": REMOTE_VIEW_URL}


@app.post("/api/channels/{ch_id}/profile/launch")
def api_launch_channel_profile(ch_id: int):
    try:
        res = vpn_manager.launch_channel_browser_profile(ch_id)
        if isinstance(res, dict) and remote_view_available():
            res["remote_view_url"] = REMOTE_VIEW_URL
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/channels/{ch_id}/profile/open-login")
def api_open_profile_login(ch_id: int):
    """Mở profile hiện hình tại trang đăng nhập để người vận hành thao tác qua noVNC."""
    conn = connect_db(DB_PATH)
    row = conn.execute("SELECT COALESCE(session_state,'') FROM channels WHERE id=?", (ch_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh")
    try:
        res = vpn_manager.launch_channel_browser_profile(
            ch_id, start_url="https://www.tiktok.com/login", sync_cookie=row[0] != "LOGGED_OUT",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if isinstance(res, dict) and remote_view_available():
        res["remote_view_url"] = REMOTE_VIEW_URL
    return res


@app.post("/api/channels/{ch_id}/profile/save-session")
async def api_save_profile_session(ch_id: int):
    """Sau khi đăng nhập tay: đóng Chrome đang mở, đọc cookie của profile qua VPN của kênh."""
    from bkt_web import profile_session
    from bkt_web.tiktok_publisher import resolve_headless

    conn = connect_db(DB_PATH)
    row = conn.execute("SELECT vpn_config, COALESCE(profile_dir,'') FROM channels WHERE id=?", (ch_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh")
    vpn_config, profile_dir = row
    if not profile_dir or not Path(profile_dir).is_dir():
        raise HTTPException(status_code=409, detail="Kênh chưa có Chrome profile")
    if not vpn_config:
        # Mọi kết nối đi ra phải qua VPN của kênh — không mở TikTok bằng IP máy chủ.
        raise HTTPException(status_code=409, detail="Kênh chưa gán VPN")
    if not await asyncio.to_thread(profile_session.terminate_external_chrome, Path(profile_dir)):
        raise HTTPException(status_code=409, detail="Chrome của profile chưa đóng — đóng cửa sổ rồi thử lại")

    started = False
    try:
        tunnel = vpn_manager.start_wireguard_proxy(ch_id, vpn_config)
        started = True
        with profile_session.acquire(ch_id, "save-session"):
            async with async_playwright() as p:
                context, _ = await profile_session.open_context(
                    p, ch_id, tunnel["socks_port"], resolve_headless(None), inject_db_cookie=False,
                )
                try:
                    page = await context.new_page()
                    await page.goto("https://www.tiktok.com/", wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(2000)
                    if await profile_session.is_logged_out(page):
                        profile_session.mark_session(ch_id, "LOGGED_OUT", "save-session")
                        raise HTTPException(409, detail="Chưa đăng nhập xong")
                    if not await profile_session.write_back(ch_id, context):
                        profile_session.mark_session(ch_id, "LOGGED_OUT", "save-session")
                        raise HTTPException(409, detail="Không đọc được sessionid — đăng nhập lại rồi lưu")
                    profile_session.mark_session(ch_id, "OK", "save-session")
                    return {"success": True, "session_state": "OK"}
                finally:
                    await context.close()
    except profile_session.ProfileBusy as exc:
        raise HTTPException(409, detail=f"Profile đang bận ({exc.reason})")
    finally:
        if started:
            try:
                vpn_manager.stop_wireguard_proxy(ch_id)
            except Exception:
                pass

class TestVpnServerItem(BaseModel):
    vpn_config: str
    country: Optional[str] = "DE"

@app.get("/api/channels/{ch_id}/vpn/check-full")
def api_check_channel_vpn_full(ch_id: int):
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT vpn_config, country, username, note, cookie, vpn_location FROM channels WHERE id=?", (ch_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh")
    
    vpn_conf, country, username, note, stored_cookie, vpn_loc = row
    cookie = SECRET_STORE.decrypt(stored_cookie)
    country = (country or "DE").upper()
    
    # Auto-assign if missing
    if not vpn_conf:
        picked = vpn_manager.pick_random_vpn(country)
        if not picked:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Không có cấu hình VPN cho quốc gia {country}")
        vpn_conf = picked["rel_path"]
        vpn_loc = picked["label"]
        c.execute("UPDATE channels SET vpn_config=?, vpn_location=? WHERE id=?", (vpn_conf, vpn_loc, ch_id))
        conn.commit()
    conn.close()

    res = vpn_manager.check_vpn_ip_and_tiktok(
        conf_rel_path=vpn_conf,
        channel_id=ch_id,
        cookie_str=cookie,
        target_country=country
    )
    res["channel_id"] = ch_id
    res["channel_name"] = f"@{username}" if username else (note or f"Kênh #{ch_id}")
    res["channel_country"] = country
    res["vpn_location"] = vpn_loc or res.get("location")
    
    # Also add legacy fields for backward compatibility
    if res.get("api", {}).get("success"):
        res["ip"] = res["api"].get("ip")
        res["time_ms"] = res["api"].get("latency_ms")
    return res

@app.get("/api/channels/{ch_id}/vpn/test")
def api_test_channel_vpn(ch_id: int):
    return api_check_channel_vpn_full(ch_id)

@app.post("/api/vpn/test-server")
def api_test_server(item: TestVpnServerItem):
    if not item.vpn_config:
        raise HTTPException(status_code=400, detail="Thiếu file cấu hình vpn_config")
    try:
        vpn_manager.resolve_vpn_config(item.vpn_config)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=400, detail="Cấu hình VPN không hợp lệ")
    res = vpn_manager.check_vpn_ip_and_tiktok(
        conf_rel_path=item.vpn_config,
        target_country=item.country or "DE"
    )
    if res.get("api", {}).get("success"):
        res["ip"] = res["api"].get("ip")
        res["time_ms"] = res["api"].get("latency_ms")
    return res

@app.get("/api/vpn/active-tunnels")
def api_get_active_tunnels():
    tunnels = []
    for cid, t in vpn_manager.ACTIVE_TUNNELS.items():
        tunnels.append({
            "channel_id": cid,
            "socks_port": t.get("socks_port"),
            "conf_rel_path": t.get("conf_rel_path"),
            "location": t.get("location"),
            "pid": t.get("pid")
        })
    return {"count": len(tunnels), "tunnels": tunnels}

@app.post("/api/vpn/stop-all")
def api_stop_all_tunnels():
    count = len(vpn_manager.ACTIVE_TUNNELS)
    vpn_manager.stop_all_wireguard_proxies()
    try:
        from bkt_web import nord_api
        count += nord_api.stop_all_dynamic_nord_tunnels()
    except Exception:
        pass
    return {"success": True, "message": f"Đã ngắt toàn bộ {count} tunnel WireGuard!", "stopped_count": count}

# --- NordVPN Live API Endpoints (150+ Countries, 8000+ Servers) ---
class TestNordServerItem(BaseModel):
    hostname: str
    public_key: str
    country_code: Optional[str] = "DE"
    city: Optional[str] = ""

@app.get("/api/vpn/nord/countries")
def api_get_nord_countries(refresh: bool = False):
    try:
        from bkt_web import nord_api
        return nord_api.get_nord_countries(force_refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vpn/nord/servers/{country_code}")
def api_get_nord_servers(country_code: str, limit: int = 100, refresh: bool = False):
    try:
        from bkt_web import nord_api
        return nord_api.get_nord_servers_for_country(country_code, limit=limit, force_refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/vpn/nord/test")
def api_test_nord_server(item: TestNordServerItem):
    try:
        from bkt_web import nord_api
        return nord_api.test_nord_server_connection(
            hostname=item.hostname,
            public_key=item.public_key,
            target_country=item.country_code or "DE",
            city=item.city or ""
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Module 2: Auto Downloader (No-Watermark Video Downloader) ---
class DownloadItem(BaseModel):
    urls: Union[str, List[str]]
    platform: Optional[str] = "tiktok"


TIKTOK_HOSTS = {"tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"}
MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024


def _is_allowed_tiktok_url(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value)
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and (host in TIKTOK_HOSTS or host.endswith(".tiktok.com"))
    except ValueError:
        return False


def _is_public_http_url(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)):
            ip = ipaddress.ip_address(info[4][0])
            if not ip.is_global:
                return False
        return True
    except (ValueError, OSError, socket.gaierror):
        return False


def _safe_stream_get(url: str, *, max_redirects: int = 5, headers: Optional[dict] = None):
    """Follow redirects manually so every hop receives the SSRF check."""
    current = url
    for _ in range(max_redirects + 1):
        if not _is_public_http_url(current):
            raise ValueError("URL media trỏ tới mạng nội bộ hoặc host không hợp lệ")
        response = requests.get(current, timeout=60, stream=True, allow_redirects=False, headers=headers)
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("location")
            if not location:
                raise ValueError("Redirect media không có Location")
            current = urllib.parse.urljoin(current, location)
            continue
        return response
    raise ValueError("Media redirect quá nhiều lần")

TIKTOK_MEDIA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": "https://www.tiktok.com/",
}


def _resolve_tiktok_source_chocode(url: str) -> Optional[dict]:
    """Nguồn chính khi đã có khoá chocode; None nếu chưa cấu hình hoặc API trả dữ liệu mẫu."""
    if not chocode_tiktok.is_configured():
        return None
    try:
        info = chocode_tiktok.resolve_video_download(url)
    except chocode_tiktok.ChocodeError as e:
        print(f"[Downloader] chocode bỏ qua {url}: {e}")
        return None
    return {
        "provider": "chocode",
        "id": info["id"],
        "title": info["title"],
        "author": info["author"],
        "duration": info["duration"],
        "cover": info["cover"],
        "play_url": info["play_url"],
    }


def _resolve_tiktok_source_tikwm(url: str) -> Optional[dict]:
    r = requests.get("https://www.tikwm.com/api/", params={"url": url}, timeout=15, allow_redirects=False)
    if r.status_code != 200:
        return None
    d = r.json()
    if d.get("code") != 0 or "data" not in d:
        return None
    data = d["data"]
    return {
        "provider": "tikwm",
        "id": data.get("id"),
        "title": data.get("title"),
        "author": data.get("author", {}).get("unique_id", ""),
        "duration": int(data.get("duration", 0)),
        "cover": data.get("cover", ""),
        "play_url": data.get("play") or data.get("wmplay"),
    }


def download_single_video(url: str) -> Optional[dict]:
    clean_url = url.strip()
    if not clean_url:
        return None
    for resolver in (_resolve_tiktok_source_chocode, _resolve_tiktok_source_tikwm):
        try:
            result = _download_resolved_video(clean_url, resolver(clean_url))
        except Exception as e:
            print(f"[Downloader] {resolver.__name__} lỗi với {clean_url}: {e}")
            result = None
        if result:
            return result
    return None


def _download_resolved_video(clean_url: str, data: Optional[dict]) -> Optional[dict]:
    if not data or not data.get("play_url"):
        return None
    raw_id = str(data.get("id") or int(time.time() * 1000))
    vid_id = re.sub(r"[^0-9A-Za-z_-]", "", raw_id)[:80] or str(int(time.time() * 1000))
    title = data.get("title") or f"TikTok Video {vid_id}"
    author = data.get("author") or ""
    duration = int(data.get("duration") or 0)
    cover = data.get("cover") or ""
    out_filename = f"{vid_id}.mp4"
    local_fpath = DOWNLOADS_DIR / out_filename
    partial_fpath = DOWNLOADS_DIR / f".{out_filename}.part"
    try:
        v_stream = _safe_stream_get(data["play_url"], headers=TIKTOK_MEDIA_HEADERS)
        if v_stream.status_code != 200:
            raise ValueError(f"Media trả HTTP {v_stream.status_code}")
        declared_size = int(v_stream.headers.get("content-length") or 0)
        if declared_size > MAX_DOWNLOAD_BYTES:
            raise ValueError("Video vượt quá giới hạn 500 MB")
        total_written = 0
        with open(partial_fpath, "wb") as f:
            for chunk in v_stream.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                if total_written == 0 and b"ftyp" not in chunk[:16]:
                    raise ValueError("Media trả về không phải file MP4")
                total_written += len(chunk)
                if total_written > MAX_DOWNLOAD_BYTES:
                    raise ValueError("Video vượt quá giới hạn 500 MB")
                f.write(chunk)
        if total_written == 0:
            raise ValueError("Media trả về file rỗng")
        partial_fpath.replace(local_fpath)
    except Exception as e:
        print(f"[Downloader] {data.get('provider')} lỗi tải {clean_url}: {e}")
        if partial_fpath.exists():
            partial_fpath.unlink()
        return None

    f_size = local_fpath.stat().st_size
    now = int(time.time())
    conn = connect_db(DB_PATH)
    conn.execute("""
        INSERT INTO downloaded_videos (original_url, platform, title, author, duration, cover_url, local_path, file_size, status, created_at)
        VALUES (?, 'TikTok', ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
        ON CONFLICT(original_url) DO UPDATE SET
            title=excluded.title,
            author=excluded.author,
            duration=excluded.duration,
            cover_url=excluded.cover_url,
            local_path=excluded.local_path,
            file_size=excluded.file_size,
            status='COMPLETED',
            created_at=excluded.created_at
    """, (clean_url, title, author, duration, cover, str(local_fpath), f_size, now))
    conn.commit()
    conn.close()
    return {
        "id": vid_id,
        "title": title,
        "author": author,
        "duration": duration,
        "file_size": f_size,
        "local_path": str(local_fpath),
        "provider": data.get("provider"),
    }

def process_batch_download(job_id: int, urls: List[str]):
    conn = connect_db(DB_PATH)
    conn.execute("UPDATE download_jobs SET status='PROCESSING' WHERE id=?", (job_id,))
    conn.commit()
    conn.close()
    for u in urls:
        result = download_single_video(u)
        conn = connect_db(DB_PATH)
        if result:
            conn.execute("UPDATE download_jobs SET completed=completed+1 WHERE id=?", (job_id,))
        else:
            conn.execute("UPDATE download_jobs SET failed=failed+1 WHERE id=?", (job_id,))
        conn.commit()
        conn.close()
    conn = connect_db(DB_PATH)
    conn.execute(
        "UPDATE download_jobs SET status=?, finished_at=? WHERE id=?",
        ("COMPLETED", int(time.time()), job_id),
    )
    conn.commit()
    conn.close()

@app.post("/api/downloader/download")
def start_download_videos(item: DownloadItem, background_tasks: BackgroundTasks):
    if (item.platform or "tiktok").lower() != "tiktok":
        raise HTTPException(status_code=400, detail="Hiện tại chỉ hỗ trợ TikTok")
    raw_urls = item.urls
    if isinstance(raw_urls, list):
        urls = [u.strip() for u in raw_urls if isinstance(u, str) and _is_allowed_tiktok_url(u.strip())]
    else:
        urls = [u.strip() for u in str(raw_urls).split("\n") if _is_allowed_tiktok_url(u.strip())]
    if not urls:
        raise HTTPException(status_code=400, detail="Vui lòng nhập ít nhất 1 đường link hợp lệ (http...)")
    if len(urls) > 50:
        raise HTTPException(status_code=400, detail="Mỗi lượt chỉ tải tối đa 50 video")
    conn = connect_db(DB_PATH)
    cur = conn.execute(
        "INSERT INTO download_jobs(total, status, created_at) VALUES (?, 'QUEUED', ?)",
        (len(urls), int(time.time())),
    )
    job_id = cur.lastrowid
    conn.commit()
    conn.close()
    background_tasks.add_task(process_batch_download, job_id, urls)
    return {"message": f"Bắt đầu tải xuống {len(urls)} video không logo!", "total": len(urls), "job_id": job_id}


@app.get("/api/downloader/jobs/{job_id}")
def get_download_job(job_id: int):
    conn = connect_db(DB_PATH)
    row = conn.execute(
        "SELECT id,total,completed,failed,status,error_message,created_at,finished_at FROM download_jobs WHERE id=?",
        (job_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tải")
    keys = ["id", "total", "completed", "failed", "status", "error_message", "created_at", "finished_at"]
    return dict(zip(keys, row))

@app.get("/api/downloader/videos")
def get_downloaded_videos():
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, original_url, platform, title, author, duration, cover_url, local_path, file_size, status, created_at FROM downloaded_videos ORDER BY created_at DESC")
    rows = c.fetchall()
    conn.close()
    items = []
    for r in rows:
        local_name = Path(r[7]).name if r[7] else ""
        items.append({
            "id": r[0],
            "original_url": r[1],
            "platform": r[2],
            "title": r[3],
            "author": r[4],
            "duration": r[5],
            "cover_url": r[6],
            "local_path": r[7],
            "file_size": r[8],
            "status": r[9],
            "created_at": r[10],
            "video_url": f"/storage/downloads/{local_name}" if local_name else ""
        })
    return {"videos": items}

@app.delete("/api/downloader/videos/{vid_id}")
def delete_downloaded_video(vid_id: int):
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT local_path FROM downloaded_videos WHERE id=?", (vid_id,))
    row = c.fetchone()
    if row and row[0]:
        try:
            p = Path(row[0]).resolve()
            if p.is_relative_to(DOWNLOADS_DIR.resolve()) and p.exists():
                p.unlink()
        except Exception:
            pass
    c.execute("DELETE FROM downloaded_videos WHERE id=?", (vid_id,))
    conn.commit()
    conn.close()
    return {"message": "Đã xóa video khỏi danh sách"}

# --- Module 3: Auto Render (FFmpeg VideoToolbox & Format Normalization) ---
class RenderTaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video_id: Optional[int] = None
    input_path: Optional[str] = None
    task_name: str = Field(default="Render Video", max_length=120)
    flip: bool = True
    speed: float = Field(default=1.04, ge=0.5, le=2.0)
    crop_percent: float = Field(default=3.0, ge=0.0, le=20.0)
    color_adjust: bool = True
    overlay_filename: Optional[str] = None
    audio_filename: Optional[str] = None
    use_gpu: bool = True


RENDER_PROCESSES: Dict[int, subprocess.Popen] = {}
RENDER_PROCESSES_LOCK = threading.Lock()

def build_ffmpeg_render_cmd(
    in_file: str,
    out_file: str,
    flip: bool,
    speed: float,
    crop_pct: float,
    color_adj: bool,
    overlay_file: str,
    audio_file: str,
    use_gpu: bool,
) -> List[str]:
    """Dựng lệnh ffmpeg cho một tác vụ render. Tách riêng để kiểm thử được."""
    vf_filters = []
    if flip:
        vf_filters.append("hflip")
    if crop_pct > 0:
        pct = crop_pct / 100.0
        vf_filters.append(f"crop=in_w*(1-{pct}):in_h*(1-{pct}):(in_w*({pct}))/2:(in_h*({pct}))/2,scale=1080:1920")
    if color_adj:
        vf_filters.append("eq=brightness=0.02:contrast=1.04:saturation=1.05")
    if speed != 1.0:
        vf_filters.append(f"setpts=PTS/{speed}")

    vf_str = ",".join(vf_filters) if vf_filters else "null"
    cmd = ["ffmpeg", "-y", "-i", in_file]

    inputs = 1
    overlay_idx = -1
    audio_idx = -1
    if overlay_file:
        cmd.extend(["-i", overlay_file])
        overlay_idx = inputs
        inputs += 1
    if audio_file:
        cmd.extend(["-i", audio_file])
        audio_idx = inputs
        inputs += 1

    v_encoder = "h264_videotoolbox" if use_gpu else "libx264"

    if overlay_idx > 0:
        fc = f"[0:v]{vf_str}[v_main];[v_main][{overlay_idx}:v]overlay=0:0[vout]"
        cmd.extend(["-filter_complex", fc, "-map", "[vout]"])
    else:
        cmd.extend(["-vf", vf_str, "-map", "0:v"])

    if audio_idx > 0:
        cmd.extend(["-map", f"{audio_idx}:a", "-c:a", "aac", "-shortest"])
    else:
        # Đã -map video tường minh nên ffmpeg tắt chọn stream mặc định. Thiếu
        # "-map 0:a?" ở đây là mất sạch tiếng gốc, kể cả khi có -af, và ffmpeg
        # không hề cảnh báo.
        cmd.extend(["-map", "0:a?"])
        if speed != 1.0:
            cmd.extend(["-af", f"atempo={speed}"])
        cmd.extend(["-c:a", "aac"])

    cmd.extend(["-c:v", v_encoder, "-b:v", "4000k", out_file])
    return cmd


def execute_ffmpeg_render_job(task_id: int, in_file: str, out_file: str, flip: bool, speed: float, crop_pct: float, color_adj: bool, overlay_name: Optional[str], audio_name: Optional[str], use_gpu: bool):
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE render_tasks SET status='PROCESSING', progress=15 WHERE id=?", (task_id,))
    conn.commit()
    conn.close()

    try:
        overlay_file = str(safe_child(OVERLAYS_DIR, overlay_name, must_exist=True)) if overlay_name else ""
        audio_file = str(safe_child(AUDIO_DIR, audio_name, must_exist=True)) if audio_name else ""
        cmd = build_ffmpeg_render_cmd(
            in_file, out_file, flip, speed, crop_pct, color_adj, overlay_file, audio_file, use_gpu
        )

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        with RENDER_PROCESSES_LOCK:
            RENDER_PROCESSES[task_id] = proc
        try:
            stdout, stderr = proc.communicate(timeout=1800)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate()
            raise RuntimeError("FFmpeg vượt quá thời gian render tối đa 30 phút")
        finally:
            with RENDER_PROCESSES_LOCK:
                RENDER_PROCESSES.pop(task_id, None)

        now = int(time.time())
        conn = connect_db(DB_PATH)
        c = conn.cursor()
        current = c.execute("SELECT status FROM render_tasks WHERE id=?", (task_id,)).fetchone()
        if current and current[0] == "CANCELLED":
            # Tác vụ bị người dùng huỷ giữa chừng: bỏ luôn file dở dang.
            Path(out_file).unlink(missing_ok=True)
        elif proc.returncode == 0:
            c.execute("UPDATE render_tasks SET status='COMPLETED', progress=100, finished_at=? WHERE id=?", (now, task_id))
        else:
            err_msg = stderr[-1000:] if stderr else "FFmpeg exit non-zero"
            c.execute("UPDATE render_tasks SET status='ERROR', progress=0, error_message=? WHERE id=?", (err_msg, task_id))
            Path(out_file).unlink(missing_ok=True)
        conn.commit()
        conn.close()
    except Exception as e:
        Path(out_file).unlink(missing_ok=True)
        conn = connect_db(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE render_tasks SET status='ERROR', progress=0, error_message=? WHERE id=?", (str(e), task_id))
        conn.commit()
        conn.close()

@app.post("/api/render/create-task")
def create_render_task(item: RenderTaskCreate, background_tasks: BackgroundTasks):
    in_file = item.input_path
    title = item.task_name or "Render Video"
    if item.video_id:
        conn = connect_db(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT local_path, title FROM downloaded_videos WHERE id=?", (item.video_id,))
        r = c.fetchone()
        conn.close()
        if r:
            in_file, title = r[0], r[1]

    if not in_file or not Path(in_file).is_file():
        raise HTTPException(status_code=400, detail="Không tìm thấy file video đầu vào để biên tập")

    resolved_input = Path(in_file).resolve()
    allowed_roots = [STORAGE_DIR.resolve(), AUTO_COMPARE_VIDEOS_DIR.resolve()]
    if not any(resolved_input.is_relative_to(root) for root in allowed_roots):
        raise HTTPException(status_code=400, detail="Video đầu vào nằm ngoài thư viện được phép")
    in_file = str(resolved_input)

    try:
        if item.overlay_filename:
            safe_child(OVERLAYS_DIR, item.overlay_filename, must_exist=True)
        if item.audio_filename:
            safe_child(AUDIO_DIR, item.audio_filename, must_exist=True)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=400, detail="Overlay hoặc audio không hợp lệ")

    safe_stem = re.sub(r"[^0-9A-Za-z._-]", "_", Path(in_file).stem)[:80] or "video"
    out_name = f"render_{int(time.time())}_{secrets.token_hex(4)}_{safe_stem}.mp4"
    out_file = str(RENDERED_DIR / out_name)

    now = int(time.time())
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO render_tasks (input_video_path, output_video_path, title, overlay_path, audio_path, flip, speed, crop_percent, color_adjust, use_gpu, status, progress, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', 5, ?)
    """, (in_file, out_file, title, item.overlay_filename or "", item.audio_filename or "", 1 if item.flip else 0, item.speed, item.crop_percent, 1 if item.color_adjust else 0, 1 if item.use_gpu else 0, now))
    task_id = c.lastrowid
    conn.commit()
    conn.close()

    background_tasks.add_task(execute_ffmpeg_render_job, task_id, in_file, out_file, item.flip, item.speed, item.crop_percent, item.color_adjust, item.overlay_filename, item.audio_filename, item.use_gpu)
    return {"message": "Đã tạo tác vụ biên tập video thành công!", "task_id": task_id}

@app.get("/api/render/tasks")
def list_render_tasks():
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, input_video_path, output_video_path, title, flip, speed, crop_percent, color_adjust, use_gpu, status, progress, error_message, created_at, finished_at FROM render_tasks ORDER BY created_at DESC")
    rows = c.fetchall()
    conn.close()
    items = []
    for r in rows:
        out_name = Path(r[2]).name if r[2] else ""
        items.append({
            "id": r[0],
            "input_video_path": r[1],
            "output_video_path": r[2],
            "title": r[3],
            "flip": r[4],
            "speed": r[5],
            "crop_percent": r[6],
            "color_adjust": r[7],
            "use_gpu": r[8],
            "status": r[9],
            "progress": r[10],
            "error_message": r[11],
            "created_at": r[12],
            "finished_at": r[13],
            "video_url": f"/storage/rendered/{out_name}" if out_name and (RENDERED_DIR / out_name).exists() else ""
        })
    return {"tasks": items}

@app.delete("/api/render/tasks/{task_id}")
def delete_render_task(task_id: int):
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT output_video_path, status FROM render_tasks WHERE id=?", (task_id,))
    row = c.fetchone()
    if row and row[1] == "PROCESSING":
        conn.close()
        raise HTTPException(status_code=409, detail="Hãy hủy tác vụ đang chạy trước khi xóa")
    if row and row[0]:
        try:
            p = Path(row[0]).resolve()
            if p.is_relative_to(RENDERED_DIR.resolve()) and p.exists():
                p.unlink()
        except Exception:
            pass
    c.execute("DELETE FROM render_tasks WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    return {"message": "Đã xóa tác vụ biên tập"}


@app.post("/api/render/tasks/{task_id}/cancel")
def cancel_render_task(task_id: int):
    with RENDER_PROCESSES_LOCK:
        proc = RENDER_PROCESSES.get(task_id)
    if not proc or proc.poll() is not None:
        raise HTTPException(status_code=409, detail="Tác vụ không còn chạy")
    proc.terminate()
    conn = connect_db(DB_PATH)
    conn.execute(
        "UPDATE render_tasks SET status='CANCELLED', progress=0, error_message='Đã hủy bởi người dùng', finished_at=? WHERE id=?",
        (int(time.time()), task_id),
    )
    conn.commit()
    conn.close()
    return {"message": "Đã gửi yêu cầu hủy render"}

@app.get("/api/render/assets")
def get_render_assets():
    overlays = [f.name for f in OVERLAYS_DIR.glob("*.png")]
    audios = [f.name for f in AUDIO_DIR.glob("*.*") if f.suffix.lower() in (".mp3", ".wav", ".m4a", ".aac")]
    return {"overlays": overlays, "audios": audios}

# --- Module 4: Auto Upload (Playwright TikTok Publisher) ---

@app.get("/api/upload/library-videos")
def api_list_library_videos():
    """Aggregates all publishable videos from Compare Studio and Render Engine."""
    videos = []
    
    # From Compare Studio
    if AUTO_COMPARE_VIDEOS_DIR.exists():
        for vdir in sorted(AUTO_COMPARE_VIDEOS_DIR.iterdir(), key=lambda d: d.stat().st_mtime if d.is_dir() else 0, reverse=True):
            if not vdir.is_dir():
                continue
            slug = vdir.name
            renders_dir = vdir / "renders"
            mp4s = sorted(list(renders_dir.glob("*.mp4")), key=lambda f: f.stat().st_mtime, reverse=True) if renders_dir.exists() else []
            if not mp4s:
                continue
            
            # Get publishing kit for title/hashtags
            pub = get_compare_publishing_kit(slug) or {}
            titles = pub.get("titles", [])
            title = titles[0].get("title", slug) if titles else slug.replace("-", " ").title()
            hashtags = pub.get("hashtagString", "#fyp #viral")
            
            # Thumbnail
            thumb = None
            thumb_candidates = list(vdir.glob("thumbnail.*")) + list(vdir.glob("poster.*"))
            if thumb_candidates:
                thumb = f"/api/compare-videos/video/{slug}/thumbnail"
            
            videos.append({
                "id": f"compare:{slug}",
                "source": "compare",
                "slug": slug,
                "title": title,
                "hashtags": hashtags,
                "video_path": str(mp4s[0]),
                "stream_url": f"/api/compare-videos/video/{slug}/stream",
                "thumbnail_url": thumb,
                "created_at": int(mp4s[0].stat().st_mtime),
            })
    
    # From Render Tasks
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, title, output_video_path, created_at FROM render_tasks WHERE status='COMPLETED' ORDER BY created_at DESC LIMIT 50")
    for row in c.fetchall():
        rid, name, out_path, created = row
        if out_path and os.path.exists(out_path):
            videos.append({
                "id": f"render:{rid}",
                "source": "render",
                "slug": f"render-{rid}",
                "title": name or f"Render #{rid}",
                "hashtags": "#fyp #viral",
                "video_path": out_path,
                "stream_url": None,
                "thumbnail_url": None,
                "created_at": created or 0,
            })
    conn.close()
    
    return {"videos": videos}

class UploadTaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    video_path: Optional[str] = ""
    render_task_id: Optional[int] = None
    caption: str = Field(default="", max_length=2200)
    hashtags: Optional[str] = "#foryou #fyp #viral"
    delay_minutes: Optional[int] = Field(default=0, ge=0, le=525600)
    schedule_minutes: Optional[int] = Field(default=0, ge=0, le=525600)
    scheduled_timestamp: Optional[int] = 0
    stagger_minutes: Optional[int] = Field(default=20, ge=0, le=1440)
    ai_generated: bool = True

@app.post("/api/upload/create-task")
def create_upload_task(item: UploadTaskCreate):
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    video_file = item.video_path
    if not video_file and item.render_task_id:
        c.execute("SELECT output_video_path FROM render_tasks WHERE id=?", (item.render_task_id,))
        row = c.fetchone()
        if row and row[0]:
            video_file = row[0]
        else:
            video_file = f"render_task_{item.render_task_id}.mp4"
    
    now = int(time.time())
    
    # Determine base schedule time
    if item.scheduled_timestamp and item.scheduled_timestamp > 0:
        base_sched = item.scheduled_timestamp
    else:
        delay = item.delay_minutes or item.schedule_minutes or 0
        base_sched = now + (delay * 60) if delay > 0 else now
    
    # Determine channel list
    ch_ids = []
    if item.channel_ids and len(item.channel_ids) > 0:
        ch_ids = item.channel_ids
    elif item.channel_id:
        ch_ids = [item.channel_id]
    
    if not ch_ids:
        conn.close()
        raise HTTPException(status_code=400, detail="Chưa chọn kênh đăng")

    ch_ids = list(dict.fromkeys(ch_ids))
    placeholders = ",".join("?" for _ in ch_ids)
    existing_ids = {row[0] for row in c.execute(f"SELECT id FROM channels WHERE id IN ({placeholders})", ch_ids)}
    if existing_ids != set(ch_ids):
        conn.close()
        raise HTTPException(status_code=400, detail="Danh sách kênh chứa ID không tồn tại")

    if not video_file or not Path(video_file).is_file():
        conn.close()
        raise HTTPException(status_code=400, detail="Video không tồn tại")
    resolved_video = Path(video_file).resolve()
    allowed_roots = [STORAGE_DIR.resolve(), AUTO_COMPARE_VIDEOS_DIR.resolve()]
    if not any(resolved_video.is_relative_to(root) for root in allowed_roots):
        conn.close()
        raise HTTPException(status_code=400, detail="Video nằm ngoài thư viện được phép")
    video_file = str(resolved_video)
    # Video Compare Studio còn ảnh chờ Antigravity (nền tạm) thì không được đăng.
    if resolved_video.is_relative_to(AUTO_COMPARE_VIDEOS_DIR.resolve()):
        video_slug = resolved_video.relative_to(AUTO_COMPARE_VIDEOS_DIR.resolve()).parts[0]
        waiting = compare_pending_images(video_slug)
        if waiting:
            conn.close()
            raise HTTPException(status_code=409, detail=f"Còn {len(waiting)} ảnh chờ Antigravity — chưa đăng được")
    else:
        video_slug = ""
    
    stagger = item.stagger_minutes or 0
    created_ids = []
    for i, ch_id in enumerate(ch_ids):
        sched_time = base_sched + (i * stagger * 60)
        c.execute("""
            INSERT INTO upload_tasks (channel_id, video_path, caption, hashtags, schedule_time, status, created_at,
                                      ai_generated, video_slug)
            VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?)
        """, (ch_id, video_file, item.caption, item.hashtags, sched_time, now, 1 if item.ai_generated else 0, video_slug))
        created_ids.append(c.lastrowid)
    
    conn.commit()
    conn.close()
    return {
        "message": f"Đã thêm {len(created_ids)} tác vụ đăng video vào hàng đợi",
        "task_ids": created_ids,
        "success": True
    }

@app.get("/api/upload/tasks")
def list_upload_tasks():
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("""
        SELECT u.id, u.channel_id, u.video_path, u.caption, u.hashtags, u.schedule_time, u.status, u.result_url, u.error_message, u.created_at, u.uploaded_at,
               u.attempt_count, u.next_retry_at, u.started_at,
               c.username, c.note, c.country,
               COALESCE(u.ai_generated, 1), COALESCE(u.video_slug, ''), COALESCE(u.clicked_post_at, 0),
               COALESCE(u.verify_note, ''), COALESCE(u.published_video_id, ''), COALESCE(u.publish_mode, '')
        FROM upload_tasks u
        LEFT JOIN channels c ON u.channel_id = c.id
        ORDER BY u.created_at DESC
    """)
    rows = c.fetchall()
    conn.close()
    try:  # chủ đề (niche) của từng acc theo mapping Autopilot; phụ, không làm hỏng danh sách
        from bkt_web.autopilot.channels import account_topics
        topics = account_topics()
    except Exception:
        topics = {}
    items = []
    for r in rows:
        topic = topics.get(r[1]) or {}
        items.append({
            "niche_id": topic.get("niche_id", ""),
            "niche_name": topic.get("niche_name", ""),
            "matrix_channel_id": topic.get("matrix_channel_id", ""),
            "matrix_channel_name": topic.get("matrix_channel_name", ""),
            "id": r[0],
            "channel_id": r[1],
            "video_path": r[2],
            "caption": r[3],
            "hashtags": r[4],
            "schedule_time": r[5],
            "status": r[6],
            "result_url": r[7],
            "error_message": r[8],
            "created_at": r[9],
            "uploaded_at": r[10],
            "attempt_count": r[11] or 0,
            "next_retry_at": r[12] or 0,
            "started_at": r[13] or 0,
            "username": r[14] or r[15] or f"ID {r[1]}",
            "country": r[16] or "KR",
            "ai_generated": bool(r[17]),
            "video_slug": r[18],
            "clicked_post_at": r[19] or 0,
            "verify_note": r[20],
            "published_video_id": r[21],
            "publish_mode": r[22],
        })
    return {"tasks": items}

# Thư mục được phép phát video của tác vụ đăng (không cho đọc file tuỳ ý qua video_path).
UPLOAD_VIDEO_ROOTS = (PROJECT_ROOT / "compare_studio" / "videos", STORAGE_DIR)


def upload_task_video_file(video_path: str):
    """Đường dẫn MP4 của tác vụ nếu nằm trong UPLOAD_VIDEO_ROOTS và tồn tại, ngược lại None."""
    if not video_path or not str(video_path).lower().endswith(".mp4"):
        return None
    try:
        path = Path(video_path).resolve()
    except (OSError, RuntimeError):
        return None
    if not path.is_file():
        return None
    for root in UPLOAD_VIDEO_ROOTS:
        try:
            path.relative_to(root.resolve())
            return path
        except ValueError:
            continue
    return None


@app.get("/api/upload/tasks/{task_id}/video")
def upload_task_video(task_id: int):
    """Phát đúng file MP4 sẽ được đăng của tác vụ (hỗ trợ Range để tua)."""
    conn = connect_db(DB_PATH)
    try:
        row = conn.execute("SELECT video_path FROM upload_tasks WHERE id=?", (task_id,)).fetchone()
    finally:
        conn.close()
    path = upload_task_video_file(row[0] if row else "")
    if not path:
        raise HTTPException(status_code=404, detail="Không tìm thấy file video của tác vụ")
    return FileResponse(str(path), media_type="video/mp4", headers={"cache-control": "private, max-age=300"})


@app.delete("/api/upload/tasks/{task_id}")
def delete_upload_task(task_id: int):
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM upload_tasks WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    return {"message": "Đã xóa tác vụ đăng bài"}


@app.post("/api/upload/tasks/{task_id}/retry")
def retry_upload_task(task_id: int):
    conn = connect_db(DB_PATH)
    cur = conn.execute(
        """
        UPDATE upload_tasks
        SET status='QUEUED', error_message='', next_retry_at=0, schedule_time=?,
            attempt_count=0, clicked_post_at=0,
            verify_attempts=0, next_verify_at=0, verify_note='', published_video_id=''
        WHERE id=? AND status IN ('ERROR', 'CANCELLED', 'NEEDS_CHECK')
        """,
        (int(time.time()), task_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Tác vụ không ở trạng thái có thể thử lại")
    return {"message": "Đã đưa tác vụ trở lại hàng đợi"}


@app.post("/api/upload/tasks/{task_id}/cancel")
def cancel_upload_task(task_id: int):
    conn = connect_db(DB_PATH)
    cur = conn.execute(
        "UPDATE upload_tasks SET status='CANCELLED' WHERE id=? AND status IN ('QUEUED','PENDING','WAITING_RENDER')",
        (task_id,),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Tác vụ đang chạy hoặc đã hoàn tất")
    return {"message": "Đã hủy tác vụ"}

@app.post("/api/upload/tasks/{task_id}/confirm")
def confirm_upload_task(task_id: int):
    """Người dùng đã kiểm tra kênh: video của task NEEDS_CHECK đã lên."""
    conn = connect_db(DB_PATH)
    cur = conn.execute(
        "UPDATE upload_tasks SET status='SUCCESS', uploaded_at=?, error_message='' WHERE id=? AND status='NEEDS_CHECK'",
        (int(time.time()), task_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Chỉ xác nhận được task đang 'Cần kiểm tra'")
    return {"message": "Đã đánh dấu video đã lên kênh"}


class PublishDryRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel_id: int
    video_slug: str
    caption: str = Field(default="", max_length=2200)
    hashtags: str = Field(default="", max_length=500)
    ai_generated: bool = True


@app.post("/api/upload/dry-run")
async def api_publish_dry_run(req: PublishDryRunRequest, background_tasks: BackgroundTasks):
    """Chạy khô: mở TikTok Studio, tải video, điền caption, bật nhãn AI rồi DỪNG trước khi bấm Đăng."""
    video_path = resolve_publish_video(None, req.video_slug)
    conn = connect_db(DB_PATH)
    exists = conn.execute("SELECT 1 FROM channels WHERE id=?", (req.channel_id,)).fetchone()
    conn.close()
    if not exists:
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")
    if not UPLOAD_LOCK.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"message": "Đang có phiên đăng video khác đang chạy!", "success": False})
    shot_dir = STORAGE_DIR / "publish_dryrun"
    shot_dir.mkdir(parents=True, exist_ok=True)
    shot = shot_dir / f"dryrun_{req.channel_id}_{int(time.time())}.png"
    upload_live_status.update({"is_running": True, "channel_id": req.channel_id, "task_id": None, "dry_run": True,
                               "screenshot": f"/storage/publish_dryrun/{shot.name}",
                               "logs": [{"time": time.strftime("%H:%M:%S"), "msg": "🧪 Chạy khô — sẽ dừng trước khi bấm Đăng", "level": "info"}]})

    def log_callback(msg: str, level: str = "info"):
        upload_live_status["logs"].append({"time": time.strftime("%H:%M:%S"), "msg": msg, "level": level})

    async def worker():
        from bkt_web.tiktok_publisher import publish_tiktok_video
        try:
            await publish_tiktok_video(
                channel_id=req.channel_id, video_path=str(video_path), caption=req.caption, hashtags=req.hashtags,
                db_path=str(DB_PATH), log_cb=log_callback, ai_generated=req.ai_generated,
                dry_run=True, screenshot_path=str(shot),
            )
        except Exception as exc:
            log_callback(f"❌ Ngoại lệ: {exc}", "error")
        finally:
            upload_live_status["is_running"] = False
            UPLOAD_LOCK.release()

    background_tasks.add_task(worker)
    return {"success": True, "message": "Đã bắt đầu chạy khô", "screenshot": f"/storage/publish_dryrun/{shot.name}"}

# --- Module 5: Settings (Cài Đặt Hệ Thống) ---
ALLOWED_SETTING_KEYS = {
    "api_captcha",
    "prefer_api_captcha",
    "default_render_gpu",
    "proxy_list",
}

PROFILE_SETTING_DEFAULTS = {
    "publish_profile_channels": "",
    "needs_check_auto_confirm": "false",
    "needs_check_verifier_enabled": "true",
    "profile_cache_clean_enabled": "false",
}

@app.get("/api/channels/profile-settings")
def get_profile_settings():
    from bkt_web.profile_session import get_setting
    return {k: get_setting(k, v, DB_PATH) for k, v in PROFILE_SETTING_DEFAULTS.items()}

@app.put("/api/channels/profile-settings")
def put_profile_settings(data: Dict[str, Any]):
    from bkt_web.profile_session import set_setting
    unknown = set(data) - set(PROFILE_SETTING_DEFAULTS)
    if unknown: raise HTTPException(400, detail=f"Setting không hợp lệ: {', '.join(sorted(unknown))}")
    if "publish_profile_channels" in data:
        raw = str(data["publish_profile_channels"]).strip()
        if raw != "all" and raw:
            vals = sorted(set(x.strip() for x in raw.split(",")))
            if any(not x.isdigit() or int(x) <= 0 for x in vals): raise HTTPException(400, detail="publish_profile_channels phải là danh sách id dương")
            conn = connect_db(DB_PATH); q = ",".join("?" * len(vals)); rows = conn.execute(f"SELECT id,profile_dir FROM channels WHERE id IN ({q})", [int(x) for x in vals]).fetchall(); conn.close()
            valid = {str(r[0]) for r in rows if r[1]}; invalid = [x for x in vals if x not in valid]
            if invalid: raise HTTPException(400, detail=f"Kênh không tồn tại hoặc chưa có profile: {', '.join(invalid)}")
            data["publish_profile_channels"] = ",".join(vals)
        elif raw == "": data["publish_profile_channels"] = ""
        elif raw != "all": raise HTTPException(400, detail="publish_profile_channels không hợp lệ")
    for key in ("needs_check_auto_confirm", "needs_check_verifier_enabled", "profile_cache_clean_enabled"):
        if key in data and str(data[key]).lower() not in ("true", "false"): raise HTTPException(400, detail=f"{key} chỉ nhận true/false")
        if key in data: data[key] = str(data[key]).lower()
    for k, v in data.items(): set_setting(k, v, DB_PATH)
    return get_profile_settings()

@app.get("/api/channels/profile-metrics")
def profile_metrics(days: int = 7):
    days = max(1, min(60, int(days))); now = int(time.time()); since = now - days * 86400
    conn = connect_db(DB_PATH)
    modes = {}
    for mode in ("profile", "clean"):
        rows = conn.execute("SELECT status,error_message FROM upload_tasks WHERE publish_mode=? AND started_at>=?", (mode, since)).fetchall()
        total = len(rows); counts = {s: sum(1 for r in rows if r[0] == s) for s in ("SUCCESS","NEEDS_CHECK","ERROR")}
        modes[mode] = {"started": total, **{k.lower(): v for k,v in counts.items()}, "rate": (round(counts["SUCCESS"]*100/total,2) if total else None), "deferred": sum(DEFERRED_PROFILE_BUSY in (r[1] or "") for r in rows)}
    events = conn.execute("SELECT source,COUNT(*),COUNT(DISTINCT channel_id) FROM channel_session_events WHERE state='LOGGED_OUT' AND created_at>=? GROUP BY source", (since,)).fetchall()
    first = conn.execute("SELECT MIN(started_at) FROM upload_tasks WHERE publish_mode='profile' AND started_at>0").fetchone()[0]
    baseline = None
    if first:
        # Mốc so sánh = mọi task chạy trong `days` ngày trước lần đầu dùng profile. Task
        # cũ chưa có publish_mode (rỗng) nên không được lọc theo chế độ.
        rows = conn.execute(
            "SELECT status FROM upload_tasks WHERE started_at>=? AND started_at<?",
            (first - days * 86400, first),
        ).fetchall()
        total = len(rows)
        counts = {s: sum(1 for r in rows if r[0] == s) for s in ("SUCCESS", "NEEDS_CHECK", "ERROR")}
        baseline = {
            "since": first - days * 86400, "until": first, "started": total,
            **{k.lower(): v for k, v in counts.items()},
            "rate": round(counts["SUCCESS"] * 100 / total, 2) if total else None,
        }
    conn.close()
    return {"days":days,"generated_at":now,"by_mode":modes,"session_events":{"by_source":{r[0]:{"events":r[1],"channels":r[2]} for r in events}},"baseline":baseline}


@app.get("/api/audit-events")
def get_audit_events(limit: int = 100):
    limit = max(1, min(limit, 500))
    conn = connect_db(DB_PATH)
    rows = conn.execute(
        """
        SELECT id, method, path, status_code, created_at
        FROM audit_events ORDER BY id DESC LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return {
        "events": [
            {
                "id": row[0],
                "method": row[1],
                "path": row[2],
                "status_code": row[3],
                "created_at": row[4],
            }
            for row in rows
        ]
    }


@app.get("/api/settings")
def get_system_settings():
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT key, value FROM settings")
    rows = c.fetchall()
    conn.close()
    settings_dict = {
        "api_captcha": "",
        "api_captcha_configured": False,
        "prefer_api_captcha": "achi",
        "default_render_gpu": "true",
        "proxy_list": "",
        "download_folder": str(DOWNLOADS_DIR),
        "render_folder": str(RENDERED_DIR),
    }
    for k, v in rows:
        if k in SECRET_SETTING_KEYS:
            continue  # khoá bí mật nay nằm ở kho khoá chung
        elif k in ALLOWED_SETTING_KEYS:
            settings_dict[k] = v

    # Khoá captcha lấy từ kho chung (Cài Đặt Hệ Thống → Kho Khoá API)
    settings_dict["api_captcha_configured"] = bool(key_vault.get_key("captcha.achi"))

    return settings_dict

@app.post("/api/settings")
def save_system_settings(data: Dict[str, Any]):
    conn = connect_db(DB_PATH)
    c = conn.cursor()
    for k, v in data.items():
        if k not in ALLOWED_SETTING_KEYS:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Setting không hợp lệ: {k}")
        value = str(v)
        if k in SECRET_SETTING_KEYS:
            # Giữ tương thích với giao diện cũ: key gửi vào đây được chuyển
            # thẳng sang kho khoá chung chứ không lưu ở bảng settings nữa.
            if value and k == "api_captcha":
                key_vault.set_key("captcha.achi", value)
            continue
        c.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, value))
    conn.commit()
    conn.close()

    return {"message": "Đã lưu cài đặt hệ thống thành công!"}

# ---------------------------------------------------------------------------
# KHO KHOÁ API — một chỗ duy nhất cho mọi API key của ứng dụng
# ---------------------------------------------------------------------------

class ApiKeySave(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: str = Field(default="", max_length=4096)


@app.get("/api/keys")
def list_api_keys():
    """Trạng thái từng khoá. Không bao giờ kèm giá trị thật."""
    return {"keys": key_vault.status()}


@app.put("/api/keys/{name}")
def save_api_key(name: str, item: ApiKeySave):
    if name not in key_vault.SPEC_BY_NAME:
        raise HTTPException(status_code=404, detail=f"Không có khoá tên '{name}'")
    key_vault.set_key(name, item.value)
    return {"success": True, "name": name, "configured": bool(key_vault.get_key(name))}


@app.delete("/api/keys/{name}")
def delete_api_key(name: str):
    if name not in key_vault.SPEC_BY_NAME:
        raise HTTPException(status_code=404, detail=f"Không có khoá tên '{name}'")
    key_vault.delete_key(name)
    return {"success": True, "name": name, "configured": False}


@app.post("/api/keys/{name}/test")
def test_api_key(name: str):
    """Gọi thử nhà cung cấp để xác nhận khoá còn dùng được."""
    if name not in key_vault.SPEC_BY_NAME:
        raise HTTPException(status_code=404, detail=f"Không có khoá tên '{name}'")
    key = key_vault.get_key(name)
    if not key:
        raise HTTPException(status_code=400, detail="Khoá này chưa được đặt")
    try:
        if name == "ai.gemini":
            r = requests.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                headers={"x-goog-api-key": key}, timeout=20,
            )
            if r.status_code == 200:
                models = [
                    m["name"].split("/")[-1] for m in r.json().get("models", [])
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                ]
                return {"valid": True, "message": f"Khoá hợp lệ — {len(models)} model dùng được"}
            return {"valid": False, "message": f"Google trả về HTTP {r.status_code}: {r.text[:200]}"}

        if name == "ai.claude":
            r = requests.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"}, timeout=20,
            )
            return ({"valid": True, "message": "Khoá Claude hợp lệ"} if r.status_code == 200
                    else {"valid": False, "message": f"Anthropic trả về HTTP {r.status_code}: {r.text[:200]}"})

        if name == "ai.openai":
            r = requests.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"}, timeout=20,
            )
            return ({"valid": True, "message": "Khoá OpenAI hợp lệ"} if r.status_code == 200
                    else {"valid": False, "message": f"OpenAI trả về HTTP {r.status_code}: {r.text[:200]}"})

        if name == "captcha.achi":
            return test_achi_captcha({"api_captcha": key})
    except Exception as exc:
        return {"valid": False, "message": f"Lỗi kết nối: {exc}"}

    return {"valid": True, "message": "Khoá đã lưu. Nhà cung cấp này chưa có bước kiểm tra tự động."}


@app.post("/api/settings/test-achi")
def test_achi_captcha(data: Dict[str, str]):
    key = data.get("api_captcha", "").strip()
    if not key:
        key = key_vault.get_key("captcha.achi")
    if not key:
        raise HTTPException(status_code=400, detail="Vui lòng nhập API Key Achi Captcha để kiểm tra")
    
    try:
        payload = {
            "clientKey": key,
            "task": {
                "type": "TiktokCaptchaTask",
                "subType": 1,
                "image": "dGVzdA=="
            }
        }
        r = requests.post("https://api.achicaptcha.com/createTask", json=payload, timeout=10)
        res_data = r.json()
        error_id = res_data.get("errorId", 0)
        error_desc = res_data.get("errorDescription", "")
        
        if error_id == 1 or "key" in error_desc.lower():
            return {"valid": False, "message": f"API Key không hợp lệ: {error_desc or 'Sai clientKey'}"}
        elif error_id == 6:
            return {"valid": True, "message": "API Key chính xác! (Số dư tài khoản AchiCaptcha hiện tại = 0, cần nạp thêm credit)"}
        elif error_id == 0 or "taskId" in res_data:
            return {"valid": True, "message": "Kết nối thành công! API Key Achi Captcha hợp lệ và sẵn sàng giải captcha."}
        else:
            return {"valid": True, "message": f"AchiCaptcha phản hồi: {error_desc or 'Đã kết nối thành công'}"}
    except Exception as e:
        return {"valid": False, "message": f"Lỗi kết nối tới AchiCaptcha: {str(e)}"}

# ==============================================================================
# AUTO COMPARE VIDEO MOD INTEGRATION (SENIOR FULLSTACK HUB)
# ==============================================================================
AUTO_COMPARE_DIR = Path(
    os.environ.get("TOKMATRIX_COMPARE_DIR", str(PROJECT_ROOT / "compare_studio"))
).resolve()
if not AUTO_COMPARE_DIR.exists() and (PROJECT_ROOT.parent / "auto-compare-video-mod").exists():
    AUTO_COMPARE_DIR = (PROJECT_ROOT.parent / "auto-compare-video-mod").resolve()
AUTO_COMPARE_VIDEOS_DIR = AUTO_COMPARE_DIR / "videos"
AUTO_COMPARE_TOOLS_DIR = AUTO_COMPARE_DIR / "tools"

compare_gen_status = {
    "is_running": False,
    "progress": 0,
    "current_stage": "IDLE",
    "slug": "",
    "logs": []
}


def get_compare_video_dir(slug: str, *, must_exist: bool = True) -> Path:
    try:
        clean_slug = validate_slug(slug)
        return safe_child(AUTO_COMPARE_VIDEOS_DIR, clean_slug, must_exist=must_exist)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400 if isinstance(exc, ValueError) else 404, detail=str(exc))

def get_compare_publishing_kit(slug: str) -> Optional[Dict[str, Any]]:
    """Caption / tiêu đề / hashtag theo đúng thể loại và ngôn ngữ (bkt_web/publish_kit.py).

    Trước đây gọi `node tools/publishing-kit.mjs`, vốn chỉ biết mẫu "A vs B" nên mọi thể
    loại khác ra caption kiểu "… và Side B".
    """
    slug = validate_slug(slug)
    try:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(build_compare_publish_kit(slug))
        # Được gọi từ bên trong event loop: chạy ở luồng riêng.
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            return ex.submit(asyncio.run, build_compare_publish_kit(slug)).result(timeout=60)
    except Exception as e:
        print(f"[PublishingKit] Error for {slug}: {e}")
    return None

@app.get("/api/compare-videos/library")
def api_get_compare_library():
    if not AUTO_COMPARE_VIDEOS_DIR.exists():
        return {"total": 0, "rendered_count": 0, "videos": []}
    
    library = []
    for p in sorted(AUTO_COMPARE_VIDEOS_DIR.iterdir()):
        if not p.is_dir() or p.name.startswith("."):
            continue
        try:
            slug = validate_slug(p.name)
        except ValueError:
            continue
        renders_dir = p / "renders"
        mp4s = sorted(list(renders_dir.glob("*.mp4")), key=lambda f: f.stat().st_mtime, reverse=True) if renders_dir.exists() else []
        
        brief_p = p / "BRIEF.md"
        title = slug
        tagline = ""
        lang = "en"
        if brief_p.exists():
            try:
                for line in brief_p.read_text(errors="ignore").splitlines():
                    if line.startswith("# "):
                        title = line[2:].strip()
                    elif "Góc so sánh" in line or "Khái niệm" in line or "Tagline" in line:
                        tagline = line.split(":")[-1].strip()
                    elif "Ngôn ngữ" in line:
                        lang = line.split(":")[-1].strip()
            except Exception:
                pass
                
        # Quốc gia theo ngôn ngữ thật của video. Trước đây dò chuỗi con của slug nên
        # "dev-vs-devops" chứa "-de" bị gắn DE.
        info = video_lang_title(slug)
        lang = info["lang"]
        title = info["title"] if title == slug else title
        country = {"vi": "VN", "en": "US", "de": "DE", "fr": "FR", "ja": "JP", "ko": "KR"}.get(lang, "US")
        
        # Cùng hàm nhận diện với Studio (meta/spec trước, tiền tố slug, rồi marker HTML).
        kind = detect_video_type_for_slug(slug)
        style = "Comparison" if kind == "compare" else kind.capitalize()
                
        latest_mp4 = mp4s[0] if mp4s else None
        library.append({
            "slug": slug,
            "title": title,
            "tagline": tagline,
            "country": country,
            "style": style,
            "has_render": latest_mp4 is not None,
            "mp4_name": latest_mp4.name if latest_mp4 else None,
            "mp4_size_mb": round(latest_mp4.stat().st_size / (1024*1024), 2) if latest_mp4 else 0,
            "rendered_at": datetime.datetime.fromtimestamp(latest_mp4.stat().st_mtime).strftime("%Y-%m-%d %H:%M") if latest_mp4 else None,
            "mtime": latest_mp4.stat().st_mtime if latest_mp4 else 0
        })
        
    library.sort(key=lambda x: (1 if x["has_render"] else 0, x["mtime"]), reverse=True)
    rendered_count = len([v for v in library if v["has_render"]])
    return {
        "total": len(library),
        "rendered_count": rendered_count,
        "videos": library
    }

@app.get("/api/compare-videos/topics")
def api_get_compare_topics():
    try:
        node_script = 'import("./tools/topics-data.mjs").then(m => console.log(JSON.stringify({ categories: m.CATEGORIES, topics: m.TOPICS })))'
        res = subprocess.run(
            ["node", "-e", node_script],
            cwd=str(AUTO_COMPARE_DIR),
            capture_output=True,
            text=True,
            timeout=10
        )
        if res.returncode == 0:
            return json.loads(res.stdout)
    except Exception as e:
        print(f"[Topics] Error fetching topics: {e}")
    return {"categories": [], "topics": []}

@app.get("/api/compare-videos/video/{slug}/details")
def api_get_compare_video_details(slug: str):
    vid_dir = get_compare_video_dir(slug)
    data = get_compare_publishing_kit(slug)
    if not data:
        brief_p = vid_dir / "BRIEF.md"
        brief_text = brief_p.read_text(errors="ignore") if brief_p.exists() else "Chưa có brief"
        return {
            "slug": slug,
            "titles": [{"type": "standard", "label": "Tiêu đề", "title": slug}],
            "description": brief_text[:300],
            "chapters": [],
            "hashtags": ["#fyp", "#viral", "#learnontiktok"],
            "hashtagString": "#fyp #viral #learnontiktok"
        }
    return data

@app.get("/api/compare-videos/video/{slug}/stream")
def api_stream_compare_video(slug: str):
    p = get_compare_video_dir(slug) / "renders"
    if not p.exists():
        raise HTTPException(status_code=404, detail="Thư mục video không tồn tại")
    mp4s = sorted(list(p.glob("*.mp4")), key=lambda f: f.stat().st_mtime, reverse=True)
    if not mp4s:
        raise HTTPException(status_code=404, detail="Chưa có bản render MP4 cho video này")
    return FileResponse(str(mp4s[0]), media_type="video/mp4")

@app.post("/api/compare-videos/generate")
def api_generate_compare_video(req: Dict[str, Any], background_tasks: BackgroundTasks):
    global compare_gen_status
    if compare_gen_status["is_running"]:
        return {"status": "busy", "message": "Đang có tiến trình sinh video AI chạy ngầm..."}
        
    category = req.get("category", "")
    style = req.get("style", "compare")
    slug = req.get("slug", "")
    if slug:
        try:
            slug = validate_slug(slug)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    allowed_styles = {"compare", "vox", "chalk", "kinetic", "tierlist", "mystery", "survival", "wildlife", "science", "folklore"}
    if style not in allowed_styles or (category and not re.fullmatch(r"[A-Za-z0-9_-]{1,50}", category)):
        raise HTTPException(status_code=400, detail="Style hoặc category không hợp lệ")
    render = req.get("render", True)
    
    background_tasks.add_task(run_compare_generator_task, category, style, slug, render)
    return {"status": "started", "message": "Đã bắt đầu tiến trình sinh video tự động!"}

@app.get("/api/compare-videos/status")
def api_get_compare_status():
    global compare_gen_status
    return compare_gen_status

@app.post("/api/compare-videos/send-to-upload")
def api_send_compare_to_upload(req: Dict[str, Any]):
    """Đưa bản render mới nhất vào hàng đợi đăng của MỘT kênh do người dùng chọn.

    Body: slug, channel_id (bắt buộc — không bao giờ tự chọn kênh), caption?, hashtags?,
    schedule_time? (epoch) hoặc delay_minutes? (mặc định đăng ngay), ai_generated? (mặc định
    theo publish kit), confirm_nearby? (xác nhận khi kênh đã có bài trong ±2 giờ).
    """
    slug = str(req.get("slug", "")).strip()
    if not slug:
        raise HTTPException(status_code=400, detail="Thiếu tham số slug")
    get_compare_video_dir(slug)
    kit = get_compare_publishing_kit(slug) or {}
    caption = req.get("caption")
    if caption is None:
        caption = kit.get("caption") or (kit.get("titles") or [{}])[0].get("title") or slug
    hashtags = req.get("hashtags")
    if hashtags is None:
        hashtags = kit.get("hashtagString") or "#fyp"
    schedule_ts = req.get("schedule_time")
    if not schedule_ts and req.get("delay_minutes"):
        try:
            schedule_ts = int(time.time()) + int(req["delay_minutes"]) * 60
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="delay_minutes không hợp lệ")
    ai_generated = req.get("ai_generated")
    if ai_generated is None:
        ai_generated = kit.get("aiGenerated", True)
    try:
        task = publish_flow.enqueue_upload(
            slug, req.get("channel_id"), str(caption), str(hashtags),
            schedule_ts=int(schedule_ts) if schedule_ts else None, ai_generated=bool(ai_generated),
            confirm_nearby=bool(req.get("confirm_nearby")), db_path=DB_PATH,
        )
    except publish_flow.PublishError as exc:
        return JSONResponse(status_code=exc.status, content={"detail": exc.message, **exc.extra})
    when = datetime.datetime.fromtimestamp(task["schedule_time"]).strftime("%H:%M %d/%m")
    return {
        "success": True,
        "task_id": task["id"],
        "message": f"Đã xếp hàng đăng lên @{task['channel']['username']} lúc {when}",
        "video_path": task["video_path"],
        "caption": caption,
        "hashtags": hashtags,
        "schedule_time": task["schedule_time"],
        "ai_generated": bool(ai_generated),
    }

def run_compare_generator_task(category: str, style: str, slug: str, render: bool):
    global compare_gen_status
    compare_gen_status["is_running"] = True
    compare_gen_status["progress"] = 10
    compare_gen_status["current_stage"] = "Khởi tạo chủ đề kịch bản..."
    compare_gen_status["slug"] = slug or "auto"
    compare_gen_status["logs"] = [f"[{time.strftime('%H:%M:%S')}] Bắt đầu tiến trình sinh video AI (Style: {style}, Cat: {category or 'auto'})..."]
    
    try:
        cmd = ["node"]
        if style == "vox":
            cmd += ["tools/create-vox-video.mjs"]
        elif style == "chalk":
            cmd += ["tools/create-chalk-video.mjs"]
        elif style == "kinetic":
            cmd += ["tools/create-kinetic-video.mjs"]
        elif style == "tierlist":
            cmd += ["tools/create-tierlist-video.mjs"]
        elif style == "mystery":
            cmd += ["tools/create-mystery-video.mjs"]
        elif style == "survival":
            cmd += ["tools/create-survival-video.mjs"]
        elif style == "wildlife":
            cmd += ["tools/create-wildlife-video.mjs"]
        elif style == "science":
            cmd += ["tools/create-science-video.mjs"]
        elif style == "folklore":
            # Chủ đề ngẫu nhiên từ danh sách dân gian; ảnh qua hàng đợi Antigravity.
            cmd += ["tools/create-folklore-video.mjs"] + (["--render"] if render else [])
        else:
            if slug:
                cmd += ["tools/generate-topic.mjs", "--slug", slug, "--create"]
            else:
                cmd += ["tools/create-video.mjs", "--auto-topic"]
                if category:
                    cmd += ["--category", category]
            if render:
                cmd += ["--render"]
                
        compare_gen_status["logs"].append(f"[{time.strftime('%H:%M:%S')}] Lệnh thực thi: {' '.join(cmd)}")
        compare_gen_status["progress"] = 35
        compare_gen_status["current_stage"] = "Đang tổng hợp kịch bản, giọng đọc TTS và dựng hình..."
        
        proc = subprocess.Popen(
            cmd,
            cwd=str(AUTO_COMPARE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        for line in proc.stdout:
            line_str = line.strip()
            if line_str:
                compare_gen_status["logs"].append(f"[{time.strftime('%H:%M:%S')}] {line_str}")
                if len(compare_gen_status["logs"]) > 200:
                    compare_gen_status["logs"] = compare_gen_status["logs"][-200:]
                if "render" in line_str.lower() or "mp4" in line_str.lower():
                    compare_gen_status["progress"] = 75
                    compare_gen_status["current_stage"] = "Đang render MP4 bằng HyperFrames..."
                elif "hoàn thành" in line_str.lower() or "done" in line_str.lower():
                    compare_gen_status["progress"] = 95
                    
        return_code = proc.wait()
        if return_code != 0:
            raise RuntimeError(f"Tiến trình tạo video kết thúc với mã lỗi {return_code}")
        compare_gen_status["progress"] = 100
        compare_gen_status["current_stage"] = "Hoàn thành tạo video thành công!"
        compare_gen_status["logs"].append(f"[{time.strftime('%H:%M:%S')}] ✅ Video đã sẵn sàng trong thư viện!")
    except Exception as e:
        compare_gen_status["logs"].append(f"[{time.strftime('%H:%M:%S')}] ❌ Lỗi: {str(e)}")
        compare_gen_status["current_stage"] = "Thất bại"
    finally:
        compare_gen_status["is_running"] = False

# --- Live TikTok Studio Publisher API ---
upload_live_status = {
    "is_running": False,
    "channel_id": None,
    "logs": []
}
UPLOAD_LOCK = threading.Lock()
SCHEDULER_STOP = threading.Event()
SCHEDULER_THREAD: Optional[threading.Thread] = None
VERIFIER_THREAD: Optional[threading.Thread] = None
PROFILE_MAINT_THREAD: Optional[threading.Thread] = None


class PublishNowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    channel_id: int
    video_path: Optional[str] = None
    video_slug: Optional[str] = None
    task_id: Optional[int] = None
    caption: str = Field(default="", max_length=2200)
    hashtags: str = Field(default="#fyp #viral", max_length=500)
    ai_generated: bool = True


def resolve_publish_video(video_path: Optional[str], video_slug: Optional[str]) -> Path:
    if video_slug:
        try:
            slug = validate_slug(video_slug)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        render_dir = safe_child(AUTO_COMPARE_VIDEOS_DIR, slug, must_exist=True) / "renders"
        mp4s = sorted(render_dir.glob("*.mp4"), key=lambda f: f.stat().st_mtime, reverse=True)
        if not mp4s:
            raise HTTPException(status_code=404, detail="Video chưa có bản render MP4")
        candidate = mp4s[0].resolve()
    elif video_path:
        candidate = Path(video_path).resolve()
    else:
        raise HTTPException(status_code=400, detail="Thiếu video_path hoặc video_slug")

    allowed_roots = [STORAGE_DIR.resolve(), AUTO_COMPARE_VIDEOS_DIR.resolve()]
    if not candidate.is_file() or not any(candidate.is_relative_to(root) for root in allowed_roots):
        raise HTTPException(status_code=400, detail="Video nằm ngoài thư viện được phép")
    return candidate

@app.post("/api/upload/publish-now")
async def api_publish_now(req: PublishNowRequest, background_tasks: BackgroundTasks):
    video_path = resolve_publish_video(req.video_path, req.video_slug)
    if req.video_slug:
        waiting = compare_pending_images(req.video_slug)
        if waiting:
            raise HTTPException(status_code=409, detail=f"Còn {len(waiting)} ảnh chờ Antigravity — chưa đăng được")
    conn = connect_db(DB_PATH)
    channel_exists = conn.execute("SELECT 1 FROM channels WHERE id=?", (req.channel_id,)).fetchone()
    if not channel_exists:
        conn.close()
        raise HTTPException(status_code=404, detail="Kênh không tồn tại")

    task_id = req.task_id
    if task_id:
        task = conn.execute(
            "SELECT channel_id, video_path, status FROM upload_tasks WHERE id=?",
            (task_id,),
        ).fetchone()
        if not task or task[0] != req.channel_id or Path(task[1]).resolve() != video_path:
            conn.close()
            raise HTTPException(status_code=400, detail="Tác vụ đăng không khớp kênh hoặc video")
    else:
        cur = conn.execute(
            """
            INSERT INTO upload_tasks(channel_id,video_path,caption,hashtags,schedule_time,status,created_at,ai_generated,video_slug)
            VALUES(?,?,?,?,?,'QUEUED',?,?,?)
            """,
            (req.channel_id, str(video_path), req.caption, req.hashtags, int(time.time()), int(time.time()),
             1 if req.ai_generated else 0, req.video_slug or ""),
        )
        task_id = cur.lastrowid
    conn.commit()
    conn.close()

    if not UPLOAD_LOCK.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"message": "Đang có phiên đăng video khác đang chạy!", "success": False})

    upload_live_status["is_running"] = True
    upload_live_status["channel_id"] = req.channel_id
    upload_live_status["task_id"] = task_id
    upload_live_status["logs"] = [{
        "time": time.strftime("%H:%M:%S"),
        "msg": f"Khởi tạo phiên đăng video TikTok cho kênh ID #{req.channel_id}...",
        "level": "info"
    }]
    
    def log_callback(msg: str, level: str = "info"):
        upload_live_status["logs"].append({
            "time": time.strftime("%H:%M:%S"),
            "msg": msg,
            "level": level
        })
        if len(upload_live_status["logs"]) > 150:
            upload_live_status["logs"] = upload_live_status["logs"][-150:]
            
    from bkt_web.tiktok_publisher import publish_tiktok_video
    target_vid_path = str(video_path)

    conn = connect_db(DB_PATH)
    conn.execute(
        "UPDATE upload_tasks SET status='UPLOADING', started_at=?, attempt_count=attempt_count+1 WHERE id=?",
        (int(time.time()), task_id),
    )
    conn.commit()
    conn.close()
    
    async def worker():
        try:
            res = await publish_tiktok_video(
                channel_id=req.channel_id,
                video_path=target_vid_path,
                caption=req.caption,
                hashtags=req.hashtags,
                db_path=str(DB_PATH),
                log_cb=log_callback,
                task_id=task_id,
                ai_generated=req.ai_generated,
            )
            if res.get("success"):
                log_callback("🎉 Hoàn tất phiên đăng video lên TikTok thành công!", "success")
            else:
                log_callback(f"❌ Kết thúc có lỗi: {res.get('error')}", "error")
        except Exception as e:
            log_callback(f"❌ Ngoại lệ: {str(e)}", "error")
            conn = connect_db(DB_PATH)
            conn.execute(
                "UPDATE upload_tasks SET status='ERROR', error_message=? WHERE id=?",
                (str(e)[:1000], task_id),
            )
            conn.commit()
            conn.close()
        finally:
            upload_live_status["is_running"] = False
            UPLOAD_LOCK.release()
            
    background_tasks.add_task(worker)
    return {"message": "Đã bắt đầu phiên đăng video lên TikTok Studio!", "success": True, "task_id": task_id}

@app.get("/api/upload/publish-logs")
def api_get_publish_logs():
    return upload_live_status

@app.get("/api/compare-videos/video/{slug}/full-detail")
async def api_get_compare_video_full_detail(slug: str):
    try:
        slug = validate_slug(slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    vid_dir = get_compare_video_dir(slug)
    try:
        data = await compare_video_detail(slug)
        data["publishing"] = await asyncio.to_thread(get_compare_publishing_kit, slug) or {}
        return data
    except Exception as exc:
        print(f"[Compare] Không đọc được chi tiết {slug}: {exc}")

    brief_text = ""
    if (vid_dir / "BRIEF.md").exists():
        brief_text = (vid_dir / "BRIEF.md").read_text(errors="ignore")
        
    pub = get_compare_publishing_kit(slug) or {}
    
    script_lines = []
    vo_path = vid_dir / "scripts" / "generate-vo.mjs"
    if vo_path.exists():
        vo_content = vo_path.read_text(errors="ignore")
        matches = re.findall(r'id:\s*["\']line-(\d+)["\'].*?text:\s*["\'](.*?)["\']', vo_content, re.DOTALL)
        for idx, (line_num, txt) in enumerate(matches):
            clean_txt = txt.replace('\\"', '"').replace('\n', ' ')
            script_lines.append({
                "n": int(line_num),
                "spoken": clean_txt,
                "caption": clean_txt,
                "start": round(idx * 3.6, 1),
                "dur": 3.6,
                "beat": f"Hồi {idx + 1}"
            })
            
    mp4s = sorted(list((vid_dir / "renders").glob("*.mp4")), key=lambda x: x.stat().st_mtime, reverse=True) if (vid_dir / "renders").exists() else []
    latest_mp4 = mp4s[0] if mp4s else None
    
    return {
        "slug": slug,
        "title": slug.replace("-", " ").title(),
        "lang": "vi" if slug.endswith("-vi") else "en",
        "duration": 44.0,
        "lines": len(script_lines) or 12,
        "message": brief_text,
        "hasRender": latest_mp4 is not None,
        "render": {
            "name": latest_mp4.name if latest_mp4 else None,
            "size": latest_mp4.stat().st_size if latest_mp4 else 0,
            "mtime": latest_mp4.stat().st_mtime if latest_mp4 else 0
        } if latest_mp4 else None,
        "script": script_lines,
        "brief": brief_text,
        "publishing": pub
    }

@app.post("/api/compare-videos/run-task")
def api_run_compare_task(req: Dict[str, Any]):
    """Chạy check / render / vo / fit cho một video qua bộ quản lý tác vụ native.

    Log theo dõi được ở /api/runs/{id}/stream như các tác vụ khác của Compare Studio.
    """
    slug = req.get("slug")
    task = req.get("task")
    target = req.get("target", 44)

    if not slug or not task:
        raise HTTPException(status_code=400, detail="Thiếu slug hoặc task")
    slug = get_compare_video_dir(slug).name
    if task not in {"check", "render", "vo", "fit"}:
        raise HTTPException(status_code=400, detail="Task không hợp lệ")
    try:
        target = int(target)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Thời lượng mục tiêu không hợp lệ")
    if target < 10 or target > 180:
        raise HTTPException(status_code=400, detail="Thời lượng mục tiêu phải từ 10 đến 180 giây")
    busy = next((r for r in list(COMPARE_RUNS.values()) if r["slug"] == slug and not r["done"]), None)
    if busy:
        raise HTTPException(status_code=409, detail=f"Đang chạy '{busy['task']}' cho video {slug}")

    run = start_compare_run(slug, task, {"target": target, "render": bool(req.get("render"))})
    return {
        "success": True,
        "id": run["id"],
        "stream_url": f"/api/runs/{run['id']}/stream",
        "message": f"Đang thực thi '{task}' cho video {slug}!",
    }


@app.get("/api/compare-videos/video/{slug}/poster")
def api_get_compare_video_poster(slug: str):
    vid_dir = get_compare_video_dir(slug)
    candidates = [
        vid_dir / "assets" / "images" / "scene-1.jpg",
        vid_dir / "assets" / "images" / "scene-1.png",
        vid_dir / "renders" / "poster.jpg",
        vid_dir / "renders" / "poster.png",
    ]
    for c in candidates:
        if c.exists():
            return FileResponse(str(c))
    img_dir = vid_dir / "assets" / "images"
    if img_dir.exists():
        for f in img_dir.glob("*.jpg"):
            return FileResponse(str(f))
    raise HTTPException(status_code=404, detail="Không tìm thấy poster")

@app.get("/api/compare-videos/video/{slug}/snapshot")
def api_get_compare_video_snapshot(slug: str):
    vid_dir = get_compare_video_dir(slug)
    candidates = [
        vid_dir / "renders" / "contact-sheet.png",
        vid_dir / "renders" / "contact-sheet.jpg",
        vid_dir / "assets" / "images" / "scene-1.jpg",
    ]
    for c in candidates:
        if c.exists():
            return FileResponse(str(c))
    img_dir = vid_dir / "assets" / "images"
    if img_dir.exists():
        for f in img_dir.glob("*.jpg"):
            return FileResponse(str(f))
    raise HTTPException(status_code=404, detail="Không tìm thấy snapshot")

# Serve Static & Storage Files

# =============================================================================
# LỊCH SỬ CHỈ SỐ KÊNH & BẢNG ĐIỀU KHIỂN TỔNG
# =============================================================================

@app.get("/api/channels/{ch_id}/history")
def api_channel_history(ch_id: int, days: int = 30):
    """Chuỗi thời gian doanh thu / RPM / follower của một kênh."""
    since = int(time.time()) - max(1, days) * 86400
    conn = connect_db(DB_PATH)
    try:
        rows = conn.execute(
            """SELECT captured_at, captured_ts, earned, balance, rpm,
                      follower_count, view_count, like_count, video_count, status
               FROM channel_metrics_history
               WHERE channel_id=? AND captured_ts >= ?
               ORDER BY captured_ts ASC""",
            (ch_id, since),
        ).fetchall()
        info = conn.execute(
            "SELECT note, username, nickname, currency FROM channels WHERE id=?", (ch_id,)
        ).fetchone()
    finally:
        conn.close()

    points = [
        {
            "captured_at": r[0], "captured_ts": r[1], "earned": r[2], "balance": r[3],
            "rpm": r[4], "follower_count": r[5], "view_count": r[6], "like_count": r[7],
            "video_count": r[8], "status": r[9],
        }
        for r in rows
    ]
    growth = {}
    if len(points) >= 2:
        first, last = points[0], points[-1]
        growth = {
            "earned": round((last["earned"] or 0) - (first["earned"] or 0), 2),
            "follower": (last["follower_count"] or 0) - (first["follower_count"] or 0),
            "view": (last["view_count"] or 0) - (first["view_count"] or 0),
        }
    return {
        "success": True,
        "channel": {
            "id": ch_id,
            "note": info[0] if info else "",
            "username": info[1] if info else "",
            "nickname": info[2] if info else "",
            "currency": info[3] if info else "",
        },
        "points": points,
        "growth": growth,
        "total": len(points),
    }


@app.get("/api/channels/history-summary")
def api_channels_history_summary(days: int = 30):
    """Tổng doanh thu toàn hệ thống theo từng ngày (điểm cuối cùng của mỗi kênh/ngày)."""
    since = int(time.time()) - max(1, days) * 86400
    conn = connect_db(DB_PATH)
    try:
        rows = conn.execute(
            """SELECT day, SUM(earned) AS earned, SUM(followers) AS followers,
                      AVG(rpm) AS rpm, COUNT(*) AS channels
               FROM (
                   SELECT date(captured_ts, 'unixepoch', 'localtime') AS day,
                          channel_id,
                          MAX(captured_ts) AS ts,
                          earned, follower_count AS followers, rpm
                   FROM channel_metrics_history
                   WHERE captured_ts >= ?
                   GROUP BY day, channel_id
               )
               GROUP BY day ORDER BY day ASC""",
            (since,),
        ).fetchall()
    finally:
        conn.close()
    return {
        "success": True,
        "days": [
            {"day": r[0], "earned": round(r[1] or 0, 2), "followers": int(r[2] or 0),
             "rpm": round(r[3] or 0, 2), "channels": r[4]}
            for r in rows
        ],
    }


@app.get("/api/dashboard/summary")
def api_dashboard_summary():
    """Số liệu gom cho Bảng Điều Khiển: kênh, render, lịch đăng, hàng đợi ảnh, nick."""
    conn = connect_db(DB_PATH)

    def scalar(sql, params=(), default=0):
        try:
            row = conn.execute(sql, params).fetchone()
            return (row[0] if row and row[0] is not None else default)
        except Exception:
            return default

    def rows(sql, params=()):
        try:
            return conn.execute(sql, params).fetchall()
        except Exception:
            return []

    try:
        today_start = int(time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d")))
        data = {
            "channels": {
                "total": scalar("SELECT COUNT(*) FROM channels"),
                "monetized": scalar("SELECT COUNT(*) FROM channels WHERE status LIKE '%BKT%' OR status LIKE '%Đã bật%'"),
                "earned_total": round(scalar("SELECT SUM(earned) FROM channels") or 0, 2),
                "balance_total": round(scalar("SELECT SUM(balance) FROM channels") or 0, 2),
                "checked_today": scalar("SELECT COUNT(*) FROM channels WHERE last_checked >= ?", (today_start,)),
            },
            "render": {
                "queued": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='QUEUED'"),
                "processing": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='PROCESSING'"),
                "done": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='DONE'"),
                "error": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='ERROR'"),
            },
            "upload": {
                "queued": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status IN ('QUEUED','PENDING')"),
                "uploading": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status='UPLOADING'"),
                "success": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status='SUCCESS'"),
                "failed": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status='FAILED'"),
                "next": [
                    {"id": r[0], "caption": (r[1] or "")[:60], "schedule_time": r[2], "channel_id": r[3]}
                    for r in rows(
                        """SELECT id, caption, schedule_time, channel_id FROM upload_tasks
                           WHERE status IN ('QUEUED','PENDING') ORDER BY schedule_time ASC LIMIT 5"""
                    )
                ],
            },
            "images": {
                "pending": scalar("SELECT COUNT(*) FROM image_queue WHERE status='pending'"),
                "processing": scalar("SELECT COUNT(*) FROM image_queue WHERE status='processing'"),
                "completed": scalar("SELECT COUNT(*) FROM image_queue WHERE status='completed'"),
                "failed": scalar("SELECT COUNT(*) FROM image_queue WHERE status='failed'"),
                "library": scalar("SELECT COUNT(*) FROM image_assets"),
            },
            "accounts": {
                "fb_reg": scalar("SELECT COUNT(*) FROM fb_reg_accounts"),
                "fb_live": scalar("SELECT COUNT(*) FROM fb_accounts"),
                "nicks": scalar("SELECT COUNT(*) FROM FacebookAccounts")
                         + scalar("SELECT COUNT(*) FROM TikTokAccounts"),
            },
            "recent_errors": [
                {"kind": "Render", "id": r[0], "message": (r[1] or "")[:120], "at": r[2]}
                for r in rows(
                    "SELECT id, error_message, created_at FROM render_tasks WHERE status='ERROR' ORDER BY id DESC LIMIT 5"
                )
            ] + [
                {"kind": "Đăng TikTok", "id": r[0], "message": (r[1] or "")[:120], "at": r[2]}
                for r in rows(
                    "SELECT id, error_message, created_at FROM upload_tasks WHERE status='FAILED' ORDER BY id DESC LIMIT 5"
                )
            ],
        }
    finally:
        conn.close()
    return {"success": True, "data": data}


# =============================================================================
# THỐNG KÊ TÀI KHOẢN TIKTOK
# =============================================================================

def _stats_bucket(rows, label_key="label"):
    """Chuẩn hoá kết quả GROUP BY thành danh sách có nhãn và số lượng."""
    return [{label_key: (r[0] or "(trống)"), "count": r[1]} for r in rows]


@app.get("/api/stats/accounts")
def api_stats_accounts(days: int = 30):
    """Thống kê toàn bộ tài khoản TikTok: cơ cấu, khán giả, tăng trưởng, nội dung.

    Tiền tệ được gom theo từng mã thay vì cộng gộp: bảng `channels` giữ mỗi kênh
    một `currency` riêng (EUR, GBP, KRW…) nên một phép SUM duy nhất sẽ ra con số
    vô nghĩa. Ứng dụng không có nguồn tỷ giá nào, vì vậy không quy đổi và cũng
    không tự gắn ký hiệu "$" cho số tiền của kênh khác vùng.
    """
    days = max(1, min(int(30 if days is None else days), 365))
    since = int(time.time()) - days * 86400
    today_start = int(time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d")))
    conn = connect_db(DB_PATH)

    def rows(sql, params=()):
        try:
            return conn.execute(sql, params).fetchall()
        except Exception:
            return []

    def scalar(sql, params=(), default=0):
        row = rows(sql, params)
        if not row or row[0][0] is None:
            return default
        return row[0][0]

    try:
        totals = {
            "channels": scalar("SELECT COUNT(*) FROM channels"),
            "monetized": scalar("SELECT COUNT(*) FROM channels WHERE status LIKE '%BKT%' AND status NOT LIKE '%CHƯA%'"),
            "dead": scalar("SELECT COUNT(*) FROM channels WHERE status LIKE '%DIE%'"),
            "never_checked": scalar("SELECT COUNT(*) FROM channels WHERE COALESCE(last_checked, 0) = 0"),
            "checked_today": scalar("SELECT COUNT(*) FROM channels WHERE last_checked >= ?", (today_start,)),
            "kyc_done": scalar("SELECT COUNT(*) FROM channels WHERE kyc NOT IN ('No', '', 'no')"),
            "vpn_assigned": scalar("SELECT COUNT(*) FROM channels WHERE COALESCE(vpn_config, '') <> ''"),
            "with_profile": scalar("SELECT COUNT(*) FROM channels WHERE COALESCE(profile_dir, '') <> ''"),
        }

        audience_row = rows(
            """SELECT COALESCE(SUM(follower_count), 0), COALESCE(SUM(like_count), 0),
                      COALESCE(SUM(view_count), 0), COALESCE(SUM(video_count), 0)
               FROM channels"""
        )
        f, l, v, vid = audience_row[0] if audience_row else (0, 0, 0, 0)
        audience = {
            "followers": int(f or 0),
            "likes": int(l or 0),
            "views": int(v or 0),
            "videos": int(vid or 0),
            "avg_followers": round((f or 0) / totals["channels"], 1) if totals["channels"] else 0,
        }

        # Mỗi mã tiền tệ một dòng. "#" là giá trị mặc định khi kênh chưa quét ra tiền tệ.
        money = [
            {
                "currency": r[0] or "#",
                "channels": r[1],
                "earned": round(r[2] or 0, 2),
                "balance": round(r[3] or 0, 2),
                "avg_rpm": round(r[4] or 0, 2),
            }
            for r in rows(
                """SELECT currency, COUNT(*), SUM(earned), SUM(balance), AVG(rpm)
                   FROM channels GROUP BY currency ORDER BY SUM(earned) DESC"""
            )
        ]

        by_status = _stats_bucket(rows(
            "SELECT status, COUNT(*) FROM channels GROUP BY status ORDER BY COUNT(*) DESC"
        ), "status")
        by_country = [
            {
                "country": r[0] or "(trống)",
                "count": r[1],
                "followers": int(r[2] or 0),
                "views": int(r[3] or 0),
                "monetized": r[4],
            }
            for r in rows(
                """SELECT country, COUNT(*), SUM(follower_count), SUM(view_count),
                          SUM(CASE WHEN status LIKE '%BKT%' AND status NOT LIKE '%CHƯA%' THEN 1 ELSE 0 END)
                   FROM channels GROUP BY country ORDER BY COUNT(*) DESC"""
            )
        ]
        by_publisher = _stats_bucket(rows(
            "SELECT COALESCE(NULLIF(publisher, ''), 'Chưa gán'), COUNT(*) FROM channels GROUP BY 1 ORDER BY COUNT(*) DESC"
        ), "publisher")

        # Chuỗi theo ngày: mỗi kênh chỉ lấy mốc cuối cùng trong ngày rồi mới cộng lại,
        # nếu không thì một ngày quét nhiều lần sẽ nhân đôi số follower.
        series = [
            {
                "day": r[0],
                "followers": int(r[1] or 0),
                "views": int(r[2] or 0),
                "likes": int(r[3] or 0),
                "channels": r[4],
            }
            for r in rows(
                """SELECT day, SUM(follower_count), SUM(view_count), SUM(like_count), COUNT(*)
                   FROM (
                       SELECT date(captured_ts, 'unixepoch', 'localtime') AS day,
                              channel_id,
                              MAX(captured_ts) AS ts,
                              follower_count, view_count, like_count
                       FROM channel_metrics_history
                       WHERE captured_ts >= ?
                       GROUP BY day, channel_id
                   )
                   GROUP BY day ORDER BY day ASC""",
                (since,),
            )
        ]
        growth = {}
        if len(series) >= 2:
            first, last = series[0], series[-1]
            growth = {
                "followers": last["followers"] - first["followers"],
                "views": last["views"] - first["views"],
                "likes": last["likes"] - first["likes"],
                "from_day": first["day"],
                "to_day": last["day"],
            }

        top_channels = [
            {
                "id": r[0], "username": r[1] or "", "note": r[2] or "", "status": r[3] or "",
                "country": r[4] or "", "followers": int(r[5] or 0), "views": int(r[6] or 0),
                "videos": int(r[7] or 0),
            }
            for r in rows(
                """SELECT id, username, note, status, country, follower_count, view_count, video_count
                   FROM channels ORDER BY follower_count DESC, view_count DESC LIMIT 10"""
            )
        ]

        videos = {
            "total": scalar("SELECT COUNT(*) FROM channel_videos"),
            "channels_with_videos": scalar("SELECT COUNT(DISTINCT channel_id) FROM channel_videos"),
            "prohibited": scalar("SELECT COUNT(*) FROM channel_videos WHERE is_prohibited=1"),
            "reviewing": scalar("SELECT COUNT(*) FROM channel_videos WHERE is_reviewing=1"),
            "not_original": scalar("SELECT COUNT(*) FROM channel_videos WHERE is_original=0"),
            "by_shadowban": _stats_bucket(rows(
                "SELECT shadowban_status, COUNT(*) FROM channel_videos GROUP BY shadowban_status ORDER BY COUNT(*) DESC"
            ), "shadowban"),
            "top": [
                {
                    "video_id": r[0], "desc": (r[1] or "")[:80], "views": int(r[2] or 0),
                    "likes": int(r[3] or 0), "comments": int(r[4] or 0), "shares": int(r[5] or 0),
                    "channel_id": r[6], "url": r[7] or "",
                }
                for r in rows(
                    """SELECT video_id, desc, view_count, like_count, comment_count, share_count,
                              channel_id, video_url
                       FROM channel_videos ORDER BY view_count DESC LIMIT 10"""
                )
            ],
        }

        # Kênh lâu chưa quét nhất — đây là việc cần làm, không phải số liệu trang trí.
        stale = [
            {
                "id": r[0], "username": r[1] or "", "note": r[2] or "",
                "last_checked": int(r[3] or 0), "status": r[4] or "",
            }
            for r in rows(
                """SELECT id, username, note, last_checked, status FROM channels
                   ORDER BY COALESCE(last_checked, 0) ASC LIMIT 8"""
            )
        ]
    finally:
        conn.close()

    return {
        "success": True,
        "data": {
            "days": days,
            "totals": totals,
            "audience": audience,
            "money": money,
            "by_status": by_status,
            "by_country": by_country,
            "by_publisher": by_publisher,
            "series": series,
            "growth": growth,
            "top_channels": top_channels,
            "videos": videos,
            "stale": stale,
        },
    }


# Tư liệu vatlieuhoathinh (trang static/vatlieuhoathinh_studio.html) nằm ở PROJECT_ROOT/crawled_vatlieuhoathinh.
# StaticFiles không đi theo symlink ra ngoài thư mục static nên mount riêng, và phải đứng trước "/static".
VATLIEU_DIR = PROJECT_ROOT / "crawled_vatlieuhoathinh"
if VATLIEU_DIR.is_dir():
    app.mount("/static/vatlieuhoathinh", StaticFiles(directory=str(VATLIEU_DIR)), name="vatlieuhoathinh")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")


DEFERRED_PROFILE_BUSY = "Profile đang mở — hoãn 5 phút"


def upload_hold_active(now: Optional[float] = None) -> bool:
    """Lệnh giữ đăng của Autopilot (publish_hold_until) cũng dừng các task đã QUEUED.

    Trước 26/09 lệnh hold chỉ chặn xếp lịch mới, còn task đã trong hàng đợi vẫn đăng.
    Nút "Đăng Ngay" (đăng tay) không đi qua đây nên vẫn dùng được khi đang giữ.
    """
    try:
        from bkt_web.autopilot import store as autopilot_store
        return autopilot_store.get_int("publish_hold_until") > (time.time() if now is None else now)
    except Exception:
        return False


def run_upload_scheduler():
    """Durable single-worker scheduler backed by the upload_tasks table."""
    from bkt_web.tiktok_publisher import publish_tiktok_video

    while not SCHEDULER_STOP.wait(3):
        if upload_hold_active():
            continue
        if not UPLOAD_LOCK.acquire(blocking=False):
            continue
        task = None
        try:
            now = int(time.time())
            conn = connect_db(DB_PATH)
            conn.execute("BEGIN IMMEDIATE")
            task = conn.execute(
                """
                SELECT id, channel_id, video_path, caption, hashtags, attempt_count, COALESCE(ai_generated, 1)
                FROM upload_tasks
                WHERE status IN ('QUEUED','PENDING')
                  AND schedule_time <= ?
                  AND (next_retry_at IS NULL OR next_retry_at <= ?)
                  AND attempt_count < 3
                ORDER BY schedule_time, id
                LIMIT 1
                """,
                (now, now),
            ).fetchone()
            if task:
                conn.execute(
                    """
                    UPDATE upload_tasks
                    SET status='UPLOADING', started_at=?, attempt_count=attempt_count+1
                    WHERE id=? AND status IN ('QUEUED','PENDING')
                    """,
                    (now, task[0]),
                )
            conn.commit()
            conn.close()

            if not task:
                continue

            task_id, channel_id, video_path, caption, hashtags, previous_attempts, ai_generated = task
            upload_live_status.update({
                "is_running": True,
                "channel_id": channel_id,
                "task_id": task_id,
                "logs": [{
                    "time": time.strftime("%H:%M:%S"),
                    "msg": f"Scheduler bắt đầu tác vụ #{task_id}",
                    "level": "info",
                }],
            })

            def scheduler_log(message: str, level: str = "info"):
                upload_live_status["logs"].append({
                    "time": time.strftime("%H:%M:%S"),
                    "msg": message,
                    "level": level,
                })

            result = asyncio.run(publish_tiktok_video(
                channel_id=channel_id,
                video_path=video_path,
                caption=caption,
                hashtags=hashtags,
                db_path=str(DB_PATH),
                log_cb=scheduler_log,
                task_id=task_id,
                ai_generated=bool(ai_generated),
            ))
            if result.get("clicked"):
                # Đã bấm Đăng mà không thấy xác nhận: publisher đã chuyển NEEDS_CHECK. Không thử lại.
                scheduler_log("Đã bấm Đăng nhưng chưa xác nhận — chờ người kiểm tra kênh (không tự thử lại)", "warning")
            elif result.get("deferred"):
                conn = connect_db(DB_PATH)
                conn.execute(
                    "UPDATE upload_tasks SET status='QUEUED', attempt_count=?, next_retry_at=?, error_message=? WHERE id=?",
                    (previous_attempts, int(time.time()) + 300, DEFERRED_PROFILE_BUSY, task_id),
                )
                conn.commit(); conn.close()
                scheduler_log("Profile đang bận — hoàn lượt và hoãn 5 phút", "warning")
            elif result.get("no_retry"):
                scheduler_log("Tác vụ không được tự thử lại", "warning")
            elif not result.get("success") and previous_attempts + 1 < 3:
                retry_at = int(time.time()) + 60 * (2 ** previous_attempts)
                conn = connect_db(DB_PATH)
                conn.execute(
                    "UPDATE upload_tasks SET status='QUEUED', next_retry_at=? WHERE id=?",
                    (retry_at, task_id),
                )
                conn.commit()
                conn.close()
                scheduler_log(f"Sẽ thử lại lúc {datetime.datetime.fromtimestamp(retry_at):%H:%M:%S}", "warning")
        except Exception as exc:
            if task:
                previous_attempts = task[5] or 0
                conn = connect_db(DB_PATH)
                clicked = conn.execute("SELECT COALESCE(clicked_post_at,0) FROM upload_tasks WHERE id=?", (task[0],)).fetchone()
                conn.close()
                if clicked and clicked[0]:
                    conn = connect_db(DB_PATH)
                    conn.execute(
                        "UPDATE upload_tasks SET status='NEEDS_CHECK', error_message=? WHERE id=?",
                        (f"Lỗi sau khi đã bấm Đăng: {exc}"[:1000], task[0]),
                    )
                    conn.commit()
                    conn.close()
                    continue
                can_retry = previous_attempts + 1 < 3
                retry_at = int(time.time()) + 60 * (2 ** previous_attempts) if can_retry else 0
                conn = connect_db(DB_PATH)
                conn.execute(
                    """
                    UPDATE upload_tasks
                    SET status=?, error_message=?, next_retry_at=?
                    WHERE id=?
                    """,
                    ("QUEUED" if can_retry else "ERROR", str(exc)[:1000], retry_at, task[0]),
                )
                conn.commit()
                conn.close()
        finally:
            upload_live_status["is_running"] = False
            UPLOAD_LOCK.release()

def app_startup():
    global SCHEDULER_THREAD, VERIFIER_THREAD, PROFILE_MAINT_THREAD
    conn = connect_db(DB_PATH)
    conn.execute(
        "UPDATE render_tasks SET status='ERROR', progress=0, error_message='Render bị gián đoạn do ứng dụng khởi động lại' WHERE status IN ('QUEUED','PROCESSING')"
    )
    conn.execute(
        "UPDATE download_jobs SET status='ERROR', error_message='Tải bị gián đoạn do ứng dụng khởi động lại' WHERE status IN ('QUEUED','PROCESSING')"
    )
    conn.commit()
    conn.close()
    # Task đang đăng dở mà đã bấm "Đăng" → NEEDS_CHECK (không đăng lại); chờ render → ERROR.
    publish_flow.startup_cleanup(DB_PATH)
    try:  # wireproxy mồ côi từ lần chạy trước chiếm kết nối NordVPN và giữ PrivateKey trong /tmp
        from bkt_web import vpn_manager as _vpn
        orphans = _vpn.cleanup_orphan_tunnels()
        if orphans:
            print(f"[VPN] Đã tắt {len(orphans)} tunnel wireproxy mồ côi: {orphans}")
    except Exception as exc:
        print(f"[VPN] Không dọn được tunnel mồ côi: {exc}")
    init_image_tables()
    init_script_tables()
    init_autopilot_db()
    start_image_queue_worker()
    script_bridge_worker.start()
    start_remake_queue_worker()
    SCHEDULER_STOP.clear()
    if not SCHEDULER_THREAD or not SCHEDULER_THREAD.is_alive():
        SCHEDULER_THREAD = threading.Thread(target=run_upload_scheduler, name="upload-scheduler", daemon=True)
        SCHEDULER_THREAD.start()
    if not VERIFIER_THREAD or not VERIFIER_THREAD.is_alive():
        from bkt_web import needs_check_verifier
        VERIFIER_THREAD = threading.Thread(target=needs_check_verifier.run_verifier, args=(SCHEDULER_STOP, DB_PATH), name="needs-check-verifier", daemon=True)
        VERIFIER_THREAD.start()
    if not PROFILE_MAINT_THREAD or not PROFILE_MAINT_THREAD.is_alive():
        from bkt_web import profile_workers
        PROFILE_MAINT_THREAD = threading.Thread(target=profile_workers.run_profile_maintenance, args=(SCHEDULER_STOP, DB_PATH), name="profile-maintenance", daemon=True)
        PROFILE_MAINT_THREAD.start()
    start_autopilot()
    notify.start()
    start_image_autoassign()

def app_shutdown():
    global SCHEDULER_THREAD, VERIFIER_THREAD
    stop_image_queue_worker()
    script_bridge_worker.stop()
    stop_remake_queue_worker()
    stop_autopilot(timeout=15)
    notify.stop()
    stop_image_autoassign()
    SCHEDULER_STOP.set()
    if SCHEDULER_THREAD and SCHEDULER_THREAD.is_alive():
        SCHEDULER_THREAD.join(timeout=5)
    if VERIFIER_THREAD and VERIFIER_THREAD.is_alive():
        VERIFIER_THREAD.join(timeout=2)
    stop_compare_runs()
    vpn_manager.stop_all_wireguard_proxies()
    try:
        nord_api.stop_all_dynamic_nord_tunnels()
    except Exception:
        pass

@app.get("/api/compare-studio/status")
def get_compare_studio_status():
    # Compare Studio chạy native trong chính tiến trình này (bkt_web/compare_native.py).
    return {"running": True, "native": True}

@app.get("/")
def serve_index():
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    fav = STATIC_DIR / "favicon.ico"
    if fav.exists():
        return FileResponse(str(fav), media_type="image/x-icon")
    return Response(status_code=204)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("TOKMATRIX_PORT", "8080")))
