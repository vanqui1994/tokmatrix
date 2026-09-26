# CODEBASE AUDIT — AI VIDEO FACTORY V2.1

**Ngày audit:** 2026-09-23  
**Phạm vi:** Compare Studio engines, Node bridge, image queue, TTS/audio, FastAPI runs, rendering, publishing, and scene-resume boundaries.  
**Kết quả Sprint 0:** PASS — existing contracts and limitations are documented before continuing implementation.

## 1. Existing contracts

| Area | Existing implementation | Reuse contract / finding |
|---|---|---|
| FastAPI host and router | `bkt_web/server.py` includes `compare_native_router` and `image_router`; app startup initializes the image DB/worker and upload cleanup. | Add Matrix APIs as a separate router/module and register it in the existing app. Do not add a second web server or proxy. |
| Python → Node bridge | `bkt_web/compare_native.py::bridge(op, args, timeout=120)` runs `node tools/studio-bridge.mjs <op>` in `COMPARE_DIR`, sends one JSON object on stdin, reads one JSON response line, and turns `{ok:false}` into `BridgeError`. | Preserve the one-shot JSON protocol and stdout purity if adding Matrix operations. The bridge currently has no Matrix operations. |
| Existing Studio API | `compare_native.py` exposes topics, template previews, voices/TTS preview, audio catalogs/detection, video library/detail/render/download, image operations and `/api/runs` with SSE/stop routes. `/api/runs` validates task/slug, disallows duplicate live runs for the same slug/task, and delegates to `start_run`. | Reuse task/run conventions only where their semantics fit; the run registry is process-local and is not a durable Matrix job queue. |
| Ten video engines | Present in `compare_studio/tools/`: compare (`create-video.mjs`), mystery, newspaper, vox, chalk, science, survival, tierlist, kinetic and wildlife. Each has an exported create function; Python's `_CREATE_MODULES` maps nine and handles survival/compare separately. | Engine interfaces differ: several take a `spec`, chalk/tierlist accept prompt-like input, survival uses CLI arguments, and compare uses its own spec/CLI. `_create_command` currently adapts those shapes. Avoid assuming one shared creator signature. |
| Engine output and render | Creators build a self-contained project under `videos/<slug>/` (HTML composition, assets, metadata and per-video `package.json`). Timed scenes/audio are clips in a full composition. Per-video scripts invoke pinned HyperFrames CLI (`0.7.58` appears in generated projects); `compare_native.start_run` runs the create task and, where needed, follows with `npm run render`. | The existing Compare Studio path renders a whole project/video. No scene-segment render/resume API was found in these engines or their `compare_native` integration. Do not claim a failed full-video render can resume at scene N; initially resume scene preparation/assets and record the full-render limitation. |
| Image queue | `bkt_web/image_routes.py` owns `/api/ai-images/*`, SQLite queue state in `bkt_channels.db`, including queue, claim, fail and complete routes. External Antigravity tasks are marked separately from the internal image worker. | For video-pipeline AI image generation, use the existing Antigravity queue contract (`engine=antigravity`) and per-image task IDs. Do not use `/generate-instant` or route video assets through Pollinations. |
| Antigravity project adapter | `tools/antigravity-images.mjs` exports `ensureAntigravityImages`, `requestReplacement`, and state helpers; persists keyed state in `videos/<slug>/images.json`; downloads returned images to caller-provided project paths. | Timeout produces a marked placeholder and pending state, not a completed asset. `pendingImages` gates render/post. Matrix manifests must likewise distinguish pending/placeholder/ready and never accept placeholders as production artifacts. |
| TTS voices | `tools/voices.mjs` exports `COUNTRIES`, voice lookup helpers, `probeDuration`, `synthesizeEdge`, and `synthesizeAudio`. `probeDuration` uses ffprobe. | `synthesizeAudio` silently cross-falls back between CapCut and Edge after failures; it has no pitch option. To honor V2.1's no-hidden-fallback and voice/pitch metadata, Matrix audio generation must explicitly select a provider, record it, fail visibly, and either implement/verify pitch or report it unsupported. `synthesizeEdge` retries the same provider up to four times. |
| Music and SFX | `soundscapes.mjs` exports `SFX_CATALOG` and `SOUNDSCAPE_PRESETS`. `auto-sfx.mjs` exports cue detection, BGM ducking, HTML generation and asset-copy helpers. | Reuse deterministic cue/ducking helpers and catalog paths. These helpers generate timing/markup; they are not a complete audio rendering pipeline by themselves. |
| Publishing | `bkt_web/publish_flow.py` provides `enqueue_upload`, `activate_waiting`, `startup_cleanup`, and queue checks. It requires an explicit numeric TikTok channel with cookie; validates current MP4 and pending-image status; checks nearby scheduled posts. An ambiguous post click becomes `NEEDS_CHECK` and is not automatically retried. `publish_kit.py::build_publish_kit` builds captions/hashtags. | Matrix may create a waiting/scheduled task only after an explicit channel selection and fresh render. Preserve publish_flow's safeguards; do not post automatically or silently choose an account. V2.1 staggered schedule generation still needs to be implemented. |
| Durable Matrix components | No `matrix_db.py`, `matrix_routes.py`, `matrix_analytics.py`, `job-manager.mjs`, or `scene-resumer.mjs` existed at audit time. | Existing image queue and process-local Studio runs are not substitutes for Matrix jobs, leases, artifacts or analytics. |

## 2. Asset and configuration observations

- The Compare Studio project root is `compare_studio/`; generated videos live under `compare_studio/videos/<slug>/`. The FastAPI backend resolves this via `TOKMATRIX_COMPARE_DIR` or the sibling `compare_studio` directory.
- The existing image adapter receives project-relative destinations from each creator; it does not infer a Matrix storyboard schema. Matrix must pass explicit artifact paths and preserve those paths in its manifest.
- The 10 pilot channel configs currently have `tiktok_account_ref: null` intentionally: the actual platform channel IDs/cookies must be mapped from the user's channel database, not invented from sample IDs.
- YAML/JSON schemas and 17 pilot YAML config documents exist from the prior V2 work and validate successfully; V2.1 Sprint 1 is not complete until `config_version` and a versioned YAML → active DB resolver are also implemented.

## 3. API and operational constraints

- Existing run creation supports task names in `TASKS` (`check`, `render`, `vo`, `fit`, `create`, `batch_global`, `images`); it is not a Matrix batch interface.
- `compare_native`'s creator dispatch has special cases and post-create render detection. Retain this as an adapter boundary rather than duplicating the existing engine scripts.
- `studio-bridge.mjs` supports one request per Node process; no long-lived Node server on port 4321 is part of the current architecture.
- The workspace directory has no `.git` metadata, so Git status/diff cannot be used to distinguish pre-existing edits from the changes made during this session.

## 4. V2.1 guardrails and implementation decisions

1. Keep the Matrix pipeline behind an independent feature flag; do not alter existing video creation behavior.
2. Snapshot resolved Channel DNA and config/version identifiers into each job manifest; YAML remains the editable preset source.
3. Use durable DB leases with atomic claim, heartbeat, expiry and idempotent retry. Process-local `RUNS` is not sufficient.
4. Persist a scene manifest and typed artifacts. Accept/resume only valid artifacts (file exists, expected type, integrity metadata when available); do not infer completion from a placeholder file.
5. Until the native engines expose segment rendering, resume asset generation/scene preparation and rerun the complete composition render after preparation succeeds. Record this limitation in job state and output.
6. Keep provider/image/render failures visible; never claim success after an implicit provider or asset fallback.
7. Validate the 10 pilot channels first. Do not create or enable 180 real account mappings or auto-publish without the user's configured IDs and explicit publish intent.

## 5. Spec inconsistencies to resolve while implementing

- Section 9 specifies Sprints 0 through 8, but the final handoff paragraph still says Sprint 1 through Sprint 7. The executable roadmap is treated as authoritative: Sprint 0–8.
- The detailed asset QA prose mentions an image for every scene, while the V2.1 Asset Type Strategy explicitly permits `CANVAS`, `SVG`, `TEXT`, `MAP`, `CHART`, and `EXISTING_ASSET`. Matrix QA must validate the artifact required by each scene's `asset_type`, not require an AI image universally.
- The older V2 document is not the active roadmap after the V2.1 update. Progress should be marked against `docs/MASTER_SPEC_AI_VIDEO_FACTORY_V2_1.md`.

## 6. Audit evidence / verification

- Verified the files and exports listed above by source inspection.
- Verified FastAPI route families in `compare_native.py` and `image_routes.py`, and router/worker registration in `server.py`.
- Verified all ten creator modules exist and compared their exports/render entry points with `compare_native._CREATE_MODULES` and `_create_command`.
- Confirmed no scene/segment render interface is wired into the native Compare Studio engines; separate scene-oriented render adapters elsewhere in `bkt_web` belong to other pipelines and are not assumed compatible.
- Re-ran the existing Matrix configuration acceptance checks: `npm run validate:matrix-config` and `npm run test:matrix-config` in `compare_studio/` — PASS (17 YAML files; 10 pilot channels; 18×10 matrix).
