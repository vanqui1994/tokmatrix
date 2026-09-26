#!/usr/bin/env bash
# =============================================================================
#  TokMatrix / SSMATool - Provision an Ubuntu 22.04 / 24.04 VPS
# =============================================================================
#  Nguyên tắc bảo mật của script này:
#    - App bind 127.0.0.1, KHÔNG BAO GIỜ mở port 8080 ra Internet.
#      (middleware trong bkt_web/server.py cấp cookie phiên cho bất kỳ ai
#       truy cập "/", nên phơi 8080 ra ngoài = mất toàn bộ tài khoản TikTok)
#    - Nginx là lớp duy nhất nghe Internet, có HTTP Basic Auth + TLS.
#    - noVNC nghe localhost, x11vnc có mật khẩu, chỉ vào qua Nginx.
#    - Service chạy bằng user thường, không phải root.
#    - UFW default deny incoming, và ĐƯỢC BẬT.
#
#  Cách dùng:
#    sudo DOMAIN=tool.example.com ADMIN_USER=admin ADMIN_PASS='...' \
#         bash deploy/provision_vps.sh
#
#  Không có domain? Bỏ DOMAIN, truy cập qua SSH tunnel:
#    ssh -L 8080:127.0.0.1:8080 -L 6080:127.0.0.1:6080 user@IP
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------- cấu hình ---
APP_USER="${APP_USER:-tokmatrix}"
APP_DIR="${APP_DIR:-/opt/tokmatrix}"
DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-}"
ENABLE_VNC="${ENABLE_VNC:-1}"
HARDEN_SSH="${HARDEN_SSH:-0}"      # 1 = tắt password login + root login
SSH_PORT="${SSH_PORT:-22}"
TIMEZONE="${TIMEZONE:-Asia/Ho_Chi_Minh}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
step() { echo -e "\n${B}==>${N} ${Y}$*${N}"; }
ok()   { echo -e "  ${G}✓${N} $*"; }
die()  { echo -e "${R}[LỖI]${N} $*" >&2; exit 1; }

[ "$EUID" -eq 0 ] || die "Chạy với quyền root: sudo bash deploy/provision_vps.sh"
[ -f "${SRC_DIR}/requirements.txt" ] || die "Không tìm thấy requirements.txt tại ${SRC_DIR}"

if [ -z "$ADMIN_PASS" ]; then
    ADMIN_PASS="$(openssl rand -base64 18)"
    GENERATED_PASS=1
fi

export DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------ 1. hệ thống ---
step "[1/10] Cập nhật hệ thống & múi giờ"
timedatectl set-timezone "$TIMEZONE" 2>/dev/null || true
apt-get update -qq
apt-get upgrade -y -qq
ok "Hệ thống đã cập nhật, timezone = ${TIMEZONE}"

step "[2/10] Cài gói nền"
apt-get install -y -qq \
    python3 python3-venv python3-dev python3-pip \
    build-essential libssl-dev libffi-dev pkg-config \
    git curl wget ca-certificates gnupg \
    ffmpeg sqlite3 \
    nginx apache2-utils \
    ufw fail2ban unattended-upgrades \
    xvfb openbox x11vnc novnc websockify \
    fonts-liberation fonts-noto-color-emoji fonts-noto-cjk
ok "Đã cài gói nền"

# --------------------------------------------------------------- 2. swap ---
step "[3/10] Kiểm tra RAM / swap (Chromium cần bộ nhớ)"
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
echo "  RAM: ${RAM_MB}MB, swap hiện tại: ${SWAP_MB}MB"
# Swap luôn được tạo làm đệm chống OOM killer khi nhiều Chrome instance
# cùng spike RAM. Kích thước: 2GB nếu RAM nhỏ, 4GB nếu RAM >= 4GB.
if [ "$RAM_MB" -ge 4096 ]; then SWAP_SIZE_MB=4096; else SWAP_SIZE_MB=2048; fi
if [ "$SWAP_MB" -lt 1024 ] && [ ! -f /swapfile ]; then
    fallocate -l "${SWAP_SIZE_MB}M" /swapfile \
        || dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_SIZE_MB" status=none
    chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "Đã tạo swapfile ${SWAP_SIZE_MB}MB"
else
    ok "Swap đã có sẵn (${SWAP_MB}MB), bỏ qua"
fi
sysctl -qw vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

# ---------------------------------------------------------------- 3. user ---
step "[4/10] Tạo user ứng dụng '${APP_USER}'"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
    adduser --system --group --home "$APP_DIR" --shell /bin/bash "$APP_USER"
    ok "Đã tạo user hệ thống ${APP_USER}"
else
    ok "User ${APP_USER} đã tồn tại"
fi
mkdir -p "$APP_DIR"

# ------------------------------------------------------------ 4. mã nguồn ---
step "[5/10] Đồng bộ mã nguồn vào ${APP_DIR}"
if [ "$(readlink -f "$SRC_DIR")" != "$(readlink -f "$APP_DIR")" ]; then
    apt-get install -y -qq rsync
    rsync -a --delete \
        --exclude '.git' --exclude '.venv' --exclude 'venv' \
        --exclude '__pycache__' --exclude '*.pyc' \
        --exclude 'scratch/' --exclude '*.mp4' \
        --exclude 'bkt_web/storage/' --exclude '*.db' --exclude '*.db.bak-*' \
        "${SRC_DIR}/" "${APP_DIR}/"
    ok "Đã copy mã nguồn (giữ nguyên DB/storage nếu đã có trên VPS)"
fi
mkdir -p "${APP_DIR}/bkt_web/storage" "${APP_DIR}/data"
chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
chmod 750 "$APP_DIR"

# ----------------------------------------------------------- 5. python env ---
step "[6/10] Tạo virtualenv & cài thư viện Python"
VENV="${APP_DIR}/venv"
sudo -u "$APP_USER" python3 -m venv "$VENV" 2>/dev/null || python3 -m venv "$VENV"
chown -R "${APP_USER}:${APP_USER}" "$VENV"
sudo -u "$APP_USER" "$VENV/bin/pip" install --quiet --upgrade pip wheel
sudo -u "$APP_USER" "$VENV/bin/pip" install --quiet -r "${APP_DIR}/requirements.txt"
sudo -u "$APP_USER" "$VENV/bin/pip" install --quiet psutil requests aiohttp
ok "Đã cài thư viện Python"

step "[7/10] Cài Playwright Chromium + system deps"
"$VENV/bin/playwright" install-deps chromium
sudo -u "$APP_USER" PLAYWRIGHT_BROWSERS_PATH="${APP_DIR}/.playwright" \
    "$VENV/bin/playwright" install chromium
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/.playwright"
ok "Đã cài Chromium cho Playwright"

# wireproxy (tuỳ kiến trúc)
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64)  WP_ARCH="linux_amd64" ;;
    aarch64) WP_ARCH="linux_arm64" ;;
    *)       WP_ARCH="" ;;
esac
if [ -n "$WP_ARCH" ] && [ ! -x /usr/local/bin/wireproxy ]; then
    TMP="$(mktemp -d)"
    if curl -fsSL "https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_${WP_ARCH}.tar.gz" -o "${TMP}/wp.tgz"; then
        tar -xzf "${TMP}/wp.tgz" -C "$TMP" 2>/dev/null || true
        [ -f "${TMP}/wireproxy" ] && install -m 755 "${TMP}/wireproxy" /usr/local/bin/wireproxy && ok "Đã cài wireproxy"
    fi
    rm -rf "$TMP"
fi

# ------------------------------------------------------------ 6. systemd ---
step "[8/10] Cấu hình systemd services"

# --- màn hình ảo (chỉ nghe localhost) ---
if [ "$ENABLE_VNC" = "1" ]; then
    VNC_PASS_FILE="${APP_DIR}/.vncpasswd"
    if [ ! -f "$VNC_PASS_FILE" ]; then
        VNC_PLAIN="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-8)"
        x11vnc -storepasswd "$VNC_PLAIN" "$VNC_PASS_FILE" >/dev/null 2>&1
        echo "$VNC_PLAIN" > "${APP_DIR}/.vncpasswd.txt"
        chmod 600 "${APP_DIR}/.vncpasswd.txt"
    fi
    chown "${APP_USER}:${APP_USER}" "$VNC_PASS_FILE"; chmod 600 "$VNC_PASS_FILE"

    cat > /etc/systemd/system/tokmatrix-xvfb.service <<EOF
[Unit]
Description=TokMatrix virtual display (Xvfb)
After=network.target

[Service]
User=${APP_USER}
ExecStart=/usr/bin/Xvfb :1 -screen 0 1920x1080x24 -nolisten tcp
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    cat > /etc/systemd/system/tokmatrix-openbox.service <<EOF
[Unit]
Description=TokMatrix window manager
After=tokmatrix-xvfb.service
Requires=tokmatrix-xvfb.service

[Service]
User=${APP_USER}
Environment=DISPLAY=:1
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/openbox
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    cat > /etc/systemd/system/tokmatrix-x11vnc.service <<EOF
[Unit]
Description=TokMatrix VNC server (localhost only, password protected)
After=tokmatrix-openbox.service
Requires=tokmatrix-xvfb.service

[Service]
User=${APP_USER}
Environment=DISPLAY=:1
ExecStartPre=/bin/sleep 3
ExecStart=/usr/bin/x11vnc -display :1 -rfbauth ${VNC_PASS_FILE} -localhost -rfbport 5900 -xkb -forever -shared -noxdamage
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    cat > /etc/systemd/system/tokmatrix-novnc.service <<EOF
[Unit]
Description=TokMatrix noVNC websocket bridge (localhost only)
After=tokmatrix-x11vnc.service
Requires=tokmatrix-x11vnc.service

[Service]
User=${APP_USER}
ExecStart=/usr/bin/websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    ok "Đã tạo services màn hình ảo (Xvfb/Openbox/x11vnc/noVNC)"
fi

# --- web app (bind loopback) ---
cat > /etc/systemd/system/tokmatrix-web.service <<EOF
[Unit]
Description=TokMatrix / SSMATool web workstation
After=network-online.target$([ "$ENABLE_VNC" = "1" ] && echo " tokmatrix-xvfb.service")
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment="PATH=${VENV}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONPATH=${APP_DIR}"
Environment="PYTHONUNBUFFERED=1"
Environment="DISPLAY=:1"
Environment="PLAYWRIGHT_BROWSERS_PATH=${APP_DIR}/.playwright"
Environment="TOKMATRIX_PORT=8080"
Environment="TOKMATRIX_WIREPROXY_PATH=/usr/local/bin/wireproxy"
EnvironmentFile=-${APP_DIR}/.env
ExecStart=${VENV}/bin/python -m uvicorn bkt_web.server:app --host 127.0.0.1 --port 8080 --workers 1
Restart=always
RestartSec=5
LimitNOFILE=65535

# Hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=yes
ReadWritePaths=${APP_DIR}
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes

[Install]
WantedBy=multi-user.target
EOF
ok "Đã tạo tokmatrix-web.service (bind 127.0.0.1:8080)"

systemctl daemon-reload
if [ "$ENABLE_VNC" = "1" ]; then
    systemctl enable --now tokmatrix-xvfb tokmatrix-openbox tokmatrix-x11vnc tokmatrix-novnc >/dev/null 2>&1
fi
systemctl enable --now tokmatrix-web >/dev/null 2>&1
ok "Services đã bật và khởi động"

# -------------------------------------------------------------- 7. nginx ---
step "[9/10] Cấu hình Nginx (lớp auth + TLS duy nhất nghe Internet)"
htpasswd -bc /etc/nginx/.tokmatrix_htpasswd "$ADMIN_USER" "$ADMIN_PASS" >/dev/null 2>&1
chmod 640 /etc/nginx/.tokmatrix_htpasswd
chown root:www-data /etc/nginx/.tokmatrix_htpasswd

SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/sites-available/tokmatrix <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    client_max_body_size 512M;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;

    access_log /var/log/nginx/tokmatrix.access.log;
    error_log  /var/log/nginx/tokmatrix.error.log;

    location / {
        auth_basic "TokMatrix";
        auth_basic_user_file /etc/nginx/.tokmatrix_htpasswd;

        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }
EOF

if [ "$ENABLE_VNC" = "1" ]; then
cat >> /etc/nginx/sites-available/tokmatrix <<EOF

    location /vnc/ {
        auth_basic "TokMatrix VNC";
        auth_basic_user_file /etc/nginx/.tokmatrix_htpasswd;

        proxy_pass http://127.0.0.1:6080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }
EOF
fi

echo "}" >> /etc/nginx/sites-available/tokmatrix

ln -sf /etc/nginx/sites-available/tokmatrix /etc/nginx/sites-enabled/tokmatrix
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx đã cấu hình (Basic Auth user: ${ADMIN_USER})"

if [ -n "$DOMAIN" ]; then
    apt-get install -y -qq certbot python3-certbot-nginx
    CERTBOT_ARGS=(--nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect)
    if [ -n "$LETSENCRYPT_EMAIL" ]; then
        CERTBOT_ARGS+=(-m "$LETSENCRYPT_EMAIL")
    else
        CERTBOT_ARGS+=(--register-unsafely-without-email)
    fi
    if certbot "${CERTBOT_ARGS[@]}"; then
        ok "HTTPS đã bật cho ${DOMAIN} (tự gia hạn qua certbot.timer)"
    else
        echo -e "  ${Y}!${N} Certbot thất bại — kiểm tra DNS của ${DOMAIN} đã trỏ về VPS chưa, rồi chạy lại: certbot --nginx -d ${DOMAIN}"
    fi
fi

# ------------------------------------------------- 8. firewall & bảo mật ---
step "[10/10] Firewall, fail2ban, auto-update"
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "${SSH_PORT}/tcp" comment 'SSH' >/dev/null
ufw allow 80/tcp  comment 'HTTP'  >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "UFW bật: chỉ mở ${SSH_PORT}, 80, 443 (8080 & 6080 KHÔNG ra Internet)"

cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ${SSH_PORT}

[nginx-http-auth]
enabled = true
EOF
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban
ok "fail2ban đang chạy (chặn brute-force SSH & Basic Auth)"

dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
ok "Bản vá bảo mật tự động đã bật"

if [ "$HARDEN_SSH" = "1" ]; then
    KEY_COUNT=0
    for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
        [ -f "$f" ] && KEY_COUNT=$((KEY_COUNT + $(grep -c '^ssh-' "$f" 2>/dev/null || echo 0)))
    done
    if [ "$KEY_COUNT" -gt 0 ]; then
        cat > /etc/ssh/sshd_config.d/99-tokmatrix.conf <<EOF
PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
EOF
        sshd -t && systemctl reload ssh 2>/dev/null || systemctl reload sshd
        ok "SSH đã siết: chỉ đăng nhập bằng key"
    else
        echo -e "  ${R}!${N} BỎ QUA siết SSH — không tìm thấy authorized_keys nào."
        echo -e "    Tắt password login lúc này sẽ khoá bạn ra khỏi VPS."
    fi
else
    echo -e "  ${Y}!${N} SSH vẫn cho phép đăng nhập bằng mật khẩu."
    echo -e "    Sau khi thêm SSH key, chạy lại với HARDEN_SSH=1 để siết."
fi

# ----------------------------------------------------------------- xong ---
PUBLIC_IP="$(curl -s -4 --max-time 5 ifconfig.me || echo 'IP_VPS')"
URL_BASE="${DOMAIN:+https://$DOMAIN}"
URL_BASE="${URL_BASE:-http://$PUBLIC_IP}"

echo -e "\n${G}=====================================================================${N}"
echo -e "${G} HOÀN TẤT${N}"
echo -e "${G}=====================================================================${N}"
echo -e "  Dashboard : ${Y}${URL_BASE}/${N}"
[ "$ENABLE_VNC" = "1" ] && echo -e "  Màn hình  : ${Y}${URL_BASE}/vnc/vnc.html?path=vnc/websockify${N}"
echo -e "  Đăng nhập : ${Y}${ADMIN_USER}${N} / ${Y}${ADMIN_PASS}${N}"
[ "${GENERATED_PASS:-0}" = "1" ] && echo -e "              ${R}(mật khẩu tự sinh — lưu lại ngay)${N}"
[ "$ENABLE_VNC" = "1" ] && [ -f "${APP_DIR}/.vncpasswd.txt" ] && \
    echo -e "  Mật khẩu VNC: ${Y}$(cat "${APP_DIR}/.vncpasswd.txt")${N}"
echo -e ""
echo -e "  Lệnh hay dùng:"
echo -e "    journalctl -u tokmatrix-web -f        # xem log app"
echo -e "    systemctl restart tokmatrix-web       # khởi động lại app"
echo -e "    systemctl status tokmatrix-web        # trạng thái"
echo -e "    ufw status verbose                    # kiểm tra firewall"
echo -e ""
[ -z "$DOMAIN" ] && echo -e "  ${R}CẢNH BÁO:${N} chưa có domain nên đang chạy HTTP — mật khẩu Basic Auth"
[ -z "$DOMAIN" ] && echo -e "  đi qua mạng dưới dạng rõ. Trỏ một domain về VPS rồi chạy lại với"
[ -z "$DOMAIN" ] && echo -e "  DOMAIN=... để bật HTTPS, hoặc chỉ truy cập qua SSH tunnel:"
[ -z "$DOMAIN" ] && echo -e "    ${Y}ssh -L 8080:127.0.0.1:8080 -L 6080:127.0.0.1:6080 root@${PUBLIC_IP}${N}"
echo -e "${G}=====================================================================${N}\n"
