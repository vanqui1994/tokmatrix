# Universal Video — Baseline (UV-000)

Ngày ghi nhận: 2026-09-18  
Phạm vi: hệ thống remake hiện hữu trong `bkt_web` trước khi thêm Universal Storyboard v2.

## 1. Mục đích

Tài liệu này đóng băng baseline có thể kiểm tra lại của renderer Canvas hiện tại. Các phase sau phải giữ toàn bộ test trong mục 5 ở trạng thái đạt cho đến khi có migration và backward-compatibility test thay thế tương đương.

Quá trình khảo sát và kiểm thử UV-000 không đọc file credential, cookie, token, browser profile, `bkt_web/quy.txt`, registry dự án đã lưu, hay nội dung media riêng tư. Không server đang chạy nào bị restart.

## 2. Baseline catalog và renderer

Nguồn chuẩn: `bkt_web/static/remake_vector_catalog.json`.

| Thuộc tính | Giá trị |
| --- | --- |
| Catalog version | `1.2.0` |
| Schema | `tokmatrix.native-vector/v1` |
| Renderer | `native-vector-v1` |
| Canvas | `576 × 1024`, 30 fps |
| Asset | 18 |
| Typed action | 16 |
| Background | 5 |
| Expression | 8 |
| Hand pose | 7 |

Asset IDs:

```text
apple, bag, bucket, face, farmer, foot, hand, insect, knife,
papaya_tree, peanut_plant, pepper, pot, seed, sprayer, tomato,
tomato_plant, watermelon
```

Action IDs:

```text
carry, cover, crawl, cut, drip, fertilize, gesture, grip, grow,
press, reach, release, slice, spray, uncover, uproot
```

Hợp đồng runtime đang được test gồm absolute-time poses, named-anchor `attach_to`, typed actions, contact/attachment, input immutability và deterministic seek. Native Canvas template phải cung cấp `window.renderFrame(seconds)` và không chạy autonomous animation loop khi có `?render=1`.

## 3. Thành phần hiện hữu

| Thành phần | File/đường dẫn | Vai trò |
| --- | --- | --- |
| Catalog/schema source | `bkt_web/static/remake_vector_catalog.json` | Khai báo asset, action, pose, style và renderer v1 |
| Vector runtime | `bkt_web/static/remake_vector_engine.js` | Sample và vẽ frame Canvas deterministic |
| Validator/showcase | `bkt_web/remake_vector.py` | Đọc catalog, validate story, sinh và render showcase |
| Remake pipeline | `bkt_web/remake_pipeline.py` | Phân tích nguồn, storyboard, audio, compose và đăng ký project |
| Composer | `bkt_web/remake_composer.py` | Tạo HTML/offline frame render và ghép video |
| API router | `bkt_web/remake_routes.py` | API upload, pipeline, library, storyboard, bridge và localization |
| FastAPI entry point | `bkt_web/server.py` | Mount `remake_router`; chạy tại `http://localhost:8080` |
| Library UI | `bkt_web/static/remake_vector_library.html` | Duyệt catalog và showcase |
| Examples | `bkt_web/static/remake_vector_examples.json` | Story mẫu được builder sinh lại |
| Existing Canvas templates | `bkt_web/remake_templates/` | Template của Canvas engine; không phải HyperFrames |

Reviewed scripts hiện được khóa theo SHA-256 file nguồn. Scene times và speaker IDs đã duyệt là dữ liệu bắt buộc phải giữ nguyên trong migration.

## 4. API và CLI hiện hữu

Tất cả API dưới đây có prefix `/api/remake` và được mount bởi `bkt_web/server.py`.

### API

| Method | Path | Mục đích / tác động |
| --- | --- | --- |
| `POST` | `/upload` | Upload và probe MP4/MOV/WebM, tối đa 500 MB |
| `POST` | `/start` | Tạo background task remake từ source path hợp lệ |
| `GET` | `/status/{task_id}` | Đọc tiến độ task trong RAM |
| `GET` | `/projects` | Liệt kê project remake |
| `GET` | `/library` | Đọc catalog, URL showcase và examples |
| `POST` | `/library/validate` | Validate native-vector story; không duyệt fidelity |
| `PUT` | `/projects/{project_id}/storyboard` | Lưu storyboard đã duyệt khi SHA-256 nguồn khớp |
| `DELETE` | `/projects` | Xóa toàn bộ project; yêu cầu `confirm=XOA-TAT-CA` |
| `DELETE` | `/projects/{project_id}` | Xóa một project đã validate ID |
| `GET` | `/bridge/tasks` | Đọc task bridge, có thể lọc status |
| `POST` | `/bridge/tasks/{task_id}/finalize` | Validate và dựng output bridge |
| `GET` | `/countries` | Đọc catalog localization |
| `POST` | `/projects/{project_id}/localize` | Tạo background task dịch và voice package |
| `GET` | `/source-videos` | Liệt kê source video trong các root được phép |
| `GET` | `/uploads` | Liệt kê file remake đã upload |
| `POST` | `/auto` | Upload và bắt đầu pipeline trong một request |
| `POST` | `/projects/{project_id}/publish` | Tạo task publish project lên TikTok |

Hai endpoint thư viện dùng cho inspection không cần sửa project:

```text
GET  /api/remake/library
POST /api/remake/library/validate
```

`POST /api/remake/library/validate` chỉ xác nhận schema v1 hợp lệ và trả fidelity `not-reviewed`; nó không chứng minh nội dung bám video nguồn.

### CLI

| Command | Chức năng |
| --- | --- |
| `python3 -m bkt_web.remake_pipeline --input VIDEO [--name SLUG]` | Chạy pipeline remake |
| `python3 -m bkt_web.remake_vector` | In catalog JSON |
| `python3 -m bkt_web.remake_vector --build-showcase` | Validate và rebuild examples |
| `python3 -m bkt_web.remake_vector --render-showcase` | Rebuild và xuất silent technical showcase |
| `python3 -m bkt_web.antigravity_remake list [--status STATUS] [--json]` | Liệt kê bridge tasks |
| `python3 -m bkt_web.antigravity_remake show TASK_ID` | Xem yêu cầu task bridge |
| `python3 -m bkt_web.antigravity_remake status TASK_ID` | Kiểm tra bài nộp bridge |
| `python3 -m bkt_web.antigravity_remake complete TASK_ID [--strict]` | Hoàn tất và dựng task bridge |
| `python3 -m bkt_web.antigravity_remake watch [--interval SECONDS]` | Theo dõi outbox và tự finalize |
| `python3 -m bkt_web.antigravity_remake doctor` | Kiểm tra dependency/task bridge |
| `python3 -m bkt_web.server` | Chạy FastAPI tại `http://localhost:8080` |

`--build-showcase` và `--render-showcase` tạo/sửa generated artifacts; chúng không nằm trong test baseline read-only và chỉ nên chạy khi chủ động rebuild library examples.

## 5. Baseline đã xác minh

Môi trường đo:

```text
Darwin 25.6.0 arm64
Python 3.13.13
Node.js v22.21.1
FFmpeg/ffprobe 9.0.1
FastAPI 0.139.0
Pydantic 2.13.4
Uvicorn 0.50.2
Playwright 1.61.0
Playwright Chromium build 1228: installed
```

Kết quả ngày 2026-09-18:

| Command | Kết quả | Thời gian thực |
| --- | --- | --- |
| `python3 -m unittest discover -s tests -p test_remake_pipeline.py` | PASS, 20 tests, exit 0 | 5.25 s |
| `python3 -m unittest discover -s tests -p test_remake_vector.py` | PASS, 18 tests, exit 0 | 5.68 s |
| `node --check bkt_web/static/app.js` | PASS, exit 0 | 0.04 s |
| `node --check bkt_web/static/remake_vector_engine.js` | PASS, exit 0 | 0.02 s |
| `python3 -m bkt_web.remake_pipeline --help` | PASS, exit 0 | 0.44 s |
| `python3 -m bkt_web.remake_vector --help` | PASS, exit 0 | 0.03 s |
| `python3 -m bkt_web.antigravity_remake --help` | PASS, exit 0 | 0.03 s |

Tổng kiểm thử chức năng: **38 tests passed**. Pipeline tests mock story-analysis network calls. Vector suite khởi động một local HTTP server và dùng Playwright Chromium cho native-renderer smoke test; không cần gọi dịch vụ bên ngoài.

## 6. Tái lập trên máy sạch

Yêu cầu hệ thống:

- Python tương thích với `requirements.txt` (baseline đã xác minh bằng Python 3.13.13).
- Node.js để chạy JavaScript syntax checks.
- FFmpeg và ffprobe có trong `PATH`.
- Playwright Chromium cài cục bộ.

Từ project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium

python3 -m unittest discover -s tests -p test_remake_pipeline.py
python3 -m unittest discover -s tests -p test_remake_vector.py
node --check bkt_web/static/app.js
node --check bkt_web/static/remake_vector_engine.js
```

Pass condition: cả bốn command cuối trả exit code 0. Không cần khởi động FastAPI server riêng; vector test tự quản lý local test server. Nếu Chromium chưa cài, native-renderer smoke test không thể hoàn tất và baseline chưa đạt.

## 7. Giới hạn baseline cần giữ rõ khi xây v2

- Catalog và validator hiện là renderer-specific (`tokmatrix.native-vector/v1`), chưa phải universal IR.
- `native-vector-v1` chỉ bao phủ 18 asset và 16 action hiện có; chưa có capability router cho mọi thể loại video. *(Ghi chú 2026-09-21: con số này là mốc baseline 2026-09-18; catalog đã mở rộng lên 27 asset / 25 action / 9 bối cảnh — xem `REVIEW_AUTO_REMAKE.md` §2 GAP-2. Giới hạn cốt lõi không đổi: asset vẫn phải đăng ký trước.)*
- Validation API chỉ kiểm tra schema/geometry contract, không đánh giá fidelity so với nguồn.
- Task status được giữ trong RAM và mất khi server restart.
- Pipeline có dependency hệ thống ngoài Python: FFmpeg/ffprobe và Chromium cho offline frame rendering.
- Các operation upload, start, approve, localize, finalize, delete và publish đều thay đổi state; không dùng chúng như health check.
- Thất bại render/voice không được phép dùng source footage/audio rồi báo remake hoàn chỉnh. Phase v2 phải biểu diễn fallback hoặc `needs-review` một cách tường minh.
- Migration phải giữ đường chạy v1, explicit scene times, speaker identity, SHA-256 binding và deterministic `renderFrame(seconds)`.

## 8. Gate cho các phase tiếp theo

Trước khi merge mỗi wave:

1. Chạy lại bốn command ở mục 6.
2. Không giảm số test hiện tại nếu chưa có test thay thế được Coordinator chấp thuận.
3. Mọi thay đổi schema phải versioned và có backward-compatibility test.
4. Mọi renderer mới phải công bố deterministic-seek capability và fallback trung thực.
5. Không cần và không được đọc credential thật để chạy baseline.
