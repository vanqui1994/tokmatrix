# Analysis-to-storyboard compiler (UV-304)

Module: `bkt_web/analysis_compiler.py` · Tests: `tests/test_analysis_compiler.py` · Inputs: [Analysis Result v1](ANALYSIS_RESULT.md), [tracking](ENTITY_TRACKING.md), [actions and camera](ACTION_INFERENCE.md) · Output: [Universal Storyboard v2](STORYBOARD_V2.md)

The seam between *what the source shows* and *what we will build*. It emits a storyboard that passes `validate_storyboard_v2`, and nothing more than the observations support.

## Nothing is invented

Every entity, relation, action and audio event the compiler emits is backed by an observation and carries that observation's evidence ids in its `analysis` block. What cannot be grounded is skipped and reported in `CompileResult.skipped`, never filled in:

| Skipped | Reason |
|---|---|
| a relation or action whose track has no entity in that scene | `*_track_has_no_entity_in_this_scene` |
| a transcript with no diarisation label | `dialogue_without_speaker_label` — dialogue needs a speaker, and inventing one is exactly the wrong move |
| a shot that is empty after clipping | `shot_is_empty_after_clipping` |

The compiler also refuses to fill in things the analysis layer never looked at: `constraints` is empty, `render_requirements` is empty in all three tiers, `style` and `environment` are `None`, and camera shots use `framing: "custom"` because framing is never inferred anywhere upstream.

**No renderer is chosen.** Every scene gets one selection with `status: "needs-review"`, `renderer_id: "renderer.unassigned"` and an explanation saying routing is UV-104's and UV-502's decision; the plan's own status is `needs-review`.

## Uncertainty survives

| Where | What it carries |
|---|---|
| `analysis.confidence` | the identity's, relation's or action's confidence |
| `analysis.review_status` | always `unreviewed` — this compiler approves nothing |
| `analysis.evidence_ids` | the evidence the claim rests on |
| `entity.attributes.identity_resolved` | false when UV-302 refused to merge the tracks |
| `entity.attributes.label_alternatives` | competing labels with their confidences |
| `entity.attributes.identity_source` | `diarisation_label` for speaker entities — a label says two lines share a voice, not whose |
| `action.parameters` / `relation.attributes` | `basis` and `review_required` from the inference |
| `CompileResult.uncertainties` | one flat list of everything a reviewer should look at |

## Structure

- **Scenes** come from shot observations, clipped to the source and extended so they tile `[0, duration]` exactly, as the schema demands. A gap between shots is filled with a `scene.gap.*` and reported; a source with no shots becomes one scene, also reported.
- **Entities** come from UV-302 identities overlapping the scene, one component (`<entity>.body`) each — no rig is invented. Speaker entities come from diarisation labels.
- **Relations** and **actions** map track references through the identity map; `looks_at` becomes `looks.at`, matching the storyboard's id grammar.
- **Audio events** are dialogue entries from transcript observations, with `speaker_id` pointing at the speaker entity.
- **Camera** shots come from UV-303 segments clipped to the scene, stretched to tile it.
- **Provenance** is a single `analysis` entry carrying every evidence record from the analysis document unchanged — the shared `Evidence` model means no translation is needed.

## Ids and instants

Ids are **scene-scoped**: an identity that spans several scenes appears as one entity per scene (`entity.<scene>.<identity>`), so no reference ever crosses a scene boundary — the schema forbids that, and re-using one id across scenes would also collide.

Universal Storyboard v2 requires `start < end`, but a grip or a placement is observed as a moment. Such an event is widened by exactly one frame (from the source's `frame_rate`, else 40 ms) inside its scene and marked `parameters.instant = true`; if even that does not fit, it is skipped and reported rather than stretched. A single-frame evidence record is widened the same way when it is copied into provenance — one frame is the width that frame actually had.

## Determinism

Ids derive from observation ids, every list is sorted, and the only clock value is the one the caller supplies. `created_at` defaults to the latest analyzer `ran_at`; when no analyzer declares one, the compiler **raises** rather than inventing a timestamp. Compiling twice, or compiling with the observations in the opposite order, produces an identical document, and the input analysis is never mutated.

## API

```python
result = compile_storyboard(analysis, tracking=None, inference=None, *, created_at=None, project_id=None)
result.storyboard     # plain dict, already validated
result.project        # the validated UniversalStoryboardV2 model
result.skipped        # observations that could not be grounded
result.uncertainties  # everything a reviewer should look at
```

Passing a tracking or inference result from a different analysis is rejected.
