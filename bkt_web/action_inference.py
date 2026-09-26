"""Action and camera inference (UV-303).

Given an Analysis Result v1 document and the UV-302 tracking result, this
module answers two more questions about the source: *how did the camera move*
and *what did somebody do to something*.

The camera comes first, because it has to.  A box that slides across the frame
may be an object moving or the camera panning, and the two are indistinguishable
per track.  So a global motion is estimated from the median displacement of all
tracks alive in each step; every action is then inferred from **residual**,
camera-compensated motion.  When a step has too few tracks to separate the two,
that is said out loud instead of guessed: the camera segment is ``unknown`` and
a review item is raised.

Every emitted action has an actor, a target, a start, an end and the evidence it
came from.  Motion with no counterpart is not an action; it is reported
separately as camera-compensated motion.  Anything below the review threshold —
or built on something UV-302 already flagged — becomes a review item rather than
a confident claim.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any, Sequence

from bkt_web.analysis_result import AnalysisResultV1, validate_analysis_result
from bkt_web.entity_tracking import Box, TrackingResult, infer_tracking, tracks_of


INFERENCE_SCHEMA = "tokmatrix.action-inference/v1"
ACTION_TYPES = ("carry", "grip", "look_at", "place", "reach", "release")
CAMERA_MOVEMENTS = ("static", "pan", "tilt", "zoom", "unknown")


class InferenceError(ValueError):
    """Raised when inference settings or inputs cannot be used."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise InferenceError(message)


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise InferenceError(f"{label} phải là số hữu hạn")
    return float(value)


def _median(values: Sequence[float]) -> float:
    ordered = sorted(values)
    count = len(ordered)
    if count == 0:
        return 0.0
    middle = count // 2
    return ordered[middle] if count % 2 else (ordered[middle - 1] + ordered[middle]) / 2


@dataclass(frozen=True, slots=True)
class InferenceSettings:
    review_threshold: float = 0.60
    min_motion_per_second: float = 0.02
    min_action_seconds: float = 0.15
    reach_window_seconds: float = 2.0
    release_window_seconds: float = 0.50
    camera_min_tracks: int = 2
    camera_coherence: float = 0.50
    camera_inlier_ratio: float = 0.60
    camera_min_translation_per_second: float = 0.01
    camera_zoom_threshold: float = 0.02

    def __post_init__(self) -> None:
        _require(not isinstance(self.camera_min_tracks, bool) and isinstance(self.camera_min_tracks, int), "settings.camera_min_tracks phải là số nguyên")
        _require(self.camera_min_tracks >= 1, "settings.camera_min_tracks phải >= 1")
        for name in self.__slots__:
            if name == "camera_min_tracks":
                continue
            value = _finite(getattr(self, name), f"settings.{name}")
            object.__setattr__(self, name, value)
            _require(value >= 0, f"settings.{name} không được âm")
        _require(0 <= self.review_threshold <= 1, "settings.review_threshold cần trong [0,1]")
        _require(0 < self.camera_inlier_ratio <= 1, "settings.camera_inlier_ratio cần trong (0,1]")
        _require(self.camera_coherence > 0, "settings.camera_coherence phải lớn hơn 0")
        _require(self.reach_window_seconds > 0, "settings.reach_window_seconds phải lớn hơn 0")

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


# --- Results -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CameraSegment:
    segment_id: str
    movement: str
    start: float
    end: float
    magnitude: float
    direction_degrees: float | None
    confidence: float
    basis: str
    contributing_track_ids: tuple[str, ...]
    review_required: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "segment_id": self.segment_id,
            "movement": self.movement,
            "start": self.start,
            "end": self.end,
            "magnitude": self.magnitude,
            "direction_degrees": self.direction_degrees,
            "confidence": self.confidence,
            "basis": self.basis,
            "contributing_track_ids": list(self.contributing_track_ids),
            "review_required": self.review_required,
        }


@dataclass(frozen=True, slots=True)
class InferredAction:
    action_id: str
    type: str
    actor_track_id: str
    target_track_id: str
    start: float
    end: float
    confidence: float
    basis: str
    evidence_ids: tuple[str, ...]
    review_required: bool = False
    attributes: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "type": self.type,
            "actor_track_id": self.actor_track_id,
            "target_track_id": self.target_track_id,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
            "basis": self.basis,
            "evidence_ids": list(self.evidence_ids),
            "review_required": self.review_required,
            "attributes": copy.deepcopy(self.attributes),
        }


@dataclass(frozen=True, slots=True)
class ObjectMotion:
    """Camera-compensated motion of one track. Not an action: it has no target."""

    motion_id: str
    track_id: str
    start: float
    end: float
    displacement: float
    confidence: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "motion_id": self.motion_id,
            "track_id": self.track_id,
            "start": self.start,
            "end": self.end,
            "displacement": self.displacement,
            "confidence": self.confidence,
        }


@dataclass(frozen=True, slots=True)
class ReviewItem:
    review_id: str
    kind: str
    reason: str
    refs: tuple[str, ...]
    confidence: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "review_id": self.review_id,
            "kind": self.kind,
            "reason": self.reason,
            "refs": list(self.refs),
            "confidence": self.confidence,
        }


@dataclass(frozen=True, slots=True)
class ActionInferenceResult:
    analysis_id: str
    settings: InferenceSettings
    camera: tuple[CameraSegment, ...]
    actions: tuple[InferredAction, ...]
    motions: tuple[ObjectMotion, ...]
    review_items: tuple[ReviewItem, ...]

    def actions_of(self, kind: str) -> tuple[InferredAction, ...]:
        if kind not in ACTION_TYPES:
            raise InferenceError(f"Action chưa hỗ trợ: {kind}")
        return tuple(item for item in self.actions if item.type == kind)

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": INFERENCE_SCHEMA,
            "analysis_id": self.analysis_id,
            "settings": self.settings.as_dict(),
            "camera": [item.as_dict() for item in self.camera],
            "actions": [item.as_dict() for item in self.actions],
            "motions": [item.as_dict() for item in self.motions],
            "review_items": [item.as_dict() for item in self.review_items],
        }


# --- Camera --------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Step:
    start: float
    end: float
    movement: str
    translation: tuple[float, float]
    scale: float
    tracks: tuple[str, ...]
    separable: bool


def _steps(tracks: Sequence[Any], settings: InferenceSettings) -> list[_Step]:
    times = sorted({time for track in tracks for time in track.times})
    steps: list[_Step] = []
    for index in range(len(times) - 1):
        start, end = times[index], times[index + 1]
        span = end - start
        if span <= 1e-9:
            continue
        deltas: list[tuple[str, float, float, float]] = []
        for track in tracks:
            before, after = track.box_at(start), track.box_at(end)
            if before is None or after is None or before.area <= 1e-12:
                continue
            bx, by = before.center
            ax, ay = after.center
            deltas.append((track.observation_id, ax - bx, ay - by, math.sqrt(after.area / before.area)))
        if not deltas:
            continue
        contributors = tuple(sorted(item[0] for item in deltas))
        separable = len(deltas) >= settings.camera_min_tracks
        if not separable:
            steps.append(_Step(start, end, "unknown", (0.0, 0.0), 1.0, contributors, False))
            continue
        dx = _median([item[1] for item in deltas])
        dy = _median([item[2] for item in deltas])
        scale = _median([item[3] for item in deltas])
        magnitude = math.hypot(dx, dy)
        floor = settings.camera_min_translation_per_second * span
        # Motion is the camera's only when enough tracks agree on it. A bare
        # majority is not enough: two objects moving together while the rest of
        # the frame holds still is those objects moving, not the lens.
        tolerance = max(settings.camera_coherence * magnitude, floor)
        inliers = sum(1 for item in deltas if math.hypot(item[1] - dx, item[2] - dy) <= tolerance)
        coherent = magnitude > floor and inliers / len(deltas) >= settings.camera_inlier_ratio
        scale_delta = abs(scale - 1.0)
        scale_tolerance = max(settings.camera_coherence * scale_delta, settings.camera_zoom_threshold / 2)
        scale_inliers = sum(1 for item in deltas if abs(item[3] - scale) <= scale_tolerance)
        zooming = scale_delta >= settings.camera_zoom_threshold and scale_inliers / len(deltas) >= settings.camera_inlier_ratio
        if zooming:
            steps.append(_Step(start, end, "zoom", (dx, dy) if coherent else (0.0, 0.0), scale, contributors, True))
        elif coherent:
            movement = "pan" if abs(dx) >= abs(dy) else "tilt"
            steps.append(_Step(start, end, movement, (dx, dy), 1.0, contributors, True))
        else:
            steps.append(_Step(start, end, "static", (0.0, 0.0), 1.0, contributors, True))
    return steps


def _camera_segments(steps: Sequence[_Step], tracks: Sequence[Any]) -> list[CameraSegment]:
    segments: list[CameraSegment] = []
    index = 0
    while index < len(steps):
        movement = steps[index].movement
        run = [steps[index]]
        while index + 1 < len(steps) and steps[index + 1].movement == movement:
            index += 1
            run.append(steps[index])
        index += 1
        dx = sum(item.translation[0] for item in run)
        dy = sum(item.translation[1] for item in run)
        scale = 1.0
        for item in run:
            scale *= item.scale
        magnitude = abs(scale - 1.0) if movement == "zoom" else math.hypot(dx, dy)
        contributors = tuple(sorted({track_id for item in run for track_id in item.tracks}))
        separable = all(item.separable for item in run)
        confidence = 0.0 if not separable else min(1.0, 0.5 + 0.1 * len(contributors))
        segments.append(CameraSegment(
            segment_id=f"camera.{len(segments)}",
            movement=movement,
            start=run[0].start,
            end=run[-1].end,
            magnitude=round(magnitude, 9),
            direction_degrees=None if movement in {"static", "unknown", "zoom"} else round(math.degrees(math.atan2(dy, dx)), 6),
            confidence=round(confidence, 6),
            basis="median_track_motion" if separable else "single_track_not_separable",
            contributing_track_ids=contributors,
            review_required=not separable,
        ))
    return segments


def _residual_motion(track: Any, steps: Sequence[_Step], settings: InferenceSettings) -> list[tuple[float, float, float]]:
    """Per-step ``(start, end, residual displacement)`` with the camera removed."""
    output: list[tuple[float, float, float]] = []
    for step in steps:
        before, after = track.box_at(step.start), track.box_at(step.end)
        if before is None or after is None:
            continue
        bx, by = before.center
        ax, ay = after.center
        # Zoom scales positions about the frame centre; a pan shifts them.
        expected_x = 0.5 + (bx - 0.5) * step.scale + step.translation[0]
        expected_y = 0.5 + (by - 0.5) * step.scale + step.translation[1]
        output.append((step.start, step.end, math.hypot(ax - expected_x, ay - expected_y)))
    return output


def _moving_runs(motion: Sequence[tuple[float, float, float]], settings: InferenceSettings) -> list[tuple[float, float, float]]:
    runs: list[tuple[float, float, float]] = []
    current: list[tuple[float, float, float]] = []
    for start, end, displacement in motion:
        span = end - start
        moving = span > 1e-9 and displacement / span >= settings.min_motion_per_second
        if moving:
            current.append((start, end, displacement))
        elif current:
            runs.append((current[0][0], current[-1][1], sum(item[2] for item in current)))
            current = []
    if current:
        runs.append((current[0][0], current[-1][1], sum(item[2] for item in current)))
    return [item for item in runs if item[1] - item[0] >= settings.min_action_seconds]


# --- Actions -------------------------------------------------------------


def _moving_between(runs: Sequence[tuple[float, float, float]], start: float, end: float) -> bool:
    return any(item[0] < end - 1e-9 and item[1] > start + 1e-9 for item in runs)


def _infer_actions(
    tracking: TrackingResult,
    tracks: Sequence[Any],
    runs: dict[str, list[tuple[float, float, float]]],
    duration: float,
    settings: InferenceSettings,
) -> tuple[list[InferredAction], list[ReviewItem]]:
    by_id = {item.observation_id: item for item in tracks}
    unresolved = {
        track_id
        for identity in tracking.identities
        if not identity.resolved
        for track_id in identity.track_ids
    }
    actions: list[InferredAction] = []
    reviews: list[ReviewItem] = []

    def emit(kind: str, relation: Any, actor: str, target: str, start: float, end: float, factor: float, basis: str, **attributes: Any) -> None:
        confidence = round(min(1.0, max(0.0, relation.confidence * factor)), 6)
        review = (
            confidence < settings.review_threshold
            or relation.review_required
            or actor in unresolved
            or target in unresolved
        )
        action = InferredAction(
            action_id=f"action.{kind}.{actor}.{target}.{round(start, 6)}",
            type=kind,
            actor_track_id=actor,
            target_track_id=target,
            start=start,
            end=end,
            confidence=confidence,
            basis=basis,
            evidence_ids=relation.evidence_ids,
            review_required=review,
            attributes=attributes,
        )
        actions.append(action)
        if review:
            reason = (
                "actor_or_target_identity_unresolved" if actor in unresolved or target in unresolved
                else "derived_from_reviewable_relation" if relation.review_required
                else "confidence_below_threshold"
            )
            reviews.append(ReviewItem(
                review_id=f"review.{action.action_id}",
                kind="action",
                reason=reason,
                refs=(action.action_id, actor, target),
                confidence=confidence,
            ))

    touches = tracking.relations_of("touches")
    inside = tracking.relations_of("inside")

    for relation in tracking.relations_of("holds"):
        actor, target = relation.subject_track_id, relation.object_track_id
        # grip: the contact that led into the hold, when there was one.
        lead_in = [
            item for item in touches
            if {item.subject_track_id, item.object_track_id} == {actor, target}
            and item.end <= relation.start + settings.release_window_seconds
            and relation.start - item.end <= settings.release_window_seconds
        ]
        grip_start = min((item.start for item in lead_in), default=relation.start)
        emit("grip", relation, actor, target, grip_start, relation.start, 0.90, "holds_onset")

        # reach: the actor closing on the target before the grip.
        window_start = max(0.0, grip_start - settings.reach_window_seconds)
        # The approach is whatever part of the actor's own motion falls in the
        # window before the grip, not a motion run that happens to end there.
        approach = [
            item for item in runs.get(actor, [])
            if item[0] < grip_start - 1e-9 and item[1] > window_start + 1e-9
        ]
        if approach:
            actor_track, target_track = by_id.get(actor), by_id.get(target)
            reach_start = max(window_start, min(item[0] for item in approach))
            if actor_track is not None and target_track is not None and reach_start < grip_start:
                before = _distance(actor_track, target_track, reach_start)
                after = _distance(actor_track, target_track, grip_start)
                if before is not None and after is not None and after < before:
                    emit("reach", relation, actor, target, reach_start, grip_start, 0.70, "residual_approach",
                         distance_before=round(before, 6), distance_after=round(after, 6))

        # carry: the pair moving together while held.
        if _moving_between(runs.get(target, []), relation.start, relation.end):
            emit("carry", relation, actor, target, relation.start, relation.end, 0.80, "held_with_residual_motion")

        # release, or place when the target lands inside a container.
        release_end = min(duration, relation.end + settings.min_action_seconds)
        landing = [
            item for item in inside
            if item.subject_track_id == target
            and abs(item.start - relation.end) <= settings.release_window_seconds
        ]
        if landing:
            container = sorted(landing, key=lambda item: (item.start, item.object_track_id))[0]
            emit("place", relation, actor, container.object_track_id, relation.end, container.start, 0.75, "hold_ends_in_containment",
                 released_track_id=target)
        else:
            emit("release", relation, actor, target, relation.end, release_end, 0.70, "holds_offset")

    for relation in tracking.relations_of("looks_at"):
        emit("look_at", relation, relation.subject_track_id, relation.object_track_id,
             relation.start, relation.end, 1.0, "pose_facing_cone")

    actions.sort(key=lambda item: (item.start, item.type, item.actor_track_id, item.target_track_id))
    reviews.sort(key=lambda item: item.review_id)
    return actions, reviews


def _distance(left: Any, right: Any, seconds: float) -> float | None:
    a, b = left.box_at(seconds), right.box_at(seconds)
    if a is None or b is None:
        return None
    ax, ay = a.center
    bx, by = b.center
    return math.hypot(bx - ax, by - ay)


# --- Entry point ---------------------------------------------------------


def infer_actions_and_camera(
    document: AnalysisResultV1 | dict[str, Any],
    tracking: TrackingResult | None = None,
    settings: InferenceSettings | None = None,
) -> ActionInferenceResult:
    """Infer camera motion and interactions from one analysis document."""
    model = document if isinstance(document, AnalysisResultV1) else validate_analysis_result(document)
    options = settings or InferenceSettings()
    _require(isinstance(options, InferenceSettings), "settings không hợp lệ")
    result = tracking if tracking is not None else infer_tracking(model)
    _require(isinstance(result, TrackingResult), "tracking không hợp lệ")
    _require(result.analysis_id == model.analysis_id, "tracking result thuộc về analysis khác")

    tracks = tracks_of(model)
    steps = _steps(tracks, options)
    camera = _camera_segments(steps, tracks)

    runs: dict[str, list[tuple[float, float, float]]] = {}
    motions: list[ObjectMotion] = []
    for track in tracks:
        track_runs = _moving_runs(_residual_motion(track, steps, options), options)
        runs[track.observation_id] = track_runs
        for index, (start, end, displacement) in enumerate(track_runs):
            motions.append(ObjectMotion(
                motion_id=f"motion.{track.observation_id}.{index}",
                track_id=track.observation_id,
                start=start,
                end=end,
                displacement=round(displacement, 9),
                confidence=track.confidence,
            ))

    actions, reviews = _infer_actions(result, tracks, runs, model.duration_seconds, options)

    for segment in camera:
        if segment.review_required:
            reviews.append(ReviewItem(
                review_id=f"review.{segment.segment_id}",
                kind="camera",
                reason="camera_motion_not_separable_from_object_motion",
                refs=(segment.segment_id, *segment.contributing_track_ids),
                confidence=segment.confidence,
            ))
    for ambiguity in result.ambiguities:
        reviews.append(ReviewItem(
            review_id=f"review.{ambiguity.ambiguity_id}",
            kind="identity",
            reason=ambiguity.reason,
            refs=ambiguity.track_ids,
            confidence=None,
        ))

    return ActionInferenceResult(
        analysis_id=model.analysis_id,
        settings=options,
        camera=tuple(camera),
        actions=tuple(actions),
        motions=tuple(sorted(motions, key=lambda item: (item.start, item.motion_id))),
        review_items=tuple(sorted(reviews, key=lambda item: item.review_id)),
    )


__all__ = [
    "ACTION_TYPES",
    "CAMERA_MOVEMENTS",
    "ActionInferenceResult",
    "CameraSegment",
    "INFERENCE_SCHEMA",
    "InferenceError",
    "InferenceSettings",
    "InferredAction",
    "ObjectMotion",
    "ReviewItem",
    "infer_actions_and_camera",
]
