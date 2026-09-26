"""
API nuôi nick — tầng REST cho bản port nuoinickbaosam 11.10.14.

Mở ba nhóm chức năng của bản gốc: quản lý nick và thư mục, kịch bản AI Vision,
và điều khiển trình duyệt antidetect (GPM / OMO) qua Playwright.
"""

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel, Field

try:
    from bkt_web import nuoinick_db as db
    from bkt_web import nuoinick_proxy as proxy_mod
    from bkt_web import sheets_sync
    from bkt_web import vpn_bridge
    from bkt_web.ai_vision import AiVisionFlowStep, AiVisionSettings, AiVisionError
    from bkt_web.browser_engine import (
        AntidetectBrowserClient, AntidetectSettings, connect_playwright, get_2fa,
        start_native_profile, stop_native_profile, is_native_profile_running,
        get_native_profile_cookies, set_native_profile_cookies,
        capture_native_facebook_session, load_native_profile_cookies,
        persist_native_profile_cookies,
        arrange_running_windows, sync_broadcast_action,
        get_browser_cores, check_core_updates_online, start_core_download, get_download_progress
    )
    from bkt_web.chrome_runner import run_flow
    from bkt_web.db_utils import connect_db
    from bkt_web.fingerprint import generate_random_fingerprint_dict
    from bkt_web.security import SecretStore
    from bkt_web.facebook_session import (
        cookie_header_to_playwright,
        cookies_to_header,
        sync_session_cookie,
        validate_session_cookies,
    )
    from bkt_web import key_vault
except ImportError:
    import nuoinick_db as db
    import nuoinick_proxy as proxy_mod
    import sheets_sync
    import vpn_bridge
    from ai_vision import AiVisionFlowStep, AiVisionSettings, AiVisionError
    from browser_engine import (
        AntidetectBrowserClient, AntidetectSettings, connect_playwright, get_2fa,
        start_native_profile, stop_native_profile, is_native_profile_running,
        get_native_profile_cookies, set_native_profile_cookies,
        capture_native_facebook_session, load_native_profile_cookies,
        persist_native_profile_cookies,
        arrange_running_windows, sync_broadcast_action,
        get_browser_cores, check_core_updates_online, start_core_download, get_download_progress
    )
    from chrome_runner import run_flow
    from db_utils import connect_db
    from fingerprint import generate_random_fingerprint_dict
    from security import SecretStore
    from facebook_session import (
        cookie_header_to_playwright,
        cookies_to_header,
        sync_session_cookie,
        validate_session_cookies,
    )
    import key_vault

nn_router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")
SETTINGS_PATH = BASE_DIR / "nuoinick_settings.json"

# Cột không bao giờ trả nguyên văn ra API
MASKED_COLUMNS = ("Pass", "TwoFA", "Token", "Cookie", "PassMail", "PassMailKhoiPhuc")


def encrypted(value: Optional[str]) -> str:
    return SECRET_STORE.encrypt((value or "").strip())


def decrypted(value: Optional[str]) -> str:
    return SECRET_STORE.decrypt(value or "")


def _facebook_cookie_jar(cookie_header: str) -> List[Dict[str, Any]]:
    """Đổi cookie dạng header thành cookie jar để nạp vào native profile."""
    return cookie_header_to_playwright(cookie_header)


def _conn():
    conn = connect_db(DB_PATH)
    db.ensure_created(conn)
    return conn


def _mask_row(row: Dict[str, Any], reveal: bool = False) -> Dict[str, Any]:
    out = dict(row)
    if not reveal:
        for col in MASKED_COLUMNS:
            out[col] = "***" if out.get(col) else ""
    return out


def _load_settings() -> Dict[str, Any]:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_settings(data: Dict[str, Any]) -> None:
    # Mở file với quyền 0600 ngay từ đầu; chmod sau khi ghi để lại một khe thời
    # gian file chứa API key nằm ở quyền mặc định 0644.
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    fd = os.open(SETTINGS_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(payload)
    try:
        SETTINGS_PATH.chmod(0o600)
    except OSError:
        pass


# Trường key trong AiVisionSettings <-> tên khoá trong kho chung
AI_KEY_FIELDS = {
    "api_key": "ai.claude",
    "google_api_key": "ai.gemini",
    "hhtech_api_key": "ai.hhtech",
    "vietapi_key": "ai.vietapi",
    "custom_api_key": "ai.custom",
}


def ai_settings() -> AiVisionSettings:
    """
    Cấu hình AI Vision: phần không bí mật đọc từ nuoinick_settings.json, còn
    API key luôn lấy từ kho khoá chung để cả ứng dụng chỉ có một chỗ nhập.
    """
    data = dict(_load_settings().get("ai_vision", {}))
    for field in AI_KEY_FIELDS:
        data.pop(field, None)
    settings = AiVisionSettings.from_dict(data)
    stored = key_vault.get_keys(*AI_KEY_FIELDS.values())
    for field, key_name in AI_KEY_FIELDS.items():
        setattr(settings, field, stored.get(key_name, ""))
    return settings


def browser_settings() -> AntidetectSettings:
    return AntidetectSettings.from_dict(_load_settings().get("browser", {}))


# ------------------------------------------------------------------ schemas

class FolderCreate(BaseModel):
    platform: str = "Facebook"
    name: str


class FolderRename(BaseModel):
    platform: str = "Facebook"
    name: str


class ImportRequest(BaseModel):
    platform: str = "Facebook"
    folder_id: int = 0
    raw_data: str
    separator: str = "|"


class AccountIdsRequest(BaseModel):
    platform: str = "Facebook"
    account_ids: List[int] = Field(default_factory=list)


class BulkUpdateRequest(AccountIdsRequest):
    changes: Dict[str, Any] = Field(default_factory=dict)


class AssignScriptRequest(AccountIdsRequest):
    script_id: int


class MoveFolderRequest(AccountIdsRequest):
    folder_id: int


class VpnAssignRequest(AccountIdsRequest):
    country: str = "US"
    # Bỏ trống thì mỗi nick được bốc ngẫu nhiên một server trong quốc gia đó
    vpn_config: str = ""


class ScriptCreate(BaseModel):
    name: str
    platform: str = "Chrome"


class ScriptRename(BaseModel):
    name: str


class FlowSave(BaseModel):
    flow: List[Dict[str, Any]] = Field(default_factory=list)


class ActionToggle(BaseModel):
    action_id: int
    included: bool


class SettingsSave(BaseModel):
    ai_vision: Optional[Dict[str, Any]] = None
    browser: Optional[Dict[str, Any]] = None


class RunFlowRequest(BaseModel):
    platform: str = "Facebook"
    account_id: int
    script_id: int
    variables: Dict[str, str] = Field(default_factory=dict)


# ------------------------------------------------------------------ folders

@nn_router.get("/folders")
def list_folders(platform: str = "Facebook"):
    conn = _conn()
    try:
        return {"folders": db.load_folders(conn, platform)}
    finally:
        conn.close()


@nn_router.post("/folders")
def create_folder(req: FolderCreate):
    conn = _conn()
    try:
        return db.create_folder(conn, req.platform, req.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@nn_router.put("/folders/{folder_id}")
def rename_folder(folder_id: int, req: FolderRename):
    conn = _conn()
    try:
        db.rename_folder(conn, req.platform, folder_id, req.name)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@nn_router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, platform: str = "Facebook"):
    conn = _conn()
    try:
        db.delete_folder(conn, platform, folder_id)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


# ----------------------------------------------------------------- accounts

@nn_router.get("/accounts/stats")
def get_accounts_stats():
    conn = _conn()
    try:
        stats = {}
        for p in db.PLATFORMS:
            c = conn.cursor()
            table = f"{p}Accounts"
            try:
                c.execute(f"SELECT COUNT(*) FROM {table}")
                stats[p] = c.fetchone()[0]
            except Exception:
                stats[p] = 0
        return {"stats": stats}
    finally:
        conn.close()


@nn_router.get("/accounts")
def list_accounts(
    platform: str = "Facebook",
    folder_id: Optional[int] = None,
    search: Optional[str] = None,
    reveal: bool = False,
):
    conn = _conn()
    try:
        rows = db.load_accounts(conn, platform, decrypted, folder_id, search)
        return {"accounts": [_mask_row(r, reveal) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@nn_router.post("/accounts/import")
def import_accounts(req: ImportRequest):
    parsed = db.parse_import_lines(req.raw_data, req.separator)
    if not parsed["rows"]:
        raise HTTPException(status_code=400, detail="Không có dòng nào hợp lệ để nhập")
    conn = _conn()
    try:
        folder_id = req.folder_id or db.default_folder_id(conn, req.platform)
        inserted = db.insert_accounts(conn, req.platform, parsed["rows"], encrypted, folder_id)
        db.reindex(conn, req.platform)
        return {"success": True, "imported": inserted, "skipped": len(parsed["skipped"])}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@nn_router.post("/accounts/bulk-update")
def bulk_update_accounts(req: BulkUpdateRequest):
    if not req.account_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn nick nào")
    conn = _conn()
    try:
        return {"success": True, "updated": db.bulk_update(conn, req.platform, req.account_ids, req.changes, encrypted)}
    finally:
        conn.close()


@nn_router.post("/accounts/assign-script")
def assign_script(req: AssignScriptRequest):
    if not req.account_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn nick nào")
    conn = _conn()
    try:
        return {"success": True, "updated": db.assign_script(conn, req.platform, req.account_ids, req.script_id)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@nn_router.post("/accounts/move-folder")
def move_folder(req: MoveFolderRequest):
    if not req.account_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn nick nào")
    conn = _conn()
    try:
        return {"success": True, "updated": db.move_to_folder(conn, req.platform, req.account_ids, req.folder_id)}
    finally:
        conn.close()


@nn_router.post("/accounts/assign-vpn")
def assign_vpn(req: VpnAssignRequest):
    """Gán một server WireGuard cho từng nick đã chọn."""
    if not req.account_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn nick nào để gán VPN")
    conn = _conn()
    try:
        country = (req.country or vpn_bridge.DEFAULT_COUNTRY).upper()
        for account_id in req.account_ids:
            if req.vpn_config:
                conf, label = req.vpn_config, vpn_bridge.location_label(req.vpn_config)
            else:
                conf, label = vpn_bridge.pick_config(country)
            db.update_account(
                conn, req.platform, account_id,
                {"VpnConfig": conf, "VpnLocation": label, "Country": country}, encrypted,
            )
        return {"success": True, "assigned": len(req.account_ids)}
    except vpn_bridge.VpnError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@nn_router.post("/accounts/delete")
def delete_accounts(req: AccountIdsRequest):
    if not req.account_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn nick nào")
    conn = _conn()
    try:
        deleted = db.delete_accounts(conn, req.platform, req.account_ids)
        db.reindex(conn, req.platform)
        return {"success": True, "deleted": deleted}
    finally:
        conn.close()


@nn_router.get("/accounts/export")
def export_accounts(
    platform: str = "Facebook",
    fields: str = "Uid,Pass,TwoFA,Token,Cookie,Mail,PassMail,MailKhoiPhuc,VpnLocation",
    folder_id: Optional[int] = None,
    separator: str = "|",
):
    conn = _conn()
    try:
        rows = db.load_accounts(conn, platform, decrypted, folder_id)
        chosen = [f.strip() for f in fields.split(",") if f.strip()]
        return {"content": db.export_accounts(rows, chosen, separator), "count": len(rows)}
    finally:
        conn.close()


@nn_router.post("/accounts/{account_id}/2fa")
def account_2fa(account_id: int, platform: str = "Facebook"):
    """Sinh mã 2FA tại chỗ từ seed đã lưu; seed không rời khỏi máy."""
    conn = _conn()
    try:
        rows = db.load_accounts(conn, platform, decrypted)
        row = next((r for r in rows if r["Id"] == account_id), None)
        if row is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy nick")
        code = get_2fa(row.get("TwoFA", ""))
        if not code:
            raise HTTPException(status_code=400, detail="Nick này chưa có mã 2FA hợp lệ")
        return {"success": True, "code": code}
    finally:
        conn.close()


@nn_router.post("/accounts/{account_id}/open-profile")
async def open_account_profile(account_id: int, platform: str = "Facebook"):
    """Mở đúng native profile của nick, cùng VPN và phiên Facebook đã lưu."""
    if platform != "Facebook":
        raise HTTPException(status_code=400, detail="Chức năng mở phiên hiện chỉ hỗ trợ Facebook")

    conn = _conn()
    try:
        rows = db.load_accounts(conn, platform, decrypted)
        account = next((row for row in rows if row["Id"] == account_id), None)
        if account is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy nick")
        if not account.get("VpnConfig"):
            raise HTTPException(status_code=409, detail="Nick chưa được gán VPN")

        try:
            socks_url = vpn_bridge.open_tunnel(
                vpn_bridge.SCOPE_NUOINICK,
                account_id,
                account["VpnConfig"],
            )
        except vpn_bridge.VpnError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        profile_id = account.get("BrowserProfileId") or f"fb-{account.get('Uid') or account_id}"
        profile = db.get_browser_profile(conn, profile_id) or {
            "Id": profile_id,
            "Name": account.get("HoTen") or account.get("Uid") or f"Facebook {account_id}",
            "GroupId": "Facebook",
            "BrowserName": "Chrome",
            "BrowserVersion": "128",
            "OsType": 1,
        }

        database_cookies = _facebook_cookie_jar(account.get("Cookie", ""))
        stored_cookies = load_native_profile_cookies(profile_id)
        stored_valid, _, _ = validate_session_cookies(stored_cookies, account.get("Uid"))
        database_valid, _, _ = validate_session_cookies(database_cookies, account.get("Uid"))
        cookie_jar = stored_cookies if stored_valid else database_cookies
        has_session = stored_valid or database_valid
        session_source = "profile" if stored_valid else ("database" if database_valid else "none")
        if stored_valid and not database_valid:
            sync_session_cookie(
                conn,
                str(account.get("Uid") or ""),
                cookies_to_header(stored_cookies),
                encrypted,
            )
        profile.update({
            "RawProxy": socks_url,
            "StartupUrls": (
                "https://www.facebook.com/me"
                if has_session else "https://www.facebook.com/login"
            ),
            "Note": (
                f"Facebook UID {account.get('Uid', '')} · VPN "
                f"{account.get('VpnLocation') or account.get('VpnConfig')}"
            ),
            "Status": "idle",
        })
        db.save_browser_profile(conn, profile)
        account_changes = {"BrowserProfileId": profile_id}
        if not has_session:
            account_changes.update({
                "TrangThai": "Thiếu phiên đăng nhập",
                "TinhTrang": "Cookie Facebook thiếu c_user/xs",
            })
        db.update_account(
            conn,
            platform,
            account_id,
            account_changes,
            encrypted,
        )
    finally:
        conn.close()

    if has_session:
        persist_native_profile_cookies(profile_id, cookie_jar)

    if is_native_profile_running(profile_id):
        await stop_native_profile(profile_id)
    try:
        result = await start_native_profile(profile, headless=False)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Không mở được profile Facebook: {exc}")

    session_detail = ""
    if has_session:
        verified = await capture_native_facebook_session(
            profile_id,
            str(account.get("Uid") or ""),
            verify_page=True,
        )
        session_detail = verified.get("message", "")
        has_session = bool(verified.get("valid"))
        conn = _conn()
        try:
            if has_session:
                sync_session_cookie(
                    conn,
                    str(account.get("Uid") or ""),
                    verified["cookie_header"],
                    encrypted,
                )
            else:
                db.update_account(
                    conn,
                    platform,
                    account_id,
                    {"TrangThai": "Phiên đăng nhập hết hạn", "TinhTrang": session_detail},
                    encrypted,
                )
        finally:
            conn.close()

    return {
        "success": True,
        "profile_id": profile_id,
        "session_restored": has_session,
        "session_verified": has_session,
        "session_source": session_source,
        "vpn_location": account.get("VpnLocation", ""),
        "message": (
            "Đã mở và xác minh đúng phiên Facebook bằng profile và VPN của nick."
            if has_session
            else "Đã mở trang đăng nhập bằng đúng profile và VPN. Phiên hiện chưa hợp lệ; hãy đăng nhập rồi bấm Lưu Phiên."
        ),
        "session_detail": session_detail,
        **result,
    }


@nn_router.post("/accounts/{account_id}/session/capture")
async def capture_account_profile_session(account_id: int, platform: str = "Facebook"):
    if platform != "Facebook":
        raise HTTPException(status_code=400, detail="Chức năng lưu phiên hiện chỉ hỗ trợ Facebook")
    conn = _conn()
    try:
        account = next(
            (row for row in db.load_accounts(conn, platform, decrypted) if row["Id"] == account_id),
            None,
        )
    finally:
        conn.close()
    if not account:
        raise HTTPException(status_code=404, detail="Không tìm thấy nick")

    uid = str(account.get("Uid") or "").strip()
    profile_id = account.get("BrowserProfileId") or f"fb-{uid or account_id}"
    captured = await capture_native_facebook_session(profile_id, uid, verify_page=True)
    if not captured.get("valid"):
        raise HTTPException(status_code=409, detail=captured.get("message") or "Phiên chưa hợp lệ")

    conn = _conn()
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


@nn_router.post("/accounts/{account_id}/close-profile")
async def close_account_profile(account_id: int, platform: str = "Facebook"):
    conn = _conn()
    try:
        account = next(
            (row for row in db.load_accounts(conn, platform, decrypted) if row["Id"] == account_id),
            None,
        )
    finally:
        conn.close()
    if not account:
        raise HTTPException(status_code=404, detail="Không tìm thấy nick")
    profile_id = account.get("BrowserProfileId") or f"fb-{account.get('Uid') or account_id}"
    saved = False
    detail = ""
    try:
        result = await capture_account_profile_session(account_id, platform)
        saved = True
        detail = result["message"]
    except HTTPException as exc:
        detail = str(exc.detail)
    stopped = await stop_native_profile(profile_id)
    vpn_bridge.close_tunnel(vpn_bridge.SCOPE_NUOINICK, account_id)
    return {
        "success": True,
        "session_saved": saved,
        "profile_stopped": stopped,
        "message": "Đã lưu phiên, đóng profile và ngắt VPN." if saved else f"Đã đóng profile và ngắt VPN. Chưa lưu được phiên: {detail}",
    }


# ---------------------------------------------------------------------- vpn

@nn_router.get("/vpn/stats")
def nn_vpn_stats():
    return vpn_bridge.stats()


@nn_router.get("/vpn/catalog/{country}")
def nn_vpn_catalog(country: str):
    catalog = vpn_bridge.catalog()
    code = country.strip().upper()
    if code not in catalog:
        raise HTTPException(status_code=404, detail=f"Không có config cho quốc gia {code}")
    return {"country": code, "configs": catalog[code]}


@nn_router.post("/vpn/test/{account_id}")
def nn_vpn_test(account_id: int, platform: str = "Facebook"):
    """Bật tunnel của nick rồi kiểm tra IP thực sự đi ra."""
    conn = _conn()
    try:
        rows = db.load_accounts(conn, platform, decrypted)
        row = next((r for r in rows if r["Id"] == account_id), None)
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy nick")
    if not row.get("VpnConfig"):
        raise HTTPException(status_code=400, detail="Nick này chưa được gán VPN")
    try:
        result = vpn_bridge.test_exit_ip(row["VpnConfig"])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không kiểm tra được VPN: {exc}")
    return {"success": True, "location": row.get("VpnLocation", ""), **result}


@nn_router.post("/vpn/disconnect/{account_id}")
def nn_vpn_disconnect(account_id: int):
    vpn_bridge.close_tunnel(vpn_bridge.SCOPE_NUOINICK, account_id)
    return {"success": True}


# ------------------------------------------------------------------ actions

@nn_router.get("/actions")
def list_actions(platform: Optional[str] = None):
    conn = _conn()
    try:
        return {"actions": db.load_actions(conn, platform)}
    finally:
        conn.close()


# ------------------------------------------------------------------ scripts

@nn_router.get("/scripts")
def list_scripts(platform: Optional[str] = None):
    conn = _conn()
    try:
        return {"scripts": db.load_script_folders(conn, platform)}
    finally:
        conn.close()


@nn_router.post("/scripts")
def create_script(req: ScriptCreate):
    conn = _conn()
    try:
        return db.create_script_folder(conn, req.name, req.platform)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@nn_router.put("/scripts/{script_id}")
def rename_script(script_id: int, req: ScriptRename):
    conn = _conn()
    try:
        db.rename_script_folder(conn, script_id, req.name)
        return {"success": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        conn.close()


@nn_router.delete("/scripts/{script_id}")
def delete_script(script_id: int):
    conn = _conn()
    try:
        db.delete_script_folder(conn, script_id)
        return {"success": True}
    finally:
        conn.close()


@nn_router.put("/scripts/{script_id}/flow")
def save_flow(script_id: int, req: FlowSave):
    """Chuẩn hoá từng bước qua AiVisionFlowStep trước khi lưu để loại trường lạ."""
    normalized = [AiVisionFlowStep.from_dict(s).to_dict() for s in req.flow]
    conn = _conn()
    try:
        db.save_script_flow(conn, script_id, normalized)
        return {"success": True, "steps": len(normalized)}
    finally:
        conn.close()


@nn_router.get("/scripts/{script_id}/actions")
def script_actions(script_id: int):
    conn = _conn()
    try:
        return {"action_ids": db.load_action_ids_for_folder(conn, script_id)}
    finally:
        conn.close()


@nn_router.post("/scripts/{script_id}/actions")
def toggle_script_action(script_id: int, req: ActionToggle):
    conn = _conn()
    try:
        db.set_action_in_folder(conn, script_id, req.action_id, req.included)
        return {"success": True}
    finally:
        conn.close()


# ----------------------------------------------------------------- settings

@nn_router.get("/settings")
def get_settings():
    """Không bao giờ trả API key nguyên văn ra ngoài."""
    return {"ai_vision": ai_settings().redacted(), "browser": browser_settings().__dict__}


@nn_router.put("/settings")
def put_settings(req: SettingsSave):
    current = _load_settings()
    if req.ai_vision is not None:
        merged = dict(current.get("ai_vision", {}))
        # Giữ tương thích với client cũ nhưng không bao giờ ghi key vào JSON:
        # nếu client gửi key thì chuyển thẳng vào kho chung.
        for key, value in req.ai_vision.items():
            if key in AI_KEY_FIELDS:
                if value and value != "***":
                    key_vault.set_key(AI_KEY_FIELDS[key], str(value))
                continue
            if value == "***":
                continue
            merged[key] = value
        # Dọn cả key plaintext còn sót từ các phiên bản trước.
        for key in AI_KEY_FIELDS:
            merged.pop(key, None)
        current["ai_vision"] = merged
    if req.browser is not None:
        current["browser"] = {**current.get("browser", {}), **req.browser}
    _save_settings(current)
    return {"success": True}


# ------------------------------------------------------------------ browser

@nn_router.get("/browser/ping")
async def browser_ping():
    client = AntidetectBrowserClient(browser_settings())
    try:
        return {"success": True, "engine": client.name, **await client.ping()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không kết nối được {client.name}: {exc}")


@nn_router.get("/browser/profiles")
async def browser_profiles(page: int = 1, page_size: int = 50):
    client = AntidetectBrowserClient(browser_settings())
    try:
        return await client.list_profiles(page, page_size)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@nn_router.post("/browser/profiles/{profile_id}/stop")
async def browser_stop(profile_id: str):
    client = AntidetectBrowserClient(browser_settings())
    try:
        await client.stop_profile(profile_id)
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@nn_router.post("/accounts/{account_id}/create-profile")
async def create_vpn_profile(account_id: int, platform: str = "Facebook"):
    """
    Tạo profile antidetect mới cho nick, gắn sẵn socks5 của tunnel WireGuard.
    Đây là cách chắc chắn nhất để lưu lượng của profile đi qua VPN, vì GPM/OMO
    chỉ nhận proxy lúc tạo profile.
    """
    conn = _conn()
    try:
        rows = db.load_accounts(conn, platform, decrypted)
        account = next((r for r in rows if r["Id"] == account_id), None)
        if account is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy nick")
        if not account.get("VpnConfig"):
            raise HTTPException(status_code=400, detail="Nick chưa được gán VPN")
        try:
            socks_url = vpn_bridge.open_tunnel(vpn_bridge.SCOPE_NUOINICK, account_id, account["VpnConfig"])
        except vpn_bridge.VpnError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        client = AntidetectBrowserClient(browser_settings())
        try:
            profile_id = await client.create_profile(
                name=account.get("Uid") or f"nick-{account_id}",
                proxy=socks_url,
                user_agent=account.get("UserAgent", ""),
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Không tạo được profile: {exc}")

        db.update_account(conn, platform, account_id, {"BrowserProfileId": profile_id}, encrypted)
        return {
            "success": True,
            "profile_id": profile_id,
            "vpn_location": account.get("VpnLocation", ""),
        }
    finally:
        conn.close()


@nn_router.post("/scripts/run")
async def run_script(req: RunFlowRequest):
    """
    Bật profile antidetect của nick, nối Playwright qua CDP rồi chạy kịch bản.
    Profile luôn được tắt lại kể cả khi kịch bản lỗi.
    """
    conn = _conn()
    try:
        scripts = db.load_script_folders(conn)
        script = next((s for s in scripts if s["id"] == req.script_id), None)
        if script is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy kịch bản")
        if not script["flow"]:
            raise HTTPException(status_code=400, detail="Chưa có bước nào trong kịch bản")

        rows = db.load_accounts(conn, req.platform, decrypted)
        account = next((r for r in rows if r["Id"] == req.account_id), None)
        if account is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy nick")
    finally:
        conn.close()

    profile_id = account.get("BrowserProfileId") or ""
    if not profile_id:
        raise HTTPException(
            status_code=400,
            detail="Nick chưa gắn profile trình duyệt (BrowserProfileId trống)",
        )

    # Bật tunnel WireGuard của nick trước khi mở trình duyệt, để mọi lưu lượng
    # của profile đi ra bằng IP của VPN chứ không phải IP máy thật.
    vpn_config = account.get("VpnConfig") or ""
    if not vpn_config:
        raise HTTPException(status_code=400, detail="Nick chưa được gán VPN")
    try:
        socks_url = vpn_bridge.open_tunnel(vpn_bridge.SCOPE_NUOINICK, req.account_id, vpn_config)
    except vpn_bridge.VpnError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    settings = ai_settings()
    flow = [AiVisionFlowStep.from_dict(s) for s in script["flow"]]
    variables = {
        "uid": account.get("Uid", ""),
        "pass": account.get("Pass", ""),
        "mail": account.get("Mail", ""),
        "passmail": account.get("PassMail", ""),
        "hoten": account.get("HoTen", ""),
        **req.variables,
    }
    code = get_2fa(account.get("TwoFA", ""))
    if code:
        variables["otp"] = code

    client = AntidetectBrowserClient(browser_settings())
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise HTTPException(status_code=500, detail="Chưa cài playwright trong môi trường Python")

    started = None
    try:
        # Ép profile đi qua socks5 cục bộ của tunnel trước khi bật
        vpn_applied = await client.set_profile_proxy(profile_id, socks_url)
        started = await client.start_profile(profile_id)
        async with async_playwright() as playwright:
            browser, _context, page = await connect_playwright(playwright, started)
            try:
                result = await run_flow(page, flow, settings, variables)
            finally:
                await browser.close()
        payload = result.to_dict()
        payload["vpn_location"] = account.get("VpnLocation", "")
        if not vpn_applied:
            payload["warning"] = (
                f"Không đổi được proxy của profile {profile_id} sang VPN — trình duyệt antidetect "
                "không hỗ trợ đổi proxy sau khi tạo. Hãy tạo lại profile bằng nút "
                '"Tạo profile theo VPN" để lưu lượng thực sự đi qua WireGuard.'
            )
        return payload
    except AiVisionError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chạy kịch bản lỗi: {exc}")
    finally:
        if started is not None:
            try:
                await client.stop_profile(profile_id)
            except Exception:
                pass


# ==============================================================================
# 1. ANTIDETECT PROFILES & GROUPS API (Native BaoSamBrowser Engine)
# ==============================================================================

class ProfileSaveRequest(BaseModel):
    Id: Optional[str] = None
    Name: str = "New Profile"
    GroupId: str = "Default"
    RawProxy: str = ""
    BrowserName: str = "Chrome"
    BrowserVersion: str = "128"
    OsType: int = 1
    CustomUserAgent: str = ""
    WebrtcMode: int = 1
    FixedWebrtcPublicIp: str = ""
    CanvasMode: int = 1
    WebglImageMode: int = 1
    AudioMode: int = 1
    ClientRectMode: int = 1
    GeolocationMode: int = 2
    TimezoneBaseOnIp: int = 1
    Timezone: str = ""
    IsLanguageBaseOnIp: int = 0
    FixedLanguage: str = "en-US"
    StartupUrls: str = ""
    Note: str = ""
    Tags: str = ""
    Resolution: str = "1920x1080"
    Cores: int = 8
    Memory: int = 8
    WebglVendor: str = ""
    WebglRenderer: str = ""


class GroupSaveRequest(BaseModel):
    Id: Optional[str] = None
    Name: str
    SortOrder: int = 0


class ProxyImportRequest(BaseModel):
    raw_data: str
    folder: str = "Default"


class ProxyCheckRequest(BaseModel):
    proxy_ids: List[str] = Field(default_factory=list)


class ProxyAssignRequest(BaseModel):
    proxy_id: str
    target_type: str = "profile"  # "profile" or "account"
    target_ids: List[str] = Field(default_factory=list)
    platform: str = "Facebook"


class SheetSyncRequest(BaseModel):
    platform: str = "Facebook"
    folder_id: int = 0
    spreadsheet_url: str = ""


class CreateByNumberRequest(BaseModel):
    prefix: str = "Profile-"
    start_index: int = 1
    count: int = 5
    group_id: str = "Default"
    browser_type: str = "Chrome"
    browser_version: str = "128"
    os_type: int = 1
    startup_urls: str = "https://www.google.com"
    proxy_list: str = ""


class ArrangeWindowsRequest(BaseModel):
    cols: int = 2
    rows: int = 2
    screen_width: int = 1440
    screen_height: int = 900


class SyncActionRequest(BaseModel):
    master_id: str
    slave_ids: List[str] = Field(default_factory=list)
    action: str = "goto"
    data: Dict[str, Any] = Field(default_factory=dict)


class BulkGroupRequest(BaseModel):
    profile_ids: List[str] = Field(default_factory=list)
    group_id: str = "Default"


class BulkProxyRequest(BaseModel):
    profile_ids: List[str] = Field(default_factory=list)
    raw_proxy: str = ""


class BulkIdsRequest(BaseModel):
    profile_ids: List[str] = Field(default_factory=list)


class BulkBrowserVersionRequest(BaseModel):
    profile_ids: List[str] = Field(default_factory=list)
    browser_version: str = "132"
    browser_type: str = "Chrome"
    update_ua: bool = True


class CoreActionRequest(BaseModel):
    core_id: str


class ExtensionSaveRequest(BaseModel):
    Name: str
    SourceType: str = "url"
    SourceUrl: str = ""
    LocalPath: str = ""
    Version: str = "1.0.0"
    IsActive: int = 1


class RotateProxyRequest(BaseModel):
    provider: str
    api_key: str


@nn_router.get("/profiles")
def list_profiles(group_id: Optional[str] = None, search: Optional[str] = None):
    conn = _conn()
    try:
        profiles = db.load_browser_profiles(conn, group_id, search)
        for p in profiles:
            p["is_running"] = is_native_profile_running(p["Id"])
        return {"profiles": profiles, "total": len(profiles)}
    finally:
        conn.close()


@nn_router.get("/profiles/trash")
def get_trash_profiles():
    """Lấy danh sách profile nằm trong thùng rác."""
    conn = _conn()
    try:
        return {"trash": db.load_trash_profiles(conn)}
    finally:
        conn.close()


@nn_router.delete("/profiles/trash/empty")
def empty_trash():
    """Dọn sạch thùng rác profile."""
    conn = _conn()
    try:
        count = db.empty_trash_browser_profiles(conn)
        return {"success": True, "deleted_count": count}
    finally:
        conn.close()


@nn_router.get("/v1/profiles/export-excel")
@nn_router.get("/v3/profiles/export-excel")
@nn_router.get("/profiles/export-excel")
def export_profiles_excel():
    """Xuất danh sách profile theo mẫu sample_excel_import.xlsx của GPM."""
    import io, pandas as pd
    conn = _conn()
    try:
        profiles = db.load_browser_profiles(conn)
        rows = []
        for p in profiles:
            p_type = "none"
            raw = p.get("RawProxy", "")
            if raw:
                p_type = "socks5" if "socks5" in raw.lower() else "http"
            rows.append({
                "Profile name": p.get("Name", ""),
                "Group name (optinal)": p.get("GroupId", "Default"),
                "Browser type": (p.get("BrowserName") or "Chrome").lower(),
                "Proxy type": p_type,
                "Proxy": raw,
            })
        df = pd.DataFrame(rows)
        out = io.BytesIO()
        df.to_excel(out, index=False, engine="openpyxl")
        out.seek(0)
        return Response(
            content=out.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=gpm_profiles_export.xlsx"}
        )
    finally:
        conn.close()


@nn_router.get("/profiles/{profile_id}")
def get_profile(profile_id: str):
    conn = _conn()
    try:
        p = db.get_browser_profile(conn, profile_id)
        if not p:
            raise HTTPException(status_code=404, detail="Không tìm thấy profile")
        p["is_running"] = is_native_profile_running(profile_id)
        return p
    finally:
        conn.close()


@nn_router.post("/profiles")
def save_profile(req: ProfileSaveRequest):
    conn = _conn()
    try:
        data = req.dict()
        pid = db.save_browser_profile(conn, data)
        return {"success": True, "id": pid}
    finally:
        conn.close()


@nn_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str):
    if is_native_profile_running(profile_id):
        await stop_native_profile(profile_id)
    conn = _conn()
    try:
        ok = db.delete_browser_profile(conn, profile_id)
        return {"success": ok}
    finally:
        conn.close()


@nn_router.post("/profiles/{profile_id}/start")
async def start_profile_endpoint(profile_id: str, headless: bool = False):
    conn = _conn()
    try:
        profile = db.get_browser_profile(conn, profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Không tìm thấy profile")
    finally:
        conn.close()

    tunnel_started = False
    ch_id = None
    if profile_id.startswith("channel_"):
        try:
            ch_id = int(profile_id.replace("channel_", ""))
            c_conn = _conn()
            try:
                cur = c_conn.cursor()
                cur.execute("SELECT vpn_config FROM channels WHERE id = ?", (ch_id,))
                c_row = cur.fetchone()
                if c_row and c_row[0]:
                    tunnel = vpn_bridge.vpn_manager.start_wireguard_proxy(ch_id, c_row[0])
                    profile["RawProxy"] = f"socks5://127.0.0.1:{tunnel['socks_port']}"
                    tunnel_started = True
            finally:
                c_conn.close()
        except Exception as e:
            logger.warning(f"Không thể khởi động WireGuard tunnel cho {profile_id}: {e}")

    try:
        res = await start_native_profile(profile, headless=headless)
        if profile_id.startswith("channel_") and ch_id is not None:
            try:
                c_conn = _conn()
                try:
                    cur = c_conn.cursor()
                    cur.execute("SELECT cookie FROM channels WHERE id = ?", (ch_id,))
                    c_row = cur.fetchone()
                    if c_row and c_row[0]:
                        plain = SECRET_STORE.decrypt(c_row[0])
                        c_list = vpn_bridge.vpn_manager.build_persistent_cookie_list(plain)
                        if c_list:
                            await set_native_profile_cookies(profile_id, c_list)
                finally:
                    c_conn.close()
            except Exception as e:
                logger.warning(f"Could not inject TikTok cookies to context for {profile_id}: {e}")
        conn = _conn()
        try:
            db.update_browser_profile_status(conn, profile_id, "running")
        finally:
            conn.close()
        return res
    except Exception as exc:
        if tunnel_started and ch_id is not None:
            try:
                vpn_bridge.vpn_manager.stop_wireguard_proxy(ch_id)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Lỗi khởi động profile: {exc}")


@nn_router.post("/profiles/{profile_id}/stop")
async def stop_profile_endpoint(profile_id: str):
    stopped = await stop_native_profile(profile_id)
    if profile_id.startswith("channel_"):
        try:
            ch_id = int(profile_id.replace("channel_", ""))
            vpn_bridge.vpn_manager.stop_wireguard_proxy(ch_id)
        except Exception:
            pass
    conn = _conn()
    try:
        db.update_browser_profile_status(conn, profile_id, "idle")
    finally:
        conn.close()
    return {"success": stopped}


@nn_router.get("/profiles/{profile_id}/cookies")
async def get_profile_cookies(profile_id: str):
    cookies = await get_native_profile_cookies(profile_id)
    if not cookies and profile_id.startswith("channel_"):
        try:
            ch_id = int(profile_id.replace("channel_", ""))
            conn = _conn()
            try:
                cur = conn.cursor()
                cur.execute("SELECT cookie FROM channels WHERE id = ?", (ch_id,))
                row = cur.fetchone()
                if row and row[0]:
                    plain = SECRET_STORE.decrypt(row[0])
                    cookies = vpn_bridge.vpn_manager.build_persistent_cookie_list(plain)
            finally:
                conn.close()
        except Exception:
            pass
    return {"cookies": cookies}


@nn_router.post("/profiles/{profile_id}/cookies")
async def set_profile_cookies(profile_id: str, cookies: List[Dict[str, Any]]):
    ok = await set_native_profile_cookies(profile_id, cookies)
    if profile_id.startswith("channel_") and cookies:
        try:
            ch_id = int(profile_id.replace("channel_", ""))
            cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies if 'name' in c and 'value' in c)
            enc = SECRET_STORE.encrypt(cookie_str)
            conn = _conn()
            try:
                conn.execute("UPDATE channels SET cookie = ? WHERE id = ?", (enc, ch_id))
                conn.execute("UPDATE TikTokAccounts SET Cookie = ? WHERE BrowserProfileId = ?", (enc, profile_id))
                conn.commit()
            finally:
                conn.close()
            ok = True
        except Exception:
            pass
    return {"success": ok}


# ==============================================================================
# GPM LOGIN GLOBAL: STANDARD REST API (V1 / V3) & EXTENDED WORKSTATION API
# ==============================================================================

@nn_router.get("/v1/profiles")
@nn_router.get("/v3/profiles")
def gpm_list_profiles(group_id: Optional[str] = None, search: Optional[str] = None):
    """Chuẩn API danh sách profiles của GPM Login Global."""
    conn = _conn()
    try:
        profiles = db.load_browser_profiles(conn, group_id, search)
        data = []
        for p in profiles:
            is_running = is_native_profile_running(p["Id"])
            data.append({
                "id": p["Id"],
                "name": p["Name"],
                "group_id": p.get("GroupId", "Default"),
                "group_name": p.get("GroupId", "Default"),
                "raw_proxy": p.get("RawProxy", ""),
                "browser_type": p.get("BrowserName", "Chrome"),
                "browser_version": p.get("BrowserVersion", "128"),
                "os": "Windows" if p.get("OsType") == 1 else ("Mac" if p.get("OsType") == 2 else "Linux"),
                "profile_path": str(Path(__file__).parent / "profiles" / p["Id"]),
                "note": p.get("Note", ""),
                "tags": p.get("Tags", ""),
                "created_at": p.get("CreatedAt", ""),
                "status": "running" if is_running else "ready",
            })
        return {"code": 0, "success": True, "data": data, "total": len(data)}
    finally:
        conn.close()


@nn_router.api_route("/v1/profiles/start/{profile_id}", methods=["GET", "POST"])
@nn_router.api_route("/v3/profiles/start/{profile_id}", methods=["GET", "POST"])
async def gpm_start_profile(profile_id: str, headless: bool = False):
    """Chuẩn API khởi động profile của GPM Login Global."""
    conn = _conn()
    try:
        profile = db.get_browser_profile(conn, profile_id)
        if not profile:
            return {"code": 1, "success": False, "message": "Profile not found", "data": {}}
    finally:
        conn.close()

    try:
        res = await start_native_profile(profile, headless=headless)
        conn = _conn()
        try:
            db.update_browser_profile_status(conn, profile_id, "running")
        finally:
            conn.close()
        port = res.get("remote_debugging_port")
        return {
            "code": 0,
            "success": True,
            "data": {
                "remote_debugging_address": f"127.0.0.1:{port}",
                "remote_debugging_port": port,
                "websocket_debugging_url": res.get("websocket_debugging_url", ""),
                "driver_path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            }
        }
    except Exception as exc:
        return {"code": 500, "success": False, "message": str(exc), "data": {}}


@nn_router.api_route("/v1/profiles/stop/{profile_id}", methods=["GET", "POST"])
@nn_router.api_route("/v3/profiles/stop/{profile_id}", methods=["GET", "POST"])
async def gpm_stop_profile(profile_id: str):
    """Chuẩn API tắt profile của GPM Login Global."""
    stopped = await stop_native_profile(profile_id)
    conn = _conn()
    try:
        db.update_browser_profile_status(conn, profile_id, "idle")
    finally:
        conn.close()
    return {"code": 0, "success": True, "message": "Profile stopped"}


@nn_router.post("/v1/profiles/create")
@nn_router.post("/v3/profiles/create")
def gpm_create_profile(payload: Dict[str, Any]):
    """Chuẩn API tạo profile của GPM Login Global."""
    import uuid
    pid = payload.get("id") or uuid.uuid4().hex[:12]
    name = payload.get("name") or payload.get("profile_name") or f"Profile-{pid[:4]}"
    group_id = payload.get("group_name") or payload.get("group_id") or "Default"
    raw_proxy = payload.get("raw_proxy") or payload.get("proxy") or ""
    os_str = str(payload.get("os", "1")).lower()
    os_type = 2 if "mac" in os_str else (3 if "linux" in os_str else 1)
    ver = str(payload.get("browser_version", "128"))

    fp = generate_random_fingerprint_dict(os_type, ver)
    profile_dict = {
        "Id": pid,
        "Name": name,
        "GroupId": group_id,
        "RawProxy": raw_proxy,
        "BrowserName": payload.get("browser_type") or "Chrome",
        "BrowserVersion": ver,
        "OsType": os_type,
        "CustomUserAgent": payload.get("user_agent") or fp["CustomUserAgent"],
        "CanvasMode": 1 if payload.get("is_noise_canvas", True) else 0,
        "WebglImageMode": 1 if payload.get("is_noise_webgl", True) else 0,
        "WebglVendor": fp["WebglVendor"],
        "WebglRenderer": fp["WebglRenderer"],
        "AudioMode": 1 if payload.get("is_noise_audio_context", True) else 0,
        "WebrtcMode": int(payload.get("webrtc_mode", 1)),
        "ClientRectMode": 1 if payload.get("is_noise_client_rect", True) else 0,
        "Resolution": fp["Resolution"],
        "Cores": fp["Cores"],
        "Memory": fp["Memory"],
        "StartupUrls": payload.get("startup_urls") or "https://www.google.com",
        "Note": payload.get("note") or "Created via GPM API",
        "Status": "ready",
        "Tags": payload.get("tags") or "GPM",
    }
    conn = _conn()
    try:
        created_id = db.save_browser_profile(conn, profile_dict)
        return {"code": 0, "success": True, "data": {"id": created_id, "name": name}}
    finally:
        conn.close()


@nn_router.post("/v1/profiles/update/{profile_id}")
def gpm_update_profile(profile_id: str, payload: Dict[str, Any]):
    """Chuẩn API cập nhật profile của GPM Login Global."""
    conn = _conn()
    try:
        existing = db.get_browser_profile(conn, profile_id)
        if not existing:
            return {"code": 1, "success": False, "message": "Profile not found"}
        if "name" in payload:
            existing["Name"] = payload["name"]
        if "raw_proxy" in payload:
            existing["RawProxy"] = payload["raw_proxy"]
        if "group_name" in payload:
            existing["GroupId"] = payload["group_name"]
        db.save_browser_profile(conn, existing)
        return {"code": 0, "success": True, "data": {"id": profile_id}}
    finally:
        conn.close()


@nn_router.api_route("/v1/profiles/delete/{profile_id}", methods=["GET", "DELETE"])
@nn_router.api_route("/v3/profiles/delete/{profile_id}", methods=["GET", "DELETE"])
async def gpm_delete_profile(profile_id: str):
    """Chuẩn API xoá profile (chuyển vào thùng rác) của GPM Login Global."""
    if is_native_profile_running(profile_id):
        await stop_native_profile(profile_id)
    conn = _conn()
    try:
        ok = db.delete_browser_profile(conn, profile_id)
        return {"code": 0, "success": ok, "message": "Deleted"}
    finally:
        conn.close()


@nn_router.api_route("/v1/profiles/check-proxy", methods=["GET", "POST"])
async def gpm_check_proxy_endpoint(request: Request, raw_proxy: Optional[str] = None):
    """Kiểm tra live/die, IP, Ping của proxy."""
    target_proxy = raw_proxy or ""
    if not target_proxy and request:
        try:
            body = await request.json()
            target_proxy = body.get("raw_proxy") or body.get("proxy") or ""
        except Exception:
            pass
    if not target_proxy:
        return {"code": 1, "success": False, "message": "Proxy is required"}
    res = await proxy_mod.check_single_proxy(target_proxy)
    return {
        "code": 0,
        "success": res.get("status") == "live",
        "data": {
            "status": res.get("status"),
            "ping": res.get("ping_ms", -1),
            "ip": res.get("real_ip", ""),
            "country": res.get("country", ""),
        }
    }


# --- GPM EXTENDED WORKSTATION ENDPOINTS ---

@nn_router.post("/profiles/create-by-number")
def create_profiles_by_number(req: CreateByNumberRequest):
    """Tạo profile hàng loạt theo số lượng và danh sách proxy chuẩn GPM Login."""
    import uuid
    proxies = [line.strip() for line in req.proxy_list.strip().splitlines() if line.strip()]
    count = max(1, min(req.count, 200))
    created = []

    conn = _conn()
    try:
        for i in range(count):
            num = req.start_index + i
            pid = uuid.uuid4().hex[:12]
            name = f"{req.prefix}{num}"
            proxy = proxies[i % len(proxies)] if proxies else ""
            fp = generate_random_fingerprint_dict(req.os_type, req.browser_version)

            p_dict = {
                "Id": pid,
                "Name": name,
                "GroupId": req.group_id or "Default",
                "RawProxy": proxy,
                "BrowserName": req.browser_type or "Chrome",
                "BrowserVersion": req.browser_version or "128",
                "OsType": req.os_type,
                "CustomUserAgent": fp["CustomUserAgent"],
                "CanvasMode": 1,
                "WebglImageMode": 1,
                "WebglVendor": fp["WebglVendor"],
                "WebglRenderer": fp["WebglRenderer"],
                "AudioMode": 1,
                "WebrtcMode": 1,
                "ClientRectMode": 1,
                "Resolution": fp["Resolution"],
                "Cores": fp["Cores"],
                "Memory": fp["Memory"],
                "StartupUrls": req.startup_urls or "https://www.google.com",
                "Note": f"Tạo hàng loạt ({count} profiles)",
                "Status": "ready",
                "Tags": "BatchCreate,GPM",
            }
            db.save_browser_profile(conn, p_dict)
            created.append({"Id": pid, "Name": name, "RawProxy": proxy})
        return {"success": True, "created_count": len(created), "profiles": created}
    finally:
        conn.close()


@nn_router.post("/profiles/import-excel")
async def import_profiles_excel(request: Request):
    """Nhập profile từ Excel/JSON theo cấu trúc sample_excel_import.xlsx của GPM."""
    import uuid, io
    data_rows = []
    try:
        body = await request.json()
        data_rows = body.get("rows") or []
    except Exception:
        pass

    if not data_rows:
        form = await request.form()
        file_obj = form.get("file")
        if file_obj:
            content = await file_obj.read()
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            for _, r in df.iterrows():
                p_name = str(r.get("Profile name") or r.get("Tên profile") or "").strip()
                if not p_name or p_name.lower().startswith("name of"):
                    continue
                p_group = str(r.get("Group name (optinal)") or r.get("Nhóm") or "Default").strip()
                p_browser = str(r.get("Browser type") or "Chrome").strip().title()
                p_proxy = str(r.get("Proxy") or r.get("IP:Port") or "").strip()
                data_rows.append({
                    "name": p_name,
                    "group": p_group if p_group != "nan" else "Default",
                    "browser": p_browser if p_browser != "nan" else "Chrome",
                    "proxy": p_proxy if p_proxy != "nan" else ""
                })

    if not data_rows:
        raise HTTPException(status_code=400, detail="Không có dữ liệu hợp lệ để nhập")

    conn = _conn()
    created_count = 0
    try:
        for r in data_rows:
            name = r.get("name") or f"Profile-{uuid.uuid4().hex[:4]}"
            group = r.get("group") or "Default"
            proxy = r.get("proxy") or ""
            browser = r.get("browser") or "Chrome"
            pid = uuid.uuid4().hex[:12]
            fp = generate_random_fingerprint_dict(1, "128")
            p_dict = {
                "Id": pid,
                "Name": name,
                "GroupId": group,
                "RawProxy": proxy,
                "BrowserName": browser,
                "BrowserVersion": "128",
                "OsType": 1,
                "CustomUserAgent": fp["CustomUserAgent"],
                "CanvasMode": 1,
                "WebglImageMode": 1,
                "WebglVendor": fp["WebglVendor"],
                "WebglRenderer": fp["WebglRenderer"],
                "AudioMode": 1,
                "WebrtcMode": 1,
                "ClientRectMode": 1,
                "Resolution": fp["Resolution"],
                "Cores": fp["Cores"],
                "Memory": fp["Memory"],
                "StartupUrls": "https://www.google.com",
                "Note": "Import từ Excel",
                "Status": "ready",
                "Tags": "ExcelImport,GPM"
            }
            db.save_browser_profile(conn, p_dict)
            created_count += 1
        return {"success": True, "imported_count": created_count}
    finally:
        conn.close()





@nn_router.post("/profiles/arrange-windows")
async def arrange_windows_endpoint(req: ArrangeWindowsRequest):
    """Sắp xếp các cửa sổ trình duyệt theo bố cục lưới (GPM Arrange Browser Window)."""
    return await arrange_running_windows(req.cols, req.rows, req.screen_width, req.screen_height)


@nn_router.post("/profiles/sync-action")
async def sync_action_endpoint(req: SyncActionRequest):
    """Đồng bộ thao tác chuột & phím từ Master sang Slaves (GPM Action Synchronizer)."""
    return await sync_broadcast_action(req.master_id, req.slave_ids, req.action, req.data)





@nn_router.post("/profiles/{profile_id}/restore")
def restore_trash_profile(profile_id: str):
    """Khôi phục profile từ thùng rác."""
    conn = _conn()
    try:
        ok = db.restore_browser_profile(conn, profile_id)
        return {"success": ok}
    finally:
        conn.close()


@nn_router.delete("/profiles/{profile_id}/permanent")
def permanent_delete_profile(profile_id: str):
    """Xoá vĩnh viễn profile."""
    conn = _conn()
    try:
        ok = db.permanent_delete_browser_profile(conn, profile_id)
        return {"success": ok}
    finally:
        conn.close()





@nn_router.post("/profiles/bulk-update-group")
def bulk_update_group_endpoint(req: BulkGroupRequest):
    """Đổi nhóm hàng loạt."""
    conn = _conn()
    try:
        count = db.bulk_update_group(conn, req.profile_ids, req.group_id)
        return {"success": True, "updated_count": count}
    finally:
        conn.close()


@nn_router.post("/profiles/bulk-update-proxy")
def bulk_update_proxy_endpoint(req: BulkProxyRequest):
    """Đổi proxy hàng loạt."""
    conn = _conn()
    try:
        count = db.bulk_update_proxy(conn, req.profile_ids, req.raw_proxy)
        return {"success": True, "updated_count": count}
    finally:
        conn.close()


@nn_router.post("/profiles/bulk-random-fingerprint")
def bulk_random_fingerprint_endpoint(req: BulkIdsRequest):
    """Random lại toàn bộ vân tay cho các profile đã chọn."""
    conn = _conn()
    try:
        count = db.bulk_random_fingerprint(conn, req.profile_ids)
        return {"success": True, "updated_count": count}
    finally:
        conn.close()


@nn_router.post("/profiles/bulk-update-version")
def bulk_update_browser_version_endpoint(req: BulkBrowserVersionRequest):
    """Đổi phiên bản trình duyệt / nhân Chromium Core cho các profile (GPM SelectBrowserVersion)."""
    conn = _conn()
    try:
        count = db.bulk_update_browser_version(
            conn, req.profile_ids, req.browser_version, req.browser_type, req.update_ua
        )
        return {"success": True, "updated_count": count}
    finally:
        conn.close()


# --- GPM BROWSER CORE & UPDATE MANAGER ENDPOINTS (UpdateManagerPopup & ResourceDownloadPopup) ---

@nn_router.get("/browser/cores")
@nn_router.get("/v1/browser/cores")
@nn_router.get("/v3/browser/cores")
def list_browser_cores():
    """Lấy danh sách các nhân Chromium Core và GPM Driver."""
    cores = get_browser_cores()
    return {"code": 0, "success": True, "data": cores, "cores": cores}


@nn_router.post("/browser/check-update")
@nn_router.post("/v1/browser/check-update")
@nn_router.post("/v3/browser/check-update")
async def check_browser_updates():
    """Kiểm tra bản cập nhật mới nhất cho các nhân trình duyệt."""
    res = await check_core_updates_online()
    return {"code": 0, "success": True, "data": res, **res}


@nn_router.post("/browser/update-core")
@nn_router.post("/v1/browser/update-core")
@nn_router.post("/v3/browser/update-core")
async def update_browser_core_endpoint(req: CoreActionRequest):
    """Khởi động tải xuống và cập nhật nhân trình duyệt (ResourceDownloadPopup)."""
    res = await start_core_download(req.core_id)
    return {"code": 0, "success": res.get("success", False), "data": res, **res}


@nn_router.get("/browser/download-progress/{core_id}")
@nn_router.get("/v1/browser/download-progress/{core_id}")
@nn_router.get("/v3/browser/download-progress/{core_id}")
def get_browser_download_progress_endpoint(core_id: str):
    """Lấy tiến trình tải xuống thời gian thực của core."""
    progress = get_download_progress(core_id)
    return {"code": 0, "success": True, "data": progress, **progress}


@nn_router.post("/profiles/{profile_id}/clear-cache")
def clear_cache_endpoint(profile_id: str):
    """Xoá cache của profile theo chuẩn ClearCacheConfig."""
    return db.clear_profile_cache(profile_id)


# --- EXTENSION / PLUGIN MODULE ---

@nn_router.get("/extensions")
def get_extensions():
    conn = _conn()
    try:
        return {"extensions": db.load_browser_extensions(conn)}
    finally:
        conn.close()


@nn_router.post("/extensions")
def save_extension(req: ExtensionSaveRequest):
    conn = _conn()
    try:
        eid = db.save_browser_extension(conn, req.dict())
        return {"success": True, "id": eid}
    finally:
        conn.close()


@nn_router.delete("/extensions/{ext_id}")
def delete_extension(ext_id: str):
    conn = _conn()
    try:
        ok = db.delete_browser_extension(conn, ext_id)
        return {"success": ok}
    finally:
        conn.close()


@nn_router.post("/extensions/{ext_id}/toggle")
def toggle_extension(ext_id: str, is_active: int = 1):
    conn = _conn()
    try:
        ok = db.toggle_browser_extension(conn, ext_id, is_active)
        return {"success": ok}
    finally:
        conn.close()


# --- ROTATING PROXY PROVIDERS ---

GPM_PROXY_PROVIDERS = [
    {"id": "tmproxy", "name": "TMProxy", "template": "https://tmproxy.com/api/proxy/get-new-proxy", "key_field": "api_key"},
    {"id": "wwproxy", "name": "WWProxy", "template": "https://wwproxy.com/api/client/proxy/available?key={api_key}&provinceId=-1", "key_field": "api_key"},
    {"id": "kiotproxy", "name": "KiotProxy", "template": "https://api.kiotproxy.com/api/public/proxies/get-new", "key_field": "api_key"},
    {"id": "proxyxoay", "name": "ProxyXoay", "template": "https://proxyxoay.shop/api/get.php?key={api_key}", "key_field": "api_key"},
    {"id": "cloudcheap", "name": "CloudCheap", "template": "https://app.cloud-cheap.com/api/proxy-access/{api_key}/new", "key_field": "api_key"},
    {"id": "fproxy", "name": "FProxy", "template": "https://fproxy.me/api/GetNew.php?api_key={api_key}&location=0", "key_field": "api_key"},
    {"id": "raiproxy", "name": "RaiProxy", "template": "https://be.raiproxy.com/api/package/{api_key}/reload", "key_field": "api_key"},
]

@nn_router.get("/proxy-providers")
def list_proxy_providers():
    return {"providers": GPM_PROXY_PROVIDERS}


@nn_router.post("/proxy-providers/get-new")
async def get_new_rotated_proxy(req: RotateProxyRequest):
    """Lấy proxy mới từ nhà cung cấp proxy xoay."""
    import httpx
    prov = next((p for p in GPM_PROXY_PROVIDERS if p["id"] == req.provider.lower()), None)
    if not prov:
        raise HTTPException(status_code=400, detail=f"Nhà mạng proxy {req.provider} chưa được hỗ trợ")

    url = prov["template"].replace("{api_key}", req.api_key.strip())
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if req.provider.lower() in ("tmproxy", "kiotproxy"):
                resp = await client.post(url, json={"api_key": req.api_key.strip()})
            else:
                resp = await client.get(url)
            data = resp.json()
            return {"success": True, "provider": prov["name"], "response": data}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Lỗi kết nối {prov['name']}: {exc}")



@nn_router.get("/groups")
def list_groups():
    conn = _conn()
    try:
        return {"groups": db.load_browser_groups(conn)}
    finally:
        conn.close()


@nn_router.post("/groups")
def create_group(req: GroupSaveRequest):
    import uuid
    gid = req.Id or uuid.uuid4().hex[:8]
    conn = _conn()
    try:
        return db.create_browser_group(conn, gid, req.Name)
    finally:
        conn.close()


@nn_router.delete("/groups/{group_id}")
def delete_group(group_id: str):
    conn = _conn()
    try:
        ok = db.delete_browser_group(conn, group_id)
        return {"success": ok}
    finally:
        conn.close()


# ==============================================================================
# 2. PROXIES MANAGEMENT API
# ==============================================================================

@nn_router.get("/proxies")
def list_proxies(folder: Optional[str] = None):
    conn = _conn()
    try:
        proxies = db.load_browser_proxies(conn, folder)
        return {"proxies": proxies, "total": len(proxies)}
    finally:
        conn.close()


@nn_router.post("/proxies/import")
def import_proxies(req: ProxyImportRequest):
    results = proxy_mod.parse_many(req.raw_data)
    valid_proxies = []
    for r in results:
        if r.is_valid:
            valid_proxies.append({
                "RawProxy": r.original_line,
                "Name": f"{r.host}:{r.port}",
                "Folder": req.folder or "Default",
                "Protocol": r.scheme or "http",
                "OriginalInput": r.original_line,
            })
    if not valid_proxies:
        raise HTTPException(status_code=400, detail="Không có proxy hợp lệ nào")

    conn = _conn()
    try:
        inserted = db.insert_browser_proxies(conn, valid_proxies)
        return {"success": True, "imported": inserted, "skipped": len(results) - len(valid_proxies)}
    finally:
        conn.close()


@nn_router.post("/proxies/check-live")
async def check_proxies_endpoint(req: ProxyCheckRequest):
    conn = _conn()
    try:
        all_proxies = db.load_browser_proxies(conn)
    finally:
        conn.close()

    to_check = all_proxies
    if req.proxy_ids:
        ids_set = set(req.proxy_ids)
        to_check = [p for p in all_proxies if p["Id"] in ids_set]

    raw_list = [p["RawProxy"] for p in to_check]
    results = await proxy_mod.check_proxies_batch(raw_list, max_concurrency=12)

    conn = _conn()
    try:
        import datetime
        now_str = datetime.datetime.utcnow().isoformat() + "Z"
        for p, r in zip(to_check, results):
            status = "live" if r.get("is_live") else "die"
            db.update_browser_proxy(conn, p["Id"], {
                "Status": status,
                "PingMs": r.get("ping_ms", -1),
                "RealIp": r.get("real_ip", ""),
                "Country": r.get("country", ""),
                "LastError": r.get("error", ""),
                "LastCheckedAt": now_str,
            })
        return {"success": True, "checked": len(results), "results": results}
    finally:
        conn.close()


@nn_router.post("/proxies/assign")
def assign_proxy(req: ProxyAssignRequest):
    conn = _conn()
    try:
        proxy_row = None
        for p in db.load_browser_proxies(conn):
            if p["Id"] == req.proxy_id:
                proxy_row = p
                break
        if not proxy_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy proxy")

        raw_proxy = proxy_row["RawProxy"]
        if req.target_type == "profile":
            for pid in req.target_ids:
                prof = db.get_browser_profile(conn, pid)
                if prof:
                    prof["RawProxy"] = raw_proxy
                    db.save_browser_profile(conn, prof)
        elif req.target_type == "account":
            for aid in req.target_ids:
                cur = conn.cursor()
                cur.execute(
                    f"UPDATE {db.account_table(req.platform)} SET Proxy = ? WHERE Id = ?",
                    (raw_proxy, int(aid)),
                )
            conn.commit()
        return {"success": True, "assigned": len(req.target_ids)}
    finally:
        conn.close()


@nn_router.delete("/proxies")
def delete_proxies(proxy_ids: List[str]):
    conn = _conn()
    try:
        deleted = db.delete_browser_proxies(conn, proxy_ids)
        return {"success": True, "deleted": deleted}
    finally:
        conn.close()


# ==============================================================================
# 3. INSTANT 2FA GENERATOR FOR ACCOUNTS
# ==============================================================================

@nn_router.get("/accounts/{platform}/{account_id}/2fa")
def get_account_2fa(platform: str, account_id: int):
    conn = _conn()
    try:
        accounts = db.load_accounts(conn, platform, decrypted)
        account = next((a for a in accounts if int(a["Id"]) == account_id), None)
        if not account:
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
        twofa_secret = account.get("TwoFA", "").strip()
        if not twofa_secret:
            raise HTTPException(status_code=400, detail="Tài khoản chưa có khoá 2FA")
        code = get_2fa(twofa_secret)
        if not code:
            raise HTTPException(status_code=400, detail="Mã bí mật 2FA không hợp lệ")
        return {"success": True, "code": code, "secret": twofa_secret}
    finally:
        conn.close()


# ==============================================================================
# 4. GOOGLE SHEETS 2-WAY SYNC
# ==============================================================================

@nn_router.post("/sheets/build-rows")
def sheets_build_rows(platform: str = "Facebook", folder_id: int = 0):
    conn = _conn()
    try:
        rows = db.load_accounts(conn, platform, decrypted, folder_id=folder_id if folder_id > 0 else None)
        sheet_rows = sheets_sync.build_sheet_rows(rows)
        return {"success": True, "rows": sheet_rows, "total": len(rows)}
    finally:
        conn.close()


@nn_router.post("/sheets/parse-rows")
def sheets_parse_rows(payload: Dict[str, Any]):
    raw_rows = payload.get("rows", [])
    parsed = sheets_sync.parse_sheet_rows(raw_rows)
    return {"success": True, "accounts": parsed, "count": len(parsed)}


# ==============================================================================
# 5. BAOSAMBROWSER LOCAL REST API COMPATIBILITY (/api/v1/profiles/*)
# ==============================================================================

@nn_router.get("/v1/profiles")
def api_v1_profiles(page: int = 1, page_size: int = 50):
    conn = _conn()
    try:
        profiles = db.load_browser_profiles(conn)
        start = (page - 1) * page_size
        paged = profiles[start:start + page_size]
        data = []
        for p in paged:
            data.append({
                "id": p["Id"],
                "name": p["Name"],
                "raw_proxy": p["RawProxy"],
                "browser_name": p["BrowserName"],
                "browser_version": p["BrowserVersion"],
                "status": "running" if is_native_profile_running(p["Id"]) else "idle",
            })
        return {
            "success": True,
            "data": data,
            "total": len(profiles),
            "current_page": page,
            "per_page": page_size,
        }
    finally:
        conn.close()


@nn_router.post("/v1/profiles/create")
def api_v1_create_profile(payload: Dict[str, Any]):
    conn = _conn()
    try:
        pid = db.save_browser_profile(conn, payload)
        return {"success": True, "data": {"profile_id": pid, "id": pid}, "message": "Profile created"}
    finally:
        conn.close()


@nn_router.api_route("/v1/profiles/start/{profile_id}", methods=["GET", "POST"])
async def api_v1_start_profile(profile_id: str):
    conn = _conn()
    try:
        profile = db.get_browser_profile(conn, profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
    finally:
        conn.close()
    res = await start_native_profile(profile, headless=False)
    return {"success": True, "data": res}


@nn_router.api_route("/v1/profiles/stop/{profile_id}", methods=["GET", "POST"])
async def api_v1_stop_profile(profile_id: str):
    stopped = await stop_native_profile(profile_id)
    return {"success": stopped, "data": {"profile_id": profile_id}}


@nn_router.api_route("/v1/profiles/delete/{profile_id}", methods=["GET", "POST", "DELETE"])
async def api_v1_delete_profile(profile_id: str):
    await stop_native_profile(profile_id)
    conn = _conn()
    try:
        ok = db.delete_browser_profile(conn, profile_id)
        return {"success": ok}
    finally:
        conn.close()
