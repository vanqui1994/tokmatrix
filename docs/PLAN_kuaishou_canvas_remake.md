# Kuaishou → Canvas Remake, học vector khi thiếu

Mục tiêu: lấy video Kuaishou (profile hoặc video lẻ), dựng lại bằng thư viện vector (Canvas/native-vector), lời dịch
sang ngôn ngữ của kênh đăng (de/en/ko/ja); đối tượng nào thư viện chưa có thì tự học (tạo rig mới), không cần duyệt tay.

## A. Nguồn Kuaishou → hàng đợi remake
- `multi_downloader.kuaishou_profile(url, limit)` / `resolve_kuaishou(url)`: Chrome Kuaishou đã đăng nhập (service
  `tokmatrix-kuaishou-chrome`, CDP 9340); trang tự gọi `/rest/v/profile/feed` (có chữ ký), tool cuộn khung
  `DIV.wb-content` và đọc JSON; video lẻ đọc `__APOLLO_STATE__`.
- Downloader nhận link profile Kuaishou → mở rộng thành N video.
- Nút "Remake Canvas" trong thư viện video đã tải → `POST /api/remake/start` với `local_path` + ngôn ngữ đích.

## B. Dựng tự động
- Lời gốc tiếng Trung: Whisper → dịch sang ngôn ngữ đích → kịch bản → story vector.
- Cảnh có rig thiếu không chặn cả video: dùng rig tạm, ghi gap.

## C. Hàng đợi học vector
- Mỗi gap (`NO_ASSET_ROUTE`) → một mục trong `storage/vector_learning.db`, gộp theo đối tượng (tên chuẩn hoá),
  đếm số lần gặp, lưu khung hình gốc của đối tượng.
- Tab "Vector cần học": danh sách, trạng thái (pending / generating / ready / failed), ảnh gốc ↔ ảnh rig.

## D. Tự tạo rig
- Worker lấy mục nhiều lần gặp nhất → LLM viết rig vào pack `learned` (`remake_vector_packs/learned.js`,
  một entry `rigs[id]` + catalog asset) theo quy ước `RemakeVector.register` + `kit`.
- Kiểm tra tự động: JS hợp lệ, `register` không trùng id, vẽ không lỗi, anchors trong khung, số pixel khác nền,
  không chữ (`fillText` bị cấm), ít đỏ (§31); lỗi → LLM sửa tối đa 3 lần; vẫn lỗi → failed.
- Đạt → thêm vào catalog, cập nhật hash pixel cho rig mới, các remake đang chờ rig đó dựng lại.

## Trạng thái
- [ ] A
- [ ] B
- [ ] C
- [ ] D
