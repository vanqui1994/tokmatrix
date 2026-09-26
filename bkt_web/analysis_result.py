"""Analysis Result v1: what an analyzer observed, never what to render (UV-300).

This schema is deliberately one-directional.  An analyzer records *observations*
about the source media — shots, transcript, OCR, tracks, poses, actions, camera
motion and audio events — each with a source time range, a confidence and at
least one piece of evidence.  Choosing a renderer, an asset, a style or a
storyboard entity is a creative decision made later by UV-304 and UV-502, so a
document that carries such a field is rejected here rather than quietly mixing
the two layers.

The module reuses the shared primitives of Universal Storyboard v2 (``Source``,
``Timebase``, ``Interval``, ``Region``, ``Evidence``) so that evidence recorded
during analysis can be carried into a storyboard's provenance without
translation.  Validation never mutates its input.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Annotated, Any, Literal
from urllib.parse import unquote, urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator

from bkt_web.universal_storyboard import Evidence, Interval, Region, Source, Timebase


ANALYSIS_SCHEMA_VERSION = "1.0.0"
MAX_DOCUMENT_NODES = 1_000_000
TIME_EPSILON = 1e-6

StableId = Annotated[str, StringConstraints(min_length=1, max_length=160, pattern=r"^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$")]
Seconds = float

# Fields that would turn an observation into a production decision.  The list is
# checked over the whole document, at any depth, including extension payloads.
FORBIDDEN_DECISION_KEYS = frozenset({
    "asset", "asset_id", "caption_style", "component_id", "decision", "entity_id",
    "fallback", "font", "palette", "profile", "recommendation", "render_plan",
    "renderer", "renderer_id", "scene_id", "storyboard", "storyboard_id", "style",
    "style_id", "template", "template_id", "tts", "typography", "voice", "voice_id",
})

OBSERVATION_KINDS = ("shot", "transcript", "ocr", "track", "pose", "action", "camera", "audio_event")


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    path: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "path": self.path, "message": self.message}


class AnalysisValidationError(ValueError):
    """Raised with every structural and semantic issue found in one document."""

    def __init__(self, issues: list[ValidationIssue] | tuple[ValidationIssue, ...]):
        self.issues = tuple(issues)
        super().__init__("; ".join(f"{item.code} at {item.path}: {item.message}" for item in self.issues))

    def as_dict(self) -> dict[str, Any]:
        return {"code": "ANALYSIS_RESULT_INVALID", "errors": [item.as_dict() for item in self.issues]}


def _json_path(parts: tuple[Any, ...] | list[Any]) -> str:
    path = "$"
    for part in parts:
        if isinstance(part, int):
            path += f"[{part}]"
        elif isinstance(part, str) and part.replace("_", "a").isalnum():
            path += f".{part}"
        else:
            path += f"['{str(part)}']"
    return path


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


# --- Analyzers and failures ---------------------------------------------


class Analyzer(StrictModel):
    analyzer_id: StableId
    kind: Literal["shot", "transcript", "ocr", "track", "pose", "action", "camera", "audio", "multi"]
    name: str = Field(min_length=1, max_length=300)
    version: str = Field(min_length=1, max_length=100)
    ran_at: str | None = Field(default=None, max_length=64)
    parameters: dict[str, Any] = Field(default_factory=dict)

    @field_validator("ran_at")
    @classmethod
    def validate_ran_at(cls, value: str | None) -> str | None:
        if value is None:
            return None
        from datetime import datetime

        candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            raise ValueError("ran_at must be an RFC 3339 date-time") from None
        if parsed.tzinfo is None:
            raise ValueError("ran_at must include a timezone")
        return value


class AnalyzerFailure(StrictModel):
    """A analyzer that did not finish. Recorded, so partial results stay usable."""

    failure_id: StableId
    analyzer_id: StableId
    reason: Literal["unavailable", "timeout", "unsupported_media", "low_quality_input", "internal_error", "cancelled"]
    message: str | None = Field(default=None, max_length=2000)
    covered: Interval | None = None


# --- Observation payloads ------------------------------------------------


class TranscriptWord(StrictModel):
    text: str = Field(min_length=1, max_length=200)
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


class TrackSample(StrictModel):
    time: Seconds = Field(ge=0, allow_inf_nan=False)
    region: Region
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


class Keypoint(StrictModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    visible: bool = True


class Alternative(StrictModel):
    """A competing reading the analyzer could not rule out."""

    label: str = Field(min_length=1, max_length=300)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


class _BaseObservation(StrictModel):
    observation_id: StableId
    analyzer_id: StableId
    source_interval: Interval
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    evidence_ids: list[StableId] = Field(min_length=1, max_length=1000)
    review_status: Literal["unreviewed", "accepted", "corrected", "rejected"] = "unreviewed"
    alternatives: list[Alternative] = Field(default_factory=list, max_length=100)
    notes: str | None = Field(default=None, max_length=2000)
    extensions: dict[str, Any] | None = None


class ShotObservation(_BaseObservation):
    kind: Literal["shot"]
    index: int = Field(ge=0)
    boundary: Literal["cut", "dissolve", "fade", "wipe", "unknown"] = "unknown"


class TranscriptObservation(_BaseObservation):
    kind: Literal["transcript"]
    text: str = Field(min_length=1, max_length=20_000)
    language: str | None = Field(default=None, pattern=r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    speaker_label: str | None = Field(default=None, max_length=100)
    words: list[TranscriptWord] = Field(default_factory=list, max_length=20_000)

    @field_validator("text")
    @classmethod
    def text_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value


class OcrObservation(_BaseObservation):
    kind: Literal["ocr"]
    text: str = Field(min_length=1, max_length=5000)
    region: Region
    language: str | None = Field(default=None, pattern=r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")


class TrackObservation(_BaseObservation):
    kind: Literal["track"]
    label: str = Field(min_length=1, max_length=200)
    category: Literal["person", "face", "hand", "animal", "object", "text", "screen", "unknown"]
    samples: list[TrackSample] = Field(min_length=1, max_length=100_000)
    identity_resolved: bool = False


class PoseObservation(_BaseObservation):
    kind: Literal["pose"]
    track_ref: StableId | None = None
    time: Seconds = Field(ge=0, allow_inf_nan=False)
    keypoints: list[Keypoint] = Field(min_length=1, max_length=1000)


class ActionObservation(_BaseObservation):
    kind: Literal["action"]
    label: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    actor_track_ref: StableId | None = None
    target_track_ref: StableId | None = None


class CameraObservation(_BaseObservation):
    kind: Literal["camera"]
    movement: Literal["static", "pan", "tilt", "zoom", "dolly", "truck", "orbit", "handheld", "unknown"]
    magnitude: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    direction_degrees: float | None = Field(default=None, ge=-360, le=360, allow_inf_nan=False)
    subject_track_ref: StableId | None = None


class AudioEventObservation(_BaseObservation):
    kind: Literal["audio_event"]
    category: Literal["speech", "music", "sfx", "ambience", "silence", "noise"]
    speaker_label: str | None = Field(default=None, max_length=100)
    loudness_lufs: float | None = Field(default=None, ge=-120, le=10, allow_inf_nan=False)
    peak_db: float | None = Field(default=None, ge=-120, le=10, allow_inf_nan=False)


Observation = Annotated[
    ShotObservation | TranscriptObservation | OcrObservation | TrackObservation
    | PoseObservation | ActionObservation | CameraObservation | AudioEventObservation,
    Field(discriminator="kind"),
]


class AnalysisResultV1(StrictModel):
    schema_version: Literal["1.0.0"]
    analysis_id: StableId
    source: Source
    timebase: Timebase
    duration_seconds: Seconds = Field(ge=0, allow_inf_nan=False)
    analyzers: list[Analyzer] = Field(min_length=1, max_length=1000)
    evidence: list[Evidence] = Field(min_length=1, max_length=100_000)
    observations: list[Observation] = Field(max_length=1_000_000)
    failures: list[AnalyzerFailure] = Field(default_factory=list, max_length=1000)
    extensions: dict[str, Any] | None = None


# --- Preflight -----------------------------------------------------------


def _has_path_traversal(value: str) -> bool:
    if "\x00" in value:
        return True
    decoded = unquote(value)
    try:
        path = urlsplit(decoded).path
    except ValueError:
        path = decoded
    return any(part == ".." for part in path.replace("\\", "/").split("/"))


def _preflight(value: Any, path: tuple[Any, ...] = (), counter: list[int] | None = None) -> list[ValidationIssue]:
    """Reject hostile values, creative fields and oversized documents early."""
    if counter is None:
        counter = [0]
    counter[0] += 1
    if counter[0] > MAX_DOCUMENT_NODES:
        return [ValidationIssue("DOCUMENT_TOO_LARGE", "$", f"document exceeds {MAX_DOCUMENT_NODES} nodes")]
    issues: list[ValidationIssue] = []
    if isinstance(value, float) and not math.isfinite(value):
        issues.append(ValidationIssue("NON_FINITE_NUMBER", _json_path(path), "NaN and Infinity are not valid analysis numbers"))
    elif isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                issues.append(ValidationIssue("INVALID_OBJECT_KEY", _json_path((*path, key)), "object keys must be strings"))
                continue
            if key in FORBIDDEN_DECISION_KEYS:
                issues.append(ValidationIssue(
                    "CREATIVE_DECISION_IN_ANALYSIS",
                    _json_path((*path, key)),
                    f"'{key}' is a production decision and must not appear in an analysis result",
                ))
            issues.extend(_preflight(child, (*path, key), counter))
            if key in {"uri", "path", "file_path", "media_path"} and isinstance(child, str) and _has_path_traversal(child):
                issues.append(ValidationIssue("PATH_TRAVERSAL", _json_path((*path, key)), "path traversal segments are forbidden"))
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            issues.extend(_preflight(child, (*path, index), counter))
    return issues


def _structural_code(error_type: str) -> str:
    if error_type == "missing":
        return "REQUIRED_FIELD"
    if error_type == "extra_forbidden":
        return "UNKNOWN_FIELD"
    if error_type.startswith("union_tag"):
        return "UNKNOWN_OBSERVATION_KIND"
    return "INVALID_VALUE"


# --- Semantic validation -------------------------------------------------


class _SemanticValidator:
    def __init__(self, document: AnalysisResultV1):
        self.document = document
        self.issues: list[ValidationIssue] = []

    def issue(self, code: str, path: str, message: str) -> None:
        self.issues.append(ValidationIssue(code, path, message))

    def _unique(self, values: list[str], path: str, label: str) -> None:
        seen: set[str] = set()
        for index, value in enumerate(values):
            if value in seen:
                self.issue("DUPLICATE_ID", f"{path}[{index}]", f"duplicate {label}: {value}")
            seen.add(value)

    def _interval(self, interval: Interval, path: str) -> None:
        if interval.end + TIME_EPSILON < interval.start:
            self.issue("INVALID_INTERVAL", path, "end must not be before start")
        if interval.end > self.document.duration_seconds + TIME_EPSILON:
            self.issue("INTERVAL_OUT_OF_SOURCE", path, "interval runs past the source duration")

    def run(self) -> list[ValidationIssue]:
        document = self.document
        analyzers = {item.analyzer_id for item in document.analyzers}
        self._unique([item.analyzer_id for item in document.analyzers], "$.analyzers", "analyzer_id")
        self._unique([item.evidence_id for item in document.evidence], "$.evidence", "evidence_id")
        self._unique([item.observation_id for item in document.observations], "$.observations", "observation_id")
        self._unique([item.failure_id for item in document.failures], "$.failures", "failure_id")

        evidence_ids: set[str] = set()
        for index, evidence in enumerate(document.evidence):
            base = f"$.evidence[{index}]"
            evidence_ids.add(evidence.evidence_id)
            if evidence.source_id != document.source.source_id:
                self.issue("UNKNOWN_REFERENCE", f"{base}.source_id", "evidence must reference the analysed source")
            self._interval(evidence.interval, f"{base}.interval")

        for index, failure in enumerate(document.failures):
            base = f"$.failures[{index}]"
            if failure.analyzer_id not in analyzers:
                self.issue("UNKNOWN_REFERENCE", f"{base}.analyzer_id", f"unknown analyzer: {failure.analyzer_id}")
            if failure.covered is not None:
                self._interval(failure.covered, f"{base}.covered")

        tracks = {item.observation_id for item in document.observations if item.kind == "track"}
        shots_by_analyzer: dict[str, list[tuple[float, float, str]]] = {}
        for index, observation in enumerate(document.observations):
            base = f"$.observations[{index}]"
            if observation.analyzer_id not in analyzers:
                self.issue("UNKNOWN_REFERENCE", f"{base}.analyzer_id", f"unknown analyzer: {observation.analyzer_id}")
            self._interval(observation.source_interval, f"{base}.source_interval")
            for position, evidence_id in enumerate(observation.evidence_ids):
                if evidence_id not in evidence_ids:
                    self.issue("UNKNOWN_REFERENCE", f"{base}.evidence_ids[{position}]", f"unknown evidence: {evidence_id}")
            self._observation(observation, base, tracks, shots_by_analyzer)

        for analyzer_id, shots in shots_by_analyzer.items():
            ordered = sorted(shots, key=lambda item: (item[0], item[1], item[2]))
            for (_start, previous_end, _previous_id), (next_start, _end, next_id) in zip(ordered, ordered[1:]):
                if next_start + TIME_EPSILON < previous_end:
                    self.issue(
                        "OVERLAPPING_SHOTS",
                        f"$.observations['{next_id}']",
                        f"shots from analyzer {analyzer_id} must not overlap",
                    )
        return self.issues

    def _reference(self, value: str | None, tracks: set[str], path: str) -> None:
        if value is not None and value not in tracks:
            self.issue("UNKNOWN_REFERENCE", path, f"unknown track observation: {value}")

    def _observation(self, observation: Any, base: str, tracks: set[str], shots: dict[str, list[tuple[float, float, str]]]) -> None:
        interval = observation.source_interval
        if observation.kind == "shot":
            shots.setdefault(observation.analyzer_id, []).append((interval.start, interval.end, observation.observation_id))
        elif observation.kind == "transcript":
            previous_end = interval.start - TIME_EPSILON
            for position, word in enumerate(observation.words):
                wbase = f"{base}.words[{position}]"
                if word.end + TIME_EPSILON < word.start:
                    self.issue("INVALID_INTERVAL", wbase, "word end must not be before start")
                if word.start + TIME_EPSILON < interval.start or word.end > interval.end + TIME_EPSILON:
                    self.issue("WORD_OUTSIDE_OBSERVATION", wbase, "word timing must stay inside the observation interval")
                if word.start + TIME_EPSILON < previous_end:
                    self.issue("WORDS_OUT_OF_ORDER", wbase, "words must be in chronological order")
                previous_end = word.end
        elif observation.kind == "track":
            previous_time = -math.inf
            for position, sample in enumerate(observation.samples):
                sbase = f"{base}.samples[{position}]"
                if sample.time + TIME_EPSILON < interval.start or sample.time > interval.end + TIME_EPSILON:
                    self.issue("SAMPLE_OUTSIDE_OBSERVATION", sbase, "sample time must stay inside the observation interval")
                if sample.time + TIME_EPSILON < previous_time:
                    self.issue("SAMPLES_OUT_OF_ORDER", sbase, "track samples must be in chronological order")
                if sample.region.space != "normalized_source":
                    self.issue("INVALID_REGION_SPACE", f"{sbase}.region.space", "analysis regions are normalized_source")
                previous_time = sample.time
            if observation.identity_resolved and observation.confidence < 0.5:
                self.issue(
                    "UNSUPPORTED_IDENTITY_CLAIM",
                    f"{base}.identity_resolved",
                    "a resolved identity needs at least 0.5 confidence",
                )
        elif observation.kind == "pose":
            self._reference(observation.track_ref, tracks, f"{base}.track_ref")
            if observation.time + TIME_EPSILON < interval.start or observation.time > interval.end + TIME_EPSILON:
                self.issue("SAMPLE_OUTSIDE_OBSERVATION", f"{base}.time", "pose time must stay inside the observation interval")
            names = [item.name for item in observation.keypoints]
            if len(names) != len(set(names)):
                self.issue("DUPLICATE_ID", f"{base}.keypoints", "keypoint names must be unique")
        elif observation.kind == "action":
            self._reference(observation.actor_track_ref, tracks, f"{base}.actor_track_ref")
            self._reference(observation.target_track_ref, tracks, f"{base}.target_track_ref")
        elif observation.kind == "camera":
            self._reference(observation.subject_track_ref, tracks, f"{base}.subject_track_ref")
        elif observation.kind == "ocr":
            if observation.region.space != "normalized_source":
                self.issue("INVALID_REGION_SPACE", f"{base}.region.space", "analysis regions are normalized_source")


def validate_analysis_result(data: Any) -> AnalysisResultV1:
    """Validate an Analysis Result v1 document. The input is never changed."""
    preflight = _preflight(data)
    if preflight:
        raise AnalysisValidationError(preflight)
    try:
        document = AnalysisResultV1.model_validate(data)
    except ValidationError as exc:
        raise AnalysisValidationError([
            ValidationIssue(_structural_code(str(error["type"])), _json_path(tuple(error["loc"])), str(error["msg"]))
            for error in exc.errors(include_url=False, include_input=False)
        ]) from None
    issues = _SemanticValidator(document).run()
    if issues:
        raise AnalysisValidationError(issues)
    return document


def validate_analysis_result_json(raw: str | bytes | bytearray) -> AnalysisResultV1:
    """Parse strict JSON and validate it as an Analysis Result v1 document."""
    try:
        if isinstance(raw, (bytes, bytearray)):
            raw = bytes(raw).decode("utf-8")
        data = json.loads(raw, parse_constant=lambda token: (_ for _ in ()).throw(ValueError(token)))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
        raise AnalysisValidationError([ValidationIssue("INVALID_JSON", "$", f"invalid strict JSON: {exc}")]) from None
    return validate_analysis_result(data)


def observations_of(document: AnalysisResultV1, kind: str) -> tuple[Any, ...]:
    """Every observation of one kind, in document order."""
    if kind not in OBSERVATION_KINDS:
        raise AnalysisValidationError([ValidationIssue("UNKNOWN_OBSERVATION_KIND", "$", f"unknown observation kind: {kind}")])
    return tuple(item for item in document.observations if item.kind == kind)


def covered_intervals(document: AnalysisResultV1, kind: str) -> tuple[tuple[float, float], ...]:
    """Sorted source intervals an analyzer kind reported on."""
    return tuple(sorted((item.source_interval.start, item.source_interval.end) for item in observations_of(document, kind)))


__all__ = [
    "ANALYSIS_SCHEMA_VERSION",
    "FORBIDDEN_DECISION_KEYS",
    "OBSERVATION_KINDS",
    "AnalysisResultV1",
    "AnalysisValidationError",
    "Analyzer",
    "AnalyzerFailure",
    "ValidationIssue",
    "covered_intervals",
    "observations_of",
    "validate_analysis_result",
    "validate_analysis_result_json",
]
