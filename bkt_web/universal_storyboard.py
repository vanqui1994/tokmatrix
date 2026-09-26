"""Models and semantic validation for Universal Storyboard v2.

The JSON Schema remains the interchange contract.  This module is the runtime
validator: it deliberately performs cross-object checks which JSON Schema
cannot express, and never mutates the caller's input.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from typing import Annotated, Any, Literal
from urllib.parse import unquote, urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator


SCHEMA_VERSION = "2.0.0"
MAX_DOCUMENT_NODES = 1_000_000
TIME_EPSILON = 1e-6
_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$")
_EXTENSION_RE = re.compile(r"^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+:[a-z][a-z0-9._-]*$")


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    path: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "path": self.path, "message": self.message}


class StoryboardValidationError(ValueError):
    """Raised with all structural and semantic validation issues."""

    def __init__(self, issues: list[ValidationIssue] | tuple[ValidationIssue, ...]):
        self.issues = tuple(issues)
        summary = "; ".join(f"{item.code} at {item.path}: {item.message}" for item in self.issues)
        super().__init__(summary)

    def as_dict(self) -> dict[str, Any]:
        return {"code": "STORYBOARD_V2_INVALID", "errors": [item.as_dict() for item in self.issues]}


def _json_path(parts: tuple[Any, ...] | list[Any]) -> str:
    path = "$"
    for part in parts:
        if isinstance(part, int):
            path += f"[{part}]"
        elif isinstance(part, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part):
            path += f".{part}"
        else:
            escaped = str(part).replace("\\", "\\\\").replace("'", "\\'")
            path += f"['{escaped}']"
    return path


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class ExtensionModel(StrictModel):
    extensions: dict[str, Any] | None = None

    @field_validator("extensions")
    @classmethod
    def validate_extension_names(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is not None:
            bad = next((key for key in value if not _EXTENSION_RE.fullmatch(key)), None)
            if bad is not None:
                raise ValueError(f"extension key is not namespaced: {bad}")
        return value


StableId = Annotated[str, StringConstraints(min_length=1, max_length=160, pattern=r"^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$")]
Seconds = float


class Interval(StrictModel):
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)


class Source(ExtensionModel):
    source_id: StableId
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    media_type: str = Field(pattern=r"^[a-z0-9.+-]+/[a-z0-9.+-]+$")
    uri: str | None = Field(default=None, max_length=4096)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    frame_rate: float | None = Field(default=None, gt=0, allow_inf_nan=False)


class Timebase(StrictModel):
    unit: Literal["seconds"]
    origin_seconds: Literal[0]
    precision: int | None = Field(default=None, ge=0, le=9)


class Analysis(StrictModel):
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    evidence_ids: list[StableId] = Field(min_length=1)
    model: str | None = Field(default=None, max_length=300)
    review_status: Literal["unreviewed", "accepted", "corrected", "rejected"] | None = None


class Region(StrictModel):
    space: Literal["normalized_source", "normalized_output"]
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)
    width: float = Field(gt=0, le=1, allow_inf_nan=False)
    height: float = Field(gt=0, le=1, allow_inf_nan=False)


class Evidence(ExtensionModel):
    evidence_id: StableId
    kind: Literal["frame", "frame_range", "audio_range", "transcript_span", "ocr_region", "human_annotation", "external_reference"]
    source_id: StableId
    interval: Interval
    region: Region | None = None
    quote: str | None = Field(default=None, max_length=2000)
    annotation: str | None = Field(default=None, max_length=4000)


class Provenance(ExtensionModel):
    provenance_id: StableId
    kind: Literal["source", "human", "analysis", "generated", "imported", "migrated"]
    created_at: str
    agent: str = Field(min_length=1, max_length=300)
    tool_version: str | None = Field(default=None, max_length=100)
    source_refs: list[StableId] = Field(default_factory=list)
    license: str | None = Field(default=None, max_length=300)
    evidence: list[Evidence] = Field(max_length=100_000)

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: str) -> str:
        from datetime import datetime

        candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            raise ValueError("created_at must be an RFC 3339 date-time") from None
        if parsed.tzinfo is None:
            raise ValueError("created_at must include a timezone")
        return value


class TimelineItem(ExtensionModel):
    item_id: StableId
    target_type: Literal["scene", "action", "audio_event", "caption", "external_media", "custom"]
    target_id: StableId
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    layer: int | None = None


class Track(ExtensionModel):
    track_id: StableId
    kind: Literal["visual", "dialogue", "music", "sfx", "captions", "data", "custom"]
    label: str | None = Field(default=None, max_length=300)
    items: list[TimelineItem] = Field(max_length=100_000)


class Anchor(ExtensionModel):
    anchor_id: StableId
    name: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    semantic: str | None = Field(default=None, max_length=100)


class Component(ExtensionModel):
    component_id: StableId
    kind: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    parent_component_id: StableId | None = None
    state: Literal["visible", "hidden", "attached", "detached", "damaged"]
    anchors: list[Anchor] = Field(default_factory=list, max_length=1000)
    attributes: dict[str, Any] = Field(default_factory=dict)


class Entity(ExtensionModel):
    entity_id: StableId
    kind: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    label: str | None = Field(default=None, max_length=300)
    role: str | None = Field(default=None, max_length=100)
    components: list[Component] = Field(max_length=10_000)
    attributes: dict[str, Any] = Field(default_factory=dict)
    analysis: Analysis | None = None
    provenance_id: StableId


class Relation(ExtensionModel):
    relation_id: StableId
    type: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    subject_id: StableId
    object_id: StableId
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    attributes: dict[str, Any] = Field(default_factory=dict)
    analysis: Analysis | None = None
    provenance_id: StableId


class Action(ExtensionModel):
    action_id: StableId
    type: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    actor_ids: list[StableId] = Field(min_length=1)
    target_ids: list[StableId]
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    parameters: dict[str, Any] = Field(default_factory=dict)
    analysis: Analysis | None = None
    provenance_id: StableId


class Constraint(ExtensionModel):
    constraint_id: StableId
    type: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    subject_ids: list[StableId] = Field(min_length=1)
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    strength: Literal["hard", "soft"]
    parameters: dict[str, Any] = Field(default_factory=dict)
    analysis: Analysis | None = None
    provenance_id: StableId


class CameraShot(ExtensionModel):
    shot_id: StableId
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    framing: Literal["extreme_wide", "wide", "full", "medium", "close_up", "extreme_close_up", "over_shoulder", "point_of_view", "screen_capture", "custom"]
    movement: Literal["static", "pan", "tilt", "dolly", "truck", "pedestal", "zoom", "orbit", "handheld", "tracking", "custom"]
    subject_ids: list[StableId] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    analysis: Analysis | None = None
    provenance_id: StableId


class Camera(ExtensionModel):
    camera_id: StableId
    shots: list[CameraShot] = Field(min_length=1, max_length=10_000)


class AudioEvent(ExtensionModel):
    audio_event_id: StableId
    kind: Literal["dialogue", "music", "sfx", "ambience", "silence", "custom"]
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    speaker_id: StableId | None = None
    text: str | None = Field(default=None, max_length=20_000)
    language: str | None = Field(default=None, pattern=r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    media_ref: StableId | None = None
    gain_db: float | None = Field(default=None, ge=-120, le=24, allow_inf_nan=False)
    analysis: Analysis | None = None
    provenance_id: StableId

    @field_validator("text")
    @classmethod
    def dialogue_text_is_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("text must not be blank")
        return value


class Environment(ExtensionModel):
    environment_id: StableId
    kind: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=100)
    attributes: dict[str, Any] = Field(default_factory=dict)


class Style(ExtensionModel):
    style_id: StableId
    tags: list[str]
    palette: list[str] = Field(default_factory=list)
    typography: list[str] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)


class FidelityRequirement(ExtensionModel):
    requirement_id: StableId
    capability: str = Field(pattern=r"^[a-z][a-z0-9._-]*$", max_length=160)
    target_ids: list[StableId]
    metric: str | None = Field(default=None, max_length=100)
    tolerance: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    description: str | None = Field(default=None, max_length=2000)


class FidelityProfile(StrictModel):
    required: list[FidelityRequirement] = Field(max_length=10_000)
    preferred: list[FidelityRequirement] = Field(max_length=10_000)
    optional: list[FidelityRequirement] = Field(max_length=10_000)


class Scene(ExtensionModel):
    scene_id: StableId
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    summary: str | None = Field(default=None, max_length=4000)
    entities: list[Entity] = Field(max_length=10_000)
    relations: list[Relation] = Field(max_length=100_000)
    actions: list[Action] = Field(max_length=100_000)
    constraints: list[Constraint] = Field(max_length=100_000)
    camera: Camera
    environment: Environment | None = None
    style: Style | None = None
    audio_events: list[AudioEvent] = Field(max_length=100_000)
    render_requirements: FidelityProfile
    analysis: Analysis | None = None
    provenance_id: StableId


class RendererSelection(ExtensionModel):
    selection_id: StableId
    scene_id: StableId
    start: Seconds = Field(ge=0, allow_inf_nan=False)
    end: Seconds = Field(ge=0, allow_inf_nan=False)
    renderer_id: StableId
    renderer_version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")
    status: Literal["selected", "needs-review", "rejected"]
    satisfied_requirement_ids: list[StableId]
    fallback_ids: list[StableId]
    explanation: str | None = Field(default=None, max_length=4000)


class Fallback(ExtensionModel):
    fallback_id: StableId
    scene_id: StableId
    type: Literal["alternate_renderer", "simplify", "freeze_frame", "source_composite", "generated_media", "needs-review"]
    reason_code: str = Field(pattern=r"^[A-Z][A-Z0-9_]*$", max_length=100)
    disclosure: str = Field(min_length=1, max_length=4000)
    source_media_usage: Literal["none", "visual", "audio", "visual_and_audio"]
    approval_required: bool
    affected_requirement_ids: list[StableId] = Field(default_factory=list)


class RenderPlan(ExtensionModel):
    render_plan_id: StableId
    status: Literal["draft", "routable", "needs-review", "approved", "failed"]
    selections: list[RendererSelection] = Field(max_length=100_000)
    fallbacks: list[Fallback] = Field(max_length=100_000)


class UniversalStoryboardV2(ExtensionModel):
    schema_version: Literal["2.0.0"]
    project_id: StableId
    title: str | None = Field(default=None, max_length=500)
    source: Source
    duration_seconds: Seconds = Field(ge=0, allow_inf_nan=False)
    timebase: Timebase
    tracks: list[Track] = Field(max_length=10_000)
    scenes: list[Scene] = Field(max_length=100_000)
    render_plan: RenderPlan
    provenance: list[Provenance] = Field(min_length=1, max_length=100_000)


def _preflight(value: Any, path: tuple[Any, ...] = (), counter: list[int] | None = None) -> list[ValidationIssue]:
    """Reject hostile/non-JSON values and cap work before Pydantic parsing."""
    if counter is None:
        counter = [0]
    counter[0] += 1
    if counter[0] > MAX_DOCUMENT_NODES:
        return [ValidationIssue("DOCUMENT_TOO_LARGE", "$", f"document exceeds {MAX_DOCUMENT_NODES} nodes")]
    issues: list[ValidationIssue] = []
    if isinstance(value, float) and not math.isfinite(value):
        issues.append(ValidationIssue("NON_FINITE_NUMBER", _json_path(path), "NaN and Infinity are not valid storyboard numbers"))
    elif isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                issues.append(ValidationIssue("INVALID_OBJECT_KEY", _json_path((*path, key)), "object keys must be strings"))
                continue
            issues.extend(_preflight(child, (*path, key), counter))
            if key in {"uri", "path", "file_path", "media_path"} and isinstance(child, str) and _has_path_traversal(child):
                issues.append(ValidationIssue("PATH_TRAVERSAL", _json_path((*path, key)), "path traversal segments are forbidden"))
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            issues.extend(_preflight(child, (*path, index), counter))
    return issues


def _has_path_traversal(value: str) -> bool:
    if "\x00" in value:
        return True
    decoded = unquote(value)
    try:
        path = urlsplit(decoded).path
    except ValueError:
        path = decoded
    parts = path.replace("\\", "/").split("/")
    return any(part == ".." for part in parts)


def _structural_code(error_type: str, location: tuple[Any, ...]) -> str:
    if error_type == "missing":
        return "REQUIRED_FIELD"
    if error_type == "extra_forbidden":
        return "UNKNOWN_FIELD"
    if error_type in {"finite_number", "less_than_equal", "greater_than_equal"}:
        return "INVALID_NUMBER"
    if error_type in {"literal_error", "enum"}:
        return "INVALID_ENUM"
    if error_type == "string_pattern_mismatch":
        id_location = any(str(part).endswith(("_id", "_ids")) for part in location if isinstance(part, str))
        return "INVALID_ID" if id_location else "INVALID_FORMAT"
    if error_type.startswith("list_"):
        return "INVALID_COLLECTION"
    return "INVALID_TYPE"


class _SemanticValidator:
    def __init__(self, project: UniversalStoryboardV2):
        self.project = project
        self.issues: list[ValidationIssue] = []
        self.ids: dict[str, tuple[str, str]] = {}
        self.requirement_tiers: dict[str, str] = {}
        self.scene_for_id: dict[str, str] = {}

    def issue(self, code: str, path: str, message: str) -> None:
        self.issues.append(ValidationIssue(code, path, message))

    def register(self, object_id: str, object_type: str, path: str, scene_id: str | None = None) -> None:
        if len(object_id) > 160 or not _ID_RE.fullmatch(object_id):
            self.issue("INVALID_ID", path, "ID does not match the stable ID syntax")
            return
        previous = self.ids.get(object_id)
        if previous:
            self.issue("DUPLICATE_ID", path, f"ID is already defined as {previous[0]} at {previous[1]}")
            return
        self.ids[object_id] = (object_type, path)
        if scene_id:
            self.scene_for_id[object_id] = scene_id

    def reference(self, object_id: str, expected: set[str] | None, path: str, *, same_scene: str | None = None) -> None:
        if len(object_id) > 160 or not _ID_RE.fullmatch(object_id):
            self.issue("INVALID_ID", path, "reference does not match the stable ID syntax")
            return
        found = self.ids.get(object_id)
        if found is None:
            self.issue("UNKNOWN_REFERENCE", path, f"unknown reference: {object_id}")
            return
        if expected is not None and found[0] not in expected:
            self.issue("REFERENCE_TYPE_MISMATCH", path, f"expected {sorted(expected)}, found {found[0]}")
        if same_scene and object_id in self.scene_for_id and self.scene_for_id[object_id] != same_scene:
            self.issue("CROSS_SCENE_REFERENCE", path, f"reference belongs to scene {self.scene_for_id[object_id]}")

    def interval(self, start: float, end: float, path: str, outer: tuple[float, float] | None = None) -> None:
        if not start < end:
            self.issue("INVALID_INTERVAL", path, "interval must satisfy start < end")
            return
        if end > self.project.duration_seconds + TIME_EPSILON:
            self.issue("INTERVAL_OUT_OF_PROJECT", path, "interval ends after project duration")
        if outer and (start < outer[0] - TIME_EPSILON or end > outer[1] + TIME_EPSILON):
            self.issue("INTERVAL_OUT_OF_PARENT", path, "interval must be contained by its parent scene")

    def collect_ids(self) -> None:
        p = self.project
        self.register(p.project_id, "project", "$.project_id")
        self.register(p.source.source_id, "source", "$.source.source_id")
        self.register(p.render_plan.render_plan_id, "render_plan", "$.render_plan.render_plan_id")
        for i, provenance in enumerate(p.provenance):
            base = f"$.provenance[{i}]"
            self.register(provenance.provenance_id, "provenance", f"{base}.provenance_id")
            for j, evidence in enumerate(provenance.evidence):
                self.register(evidence.evidence_id, "evidence", f"{base}.evidence[{j}].evidence_id")
        for i, track in enumerate(p.tracks):
            base = f"$.tracks[{i}]"
            self.register(track.track_id, "track", f"{base}.track_id")
            for j, item in enumerate(track.items):
                self.register(item.item_id, "timeline_item", f"{base}.items[{j}].item_id")
        for i, scene in enumerate(p.scenes):
            base = f"$.scenes[{i}]"
            sid = scene.scene_id
            self.register(sid, "scene", f"{base}.scene_id", sid)
            for name, object_type, objects, id_field in (
                ("entities", "entity", scene.entities, "entity_id"),
                ("relations", "relation", scene.relations, "relation_id"),
                ("actions", "action", scene.actions, "action_id"),
                ("constraints", "constraint", scene.constraints, "constraint_id"),
                ("audio_events", "audio_event", scene.audio_events, "audio_event_id"),
            ):
                for j, obj in enumerate(objects):
                    self.register(getattr(obj, id_field), object_type, f"{base}.{name}[{j}].{id_field}", sid)
            self.register(scene.camera.camera_id, "camera", f"{base}.camera.camera_id", sid)
            for j, shot in enumerate(scene.camera.shots):
                self.register(shot.shot_id, "camera_shot", f"{base}.camera.shots[{j}].shot_id", sid)
            if scene.environment:
                self.register(scene.environment.environment_id, "environment", f"{base}.environment.environment_id", sid)
            if scene.style:
                self.register(scene.style.style_id, "style", f"{base}.style.style_id", sid)
            for j, entity in enumerate(scene.entities):
                for k, component in enumerate(entity.components):
                    cbase = f"{base}.entities[{j}].components[{k}]"
                    self.register(component.component_id, "component", f"{cbase}.component_id", sid)
                    for m, anchor in enumerate(component.anchors):
                        self.register(anchor.anchor_id, "anchor", f"{cbase}.anchors[{m}].anchor_id", sid)
            for tier in ("required", "preferred", "optional"):
                for j, requirement in enumerate(getattr(scene.render_requirements, tier)):
                    rpath = f"{base}.render_requirements.{tier}[{j}].requirement_id"
                    previous_tier = self.requirement_tiers.get(requirement.requirement_id)
                    if previous_tier and previous_tier != tier:
                        self.issue("REQUIREMENT_TIER_CONFLICT", rpath, f"requirement also appears in {previous_tier}")
                    self.requirement_tiers[requirement.requirement_id] = tier
                    self.register(requirement.requirement_id, "fidelity_requirement", rpath, sid)
        for i, selection in enumerate(p.render_plan.selections):
            self.register(selection.selection_id, "renderer_selection", f"$.render_plan.selections[{i}].selection_id")
        for i, fallback in enumerate(p.render_plan.fallbacks):
            self.register(fallback.fallback_id, "fallback", f"$.render_plan.fallbacks[{i}].fallback_id")

    def validate_references_and_intervals(self) -> None:
        p = self.project
        self.interval(0, p.duration_seconds, "$.duration_seconds")
        provenance_types = {"provenance"}
        for i, provenance in enumerate(p.provenance):
            base = f"$.provenance[{i}]"
            for j, source_ref in enumerate(provenance.source_refs):
                self.reference(source_ref, {"source"}, f"{base}.source_refs[{j}]")
            for j, evidence in enumerate(provenance.evidence):
                ebase = f"{base}.evidence[{j}]"
                self.reference(evidence.source_id, {"source"}, f"{ebase}.source_id")
                self.interval(evidence.interval.start, evidence.interval.end, f"{ebase}.interval")
        target_types = {"scene": {"scene"}, "action": {"action"}, "audio_event": {"audio_event"}}
        target_times: dict[str, tuple[float, float]] = {}
        for scene in p.scenes:
            target_times[scene.scene_id] = (scene.start, scene.end)
            for value in (*scene.actions, *scene.audio_events):
                target_id = value.action_id if isinstance(value, Action) else value.audio_event_id
                target_times[target_id] = (value.start, value.end)
        for i, track in enumerate(p.tracks):
            for j, item in enumerate(track.items):
                base = f"$.tracks[{i}].items[{j}]"
                self.interval(item.start, item.end, base)
                expected = target_types.get(item.target_type)
                if expected:
                    self.reference(item.target_id, expected, f"{base}.target_id")
                    canonical = target_times.get(item.target_id)
                    if canonical and (abs(item.start - canonical[0]) > TIME_EPSILON or abs(item.end - canonical[1]) > TIME_EPSILON):
                        self.issue("TRACK_TIME_MISMATCH", base, "track item interval differs from canonical target")
        for i, scene in enumerate(p.scenes):
            base = f"$.scenes[{i}]"
            sid = scene.scene_id
            outer = (scene.start, scene.end)
            self.interval(scene.start, scene.end, base)
            self.reference(scene.provenance_id, provenance_types, f"{base}.provenance_id")
            self._analysis(scene.analysis, f"{base}.analysis")
            for j, entity in enumerate(scene.entities):
                ebase = f"{base}.entities[{j}]"
                self.reference(entity.provenance_id, provenance_types, f"{ebase}.provenance_id")
                self._analysis(entity.analysis, f"{ebase}.analysis")
                component_ids = {component.component_id for component in entity.components}
                parent_graph: dict[str, str] = {}
                for k, component in enumerate(entity.components):
                    cbase = f"{ebase}.components[{k}]"
                    if component.parent_component_id:
                        self.reference(component.parent_component_id, {"component"}, f"{cbase}.parent_component_id", same_scene=sid)
                        if component.parent_component_id not in component_ids:
                            self.issue("COMPONENT_PARENT_OUTSIDE_ENTITY", f"{cbase}.parent_component_id", "parent component must belong to the same entity")
                        parent_graph[component.component_id] = component.parent_component_id
                self._cycles(parent_graph, f"{ebase}.components", "COMPONENT_CYCLE")
            timed_groups = (
                ("relations", scene.relations), ("actions", scene.actions),
                ("constraints", scene.constraints), ("audio_events", scene.audio_events),
            )
            for group_name, values in timed_groups:
                for j, value in enumerate(values):
                    vbase = f"{base}.{group_name}[{j}]"
                    self.interval(value.start, value.end, vbase, outer)
                    self.reference(value.provenance_id, provenance_types, f"{vbase}.provenance_id")
                    self._analysis(value.analysis, f"{vbase}.analysis")
            addressable = {"entity", "component", "anchor", "camera", "camera_shot", "environment", "style", "audio_event", "action", "constraint"}
            attachment_graph: dict[str, str] = {}
            for j, relation in enumerate(scene.relations):
                rbase = f"{base}.relations[{j}]"
                self.reference(relation.subject_id, addressable, f"{rbase}.subject_id", same_scene=sid)
                self.reference(relation.object_id, addressable, f"{rbase}.object_id", same_scene=sid)
                if relation.type == "attached_to":
                    attachment_graph[relation.subject_id] = relation.object_id
            self._cycles(attachment_graph, f"{base}.relations", "ATTACHMENT_CYCLE")
            for j, action in enumerate(scene.actions):
                for k, actor_id in enumerate(action.actor_ids):
                    self.reference(actor_id, {"entity"}, f"{base}.actions[{j}].actor_ids[{k}]", same_scene=sid)
                for k, target_id in enumerate(action.target_ids):
                    self.reference(target_id, addressable, f"{base}.actions[{j}].target_ids[{k}]", same_scene=sid)
            for j, constraint in enumerate(scene.constraints):
                for k, subject_id in enumerate(constraint.subject_ids):
                    self.reference(subject_id, addressable, f"{base}.constraints[{j}].subject_ids[{k}]", same_scene=sid)
            for j, shot in enumerate(scene.camera.shots):
                sbase = f"{base}.camera.shots[{j}]"
                self.interval(shot.start, shot.end, sbase, outer)
                self.reference(shot.provenance_id, provenance_types, f"{sbase}.provenance_id")
                self._analysis(shot.analysis, f"{sbase}.analysis")
                for k, subject_id in enumerate(shot.subject_ids):
                    self.reference(subject_id, {"entity"}, f"{sbase}.subject_ids[{k}]", same_scene=sid)
            for j, audio in enumerate(scene.audio_events):
                abase = f"{base}.audio_events[{j}]"
                if audio.kind == "dialogue":
                    if audio.speaker_id is None:
                        self.issue("DIALOGUE_SPEAKER_REQUIRED", f"{abase}.speaker_id", "dialogue requires a speaker")
                    else:
                        self.reference(audio.speaker_id, {"entity"}, f"{abase}.speaker_id", same_scene=sid)
                    if audio.text is None:
                        self.issue("DIALOGUE_TEXT_REQUIRED", f"{abase}.text", "dialogue requires text")
            for tier in ("required", "preferred", "optional"):
                for j, requirement in enumerate(getattr(scene.render_requirements, tier)):
                    for k, target_id in enumerate(requirement.target_ids):
                        self.reference(target_id, addressable | {"relation"}, f"{base}.render_requirements.{tier}[{j}].target_ids[{k}]", same_scene=sid)

    def _analysis(self, analysis: Analysis | None, path: str) -> None:
        if analysis:
            for i, evidence_id in enumerate(analysis.evidence_ids):
                self.reference(evidence_id, {"evidence"}, f"{path}.evidence_ids[{i}]")

    def _cycles(self, graph: dict[str, str], path: str, code: str) -> None:
        done: set[str] = set()
        for node in graph:
            if node in done:
                continue
            visiting: set[str] = set()
            current = node
            while current in graph and current not in done:
                if current in visiting:
                    self.issue(code, path, f"cycle detected at {current}")
                    break
                visiting.add(current)
                current = graph[current]
            done.update(visiting)

    def validate_scene_continuity(self) -> None:
        if not self.project.scenes:
            self.issue("SCENE_COVERAGE_EMPTY", "$.scenes", "project requires at least one scene")
            return
        previous_end = 0.0
        for i, scene in enumerate(self.project.scenes):
            if scene.start < previous_end - TIME_EPSILON:
                self.issue("SCENE_OVERLAP", f"$.scenes[{i}].start", "scene overlaps the previous scene")
            elif scene.start > previous_end + TIME_EPSILON:
                self.issue("SCENE_GAP", f"$.scenes[{i}].start", "scene timeline has a gap")
            previous_end = max(previous_end, scene.end)
        if abs(previous_end - self.project.duration_seconds) > TIME_EPSILON:
            self.issue("SCENE_COVERAGE_END", "$.scenes", "scenes must cover the project through duration_seconds")

    def validate_render_plan(self) -> None:
        plan = self.project.render_plan
        scene_by_id = {scene.scene_id: scene for scene in self.project.scenes}
        fallback_by_id = {item.fallback_id: item for item in plan.fallbacks}
        for i, fallback in enumerate(plan.fallbacks):
            base = f"$.render_plan.fallbacks[{i}]"
            self.reference(fallback.scene_id, {"scene"}, f"{base}.scene_id")
            for j, requirement_id in enumerate(fallback.affected_requirement_ids):
                self.reference(requirement_id, {"fidelity_requirement"}, f"{base}.affected_requirement_ids[{j}]", same_scene=fallback.scene_id)
            if fallback.source_media_usage != "none" and not fallback.approval_required:
                self.issue("SOURCE_MEDIA_APPROVAL_REQUIRED", f"{base}.approval_required", "source-media fallback requires approval")
        selections_by_scene: dict[str, list[RendererSelection]] = {}
        for i, selection in enumerate(plan.selections):
            base = f"$.render_plan.selections[{i}]"
            self.reference(selection.scene_id, {"scene"}, f"{base}.scene_id")
            scene = scene_by_id.get(selection.scene_id)
            self.interval(selection.start, selection.end, base, (scene.start, scene.end) if scene else None)
            selections_by_scene.setdefault(selection.scene_id, []).append(selection)
            for j, requirement_id in enumerate(selection.satisfied_requirement_ids):
                self.reference(requirement_id, {"fidelity_requirement"}, f"{base}.satisfied_requirement_ids[{j}]", same_scene=selection.scene_id)
            for j, fallback_id in enumerate(selection.fallback_ids):
                self.reference(fallback_id, {"fallback"}, f"{base}.fallback_ids[{j}]")
                fallback = fallback_by_id.get(fallback_id)
                if fallback and fallback.scene_id != selection.scene_id:
                    self.issue("FALLBACK_SCENE_MISMATCH", f"{base}.fallback_ids[{j}]", "fallback belongs to another scene")
            if scene:
                required = {item.requirement_id for item in scene.render_requirements.required}
                satisfied = set(selection.satisfied_requirement_ids)
                missing = required - satisfied
                if selection.status == "selected" and missing:
                    self.issue("HARD_REQUIREMENT_UNSATISFIED", f"{base}.satisfied_requirement_ids", f"selected route misses required IDs: {sorted(missing)}")
                if selection.status == "needs-review" and missing:
                    affected = set()
                    for fallback_id in selection.fallback_ids:
                        fallback = fallback_by_id.get(fallback_id)
                        if fallback and fallback.approval_required:
                            affected.update(fallback.affected_requirement_ids)
                    uncovered = missing - affected
                    if uncovered:
                        self.issue("HARD_REQUIREMENT_FALLBACK_MISSING", f"{base}.fallback_ids", f"missing required IDs lack an approval fallback: {sorted(uncovered)}")
        for i, scene in enumerate(self.project.scenes):
            selections = selections_by_scene.get(scene.scene_id, [])
            if not selections:
                self.issue("SCENE_ROUTE_MISSING", f"$.scenes[{i}].scene_id", "scene has no renderer selection")
                continue
            chosen = [item for item in selections if item.status == "selected"]
            if plan.status in {"routable", "approved"} and not chosen:
                self.issue("ROUTABLE_SCENE_NOT_SELECTED", f"$.scenes[{i}].scene_id", "routable/approved plan requires a selected route")
            active = sorted(
                ((item.start, item.end) for item in selections if item.status != "rejected"),
                key=lambda interval: (interval[0], interval[1]),
            )
            cursor = scene.start
            for start, end in active:
                if start > cursor + TIME_EPSILON:
                    self.issue("ROUTE_COVERAGE_GAP", f"$.scenes[{i}].scene_id", "renderer selections do not cover the full scene")
                    break
                cursor = max(cursor, end)
            if cursor < scene.end - TIME_EPSILON:
                self.issue("ROUTE_COVERAGE_GAP", f"$.scenes[{i}].scene_id", "renderer selections do not cover the full scene")
        if plan.status in {"routable", "approved"} and any(item.status == "needs-review" for item in plan.selections):
            self.issue("PLAN_STATUS_CONFLICT", "$.render_plan.status", "routable/approved plan cannot contain needs-review selections")
        if plan.status == "needs-review" and not any(item.status == "needs-review" for item in plan.selections):
            self.issue("PLAN_STATUS_CONFLICT", "$.render_plan.status", "needs-review plan requires a needs-review selection")

    def run(self) -> list[ValidationIssue]:
        self.collect_ids()
        self.validate_references_and_intervals()
        self.validate_scene_continuity()
        self.validate_render_plan()
        return self.issues


def validate_storyboard_v2(data: Any) -> UniversalStoryboardV2:
    """Validate *data* and return an immutable top-level model.

    The input is never changed.  All reported issues contain a stable error code
    and a JSON path rooted at ``$``.
    """
    preflight = _preflight(data)
    if preflight:
        raise StoryboardValidationError(preflight)
    try:
        project = UniversalStoryboardV2.model_validate(data)
    except ValidationError as exc:
        issues = [
            ValidationIssue(
                _structural_code(str(error["type"]), tuple(error["loc"])),
                _json_path(tuple(error["loc"])),
                str(error["msg"]),
            )
            for error in exc.errors(include_url=False, include_input=False)
        ]
        raise StoryboardValidationError(issues) from None
    issues = _SemanticValidator(project).run()
    if issues:
        raise StoryboardValidationError(issues)
    return project


def validate_storyboard_v2_json(raw: str | bytes | bytearray) -> UniversalStoryboardV2:
    """Parse strict JSON and validate it as Universal Storyboard v2."""
    try:
        if isinstance(raw, (bytes, bytearray)):
            raw = bytes(raw).decode("utf-8")
        data = json.loads(raw, parse_constant=lambda token: (_ for _ in ()).throw(ValueError(token)))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
        raise StoryboardValidationError([ValidationIssue("INVALID_JSON", "$", f"invalid strict JSON: {exc}")]) from None
    return validate_storyboard_v2(data)


__all__ = [
    "SCHEMA_VERSION",
    "StoryboardValidationError",
    "UniversalStoryboardV2",
    "ValidationIssue",
    "validate_storyboard_v2",
    "validate_storyboard_v2_json",
]
