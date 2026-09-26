# Capability gap prioritizer (UV-702)

Module: `bkt_web/capability_gaps.py` · Tests: `tests/test_capability_gaps.py`

Turns the benchmark evidence into an ordered list of what to build next.

```python
observations = gaps_from_dashboard(dashboard, kind_of={"fidelity_failed": "analysis"})
report = prioritise_gaps(observations, total_runs=dashboard.totals["runs"],
                         costs=[CostEstimate("action:pour", "small")], minimum_sample=2)
report.top(5), report.emerging, report.unestimated, report.as_text()
```

## The score

A transparent weighted sum of three normalised components, defaults `0.45 / 0.40 / 0.15`:

| Component | Meaning |
|---|---|
| `frequency_score` | distinct runs the gap appeared in, over **all** runs — not just failing ones |
| `fidelity_impact_score` | mean severity: `blocked` 1.0, `degraded` 0.6, `cosmetic` 0.25 |
| `cost_score` | `1 − cost`, so a cheap fix ranks higher: small 0.2, medium 0.5, **unknown 0.6**, large 0.8 |

Every ranked gap carries all three components plus `runs_seen`, `runs_blocked`, its severity mix, the genres it hit and the details it came from, so a priority can be argued with rather than believed. `Weights` must sum to 1.

## Two honesty rules

- **An unestimated gap is not assumed cheap.** With no `CostEstimate`, the cost is `unknown` — deliberately worse than `medium` — and the gap id appears in `report.unestimated` and is flagged in the text view.
- **A gap seen fewer times than `minimum_sample` is `emerging`, not ranked.** It stays visible without pretending one sighting is a trend.

Repeat observations within one run do not inflate frequency; a run is counted once per gap.

## Feeding it

`gaps_from_dashboard` reads the UV-700 dashboard's failure reasons: a reason like `fidelity_failed:structural` becomes a gap on that id, with severity `blocked` when the run failed and `degraded` otherwise. A reason prefix can be mapped onto a gap kind via `kind_of`; anything unmapped is recorded as `other` rather than guessed at.

## Limits

- Cost is a human estimate on a four-level scale, not an engineering model.
- Severity is supplied per observation; nothing here infers how badly a gap hurt from the render itself.
- Gaps are independent in the ranking — it does not know that closing one would close another.
