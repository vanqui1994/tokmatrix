"""
Facebook Pro V2 API Router
Cung cấp toàn bộ REST API cho module Facebook Web
"""

import time
import json
import re
import httpx
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Response
from pydantic import BaseModel, Field, ConfigDict

try:
    from bkt_web.db_utils import connect_db
    from bkt_web.facebook_engine import FacebookEngine, REACTION_MAP
    from bkt_web.security import SecretStore
    from bkt_web import key_vault
    from bkt_web import vpn_bridge
    from bkt_web import nuoinick_db as nn_db
    from bkt_web.browser_engine import (
        capture_native_facebook_session,
        is_native_profile_running,
        load_native_profile_cookies,
        persist_native_profile_cookies,
        start_native_profile,
        stop_native_profile,
    )
    from bkt_web.facebook_session import (
        cookie_header_to_playwright,
        cookies_to_header,
        sync_session_cookie,
        validate_session_cookies,
    )
except ImportError:
    from db_utils import connect_db
    from facebook_engine import FacebookEngine, REACTION_MAP
    from security import SecretStore
    import key_vault
    import vpn_bridge
    import nuoinick_db as nn_db
    from browser_engine import (
        capture_native_facebook_session,
        is_native_profile_running,
        load_native_profile_cookies,
        persist_native_profile_cookies,
        start_native_profile,
        stop_native_profile,
    )
    from facebook_session import (
        cookie_header_to_playwright,
        cookies_to_header,
        sync_session_cookie,
        validate_session_cookies,
    )

fb_router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")
FB_SECRET_COLUMNS = ("password", "code2fa", "cookie", "fbdtsg")


def encrypted(value: str | None) -> str:
    return SECRET_STORE.encrypt((value or "").strip())


def decrypted(value: str | None) -> str:
    return SECRET_STORE.decrypt(value or "")


def _facebook_cookie_jar(cookie_header: str) -> List[Dict[str, Any]]:
    return cookie_header_to_playwright(cookie_header)


def init_fb_db(conn):
    """Khởi tạo các bảng SQLite cho module Facebook nếu chưa có"""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE,
            name TEXT DEFAULT '',
            password TEXT DEFAULT '',
            code2fa TEXT DEFAULT '',
            cookie TEXT DEFAULT '',
            fbdtsg TEXT DEFAULT '',
            rev TEXT DEFAULT '',
            proxy TEXT DEFAULT '',
            vpn_config TEXT DEFAULT '',
            vpn_location TEXT DEFAULT '',
            country TEXT DEFAULT 'US',
            category TEXT DEFAULT 'Mặc định',
            status TEXT DEFAULT 'Chưa check',
            type_account TEXT DEFAULT 'User',
            friend_count INTEGER DEFAULT 0,
            group_count INTEGER DEFAULT 0,
            avatar_url TEXT DEFAULT '',
            last_checked INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT DEFAULT '',
            content TEXT NOT NULL,
            media_paths TEXT DEFAULT '',
            category TEXT DEFAULT 'Chung',
            spin_enabled INTEGER DEFAULT 1,
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_scripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            actions_json TEXT NOT NULL,
            delay_from INTEGER DEFAULT 5,
            delay_to INTEGER DEFAULT 15,
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            script_id INTEGER NOT NULL,
            script_name TEXT DEFAULT '',
            account_ids TEXT DEFAULT '',
            schedule_time TEXT DEFAULT '',
            cron_expr TEXT DEFAULT '',
            status TEXT DEFAULT 'Pending',
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_tasks_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_type TEXT NOT NULL,
            account_uid TEXT DEFAULT '',
            account_name TEXT DEFAULT '',
            target_id TEXT DEFAULT '',
            status TEXT DEFAULT 'Success',
            detail TEXT DEFAULT '',
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_file_ids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            total_count INTEGER DEFAULT 0,
            category TEXT DEFAULT 'Chung',
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_black_white_list (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT DEFAULT 'BLACKLIST',
            target_uid TEXT NOT NULL,
            note TEXT DEFAULT '',
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_ai_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            provider TEXT DEFAULT 'gemini',
            api_key TEXT DEFAULT '',
            topic TEXT DEFAULT 'Kinh doanh online, thời trang, chia sẻ cuộc sống tích cực',
            updated_at INTEGER DEFAULT 0
        )
    """)

    # Toàn bộ module đã chuyển sang VPN; cột proxy cũ được giữ lại để không mất
    # dữ liệu nhưng không còn được đọc hay ghi ở bất kỳ đâu.
    cursor.execute("PRAGMA table_info(fb_accounts)")
    account_cols = {row[1] for row in cursor.fetchall()}
    for column, ddl in (
        ("vpn_config", "TEXT DEFAULT ''"),
        ("vpn_location", "TEXT DEFAULT ''"),
        ("country", "TEXT DEFAULT 'US'"),
    ):
        if column not in account_cols:
            cursor.execute(f"ALTER TABLE fb_accounts ADD COLUMN {column} {ddl}")

    # Các tài khoản đồng bộ từ bản Reg cũ chỉ có nhãn vị trí VPN nhưng không
    # lưu file WireGuard. Khôi phục một config đúng quốc gia để nhãn hiển thị
    # và trạng thái thực thi không còn lệch nhau.
    cursor.execute("""
        SELECT id, country FROM fb_accounts
        WHERE TRIM(COALESCE(vpn_config, '')) = ''
          AND TRIM(COALESCE(vpn_location, '')) != ''
    """)
    for account_id, country in cursor.fetchall():
        country_code = (country or "US").strip().upper()
        if country_code not in {"US", "GB", "DE", "JP", "KR"}:
            country_code = "US"
        try:
            vpn_config, vpn_location = vpn_bridge.pick_config(country_code)
            cursor.execute(
                "UPDATE fb_accounts SET vpn_config=?, vpn_location=?, country=? WHERE id=?",
                (vpn_config, vpn_location, country_code, account_id),
            )
        except vpn_bridge.VpnError:
            # Danh mục VPN có thể chưa được cài ở lần khởi động đầu tiên. Khi
            # catalog sẵn sàng, lần init tiếp theo sẽ tự thử lại.
            pass

    # Migrate any legacy Facebook credentials to the same Fernet store used by
    # TikTok accounts. No secret is returned by a list endpoint afterwards.
    cursor.execute("SELECT id, password, code2fa, cookie, fbdtsg FROM fb_accounts")
    for row in cursor.fetchall():
        values = [encrypted(decrypted(value)) for value in row[1:]]
        cursor.execute(
            """
            UPDATE fb_accounts
            SET password=?, code2fa=?, cookie=?, fbdtsg=? WHERE id=?
            """,
            (*values, row[0]),
        )
    conn.commit()


# Pydantic Schemas
class AccountImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    raw_data: str = Field(max_length=2_000_000) # UID|Pass|2FA|Cookie|MãQuốcGia mỗi dòng
    category: str = Field(default="Mặc định", max_length=100)
    type_account: str = Field(default="User", max_length=30)
    # Dùng khi dòng nhập không ghi rõ mã quốc gia
    country: str = Field(default="US", pattern=r"^(US|GB|DE|JP|KR)$")

class SingleAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uid: str = Field(pattern=r"^[0-9]{1,32}$")
    name: str = Field(default="", max_length=200)
    password: str = Field(default="", max_length=500)
    code2fa: str = Field(default="", max_length=500)
    cookie: str = Field(default="", max_length=200_000)
    country: str = Field(default="US", pattern=r"^(US|GB|DE|JP|KR)$")
    category: str = Field(default="Mặc định", max_length=100)
    type_account: str = Field(default="User", max_length=30)

class PostCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="", max_length=300)
    content: str = Field(min_length=1, max_length=50_000)
    category: str = Field(default="Chung", max_length=100)
    media_paths: str = Field(default="", max_length=20_000)
    spin_enabled: bool = True

class ScriptCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    actions: List[Dict[str, Any]] = Field(max_length=100)
    delay_from: int = Field(default=5, ge=1, le=86400)
    delay_to: int = Field(default=15, ge=1, le=86400)

class ScheduleCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    script_id: int
    account_ids: List[int] = Field(min_length=1, max_length=500)
    schedule_time: str = Field(default="", max_length=100)
    cron_expr: str = Field(default="", max_length=100)

class ActionRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action_type: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,80}$")
    account_ids: List[int] = Field(min_length=1, max_length=200)
    target_ids: List[str] = Field(default_factory=list, max_length=1000)
    payload: Dict[str, Any] = Field(default_factory=dict)

class FileIdCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=2_000_000)
    category: str = Field(default="Chung", max_length=100)

class BlacklistCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_uid: str = Field(min_length=1, max_length=100)
    type: str = Field(default="BLACKLIST", pattern=r"^(BLACKLIST|WHITELIST)$")
    note: str = Field(default="", max_length=500)

class VpnAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_ids: List[int] = Field(default_factory=list, max_length=500)
    country: str = Field(default="US", pattern=r"^(US|GB|DE|JP|KR)$")
    # Bỏ trống thì mỗi tài khoản được bốc ngẫu nhiên một server trong quốc gia đó
    vpn_config: str = Field(default="", max_length=500)

class AIGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1, max_length=5000)
    # Bỏ trống để dùng chủ đề đã lưu trong phần Cấu hình AI.
    topic: str = Field(default="", max_length=500)


class AISettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = Field(default="gemini", pattern=r"^(gemini|openai)$")
    api_key: str = Field(default="", max_length=1000)
    topic: str = Field(
        default="Kinh doanh online, thời trang, chia sẻ cuộc sống tích cực",
        min_length=1,
        max_length=500,
    )


class AccountIdsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_ids: List[int] = Field(default_factory=list, max_length=500)


# ---------------------------------------------------------------------------
# API STATS & TỔNG QUAN
# ---------------------------------------------------------------------------
@fb_router.get("/stats")
def get_fb_stats():
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM fb_accounts")
    total_acc = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM fb_accounts WHERE status = 'Live'")
    live_acc = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM fb_accounts WHERE status = 'Die'")
    die_acc = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM fb_accounts WHERE status = 'Checkpoint'")
    cp_acc = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM fb_accounts WHERE vpn_config != ''")
    accounts_with_vpn = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM fb_schedules WHERE status = 'Pending' OR status = 'Running'")
    active_schedules = cursor.fetchone()[0]

    start_today = int(time.time()) - 86400
    cursor.execute("SELECT COUNT(*) FROM fb_tasks_history WHERE created_at >= ?", (start_today,))
    tasks_today = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM fb_posts")
    total_posts = cursor.fetchone()[0]

    conn.close()
    return {
        "total_accounts": total_acc,
        "live_accounts": live_acc,
        "die_accounts": die_acc,
        "checkpoint_accounts": cp_acc,
        "accounts_with_vpn": accounts_with_vpn,
        "active_schedules": active_schedules,
        "tasks_today": tasks_today,
        "total_posts": total_posts
    }


# ---------------------------------------------------------------------------
# QUẢN LÝ TÀI KHOẢN (ACCOUNTS)
# ---------------------------------------------------------------------------
@fb_router.get("/accounts")
def list_fb_accounts(category: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None):
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()

    query = """
        SELECT id, uid, name,
               password != '', code2fa != '', cookie != '', vpn_location,
               category, status, type_account, friend_count, group_count,
               avatar_url, last_checked, created_at, vpn_config, country
        FROM fb_accounts WHERE 1=1
    """
    params = []

    if category and category != "Tất cả":
        query += " AND category = ?"
        params.append(category)
    if status and status != "Tất cả":
        query += " AND status = ?"
        params.append(status)
    if search:
        query += " AND (uid LIKE ? OR name LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()

    accounts = []
    for r in rows:
        accounts.append({
            "id": r[0],
            "uid": r[1],
            "name": r[2] or f"FB-{r[1]}",
            "has_password": bool(r[3]),
            "has_2fa": bool(r[4]),
            "has_cookie": bool(r[5]),
            "vpn_location": r[6] or "",
            "vpn_config": r[15] or "",
            "country": r[16] or "US",
            "has_vpn": bool(r[15]),
            "category": r[7],
            "status": r[8],
            "type_account": r[9],
            "friend_count": r[10],
            "group_count": r[11],
            "avatar_url": r[12] or f"https://graph.facebook.com/{r[1]}/picture?type=square",
            "last_checked": r[13],
            "created_at": r[14]
        })
    conn.close()
    return {"accounts": accounts, "total": len(accounts)}


@fb_router.post("/accounts/import")
def bulk_import_fb_accounts(req: AccountImportRequest):
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()

    lines = [line.strip() for line in req.raw_data.strip().splitlines() if line.strip()]
    if len(lines) > 1000:
        conn.close()
        raise HTTPException(status_code=400, detail="Mỗi lần chỉ được nhập tối đa 1000 tài khoản")
    now = int(time.time())
    imported = 0
    skipped = 0

    for line in lines:
        parts = [p.strip() for p in line.split("|")]
        uid = ""
        password = ""
        code2fa = ""
        cookie = ""
        country = ""

        if len(parts) == 1:
            # Chỉ có UID hoặc Cookie
            if "c_user=" in parts[0]:
                cookie = parts[0]
                cookies = FacebookEngine.parse_cookie_string(cookie)
                uid = cookies.get("c_user", "")
            else:
                uid = parts[0]
        elif len(parts) >= 2:
            uid = parts[0]
            password = parts[1]
            if len(parts) >= 3:
                code2fa = parts[2]
            if len(parts) >= 4:
                cookie = parts[3]
            if len(parts) >= 5:
                country = parts[4].strip().upper()

        if not uid and cookie:
            cookies = FacebookEngine.parse_cookie_string(cookie)
            uid = cookies.get("c_user", "")

        if not uid:
            skipped += 1
            continue
        if not re.fullmatch(r"[0-9]{1,32}", uid):
            skipped += 1
            continue

        name = f"User {uid}"
        avatar_url = f"https://graph.facebook.com/{uid}/picture?type=square"

        # Mỗi tài khoản được bốc ngay một server VPN riêng; không có config thì
        # vẫn nhập được, người dùng gán VPN sau bằng nút "Gán VPN".
        if country not in ("US", "GB", "DE", "JP", "KR"):
            country = (req.country or "US").upper()
        try:
            vpn_conf, vpn_loc = vpn_bridge.pick_config(country)
        except vpn_bridge.VpnError:
            vpn_conf, vpn_loc = "", ""

        try:
            cursor.execute("""
                INSERT INTO fb_accounts (uid, name, password, code2fa, cookie, vpn_config, vpn_location, country, category, status, type_account, avatar_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Chưa check', ?, ?, ?)
                ON CONFLICT(uid) DO UPDATE SET
                    password = excluded.password,
                    code2fa = excluded.code2fa,
                    cookie = CASE WHEN excluded.cookie != '' THEN excluded.cookie ELSE fb_accounts.cookie END,
                    vpn_config = CASE WHEN fb_accounts.vpn_config = '' THEN excluded.vpn_config ELSE fb_accounts.vpn_config END,
                    vpn_location = CASE WHEN fb_accounts.vpn_location = '' THEN excluded.vpn_location ELSE fb_accounts.vpn_location END,
                    country = excluded.country
            """, (
                uid, name, encrypted(password), encrypted(code2fa), encrypted(cookie),
                vpn_conf, vpn_loc, country,
                req.category, req.type_account, avatar_url, now,
            ))
            imported += 1
        except Exception:
            skipped += 1

    conn.commit()
    conn.close()
    return {"success": True, "imported": imported, "skipped": skipped, "total_lines": len(lines)}


@fb_router.post("/accounts/check-live")
def check_live_fb_accounts(payload: AccountIdsRequest):
    account_ids = list(dict.fromkeys(payload.account_ids))
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()

    if account_ids:
        placeholders = ",".join("?" * len(account_ids))
        cursor.execute(
            f"SELECT id, uid, cookie, vpn_config FROM fb_accounts WHERE id IN ({placeholders})",
            account_ids,
        )
    else:
        cursor.execute("SELECT id, uid, cookie, vpn_config FROM fb_accounts LIMIT 50")

    accounts = cursor.fetchall()
    results = []
    now = int(time.time())

    for acc_id, uid, cookie, vpn_config in accounts:
        if not vpn_config:
            results.append({
                "id": acc_id,
                "uid": uid,
                "status": "Chưa check",
                "message": "Tài khoản chưa được gán VPN",
            })
            continue

        socks_url = None
        try:
            # Kiểm tra cả UID còn tồn tại và Cookie còn phiên đăng nhập; mọi
            # request đều đi qua đúng tunnel WireGuard của tài khoản.
            socks_url = vpn_bridge.open_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id, vpn_config)
        except vpn_bridge.VpnError as exc:
            results.append({"id": acc_id, "uid": uid, "status": "Chưa check", "message": str(exc)})
            continue

        try:
            check_res = FacebookEngine.check_live_status(uid, proxy=socks_url)
            status = check_res.get("status", "Chưa check")
            message = check_res.get("message") or ""

            if status == "Live":
                plain_cookie = decrypted(cookie)
                if not plain_cookie:
                    status = "Thiếu Cookie"
                    message = "UID còn Live nhưng tài khoản chưa có Cookie đăng nhập"
                else:
                    try:
                        init_data = FacebookEngine.fetch_init_data(
                            {"uid": uid, "cookie": plain_cookie},
                            proxy=socks_url,
                        )
                        cursor.execute(
                            "UPDATE fb_accounts SET fbdtsg=?, rev=? WHERE id=?",
                            (encrypted(init_data.get("fbdtsg", "")), init_data.get("rev", ""), acc_id),
                        )
                        message = "UID Live và Cookie đăng nhập còn hiệu lực"
                    except Exception as exc:
                        status = "Cookie hết hạn"
                        message = str(exc)
        except Exception as exc:
            status = "Chưa check"
            message = f"Lỗi kiểm tra tài khoản: {exc}"
        finally:
            try:
                vpn_bridge.close_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id)
            except Exception:
                pass

        cursor.execute("UPDATE fb_accounts SET status = ?, last_checked = ? WHERE id = ?", (status, now, acc_id))
        results.append({"id": acc_id, "uid": uid, "status": status, "message": message})

    conn.commit()
    conn.close()
    return {
        "results": results,
        "checked_count": len(results),
        "live_count": sum(item["status"] == "Live" for item in results),
        "die_count": sum(item["status"] == "Die" for item in results),
        "issue_count": sum(item["status"] not in {"Live", "Die"} for item in results),
    }


@fb_router.post("/accounts/{acc_id}/open")
async def open_fb_account(acc_id: int):
    """Mở tài khoản bằng native profile, cookie và VPN riêng của chính nick."""
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    nn_db.ensure_created(conn)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT uid, name, cookie, vpn_config, vpn_location FROM fb_accounts WHERE id = ?",
        (acc_id,),
    )
    row = cursor.fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")

    uid, name, cookie_value, vpn_config, vpn_location = row
    if not vpn_config:
        conn.close()
        raise HTTPException(status_code=409, detail="Tài khoản chưa được gán VPN")

    try:
        socks_url = vpn_bridge.open_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id, vpn_config)
    except vpn_bridge.VpnError as exc:
        conn.close()
        raise HTTPException(status_code=502, detail=str(exc))

    profile_id = f"fb-{uid or acc_id}"
    database_cookies = _facebook_cookie_jar(decrypted(cookie_value))
    stored_cookies = load_native_profile_cookies(profile_id)
    stored_valid, _, _ = validate_session_cookies(stored_cookies, uid)
    database_valid, _, _ = validate_session_cookies(database_cookies, uid)
    cookie_jar = stored_cookies if stored_valid else database_cookies
    has_session = stored_valid or database_valid
    session_source = "profile" if stored_valid else ("database" if database_valid else "none")
    if stored_valid and not database_valid:
        sync_session_cookie(conn, uid, cookies_to_header(stored_cookies), encrypted)
    profile = nn_db.get_browser_profile(conn, profile_id) or {
        "Id": profile_id,
        "Name": name or uid or f"Facebook {acc_id}",
        "GroupId": "Facebook",
        "BrowserName": "Chrome",
        "BrowserVersion": "128",
        "OsType": 1,
    }
    profile.update({
        "RawProxy": socks_url,
        "StartupUrls": (
            "https://www.facebook.com/me"
            if has_session else "https://www.facebook.com/login"
        ),
        "Note": f"Facebook UID {uid or ''} · VPN {vpn_location or vpn_config}",
        "Status": "idle",
    })
    nn_db.save_browser_profile(conn, profile)
    if not has_session:
        cursor.execute(
            "UPDATE fb_accounts SET status = 'Cookie hết hạn' WHERE id = ?",
            (acc_id,),
        )
        conn.commit()
    conn.close()

    if has_session:
        persist_native_profile_cookies(profile_id, cookie_jar)
    if is_native_profile_running(profile_id):
        await stop_native_profile(profile_id)
    try:
        result = await start_native_profile(profile, headless=False)
    except Exception as exc:
        # Tunnel chỉ nên được giữ khi profile đã mở thành công. Nếu Chrome
        # không khởi động được, giải phóng ngay cổng SOCKS/WireGuard để lần
        # mở sau không va vào tunnel mồ côi.
        try:
            vpn_bridge.close_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Không mở được profile Facebook: {exc}")

    session_detail = ""
    if has_session:
        verified = await capture_native_facebook_session(profile_id, str(uid or ""), verify_page=True)
        session_detail = verified.get("message", "")
        has_session = bool(verified.get("valid"))
        conn = connect_db(DB_PATH)
        try:
            if has_session:
                sync_session_cookie(conn, str(uid), verified["cookie_header"], encrypted)
            else:
                conn.execute("UPDATE fb_accounts SET status='Cookie hết hạn' WHERE id=?", (acc_id,))
                conn.commit()
        finally:
            conn.close()

    return {
        "success": True,
        "profile_id": profile_id,
        "session_restored": has_session,
        "session_verified": has_session,
        "session_source": session_source,
        "vpn_location": vpn_location or "",
        "message": (
            "Đã mở và xác minh đúng phiên Facebook bằng profile và VPN của nick."
            if has_session
            else "Đã mở trang đăng nhập bằng đúng profile và VPN. Phiên hiện chưa hợp lệ; hãy đăng nhập rồi bấm Lưu Phiên."
        ),
        "session_detail": session_detail,
        **result,
    }


@fb_router.post("/accounts/{acc_id}/session/capture")
async def capture_fb_account_session(acc_id: int):
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    row = conn.execute("SELECT uid FROM fb_accounts WHERE id=?", (acc_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    uid = str(row[0] or "").strip()
    profile_id = f"fb-{uid or acc_id}"
    captured = await capture_native_facebook_session(profile_id, uid, verify_page=True)
    if not captured.get("valid"):
        raise HTTPException(status_code=409, detail=captured.get("message") or "Phiên chưa hợp lệ")
    conn = connect_db(DB_PATH)
    try:
        updated = sync_session_cookie(conn, uid, captured["cookie_header"], encrypted)
    finally:
        conn.close()
    return {
        "success": True,
        "profile_id": profile_id,
        "updated": updated,
        "message": "Đã xác minh /me và đồng bộ phiên mới sang toàn bộ module Facebook.",
    }


@fb_router.post("/accounts/{acc_id}/close")
async def close_fb_account(acc_id: int):
    conn = connect_db(DB_PATH)
    row = conn.execute("SELECT uid FROM fb_accounts WHERE id=?", (acc_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    uid = str(row[0] or "").strip()
    profile_id = f"fb-{uid or acc_id}"
    saved = False
    detail = ""
    try:
        result = await capture_fb_account_session(acc_id)
        saved = True
        detail = result["message"]
    except HTTPException as exc:
        detail = str(exc.detail)
    stopped = await stop_native_profile(profile_id)
    vpn_bridge.close_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id)
    return {
        "success": True,
        "session_saved": saved,
        "profile_stopped": stopped,
        "message": "Đã lưu phiên, đóng profile và ngắt VPN." if saved else f"Đã đóng profile và ngắt VPN. Chưa lưu được phiên: {detail}",
    }


@fb_router.delete("/accounts/{acc_id}")
def delete_fb_account(acc_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fb_accounts WHERE id = ?", (acc_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@fb_router.delete("/accounts")
def delete_bulk_fb_accounts(payload: AccountIdsRequest):
    account_ids = list(dict.fromkeys(payload.account_ids))
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    if account_ids:
        placeholders = ",".join("?" * len(account_ids))
        cursor.execute(f"DELETE FROM fb_accounts WHERE id IN ({placeholders})", account_ids)
    conn.commit()
    conn.close()
    return {"success": True}


# ---------------------------------------------------------------------------
# BÀI ĐĂNG (POSTS) & SPIN TEXT & AI
# ---------------------------------------------------------------------------
@fb_router.get("/posts")
def list_fb_posts():
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, content, media_paths, category, spin_enabled, created_at FROM fb_posts ORDER BY id DESC")
    posts = []
    for r in cursor.fetchall():
        posts.append({
            "id": r[0],
            "title": r[1],
            "content": r[2],
            "media_paths": r[3],
            "category": r[4],
            "spin_enabled": bool(r[5]),
            "created_at": r[6]
        })
    conn.close()
    return {"posts": posts}


@fb_router.post("/posts")
def create_fb_post(req: PostCreateRequest):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    now = int(time.time())
    cursor.execute("""
        INSERT INTO fb_posts (title, content, media_paths, category, spin_enabled, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (req.title, req.content, req.media_paths, req.category, 1 if req.spin_enabled else 0, now))
    post_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"success": True, "id": post_id}


@fb_router.delete("/posts/{post_id}")
def delete_fb_post(post_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fb_posts WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@fb_router.post("/posts/spin-preview")
def preview_spin_text(payload: Dict[str, str]):
    raw = payload.get("text", "")
    samples = [FacebookEngine.spin_text(raw) for _ in range(3)]
    return {"original": raw, "samples": samples}


# Cổng AI của module này <-> tên khoá trong kho chung
FB_AI_KEY_NAMES = {"gemini": "ai.gemini", "openai": "ai.openai"}
DEFAULT_FB_AI_TOPIC = "Kinh doanh online, thời trang, chia sẻ cuộc sống tích cực"


@fb_router.get("/ai/settings")
def get_fb_ai_settings():
    """
    Cấu hình AI của module Facebook. API key không còn nằm ở đây — nó thuộc kho
    khoá chung (Cài Đặt Hệ Thống → Kho Khoá API) để cả ứng dụng chỉ nhập một lần.
    """
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    row = conn.execute(
        "SELECT provider, topic, updated_at FROM fb_ai_settings WHERE id=1"
    ).fetchone()
    conn.close()
    provider = (row[0] if row else "") or "gemini"
    key_name = FB_AI_KEY_NAMES.get(provider, "ai.gemini")
    return {
        "provider": provider,
        "topic": (row[1] if row else "") or DEFAULT_FB_AI_TOPIC,
        "api_key_configured": bool(key_vault.get_key(key_name)),
        "api_key_name": key_name,
        "updated_at": (row[2] if row else 0) or 0,
    }


@fb_router.post("/ai/settings")
def save_fb_ai_settings(req: AISettingsRequest):
    """
    Lưu cổng AI và chủ đề. API key gửi kèm (nếu có) được chuyển thẳng vào kho
    khoá chung thay vì lưu riêng ở bảng này.
    """
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    key_name = FB_AI_KEY_NAMES.get(req.provider, "ai.gemini")
    if req.api_key.strip():
        key_vault.set_key(key_name, req.api_key)
    if not key_vault.get_key(key_name):
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="Chưa có API Key cho cổng này. Thêm ở Cài Đặt Hệ Thống → Kho Khoá API.",
        )

    stored_key = ""
    now = int(time.time())
    conn.execute(
        """
        INSERT INTO fb_ai_settings (id, provider, api_key, topic, updated_at)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            provider=excluded.provider,
            api_key=excluded.api_key,
            topic=excluded.topic,
            updated_at=excluded.updated_at
        """,
        (req.provider, stored_key, req.topic.strip(), now),
    )
    conn.commit()
    conn.close()
    return {
        "success": True,
        "provider": req.provider,
        "topic": req.topic.strip(),
        "api_key_configured": True,
        "api_key_name": key_name,
        "updated_at": now,
    }


@fb_router.post("/ai/generate-content")
def generate_ai_content(req: AIGenerateRequest):
    """Sinh nội dung thật bằng provider đang cấu hình trong Kho Khoá API."""
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    row = conn.execute(
        "SELECT provider, topic FROM fb_ai_settings WHERE id=1"
    ).fetchone()
    conn.close()
    provider = ((row[0] if row else "") or "gemini").strip().lower()
    configured_topic = ((row[1] if row else "") or DEFAULT_FB_AI_TOPIC).strip()
    topic = req.topic.strip() or configured_topic
    key_name = FB_AI_KEY_NAMES.get(provider)
    api_key = key_vault.get_key(key_name) if key_name else ""
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Chưa có API Key cho cổng AI đã chọn. Thêm ở Cài Đặt Hệ Thống → Kho Khoá API.",
        )

    instruction = (
        f"{req.prompt.strip()}\n"
        f"Chủ đề: {topic}. Viết bằng tiếng Việt tự nhiên, phù hợp Facebook, "
        "chỉ trả về nội dung bài đăng. Chèn 2-4 nhóm spin theo đúng cú pháp "
        "{phương án 1|phương án 2|phương án 3}; không dùng markdown code fence."
    )
    try:
        with httpx.Client(timeout=45.0) as client:
            if provider == "gemini":
                response = client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
                    params={"key": api_key},
                    json={"contents": [{"parts": [{"text": instruction}]}]},
                )
                response.raise_for_status()
                data = response.json()
                generated = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            elif provider == "openai":
                response = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": instruction}],
                        "temperature": 0.8,
                    },
                )
                response.raise_for_status()
                data = response.json()
                generated = data["choices"][0]["message"]["content"].strip()
            else:
                raise HTTPException(status_code=400, detail="Cổng AI không được hỗ trợ")
    except HTTPException:
        raise
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Cổng AI {provider} không tạo được nội dung: {exc}",
        ) from exc

    if not generated:
        raise HTTPException(status_code=502, detail="Cổng AI trả về nội dung rỗng")
    return {
        "success": True,
        "content": generated,
        "spin_preview": FacebookEngine.spin_text(generated),
        "provider": provider,
    }


# ---------------------------------------------------------------------------
# QUẢN LÝ VPN (thay cho proxy ngoài)
# ---------------------------------------------------------------------------
@fb_router.get("/vpn/stats")
def fb_vpn_stats():
    """Số lượng config WireGuard sẵn có theo từng quốc gia."""
    return vpn_bridge.stats()


@fb_router.get("/vpn/catalog/{country}")
def fb_vpn_catalog(country: str):
    catalog = vpn_bridge.catalog()
    code = country.strip().upper()
    if code not in catalog:
        raise HTTPException(status_code=404, detail=f"Không có config cho quốc gia {code}")
    return {"country": code, "configs": catalog[code]}


@fb_router.post("/vpn/assign")
def fb_vpn_assign(req: VpnAssignRequest):
    """
    Gán VPN cho các tài khoản đã chọn. Không truyền vpn_config thì mỗi tài khoản
    được bốc ngẫu nhiên một server khác nhau trong quốc gia đã chọn.
    """
    if not req.account_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn tài khoản nào")
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    assigned = 0
    try:
        for acc_id in req.account_ids:
            if req.vpn_config:
                conf, label = req.vpn_config, vpn_bridge.location_label(req.vpn_config)
            else:
                conf, label = vpn_bridge.pick_config(req.country)
            cursor.execute(
                "UPDATE fb_accounts SET vpn_config=?, vpn_location=?, country=? WHERE id=?",
                (conf, label, (req.country or vpn_bridge.DEFAULT_COUNTRY).upper(), acc_id),
            )
            assigned += cursor.rowcount
        conn.commit()
    except vpn_bridge.VpnError as exc:
        conn.close()
        raise HTTPException(status_code=400, detail=str(exc))
    conn.close()
    return {"success": True, "assigned": assigned}


@fb_router.post("/vpn/test/{acc_id}")
def fb_vpn_test(acc_id: int):
    """Bật tunnel của tài khoản rồi kiểm tra IP thực sự đi ra."""
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT vpn_config, vpn_location FROM fb_accounts WHERE id = ?", (acc_id,))
    row = cursor.fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    if not row[0]:
        raise HTTPException(status_code=400, detail="Tài khoản chưa được gán VPN")
    try:
        result = vpn_bridge.test_exit_ip(row[0])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không kiểm tra được VPN: {exc}")
    return {"success": True, "location": row[1], **result}


@fb_router.post("/vpn/disconnect/{acc_id}")
def fb_vpn_disconnect(acc_id: int):
    """Tắt tunnel đang chạy của một tài khoản để giải phóng cổng."""
    vpn_bridge.close_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id)
    return {"success": True}


# ---------------------------------------------------------------------------
# KỊCH BẢN & LẬP LỊCH TỰ ĐỘNG
# ---------------------------------------------------------------------------
@fb_router.get("/scripts")
def list_fb_scripts():
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, actions_json, delay_from, delay_to, created_at FROM fb_scripts ORDER BY id DESC")
    scripts = []
    for r in cursor.fetchall():
        scripts.append({
            "id": r[0],
            "name": r[1],
            "actions": json.loads(r[2]) if r[2] else [],
            "delay_from": r[3],
            "delay_to": r[4],
            "created_at": r[5]
        })
    conn.close()
    return {"scripts": scripts}


@fb_router.post("/scripts")
def create_fb_script(req: ScriptCreateRequest):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    now = int(time.time())
    cursor.execute("""
        INSERT INTO fb_scripts (name, actions_json, delay_from, delay_to, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (req.name, json.dumps(req.actions, ensure_ascii=False), req.delay_from, req.delay_to, now))
    script_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"success": True, "id": script_id}


@fb_router.delete("/scripts/{script_id}")
def delete_fb_script(script_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fb_scripts WHERE id = ?", (script_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@fb_router.get("/schedules")
def list_fb_schedules():
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT id, script_id, script_name, account_ids, schedule_time, cron_expr, status, created_at FROM fb_schedules ORDER BY id DESC")
    schedules = []
    for r in cursor.fetchall():
        schedules.append({
            "id": r[0],
            "script_id": r[1],
            "script_name": r[2],
            "account_ids": json.loads(r[3]) if r[3] else [],
            "schedule_time": r[4],
            "cron_expr": r[5],
            "status": r[6],
            "created_at": r[7]
        })
    conn.close()
    return {"schedules": schedules}


@fb_router.post("/schedules")
def create_fb_schedule(req: ScheduleCreateRequest):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM fb_scripts WHERE id = ?", (req.script_id,))
    row = cursor.fetchone()
    script_name = row[0] if row else f"Kịch bản #{req.script_id}"

    now = int(time.time())
    cursor.execute("""
        INSERT INTO fb_schedules (script_id, script_name, account_ids, schedule_time, cron_expr, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'Pending', ?)
    """, (req.script_id, script_name, json.dumps(req.account_ids), req.schedule_time, req.cron_expr, now))
    sched_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"success": True, "id": sched_id}


@fb_router.delete("/schedules/{sched_id}")
def delete_fb_schedule(sched_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fb_schedules WHERE id = ?", (sched_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ---------------------------------------------------------------------------
# THỰC THI TÁC VỤ (TASK RUNNER & LOGS)
# ---------------------------------------------------------------------------
NO_TARGET_ACTIONS = {
    "scan_groups", "groups_joined", "scan_group_by_keyword",
    "upload_post", "auto_post", "post",
    "view_news_feed", "auto_view_news_feed", "newfeed",
    "view_notification", "auto_view_notification",
    "view_stories_friends", "auto_view_stories_friends", "story",
    "view_videos", "auto_view_videos",
    "my_fanpage", "scan_fanpage_of_account",
    "scan_groups_fanpage",
    "friend_list", "scan_friend_list",
    "suggest_friend_list", "scan_suggest_friend_list",
    "recently_added_friends", "followers_list", "following_list",
    "friend_request_list", "sent_friend_requests",
    "scan_user_inbox", "scan_user_inbox_fanpage",
    "scan_friend_interaction", "scan_post",
    "scan_pending_groups", "groups_pending",
    "scan_friends", "my_friends",
    "scan_suggested_friends", "suggested_friends",
    "scan_friend_requests", "friend_requests",
    "scan_outgoing_requests", "invited_friends",
    "scan_messenger", "scan_inbox"
}

@fb_router.post("/tasks/run-action")
def run_fb_action(req: ActionRunRequest):
    """Run all 50 Facebook automation actions backed by FacebookEngine."""
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()

    normalized_act = req.action_type.lower().replace("-", "_")
    target_list = [t.strip() for t in req.target_ids if str(t).strip()]
    if not target_list:
        if normalized_act in NO_TARGET_ACTIONS:
            target_list = [""]
        else:
            conn.close()
            raise HTTPException(status_code=400, detail="Tác vụ này yêu cầu ít nhất một ID hoặc Link mục tiêu")

    if len(req.account_ids) * len(target_list) > 300:
        conn.close()
        raise HTTPException(status_code=400, detail="Mỗi lần chạy tối đa 300 lượt tác vụ")

    placeholders = ",".join("?" * len(req.account_ids))
    cursor.execute(f"SELECT id, uid, name, cookie, fbdtsg, rev, vpn_config FROM fb_accounts WHERE id IN ({placeholders})", req.account_ids)
    accounts = cursor.fetchall()
    now = int(time.time())

    results = []
    success_count = 0
    for acc in accounts:
        acc_id, uid, name, cookie, fbdtsg, rev, vpn_config = acc
        account = {
            "uid": uid,
            "cookie": decrypted(cookie),
            "fbdtsg": decrypted(fbdtsg),
            "rev": rev,
        }
        # Mọi request Facebook của tài khoản này đi qua tunnel WireGuard riêng
        vpn_error = None
        account_proxy = None
        if vpn_config:
            try:
                account_proxy = vpn_bridge.open_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id, vpn_config)
            except vpn_bridge.VpnError as exc:
                vpn_error = str(exc)
        try:
            for target in target_list:
                if vpn_error:
                    result = {"success": False, "error": vpn_error}
                elif not vpn_config:
                    result = {"success": False, "error": "Tài khoản chưa được gán VPN"}
                elif not account["cookie"]:
                    result = {"success": False, "error": "Tài khoản chưa có Cookie"}
                else:
                    result = FacebookEngine.execute_action(
                        account=account,
                        action_type=req.action_type,
                        target=target or None,
                        payload=req.payload,
                        proxy=account_proxy
                    )

                status = "Success" if result.get("success") else "Error"
                detail = result.get("message") or ("Thao tác Facebook xác nhận thành công" if result.get("success") else str(result.get("error", "Lỗi gửi request"))[:500])
                success_count += int(result.get("success", False))

                if not result.get("success") and "cookie" in detail.lower() and any(
                    marker in detail.lower() for marker in ("hết hạn", "hỏng", "đăng nhập", "checkpoint")
                ):
                    cursor.execute(
                        "UPDATE fb_accounts SET status='Cookie hết hạn', last_checked=? WHERE id=?",
                        (now, acc_id),
                    )

                cursor.execute("""
                    INSERT INTO fb_tasks_history (task_type, account_uid, account_name, target_id, status, detail, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (req.action_type, uid, name, target or "Account Task", status, detail, now))
                results.append({"account_id": acc_id, "uid": uid, "target_id": target, "status": status, "detail": detail})

            # Engine tự lấy fb_dtsg/client_revision khi tài khoản chưa có; lưu lại để lần sau khỏi tải lại
            if account.pop("_init_data_refreshed", False):
                cursor.execute(
                    "UPDATE fb_accounts SET fbdtsg=?, rev=? WHERE id=?",
                    (encrypted(account.get("fbdtsg", "")), account.get("rev", ""), acc_id),
                )
        finally:
            # Direct GraphQL chỉ cần VPN trong thời gian request. Giữ tunnel
            # sau mỗi nick làm rò process/cổng và khiến batch kế tiếp chập chờn.
            if account_proxy is not None:
                try:
                    vpn_bridge.close_tunnel(vpn_bridge.SCOPE_FACEBOOK, acc_id)
                except Exception:
                    pass

    conn.commit()
    conn.close()
    return {
        "success": success_count > 0,
        "results": results,
        "count": success_count,
        "failed": len(results) - success_count,
    }


@fb_router.get("/history")
def get_fb_history(limit: int = 50):
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT id, task_type, account_uid, account_name, target_id, status, detail, created_at FROM fb_tasks_history ORDER BY id DESC LIMIT ?", (limit,))
    history = []
    for r in cursor.fetchall():
        history.append({
            "id": r[0],
            "task_type": r[1],
            "account_uid": r[2],
            "account_name": r[3],
            "target_id": r[4],
            "status": r[5],
            "detail": r[6],
            "created_at": r[7]
        })
    conn.close()
    return {"history": history}


@fb_router.post("/history/clear")
def clear_fb_history():
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fb_tasks_history")
    conn.commit()
    conn.close()
    return {"success": True}


# ---------------------------------------------------------------------------
# QUẢN LÝ TỆP ID (FILE ID MANAGER)
# ---------------------------------------------------------------------------
@fb_router.get("/file-ids")
def list_fb_file_ids():
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, content, total_count, category, created_at FROM fb_file_ids ORDER BY id DESC")
    files = []
    for r in cursor.fetchall():
        files.append({
            "id": r[0],
            "name": r[1],
            "content": r[2],
            "total_count": r[3],
            "category": r[4],
            "created_at": r[5]
        })
    conn.close()
    return {"files": files}


@fb_router.post("/file-ids")
def create_fb_file_id(req: FileIdCreateRequest):
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    lines = [l.strip() for l in req.content.splitlines() if l.strip()]
    count = len(lines)
    now = int(time.time())
    cursor.execute("""
        INSERT INTO fb_file_ids (name, content, total_count, category, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (req.name, req.content, count, req.category, now))
    file_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"success": True, "id": file_id, "count": count}


@fb_router.delete("/file-ids/{file_id}")
def delete_fb_file_id(file_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fb_file_ids WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ---------------------------------------------------------------------------
# QUẢN LÝ BLACKLIST & WHITELIST
# ---------------------------------------------------------------------------
@fb_router.get("/blacklist")
def list_fb_blacklist():
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT id, type, target_uid, note, created_at FROM fb_black_white_list ORDER BY id DESC")
    items = []
    for r in cursor.fetchall():
        items.append({
            "id": r[0],
            "type": r[1],
            "target_uid": r[2],
            "note": r[3],
            "created_at": r[4]
        })
    conn.close()
    return {"items": items}


@fb_router.post("/blacklist")
def add_fb_blacklist(req: BlacklistCreateRequest):
    conn = connect_db(DB_PATH)
    init_fb_db(conn)
    cursor = conn.cursor()
    now = int(time.time())
    cursor.execute("""
        INSERT INTO fb_black_white_list (type, target_uid, note, created_at)
        VALUES (?, ?, ?, ?)
    """, (req.type, req.target_uid, req.note, now))
    item_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"success": True, "id": item_id}


@fb_router.delete("/blacklist/{item_id}")
def delete_fb_blacklist(item_id: int):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fb_black_white_list WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ---------------------------------------------------------------------------
# XUẤT DỮ LIỆU TÀI KHOẢN (EXPORT TXT)
# ---------------------------------------------------------------------------
@fb_router.get("/accounts/export")
def export_fb_accounts(ids: Optional[str] = None):
    conn = connect_db(DB_PATH)
    cursor = conn.cursor()
    if ids:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip().isdigit()]
        if id_list:
            placeholders = ",".join("?" * len(id_list))
            cursor.execute(f"SELECT uid, password, code2fa, cookie, vpn_location FROM fb_accounts WHERE id IN ({placeholders})", id_list)
        else:
            cursor.execute("SELECT uid, password, code2fa, cookie, vpn_location FROM fb_accounts")
    else:
        cursor.execute("SELECT uid, password, code2fa, cookie, vpn_location FROM fb_accounts")

    rows = cursor.fetchall()
    conn.close()

    lines = []
    for r in rows:
        uid = r[0] or ""
        pwd = decrypted(r[1]) if r[1] else ""
        c2fa = decrypted(r[2]) if r[2] else ""
        cookie = decrypted(r[3]) if r[3] else ""
        vpn_location = r[4] or ""
        lines.append(f"{uid}|{pwd}|{c2fa}|{cookie}|{vpn_location}")

    text_content = "\n".join(lines)
    return Response(
        content=text_content,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=facebook_accounts.txt"}
    )
