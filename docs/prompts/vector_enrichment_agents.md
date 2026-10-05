# Prompt cho các agent Gemini làm giàu thư viện vector (chạy song song)

Plan: `docs/PLAN_vector_enrichment.md`. Mỗi agent làm phần của mình trong mục "Phân việc", theo đúng mục "CHUNG".

---

## CHUNG (mọi agent đọc kỹ)

Bạn thêm rig + hình nền vector mới để engine video `vector` (Matrix/Autopilot) vẽ được các chủ đề thật trong
`compare_studio/config/topics/<niche>.txt`. Đọc trước: `AGENTS.md` (các mục "Vector engine packs", "Vector landscape",
"Matrix engine `vector`"), `docs/PLAN_vector_enrichment.md` §2, một gói mẫu tốt: `bkt_web/static/remake_vector_packs/ocean.js`,
`nature.js` (kit helper `frameSpan`, `seeded`), `scripts/update_catalog_*.py` của gói đó.

### Chạy song song — chỉ được sửa file CỦA GÓI MÌNH
Mỗi gói `<pack>` của bạn chỉ có các file:
1. `bkt_web/static/remake_vector_packs/<pack>.js` — `RemakeVector.register({ rigs, backgrounds })`.
2. `scripts/update_catalog_<pack>.py` — thêm asset/background_specs/engine_packs vào catalog **bắt buộc qua**
   `from scripts.catalog_edit import edit_catalog` (`with edit_catalog() as cat: ...`). Không đọc catalog đầu script rồi
   ghi cả file cuối script (sẽ xoá mục agent khác vừa thêm). Script chạy lại nhiều lần không đổi kết quả.
3. `compare_studio/config/vector_niches.d/<pack>.json` — subjects/hosts/buddies mới + niche nhận chúng (chỉ thêm, xem dạng dưới).
4. `tests/test_vector_pack_<pack>.py` — test riêng của gói.

KHÔNG sửa: `remake_vector_engine.js`, gói khác, `vector_niches.json`, `remake_vector_extents.json` (chỉ được sinh lại bằng
lệnh đo, xem dưới), `tests/data/vector_hashes*.json` (KHÔNG chạy `--update-hashes`), `tests/test_remake_vector.py`, `AGENTS.md`,
`docs/`, `server.py`, `app.js`, `index.html`, `style.css`, `dola_*`, `story_remake*`, `compare_studio/matrix/**`, `bkt_web/autopilot/**`.
Không commit, không deploy.

### Quy tắc nội dung (bắt buộc)
- Thị trường de/us/kr/jp. Không nội dung/rig mang dấu hiệu Việt (không nón lá, không `chibi_farmer`).
- Không chữ (không `fillText`), không logo, không cờ, không thương hiệu, không biểu tượng tôn giáo/quân sự/chính trị thật.
- Không vẽ người thật hay giống nhân vật có bản quyền. Không máu, không ghê, không kinh dị: tai hoạ vẽ bằng hệ quả; quái vật
  bản đáng yêu. Không vũ khí.
- Không dùng `group: "monster"` (engine luôn vẽ huy hiệu chữ lên nhóm đó). Thú/sinh vật: `animal`/`fish`/`bird`; vật: `prop`;
  công trình: `building`.
- Rig vẽ trong khung 100 đơn vị như rig cũ, gốc (0,0) ở chân/đáy, không vẽ ra ngoài y < −100. Cỡ hiển thị thật: ở height
  200 vật phải ≥ 60 px mỗi chiều (đo pixel, không đọc số).
- Hình nền: `ground_y: 810`, ngày/đêm + mọi weather, **vẽ đủ khổ ngang**: dùng `kit.frameSpan(settings)` vẽ trời/đất trên
  [x0, x1], phần 0–576 là thiết kế chính, phần mở rộng là cảnh riêng (không khối màu trơn hay hàng lặp > 300 px) — như các
  gói B4 (`nature.js`, `ocean.js`).
- Mỗi rig có `label` tiếng Anh trong catalog (từ khoá chính đầu tiên, vd "a lion").

### Dạng `vector_niches.d/<pack>.json`
```json
{
  "subjects": {
    "lion": { "asset": "lion", "label": "a lion", "labels": { "de": "Löwe|Löwen", "ko": "사자", "ja": "ライオン" },
              "settings": ["savanna"], "size": "m" },
    "black_hole": { "asset": "black_hole", "float": true, "label": "a black hole", "labels": { "de": "Schwarzes Loch|Schwarze Löcher", "ko": "블랙홀", "ja": "ブラックホール" }, "settings": ["deep_space_view", "space_orbit"], "size": "l" }
  },
  "hosts": { "zookeeper": { "rig": "chibi_teacher", "outfit": "pioneer" } },
  "buddies": {},
  "niches": { "extreme_wildlife": { "subjects": ["lion"], "settings": ["savanna"], "hosts": [] } }
}
```
- `float: true` cho vật bay/bơi (hành tinh, cá, chim đang bay); mặc định đứng đất.
- `size`: `s` | `m` | `l`. `settings`: nền hợp với vật thể (fallback và prompt kéo cảnh về đó).
- `labels`: các cách gọi phổ biến trong lời đọc, nối bằng `|` (tiếng Đức cả số nhiều; ko/ja không dấu cách).
- Id subject/host/buddy phải mới (trùng → loader báo lỗi).

### Xác minh (chạy, phải sạch)
```bash
python3 scripts/update_catalog_<pack>.py && python3 scripts/update_catalog_<pack>.py   # chạy 2 lần, lần 2 không đổi gì
node --check bkt_web/static/remake_vector_packs/<pack>.js
python3 -m bkt_web.vector_video extents            # đo lại kích thước rig (ghi remake_vector_extents.json)
python3 -c "from bkt_web.vector_video.niches import problems; print(problems())"   # phải []
python3 -m unittest tests.test_vector_pack_<pack> tests.test_vector_video tests.test_remake_vector tests.test_remake_vector_regression
python3 -m bkt_web.remake_vector --contact-sheet <pack> --out /tmp/<pack>_sheet.png
python3 -m bkt_web.vector_video preview --niche <niche> --lang de --channel test_<pack>_de --out /tmp/<pack>_de.jpg \
  --lines "câu 1 nhắc vật mới|câu 2|…"          # lặp cho en/ko/ja với câu khác nhau của từng nước
```
Regression: rig/nền cũ phải giữ nguyên hash; rig mới chưa có mốc là bình thường (người review thêm mốc). Nếu agent khác
đang chạy `extents`/catalog cùng lúc mà lỗi khoá, chạy lại.

Test riêng của gói (`tests/test_vector_pack_<pack>.py`) tối thiểu:
- mọi rig/nền của gói có trong catalog, đúng `pack`, có `label`; `register` không trùng id;
- vẽ từng rig ở height 200 trên nền trơn: khung bao ≥ 60 px mỗi chiều, không pixel ở y < −100 tính theo khung rig;
- mỗi nền: ngày + đêm + mưa đều vẽ được ở khổ dọc và ngang, khổ ngang không có cột 64 px một màu;
- không gọi `fillText` trong file gói (đọc mã nguồn);
- mỗi subject trong `vector_niches.d/<pack>.json` dựng được story qua `bkt_web.vector_video.cli.build` với storyboard có
  `reveal` + `point` vật đó, `qa == []`.

### MỞ ẢNH
Mở contact sheet và preview của từng niche ở cả ngày + đêm, tự kiểm: vật nhận ra được ngay, đúng tỉ lệ, không chữ, không vỡ
nét, đứng đúng đất, nền khổ ngang không có khối trơn.

### Báo cáo cuối
1. Danh sách rig + nền đã làm (id, nhãn).
2. Dòng kết quả các lệnh test chép nguyên.
3. Kết quả `problems()`, và với từng niche bạn phụ trách: số chủ đề trong `compare_studio/config/topics/<niche>.txt` có nhắc
   tới ít nhất một subject (trước → sau).
4. Mỗi rig/nền một câu mô tả thấy trên ảnh.
5. Những gì chưa làm được và vì sao.

---

## Phân việc

| Agent | Gói | Việc (xem chi tiết `docs/PLAN_vector_enrichment.md` §4) | Niche nhận |
|---|---|---|---|
| A | `space_deep`, `mystery_props` | R1 + R8 | deep_space, mega_catastrophes, unsolved_mysteries |
| B | `wildlife_apex`, `wildlife_weird` | R2 + R3 | extreme_wildlife, ocean_mysteries |
| C | `deep_ocean`, `body_more` | R4 + R12 | ocean_mysteries, medical_anomalies |
| D | `myth_world` | R5 | ancient_mythology, folklore_legends |
| E | `ancient_sites`, `folk_spirits` | R6 + R7 | lost_civilizations, unsolved_mysteries, folklore_legends |
| F | `survival_scenes`, `disaster_scenes`, `tech_future` | R9 + R10 + R11 | extreme_survival, mega_catastrophes, tech_ai_future |

Lưu ý riêng:
- A: hố đen/sao neutron là vật bay (`float`), không chữ trên tàu thăm dò, không cờ. Bản thảo mật mã chỉ ký hiệu trừu tượng.
- B: thú săn mồi không há miệng đầy máu; tôm tít/lươn điện có hiệu ứng (tia, sóng) không gây sợ.
- C: tàu khách chìm không tên, không người; gan/ruột thừa/dây thần kinh theo phong cách `body_world` (mặt chibi) và
  đúng vị trí giải phẫu khi đặt trong `body_xray`.
- D: các vị thần là chibi trang phục đặc trưng (Hy Lạp, Bắc Âu, Ai Cập, Nhật, Hàn), không vật thờ thật; rắn tám đầu đáng yêu;
  host mới theo nước qua `hosts_by_lang` (de: Bắc Âu, ja: Nhật, ko: Hàn, en: Hy Lạp/Ai Cập).
- E: di tích là công trình chung (không bản sao kiến trúc có bản quyền hiện đại); yêu quái bản trẻ em, `settings_by_lang`
  cho nền dân gian theo nước.
- F: máy bay rơi không cháy nổ, không người bị thương; robot/xe/điện thoại không logo; thảm hoạ vẽ cảnh cứu hộ.

---

## Đợt sửa 1 (review 05/10)

Chung cho mọi agent có việc dưới đây:
- Test mới `tests/test_vector_enrichment_backgrounds.py` phải qua cho nền của bạn:
  1. không lộ màu nền mặc định của engine `#c0eff1` quá 1 % khung (khổ dọc + ngang, ngày + đêm) — lỗi do trời chỉ tô tới
     một nửa còn đất bắt đầu thấp hơn, để hở dải xanh nhạt ở giữa. Tô trời/đất phủ kín [x0, x1] × [0, 1024], các lớp
     (núi, cây, nhà) chồng lên, không chừa khe;
  2. nền ngoài trời: ngày khác đêm thật (trời, ánh sáng, đèn cửa sổ) — không vẽ cùng một màu cho cả hai.
- Nhãn tiếng Anh (`label`) trong `vector_niches.d/<pack>.json` đã được người review viết lại thành tên ngắn đúng nghĩa
  (bỏ từ chủ đề nhồi vào, tên người thật, tên thương hiệu). **Không đổi lại**. Nhãn chỉ là tên vật được vẽ, không phải
  danh sách từ khoá để tăng tỉ lệ phủ.
- Không sửa file ngoài gói của mình; không commit, không deploy. Chạy:
  `python3 -m unittest tests.test_vector_enrichment_backgrounds tests.test_vector_pack_<pack> tests.test_vector_video tests.test_remake_vector`
  và MỞ ẢNH nền đã sửa (ngày + đêm, khổ ngang). Báo cáo: dòng kết quả test, mỗi nền một câu mô tả sau sửa.

| Agent | Nền phải sửa |
|---|---|
| A | `foggy_harbor`, `radio_telescope_field`: ngày = đêm → làm bản ngày sáng (sương xám sáng, trời ban ngày) |
| B | `savanna` (11 % lộ nền), `arctic_ice` (17 %) |
| C | không có lỗi nền — chỉ chạy lại test để xác nhận |
| D | `olympus_clouds` (12 %), `asgard_bridge` (14 %), `takamagahara` (17 %) lộ nền; `duat_river` (15 %), `underworld_river` (20 %) lộ nền (cảnh dưới âm phủ được phép ngày = đêm); `asgard_bridge` ngày = đêm → bản ngày có trời sáng |
| E | `andes_terraces` (7 %), `jungle_temple` (22 %), `rock_canyon` (8 %), `misty_forest_night` (25 %), `rhine_cliff` (14 %), `korean_mountain_night` (26 %) |
| F | `coastal_town` (5 %) |
