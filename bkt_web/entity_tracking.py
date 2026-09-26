"""Cross-shot identity linking and relation inference (UV-302).

Two jobs, both still on the observation side of the line:

1. **Identity linking.**  Per-shot ``track`` observations are linked into
   identities only when the geometric, size, label and timing evidence agrees.
   When the best candidate is not clearly better than the runner-up, the tracks
   are *not* merged: the competing links are recorded as an ambiguity for a
   human or a later stage to resolve.
2. **Relation inference.**  ``holds``, ``touches``, ``looks_at``, ``inside``,
   ``in_front_of`` and ``attached_to`` are derived from the tracks' own boxes
   and, for gaze, from pose keypoints.  Every relation carries the interval it
   held for, a confidence, the evidence it came from and the geometric basis it
   was inferred from.

Nothing here picks a renderer, an asset or a storyboard entity, and the result
is a separate document that references the analysis by id — the UV-300 schema
stays exactly as frozen.  Everything is deterministic and the input document is
never mutated.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from bkt_web.analysis_result import AnalysisResultV1, validate_analysis_result


TRACKING_SCHEMA = "tokmatrix.entity-tracking/v1"
RELATION_TYPES = ("attached_to", "holds", "in_front_of", "inside", "looks_at", "touches")
ACTOR_CATEGORIES = frozenset({"person", "hand", "animal", "face"})


class TrackingError(ValueError):
    """Raised when tracking settings or inputs cannot be used."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise TrackingError(message)


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise TrackingError(f"{label} phải là số hữu hạn")
    return float(value)


@dataclass(frozen=True, slots=True)
class TrackingSettings:
    """Every threshold the inference uses, so a run can be explained."""

    link_threshold: float = 0.70
    ambiguous_margin: float = 0.10
    min_track_confidence: float = 0.50
    max_link_gap_seconds: float = 2.0
    position_scale: float = 0.25
    touch_distance: float = 0.02
    inside_ratio: float = 0.90
    comove_tolerance: float = 0.03
    min_relation_seconds: float = 0.20
    depth_margin: float = 0.02
    gaze_cone_degrees: float = 60.0
    gaze_max_distance: float = 0.60

    def __post_init__(self) -> None:
        for name in self.__slots__:
            value = _finite(getattr(self, name), f"settings.{name}")
            object.__setattr__(self, name, value)
            _require(value >= 0, f"settings.{name} không được âm")
        for name in ("link_threshold", "ambiguous_margin", "min_track_confidence", "inside_ratio"):
            _require(0 <= getattr(self, name) <= 1, f"settings.{name} cần trong [0,1]")
        _require(self.max_link_gap_seconds > 0, "settings.max_link_gap_seconds phải lớn hơn 0")
        _require(self.position_scale > 0, "settings.position_scale phải lớn hơn 0")
        _require(0 < self.gaze_cone_degrees <= 180, "settings.gaze_cone_degrees cần trong (0,180]")

    def as_dict(self) -> dict[str, float]:
        return {name: getattr(self, name) for name in self.__slots__}


# --- Geometry ------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Box:
    x: float
    y: float
    width: float
    height: float

    @property
    def center(self) -> tuple[float, float]:
        return self.x + self.width / 2, self.y + self.height / 2

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def bottom(self) -> float:
        return self.y + self.height

    def intersection(self, other: "Box") -> float:
        dx = min(self.x + self.width, other.x + other.width) - max(self.x, other.x)
        dy = min(self.bottom, other.bottom) - max(self.y, other.y)
        return dx * dy if dx > 0 and dy > 0 else 0.0

    def gap(self, other: "Box") -> float:
        """Shortest distance between the two rectangles; 0 when they overlap."""
        dx = max(other.x - (self.x + self.width), self.x - (other.x + other.width), 0.0)
        dy = max(other.y - self.bottom, self.y - other.bottom, 0.0)
        return math.hypot(dx, dy)

    @classmethod
    def from_region(cls, region: Any) -> "Box":
        return cls(x=region.x, y=region.y, width=region.width, height=region.height)

    def lerp(self, other: "Box", ratio: float) -> "Box":
        return Box(
            x=self.x + (other.x - self.x) * ratio,
            y=self.y + (other.y - self.y) * ratio,
            width=self.width + (other.width - self.width) * ratio,
            height=self.height + (other.height - self.height) * ratio,
        )


@dataclass(frozen=True, slots=True)
class _Track:
    observation_id: str
    label: str
    category: str
    confidence: float
    start: float
    end: float
    times: tuple[float, ...]
    boxes: tuple[Box, ...]
    evidence_ids: tuple[str, ...]

    def box_at(self, seconds: float) -> Box | None:
        """Linear interpolation between samples; ``None`` outside the track."""
        if seconds < self.times[0] - 1e-9 or seconds > self.times[-1] + 1e-9:
            return None
        for index in range(len(self.times) - 1):
            left, right = self.times[index], self.times[index + 1]
            if left - 1e-9 <= seconds <= right + 1e-9:
                span = right - left
                ratio = 0.0 if span <= 1e-12 else (seconds - left) / span
                return self.boxes[index].lerp(self.boxes[index + 1], ratio)
        return self.boxes[-1]


def tracks_of(document: AnalysisResultV1) -> list["_Track"]:
    """Normalised track views of one analysis document, sorted and immutable.

    Public so that UV-303 infers actions from exactly the same geometry the
    relations were inferred from, instead of re-deriving it.
    """
    return _tracks(document)


def _tracks(document: AnalysisResultV1) -> list[_Track]:
    output = []
    for observation in document.observations:
        if observation.kind != "track":
            continue
        samples = sorted(observation.samples, key=lambda item: item.time)
        output.append(_Track(
            observation_id=observation.observation_id,
            label=observation.label.strip().lower(),
            category=observation.category,
            confidence=observation.confidence,
            start=observation.source_interval.start,
            end=observation.source_interval.end,
            times=tuple(item.time for item in samples),
            boxes=tuple(Box.from_region(item.region) for item in samples),
            evidence_ids=tuple(observation.evidence_ids),
        ))
    return sorted(output, key=lambda item: (item.start, item.observation_id))


# --- Identity linking ----------------------------------------------------


@dataclass(frozen=True, slots=True)
class LinkCandidate:
    from_track_id: str
    to_track_id: str
    score: float
    components: dict[str, float]

    def as_dict(self) -> dict[str, Any]:
        return {
            "from_track_id": self.from_track_id,
            "to_track_id": self.to_track_id,
            "score": self.score,
            "components": dict(sorted(self.components.items())),
        }


@dataclass(frozen=True, slots=True)
class Identity:
    identity_id: str
    track_ids: tuple[str, ...]
    category: str
    label: str
    confidence: float
    resolved: bool
    start: float
    end: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "identity_id": self.identity_id,
            "track_ids": list(self.track_ids),
            "category": self.category,
            "label": self.label,
            "confidence": self.confidence,
            "resolved": self.resolved,
            "start": self.start,
            "end": self.end,
        }


@dataclass(frozen=True, slots=True)
class Ambiguity:
    ambiguity_id: str
    kind: str
    track_ids: tuple[str, ...]
    reason: str
    candidates: tuple[LinkCandidate, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "ambiguity_id": self.ambiguity_id,
            "kind": self.kind,
            "track_ids": list(self.track_ids),
            "reason": self.reason,
            "candidates": [item.as_dict() for item in self.candidates],
        }


def _score(previous: _Track, following: _Track, settings: TrackingSettings) -> dict[str, float] | None:
    if previous.category != following.category:
        return None
    gap = following.start - previous.end
    if gap < -1e-9 or gap > settings.max_link_gap_seconds:
        return None
    ax, ay = previous.boxes[-1].center
    bx, by = following.boxes[0].center
    distance = math.hypot(bx - ax, by - ay)
    position = math.exp(-distance / settings.position_scale)
    areas = sorted((previous.boxes[-1].area, following.boxes[0].area))
    size = 1.0 if areas[1] <= 1e-12 else areas[0] / areas[1]
    label = 1.0 if previous.label == following.label else 0.0
    timing = 1.0 - gap / settings.max_link_gap_seconds
    return {
        "position": position,
        "size": size,
        "label": label,
        "timing": timing,
        "total": 0.40 * position + 0.25 * size + 0.20 * label + 0.15 * timing,
    }


def _identity_id(track_id: str) -> str:
    stem = track_id.split("observation.", 1)[-1] if track_id.startswith("observation.") else track_id
    return f"identity.{stem}"


def link_identities(tracks: Sequence[_Track], settings: TrackingSettings) -> tuple[list[Identity], list[Ambiguity]]:
    """Link tracks across shots, refusing to merge when the evidence is close."""
    candidates: list[LinkCandidate] = []
    for previous in tracks:
        for following in tracks:
            if previous.observation_id == following.observation_id:
                continue
            components = _score(previous, following, settings)
            if components is None:
                continue
            candidates.append(LinkCandidate(previous.observation_id, following.observation_id, components["total"], components))

    by_target: dict[str, list[LinkCandidate]] = {}
    for candidate in candidates:
        by_target.setdefault(candidate.to_track_id, []).append(candidate)

    confidence = {item.observation_id: item.confidence for item in tracks}
    accepted: list[LinkCandidate] = []
    ambiguities: list[Ambiguity] = []
    used_sources: set[str] = set()
    for target in sorted(by_target):
        ranked = sorted(by_target[target], key=lambda item: (-item.score, item.from_track_id))
        best = ranked[0]
        runner_up = ranked[1] if len(ranked) > 1 else None
        low_confidence = min(confidence[best.from_track_id], confidence[target]) < settings.min_track_confidence
        if best.score < settings.link_threshold:
            continue
        if low_confidence:
            ambiguities.append(Ambiguity(
                ambiguity_id=f"ambiguity.confidence.{target}",
                kind="identity_link",
                track_ids=(best.from_track_id, target),
                reason="track_confidence_below_threshold",
                candidates=(best,),
            ))
            continue
        if runner_up is not None and best.score - runner_up.score < settings.ambiguous_margin:
            ambiguities.append(Ambiguity(
                ambiguity_id=f"ambiguity.link.{target}",
                kind="identity_link",
                track_ids=tuple(sorted({best.from_track_id, runner_up.from_track_id, target})),
                reason="competing_links_within_margin",
                candidates=(best, runner_up),
            ))
            continue
        if best.from_track_id in used_sources:
            ambiguities.append(Ambiguity(
                ambiguity_id=f"ambiguity.fork.{target}",
                kind="identity_link",
                track_ids=(best.from_track_id, target),
                reason="source_track_already_continued",
                candidates=(best,),
            ))
            continue
        used_sources.add(best.from_track_id)
        accepted.append(best)

    parent = {item.observation_id: item.observation_id for item in tracks}

    def find(key: str) -> str:
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    for link in sorted(accepted, key=lambda item: (item.from_track_id, item.to_track_id)):
        left, right = find(link.from_track_id), find(link.to_track_id)
        if left != right:
            parent[max(left, right)] = min(left, right)

    groups: dict[str, list[_Track]] = {}
    for track in tracks:
        groups.setdefault(find(track.observation_id), []).append(track)

    ambiguous_tracks = {track_id for item in ambiguities for track_id in item.track_ids}
    identities: list[Identity] = []
    for members in groups.values():
        ordered = sorted(members, key=lambda item: (item.start, item.observation_id))
        first = ordered[0]
        identities.append(Identity(
            identity_id=_identity_id(first.observation_id),
            track_ids=tuple(item.observation_id for item in ordered),
            category=first.category,
            label=first.label,
            confidence=min(item.confidence for item in ordered),
            # An identity is resolved only when no track in it is caught up in
            # an unresolved link ambiguity.
            resolved=not any(item.observation_id in ambiguous_tracks for item in ordered),
            start=min(item.start for item in ordered),
            end=max(item.end for item in ordered),
        ))
    return sorted(identities, key=lambda item: (item.start, item.identity_id)), sorted(ambiguities, key=lambda item: item.ambiguity_id)


# --- Relation inference --------------------------------------------------


@dataclass(frozen=True, slots=True)
class Relation:
    relation_id: str
    type: str
    subject_track_id: str
    object_track_id: str
    start: float
    end: float
    confidence: float
    basis: str
    evidence_ids: tuple[str, ...]
    review_required: bool = False
    attributes: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "relation_id": self.relation_id,
            "type": self.type,
            "subject_track_id": self.subject_track_id,
            "object_track_id": self.object_track_id,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
            "basis": self.basis,
            "evidence_ids": list(self.evidence_ids),
            "review_required": self.review_required,
            "attributes": copy.deepcopy(self.attributes),
        }


def _shared_times(left: _Track, right: _Track) -> list[float]:
    start, end = max(left.start, right.start), min(left.end, right.end)
    if end <= start:
        return []
    times = sorted({value for value in (*left.times, *right.times, start, end) if start - 1e-9 <= value <= end + 1e-9})
    return times


def _runs(flags: list[bool], times: list[float], minimum: float) -> list[tuple[int, int]]:
    """Index ranges where the predicate held for long enough."""
    output: list[tuple[int, int]] = []
    start: int | None = None
    for index, flag in enumerate(flags):
        if flag and start is None:
            start = index
        elif not flag and start is not None:
            if index - start >= 2 and times[index - 1] - times[start] >= minimum:
                output.append((start, index - 1))
            start = None
    if start is not None and len(flags) - start >= 2 and times[-1] - times[start] >= minimum:
        output.append((start, len(flags) - 1))
    return output


def _offset_segments(
    offsets: Sequence[tuple[float, float]],
    span: tuple[int, int],
    tolerance: float,
) -> list[tuple[tuple[int, int], float | None]]:
    """Split a contact window into co-moving stretches.

    Each result is ``((first, last), spread)`` where ``spread`` is the greatest
    deviation from the stretch's own starting offset, or ``None`` when the
    stretch never settled and is therefore plain contact.
    """
    first, last = span
    segments: list[tuple[tuple[int, int], float | None]] = []
    anchor = first
    drifting: list[int] = []

    def close(start: int, end: int) -> None:
        window = [offsets[index] for index in range(start, end + 1)]
        finite = [item for item in window if math.isfinite(item[0]) and math.isfinite(item[1])]
        if len(finite) < 2:
            segments.append(((start, end), None))
            return
        spread = max(math.hypot(item[0] - finite[0][0], item[1] - finite[0][1]) for item in finite[1:])
        segments.append(((start, end), spread if spread <= tolerance else None))

    for index in range(first + 1, last + 1):
        base, current = offsets[anchor], offsets[index]
        drifted = not (math.isfinite(base[0]) and math.isfinite(current[0])) or \
            math.hypot(current[0] - base[0], current[1] - base[1]) > tolerance
        if drifted:
            if index - 1 > anchor:
                close(anchor, index - 1)
            else:
                drifting.append(anchor)
            anchor = index
    if last > anchor:
        close(anchor, last)
    else:
        drifting.append(anchor)
    # Indices that never settled are still contact; keep them as one stretch
    # when they are adjacent.
    for index in drifting:
        neighbour = next((item for item in segments if item[0][1] == index - 1 and item[1] is None), None)
        if neighbour is not None:
            segments[segments.index(neighbour)] = ((neighbour[0][0], index), None)
        else:
            segments.append(((index, index), None))
    merged: list[tuple[tuple[int, int], float | None]] = []
    for segment in sorted(segments, key=lambda item: item[0]):
        if merged and merged[-1][1] is None and segment[1] is None and merged[-1][0][1] + 1 == segment[0][0]:
            merged[-1] = ((merged[-1][0][0], segment[0][1]), None)
        else:
            merged.append(segment)
    return merged


def _pair_relations(left: _Track, right: _Track, settings: TrackingSettings) -> list[Relation]:
    times = _shared_times(left, right)
    if len(times) < 2:
        return []
    evidence = tuple(sorted(set(left.evidence_ids) | set(right.evidence_ids)))
    base_confidence = min(left.confidence, right.confidence)
    touching: list[bool] = []
    inside_lr: list[bool] = []
    inside_rl: list[bool] = []
    front_lr: list[bool] = []
    front_rl: list[bool] = []
    offsets: list[tuple[float, float]] = []
    for time in times:
        a, b = left.box_at(time), right.box_at(time)
        if a is None or b is None:
            touching.append(False)
            inside_lr.append(False)
            inside_rl.append(False)
            front_lr.append(False)
            front_rl.append(False)
            offsets.append((math.inf, math.inf))
            continue
        overlap = a.intersection(b)
        touching.append(overlap > 0 or a.gap(b) <= settings.touch_distance)
        inside_lr.append(a.area > 1e-12 and overlap / a.area >= settings.inside_ratio)
        inside_rl.append(b.area > 1e-12 and overlap / b.area >= settings.inside_ratio)
        significant = overlap > 0.05 * min(a.area, b.area)
        front_lr.append(significant and a.bottom - b.bottom > settings.depth_margin)
        front_rl.append(significant and b.bottom - a.bottom > settings.depth_margin)
        ax, ay = a.center
        bx, by = b.center
        offsets.append((bx - ax, by - ay))

    output: list[Relation] = []

    def emit(kind: str, subject: _Track, object_: _Track, span: tuple[int, int], confidence: float, basis: str, review: bool = False, **attributes: Any) -> None:
        start, end = times[span[0]], times[span[1]]
        output.append(Relation(
            relation_id=f"relation.{kind}.{subject.observation_id}.{object_.observation_id}.{span[0]}",
            type=kind,
            subject_track_id=subject.observation_id,
            object_track_id=object_.observation_id,
            start=start,
            end=end,
            confidence=round(min(1.0, max(0.0, confidence)), 6),
            basis=basis,
            evidence_ids=evidence,
            review_required=review,
            attributes=attributes,
        ))

    for span in _runs(touching, times, settings.min_relation_seconds):
        # A single contact often starts as an approach and only then becomes a
        # carry, so the window is split into stretches where the offset between
        # the two holds steady; each stretch is classified on its own.
        for sub_span, spread in _offset_segments(offsets, span, settings.comove_tolerance):
            long_enough = sub_span[1] - sub_span[0] >= 1 and times[sub_span[1]] - times[sub_span[0]] >= settings.min_relation_seconds
            if not long_enough:
                continue
            if spread is None:
                subject, object_ = sorted((left, right), key=lambda item: item.observation_id)
                emit("touches", subject, object_, sub_span, base_confidence * 0.85, "box_contact")
                continue
            actor_first = left.category in ACTOR_CATEGORIES
            actor_second = right.category in ACTOR_CATEGORIES
            if actor_first != actor_second:
                subject, object_ = (left, right) if actor_first else (right, left)
                emit("holds", subject, object_, sub_span, base_confidence * 0.80, "contact_and_constant_offset", offset_spread=spread)
            else:
                subject, object_ = sorted((left, right), key=lambda item: item.observation_id)
                emit("attached_to", subject, object_, sub_span, base_confidence * 0.75, "contact_and_constant_offset", offset_spread=spread)

    for flags, subject, object_ in ((inside_lr, left, right), (inside_rl, right, left)):
        for span in _runs(flags, times, settings.min_relation_seconds):
            emit("inside", subject, object_, span, base_confidence * 0.90, "containment_ratio")

    for flags, subject, object_ in ((front_lr, left, right), (front_rl, right, left)):
        for span in _runs(flags, times, settings.min_relation_seconds):
            # A 2D lower edge only hints at depth, so this never passes as a
            # confident fact: it is emitted for review, not for rendering.
            emit("in_front_of", subject, object_, span, base_confidence * 0.45, "lower_edge_heuristic", review=True)

    return output


def _gaze_relations(document: AnalysisResultV1, tracks: Sequence[_Track], settings: TrackingSettings) -> list[Relation]:
    by_id = {item.observation_id: item for item in tracks}
    output: list[Relation] = []
    for observation in document.observations:
        if observation.kind != "pose":
            continue
        keypoints = {item.name: item for item in observation.keypoints}
        nose = keypoints.get("nose")
        left_eye, right_eye = keypoints.get("eye.left"), keypoints.get("eye.right")
        gaze = keypoints.get("gaze")
        if nose is not None and gaze is not None:
            origin, direction = (nose.x, nose.y), (gaze.x - nose.x, gaze.y - nose.y)
        elif nose is not None and left_eye is not None and right_eye is not None:
            midpoint = ((left_eye.x + right_eye.x) / 2, (left_eye.y + right_eye.y) / 2)
            origin, direction = midpoint, (nose.x - midpoint[0], nose.y - midpoint[1])
        else:
            # Without a facing cue there is nothing to infer, and guessing a
            # gaze target would be an invention, not an observation.
            continue
        length = math.hypot(*direction)
        if length <= 1e-9:
            continue
        unit = (direction[0] / length, direction[1] / length)
        subject_id = observation.track_ref
        for track in tracks:
            if track.observation_id == subject_id:
                continue
            box = track.box_at(observation.time)
            if box is None:
                continue
            cx, cy = box.center
            to_target = (cx - origin[0], cy - origin[1])
            distance = math.hypot(*to_target)
            if distance <= 1e-9 or distance > settings.gaze_max_distance:
                continue
            cosine = (unit[0] * to_target[0] + unit[1] * to_target[1]) / distance
            angle = math.degrees(math.acos(max(-1.0, min(1.0, cosine))))
            if angle > settings.gaze_cone_degrees / 2:
                continue
            subject = by_id.get(subject_id) if subject_id else None
            confidence = observation.confidence * (1.0 - angle / (settings.gaze_cone_degrees / 2) * 0.5)
            evidence = tuple(sorted(set(observation.evidence_ids) | set(track.evidence_ids)))
            output.append(Relation(
                relation_id=f"relation.looks.at.{observation.observation_id}.{track.observation_id}",
                type="looks_at",
                subject_track_id=subject.observation_id if subject else observation.observation_id,
                object_track_id=track.observation_id,
                start=observation.source_interval.start,
                end=observation.source_interval.end,
                confidence=round(min(1.0, max(0.0, confidence)), 6),
                basis="pose_facing_cone",
                evidence_ids=evidence,
                review_required=subject is None,
                attributes={"angle_degrees": round(angle, 6), "distance": round(distance, 6)},
            ))
    return output


# --- Result --------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TrackingResult:
    analysis_id: str
    source_id: str
    settings: TrackingSettings
    identities: tuple[Identity, ...]
    relations: tuple[Relation, ...]
    ambiguities: tuple[Ambiguity, ...]

    def identity_of(self, track_id: str) -> Identity | None:
        return next((item for item in self.identities if track_id in item.track_ids), None)

    def relations_of(self, kind: str) -> tuple[Relation, ...]:
        if kind not in RELATION_TYPES:
            raise TrackingError(f"Quan hệ chưa hỗ trợ: {kind}")
        return tuple(item for item in self.relations if item.type == kind)

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": TRACKING_SCHEMA,
            "analysis_id": self.analysis_id,
            "source_id": self.source_id,
            "settings": self.settings.as_dict(),
            "identities": [item.as_dict() for item in self.identities],
            "relations": [item.as_dict() for item in self.relations],
            "ambiguities": [item.as_dict() for item in self.ambiguities],
        }


def infer_tracking(
    document: AnalysisResultV1 | dict[str, Any],
    settings: TrackingSettings | None = None,
) -> TrackingResult:
    """Link identities and infer relations from one Analysis Result v1 document."""
    model = document if isinstance(document, AnalysisResultV1) else validate_analysis_result(document)
    options = settings or TrackingSettings()
    _require(isinstance(options, TrackingSettings), "settings không hợp lệ")
    tracks = _tracks(model)
    identities, ambiguities = link_identities(tracks, options)
    relations: list[Relation] = []
    for index, left in enumerate(tracks):
        for right in tracks[index + 1:]:
            relations.extend(_pair_relations(left, right, options))
    relations.extend(_gaze_relations(model, tracks, options))
    relations.sort(key=lambda item: (item.start, item.type, item.subject_track_id, item.object_track_id))
    return TrackingResult(
        analysis_id=model.analysis_id,
        source_id=model.source.source_id,
        settings=options,
        identities=tuple(identities),
        relations=tuple(relations),
        ambiguities=tuple(ambiguities),
    )


__all__ = [
    "ACTOR_CATEGORIES",
    "Ambiguity",
    "Box",
    "Identity",
    "LinkCandidate",
    "RELATION_TYPES",
    "Relation",
    "TRACKING_SCHEMA",
    "TrackingError",
    "TrackingResult",
    "TrackingSettings",
    "infer_tracking",
    "link_identities",
    "tracks_of",
]
