"""
Kho khoá API dùng chung cho toàn ứng dụng.

Trước đây mỗi module giữ key ở một nơi: `fb_ai_settings`, `settings`,
`fb_reg_settings` và file `nuoinick_settings.json`. Nhập key ở màn hình này
không dùng được cho màn hình kia, và mức bảo vệ cũng không đồng đều — có chỗ
mã hoá, có chỗ để nguyên văn, có endpoint còn trả key ngược về trình duyệt.

Module này gom tất cả về một bảng `api_keys` duy nhất, luôn mã hoá Fernet bằng
cùng master key với phần còn lại của bkt_web, và không bao giờ trả giá trị key
ra ngoài — API chỉ báo "đã có" hay "chưa có".
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from bkt_web.db_utils import connect_db
    from bkt_web.security import SecretStore
except ImportError:
    from db_utils import connect_db
    from security import SecretStore

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")


@dataclass(frozen=True)
class KeySpec:
    """Mô tả một khoá để giao diện dựng form mà không cần hardcode lại."""
    name: str
    label: str
    group: str
    hint: str = ""
    used_by: str = ""


# Danh mục khoá. Thêm nhà cung cấp mới chỉ cần thêm một dòng ở đây.
KEY_SPECS: List[KeySpec] = [
    KeySpec("ai.gemini", "Google Gemini", "Trí tuệ nhân tạo",
            "AIza... hoặc AQ.Ab8...", "Kịch bản AI Vision, sinh nội dung Facebook Pro"),
    KeySpec("ai.claude", "Anthropic Claude", "Trí tuệ nhân tạo",
            "sk-ant-...", "Kịch bản AI Vision"),
    KeySpec("ai.openai", "OpenAI", "Trí tuệ nhân tạo",
            "sk-proj-...", "Sinh nội dung Facebook Pro"),
    KeySpec("ai.hhtech", "HHTechApi", "Trí tuệ nhân tạo",
            "", "Kịch bản AI Vision"),
    KeySpec("ai.vietapi", "VietApi", "Trí tuệ nhân tạo",
            "", "Kịch bản AI Vision"),
    KeySpec("ai.custom", "Nhà cung cấp tự thêm", "Trí tuệ nhân tạo",
            "", "Kịch bản AI Vision"),
    KeySpec("image.cf_worker", "Cloudflare Worker ảnh (dự phòng)", "Trí tuệ nhân tạo",
            "", "Ảnh video khi Antigravity hết quota (cf_image_fallback)"),
    KeySpec("image.imagerouter", "ImageRouter ảnh (dự phòng, trả phí)", "Trí tuệ nhân tạo",
            "", "Ảnh video khi Antigravity hết quota, trước Cloudflare (imagerouter_image)"),
    KeySpec("tiktok.chocode", "TikTok API (chocode)", "Dữ liệu TikTok",
            "tk_live_...", "Tải video không logo, tra hồ sơ kênh, tab TikTok API"),
    KeySpec("notify.telegram", "Bot Telegram thông báo", "Thông báo",
            "123456789:AA...", "Tin render xong, trạng thái VPS, cảnh báo (bkt_web/notify.py)"),
    KeySpec("captcha.achi", "AchiCaptcha", "Captcha / OTP / Mail",
            "", "Giải captcha khi đăng video TikTok"),
    KeySpec("mail.dongvanfb", "DongVanFb (mua mail)", "Captcha / OTP / Mail",
            "", "Reg FB tự động"),
    KeySpec("otp.funotp", "FunOtp (thuê số điện thoại)", "Captcha / OTP / Mail",
            "", "Reg FB tự động"),
]

SPEC_BY_NAME: Dict[str, KeySpec] = {spec.name: spec for spec in KEY_SPECS}


def ensure_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS api_keys (
            name       TEXT PRIMARY KEY,
            value      TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.commit()


def _conn():
    conn = connect_db(DB_PATH)
    ensure_table(conn)
    return conn


def get_key(name: str) -> str:
    """Giá trị nguyên văn của một khoá; chuỗi rỗng nếu chưa đặt."""
    conn = _conn()
    try:
        row = conn.execute("SELECT value FROM api_keys WHERE name=?", (name,)).fetchone()
    finally:
        conn.close()
    if not row or not row[0]:
        return ""
    try:
        return SECRET_STORE.decrypt(row[0])
    except ValueError:
        return ""


def get_keys(*names: str) -> Dict[str, str]:
    """Đọc nhiều khoá trong một lần mở kết nối."""
    if not names:
        return {}
    conn = _conn()
    try:
        marks = ",".join("?" for _ in names)
        rows = conn.execute(f"SELECT name, value FROM api_keys WHERE name IN ({marks})", names).fetchall()
    finally:
        conn.close()
    out = {name: "" for name in names}
    for name, value in rows:
        if not value:
            continue
        try:
            out[name] = SECRET_STORE.decrypt(value)
        except ValueError:
            out[name] = ""
    return out


def set_key(name: str, value: str) -> None:
    """Đặt khoá. Giá trị rỗng nghĩa là xoá hẳn, không lưu chuỗi rỗng đã mã hoá."""
    value = (value or "").strip()
    if not value:
        delete_key(name)
        return
    conn = _conn()
    try:
        conn.execute(
            """
            INSERT INTO api_keys (name, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (name, SECRET_STORE.encrypt(value), int(time.time())),
        )
        conn.commit()
    finally:
        conn.close()


def delete_key(name: str) -> None:
    conn = _conn()
    try:
        conn.execute("DELETE FROM api_keys WHERE name=?", (name,))
        conn.commit()
    finally:
        conn.close()


def status() -> List[Dict[str, Any]]:
    """
    Trạng thái từng khoá cho giao diện: chỉ có/không và thời điểm cập nhật.
    Không bao giờ kèm giá trị thật.
    """
    conn = _conn()
    try:
        rows = dict(
            (name, updated_at)
            for name, value, updated_at in conn.execute(
                "SELECT name, value, updated_at FROM api_keys"
            ).fetchall()
            if value
        )
    finally:
        conn.close()
    return [
        {
            "name": spec.name,
            "label": spec.label,
            "group": spec.group,
            "hint": spec.hint,
            "used_by": spec.used_by,
            "configured": spec.name in rows,
            "updated_at": rows.get(spec.name, 0),
        }
        for spec in KEY_SPECS
    ]


def configured_names() -> List[str]:
    return [item["name"] for item in status() if item["configured"]]


# --------------------------------------------------------------- di trú

# Bản đồ từ kho cũ sang tên khoá mới. Giữ lại để nâng cấp không mất key đã nhập.
_LEGACY_SQL = [
    # (câu đọc, câu xoá nguồn sau khi chép, tên khoá mới)
    ("SELECT value FROM settings WHERE key='api_captcha'",
     "DELETE FROM settings WHERE key='api_captcha'", "captcha.achi"),
    ("SELECT value FROM fb_reg_settings WHERE key='dongvan_api_key'",
     "DELETE FROM fb_reg_settings WHERE key='dongvan_api_key'", "mail.dongvanfb"),
    ("SELECT value FROM fb_reg_settings WHERE key='funotp_api_key'",
     "DELETE FROM fb_reg_settings WHERE key='funotp_api_key'", "otp.funotp"),
]

# nuoinick_settings.json giữ key nguyên văn theo tên trường của bản gốc
_LEGACY_JSON_FIELDS = {
    "api_key": "ai.claude",
    "google_api_key": "ai.gemini",
    "hhtech_api_key": "ai.hhtech",
    "vietapi_key": "ai.vietapi",
    "custom_api_key": "ai.custom",
}


def migrate_legacy_keys() -> Dict[str, str]:
    """
    Kéo key từ bốn kho cũ về kho chung. Chạy được nhiều lần: khoá nào đã có
    trong kho mới thì bỏ qua, không ghi đè.

    Trả về {tên khoá: nguồn} của những khoá vừa chuyển, để ghi log khởi động.
    """
    import json

    moved: Dict[str, str] = {}
    existing = set(configured_names())

    conn = _conn()
    try:
        for read_sql, purge_sql, target in _LEGACY_SQL:
            try:
                row = conn.execute(read_sql).fetchone()
            except Exception:
                continue  # bảng cũ chưa tồn tại
            if not row or not row[0]:
                continue
            if target not in existing:
                try:
                    value = SECRET_STORE.decrypt(row[0])
                except ValueError:
                    continue
                if not value:
                    continue
                set_key(target, value)
                moved[target] = read_sql.split("FROM")[1].split("WHERE")[0].strip()
            # Chép xong thì xoá bản gốc: để lại nghĩa là khoá vẫn nằm hai nơi.
            conn.execute(purge_sql)
            conn.commit()

        # fb_ai_settings lưu key theo cổng AI đang chọn
        try:
            row = conn.execute(
                "SELECT provider, api_key FROM fb_ai_settings WHERE id=1"
            ).fetchone()
        except Exception:
            row = None
        if row and row[1]:
            target = "ai.openai" if (row[0] or "").lower() == "openai" else "ai.gemini"
            if target not in existing:
                try:
                    value = SECRET_STORE.decrypt(row[1])
                except ValueError:
                    value = ""
                if value:
                    set_key(target, value)
                    moved[target] = "fb_ai_settings"
            # Dọn bản gốc dù có chép hay không, để khoá chỉ tồn tại một nơi.
            conn.execute("UPDATE fb_ai_settings SET api_key='' WHERE id=1")
            conn.commit()
    finally:
        conn.close()

    settings_file = BASE_DIR / "nuoinick_settings.json"
    if settings_file.exists():
        try:
            ai = json.loads(settings_file.read_text(encoding="utf-8")).get("ai_vision", {})
        except Exception:
            ai = {}
        for field, target in _LEGACY_JSON_FIELDS.items():
            if target in existing or target in moved:
                continue
            value = (ai.get(field) or "").strip()
            if value and value != "***":
                set_key(target, value)
                moved[target] = "nuoinick_settings.json"

        # File này lưu key nguyên văn, phải dọn sạch phần key sau khi đã chép.
        if any(ai.get(field) for field in _LEGACY_JSON_FIELDS):
            try:
                blob = json.loads(settings_file.read_text(encoding="utf-8"))
                for field in _LEGACY_JSON_FIELDS:
                    blob.get("ai_vision", {}).pop(field, None)
                settings_file.write_text(
                    json.dumps(blob, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                settings_file.chmod(0o600)
            except Exception:
                pass

    # Bản desktop cũ còn có thể để AchiCaptcha trong
    # last_location/api_cookie.json ở thư mục gốc. Di trú rồi xoá hẳn trường
    # này để khoá không tiếp tục tồn tại dưới dạng plaintext ở kho thứ hai.
    legacy_cookie_file = BASE_DIR.parent / "last_location" / "api_cookie.json"
    if legacy_cookie_file.exists():
        try:
            blob = json.loads(legacy_cookie_file.read_text(encoding="utf-8"))
        except Exception:
            blob = None
        if isinstance(blob, dict):
            value = str(blob.get("api_captcha") or "").strip()
            if value and "captcha.achi" not in existing and "captcha.achi" not in moved:
                try:
                    value = SECRET_STORE.decrypt(value)
                except ValueError:
                    value = ""
                if value:
                    set_key("captcha.achi", value)
                    moved["captcha.achi"] = "last_location/api_cookie.json"
            if "api_captcha" in blob:
                blob.pop("api_captcha", None)
                try:
                    legacy_cookie_file.write_text(
                        json.dumps(blob, ensure_ascii=False, indent=2), encoding="utf-8"
                    )
                    legacy_cookie_file.chmod(0o600)
                except OSError:
                    pass

    return moved
