# Draw-list → frame → MP4 (UV-803)

Module: `bkt_web/frame_exporter.py` · Tests: `tests/test_frame_exporter.py`

Năm adapter v2 sinh `frame_mode="draw-list"` nhưng **không adapter nào biến draw-list thành pixel**, nên trước task này không có đường nào ra video. Module này đóng mắt đó.

```python
adapter = get_adapter("motion-graphics-v1")
compiled = adapter.compile(scene, canvas="9:16")
result = export_scene_to_mp4(adapter, compiled, "scene.mp4", fps=30)
result.frames, result.duration_seconds, result.warnings
```

## Không dùng trình duyệt

Đường v1 phải mở Chromium vì template của nó là HTML. Draw-list thì chỉ gồm primitive hình học, nên raster thẳng trong Python bằng Pillow:

- **tất định hơn** — không phụ thuộc phiên bản Chromium;
- **không cần mạng**, không cần Playwright;
- nhanh hơn nhiều và chạy được ở mọi nơi có Pillow.

## Ba nguyên tắc, cưỡng chế bằng code

**Op lạ là lỗi, không phải bỏ qua.** Bỏ qua một op nghĩa là xuất ra frame thiếu nội dung rồi báo thành công. Op hỗ trợ: `rect`, `rect_outline`, `ellipse`, `line`, `polygon`, `text`, `dim`. Bất kỳ thứ gì khác → `FrameExportError`.

**Không dùng lại media nguồn.** `video_frame` bị từ chối thẳng kèm lý do — exporter này dựng, không phát lại. `image` cũng bị từ chối vì cần asset đã freeze (UV-805). Frame khai `source_media_usage != "none"` bị chặn ngay.

**Lỗi render là lỗi thật.** Không ghi file rỗng, không trả footage nguồn. MP4 xuất xong bị kiểm lại: file tồn tại, lớn hơn 1 KB, và thời lượng đọc bằng ffprobe phải dương. Lệch quá 10% so với dự kiến thì thêm warning `duration_drift`.

## Một điểm trung thực về chữ

Chữ vẽ bằng **font mặc định đi kèm Pillow**, không phải `font_stack` trong storyboard. Mọi lần xuất đều trả warning:

```
text_rendered_with_pillow_default_font: chữ dùng font mặc định của Pillow,
không phải font trong font_stack của storyboard
```

Để không ai nhìn video rồi tưởng typography thương hiệu đã được tôn trọng. Muốn đúng font thì phải nạp file font qua asset pipeline — việc của UV-805.

## API

| Hàm | Việc |
|---|---|
| `rasterise_frame(frame)` | một frame draw-list → ảnh Pillow, thuần và tất định |
| `frame_times(start, end, fps)` | mốc thời gian **tuyệt đối** của từng frame |
| `export_frames(adapter, compiled, folder)` | ghi PNG, mỗi frame lấy qua `render_frame(seconds)` |
| `encode_frames(folder, output, fps)` | PNG → MP4, có kiểm lại kết quả |
| `export_scene_to_mp4(...)` | cả chuỗi, trả `ExportResult` |

Frame lấy theo **thời gian tuyệt đối** nên seek lùi cho đúng ảnh cũ — có test so sánh byte của dãy tiến và dãy lùi.

## Đã chạy thật

`motion-graphics-v1` với scene 6 giây: compile → 36 frame ở 6fps → MP4 1080×1920, ffprobe xác nhận 6.0 giây. Test kiểm pixel đổi theo thời gian (mẫu `test_native_renderer_is_seek_safe_and_has_no_source_images`), xuất hai lần cho frame giống hệt nhau.

## Giới hạn

- Chỉ raster hoá op của `motion-graphics-v1` và `screen-ui-v1`. `puppet-2d` và `three-d-spike` có op riêng (`mouth`, `cursor`, `blur_rect`) chưa hỗ trợ — chúng sẽ **ném lỗi rõ ràng** chứ không vẽ thiếu.
- `footage-composite-v1` cố ý không xuất được: nó dùng lại footage nguồn.
- Chưa có audio; MP4 xuất ra là video câm. Ghép tiếng là việc của bước TTS/mix sẵn có.
- Chưa nối vào `remake_pipeline`; UV-804 sẽ gọi nó rồi đính manifest.
