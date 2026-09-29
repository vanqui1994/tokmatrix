"""Luồng đăng TikTok cho video Compare Studio: render xong → chọn kênh → đăng.

Xem docs/PLAN_render_to_tiktok_publish.md. Các quy tắc cứng:

- Phải chọn kênh thì mới được đăng. Không đường nào tự chọn kênh thay người dùng; kênh bị
  xoá hoặc mất cookie giữa chừng thì task báo lỗi, không đổi sang kênh khác.
- Không đăng video còn ảnh chờ Antigravity (ảnh nền tạm) và không đăng bản MP4 cũ.
- Đã bấm "Đăng" mà không thấy xác nhận thì chuyển NEEDS_CHECK, KHÔNG tự thử lại — thử lại
  lúc đó có thể đăng một video hai lần.

Trạng thái task mới: WAITING_RENDER (chờ render/ảnh xong), NEEDS_CHECK (cần người kiểm tra).
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import compare_native as cn
    from bkt_web import upload_states as us
except ImportError:  # chạy trực tiếp trong bkt_web/
    from db_utils import connect_db
    import compare_native as cn
    import upload_states as us

DB_PATH = Path(__file__).resolve().parent / "bkt_channels.db"

UPLOAD_COLUMNS = {
    "attempt_count": "INTEGER DEFAULT 0",
    "next_retry_at": "INTEGER DEFAULT 0",
    "started_at": "INTEGER DEFAULT 0",
    "ai_generated": "INTEGER DEFAULT 1",
    "run_id": "TEXT DEFAULT ''",
    "video_slug": "TEXT DEFAULT ''",
    "clicked_post_at": "INTEGER DEFAULT 0",
    "archived_at": "INTEGER DEFAULT 0",
    "verify_attempts": "INTEGER DEFAULT 0",
    "next_verify_at": "INTEGER DEFAULT 0",
    "verify_note": "TEXT DEFAULT ''",
    "published_video_id": "TEXT DEFAULT ''",
    "publish_mode": "TEXT DEFAULT ''",
}
NEARBY_WINDOW = 2 * 3600  # cảnh báo khi kênh đã có bài trong ±2 giờ quanh giờ hẹn
# Mọi trạng thái dưới đây đều có thể đại diện cho một bài đã/đang chiếm slot.
# NEEDS_CHECK đặc biệt quan trọng: TikTok đã nhận cú click Đăng nhưng backend chưa
# xác nhận video lên hay chưa, vì vậy phải giữ slot để tránh đăng trùng.
NEARBY_BLOCKING_STATUSES = us.SLOT_BLOCKING_STATES


class PublishError(Exception):
    def __init__(self, status: int, message: str, **extra: Any):
        super().__init__(message)
        self.status, self.message, self.extra = status, message, extra


def _db(db_path: Optional[Path] = None):
    return connect_db(db_path or DB_PATH)


def ensure_upload_columns(conn) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(upload_tasks)").fetchall()}
    for name, definition in UPLOAD_COLUMNS.items():
        if name not in cols:
            conn.execute(f"ALTER TABLE upload_tasks ADD COLUMN {name} {definition}")
    # Các query publish nóng đều lọc theo channel trước. Index theo lịch + thời
    # điểm đăng giúp nearby check không phải quét toàn bộ bảng khi lịch sử lớn.
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_tasks_channel_schedule "
        "ON upload_tasks(channel_id, status, schedule_time)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_tasks_channel_uploaded "
        "ON upload_tasks(channel_id, status, uploaded_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_upload_tasks_run_identity "
        "ON upload_tasks(channel_id, video_slug, run_id) WHERE run_id <> ''"
    )


def _channel(conn, channel_id: Any) -> Dict[str, Any]:
    if channel_id in (None, "", 0) or isinstance(channel_id, bool):
        raise PublishError(400, "Phải chọn kênh TikTok để đăng — hệ thống không tự chọn kênh thay bạn")
    try:
        channel_id = int(channel_id)
    except (TypeError, ValueError):
        raise PublishError(400, "channel_id không hợp lệ")
    row = conn.execute("SELECT id, username, note, country, cookie FROM channels WHERE id=?", (channel_id,)).fetchone()
    if not row:
        raise PublishError(404, "Kênh không tồn tại")
    if not row[4]:
        raise PublishError(400, f"Kênh #{channel_id} chưa có cookie — cập nhật cookie trước khi đăng")
    return {"id": row[0], "username": row[1] or row[2] or f"ID {row[0]}", "country": row[3] or ""}


def latest_mp4(slug: str) -> Optional[Path]:
    d = cn._video_dir(slug) / "renders"
    mp4s = sorted(d.glob("*.mp4"), key=lambda f: f.stat().st_mtime, reverse=True) if d.is_dir() else []
    return mp4s[0] if mp4s else None


def nearby_posts(conn, channel_id: int, schedule_ts: int, exclude_id: Optional[int] = None) -> List[Dict[str, Any]]:
    marks = us.sql_marks(NEARBY_BLOCKING_STATUSES)
    low, high = schedule_ts - NEARBY_WINDOW, schedule_ts + NEARBY_WINDOW
    rows = conn.execute(
        f"""SELECT id, schedule_time, status, video_slug FROM upload_tasks
            WHERE channel_id=? AND status IN ({marks}) AND id != ?
              AND (
                    (uploaded_at > ? AND uploaded_at < ?)
                 OR ((uploaded_at IS NULL OR uploaded_at = 0) AND schedule_time > ? AND schedule_time < ?)
              )""",
        (channel_id, *NEARBY_BLOCKING_STATUSES, exclude_id or -1, low, high, low, high),
    ).fetchall()
    return [{"id": r[0], "schedule_time": r[1], "status": r[2], "video_slug": r[3]} for r in rows]


def enqueue_upload(
    slug: str,
    channel_id: Any,
    caption: str,
    hashtags: str,
    schedule_ts: Optional[int] = None,
    ai_generated: bool = True,
    status: str = us.QUEUED,
    run_id: str = "",
    confirm_nearby: bool = False,
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Tạo một task đăng. status='WAITING_RENDER' khi video chưa render xong."""
    if not cn.safe_slug(slug):
        raise PublishError(400, "slug không hợp lệ")
    if status == us.QUEUED and not (cn.VIDEOS_DIR / slug).is_dir():
        raise PublishError(404, "Không có video này")
    now = int(time.time())
    schedule_ts = int(schedule_ts or now)
    if schedule_ts < now - 60:
        raise PublishError(400, "Giờ hẹn đã qua")
    caption = (caption or "").strip()
    hashtags = (hashtags or "").strip()
    if len(f"{caption} {hashtags}".strip()) > 2200:
        raise PublishError(400, "Caption và hashtag vượt 2200 ký tự")

    video_path = ""
    if status == us.QUEUED:
        waiting = cn.pending_images(slug)
        if waiting:
            raise PublishError(409, f"Còn {len(waiting)} ảnh chờ Antigravity — chưa đăng được", pending=waiting)
        mp4 = latest_mp4(slug)
        if not mp4:
            raise PublishError(404, "Video chưa có bản render MP4")
        video_path = str(mp4.resolve())
    elif status != us.WAITING_RENDER:
        raise PublishError(400, f"Trạng thái không hợp lệ: {status}")

    conn = _db(db_path)
    try:
        ensure_upload_columns(conn)
        # Schema migration (nếu có) phải kết thúc trước khi lấy write lock. Sau đó
        # giữ BEGIN IMMEDIATE xuyên suốt check-nearby → INSERT để hai request đồng
        # thời không cùng vượt qua kiểm tra khoảng cách rồi tạo hai task.
        conn.commit()
        conn.execute("BEGIN IMMEDIATE")
        ch = _channel(conn, channel_id)

        # Idempotency cho các caller có run_id/batch_id. Một retry của cùng run
        # không được tạo task thứ hai cho cùng slug + kênh. Manual enqueue không có
        # run_id vẫn giữ hành vi cũ để người dùng có thể chủ động repost về sau.
        if run_id:
            existing = conn.execute(
                """SELECT id, status, video_path, schedule_time
                   FROM upload_tasks
                   WHERE channel_id=? AND video_slug=? AND run_id=?
                     AND status NOT IN (?,?)
                   ORDER BY id DESC LIMIT 1""",
                (ch["id"], slug, run_id, us.ERROR, us.CANCELLED),
            ).fetchone()
            if existing:
                conn.commit()
                return {
                    "id": existing[0], "status": existing[1], "channel": ch,
                    "schedule_time": existing[3], "video_path": existing[2] or "",
                    "nearby": [], "reused": True,
                }

        near = nearby_posts(conn, ch["id"], schedule_ts)
        if near and not confirm_nearby:
            raise PublishError(409, f"Kênh @{ch['username']} đã có {len(near)} bài trong vòng 2 giờ quanh giờ hẹn",
                               nearby=near, needsConfirm=True)
        cur = conn.execute(
            """INSERT INTO upload_tasks (channel_id, video_path, caption, hashtags, schedule_time, status, created_at,
                                         ai_generated, run_id, video_slug)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (ch["id"], video_path, caption, hashtags, schedule_ts, status, now, 1 if ai_generated else 0, run_id or "", slug),
        )
        conn.commit()
        return {"id": cur.lastrowid, "status": status, "channel": ch, "schedule_time": schedule_ts,
                "video_path": video_path, "nearby": near, "reused": False}
    finally:
        conn.close()


def _kit_caption(slug: str) -> Dict[str, str]:
    """Caption + hashtag theo thể loại (publish_kit) cho task tự đăng tạo lúc video chưa có."""
    import asyncio
    try:
        from bkt_web.publish_kit import build_publish_kit
    except ImportError:
        from publish_kit import build_publish_kit
    try:
        kit = asyncio.run(build_publish_kit(slug))
        return {"caption": kit.get("caption") or "", "hashtags": kit.get("hashtagString") or ""}
    except Exception:
        return {"caption": "", "hashtags": ""}


def activate_waiting(slug: str, *, run_id: str, render_ok: bool, started_at_ms: float, blocked_by_images: bool = False,
                     log=None, db_path: Optional[Path] = None) -> List[int]:
    """Sau một lần render: chuyển task WAITING_RENDER của video sang QUEUED hoặc ERROR."""
    say = log or (lambda *_: None)
    conn = _db(db_path)
    try:
        ensure_upload_columns(conn)
        rows = conn.execute(
            "SELECT id, channel_id, run_id, schedule_time, caption, hashtags FROM upload_tasks WHERE status=? AND video_slug=?",
            (us.WAITING_RENDER, slug),
        ).fetchall()
        if not rows:
            return []
        activated: List[int] = []
        mp4 = latest_mp4(slug)
        fresh = bool(mp4 and mp4.stat().st_mtime * 1000 >= started_at_ms - 1000)
        kit: Optional[Dict[str, str]] = None
        for task_id, channel_id, task_run, schedule_ts, caption, hashtags in rows:
            if blocked_by_images:
                say(f"⏳ Task đăng #{task_id} vẫn chờ: video còn ảnh chờ Antigravity")
                continue
            if not render_ok or not fresh:
                if task_run == run_id:  # chỉ báo lỗi task thuộc chính lần render hỏng này
                    reason = "Render lỗi" if not render_ok else "Render xong nhưng không có MP4 mới"
                    conn.execute("UPDATE upload_tasks SET status=?, error_message=? WHERE id=?", (us.ERROR, reason, task_id))
                    say(f"❌ Task đăng #{task_id}: {reason} — không đăng")
                continue
            try:
                ch = _channel(conn, channel_id)
            except PublishError as exc:
                conn.execute("UPDATE upload_tasks SET status=?, error_message=? WHERE id=?", (us.ERROR, exc.message, task_id))
                say(f"❌ Task đăng #{task_id}: {exc.message}")
                continue
            if not (caption or "").strip():
                kit = kit or _kit_caption(slug)
                caption = kit["caption"] or slug
                hashtags = (hashtags or "").strip() or kit["hashtags"]
            when = max(int(schedule_ts or 0), int(time.time()))
            conn.execute(
                "UPDATE upload_tasks SET status=?, video_path=?, schedule_time=?, caption=?, hashtags=?, error_message='' WHERE id=?",
                (us.QUEUED, str(mp4.resolve()), when, caption, hashtags or "", task_id),
            )
            activated.append(task_id)
            say(f"📤 Đã xếp hàng đăng lên @{ch['username']} lúc {time.strftime('%H:%M %d/%m', time.localtime(when))} (task #{task_id})")
        conn.commit()
        return activated
    finally:
        conn.close()


def startup_cleanup(db_path: Optional[Path] = None) -> None:
    """Gọi khi app khởi động lại (trước khi bộ lập lịch chạy)."""
    conn = _db(db_path)
    try:
        ensure_upload_columns(conn)
        # Đang đăng dở mà đã bấm "Đăng" → có thể video đã lên: cần người kiểm tra, không đăng lại.
        conn.execute(
            """UPDATE upload_tasks SET status=?,
                      error_message='Ứng dụng khởi động lại sau khi đã bấm Đăng — kiểm tra kênh trước khi thử lại'
               WHERE status=? AND COALESCE(clicked_post_at,0) > 0""",
            (us.NEEDS_CHECK, us.UPLOADING),
        )
        conn.execute("UPDATE upload_tasks SET status=?, next_retry_at=0 WHERE status=?", (us.QUEUED, us.UPLOADING))
        # Chờ render mà tác vụ render đã mất theo tiến trình cũ → lỗi; chờ ảnh Antigravity thì giữ.
        for task_id, slug in conn.execute("SELECT id, video_slug FROM upload_tasks WHERE status=?", (us.WAITING_RENDER,)).fetchall():
            try:
                waiting = cn.pending_images(slug) if slug and cn.safe_slug(slug) else []
            except Exception:
                waiting = []
            if not waiting:
                conn.execute(
                    "UPDATE upload_tasks SET status=?, error_message='Render bị gián đoạn do ứng dụng khởi động lại' WHERE id=?",
                    (us.ERROR, task_id),
                )
        conn.commit()
    finally:
        conn.close()


def has_waiting(slug: str, db_path: Optional[Path] = None) -> bool:
    conn = _db(db_path)
    try:
        ensure_upload_columns(conn)
        return bool(conn.execute(
            "SELECT 1 FROM upload_tasks WHERE status=? AND video_slug=? LIMIT 1", (us.WAITING_RENDER, slug)
        ).fetchone())
    finally:
        conn.close()
