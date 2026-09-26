# Plan: render xong → chọn tài khoản TikTok → đăng video (cả 11 thể loại)

**Phạm vi:** mọi video của Xưởng Video AI (Compare Studio). Sau khi render MP4 xong, người dùng chọn một kênh TikTok rồi đăng lên kênh đó, ngay hoặc hẹn giờ.

Áp dụng cho cả 11 thể loại:

| Mã | Tên |
| --- | --- |
| `compare` | So Sánh 2 Vật |
| `survival` | Thử Thách Sinh Tồn |
| `tierlist` | Tier List Xếp Hạng |
| `vox` | Vox Collage |
| `newspaper` | Báo Cũ Điều Tra |
| `chalk` | Bản Đồ Bảng Phấn |
| `wildlife` | Thế Giới Động Vật |
| `kinetic` | Dark Cyber Kinetic |
| `science` | Khoa Học |
| `mystery` | Bí Ẩn & Kỳ Án |
| `folklore` | Tâm Linh Dân Gian |

**Nguyên tắc ảnh:** mọi ảnh do AI sinh đều đi qua **hàng đợi Antigravity** của bkt_web. **Không dùng Pollinations**, kể cả làm dự phòng (mục 3.5).

**Trạng thái (2026-09-23):** đã làm T1–T30 trên máy local, có test. **Chưa deploy lên VPS, chưa chạy khô và chưa đăng thật.** Mục 8 ghi các giá trị mặc định đã chọn khi chưa có quyết định.

| Việc | Trạng thái | Ghi chú |
| --- | --- | --- |
| T1–T2 caption | ✅ | `bkt_web/publish_kit.py` thay `publishing-kit.mjs` ở mọi endpoint |
| T3–T5 nhận diện, quốc gia | ✅ | `detect_video_type()`, `video_lang_title()` trong `compare_native.py` |
| T6 module ảnh chung | ✅ | `compare_studio/tools/antigravity-images.mjs`; trạng thái lưu ở `videos/<slug>/images.json` (không phải `meta.json`, vì mỗi script tạo tự ghi đè `meta.json`) |
| T7 tỉ lệ 4:3 | ✅ có sẵn | `_BRIDGE_RATIO_DIMS` đã có `4:3`, `3:4` |
| T8 bỏ Pollinations | ✅ | vox, newspaper, wildlife, mystery, tierlist, compare, folklore; test tĩnh chặn `pollinations.ai`, `getAiImageUrl(`, `generate_image_file` |
| T9–T12 chờ ảnh, tác vụ ảnh, đổi ảnh | ✅ | render/đăng trả 409 khi còn ảnh tạm; "Đổi ảnh → AI" và tạo hàng loạt đều qua Antigravity |
| T13–T15 render chung, sau render, khởi động | ✅ | `RENDER_IF_MISSING` / `RENDER_IF_READY`, `publish_flow.activate_waiting`, `startup_cleanup` |
| T16–T21 hàng đợi, publisher | ✅ | `bkt_web/publish_flow.py`; `NEEDS_CHECK`; `/api/upload/tasks/{id}/confirm`; `/api/upload/dry-run`; nhãn AI; tắt tunnel VPN |
| T22–T29 giao diện | ✅ | tab Đăng TikTok, bảng task, "Đăng video này", tự đăng trong hộp thoại tạo video, nhãn "Chờ N ảnh", `app.js?v=6.1` |
| T30 dữ liệu từng thể loại | ✅ | survival/science ghi `type`+`lang`; newspaper/kinetic lưu kịch bản; chalk tiêu đề/ngôn ngữ/slug; bỏ nhãn đặt cứng vox/mystery; compare ghi `spec.json` |
| Nhãn AI trên trang TikTok thật | ⚠️ chưa kiểm | Bộ chọn công tắc "AI-generated content" viết theo nhãn nhiều ngôn ngữ; không tìm thấy thì **dừng, không đăng**. Cần chạy khô trên VPS để xác nhận. |

---

## 1. Hiện trạng

Hệ thống đăng bài đã có sẵn và đang chạy:

| Thành phần | Vị trí | Vai trò |
| --- | --- | --- |
| Bảng `upload_tasks` | [server.py:603](../bkt_web/server.py#L603) | Hàng đợi đăng bài. Trạng thái: `PENDING`, `QUEUED`, `UPLOADING`, `SUCCESS`, `ERROR`, `CANCELLED`. |
| Bộ lập lịch `run_upload_scheduler` | [server.py:4113](../bkt_web/server.py#L4113) | Quét hàng đợi mỗi 3 giây, mỗi lần đăng một video (`UPLOAD_LOCK`), thử lại tối đa 3 lần (chờ 1, 2, 4 phút). |
| `publish_tiktok_video` | [tiktok_publisher.py:73](../bkt_web/tiktok_publisher.py#L73) | Nạp cookie của kênh, bật VPN WireGuard, mở `tiktokstudio/upload`, tải video, điền caption, bấm Đăng, chờ 30 giây để thấy xác nhận. |
| `POST /api/compare-videos/send-to-upload` | [server.py:3345](../bkt_web/server.py#L3345) | Đưa bản render mới nhất vào hàng đợi, luôn hẹn +1 tiếng. |
| `POST /api/upload/publish-now` | [server.py:3518](../bkt_web/server.py#L3518) | Đăng ngay, không thử lại. |
| `POST /api/upload/create-task` | [server.py:2812](../bkt_web/server.py#L2812) | Hẹn giờ, giãn cách nhiều kênh (tab Upload → New Post Studio). |

### Vấn đề chung cần sửa

1. **Tab "🚀 Đăng TikTok" trong Studio không dùng được.**
   - `populateWsTikTokChannelSelect` ([app.js:3949](../bkt_web/static/app.js#L3949)) không được gọi ở đâu cả, nên ô chọn kênh kẹt ở "Đang nạp danh sách kênh…".
   - Ô tiêu đề mẫu, caption và hashtag không bao giờ được điền.
2. **Nút "Đăng Kênh" luôn hẹn +1 tiếng.** Không sửa được caption, không chọn được giờ.
3. **Caption chỉ đúng cho kiểu so sánh.**
   - `publishing-kit.mjs` chỉ có mẫu "A vs B", và chỉ đọc `spec.json`.
   - Chi tiết từng thể loại ở mục 3.
4. **Không có bước nào chạy sau khi render xong.** `start_run` ([compare_native.py](../bkt_web/compare_native.py)) chỉ ghi mã thoát.
5. ✅ **Đã sửa 2026-09-23** — **5 thể loại không tự render dù đã tích "Render".** Sau bước tạo, trình quản lý tác vụ tự chạy `npm run render` nếu chưa có MP4 mới (`RENDER_IF_MISSING` trong `start_run`); thể loại tự render rồi thì bỏ qua.
   - vox, newspaper, kinetic, wildlife và mystery bỏ qua cờ render trong hàm `create*Video`.
   - Hệ quả: nếu chỉ móc việc đăng vào "sau khi render", các video này không bao giờ được đăng.
6. **Có nguy cơ đăng trùng.**
   - Khi đã bấm Đăng nhưng không thấy xác nhận ([tiktok_publisher.py:394](../bkt_web/tiktok_publisher.py#L394)), bộ lập lịch vẫn tự thử lại ([server.py:4181](../bkt_web/server.py#L4181)).
7. **Không kiểm tra video đã lên kênh.** `result_url` chỉ là URL của trang Studio.
8. **Không khai báo nội dung AI.** Mọi thể loại đều dùng giọng TTS, 5 thể loại dùng ảnh AI, nhưng publisher không bật công tắc "AI-generated content".
9. ✅ **Đã sửa 2026-09-23** — **Nhận nhầm thể loại.** Hàm chung `detect_video_type()` (khai báo type → cấu hình → tiền tố slug → marker HTML) dùng cho trang chi tiết, sửa kịch bản, thư viện và giao diện Studio. Sửa kịch bản của vox/newspaper/kinetic giờ trả 400 thay vì dựng đè template so sánh. Mô tả lỗi cũ:
   - `video_detail` xét theo marker HTML trước khi xét `meta.type`:
     - `wildlife-orca-vi` và `bi-an-chuyen-bay-mh370` bị dựng kịch bản như **chalk** (bước "Bản đồ master");
     - cả 3 video `kinetic-*` bị xử lý như **vox**.
   - Thư viện ([server.py:3246](../bkt_web/server.py#L3246)) chỉ nhận thể loại theo tiền tố slug. Danh sách tiền tố thiếu `newspaper`, và không nhận `bi-an-` (mystery) hay `dong-vat-` (wildlife).
   - Nhận quốc gia theo `"-de" in slug` nên `dev-vs-devops` bị gắn DE.
10. **Ảnh AI đang lấy từ Pollinations.**
    - vox, newspaper, wildlife và mystery gọi thẳng `image.pollinations.ai` trong hàm tạo.
    - compare dùng Pollinations khi không tìm thấy ảnh Wikipedia.
    - folklore dùng Pollinations làm dự phòng khi Antigravity quá hạn.
    - Nút "Đổi ảnh → AI" trong Studio gọi `generate_image_file` ([image_routes.py:260](../bkt_web/image_routes.py#L260)), bên trong cũng là Pollinations.
    - Ảnh Pollinations có watermark, hay lệch prompt và lệch phong cách giữa các cảnh. Plan này thay tất cả bằng Antigravity (mục 3.5).

### Quy tắc bắt buộc: phải chọn kênh thì mới được đăng

Không đường nào được tự chọn kênh thay người dùng: không lấy kênh đầu bảng, không lấy kênh mặc định, không xoay vòng. Hiện trạng đã đúng ở mọi đường đăng:

| Đường đăng | Backend | Frontend |
| --- | --- | --- |
| `send-to-upload` (nút "Đăng Kênh") | 400 nếu thiếu `channel_id`, 404 nếu kênh không tồn tại ([server.py:3370](../bkt_web/server.py#L3370)). Trước đây từng lấy `LIMIT 1`, đã bỏ. | Chặn, báo "Hãy chọn kênh TikTok…" ([app.js:2769](../bkt_web/static/app.js#L2769)) |
| `publish-now` (tab Đăng TikTok, "Đăng Ngay" trong hàng đợi) | `channel_id: int` bắt buộc ([server.py:3486](../bkt_web/server.py#L3486)) | Chặn, báo "Vui lòng chọn kênh TikTok mục tiêu!" ([app.js:3976](../bkt_web/static/app.js#L3976)) |
| `create-task` (Upload → New Post Studio) | 400 "Chưa chọn kênh đăng" nếu không có kênh, và kiểm tra mọi id tồn tại ([server.py:2855](../bkt_web/server.py#L2855)) | — |
| Đăng video remake | `channel_id: int` bắt buộc ([remake_routes.py:837](../bkt_web/remake_routes.py#L837)) | — |
| Bộ lập lịch | Chỉ đăng task đã có `channel_id` (khoá ngoại tới `channels`) | — |

Mọi phần làm mới phải giữ đúng quy tắc này:

- **Luồng B (tự đăng sau render):** chỉ tạo task khi người dùng đã chọn kênh. Không chọn kênh thì chỉ render, không đăng. `/api/runs` từ chối khối `publish` thiếu `channel_id` hoặc trỏ tới kênh không tồn tại.
- **Tab Đăng TikTok:** ô chọn kênh mặc định để trống. Nút Đăng bị khoá cho tới khi đã chọn kênh.
- **Sau khi render:** kiểm tra lại kênh còn tồn tại và còn cookie. Kênh đã bị xoá thì chuyển `ERROR`, không đổi sang kênh khác.

---

## 2. Luồng đề xuất (giống nhau cho mọi thể loại)

### A. Đăng thủ công sau khi render (làm trước)

1. Render xong, Studio hiện thông báo kèm nút **"Đăng video này"**, bấm vào sẽ mở tab Đăng TikTok.
2. **Chọn kênh.** Danh sách chỉ hiện kênh đủ điều kiện (có cookie, có VPN), kèm quốc gia và trạng thái. Nếu ngôn ngữ video không khớp quốc gia kênh (ví dụ video `vi`, kênh `DE`) thì hiện cảnh báo.
3. **Caption và hashtag** được điền sẵn theo **thể loại và ngôn ngữ** (mục 3), sửa được. Có 3 tiêu đề mẫu để chọn.
4. **Giờ đăng:** *Đăng ngay* hoặc *Hẹn giờ*.
5. **Nhãn AI:** công tắc *Khai báo nội dung AI*, mặc định theo thể loại (mục 3).
6. Bấm xác nhận: task vào hàng đợi, tab hiện log trực tiếp và trạng thái task.

### B. Tự đăng khi tạo video (tuỳ chọn)

- Hộp thoại "Tạo video mới", khi đã tích "Render", có thêm mục **"Sau khi render: đăng lên kênh [chọn] · [ngay / hẹn giờ]"**. Mục này dùng cho mọi thể loại.
- Lúc tạo, hệ thống ghi sẵn một task ở trạng thái mới **`WAITING_RENDER`**. Bộ lập lịch bỏ qua trạng thái này.
- Tạo video và render xong (T13–T14) → task chuyển `QUEUED` với đúng file MP4 vừa render. File phải mới hơn thời điểm bắt đầu tác vụ.
- Render lỗi, hoặc server khởi động lại giữa chừng → task chuyển `ERROR` kèm lý do.

### Vòng đời trạng thái task

```
WAITING_RENDER ──render OK──▶ QUEUED ──đến giờ──▶ UPLOADING ──xác nhận──▶ SUCCESS
      │                          ▲                    │
      │ render lỗi /             │ lỗi trước khi      ├──đã bấm Đăng, không xác nhận──▶ NEEDS_CHECK
      │ server khởi động lại     │ bấm Đăng (≤3 lần)  │                                   │
      ▼                          └────────────────────┘                     người dùng: "Đã lên" → SUCCESS
    ERROR                                                                    người dùng: "Thử lại" → QUEUED
```

---

## 3. Chi tiết từng thể loại

### 3.1. Dữ liệu dùng để viết caption

Caption gồm ba phần:

- **tiêu đề** (dòng đầu, gây tò mò);
- **mô tả** 1–2 câu, lấy từ lời thoại;
- **hashtag** theo thể loại và theo ngôn ngữ.

Bảng dưới là nơi mỗi thể loại đang lưu dữ liệu cần dùng.

| Thể loại | Nhận diện | Tiêu đề lấy từ | Câu mở / mô tả lấy từ | Ngôn ngữ lấy từ |
| --- | --- | --- | --- | --- |
| compare | Không tiền tố, slug dạng `x-vs-y`. Chỉ `tcp-vs-udp` có `spec.json` | `spec.labelLeft` vs `spec.labelRight`; không có thì tách slug theo `-vs-` | `BRIEF.md` → `message`; lời thoại trong `scripts/generate-vo.mjs` | `spec.lang` → `VIDEO_LANG` → `BRIEF.md language` |
| survival | `survival-` (meta **không có `type`**) | `spec.survivalConfig.title`, `eyebrow` | `survivalConfig.prologueSpoken`, `tiers[].caption` | `spec.lang` / `survivalConfig.lang` |
| tierlist | `tierlist-`, `spec.type` | `spec.topicTitle`, `headline` | `items[].hook` / `verdict` | `meta.lang` / `spec.lang` |
| vox | `vox-`, `spec.type` | `meta.voxConfig.topicTitle` (**bỏ** `labelLeft`/`labelRight` đặt cứng "Vox"/"Collage") | `voxConfig.beats[].line` | `meta.lang` |
| newspaper | `newspaper-`, `meta.template` (**không có `spec.json`**) | `meta.name` | **Không lưu lời thoại** (chỉ có trong `CURATED_NEWSPAPER_TOPICS`) | `meta.lang` |
| chalk | `chalk-`, `meta.type` | `spec.topicTitle` (`meta.name` đang bị ghi bằng slug) | `spec.scenes[].line` | **`meta.lang` đặt cứng "vi"**; dùng `spec.lang` |
| wildlife | `wildlife-`, `dong-vat-`, `meta.type` | `meta.wildlifeConfig.topicTitle` + `latinName` | `wildlifeConfig.scenes[].line` | `spec.lang` / `wildlifeConfig.lang` |
| kinetic | `kinetic-`, `meta.template` (**không có `spec.json`**) | `meta.name` | **Không lưu lời thoại** (chỉ có trong `CURATED_KINETIC_TOPICS`) | `meta.lang` |
| science | `science-` (hàm tạo mới **không ghi `type`**) | `meta.name` | `BRIEF.md message`; `scienceConfig.dialogues[].text` | `BRIEF.md language` |
| mystery | `mystery-`, `bi-an-`, `meta.type` | `meta.mysteryConfig.topicTitle` (**bỏ** "Mystery"/"Archive" đặt cứng) | `mysteryConfig.scenes[].line`, `eyebrow` | `spec.lang` / `mysteryConfig.lang` |
| folklore | `folklore-`, `meta.type` | `meta.folkloreConfig.topicTitle` | `folkloreConfig.hook`, `scenes[].line` | `meta.lang` |

### 3.2. Render, ảnh, nhãn AI, thời lượng

| Thể loại | Tự render khi tích "Render"? | Ảnh | Giọng | Nhãn AI mặc định | Thời lượng mẫu |
| --- | --- | --- | --- | --- | --- |
| compare | Có | Icon SVG; tuỳ chọn ảnh thật Wikipedia. Ảnh AI → **Antigravity** (hiện: Pollinations) | TTS | Bật (giọng AI) | 17–68 s |
| survival | Có (`npx … render`) | SVG có sẵn trong template | TTS | Bật (giọng AI) | 65 s |
| tierlist | Có | **Antigravity qua hàng đợi** (hiện: chép từ thư mục Antigravity đặt cứng trên máy Mac) | TTS | Bật | 79 s |
| vox | **Không** | **Antigravity** (hiện: Pollinations) | TTS | Bật | 51–52 s |
| newspaper | **Không** | **Antigravity** (hiện: Pollinations) | TTS | Bật | 44–85 s |
| chalk | Có | Bản đồ SVG vẽ bằng code | TTS | Bật (giọng AI) | 64 s |
| wildlife | **Không** | **Antigravity** (hiện: Pollinations) | TTS | Bật | 44 s |
| kinetic | **Không** | Không ảnh (chỉ chữ động) | TTS | Bật (giọng AI) | 46–52 s |
| science | Có | Nhân vật PNG có sẵn | TTS nhiều giọng | Bật (giọng AI) | 44 s |
| mystery | **Không** | **Antigravity** (hiện: Pollinations) | TTS | Bật | 29 s |
| folklore | Có | **Antigravity**, bỏ dự phòng Pollinations | TTS (có giọng ma mị) | Bật | 70 s – 2,5 phút |

- survival, chalk, kinetic và science không sinh ảnh AI (SVG hoặc PNG có sẵn), nên không đổi gì về ảnh.
- Mọi thể loại đều dưới giới hạn 600 giây của publisher.
- Vì mọi thể loại đều dùng giọng AI, đề xuất **bật nhãn AI mặc định cho tất cả**. Người dùng tắt được từng lần đăng (xem mục 8).

### 3.3. Hashtag theo thể loại

Hashtag của thể loại đặt trước, sau đó là hashtag chung theo ngôn ngữ (`vi`: `#xuhuong #fyp`, `en`: `#fyp #foryou`, `de`: `#fürdich`, `fr`: `#pourtoi`, `ja`: `#おすすめ`, `ko`: `#추천`). Tổng cộng tối đa 8 hashtag.

| Thể loại | vi | en | de | fr | ja | ko |
| --- | --- | --- | --- | --- | --- | --- |
| compare | `#sosanh #kienthuc #phanbiet` | `#comparison #learnontiktok` | `#vergleich #wissen` | `#comparaison #savoir` | `#比較 #豆知識` | `#비교 #상식` |
| survival | `#sinhton #khoahoc #neuthi` | `#survival #whatif` | `#überleben #wasWäreWenn` | `#survie #etsi` | `#サバイバル #もしも` | `#생존 #만약에` |
| tierlist | `#tierlist #xephang` | `#tierlist #ranking` | `#tierlist #ranking` | `#tierlist #classement` | `#ティアリスト #ランキング` | `#티어리스트 #순위` |
| vox | `#giaithich #phongsu` | `#explained #documentary` | `#erklärt #doku` | `#expliqué #documentaire` | `#解説 #ドキュメンタリー` | `#해설 #다큐` |
| newspaper | `#lichsu #vuandieutra` | `#history #truestory` | `#geschichte #wahregeschichte` | `#histoire #faitdivers` | `#歴史 #実話` | `#역사 #실화` |
| chalk | `#diachinhtri #bando` | `#geopolitics #maps` | `#geopolitik #karten` | `#géopolitique #cartes` | `#地政学 #地図` | `#지정학 #지도` |
| wildlife | `#dongvat #thiennhien` | `#wildlife #animals` | `#tiere #natur` | `#animaux #nature` | `#動物 #自然` | `#동물 #자연` |
| kinetic | `#tamly #tuduy` | `#psychology #mindset` | `#psychologie #mindset` | `#psychologie #mindset` | `#心理学 #思考` | `#심리학 #사고방식` |
| science | `#khoahoc #vutru` | `#science #space` | `#wissenschaft #weltraum` | `#science #espace` | `#科学 #宇宙` | `#과학 #우주` |
| mystery | `#bian #vuan #chuacoloigiai` | `#mystery #unsolved` | `#mysterium #ungelöst` | `#mystère #énigme` | `#ミステリー #未解決` | `#미스터리 #미제사건` |
| folklore | `#tamlinh #chuyenma #dangian` | `#folklore #ghoststory #creepy` | `#sagen #gruselig` | `#légende #frisson` | `#怪談 #民俗` | `#괴담 #민담` |

### 3.4. Sửa riêng từng thể loại

| Thể loại | Việc cần sửa |
| --- | --- |
| compare | Khi bật ảnh: vẫn tìm ảnh thật trên Wikipedia trước; không có ảnh thật thì xin Antigravity, không gọi Pollinations ([find-image.mjs](../compare_studio/tools/find-image.mjs) `findBestImage`/`getAiImageUrl`). Hàm tạo không ghi `meta.json`/`spec.json`. Ghi thêm `spec.json` tối thiểu (`type`, `labelLeft`, `labelRight`, `lang`, `message`) cho video mới. Video cũ đọc từ slug, BRIEF.md và generate-vo. |
| survival | Ghi `type: "survival"` và `lang` vào `meta.json`. |
| tierlist | Bỏ đường dẫn Antigravity đặt cứng trên máy Mac ([create-tierlist-video.mjs:94](../compare_studio/tools/create-tierlist-video.mjs#L94)), vì trên VPS video sẽ không có ảnh. Ảnh icon/showcase từng ứng viên xin qua hàng đợi Antigravity (mục 3.5). |
| vox | Sticker AI: thay Pollinations ([create-vox-video.mjs:151](../compare_studio/tools/create-vox-video.mjs#L151)) bằng Antigravity, tỉ lệ 1:1. Bỏ `labelLeft`/`labelRight` đặt cứng. Tự render qua bước chung (T13). |
| newspaper | Ảnh tư liệu: thay Pollinations ([create-newspaper-video.mjs:136](../compare_studio/tools/create-newspaper-video.mjs#L136)) bằng Antigravity, tỉ lệ 1:1. Lưu `newspaperConfig` (có `acts[].line`) vào `meta.json` để có mô tả và để sửa kịch bản được. Tự render qua bước chung (T13). |
| chalk | `meta.name` = `topicTitle`, `meta.lang` lấy theo ngôn ngữ thật thay cho "vi" đặt cứng. `createChalkVideo` đang bỏ qua `presetSlug`, nên slug bị sinh lại. |
| wildlife | Ảnh cảnh: thay Pollinations ([create-wildlife-video.mjs:142](../compare_studio/tools/create-wildlife-video.mjs#L142)) bằng Antigravity, tỉ lệ 9:16. Tự render qua bước chung (T13). Sửa nhận diện để không rơi vào nhánh chalk. |
| kinetic | Lưu `kineticConfig` (có `beats[].line`/`spoken`) vào `meta.json`. Tự render qua bước chung (T13). Sửa nhận diện để không rơi vào nhánh vox. |
| science | Hàm tạo ghi `type: "science"` và `lang` vào `meta.json`. |
| mystery | Ảnh bằng chứng: thay Pollinations ([create-mystery-video.mjs:152](../compare_studio/tools/create-mystery-video.mjs#L152)) bằng Antigravity, tỉ lệ 4:3 (cần T7). Bỏ "Mystery"/"Archive" đặt cứng. Tự render qua bước chung (T13). Sửa nhận diện để `bi-an-*` không rơi vào nhánh chalk. |
| folklore | Bỏ dự phòng "sinh tức thì" (Pollinations) trong [folklore-images.mjs](../compare_studio/tools/folklore-images.mjs) và bỏ lựa chọn "Sinh tức thì" trong hộp thoại. Chuyển sang module ảnh chung (T6). Thêm nhánh caption. |

### 3.5. Ảnh: chỉ dùng Antigravity

**Nguyên tắc:**

- Mọi ảnh AI của video đều xin qua hàng đợi `image_queue` với `engine=antigravity`. Luồng giống folklore đang chạy trên VPS: bridge đẩy task vào inbox → agent Antigravity sinh ảnh → bridge nhập về thư viện → video tải ảnh về.
- **Không còn đường nào gọi Pollinations** trong pipeline video: không gọi trong hàm tạo, không làm dự phòng khi quá hạn, không dùng cho nút "Đổi ảnh" trong Studio.
- Ảnh thật (Wikipedia/Commons cho compare) và ảnh vẽ bằng code (SVG, PNG có sẵn) không phải ảnh AI, nên giữ nguyên.

**Module ảnh chung** — tách từ [folklore-images.mjs](../compare_studio/tools/folklore-images.mjs) thành `tools/antigravity-images.mjs`:

- `requestImages({dir, meta, items})`, với `items = [{key, prompt, negative, aspect, dest}]`.
  - `key` là tên ảnh trong video, ví dụ `scene-3`, `sticker-2`, `act-1`, `item-4-icon`, `left`.
  - Hàm xếp task và lưu `taskId` từng ảnh vào `meta.json → images[key]`, để chạy lại không tạo task trùng.
- `collectImages({dir, meta, timeoutMin})`: chờ bridge trả ảnh, tải về đúng `dest`, ghi `images[key].source = "antigravity"`.
- Mỗi thể loại chỉ khai báo danh sách `items` của mình (prompt, tỉ lệ, tên file). Không thể loại nào tự gọi API ảnh.
- Phong cách ảnh cố định theo thể loại, đặt trong `*-configs.mjs` giống `FOLKLORE_IMAGE_STYLE`, để các ảnh sinh riêng lẻ vẫn cùng một phong cách.

**Tỉ lệ ảnh theo thể loại:**

| Thể loại | Ảnh | Tỉ lệ | Bridge đã hỗ trợ? |
| --- | --- | --- | --- |
| folklore | `scene-<shot>` | 1:1 | Có |
| vox | `sticker-<n>` | 1:1 | Có |
| newspaper | `act-<n>` | 1:1 | Có |
| wildlife | `scene-<n>` | 9:16 | Có |
| mystery | `scene-<n>` | 4:3 | **Chưa**: thêm `4:3`, `3:4` vào `_BRIDGE_RATIO_DIMS` ([image_routes.py:1256](../bkt_web/image_routes.py#L1256)) |
| tierlist | `item-<n>-icon`, `item-<n>-showcase` | 1:1, 9:16 | Có |
| compare | `left`, `right` (khi không có ảnh thật) | 1:1 | Có |

**Khi Antigravity chưa trả ảnh (không có Pollinations dự phòng):**

- Video chuyển trạng thái **"Chờ ảnh Antigravity"**. Ảnh còn thiếu hiện nền tối tạm, **chỉ để xem trước trong Studio**.
- **Không render MP4 và không đăng** khi còn ảnh tạm:
  - nút Render và nút Đăng bị khoá, kèm lý do "còn N ảnh chờ Antigravity";
  - bước render chung (T8) và task `WAITING_RENDER` đều chờ theo.
- Tác vụ `images` (nút "🎨 Ảnh Antigravity", mở rộng cho mọi thể loại) tiếp tục lấy ảnh đã xong. Khi đủ ảnh:
  - nếu người dùng đã tích Render thì tự render;
  - sau đó chạy bước sau render (xếp hàng đăng nếu đã chọn kênh).
- Task Antigravity báo lỗi (`failed`) → tự xin lại tối đa 2 lần với cùng prompt. Vẫn lỗi thì báo rõ trên video; người dùng sửa prompt hoặc đổi ảnh từng cảnh rồi xin lại.
- Thời gian chờ mặc định 45 phút mỗi lượt. Hết lượt không làm mất task; bấm "🎨 Ảnh Antigravity" để chờ tiếp.

**Nút "Đổi ảnh" trong Studio (mọi thể loại):**

- Lựa chọn "AI" chuyển sang **xin ảnh Antigravity**:
  - `change-image` với `type: "antigravity"` xếp task và trả `taskId` ngay, không chờ;
  - ảnh cũ giữ nguyên tới khi ảnh mới về, thẻ cảnh hiện "Đang chờ Antigravity…";
  - khi ảnh về, tác vụ `images` (hoặc lượt kiểm tra định kỳ của Studio) thay ảnh và đánh dấu video cần render lại.
- Bỏ đường gọi `generate_image_file`/`generate-instant` (Pollinations) khỏi pipeline video. Tab AI Studio riêng vẫn giữ công cụ đó nếu cần; việc này không nằm trong plan.
- Upload ảnh từ máy và dán URL ảnh vẫn giữ.

**Năng lực xử lý cần tính:**

- Bridge trên VPS chạy theo timer 3 phút một lần và giữ tối đa 3 task đang xử lý. Đo thực tế: 7 ảnh folklore mất khoảng 15–20 phút.
- Nhiều video cùng xin ảnh sẽ xếp hàng nối nhau. Studio hiện "số ảnh còn chờ / vị trí trong hàng đợi" để người dùng biết khi nào video sẵn sàng.
- Số ảnh ước lượng mỗi video:

  | Thể loại | Số ảnh |
  | --- | --- |
  | folklore | 5–15 |
  | vox | 6–8 |
  | newspaper | 6–8 |
  | wildlife | 6 |
  | mystery | 8 |
  | tierlist | 10 (5 ứng viên × 2) |
  | compare | 0–2 |

---

## 4. Việc cần làm

Mỗi việc có mã cố định **T1…T30** để tham chiếu; mã không đổi khi thêm hoặc bớt việc.

### 4.1. Caption native trong Python — thay cho `publishing-kit.mjs`

- **T1.** Viết `build_publish_kit(slug)` trong [compare_native.py](../bkt_web/compare_native.py):
  - **Nhận diện thể loại** bằng `detect_video_type()` (T3).
  - **Đọc dữ liệu** tiêu đề, câu mở, lời thoại và ngôn ngữ theo bảng 3.1. Mỗi thể loại một hàm đọc riêng; thiếu trường thì dùng trường kế tiếp trong bảng.
  - **Kết quả:** `{titles[3], description, hashtags[], hashtagString, caption, aiGenerated, lang, type}`.
    - 3 tiêu đề: một tiêu đề gây tò mò, một tiêu đề thẳng, một tiêu đề dạng câu hỏi. Mẫu viết cho 6 ngôn ngữ.
    - Mô tả: 1–2 câu đầu của lời thoại.
    - Hashtag theo bảng 3.3.
  - **Độ dài:** caption cộng hashtag dưới 2200 ký tự. Hashtag sinh từ nhãn phải giữ chữ có dấu và chữ CJK; hiện tại chữ không phải `a-z0-9` bị xoá.
- **T2.** `/api/videos/{slug}/publishing-kit`, `/api/compare-videos/video/{slug}/details` và `send-to-upload` đều dùng `build_publish_kit`.

### 4.2. Nhận diện thể loại dùng chung

- **T3.** ✅ *Đã làm.* Viết `detect_video_type(slug, meta, spec, html)` với thứ tự:
  - `meta.type` / `spec.type`;
  - rồi `meta.template` / `meta.category`;
  - rồi tiền tố slug (gồm `bi-an-`, `dong-vat-`);
  - cuối cùng mới đến marker HTML, chỉ khi các bước trên không ra kết quả.
- **T4.** ✅ *Đã làm (trừ `build_publish_kit`, chưa viết).* `video_detail`, `edit-script`, thư viện `api_get_compare_library` và `build_publish_kit` đều dùng hàm này.
- **T5.** Nhận quốc gia trong thư viện theo ngôn ngữ video (bảng 3.1), không theo chuỗi con của slug.

### 4.3. Ảnh Antigravity cho mọi thể loại (thay Pollinations)

- **T6.** Tách `tools/antigravity-images.mjs` từ `folklore-images.mjs` (`requestImages` / `collectImages`, lưu `meta.json → images`). folklore chuyển sang module này và bỏ dự phòng Pollinations.
- **T7.** Thêm `4:3` và `3:4` vào `_BRIDGE_RATIO_DIMS` ([image_routes.py:1256](../bkt_web/image_routes.py#L1256)).
- **T8.** vox, newspaper, wildlife, mystery, tierlist và compare (ảnh AI) khai báo `items` và gọi module chung. Xoá mọi URL `image.pollinations.ai` và `getAiImageUrl` trong pipeline video.
- **T9.** Trạng thái "Chờ ảnh Antigravity" của video:
  - tính từ `meta.json → images`;
  - hiện trong thư viện và trang chi tiết;
  - khoá Render và Đăng khi còn ảnh tạm, cả ở API: `/api/runs` task `render` và `send-to-upload` trả 409 kèm số ảnh còn chờ.
- **T10.** Tác vụ `images` dùng cho mọi thể loại có ảnh AI. Khi đủ ảnh thì chạy tiếp render và bước sau render nếu đã được yêu cầu (nối với T11–T12).
- **T11.** `change-image` nhận `type: "antigravity"` (bất đồng bộ) và thay lựa chọn "AI" trong hộp thoại đổi ảnh. Bỏ nhánh `generate_image_file`/Pollinations trong `api_video_change_image` ([compare_native.py](../bkt_web/compare_native.py)).
- **T12.** Hộp thoại Tạo video mới: bỏ lựa chọn "Sinh tức thì" của folklore. Mọi thể loại có ảnh AI ghi rõ "Ảnh: Antigravity (chờ vài phút mỗi ảnh)".

### 4.4. Render và bước sau render dùng chung

- **T13.** ✅ *Đã làm phần render; phần chờ ảnh Antigravity làm cùng T9.* **Render chung sau khi tạo:** trong `start_run` với tác vụ `create` có `render`:
  - chờ đủ ảnh Antigravity (T9);
  - nếu `renders/` chưa có MP4 mới hơn `startedAt` thì tự chạy `npm run render`.
  - Cách này sửa được 5 thể loại không tự render mà không phải sửa từng script tạo.
- **T14. Bước sau render:** áp dụng cho `render`, `create` có render, và `images`/`fit` có render.
  - Mã thoát 0 và có MP4 mới → task `WAITING_RENDER` của tác vụ chuyển `QUEUED`.
  - Ngược lại → `ERROR`.
  - Ghi vào log, ví dụ "Đã xếp hàng đăng lên @user lúc 19:30".
- **T15. Khi app khởi động:** task `WAITING_RENDER` không còn tác vụ tương ứng → `ERROR` ("render bị gián đoạn do khởi động lại"). Video đang "Chờ ảnh" thì giữ nguyên, vì task Antigravity vẫn còn trong hàng đợi.

### 4.5. Hàng đợi đăng và publisher

- **T16. Hàm tạo task chung** `enqueue_upload(slug, channel_id, caption, hashtags, schedule_ts, ai_generated, status="QUEUED")`:
  - kiểm tra kênh tồn tại và có cookie, file MP4 có thật và nằm trong `compare_studio/videos`, video không còn ảnh tạm;
  - `send-to-upload` nhận thêm `caption`, `hashtags`, `schedule_time` hoặc `delay_minutes`, `ai_generated`.
- **T17.** `/api/runs` nhận khối `publish: {channel_id, caption?, hashtags?, schedule_ts?, ai_generated?}` → tạo task `WAITING_RENDER`, lưu `run_id`. Thiếu `channel_id` hoặc kênh không tồn tại → 400.
- **T18. Chống đăng trùng:**
  - lỗi "đã bấm Đăng nhưng chưa xác nhận", và task `UPLOADING` bị ngắt vì restart sau bước bấm Đăng → **`NEEDS_CHECK`**, không tự thử lại;
  - lỗi trước khi bấm Đăng vẫn thử lại như cũ;
  - thêm `POST /api/upload/tasks/{id}/confirm` để người dùng đánh dấu đã lên.
- **T19. Cảnh báo đăng dày:** kênh đã có task `QUEUED`/`SUCCESS` trong vòng 2 giờ quanh giờ hẹn → cảnh báo, người dùng xác nhận mới tạo.
- **T20. Publisher:**
  - `ai_generated: bool`: bật công tắc "AI-generated content". Không tìm thấy công tắc thì dừng và báo lỗi, không đăng khi chưa khai báo.
  - `dry_run: bool`: tải video, điền caption, bật nhãn AI, chụp màn hình rồi **dừng trước khi bấm Đăng**.
  - Trả mã riêng cho trường hợp "đã bấm, chưa xác nhận".
  - Tắt tunnel VPN sau khi đăng.
- **T21.** Cột mới trong `upload_tasks`: `ai_generated`, `run_id`, `video_slug`, `clicked_post_at` (để phân biệt `NEEDS_CHECK`). Thêm bằng migration như các cột cũ.

### 4.6. Frontend — [app.js](../bkt_web/static/app.js), [index.html](../bkt_web/static/index.html)

- **T22. Tab Đăng TikTok:**
  - gọi `populateWsTikTokChannelSelect` khi mở tab và khi danh sách kênh tải xong, ô kênh mặc định để trống;
  - nạp `build_publish_kit` vào ô tiêu đề mẫu, caption và hashtag;
  - thêm *Đăng ngay / Hẹn giờ*, *Khai báo nội dung AI* (mặc định theo thể loại), *Chạy khô*;
  - nút Đăng khoá khi chưa chọn kênh hoặc video còn chờ ảnh.
- **T23. Bảng trạng thái task:** Chờ ảnh → Chờ render → Trong hàng đợi → Đang đăng → Thành công / Cần kiểm tra / Lỗi, kèm nút Huỷ, Thử lại, Đã lên.
- **T24. Khi SSE báo render xong:** thông báo có nút "Đăng video này". Áp dụng cho mọi thể loại.
- **T25. Hộp thoại Tạo video mới:** mục "Tự đăng sau render" (chọn kênh + giờ) cho **cả 11 thể loại**, chỉ bật được khi đã tích Render.
- **T26.** Nút "Đăng Kênh" trong thư viện mở cùng biểu mẫu ở T22.
- **T27. Thư viện:** hiện đúng thể loại và tiêu đề theo `detect_video_type` và `build_publish_kit` (thay cho tiêu đề slug), và hiện nhãn "Chờ ảnh Antigravity (N)".
- **T28. Đổi ảnh từng cảnh:** lựa chọn "AI" gọi Antigravity (T11), hiện trạng thái chờ trên thẻ cảnh.
- **T29.** Tăng `app.js?v=` trong `index.html` vì Cloudflare cache file tĩnh.

### 4.7. Sửa dữ liệu từng thể loại

- **T30.** Các việc ở bảng 3.4 (compare, survival, tierlist, vox, newspaper, chalk, wildlife, kinetic, science, mystery, folklore).

---

## 5. Kiểm thử

Mọi unit test dùng database SQLite tạm và thư mục video tạm, **không** đụng `bkt_channels.db` hay `compare_studio/videos` thật.

- **Nhận diện thể loại:** bảng test cho cả 11 thể loại, với từng kiểu dữ liệu:
  - chỉ có `meta.type`, chỉ có tiền tố slug, chỉ có marker HTML;
  - các ca đang sai: wildlife hoặc mystery có `const SCENES =`, kinetic có `const BEATS =`.
- **Caption:** với mỗi thể loại × 6 ngôn ngữ:
  - có tiêu đề thật (không "Side B", không slug in hoa);
  - hashtag đúng bảng 3.3;
  - dưới 2200 ký tự;
  - chữ có dấu và chữ CJK được giữ nguyên.
- **Ảnh Antigravity:**
  - test tĩnh: không file nào trong `compare_studio/tools/` và pipeline video của `bkt_web/` còn chuỗi `pollinations` hay `getAiImageUrl`;
  - ảnh tạm khoá Render và Đăng (API trả 409);
  - chạy lại tác vụ `images` không tạo task trùng;
  - task Antigravity `failed` được xin lại tối đa 2 lần;
  - đủ ảnh thì tự render nếu đã tích Render;
  - hàng đợi ảnh giả lập (không gọi Antigravity thật) cho mọi thể loại có ảnh AI, đúng tỉ lệ theo bảng 3.5.
- **Render chung sau khi tạo:** giả lập script tạo không render → bước chung chạy `npm run render`; script tạo đã render → không render lại.
- **Vòng đời `WAITING_RENDER`:**
  - render OK → `QUEUED`; render lỗi → `ERROR`; khởi động lại → `ERROR`;
  - không đăng MP4 cũ;
  - kênh bị xoá giữa lúc render → `ERROR`.
- **Chống đăng trùng:** "đã bấm, chưa xác nhận" → `NEEDS_CHECK`, không thử lại; lỗi trước khi bấm → thử lại.
- **Quy tắc chọn kênh:** thiếu kênh, kênh không tồn tại và kênh thiếu cookie đều bị từ chối ở mọi endpoint.
- **So khớp dữ liệu thật (chỉ đọc):** chạy `build_publish_kit` cho 28 video có sẵn, xem lại bằng mắt 1 video mỗi thể loại.
- **Trên VPS:**
  - tạo 1 video mỗi thể loại có ảnh AI, ảnh về qua Antigravity, xem khung hình;
  - chạy `dry_run` đăng với một kênh, xem ảnh chụp màn hình (ô file, caption, công tắc AI, nút Đăng).
- **Đăng thật:** 1 video lên **1 kênh test do người dùng chỉ định** → xác nhận lên kênh → mới mở cho các kênh và thể loại khác.
- **Kiểm tra sẵn có:** `node --check bkt_web/static/app.js`, `python3 -m unittest discover -s tests`.

---

## 6. Thứ tự làm

| Đợt | Nội dung | Việc |
| --- | --- | --- |
| 1 | Nhận diện thể loại đúng + caption đúng cho cả 11 thể loại | T1–T5, T27 + test |
| 2 | Ảnh Antigravity cho mọi thể loại, bỏ Pollinations | T6–T12, T28 + test |
| 3 | Đăng thủ công dùng được, không đăng trùng | T16, T18–T22 (trừ nhãn AI), T23, T26, T29 + test |
| 4 | Tự đăng sau render cho mọi thể loại | T13–T15, T17, T24, T25 + test |
| 5 | Sửa dữ liệu từng thể loại | T30 |
| 6 | Nhãn AI, chạy khô, đăng thật | T20 (nhãn AI, `dry_run`) + chạy khô + đăng thật trên VPS |

- Đợt 1 làm trước vì đăng video với caption "Side B" còn tệ hơn không đăng.
- Đợt 2 phải xong trước đợt 4, vì tự đăng phải chờ đủ ảnh Antigravity rồi mới render.
- Đợt 4 chỉ nên bật sau khi đợt 3 đã đăng thật thành công.

---

## 7. Rủi ro và lưu ý

- **Đăng bài là công khai và không rút lại được.** Luồng B chỉ nên dùng khi đã tin luồng A.
- **Antigravity là nguồn ảnh duy nhất.**
  - Khi bridge hoặc agent Antigravity trên VPS ngừng (hết quota, mất đăng nhập, service `antigravity` dừng), mọi video có ảnh AI sẽ đứng ở "Chờ ảnh".
  - Cần cảnh báo sớm trong Studio khi bridge không nhận task mới trong 10 phút, kèm chỉ dẫn kiểm tra `tokmatrix-status`.
- **Thời gian chờ ảnh:** video 8 ảnh mất khoảng 15–25 phút trước khi render được. Nhiều video cùng lúc thì lâu hơn.
- **Cookie hết hạn:** task `ERROR` khi bị chuyển sang trang đăng nhập; cần cập nhật cookie của kênh.
- **VPN:** tunnel WireGuard hiện không được tắt sau khi đăng (sửa ở T20). VPS là datacenter ở Đức, nên chọn kênh có VPN cùng quốc gia với nội dung.
- **Restart `tokmatrix-web`** ngắt task `UPLOADING` và render đang chạy. Kiểm tra `pgrep -af hyperframes` và bảng task trước khi restart.
- **tierlist trên VPS:** ảnh đang lấy từ thư mục trên máy Mac, nên video tạo trên VPS không có ảnh cho tới khi làm T8.
- **newspaper và kinetic cũ** không lưu lời thoại. Caption vẫn có tiêu đề nhưng mô tả ngắn hơn, trừ khi lấy được từ bộ chủ đề có sẵn.
- **Thời lượng:** mọi thể loại đều dưới 600 giây.

---

## 8. Cần chốt trước khi làm

> Mặc định đã dùng khi làm (đổi được): Q1 làm cả hai luồng (tự đăng vẫn bắt buộc chọn kênh) · Q2 "Đăng ngay", có hẹn giờ · Q3 mọi kênh có cookie, chỉ cảnh báo khi lệch ngôn ngữ/quốc gia · Q4 bật nhãn AI cho mọi thể loại · Q5 giữ ảnh thật Wikipedia trước cho compare · Q6 chờ 45 phút mỗi lượt rồi dừng · Q7 đúng bảng 3.3 · Q8 chưa chọn — chưa đăng thật.

- **Q1. Tự đăng hay duyệt tay:** cần luồng B (tự đăng sau render) cho mọi thể loại, hay chỉ luồng A?
- **Q2. Giờ đăng mặc định:** đăng ngay, +1 giờ như hiện nay, hay khung giờ cố định theo múi giờ của kênh (ví dụ 19h–21h)?
- **Q3. Kênh được chọn:** mọi kênh có cookie, chỉ kênh trạng thái BKT, hay chỉ kênh cùng quốc gia với ngôn ngữ video?
- **Q4. Nhãn nội dung AI:** bật mặc định cho **tất cả** thể loại (vì đều dùng giọng AI), hay chỉ các thể loại dùng ảnh AI (vox, newspaper, wildlife, mystery, folklore, tierlist)?
- **Q5. Ảnh thật cho compare:** giữ tìm ảnh Wikipedia/Commons trước rồi mới xin Antigravity, hay chuyển hẳn sang Antigravity?
- **Q6. Hết thời gian chờ Antigravity:** giữ 45 phút mỗi lượt rồi dừng chờ người bấm tiếp, hay tự chờ tiếp không giới hạn cho tới khi đủ ảnh?
- **Q7. Hashtag:** bảng 3.3 có cần thêm hoặc bớt tag nào cho kênh của bạn không?
- **Q8. Kênh test:** kênh nào dùng cho lần đăng thật đầu tiên?
