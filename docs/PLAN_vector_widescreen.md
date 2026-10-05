# Plan: khổ ngang thật 16:9 cho thư viện vector (cách B)

Cách A (đã có, `bkt_web/remake_vector_wide.py`) ghép video 9:16 vào khung 16:9: nền mờ + lớp chữ hai
bên. Cách B cho engine **vẽ thẳng** ở khổ ngang 1820×1024 (16:9, cùng chiều cao 1024 với khổ dọc
576×1024), để cảnh rộng thật: nhiều nhân vật hơn, bố cục điện ảnh, xuất 1920×1080 cho YouTube.

**Thị trường: de, us, kr, jp.** Không làm cho thị trường Việt Nam.

## 1. Hiện trạng

- `remake_vector_engine.js` dòng 3: `const W = 576, H = 1024` — mọi thứ giả định khổ dọc.
- 22 gói trong `remake_vector_packs/` viết cứng `576` ở 319 chỗ, chủ yếu trong hàm vẽ hình nền:
  `fillRect(0, 0, 576, …)`, vòng `for (x = …; x < 576; …)`, toạ độ tuyệt đối của nhà, cây, núi.
- Story đặt `x` theo khung 576. Phụ đề, camera (`auto_frame`), `hazards()` (flood, dust) và kiểm
  tra mặt đất cũng dựa trên 576.

## 2. Nguyên tắc

1. **Pixel khổ dọc không đổi.** Mọi thay đổi đều phải cho baseline `tests/data/vector_hashes.json` y hệt khi khổ là 576×1024. Đây là điều kiện cứng.
2. **Khổ là thuộc tính của story:** `story.frame = "portrait"` (mặc định, 576×1024) hoặc `"landscape"` (1820×1024). Cùng rig, catalog và nhân vật cho cả hai khổ.
3. **Không viết riêng hình nền ngang.** Hàm vẽ hình nền nhận `w`, `h` và tự trải theo bề rộng. Không có bản `*_wide` copy.
4. **Không đổi toạ độ rig.** Rig vẫn vẽ trong khung 100 đơn vị; chỉ hình nền và các lớp phủ toàn khung đổi theo khổ.

## 3. Thay đổi engine

- `Renderer(canvas, cat, story)` lấy khổ từ `story.frame` và đặt `canvas.width/height` theo đó. Biến `W`, `H` trong engine thành giá trị theo từng renderer (truyền qua `settings.frame = {w, h}` cho hình nền và qua `kit.frame()` cho pack).
- `BACKGROUNDS[preset].draw(ctx, settings, t, kit)` đọc `settings.frame.w` (mặc định 576). Thêm helper vào kit:
  - `kit.frameW(settings)`;
  - `kit.spread(n, w, margin)`: rải n vật đều theo bề rộng (cây, nhà, cột đèn);
  - `kit.tileX(w, step, fn)`: lặp hoạ tiết (sóng, cỏ, rào) tới hết bề rộng.
- Lớp phủ toàn khung (thời tiết, mưa, tuyết, sương, `hazards`, `contaminated`, camera clamp, phụ đề) dùng `W`/`H` của renderer, không dùng hằng số.
- Phụ đề khổ ngang: hộp chữ rộng tối đa 1200 px ở giữa, cách đáy 90 px, chữ to hơn (khung xem trên màn hình lớn).
- `auto_frame(story)` tính zoom theo khổ của story.
- `renderFrame(t)` của composer và `renderer_adapters/native_vector.py`: kích thước canvas lấy từ `story.frame`; ffmpeg xuất 1920×1080 (scale 1820×1024 → 1920×1080) khi khổ ngang.

## 4. Sửa 22 gói hình nền

Mỗi hàm vẽ hình nền: thay `576` bằng `w = kit.frameW(settings)`, chia làm ba loại:

| Loại | Cách sửa | Ví dụ |
|---|---|---|
| Phủ toàn khung | `fillRect(0, 0, w, …)` | trời, đất, nước |
| Hoạ tiết lặp | vòng lặp tới `w`; seed tất định theo chỉ số ô, **không** theo toạ độ, để phần 0–576 vẽ y hệt cũ | sóng, cỏ, rào, mạch đá |
| Vật đặt cố định | giữ toạ độ cũ cho phần 0–576 (để pixel dọc không đổi); khi `w > 576` thêm vật ở phần mở rộng bằng `kit.spread` với seed tất định | nhà, cây, núi, cột đèn |

**Lưu ý:** khổ ngang không phải "khổ dọc kéo giãn". Bên phải phần 0–576 phải có thêm cảnh vật hợp lý, không lặp y hệt nửa trái.

## 5. Story khổ ngang

- Hàm `to_landscape(story, layout="center"|"spread")` trong `remake_vector.py`:
  - `center`: dời mọi `x` thêm (1820 − 576)/2, cảnh cũ nằm giữa, hai bên là hình nền mở rộng;
  - `spread`: giãn khoảng cách giữa các nhân vật theo hệ số ≤ 2, giữ cỡ nhân vật; dùng cho cảnh đông người.
- Story mẫu khổ ngang (mới, không sửa story cũ): `the_cure_wide`, `quiet_street_wide`, `tortoise_and_hare_wide`, `castle_life_wide`, `solar_system_tour_wide`. Ở các story này, nhân vật và zombie đi xa hơn (≥ 400 px mỗi cảnh) để tận dụng bề rộng.
- Dàn nhân vật (`cast_actor`/`cast_pose`) và clip (`remake_vector_clips.json`) dùng chung. Clip `relative` đặt được ở mọi x trong 0–1820.

## 6. Kiểm thử

1. **Pixel khổ dọc:** `tests.test_remake_vector_regression` qua mà không cần `--update-hashes` cho khoá cũ.
2. **Baseline khổ ngang mới** (`tests/data/vector_hashes_landscape.json`): mọi hình nền × ngày/đêm × mọi thời tiết ở 1820×1024, và 5 story `*_wide`.
3. **Mọi hình nền khổ ngang:**
   - không còn dải trống;
   - mỗi cột 64 px có độ lệch màu so với cột kề không quá ngưỡng (bắt lỗi vẽ thiếu bên phải);
   - không vẽ chữ;
   - `ground_y` giữ nguyên.
4. **Phần 0–576 của khổ ngang:** với hoạ tiết lặp và trời/đất, giống khổ dọc ≥ 98 % pixel ở hình nền không có vật cố định mới (đo trên 10 hình nền chọn sẵn).
5. **Phụ đề khổ ngang:** nằm trong 1200 px giữa, không tràn.
6. **`to_landscape`:**
   - `center` giữ nguyên khoảng cách giữa các nhân vật;
   - `spread` không làm nhân vật chồng nhau;
   - các action có hook tự dời vị trí (`haul`, `shamble`, `ride`) vẫn đúng.
7. **Xuất video:** `renderFrame` tất định; ffmpeg xuất 1920×1080.

## 7. Lộ trình (giao Gemini theo nhóm, mỗi nhóm một lần chạy và review)

| Nhóm | Việc | Xong khi |
|---|---|---|
| B1 | Engine (`frame`, `W/H` theo renderer, kit helpers, lớp phủ, phụ đề, composer, adapter) + `to_landscape` | pixel dọc y hệt; 1 hình nền core vẽ ngang đúng |
| B2 | Hình nền core (`remake_vector_engine.js`) + `farm_fun`, `buildings`, `modular_scenes` | test 3–4 qua cho các hình nền này |
| B3 | [x] Gói văn hoá và lịch sử (`ancient`, `medieval`, `inventions`, `de/jp/kr/us_culture`) — 30 hình nền, test 3–4 qua, baseline 51 hình nền ngang | xong |
| B4 | [x] Gói khoa học, sinh tồn, đại dương, cơ thể (`nature`, `space`, `ocean`, `mysteries`, `wasteland`, `body_world`, `medical`, `recycling`; `fables`, `safety` không có hình nền) — 41 hình nền, baseline 92 hình nền ngang | xong |
| B5 | [x] 5 story `*_wide` (`bkt_web/remake_vector_wide_stories.py`), baseline ngang (`stories`), xuất MP4 thử 1920×1080 | xong |
