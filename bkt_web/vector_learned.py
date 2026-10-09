"""Rig vector học được (vector_learner) — lưu ngoài thư mục static để deploy không ghi đè.

storage/vector_learned/rigs.json là nguồn duy nhất. Mục có `alias_of` chỉ là subject mới trỏ tới rig có sẵn (tầng 1,
không vẽ); mục còn lại là rig mới (tầng 2) có code vẽ (thân hàm `(ctx, s, t)`, chỉ dùng ctx và
RemakeVector.kit), anchors, nhãn theo ngôn ngữ, khung bao đo được. Từ đó sinh `learned.js` (một pack
`RemakeVector.register`) và được ghép lúc nạp vào:
  - remake_vector._catalog()        → catalog.assets (pack "learned")
  - remake_vector.engine_sources()  → thêm learned.js sau mọi pack
  - vector_video.niches.load()      → subjects + danh sách subject của niche
  - vector_video.extents.load_extents()
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict

DIR = Path(os.environ.get("TOKMATRIX_VECTOR_LEARNED_DIR") or Path(__file__).resolve().parent / "storage" / "vector_learned")
RIGS = DIR / "rigs.json"
JS = DIR / "learned.js"
PACK = "learned"
KIT_NAMES = ("INK", "TAU", "tone", "volume", "cylinder", "taper", "limb", "mitten", "leaf", "blade", "ellipse", "path",
             "line", "drawPoly", "mixColor", "hash", "clamp", "smooth", "mix", "seeded")


def rigs() -> Dict[str, Dict[str, Any]]:
    try:
        return json.loads(RIGS.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}


def pack_js(table: Dict[str, Dict[str, Any]]) -> str:
    """Pack JS cho các rig trong `table`; mỗi rig bọc try/catch để một rig lỗi không làm hỏng cả video."""
    body = []
    for rid, spec in sorted(table.items()):
        if spec.get("alias_of"):
            continue
        body.append(f"    {json.dumps(rid)}: {{ draw(ctx, s, t) {{\n      ctx.save();\n      try {{\n"
                    f"{spec['code']}\n      }} finally {{ ctx.restore(); }}\n    }} }},")
    return ("// remake_vector_packs/learned.js — SINH TỰ ĐỘNG từ storage/vector_learned/rigs.json (vector_learner). Không sửa tay.\n"
            "(function () {\n  'use strict';\n"
            "  if (typeof RemakeVector === 'undefined') throw new Error('RemakeVector core engine must be loaded before engine packs.');\n"
            f"  const {{ {', '.join(KIT_NAMES)} }} = RemakeVector.kit;\n"
            "  RemakeVector.register({ rigs: {\n" + "\n".join(body) + "\n  } });\n})();\n")


def write(table: Dict[str, Dict[str, Any]]) -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    for path, text in ((RIGS, json.dumps(table, ensure_ascii=False, indent=1)), (JS, pack_js(table))):
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
    clear_caches()


def add(rid: str, spec: Dict[str, Any]) -> None:
    table = rigs()
    table[rid] = {**spec, "created": spec.get("created") or int(time.time())}
    write(table)


def clear_caches() -> None:
    for mod, fn in (("bkt_web.remake_vector", "_catalog"), ("bkt_web.vector_video.niches", "load"),
                    ("bkt_web.vector_video.extents", "load_extents")):
        try:
            getattr(__import__(mod, fromlist=[fn]), fn).cache_clear()
        except Exception:  # noqa: BLE001
            pass


# ------------------------------------------------------------------ ghép lúc nạp
def patch_catalog(cat: Dict[str, Any]) -> Dict[str, Any]:
    for rid, spec in rigs().items():
        if rid in cat["assets"] or spec.get("alias_of"):
            continue  # rig thật cùng id đã có trong catalog: giữ rig thật; bí danh không phải rig
        asset = {"label": spec["label"], "group": spec.get("group", "prop"), "face": bool(spec.get("face")),
                 "pack": PACK, "topics": spec.get("topics", []), "anchors": spec["anchors"], "learned": True}
        if spec.get("face_scale"):
            asset["face_scale"] = spec["face_scale"]
        cat["assets"][rid] = asset
    return cat


def js_path() -> Path | None:
    return JS if any(not s.get("alias_of") for s in rigs().values()) and JS.is_file() else None


def niche_fragment() -> Dict[str, Any]:
    frag: Dict[str, Any] = {"subjects": {}, "hosts": {}, "buddies": {}, "niches": {}}
    for rid, spec in rigs().items():
        frag["subjects"][rid] = {"asset": spec.get("alias_of") or rid, **({"variant": spec["variant"]} if spec.get("variant") else {}), "float": bool(spec.get("float")), "label": spec.get("subject_label") or spec["label"],
                                 "labels": spec.get("labels", {}), "settings": spec.get("settings", []), "size": spec.get("size", "m")}
        for niche in spec.get("niches", []):
            frag["niches"].setdefault(niche, {"hosts": [], "buddies": [], "settings": [], "subjects": []})["subjects"].append(rid)
    return frag


def extents() -> Dict[str, Any]:
    return {rid: spec["extent"] for rid, spec in rigs().items() if spec.get("extent") and not spec.get("alias_of")}
