# Engine mở rộng cho Matrix native render

Sáu engine đầu (mystery, newspaper, vox, folklore, kinetic, science) được dựng trực tiếp trong
`../native-engine-adapter.mjs`. Các engine có dữ liệu có cấu trúc riêng (tierlist, survival, chalk,
wildlife, compare) mỗi engine là một module ở đây, đăng ký trong `index.mjs`.

Kịch bản Matrix không đổi theo engine: mỗi cảnh có `line` (lời đọc) và `visual_intent`, thời lượng
đo từ TTS thật. Dữ liệu riêng của template (bậc tier, chỉ số, bản đồ…) được sinh ở bước
**engine extras** (`../../story/engine-extras.mjs`) ngay sau kịch bản và lưu ở
`manifest.script.engine_extras = { engine, source: "llm" | "fallback", data }`.

## Hợp đồng module (`export default { ... }`)

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | string | trùng tên engine (`tierlist`…) |
| `configKey` | string | khoá cấu hình trong `meta.json`/`spec.json` (vd `tierListConfig`) |
| `voPrefix` | string | tên file giọng: `assets/vo/<voPrefix>-<n>.mp3` (n từ 1, mỗi cảnh một file) |
| `assetType` | `"IMAGE_AI"｜"TEXT"｜"SVG"｜"MAP"｜"CHART"｜"CANVAS"` | loại hình mỗi cảnh cho visual-director. `IMAGE_AI` = mỗi cảnh xin 1 ảnh Antigravity (hàng đợi đang nghẽn — chỉ dùng khi template thật sự cần ảnh chụp) |
| `imageName(index, ext)` | fn | chỉ khi `assetType === "IMAGE_AI"`: đường dẫn tương đối ảnh cảnh n trong video, vd `assets/images/scene-3.jpg` |
| `extras.schema(sceneCount)` | fn → schema | Gemini responseSchema (kiểu viết HOA như `story/structured-output.mjs`) |
| `extras.prompt({ script, topic, language, channel })` | fn → string | yêu cầu cho LLM; nhận kịch bản đã viết (các cảnh có `scene_index`, `line`, `visual_intent`), KHÔNG được viết lại lời đọc |
| `extras.validate(data, scenes)` | fn → string[] | lỗi cụ thể (rỗng = hợp lệ); dùng để hỏi lại model một lần |
| `extras.fallback(scenes, { title, language })` | fn → data | suy ra dữ liệu hợp lệ, xác định (không ngẫu nhiên) từ kịch bản khi LLM lỗi |
| `prepareAssets({ targetDir, compareDir })` | async fn → string[] (tuỳ chọn) | chép asset tĩnh dùng chung vào video, trả danh sách file đã chép |
| `buildHtml(ctx)` | async fn → `{ html, cfg }` | dựng `index.html` HyperFrames |
| `compositionId(slug)` | fn → string | `data-composition-id` của root (cho test) |

`ctx` của `buildHtml`: `{ slug, title, lang, channel, manifest, totalDuration, extras, sfxCues,
bgmSegments, cinemaAudioHtml, common, scenes }` với `scenes[i] = { ...cảnh manifest, index, id, start,
duration, line, visual_intent, voSrc, imgSrc }`. `start`/`duration` là thời gian đo thật — giữ nguyên,
không chia đều, không tự thêm TTS hay ảnh mới. `common = { lang, topicTitle, fullScriptHtml, watermark }`
(đã escape HTML).

Quy tắc chung: không bắt đầu animation tự chạy khi render; timeline GSAP paused, seek được; chữ của
kịch bản Matrix dài hơn nội dung mẫu nên phải co cho vừa khung; video 25–90 s.
