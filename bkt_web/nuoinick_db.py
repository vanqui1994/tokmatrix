"""
Lớp dữ liệu nuôi nick — port 1:1 từ testTuongTacWPF.Data của nuoinickbaosam 11.10.14.

Giữ nguyên tên bảng, tên cột, giá trị mặc định, tên thư mục hệ thống và toàn bộ
51 tác vụ mẫu của bản gốc. Hai bảng tài khoản gốc (FacebookAccounts và
PlatformAccounts theo từng nền tảng) được gộp về một họ bảng chung có tiền tố
theo nền tảng, đúng cách PlatformAccountDatabase dựng tên bảng động.

Khác bản gốc ở một điểm có chủ đích: các cột bí mật (Pass, TwoFA, Token, Cookie,
PassMail, PassMailKhoiPhuc) được mã hoá Fernet trước khi ghi, theo đúng quy ước
bảo mật đã áp dụng cho phần còn lại của bkt_web.

Bản web không dùng proxy ngoài: cột Proxy của bản gốc vẫn còn trong bảng để
không mất dữ liệu cũ, nhưng mọi kết nối đi ra đều qua WireGuard theo ba cột
VpnConfig / VpnLocation / Country.
"""

import json
import sqlite3
import time
from typing import Any, Dict, Iterable, List, Optional

DEFAULT_FOLDER_NAME = "Mặc định"

# Bảng gốc FacebookAccounts có thêm các cột chỉ Facebook mới dùng
FACEBOOK_ONLY_COLUMNS = (
    "PassMailKhoiPhuc", "BanBe", "Nhom", "GioiTinh", "Avatar", "TepCu", "TuongTacCuoi", "HoTen",
)

# Thứ tự cột đúng như câu INSERT của bản gốc
ACCOUNT_COLUMNS = (
    "Idx", "FolderId", "PhoneName", "ScriptId", "ScriptName", "Uid", "Pass", "TwoFA", "Token",
    "Cookie", "Mail", "PassMail", "MailKhoiPhuc", "PassMailKhoiPhuc", "BanBe", "Nhom", "GioiTinh",
    "Avatar", "ProfileChrome", "TenProfile", "UserAgent", "Proxy", "TepCu", "GhiChu",
    "TuongTacCuoi", "TrangThai", "TinhTrang", "BrowserProfileId", "HoTen",
    "VpnConfig", "VpnLocation", "Country",
)

SECRET_COLUMNS = ("Pass", "TwoFA", "Token", "Cookie", "PassMail", "PassMailKhoiPhuc")

# Nền tảng bản gốc hỗ trợ đầy đủ 5 nền tảng
PLATFORMS = ("Facebook", "TikTok", "Gmail", "Hotmail", "Shopee")

SEED_ACTIONS = [
    ('Phone', 'Chăm sóc tài khoản', 'Lướt tin nuôi theo đề xuất'),
    ('Phone', 'Chăm sóc tài khoản', 'Lướt xem Reels'),
    ('Phone', 'Chăm sóc tài khoản', 'Đăng nhập và Nghỉ ngơi'),
    ('Phone', 'Chăm sóc tài khoản', 'Đọc thông báo'),
    ('Phone', 'Chăm sóc tài khoản', 'Up avatar và ảnh bìa'),
    ('Phone', 'Chăm sóc tài khoản', 'Đổi tên tài khoản'),
    ('Phone', 'Chăm sóc tài khoản', 'Đăng story'),
    ('Phone', 'Chăm sóc tài khoản', 'Phê duyệt thành viên group'),
    ('Phone', 'Chăm sóc tài khoản', 'Từ chối bài viết group'),
    ('Phone', 'Chăm sóc tài khoản', 'Mời bạn bè vào group'),
    ('Phone', 'Tương tác nhóm', 'Tham gia nhóm'),
    ('Phone', 'Tương tác nhóm', 'Bình luận bài viết lên nhóm'),
    ('Phone', 'Tương tác nhóm', 'Đăng bài viết lên nhóm'),
    ('Phone', 'Tương tác nhóm', 'Đăng bài lên tường'),
    ('Phone', 'Tương tác nhóm', 'Nhắn tin người đăng bài trên nhóm'),
    ('Phone', 'Tương tác nhóm', 'Nhắn tin cho người bình luận nhóm'),
    ('Phone', 'Tương tác nhóm', 'Nhắn tin cho UID chỉ định'),
    ('Phone', 'Tương tác nhóm', 'Comment và like comment'),
    ('Phone', 'Tương tác nhóm', 'Report bài viết hoặc tài khoản'),
    ('Phone', 'Tương tác nhóm', 'Chia sẻ bài viết vào nhóm'),
    ('Phone', 'Kết bạn / tương tác', 'Kết bạn theo từ khoá'),
    ('Phone', 'Kết bạn / tương tác', 'Kết bạn theo gợi ý'),
    ('Phone', 'Kết bạn / tương tác', 'Kết bạn theo UID'),
    ('Phone', 'Kết bạn / tương tác', 'Huỷ lời mời kết bạn'),
    ('Phone', 'Kết bạn / tương tác', 'Xác nhận kết bạn'),
    ('Phone', 'Kết bạn / tương tác', 'Buff like và Buff follow'),
    ('Phone', 'Kết bạn / tương tác', 'Cập nhật thông tin'),
    ('Phone', 'Kết bạn / tương tác', 'Xem livestream và bình luận'),
    ('Phone', 'Kết bạn / tương tác', 'Mời bạn bè like Fanpage'),
    ('Phone', 'Kết bạn / tương tác', 'Check-in địa điểm'),
    ('Phone', 'Bài viết / Page', 'Share bài viết'),
    ('Phone', 'Bài viết / Page', 'Mời bạn bè vào nhóm'),
    ('Phone', 'Bài viết / Page', 'Rời nhóm'),
    ('Phone', 'Bài viết / Page', 'Tạo Page mới'),
    ('Phone', 'Bài viết / Page', 'Đánh giá và review page'),
    ('Phone', 'Bài viết / Page', 'Bật chế độ chuyên nghiệp'),
    ('Phone', 'Bài viết / Page', 'Đổi mật khẩu'),
    ('Phone', 'Bài viết / Page', 'Gắn thẻ bạn bè trong bài viết'),
    ('Phone', 'Bài viết / Page', 'Xóa/Ẩn bài viết cũ'),
    ('Phone', 'Bài viết / Page', 'Bật chế độ hẹn hò'),
    ('Phone', 'Kiếm tiền / khác', 'Kiếm tiền Like TBL'),
    ('Phone', 'Kiếm tiền / khác', 'Kiếm tiền Comment'),
    ('Phone', 'Kiếm tiền / khác', 'Kiếm tiền Share bài viết'),
    ('Phone', 'Kiếm tiền / khác', 'Kiếm tiền Follow'),
    ('Phone', 'Kiếm tiền / khác', 'Kiếm tiền Tham gia nhóm'),
    ('Phone', 'Kiếm tiền / khác', 'Kiếm tiền Review Fanpage'),
    ('Phone', 'Kiếm tiền / khác', 'Kiếm tiền ALL job'),
    ('Phone', 'Kiếm tiền / khác', 'Tạo BM business'),
    ('Phone', 'Kiếm tiền / khác', 'Tạo tài khoản intagram'),
    ('Phone', 'Kiếm tiền / khác', 'Reg nick web'),
    ('Chrome', 'Chăm sóc tài khoản', 'Đăng nhập và giữ phiên'),
]

_ACCOUNT_TABLE = {
    "Facebook": "FacebookAccounts",
    "TikTok": "TikTokAccounts",
    "Gmail": "GmailAccounts",
    "Hotmail": "HotmailAccounts",
    "Shopee": "ShopeeAccounts",
}
_FOLDER_TABLE = {
    "Facebook": "NickFolders",
    "TikTok": "TikTokNickFolders",
    "Gmail": "GmailNickFolders",
    "Hotmail": "HotmailNickFolders",
    "Shopee": "ShopeeNickFolders",
}


def account_table(platform: str) -> str:
    if platform not in _ACCOUNT_TABLE:
        raise ValueError(f"Nền tảng '{platform}' không được hỗ trợ")
    return _ACCOUNT_TABLE[platform]


def folder_table(platform: str) -> str:
    if platform not in _FOLDER_TABLE:
        raise ValueError(f"Nền tảng '{platform}' không được hỗ trợ")
    return _FOLDER_TABLE[platform]


def _columns_ddl() -> str:
    return """
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        Idx INTEGER NOT NULL,
        FolderId INTEGER NOT NULL DEFAULT 0,
        PhoneName TEXT NOT NULL DEFAULT '',
        ScriptId INTEGER NOT NULL DEFAULT 0,
        ScriptName TEXT NOT NULL DEFAULT '',
        Uid TEXT NOT NULL DEFAULT '',
        Pass TEXT NOT NULL DEFAULT '',
        TwoFA TEXT NOT NULL DEFAULT '',
        Token TEXT NOT NULL DEFAULT '',
        Cookie TEXT NOT NULL DEFAULT '',
        Mail TEXT NOT NULL DEFAULT '',
        PassMail TEXT NOT NULL DEFAULT '',
        MailKhoiPhuc TEXT NOT NULL DEFAULT '',
        PassMailKhoiPhuc TEXT NOT NULL DEFAULT '',
        BanBe TEXT NOT NULL DEFAULT '',
        Nhom TEXT NOT NULL DEFAULT '',
        GioiTinh TEXT NOT NULL DEFAULT '',
        Avatar TEXT NOT NULL DEFAULT '',
        ProfileChrome TEXT NOT NULL DEFAULT '',
        TenProfile TEXT NOT NULL DEFAULT '',
        UserAgent TEXT NOT NULL DEFAULT '',
        Proxy TEXT NOT NULL DEFAULT '',
        TepCu TEXT NOT NULL DEFAULT '',
        GhiChu TEXT NOT NULL DEFAULT '',
        TuongTacCuoi TEXT NOT NULL DEFAULT '',
        TrangThai TEXT NOT NULL DEFAULT '',
        TinhTrang TEXT NOT NULL DEFAULT '',
        BrowserProfileId TEXT NOT NULL DEFAULT '',
        HoTen TEXT NOT NULL DEFAULT '',
        VpnConfig TEXT NOT NULL DEFAULT '',
        VpnLocation TEXT NOT NULL DEFAULT '',
        Country TEXT NOT NULL DEFAULT 'US'
    """


def ensure_created(conn: sqlite3.Connection) -> None:
    """FacebookAccountDatabase.EnsureCreated + PlatformAccountDatabase.EnsureCreated"""
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS Actions (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Category TEXT NOT NULL DEFAULT '',
            Platform TEXT NOT NULL DEFAULT 'Phone'
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ScriptFolders (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Platform TEXT NOT NULL DEFAULT 'Phone',
            AiVisionFlowJson TEXT NOT NULL DEFAULT '[]'
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ScriptFolderActions (
            ScriptFolderId INTEGER NOT NULL,
            ActionId INTEGER NOT NULL,
            PRIMARY KEY (ScriptFolderId, ActionId)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS BrowserGroups (
            Id TEXT PRIMARY KEY,
            Name TEXT NOT NULL,
            SortOrder INTEGER NOT NULL DEFAULT 0
        )
    """)
    cur.execute("""
        INSERT OR IGNORE INTO BrowserGroups (Id, Name, SortOrder) VALUES ('Default', 'Mặc định', 0)
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS BrowserProxies (
            Id TEXT PRIMARY KEY,
            RawProxy TEXT NOT NULL DEFAULT '',
            Name TEXT NOT NULL DEFAULT '',
            Folder TEXT NOT NULL DEFAULT 'Default',
            Status TEXT NOT NULL DEFAULT 'live',
            Protocol TEXT NOT NULL DEFAULT 'http',
            PingMs INTEGER NOT NULL DEFAULT -1,
            RealIp TEXT NOT NULL DEFAULT '',
            Country TEXT NOT NULL DEFAULT '',
            LastCheckedAt TEXT NOT NULL DEFAULT '',
            LastError TEXT NOT NULL DEFAULT '',
            OriginalInput TEXT NOT NULL DEFAULT ''
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS BrowserProfiles (
            Id TEXT PRIMARY KEY,
            Name TEXT NOT NULL DEFAULT '',
            GroupId TEXT NOT NULL DEFAULT 'Default',
            RawProxy TEXT NOT NULL DEFAULT '',
            BrowserName TEXT NOT NULL DEFAULT 'Chrome',
            BrowserVersion TEXT NOT NULL DEFAULT '128',
            OsType INTEGER NOT NULL DEFAULT 1,
            CustomUserAgent TEXT NOT NULL DEFAULT '',
            WebrtcMode INTEGER NOT NULL DEFAULT 1,
            FixedWebrtcPublicIp TEXT NOT NULL DEFAULT '',
            CanvasMode INTEGER NOT NULL DEFAULT 1,
            WebglImageMode INTEGER NOT NULL DEFAULT 1,
            AudioMode INTEGER NOT NULL DEFAULT 1,
            ClientRectMode INTEGER NOT NULL DEFAULT 1,
            GeolocationMode INTEGER NOT NULL DEFAULT 2,
            TimezoneBaseOnIp INTEGER NOT NULL DEFAULT 1,
            Timezone TEXT NOT NULL DEFAULT '',
            IsLanguageBaseOnIp INTEGER NOT NULL DEFAULT 0,
            FixedLanguage TEXT NOT NULL DEFAULT 'en-US',
            StartupUrls TEXT NOT NULL DEFAULT '',
            Note TEXT NOT NULL DEFAULT '',
            Status TEXT NOT NULL DEFAULT 'idle',
            DeletedAt TEXT NULL,
            CreatedAt TEXT NOT NULL,
            LastOpenedAt TEXT NULL,
            Tags TEXT NOT NULL DEFAULT '',
            Resolution TEXT NOT NULL DEFAULT '1920x1080',
            Cores INTEGER NOT NULL DEFAULT 8,
            Memory INTEGER NOT NULL DEFAULT 8,
            WebglVendor TEXT NOT NULL DEFAULT '',
            WebglRenderer TEXT NOT NULL DEFAULT ''
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS BrowserExtensions (
            Id TEXT PRIMARY KEY,
            Name TEXT NOT NULL,
            SourceType TEXT NOT NULL DEFAULT 'url',
            SourceUrl TEXT NOT NULL DEFAULT '',
            LocalPath TEXT NOT NULL DEFAULT '',
            Version TEXT NOT NULL DEFAULT '1.0.0',
            IsActive INTEGER NOT NULL DEFAULT 1,
            CreatedAt TEXT NOT NULL
        )
    """)
    for platform in PLATFORMS:
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {folder_table(platform)} (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Name TEXT NOT NULL,
                IsSystem INTEGER NOT NULL DEFAULT 0
            )
        """)
        cur.execute(f"CREATE TABLE IF NOT EXISTS {account_table(platform)} ({_columns_ddl()})")

        # Bảng tạo từ bản trước chưa có cột VPN
        cur.execute(f"PRAGMA table_info({account_table(platform)})")
        existing = {row[1] for row in cur.fetchall()}
        for column, ddl in (
            ("VpnConfig", "TEXT NOT NULL DEFAULT ''"),
            ("VpnLocation", "TEXT NOT NULL DEFAULT ''"),
            ("Country", "TEXT NOT NULL DEFAULT 'US'"),
        ):
            if column not in existing:
                cur.execute(f"ALTER TABLE {account_table(platform)} ADD COLUMN {column} {ddl}")

        # Thư mục hệ thống "Mặc định" và dồn nick mồ côi về đó, đúng như bản gốc
        cur.execute(f"SELECT Id FROM {folder_table(platform)} WHERE IsSystem = 1 ORDER BY Id LIMIT 1")
        row = cur.fetchone()
        if row is None:
            cur.execute(
                f"INSERT INTO {folder_table(platform)} (Name, IsSystem) VALUES (?, 1)",
                (DEFAULT_FOLDER_NAME,),
            )
            default_id = cur.lastrowid
        else:
            default_id = row[0]
            cur.execute(
                f"UPDATE {folder_table(platform)} SET Name = ? WHERE Id = ?",
                (DEFAULT_FOLDER_NAME, default_id),
            )
        cur.execute(
            f"UPDATE {account_table(platform)} SET FolderId = ? WHERE FolderId = 0",
            (default_id,),
        )

    for platform, category, name in SEED_ACTIONS:
        cur.execute(
            """
            INSERT INTO Actions (Name, Category, Platform)
            SELECT ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM Actions WHERE Name = ? AND Platform = ?)
            """,
            (name, category, platform, name, platform),
        )
    conn.commit()


def default_folder_id(conn: sqlite3.Connection, platform: str) -> int:
    cur = conn.cursor()
    cur.execute(f"SELECT Id FROM {folder_table(platform)} WHERE IsSystem = 1 ORDER BY Id LIMIT 1")
    row = cur.fetchone()
    return row[0] if row else 0


# ------------------------------------------------------------------ folders

def load_folders(conn: sqlite3.Connection, platform: str) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(
        f"""SELECT f.Id, f.Name, f.IsSystem,
                   (SELECT COUNT(*) FROM {account_table(platform)} a WHERE a.FolderId = f.Id)
            FROM {folder_table(platform)} f ORDER BY f.IsSystem DESC, f.Name"""
    )
    return [
        {"id": r[0], "name": r[1], "is_system": bool(r[2]), "count": r[3]}
        for r in cur.fetchall()
    ]


def create_folder(conn: sqlite3.Connection, platform: str, name: str) -> Dict[str, Any]:
    name = (name or "").strip()
    if not name:
        raise ValueError("Tên thư mục không được để trống")
    cur = conn.cursor()
    cur.execute(f"INSERT INTO {folder_table(platform)} (Name, IsSystem) VALUES (?, 0)", (name,))
    conn.commit()
    return {"id": cur.lastrowid, "name": name, "is_system": False, "count": 0}


def rename_folder(conn: sqlite3.Connection, platform: str, folder_id: int, new_name: str) -> None:
    new_name = (new_name or "").strip()
    if not new_name:
        raise ValueError("Tên thư mục không được để trống")
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {folder_table(platform)} SET Name = ? WHERE Id = ? AND IsSystem = 0",
        (new_name, folder_id),
    )
    conn.commit()


def delete_folder(conn: sqlite3.Connection, platform: str, folder_id: int) -> None:
    """Bản gốc không xoá nick trong thư mục mà chuyển chúng về thư mục mặc định."""
    cur = conn.cursor()
    cur.execute(f"SELECT IsSystem FROM {folder_table(platform)} WHERE Id = ?", (folder_id,))
    row = cur.fetchone()
    if row is None:
        return
    if row[0]:
        raise ValueError("Không xoá được thư mục hệ thống")
    fallback = default_folder_id(conn, platform)
    cur.execute(
        f"UPDATE {account_table(platform)} SET FolderId = ? WHERE FolderId = ?",
        (fallback, folder_id),
    )
    cur.execute(f"DELETE FROM {folder_table(platform)} WHERE Id = ?", (folder_id,))
    conn.commit()


# ------------------------------------------------------------------ actions

def load_actions(conn: sqlite3.Connection, platform: Optional[str] = None) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    if platform:
        cur.execute(
            "SELECT Id, Name, Category, Platform FROM Actions WHERE Platform = ? ORDER BY Id",
            (platform,),
        )
    else:
        cur.execute("SELECT Id, Name, Category, Platform FROM Actions ORDER BY Id")
    return [
        {"id": r[0], "name": r[1], "category": r[2], "platform": r[3]}
        for r in cur.fetchall()
    ]


# ------------------------------------------------------------ script folders

def load_script_folders(conn: sqlite3.Connection, platform: Optional[str] = None) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    if platform:
        cur.execute(
            "SELECT Id, Name, Platform, AiVisionFlowJson FROM ScriptFolders WHERE Platform = ? ORDER BY Id",
            (platform,),
        )
    else:
        cur.execute("SELECT Id, Name, Platform, AiVisionFlowJson FROM ScriptFolders ORDER BY Id")
    out = []
    for r in cur.fetchall():
        try:
            flow = json.loads(r[3] or "[]")
        except json.JSONDecodeError:
            flow = []
        out.append({"id": r[0], "name": r[1], "platform": r[2], "flow": flow, "step_count": len(flow)})
    return out


def create_script_folder(conn: sqlite3.Connection, name: str, platform: str) -> Dict[str, Any]:
    name = (name or "").strip()
    if not name:
        raise ValueError("Tên kịch bản không được để trống")
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO ScriptFolders (Name, Platform, AiVisionFlowJson) VALUES (?, ?, '[]')",
        (name, platform),
    )
    conn.commit()
    return {"id": cur.lastrowid, "name": name, "platform": platform, "flow": [], "step_count": 0}


def rename_script_folder(conn: sqlite3.Connection, folder_id: int, new_name: str) -> None:
    new_name = (new_name or "").strip()
    if not new_name:
        raise ValueError("Tên kịch bản không được để trống")
    cur = conn.cursor()
    cur.execute("UPDATE ScriptFolders SET Name = ? WHERE Id = ?", (new_name, folder_id))
    conn.commit()


def delete_script_folder(conn: sqlite3.Connection, folder_id: int) -> None:
    cur = conn.cursor()
    cur.execute("DELETE FROM ScriptFolderActions WHERE ScriptFolderId = ?", (folder_id,))
    cur.execute("DELETE FROM ScriptFolders WHERE Id = ?", (folder_id,))
    for platform in PLATFORMS:
        cur.execute(
            f"UPDATE {account_table(platform)} SET ScriptId = 0, ScriptName = '' WHERE ScriptId = ?",
            (folder_id,),
        )
    conn.commit()


def save_script_flow(conn: sqlite3.Connection, folder_id: int, flow: List[Dict[str, Any]]) -> None:
    """SaveScriptFolderAiVisionFlow"""
    cur = conn.cursor()
    cur.execute(
        "UPDATE ScriptFolders SET AiVisionFlowJson = ? WHERE Id = ?",
        (json.dumps(flow, ensure_ascii=False), folder_id),
    )
    conn.commit()


def load_action_ids_for_folder(conn: sqlite3.Connection, folder_id: int) -> List[int]:
    cur = conn.cursor()
    cur.execute("SELECT ActionId FROM ScriptFolderActions WHERE ScriptFolderId = ?", (folder_id,))
    return [r[0] for r in cur.fetchall()]


def set_action_in_folder(conn: sqlite3.Connection, folder_id: int, action_id: int, included: bool) -> None:
    cur = conn.cursor()
    if included:
        cur.execute(
            "INSERT OR IGNORE INTO ScriptFolderActions (ScriptFolderId, ActionId) VALUES (?, ?)",
            (folder_id, action_id),
        )
    else:
        cur.execute(
            "DELETE FROM ScriptFolderActions WHERE ScriptFolderId = ? AND ActionId = ?",
            (folder_id, action_id),
        )
    conn.commit()


# ----------------------------------------------------------------- accounts

def _decode_row(row: sqlite3.Row, decrypt) -> Dict[str, Any]:
    out = {"Id": row["Id"]}
    for col in ACCOUNT_COLUMNS:
        value = row[col]
        out[col] = decrypt(value) if col in SECRET_COLUMNS else value
    return out


def load_accounts(
    conn: sqlite3.Connection,
    platform: str,
    decrypt,
    folder_id: Optional[int] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """FacebookAccountDatabase.LoadAll, có thêm lọc theo thư mục và từ khoá."""
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    sql = f"SELECT * FROM {account_table(platform)}"
    params: List[Any] = []
    if folder_id:
        sql += " WHERE FolderId = ?"
        params.append(folder_id)
    sql += " ORDER BY Idx, Id"
    cur.execute(sql, params)
    rows = [_decode_row(r, decrypt) for r in cur.fetchall()]

    if search:
        needle = search.strip().lower()
        rows = [
            r for r in rows
            if needle in str(r.get("Uid", "")).lower()
            or needle in str(r.get("HoTen", "")).lower()
            or needle in str(r.get("Mail", "")).lower()
            or needle in str(r.get("GhiChu", "")).lower()
            or needle in str(r.get("TenProfile", "")).lower()
        ]
    return rows


def insert_accounts(
    conn: sqlite3.Connection,
    platform: str,
    rows: Iterable[Dict[str, Any]],
    encrypt,
    folder_id: int,
) -> int:
    table = account_table(platform)
    cur = conn.cursor()
    cur.execute(f"SELECT COALESCE(MAX(Idx), 0) FROM {table}")
    next_idx = (cur.fetchone()[0] or 0) + 1

    placeholders = ", ".join("?" * len(ACCOUNT_COLUMNS))
    sql = f"INSERT INTO {table} ({', '.join(ACCOUNT_COLUMNS)}) VALUES ({placeholders})"

    inserted = 0
    for row in rows:
        values = []
        for col in ACCOUNT_COLUMNS:
            if col == "Idx":
                values.append(next_idx)
            elif col == "FolderId":
                values.append(row.get("FolderId") or folder_id)
            elif col == "ScriptId":
                values.append(int(row.get("ScriptId") or 0))
            else:
                raw = row.get(col, "") or ""
                values.append(encrypt(raw) if col in SECRET_COLUMNS else str(raw))
        cur.execute(sql, values)
        next_idx += 1
        inserted += 1
    conn.commit()
    return inserted


def update_account(
    conn: sqlite3.Connection,
    platform: str,
    account_id: int,
    changes: Dict[str, Any],
    encrypt,
) -> None:
    editable = [c for c in changes if c in ACCOUNT_COLUMNS]
    if not editable:
        return
    sets = ", ".join(f"{c} = ?" for c in editable)
    values = [
        encrypt(changes[c] or "") if c in SECRET_COLUMNS else str(changes[c] if changes[c] is not None else "")
        for c in editable
    ]
    values.append(account_id)
    cur = conn.cursor()
    cur.execute(f"UPDATE {account_table(platform)} SET {sets} WHERE Id = ?", values)
    conn.commit()


def bulk_update(
    conn: sqlite3.Connection,
    platform: str,
    account_ids: List[int],
    changes: Dict[str, Any],
    encrypt,
) -> int:
    """BulkUpdateWindow — áp một bộ giá trị cho nhiều nick cùng lúc."""
    editable = [c for c in changes if c in ACCOUNT_COLUMNS]
    if not editable or not account_ids:
        return 0
    sets = ", ".join(f"{c} = ?" for c in editable)
    base = [
        encrypt(changes[c] or "") if c in SECRET_COLUMNS else str(changes[c] if changes[c] is not None else "")
        for c in editable
    ]
    marks = ",".join("?" * len(account_ids))
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {account_table(platform)} SET {sets} WHERE Id IN ({marks})",
        base + list(account_ids),
    )
    conn.commit()
    return cur.rowcount


def assign_script(
    conn: sqlite3.Connection, platform: str, account_ids: List[int], script_id: int
) -> int:
    cur = conn.cursor()
    cur.execute("SELECT Name FROM ScriptFolders WHERE Id = ?", (script_id,))
    row = cur.fetchone()
    if row is None and script_id != 0:
        raise ValueError("Kịch bản không tồn tại")
    script_name = row[0] if row else ""
    marks = ",".join("?" * len(account_ids))
    cur.execute(
        f"UPDATE {account_table(platform)} SET ScriptId = ?, ScriptName = ? WHERE Id IN ({marks})",
        [script_id, script_name] + list(account_ids),
    )
    conn.commit()
    return cur.rowcount


def move_to_folder(
    conn: sqlite3.Connection, platform: str, account_ids: List[int], folder_id: int
) -> int:
    marks = ",".join("?" * len(account_ids))
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {account_table(platform)} SET FolderId = ? WHERE Id IN ({marks})",
        [folder_id] + list(account_ids),
    )
    conn.commit()
    return cur.rowcount


def delete_accounts(conn: sqlite3.Connection, platform: str, account_ids: List[int]) -> int:
    if not account_ids:
        return 0
    marks = ",".join("?" * len(account_ids))
    cur = conn.cursor()
    cur.execute(f"DELETE FROM {account_table(platform)} WHERE Id IN ({marks})", account_ids)
    conn.commit()
    return cur.rowcount


def reindex(conn: sqlite3.Connection, platform: str) -> None:
    """Đánh lại cột Idx liên tục từ 1 sau khi xoá, giống hành vi SaveAll của bản gốc."""
    table = account_table(platform)
    cur = conn.cursor()
    cur.execute(f"SELECT Id FROM {table} ORDER BY Idx, Id")
    for position, (row_id,) in enumerate(cur.fetchall(), start=1):
        cur.execute(f"UPDATE {table} SET Idx = ? WHERE Id = ?", (position, row_id))
    conn.commit()


# Thứ tự cột khi nhập: bản gốc để proxy ở cuối, bản web thay bằng mã quốc gia VPN
IMPORT_FIELD_ORDER = (
    "Uid", "Pass", "TwoFA", "Token", "Cookie", "Mail", "PassMail", "MailKhoiPhuc", "Country",
)


def parse_import_lines(raw: str, separator: str = "|") -> Dict[str, Any]:
    """
    ImportFacebookWindow — mỗi dòng một nick, các trường ngăn bằng dấu phân cách.
    Dòng thiếu trường thì các trường sau để rỗng; dòng không có UID bị bỏ qua.
    """
    parsed: List[Dict[str, str]] = []
    skipped: List[str] = []
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(separator)]
        if not parts or not parts[0]:
            skipped.append(line)
            continue
        row = {field: "" for field in ACCOUNT_COLUMNS}
        for field, value in zip(IMPORT_FIELD_ORDER, parts):
            row[field] = value
        parsed.append(row)
    return {"rows": parsed, "skipped": skipped}


def export_accounts(rows: List[Dict[str, Any]], fields: List[str], separator: str = "|") -> str:
    """PlatformAccountExportItem / FacebookExportItem — xuất theo cột người dùng chọn."""
    chosen = [f for f in fields if f in ACCOUNT_COLUMNS]
    if not chosen:
        chosen = list(IMPORT_FIELD_ORDER)
    return "\n".join(separator.join(str(r.get(f, "") or "") for f in chosen) for r in rows)


# ==============================================================================
# ANTIDETECT BROWSER PROFILES & GROUPS & PROXIES (Port từ BaoSamBrowser)
# ==============================================================================

PROFILE_COLUMNS = (
    "Id", "Name", "GroupId", "RawProxy", "BrowserName", "BrowserVersion", "OsType",
    "CustomUserAgent", "WebrtcMode", "FixedWebrtcPublicIp", "CanvasMode", "WebglImageMode",
    "AudioMode", "ClientRectMode", "GeolocationMode", "TimezoneBaseOnIp", "Timezone",
    "IsLanguageBaseOnIp", "FixedLanguage", "StartupUrls", "Note", "Status", "DeletedAt",
    "CreatedAt", "LastOpenedAt", "Tags", "Resolution", "Cores", "Memory", "WebglVendor", "WebglRenderer"
)


def load_browser_groups(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute("SELECT Id, Name, SortOrder FROM BrowserGroups ORDER BY SortOrder, Name")
    return [{"Id": r[0], "Name": r[1], "SortOrder": r[2]} for r in cur.fetchall()]


def create_browser_group(conn: sqlite3.Connection, group_id: str, name: str) -> Dict[str, Any]:
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO BrowserGroups (Id, Name) VALUES (?, ?)", (group_id, name))
    conn.commit()
    return {"Id": group_id, "Name": name}


def delete_browser_group(conn: sqlite3.Connection, group_id: str) -> bool:
    if group_id == "Default":
        return False
    cur = conn.cursor()
    cur.execute("DELETE FROM BrowserGroups WHERE Id = ?", (group_id,))
    cur.execute("UPDATE BrowserProfiles SET GroupId = 'Default' WHERE GroupId = ?", (group_id,))
    conn.commit()
    return cur.rowcount > 0


def load_browser_profiles(
    conn: sqlite3.Connection, group_id: Optional[str] = None, search: Optional[str] = None
) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    query = f"SELECT {','.join(PROFILE_COLUMNS)} FROM BrowserProfiles WHERE (DeletedAt IS NULL OR DeletedAt = '')"
    params: List[Any] = []
    if group_id and group_id != "all":
        query += " AND GroupId = ?"
        params.append(group_id)
    if search:
        query += " AND (Name LIKE ? OR RawProxy LIKE ? OR Note LIKE ? OR Tags LIKE ?)"
        s = f"%{search.strip()}%"
        params.extend([s, s, s, s])
    query += " ORDER BY CreatedAt DESC"
    cur.execute(query, params)
    rows = cur.fetchall()
    return [dict(zip(PROFILE_COLUMNS, r)) for r in rows]


def get_browser_profile(conn: sqlite3.Connection, profile_id: str) -> Optional[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(f"SELECT {','.join(PROFILE_COLUMNS)} FROM BrowserProfiles WHERE Id = ?", (profile_id,))
    row = cur.fetchone()
    if not row:
        return None
    if isinstance(row, dict):
        return {column: row.get(column) for column in PROFILE_COLUMNS}
    if isinstance(row, sqlite3.Row):
        return {column: row[column] for column in PROFILE_COLUMNS}
    return dict(zip(PROFILE_COLUMNS, row))


def save_browser_profile(conn: sqlite3.Connection, profile: Dict[str, Any]) -> str:
    import uuid, datetime
    pid = profile.get("Id") or uuid.uuid4().hex[:12]
    now = datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z")
    
    # Check if exists
    cur = conn.cursor()
    cur.execute("SELECT Id FROM BrowserProfiles WHERE Id = ?", (pid,))
    exists = cur.fetchone() is not None

    cols = list(PROFILE_COLUMNS)
    if not exists:
        vals = []
        for c in cols:
            if c == "Id":
                vals.append(pid)
            elif c == "CreatedAt":
                vals.append(profile.get("CreatedAt") or now)
            elif c == "Status":
                vals.append(profile.get("Status") or "idle")
            elif c == "DeletedAt":
                vals.append(profile.get("DeletedAt") or None)
            else:
                vals.append(profile.get(c, ""))
        marks = ",".join("?" * len(cols))
        cur.execute(f"INSERT INTO BrowserProfiles ({','.join(cols)}) VALUES ({marks})", vals)
    else:
        updates = []
        vals = []
        for c in cols:
            if c not in ("Id", "CreatedAt"):
                updates.append(f"{c} = ?")
                if c == "DeletedAt":
                    vals.append(profile.get("DeletedAt") or None)
                else:
                    vals.append(profile.get(c, ""))
        vals.append(pid)
        cur.execute(f"UPDATE BrowserProfiles SET {', '.join(updates)} WHERE Id = ?", vals)
    conn.commit()
    return pid


def delete_browser_profile(conn: sqlite3.Connection, profile_id: str) -> bool:
    """Chuyển profile vào thùng rác (Soft Delete) chuẩn GPM Login."""
    import datetime
    now = datetime.datetime.utcnow().isoformat() + "Z"
    cur = conn.cursor()
    cur.execute("UPDATE BrowserProfiles SET DeletedAt = ? WHERE Id = ?", (now, profile_id))
    conn.commit()
    return cur.rowcount > 0


def load_trash_profiles(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Tải danh sách profile đang nằm trong thùng rác."""
    cur = conn.cursor()
    cur.execute(f"SELECT {','.join(PROFILE_COLUMNS)} FROM BrowserProfiles WHERE DeletedAt IS NOT NULL AND DeletedAt != '' ORDER BY DeletedAt DESC")
    rows = cur.fetchall()
    return [dict(zip(PROFILE_COLUMNS, r)) for r in rows]


def restore_browser_profile(conn: sqlite3.Connection, profile_id: str) -> bool:
    """Khôi phục profile từ thùng rác."""
    cur = conn.cursor()
    cur.execute("UPDATE BrowserProfiles SET DeletedAt = NULL WHERE Id = ?", (profile_id,))
    conn.commit()
    return cur.rowcount > 0


def permanent_delete_browser_profile(conn: sqlite3.Connection, profile_id: str, profiles_dir: Optional[Any] = None) -> bool:
    """Xoá vĩnh viễn profile khỏi CSDL và xoá thư mục profile trên đĩa."""
    import shutil
    from pathlib import Path
    cur = conn.cursor()
    cur.execute("DELETE FROM BrowserProfiles WHERE Id = ?", (profile_id,))
    conn.commit()

    # Dọn dẹp thư mục profile trên ổ đĩa
    if not profiles_dir:
        profiles_dir = Path(__file__).resolve().parent / "profiles"
    p_path = Path(profiles_dir) / profile_id
    if p_path.exists() and p_path.is_dir():
        try:
            shutil.rmtree(p_path)
        except Exception:
            pass
    return cur.rowcount > 0


def empty_trash_browser_profiles(conn: sqlite3.Connection, profiles_dir: Optional[Any] = None) -> int:
    """Dọn sạch toàn bộ thùng rác profile."""
    trash = load_trash_profiles(conn)
    count = 0
    for p in trash:
        if permanent_delete_browser_profile(conn, p["Id"], profiles_dir):
            count += 1
    return count


def bulk_create_browser_profiles(conn: sqlite3.Connection, profiles_list: List[Dict[str, Any]]) -> int:
    """Tạo hàng loạt profile (Create By Number hoặc Excel Import) trong một transaction."""
    count = 0
    for p in profiles_list:
        save_browser_profile(conn, p)
        count += 1
    return count


def bulk_update_group(conn: sqlite3.Connection, profile_ids: List[str], group_id: str) -> int:
    """Đổi nhóm hàng loạt cho các profile đã chọn."""
    if not profile_ids:
        return 0
    cur = conn.cursor()
    marks = ",".join("?" * len(profile_ids))
    cur.execute(f"UPDATE BrowserProfiles SET GroupId = ? WHERE Id IN ({marks})", [group_id] + profile_ids)
    conn.commit()
    return cur.rowcount


def bulk_update_proxy(conn: sqlite3.Connection, profile_ids: List[str], raw_proxy: str) -> int:
    """Gán proxy hàng loạt cho các profile đã chọn."""
    if not profile_ids:
        return 0
    cur = conn.cursor()
    marks = ",".join("?" * len(profile_ids))
    cur.execute(f"UPDATE BrowserProfiles SET RawProxy = ? WHERE Id IN ({marks})", [raw_proxy.strip()] + profile_ids)
    conn.commit()
    return cur.rowcount


def bulk_random_fingerprint(conn: sqlite3.Connection, profile_ids: List[str]) -> int:
    """Random lại toàn bộ vân tay (Canvas, WebGL, Audio, Screen, Hardware) cho danh sách profile."""
    if not profile_ids:
        return 0
    try:
        from fingerprint import generate_random_fingerprint_dict
    except ImportError:
        from bkt_web.fingerprint import generate_random_fingerprint_dict

    count = 0
    cur = conn.cursor()
    for pid in profile_ids:
        cur.execute("SELECT OsType, BrowserVersion FROM BrowserProfiles WHERE Id = ?", (pid,))
        row = cur.fetchone()
        os_type = row[0] if row and row[0] else 1
        ver = row[1] if row and row[1] else "128"
        fp = generate_random_fingerprint_dict(os_type, ver)
        cur.execute("""
            UPDATE BrowserProfiles SET
                CustomUserAgent = ?,
                CanvasMode = ?,
                WebglImageMode = ?,
                WebglVendor = ?,
                WebglRenderer = ?,
                AudioMode = ?,
                WebrtcMode = ?,
                ClientRectMode = ?,
                Resolution = ?,
                Cores = ?,
                Memory = ?
            WHERE Id = ?
        """, (
            fp["CustomUserAgent"],
            fp["CanvasMode"],
            fp["WebglImageMode"],
            fp["WebglVendor"],
            fp["WebglRenderer"],
            fp["AudioMode"],
            fp["WebrtcMode"],
            fp["ClientRectMode"],
            fp["Resolution"],
            fp["Cores"],
            fp["Memory"],
            pid
        ))
        count += 1
    conn.commit()
    return count


def bulk_update_browser_version(
    conn: sqlite3.Connection,
    profile_ids: List[str],
    new_version: str,
    browser_type: str = "Chrome",
    update_ua: bool = True
) -> int:
    """Cập nhật phiên bản trình duyệt / Chromium Core cho hàng loạt profile (GPM SelectBrowserVersion)."""
    try:
        from bkt_web.fingerprint import generate_user_agent
    except ImportError:
        from fingerprint import generate_user_agent
    cur = conn.cursor()
    count = 0
    clean_ver = str(new_version).strip() or "132"
    for pid in profile_ids:
        cur.execute("SELECT OsType, BrowserName FROM BrowserProfiles WHERE Id = ?", (pid,))
        row = cur.fetchone()
        os_type = row[0] if row and row[0] else 1
        b_name = browser_type or (row[1] if row and row[1] else "Chrome")
        if update_ua:
            new_ua = generate_user_agent(os_type, clean_ver)
            cur.execute(
                "UPDATE BrowserProfiles SET BrowserVersion = ?, BrowserName = ?, CustomUserAgent = ? WHERE Id = ?",
                (clean_ver, b_name, new_ua, pid)
            )
        else:
            cur.execute(
                "UPDATE BrowserProfiles SET BrowserVersion = ?, BrowserName = ? WHERE Id = ?",
                (clean_ver, b_name, pid)
            )
        count += 1
    conn.commit()
    return count


def clear_profile_cache(profile_id: str, profiles_dir: Optional[Any] = None) -> Dict[str, Any]:
    """Xoá cache profile (Default/Cache, Code Cache, GPUCache) theo chuẩn ClearCacheConfig của GPM."""
    import shutil
    from pathlib import Path
    if not profiles_dir:
        profiles_dir = Path(__file__).resolve().parent / "profiles"
    p_path = Path(profiles_dir) / profile_id
    if not p_path.exists() or not p_path.is_dir():
        return {"success": False, "detail": "Thư mục profile không tồn tại"}

    cache_targets = [
        "Default/Cache",
        "Default/Code Cache",
        "Default/GPUCache",
        "Default/Service Worker/CacheStorage",
        "Default/Service Worker/ScriptCache",
        "ShaderCache",
        "GrShaderCache"
    ]
    cleared = []
    freed_bytes = 0
    for rel in cache_targets:
        target = p_path / rel
        if target.exists():
            try:
                if target.is_dir():
                    size = sum(f.stat().st_size for f in target.glob("**/*") if f.is_file())
                    shutil.rmtree(target)
                    freed_bytes += size
                else:
                    freed_bytes += target.stat().st_size
                    target.unlink()
                cleared.append(rel)
            except Exception:
                pass
    return {"success": True, "cleared_folders": cleared, "freed_mb": round(freed_bytes / (1024 * 1024), 2)}


# --- Extension Helpers (GPM Plugin / Extension Module) ---

EXTENSION_COLUMNS = ("Id", "Name", "SourceType", "SourceUrl", "LocalPath", "Version", "IsActive", "CreatedAt")

def load_browser_extensions(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(f"SELECT {','.join(EXTENSION_COLUMNS)} FROM BrowserExtensions ORDER BY CreatedAt DESC")
    rows = cur.fetchall()
    return [dict(zip(EXTENSION_COLUMNS, r)) for r in rows]


def save_browser_extension(conn: sqlite3.Connection, ext: Dict[str, Any]) -> str:
    import uuid, datetime
    eid = ext.get("Id") or uuid.uuid4().hex[:10]
    now = datetime.datetime.utcnow().isoformat() + "Z"
    cur = conn.cursor()
    cur.execute("""
        INSERT OR REPLACE INTO BrowserExtensions
        (Id, Name, SourceType, SourceUrl, LocalPath, Version, IsActive, CreatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        eid,
        ext.get("Name", "Extension"),
        ext.get("SourceType", "url"),
        ext.get("SourceUrl", ""),
        ext.get("LocalPath", ""),
        ext.get("Version", "1.0.0"),
        ext.get("IsActive", 1),
        ext.get("CreatedAt") or now
    ))
    conn.commit()
    return eid


def delete_browser_extension(conn: sqlite3.Connection, ext_id: str) -> bool:
    cur = conn.cursor()
    cur.execute("DELETE FROM BrowserExtensions WHERE Id = ?", (ext_id,))
    conn.commit()
    return cur.rowcount > 0


def toggle_browser_extension(conn: sqlite3.Connection, ext_id: str, is_active: int) -> bool:
    cur = conn.cursor()
    cur.execute("UPDATE BrowserExtensions SET IsActive = ? WHERE Id = ?", (is_active, ext_id))
    conn.commit()
    return cur.rowcount > 0


def update_browser_profile_status(conn: sqlite3.Connection, profile_id: str, status: str) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE BrowserProfiles SET Status = ? WHERE Id = ?", (status, profile_id))
    conn.commit()


# --- Proxy Helpers ---

PROXY_COLUMNS = (
    "Id", "RawProxy", "Name", "Folder", "Status", "Protocol", "PingMs",
    "RealIp", "Country", "LastCheckedAt", "LastError", "OriginalInput"
)


def load_browser_proxies(conn: sqlite3.Connection, folder: Optional[str] = None) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    if folder and folder != "all":
        cur.execute(f"SELECT {','.join(PROXY_COLUMNS)} FROM BrowserProxies WHERE Folder = ? ORDER BY Id", (folder,))
    else:
        cur.execute(f"SELECT {','.join(PROXY_COLUMNS)} FROM BrowserProxies ORDER BY Id")
    return [dict(zip(PROXY_COLUMNS, r)) for r in cur.fetchall()]


def insert_browser_proxies(conn: sqlite3.Connection, proxies: List[Dict[str, Any]]) -> int:
    import uuid
    cur = conn.cursor()
    count = 0
    for p in proxies:
        pid = p.get("Id") or uuid.uuid4().hex[:10]
        cur.execute(
            """
            INSERT OR REPLACE INTO BrowserProxies 
            (Id, RawProxy, Name, Folder, Status, Protocol, PingMs, RealIp, Country, LastCheckedAt, LastError, OriginalInput)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pid,
                p.get("RawProxy", ""),
                p.get("Name", ""),
                p.get("Folder", "Default"),
                p.get("Status", "live"),
                p.get("Protocol", "http"),
                p.get("PingMs", -1),
                p.get("RealIp", ""),
                p.get("Country", ""),
                p.get("LastCheckedAt", ""),
                p.get("LastError", ""),
                p.get("OriginalInput", p.get("RawProxy", "")),
            )
        )
        count += 1
    conn.commit()
    return count


def update_browser_proxy(conn: sqlite3.Connection, proxy_id: str, fields: Dict[str, Any]) -> bool:
    cur = conn.cursor()
    set_clauses = []
    vals = []
    for k, v in fields.items():
        if k in PROXY_COLUMNS and k != "Id":
            set_clauses.append(f"{k} = ?")
            vals.append(v)
    if not set_clauses:
        return False
    vals.append(proxy_id)
    cur.execute(f"UPDATE BrowserProxies SET {', '.join(set_clauses)} WHERE Id = ?", vals)
    conn.commit()
    return cur.rowcount > 0


def delete_browser_proxies(conn: sqlite3.Connection, proxy_ids: List[str]) -> int:
    if not proxy_ids:
        return 0
    cur = conn.cursor()
    marks = ",".join("?" * len(proxy_ids))
    cur.execute(f"DELETE FROM BrowserProxies WHERE Id IN ({marks})", proxy_ids)
    conn.commit()
    return cur.rowcount
