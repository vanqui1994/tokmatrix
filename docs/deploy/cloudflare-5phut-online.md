# Cấu hình Cloudflare cho 5phut.online

VPS: `75.119.143.83` (Contabo, Đức) · nginx 1.24 · TokMatrix chạy loopback `127.0.0.1:8080`

## 1. DNS

Dashboard → **DNS → Records**. Xoá hết bản ghi cũ do Cloudflare quét tự động, giữ đúng bảng này:

| Type | Name | Content | Proxy | TTL |
| --- | --- | --- | --- | --- |
| A | `@` | `75.119.143.83` | **Proxied** (cam) | Auto |
| A | `www` | `75.119.143.83` | **Proxied** (cam) | Auto |
| A | `direct` | `75.119.143.83` | **DNS only** (xám) | Auto |
| TXT | `@` | `v=spf1 -all` | — | Auto |
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:admin@5phut.online` | — | Auto |

- `direct` là cửa hậu **không qua proxy**, dùng cho việc upload video lớn (xem mục 5).
- Hai bản ghi TXT tuyên bố domain không gửi mail, chặn người khác giả mạo. Nếu bạn cần email
  `@5phut.online` thì thay bằng MX + SPF của nhà cung cấp mail, đừng để `-all`.
- Không khai MX nào cả nếu không dùng email — bản ghi email forwarding cũ của Namecheap đã mất
  khi đổi nameserver.

## 2. SSL/TLS

**SSL/TLS → Overview**: chọn **Full (strict)**. Không dùng Flexible — chặng Cloudflare → VPS sẽ
đi HTTP trần, Basic Auth và cookie phiên bị lộ.

**SSL/TLS → Edge Certificates**:

| Mục | Giá trị |
| --- | --- |
| Always Use HTTPS | **On** |
| Minimum TLS Version | **TLS 1.2** |
| Opportunistic Encryption | On |
| TLS 1.3 | On |
| Automatic HTTPS Rewrites | **On** |
| HSTS | **On** — max-age 6 tháng, include subdomains **Off** (vì `direct` không có cert hợp lệ) |

**Chứng chỉ origin** — cert hiện tại trên VPS là `CN=vmi3600163.contaboserver.net`, sai tên miền
nên Full (strict) sẽ hỏng. Chọn một trong hai:

**Cách A — Cloudflare Origin CA (khuyến nghị, không cần mở cổng 80 ra Internet)**

SSL/TLS → **Origin Server → Create Certificate**, hostname `5phut.online, *.5phut.online`, hạn 15 năm.
Lưu hai file lên VPS rồi trỏ nginx vào:

```
ssl_certificate     /etc/ssl/cloudflare/5phut.online.pem;
ssl_certificate_key /etc/ssl/cloudflare/5phut.online.key;
```

**Cách B — Let's Encrypt**: phải tạm chuyển hai bản ghi A về **DNS only**, chạy
`certbot --nginx -d 5phut.online -d www.5phut.online`, rồi bật proxy lại. Hoặc dùng DNS-01 với
`certbot-dns-cloudflare` và API token quyền `Zone:DNS:Edit`.

**Authenticated Origin Pulls** (SSL/TLS → Origin Server): bật, rồi thêm vào nginx để origin chỉ
nhận request đến từ Cloudflare:

```
ssl_client_certificate /etc/ssl/cloudflare/origin-pull-ca.pem;
ssl_verify_client on;
```

## 3. Chặn truy cập — chọn một

**Cách A — Cloudflare Access (Zero Trust, miễn phí tới 50 người)**

Zero Trust → Access → Applications → Add → Self-hosted:

- Application domain: `5phut.online` (thêm cả `www`)
- Session duration: 24 giờ
- Policy: Allow → Emails → email của bạn (hoặc Emails ending in `@vitalify.asia`)

Sau khi bật, mọi request lạ bị chặn ngay ở biên Cloudflare, chưa chạm tới VPS. Có thể gỡ luôn
Basic Auth trong nginx, hoặc giữ làm lớp thứ hai.

**Cách B — WAF theo IP** (nếu IP của bạn cố định)

Security → WAF → Custom rules → Create:

| | |
| --- | --- |
| Rule name | `chi-cho-ip-cua-toi` |
| Field | `IP Source Address` **not in** `{IP nhà/văn phòng}` |
| Action | **Block** |

## 4. Tăng tốc & tránh hỏng giao diện

**Caching → Cache Rules** — API và trang chính không được cache:

| Rule | Điều kiện | Hành động |
| --- | --- | --- |
| `khong-cache-api` | URI Path starts with `/api/` | Bypass cache |
| `khong-cache-app` | URI Path equals `/` | Bypass cache |

**Speed → Optimization**: tắt **Rocket Loader** (làm hỏng thứ tự script của `app.js`), tắt
**Auto Minify** cho JS/HTML.

**Network**: bật **WebSockets**. Ứng dụng dùng SSE ở `/api/runs/{id}/stream`; nếu log ngừng chảy
thì thêm Configuration Rule bật **Disable Buffering** cho path `/api/runs/`.

## 5. Giới hạn upload 100 MB — quan trọng

Gói Cloudflare Free chặn body request quá **100 MB**, trong khi
`bkt_web/remake_routes.py:29` cho phép video tới **500 MB**. Upload video lớn qua domain proxied
sẽ nhận **HTTP 413** từ Cloudflare, không phải từ ứng dụng.

Ba cách xử lý, chọn một:

1. **Upload qua `direct.5phut.online`** (bản ghi DNS-only ở mục 1). Không có Cloudflare che chắn,
   nên chỉ mở tạm và đóng bằng firewall khi xong.
2. **Đẩy file thẳng bằng rsync**, không qua web:
   `rsync -avz video.mp4 root@75.119.143.83:/opt/tokmatrix/bkt_web/storage/remake_uploads/`
3. Nâng gói Cloudflare (Pro 100 MB, Business 200 MB, Enterprise 500 MB).

Cách 2 là nhanh và an toàn nhất cho video vài trăm MB.

## 6. Kiểm tra sau khi cấu hình

```bash
dig +short NS 5phut.online @1.1.1.1          # pablo/sky.ns.cloudflare.com
dig +short A 5phut.online @1.1.1.1           # 104.x hoặc 172.67.x nếu proxy đã bật
curl -sI https://5phut.online | head -5      # 200/401, không lỗi cert
curl -s -o /dev/null -w '%{ssl_verify_result}\n' https://5phut.online   # phải là 0
```

Nếu `dig` vẫn trả `75.119.143.83` nghĩa là bản ghi còn ở DNS-only, proxy chưa bật.
