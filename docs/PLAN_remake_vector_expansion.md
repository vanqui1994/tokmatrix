# Kế hoạch mở rộng thư viện vector Remake: động vật, trái cây, hoa, đồ vật

Cập nhật: 2026-09-25. Người thực hiện: agent code (Gemini). Người duyệt: chủ repo.

Tài liệu này là **đặc tả để làm**, không phải ý tưởng. Làm đúng thứ tự các giai đoạn, mỗi giai đoạn phải qua hết mục "Kiểm tra" trước khi sang giai đoạn sau. Không deploy lên VPS — chủ repo tự deploy.

---

## 0. Hiện trạng (đọc kỹ trước khi sửa)

Thư viện hiện có **48 rig, 27 động tác**, engine `1.10.0`.

| File | Vai trò |
|---|---|
| `bkt_web/static/remake_vector_catalog.json` | Nguồn sự thật: rig (`assets`), anchor, nhóm, động tác (`actions`), `eases`, `pose_ranges`. Python và JS đều đọc file này. |
| `bkt_web/static/remake_vector_engine.js` | Engine Canvas 2D (một file, ~1700 dòng). `sampleBase`/`sample` tính trạng thái theo thời gian; `drawActor` → `drawFruit/drawPlant/drawHuman/drawTool/drawProp/drawAnimal/drawFish/drawMonster`; `face()` vẽ mặt; `effects/motionTrails/impacts` vẽ hiệu ứng. |
| `bkt_web/remake_vector.py` | Validator (`validate_story`, `validate_vector_scenes`), các storyboard mẫu (`examples`, `agriculture_examples`, `farm_life_examples`, …), `sample_stories()`, `showreel()`, `--build-showcase`. |
| `bkt_web/capability_registry.py` | `_asset_states(asset_id, group)`: khai báo trạng thái mà engine **thật sự vẽ** cho từng rig. |
| `tests/test_capability_registry.py` | `test_native_asset_states_are_conservative_and_match_engine_effects`: so **khớp tuyệt đối** tập rig và tập trạng thái. |
| `tests/test_remake_vector.py` | 29 test: anchor mặc định của động tác, tua lại ra đúng pixel, `grow` phải đổi hình, trang thư viện (mọi rig, mọi động tác, mobile), cel. |
| `bkt_web/static/remake_vector_library.html` | Trang thư viện: `assetStory()` (chiều cao theo rig), `liven()` (demo tự chuyển động), `actionStory()` (demo động tác). |
| `bkt_web/static/remake_vector_examples.json` | Sinh ra bởi `python3 -m bkt_web.remake_vector --build-showcase`. Không sửa tay. |
| `AGENTS.md` | Có mục "Shared vector library" — cập nhật một dòng tóm tắt khi xong. |

Ví dụ tốt để bắt chước (đã làm ở đợt trước): `drawBuffalo`, `drawChicken`, `drawBee`, `drawSunflower`, `drawGourd` (bí ngô/cà tím/bắp), `drawFarmTool`, `drawBasket` trong engine; `farm_life_examples()` trong `remake_vector.py`.

---

## 1. Hợp đồng kỹ thuật (bắt buộc, vi phạm là test đỏ hoặc hình sai)

### 1.1 Hệ toạ độ của một rig
- Mỗi rig vẽ trong hộp local **cao 100 đơn vị**: `root = [0, 0]` là **đáy-giữa** (chỗ chạm đất), trục y **âm là đi lên**, đỉnh ~`-100`. Bề ngang tự do (trâu ~ ±65).
- `worldAnchor` = `root` + anchor × `height/100`, xoay theo `rotation`, lật theo `flip`. Vì vậy **vẽ thân sao cho anchor nằm đúng trên phần nhìn thấy** (miệng ở miệng, `grip` ở chỗ cầm).
- Con vật/đồ vật nhìn nghiêng thì **quay mặt sang phải** (+x). `flip: true` sẽ quay sang trái.
- **Không bao giờ** dịch anchor bằng hiệu ứng vẽ. Được phép nhún/thở/đập cánh **chỉ trong phần vẽ**, và nếu phần đầu có nhún thì phải đưa độ lệch đó vào `headOffset(s, t)` để `face()` đi theo (xem `bee`).

### 1.2 Mỗi rig bắt buộc có anchor
`root`, `face`, `top`, `grip`. Nên có `surface` (côn trùng bò lên, bình xịt nhắm vào), `mouth` nếu có miệng. Anchor mà động tác dùng làm mặc định phải có trên **mọi** rig được liệt kê trong động tác đó (test `test_every_default_action_anchor_exists`).

### 1.3 Tất định (determinism)
- Chỉ được phụ thuộc `t` (giây của timeline) và `state`. **Cấm** `Math.random()`, `Date.now()`, `performance.now()` trong engine. Ngẫu nhiên thì dùng `hash(s.id)` làm seed.
- Test `test_all_examples_render_offline_and_seek_back_to_identical_pixels` tua tới/lui phải ra đúng pixel.
- Không có vòng animation tự chạy khi URL có `?render=1`.

### 1.4 Bộ công cụ vẽ có sẵn (dùng, đừng viết lại)
| Hàm | Dùng cho |
|---|---|
| `INK` | màu viền chung `#2d2621`. Viền thân 1.8–2.2, chi tiết 1–1.4. |
| `tone(color, amount)` | sáng (+) / tối (−) một màu. |
| `volume(ctx, x, y, rx, ry, base, light, dark)` | gradient khối tròn (sáng trên-trái). **Mọi thân tròn phải dùng**. |
| `cylinder(ctx, x0, x1, base)` | gradient khối trụ (cán, thân cây, chậu). |
| `limb(ctx, points, color, width)` | chi có viền, khớp liền (chân, tay, đuôi, xúc tu, cuống). |
| `mitten(ctx, x, y, r, color, angle)` | bàn tay tròn có ngón cái. |
| `leaf(ctx, x, y, size, angle, color, lobed)` | lá có gradient và gân. |
| `blade(ctx, x0, tip, color)` | lá dài hình lưỡi (lúa, cỏ). |
| `withCut(ctx, s, cutY, draw)` | cây bị cắt: phần trên ngã theo `s.cut`. |
| `mixColor(a, b, u)`, trong `drawFruit` có `ripen(stops)` | chuyển màu theo `growth`. |
| `ellipse`, `path`, `line` | nguyên thuỷ; `path` nhận chuỗi SVG path. |
| `burst(ctx, at, r, q)` | tia va chạm. |

### 1.5 Mặt (`face()`)
- `face()` vẽ **sau** thân, tại anchor `face`, mặt **nhìn thẳng** (2 mắt, lông mày, miệng theo biểu cảm, má hồng, nháy mắt, khẩu hình khi nói). Không tự vẽ mắt/miệng trong hàm vẽ thân nếu rig có `"face": true`.
- Đặt cỡ mặt trong bảng `size` ở đầu `face()` (con vật nhìn nghiêng: 0.3–0.45; quả to: 0.8–1; hoa: 0.45–0.55). Nhóm `plant` có bảng riêng ngay dòng dưới.
- Anchor `face` của con vật nhìn nghiêng đặt ở **giữa đầu, lệch về phía mõm** (xem `buffalo`: `[44, -64]`).

### 1.6 Chuyển động phụ có sẵn trong state (chỉ đọc khi vẽ)
- `s.walk` (0–1, đang di chuyển theo pose key), `s.stride` (pha bước, tính theo quãng đường → tua lại vẫn đúng), `s.vx`, `s.vy`.
- `s.mouth` (0–1 khi đang nói), `s.expression`, `s.gait` (động tác `crawl`), `s.attached`, `s.held_by`, `s.lift`.
- Chân: dùng mẫu trong `drawBuffalo`/`drawChicken`: `phase = stride + offset; swing = sin(phase)*walk*k; lift = max(0,-cos(phase))*walk*k`.
- Cánh/đuôi/râu: dao động theo `t` (vd `Math.sin(t * 50)` cho cánh ong).
- Bóng đổ: thêm id vào danh sách `grounded` trong `contactShadow()` cho vật đứng trên đất; vật bay **không** có bóng. Chỉnh độ rộng bóng ở dòng `const w = …` nếu vật rất dài/ngắn.

### 1.7 Nhóm và nơi dispatch
| `group` | Hàm vẽ | Ghi chú |
|---|---|---|
| `fruit` | `drawFruit` | Có mặt + không `attached` + chưa `slice` → tự có tay chân (`fruitLimbs`, cấu hình trong object `spec` theo asset). `slice` vẽ hai nửa, màu ruột ở biến `flesh`. |
| `plant` | `drawPlant` → `FARM_PLANTS[asset]` | Thêm hàm vẽ vào object `FARM_PLANTS`. `nutrients` tự vẽ hạt phân. |
| `animal` | `drawAnimal` → object map theo asset | Thêm vào map trong `drawAnimal`. |
| `tool` | `drawTool` → nhánh `['hoe','sickle','watering_can']` → `drawFarmTool` | Mở rộng danh sách + `drawFarmTool`. |
| `prop` | `drawProp` → nhánh `scarecrow/basket` | Mở rộng tương tự. |

**Việc 0 (refactor nhỏ, làm đầu tiên):** thêm một registry `const RIG_DRAWERS = {}` (asset → `(ctx, s, t, cat) => void`), và ở đầu `drawActor` nếu có `RIG_DRAWERS[s.asset]` thì gọi nó thay cho dispatch theo nhóm (vẫn gọi `face()`/`handMarks()` như cũ). Mọi rig mới đăng ký qua registry này; không nhét thêm nhánh `if` vào các hàm cũ. Không đổi hành vi rig cũ.

### 1.8 Những chỗ phải cập nhật **mỗi khi thêm rig**
1. `remake_vector_catalog.json`: entry trong `assets` (+ thêm vào `actors`/`targets` của động tác). Ghi file bằng `json.dumps(cat, ensure_ascii=False, indent=2) + "\n"` để giữ nguyên định dạng.
2. Engine: hàm vẽ + đăng ký registry + cỡ mặt + `contactShadow` + (nếu có nhún đầu) `headOffset`.
3. `capability_registry._asset_states`: khai báo đúng trạng thái engine vẽ; và thêm đúng tập đó vào `expected` trong `tests/test_capability_registry.py`. Quy tắc: luôn có `wet`; `fruit` có `cut`, `damage` (+`growth` nếu màu đổi theo growth, +`slice` nếu cắt đôi được); `plant` có `growth`, `roots` (+`cut` nếu dùng `withCut`, +`bend` nếu đọc `s.bend`, +`nutrients` nếu nằm trong `FARM_PLANTS`); đồ đựng có `fill` nếu vẽ `s.fill`. **Không khai báo trạng thái mà engine không vẽ.**
4. `remake_vector_library.html`: chiều cao xem thử trong `assetStory` (map `{ knife: 350, … }`) nếu rig khác cỡ người (mặc định 460); nhóm trong `liven()` nếu cần đi lại.
5. Bump `version` cuối engine và `?v=` của thẻ `<script src="/static/remake_vector_engine.js?v=…">` trong trang thư viện.

### 1.9 Bẫy đã gặp
- `track()` chỉ nội suy **số**. Giá trị bool (`flip`) đổi đúng tại thời điểm key.
- Showreel ghép **mọi** mẫu thành một storyboard; validator giới hạn **96 nhân vật** (`validate_vector_scenes`). Hiện đã dùng **70**. Tổng nhân vật của mẫu mới cộng lại **≤ 26**, kiểm bằng: `python3 -c "from bkt_web.remake_vector import sample_stories as s; print(sum(len(x['characters']) for x in s()))"`.
- `test_growth_visually_changes_every_supported_target`: mọi target của `grow` phải khác pixel giữa growth 0.1 và sau khi grow.
- Test thư viện chạy `validate_story` cho demo **mọi rig và mọi động tác** trong trang — nên `actionStory()` phải dựng được demo hợp lệ cho động tác mới (xem nhánh `peck` trong đó).
- Không thêm cel vẽ tay cho rig mới (`CEL_CELLS`); cel chỉ là ảnh tĩnh tham khảo.
- Không đổi nền (`background()`), không đổi `face()` ngoài bảng `size`.
- Chạy test bằng `discover -s tests`, không gọi `python3 -m unittest tests.x` cho các module import chéo.

---

## 2. Danh sách rig mới

Quy ước bảng: anchor ghi `[x, y]` trong hộp 100. "Mặt" = `face` trong catalog. "Trạng thái" = tập cho registry (đã gồm `wet`).

### 2.1 Động vật — template `drawQuadruped(ctx, s, t, spec)` (group `animal`, mặt: có)

Viết **một** hàm template nhận `spec` (không viết 9 hàm riêng). `spec` gồm: `body` (path SVG thân), `color`, `belly`, `pattern` (`'spots' | 'patches' | 'fluffy' | 'stripes' | null`), `legs` (mảng `[x, near(0|1), phaseOffset]`), `legTop`, `legLen`, `legWidth`, `hoof` (`'hoof' | 'paw' | 'trotter'`), `head` (path), `snout` (`{x, y, rx, ry, color, nostrils}`), `ears` (`'floppy' | 'pointy' | 'round' | 'long'`), `horns` (`null | 'short' | 'curved' | 'goat'`), `tail` (`'tuft' | 'curly' | 'bushy' | 'thin' | 'puff'`), `extras` (hàm vẽ thêm: bờm ngựa, râu dê, bầu vú bò). Chân bước theo `walk/stride`, đuôi vẫy theo `t`, tai lắc nhẹ theo `t`. Chuyển `buffalo` sang template này ở cuối giai đoạn (giữ nguyên anchor và dáng).

| id | Nhãn | Anchor chính | Hình dáng / màu | Chuyển động riêng |
|---|---|---|---|---|
| `cow` | Con bò | face [44,-66], mouth [56,-50], horn [42,-90], back [-4,-72], surface [-4,-72], tail [-58,-62], udder [-6,-30], grip [0,-58], top [0,-100] | thân trắng đốm đen (`spots`), mõm hồng, sừng ngắn, bầu vú hồng | đuôi quất, tai vẫy |
| `pig` | Con heo | face [40,-52], mouth [54,-44], back [-2,-62], surface [-2,-62], tail [-50,-56], grip [0,-45], top [0,-80] | hồng tròn, chân ngắn, mõm dẹt có 2 lỗ, tai cụp, đuôi xoắn | đuôi xoắn lò xo; khi đi thân lắc |
| `goat` | Con dê | face [34,-76], mouth [44,-62], horn [30,-96], back [-4,-66], surface [-4,-66], tail [-40,-68], grip [0,-55], top [0,-100] | trắng/xám, thân gọn, râu cằm, sừng cong ra sau | râu lắc |
| `sheep` | Con cừu | face [38,-60], mouth [46,-50], back [-2,-74], surface [-2,-74], tail [-44,-62], grip [0,-55], top [0,-90] | thân bông (cụm vòng tròn trắng kem có viền, `fluffy`), mặt và chân đen | lông phập phồng nhẹ |
| `horse` | Con ngựa | face [46,-82], mouth [58,-66], back [-4,-72], seat [-4,-74], surface [-4,-72], tail [-50,-70], grip [0,-60], top [40,-100] | nâu, chân dài, bờm và đuôi sẫm, móng | bờm bay theo `walk`; `seat` để `attach_to` người cưỡi |
| `dog` | Con chó | face [34,-74], mouth [46,-64], back [-4,-60], surface [-4,-60], tail [-40,-66], grip [0,-50], top [30,-100] | vàng nâu, tai cụp, lưỡi thò khi `mouth` | vẫy đuôi nhanh khi `expression` = happy |
| `cat` | Con mèo | face [30,-70], mouth [38,-62], back [-4,-56], surface [-4,-56], tail [-40,-80], grip [0,-46], top [28,-96] | xám sọc (`stripes`), tai nhọn, ria | đuôi cong lượn chữ S |
| `rabbit` | Con thỏ | face [18,-52], mouth [26,-46], back [-8,-40], surface [-8,-40], tail [-26,-22], grip [0,-30], top [14,-100] | trắng, tai dài dựng, đuôi bông, ngồi | **nhảy**: khi `walk>0` thân nảy theo `abs(sin(stride))` (chỉ phần vẽ, đưa vào `headOffset`) |
| `mouse` | Chuột đồng | face [26,-30], mouth [36,-26], back [-4,-30], surface [-4,-30], tail [-40,-10], grip [0,-20], top [20,-44] | nâu xám, tai tròn to, đuôi dài mảnh | râu giật, đuôi lượn |

Trạng thái registry: `{"wet"}` cho tất cả.

### 2.2 Chim — template `drawBird(ctx, s, t, spec)` (group `animal`, mặt: có)

Chuyển `chicken` sang template này (giữ anchor). `spec`: thân (ellipse), cổ/đầu, mỏ (`short|flat` cho vịt), mào/yếm, đuôi (`fan|short|long`), chân (`thin|webbed`), `flying` (true thì không vẽ chân, cánh vỗ theo `t`, không bóng).

| id | Nhãn | Anchor | Hình dáng | Chuyển động |
|---|---|---|---|---|
| `duck` | Con vịt | face [18,-70], beak [34,-64], mouth [34,-64], tail [-30,-58], surface [-4,-52], grip [-4,-44], top [14,-92] | trắng, mỏ dẹt cam, chân màng | đi lạch bạch: thân nghiêng trái-phải theo `stride` |
| `chick` | Gà con | face [6,-44], beak [18,-42], mouth [18,-42], tail [-16,-36], surface [0,-40], grip [0,-30], top [4,-60] | cục bông vàng tròn, chân ngắn | nhảy lóc cóc khi đi |
| `rooster` | Gà trống | như `chicken` nhưng top [10,-110], tail [-36,-80] | mào to, đuôi dài cong nhiều màu | vươn cổ khi nói (`mouth`) |
| `sparrow` | Chim sẻ | face [12,-56], beak [24,-54], mouth [24,-54], tail [-24,-50], surface [0,-50], grip [0,-46], top [6,-70] | nâu nhỏ, `flying: true` | vỗ cánh nhanh, lơ lửng như `bee` |

Thêm `duck`, `chick`, `rooster`, `sparrow` vào `peck.actors` → cần anchor `beak` (đã có trong bảng). Trạng thái: `{"wet"}`.

### 2.3 Côn trùng và con nhỏ (group `animal`, mặt: có)

| id | Nhãn | Anchor | Hình dáng | Chuyển động |
|---|---|---|---|---|
| `butterfly` | Bướm | face [0,-50], mouth [0,-44], surface [0,-50], grip [0,-50], top [0,-80] | nhìn chính diện, 4 cánh hoa văn (màu qua `style.body/accent`), thân mảnh, râu | cánh vỗ = co giãn trục x theo `abs(sin(t*9))`; lượn lờ (đưa vào `headOffset`) |
| `dragonfly` | Chuồn chuồn | face [30,-50], mouth [38,-48], surface [0,-50], grip [0,-50], tail [-44,-50], top [0,-70] | thân dài xanh, 4 cánh trong suốt, mắt to | cánh rung rất nhanh, bay ngang |
| `ladybug` | Bọ rùa | face [22,-20], mouth [30,-16], surface [0,-30], grip [0,-20], top [0,-40] | nhìn nghiêng, mai đỏ chấm đen, đầu đen | 6 chân bước theo `gait` |
| `ant` | Con kiến | face [30,-20], mouth [38,-16], surface [0,-24], grip [0,-18], top [0,-40] | 3 đốt đen/nâu đỏ, râu gập | 6 chân theo `gait` |
| `caterpillar` | Sâu xanh | face [34,-22], mouth [42,-16], surface [0,-20], grip [0,-14], tail [-40,-10], top [0,-36] | chuỗi đốt tròn xanh có chấm, đầu to | uốn sóng như `earthworm` (dịch pha theo đốt) |
| `frog` | Con ếch | face [10,-44], mouth [18,-30], throat [14,-26], surface [0,-50], grip [0,-24], top [8,-60] | xanh ngồi, mắt lồi trên đỉnh đầu, chân sau gập | **nhảy** như thỏ; túi họng phồng theo `mouth` |
| `snail` | (đã có) | | | |

Thêm `ladybug`, `ant`, `caterpillar` vào `crawl.actors` (anchor `root`), và vào `peck.targets`/`spray.targets` (anchor `top`/`surface`). Trạng thái: `{"wet"}`.

### 2.4 Trái cây (group `fruit`, mặt: có, tự có tay chân)

Anchor mặc định cho mọi quả (trừ khi bảng ghi khác): `root [0,0]`, `soil [0,0]`, `face [0,-50]`, `surface [0,-60]`, `cut [-15,-65]`, `grip [0,-48]`, `grip_l [-38,-48]`, `grip_r [38,-48]`, `top [0,-100]`, `leaf [16,-98]`. Nếu quả hẹp thì chỉnh `grip_l/grip_r` và `cut` vào trong viền quả, và thêm cấu hình tay chân vào object `spec` trong `drawFruit` (`hip`, `hipY`, `arm`, `armY` — xem `eggplant`).

Viết một hàm `drawFruitBody(ctx, s, body)` (giống `drawGourd`) có nhánh theo asset; mọi thân dùng `volume()` + viền `INK` 2–2.2 + điểm sáng. Màu theo `growth` bằng `ripen([...3 màu])`. Ruột khi `slice` thêm vào biến `flesh`.

| id | Nhãn | Hình dáng | `ripen` (xanh → giữa → chín) | Ruột (`slice`) | Ghi chú |
|---|---|---|---|---|---|
| `mango` | Xoài | quả hình thận nghiêng, cuống ngắn | `#7fb24a` → `#d8c24a` → `#f2a93b` | vàng cam `#f7b84a`, hạt dẹt | slice |
| `orange` | Cam | tròn, vỏ lỗ chân lông (chấm nhỏ), lá | `#6fae48` → `#e8b84a` → `#f08a2a` | múi cam hình nan quạt | slice |
| `lime` | Chanh | tròn nhỏ hơi dài, núm hai đầu | `#5fae48` → `#8cc84e` → `#b8d85a` | múi xanh nhạt | slice; face [0,-44], top [0,-86] |
| `guava` | Ổi | tròn-lê, vỏ sần nhẹ, đài đen ở đáy | `#6fae48` → `#a8cc5a` → `#d8e07a` | trắng hồng + hạt | slice |
| `lychee` | Vải | tròn, vỏ gai vảy (lưới chấm tam giác) | `#8cbf5a` → `#d86a4a` → `#c8323a` | trắng trong, hạt nâu | slice |
| `rambutan` | Chôm chôm | tròn, lông mềm tua xung quanh (đường cong ngắn đỏ/xanh ở ngọn) | `#8cbf5a` → `#e0703a` → `#d0302f` | trắng trong | slice; lông lay theo `t` |
| `mangosteen` | Măng cụt | tròn tím sẫm, đài xanh 4 cánh trên đỉnh | `#6f9a4a` → `#8a4a7a` → `#4a2040` | múi trắng | slice |
| `durian` | Sầu riêng | to, bầu dục, gai tam giác phủ khắp | `#6f9a3a` → `#9aa83a` → `#b8a83a` | múi vàng kem | slice; top [0,-104] |
| `coconut` | Dừa | tròn, vỏ xanh (non) hoặc nâu sợi (già), 3 mắt ở đỉnh khi già | `#5f9a3a` → `#8a8a3a` → `#8a5a2e` | cùi trắng + nước | slice |
| `avocado` | Bơ | hình lê, vỏ sần | `#5f9a3a` → `#3f6a2a` → `#2f3a1f` | xanh vàng + hạt nâu to | slice; face [0,-44] |
| `strawberry` | Dâu tây | hình trái tim ngược, hạt vàng, đài lá xanh | `#c8d890` → `#f08a7a` → `#e0303a` | hồng trắng | slice; top [0,-92] |
| `pineapple` | Dứa | thân bầu dục vảy chéo + vương miện lá nhọn cao | `#7fae48` → `#d8b84a` → `#e8a23a` | vàng + lõi | slice; face [0,-40], thân tới -70, lá tới -104, grip [0,-38] |
| `grape` | Chùm nho | chùm hình tam giác ngược gồm ~12 quả tròn, cuống + lá | `#9ac85a` → `#8a5a9a` → `#5a2a6a` | — (không slice) | face trên quả giữa [0,-60]; `grip` [0,-92] (cuống) |
| `dragon_fruit` | Thanh long | bầu dục hồng, vảy lá xanh ngọn cong | `#9ac85a` → `#e05a8a` → `#e0306a` | trắng chấm đen | slice |
| `starfruit` | Khế | nhìn nghiêng thấy 3 múi khía dọc | `#8cc84e` → `#d8d84a` → `#f0c83a` | lát cắt hình sao | slice |
| `jackfruit` | Mít | rất to, bầu dục, vỏ gai nhỏ dày | `#7fa84a` → `#a8b04a` → `#c8b04a` | múi vàng | slice; `assetStory` cao 520 |
| `banana_fruit` | Quả chuối | 1 quả cong hình trăng khuyết, núm đen hai đầu | `#7fb24a` → `#e0d04a` → `#f2cf45` | trắng kem | slice; face [4,-46] |

Mọi quả thêm vào: `grow.targets`, `cut.targets`, `grip/release/reach.targets`, `carry.targets`, `cover/uncover.targets`; quả `slice` được thì thêm vào `slice.targets`. Trạng thái registry: `{"cut", "damage", "growth", "wet"}` + `"slice"` nếu có.

### 2.5 Hoa (group `plant`, mặt: có, `growth` = độ nở)

Viết **một** template `drawFlower(ctx, s, t, spec)` đăng ký vào `FARM_PLANTS`. `bloom = clamp((growth - 0.3) / 0.7)`: `growth < 0.3` vẽ nụ; lớn dần thì cánh bung ra (bán kính + góc mở tăng theo `bloom`). Đầu hoa lắc nhẹ theo `t`. Dùng `withCut(ctx, s, -40, …)` cho thân. Cánh hoa: vẽ lớp sau rồi lớp trước, mỗi cánh `volume()` + viền `INK`.

Anchor chung: `root [0,0]`, `soil [0,0]`, `stem [0,-20]`, `cut [0,-40]`, `leaf [14,-44]`, `surface [0,-60]`, `shoot [0,-70]`, `bloom [0,-82]`, `face [0,-82]`, `fruit [0,-82]`, `top [0,-100]`, `grip [0,-30]`. **Thêm `bloom [0,-80]` cho `sunflower`** (để dùng chung động tác `pollinate`).

`spec` gồm: `petals` (số cánh), `shape` (`'round' | 'pointed' | 'heart' | 'cup' | 'ruffled'`), `layers` (1–3), `colors` (cánh ngoài, cánh trong, nhuỵ), `center` (`'dots' | 'stamens' | 'disk'`), `stem` (`'straight' | 'arched' | 'branch'`), `leaves` (số lá + kiểu).

| id | Nhãn | Hình dáng | Ghi chú |
|---|---|---|---|
| `rose` | Hoa hồng | 3 lớp cánh `cup` đỏ, thân có gai, lá răng cưa | gai là tam giác nhỏ |
| `lotus` | Hoa sen | cánh `pointed` hồng nhạt đầu đậm, 2 lớp, gương sen vàng; **lá sen tròn nổi** hai bên gốc | đặt trong ao: gốc ở mặt nước |
| `tulip` | Hoa tulip | cốc 3 cánh `cup`, lá dài | màu qua `style.body` |
| `daisy` | Hoa cúc | 16 cánh trắng mảnh, nhuỵ vàng `disk` | |
| `marigold` | Hoa vạn thọ | nhiều lớp `ruffled` cam | |
| `hibiscus` | Hoa dâm bụt | 5 cánh to `heart` đỏ, nhị dài thò ra | |
| `orchid` | Hoa lan | thân `arched` với 3–4 bông tím trắng dọc thân | `bloom` = bông đầu |
| `peach_blossom` | Cành đào | `branch` nâu gồ ghề, nhiều hoa nhỏ 5 cánh hồng; `growth` = số hoa đã nở | hoa Tết |
| `apricot_blossom` | Cành mai | như đào nhưng hoa vàng | hoa Tết |
| `lily` | Hoa ly | 6 cánh `pointed` cong ra sau, chấm đốm, nhị dài | |

Thêm `grass_tuft` (Bụi cỏ, group `plant`, mặt: **không**): cụm `blade()` xanh, `growth` = độ cao, `cut` = bị gặm (dùng `withCut(ctx, s, -8, …)`). Anchor: `root`, `soil`, `stem [0,-4]`, `cut [0,-8]`, `surface [0,-30]`, `top [0,-50]`, `face [0,-30]`, `grip [0,-20]`, `leaf [10,-30]`.

Mọi hoa + `grass_tuft` thêm vào: `grow.targets`, `water.targets`, `fertilize.targets` (anchor `soil`), `cut.targets` (anchor `cut`), `crawl.targets` (anchor `leaf`), `uproot.targets` (anchor `stem`). Trạng thái registry: `{"cut", "growth", "nutrients", "roots", "wet"}`.

### 2.6 Đồ vật

Dụng cụ (group `tool`, mặt: không, trạng thái `{"wet"}`). Thêm vào `grip/release/reach.targets`:

| id | Nhãn | Anchor | Hình dáng |
|---|---|---|---|
| `shovel` | Cái xẻng | root [0,0], tip [0,-4], grip [0,-92], grip_l [0,-60], face [0,-30], top [0,-100] | lưỡi thép dưới đáy, cán gỗ, tay cầm chữ T trên đỉnh |
| `rake` | Cái cào | root [0,0], tip [0,-4], grip [0,-80], face [0,-30], top [0,-100] | răng cào dưới đáy, cán dài |
| `axe` | Cái rìu | root [0,0], grip [0,-20], tip [-22,-88], face [0,-60], top [0,-100] | lưỡi rìu ở đầu trên, cán cong |
| `pruning_shears` | Kéo tỉa cành | root [0,0], grip [0,-24], tip [0,-92], face [0,-60], top [0,-100] | hai lưỡi cong + hai cán đỏ; lưỡi hé/khép theo `sin(t)` chỉ khi đang `cut` |

`shovel`, `rake`, `hoe` là actor của động tác mới `dig`; `axe`, `pruning_shears` thêm vào `cut.actors` (anchor `tip`).

Đạo cụ (group `prop`):

| id | Nhãn | Mặt | Anchor | Hình dáng | Trạng thái |
|---|---|---|---|---|---|
| `soil_bed` | Luống đất | không | root, surface [0,-24], soil [0,-24], grip [0,-20], face [0,-14], top [0,-30] | luống đất nâu dài (±70), mép có cỏ; `cut` = hố đào sâu dần ở giữa + đất văng thành đống bên cạnh | `{"cut", "wet"}` |
| `wheelbarrow` | Xe rùa | không | root, grip [-66,-44], grip_l [-66,-44], grip_r [-60,-40], rim [10,-54], surface [10,-54], face [10,-30], top [0,-64] | thùng + bánh trước + 2 càng; bánh quay theo `stride` khi đi | `{"fill", "wet"}` (đống đất/rau khi `fill`) |
| `crate` | Thùng gỗ | không | root, rim [0,-60], surface [0,-60], grip [0,-56], grip_l [-40,-40], grip_r [40,-40], face [0,-30], top [0,-64] | thùng ván gỗ có nẹp | `{"fill", "wet"}` |
| `sack` | Bao tải | có | root, grip [0,-86], grip_l [-30,-60], grip_r [30,-60], face [0,-44], surface [0,-80], top [0,-100] | bao phồng buộc dây miệng | `{"wet"}` |
| `hay_bale` | Kiện rơm | không | root, surface [0,-50], grip [0,-40], grip_l [-50,-30], grip_r [50,-30], face [0,-26], top [0,-54] | khối rơm vàng có dây buộc, sợi rơm lòi ra | `{"wet"}` |
| `egg` | Quả trứng | có | root, grip [0,-50], face [0,-50], surface [0,-80], top [0,-100] | trứng trắng kem; nhỏ (`assetStory` cao 160) | `{"damage", "wet"}` (vết nứt theo `damage`) |
| `nest` | Ổ rơm | không | root, rim [0,-40], surface [0,-40], soil [0,-36], grip [0,-30], face [0,-20], top [0,-46] | ổ rơm tròn; `fill` = số trứng hiện ra (0–4) | `{"fill", "wet"}` |
| `beehive` | Tổ ong | có | root, mouth [0,-24], face [0,-56], surface [0,-90], grip [0,-100], top [0,-100] | tổ tầng xếp vàng nâu treo, cửa tổ tối | `{"wet"}` |
| `lantern` | Đèn lồng | không | root, grip [0,-100], face [0,-50], top [0,-100] | đèn lồng đỏ tua vàng; ánh sáng nhấp nháy nhẹ theo `t` (quầng sáng alpha) | `{"wet"}` |
| `bowl` | Bát cơm | không | root, rim [0,-40], surface [0,-40], grip [0,-30], face [0,-20], top [0,-60] | bát sứ xanh trắng; `fill` = cơm đầy + hơi nóng bốc (đường cong mờ theo `t`) | `{"fill", "wet"}` |
| `fence` | Hàng rào | không | root, surface [0,-70], grip [0,-50], face [0,-40], top [0,-80] | 5 cọc gỗ + 2 thanh ngang, dài ±80 | `{"wet"}` |

Thêm `wheelbarrow`, `crate`, `sack`, `hay_bale`, `egg`, `bowl` vào `carry.targets` và `grip/release/reach.targets`. Thêm `egg` vào `peck.targets` (anchor `top`). `soil_bed` vào `water.targets` và `fertilize.targets` (anchor `soil`). Không thêm đồ vật vào động tác mà ý nghĩa không hợp (vd không `grow` cho đồ vật).

---

## 3. Động tác mới

Mỗi động tác là một entry trong `catalog.actions` với đủ khoá: `label`, `actors`, `targets`, `actor_anchor`, `target_anchor`, `channel`, `motion`, `hold`. Logic nằm trong `sampleBase` (vòng `for (const a of actions)` cho channel/tư thế; vòng `for (const a of live)` có `spec.motion` cho di chuyển actor tới target), hiệu ứng trong `effects()`/`impacts()`/`TRAILS`. Thêm nhánh demo trong `actionStory()` của trang thư viện (đặt actor gần target, cỡ hợp lý).

| id | Nhãn | actors | targets | actor_anchor → target_anchor | channel | motion | hold | Hành vi |
|---|---|---|---|---|---|---|---|---|
| `graze` | Gặm cỏ | cow, buffalo, goat, sheep, horse, rabbit | grass_tuft | `mouth` → `top` | `cut` | true | true | 25% đầu tiến tới; sau đó giữ, thân nhấp nhô ±3% theo `sin(p·π·6)`; trong lúc active đặt `actor.mouth = 0.5 + 0.5·sin(t·12)` (nhai) nếu không đang nói; `cut` của target tăng dần (cỏ ngắn lại). Chỉ nhắm `grass_tuft`: với lúa/bắp cải kênh `cut` làm cây ngã, sai nghĩa. Buffalo đã có anchor `mouth`. |
| `pollinate` | Hút mật | bee, butterfly | mọi hoa + sunflower | `mouth` → `bloom` | null | true | false | bay tới, lượn quanh bông (dx,dy = 6·sin/cos(t·3)); hiệu ứng: 6 hạt phấn vàng bay lên quanh `bloom` trong `effects()` |
| `dig` | Đào đất | shovel, rake, hoe | soil_bed | `tip` → `surface` | `cut` | true | true | giống nhánh `cut/slice` trong vòng motion (thêm `'dig'` vào điều kiện, stroke mặc định `[0, 30]`, lặp 2 nhát: dùng `p` gấp đôi); `IMPACTS.dig = 0.25` + hạt đất nâu văng (vẽ trong `impacts()`); `TRAILS.dig = 'actor'` |
| `hop` | Nhảy | rabbit, frog, chick | — | `root` → — | null | false | false | chỉ đổi tư thế: `actor.y -= sin(p·π·n)·height·0.25` với `n = 2` lần nhảy; **đây là dịch chuyển thật** (anchor đi theo) nên đặt trong vòng channel của `sampleBase` |
| `fly` | Bay lượn | bee, butterfly, dragonfly, sparrow | — | `root` → — | null | false | false | quỹ đạo số 8: `actor.x += sin(p·τ)·60`, `actor.y += sin(2·p·τ)·25`, lật `flip` theo dấu vận tốc x |

Validator Python đọc mọi thứ từ catalog, nên **không cần sửa `remake_vector.py`** cho động tác mới — trừ khi động tác có kênh IK (không có ở đây). Kiểm: động tác không có target (`hop`, `fly`) phải có `targets: []` và `target_anchor: null` như `gesture`.

---

## 4. Mẫu trình diễn

Thêm hàm `farm_animals_examples()` trong `remake_vector.py`, nối vào `sample_stories()` **sau** `farm_life_examples()`. Một storyboard `id: "farm-animals"`, `duration: 16`, 4 cảnh × 4 s, **tổng ≤ 20 nhân vật**:

1. Đồng cỏ: bò `graze` bụi cỏ, dê đi ngang, thỏ `hop`.
2. Vườn hoa: hoa sen/hồng/cúc lớn dần (`grow`), bướm `pollinate` hoa hồng, ong `fly`.
3. Vườn quả: nông dân nữ `reach` + `grip` quả xoài, `release` vào thùng gỗ; dâu tây và cam đứng nói (cue).
4. Sân nhà: heo đi qua, vịt đi lạch bạch, gà con `peck` kiến, xẻng `dig` luống đất.

Mỗi cảnh set `item["index"]`, gọi `validate_story(story)`. Sau đó chạy `python3 -m bkt_web.remake_vector --build-showcase`.

---

## 5. Giai đoạn thực hiện

Mỗi giai đoạn: sửa catalog → engine → registry + test registry → trang thư viện → chạy "Kiểm tra" → chụp bảng tổng hợp và tự soi.

| Giai đoạn | Nội dung |
|---|---|
| G0 | Refactor `RIG_DRAWERS` (mục 1.7). Không thêm rig. Test phải xanh, bảng tổng hợp không đổi pixel. |
| G1 | Template `drawQuadruped` + 9 thú (2.1), chuyển `buffalo` sang template. Động tác `graze` + `grass_tuft`. |
| G2 | Template `drawBird` + 4 chim (2.2), chuyển `chicken`. Côn trùng/ếch (2.3). Động tác `hop`, `fly`. |
| G3 | 17 trái cây (2.4). |
| G4 | Template `drawFlower` + 10 hoa (2.5), anchor `bloom` cho sunflower. Động tác `pollinate`. |
| G5 | Dụng cụ + đạo cụ (2.6). Động tác `dig`. |
| G6 | Mẫu `farm-animals` (mục 4), build showcase, cập nhật `AGENTS.md` (1–2 câu vào mục vector library), bump version engine + `?v=`. |

---

## 6. Kiểm tra (chạy sau mỗi giai đoạn)

```bash
node --check bkt_web/static/remake_vector_engine.js
python3 -m unittest discover -s tests -p test_remake_vector.py
python3 -m unittest discover -s tests -p test_capability_registry.py
for t in test_asset_manifest test_native_vector_bridge test_render_router test_storyboard_migration test_remake_pipeline; do python3 -m unittest discover -s tests -p "$t.py"; done
python3 -c "from bkt_web.remake_vector import sample_stories as s; n=sum(len(x['characters']) for x in s()); print(n); assert n <= 96"
python3 -c "
import json; c=json.load(open('bkt_web/static/remake_vector_catalog.json'))
for k,a in c['actions'].items():
    for r in ('actor','target'):
        for x in a[r+'s']:
            assert a.get(r+'_anchor') is None or a[r+'_anchor'] in c['assets'][x]['anchors'], (k,r,x)
for k,a in c['assets'].items():
    for need in ('root','face','top'): assert need in a['anchors'], (k,need)   # rig MỚI còn phải có 'grip' (một số rig cũ như insect/pot/face không có)
print('catalog ok', len(c['assets']), 'assets', len(c['actions']), 'actions')"
```

### Soi bằng mắt — bảng tổng hợp
Tạo script ngoài repo (thư mục tạm), chạy `python3 -m http.server` trong `bkt_web/`, mở `/static/remake_vector_library.html` bằng Playwright, rồi:
- tắt ô cel: `document.getElementById('cels').click()` (mặc định đã tắt; chỉ click nếu `vectorShowcase.renderer.cels` là true);
- với mỗi rig: `page.evaluate("tab='assets'; select('<id>')")`, `page.evaluate("stop()")`, `vectorShowcase.seek(t)` ở t = 0.6 / 2.0 / 3.2 / 5.0, chụp `#stage`;
- ghép lưới bằng Pillow (ô 216×384), soi từng rig.

Tiêu chí mắt thường cho **mỗi** rig:
- đọc ra ngay là con gì/quả gì/hoa gì ở cỡ ô 216×384;
- viền đều, có khối sáng tối, không mảng phẳng; không lộ khe giữa chi và thân;
- mặt nằm trên đầu/thân (không trôi ra ngoài); nháy mắt và khẩu hình chạy (ảnh t=5.0 đang nói);
- đang đi thì chân đổi pha, quay đầu đúng hướng; con bay không có bóng; con đứng đất có bóng;
- `grow`: ảnh growth 0.1 và 1.0 khác rõ (nụ → hoa nở; xanh → chín);
- demo từng động tác mới trong tab Động tác: actor chạm đúng anchor của target.

---

## 7. Định nghĩa hoàn thành

- [ ] Khoảng **+60 rig** mới (9 thú, 4 chim, 6 côn trùng/ếch, 17 quả, 10 hoa + bụi cỏ, 4 dụng cụ, 11 đạo cụ) có trong catalog, hiện trong tab Nhân vật, tự chuyển động trong trang thư viện.
- [ ] 5 động tác mới (`graze`, `pollinate`, `dig`, `hop`, `fly`) có demo trong tab Động tác.
- [ ] Mẫu `farm-animals` trong tab Mẫu; `remake_vector_examples.json` đã build lại.
- [ ] Mọi lệnh ở mục 6 xanh; tổng nhân vật showreel ≤ 96.
- [ ] Registry khai báo đúng trạng thái; test registry cập nhật khớp.
- [ ] Không đổi: hình của 48 rig cũ (trừ buffalo/chicken chuyển template nhưng giữ dáng), nền, `face()`, cel, validator IK.
- [ ] Engine bump version (`1.11.0`), trang thư viện `?v=1.11.0`; `AGENTS.md` cập nhật.
- [ ] Không deploy, không restart server; báo lại danh sách file đã sửa và kết quả test.
