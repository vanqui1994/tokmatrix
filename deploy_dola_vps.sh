#!/usr/bin/env bash
# Deploy riêng phần Dola lên VPS (5 file dùng chung đã vá trên bản đang chạy của VPS + file Dola mới).
set -euo pipefail
cd "$(dirname "$0")"
STAMP=$(date +%Y%m%d-%H%M%S)
/usr/bin/ssh tokmatrix "sudo mkdir -p /opt/tokmatrix-backups/dola-$STAMP && cd /opt/tokmatrix && sudo tar czf /opt/tokmatrix-backups/dola-$STAMP/before.tgz bkt_web/server.py bkt_web/key_vault.py bkt_web/static/app.js bkt_web/static/index.html bkt_web/static/style.css"
/usr/bin/ssh tokmatrix 'cd /opt/tokmatrix && sudo -u tokmatrix tar xzf - --no-same-owner' < deploy_dola_vps.tgz
/usr/bin/ssh tokmatrix 'cd /opt/tokmatrix && sudo -u tokmatrix venv/bin/python -m unittest tests.test_dola_video tests.test_dola_routes tests.test_dola_accounts tests.test_dola_prompt && sudo -u tokmatrix venv/bin/python -c "import bkt_web.server"'
/usr/bin/ssh tokmatrix 'sudo systemctl restart tokmatrix-web && sleep 6 && systemctl is-active tokmatrix-web && curl -s -o /dev/null -w "web %{http_code}\n" http://127.0.0.1:8080/ && journalctl -u tokmatrix-web --since "-1 min" | grep -iE "error|traceback|dola" | tail -5 || true'

echo "Xong. Hoàn tác: ssh tokmatrix 'cd /opt/tokmatrix && sudo -u tokmatrix tar xzf /opt/tokmatrix-backups/dola-$STAMP/before.tgz && sudo systemctl restart tokmatrix-web'"
