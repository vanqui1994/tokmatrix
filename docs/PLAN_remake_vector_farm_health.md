# Kế hoạch mở rộng thư viện vector Remake (đợt 2): nông nghiệp vui nhộn, hình nền, chibi giáo dục – y tế

Cập nhật: 2026-09-25. Người thực hiện: agent code. Người duyệt: chủ repo.

Đây là **đặc tả để làm**. Làm đúng thứ tự giai đoạn. Mỗi giai đoạn phải qua hết mục §14 "Kiểm tra" và có **bảng hình soi bằng mắt** gửi chủ repo duyệt, rồi mới sang giai đoạn sau. Không deploy lên VPS, chủ repo tự deploy.

Hợp đồng kỹ thuật của đợt 1 (`docs/PLAN_remake_vector_expansion.md` §1) **vẫn áp dụng nguyên**: hộp 100 đơn vị, gốc ở đáy-giữa, y âm là đi lên; anchor bắt buộc; tất định; bộ hàm vẽ có sẵn; `face()`. Tài liệu này chỉ ghi phần **mới hoặc khác**.

---

## 0. Hiện trạng (sau đợt 1, engine `1.11.0`)

- **110 rig, 32 động tác, 9 hình nền:** `garden`, `orchard`, `balcony`, `pepper_patch`, `soil_cutaway`, `pond`, `river`, `sea`, `underwater`.
- **Dispatch:** mọi rig đi qua `RIG_DRAWERS`. Phần vẽ riêng từng asset nằm trong các bảng:
  - `FRUIT_BODIES` (thân trái cây) và `FRUIT_SEEDS` (ruột khi bổ đôi);
  - `FARM_PLANTS` (cây, hoa);
  - `TOOL_DRAWERS`, `PROP_DRAWERS`;
  - `QUADRUPED_SPECS` qua `drawQuadruped`, chim qua `drawBird`.

  Hàm nhóm (`drawFruit`, `drawPlant`, `drawTool`, `drawProp`) giữ phần chung: tay chân, co giãn, bổ đôi, rễ, hatch.
- **Người:** `farmer`, `farmer_woman`, `fisherman` (tỉ lệ người thật, IK tay qua `hand_l_x/y`, `hand_r_x/y`), `hand`, `hand_right`, `foot`.
- **Hình nền:** một hàm `background()` dài với chuỗi `if (preset === …)`. Mặt đất nằm cứng ở y≈810, trừ nước (760) và soil_cutaway (480).
- **Cây ăn quả:** mới có `papaya_tree` và `banana_tree`. Chưa có cây cho từng loại quả, chưa có cây leo giàn, trái cây xứ lạnh, rau củ dạng củ/bông, phân bón, hoá chất.
- **Engine** là một file `remake_vector_engine.js` khoảng 3300 dòng. Đợt này sẽ thêm khoảng 130 rig, file sẽ vượt 7000 dòng nếu để nguyên, nên Giai đoạn A tách thành các gói.

---

## 1. Bài học đợt 1 (bắt buộc tránh)

| Lỗi đã gặp | Quy tắc |
|---|---|
| Tay/chân trái cây hở khỏi thân (nho, chuối, xoài) | Thân lệch tâm thì khai `hipX`/`armX`. Soi ở growth 0.2, 0.5 và 1. |
| Cánh gà con vẽ ở y −58, nhìn thành "cái mũ" | Chi tiết mặc định của template phải được **ghi đè** trong spec khi thân nhỏ. |
| Con vật cúi ăn cỏ: đầu xoay ngược, cỏ nằm dưới ngực | Mọi động tác chạm phải có test đo khoảng cách anchor ↔ đích (<12 px). |
| Chim sẻ chân dài, luôn đập cánh | Trạng thái mặc định là **đứng yên tự nhiên**; hiệu ứng chỉ bật khi động tác chạy. |
| Mặt hoa che nụ | Mặt co theo `growth`/kích thước phần nhìn thấy. |
| Nhánh `if (s.asset === …)` rải rác | **Cấm** thêm nhánh `if (s.asset …)`. Rig mới là **một mục** trong bảng đăng ký (§2.2). |
| Sửa rig cũ làm lệch pixel ngoài ý muốn | Rig cũ phải giống từng pixel, trừ những rig được ghi tên và duyệt trong báo cáo giai đoạn (§14 mục 3). |

---

## 2. Giai đoạn A — hạ tầng (không đổi hình nào)

### 2.1 Tách engine thành gói

- `remake_vector_engine.js` giữ lõi: toán, `sample`, `drawActor`, `face()`, hiệu ứng chung, bộ hàm vẽ và các rig hiện có.
- Mỗi gói mới là một file `bkt_web/static/remake_vector_packs/<pack>.js`. File chỉ gọi `RemakeVector.register({ rigs, backgrounds, effects, actionHooks })`, không đụng biến nội bộ khác.
- Lõi xuất ra API đăng ký và bộ hàm vẽ qua `RemakeVector.kit`: `INK`, `tone`, `volume`, `cylinder`, `limb`, `mitten`, `leaf`, `blade`, `ellipse`, `path`, `line`, `withCut`, `mixColor`, `hash`, `clamp`, `smooth`, `FRUIT_BODIES`.
- Catalog có thêm trường `engine_packs: ["farm_trees", …]` theo đúng thứ tự nạp. **Mọi nơi nạp engine phải nạp đủ các gói theo thứ tự này:** trang thư viện, composer (nhúng inline để render offline), `vector_library_template.html` và các test Node/Playwright. Viết một hàm Python `remake_vector.engine_sources()` trả về danh sách file để composer và test dùng chung, không ai tự liệt kê.
- **Kiểm tra A1:** so pixel 110 rig, 32 động tác và các story ví dụ với bản trước khi tách. Phải khác 0 pixel.

### 2.2 Bảng đăng ký rig

`register({ rigs: { id: { group, draw, spec } } })`.
- `draw(ctx, s, t, cat, kit)` là hàm vẽ **thân riêng**. Hàm nhóm vẫn lo phần chung.
- Nhóm `fruit` và `vegetable` (§6) dùng lại `drawFruit`. Rig mới chỉ đưa thân vào `FRUIT_BODIES` và cấu hình tay chân vào bảng `FRUIT_LIMBS`. Bảng `spec` đang viết cứng trong `drawFruit` phải chuyển ra `FRUIT_LIMBS` ở Giai đoạn A.

### 2.3 Hình nền thành bảng `BACKGROUNDS`

- `BACKGROUNDS[preset] = { label, theme, ground_y, draw(ctx, settings, t, kit) }`. Chuyển 9 hình hiện có vào bảng, pixel phải giống hệt.
- **Không đổi kiểu dữ liệu** của `catalog.backgrounds`: nó vẫn là list id, vì validator và các story cũ đang dùng. Thêm `catalog.background_specs = { id: { label, theme, ground_y, weather: [...] } }`.
- `theme` thuộc một trong: `farm`, `garden`, `water`, `highland`, `market`, `home`, `school`, `clinic`, `body`, `lab`.
- `ground_y` để storyboard biết chỗ đặt chân. Validator cảnh báo (không chặn) khi rig nhóm `human`/`chibi`/`animal` đứng cách `ground_y` quá 40 px mà không có `attach_to`.
- **Lớp nền:** `sky` → `far` → `mid` → `ground` → `decor`. Chỉ `decor` được chuyển động nhẹ theo `t` (lá rung, sương trôi, quạt trần quay), không có vòng lặp tự chạy.
- **Cấm chữ viết trong hình nền:** dùng biểu tượng, không dùng chữ. Bảng lớp học vẽ nét phấn, hình cây, dấu +, không có chữ.
- **Biểu tượng y tế:** **không dùng chữ thập đỏ trên nền trắng** (biểu tượng Hội Chữ thập đỏ được luật bảo hộ). Dùng dấu cộng xanh lá/xanh dương, trái tim, hoặc ống nghe.

### 2.4 Thời tiết và mùa (mở rộng `settings`)

- `weather`: thêm `snow`, `wind`, `fog`, `storm` (mưa + chớp theo `t`, tất định), `hot` (sóng nhiệt).
- Thêm state chung `s.wind` (0–1). Khi `weather: wind`, engine tự đặt state này từ settings. Cây, hoa, lá và tóc chibi nghiêng theo nó.
- `season`: `spring` | `summer` | `autumn` | `winter`. Chỉ ảnh hưởng tán cây ăn quả ở §3: xuân có hoa, thu lá vàng, đông trụi lá hoặc phủ tuyết.

### 2.5 Công cụ soi hình trong repo

- Thêm lệnh `python3 -m bkt_web.remake_vector --contact-sheet <group|pack|ids> --out <file.jpg> [--growth 0.2,0.5,1] [--times …]`. Lệnh dùng Playwright, không cần server.
- Mỗi giai đoạn nộp một bảng hình soi. Mỗi rig trên bảng có: growth 0.2/0.5/1, lúc đứng yên, lúc đang làm động tác chính, và một hình phóng to.

---

## 3. Giai đoạn B — cây ăn quả cho từng loại quả (gói `farm_trees`)

### 3.1 Template `drawFruitTree(ctx, s, t, spec)` (nhóm `plant`, có mặt ở thân cây)

- **Quả trên cây vẽ bằng chính `FRUIT_BODIES[spec.fruit]`,** thu nhỏ theo `spec.fruitScale`, không tay chân, không mặt, màu chín theo `growth`. Không vẽ quả riêng lần hai.
- **Các giai đoạn theo `growth`:**

  | growth | Hình |
  |---|---|
  | 0–0.25 | cây con |
  | 0.25–0.45 | ra hoa (`spec.blossom`) |
  | 0.45–0.75 | quả non (xanh, nhỏ dần lên) |
  | 0.75–1 | quả chín |
- **Spec:**
  - `trunk`: `straight` / `forked` / `palm` / `cactus_post` / `bush` / `rosette`.
  - `canopy`: `round` / `oval` / `cone` / `spread` / `palm_fronds` / `none`.
  - `leaf`: `broad` / `small` / `frond` / `needle` / `succulent`.
  - `leafColor`, `blossom`.
  - `fruit`: id của rig quả.
  - `fruitScale`, `slots` (toạ độ các quả, tối đa 8), `onTrunk` (mít, sầu riêng mọc sát thân).
- **Pose mới `fruits` (0–8, số nguyên):** số quả còn trên cây, vẽ theo thứ tự `slots`. Anchor `fruit_1`…`fruit_8` luôn tồn tại. Anchor `fruit` (cũ) bằng `fruit_1`.
- **Động tác mới:**
  - `pick` (hái): actor là người/chibi/tay, target là cây, `target_anchor: fruit_N`.
    - Lúc bắt đầu, story đặt `fruits` giảm 1 và cho một actor quả **cùng id quả** xuất hiện tại `fruit_N`, rồi dùng `grip` để cầm.
    - Validator kiểm cả hai phía: quả mới phải khớp `spec.fruit`, và xuất hiện đúng thời điểm `fruits` giảm.
    - Thêm hàm dựng sẵn `remake_vector.pick_fruit_events(tree_id, slot, t, hand_actor)` trả về đủ pose và động tác, để storyboard không phải tự ráp.
  - `shake` (rung cây): tán cây lắc theo `t`. Các quả có `fall: true` rơi xuống `ground_y`, nảy nhẹ (dùng cơ chế thả/rơi hiện có).
- **Danh sách (15):**

  | id | trunk / canopy | fruit | ghi chú |
  |---|---|---|---|
  | `mango_tree` | forked / spread | mango | quả treo cuống dài |
  | `orange_tree` | forked / round | orange | hoa trắng nhỏ |
  | `lime_tree` | bush / round | lime | có gai nhỏ |
  | `apple_tree` | forked / round | apple | xứ lạnh, hoa hồng nhạt |
  | `pear_tree` | forked / oval | pear (§5) | |
  | `peach_tree` | forked / spread | peach (§5) | xuân nở hoa hồng |
  | `cherry_tree` | forked / spread | cherry (§5) | quả treo từng cặp |
  | `persimmon_tree` | forked / round | persimmon (§5) | thu trụi lá, quả cam còn trên cành |
  | `coconut_palm` | palm / palm_fronds | coconut | quả chùm dưới tán |
  | `durian_tree` | straight / oval | durian | `onTrunk` |
  | `jackfruit_tree` | straight / oval | jackfruit | `onTrunk`, quả to sát thân |
  | `lychee_tree` | forked / round | lychee | chùm |
  | `rambutan_tree` | forked / round | rambutan | chùm |
  | `guava_tree` | forked / spread | guava | vỏ thân loang |
  | `avocado_tree` | straight / oval | avocado | |
  | `dragon_fruit_cactus` | cactus_post / none | dragon_fruit | bò trên trụ bê tông |
  | `pineapple_plant` | rosette / none | pineapple | quả mọc giữa |
  | `strawberry_plant` | rosette / none | strawberry | sát đất, bò ngó |
  | `mangosteen_tree`, `starfruit_tree`, `kiwi_vine` | | | làm cuối nếu còn thời gian (kiwi ở §4) |

---

## 4. Giai đoạn C — cây leo giàn (gói `trellis`)

### 4.1 Đạo cụ giàn (nhóm `prop`)

- `trellis_a`: giàn chữ A bằng tre.
- `trellis_net`: lưới đứng.
- `pergola`: giàn ngang trên đầu (nho, chanh dây, bầu, mướp).

Mỗi giàn có anchor `climb_1`…`climb_6` dọc đường dây leo, `top`, `grip` và `surface`.

### 4.2 Template `drawVine(ctx, s, t, spec)` (nhóm `plant`)

- **Giàn vẽ luôn trong rig,** chọn bằng `spec.support`. Nhờ vậy dây leo và giàn không bao giờ lệch nhau. Đạo cụ giàn ở §4.1 chỉ để dựng cảnh trống.
- **Dây leo mọc dọc một đường cố định** của từng kiểu giàn. Độ dài theo `growth` (tính theo chiều dài cung, tất định). Có tua cuốn xoắn ở đầu ngọn và lá theo `spec.leaf` (tim / chân vịt / 3 thuỳ).
- Ra hoa ở growth 0.35–0.55: hoa vàng cho họ bầu bí, hoa tím cho chanh dây và đậu.
- **Quả treo** dùng `FRUIT_BODIES`, dài dần theo growth, số quả theo pose `fruits`, anchor `fruit_N`. Dùng chung động tác `pick`.
- Nhận `s.wind`.

### 4.3 Quả leo giàn mới (nhóm `fruit`, có mặt và tay chân khi đứng một mình)

| id | tên | thân | giàn |
|---|---|---|---|
| `cucumber` | dưa leo | trụ dài, gai li ti, đầu có hoa khô | trellis_a |
| `bitter_melon` | khổ qua | thoi, vân gồ ghề | trellis_a |
| `luffa` | mướp | dài, gân dọc | pergola |
| `bottle_gourd` | bầu | hồ lô | pergola |
| `winter_melon` | bí đao | trụ to, phấn trắng | pergola |
| `passion_fruit` | chanh dây | tròn tím; ruột vàng có hạt đen khi bổ | pergola |
| `chayote` | su su | quả lê có rãnh, xanh nhạt | trellis_a |
| `long_bean` | đậu đũa | chùm dài mảnh (không có mặt; mặt chỉ vẽ trên quả đứng riêng) | trellis_net |
| `grape_vine` | dây nho | dùng rig `grape` hiện có | pergola |
| `kiwi_vine` | dây kiwi | dùng `kiwi` (§5) | pergola |

Rig cây: `cucumber_vine`, `bitter_melon_vine`, `luffa_vine`, `bottle_gourd_vine`, `winter_melon_vine`, `passion_fruit_vine`, `chayote_vine`, `long_bean_vine`, `grape_vine`, `kiwi_vine`.

---

## 5. Giai đoạn D — trái cây xứ lạnh (thêm vào `FRUIT_BODIES`)

`pear` (lê), `peach` (đào, có rãnh và lông tơ), `plum` (mận tím, phấn trắng), `cherry` (cặp hai quả chung cuống; anchor `grip` ở cuống), `persimmon` (hồng, đài 4 lá vuông), `kiwi` (nâu lông; ruột xanh, hạt đen xếp vòng khi bổ), `blueberry` (chùm 3–5 quả, có "vương miện"), `raspberry` (quả gồm nhiều hạt tròn nhỏ), `apricot` (mơ), `pomegranate` (lựu, có vương miện; bổ ra hạt đỏ).

Mỗi quả cần có:
- `FRUIT_COLORS` (màu từ non đến chín);
- ruột trong `FRUIT_SEEDS` (bắt buộc);
- `FRUIT_LIMBS`;
- `_asset_states`;
- mặt vừa với thân.

Chùm nhỏ (cherry, blueberry) để mặt trên quả lớn nhất.

---

## 6. Giai đoạn E — rau củ (gói `vegetables`)

Mỗi loại có **hai rig**: cây còn trong đất (nhóm `plant`) và củ/bông đã thu hoạch (nhóm `vegetable`, có mặt và tay chân, dùng `drawFruit`).

- **Nhóm mới `vegetable`:** dispatch giống `fruit`. Thêm nhóm vào catalog, `capability_registry`, validator và trang thư viện (tab Nhân vật lọc theo nhóm).
- **Cây trong đất:**
  - phần củ nằm **dưới** mặt đất, chỉ lộ khi `roots > 0` hoặc hình nền `soil_cutaway`;
  - `uproot` kéo cả củ lên (dùng động tác hiện có);
  - `growth` làm to củ và lá.
- **Danh sách:**

  | Loại | Cây trong đất | Củ/bông đã thu hoạch |
  |---|---|---|
  | Củ | `kohlrabi_plant` (su hào: củ tròn trên mặt đất, cuống lá mọc từ củ) | `kohlrabi` |
  | Củ | `potato_plant`, `sweet_potato_plant`, `cassava_plant`, `taro_plant` | `potato`, `sweet_potato`, `cassava`, `taro` |
  | Củ | `radish_plant` (củ cải trắng), `beet_plant`, `onion_plant`, `garlic_plant`, `ginger_plant` | `radish`, `beet`, `onion`, `garlic`, `ginger` |
  | Bông | `cauliflower_plant` (súp lơ trắng giữa lá bao), `broccoli_plant` | `cauliflower`, `broccoli` |
  | Lá | `lettuce`, `napa_cabbage` (cải thảo), `water_spinach` (rau muống, có thể trồng ở `pond`), `mustard_greens`, `spring_onion` | (rau lá chỉ có một rig; có mặt khi đứng một mình) |
  | Quả rau | `okra`, `chili` (khác `pepper`: nhỏ, đỏ, chùm), `mushroom` (nấm rơm/nấm mỡ, mọc cụm trên rơm) | có mặt |
  | Khổng lồ | `giant_radish` | dùng cho truyện "Củ cải khổng lồ" (§8), cao 1.5–2 lần người, không cần kích thước thật |

---

## 7. Giai đoạn F — phân bón và hoá chất độc hại (gói `agrochem`)

**Khung nội dung:** chỉ phục vụ **giáo dục an toàn** (đồ bảo hộ, không phun khi gió, cách ly trước thu hoạch, rửa rau, cất xa trẻ em, không đổ ra ao). Engine chỉ vẽ.
- Không vẽ nhãn hiệu thật.
- Không ghi tên hoạt chất, liều lượng hay công thức.
- Biểu tượng nguy hiểm dùng **hình tượng GHS dạng chung** (đầu lâu, ngọn lửa, dấu chấm than, cá chết/cây chết) trên nhãn hình thoi đỏ, không có chữ.

### 7.1 Đạo cụ (nhóm `prop`/`tool`)

| id | mô tả |
|---|---|
| `fertilizer_sack` | bao phân (NPK dạng ba chấm màu, không chữ). `fill` là lượng còn lại |
| `compost_heap` | đống ủ phân hữu cơ, có hơi bốc nhẹ theo `t` |
| `manure_pile` | phân chuồng. Có ruồi vo ve khi `s.flies > 0` |
| `compost_bin` | thùng ủ. `cutaway` cho thấy các lớp |
| `granules` | nắm hạt phân (dùng với `scatter`) |
| `pesticide_bottle` | chai thuốc BVTV, nhãn hình thoi |
| `backpack_sprayer` | bình phun đeo lưng. Người/chibi đeo qua anchor `back` |
| `jerrycan` | can hoá chất |
| `chem_cabinet` | tủ khoá hoá chất. `open` 0–1 |
| `ppe_gloves`, `ppe_mask`, `ppe_goggles`, `ppe_boots` | đồ bảo hộ, gắn vào người/chibi qua `attach_to` (`hand_l/r`, `face`, `foot_l/r`) |
| `warning_sign` | biển cảnh báo hình thoi (chỉ có hình tượng) |
| `rinse_basin` | chậu rửa rau |

### 7.2 State và hiệu ứng mới

- `toxic` (0–1): sương độc xanh vàng quanh `surface`. Cây bị nhiễm có lá ngả vàng và rủ xuống (dùng lại `damage`). Người/chibi nhiễm đổi biểu cảm `worried`/`sick`. Cá nổi bụng khi `toxic > .8` (vẽ trong `drawFish`).
- `contaminated` (0–1) cho hình nền nước `pond`/`river`: đổi màu nước và có váng.
- **Động tác mới:**
  - `pour`: rót, dùng lại dòng chảy của `drip`.
  - `scatter`: rải phân, hạt bay theo cung.
  - `spray_drift`: phun khi có gió; sương trôi theo hướng `s.wind`, **chạm người** thì bật `toxic`.
  - `wash_produce`: rửa rau, nước và bọt trong `rinse_basin`.
  - `wilt` / `perk_up`: cây héo rồi tươi lại, điều khiển bằng `damage` theo thời gian.

---

## 8. Giai đoạn G — nông trại vui nhộn (hiệu ứng hài, dùng chung cho mọi nhóm)

- **Động tác biểu cảm, không có chữ** (`emote`): bong bóng biểu tượng trên anchor `top`: tim, `?`, `!`, `zzz`, dấu giận, nốt nhạc, bóng đèn ý tưởng, mồ hôi.
- **`dizzy`:** sao xoay quanh đầu.
- **`celebrate`:** giấy màu rơi, tất định theo `hash(id)`.
- **`shiver`:** run cầm cập; tự bật khi `weather: snow` với nhân vật không mặc áo ấm.
- **`sweat`:** tự bật khi `weather: hot`.
- **`run_away`:** chạy nhanh, hơi nghiêng, bụi sau gót.
- **`bounce`:** nhún theo nhịp.
- **`tug`** (kéo co / nhổ củ tập thể):
  - N actor nối nhau: actor 1 cầm `giant_radish.grip`, mỗi actor sau cầm `back` (hoặc `waist`) của actor trước.
  - Cả đoàn giật lùi đồng pha.
  - Đến `pop_at`, củ bật lên và cả đoàn ngã ngửa.
- **`grow_fast`:** tua nhanh growth 0 → 1 kèm lấp lánh.
- **Quả/rau có biểu cảm sẵn:** thêm biểu cảm `sick`, `cold`, `hot`, `dizzy` vào `catalog.expressions` và `face()` (má xanh, răng run, mồ hôi, mắt xoắn).

---

## 9. Giai đoạn H — chibi giáo dục và y tế (gói `chibi`, `medical`)

### 9.1 Nhóm mới `chibi`: template `drawChibi(ctx, s, t, spec)`

- **Tỉ lệ:** cao khoảng 2.3 đầu. Đầu (gồm tóc) chiếm khoảng 45% chiều cao. Thân tròn ngắn, tay chân mập, bàn tay dạng `mitten`. Mặt nhìn thẳng, thân hơi nghiêng 3/4.
- **Mặt:**
  - thêm `face()` kiểu `chibi`: mắt to có 2 đốm sáng, lông mày dày, má hồng to, miệng nhỏ;
  - có sẵn khẩu hình khi nói (`s.mouth`) và nháy mắt;
  - cỡ mặt khoảng 1.0 trong bảng `size`.
- **Anchor bắt buộc:**
  - đầu và mặt: `root`, `face`, `mouth`, `forehead` (nhiệt kế đo trán), `ear_l`, `ear_r`, `teeth`, `head_top`, `top`;
  - thân: `neck`, `chest` (ống nghe), `belly` (đau bụng), `back` (balo, bình phun), `waist`, `hip`;
  - tay: `shoulder_l/r`, `elbow_l/r`, `wrist_l/r`, `hand_l/r`, `hand`, `grip` (= `hand_r`), `arm_l` (tiêm, dán băng);
  - chân: `knee_l/r`, `foot_l/r`.
- **Pose:**
  - dùng lại `hand_l_x/y`, `hand_r_x/y` (IK hai đoạn như `farmerSkeleton`, chiều dài theo tỉ lệ chibi), `hand_pose`, `arm`, `look_x/y`, `expression`;
  - thêm: `sit` 0–1 (ghế/giường), `lie` 0–1 (nằm giường bệnh), `lean` −1…1, `jump` 0–1, `blush`, `sweat`, `tears`, `fever` (má và trán đỏ), `pale` (da nhợt), `sick` (ám xanh nhẹ).
- **Đi bộ:** dùng `s.walk`/`s.stride`, bước ngắn, nảy đầu. Tóc và vạt áo nhận `s.wind`, đung đưa trễ pha theo `s.vx`.
- **Trang phục qua spec** (`hair`, `hairColor`, `outfit`, `accessory`; đổi màu bằng `style.skin|hair|shirt|accent`):

  | id | mô tả |
  |---|---|
  | `chibi_boy`, `chibi_girl` | học sinh (áo trắng, khăn quàng hoặc nơ) |
  | `chibi_kid` | trẻ nhỏ mẫu giáo |
  | `chibi_teacher` | giáo viên |
  | `chibi_doctor` | áo blouse trắng, ống nghe đeo cổ |
  | `chibi_nurse` | mũ có dấu **cộng xanh**, không dùng chữ thập đỏ |
  | `chibi_dentist` | khẩu trang và đèn đội đầu |
  | `chibi_pharmacist` | dược sĩ |
  | `chibi_patient` | áo bệnh nhân sọc xanh |
  | `chibi_grandma`, `chibi_grandpa` | có kính, gậy chống (`cane` gắn tay) |
  | `chibi_farmer` | nón lá, nối sang chủ đề nông nghiệp; đeo được `backpack_sprayer` và đồ bảo hộ |
  | `chibi_chef` | đầu bếp, cho chủ đề dinh dưỡng |

- **Đồ gắn lên người** qua `attach_to`: `ppe_mask` lên `face`, `backpack_sprayer` lên `back`, `band_aid` lên `arm_l`/`forehead`, `thermometer` lên `forehead`/`mouth`. Nếu đồ gắn phải vẽ **sau** mặt (khẩu trang che miệng), khai `layer: "over_face"`. Engine phải hỗ trợ việc này: vẽ actor gắn sau `face()` của actor cha.

### 9.2 Đồ y tế và vệ sinh (gói `medical`, nhóm `tool`/`prop`, có `grip`)

`stethoscope`, `thermometer`, `syringe` (tiêm chủng cho trẻ, kim ngắn, không vẽ máu), `pill`, `pill_bottle`, `syrup_bottle` + `spoon`, `band_aid`, `bandage_roll`, `face_mask`, `soap`, `sanitizer`, `towel`, `toothbrush`, `toothpaste`, `water_glass`, `first_aid_kit` (hộp có dấu cộng xanh), `ice_pack`, `hospital_bed`, `wheelchair`, `crutches`, `scale` (cân sức khoẻ), `height_chart` (thước đo chiều cao, vạch không số), `lunch_tray` (khay ăn đủ nhóm chất: rau, cá, cơm, trái cây, dùng rig quả/rau có sẵn thu nhỏ).

### 9.3 Vi sinh và cơ quan

Chuyển sang Giai đoạn I (§10). Giai đoạn H chỉ cần `good_bacteria`, `bacteria_rod`, `virus_spike` và `tooth_chibi` bản đầu cho các story rửa tay và đánh răng. Chúng phải dùng đúng template `drawCellChibi` và id của §10 để không phải làm lại.

### 9.4 Động tác y tế – vệ sinh

| id | actor → target | mô tả |
|---|---|---|
| `wash_hands` | chibi → soap/sink | chà hai tay vào nhau theo vòng (6 bước, mỗi bước có `hand_pose` riêng), bọt nổi quanh tay. Phối hợp với `wash` của vi sinh |
| `brush_teeth` | chibi (toothbrush ở `hand_r`) → `teeth` | bàn chải qua lại, bọt ở miệng |
| `cough_cover` | chibi | ho vào khuỷu tay: tay che miệng, hạt li ti **bị chặn** |
| `sneeze` | chibi | hắt hơi: đầu giật, hạt bắn ra hình nón (khi không che) |
| `take_temperature` | doctor/nurse → `forehead` | đưa nhiệt kế; thước màu đổi từ xanh sang đỏ theo `fever` |
| `listen` | doctor → patient `chest` | đặt ống nghe, nhịp tim hiện bằng sóng nhỏ |
| `vaccinate` | nurse (syringe) → kid `arm_l` | tiếp cận, chạm ngắn, dán `band_aid`; kid đổi biểu cảm từ `worried` sang `happy` |
| `apply_bandage` | chibi → `arm_l`/`knee_l` | quấn băng |
| `swallow_pill` | chibi | cầm viên thuốc lên miệng, uống nước |
| `drink` | chibi (water_glass) | uống nước |
| `exercise` | chibi | nhảy dây / chạy tại chỗ / vươn vai (theo `drawing_id`) |
| `eat` | chibi → food | đưa thức ăn lên miệng, nhai |
| `germ_attack` | microbe → target | vi sinh bò hoặc bay tới `surface` của target |

Engine chỉ vẽ động tác. **Nội dung y khoa** (số bước rửa tay, lời thoại) nằm trong kịch bản đã duyệt. Story mẫu **không ghi liều thuốc, tên thuốc hay lời khuyên điều trị**.

---

## 10. Giai đoạn I — Thế giới trong cơ thể: bộ phận chibi, vi khuẩn, đội quân miễn dịch (gói `body_world`)

**Tinh thần:** phiêu lưu hành động hoạt hình vui nhộn, kiểu "đội quân tí hon bảo vệ cơ thể". Mỗi nhân vật có tính cách rõ, gắn với **chức năng thật** của tế bào để câu chuyện vừa buồn cười vừa đúng kiến thức (bảng đối chiếu ở §10.7).

**Quy tắc bắt buộc:**
- **Không máu me.** Vi khuẩn thua thì "bụp" thành bong bóng và lấp lánh, hoặc choáng có sao quay. Không vẽ vết thương hở đỏ, không vẽ nội tạng thật.
- **Thiết kế riêng, không sao chép** loạt phim hoặc truyện có sẵn (vd. *Cells at Work! / Hataraku Saibō*, *Osmosis Jones*, *Il était une fois… la vie*). Tế bào ở đây là **sinh vật tròn/giọt có tay chân chibi và đồ nghề**, không phải người mặc đồng phục. Không dùng các nét dễ nhận ra của các phim đó: hồng cầu là cô gái mũ đỏ đeo túi, bạch cầu tóc trắng mặc áo trắng…
- Không có chữ. Biển báo, "lệnh truy nã", màn hình chỉ dùng hình.

### 10.1 Template `drawCellChibi(ctx, s, t, spec)` (nhóm mới `cell`, có mặt)

- **Thân** là hình tế bào (`spec.shape`): `round`, `disc` (đĩa lõm), `blob` (đổi dạng), `star`, `tiny`.
  - Thân mềm: `squish` 0–1 bẹp khi va chạm; tự nhún theo `s.walk`.
  - Có nhân mờ bên trong nếu `spec.nucleus`.
- **Tay chân chibi** ngắn, bàn tay `mitten`. IK tay dùng lại `hand_l_x/y`, `hand_r_x/y`.
- **Đồ nghề** theo `spec.gear`: mũ, khiên, kiếm, cung, loa, kính, mũ bảo hộ… Đồ vẽ trong rig. Vũ khí có anchor `weapon_tip`, khiên có `shield`.
- **Anchor bắt buộc:** `root`, `face`, `mouth`, `top`, `surface`, `back`, `grip` (= `hand_r`), `hand_l`, `hand_r`, `weapon_tip` (nếu có), `belly` (đại thực bào nuốt vào đây).
- **Pose/state:**
  - `squish`;
  - `engulf` 0–1: thân há rộng thành miệng lớn;
  - `glow` 0–1: tín hiệu hoặc được kích hoạt;
  - `alert`: dấu "!" hình tượng;
  - `hp` 0–1: dưới .3 thì băng dán và mặt mệt;
  - `stunned`: sao quay;
  - `tagged` 0–1: dính kháng thể chữ Y và phát sáng viền;
  - `infected` 0–1: cửa sổ nhỏ trên thân thấy virus bên trong, thân tái đi;
  - `split` 0–1: vi khuẩn nhân đôi, thắt eo rồi tách;
  - `pop` 0–1: nổ thành bong bóng và lấp lánh, rồi biến mất.

### 10.2 Đội bảo vệ cơ thể (nhóm `cell`)

| id | tế bào thật | hình vui (thiết kế riêng) | khả năng / động tác chính |
|---|---|---|---|
| `rbc_courier` | hồng cầu | đĩa lõm đỏ cam, chân chạy tất bật, ôm bóng O₂ xanh | `deliver`: đưa bóng O₂ tới cơ quan, nhận bóng CO₂ xám mang về phổi. **Không đánh nhau** |
| `neutrophil_scout` | bạch cầu trung tính | tròn trắng-xanh ngọc, nhân nhiều thuỳ, băng đô, chạy nhanh nhất | `charge`; `net_trap`: tung lưới bắt vi khuẩn (NETs có thật) |
| `macrophage_chef` | đại thực bào | to tròn, bụng bự, yếm và muôi | `engulf`: nuốt vi khuẩn vào `belly`, vi khuẩn mờ dần. `present`: giơ "ảnh truy nã" (hình vi khuẩn) cho T hỗ trợ |
| `dendritic_messenger` | tế bào tua | hình sao nhiều tua, túi đeo chéo | chạy về hạch bạch huyết báo tin (`present`) |
| `helper_t_captain` | tế bào T hỗ trợ | tròn xanh dương, mũ chỉ huy, loa | `rally`: sóng tín hiệu lan ra, đồng đội `glow` và tăng tốc |
| `killer_t_knight` | tế bào T gây độc | tròn tím, mũ giáp, kiếm | `strike_infected`: **chỉ** đánh `infected_cell`, không đánh vi khuẩn tự do |
| `b_cell_archer` | tế bào B / tương bào | tròn vàng, cung | `shoot_antibody`: bắn kháng thể chữ Y theo cung; trúng thì target `tagged` và chậm lại |
| `nk_ninja` | tế bào NK | tròn xám than, khăn ninja | `patrol`, `strike_infected` (nhanh, không cần báo trước) |
| `platelet_builder` | tiểu cầu | mảnh nhỏ màu kem, mũ bảo hộ vàng, bay/chạy thành đàn | `patch_wound`: xếp "gạch" vá vết thương, kéo lưới fibrin |
| `memory_cell_librarian` | tế bào nhớ | tròn xanh lá, kính tròn, ôm album | `remember`: lật album thấy ảnh vi khuẩn cũ, bật `alert` sớm |
| `mast_cell_alarm` | dưỡng bào | tròn hồng tím, cầm chuông | `false_alarm`: rung chuông với phấn hoa vô hại, mũi hắt hơi (câu chuyện dị ứng) |
| `cilia_sweeper` | lông mao đường thở | hàng lông mềm có mặt, cầm chổi | `sweep`: quét vi khuẩn và bụi ra ngoài |
| `skin_guard` | lớp da (hàng rào) | viên gạch tường có mặt, khiên | `shield_block`; `wound` 0–1 làm tường nứt |
| `good_bacteria` | lợi khuẩn đường ruột | que vàng tươi, cười, mũ lưỡi trai | `crowd`: chiếm chỗ, xếp hàng chắn lối vi khuẩn xấu |

### 10.3 Phe vi khuẩn và "kẻ xâm nhập" (nhóm `microbe`, có mặt, vui chứ không ghê)

Thay các rig `germ_green`, `germ_purple`, `virus_blob`, `bacteria_good` ở §9.3 bằng danh sách này. `bacteria_good` chuyển sang `good_bacteria` (§10.2).

| id | thật | hình vui | đặc điểm |
|---|---|---|---|
| `bacteria_rod` | trực khuẩn | que xanh lá, roi quẫy, cười gian | `split` nhân đôi |
| `bacteria_chain` | liên cầu | chuỗi 4–6 viên tròn, bò như sâu | các viên đi trễ pha |
| `bacteria_cluster` | tụ cầu | chùm viên tròn như chùm nho vàng cam | lăn |
| `virus_spike` | virus | khối tròn có gai núm (**không** giống hình minh hoạ SARS-CoV-2) | `hijack`: chui vào tế bào, biến nó thành `infected_cell` |
| `infected_cell` | tế bào bị nhiễm | tế bào hồng mệt mỏi, cửa sổ thấy virus bên trong, giơ "cờ hiệu" (hình) | mục tiêu của `killer_t_knight`, `nk_ninja` |
| `fungus_spore` | nấm | mũ nấm nhỏ, rắc bào tử | bám `skin_surface` |
| `parasite_worm` | giun ký sinh | giun hồng đeo kính râm | uốn lượn; bị `sweep` hoặc "tống ra" |
| `cavity_germ` | vi khuẩn sâu răng | vi khuẩn cầm máy khoan đồ chơi | `drill` làm `tooth.cavity` tăng |
| `plaque_goo` | mảng bám | cục nhầy vàng dính | bị bàn chải `brush_teeth` quét đi |
| `toxin_blob` | độc tố | giọt tím sủi bọt | nối với §7 (hoá chất) và `liver` lọc |
| `pollen_puff` | phấn hoa (dị nguyên) | quả cầu gai vàng **mặt ngây thơ** (không ác) | gây `false_alarm` |
| `superbug_boss` | vi khuẩn kháng thuốc | vi khuẩn to đội vương miện, khiên hình viên thuốc | câu chuyện "dùng kháng sinh đúng hướng dẫn của bác sĩ" |

### 10.4 Bộ phận cơ thể chibi (nhóm mới `organ`, có mặt, tay chân nhỏ rig được)

Mỗi cơ quan có dáng **nhận ra được** nhưng tròn trịa, dễ thương. Tay chân `mitten` nhỏ (bật/tắt bằng `spec.limbs`, vì ở `body_xray` §10.4.1 thì ẩn). Mỗi cơ quan có động tác đặc trưng:

| id | hình | state/động tác riêng |
|---|---|---|
| `heart_chibi` | trái tim đỏ hồng có van nhỏ | `beat` (nhịp 0.5–3 Hz, co bóp tất định theo `t`), `exercise` thì đập nhanh, đổ mồ hôi |
| `lungs_chibi` | đôi phổi (hai nhân vật dính nhau) | `breath` phồng/xẹp; `smoke` 0–1 xám và ho |
| `brain_chibi` | não hồng có nếp | `think` (bóng đèn), `sleepy`, `thermostat` (chỉnh "nhiệt kế" khi sốt) |
| `stomach_chibi` | dạ dày hình túi | `full` 0–1, `ache` (ôm bụng), bong bóng acid |
| `intestine_chibi` | ruột cuộn như cầu trượt | là nhà của `good_bacteria`; `rumble` |
| `liver_chibi` | gan nâu đỏ, đeo tạp dề "máy lọc" | `filter`: `toxin_blob` đi vào, ra giọt nước sạch |
| `kidney_chibi` | cặp hạt đậu | `filter` nước; `thirsty` khi thiếu nước |
| `bladder_chibi` | bóng nước | `fill` 0–1 (hài: nhảy nhót khi đầy) |
| `tooth_chibi` | răng trắng (thay `tooth` ở §9.3) | `cavity` 0–1, `sparkle` sau khi đánh răng |
| `tongue_chibi` | lưỡi hồng | `taste` (ngọt/chua/đắng bằng biểu cảm) |
| `eye_chibi` | nhãn cầu | `strain` (đỏ, mỏi vì màn hình), `blink` |
| `ear_chibi` | tai | `loud` (bịt tai khi ồn) |
| `nose_chibi` | mũi | `sneeze`, lông mũi quét bụi |
| `skin_patch` | mảng da | `wound` 0–1 (vết xước kiểu hoạt hình, không đỏ tươi), dán `band_aid` |
| `bone_chibi` | khúc xương | `crack` 0–1, bó bột; ôm hộp sữa (canxi) |
| `muscle_chibi` | bắp tay | `flex`, lớn lên khi `exercise` |
| `blood_drop_chibi` | giọt máu hồng (không đỏ tươi) | nhân vật dẫn chuyện |

#### 10.4.1 `body_xray` (nhóm `organ`)

- Chibi thân **trong suốt** (dùng khung `chibi_kid`), bên trong có ô đặt cơ quan. Anchor slot: `brain`, `eye_l/r`, `nose`, `mouth`, `lungs`, `heart`, `stomach`, `liver`, `kidney_l/r`, `intestine`, `bladder`, `bone_arm`, `muscle_arm`.
- Các `*_chibi` có thể `attach_to` slot. Khi gắn vào `body_xray`, cơ quan tự thu nhỏ theo `spec.slotScale` và tắt tay chân.
- `highlight: <slot>` làm phát sáng một cơ quan, phần còn lại mờ đi. Dùng cho "tour cơ thể".
- Vị trí các slot phải **đúng tương đối** về giải phẫu, tính theo bên của **nhân vật** (nhân vật nhìn thẳng ra người xem): tim lệch sang trái nhân vật, tức **bên phải màn hình**; gan ở bên phải nhân vật (bên trái màn hình), dưới phổi; dạ dày dưới tim.

### 10.5 Động tác mới (chiến đấu và hoạt động cơ thể)

| id | actor → target | mô tả |
|---|---|---|
| `patrol` | cell | đi tuần theo pose, xoay nhìn trái phải |
| `rally` | helper_t → nhóm | sóng tín hiệu vòng tròn lan từ `top`; ai trong bán kính thì `glow` và tăng tốc |
| `charge` | cell → target | xông lên, bụi và vệt tốc độ |
| `slash` | knight/ninja → target | vung vũ khí, vệt cung trắng; trúng thì `stunned`, rồi `pop` |
| `shoot_antibody` | b_cell → target | chữ Y bay theo cung parabol từ `weapon_tip`, trúng thì dính và target `tagged` |
| `engulf` | macrophage → target | há miệng (`engulf`), target thu nhỏ trượt vào `belly`, hiện mờ trong bụng rồi tan |
| `net_trap` | neutrophil → target | lưới bung phủ target, target chậm lại |
| `shield_block` | skin_guard/cell | giơ khiên, vật lao tới bật ra |
| `present` | macrophage/dendritic → helper_t | giơ "ảnh truy nã", helper_t `alert` rồi `rally` |
| `deliver` | rbc → organ | đưa bóng O₂ vào cơ quan, cơ quan tươi lên (`glow`) |
| `patch_wound` | platelet → skin_patch | xếp gạch từ hai mép vào, `wound` giảm đều |
| `sweep` | cilia → target | chổi quét, target trôi ra khỏi khung |
| `hijack` | virus → cell | virus chui vào; tế bào đích `infected` tăng |
| `strike_infected` | killer_t/nk → infected_cell | chỉ hợp lệ với target `infected > .5` (validator chặn nếu sai) |
| `multiply` | microbe | `split` và đẻ bản sao (story khai sẵn actor bản sao, engine vẽ lúc tách) |
| `remember` | memory cell | lật album, trang có hình khớp với target thì phát sáng |
| `false_alarm` | mast cell → pollen | rung chuông, cơ quan `nose_chibi` hắt hơi |
| `filter` | liver/kidney → toxin | độc tố vào, nước sạch ra |
| `drill` | cavity_germ → tooth | khoan, `cavity` tăng |
| `victory` | nhóm | nhảy lên, đập tay nhau (hai bàn tay chạm nhau), dùng `celebrate` |

### 10.6 Hình nền trong cơ thể (theme `body`, thêm vào bảng §11)

| id | chi tiết |
|---|---|
| `blood_vessel` | "đường cao tốc" mạch máu hồng, hồng cầu trôi mờ ở xa, vách mạch cong |
| `lung_alveoli` | túi phổi như chùm bóng bay, phồng xẹp theo `t` |
| `stomach_inside` | hồ acid sủi bọt xanh vàng, nếp dạ dày |
| `intestine_town` | "làng" lông nhung như đồi cỏ mềm, lợi khuẩn ở xa |
| `skin_surface` | mặt da như đồng cỏ hồng, lỗ chân lông, sợi lông như cây |
| `wound_site` | vết xước như khe núi, có giàn giáo cho tiểu cầu (không đỏ tươi) |
| `mouth_cave` | dãy răng như núi trắng, lưỡi như thảm |
| `nose_cave` | rừng lông mũi, bụi lơ lửng |
| `lymph_node_base` | "doanh trại" tròn, cờ hiệu hình kháng thể (không có quốc kỳ) |
| `bone_marrow_factory` | "nhà máy" sinh tế bào, băng chuyền tế bào con |
| `brain_hq` | phòng chỉ huy, màn hình sóng nơ-ron (chỉ hình) |
| `training_camp` | sân tập (tuyến ức), bù nhìn hình vi khuẩn để tập, dùng cho câu chuyện vaccine |

`body_inside` (§11) giữ lại làm nền chung.

### 10.7 Bảng đối chiếu ẩn dụ ↔ kiến thức thật (cho người viết kịch bản)

Engine không kiểm được nội dung, nhưng story mẫu và prompt viết kịch bản phải theo bảng này. Đưa bảng vào `catalog.body_world_facts` để công cụ viết kịch bản đọc được.

| Nhân vật làm gì | Đúng vì | **Không được nói** |
|---|---|---|
| Hồng cầu chở bóng O₂ | hồng cầu mang oxy nhờ hemoglobin | hồng cầu đánh vi khuẩn |
| Bạch cầu trung tính đến trước, tung lưới | là tế bào đến sớm nhất, có NETs | nó "nhớ" vi khuẩn |
| Đại thực bào nuốt rồi trình ảnh | thực bào và trình diện kháng nguyên | nó là tế bào duy nhất diệt khuẩn |
| B bắn kháng thể chữ Y, vi khuẩn bị đánh dấu | kháng thể gắn kháng nguyên, giúp thực bào | kháng thể tự "nổ" vi khuẩn |
| T gây độc chỉ đánh tế bào bị nhiễm | diệt tế bào nhiễm virus | T gây độc chém vi khuẩn tự do |
| Tế bào nhớ + trại tập (vaccine) | vaccine giúp cơ thể nhận diện trước | vaccine chứa "vi khuẩn sống gây bệnh", vaccine chữa bệnh ngay |
| Sốt = não chỉnh nhiệt | sốt là phản ứng của cơ thể | sốt luôn nguy hiểm / không bao giờ cần đi khám |
| Siêu vi khuẩn kháng thuốc | dùng kháng sinh sai cách làm vi khuẩn kháng thuốc | kháng sinh diệt virus; tự mua kháng sinh uống |
| Dưỡng bào báo động nhầm | dị ứng là phản ứng quá mức với chất vô hại | dị ứng là do vi khuẩn |
| Lợi khuẩn giữ chỗ trong ruột | hệ vi sinh đường ruột có lợi | mọi vi khuẩn đều xấu |

### 10.8 Mẫu trình diễn (thêm vào §12)

11. `scrape_battle_examples`: té trầy gối (`skin_patch.wound`), vi khuẩn tràn vào. `neutrophil_scout` `charge` + `net_trap`, `macrophage_chef` `engulf` rồi `present`, `helper_t_captain` `rally`, `b_cell_archer` `shoot_antibody`, `platelet_builder` `patch_wound`, cuối cùng `victory`.
12. `virus_invasion_examples`: `virus_spike` `hijack` tế bào, `nk_ninja` và `killer_t_knight` `strike_infected`, `brain_chibi` chỉnh nhiệt (sốt nhẹ), nghỉ ngơi, uống nước.
13. `vaccine_training_examples`: `training_camp` với bù nhìn vi khuẩn, `memory_cell_librarian` chụp ảnh vào album. Lần sau vi khuẩn thật tới thì `remember`, phản ứng nhanh và `victory` sớm.
14. `body_tour_examples`: `body_xray` `highlight` lần lượt từng cơ quan, mỗi cơ quan chào và làm động tác riêng (tim đập, phổi thở, dạ dày ôm bụng khi ăn quá no).
15. `gut_team_examples`: `good_bacteria` `crowd` chắn `bacteria_rod`. Ăn rau (rig rau §6) thì lợi khuẩn đông thêm.
16. `cavity_examples`: `cavity_germ` `drill` và `plaque_goo` trong `mouth_cave`. Bàn chải khổng lồ `sweep`, `tooth_chibi` `sparkle`.
17. `allergy_examples`: `pollen_puff` bay vào `nose_cave`, `mast_cell_alarm` `false_alarm`, `nose_chibi` hắt hơi.

---

## 11. Hình nền mới (~22 cảnh, làm dần theo từng giai đoạn)

| id | theme | giai đoạn | chi tiết |
|---|---|---|---|
| `rice_paddy` | farm | B | ruộng nước, bờ, mạ, cò ở xa |
| `terraced_field` | highland | B | ruộng bậc thang, núi mờ |
| `fruit_orchard` | farm | B | hàng cây ăn quả mờ phía sau (không trùng `orchard` cũ) |
| `trellis_garden` | garden | C | các dãy giàn phía xa, lối đi đất |
| `greenhouse` | farm | C | khung nhà kính, ánh sáng khuếch tán |
| `highland_farm` | highland | D | đồi thông, sương, nhà gỗ (Đà Lạt) |
| `snowy_orchard` | highland | D | cây trụi phủ tuyết (dùng với `season: winter`) |
| `vegetable_rows` | garden | E | luống rau thẳng hàng phối cảnh |
| `farmyard_barn` | farm | G | chuồng gỗ, hàng rào, đống rơm |
| `village_market` | market | G | sạp tre, dù, rổ rau (không chữ) |
| `farm_warehouse` | farm | F | kho có kệ bao phân, tủ khoá hoá chất, biển hình thoi |
| `kitchen` | home | F/H | bồn rửa, thớt, bếp |
| `living_room` | home | H | ghế, cửa sổ, đèn |
| `bathroom_sink` | home | H | bồn rửa tay, gương, xà phòng |
| `classroom` | school | H | bảng phấn (hình vẽ, không chữ), bàn học, cửa sổ |
| `school_yard` | school | H | cột cờ **không có cờ quốc gia**, cây phượng, sân |
| `playground` | school | H | cầu trượt, xích đu (xích đu đung đưa theo `t`) |
| `clinic_room` | clinic | H | giường khám, tủ thuốc, dấu cộng xanh |
| `hospital_ward` | clinic | H | giường bệnh, rèm, cửa sổ |
| `pharmacy` | clinic | H | kệ thuốc (hộp màu, không chữ) |
| `dentist_room` | clinic | H | ghế nha khoa, đèn |
| `body_inside` | body | H | "bên trong cơ thể" hoạt hình: mạch máu hồng, tế bào trôi |
| `science_lab` | lab | H | kính hiển vi, bình thí nghiệm màu |

Mỗi hình nền phải đạt các yêu cầu sau:
- khai `ground_y`;
- có bản ngày và đêm (đêm: tối màu và đèn sáng nếu có);
- không có chữ;
- đạt test hiệu năng: vẽ dưới 4 ms trên bảng test (576×1024, đo trung bình 60 frame trong Playwright) để render offline không chậm;
- đạt test tất định.

---

## 12. Mẫu trình diễn (`remake_vector.py`, `--build-showcase`)

Thêm các hàm `*_examples()` sau. Mỗi story dài 12–20 giây, dùng rig mới, không cần TTS:
1. `giant_radish_examples`: "Củ cải khổng lồ". Ông, bà, cháu (chibi), chó, mèo, chuột lần lượt nối vào kéo (`tug`), đến `pop_at` thì củ bật lên, cả đoàn ngã, `celebrate`.
2. `orchard_harvest_examples`: hái xoài/cam trên cây bằng `pick`, rung cây sầu riêng cho quả rơi, bỏ vào giỏ.
3. `trellis_examples`: dưa leo mọc dọc giàn qua `grow_fast`, ra hoa, ra quả, hái.
4. `highland_examples`: Đà Lạt có sương; `strawberry_plant`, `persimmon_tree` mùa thu; nhân vật `shiver` khi có tuyết.
5. `vegetable_cutaway_examples`: `soil_cutaway` thấy củ su hào, khoai lang lớn dần, rồi `uproot`.
6. `safe_spraying_examples`: nông dân mặc đồ bảo hộ, đeo bình phun, phun khi lặng gió. Cảnh đối chiếu: gió làm sương trôi vào người khác (`spray_drift` → `toxic`, `emote !`). Kết thúc bằng `wash_produce`.
7. `handwashing_examples`: chibi_kid với `germ_*`, `wash_hands` 6 bước, vi khuẩn vỡ bọt, `emote` tim.
8. `doctor_visit_examples`: `take_temperature`, `listen`, `vaccinate`, dán băng, bé cười.
9. `tooth_examples`: `tooth` có `cavity`, `brush_teeth`, sâu răng mờ dần.
10. `nutrition_examples`: `lunch_tray`, chibi ăn rau, `exercise`.

---

## 13. Thứ tự và khối lượng ước tính

| Giai đoạn | Nội dung | Rig mới | Động tác mới | Hình nền mới |
|---|---|---|---|---|
| A | tách gói, bảng đăng ký, `BACKGROUNDS`, thời tiết/mùa, contact-sheet | 0 | 0 | 0 (chuyển 9 cái cũ) |
| B | cây ăn quả | ~18 | `pick`, `shake` | 3 |
| C | cây leo giàn | 3 giàn + 10 dây + 8 quả | — | 2 |
| D | trái cây xứ lạnh | 10 | — | 2 |
| E | rau củ | ~40 (cây + củ) | — | 1 |
| F | phân bón, hoá chất | ~16 | `pour`, `scatter`, `spray_drift`, `wash_produce`, `wilt`, `perk_up` | 2 |
| G | nông trại vui nhộn | 1 (`giant_radish`) | `emote`, `dizzy`, `celebrate`, `shiver`, `sweat`, `run_away`, `bounce`, `tug`, `grow_fast` | 2 |
| H | chibi, y tế | ~14 chibi + ~24 đồ (+4 rig bản đầu của §10) | 13 | 10 |
| I | thế giới trong cơ thể | 14 tế bào bảo vệ + 12 vi khuẩn/kẻ xâm nhập + 17 cơ quan + `body_xray` | 20 | 12 |

Tổng cộng khoảng 190 rig mới (thư viện lên khoảng 300), khoảng 50 động tác mới và 34 hình nền. Giai đoạn H có thể làm song song với B–G sau khi A xong, vì nó chỉ phụ thuộc hạ tầng A. Giai đoạn I làm ngay sau H, vì dùng chung khung chibi (`body_xray`) và đồ y tế.

---

## 14. Kiểm tra (chạy sau mỗi giai đoạn)

1. `node --check` cho engine và mọi file trong `remake_vector_packs/`.
2. Test hiện có đều phải đạt:
   - `python3 -m unittest discover -s tests -p test_remake_vector.py`
   - `test_capability_registry.py`, `test_asset_manifest.py`, `test_native_vector_bridge.py`, `test_render_router.py`, `test_storyboard_migration.py`, `test_remake_pipeline.py`
3. **So pixel rig cũ:** mọi rig, động tác và hình nền có trước giai đoạn phải **giống từng pixel** với bản trước giai đoạn. Ngoại lệ phải ghi tên trong báo cáo kèm lý do. Đưa kịch bản so pixel vào repo thành `tests/test_remake_vector_regression.py`: lưu hash PNG của mỗi rig ở 5 mốc thời gian vào `tests/data/vector_hashes.json`, và có lệnh `--update-hashes` để cập nhật có chủ đích.
4. **Test mới bắt buộc:**
   - mọi anchor bắt buộc tồn tại (chibi có danh sách riêng ở §9.1);
   - `pick`: sau `grip`, quả nằm trong tay (<10 px) và `fruits` trên cây giảm đúng 1;
   - `tug`: mọi tay cầm đúng anchor của người phía trước (<12 px) suốt động tác;
   - `wash_hands` / `brush_teeth`: tay hoặc bàn chải ở trong 14 px quanh đích mỗi 0.1 s;
   - `vaccinate`: đầu kim chạm `arm_l` trong khoảng tiếp xúc, và không chạm ngoài khoảng đó;
   - vật gắn `layer: over_face` được vẽ sau `face()` (test thứ tự vẽ bằng spy trên `drawActor`);
   - mỗi hình nền: tất định (tua lại đúng pixel), không có lời gọi `fillText` (spy), vẽ dưới 4 ms;
   - `engulf`: trong khoảng nuốt, tâm target nằm trong thân đại thực bào; hết động tác thì target `opacity` = 0;
   - `shoot_antibody`: kháng thể chạm target (<10 px) đúng lúc `tagged` bắt đầu tăng;
   - `strike_infected`: validator từ chối khi target không phải `infected_cell` hoặc `infected` ≤ .5;
   - `patch_wound`: `wound` giảm đơn điệu trong khoảng động tác;
   - `body_xray`: mọi slot nằm trong bóng thân; khi không `flip`, slot `heart` có x > 0 (bên phải màn hình = bên trái nhân vật), `liver` có x < 0, `stomach` thấp hơn `heart`;
   - nhóm `cell`/`microbe`/`organ`: đếm pixel đỏ tươi (R>200, G<60, B<60) phải dưới 2% khung ở mọi mốc thời gian của `pop`, `slash`, `wound` (kiểm "không máu me");
   - `engine_sources()` được composer và trang thư viện dùng, và bản composer offline render được một story có rig từ mọi gói.
5. `python3 -m bkt_web.remake_vector --build-showcase`, rồi `--render-showcase` chạy hết không lỗi.
6. **Bảng hình soi** (`--contact-sheet`) của giai đoạn, gửi chủ repo. Chủ repo duyệt bằng mắt xong mới sang giai đoạn sau.
7. Cập nhật một dòng trong `AGENTS.md` cho mỗi hạ tầng mới (gói, `BACKGROUNDS`, nhóm `vegetable`/`chibi`/`cell`/`microbe`/`organ`, `pick`, `layer: over_face`, `body_xray`, `catalog.body_world_facts`).

---

## 15. Định nghĩa hoàn thành

- Nhân vật §10 không giống thiết kế của phim/truyện có sẵn (chủ repo duyệt trên bảng hình soi).
- Mọi mục ở §3–§11 đã có trong catalog, vẽ đúng, có trong trang thư viện (lọc được theo nhóm và theme hình nền) và đạt §14.
- Không còn nhánh `if (s.asset === …)` mới trong engine (có test grep: đếm số nhánh không được tăng so với cuối Giai đoạn A).
- 17 story mẫu ở §12 chạy được, tua lại ra đúng pixel.
- Rig cũ không đổi pixel, trừ các ngoại lệ đã được duyệt.

## 16. Câu hỏi để chủ repo chốt (đã có mặc định, không chặn việc)

1. **Tỉ lệ chibi:** mặc định 2.3 đầu. Có thể chọn 2 đầu (dễ thương hơn, tay ngắn nên khó cầm đồ) hoặc 3 đầu (cầm đồ, rửa tay rõ hơn).
2. **Thứ tự ưu tiên:** mặc định A → B → E → C → D → F → G, còn H chạy song song sau A. Nếu cần video y tế trước thì đẩy H lên ngay sau A.
3. **Chủ đề y tế:** mặc định chỉ gồm vệ sinh, phòng bệnh, khám và tiêm chủng cho trẻ, dinh dưỡng. Không có phẫu thuật, máu, thuốc kê đơn.
4. **Kiểu tế bào trong cơ thể:** mặc định là sinh vật tròn/giọt có tay chân chibi và đồ nghề. Cách này dễ nhận ra là "tế bào" và tránh giống các phim có sẵn. Có thể chọn kiểu "người tí hon mặc đồng phục", nhưng khó tránh giống *Cells at Work!*.
5. **Mức "chiến đấu":** mặc định là hoạt hình kiểu chơi đùa (lưới, cung bắn kháng thể, kiếm phát sáng; vi khuẩn thua thì nổ bong bóng). Hợp với trẻ nhỏ và chính sách TikTok. Có thể làm nhẹ hơn nữa (chỉ đẩy, bắt, dọn) cho kênh mầm non.
