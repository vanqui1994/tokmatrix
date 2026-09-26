# Benchmark dashboard (UV-700)

Module: `bkt_web/benchmark_dashboard.py` · Tests: `tests/test_benchmark_dashboard.py`

Rolls many renders into aggregate metrics sliced by **genre**, **action**, **renderer** and **failure reason**, so the programme can see where it stands instead of arguing from the last clip somebody watched.

```python
runs = [BenchmarkRun.from_manifest(manifest, genre="agriculture", actions=["grip", "place"]) for manifest in manifests]
dashboard = build_dashboard(runs, minimum_sample=3)
dashboard.totals, dashboard.slices("renderer"), dashboard.weakest("genre"),
dashboard.failure_reasons(), dashboard.fidelity_breakdown(), dashboard.as_text()
```

## Outcomes

| Outcome | When |
|---|---|
| `passed` | fidelity ran, everything passed, and the manifest claims `complete` |
| `partial` | fidelity passed but the claim is `partial` or `needs-review` |
| `failed` | any fidelity check failed, or the claim is `failed` |
| `unverified` | **no fidelity result at all** — never counted as a pass |

A run nobody checked does not get the benefit of the doubt. `verified_rate` sits next to `pass_rate` so the difference is always visible.

## Honest aggregation

- Every rate is reported with the counts behind it (`sample_size`, `passed`, `partial`, `failed`, `unverified`), so nobody has to trust a bare percentage.
- `weakest(dimension)` refuses to rank a slice below `minimum_sample`; those slices are listed separately by `under_sampled(dimension)`.
- A run appearing under several renderers or actions counts once per key, and duplicate `run_id`s are rejected outright.
- `as_text()` gives a terminal table with the under-sampled slices flagged.

## Limits

- Genre is supplied by the caller; nothing here infers it.
- A run is one manifest: partial credit inside a run (three scenes good, one bad) shows only through its fidelity results, not as a fraction.
- No time series yet — the dashboard is a snapshot over whatever runs it is handed.
