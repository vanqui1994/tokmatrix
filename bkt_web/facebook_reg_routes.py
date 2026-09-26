"""
Facebook Registration API Router (BaoSamReg Web Port)
Cung cấp REST API cho module Reg FB:
- Tạo luồng & sinh danh tính xem trước
- Khởi chạy & dừng đăng ký tự động
- Cài đặt cổng Mail (DongVanFb, 10minutemail...) & Phone (FunOtp...)
- Quản lý kho tài khoản đã tạo, xuất file, và đồng bộ 1-click sang Facebook Pro V2
"""

import time
from contextlib import closing
from datetime import datetime, timezone
import json
import random
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Response
from pydantic import BaseModel, Field, ConfigDict

try:
    from bkt_web.db_utils import connect_db
    from bkt_web.security import SecretStore
    from bkt_web import key_vault
    from bkt_web import vpn_bridge
    from bkt_web import nuoinick_db as nn_db
    from bkt_web.browser_engine import (
        capture_native_facebook_session,
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
    from bkt_web.facebook_reg_engine import (
        RandomFacebookIdentityGenerator,
        DongVanFbClient,
        FunOtpClient,
        TenMinuteMailClient,
        MicrosoftImapOAuth2Client,
        update_store_email_token,
        FacebookRegistrationRunner,
        REG_MANAGER
    )
except ImportError:
    import vpn_bridge
    from db_utils import connect_db
    from security import SecretStore
    import key_vault
    import nuoinick_db as nn_db
    from browser_engine import (
        capture_native_facebook_session,
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
    from facebook_reg_engine import (
        RandomFacebookIdentityGenerator,
        DongVanFbClient,
        FunOtpClient,
        TenMinuteMailClient,
        MicrosoftImapOAuth2Client,
        update_store_email_token,
        FacebookRegistrationRunner,
        REG_MANAGER
    )

fb_reg_router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")
FB_SECRET_COLUMNS = ("password", "code2fa", "cookie", "token", "pass_mail")


def encrypted(value: str | None) -> str:
    return SECRET_STORE.encrypt((value or "").strip())


def decrypted(value: str | None) -> str:
    return SECRET_STORE.decrypt(value or "")


def facebook_cookie_header_to_playwright(cookie_header: str) -> List[Dict[str, Any]]:
    """Chuyển cookie dạng `name=value; ...` sang cookie jar của Playwright."""
    return cookie_header_to_playwright(cookie_header)



def init_fb_reg_db(conn):
    """Khởi tạo bảng cơ sở dữ liệu cho module Reg Facebook BaoSam"""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_reg_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE,
            name TEXT DEFAULT '',
            gender TEXT DEFAULT '',
            password TEXT DEFAULT '',
            code2fa TEXT DEFAULT '',
            cookie TEXT DEFAULT '',
            token TEXT DEFAULT '',
            mail TEXT DEFAULT '',
            pass_mail TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            birthday TEXT DEFAULT '',
            proxy TEXT DEFAULT '',
            vpn_config TEXT DEFAULT '',
            vpn_location TEXT DEFAULT '',
            script TEXT DEFAULT '',
            status TEXT DEFAULT 'Live',
            message TEXT DEFAULT '',
            created_at INTEGER DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_reg_settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fb_email_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            pass_mail TEXT DEFAULT '',
            refresh_token TEXT DEFAULT '',
            client_id TEXT DEFAULT '9e5f94bc-e8a4-4e73-b8be-63364c29d753',
            source TEXT DEFAULT '',
            status TEXT DEFAULT 'Ready',
            used_for TEXT DEFAULT '',
            created_at INTEGER DEFAULT 0,
            last_used_at INTEGER DEFAULT 0
        )
    """)
    try:
        cursor.execute("ALTER TABLE fb_reg_accounts ADD COLUMN vpn_location TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE fb_reg_accounts ADD COLUMN vpn_config TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE fb_reg_accounts ADD COLUMN refresh_token TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE fb_reg_accounts ADD COLUMN client_id TEXT DEFAULT ''")
    except Exception:
        pass
    # Dữ liệu từ bản cũ có thể được ghi Live dù không lưu được phiên cookie.
    # Không để giao diện tiếp tục khẳng định các nick này đăng nhập được.
    cursor.execute("""
        UPDATE fb_reg_accounts
        SET status='Thiếu phiên đăng nhập',
            message='Bản Reg cũ không lưu cookie phiên; cần đăng nhập lại hoặc Reg lại.'
        WHERE TRIM(COALESCE(cookie, '')) = ''
          AND (LOWER(status) LIKE '%live%' OR LOWER(status) LIKE '%thành công%')
    """)
    conn.commit()


# Pydantic Schemas
class PreviewRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=100)
    gender_mode: str = Field(default="random")  # random, male, female
    include_middle_name: bool = True
    min_pwd_len: int = 10
    max_pwd_len: int = 14
    include_digits: bool = True
    include_special: bool = True
    mail_domain: str = "gmail.com"


class StartBatchRequest(BaseModel):
    thread_count: int = Field(default=2, ge=1, le=20)
    total_accounts: int = Field(default=5, ge=1, le=1000)
    script_name: str = Field(default="Reg FB and Verify (M)")
    mail_provider: str = Field(default="EmailStore")
    mail_config: Dict[str, Any] = Field(default_factory=dict)
    phone_provider: str = Field(default="FunOtp")
    phone_config: Dict[str, Any] = Field(default_factory=dict)
    # Mỗi luồng đăng ký tự mở một tunnel WireGuard riêng theo quốc gia này
    vpn_country: str = Field(default="US")
    headless: bool = True
    auto_sync_platforms: bool = True


class VerifyMailTestRequest(BaseModel):
    provider: str = "DongVanFb"
    api_key: str = ""
    folder_id: str = "1"


class VerifyPhoneTestRequest(BaseModel):
    provider: str = "FunOtp"
    api_key: str = ""
    service: str = "facebook"
    country: str = "vn"


class EmailStoreImportRequest(BaseModel):
    raw_text: str = ""
    source: str = "Manual Import"


class EmailStoreResetRequest(BaseModel):
    ids: Optional[List[int]] = None
    target_status: str = "Ready"


class EmailStoreDeleteRequest(BaseModel):
    ids: List[int] = Field(default_factory=list)
    delete_all: bool = False


class EmailStoreTestOtpRequest(BaseModel):
    id: Optional[int] = None
    email: Optional[str] = None
    pass_mail: Optional[str] = None
    refresh_token: Optional[str] = None
    client_id: Optional[str] = None


class AccountGetCodeRequest(BaseModel):
    account_id: Optional[int] = None
    uid: Optional[str] = None
    email: Optional[str] = None
    filter_type: Optional[str] = "facebook"


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@fb_reg_router.get("/stats")
async def get_reg_stats():
    """Lấy số liệu thống kê tổng quan Reg FB"""
    with closing(connect_db(DB_PATH)) as conn, conn:
        cursor = conn.cursor()
        total = cursor.execute("SELECT count(*) FROM fb_reg_accounts").fetchone()[0]
        live = cursor.execute("SELECT count(*) FROM fb_reg_accounts WHERE status LIKE '%Live%' OR status LIKE '%thành công%'").fetchone()[0]
        checkpoint = cursor.execute("SELECT count(*) FROM fb_reg_accounts WHERE status LIKE '%chặn%' OR status LIKE '%Lỗi%'").fetchone()[0]
        unverified = cursor.execute("SELECT count(*) FROM fb_reg_accounts WHERE status LIKE '%Chưa verify%' OR status LIKE '%Novery%'").fetchone()[0]

    return {
        "total": total,
        "live": live,
        "checkpoint": checkpoint,
        "unverified": unverified,
        "is_running": REG_MANAGER.is_running,
        "active_tasks_count": len([t for t in REG_MANAGER.current_tasks if t.get("status") == "Đang chạy"])
    }


@fb_reg_router.get("/settings")
async def get_reg_settings():
    """Lấy cấu hình đã lưu cho Reg FB"""
    settings = {}
    with closing(connect_db(DB_PATH)) as conn, conn:
        cursor = conn.cursor()
        rows = cursor.execute("SELECT key, value FROM fb_reg_settings").fetchall()
        for k, v in rows:
            if k in ["dongvan_api_key", "funotp_api_key"]:
                continue  # hai khoá này nay nằm ở kho khoá chung
            if k == "proxies":
                settings[k] = decrypted(v)
            else:
                settings[k] = v

    # Defaults
    settings.setdefault("script_name", "Reg FB and Verify (M)")
    settings.setdefault("mail_provider", "DongVanFb")
    settings.setdefault("dongvan_folder_id", "1")
    settings.setdefault("phone_provider", "FunOtp")
    settings.setdefault("funotp_service", "facebook")
    settings.setdefault("funotp_country", "vn")
    settings.setdefault("thread_count", "2")
    settings.setdefault("proxies", "")
    settings.setdefault("headless", "true")
    settings.setdefault("vpn_country", "US")
    # Không bao giờ gửi khoá nguyên văn về trình duyệt, chỉ báo đã có hay chưa.
    settings["dongvan_api_key_configured"] = bool(key_vault.get_key("mail.dongvanfb"))
    settings["funotp_api_key_configured"] = bool(key_vault.get_key("otp.funotp"))
    return settings


@fb_reg_router.post("/settings")
async def save_reg_settings(req: Dict[str, Any]):
    """Lưu cấu hình Reg FB"""
    with closing(connect_db(DB_PATH)) as conn, conn:
        cursor = conn.cursor()
        vault_targets = {"dongvan_api_key": "mail.dongvanfb", "funotp_api_key": "otp.funotp"}
        for k, v in req.items():
            str_val = str(v).strip()
            if k in vault_targets:
                # Chuyển thẳng sang kho khoá chung, không lưu ở bảng này nữa.
                if str_val:
                    key_vault.set_key(vault_targets[k], str_val)
                continue
            if k == "proxies":
                str_val = encrypted(str_val)
            cursor.execute("""
                INSERT INTO fb_reg_settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
            """, (k, str_val))
        conn.commit()
    return {"success": True, "message": "Đã lưu cài đặt Reg FB"}


@fb_reg_router.post("/generate-preview")
async def generate_preview_identities(req: PreviewRequest):
    """Sinh danh sách tài khoản xem trước (Họ tên, Giới tính, Mật khẩu, 2FA, Ngày sinh)"""
    results = []
    for i in range(req.count):
        if req.gender_mode == "male":
            gender = "Nam"
        elif req.gender_mode == "female":
            gender = "Nữ"
        else:
            gender = RandomFacebookIdentityGenerator.random_gender()

        name_info = RandomFacebookIdentityGenerator.random_fullname(
            gender=gender,
            include_middle_name=req.include_middle_name
        )
        pwd = RandomFacebookIdentityGenerator.random_password(
            min_len=req.min_pwd_len,
            max_len=req.max_pwd_len,
            include_digits=req.include_digits,
            include_special=req.include_special
        )
        bday = RandomFacebookIdentityGenerator.random_birthday()
        secret_2fa = RandomFacebookIdentityGenerator.generate_2fa_secret()
        totp_preview = RandomFacebookIdentityGenerator.get_totp_code(secret_2fa)
        sim_email = RandomFacebookIdentityGenerator.random_email_from_name(name_info["fullname"], req.mail_domain)

        results.append({
            "stt": i + 1,
            "fullname": name_info["fullname"],
            "firstname": name_info["firstname"],
            "lastname": name_info["lastname"],
            "gender": gender,
            "password": pwd,
            "birthday": bday["iso"],
            "twofa_secret": secret_2fa,
            "totp_preview": totp_preview,
            "email_preview": sim_email
        })

    return {"success": True, "items": results}


def sync_registered_account_to_platforms(
    conn,
    acc: Dict[str, Any],
    sync_facebook: bool = True,
    sync_fb_pro: bool = True,
    sync_mail: bool = True,
    sync_profiles: bool = True,
    category: str = "BaoSam Reg AI"
) -> Dict[str, Any]:
    """
    Đồng bộ một tài khoản đã reg thành công qua tất cả các nền tảng tương ứng:
    1. FacebookAccounts (Quản Lý Nick - Nền tảng Facebook)
    2. fb_accounts (Simple Facebook Pro V2)
    3. HotmailAccounts / GmailAccounts (Quản Lý Nick - Nền tảng Mail tương ứng)
    4. BrowserProfiles (Hồ Sơ Trình Duyệt Antidetect BaoSamBrowser)
    5. fb_reg_email_store (Đánh dấu trạng thái email đã dùng thành công)
    """
    cursor = conn.cursor()
    uid = str(acc.get("uid") or "").strip()
    if not uid:
        return {"success": False, "message": "Thiếu UID"}

    name = acc.get("name") or f"FB User {uid}"
    gender = acc.get("gender") or ""
    plain_pass = acc.get("password") or ""
    enc_pass = plain_pass if (plain_pass and plain_pass.startswith("gAAAAA")) else encrypted(plain_pass)

    plain_2fa = acc.get("twofa") or acc.get("code2fa") or ""
    enc_2fa = plain_2fa if (plain_2fa and plain_2fa.startswith("gAAAAA")) else encrypted(plain_2fa)

    plain_cookie = acc.get("cookie") or ""
    enc_cookie = plain_cookie if (plain_cookie and plain_cookie.startswith("gAAAAA")) else encrypted(plain_cookie)
    profile_cookies = acc.get("profile_cookies") or facebook_cookie_header_to_playwright(plain_cookie)

    plain_token = acc.get("token") or ""
    enc_token = plain_token if (plain_token and plain_token.startswith("gAAAAA")) else encrypted(plain_token)

    mail = (acc.get("mail") or "").strip()
    plain_pass_mail = acc.get("pass_mail") or ""
    enc_pass_mail = plain_pass_mail if (plain_pass_mail and plain_pass_mail.startswith("gAAAAA")) else encrypted(plain_pass_mail)

    phone = acc.get("phone") or ""
    vpn_config = acc.get("vpn_config") or ""
    vpn_location = acc.get("vpn_location") or ""
    proxy = acc.get("proxy") or ""
    profile_id = f"fb-{uid}"
    now_ts = int(time.time())
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    synced_info = {
        "facebook": False,
        "fb_pro": False,
        "mail_platform": None,
        "profile": False,
        "email_store": False
    }

    # 1. Đồng bộ sang FacebookAccounts (Quản Lý Nick - Facebook)
    if sync_facebook:
        try:
            cursor.execute("SELECT Id FROM FacebookAccounts WHERE Uid = ?", (uid,))
            fb_acc = cursor.fetchone()
            if fb_acc:
                cursor.execute("""
                    UPDATE FacebookAccounts SET
                        HoTen = ?, GioiTinh = ?, Pass = ?, TwoFA = ?, Token = ?, Cookie = ?,
                        Mail = ?, PassMail = ?, PhoneName = ?, VpnConfig = ?, VpnLocation = ?, Proxy = ?,
                        TrangThai = 'Live', TinhTrang = 'Mới reg AI', BrowserProfileId = ?
                    WHERE Uid = ?
                """, (name, gender, enc_pass, enc_2fa, enc_token, enc_cookie,
                      mail, enc_pass_mail, phone, vpn_config, vpn_location, proxy, profile_id, uid))
            else:
                cursor.execute("SELECT COALESCE(MAX(Idx), 0) FROM FacebookAccounts")
                next_idx = (cursor.fetchone()[0] or 0) + 1

                # Tìm hoặc tạo thư mục 'BaoSam Reg AI'
                cursor.execute("SELECT Id FROM NickFolders WHERE Name = 'BaoSam Reg AI'")
                folder_row = cursor.fetchone()
                if folder_row:
                    folder_id = folder_row[0]
                else:
                    cursor.execute("INSERT INTO NickFolders (Name, IsSystem) VALUES ('BaoSam Reg AI', 0)")
                    folder_id = cursor.lastrowid

                cursor.execute("""
                    INSERT INTO FacebookAccounts (
                        Idx, FolderId, PhoneName, ScriptId, ScriptName, Uid, Pass, TwoFA, Token,
                        Cookie, Mail, PassMail, MailKhoiPhuc, PassMailKhoiPhuc, BanBe, Nhom, GioiTinh,
                        Avatar, ProfileChrome, TenProfile, UserAgent, Proxy, TepCu, GhiChu,
                        TuongTacCuoi, TrangThai, TinhTrang, BrowserProfileId, HoTen,
                        VpnConfig, VpnLocation, Country
                    ) VALUES (
                        ?, ?, ?, 0, '', ?, ?, ?, ?,
                        ?, ?, ?, '', '', 0, 0, ?,
                        '', '', '', '', ?, '', ?,
                        ?, 'Live', 'Mới reg AI', ?, ?,
                        ?, ?, ''
                    )
                """, (
                    next_idx, folder_id, phone, uid, enc_pass, enc_2fa, enc_token,
                    enc_cookie, mail, enc_pass_mail, gender, proxy,
                    f"Reg AI {datetime.now().strftime('%d/%m %H:%M')}",
                    now_ts, profile_id, name, vpn_config, vpn_location
                ))
            synced_info["facebook"] = True
        except Exception as e:
            print(f"[Sync] Error syncing to FacebookAccounts: {e}")

    # 2. Đồng bộ sang Simple Facebook Pro V2 (fb_accounts)
    if sync_fb_pro:
        try:
            cursor.execute("""
                INSERT INTO fb_accounts (
                    uid, name, password, code2fa, cookie, vpn_config, vpn_location, category, status, type_account, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uid) DO UPDATE SET
                    name=excluded.name,
                    password=excluded.password,
                    code2fa=excluded.code2fa,
                    cookie=excluded.cookie,
                    vpn_config=CASE WHEN excluded.vpn_config != '' THEN excluded.vpn_config ELSE fb_accounts.vpn_config END,
                    vpn_location=excluded.vpn_location,
                    category=excluded.category,
                    status=excluded.status
            """, (
                uid, name, enc_pass, enc_2fa, enc_cookie, vpn_config, vpn_location,
                category, "Live", "User", now_ts
            ))
            synced_info["fb_pro"] = True
        except Exception as e:
            print(f"[Sync] Error syncing to fb_accounts: {e}")

    # 3. Đồng bộ sang Hotmail / Gmail (Quản Lý Nick - Email Platforms)
    if sync_mail and mail:
        m_lower = mail.lower()
        if any(d in m_lower for d in ["@hotmail.", "@outlook.", "@live.", "@msn."]):
            try:
                cursor.execute("SELECT Id FROM HotmailAccounts WHERE Uid = ?", (mail,))
                h_acc = cursor.fetchone()
                if not h_acc:
                    cursor.execute("SELECT COALESCE(MAX(Idx), 0) FROM HotmailAccounts")
                    h_idx = (cursor.fetchone()[0] or 0) + 1
                    cursor.execute("""
                        INSERT INTO HotmailAccounts (
                            Idx, FolderId, PhoneName, ScriptId, ScriptName, Uid, Pass, TwoFA, Token,
                            Cookie, Mail, PassMail, MailKhoiPhuc, PassMailKhoiPhuc, BanBe, Nhom, GioiTinh,
                            Avatar, ProfileChrome, TenProfile, UserAgent, Proxy, TepCu, GhiChu,
                            TuongTacCuoi, TrangThai, TinhTrang, BrowserProfileId, HoTen,
                            VpnConfig, VpnLocation, Country
                        ) VALUES (
                            ?, 0, '', 0, '', ?, '', '', '',
                            '', ?, ?, '', '', 0, 0, '',
                            '', '', '', '', '', '', ?,
                            ?, 'Live', ?, '', '', '', '', ''
                        )
                    """, (h_idx, mail, mail, enc_pass_mail, f"Reg FB UID: {uid} ({name})", now_ts, f"Đã reg FB {uid}"))
                synced_info["mail_platform"] = "Hotmail"
            except Exception as e:
                print(f"[Sync] Error syncing to HotmailAccounts: {e}")
        elif "@gmail." in m_lower:
            try:
                cursor.execute("SELECT Id FROM GmailAccounts WHERE Uid = ?", (mail,))
                g_acc = cursor.fetchone()
                if not g_acc:
                    cursor.execute("SELECT COALESCE(MAX(Idx), 0) FROM GmailAccounts")
                    g_idx = (cursor.fetchone()[0] or 0) + 1
                    cursor.execute("""
                        INSERT INTO GmailAccounts (
                            Idx, FolderId, PhoneName, ScriptId, ScriptName, Uid, Pass, TwoFA, Token,
                            Cookie, Mail, PassMail, MailKhoiPhuc, PassMailKhoiPhuc, BanBe, Nhom, GioiTinh,
                            Avatar, ProfileChrome, TenProfile, UserAgent, Proxy, TepCu, GhiChu,
                            TuongTacCuoi, TrangThai, TinhTrang, BrowserProfileId, HoTen,
                            VpnConfig, VpnLocation, Country
                        ) VALUES (
                            ?, 0, '', 0, '', ?, '', '', '',
                            '', ?, ?, '', '', 0, 0, '',
                            '', '', '', '', '', '', ?,
                            ?, 'Live', ?, '', '', '', '', ''
                        )
                    """, (g_idx, mail, mail, enc_pass_mail, f"Reg FB UID: {uid} ({name})", now_ts, f"Đã reg FB {uid}"))
                synced_info["mail_platform"] = "Gmail"
            except Exception as e:
                print(f"[Sync] Error syncing to GmailAccounts: {e}")

    # 4. Đánh dấu trong kho Email Store (fb_reg_email_store)
    if mail:
        try:
            cursor.execute("""
                UPDATE fb_email_store
                SET status = 'used',
                    used_for = ?,
                    note = ?,
                    last_used_at = ?
                WHERE email = ?
            """, (f"FB:{uid}", f"Reg FB thành công (UID: {uid})", now_ts, mail))
            synced_info["email_store"] = True
        except Exception as e:
            print(f"[Sync] Error updating fb_reg_email_store: {e}")

    # 5. Tạo Profile Antidetect (BrowserProfiles)
    if sync_profiles:
        try:
            existing_profile = nn_db.get_browser_profile(conn, profile_id) or {}
            profile_dict = {**existing_profile, **{
                "Id": profile_id,
                "Name": f"FB - {name or uid}",
                "GroupId": "Default",
                "RawProxy": proxy or existing_profile.get("RawProxy", ""),
                "BrowserName": "BaoSamBrowser",
                "BrowserVersion": "132.0.6834.83",
                "OsType": 1,
                "CanvasMode": 1,
                "WebglImageMode": 1,
                "AudioMode": 1,
                "WebrtcMode": 1,
                "StartupUrls": "https://www.facebook.com",
                "Note": f"Tạo tự động từ Reg FB AI (UID: {uid})",
                "Status": "ready",
                "CreatedAt": now_iso,
                "Tags": "Facebook,RegAI"
            }}
            nn_db.save_browser_profile(conn, profile_dict)
            if profile_cookies:
                persist_native_profile_cookies(profile_id, profile_cookies)
            synced_info["profile"] = True
        except Exception as e:
            print(f"[Sync] Error syncing to BrowserProfiles: {e}")

    return synced_info


@fb_reg_router.post("/start")
async def start_registration_batch(req: StartBatchRequest, background_tasks: BackgroundTasks):
    """Bắt đầu tiến trình tạo tài khoản tự động"""
    if REG_MANAGER.is_running:
        return {"success": False, "message": "Đang có tiến trình đăng ký chạy!"}

    # Callback lưu tài khoản tạo thành công vào DB và tự động đồng bộ
    def on_account_created(acc: Dict[str, Any]):
        with closing(connect_db(DB_PATH)) as conn, conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO fb_reg_accounts (
                    uid, name, gender, password, code2fa, cookie, token,
                    mail, pass_mail, phone, birthday, vpn_config, vpn_location, script, status, message, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uid) DO UPDATE SET
                    name=excluded.name,
                    gender=excluded.gender,
                    password=excluded.password,
                    code2fa=excluded.code2fa,
                    cookie=excluded.cookie,
                    token=excluded.token,
                    vpn_config=excluded.vpn_config,
                    vpn_location=excluded.vpn_location,
                    status=excluded.status,
                    message=excluded.message
            """, (
                acc.get("uid"),
                acc.get("name", ""),
                acc.get("gender", ""),
                encrypted(acc.get("password", "")),
                encrypted(acc.get("twofa", "")),
                encrypted(acc.get("cookie", "")),
                encrypted(acc.get("token", "")),
                acc.get("mail", ""),
                encrypted(acc.get("pass_mail", "")),
                acc.get("phone", ""),
                acc.get("birthday", ""),
                acc.get("vpn_config", ""),
                acc.get("vpn_location", ""),
                acc.get("script", ""),
                acc.get("status", "Live"),
                acc.get("message", ""),
                acc.get("created_at", int(time.time()))
            ))

            # TỰ ĐỘNG ĐỒNG BỘ QUA CÁC NỀN TẢNG KHI REG XONG
            if req.auto_sync_platforms:
                try:
                    sync_registered_account_to_platforms(conn, acc)
                except Exception as sync_err:
                    print(f"[AutoSync] Lỗi tự động đồng bộ: {sync_err}")

            conn.commit()

    # Kiểm tra tại máy chủ vì trạng thái trên giao diện có thể đã cũ. Giá trị
    # thật luôn lấy từ Kho Khoá, không tin api_key trong request.
    mail_key = key_vault.get_key("mail.dongvanfb")
    phone_key = key_vault.get_key("otp.funotp")
    if req.mail_provider == "DongVanFb" and not mail_key:
        raise HTTPException(
            status_code=400,
            detail="Chưa có API Key DongVanFb trong Cài Đặt Hệ Thống → Kho Khoá API",
        )
    uses_phone = "phone" in req.script_name.lower() or req.mail_provider == "FunOtp"
    if uses_phone and req.phone_provider == "FunOtp" and not phone_key:
        raise HTTPException(
            status_code=400,
            detail="Chưa có API Key FunOtp trong Cài Đặt Hệ Thống → Kho Khoá API",
        )

    # Mỗi luồng tự mở một tunnel WireGuard riêng, nên IP của từng nick khác nhau
    country = (req.vpn_country or "US").strip().upper()
    if country in ["UK", "GB"]:
        country = "GB"
    if country != "NONE":
        try:
            vpn_bridge.pick_config(country)
        except vpn_bridge.VpnError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # Khoá luôn lấy từ kho chung, không nhận từ trình duyệt gửi lên nữa.
    mail_config = dict(req.mail_config or {})
    phone_config = dict(req.phone_config or {})
    mail_config["api_key"] = mail_key
    phone_config["api_key"] = phone_key

    background_tasks.add_task(
        REG_MANAGER.start_batch,
        thread_count=req.thread_count,
        total_accounts=req.total_accounts,
        script_name=req.script_name,
        mail_provider=req.mail_provider,
        mail_config=mail_config,
        phone_provider=req.phone_provider,
        phone_config=phone_config,
        vpn_country=country,
        headless=req.headless,
        db_callback=on_account_created
    )

    return {"success": True, "message": f"Đã bắt đầu đăng ký {req.total_accounts} tài khoản ({req.thread_count} luồng)"}


@fb_reg_router.post("/stop")
async def stop_registration_batch():
    """Dừng tiến trình đăng ký khẩn cấp"""
    res = REG_MANAGER.stop_batch()
    return res


@fb_reg_router.get("/tasks")
async def get_active_tasks():
    """Lấy danh sách trạng thái các luồng đang chạy"""
    return {
        "is_running": REG_MANAGER.is_running,
        "tasks": REG_MANAGER.current_tasks
    }


@fb_reg_router.get("/logs")
async def get_reg_logs(limit: int = 200):
    """Lấy log hệ thống đăng ký realtime"""
    return {
        "logs": REG_MANAGER.logs[-limit:],
        "is_running": REG_MANAGER.is_running
    }


@fb_reg_router.get("/accounts")
async def list_reg_accounts(status: str = "", search: str = "", limit: int = 100, offset: int = 0):
    """Lấy danh sách các tài khoản đã đăng ký"""
    query = "SELECT * FROM fb_reg_accounts WHERE 1=1"
    params = []
    if status and status != "Tất cả":
        query += " AND status LIKE ?"
        params.append(f"%{status}%")
    if search:
        query += " AND (uid LIKE ? OR name LIKE ? OR mail LIKE ? OR phone LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s])

    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with closing(connect_db(DB_PATH)) as conn, conn:
        conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
        cursor = conn.cursor()
        rows = cursor.execute(query, params).fetchall()

        # Decrypt sensitive columns for display
        items = []
        for r in rows:
            r["password"] = decrypted(r.get("password"))
            r["code2fa"] = decrypted(r.get("code2fa"))
            r["cookie"] = decrypted(r.get("cookie"))
            r["token"] = decrypted(r.get("token"))
            r["pass_mail"] = decrypted(r.get("pass_mail"))
            items.append(r)

        total = cursor.execute("SELECT count(*) FROM fb_reg_accounts").fetchone()["count(*)"]

    return {"items": items, "total": total}


@fb_reg_router.delete("/accounts/{account_id}")
async def delete_reg_account(account_id: int):
    with closing(connect_db(DB_PATH)) as conn, conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM fb_reg_accounts WHERE id=?", (account_id,))
        conn.commit()
    return {"success": True, "message": "Đã xoá tài khoản"}


@fb_reg_router.post("/accounts/{account_id}/open")
async def open_reg_account(account_id: int):
    """Mở đúng profile đã giữ cookie của nick, qua VPN đã gán."""
    with closing(connect_db(DB_PATH)) as conn, conn:
        conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
        row = conn.execute(
            "SELECT * FROM fb_reg_accounts WHERE id=?", (account_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Reg")

        uid = str(row.get("uid") or "").strip()
        cookie_header = decrypted(row.get("cookie"))
        if not uid:
            raise HTTPException(status_code=409, detail="Tài khoản Reg chưa có UID Facebook")
        profile_id = f"fb-{uid}"
        database_cookies = facebook_cookie_header_to_playwright(cookie_header)
        stored_cookies = load_native_profile_cookies(profile_id)
        stored_valid, _, _ = validate_session_cookies(stored_cookies, uid)
        database_valid, _, _ = validate_session_cookies(database_cookies, uid)
        cookies = stored_cookies if stored_valid else database_cookies
        has_session = stored_valid or database_valid
        session_source = "profile" if stored_valid else ("database" if database_valid else "none")
        if stored_valid and not database_valid:
            sync_session_cookie(conn, uid, cookies_to_header(stored_cookies), encrypted)

        vpn_config = row.get("vpn_config") or ""
        vpn_location = row.get("vpn_location") or ""
        if not vpn_config:
            fallback = conn.execute(
                "SELECT vpn_config, vpn_location FROM fb_accounts WHERE uid=?", (uid,)
            ).fetchone()
            if fallback:
                vpn_config = fallback.get("vpn_config") or ""
                vpn_location = fallback.get("vpn_location") or vpn_location
        if not vpn_config:
            raise HTTPException(
                status_code=409,
                detail="Tài khoản chưa lưu file VPN. Hãy gán VPN trước khi mở nick.",
            )

        try:
            socks_url = vpn_bridge.open_tunnel(vpn_bridge.SCOPE_FBREG, account_id, vpn_config)
        except vpn_bridge.VpnError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        # Truy vấn tài khoản Reg dùng row_factory dạng dict, còn lớp
        # nuoinick_db ánh xạ tuple theo PROFILE_COLUMNS. Trả connection về
        # tuple trước khi đọc profile để tránh tạo nhầm profile có ID là "Id".
        conn.row_factory = None
        profile = nn_db.get_browser_profile(conn, profile_id) or {
            "Id": profile_id,
            "Name": f"FB - {row.get('name') or uid}",
            "GroupId": "Default",
            "BrowserName": "BaoSamBrowser",
            "BrowserVersion": "132.0.6834.83",
            "OsType": 1,
            "CanvasMode": 1,
            "WebglImageMode": 1,
            "AudioMode": 1,
            "WebrtcMode": 1,
            "Status": "ready",
            "CreatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "Tags": "Facebook,RegAI",
        }
        profile.update({
            "RawProxy": socks_url,
            "StartupUrls": (
                "https://www.facebook.com/" if has_session
                else "https://www.facebook.com/login/"
            ),
            "Note": f"Phiên Reg FB UID {uid} — VPN {vpn_location}",
            "DeletedAt": None,
        })
        nn_db.save_browser_profile(conn, profile)
        if has_session:
            persist_native_profile_cookies(profile_id, cookies)
        conn.execute(
            """
            UPDATE fb_reg_accounts
            SET vpn_config=?, vpn_location=?,
                status=CASE WHEN ? THEN status ELSE 'Thiếu phiên đăng nhập' END,
                message=CASE WHEN ? THEN message ELSE
                    'Đã mở trang login để đăng nhập lại; phiên Reg cũ thiếu cookie c_user/xs.' END
            WHERE id=?
            """,
            (vpn_config, vpn_location, has_session, has_session, account_id),
        )

    # Khởi động lại để chắc chắn cookie mã hóa được nạp trước navigation đầu tiên.
    await stop_native_profile(profile_id)
    try:
        result = await start_native_profile(profile, headless=False)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không mở được profile Facebook: {exc}")

    session_detail = ""
    if has_session:
        verified = await capture_native_facebook_session(profile_id, uid, verify_page=True)
        session_detail = verified.get("message", "")
        has_session = bool(verified.get("valid"))
        if has_session:
            with closing(connect_db(DB_PATH)) as conn:
                sync_session_cookie(conn, uid, verified["cookie_header"], encrypted)
        else:
            with closing(connect_db(DB_PATH)) as conn, conn:
                conn.execute(
                    "UPDATE fb_reg_accounts SET status='Phiên đăng nhập hết hạn', message=? WHERE id=?",
                    (session_detail, account_id),
                )
    return {
        "success": True,
        "profile_id": profile_id,
        "vpn_location": vpn_location,
        "remote_debugging_port": result.get("remote_debugging_port"),
        "session_restored": has_session,
        "session_verified": has_session,
        "session_source": session_source,
        "message": (
            "Đã mở và xác minh đúng phiên Facebook qua profile và VPN đã gán"
            if has_session else
            "Phiên chưa hợp lệ; đã mở trang đăng nhập thủ công bằng đúng profile và VPN"
        ),
        "session_detail": session_detail,
    }


async def _capture_reg_account_session(account_id: int) -> Dict[str, Any]:
    with closing(connect_db(DB_PATH)) as conn:
        conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
        row = conn.execute(
            "SELECT id, uid FROM fb_reg_accounts WHERE id=?",
            (account_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Reg")

    uid = str(row.get("uid") or "").strip()
    if not uid:
        raise HTTPException(status_code=409, detail="Tài khoản chưa có UID Facebook")
    profile_id = f"fb-{uid}"
    captured = await capture_native_facebook_session(profile_id, uid, verify_page=True)
    if not captured.get("valid"):
        raise HTTPException(status_code=409, detail=captured.get("message") or "Phiên chưa hợp lệ")

    with closing(connect_db(DB_PATH)) as conn:
        updated = sync_session_cookie(
            conn,
            uid,
            captured["cookie_header"],
            encrypted,
        )
    return {
        "success": True,
        "profile_id": profile_id,
        "uid": uid,
        "url": captured.get("url", ""),
        "updated": updated,
        "message": "Đã xác minh /me, lưu cookie mã hoá và đồng bộ cả 3 module.",
    }


@fb_reg_router.post("/accounts/{account_id}/session/capture")
async def capture_reg_account_session(account_id: int):
    """Lưu phiên sau khi người dùng đăng nhập thủ công trong profile."""
    return await _capture_reg_account_session(account_id)


@fb_reg_router.post("/accounts/{account_id}/close")
async def close_reg_account(account_id: int):
    """Thử lưu phiên mới, sau đó đóng profile và tunnel VPN của tài khoản."""
    uid = ""
    with closing(connect_db(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT uid FROM fb_reg_accounts WHERE id=?",
            (account_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản Reg")
        uid = str(row[0] or "").strip()

    captured = False
    capture_message = ""
    if uid:
        try:
            result = await _capture_reg_account_session(account_id)
            captured = True
            capture_message = result["message"]
        except HTTPException as exc:
            capture_message = str(exc.detail)

    profile_id = f"fb-{uid}" if uid else ""
    stopped = await stop_native_profile(profile_id) if profile_id else False
    vpn_bridge.close_tunnel(vpn_bridge.SCOPE_FBREG, account_id)
    return {
        "success": True,
        "profile_id": profile_id,
        "session_saved": captured,
        "profile_stopped": stopped,
        "message": (
            "Đã lưu phiên mới, đóng profile và ngắt VPN."
            if captured else
            f"Đã đóng profile và ngắt VPN. Chưa lưu được phiên: {capture_message}"
        ),
    }


@fb_reg_router.delete("/accounts")
async def bulk_delete_reg_accounts(req: Dict[str, List[int]]):
    ids = req.get("ids", [])
    if not ids:
        return {"success": False, "message": "Chưa chọn tài khoản cần xoá"}
    placeholders = ",".join(["?"] * len(ids))
    with closing(connect_db(DB_PATH)) as conn, conn:
        cursor = conn.cursor()
        cursor.execute(f"DELETE FROM fb_reg_accounts WHERE id IN ({placeholders})", ids)
        conn.commit()
    return {"success": True, "message": f"Đã xoá {len(ids)} tài khoản"}


@fb_reg_router.post("/accounts/{account_id}/get-code")
@fb_reg_router.post("/accounts/get-code")
async def get_fb_account_mail_code(account_id: Optional[int] = None, req: Optional[AccountGetCodeRequest] = None):
    """
    Lấy mã code xác nhận email gửi về cho từng tài khoản đã reg (FB Reg Accounts).
    Áp dụng cơ chế quy_manager.html (tools.dongvanfb.net/api/get_code_oauth2)
    kết hợp fallback Direct Microsoft IMAP XOAUTH2.
    """
    target_id = account_id or (req.account_id if req else None)
    target_uid = req.uid if req else None
    target_email = req.email if req else None
    filter_type = (req.filter_type if req and req.filter_type else "facebook").lower()

    record = None
    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()
        if target_id:
            cursor.execute("SELECT id, uid, name, mail, pass_mail, refresh_token, client_id FROM fb_reg_accounts WHERE id = ?", (target_id,))
            record = cursor.fetchone()
        elif target_uid:
            cursor.execute("SELECT id, uid, name, mail, pass_mail, refresh_token, client_id FROM fb_reg_accounts WHERE uid = ?", (target_uid,))
            record = cursor.fetchone()
        elif target_email:
            cursor.execute("SELECT id, uid, name, mail, pass_mail, refresh_token, client_id FROM fb_reg_accounts WHERE mail = ?", (target_email.strip(),))
            record = cursor.fetchone()

    if not record:
        return {"success": False, "message": "Không tìm thấy tài khoản trong danh sách đã tạo."}

    r_id, r_uid, r_name, r_mail, r_enc_pass, r_enc_rf, r_client_id = record
    if not r_mail or "@" not in str(r_mail):
        return {"success": False, "message": f"Tài khoản UID {r_uid or r_id} không sử dụng email (dùng SĐT hoặc chưa gán email)."}

    email = r_mail.strip()
    pass_mail = decrypted(r_enc_pass) if r_enc_pass else ""
    refresh_token = decrypted(r_enc_rf) if r_enc_rf else ""
    client_id = r_client_id or ""

    # Nếu trong fb_reg_accounts chưa có refresh_token, tự động tra cứu từ fb_email_store
    if not refresh_token:
        with closing(connect_db(DB_PATH)) as conn, conn:
            cursor = conn.cursor()
            cursor.execute("SELECT pass_mail, refresh_token, client_id FROM fb_email_store WHERE email = ?", (email,))
            store_row = cursor.fetchone()
            if store_row:
                s_pass, s_rf, s_cid = store_row
                if not pass_mail and s_pass:
                    pass_mail = decrypted(s_pass)
                if s_rf:
                    refresh_token = decrypted(s_rf)
                if s_cid:
                    client_id = s_cid
                if refresh_token:
                    cursor.execute("UPDATE fb_reg_accounts SET refresh_token = ?, client_id = ? WHERE id = ?", (encrypted(refresh_token), client_id, r_id))
                    conn.commit()

    if not refresh_token:
        return {
            "success": False,
            "email": email,
            "message": f"Không tìm thấy Refresh Token OAuth2 của email {email} trong kho fb_email_store để lấy code tự động."
        }

    client = MicrosoftImapOAuth2Client(
        email=email,
        refresh_token=refresh_token,
        client_id=client_id or "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
        pass_mail=pass_mail,
        on_token_refresh=update_store_email_token
    )

    # 1. Thử lấy mã siêu tốc qua get_code_oauth2 (quy-tool fast API)
    fast_res = await client.try_get_otp_fast_api(filter_type=filter_type)
    if not fast_res and filter_type == "facebook":
        fast_res = await client.try_get_otp_fast_api(filter_type="any")

    if fast_res and fast_res.get("success"):
        return {
            "success": True,
            "account_id": r_id,
            "uid": r_uid,
            "name": r_name,
            "email": email,
            "code": fast_res.get("otp"),
            "from": fast_res.get("from", ""),
            "content": fast_res.get("subject", ""),
            "date": datetime.now().strftime("%H:%M:%S %d/%m/%Y"),
            "method": "DongVanFb OAuth2 Proxy (quy-tool)",
            "message": f"Lấy mã thành công: {fast_res.get('otp')}"
        }

    # 2. Fallback sang Direct Microsoft IMAP XOAUTH2
    access_token = await client.get_access_token()
    if access_token:
        import asyncio
        loop = asyncio.get_running_loop()
        messages = await loop.run_in_executor(None, client._sync_read_imap, access_token)
        for m in messages:
            combined = f"{m.get('subject', '')} {m.get('body', '')}"
            fb_m = re.search(r'(?:FB-|code\s+is\s+|mã\s+là\s+|mã:\s*|xác nhận:\s*)(\d{5,6})\b', combined, re.IGNORECASE)
            if fb_m:
                return {
                    "success": True,
                    "account_id": r_id,
                    "uid": r_uid,
                    "name": r_name,
                    "email": email,
                    "code": fb_m.group(1),
                    "from": m.get("from", ""),
                    "content": m.get("subject", ""),
                    "date": datetime.now().strftime("%H:%M:%S %d/%m/%Y"),
                    "method": "Direct Microsoft IMAP XOAUTH2",
                    "messages": messages[:5],
                    "message": f"Lấy mã thành công qua Direct IMAP XOAUTH2: {fb_m.group(1)}"
                }
            codes = re.findall(r'\b\d{5,8}\b', combined)
            if codes:
                return {
                    "success": True,
                    "account_id": r_id,
                    "uid": r_uid,
                    "name": r_name,
                    "email": email,
                    "code": codes[0],
                    "from": m.get("from", ""),
                    "content": m.get("subject", ""),
                    "date": datetime.now().strftime("%H:%M:%S %d/%m/%Y"),
                    "method": "Direct Microsoft IMAP XOAUTH2",
                    "messages": messages[:5],
                    "message": f"Lấy mã thành công qua Direct IMAP XOAUTH2: {codes[0]}"
                }

    return {
        "success": False,
        "email": email,
        "message": f"Chưa tìm thấy mã xác nhận mới nào trong hộp thư của {email}."
    }


@fb_reg_router.post("/sync-to-platforms")
@fb_reg_router.post("/sync-to-pro")
async def sync_accounts_to_platforms(req: Dict[str, Any]):
    """
    Đồng bộ tài khoản đã reg sang:
    1. Quản Lý Nick (FacebookAccounts)
    2. Simple Facebook Pro V2 (fb_accounts)
    3. Quản Lý Nick Mail (HotmailAccounts / GmailAccounts)
    4. Hồ Sơ Trình Duyệt Antidetect (BrowserProfiles)
    """
    ids = req.get("ids", [])
    sync_facebook = req.get("sync_facebook", True)
    sync_fb_pro = req.get("sync_fb_pro", True)
    sync_mail = req.get("sync_mail", True)
    sync_profiles = req.get("sync_profiles", True)
    category = req.get("category", "BaoSam Reg AI")

    query = "SELECT * FROM fb_reg_accounts"
    params = []
    if ids:
        placeholders = ",".join(["?"] * len(ids))
        query += f" WHERE id IN ({placeholders})"
        params = ids

    with closing(connect_db(DB_PATH)) as conn, conn:
        conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
        cursor = conn.cursor()
        reg_rows = cursor.execute(query, params).fetchall()

        synced_count = 0
        fb_synced = 0
        mail_synced = 0
        profile_synced = 0

        for r in reg_rows:
            uid = r.get("uid")
            if not uid or not str(uid).isdigit():
                continue

            acc_data = {
                "uid": uid,
                "name": r.get("name", ""),
                "gender": r.get("gender", ""),
                "password": decrypted(r.get("password")),
                "twofa": decrypted(r.get("code2fa")),
                "cookie": decrypted(r.get("cookie")),
                "token": decrypted(r.get("token")),
                "mail": r.get("mail", ""),
                "pass_mail": decrypted(r.get("pass_mail")),
                "phone": r.get("phone", ""),
                "vpn_config": r.get("vpn_config", ""),
                "vpn_location": r.get("vpn_location", ""),
                "proxy": r.get("proxy", ""),
                "status": r.get("status", "Live")
            }

            res = sync_registered_account_to_platforms(
                conn,
                acc_data,
                sync_facebook=sync_facebook,
                sync_fb_pro=sync_fb_pro,
                sync_mail=sync_mail,
                sync_profiles=sync_profiles,
                category=category
            )
            synced_count += 1
            if res.get("facebook") or res.get("fb_pro"):
                fb_synced += 1
            if res.get("mail_platform"):
                mail_synced += 1
            if res.get("profile"):
                profile_synced += 1

        conn.commit()

    return {
        "success": True,
        "synced_count": synced_count,
        "fb_synced": fb_synced,
        "mail_synced": mail_synced,
        "profile_synced": profile_synced,
        "message": f"Đã đồng bộ {synced_count} tài khoản sang: Quản Lý Nick FB ({fb_synced}), Simple FB Pro, Mail ({mail_synced}), và Hồ Sơ Antidetect ({profile_synced})!"
    }


@fb_reg_router.get("/export")
async def export_reg_accounts(format_type: str = "uid_pass_2fa_cookie"):
    """
    Xuất file tài khoản theo các định dạng thông dụng:
    - uid_pass
    - uid_pass_2fa
    - uid_pass_2fa_cookie
    - uid_pass_2fa_cookie_token
    - full_pipe
    - json
    """
    with closing(connect_db(DB_PATH)) as conn, conn:
        conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
        cursor = conn.cursor()
        rows = cursor.execute("SELECT * FROM fb_reg_accounts ORDER BY id DESC").fetchall()

    lines = []
    for r in rows:
        uid = r.get("uid", "")
        pwd = decrypted(r.get("password", ""))
        twofa = decrypted(r.get("code2fa", ""))
        cookie = decrypted(r.get("cookie", ""))
        token = decrypted(r.get("token", ""))
        mail = r.get("mail", "")
        pass_mail = decrypted(r.get("pass_mail", ""))

        if format_type == "uid_pass":
            lines.append(f"{uid}|{pwd}")
        elif format_type == "uid_pass_2fa":
            lines.append(f"{uid}|{pwd}|{twofa}")
        elif format_type == "uid_pass_2fa_cookie":
            lines.append(f"{uid}|{pwd}|{twofa}|{cookie}")
        elif format_type == "uid_pass_2fa_cookie_token":
            lines.append(f"{uid}|{pwd}|{twofa}|{cookie}|{token}")
        elif format_type == "full_pipe":
            lines.append(f"{uid}|{pwd}|{twofa}|{cookie}|{token}|{mail}|{pass_mail}")

    if format_type == "json":
        export_data = []
        for r in rows:
            export_data.append({
                "uid": r.get("uid"),
                "name": r.get("name"),
                "gender": r.get("gender"),
                "password": decrypted(r.get("password")),
                "code2fa": decrypted(r.get("code2fa")),
                "cookie": decrypted(r.get("cookie")),
                "token": decrypted(r.get("token")),
                "mail": r.get("mail"),
                "pass_mail": decrypted(r.get("pass_mail")),
                "status": r.get("status"),
                "created_at": r.get("created_at")
            })
        return Response(content=json.dumps(export_data, indent=2, ensure_ascii=False), media_type="application/json")

    return Response(content="\n".join(lines), media_type="text/plain; charset=utf-8")


# -----------------------------------------------------------------------------
# Live Verification Testing Sandbox (Thử nghiệm Mail & Phone)
# -----------------------------------------------------------------------------

@fb_reg_router.get("/dongvan-types")
async def get_dongvan_types(api_key: str = ""):
    """Tra cứu danh sách các loại mail và số lượng tồn kho thực tế từ dongvanfb.net"""
    key = (api_key or "").strip() or key_vault.get_key("mail.dongvanfb")
    client = DongVanFbClient(api_key=key)
    types_res = await client.get_account_types()
    bal_res = await client.check_balance()
    return {
        "success": types_res.get("success", False),
        "balance": bal_res.get("balance", 0) if bal_res.get("success") else None,
        "types": types_res.get("types", []),
        "message": types_res.get("message", "")
    }


@fb_reg_router.post("/verify-mail-test")
async def test_verify_mail_provider(req: VerifyMailTestRequest):
    """Thử nghiệm lấy email & tra cứu số dư từ nhà cung cấp Mail"""
    if req.provider == "DongVanFb":
        # Khoá lấy từ kho chung; chỉ dùng khoá gửi kèm khi người dùng đang thử một khoá mới.
        client = DongVanFbClient(api_key=req.api_key.strip() or key_vault.get_key("mail.dongvanfb"),
                                 folder_id=req.folder_id)
        bal_res = await client.check_balance()
        mail_res = await client.get_new_mail()
        return {
            "success": mail_res.get("success", False),
            "balance_info": bal_res,
            "mail_info": mail_res,
            "message": mail_res.get("message") if not mail_res.get("success") else "Thành công"
        }
    elif req.provider == "10MinuteMail":
        client = TenMinuteMailClient()
        res = await client.get_new_mail()
        return {
            "success": res.get("success", False),
            "mail_info": res,
            "message": res.get("message") if not res.get("success") else "Lấy mail 10 phút thành công"
        }
    else:
        # Random mock
        email = RandomFacebookIdentityGenerator.random_email_from_name("Nguyễn Văn A")
        return {
            "success": True,
            "mail_info": {"email": email, "provider": req.provider, "note": "Cổng mail giả lập (Random)"},
            "message": "Sinh mail ảo ngẫu nhiên thành công"
        }


@fb_reg_router.post("/verify-phone-test")
async def test_verify_phone_provider(req: VerifyPhoneTestRequest):
    """Thử nghiệm lấy số điện thoại từ nhà cung cấp Phone"""
    if req.provider == "FunOtp":
        client = FunOtpClient(api_key=req.api_key.strip() or key_vault.get_key("otp.funotp"),
                              service=req.service, country=req.country)
        res = await client.get_new_phone()
        return res
    else:
        phone = RandomFacebookIdentityGenerator.random_vietnamese_phone()
        return {
            "success": True,
            "phone": phone,
            "note": "Số điện thoại giả lập theo đầu số VN (Random)"
        }


# -----------------------------------------------------------------------------
# Email Store (Kho Hotmail / Outlook / TikTok Mail) Endpoints
# -----------------------------------------------------------------------------

@fb_reg_router.get("/email-store/stats")
async def get_email_store_stats():
    """Thống kê kho email: tổng số, khả dụng (Ready), đang dùng (In-Use), đã dùng (Used), lỗi (Error)"""
    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM fb_email_store")
        total = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM fb_email_store WHERE status = 'Ready'")
        ready = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM fb_email_store WHERE status = 'In-Use'")
        in_use = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM fb_email_store WHERE status = 'Used'")
        used = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM fb_email_store WHERE status = 'Error'")
        error = cursor.fetchone()[0]
        return {
            "total": total,
            "ready": ready,
            "in_use": in_use,
            "used": used,
            "error": error
        }


@fb_reg_router.get("/email-store")
async def list_email_store(page: int = 1, limit: int = 50, status: str = "", search: str = ""):
    """Lấy danh sách email trong kho có phân trang và bộ lọc"""
    page = max(1, page)
    limit = max(1, min(200, limit))
    offset = (page - 1) * limit

    conditions = []
    params = []

    if status and status != "Tất cả":
        conditions.append("status = ?")
        params.append(status)
    if search:
        conditions.append("(email LIKE ? OR source LIKE ? OR used_for LIKE ?)")
        kw = f"%{search.strip()}%"
        params.extend([kw, kw, kw])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM fb_email_store {where_clause}", params)
        total = cursor.fetchone()[0]

        cursor.execute(f"""
            SELECT id, email, pass_mail, refresh_token, client_id, source, status, used_for, created_at, last_used_at
            FROM fb_email_store
            {where_clause}
            ORDER BY id ASC
            LIMIT ? OFFSET ?
        """, (*params, limit, offset))
        rows = cursor.fetchall()

        items = []
        for r in rows:
            em_id, email, enc_pass, enc_token, client_id, source, st, used_for, c_at, l_at = r
            has_pass = bool(enc_pass)
            has_token = bool(enc_token)
            token_preview = ""
            if has_token:
                try:
                    dec = decrypted(enc_token)
                    token_preview = dec[:8] + "..." + dec[-6:] if len(dec) > 16 else "***"
                except Exception:
                    token_preview = "***"

            items.append({
                "id": em_id,
                "email": email,
                "has_pass": has_pass,
                "has_token": has_token,
                "token_preview": token_preview,
                "client_id": client_id,
                "source": source,
                "status": st,
                "used_for": used_for,
                "created_at": c_at,
                "last_used_at": l_at
            })

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "items": items
        }


@fb_reg_router.post("/email-store/import")
async def import_email_store(req: EmailStoreImportRequest):
    """Nhập danh sách email (hỗ trợ định dạng TikTok id|pass|email|passmail|token|clientId hoặc email|passmail|token|clientId)"""
    lines = [l.strip() for l in req.raw_text.splitlines() if l.strip()]
    if not lines:
        return {"success": False, "message": "Không có nội dung để nhập"}

    imported_count = 0
    duplicate_count = 0
    invalid_count = 0
    now = int(time.time())

    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()

        for line in lines:
            parts = line.split("|")
            email = ""
            pass_mail = ""
            refresh_token = ""
            client_id = "9e5f94bc-e8a4-4e73-b8be-63364c29d753"

            # Tìm vị trí email
            email_idx = -1
            for i, p in enumerate(parts):
                if "@" in p and "." in p:
                    email_idx = i
                    break

            if email_idx == -1:
                invalid_count += 1
                continue

            email = parts[email_idx].strip().lower()
            if len(parts) > email_idx + 1:
                pass_mail = parts[email_idx + 1].strip()
            if len(parts) > email_idx + 2:
                refresh_token = parts[email_idx + 2].strip()
            if len(parts) > email_idx + 3:
                c_id = parts[email_idx + 3].strip()
                if len(c_id) > 10 and "-" in c_id:
                    client_id = c_id

            # Kiểm tra tồn tại
            cursor.execute("SELECT id FROM fb_email_store WHERE email = ?", (email,))
            if cursor.fetchone():
                duplicate_count += 1
                continue

            enc_pass = encrypted(pass_mail) if pass_mail else ""
            enc_token = encrypted(refresh_token) if refresh_token else ""

            cursor.execute("""
                INSERT INTO fb_email_store (email, pass_mail, refresh_token, client_id, source, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'Ready', ?)
            """, (email, enc_pass, enc_token, client_id, req.source, now))
            imported_count += 1

        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM fb_email_store")
        total = cursor.fetchone()[0]

    return {
        "success": True,
        "imported": imported_count,
        "duplicates": duplicate_count,
        "invalid": invalid_count,
        "total": total,
        "message": f"Đã nhập {imported_count} email thành công (Trùng: {duplicate_count}, Không hợp lệ: {invalid_count})"
    }


@fb_reg_router.post("/email-store/reset-status")
async def reset_email_store_status(req: EmailStoreResetRequest):
    """Đặt lại trạng thái của email (ví dụ từ Used hoặc Error về Ready)"""
    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()
        target = req.target_status or "Ready"
        if req.ids and len(req.ids) > 0:
            placeholders = ",".join("?" * len(req.ids))
            cursor.execute(f"UPDATE fb_email_store SET status = ?, used_for = '' WHERE id IN ({placeholders})", (target, *req.ids))
            updated = cursor.rowcount
        else:
            cursor.execute("UPDATE fb_email_store SET status = ?, used_for = '' WHERE status != 'Ready'", (target,))
            updated = cursor.rowcount
        conn.commit()

    return {"success": True, "updated": updated, "message": f"Đã đặt lại trạng thái '{target}' cho {updated} tài khoản"}


@fb_reg_router.post("/email-store/delete")
async def delete_email_store_items(req: EmailStoreDeleteRequest):
    """Xóa tài khoản khỏi kho email"""
    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()
        if req.delete_all:
            cursor.execute("DELETE FROM fb_email_store")
            deleted = cursor.rowcount
        elif req.ids:
            placeholders = ",".join("?" * len(req.ids))
            cursor.execute(f"DELETE FROM fb_email_store WHERE id IN ({placeholders})", req.ids)
            deleted = cursor.rowcount
        else:
            return {"success": False, "message": "Chưa chọn tài khoản cần xóa"}
        conn.commit()

    return {"success": True, "deleted": deleted, "message": f"Đã xóa {deleted} tài khoản khỏi kho"}


@fb_reg_router.post("/email-store/test-otp")
async def test_email_store_otp(req: EmailStoreTestOtpRequest):
    """Thử nghiệm đọc tin nhắn/OTP mới nhất cho 1 email trong kho (kết hợp quy-tool fast API + IMAP XOAUTH2)"""
    record = None
    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()
        if req.id:
            cursor.execute("SELECT id, email, pass_mail, refresh_token, client_id FROM fb_email_store WHERE id = ?", (req.id,))
            record = cursor.fetchone()
        elif req.email and not req.refresh_token:
            cursor.execute("SELECT id, email, pass_mail, refresh_token, client_id FROM fb_email_store WHERE email = ?", (req.email.lower().strip(),))
            record = cursor.fetchone()
        elif req.refresh_token:
            record = (0, req.email or "", req.pass_mail or "", req.refresh_token, req.client_id or "9e5f94bc-e8a4-4e73-b8be-63364c29d753")
        else:
            cursor.execute("SELECT id, email, pass_mail, refresh_token, client_id FROM fb_email_store ORDER BY id ASC LIMIT 1")
            record = cursor.fetchone()

    if not record:
        return {"success": False, "message": "Không tìm thấy tài khoản email trong kho"}

    em_id, email, enc_pass, enc_token, client_id = record
    if not enc_token and not req.refresh_token:
        return {"success": False, "email": email, "message": "Tài khoản không có Refresh Token để xác thực OAuth2"}

    refresh_token = req.refresh_token if (req.refresh_token and req.refresh_token != enc_token) else decrypted(enc_token)
    pass_mail = req.pass_mail if req.pass_mail else decrypted(enc_pass)

    client = MicrosoftImapOAuth2Client(
        email=email,
        refresh_token=refresh_token,
        client_id=client_id or "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
        pass_mail=pass_mail,
        on_token_refresh=update_store_email_token
    )

    # 1. Thử lấy mã siêu tốc qua get_code_oauth2 (quy-tool fast API)
    fast_res = await client.try_get_otp_fast_api(filter_type="facebook")
    if not fast_res:
        fast_res = await client.try_get_otp_fast_api(filter_type="any")

    # 2. Đọc trực tiếp qua Microsoft IMAP XOAUTH2
    access_token = await client.get_access_token()
    messages = []
    found_otp = None
    if access_token:
        import asyncio
        loop = asyncio.get_running_loop()
        messages = await loop.run_in_executor(None, client._sync_read_imap, access_token)
        for m in messages:
            combined = f"{m.get('subject', '')} {m.get('body', '')}"
            codes = re.findall(r'\b\d{5,8}\b', combined)
            if codes:
                found_otp = codes[0]
                break

    if fast_res and fast_res.get("success"):
        final_otp = fast_res.get("otp")
        method = "DongVanFb OAuth2 Proxy (quy-tool)"
    elif found_otp:
        final_otp = found_otp
        method = "Direct Microsoft IMAP XOAUTH2"
    else:
        final_otp = None
        method = "Chưa phát hiện mã"

    return {
        "success": True,
        "email": email,
        "token_acquired": bool(access_token),
        "found_otp": final_otp,
        "method": method,
        "fast_api_result": fast_res,
        "inbox_count": len(messages),
        "recent_messages": messages[:5],
        "message": f"Đọc mail thành công qua {method}! Mã OTP: {final_otp or 'Chưa có thư OTP mới'}"
    }


@fb_reg_router.get("/email-store/export")
async def export_email_store(format_type: str = "full", status: str = ""):
    """Xuất file danh sách email trong kho (full, simple, hoặc json)"""
    conditions = []
    params = []
    if status and status != "Tất cả":
        conditions.append("status = ?")
        params.append(status)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with closing(connect_db(DB_PATH)) as conn, conn:
        init_fb_reg_db(conn)
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT email, pass_mail, refresh_token, client_id, source, status, used_for
            FROM fb_email_store
            {where_clause}
            ORDER BY id ASC
        """, params)
        rows = cursor.fetchall()

    if format_type == "json":
        data = []
        for r in rows:
            data.append({
                "email": r[0],
                "pass_mail": decrypted(r[1]),
                "refresh_token": decrypted(r[2]),
                "client_id": r[3],
                "source": r[4],
                "status": r[5],
                "used_for": r[6]
            })
        return Response(content=json.dumps(data, indent=2, ensure_ascii=False), media_type="application/json")

    lines = []
    for r in rows:
        email = r[0]
        pass_mail = decrypted(r[1])
        refresh_token = decrypted(r[2])
        client_id = r[3] or "9e5f94bc-e8a4-4e73-b8be-63364c29d753"

        if format_type == "simple":
            lines.append(f"{email}|{pass_mail}")
        else:
            lines.append(f"{email}|{pass_mail}|{refresh_token}|{client_id}")

    return Response(
        content="\n".join(lines),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=store_emails_{format_type}.txt"}
    )
