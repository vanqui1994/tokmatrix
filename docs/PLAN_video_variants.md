# PLAN: 10 thể loại × ~10 biến thể layout — mỗi acc một khuôn hình riêng

> Tài liệu giao việc cho agent code (Claude Code / Codex / Gemini). Đọc hết mục 1–5 trước khi code.
> Ngày lập: 26/09/2026. Người duyệt: chủ dự án. Repo: `SSMATool Tiktok` (bkt_web + compare_studio).
> Bắt buộc đọc thêm: `AGENTS.md` (quy tắc dự án), `compare_studio/matrix/render/engines/README.md` (hợp đồng engine).

---

## 1. Vì sao làm

- 26/09: TikTok đánh "trùng lặp" và shadowban hàng loạt acc dùng chung khuôn hình. TikTok so **layout**
  (bố cục, khung, chuyển động), không so nội dung. Đo bằng `bkt_web/video_fingerprint.py`: science 100% khung
  giống nhau giữa các video, compare 83%, tierlist 69%, newspaper 54%; vox/folklore 0%.
- Hiện 237 kênh Matrix chỉ có **4 bảng màu, 2 `visual_style_id`, mỗi ngôn ngữ ~1 giọng** (123 acc Đức cùng
  `de-DE-ConradNeural`). 202 acc TikTok đã gán: DE 125 · GB 60 · KR 10 · JP 7 (+1 LU chưa gán).
- Mục tiêu: mỗi thể loại có ~10 **biến thể layout khác hẳn nhau**. Mỗi acc dùng một biến thể, và **không hai acc
  cùng nước dùng cùng một biến thể**.

## 2. Quyết định đã chốt (không tự đổi)

| # | Thể loại (engine) | Số biến thể | Hướng nội dung | Hình ảnh |
|---|---|---|---|---|
| 1 | `mystery` (Kỳ Án / Bí Ẩn) | 10 | 10 mảng bí ẩn, mỗi mảng một phong cách | Ảnh AI |
| 2 | `newspaper` (Báo Cũ) | 10 | siêu nhiên, án mạng | Ảnh AI |
| 3 | `vox` (Vox Phóng Sự) | 10 | siêu nhiên, án mạng | Ảnh AI |
| 4 | `folklore` (Tâm Linh Dân Gian) | 10–15 | **giao diện bản tiếng Việt làm gốc**, port ra nhiều nước; giọng nam/nữ rùng rợn | Ảnh AI |
| 5 | `compare` (So Sánh 2 Vật) | 10 | đối đầu A vs B | Ảnh AI/minh hoạ cho A, B |
| 6 | `chalk` (Bảng Phấn / Bản đồ) | 10 | bản đồ, chiến lược | **5 biến thể dùng ảnh AI**, 5 biến thể chỉ đổi layout |
| 7 | `wildlife` (Động Vật) | 10 | tiền sử, trên cạn, dưới nước… | **Video stock trước**, không có mới vẽ AI |
| 8 | `survival` (Sinh Tồn) | 10 | chịu đựng, biển sâu chưa khám phá… | Ảnh AI; **thay nhân vật react** (bỏ Mr. Incredible) |
| 9 | `tierlist` (Xếp Hạng) | 10 | mỗi biến thể một chủ đề riêng | Ảnh AI |
| 10 | `science` (Khoa Học) | 10 | giải thích khoa học | **Ảnh AI**, 10 layout |

- **`kinetic` bị bỏ.** Không tạo mới; acc đang dùng kinetic chuyển sang biến thể khác (mục 5).
- Chỉ 10 thể loại trên. "Port" = cùng engine, cùng pipeline, **khác layout** (bố cục, khung, chuyển động, màu, font),
  không phải đổi màu một template.
- Không bật nhãn "AI-generated content" khi đăng (xem memory `tiktok-ai-label-off`).

## 3. Hiện trạng code cần biết

| Phần | Vị trí |
|---|---|
| Dựng HTML 6 engine gốc (mystery, newspaper, vox, folklore, kinetic, science) | `compare_studio/matrix/render/native-engine-adapter.mjs` → gọi `tools/create-<engine>-video.mjs` (`generate<Engine>Html`) + `tools/<engine>-configs.mjs` (`*_LANG_META`) |
| Engine mở rộng (tierlist, survival, chalk, wildlife, compare) | `compare_studio/matrix/render/engines/<engine>.mjs`, đăng ký `index.mjs`, hợp đồng `README.md` |
| Loại asset mỗi engine | `compare_studio/matrix/creative/visual-director.mjs` (`IMAGE_AI`, `CANVAS`, `SVG`, `TEXT`, `MAP`, `CHART`, `EXISTING_ASSET`) |
| Dữ liệu riêng template (tier, bản đồ, A/B…) | `compare_studio/matrix/story/engine-extras.mjs` → `manifest.script.engine_extras` |
| Theme theo nước (màu + linh vật Otto/Barnaby/Hachi/Horangi/Mèo Mun/Pierre) | `compare_studio/tools/themes/index.mjs` (`getCountryTheme(lang)`), hiện chỉ compare + vox dùng |
| Cấu hình kênh | `compare_studio/config/channels/<channel>.yaml` (schema `config/schemas/channel-dna.schema.json`). **Đổi YAML phải tăng `config_version`**, nếu không batch-matrix từ chối chạy |
| Chọn engine | `compare_studio/matrix/planner/template-selector.mjs` (`pickEngine`, `topicEngine`, `MATRIX_BLOCKED_ENGINES`) |
| Giọng | `compare_studio/tools/voices.mjs` (Edge Neural + CapCut), tổng hợp ở `matrix/creative/audio-orchestrator.mjs` (có `rate`, `pitch` bằng ffmpeg) |
| Ảnh AI | chỉ qua hàng đợi Antigravity (`tools/antigravity-images.mjs`), fallback Cloudflare/ImageRouter trong `bkt_web/cf_image_fallback.py`. **Cấm** Pollinations/`generate-instant` trong pipeline video |
| Ảnh thật | `compare_studio/tools/find-image.mjs` (Wikipedia/Wikimedia) — dùng lại cho wildlife/compare |
| Autopilot: plan theo acc, topic riêng từng acc | `bkt_web/autopilot/planner.py` (`_ensure_channel_plans`), `bkt_web/autopilot/topics.py` |
| Gán acc ↔ kênh Matrix | `bkt_web/autopilot/channels.py`, bảng `autopilot_channel_map`, API `/api/autopilot/map` |
| Chặn thể loại | config Autopilot `publish_block_engines` (hiện `science,kinetic,tierlist`) |
| Đo giống nhau | `bkt_web/video_fingerprint.py` (`fingerprint_video`, `visual_similarity`, CLI `scan/report/compare`), `bkt_web/autopilot/dupguard.py` |
| Test | `compare_studio/tests/matrix-*.test.mjs` (`node --test`), `tests/test_autopilot_engine.py` |

## 4. Kiến trúc biến thể (làm ở giai đoạn 0, trước mọi biến thể)

### 4.1 Registry biến thể

```
compare_studio/matrix/render/variants/
  index.mjs                  # registry: listVariants(engine?), getVariant(id), validateVariant(v)
  _kit/                      # dùng chung: theme nước, font, lớp phủ, chuyển cảnh, fit chữ
    theme.mjs  fonts.mjs  overlays.mjs  transitions.mjs  fit.mjs
  mystery/    m01-case-file.mjs … m10-*.mjs
  newspaper/  n01-*.mjs …
  vox/ folklore/ compare/ chalk/ wildlife/ survival/ tierlist/ science/
```

Mỗi biến thể là một module `export default {...}`:

| Trường | Ý nghĩa |
|---|---|
| `id` | `"<engine>/<slug>"`, ví dụ `"mystery/case-file"`. Không đổi sau khi đã gán acc |
| `engine` | 1 trong 10 engine |
| `name_vi` | tên hiển thị tiếng Việt |
| `niche_id` | niche hiện có (18 niche trong `config/niches`) dùng cho safety/hashtag |
| `topic_brief` | 1–2 câu tiếng Anh mô tả mảng chủ đề, dùng cho Gemini sinh topic |
| `layout` | mô tả ngắn (dùng cho review + test snapshot) |
| `assets` | `{ type: "IMAGE_AI"｜"STOCK_VIDEO"｜"TEXT"｜"MAP"｜"SVG", per_scene: n, aspect: "9:16"｜"1:1"｜"4:5", style_prompt: "..." }` |
| `voice_profile` | `{ gender: "male"｜"female"｜"any", rate, pitch, fx: "none"｜"creepy"｜"radio"｜"whisper" }` |
| `countries` | nước hỗ trợ: `["en","de","ja","ko"]` (tối thiểu), có thể thêm `vi`,`fr` |
| `buildHtml(ctx)` | giống hợp đồng engine; `ctx` thêm `theme` (của nước) và `variant` |
| `extras?` | nếu biến thể cần dữ liệu riêng ngoài extras của engine (schema/prompt/validate/fallback như README) |
| `sample(lang)` | dữ liệu mẫu để render xem trước **không cần TTS/ảnh thật** (dùng ảnh giữ chỗ trong `tests/fixtures`) |

Quy tắc bắt buộc (từ `AGENTS.md` + README engine):
- Timeline GSAP **paused**, seek được. Không animation tự chạy khi `?render=1`. Kết quả tất định.
- Giữ nguyên `start`/`duration` đo từ TTS. Không chia đều, không thêm TTS.
- Chữ kịch bản Matrix dài hơn nội dung mẫu → dùng `_kit/fit.mjs` co chữ vừa khung (như `applyMatrixLayoutFixes`).
- Không id media trùng (HyperFrames ≥ 0.8.77 từ chối). Tiền tố id theo biến thể.
- Video 25–90 s (`MATRIX_VIDEO_QA`); không đuôi đen: cảnh cuối kéo tới `totalDuration`.
- `hyperframes check` phải qua với bản HyperFrames đang dùng (0.8.78 có StaticGuard mới: **không** đặt
  `autoAlpha`/`opacity` bằng GSAP lên chính phần tử `.clip`; animate phần tử con bên trong).

### 4.2 Khác nhau thật sự: "vân tay layout" của biến thể

Hai biến thể **cùng engine** phải khác nhau ở ít nhất **4/6 trục** dưới đây (ghi rõ trong module, test đếm):

1. **Bố cục khung:** ảnh tràn màn / ảnh trong thẻ / chia đôi dọc / chia đôi ngang / lưới / khung tròn / nghiêng / dải phim.
2. **Vị trí khối chữ chính:** trên / giữa / dưới / trái dọc / theo ảnh.
3. **Nền:** màu phẳng / giấy / vải / kim loại / bóng tối + đèn pin / bản đồ / sóng nước / tĩnh điện TV.
4. **Chuyển cảnh:** cắt cứng / trượt / lật trang / zoom xuyên / mở cửa chớp / nhiễu TV / mực loang / xé giấy.
5. **Chuyển động ảnh:** Ken Burns chậm / parallax 2 lớp / rung máy / quét đèn / đứng yên + phủ hạt.
6. **Kiểu chữ + màu:** cặp font và bảng màu riêng (trong họ màu của nước, xem 4.3).

### 4.3 Theme theo nước (lớp chung)

- Mở rộng `tools/themes/index.mjs` → `_kit/theme.mjs` trả `{ palette, fonts, motif, mascot?, ui }` cho `en, de, ja, ko` (+ `vi, fr` sẵn có).
- Biến thể **pha** theme nước với màu riêng của nó: giữ họ màu của nước, đổi sắc độ/độ sáng theo biến thể.
  Cùng biến thể ở 2 nước phải khác màu, font và hoa văn.
- Font theo hệ chữ: Latin (en/de), Nhật (Noto Sans/Serif JP, M PLUS), Hàn (Noto Sans KR, Nanum Myeongjo). Font nhúng local như `tools/template-kinetic/assets`, không tải mạng lúc render.

### 4.4 Gắn biến thể vào kênh + dispatch

- YAML kênh thêm `creative.variant_id: "<engine>/<slug>"` và `preferred_engines: [<engine>]` (1 engine/acc).
  Cập nhật schema `channel-dna.schema.json` + tăng `config_version`.
- `native-engine-adapter.mjs`: nếu `channel.creative.variant_id` có → `getVariant(id).buildHtml(ctx)`; không có → giữ đường cũ (tương thích).
- `visual-director.mjs`: loại asset lấy từ `variant.assets` thay cho bảng cố định theo engine.
- `template-selector.mjs`: kênh có `variant_id` luôn chọn đúng engine của biến thể (bỏ qua `topicEngine`).

### 4.5 Topic theo biến thể

- `compare_studio/config/topics/variants/<engine>/<slug>.txt`: ≥ 40 topic tiếng Anh đúng `topic_brief`.
- `bkt_web/autopilot/topics.py`: niche → **variant**. Kho = file của biến thể + Gemini viết thêm theo `topic_brief`
  (lưu `storage/autopilot_topics/variants/<engine>__<slug>.txt`). Giữ luật chủ thể không trùng (`same_subject`).
- compare: topic bắt buộc dạng "A vs B" (lọc bằng `splitSubjects`). tierlist: topic dạng "Ranking every X".

### 4.6 Giọng đọc

- `tools/voices.mjs`: bổ sung đủ giọng Edge Neural đang có cho `en-US`, `en-GB`, `de-DE`, `ja-JP`, `ko-KR`.
  **Lấy danh sách thật** bằng `edge-tts --list-voices` (hoặc provider hiện dùng) — không gõ tay tên giọng chưa kiểm.
  Giữ các giọng CapCut đang có.
- Mỗi acc một giọng: chia đều trong ngôn ngữ, ưu tiên không trùng giọng với acc cùng biến thể/cùng engine.
- `voice_profile.fx`: thêm lọc ffmpeg sau TTS trong `audio-orchestrator.mjs` (cache key phải gồm `fx`):
  - `creepy`: pitch −2…−4 st, rate 0.9, `aecho` nhẹ + lowpass.
  - `whisper`: highpass + nén.
  - `radio`: bandpass 300–3400 Hz + nhiễu nhẹ.

  Folklore bắt buộc có cả nam và nữ rùng rợn.

## 5. Gán acc (giai đoạn 5)

- `bkt_web/autopilot/variants.py`: đọc registry (qua `node tools/list-variants.mjs --json`), rồi gán mỗi acc một biến thể:
  - Ràng buộc cứng: **(variant_id, country) là duy nhất**. Với ~105 biến thể × 4 nước = ~420 chỗ ≥ 202 acc.
  - Ưu tiên giữ niche cũ của acc nếu có biến thể cùng niche (không phá lịch sử kênh), rồi chia đều giữa các engine.
  - Acc kinetic → biến thể khác cùng niche.
  - Xuất bảng xem trước (`--dry-run`: acc, nước, niche cũ → biến thể mới, giọng); chủ dự án duyệt rồi mới `--apply`:
    ghi YAML (tăng `config_version`) + `autopilot_channel_map` (đổi `niche_id` nếu cần).
- Video cũ đang chờ đăng của acc bị đổi niche: không tự huỷ; liệt kê để chủ dự án quyết.

## 6. Cổng chất lượng (bắt buộc qua trước khi mở đăng)

1. **Test đơn vị** mỗi biến thể: module hợp lệ, `buildHtml(sample)` ra HTML qua `hyperframes check`, không id trùng,
   seek tất định (render cùng frame 2 lần ra cùng hash), chữ dài nhất vừa khung.
2. **Ảnh xem trước:** `node tools/preview-variants.mjs --engine mystery --lang de --out <dir>` render 3 khung (0.2/0.5/0.8)
   cho mọi biến thể → một contact sheet PNG. Chủ dự án duyệt contact sheet trước khi làm tiếp engine sau.
3. **Đo khác biệt:** render mẫu 20 s mỗi biến thể × mỗi nước, chạy `video_fingerprint` so từng cặp.
   - Hai biến thể bất kỳ (kể cả khác engine): **< 30% khung giống** (`dup_frames_threshold` 0.30).
   - Cùng biến thể, khác nước: **< 30%**.

   Cặp nào vượt ngưỡng → sửa layout, không nới ngưỡng. Kết quả lưu `docs/variant_similarity_report.md`.
4. Sau khi toàn bộ qua: bật `dup_check_mode=block`.

## 7. Danh mục biến thể (đề xuất — chủ dự án có thể đổi tên/chủ đề, giữ số lượng)

Ký hiệu layout: bố cục · chữ · nền · chuyển cảnh · chuyển động ảnh.

### 7.1 mystery — 10 (ảnh AI)

| id | Mảng chủ đề | Layout đặc trưng |
|---|---|---|
| `mystery/case-file` | vụ mất tích chưa giải | ảnh kẹp trong bìa hồ sơ · chữ đánh máy dưới · bàn gỗ · lật trang hồ sơ · Ken Burns |
| `mystery/evidence-board` | án bí ẩn nhiều manh mối | bảng ghim + chỉ đỏ nối ảnh · chữ trên giấy note · bảng bần · camera lia giữa ảnh ghim · đứng yên |
| `mystery/cctv` | sự việc lạ camera ghi lại | khung CCTV có timestamp/REC · chữ góc trên như OSD · nhiễu xám · nhiễu tín hiệu · rung nhẹ |
| `mystery/lost-places` | nơi bị bỏ hoang | ảnh tràn màn tối · chữ giữa màn kiểu phụ đề phim · đen · mờ dần qua đen · đèn pin quét |
| `mystery/cryptid-field-journal` | sinh vật bí ẩn | trang sổ tay thám hiểm, ảnh dán băng keo · chữ viết tay · giấy kẻ ô · lật trang · parallax |
| `mystery/ufo-radar` | UFO/hiện tượng trời | màn radar tròn + ảnh trong ô · chữ đơn cách xanh · lưới radar · quét radar · zoom chậm |
| `mystery/deep-sea-log` | bí ẩn biển | ảnh qua ô cửa tàu ngầm tròn · chữ dạng nhật ký hải trình · sonar · bọt nước · trôi dọc |
| `mystery/cursed-objects` | đồ vật bị nguyền | ảnh trong tủ kính bảo tàng + thẻ hiện vật · chữ thẻ bảo tàng · nhung đỏ · đèn spot bật tắt · xoay nhẹ |
| `mystery/cold-case-polaroid` | án lạnh | chuỗi polaroid rơi xuống bàn · chữ viết dưới polaroid · vải bàn · polaroid rơi · đứng yên |
| `mystery/decoded` | mật mã/tín hiệu chưa giải | ảnh vỡ thành ô pixel rồi hiện · chữ giải mã từng ký tự · đen xanh · glitch · pixel reveal |

### 7.2 newspaper — 10 (siêu nhiên, án mạng; ảnh AI)

| id | Chủ đề | Layout |
|---|---|---|
| `newspaper/victorian-broadsheet` | án mạng thế kỷ 19 | trang báo 5 cột, ảnh khắc gỗ · tiêu đề serif lớn trên · giấy ố · lật trang · zoom vào cột |
| `newspaper/tabloid-1950` | quái vật/siêu nhiên | tabloid chữ đỏ khổng lồ, ảnh cắt xéo · tiêu đề giữa · giấy trắng mực đen · đóng dấu EXTRA · rung |
| `newspaper/wanted-poster` | tội phạm truy nã | tờ truy nã dán tường · tên + tiền thưởng · tường gạch · giấy bay dán lên · đứng yên |
| `newspaper/telegram-wire` | tin khẩn siêu nhiên | băng điện tín chạy chữ + ảnh nhỏ · chữ STOP · bàn điện báo · băng giấy trượt · parallax |
| `newspaper/police-gazette` | án mạng rùng rợn | báo cảnh sát, khung ảnh tròn + viền hoa văn · chữ đỏ đen · giấy vàng · mực loang · Ken Burns |
| `newspaper/microfilm` | vụ án lưu trữ | máy đọc microfilm, ảnh âm bản · chữ trắng trên đen · khung máy · cuộn phim ngang · chuyển âm→dương bản |
| `newspaper/front-page-spin` | tin chấn động | kiểu phim cũ: báo xoay vào màn · tiêu đề to giữa · đen · spin-in · dừng |
| `newspaper/clipping-scrapbook` | chuỗi án liên hoàn | mẩu báo cắt dán sổ lưu · chữ bôi vàng · bìa sổ · mẩu mới dán đè · lệch nhẹ |
| `newspaper/ghost-gazette` | ma ám | báo mờ, chữ hiện dần như mực ma · tiêu đề mờ · giấy tro · mực hiện · nhấp nháy nến |
| `newspaper/court-sketch` | xử án | tranh ký hoạ phiên toà + trích biên bản · chữ biên bản dưới · giấy vẽ · nét chì vẽ dần · đứng yên |

### 7.3 vox — 10 (siêu nhiên, án mạng; ảnh AI; khác hẳn newspaper: cắt dán hiện đại, đồ hoạ giải thích)

| id | Chủ đề | Layout |
|---|---|---|
| `vox/paper-collage` | (bản gốc) án bí ẩn | cắt dán giấy xé · chữ dán nhãn · giấy kraft · xé giấy · parallax nhiều lớp |
| `vox/timeline-explainer` | diễn biến vụ án | trục thời gian ngang chạy + ảnh trong mốc · chữ dưới trục · nền phẳng · trượt ngang · pan |
| `vox/map-route` | hành trình hung thủ/hiện tượng | bản đồ phẳng + đường chấm đỏ + ảnh pin · chữ góc · bản đồ · vẽ đường · zoom bản đồ |
| `vox/split-screen-then-now` | nơi ma ám xưa và nay | chia đôi dọc trước/sau · chữ giữa đường chia · đen · gạt thanh chia · Ken Burns 2 phía |
| `vox/data-card` | con số vụ án | thẻ số liệu lớn + ảnh nhỏ · chữ số to · màu phẳng · đếm số · đứng yên |
| `vox/documentary-lowerthird` | phóng sự | ảnh tràn màn + lower-third tin tức · chữ lower-third · — · cắt cứng · Ken Burns |
| `vox/sticker-bomb` | truyền thuyết đô thị | ảnh + sticker/mũi tên vẽ tay · chữ marker · giấy trắng · sticker bật · rung nhẹ |
| `vox/zine-xerox` | cult/giáo phái bí ẩn | zine photocopy đen trắng tương phản · chữ cắt từ báo · giấy photo · nhiễu photocopy · giật |
| `vox/archive-box` | hồ sơ giải mật | ảnh rút ra từ hộp tài liệu, dấu CLASSIFIED · chữ đánh máy + gạch đen · bìa carton · rút giấy · trượt lên |
| `vox/3d-diorama` | hiện trường | lớp ảnh xếp chiều sâu kiểu diorama · chữ lơ lửng · bóng đổ · dolly-in · parallax sâu |

### 7.4 folklore — 12 (giao diện **bản tiếng Việt** làm gốc; ảnh AI; giọng nam/nữ rùng rợn)

Gốc: `tools/create-folklore-video.mjs` + `folklore-configs.mjs` với `lang=vi`. Giữ cấu trúc (hook → shots → scenes),
đổi layout theo từng truyền thống. Mỗi biến thể có cả phiên bản cho `en/de/ja/ko`: chữ, hoa văn, font đổi theo nước;
chủ đề lấy dân gian **của nước đó** hoặc dân gian thế giới kể cho khán giả nước đó (`topic_brief` ghi rõ).

| id | Truyền thống/chủ đề | Layout |
|---|---|---|
| `folklore/vn-original` | (gốc) ma quỷ Việt | giữ nguyên giao diện hiện tại (chỉ port đa nước) |
| `folklore/japanese-yokai-scroll` | yêu quái Nhật | cuộn emaki ngang, ảnh trong cuộn · chữ dọc · giấy washi · cuộn giấy trượt · pan ngang |
| `folklore/korean-gwishin` | ma Hàn | khung cửa giấy hanji, bóng in lên cửa · chữ giữa · đèn lồng · cửa trượt · bóng lay |
| `folklore/european-grimoire` | phù thuỷ châu Âu | trang sách phép, ảnh trong khung minh hoạ · chữ gothic · da thuộc · lật trang sách · nến chập chờn |
| `folklore/nordic-runestone` | Bắc Âu | ảnh khắc trên phiến đá rune · chữ khắc · đá · bụi rơi · rung đá |
| `folklore/german-maerchen` | truyện Grimm đen tối | khung tranh gỗ khắc · chữ Fraktur (tiêu đề) · gỗ · cánh cửa rừng mở · sương trôi |
| `folklore/british-ghost-walk` | ma Anh | tấm biển tour ma + ảnh trong đèn bão · chữ biển gỗ · phố sương · đèn lắc · sương |
| `folklore/tarot-deck` | điềm báo | ảnh trong lá bài tarot lật · chữ trên lá bài · khăn nhung · lật bài · xoay 3D |
| `folklore/shadow-puppet` | truyện kể dân gian | rối bóng: ảnh cắt bóng đen trên màn giấy sáng · chữ dưới màn · màn giấy · bóng trượt · lắc rối |
| `folklore/campfire` | chuyện kể quanh lửa | ảnh mờ trong khói lửa trại · chữ giữa rung theo lửa · đêm · khói tan · lửa hắt sáng |
| `folklore/haunted-vhs` | truyền thuyết đô thị | băng VHS: timestamp, dải nhiễu · chữ OSD · nhiễu · tua băng · giật hình |
| `folklore/temple-bell` | tâm linh châu Á | ảnh trong khung cổng đền, chuông rung · chữ dọc/ngang · gỗ đỏ · chuông ngân (sóng) · zoom chậm |

Giọng: mỗi biến thể có 2 profile `male_creepy`, `female_creepy` (mục 4.6). Acc được gán 1 profile, chia đều nam/nữ.

### 7.5 compare — 10 (A vs B; ảnh cho A và B)

Nguồn ảnh A/B: Wikimedia (`find-image.mjs`) nếu có ảnh tự do; không có thì ảnh AI (2 ảnh/video, cache theo tên
đối tượng **trong cùng acc**). Bỏ kiểu chữ lồng (monogram) làm mặc định; chỉ dùng khi thiếu ảnh.

| id | Layout |
|---|---|
| `compare/studio-classic` | bản Studio gốc "So Sánh 2 Vật": 2 thẻ + VS + linh vật nước (Otto/Barnaby/Hachi/Horangi) |
| `compare/boxing-ring` | võ đài: A góc đỏ, B góc xanh, thanh máu, "ROUND n", chuông |
| `compare/scale-balance` | cán cân: A/B trên 2 đĩa, nghiêng theo điểm từng hiệp |
| `compare/split-vertical` | chia đôi dọc toàn màn, đường chia dịch theo bên thắng |
| `compare/stat-card-game` | 2 lá bài chỉ số kiểu trading card, lật từng chỉ số |
| `compare/race-track` | đường đua: A/B chạy, mỗi hiệp tiến lên theo điểm |
| `compare/versus-poster` | poster phim đối đầu, ảnh 2 phía nghiêng, chữ VS lửa |
| `compare/lab-report` | bảng thí nghiệm: ảnh trong khung kính, số đo như máy |
| `compare/courtroom` | A/B là 2 bên kiện, bồi thẩm chấm điểm, búa gõ phán quyết |
| `compare/tier-duel` | 2 cột thanh ngang tăng dần theo tiêu chí, tổng điểm cuối |

### 7.6 chalk — 10 (5 dùng ảnh AI, 5 chỉ đổi layout)

| id | Ảnh AI? | Layout |
|---|---|---|
| `chalk/war-room` | không | (gốc) bảng phấn chiến lược, mũi tên phấn |
| `chalk/blueprint` | không | bản vẽ xanh kỹ thuật, nét trắng, lưới |
| `chalk/whiteboard-marker` | không | bảng trắng bút dạ nhiều màu, tay vẽ |
| `chalk/sand-table` | không | sa bàn cát nhìn từ trên, quân cờ gỗ |
| `chalk/night-vision` | không | bản đồ xanh nhìn đêm, HUD quân sự |
| `chalk/atlas-illustrated` | **có** | bản đồ cổ + ảnh AI minh hoạ trong ô chú thích |
| `chalk/satellite` | **có** | ảnh vệ tinh AI + khoanh vùng + nhãn |
| `chalk/diorama-3d` | **có** | địa hình 3D (ảnh AI) + mũi tên nổi |
| `chalk/field-notebook` | **có** | sổ tay chiến trường, ảnh dán + phác thảo |
| `chalk/museum-wall` | **có** | bản đồ treo tường bảo tàng + ảnh hiện vật AI hai bên |

Giữ luật hiện tại: chỉ Trung Đông có biên giới thật, chủ đề khác dùng bản đồ `theater` 7 vùng chung. Biến thể có ảnh AI
xin ảnh qua hàng đợi Antigravity như engine ảnh khác.

### 7.7 wildlife — 10 (video stock trước, AI sau)

Nguồn hình theo thứ tự:
1. **Video stock có giấy phép**, qua module mới `bkt_web/stock_video.py`:
   - Pexels Videos API và Pixabay Videos API, khoá trong key vault `stock.pexels`, `stock.pixabay`.
   - Wikimedia Commons (video CC, `.webm`).
   - Lưu `source`, `license`, `author`, `url` vào `meta.json`.
2. **Không có** clip phù hợp (lọc theo tên loài) → ảnh AI như hiện tại.

Luật chống trùng:
- **Một clip chỉ dùng cho một acc.** Sổ cái `storage/stock_video_ledger.json` ghi clip id → acc.
- Mỗi clip dùng ≤ 6 s, cắt đoạn khác nhau, crop 9:16, zoom/tốc độ nhẹ, phủ layout biến thể.
- **Cấm** tải clip từ TikTok/YouTube.

| id | Mảng | Layout |
|---|---|---|
| `wildlife/prehistoric-museum` | động vật tiền sử | khung trưng bày hoá thạch + ảnh AI phục dựng + thẻ niên đại |
| `wildlife/savanna-hud` | thú săn mồi trên cạn | (gốc) HUD kính ngắm, thanh chỉ số |
| `wildlife/deep-ocean` | sinh vật biển sâu | ô cửa tàu lặn, thước độ sâu chạy dọc |
| `wildlife/field-guide` | chim/côn trùng | trang sách hướng dẫn thực địa, ảnh + chú thích |
| `wildlife/trail-cam` | thú đêm | camera bẫy: khung hồng ngoại, nhiệt độ, giờ |
| `wildlife/nature-doc` | tài liệu thiên nhiên | letterbox điện ảnh + phụ đề mảnh |
| `wildlife/stat-battle` | kỷ lục động vật | thẻ chỉ số lớn cạnh clip, so kỷ lục |
| `wildlife/microscope` | sinh vật tí hon | khung kính hiển vi tròn, thước µm |
| `wildlife/migration-map` | di cư | bản đồ đường di cư + clip trong ô |
| `wildlife/extinct-files` | loài đã tuyệt chủng | hồ sơ lưu trữ, ảnh AI, dấu EXTINCT |

### 7.8 survival — 10 (ảnh AI; nhân vật react mới)

- Bỏ bộ mặt Mr. Incredible (`shared/assets/survival/mrincredible/`), vì dễ vướng bản quyền và dễ bị nhận là template chung.
- Mỗi biến thể có **nhân vật react gốc riêng**: vẽ một lần bằng ảnh AI thành bộ biểu cảm (8 mặt: bình thường → lo →
  sợ → hoảng → kinh hoàng → ngất…), cùng nhân vật, nền trong suốt. Lưu ở `shared/assets/survival/<reactor>/`,
  kèm `sheet.json`. Vẽ **một lần**, không vẽ lại mỗi video.
- Mỗi cảnh có ảnh AI minh hoạ mức độ, và bộ đếm cấp độ theo layout biến thể.

| id | Mảng | Nhân vật react | Layout |
|---|---|---|---|
| `survival/endurance` | giới hạn chịu đựng cơ thể | vận động viên marathon | thanh sinh lực dọc, đồng hồ |
| `survival/deep-sea-unknown` | biển sâu chưa khám phá | thợ lặn | thước độ sâu, áp suất tăng |
| `survival/space-exposure` | sống sót ngoài không gian | phi hành gia | HUD mũ phi hành gia |
| `survival/extreme-heat` | nóng cực độ | nhà thám hiểm sa mạc | nhiệt kế, sóng nhiệt |
| `survival/extreme-cold` | lạnh cực độ | người leo núi tuyết | băng phủ dần màn hình |
| `survival/no-sleep` | thiếu ngủ/đói/khát | nhân viên văn phòng | lịch đếm ngày, pin cạn |
| `survival/altitude` | độ cao | người nhảy dù | đồng hồ độ cao, oxy |
| `survival/disaster` | thiên tai | lính cứu hộ | cảnh báo khẩn, mức nguy hiểm |
| `survival/wilderness` | lạc nơi hoang dã | hướng đạo sinh | ba lô vật phẩm, ngày sống sót |
| `survival/lab-exposure` | phóng xạ/hoá chất | nhà khoa học | máy đếm Geiger, liều lượng |

### 7.9 tierlist — 10 (mỗi biến thể một chủ đề; ảnh AI)

| id | Chủ đề | Layout |
|---|---|---|
| `tierlist/classic-s-to-f` | tổng hợp | (gốc) hàng S–F ngang |
| `tierlist/apex-predators` | động vật săn mồi | kim tự tháp tầng |
| `tierlist/ancient-weapons` | vũ khí cổ | giá treo vũ khí nhiều tầng |
| `tierlist/deadliest-places` | nơi nguy hiểm | bản đồ + huy hiệu tier |
| `tierlist/mythical-creatures` | sinh vật thần thoại | lá bài xếp cột |
| `tierlist/space-objects` | vật thể vũ trụ | quỹ đạo, xa/gần theo tier |
| `tierlist/historical-empires` | đế chế | bậc thang/bục vinh quang |
| `tierlist/survival-foods` | đồ ăn sinh tồn | kệ siêu thị nhiều tầng |
| `tierlist/extreme-jobs` | nghề nguy hiểm | nhiệt kế nguy hiểm dọc |
| `tierlist/unsolved-cases` | vụ án chưa giải | tủ hồ sơ nhiều ngăn |

### 7.10 science — 10 (ảnh AI, 10 layout)

Bỏ khung hội thoại nhân vật dùng chung (nguyên nhân 100% trùng). Mỗi cảnh 1 ảnh AI minh hoạ.

| id | Layout |
|---|---|
| `science/lab-notebook` | sổ thí nghiệm, ảnh dán + công thức viết tay |
| `science/microscope-zoom` | zoom xuyên nhiều cấp độ (vĩ mô → vi mô) |
| `science/space-hud` | HUD tàu vũ trụ, ảnh trong màn quan sát |
| `science/infographic` | khối đồ hoạ phẳng + ảnh tròn + số lớn |
| `science/xray` | ảnh chuyển sang lớp X-quang/nhiệt |
| `science/periodic` | ô nguyên tố bật ra, ảnh trong ô |
| `science/chalkboard-lecture` | bảng giảng đường + ảnh chiếu |
| `science/blueprint-machine` | bản vẽ cơ khí, ảnh ghép chi tiết |
| `science/timeline-discovery` | trục phát hiện khoa học theo năm |
| `science/quiz-show` | câu hỏi – 3 đáp án – lật đáp án đúng |

## 8. Năng lực sản xuất (kiểm trước khi mở rộng)

- **Chốt 26/09: sản xuất trước, đăng sau. Ảnh AI vẫn ưu tiên Antigravity.**
  - Tốc độ làm video do Antigravity quyết định (bridge 1 slot, không chạy song song: memory `antigravity-parallel-slots`).
    Video tích thành kho ở `READY_TO_PUBLISH`, lịch đăng mở sau khi kho đủ.
  - Không nâng ImageRouter/Cloudflare thành nguồn chính. Fallback giữ đúng luật hiện tại trong `AGENTS.md`
    (chỉ khi Antigravity bị chặn quota hoặc task chờ quá `TOKMATRIX_CF_IMAGE_MAX_WAIT_MINUTES`) và phải bật lại qua
    `pause-images.conf` khi chủ dự án bảo. Không gắn nhãn ảnh fallback thành Antigravity.
  - Giảm tải Antigravity:
    - Tái dùng ảnh trong cùng acc (cache theo chủ thể: compare A/B, nhân vật react survival vẽ một lần).
    - wildlife ưu tiên video stock.
    - 5 biến thể chalk không cần ảnh.
    - Không xin ảnh cho cảnh dùng lại ảnh trước đó.
  - Ghi số ảnh mỗi video của từng biến thể trong module (`assets.per_scene`); `preview-variants.mjs` in tổng ảnh/video
    để ước lượng số video/ngày Antigravity làm được.
  - Thứ tự sản xuất khi chạy thật: xoay vòng theo acc (mỗi acc 1 video rồi mới tới video thứ 2), để kho có đủ acc
    trước khi mở đăng.
- Render: VPS 4 CPU, `MATRIX_RENDER_SLOTS=2`. Đo thời gian render 1 video mỗi biến thể trong giai đoạn thử.
  Nếu không đủ cho số video/ngày đã chốt thì báo, không tự tăng slot.
- Đĩa: dọn tự động đã chạy (`autopilot/housekeeping.py`); render CRF 20.

## 9. Lộ trình

Mỗi giai đoạn kết thúc bằng: test xanh + contact sheet + (từ giai đoạn 2) báo cáo vân tay. **Chủ dự án duyệt rồi
mới sang giai đoạn sau.** Không deploy lên VPS nếu chưa được bảo.

| GĐ | Việc | Nghiệm thu |
|---|---|---|
| 0 | Khung biến thể (4.1–4.6): registry, `_kit`, theme nước, dispatch adapter, schema YAML, `preview-variants.mjs`, `fx` giọng, voices đầy đủ | Test registry + adapter; 1 biến thể giả render được; engine cũ không đổi (test cũ xanh) |
| 1 | **mystery** 10 biến thể (mẫu cho các engine khác) | Contact sheet 10 × 4 nước; vân tay < 30% mọi cặp |
| 2 | **newspaper** 10 + **vox** 10 | Như trên + so chéo mystery/newspaper/vox |
| 3 | **folklore** 12 (gốc vi) + giọng creepy nam/nữ | Như trên + nghe thử 4 giọng |
| 4 | **compare** 10, **tierlist** 10, **science** 10 (ảnh AI) | Như trên; gỡ `science,tierlist` khỏi `publish_block_engines` khi đạt |
| 5 | **chalk** 10, **survival** 10 (nhân vật react mới), **wildlife** 10 (+ `stock_video.py`) | Như trên + sổ cái clip không trùng acc; giấy phép ghi đủ |
| 6 | Topic theo biến thể (4.5) + gán acc (mục 5) dry-run → duyệt → apply | Bảng gán: (variant, nước) duy nhất; mọi acc có giọng |
| 7 | Chạy thật: mỗi engine 1 acc/nước → render → đăng thử sau khi hết giữ đăng → bot `@tiktok_check_video_bot` sau 12–24 h | Không shadowban/trùng → mở dần 20 acc → toàn bộ |

Giai đoạn 1–5 chia được cho nhiều agent song song, **mỗi agent một engine**. Tất cả dùng chung `_kit` của giai đoạn 0
và không sửa `_kit` nếu chưa báo.

## 10. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Biến thể chỉ khác màu → vẫn bị đánh trùng | Luật 4/6 trục + cổng vân tay < 30% |
| Hết quota ảnh Antigravity | Mục 8: sản xuất trước, đăng sau; cache ảnh theo acc; rotator đổi tài khoản khi hết quota |
| Clip stock bị acc khác trên TikTok dùng | ≤ 6 s/clip, phủ layout riêng, crop/zoom; sổ cái không dùng lại |
| Đổi YAML làm batch dở hỏng | Tăng `config_version`; chỉ áp khi Autopilot tạm dừng; batch cũ chạy `--resume` với code cũ |
| HyperFrames đổi luật kiểm (như StaticGuard 0.8.78) | Chạy `hyperframes check` bản đang ghim trong test; không animate `.clip` |
| Font CJK nặng | Nhúng subset theo ký tự dùng trong video, hoặc font hệ thống có sẵn trên VPS |

## 11. Việc cấm

- Pollinations/`generate-instant` trong pipeline; gắn nhãn ảnh fallback thành Antigravity.
- Tải video/ảnh từ TikTok/YouTube để dựng video.
- Chia đều thời lượng cảnh; thêm TTS ngoài kịch bản; animation tự chạy khi render.
- Bật nhãn AI khi đăng; kill Chrome mở tay; bấm Đăng lại task đã có `clicked_post_at`.
- Restart server trên VPS khi chưa được bảo; file dưới `/opt/tokmatrix` phải là `tokmatrix:tokmatrix`.

## 12. Câu hỏi mở cho chủ dự án

1. Khi nào mở đăng: kho mỗi acc cần bao nhiêu video sẵn (mục 8; ảnh ưu tiên Antigravity — đã chốt).
2. Duyệt danh mục mục 7 (đổi tên/chủ đề biến thể nào?).
3. Folklore: 12 biến thể đủ chưa, hay lên 15?
4. Có khoá Pexels/Pixabay chưa? (miễn phí, cần đăng ký.)
5. Acc LU: gán vào biến thể tiếng Đức hay Pháp?
