# Render manifest and observability (UV-603)

Module: `bkt_web/render_manifest.py` · Tests: `tests/test_render_manifest.py`

One document that says exactly what a render was made of — and what it should not be trusted for.

```python
manifest = build_manifest(
    manifest_id="manifest.demo", created_at="2026-09-21T02:00:00Z",
    storyboard=storyboard,
    renderers=[RendererRecord("native-vector-v1", "1.4.0", ("scene.one", "scene.two"))],
    assets=[AssetRecord("asset.tomato", "1.0.0", checksum, "built-in")],
    fallbacks=[...], warnings=[...],
    fidelity=[FidelityResult.from_report("structural", structural_report)],
)
manifest.completion_claim, manifest.claim_reasons, manifest.digest(), manifest.as_dict()
```

## Contents

Source id + SHA-256 · storyboard schema version + content hash · renderers with versions, scene coverage and frame mode · assets with checksums, versions and provenance · fallbacks with reason code, disclosure and source-media usage · warnings · fidelity results from UV-600, UV-601 and UV-602, each with its counts, metrics and a hash of the report it came from.

## The completion claim is derived, not asserted

`build_manifest` computes the claim from the parts and **refuses a `claimed=` value the evidence does not support**:

| Evidence | Claim |
|---|---|
| every scene rendered, every fidelity check passed, no fallbacks | `complete` |
| a scene with no renderer, or any failed fidelity result | `failed` |
| no fidelity result recorded at all | `needs-review` |
| an ordinary fallback taken | `partial` |
| source media reused **with** approval | `partial` |
| source media reused **without** approval | `failed` |

Every claim carries `claim_reasons` naming what drove it. `validate_manifest` re-checks the same rules on a stored document, so a hand-edited `"complete"` on a manifest with a failed check or reused source media is caught on load.

Reusing the source and calling the result a finished remake is the dishonesty the whole programme exists to prevent; the manifest is where that becomes structurally impossible rather than a matter of discipline.

## Observability

`diff_manifests(earlier, later)` reports what moved between two renders of one project: source changed, storyboard changed, claim transition, assets added / removed / changed by checksum, fallbacks added, and which fidelity kinds regressed.

## Limits

- The manifest records what it is given; it does not itself run renderers or fidelity checks.
- Asset checksums are trusted as supplied — verifying them against files on disk is `asset_manifest.verify_asset_files`'s job.
- `created_at` is a caller value, which keeps the manifest deterministic in tests and makes the caller responsible for a real clock.
