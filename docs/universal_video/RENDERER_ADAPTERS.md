# Renderer Adapters

> Tasks: UV-400 … UV-405
> Status: Implemented by `bkt_web.renderer_adapters`

## Purpose

Phase 4 gives every renderer family one contract so the router can plan across
them and so no renderer can quietly overstate what it renders.

An adapter answers six calls (plan §5.3):

| Call | Meaning |
|---|---|
| `inspect_capabilities()` | capability-registry sub-document for this renderer |
| `validate(scene, assets)` | list of `AdapterIssue`; empty means renderable |
| `compile(scene, assets, canvas=...)` | deterministic `CompiledScene` |
| `render_frame(seconds)` | one frame at an absolute timestamp |
| `render_range(start, end, fps=...)` | frames on a fixed grid |
| `report_fallbacks()` | storyboard-shaped `Fallback` records of the last compile |

`compile()` never mutates its input, `render_frame()` never depends on a
previous frame, and an adapter that cannot render raises `SceneNotSupported`
instead of returning a placeholder.

## Frame modes

Two honest modes exist, declared per adapter in `frame_mode`:

- **`draw-list`** — the adapter computes a declarative draw list in Python, so
  a frame can be produced offline with no browser. Ops: `rect`,
  `rect_outline`, `ellipse`, `line`, `polygon`, `text`, `image`,
  `video_frame`, `blur_rect`, `dim`, `cursor`, `mouth`.
- **`host-callback`** — pixels are produced by JavaScript. The frame carries
  the seek state and the entry point a host must call
  (`window.renderFrame(seconds)`), and states `python_rasterisation: false`.
  `native-vector-v1` is this mode; it does not claim Python frame rendering.

A frame envelope always carries `schema`, `renderer_id`, `renderer_version`,
`scene_id`, `seconds`, `canvas`, `kind` and `source_media_usage`.

## Registration and inspection

Adapters are listed explicitly in `bkt_web/renderer_adapters/registry.py`, so
the renderer set is identical in every process. `merge_adapter_capabilities()`
folds each sub-document into the capability registry and refuses two different
definitions of one ID instead of letting one shadow the other.

- `capability_registry.inspect_registry()` — native + every adapter (used by
  the router).
- `capability_registry.native_registry_document()` — native only, for tests
  that need a controlled document.
- `GET /api/remake/renderers` — inspection API: frame mode, offline-render
  flag, canvas sizes, features, limits, fidelity and maturity per adapter.

## Adapters

### UV-400 `native-vector-v1` (wrapper, not a rewrite)

Wraps the existing engine and catalog. `compile()` takes the migrated v2
project through `assets={"storyboard": ...}`, restores the byte-identical v1
story with `restore_v1_from_v2()` and matches the scene by its explicit source
times — it never re-slices the timeline. `offline_bundle()` emits HTML with the
engine and catalog embedded, defines `window.renderFrame` and starts no
animation loop.

### UV-401 `motion-graphics-v1`

Entity kinds: `text`, `shape`, `card`, `lower_third`, `chart`, `callout`.
Actions: `mg.reveal`, `mg.emphasize`, `mg.chart-grow`, `mg.callout-point`,
`mg.dismiss`. Canvases: 9:16, 16:9, 1:1.

Layout is resolved once at compile: boxes are clamped into the safe area, text
is wrapped and shrunk (down to 45% of the requested size) until it fits, and
chart labels are fitted to their column. Text that still does not fit raises
`MG_TEXT_OVERFLOW` rather than overflowing. Fonts resolve through a fixed
metric table, so an unavailable family always lands on the same stack and the
substitution is reported in `CompiledScene.warnings`.

Entity attributes: `text`, `box` (normalised), `font_family`,
`font_size_fraction`, `fill`, `stroke`, `z`, `shape`, `series`, `chart_type`,
`anchor_point`.

### UV-402 `screen-ui-v1`

Entity kinds: `screenshot`, `cursor`, `highlight`, `redaction`, `focus_ring`.

Privacy is a hard gate: a region flagged `contains_private_data` must be fully
covered by a redaction or compilation fails with
`UI_PRIVATE_REGION_NOT_REDACTED`. Screenshots must be frozen locally with a
checksum; a remote URI is rejected (`UI_IMAGE_REMOTE`) so frames never depend
on the network. Crop/zoom comes from camera shots with `movement: "zoom"` and
`from_region`/`to_region`, interpolated by a named ease — `crop_at()` is a pure
function of the timestamp.

### UV-403 `footage-composite-v1`

Entity kinds: `footage`, `overlay`, `mask`; operations `fc.cut`, `fc.crop`,
`fc.mask`, `fc.overlay`, `fc.remove-background`, `fc.color-transform`.

Source reuse is never silent:

- `CompiledScene.fidelity_class` is `source-composite`, never a full remake.
- `manifest()` lists every segment with its source ID, checksum, source and
  output intervals, operations and whether source audio is kept.
- `report_fallbacks()` returns a `source_composite` fallback with
  `reason_code: SOURCE_MEDIA_REUSED`, `approval_required: true` and the
  disclosure text.
- If the scene requires `feature.no_source_media_reuse` (or the job passes
  `policy.allow_source_reuse = false`), compilation fails with
  `FC_SOURCE_REUSE_FORBIDDEN` instead of shipping source frames.

### UV-404 `puppet-2d-v1`

Rigs live in `bkt_web/schemas/puppet_rigs.json` (adult, child, presenter) and
are reused across characters: proportions are fractions of the character's
height, so one rig serves any size. Each keyframe is resolved at compile into
full pixel-space channels (missing effectors take that keyframe's rest pose),
so a channel that appears late still interpolates instead of jumping.

- Full-body IK: analytic two-bone solve per arm and leg. Out-of-reach targets
  are clamped and flagged `reach_limited`; joint limits are reported through
  `joint_limited`.
- Lip sync: visemes derived from the dialogue text already in the storyboard,
  distributed across the audio event. The mouth rests whenever that speaker has
  no active dialogue. No dialogue is invented.
- Expressions: keyframed, from the library's expression table.

### UV-405 `three-d-spike-v1` (research spike)

One camera, primitive meshes (cube, pyramid, plane) and one directional light,
rendered by a small deterministic software rasteriser into projected polygons
with Lambert shading and painter ordering. Declares `maturity: "spike"` and
`production_ready: false`, with no textures and no shadows. `cost_report()`
returns polygon counts and measured timings. See `RENDERER_3D_SPIKE.md`.

## Offline export

`build_draw_list_bundle(adapter)` writes self-contained HTML: the painter
`bkt_web/static/remake_frame_runtime.js` plus the frames the adapter already
computed on a fixed grid. Seeking is a lookup, so nothing is recomputed in the
browser and an exported frame equals the Python frame. It refuses
`host-callback` renderers — `native-vector-v1` exports through its own
`offline_bundle()`.

## Tests

```bash
python3 -m unittest discover -s tests -p test_renderer_adapters.py
node --check bkt_web/static/remake_frame_runtime.js
```

Coverage: contract conformance and registry merge, native parity for the five
library examples, responsive layout and overflow refusal, privacy gating and
deterministic crop, manifest/fallback disclosure and reuse refusal, IK and lip
sync, spike determinism and cost report, offline bundles, inspection API.
