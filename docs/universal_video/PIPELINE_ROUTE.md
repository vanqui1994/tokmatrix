# Cổng đánh giá đường tự động (UV-802)

Module: `bkt_web/pipeline_route.py` · Tests: `tests/test_pipeline_route.py` · Nối vào: `remake_pipeline.run_all()`

Mắt nối giữa tầng phân tích v2 và pipeline production. Chạy `analyse_media` → `compile_storyboard` → `direct` → `route_storyboard` rồi trả về một **phán quyết kèm lý do cụ thể**, thay cho một chữ "không".

```python
verdict = assess_source("clip.mp4", transcription=asr_output)
verdict.ok            # có tự dựng được không
verdict.reason_codes  # vì sao không
verdict.summary()     # một dòng cho người dùng
verdict.as_dict()     # vào review.json
```

## Ba cái bẫy cổng này chặn

Cả ba đều **phát hiện khi nối thật**, không phải suy đoán lúc thiết kế.

### 1. `routable` không đồng nghĩa với dựng được

Storyboard do UV-304 compile cố ý để `render_requirements` **rỗng** — không bịa yêu cầu là đúng. Nhưng router lấy requirement làm cổng cứng, nên **không có gì để trượt**: nó chọn renderer điểm cao nhất rồi tuyên bố `routable`.

Requirement rỗng nghĩa là *chưa kiểm gì*, không phải *đã đạt hết*. → `NO_FIDELITY_REQUIREMENTS`

### 2. Renderer điểm cao nhất cho nguồn mới là footage-composite

Chạy thật trên ví dụ agriculture: router chọn `footage-composite-v1` cho cả hai scene, status `selected`, plan `routable`. Đó là adapter **phát lại chính footage nguồn**.

Nếu tin router, mọi video mới sẽ "tự động remake" bằng cách chiếu lại video gốc — đúng thứ cả chương trình tồn tại để ngăn. Cổng phát hiện qua `features.source_media_reuse` khai trong registry, nên không phải hard-code tên renderer nào. → `SOURCE_MEDIA_REUSE_NOT_APPROVED`

Chỉ `allow_source_media_reuse=True` (một người thật quyết định) mới qua được.

### 3. Lời thoại bị bỏ trong im lặng

ASR không có nhãn speaker → compiler bỏ câu thoại đó (đúng, vì dialogue cần speaker). Nhưng nếu cổng không nói gì, pipeline sẽ dựng một video **mất sạch lời thoại** mà vẫn coi là tự động thành công. → `COMPILED_WITH_SKIPPED_OBSERVATIONS`

## Các mã lý do

| Mã | Khi nào |
|---|---|
| `ANALYSIS_FAILED` | không phân tích / compile / route được nguồn |
| `NO_FIDELITY_REQUIREMENTS` | storyboard chưa khai yêu cầu nào nên router chưa kiểm gì |
| `SOURCE_MEDIA_REUSE_NOT_APPROVED` | route dùng lại media nguồn mà chưa ai duyệt |
| `RENDERER_CANNOT_DRAW_SCENE` | router chọn native-vector nhưng [bridge](NATIVE_VECTOR_BRIDGE.md) báo còn thiếu |
| `ROUTE_NEEDS_REVIEW` | chính router trả `needs-review` |
| `COMPILED_WITH_SKIPPED_OBSERVATIONS` | compiler bỏ quan sát không neo được |
| `ASSET_NEEDS_REVIEW` | ít nhất một entity không có asset đúng semantic; verdict kèm `asset_gaps` và tên entity |

## Nối vào pipeline

Đúng ba chỗ sửa trong `remake_pipeline.py`, tất cả nằm trong nhánh **đã có sẵn** của `run_all()` khi không có kịch bản duyệt:

1. `assess_automatic_route()` — method mới, bọc kín trong `try/except`;
2. `review.json` nhận thêm khoá `automatic_route`;
3. project record nhận thêm `route_status` và `route_reason_codes`.

Hành vi cũ **không đổi**: vẫn `needs_review`, vẫn không TTS, vẫn không fallback footage — chỉ khác là lý do giờ cụ thể thay vì một câu chung chung. 20 test pipeline cũ xanh nguyên.

Cổng **chỉ đọc và phán quyết**: không render, không gọi TTS, không sửa storyboard, không tự duyệt việc dùng lại media nguồn. Nếu tầng v2 hỏng, nó trả `ANALYSIS_FAILED` chứ không được phép làm hỏng đường kịch bản đã duyệt — có test riêng cho điều đó.

## Còn thiếu gì để cổng nói "ok"

- **UV-803**: đường frame → MP4 cho renderer v2. Hiện dù cổng gật, pipeline vẫn dừng ở `needs_review` vì chưa có gì để dựng ra video.
- Asset mới vẫn cần được duyệt/thêm vào catalog (hoặc generated/source fallback được phê duyệt); UV-805 đã biến thiếu hụt này thành gap có tên entity thay vì tự thế bằng asset gần giống.
- Compiler cần sinh `render_requirements` thật (hoặc director gắn vào) để `NO_FIDELITY_REQUIREMENTS` biến mất một cách chính đáng.
