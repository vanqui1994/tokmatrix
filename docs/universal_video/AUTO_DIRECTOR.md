# Auto Director and human review (UV-502, UV-503)

Modules: `bkt_web/auto_director.py`, `bkt_web/review_workflow.py` · Profiles: `bkt_web/schemas/director_profiles.json` · Store: `bkt_web/storage/universal_review_decisions.json` · Tests: `tests/test_auto_director.py`, `tests/test_review_workflow.py`

## What the director produces

`direct(storyboard, profile_id=...)` turns a Universal Storyboard v2 into a **direction plan**: renderer selection, staging, framing, continuity and caption safe zones, plus asset decisions from the resolver (UV-501). It plans; it does not render, and it never edits the storyboard — the input is compared before and after, and a mutation is an assertion failure.

Every decision carries `rule`, `explanation`, `confidence` and the ids of the source facts it is bound by:

```json
{
  "decision_id": "decision:framing:shot_intro_close",
  "kind": "framing",
  "scene_id": "scene_intro",
  "value": {"framing": "extreme_close_up", "source_framing": "close_up", "movement": "static"},
  "rule": "framing.by_action.speak",
  "explanation": "framing.by_action.speak -> extreme_close_up",
  "confidence": 0.94,
  "locked_by_source_fact_ids": ["fact:scene_timing:scene_intro"],
  "suppressed_by_profile": null
}
```

Confidence is the minimum analysis confidence under the decision, scaled by how specific the rule was (explicit rule 1.0, profile default 0.85); with no analysis underneath it, the base is 0.8. It is a derived number, not a claim of correctness — anything below the review threshold opens a review item.

## Hard source facts

`source_facts(storyboard)` extracts what the source, not the profile, decides:

| Kind | Value |
|---|---|
| `scene_timing` | each scene's `start`/`end` |
| `speaker` | each dialogue event's `speaker_id` and interval |
| `dialogue_text` | the spoken text and its language |
| `action_order` | actions sorted by time, with actors and targets |
| `source_geometry` | width, height, frame rate, source hash |

These are emitted with `locked: true` and are identical across every profile — the test suite asserts exactly that. When a profile rule collides with one, the rule loses:

```json
{"code": "SOURCE_FACT_PROTECTED", "rule": "continuity.min_shot_seconds",
 "fact_id": "fact:scene_timing:scene_intro", "fact_kind": "scene_timing",
 "resolution": "rule_dropped", "detail": "Shot shot_cut_0 ngắn hơn 2.0s nhưng timing nguồn không bị sửa."}
```

Nothing is retimed, no shot is merged, no speaker is moved. The profile's wish becomes a violation record plus a review item for a human, which is the only legitimate way to act on it.

Framing is the one place a profile may differ from the source, and only when it says so: `source-faithful` has `allow_reframe: false`, so it keeps `shot.framing` and reports the rejected suggestion in `suppressed_by_profile`.

## Profiles

Six profiles, all data: `source-faithful`, `tiktok-fast`, `educational`, `product`, `news`, `meme`. Each declares framing rules (by action, by role, default), staging (max subjects, primary side, margin, rule of thirds), caption position and per-aspect safe areas, continuity thresholds, and an ordered renderer wish list with fidelity minimums.

- **Safe areas** are inset fractions per aspect (`9:16`, `4:5`, `1:1`, `16:9`, plus `custom`). The aspect comes from the source geometry within a 0.02 tolerance; anything else falls back to `custom` and raises `ASPECT_NOT_RECOGNISED`. The computed caption `box` is validated to stay inside the frame.
- **Caption cues** copy the dialogue event id, interval, speaker and text verbatim. The director writes captions around the words; it does not write the words.
- **`renderer.preferred_ids`** is a wish list. The router (UV-104) still owns selection by capability; a pick outside the list produces `PROFILE_RENDERER_UNAVAILABLE`, and an unmet `min_fidelity` produces `PROFILE_FIDELITY_UNMET`. A preference never unlocks a renderer that misses a hard capability.
- **Staging over capacity** reports `STAGING_OVER_CAPACITY` and keeps every entity; the profile's comfort limit is not a licence to drop subjects.

## Review workflow (UV-503)

`open_review(plan, storyboard)` builds one item per reviewable subject — scene, action, entity, or an individual decision — from the plan's review items plus any decision that requires approval or falls below `LOW_CONFIDENCE_THRESHOLD` (0.7).

Each item's `entry_key` is a hash of:

```
source_sha256 + schema_version + project_id + target_type + target_id + fingerprint
```

where `fingerprint` is the canonical hash of the reviewed subject itself. That is what makes an approval safe to reuse and impossible to stretch:

| Change | Result |
|---|---|
| Source re-cut (`sha256` changes) | `SOURCE_HASH_CHANGED` |
| Storyboard schema version bumped | `SCHEMA_VERSION_CHANGED` |
| Reviewed scene/action/entity edited | `TARGET_CONTENT_CHANGED` |
| Reviewed target removed | `TARGET_REMOVED` |

`invalidate(store, review)` marks matching entries stale with the reason and keeps them for the audit trail; `apply_review` ignores stale entries and surfaces them as history (`previous_status`, `stale_reason`) so a reviewer can see that an older version was approved without that approval counting. A release is approved only when every open item has a live verdict for this exact source: `is_release_approved(resolved_review)`.

The store is plain JSON written atomically (`.tmp.<pid>` then replace) and holds ids, hashes, a status, a reviewer name, a timestamp and a short note — no media, no credentials.

## API

```python
# director
director_profiles() -> dict
profile(profile_id) -> dict
validate_director_profiles(document) -> None
source_facts(storyboard) -> list[dict]
direct(storyboard, *, profile_id="source-faithful", registry=None, manifest=None,
       plan_assets=True, cache_dir=None, project_root=None, resolution_policy=None) -> dict

# review
open_review(plan, storyboard, *, low_confidence_threshold=0.7) -> dict
empty_store() / load_store(path=None) / save_store(store, path=None) / validate_store(store)
record_decision(store, review, *, item_id, status, reviewer, decided_at, note=None) -> dict
invalidate(store, review) -> {"store": dict, "invalidated": list}
apply_review(review, store) -> dict
is_release_approved(resolved_review) -> bool
```

`direct` is a pure function of its inputs: no wall clock, no randomness, no global state, and `plan_hash` is stable across runs.

## Known limit

UV-502's planned dependency UV-304 (analysis-to-storyboard compiler) is not implemented yet, so the director consumes a Universal Storyboard v2 from whatever produces it today — the v1 migration (UV-102) or an authored example. That is the stable contract either way; when UV-304 lands, its output feeds `direct` unchanged.

## Verification

```bash
python3 -m unittest discover -s tests -p test_auto_director.py
python3 -m unittest discover -s tests -p test_review_workflow.py
```

Covered: all six profiles present and validated, malformed profiles rejected, determinism and non-mutation, every decision kind produced, source facts identical across profiles, rhythm rules reported instead of applied, source-faithful vs creative framing, caption boxes inside the frame with verbatim cues, vertical vs horizontal safe areas, staging capacity, renderer needs-review, asset decisions and provenance, plus the full review lifecycle: item construction, verdicts, atomic store round trip, corrupt stores, and all four invalidation reasons.
