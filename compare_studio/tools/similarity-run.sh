#!/usr/bin/env bash
# Đo độ giống của mọi cấu trúc variant bằng MỘT lệnh (docs/PLAN_VARIANT_V2_COMPLETION.md WS-A4):
# dựng preview → chụp 6 khung song song → so mọi cặp (layout/declared/visual/motion/color/asset/timing) → danh sách cặp
# cấu trúc vượt internal diversity threshold (0.62, không bao giờ nới).
#
#   compare_studio/tools/similarity-run.sh <out-dir> [--langs de,en,vi,ja,ko] [--jobs 4] [--engine e] [--write]
#
# --write ghi đè compare_studio/config/structure_conflicts.json (creative_dna sẽ đọc nó khi gán DNA); không có thì chỉ ghi
# <out-dir>/structure_conflicts.json để xem trước. Thoát 1 khi còn cặp vượt ngưỡng (vẫn ghi file).
set -euo pipefail
OUT="${1:?usage: similarity-run.sh <out-dir> [--langs l1,l2] [--jobs N] [--engine e] [--write]}"
shift
LANGS="de,en,vi,ja,ko"
JOBS="$(nproc)"
ENGINE=""
WRITE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --langs) LANGS="$2"; shift 2 ;;
    --jobs) JOBS="$2"; shift 2 ;;
    --engine) ENGINE="$2"; shift 2 ;;
    --write) WRITE=1; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
mkdir -p "$OUT"
( cd "$HERE" && node tools/preview-variants.mjs --out "$OUT/previews" --langs "$LANGS" ${ENGINE:+--engine "$ENGINE"} )
status=0
( cd "$ROOT" && python3 -m bkt_web.creative_similarity previews --manifest "$OUT/previews/manifest.json" --work "$OUT/sim" --jobs "$JOBS" ) || status=$?
[ "$status" -le 1 ] || exit "$status"
( cd "$ROOT" && python3 -m bkt_web.creative_similarity conflicts --report "$OUT/sim/similarity.json" --out "$OUT/structure_conflicts.json" )
if [ "$WRITE" = 1 ]; then
  if [ -n "$ENGINE" ]; then echo "--write needs a full run (no --engine): conflicts across engines would be lost" >&2; exit 2; fi
  cp "$OUT/structure_conflicts.json" "$HERE/config/structure_conflicts.json"
  echo "wrote compare_studio/config/structure_conflicts.json"
fi
exit "$status"
