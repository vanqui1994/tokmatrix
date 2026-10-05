# Plan: engine Matrix `vector` — video từ thư viện vector

Thư viện vector (`bkt_web/static/remake_vector_*`, 583 rig, 79 story mẫu, Phần II J–U) hiện chỉ dùng
cho trang thư viện và remake. Plan này đưa nó vào Matrix/Autopilot thành một engine mới để tự sinh
video đăng TikTok.

**Thị trường: chỉ de, us, kr, jp.** Không làm cho thị trường Việt Nam:
- không kênh `vi`, không lời thoại tiếng Việt, không story/niche nhắm khán giả Việt;
- không rig/trang phục mang dấu hiệu Việt (`chibi_farmer` với nón lá, áo bà ba…) trong video của engine này;
- validator của engine từ chối kênh có `language: vi` và asset nằm trong danh sách `VI_ONLY_ASSETS`.

## 0. Trạng thái (05/10/2026)

- Tuần 0 xong: HyperFrames 0.7.58 render canvas tất định (2 lần render cùng md5 khung), 1080×1920 qua `Renderer(..., {scale})`.
- Tuần 1–3 xong phần code: `compare_studio/matrix/render/engines/vector.mjs`, `bkt_web/vector_video/` (extents, niches, dna,
  builder, qa, cli), `config/vector_niches.json` (11 niche), DNA 5 trục, QA hình học, tool `tools/vector-sample.mjs`.
  Quét 264 tổ hợp niche × ngôn ngữ × kênh và 300 storyboard ngẫu nhiên: 100 % qua QA, không treo.
- Đăng ký: `RENDERABLE_ENGINES`, `revive.py`, `compatibility_matrix.yaml` + `allowed_engines` của 11 niche.
- Chưa làm: tuần 4 (bật `vector` trong `preferred_engines` của kênh thật + gán DNA) — chờ chủ kênh chọn kênh.

## 1. Mục tiêu và tiêu chí xong

- Engine `vector` nằm trong `RENDERABLE_ENGINES`, Autopilot chọn được cho kênh có `preferred_engines`
  chứa `vector`.
- Một video: 60–75 s (Creator Rewards > 60 s, QA cho phép 25–90 s), 9:16 1080×1920, lời đọc TTS
  theo giọng của kênh, phụ đề, BGM CC0 của kênh.
- **Không dùng ảnh AI** (`assetType: "CANVAS"`): không tốn quota Antigravity/ImageRouter.
- Hai tài khoản cùng nước, cùng chủ đề vẫn qua cổng tương đồng nội bộ 0.62 (không nới ngưỡng).
- Tỉ lệ video qua QA tự động ở lần dựng đầu ≥ 80 %, phần còn lại qua sau ≤ 2 lần dựng lại.

## 2. Kiến trúc

```
topic ─► script-generator (lời đọc, không đổi)
      ─► engine-extras (module vector): LLM trả "storyboard beats" JSON
      ─► vector_story_builder.py: beats → story vector đầy đủ (pose, action, cảnh)  [Python, tất định]
      ─► validate_story + ground_warnings + vector QA (mục 6)
      ─► thời lượng cảnh = độ dài TTS đo thật
      ─► buildHtml: index.html HyperFrames nhúng engine + catalog + packs + story
      ─► render MP4 (seek từng khung bằng renderFrame(t))
```

### 2.1 Module `compare_studio/matrix/render/engines/vector.mjs`
Theo hợp đồng trong `engines/README.md`:
- `id: "vector"`, `assetType: "CANVAS"`, `voPrefix: "vec"`.
- `extras.schema/prompt/validate/fallback`: LLM chỉ **chọn beat và điền tham số** (mục 3), không viết
  toạ độ. `fallback` dựng storyboard tất định từ template (mục 4, chế độ A) — không bịa nội dung.
- `buildHtml(ctx)`: gọi bridge Python (`python -m bkt_web.vector_video build --manifest …`) để có story
  JSON, rồi dựng HTML một `<canvas>` 1080×1920 + mã engine/catalog/packs nhúng offline
  (`remake_vector.engine_sources()`, không CDN, không fallback về lõi). Timeline HyperFrames paused;
  mỗi lần seek gọi `window.renderFrame(t)`. Không vòng animation tự chạy khi `?render=1`.
- Phụ đề: lớp HTML của kit (co chữ theo khung như `applyMatrixLayoutFixes`), không vẽ lên canvas.

### 2.2 `bkt_web/vector_video/` (Python, mới)
- `beats.py`: thư viện beat (mục 3), mỗi beat là hàm sinh pose/action đúng hình học.
- `builder.py`: storyboard beats + thời lượng TTS → story vector; gọi `validate_story`.
- `dna.py`: DNA hình ảnh theo tài khoản (mục 5).
- `qa.py`: QA pixel (mục 6).
- `cli.py`: `build`, `qa`, `preview --channel <id> --topic "<…>" --out <dir>`.

### 2.3 Spike kỹ thuật (làm đầu tiên, 1 ngày)
Xác nhận HyperFrames 0.7.58 render được canvas tất định bằng seek: một HTML thử với story `momotaro`,
`npm run check` sạch, MP4 15 s, render hai lần cho cùng hash khung. Nếu HyperFrames không seek được
canvas, dùng `renderer_adapters/native_vector.py` (Playwright, `renderFrame`) để xuất PNG → ffmpeg,
rồi ghép TTS/BGM/phụ đề như pipeline audio hiện có.

## 3. Thư viện beat (chế độ B — hướng chính)

LLM không tự viết toạ độ (lỗi của Gemini qua 12 giai đoạn: tay kéo dài, người chồng nhau, bơi lùi,
`opacity` giữ sang keyframe sau, hai mặt trời…). Mỗi beat là một hàm Python:

| Beat | Tham số | Dựa trên |
|---|---|---|
| `enter` / `exit` | actor, side, distance ≥ 150 | walk, `flip` theo hướng đi |
| `walk_to` | actor, target, stop_gap | giữ khoảng cách ≥ bề rộng pixel đo được |
| `hold` | actor, prop, hand | `held_pose` + kích thước pixel ≥ 60 |
| `give` | from, to, prop | `grip` chuyển tay |
| `ride` | rider, vehicle | `ride` + `seat_1` |
| `pick` / `shake` | actor, tree | `tree_pick_events` / `tree_shake_events` |
| `carry_together` / `haul` | actors, load | hook dùng chung (pose đứng yên) |
| `emote` | actor, symbol | chỉ `EMOTE_SYMBOLS` |
| `grow` / `build` | target | `grow_fast`, `build` |
| `weather_change` / `time_change` | from, to | background weather/night |
| `reveal` | target | `opacity` 0 → 1 (ghi rõ 1 ở keyframe sau) |
| `talk` | a, b | hai nhân vật quay mặt vào nhau, cách ≥ 90 px |
| `science_demo` | kind (lever, pulley, moon_phase, water_cycle, volcano) | hình học từ anchor như story phase T |
| `sequence` | list of beats | ghép tuần tự trong một cảnh |

Mỗi cảnh = 1 câu lời đọc = 1–3 beat. Builder đặt người theo "slot" ngang cố định (3–4 slot tuỳ cỡ
nhân vật) để không bao giờ chồng nhau, và giữ mọi hành động chính trên y ≈ 850 (phụ đề phía dưới).

## 4. Ba chế độ tạo

- **A. Template** (tuần 1): chọn một trong ~20 story mẫu phù hợp nước và niche; LLM viết lại lời
  thoại theo ngôn ngữ kênh; thời gian cảnh co giãn theo TTS. Ít rủi ro, nhưng dễ lặp nội dung
  → chỉ dùng làm `fallback`.
- **B. Ghép beat** (tuần 2–3, mặc định): LLM chọn nhân vật/nền trong danh sách cho phép của niche và
  xếp beat theo từng câu lời đọc.
- **C. Storyboard tự do**: không làm trong plan này.

## 5. Đa dạng giữa tài khoản (Vector DNA)

Channel YAML `creative.vector_dna`, gán tất định bằng tool (như `assign-skins.mjs`):
- `cast_pool`: bộ nhân vật chính (chibi + outfit, thú đại diện);
- `palette`: tông màu nền (ngày/hoàng hôn/đêm, mùa) + bảng màu phụ đề;
- `framing`: camera tĩnh / zoom chậm / pan; cỡ nhân vật; vị trí phụ đề;
- `pacing`: số beat mỗi cảnh, nhịp chuyển cảnh;
- `intro`/`outro`: thẻ mở đầu/kết thúc dựng bằng vector (không chữ ngoài phụ đề).

Hai tài khoản cùng nước phải khác nhau ở ≥ 3/5 trục (validator kiểm). Asset ledger: một story
template không được dùng lại trên tài khoản khác của cùng nước trong 14 ngày.

## 6. QA tự động (chặn đăng nếu trượt)

Render 7 khung/video (mốc giữa mỗi cảnh + đầu/cuối), kiểm:
1. nhân vật có trong cue/`characters_present` phải hiện (opacity > 0.5, trong khung);
2. hai người/thú không chồng > 25 % bbox;
3. đồ cầm tay: grip ↔ hand < 3 px, bbox ≥ 60 px;
4. không vật nào vượt y < −100 trong khung rig; chân chạm `ground_y` ± 12 px (trừ vật bay/bơi);
5. vùng phụ đề (y > 850) không chứa bbox của nhân vật chính quá 30 %;
6. hướng di chuyển khớp hướng mặt (`flip`) với vật di chuyển > 60 px;
7. không trùng vai trò (hai `sun`, hai `moon` trong một cảnh);
8. story không chứa asset của `VI_ONLY_ASSETS`, không cờ/logo/chữ (catalog đã đảm bảo; kiểm lại).

Trượt → quay lại bước beat với danh sách lỗi (tối đa 2 lần), rồi `fallback` chế độ A; vẫn trượt →
job lỗi, `revive.py` xử lý như engine khác.

## 7. Niche và nội dung theo nước

| Dạng | Gói dùng | de | us | kr | jp |
|---|---|---|---|---|---|
| Cổ tích & ngụ ngôn | `fables`, `*_culture` | Bremen, St. Martin, Hänsel (bản nhẹ) | Johnny Appleseed, Aesop | Hổ và quả hồng | Momotarō, Tanabata |
| Bên trong cơ thể | `body_world`, `medical` | ✔ | ✔ | ✔ | ✔ |
| Khoa học giải thích | `nature`, `space` | ✔ | ✔ | ✔ | ✔ |
| Lịch sử bằng chibi | `ancient`, `medieval`, `inventions` | Trung cổ, in ấn | Apollo, miền Tây | Cheugugi, Hangul | Edo |
| An toàn & môi trường | `safety`, `recycling`, `ocean` | phân loại rác | an toàn phòng cháy | an toàn đường phố | động đất (`bosai_zukin`) |
| Bí ẩn | `mysteries`, `ocean` | ✔ | ✔ | ✔ | ✔ |

Gói nông nghiệp Phần I (`agrochem`, nông trại Việt) **không** dùng trong engine này.
Ánh xạ niche Matrix → gói/nhân vật cho phép: `compare_studio/config/vector_niches.json` (mới).

## 8. Lộ trình

| Tuần | Việc | Xong khi |
|---|---|---|
| 0 | Spike render canvas (mục 2.3) | MP4 15 s tất định, `check` sạch |
| 1 | Module `vector.mjs` + chế độ A, 20 template, TTS, phụ đề, BGM | 4 video mẫu (de/us/kr/jp) qua QA Matrix, 60–75 s |
| 2 | Thư viện beat + builder + QA pixel | 30 video thử, ≥ 80 % qua QA lần đầu |
| 3 | Vector DNA + tool gán + đo tương đồng | cặp cùng nước qua 0.62 |
| 4 | Vào `RENDERABLE_ENGINES`, bật cho 2–3 kênh mỗi nước (Autopilot đang chạy) | 1 tuần đăng thật, so lượt xem với engine ảnh AI |

## 9. Test

- `node --test compare_studio/tests/matrix-engine-vector.test.mjs`: hợp đồng module, HTML không CDN,
  seek tất định, từ chối kênh `vi`.
- `python3 -m unittest tests.test_vector_video`: mỗi beat đúng hình học; builder không bao giờ tạo
  người chồng nhau; QA bắt được từng lỗi của mục 6 (mỗi lỗi một story hỏng cố ý).
- Test cũ của thư viện (`tests.test_remake_vector`, regression) phải qua — engine không sửa pixel
  của rig/story cũ.

## 10. Rủi ro

- **HyperFrames và canvas:** nếu seek canvas không ổn định → đường Playwright (mục 2.3).
- **Thời gian render:** canvas 1080×1920 × 30 fps × 70 s ≈ 2 100 khung; đo trong spike và dùng
  `MATRIX_RENDER_SLOTS` như các engine khác.
- **Nội dung lặp:** giới hạn template theo ledger (mục 5) và ưu tiên chế độ B.
- **Kiểu "cho trẻ nhỏ":** TikTok có thể xếp nội dung chibi vào nhóm trẻ em (hạn chế kiếm tiền).
  Lời đọc giữ tông kiến thức cho mọi lứa tuổi; xem xét bộ màu "người lớn" (§33 mục 4 của plan thư viện)
  cho niche bí ẩn/lịch sử.
