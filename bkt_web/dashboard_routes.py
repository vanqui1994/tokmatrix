"""Dashboard API kept separate from the main application module.

This module intentionally tolerates optional tables that may not exist yet on a
fresh/partial installation. Missing optional data becomes 0/[] instead of taking
the whole dashboard down.
"""

import time
from pathlib import Path

from fastapi import APIRouter

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import upload_states as us
except ImportError:
    from db_utils import connect_db
    import upload_states as us

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"

dashboard_router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def build_dashboard_summary(db_path: str | Path = DB_PATH):
    conn = connect_db(db_path)

    def scalar(sql, params=(), default=0):
        try:
            row = conn.execute(sql, params).fetchone()
            return row[0] if row and row[0] is not None else default
        except Exception:
            return default

    def rows(sql, params=()):
        try:
            return conn.execute(sql, params).fetchall()
        except Exception:
            return []

    try:
        today_start = int(time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d")))
        queue_marks = us.sql_marks(us.QUEUE_STATES)
        issue_marks = us.sql_marks(us.ISSUE_STATES)
        data = {
            "channels": {
                "total": scalar("SELECT COUNT(*) FROM channels"),
                "monetized": scalar("SELECT COUNT(*) FROM channels WHERE status LIKE '%BKT%' OR status LIKE '%Đã bật%'"),
                "earned_total": round(scalar("SELECT SUM(earned) FROM channels") or 0, 2),
                "balance_total": round(scalar("SELECT SUM(balance) FROM channels") or 0, 2),
                "checked_today": scalar("SELECT COUNT(*) FROM channels WHERE last_checked >= ?", (today_start,)),
            },
            "render": {
                "queued": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='QUEUED'"),
                "processing": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='PROCESSING'"),
                "done": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='DONE'"),
                "error": scalar("SELECT COUNT(*) FROM render_tasks WHERE status='ERROR'"),
            },
            "upload": {
                "queued": scalar(
                    f"SELECT COUNT(*) FROM upload_tasks WHERE status IN ({queue_marks})",
                    us.QUEUE_STATES,
                ),
                "uploading": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status=?", (us.UPLOADING,)),
                "success": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status=?", (us.SUCCESS,)),
                "error": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status=?", (us.ERROR,)),
                "needs_check": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status=?", (us.NEEDS_CHECK,)),
                "waiting_render": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status=?", (us.WAITING_RENDER,)),
                "next": [
                    {"id": r[0], "caption": (r[1] or "")[:60], "schedule_time": r[2], "channel_id": r[3]}
                    for r in rows(
                        f"""SELECT id, caption, schedule_time, channel_id FROM upload_tasks
                            WHERE status IN ({queue_marks}) ORDER BY schedule_time ASC LIMIT 5""",
                        us.QUEUE_STATES,
                    )
                ],
            },
            "images": {
                "pending": scalar("SELECT COUNT(*) FROM image_queue WHERE status='pending'"),
                "processing": scalar("SELECT COUNT(*) FROM image_queue WHERE status='processing'"),
                "completed": scalar("SELECT COUNT(*) FROM image_queue WHERE status='completed'"),
                "failed": scalar("SELECT COUNT(*) FROM image_queue WHERE status='failed'"),
                "library": scalar("SELECT COUNT(*) FROM image_assets"),
            },
            "accounts": {
                "fb_reg": scalar("SELECT COUNT(*) FROM fb_reg_accounts"),
                "fb_live": scalar("SELECT COUNT(*) FROM fb_accounts"),
                "nicks": scalar("SELECT COUNT(*) FROM FacebookAccounts")
                         + scalar("SELECT COUNT(*) FROM TikTokAccounts"),
            },
            "recent_errors": [
                {"kind": "Render", "id": r[0], "message": (r[1] or "")[:120], "at": r[2]}
                for r in rows(
                    "SELECT id, error_message, created_at FROM render_tasks WHERE status='ERROR' ORDER BY id DESC LIMIT 5"
                )
            ] + [
                {"kind": "Đăng TikTok", "id": r[0], "message": (r[1] or "")[:120], "at": r[2]}
                for r in rows(
                    f"""SELECT id, error_message, created_at FROM upload_tasks
                        WHERE status IN ({issue_marks}) ORDER BY id DESC LIMIT 5""",
                    us.ISSUE_STATES,
                )
            ],
        }
    finally:
        conn.close()
    return {"success": True, "data": data}


@dashboard_router.get("/summary")
def dashboard_summary():
    return build_dashboard_summary(DB_PATH)
