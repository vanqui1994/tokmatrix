# Geometric fidelity checks (UV-601)

Module: `bkt_web/fidelity_geometric.py` · Tests: `tests/test_fidelity_geometric.py`

[Structural fidelity](FIDELITY_STRUCTURAL.md) answers *did the right things happen*; this layer answers *did they happen without the geometry falling apart*.

```python
report = check_geometric_fidelity(storyboard, GeometricSettings(sample_rate=30), scene_id="scene.one")
reports = check_storyboard_geometry(storyboard)   # every scene
report.passed, report.failures, report.by_category("contact"), report.metrics, report.unchecked
```

## What is sampled, and from where

Frames come from a fixed grid (`sample_rate`, default 24 fps) **plus the exact frames either side of every lifecycle event**, so an attach or detach is never missed between samples. Each frame is computed from absolute time, so the run is deterministic and independent of the order frames are asked for.

Geometry is read from the **solved** state — the UV-202 solver's output — not the raw component runtime. That is what a renderer draws; the unsolved runtime has no constraints applied at all and would report a scene that never existed.

## What is checked

| Category | Codes | Rule |
|---|---|---|
| `contact` | `CONTACT_GAP` | a `point_to_point` / `distance` / `inside_container` constraint the solver could not satisfy; hard constraints fail, soft ones warn |
| `ground` | `GROUND_SLIP` | horizontal travel while a `ground_contact` constraint holds the component |
| `intersection` | `COMPONENTS_INTERSECT` | two solid components overlapping beyond `intersection_ratio` |
| `attachment` | `ATTACHMENT_JUMP` | a part moving more than `attachment_jump` at the frame its parent changes |
| `joint` | `JOINT_LIMIT_EXCEEDED`, `RIG_JOINT_LIMIT_EXCEEDED` | a hinge outside a constraint's limit, or outside the limit its own rig declares |

Two exemptions that keep the checker honest rather than noisy:

- **Things in contact are meant to overlap.** A hand around a fruit is not an intersection defect, so component pairs held together by a contact constraint at that moment are exempt. So are a parent and its child.
- **A rig limit is checked even with no constraint.** `component.attributes.joint_limit` is enforced on its own, so a rig cannot be bent past its declared range just because nobody wrote a constraint.

## Declaring geometry

Intersection needs sizes, and the storyboard has none, so a component opts in with `attributes.bounds` = `{width, height, offset_x?, offset_y?}`. A component **without** bounds is listed in `report.unchecked` with `no_bounds_declared` and counted in `components_without_bounds` — it is never counted as clean.

## Metrics

`worst_contact_gap_px`, `worst_ground_slip_px_per_second`, `worst_intersection_ratio`, `worst_attachment_jump_px`, `worst_joint_excess_degrees`, plus how many components were and were not checked.

## Limits

- Bounding boxes are axis-aligned; a rotated part is checked by its upright box, so a near-miss between rotated shapes can read as an overlap.
- Ground contact is recognised only from a `ground_contact` constraint that names the component directly; an anchor subject does not ground its owner.
- Sampling can still miss a defect shorter than one frame at the chosen rate, everywhere except at lifecycle events.
