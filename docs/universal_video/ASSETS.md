# Asset manifest, provenance and resolution (UV-500, UV-501)

Modules: `bkt_web/asset_manifest.py`, `bkt_web/asset_resolver.py` · Declared manifest: `bkt_web/schemas/asset_manifest.json` · Tests: `tests/test_asset_manifest.py`, `tests/test_asset_resolver.py`

## What a record must carry (UV-500)

Every asset — a built-in rig, an imported image, a generated sprite, a composition, a reused source clip — is described by one record with the same five obligations:

| Field | Rule |
|---|---|
| `asset_id` | Stable id, same pattern as storyboard ids, unique in the manifest |
| `version` | Semantic version |
| `provenance.license` | An object with at least an `id`; a record without a license is rejected |
| `checksum` | `sha256:<64 hex>` over the bytes (file/remote) or the canonical JSON (inline) |
| `capabilities` | Explicit, sorted lists under `entity_types`, `anchors`, `actions`, `states`, `materials`, `effects` |

`provenance.kind` is one of `built-in`, `imported`, `generated`, `composed`, `source-media`, and each kind has to earn its keep:

- **generated** must carry `provenance.generation` with `model`, `config` and `source_refs` — what produced it, with which settings, from what. Optional `model_version` and `prompt_sha256`.
- **imported** and **source-media** must name at least one `source_refs` entry.
- **composed** must list ≥ 2 `composition.parts`, all present in the manifest; the part graph is checked for cycles.

Built-in records are *derived*, not duplicated: `native_manifest()` reads the capability registry (UV-103), so the vector catalog stays the one source of truth and the checksums are the registry's own. `asset_manifest()` merges those with `bkt_web/schemas/asset_manifest.json`; a duplicate id whose content differs is an error, never a silent overwrite.

`verify_asset_files(manifest, root=...)` reports `ASSET_FILE_MISSING`, `ASSET_CHECKSUM_MISMATCH`, `ASSET_SIZE_MISMATCH` and `PATH_ESCAPES_ROOT`. Paths are relative, and `..`, absolute paths and backslashes are refused at validation time.

## The resolution ladder (UV-501)

`resolve_asset(request, ...)` walks a fixed order and records every rung it tried in `attempts`:

1. **exact** — a manifest record for this renderer that already covers every requested capability.
2. **composition** — the smallest deterministic set of records that together cover them; produces a `composed` record whose checksum is derived from its parts' checksums.
3. **generated** — only with `policy.allow_generated` and an injected `generator`; the payload must supply `model`, `config`, `created_at` and the bytes, or the resolution becomes `GENERATED_ASSET_INVALID`.
4. **source-fallback** — only with `policy.allow_source_fallback` **and** the request's `source_ref` listed in `policy.approved_source_refs`. The result is marked `requires_approval`, carries `source_media_usage` and a disclosure that says outright it is not a complete remake.
5. **needs-review** — reason code plus the capabilities still missing.

Greedy composition is deterministic: candidates are scored by how much of the remaining gap they close and tie-broken by `asset_id`, so the same request always yields the same parts.

An explicit `asset_id` is also a semantic identity constraint. Composition may extend that exact base asset, but it cannot replace a missing `space_dragon` with another rig merely because both expose `grip`. Storyboard entities without an authored `attributes.asset` use a normalized exact label (`"Space Dragon"` → `space_dragon`); if that ID is absent, the request continues to generation, an explicitly approved source fallback, or `needs-review`.

## Production wiring (UV-805)

The automatic route now runs asset planning after compilation and renderer selection. Each unresolved entity creates an `asset_gaps` record with `scene_id`, `entity_id`, human-readable `entity_name`, requested asset ID, missing capabilities, and the complete resolver attempts. The production verdict adds `ASSET_NEEDS_REVIEW`, and the same named gap is persisted under `automatic_route` in `review.json`. No TTS or renderer is called on this branch.

Built-in manifest capabilities are derived from `capability_registry.py`. Tests compare every catalog asset's manifest states with the registry and keep the existing exhaustive `_asset_states` expectation, so adding a catalog asset requires updating its state declaration and tests in the same change.

## Freezing, and why rendering never touches the network

Resolution is the only step allowed to fetch. A `remote` record needs an explicit `fetcher`; the bytes are checksum-verified against the record before anything is written, and a mismatch is `REMOTE_ASSET_CHECKSUM_MISMATCH`. Without a fetcher the answer is `REMOTE_ASSET_NOT_FROZEN` — not a deferred download.

Frozen files are content-addressed (`<sha256>.<ext>`) in the cache directory, written through a `.part` staging name so an interrupted write cannot leave a short file sitting under a name that later looks trustworthy. Inline rigs are not copied: they already travel inside the catalog the renderer embeds.

`assert_offline_ready(plan_or_resolutions)` is the gate to run before handing anything to a renderer. It fails when a resolved asset is still remote, when a frozen file has disappeared, or when the local bytes no longer match the manifest checksum.

## API

```python
# manifest
asset_manifest() -> dict                       # built-ins + declared file
native_manifest() / declared_manifest() -> dict
validate_asset_manifest(document) -> None
validate_asset_record(record) -> None
asset_record(asset_id, manifest=None) -> dict
asset_record_from_file(path, *, asset_id, version, kind, media_type, provenance, root=...) -> dict
add_asset(document, record) -> dict            # pure; input untouched
merge_manifests(base, other) -> dict
verify_asset_files(manifest, *, root) -> list[dict]
manifest_hash(manifest) -> str

# resolver
AssetRequest(request_id, renderer_id, kind=..., asset_id=None, entity_id=None,
             required_capabilities={}, media_type=None, source_ref=None)
ResolutionPolicy(allow_composition=True, allow_generated=False,
                 allow_source_fallback=False, approved_source_refs=(), source_license=...)
resolve_asset(request, *, manifest, policy, cache_dir, project_root, generator, source_media, fetcher) -> dict
resolve_assets(requests, ...) -> dict          # plan + grown manifest
assert_offline_ready(plan_or_resolutions) -> None
```

## Verification

```bash
python3 -m unittest discover -s tests -p test_asset_manifest.py
python3 -m unittest discover -s tests -p test_asset_resolver.py
python3 -m unittest discover -s tests -p test_uv805_assets.py
```

Covered: the five obligations on every built-in record, checksum agreement with the registry, sorted/unique capability lists, path traversal, https-only remotes, composition cycles, merge conflicts, checksum drift detection, each rung of the ladder, generation metadata, unapproved and unavailable source fallbacks, remote freeze and tamper detection, the offline gate, duplicate request ids and determinism.
