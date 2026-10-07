"""Thể loại / việc của từng tài khoản TikTok (badge ở trang Kênh): Matrix (engine + skin), remake YouTube, Kuaishou → Muse,
Kuaishou → vector, hoặc chưa giao việc. Chỉ đọc: bản đồ Autopilot, YAML kênh Matrix, watch.json và DB nguồn Kuaishou."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List

import yaml

ROOT = Path(__file__).resolve().parent.parent
STORAGE = ROOT / "bkt_web" / "storage"
CHANNEL_DIR = ROOT / "compare_studio" / "config" / "channels"
WATCH_FILE = ROOT / "compare_studio" / ".runtime" / "story-remake" / "watch.json"


def _matrix() -> Dict[int, Dict[str, Any]]:
    path = STORAGE / "autopilot.db"
    if not path.exists():
        return {}
    with sqlite3.connect(str(path), timeout=30) as c:
        rows = c.execute("SELECT tiktok_channel_id, matrix_channel_id, niche_id FROM autopilot_channel_map").fetchall()
    out = {}
    for tid, mid, niche in rows:
        role: Dict[str, Any] = {"kind": "matrix", "matrix_channel": mid, "niche": niche}
        try:
            creative = (yaml.safe_load((CHANNEL_DIR / f"{mid}.yaml").read_text(encoding="utf-8")) or {}).get("creative") or {}
        except OSError:
            creative = {}
        engine = (creative.get("preferred_engines") or [""])[0]
        skin = creative.get("skins", {}).get(engine) if creative.get("skins") else None
        if not skin and creative.get("variant_id"):
            skin = {"variant_id": creative["variant_id"], "dna": creative.get("dna") or {}}
        role.update(engine=engine, variant=(skin or {}).get("variant_id", ""), layout=((skin or {}).get("dna") or {}).get("composition", ""))
        out[int(tid)] = role
    return out


def _youtube() -> Dict[int, Dict[str, Any]]:
    try:
        data = json.loads(WATCH_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    items = data if isinstance(data, list) else data.get("channels", [])
    out = {}
    for item in items:
        if item.get("account_id"):
            out[int(item["account_id"])] = {"kind": "youtube", "enabled": item.get("enabled", True) is not False,
                                            "translate": item.get("translate_to") or "", "source": item.get("url") or item.get("shorts_url") or ""}
    return out


def _kuaishou(db: str, kind: str) -> Dict[int, Dict[str, Any]]:
    path = STORAGE / db
    if not path.exists():
        return {}
    try:
        with sqlite3.connect(str(path), timeout=30) as c:
            c.row_factory = sqlite3.Row
            rows = [dict(r) for r in c.execute("SELECT * FROM sources")]
    except sqlite3.Error:
        return {}
    return {int(r["channel_id"]): {"kind": kind, "enabled": bool(r.get("enabled", 1)), "source": r.get("profile_url") or ""}
            for r in rows if r.get("channel_id")}


def roles() -> Dict[int, List[Dict[str, Any]]]:
    """channel id → danh sách việc (một acc có thể vừa Matrix vừa remake)."""
    out: Dict[int, List[Dict[str, Any]]] = {}
    for part in (_matrix(), _youtube(), _kuaishou("muse_remake.db", "kuaishou_muse"), _kuaishou("kuaishou_vector.db", "kuaishou_vector")):
        for cid, role in part.items():
            out.setdefault(cid, []).append(role)
    return out
