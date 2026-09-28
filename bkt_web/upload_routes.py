"""Upload task management routes separated from the main server module."""

import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import upload_states as us
except ImportError:
    from db_utils import connect_db
    import upload_states as us

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DB_PATH = BASE_DIR / "bkt_channels.db"
STORAGE_DIR = BASE_DIR / "storage"
UPLOAD_VIDEO_ROOTS = (PROJECT_ROOT / "compare_studio" / "videos", STORAGE_DIR)

upload_router = APIRouter(prefix="/api/upload", tags=["upload_tasks"])


@upload_router.get("/tasks")
def list_upload_tasks():
    conn = connect_db(DB_PATH)
    try:
        rows = conn.execute(
            """
            SELECT u.id, u.channel_id, u.video_path, u.caption, u.hashtags, u.schedule_time, u.status,
                   u.result_url, u.error_message, u.created_at, u.uploaded_at,
                   u.attempt_count, u.next_retry_at, u.started_at,
                   c.username, c.note, c.country,
                   COALESCE(u.ai_generated, 1), COALESCE(u.video_slug, ''), COALESCE(u.clicked_post_at, 0),
                   COALESCE(u.verify_note, ''), COALESCE(u.published_video_id, ''), COALESCE(u.publish_mode, '')
            FROM upload_tasks u
            LEFT JOIN channels c ON u.channel_id = c.id
            ORDER BY u.created_at DESC
            """
        ).fetchall()
    finally:
        conn.close()

    try:
        from bkt_web.autopilot.channels import account_topics
        topics = account_topics()
    except Exception:
        topics = {}

    items = []
    for r in rows:
        topic = topics.get(r[1]) or {}
        items.append({
            "niche_id": topic.get("niche_id", ""),
            "niche_name": topic.get("niche_name", ""),
            "matrix_channel_id": topic.get("matrix_channel_id", ""),
            "matrix_channel_name": topic.get("matrix_channel_name", ""),
            "id": r[0],
            "channel_id": r[1],
            "video_path": r[2],
            "caption": r[3],
            "hashtags": r[4],
            "schedule_time": r[5],
            "status": r[6],
            "result_url": r[7],
            "error_message": r[8],
            "created_at": r[9],
            "uploaded_at": r[10],
            "attempt_count": r[11] or 0,
            "next_retry_at": r[12] or 0,
            "started_at": r[13] or 0,
            "username": r[14] or r[15] or f"ID {r[1]}",
            "country": r[16] or "KR",
            "ai_generated": bool(r[17]),
            "video_slug": r[18],
            "clicked_post_at": r[19] or 0,
            "verify_note": r[20],
            "published_video_id": r[21],
            "publish_mode": r[22],
        })
    return {"tasks": items}


def upload_task_video_file(video_path: str):
    """Return an allowed task MP4 path, never an arbitrary filesystem path."""
    if not video_path or not str(video_path).lower().endswith(".mp4"):
        return None
    try:
        path = Path(video_path).resolve()
    except (OSError, RuntimeError):
        return None
    if not path.is_file():
        return None
    for root in UPLOAD_VIDEO_ROOTS:
        try:
            path.relative_to(root.resolve())
            return path
        except ValueError:
            continue
    return None


@upload_router.get("/tasks/{task_id}/video")
def upload_task_video(task_id: int):
    conn = connect_db(DB_PATH)
    try:
        row = conn.execute("SELECT video_path FROM upload_tasks WHERE id=?", (task_id,)).fetchone()
    finally:
        conn.close()
    path = upload_task_video_file(row[0] if row else "")
    if not path:
        raise HTTPException(status_code=404, detail="Không tìm thấy file video của tác vụ")
    return FileResponse(str(path), media_type="video/mp4", headers={"cache-control": "private, max-age=300"})


@upload_router.delete("/tasks/{task_id}")
def delete_upload_task(task_id: int):
    conn = connect_db(DB_PATH)
    try:
        conn.execute("DELETE FROM upload_tasks WHERE id=?", (task_id,))
        conn.commit()
    finally:
        conn.close()
    return {"message": "Đã xóa tác vụ đăng bài"}


@upload_router.post("/tasks/{task_id}/retry")
def retry_upload_task(task_id: int):
    conn = connect_db(DB_PATH)
    try:
        cur = conn.execute(
            """
            UPDATE upload_tasks
            SET status=?, error_message='', next_retry_at=0, schedule_time=?,
                attempt_count=0, clicked_post_at=0,
                verify_attempts=0, next_verify_at=0, verify_note='', published_video_id=''
            WHERE id=? AND status IN (?,?,?)
            """,
            (us.QUEUED, int(time.time()), task_id, us.ERROR, us.CANCELLED, us.NEEDS_CHECK),
        )
        conn.commit()
    finally:
        conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Tác vụ không ở trạng thái có thể thử lại")
    return {"message": "Đã đưa tác vụ trở lại hàng đợi"}


@upload_router.post("/tasks/{task_id}/cancel")
def cancel_upload_task(task_id: int):
    cancellable = (*us.QUEUE_STATES, us.WAITING_RENDER)
    marks = us.sql_marks(cancellable)
    conn = connect_db(DB_PATH)
    try:
        cur = conn.execute(
            f"UPDATE upload_tasks SET status=? WHERE id=? AND status IN ({marks})",
            (us.CANCELLED, task_id, *cancellable),
        )
        conn.commit()
    finally:
        conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Tác vụ đang chạy hoặc đã hoàn tất")
    return {"message": "Đã hủy tác vụ"}


@upload_router.post("/tasks/{task_id}/confirm")
def confirm_upload_task(task_id: int):
    """Người dùng đã kiểm tra kênh: video của task NEEDS_CHECK đã lên."""
    conn = connect_db(DB_PATH)
    try:
        cur = conn.execute(
            "UPDATE upload_tasks SET status=?, uploaded_at=?, error_message='' WHERE id=? AND status=?",
            (us.SUCCESS, int(time.time()), task_id, us.NEEDS_CHECK),
        )
        conn.commit()
    finally:
        conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=409, detail="Chỉ xác nhận được task đang 'Cần kiểm tra'")
    return {"message": "Đã đánh dấu video đã lên kênh"}
