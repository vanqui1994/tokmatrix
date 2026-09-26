# Approved-pattern library (UV-701)

Module: `bkt_web/pattern_library.py` · Tests: `tests/test_pattern_library.py`

What the programme has learned, kept as reusable data: scene patterns, action sequences, camera patterns and the fixes that resolved a review.

```python
item = pattern_from_approved_render(
    pattern_id="pattern.harvest", kind="action_sequence", title="Reach, grip, place",
    genre="agriculture", payload={"steps": [{"type": "reach"}, {"type": "grip"}, {"type": "place"}]},
    manifest=manifest, approved_by="reviewer.mai", approved_at="2026-09-21T02:00:00Z", review_id="review.one",
)
store = PatternLibrary(patterns=(item,)).record_use("pattern.harvest")
store.search(genre="agriculture", tags=["harvest"])
load_library(json.loads(json.dumps(store.as_dict())))   # every guard re-runs
```

## A pattern has to be earned

`pattern_from_approved_render` refuses to learn from a render that was not verified:

- no fidelity result at all → refused;
- any failed fidelity result → refused;
- a claim of `failed` or `needs-review` → refused (`complete` and `partial` are allowed);
- **any fallback that reused source media** → refused, because a pattern learned from borrowed footage teaches the wrong lesson.

Each pattern stores who approved it, when, the source hash it came from, the review id, and which fidelity kinds had run.

## Two hard rules

**No secrets.** The payload is scanned at every depth for credential-shaped field names (`password`, `api_key`, `access_token`, `session`, `authorization`, `refresh_token`, …) and credential-shaped values (bearer tokens, JWTs, `sk-`, `ghp_`, `AKIA…`). A match is refused, and **the refusal names the field and never echoes the value**.

**No media the project has no right to reuse.** A `MediaReference` is accepted only with a reusable licence (`CC0-1.0`, `CC-BY-4.0`, `original-owned`, `built-in`) and a SHA-256 checksum, and `origin="source"` is refused outright — a clip from somebody's video is not a pattern.

## Structure

Four kinds, each with the fields that make it reusable: `scene` needs `beats`, `action_sequence` needs typed `steps`, `camera` needs a `movement`, `fix` needs a `problem` and a `resolution`. Duplicate ids **and** duplicate content (same kind and payload) are both rejected, so the library does not fill up with the same lesson twice. `record_use` ranks search results by what actually gets used.

The whole library is JSON-safe with stable ids, so it can be committed, diffed and shipped — and `load_library` re-runs every guard on the way back in, which is what catches a tampered stored file.

## Limits

- The secret scan is pattern-based: it catches the usual shapes, not a credential disguised as prose.
- Licence is trusted as declared; nothing verifies it against a real licence file.
- Similarity is exact-content only — two nearly identical patterns both fit.
