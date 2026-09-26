# Structural fidelity checks (UV-600)

Module: `bkt_web/fidelity_structural.py` · Tests: `tests/test_fidelity_structural.py`

Compares a **reference** project — normally the [UV-304 compile](ANALYSIS_COMPILER.md) of what the source actually shows — against the **candidate** project that will be rendered, and reports where the remake drifted from the source in ways no amount of visual polish can excuse.

```python
report = check_structural_fidelity(reference, candidate, FidelitySettings(min_action_coverage=0.95))
report.passed          # no failures
report.failures        # hard findings
report.warnings
report.by_category("speaker")
report.metrics         # coverage ratios and worst drifts
report.as_dict()       # JSON-safe, echoes the settings used
```

Both documents are validated first, neither is mutated, and every finding carries a stable `code`, a severity, the refs it concerns and the measured/expected numbers.

## Matching before judging

Entity ids are **scene-scoped** in Universal Storyboard v2, so the same person in two scenes has two ids. Matching therefore works like this:

- when both projects have the same number of scenes, a match must stay **inside its own scene** — otherwise the farmer in scene 1 could pair with their appearance in scene 2 and a real disappearance would go unnoticed;
- entities pair by id first, then by `kind` + `label`;
- actions pair by type and by translated actor/target, choosing the smallest time drift;
- dialogue pairs on its **text**, because the words are what the source said;
- what cannot be paired is reported as missing or added. Nothing is paired up just to make the numbers look better.

Across scenes, an identity is carried by `kind` + `label`; that is what the continuity and round-robin checks compare.

## What is checked

| Category | Codes |
|---|---|
| `timing` | `DURATION_MISMATCH`, `SCENE_COUNT_CHANGED`, `SCENE_TIMING_SHIFTED`, `ACTION_TIMING_SHIFTED`, `DIALOGUE_TIMING_SHIFTED` |
| `speaker` | `DIALOGUE_MISSING`, `DIALOGUE_COVERAGE_LOW`, `DIALOGUE_ADDED` (warn), `SPEAKER_CHANGED`, `SPEAKER_ASSIGNED_CYCLICALLY` |
| `coverage` | `ENTITY_MISSING`, `ENTITY_COVERAGE_LOW`, `ENTITY_ADDED`, `ACTION_MISSING`, `ACTION_COVERAGE_LOW`, `ACTION_ADDED` |
| `order` | `ACTION_ORDER_CHANGED`, `DIALOGUE_ORDER_CHANGED` |
| `continuity` | `SCENE_TIMELINE_BROKEN`, `ENTITY_PRESENCE_GAP` |

Two checks exist because the program's guardrails name them:

- **`SPEAKER_ASSIGNED_CYCLICALLY`** — if the candidate hands speakers out in a round robin (`A, B, A, B…`) while the source does not, that is caught even when every individual line still has *a* speaker. Handing out speakers by position is the failure mode the plan explicitly forbids.
- **`ACTION_ADDED`** — an action with no counterpart in the source is an invention, and fails by default (`allow_added_actions=False`). An added *entity* is only a warning by default, because a title card or a logo is a normal production addition; a strict profile can set `allow_added_entities=False`.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `timing_tolerance_seconds` | 0.05 | how far a scene boundary or event may move |
| `duration_tolerance_seconds` | 0.05 | how far the total duration may move |
| `min_entity_coverage` | 1.0 | fraction of source entities that must survive |
| `min_action_coverage` | 0.90 | fraction of source actions that must survive |
| `min_dialogue_coverage` | 1.0 | fraction of source lines that must survive |
| `allow_added_entities` | true | added entity is a warning instead of a failure |
| `allow_added_actions` | false | added action is a failure |
| `allow_reordering` | false | order changes are failures |

Thresholds are per profile — a source-faithful remake and a TikTok-fast cut do not deserve the same numbers — and the report always echoes the ones it used, so a verdict can be explained.

## Limits

- This layer compares **structure**, not pixels or audio; perceptual comparison is UV-602.
- Matching is greedy in one pass; it does not backtrack to find a globally optimal pairing.
- Labels matter: two entities with the same kind and an empty label cannot be told apart, so they pair by position within the scene.
- A candidate with a different number of scenes falls back to global matching and only `SCENE_COUNT_CHANGED` plus coverage findings are meaningful; continuity checks are skipped.
