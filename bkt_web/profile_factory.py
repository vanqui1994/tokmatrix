"""Tạo sẵn Chrome profile cho từng kênh, khớp dấu vết trình duyệt với quốc gia.

Trước đây profile chỉ là một thư mục --user-data-dir trống: kênh Đức mở ra vẫn
báo múi giờ Asia/Ho_Chi_Minh trên IP Đức, và WebRTC vẫn có thể lộ IP thật nằm
ngoài tunnel SOCKS5. Module này dựng sẵn profile cho cả dàn kênh, ghi kèm một
file profile_meta.json để lần mở sau áp đúng cấu hình đó.

Ba thứ được khớp theo quốc gia (đúng phạm vi đã chốt):
  1. Múi giờ  — áp bằng biến môi trường TZ của tiến trình Chrome.
  2. Vị trí   — cấp sẵn quyền geolocation cho tiktok.com và ghi toạ độ thành
                phố của server VPN vào meta.
  3. WebRTC   — ép chính sách chỉ dùng UDP đã qua proxy.

Ngôn ngữ trình duyệt CỐ Ý không đụng tới.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

# --- Bản đồ quốc gia -> múi giờ ------------------------------------------
# Chỉ liệt kê những vùng đang dùng; quốc gia lạ sẽ rơi về FALLBACK.
COUNTRY_TIMEZONES: Dict[str, str] = {
    "DE": "Europe/Berlin",
    "GB": "Europe/London",
    "UK": "Europe/London",
    "FR": "Europe/Paris",
    "ES": "Europe/Madrid",
    "IT": "Europe/Rome",
    "NL": "Europe/Amsterdam",
    "PL": "Europe/Warsaw",
    "SE": "Europe/Stockholm",
    "US": "America/New_York",
    "CA": "America/Toronto",
    "BR": "America/Sao_Paulo",
    "KR": "Asia/Seoul",
    "JP": "Asia/Tokyo",
    "VN": "Asia/Ho_Chi_Minh",
    "TH": "Asia/Bangkok",
    "ID": "Asia/Jakarta",
    "PH": "Asia/Manila",
    "AU": "Australia/Sydney",
    "BG": "Europe/Sofia",
    "LU": "Europe/Luxembourg",
}

# Toạ độ trung tâm thành phố các điểm thoát NordVPN hay gặp. Dùng khi tên thành
# phố đọc được từ vpn_location; nếu không khớp thì lấy thủ đô của quốc gia.
CITY_COORDS: Dict[str, tuple] = {
    "Berlin": (52.5200, 13.4050),
    "Frankfurt": (50.1109, 8.6821),
    "Hamburg": (53.5511, 9.9937),
    "Munich": (48.1351, 11.5820),
    "Düsseldorf": (51.2277, 6.7735),
    "London": (51.5074, -0.1278),
    "Manchester": (53.4808, -2.2426),
    "Edinburgh": (55.9533, -3.1883),
    "Glasgow": (55.8642, -4.2518),
    "Paris": (48.8566, 2.3522),
    "Madrid": (40.4168, -3.7038),
    "Amsterdam": (52.3676, 4.9041),
    "Milan": (45.4642, 9.1900),
    "Stockholm": (59.3293, 18.0686),
    "Warsaw": (52.2297, 21.0122),
    "New York": (40.7128, -74.0060),
    "Los Angeles": (34.0522, -118.2437),
    "Seoul": (37.5665, 126.9780),
    "Tokyo": (35.6762, 139.6503),
    "Sofia": (42.6977, 23.3219),
    "Luxembourg": (49.6116, 6.1319),
}

COUNTRY_CAPITALS: Dict[str, str] = {
    "DE": "Berlin", "GB": "London", "UK": "London", "FR": "Paris",
    "ES": "Madrid", "IT": "Milan", "NL": "Amsterdam", "PL": "Warsaw",
    "SE": "Stockholm", "US": "New York", "KR": "Seoul", "JP": "Tokyo",
    "BG": "Sofia", "LU": "Luxembourg",
}

FALLBACK_TIMEZONE = "Europe/Berlin"
FALLBACK_COORDS = CITY_COORDS["Berlin"]

# Cờ Chrome bịt đường rò IP thật của WebRTC ra ngoài tunnel SOCKS5.
WEBRTC_ARGS: List[str] = [
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--webrtc-ip-handling-policy=disable_non_proxied_udp",
]

GEO_ORIGINS = ("https://www.tiktok.com", "https://tiktok.com")

META_FILENAME = "profile_meta.json"


def parse_vpn_city(vpn_location: str) -> str:
    """Đọc tên thành phố từ nhãn vị trí VPN.

    Trong DB đang tồn tại hai định dạng: 'Berlin • de1266 (Standard_P2P)' và
    'GB • London • United Kingdom #2112'. Lấy cứng phần đầu sẽ ra 'GB' ở dạng
    thứ hai, nên duyệt mọi đoạn và nhận đoạn nào là thành phố đã biết.
    """
    if not vpn_location:
        return ""
    parts = [seg.strip() for seg in vpn_location.split("•") if seg.strip()]
    for seg in parts:
        if seg in CITY_COORDS:
            return seg
    return parts[0] if parts else ""


def resolve_profile_config(country: str, vpn_location: str = "") -> Dict[str, Any]:
    """Quy ra cấu hình dấu vết cho một kênh từ quốc gia + điểm thoát VPN."""
    cc = (country or "").strip().upper()
    timezone = COUNTRY_TIMEZONES.get(cc, FALLBACK_TIMEZONE)

    city = parse_vpn_city(vpn_location)
    coords = CITY_COORDS.get(city)
    if not coords:
        city = COUNTRY_CAPITALS.get(cc, "")
        coords = CITY_COORDS.get(city, FALLBACK_COORDS)

    return {
        "country": cc or "DE",
        "timezone": timezone,
        "city": city,
        "latitude": coords[0],
        "longitude": coords[1],
        "accuracy": 60,
        "vpn_location": vpn_location or "",
    }


def write_profile_meta(p_dir: Path, cfg: Dict[str, Any]) -> Path:
    """Ghi cấu hình cạnh profile để lần mở sau áp lại đúng như lúc tạo."""
    meta_path = Path(p_dir) / META_FILENAME
    payload = {**cfg, "created_at": int(time.time())}
    meta_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta_path


def read_profile_meta(p_dir: Path) -> Dict[str, Any]:
    """Đọc cấu hình đã ghi; trả về {} nếu profile chưa được dựng bằng module này."""
    meta_path = Path(p_dir) / META_FILENAME
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def pregrant_geolocation(p_dir: Path, origins=GEO_ORIGINS) -> bool:
    """Cấp sẵn quyền vị trí cho TikTok ngay trong file Preferences của profile.

    Playwright KHÔNG ghi quyền này xuống đĩa (kiểm chứng: mục exceptions rỗng
    sau khi đóng context), nên phải tự vá vào Preferences thì lần mở Chrome thật
    mới không hiện hộp thoại hỏi quyền.
    """
    pref_path = Path(p_dir) / "Default" / "Preferences"
    if not pref_path.exists():
        return False
    try:
        prefs = json.loads(pref_path.read_text(encoding="utf-8"))
    except Exception:
        return False

    node = prefs.setdefault("profile", {}).setdefault("content_settings", {}).setdefault("exceptions", {})
    geo = node.setdefault("geolocation", {})
    stamp = int(time.time() * 1_000_000)
    for origin in origins:
        geo[f"{origin},*"] = {"last_modified": str(stamp), "setting": 1}

    try:
        pref_path.write_text(json.dumps(prefs, ensure_ascii=False), encoding="utf-8")
        return True
    except Exception:
        return False


def chrome_launch_args(cfg: Dict[str, Any]) -> List[str]:
    """Cờ dòng lệnh cần cho mọi lần mở profile này."""
    args = list(WEBRTC_ARGS)
    if sys.platform.startswith("linux"):
        # Trên máy chủ không có phiên desktop, Chrome đòi mở khoá gnome-keyring
        # và dựng một hộp thoại "Unlock Login Keyring" chắn ngang màn hình ảo:
        # người dùng xem qua noVNC không bấm được gì nữa. Kho mật khẩu "basic"
        # giữ dữ liệu ngay trong thư mục profile nên không cần keyring.
        # Cookie phiên của kênh vẫn được mã hoá Fernet trong database của ứng dụng.
        args.append("--password-store=basic")
    return args


def chrome_launch_env(cfg: Dict[str, Any], base_env: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Biến môi trường áp múi giờ. Chrome đọc TZ, đây là cách duy nhất đổi được
    múi giờ của một Chrome mở thường (không qua CDP)."""
    import os

    env = dict(base_env if base_env is not None else os.environ)
    tz = cfg.get("timezone") or FALLBACK_TIMEZONE
    env["TZ"] = tz
    return env
