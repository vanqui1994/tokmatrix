"""Đo độ giống đa tín hiệu giữa các video/preview Matrix (docs/MATRIX_VARIANT_SYSTEM_V2.md mục 10).

Composite chỉ so với **internal diversity threshold** (cấu hình) — đây là ngưỡng nội bộ để chặn khuôn hình trùng,
KHÔNG phải bảo đảm "an toàn với TikTok".

    python3 -m bkt_web.creative_similarity previews --manifest /tmp/vp/manifest.json --work /tmp/vp/sim
    python3 -m bkt_web.creative_similarity videos slug-a slug-b ...
"""
from __future__ import annotations

import json
import os
import sqlite3
import statistics
from itertools import combinations
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .signals import SIGNALS

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "storage" / "creative_similarity.db"
DEFAULT_THRESHOLD = 0.62

SCHEMA = """
CREATE TABLE IF NOT EXISTS features (
    slug TEXT NOT NULL,
    signal TEXT NOT NULL,
    version INTEGER NOT NULL,
    features TEXT NOT NULL,
    PRIMARY KEY (slug, signal, version)
);
"""


def diversity_threshold() -> float:
    """Ngưỡng nội bộ (env TOKMATRIX_DIVERSITY_THRESHOLD). Không bao giờ nới ngưỡng chỉ để qua gate."""
    try:
        return float(os.environ.get("TOKMATRIX_DIVERSITY_THRESHOLD", DEFAULT_THRESHOLD))
    except ValueError:
        return DEFAULT_THRESHOLD


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.executescript(SCHEMA)
    return conn


def extract_all(sample: Dict[str, Any], conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    """Features của mọi tín hiệu (cache theo (slug, signal, version) khi có conn)."""
    out: Dict[str, Any] = {}
    for name, signal in SIGNALS.items():
        cached = None
        if conn is not None:
            row = conn.execute("SELECT features FROM features WHERE slug=? AND signal=? AND version=?",
                               (sample["slug"], name, signal.version)).fetchone()
            cached = json.loads(row[0]) if row else None
        if cached is None:
            if signal.needs_frames and not sample.get("frames"):
                continue
            cached = signal.extract(sample)
            if conn is not None:
                conn.execute("INSERT OR REPLACE INTO features VALUES (?,?,?,?)", (sample["slug"], name, signal.version, json.dumps(cached)))
        out[name] = cached
    if conn is not None:
        conn.commit()
    return out


def compare(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, float]:
    """Điểm từng tín hiệu + composite (trung bình có trọng số trên các tín hiệu cả hai bên đều có)."""
    scores: Dict[str, float] = {}
    total = weight = 0.0
    for name, signal in SIGNALS.items():
        if name in a and name in b:
            value = round(float(signal.compare(a[name], b[name])), 4)
            scores[name] = value
            total += value * signal.weight
            weight += signal.weight
    scores["composite"] = round(total / weight, 4) if weight else 0.0
    return scores


def cohorts(a: Dict[str, Any], b: Dict[str, Any]) -> List[str]:
    """Nhóm của một cặp (theo nhãn engine / variant / country / composition / signature)."""
    groups = ["same_engine" if a["engine"] == b["engine"] else "cross_engine"]
    groups.append("same_country" if a["country"] == b["country"] else "cross_country")
    if a["variant"] == b["variant"]:
        groups.append("same_structure" if a["composition"] == b["composition"] else "same_variant_other_composition")
        if a["composition"] == b["composition"] and a.get("signature") != b.get("signature"):
            groups.append("same_structure_diff_dna")
    return groups


def stats(values: Iterable[float]) -> Dict[str, float]:
    data = sorted(values)
    if not data:
        return {"n": 0}

    def pct(p: float) -> float:
        k = (len(data) - 1) * p
        lo, hi = int(k), min(int(k) + 1, len(data) - 1)
        return round(data[lo] + (data[hi] - data[lo]) * (k - lo), 4)

    return {"n": len(data), "mean": round(statistics.fmean(data), 4), "median": round(statistics.median(data), 4),
            "p90": pct(0.9), "p95": pct(0.95), "max": round(data[-1], 4)}


def gate_pair(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """Cặp phải dưới ngưỡng: hai danh tính cấu trúc KHÁC nhau trong CÙNG một nước (hai acc cùng nước)."""
    return a["country"] == b["country"] and (a["variant"], a["composition"]) != (b["variant"], b["composition"])


def report(samples: List[Dict[str, Any]], features: Dict[str, Dict[str, Any]], threshold: Optional[float] = None) -> Dict[str, Any]:
    threshold = diversity_threshold() if threshold is None else threshold
    rows = []
    for a, b in combinations(samples, 2):
        scores = compare(features[a["slug"]], features[b["slug"]])
        rows.append({"a": a["slug"], "b": b["slug"], "cohorts": cohorts(a["labels"], b["labels"]), "gate": gate_pair(a["labels"], b["labels"]), **scores})
    by_cohort: Dict[str, List[float]] = {}
    for row in rows:
        for group in row["cohorts"]:
            by_cohort.setdefault(group, []).append(row["composite"])
    nearest: Dict[str, Tuple[str, float]] = {}
    for row in rows:
        if not row["gate"]:
            continue
        for x, y in ((row["a"], row["b"]), (row["b"], row["a"])):
            if x not in nearest or row["composite"] > nearest[x][1]:
                nearest[x] = (y, row["composite"])
    over = sorted((row for row in rows if row["gate"] and row["composite"] >= threshold), key=lambda r: -r["composite"])
    signal_stats = {name: stats(row[name] for row in rows if row["gate"] and name in row) for name in list(SIGNALS) + ["composite"]}
    return {
        "threshold": threshold,
        "note": "internal diversity threshold — not a TikTok safety guarantee",
        "pairs": len(rows),
        "cohorts": {group: stats(values) for group, values in sorted(by_cohort.items())},
        "gate_signals": signal_stats,
        "nearest_neighbor": {slug: {"slug": other, "composite": score} for slug, (other, score) in sorted(nearest.items())},
        "over_threshold": over,
        "passed": not over,
        "rows": rows,
    }
