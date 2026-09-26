# TokMatrix AI Studio

Ứng dụng FastAPI chạy cục bộ để quản lý kênh TikTok, kiểm tra VPN, tải và chuẩn hóa video, lập lịch đăng và kết nối Compare Studio.

## Cài đặt

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

Ứng dụng cần `ffmpeg`, Google Chrome và binary `bkt_web/bin/wireproxy`.

`Pillow` là bắt buộc, không phải tuỳ chọn: thiếu nó thì ảnh gửi cho AI Vision
không được thu nhỏ và sẽ đi ở dạng PNG thay vì JPEG.

## Chạy

```bash
python3 -m bkt_web.server
```

Mở `http://127.0.0.1:8080`. Server chỉ lắng nghe loopback. Phiên browser dùng cookie `HttpOnly`, `SameSite=Strict`; API không chấp nhận request chưa khởi tạo từ trang chính.

Đăng nhập web do `bkt_web/webauth.py` xử lý (mật khẩu scrypt, cookie `tokmatrix_auth`
ký HMAC nên phiên sống qua restart). Đặt hoặc đổi tài khoản:

```bash
python3 -m bkt_web.webauth
```

Chưa có file tài khoản `bkt_web/.webauth.json` thì giữ hành vi cũ (không khoá ai).
Khi đã có tài khoản, mọi `/api/*` ngoài danh sách localhost được phép đều trả
`401` nếu thiếu phiên. Request khác GET còn bị kiểm tra `Origin`.

Compare Studio mặc định là thư mục `compare_studio/` trong repo và chạy native trong
`bkt_web/compare_native.py` (không có Node server riêng). Có thể trỏ sang chỗ khác:

```bash
export TOKMATRIX_COMPARE_DIR=/absolute/path/to/compare_studio
```

## Dữ liệu và bảo mật

- Cookie kênh được mã hóa bằng Fernet trong SQLite.
- Master key nằm tại `bkt_web/.secret.key`, quyền file `0600`. Không được commit hoặc chia sẻ key.
- Toàn bộ API key được quản lý tại **Cài Đặt Hệ Thống → Kho Khoá API** và lưu
  mã hóa trong bảng `api_keys`. Các màn hình Facebook Pro, AI Vision, Reg FB và
  Captcha chỉ đọc trạng thái từ kho này; API không trả giá trị key về trình duyệt.
- Khi nâng cấp, key ở `settings`, `fb_ai_settings`, `fb_reg_settings`,
  `nuoinick_settings.json` và `last_location/api_cookie.json` được tự động chuyển
  vào kho chung rồi xóa bản sao cũ.
- Bản database trước migration đã được mã hóa tại `bkt_web/bkt_channels.pre-hardening.db.fernet`.
- VPN config, Chrome Cookies, profile và media đều là dữ liệu cục bộ; `.gitignore` đã loại các đường dẫn này.
- Sao lưu đồng thời database và `.secret.key`. Mất key sẽ không thể giải mã cookie.

Tạo backup online đã mã hóa (không cần dừng server):

```bash
python3 -m bkt_web.backup --create
```

Khôi phục chỉ sau khi đã dừng server; lệnh sẽ kiểm tra integrity trước khi thay database:

```bash
python3 -m bkt_web.backup --restore /path/to/backup.db.fernet --yes
```

## Scheduler đăng TikTok

Thread `upload-scheduler` quét 3 giây/lần, nhận tuần tự các task `QUEUED`/`PENDING`
đã đến giờ và đăng bằng `bkt_web/tiktok_publisher.py`: mở TikTok Studio bằng
cookie của kênh qua WireGuard, tải MP4, điền caption, gắn nhãn AI, bấm Đăng.
Quy tắc xếp hàng nằm ở `bkt_web/publish_flow.py`.

| Trạng thái `upload_tasks.status` | Ý nghĩa |
| --- | --- |
| `WAITING_RENDER` | Chờ ảnh Antigravity và MP4 mới; có MP4 mới thì sang `QUEUED`, MP4 cũ thì `ERROR` |
| `QUEUED` (`PENDING` là giá trị cũ) | Trong hàng chờ theo `schedule_time` |
| `UPLOADING` | Đang đăng |
| `SUCCESS` | Đã đăng và thấy xác nhận |
| `NEEDS_CHECK` | Đã bấm Đăng nhưng không thấy xác nhận — **không bao giờ tự thử lại**, phải kiểm tra trên TikTok rồi xác nhận tay |
| `ERROR` | Hết 3 lần thử (chờ `60·2ⁿ` giây giữa các lần) hoặc lỗi không thử lại được |
| `CANCELLED` | Người dùng huỷ |

Kênh phải được chọn tường minh, không bao giờ tự chọn. Không xếp hàng khi
`images.json` còn ảnh placeholder hoặc chưa có MP4 mới. Khi khởi động lại,
`UPLOADING` đã bấm Đăng thành `NEEDS_CHECK`, chưa bấm thì trả về `QUEUED`.

## Chrome profile của kênh

Mỗi kênh có một Chrome profile riêng (`bkt_web/profiles/channel_<id>`, cột
`channels.profile_dir`). [profile_session.py](bkt_web/profile_session.py) là chỗ duy
nhất mở profile: cùng binary `TOKMATRIX_CHROME_PATH`, cùng tham số, một khoá theo kênh.

- **Bật thử:** Cài Đặt Hệ Thống → thẻ **Chrome profile kênh**, nhập id kênh (hoặc `all`)
  vào `publish_profile_channels`. Để trống là tắt hẳn: đăng bài đi đường cũ (Chromium
  sạch + bơm cookie). Nút **Tắt hết** là rollback.
- **Profile đang mở tay** (noVNC) thì task được hoãn 5 phút và hoàn lại lượt thử; không
  bao giờ kill cửa sổ đó.
- **Cookie:** hash cookie trong DB khác lần đồng bộ cuối (lưu trong `profile_meta.json`)
  thì bơm cookie DB vào profile; bằng nhau thì tin profile. Sau mỗi phiên, cookie có
  `sessionid` được ghi ngược về DB.
- **Bị đăng xuất** ở đường profile → `ERROR`, `session_state=LOGGED_OUT`, không thử lại.
  Ô cookie trong bảng kênh hiện huy hiệu **Phiên OK / Hết phiên**. Đăng nhập lại: nút
  **Đăng nhập lại** (`POST /api/channels/{id}/profile/open-login`, mở profile trên màn hình
  noVNC), đăng nhập tay, rồi nút **Lưu phiên** (`POST /api/channels/{id}/profile/save-session`:
  đóng Chrome, đọc cookie qua VPN của kênh, không bơm cookie DB cũ đè lên).
- **Verifier `NEEDS_CHECK`** (thread `needs-check-verifier`, chỉ đọc chocode): kiểm lúc
  +10 phút, +30 phút, +2 giờ, +6 giờ sau khi bấm Đăng. Khớp đúng một video thì ghi gợi ý
  (`verify_note`, `published_video_id`, hiện kèm link video trong danh sách upload); chỉ tự
  chuyển `SUCCESS` khi `needs_check_auto_confirm=true`.
- **Quét video / thông báo** của kênh có profile đi bằng chính profile đó (bỏ qua lượt quét
  nếu profile đang bận); kênh chưa có profile giữ đường cũ.
- **Số liệu:** `GET /api/channels/profile-metrics?days=7` so tỉ lệ đường profile / đường
  sạch và mốc trước khi bật.
- **Bảo trì:** `python3 -m bkt_web.profile_session --status [id] | --backup <id> |
  --restore <id> --yes | --clean-caches <id|all>`. Bản sao lưu ở
  `bkt_web/storage/profile_backups/`, tạo tự động trước lần mở profile đầu tiên.
- **Dọn cache định kỳ** (thread `profile-maintenance`, mặc định tắt, setting
  `profile_cache_clean_enabled`): 6 giờ một lượt, mỗi profile tối đa một lần mỗi tuần, bỏ
  qua kênh đang bận hoặc có lịch đăng trong ±45 phút.
- **Không làm:** worker tự mở tài khoản định kỳ để "giữ phiên sống".

## Sơ đồ luồng live

Tab **Hệ thống → Sơ Đồ Luồng (Live)** vẽ ba pipeline dạng node kiểu n8n, cập nhật
5 giây/lần: **Autopilot**, **Đăng TikTok** và **Script Queue**. Mỗi node có số mục
đang chạy/chờ/lỗi, viền màu theo trạng thái; chấm sáng chạy dọc cạnh khi có mục
đang đi sang bước kế, và chạy đi-về trên đường nét đứt tới dịch vụ con (Antigravity,
TTS, VPN, cookie, Playwright). Bấm node mở bảng chi tiết: mô tả bước, số theo trạng
thái, 40 mục gần nhất kèm lỗi, log Autopilot hoặc log đăng trực tiếp.

- Dữ liệu: `GET /api/flow/{autopilot|publish|scripts}?hours=48`
  ([flow_routes.py](bkt_web/flow_routes.py)). **Chỉ đọc**: mở SQLite ở chế độ
  `mode=ro`, không ghi, không gọi mạng; DB chưa tồn tại thì trả số 0.
- Bố cục node, cạnh và mô tả nằm trong [flow_view.js](bkt_web/static/flow_view.js);
  backend chỉ trả số liệu theo id node. Thêm bước mới phải sửa cả hai phía.
- `content_jobs.state` là bước **vừa xong**; job đang chờ/chạy ở node kế tiếp. Job
  có `locked_by` là đang chạy. Job nằm ở `READY_TO_PUBLISH` quá một chu kỳ Autopilot
  hiện ở node "Bị giữ lại".
- Trạng thái worker (`autopilot-daemon`, `upload-scheduler`) đọc từ
  `threading.enumerate()`, nên chỉ đúng khi gọi qua server, không đúng khi import
  module ở tiến trình khác.
- Nút **Mô phỏng** cho chấm chạy trên mọi cạnh để xem hiệu ứng khi hệ thống đang
  rảnh. Đó không phải số liệu thật.

## Thống kê tài khoản TikTok

Tab **Thống Kê Tài Khoản** (`/api/stats/accounts?days=N`) tổng hợp kho kênh từ ba
bảng đã có: `channels`, `channel_metrics_history` và `channel_videos`. Nội dung
gồm cơ cấu kênh (trạng thái, quốc gia, publisher, VPN, profile), tổng khán giả,
đường follower theo ngày, top kênh, hiệu suất video đã quét và danh sách kênh lâu
chưa quét lại.

Hai quy tắc bắt buộc của module này:

- **Không cộng gộp tiền tệ.** Mỗi kênh giữ `currency` riêng (EUR, GBP, KRW…) và
  ứng dụng không có nguồn tỷ giá nào, nên doanh thu được liệt kê theo từng mã
  tiền tệ. Một con số tổng kèm ký hiệu `$` là số liệu bịa.
- **Một ngày quét nhiều lần chỉ tính một mốc.** Chuỗi theo ngày lấy `MAX(captured_ts)`
  của từng kênh trong ngày rồi mới cộng, nếu không thì mỗi lần quét lại sẽ nhân
  đôi số follower toàn hệ thống.

Kiểm thử: `python3 -m unittest discover -s tests -p test_account_stats.py`.

## Mạng đi ra: chỉ dùng VPN

Toàn bộ ứng dụng không còn nhận proxy ngoài. Mọi kết nối đi ra — kiểm tra nick,
chạy tác vụ Facebook, đăng ký nick mới, chạy kịch bản nuôi nick — đều qua WireGuard.

Cách hoạt động: `bkt_web/vpn_bridge.py` bọc `vpn_manager` lại, bật một tiến trình
`wireproxy` cho từng thực thể và trả về `socks5://127.0.0.1:<cổng>`. Lớp bên dưới
(curl_cffi, Playwright, GPM/OMO) nhận chuỗi đó như một proxy cục bộ.

- Đặt file `.conf` của WireGuard vào `bkt_web/vpn_configs/<Nhà cung cấp>/...`.
- Mỗi tài khoản giữ ba cột: config đang gán, nhãn vị trí, và mã quốc gia.
- Gán VPN xong thì mỗi tài khoản bốc một server khác nhau, nên IP không trùng.
- Tunnel chỉ bật khi tài khoản thực sự chạy, và được giữ sống để lần sau vào nhanh.
- Khoá tunnel có tiền tố theo module (`fb-`, `nn-`, `reg-`) vì `ACTIVE_TUNNELS`
  dùng chung với kênh TikTok vốn đánh khoá bằng id số.

Cột `proxy` cũ vẫn còn trong các bảng để không mất dữ liệu. Không luồng chạy nào
đọc nó để đi mạng nữa. Ngoại lệ duy nhất còn ghi vào nó là endpoint
`POST /api/nn/proxies/assign` với `target_type="account"`
([nuoinick_routes.py](bkt_web/nuoinick_routes.py)): nó chép `RawProxy` từ kho proxy
sang cột `Proxy` của nick, ở dạng **văn bản thường** — cột này không nằm trong
`SECRET_COLUMNS` và cũng không bị `_mask_row` che. Nếu proxy có kèm tài khoản mật
khẩu thì chuỗi đó sẽ hiện nguyên văn khi gọi API danh sách nick.

Riêng GPM/OMO chỉ nhận proxy lúc **tạo** profile. Với profile đã có sẵn, hệ thống thử
gọi `/api/v1/profiles/update/{id}`; nếu bản antidetect không hỗ trợ thì kết quả chạy
kèm cảnh báo và cần bấm "Tạo profile theo VPN" để tạo lại profile gắn đúng tunnel.

## Xưởng Remake 2D Native Vector Canvas

Core remake ghi SHA-256 video để chọn đúng Story Bible đã xác minh, sau đó dựng
lại bằng Canvas Character Rig: path vector, biểu cảm, lip-sync, chuyển cảnh và
infographic. Video gốc chỉ là tài liệu phân tích, không được dùng làm lớp hình
trong bản xuất. Với nguồn chưa có Story Bible, pipeline giữ chế độ fallback
vector keyframe và không tự đoán nhân vật.

Các ràng buộc fidelity bắt buộc:

- Không suy đoán chủ đề hoặc nhân vật từ tên file.
- Không tự đặt tên, luân phiên vai A/B hay chèn lời thoại thay thế khi ASR lỗi.
- Không thêm nhân vật hoặc sự kiện ngoài Story Bible.
- Mỗi cue phải mang `speaker_id` đã xác minh trước khi dùng multi-voice.
- Project không vượt qua kiểm tra fidelity sẽ không được đăng ký/hiển thị.
- Một visual master có thể chứa nhiều gói quốc gia. Mỗi gói gồm bản dịch đã khóa
  số câu/thứ tự, voice cast cố định theo nhân vật, audio master và dialogue JSON.
- API `GET /api/remake/countries` trả catalog quốc gia; endpoint
  `POST /api/remake/projects/{id}/localize` tạo voice package bằng Gemini và
  Edge-TTS, tự căn thời lượng câu thoại về đúng slot timeline.
- Người dùng có thể tải MP4, MOV hoặc WebM tối đa 500 MB qua
  `POST /api/remake/upload`. Server stream theo chunk 1 MB, đổi tên chống ghi đè,
  kiểm tra video stream bằng FFprobe rồi mới đưa file vào danh sách nguồn tại
  `bkt_web/storage/remake_uploads/`; file sai định dạng hoặc giả đuôi bị từ chối.

Các tệp chính: `bkt_web/remake_pipeline.py`, `bkt_web/remake_routes.py`,
`bkt_web/remake_localization.py`, `bkt_web/static/remake_hub.html`,
`bkt_web/static/remake_2d_demo.html`, `bkt_web/static/remake_peanut_demo.html` và
`bkt_web/static/remake_canvas_player.html`. Nguồn `4.mp4` có Story Bible theo hash
riêng và dùng rig cây lạc; locale nguồn là `zh-CN`, vì vậy khi tạo voice Việt Nam
hệ thống phải dịch từ tiếng Trung thay vì coi thoại nguồn là tiếng Việt.
Artifact của từng project nằm dưới `bkt_web/static/remake_projects/<slug>/`.

## Cầu nối Antigravity IDE

Antigravity không có API/CLI sinh ảnh công khai; `agentapi` chỉ là language
server. TokMatrix vì vậy dùng bridge thư mục, không giả lập một API không tồn tại:

```bash
# Kiểm tra server và cài thư mục bridge
python3 bkt_web/antigravity_agent.py doctor
python3 bkt_web/antigravity_agent.py setup

# Claim một task và tạo inbox/<task_id>.md + .json cho IDE agent đọc
python3 bkt_web/antigravity_agent.py pull --limit 1

# Agent xuất ảnh đúng tên task vào outbox/; watcher tự nhập Thư viện và đóng task
python3 bkt_web/antigravity_agent.py watch
```

Mặc định dữ liệu trao đổi nằm tại
`bkt_web/storage/antigravity_bridge/{inbox,outbox,archive,failed}`. Có thể đổi bằng
`--bridge-dir` hoặc biến `TOKMATRIX_ANTIGRAVITY_BRIDGE_DIR`. Endpoint claim dùng
update nguyên tử để nhiều IDE agent không xử lý trùng task. Bridge không ghi API
key vào request bundle và chỉ chấp nhận PNG/JPG/WebP.

## Giao diện và cache

`index.html` chỉ nạp `style.css` → `light-theme.css` → `cms-theme.css` →
`flow_view.css`. `cms-theme.css` là lớp quyết định giao diện cuối cùng.
`feature-theme.css` và `animal-island.css` **không được nạp**: style viết vào đó
không có tác dụng (modal "Video & Chẩn đoán kênh" từng vỡ bố cục vì lý do này).

Các file tĩnh được tham chiếu kèm số phiên bản gõ tay (`app.js?v=…`,
`cms-theme.css?v=…`, `flow_view.js?v=…`). Sửa JS/CSS phải tăng số này, nếu không
trình duyệt và Cloudflare vẫn giữ bản cũ.

## Triển khai VPS

Cài mới theo [deploy/README.md](deploy/README.md) (`deploy/provision_vps.sh`). Bản
production chạy ở `/opt/tokmatrix` bằng user `tokmatrix`, service `tokmatrix-web`,
nằm sau nginx và Cloudflare.

Cập nhật vài file:

```bash
scp bkt_web/static/app.js tokmatrix:/tmp/
ssh tokmatrix 'install -o tokmatrix -g tokmatrix -m 644 /tmp/app.js /opt/tokmatrix/bkt_web/static/'
ssh tokmatrix 'systemctl restart tokmatrix-web'   # chỉ cần khi đổi mã Python
```

- Chỉ sửa JS/CSS/HTML thì không cần restart; sửa Python hoặc thêm route thì phải restart.
- rsync trên macOS là `openrsync`: không có `--info=stats2` và **bỏ qua dấu `./` của
  `-R`**, nên `rsync -R bkt_web/./x.py host:/opt/tokmatrix/bkt_web/` sẽ tạo ra
  `bkt_web/bkt_web/x.py`. Đối chiếu `md5sum` hai bên sau khi đẩy.
- Đồng bộ cả cây bằng `rsync --delete` thì phải loại trừ `.playwright/`, `.env`,
  `.vncpasswd*`, `bkt_web/.webauth.json` và `bkt_web/bin/` (binary macOS).

## Vấn đề đã biết

- Bước dọn dẹp của Autopilot (`cleanup_posted_videos`) tìm `status='POSTED'`, nhưng
  publisher ghi `SUCCESS`, nên video đã đăng không bao giờ được backup/xoá. Sơ đồ
  luồng hiện cảnh báo ở node "Dọn dẹp".
- `GET /api/dashboard/summary` đếm `upload.failed` bằng `FAILED`, bỏ sót `ERROR`,
  `NEEDS_CHECK` và `WAITING_RENDER`.
- CLI `antigravity_scriptwriter.py` gọi `/api/scripts/*` không kèm cookie, mà prefix
  này không nằm trong danh sách localhost được phép, nên khi đã bật đăng nhập web
  nó nhận `401`.

## Kiểm thử

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile bkt_web/*.py ssmatool_engine_mac/*.py
node --check bkt_web/static/app.js
node --check bkt_web/static/flow_view.js
```

`tests/test_regressions.py` khoá lại các lỗi đã sửa: va chạm route giữa `nn_router`
và `/api/*`, việc `-map 0:a?` phải luôn có mặt trong lệnh ffmpeg, media_type của
ảnh gửi cho AI, `cookie_hash` NULL và việc gán VPN không trùng server.

Không đưa cookie, API key, file WireGuard hoặc database thật vào fixture kiểm thử.
