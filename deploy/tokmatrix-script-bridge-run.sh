#!/usr/bin/env bash
# Giao task KICH BAN trong script_bridge/inbox cho agent Antigravity, khong can GUI.
# Ban sao cua tokmatrix-bridge-run (anh); worker trong server tu pull task vao inbox va nhap outbox.
#
# agentapi doi ba bien:
#   ANTIGRAVITY_LS_ADDRESS  - cong gRPC cua language_server, doi moi lan khoi dong
#   ANTIGRAVITY_CSRF_TOKEN  - nam trong dong lenh cua chinh language_server
#   ANTIGRAVITY_PROJECT_ID  - id workspace, co dinh, luu o file cau hinh
set -uo pipefail

CONF=/etc/tokmatrix-bridge.conf
BR=/opt/tokmatrix/bkt_web/storage/script_bridge
AGENTAPI=/opt/tokmatrix/.gemini/antigravity/bin/agentapi

log() { echo "[$(date '+%H:%M:%S')] $*"; }

[ -f "$CONF" ] && . "$CONF"
PROJECT_ID="${ANTIGRAVITY_PROJECT_ID:-}"

# 1. Inbox rong thi khong goi agent -> khong ton quota
COUNT=$(find "$BR/inbox" -name '*.md' 2>/dev/null | wc -l)
if [ "$COUNT" -eq 0 ]; then
  log "inbox rong, bo qua"
  exit 0
fi

# 1a. Lan truoc agent bao het quota (HTTP 429, co quotaResetTimeStamp) -> xoay tai khoan
#     hoac cho toi gio reset. Khong co buoc nay, moi phut lai mo mot conversation moi,
#     agent doc het ngu canh roi dung ngay vi 429, dot quota model chu ma khong ra ket qua.
#     Chi tinh loi cua DUNG tai khoan dang active: loi cua tai khoan cu khong khoa tai khoan moi.
#     Xoay xong thi dung luot nay; antigravity vua khoi dong lai, luot sau moi giao task.
QUOTA=/usr/local/bin/tokmatrix-agent-quota
ROTATOR=/usr/local/bin/tokmatrix-rotator
ACCOUNT=""
[ -x "$ROTATOR" ] && ACCOUNT=$("$ROTATOR" active 2>/dev/null)
if [ -x "$QUOTA" ] && BLOCK=$("$QUOTA" check script ${ACCOUNT:+--account "$ACCOUNT"}); then
  UNTIL=${BLOCK%% *}; MODEL=${BLOCK#* }
  if [ -n "$ACCOUNT" ]; then
    log "$ACCOUNT het quota text ($MODEL), xoay tai khoan..."
    if "$ROTATOR" rotate --kind text --account "$ACCOUNT" --until "$UNTIL" --model "$MODEL"; then
      log "da xoay tai khoan, giao task o luot sau ($COUNT task trong inbox)"
    else
      log "khong con tai khoan co quota text ($COUNT task trong inbox)"
    fi
  else
    log "het quota model $MODEL, cho toi $(date -d "@$UNTIL" '+%H:%M') ($COUNT task trong inbox)"
  fi
  exit 0
fi

# 1b. Conversation KICH BAN truoc con dang chay (file .db cua no vua duoc ghi) -> bo qua, tranh chay chong.
#     Chi xet conversation cua chinh bridge nay (script.cids), KHONG xet conversation anh: bridge anh mo
#     conversation gan nhu moi phut, xet chung thi task kich ban nam cho qua 30 phut va bi danh loi.
#     Qua 15 phut ke tu lan giao truoc thi van giao lai, phong khi agent treo.
CONV_DIR=/opt/tokmatrix/.gemini/antigravity/conversations
STAMP=/run/tokmatrix-script-bridge.last
LAST_CID=$(tail -n1 /var/lib/tokmatrix-bridge/script.cids 2>/dev/null | awk '{print $2}')
if [ -n "$LAST_CID" ]; then
  BUSY=$(find "$CONV_DIR" -maxdepth 1 -name "${LAST_CID}.db*" -newermt "-60 seconds" 2>/dev/null | head -1)
else
  BUSY=$(find "$CONV_DIR" -type f -newermt "-60 seconds" 2>/dev/null | head -1)
fi
if [ -n "$BUSY" ]; then
  LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - LAST )) -lt 900 ]; then
    log "agent dang chay, bo qua luot nay ($COUNT task trong inbox)"
    exit 0
  fi
fi

# 2. language_server cua ban hub
LS_PID=$(pgrep -u tokmatrix -f "language_server --standalone.*subclient_type hub" | head -1)
if [ -z "$LS_PID" ]; then
  log "LOI: Antigravity chua chay (khong thay language_server)"
  exit 1
fi

# 3. CSRF token doc tu dong lenh
CSRF=$(tr '\0' '\n' < "/proc/$LS_PID/cmdline" | grep -A1 '^--csrf_token$' | tail -1)
if [ -z "$CSRF" ]; then
  log "LOI: khong doc duoc csrf_token tu PID $LS_PID"
  exit 1
fi

# 4. Project id: uu tien file cau hinh, khong co thi lay tu tien trinh scheduler
if [ -z "$PROJECT_ID" ]; then
  SCHED=$(pgrep -f "language_server multicall schedule" | head -1)
  [ -n "$SCHED" ] && PROJECT_ID=$(tr '\0' '\n' < "/proc/$SCHED/environ" | sed -n 's/^ANTIGRAVITY_PROJECT_ID=//p')
fi
if [ -z "$PROJECT_ID" ]; then
  log "LOI: thieu ANTIGRAVITY_PROJECT_ID. Dat vao $CONF"
  exit 1
fi

PROMPT='Read every .md task file in bkt_web/storage/script_bridge/inbox/. Each file asks for exactly one JSON document. For each task write the complete JSON exactly as the task instructs: follow its JSON schema, include every required field, return the exact number of items requested, and write in the requested output language. Save it with your file editing tool to the output path given in that task (bkt_web/storage/script_bridge/outbox/<task id>.json). The file must contain only the JSON object, no markdown fences. Do NOT run curl, wget, python or any script and do not call external services. Do not modify any other file. If the inbox is empty reply DONE.'

log "inbox co $COUNT task, dang giao cho agent"

# 5. Thu tung cong dang nghe cua language_server
LAST_ERR=""
for PORT in $(ss -tlnpH 2>/dev/null | grep "pid=$LS_PID," | sed 's/.*127\.0\.0\.1:\([0-9]*\).*/\1/' | sort -u); do
  OUT=$(sudo -u tokmatrix HOME=/opt/tokmatrix DISPLAY=:1 \
        ANTIGRAVITY_LS_ADDRESS="localhost:$PORT" \
        ANTIGRAVITY_CSRF_TOKEN="$CSRF" \
        ANTIGRAVITY_PROJECT_ID="$PROJECT_ID" \
        timeout 90 "$AGENTAPI" new-conversation --model=flash --title="Script bridge auto" "$PROMPT" 2>&1)
  if echo "$OUT" | grep -q '"conversationId"'; then
    CID=$(echo "$OUT" | sed -n 's/.*"conversationId": "\([^"]*\)".*/\1/p')
    date +%s > "$STAMP"
    [ -x "$QUOTA" ] && "$QUOTA" record script "$CID" $ACCOUNT
    log "OK - cong $PORT, conversation ${CID:0:8}"
    exit 0
  fi
  LAST_ERR=$(echo "$OUT" | tr -d '\n' | sed 's/.*"error": "\([^"]*\)".*/\1/' | cut -c1-160)
done

log "LOI: khong cong nao nhan lenh. Loi cuoi: $LAST_ERR"
exit 1
