"""Cửa duy nhất ghi vào bảng upload_tasks.

Mọi luồng tạo task đăng TikTok (Compare Studio, đăng tay/đăng ngay, Story Remake, Kuaishou → Muse) gọi `insert`;
các luồng tự đăng theo lịch của tài khoản gọi `enqueue_auto`. Phần kiểm tra riêng của từng luồng (ảnh chờ, MP4,
ngôn ngữ…) vẫn ở luồng đó. Module này không import gì nặng để mọi nơi import được mà không vòng.
"""

from __future__ import annotations

import time
from typing import Optional


def insert(conn, channel_id: int, video_path: str, caption: str, hashtags: str, schedule_ts: int, *,
           status: str = "QUEUED", ai_generated: bool = True, run_id: str = "", video_slug: str = "",
           unique_run: bool = False) -> int:
    """Tạo một task đăng và trả id. `unique_run`: (run_id, kênh) đã có task → trả id cũ, không tạo bài trùng.
    Không commit: người gọi quản lý transaction."""
    if unique_run and run_id:
        row = conn.execute("SELECT id FROM upload_tasks WHERE run_id=? AND channel_id=?", (run_id, int(channel_id))).fetchone()
        if row:
            return int(row[0])
    row = {"channel_id": int(channel_id), "video_path": str(video_path), "caption": caption or "",
           "hashtags": hashtags or "", "schedule_time": int(schedule_ts), "status": status, "created_at": int(time.time()),
           "ai_generated": 1 if ai_generated else 0, "run_id": run_id or ""}
    if video_slug:  # cột thêm sau (publish_flow.ensure_upload_columns); luồng không có slug không cần nó
        row["video_slug"] = video_slug
    cur = conn.execute(f"INSERT INTO upload_tasks ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    return int(cur.lastrowid)


def enqueue_auto(conn, channel_id: int, video_path: str, caption: str, *, niche: str, language: str, run_id: str,
                 ai_generated: bool = False, slot: Optional[int] = None) -> int:
    """Task đăng tự động: khung giờ kế tiếp của tài khoản (Autopilot scheduler) và hashtag theo niche + ngôn ngữ."""
    try:
        from bkt_web.autopilot import captions, scheduler
    except ImportError:
        from autopilot import captions, scheduler
    if slot is None:
        slot = scheduler.next_slot(int(channel_id)) or int(time.time()) + 3600
    return insert(conn, channel_id, video_path, caption, captions.hashtags_for(niche, language), slot,
                  ai_generated=ai_generated, run_id=run_id, unique_run=True)
