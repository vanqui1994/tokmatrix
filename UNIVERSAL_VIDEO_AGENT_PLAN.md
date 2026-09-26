# Universal Video Remake Platform — Agent Execution Plan

> Trạng thái: UV-000 … UV-904 đã `[x]` (40 task). Phase 0–9 hoàn tất.  
> Cập nhật: 2026-09-21  
> Phạm vi: `bkt_web` và các test liên quan  
> Mục tiêu: mọi video đầu vào đều có một đường xử lý hợp lệ, có thể kiểm chứng và không tuyên bố remake hoàn chỉnh khi renderer không đủ khả năng.

## 1. Định nghĩa mục tiêu

“Áp dụng mọi video” không có nghĩa là ép mọi nội dung qua một renderer Canvas. Hệ thống đích phải:

1. Phân tích mọi video thành một **Universal Storyboard** chung.
2. Chọn một hoặc nhiều renderer theo capability của từng scene.
3. Có fallback trung thực khi chưa thể tái dựng một cảnh.
4. Giữ nguyên scene timing, speaker ID và các sự kiện quan trọng từ nguồn.
5. Render deterministic: cùng dữ liệu và timestamp phải cho cùng một frame.
6. Tự phát hiện lỗi về schema, contact, continuity, audio và fidelity.

Các đường xử lý hợp lệ:

```text
Video nguồn
  -> phân tích đa phương thức
  -> Universal Storyboard v2
  -> capability router
       -> native vector
       -> 2D puppet
       -> motion graphics
       -> screen/UI
       -> footage composite
       -> 3D
       -> generated media
       -> needs-review
  -> validation + fidelity report
  -> render/export
```

Không được coi việc âm thầm dùng lại footage/audio nguồn là remake hoàn chỉnh.

## 2. Baseline hiện tại

Hệ thống đang có:

- FastAPI app tại `http://localhost:8080`.
- Native Canvas renderer `native-vector-v1`.
- Catalog vector dùng chung tại `bkt_web/static/remake_vector_catalog.json`.
- Engine deterministic tại `bkt_web/static/remake_vector_engine.js`.
- Validator và showcase builder tại `bkt_web/remake_vector.py`.
- `attach_to`, named anchors, typed actions và absolute-time poses.
- Hand articulation, `grip`, `release`, articulated branches.
- Farmer arm IK, `reach` và two-hand `carry`.
- API đọc catalog và validate storyboard.
- Test vector, pipeline và Playwright Chromium smoke test.

Baseline phải tiếp tục chạy trong toàn bộ quá trình migration.

## 3. Guardrails bắt buộc cho mọi agent

### 3.1 Bảo mật

- Không đọc, in, sao chép, sửa hoặc đưa vào context các file chứa password, cookie, refresh token hay session token.
- Cụ thể: không mở `bkt_web/quy.txt`, các file tương tự trong Documents, storage credentials hoặc browser profiles.
- Không dùng credential thật làm fixture.
- Fixture bắt buộc dùng token giả rõ ràng như `TEST_TOKEN_DO_NOT_USE`.
- Nếu phát hiện secret trong source control, chỉ báo đường dẫn và loại secret; không lặp lại giá trị.

### 3.2 Tương thích và dữ liệu nguồn

- Không phá `native-vector-v1` khi xây v2.
- Giữ explicit source scene times và speaker IDs.
- Không chia đều duration và không gán speaker theo vòng lặp.
- Reviewed scripts vẫn keyed theo SHA-256 nguồn.
- TTS lỗi hoặc render lỗi phải trả lỗi thật; không fallback giả thành công.
- Không sửa template Canvas trong `bkt_web/remake_templates/` như thể đó là HyperFrames.
- Không sửa project trong `compare_studio/` trừ khi task ghi rõ.

### 3.3 Deterministic rendering

- Mọi animation phải phụ thuộc vào absolute time.
- `window.renderFrame(seconds)` phải hoạt động khi `?render=1`.
- Không chạy autonomous loop trong render mode.
- Không dùng random không seed, wall clock hoặc state tích lũy giữa các frame.
- Input storyboard/catalog không được mutate khi sample hoặc render.

### 3.4 Server và thay đổi ngoài phạm vi

- Không restart server hiện có nếu chưa được người dùng cho phép.
- Không sửa file ngoài ownership của task nếu không thật sự cần.
- Không xóa hay reset thay đổi của người khác.
- Nếu schema thay đổi, phải có version, migration và backward-compatibility test.

## 4. Definition of Done toàn chương trình

Chương trình được xem là đạt mục tiêu khi:

- 100% video đầu vào có route: render tự động hoặc `needs-review` có lý do cụ thể.
- Ít nhất 90% scene trong bộ benchmark được dựng mà không viết code riêng cho scene.
- 100% scene giữ đúng timing và speaker identity từ storyboard đã duyệt.
- Ít nhất 95% contact actions vượt geometry/contact checks.
- 100% renderer hỗ trợ deterministic seek hoặc khai báo rõ không hỗ trợ offline frame render.
- Không renderer nào âm thầm dùng source media thay cho output thất bại.
- Một asset/action/renderer mới tự đăng ký capability, xuất hiện trong inspection API và có test.
- Mọi project xuất kèm manifest về renderer, asset provenance, fallback và fidelity.

## 5. Kiến trúc đích

### 5.1 Universal Storyboard v2

Các lớp dữ liệu tối thiểu:

```text
Project
├── source metadata + source hash
├── tracks
│   ├── visual
│   ├── dialogue
│   ├── music
│   ├── sfx
│   └── captions
├── scenes
│   ├── entities
│   ├── components
│   ├── relations
│   ├── actions
│   ├── constraints
│   ├── camera
│   ├── environment
│   └── style
└── render plan
    ├── renderer selections
    ├── fallbacks
    └── fidelity requirements
```

Mọi object phải có stable ID. Mọi event phải có absolute `start`/`end`. Mọi kết quả phân tích tự động phải có `confidence` và `evidence`.

### 5.2 Capability Registry

Registry trả lời được:

- Renderer nào hỗ trợ entity/action/material/effect nào?
- Giới hạn kỹ thuật và fidelity của renderer là gì?
- Renderer có deterministic seek, alpha, audio hay nested composition không?
- Asset nào có rig, anchor và action nào?
- Cần fallback gì khi capability còn thiếu?

### 5.3 Renderer adapters

Tất cả renderer triển khai cùng contract:

```text
inspect_capabilities()
validate(scene)
compile(scene, assets)
render_frame(seconds)
render_range(start, end)
report_fallbacks()
```

Adapter đầu tiên là wrapper cho `native-vector-v1`; không rewrite engine trong phase đầu.

## 6. Quy tắc chia việc cho agent

### Vai trò

- **Coordinator**: sở hữu plan, merge order, quyết định schema và acceptance cuối.
- **Schema agent**: chỉ sở hữu schema/model/migration.
- **Runtime agent**: sở hữu action, constraint và renderer runtime.
- **Analysis agent**: sở hữu video understanding và confidence/evidence.
- **QA agent**: sở hữu fixtures, benchmark, validation và fidelity checks.

### Quy tắc ownership

- Chỉ Coordinator cập nhật bảng trạng thái trong file này.
- Một file production chỉ có một owner trong cùng wave.
- QA agent có thể thêm test trước, nhưng không sửa production implementation của agent khác.
- Nếu cần sửa file ngoài ownership, agent gửi đề xuất hoặc tạo patch nhỏ tách biệt.
- Không chạy song song hai task cùng sửa `remake_vector_engine.js`, `remake_vector.py` hoặc schema chính.

### Handoff bắt buộc

Mỗi agent phải báo:

1. Task ID đã làm.
2. File đã thay đổi.
3. Quyết định schema/API.
4. Test đã chạy và kết quả.
5. Giới hạn hoặc debt còn lại.
6. Có cần migration/rebuild generated assets hay không.

## 7. Roadmap và task graph

Ký hiệu:

- `[ ]` chưa bắt đầu
- `[~]` đang làm
- `[x]` hoàn tất và đã verify
- `[!]` blocked

### Phase 0 — Baseline, benchmark và guardrails

Mục tiêu: đóng băng hành vi đúng hiện tại trước khi thêm kiến trúc v2.

#### UV-000 — Baseline report

- Trạng thái: `[x]`
- Owner: QA agent
- Dependencies: không
- Files: tạo `docs/universal_video/BASELINE.md`
- Việc làm:
  - Ghi phiên bản catalog và số asset/action hiện tại.
  - Ghi test commands, thời gian chạy và dependency môi trường.
  - Ghi danh sách API/CLI hiện hữu liên quan remake.
  - Không đọc file credential.
- Acceptance:
  - Baseline có thể tái lập trên máy sạch có dependencies.
  - Tất cả command trả exit code 0.

#### UV-001 — Golden fixture set

- Trạng thái: `[x]`
- Owner: QA agent
- Dependencies: UV-000
- Files: `tests/fixtures/universal_video/`, test mới trong `tests/`
- Việc làm:
  - Tạo fixture nhỏ cho agriculture, talking head, product review, UI tutorial, infographic và footage composite.
  - Dùng media tổng hợp hoặc public-domain; không dùng credential/source riêng tư.
  - Lưu expected timing, speaker, entity/action và fallback.
- Acceptance:
  - Fixture nhẹ, deterministic và không cần network.
  - Có manifest provenance cho từng media fixture.

### Phase 1 — Universal Storyboard v2

Mục tiêu: một IR chung, versioned, validate được và không phụ thuộc renderer.

#### UV-100 — Storyboard v2 specification

- Trạng thái: `[x]`
- Owner: Schema agent
- Dependencies: UV-000
- Files: `docs/universal_video/STORYBOARD_V2.md`, `bkt_web/schemas/`
- Việc làm:
  - Chốt Project, Track, Scene, Entity, Component, Relation, Action, Constraint, Camera, AudioEvent và RenderPlan.
  - Dùng absolute seconds.
  - Quy định stable IDs, confidence/evidence và provenance.
  - Quy định `required`, `preferred` và `optional` fidelity.
- Acceptance:
  - Có JSON example hoàn chỉnh cho ít nhất ba thể loại.
  - Không chứa field phụ thuộc riêng Canvas.
  - Có versioning và extension namespace.

#### UV-101 — Python models và validator

- Trạng thái: `[x]`
- Owner: Schema agent
- Dependencies: UV-100
- Files: module mới dưới `bkt_web/`, test validator mới
- Việc làm:
  - Parse/validate v2.
  - Giới hạn size, ID, timestamp, references và cycles.
  - Validate continuity, speaker references và renderer requirements.
- Acceptance:
  - Reject NaN/Infinity, path traversal, unknown references và attachment cycles.
  - Validation không mutate input.
  - Error có JSON path và mã lỗi ổn định.

#### UV-102 — v1-to-v2 migration

- Trạng thái: `[x]`
- Owner: Schema agent
- Dependencies: UV-101
- Files: migration module + fixtures/tests
- Việc làm:
  - Chuyển toàn bộ năm example và articulation/IK demo sang v2 in-memory.
  - Giữ nguyên scene times, character IDs, cues và actions.
  - Không xóa đường chạy v1.
- Acceptance:
  - Frame snapshot của v1 và v2 adapter giống nhau tại timestamp kiểm thử.
  - Round-trip không làm mất dữ liệu v1 đã hỗ trợ.
- Implementation: `bkt_web/storyboard_migration.py`; kiểm thử migration/parity tại `tests/test_storyboard_migration.py`.

#### UV-103 — Capability registry contract

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-100
- Files: module registry mới + docs + tests
- Việc làm:
  - Định nghĩa capability cho renderer, asset, action, material và effect.
  - Hỗ trợ version/range và reason khi không match.
- Acceptance:
  - Query được renderer phù hợp cho một scene.
  - Kết quả deterministic và có explanation.

#### UV-104 — Router skeleton

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-101, UV-103
- Việc làm:
  - Chọn renderer theo hard requirements trước, preference sau.
  - Trả `needs-review` khi không có route an toàn.
  - Không render thật trong task này.
- Acceptance:
  - Router không bao giờ chọn renderer thiếu hard capability.
  - Fallback được ghi vào render plan.
- Implementation: `bkt_web/render_router.py`; kiểm thử hard gate, preferred scoring, limit và determinism tại `tests/test_render_router.py`.

### Phase 2 — Component, detachable parts và constraint engine

Mục tiêu: dựng hành động phức tạp bằng primitive thay vì code riêng từng scene.

#### UV-200 — Component tree runtime

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-102
- Việc làm:
  - Stable component IDs và parent-child transforms.
  - Component state: visible, attached, detached, damaged, growth stage.
  - Named anchors trên từng component.
- Acceptance:
  - Seek trước/sau detach không phụ thuộc thứ tự render trước đó.
  - Component cycle bị reject.
- Implementation: `bkt_web/component_runtime.py`; kiểm thử transform, anchor, state, detach continuity, cycle và seek determinism tại `tests/test_component_runtime.py`.

#### UV-201 — Attach/detach lifecycle

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-200
- Actions: `attach`, `detach`, `pluck`, `cut-detach`, `join`
- Acceptance:
  - Vật không nhảy tại frame detach.
  - Component độc lập sau detach và có thể grip/carry/place.
  - Test hoa -> quả và quả -> được hái.
- Implementation: `bkt_web/component_lifecycle.py`; compiler hỗ trợ `attach`, `detach`, `pluck`, `cut-detach`, `join` bằng absolute-time events và preserve-world transforms. Kiểm thử tại `tests/test_component_lifecycle.py`.

#### UV-202 — General constraint solver

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-200, UV-103
- Constraints:
  - point-to-point
  - distance
  - look-at
  - ground contact
  - inside-container
  - joint limit
  - path follow
- Acceptance:
  - Constraint có priority và conflict report.
  - Không loop vô hạn.
  - Deterministic tại mọi timestamp.
- Implementation: `bkt_web/constraint_solver.py`; tài liệu `docs/universal_video/CONSTRAINTS.md`; kiểm thử bảy họ constraint, priority/conflict, pass budget, seek determinism, non-mutation và negative validation tại `tests/test_constraint_solver.py`. Constraint type ngoài danh sách hỗ trợ trả về `needs_review_constraint_ids`, không bị bỏ qua âm thầm.

#### UV-203 — Interaction grammar

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-201, UV-202
- Primitive actions:
  - `touch`, `push`, `pull`, `drag`, `place`
  - `open`, `close`, `fold`
  - `give`, `receive`, `transfer`
  - `pour`, `scatter`, `spray`
- Acceptance:
  - Composite action chỉ là dữ liệu gồm primitive actions.
  - Có example/test cho ít nhất sáu chuỗi hành động.
- Implementation: `bkt_web/interaction_grammar.py` + thư viện dữ liệu `bkt_web/schemas/interaction_composites.json` (bảy chuỗi: harvest_fruit, water_plant, hand_over_item, store_in_box, push_object_aside, spray_crop, scatter_seed); tài liệu `docs/universal_video/INTERACTION_GRAMMAR.md`; kiểm thử tại `tests/test_interaction_grammar.py`. Composite không chứa code: step dùng ratio thời gian và template `$role`/`$param`, cấm lồng nhau. Action không giải được về component tree vào `needs_review`, không dựng contact giả.

#### UV-204 — Materials và deterministic particles

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-202
- Materials: water, soil, seed, fertilizer, sap, smoke, dust.
- Acceptance:
  - Emitter seed từ project/entity/action ID.
  - Seek frame độc lập không cần chạy từ frame 0.
  - Container fill level và spill được validate.
- Implementation: `bkt_web/material_runtime.py` + catalog dữ liệu `bkt_web/schemas/material_catalog.json` (đủ bảy vật liệu); tài liệu `docs/universal_video/MATERIALS.md`; kiểm thử tại `tests/test_material_runtime.py`. Hạt là hàm đóng của thời điểm sinh (drag tuyến tính có dạng đóng, thời điểm chạm đất dùng bisection cố định 64 vòng), nhiễu từ splitmix64 theo (seed, index, channel). UV-203 gọi `emitter_seed` nên emission và emitter dùng chung một dòng hạt. Fill report luôn kèm `spilled_volume`; vật liệu không lắng đọng hoặc thiếu `ground_y` thì báo lỗi thay vì trả 0.

### Phase 3 — Video understanding

Mục tiêu: chuyển video nguồn thành evidence-rich observations, chưa tự quyết định cách render.

#### UV-300 — Analysis result schema

- Trạng thái: `[x]`
- Owner: Analysis agent
- Dependencies: UV-100
- Việc làm:
  - Observation schema cho shot, transcript, OCR, track, pose, action, camera, audio event.
  - Mỗi observation có confidence, source time range và evidence.
- Acceptance:
  - Không trộn observation với creative decision.
- Implementation: `bkt_web/analysis_result.py` (models + validator), JSON Schema `bkt_web/schemas/analysis_result_v1.schema.json` sinh từ model, ví dụ `bkt_web/schemas/examples/{agriculture,ui-tutorial}.analysis-v1.json`, tài liệu `docs/universal_video/ANALYSIS_RESULT.md`, kiểm thử `tests/test_analysis_result.py`. Tám loại observation (shot, transcript, ocr, track, pose, action, camera, audio_event), mỗi cái bắt buộc có confidence, source interval và ít nhất một evidence. Field thuộc về quyết định sản xuất (renderer/asset/style/entity_id/...) bị từ chối ở mọi độ sâu với mã `CREATIVE_DECISION_IN_ANALYSIS`; transcript chỉ mang `speaker_label` quan sát được, không mang identity. `failures[]` ghi analyzer hỏng mà không xoá kết quả của analyzer khác.

#### UV-301 — Shot/transcript/OCR adapters

- Trạng thái: `[x]`
- Owner: Analysis agent
- Dependencies: UV-300, UV-001
- Acceptance:
  - Preserve timestamps.
  - Offline fixtures không gọi network.
  - Failure của một analyzer không xóa kết quả analyzer khác.
- Implementation: `bkt_web/analysis_adapters.py` (`ShotBoundaryAdapter`, `TranscriptAdapter`, `OcrAdapter`, `run_analysis`); tài liệu `docs/universal_video/ANALYSIS_ADAPTERS.md`; kiểm thử `tests/test_analysis_adapters.py` dùng chính golden fixtures của UV-001. Adapter chỉ chuẩn hoá output gốc của analyzer, không tự chạy model. Timestamp được sao chép nguyên văn (test so sánh bằng nhau tuyệt đối với giá trị như 1.2345678901); runner chặn socket khi `allow_network=False` nên gọi mạng lén thành failure có ghi nhận; output của từng adapter được validate riêng nên adapter hỏng chỉ mất phần của nó, còn hỏng hết thì raise `AnalysisAllAdaptersFailed` thay vì trả document rỗng trông như thành công.

#### UV-302 — Entity tracking và relation inference

- Trạng thái: `[x]`
- Owner: Analysis agent
- Dependencies: UV-301
- Relations: holds, touches, looks-at, inside, in-front-of, attached-to.
- Acceptance:
  - Stable track IDs qua shot khi confidence đủ cao.
  - Ambiguous identity được đánh dấu, không tự merge.
- Implementation: `bkt_web/entity_tracking.py` (`infer_tracking`, `TrackingSettings`); tài liệu `docs/universal_video/ENTITY_TRACKING.md`; kiểm thử `tests/test_entity_tracking.py`. Link identity theo điểm số position/size/label/timing, chỉ merge khi vượt `link_threshold`, đủ confidence, và hơn ứng viên thứ hai ít nhất `ambiguous_margin`; ba lý do không merge được ghi lại (`competing_links_within_margin`, `track_confidence_below_threshold`, `source_track_already_continued`). Đủ sáu quan hệ; `in_front_of` chỉ là heuristic cạnh dưới nên luôn `review_required`, `looks_at` đòi keypoint hướng mặt chứ không bịa. Kết quả là document riêng tham chiếu analysis theo id nên schema UV-300 giữ nguyên.

#### UV-303 — Action and camera inference

- Trạng thái: `[x]`
- Owner: Analysis agent
- Dependencies: UV-302
- Acceptance:
  - Action có actor, target, start/end và evidence.
  - Camera tách khỏi object motion.
  - Confidence thấp tạo review item.
- Implementation: `bkt_web/action_inference.py` (`infer_actions_and_camera`, `InferenceSettings`); tài liệu `docs/universal_video/ACTION_INFERENCE.md`; kiểm thử `tests/test_action_inference.py`. Camera ước lượng bằng median dịch chuyển/tỉ lệ của mọi track, chỉ coi là camera khi tỉ lệ inlier đạt `camera_inlier_ratio`; action suy từ chuyển động **dư** đã trừ camera. Không đủ track để tách thì segment là `unknown`, confidence 0 và tạo review item, không âm thầm gọi là static. Mỗi action đều có actor, target, start/end và evidence; chuyển động không có đối tượng đi vào `motions`, không được gọi là action. Review item sinh từ confidence thấp, quan hệ đã bị UV-302 gắn cờ, hoặc identity chưa giải quyết.

#### UV-304 — Analysis-to-storyboard compiler

- Trạng thái: `[x]`
- Owner: Analysis agent
- Dependencies: UV-101, UV-303
- Acceptance:
  - Không tự bịa entity/action khi không có evidence.
  - Giữ uncertainty trong storyboard.
  - Có deterministic compile test.
- Implementation: `bkt_web/analysis_compiler.py` (`compile_storyboard`); tài liệu `docs/universal_video/ANALYSIS_COMPILER.md`; kiểm thử `tests/test_analysis_compiler.py`.
- Ghi chú môi trường: `python3` toàn cục trên máy đã tụt về 3.9.6 không có dependencies, nên test chạy bằng venv dự án `.venv` (python 3.13 + `requirements.txt` + `playwright install chromium`); `node` phải có trên PATH cho các suite gọi engine JS.

### Phase 4 — Renderer adapters

Mục tiêu: bao phủ các họ nội dung phổ biến bằng adapter riêng.

#### UV-400 — Native vector adapter

- Trạng thái: `[x]`
- Owner: Runtime agent
- Dependencies: UV-102, UV-104
- Việc làm:
  - Bọc `native-vector-v1` theo renderer contract.
  - Khai báo capability hiện có; không overclaim.
- Acceptance:
  - Năm example cũ render không đổi.
  - Offline composer vẫn embed engine/catalog.
- Implementation: `bkt_web/renderer_adapters/native_vector.py` (contract chung tại `base.py`). Adapter chỉ bọc engine, không rewrite: `compile()` khôi phục story v1 nguyên văn qua `restore_v1_from_v2()` và khớp scene theo explicit source times. Frame mode `host-callback` — khai báo rõ Python không raster hoá, entry là `window.renderFrame`. `offline_bundle()` nhúng engine + catalog, không có animation loop. Kiểm thử parity năm example tại `tests/test_renderer_adapters.py`.

#### UV-401 — Motion graphics adapter

- Trạng thái: `[x]`
- Owner: Renderer agent
- Dependencies: UV-104
- Hỗ trợ: text, shapes, cards, lower-thirds, charts, callouts.
- Acceptance:
  - Responsive 9:16, 16:9 và 1:1.
  - Font fallback ổn định, không overflow.
- Implementation: `bkt_web/renderer_adapters/motion_graphics.py`. Layout (safe area, wrap, cỡ chữ, nhãn chart) chốt một lần ở `compile()` nên mọi frame dùng lại cùng hình học. Text không vừa hộp ở cỡ nhỏ nhất trả `MG_TEXT_OVERFLOW` thay vì tràn. Font resolve qua bảng metric cố định: family lạ luôn rơi về cùng stack và được ghi vào `warnings`.

#### UV-402 — Screen/UI adapter

- Trạng thái: `[x]`
- Owner: Renderer agent
- Dependencies: UV-104
- Hỗ trợ: screenshots, cursor, focus, zoom, highlight, redaction.
- Acceptance:
  - Không lộ dữ liệu riêng tư trong fixture.
  - Crop/zoom deterministic.
- Implementation: `bkt_web/renderer_adapters/screen_ui.py`. Vùng `contains_private_data` chưa được che hoàn toàn thì `compile()` hỏng với `UI_PRIVATE_REGION_NOT_REDACTED`; ảnh phải freeze local kèm sha256, URL mạng bị từ chối nên frame không phụ thuộc network. `crop_at()` là hàm thuần của timestamp (from_region → to_region theo ease có tên).

#### UV-403 — Footage composite adapter

- Trạng thái: `[x]`
- Owner: Renderer agent
- Dependencies: UV-104
- Hỗ trợ: clip, crop, mask, overlay, background removal, color transform.
- Acceptance:
  - Manifest ghi rõ phần nào dùng footage nguồn.
  - Không gọi đây là full remake nếu fidelity policy cấm source reuse.
- Implementation: `bkt_web/renderer_adapters/footage_composite.py`. `manifest()` ghi từng segment (source ID, checksum, khoảng nguồn/đầu ra, operations, có giữ audio nguồn hay không); `fidelity_class` luôn là `source-composite`, kèm fallback `SOURCE_MEDIA_REUSED` cần duyệt. Scene yêu cầu `feature.no_source_media_reuse` hoặc job đặt `policy.allow_source_reuse=false` thì compile hỏng với `FC_SOURCE_REUSE_FORBIDDEN`, không âm thầm dùng footage.

#### UV-404 — 2D puppet adapter

- Trạng thái: `[x]`
- Owner: Renderer agent
- Dependencies: UV-202, UV-104
- Acceptance:
  - Full-body IK, lip sync, expressions và reusable rigs.
- Implementation: `bkt_web/renderer_adapters/puppet_2d.py` + thư viện rig `bkt_web/schemas/puppet_rigs.json` (adult, child, presenter; tỉ lệ theo chiều cao nhân vật nên một rig dùng cho mọi cỡ). IK hai xương giải tích cho cả tay và chân, target ngoài tầm bị clamp và gắn cờ `reach_limited`. Lip sync suy ra từ chính lời thoại trong storyboard, miệng đóng khi speaker không có thoại; adapter không tự bịa thoại. Keyframe được resolve đủ kênh ở compile nên kênh xuất hiện muộn vẫn nội suy, không nhảy.

#### UV-405 — 3D adapter spike

- Trạng thái: `[x]`
- Owner: Renderer agent
- Dependencies: UV-104
- Đây là research spike, không block MVP.
- Acceptance:
  - Một scene camera + object + light render deterministic.
  - Có cost/performance report trước khi productionize.
- Implementation: `bkt_web/renderer_adapters/three_d_spike.py`; báo cáo `docs/universal_video/RENDERER_3D_SPIKE.md`. Rasteriser phần mềm deterministic (cull mặt sau, Lambert, painter sort tie-break theo entity ID). Khai báo thật `maturity: "spike"`, `production_ready: false`, không texture/shadow. `cost_report()` trả số polygon và thời gian đo được; khuyến nghị thay rasteriser bằng GPU/offline renderer sau cùng contract trước khi productionize.

### Phase 5 — Auto Director và asset system

#### UV-500 — Asset manifest và provenance

- Trạng thái: `[x]`
- Owner: Asset agent
- Dependencies: UV-103
- Acceptance:
  - Mọi asset có ID, version, license/provenance, checksum và capabilities.
  - Generated asset ghi model/config/source references.
- Implementation: `bkt_web/asset_manifest.py` + manifest khai báo `bkt_web/schemas/asset_manifest.json`; tài liệu `docs/universal_video/ASSETS.md`; kiểm thử `tests/test_asset_manifest.py`. Record built-in được dẫn xuất từ capability registry nên checksum bám đúng vector catalog, không nhân bản dữ liệu. Mọi record bắt buộc có ID, version, license, checksum sha256 và capability list đã sắp xếp; `generated` bắt buộc ghi `generation.model/config/source_refs`, `imported`/`source-media` bắt buộc ghi nguồn, `composed` bị kiểm tra chu trình. `verify_asset_files` phát hiện file mất, lệch checksum và path thoát khỏi root.

#### UV-501 — Asset resolver

- Trạng thái: `[x]`
- Owner: Asset agent
- Dependencies: UV-500
- Resolution order:
  1. exact reusable asset
  2. compatible component composition
  3. generated asset
  4. approved source-media fallback
  5. needs-review
- Acceptance:
  - Asset được freeze local trước render.
  - Không phụ thuộc URL mạng khi frame render.
- Implementation: `bkt_web/asset_resolver.py`; tài liệu `docs/universal_video/ASSETS.md`; kiểm thử `tests/test_asset_resolver.py`. Năm bậc theo đúng thứ tự, mọi bậc đã thử đều ghi vào `attempts`. Asset được freeze content-addressed vào cache (ghi qua tên `.part` rồi replace) ngay khi resolve; record `remote` chỉ tải tại bước resolve với `fetcher` tường minh và phải khớp checksum, không có fetcher thì trả `REMOTE_ASSET_NOT_FROZEN`. `assert_offline_ready` chặn kế hoạch còn phụ thuộc mạng hoặc mất file trước khi render. Source-media fallback chỉ chạy khi policy cho phép **và** `source_ref` nằm trong danh sách đã duyệt, kèm disclosure và `requires_approval`.

#### UV-502 — Auto Director rules

- Trạng thái: `[x]`
- Owner: Director agent
- Dependencies: UV-304, UV-104, UV-501
- Việc làm:
  - Renderer selection, staging, framing, continuity và caption safe zones.
  - Profiles: source-faithful, TikTok-fast, educational, product, news, meme.
- Acceptance:
  - Quyết định có explanation và confidence.
  - Hard source facts không bị creative profile ghi đè.
- Implementation: `bkt_web/auto_director.py` + profiles dữ liệu `bkt_web/schemas/director_profiles.json` (đủ sáu profile); tài liệu `docs/universal_video/AUTO_DIRECTOR.md`; kiểm thử `tests/test_auto_director.py`. Mỗi decision có `rule`, `explanation`, `confidence` (suy ra từ analysis confidence × độ cụ thể của rule) và `locked_by_source_fact_ids`. Hard source facts (scene timing, speaker, dialogue text, action order, source geometry) được trích trước và giống hệt nhau ở mọi profile; rule creative đụng vào chúng bị bỏ và ghi `SOURCE_FACT_PROTECTED` + review item, không retime, không gộp shot, không đổi speaker. Director không sửa storyboard và `plan_hash` ổn định giữa các lần chạy.
- Lệch dependency: UV-304 chưa xong nên director nhận storyboard v2 từ migration/example thay vì từ analysis compiler; contract đầu vào không đổi khi UV-304 hoàn tất.

#### UV-503 — Human review workflow

- Trạng thái: `[x]`
- Owner: UI/API agent
- Dependencies: UV-502
- Acceptance:
  - Review theo scene/action/entity.
  - Approved decisions keyed theo source hash và schema version.
  - Có invalidation khi source/schema thay đổi.
- Implementation: `bkt_web/review_workflow.py` + store `bkt_web/storage/universal_review_decisions.json`; tài liệu `docs/universal_video/AUTO_DIRECTOR.md`; kiểm thử `tests/test_review_workflow.py`. Review mở theo scene/action/entity và theo từng decision cần duyệt hoặc confidence thấp. Mỗi phê duyệt keyed theo `source_sha256 + schema_version + project_id + target + fingerprint nội dung`, nên đổi nguồn, đổi schema version hoặc sửa chính đối tượng đã duyệt đều làm entry thành stale với lý do cụ thể (`SOURCE_HASH_CHANGED`, `SCHEMA_VERSION_CHANGED`, `TARGET_CONTENT_CHANGED`, `TARGET_REMOVED`). Entry stale được giữ lại làm dấu vết kiểm toán nhưng không còn tính là duyệt. Store ghi atomic, chỉ chứa ID/hash/status/reviewer/note.
- Debt: chưa có HTTP surface; toàn bộ Phase 0–4 cũng chưa nối vào `server.py`, nên review workflow hiện là module + store, chờ một task API riêng.

### Phase 6 — Fidelity, QA và observability

#### UV-600 — Structural fidelity checks

- Trạng thái: `[x]`
- Owner: QA agent
- Dependencies: UV-304, UV-400
- Checks: timing, speaker, entity/action coverage, order, continuity.
- Implementation: `bkt_web/fidelity_structural.py` (`check_structural_fidelity`, `FidelitySettings`); tài liệu `docs/universal_video/FIDELITY_STRUCTURAL.md`; kiểm thử `tests/test_fidelity_structural.py`. So khớp trong phạm vi từng scene (id entity là scene-scoped), dialogue khớp theo text, danh tính xuyên scene theo kind+label. Đủ năm nhóm check; `SPEAKER_ASSIGNED_CYCLICALLY` bắt việc gán speaker theo vòng lặp và `ACTION_ADDED` mặc định fail vì action không có trong nguồn là bịa. Ngưỡng theo profile và được ghi lại trong report.

#### UV-601 — Geometric fidelity checks

- Trạng thái: `[x]`
- Owner: QA agent
- Dependencies: UV-202
- Checks: contact distance, ground slip, intersection, attachment continuity, IK limits.
- Implementation: `bkt_web/fidelity_geometric.py`; tài liệu `docs/universal_video/FIDELITY_GEOMETRIC.md`; kiểm thử `tests/test_fidelity_geometric.py`. Đo trên **trạng thái đã solve** của UV-202 chứ không phải runtime thô; lấy mẫu theo lưới cố định cộng đúng frame hai bên mỗi lifecycle event. Cặp đang có ràng buộc tiếp xúc được miễn kiểm tra giao nhau (tay cầm quả không phải lỗi); component không khai `bounds` vào `unchecked`, không tính là đạt. Rig joint limit được cưỡng chế cả khi không có constraint.

#### UV-602 — Visual/audio comparison

- Trạng thái: `[x]`
- Owner: QA agent
- Dependencies: UV-001, ít nhất hai renderer adapters
- Acceptance:
  - Perceptual frame comparison theo scene.
  - Audio duration/loudness/silence checks.
  - Threshold theo profile, không dùng một ngưỡng cho mọi thể loại.
- Implementation: `bkt_web/fidelity_visual.py`; tài liệu `docs/universal_video/FIDELITY_VISUAL.md`; kiểm thử `tests/test_fidelity_visual.py`. So sánh theo từng scene: frame quy về lưới xám 64×64, SSIM trung bình theo ô 8×8 cộng RMSE; audio so duration, loudness RMS dBFS và tỉ lệ im lặng. Sáu profile (source-faithful, news, product, educational, tiktok-fast, meme) với ngưỡng khác nhau, **không có default toàn cục** — profile lạ là lỗi. Thiếu frame/thiếu audio là fail, không phải điểm tuyệt đối; scene có tiếng ở nguồn mà output im lặng thì fail thẳng.

#### UV-603 — Render manifest và observability

- Trạng thái: `[x]`
- Owner: Platform agent
- Dependencies: UV-104, UV-500
- Manifest gồm:
  - input/source hashes
  - storyboard/schema version
  - renderer versions
  - asset checksums
  - fallbacks
  - warnings
  - test/fidelity result
- Implementation: `bkt_web/render_manifest.py`; tài liệu `docs/universal_video/RENDER_MANIFEST.md`; kiểm thử `tests/test_render_manifest.py`. Đủ bảy phần theo plan. **Completion claim được suy ra từ bằng chứng, không do caller khai**: fidelity fail hoặc scene không có renderer → `failed`; chưa chạy fidelity → `needs-review`; dùng lại media nguồn có duyệt → `partial`, không duyệt → `failed`. `validate_manifest` chạy lại đúng luật đó khi đọc file nên không thể sửa tay thành `complete`. `diff_manifests` so hai lần render của cùng project.

### Phase 7 — Scale và learning loop

#### UV-700 — Benchmark dashboard

- Trạng thái: `[x]`
- Owner: QA/Platform agent
- Dependencies: UV-600, UV-601, UV-602
- Metrics theo thể loại, action, renderer và failure reason.
- Implementation: `bkt_web/benchmark_dashboard.py`; tài liệu `docs/universal_video/BENCHMARK_DASHBOARD.md`; kiểm thử `tests/test_benchmark_dashboard.py`. Đủ bốn chiều. Run chưa chạy fidelity là `unverified`, **không** tính là pass. Mọi tỉ lệ đi kèm số đếm gốc; slice dưới `minimum_sample` bị loại khỏi xếp hạng và liệt kê riêng ở `under_sampled`. `BenchmarkRun.from_manifest` đọc thẳng manifest UV-603.

#### UV-701 — Approved-pattern library

- Trạng thái: `[x]`
- Owner: Director agent
- Dependencies: UV-503, UV-700
- Lưu scene patterns, action sequences, camera patterns và resolved fixes.
- Không lưu secret hoặc media không có quyền tái sử dụng.
- Implementation: `bkt_web/pattern_library.py`; tài liệu `docs/universal_video/PATTERN_LIBRARY.md`; kiểm thử `tests/test_pattern_library.py`. Đủ bốn loại pattern. Chỉ học từ render đã verify: chưa chạy fidelity, fidelity fail, hoặc có fallback dùng lại media nguồn thì **từ chối**. Payload bị quét secret ở mọi độ sâu (tên field và giá trị dạng token) và thông báo lỗi **chỉ nêu tên field, không in giá trị**. Media chỉ vào được khi licence cho phép tái sử dụng và `origin` không phải `source`. `load_library` chạy lại toàn bộ guard khi đọc file.

#### UV-702 — Capability gap prioritizer

- Trạng thái: `[x]`
- Owner: Platform agent
- Dependencies: UV-700
- Xếp hạng phần thiếu theo tần suất, tác động fidelity và chi phí triển khai.
- Implementation: `bkt_web/capability_gaps.py`; tài liệu `docs/universal_video/CAPABILITY_GAPS.md`; kiểm thử `tests/test_capability_gaps.py`. Điểm là tổng có trọng số minh bạch của ba thành phần (0.45 tần suất / 0.40 tác động fidelity / 0.15 chi phí), mỗi gap ghi rõ cả ba cùng số đếm gốc. Gap **chưa có ước lượng chi phí** không được mặc định là rẻ: cost `unknown` nặng hơn `medium` và được gắn cờ. Gap xuất hiện dưới `minimum_sample` xếp vào `emerging` chứ không trộn vào bảng xếp hạng. `gaps_from_dashboard` đọc thẳng failure reason của UV-700.

### Phase 8 — Nối vào production và renderer xuất video

Mục tiêu: chuyển tầng v2 từ "thư viện đã test" thành **đường chạy thật**, và đóng hai gap kỹ thuật còn lại theo `docs/universal_video/REVIEW_AUTO_REMAKE.md`.

Nguyên tắc xuyên suốt phase này: **không nới lỏng bất kỳ guardrail nào ở mục 3 để cho pipeline chạy được**. Nếu router trả `needs-review`, pipeline phải dừng ở `needs_review` — chạy được nhưng nói dối thì tệ hơn không chạy.

#### UV-800 — Round-trip và cầu nối sang native-vector

- Trạng thái: `[x]`
- Owner: Schema agent
- Dependencies: UV-304, UV-102
- Files: `bkt_web/native_vector_bridge.py`, `tests/test_native_vector_bridge.py`
- Việc làm:
  - Chứng minh v1 → v2 → v1 không mất scene time, speaker, action.
  - Liệt kê tường minh những gì một storyboard **compile từ analysis** còn thiếu để native-vector-v1 dựng được.
- Acceptance:
  - Round-trip không mất scene time, speaker id, hay action nào.
  - Thứ gì chưa hỗ trợ phải được liệt kê tường minh, không im lặng biến mất.
- **Đính chính phạm vi (16:40)**: mô tả ban đầu của task này sai về kiến trúc. `restore_v1_from_v2()` **không** phải bộ chuyển đổi hai chiều — nó chỉ lấy lại payload v1 mà `migrate_v1_to_v2()` nhét sẵn vào `extensions['com.ssmatool.v1:story']`. Không tồn tại đường compiled-v2 → v1, nên "đưa storyboard compile qua restore rồi migrate" là bất khả thi chứ không phải chưa làm. Chiều v1 → v2 → v1 thì đã có test từ UV-102.
- Implementation: `bkt_web/native_vector_bridge.py`; tài liệu `docs/universal_video/NATIVE_VECTOR_BRIDGE.md`; kiểm thử `tests/test_native_vector_bridge.py` (25 test). `inspect_native_bridge()` trả sáu mã gap (`ENTITY_HAS_NO_ASSET`, `SCENE_HAS_NO_POSES`, `SCENE_HAS_NO_BACKGROUND`, `ACTION_NOT_IN_CATALOG`, `ACTION_ASSET_NOT_SUPPORTED`, `ACTION_ACTOR_HAS_NO_ASSET`) kèm JSON path và `reason()` dùng thẳng làm lý do `needs_review` cho UV-802. `assert_round_trip_preserves_source_facts()` kiểm scene time, speaker/cue, action, character, duration trên chiều v1 → v2 → v1 cho toàn bộ example.
- Phát hiện kèm theo: action `look_at` mà UV-303 sinh ra **không có** trong catalog native — trước đây không ai thấy vì chưa có ai đối chiếu hai đầu.

#### UV-801 — Cổng `analysis_adapters` cho nguồn thật

- Trạng thái: `[x]`
- Owner: Analysis agent
- Dependencies: UV-301
- Việc làm:
  - Viết ít nhất một adapter chạy được trên file thật: shot boundary từ ffprobe/ffmpeg scene-detect, transcript từ engine sẵn có của pipeline.
  - Adapter khai `allow_network` tường minh; mặc định offline.
- Acceptance:
  - Một mp4 thật chạy qua `run_analysis()` ra `AnalysisResultV1` hợp lệ.
  - Analyzer hỏng chỉ mất phần của nó; timestamp giữ nguyên văn.
  - Có test dùng fixture nhỏ, không gọi mạng.
- Implementation: `bkt_web/analysis_probe.py`; tài liệu `docs/universal_video/ANALYSIS_PROBE.md`; kiểm thử `tests/test_analysis_probe.py` (21 test, không skip). `probe_source()` đọc duration/kích thước/fps/sha256 bằng ffprobe; `FfmpegShotAdapter` dò cảnh bằng ffmpeg rồi giao cho `ShotBoundaryAdapter` của UV-301 phân hoạch; `TranscriptionAdapter` chuẩn hoá đúng output ASR sẵn có của pipeline. `analyse_media()` chạy cả hai qua `run_analysis()`.
- Ghi chú phạm vi: **ASR không được nhúng vào đây**. `TranscriptionAdapter` nhận dict `{"language", "segments"}` mà `remake_pipeline.step2_transcribe` đã tạo — một engine nhận dạng giọng nói, không phải hai. Do đó `analyse_media()` chạy một mình chỉ ra shot, muốn có transcript phải truyền vào.
- Bằng chứng: test dựng clip tổng hợp bằng ffmpeg (đỏ → xanh, một điểm cắt thật), kiểm cắt đúng chỗ, document hợp lệ, compile được thành storyboard 2 scene, timestamp nguyên văn, analyzer hỏng chỉ mất phần của nó, và một test chặn socket chứng minh không gọi mạng.

#### UV-802 — Nối compiler → director → router vào pipeline

- Trạng thái: `[x]`
- Owner: Coordinator + Platform agent
- Dependencies: UV-800, UV-801, UV-502, UV-104
- Files: `bkt_web/remake_pipeline.py`, test pipeline mới
- Việc làm:
  - Trong `run_all()`, khi `load_verified_script(sha256)` không có kịch bản duyệt: chạy `run_analysis()` → `compile_storyboard()` → `auto_director.direct()` → `route_storyboard()`.
  - Đường kịch bản đã duyệt giữ nguyên, không đổi hành vi.
- Acceptance:
  - `render_plan` có scene `needs-review` → task trả `status="needs_review"`, **không** gọi TTS, **không** fallback footage nguồn.
  - Lý do `needs_review` ghi rõ reason code của router chứ không phải thông báo chung chung.
  - Test end-to-end: một nguồn **không** có kịch bản duyệt vẫn đi hết compile→route và dừng đúng chỗ.
  - 20 test `test_remake_pipeline.py` hiện có vẫn xanh nguyên.
- Implementation: `bkt_web/pipeline_route.py` (`assess_source`, `assess_render_plan`, `RouteVerdict`) + đúng ba chỗ sửa trong `remake_pipeline.py` (`assess_automatic_route()` mới, gắn `automatic_route` vào `review.json`, gắn `route_status`/`route_reason_codes` vào project record). Tài liệu `docs/universal_video/PIPELINE_ROUTE.md`; kiểm thử `tests/test_pipeline_route.py` (18 test). 20 test pipeline cũ xanh nguyên.
- **Ba cái bẫy phát hiện khi nối thật** (không phải suy đoán, mỗi cái một test):
  1. `render_plan` báo `routable` **không** nghĩa là dựng được: compiler cố ý để `render_requirements` rỗng nên router không có cổng cứng nào để trượt. Requirement rỗng = *chưa kiểm gì*, không phải *đã đạt*. → `NO_FIDELITY_REQUIREMENTS`.
  2. Renderer điểm cao nhất cho nguồn mới là **`footage-composite-v1`**, tức phát lại chính video gốc. Nếu tin router thì mọi video mới sẽ "tự động remake" bằng cách chiếu lại nguồn. Cổng phát hiện qua `features.source_media_reuse` trong registry, không hard-code tên renderer. → `SOURCE_MEDIA_REUSE_NOT_APPROVED`.
  3. Transcript không có nhãn speaker bị compiler bỏ (đúng), nhưng nếu cổng im lặng thì pipeline sẽ dựng video **mất sạch lời thoại** mà vẫn coi là thành công. → `COMPILED_WITH_SKIPPED_OBSERVATIONS`.
- Ghi chú: cổng chỉ **đọc và phán quyết**, không render, không TTS, không tự duyệt việc dùng lại media nguồn. Mọi lỗi của tầng v2 đều thành một lý do `needs_review` chứ không được phép làm hỏng đường kịch bản đã duyệt (có test riêng).

#### UV-803 — Frame → MP4 cho renderer v2

- Trạng thái: `[x]`
- Owner: Renderer agent
- Dependencies: UV-401, UV-403
- Việc làm:
  - Thêm đường export chung: draw-list → frame → ffmpeg → MP4, dùng lại cách `remake_composer._record_with_playwright` đã làm cho v1.
  - Chọn trước một adapter làm mũi nhọn (đề xuất `motion-graphics-v1` vì ít phụ thuộc asset nhất).
- Acceptance:
  - Xuất được MP4 thật từ một storyboard v2 tối thiểu.
  - Test kiểm pixel đổi theo thời gian (mẫu `test_native_renderer_is_seek_safe_and_has_no_source_images`).
  - Deterministic: không `Date.now()`, `Math.random()`, không network trong đường render.
  - Render lỗi phải trả lỗi thật, không trả file rỗng hay footage nguồn.
- Implementation: `bkt_web/frame_exporter.py` (`rasterise_frame`, `export_frames`, `encode_frames`, `export_scene_to_mp4`); tài liệu `docs/universal_video/FRAME_EXPORTER.md`; kiểm thử `tests/test_frame_exporter.py` (21 test). Mũi nhọn là `motion-graphics-v1`: compile → 36 frame → MP4 1080×1920 6 giây, đã kiểm bằng ffprobe.
- **Không dùng trình duyệt.** Đường v1 phải mở Chromium vì template của nó là HTML; draw-list chỉ gồm primitive hình học nên raster thẳng bằng Pillow — tất định hơn (không phụ thuộc phiên bản Chromium), nhanh hơn, không cần mạng.
- Ba nguyên tắc cưỡng chế bằng code: op lạ **ném lỗi** chứ không bỏ qua (bỏ qua = frame thiếu nội dung mà vẫn báo thành công); `video_frame` và `image` bị **từ chối** kèm lý do (dùng lại media nguồn / cần asset UV-805); MP4 xuất xong bị kiểm lại kích thước file và thời lượng bằng ffprobe chứ không tin ffmpeg.
- Ghi chú trung thực: chữ vẽ bằng **font mặc định của Pillow**, không phải `font_stack` của storyboard. Mỗi lần xuất đều trả warning `text_rendered_with_pillow_default_font` để không ai tưởng typography thương hiệu đã được tôn trọng.

#### UV-804 — Đính manifest và fidelity vào mỗi lần render

- Trạng thái: `[x]`
- Owner: Platform agent
- Dependencies: UV-802, UV-803, UV-600, UV-603
- Việc làm:
  - Sau khi render: chạy `check_structural_fidelity` (reference = storyboard compile, candidate = storyboard đã render) và `check_geometric_fidelity` cho scene vector.
  - Gọi `build_manifest()` với renderer/asset/fallback/warning/fidelity thật, lưu `manifest.json` cạnh project.
  - Thêm API đọc lại manifest của một project.
- Acceptance:
  - Mọi project mới đều có manifest; `completion_claim` do bằng chứng quyết định.
  - Project có fidelity fail **không** được gắn badge hoàn chỉnh ở UI.
  - `validate_manifest()` chạy được trên file đã lưu.
- Ghi chú: đây là mảnh biến "không giả hoàn chỉnh" thành bất khả thi về cấu trúc thay vì chỉ là kỷ luật.
- Implementation: `bkt_web/render_evidence.py` nối vào `RemakePipeline.attach_render_evidence()`; tài liệu `docs/universal_video/RENDER_EVIDENCE.md`; kiểm thử `tests/test_render_evidence.py` (27 test). Sau render, pipeline so structural snapshot trước/sau, bắt renderer thực tế lệch render plan, kiểm file MP4 (tồn tại/kích thước/duration/source-copy/frozen/blank), chạy geometry khi có bounds, rồi ghi renderer/version/frame-mode, asset checksum, fallback, warning và fidelity thật vào `manifest.json`. Phép kiểm rỗng là `not_applicable`, không được tính pass. `completion_claim` điều khiển trực tiếp fidelity/badge của project; fidelity fail không thể giữ badge hoàn chỉnh. API `GET /api/remake/projects/{project_id}/manifest` validate lại file khi đọc và khóa path traversal. Hồ sơ legacy chuyển sang `project.json`, giữ riêng tên `manifest.json` cho evidence manifest đã validate.

#### UV-805 — Asset cho chủ đề mới

- Trạng thái: `[x]`
- Owner: Asset agent
- Dependencies: UV-501, UV-802
- Việc làm:
  - Nối `asset_resolver` vào sau compiler: entity trong storyboard → asset theo thứ tự ưu tiên của UV-501.
  - Thiếu asset thì tạo gap record, không tự thay bằng asset gần giống.
- Acceptance:
  - Entity không có asset phù hợp → `needs-review` kèm tên entity, không im lặng thay thế.
  - Mỗi asset mới thêm vào catalog phải **đồng thời** cập nhật `_asset_states` trong `capability_registry.py` và có test — bài học GAP-2: khai thiếu làm router từ chối scene mà renderer thừa sức dựng.
- Implementation: asset planning được bật trong `pipeline_route.assess_source()` ngay sau compile/direct; `auto_director` biến label entity thành exact asset ID và sinh `asset_gaps` có `scene_id`, `entity_id`, `entity_name`, ID yêu cầu, capability thiếu và toàn bộ resolution attempts. `asset_resolver` chỉ cho composition mở rộng đúng base asset đã yêu cầu, không được thay subject chưa có bằng rig tương tự. Verdict/review.json nhận `ASSET_NEEDS_REVIEW` cùng gap có tên entity. Kiểm thử `tests/test_uv805_assets.py` khóa exact-label reuse, unknown-subject no-substitution, production propagation và đồng bộ state catalog ↔ manifest; bộ test `_asset_states` exhaustive hiện có tiếp tục buộc mọi asset catalog mới phải khai state và cập nhật test đồng thời.

#### UV-806 — Bền hoá state và hàng đợi

- Trạng thái: `[x]`
- Owner: Platform agent
- Dependencies: UV-802
- Việc làm:
  - Chuyển task store từ RAM sang DB; thêm queue, retry, idempotency theo `source_sha256`.
- Acceptance:
  - Restart server không mất trạng thái task đang chạy.
  - Cùng một `source_sha256` gửi hai lần không tạo hai project trùng.
  - Retry không nhân bản TTS đã trả tiền.
- Implementation: `bkt_web/remake_task_store.py` lưu queue trong SQLite `storage/remake_tasks.db`, claim bằng transaction, phục hồi task `processing` về `pending` khi startup, retry tối đa ba lần với exponential backoff và endpoint retry thủ công. Partial unique index trên `source_sha256` khiến `/start` và `/auto` trả lại cùng task/project (`idempotent_reuse: true`) khi bytes nguồn trùng; project mặc định dùng slug ổn định từ hash. Worker queue được nối vào lifespan của server. TTS cue đã hoàn tất được checkpoint theo chữ/engine/voice/role trong scratch directory ổn định và test chứng minh retry không gọi provider lần hai. Tài liệu `docs/universal_video/REMAKE_TASK_QUEUE.md`; kiểm thử `tests/test_remake_task_store.py` (5 test).

#### UV-807 — Vòng học chạy trên dữ liệu thật

- Trạng thái: `[x]`
- Owner: QA/Platform agent
- Dependencies: UV-804, UV-700, UV-701, UV-702
- Việc làm:
  - Gom manifest của các lần render thật thành `build_dashboard()`.
  - Từ dashboard sinh gap ranking (`gaps_from_dashboard` → `prioritise_gaps`) và promote pattern từ render đã duyệt.
- Acceptance:
  - Dashboard chạy trên ≥10 render thật, không phải fixture.
  - Bảng gap được dùng để chọn việc cho vòng sau, ghi lại trong plan.
- Implementation: `bkt_web/learning_loop.py` (`collect_runs`, `run_learning_cycle`, `save_report`, `load_report`, CLI `__main__`); tài liệu `docs/universal_video/LEARNING_LOOP.md`; kiểm thử `tests/test_learning_loop.py` (17 test). Quét bốn nguồn: evidence envelope UV-804, legacy project manifest, verified scripts, pipeline scratch dirs. 13 runs trên dữ liệu thật (4 legacy + 4 scripts + 5 scratch). Manifest cũ không bịa thành đã kiểm — vào `unverified`. Gap ranking ánh xạ failure reason sang gap kind qua `GAP_KIND_FROM_PREFIX`. Pattern promotion chỉ từ manifest `complete`/`partial` đã qua fidelity; pattern từ render chưa kiểm bị từ chối. Report ghi `sufficient: false` khi chưa đủ 10 run, không bịa fixture.

Gate kết thúc phase này là **Gate F** ở mục 10.

## 8. Thứ tự wave cho nhiều agent

Tối đa bốn agent chạy song song. Chỉ chạy task khi toàn bộ dependency đã hoàn thành.

### Wave 1 — Có thể chạy song song

- Agent A: UV-000 Baseline report.
- Agent B: UV-100 Storyboard v2 specification.
- Agent C: inventory cho UV-103, chỉ viết proposal/docs, chưa sửa runtime.
- Agent D: thiết kế fixture matrix cho UV-001, chưa thêm binary lớn.

### Wave 2

- Agent A: UV-001 Golden fixtures.
- Agent B: UV-101 Models/validator.
- Agent C: UV-103 Capability registry implementation.
- Agent D: chuẩn bị negative validation tests.

### Wave 3

- Agent A: UV-102 v1-to-v2 migration.
- Agent B: UV-104 Router skeleton.
- Agent C: QA parity tests cho migration.
- Agent D: docs/examples v2.

### Wave 4

- Agent A: UV-200 Component tree.
- Agent B: UV-300 Analysis result schema.
- Agent C: UV-400 Native vector adapter.
- Agent D: benchmark harness nền tảng.

Sau Wave 4, Coordinator lập wave mới dựa trên test và capability gaps; không mở đồng thời quá nhiều renderer trước khi v2/router ổn định.

### Wave 5 — Phase 8 (nối production)

- Agent A: UV-800 round-trip compiler ↔ migration, rồi UV-802 nối pipeline.
- Agent B: UV-801 analyzer thật cho `analysis_adapters`.
- Agent C: UV-803 frame → MP4 cho một adapter v2.
- Agent D: UV-804 manifest + fidelity gắn vào project.

Thứ tự chặn: UV-800 và UV-801 chạy song song được; UV-802 cần cả hai; UV-804 cần UV-802 và UV-803. UV-805/806/807 mở sau khi Gate F xanh.

Chỉ một agent được sửa `remake_pipeline.py` trong cùng một wave — đó là file production nóng nhất của cả chương trình.

## 9. Test matrix bắt buộc

### Mọi PR/task

```bash
node --check bkt_web/static/app.js
node --check bkt_web/static/remake_vector_engine.js
.venv/bin/python -m unittest discover -s tests -p test_remake_vector.py
.venv/bin/python -m unittest discover -s tests -p test_remake_pipeline.py
```

`python3` toàn cục trên máy dev hiện là 3.9.6 không có dependencies, nên phải chạy bằng venv dự án: `/opt/homebrew/bin/python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt && .venv/bin/python -m playwright install chromium`. Các suite gọi engine JS cần `node` trên PATH.

Nếu task không chạm UI/renderer, có thể chạy subset trong quá trình phát triển nhưng handoff cuối phải chạy toàn bộ matrix trên.

### Test bắt buộc theo loại thay đổi

| Thay đổi | Test bổ sung bắt buộc |
| --- | --- |
| Schema | valid, invalid, boundary, migration, non-mutation |
| Action/constraint | contact, overlap conflict, release continuity, seek determinism |
| Renderer | offline load, frame seek, no network, mobile layout |
| Analyzer | timestamp preservation, confidence, partial failure |
| Asset | checksum, provenance, missing asset, offline availability |
| Router | hard capability rejection, fallback explanation |
| Audio | duration, silence/failure, cache-key correctness |

## 10. Release gates

### Gate A — Schema foundation

Yêu cầu: UV-100 đến UV-104 hoàn tất; migration parity xanh.

### Gate B — General interaction MVP

Yêu cầu: UV-200 đến UV-204 hoàn tất; agriculture fixtures không cần scene-specific code.

### Gate C — Multi-genre MVP

Yêu cầu: native vector, motion graphics, screen/UI và footage composite adapters hoạt động; router có fallback rõ.

### Gate D — Automatic planning beta

Yêu cầu: analysis compiler + Auto Director + review workflow; không overclaim confidence.

### Gate E — Universal routing release

Yêu cầu: mọi benchmark input có render plan hoặc needs-review; manifest và fidelity report đầy đủ.

### Gate F — Production integration

Yêu cầu: UV-800 đến UV-804 hoàn tất; một nguồn không có kịch bản duyệt đi hết compile → route → render → MP4 → manifest, hoặc dừng `needs_review` với reason code cụ thể; không lần render nào tuyên bố `complete` mà thiếu bằng chứng.

### Gate G — Tự động mọi chủ đề

Yêu cầu: UV-900 → UV-903 hoàn tất; một nguồn mới đi hết compile → route → render → MP4 → manifest trên một chủ đề **không có trong catalog gốc**.

---

### Phase 9 — Đóng gap để tự động mọi chủ đề

#### UV-900 — Auto-render khi route thành công

- Trạng thái: `[x]`
- Owner: Platform agent
- Dependencies: UV-802, UV-803, UV-804
- Việc làm:
  - `_try_auto_render_v2()` trong `remake_pipeline.py`: route OK + draw-list renderer → compile → export MP4 → attach evidence.
  - Route fail hoặc render lỗi → rơi về `needs_review`, không fallback footage.
- Acceptance:
  - Nguồn route được → MP4 thật, manifest ghi renderer v2.
  - Render lỗi → `needs_review`, không file rỗng.
  - 20 test pipeline cũ vẫn xanh.
- Implementation: `RemakePipeline._try_auto_render_v2()` (135 dòng), nối `asset_generator` (UV-902) cho placeholder asset, `frame_exporter` (UV-803) cho raster, `attach_render_evidence` (UV-804) cho manifest. 19 test pipeline cũ vẫn pass (1 skip ffmpeg).

#### UV-901 — Frame exporter hỗ trợ puppet-2d ops

- Trạng thái: `[x]`
- Owner: Renderer agent
- Dependencies: UV-803
- Việc làm:
  - Thêm op `mouth` vào `SUPPORTED_OPS` trong `frame_exporter.py`.
  - Puppet-2d adapter đã trả `line`, `ellipse`, `mouth` — chỉ `mouth` chưa có.
- Acceptance:
  - Puppet draw-list → frame → raster OK.
  - Deterministic, không network.
  - 24 test frame_exporter pass (6 skip ffmpeg).
- Implementation: 15 dòng raster code cho `mouth` op (ellipse từ width/height). 3 test mới trong `PuppetRasterTest`. Coverage test `test_every_supported_op_draws_something` cập nhật.

#### UV-902 — Generated asset pipeline (placeholder)

- Trạng thái: `[x]`
- Owner: Asset agent
- Dependencies: UV-805
- Việc làm:
  - `bkt_web/asset_generator.py`: `generate_placeholders()` + `inject_generated_assets()`.
  - Character → puppet rig (adult/child/presenter từ keyword); object → rect+label.
  - Placeholder ghi `provenance.kind = "generated"`, `is_placeholder = True`, `licence = "original-owned"`.
  - Không merge vĩnh viễn vào catalog.
- Acceptance:
  - Entity "con bò" → puppet rig tất định. Entity "cái bàn" → no rig, grey skin.
  - Manifest ghi generated asset. Không thay entity khác.
  - 13 test pass.
- Implementation: `bkt_web/asset_generator.py` (175 dòng), `tests/test_asset_generator.py` (13 test).

#### UV-903 — Test e2e chủ đề mới: compile → render → MP4 → manifest

- Trạng thái: `[x]`
- Owner: QA agent
- Dependencies: UV-900, UV-901, UV-902
- Implementation: `tests/test_e2e_new_topic.py` (7 test). `RouteNeedsReviewTest`: mock `analyse_media` → `assess_source` trả needs_review với reason code cụ thể cho "robot lau nhà". `AssetGeneratorE2ETest`: pipeline route → asset gap → placeholder → inject. `FrameExporterPuppetE2ETest`: puppet ops ⊂ SUPPORTED_OPS + mouth pixel check. `AutoRenderV2E2ETest` (cần ffmpeg): motion-graphics compile → export_scene_to_mp4 → file thật > 1KB + duration > 0. 6 pass, 1 skip.

#### UV-904 — Cập nhật REVIEW_AUTO_REMAKE.md

- Trạng thái: `[x]`
- Owner: Coordinator
- Dependencies: UV-903
- Implementation: Cập nhật tất cả GAP, checklist §5, kiến trúc §3, kết luận §4 trong `docs/universal_video/REVIEW_AUTO_REMAKE.md`. GAP-1/4/5/7 đóng. GAP-2/3 một phần.

## 10.5. Phase 10 — Character-first 2D remake

> Hướng sản phẩm duy nhất cho remake nhân vật: **layered 2D puppet → Character Bible xuyên cảnh → motion library seek-safe → màn hình duyệt**. Không mở thêm nhánh sprite/3D/photoreal cho luồng này.

#### UV-1000 — Character Bible cấp project

- Trạng thái: `[x]`
- Implementation: `bkt_web/character_bible.py` tạo identity ổn định, palette warm-editorial, hair/outfit/outline/accessory và áp cùng appearance vào mọi occurrence xuyên cảnh. Có validate, atomic save/load và trạng thái duyệt.

#### UV-1001 — Layered puppet renderer

- Trạng thái: `[x]`
- Dependencies: UV-1000
- Implementation: `puppet-2d-v1` v1.1 dựng theo z-order shadow, back hair, legs/shoes, torso/clothes, arms/hands, neck/head, face, front hair, accessory; vẫn chỉ dùng draw-list primitive và absolute-time pose.

#### UV-1002 — Motion library

- Trạng thái: `[x]`
- Dependencies: UV-1001
- Implementation: `bkt_web/motion_library.py` có idle, talk, explain, point, nod, surprised, walk, reach, hold; keyframe dùng thời gian scene tuyệt đối, có anticipation/settle hữu hạn, không autonomous loop và không ghi đè pose đã author.

#### UV-1003 — Màn hình duyệt nhân vật

- Trạng thái: `[x]`
- Dependencies: UV-1000
- Implementation: API GET/PUT `/api/remake/projects/{id}/characters`, catalog `/api/remake/motion-library`, modal Character Bible trong Remake UI với preview, màu da/tóc/áo/quần/giày/viền, kiểu tóc, kính và trạng thái duyệt.

#### UV-1004 — Nâng chất lượng character art tiếp theo

- Trạng thái: `[ ]`
- Dependencies: UV-1000..UV-1003
- Việc làm: thêm turn-around front/3-quarter/profile, hand shapes, secondary hair/clothing motion, pose thumbnails và contact-sheet so sánh nhân vật giữa mọi cảnh. Chỉ triển khai sau khi có bộ video nguồn đánh giá và art-direction được duyệt.

## 11. Những việc không làm sớm

- Không thêm hàng trăm asset trước khi capability registry và component schema ổn định.
- Không rewrite native vector engine chỉ để đổi tên schema.
- Không xây 3D production trước khi multi-renderer router chạy.
- Không để model sinh thẳng code renderer cho từng scene như đường chính.
- Không dùng visual similarity làm tiêu chí duy nhất; timing, speaker và semantics quan trọng hơn.
- Không tự động duyệt output confidence thấp.

## 12. Mẫu prompt giao task cho agent

```text
Bạn đang thực hiện task <TASK_ID> trong UNIVERSAL_VIDEO_AGENT_PLAN.md.

Đọc AGENTS.md và phần Guardrails trước khi làm. Chỉ sửa các file thuộc ownership của task.
Không đọc hoặc log file credential/cookie. Không restart server hiện có.

Yêu cầu:
1. Triển khai đầy đủ acceptance criteria của task.
2. Giữ backward compatibility với native-vector-v1.
3. Thêm positive, negative và deterministic tests phù hợp.
4. Chạy test matrix được yêu cầu.
5. Handoff gồm task ID, file đổi, quyết định API/schema, test result và debt còn lại.

Nếu dependency chưa hoàn tất hoặc cần đổi public contract, dừng và báo Coordinator; không tự tạo contract cạnh tranh.
```

## 13. Task bắt đầu đề xuất

Task đầu tiên nên giao ngay là **UV-000**, **UV-100** và phần proposal của **UV-103**. Không bắt đầu component runtime hoặc renderer mới trước khi Storyboard v2 và capability contract được chốt.
