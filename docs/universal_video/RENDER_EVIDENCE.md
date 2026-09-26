# Render evidence and project manifests (UV-804)

Modules: `bkt_web/render_evidence.py`, `bkt_web/remake_pipeline.py`  
Tests: `tests/test_render_evidence.py`

UV-804 connects the fidelity and manifest libraries to a real rendered file. A
successful pipeline run writes `manifest.json` beside the project only after
the output has been inspected and the stored manifest has passed
`validate_manifest()`.

## Evidence collected

- Structural: compares a pre-render storyboard snapshot with the storyboard
  handed back after rendering. Scene timing, dialogue, speakers, actions and
  other source facts remain subject to UV-600.
- Renderer-plan: the renderer that produced the pixels must be one of the
  selected renderers. A mismatch is `RENDERER_PLAN_MISMATCH` and fails closed.
- Visual output: verifies the file exists, is large enough, has the expected
  duration, is not byte-identical to the source, can yield sampled frames, and
  is neither frozen nor blank.
- Geometric: runs UV-601 for vector components with declared bounds. A
  storyboard with zero applicable bounds is recorded as `not_applicable`, not
  as a pass.

Checks which inspected nothing never become passing fidelity records. Their
reason is retained as `FIDELITY_NOT_APPLICABLE` in the manifest.

## Provenance and claim

The manifest records the actual renderer ID/version/frame mode, all native
assets referenced by the storyboard with their catalog checksums, every
declared fallback, warnings and fidelity outcomes. `build_manifest()` derives
`completion_claim`; the caller cannot force `complete`.

The old localization/project document is stored as `project.json`. The name
`manifest.json` is reserved for the validated UV-804 evidence envelope:

```json
{
  "schema": "tokmatrix.render-evidence/v1",
  "completion_claim": "complete",
  "manifest": { "schema": "tokmatrix.render-manifest/v1" },
  "checks": [],
  "not_applicable": []
}
```

The project card uses the derived claim: only `complete` becomes
`fidelity="passed"` and receives the verified-complete badge. Any failed or
insufficient check replaces a previous complete-looking badge with a review
badge.

## API

`GET /api/remake/projects/{project_id}/manifest` reads the stored file and
validates its embedded render manifest before returning it. Invalid project
IDs are rejected before path resolution; missing manifests return 404 and
invalid/tampered manifests return 409.

## Verification

```bash
.venv/bin/python -m unittest discover -s tests -p test_render_evidence.py
.venv/bin/python -m unittest discover -s tests -p test_render_manifest.py
.venv/bin/python -m unittest discover -s tests -p test_remake_pipeline.py
```
