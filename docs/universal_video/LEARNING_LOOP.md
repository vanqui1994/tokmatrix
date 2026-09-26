# Learning loop — vòng học chạy trên dữ liệu thật (UV-807)

Module: `bkt_web/learning_loop.py`  
Tests: `tests/test_learning_loop.py`

UV-807 nối ba module đã xây — benchmark dashboard (UV-700), capability gap
prioritizer (UV-702) và approved-pattern library (UV-701) — vào dữ liệu
render thật do UV-804 ghi lại.

## Dữ liệu đầu vào

`collect_runs` quét bốn nguồn, theo thứ tự ưu tiên:

| Nguồn | Nơi lưu | Kết quả |
|-------|---------|---------|
| Evidence envelope UV-804 | `remake_projects/*/manifest.json` | `BenchmarkRun` có fidelity thật |
| Legacy project manifest | `remake_projects/*/manifest.json` hoặc `project.json` | `BenchmarkRun` unverified |
| Verified scripts | `storage/remake_verified_scripts.json` | `BenchmarkRun` unverified |
| Pipeline scratch dirs | `storage/remake_scratch/*/cues.json` | `BenchmarkRun` unverified |

Run ID trùng giữa các nguồn → giữ nguồn đầu tiên. File lỗi tạo warning,
không crash.

## Luồng xử lý

```text
collect_runs(projects, scripts, scratch)
    → BenchmarkRun[]
        → build_dashboard(runs)        (UV-700)
        → gaps_from_dashboard(dash)    (UV-702)
        → prioritise_gaps(obs, ...)    (UV-702)
        → pattern_from_approved_render (UV-701, nếu có candidate)
    → LearningReport
        → save_report(folder, report)
```

## Đánh giá đủ dữ liệu

Acceptance đòi ≥10 render thật. `LearningReport.sufficient` cho biết có đạt
hay không. Nếu chưa đủ, report ghi rõ `actual_runs` — **không bịa fixture**.

## CLI

```bash
.venv/bin/python -m bkt_web.learning_loop \
    [--projects-dir DIR] \
    [--scripts FILE] \
    [--scratch-dir DIR] \
    [--output DIR]
```

Không có `--output` thì chỉ in bảng text. Có `--output` thì ghi:
- `learning_report.json` — report đầy đủ
- `dashboard.json` — chỉ dashboard
- `gap_ranking.json` — chỉ gap ranking

## Gap ranking

Mỗi failure reason từ dashboard được ánh xạ sang gap kind qua
`GAP_KIND_FROM_PREFIX`. Gap chưa biết kind → `other`. Gap xếp hạng bằng
trọng số minh bạch: 0.45 frequency / 0.40 fidelity impact / 0.15 cost.

## Verification

```bash
.venv/bin/python -m unittest discover -s tests -p test_learning_loop.py
.venv/bin/python -m bkt_web.learning_loop
```
