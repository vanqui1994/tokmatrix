# Analysis Result v1 (UV-300)

Module: `bkt_web/analysis_result.py` · Schema: `bkt_web/schemas/analysis_result_v1.schema.json` · Examples: `bkt_web/schemas/examples/*.analysis-v1.json` · Tests: `tests/test_analysis_result.py`

What an analyzer **observed** about the source media. Not what to build from it.

## The separation rule

An observation is a claim about the source, with a source time range, a confidence and evidence. Choosing a renderer, an asset, a style, a template, a voice or a storyboard entity is a production decision that belongs to UV-304 (analysis → storyboard) and UV-502 (Auto Director). This schema refuses to carry both layers at once:

- `FORBIDDEN_DECISION_KEYS` — `renderer`, `render_plan`, `storyboard`, `entity_id`, `component_id`, `scene_id`, `asset`, `asset_id`, `template`, `style`, `palette`, `font`, `typography`, `voice`, `tts`, `caption_style`, `fallback`, `profile`, `recommendation`, `decision` and their `_id` variants — are rejected **at any depth**, including inside `extensions` and analyzer `parameters`, with code `CREATIVE_DECISION_IN_ANALYSIS`.
- Identity stays observational. A transcript carries `speaker_label` (`"speaker_00"`), never a storyboard `speaker_id`. Mapping a diarisation label to a real person is a later decision that UV-302 and UV-503 make.
- Ambiguity survives instead of being resolved early: `alternatives` holds competing readings with their own confidences, `identity_resolved` stays false until an analyzer can justify it, and `review_status` starts at `unreviewed`.

## Document shape

```text
AnalysisResultV1
├── schema_version "1.0.0", analysis_id
├── source          (shared Source of Universal Storyboard v2: sha256, media_type, size, fps)
├── timebase        (seconds, origin 0)  +  duration_seconds
├── analyzers[]     (analyzer_id, kind, name, version, ran_at, parameters)
├── evidence[]      (shared Evidence: frame / frame_range / audio_range / transcript_span / ocr_region / …)
├── observations[]  (discriminated on `kind`)
└── failures[]      (analyzer_id, reason, message, covered interval)
```

Reusing the storyboard's `Source`, `Interval`, `Region` and `Evidence` means evidence gathered here can be carried into a storyboard's provenance without translation.

Every observation carries `observation_id`, `analyzer_id`, `source_interval`, `confidence` in `[0,1]`, **at least one** `evidence_ids` entry, `review_status`, optional `alternatives` and `notes`.

| `kind` | Payload |
|---|---|
| `shot` | `index`, `boundary` (cut / dissolve / fade / wipe / unknown) |
| `transcript` | `text`, `language`, `speaker_label`, word-level `words[]` with their own timings and confidence |
| `ocr` | `text`, `region`, `language` |
| `track` | `label`, `category`, timed `samples[]` of normalized boxes, `identity_resolved` |
| `pose` | `track_ref`, `time`, `keypoints[]` in normalized source space |
| `action` | `label`, `actor_track_ref`, `target_track_ref` |
| `camera` | `movement`, `magnitude`, `direction_degrees`, `subject_track_ref` |
| `audio_event` | `category`, `speaker_label`, `loudness_lufs`, `peak_db` |

All coordinates are `normalized_source` in `[0,1]`; they are observations of the source frame, not render transforms.

## Validation

`validate_analysis_result(data)` never mutates its input and raises `AnalysisValidationError` carrying **every** issue with a stable code and a JSON path:

- structural — `REQUIRED_FIELD`, `UNKNOWN_FIELD`, `INVALID_VALUE`, `UNKNOWN_OBSERVATION_KIND`
- hostile input — `NON_FINITE_NUMBER`, `PATH_TRAVERSAL`, `INVALID_OBJECT_KEY`, `DOCUMENT_TOO_LARGE`, `INVALID_JSON`
- semantic — `DUPLICATE_ID`, `UNKNOWN_REFERENCE`, `INVALID_INTERVAL`, `INTERVAL_OUT_OF_SOURCE`, `WORD_OUTSIDE_OBSERVATION`, `WORDS_OUT_OF_ORDER`, `SAMPLE_OUTSIDE_OBSERVATION`, `SAMPLES_OUT_OF_ORDER`, `INVALID_REGION_SPACE`, `OVERLAPPING_SHOTS`, `UNSUPPORTED_IDENTITY_CLAIM`
- layering — `CREATIVE_DECISION_IN_ANALYSIS`

Notable rules: evidence must reference the analysed source; pose/action/camera references must point at a `track` observation in the same document; shots from **one** analyzer may not overlap, while two analyzers are free to disagree about the same stretch of video; a track may not claim `identity_resolved` below 0.5 confidence.

## Partial failure

`failures[]` records an analyzer that did not finish (`unavailable`, `timeout`, `unsupported_media`, `low_quality_input`, `internal_error`, `cancelled`) with the interval it was supposed to cover. A failure never removes what other analyzers produced — that is the property UV-301 must preserve, and the shipped agriculture example carries a failed depth analyzer alongside complete transcript and track results.

## API

```python
validate_analysis_result(data) -> AnalysisResultV1
validate_analysis_result_json(raw) -> AnalysisResultV1     # strict JSON, no NaN/Infinity tokens
observations_of(document, kind) -> tuple[...]
covered_intervals(document, kind) -> tuple[(start, end), ...]
```

The JSON Schema file is generated from these models; `tests/test_analysis_result.py::test_json_schema_file_matches_the_models` fails if the two drift apart. Regenerate it with `AnalysisResultV1.model_json_schema(mode="validation")`.
