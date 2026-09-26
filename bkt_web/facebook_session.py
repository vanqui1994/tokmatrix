"""Tiện ích dùng chung cho vòng đời phiên đăng nhập Facebook."""

from __future__ import annotations

import re
from typing import Any, Callable, Dict, Iterable, List, Optional


BLOCKED_SESSION_PATHS = (
    "login",
    "checkpoint",
    "recover",
    "confirmemail",
    "two_step",
    "auth_platform",
    "reg/",
    "r.php",
)


def cookie_header_to_playwright(cookie_header: str) -> List[Dict[str, Any]]:
    cookies: List[Dict[str, Any]] = []
    for part in (cookie_header or "").split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, value = part.split("=", 1)
        name = name.strip()
        if not name or not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            continue
        cookies.append({
            "name": name,
            "value": value.strip(),
            "domain": ".facebook.com",
            "path": "/",
            "secure": True,
            "httpOnly": name in {"xs", "fr"},
            "sameSite": "None",
        })
    return cookies


def cookies_to_header(cookies: Iterable[Dict[str, Any]]) -> str:
    return "; ".join(
        f"{item.get('name')}={item.get('value')}"
        for item in cookies
        if item.get("name") and item.get("value") is not None
    )


def session_cookie_uid(cookies: Iterable[Dict[str, Any]]) -> str:
    for item in cookies:
        if item.get("name") == "c_user":
            value = str(item.get("value") or "").strip()
            return value if value.isdigit() else ""
    return ""


def validate_session_cookies(
    cookies: Iterable[Dict[str, Any]],
    expected_uid: Optional[str] = None,
) -> tuple[bool, str, str]:
    cookie_map = {
        str(item.get("name") or ""): str(item.get("value") or "")
        for item in cookies
    }
    uid = cookie_map.get("c_user", "").strip()
    if not uid or not uid.isdigit():
        return False, "", "Facebook chưa cấp cookie c_user hợp lệ"
    if not cookie_map.get("xs", "").strip():
        return False, uid, "Facebook chưa cấp cookie phiên xs"
    if expected_uid and uid != str(expected_uid).strip():
        return False, uid, f"Profile đang đăng nhập UID {uid}, không khớp UID {expected_uid}"
    return True, uid, "Phiên cookie hợp lệ"


def is_blocked_facebook_url(url: str) -> bool:
    normalized = (url or "").lower()
    return any(part in normalized for part in BLOCKED_SESSION_PATHS)


def sync_session_cookie(
    conn,
    uid: str,
    cookie_header: str,
    encrypt: Callable[[str], str],
) -> Dict[str, int]:
    """Đồng bộ một phiên hợp lệ sang Reg, Facebook Pro và Nuôi Nick."""
    uid = str(uid or "").strip()
    if not uid or not cookie_header:
        raise ValueError("Thiếu UID hoặc cookie phiên Facebook")

    encrypted_cookie = encrypt(cookie_header)
    table_rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    tables = {
        (row.get("name") if isinstance(row, dict) else row[0])
        for row in table_rows
    }
    updated = {"fb_reg": 0, "fb_pro": 0, "nuoinick": 0}

    if "fb_reg_accounts" in tables:
        cursor = conn.execute(
            """
            UPDATE fb_reg_accounts
            SET cookie=?, status='Live (Phiên đã lưu)',
                message='Đã xác minh /me và đồng bộ phiên đăng nhập mới.'
            WHERE uid=?
            """,
            (encrypted_cookie, uid),
        )
        updated["fb_reg"] = cursor.rowcount

    if "fb_accounts" in tables:
        cursor = conn.execute(
            "UPDATE fb_accounts SET cookie=?, status='Live' WHERE uid=?",
            (encrypted_cookie, uid),
        )
        updated["fb_pro"] = cursor.rowcount

    if "FacebookAccounts" in tables:
        cursor = conn.execute(
            """
            UPDATE FacebookAccounts
            SET Cookie=?, TrangThai='Live', TinhTrang='Phiên đăng nhập đã xác minh'
            WHERE Uid=?
            """,
            (encrypted_cookie, uid),
        )
        updated["nuoinick"] = cursor.rowcount

    conn.commit()
    return updated
