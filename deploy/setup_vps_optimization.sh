#!/usr/bin/env bash
# =============================================================================
# setup_vps_optimization.sh — tối ưu VPS Ubuntu cho TokMatrix: FastAPI + ~200 Chrome profile
# + render HyperFrames (Chrome headless + ffmpeg) + agent Antigravity sinh ảnh/kịch bản.
# Tự tính giới hạn theo CPU/RAM thật của máy (4/8, 6/12… đều dùng được, không sửa tay).
#
#   sudo bash deploy/setup_vps_optimization.sh            # áp dụng
#   sudo bash deploy/setup_vps_optimization.sh --dry-run  # chỉ in, không đổi gì
#   sudo bash deploy/setup_vps_optimization.sh --status   # xem trạng thái hiện tại
#
# Chạy lại nhiều lần an toàn (idempotent). File cũ được sao lưu vào
# /var/backups/tokmatrix-opt-<thời gian>/ trước khi ghi đè.
#
# Script KHÔNG restart tokmatrix-web, KHÔNG kill Chrome, KHÔNG swapoff swap đang
# dùng. Profile Chrome đang mở (SingletonLock còn sống) được bỏ qua khi dọn cache.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------- cấu hình ---
APP_USER="${APP_USER:-tokmatrix}"
APP_DIR="${APP_DIR:-/opt/tokmatrix}"
APP_SERVICE="${APP_SERVICE:-tokmatrix-web}"
CPUS="$(nproc)"
TOTAL_MB="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"          # 4 khuyến nghị; 8 nếu muốn dư dả
SWAPFILE="${SWAPFILE:-/swapfile}"
SHM_MIN_GB="${SHM_MIN_GB:-2}"              # /dev/shm nhỏ hơn mức này thì nới
SHM_SIZE_GB="${SHM_SIZE_GB:-3}"
MIN_FREE_GB="${MIN_FREE_GB:-15}"           # ngưỡng cảnh báo / chặn batch mới
MATRIX_WORKERS="${MATRIX_WORKERS:-3}"      # worker mỗi batch (kịch bản/ảnh/TTS song song; render đã giới hạn riêng)
# Render toàn máy: số video render cùng lúc cho MỌI batch (khoá dùng chung trong app) ≈ nửa số CPU.
RENDER_SLOTS="${RENDER_SLOTS:-$(( CPUS / 2 > 0 ? CPUS / 2 : 1 ))}"
# RAM giữ lại ngoài web: agent Antigravity (~2.1 GB đo được) và OS/SSH/X.
AGENT_RESERVE_MB="${AGENT_RESERVE_MB:-2560}"
OS_RESERVE_MB="${OS_RESERVE_MB:-800}"
APP_MEMORY_MAX="${APP_MEMORY_MAX:-$(( TOTAL_MB - AGENT_RESERVE_MB - OS_RESERVE_MB ))M}"        # trần cứng của web
APP_MEMORY_HIGH="${APP_MEMORY_HIGH:-$(( TOTAL_MB - AGENT_RESERVE_MB - OS_RESERVE_MB - 512 ))M}" # chỉ ép reclaim khi sát trần
APP_SWAP_MAX_GB="${APP_SWAP_MAX_GB:-$(( SWAP_SIZE_GB / 2 > 0 ? SWAP_SIZE_GB / 2 : 1 ))}"      # nửa swap, chừa cho agent/OS
AGENT_SERVICE="${AGENT_SERVICE:-antigravity}"
AGENT_MEMORY_LOW="${AGENT_MEMORY_LOW:-2G}" # kernel ưu tiên giữ RAM cho agent, không đẩy ra swap trước
APPLY_APP_CONFIG="${APPLY_APP_CONFIG:-1}"  # 1 = đặt min_free_disk_gb/matrix_workers qua store.set_config (có kiểm tra)
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}" # tuỳ chọn: webhook Discord/Slack (JSON {"text","content"}), KHÔNG dùng cho Telegram
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}" # tuỳ chọn: cảnh báo Telegram qua Bot API sendMessage
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

DRY_RUN=0
MODE=apply
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --status)  MODE=status ;;
        -h|--help) sed -n 2,15p "$0"; exit 0 ;;
        *) echo "Tham số không hợp lệ: $arg" >&2; exit 2 ;;
    esac
done

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/var/backups/tokmatrix-opt-${TS}"
CONF_DIR=/etc/tokmatrix
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
step() { echo -e "\n${B}==>${N} ${Y}$*${N}"; }
ok()   { echo -e "  ${G}✓${N} $*"; }
warn() { echo -e "  ${Y}!${N} $*"; }
die()  { echo -e "${R}[LỖI]${N} $*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then echo "  [dry-run] $*"; else "$@"; fi; }

# Ghi file có sao lưu; bỏ qua nếu nội dung không đổi.
put_file() {
    local path="$1" mode="${2:-0644}" tmp
    tmp="$(mktemp)"; cat > "$tmp"
    if [ -f "$path" ] && cmp -s "$tmp" "$path"; then
        rm -f "$tmp"; ok "Không đổi: $path"; return 0
    fi
    if [ "$DRY_RUN" = 1 ]; then
        echo "  [dry-run] ghi $path:"; sed 's/^/      /' "$tmp"; rm -f "$tmp"; return 0
    fi
    if [ -e "$path" ]; then
        mkdir -p "$BACKUP_DIR$(dirname "$path")"
        cp -a "$path" "$BACKUP_DIR$path"
    fi
    mkdir -p "$(dirname "$path")"
    install -m "$mode" "$tmp" "$path"; rm -f "$tmp"
    ok "Đã ghi: $path"
}

free_gb() { df -P --block-size=1G "$1" | awk 'NR==2 {print $4}'; }

# ------------------------------------------------------------------ status ---
show_status() {
    step "Trạng thái hiện tại"
    echo "  CPU: $(nproc) vCPU | RAM: $(free -h | awk '/Mem:/ {print $2}') | load: $(cut -d' ' -f1-3 /proc/loadavg)"
    free -h | sed 's/^/  /'
    echo "  Swap:"; swapon --show 2>/dev/null | sed 's/^/    /' || true
    echo "  /dev/shm: $(df -h /dev/shm | awk 'NR==2 {print $2" (dùng "$3")"}')"
    for k in vm.swappiness vm.vfs_cache_pressure vm.max_map_count net.core.somaxconn \
             fs.file-max fs.inotify.max_user_watches net.ipv4.tcp_congestion_control; do
        printf "  %-36s %s\n" "$k" "$(sysctl -n "$k" 2>/dev/null || echo '?')"
    done
    echo "  ulimit -n (shell này): $(ulimit -n)"
    if systemctl list-unit-files "${APP_SERVICE}.service" >/dev/null 2>&1; then
        systemctl show "$APP_SERVICE" -p LimitNOFILE -p MemoryHigh -p MemoryMax -p MemorySwapMax -p CPUWeight -p OOMPolicy 2>/dev/null | sed 's/^/  /'
        local pid; pid="$(systemctl show -p MainPID --value "$APP_SERVICE" 2>/dev/null || echo 0)"
        [ "${pid:-0}" != 0 ] && echo "  nofile thực tế của PID $pid: $(awk '/open files/ {print $4}' "/proc/$pid/limits")"
        local cg="/sys/fs/cgroup/system.slice/${APP_SERVICE}.service"
        if [ -r "$cg/memory.current" ]; then
            echo "  web RAM: $(( $(cat "$cg/memory.current") / 1048576 )) MB | swap: $(( $(cat "$cg/memory.swap.current" 2>/dev/null || echo 0) / 1048576 )) MB"
            echo "  web memory.events (high = số lần chạm MemoryHigh, oom_kill = bị giết vì hết RAM): $(grep -E '^(high|max|oom_kill) ' "$cg/memory.events" | tr '\n' ' ')"
        fi
        echo "  ${AGENT_SERVICE}: $(systemctl is-active "$AGENT_SERVICE" 2>/dev/null) · RAM $(( $(systemctl show "$AGENT_SERVICE" -p MemoryCurrent --value 2>/dev/null | grep -E '^[0-9]+$' || echo 0) / 1048576 )) MB · MemoryLow $(systemctl show "$AGENT_SERVICE" -p MemoryLow --value 2>/dev/null)"
        echo "  render đang chạy: $(pgrep -fc 'hyperframes.* render' 2>/dev/null || echo 0) tiến trình · slot đang giữ: $(ls "$APP_DIR/compare_studio/.runtime/render-slots" 2>/dev/null | wc -l)/${RENDER_SLOTS}"
    fi
    echo "  Journal: $(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[KMGT]' | head -1)"
    df -h / "$APP_DIR" 2>/dev/null | sed 's/^/  /' | uniq
    echo "  Chrome đang chạy: $(pgrep -c -f 'chrom(e|ium)' 2>/dev/null || true) tiến trình | ffmpeg: $(pgrep -c ffmpeg 2>/dev/null || true)"
}

if [ "$MODE" = status ]; then show_status; exit 0; fi

# --------------------------------------------------------------- preflight ---
step "[0/7] Kiểm tra điều kiện an toàn"
[ "$(id -u)" = 0 ] || die "Cần chạy bằng root (sudo)."
[ -r /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = ubuntu ] || die "Script chỉ hỗ trợ Ubuntu (phát hiện: ${ID:-không rõ})."
command -v systemctl >/dev/null || die "Không có systemd."
[ -d /sys/fs/cgroup ] && [ -f /sys/fs/cgroup/cgroup.controllers ] \
    || warn "Không phải cgroup v2 — MemoryHigh/MemoryMax có thể không có hiệu lực."
if systemd-detect-virt -c >/dev/null 2>&1; then
    die "Đang ở trong container ($(systemd-detect-virt -c)); swap/sysctl phải chỉnh ở host."
fi
ok "Ubuntu ${VERSION_ID:-?}, $(nproc) vCPU, $(awk '/MemTotal/ {printf "%.1f GB", $2/1048576}' /proc/meminfo) RAM"
id "$APP_USER" >/dev/null 2>&1 || warn "Không có user $APP_USER — bỏ qua phần limits theo user."
[ -d "$APP_DIR" ] || warn "Không có $APP_DIR — phần dọn cache/disk guard vẫn cài nhưng sẽ không tìm thấy profile."
ROOT_FREE="$(free_gb /)"
ok "Dung lượng trống trên /: ${ROOT_FREE} GB"
[ "$DRY_RUN" = 1 ] && warn "Chế độ DRY-RUN: không thay đổi gì."
if [ "$DRY_RUN" = 0 ]; then mkdir -p "$BACKUP_DIR"; ok "Sao lưu file cũ vào $BACKUP_DIR"; fi

# -------------------------------------------------------------------- swap ---
step "[1/7] Swap ${SWAP_SIZE_GB} GB + tham số bộ nhớ"
CUR_SWAP_GB="$(awk '/SwapTotal/ {printf "%d", $2/1048576 + 0.5}' /proc/meminfo)"
FS_TYPE="$(stat -f -c %T "$(dirname "$SWAPFILE")")"
if [ "$CUR_SWAP_GB" -ge "$SWAP_SIZE_GB" ]; then
    ok "Đã có ${CUR_SWAP_GB} GB swap — giữ nguyên."
elif swapon --show=NAME --noheadings | grep -qx "$SWAPFILE"; then
    warn "$SWAPFILE đang hoạt động nhưng nhỏ hơn mục tiêu. Không swapoff khi server đang chạy (có thể gây OOM)."
    warn "Muốn đổi kích thước: làm lúc rảnh — swapoff $SWAPFILE && rm $SWAPFILE rồi chạy lại script."
elif [ -e "$SWAPFILE" ]; then
    die "$SWAPFILE đã tồn tại nhưng không phải swap đang dùng — kiểm tra tay trước."
elif [ "$FS_TYPE" = btrfs ] || [ "$FS_TYPE" = zfs ]; then
    warn "Filesystem $FS_TYPE cần tạo swapfile theo cách riêng — bỏ qua."
elif [ "$ROOT_FREE" -lt $((SWAP_SIZE_GB + MIN_FREE_GB + 2)) ]; then
    warn "Chỉ còn ${ROOT_FREE} GB; tạo swap ${SWAP_SIZE_GB} GB sẽ xuống dưới ngưỡng ${MIN_FREE_GB} GB — bỏ qua."
else
    if [ "$DRY_RUN" = 1 ]; then
        echo "  [dry-run] tạo $SWAPFILE ${SWAP_SIZE_GB}G, mkswap, swapon, thêm vào /etc/fstab"
    else
        fallocate -l "${SWAP_SIZE_GB}G" "$SWAPFILE" 2>/dev/null \
            || dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SWAP_SIZE_GB * 1024)) status=progress
        chmod 600 "$SWAPFILE"
        mkswap "$SWAPFILE" >/dev/null
        if ! swapon "$SWAPFILE" 2>/dev/null; then
            # fallocate có thể tạo file thưa trên vài FS → tạo lại bằng dd
            rm -f "$SWAPFILE"
            dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SWAP_SIZE_GB * 1024)) status=progress
            chmod 600 "$SWAPFILE"; mkswap "$SWAPFILE" >/dev/null; swapon "$SWAPFILE"
        fi
        ok "Đã bật swap $SWAPFILE"
    fi
fi
# Swapfile đang dùng mà chưa có trong fstab thì mất sau reboot
if [ -f "$SWAPFILE" ] && swapon --show=NAME --noheadings | grep -qx "$SWAPFILE" \
        && ! grep -qE "^${SWAPFILE}[[:space:]]" /etc/fstab; then
    if [ "$DRY_RUN" = 1 ]; then echo "  [dry-run] thêm '$SWAPFILE none swap sw 0 0' vào /etc/fstab"
    else
        cp -a /etc/fstab "$BACKUP_DIR/fstab"
        echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab; ok "Đã thêm swap vào /etc/fstab"
    fi
fi

# ------------------------------------------------------------------ sysctl ---
BBR_LINES=""
if modprobe -n tcp_bbr 2>/dev/null || grep -qw bbr /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null; then
    BBR_LINES=$'net.core.default_qdisc = fq\nnet.ipv4.tcp_congestion_control = bbr'
    run modprobe tcp_bbr 2>/dev/null || true
    put_file /etc/modules-load.d/tokmatrix-bbr.conf <<<"tcp_bbr"
fi
# Chỉ nâng, không hạ giá trị đã được đặt cao hơn (vd. max_map_count=1048576 từ file khác)
at_least() { local cur; cur="$(sysctl -n "$1" 2>/dev/null || echo 0)"; [ "$cur" -gt "$2" ] 2>/dev/null && echo "$cur" || echo "$2"; }
MAP_COUNT="$(at_least vm.max_map_count 262144)"
FILE_MAX="$(at_least fs.file-max 2097152)"
NR_OPEN="$(at_least fs.nr_open 1048576)"
put_file /etc/sysctl.d/60-tokmatrix.conf <<EOF
# TokMatrix — tối ưu cho Chrome profile + render video (quản lý bởi setup_vps_optimization.sh)

# --- Bộ nhớ ---
vm.swappiness = 10
vm.vfs_cache_pressure = 50
# Chromium/V8 tạo rất nhiều vùng mmap; mặc định 65530 dễ gây crash "Aw, Snap"
vm.max_map_count = ${MAP_COUNT}
# ffmpeg ghi file lớn: đẩy dirty page sớm để tránh đứng I/O cả server
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15
# Giữ sẵn RAM trống cho kernel, tránh treo khi cấp phát dồn dập
vm.min_free_kbytes = 65536

# --- File / inotify (mỗi Chrome dùng nhiều watch và fd) ---
fs.file-max = ${FILE_MAX}
fs.nr_open = ${NR_OPEN}
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 1024

# --- Mạng ---
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 10240 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_mtu_probing = 1
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
${BBR_LINES}
EOF
if [ "$DRY_RUN" = 0 ]; then
    sysctl --system >/dev/null 2>&1 || sysctl -p /etc/sysctl.d/60-tokmatrix.conf >/dev/null
    ok "Đã nạp sysctl (swappiness=$(sysctl -n vm.swappiness), max_map_count=$(sysctl -n vm.max_map_count))"
fi

# --------------------------------------------------------------- /dev/shm ---
step "[2/7] /dev/shm cho Chromium"
SHM_GB="$(df -P --block-size=1G /dev/shm | awk 'NR==2 {print $2}')"
if [ "$SHM_GB" -ge "$SHM_MIN_GB" ]; then
    ok "/dev/shm = ${SHM_GB} GB (đủ, không đổi). Ubuntu mặc định 50% RAM."
else
    warn "/dev/shm chỉ ${SHM_GB} GB → nới lên ${SHM_SIZE_GB} GB"
    run cp -a /etc/fstab "$BACKUP_DIR/fstab.shm" 2>/dev/null || true
    if [ "$DRY_RUN" = 1 ]; then
        echo "  [dry-run] fstab: tmpfs /dev/shm tmpfs defaults,nosuid,nodev,size=${SHM_SIZE_GB}G 0 0; mount -o remount"
    else
        sed -i '\#^[^#]*[[:space:]]/dev/shm[[:space:]]#d' /etc/fstab
        echo "tmpfs /dev/shm tmpfs defaults,nosuid,nodev,size=${SHM_SIZE_GB}G 0 0" >> /etc/fstab
        mount -o "remount,size=${SHM_SIZE_GB}G" /dev/shm
        ok "/dev/shm = $(df -h /dev/shm | awk 'NR==2 {print $2}')"
    fi
fi
# tmpfs chỉ tốn RAM khi thật sự dùng; nếu vẫn crash, launch Chromium với --disable-dev-shm-usage.

# ------------------------------------------------------------------ limits ---
step "[3/7] File descriptors (nofile 65535)"
put_file /etc/security/limits.d/90-tokmatrix.conf <<EOF
# TokMatrix: nhiều Chrome profile + socket cùng lúc
*           soft  nofile  65535
*           hard  nofile  65535
root        soft  nofile  65535
root        hard  nofile  65535
${APP_USER} soft  nproc   32768
${APP_USER} hard  nproc   32768
EOF
grep -qs pam_limits.so /etc/pam.d/common-session /etc/pam.d/sshd \
    || warn "pam_limits.so chưa có trong /etc/pam.d/common-session (limits.conf sẽ không áp cho SSH login)."
put_file /etc/systemd/system.conf.d/90-tokmatrix-limits.conf <<'EOF'
[Manager]
DefaultLimitNOFILE=65535:524288
EOF
put_file /etc/systemd/user.conf.d/90-tokmatrix-limits.conf <<'EOF'
[Manager]
DefaultLimitNOFILE=65535:524288
EOF

# -------------------------------------------------- resource control / OOM ---
step "[4/7] Điều tiết CPU/RAM cho ${APP_SERVICE} và bảo vệ SSH"
# Toàn bộ Chrome/ffmpeg là con của uvicorn nên nằm trong cgroup của service.
# MemoryMax giữ OOM trong cgroup này → kernel kill renderer Chrome/ffmpeg thay vì sshd.
# OOMPolicy=continue: một tiến trình con bị OOM kill không làm dừng cả web server.
put_file "/etc/systemd/system/${APP_SERVICE}.service.d/90-resources.conf" <<EOF
[Service]
LimitNOFILE=65535
LimitNPROC=32768
TasksMax=16384
MemoryHigh=${APP_MEMORY_HIGH}
MemoryMax=${APP_MEMORY_MAX}
MemorySwapMax=${APP_SWAP_MAX_GB}G
OOMPolicy=continue
CPUWeight=80
IOWeight=80
Nice=5
# Số video render cùng lúc cho mọi batch-matrix (compare_studio/matrix/render/render-slots.mjs)
Environment=MATRIX_RENDER_SLOTS=${RENDER_SLOTS}
EOF
# Agent Antigravity (sinh ảnh + viết kịch bản) nằm NGOÀI cgroup web: giữ RAM cho nó để không bị đẩy ra
# swap khi render nặng — agent chậm là cả pipeline chậm.
if systemctl list-unit-files "${AGENT_SERVICE}.service" 2>/dev/null | grep -q "^${AGENT_SERVICE}.service"; then
    put_file "/etc/systemd/system/${AGENT_SERVICE}.service.d/90-tokmatrix-memory.conf" <<EOF
[Service]
MemoryLow=${AGENT_MEMORY_LOW}
EOF
fi
for unit in ssh sshd; do
    if systemctl list-unit-files "${unit}.service" 2>/dev/null | grep -q "^${unit}.service"; then
        put_file "/etc/systemd/system/${unit}.service.d/90-priority.conf" <<'EOF'
[Service]
OOMScoreAdjust=-1000
CPUWeight=1000
IOWeight=1000
EOF
    fi
done
if [ "$DRY_RUN" = 0 ]; then
    systemctl daemon-reload
    # MemoryHigh/Max/CPUWeight có hiệu lực ngay sau daemon-reload; LimitNOFILE/Nice cần restart lần sau.
    ok "daemon-reload xong. Memory*/CPUWeight có hiệu lực ngay; LimitNOFILE/Nice/MATRIX_RENDER_SLOTS áp dụng ở lần restart ${APP_SERVICE} kế tiếp."
    ok "Web: MemoryHigh=${APP_MEMORY_HIGH} MemoryMax=${APP_MEMORY_MAX} MemorySwapMax=${APP_SWAP_MAX_GB}G · render ${RENDER_SLOTS} slot · ${AGENT_SERVICE} MemoryLow=${AGENT_MEMORY_LOW}"
fi

# ----------------------------------------------------------------- journald ---
step "[5/7] Giới hạn log journald"
put_file /etc/systemd/journald.conf.d/90-tokmatrix.conf <<'EOF'
[Journal]
SystemMaxUse=500M
SystemKeepFree=2G
SystemMaxFileSize=50M
MaxRetentionSec=14day
Compress=yes
EOF
if [ "$DRY_RUN" = 0 ]; then
    systemctl restart systemd-journald
    journalctl --vacuum-size=500M >/dev/null 2>&1 || true
    ok "Journal hiện dùng: $(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[KMGT]' | head -1)"
fi
put_file /etc/logrotate.d/tokmatrix <<EOF
${APP_DIR}/*.log ${APP_DIR}/bkt_web/*.log ${APP_DIR}/bkt_web/storage/*.log ${APP_DIR}/bkt_web/logs/*.log {
    daily
    rotate 7
    maxsize 100M
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su ${APP_USER} ${APP_USER}
}
EOF

# -------------------------------------------- dọn cache Chrome + disk guard ---
step "[6/7] Dọn cache Chrome định kỳ + cảnh báo dung lượng < ${MIN_FREE_GB} GB"
put_file "$CONF_DIR/optimize.env" 0640 <<EOF
APP_USER="${APP_USER}"
APP_DIR="${APP_DIR}"
MIN_FREE_GB="${MIN_FREE_GB}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID}"
# Thư mục gốc chứa profile ngoài danh sách trong DB (cách nhau dấu cách), tuỳ chọn:
EXTRA_PROFILE_ROOTS=""
EOF

put_file /usr/local/bin/tokmatrix-chrome-cache-clean 0755 <<'SCRIPT'
#!/usr/bin/env bash
# Xoá cache tái tạo được của Chrome trong các profile; giữ Cookies, Local Storage,
# IndexedDB, Session Storage, Login Data. Bỏ qua profile đang được Chrome mở.
#   tokmatrix-chrome-cache-clean [--dry-run]
set -uo pipefail
. /etc/tokmatrix/optimize.env
DRY=0; [ "${1:-}" = --dry-run ] && DRY=1
exec 9>/run/lock/tokmatrix-chrome-cache-clean.lock
flock -n 9 || { echo "Đang có tiến trình dọn khác chạy"; exit 0; }

log() { logger -t tokmatrix-cache "$*"; echo "$*"; }
DB="$APP_DIR/bkt_web/bkt_channels.db"

list_profiles() {
    # 1) profile_dir của từng kênh trong DB (nguồn chính)
    if [ -f "$DB" ]; then
        python3 - "$DB" <<'PY' 2>/dev/null
import sqlite3, sys
con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True, timeout=5)
try:
    for (p,) in con.execute("SELECT DISTINCT profile_dir FROM channels WHERE profile_dir IS NOT NULL AND profile_dir != ''"):
        print(p)
except sqlite3.Error:
    pass
PY
    fi
    # 2) thư mục gốc bổ sung: mọi user-data-dir có file "Local State" (sâu tối đa 3 cấp)
    for root in ${EXTRA_PROFILE_ROOTS:-}; do
        [ -d "$root" ] && find "$root" -maxdepth 3 -name 'Local State' -type f -printf '%h\n' 2>/dev/null
    done
}

in_use() {
    local dir="$1" lock pid
    lock="$dir/SingletonLock"
    if [ -L "$lock" ]; then
        pid="$(readlink "$lock" | sed 's/.*-//')"
        if [ -n "$pid" ] && [ -d "/proc/$pid" ] && grep -qai chrom "/proc/$pid/cmdline" 2>/dev/null; then
            return 0
        fi
    fi
    pgrep -f -- "--user-data-dir=$dir" >/dev/null 2>&1
}

PROFILE_CACHES=("Cache" "Code Cache" "GPUCache" "DawnCache" "DawnGraphiteCache" "DawnWebGPUCache" "GrShaderCache" "ShaderCache" "Service Worker/ScriptCache")
ROOT_CACHES=("ShaderCache" "GrShaderCache" "GraphiteDawnCache" "Crashpad/completed")

total=0; cleaned=0; skipped=0
while IFS= read -r udd; do
    [ -n "$udd" ] || continue
    udd="$(readlink -f "$udd" 2>/dev/null)" || continue
    # An toàn: phải là user-data-dir thật của Chrome, không phải / hay thư mục hệ thống
    case "$udd" in /|/etc*|/usr*|/bin*|/sbin*|/lib*|/boot*|/proc*|/sys*|/dev*) continue ;; esac
    [ -d "$udd" ] && { [ -f "$udd/Local State" ] || [ -d "$udd/Default" ]; } || continue
    if in_use "$udd"; then skipped=$((skipped + 1)); continue; fi
    targets=()
    for c in "${ROOT_CACHES[@]}"; do targets+=("$udd/$c"); done
    for prof in "$udd/Default" "$udd"/Profile\ * "$udd/Guest Profile" "$udd/System Profile"; do
        [ -d "$prof" ] || continue
        for c in "${PROFILE_CACHES[@]}"; do targets+=("$prof/$c"); done
    done
    for t in "${targets[@]}"; do
        [ -d "$t" ] && [ ! -L "$t" ] || continue
        sz="$(du -sk "$t" 2>/dev/null | cut -f1)"; total=$((total + ${sz:-0}))
        [ "$DRY" = 1 ] && { echo "  sẽ xoá: $t (${sz} KB)"; continue; }
        rm -rf --one-file-system -- "$t"
    done
    cleaned=$((cleaned + 1))
done < <(list_profiles | sort -u)

# Profile tạm Playwright mồ côi (>6 giờ, không còn tiến trình nào dùng)
for tmp in /tmp /tmp/systemd-private-*-tokmatrix-*/tmp /var/tmp; do
    [ -d "$tmp" ] || continue
    while IFS= read -r d; do
        pgrep -f -- "$d" >/dev/null 2>&1 && continue
        sz="$(du -sk "$d" 2>/dev/null | cut -f1)"; total=$((total + ${sz:-0}))
        if [ "$DRY" = 1 ]; then echo "  sẽ xoá: $d (${sz} KB)"; else rm -rf --one-file-system -- "$d"; fi
    done < <(find "$tmp" -maxdepth 1 -mindepth 1 -type d \( -name 'playwright*' -o -name '.org.chromium.Chromium.*' -o -name 'puppeteer_dev_*' \) -mmin +360 2>/dev/null)
done

log "Dọn cache Chrome: ${cleaned} profile, bỏ qua ${skipped} profile đang mở, giải phóng $((total / 1024)) MB$([ "$DRY" = 1 ] && echo ' (dry-run)')"
SCRIPT

put_file /usr/local/bin/tokmatrix-disk-guard 0755 <<'SCRIPT'
#!/usr/bin/env bash
# Chạy mỗi 10 phút. Trống < MIN_FREE_GB: dọn khẩn cấp + cảnh báo (tối đa 1 lần/6 giờ)
# + tạo cờ /run/tokmatrix/disk-low. Autopilot tự bỏ qua batch mới nhờ min_free_disk_gb.
set -uo pipefail
. /etc/tokmatrix/optimize.env
STATE=/run/tokmatrix; mkdir -p "$STATE"
target="$APP_DIR"; [ -d "$target" ] || target=/
free_gb() { df -P --block-size=1G "$target" | awk 'NR==2 {print $4}'; }

alert() {
    logger -p user.warning -t tokmatrix-disk "$1"
    local stamp="$STATE/last-alert"
    [ ! -f "$stamp" ] || [ -n "$(find "$stamp" -mmin +360)" ] || return 0   # tối đa 1 lần / 6 giờ
    local sent=1
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
        curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=💾 [$(hostname)] $1" >/dev/null 2>&1 && sent=0
    fi
    if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
        local msg; msg="$(printf '%s' "[$(hostname)] $1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
        curl -fsS -m 10 -H 'Content-Type: application/json' \
            -d "{\"text\":\"$msg\",\"content\":\"$msg\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 && sent=0
    fi
    [ "$sent" = 0 ] && touch "$stamp"
    return 0
}

# Thư mục tạm của render bị cắt ngang (restart/kill): không còn tiến trình nào dùng và cũ hơn 6 giờ.
clean_render_work() {
    local freed=0 d
    while IFS= read -r d; do
        pgrep -f -- "$d" >/dev/null 2>&1 && continue
        freed=$(( freed + $(du -sk "$d" 2>/dev/null | cut -f1) ))
        rm -rf --one-file-system -- "$d"
    done < <(find "$APP_DIR/compare_studio/videos" -mindepth 3 -maxdepth 3 -type d -path '*/renders/work-*' -mmin +360 2>/dev/null)
    [ "$freed" -gt 0 ] && logger -t tokmatrix-disk "Dọn thư mục render tạm: $((freed / 1024)) MB"
    return 0
}
clean_render_work

before="$(free_gb)"
if [ "$before" -ge "$MIN_FREE_GB" ]; then
    [ -f "$STATE/disk-low" ] && { rm -f "$STATE/disk-low"; logger -t tokmatrix-disk "Dung lượng đã hồi phục: ${before} GB"; }
    exit 0
fi

touch "$STATE/disk-low"
logger -p user.warning -t tokmatrix-disk "Còn ${before} GB < ${MIN_FREE_GB} GB — dọn khẩn cấp"
/usr/local/bin/tokmatrix-chrome-cache-clean >/dev/null 2>&1 || true
journalctl --vacuum-size=200M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true
find /var/crash -type f -mtime +1 -delete 2>/dev/null || true
after="$(free_gb)"

if [ "$after" -lt "$MIN_FREE_GB" ]; then
    top="$(du -xsh "$APP_DIR/compare_studio/videos" "$APP_DIR/compare_studio/projects" "$APP_DIR/bkt_web/profiles" 2>/dev/null | tr '\t\n' ' ;')"
    alert "Ổ đĩa còn ${after} GB (ngưỡng ${MIN_FREE_GB} GB). Autopilot tạm dừng batch mới. Dung lượng: ${top} Bật dọn video cũ của Autopilot (archive_vps_host hoặc cleanup_without_backup)."
else
    rm -f "$STATE/disk-low"
    logger -t tokmatrix-disk "Đã dọn: ${before} → ${after} GB"
fi
SCRIPT

put_file /etc/cron.d/tokmatrix-maintenance <<'EOF'
# TokMatrix — quản lý bởi setup_vps_optimization.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Dọn cache Chrome lúc 04:15 hằng ngày, ưu tiên CPU/IO thấp
15 4 * * * root nice -n 19 ionice -c3 /usr/local/bin/tokmatrix-chrome-cache-clean >/dev/null 2>&1
# Kiểm tra dung lượng mỗi 10 phút
*/10 * * * * root /usr/local/bin/tokmatrix-disk-guard >/dev/null 2>&1
EOF
command -v curl >/dev/null || warn "Chưa có curl — webhook cảnh báo sẽ không gửi được."

# ------------------------------------------------------------- concurrency ---
step "[7/7] Cấu hình Autopilot (${CPUS} vCPU / $((TOTAL_MB / 1024)) GB)"
AP_DB="$APP_DIR/bkt_web/storage/autopilot.db"
if [ "$APPLY_APP_CONFIG" = 1 ] && [ -f "$AP_DB" ]; then
    if [ "$DRY_RUN" = 1 ]; then
        echo "  [dry-run] autopilot_config: min_free_disk_gb=${MIN_FREE_GB}, matrix_workers=${MATRIX_WORKERS}"
    else
        python3 -c "import sqlite3, sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close()" \
            "$AP_DB" "$BACKUP_DIR/autopilot.db"
        # Qua store.set_config (có kiểm tra giá trị), chạy bằng user app để file SQLite không đổi chủ.
        (cd "$APP_DIR" && sudo -u "$APP_USER" "$APP_DIR/venv/bin/python" -c "
from bkt_web.autopilot import store
store.set_config('min_free_disk_gb', '${MIN_FREE_GB}'); store.set_config('matrix_workers', '${MATRIX_WORKERS}')")
        ok "Autopilot: min_free_disk_gb=${MIN_FREE_GB}, matrix_workers=${MATRIX_WORKERS} (đọc mỗi chu kỳ, không cần restart)"
    fi
else
    warn "Không thấy $AP_DB (hoặc APPLY_APP_CONFIG=0) — đặt tay: min_free_disk_gb=${MIN_FREE_GB}, matrix_workers=${MATRIX_WORKERS}"
fi
cat <<EOF
  Cấu hình cho ${CPUS} vCPU / $((TOTAL_MB / 1024)) GB:
    • Render video (Chrome headless + ffmpeg): tối đa ${RENDER_SLOTS} video cùng lúc trên cả máy (MATRIX_RENDER_SLOTS),
      mỗi video ~1–1.5 GB RAM. Kịch bản/ảnh/TTS vẫn chạy song song với ${MATRIX_WORKERS} worker/batch.
    • Chrome profile đăng bài/quét kênh: tối đa 3–4 profile mở cùng lúc (~300–500 MB mỗi cái),
      và không mở profile khi đang có 2 render nặng.
    • Web app (render + profile) bị giới hạn MemoryMax=${APP_MEMORY_MAX}; ${AGENT_SERVICE} được giữ MemoryLow=${AGENT_MEMORY_LOW}.
    • SSH luôn có CPUWeight=1000 và OOMScoreAdjust=-1000 nên không bị đơ/kill khi server quá tải.
EOF

# ------------------------------------------------------------------ xong ---
step "Hoàn tất"
[ "$DRY_RUN" = 0 ] && ok "Sao lưu file cũ: $BACKUP_DIR"
cat <<EOF
  Kiểm tra:        sudo bash $0 --status
  Thử dọn cache:   sudo tokmatrix-chrome-cache-clean --dry-run
  Log dọn/disk:    journalctl -t tokmatrix-cache -t tokmatrix-disk --since today
  Áp LimitNOFILE/Nice cho app: sudo systemctl restart ${APP_SERVICE}   (khi không có job đang chạy)
EOF
