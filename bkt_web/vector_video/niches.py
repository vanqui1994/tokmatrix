"""Niche Matrix → nền, nhân vật dẫn, bạn đồng hành, vật thể cho phép (compare_studio/config/vector_niches.json)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NICHES_PATH = ROOT / "compare_studio" / "config" / "vector_niches.json"
LANGUAGES = ("de", "en", "ko", "ja")


FRAGMENTS_DIR = NICHES_PATH.parent / "vector_niches.d"


def merge(base: dict, frag: dict) -> dict:
    """Ghép một mảnh `vector_niches.d/<pack>.json` (hosts/subjects/buddies mới, niche thêm nền/vật thể/người dẫn).
    Mảnh chỉ được thêm: id đã có thì lỗi (mỗi gói một file để các agent làm song song không đè nhau)."""
    for group in ("hosts", "subjects", "buddies"):
        for key, spec in frag.get(group, {}).items():
            if key in base[group]:
                raise ValueError(f"{group} {key} đã có (mảnh chỉ được thêm)")
            base[group][key] = spec
    for nid, add in frag.get("niches", {}).items():
        spec = base["niches"].setdefault(nid, {"hosts": [], "buddies": [], "settings": [], "subjects": []})
        for field in ("hosts", "buddies", "settings", "subjects"):
            spec[field] = list(dict.fromkeys([*spec.get(field, []), *add.get(field, [])]))
        for field in ("settings_by_lang", "hosts_by_lang"):
            for lang, items in add.get(field, {}).items():
                spec.setdefault(field, {})[lang] = list(dict.fromkeys([*spec.get(field, {}).get(lang, []), *items]))
    return base


@lru_cache(maxsize=1)
def load() -> dict:
    data = json.loads(NICHES_PATH.read_text(encoding="utf-8"))
    for frag in sorted(FRAGMENTS_DIR.glob("*.json")) if FRAGMENTS_DIR.exists() else []:
        merge(data, json.loads(frag.read_text(encoding="utf-8")))
    return data


def supported_niches() -> list[str]:
    return sorted(load()["niches"])


def niche(niche_id: str) -> dict:
    data = load()
    if niche_id not in data["niches"]:
        raise ValueError(f"niche {niche_id!r} không dùng engine vector (xem vector_niches.json)")
    return data["niches"][niche_id]


def check_language(lang: str) -> str:
    if lang not in LANGUAGES:
        raise ValueError(f"engine vector chỉ làm cho de/en/ko/ja (nhận {lang!r})")
    return lang


def allowed(niche_id: str, lang: str) -> dict:
    """Danh sách cho phép của một niche ở một ngôn ngữ (nền và người dẫn riêng theo nước được đặt trước)."""
    check_language(lang)
    data, spec = load(), niche(niche_id)
    settings = list(dict.fromkeys([*spec.get("settings_by_lang", {}).get(lang, []), *spec["settings"]]))
    hosts = list(dict.fromkeys([*spec.get("hosts_by_lang", {}).get(lang, []), *spec["hosts"]]))
    return {
        "settings": settings,
        "hosts": {h: data["hosts"][h] for h in hosts},
        "buddies": {b: data["buddies"][b] for b in spec["buddies"]},
        "subjects": {s: data["subjects"][s] for s in spec["subjects"]},
        "blocked": set(data["blocked_assets"]),
    }


def problems() -> list[str]:
    """Mọi asset/nền/outfit trong file phải có trong catalog và đã đo kích thước (dùng trong test)."""
    from bkt_web.remake_vector import catalog
    from bkt_web.vector_video.extents import load_extents

    cat, ext, data = catalog(), load_extents(), load()
    errs = []
    for hid, host in data["hosts"].items():
        if host["rig"] not in cat["assets"]:
            errs.append(f"host {hid}: rig {host['rig']} không có")
        if host.get("outfit") and host["outfit"] not in cat.get("outfits", {}):
            errs.append(f"host {hid}: outfit {host['outfit']} không có")
        if host["rig"] in data["blocked_assets"]:
            errs.append(f"host {hid}: rig bị chặn")
    for group in ("subjects", "buddies"):
        for sid, spec in data[group].items():
            key = f"{spec['asset']}.{spec['variant']}" if spec.get("variant") else spec["asset"]
            if spec["asset"] not in cat["assets"]:
                errs.append(f"{group} {sid}: asset {spec['asset']} không có")
                continue
            if cat["assets"][spec["asset"]].get("group") == "monster" and (spec.get("pose") or {}).get("badge") != 0:
                errs.append(f"{group} {sid}: nhóm monster vẽ huy hiệu chữ (tierBadge) — phải đặt pose badge = 0")
            for bg in spec.get("settings", []):
                if bg not in cat["background_specs"]:
                    errs.append(f"{group} {sid}: nền gợi ý {bg} không có")
            if key not in ext:
                errs.append(f"{group} {sid}: chưa đo kích thước {key}")
    for nid, spec in data["niches"].items():
        for bg in [*spec["settings"], *[b for bs in spec.get("settings_by_lang", {}).values() for b in bs]]:
            if bg not in cat["background_specs"]:
                errs.append(f"niche {nid}: nền {bg} không có")
            if bg in data["blocked_assets"]:
                errs.append(f"niche {nid}: nền {bg} bị chặn")
        for ref, group in [(h, "hosts") for h in spec["hosts"]] + [(h, "hosts") for hs in spec.get("hosts_by_lang", {}).values() for h in hs] + \
                [(b, "buddies") for b in spec["buddies"]] + [(s, "subjects") for s in spec["subjects"]]:
            if ref not in data[group]:
                errs.append(f"niche {nid}: {group} {ref} không có")
    return errs
