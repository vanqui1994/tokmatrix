"""Nhịp đăng theo tài khoản (owner 08/10 sau điều tra shadowban: 79/243 video 0 view, 41 acc mọi video 0 view nhưng
TikTok Studio vẫn báo "eligible" — bị bóp phân phối ở cấp tài khoản, không phải phạt nội dung).

- Cho acc nghỉ (`channel_rest`): acc đang nghỉ không được cấp slot đăng (autopilot.scheduler), task của nó tới giờ thì
  bị dời tới hết hạn nghỉ (server.run_upload_scheduler), Autopilot không lập kế hoạch làm video mới cho nó.
- Khởi động chậm: acc dưới WARMUP_FOLLOWERS follower đăng tối đa WARMUP_PER_DAY bài/ngày và cách nhau ít nhất
  WARMUP_GAP_HOURS giờ (ngày 27/09 acc 0 follower đăng 2–3 bài dồn vào 17–20h).

CLI:  python3 -m bkt_web.account_pacing rest --ids 17,18 --days 14 [--reason …] | release --ids … | list
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import time
from typing import Dict, Iterable, Optional

from bkt_web import paths

WARMUP_FOLLOWERS = int(os.environ.get("TOKMATRIX_WARMUP_FOLLOWERS", "100") or 0)
WARMUP_PER_DAY = int(os.environ.get("TOKMATRIX_WARMUP_PER_DAY", "1") or 1)
WARMUP_GAP_HOURS = float(os.environ.get("TOKMATRIX_WARMUP_GAP_HOURS", "20") or 0)

SCHEMA = """CREATE TABLE IF NOT EXISTS channel_rest (
    channel_id INTEGER PRIMARY KEY,
    until INTEGER NOT NULL,
    reason TEXT DEFAULT '',
    created_at INTEGER NOT NULL
)"""


def _conn(conn: Optional[sqlite3.Connection] = None) -> sqlite3.Connection:
    c = conn or sqlite3.connect(str(paths.DB_PATH), timeout=30)
    c.execute(SCHEMA)
    return c


def rest_until(channel_id: int, conn: Optional[sqlite3.Connection] = None, now: Optional[float] = None) -> int:
    """Epoch hết nghỉ nếu acc đang nghỉ, 0 nếu không."""
    c = _conn(conn)
    try:
        row = c.execute("SELECT until FROM channel_rest WHERE channel_id=?", (int(channel_id),)).fetchone()
    finally:
        if conn is None:
            c.close()
    until = int(row[0]) if row else 0
    return until if until > (time.time() if now is None else now) else 0


def resting(conn: Optional[sqlite3.Connection] = None, now: Optional[float] = None) -> Dict[int, int]:
    c = _conn(conn)
    try:
        rows = c.execute("SELECT channel_id, until FROM channel_rest WHERE until > ?", (int(time.time() if now is None else now),)).fetchall()
    finally:
        if conn is None:
            c.close()
    return {int(a): int(b) for a, b in rows}


def is_warming(channel_id: int, conn: Optional[sqlite3.Connection] = None) -> bool:
    """Acc mới / ít follower: đăng chậm. Không đọc được follower → coi như đang khởi động (an toàn hơn)."""
    if WARMUP_FOLLOWERS <= 0:
        return False
    c = _conn(conn)
    try:
        row = c.execute("SELECT COALESCE(follower_count, 0) FROM channels WHERE id=?", (int(channel_id),)).fetchone()
    finally:
        if conn is None:
            c.close()
    return int(row[0] if row else 0) < WARMUP_FOLLOWERS


def daily_limit(channel_id: int, default: int, conn: Optional[sqlite3.Connection] = None) -> int:
    return min(default, WARMUP_PER_DAY) if is_warming(channel_id, conn) else default


def min_gap_seconds(channel_id: int, default: int, conn: Optional[sqlite3.Connection] = None) -> int:
    return max(default, int(WARMUP_GAP_HOURS * 3600)) if is_warming(channel_id, conn) else default


def next_allowed(channel_id: int, conn: sqlite3.Connection, now: Optional[float] = None) -> int:
    """Thời điểm sớm nhất acc được đăng tiếp (0 = ngay): hết nghỉ, và với acc khởi động, đủ giãn cách từ bài trước."""
    now = time.time() if now is None else now
    wait = rest_until(channel_id, conn, now)
    if is_warming(channel_id, conn) and WARMUP_GAP_HOURS > 0:
        last = conn.execute("SELECT MAX(COALESCE(started_at, uploaded_at, 0)) FROM upload_tasks WHERE channel_id=? "
                            "AND status IN ('SUCCESS','UPLOADING','NEEDS_CHECK')", (int(channel_id),)).fetchone()[0] or 0
        gap_end = int(last + WARMUP_GAP_HOURS * 3600)
        if gap_end > now:
            wait = max(wait, gap_end)
    return wait


def set_rest(ids: Iterable[int], days: float, reason: str = "") -> int:
    ids = [int(i) for i in ids]
    until, now = int(time.time() + days * 86400), int(time.time())
    c = _conn()
    try:
        for cid in ids:
            c.execute("INSERT INTO channel_rest(channel_id, until, reason, created_at) VALUES (?,?,?,?) "
                      "ON CONFLICT(channel_id) DO UPDATE SET until=excluded.until, reason=excluded.reason",
                      (int(cid), until, reason, now))
            # Task đang chờ của acc nghỉ dời tới hết hạn nghỉ (không huỷ: video vẫn đăng sau khi acc nghỉ xong).
            c.execute("UPDATE upload_tasks SET schedule_time=? WHERE channel_id=? AND status IN ('QUEUED','PENDING') "
                      "AND schedule_time < ?", (until, int(cid), until))
        c.commit()
        return len(ids)
    finally:
        c.close()


def release(ids: Iterable[int]) -> None:
    c = _conn()
    try:
        c.executemany("DELETE FROM channel_rest WHERE channel_id=?", [(int(i),) for i in ids])
        c.commit()
    finally:
        c.close()


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="python3 -m bkt_web.account_pacing")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("rest"); r.add_argument("--ids", required=True); r.add_argument("--days", type=float, default=14); r.add_argument("--reason", default="")
    rl = sub.add_parser("release"); rl.add_argument("--ids", required=True)
    sub.add_parser("list")
    a = ap.parse_args(argv)
    if a.cmd == "rest":
        ids = [int(x) for x in a.ids.split(",") if x.strip()]
        set_rest(ids, a.days, a.reason)
        print(f"{len(ids)} acc nghỉ {a.days:g} ngày")
    elif a.cmd == "release":
        release([int(x) for x in a.ids.split(",") if x.strip()])
        print("ok")
    else:
        for cid, until in sorted(resting().items()):
            print(cid, time.strftime("%Y-%m-%d %H:%M", time.localtime(until)))


if __name__ == "__main__":
    main()
