"""Số liệu tổng: bảng điều khiển, thống kê tài khoản, lịch sử doanh thu/follower theo kênh."""

from __future__ import annotations

import time
from fastapi import APIRouter
try:
    from bkt_web.db_utils import connect_db
except ImportError:
    from db_utils import connect_db

try:
    from bkt_web import paths
except ImportError:
    import paths

router = APIRouter()


@router.get("/api/channels/{ch_id}/history")
def api_channel_history(ch_id: int, days: int = 30):
    """Chuỗi thời gian doanh thu / RPM / follower của một kênh."""
    since = int(time.time()) - max(1, days) * 86400
    conn = connect_db(paths.DB_PATH)
    try:
        rows = conn.execute(
            """SELECT captured_at, captured_ts, earned, balance, rpm,
                      follower_count, view_count, like_count, video_count, status
               FROM channel_metrics_history
               WHERE channel_id=? AND captured_ts >= ?
               ORDER BY captured_ts ASC""",
            (ch_id, since),
        ).fetchall()
        info = conn.execute(
            "SELECT note, username, nickname, currency FROM channels WHERE id=?", (ch_id,)
        ).fetchone()
    finally:
        conn.close()

    points = [
        {
            "captured_at": r[0], "captured_ts": r[1], "earned": r[2], "balance": r[3],
            "rpm": r[4], "follower_count": r[5], "view_count": r[6], "like_count": r[7],
            "video_count": r[8], "status": r[9],
        }
        for r in rows
    ]
    growth = {}
    if len(points) >= 2:
        first, last = points[0], points[-1]
        growth = {
            "earned": round((last["earned"] or 0) - (first["earned"] or 0), 2),
            "follower": (last["follower_count"] or 0) - (first["follower_count"] or 0),
            "view": (last["view_count"] or 0) - (first["view_count"] or 0),
        }
    return {
        "success": True,
        "channel": {
            "id": ch_id,
            "note": info[0] if info else "",
            "username": info[1] if info else "",
            "nickname": info[2] if info else "",
            "currency": info[3] if info else "",
        },
        "points": points,
        "growth": growth,
        "total": len(points),
    }


@router.get("/api/channels/history-summary")
def api_channels_history_summary(days: int = 30):
    """Tổng doanh thu toàn hệ thống theo từng ngày (điểm cuối cùng của mỗi kênh/ngày)."""
    since = int(time.time()) - max(1, days) * 86400
    conn = connect_db(paths.DB_PATH)
    try:
        rows = conn.execute(
            """SELECT day, SUM(earned) AS earned, SUM(followers) AS followers,
                      AVG(rpm) AS rpm, COUNT(*) AS channels
               FROM (
                   SELECT date(captured_ts, 'unixepoch', 'localtime') AS day,
                          channel_id,
                          MAX(captured_ts) AS ts,
                          earned, follower_count AS followers, rpm
                   FROM channel_metrics_history
                   WHERE captured_ts >= ?
                   GROUP BY day, channel_id
               )
               GROUP BY day ORDER BY day ASC""",
            (since,),
        ).fetchall()
    finally:
        conn.close()
    return {
        "success": True,
        "days": [
            {"day": r[0], "earned": round(r[1] or 0, 2), "followers": int(r[2] or 0),
             "rpm": round(r[3] or 0, 2), "channels": r[4]}
            for r in rows
        ],
    }


@router.get("/api/dashboard/summary")
def api_dashboard_summary():
    """Số liệu gom cho Bảng Điều Khiển: kênh, render, lịch đăng, hàng đợi ảnh, nick."""
    conn = connect_db(paths.DB_PATH)

    def scalar(sql, params=(), default=0):
        try:
            row = conn.execute(sql, params).fetchone()
            return (row[0] if row and row[0] is not None else default)
        except Exception:
            return default

    def rows(sql, params=()):
        try:
            return conn.execute(sql, params).fetchall()
        except Exception:
            return []

    try:
        today_start = int(time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d")))
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
                "queued": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status IN ('QUEUED','PENDING')"),
                "uploading": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status='UPLOADING'"),
                "success": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status='SUCCESS'"),
                "failed": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status IN ('FAILED','ERROR')"),
                "needs_check": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status='NEEDS_CHECK'"),
                "waiting_render": scalar("SELECT COUNT(*) FROM upload_tasks WHERE status='WAITING_RENDER'"),
                "next": [
                    {"id": r[0], "caption": (r[1] or "")[:60], "schedule_time": r[2], "channel_id": r[3]}
                    for r in rows(
                        """SELECT id, caption, schedule_time, channel_id FROM upload_tasks
                           WHERE status IN ('QUEUED','PENDING') ORDER BY schedule_time ASC LIMIT 5"""
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
                    "SELECT id, error_message, created_at FROM upload_tasks WHERE status IN ('FAILED','ERROR') ORDER BY id DESC LIMIT 5"
                )
            ],
        }
    finally:
        conn.close()
    return {"success": True, "data": data}


def _stats_bucket(rows, label_key="label"):
    """Chuẩn hoá kết quả GROUP BY thành danh sách có nhãn và số lượng."""
    return [{label_key: (r[0] or "(trống)"), "count": r[1]} for r in rows]


@router.get("/api/stats/accounts")
def api_stats_accounts(days: int = 30):
    """Thống kê toàn bộ tài khoản TikTok: cơ cấu, khán giả, tăng trưởng, nội dung.

    Tiền tệ được gom theo từng mã thay vì cộng gộp: bảng `channels` giữ mỗi kênh
    một `currency` riêng (EUR, GBP, KRW…) nên một phép SUM duy nhất sẽ ra con số
    vô nghĩa. Ứng dụng không có nguồn tỷ giá nào, vì vậy không quy đổi và cũng
    không tự gắn ký hiệu "$" cho số tiền của kênh khác vùng.
    """
    days = max(1, min(int(30 if days is None else days), 365))
    since = int(time.time()) - days * 86400
    today_start = int(time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d")))
    conn = connect_db(paths.DB_PATH)

    def rows(sql, params=()):
        try:
            return conn.execute(sql, params).fetchall()
        except Exception:
            return []

    def scalar(sql, params=(), default=0):
        row = rows(sql, params)
        if not row or row[0][0] is None:
            return default
        return row[0][0]

    try:
        totals = {
            "channels": scalar("SELECT COUNT(*) FROM channels"),
            "monetized": scalar("SELECT COUNT(*) FROM channels WHERE status LIKE '%BKT%' AND status NOT LIKE '%CHƯA%'"),
            "dead": scalar("SELECT COUNT(*) FROM channels WHERE status LIKE '%DIE%'"),
            "never_checked": scalar("SELECT COUNT(*) FROM channels WHERE COALESCE(last_checked, 0) = 0"),
            "checked_today": scalar("SELECT COUNT(*) FROM channels WHERE last_checked >= ?", (today_start,)),
            "kyc_done": scalar("SELECT COUNT(*) FROM channels WHERE kyc NOT IN ('No', '', 'no')"),
            "vpn_assigned": scalar("SELECT COUNT(*) FROM channels WHERE COALESCE(vpn_config, '') <> ''"),
            "with_profile": scalar("SELECT COUNT(*) FROM channels WHERE COALESCE(profile_dir, '') <> ''"),
        }

        audience_row = rows(
            """SELECT COALESCE(SUM(follower_count), 0), COALESCE(SUM(like_count), 0),
                      COALESCE(SUM(view_count), 0), COALESCE(SUM(video_count), 0)
               FROM channels"""
        )
        f, l, v, vid = audience_row[0] if audience_row else (0, 0, 0, 0)
        audience = {
            "followers": int(f or 0),
            "likes": int(l or 0),
            "views": int(v or 0),
            "videos": int(vid or 0),
            "avg_followers": round((f or 0) / totals["channels"], 1) if totals["channels"] else 0,
        }

        # Mỗi mã tiền tệ một dòng. "#" là giá trị mặc định khi kênh chưa quét ra tiền tệ.
        money = [
            {
                "currency": r[0] or "#",
                "channels": r[1],
                "earned": round(r[2] or 0, 2),
                "balance": round(r[3] or 0, 2),
                "avg_rpm": round(r[4] or 0, 2),
            }
            for r in rows(
                """SELECT currency, COUNT(*), SUM(earned), SUM(balance), AVG(rpm)
                   FROM channels GROUP BY currency ORDER BY SUM(earned) DESC"""
            )
        ]

        by_status = _stats_bucket(rows(
            "SELECT status, COUNT(*) FROM channels GROUP BY status ORDER BY COUNT(*) DESC"
        ), "status")
        by_country = [
            {
                "country": r[0] or "(trống)",
                "count": r[1],
                "followers": int(r[2] or 0),
                "views": int(r[3] or 0),
                "monetized": r[4],
            }
            for r in rows(
                """SELECT country, COUNT(*), SUM(follower_count), SUM(view_count),
                          SUM(CASE WHEN status LIKE '%BKT%' AND status NOT LIKE '%CHƯA%' THEN 1 ELSE 0 END)
                   FROM channels GROUP BY country ORDER BY COUNT(*) DESC"""
            )
        ]
        by_publisher = _stats_bucket(rows(
            "SELECT COALESCE(NULLIF(publisher, ''), 'Chưa gán'), COUNT(*) FROM channels GROUP BY 1 ORDER BY COUNT(*) DESC"
        ), "publisher")

        # Chuỗi theo ngày: mỗi kênh chỉ lấy mốc cuối cùng trong ngày rồi mới cộng lại,
        # nếu không thì một ngày quét nhiều lần sẽ nhân đôi số follower.
        series = [
            {
                "day": r[0],
                "followers": int(r[1] or 0),
                "views": int(r[2] or 0),
                "likes": int(r[3] or 0),
                "channels": r[4],
            }
            for r in rows(
                """SELECT day, SUM(follower_count), SUM(view_count), SUM(like_count), COUNT(*)
                   FROM (
                       SELECT date(captured_ts, 'unixepoch', 'localtime') AS day,
                              channel_id,
                              MAX(captured_ts) AS ts,
                              follower_count, view_count, like_count
                       FROM channel_metrics_history
                       WHERE captured_ts >= ?
                       GROUP BY day, channel_id
                   )
                   GROUP BY day ORDER BY day ASC""",
                (since,),
            )
        ]
        growth = {}
        if len(series) >= 2:
            first, last = series[0], series[-1]
            growth = {
                "followers": last["followers"] - first["followers"],
                "views": last["views"] - first["views"],
                "likes": last["likes"] - first["likes"],
                "from_day": first["day"],
                "to_day": last["day"],
            }

        top_channels = [
            {
                "id": r[0], "username": r[1] or "", "note": r[2] or "", "status": r[3] or "",
                "country": r[4] or "", "followers": int(r[5] or 0), "views": int(r[6] or 0),
                "videos": int(r[7] or 0),
            }
            for r in rows(
                """SELECT id, username, note, status, country, follower_count, view_count, video_count
                   FROM channels ORDER BY follower_count DESC, view_count DESC LIMIT 10"""
            )
        ]

        videos = {
            "total": scalar("SELECT COUNT(*) FROM channel_videos"),
            "channels_with_videos": scalar("SELECT COUNT(DISTINCT channel_id) FROM channel_videos"),
            "prohibited": scalar("SELECT COUNT(*) FROM channel_videos WHERE is_prohibited=1"),
            "reviewing": scalar("SELECT COUNT(*) FROM channel_videos WHERE is_reviewing=1"),
            "not_original": scalar("SELECT COUNT(*) FROM channel_videos WHERE is_original=0"),
            "by_shadowban": _stats_bucket(rows(
                "SELECT shadowban_status, COUNT(*) FROM channel_videos GROUP BY shadowban_status ORDER BY COUNT(*) DESC"
            ), "shadowban"),
            "top": [
                {
                    "video_id": r[0], "desc": (r[1] or "")[:80], "views": int(r[2] or 0),
                    "likes": int(r[3] or 0), "comments": int(r[4] or 0), "shares": int(r[5] or 0),
                    "channel_id": r[6], "url": r[7] or "",
                }
                for r in rows(
                    """SELECT video_id, desc, view_count, like_count, comment_count, share_count,
                              channel_id, video_url
                       FROM channel_videos ORDER BY view_count DESC LIMIT 10"""
                )
            ],
        }

        # Kênh lâu chưa quét nhất — đây là việc cần làm, không phải số liệu trang trí.
        stale = [
            {
                "id": r[0], "username": r[1] or "", "note": r[2] or "",
                "last_checked": int(r[3] or 0), "status": r[4] or "",
            }
            for r in rows(
                """SELECT id, username, note, last_checked, status FROM channels
                   ORDER BY COALESCE(last_checked, 0) ASC LIMIT 8"""
            )
        ]
    finally:
        conn.close()

    return {
        "success": True,
        "data": {
            "days": days,
            "totals": totals,
            "audience": audience,
            "money": money,
            "by_status": by_status,
            "by_country": by_country,
            "by_publisher": by_publisher,
            "series": series,
            "growth": growth,
            "top_channels": top_channels,
            "videos": videos,
            "stale": stale,
        },
    }
