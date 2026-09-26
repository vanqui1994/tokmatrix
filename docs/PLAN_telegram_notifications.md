# Kế hoạch tích hợp thông báo Telegram

Cập nhật: 2026-09-24. Phạm vi: VPS `tokmatrix` (TokMatrix + Autopilot + AI Matrix).

## Trạng thái (25/09)

- Đã làm: `bkt_web/notify.py` (outbox + sender + watcher), watchdog `tokmatrix-watchdog.timer`, khoá `notify.telegram`, test `tests/test_notify.py`. Watcher đã phủ luôn phần sự kiện đăng bài của giai đoạn 2 (SUCCESS/NEEDS_CHECK/ERROR, giữ/bỏ giữ, DEAD_LETTER).
- Trên VPS: code đã cài, token đã lưu, watchdog đang chạy. Còn thiếu: `chat_id` và restart `tokmatrix-web` một lần.
- Mặc định: tin "render xong" gửi từng video (im lặng), gộp khi dồn >5 tin; không có giờ yên tĩnh. Đổi bằng `python3 -m bkt_web.notify config --render digest --quiet 0-7`.
- Chưa làm: báo cáo ngày 23:50, lệnh bot (giai đoạn 3). Bot `@t9saigonbot` đang có webhook trỏ về Google Apps Script → muốn dùng lệnh bot/`getUpdates` phải bỏ webhook đó hoặc dùng bot riêng.

## Mục tiêu

- Biết **trạng thái VPS** mà không cần mở web: CPU, RAM, swap, đĩa, service, hàng đợi.
- Nhận tin **mỗi khi render xong một video**.
- Mở rộng dần các case khác: đăng bài, lỗi, báo cáo ngày, và về sau là ra lệnh qua bot.
- Không làm chậm pipeline. Không bao giờ để lộ cookie hay token. Không spam.

## Kiến trúc

```
 Nguồn sự kiện                           Hàng đợi bền                Gửi
 ─────────────                           ────────────                ───
 watcher trong server (60 s) ─┐
   · job → READY_TO_PUBLISH   │
   · job → DEAD_LETTER        ├──► notify_outbox (SQLite) ──► sender thread ──► Telegram Bot API
   · upload SUCCESS/ERROR/…   │     dedupe + cooldown          ≤1 tin/giây/chat     sendMessage (HTML)
 autopilot / scheduler_ops ───┤     gộp tin khi dồn            retry khi lỗi mạng
 metrics (10 phút) ───────────┘
 watchdog systemd (5 phút) ──────────────────────────────────► curl trực tiếp (khi server chết)
```

### Thành phần

| Thành phần | Vị trí | Việc |
|---|---|---|
| `bkt_web/notify.py` | module mới | `emit(event, payload, severity, dedupe_key)` ghi vào `notify_outbox`; định dạng tin theo loại sự kiện; gửi qua `api.telegram.org/bot<token>/sendMessage` |
| Bảng `notify_outbox` | `bkt_channels.db` | `id, event, severity, dedupe_key, text, created_at, sent_at, attempts, error`: tin không mất khi restart hay rớt mạng |
| Sender thread | khởi động trong `server.py` (giống worker bridge) | Mỗi 2 giây lấy tin chưa gửi; tối đa 1 tin/giây/chat; retry theo backoff, đọc `retry_after` khi Telegram trả 429 |
| Watcher thread | trong server | Mỗi 60 giây đọc (chỉ đọc) `matrix_factory.db` và `upload_tasks` theo con trỏ `updated_at`, phát sự kiện khi trạng thái đổi. **Không sửa code Matrix** |
| `tokmatrix-watchdog.timer` | systemd, 5 phút | Script độc lập gọi `curl`: báo khi `tokmatrix-web` chết, Antigravity không chạy, đĩa dưới ngưỡng. Vẫn chạy được cả khi server đã chết |
| Khoá `notify.telegram` | `key_vault.py` (thêm 1 dòng `KeySpec`) | Token bot mã hoá bằng `.secret.key`; `chat_id` lưu ở `settings` |

### Nguyên tắc chống spam

- **Dedupe/cooldown theo `dedupe_key`**: cùng một cảnh báo (ví dụ "đĩa thấp") tối đa 1 lần mỗi 6 giờ, trừ khi mức độ nặng hơn.
- **Gộp tin**: có trên 5 tin cùng loại trong 1 phút thì gửi một tin tổng hợp. Ví dụ "✅ 7 video render xong (kinetic 3, science 2, vox 2)".
- **Mức độ**: `info` gửi im lặng (`disable_notification`); `warn` và `critical` có chuông.
- **Giờ yên tĩnh** (tuỳ chọn, ví dụ 00:00–07:00): chỉ `critical` được gửi; phần còn lại dồn vào tin sáng.

## Các case theo giai đoạn

### Giai đoạn 1: làm trước (khoảng nửa ngày công)

| Sự kiện | Khi nào | Nội dung tin (ví dụ) |
|---|---|---|
| 🎬 **Render xong 1 video** | job chuyển sang `READY_TO_PUBLISH` | `🎬 Video xong · Kosmos & Physik 11 (DE) · science · "Die Suwałki-Lücke…" · 58s · chờ đăng từ 26/09 14:27` |
| 🖥️ **Trạng thái VPS** định kỳ | 08:00, 14:00, 20:00 và theo yêu cầu | `🖥️ VPS · tải 6.1/4 CPU · RAM trống 2.3 GB · swap 1.1 GB · đĩa 71 GB · web ✅ · 3 batch · ảnh chờ 157 · video xong hôm nay 42` |
| 🚨 **Service chết / khởi động lại** | watchdog | `🚨 tokmatrix-web không chạy (từ 10:42)` / `✅ đã chạy lại` |
| 💾 **Đĩa thấp** | thay webhook hiện tại của `tokmatrix-disk-guard` | `💾 Đĩa còn 18 GB (ngưỡng 15 GB) — Autopilot sẽ dừng batch mới` |
| 🔥 **Quá tải kéo dài** | tải > 3 × số CPU hoặc swap > 3 GB trong 30 phút | `🔥 Quá tải 30 phút · tải 14/4 · swap 3.4 GB · 16 tiến trình render` |

### Giai đoạn 2: khi bắt đầu đăng (từ 26/09)

| Sự kiện | Khi nào |
|---|---|
| 📤 Đăng thành công | `upload_tasks` sang `SUCCESS`, kèm tên acc và link bài (`result_url`) |
| ⚠️ Cần kiểm tra | `NEEDS_CHECK`: đã bấm Đăng nhưng không thấy xác nhận (không tự đăng lại) |
| ❌ Đăng lỗi hẳn | `ERROR` sau 3 lần, kèm lý do (cookie chết, VPN lỗi, captcha…) |
| 🧊 Giữ đăng / bỏ giữ | khi `scheduler_ops hold` / `release`, hoặc hết giờ giữ |
| ☠️ Job hỏng | job sang `DEAD_LETTER`, kèm lỗi (gộp theo niche) |
| 📊 **Báo cáo ngày** (23:50) | số video làm/đăng/lỗi theo niche; top lỗi; công suất render; đĩa |

### Giai đoạn 3: mở rộng

| Sự kiện / tính năng | Ghi chú |
|---|---|
| 🤖 Agent Antigravity treo | inbox bridge ảnh/kịch bản không giảm trong 30 phút |
| 📚 Sắp hết topic | niche còn dưới 7 topic chưa dùng |
| 🧯 Acc có vấn đề | cookie chết, acc bị khoá, "LỖI MẠNG" kéo dài |
| 💬 **Lệnh bot** | `/status`, `/report`, `/hold 24`, `/release`, `/pause`, `/resume`. Chạy long-polling `getUpdates` trên VPS (không cần mở cổng). **Chỉ nhận lệnh từ `chat_id` trong danh sách cho phép**; lệnh ghi (hold/pause) phải có bước xác nhận |
| 🔀 Nhiều kênh chat | ví dụ: nhóm "Cảnh báo" (warn/critical), nhóm "Sản xuất" (video xong, báo cáo) |

## Bảo mật

- Token bot chỉ nằm trong key vault (đã mã hoá). Không ghi vào log, không đưa vào tin nhắn.
- Tin nhắn không bao giờ chứa cookie, mật khẩu hay đường dẫn chứa secret; lỗi được cắt ngắn và lọc chuỗi giống token.
- Lệnh bot chỉ chấp nhận từ `chat_id` đã cho phép; mọi lệnh được ghi vào `autopilot_events`.
- Gọi Telegram API từ IP VPS trực tiếp (không qua VPN của acc TikTok).

## Kiểm thử

- Unit test: định dạng tin, dedupe/cooldown, gộp tin, xử lý 429 `retry_after`, cắt tin quá 4.096 ký tự, escape HTML.
- Test tích hợp với Telegram giả (HTTP server cục bộ).
- Trên VPS: lệnh `python3 -m bkt_web.notify test` gửi một tin thử; watchdog được thử bằng cách dừng service trong môi trường thử.

## Cần từ bạn

1. **Tạo bot** bằng @BotFather và gửi **token** (mình sẽ lưu vào key vault trên VPS, không lưu trên máy Mac).
2. **Chat nhận tin**: chat riêng với bot, hoặc một group (thêm bot vào group). Mình sẽ tự lấy `chat_id` sau khi bạn nhắn cho bot một tin.
3. **Tin "render xong"**: gửi **từng video** (khoảng 200 tin/ngày, im lặng) hay **gộp mỗi 30 phút**?
4. Có muốn **giờ yên tĩnh** ban đêm không?

## Ước lượng

| Giai đoạn | Công sức | Phụ thuộc |
|---|---|---|
| 1 | khoảng nửa ngày | token bot + chat_id |
| 2 | khoảng nửa ngày | đăng bài chạy thật từ 26/09 để kiểm chứng |
| 3 | 1–2 ngày | tuỳ số lệnh bot |
