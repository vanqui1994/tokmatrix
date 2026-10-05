"""Hàng đợi học vector: đối tượng mà video remake cần nhưng thư viện vector chưa có.

`report(names, niche, job_id, frames)` gộp theo tên đã chuẩn hoá (một mục cho "fish bone" dù gặp ở 15 video), đếm số
lần gặp, nhớ các job đang chờ và khung hình gốc. Worker `vector_learner` lấy mục gặp nhiều nhất để tạo rig mới; khi rig
đạt kiểm tra, mục thành `learned` và các job chờ được dựng lại (`source_remake.retry`).

Bảng `learn_items` trong storage/vector_learning.db.
"""
from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

DB = Path(__file__).resolve().parent / "storage" / "vector_learning.db"
STATUSES = ("pending", "generating", "learned", "failed", "skipped")


def _conn() -> sqlite3.Connection:
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB), timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("""CREATE TABLE IF NOT EXISTS learn_items (
        name TEXT PRIMARY KEY, niches TEXT NOT NULL DEFAULT '[]', seen INTEGER NOT NULL DEFAULT 0,
        jobs TEXT NOT NULL DEFAULT '[]', frames TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending',
        rig_id TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
        sheet TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, updated INTEGER NOT NULL)""")
    return c


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")[:40]


def report(names: Iterable[str], niche: str = "", job_id: str = "", frames: Optional[List[str]] = None) -> None:
    now = int(time.time())
    with _conn() as c:
        for name in dict.fromkeys(n.strip().lower() for n in names if n and n.strip()):
            row = c.execute("SELECT * FROM learn_items WHERE name=?", (name,)).fetchone()
            if row is None:
                c.execute("INSERT INTO learn_items(name, niches, seen, jobs, frames, created, updated) VALUES (?,?,?,?,?,?,?)",
                          (name, json.dumps([niche] if niche else []), 1, json.dumps([job_id] if job_id else []),
                           json.dumps((frames or [])[:4]), now, now))
                continue
            niches = list(dict.fromkeys([*json.loads(row["niches"]), *([niche] if niche else [])]))
            jobs = json.loads(row["jobs"])
            new_job = bool(job_id) and job_id not in jobs
            jobs = list(dict.fromkeys([*jobs, *([job_id] if job_id else [])]))[-50:]
            fr = list(dict.fromkeys([*json.loads(row["frames"]), *(frames or [])]))[:8]
            c.execute("UPDATE learn_items SET niches=?, seen=seen+?, jobs=?, frames=?, updated=? WHERE name=?",
                      (json.dumps(niches), 1 if new_job or not job_id else 0, json.dumps(jobs), json.dumps(fr), now, name))


def items(status: Optional[str] = None) -> List[Dict[str, Any]]:
    with _conn() as c:
        q = "SELECT * FROM learn_items" + (" WHERE status=?" if status else "") + " ORDER BY seen DESC, created ASC"
        rows = c.execute(q, (status,) if status else ()).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        for k in ("niches", "jobs", "frames"):
            d[k] = json.loads(d[k])
        out.append(d)
    return out


def claim_next(max_attempts: int = 3) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT name FROM learn_items WHERE status='pending' AND attempts<? ORDER BY seen DESC, created ASC LIMIT 1",
                        (max_attempts,)).fetchone()
        if not row:
            return None
        c.execute("UPDATE learn_items SET status='generating', attempts=attempts+1, updated=? WHERE name=?", (int(time.time()), row["name"]))
    return next(i for i in items() if i["name"] == row["name"])


def finish(name: str, *, rig_id: str = "", error: str = "", sheet: str = "", retry: bool = False) -> None:
    status = "learned" if rig_id else ("pending" if retry else "failed")
    with _conn() as c:
        c.execute("UPDATE learn_items SET status=?, rig_id=?, error=?, sheet=?, updated=? WHERE name=?",
                  (status, rig_id, error[:800], sheet, int(time.time()), name))


def set_status(name: str, status: str) -> None:
    if status not in STATUSES:
        raise ValueError("trạng thái không hợp lệ")
    with _conn() as c:
        c.execute("UPDATE learn_items SET status=?, error=CASE WHEN ?='pending' THEN '' ELSE error END, "
                  "attempts=CASE WHEN ?='pending' THEN 0 ELSE attempts END, updated=? WHERE name=?",
                  (status, status, status, int(time.time()), name))
