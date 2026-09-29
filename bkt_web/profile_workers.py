"""Bảo trì Chrome profile của kênh: dọn cache định kỳ trên đĩa.

Chỉ xoá thư mục cache (Cache, Code Cache, GPUCache), không mở trình duyệt, không đụng
cookie / Local Storage / IndexedDB. Mặc định TẮT (setting `profile_cache_clean_enabled`).
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import List, Optional

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import profile_factory, profile_session
    from bkt_web import upload_states as us
except ImportError:
    from db_utils import connect_db
    import profile_factory
    import profile_session
    import upload_states as us

logger = logging.getLogger("profile_workers")

DB_PATH = Path(__file__).resolve().parent / "bkt_channels.db"
MAINTENANCE_TICK = 6 * 3600
SCHEDULE_GUARD = 2700          # không đụng kênh có lịch đăng trong ±45 phút
CACHE_CLEAN_EVERY = 7 * 86400
CACHE_CLEAN_BATCH = 20


def cache_clean_candidates(now: int, db_path: Optional[Path] = None) -> List[int]:
    conn = connect_db(db_path or DB_PATH)
    try:
        busy_states = (*us.QUEUE_STATES, us.UPLOADING)
        marks = us.sql_marks(busy_states)
        rows = conn.execute(
            "SELECT c.id FROM channels c WHERE COALESCE(c.profile_dir,'')<>'' "
            "AND NOT EXISTS (SELECT 1 FROM upload_tasks u WHERE u.channel_id=c.id "
            f"AND u.status IN ({marks}) AND u.schedule_time BETWEEN ? AND ?) "
            "ORDER BY c.id",
            (*busy_states, now - SCHEDULE_GUARD, now + SCHEDULE_GUARD),
        ).fetchall()
    finally:
        conn.close()
    return [r[0] for r in rows]


def clean_cache_batch(now: Optional[int] = None, db_path: Optional[Path] = None) -> dict:
    now = now or int(time.time())
    busy = profile_session.busy_channels()
    cleaned, freed = [], 0
    for cid in cache_clean_candidates(now, db_path):
        if len(cleaned) >= CACHE_CLEAN_BATCH:
            break
        p_dir = profile_session._pdir(cid)
        if not p_dir or not p_dir.is_dir() or cid in busy or profile_session.external_chrome_pid(p_dir):
            continue
        meta = profile_factory.read_profile_meta(p_dir) or {}
        if now - int(meta.get("cache_cleaned_at") or 0) < CACHE_CLEAN_EVERY:
            continue
        freed += profile_session.clean_caches(p_dir)
        meta["cache_cleaned_at"] = now
        profile_factory.write_profile_meta(p_dir, meta)
        cleaned.append(cid)
    return {"cleaned": cleaned, "freed_bytes": freed}


def run_profile_maintenance(stop_event, db_path: Optional[Path] = None) -> None:
    """Thread `profile-maintenance`: 6 giờ một lượt, mọi lỗi đều được nuốt."""
    while not stop_event.wait(MAINTENANCE_TICK):
        try:
            if profile_session.get_setting("profile_cache_clean_enabled", "false", db_path) != "true":
                continue
            res = clean_cache_batch(db_path=db_path)
            if res["cleaned"]:
                logger.info("Dọn cache %d profile, giải phóng %.1f MB",
                            len(res["cleaned"]), res["freed_bytes"] / 1048576)
        except Exception:
            logger.exception("profile-maintenance: lượt dọn lỗi")
