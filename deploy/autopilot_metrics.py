#!/usr/bin/env python3
"""Ghi một mẫu số liệu Autopilot (CHỈ ĐỌC) vào bkt_web/storage/metrics/autopilot-YYYY-MM-DD.jsonl.

Chạy mỗi 10 phút bằng tokmatrix-metrics.timer (deploy/systemd/). Không ghi vào DB nào, không đổi
trạng thái hệ thống; dùng để đo công suất (render, ảnh, kịch bản) và tải máy trước khi quyết định nâng cấp.

  python3 deploy/autopilot_metrics.py            # ghi một mẫu
  python3 deploy/autopilot_metrics.py --print    # in mẫu ra màn hình, không ghi
"""
from __future__ import annotations

import collections
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BKT = ROOT / "bkt_web"
OUT_DIR = BKT / "storage" / "metrics"

CPU_GROUPS = (
    ("render", ("chrome-headless-shell", "hyperframes", "ffmpeg")),
    ("agent", ("antigravity", "language_server")),
    ("publisher", ("google-chrome", "/opt/google/chrome")),
    ("app", ("uvicorn",)),
    ("matrix", ("batch-matrix", "bkt_web.matrix_db", "bkt_web.script_queue_cli")),
)


def ro(path: Path):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)


def rows(path: Path, sql: str, params=()):
    try:
        with ro(path) as conn:
            return conn.execute(sql, params).fetchall()
    except sqlite3.Error as exc:
        return [("__error__", str(exc))]


def system() -> dict:
    load = open("/proc/loadavg").read().split()[:3]
    mem = {line.split(":")[0]: int(line.split()[1]) for line in open("/proc/meminfo") if ":" in line}
    usage = shutil.disk_usage(ROOT)
    cpu = collections.Counter()
    procs = collections.Counter()
    try:
        out = subprocess.run(["ps", "-eo", "pcpu=,args="], capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.TimeoutExpired):
        out = ""
    for line in out.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2:
            continue
        pcpu, args = float(parts[0]), parts[1]
        group = next((name for name, needles in CPU_GROUPS if any(n in args for n in needles)), "other")
        cpu[group] += pcpu
        if "hyperframes" in args and " render" in args:
            procs["hyperframes_render"] += 1
        if "tools/batch-matrix.mjs" in args:
            procs["batch_matrix"] += 1
        if args.split(None, 1)[0].endswith("wireproxy"):
            procs["vpn_tunnels"] += 1  # mọi tunnel dùng chung tài khoản NordVPN (~10 kết nối)
    return {
        "load": [float(x) for x in load],
        "cpus": os.cpu_count(),
        "mem_total_gb": round(mem.get("MemTotal", 0) / 1048576, 2),
        "mem_available_gb": round(mem.get("MemAvailable", 0) / 1048576, 2),
        "swap_used_gb": round((mem.get("SwapTotal", 0) - mem.get("SwapFree", 0)) / 1048576, 2),
        "disk_free_gb": round(usage.free / 1024 ** 3, 1),
        "cpu_percent_by_group": {k: round(v, 1) for k, v in cpu.items()},
        "processes": dict(procs),
    }


def pipeline() -> dict:
    matrix = BKT / "storage" / "matrix_factory.db"
    main = BKT / "bkt_channels.db"
    auto = BKT / "storage" / "autopilot.db"
    jobs = rows(matrix, "SELECT job_id, state, engine_type, updated_at FROM content_jobs WHERE batch_id LIKE 'autopilot-%'")
    jobs = [j for j in jobs if j[0] != "__error__"]
    return {
        "job_states": dict(collections.Counter(j[1] for j in jobs)),
        # trạng thái từng job → suy ra thời gian mỗi bước (RENDERING → READY_TO_PUBLISH…) giữa các mẫu
        "jobs": {j[0]: [j[1], j[2], j[3]] for j in jobs},
        "artifacts_last_10min": dict(rows(matrix, "SELECT artifact_type, COUNT(*) FROM scene_artifacts "
                                                   "WHERE created_at >= ? GROUP BY 1", (int(time.time()) - 600,))),
        "image_queue": dict(rows(main, "SELECT status, COUNT(*) FROM image_queue GROUP BY 1")),
        "images_completed_last_10min": rows(main, "SELECT COUNT(*) FROM image_queue WHERE status='completed' "
                                                   "AND updated_at >= datetime('now','localtime','-10 minutes')")[0][0],
        "script_queue": dict(rows(main, "SELECT status, COUNT(*) FROM script_queue GROUP BY 1")),
        "upload_tasks": dict(rows(main, "SELECT status, COUNT(*) FROM upload_tasks GROUP BY 1")),
        "plans": dict(rows(auto, "SELECT status, COUNT(*) FROM autopilot_plans GROUP BY 1")),
        "last_run": rows(auto, "SELECT id, trigger, status, started_at, finished_at, error FROM autopilot_runs "
                               "ORDER BY id DESC LIMIT 1"),
        "bridge_inbox": {
            "image": len(list((BKT / "storage" / "antigravity_bridge" / "inbox").glob("*.md"))),
            "script": len(list((BKT / "storage" / "script_bridge" / "inbox").glob("*.md"))),
        },
        "web_active": subprocess.run(["systemctl", "is-active", "tokmatrix-web"], capture_output=True,
                                     text=True).stdout.strip(),
    }


def main() -> int:
    sample = {"ts": int(time.time()), "at": time.strftime("%Y-%m-%d %H:%M:%S"), **system(), **pipeline()}
    if "--print" in sys.argv:
        print(json.dumps({k: v for k, v in sample.items() if k != "jobs"}, ensure_ascii=False, indent=2))
        return 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / f"autopilot-{time.strftime('%Y-%m-%d')}.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps(sample, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
