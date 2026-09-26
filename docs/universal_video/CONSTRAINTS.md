# Constraint solver (UV-202)

Module: `bkt_web/constraint_solver.py` · Tests: `tests/test_constraint_solver.py`

The solver turns `Scene.constraints` of a Universal Storyboard v2 scene into corrected component world transforms at one absolute timestamp. It is renderer-neutral: it consumes the UV-200 component tree through the UV-201 lifecycle compiler and returns plain data, never renderer commands.

## Sampling model

Every call rebuilds state from `ComponentTreeRuntime.sample(seconds)`. Nothing carries over between calls, so `solve(t)` gives the same result whether the caller seeks forward, backward or randomly. Inputs (storyboard dicts, pydantic models, catalog data) are never mutated.

## Supported families

| Type | Aliases | Subjects | Key parameters | Residual unit |
|---|---|---|---|---|
| `point_to_point` | `anchor_contact` | 2 | `offset {x,y}` | px |
| `distance` | — | 2 | `distance` or `min_distance` / `max_distance` | px |
| `look_at` | `gaze_target` | 2 | `forward_offset_degrees` | deg |
| `ground_contact` | — | 1 | `ground_y` (required), `mode` = `on` \| `above` | px |
| `inside_container` | `containment` | 1–2 | `bounds {min_x,min_y,max_x,max_y}` | px |
| `joint_limit` | — | 1 | `min_degrees`, `max_degrees` | deg |
| `path_follow` | — | 1 | `points[]` (≥2), `closed` | px |

Hyphenated spellings (`point-to-point`, `joint-limit`, …) are accepted as aliases. Any other type is **not** silently ignored: `unsupported_constraints(scene)` lists it and `solve_storyboard_constraints` returns it under `needs_review_constraint_ids`.

Screen space has y growing downwards, so `ground_contact` with `mode: "above"` means `y <= ground_y`.

## Subject references

A subject id resolves to a component id first, then to a globally unique anchor key (anchor id or anchor name). An ambiguous anchor name or an unknown id raises `ConstraintError` instead of guessing.

The moved side defaults to the only subject that is a bare component — an anchor is a socket on a rig, a bare component is the free body. `parameters.movable_id` overrides this explicitly. Moving a component carries its whole subtree rigidly, so a rig is never torn apart.

## Priority, ordering and conflicts

Shared parameters: `priority` (default 100 hard / 50 soft), `tolerance` (default 1e-3, in the family's unit), `weight` (correction gain, default 1.0 hard / 0.5 soft), `movable_id`.

Within a pass, constraints run in **ascending** priority, soft before hard, then by `constraint_id`. The last correction wins, so the highest-priority hard constraint has the final say. The order is fully determined by these keys, never by declaration order.

The solver runs at most `max_passes` (default 8) projection passes and stops early once a pass applies no correction — it cannot loop forever. After the passes it re-evaluates every active constraint; anything still above its tolerance becomes a `ConstraintConflict` with:

- `competing_constraint_ids` — other constraints that moved the same components, and
- `reason` — `competing_constraints`, or `unsatisfiable_within_pass_budget` when nothing else touched those components.

`ConstraintSolution.converged` is true only when every active constraint is satisfied. A violated hard constraint is always reported; it is never treated as an acceptable render.

## API

```python
solver_for_scene(scene, *, max_passes=8) -> ConstraintSolver
ConstraintSolver.solve(seconds) -> ConstraintSolution
solve_storyboard_constraints(storyboard, scene_id, seconds) -> dict   # JSON-safe snapshot
unsupported_constraints(scene) -> tuple[str, ...]
```

`SUPPORTED_CONSTRAINT_TYPES` is the inspection surface for the capability registry and the router: a renderer adapter declares which of these families it can honour, and the router sends the rest to review.
