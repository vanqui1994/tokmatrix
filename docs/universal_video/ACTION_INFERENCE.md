# Action and camera inference (UV-303)

Module: `bkt_web/action_inference.py` · Tests: `tests/test_action_inference.py` · Inputs: [Analysis Result v1](ANALYSIS_RESULT.md) + [tracking result](ENTITY_TRACKING.md)

Answers two more questions about the source: **how did the camera move**, and **what did somebody do to something**. Still observation-side: no renderer, asset or storyboard entity is chosen here.

## The camera comes first

A box sliding across the frame is either an object moving or the camera panning, and no single track can tell the two apart. So for every step between consecutive sample times a global motion is estimated from all tracks alive in that step:

- translation = median displacement, scale = median area ratio;
- the motion is the **camera's** only when enough tracks agree — the inlier fraction (tracks within `camera_coherence × magnitude` of the median) must reach `camera_inlier_ratio`, default 0.6. A bare majority of two objects drifting together while the rest of the frame holds still is those objects moving, not the lens. The same inlier rule gates zoom, so one box growing on its own reads as something approaching, not a lens change;
- consecutive steps with the same movement merge into a `CameraSegment` (`static`, `pan`, `tilt`, `zoom`, `unknown`).

Actions are then inferred from **residual** motion: each track's displacement minus what the camera explains, with zoom compensated about the frame centre. A track that only moved because the camera panned produces no motion and no action.

When a step has fewer than `camera_min_tracks` tracks, the two cannot be separated at all. That is said out loud: the segment is `unknown`, `confidence` is 0, `basis` is `single_track_not_separable`, and a review item is raised. It is never quietly called static.

## Actions

Every emitted action has an actor, a target, a start, an end and the evidence ids it came from.

| Action | Inferred from | Basis |
|---|---|---|
| `reach` | the actor's residual motion in the window before a grip, **and** the distance to the target actually shrinking | `residual_approach` |
| `grip` | the onset of a `holds` relation, extended back over the contact that led into it | `holds_onset` |
| `carry` | a `holds` relation during which the held track has residual motion | `held_with_residual_motion` |
| `place` | a `holds` relation that ends as the target becomes `inside` a container | `hold_ends_in_containment` |
| `release` | a `holds` relation that ends with nothing containing the target | `holds_offset` |
| `look_at` | a `looks_at` relation from UV-302 | `pose_facing_cone` |

Motion with no counterpart is **not** an action: an object crossing the frame alone has no target, so it is reported separately as `ObjectMotion` (camera-compensated) and left for a later stage to interpret.

## Review items

A claim goes to review instead of standing as a fact when any of these holds:

| Reason | Meaning |
|---|---|
| `confidence_below_threshold` | below `review_threshold` (default 0.6) |
| `derived_from_reviewable_relation` | built on something UV-302 already flagged, such as a gaze with no known looker |
| `actor_or_target_identity_unresolved` | the actor or target belongs to an identity UV-302 refused to merge |
| `camera_motion_not_separable_from_object_motion` | too few tracks to tell camera from object |

UV-302's own ambiguities are carried through as `identity` review items, so one list covers everything a human needs to look at.

## API

```python
result = infer_actions_and_camera(document)                      # tracking inferred on the spot
result = infer_actions_and_camera(document, tracking, settings)  # or reuse a tracking result
result.camera        # tuple[CameraSegment]
result.actions       # tuple[InferredAction], sorted by (start, type, actor, target)
result.motions       # tuple[ObjectMotion]  — camera-compensated, targetless
result.review_items  # tuple[ReviewItem]
result.actions_of("grip")
result.as_dict()     # JSON-safe, echoes the settings used
```

A tracking result from a different analysis is rejected. The input document is never mutated, and the output does not depend on the order observations were written in.

## Limits

- Global motion is estimated from track boxes only, not from image features, so it needs a still majority in frame. A scene where most of the frame is moving will be read as camera motion.
- Only translation and uniform scale are modelled — no rotation, no rolling shutter, no parallax.
- `reach` requires the actor's own residual motion; a hand that stays put while the target comes to it is not a reach, and is not claimed as one.
- `grip` is a boundary, so it can be zero-length when contact and hold begin in the same step.
- Actions are pairwise and derived from UV-302's relations; anything UV-302 could not see (occluded contact, off-screen action) is invisible here too.
