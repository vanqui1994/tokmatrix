"""Geometric fidelity checks over a solved scene (UV-601).

Structural fidelity (UV-600) answers *did the right things happen*; this layer
answers *did they happen without the geometry falling apart*.  It samples the
UV-201 component runtime and the UV-202 constraint solver across a scene and
reports five families of defect:

``contact``     a hand and what it holds drifting apart
``ground``      something planted on the ground sliding under its own contact
``intersection`` two solid components overlapping more than allowed
``attachment``  a part jumping at the frame it is attached or detached
``joint``       a hinge leaving the limit its rig declares

Sampling is at a fixed rate and every frame is computed from absolute time, so
a run is deterministic and independent of the order frames are asked for.  A
component that declares no bounds is **reported as unchecked**, never counted
as passing.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass
from typing import Any, Sequence

from bkt_web.component_lifecycle import lifecycle_events
from bkt_web.constraint_solver import (
    CONSTRAINT_ALIASES,
    SUPPORTED_CONSTRAINT_TYPES,
    canonical_constraint_type,
    solver_for_scene,
)
from bkt_web.universal_storyboard import Scene, UniversalStoryboardV2, validate_storyboard_v2


GEOMETRIC_SCHEMA = "tokmatrix.geometric-fidelity/v1"
CATEGORIES = ("contact", "ground", "intersection", "attachment", "joint")


class GeometricFidelityError(ValueError):
    """Raised when a geometric fidelity run cannot be set up."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise GeometricFidelityError(message)


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise GeometricFidelityError(f"{label} phải là số hữu hạn")
    return float(value)


@dataclass(frozen=True, slots=True)
class GeometricSettings:
    sample_rate: float = 24.0
    contact_tolerance: float = 2.0
    ground_slip_per_second: float = 4.0
    intersection_ratio: float = 0.10
    attachment_jump: float = 1.0
    joint_tolerance_degrees: float = 0.5

    def __post_init__(self) -> None:
        for name in self.__slots__:
            value = _finite(getattr(self, name), f"settings.{name}")
            object.__setattr__(self, name, value)
            _require(value >= 0, f"settings.{name} không được âm")
        _require(0 < self.sample_rate <= 240, "settings.sample_rate cần trong (0,240]")
        _require(0 <= self.intersection_ratio <= 1, "settings.intersection_ratio cần trong [0,1]")

    def as_dict(self) -> dict[str, float]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class Finding:
    check_id: str
    category: str
    code: str
    severity: str
    message: str
    seconds: float | None
    refs: tuple[str, ...] = ()
    measured: float | None = None
    allowed: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "check_id": self.check_id,
            "category": self.category,
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "seconds": self.seconds,
            "refs": list(self.refs),
            "measured": self.measured,
            "allowed": self.allowed,
        }


@dataclass(frozen=True, slots=True)
class GeometricReport:
    scene_id: str
    settings: GeometricSettings
    sampled_seconds: tuple[float, ...]
    findings: tuple[Finding, ...]
    metrics: dict[str, float]
    unchecked: tuple[dict[str, str], ...]

    @property
    def failures(self) -> tuple[Finding, ...]:
        return tuple(item for item in self.findings if item.severity == "fail")

    @property
    def passed(self) -> bool:
        return not self.failures

    def by_category(self, category: str) -> tuple[Finding, ...]:
        if category not in CATEGORIES:
            raise GeometricFidelityError(f"Nhóm kiểm tra chưa hỗ trợ: {category}")
        return tuple(item for item in self.findings if item.category == category)

    def codes(self) -> tuple[str, ...]:
        return tuple(sorted({item.code for item in self.findings}))

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": GEOMETRIC_SCHEMA,
            "scene_id": self.scene_id,
            "passed": self.passed,
            "settings": self.settings.as_dict(),
            "frames": len(self.sampled_seconds),
            "metrics": dict(sorted(self.metrics.items())),
            "findings": [item.as_dict() for item in self.findings],
            "unchecked": [dict(sorted(item.items())) for item in self.unchecked],
        }


# --- Geometry helpers ----------------------------------------------------


def _bounds(component: Any) -> tuple[float, float, float, float] | None:
    """Local box of a component, when its rig declares one."""
    declared = component.attributes.get("bounds")
    if not isinstance(declared, dict):
        return None
    unknown = set(declared) - {"width", "height", "offset_x", "offset_y"}
    _require(not unknown, f"{component.component_id}.bounds có field lạ: {sorted(unknown)}")
    width = _finite(declared.get("width"), f"{component.component_id}.bounds.width")
    height = _finite(declared.get("height"), f"{component.component_id}.bounds.height")
    _require(width > 0 and height > 0, f"{component.component_id}.bounds phải dương")
    return (
        width,
        height,
        _finite(declared.get("offset_x", 0), f"{component.component_id}.bounds.offset_x"),
        _finite(declared.get("offset_y", 0), f"{component.component_id}.bounds.offset_y"),
    )


def _world_box(sample: dict[str, Any], box: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    width, height, offset_x, offset_y = box
    transform = sample["world_transform"]
    center_x = transform["x"] + offset_x * transform["scale_x"]
    center_y = transform["y"] + offset_y * transform["scale_y"]
    half_width = abs(width * transform["scale_x"]) / 2
    half_height = abs(height * transform["scale_y"]) / 2
    return center_x - half_width, center_y - half_height, center_x + half_width, center_y + half_height


def _overlap(left: tuple[float, float, float, float], right: tuple[float, float, float, float]) -> float:
    dx = min(left[2], right[2]) - max(left[0], right[0])
    dy = min(left[3], right[3]) - max(left[1], right[1])
    return dx * dy if dx > 0 and dy > 0 else 0.0


def _area(box: tuple[float, float, float, float]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _anchor_owners(scene: Scene) -> dict[str, str]:
    """Anchor id (and unambiguous anchor name) to the component that owns it."""
    owners: dict[str, list[str]] = {}
    for entity in scene.entities:
        for component in entity.components:
            for anchor in component.anchors:
                owners.setdefault(anchor.anchor_id, []).append(component.component_id)
                owners.setdefault(anchor.name, []).append(component.component_id)
    return {key: value[0] for key, value in owners.items() if len(value) == 1}


def _contact_pairs(scene: Scene, owners: dict[str, str], components: dict[str, Any], seconds: float) -> set[frozenset[str]]:
    """Component pairs a contact constraint holds together right now.

    Things in contact are *meant* to overlap — a hand around a fruit is not an
    intersection defect — so those pairs are exempt from the solid check.
    """
    pairs: set[frozenset[str]] = set()
    for constraint in scene.constraints:
        if canonical_constraint_type(constraint.type) not in {"point_to_point", "distance", "inside_container"}:
            continue
        if not constraint.start - 1e-9 <= seconds <= constraint.end + 1e-9:
            continue
        resolved = [
            subject if subject in components else owners.get(subject)
            for subject in constraint.subject_ids
        ]
        named = [item for item in resolved if item is not None]
        for index, left in enumerate(named):
            for right in named[index + 1:]:
                if left != right:
                    pairs.add(frozenset((left, right)))
    return pairs


# --- Checker -------------------------------------------------------------


class _Checker:
    def __init__(self, scene: Scene, settings: GeometricSettings):
        self.scene = scene
        self.settings = settings
        self.findings: list[Finding] = []
        self.unchecked: list[dict[str, str]] = []
        self.metrics: dict[str, float] = {}

    def add(self, category: str, code: str, severity: str, message: str, seconds: float | None, refs: Sequence[str] = (), measured: float | None = None, allowed: float | None = None) -> None:
        self.findings.append(Finding(
            check_id=f"{category}.{code.lower()}.{len(self.findings)}",
            category=category,
            code=code,
            severity=severity,
            message=message,
            seconds=None if seconds is None else round(seconds, 6),
            refs=tuple(refs),
            measured=None if measured is None else round(measured, 6),
            allowed=allowed,
        ))


def _sample_times(scene: Scene, settings: GeometricSettings, events: Sequence[Any]) -> list[float]:
    """A fixed grid plus the exact frames either side of every lifecycle event."""
    step = 1.0 / settings.sample_rate
    times: set[float] = {scene.start, scene.end}
    count = int(math.floor((scene.end - scene.start) / step))
    for index in range(count + 1):
        times.add(min(scene.end, scene.start + index * step))
    for event in events:
        if scene.start <= event.time <= scene.end:
            times.add(event.time)
            before = max(scene.start, event.time - step)
            if before < event.time:
                times.add(before)
    return sorted(times)


def check_geometric_fidelity(
    scene: Scene | dict[str, Any],
    settings: GeometricSettings | None = None,
    *,
    scene_id: str | None = None,
) -> GeometricReport:
    """Sample a scene and report where its geometry breaks."""
    if isinstance(scene, Scene):
        model = scene
    else:
        project = validate_storyboard_v2(scene)
        _require(bool(project.scenes), "storyboard không có scene nào")
        if scene_id is None:
            model = project.scenes[0]
        else:
            found = next((item for item in project.scenes if item.scene_id == scene_id), None)
            _require(found is not None, f"Scene không tồn tại: {scene_id}")
            assert found is not None
            model = found
    options = settings or GeometricSettings()
    _require(isinstance(options, GeometricSettings), "settings không hợp lệ")

    events = lifecycle_events(model)
    solver = solver_for_scene(model)
    checker = _Checker(model, options)
    times = _sample_times(model, options, events)

    components = {
        component.component_id: component
        for entity in model.entities
        for component in entity.components
    }
    boxes: dict[str, tuple[float, float, float, float]] = {}
    for component_id, component in sorted(components.items()):
        box = _bounds(component)
        if box is None:
            checker.unchecked.append({"component_id": component_id, "reason": "no_bounds_declared"})
        else:
            boxes[component_id] = box

    solid_pairs = [
        (left, right)
        for index, left in enumerate(sorted(boxes))
        for right in sorted(boxes)[index + 1:]
    ]
    parents = {
        component.component_id: component.parent_component_id
        for entity in model.entities
        for component in entity.components
    }

    worst_contact = 0.0
    worst_slip = 0.0
    worst_overlap = 0.0
    worst_jump = 0.0
    worst_joint = 0.0
    previous: dict[str, Any] | None = None
    previous_time: float | None = None
    event_times = {round(item.time, 9) for item in events}

    owners = _anchor_owners(model)
    for seconds in times:
        solution = solver.solve(seconds)
        # Geometry is judged on the solved state: that is what a renderer
        # draws, and the raw runtime has no constraints applied at all.
        samples = solution.components
        exempt = _contact_pairs(model, owners, components, seconds)

        # contact: a hard constraint the solver could not satisfy is a real
        # gap between two things that should be touching.
        for result in solution.results:
            if result.satisfied or result.unit != "px":
                continue
            if result.type in {"point_to_point", "distance", "inside_container"}:
                worst_contact = max(worst_contact, result.residual)
                if result.residual > options.contact_tolerance:
                    checker.add("contact", "CONTACT_GAP", "fail" if result.strength == "hard" else "warn",
                                "a contact constraint is left unsatisfied",
                                seconds, (result.constraint_id, *result.moved_component_ids),
                                result.residual, options.contact_tolerance)
            if result.type == "joint_limit":
                continue
        for result in solution.results:
            if result.type == "joint_limit" and not result.satisfied:
                worst_joint = max(worst_joint, result.residual)
                if result.residual > options.joint_tolerance_degrees:
                    checker.add("joint", "JOINT_LIMIT_EXCEEDED", "fail",
                                "a hinge is outside the limit its constraint declares",
                                seconds, (result.constraint_id, *result.moved_component_ids),
                                result.residual, options.joint_tolerance_degrees)

        # joint limits declared on the rig itself, independent of constraints.
        for component_id, component in sorted(components.items()):
            limit = component.attributes.get("joint_limit")
            if not isinstance(limit, dict):
                continue
            minimum = _finite(limit.get("min_degrees", -180.0), f"{component_id}.joint_limit.min_degrees")
            maximum = _finite(limit.get("max_degrees", 180.0), f"{component_id}.joint_limit.max_degrees")
            _require(minimum <= maximum, f"{component_id}.joint_limit không hợp lệ")
            sample = samples.get(component_id)
            if sample is None:
                continue
            parent_id = sample["parent_id"]
            parent_rotation = samples[parent_id]["world_transform"]["rotation"] if parent_id in samples else 0.0
            local = sample["world_transform"]["rotation"] - parent_rotation
            excess = max(minimum - local, local - maximum, 0.0)
            worst_joint = max(worst_joint, excess)
            if excess > options.joint_tolerance_degrees:
                checker.add("joint", "RIG_JOINT_LIMIT_EXCEEDED", "fail",
                            f"'{component_id}' rotated outside its declared joint limit",
                            seconds, (component_id,), excess, options.joint_tolerance_degrees)

        # intersection between solid components that are not parent and child.
        for left, right in solid_pairs:
            left_sample, right_sample = samples.get(left), samples.get(right)
            if left_sample is None or right_sample is None:
                continue
            if left_sample["state"] in {"hidden", "detached"} or right_sample["state"] in {"hidden", "detached"}:
                continue
            if parents.get(left) == right or parents.get(right) == left:
                continue
            if left_sample["parent_id"] == right or right_sample["parent_id"] == left:
                continue
            if frozenset((left, right)) in exempt:
                continue
            left_box = _world_box(left_sample, boxes[left])
            right_box = _world_box(right_sample, boxes[right])
            overlap = _overlap(left_box, right_box)
            smallest = min(_area(left_box), _area(right_box))
            ratio = 0.0 if smallest <= 1e-12 else overlap / smallest
            worst_overlap = max(worst_overlap, ratio)
            if ratio > options.intersection_ratio:
                checker.add("intersection", "COMPONENTS_INTERSECT", "fail",
                            f"'{left}' and '{right}' overlap more than allowed",
                            seconds, (left, right), ratio, options.intersection_ratio)

        if previous is not None and previous_time is not None:
            span = seconds - previous_time
            if span > 1e-9:
                for component_id, sample in sorted(samples.items()):
                    earlier = previous.get(component_id)
                    if earlier is None:
                        continue
                    dx = sample["world_transform"]["x"] - earlier["world_transform"]["x"]
                    dy = sample["world_transform"]["y"] - earlier["world_transform"]["y"]
                    distance = math.hypot(dx, dy)
                    # attachment continuity: a reparent must not teleport the part.
                    if round(seconds, 9) in event_times and earlier["parent_id"] != sample["parent_id"]:
                        worst_jump = max(worst_jump, distance)
                        if distance > options.attachment_jump:
                            checker.add("attachment", "ATTACHMENT_JUMP", "fail",
                                        f"'{component_id}' jumps at the frame its parent changes",
                                        seconds, (component_id,), distance, options.attachment_jump)
                    # ground slip: horizontal travel while planted on the ground.
                    if _is_grounded(model, component_id, seconds):
                        slip = abs(dx) / span
                        worst_slip = max(worst_slip, slip)
                        if slip > options.ground_slip_per_second:
                            checker.add("ground", "GROUND_SLIP", "fail",
                                        f"'{component_id}' slides while it is in contact with the ground",
                                        seconds, (component_id,), slip, options.ground_slip_per_second)
        previous, previous_time = samples, seconds

    checker.metrics.update({
        "worst_contact_gap_px": round(worst_contact, 6),
        "worst_ground_slip_px_per_second": round(worst_slip, 6),
        "worst_intersection_ratio": round(worst_overlap, 6),
        "worst_attachment_jump_px": round(worst_jump, 6),
        "worst_joint_excess_degrees": round(worst_joint, 6),
        "components_with_bounds": float(len(boxes)),
        "components_without_bounds": float(len(checker.unchecked)),
    })
    return GeometricReport(
        scene_id=model.scene_id,
        settings=options,
        sampled_seconds=tuple(times),
        findings=tuple(checker.findings),
        metrics=dict(checker.metrics),
        unchecked=tuple(checker.unchecked),
    )


def _is_grounded(scene: Scene, component_id: str, seconds: float) -> bool:
    """True when a ground_contact constraint holds this component right now."""
    for constraint in scene.constraints:
        if canonical_constraint_type(constraint.type) != "ground_contact":
            continue
        if not constraint.start <= seconds <= constraint.end:
            continue
        movable = constraint.parameters.get("movable_id")
        subjects = [movable] if isinstance(movable, str) else list(constraint.subject_ids)
        if component_id in subjects:
            return True
        # An anchor subject grounds the component that owns it; the id grammar
        # gives no owner, so only a direct component reference counts here.
    return False


def check_storyboard_geometry(
    storyboard: dict[str, Any] | UniversalStoryboardV2,
    settings: GeometricSettings | None = None,
) -> tuple[GeometricReport, ...]:
    """Run the geometric checks over every scene of a project."""
    project = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    return tuple(check_geometric_fidelity(scene, settings) for scene in project.scenes)


__all__ = [
    "CATEGORIES",
    "GEOMETRIC_SCHEMA",
    "Finding",
    "GeometricFidelityError",
    "GeometricReport",
    "GeometricSettings",
    "check_geometric_fidelity",
    "check_storyboard_geometry",
]
