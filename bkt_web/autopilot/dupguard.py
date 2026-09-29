"""So trùng trước khi xếp lịch đăng (giai đoạn 0 — đo trước khi sửa, 26/09).

TikTok đánh "trùng lặp" video science/kinetic với video đầu tiên cùng thể loại. Trước khi xếp lịch,
so vân tay video (bkt_web.video_fingerprint) với mọi video đã đăng / đang đăng / đang chờ đăng trên MỌI
acc. Đo trên video thật: cặp bị TikTok đánh trùng có 69–100% khung giống, cặp không bị có 0%.

Config Autopilot:
  dup_check_mode       off | report (chỉ ghi, mặc định) | block (hoãn video giống quá ngưỡng)
  dup_frames_threshold tỉ lệ khung giống (0–1) coi là trùng, mặc định 0.30
  dup_composite_threshold  trống (mặc định) = composite chỉ được ghi và báo; đặt số 0–1 thì video có composite
                       ≥ ngưỡng cũng bị coi là trùng (thêm vào luật khung, không thay nó — gate không bao giờ bị nới)
Mỗi lần kiểm ghi vào bảng dup_checks của storage/video_fingerprints.db.

Ngoài khung (pHash), mỗi lần kiểm còn đo composite đa tín hiệu (bkt_web.creative_similarity: layout, declared,
visual, motion, color, asset, timing — docs/MATRIX_VARIANT_SYSTEM_V2.md mục 10) với COMPOSITE_NEIGHBORS video
giống nhất theo khung. Features được cache ở storage/creative_similarity.db; lỗi đo composite không chặn video.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from . import store

try:
    from bkt_web import upload_states as us
except ImportError:
    import upload_states as us

COMPARE_STATUSES = (us.SUCCESS, us.NEEDS_CHECK, us.UPLOADING, *us.QUEUE_STATES)
COMPOSITE_NEIGHBORS = 5

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
    checked_at INTEGER DEFAULT 0,
    composite REAL,
    composite_slug TEXT DEFAULT ''
);
"""


def _ensure_schema(conn) -> None:
    conn.executescript(CHECKS_SQL)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(dup_checks)")}
    if "composite" not in cols:
        conn.execute("ALTER TABLE dup_checks ADD COLUMN composite REAL")
    if "composite_slug" not in cols:
        conn.execute("ALTER TABLE dup_checks ADD COLUMN composite_slug TEXT DEFAULT ''")


def _composite(slug: str, neighbors: List[str]) -> Dict[str, Any]:
    """Composite đa tín hiệu cao nhất giữa ``slug`` và các video láng giềng (theo khung). Video không đo được thì bỏ qua."""
    from bkt_web import creative_similarity as cs

    conn = cs.connect()
    try:
        mine = cs.features_for(slug, conn)
        best: Dict[str, Any] = {"composite": None, "composite_slug": "", "composite_signals": {}}
        for other in neighbors:
            try:
                scores = cs.compare(mine, cs.features_for(other, conn))
            except (OSError, ValueError, KeyError, IndexError):
                continue
            if best["composite"] is None or scores["composite"] > best["composite"]:
                best = {"composite": scores["composite"], "composite_slug": other, "composite_signals": scores}
        return best
    finally:
        conn.close()


def _published_slugs(exclude: str) -> Dict[str, int]:
    """slug → acc của mọi video đã/đang/sắp đăng (trừ chính nó)."""
    conn = store.channels_db()
    try:
        marks = us.sql_marks(COMPARE_STATUSES)
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
    _ensure_schema(conn)
    mine = vf.get_or_compute(conn, slug)
    others = _published_slugs(slug)
    known = vf.load(conn, others.keys())
    best: Dict[str, Any] = {"closest_slug": "", "closest_channel": None, "frames": 0.0, "mean_frame": 0.0,
                            "same_bgm": False, "score": 0.0}
    ranked = []
    for other_slug, fp in known.items():
        visual = vf.visual_similarity(mine, fp)
        ranked.append((visual["frames"], visual["mean"], other_slug))
        if visual["frames"] < best["frames"] or (visual["frames"] == best["frames"] and visual["mean"] <= best["mean_frame"]):
            continue
        sim = {**visual, "audio": 0.0, "same_bgm": bool(mine["bgm_md5"]) and mine["bgm_md5"] == fp["bgm_md5"],
               "same_voice": False, "mean_frame": visual["mean"]}
        best = {"closest_slug": other_slug, "closest_channel": others[other_slug], "frames": visual["frames"],
                "mean_frame": visual["mean"], "same_bgm": sim["same_bgm"], "score": vf.score(sim)}
    best["compared"] = len(known)
    best["missing"] = len(others) - len(known)
    neighbors = [other for _frames, _mean, other in sorted(ranked, reverse=True)[:COMPOSITE_NEIGHBORS]]
    best.update({"composite": None, "composite_slug": "", "composite_signals": {}})
    if neighbors:
        try:
            best.update(_composite(slug, neighbors))
        except Exception as exc:  # thiếu meta/MP4, ffmpeg lỗi… → vẫn có kết quả theo khung
            store.log_event(f"📏 Không đo được composite {slug}: {type(exc).__name__}: {exc}", "warn")
    if best["composite_slug"]:
        best["composite_channel"] = others.get(best["composite_slug"])
    if record:
        conn.execute(
            """INSERT INTO dup_checks(video_slug,tiktok_id,closest_slug,closest_channel,frames,mean_frame,same_bgm,score,compared,mode,verdict,checked_at,composite,composite_slug)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (slug, tiktok_id, best["closest_slug"], best["closest_channel"], best["frames"], best["mean_frame"],
             int(best["same_bgm"]), best["score"], best["compared"], mode(), "", int(time.time()),
             best["composite"], best["composite_slug"]),
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


def composite_threshold() -> Optional[float]:
    value = store.get_config("dup_composite_threshold", "").strip()
    try:
        return float(value) if value else None
    except ValueError:
        return None


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
    by_frames = result["frames"] >= threshold()
    limit = composite_threshold()
    composite = result.get("composite")
    by_composite = limit is not None and composite is not None and composite >= limit
    composite_note = f", composite {composite:.2f} với {result['composite_slug']}" if composite is not None else ""
    note = (f"📏 {slug} → acc #{tiktok_id}: giống nhất {result['closest_slug'] or '—'} (acc #{result['closest_channel']}) "
            f"{result['frames'] * 100:.0f}% khung, khung TB {result['mean_frame']:.2f}"
            f"{', cùng nhạc nền' if result['same_bgm'] else ''}{composite_note} — so {result['compared']} video")
    if by_frames:
        reason = f"giống {result['closest_slug']} {result['frames'] * 100:.0f}% khung (ngưỡng {threshold() * 100:.0f}%)"
        rule = f"≥ ngưỡng {threshold():.2f}"
    elif by_composite:
        reason = f"giống {result['composite_slug']} composite {composite:.2f} (ngưỡng {limit:.2f})"
        rule = f"composite ≥ ngưỡng {limit:.2f}"
    else:
        return None
    if current == "block":
        store.log_event(note + f" {rule} → HOÃN", "warn")
        return reason
    store.log_event(note + f" {rule} (chế độ report — vẫn đăng)", "warn")
    return None


def recent(limit: int = 50) -> List[Dict[str, Any]]:
    from bkt_web import video_fingerprint as vf

    conn = vf.connect()
    _ensure_schema(conn)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(dup_checks)")]
    return [dict(zip(cols, row)) for row in conn.execute("SELECT * FROM dup_checks ORDER BY id DESC LIMIT ?", (limit,))]
