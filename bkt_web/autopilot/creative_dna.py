"""Gán Creative DNA cho account (docs/MATRIX_VARIANT_SYSTEM_V2.md mục 11) — Phase 0: chỉ DRY-RUN.

Tất định: không đọc đồng hồ, không random; mọi tie-break là sha256 của (channel_id | …). Không ghi file nào
trừ khi truyền ``--out`` (file plan JSON, nên đặt ngoài repo). ``--apply`` thuộc Phase 6 (transaction theo lô,
khoá migration, Autopilot paused) và bị từ chối ở đây.

    python3 -m bkt_web.autopilot.creative_dna --dry-run [--include-reference] [--mapping map.json | --from-db]
                                              [--channels a,b] [--out /tmp/plan.json] [--json]

Registry, luật trục và danh sách giọng đọc từ Node (``tools/list-variants.mjs``) — một nguồn sự thật.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
COMPARE_DIR = ROOT / "compare_studio"
CONFIG_DIR = COMPARE_DIR / "config"
AUTOPILOT_DB = ROOT / "bkt_web" / "storage" / "autopilot.db"

# Ngôn ngữ → nước mặc định khi không có mapping acc (202 acc hiện tại: DE, GB, JP, KR).
LANGUAGE_COUNTRY = {"de": "DE", "en": "GB", "ja": "JP", "ko": "KR", "vi": "VN", "fr": "FR"}
DNA_CHOICE_AXES = ("typography", "treatment", "image_motion", "transition", "tone")

PLAN_COLUMNS = ("ACCOUNT", "COUNTRY", "OLD ENGINE", "OLD NICHE", "NEW ENGINE", "VARIANT", "COMPOSITION",
                "MOTION", "TYPOGRAPHY", "VOICE", "DNA SIGNATURE", "COLLISION STATUS")


def _hash(*parts: Any) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()


def dna_signature(dna: Dict[str, Any], variant_id: str, country: str, dna_fields: Iterable[str]) -> str:
    """Giống hệt dnaSignature() trong variants/dna.mjs (JSON.stringify, thứ tự khoá cố định)."""
    canonical = {key: dna.get(key) for key in dna_fields}
    canonical["variant_id"] = variant_id
    canonical["country"] = str(country or "").upper()
    return hashlib.sha256(json.dumps(canonical, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def _node_json(args: List[str], compare_dir: Path) -> Dict[str, Any]:
    result = subprocess.run(["node", "tools/list-variants.mjs", *args], cwd=str(compare_dir),
                            capture_output=True, text=True, timeout=120, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"list-variants failed: {(result.stderr or result.stdout)[-400:]}")
    return json.loads(result.stdout.strip().splitlines()[-1])


def load_registry(include_reference: bool = False, compare_dir: Path = COMPARE_DIR) -> Dict[str, Any]:
    registry = _node_json(["--include-reference"] if include_reference else [], compare_dir)
    if registry["registry"]["errors"]:
        raise RuntimeError("variant registry invalid: " + "; ".join(registry["registry"]["errors"][:5]))
    registry["voices"] = _node_json(["--voices"], compare_dir)["voices"]
    return registry


def load_channels(config_dir: Path = CONFIG_DIR) -> Dict[str, Dict[str, Any]]:
    channels = {}
    for path in sorted((config_dir / "channels").glob("*.yaml")):
        cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        channels[cfg.get("channel_id", path.stem)] = cfg
    return channels


def load_niche_engines(config_dir: Path = CONFIG_DIR) -> Dict[str, List[str]]:
    result = {}
    for path in sorted((config_dir / "niches").glob("*.yaml")):
        cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if cfg.get("niche_id"):
            result[cfg["niche_id"]] = list(cfg.get("allowed_engines") or [])
    return result


def load_mapping_db(db_path: Path = AUTOPILOT_DB) -> Dict[str, Dict[str, Any]]:
    """autopilot_channel_map đọc CHỈ-ĐỌC (mode=ro): Matrix channel → {country, niche_id}."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=10)
    try:
        rows = conn.execute("SELECT matrix_channel_id, niche_id, country FROM autopilot_channel_map").fetchall()
    finally:
        conn.close()
    return {r[0]: {"niche_id": r[1], "country": (r[2] or "").upper()} for r in rows}


def effective_axes(variant: Dict[str, Any], composition: str, dna: Dict[str, Any], overrides: Dict[str, str]) -> Dict[str, Any]:
    axes = dict(variant["compositions"][composition]["axes"])
    for dna_key, axis in overrides.items():
        if dna.get(dna_key) is not None:
            axes[axis] = dna[dna_key]
    return axes


def axis_distance(a: Dict[str, Any], b: Dict[str, Any], axes: Iterable[str]) -> int:
    return sum(1 for axis in axes if a.get(axis) != b.get(axis))


def _existing(cfg: Dict[str, Any], variants: Dict[str, Dict[str, Any]], dna_fields: List[str]) -> Optional[Tuple[Dict, Dict]]:
    creative = cfg.get("creative") or {}
    variant = variants.get(creative.get("variant_id") or "")
    dna = creative.get("dna")
    if not variant or not isinstance(dna, dict) or dna.get("composition") not in variant["compositions"]:
        return None
    if dna.get("variant_version") != variant["version"]:
        return None
    for axis in DNA_CHOICE_AXES:
        if dna.get(axis) not in variant["allowed"][axis]:
            return None
    return variant, {key: dna.get(key) for key in dna_fields}


def plan_assignments(channels: Dict[str, Dict[str, Any]], registry: Dict[str, Any], niche_engines: Dict[str, List[str]],
                     mapping: Optional[Dict[str, Dict[str, Any]]] = None, only: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Plan gán DNA (không ghi gì). ``mapping`` None → mọi kênh YAML, nước suy từ publishing.language."""
    variants = {v["id"]: v for v in registry["variants"]}
    axes = registry["axes"]
    overrides = registry["dna_axis_overrides"]
    dna_fields = registry["dna_fields"]
    wanted = set(only or [])

    accounts = []
    for cid, cfg in channels.items():
        if wanted and cid not in wanted:
            continue
        if mapping is not None and cid not in mapping:
            continue
        lang = str((cfg.get("publishing") or {}).get("language") or "")
        country = str((mapping or {}).get(cid, {}).get("country") or LANGUAGE_COUNTRY.get(lang, lang)).upper()
        niche = (mapping or {}).get(cid, {}).get("niche_id") or cfg.get("niche_id")
        accounts.append({"channel_id": cid, "cfg": cfg, "lang": lang, "country": country, "niche": niche})
    accounts.sort(key=lambda a: (a["country"], a["niche"], a["channel_id"]))

    assigned: List[Dict[str, Any]] = []  # {channel_id, country, lang, engine, variant, composition, dna, axes, voice}

    def add(account, variant, dna, voice, status):
        row = {
            "channel_id": account["channel_id"], "country": account["country"], "lang": account["lang"],
            "old_engine": ",".join((account["cfg"].get("creative") or {}).get("preferred_engines") or []),
            "old_niche": account["cfg"].get("niche_id"), "niche": account["niche"],
            "engine": variant["engine"] if variant else None, "variant_id": variant["id"] if variant else None,
            "composition": dna.get("composition") if dna else None, "dna": dna,
            "axes": effective_axes(variant, dna["composition"], dna, overrides) if variant else None,
            "voice": voice, "structural_key": f"{variant['id']}#{dna['composition']}" if variant else None,
            "signature": dna_signature(dna, variant["id"], account["lang"], dna_fields) if variant else None,
            "collision": status,
        }
        assigned.append(row)
        return row

    # 1) Giữ DNA đã có (ổn định theo acc), trước khi gán mới.
    pending = []
    for account in accounts:
        kept = _existing(account["cfg"], variants, dna_fields)
        if kept:
            add(account, kept[0], kept[1], (account["cfg"].get("audio") or {}).get("voice_id"), "keep")
        else:
            pending.append(account)

    voices_by_lang: Dict[str, List[Dict[str, Any]]] = {}
    for voice in registry["voices"]:
        voices_by_lang.setdefault(voice["lang"], []).append(voice)

    for account in pending:
        cid, country, lang = account["channel_id"], account["country"], account["lang"]
        same_country = [r for r in assigned if r["country"] == country and r["variant_id"]]
        used_keys = {r["structural_key"] for r in same_country}
        engine_use: Dict[str, int] = {}
        for r in same_country:
            engine_use[r["engine"]] = engine_use.get(r["engine"], 0) + 1
        old_engines = set((account["cfg"].get("creative") or {}).get("preferred_engines") or [])
        allowed_engines = set(niche_engines.get(account["niche"], []))

        best = None
        for variant in sorted(variants.values(), key=lambda v: v["id"]):
            if variant["engine"] not in allowed_engines or lang not in variant["countries"]:
                continue
            if variant["niches"] is not None and account["niche"] not in variant["niches"]:
                continue
            for comp in sorted(variant["compositions"]):
                if f"{variant['id']}#{comp}" in used_keys:
                    continue  # luật cứng: structural key duy nhất trong nước
                base = variant["compositions"][comp]["axes"]
                min_dist = min((axis_distance(base, r["axes"], axes) for r in same_country), default=len(axes))
                score = (min_dist, -engine_use.get(variant["engine"], 0), 1 if variant["engine"] in old_engines else 0)
                key = (score, _hash(cid, variant["id"], comp))
                if best is None or key > best[0]:
                    best = (key, variant, comp)
        if best is None:
            add(account, None, None, None, "hard:capacity")
            continue
        _, variant, comp = best

        # 2) Chọn DNA từng trục: ít bị dùng nhất trong cùng variant (mọi nước), tie-break hash — không tổ hợp bùng nổ.
        dna: Dict[str, Any] = {"dna_version": registry["dna_version"], "variant_version": variant["version"], "composition": comp}
        same_variant = [r for r in assigned if r["variant_id"] == variant["id"]]
        for axis in DNA_CHOICE_AXES:
            options = variant["allowed"][axis]
            dna[axis] = min(options, key=lambda value: (
                sum(1 for r in same_variant if r["dna"][axis] == value), _hash(cid, variant["id"], axis, value)))
        dna = {key: dna[key] for key in dna_fields}

        # 3) Voice DNA: không trùng nearest neighbor, ít dùng nhất trong (nước, engine), đúng giới tính của variant.
        axes_new = effective_axes(variant, comp, dna, overrides)
        nearest = max(same_country, key=lambda r: (len(axes) - axis_distance(axes_new, r["axes"], axes), r["channel_id"]), default=None)
        gender = (variant.get("audio") or {}).get("gender", "any")
        pool = [v for v in voices_by_lang.get(lang, []) if gender == "any" or v["gender"] == gender] or voices_by_lang.get(lang, [])
        voice_use = {}
        for r in same_country:
            if r["engine"] == variant["engine"] and r["voice"]:
                voice_use[r["voice"]] = voice_use.get(r["voice"], 0) + 1
        voice = None
        if pool:
            voice = min(pool, key=lambda v: (1 if nearest and v["id"] == nearest["voice"] else 0,
                                             voice_use.get(v["id"], 0), _hash(cid, v["id"])))["id"]

        status = "ok"
        if voice is None:
            status = "hard:no_voice"
        elif nearest and voice == nearest["voice"]:
            status = "soft:voice"
        elif any(r["structural_key"] == f"{variant['id']}#{comp}" for r in assigned if r["country"] != country):
            status = "soft:cross_country"
        add(account, variant, dna, voice, status)

    signatures = [r["signature"] for r in assigned if r["signature"]]
    for r in assigned:  # hai acc cùng signature = cùng cấu hình thị giác — lỗi cứng
        if r["signature"] and signatures.count(r["signature"]) > 1 and not r["collision"].startswith("hard"):
            r["collision"] = "hard:duplicate_signature"
    rows = sorted(assigned, key=lambda r: (r["country"], r["niche"] or "", r["channel_id"]))
    body = json.dumps(rows, sort_keys=True, ensure_ascii=False, default=str)
    return {
        "mode": "dry-run",
        "rows": rows,
        "summary": {
            "accounts": len(rows),
            "by_status": {s: sum(1 for r in rows if r["collision"] == s) for s in sorted({r["collision"] for r in rows})},
            "applicable": not any(r["collision"].startswith("hard") for r in rows),
        },
        "plan_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    }


def format_table(plan: Dict[str, Any]) -> str:
    lines = [" | ".join(PLAN_COLUMNS)]
    for r in plan["rows"]:
        dna = r["dna"] or {}
        lines.append(" | ".join(str(x) for x in (
            r["channel_id"], r["country"], r["old_engine"] or "-", r["old_niche"] or "-", r["engine"] or "-",
            r["variant_id"] or "-", r["composition"] or "-", dna.get("image_motion", "-"), dna.get("typography", "-"),
            r["voice"] or "-", (r["signature"] or "-")[:12], r["collision"])))
    lines.append(f"plan_sha256={plan['plan_sha256']} summary={json.dumps(plan['summary'], ensure_ascii=False)}")
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Creative DNA assignment (Phase 0: dry-run only)")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", action="store_true", help="Phase 6 — not available yet")
    parser.add_argument("--include-reference", action="store_true", help="also assign Phase 0 reference variants (preview only)")
    parser.add_argument("--mapping", help="JSON {matrix_channel_id: {country, niche_id}}; only these accounts")
    parser.add_argument("--from-db", action="store_true", help="read autopilot_channel_map read-only")
    parser.add_argument("--channels", help="comma-separated channel ids")
    parser.add_argument("--out", help="write the plan JSON here (keep it outside the repo)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    if args.apply:
        print("--apply is Phase 6 (batch transaction + migration lock + Autopilot paused); refusing.", file=sys.stderr)
        return 2
    mapping = None
    if args.mapping:
        mapping = {k: {"country": str(v.get("country", "")).upper(), "niche_id": v.get("niche_id")}
                   for k, v in json.loads(Path(args.mapping).read_text(encoding="utf-8")).items()}
    elif args.from_db:
        mapping = load_mapping_db()
    only = [c.strip() for c in args.channels.split(",") if c.strip()] if args.channels else None
    plan = plan_assignments(load_channels(), load_registry(args.include_reference), load_niche_engines(), mapping, only)
    if args.out:
        Path(args.out).write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False) if args.json else format_table(plan))
    return 0


if __name__ == "__main__":
    sys.exit(main())
