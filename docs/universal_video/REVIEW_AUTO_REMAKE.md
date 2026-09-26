# Review hệ thống Remake — Điều kiện để "remake tự động mọi chủ đề"

Ngày review gốc: 2026-09-21 (14:10)
Cập nhật: 2026-09-21 (17:21) — sau Phase 8 (UV-800→807) và Phase 9 (UV-900→903). Cập nhật lần 3.
Phạm vi: `bkt_web/` (remake pipeline Canvas/v1 + Universal Storyboard v2 trong `docs/universal_video/`).

## 0. Cách chạy lại các lệnh kiểm chứng

> ⚠️ `python3` toàn cục trên máy này hiện là **3.9.6 và không có `pydantic`**, nên mọi lệnh trong bản review gốc đã hỏng. Dùng venv của dự án:
>
> ```bash
> .venv/bin/python -m unittest discover -s tests -p test_remake_pipeline.py   # 20 PASS
> .venv/bin/python -m unittest discover -s tests -p test_remake_vector.py     # 22 PASS
> node --check bkt_web/static/app.js && node --check bkt_web/static/remake_vector_engine.js
> ```
>
> Các suite gọi engine JS cần `node` trên PATH; suite Playwright cần `.venv/bin/python -m playwright install chromium`. Toàn bộ matrix hiện là **34 suite / 688 test / 0 fail**.

Kiểm chứng kiến trúc (grep toàn `bkt_web/`, chạy lại 16:00): tầng v2 vẫn là một **cluster khép kín**. Đường production **0 import** cluster này — `remake_pipeline.py`, `remake_composer.py`, `server.py`, `remake_bridge.py` đều không import module v2 nào. Ngoại lệ duy nhất vẫn là `remake_routes.py:238-244` (GET `/renderers`) gọi `inspect_registry()` + `get_adapter()` **chỉ để liệt kê capability**, không để render.

Kết luận ngắn (cập nhật 17:21): hệ thống đã có **đường chạy tự động từ nguồn mới → compile → route → render v2 → MP4 → manifest** (Phase 9 UV-900). Pipeline tự dừng `needs_review` khi renderer không đủ capability, không fallback footage. Giới hạn: renderer v2 hiện vẽ text/shapes (motion-graphics) hoặc puppet stick-figure; chưa có renderer nhân vật/cảnh phức tạp.

---

## 1. Bản đồ kiến trúc hiện tại

### 1.1. Tầng production (đang chạy thật)

| Thành phần | File | Vai trò |
| --- | --- | --- |
| Pipeline | `bkt_web/remake_pipeline.py` | `step1..step7` + `run_all()`: analyze → transcribe → adapt script → TTS → compose → preview |
| Composer | `bkt_web/remake_composer.py` | `compose_animated_video` sinh HTML native + `window.renderFrame(seconds)`; ghi frame bằng Playwright rồi mux bằng ffmpeg → **MP4 thật** |
| Template Canvas | `bkt_web/remake_templates/*.html` | papaya, tomato, peanut, caterpillar, watermelon, sprite, universal… |
| Catalog vector | `remake_vector_catalog.json` + `remake_vector_engine.js` | **27 asset / 25 action / 9 bối cảnh**, renderer `native-vector-v1` |
| Kịch bản đã duyệt | `storage/remake_verified_scripts.json` | Khóa theo SHA-256 file nguồn |
| Routes | `remake_routes.py` | upload/start/status/projects/library/storyboard/localize/publish/renderers |
| Localization | `remake_localization.py` | Dịch cue + đóng gói voice, giữ speaker |
| Vision | `remake_vision.py` | Phân tích nguồn cho Canvas (xem §5 về trần của prompt) |

Điểm mấu chốt (đã kiểm chứng bằng test):

- Pipeline **từ chối remake** khi script chưa duyệt: `run_all()` (remake_pipeline.py:1431) đọc `load_verified_script(sha256)`, thiếu `scenes`/`characters` thì ghi `review.json` và trả `status="needs_review"` — không gọi TTS, không fallback về footage nguồn.
- Scene time và speaker là **bắt buộc**, không chia đều, không gán vòng.
- Guard fidelity chặn sửa lời thoại.

Nghĩa là **"tự động" hiện = tự động cho các chủ đề đã có kịch bản duyệt ghim theo hash nguồn**. Ngoài tập đó, hệ thống cố tình dừng ở `needs_review`.

### 1.2. Tầng Universal (v2) — đã đủ mắt xích, chưa nối production

| Thành phần | File | Trạng thái |
| --- | --- | --- |
| IR storyboard v2 | `universal_storyboard.py` + schema | Có, validate strict |
| Analysis Result v1 | `analysis_result.py`, `analysis_adapters.py` | Có |
| Entity tracking | `entity_tracking.py` | Có |
| Action + camera inference | `action_inference.py` | Có |
| **Analysis → Storyboard** | **`analysis_compiler.py::compile_storyboard`** | **Có (UV-304, thêm lúc 15:06)** |
| Interaction grammar | `interaction_grammar.py` | Có |
| Constraint solver / component runtime | `constraint_solver.py`, `component_*.py` | Có |
| Materials | `material_runtime.py` | Có |
| Router | `render_router.py::route_storyboard()` | Có, deterministic |
| Capability registry | `capability_registry.py` | Có, 6 renderer |
| Adapters | `renderer_adapters/*.py` | Có (6) |
| Auto director | `auto_director.py::direct()` | Có |
| Review workflow | `review_workflow.py` | Có |
| Migration | `storyboard_migration.py` | Có (`migrate_v1_to_v2`, `restore_v1_from_v2`, `compile_v2_to_native_vector`) |
| **Fidelity cấu trúc / hình học / thị giác-âm thanh** | **`fidelity_structural.py`, `fidelity_geometric.py`, `fidelity_visual.py`** | **Có (UV-600/601/602, 15:17–15:28)** |
| **Render manifest** | **`render_manifest.py`** | **Có (UV-603)** |
| **Benchmark / pattern library / gap prioritizer** | **`benchmark_dashboard.py`, `pattern_library.py`, `capability_gaps.py`** | **Có (UV-700/701/702)** |

**Đã nối vào production từ Phase 8/9**: `pipeline_route.py::assess_source()` (UV-802) chạy analyse → compile → direct → route. `remake_pipeline.py::_try_auto_render_v2()` (UV-900) tự render v2 khi route OK với draw-list renderer. `frame_exporter.py` (UV-803) raster hoá draw-list → PNG → MP4. `attach_render_evidence()` (UV-804) chạy fidelity + ghi manifest. `asset_generator.py` (UV-902) sinh placeholder asset khi catalog thiếu. `learning_loop.py` (UV-807) quét dữ liệu thật → dashboard → gap ranking.

---

## 2. Còn thiếu gì để remake tự động mọi chủ đề

### ~~GAP-1 — Không có bộ biên dịch "Analysis → Storyboard v2"~~ → **ĐÃ ĐÓNG (UV-304)**

`bkt_web/analysis_compiler.py::compile_storyboard(analysis, tracking=None, inference=None, *, created_at=None, project_id=None)` biến `AnalysisResultV1` (+ tracking + action/camera inference, tự suy nếu không truyền) thành `UniversalStoryboardV2` **đã qua `validate_storyboard_v2`**. 28 test tại `tests/test_analysis_compiler.py`.

Tính chất đã có test:

- không bịa: mọi entity/relation/action/audio đều mang `analysis.evidence_ids`; thứ không neo được vào `CompileResult.skipped` kèm lý do;
- giữ bất định: confidence, `review_status`, `identity_resolved`, `label_alternatives`, cộng danh sách `uncertainties`;
- scene times **explicit** từ shot observation, tile kín `[0, duration]`; nguồn không có shot thì thành một scene và **báo** `no_shot_observations_single_scene_assumed`;
- không chọn renderer: mọi scene ra `needs-review` với `renderer.unassigned`;
- tất định + không mutate input.

> ⚠️ Bản gốc grep `compile_analysis|analysis_to_storyboard|storyboard_compiler` để kết luận "không tồn tại". Pattern đó **vẫn không khớp** tên thật (`analysis_compiler.py::compile_storyboard`). Ai chạy lại đúng lệnh cũ sẽ kết luận sai.

Việc còn thiếu của mục này: **round-trip qua `storyboard_migration`** chưa có test (xem checklist A).

### GAP-2 — Chưa có renderer thực sự "tổng quát mọi chủ đề" *(một phần)*

- `native-vector-v1`: 27 asset / 25 action / 9 bối cảnh **cố định**. `frame_mode="host-callback"` — Python không rasterize.
- `motion-graphics-v1`: vẽ text/shapes/charts bằng draw-list. **UV-803 frame_exporter raster hoá + xuất MP4 thật.** Không cần catalog asset.
- `puppet-2d-v1`: stick-figure puppet với full-body IK + lip sync. **UV-901 thêm mouth op cho frame_exporter.** Deterministic.
- 3 adapter còn lại (`screen-ui-v1`, `footage-composite-v1`, `three-d-spike-v1`) sinh draw-list nhưng chưa có test MP4.

Hệ quả: chủ đề mới → router chọn `motion-graphics-v1` hoặc `puppet-2d-v1` nếu có entity character → **pipeline tự render v2** (UV-900). Chủ đề cần asset phức tạp (nhân vật cụ thể, cảnh chi tiết) → router vẫn trả `needs-review` hoặc dùng placeholder.

> Dữ kiện mới (17:21): UV-900 đã nối frame_exporter vào pipeline. Nguồn mới đi hết compile → route → nếu draw-list renderer OK → MP4 thật + manifest. Giới hạn: chưa có renderer vẽ hình ảnh ngữ nghĩa phức tạp.

### GAP-3 — Chưa có bước lấy tài sản (asset) cho chủ đề mới *(một phần — UV-902)*

`asset_resolver.py`/`asset_manifest.py` tồn tại và gắn với catalog tĩnh. UV-902 thêm `asset_generator.py::generate_placeholders()`: entity thiếu asset → sinh placeholder puppet rig (character) hoặc rect+label (object), ghi `provenance.kind = "generated"`. Placeholder sống trong scope 1 lần render, không merge vào catalog.

Giới hạn: placeholder là stick-figure/hình chữ nhật, không phải hình ảnh chi tiết. Pipeline "brief → asset AI" chưa có.

### GAP-4 — Quyết định tự động chưa nối vào pipeline → **ĐÃ ĐÓNG (UV-802, UV-900)**

`assess_automatic_route()` gọi `assess_source()` (compile → direct → route). UV-900 `_try_auto_render_v2()` tự render khi route OK.

### GAP-5 — Trạng thái task & registry trong RAM → **ĐÃ ĐÓNG (UV-806)**

SQLite `storage/remake_tasks.db`, queue + retry + idempotency theo `source_sha256`.

### GAP-6 — Phụ thuộc hệ thống ngoài *(còn nguyên, có thêm ràng buộc)*

Cần FFmpeg/ffprobe + Chromium (Playwright) cho offline frame. Thêm: **môi trường Python của máy đã trôi** — phải chạy bằng `.venv` như §0, và `node` phải có trên PATH.

### GAP-7 (mới) — Đã có bộ kiểm chứng nhưng chưa ai chạy nó trong pipeline → **ĐÃ ĐÓNG (UV-804)**

Phase 6/7 đã cung cấp fidelity tools. UV-804 `attach_render_evidence()` chạy chúng sau mỗi render và ghi manifest. UV-900 gọi `attach_render_evidence()` trong nhánh auto-render v2.

Manifest lưu cùng project (`manifest.json`) và đọc lại qua `GET /api/remake/projects/{id}/manifest`.

---

## 3. Kiến trúc đích cho "tự động mọi chủ đề"

```text
nguồn (mp4)
  → AnalysisResultV1            analysis_adapters          ✅ có
  → Tracking + Action/Camera    entity_tracking, action_inference   ✅ có
  → StoryboardCompiler          analysis_compiler          ✅ có (UV-304)
  → AutoDirector.direct()       auto_director              ✅ có · ✅ đã nối (UV-802)
  → route_storyboard()          render_router              ✅ có · ✅ đã nối (UV-802)
  → renderer adapter            renderer_adapters          ✅ có · ✅ draw-list xuất MP4 (UV-803/901)
  → frames → ffmpeg → MP4       frame_exporter             ✅ có (UV-803)
  → fidelity + manifest         fidelity_*, render_manifest ✅ có · ✅ đã nối (UV-804)
  → placeholder assets          asset_generator            ✅ có (UV-902)
  → TTS + localize + publish    remake_pipeline            ✅ có (đường v1)
```

Mấu chốt nay còn **một mắt kỹ thuật** (renderer vẽ nội dung ngữ nghĩa phức tạp — nhân vật chi tiết, bối cảnh thực tế) và cải thiện chất lượng placeholder asset.

---

## 4. Kết luận

- Hệ thống **đã có đường chạy tự động** từ nguồn mới → compile → route → render v2 → MP4 → manifest (UV-900).
- Pipeline dừng `needs_review` khi renderer thiếu capability — trung thực, không fallback footage.
- So với review 14:10: **GAP-1, GAP-4, GAP-5, GAP-7 đã đóng**. GAP-2, GAP-3 một phần.
- Giới hạn còn lại: renderer v2 vẽ text/shapes hoặc stick-figure; placeholder asset là hình đơn giản. Chủ đề cần hình ảnh phức tạp sẽ render `partial` hoặc `needs_review`.

---

## 5. Checklist bàn giao — trạng thái 16:00

Đánh dấu ✅ chỉ khi có test chứng minh, không chỉ có code.

**A. Cầu nối hiểu → dựng**

- [x] Compiler → `UniversalStoryboardV2` hợp lệ, gọi `validate_storyboard_v2` — `analysis_compiler.py::compile_storyboard`
- [x] Scene times **explicit**, không chia đều/gán vòng; thiếu shot thì báo giả định
- [x] Giữ nguyên input (immutability), có test
- [x] **Round-trip qua `storyboard_migration`** — UV-800 `native_vector_bridge` 25 test
- [x] Nhận đầu vào từ `analysis_adapters` — UV-801 `FfmpegShotAdapter` + `TranscriptionAdapter`

**B. Nối vào đường chạy production**

- [x] `remake_pipeline` gọi `compile → direct() → route_storyboard()` — UV-802 `assess_automatic_route()`
- [x] `render_plan = needs-review` → task trả `needs_review`, không TTS, không fallback footage
- [x] Test end-to-end: nguồn không có kịch bản duyệt đi hết compiler→route→`needs_review` đúng lý do — UV-903
- [x] **Route OK → tự render v2 → MP4** — UV-900 `_try_auto_render_v2()`

**C. Renderer tổng quát xuất MP4 thật**

- [x] ≥1 adapter xuất frame→MP4 — UV-803 `frame_exporter` cho `motion-graphics-v1`
- [x] Puppet-2d draw-list → frame_exporter — UV-901 thêm `mouth` op
- [x] Deterministic: không `Date.now()/Math.random()/network` trong đường render
- [ ] Renderer vẽ nội dung ngữ nghĩa phức tạp (nhân vật chi tiết, bối cảnh)

**D. Asset cho chủ đề mới**

- [x] `asset_resolver`/`asset_manifest` nối vào compiler — UV-805
- [x] Mở rộng catalog có version + test — và cập nhật `_asset_states` cùng lúc
- [x] Placeholder asset pipeline — UV-902 `generate_placeholders()` + `inject_generated_assets()`
- [ ] Asset AI (brief → hình ảnh chi tiết)

**E. Bền hoá & vận hành**

- [x] Task store bền (SQLite) — UV-806, queue + retry + idempotency
- [x] Kiểm soát FFmpeg/Chromium; lỗi render/TTS không được báo "hoàn chỉnh" — UV-804

**F. Kiểm chứng tự động**

- [x] Có bộ fidelity cấu trúc / hình học / thị giác-âm thanh, có test
- [x] Có render manifest suy claim từ bằng chứng, có test
- [x] **Pipeline thật sự chạy chúng** và đính manifest — UV-804 `attach_render_evidence()`
- [x] Manifest được lưu cùng project và đọc lại qua API — `GET /api/remake/projects/{id}/manifest`

**G. Điều kiện tuyên bố "tự động mọi chủ đề"**

- [x] Compiler chạy không cần người cho nguồn mới — UV-801 adapters
- [ ] ≥1 renderer dựng nội dung ngữ nghĩa không giới hạn catalog (hiện có placeholder)
- [x] Pipeline tự đi hết compile→route→render→video — UV-900 `_try_auto_render_v2()`
- [x] Test end-to-end trên chủ đề mới — UV-903 (7 test, "robot lau nhà")

**Ô còn trống**: renderer ngữ nghĩa phức tạp (C cuối) và asset AI (D cuối). Cả hai đều cần model sinh hình — ngoài scope hạ tầng.

Kế hoạch thực thi: **Phase 9** trong `UNIVERSAL_VIDEO_AGENT_PLAN.md` (UV-900→903 đã hoàn tất).
