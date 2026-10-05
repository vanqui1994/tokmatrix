"""Durable, idempotent queue storage for remake jobs (UV-806)."""

from __future__ import annotations

import copy
import json
import sqlite3
import threading
import time
from contextlib import closing
from pathlib import Path
from typing import Any

from bkt_web.db_utils import configure_database, connect_db


TASK_SCHEMA = "tokmatrix.remake-task/v1"
TERMINAL_STATUSES = frozenset({"completed", "needs_review", "cancelled"})
RETRYABLE_STATUSES = frozenset({"error"})


class RemakeTaskStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = connect_db(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def initialize(self) -> None:
        with closing(self._connect()) as conn:
            configure_database(conn)
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS remake_tasks (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    source_sha256 TEXT,
                    video_path TEXT,
                    project_name TEXT,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    current_step TEXT NOT NULL DEFAULT '',
                    logs_json TEXT NOT NULL DEFAULT '[]',
                    result_json TEXT,
                    error TEXT,
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 3,
                    next_retry_at REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    created_ts REAL NOT NULL,
                    updated_ts REAL NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_remake_tasks_source
                    ON remake_tasks(source_sha256)
                    WHERE kind='remake' AND source_sha256 IS NOT NULL;
                CREATE INDEX IF NOT EXISTS idx_remake_tasks_queue
                    ON remake_tasks(kind, status, next_retry_at, created_ts);
                """
            )

    @staticmethod
    def _loads(value: str | None, fallback: Any) -> Any:
        if not value:
            return copy.deepcopy(fallback)
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return copy.deepcopy(fallback)

    @classmethod
    def _row(cls, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "schema": TASK_SCHEMA,
            "id": row["id"],
            "kind": row["kind"],
            "source_sha256": row["source_sha256"],
            "video_path": row["video_path"],
            "project_name": row["project_name"],
            "video": Path(row["video_path"]).name if row["video_path"] else None,
            "status": row["status"],
            "progress": row["progress"],
            "current_step": row["current_step"],
            "logs": cls._loads(row["logs_json"], []),
            "result": cls._loads(row["result_json"], None),
            "error": row["error"],
            "attempt_count": row["attempt_count"],
            "max_attempts": row["max_attempts"],
            "next_retry_at": row["next_retry_at"],
            "created_at": row["created_at"],
            "created_ts": row["created_ts"],
            "updated_ts": row["updated_ts"],
        }

    def get(self, task_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM remake_tasks WHERE id=?", (task_id,)).fetchone()
        return self._row(row) if row else None

    def find_by_source(self, source_sha256: str) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM remake_tasks WHERE kind='remake' AND source_sha256=?",
                (source_sha256,),
            ).fetchone()
        return self._row(row) if row else None

    def create_remake(
        self, *, task_id: str, source_sha256: str, video_path: str,
        project_name: str, initial_log: str,
    ) -> tuple[dict[str, Any], bool]:
        now = time.time()
        created_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now))
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = conn.execute(
                "SELECT * FROM remake_tasks WHERE kind='remake' AND source_sha256=?",
                (source_sha256,),
            ).fetchone()
            if existing:
                conn.commit()
                return self._row(existing), False
            conn.execute(
                """INSERT INTO remake_tasks
                   (id, kind, source_sha256, video_path, project_name, status,
                    progress, current_step, logs_json, attempt_count, max_attempts,
                    next_retry_at, created_at, created_ts, updated_ts)
                   VALUES (?, 'remake', ?, ?, ?, 'pending', 0, ?, ?, 0, 3, 0, ?, ?, ?)""",
                (task_id, source_sha256, video_path, project_name, "Đang xếp hàng...",
                 json.dumps([initial_log], ensure_ascii=False), created_at, now, now),
            )
            conn.commit()
        return self.get(task_id), True  # type: ignore[return-value]

    def put(self, task: dict[str, Any]) -> None:
        now = time.time()
        with self._lock, closing(self._connect()) as conn:
            conn.execute(
                """UPDATE remake_tasks SET status=?, progress=?, current_step=?,
                   logs_json=?, result_json=?, error=?, attempt_count=?, max_attempts=?,
                   next_retry_at=?, updated_ts=? WHERE id=?""",
                (task.get("status", "pending"), int(task.get("progress", 0)),
                 str(task.get("current_step", "")), json.dumps(task.get("logs", []), ensure_ascii=False),
                 json.dumps(task.get("result"), ensure_ascii=False) if task.get("result") is not None else None,
                 task.get("error"), int(task.get("attempt_count", 0)), int(task.get("max_attempts", 3)),
                 float(task.get("next_retry_at", 0)), now, task["id"]),
            )
            conn.commit()

    def recover_interrupted(self) -> int:
        """Put interrupted work back on the queue without losing its record."""
        with self._lock, closing(self._connect()) as conn:
            cursor = conn.execute(
                """UPDATE remake_tasks SET status='pending', next_retry_at=0,
                   current_step='Khôi phục sau khi ứng dụng khởi động lại', updated_ts=?
                   WHERE kind='remake' AND status='processing'""",
                (time.time(),),
            )
            conn.commit()
            return cursor.rowcount

    def claim_next(self, *, now: float | None = None) -> dict[str, Any] | None:
        stamp = time.time() if now is None else now
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """SELECT * FROM remake_tasks
                   WHERE kind='remake' AND status='pending' AND next_retry_at<=?
                   ORDER BY created_ts, id LIMIT 1""",
                (stamp,),
            ).fetchone()
            if not row:
                conn.commit()
                return None
            attempt = int(row["attempt_count"]) + 1
            conn.execute(
                """UPDATE remake_tasks SET status='processing', attempt_count=?,
                   current_step='Khởi động Worker Remake Pipeline...', updated_ts=?
                   WHERE id=? AND status='pending'""",
                (attempt, stamp, row["id"]),
            )
            conn.commit()
        return self.get(row["id"])

    def fail_or_retry(self, task_id: str, error: str, *, now: float | None = None) -> dict[str, Any]:
        task = self.get(task_id)
        if task is None:
            raise KeyError(task_id)
        stamp = time.time() if now is None else now
        if task["attempt_count"] < task["max_attempts"]:
            task["status"] = "pending"
            task["next_retry_at"] = stamp + min(60.0, 2.0 ** max(0, task["attempt_count"] - 1))
            task["current_step"] = "Lỗi tạm thời; đang chờ thử lại"
        else:
            task["status"] = "error"
            task["next_retry_at"] = 0
            task["current_step"] = "Đã hết số lần thử lại"
        task["error"] = error[:2000]
        self.put(task)
        return task

    def requeue(self, task_id: str, *, video_path: str, log: str) -> dict[str, Any]:
        """Chạy lại task của cùng nguồn (giữ id và project_name).

        Dùng khi người dùng tải lại đúng video đó nhưng lần trước đã lỗi hết
        lượt thử hoặc project đã bị xoá khỏi registry.
        """
        task = self.get(task_id)
        if task is None:
            raise KeyError(task_id)
        logs = list(task.get("logs") or [])
        logs.append(log)
        task.update(
            status="pending", progress=0, attempt_count=0, next_retry_at=0,
            error=None, result=None, current_step="Đang xếp hàng...", logs=logs,
        )
        now = time.time()
        with self._lock, closing(self._connect()) as conn:
            conn.execute(
                "UPDATE remake_tasks SET video_path=?, updated_ts=? WHERE id=?",
                (video_path, now, task_id),
            )
            conn.commit()
        task["video_path"] = video_path
        task["video"] = Path(video_path).name
        self.put(task)
        return self.get(task_id)  # type: ignore[return-value]

    def retry(self, task_id: str) -> dict[str, Any]:
        task = self.get(task_id)
        if task is None:
            raise KeyError(task_id)
        if task["status"] not in RETRYABLE_STATUSES:
            raise ValueError("Chỉ task lỗi mới được retry thủ công")
        task.update(
            status="pending", attempt_count=0, next_retry_at=0, error=None,
            current_step="Đã xếp hàng thử lại",
        )
        self.put(task)
        return task
