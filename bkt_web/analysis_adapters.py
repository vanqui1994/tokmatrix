"""Shot, transcript and OCR adapters for Analysis Result v1 (UV-301).

An adapter normalises one analyzer's native output into UV-300 observations.
It does not run a model: the heavy lifting stays in whatever produced the
payload, so these adapters are pure, offline and deterministic.

Three guarantees the runner enforces rather than documents:

1. **Timestamps survive.**  Every time value is copied verbatim — no rounding,
   no quantising to a frame grid, no re-ordering, no merging of segments.
2. **Offline stays offline.**  Unless a request explicitly allows network
   access, the runner blocks socket use while adapters run, so a hidden call
   becomes a recorded failure instead of a silent dependency.
3. **One analyzer's failure never erases another's.**  Each adapter's output is
   validated on its own; a broken or invalid adapter is recorded in
   ``failures`` and only its own observations are dropped.
"""

from __future__ import annotations

import copy
import math
import socket
from abc import ABC, abstractmethod
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator, Sequence
from urllib.parse import urlsplit

from bkt_web.analysis_result import (
    ANALYSIS_SCHEMA_VERSION,
    AnalysisResultV1,
    AnalysisValidationError,
    validate_analysis_result,
)


FAILURE_REASONS = ("unavailable", "timeout", "unsupported_media", "low_quality_input", "internal_error", "cancelled")


class AdapterError(ValueError):
    """Raised by an adapter that cannot produce observations.

    ``reason`` is carried through to the recorded :class:`AnalyzerFailure`.
    """

    def __init__(self, message: str, reason: str = "internal_error"):
        if reason not in FAILURE_REASONS:
            raise ValueError(f"reason không hợp lệ: {reason}")
        super().__init__(message)
        self.reason = reason


class AdapterNetworkError(AdapterError):
    """Raised when an adapter tries to use the network in an offline run."""

    def __init__(self, message: str = "network access is not allowed in this analysis run"):
        super().__init__(message, reason="unavailable")


def _require(condition: bool, message: str, reason: str = "internal_error") -> None:
    if not condition:
        raise AdapterError(message, reason)


def _seconds(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise AdapterError(f"{label} phải là số hữu hạn")
    number = float(value)
    _require(number >= 0, f"{label} không được âm")
    return number


def _text(value: Any, label: str, limit: int = 20_000) -> str:
    _require(isinstance(value, str) and bool(value.strip()), f"{label} phải là chuỗi không rỗng")
    _require(len(value) <= limit, f"{label} quá dài")
    return value


def _confidence(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise AdapterError(f"{label} phải là số hữu hạn")
    number = float(value)
    _require(0.0 <= number <= 1.0, f"{label} cần nằm trong [0,1]")
    return number


# --- Request -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AnalysisRequest:
    """One source to analyse, plus the policy adapters must respect."""

    analysis_id: str
    source: dict[str, Any]
    duration_seconds: float
    media_path: str | None = None
    allow_network: bool = False

    def __post_init__(self) -> None:
        _require(isinstance(self.analysis_id, str) and bool(self.analysis_id), "analysis_id không hợp lệ")
        _require(isinstance(self.source, dict) and bool(self.source.get("source_id")), "source cần source_id")
        object.__setattr__(self, "source", copy.deepcopy(self.source))
        object.__setattr__(self, "duration_seconds", _seconds(self.duration_seconds, "duration_seconds"))
        if self.media_path is not None:
            _require(isinstance(self.media_path, str) and bool(self.media_path), "media_path không hợp lệ")
            parts = urlsplit(self.media_path)
            _require(parts.scheme in {"", "file"}, "media_path phải là đường dẫn cục bộ", "unsupported_media")
            _require(".." not in self.media_path.replace("\\", "/").split("/"), "media_path chứa path traversal")
        _require(isinstance(self.allow_network, bool), "allow_network phải là boolean")

    @property
    def source_id(self) -> str:
        return str(self.source["source_id"])

    def within(self, start: float, end: float, label: str) -> None:
        _require(start <= end, f"{label}: end không được trước start")
        _require(end <= self.duration_seconds + 1e-9, f"{label}: vượt quá thời lượng nguồn")


# --- Adapter contract ----------------------------------------------------


@dataclass(frozen=True, slots=True)
class AdapterOutput:
    evidence: tuple[dict[str, Any], ...]
    observations: tuple[dict[str, Any], ...]


class AnalysisAdapter(ABC):
    """Normalises one analyzer's native output into UV-300 observations."""

    analyzer_kind: str = "multi"

    def __init__(self, analyzer_id: str, name: str, version: str, *, ran_at: str | None = None, parameters: dict[str, Any] | None = None):
        _require(isinstance(analyzer_id, str) and bool(analyzer_id), "analyzer_id không hợp lệ")
        self.analyzer_id = analyzer_id
        self.name = name
        self.version = version
        self.ran_at = ran_at
        self.parameters = copy.deepcopy(parameters or {})

    def analyzer(self) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "analyzer_id": self.analyzer_id,
            "kind": self.analyzer_kind,
            "name": self.name,
            "version": self.version,
        }
        if self.ran_at is not None:
            entry["ran_at"] = self.ran_at
        if self.parameters:
            entry["parameters"] = copy.deepcopy(self.parameters)
        return entry

    @abstractmethod
    def produce(self, request: AnalysisRequest) -> AdapterOutput:
        """Return evidence and observations for one request."""

    # Helpers shared by the shipped adapters.

    def _evidence(self, suffix: str, request: AnalysisRequest, kind: str, start: float, end: float, **extra: Any) -> dict[str, Any]:
        entry = {
            "evidence_id": f"evidence.{self.analyzer_id}.{suffix}",
            "kind": kind,
            "source_id": request.source_id,
            "interval": {"start": start, "end": end},
        }
        entry.update({key: value for key, value in extra.items() if value is not None})
        return entry

    def _observation(self, suffix: str, kind: str, start: float, end: float, confidence: float, evidence_ids: Sequence[str], **extra: Any) -> dict[str, Any]:
        entry = {
            "observation_id": f"observation.{self.analyzer_id}.{suffix}",
            "kind": kind,
            "analyzer_id": self.analyzer_id,
            "source_interval": {"start": start, "end": end},
            "confidence": confidence,
            "evidence_ids": list(evidence_ids),
        }
        entry.update({key: value for key, value in extra.items() if value is not None})
        return entry


# --- Shot adapter --------------------------------------------------------


class ShotBoundaryAdapter(AnalysisAdapter):
    """Turns interior cut times into a non-overlapping shot partition.

    ``boundaries`` are the analyzer's native cut points: ``{"time": ...,
    "confidence": ..., "boundary": "cut"}``.  The times are used exactly as
    given; the adapter only fills in the shots between them.
    """

    analyzer_kind = "shot"

    def __init__(self, boundaries: Iterable[dict[str, Any]], *, analyzer_id: str = "analyzer.shots", name: str = "shot-boundary-adapter", version: str = "1.0.0", **kwargs: Any):
        super().__init__(analyzer_id, name, version, **kwargs)
        self.boundaries = [copy.deepcopy(item) for item in boundaries]

    def produce(self, request: AnalysisRequest) -> AdapterOutput:
        cuts: list[tuple[float, float, str]] = []
        for index, item in enumerate(self.boundaries):
            _require(isinstance(item, dict), f"boundaries[{index}] phải là object")
            time = _seconds(item.get("time"), f"boundaries[{index}].time")
            _require(0 < time < request.duration_seconds, f"boundaries[{index}].time phải nằm trong (0, duration)")
            boundary = item.get("boundary", "cut")
            _require(boundary in {"cut", "dissolve", "fade", "wipe", "unknown"}, f"boundaries[{index}].boundary không hợp lệ")
            cuts.append((time, _confidence(item.get("confidence", 1.0), f"boundaries[{index}].confidence"), boundary))
        times = [item[0] for item in cuts]
        _require(times == sorted(times), "boundaries phải theo thứ tự thời gian")
        _require(len(set(times)) == len(times), "boundaries bị trùng thời điểm")

        evidence: list[dict[str, Any]] = []
        observations: list[dict[str, Any]] = []
        edges = [0.0, *times, request.duration_seconds]
        for index in range(len(edges) - 1):
            start, end = edges[index], edges[index + 1]
            confidence, boundary = (1.0, "unknown") if index == 0 else (cuts[index - 1][1], cuts[index - 1][2])
            suffix = f"shot.{index}"
            evidence.append(self._evidence(suffix, request, "frame_range", start, end))
            observations.append(self._observation(
                suffix, "shot", start, end, confidence,
                [f"evidence.{self.analyzer_id}.{suffix}"],
                index=index, boundary=boundary,
            ))
        return AdapterOutput(tuple(evidence), tuple(observations))


# --- Transcript adapter --------------------------------------------------


class TranscriptAdapter(AnalysisAdapter):
    """Normalises ASR segments, keeping segment and word timings verbatim.

    Segments are never merged, split or re-ordered, and a diarisation label
    stays a label: it is written to ``speaker_label``, never to an identity.
    """

    analyzer_kind = "transcript"

    def __init__(self, segments: Iterable[dict[str, Any]], *, analyzer_id: str = "analyzer.speech", name: str = "transcript-adapter", version: str = "1.0.0", emit_audio_events: bool = False, **kwargs: Any):
        super().__init__(analyzer_id, name, version, **kwargs)
        self.segments = [copy.deepcopy(item) for item in segments]
        self.emit_audio_events = emit_audio_events

    def produce(self, request: AnalysisRequest) -> AdapterOutput:
        evidence: list[dict[str, Any]] = []
        observations: list[dict[str, Any]] = []
        for index, segment in enumerate(self.segments):
            label = f"segments[{index}]"
            _require(isinstance(segment, dict), f"{label} phải là object")
            start = _seconds(segment.get("start"), f"{label}.start")
            end = _seconds(segment.get("end"), f"{label}.end")
            request.within(start, end, label)
            text = _text(segment.get("text"), f"{label}.text")
            confidence = _confidence(segment.get("confidence", 1.0), f"{label}.confidence")
            words = []
            previous_end = start
            for position, word in enumerate(segment.get("words", []) or []):
                wlabel = f"{label}.words[{position}]"
                _require(isinstance(word, dict), f"{wlabel} phải là object")
                word_start = _seconds(word.get("start"), f"{wlabel}.start")
                word_end = _seconds(word.get("end"), f"{wlabel}.end")
                _require(word_start <= word_end, f"{wlabel}: end không được trước start")
                _require(start <= word_start and word_end <= end, f"{wlabel} nằm ngoài segment")
                _require(word_start >= previous_end - 1e-9, f"{wlabel} không theo thứ tự thời gian")
                previous_end = word_end
                words.append({
                    "text": _text(word.get("text"), f"{wlabel}.text", 200),
                    "start": word_start,
                    "end": word_end,
                    "confidence": _confidence(word.get("confidence", confidence), f"{wlabel}.confidence"),
                })
            suffix = f"segment.{index}"
            evidence_id = f"evidence.{self.analyzer_id}.{suffix}"
            evidence.append(self._evidence(suffix, request, "audio_range", start, end, quote=text[:2000]))
            speaker_label = segment.get("speaker_label", segment.get("speaker"))
            observations.append(self._observation(
                suffix, "transcript", start, end, confidence, [evidence_id],
                text=text,
                language=segment.get("language"),
                speaker_label=speaker_label,
                words=words or None,
            ))
            if self.emit_audio_events:
                observations.append(self._observation(
                    f"{suffix}.audio", "audio_event", start, end, confidence, [evidence_id],
                    category="speech", speaker_label=speaker_label,
                ))
        return AdapterOutput(tuple(evidence), tuple(observations))


# --- OCR adapter ---------------------------------------------------------


class OcrAdapter(AnalysisAdapter):
    """Normalises OCR detections into ``normalized_source`` regions.

    Pixel boxes are converted with the source's own width and height; a box
    that falls outside the frame is an error, never a silently clamped guess.
    """

    analyzer_kind = "ocr"

    def __init__(self, detections: Iterable[dict[str, Any]], *, analyzer_id: str = "analyzer.ocr", name: str = "ocr-adapter", version: str = "1.0.0", **kwargs: Any):
        super().__init__(analyzer_id, name, version, **kwargs)
        self.detections = [copy.deepcopy(item) for item in detections]

    def _region(self, box: Any, request: AnalysisRequest, label: str) -> dict[str, Any]:
        _require(isinstance(box, dict), f"{label} phải là object")
        space = box.get("space", "normalized_source")
        _require(space in {"normalized_source", "pixels"}, f"{label}.space không hợp lệ")
        values = {key: box.get(key) for key in ("x", "y", "width", "height")}
        for key, value in values.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise AdapterError(f"{label}.{key} phải là số hữu hạn")
        x, y, width, height = (float(values[key]) for key in ("x", "y", "width", "height"))
        if space == "pixels":
            frame_width, frame_height = request.source.get("width"), request.source.get("height")
            _require(
                isinstance(frame_width, int) and isinstance(frame_height, int) and frame_width > 0 and frame_height > 0,
                f"{label}: cần source.width/height để đổi pixel sang normalized",
                "unsupported_media",
            )
            x, width = x / frame_width, width / frame_width
            y, height = y / frame_height, height / frame_height
        _require(width > 0 and height > 0, f"{label}: width/height phải lớn hơn 0")
        _require(
            0 <= x and 0 <= y and x + width <= 1 + 1e-9 and y + height <= 1 + 1e-9,
            f"{label}: vùng nằm ngoài khung hình",
        )
        return {"space": "normalized_source", "x": x, "y": y, "width": min(width, 1.0), "height": min(height, 1.0)}

    def produce(self, request: AnalysisRequest) -> AdapterOutput:
        evidence: list[dict[str, Any]] = []
        observations: list[dict[str, Any]] = []
        for index, detection in enumerate(self.detections):
            label = f"detections[{index}]"
            _require(isinstance(detection, dict), f"{label} phải là object")
            start = _seconds(detection.get("start"), f"{label}.start")
            end = _seconds(detection.get("end", detection.get("start")), f"{label}.end")
            request.within(start, end, label)
            text = _text(detection.get("text"), f"{label}.text", 5000)
            confidence = _confidence(detection.get("confidence", 1.0), f"{label}.confidence")
            region = self._region(detection.get("box", detection.get("region")), request, f"{label}.box")
            suffix = f"text.{index}"
            evidence_id = f"evidence.{self.analyzer_id}.{suffix}"
            evidence.append(self._evidence(suffix, request, "ocr_region", start, end, region=region, quote=text[:2000]))
            observations.append(self._observation(
                suffix, "ocr", start, end, confidence, [evidence_id],
                text=text, region=region, language=detection.get("language"),
            ))
        return AdapterOutput(tuple(evidence), tuple(observations))


# --- Runner --------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AnalysisRunResult:
    document: AnalysisResultV1
    payload: dict[str, Any]
    failures: tuple[dict[str, Any], ...] = field(default_factory=tuple)

    @property
    def succeeded_analyzer_ids(self) -> tuple[str, ...]:
        failed = {item["analyzer_id"] for item in self.failures}
        return tuple(item.analyzer_id for item in self.document.analyzers if item.analyzer_id not in failed)


@contextmanager
def _no_network() -> Iterator[None]:
    """Make any socket use during an offline run fail loudly."""
    original_socket_connect = socket.socket.connect
    original_create_connection = socket.create_connection

    def blocked(*_args: Any, **_kwargs: Any) -> Any:
        raise AdapterNetworkError()

    socket.socket.connect = blocked  # type: ignore[method-assign]
    socket.create_connection = blocked  # type: ignore[assignment]
    try:
        yield
    finally:
        socket.socket.connect = original_socket_connect  # type: ignore[method-assign]
        socket.create_connection = original_create_connection  # type: ignore[assignment]


def _reason_for(error: BaseException) -> str:
    if isinstance(error, AdapterError):
        return error.reason
    if isinstance(error, TimeoutError):
        return "timeout"
    if isinstance(error, NotImplementedError):
        return "unavailable"
    return "internal_error"


def _document(request: AnalysisRequest, analyzers: list[dict[str, Any]], evidence: list[dict[str, Any]], observations: list[dict[str, Any]], failures: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema_version": ANALYSIS_SCHEMA_VERSION,
        "analysis_id": request.analysis_id,
        "source": copy.deepcopy(request.source),
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
        "duration_seconds": request.duration_seconds,
        "analyzers": copy.deepcopy(analyzers),
        "evidence": copy.deepcopy(evidence),
        "observations": copy.deepcopy(observations),
        "failures": copy.deepcopy(failures),
    }


def run_analysis(request: AnalysisRequest, adapters: Sequence[AnalysisAdapter]) -> AnalysisRunResult:
    """Run adapters offline and assemble one validated Analysis Result v1.

    Adapters run in ``analyzer_id`` order so the document is deterministic.  An
    adapter that raises, or whose output does not validate on its own, is
    recorded in ``failures``; every other adapter's observations are kept.
    """
    _require(isinstance(request, AnalysisRequest), "request không hợp lệ")
    ordered = sorted(adapters, key=lambda item: item.analyzer_id)
    ids = [item.analyzer_id for item in ordered]
    _require(len(ids) == len(set(ids)), "analyzer_id bị trùng")
    _require(bool(ordered), "cần ít nhất một adapter")

    analyzers = [item.analyzer() for item in ordered]
    evidence: list[dict[str, Any]] = []
    observations: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    guard = _no_network() if not request.allow_network else _passthrough()
    with guard:
        for adapter in ordered:
            try:
                output = adapter.produce(request)
                _require(isinstance(output, AdapterOutput), f"{adapter.analyzer_id}: produce phải trả AdapterOutput")
                candidate = _document(
                    request,
                    [adapter.analyzer()],
                    list(output.evidence),
                    list(output.observations),
                    [],
                )
                validate_analysis_result(candidate)
            except AnalysisValidationError as error:
                failures.append(_failure(adapter, "internal_error", f"adapter output is not a valid analysis result: {error}"))
                continue
            except Exception as error:  # noqa: BLE001 - one adapter must not sink the run
                failures.append(_failure(adapter, _reason_for(error), str(error) or error.__class__.__name__))
                continue
            evidence.extend(output.evidence)
            observations.extend(output.observations)

    if not evidence:
        # Analysis Result v1 requires evidence; with every adapter down there is
        # nothing honest to report but the failures themselves.
        raise AnalysisAllAdaptersFailed(tuple(failures))
    payload = _document(request, analyzers, evidence, observations, failures)
    return AnalysisRunResult(document=validate_analysis_result(payload), payload=payload, failures=tuple(failures))


class AnalysisAllAdaptersFailed(AdapterError):
    """Raised when no adapter produced anything; the failures are attached."""

    def __init__(self, failures: tuple[dict[str, Any], ...]):
        super().__init__("no analyzer produced observations", reason="internal_error")
        self.failures = failures


@contextmanager
def _passthrough() -> Iterator[None]:
    yield


def _failure(adapter: AnalysisAdapter, reason: str, message: str) -> dict[str, Any]:
    return {
        "failure_id": f"failure.{adapter.analyzer_id}",
        "analyzer_id": adapter.analyzer_id,
        "reason": reason,
        "message": message[:2000],
    }


__all__ = [
    "AdapterError",
    "AdapterNetworkError",
    "AdapterOutput",
    "AnalysisAdapter",
    "AnalysisAllAdaptersFailed",
    "AnalysisRequest",
    "AnalysisRunResult",
    "FAILURE_REASONS",
    "OcrAdapter",
    "ShotBoundaryAdapter",
    "TranscriptAdapter",
    "run_analysis",
]
