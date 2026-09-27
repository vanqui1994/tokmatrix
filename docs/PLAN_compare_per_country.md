# Plan: mọi thể loại video khác nhau theo nước và theo acc

Ngày lập: 26/09/2026. Trạng thái: **đã duyệt 27/09** (chấp nhận cả 4 đề xuất ở mục 5). Bước 1–3 đã làm, chờ duyệt khung hình newspaper trước khi làm bước 4.

**Triển khai (27/09):** dựng trên hệ variant V2 có sẵn (`docs/MATRIX_VARIANT_SYSTEM_V2.md`), không làm `skins.mjs` song song:
- Bộ da = `creative.skins.<engine> = { variant_id, dna }` trong YAML kênh, mỗi engine một bộ; engine chưa có bộ da vẫn chạy legacy.
- Các chiều: `composition` (3 layout) · `caption` (trên/đè/dưới ảnh, trục DNA mới, `DNA_VERSION` 2) · `tone` (9 sắc độ) · `typography` · `treatment` (khung/lớp phủ) · `image_motion` · `transition`.
- Luật: 2 acc cùng nước + cùng engine khác ≥ 4 chiều, trong đó có layout (composition/caption) hoặc màu (tone). Chỉ composition × tone (3 × 9 = 27) không đủ cho 54 acc newspaper DE, nên vị trí lời đọc được tính là layout.
- Gán: `node compare_studio/tools/assign-skins.mjs --variant newspaper/front-page [--apply]` (tham lam, tất định, giữ bộ da cũ, tăng `config_version`). 80 kênh newspaper (DE 54, EN 20, VI 6) đã có bộ da; mọi cặp cùng nước khác ≥ 4 chiều.
- Lớp 1 (theme nước) trong `kit/theme.mjs`: font tiêu đề + hoa văn nền theo nước. Linh vật cho các engine khác làm ở bước 4–5.
- Xem trước bộ da thật: `node tools/preview-variants.mjs --out <dir> --engine newspaper --channels <ids|de:4>` rồi `python3 tools/variant_contact_sheet.py --manifest <dir>/manifest.json --out sheet.png --positions 0.2,0.45,0.8`.

## 1. Vì sao

TikTok đánh trùng theo **layout** (khuôn hình), không theo nội dung. Ngày 26/09, 5 acc Anh bị báo trùng, dù khác chủ đề và khác cả thể loại. Compare ít bị hơn vì mỗi nước có bảng màu và linh vật riêng.

Hiện trạng (đếm từ `config/channels/*.yaml` và code render):

| Mục | Hiện nay |
|---|---|
| Bảng màu | 237 kênh chỉ có **4 bảng màu** |
| Kiểu hình (`visual_style_id`) | 2 kiểu: `dark_mystery_v1` cho 223 kênh, `cosmic_space_v1` cho 14 kênh |
| Giọng đọc | Mỗi ngôn ngữ gần như 1 giọng: Conrad cho 123 acc Đức, Andrew cho 60 acc Anh |
| Theme theo nước (`tools/themes`: bảng màu + linh vật Otto/Barnaby/Hachi/Horangi) | Chỉ **compare** và **vox** dùng |
| newspaper, mystery, folklore, kinetic | Chỉ đổi **chữ** theo ngôn ngữ (`*_LANG_META`), layout giống hệt |
| science, kinetic | Lấy 1–2 màu từ `creative.palette`, mà palette thì gần như chung |
| tierlist, survival, chalk, wildlife | Không có gì theo nước hay theo acc |
| Độ giống khung hình (đo vân tay) | science 100%, compare 83%, tierlist 69%, newspaper 54%, chalk 33%, wildlife 22%, mystery 8%, vox/folklore 0% |

**Chỉ khác theo nước là chưa đủ**, vì các acc bị đánh trùng đều cùng nước (Anh). DE có 125 acc, GB có 60 acc: trong mỗi nước, các acc cũng phải khác nhau.

## 2. Thiết kế: 2 lớp khác biệt

### Lớp 1: bộ nhận diện theo nước (áp cho cả 11 thể loại)

Mở rộng `tools/themes/index.mjs` thành bộ nhận diện dùng chung cho mọi engine:

| Nước | Linh vật | Màu gốc | Hoa văn | Font |
|---|---|---|---|---|
| DE | Dachshund Otto | Bauhaus: slate + vàng hổ phách | lưới Bauhaus, hình khối | DIN/Grotesk |
| GB/EN | Cú Barnaby | Oxford navy + vàng | kẻ ô tartan nhẹ, tem thư | serif báo Anh |
| JP | Shiba Hachi | đỏ torii + mực sumi + matcha | sóng seigaiha, giấy washi | Noto Sans/Serif JP |
| KR | Hổ Horangi | celadon + navy + coral | hoa văn hanbok, dancheong | Noto Sans KR |

- Mỗi engine đọc theme của nước: màu, font, hoa văn nền, khung, và linh vật ở những engine có chỗ cho người dẫn (kinetic, science, tierlist, survival, chalk). Ảnh AI vẫn là nội dung chính.
- Chữ giao diện theo ngôn ngữ thì đã có sẵn, chỉ gom về một chỗ.

### Lớp 2: "bộ da" riêng cho từng acc (quan trọng nhất)

Mỗi acc có một `creative.skin` **cố định**, sinh một lần từ `matrix_channel_id` và lưu trong YAML của kênh. Bộ da tổ hợp từ các chiều sau:

| Chiều | Số lựa chọn | Ví dụ |
|---|---|---|
| Biến thể layout của engine | 3 mỗi engine (dựng tay) | newspaper: tiêu đề báo trên / tiêu đề dọc bên trái / dạng tạp chí; vox: ảnh tràn màn / ảnh trong thẻ / chia đôi; kinetic: chữ giữa / chữ dưới + số liệu trên / chữ nghiêng |
| Biến thể màu trong họ màu của nước | 6 | xoay sắc độ, sáng/tối, đổi màu nhấn |
| Cặp font | 3 mỗi hệ chữ | |
| Khung và lớp phủ | 4 | viền mỏng / viền dày / hạt phim / giấy |
| Kiểu chuyển cảnh | 3 | cắt / trượt / zoom |
| Vị trí phụ đề | 3 | trên / giữa / dưới |
| Linh vật (nếu có) | 4 | màu lông / phụ kiện / tư thế |
| Giọng đọc | mọi giọng của ngôn ngữ | chia đều, không để 1 giọng chiếm hết |
| Họ nhạc nền | theo kho nhạc | mỗi acc 1 họ riêng (chờ kho nhạc CC0) |

- Tổng số tổ hợp là hàng nghìn, trong khi DE chỉ cần 125.
- Gán bằng thuật toán tham lam: acc mới nhận bộ da **khác nhiều chiều nhất** so với mọi acc cùng nước. Mục tiêu là 2 acc bất kỳ cùng nước khác nhau ở ≥ 4 chiều, trong đó có biến thể layout hoặc màu.
- Đổi YAML thì phải tăng `config_version`, nếu không batch-matrix từ chối chạy.

### Mỗi acc 1–2 thể loại

Đây là quyết định cũ. Bộ da được sinh cho đúng các thể loại mà acc đó dùng.

## 3. Đo để biết đã đủ khác chưa

- Dùng `bkt_web/video_fingerprint.py` (đã có): render mẫu 1 video cho mỗi bộ da, rồi so từng cặp acc.
- **Ngưỡng đạt:** 2 acc bất kỳ có < 30% khung giống nhau. Đây là ngưỡng `dup_frames_threshold`: cặp bị TikTok đánh trùng có 69–100%, cặp không bị có 0–8%.
- Sau khi đạt thì bật `dup_check_mode=block`, để video nào vẫn giống quá ngưỡng sẽ tự bị hoãn.

## 4. Các bước làm

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Khung chung: `tools/themes` mở rộng (font, hoa văn, khung) + module `skins.mjs` (định nghĩa các chiều, sinh bộ da, gán tham lam) + ghi `creative.skin` vào 202 YAML | Có test: không 2 acc cùng nước trùng bộ da; tất định |
| 2 | **newspaper** (đang đăng, giống 54%) → 3 layout + theme nước + bộ da | Làm mẫu trước, đo vân tay |
| 3 | Duyệt mẫu: mình gửi bạn ảnh khung hình của khoảng 8 bộ da newspaper | Bạn duyệt rồi mới làm tiếp |
| 4 | **kinetic, science, tierlist** (đang bị chặn) → 3 layout mỗi thể loại + bộ da | Xong và đo đạt thì mở lại `publish_block_engines` |
| 5 | **compare, chalk, wildlife, survival** | compare đã có theme nước, chỉ cần thêm layout; survival đang lỗi HyperFrames mới, sửa luôn |
| 6 | **mystery, vox, folklore** (giống 0–8%) | Chỉ thêm theme nước + màu/font; ít việc |
| 7 | Chia lại giọng đọc: mỗi ngôn ngữ dùng hết các giọng có sẵn | tiếng Đức ~8 giọng Neural, tiếng Anh ~15 |
| 8 | Render thử 1 video/bộ da trên VPS → đo từng cặp → sửa bộ da nào vượt ngưỡng | Cần bật lại render |
| 9 | Bật `dup_check_mode=block`, mở đăng dần: 3 acc → 20 acc → toàn bộ | Hỏi bot `@tiktok_check_video_bot` sau mỗi đợt |

Thứ tự ưu tiên là theo mức giống nhau (cao trước) và theo thể loại đang bị chặn. Bước 1–3 làm trên máy, không cần render trên VPS.

## 5. Cần bạn quyết

1. **Đồng ý 2 lớp** (nước + bộ da riêng từng acc)? Hay bạn chỉ muốn khác theo nước?
2. **Số biến thể layout mỗi thể loại:** mình đề xuất 3. Nhiều hơn thì đẹp và khác hơn, nhưng tốn công dựng.
3. **Linh vật trong các thể loại khác:** thêm vào kinetic/science/tierlist/survival/chalk như compare? Mystery/vox/folklore/newspaper đề xuất không thêm, vì hỏng không khí.
4. **Làm mẫu newspaper trước** (bước 2–3) để bạn duyệt, rồi mới làm hàng loạt?
