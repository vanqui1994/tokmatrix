# Triển khai: dùng Chrome profile của từng kênh TikTok

Tài liệu giao việc cho agent lập trình. Bản plan gốc, lý do và bối cảnh nằm ở
[PLAN_channel_browser_profiles.md](PLAN_channel_browser_profiles.md). Đọc cả file đó và
[AGENTS.md](../AGENTS.md) trước khi bắt đầu.

Làm theo thứ tự ở mục 0. Mỗi task có phần **Nghiệm thu**; chưa đạt thì chưa sang task
sau. Hết T13 thì dừng và báo cáo theo mục "Báo cáo cuối".

---

## 0. Sprint

**Mục tiêu:** toàn bộ code để mỗi kênh đăng, quét và đăng nhập lại bằng chính Chrome
profile của nó, cộng với công cụ đo hiệu quả. Mọi thứ nằm sau công tắc đang tắt; bật trên
production là việc của người, sau sprint.

**Demo cuối sprint** (trên máy local, dữ liệu giả hoặc DB tạm):
1. Mở **Cài Đặt Hệ Thống → Chrome profile kênh**, thêm 1 id kênh vào danh sách thử, lưu.
2. Gọi chạy khô cho kênh đó: log ghi "đường profile", `cookie_source`, và dừng trước khi
   bấm Đăng.
3. Giả lập profile đang mở tay (tạo `SingletonLock` trỏ một tiến trình sống): task bị hoãn
   5 phút, `attempt_count` không tăng.
4. Một task `NEEDS_CHECK` có video khớp trong dữ liệu chocode giả: danh sách upload hiện
   gợi ý kèm link video, trạng thái vẫn `NEEDS_CHECK`.
5. Sơ đồ luồng "Đăng TikTok" hiện node Profile và node Tự xác minh với số liệu.
6. Bảng so sánh ở T12 hiện hai cột "profile" và "sạch".

**Ước lượng và phụ thuộc** (S ≈ nửa ngày, M ≈ 1 ngày, L ≈ 2 ngày công lập trình):

| Task | Cỡ | Cần xong trước |
| --- | --- | --- |
| T1 Setting và migration | S | — |
| T2 Khoá theo kênh | S | T1 |
| T3 Mở profile, cookie, sao lưu | M | T2 |
| T4 Publisher đi đường profile | L | T3 |
| T5 Quét kênh đi đường profile | M | T3 |
| T6 Verifier `NEEDS_CHECK` | M | T1 |
| T7 Đăng nhập lại qua noVNC | M | T3 |
| T8 Làm mới phiên định kỳ | S | T3 |
| T9 Sơ đồ luồng | S | T4, T6 |
| T10 Tài liệu | S | tất cả task code |
| T11 API + giao diện setting | S | T1 |
| T12 Đo hiệu quả | M | T4 |
| T13 Bảo trì profile + CLI | S | T3 |

Thứ tự làm: T1 → T2 → T3 → T11 → T4 → T12 → T6 → T5 → T7 → T13 → T8 → T9 → T10.
Tổng khoảng 9–10 ngày công. Nếu phải cắt, giữ T1–T4, T6, T11, T12 (đủ để bật thử một
kênh và đo được); T5, T7, T8, T13 làm sprint sau.

**Definition of Done của sprint:**
- Mọi task đạt phần Nghiệm thu; toàn bộ lệnh ở mục 5 chạy qua, dán kết quả vào báo cáo.
- Với mọi setting ở giá trị mặc định, hành vi đăng bài giống hệt trước sprint (có test
  chứng minh ở T4).
- Không có đường nào bấm Đăng lại task đã có `clicked_post_at`, không có đường nào kill
  Chrome đang mở tay trừ `save-session` (người bấm).
- README, AGENTS.md, hai file plan đã cập nhật (T10).

**Việc của người, không giao cho agent:**
- Trước sprint: không có.
- Sau sprint, theo đúng thứ tự: deploy lên VPS → kiểm tra tay `--password-store` (mở profile
  qua noVNC, đóng, `save-session` đọc được cookie) → chạy khô 1 kênh → bật 1 kênh, đăng thật
  1 video → 10 kênh trong 2–3 ngày, xem bảng T12 → `all`. Rollback bất cứ lúc nào: xoá danh
  sách kênh thử ở màn hình T11.

**Ngoài phạm vi sprint này:**
- Verifier đọc TikTok Studio bằng profile khi chocode không có dữ liệu (plan giai đoạn 3,
  nguồn phụ). Sprint này verifier chỉ dùng chocode.
- Làm ấm trước khi đăng.
- Ba lỗi đã biết trong README: cleanup Autopilot tìm `POSTED`, dashboard đếm `FAILED`,
  scriptwriter nhận `401`.

---

## 1. Quy tắc bắt buộc

1. **Không deploy, không SSH lên VPS, không restart server** đang chạy ở cổng 8080. Chỉ
   làm trong mã nguồn local.
2. **Không mở TikTok thật, không đăng bài thật, không gọi mạng thật trong test.** Mọi test
   phải mock Playwright, `vpn_manager.start_wireguard_proxy`, chocode và thời gian.
3. **Mọi tính năng mới mặc định tắt.** Không tự bật setting nào trong database thật
   (`bkt_web/bkt_channels.db`). Bật cho kênh thử là việc của người.
4. **Không bao giờ bấm Đăng lại** một task đã có `clicked_post_at`. Verifier ở T6 chỉ đọc.
5. **Không lặng lẽ quay về đường cũ rồi báo thành công.** Mỗi nhánh phải ghi log nói rõ nó
   đi đường nào (`profile` hay `clean`).
6. Không đụng `bkt_web/.secret.key`, `bkt_web/.webauth.json`, `bkt_web/profiles/` thật,
   `vpn_configs/`. Test dùng thư mục tạm.
7. Giữ phong cách code hiện có: comment tiếng Việt, cùng mật độ comment, dùng
   `connect_db` từ `bkt_web/db_utils.py`, import kép `try: from bkt_web import x /
   except ImportError: import x` như các module khác.
8. Repo không dùng git. Không tạo commit; liệt kê file đã sửa trong báo cáo cuối.

## 2. Quyết định đã chốt (thay cho 4 câu hỏi mở trong plan)

Chọn phương án thận trọng. Người dùng có thể đổi sau bằng setting.

| Câu hỏi | Chốt |
| --- | --- |
| Cookie DB lệch profile | Theo mục 0.3 của plan: hash cookie DB khác `cookie_synced_hash` trong meta → bơm cookie DB; bằng nhau → tin profile |
| `NEEDS_CHECK` khớp đúng 1 video | **Chỉ gợi ý**: ghi `verify_note` + `published_video_id`, giữ `NEEDS_CHECK`. Tự chuyển `SUCCESS` chỉ khi setting `needs_check_auto_confirm` = `true` (mặc định `false`) |
| Làm mới phiên định kỳ | Có code, setting `profile_keeper_enabled` mặc định `false`, chu kỳ `profile_keeper_interval_hours` mặc định `72` |
| Kênh thử | Không chọn. Setting `publish_profile_channels` mặc định rỗng = tắt |

Tất cả setting nằm trong bảng `settings(key, value)` của `bkt_channels.db`, cách đọc
giống `chocode_tiktok.py` (`SELECT value FROM settings WHERE key=?`).

## 3. Bản đồ code cần biết

| Chỗ | Ghi chú |
| --- | --- |
| `bkt_web/tiktok_publisher.py` → `publish_tiktok_video(...)` | Hiện `p.chromium.launch(...)` → `browser.new_context(**context_kwargs)` → `context.add_cookies(parse_cookie_string(cookie_str))`. Có `mark_task(status, error, result_url)`, tham số `dry_run`, `headless` (qua `resolve_headless`), `task_id`. Tunnel VPN bật bằng `vpn_manager.start_wireguard_proxy` và tắt trong `finally`. Đọc `profile_dir` từ `channels` |
| `bkt_web/server.py` → `run_upload_scheduler` | Nhận task bằng `BEGIN IMMEDIATE`, `SET status='UPLOADING', attempt_count=attempt_count+1`. Sau `publish_tiktok_video`: `result["clicked"]` → không thử lại; lỗi và còn lượt → `QUEUED` + `next_retry_at = now + 60·2ⁿ` |
| `bkt_web/server.py` → khối migration khởi động | Thêm cột `upload_tasks` qua `publish_flow.UPLOAD_COLUMNS`; cột `channels` được thêm bằng `ALTER TABLE` có kiểm tra `existing_cols` (xem `profile_dir`, `cookie_hash`) |
| `SECRET_STORE.encrypt / decrypt / fingerprint` | `cookie_hash = SECRET_STORE.fingerprint(plain_cookie)`; cookie lưu `SECRET_STORE.encrypt(plain_cookie)` |
| `bkt_web/vpn_manager.py` | `PROFILES_DIR`, `ensure_profile_dir`, `cleanup_profile_locks(p_dir, socks_port)`, `build_persistent_cookie_list(cookie_str)`, `sync_cookies_to_profile` (**thiếu** `executable_path` và `chrome_launch_args`), `build_channel_profile`, `launch_channel_browser_profile` (mở Chrome hiện hình bằng `subprocess.Popen`), `CHROME_EXEC_PATH` |
| `bkt_web/profile_factory.py` | `read_profile_meta`, `write_profile_meta`, `resolve_profile_config`, `chrome_launch_args` (đã thêm `--password-store=basic` trên Linux), `chrome_launch_env` |
| `bkt_web/server.py` → `fetch_tiktok_videos_real(username, cookie_str, max_wait, socks_port)` và `fetch_tiktok_notifications_real(cookie_str, max_wait, socks_port)` | Dùng Chromium của Playwright + User-Agent macOS khai cứng. Người gọi: `fetch_channel_videos_authentic`, `get_channel_notifications` |
| `bkt_web/chocode_tiktok.py` → `fetch_channel_videos(username, max_items, detail_limit)` | Nguồn video thật (đã chặn dữ liệu giả) cho verifier |
| `POST /api/upload/tasks/{id}/confirm` | Chuyển `NEEDS_CHECK` → `SUCCESS` |
| `POST /api/channels/{ch_id}/profile/launch`, `GET /api/system/remote-view` | Mở profile hiện hình; URL noVNC |
| `bkt_web/nuoinick_routes.py` → `capture_account_profile_session` | Mẫu luồng "lưu phiên" để tham khảo |
| `bkt_web/flow_routes.py` + `bkt_web/static/flow_view.js` | Sơ đồ luồng; node publish hiện có: `source, channel, preflight, wait_render, queue, uploading, vpn, cookie, browser, confirm, success, needs_check, error, cancelled` |
| `bkt_web/static/app.js` | Bảng kênh dựng quanh `openChannelVideos(${ch.id})` (~dòng 335); danh sách upload task có nút `confirm` (~dòng 4157) |
| `tests/test_publish_flow.py` | Mẫu test: SQLite tạm + `unittest.mock` |

---

## 4. Các task

### T1. Setting và migration

**Làm:**
- Tạo `bkt_web/profile_session.py` với hai hàm `get_setting(key, default="", db_path=None)`
  và `set_setting(key, value, db_path=None)`. Đọc lỗi (thiếu bảng) → trả `default`.
- Trong khối migration của `server.py`, thêm 2 cột `channels` theo đúng mẫu `profile_dir`:
  `session_state TEXT DEFAULT ''`, `session_checked_at INTEGER DEFAULT 0`.
- Thêm vào `publish_flow.UPLOAD_COLUMNS`: `verify_attempts INTEGER DEFAULT 0`,
  `next_verify_at INTEGER DEFAULT 0`, `verify_note TEXT DEFAULT ''`,
  `published_video_id TEXT DEFAULT ''`, `publish_mode TEXT DEFAULT ''` (`profile` hoặc
  `clean`, T4 ghi, T12 đọc).
- Tạo bảng `channel_session_events(id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id
  INTEGER, state TEXT, source TEXT, created_at INTEGER)` + index `(channel_id,
  created_at)`.
- `GET /api/channels` trả thêm `session_state`, `session_checked_at`.

**Nghiệm thu:** khởi tạo DB mới và DB cũ đều không lỗi; test đọc/ghi setting; cột mới có
mặt sau migration.

### T2. Khoá theo kênh

Trong `profile_session.py`:

- `class ProfileBusy(Exception)` mang `reason` (`"in_process"` hoặc `"external_chrome"`)
  và `pid`.
- `@contextmanager def acquire(channel_id, owner: str)`:
  - Một `threading.Lock` cho mỗi `channel_id` (dict có khoá bảo vệ). Không chờ:
    `lock.acquire(blocking=False)` thất bại → `ProfileBusy("in_process")`.
  - Sau đó gọi `external_chrome_pid(p_dir)`: đọc symlink `SingletonLock` (định dạng
    `<host>-<pid>`), PID còn sống **và** lệnh `ps -p <pid> -o command=` chứa đường dẫn
    `p_dir` và chữ `chrome` → `ProfileBusy("external_chrome", pid)`. **Không kill.**
  - PID đã chết → xoá `SingletonLock`, `SingletonCookie`, `SingletonSocket` mồ côi.
  - Luôn nhả lock trong `finally`.
- Ghi `owner` và thời điểm vào một dict trạng thái để UI/flow đọc được (`busy_channels()`).

**Nghiệm thu (`tests/test_profile_session.py`):**
- Hai lần `acquire` lồng nhau cùng kênh → lần hai ném `ProfileBusy("in_process")`.
- `SingletonLock` trỏ PID sống, `ps` (mock) trả dòng Chrome của đúng `p_dir` →
  `ProfileBusy("external_chrome")`, và `os.kill` **không** được gọi.
- PID chết → lock được dọn, `acquire` thành công.

### T3. Mở profile, quy tắc cookie, ghi ngược cookie, sao lưu

Trong `profile_session.py`:

- `launch_kwargs(cfg, socks_port, headless) -> dict` dùng chung cho mọi chỗ mở profile:
  `executable_path=CHROME_EXEC_PATH` (nếu tồn tại), `headless`, `proxy`, `timezone_id`,
  `geolocation` + `permissions`, `args=["--disable-blink-features=AutomationControlled",
  "--no-sandbox", "--disk-cache-size=52428800"] + profile_factory.chrome_launch_args(cfg)`,
  `viewport={"width": 1440, "height": 900}`, `locale` theo quốc gia (tái dùng
  `COUNTRY_LOCALES` của publisher; chuyển nó sang `profile_factory` nếu cần để tránh import
  vòng).
- `async def open_context(playwright, channel_id, socks_port, headless) -> (context, info)`:
  - Không có `profile_dir` hoặc thư mục không tồn tại → ném `ProfileMissing`.
  - `cfg = read_profile_meta(p_dir) or resolve_profile_config(country, vpn_location)`.
  - Gọi `backup_once(channel_id, p_dir)` trước lần mở đầu tiên.
  - `playwright.chromium.launch_persistent_context(str(p_dir), **launch_kwargs(...))`.
  - Áp quy tắc cookie: `db_hash = SECRET_STORE.fingerprint(db_cookie)`; nếu
    `db_hash != meta.get("cookie_synced_hash")` → `context.add_cookies(
    build_persistent_cookie_list(db_cookie))` và ghi `info["cookie_source"]="db"`, ngược
    lại `"profile"`.
- `async def write_back(channel_id, context) -> bool`:
  - Lấy cookie `context.cookies()` có domain chứa `tiktok.com`; ghép thành chuỗi
    `name=value; ...` cùng định dạng `parse_cookie_string` đọc được.
  - Không có `sessionid` → trả `False`, không ghi.
  - Khác cookie DB hiện tại → `UPDATE channels SET cookie=?, cookie_hash=?`
    (`encrypt`, `fingerprint`). Xử lý `sqlite3.IntegrityError` của index duy nhất
    `cookie_hash`: log cảnh báo, không ghi, trả `False`.
  - Luôn cập nhật meta `cookie_synced_hash`, `cookie_synced_at`.
- `def mark_session(channel_id, state, source)`: ghi `session_state`, `session_checked_at`;
  nếu `state` khác giá trị cũ thì thêm một dòng `channel_session_events` (`source` là
  `publish`, `scan`, `save-session`, `keeper`).
- `async def is_logged_out(page) -> bool`: URL chứa `/login` hoặc có phần tử form đăng
  nhập (selector lấy từ publisher nếu đã có; không thì `input[name="username"]`,
  `[data-e2e="login-modal"]`). Viết thành hàm thuần để mock được.
- `backup_once(channel_id, p_dir)`: nếu chưa có
  `bkt_web/storage/profile_backups/channel_<id>.tgz` thì nén `p_dir`, bỏ `Cache`,
  `Code Cache`, `GPUCache`, `Singleton*`. Hàm `restore_backup(channel_id)` giải nén vào
  `p_dir` (chỉ gọi tay, không có route).
- `clean_caches(p_dir)`: xoá `Cache`, `Code Cache`, `GPUCache` bên trong `Default/`.
- Sửa `vpn_manager.sync_cookies_to_profile` để dùng `executable_path=CHROME_EXEC_PATH` và
  `profile_factory.chrome_launch_args` giống hệt các chỗ khác (hiện nó dùng
  `channel="chrome"` và thiếu `--password-store=basic`).

**Nghiệm thu:**
- Cookie DB đổi → `add_cookies` được gọi; không đổi → không gọi.
- `write_back` không ghi khi thiếu `sessionid`; ghi đúng `encrypt` + `fingerprint` khi có;
  gặp `IntegrityError` thì không ném ra ngoài.
- `backup_once` chỉ tạo file một lần, không chứa thư mục cache.

### T4. Publisher đi đường profile

Sửa `publish_tiktok_video`:

- Thêm tham số `use_profile: Optional[bool] = None`. `None` → đọc setting
  `publish_profile_channels`: rỗng = tắt; `all` = bật; còn lại là danh sách id cách nhau
  dấu phẩy.
- Nhánh profile (khi bật và kênh có profile):
  - `with profile_session.acquire(channel_id, owner=f"publish:{task_id}")` bao toàn bộ
    phiên trình duyệt.
  - `ProfileBusy` → log, **không** gọi `mark_task`, trả
    `{"success": False, "deferred": True, "error": "Profile đang mở — hoãn 5 phút"}`.
  - `ProfileMissing` → log "kênh chưa có profile — dùng đường sạch" rồi chạy nhánh cũ.
  - Mở bằng `open_context`, ghi log `cookie_source`.
  - Sau `page.goto(UPLOAD_URL)`: `is_logged_out(page)` → `mark_session(LOGGED_OUT)`,
    `mark_task("ERROR", "Phiên hết hạn — cần đăng nhập lại")`, trả
    `{"success": False, "no_retry": True, "logged_out": True, ...}`.
  - Trước khi đóng context (mọi kết cục, kể cả lỗi sau khi bấm Đăng): `write_back`, rồi
    `mark_session(OK)` nếu không bị đăng xuất.
- Nhánh cũ giữ nguyên hành vi, thêm một dòng log "đường sạch (không dùng profile)".
- Khi có `task_id` và không `dry_run`: ghi `upload_tasks.publish_mode` = `profile` hoặc
  `clean` ngay khi biết đi đường nào.
- Các bước upload/caption/nhãn AI/bấm Đăng/xác nhận dùng chung cho cả hai nhánh: tách
  thành hàm `async def _run_upload(page, ...)` thay vì chép đôi.

Sửa `run_upload_scheduler` trong `server.py`:
- `result.get("deferred")` → `UPDATE upload_tasks SET status='QUEUED',
  attempt_count=?, next_retry_at=? WHERE id=?` với `attempt_count = previous_attempts`
  (hoàn lượt) và `next_retry_at = now + 300`.
- `result.get("no_retry")` → không đưa về `QUEUED`.
- Nhánh `clicked` giữ nguyên, kiểm tra trước hai nhánh trên.

**Nghiệm thu (mock Playwright bằng object giả có `goto`, `cookies`, `add_cookies`,
`close`, và thay `_run_upload`):**
- Setting rỗng → không gọi `open_context`, log có "đường sạch".
- Kênh trong danh sách + `ProfileBusy` → trả `deferred`; scheduler đặt lại
  `attempt_count` bằng giá trị trước khi nhận, `status='QUEUED'`.
- Đăng xuất → `ERROR`, `session_state='LOGGED_OUT'`, scheduler không đưa về `QUEUED`.
- Thành công → `write_back` được gọi đúng một lần.
- `dry_run=True` đi đường profile vẫn dừng trước bấm Đăng và không `mark_task`.
- `publish_mode` được ghi đúng cho cả hai nhánh.
- Setting mặc định (rỗng): chuỗi lời gọi Playwright giống hệt bản trước sprint
  (`launch` → `new_context` → `add_cookies`), không gọi `profile_session` ngoài việc đọc
  setting.
- `tests/test_publish_flow.py` vẫn pass.

### T5. Quét kênh đi đường profile

- Thêm tham số `channel_id: Optional[int] = None` cho `fetch_tiktok_videos_real` và
  `fetch_tiktok_notifications_real`; người gọi (`fetch_channel_videos_authentic`,
  `get_channel_notifications`) truyền `ch_id`.
- Có `channel_id` và kênh có profile → dùng `acquire(owner="scan")` + `open_context`
  (headless theo `resolve_headless`), phần bắt response giữ nguyên, cuối phiên
  `write_back`.
- `ProfileBusy` → trả `([], False, "Profile đang mở — bỏ qua lần quét này")`, không chờ.
- Nhánh không có profile: vẫn chạy như cũ nhưng **bỏ** `user_agent` macOS khai cứng và
  thêm `executable_path=CHROME_EXEC_PATH` nếu tồn tại.
- Không đổi setting nào: quét luôn dùng profile khi có (không cần công tắc riêng, vì quét
  chỉ đọc). Nếu thấy rủi ro, thêm setting `scan_use_profile` mặc định `true` và ghi rõ
  trong báo cáo.

**Nghiệm thu:** test mock cho 3 nhánh (có profile, bận, không profile); grep không còn
chuỗi `Macintosh; Intel Mac OS X` trong hai hàm này.

### T6. Verifier cho `NEEDS_CHECK`

Tạo `bkt_web/needs_check_verifier.py`:

- `match_candidates(task, videos) -> list`: thuần, không I/O.
  - `create_time` trong `[clicked_post_at - 120, clicked_post_at + 3600]`.
  - **Và** (40 ký tự đầu caption khớp sau chuẩn hoá: bỏ hashtag, emoji, khoảng trắng thừa,
    `casefold`) **hoặc** trùng ít nhất 2 hashtag.
- `verify_once(task_id) -> dict`:
  - Lấy task + `username` kênh. Gọi `chocode_tiktok.fetch_channel_videos(username,
    max_items=30, detail_limit=0)`; lỗi hoặc dữ liệu giả → coi như chưa có dữ liệu.
    Không mở trình duyệt ở phiên bản này.
  - 1 ứng viên → `published_video_id`, `verify_note="Tìm thấy video <id> lúc <giờ>"`.
    Nếu `needs_check_auto_confirm == "true"` → `status='SUCCESS'`, `uploaded_at`,
    `result_url` = URL video, `error_message=''`. Ngược lại giữ `NEEDS_CHECK`.
  - 0 ứng viên → tăng `verify_attempts`, đặt `next_verify_at` theo lịch
    `[600, 1800, 7200, 21600]` tính từ `clicked_post_at`; hết lịch →
    `verify_note="Không tìm thấy sau 6 giờ — kiểm tra tay"`, `next_verify_at=0`.
  - Nhiều ứng viên → `verify_note` liệt kê id, không đổi trạng thái.
  - **Không** import hay gọi bất cứ thứ gì trong `tiktok_publisher`.
- `run_verifier(stop_event)`: thread `needs-check-verifier`, 60 giây một lần, lấy tối đa 5
  task `status='NEEDS_CHECK' AND clicked_post_at>0 AND next_verify_at BETWEEN 1 AND now`
  (task mới vào `NEEDS_CHECK` có `next_verify_at=0` → đặt lần đầu
  `clicked_post_at + 600`). Chạy luôn khi server bật; setting `needs_check_verifier_enabled`
  mặc định `true` vì chỉ đọc.
- Khởi động thread trong `app_startup` cạnh `upload-scheduler`, dừng khi shutdown.
- UI: trong danh sách upload task, hàng `NEEDS_CHECK` hiển thị `verify_note`; nếu có
  `published_video_id` thì hiện link video và giữ nút "Đã lên" để người bấm xác nhận.

**Nghiệm thu:**
- `match_candidates`: đủ 3 trường hợp 0 / 1 / nhiều, cả trường hợp lệch thời gian.
- `verify_once` với `auto_confirm` tắt không đổi `status`; bật thì thành `SUCCESS`.
- Test chứng minh module không import `tiktok_publisher` (kiểm `sys.modules` hoặc đọc AST).

### T7. Đăng nhập lại qua noVNC

Trong `server.py` (hoặc router mới `bkt_web/profile_routes.py` gắn prefix
`/api/channels`):

- `POST /api/channels/{ch_id}/profile/open-login`: gọi phiên bản của
  `launch_channel_browser_profile` có tham số `sync_cookie: bool` và `start_url`; ở đây
  `sync_cookie = session_state != "LOGGED_OUT"` và `start_url =
  "https://www.tiktok.com/login"`. Trả kèm URL từ `/api/system/remote-view`.
- `POST /api/channels/{ch_id}/profile/save-session`:
  1. Tìm PID Chrome giữ `SingletonLock` của đúng `p_dir` (dùng lại hàm của T2); có thì
     `SIGTERM`, chờ tối đa 5 giây cho lock biến mất; không biến mất → `409`.
  2. Bật tunnel của kênh, `acquire(owner="save-session")`, `open_context(headless=True)`,
     mở `https://www.tiktok.com/`, kiểm `is_logged_out`.
  3. Đăng nhập được → `write_back` (bắt buộc có `sessionid`), `mark_session(OK)`; không →
     `409` "Chưa đăng nhập xong", `mark_session(LOGGED_OUT)`.
  4. Luôn tắt tunnel trong `finally`.
- UI bảng kênh: cột **Phiên** (OK xanh, Hết hạn đỏ, trống xám) + thời gian
  `session_checked_at`; menu dòng kênh thêm "Đăng nhập lại" (gọi `open-login`, mở tab
  noVNC) và "Lưu phiên" (gọi `save-session`, toast kết quả).

**Nghiệm thu:** test route với mọi phụ thuộc mock: có PID → `SIGTERM` đúng PID đó;
lock không mất → `409`; không `sessionid` → không ghi DB. `node --check
bkt_web/static/app.js` pass.

### T8. Làm mới phiên định kỳ (mặc định tắt)

> **Đã loại khỏi phạm vi (2026-09-24):** không triển khai worker tự mở tài khoản định kỳ. Setting `profile_keeper_*` đã gỡ khỏi API và giao diện.

Tạo hàm `run_profile_keeper(stop_event)` (trong `profile_session.py` hoặc module riêng),
thread `profile-keeper`:

- Mỗi 600 giây, nếu `profile_keeper_enabled != "true"` → bỏ qua.
- Chọn **1** kênh: `status != 'DIE'`, có `profile_dir`,
  `session_checked_at < now - interval_hours*3600`, không có `upload_tasks`
  `QUEUED/PENDING/UPLOADING` với `schedule_time` trong ±2700 giây, không nằm trong
  `busy_channels()`.
- Bật tunnel, `acquire(owner="keeper")`, `open_context(headless=resolve_headless())`, vào
  `https://www.tiktok.com/foryou`, chờ ngẫu nhiên 15–25 giây, `is_logged_out` →
  `mark_session`, `write_back`, `clean_caches`. Tắt tunnel trong `finally`.
- Khởi động thread trong `app_startup`.

**Nghiệm thu:** setting tắt → không chọn kênh nào; bật → chọn đúng kênh theo điều kiện
(test SQL với DB tạm); kênh có lịch đăng gần bị loại.

### T9. Sơ đồ luồng

- `flow_routes.publish_snapshot`:
  - Node `profile` (sub-node dưới `uploading`): đếm kênh theo `session_state`
    (`OK`, `LOGGED_OUT`, trống) và `len(profile_session.busy_channels())`; `note` ghi
    trạng thái setting `publish_profile_channels`.
  - Node `verifier`: đếm task `NEEDS_CHECK` có `next_verify_at > 0` (đang chờ kiểm),
    có `published_video_id` (đã tìm thấy), `verify_note` "Không tìm thấy" (hết lịch).
  - Task `QUEUED` có `error_message` chứa "Profile đang mở" đếm vào khoá `deferred` của
    node `queue`.
- `static/flow_view.js`:
  - Thêm sub-node `profile` (icon `browser` hoặc `db`, `parent: 'uploading'`, port
    `'Profile'`), dời 3 sub-node hiện có để 4 node không đè nhau.
  - Thêm node `verifier` (`kind: 'if'`, nhãn "Tự xác minh") sau `needs_check`, cạnh
    `true` → `success`, `false` → quay lại `needs_check` không cần vẽ (ghi trong `desc`).
  - Thêm nhãn `deferred: 'hoãn (profile bận)'` vào `KEY_LABEL`.
  - Tăng `?v=` của `flow_view.js` trong `index.html`.

**Nghiệm thu:** `node --check bkt_web/static/flow_view.js`; snapshot `publish` trên DB tạm
trả đủ khoá node mới; không node nào trong bố cục đè lên node khác (kiểm bằng khoảng cách
toạ độ ≥ kích thước node).

### T10. Tài liệu

- `README.md`: thêm mục "Chrome profile của kênh" (cách bật `publish_profile_channels`,
  quy tắc cookie, hoãn khi bận, verifier, đăng nhập lại, keeper) và cập nhật mục "Vấn đề
  đã biết" nếu có thay đổi.
- `AGENTS.md`: thêm một gạch đầu dòng ngắn: module `profile_session.py`, các setting và
  quy tắc "không kill Chrome mở tay, không bấm Đăng lại".
- Ghi setting, API T11/T12 và CLI T13 vào mục README ở trên.
- `docs/PLAN_channel_browser_profiles.md`: đổi dòng trạng thái thành "đã triển khai code,
  chưa bật trên production".
- Tăng `?v=` của `app.js` trong `index.html` nếu đã sửa `app.js`.

### T11. API và giao diện setting

- Router mới hoặc trong `server.py`:
  - `GET /api/channels/profile-settings` → `{publish_profile_channels, needs_check_auto_confirm,
    needs_check_verifier_enabled, profile_keeper_enabled, profile_keeper_interval_hours,
    profile_cache_clean_enabled}` với giá trị mặc định khi chưa có dòng.
  - `PUT /api/channels/profile-settings` nhận một phần các khoá trên, kiểm từng khoá:
    - `publish_profile_channels`: rỗng, `all`, hoặc danh sách số nguyên dương cách nhau
      dấu phẩy; mọi id phải tồn tại trong `channels` và có `profile_dir`, sai → `400` kèm
      danh sách id lỗi. Lưu dạng đã chuẩn hoá (sắp xếp, bỏ trùng).
    - Các cờ boolean chỉ nhận `true`/`false`.
    - `profile_keeper_interval_hours`: số nguyên 12–720.
    - Khoá lạ → `400`.
  - Không mở rộng `ALLOWED_SETTING_KEYS` của `/api/settings` hiện có.
- Giao diện: thẻ **Chrome profile kênh** trong tab Cài Đặt Hệ Thống (`#pane-settings`):
  - Ô nhập danh sách kênh thử (gợi ý dạng `12, 45`), nút "Tắt hết" (đặt rỗng), công tắc
    `all` có hộp xác nhận.
  - Công tắc cho các cờ, ô số chu kỳ keeper.
  - Dòng trạng thái: số kênh `LOGGED_OUT`, số profile đang bận (lấy từ T9).
  - Toast lỗi hiển thị nguyên văn `detail` từ API.

**Nghiệm thu:** test API cho từng loại lỗi kiểm tra; `PUT` rồi `GET` trả đúng giá trị đã
chuẩn hoá; `node --check bkt_web/static/app.js`.

### T12. Đo hiệu quả

- `GET /api/channels/profile-metrics?days=7` (1–60), chỉ đọc, mở DB `mode=ro` như
  `flow_routes.py`. Trả:
  - `by_mode`: với `publish_mode` ∈ {`profile`, `clean`} trong khoảng thời gian — số task
    đã chạy (`started_at` trong khoảng), `SUCCESS`, `NEEDS_CHECK`, `ERROR`, tỉ lệ phần
    trăm, số lần hoãn (`error_message` chứa "Profile đang mở").
  - `session_events`: số lần chuyển sang `LOGGED_OUT` theo `source`, và số kênh khác nhau
    bị `LOGGED_OUT`, chia theo kênh đang/không nằm trong danh sách thử.
  - `baseline`: cùng các chỉ số của đúng số ngày **trước** lần đầu có task
    `publish_mode='profile'` (nếu chưa có thì `null`).
  - `generated_at`, `days`.
- Giao diện: bảng nhỏ trong thẻ T11 (hai cột profile / sạch, dòng baseline), chọn 7/14/30
  ngày. Không vẽ biểu đồ.

**Nghiệm thu:** test với DB tạm có task hai chế độ và sự kiện phiên: số đếm và tỉ lệ đúng;
chia 0 trả `null` chứ không lỗi; `baseline` là `null` khi chưa có task profile.

### T13. Bảo trì profile và CLI

- Thread `profile-maintenance` (khởi động trong `app_startup`): mỗi 6 giờ, nếu
  `profile_cache_clean_enabled == "true"` (mặc định `false`), duyệt các kênh có
  `profile_dir`, bỏ qua kênh đang bận hoặc có lịch đăng trong ±2700 giây, gọi `clean_caches`
  cho kênh chưa dọn trong 7 ngày (ghi `cache_cleaned_at` vào `profile_meta.json`). Tối đa
  20 kênh mỗi lượt. Ghi log tổng dung lượng giải phóng.
- CLI trong `profile_session.py` (`python3 -m bkt_web.profile_session ...`):
  - `--status [channel_id]`: `profile_dir`, dung lượng, `session_state`, có bản sao lưu
    không, đang bận không.
  - `--backup <channel_id>`: ép tạo lại bản sao lưu (ghi đè).
  - `--restore <channel_id> --yes`: từ chối nếu profile đang bận hoặc không có bản sao lưu;
    đổi tên thư mục hiện tại thành `<p_dir>.before-restore-<ts>` rồi giải nén.
  - `--clean-caches <channel_id|all>`: bỏ qua kênh bận, in dung lượng giải phóng.
  - Mọi lệnh ghi đều cần server có thể đang chạy: dùng cùng cơ chế khoá T2 (khoá
    trong tiến trình không có tác dụng giữa hai tiến trình, nên CLI chỉ dựa vào kiểm
    `SingletonLock` và từ chối khi có Chrome sống).

**Nghiệm thu:** test CLI trên thư mục tạm: `--restore` thiếu `--yes` không làm gì; profile
bận → từ chối; restore giữ lại thư mục cũ; `--clean-caches` không đụng `Cookies`,
`Local Storage`, `IndexedDB`.

---

## 5. Lệnh kiểm tra (chạy sau mỗi task và cuối cùng)

```bash
python3 -m unittest discover -s tests -p 'test_profile_session.py' -v
python3 -m unittest discover -s tests -p 'test_needs_check_verifier.py' -v
python3 -m unittest discover -s tests -p 'test_profile_settings.py' -v
python3 -m unittest discover -s tests -p 'test_publisher_profile.py' -v
python3 -m unittest discover -s tests -p 'test_publish_flow.py' -v
python3 -m unittest tests.test_chocode_tiktok
python3 -m py_compile bkt_web/*.py
python3 -c "import bkt_web.server, bkt_web.profile_session, bkt_web.needs_check_verifier, bkt_web.flow_routes"
node --check bkt_web/static/app.js
node --check bkt_web/static/flow_view.js
```

Dùng `.venv/bin/python` nếu `python3` hệ thống thiếu thư viện.

## 6. Báo cáo cuối

Khi xong T13, trả lời gồm:

1. Danh sách file đã tạo/sửa, mỗi file một dòng mô tả.
2. Kết quả từng lệnh ở mục 5 (dán dòng tổng kết, không tóm tắt "đều pass").
3. Mọi chỗ làm khác tài liệu này và lý do.
4. Những gì **chưa** kiểm chứng được vì không có Chrome/TikTok thật, cụ thể nhất có thể.
5. Checklist cho người vận hành bật thử trên VPS:
   - Kiểm tra tay: mở 1 profile qua noVNC, đóng, gọi `save-session`, xác nhận đọc được
     cookie (kiểm chứng `--password-store=basic` đồng bộ giữa Chrome mở tay và Playwright).
   - Chạy khô 1 kênh với `use_profile=True`.
   - Đặt `publish_profile_channels=<id>` cho 1 kênh, theo dõi 1 lần đăng thật.
   - Mở rộng 10 kênh trong 2–3 ngày, so tỉ lệ `SUCCESS` / `NEEDS_CHECK` / cookie chết với
     7 ngày trước.
   - Rollback: bấm "Tắt hết" trong thẻ Chrome profile kênh (đặt
     `publish_profile_channels` rỗng).
6. Những task bị cắt hoặc làm dở (nếu có) và phần việc còn lại cho sprint sau.
