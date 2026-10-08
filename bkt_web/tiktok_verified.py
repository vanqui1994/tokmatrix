"""Read-only TikTok Studio endpoints verified in tiktok_monitor; never publish or mutate."""

from __future__ import annotations

import json
from typing import Any

from curl_cffi import requests

STUDIO = {
    "aid": "1988", "app_name": "tiktok_creator_center",
    "device_platform": "web_pc", "channel": "tiktok_web",
    "app_language": "en", "locale": "en",
}
# Múi giờ gửi kèm phải khớp nước của acc (IP VPN cùng nước): IP Đức + Asia/Saigon là dấu hiệu bất thường, và analytics
# theo ngày sẽ lệch ngày. Nước không có trong bảng → UTC.
COUNTRY_TZ = {
    "DE": "Europe/Berlin", "AT": "Europe/Vienna", "CH": "Europe/Zurich", "LU": "Europe/Luxembourg", "GB": "Europe/London",
    "UK": "Europe/London", "FR": "Europe/Paris", "NL": "Europe/Amsterdam", "BE": "Europe/Brussels", "IT": "Europe/Rome",
    "ES": "Europe/Madrid", "PL": "Europe/Warsaw", "BG": "Europe/Sofia", "US": "America/New_York", "CA": "America/Toronto",
    "KR": "Asia/Seoul", "JP": "Asia/Tokyo", "VN": "Asia/Ho_Chi_Minh", "AU": "Australia/Sydney",
}


def timezone_for(country: str) -> tuple[str, int]:
    """(tz_name, độ lệch UTC hiện tại tính bằng giây) theo nước của acc; có tính giờ mùa hè."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    name = COUNTRY_TZ.get((country or "").strip().upper(), "UTC")
    offset = datetime.now(ZoneInfo(name)).utcoffset()
    return name, int(offset.total_seconds()) if offset else 0
WALLET = {"aid": "1988", "device_platform": "web"}
VIDEO_METRICS = (
    "video_info", "video_total_duration_realtime", "video_per_duration_realtime",
    "video_finish_rate_realtime", "video_retention_rate_realtime",
    "video_traffic_source_percent_realtime", "video_new_follower_realtime",
    "video_viewer_age_percent_realtime", "video_viewer_gender_percent_realtime",
    "video_viewer_location_percent_realtime", "video_viewer_follower_percent_realtime",
    "video_viewer_nonfollower_percent_realtime", "item_search_terms", "video_rewards_data",
)
INSIGHT_TYPES = (100, 101, 102, 103, 108, 110, 121, 122, 123, 124, 125, 126, 127,
                 140, 141, 142, 143, 144, 145, 146, 160, 161, 162, 163, 164, 165, 166)


def fetch(cookie: str, socks_port: int, section: str, video_id: str = "", date_range: int = 1,
          country: str = "") -> dict[str, Any]:
    if not cookie or not socks_port:
        return {"ok": False, "error": "Thiếu phiên kênh hoặc VPN riêng"}
    tz_name, tz_seconds = timezone_for(country)
    studio = {**STUDIO, "tz_name": tz_name}
    session = requests.Session(impersonate="chrome120")
    proxy = f"socks5h://127.0.0.1:{socks_port}"
    session.proxies = {"http": proxy, "https": proxy}
    session.headers.update({
        # Cùng "máy" với lượt đăng (Chrome Linux), không để curl_cffi tự khai Windows/Mac trên cùng cookie + IP.
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookie, "Referer": "https://www.tiktok.com/tiktokstudio/analytics",
        "Origin": "https://www.tiktok.com", "Accept": "application/json",
    })

    def get(path: str, params: dict[str, str] | None = None, host: str = "www.tiktok.com") -> dict | None:
        try:
            response = session.get(f"https://{host}{path}", params=params or studio,
                                   timeout=20, allow_redirects=False)
            if response.status_code != 200 or "json" not in response.headers.get("content-type", ""):
                return None
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("status_code") != 0 or not isinstance(payload.get("data"), dict):
                return None
            return payload["data"]
        except (ValueError, requests.RequestsError):
            return None

    try:
        if section == "wallet":
            balance = get("/webcast/wallet_api/get_total_balance", WALLET)
            wallet = get("/webcast/wallet_api_tiktok/wallet/info/", WALLET)
            onboarding = get("/webcast/api/money/payout_onboarding/v2/onboarding_detail/",
                             WALLET, "webcast.tiktok.com")
            exchange = get("/webcast/wallet_api_tiktok/exchange_info", WALLET)
            settlement = get("/webcast/wallet_api_tiktok/get_abs_status", WALLET)
            if not any(v is not None for v in (balance, wallet, onboarding, exchange, settlement)):
                return {"ok": False, "error": "TikTok không trả dữ liệu ví hợp lệ"}
            money = (balance or {}).get("balance") or {}
            return {"ok": True, "data": {
                "balance": {k: money[k] for k in ("amount", "code", "decimal_place", "symbol") if k in money} if balance else None,
                "has_income_before": balance.get("has_income_before") if balance else None,
                "diamond": wallet.get("diamond") if wallet else None,
                "frozen_diamond": wallet.get("frozen_diamond") if wallet else None,
                "kyc_status": onboarding.get("kyc_status") if onboarding else None,
                "pi_bind_status": onboarding.get("pi_bind_status") if onboarding else None,
                "user_tax_status": onboarding.get("user_tax_status") if onboarding else None,
                "exchange": exchange.get("exchange") if exchange else None,
                "settlement": {k: settlement[k] for k in ("is_abs_on", "is_eligible", "is_agreed") if k in settlement} if settlement else None,
            }}
        if section == "video":
            if not video_id.isdecimal() or len(video_id) > 25:
                return {"ok": False, "error": "video_id không hợp lệ"}
            params = {**studio, "type_requests": json.dumps([
                {"insigh_type": metric, "aweme_id": video_id} for metric in VIDEO_METRICS
            ]), "tz_offset": str(-tz_seconds)}
            data = get("/aweme/v2/data/insight/", params)
        elif section == "analytics":
            if date_range not in (1, 2, 3, 4):
                return {"ok": False, "error": "date_range phải là 1, 2, 3 hoặc 4"}
            params = {**studio, "type_requests": json.dumps([
                {"insight_type": metric, "data_date_range": date_range} for metric in INSIGHT_TYPES
            ]), "time_offset": str(tz_seconds), "is_dark_mode": "false"}
            data = get("/tiktok/v1/analytics/insights/", params)
        elif section == "rewards":
            data = get("/tiktok/v1/creator/m10n_center/reward_analytics")
        elif section == "programs":
            data = get("/tiktok/v1/creator/m10n_center/all_programs")
        else:
            return {"ok": False, "error": "Loại dữ liệu không được hỗ trợ"}
        return {"ok": True, "data": data} if data is not None else {
            "ok": False, "error": "TikTok không trả dữ liệu hợp lệ cho mục này",
        }
    finally:
        session.close()
