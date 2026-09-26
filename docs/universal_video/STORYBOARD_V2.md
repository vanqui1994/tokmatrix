# Universal Storyboard v2

Status: contract for UV-100

Schema version: `2.0.0`

JSON Schema: `bkt_web/schemas/universal_storyboard_v2.schema.json`

## 1. Purpose

Universal Storyboard v2 is the renderer-neutral intermediate representation between video understanding, human review, renderer routing, and export. It describes **what exists and what happens**, not how a particular Canvas, DOM, 3D, or compositing engine implements it.

The contract has five non-negotiable properties:

1. Addressable domain objects have stable IDs.
2. Timeline values are absolute seconds from the project origin.
3. Machine-derived claims carry confidence and traceable evidence.
4. Asset and decision origins are explicit provenance records.
5. Fidelity is separated into required, preferred, and optional requirements so a router cannot silently weaken a hard requirement.

The checked-in schema validates the structural layer. UV-101 owns semantic validation across objects and references.

## 2. Versioning and compatibility

`schema_version` uses semantic versioning and is required at the project root.

- Patch changes clarify descriptions or tighten implementation without changing valid meaning.
- Minor changes add backward-compatible optional fields or enum values.
- Major changes may rename fields, change meaning, or invalidate v2 documents.
- A consumer must reject unsupported major versions. It may accept a newer minor version only if it preserves unknown namespaced extensions through read/write operations.
- Producers must emit the exact version they implement. They must not label migrated v1 data as source-authored v2; migration has `provenance.kind = "migrated"`.

The canonical schema identifier is `https://ssmatool.local/schemas/universal-storyboard/v2.0.0`. Local validation does not require network access.

## 3. Stable IDs and references

Every addressable domain object has a type-specific ID: for example `scene_id`, `entity_id`, `component_id`, `action_id`, and `audio_event_id`. IDs:

- match `^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$`;
- are unique across the whole project, not merely within an array;
- remain unchanged through analysis, review, routing, compilation, and export;
- describe identity, not array position or transient render order;
- are never silently recycled after deletion.

References use the target's stable ID. A validator must reject unknown references and a reference to the wrong object class where a class is prescribed. Array order is not identity.

For imported data, a deterministic ID may be derived from the source hash, semantic type, source-local identity, and first observed timestamp. Do not derive it from a mutable label.

## 4. Time model

All `start`, `end`, and `duration_seconds` values are finite, non-negative JSON numbers in absolute seconds. `timebase.unit` is always `seconds`, and `timebase.origin_seconds` is always `0`.

- Intervals use half-open semantics: `[start, end)`.
- Every timed object must satisfy `0 <= start < end <= project.duration_seconds`.
- Scene-local offsets are not accepted in core fields.
- A child event must fall within its containing scene.
- Explicit source scene times and speaker IDs are preserved. Importers must not divide duration evenly or assign speakers cyclically.
- Editing a scene boundary does not implicitly retime its children; the editor must issue explicit updates.

`timebase.precision` describes expected decimal precision; it does not convert time to frames. A renderer samples the same absolute time for deterministic seeking.

## 5. Root Project

The root object contains:

| Field | Meaning |
|---|---|
| `schema_version` | Contract version, currently `2.0.0`. |
| `project_id` | Stable project identity. |
| `source` | Primary input metadata and SHA-256 identity. |
| `duration_seconds` | Canonical project timeline duration. |
| `timebase` | Absolute-seconds declaration. |
| `tracks` | Editorial views over canonical timeline objects. |
| `scenes` | Canonical content description. |
| `render_plan` | Explicit renderer selections, review state, and fallbacks. |
| `provenance` | Origin records and evidence collection. |
| `extensions` | Namespaced additions outside the core contract. |

`source.uri` is optional so a portable storyboard does not need to expose a local path. `source.sha256` is mandatory and remains the review/cache identity.

## 6. Tracks and timeline items

A `Track` is an editorial index, not a second copy of scene data. Its items point to canonical `Scene`, `Action`, `AudioEvent`, caption, external-media, or custom objects.

Track kinds are `visual`, `dialogue`, `music`, `sfx`, `captions`, `data`, and `custom`. An item repeats absolute `start` and `end` so scheduling can be inspected without resolving the target. Those values must equal the target interval when the target is a canonical timed object.

Layer values express compositing order only. They do not imply renderer technology.

## 7. Scenes

A `Scene` is the routing and fidelity unit. It owns:

- `Entity` objects visible, audible, or narratively relevant in its interval;
- `Relation` facts between objects;
- semantic `Action` events;
- runtime-independent `Constraint` requirements;
- `Camera` shots;
- optional `Environment` and `Style` intent;
- `AudioEvent` objects;
- a `FidelityProfile` used by routing and evaluation.

A scene can be rendered by multiple selections over non-overlapping or deliberately layered ranges. That composition is expressed in `RenderPlan`, not by adding engine fields to the scene.

## 8. Entities and Components

An `Entity` is a persistent narrative object such as a person, product, plant, pointer, UI control, chart, vehicle, or environment prop. `kind` is an open semantic vocabulary. `role` distinguishes uses such as `speaker`, `actor`, or `product` without changing identity.

A `Component` is an addressable part of an entity. It may reference a parent component and declares a semantic state:

- `visible`
- `hidden`
- `attached`
- `detached`
- `damaged`

An `Anchor` names a semantic attachment or interaction point such as `grip`, `mouth`, `stem`, or `click_target`. The core contract does not prescribe pixel coordinates, transforms, bones, SVG paths, or Canvas primitives. Asset/renderer compilation resolves a semantic anchor to native geometry.

Component parent graphs and attachment relations must be acyclic. That is a semantic validation rule.

## 9. Relations, Actions, and Constraints

### Relations

A `Relation` is a timed fact such as `inside`, `behind`, `owns`, `faces`, or `attached_to`. It links a subject and object without implying an animation implementation.

### Actions

An `Action` is a timed semantic event with one or more actors, zero or more targets, and optional parameters. Examples include `speak`, `reach`, `grip`, `detach`, `place`, `click`, and `reveal`.

Action names are open and lowercase. Reusable cross-renderer vocabulary belongs in the later action registry. Renderer-only commands such as Canvas draw calls, CSS selectors, GSAP properties, shader uniforms, or DOM node IDs are forbidden in core action fields.

### Constraints

A `Constraint` describes a condition over referenced subjects for an absolute interval. `strength = "hard"` means compilation/rendering must satisfy it or declare a fallback/review outcome. `strength = "soft"` permits optimization trade-offs.

Examples are anchor contact, ground contact, gaze target, containment, joint limit, and lip sync. `parameters` may carry renderer-neutral thresholds. Renderer-specific compiled parameters belong outside this document or in an explicitly namespaced extension.

## 10. Camera, environment, and style

`Camera.shots` partitions camera intent into absolute intervals. Framing and movement use semantic enums plus `custom`; subjects point to stable IDs. Optional parameters can express neutral concepts such as target crop or safe-area importance.

`Environment` describes setting intent. `Style` describes visual intent with tags, palette, typography, and neutral attributes. Neither chooses a renderer nor stores engine code.

Normalized evidence regions use `[0,1]` source/output coordinates only for observations such as OCR. They are not render transforms.

## 11. AudioEvent and speaker identity

An `AudioEvent` represents dialogue, music, sound effect, ambience, silence, or a custom audio event. Dialogue requires both `speaker_id` and `text`. `speaker_id` references the actual entity identity; importers must preserve it across scenes.

`media_ref` identifies a media asset known to the asset/provenance layer. The storyboard never substitutes source audio after a failed TTS or mix while reporting success. Any source reuse must be disclosed by a render-plan fallback.

## 12. Analysis confidence and evidence

Every machine-derived claim must include `analysis`:

```json
{
  "confidence": 0.94,
  "evidence_ids": ["evidence_export_button"],
  "model": "ui-analyzer-3",
  "review_status": "unreviewed"
}
```

`confidence` is calibrated in `[0,1]`; it is not a fidelity score. `evidence_ids` resolve to `Evidence` records stored under provenance. Evidence identifies source, kind, absolute interval, and optionally a normalized region, short quote, or annotation.

Rules:

- An automated claim must have at least one evidence reference.
- Evidence intervals must be within the referenced source duration.
- Human correction changes `review_status` and creates human provenance; it must not overwrite the original origin trail.
- Confidence cannot be fabricated for authored facts. Human-authored facts may omit `analysis` and still require `provenance_id`.

## 13. Provenance

Each scene and authored/analyzed content object references a `provenance_id`. Provenance kinds are `source`, `human`, `analysis`, `generated`, `imported`, and `migrated`.

A provenance record declares when and by whom/tool the data was created, optional source references and license, and its evidence records. Generated assets and source reuse must be traceable. Credentials, cookies, session data, and private browser/profile paths are never provenance.

## 14. Fidelity contract

Every scene has a `render_requirements` profile with three arrays:

| Tier | Router behavior | Failure behavior |
|---|---|---|
| `required` | Hard capability gate. Every selected route must satisfy it. | Route becomes `needs-review` or `failed`; it cannot claim a complete remake. |
| `preferred` | Ranking criterion after all hard gates pass. | Allowed only with explicit explanation and, when material, a fallback record. |
| `optional` | Enhancement with no completeness impact. | May be omitted and reported in evaluation. |

A `FidelityRequirement` names a semantic capability and target IDs. Optional `metric` and `tolerance` make acceptance measurable, for example contact error in pixels or dialogue timing error in seconds.

Tier is represented by membership, not duplicated on each item. A requirement ID must appear in exactly one tier. `required`, `preferred`, and `optional` always exist, even when empty.

## 15. RenderPlan and honest fallbacks

`RenderPlan` records route decisions without embedding compiled renderer output. A `RendererSelection` covers an absolute interval, declares renderer identity/version, satisfied requirement IDs, fallback IDs, state, and human-readable explanation.

No selection may claim `selected` when a required requirement is unsatisfied. If no safe route exists, the selection and plan use `needs-review`.

Every fallback declares:

- a stable ID and affected scene;
- a machine-readable `reason_code`;
- a human-readable `disclosure`;
- whether and how source media is reused;
- whether approval is required;
- affected fidelity requirements.

Fallback types are alternate renderer, simplification, freeze frame, source composite, generated media, and needs-review. Source composite is legitimate only when explicitly disclosed; it is never silently presented as a full reconstruction.

## 16. Extensions

Core objects set `additionalProperties: false`. Experimental or vendor data goes in `extensions`, whose keys use:

```text
reverse.dns.namespace:field_name
```

Example: `com.ssmatool.fixture:category`.

Extensions must not redefine core meaning, weaken required fidelity, hide a fallback, contain credentials, or be necessary to interpret core timing/identity. Unknown extensions must be preserved by round-trip tooling when possible and ignored safely otherwise.

## 17. Structural versus semantic validation

The JSON Schema checks types, required fields, ID syntax, enums, ranges, closed core objects, and the dialogue speaker/text condition. UV-101's semantic validator must additionally enforce:

1. Global uniqueness of every stable ID.
2. Finite numbers and `start < end <= duration_seconds`.
3. Track, scene, entity, component, speaker, evidence, requirement, and provenance references exist and have the correct type.
4. Child intervals are inside their scene; track item times match canonical targets.
5. Component/attachment graphs have no cycles.
6. Camera coverage and scene continuity rules.
7. Machine-derived objects contain confidence/evidence and their evidence references resolve.
8. Each requirement is in one fidelity tier only.
9. A selected route satisfies every required requirement or is marked `needs-review`/`failed` with disclosed fallback.
10. Source-media use is never implicit.

Validators must not mutate input. Errors should include stable codes and JSON paths.

## 18. Examples

Three complete, offline fixtures accompany the schema:

- `bkt_web/schemas/examples/agriculture.storyboard-v2.json`: articulated reach/detach/place with anchor contact.
- `bkt_web/schemas/examples/talking-head.storyboard-v2.json`: preserved speaker identity, dialogue timing, and lip sync.
- `bkt_web/schemas/examples/ui-tutorial.storyboard-v2.json`: UI actions plus an honest `needs-review` source-composite fallback.

They intentionally demonstrate different renderers without adding renderer-specific scene fields.

## 19. Minimal consumer flow

1. Select schema implementation from `schema_version`.
2. Validate JSON structure.
3. Run semantic reference/timeline validation.
4. Resolve evidence and provenance for machine-derived claims.
5. Query capabilities using required requirements as hard gates.
6. Rank eligible routes with preferred requirements.
7. Record optional omissions and every fallback in `render_plan`.
8. Compile to renderer-native data without mutating the storyboard.
9. Sample/render using absolute seconds and export the storyboard plus final fidelity report.
