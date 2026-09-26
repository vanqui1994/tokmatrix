# Analyzer chạy trên file thật (UV-801)

Module: `bkt_web/analysis_probe.py` · Tests: `tests/test_analysis_probe.py` · Sinh ra: [Analysis Result v1](ANALYSIS_RESULT.md)

UV-301 dựng hợp đồng adapter và bộ chuẩn hoá; mọi thứ nạp vào đó tới giờ đều là fixture. Đây là những analyzer đầu tiên nhìn vào **file thật**.

```python
result = analyse_media("clip.mp4", transcription=pipeline_transcription)
result.document      # AnalysisResultV1 đã validate
result.failures      # analyzer nào không ra được gì, vì sao
```

| Thành phần | Việc |
|---|---|
| `probe_source(path)` | ffprobe → `source` block: sha256 nội dung file, media type, kích thước, fps, duration |
| `FfmpegShotAdapter` | ffmpeg scene-detect → điểm cắt → giao cho `ShotBoundaryAdapter` của UV-301 phân hoạch |
| `TranscriptionAdapter` | chuẩn hoá output ASR **sẵn có của pipeline** thành transcript + audio_event |
| `analyse_media(path)` | chạy cả hai qua `run_analysis()` |

## ASR không nằm ở đây — và đó là cố ý

`TranscriptionAdapter` nhận đúng cái dict mà `remake_pipeline.step2_transcribe()` đã tạo:

```python
{"language": "vi", "segments": [{"start": 0.2, "end": 0.9, "text": "…"}]}
```

Nó **không** tự chạy Faster-Whisper. Một engine nhận dạng giọng nói trong hệ thống, không phải hai; nếu ASR đổi thì chỉ đổi một chỗ. Hệ quả cần biết: `analyse_media()` chạy một mình chỉ ra **shot**, muốn có transcript thì phải truyền `transcription=` vào.

Nhãn `speaker` theo từng segment thắng nhãn mặc định; `language: "auto"` được **bỏ trống** chứ không khai bừa một ngôn ngữ.

## Ba tính chất được giữ

**Timestamp nguyên văn.** `showinfo` in `pts_time:1.2345678`; đúng số float đó thành thời điểm cắt, không làm tròn, không snap về lưới frame. Transcript cũng vậy — có test so sánh bằng nhau tuyệt đối.

**Offline mặc định.** Chỉ nhận đường dẫn cục bộ: URL và `..` bị từ chối trước khi chạm ffmpeg. ffmpeg được gọi với `-nostdin` trên một file argument, không bao giờ nhận URL.

> ⚠️ Giới hạn thật: socket guard của `run_analysis` chỉ chặn được mạng **trong tiến trình**, không police được subprocess. Bảo đảm ở đây là **không có URL nào được truyền cho ffmpeg**, chứ không phải ffmpeg bị cấm mạng.

**Thiếu công cụ là failure có ghi nhận, không phải crash.** Máy không có ffmpeg → analyzer shot báo `unavailable`, transcript vẫn vào document, và analyzer hỏng vẫn được khai trong `analyzers` nên lỗ hổng nhìn thấy được.

## Mã lỗi

`ProbeError` là `AdapterError` nên `run_analysis` ghi nhận bình thường: `unavailable` (thiếu ffmpeg/ffprobe), `unsupported_media` (URL, traversal, file không phải media, không có duration), `internal_error` (ffmpeg chạy lỗi, JSON hỏng), `low_quality_input` (transcription rỗng).

## Test

21 test, không cái nào skip trên máy có ffmpeg. Phần parser (`parse_scene_times`) là hàm thuần nên chạy ở mọi nơi; phần file thật dựng clip tổng hợp bằng ffmpeg (đỏ 1s → xanh 1s, một điểm cắt thật) trong thư mục tạm — **không dùng media riêng tư của người dùng**. Có test chặn `socket.connect` để chứng minh không gọi mạng, và một test compile tiếp document ra storyboard 2 scene.

## Giới hạn

- Dò cảnh chỉ bắt **cắt cứng**; hoà hình/mờ dần cần ngưỡng khác hoặc analyzer khác.
- `threshold` mặc định 0.35 chưa được hiệu chỉnh trên dữ liệu thật — cần benchmark (UV-807) rồi chốt lại.
- Chưa có analyzer cho OCR, track, pose, camera; cổng đã mở, chỉ cần cắm thêm adapter.
