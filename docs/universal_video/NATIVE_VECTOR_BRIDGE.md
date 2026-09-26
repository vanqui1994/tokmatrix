# Cầu nối sang native-vector-v1 (UV-800)

Module: `bkt_web/native_vector_bridge.py` · Tests: `tests/test_native_vector_bridge.py`

## Vấn đề

`storyboard_migration` mang một story v1 **lên** v2 rồi trả **xuống** nguyên vẹn, vì nó giữ payload gốc trong `extensions['com.ssmatool.v1:story']` và đối chiếu checksum khi lấy ra.

Một storyboard đi **chiều ngược lại** — do UV-304 compile từ analysis — không có payload đó. `restore_v1_from_v2()` từ chối nó với đúng một câu: *"Storyboard v2 không chứa payload migration v1"*. Câu đó đúng nhưng vô dụng với người gọi: nó nói **không** mà không nói **thiếu gì**.

> ⚠️ Không tồn tại bộ chuyển đổi compiled-v2 → v1. `restore_v1_from_v2` chỉ mở gói, không dịch. Đừng viết code giả định có chiều đó.

## `inspect_native_bridge(storyboard)` trả lời câu hỏi thứ hai

```python
report = inspect_native_bridge(storyboard)
report.renderable          # native-vector-v1 dựng được chưa
report.reason()            # một dòng dùng thẳng làm lý do needs_review
report.gaps                # từng thiếu sót, có JSON path
report.bindings            # entity → asset khớp được, và khớp bằng cách nào
report.unbound_entity_ids
```

Storyboard mang sẵn payload v1 → `carries_v1_payload=True`, `renderable=True`, không gap: nó tự có story native rồi.

### Sáu mã gap

| Mã | Nghĩa |
|---|---|
| `ENTITY_HAS_NO_ASSET` | entity không khớp asset nào trong catalog |
| `SCENE_HAS_NO_POSES` | không có toạ độ canvas; engine v1 **không tự bố cục** |
| `SCENE_HAS_NO_BACKGROUND` | scene chưa khai bối cảnh, hoặc preset không có trong catalog |
| `ACTION_NOT_IN_CATALOG` | action không tồn tại trong catalog |
| `ACTION_ASSET_NOT_SUPPORTED` | action có, nhưng asset đó không nằm trong `actors`/`targets` của nó |
| `ACTION_ACTOR_HAS_NO_ASSET` | chưa buộc được asset cho actor nên chưa kiểm được hỗ trợ |

### Cách buộc entity vào asset

Thử theo thứ tự: id catalog → nhãn catalog (bỏ dấu, nên `Quả cà chua` khớp `qua ca chua`) → từ cuối của nhãn quan sát (`right hand` → `hand`) → `observed_category` → `kind`.

Tên nhóm **chỉ** khớp khi nhóm đó có đúng một asset. `fruit` không được tự chọn một quả cụ thể — thà không khớp còn hơn khớp sai.

Tên action đổi `.` thành `_` khi tra catalog, vì compiler viết id bằng dấu chấm còn catalog dùng gạch dưới (`set.hook` → `set_hook`).

## `assert_round_trip_preserves_source_facts(original, restored)`

Trả về danh sách khác biệt ở những dữ kiện một bản remake **không được phép** đổi: số scene và `start_time`/`end_time` từng scene, `characters_present`, số action mỗi scene, bộ ba (speaker, thời điểm, lời thoại) của từng cue, danh sách character id, `duration`. Danh sách rỗng nghĩa là không có gì người xem nhận ra đã dịch chuyển.

Test chạy nó trên **toàn bộ** example native: `migrate_v1_to_v2` → `restore_v1_from_v2` → so sánh.

## Phát hiện khi làm task này

Action `look_at` mà UV-303 sinh ra **không có trong catalog native**. Trước đây không ai thấy vì chưa có chỗ nào đối chiếu đầu ra của tầng phân tích với đầu vào của renderer. Bridge báo nó là `ACTION_NOT_IN_CATALOG`, và có test khoá hành vi đó lại.

## Dùng ở đâu tiếp

- **UV-802**: khi router hoặc bridge nói không, `reason()` là lý do `needs_review` cụ thể thay vì thông báo chung chung.
- **UV-805**: `unbound_entity_ids` và các gap `ENTITY_HAS_NO_ASSET` chính là danh sách việc cho asset resolver.

## Giới hạn

- Bridge **chỉ đọc và báo cáo**, không sửa và không dựng gì.
- Việc buộc asset dựa trên chuỗi (id/nhãn/category), không dựa trên hình ảnh; nhãn lạ sẽ không khớp — đó là chế độ hỏng có chủ ý.
- Chỉ kiểm native-vector-v1. Năm adapter còn lại có ràng buộc khác.
