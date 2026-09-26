"""Worker trong server cho Hàng Đợi Kịch Bản ↔ agent Antigravity (giống bridge ảnh).

Mỗi 5 giây:
  1. pull   — claim task `pending` (engine=antigravity) và ghi gói .md/.json vào script_bridge/inbox
              cho tới khi inbox có đủ SCRIPT_BRIDGE_MAX_TASKS task.
  2. import — JSON agent ghi vào outbox/<task_id>.json → đóng task (completed); JSON hỏng → failed.
  3. stale  — task nằm trong inbox quá SCRIPT_BRIDGE_STALE_MINUTES mà agent chưa trả → failed.

Chạy trực tiếp trên DB/hàm của script_routes nên không cần HTTP hay cookie đăng nhập.
Việc giao inbox cho agent do timer `tokmatrix-script-bridge` trên VPS đảm nhận (deploy/).
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Dict, Optional

try:
    from bkt_web import antigravity_scriptwriter as writer
    from bkt_web import script_routes as routes
except ImportError:  # chạy trực tiếp trong bkt_web/
    import antigravity_scriptwriter as writer
    import script_routes as routes

logger = logging.getLogger("script_bridge")

WORKER_ID = "script-bridge-auto"
STOP = threading.Event()
THREAD: Optional[threading.Thread] = None


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, default)))
    except ValueError:
        return default


MAX_TASKS = _env_int("SCRIPT_BRIDGE_MAX_TASKS", 8)
STALE_SECONDS = _env_int("SCRIPT_BRIDGE_STALE_MINUTES", 30) * 60


def _dirs() -> Dict[str, Path]:
    return writer._bridge_dirs(writer.BRIDGE_ROOT)


def _pending_ids(limit: int) -> list:
    conn = routes._db()
    try:
        rows = conn.execute(
            "SELECT id FROM script_queue WHERE status='pending' AND engine=? ORDER BY created_ts LIMIT ?",
            (routes.ENGINE, limit),
        ).fetchall()
        return [r[0] for r in rows]
    finally:
        conn.close()


def pull_once() -> int:
    """Đưa task pending vào inbox; trả số task vừa pull."""
    dirs = _dirs()
    room = MAX_TASKS - len(list(dirs["inbox"].glob("*.json")))
    pulled = 0
    for task_id in _pending_ids(max(0, room)):
        try:
            task = routes.claim_script_task(task_id, routes.ClaimRequest(worker_id=WORKER_ID))["task"]
        except Exception:  # vừa bị worker khác claim
            continue
        writer.write_task_bundle(task, writer.BRIDGE_ROOT)
        pulled += 1
    return pulled


def _archive(task_id: str, target: Path) -> None:
    dirs = _dirs()
    for suffix in (".json", ".md"):
        request = dirs["inbox"] / f"{task_id}{suffix}"
        if request.exists():
            shutil.move(str(request), target / request.name)


def import_once() -> int:
    """Nhập JSON trong outbox; trả số task đã đóng."""
    dirs = _dirs()
    done = 0
    for path in sorted(dirs["outbox"].glob("*.json")):
        task_id = path.stem
        try:
            writer._task_stem(task_id)
        except ValueError:
            shutil.move(str(path), dirs["failed"] / path.name)
            continue
        if time.time() - path.stat().st_mtime < 2:
            continue  # agent có thể vẫn đang ghi file
        try:
            script = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(script, dict):
                raise ValueError("JSON phải là object")
        except (OSError, ValueError) as exc:
            _safe_fail(task_id, f"agent trả JSON không hợp lệ: {exc}")
            shutil.move(str(path), dirs["failed"] / f"{task_id}-{int(time.time())}.json")
            _archive(task_id, dirs["failed"])
            continue
        try:
            routes.complete_script_task(task_id, routes.CompleteScriptRequest(
                script_json=script, notes="Hoàn thành qua script bridge tự động"))
        except Exception as exc:  # task đã bị xoá khỏi hàng đợi
            logger.warning("Không đóng được task kịch bản %s: %s", task_id, exc)
            shutil.move(str(path), dirs["failed"] / path.name)
            continue
        shutil.move(str(path), dirs["archive"] / f"{task_id}.json")
        _archive(task_id, dirs["archive"])
        done += 1
    return done


def _safe_fail(task_id: str, error: str) -> None:
    try:
        routes.fail_script_task(task_id, error)
    except Exception:
        pass


def expire_stale_once(now: Optional[float] = None) -> int:
    """Task trong inbox quá hạn mà không có kết quả → failed (người gọi sẽ retry)."""
    dirs = _dirs()
    now = time.time() if now is None else now
    expired = 0
    for bundle in dirs["inbox"].glob("*.json"):
        task_id = bundle.stem
        if (dirs["outbox"] / f"{task_id}.json").exists() or now - bundle.stat().st_mtime < STALE_SECONDS:
            continue
        _safe_fail(task_id, f"agent chưa trả kết quả sau {STALE_SECONDS // 60} phút")
        _archive(task_id, dirs["failed"])
        expired += 1
    return expired


def _run() -> None:
    while not STOP.wait(5):
        for step in (import_once, expire_stale_once, pull_once):
            try:
                step()
            except Exception:
                logger.exception("script bridge %s lỗi", step.__name__)


def start() -> None:
    global THREAD
    STOP.clear()
    if not THREAD or not THREAD.is_alive():
        THREAD = threading.Thread(target=_run, name="script-bridge-worker", daemon=True)
        THREAD.start()


def stop() -> None:
    STOP.set()
    if THREAD and THREAD.is_alive():
        THREAD.join(timeout=5)
