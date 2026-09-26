"""Analytics and conservative, versioned learning for Matrix content.

This module deliberately learns from immutable snapshots.  It never edits a
job's manifest or Channel DNA snapshot, so jobs already in flight stay fully
reproducible.  A future planner may explicitly opt into a strategy version.
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from abc import ABC, abstractmethod
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

from bkt_web import matrix_db

METRIC_KEYS = {"completion_rate", "retention_3s", "likes", "shares", "views", "watch_time_seconds"}
MIN_SAMPLES = 3
MAX_WEIGHT_DELTA = 0.15


class AnalyticsProvider(ABC):
    """Adapter boundary for a TikTok/API provider with partial metrics."""

    @abstractmethod
    def fetch_video_metrics(self, channel_id: str, video_id: str) -> Dict[str, Any]:
        """Return only metrics the provider actually exposes; never fabricate nulls."""


def _json(value: str) -> Dict[str, Any]:
    try:
        return json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}


def _content_features(content_id: str, db_path: str | Path | None = None) -> Dict[str, str]:
    conn = matrix_db._connect(db_path)
    try:
        row = conn.execute(
            """SELECT r.channel_id,r.topic_id,r.blueprint_id,r.engine_type,t.niche_id,j.manifest_json
               FROM content_registry r JOIN topics t ON t.topic_id=r.topic_id
               LEFT JOIN content_jobs j ON j.job_id=r.source_job_id WHERE r.content_id=?""", (content_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"unknown content_id: {content_id}")
        manifest = _json(row[5])
        angle = manifest.get("angle") if isinstance(manifest.get("angle"), dict) else {}
        return {"channel_id": row[0], "topic_id": row[1], "blueprint_id": row[2], "engine_type": row[3],
                "niche_id": row[4], "hook_style": str(angle.get("hook_type") or "unknown")}
    finally:
        conn.close()


def ingest_metrics(*, content_id: str, provider: str, metrics: Dict[str, Any], available_metrics: Optional[Iterable[str]] = None,
                   captured_at: Optional[int] = None, snapshot_id: Optional[str] = None, db_path: str | Path | None = None) -> Dict[str, Any]:
    """Persist an idempotent observed metrics snapshot plus immutable features."""
    if not provider or not isinstance(metrics, dict):
        raise ValueError("provider and metrics object are required")
    available = set(available_metrics or metrics.keys())
    unknown = available - METRIC_KEYS
    if unknown:
        raise ValueError(f"unsupported metrics: {', '.join(sorted(unknown))}")
    observed = {}
    for key in available:
        if key not in metrics:
            raise ValueError(f"available metric {key} is missing from metrics")
        value = metrics[key]
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
            raise ValueError(f"metric {key} must be a non-negative number")
        if key in {"completion_rate", "retention_3s"} and value > 1:
            raise ValueError(f"metric {key} must be between 0 and 1")
        observed[key] = value
    matrix_db.init_db(db_path)
    features = _content_features(content_id, db_path)
    payload = {"metrics": observed, "available_metrics": sorted(available), "features": features, "schema": "matrix.analytics/v1"}
    # matrix_db's public writer has the same envelope shape; write direct to
    # preserve immutable feature attribution needed for deterministic replay.
    snapshot_id = snapshot_id or str(uuid.uuid4())
    when = int(captured_at or time.time())
    conn = matrix_db._transaction(db_path)
    try:
        conn.execute("INSERT OR IGNORE INTO analytics_snapshots(snapshot_id,channel_id,content_id,provider,captured_at,metrics_json) VALUES(?,?,?,?,?,?)",
                     (snapshot_id, features["channel_id"], content_id, provider, when, json.dumps(payload, ensure_ascii=False, sort_keys=True)))
        row = conn.execute("SELECT snapshot_id,channel_id,content_id,provider,captured_at,metrics_json FROM analytics_snapshots WHERE snapshot_id=?", (snapshot_id,)).fetchone()
        conn.commit()
        return dict(zip(("snapshot_id", "channel_id", "content_id", "provider", "captured_at", "metrics_json"), row))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def replay_strategy(*, niche_id: str, cutoff: Optional[int] = None, db_path: str | Path | None = None) -> Dict[str, Any]:
    """Calculate strategy from snapshots only; deterministic at a given cutoff."""
    matrix_db.init_db(db_path)
    cutoff = int(cutoff or time.time())
    conn = matrix_db._connect(db_path)
    try:
        rows = conn.execute("SELECT metrics_json FROM analytics_snapshots WHERE captured_at<=? ORDER BY captured_at,snapshot_id", (cutoff,)).fetchall()
    finally:
        conn.close()
    groups: Dict[tuple[str, str], list[float]] = defaultdict(list)
    included = 0
    for (raw,) in rows:
        envelope = _json(raw); features = envelope.get("features") or {}; metrics = envelope.get("metrics") or {}
        if features.get("niche_id") != niche_id or "completion_rate" not in metrics:
            continue
        completion = metrics["completion_rate"]
        if isinstance(completion, (int, float)) and not isinstance(completion, bool):
            groups[("hook_style", str(features.get("hook_style") or "unknown"))].append(float(completion))
            groups[("blueprint", str(features.get("blueprint_id") or "unknown"))].append(float(completion))
            included += 1
    weights: Dict[str, Dict[str, Dict[str, Any]]] = {"hook_styles": {}, "blueprints": {}}
    for (kind, name), values in sorted(groups.items()):
        avg = sum(values) / len(values); delta = 0.0
        if len(values) >= MIN_SAMPLES:
            delta = MAX_WEIGHT_DELTA if avg > .55 else (-.10 if avg < .30 else 0.0)
        item = {"weight": round(max(.5, min(1.5, 1 + delta)), 4), "sample_size": len(values), "completion_rate": round(avg, 4), "delta": delta}
        weights["hook_styles" if kind == "hook_style" else "blueprints"][name] = item
    return {"schema": "matrix.strategy/v1", "niche_id": niche_id, "source_snapshot_cutoff": cutoff,
            "included_snapshots": included, "min_samples": MIN_SAMPLES, "weights": weights}


def create_strategy_version(*, niche_id: str, cutoff: Optional[int] = None, db_path: str | Path | None = None) -> Dict[str, Any]:
    strategy = replay_strategy(niche_id=niche_id, cutoff=cutoff, db_path=db_path)
    canonical = json.dumps(strategy, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    version_id = "strategy-" + hashlib.sha256(canonical.encode()).hexdigest()[:20]
    conn = matrix_db._transaction(db_path)
    try:
        conn.execute("INSERT OR IGNORE INTO strategy_versions(strategy_version_id,scope_type,scope_id,source_snapshot_cutoff,strategy_json,created_at) VALUES(?,?,?,?,?,?)",
                     (version_id, "niche", niche_id, strategy["source_snapshot_cutoff"], canonical, int(time.time())))
        conn.commit()
        return {"strategy_version_id": version_id, **strategy}
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()
