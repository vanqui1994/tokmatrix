"""Engine video vector (docs/PLAN_vector_video_engine.md): storyboard beat → story vector → MP4 qua Matrix.

Các module:
- `extents`: kích thước thật của từng rig (đo một lần bằng Playwright, lưu `remake_vector_extents.json`);
- `niches`: niche Matrix → nền, nhân vật, vật thể cho phép (`compare_studio/config/vector_niches.json`);
- `dna`: DNA hình ảnh theo kênh (tông màu, dàn diễn, khung hình, nhịp, phụ đề);
- `builder`: storyboard + thời lượng TTS đo thật → story vector (beat → pose/action, slot cố định);
- `qa`: kiểm hình học trước khi dựng (trong khung, không chồng, chạm đất, đủ cỡ…);
- `cli`: `python3 -m bkt_web.vector_video build|qa|preview|bundle|extents|assign-dna`.
"""
