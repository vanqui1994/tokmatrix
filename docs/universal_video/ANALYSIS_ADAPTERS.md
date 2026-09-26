# Shot, transcript and OCR adapters (UV-301)

Module: `bkt_web/analysis_adapters.py` · Tests: `tests/test_analysis_adapters.py` · Produces: [Analysis Result v1](ANALYSIS_RESULT.md)

An adapter normalises **one analyzer's native output** into UV-300 observations. It does not run a model: whatever produced the cut list, the ASR segments or the OCR boxes stays outside, so the adapters themselves are pure, offline and deterministic.

## The three guarantees

**Timestamps survive.** Every time value is copied verbatim — no rounding, no snapping to a frame grid, no re-ordering, no merging of adjacent segments, no de-duplication. `1.2345678901` in is `1.2345678901` out, and the tests assert exact float equality, including for word-level timings and shot edges.

**Offline stays offline.** `AnalysisRequest.allow_network` is `False` by default, and the runner blocks `socket.socket.connect` and `socket.create_connection` while adapters run, restoring them afterwards even if the run raises. An adapter that quietly phones home becomes a recorded failure with reason `unavailable`, not a hidden dependency. `media_path` must be a local path: a remote scheme or a `..` segment is refused.

**One analyzer's failure never erases another's.** Each adapter's output is validated as a document of its own before it joins the run. An adapter that raises, or that emits something invalid, is recorded in `failures` and only its own observations are dropped. Its analyzer stays declared in the document, so the gap is visible. If *every* adapter fails, `run_analysis` raises `AnalysisAllAdaptersFailed` with the failures attached rather than returning an empty document that looks like a clean analysis.

## Adapters

| Adapter | Native input | Observations |
|---|---|---|
| `ShotBoundaryAdapter` | interior cut times `{time, confidence, boundary}` | a non-overlapping `shot` partition of `[0, duration]`, indexed in order; each shot takes the confidence and boundary kind of the cut that starts it |
| `TranscriptAdapter` | ASR segments `{start, end, text, confidence, speaker, language, words[]}` | one `transcript` per segment, word timings kept; optional matching `audio_event` (`category: speech`) with `emit_audio_events=True` |
| `OcrAdapter` | detections `{start, end, text, confidence, box}` | one `ocr` per detection with a `normalized_source` region |

`OcrAdapter` accepts `box.space: "pixels"` and converts with the source's own `width`/`height`; without those it fails with `unsupported_media` rather than guessing. A box outside the frame is an error, never a silently clamped guess.

Diarisation output lands in `speaker_label`. It stays a label: binding it to a real identity is UV-302's and UV-503's decision, and the schema has no field for it here.

## Runner

```python
request = AnalysisRequest(analysis_id=..., source={...}, duration_seconds=6.4)
result = run_analysis(request, [ShotBoundaryAdapter(cuts), TranscriptAdapter(segments), OcrAdapter(boxes)])
result.document              # validated AnalysisResultV1
result.payload               # the same document as plain JSON-safe data
result.failures              # analyzers that produced nothing
result.succeeded_analyzer_ids
```

Adapters run in `analyzer_id` order, so the document does not depend on the order they were passed in; running twice gives byte-identical output, and neither the segments nor the source dict passed in are mutated.

## Writing another adapter

Subclass `AnalysisAdapter`, set `analyzer_kind`, and implement `produce(request) -> AdapterOutput`. Use `self._evidence(...)` and `self._observation(...)` so ids stay stable and namespaced by analyzer. Raise `AdapterError(message, reason=...)` to control the recorded failure reason; `TimeoutError` maps to `timeout` and `NotImplementedError` to `unavailable`. Never catch your own failure and return empty output — a recorded failure is honest, an empty success is not.
