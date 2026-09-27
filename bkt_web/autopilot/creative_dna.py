"""Gán Creative DNA cho account (docs/MATRIX_VARIANT_SYSTEM_V2.md mục 11–12).

Dry-run (mặc định) tất định: không đọc đồng hồ, không random; mọi tie-break là sha256 của (channel_id | …). Không
ghi file nào trừ khi truyền ``--out`` (file plan JSON). Structural identity được ghép cặp tối đa theo từng nước.

``--apply`` (Phase 6) nhận ĐÚNG file plan đã duyệt (``--plan`` + ``--plan-sha``), không tính lại; transaction theo lô:
Autopilot paused/tắt, không có batch-matrix chạy, khoá ``channels/.migration.lock``, áp lên bản sao → validator toàn bộ
→ backup → ``os.replace`` từng file (lỗi → khôi phục), ghi inverse plan để rollback (``--rollback <inverse.json>``).

    python3 -m bkt_web.autopilot.creative_dna --dry-run [--include-reference] [--mapping map.json | --from-db]
                                              [--channels a,b] [--out /tmp/plan.json] [--json]
    python3 -m bkt_web.autopilot.creative_dna --apply --plan plan.json --plan-sha <sha> [--config-dir DIR] [--backup-dir DIR]
    python3 -m bkt_web.autopilot.creative_dna --rollback /opt/tokmatrix-backups/creative-dna-<ts>/inverse.json

Registry, luật trục và danh sách giọng đọc từ Node (``tools/list-variants.mjs``) — một nguồn sự thật.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import contextlib
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
COMPARE_DIR = ROOT / "compare_studio"
CONFIG_DIR = COMPARE_DIR / "config"
AUTOPILOT_DB = ROOT / "bkt_web" / "storage" / "autopilot.db"

# Ngôn ngữ → nước mặc định khi không có mapping acc (202 acc hiện tại: DE, GB, JP, KR).
LANGUAGE_COUNTRY = {"de": "DE", "en": "GB", "ja": "JP", "ko": "KR", "vi": "VN", "fr": "FR"}
DNA_CHOICE_AXES = ("typography", "treatment", "image_motion", "transition", "tone", "caption")

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


COMPARE_TOPIC_MIN = 0.5  # = COMPARE_TOPIC_MIN trong matrix/planner/template-selector.mjs


def load_niche_engines(config_dir: Path = CONFIG_DIR) -> Dict[str, List[str]]:
    """niche → engine gán được. compare không nằm trong allowed_engines (cố ý) nhưng kênh variant compare hợp lệ khi
    điểm compare của niche ≥ COMPARE_TOPIC_MIN (validator cùng luật), vì topic pack versus luôn cho đề tài "A vs B"."""
    result = {}
    for path in sorted((config_dir / "niches").glob("*.yaml")):
        cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if cfg.get("niche_id"):
            result[cfg["niche_id"]] = list(cfg.get("allowed_engines") or [])
    matrix_file = config_dir / "compatibility_matrix.yaml"
    if matrix_file.exists():
        matrix = yaml.safe_load(matrix_file.read_text(encoding="utf-8")) or {}
        for niche in matrix.get("niches", []):
            if niche.get("id") in result and float((niche.get("scores") or {}).get("compare", 0)) >= COMPARE_TOPIC_MIN:
                result[niche["id"]].append("compare")
    return result


def load_mapping_db(db_path: Path = AUTOPILOT_DB) -> Dict[str, Dict[str, Any]]:
    """autopilot_channel_map đọc CHỈ-ĐỌC (mode=ro): Matrix channel → {country, niche_id}."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=10)
    try:
        rows = conn.execute("SELECT matrix_channel_id, niche_id, country FROM autopilot_channel_map").fetchall()
    finally:
        conn.close()
    return {r[0]: {"niche_id": r[1], "country": (r[2] or "").upper()} for r in rows}


def effective_axes(variant: Dict[str, Any], composition: str, dna: Dict[str, Any], overrides: Dict[str, str],
                   captions: Optional[Dict[str, Optional[str]]] = None) -> Dict[str, Any]:
    """= effectiveAxes (schema.mjs): gốc ← composition ← DNA; caption đổi textPlacement trừ "fixed" (composition tự đặt)."""
    axes = dict(variant["compositions"][composition]["axes"])
    for dna_key, axis in overrides.items():
        if dna.get(dna_key) is not None:
            axes[axis] = dna[dna_key]
    placement = (captions or {}).get(dna.get("caption") or "")
    if placement:
        axes["textPlacement"] = placement
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


def _candidates(account: Dict[str, Any], variants: Dict[str, Dict[str, Any]], niche_engines: Dict[str, List[str]]) -> List[Tuple[str, str]]:
    """(variant_id, composition) hợp lệ cho acc, theo thứ tự ưu tiên: engine cũ của kênh trước, rồi hash ổn định."""
    lang, niche = account["lang"], account["niche"]
    allowed_engines = set(niche_engines.get(niche, []))
    old_engines = set((account["cfg"].get("creative") or {}).get("preferred_engines") or [])
    out = []
    for variant in variants.values():
        if variant["engine"] not in allowed_engines or lang not in variant["countries"]:
            continue
        if variant["niches"] is not None and niche not in variant["niches"]:
            continue
        for comp in variant["compositions"]:
            out.append((0 if variant["engine"] in old_engines else 1, _hash(account["channel_id"], variant["id"], comp), variant["id"], comp))
    return [(vid, comp) for _, _, vid, comp in sorted(out)]


STRUCTURE_CONFLICTS = CONFIG_DIR / "structure_conflicts.json"


def load_conflicts(path: Path = STRUCTURE_CONFLICTS) -> Dict[str, set]:
    """structural key → các key đo được quá giống nó (python3 -m bkt_web.creative_similarity conflicts). Không có file = rỗng."""
    graph: Dict[str, set] = {}
    if not Path(path).exists():
        return graph
    for pair in json.loads(Path(path).read_text(encoding="utf-8")).get("pairs", []):
        graph.setdefault(pair["a"], set()).add(pair["b"])
        graph.setdefault(pair["b"], set()).add(pair["a"])
    return graph


def _max_matching(accounts: List[Dict[str, Any]], cands: Dict[str, List[Tuple[str, str]]], banned: set) -> Dict[str, Tuple[str, str]]:
    owner: Dict[Tuple[str, str], str] = {}

    def augment(cid: str, seen: set) -> bool:
        for cand in cands[cid]:
            if cand in seen or f"{cand[0]}#{cand[1]}" in banned:
                continue
            seen.add(cand)
            if cand not in owner or augment(owner[cand], seen):
                owner[cand] = cid
                return True
        return False

    # Acc ít lựa chọn nhất ghép trước (niche hẹp), để ghép ổn định và ít phải đảo.
    for account in sorted(accounts, key=lambda a: (len(cands[a["channel_id"]]), a["channel_id"])):
        augment(account["channel_id"], set())
    return {cid: cand for cand, cid in owner.items()}


def _match_structural(pending: List[Dict[str, Any]], assigned: List[Dict[str, Any]], variants: Dict[str, Dict[str, Any]],
                      niche_engines: Dict[str, List[str]], conflicts: Optional[Dict[str, set]] = None) -> Dict[str, Tuple[str, str]]:
    """Ghép cặp tối đa acc ↔ structural key theo từng nước; key đã giữ (keep) không được dùng lại.

    ``conflicts``: cặp cấu trúc đo được quá giống. Trong mỗi nước, loại dần cấu trúc có nhiều xung đột nhất (tie: hash)
    miễn là số acc được ghép không giảm, để hai cấu trúc của một cặp không cùng xuất hiện trong nước. Cặp không tránh được
    (thiếu cấu trúc) để lại cho plan đánh ``soft:similar``."""
    conflicts = conflicts or {}
    result: Dict[str, Tuple[str, str]] = {}
    by_country: Dict[str, List[Dict[str, Any]]] = {}
    for account in pending:
        by_country.setdefault(account["country"], []).append(account)
    for country, accounts in by_country.items():
        taken = {r["structural_key"] for r in assigned if r["country"] == country and r["structural_key"]}
        cands = {a["channel_id"]: [c for c in _candidates(a, variants, niche_engines) if f"{c[0]}#{c[1]}" not in taken] for a in accounts}
        usable = {f"{c[0]}#{c[1]}" for options in cands.values() for c in options} | taken
        # Láng giềng của cấu trúc đã giữ bị loại trước (cấu trúc giữ không đổi được).
        banned = {key for key in usable - taken if conflicts.get(key, set()) & taken}
        best = _max_matching(accounts, cands, banned)
        if len(best) < len(_max_matching(accounts, cands, set())):
            banned, best = set(), _max_matching(accounts, cands, set())
        tried: set = set()
        while True:
            live = usable - banned
            degree = {key: len(conflicts.get(key, set()) & live) for key in live - taken - tried}
            degree = {key: d for key, d in degree.items() if d}
            if not degree:
                break
            key = max(degree, key=lambda k: (degree[k], _hash(country, k)))
            tried.add(key)
            trial = _max_matching(accounts, cands, banned | {key})
            if len(trial) == len(best):
                banned.add(key)
                best = trial
        result.update(best)
    return result


def plan_assignments(channels: Dict[str, Dict[str, Any]], registry: Dict[str, Any], niche_engines: Dict[str, List[str]],
                     mapping: Optional[Dict[str, Dict[str, Any]]] = None, only: Optional[Iterable[str]] = None,
                     conflicts: Optional[Dict[str, set]] = None) -> Dict[str, Any]:
    """Plan gán DNA (không ghi gì). ``mapping`` None → mọi kênh YAML, nước suy từ publishing.language."""
    variants = {v["id"]: v for v in registry["variants"]}
    axes = registry["axes"]
    overrides = registry["dna_axis_overrides"]
    captions = registry.get("caption_placements") or {}
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
            "axes": effective_axes(variant, dna["composition"], dna, overrides, captions) if variant else None,
            "voice": voice, "voice_fx": pick_voice_fx(variant, account["cfg"]) if variant else None, "structural_key": f"{variant['id']}#{dna['composition']}" if variant else None,
            "signature": dna_signature(dna, variant["id"], account["lang"], dna_fields) if variant else None,
            "drops_skins": sorted(((account["cfg"].get("creative") or {}).get("skins") or {}).keys()) if variant else [],
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
        if voice.get("character"):  # giọng biến âm (CapCut `_dsp`) không làm giọng dẫn
            continue
        voices_by_lang.setdefault(voice["lang"], []).append(voice)

    # 2) Danh tính cấu trúc: ghép cặp tối đa (Kuhn / augmenting path, = max-flow đơn vị) giữa acc và structural key
    #    CHƯA dùng trong cùng nước. Ứng viên của mỗi acc xếp theo ưu tiên (giữ engine cũ, cân bằng engine theo hash),
    #    nên đường tăng luôn thử lựa chọn tốt trước — không còn "hard:capacity" giả như greedy Phase 0.
    matched = _match_structural(pending, assigned, variants, niche_engines, conflicts)

    for account in pending:
        cid, country, lang = account["channel_id"], account["country"], account["lang"]
        same_country = [r for r in assigned if r["country"] == country and r["variant_id"]]
        choice = matched.get(cid)
        if choice is None:
            add(account, None, None, None, "hard:capacity")
            continue
        variant, comp = variants[choice[0]], choice[1]

        # 3) Chọn DNA từng trục: ít bị dùng nhất trong cùng variant (mọi nước), tie-break hash — không tổ hợp bùng nổ.
        dna: Dict[str, Any] = {"dna_version": registry["dna_version"], "variant_version": variant["version"], "composition": comp}
        same_variant = [r for r in assigned if r["variant_id"] == variant["id"]]
        for axis in DNA_CHOICE_AXES:
            options = variant["allowed"][axis]
            dna[axis] = min(options, key=lambda value: (
                sum(1 for r in same_variant if r["dna"][axis] == value), _hash(cid, variant["id"], axis, value)))
        dna = {key: dna[key] for key in dna_fields}

        # 4) Voice DNA: không trùng nearest neighbor, ít dùng nhất trong (nước, engine), đúng giới tính của variant.
        axes_new = effective_axes(variant, comp, dna, overrides, captions)
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

    for r in assigned:  # hai acc cùng nước mang hai cấu trúc đo được quá giống (không tránh được do thiếu cấu trúc)
        near = (conflicts or {}).get(r["structural_key"] or "", set())
        if near and r["collision"] != "keep" and not r["collision"].startswith("hard") and any(
                o["country"] == r["country"] and o["structural_key"] in near for o in assigned):
            r["collision"] = "soft:similar"
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


# --- Canary cohorts (Phase 7, docs mục 15.1) -----------------------------------------------------------------------
# C1 ≤ 1 acc mỗi (engine, nước), tối đa 8 · C2 20 acc · C3 50% · C4 toàn bộ. Tính CỘNG DỒN: acc đã có DNA ("keep") được tính
# vào cohort. Dòng hard (vd. VN không có variant) không bao giờ vào cohort — các kênh đó giữ đường legacy.
CANARY_COHORTS = ("C1", "C2", "C3", "C4")


def canary_plan(plan: Dict[str, Any], cohort: str) -> Dict[str, Any]:
    """Tập con áp dụng được của plan cho một bậc canary; chọn tất định, rải đều engine và nước."""
    if cohort not in CANARY_COHORTS:
        raise ValueError(f"cohort phải là một trong {', '.join(CANARY_COHORTS)}")
    usable = [r for r in plan["rows"] if r["variant_id"] and not str(r["collision"]).startswith("hard")]
    kept = [r for r in usable if r["collision"] == "keep"]
    fresh = [r for r in usable if r["collision"] != "keep"]
    target = {"C1": 8, "C2": 20, "C3": (len(usable) + 1) // 2, "C4": len(usable)}[cohort]
    picked = list(kept)
    engines: Dict[str, int] = {}
    countries: Dict[str, int] = {}
    pairs = set()
    for r in picked:
        engines[r["engine"]] = engines.get(r["engine"], 0) + 1
        countries[r["country"]] = countries.get(r["country"], 0) + 1
        pairs.add((r["engine"], r["country"]))
    rank = {"ok": 0, "soft:voice": 1, "soft:cross_country": 2, "soft:similar": 3}
    while len(picked) < target:
        pool = [r for r in fresh if r not in picked and (cohort != "C1" or (r["engine"], r["country"]) not in pairs)]
        if not pool:
            break
        row = min(pool, key=lambda r: (engines.get(r["engine"], 0), countries.get(r["country"], 0),
                                       rank.get(r["collision"], 3), _hash("canary", r["channel_id"])))
        picked.append(row)
        engines[row["engine"]] = engines.get(row["engine"], 0) + 1
        countries[row["country"]] = countries.get(row["country"], 0) + 1
        pairs.add((row["engine"], row["country"]))
    rows = sorted(picked, key=lambda r: (r["country"], r["niche"] or "", r["channel_id"]))
    out = {
        "mode": f"canary-{cohort}",
        "source_plan_sha256": plan["plan_sha256"],
        "rows": rows,
        "summary": {
            "accounts": len(rows),
            "new": sum(1 for r in rows if r["collision"] != "keep"),
            "by_engine": {e: sum(1 for r in rows if r["engine"] == e) for e in sorted({r["engine"] for r in rows})},
            "by_country": {c: sum(1 for r in rows if r["country"] == c) for c in sorted({r["country"] for r in rows})},
            "left_legacy": sorted(r["channel_id"] for r in plan["rows"] if str(r["collision"]).startswith("hard")),
            "applicable": True,
        },
    }
    out["plan_sha256"] = recompute_sha(out)
    return out


# --- Apply (Phase 6) ---------------------------------------------------------------------------------------------------
LOCK_NAME = ".migration.lock"
DEFAULT_BACKUP_ROOT = Path("/opt/tokmatrix-backups")


class ApplyError(RuntimeError):
    pass


def recompute_sha(plan: Dict[str, Any]) -> str:
    body = json.dumps(plan["rows"], sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def autopilot_is_quiet(db_path: Path = AUTOPILOT_DB) -> Optional[str]:
    """Lý do KHÔNG được apply (Autopilot bật và không paused), hoặc None. Đọc chỉ-đọc."""
    if not Path(db_path).exists():
        return None
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=10)
    try:
        rows = dict(conn.execute("SELECT key, value FROM autopilot_config WHERE key IN ('enabled','paused')").fetchall())
    except sqlite3.Error as exc:
        return f"không đọc được autopilot_config: {exc}"
    finally:
        conn.close()
    truthy = lambda v: str(v).strip().lower() in ("1", "true", "yes", "on")  # noqa: E731
    if truthy(rows.get("enabled")) and not truthy(rows.get("paused")):
        return "Autopilot đang chạy — pause trước khi apply"
    return None


def batch_running() -> Optional[str]:
    out = subprocess.run(["pgrep", "-af", "batch-matrix"], capture_output=True, text=True, check=False).stdout
    lines = [line for line in out.splitlines() if "pgrep" not in line]
    return f"batch-matrix đang chạy ({len(lines)} tiến trình)" if lines else None


@contextlib.contextmanager
def migration_lock(channels_dir: Path):
    path = Path(channels_dir) / LOCK_NAME
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        raise ApplyError(f"đang có migration khác ({path})") from None
    try:
        os.write(fd, f"{os.getpid()} {int(time.time())}\n".encode())
        os.close(fd)
        yield path
    finally:
        with contextlib.suppress(FileNotFoundError):
            path.unlink()


def migration_locked(channels_dir: Path) -> bool:
    """Các bộ ghi YAML khác (channels.apply_language / auto_link) phải bỏ qua khi khoá đang giữ."""
    return (Path(channels_dir) / LOCK_NAME).exists()


def _dump_yaml(cfg: Dict[str, Any]) -> str:
    return yaml.dump(cfg, allow_unicode=True, default_flow_style=False, sort_keys=False)


def pick_voice_fx(variant: Dict[str, Any], cfg: Dict[str, Any]) -> str:
    """FX giọng hợp lệ với audioProfile.fx của variant: giữ FX đang có nếu được phép, rồi "none", rồi FX đầu tiên."""
    allowed = list(((variant.get("audio") or {}).get("fx")) or ["none"])
    current = (cfg.get("audio") or {}).get("voice_fx") or "none"
    return current if current in allowed else ("none" if "none" in allowed else allowed[0])


def apply_row(cfg: Dict[str, Any], row: Dict[str, Any]) -> Dict[str, Any]:
    """Cấu hình mới cho một dòng plan: variant + DNA + engine khoá + giọng, config_version +1."""
    new = json.loads(json.dumps(cfg))
    creative = new.setdefault("creative", {})
    creative["preferred_engines"] = [row["engine"]]
    creative["variant_id"] = row["variant_id"]
    creative["dna"] = row["dna"]
    # Kênh khoá một engine → bộ da (creative.skins, docs/PLAN_compare_per_country.md) không còn dùng; variant_id thắng.
    # Plan ghi rõ `drops_skins`; --rollback trả lại cả khối creative cũ.
    creative.pop("skins", None)
    if row.get("voice"):
        new.setdefault("audio", {})["voice_id"] = row["voice"]
    fx = row.get("voice_fx")
    if fx and (fx != "none" or (new.get("audio") or {}).get("voice_fx")):
        new.setdefault("audio", {})["voice_fx"] = fx
    new["config_version"] = int(new.get("config_version") or 0) + 1
    return new


def _validate_dir(config_dir: Path, compare_dir: Path = COMPARE_DIR) -> List[str]:
    script = ("import('./tools/matrix-config-validator.mjs').then(m => { const r = m.validateConfigs({ configDir: process.argv[1] });"
              " console.log(JSON.stringify(r.errors)); })")
    out = subprocess.run(["node", "--input-type=module", "-e", script, str(config_dir)], cwd=str(compare_dir),
                         capture_output=True, text=True, timeout=300, check=False, env={**os.environ, "MATRIX_ALLOW_REFERENCE_VARIANTS": "0"})
    if out.returncode != 0:
        return [f"validator failed: {(out.stderr or out.stdout)[-400:]}"]
    return json.loads(out.stdout.strip().splitlines()[-1])


def _replace_files(changes: Dict[Path, str], backup_channels: Path) -> None:
    """os.replace từng file; lỗi giữa chừng → chép lại bản backup cho mọi file đã thay."""
    done: List[Path] = []
    try:
        for path, text in changes.items():
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(text, encoding="utf-8")
            os.replace(tmp, path)
            done.append(path)
    except Exception:
        for path in done:
            shutil.copy2(backup_channels / path.name, path)
        raise


def apply_plan(plan: Dict[str, Any], plan_sha: str, *, config_dir: Path = CONFIG_DIR, backup_root: Path = DEFAULT_BACKUP_ROOT,
               preflight: bool = True, validate=_validate_dir) -> Dict[str, Any]:
    if plan.get("plan_sha256") != plan_sha or recompute_sha(plan) != plan_sha:
        raise ApplyError("plan_sha256 không khớp file plan đã duyệt — không apply")
    hard = [r["channel_id"] for r in plan["rows"] if str(r["collision"]).startswith("hard")]
    if hard:
        raise ApplyError(f"plan có dòng hard ({', '.join(hard[:5])}) — không apply")
    if preflight:
        for reason in (autopilot_is_quiet(), batch_running()):
            if reason:
                raise ApplyError(reason)
    config_dir = Path(config_dir)
    channels_dir = config_dir / "channels"
    rows = [r for r in plan["rows"] if r["collision"] != "keep"]
    with migration_lock(channels_dir):
        files = {}
        for path in sorted(channels_dir.glob("*.yaml")):
            cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            files[cfg.get("channel_id", path.stem)] = (path, cfg)
        missing = [r["channel_id"] for r in rows if r["channel_id"] not in files]
        if missing:
            raise ApplyError(f"không có YAML cho {', '.join(missing[:5])}")
        changes: Dict[Path, str] = {}
        inverse = []
        for row in rows:
            path, cfg = files[row["channel_id"]]
            changes[path] = _dump_yaml(apply_row(cfg, row))
            inverse.append({"channel_id": row["channel_id"], "file": path.name,
                            "creative": cfg.get("creative"), "audio": cfg.get("audio")})
        # 1) Áp lên bản sao TOÀN BỘ config rồi validate cả tập.
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "config"
            shutil.copytree(config_dir, copy, ignore=shutil.ignore_patterns(LOCK_NAME))
            for path, text in changes.items():
                (copy / "channels" / path.name).write_text(text, encoding="utf-8")
            errors = validate(copy)
        if errors:
            raise ApplyError("validator: " + "; ".join(errors[:8]))
        # 2) Backup rồi thay từng file.
        backup = Path(backup_root) / f"creative-dna-{time.strftime('%Y%m%d-%H%M%S')}-{plan_sha[:8]}"
        shutil.copytree(channels_dir, backup / "channels", ignore=shutil.ignore_patterns(LOCK_NAME))
        (backup / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
        (backup / "inverse.json").write_text(json.dumps({"plan_sha256": plan_sha, "config_dir": str(config_dir), "rows": inverse},
                                                        ensure_ascii=False, indent=1), encoding="utf-8")
        _replace_files(changes, backup / "channels")
    return {"applied": len(changes), "backup": str(backup), "inverse": str(backup / "inverse.json"),
            "next": "chạy matrix_config.sync_channel_configs (kiểm version/hash) rồi resume Autopilot"}


def rollback(inverse_path: Path, *, config_dir: Optional[Path] = None, preflight: bool = True, validate=_validate_dir) -> Dict[str, Any]:
    """Khôi phục block creative/audio cũ; config_version vẫn +1 (không bao giờ giảm)."""
    inverse = json.loads(Path(inverse_path).read_text(encoding="utf-8"))
    config_dir = Path(config_dir or inverse["config_dir"])
    if preflight:
        for reason in (autopilot_is_quiet(), batch_running()):
            if reason:
                raise ApplyError(reason)
    channels_dir = config_dir / "channels"
    with migration_lock(channels_dir):
        changes: Dict[Path, str] = {}
        for row in inverse["rows"]:
            path = channels_dir / row["file"]
            cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            for key in ("creative", "audio"):
                if row[key] is None:
                    cfg.pop(key, None)
                else:
                    cfg[key] = row[key]
            cfg["config_version"] = int(cfg.get("config_version") or 0) + 1
            changes[path] = _dump_yaml(cfg)
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "config"
            shutil.copytree(config_dir, copy, ignore=shutil.ignore_patterns(LOCK_NAME))
            for path, text in changes.items():
                (copy / "channels" / path.name).write_text(text, encoding="utf-8")
            errors = validate(copy)
        if errors:
            raise ApplyError("validator: " + "; ".join(errors[:8]))
        backup = Path(inverse_path).parent / f"before-rollback-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copytree(channels_dir, backup, ignore=shutil.ignore_patterns(LOCK_NAME))
        _replace_files(changes, backup)
    return {"rolled_back": len(changes), "backup": str(backup)}


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Creative DNA assignment (dry-run / apply / rollback)")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", action="store_true", help="apply a reviewed plan file (needs --plan and --plan-sha)")
    parser.add_argument("--plan", help="reviewed plan JSON written by --out")
    parser.add_argument("--plan-sha", help="plan_sha256 of the reviewed plan (explicit confirmation)")
    parser.add_argument("--rollback", help="inverse.json from an apply backup")
    parser.add_argument("--config-dir", help="config dir to change (default: compare_studio/config)")
    parser.add_argument("--backup-dir", help=f"backup root (default {DEFAULT_BACKUP_ROOT})")
    parser.add_argument("--include-reference", action="store_true", help="also assign Phase 0 reference variants (preview only)")
    parser.add_argument("--mapping", help="JSON {matrix_channel_id: {country, niche_id}}; only these accounts")
    parser.add_argument("--from-db", action="store_true", help="read autopilot_channel_map read-only")
    parser.add_argument("--channels", help="comma-separated channel ids")
    parser.add_argument("--out", help="write the plan JSON here")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--cohort", choices=CANARY_COHORTS, help="keep only the canary cohort (cumulative, hard rows excluded)")
    args = parser.parse_args(argv)
    try:
        if args.rollback:
            result = rollback(Path(args.rollback), config_dir=Path(args.config_dir) if args.config_dir else None)
            print(json.dumps(result, ensure_ascii=False))
            return 0
        if args.apply:
            if not args.plan or not args.plan_sha:
                print("--apply needs --plan <file> and --plan-sha <sha256 of the reviewed plan>", file=sys.stderr)
                return 2
            plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
            result = apply_plan(plan, args.plan_sha, config_dir=Path(args.config_dir or CONFIG_DIR),
                                backup_root=Path(args.backup_dir or DEFAULT_BACKUP_ROOT))
            print(json.dumps(result, ensure_ascii=False))
            return 0
    except ApplyError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return 2
    mapping = None
    if args.mapping:
        mapping = {k: {"country": str(v.get("country", "")).upper(), "niche_id": v.get("niche_id")}
                   for k, v in json.loads(Path(args.mapping).read_text(encoding="utf-8")).items()}
    elif args.from_db:
        mapping = load_mapping_db()
    only = [c.strip() for c in args.channels.split(",") if c.strip()] if args.channels else None
    config_dir = Path(args.config_dir) if args.config_dir else CONFIG_DIR
    plan = plan_assignments(load_channels(config_dir), load_registry(args.include_reference), load_niche_engines(config_dir), mapping, only,
                            load_conflicts(config_dir / STRUCTURE_CONFLICTS.name))
    if args.cohort:
        plan = canary_plan(plan, args.cohort)
    if args.out:
        Path(args.out).write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False) if args.json else format_table(plan))
    return 0


if __name__ == "__main__":
    sys.exit(main())
