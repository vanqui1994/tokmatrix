#!/usr/bin/env bash
# ============================================================================
# start_bridge_worker.sh — Khởi động TokMatrix + Bridge Auto Worker
# ============================================================================
# Bridge Auto Worker chạy song song với server, tự động:
#   1. Pull task pending (engine=antigravity) vào inbox  (mỗi 5s)
#   2. Watch outbox → import ảnh vào Thư viện + đóng task (mỗi 5s)
#
# Antigravity IDE agent sẽ đọc inbox → sinh ảnh → đặt vào outbox.
# ============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_PORT="${TOKMATRIX_PORT:-8080}"
LOG_DIR="$PROJECT_DIR/bkt_web/storage/logs"
LOG_FILE="$LOG_DIR/server_$(date +%Y%m%d_%H%M%S).log"
PID_FILE="$PROJECT_DIR/.tokmatrix.pid"
BRIDGE_DIR="$PROJECT_DIR/bkt_web/storage/antigravity_bridge"

# Màu
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   TokMatrix Server + Bridge Auto Worker          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ---- 1. Kill process cũ ----
echo -e "${YELLOW}[1/4] Dọn dẹp process cũ trên port $SERVER_PORT...${NC}"
OLD_PIDS=$(lsof -ti:"$SERVER_PORT" 2>/dev/null || true)
if [ -n "$OLD_PIDS" ]; then
    echo "$OLD_PIDS" | xargs kill 2>/dev/null || true
    sleep 2
    echo -e "  ↳ Đã kill process cũ: $OLD_PIDS"
else
    echo -e "  ↳ Port $SERVER_PORT trống, OK"
fi

# Kill từ PID file
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        kill "$OLD_PID" 2>/dev/null || true
        echo -e "  ↳ Đã kill PID cũ: $OLD_PID"
    fi
    rm -f "$PID_FILE"
fi

# ---- 2. Tạo thư mục bridge ----
echo -e "${YELLOW}[2/4] Kiểm tra thư mục Bridge...${NC}"
mkdir -p "$BRIDGE_DIR"/{inbox,outbox,archive}
mkdir -p "$LOG_DIR"
echo -e "  ↳ inbox:   $BRIDGE_DIR/inbox/"
echo -e "  ↳ outbox:  $BRIDGE_DIR/outbox/"
echo -e "  ↳ archive: $BRIDGE_DIR/archive/"

# ---- 3. Khởi động server ----
echo -e "${YELLOW}[3/4] Khởi động TokMatrix Server...${NC}"
cd "$PROJECT_DIR"

nohup python3 -m bkt_web.server > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

# Đợi server lên
echo -n "  ↳ Chờ server khởi động"
for i in $(seq 1 15); do
    if curl -s "http://127.0.0.1:$SERVER_PORT/api/ai-images/bridge/status" > /dev/null 2>&1; then
        echo ""
        echo -e "  ↳ ${GREEN}Server đã sẵn sàng!${NC} (PID: $SERVER_PID)"
        break
    fi
    echo -n "."
    sleep 1
done

# Kiểm tra
if ! curl -s "http://127.0.0.1:$SERVER_PORT/api/ai-images/bridge/status" > /dev/null 2>&1; then
    echo ""
    echo -e "  ↳ ${RED}Server chưa lên! Kiểm tra log:${NC} $LOG_FILE"
    exit 1
fi

# ---- 4. Kiểm tra Bridge Worker ----
echo -e "${YELLOW}[4/4] Kiểm tra Bridge Auto Worker...${NC}"
STATUS=$(curl -s "http://127.0.0.1:$SERVER_PORT/api/ai-images/bridge/status")
PENDING=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['queue']['pending'])" 2>/dev/null || echo "?")
PROCESSING=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['queue']['processing'])" 2>/dev/null || echo "?")
INBOX=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['inbox']['count'])" 2>/dev/null || echo "?")
OUTBOX=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['outbox']['count'])" 2>/dev/null || echo "?")

echo -e "  ↳ Pending: ${PENDING}  Processing: ${PROCESSING}"
echo -e "  ↳ Inbox: ${INBOX}  Outbox: ${OUTBOX}"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ TokMatrix + Bridge Worker đã chạy!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Web UI:     ${CYAN}http://127.0.0.1:$SERVER_PORT${NC}"
echo -e "  Server PID: ${CYAN}$SERVER_PID${NC}"
echo -e "  Log file:   ${CYAN}$LOG_FILE${NC}"
echo -e "  PID file:   ${CYAN}$PID_FILE${NC}"
echo ""
echo -e "  ${YELLOW}Flow tự động:${NC}"
echo -e "    Web bấm tạo ảnh (engine=Antigravity)"
echo -e "      → Worker tự pull vào inbox      (mỗi 5s)"
echo -e "      → Antigravity IDE tự sinh ảnh   (cron 1 phút)"
echo -e "      → Worker tự import từ outbox    (mỗi 5s)"
echo -e "      → Ảnh xuất hiện trong Thư Viện  ✅"
echo ""
echo -e "  ${YELLOW}Lệnh hữu ích:${NC}"
echo -e "    Xem log:    tail -f $LOG_FILE"
echo -e "    Dừng:       kill $SERVER_PID"
echo -e "    Trạng thái: curl -s http://127.0.0.1:$SERVER_PORT/api/ai-images/bridge/status | python3 -m json.tool"
echo ""
