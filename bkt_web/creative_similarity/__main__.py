"""CLI đo độ giống.

    # preview của hệ variant (compare_studio/tools/preview-variants.mjs) → chụp khung, đo, báo cáo (+ contact sheet)
    python3 -m bkt_web.creative_similarity previews --manifest /tmp/vp/manifest.json --work /tmp/vp/sim [--sheet /tmp/vp/sheet.png]
    # video đã render trong compare_studio/videos/<slug>
    python3 -m bkt_web.creative_similarity videos <slug> <slug> ...

Chỉ ghi vào --work / storage/creative_similarity.db (cache features). Thoát 1 khi có cặp vượt ngưỡng nội bộ.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import conflict_pairs, connect, diversity_threshold, extract_all, report

ROOT = Path(__file__).resolve().parent.parent.parent
COMPARE_DIR = ROOT / "compare_studio"
POSITIONS = (0.2, 0.35, 0.5, 0.65, 0.8, 0.92)
SHEET_POSITIONS = (0, 2, 4)  # 0.2 / 0.5 / 0.8 cho contact sheet
FRAME_SIZE = (270, 480)


def _contact_sheet_module():
    spec = importlib.util.spec_from_file_location("variant_contact_sheet", COMPARE_DIR / "tools" / "variant_contact_sheet.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _creative_meta(index_html: str) -> Dict[str, Any]:
    match = re.search(r'<meta name="matrix-creative" content="([^"]*)"', index_html)
    return json.loads(html.unescape(match.group(1))) if match else {}


def preview_samples(manifest_path: Path, work: Path) -> List[Dict[str, Any]]:
    sheet = _contact_sheet_module()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    samples = []
    for entry in manifest["entries"]:
        frames_dir = work / "frames" / entry["slug"]
        shots = sorted(frames_dir.glob("*.png")) if frames_dir.exists() else []
        if len(shots) < len(POSITIONS):
            times = [round(entry["duration"] * p, 2) for p in POSITIONS]
            shots = sheet.snapshot(Path(entry["dir"]), times, frames_dir)
        frames = [np.asarray(Image.open(shot).convert("RGB").resize(FRAME_SIZE)) for shot in shots[: len(POSITIONS)]]
        index_html = (Path(entry["dir"]) / "index.html").read_text(encoding="utf-8")
        samples.append({
            "slug": entry["slug"], "frames": frames, "shots": [str(s) for s in shots[: len(POSITIONS)]],
            "labels": {**entry["labels"], "engine": entry["labels"]["engine"], "variant": entry["labels"]["variant"]},
            "meta": {"creative": _creative_meta(index_html), "scene_durations": entry.get("scene_durations") or []},
        })
    return samples


def _file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def video_samples(slugs: List[str], videos_dir: Path = COMPARE_DIR / "videos") -> List[Dict[str, Any]]:
    samples = []
    for slug in slugs:
        vdir = videos_dir / slug
        meta = json.loads((vdir / "meta.json").read_text(encoding="utf-8"))
        mp4 = vdir / "renders" / f"{slug}.mp4"
        duration = float(meta.get("duration") or 0)
        frames = []
        if mp4.exists() and duration > 1.5:
            w, h = FRAME_SIZE
            for p in POSITIONS:
                raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{duration * p:.3f}", "-i", str(mp4), "-frames:v", "1",
                                      "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, timeout=120).stdout
                if len(raw) == w * h * 3:
                    frames.append(np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3))
        creative = meta.get("creative") or {}
        spec = json.loads((vdir / "spec.json").read_text(encoding="utf-8")) if (vdir / "spec.json").exists() else {}
        images = sorted((vdir / "assets" / "images").glob("*")) if (vdir / "assets" / "images").exists() else []
        samples.append({
            "slug": slug, "frames": frames,
            "labels": {"engine": meta.get("type", ""), "variant": creative.get("variant_id") or f"legacy:{meta.get('type', '')}",
                       "composition": (creative.get("creative_dna") or {}).get("composition", ""), "country": creative.get("country") or meta.get("lang", ""),
                       "signature": creative.get("creative_signature", "")},
            "meta": {"creative": creative, "scene_durations": [s.get("duration_seconds") or s.get("duration") for s in spec.get("script", [])],
                     "asset_sha256": [_file_sha(p) for p in images if p.is_file()]},
        })
    return samples


def write_sheet(samples: List[Dict[str, Any]], out: Path) -> None:
    sheet_mod = _contact_sheet_module()
    tw, th, lh = sheet_mod.THUMB_W, sheet_mod.THUMB_H, sheet_mod.LABEL_H
    cell_w = tw * len(SHEET_POSITIONS) + 12
    sheet = Image.new("RGB", (cell_w * 2, (th + lh) * ((len(samples) + 1) // 2)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for n, sample in enumerate(samples):
        x0, y0 = (n % 2) * cell_w, (n // 2) * (th + lh)
        for i, k in enumerate(SHEET_POSITIONS):
            sheet.paste(Image.open(sample["shots"][k]).convert("RGB").resize((tw, th)), (x0 + i * tw, y0))
        for i, line in enumerate(sheet_mod.label_lines(sample["labels"])):
            draw.text((x0 + 4, y0 + th + 4 + i * 22), line, fill="black", font=font)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


def _print_summary(result: Dict[str, Any]) -> None:
    print(json.dumps({key: result[key] for key in ("threshold", "note", "pairs", "passed", "cohorts", "gate_signals")}, indent=1))
    for row in result["over_threshold"][:20]:
        print(f"OVER {row['composite']:.3f}  {row['a']}  ↔  {row['b']}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Matrix creative similarity")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("previews")
    p.add_argument("--manifest", required=True)
    p.add_argument("--work", required=True)
    p.add_argument("--sheet")
    p.add_argument("--threshold", type=float)
    c = sub.add_parser("conflicts", help="gộp các similarity.json thành danh sách cặp cấu trúc vượt ngưỡng cho gán DNA")
    c.add_argument("--report", action="append", required=True)
    c.add_argument("--out", required=True)
    v = sub.add_parser("videos")
    v.add_argument("slugs", nargs="+")
    v.add_argument("--threshold", type=float)
    args = parser.parse_args(argv)
    if args.cmd == "conflicts":
        reports = [json.loads(Path(path).read_text(encoding="utf-8")) for path in args.report]
        pairs = conflict_pairs(reports)
        out = {"note": "cặp variant#composition có composite ≥ internal diversity threshold trên preview cùng nước; "
                       "creative_dna không gán hai cấu trúc của một cặp cho hai acc cùng nước",
               "threshold": min(rep["threshold"] for rep in reports), "pairs": pairs}
        Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{len(pairs)} conflicting structure pairs → {args.out}")
        return 0
    conn = connect()
    if args.cmd == "previews":
        work = Path(args.work)
        work.mkdir(parents=True, exist_ok=True)
        samples = preview_samples(Path(args.manifest), work)
        # Preview: features phụ thuộc bản build → không cache vào DB chung (khoá slug trùng giữa các lần dựng).
        features = {s["slug"]: extract_all(s) for s in samples}
        if args.sheet:
            write_sheet(samples, Path(args.sheet))
    else:
        samples = video_samples(args.slugs)
        features = {s["slug"]: extract_all(s, conn) for s in samples}
    result = report(samples, features, args.threshold if args.threshold is not None else diversity_threshold())
    if args.cmd == "previews":
        (Path(args.work) / "similarity.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    _print_summary(result)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
