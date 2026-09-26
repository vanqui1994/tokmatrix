# Compare Studio

Bảng điều khiển chạy trên máy (localhost) để quản lý các video trong `videos/`.
Xem danh sách, phát bản render, đọc kịch bản 12 dòng kèm timing, và chạy
`check` / `render` / sinh lại VO ngay trên web với log trực tiếp.

## Chạy

```bash
cd studio
npm install     # lần đầu
npm start       # build frontend rồi mở server ở http://localhost:4321
```

Khi sửa giao diện thì dùng chế độ dev (Vite HMR, proxy API sang server):

```bash
npm run dev     # UI: http://localhost:5173 — API: http://localhost:4321
```

Đổi cổng: `PORT=5000 npm run server`.

## Kiến trúc

| Phần | Chỗ nào | Ghi chú |
| --- | --- | --- |
| API + phục vụ file tĩnh | `server/index.mjs` | Node http thuần, **không dependency** |
| Giao diện | `src/` | Vite + React + Tailwind v4, primitive kiểu shadcn tự viết |

Server đọc trực tiếp từ thư mục `videos/<slug>/`, không có database:

- `scripts/generate-vo.mjs` → `VIDEO_LANG` và 12 dòng lời đọc
- `index.html` → caption trên màn hình, bảng `VO` (start/dur), `ROOT_DURATION`
- `assets/vo/durations.json` → thời lượng audio thật
- `renders/*.mp4` → bản render mới nhất (phát kèm HTTP range để tua được)
- `snapshots/contact-sheet.jpg` → lưới khung hình
- `BRIEF.md` → frontmatter (`message`, `language`)

## API

| Method | Đường dẫn | Việc |
| --- | --- | --- |
| GET | `/api/videos` | Danh sách video kèm trạng thái |
| GET | `/api/videos/:slug` | Chi tiết + kịch bản + timing |
| GET | `/api/videos/:slug/render` | Stream MP4 mới nhất |
| GET | `/api/videos/:slug/snapshot` | Contact sheet |
| POST | `/api/runs` | Chạy `{ slug, task }`, task ∈ `check` \| `render` \| `vo` \| `fit` |
| GET | `/api/runs/:id/stream` | Log dạng SSE (gửi lại phần đã có rồi stream tiếp) |
| POST | `/api/runs/:id/stop` | Gửi SIGTERM cho tiến trình |

## Tạo video mới

Studio không tạo video. Việc đó làm qua chat: Claude viết kịch bản 12 dòng, cho qua skill
`humanizer`, rồi chạy `tools/create-video.mjs` (xem `.claude/skills/create-video/SKILL.md`
mục 1c). Hình cho 2 vật thể truyền bằng `--icon-left` / `--icon-right`, nhận ảnh hoặc file SVG.
Xong thì bấm **Tải lại** trong studio, video mới hiện ngay trong danh sách.

## Khớp thời lượng

Ô **Thời lượng mục tiêu** đổi tốc độ đọc TTS rồi sinh lại VO và tính lại timing cho tới khi
clip rơi đúng con số (sai số 0.3s). Không kéo giãn khoảng nghỉ — `DESIGN.md` cấm, vì nó phá
nhịp fast-cut. Nếu tốc độ chạm giới hạn 0.85-1.5 mà vẫn chưa tới, tool dừng và báo phải
thêm/bớt câu.

## Giới hạn có chủ đích

- **Không phụ thuộc dịch vụ ngoài** — không API key, không tài khoản. Chỉ Edge TTS gọi mạng.
- **Chỉ chạy các lệnh cố định** (`check`, `render`, sinh VO, khớp thời lượng) trên slug khớp
  `[a-z0-9-]+` và phải tồn tại trong `videos/`. Không có đường nào để chạy lệnh
  tuỳ ý từ trình duyệt.
- **Không xác thực, không CORS** — app này chỉ để chạy localhost. Đừng expose ra
  internet.
- **Không sửa file**: studio chỉ đọc và chạy lệnh. Sửa kịch bản vẫn làm trong
  `scripts/generate-vo.mjs`, và nhớ tính lại timing vì đổi chữ là đổi thời lượng
  audio (xem skill `create-video` bước 3-4).
- Mỗi video chỉ chạy một lệnh tại một thời điểm (gọi trùng trả về HTTP 409).

## Thiết kế

Dùng đúng bảng màu retro ấm của series (`../DESIGN.md`) và cùng cặp font
(Be Vietnam Pro + JetBrains Mono). Chữ dùng các biến thể `*-ink` để đạt WCAG AA
trên nền kem — giống hệt lý do trong video. Trạng thái tab và video đang chọn
lưu vào URL (`?v=<slug>&tab=<tab>`) nên chia sẻ link và nút Back đều hoạt động.
