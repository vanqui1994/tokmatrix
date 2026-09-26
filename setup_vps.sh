#!/usr/bin/env bash
# ==============================================================================
# BKT WORKSTATION & ANTIDETECT - ALL-IN-ONE SETUP SCRIPT FOR UBUNTU VPS
# Tự động cài đặt từ A-Z:
#   1. Cập nhật hệ thống & Thư viện cốt lõi (Python 3, Pip, Git, Curl, Build tools)
#   2. Cài đặt môi trường Màn hình ảo & Trực tiếp xem trình duyệt (Xvfb + Openbox + noVNC)
#   3. Cài đặt Playwright & Nhân Chromium Linux đầy đủ driver
#   4. Thiết lập Virtualenv & Các gói thư viện Python cần thiết
#   5. Tạo 2 Systemd Services tự khởi động cùng VPS (noVNC Desktop & Web Workstation)
#   6. Cấu hình Firewall UFW mở các cổng (22, 8080, 6080)
# ==============================================================================

set -e

# Màu sắc thông báo
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << "EOF"
  ____  _  _______  __          __         _        _        _   _             
 |  _ \| |/ /_   _| \ \        / /        | |      | |      | | (_)            
 | |_) | ' /  | |    \ \  /\  / /___  _ __| | _____| |_ __ _| |_ _  ___  _ __  
 |  _ <|  <   | |     \ \/  \/ // _ \| '__| |/ / __| __/ _` | __| |/ _ \| '_ \ 
 | |_) | . \  | |      \  /\  /| (_) | |  |   <\__ \ || (_| | |_| | (_) | | | |
 |____/|_|\_\ |_|       \/  \/  \___/|_|  |_|\_\___/\__\__,_|\__|_|\___/|_| |_|
EOF
echo -e "${GREEN}>>> BẮT ĐẦU CÀI ĐẶT HỆ THỐNG TOÀN DIỆN TRÊN UBUNTU VPS <<<${NC}\n"

# 1. Kiểm tra quyền Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[LỖI] Vui lòng chạy script này với quyền root: sudo bash setup_vps.sh${NC}"
  exit 1
fi

# Xác định thư mục cài đặt (nơi chứa script)
APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo -e "${BLUE}[1/7] Thư mục ứng dụng:${NC} ${APP_DIR}"

# Lấy IP Public của VPS
PUBLIC_IP=$(curl -s -4 ifconfig.me || curl -s -4 icanhazip.com || echo "IP_VPS")

# 2. Cập nhật hệ điều hành Ubuntu
echo -e "\n${YELLOW}[2/7] Đang cập nhật gói hệ thống Ubuntu (apt update)...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt update -y
apt upgrade -y

# 3. Cài đặt các gói phần mềm cần thiết
echo -e "\n${YELLOW}[3/7] Đang cài đặt Python, môi trường Desktop ảo & noVNC...${NC}"
apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libssl-dev \
    libffi-dev \
    git \
    curl \
    wget \
    ffmpeg \
    net-tools \
    ufw \
    xvfb \
    openbox \
    x11vnc \
    novnc \
    websockify

# 3.1 Cài đặt Google Chrome & Wireproxy cho Linux VPS
echo -e "\n${YELLOW}[3.1/7] Đang cài đặt Google Chrome & Wireproxy Linux...${NC}"
if ! command -v google-chrome &>/dev/null; then
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/trusted.gpg.d/google-chrome.gpg 2>/dev/null || true
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
    apt update -y >/dev/null 2>&1 || true
    apt install -y google-chrome-stable >/dev/null 2>&1 || true
fi

# Tự động tải wireproxy bản Linux phù hợp kiến trúc máy chủ
ARCH=$(uname -m)
WP_ARCH=""
if [ "$ARCH" = "x86_64" ]; then
    WP_ARCH="linux_amd64"
elif [ "$ARCH" = "aarch64" ]; then
    WP_ARCH="linux_arm64"
fi
if [ -n "$WP_ARCH" ]; then
    echo "Đang tải wireproxy cho kiến trúc $WP_ARCH..."
    mkdir -p "${APP_DIR}/bkt_web/bin"
    TMP_WP=$(mktemp -d)
    if curl -sL "https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_${WP_ARCH}.tar.gz" -o "${TMP_WP}/wp.tar.gz"; then
        tar -xzf "${TMP_WP}/wp.tar.gz" -C "${TMP_WP}" 2>/dev/null || true
        if [ -f "${TMP_WP}/wireproxy" ]; then
            install -m 755 "${TMP_WP}/wireproxy" /usr/local/bin/wireproxy
            install -m 755 "${TMP_WP}/wireproxy" "${APP_DIR}/bkt_web/bin/wireproxy"
            echo "Đã cài đặt wireproxy Linux thành công."
        fi
    fi
    rm -rf "${TMP_WP}"
fi

# 4. Thiết lập Python Virtual Environment
echo -e "\n${YELLOW}[4/7] Đang tạo môi trường ảo Python (venv) & cài thư viện...${NC}"
VENV_DIR="${APP_DIR}/venv"
if [ ! -d "${VENV_DIR}" ]; then
    python3 -m venv "${VENV_DIR}"
fi

# Kích hoạt venv
source "${VENV_DIR}/bin/activate"

# Cập nhật pip & cài đặt các gói cần thiết
pip install --upgrade pip
if [ -f "${APP_DIR}/requirements.txt" ]; then
    pip install -r "${APP_DIR}/requirements.txt"
fi

# Cài đặt thêm các thư viện bổ trợ cho automation & networking
pip install \
    fastapi==0.139.0 \
    uvicorn==0.50.2 \
    pydantic==2.13.4 \
    curl-cffi==0.16.3 \
    playwright>=1.52 \
    cryptography>=49 \
    httpx>=0.28 \
    Pillow>=10 \
    aiohttp \
    requests \
    psutil

# 5. Cài đặt Playwright Chromium & dependencies hệ thống
echo -e "\n${YELLOW}[5/7] Đang cài đặt nhân Chromium Playwright cùng toàn bộ codec/driver đồ họa...${NC}"
playwright install chromium --with-deps

# 6. Thiết lập Systemd Services tự chạy ngầm 24/7
echo -e "\n${YELLOW}[6/7] Đang cấu hình các dịch vụ Systemd (Tự khởi động cùng VPS)...${NC}"

# A. Dịch vụ Màn hình ảo & noVNC Live Stream
cat << EOF > /etc/systemd/system/tokmatrix-desktop.service
[Unit]
Description=Xvfb, Openbox and noVNC Web Streaming Desktop
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
Environment=DISPLAY=:1
ExecStartPre=-/usr/bin/killall Xvfb x11vnc websockify openbox
ExecStart=/bin/bash -c "Xvfb :1 -screen 0 1920x1080x24 & sleep 2 && openbox & sleep 1 && x11vnc -display :1 -nopw -listen localhost -xkb -ncache 10 -ncache_cr -forever -shared & sleep 1 && /usr/share/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# B. Dịch vụ Web Workstation chính
cat << EOF > /etc/systemd/system/tokmatrix-workstation.service
[Unit]
Description=TokMatrix & SSMATool Automation Workstation Server
After=network.target tokmatrix-desktop.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
Environment="PATH=${VENV_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="DISPLAY=:1"
Environment="PYTHONPATH=${APP_DIR}"
Environment="TOKMATRIX_CHROME_PATH=/usr/bin/google-chrome"
ExecStart=${VENV_DIR}/bin/python -m uvicorn bkt_web.server:app --host 0.0.0.0 --port 8080 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Nạp và kích hoạt services
systemctl daemon-reload
systemctl enable tokmatrix-desktop.service
systemctl restart tokmatrix-desktop.service

systemctl enable tokmatrix-workstation.service
systemctl restart tokmatrix-workstation.service

# 7. Cấu hình Firewall UFW (Mở cổng 22, 8080, 6080)
echo -e "\n${YELLOW}[7/7] Đang mở các cổng Firewall (22 SSH, 8080 Web UI, 6080 noVNC)...${NC}"
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 8080/tcp >/dev/null 2>&1 || true
ufw allow 6080/tcp >/dev/null 2>&1 || true

# Hoàn tất
echo -e "\n${GREEN}========================================================================${NC}"
echo -e "${GREEN}🎉 CHÚC MỪNG BẠN! TOÀN BỘ HỆ THỐNG ĐÃ ĐƯỢC THIẾT LẬP THÀNH CÔNG 24/7! 🎉${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo -e ""
echo -e "🌐 ${BLUE}1. TRANG QUẢN TRỊ WORKSTATION (Quản lý Nick, Kịch Bản, Reg Facebook):${NC}"
echo -e "   👉 ${YELLOW}http://${PUBLIC_IP}:8080${NC}"
echo -e ""
echo -e "🖥️ ${BLUE}2. XEM TRỰC TIẾP MÀN HÌNH TRÌNH DUYỆT (noVNC Live View):${NC}"
echo -e "   👉 ${YELLOW}http://${PUBLIC_IP}:6080/vnc.html${NC}"
echo -e "   (Bấm nút 'Connect' là nhìn thấy ngay màn hình VPS & các luồng Chrome đang click!)"
echo -e ""
echo -e "⚙️ ${BLUE}3. LỆNH QUẢN LÝ DỊCH VỤ TRÊN VPS KHI CẦN:${NC}"
echo -e "   • Xem log Web Workstation :  ${YELLOW}journalctl -u tokmatrix-workstation -f${NC}"
echo -e "   • Khởi động lại Web       :  ${YELLOW}systemctl restart tokmatrix-workstation${NC}"
echo -e "   • Khởi động lại Màn hình  :  ${YELLOW}systemctl restart tokmatrix-desktop${NC}"
echo -e "${GREEN}========================================================================${NC}\n"
