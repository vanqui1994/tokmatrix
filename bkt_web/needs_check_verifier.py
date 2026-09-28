"""Xác minh task NEEDS_CHECK bằng dữ liệu video chỉ đọc từ chocode.

Không bao giờ import hay gọi publisher: module này chỉ đọc danh sách video của kênh
rồi ghi gợi ý (hoặc SUCCESS khi bật needs_check_auto_confirm) vào upload_tasks.
"""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import chocode_tiktok
    from bkt_web import upload_states as us
    from bkt_web.profile_session import get_setting
except ImportError:
    from db_utils import connect_db
    import chocode_tiktok
    import upload_states as us
    from profile_session import get_setting

logger = logging.getLogger("needs_check_verifier")

DB_PATH = Path(__file__).resolve().parent / "bkt_channels.db"
# Mốc kiểm tra tính từ lúc bấm Đăng: +10 phút, +30 phút, +2 giờ, +6 giờ.
VERIFY_DELAYS = (600, 1800, 7200, 21600)
FINAL_NOTE = "Không tìm thấy sau 6 giờ — kiểm tra tay"
CAPTION_PREFIX = 40


def _text(value: Any) -> str:
    value = re.sub(r"#[\wÀ-ỹ]+", " ", str(value or ""))
    value = re.sub(r"[^\wÀ-ỹ ]", " ", value.casefold())
    return " ".join(value.split())


def _hashtags(value: Any) -> set:
    return set(re.findall(r"#[\wÀ-ỹ]+", str(value or "").casefold()))


def _video_items(payload: Any) -> List[Dict[str, Any]]:
    """fetch_channel_videos trả {"items": [...]}; chấp nhận cả list cho dễ test."""
    if isinstance(payload, dict):
        payload = payload.get("items") or []
    return [v for v in (payload or []) if isinstance(v, dict)]


def _created(video: Dict[str, Any]) -> int:
    # Item của chocode dùng createTime (camelCase).
    for key in ("createTime", "create_time"):
        try:
            if video.get(key):
                return int(video[key])
        except (TypeError, ValueError):
            return 0
    return 0


def _video_id(video: Dict[str, Any]) -> str:
    return str(video.get("id") or video.get("video_id") or "")


def match_candidates(task: Dict[str, Any], videos: Any) -> List[Dict[str, Any]]:
    clicked = int(task.get("clicked_post_at") or 0)
    if not clicked:
        return []
    full = f"{task.get('caption') or ''} {task.get('hashtags') or ''}"
    caption = _text(full)[:CAPTION_PREFIX]
    tags = _hashtags(full)
    out = []
    for video in _video_items(videos):
        created = _created(video)
        if not (clicked - 120 <= created <= clicked + 3600):
            continue
        desc = video.get("desc") or ""
        if (caption and _text(desc)[:CAPTION_PREFIX] == caption) or len(tags & _hashtags(desc)) >= 2:
            out.append(video)
    return out


def _next_verify_at(clicked: int, attempts: int) -> int:
    """attempts = số lần đã kiểm mà chưa thấy; 0 nghĩa là chưa kiểm lần nào."""
    if attempts >= len(VERIFY_DELAYS):
        return 0
    return clicked + VERIFY_DELAYS[attempts]


def verify_once(task_id: int, db_path: Optional[Path] = None) -> Dict[str, Any]:
    db_path = db_path or DB_PATH
    conn = connect_db(db_path)
    try:
        cur = conn.execute(
            "SELECT u.*, c.username AS _username FROM upload_tasks u "
            "LEFT JOIN channels c ON c.id=u.channel_id WHERE u.id=?",
            (task_id,),
        )
        row = cur.fetchone()
        if not row:
            return {"success": False, "error": "Task không tồn tại"}
        task = dict(zip([d[0] for d in cur.description], row))
        if task.get("status") != us.NEEDS_CHECK:
            return {"success": False, "error": "Task không còn ở NEEDS_CHECK"}
        username = task.get("_username") or ""
        try:
            payload = chocode_tiktok.fetch_channel_videos(username, max_items=30, detail_limit=0) if username else {}
        except Exception as exc:
            # Lỗi mạng / dữ liệu mẫu bị chặn: coi như chưa có dữ liệu, thử lại theo lịch.
            logger.warning("verify #%s: không lấy được video (%s)", task_id, exc)
            payload = {}
        candidates = match_candidates(task, payload)
        clicked = int(task.get("clicked_post_at") or 0)

        if len(candidates) == 1:
            video = candidates[0]
            vid = _video_id(video)
            url = f"https://www.tiktok.com/@{username}/video/{vid}"
            note = f"Tìm thấy video {vid} lúc {time.strftime('%Y-%m-%d %H:%M', time.localtime(_created(video)))}"
            if get_setting("needs_check_auto_confirm", "false", db_path) == "true":
                conn.execute(
                    "UPDATE upload_tasks SET status=?, uploaded_at=?, result_url=?, error_message='', "
                    "published_video_id=?, verify_note=?, next_verify_at=0 "
                    "WHERE id=? AND status=?",
                    (us.SUCCESS, int(time.time()), url, vid, note + " — tự xác nhận", task_id, us.NEEDS_CHECK),
                )
            else:
                conn.execute(
                    "UPDATE upload_tasks SET published_video_id=?, verify_note=?, next_verify_at=0 "
                    "WHERE id=? AND status=?",
                    (vid, note, task_id, us.NEEDS_CHECK),
                )
        elif len(candidates) > 1:
            note = "Nhiều video khớp, kiểm tra tay: " + ", ".join(_video_id(v) for v in candidates)
            conn.execute(
                "UPDATE upload_tasks SET verify_note=?, next_verify_at=0 WHERE id=? AND status=?",
                (note, task_id, us.NEEDS_CHECK),
            )
        else:
            attempts = int(task.get("verify_attempts") or 0) + 1
            next_at = _next_verify_at(clicked, attempts)
            note = FINAL_NOTE if not next_at else f"Chưa thấy video (lần {attempts})"
            conn.execute(
                "UPDATE upload_tasks SET verify_attempts=?, next_verify_at=?, verify_note=? "
                "WHERE id=? AND status=?",
                (attempts, next_at, note, task_id, us.NEEDS_CHECK),
            )
        conn.commit()
        return {"success": True, "matches": len(candidates)}
    finally:
        conn.close()


def schedule_new(db_path: Optional[Path] = None) -> int:
    """Task vừa vào NEEDS_CHECK có next_verify_at=0 và chưa kiểm lần nào → đặt mốc đầu."""
    conn = connect_db(db_path or DB_PATH)
    try:
        cur = conn.execute(
            "UPDATE upload_tasks SET next_verify_at = clicked_post_at + ? "
            "WHERE status=? AND clicked_post_at>0 AND COALESCE(next_verify_at,0)=0 "
            "AND COALESCE(verify_attempts,0)=0 AND COALESCE(verify_note,'')=''",
            (VERIFY_DELAYS[0], us.NEEDS_CHECK),
        )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def run_once(db_path: Optional[Path] = None, limit: int = 5) -> int:
    db_path = db_path or DB_PATH
    if get_setting("needs_check_verifier_enabled", "true", db_path) != "true":
        return 0
    schedule_new(db_path)
    conn = connect_db(db_path)
    try:
        ids = [r[0] for r in conn.execute(
            "SELECT id FROM upload_tasks WHERE status=? AND clicked_post_at>0 "
            "AND next_verify_at BETWEEN 1 AND ? ORDER BY next_verify_at LIMIT ?",
            (us.NEEDS_CHECK, int(time.time()), limit),
        ).fetchall()]
    finally:
        conn.close()
    for task_id in ids:
        try:
            verify_once(task_id, db_path)
        except Exception:
            logger.exception("verify #%s lỗi", task_id)
    return len(ids)


def run_verifier(stop_event, db_path: Optional[Path] = None) -> None:
    """Worker nền, 60 giây một lượt. Mọi lỗi đều được nuốt để thread không chết."""
    while not stop_event.wait(60):
        try:
            run_once(db_path)
        except Exception:
            logger.exception("needs-check-verifier: lượt quét lỗi")
