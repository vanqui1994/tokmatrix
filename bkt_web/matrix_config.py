"""Resolve versioned Channel DNA presets into the active Matrix channel table."""
from __future__ import annotations

import json
import sqlite3
import time
import yaml
from pathlib import Path
from typing import Any, Dict, Iterable, List

try:
    from bkt_web.db_utils import configure_database, connect_db
    from bkt_web import compare_native as cn
except ImportError:
    from db_utils import configure_database, connect_db
    import compare_native as cn

DB_PATH = Path(__file__).resolve().parent / "storage" / "matrix_factory.db"

CHANNEL_TABLE_SQL = """
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
)
"""


def _ensure_channel_table(conn: sqlite3.Connection) -> None:
    conn.execute(CHANNEL_TABLE_SQL)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(channels)").fetchall()}
    migrations = {
        "config_version": "INTEGER DEFAULT 1",
        "resolved_config_json": "TEXT",
        "updated_at": "INTEGER",
    }
    for name, definition in migrations.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE channels ADD COLUMN {name} {definition}")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_channels_niche ON channels(niche_id)")


def _apply_channel_configs(
    conn: sqlite3.Connection, channels: Iterable[Dict[str, Any]], *, now: int | None = None
) -> int:
    timestamp = int(time.time()) if now is None else int(now)
    items = list(channels)
    if not items or len(items) > 500:
        raise ValueError(f"Expected between 1 and 500 resolved channels, received {len(items)}")
    if len({item.get("channel_id") for item in items}) != len(items):
        raise ValueError("Resolved Channel DNA contains duplicate channel_id values")

    for item in items:
        version = item.get("config_version")
        config_hash = item.get("config_hash")
        if not isinstance(version, int) or version < 1 or not isinstance(config_hash, str) or len(config_hash) != 64:
            raise ValueError(f"Invalid config version/hash for channel {item.get('channel_id')}")
        resolved = dict(item["resolved_config"])
        resolved["config_hash"] = config_hash
        resolved_json = json.dumps(resolved, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        previous = conn.execute(
            "SELECT config_version, resolved_config_json FROM channels WHERE channel_id=?",
            (item["channel_id"],),
        ).fetchone()
        if previous:
            previous_version = int(previous[0] or 1)
            previous_config = json.loads(previous[1] or "{}")
            previous_hash = previous_config.get("config_hash")
            if version < previous_version:
                raise ValueError(f"Refusing stale config_version {version} for {item['channel_id']} (active {previous_version})")
            if version == previous_version and previous_hash and config_hash != previous_hash:
                raise ValueError(f"Config changed for {item['channel_id']} without increasing config_version")

        conn.execute(
            """INSERT INTO channels (
                   channel_id, niche_id, channel_name, persona_tone, preferred_voice_id,
                   visual_style_id, cut_rate_seconds, config_version, resolved_config_json,
                   updated_at, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(channel_id) DO UPDATE SET
                   niche_id=excluded.niche_id,
                   channel_name=excluded.channel_name,
                   persona_tone=excluded.persona_tone,
                   preferred_voice_id=excluded.preferred_voice_id,
                   visual_style_id=excluded.visual_style_id,
                   cut_rate_seconds=excluded.cut_rate_seconds,
                   config_version=excluded.config_version,
                   resolved_config_json=excluded.resolved_config_json,
                   updated_at=excluded.updated_at""",
            (
                item["channel_id"], item["niche_id"], item["channel_name"], item["persona_tone"],
                item["preferred_voice_id"], item["visual_style_id"], item["cut_rate_seconds"],
                version, resolved_json, timestamp, timestamp,
            ),
        )
    return len(items)


async def sync_channel_configs(db_path: str | Path | None = None) -> Dict[str, Any]:
    """Validate and resolve YAML through the existing Node bridge, then atomically upsert it."""
    matrix_path = Path(__file__).resolve().parent.parent / "compare_studio" / "config" / "compatibility_matrix.yaml"
    niche_ids = [str(item["id"]) for item in (yaml.safe_load(matrix_path.read_text(encoding="utf-8")) or {}).get("niches", [])]
    channels = []
    for niche_id in niche_ids:
        # Resolve in per-niche chunks: a full 180-channel snapshot exceeds the
        # single-line JSON bridge's OS pipe buffer.
        channels.extend(await cn.bridge("matrix.config.resolve", {"niche_id": niche_id}, timeout=45))
    if not isinstance(channels, list):
        raise ValueError("Matrix config resolver returned a non-list payload")

    target = Path(db_path) if db_path is not None else DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = connect_db(target)
    try:
        configure_database(conn)
        _ensure_channel_table(conn)
        conn.execute("BEGIN IMMEDIATE")
        synced = _apply_channel_configs(conn, channels)
        conn.commit()
        return {"synced": synced, "channel_ids": sorted(item["channel_id"] for item in channels)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
