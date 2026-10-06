"""Kuaishou → remake bằng hoạt hình vector → hàng đợi đăng TikTok (owner 06/10, thay Canvas Remake).

Mỗi nguồn là một profile Kuaishou gán cho MỘT tài khoản TikTok và một kênh Matrix dùng được engine vector (ngôn ngữ, niche,
giọng của kênh đó). Luồng nền: quét profile (multi_downloader.kuaishou_profile, cùng Chrome Kuaishou với muse_remake) mỗi
SCAN_HOURS giờ → mỗi 24 giờ lấy tối đa `per_day` video mới nhất chưa làm → tải MP4 → `source_remake.create` (chép lời,
Gemini viết lại lời dẫn bằng ngôn ngữ kênh, engine vector dựng + TTS + Video QA) → MP4 chép vào storage/kuaishou_vector/
(trình đăng chỉ nhận file trong storage) → upload_tasks QUEUED ở khung giờ kế tiếp của tài khoản.

Một profile chỉ thuộc một tài khoản, kể cả giữa hai dây chuyền Kuaishou (Muse và vector): cùng video gốc lên hai tài khoản là
trùng. Không bao giờ làm video tiếng Việt: kênh Matrix phải là de/en/ko/ja (source_remake.vector_channels).
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from bkt_web import multi_downloader, muse_remake, source_remake
except ImportError:  # chạy trong thư mục bkt_web
    import multi_downloader
    import muse_remake
    import source_remake

HERE = Path(__file__).resolve().parent
DB = HERE / "storage" / "kuaishou_vector.db"
BASE = HERE / "storage" / "kuaishou_vector"
CHANNELS_DB = HERE / "bkt_channels.db"
SCAN_HOURS = 3
RETRY_AFTER = 3600
MAX_ATTEMPTS = 3
TICK = 60

_thread: Optional[threading.Thread] = None
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB), timeout=30)
    c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, profile_url TEXT NOT NULL UNIQUE, channel_id INTEGER NOT NULL UNIQUE,
        matrix_channel_id TEXT NOT NULL, per_day INTEGER NOT NULL DEFAULT 3, enabled INTEGER NOT NULL DEFAULT 1,
        last_scan INTEGER NOT NULL DEFAULT 0, scan_error TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, ks_id TEXT NOT NULL, url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', duration REAL NOT NULL DEFAULT 0, posted INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'available', job_id TEXT NOT NULL DEFAULT '', output TEXT NOT NULL DEFAULT '',
        upload_task_id INTEGER, error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
        started INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        UNIQUE(source_id, ks_id));
    """)
    return c


# ------------------------------------------------------------------ nguồn
def sources() -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM sources ORDER BY id")]
        for r in rows:
            r["counts"] = {k: n for k, n in c.execute("SELECT status, COUNT(*) FROM videos WHERE source_id=? GROUP BY status", (r["id"],))}
    return rows


def matrix_channel_for(account_id: int) -> str:
    """Kênh Matrix đang gắn với tài khoản (autopilot_channel_map); tài khoản đã rời Autopilot phải truyền matrix_channel_id."""
    try:
        from bkt_web.autopilot import channels as ach
    except ImportError:
        from autopilot import channels as ach
    mapping = ach.get_mapping_for_tiktok(account_id) or {}
    return mapping.get("matrix_channel_id") or ""


def add_source(profile_url: str, account_id: int, per_day: int = 3, matrix_channel_id: str = "") -> Dict[str, Any]:
    url = multi_downloader.kuaishou_profile_url(profile_url)
    if not url:
        raise ValueError("Cần link profile Kuaishou: https://www.kuaishou.com/profile/… hoặc link chia sẻ profile v.kuaishou.com/…")
    if account_id not in muse_remake._account_names():
        raise ValueError("Không có tài khoản TikTok này")
    if any(s["profile_url"] == url or s["channel_id"] == account_id for s in muse_remake.sources()):
        raise ValueError("Profile hoặc tài khoản này đã có nguồn Kuaishou → Muse (một profile ↔ một tài khoản)")
    matrix = matrix_channel_id or matrix_channel_for(account_id)
    if not matrix:
        raise ValueError("Tài khoản chưa gắn kênh Matrix — cần kênh Matrix dùng được engine vector (ngôn ngữ, niche, giọng)")
    source_remake._channel(matrix)  # ValueError nếu niche/ngôn ngữ không dùng được vector (không bao giờ tiếng Việt)
    with _conn() as c:
        try:
            c.execute("INSERT INTO sources(profile_url, channel_id, matrix_channel_id, per_day, created) VALUES (?,?,?,?,?)",
                      (url, account_id, matrix, max(1, min(10, per_day)), int(time.time())))
        except sqlite3.IntegrityError:
            raise ValueError("Profile này hoặc tài khoản này đã được gán (một profile ↔ một tài khoản)")
    return next(s for s in sources() if s["profile_url"] == url)


def update_source(sid: int, *, per_day: Optional[int] = None, enabled: Optional[bool] = None) -> None:
    with _conn() as c:
        if per_day is not None:
            c.execute("UPDATE sources SET per_day=? WHERE id=?", (max(1, min(10, per_day)), sid))
        if enabled is not None:
            c.execute("UPDATE sources SET enabled=? WHERE id=?", (1 if enabled else 0, sid))


def delete_source(sid: int) -> None:
    with _conn() as c:
        c.execute("DELETE FROM sources WHERE id=?", (sid,))
        c.execute("DELETE FROM videos WHERE source_id=? AND status='available'", (sid,))


# ------------------------------------------------------------------ quét + chọn video
def scan(source: Dict[str, Any]) -> int:
    now, added = int(time.time()), 0
    try:
        items = multi_downloader.kuaishou_profile(source["profile_url"], 30)
    except Exception as e:  # noqa: BLE001
        with _conn() as c:
            c.execute("UPDATE sources SET last_scan=?, scan_error=? WHERE id=?", (now, str(e)[:300], source["id"]))
        return 0
    with _conn() as c:
        for it in items:
            cur = c.execute("INSERT OR IGNORE INTO videos(source_id, ks_id, url, title, duration, posted, created, updated) "
                            "VALUES (?,?,?,?,?,?,?,?)", (source["id"], it["id"], it["url"], it.get("title", ""),
                                                         it.get("duration") or 0, it.get("posted", 0), now, now))
            added += cur.rowcount
        c.execute("UPDATE sources SET last_scan=?, scan_error='' WHERE id=?", (now, source["id"]))
    return added


def _start_due(now: float) -> None:
    """Video `available` mới nhất → `queued`, tới hết hạn mức 24 giờ của từng nguồn."""
    with _conn() as c:
        for s in c.execute("SELECT * FROM sources WHERE enabled=1").fetchall():
            used = c.execute("SELECT COUNT(*) FROM videos WHERE source_id=? AND started>=?", (s["id"], now - 86400)).fetchone()[0]
            for v in c.execute("SELECT id FROM videos WHERE source_id=? AND status='available' ORDER BY posted DESC, id ASC LIMIT ?",
                               (s["id"], max(0, s["per_day"] - used))).fetchall():
                c.execute("UPDATE videos SET status='queued', started=?, updated=? WHERE id=?", (int(now), int(now), v["id"]))


# ------------------------------------------------------------------ một video
def _update(vid: int, **fields) -> None:
    fields["updated"] = int(time.time())
    with _conn() as c:
        c.execute(f"UPDATE videos SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?", (*fields.values(), vid))


def _enqueue(v: Dict[str, Any], s: Dict[str, Any], final: Path, caption: str) -> int:
    try:
        from bkt_web.autopilot import captions, scheduler
    except ImportError:
        from autopilot import captions, scheduler
    ch = source_remake._channel(s["matrix_channel_id"])
    run_id = f"kuaishou_vector:{v['id']}"
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
        row = c.execute("SELECT id FROM upload_tasks WHERE run_id=? AND channel_id=?", (run_id, s["channel_id"])).fetchone()
        if row:
            return int(row[0])
        slot = scheduler.next_slot(s["channel_id"]) or int(time.time()) + 3600
        cur = c.execute("INSERT INTO upload_tasks(channel_id, video_path, caption, hashtags, schedule_time, status, created_at, "
                        "ai_generated, run_id) VALUES (?,?,?,?,?,'QUEUED',?,0,?)",
                        (s["channel_id"], str(final), caption[:300], captions.hashtags_for(ch["niche"], ch["language"]),
                         int(slot), int(time.time()), run_id))
        return int(cur.lastrowid)


def step(v: Dict[str, Any], s: Dict[str, Any], now: float) -> None:
    """Đẩy một video đi tiếp một bước (gọi lặp lại mỗi nhịp; mọi bước đều làm lại được)."""
    work = BASE / str(v["id"])
    work.mkdir(parents=True, exist_ok=True)
    if v["status"] == "queued":
        try:
            src = muse_remake._download(v, work)
            job = source_remake.create(str(src), s["matrix_channel_id"], title="", source_url=v["url"])
            _update(v["id"], status="making", job_id=job["id"], error="")
        except Exception as e:  # noqa: BLE001
            _update(v["id"], status="error", error=f"tải/tạo job: {e}"[:600], attempts=v["attempts"] + 1)
        return
    if v["status"] != "making":
        return
    job = source_remake.load(v["job_id"])
    if job.get("status") == "error":
        _update(v["id"], status="error", error=str(job.get("error") or "")[:600], attempts=v["attempts"] + 1)
        return
    if job.get("status") != "done" or not job.get("output"):
        return
    final = work / "final.mp4"
    shutil.copy2(job["output"], final)
    task = _enqueue(v, s, final, job.get("title") or v.get("title") or "")
    _update(v["id"], status="done", output=str(final), upload_task_id=task, error="")


def retry_errors(now: float) -> None:
    """Lỗi tạm (Gemini hết quota, render lỗi) → thử lại sau RETRY_AFTER, tối đa MAX_ATTEMPTS lần."""
    with _conn() as c:
        for v in c.execute("SELECT * FROM videos WHERE status='error' AND attempts<? AND updated<?",
                           (MAX_ATTEMPTS, int(now - RETRY_AFTER))).fetchall():
            if v["job_id"]:
                try:
                    source_remake.retry(v["job_id"], rerender_only=False)
                    c.execute("UPDATE videos SET status='making', updated=? WHERE id=?", (int(now), v["id"]))
                    continue
                except Exception:  # noqa: BLE001
                    pass
            c.execute("UPDATE videos SET status='queued', updated=? WHERE id=?", (int(now), v["id"]))


def tick(now: Optional[float] = None) -> None:
    now = now or time.time()
    srcs = {s["id"]: s for s in sources()}
    for s in srcs.values():
        if s["enabled"] and now - s["last_scan"] >= SCAN_HOURS * 3600:
            scan(s)
    _start_due(now)
    retry_errors(now)
    with _conn() as c:
        active = [dict(r) for r in c.execute("SELECT * FROM videos WHERE status IN ('queued','making') ORDER BY id")]
    for v in active:
        s = srcs.get(v["source_id"])
        if s:
            step(v, s, now)


def _loop() -> None:
    while True:
        try:
            tick()
        except Exception as exc:  # noqa: BLE001 — luồng nền không được chết
            print(f"[kuaishou-vector] {exc}")
        time.sleep(TICK)


def start() -> None:
    global _thread
    with _lock:
        if _thread and _thread.is_alive():
            return
        source_remake.start()  # luồng dựng vector của source_remake (server chưa tự bật)
        _thread = threading.Thread(target=_loop, name="kuaishou-vector", daemon=True)
        _thread.start()


def status() -> Dict[str, Any]:
    with _conn() as c:
        counts = {k: n for k, n in c.execute("SELECT status, COUNT(*) FROM videos GROUP BY status")}
    return {"running": bool(_thread and _thread.is_alive()), "videos": counts, "sources": len(sources())}
