#!/usr/bin/env bash
# Cài Dola Render Gateway trên VPS cạnh TokMatrix, dùng IP thật (không proxy). Chạy lại được. Bằng root:
#   sudo bash deploy/setup_dola_gateway.sh
#
# - User riêng `dola`, thư mục /opt/dola-gateway (git, ghim commit), venv + Chromium của patchright.
# - dola-gateway.service: uvicorn server:app trên 127.0.0.1:8000, DOLA_PROXY rỗng (IP thật của VPS),
#   DISPLAY=:1 (Xvfb sẵn có: đăng nhập tài khoản và extension 30 s cần trình duyệt có cửa sổ),
#   1 video cùng lúc, giới hạn RAM.
# - Khoá DOLA_API_KEYS / DOLA_ADMIN_KEY sinh một lần trong /etc/dola-gateway/gateway.env (640 root:dola),
#   chép vào Kho Khoá TokMatrix (video.dola, video.dola_admin); .env TokMatrix trỏ DOLA_GATEWAY_BASE_URL tới đây.
set -euo pipefail

REPO=${DOLA_GATEWAY_REPO:-https://github.com/coll3879xx-cyber/dola-render-gateway}
REF=${DOLA_GATEWAY_REF:-ccbbebd}
DIR=/opt/dola-gateway
ETC=/etc/dola-gateway
TM=/opt/tokmatrix

[ "$(id -u)" = 0 ] || { echo "Chạy bằng root (sudo)"; exit 1; }

id dola >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin dola
install -d -o dola -g dola -m 755 "$DIR"
install -d -o root -g dola -m 750 "$ETC"

if [ ! -d "$DIR/.git" ]; then
  sudo -u dola git clone -q "$REPO" "$DIR"
fi
sudo -u dola git -C "$DIR" fetch -q origin
sudo -u dola git -C "$DIR" checkout -q "$REF"
[ -x "$DIR/venv/bin/python" ] || sudo -u dola python3 -m venv "$DIR/venv"
sudo -u dola "$DIR/venv/bin/pip" install -q --upgrade pip
sudo -u dola "$DIR/venv/bin/pip" install -q -r "$DIR/requirements.txt"
# requirements.txt của gateway thiếu: gap.py (captcha kéo thanh) dùng cv2 + numpy.
sudo -u dola "$DIR/venv/bin/pip" install -q opencv-python-headless numpy
sudo -u dola env HOME="$DIR" "$DIR/venv/bin/patchright" install chromium >/dev/null
# Add Account: khi Google đòi bước script không tự làm được (nhập SĐT, 2FA mà không có TOTP, trang lạ),
# add_account.py báo lỗi và đóng Chrome ngay. Vá: giữ Chrome mở, chờ người dùng tự làm qua VNC (DISPLAY :1)
# tối đa DOLA_MANUAL_LOGIN_MINUTES (20) phút, rồi tiếp tục bình thường (chờ sessionid của Dola).
sudo -u dola "$DIR/venv/bin/python" - "$DIR/add_account.py" <<'PY'
import sys, py_compile
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
if "manual Google step" not in s:
    helper = '''

async def _wait_manual(g, reason: str):
    """TokMatrix patch (manual Google step): leave Chrome open for the user (VNC, DISPLAY :1)."""
    import os
    minutes = float(os.environ.get("DOLA_MANUAL_LOGIN_MINUTES", "20"))
    print(f"[google] {reason} -> waiting up to {minutes:g} min for manual completion via VNC", flush=True)
    for _ in range(int(minutes * 30)):
        try:
            if g.is_closed() or "accounts.google.com" not in g.url:
                print("[google] Manual step done (left Google)", flush=True)
                return
        except Exception:
            return
        await asyncio.sleep(2)
    raise RuntimeError(f"{reason}; not completed manually within {minutes:g} min")


async def google_login('''
    assert s.count("\n\nasync def google_login(") == 1
    s = s.replace("\n\nasync def google_login(", helper, 1)
    old2fa = '''            if not secret:
                raise RuntimeError("Google requested 2FA, but no TOTP secret was provided")'''
    new2fa = '''            if not secret:
                await _wait_manual(g, "Google asks for a code/phone number and no TOTP secret was given")
                return'''
    assert old2fa in s
    s = s.replace(old2fa, new2fa, 1)
    oldend = '''    if "accounts.google.com" in g.url:
        await g.screenshot(path="dbg_google2.png")
        raise RuntimeError("Google login did not complete within 12 steps (saved dbg_google2.png)")'''
    newend = '''    if "accounts.google.com" in g.url:
        await g.screenshot(path="dbg_google2.png")
        await _wait_manual(g, "Google login needs a step this script cannot do (saved dbg_google2.png)")'''
    assert oldend in s
    s = s.replace(oldend, newend, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("add_account.py: chờ người dùng làm tay bước Google (SĐT/2FA) thay vì đóng Chrome")
py_compile.compile(p, doraise=True)
PY
# Dola đổi giao diện (10/2026): nút thời lượng là menu (5s/10s); click("text=10s") bấm vào chính nút
# đang hiện "10s", mở menu rồi để nguyên, menu che ô prompt → "ElementHandle.click: Timeout … intercepts
# pointer events". Đóng mọi menu radix còn mở (Escape) trước khi bấm vào ô prompt.
sudo -u dola "$DIR/venv/bin/python" - "$DIR/video_worker_ui.py" <<'PY'
import sys, py_compile
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = """            box = await page.query_selector("textarea") or await page.query_selector('[contenteditable="true"]')
            await box.click()"""
new = """            for _ in range(3):  # TokMatrix patch: close dropdowns left open over the prompt box
                if not await page.locator("[data-radix-popper-content-wrapper]").count():
                    break
                await page.keyboard.press("Escape")
                await page.wait_for_timeout(300)
            box = await page.query_selector("textarea") or await page.query_selector('[contenteditable="true"]')
            await box.click()"""
if "TokMatrix patch: close dropdowns" not in s:
    assert old in s, "video_worker_ui.py: không thấy đoạn bấm ô prompt"
    open(p, "w", encoding="utf-8").write(s.replace(old, new, 1))
    print("video_worker_ui.py: đóng menu trước khi bấm ô prompt")
py_compile.compile(p, doraise=True)
PY
# Đăng nhập tay (Facebook/Apple/SĐT/Google) qua VNC: deploy/dola_manual_login.py
install -o dola -g dola -m 644 "$(dirname "$0")/dola_manual_login.py" "$DIR/manual_login.py" 2>/dev/null || true
# Lỗi sẵn trong repo (commit ccbbebd): video_worker.py có một dòng """ thừa sau docstring của
# generate_video, cả gateway không import được. Xoá đúng dòng đó (không làm gì nếu upstream đã sửa).
sudo -u dola "$DIR/venv/bin/python" - "$DIR/video_worker.py" <<'PY'
import sys, py_compile
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
bad = 'FileNotFoundError\n    """\n    """\n    timeout'
if bad in s:
    open(p, "w", encoding="utf-8").write(s.replace(bad, 'FileNotFoundError\n    """\n    timeout', 1))
    print("video_worker.py: đã xoá dòng \"\"\" thừa")
py_compile.compile(p, doraise=True)
PY
# Dola đổi giao diện (10/2026): hộp đăng nhập không còn class .semi-modal-wrap, add_account.py chờ
# 10 s rồi báo "Add Failed" trước khi tới trang Google. Chờ chính nút "Googleで続ける" thay vì class.
sudo -u dola "$DIR/venv/bin/python" - "$DIR/add_account.py" <<'PY'
import sys, py_compile
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = 'page.wait_for_selector(".semi-modal-wrap", timeout=10000)'
new = 'page.wait_for_selector("text=Googleで続ける", timeout=10000)'
if old in s:
    open(p, "w", encoding="utf-8").write(s.replace(old, new))
    print("add_account.py: chờ nút Googleで続ける thay cho .semi-modal-wrap")
py_compile.compile(p, doraise=True)
PY

if [ ! -f "$ETC/gateway.env" ]; then
  cat > "$ETC/gateway.env" <<ENV
DOLA_HOST=127.0.0.1
DOLA_PORT=8000
DOLA_PUBLIC_BASE=http://127.0.0.1:8000
DOLA_PROXY=
DOLA_API_KEYS=sk-$(openssl rand -hex 24)
DOLA_ADMIN_KEY=$(openssl rand -hex 16)
DOLA_MAX_CONCURRENCY=1
DOLA_LIMIT_RESET_TZ=Asia/Tokyo
DISPLAY=:1
HOME=$DIR
ENV
fi
chown root:dola "$ETC/gateway.env"; chmod 640 "$ETC/gateway.env"

cat > /etc/systemd/system/dola-gateway.service <<UNIT
[Unit]
Description=Dola Render Gateway (127.0.0.1:8000)
After=network-online.target
Wants=network-online.target

[Service]
User=dola
WorkingDirectory=$DIR
EnvironmentFile=$ETC/gateway.env
ExecStart=$DIR/venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=10
MemoryHigh=1800M
MemoryMax=2500M

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable -q dola-gateway.service
systemctl restart dola-gateway.service

# Nối TokMatrix: khoá vào Kho Khoá, địa chỉ vào .env (cần khởi động lại tokmatrix-web lần đầu).
set -a; . "$ETC/gateway.env"; set +a
(cd "$TM" && sudo -u tokmatrix env K1="$DOLA_API_KEYS" K2="$DOLA_ADMIN_KEY" venv/bin/python -c '
import os
from bkt_web import key_vault
key_vault.set_key("video.dola", os.environ["K1"])
key_vault.set_key("video.dola_admin", os.environ["K2"])
print("Kho Khoá TokMatrix: video.dola, video.dola_admin")')
if ! grep -qs '^DOLA_GATEWAY_BASE_URL=' "$TM/.env"; then
  printf '# Dola Render Gateway (deploy/setup_dola_gateway.sh)\nDOLA_GATEWAY_BASE_URL=http://127.0.0.1:8000\nDOLA_LIMIT_RESET_TZ=Asia/Tokyo\n' >> "$TM/.env"
  chown tokmatrix:tokmatrix "$TM/.env"; chmod 600 "$TM/.env"
  echo "NEED_WEB_RESTART"
fi

for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:8000/health && break; sleep 2; done
curl -s http://127.0.0.1:8000/health; echo
