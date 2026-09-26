# Capability Registry Contract

> Task: UV-103  
> Status: Implemented by `bkt_web.capability_registry`

## Purpose

The registry describes what renderers and assets can actually do. It is the sole input used by the router to decide whether a scene can be rendered, requires a fallback, or must be reviewed.

The registry must never infer support from a renderer name or silently downgrade a hard requirement.

## Registry document

```json
{
  "schema": "tokmatrix.capability-registry/v1",
  "version": "1.0.0",
  "renderers": {},
  "assets": {},
  "actions": {},
  "materials": {},
  "effects": {},
  "fallbacks": {}
}
```

All keys are stable IDs. Every entry has an independent semantic version so capabilities can change without renaming the ID.

## Renderer capability

```json
{
  "id": "native-vector-v1",
  "version": "1.2.0",
  "media": ["vector-2d"],
  "features": {
    "deterministic_seek": true,
    "offline_render": true,
    "alpha_output": false,
    "audio_tracks": false,
    "nested_compositions": false
  },
  "supports": {
    "entities": ["human", "animal", "rig", "plant", "fruit", "tool", "prop"],
    "actions": ["grip", "release", "reach", "carry"],
    "materials": [],
    "effects": ["rain", "spray"]
  },
  "limits": {
    "max_entities_per_project": 64,
    "max_scene_duration_seconds": 1800,
    "canvas_sizes": [[576, 1024]]
  },
  "fidelity": {
    "photorealism": 0,
    "character_motion": 0.65,
    "typography": 0.45
  }
}
```

Numbers under `fidelity` are declared capability estimates in `[0,1]`, not output quality scores. A renderer adapter owns and versions these declarations.

Entity kinds follow the open semantic vocabulary from Storyboard v2. The native bootstrap exposes the existing catalog groups verbatim; a later adapter may publish aliases but the registry does not silently rename them. `audio_tracks` is false for the Canvas engine itself because audio muxing belongs to the composer layer.

## Asset capability

```json
{
  "id": "watermelon",
  "version": "1.0.0",
  "renderer": "native-vector-v1",
  "entity_types": ["fruit"],
  "anchors": ["root", "face", "surface", "grip", "grip_l", "grip_r"],
  "actions": ["cut", "slice", "grip", "release", "reach", "carry"],
  "states": ["growth", "damage", "slice", "cut"],
  "provenance": {
    "kind": "built-in",
    "checksum": "sha256:<hex>"
  }
}
```

Asset support is the intersection of asset and renderer capabilities. A renderer declaring `carry` does not imply every asset can be carried.

## Scene requirements

The router receives normalized requirements:

```json
{
  "required": [
    {"kind": "feature", "id": "deterministic_seek"},
    {"kind": "action", "id": "carry", "actor": "farmer_1", "target": "fruit_1", "minimum_version": "1.2.0"},
    {"kind": "anchor", "entity": "fruit_1", "id": "grip_l"}
  ],
  "preferred": [
    {"kind": "fidelity", "id": "character_motion", "minimum": 0.7}
  ],
  "optional": [
    {"kind": "effect", "id": "motion_blur"}
  ]
}
```

- Missing `required` capability rejects the route.
- Missing `preferred` capability reduces the route score and produces a warning.
- Missing `optional` capability does not reduce semantic validity.
- `minimum_version` and comma-separated `version_range` comparators apply to the capability entry, not automatically to the renderer version.
- Action requirements may name actor/target entity IDs; matching then checks the intersection of renderer, action and asset support.
- Context limits include entity count, scene duration and canvas size.

## Match result

```json
{
  "renderer": "native-vector-v1",
  "eligible": false,
  "score": 0.0,
  "matched": [],
  "missing_required": [
    {"tier": "required", "kind": "action", "id": "cloth_simulation", "reason": "unknown_capability"}
  ],
  "missing_preferred": [],
  "missing_optional": [],
  "limit_violations": [],
  "fallbacks": [],
  "explanation": "native-vector-v1: unknown_capability for action cloth_simulation"
}
```

Match output ordering must be stable: required before preferred before optional, then lexical by kind and ID.

## Fallback declarations

A fallback is explicit data, not hidden renderer behavior:

```json
{
  "id": "source-footage-overlay",
  "version": "1.0.0",
  "provides": [{"kind": "effect", "id": "photorealistic_motion"}],
  "cost": 0.2,
  "changes_fidelity_class": true,
  "requires_approval": true,
  "disclosure": "This scene reuses source footage.",
  "conflicts_with": [{"kind": "fidelity", "id": "no_source_reuse"}]
}
```

If a fallback conflicts with a `required` fidelity rule such as `no_source_reuse`, the route remains ineligible.
Capability references in `provides` are typed because IDs may legitimately overlap across namespaces, for example an action and an effect may both be named `spray`.

## Query API

The Python implementation exposes pure functions:

```python
inspect_registry() -> dict
validate_registry(document: dict) -> None
match_renderer(renderer_id: str, requirements: dict, context: dict) -> dict
rank_renderers(requirements: dict, context: dict) -> list[dict]
explain_gap(renderer_id: str, requirements: dict, context: dict) -> dict
```

Requirements:

- No network or filesystem mutation during matching.
- Inputs are not mutated.
- Result is deterministic.
- Unknown capability kinds fail validation.
- Duplicate stable IDs fail validation.
- SemVer comparison is explicit; string comparison is forbidden.

## Native vector bootstrap

The first adapter derives a registry entry from the catalog but freezes it into a validated document before routing. Catalog action lists remain the authority for native-vector assets until UV-400 moves that responsibility into the adapter.

The bootstrap must not claim capabilities that lack contact, validation and deterministic tests.

## Security

Registry documents contain capability metadata only. They must not contain credentials, cookies, remote access tokens, signed URLs or user source data.
