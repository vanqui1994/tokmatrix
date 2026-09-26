"""So trùng trước khi xếp lịch đăng (giai đoạn 0 — đo trước khi sửa, 26/09).

TikTok đánh "trùng lặp" video science/kinetic với video đầu tiên cùng thể loại. Trước khi xếp lịch,
so vân tay video (bkt_web.video_fingerprint) với mọi video đã đăng / đang đăng / đang chờ đăng trên MỌI
acc. Đo trên video thật: cặp bị TikTok đánh trùng có 69–100% khung giống, cặp không bị có 0%.

Config Autopilot:
  dup_check_mode       off | report (chỉ ghi, mặc định) | block (hoãn video giống quá ngưỡng)
  dup_frames_threshold tỉ lệ khung giống (0–1) coi là trùng, mặc định 0.30
Mỗi lần kiểm ghi vào bảng dup_checks của storage/video_fingerprints.db.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from . import store

COMPARE_STATUSES = ("SUCCESS", "NEEDS_CHECK", "UPLOADING", "QUEUED", "PENDING")

CHECKS_SQL = """
CREATE TABLE IF NOT EXISTS dup_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_slug TEXT NOT NULL,
    tiktok_id INTEGER,
    closest_slug TEXT DEFAULT '',
    closest_channel INTEGER,
    frames REAL DEFAULT 0,
    mean_frame REAL DEFAULT 0,
    same_bgm INTEGER DEFAULT 0,
    score REAL DEFAULT 0,
    compared INTEGER DEFAULT 0,
    mode TEXT DEFAULT '',
    verdict TEXT DEFAULT '',
    checked_at INTEGER DEFAULT 0
);
"""


def _published_slugs(exclude: str) -> Dict[str, int]:
    """slug → acc của mọi video đã/đang/sắp đăng (trừ chính nó)."""
    conn = store.channels_db()
    try:
        marks = ",".join("?" for _ in COMPARE_STATUSES)
        rows = conn.execute(
            f"SELECT video_slug, channel_id FROM upload_tasks WHERE status IN ({marks}) AND COALESCE(video_slug,'')<>''",
            COMPARE_STATUSES,
        ).fetchall()
    finally:
        conn.close()
    return {slug: int(channel) for slug, channel in rows if slug != exclude}


def check(slug: str, tiktok_id: int, *, fp_conn=None, record: bool = True) -> Dict[str, Any]:
    """Video giống nhất trong các video đã/đang/sắp đăng. Video chưa có vân tay thì tính (vài giây)."""
    from bkt_web import video_fingerprint as vf

    conn = fp_conn or vf.connect()
    conn.executescript(CHECKS_SQL)
    mine = vf.get_or_compute(conn, slug)
    others = _published_slugs(slug)
    known = vf.load(conn, others.keys())
    best: Dict[str, Any] = {"closest_slug": "", "closest_channel": None, "frames": 0.0, "mean_frame": 0.0,
                            "same_bgm": False, "score": 0.0}
    for other_slug, fp in known.items():
        visual = vf.visual_similarity(mine, fp)
        if visual["frames"] < best["frames"] or (visual["frames"] == best["frames"] and visual["mean"] <= best["mean_frame"]):
            continue
        sim = {**visual, "audio": 0.0, "same_bgm": bool(mine["bgm_md5"]) and mine["bgm_md5"] == fp["bgm_md5"],
               "same_voice": False, "mean_frame": visual["mean"]}
        best = {"closest_slug": other_slug, "closest_channel": others[other_slug], "frames": visual["frames"],
                "mean_frame": visual["mean"], "same_bgm": sim["same_bgm"], "score": vf.score(sim)}
    best["compared"] = len(known)
    best["missing"] = len(others) - len(known)
    if record:
        conn.execute(
            """INSERT INTO dup_checks(video_slug,tiktok_id,closest_slug,closest_channel,frames,mean_frame,same_bgm,score,compared,mode,verdict,checked_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (slug, tiktok_id, best["closest_slug"], best["closest_channel"], best["frames"], best["mean_frame"],
             int(best["same_bgm"]), best["score"], best["compared"], mode(), "", int(time.time())),
        )
        best["check_id"] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()
    return best


def mode() -> str:
    value = store.get_config("dup_check_mode", "report")
    return value if value in ("off", "report", "block") else "report"


def threshold() -> float:
    try:
        return float(store.get_config("dup_frames_threshold", "0.30"))
    except ValueError:
        return 0.30


def verdict(slug: str, tiktok_id: int) -> Optional[str]:
    """Lý do hoãn nếu mode=block và video giống quá ngưỡng; None nếu cho đăng. Không bao giờ ném lỗi."""
    current = mode()
    if current == "off":
        return None
    try:
        result = check(slug, tiktok_id)
    except Exception as exc:  # thiếu MP4, ffmpeg lỗi… → không chặn vì lỗi đo
        store.log_event(f"📏 Không đo được độ trùng {slug}: {type(exc).__name__}: {exc}", "warn")
        return None
    too_close = result["frames"] >= threshold()
    note = (f"📏 {slug} → acc #{tiktok_id}: giống nhất {result['closest_slug'] or '—'} (acc #{result['closest_channel']}) "
            f"{result['frames'] * 100:.0f}% khung, khung TB {result['mean_frame']:.2f}"
            f"{', cùng nhạc nền' if result['same_bgm'] else ''} — so {result['compared']} video")
    if too_close and current == "block":
        store.log_event(note + f" ≥ ngưỡng {threshold():.2f} → HOÃN", "warn")
        return f"giống {result['closest_slug']} {result['frames'] * 100:.0f}% khung (ngưỡng {threshold() * 100:.0f}%)"
    if too_close:
        store.log_event(note + f" ≥ ngưỡng {threshold():.2f} (chế độ report — vẫn đăng)", "warn")
    return None


def recent(limit: int = 50) -> List[Dict[str, Any]]:
    from bkt_web import video_fingerprint as vf

    conn = vf.connect()
    conn.executescript(CHECKS_SQL)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(dup_checks)")]
    return [dict(zip(cols, row)) for row in conn.execute("SELECT * FROM dup_checks ORDER BY id DESC LIMIT ?", (limit,))]
