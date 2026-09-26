import sys
import os
import json
import sqlite3
import datetime
from pathlib import Path

# Ensure bkt_web can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bkt_web.fingerprint import generate_random_fingerprint_dict
from bkt_web import nuoinick_db as nn_db

LANG_MAP = {
    "DE": "de-DE",
    "GB": "en-GB",
    "UK": "en-GB",
    "US": "en-US",
    "JP": "ja-JP",
    "KR": "ko-KR",
    "LU": "fr-LU",
    "FR": "fr-FR",
    "ES": "es-ES",
    "IT": "it-IT",
    "NL": "nl-NL",
}

COUNTRY_TIMEZONES = {
    "DE": "Europe/Berlin",
    "GB": "Europe/London",
    "UK": "Europe/London",
    "US": "America/New_York",
    "JP": "Asia/Tokyo",
    "KR": "Asia/Seoul",
    "LU": "Europe/Luxembourg",
}


def sync_profiles(db_path: str = "/opt/tokmatrix/bkt_web/bkt_channels.db"):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # 1. Đảm bảo nhóm TikTok trong BrowserGroups
    cur.execute("INSERT OR IGNORE INTO BrowserGroups (Id, Name, SortOrder) VALUES ('TikTok', 'TikTok', 1)")
    conn.commit()

    # 2. Lấy toàn bộ 204 kênh từ channels
    cur.execute("""
        SELECT id, username, nickname, country, vpn_config, vpn_location, profile_dir, status, note, cookie
        FROM channels
        ORDER BY id
    """)
    channels = cur.fetchall()
    print(f"[*] Tìm thấy {len(channels)} kênh trong channels.")

    # 3. Lấy default folder ID cho TikTokAccounts
    cur.execute("SELECT Id FROM TikTokNickFolders WHERE IsSystem = 1 LIMIT 1")
    f_row = cur.fetchone()
    folder_id = f_row[0] if f_row else 1

    created_profiles = 0
    updated_profiles = 0
    synced_accounts = 0

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

    for ch in channels:
        ch_id, username, nickname, country, vpn_config, vpn_location, profile_dir, status, note, cookie = ch
        ch_id = int(ch_id)
        username = (username or "").strip()
        nickname = (nickname or "").strip()
        country = (country or "DE").strip().upper()
        vpn_config = (vpn_config or "").strip()
        vpn_location = (vpn_location or "").strip()
        status = (status or "").strip()
        note = (note or "").strip()

        # Tên hiển thị chuẩn
        if nickname and username and nickname.lower() != username.lower():
            display_name = f"{nickname} ({username})"
        elif username:
            display_name = username
        elif nickname:
            display_name = nickname
        elif note:
            display_name = note
        else:
            display_name = f"Kênh #{ch_id}"

        profile_id = f"channel_{ch_id}"
        profile_name = f"TikTok - {display_name} ({country})"

        # Đọc profile_meta.json nếu có
        p_dir = Path(profile_dir or f"/opt/tokmatrix/bkt_web/profiles/channel_{ch_id}")
        meta_path = p_dir / "profile_meta.json"
        meta = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                pass

        tz = meta.get("timezone") or COUNTRY_TIMEZONES.get(country, "Europe/Berlin")
        fixed_lang = LANG_MAP.get(country, "en-US")
        loc_str = meta.get("vpn_location") or vpn_location or vpn_config

        # Sinh vân tay ngẫu nhiên
        fp = generate_random_fingerprint_dict(1, "132")

        raw_proxy = f"socks5://127.0.0.1:{20000 + ch_id}"

        profile_dict = {
            "Id": profile_id,
            "Name": profile_name,
            "GroupId": "TikTok",
            "RawProxy": raw_proxy,
            "BrowserName": "Chrome",
            "BrowserVersion": "132",
            "OsType": 1,
            "CustomUserAgent": fp.get("CustomUserAgent", ""),
            "WebrtcMode": 1,
            "FixedWebrtcPublicIp": "",
            "CanvasMode": 1,
            "WebglImageMode": 1,
            "AudioMode": 1,
            "ClientRectMode": 1,
            "GeolocationMode": 2,
            "TimezoneBaseOnIp": 1,
            "Timezone": tz,
            "IsLanguageBaseOnIp": 0,
            "FixedLanguage": fixed_lang,
            "StartupUrls": "https://www.tiktok.com/",
            "Note": f"TikTok #{ch_id} · VPN {loc_str} ({country})",
            "Status": "idle",
            "DeletedAt": None,
            "CreatedAt": now_iso,
            "LastOpenedAt": None,
            "Tags": f"TikTok,Kênh-{ch_id},{country},{status}",
            "Resolution": fp.get("Resolution", "1920x1080"),
            "Cores": fp.get("Cores", 8),
            "Memory": fp.get("Memory", 16),
            "WebglVendor": fp.get("WebglVendor", ""),
            "WebglRenderer": fp.get("WebglRenderer", ""),
        }

        # Kiểm tra tồn tại
        cur.execute("SELECT Id FROM BrowserProfiles WHERE Id = ?", (profile_id,))
        exists = cur.fetchone() is not None
        nn_db.save_browser_profile(conn, profile_dict)
        if exists:
            updated_profiles += 1
        else:
            created_profiles += 1

        # 4. Đồng bộ vào TikTokAccounts
        cur.execute(
            "SELECT Id FROM TikTokAccounts WHERE BrowserProfileId = ? OR (Uid = ? AND Uid != '')",
            (profile_id, username)
        )
        existing_acc = cur.fetchone()
        if not existing_acc:
            cur.execute("""
                INSERT INTO TikTokAccounts (
                    Idx, FolderId, PhoneName, ScriptId, ScriptName, Uid, Pass, TwoFA, Token,
                    Cookie, Mail, PassMail, MailKhoiPhuc, PassMailKhoiPhuc, BanBe, Nhom, GioiTinh,
                    Avatar, ProfileChrome, TenProfile, UserAgent, Proxy, TepCu, GhiChu,
                    TuongTacCuoi, TrangThai, TinhTrang, BrowserProfileId, HoTen,
                    VpnConfig, VpnLocation, Country
                ) VALUES (
                    ?, ?, '', 0, '', ?, '', '', '',
                    ?, '', '', '', '', '', '', '',
                    '', ?, ?, ?, ?, '', ?,
                    '', ?, '', ?, ?,
                    ?, ?, ?
                )
            """, (
                ch_id, folder_id, username or f"channel_{ch_id}",
                cookie or "", profile_id, profile_name, fp.get("CustomUserAgent", ""), raw_proxy,
                f"TikTok Kênh #{ch_id} (từ channels)", status, profile_id, display_name,
                vpn_config, loc_str, country
            ))
            synced_accounts += 1

    conn.commit()
    conn.close()

    print(f"[✓] Đã tạo mới: {created_profiles} profile.")
    print(f"[✓] Đã cập nhật: {updated_profiles} profile.")
    print(f"[✓] Đã đồng bộ TikTokAccounts: {synced_accounts} tài khoản.")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "/opt/tokmatrix/bkt_web/bkt_channels.db"
    sync_profiles(path)
