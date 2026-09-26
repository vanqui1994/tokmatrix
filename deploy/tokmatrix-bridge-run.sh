#!/usr/bin/env bash
# Giao task trong inbox cua bridge cho agent Antigravity, khong can GUI.
#
# agentapi doi ba bien:
#   ANTIGRAVITY_LS_ADDRESS  - cong gRPC cua language_server, doi moi lan khoi dong
#   ANTIGRAVITY_CSRF_TOKEN  - nam trong dong lenh cua chinh language_server
#   ANTIGRAVITY_PROJECT_ID  - id workspace, co dinh, luu o file cau hinh
set -uo pipefail

CONF=/etc/tokmatrix-bridge.conf
BR=/opt/tokmatrix/bkt_web/storage/antigravity_bridge
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
if [ -x "$QUOTA" ] && BLOCK=$("$QUOTA" check image ${ACCOUNT:+--account "$ACCOUNT"}); then
  UNTIL=${BLOCK%% *}; MODEL=${BLOCK#* }
  if [ -n "$ACCOUNT" ]; then
    log "$ACCOUNT het quota image ($MODEL), xoay tai khoan..."
    if "$ROTATOR" rotate --kind image --account "$ACCOUNT" --until "$UNTIL" --model "$MODEL"; then
      rm -f /run/tokmatrix-bridge/slots/slot-* 2>/dev/null
      log "da xoay tai khoan, giao task o luot sau ($COUNT task trong inbox)"
    else
      log "khong con tai khoan co quota image ($COUNT task trong inbox)"
    fi
  else
    log "het quota model $MODEL, cho toi $(date -d "@$UNTIL" '+%H:%M') ($COUNT task trong inbox)"
  fi
  exit 0
fi

# 1b. Chia inbox thanh SLOTS conversation chay song song. Moi conversation nhan DANH SACH
#     file cu the va chi lam dung danh sach do (truoc day mot conversation doc ca inbox,
#     chay ~30 phut, cac conversation khac phai cho). Slot ranh khi: het task cua no trong
#     inbox, qua SLOT_TIMEOUT_MIN, hoac language_server da doi PID (Antigravity khoi dong lai,
#     vi du sau khi xoay tai khoan -> conversation cu da chet).
SLOTS="${TOKMATRIX_BRIDGE_SLOTS:-3}"
PER_SLOT="${TOKMATRIX_BRIDGE_PER_SLOT:-8}"
SLOT_TIMEOUT_MIN="${TOKMATRIX_BRIDGE_SLOT_TIMEOUT_MIN:-25}"
SLOT_DIR=/run/tokmatrix-bridge/slots
mkdir -p "$SLOT_DIR"

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

# Slot file: dong 1 "<epoch> <ls_pid> <cid>", cac dong sau la task id.
ASSIGNED=""
BUSY=0
NOW=$(date +%s)
for f in "$SLOT_DIR"/slot-*; do
  [ -f "$f" ] || continue
  read -r T0 PID0 _CID < "$f"
  LEFT=0
  for id in $(tail -n +2 "$f"); do [ -f "$BR/inbox/$id.md" ] && LEFT=$((LEFT + 1)); done
  if [ "$PID0" != "$LS_PID" ] || [ "$LEFT" -eq 0 ] || [ $(( NOW - T0 )) -ge $(( SLOT_TIMEOUT_MIN * 60 )) ]; then
    rm -f "$f"
    continue
  fi
  BUSY=$((BUSY + 1))
  ASSIGNED="$ASSIGNED $(tail -n +2 "$f" | tr '\n' ' ')"
done

FREE_IDS=()
while IFS= read -r md; do
  id=$(basename "$md" .md)
  case " $ASSIGNED " in *" $id "*) continue ;; esac
  FREE_IDS+=("$id")
done < <(find "$BR/inbox" -maxdepth 1 -name 'task_*.md' | sort)

if [ "$BUSY" -ge "$SLOTS" ] || [ "${#FREE_IDS[@]}" -eq 0 ]; then
  log "$BUSY/$SLOTS conversation dang chay, ${#FREE_IDS[@]} task chua giao ($COUNT task trong inbox)"
  exit 0
fi

PORTS=$(ss -tlnpH 2>/dev/null | grep "pid=$LS_PID," | sed 's/.*127\.0\.0\.1:\([0-9]*\).*/\1/' | sort -u)

dispatch() {  # $1 slot, $2.. task ids
  local slot="$1"; shift
  local files="" id
  for id in "$@"; do files="$files $id.md"; done
  local prompt="Process ONLY these task files in bkt_web/storage/antigravity_bridge/inbox/:${files}. Ignore every other file in inbox (other agents handle them). Read each listed file; for each one you MUST call your generate_image tool to create the image, matching its Prompt and aspect ratio. Do NOT run curl, wget, python or any script. Do NOT use pollinations.ai or any external image service. After generate_image produces the image, copy that image file into bkt_web/storage/antigravity_bridge/outbox/ renamed to the task id with .png extension. If a listed file no longer exists, skip it. No text, no watermark. Do not modify any other file. When all listed tasks are done reply DONE."
  local port out cid
  for port in $PORTS; do
    out=$(sudo -u tokmatrix HOME=/opt/tokmatrix DISPLAY=:1 \
          ANTIGRAVITY_LS_ADDRESS="localhost:$port" \
          ANTIGRAVITY_CSRF_TOKEN="$CSRF" \
          ANTIGRAVITY_PROJECT_ID="$PROJECT_ID" \
          timeout 90 "$AGENTAPI" new-conversation --model=flash --title="Bridge auto $slot" "$prompt" 2>&1)
    if echo "$out" | grep -q '"conversationId"'; then
      cid=$(echo "$out" | sed -n 's/.*"conversationId": "\([^"]*\)".*/\1/p')
      { echo "$(date +%s) $LS_PID $cid"; printf '%s\n' "$@"; } > "$SLOT_DIR/slot-$slot"
      date +%s > "$STAMP"
      [ -x "$QUOTA" ] && "$QUOTA" record image "$cid" $ACCOUNT
      log "OK - slot $slot, cong $port, conversation ${cid:0:8}, $# task"
      return 0
    fi
    LAST_ERR=$(echo "$out" | tr -d '\n' | sed 's/.*"error": "\([^"]*\)".*/\1/' | cut -c1-160)
  done
  log "LOI: slot $slot khong cong nao nhan lenh. Loi cuoi: $LAST_ERR"
  return 1
}

STAMP=/run/tokmatrix-bridge.last
LAST_ERR=""
RC=0
POS=0
for slot in $(seq 1 "$SLOTS"); do
  [ -f "$SLOT_DIR/slot-$slot" ] && continue
  [ "$POS" -ge "${#FREE_IDS[@]}" ] && break
  BATCH=("${FREE_IDS[@]:$POS:$PER_SLOT}")
  POS=$((POS + ${#BATCH[@]}))
  dispatch "$slot" "${BATCH[@]}" || { RC=1; break; }
done
exit $RC
