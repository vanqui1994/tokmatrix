# 3D Adapter Spike — Cost and Recommendation

> Task: UV-405 (research spike, does not block the MVP)
> Status: Implemented by `bkt_web.renderer_adapters.three_d_spike`

## Question

Can a 3D route satisfy the platform's deterministic-seek rule, and what does it
cost before anyone productionises it?

## What was built

A minimal but complete path for one scene:

- **Camera** — pinhole projection from `position`/`look_at`/`fov_degrees`, with
  an optional orbit of `orbit_degrees` interpolated by a named ease.
- **Objects** — unit cube, pyramid and plane, positioned and scaled, with an
  optional constant spin expressed in degrees per second.
- **Light** — exactly one directional light with `intensity` and `ambient`.
- **Rasteriser** — backface culling, near-plane rejection, Lambert shading and
  painter ordering by centroid depth, emitting `polygon` ops in the standard
  draw list.

Every value is a closed-form function of the absolute timestamp: no scene-graph
state, no caches between frames and no randomness. Ties in the painter sort are
broken by entity ID so the order never depends on dictionary iteration.

## Result

- Deterministic seek: yes. The same timestamp yields byte-identical frames,
  from a fresh adapter instance as well.
- `cost_report(samples=n)` returns polygons per frame (min/max/mean), mesh
  count, total and per-frame seconds, and the spike's stated limits.

Timings are measured on the running machine and are informational, not
asserted by the tests — a Python software rasteriser is not a performance
target.

## Honest limits

Declared in the capabilities, not hidden in a doc:

- `maturity: "spike"`, `production_ready: false`
- no textures, no shadows, no anti-aliasing, no per-pixel z-buffer
- primitives only, one light, at most 12 entities, 600 s per scene

## Recommendation

Do not productionise this renderer as-is. Before Phase 4 becomes a real 3D
route:

1. Evaluate a GPU or offline renderer behind the same adapter contract; the
   contract is what matters, the rasteriser is replaceable.
2. Require a deterministic seek test from any replacement — it is the property
   that makes frame-by-frame export possible.
3. Re-run `cost_report()` against the candidate with a representative scene
   before committing to a per-frame budget.

Per plan §11, 3D production work stays behind a working multi-renderer router.
