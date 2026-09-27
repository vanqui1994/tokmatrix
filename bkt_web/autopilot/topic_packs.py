"""Topic Pack theo variant (docs/MATRIX_VARIANT_SYSTEM_V2.md mục 7).

Kênh có `creative.variant_id` bốc một pack trong `topicPacks` của variant (trọng số, seed (channel_id, plan_date) —
tất định), chỉ trong các pack khai niche của kênh (`niches:` trong YAML). Topic lấy từ
`compare_studio/config/topics/packs/<pack>.txt` rồi `storage/autopilot_topics/packs/<pack>.txt` (Gemini viết thêm theo
`brief`). Pack hết topic → dùng topic của niche như cũ. Kênh không có variant → không đổi gì.

Niche của acc vẫn quyết định safety/hashtag; pack chỉ thu hẹp mảng chủ đề trong niche.
"""
from __future__ import annotations

import functools
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import store

PACKS_DIR = store.COMPARE_DIR / "config" / "topic_packs"
PACK_TOPICS_DIR = store.TOPICS_DIR / "packs"
FORMATS = ("free", "versus", "ranking")
REQUIRED = ("id", "engine", "brief", "format", "niches")


def load_packs(packs_dir: Path = PACKS_DIR) -> Dict[str, Dict[str, Any]]:
    import yaml

    packs: Dict[str, Dict[str, Any]] = {}
    for path in sorted(Path(packs_dir).glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        packs[data.get("id") or path.stem] = data
    return packs


def validate_packs(packs: Dict[str, Dict[str, Any]], variant_packs: Dict[str, Dict[str, float]], niche_ids: List[str]) -> List[str]:
    """Lỗi: pack thiếu trường, format lạ, niche lạ, id ≠ tên file, variant trỏ tới pack không tồn tại."""
    errors = []
    for pack_id, pack in packs.items():
        for key in REQUIRED:
            if not pack.get(key):
                errors.append(f"topic pack {pack_id}: missing {key}")
        if pack.get("format") not in FORMATS:
            errors.append(f"topic pack {pack_id}: format must be {'|'.join(FORMATS)}")
        for niche in pack.get("niches") or []:
            if niche not in niche_ids:
                errors.append(f"topic pack {pack_id}: unknown niche {niche}")
    for variant_id, weights in variant_packs.items():
        for pack_id in weights or {}:
            if pack_id not in packs:
                errors.append(f"{variant_id}: topic pack {pack_id} has no config/topic_packs/{pack_id}.yaml")
            elif packs[pack_id].get("engine") != variant_id.split("/")[0]:
                errors.append(f"{variant_id}: topic pack {pack_id} belongs to engine {packs[pack_id].get('engine')}")
    return errors


@functools.lru_cache(maxsize=1)
def _variant_packs_cached() -> Dict[str, Dict[str, float]]:
    out = subprocess.run(["node", "tools/list-variants.mjs"], cwd=str(store.COMPARE_DIR), capture_output=True,
                         text=True, timeout=120, check=True)
    data = json.loads(out.stdout.strip().splitlines()[-1])
    return {v["id"]: v.get("topic_packs") or {} for v in data["variants"]}


def variant_packs() -> Dict[str, Dict[str, float]]:
    return _variant_packs_cached()


def choose_pack(channel_id: str, plan_date: str, weights: Dict[str, float], packs: Dict[str, Dict[str, Any]],
                niche_id: str) -> Optional[str]:
    """Bốc pack theo trọng số, seed sha256(channel_id|plan_date); chỉ pack có niche của kênh."""
    eligible = sorted((pid, float(w)) for pid, w in (weights or {}).items()
                      if w and pid in packs and niche_id in (packs[pid].get("niches") or []))
    total = sum(w for _, w in eligible)
    if not eligible or total <= 0:
        return None
    digest = hashlib.sha256(f"{channel_id}|{plan_date}".encode("utf-8")).digest()
    point = int.from_bytes(digest[:8], "big") / 2 ** 64 * total
    for pid, weight in eligible:
        point -= weight
        if point < 0:
            return pid
    return eligible[-1][0]


def channel_pack(channel_id: str, cfg: Dict[str, Any], niche_id: str, plan_date: str,
                 packs: Optional[Dict[str, Dict[str, Any]]] = None) -> Optional[str]:
    variant_id = ((cfg or {}).get("creative") or {}).get("variant_id")
    if not variant_id:
        return None
    try:
        weights = variant_packs().get(variant_id) or {}
    except Exception as exc:  # registry không đọc được → dùng topic niche, không chặn plan
        store.log_event(f"⚠️ Không đọc được topic pack của {variant_id}: {exc}", "warn")
        return None
    return choose_pack(channel_id, plan_date, weights, load_packs() if packs is None else packs, niche_id)


def generated_file(pack_id: str) -> Path:
    return store.BKT_DIR / "storage" / "autopilot_topics" / "packs" / f"{pack_id}.txt"


def pack_topics(pack_id: str) -> List[str]:
    out: List[str] = []
    for path in (PACK_TOPICS_DIR / f"{pack_id}.txt", generated_file(pack_id)):
        if path.exists():
            out += [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.startswith("#")]
    return out
