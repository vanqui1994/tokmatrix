"""Durable upload scheduler separated from the FastAPI application module.

The web layer owns HTTP routes and lifecycle; this module owns only the queue
claim/retry state machine. Keeping it independent makes scheduler behavior
testable without importing the large server module.
"""

from __future__ import annotations

import asyncio
import datetime
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import upload_states as us
except ImportError:
    from db_utils import connect_db
    import upload_states as us

DEFERRED_PROFILE_BUSY = "Profile đang mở — hoãn 5 phút"


def upload_hold_active(now: Optional[float] = None) -> bool:
    """Return True while Autopilot global publish hold is active."""
    try:
        from bkt_web.autopilot import store as autopilot_store
        return autopilot_store.get_int("publish_hold_until") > (time.time() if now is None else now)
    except Exception:
        return False


def run_upload_scheduler(*, db_path: str | Path, stop_event, upload_lock, live_status: Dict[str, Any],
                         publish_func: Optional[Callable[..., Any]] = None) -> None:
    """Run the single durable upload worker until stop_event is set."""
    if publish_func is None:
        from bkt_web.tiktok_publisher import publish_tiktok_video
        publish_func = publish_tiktok_video

    while not stop_event.wait(3):
        if upload_hold_active():
            continue
        if not upload_lock.acquire(blocking=False):
            continue

        task = None
        try:
            now = int(time.time())
            conn = connect_db(db_path)
            try:
                conn.execute("BEGIN IMMEDIATE")
                queue_marks = us.sql_marks(us.QUEUE_STATES)
                task = conn.execute(
                    f"""
                    SELECT id, channel_id, video_path, caption, hashtags, attempt_count,
                           COALESCE(ai_generated, 1)
                    FROM upload_tasks
                    WHERE status IN ({queue_marks})
                      AND schedule_time <= ?
                      AND (next_retry_at IS NULL OR next_retry_at <= ?)
                      AND attempt_count < 3
                    ORDER BY schedule_time, id
                    LIMIT 1
                    """,
                    (*us.QUEUE_STATES, now, now),
                ).fetchone()
                if task:
                    conn.execute(
                        f"""
                        UPDATE upload_tasks
                        SET status=?, started_at=?, attempt_count=attempt_count+1
                        WHERE id=? AND status IN ({queue_marks})
                        """,
                        (us.UPLOADING, now, task[0], *us.QUEUE_STATES),
                    )
                conn.commit()
            finally:
                conn.close()

            if not task:
                continue

            task_id, channel_id, video_path, caption, hashtags, previous_attempts, ai_generated = task
            live_status.update({
                "is_running": True, "channel_id": channel_id, "task_id": task_id,
                "logs": [{"time": time.strftime("%H:%M:%S"),
                          "msg": f"Scheduler bắt đầu tác vụ #{task_id}", "level": "info"}],
            })

            def scheduler_log(message: str, level: str = "info"):
                logs = live_status.setdefault("logs", [])
                logs.append({"time": time.strftime("%H:%M:%S"), "msg": message, "level": level})
                if len(logs) > 150:
                    del logs[:-150]

            result = asyncio.run(publish_func(
                channel_id=channel_id, video_path=video_path, caption=caption, hashtags=hashtags,
                db_path=str(db_path), log_cb=scheduler_log, task_id=task_id,
                ai_generated=bool(ai_generated),
            ))
            if result.get("clicked"):
                scheduler_log("Đã bấm Đăng nhưng chưa xác nhận — chờ người kiểm tra kênh (không tự thử lại)", "warning")
            elif result.get("deferred"):
                conn = connect_db(db_path)
                try:
                    conn.execute(
                        "UPDATE upload_tasks SET status=?, attempt_count=?, next_retry_at=?, error_message=? WHERE id=?",
                        (us.QUEUED, previous_attempts, int(time.time()) + 300, DEFERRED_PROFILE_BUSY, task_id),
                    )
                    conn.commit()
                finally:
                    conn.close()
                scheduler_log("Profile đang bận — hoàn lượt và hoãn 5 phút", "warning")
            elif result.get("no_retry"):
                scheduler_log("Tác vụ không được tự thử lại", "warning")
            elif not result.get("success") and previous_attempts + 1 < 3:
                retry_at = int(time.time()) + 60 * (2 ** previous_attempts)
                conn = connect_db(db_path)
                try:
                    conn.execute("UPDATE upload_tasks SET status=?, next_retry_at=? WHERE id=?",
                                 (us.QUEUED, retry_at, task_id))
                    conn.commit()
                finally:
                    conn.close()
                scheduler_log(f"Sẽ thử lại lúc {datetime.datetime.fromtimestamp(retry_at):%H:%M:%S}", "warning")
        except Exception as exc:
            if task:
                previous_attempts = task[5] or 0
                conn = connect_db(db_path)
                try:
                    clicked = conn.execute(
                        "SELECT COALESCE(clicked_post_at,0) FROM upload_tasks WHERE id=?",
                        (task[0],),
                    ).fetchone()
                finally:
                    conn.close()

                if clicked and clicked[0]:
                    conn = connect_db(db_path)
                    try:
                        conn.execute("UPDATE upload_tasks SET status=?, error_message=? WHERE id=?",
                                     (us.NEEDS_CHECK, f"Lỗi sau khi đã bấm Đăng: {exc}"[:1000], task[0]))
                        conn.commit()
                    finally:
                        conn.close()
                    continue

                can_retry = previous_attempts + 1 < 3
                retry_at = int(time.time()) + 60 * (2 ** previous_attempts) if can_retry else 0
                conn = connect_db(db_path)
                try:
                    conn.execute(
                        """UPDATE upload_tasks SET status=?, error_message=?, next_retry_at=? WHERE id=?""",
                        (us.QUEUED if can_retry else us.ERROR, str(exc)[:1000], retry_at, task[0]),
                    )
                    conn.commit()
                finally:
                    conn.close()
        finally:
            live_status["is_running"] = False
            upload_lock.release()
