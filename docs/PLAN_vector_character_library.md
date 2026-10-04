# Plan: tách 79 story mẫu thành thư viện nhân vật riêng lẻ

Mục tiêu: biến 79 story mẫu (`remake_vector.sample_stories()`) thành **thư viện nhân vật**. Mỗi nhân
vật là một thực thể độc lập: rig, trang phục, đạo cụ riêng, và **các đoạn diễn (clip)** tách từ story,
dùng lại được. Thư viện này là nguyên liệu cho engine video vector
(`docs/PLAN_vector_video_engine.md`): builder ghép nhân vật + clip thay vì dựng pose từ đầu.

**Thị trường: de, us, kr, jp.** Không làm cho thị trường Việt Nam. Các story nông trại Phần I
**vẫn được tách và dùng**, sau khi **trung tính hoá** những dấu hiệu Việt: nón lá, trâu, chợ quê
(mục 6.1). Bản gốc mang dấu hiệu Việt chỉ lưu trữ, không cấp cho engine video.

## 1. Hiện trạng (đo ngày 29/09/2026)

| Chỉ số | Toàn bộ 79 story | Phần II J–U (45 story, `recycling_sort` → `fox_and_grapes`) |
|---|---|---|
| Nhân vật khai báo | 390 | 213 |
| Rig khác nhau | 252 | — |
| Rig "diễn viên" (chibi/người/thú/tế bào/vi khuẩn/cơ quan) | — | 27 |
| Diễn viên trung bình mỗi story | — | 1,8 |
| Đạo cụ gắn tay (`attach_to`) | 54 | 29 |

- **Ba rig chibi gánh gần hết vai:** `chibi_boy` 20 story, `chibi_kid` 15, `chibi_girl` 11, `chibi_teacher` 5.
- **Vai thật = rig + trang phục:** `chibi_boy` mặc 18 bộ khác nhau (phi hành gia, cao bồi, hiệp sĩ, học sinh Nhật, hanbok, thợ in…). `chibi_kid` mặc 10 bộ, `chibi_girl` 9, `chibi_teacher` 4.
- **Hành động hay dùng nhất:** `emote` (64 lần), `grow`, `grip`, `ride`, `pick`, `sort`, `carry_together`, `haul`, `bow`…
- **Ngoài diễn viên:** phần còn lại là đạo cụ và bối cảnh, gồm đồ vật, đồ chứa, xe, đồ nội thất và nhà cửa.

⇒ Một "nhân vật" trong thư viện **không** phải là một rig mà là **rig + trang phục + đạo cụ + vai**
(vd "phi hành gia" = `chibi_boy` + `astronaut`). Thư viện dự kiến ~70–90 nhân vật từ 27 rig diễn viên.

## 2. Mô hình dữ liệu

### 2.1 Nhân vật — `bkt_web/static/remake_vector_characters.json`
```json
{
  "astronaut_boy": {
    "label": "Phi hành gia nhí",
    "rig": "chibi_boy",
    "outfit": "astronaut",
    "role": "hero",
    "height": 200,
    "props": ["moon_footprint", "seismometer"],
    "markets": ["de", "us", "kr", "jp"],
    "locale": "neutral",
    "topics": ["space", "science", "us_culture"],
    "source_stories": ["apollo_11"],
    "clips": ["astronaut_boy/walk_to_rocket", "astronaut_boy/moon_hop"],
    "expressions": ["happy", "surprised"],
    "voice_role": "child"
  }
}
```
- `role`: `hero` (nhân vật chính) | `sidekick` | `animal` | `crowd` | `prop_actor` (đồ vật có mặt: nấm, mây, giọt nước…) | `set` (nhà/xe, không đọc thoại).
- `markets`: nước được dùng; mặc định cả 4 nước, trừ nhân vật văn hoá (hanbok → `kr` + tuỳ chọn khác, xem mục 5).
- `locale`: `neutral` | `de` | `us` | `kr` | `jp` | `vi` (`vi` = chỉ lưu trữ, không cấp cho engine video).
- `height`: cỡ chuẩn trong story (px khung 1080 thu về 576) để clip không phải đoán cỡ.
- `voice_role`: gợi ý chọn giọng TTS (child/adult/elder/narrator/none).

### 2.2 Clip — `bkt_web/static/remake_vector_clips.json`
Một clip là **đoạn diễn của MỘT nhân vật** cắt từ một cảnh, chuẩn hoá để ghép lại:
```json
{
  "astronaut_boy/moon_hop": {
    "character": "astronaut_boy",
    "kind": "locomotion",
    "duration": 2.1,
    "space": "relative",
    "keyframes": [ {"t": 0, "dx": 0, "dy": 0, "hand_r_x": 24}, {"t": 0.6, "dx": -60, "dy": -70}, ... ],
    "actions": [ {"type": "emote", "t0": 0.3, "t1": 1.5, "emote": "idea"} ],
    "needs": { "background_theme": ["moon"], "partners": [], "props": [] },
    "travel_px": 210,
    "facing": "left",
    "loopable": false,
    "source": {"story": "apollo_11", "scene": 1, "t0": 7.9, "t1": 10.0}
  }
}
```
- `space`: `relative` (dx/dy tính từ điểm bắt đầu, đặt vào vị trí bất kỳ) hoặc `anchored` (bám vào vật khác: cưỡi ngựa, cầm đồ, hái quả).
- `kind`:
  - `idle`: đứng, thở, chớp mắt;
  - `locomotion`: đi, chạy, nhảy, bơi, bay;
  - `gesture`: vẫy, chỉ, cúi chào;
  - `emote`: cảm xúc;
  - `hold`: cầm, đưa, nhận đồ;
  - `interact`: đòn bẩy, ròng rọc, gõ đe, khắc bí;
  - `ride`: cưỡi, lái;
  - `group`: `carry_together`, `haul`, `tug`; đây là clip nhiều vai, lưu dưới nhân vật dẫn và ghi các vai kèm trong `partners`.
- `needs`: điều kiện ghép: bối cảnh (theme, `ground_y`), vật cần có, bạn diễn.
- `travel_px`, `facing`: cho builder xếp chỗ đứng, kiểm hướng đi khớp hướng mặt (lỗi "bơi lùi").
- **Không có `opacity`/`outfit` "giữ sang keyframe sau":** clip luôn ghi đủ giá trị ở keyframe đầu và cuối (bài học phase S).

### 2.3 Liên kết ngược
Mỗi story mẫu được viết lại dưới dạng **tham chiếu** `{character, clip, at: {x, y, t}}`. Công cụ `compose` dựng lại story đầy đủ từ tham chiếu. Đây là bài kiểm tra quan trọng nhất của việc tách (mục 7).

## 3. Công cụ tách — `bkt_web/vector_characters/`

| File | Việc |
|---|---|
| `extract.py` | Duyệt 79 story → gom (rig, outfit, đạo cụ gắn tay) thành ứng viên nhân vật; cắt track pose/action của từng nhân vật theo cảnh thành clip; chuẩn hoá về toạ độ tương đối; nhận diện `kind` theo dữ liệu (dịch chuyển > 60 px → locomotion; action → loại action; còn lại → idle/gesture). |
| `dedupe.py` | Gộp clip gần giống nhau (cùng kind, hình dạng quỹ đạo lệch < 12 px sau chuẩn hoá, thời lượng lệch < 15 %) → giữ một bản, ghi mọi `source`. |
| `naming.py` | Đặt id/label nhân vật: tự sinh từ outfit + rig (`astronaut_boy`), sau đó chủ repo duyệt bảng tên (mục 8). |
| `compose.py` | Tham chiếu → story đầy đủ; đặt clip `relative` vào vị trí, clip `anchored` vào anchor vật đích (dùng lại `held_pose`, `ride`, `tree_pick_events`). |
| `cli.py` | `python3 -m bkt_web.vector_characters extract|dedupe|compose|sheet|report` |

Quy tắc tách:
- Nhân vật gắn tay (`attach_to`) không thành nhân vật riêng. Nó là **đạo cụ của nhân vật** chủ, kèm `held_pose` và cỡ pixel đo được, trừ khi nó cũng xuất hiện độc lập ở story khác.
- Đồ vật và nhà cửa (`role: set`) được liệt kê nhưng không tách clip, trừ khi có trạng thái động (cầu treo `open`, núi lửa `erupt`, san hô `bleached`, mây `rain`). Khi đó chúng có clip `state` (trường số theo thời gian).
- Action do hook tự dời vị trí (`haul`, `carry_together`, `ride`) được lưu **nguyên action**, không nướng thành keyframe. Nếu nướng thành keyframe, engine sẽ dời thêm lần nữa (lỗi moai ở phase U).
- Không sinh nhân vật mới hay trang phục mới. Mọi nhân vật đều đến từ story đã review.

## 4. Sheet nhân vật (duyệt bằng mắt)

`python3 -m bkt_web.vector_characters sheet --out <dir>` xuất cho mỗi nhân vật một ảnh gồm:
- dáng đứng ở 3 cỡ;
- 4 biểu cảm;
- mỗi clip 4 khung (0/33/66/100 %);
- đạo cụ trong tay, kèm cỡ pixel đo được.

Trang thư viện (`remake_vector_library.html`) thêm tab **Nhân vật**:
- lọc theo nước, vai, chủ đề;
- phát thử từng clip trên một hình nền tuỳ chọn;
- nút "ghép thử 2 nhân vật" để kiểm clip `talk` và clip `group`.

## 5. Nhân vật theo nước

| Nhóm | de | us | kr | jp |
|---|---|---|---|---|
| Trung tính (mọi nước) | học sinh, nhà khoa học, phi hành gia, thợ lặn, nhà cổ sinh, tế bào/vi khuẩn/cơ quan, thú rừng/biển, ngụ ngôn | ✔ | ✔ | ✔ |
| Văn hoá riêng | dirndl/lederhosen, St. Martin, Bremen | cao bồi, nông dân yếm bò, Halloween | hanbok, học giả Joseon | yukata, đồng phục Nhật, `bosai_zukin` |
| Lịch sử (mọi nước) | Ai Cập, Hy Lạp, La Mã, trung cổ, Viking, thợ in 1450, nhà phát minh 1900 | ✔ | ✔ | ✔ |

- **Nhân vật văn hoá:** mặc định chỉ cấp cho nước của nó.
- **Dùng chéo nước:** theo §33 mục 5 của plan thư viện (ví dụ Momotarō có bản de/us), chủ repo bật từng nhân vật trong bảng duyệt.
- **Loại khỏi thư viện dùng cho engine:** mọi biến thể còn nón lá (`chibi_farmer` gốc, `farmer_woman` và `fisherman` khi `hat` là `conical`) và mọi nhân vật `locale: vi`. Thay bằng các biến thể trung tính ở mục 6.1.

## 6. Phân loại 79 story

| Nhóm | Story | Xử lý |
|---|---|---|
| Phần II J–U | 45 story (`recycling_sort` → `fox_and_grapes`) | tách đầy đủ, cấp cho engine |
| Cơ thể và y tế (Phần I) | `handwashing`, `doctor_visit`, `tooth_care`, `nutrition_fitness`, 7 story `body_world` | tách đầy đủ, cấp cho engine (bối cảnh trung tính) |
| **Nông trại (Phần I)** | `watermelon`, `pepper`, `apple`, `peanut`, `tomato`, `farm-sow-grow`, `farm-harvest`, `farm-papaya-latex`, `farm-life`, `farm-animals`, `orchard_harvest`, `trellis_cucumber`, `highland_temperate`, `vegetable_cutaway`, `safe_spraying`, `giant_radish`, `fishing`, `sea-monsters` | tách đầy đủ, **trung tính hoá** (6.1), cấp cho engine |
| Demo kỹ thuật | `articulated-hand-tool`, `articulated-hand-poses`, `articulated-branch`, `farmer-ik-reach`, `farmer-ik-carry` | chỉ tách clip kỹ thuật (tay, IK) cho builder; không thành nhân vật |

### 6.1 Trung tính hoá nông trại cho de/us/kr/jp

Dấu hiệu Việt tìm thấy trong các story nông trại:

| Dấu hiệu | Ở đâu | Cách xử lý |
|---|---|---|
| Nón lá | rig người lớn `farmer_woman`, `fisherman` (vẽ cố định trong `drawPerson`, `hatted`); `chibi_farmer` (`accessory: conical_hat` trong `chibi.js`) | Thêm trường style mới `hat`: `conical` (mặc định, pixel cũ giữ y nguyên, như `longship.oars`), `straw` (mũ rơm vành tròn kiểu phương Tây), `cap` (mũ lưỡi trai), `none` (tóc). Nhân vật cấp cho engine dùng `straw`/`cap`/`none`. `chibi_farmer` dùng outfit `farmer_overalls` (mũ rơm) như phase S. |
| Trâu `buffalo` | `farm-life` | Đổi sang `cow` trong bản trung tính của story; `buffalo` chỉ còn ở bản lưu trữ. |
| Chợ quê `village_market` | `giant_radish` | Bản trung tính dùng `farmyard_barn` (đã có trong story) hoặc `allotment_garden` (de); kiểm lại các hình nền còn lại (`garden`, `orchard`, `fruit_orchard`, `vegetable_rows`, `farm_warehouse`, `greenhouse`, `highland_farm`, `river`…) trên contact sheet và gắn `locale` từng cái. |
| Trái cây nhiệt đới (sầu riêng, chôm chôm, măng cụt, đu đủ…) | `farm-papaya-latex`, `orchard_harvest` | Giữ lại (không phải dấu hiệu quốc gia), gắn `topics: tropical_fruit`. Builder chỉ chọn khi chủ đề nói tới trái cây nhiệt đới. |
| Lời thoại tiếng Việt, chữ tiếng Việt trong cue | mọi story Phần I | Clip không mang lời thoại. Tệp nhân vật chỉ giữ `label` bốn thứ tiếng (de/en/ko/ja). |
| Thuốc BVTV (`safe_spraying`, `agrochem`) | `safe_spraying` | Giữ vì là giáo dục an toàn (GHS, không thương hiệu). Chỉ cấp cho niche nông nghiệp/an toàn, không cho niche trẻ em. |

Kết quả: nhóm nhân vật nông trại trung tính gồm nông dân nam/nữ (người lớn và chibi, mũ rơm hoặc
mũ lưỡi trai), ngư dân (mũ lưỡi trai), gia súc và gia cầm (bò, dê, lợn, gà, vịt, thỏ), côn trùng (ong,
bướm, kiến, giun), cây trồng có mặt, và các clip nông trại: gieo hạt, tưới, bón phân, hái, rung cây,
nhổ củ, cắt lát, câu cá, kéo củ cải (`tug`).

## 7. Kiểm thử — `tests/test_vector_characters.py`

1. **Round-trip pixel:** với mỗi story Phần II, `compose(extract(story))` phải cho hash khung giống hệt baseline trong `tests/data/vector_hashes.json`. Nếu tách mất thông tin, test này bắt được.
2. Mọi nhân vật trỏ tới rig, outfit và đạo cụ có thật trong catalog. `markets` không chứa `vi`, và nhân vật `locale: vi` không lọt vào tệp cấp cho engine.
2b. Không nhân vật nào cấp cho engine còn nón lá: render dáng đứng, so với mẫu nón lá (`hat: conical`) bằng mask vùng đầu; `hat` mặc định vẫn cho pixel y hệt baseline cũ của `farmer_woman`, `fisherman`, `chibi_farmer`.
3. Clip `relative` đặt ở 3 vị trí khác nhau vẫn giữ chân chạm `ground_y` ± 12 px (trừ clip bay hoặc bơi).
4. Clip `hold`: grip ↔ hand < 3 px suốt clip; cỡ đạo cụ ≥ 60 px ở `height` chuẩn.
5. Clip `locomotion`: hướng mặt khớp hướng đi.
6. `dedupe` giữ lại mọi `source`: không story nào mất tham chiếu.
7. Tệp JSON tất định: chạy `extract` hai lần cho byte giống nhau.
8. Test cũ phải qua hết (`tests.test_remake_vector`, `tests.test_remake_vector_regression`). Việc tách không sửa rig, story hay pixel nào.

## 8. Việc chủ repo duyệt

- Bảng tên nhân vật (id + label bốn thứ tiếng de/en/ko/ja) và vai.
- Nhân vật văn hoá nào được dùng chéo nước.
- Danh sách clip trùng mà `dedupe` gộp. Duyệt bằng sheet ở mục 4, mỗi nhóm một dòng.

## 9. Lộ trình

| Bước | Việc | Xong khi |
|---|---|---|
| 1 (2 ngày) | `extract` + `compose` cho 45 story Phần II, round-trip pixel | test 1 qua 45/45 |
| 2 (1 ngày) | `dedupe`, `naming`, gắn `markets`/`locale`, loại nhân vật Việt | báo cáo: số nhân vật, số clip/kind, số clip gộp |
| 3 (1 ngày) | sheet nhân vật + tab Nhân vật trên trang thư viện | chủ repo duyệt bảng tên (mục 8) |
| 4 (2 ngày) | tách 11 story y tế/cơ thể + 18 story nông trại; trường `hat` (conical/straw/cap/none) cho `farmer_woman`, `fisherman`; bản trung tính của `farm-life` (bò thay trâu) và `giant_radish` (bỏ chợ quê); gắn `locale` cho hình nền nông trại | test 2–7 và 2b qua; pixel cũ không đổi |
| 5 | engine video dùng thư viện: beat `use_clip(character, clip, at)` thay dựng pose tay | builder của `PLAN_vector_video_engine.md` §3 gọi được clip |

## 10. Rủi ro

- **Clip gắn chặt bối cảnh gốc:** ví dụ tay hái đúng quả ở một cây nhất định. Những clip này là `anchored` và ghi rõ `needs`; builder chỉ dùng khi có vật đích cùng loại, còn không thì quay về beat tính hình học.
- **Hook tự sinh chuyển động** (`haul`, `tug`, `ride`): lưu action chứ không lưu keyframe, nếu không sẽ bị dời hai lần.
- **Ít đa dạng:** 3 rig chibi đóng gần hết vai, nên trong một nước sẽ có nhiều nhân vật trông giống nhau. Vector DNA của engine video (bảng màu, trang phục, bộ nhân vật theo tài khoản) phải chọn bộ nhân vật khác nhau giữa các tài khoản cùng nước.
