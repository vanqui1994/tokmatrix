#!/usr/bin/env python3
"""Contact sheet cho preview variant: chụp 20% / 50% / 80% thời lượng bằng `hyperframes snapshot` (runtime thật,
SwiftShader --no-browser-gpu cho tất định), ghép thành một PNG có nhãn Creative DNA để truy ngược cấu hình.

    node tools/preview-variants.mjs --out /tmp/vp --include-reference
    python3 tools/variant_contact_sheet.py --manifest /tmp/vp/manifest.json --out /tmp/vp/sheet.png [--check-determinism]

HYPERFRAMES_BIN chọn CLI (mặc định: npx hyperframes đúng bản production, pin trong matrix/render/native-engine-adapter.mjs —
0.8.75 treo khi chụp giữa transition zoom_through). Không ghi gì vào repo.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import functools
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

from PIL import Image, ImageDraw, ImageFont

POSITIONS = (0.2, 0.5, 0.8)
THUMB_W = 216
THUMB_H = 384
LABEL_H = 118


COMPARE_DIR = Path(__file__).resolve().parent.parent


def production_version() -> str:
    source = (COMPARE_DIR / "matrix" / "render" / "native-engine-adapter.mjs").read_text(encoding="utf-8")
    match = re.search(r'check: "npx --yes hyperframes@([0-9A-Za-z.-]+) check"', source)
    if not match:
        raise RuntimeError("cannot find the hyperframes version in native-engine-adapter.mjs")
    return match.group(1)


def hyperframes_cmd() -> List[str]:
    return shlex.split(os.environ.get("HYPERFRAMES_BIN") or f"npx --yes hyperframes@{production_version()}")


@functools.lru_cache(maxsize=1)
def gpu_flags() -> List[str]:
    """`--no-browser-gpu` (SwiftShader, tất định) chỉ có từ hyperframes 0.8; bản cũ báo "Unknown flag"."""
    out = subprocess.run(hyperframes_cmd() + ["--version"], capture_output=True, text=True, timeout=300)
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", out.stdout + out.stderr)
    return ["--no-browser-gpu"] if match and (int(match.group(1)), int(match.group(2))) >= (0, 8) else []


def snapshot(project: Path, times: List[float], out_dir: Path) -> List[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    at = ",".join(f"{t:.2f}" for t in times)
    cmd = hyperframes_cmd() + ["snapshot", str(project), "--at", at, "--no-end", "--describe", "false",
                               *gpu_flags(), "-o", str(out_dir)]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
    shots = sorted(out_dir.glob("*.png"))
    if len(shots) < len(times):
        raise RuntimeError(f"snapshot {project.name}: got {len(shots)} frame(s), expected {len(times)}")
    return shots[: len(times)]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def label_lines(labels: Dict[str, object]) -> List[str]:
    return [
        f"{labels['engine']} · {labels['variant']}",
        f"{labels['country']} · comp={labels['composition']}",
        f"motion={labels['motion']} · type={labels['typography']}",
        f"trans={labels['transition']} · treat={labels['treatment']} · tone={labels['tone']}",
        f"voice={labels['voice']} · sig={labels['signature']}",
    ]


def build_sheet(entries: List[dict], work: Path) -> Image.Image:
    cols = len(POSITIONS)
    cell_w = THUMB_W * cols + 12
    sheet = Image.new("RGB", (cell_w * 2, (THUMB_H + LABEL_H) * ((len(entries) + 1) // 2)), "white")
    font = ImageFont.load_default()
    draw = ImageDraw.Draw(sheet)
    for n, entry in enumerate(entries):
        x0 = (n % 2) * cell_w
        y0 = (n // 2) * (THUMB_H + LABEL_H)
        times = [round(entry["duration"] * p, 2) for p in POSITIONS]
        shots = snapshot(Path(entry["dir"]), times, work / entry["slug"])
        for i, shot in enumerate(shots):
            thumb = Image.open(shot).convert("RGB").resize((THUMB_W, THUMB_H))
            sheet.paste(thumb, (x0 + i * THUMB_W, y0))
        for i, line in enumerate(label_lines(entry["labels"])):
            draw.text((x0 + 4, y0 + THUMB_H + 4 + i * 22), line, fill="black", font=font)
    return sheet


def check_determinism(entry: dict, work: Path) -> bool:
    times = [round(entry["duration"] * 0.5, 2)]
    first = snapshot(Path(entry["dir"]), times, work / "det-a")[0]
    second = snapshot(Path(entry["dir"]), times, work / "det-b")[0]
    return sha256(first) == sha256(second)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--limit", type=int, default=0, help="chỉ lấy N preview đầu (0 = tất cả)")
    parser.add_argument("--check-determinism", action="store_true")
    parser.add_argument("--positions", default="", help="tỉ lệ thời lượng, vd 0.2,0.45,0.8 (mặc định 0.2,0.5,0.8)")
    args = parser.parse_args(argv)
    global POSITIONS
    if args.positions:
        POSITIONS = tuple(float(p) for p in args.positions.split(","))
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    entries = manifest["entries"][: args.limit or None]
    work = Path(args.out).with_suffix("")
    work = work.parent / f"{work.name}-frames"
    if args.check_determinism:
        ok = check_determinism(entries[0], work)
        print(json.dumps({"determinism": ok, "slug": entries[0]["slug"]}))
        if not ok:
            return 1
    build_sheet(entries, work).save(args.out)
    print(json.dumps({"sheet": args.out, "previews": len(entries)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
