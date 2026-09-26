"""
GoogleSheetsSyncService — Port từ BaoSamBrowser.Automation.GoogleSheetsSyncService.

Hỗ trợ trích xuất Spreadsheet ID từ URL Google Sheets, chuẩn hoá dòng dữ liệu
để đồng bộ 2 chiều giữa Google Sheets và danh sách tài khoản nuôi nick.
"""

import re
from typing import Any, Dict, List, Optional, Tuple

SPREADSHEET_URL_REGEX = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")

SHEET_HEADERS = [
    "STT", "UID", "Mật khẩu", "2FA", "Token", "Cookie", "Email",
    "Mật khẩu mail", "Mail khôi phục", "Proxy", "Ghi chú", "Trạng thái", "Họ tên"
]

COLUMN_TO_FIELD = {
    "UID": "Uid",
    "Mật khẩu": "Pass",
    "2FA": "TwoFA",
    "Token": "Token",
    "Cookie": "Cookie",
    "Email": "Mail",
    "Mật khẩu mail": "PassMail",
    "Mail khôi phục": "MailKhoiPhuc",
    "Proxy": "Proxy",
    "Ghi chú": "GhiChu",
    "Trạng thái": "TrangThai",
    "Họ tên": "HoTen",
}


def extract_spreadsheet_id(url_or_id: str) -> Optional[str]:
    """Trích xuất ID Google Sheet từ URL hoặc chuỗi ID."""
    if not url_or_id:
        return None
    raw = url_or_id.strip()
    match = SPREADSHEET_URL_REGEX.search(raw)
    if match:
        return match.group(1)
    if re.match(r"^[a-zA-Z0-9-_]{20,60}$", raw):
        return raw
    return None


def build_sheet_rows(accounts: List[Dict[str, Any]]) -> List[List[str]]:
    """Chuyển danh sách tài khoản thành mảng 2 chiều kèm tiêu đề cột."""
    rows: List[List[str]] = [list(SHEET_HEADERS)]
    for idx, acc in enumerate(accounts, start=1):
        row = [
            str(idx),
            str(acc.get("Uid") or ""),
            str(acc.get("Pass") or ""),
            str(acc.get("TwoFA") or ""),
            str(acc.get("Token") or ""),
            str(acc.get("Cookie") or ""),
            str(acc.get("Mail") or ""),
            str(acc.get("PassMail") or ""),
            str(acc.get("MailKhoiPhuc") or ""),
            str(acc.get("Proxy") or ""),
            str(acc.get("GhiChu") or ""),
            str(acc.get("TrangThai") or ""),
            str(acc.get("HoTen") or ""),
        ]
        rows.append(row)
    return rows


def parse_sheet_rows(rows: List[List[str]]) -> List[Dict[str, str]]:
    """Phân tích các dòng từ Google Sheet thành danh sách tài khoản."""
    if not rows or len(rows) < 2:
        return []

    headers = [str(c).strip() for c in rows[0]]
    col_map: Dict[int, str] = {}
    for idx, h in enumerate(headers):
        if h in COLUMN_TO_FIELD:
            col_map[idx] = COLUMN_TO_FIELD[h]

    accounts: List[Dict[str, str]] = []
    for row in rows[1:]:
        if not row or not any(row):
            continue
        acc: Dict[str, str] = {}
        for idx, val in enumerate(row):
            if idx in col_map:
                acc[col_map[idx]] = str(val).strip()
        if acc.get("Uid"):
            accounts.append(acc)
    return accounts
