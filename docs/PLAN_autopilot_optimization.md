# Kế hoạch tối ưu Autopilot (202 acc TikTok)

Cập nhật: 2026-09-24 23:20 (giờ VN). Số liệu đo trực tiếp trên VPS `tokmatrix` (Contabo, 4 vCPU / 8 GB / 96 GB).

## Bối cảnh

- Autopilot tạo **1 video/acc/ngày**: mỗi niche một plan/ngày, mỗi plan chạy một batch Matrix cho các kênh đã gán acc.
- Kịch bản và angle do **agent Antigravity** viết qua Script Bridge (không dùng Gemini API, key đã hết quota).
- Ảnh cũng do agent Antigravity sinh qua Image Bridge. Render bằng HyperFrames ngay trên VPS.
- **Giữ đăng tới 26/09 00:00.** Luật `min_lead_hours = 24`: video phải làm xong trước khung đăng ít nhất 24h, nên luôn có sẵn một ngày video.
- Acc ngâm 24h sau khi tiêm cookie (đã tiêm 24/09 12:24–13:13).

## 1. Hiện trạng đo được

| Công đoạn | Số đo | Nhu cầu mỗi ngày (202 video) | Đánh giá |
|---|---|---|---|
| Viết kịch bản (bridge) | khoảng 1 phút/task, nhiều task mỗi lượt agent | khoảng 230 task | ✅ Dư sức |
| Ảnh Antigravity | **120–130 ảnh/giờ** (khoảng 3.000/ngày) | khoảng 1.450 ảnh (120 kênh × 12) | ✅ Đủ; lô đầu xong trong khoảng 12 giờ |
| TTS | gần như tức thì (408 đoạn đã làm) | khoảng 2.400 đoạn | ✅ Dư sức |
| **Render** | khoảng **22 phút/video** khi máy quá tải; 9 video render cùng lúc | 202 lượt render | ⚠️ **Nút cổ chai** |
| **CPU** | tải **15,9 trên 4 vCPU** (khoảng 4 lần công suất), RAM trống 2,2 GB | | ⚠️ Quá tải |
| **Đĩa** | khoảng 30–50 MB/video; còn 72 GB, ngưỡng dừng `min_free_disk_gb` = 15 | khoảng 7–8 GB/ngày | ⚠️ **Khoảng 7 ngày** là chạm ngưỡng |
| Worker đăng TikTok | tuần tự 1 bài/lần; chưa đo trên VPS | 202 bài | ❓ Đo khi mở đăng 26/09 |

Ghi chú: các ước tính trước đó (20–25 ảnh/giờ, "2,5–3 ngày cho lô ảnh đầu") là **sai**, vì thống kê được chia theo 10 phút chứ không theo giờ. Ảnh không phải nút cổ chai.

Phân bổ engine sau khi sửa: mystery 36, newspaper 31, vox 43, folklore 10 (cần ảnh, tổng 120 kênh); kinetic 45, science 35 (không cần ảnh).

## 2. Kế hoạch

### Giai đoạn 1: trước khi mở đăng 26/09

| # | Việc | Lý do | Kiểm chứng |
|---|---|---|---|
| 1 | **Giới hạn render toàn máy ở 2 video cùng lúc** (khoá dùng chung cho mọi batch, giống limiter Gemini) | 9 render chồng nhau trên 4 vCPU làm mọi video chậm và tranh CPU với Chrome của agent Antigravity | Tải máy ≤ 6; tổng số video/giờ tăng hoặc giữ nguyên |
| 2 | **Đo công suất render thật**: phút CPU/video và số video/giờ sau khi giới hạn | Biết 4 vCPU có đủ cho 202 video/ngày không | Bảng số đo 24 giờ |
| 3 | **Bật dọn đĩa**: **(a)** đặt `archive_vps_host` (backup rồi xoá), hoặc **(b)** `cleanup_without_backup=true` (xoá MP4 và project 2 ngày sau khi đăng, không backup) | Không làm gì thì khoảng 01/10 sản xuất tự dừng vì đầy đĩa | `df` giữ ổn định sau ngày thứ 3 |
| 4 | **Theo dõi 5 bài đầu 26/09** (từ khoảng 13:00): thời gian mỗi lượt đăng, bài có lên TikTok thật không | Worker đăng chưa từng chạy hàng loạt trên VPS; trên 4 phút/bài là không kịp 202 bài/ngày | `upload_tasks` SUCCESS, không có NEEDS_CHECK |

**Cần quyết:** mục 3 chọn (a) hay (b).

### Giai đoạn 2: trong tuần

| # | Việc | Lợi ích dự kiến |
|---|---|---|
| 5 | Giảm chi phí render: bỏ lượt `hyperframes check` chạy lặp (đang thấy hai lần/video), thử render 24fps thay vì 30fps | −20–30% thời gian render |
| 6 | Nếu mục 4 cho thấy cần: **2 worker đăng song song**, khoá theo acc (không bao giờ đăng trùng), mỗi worker dùng VPN và profile riêng của acc | Gấp đôi số bài đăng mỗi giờ |
| 7 | **Báo cáo hằng ngày**: video đã làm / đã đăng / lỗi; acc không đăng được (11 acc "LỖI MẠNG": 128, 141, 142, 153, 156, 196, 204, 208, 216, 222, 258) | Không phải tự mở Sơ Đồ Luồng mới biết có sự cố |
| 8 | Sửa 2 kênh không có engine render được (`geopolitics_maps_05`, `military_arsenal_08`): thêm engine render được vào cấu hình tương thích của niche | +2 acc có video |

### Giai đoạn 3: trong khoảng 2–4 tuần

| # | Việc | Ghi chú |
|---|---|---|
| 9 | **Tự sinh topic qua bridge** khi một niche còn dưới 7 topic chưa dùng (có lọc trùng với lịch sử) | 30 topic/niche sẽ hết sau khoảng 30 ngày |
| 10 | **Tăng công suất** nếu muốn nhiều hơn 1 video/acc/ngày: VPS 8 vCPU, hoặc thêm một máy chỉ để render | Chỉ làm sau khi có số đo ở mục 2 |
| 11 | **Dùng dữ liệu hiệu quả**: lượt xem theo niche, engine và kiểu hook, để ưu tiên loại nội dung tốt (bảng `analytics_snapshots` có sẵn nhưng chưa dùng) | Tăng chất lượng thay vì chỉ tăng số lượng |

## 3. Lịch vận hành hiện tại

| Thời gian | Việc |
|---|---|
| 24/09 → 25/09 | Chỉ sản xuất; video xong chờ ở `READY_TO_PUBLISH` |
| Từ 26/09 00:00 | Xếp lịch đăng: mỗi acc vào "giờ nhà" riêng trong các khung 8/10/12/14/17/19h (giờ địa phương), lệch 0–45 phút theo acc |
| Từ đó về sau | Video làm ngày D đăng từ ngày D+1 |

Ngày 26/09 có thể đông hơn bình thường: một acc có video từ cả hai ngày 24 và 25 có thể đăng 2 bài (mức trần hiện là 6 bài/ngày). Muốn cố định 1 bài/ngày thì đặt `videos_per_day_per_channel = 1`.

## 4. Lệnh vận hành

Chạy trên VPS, trong `/opt/tokmatrix`:

```bash
python3 deploy/scheduler_ops.py check                        # tình trạng tổng thể (chỉ đọc)
python3 deploy/scheduler_ops.py summary                      # bài đã xếp lịch + slot trống 7 ngày
python3 deploy/scheduler_ops.py allocate                     # chạy thử xếp lịch (không ghi)
python3 deploy/scheduler_ops.py hold --until "YYYY-MM-DD HH:MM"   # giữ đăng tới mốc
python3 deploy/scheduler_ops.py release                      # bỏ giữ đăng
```

Theo dõi real-time: https://5phut.online → **🧭 Sơ Đồ Luồng (Live)** → tab **Autopilot** (tự làm mới mỗi 5 giây).

## 5. Rủi ro còn mở

- Worker đăng tuần tự chưa được kiểm chứng ở quy mô 202 bài/ngày (mục 4, 6).
- 11 acc "LỖI MẠNG" có thể đăng thất bại; sẽ thử lại 3 lần rồi báo lỗi, không ảnh hưởng acc khác.
- Render là giới hạn công suất; nếu số đo ở mục 2 cho thấy dưới 202 video/ngày thì cần mục 5 hoặc mục 10.
- Mỗi task kịch bản và ảnh phụ thuộc agent Antigravity trên VPS. Nếu agent dừng, xem lại các bẫy vận hành đã ghi nhận (quyền thư mục `bin/`, project ID trong `/etc/tokmatrix-bridge.conf`).
