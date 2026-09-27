#!/usr/bin/env bash
# Do hieu nang render variant tren VPS (docs/PLAN_VARIANT_V2_COMPLETION.md WS-G).
#
# Render preview N variant moi engine bang dung cau hinh production (hyperframes ban pin trong native-engine-adapter,
# MATRIX_RENDER_FPS/QUALITY/CRF, song song MATRIX_RENDER_SLOTS lay tu service tokmatrix-web), ghi bao cao vao
# docs/creative_dna/bench-<ngay>.md. Chay bang user tokmatrix (khong tao file root trong /opt/tokmatrix).
#
# Nen chay khi Autopilot tam dung hoac vang viec: bench chiem dung so slot render nhu production.
#
#   sudo deploy/bench_variants.sh [--per-engine 2] [--lang de] [--engine vox]
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tokmatrix}"
APP_USER="${APP_USER:-tokmatrix}"
OUT_DIR="${OUT_DIR:-/tmp/tokmatrix-bench}"
REPORT="$APP_DIR/docs/creative_dna/bench-$(date +%Y-%m-%d).md"

# Lay bien render tu service dang chay de do dung nhu production.
service_env() {
  systemctl show tokmatrix-web.service -p Environment --value 2>/dev/null | tr ' ' '\n' | grep -E '^MATRIX_RENDER_(SLOTS|FPS|QUALITY|CRF)=' || true
}

mapfile -t RENDER_ENV < <(service_env)
echo "render env: ${RENDER_ENV[*]:-(defaults)}"

cmd=(env "${RENDER_ENV[@]}" node tools/bench-variants.mjs --out "$OUT_DIR" --report "$REPORT" "$@")
if [ "$(id -un)" = "$APP_USER" ]; then
  (cd "$APP_DIR/compare_studio" && "${cmd[@]}")
else
  runuser -u "$APP_USER" -- bash -c "cd '$APP_DIR/compare_studio' && $(printf '%q ' "${cmd[@]}")"
fi
echo "report: $REPORT"
