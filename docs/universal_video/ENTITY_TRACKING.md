# Entity tracking and relation inference (UV-302)

Module: `bkt_web/entity_tracking.py` · Tests: `tests/test_entity_tracking.py` · Input: [Analysis Result v1](ANALYSIS_RESULT.md)

Takes one analysis document and answers two questions about it: *which tracks are the same thing across shots*, and *what was touching, holding, containing or looking at what*. Both answers stay on the observation side of the line — nothing here picks a renderer, an asset or a storyboard entity.

The result is a **separate document** that references the analysis by id, so the UV-300 schema stays exactly as frozen. `infer_tracking` never mutates the input, and the whole inference is deterministic: the same document gives byte-identical output regardless of the order the observations were written in.

## Identity linking

Tracks are compared pairwise, forward in time only. A pair is scoreable only when the categories match and the gap is within `max_link_gap_seconds`; the score then combines four components:

| Component | Weight | Meaning |
|---|---|---|
| `position` | 0.40 | `exp(-distance / position_scale)` between the last and first box centres |
| `size` | 0.25 | area ratio of those two boxes |
| `label` | 0.20 | 1 when the labels match, else 0 |
| `timing` | 0.15 | how much of the allowed gap was left unused |

A link is accepted only when **all** of these hold: the score clears `link_threshold`, both tracks clear `min_track_confidence`, the runner-up is at least `ambiguous_margin` behind, and the earlier track has not already been continued.

Anything else is recorded, not guessed:

| Reason | When |
|---|---|
| `competing_links_within_margin` | two predecessors are effectively tied — neither is chosen |
| `track_confidence_below_threshold` | the best link is plausible but the tracks are too weak to assert it |
| `source_track_already_continued` | one track cannot continue into two |

An `Identity` groups the tracks that were linked, and `resolved` is false whenever any of its tracks is caught up in an ambiguity. Identity ids are derived from the earliest track in the group, so they are stable across runs and independent of iteration order. **A label is never promoted to an identity**: two tracks that merely share a label but sit far apart stay separate.

## Relations

Boxes are linearly interpolated between samples, evaluated at the union of both tracks' sample times inside their overlap, and a relation is emitted only for runs of at least two samples lasting `min_relation_seconds`.

| Type | Condition | Basis | Confidence |
|---|---|---|---|
| `touches` | boxes overlap or are within `touch_distance`, and the offset between them keeps changing | `box_contact` | 0.85 × min track confidence |
| `holds` | contact **and** a near-constant offset, where exactly one side is a person / hand / face / animal | `contact_and_constant_offset` | 0.80 × |
| `attached_to` | the same, when neither side is an actor | `contact_and_constant_offset` | 0.75 × |
| `inside` | intersection over the subject's own area ≥ `inside_ratio` | `containment_ratio` | 0.90 × |
| `in_front_of` | significant overlap and a lower bottom edge | `lower_edge_heuristic` | 0.45 ×, always `review_required` |
| `looks_at` | a pose's facing direction points at the target within `gaze_cone_degrees` and `gaze_max_distance` | `pose_facing_cone` | pose confidence, tapered by angle |

Two rules worth stating plainly:

- **Depth is a hint, never a fact.** A lower bottom edge in a 2D frame only suggests being nearer the camera, so `in_front_of` is emitted at low confidence with `review_required = True`. It is for a reviewer, not for a renderer.
- **Gaze needs a facing cue.** `looks_at` requires either a `gaze` keypoint or `nose` plus both eyes. Without one, nothing is emitted — inventing a gaze target would be a decision, not an observation. A pose with no `track_ref` still produces a relation, but marked for review because the looker's own track is unknown.

Every relation carries its interval, confidence, `basis`, and the union of the evidence ids of the observations it came from.

## API

```python
result = infer_tracking(document, TrackingSettings(link_threshold=0.8))
result.identities      # tuple[Identity]   — track groups, with `resolved`
result.relations       # tuple[Relation]   — sorted by (start, type, subject, object)
result.ambiguities     # tuple[Ambiguity]  — what was deliberately not merged
result.identity_of(track_id)
result.relations_of("holds")
result.as_dict()       # JSON-safe, and echoes the settings the run used
```

`TrackingSettings` holds every threshold and is echoed into the result, so a decision can always be explained by the numbers that produced it. Invalid settings are rejected at construction.

## Limits

- Linking is pairwise and greedy over one pass; it does not re-open an earlier decision in the light of a later one.
- Appearance is compared by box geometry and label only — no visual embedding — so two similar-looking people crossing paths will land in an ambiguity rather than a confident link. That is the intended failure mode.
- `in_front_of` and `looks_at` are 2D approximations; neither should be consumed without review.
- Relations are pairwise. Three-body arrangements (A holds B which is inside C) come out as separate relations, and composing them is UV-303's and UV-304's job.
