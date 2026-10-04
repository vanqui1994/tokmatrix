# Plan: gói vector "Tận thế, sinh tồn, zombie, thành phố cũ kỹ" (Giai đoạn V)

Mở rộng thư viện vector (`remake_vector_*`, Phần II J–U, thư viện nhân vật) bằng một chủ đề mới
cho story và engine video vector. Phục vụ niche Matrix `extreme_survival` và `mega_catastrophes`,
và dạng video "Bạn sẽ sống sót bao lâu nếu…" (giống engine `survival`, nhưng dựng bằng vector).

**Thị trường: de, us, kr, jp.** Không làm cho thị trường Việt Nam.

## 1. Tông nội dung (bắt buộc — đọc trước khi vẽ)

- **Phiêu lưu sinh tồn, không kinh dị.** Video dành cho mọi lứa tuổi (TikTok xếp nội dung chibi gần
  nhóm trẻ em; Đức có luật bảo vệ trẻ vị thành niên JMStV nghiêm với nội dung đáng sợ). Không jump
  scare, không màn hình tối đen kéo dài, không âm thanh la hét.
- **Zombie là "người bị bệnh lạ", hoạt hình hài.** Da xanh xám, mắt lờ đờ, đi lảo đảo, tay giơ
  trước, quần áo rách gọn. **Không máu, không vết cắn, không thịt thối, không xương lộ, không
  bộ phận rời.** Không bao giờ giết zombie: nhân vật **né, trốn, đánh lạc hướng, chặn cửa**, và kết
  truyện là **chữa khỏi** (`cured` 0 → 1, zombie trở lại thành người, mặt vui).
- **Không vũ khí:** không súng, dao, cưa máy hay gậy đánh người. Dụng cụ chỉ dùng để làm việc:
  đóng ván chặn cửa, đào, sửa.
- **Thành phố cũ kỹ = bỏ hoang và thiên nhiên mọc lại**, không đổ nát vì chiến tranh. Không xác
  người, không cảnh cướp bóc, không biểu tượng quân sự hay cờ thật.
- **Không giống tác phẩm có bản quyền:** The Walking Dead, The Last of Us, Plants vs. Zombies,
  Resident Evil, Fallout (Vault Boy), World War Z, Train to Busan, Kingdom.
- **Kiến thức thật:** mỗi story gắn một mẹo sinh tồn đúng, kể cả khi zombie là hư cấu. Ví dụ:
  lọc và đun sôi nước, quy tắc 3 (3 phút không khí, 3 ngày nước, 3 tuần thức ăn), giữ ấm, tín
  hiệu SOS, bộ đồ khẩn cấp, đi theo nhóm. Ghi rõ trong `note` rằng zombie là tưởng tượng.

## 2. Đã có trong catalog, dùng lại

- **Đồ dùng:** `flashlight`, `radio`, `compass`, `map_blank`, `emergency_backpack`, `first_aid_kit`, `jerrycan`, `campfire`, `rope`, `ladder`, `shovel`, `axe` (chỉ chẻ củi), `hammer`, `crate`, `barrel`, `bucket`, `well`, `fire_extinguisher`, `fire_blanket`, `face_mask`, `ppe_mask`, `plastic_bottle`, `can`, `cardboard_box`, `seed`, `watering_can`, `sign_post`.
- **Xe:** `bicycle`, `car`, `city_bus`, `school_bus`, `boat`.
- **Nhà:** `school_building`, `fire_station`.
- **Thú:** `dog` (bạn đồng hành), `cat`, `rabbit`, `mouse`, `city_mouse`, `crow` (nếu có; không thì `magpie`).
- **Hình nền:** `street`, `apartment_street`, `old_town_1900`, `farm_warehouse`, `river`, `desert_dunes`, `hospital_ward`, `school_yard`.
- **Outfit:** `raincoat`, `winter_coat`, `hi_vis_vest`, `construction`, `firefighter`, `bosai_zukin` (jp), `dust_mask_kr` (kr), `life_vest`, `scientist`.
- **Hành động:** `take_cover`, `crawl_low`, `run_away`, `build`, `haul`, `carry_together`, `carry`, `dig`, `water`, `ride`, `drive`, `row`, `patrol`, `wait_signal`, `false_alarm`, `emote`.

## 3. Mới: 3 gói

### 3.1 `wasteland.js` — thành phố cũ kỹ
- **Hình nền (6), mỗi cái có day/night, mọi weather, `ground_y: 810`, không chữ, không biển hiệu đọc được:**
  - `abandoned_street`: phố bỏ hoang, xe cũ phủ bụi, dây leo, cột đèn nghiêng;
  - `overgrown_plaza`: quảng trường cây mọc xuyên gạch, đài phun nước khô;
  - `rooftop_garden`: sân thượng trồng rau, bồn nước, pin mặt trời;
  - `subway_tunnel`: đường hầm tàu điện, đèn pin là nguồn sáng chính (đủ sáng, không tối đen);
  - `flooded_downtown`: phố ngập nửa tầng, đi bằng thuyền (dùng `open_water` như `viking_fjord`);
  - `safe_camp`: trại an toàn có tường gỗ, lều và vườn.
- **Trường mới `decay` (0–1) cho rig nhà và xe đã có** (`school_building`, `fire_station`, `car`, `city_bus`, `school_bus`): vết nứt, rỉ sét, dây leo, kính vỡ dạng đường kẻ. **Mặc định 0 giữ pixel cũ** (như `longship.oars`). Vẽ bằng một lớp phủ dùng chung `kit.decayOverlay(ctx, bbox, decay, seed)`, tất định theo seed.
- **Rig mới:** `barricade_boards`, `rain_barrel_filter`, `solar_panel_small`, `tent`, `sleeping_bag`, `vine_wall`, `street_lamp_old`, `shopping_cart`, `canned_food_stack`, `water_filter_bottle`, `signal_mirror`, `walkie_talkie`.

### 3.2 `zombies.js` — zombie hoạt hình
- **Không vẽ rig zombie riêng.** Zombie là **trạng thái** của nhân vật đã có: trường `zombie` (0–1) và `cured` (0–1) áp lên mọi rig chibi và rig người lớn.
  - `zombie` = 1: da ngả xanh xám (đổi tông bằng `tone`), mắt lờ đờ (biểu cảm mới `dazed`), tóc rối, áo rách dạng đường cắt gọn. **Không màu đỏ trên người.**
  - `cured` 0 → 1: các đặc điểm zombie mờ dần, kết thúc bằng hiệu ứng lấp lánh và mặt vui.
  - Mặc định 0 giữ pixel cũ của mọi chibi và người.
- **Hành động mới:**
  - `shamble`: đi lảo đảo, tay giơ trước; `motion: false`, tự dời vị trí như `haul`; tốc độ ≤ 40 px/s, luôn chậm hơn người chạy.
  - `chase_slow`: đuổi theo một mục tiêu nhưng không bao giờ chạm (giữ khoảng cách ≥ 80 px).
  - `distract`: ném đồ phát tiếng (lon, đồ chơi), zombie quay hướng theo.
  - `cure_spray`: nhà khoa học phun thuốc dạng mây lấp lánh, `cured` của mục tiêu tăng lên 1.
- **Không có hành động tấn công, cắn hay va chạm gây hại.** Validator từ chối mọi action có actor là zombie và target là người, trừ `chase_slow`.

### 3.3 `survival_kit.js` — kỹ năng sinh tồn
- **Rig mới:** `water_pot_boiling` (`boil` 0–1), `cloth_filter`, `firewood_bundle`, `fishing_rod_simple`, `snare_free` (bẫy chỉ có hình, không thú bị bắt), `seed_tray`, `hand_crank_radio` (`crank` 0–1), `sos_stones` (đá xếp chữ SOS: hình chữ cái là hình học, không phải `fillText`), `cure_sprayer` (bình phun thuốc của `dr_hana`, có `grip` và `nozzle`; mây thuốc lấp lánh màu xanh, không đỏ).
- **Hành động mới:**
  - `purify_water`: rót nước qua vải lọc rồi đun, nước đổi từ đục sang trong;
  - `crank_radio`: quay tay radio;
  - `signal`: vẫy gương hoặc đèn pin, có tia sáng tất định;
  - `scavenge`: lục hộp, lấy ra một vật có sẵn trong story;
  - `barricade`: đóng ván lên khung cửa, dùng `hammer_anvil`-style IK để đầu búa chạm ván.

## 4. Dàn nhân vật tái sử dụng (recurring cast)

Gói này không dựng nhân vật riêng cho từng story. Nó tạo một **dàn nhân vật cố định**, đăng ký trong
thư viện nhân vật, để mọi story của gói và về sau engine video dùng đi dùng lại: cùng gương mặt, cùng
màu, cùng đạo cụ. Người xem nhận ra nhân vật qua nhiều video, giống một series.

### 4.1 Định nghĩa một nhân vật tái sử dụng
Mỗi nhân vật là một mục trong `bkt_web/static/remake_vector_cast.json` (tệp mới, cùng định dạng với
`remake_vector_characters.json` và thêm các trường dưới đây). Cách tạo nhân vật trong story là
`cast_actor("mika")`, không ghép tay rig + outfit + style.

| Trường | Ý nghĩa |
|---|---|
| `id`, `label` (de/en/ko/ja) | tên cố định, dùng xuyên series |
| `rig`, `base_outfit`, `style` | ngoại hình gốc: rig chibi, outfit, màu da, màu tóc, màu áo (`style` hex), cỡ `height` chuẩn |
| `palette` | 2–3 màu nhận diện (áo, khăn, balo), không trùng nhân vật khác trong dàn |
| `signature_props` | đạo cụ đặc trưng gắn sẵn: tay nào, `held_pose` (height, rotation), cỡ pixel ≥ 60 |
| `states` | các biến thể dùng lại: `normal`, `rain` (áo mưa), `cold` (áo ấm), `night` (đèn pin), `zombie` (`zombie: 1` + outfit `torn`), `cured` (`cured: 1`) |
| `personality`, `voice_role` | tính cách (để LLM viết lời hợp vai) và gợi ý giọng TTS (child/adult/elder) |
| `expressions` | biểu cảm hay dùng của nhân vật |
| `clips` | bộ đoạn diễn riêng (mục 4.3) |
| `markets` | de, us, kr, jp |

Hàm mới trong `bkt_web/vector_characters/cast.py`:
- `cast_actor(cid, id=None, state="normal")`: trả về khai báo nhân vật và đạo cụ gắn tay (attach_to + held_pose).
- `cast_pose(cid, t, x, y, state=…, **extra)`: trả về keyframe đã có sẵn outfit, style và các trường trạng thái. Giá trị được ghi đủ ở mọi keyframe, nên không có trường bị giữ sang keyframe sau (bài học `opacity`).
- `cast_clip(cid, clip_id, at)`: đặt một đoạn diễn của nhân vật vào story.

Story của gói **chỉ** dùng ba hàm này cho dàn nhân vật. Test kiểm: mọi nhân vật dàn diễn trong 6 story
có ngoại hình khớp hệt `remake_vector_cast.json` (rig, outfit, style, đạo cụ).

### 4.2 Dàn nhân vật (6 + 1 thú)

| id | Vai | Rig | Ngoại hình nhận diện | Đạo cụ đặc trưng | Tính cách / giọng |
|---|---|---|---|---|---|
| `mika` | thủ lĩnh trẻ | `chibi_girl` | `survivor_jacket` cam, khăn quàng xanh lá | bộ đàm `walkie_talkie` | bình tĩnh, lập kế hoạch / child |
| `leo` | bạn nhanh nhẹn | `chibi_boy` | `survivor_hoodie` xanh dương, balo đỏ | đèn pin `flashlight` | nhanh nhẹn, hay đùa / child |
| `dr_hana` | nhà khoa học | `chibi_teacher` | `scientist` + `face_mask`, kính | bình thuốc `cure_sprayer` (rig mới) | tò mò, kiên nhẫn / adult |
| `grandpa_otto` | thợ sửa đồ | `chibi_grandpa` | `construction`, mũ len nâu | búa `hammer` | khéo tay, kể chuyện / elder |
| `pip` | bé út | `chibi_kid` | `raincoat` vàng | `hand_crank_radio` | ngây thơ, dũng cảm / child |
| `nora` | người được chữa khỏi | `chibi_girl` (tóc khác `mika`) | `survivor_hoodie` tím; trạng thái `zombie` → `cured` | — | bối rối rồi biết ơn / child |
| `biscuit` | chó đồng hành | `dog` | vòng cổ cam | — | trung thành |

- **Zombie đám đông:** dùng 3 biến thể `zombie_walker_a/b/c` (rig chibi khác nhau + outfit `torn`, `zombie: 1`, `role: crowd`, không có tên). Bất kỳ nhân vật nào trong dàn cũng có trạng thái `zombie`, dùng khi cốt truyện cần.
- **Không trùng nhân vật cũ:** `palette` và tóc của dàn này khác các nhân vật đã có trong thư viện (cao bồi, phi hành gia…), để không lẫn với series khác.

### 4.3 Bộ đoạn diễn của dàn
Mỗi nhân vật có tối thiểu các clip dùng lại được (`relative`, ghi `travel_px`, `facing`):
`idle`, `walk_in`, `walk_out`, `look_around`, `crouch_hide`, `run_short`, `wave`, `talk`, `emote_*`.
Ngoài ra mỗi người có 1–2 clip nghề riêng:

| Nhân vật | Clip nghề |
|---|---|
| `mika` | `radio_call` |
| `leo` | `flashlight_sweep` |
| `dr_hana` | `cure_spray`, `inspect` |
| `grandpa_otto` | `barricade`, `repair` |
| `pip` | `crank_radio` |
| zombie | `shamble`, `turn_to_sound` |

Clip được viết một lần trong `cast.py` từ hình học anchor (IK, held_pose), lưu vào
`remake_vector_clips.json` với `character` = id dàn diễn. 6 story mẫu ghép từ các clip này. Engine
video về sau cũng chỉ cần ghép clip, không viết pose.

### 4.4 Dùng lại ngoài gói
- Mọi gói hoặc story sau này gọi `cast_actor("leo")` là có đúng Leo.
- Đổi trang phục theo bối cảnh qua `state` (ví dụ `cold` cho cảnh tuyết), không tạo nhân vật mới.
- Thêm nhân vật vào dàn = thêm một mục vào `remake_vector_cast.json` và các clip của nó. Test kiểm `palette` không trùng các nhân vật đã có.

## 5. Story mẫu (6)

| Story | Nội dung | Mẹo sinh tồn |
|---|---|---|
| `last_city_morning` | Nhóm thức dậy ở `rooftop_garden`, tưới rau, quay radio, nghe tín hiệu trại an toàn | Quy tắc 3; nước trước, thức ăn sau |
| `water_first` | Hứng nước mưa ở `rain_barrel_filter`, lọc qua vải, đun sôi (`boil`), nước đổi từ đục sang trong | Lọc rồi đun sôi ít nhất 1 phút |
| `quiet_street` | Đi qua `abandoned_street`, zombie `shamble` từ xa; nhóm `take_cover` sau xe buýt, ném lon `distract`, lặng lẽ đi tiếp | Đi theo nhóm, giữ yên lặng, có kế hoạch rút lui |
| `barricade_night` | Đêm ở `safe_camp`: `barricade` cửa, đốt lửa an toàn, chó canh gác; zombie lảng vảng ngoài tường rồi bỏ đi | An toàn khi đốt lửa, luân phiên canh gác |
| `flooded_escape` | Chèo thuyền (`row`) qua `flooded_downtown`, `signal` gương cho trực thăng cứu hộ (chỉ là hình bóng, không biểu tượng quân sự) | Tín hiệu SOS, mặc áo phao |
| `the_cure` | Ở `subway_tunnel`, nhà khoa học tìm ra thuốc; `cure_spray` lên ba zombie, họ khỏi bệnh (`cured` → 1) và cùng về trại, `emote heart` | Kết lạc quan: hợp tác, khoa học |

Mỗi story 60–75 giây, nhân vật cỡ chuẩn (~220 px), không gọi `auto_frame`, hành động chính nằm
trên y ≈ 850. Áp đủ các quy tắc cứng 1–31 của prompt Phần II (giai đoạn U).

## 6. Kiểm thử — lớp `PhaseVTest` trong `tests/test_remake_vector.py`

1. **Rig, hình nền, trường mới:**
   - Mọi rig và hình nền mới vẽ được, có trong catalog với `pack`, không vẽ vượt y < −100.
   - `decay = 0`, `zombie = 0`, `cured = 0` cho pixel y hệt baseline cũ của mọi rig bị mở rộng.
2. **Zombie không đỏ:** ở `zombie = 1`, pixel đỏ (R > 150, G < 80, B < 80) chiếm < 0,5 % bbox nhân vật.
3. **`shamble`/`chase_slow`:** tốc độ ≤ 40 px/s; khoảng cách zombie ↔ người ≥ 80 px ở mọi khung lấy mẫu.
4. **Validator:**
   - Từ chối mọi action có actor là zombie và target là người, trừ `chase_slow`.
   - Từ chối asset vũ khí. Danh sách cấm: súng, dao, kiếm thật, cưa; riêng `axe` chỉ hợp lệ khi target là `firewood_bundle`.
5. **`the_cure`:** `cured` tăng đơn điệu tới 1, biểu cảm cuối là happy.
6. **`water_first`:** độ đục của nước giảm đơn điệu; `boil` lên 1 trước khi có cảnh uống.
7. **Chung:**
   - Mọi `emote` thuộc `EMOTE_SYMBOLS`; `outfit` chỉ mặc cho chibi.
   - Không story mới nào dùng `chibi_farmer` gốc hay `hat: conical`, và không story nào có `cues` tiếng Việt.
   - Kích thước đo pixel thật ở đúng chiều cao story dùng (đồ cầm tay ≥ 60 px, xe ≥ 180 px).
8. **Thư viện nhân vật:** round-trip pixel qua cho 6 story mới; zombie đám đông có `markets` de/us/kr/jp và `role: crowd`.
9. **Dàn nhân vật tái sử dụng:**
   - Mọi nhân vật của dàn trong 6 story khớp đúng `remake_vector_cast.json` (rig, outfit, style, đạo cụ, held_pose).
   - Mọi `state` của mọi nhân vật vẽ được; `palette` không trùng nhau trong dàn và không trùng nhân vật cũ.
   - Mỗi nhân vật có đủ bộ clip ở 4.3. Mỗi clip đặt ở 3 vị trí khác nhau vẫn chạm đất ± 12 px, đạo cụ trong tay < 3 px.

## 7. Lộ trình

| Bước | Việc | Xong khi |
|---|---|---|
| 1 | `wasteland.js`: 6 hình nền, trường `decay`, 12 rig | contact sheet duyệt, pixel cũ không đổi |
| 2 | Trạng thái `zombie`/`cured` + 4 hành động zombie + validator | test 2–4 qua; ảnh zombie duyệt bằng mắt (không đáng sợ) |
| 3 | `survival_kit.js`: 8 rig + 5 hành động | test 6 qua |
| 4 | `remake_vector_cast.json` + `cast.py` (cast_actor/cast_pose/cast_clip) + bộ clip dàn diễn; 6 story chỉ dùng dàn nhân vật; outfit `survivor_*` | render bảng dàn nhân vật (mỗi người × mọi state) và 5 khung mỗi story, duyệt bằng mắt |
| 5 | Chạy lại `vector_characters extract`, cập nhật `AGENTS.md` | round-trip 6/6 |

## 8. Câu hỏi cho chủ repo (đã có mặc định)

1. **Từ "zombie" trong lời dẫn:** mặc định dùng (từ phổ biến, hợp TikTok); có thể đổi sang "người nhiễm bệnh lạ".
2. **Mức "đáng sợ":** mặc định nhẹ (tông phiêu lưu, như hoạt hình thiếu nhi có yếu tố hồi hộp). Có thể làm một bản màu trầm hơn cho niche `mega_catastrophes`, nhưng vẫn không máu.
3. **Kết truyện:** mặc định luôn có lối thoát (chữa khỏi, tới trại an toàn), không có kết bỏ ngỏ đáng sợ.
