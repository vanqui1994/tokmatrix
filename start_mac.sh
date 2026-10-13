#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Kích hoạt virtualenv
source .venv/bin/activate

# PATH cho ffmpeg, ffprobe, cloudflared
export PATH="/usr/local/bin:$PATH"

echo "=========================================================="
echo "🚀 TokMatrix AI Studio (SSMATool Mac Port) đang khởi động..."
echo "👉 Truy cập giao diện tại: http://127.0.0.1:8080"
echo "=========================================================="

python3 -m bkt_web.server
