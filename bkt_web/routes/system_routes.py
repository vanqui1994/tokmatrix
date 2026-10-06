"""Hệ thống: cài đặt chung, kho khoá API (kiểm tra khoá), nhật ký truy cập, danh sách worker nền."""

from __future__ import annotations

from typing import Any, Dict
from curl_cffi import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
try:
    from bkt_web import key_vault
    from bkt_web.db_utils import connect_db
except ImportError:
    import key_vault
    from db_utils import connect_db

try:
    from bkt_web import paths
except ImportError:
    import paths

router = APIRouter()


SECRET_SETTING_KEYS = {"api_captcha", "proxy_list"}


@router.get("/api/system/workers")
def api_system_workers():
    """Worker chạy nền: bật/tắt theo env, số thread đang sống (bkt_web/workers.py)."""
    try:
        from bkt_web import workers
    except ImportError:
        import workers
    return workers.status()


# --- Module 5: Settings (Cài Đặt Hệ Thống) ---
ALLOWED_SETTING_KEYS = {
    "api_captcha",
    "prefer_api_captcha",
    "default_render_gpu",
    "proxy_list",
}


@router.get("/api/audit-events")
def get_audit_events(limit: int = 100):
    limit = max(1, min(limit, 500))
    conn = connect_db(paths.DB_PATH)
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


@router.get("/api/settings")
def get_system_settings():
    conn = connect_db(paths.DB_PATH)
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
        "download_folder": str(paths.DOWNLOADS_DIR),
        "render_folder": str(paths.RENDERED_DIR),
    }
    for k, v in rows:
        if k in SECRET_SETTING_KEYS:
            continue  # khoá bí mật nay nằm ở kho khoá chung
        elif k in ALLOWED_SETTING_KEYS:
            settings_dict[k] = v

    # Khoá captcha lấy từ kho chung (Cài Đặt Hệ Thống → Kho Khoá API)
    settings_dict["api_captcha_configured"] = bool(key_vault.get_key("captcha.achi"))

    return settings_dict


@router.post("/api/settings")
def save_system_settings(data: Dict[str, Any]):
    conn = connect_db(paths.DB_PATH)
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


class ApiKeySave(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: str = Field(default="", max_length=4096)


@router.get("/api/keys")
def list_api_keys():
    """Trạng thái từng khoá. Không bao giờ kèm giá trị thật."""
    return {"keys": key_vault.status()}


@router.put("/api/keys/{name}")
def save_api_key(name: str, item: ApiKeySave):
    if name not in key_vault.SPEC_BY_NAME:
        raise HTTPException(status_code=404, detail=f"Không có khoá tên '{name}'")
    key_vault.set_key(name, item.value)
    return {"success": True, "name": name, "configured": bool(key_vault.get_key(name))}


@router.delete("/api/keys/{name}")
def delete_api_key(name: str):
    if name not in key_vault.SPEC_BY_NAME:
        raise HTTPException(status_code=404, detail=f"Không có khoá tên '{name}'")
    key_vault.delete_key(name)
    return {"success": True, "name": name, "configured": False}


@router.post("/api/keys/{name}/test")
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


@router.post("/api/settings/test-achi")
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
