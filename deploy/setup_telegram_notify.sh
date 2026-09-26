#!/usr/bin/env bash
# Cài thông báo Telegram trên VPS (docs/PLAN_telegram_notifications.md). Chạy bằng root, lặp lại được.
#
#   printf '%s\n' "<token>" | sudo bash deploy/setup_telegram_notify.sh --token-stdin [--chat <chat_id>]
#   sudo bash deploy/setup_telegram_notify.sh --chat <chat_id> --test
#
# Token chỉ đi qua stdin → key vault (mã hoá bằng .secret.key); không nằm trong argv, log hay file env.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tokmatrix}"
APP_USER="${APP_USER:-tokmatrix}"
PY="$APP_DIR/venv/bin/python"
TOKEN_STDIN=0 CHAT="" TEST=0
while [ $# -gt 0 ]; do
    case "$1" in
        --token-stdin) TOKEN_STDIN=1 ;;
        --chat) CHAT="$2"; shift ;;
        --test) TEST=1 ;;
        *) echo "tham số lạ: $1" >&2; exit 2 ;;
    esac
    shift
done
[ "$(id -u)" = 0 ] || { echo "cần root" >&2; exit 1; }
cd "$APP_DIR"
as_app() { runuser -u "$APP_USER" -- "$PY" -m bkt_web.notify "$@"; }

if [ "$TOKEN_STDIN" = 1 ]; then
    as_app set-token
fi
if [ -n "$CHAT" ]; then
    as_app set-chat "$CHAT"
fi

install -m 0755 deploy/tokmatrix-watchdog.sh /usr/local/bin/tokmatrix-watchdog
cat > /etc/systemd/system/tokmatrix-watchdog.service <<'EOF'
[Unit]
Description=TokMatrix watchdog: bao Telegram khi service chet, web khong tra loi, dia thap

[Service]
Type=oneshot
ExecStart=/usr/local/bin/tokmatrix-watchdog
EOF
cat > /etc/systemd/system/tokmatrix-watchdog.timer <<'EOF'
[Unit]
Description=Chay tokmatrix-watchdog moi 5 phut

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now tokmatrix-watchdog.timer >/dev/null

as_app config
if [ "$TEST" = 1 ]; then
    as_app test
fi
echo "Xong. Server cần khởi động lại một lần (systemctl restart tokmatrix-web) để chạy sender/watcher."
