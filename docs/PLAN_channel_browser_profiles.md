# Plan: tận dụng Chrome profile của từng kênh TikTok

Trạng thái: đã triển khai code, chưa bật trên production (2026-09-24). Tài liệu giao việc chi tiết cho agent
lập trình: [IMPL_channel_browser_profiles.md](IMPL_channel_browser_profiles.md).

## Mục tiêu

Mỗi kênh dùng đúng một "máy" (profile) cho mọi thao tác: đăng, quét, đăng nhập lại.
Cookie mới TikTok cấp phải được giữ lại. Cần đo được hiệu quả so với hiện tại.

## Những điểm trong code quyết định cách làm

1. **Chưa dùng profile.** Publisher mở Chromium sạch rồi bơm cookie
   (`bkt_web/tiktok_publisher.py`, đoạn `browser.launch` → `new_context` → `add_cookies`).
   Profile chỉ được mượn múi giờ và toạ độ qua `profile_factory.read_profile_meta`.
2. **Quét kênh chạy sai trình duyệt.** `fetch_tiktok_videos_real` và
   `fetch_tiktok_notifications_real` trong `bkt_web/server.py` dùng Chromium của
   Playwright, không phải Google Chrome đã dựng profile. Nếu chỉ chuyển sang mở profile
   mà giữ binary này thì có thể hỏng profile do lệch phiên bản. Hai chỗ này còn khai
   cứng User-Agent macOS.
3. **Đã có sẵn những thứ dùng lại được** (`bkt_web/vpn_manager.py`):
   - `build_channel_profile`, `cleanup_profile_locks` và `build_persistent_cookie_list`
     (cookie có hạn dùng, không bị Chrome xoá).
   - `launch_channel_browser_profile`: mở Chrome hiện hình, trên VPS là màn hình `:1`,
     xem được qua noVNC.
   - Chế độ **chạy khô** của publisher: làm hết các bước nhưng dừng trước khi bấm Đăng.
     Dùng để thử an toàn.
4. **Xung đột có thật.** Khi mở tay một profile qua noVNC, Chrome đó giữ khoá
   `SingletonLock`. Nếu scheduler mở cùng profile lúc ấy thì sẽ lỗi, hoặc tệ hơn là giết
   cửa sổ đang dùng.

Số liệu VPS lúc lập plan: 203 kênh còn sống, cả 203 đều có `profile_dir` và cookie;
thư mục `bkt_web/profiles/` có 254 profile, khoảng 1 GB.

## Nguyên tắc xuyên suốt

- Mỗi profile chỉ một Chrome tại một thời điểm. Profile đang bận thì **hoãn**, không
  giết cửa sổ, không tính là một lần thử.
- Luôn dùng cùng binary `TOKMATRIX_CHROME_PATH` (Google Chrome) với cùng tham số lưu mật
  khẩu. Không mở profile bằng Chromium của Playwright.
- Không lặng lẽ quay về đường cũ rồi báo thành công. Mỗi lần đăng ghi rõ vào log là đi
  đường profile hay đường sạch.
- Giữ nguyên quy tắc `NEEDS_CHECK` không bao giờ tự bấm Đăng lại.
- Mọi tính năng mới đều có công tắc (setting), mặc định **tắt** hoặc chỉ bật cho danh
  sách kênh thử.

## Giai đoạn 0 — Nền tảng: module `bkt_web/profile_session.py` (cỡ M)

Mọi luồng về sau (đăng, quét, đăng nhập lại, làm mới) chỉ gọi module này.

**0.1. Khoá theo kênh** `acquire(channel_id, owner)`:
- Trong tiến trình server: mỗi kênh một `threading.Lock`.
- Chrome bên ngoài (cửa sổ mở tay): đọc `SingletonLock`, kiểm PID có còn sống và đúng là
  Chrome của profile này không. Còn sống → báo `BUSY` kèm lý do "profile đang mở tay".
- Chrome chết để lại khoá mồ côi → dọn bằng `cleanup_profile_locks` như hiện có.

**0.2. Mở profile** `open_context(channel_id, socks_port, headless=False)`:
- Gọi `launch_persistent_context(profile_dir)` với `executable_path=CHROME_EXEC_PATH`.
- Áp múi giờ, toạ độ và tham số từ `profile_meta.json`, cùng các tham số của
  `profile_factory.chrome_launch_args`.
- Thêm `--disk-cache-size` để profile không phình.
- Dùng `profile_factory.chrome_launch_args` (trên Linux đã có `--password-store=basic`)
  cho **mọi** chỗ mở profile. Hiện `sync_cookies_to_profile` và hai hàm quét kênh không
  gọi hàm này. Nếu các chỗ mở lệch tham số, cookie do Chrome mở tay ghi ra có thể bị
  Playwright đọc thành rỗng. Vẫn phải kiểm chứng trên VPS trước khi bật trên production.

**0.3. Quy tắc cookie khi DB và profile khác nhau.** Lưu `cookie_synced_hash` và
`cookie_synced_at` trong `profile_meta.json`.
- Hash cookie trong DB **khác** `cookie_synced_hash`: vừa nhập cookie mới từ ngoài → bơm
  cookie DB vào profile.
- Bằng nhau: profile đang giữ bản mới hơn → **không** bơm đè.

**0.4. Ghi cookie ngược về DB** `write_back(channel_id, context)` sau mỗi phiên:
- Đọc `context.cookies()` của `*.tiktok.com`.
- Chỉ ghi khi có `sessionid` và giá trị khác bản cũ.
- Mã hoá bằng `SECRET_STORE`, tính lại `cookie_hash` đúng cách các lệnh upsert trong
  `server.py` đang làm, rồi cập nhật meta.

**0.5. Trạng thái phiên.** Thêm cột vào `channels`:
- `session_state`: `OK`, `LOGGED_OUT`, `NO_PROFILE` hoặc `BUSY`.
- `session_checked_at`.
- Nhận biết bị đăng xuất: bị chuyển về `/login`, hoặc TikTok Studio hiện hộp đăng nhập.

**0.6. Sao lưu.** Trước lần đầu một kênh chạy chế độ profile:
- Nén profile (bỏ `Cache`, `Code Cache`, `GPUCache`) vào
  `storage/profile_backups/channel_<id>.tgz`, giữ một bản.
- Có thêm lệnh khôi phục.

## Giai đoạn 1 — Đăng bài bằng profile (cỡ M, rủi ro cao nhất)

Sửa `publish_tiktok_video`: thay `launch()` + `new_context()` + `add_cookies()` bằng
`profile_session`. Các bước tải MP4, điền caption, nhãn AI, bấm Đăng và xác nhận giữ
nguyên.

**Công tắc:** setting `publish_profile_channels` là danh sách id kênh, hoặc `all`, hoặc
rỗng (tắt hẳn).

**Cách xử lý từng tình huống:**

| Tình huống | Hành vi |
| --- | --- |
| Profile bận (đang mở tay) | Trả task về `QUEUED`, `next_retry_at = +5 phút`, **hoàn lại** `attempt_count`, ghi lý do |
| Kênh chưa có profile | Đi đường sạch cũ, log rõ "kênh chưa có profile" (chỉ trong thời gian thử) |
| Bị đăng xuất | `ERROR` "Phiên hết hạn — cần đăng nhập lại", `session_state=LOGGED_OUT`, không thử lại. Không quay sang đường sạch, vì cùng cookie đó cũng sẽ fail |
| Đăng xong (thành công hay lỗi) | `write_back` cookie, đóng Chrome, kiểm tra đã hết khoá |

**Thử dần:**
1. Chạy khô trên 1 kênh.
2. Đăng thật 1 video trên kênh đó.
3. Bật cho 10 kênh trong 2–3 ngày.
4. Bật `all`.

Sau mỗi bước so tỉ lệ `SUCCESS`, `NEEDS_CHECK` và cookie chết với 7 ngày trước đó (lấy
từ `upload_tasks`).

**Rollback:** xoá danh sách kênh thử → quay về đường cũ ngay, không cần deploy.

## Giai đoạn 2 — Quét kênh bằng profile (cỡ S)

- `fetch_tiktok_videos_real` và `fetch_tiktok_notifications_real` chuyển sang
  `profile_session`, bỏ User-Agent macOS khai cứng.
- Profile bận thì bỏ qua kênh đó và báo "đang bận", không chờ.
- Quét xong cũng `write_back` cookie. Lượt quét trở thành một lần "giữ phiên sống" miễn
  phí.

## Giai đoạn 3 — Tự xác minh `NEEDS_CHECK` (cỡ M)

**Cách xác minh** (chỉ đọc, không bao giờ bấm Đăng lại):
1. Nguồn chính: danh sách video của kênh qua chocode (`fetch_channel_videos`, đã chặn dữ
   liệu giả). Không cần mở trình duyệt.
2. Nếu API không có dữ liệu: mở trang nội dung của TikTok Studio bằng profile (dùng khoá
   của giai đoạn 0).

**Luật khớp video:**
- `create_time` nằm trong khoảng từ `clicked_post_at − 2 phút` đến `+ 60 phút`.
- **Và** 40 ký tự đầu của caption khớp sau khi chuẩn hoá, hoặc trùng ít nhất 2 hashtag.

**Lịch kiểm tra:** sau +10 phút, +30 phút, +2 giờ, +6 giờ.

**Kết quả:**
- Đúng 1 video khớp → `SUCCESS`, lưu `result_url` và `published_video_id`, ghi chú "tự
  xác nhận bằng video X". Chuyển thẳng sang `SUCCESS` hay chỉ gợi ý để bấm tay: xem câu
  hỏi 2.
- Không có video nào sau lần cuối → giữ `NEEDS_CHECK`, ghi "không tìm thấy sau 6 giờ —
  kiểm tra tay".
- Hơn 1 video khớp → giữ nguyên, liệt kê các ứng viên.

**Thay đổi DB:** thêm vào `upload_tasks` các cột `verify_attempts`, `next_verify_at`,
`verify_note`, `published_video_id` (migration trong `publish_flow.py`).

**Chạy nền:** thread `needs-check-verifier`, 60 giây quét một lần.

## Giai đoạn 4 — Đăng nhập lại qua noVNC (cỡ M)

**Mở profile để đăng nhập:** `POST /api/channels/{id}/profile/open-login`
- Dùng lại `launch_channel_browser_profile`, nhưng **không** bơm cookie DB (đã chết) khi
  `session_state=LOGGED_OUT`.
- Mở thẳng trang đăng nhập TikTok.

**Lưu phiên sau khi đăng nhập xong:** `POST /api/channels/{id}/profile/save-session`
1. Đóng êm cửa sổ Chrome của đúng profile đó (SIGTERM, chờ 5 giây).
2. Mở lại profile ở chế độ ẩn, đọc cookie.
3. Xác minh bằng `check_single_cookie_live`.
4. Ghi cookie vào DB, đặt `session_state=OK`, tắt tunnel.

Luồng này làm giống cách module nuôi nick lưu phiên Facebook
(`capture_account_profile_session` trong `nuoinick_routes.py`).

**Giao diện:** trên dòng kênh có nút "Đăng nhập lại": mở link noVNC + nút "Lưu phiên".
Kênh `LOGGED_OUT` được tô đỏ.

## Giai đoạn 5 — Làm mới phiên định kỳ (cỡ S, mặc định tắt)

- Thread `profile-keeper` bật bằng setting `profile_keeper_enabled`.
- Cứ 10 phút chọn 1 kênh thoả các điều kiện: đã quá 72 giờ chưa kiểm tra, không có lịch
  đăng trong ±45 phút, không bận.
- Mở profile hiện hình trên Xvfb qua VPN của kênh, vào trang For You 15–25 giây,
  `write_back` cookie, cập nhật `session_state`.
- Công suất tối đa 144 kênh/ngày, dư so với mức cần (203 kênh / 3 ngày ≈ 68 kênh/ngày).

**Không làm:** làm ấm bằng cách lướt feed trước khi đăng. Chưa có bằng chứng nó giúp tăng
reach, trong khi tốn thời gian và băng thông VPN × 203 kênh. Để sau, khi đã có số liệu từ
giai đoạn 1.

## Giao diện và sơ đồ luồng

- Bảng kênh thêm cột **Phiên** (OK / Hết hạn / Chưa có profile / Đang mở) kèm thời gian
  kiểm tra gần nhất.
- Sơ đồ luồng "Đăng TikTok" (`bkt_web/static/flow_view.js` + `bkt_web/flow_routes.py`):
  - Thêm sub-node **Chrome profile** dưới "Đang đăng".
  - Thêm node **Tự xác minh** nối từ "Cần kiểm tra": `true` sang "Đã đăng", `false` ở lại
    chờ kiểm tra tay.
  - Thêm node phụ **Hoãn (profile bận)**.

## Kiểm thử

- **`tests/test_profile_session.py` (mới):**
  - Khoá báo bận khi có Chrome ngoài giữ `SingletonLock`, và không giết Chrome đó.
  - Quy tắc cookie: DB đổi thì bơm, DB không đổi thì không bơm.
  - `write_back` chỉ ghi khi có `sessionid`, và tính `cookie_hash` đúng.
  - Chỉ sao lưu một lần.
- **Publisher:**
  - Profile bận → trả về `QUEUED` và hoàn lại lượt thử.
  - Đăng xuất → `ERROR`, không thử lại.
  - Công tắc tắt → chạy đúng đường cũ.
- **Verifier:** đủ 3 trường hợp khớp 0, 1 và nhiều video. Test phải chứng minh verifier
  không bao giờ gọi tới bước bấm Đăng.
- `tests/test_publish_flow.py` và `tests/test_chocode_tiktok.py` hiện có phải vẫn pass.
- **Kiểm tra tay trên VPS** (bắt buộc trước giai đoạn 1): mở tay 1 profile qua noVNC, đóng
  lại, rồi mở bằng Playwright xem còn đọc được cookie không. Đây là để kiểm chứng tham số
  lưu mật khẩu ở mục 0.2.

## Rủi ro

| Rủi ro | Cách chặn |
| --- | --- |
| Hỏng profile (Chrome crash, lệch phiên bản) | Sao lưu trước lần đầu, dùng một binary duy nhất, có lệnh khôi phục |
| Scheduler giết cửa sổ đang mở tay | Profile bận → hoãn, chỉ dọn khoá khi PID đã chết |
| Profile phình dung lượng (hiện ~1 GB / 254 profile) | Giới hạn cache, dọn thư mục cache hằng tuần |
| Cookie DB mới bị profile ghi đè | Quy tắc so hash ở mục 0.3 |
| Tự xác nhận nhầm video | Luật khớp chặt, nhiều video khớp thì không tự xác nhận, lưu `published_video_id` làm bằng chứng |

## Thứ tự làm đề xuất

1. Giai đoạn 0 kèm bài kiểm tra tay trên VPS.
2. Giai đoạn 1, thử dần qua các bước như trên.
3. Giai đoạn 3.
4. Giai đoạn 2.
5. Giai đoạn 4.
6. Giai đoạn 5 (tuỳ chọn).

Giai đoạn 3 xếp trước giai đoạn 2 vì nó bớt việc tay ngay. Giai đoạn 2 chủ yếu là dọn cho
nhất quán.

## Câu hỏi cần chủ dự án quyết

1. **Cookie DB và profile lệch nhau:** đồng ý quy tắc ở mục 0.3 không? Tóm gọn: vừa nhập
   cookie mới thì cookie đó thắng; còn lại tin profile.
2. **`NEEDS_CHECK` khớp đúng 1 video:** tự chuyển thẳng sang `SUCCESS`, hay chỉ gợi ý rồi
   bấm xác nhận tay?
3. **Giai đoạn 5 (làm mới phiên định kỳ):** có làm không? Chu kỳ 72 giờ có ổn không?
4. **Kênh thử cho giai đoạn 1:** chọn kênh nào, hay chọn một kênh ít quan trọng?
