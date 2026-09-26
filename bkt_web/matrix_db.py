"""SQLite persistence for AI Video Factory Matrix jobs and artifacts."""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import sys
import unicodedata
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

try:
    from bkt_web.db_utils import configure_database, connect_db
except ImportError:
    from db_utils import configure_database, connect_db

DB_PATH = Path(__file__).resolve().parent / "storage" / "matrix_factory.db"
JOB_STATES = {
    "CREATED", "PLANNING", "SCRIPTING", "SCRIPT_QA", "ASSET_GENERATING", "ASSET_QA",
    "READY_TO_RENDER", "RENDERING", "VIDEO_QA", "READY_TO_PUBLISH", "SCHEDULED",
    "PUBLISHED", "ANALYTICS_PENDING", "COMPLETED", "RETRY_WAIT", "FAILED", "DEAD_LETTER",
}
TERMINAL_STATES = {"COMPLETED", "FAILED", "DEAD_LETTER"}
TRANSITIONS = {
    "CREATED": {"PLANNING"},
    "PLANNING": {"SCRIPTING"},
    "SCRIPTING": {"SCRIPT_QA"},
    "SCRIPT_QA": {"ASSET_GENERATING"},
    "ASSET_GENERATING": {"ASSET_QA"},
    "ASSET_QA": {"READY_TO_RENDER"},
    "READY_TO_RENDER": {"RENDERING"},
    "RENDERING": {"VIDEO_QA"},
    "VIDEO_QA": {"READY_TO_PUBLISH"},
    "READY_TO_PUBLISH": {"SCHEDULED", "PUBLISHED"},
    "SCHEDULED": {"PUBLISHED"},
    "PUBLISHED": {"ANALYTICS_PENDING"},
    "ANALYTICS_PENDING": {"COMPLETED"},
}
ARTIFACT_TYPES = {
    "image", "svg", "canvas", "text", "map", "chart", "existing_asset", "narration",
    "sfx", "subtitle", "segment_video", "manifest",
}
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS topics (
    topic_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    niche_id TEXT NOT NULL,
    category TEXT DEFAULT 'evergreen',
    priority REAL DEFAULT 0.5,
    status TEXT DEFAULT 'READY',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
    channel_id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    tiktok_account_id TEXT,
    persona_tone TEXT NOT NULL,
    preferred_voice_id TEXT NOT NULL,
    visual_style_id TEXT NOT NULL,
    cut_rate_seconds REAL DEFAULT 2.5,
    status TEXT DEFAULT 'ACTIVE',
    config_version INTEGER DEFAULT 1,
    resolved_config_json TEXT,
    updated_at INTEGER,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content_registry (
    content_id TEXT PRIMARY KEY,
    source_job_id TEXT,
    channel_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    angle_title TEXT NOT NULL,
    hook_text TEXT NOT NULL,
    blueprint_id TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    full_script TEXT NOT NULL,
    script_hash TEXT NOT NULL,
    embedding_vector BLOB,
    published_video_slug TEXT,
    similarity_policy_version INTEGER,
    similarity_threshold REAL,
    similarity_score REAL,
    script_qa_score INTEGER,
    qa_details_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(channel_id) REFERENCES channels(channel_id),
    FOREIGN KEY(topic_id) REFERENCES topics(topic_id)
);
CREATE TABLE IF NOT EXISTS batches (
    batch_id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL,
    total_jobs INTEGER NOT NULL,
    completed_jobs INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    status TEXT DEFAULT 'RUNNING',
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content_jobs (
    job_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    state TEXT NOT NULL,
    current_scene_index INTEGER DEFAULT 0,
    total_scenes INTEGER DEFAULT 12,
    completed_scenes_mask TEXT DEFAULT '',
    video_slug TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    locked_by TEXT,
    locked_at INTEGER,
    lease_expires_at INTEGER,
    heartbeat_at INTEGER,
    next_retry_at INTEGER,
    error_message TEXT,
    cost_tokens INTEGER DEFAULT 0,
    cost_images INTEGER DEFAULT 0,
    manifest_json TEXT,
    initial_manifest_hash TEXT,
    resume_state TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(batch_id) REFERENCES batches(batch_id),
    FOREIGN KEY(channel_id) REFERENCES channels(channel_id),
    FOREIGN KEY(topic_id) REFERENCES topics(topic_id)
);
CREATE TABLE IF NOT EXISTS scene_artifacts (
    artifact_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    scene_index INTEGER NOT NULL,
    artifact_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    checksum TEXT,
    status TEXT DEFAULT 'READY',
    created_at INTEGER NOT NULL,
    UNIQUE(job_id, scene_index, artifact_type),
    FOREIGN KEY(job_id) REFERENCES content_jobs(job_id)
);
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    metrics_json TEXT NOT NULL,
    FOREIGN KEY(channel_id) REFERENCES channels(channel_id),
    FOREIGN KEY(content_id) REFERENCES content_registry(content_id)
);
CREATE TABLE IF NOT EXISTS strategy_versions (
    strategy_version_id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    source_snapshot_cutoff INTEGER NOT NULL,
    strategy_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(scope_type, scope_id, source_snapshot_cutoff)
);
"""
INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_jobs_state ON content_jobs(state, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_jobs_batch ON content_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_registry_topic ON content_registry(topic_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registry_source_job ON content_registry(source_job_id) WHERE source_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_niche ON channels(niche_id);
CREATE INDEX IF NOT EXISTS idx_scene_artifacts_job ON scene_artifacts(job_id, scene_index);
CREATE INDEX IF NOT EXISTS idx_analytics_content ON analytics_snapshots(content_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_strategy_scope ON strategy_versions(scope_type, scope_id, created_at);
"""


def _path(db_path: str | Path | None = None) -> Path:
    target = Path(db_path) if db_path is not None else DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def _connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    return connect_db(_path(db_path))


def _ensure_channels(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS channels (
            channel_id TEXT PRIMARY KEY, niche_id TEXT NOT NULL, channel_name TEXT NOT NULL,
            tiktok_account_id TEXT, persona_tone TEXT NOT NULL, preferred_voice_id TEXT NOT NULL,
            visual_style_id TEXT NOT NULL, cut_rate_seconds REAL DEFAULT 2.5,
            status TEXT DEFAULT 'ACTIVE', config_version INTEGER DEFAULT 1,
            resolved_config_json TEXT, updated_at INTEGER,
            created_at INTEGER NOT NULL
        )"""
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(channels)").fetchall()}
    for name, definition in {
        "config_version": "INTEGER DEFAULT 1",
        "resolved_config_json": "TEXT",
        "updated_at": "INTEGER",
    }.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE channels ADD COLUMN {name} {definition}")


def _ensure_job_columns(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(content_jobs)").fetchall()}
    migrations = {
        "locked_by": "TEXT",
        "locked_at": "INTEGER",
        "lease_expires_at": "INTEGER",
        "heartbeat_at": "INTEGER",
        "next_retry_at": "INTEGER",
        "initial_manifest_hash": "TEXT",
        "resume_state": "TEXT",
    }
    for name, definition in migrations.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE content_jobs ADD COLUMN {name} {definition}")


def _ensure_registry_columns(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(content_registry)").fetchall()}
    migrations = {
        "source_job_id": "TEXT",
        "similarity_policy_version": "INTEGER",
        "similarity_threshold": "REAL",
        "similarity_score": "REAL",
        "script_qa_score": "INTEGER",
        "qa_details_json": "TEXT",
    }
    for name, definition in migrations.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE content_registry ADD COLUMN {name} {definition}")


def init_db(db_path: str | Path | None = None) -> None:
    conn = _connect(db_path)
    try:
        configure_database(conn)
        _ensure_channels(conn)
        conn.executescript(SCHEMA_SQL)
        _ensure_job_columns(conn)
        _ensure_registry_columns(conn)
        conn.executescript(INDEX_SQL)
        conn.commit()
    finally:
        conn.close()


def _now() -> int:
    return int(time.time())


def _file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _transaction(db_path: str | Path | None = None):
    conn = _connect(db_path)
    conn.execute("BEGIN IMMEDIATE")
    return conn


def register_topic(
    *, title: str, niche_id: str, category: str = "evergreen", priority: float = 0.5,
    topic_id: str | None = None, db_path: str | Path | None = None,
) -> Dict[str, Any]:
    title, niche_id = str(title or "").strip(), str(niche_id or "").strip()
    if not title or not niche_id:
        raise ValueError("title and niche_id are required")
    if category not in {"evergreen", "trending", "historical", "seasonal"}:
        raise ValueError(f"invalid topic category: {category}")
    if not math.isfinite(float(priority)) or not 0 <= float(priority) <= 1:
        raise ValueError("priority must be between 0 and 1")
    topic_id = topic_id or f"topic_{uuid.uuid4().hex}"
    now = _now()
    conn = _transaction(db_path)
    try:
        conn.execute(
            """INSERT INTO topics(topic_id,title,niche_id,category,priority,status,created_at,updated_at)
               VALUES(?,?,?,?,?,'READY',?,?)
               ON CONFLICT(topic_id) DO UPDATE SET title=excluded.title,niche_id=excluded.niche_id,
                   category=excluded.category,priority=excluded.priority,updated_at=excluded.updated_at""",
            (topic_id, title, niche_id, category, float(priority), now, now),
        )
        conn.commit()
        return {"topic_id": topic_id, "title": title, "niche_id": niche_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def create_batch(
    *, batch_id: str, topic_id: str, total_jobs: int, db_path: str | Path | None = None,
) -> Dict[str, Any]:
    if not batch_id or not topic_id or int(total_jobs) < 1:
        raise ValueError("batch_id, topic_id and positive total_jobs are required")
    now = _now()
    conn = _transaction(db_path)
    try:
        existing = conn.execute("SELECT topic_id,total_jobs FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
        if existing and existing != (topic_id, int(total_jobs)):
            raise ValueError(f"batch_id {batch_id} already exists with different parameters")
        conn.execute(
            "INSERT OR IGNORE INTO batches(batch_id,topic_id,total_jobs,created_at) VALUES(?,?,?,?)",
            (batch_id, topic_id, int(total_jobs), now),
        )
        conn.commit()
        return {"batch_id": batch_id, "topic_id": topic_id, "total_jobs": int(total_jobs)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def create_job(
    *, job_id: str, batch_id: str, channel_id: str, topic_id: str, engine_type: str,
    video_slug: str, total_scenes: int = 12, max_retries: int = 3,
    manifest: Dict[str, Any] | None = None, db_path: str | Path | None = None,
) -> Dict[str, Any]:
    if not all((job_id, batch_id, channel_id, topic_id, engine_type, video_slug)):
        raise ValueError("job_id, batch_id, channel_id, topic_id, engine_type and video_slug are required")
    if int(total_scenes) < 1 or int(max_retries) < 0:
        raise ValueError("total_scenes must be positive and max_retries cannot be negative")
    now = _now()
    manifest_json = json.dumps(manifest or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    initial_manifest_hash = hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()
    conn = _transaction(db_path)
    try:
        conn.execute(
            """INSERT OR IGNORE INTO content_jobs(
                job_id,batch_id,channel_id,topic_id,engine_type,state,total_scenes,video_slug,
                max_retries,manifest_json,initial_manifest_hash,created_at,updated_at
            ) VALUES(?,?,?,?,?,'CREATED',?,?,?,?,?,?,?)""",
            (job_id, batch_id, channel_id, topic_id, engine_type, int(total_scenes), video_slug,
             int(max_retries), manifest_json, initial_manifest_hash, now, now),
        )
        row = conn.execute(
            "SELECT batch_id,channel_id,topic_id,engine_type,video_slug,total_scenes,max_retries,initial_manifest_hash FROM content_jobs WHERE job_id=?",
            (job_id,),
        ).fetchone()
        expected = (batch_id, channel_id, topic_id, engine_type, video_slug, int(total_scenes), int(max_retries))
        if row[:7] != expected or (row[7] and row[7] != initial_manifest_hash):
            raise ValueError(f"job_id {job_id} already exists with different immutable parameters")
        conn.commit()
        return get_job(job_id, db_path=db_path)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _job_dict(row) -> Dict[str, Any]:
    names = [
        "job_id", "batch_id", "channel_id", "topic_id", "engine_type", "state", "current_scene_index",
        "total_scenes", "completed_scenes_mask", "video_slug", "retry_count", "max_retries", "locked_by",
        "locked_at", "lease_expires_at", "heartbeat_at", "next_retry_at", "error_message", "cost_tokens",
        "cost_images", "manifest_json", "initial_manifest_hash", "resume_state", "created_at", "updated_at",
    ]
    result = dict(zip(names, row))
    try:
        result["manifest"] = json.loads(result["manifest_json"] or "{}")
    except (TypeError, ValueError):
        result["manifest"] = {}
    return result


def get_job(job_id: str, db_path: str | Path | None = None) -> Optional[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        row = conn.execute(
            """SELECT job_id,batch_id,channel_id,topic_id,engine_type,state,current_scene_index,total_scenes,
                      completed_scenes_mask,video_slug,retry_count,max_retries,locked_by,locked_at,lease_expires_at,
                      heartbeat_at,next_retry_at,error_message,cost_tokens,cost_images,manifest_json,initial_manifest_hash,resume_state,created_at,updated_at
               FROM content_jobs WHERE job_id=?""",
            (job_id,),
        ).fetchone()
        return _job_dict(row) if row else None
    finally:
        conn.close()


def get_batch(batch_id: str, db_path: str | Path | None = None) -> Optional[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT batch_id,topic_id,total_jobs,completed_jobs,failed_jobs,status,created_at FROM batches WHERE batch_id=?",
            (batch_id,),
        ).fetchone()
        return dict(zip(("batch_id", "topic_id", "total_jobs", "completed_jobs", "failed_jobs", "status", "created_at"), row)) if row else None
    finally:
        conn.close()


def list_batch_jobs(batch_id: str, db_path: str | Path | None = None) -> list[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """SELECT job_id,channel_id,engine_type,state,video_slug,current_scene_index,total_scenes,
                      retry_count,error_message,locked_by,updated_at FROM content_jobs WHERE batch_id=? ORDER BY created_at,job_id""",
            (batch_id,),
        ).fetchall()
        keys = ("job_id", "channel_id", "engine_type", "state", "video_slug", "current_scene_index",
                "total_scenes", "retry_count", "error_message", "locked_by", "updated_at")
        return [dict(zip(keys, row)) for row in rows]
    finally:
        conn.close()


def job_niche_ids(job_id: str, db_path: str | Path | None = None) -> Dict[str, Optional[str]]:
    """Niche của job theo channel và theo topic (None khi thiếu dòng tương ứng)."""
    conn = _connect(db_path)
    try:
        row = conn.execute(
            """SELECT c.niche_id, t.niche_id FROM content_jobs j
               LEFT JOIN channels c ON c.channel_id=j.channel_id
               LEFT JOIN topics t ON t.topic_id=j.topic_id WHERE j.job_id=?""",
            (job_id,),
        ).fetchone()
        return {"channel_niche": row[0] if row else None, "topic_niche": row[1] if row else None}
    finally:
        conn.close()


def get_job_by_slug(video_slug: str, db_path: str | Path | None = None) -> Optional[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT job_id,batch_id,channel_id,state,updated_at FROM content_jobs WHERE video_slug=? "
            "ORDER BY updated_at DESC LIMIT 1",
            (video_slug,),
        ).fetchone()
        return dict(zip(("job_id", "batch_id", "channel_id", "state", "updated_at"), row)) if row else None
    finally:
        conn.close()


def list_jobs_in_states(
    states: Iterable[str], *, updated_before: int, limit: int = 500, db_path: str | Path | None = None,
) -> list[Dict[str, Any]]:
    states = [s for s in states if s in JOB_STATES]
    if not states:
        return []
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            f"""SELECT job_id,batch_id,channel_id,state,video_slug,updated_at FROM content_jobs
                WHERE state IN ({','.join('?' for _ in states)}) AND updated_at < ? ORDER BY updated_at LIMIT ?""",
            (*states, int(updated_before), int(limit)),
        ).fetchall()
        keys = ("job_id", "batch_id", "channel_id", "state", "video_slug", "updated_at")
        return [dict(zip(keys, row)) for row in rows]
    finally:
        conn.close()


def list_topics(niche_id: str, status: str = "READY", limit: int = 500, db_path: str | Path | None = None) -> list[str]:
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT title FROM topics WHERE niche_id=? AND status=? ORDER BY priority DESC, created_at LIMIT ?",
            (niche_id, status, int(limit)),
        ).fetchall()
        return [row[0] for row in rows]
    finally:
        conn.close()


def update_job_manifest(
    *, job_id: str, manifest: Dict[str, Any], worker_id: str | None = None,
    db_path: str | Path | None = None,
) -> Dict[str, Any]:
    conn = _transaction(db_path)
    try:
        row = conn.execute("SELECT locked_by,lease_expires_at FROM content_jobs WHERE job_id=?", (job_id,)).fetchone()
        if not row:
            raise KeyError(f"job not found: {job_id}")
        if worker_id is not None and (row[0] != worker_id or row[1] is None or int(row[1]) <= _now()):
            raise ValueError(f"worker {worker_id} does not hold an active job lease")
        conn.execute(
            "UPDATE content_jobs SET manifest_json=?,updated_at=? WHERE job_id=?",
            (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")), _now(), job_id),
        )
        conn.commit()
        return get_job(job_id, db_path=db_path)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def claim_next_job(
    *, worker_id: str, lease_seconds: int = 60, states: Iterable[str] | None = None, batch_id: str | None = None,
    db_path: str | Path | None = None, now: int | None = None,
) -> Optional[Dict[str, Any]]:
    worker_id = str(worker_id or "").strip()
    if not worker_id or int(lease_seconds) < 1:
        raise ValueError("worker_id and positive lease_seconds are required")
    timestamp = _now() if now is None else int(now)
    conn = _transaction(db_path)
    try:
        filters = "state NOT IN ('COMPLETED','FAILED','DEAD_LETTER','SCHEDULED')"
        params: list[Any] = []
        if states is not None:
            work_states = list(dict.fromkeys(states))
            if not work_states or any(state not in JOB_STATES - TERMINAL_STATES - {"SCHEDULED", "RETRY_WAIT"} for state in work_states):
                raise ValueError("states must contain valid non-terminal worker stages")
            placeholders = ",".join("?" for _ in work_states)
            filters += f" AND (state IN ({placeholders}) OR (state='RETRY_WAIT' AND resume_state IN ({placeholders})))"
            params.extend(work_states)
            params.extend(work_states)
        if batch_id is not None:
            filters += " AND batch_id=?"
            params.append(batch_id)
        filters += " AND (locked_by IS NULL OR lease_expires_at IS NULL OR lease_expires_at<=?)"
        filters += " AND (state!='RETRY_WAIT' OR next_retry_at IS NULL OR next_retry_at<=?)"
        params.extend([timestamp, timestamp])
        row = conn.execute(
            f"""SELECT job_id,state,resume_state FROM content_jobs WHERE {filters}
                ORDER BY CASE state WHEN 'RETRY_WAIT' THEN 0 ELSE 1 END, created_at, job_id LIMIT 1""",
            params,
        ).fetchone()
        if not row:
            conn.commit()
            return None
        job_id, state, resume_state = row
        next_state = resume_state if state == "RETRY_WAIT" and resume_state in TRANSITIONS else state
        conn.execute(
            """UPDATE content_jobs SET state=?,resume_state=NULL,next_retry_at=NULL,
                      locked_by=?,locked_at=?,heartbeat_at=?,lease_expires_at=?,updated_at=?
               WHERE job_id=?""",
            (next_state, worker_id, timestamp, timestamp, timestamp + int(lease_seconds), timestamp, job_id),
        )
        conn.commit()
        return get_job(job_id, db_path=db_path)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def heartbeat_job(
    *, job_id: str, worker_id: str, lease_seconds: int = 60,
    db_path: str | Path | None = None, now: int | None = None,
) -> bool:
    timestamp = _now() if now is None else int(now)
    conn = _transaction(db_path)
    try:
        cur = conn.execute(
            """UPDATE content_jobs SET heartbeat_at=?,lease_expires_at=?,updated_at=?
               WHERE job_id=? AND locked_by=? AND lease_expires_at>?""",
            (timestamp, timestamp + int(lease_seconds), timestamp, job_id, worker_id, timestamp),
        )
        conn.commit()
        return cur.rowcount == 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def release_job(*, job_id: str, worker_id: str, db_path: str | Path | None = None) -> bool:
    conn = _transaction(db_path)
    try:
        cur = conn.execute(
            """UPDATE content_jobs SET locked_by=NULL,locked_at=NULL,lease_expires_at=NULL,
                      heartbeat_at=NULL,updated_at=? WHERE job_id=? AND locked_by=?""",
            (_now(), job_id, worker_id),
        )
        conn.commit()
        return cur.rowcount == 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _update_batch_summary(conn: sqlite3.Connection, batch_id: str) -> None:
    completed, failed = conn.execute(
        """SELECT SUM(CASE WHEN state='COMPLETED' THEN 1 ELSE 0 END),
                  SUM(CASE WHEN state IN ('FAILED','DEAD_LETTER') THEN 1 ELSE 0 END)
           FROM content_jobs WHERE batch_id=?""",
        (batch_id,),
    ).fetchone()
    batch = conn.execute("SELECT total_jobs FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
    completed, failed = int(completed or 0), int(failed or 0)
    total_jobs = int(batch[0]) if batch else 0
    status = "RUNNING"
    if total_jobs > 0 and completed + failed >= total_jobs:
        status = "COMPLETED" if failed == 0 else "PARTIAL_FAILED"
    conn.execute(
        "UPDATE batches SET completed_jobs=?,failed_jobs=?,status=? WHERE batch_id=?",
        (completed, failed, status, batch_id),
    )


def transition_job(
    *, job_id: str, to_state: str, worker_id: str | None = None, expected_state: str | None = None,
    current_scene_index: int | None = None, manifest: Dict[str, Any] | None = None,
    db_path: str | Path | None = None, now: int | None = None,
) -> Dict[str, Any]:
    if to_state not in JOB_STATES or to_state == "RETRY_WAIT":
        raise ValueError(f"invalid direct job transition target: {to_state}")
    conn = _transaction(db_path)
    try:
        row = conn.execute("SELECT state,batch_id,locked_by,lease_expires_at FROM content_jobs WHERE job_id=?", (job_id,)).fetchone()
        if not row:
            raise KeyError(f"job not found: {job_id}")
        state, batch_id, locked_by, lease_expires_at = row
        if expected_state and state != expected_state:
            raise ValueError(f"job {job_id} is {state}, expected {expected_state}")
        timestamp = _now() if now is None else int(now)
        if worker_id is not None and (locked_by != worker_id or lease_expires_at is None or int(lease_expires_at) <= timestamp):
            raise ValueError(f"worker {worker_id} does not hold an active job lease")
        if to_state not in TRANSITIONS.get(state, set()):
            raise ValueError(f"invalid job transition: {state} -> {to_state}")
        updates, params = ["state=?", "updated_at=?"], [to_state, timestamp]
        if current_scene_index is not None:
            updates.append("current_scene_index=?")
            params.append(int(current_scene_index))
        if manifest is not None:
            updates.append("manifest_json=?")
            params.append(json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        if to_state in TERMINAL_STATES:
            updates.extend(["locked_by=NULL", "locked_at=NULL", "lease_expires_at=NULL", "heartbeat_at=NULL"])
        params.append(job_id)
        conn.execute(f"UPDATE content_jobs SET {','.join(updates)} WHERE job_id=?", params)
        _update_batch_summary(conn, batch_id)
        conn.commit()
        return get_job(job_id, db_path=db_path)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


REVIVABLE_STATES = {"FAILED", "DEAD_LETTER"}
REVIVE_TARGETS = {"PLANNING", "SCRIPT_QA", "ASSET_QA"}


def revive_job(
    *, job_id: str, to_state: str, engine_type: str | None = None, drop_script: bool = False,
    db_path: str | Path | None = None, now: int | None = None,
) -> Dict[str, Any]:
    """Đưa job hỏng (FAILED/DEAD_LETTER) về một bước làm lại; giữ nguyên kênh, batch và video_slug.

    to_state: PLANNING (viết lại kịch bản, cần drop_script), SCRIPT_QA (làm lại tài nguyên),
    ASSET_QA (dựng + render lại). Tăng manifest.revive_count để bên gọi giới hạn số lần.
    """
    if to_state not in REVIVE_TARGETS:
        raise ValueError(f"revive target must be one of {sorted(REVIVE_TARGETS)}")
    timestamp = _now() if now is None else int(now)
    conn = _transaction(db_path)
    try:
        row = conn.execute("SELECT state, batch_id, manifest_json FROM content_jobs WHERE job_id=?", (job_id,)).fetchone()
        if not row:
            raise KeyError(f"job not found: {job_id}")
        state, batch_id, manifest_json = row
        if state not in REVIVABLE_STATES:
            raise ValueError(f"job {job_id} is {state}; only FAILED/DEAD_LETTER jobs can be revived")
        manifest = json.loads(manifest_json or "{}")
        manifest["revive_count"] = int(manifest.get("revive_count") or 0) + 1
        if drop_script:
            for key in ("script", "scenes", "content_id", "script_qa", "similarity_qa"):
                manifest.pop(key, None)
        if engine_type and isinstance(manifest.get("channel"), dict):
            manifest["channel"]["engine_type"] = engine_type
        conn.execute(
            """UPDATE content_jobs SET state=?, resume_state=NULL, retry_count=0, error_message=NULL, next_retry_at=NULL,
                      locked_by=NULL, locked_at=NULL, lease_expires_at=NULL, heartbeat_at=NULL, manifest_json=?,
                      engine_type=COALESCE(?, engine_type), updated_at=? WHERE job_id=?""",
            (to_state, json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
             engine_type, timestamp, job_id),
        )
        _update_batch_summary(conn, batch_id)
        conn.commit()
        return get_job(job_id, db_path=db_path)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def defer_job(
    *, job_id: str, worker_id: str, delay_seconds: int = 30, reason: str = "waiting for external assets",
    db_path: str | Path | None = None, now: int | None = None,
) -> Dict[str, Any]:
    if int(delay_seconds) < 1:
        raise ValueError("delay_seconds must be positive")
    timestamp = _now() if now is None else int(now)
    conn = _transaction(db_path)
    try:
        row = conn.execute(
            "SELECT state,locked_by,lease_expires_at FROM content_jobs WHERE job_id=?", (job_id,)
        ).fetchone()
        if not row:
            raise KeyError(f"job not found: {job_id}")
        state, locked_by, lease_expires_at = row
        if state in TERMINAL_STATES:
            raise ValueError(f"cannot defer terminal job in state {state}")
        if locked_by != worker_id or lease_expires_at is None or int(lease_expires_at) <= timestamp:
            raise ValueError(f"worker {worker_id} does not hold an active job lease")
        conn.execute(
            """UPDATE content_jobs SET state='RETRY_WAIT',resume_state=?,next_retry_at=?,error_message=?,
                      locked_by=NULL,locked_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,updated_at=?
               WHERE job_id=?""",
            (state, timestamp + int(delay_seconds), str(reason or "")[:2000], timestamp, job_id),
        )
        conn.commit()
        return get_job(job_id, db_path=db_path)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def retry_job(
    *, job_id: str, error_message: str, worker_id: str | None = None, permanent: bool = False,
    base_delay_seconds: int = 30, max_delay_seconds: int = 3600, resume_state: str | None = None,
    db_path: str | Path | None = None, now: int | None = None,
) -> Dict[str, Any]:
    if int(base_delay_seconds) < 1 or int(max_delay_seconds) < 1:
        raise ValueError("retry backoff delays must be positive")
    timestamp = _now() if now is None else int(now)
    conn = _transaction(db_path)
    try:
        row = conn.execute(
            "SELECT state,batch_id,retry_count,max_retries,locked_by,lease_expires_at FROM content_jobs WHERE job_id=?", (job_id,)
        ).fetchone()
        if not row:
            raise KeyError(f"job not found: {job_id}")
        state, batch_id, retry_count, max_retries, locked_by, lease_expires_at = row
        if state in TERMINAL_STATES:
            raise ValueError(f"cannot retry terminal job in state {state}")
        if worker_id is not None and (locked_by != worker_id or lease_expires_at is None or int(lease_expires_at) <= timestamp):
            raise ValueError(f"worker {worker_id} does not hold an active job lease")
        attempt = int(retry_count) + 1
        if resume_state is not None and resume_state not in TRANSITIONS:
            raise ValueError(f"invalid retry resume state: {resume_state}")
        if permanent:
            target, retry_at, resume_target = "FAILED", None, None
        elif attempt > int(max_retries):
            target, retry_at, resume_target = "DEAD_LETTER", None, None
        else:
            delay = min(int(max_delay_seconds), int(base_delay_seconds) * (2 ** (attempt - 1)))
            target, retry_at, resume_target = "RETRY_WAIT", timestamp + delay, resume_state or state
        conn.execute(
            """UPDATE content_jobs SET state=?,resume_state=?,retry_count=?,next_retry_at=?,error_message=?,
                      locked_by=NULL,locked_at=NULL,lease_expires_at=NULL,heartbeat_at=NULL,updated_at=?
               WHERE job_id=?""",
            (target, resume_target, attempt, retry_at, str(error_message or "")[:2000], timestamp, job_id),
        )
        _update_batch_summary(conn, batch_id)
        conn.commit()
        return get_job(job_id, db_path=db_path)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_scene_mask(*, job_id: str, mask: Iterable[int], db_path: str | Path | None = None) -> str:
    values = [1 if value else 0 for value in mask]
    conn = _transaction(db_path)
    try:
        row = conn.execute("SELECT total_scenes FROM content_jobs WHERE job_id=?", (job_id,)).fetchone()
        if not row:
            raise KeyError(f"job not found: {job_id}")
        if len(values) != int(row[0]):
            raise ValueError(f"scene mask length {len(values)} does not match total_scenes {row[0]}")
        serialized = json.dumps(values, separators=(",", ":"))
        conn.execute("UPDATE content_jobs SET completed_scenes_mask=?,updated_at=? WHERE job_id=?", (serialized, _now(), job_id))
        conn.commit()
        return serialized
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def record_scene_artifact(
    *, job_id: str, scene_index: int, artifact_type: str, file_path: str,
    checksum: str | None = None, status: str = "READY", db_path: str | Path | None = None,
) -> Dict[str, Any]:
    if artifact_type not in ARTIFACT_TYPES or int(scene_index) < 1:
        raise ValueError("invalid artifact_type or scene_index")
    artifact_path = Path(file_path).expanduser().resolve()
    if not artifact_path.is_file() or artifact_path.stat().st_size == 0:
        raise ValueError(f"artifact is missing or empty: {artifact_path}")
    digest = _file_sha256(artifact_path)
    if checksum and checksum.lower() != digest:
        raise ValueError("artifact checksum does not match file contents")
    if status != "READY":
        raise ValueError("only verified READY artifacts can be registered for resume")
    timestamp = _now()
    artifact_id = str(uuid.uuid4())
    conn = _transaction(db_path)
    try:
        job = conn.execute("SELECT total_scenes FROM content_jobs WHERE job_id=?", (job_id,)).fetchone()
        if not job:
            raise KeyError(f"job not found: {job_id}")
        if int(scene_index) > int(job[0]):
            raise ValueError(f"scene_index {scene_index} exceeds total_scenes {job[0]}")
        conn.execute(
            """INSERT INTO scene_artifacts(artifact_id,job_id,scene_index,artifact_type,file_path,checksum,status,created_at)
               VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(job_id,scene_index,artifact_type) DO UPDATE SET
                   artifact_id=excluded.artifact_id,file_path=excluded.file_path,checksum=excluded.checksum,
                   status=excluded.status,created_at=excluded.created_at""",
            (artifact_id, job_id, int(scene_index), artifact_type, str(artifact_path), digest, status, timestamp),
        )
        row = conn.execute(
            "SELECT artifact_id,job_id,scene_index,artifact_type,file_path,checksum,status,created_at FROM scene_artifacts WHERE job_id=? AND scene_index=? AND artifact_type=?",
            (job_id, int(scene_index), artifact_type),
        ).fetchone()
        conn.commit()
        return dict(zip(("artifact_id", "job_id", "scene_index", "artifact_type", "file_path", "checksum", "status", "created_at"), row))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def list_scene_artifacts(job_id: str, db_path: str | Path | None = None) -> list[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """SELECT artifact_id,job_id,scene_index,artifact_type,file_path,checksum,status,created_at
               FROM scene_artifacts WHERE job_id=? ORDER BY scene_index,artifact_type""",
            (job_id,),
        ).fetchall()
        keys = ("artifact_id", "job_id", "scene_index", "artifact_type", "file_path", "checksum", "status", "created_at")
        return [dict(zip(keys, row)) for row in rows]
    finally:
        conn.close()


def _canonical_script_hash(script: str) -> str:
    text = re.sub(r"<[^>]*>", " ", str(script or ""))
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn").lower()
    text = re.sub(r"[\W_]+", " ", text, flags=re.UNICODE).strip()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def create_registry_entry(*, entry: Dict[str, Any], db_path: str | Path | None = None) -> None:
    if entry.get("similarity_decision") != "PASS" or entry.get("script_qa_status") != "PASS":
        raise ValueError("content registry accepts only similarity and script-QA PASS results")
    now = _now()
    content_id = entry.get("content_id") or str(uuid.uuid4())
    script = str(entry.get("full_script") or "")
    script_hash = entry.get("script_hash") or _canonical_script_hash(script)
    qa_details = json.dumps(entry.get("qa_details") or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    source_job_id = entry.get("source_job_id")
    conn = _transaction(db_path)
    try:
        if source_job_id:
            existing = conn.execute(
                "SELECT content_id,script_hash FROM content_registry WHERE source_job_id=?", (source_job_id,)
            ).fetchone()
            if existing:
                if existing[1] != script_hash:
                    raise ValueError(f"source_job_id {source_job_id} already registered with different script content")
                conn.commit()
                return existing[0]
        conn.execute(
            """INSERT OR IGNORE INTO content_registry(
                content_id,source_job_id,channel_id,topic_id,angle_title,hook_text,blueprint_id,engine_type,
                full_script,script_hash,embedding_vector,published_video_slug,similarity_policy_version,
                similarity_threshold,similarity_score,script_qa_score,qa_details_json,created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (content_id, source_job_id, entry["channel_id"], entry["topic_id"], entry["angle_title"], entry["hook_text"],
             entry["blueprint_id"], entry["engine_type"], script, script_hash, entry.get("embedding_vector"),
             entry.get("published_video_slug"), entry.get("similarity_policy_version"),
             entry.get("similarity_threshold"), entry.get("similarity_score"), entry.get("script_qa_score"),
             qa_details, now),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def search_registry(
    *, niche_id: str, limit: int = 2000, exclude_source_job_id: str | None = None,
    db_path: str | Path | None = None,
) -> list[Dict[str, Any]]:
    if not niche_id or not 1 <= int(limit) <= 10000:
        raise ValueError("niche_id and a limit between 1 and 10000 are required")
    conn = _connect(db_path)
    try:
        sql = """SELECT r.content_id,r.source_job_id,r.channel_id,r.topic_id,r.angle_title,r.hook_text,r.blueprint_id,
                        r.engine_type,r.full_script,r.script_hash,r.embedding_vector,r.similarity_policy_version,
                        r.similarity_threshold,r.similarity_score,r.script_qa_score,r.created_at
                 FROM content_registry r JOIN channels c ON c.channel_id=r.channel_id WHERE c.niche_id=?"""
        params = [niche_id]
        if exclude_source_job_id:
            sql += " AND (r.source_job_id IS NULL OR r.source_job_id!=?)"
            params.append(exclude_source_job_id)
        sql += " ORDER BY r.created_at DESC,r.content_id LIMIT ?"
        params.append(int(limit))
        rows = conn.execute(sql, params).fetchall()
        keys = ("content_id", "source_job_id", "channel_id", "topic_id", "angle_title", "hook_text", "blueprint_id",
                "engine_type", "full_script", "script_hash", "embedding_vector_base64", "similarity_policy_version",
                "similarity_threshold", "similarity_score", "script_qa_score", "created_at")
        import base64
        return [dict(zip(keys, (*row[:10], base64.b64encode(row[10]).decode("ascii") if row[10] is not None else None, *row[11:]))) for row in rows]
    finally:
        conn.close()


def record_analytics_snapshot(
    *, channel_id: str, content_id: str, provider: str, metrics: Dict[str, Any],
    available_metrics: Iterable[str] | None = None, captured_at: int | None = None,
    snapshot_id: str | None = None, db_path: str | Path | None = None,
) -> Dict[str, Any]:
    snapshot_id = snapshot_id or str(uuid.uuid4())
    timestamp = _now() if captured_at is None else int(captured_at)
    payload = {"metrics": metrics, "available_metrics": sorted(set(available_metrics or metrics.keys()))}
    conn = _transaction(db_path)
    try:
        conn.execute(
            "INSERT OR IGNORE INTO analytics_snapshots(snapshot_id,channel_id,content_id,provider,captured_at,metrics_json) VALUES(?,?,?,?,?,?)",
            (snapshot_id, channel_id, content_id, provider, timestamp,
             json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))),
        )
        row = conn.execute("SELECT snapshot_id,channel_id,content_id,provider,captured_at,metrics_json FROM analytics_snapshots WHERE snapshot_id=?", (snapshot_id,)).fetchone()
        conn.commit()
        return dict(zip(("snapshot_id", "channel_id", "content_id", "provider", "captured_at", "metrics_json"), row))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _dispatch(payload: Dict[str, Any]) -> Any:
    operation = payload.pop("op", "")
    db_path = payload.pop("db_path", None)
    if operation == "init":
        init_db(db_path)
        return {"initialized": True}
    if operation == "sync_channel_configs":
        import asyncio
        try:
            from bkt_web.matrix_config import sync_channel_configs
        except ImportError:
            from matrix_config import sync_channel_configs
        return asyncio.run(sync_channel_configs(db_path))
    if operation == "register_topic":
        return register_topic(**payload, db_path=db_path)
    if operation == "create_batch":
        return create_batch(**payload, db_path=db_path)
    if operation == "create_job":
        return create_job(**payload, db_path=db_path)
    if operation == "get_job":
        return get_job(db_path=db_path, **payload)
    if operation == "get_batch":
        return get_batch(db_path=db_path, **payload)
    if operation == "list_batch_jobs":
        return list_batch_jobs(db_path=db_path, **payload)
    if operation == "update_job_manifest":
        return update_job_manifest(db_path=db_path, **payload)
    if operation == "claim_next_job":
        return claim_next_job(db_path=db_path, **payload)
    if operation == "heartbeat_job":
        return {"renewed": heartbeat_job(db_path=db_path, **payload)}
    if operation == "release_job":
        return {"released": release_job(db_path=db_path, **payload)}
    if operation == "transition_job":
        return transition_job(db_path=db_path, **payload)
    if operation == "defer_job":
        return defer_job(db_path=db_path, **payload)
    if operation == "retry_job":
        return retry_job(db_path=db_path, **payload)
    if operation == "update_scene_mask":
        return {"mask": update_scene_mask(db_path=db_path, **payload)}
    if operation == "record_scene_artifact":
        return record_scene_artifact(db_path=db_path, **payload)
    if operation == "list_scene_artifacts":
        return list_scene_artifacts(db_path=db_path, **payload)
    if operation == "create_registry_entry":
        create_registry_entry(db_path=db_path, **payload)
        return {"created": True}
    if operation == "search_registry":
        return search_registry(db_path=db_path, **payload)
    if operation == "record_analytics_snapshot":
        return record_analytics_snapshot(db_path=db_path, **payload)
    raise ValueError(f"unknown matrix DB operation: {operation}")


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = _dispatch(payload)
        sys.stdout.write(json.dumps({"ok": True, "result": result}, ensure_ascii=False, default=str) + "\n")
    except Exception as exc:
        sys.stdout.write(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False) + "\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
