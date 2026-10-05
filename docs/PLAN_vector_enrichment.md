# Plan: làm giàu thư viện vector cho engine video `vector`

Engine `vector` (docs/PLAN_vector_video_engine.md) đã chạy được, nhưng thư viện vẽ được ít thứ mà các chủ đề
thật của Autopilot nói tới. Plan này đo chỗ thiếu bằng dữ liệu và chia việc theo gói, giao Gemini từng nhóm như
các giai đoạn trước.

**Thị trường: de, us, kr, jp.** Không làm cho thị trường Việt. Mỗi video là của một nước: không dùng chung một
kịch bản/hình giữa các nước.

## 1. Đo hiện trạng

Thước đo: một chủ đề trong `compare_studio/config/topics/<niche>.txt` "được phủ" khi lời của nó nhắc tới ít nhất
một vật thể niche đó vẽ được (nhãn trong `config/vector_niches.json`). Đo ngày 05/10/2026:

| Niche | Nền | Vật thể | Chủ đề được phủ | Thiếu nhiều nhất |
|---|---|---|---|---|
| deep_space | 4 | 15 | 14/35 | hố đen, sao neutron, thiên hà, kính viễn vọng, tàu thăm dò Voyager, Sao Diêm Vương, sao chổi đâm |
| extreme_wildlife | 6 | 18 | 8/35 | sư tử, hổ, cá mập trắng, cá voi sát thủ, hà mã, gấu Bắc Cực, tôm tít, gấu nước, kỳ giông axolotl, chim cắt, lươn điện |
| medical_anomalies | 8 | 12 | 7/30 | gan, ruột thừa, dây thần kinh, vân tay, vắc-xin, sốt, xương gãy, giấc ngủ, trí nhớ |
| ocean_mysteries | 4 | 9 | 4/35 | mực khổng lồ, cá nhà táng, rãnh Mariana, tàu ngầm/tàu lặn, miệng phun thuỷ nhiệt, sóng dữ, dòng hải lưu, Titanic (tàu chung, không tên) |
| ancient_mythology | 7 | 10 | 0/30 | thần thoại Hy Lạp/Bắc Âu/Ai Cập/Nhật/Hàn: lửa của Prometheus, cây thế giới, búa sấm, cán cân trái tim, mê cung, rắn tám đầu, ngựa gỗ thành Troy |
| lost_civilizations | 7 | 10 | 1/30 | Göbekli Tepe, Machu Picchu, Angkor, Petra, đường Nazca, đội quân đất nung, cơ cấu Antikythera, thành ngầm Derinkuyu |
| folklore_legends | 3 | 13 | 2/30 | yêu quái/hồn ma dân gian bản thân thiện: kitsune, gumiho, dokkaebi, yuki-onna, Krampus (bản trẻ em), golem, đèn ma trơi |
| unsolved_mysteries | 5 | 9 | 0/30 | bản thảo mật mã, máy bay mất tích (chung), tín hiệu Wow, tàu ma, đảo/giếng kho báu, ngọn hải đăng bỏ hoang |
| extreme_survival | 7 | 10 | 2/30 | máy bay rơi trong rừng, hang ngập, tàu băng, bè cứu sinh, tuyết lở, núi cao, hầm mỏ, sa mạc |
| mega_catastrophes | 6 | 9 | 1/30 | thiên thạch, sóng thần, siêu núi lửa, động đất, hoả hoạn thành phố, bão bụi, sương độc khói, dịch bệnh (bản không ghê) |
| tech_ai_future | 5 | 8 | 2/35 | robot, chip, máy chủ, cáp biển, vệ tinh GPS, pin, tấm pin mặt trời, xe tự lái, máy tính lượng tử (tất cả không logo) |

Bảy niche chưa phục vụ: `dark_psychology`, `economy_empires`, `forbidden_experiments`, `geopolitics_maps`,
`infamous_figures`, `military_arsenal`, `philosophy_paradox`.

Mục tiêu: **mỗi niche đã phục vụ ≥ 70 % chủ đề được phủ**, đo lại bằng tool ở §5.

## 2. Nguyên tắc nội dung

1. Không chữ, không logo, không cờ, không thương hiệu (iPhone/Tesla/ChatGPT → điện thoại, xe điện, khung chat chung).
2. Không vẽ người thật (Amelia Earhart, Phineas Gage, Shackleton…): dùng chibi chung theo nghề (phi công, thợ mỏ,
   nhà thám hiểm) — lời đọc kể chuyện, hình minh hoạ vai.
3. Không máu, không ghê, không kinh dị: tai nạn/thảm hoạ vẽ bằng hệ quả (khói, nước dâng, cảnh cứu hộ), quái vật
   dân gian là bản đáng yêu (như `body_world`).
4. Thần thoại/dân gian theo văn hoá gốc, không chế giễu tôn giáo; thần là nhân vật chibi đội mũ/áo đặc trưng,
   không vật thờ cúng thật.
5. Rig mới theo hợp đồng thư viện: gói trong `remake_vector_packs/`, `register` chỉ thêm, đo lại
   `remake_vector_extents.json`, không đổi pixel rig cũ, có `label` tiếng Anh dùng cho từ khoá.
6. Không dùng nhóm `monster` (engine luôn vẽ huy hiệu chữ); quái vật mới đặt nhóm `animal`/`creature`.

## 3. Nâng engine (làm trước, mọi niche đều lợi)

| # | Việc | Vì sao |
|---|---|---|
| E1 | Beat `versus`: hai vật thể hai bên, người dẫn ở giữa, thanh so sánh không chữ (độ dài, cân nặng bằng hình) | 30 chủ đề có dạng "A vs B" (wildlife, space, ocean, tech) — hiện chỉ hiện được một vật |
| E2 | Beat `scale`: vật thể lớn dần / đặt cạnh người để so cỡ (cá voi xanh vs xe buýt) | chủ đề "lớn nhất / sâu nhất / cao nhất" |
| E3 | Beat `cutaway`/`zoom_in`: phóng vào phần bên trong (núi lửa, tim, Trái Đất, máy) dùng `cutaway` có sẵn | chủ đề "bên trong…", "how … works" |
| E4 | Beat `journey`: vật thể đi theo đường cong qua khung (rùa di cư, tàu thăm dò, sóng thần) | chủ đề hành trình, lan truyền |
| E5 | Nhãn đa ngôn ngữ cho vật thể (`labels: {de, en, ko, ja}`) để storyboard dự phòng khớp từ khoá cả khi lời không phải tiếng Anh | hiện dự phòng của de/ko/ja gần như luôn "none" |
| E6 | Nhiều vật thể một cảnh (tối đa 3, slot trên/giữa) | đàn thú, hệ hành tinh, bộ đồ sinh tồn |
| E7 | Tool đo phủ chủ đề (§5) + test giữ mức phủ không tụt | thước đo của plan |

## 4. Gói rig/nền mới theo nhóm (giao Gemini)

Mỗi nhóm: rig + nền + mục `vector_niches.json` (subjects/settings, `settings` gợi ý) + test hình học + contact sheet.

| Nhóm | Gói | Rig (≈) | Nền (≈) | Niche hưởng |
|---|---|---|---|---|
| R1 | `space_deep` | hố đen (đĩa bồi tụ), sao neutron, thiên hà xoắn, tinh vân, kính viễn vọng không gian (chung), tàu thăm dò kiểu Voyager (không cờ), Sao Diêm Vương, tiểu hành tinh, sao băng — 10 | `deep_space_view`, `observatory_night` — 2 | deep_space, mega_catastrophes |
| R2 | `wildlife_apex` | sư tử, hổ, báo đốm, cá mập trắng, cá voi sát thủ, hà mã, gấu Bắc Cực, tê giác, chim cắt, cú tuyết — 10 | `savanna`, `arctic_ice`, `open_ocean_surface` — 3 | extreme_wildlife, ocean |
| R3 | `wildlife_weird` | tôm tít, gấu nước (tardigrade), axolotl, cá mập Greenland, lươn điện, bọ cánh cứng bombardier, ếch gỗ, chuột chũi trụi lông, cá phun nước, nhạn biển Bắc Cực — 10 | `micro_world` (giọt nước phóng to) — 1 | extreme_wildlife |
| R4 | `deep_ocean` | mực khổng lồ, cá nhà táng, tàu lặn sâu (bathyscaphe), tàu ngầm nghiên cứu, miệng phun thuỷ nhiệt, giun ống, tàu khách chìm (chung, không tên), sóng dữ, cá phát sáng đàn — 9 | `trench_floor`, `hydrothermal_field`, `stormy_sea` — 3 | ocean_mysteries |
| R5 | `myth_world` | chibi thần theo trang phục (Hy Lạp, Bắc Âu, Ai Cập, Nhật, Hàn — không mặt người thật), cây thế giới, búa sấm, cán cân + lông vũ, mê cung, ngựa gỗ, rắn tám đầu (đáng yêu), chiếc bình Pandora, thuyền mặt trời, đuốc Prometheus — ≈14 | `olympus_clouds`, `asgard_bridge`, `duat_river`, `takamagahara`, `underworld_river` — 5 | ancient_mythology |
| R6 | `ancient_sites` | Machu Picchu, đền Angkor, mặt đá Petra, hình Nazca (nhìn trên cao), đội quân đất nung (2–3 tượng), cơ cấu Antikythera, cột Göbekli Tepe, thành ngầm (mặt cắt), cuộn sách thư viện — 9 | `andes_terraces`, `jungle_temple`, `rock_canyon` — 3 | lost_civilizations, unsolved |
| R7 | `folk_spirits` | kitsune, gumiho (đáng yêu), dokkaebi + gậy, yuki-onna (bản trẻ em), Krampus (bản ngộ nghĩnh), golem đất sét, đèn ma trơi, selkie (hải cẩu), người khổng lồ núi Rübezahl, rồng đỏ Wales (không cờ) — 10 | `misty_forest_night`, `rhine_cliff`, `korean_mountain_night` — 3 | folklore_legends |
| R8 | `mystery_props` | bản thảo mật mã (ký hiệu trừu tượng, không chữ thật), máy bay hai động cơ chung, tàu buồm ma (trống), hải đăng bỏ hoang, rương/giếng kho báu, đĩa đất nung xoắn ốc, ăng-ten radio thiên văn, la bàn, bản đồ kho báu không chữ — 9 | `foggy_harbor`, `radio_telescope_field` — 2 | unsolved_mysteries |
| R9 | `survival_scenes` | máy bay nhỏ rơi trong rừng (không cháy), bè cứu sinh, tàu phá băng kẹt băng, lều tuyết, mũ thợ mỏ + đèn, dây thừng leo núi, bình oxy, gậy dò tuyết lở, đèn pháo sáng — 9 | `jungle_crash_site`, `antarctic_camp`, `mine_tunnel`, `mountain_peak`, `desert_noon` — 5 | extreme_survival |
| R10 | `disaster_scenes` | thiên thạch rơi, sóng thần (lớp sóng lớn), siêu núi lửa (miệng rộng), vết nứt động đất, cột khói, bão bụi, đèn cảnh báo, xe cứu hộ, bao cát chống lũ, virus bản hoạt hình — 10 | `coastal_town`, `ash_sky_city`, `dust_bowl_farm` — 3 | mega_catastrophes |
| R11 | `tech_future` | robot hình người thân thiện, chip, máy chủ, cáp quang biển, vệ tinh GPS, pin lithium (mặt cắt), xe điện tự lái (không logo), máy tính lượng tử, khung chat AI không chữ, ăng-ten 5G/6G — 10 | `data_center`, `smart_city`, `chip_fab_clean_room` — 3 | tech_ai_future |
| R12 | `body_more` | gan (tái sinh), ruột thừa, dây thần kinh, vân tay, vắc-xin + kháng thể, nhiệt kế sốt, xương gãy + bột bó, não đang ngủ, tế bào nhớ — 9 (bổ sung `body_world`/`medical`) | `sleep_lab` — 1 | medical_anomalies |

Tổng ≈ 120 rig, ≈ 34 nền.

## 5. Bảy niche chưa phục vụ

| Niche | Quyết định | Cách làm |
|---|---|---|
| economy_empires | **Làm** (nhóm R13) | đồng xu, chồng tiền chung, tàu buôn, lạc đà con đường tơ lụa, chợ, nhà máy, biểu đồ cột không số, cân — tái dùng `inventions`, `ancient` |
| philosophy_paradox | **Làm** (R14) | đạo cụ trừu tượng: thuyền Theseus (thay từng tấm ván), con mèo trong hộp, rùa và Achilles, bóng trong hang, xe điện đường ray (bản không người bị hại) |
| geopolitics_maps | **Chưa** | cần bản đồ có biên giới thật → dễ sai/nhạy cảm; engine `chalk` đang làm |
| dark_psychology | Không | chủ đề thao túng/tâm lý tối — hoạt hình chibi dễ thành tầm thường hoá |
| forbidden_experiments | Không | thí nghiệm trên người, nạn nhân thật |
| infamous_figures | Không | người thật, tội ác |
| military_arsenal | Không | vũ khí — trái quy tắc "không vũ khí" của thư viện |

## 6. Đo và kiểm thử

- Tool `python3 -m bkt_web.vector_video coverage [--niche n]`: đếm chủ đề được phủ (nhãn đa ngôn ngữ, so nguyên từ),
  in chủ đề chưa phủ. Test: mức phủ mỗi niche không tụt dưới mốc đã ghi (`tests/data/vector_coverage.json`).
- Mỗi nhóm R: `PackContractTest` (rig đăng ký đúng, catalog khớp), regression hash (rig mới có mốc, rig cũ không đổi),
  `problems()` sạch, quét 264 tổ hợp + fuzz 300 storyboard vẫn 100 % qua QA, contact sheet mở bằng mắt.
- Video mẫu: mỗi nhóm 1 video/nước bằng `tools/vector-sample.mjs`, **mỗi nước một chủ đề khác nhau**.

## 7. Lộ trình

| Bước | Việc | Xong khi |
|---|---|---|
| 1 | E5 nhãn đa ngôn ngữ + E7 tool đo phủ (tôi làm) | có số phủ tự động |
| 2 | E1 versus + E2 scale (tôi làm) | 30 chủ đề "A vs B" dựng được hai vật thể |
| 3 | R2, R4, R1 (động vật, đại dương, vũ trụ — niche đông kênh nhất) | 3 niche ≥ 70 % |
| 4 | R5, R6, R7, R8 (thần thoại, văn minh, dân gian, bí ẩn) | 4 niche ≥ 70 % |
| 5 | R9, R10, R11, R12 + E3, E4, E6 | tất cả niche ≥ 70 % |
| 6 | R13, R14 (economy, philosophy) | 2 niche mới vào `vector_niches.json` |
