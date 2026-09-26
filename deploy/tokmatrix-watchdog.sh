#!/usr/bin/env bash
# TokMatrix watchdog — cài thành /usr/local/bin/tokmatrix-watchdog, chạy mỗi 5 phút bằng
# tokmatrix-watchdog.timer (root). Không phụ thuộc server: gửi thẳng qua
# `python3 -m bkt_web.notify send` (đọc token trong key vault dưới quyền user tokmatrix).
#   · service (đã enable) trong WATCHDOG_SERVICES chết → 🚨 một lần; chạy lại → ✅ một lần
#   · web không trả lời HTTP dù service active → 🚨
#   · đĩa trống < MIN_FREE_GB (/etc/tokmatrix/optimize.env) → 💾, tối đa 1 lần/6 giờ
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/tokmatrix}"
APP_USER="${APP_USER:-tokmatrix}"
PY="${PY:-$APP_DIR/venv/bin/python}"
WATCHDOG_SERVICES="${WATCHDOG_SERVICES:-tokmatrix-web antigravity antigravity-ide}"
WEB_URL="${WEB_URL:-http://127.0.0.1:8080/api/compare-studio/status}"
MIN_FREE_GB=15
[ -r /etc/tokmatrix/optimize.env ] && . /etc/tokmatrix/optimize.env
[ -r /etc/tokmatrix/watchdog.env ] && . /etc/tokmatrix/watchdog.env
STATE=/run/tokmatrix/watchdog
mkdir -p "$STATE"
HOST="$(hostname)"
NL=$'\n'

send() {  # $1 severity, $2 text (HTML)
    (cd "$APP_DIR" && timeout 30 runuser -u "$APP_USER" -- "$PY" -m bkt_web.notify send --severity "$1" "$2") >/dev/null 2>&1
}

down_since() { [ -f "$STATE/$1.down" ] && cat "$STATE/$1.down"; }

check() {  # $1 tên, $2 ok(0/1), $3 mô tả lỗi
    local name="$1" ok="$2" why="$3" since
    since="$(down_since "$name")"
    if [ "$ok" = 0 ]; then
        if [ -n "$since" ]; then
            if [ ! -f "$STATE/$name.alerted" ] || send info "✅ <b>Đã chạy lại: $name</b>${NL}🖥️ $HOST${NL}🕐 Hỏng từ $since đến $(date '+%H:%M')"; then
                rm -f "$STATE/$name.down" "$STATE/$name.alerted"
            fi
        fi
        return
    fi
    [ -n "$since" ] || { since="$(date '+%d/%m %H:%M')"; echo "$since" > "$STATE/$name.down"; }
    [ -f "$STATE/$name.alerted" ] && return
    send critical "🚨 <b>Sự cố: $name</b>${NL}🖥️ $HOST${NL}💬 $why${NL}🕐 Từ $since" && touch "$STATE/$name.alerted"
}

for svc in $WATCHDOG_SERVICES; do
    # Chỉ theo dõi service đang được bật (antigravity hub và antigravity-ide chỉ dùng một trong hai).
    systemctl is-enabled --quiet "$svc" 2>/dev/null || { rm -f "$STATE/$svc.down" "$STATE/$svc.alerted"; continue; }
    if systemctl is-active --quiet "$svc"; then check "$svc" 0 ""; else check "$svc" 1 "không chạy"; fi
done

if systemctl is-active --quiet tokmatrix-web; then
    # Web có đăng nhập nên 401/302 vẫn là "đang sống"; chỉ lỗi kết nối/timeout (000) hoặc 5xx mới là hỏng.
    code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$WEB_URL" 2>/dev/null || true)"
    case "$code" in 000|5??|"") check web-http 1 "không trả lời HTTP (${code:-000})" ;; *) check web-http 0 "" ;; esac
fi

free_gb="$(df -P --block-size=1G "$APP_DIR" | awk 'NR==2 {print $4}')"
stamp="$STATE/disk.alerted"
if [ "${free_gb:-999}" -lt "$MIN_FREE_GB" ]; then
    if [ ! -f "$stamp" ] || [ -n "$(find "$stamp" -mmin +360)" ]; then
        send warn "💾 <b>Đĩa sắp đầy</b>${NL}🖥️ $HOST${NL}• Còn trống: <b>${free_gb} GB</b> (ngưỡng ${MIN_FREE_GB} GB)${NL}• Autopilot tạm dừng batch mới" && touch "$stamp"
    fi
else
    rm -f "$stamp"
fi
exit 0
