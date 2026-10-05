"""Chọn giờ đăng kế tiếp cho một TikTok acc theo giờ địa phương của acc."""
from __future__ import annotations

import datetime
import json
import time
from typing import Iterable, List, Optional
from zoneinfo import ZoneInfo

from . import store

try:
    from bkt_web.profile_factory import COUNTRY_TIMEZONES, FALLBACK_TIMEZONE
except ImportError:
    from profile_factory import COUNTRY_TIMEZONES, FALLBACK_TIMEZONE

# Task đã chiếm một lượt đăng của acc (đang chờ, đang đăng hoặc đã đăng).
SCHEDULE_COUNTED_STATUSES = ("QUEUED", "PENDING", "UPLOADING", "WAITING_RENDER", "SUCCESS", "NEEDS_CHECK")
LOOKAHEAD_DAYS = 7
MIN_LEAD_SECONDS = 300


def account_timezone(tiktok_id: int) -> tuple:
    """(ZoneInfo, country, dùng_fallback) của acc theo quốc gia."""
    conn = store.channels_db()
    try:
        row = conn.execute("SELECT country FROM channels WHERE id=?", (tiktok_id,)).fetchone()
    finally:
        conn.close()
    country = (row[0] if row and row[0] else "").upper()
    return ZoneInfo(COUNTRY_TIMEZONES.get(country, FALLBACK_TIMEZONE)), country, country not in COUNTRY_TIMEZONES


def slot_offset_seconds(tiktok_id: int) -> int:
    """Lệch cố định theo acc (0..slot_jitter_minutes phút) để các acc không cùng đăng đúng HH:00.

    Cố định theo id nên mỗi acc luôn đăng vào cùng phút lẻ quen thuộc; worker đăng chạy tuần tự
    nên giãn ra còn giúp bài không dồn cục chờ nhau.
    """
    jitter = int(store.get_config("slot_jitter_minutes", "45") or 0)
    return ((int(tiktok_id) * 7919) % (jitter + 1)) * 60 if jitter > 0 else 0


def _used_times(tiktok_id: int, now: float) -> list:
    placeholders = ",".join("?" for _ in SCHEDULE_COUNTED_STATUSES)
    conn = store.channels_db()
    try:
        rows = conn.execute(
            f"SELECT schedule_time FROM upload_tasks WHERE channel_id=? AND status IN ({placeholders}) "
            "AND schedule_time > ?",
            (tiktok_id, *SCHEDULE_COUNTED_STATUSES, int(now) - 2 * 86400),
        ).fetchall()
    finally:
        conn.close()
    return [int(r[0]) for r in rows if r[0]]


def free_slots(tiktok_id: int, now: Optional[float] = None, extra_used: Iterable[int] = ()) -> List[int]:
    """Mọi giờ đăng còn trống trong LOOKAHEAD_DAYS ngày tới, theo giờ địa phương của acc.

    `extra_used` là các slot đã giữ tạm (vd khi chạy thử nhiều job cho cùng một acc).
    """
    posting_hours = sorted(json.loads(store.get_config("posting_hours", "[8,10,12,14,17,19]")))
    gap_seconds = int(store.get_config("gap_between_posts_minutes", "120")) * 60
    max_videos = int(store.get_config("videos_per_day_per_channel", "6"))
    now = float(time.time() if now is None else now)
    # Đang giữ đăng (publish_hold_until): không cấp slot trước mốc, nếu không các task remake xếp trong lúc giữ
    # (Story Remake, Kuaishou) đều quá hạn và đăng dồn một lúc khi mốc hết.
    now = max(now, float(store.get_int("publish_hold_until")))
    tz = account_timezone(tiktok_id)[0]
    used = _used_times(tiktok_id, now) + [int(t) for t in extra_used]
    offset = slot_offset_seconds(tiktok_id)

    hours = posting_hours
    if store.get_config("spread_posting_hours", "true") == "true" and hours:
        k = int(tiktok_id) % len(hours)  # "giờ nhà" của acc: các acc chia đều các khung thay vì dồn vào khung sớm nhất
        hours = hours[k:] + hours[:k]

    result: List[int] = []
    today = datetime.datetime.fromtimestamp(now, tz).date()
    for day_offset in range(LOOKAHEAD_DAYS):
        day = today + datetime.timedelta(days=day_offset)
        day_start = datetime.datetime.combine(day, datetime.time(0), tz).timestamp()
        day_end = datetime.datetime.combine(day + datetime.timedelta(days=1), datetime.time(0), tz).timestamp()
        taken = sum(1 for t in used if day_start <= t < day_end)
        for hour in hours:
            if taken >= max_videos:
                break
            candidate = int(datetime.datetime.combine(day, datetime.time(int(hour) % 24), tz).timestamp()) + offset
            if candidate <= now + MIN_LEAD_SECONDS or any(abs(candidate - t) < gap_seconds for t in used):
                continue
            result.append(candidate)
            used.append(candidate)  # các slot trả về cũng phải cách nhau đủ gap
            taken += 1
    return result  # theo thứ tự ưu tiên của acc (ngày tăng dần, trong ngày bắt đầu từ "giờ nhà")


def next_slot(tiktok_id: int, now: Optional[float] = None, extra_used: Iterable[int] = ()) -> Optional[int]:
    """Giờ đăng kế tiếp theo giờ địa phương của acc; None nếu 7 ngày tới đã kín.

    Tính bằng múi giờ IANA của quốc gia nên không phụ thuộc múi giờ của VPS và
    tự theo giờ mùa hè. Không bao giờ trả 0: publish_flow hiểu 0 là "đăng ngay".
    """
    slots = free_slots(tiktok_id, now, extra_used)
    return slots[0] if slots else None
