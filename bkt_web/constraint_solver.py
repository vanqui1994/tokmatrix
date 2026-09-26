"""General constraint solver for Universal Storyboard v2 scenes (UV-202).

The solver is renderer-neutral and stateless between samples: every call
rebuilds the component world state from :mod:`bkt_web.component_runtime` at the
requested absolute timestamp and then runs a bounded number of projection
passes.  No pass depends on a previously rendered frame, so seeking backwards
gives byte-identical output.

Supported constraint families:

``point_to_point``   pin a point onto another point (alias ``anchor_contact``)
``distance``         keep two points within a distance band
``look_at``          rotate a component towards a target (alias ``gaze_target``)
``ground_contact``   keep a point on, or above, a ground line
``inside_container`` keep a point inside container bounds (alias ``containment``)
``joint_limit``      clamp a component rotation relative to its parent
``path_follow``      drive a point along a polyline over the constraint interval

Within a pass constraints are applied in ascending ``priority``, soft before
hard, then by ``constraint_id``, so the most important constraint corrects last
and therefore wins a genuine conflict.  Passes stop as soon as no correction is
applied or the pass budget is exhausted, so the solver can never loop forever.
Anything still violated afterwards is reported instead of silently accepted.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from bkt_web.component_lifecycle import runtime_for_scene
from bkt_web.component_runtime import ComponentTreeRuntime, Transform2D
from bkt_web.universal_storyboard import Scene, UniversalStoryboardV2, validate_storyboard_v2


DEFAULT_MAX_PASSES = 8
DEFAULT_TOLERANCE = 1e-3
_HARD_PRIORITY = 100
_SOFT_PRIORITY = 50

CONSTRAINT_ALIASES = {
    "anchor_contact": "point_to_point",
    "point-to-point": "point_to_point",
    "gaze_target": "look_at",
    "look-at": "look_at",
    "ground-contact": "ground_contact",
    "containment": "inside_container",
    "inside-container": "inside_container",
    "joint-limit": "joint_limit",
    "path-follow": "path_follow",
}

SUPPORTED_CONSTRAINT_TYPES = (
    "distance",
    "ground_contact",
    "inside_container",
    "joint_limit",
    "look_at",
    "path_follow",
    "point_to_point",
)


class ConstraintError(ValueError):
    """Raised when a constraint cannot be compiled into a solvable form."""


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ConstraintError(f"{label} phải là số hữu hạn")
    return float(value)


def _point(value: Any, label: str) -> tuple[float, float]:
    if not isinstance(value, dict):
        raise ConstraintError(f"{label} phải là object có x và y")
    unknown = set(value) - {"x", "y"}
    if unknown:
        raise ConstraintError(f"{label} chứa thuộc tính không hỗ trợ: {sorted(unknown)}")
    return _finite(value.get("x", 0), f"{label}.x"), _finite(value.get("y", 0), f"{label}.y")


def _wrap_degrees(value: float) -> float:
    return (value + 180.0) % 360.0 - 180.0


def canonical_constraint_type(value: str) -> str:
    """Map a storyboard constraint type onto a solver family."""
    if not isinstance(value, str) or not value:
        raise ConstraintError("constraint.type không hợp lệ")
    key = value.strip().lower()
    return CONSTRAINT_ALIASES.get(key, key)


@dataclass(frozen=True, slots=True)
class ConstraintSpec:
    """Normalised, immutable view of one scene constraint."""

    constraint_id: str
    type: str
    subject_ids: tuple[str, ...]
    start: float
    end: float
    strength: str
    priority: int
    tolerance: float
    weight: float
    parameters: dict[str, Any] = field(default_factory=dict)

    def active_at(self, seconds: float) -> bool:
        return self.start <= seconds <= self.end

    @property
    def order_key(self) -> tuple[int, int, str]:
        # Ascending: the last correction in a pass is the one that survives, so
        # the highest-priority (and hard-over-soft) constraint runs last.
        return self.priority, 0 if self.strength == "soft" else 1, self.constraint_id


def constraint_spec(constraint: Any) -> ConstraintSpec:
    """Compile a :class:`~bkt_web.universal_storyboard.Constraint` or dict."""
    if isinstance(constraint, ConstraintSpec):
        return constraint
    if isinstance(constraint, dict):
        source: dict[str, Any] = copy.deepcopy(constraint)
    else:
        source = {
            "constraint_id": constraint.constraint_id,
            "type": constraint.type,
            "subject_ids": list(constraint.subject_ids),
            "start": constraint.start,
            "end": constraint.end,
            "strength": constraint.strength,
            "parameters": copy.deepcopy(constraint.parameters),
        }
    constraint_id = source.get("constraint_id")
    if not isinstance(constraint_id, str) or not constraint_id:
        raise ConstraintError("constraint_id không hợp lệ")
    kind = canonical_constraint_type(source.get("type", ""))
    if kind not in SUPPORTED_CONSTRAINT_TYPES:
        raise ConstraintError(f"{constraint_id}: constraint type chưa hỗ trợ: {kind}")
    subjects = source.get("subject_ids") or []
    if not isinstance(subjects, list) or not subjects or any(not isinstance(item, str) or not item for item in subjects):
        raise ConstraintError(f"{constraint_id}: subject_ids không hợp lệ")
    strength = source.get("strength")
    if strength not in {"hard", "soft"}:
        raise ConstraintError(f"{constraint_id}: strength phải là hard hoặc soft")
    start = _finite(source.get("start", 0), f"{constraint_id}.start")
    end = _finite(source.get("end", 0), f"{constraint_id}.end")
    if end < start:
        raise ConstraintError(f"{constraint_id}: end không được nhỏ hơn start")
    parameters = source.get("parameters") or {}
    if not isinstance(parameters, dict):
        raise ConstraintError(f"{constraint_id}: parameters phải là object")
    priority = parameters.get("priority", _HARD_PRIORITY if strength == "hard" else _SOFT_PRIORITY)
    if isinstance(priority, bool) or not isinstance(priority, int):
        raise ConstraintError(f"{constraint_id}.priority phải là số nguyên")
    tolerance = _finite(parameters.get("tolerance", DEFAULT_TOLERANCE), f"{constraint_id}.tolerance")
    if tolerance <= 0:
        raise ConstraintError(f"{constraint_id}.tolerance phải lớn hơn 0")
    weight = _finite(parameters.get("weight", 1.0 if strength == "hard" else 0.5), f"{constraint_id}.weight")
    if not 0 < weight <= 1:
        raise ConstraintError(f"{constraint_id}.weight cần nằm trong (0,1]")
    return ConstraintSpec(
        constraint_id=constraint_id,
        type=kind,
        subject_ids=tuple(subjects),
        start=start,
        end=end,
        strength=strength,
        priority=priority,
        tolerance=tolerance,
        weight=weight,
        parameters=copy.deepcopy(parameters),
    )


@dataclass(frozen=True, slots=True)
class ConstraintResult:
    constraint_id: str
    type: str
    strength: str
    priority: int
    satisfied: bool
    residual: float
    unit: str
    tolerance: float
    moved_component_ids: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "constraint_id": self.constraint_id,
            "type": self.type,
            "strength": self.strength,
            "priority": self.priority,
            "satisfied": self.satisfied,
            "residual": self.residual,
            "unit": self.unit,
            "tolerance": self.tolerance,
            "moved_component_ids": list(self.moved_component_ids),
        }


@dataclass(frozen=True, slots=True)
class ConstraintConflict:
    constraint_id: str
    strength: str
    priority: int
    residual: float
    unit: str
    tolerance: float
    competing_constraint_ids: tuple[str, ...]
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "constraint_id": self.constraint_id,
            "strength": self.strength,
            "priority": self.priority,
            "residual": self.residual,
            "unit": self.unit,
            "tolerance": self.tolerance,
            "competing_constraint_ids": list(self.competing_constraint_ids),
            "reason": self.reason,
        }


@dataclass(frozen=True, slots=True)
class ConstraintSolution:
    seconds: float
    passes: int
    converged: bool
    components: dict[str, dict[str, Any]]
    results: tuple[ConstraintResult, ...]
    conflicts: tuple[ConstraintConflict, ...]

    @property
    def satisfied(self) -> bool:
        return not self.conflicts

    def as_dict(self) -> dict[str, Any]:
        return {
            "seconds": self.seconds,
            "passes": self.passes,
            "converged": self.converged,
            "components": copy.deepcopy(self.components),
            "results": [item.as_dict() for item in self.results],
            "conflicts": [item.as_dict() for item in self.conflicts],
        }


@dataclass(slots=True)
class _SolveState:
    worlds: dict[str, Transform2D]
    anchors_local: dict[str, dict[str, Transform2D]]
    anchor_owners: dict[str, list[str]]
    parents: dict[str, str | None]
    children: dict[str, list[str]]
    states: dict[str, str]
    growth: dict[str, float]

    def descendants(self, component_id: str) -> list[str]:
        output: list[str] = []
        stack = [component_id]
        while stack:
            current = stack.pop()
            output.append(current)
            stack.extend(reversed(self.children.get(current, [])))
        return output

    def translate(self, component_id: str, dx: float, dy: float) -> None:
        for target in self.descendants(component_id):
            world = self.worlds[target]
            self.worlds[target] = Transform2D(
                x=world.x + dx,
                y=world.y + dy,
                rotation=world.rotation,
                scale_x=world.scale_x,
                scale_y=world.scale_y,
            )

    def rotate(self, component_id: str, degrees: float, pivot: tuple[float, float]) -> None:
        radians = math.radians(degrees)
        cosine, sine = math.cos(radians), math.sin(radians)
        pivot_x, pivot_y = pivot
        for target in self.descendants(component_id):
            world = self.worlds[target]
            dx, dy = world.x - pivot_x, world.y - pivot_y
            self.worlds[target] = Transform2D(
                x=pivot_x + dx * cosine - dy * sine,
                y=pivot_y + dx * sine + dy * cosine,
                rotation=world.rotation + degrees,
                scale_x=world.scale_x,
                scale_y=world.scale_y,
            )

    def anchor_world(self, component_id: str, anchor: str) -> Transform2D:
        return self.worlds[component_id].compose(self.anchors_local[component_id][anchor])


@dataclass(frozen=True, slots=True)
class _Ref:
    ref: str
    component_id: str
    anchor: str | None

    def transform(self, state: _SolveState) -> Transform2D:
        if self.anchor is None:
            return state.worlds[self.component_id]
        return state.anchor_world(self.component_id, self.anchor)

    def point(self, state: _SolveState) -> tuple[float, float]:
        transform = self.transform(state)
        return transform.x, transform.y


def _build_state(runtime: ComponentTreeRuntime, seconds: float) -> _SolveState:
    sample = runtime.sample(seconds)
    worlds = {component_id: item.world_transform for component_id, item in sample.items()}
    anchors_local: dict[str, dict[str, Transform2D]] = {}
    anchor_owners: dict[str, list[str]] = {}
    parents: dict[str, str | None] = {}
    children: dict[str, list[str]] = {component_id: [] for component_id in sample}
    for component_id, item in sample.items():
        parents[component_id] = item.parent_id
        if item.parent_id is not None:
            children[item.parent_id].append(component_id)
        anchors_local[component_id] = {
            name: value.relative_to(item.world_transform) for name, value in item.anchors.items()
        }
        for name in item.anchors:
            anchor_owners.setdefault(name, []).append(component_id)
    for key in children:
        children[key].sort()
    return _SolveState(
        worlds=worlds,
        anchors_local=anchors_local,
        anchor_owners={key: sorted(value) for key, value in anchor_owners.items()},
        parents=parents,
        children=children,
        states={component_id: item.state for component_id, item in sample.items()},
        growth={component_id: item.growth_stage for component_id, item in sample.items()},
    )


def _resolve(state: _SolveState, ref: str, label: str) -> _Ref:
    if ref in state.worlds:
        return _Ref(ref=ref, component_id=ref, anchor=None)
    owners = state.anchor_owners.get(ref, [])
    if len(owners) == 1:
        return _Ref(ref=ref, component_id=owners[0], anchor=ref)
    if len(owners) > 1:
        raise ConstraintError(f"{label}: anchor '{ref}' thuộc nhiều component: {owners}")
    raise ConstraintError(f"{label}: không tìm thấy component hoặc anchor '{ref}'")


def _refs(spec: ConstraintSpec, state: _SolveState, *, minimum: int, maximum: int) -> list[_Ref]:
    if not minimum <= len(spec.subject_ids) <= maximum:
        raise ConstraintError(
            f"{spec.constraint_id}: {spec.type} cần từ {minimum} đến {maximum} subject_ids"
        )
    return [_resolve(state, ref, spec.constraint_id) for ref in spec.subject_ids]


def _movable(spec: ConstraintSpec, state: _SolveState, refs: list[_Ref]) -> _Ref:
    explicit = spec.parameters.get("movable_id")
    if explicit is not None:
        if not isinstance(explicit, str):
            raise ConstraintError(f"{spec.constraint_id}.movable_id phải là chuỗi")
        match = next((item for item in refs if item.ref == explicit), None)
        if match is None:
            raise ConstraintError(f"{spec.constraint_id}.movable_id phải nằm trong subject_ids")
        return match
    # An anchor is a socket on a rig; a bare component is the free body. When
    # exactly one side is a bare component it is the one that moves.
    bare = [item for item in refs if item.anchor is None]
    if len(bare) == 1:
        return bare[0]
    return refs[0]


# --- Constraint families -------------------------------------------------

_Correction = Callable[[], None]
_Evaluation = tuple[float, str, tuple[str, ...], _Correction | None]


def _eval_point_to_point(spec: ConstraintSpec, state: _SolveState) -> _Evaluation:
    refs = _refs(spec, state, minimum=2, maximum=2)
    movable = _movable(spec, state, refs)
    target = refs[1] if movable is refs[0] else refs[0]
    offset_x, offset_y = _point(spec.parameters.get("offset", {}), f"{spec.constraint_id}.offset")
    mx, my = movable.point(state)
    tx, ty = target.point(state)
    dx, dy = tx + offset_x - mx, ty + offset_y - my
    residual = math.hypot(dx, dy)

    def apply() -> None:
        state.translate(movable.component_id, dx * spec.weight, dy * spec.weight)

    return residual, "px", (movable.component_id,), apply


def _eval_distance(spec: ConstraintSpec, state: _SolveState) -> _Evaluation:
    refs = _refs(spec, state, minimum=2, maximum=2)
    movable = _movable(spec, state, refs)
    target = refs[1] if movable is refs[0] else refs[0]
    parameters = spec.parameters
    if "distance" in parameters:
        minimum = maximum = _finite(parameters["distance"], f"{spec.constraint_id}.distance")
    else:
        minimum = _finite(parameters.get("min_distance", 0), f"{spec.constraint_id}.min_distance")
        maximum = (
            _finite(parameters["max_distance"], f"{spec.constraint_id}.max_distance")
            if "max_distance" in parameters
            else math.inf
        )
    if minimum < 0 or maximum < minimum:
        raise ConstraintError(f"{spec.constraint_id}: khoảng cách không hợp lệ")
    mx, my = movable.point(state)
    tx, ty = target.point(state)
    dx, dy = mx - tx, my - ty
    current = math.hypot(dx, dy)
    if current < minimum:
        wanted = minimum
    elif current > maximum:
        wanted = maximum
    else:
        return 0.0, "px", (movable.component_id,), None
    residual = abs(current - wanted)
    if current <= 1e-12:
        # Degenerate overlap has no defined direction; push along +x so the
        # correction stays deterministic instead of depending on float noise.
        ux, uy = 1.0, 0.0
    else:
        ux, uy = dx / current, dy / current

    def apply() -> None:
        shift = (wanted - current) * spec.weight
        state.translate(movable.component_id, ux * shift, uy * shift)

    return residual, "px", (movable.component_id,), apply


def _eval_look_at(spec: ConstraintSpec, state: _SolveState) -> _Evaluation:
    refs = _refs(spec, state, minimum=2, maximum=2)
    subject, target = refs[0], refs[1]
    offset = _finite(spec.parameters.get("forward_offset_degrees", 0), f"{spec.constraint_id}.forward_offset_degrees")
    sx, sy = subject.point(state)
    tx, ty = target.point(state)
    if math.hypot(tx - sx, ty - sy) <= 1e-12:
        raise ConstraintError(f"{spec.constraint_id}: look_at cần hai điểm khác nhau")
    wanted = math.degrees(math.atan2(ty - sy, tx - sx)) + offset
    current = state.worlds[subject.component_id].rotation
    delta = _wrap_degrees(wanted - current)
    residual = abs(delta)

    def apply() -> None:
        state.rotate(subject.component_id, delta * spec.weight, (sx, sy))

    return residual, "deg", (subject.component_id,), apply


def _eval_ground_contact(spec: ConstraintSpec, state: _SolveState) -> _Evaluation:
    refs = _refs(spec, state, minimum=1, maximum=1)
    movable = refs[0]
    if "ground_y" not in spec.parameters:
        raise ConstraintError(f"{spec.constraint_id}: ground_contact cần ground_y")
    ground_y = _finite(spec.parameters["ground_y"], f"{spec.constraint_id}.ground_y")
    mode = spec.parameters.get("mode", "on")
    if mode not in {"on", "above"}:
        raise ConstraintError(f"{spec.constraint_id}.mode phải là 'on' hoặc 'above'")
    _mx, my = movable.point(state)
    # Screen space: y grows downwards, so "above the ground" means y <= ground_y.
    delta = ground_y - my if mode == "on" else min(0.0, ground_y - my)
    residual = abs(delta)

    def apply() -> None:
        state.translate(movable.component_id, 0.0, delta * spec.weight)

    return residual, "px", (movable.component_id,), apply


def _eval_inside_container(spec: ConstraintSpec, state: _SolveState) -> _Evaluation:
    refs = _refs(spec, state, minimum=1, maximum=2)
    movable = refs[0]
    bounds = spec.parameters.get("bounds")
    if not isinstance(bounds, dict):
        raise ConstraintError(f"{spec.constraint_id}: inside_container cần bounds")
    unknown = set(bounds) - {"min_x", "min_y", "max_x", "max_y"}
    if unknown:
        raise ConstraintError(f"{spec.constraint_id}.bounds có field lạ: {sorted(unknown)}")
    min_x = _finite(bounds.get("min_x", 0), f"{spec.constraint_id}.bounds.min_x")
    min_y = _finite(bounds.get("min_y", 0), f"{spec.constraint_id}.bounds.min_y")
    max_x = _finite(bounds.get("max_x", 0), f"{spec.constraint_id}.bounds.max_x")
    max_y = _finite(bounds.get("max_y", 0), f"{spec.constraint_id}.bounds.max_y")
    if max_x < min_x or max_y < min_y:
        raise ConstraintError(f"{spec.constraint_id}.bounds không hợp lệ")
    origin_x = origin_y = 0.0
    if len(refs) == 2:
        origin_x, origin_y = refs[1].point(state)
    mx, my = movable.point(state)
    clamped_x = min(max(mx, origin_x + min_x), origin_x + max_x)
    clamped_y = min(max(my, origin_y + min_y), origin_y + max_y)
    dx, dy = clamped_x - mx, clamped_y - my
    residual = math.hypot(dx, dy)

    def apply() -> None:
        state.translate(movable.component_id, dx * spec.weight, dy * spec.weight)

    return residual, "px", (movable.component_id,), apply


def _eval_joint_limit(spec: ConstraintSpec, state: _SolveState) -> _Evaluation:
    refs = _refs(spec, state, minimum=1, maximum=1)
    movable = refs[0]
    parameters = spec.parameters
    if "min_degrees" not in parameters and "max_degrees" not in parameters:
        raise ConstraintError(f"{spec.constraint_id}: joint_limit cần min_degrees hoặc max_degrees")
    minimum = _finite(parameters["min_degrees"], f"{spec.constraint_id}.min_degrees") if "min_degrees" in parameters else -180.0
    maximum = _finite(parameters["max_degrees"], f"{spec.constraint_id}.max_degrees") if "max_degrees" in parameters else 180.0
    if maximum < minimum:
        raise ConstraintError(f"{spec.constraint_id}: joint_limit range không hợp lệ")
    component_id = movable.component_id
    parent_id = state.parents.get(component_id)
    parent_rotation = state.worlds[parent_id].rotation if parent_id is not None else 0.0
    local = state.worlds[component_id].rotation - parent_rotation
    clamped = min(max(local, minimum), maximum)
    delta = clamped - local
    residual = abs(delta)
    pivot = (state.worlds[component_id].x, state.worlds[component_id].y)

    def apply() -> None:
        state.rotate(component_id, delta * spec.weight, pivot)

    return residual, "deg", (component_id,), apply


def _polyline_point(points: list[tuple[float, float]], progress: float) -> tuple[float, float]:
    spans = [math.hypot(points[index + 1][0] - points[index][0], points[index + 1][1] - points[index][1]) for index in range(len(points) - 1)]
    total = sum(spans)
    if total <= 1e-12:
        return points[0]
    wanted = min(max(progress, 0.0), 1.0) * total
    travelled = 0.0
    for index, span in enumerate(spans):
        if span <= 1e-12:
            continue
        if travelled + span >= wanted:
            ratio = (wanted - travelled) / span
            start, end = points[index], points[index + 1]
            return start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio
        travelled += span
    return points[-1]


def _eval_path_follow(spec: ConstraintSpec, state: _SolveState, seconds: float) -> _Evaluation:
    refs = _refs(spec, state, minimum=1, maximum=1)
    movable = refs[0]
    raw = spec.parameters.get("points")
    if not isinstance(raw, list) or len(raw) < 2:
        raise ConstraintError(f"{spec.constraint_id}: path_follow cần ít nhất hai điểm")
    points = [_point(item, f"{spec.constraint_id}.points[{index}]") for index, item in enumerate(raw)]
    if spec.parameters.get("closed", False):
        if not isinstance(spec.parameters["closed"], bool):
            raise ConstraintError(f"{spec.constraint_id}.closed phải là boolean")
        points.append(points[0])
    duration = spec.end - spec.start
    progress = 0.0 if duration <= 0 else (seconds - spec.start) / duration
    tx, ty = _polyline_point(points, progress)
    mx, my = movable.point(state)
    dx, dy = tx - mx, ty - my
    residual = math.hypot(dx, dy)

    def apply() -> None:
        state.translate(movable.component_id, dx * spec.weight, dy * spec.weight)

    return residual, "px", (movable.component_id,), apply


def _evaluate(spec: ConstraintSpec, state: _SolveState, seconds: float) -> _Evaluation:
    if spec.type == "point_to_point":
        return _eval_point_to_point(spec, state)
    if spec.type == "distance":
        return _eval_distance(spec, state)
    if spec.type == "look_at":
        return _eval_look_at(spec, state)
    if spec.type == "ground_contact":
        return _eval_ground_contact(spec, state)
    if spec.type == "inside_container":
        return _eval_inside_container(spec, state)
    if spec.type == "joint_limit":
        return _eval_joint_limit(spec, state)
    if spec.type == "path_follow":
        return _eval_path_follow(spec, state, seconds)
    raise ConstraintError(f"{spec.constraint_id}: constraint type chưa hỗ trợ: {spec.type}")


# --- Solver --------------------------------------------------------------


class ConstraintSolver:
    """Deterministic, bounded projection solver over a component tree."""

    def __init__(
        self,
        runtime: ComponentTreeRuntime,
        constraints: Iterable[Any],
        *,
        max_passes: int = DEFAULT_MAX_PASSES,
    ) -> None:
        if isinstance(max_passes, bool) or not isinstance(max_passes, int) or max_passes < 1:
            raise ConstraintError("max_passes phải là số nguyên dương")
        self._runtime = runtime
        self._max_passes = max_passes
        specs = [constraint_spec(item) for item in constraints]
        ids = [item.constraint_id for item in specs]
        if len(ids) != len(set(ids)):
            raise ConstraintError("constraint_id bị trùng")
        self._specs = tuple(sorted(specs, key=lambda item: item.order_key))

    @property
    def constraints(self) -> tuple[ConstraintSpec, ...]:
        return self._specs

    def solve(self, seconds: float) -> ConstraintSolution:
        time = _finite(seconds, "seconds")
        if time < 0:
            raise ConstraintError("seconds không được âm")
        state = _build_state(self._runtime, time)
        active = [spec for spec in self._specs if spec.active_at(time)]
        moved: dict[str, tuple[str, ...]] = {spec.constraint_id: () for spec in active}
        passes = 0
        converged = True
        for _index in range(self._max_passes):
            passes += 1
            applied = False
            for spec in active:
                residual, _unit, touched, correction = _evaluate(spec, state, time)
                if residual > spec.tolerance and correction is not None:
                    correction()
                    moved[spec.constraint_id] = touched
                    applied = True
            if not applied:
                break

        results: list[ConstraintResult] = []
        for spec in active:
            residual, unit, _touched, _correction = _evaluate(spec, state, time)
            satisfied = residual <= spec.tolerance
            if not satisfied:
                converged = False
            results.append(ConstraintResult(
                constraint_id=spec.constraint_id,
                type=spec.type,
                strength=spec.strength,
                priority=spec.priority,
                satisfied=satisfied,
                residual=residual,
                unit=unit,
                tolerance=spec.tolerance,
                moved_component_ids=moved[spec.constraint_id],
            ))

        conflicts: list[ConstraintConflict] = []
        for result in results:
            if result.satisfied:
                continue
            owned = set(moved[result.constraint_id])
            competing = tuple(
                other.constraint_id
                for other in results
                if other.constraint_id != result.constraint_id and owned & set(moved[other.constraint_id])
            )
            reason = "competing_constraints" if competing else "unsatisfiable_within_pass_budget"
            conflicts.append(ConstraintConflict(
                constraint_id=result.constraint_id,
                strength=result.strength,
                priority=result.priority,
                residual=result.residual,
                unit=result.unit,
                tolerance=result.tolerance,
                competing_constraint_ids=competing,
                reason=reason,
            ))

        components = {
            component_id: {
                "component_id": component_id,
                "parent_id": state.parents[component_id],
                "state": state.states[component_id],
                "world_transform": state.worlds[component_id].as_dict(),
                "anchors": {
                    name: state.anchor_world(component_id, name).as_dict()
                    for name in sorted(state.anchors_local[component_id])
                },
                "growth_stage": state.growth[component_id],
            }
            for component_id in sorted(state.worlds)
        }
        return ConstraintSolution(
            seconds=time,
            passes=passes,
            converged=converged,
            components=components,
            results=tuple(results),
            conflicts=tuple(conflicts),
        )


def sample_reference(runtime: ComponentTreeRuntime, ref: str, seconds: float) -> dict[str, Any]:
    """Resolve one constraint subject id to world geometry at ``seconds``.

    Callers that compile constraints (UV-203 and later) need the world position
    or hinge angle a motion starts from.  Sampling goes through the same
    resolution rules as the solver, so a reference that compiles here is a
    reference the solver can also honour.
    """
    state = _build_state(runtime, _finite(seconds, "seconds"))
    resolved = _resolve(state, ref, "reference")
    transform = resolved.transform(state)
    component = state.worlds[resolved.component_id]
    parent_id = state.parents.get(resolved.component_id)
    parent_rotation = state.worlds[parent_id].rotation if parent_id is not None else 0.0
    return {
        "ref": ref,
        "component_id": resolved.component_id,
        "anchor": resolved.anchor,
        "x": transform.x,
        "y": transform.y,
        "rotation": transform.rotation,
        "local_rotation": component.rotation - parent_rotation,
    }


def solver_for_scene(scene: Scene, *, max_passes: int = DEFAULT_MAX_PASSES) -> ConstraintSolver:
    """Build a solver for one validated v2 scene without mutating it."""
    supported = [item for item in scene.constraints if canonical_constraint_type(item.type) in SUPPORTED_CONSTRAINT_TYPES]
    return ConstraintSolver(runtime_for_scene(scene), supported, max_passes=max_passes)


def unsupported_constraints(scene: Scene) -> tuple[str, ...]:
    """Constraint IDs the solver cannot route; callers must send them to review."""
    return tuple(sorted(
        item.constraint_id
        for item in scene.constraints
        if canonical_constraint_type(item.type) not in SUPPORTED_CONSTRAINT_TYPES
    ))


def solve_storyboard_constraints(
    storyboard: dict[str, Any] | UniversalStoryboardV2,
    scene_id: str,
    seconds: float,
    *,
    max_passes: int = DEFAULT_MAX_PASSES,
) -> dict[str, Any]:
    """Solve one scene at an absolute timestamp and return a plain snapshot."""
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    scene = next((item for item in model.scenes if item.scene_id == scene_id), None)
    if scene is None:
        raise ConstraintError(f"Scene không tồn tại: {scene_id}")
    if seconds < scene.start or seconds > scene.end:
        raise ConstraintError("Timestamp nằm ngoài scene")
    solution = solver_for_scene(scene, max_passes=max_passes).solve(seconds)
    payload = solution.as_dict()
    payload["needs_review_constraint_ids"] = list(unsupported_constraints(scene))
    return payload


__all__ = [
    "CONSTRAINT_ALIASES",
    "ConstraintConflict",
    "ConstraintError",
    "ConstraintResult",
    "ConstraintSolution",
    "ConstraintSolver",
    "ConstraintSpec",
    "DEFAULT_MAX_PASSES",
    "SUPPORTED_CONSTRAINT_TYPES",
    "canonical_constraint_type",
    "constraint_spec",
    "sample_reference",
    "solve_storyboard_constraints",
    "solver_for_scene",
    "unsupported_constraints",
]
