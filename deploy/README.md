# Triển khai lên VPS

## Yêu cầu
- Ubuntu 22.04 hoặc 24.04 (x86_64 hoặc arm64), VPS mới
- Tối thiểu 2 vCPU / 4GB RAM / 40GB SSD (Chromium + ffmpeg ăn RAM; dưới 4GB script sẽ tự tạo swap 2GB)
- Tuỳ chọn: một domain đã trỏ A record về IP VPS (để có HTTPS)

## Chạy

```bash
# trên máy local, đẩy mã nguồn lên VPS
rsync -az --exclude '.git' --exclude '.venv' --exclude '*.mp4' --exclude 'scratch' \
      ./ root@IP_VPS:/opt/tokmatrix/

# trên VPS
cd /opt/tokmatrix
sudo DOMAIN=tool.example.com \
     LETSENCRYPT_EMAIL=ban@example.com \
     ADMIN_USER=admin \
     ADMIN_PASS='mat-khau-manh' \
     bash deploy/provision_vps.sh
```

Không có domain thì bỏ `DOMAIN` — nhưng khi đó Basic Auth đi qua HTTP không mã hoá,
nên hãy truy cập bằng SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 -L 6080:127.0.0.1:6080 root@IP_VPS
# rồi mở http://127.0.0.1:8080
```

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DOMAIN` | *(trống)* | Bật Nginx server_name + Let's Encrypt |
| `LETSENCRYPT_EMAIL` | *(trống)* | Email nhận cảnh báo hết hạn cert |
| `ADMIN_USER` / `ADMIN_PASS` | `admin` / *tự sinh* | Basic Auth của Nginx |
| `APP_USER` | `tokmatrix` | User hệ thống chạy service |
| `APP_DIR` | `/opt/tokmatrix` | Thư mục cài đặt |
| `ENABLE_VNC` | `1` | Cài Xvfb + noVNC để xem trình duyệt chạy |
| `HARDEN_SSH` | `0` | `1` = tắt đăng nhập bằng mật khẩu (chỉ bật SAU khi đã thêm SSH key) |
| `SSH_PORT` | `22` | Port SSH cần mở trên UFW |
| `TIMEZONE` | `Asia/Ho_Chi_Minh` | Múi giờ hệ thống |

## Tại sao không mở port 8080 ra Internet

`bkt_web/server.py` cấp cookie phiên cho **bất kỳ ai** truy cập `/` — xác thực
của app chỉ có ý nghĩa khi app chạy trên máy cá nhân. Trên VPS, phơi 8080 ra
ngoài đồng nghĩa với việc ai biết IP cũng toàn quyền thao tác dashboard và đọc
cookie TikTok. Vì vậy:

- app bind `127.0.0.1:8080`, noVNC bind `127.0.0.1:6080`
- Nginx là tiến trình duy nhất nghe Internet, có Basic Auth + TLS
- UFW `default deny incoming`, chỉ mở SSH / 80 / 443
- `x11vnc` chạy với `-rfbauth` (có mật khẩu) và `-localhost`

Nếu muốn chắc chắn hơn nữa, bỏ hẳn Nginx public và chỉ dùng SSH tunnel hoặc
WireGuard.

## Vận hành

```bash
journalctl -u tokmatrix-web -f      # log app
systemctl restart tokmatrix-web     # restart app
systemctl status tokmatrix-*        # trạng thái toàn bộ
ufw status verbose                  # kiểm tra firewall
fail2ban-client status sshd         # IP đang bị chặn
```

Cập nhật mã nguồn:

```bash
rsync -az --exclude '.git' --exclude '.venv' --exclude 'bkt_web/storage' \
      ./ root@IP_VPS:/opt/tokmatrix/
ssh root@IP_VPS 'chown -R tokmatrix:tokmatrix /opt/tokmatrix && systemctl restart tokmatrix-web'
```

## Lưu ý

- `setup_vps.sh` ở thư mục gốc là bản cũ: chạy toàn bộ bằng root, `x11vnc -nopw`,
  mở 8080 + 6080 ra Internet, và `ufw allow` mà không `ufw enable`. Không dùng.
- Script không đụng tới `bkt_web/storage/` và `*.db` khi rsync, nên chạy lại
  nhiều lần không mất dữ liệu.
- Sau khi thêm SSH key, chạy lại với `HARDEN_SSH=1` để tắt đăng nhập mật khẩu.
