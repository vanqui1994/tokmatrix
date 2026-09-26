"""Interaction grammar for Universal Storyboard v2 scenes (UV-203).

The grammar is the bridge between semantic scene actions and the runtime
primitives built in UV-200 to UV-202.  It does two things:

1. Expands composite actions.  A composite is **data only** — a list of
   primitive steps with ratios of the composite interval, loaded from
   ``bkt_web/schemas/interaction_composites.json``.  A step may never name
   another composite, so expansion is single-pass and always terminates.
2. Compiles primitive actions into absolute-time component lifecycle events,
   constraint specs for the UV-202 solver, and material emission descriptors
   that UV-204 will consume.

Nothing here renders, samples randomly or mutates its input.  Compilation of a
scene at one timestamp yields the same plan regardless of call order.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from bkt_web.component_lifecycle import (
    LIFECYCLE_ACTIONS,
    INTERACTION_LIFECYCLE_ACTIONS,
    component_definitions,
    lifecycle_events,
)
from bkt_web.component_runtime import ComponentEvent, ComponentTreeRuntime
from bkt_web.constraint_solver import ConstraintSolver, DEFAULT_MAX_PASSES, sample_reference
from bkt_web.material_runtime import SUPPORTED_MATERIALS, emitter_seed
from bkt_web.universal_storyboard import Action, Scene, UniversalStoryboardV2, validate_storyboard_v2


COMPOSITE_SCHEMA = "tokmatrix.interaction-composites/v1"
COMPOSITE_LIBRARY_PATH = Path(__file__).resolve().parent / "schemas" / "interaction_composites.json"

CONTACT_PRIMITIVES = ("touch", "push", "pull", "drag", "place")
ARTICULATION_PRIMITIVES = ("open", "close", "fold")
EXCHANGE_PRIMITIVES = ("give", "receive", "transfer")
MATERIAL_PRIMITIVES = ("pour", "scatter", "spray")
PRIMITIVE_ACTIONS = tuple(sorted(CONTACT_PRIMITIVES + ARTICULATION_PRIMITIVES + EXCHANGE_PRIMITIVES + MATERIAL_PRIMITIVES))

# A composite step may reuse the lifecycle atoms owned by UV-201.
STEP_ACTIONS = frozenset(PRIMITIVE_ACTIONS) | LIFECYCLE_ACTIONS | INTERACTION_LIFECYCLE_ACTIONS

_MOVABLE_DEFAULT = {
    "touch": "actor",
    "push": "actor",
    "pull": "actor",
    "drag": "actor",
    "place": "target",
    "give": "target",
    "receive": "target",
    "transfer": "target",
    "pour": "actor",
    "scatter": "actor",
    "spray": "actor",
}


class InteractionGrammarError(ValueError):
    """Raised when an action cannot be compiled into runtime primitives."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise InteractionGrammarError(message)


def _number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InteractionGrammarError(f"{label} phải là số")
    number = float(value)
    if number != number or number in (float("inf"), float("-inf")):
        raise InteractionGrammarError(f"{label} phải là số hữu hạn")
    return number


def _xy(value: Any, label: str) -> dict[str, float]:
    _require(isinstance(value, dict), f"{label} phải là object có x và y")
    unknown = set(value) - {"x", "y"}
    _require(not unknown, f"{label} chứa thuộc tính không hỗ trợ: {sorted(unknown)}")
    return {"x": _number(value.get("x", 0), f"{label}.x"), "y": _number(value.get("y", 0), f"{label}.y")}


@lru_cache(maxsize=1)
def _library() -> dict[str, Any]:
    document = json.loads(COMPOSITE_LIBRARY_PATH.read_text(encoding="utf-8"))
    validate_composite_library(document)
    return document


def composite_library() -> dict[str, Any]:
    """Read-only copy of the shipped composite library."""
    return copy.deepcopy(_library())


def validate_composite_library(document: Any) -> None:
    """Check a composite library document without touching the runtime."""
    _require(isinstance(document, dict), "composite library phải là object")
    _require(document.get("schema") == COMPOSITE_SCHEMA, "composite library schema không được hỗ trợ")
    composites = document.get("composites")
    _require(isinstance(composites, dict) and composites, "composite library cần ít nhất một composite")
    for composite_id, composite in composites.items():
        label = f"composite.{composite_id}"
        _require(isinstance(composite, dict), f"{label} phải là object")
        _require(composite.get("id") == composite_id, f"{label}: id không khớp")
        roles = composite.get("roles")
        _require(
            isinstance(roles, list) and roles and all(isinstance(item, str) and item for item in roles),
            f"{label}.roles không hợp lệ",
        )
        _require(len(set(roles)) == len(roles), f"{label}.roles bị trùng")
        steps = composite.get("steps")
        _require(isinstance(steps, list) and steps, f"{label}.steps cần ít nhất một bước")
        step_ids: set[str] = set()
        previous_end = 0.0
        for index, step in enumerate(steps):
            step_label = f"{label}.steps[{index}]"
            _require(isinstance(step, dict), f"{step_label} phải là object")
            step_id = step.get("step_id")
            _require(isinstance(step_id, str) and step_id, f"{step_label}.step_id không hợp lệ")
            _require(step_id not in step_ids, f"{step_label}.step_id bị trùng")
            step_ids.add(step_id)
            kind = step.get("type")
            _require(kind in STEP_ACTIONS, f"{step_label}.type không phải primitive đã đăng ký: {kind}")
            _require(kind not in composites, f"{step_label}: composite lồng nhau không được hỗ trợ")
            start_ratio = _number(step.get("start_ratio"), f"{step_label}.start_ratio")
            end_ratio = _number(step.get("end_ratio"), f"{step_label}.end_ratio")
            _require(0 <= start_ratio <= end_ratio <= 1, f"{step_label}: ratio phải tăng dần trong [0,1]")
            _require(start_ratio >= previous_end - 1e-9, f"{step_label}: các bước phải theo thứ tự thời gian")
            previous_end = end_ratio
            for key in ("actor_roles", "target_roles"):
                value = step.get(key, [])
                _require(isinstance(value, list), f"{step_label}.{key} phải là danh sách")
                _require(all(item in roles for item in value), f"{step_label}.{key} tham chiếu role lạ")
            _require(step.get("actor_roles"), f"{step_label}.actor_roles không được rỗng")
            parameters = step.get("parameters", {})
            _require(isinstance(parameters, dict), f"{step_label}.parameters phải là object")
            _check_templates(parameters, roles, step_label)


def _check_templates(value: Any, roles: list[str], label: str) -> None:
    if isinstance(value, dict):
        if set(value) == {"$role"}:
            _require(value["$role"] in roles, f"{label}: $role tham chiếu role lạ: {value['$role']}")
            return
        if set(value) == {"$param"}:
            _require(isinstance(value["$param"], str) and value["$param"], f"{label}: $param không hợp lệ")
            return
        for key, child in value.items():
            _check_templates(child, roles, f"{label}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _check_templates(child, roles, f"{label}[{index}]")


def _substitute(value: Any, bindings: dict[str, str], parameters: dict[str, Any], label: str) -> Any:
    if isinstance(value, dict):
        if set(value) == {"$role"}:
            return bindings[value["$role"]]
        if set(value) == {"$param"}:
            name = value["$param"]
            _require(name in parameters, f"{label}: thiếu parameter '{name}' cho composite")
            return copy.deepcopy(parameters[name])
        return {key: _substitute(child, bindings, parameters, f"{label}.{key}") for key, child in value.items()}
    if isinstance(value, list):
        return [_substitute(child, bindings, parameters, f"{label}[{index}]") for index, child in enumerate(value)]
    return value


# --- Composite expansion -------------------------------------------------


def expand_actions(scene: Scene, library: dict[str, Any] | None = None) -> list[Action]:
    """Return the scene's actions with every composite replaced by its steps."""
    document = library if library is not None else _library()
    if library is not None:
        validate_composite_library(document)
    composites = document["composites"]
    output: list[Action] = []
    for action in scene.actions:
        composite = composites.get(action.type)
        if composite is None:
            output.append(action)
            continue
        output.extend(_expand_one(action, composite))
    return output


def _expand_one(action: Action, composite: dict[str, Any]) -> list[Action]:
    label = f"{action.action_id} ({composite['id']})"
    parameters = dict(action.parameters)
    bindings = parameters.pop("roles", None)
    _require(isinstance(bindings, dict), f"{label}: composite cần parameters.roles")
    missing = [role for role in composite["roles"] if role not in bindings]
    _require(not missing, f"{label}: thiếu role {missing}")
    unknown = [role for role in bindings if role not in composite["roles"]]
    _require(not unknown, f"{label}: role không thuộc composite: {unknown}")
    _require(
        all(isinstance(value, str) and value for value in bindings.values()),
        f"{label}: role binding phải là stable ID",
    )
    duration = action.end - action.start
    _require(duration >= 0, f"{label}: composite có duration âm")
    output: list[Action] = []
    for step in composite["steps"]:
        step_parameters = _substitute(copy.deepcopy(step.get("parameters", {})), bindings, parameters, label)
        step_parameters.setdefault("composite_id", composite["id"])
        step_parameters.setdefault("composite_action_id", action.action_id)
        actors = [bindings[role] for role in step["actor_roles"]]
        targets = [bindings[role] for role in step.get("target_roles", [])]
        output.append(Action(
            action_id=f"{action.action_id}:{step['step_id']}",
            type=step["type"],
            actor_ids=actors,
            target_ids=targets,
            start=action.start + duration * step["start_ratio"],
            end=action.start + duration * step["end_ratio"],
            parameters=step_parameters,
            analysis=action.analysis,
            provenance_id=action.provenance_id,
        ))
    return output


# --- Primitive compilation ----------------------------------------------


@dataclass(frozen=True, slots=True)
class Emission:
    """Deterministic material emission a UV-204 renderer can reproduce."""

    emission_id: str
    action_id: str
    kind: str
    material: str
    source_ref: str
    target_ref: str | None
    start: float
    end: float
    rate: float
    spread: float
    seed: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "emission_id": self.emission_id,
            "action_id": self.action_id,
            "kind": self.kind,
            "material": self.material,
            "source_ref": self.source_ref,
            "target_ref": self.target_ref,
            "start": self.start,
            "end": self.end,
            "rate": self.rate,
            "spread": self.spread,
            "seed": self.seed,
        }


@dataclass(frozen=True, slots=True)
class SkippedAction:
    """A primitive the grammar refuses to compile, kept visible for review."""

    action_id: str
    type: str
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {"action_id": self.action_id, "type": self.type, "reason": self.reason}


@dataclass(frozen=True, slots=True)
class InteractionPlan:
    scene_id: str
    primitives: tuple[Action, ...]
    events: tuple[ComponentEvent, ...]
    constraints: tuple[dict[str, Any], ...]
    emissions: tuple[Emission, ...]
    skipped: tuple[SkippedAction, ...]
    runtime: ComponentTreeRuntime

    def solver(self, *, max_passes: int = DEFAULT_MAX_PASSES) -> ConstraintSolver:
        return ConstraintSolver(self.runtime, self.constraints, max_passes=max_passes)

    def as_dict(self) -> dict[str, Any]:
        return {
            "scene_id": self.scene_id,
            "primitives": [
                {
                    "action_id": item.action_id,
                    "type": item.type,
                    "actor_ids": list(item.actor_ids),
                    "target_ids": list(item.target_ids),
                    "start": item.start,
                    "end": item.end,
                    "parameters": copy.deepcopy(item.parameters),
                }
                for item in self.primitives
            ],
            "events": [
                {
                    "event_id": item.event_id,
                    "component_id": item.component_id,
                    "time": item.time,
                    "parent_id": item.parent_id if item.parent_id is None or isinstance(item.parent_id, str) else "unchanged",
                    "state": item.state,
                }
                for item in sorted(self.events, key=lambda event: (event.time, event.event_id))
            ],
            "constraints": [copy.deepcopy(item) for item in self.constraints],
            "emissions": [item.as_dict() for item in self.emissions],
            "needs_review": [item.as_dict() for item in self.skipped],
        }


def _seed(project_id: str, source_ref: str, action_id: str, material: str) -> int:
    # UV-204 owns seed derivation so a grammar emission and a material emitter
    # built from it always share one particle stream.
    return emitter_seed(project_id, source_ref, action_id, material)


def _actor(action: Action) -> str:
    """The component or anchor that makes contact for this action.

    ``Action.actor_ids`` must reference entities in Universal Storyboard v2, so
    the contact point is carried in ``parameters.actor_ref`` (or UV-201's
    ``actor_component_id``) instead.
    """
    ref = action.parameters.get("actor_ref", action.parameters.get("actor_component_id"))
    _require(isinstance(ref, str) and bool(ref), f"{action.action_id}: cần parameters.actor_ref")
    assert isinstance(ref, str)
    return ref


def _target(action: Action) -> str:
    _require(bool(action.target_ids), f"{action.action_id}: {action.type} cần target")
    return action.target_ids[0]


def _movable_ref(action: Action, actor: str, target: str) -> str:
    choice = action.parameters.get("movable", _MOVABLE_DEFAULT[action.type])
    _require(choice in {"actor", "target"}, f"{action.action_id}.movable phải là 'actor' hoặc 'target'")
    return actor if choice == "actor" else target


def _contact(action: Action, actor: str, target: str, *, start: float, end: float, suffix: str = "contact", priority: int = 100) -> dict[str, Any]:
    parameters: dict[str, Any] = {
        "movable_id": _movable_ref(action, actor, target),
        "priority": priority,
        "intent": action.type,
    }
    offset = action.parameters.get("offset")
    if offset is not None:
        parameters["offset"] = _xy(offset, f"{action.action_id}.offset")
    tolerance = action.parameters.get("tolerance")
    if tolerance is not None:
        parameters["tolerance"] = _number(tolerance, f"{action.action_id}.tolerance")
    return {
        "constraint_id": f"{action.action_id}:{suffix}",
        "type": "point_to_point",
        "subject_ids": [actor, target],
        "start": start,
        "end": end,
        "strength": action.parameters.get("strength", "hard"),
        "parameters": parameters,
    }


def _motion_constraints(action: Action, runtime: ComponentTreeRuntime, points: dict[str, dict[str, float]]) -> list[dict[str, Any]]:
    actor, target = _actor(action), _target(action)
    _require("to" in action.parameters, f"{action.action_id}: {action.type} cần parameters.to")
    destination = _xy(action.parameters["to"], f"{action.action_id}.to")
    origin = action.parameters.get("from")
    if origin is not None:
        origin = _xy(origin, f"{action.action_id}.from")
    elif target in points:
        # Continue from where an earlier motion in this scene left the object.
        origin = dict(points[target])
    else:
        sampled = sample_reference(runtime, target, action.start)
        origin = {"x": sampled["x"], "y": sampled["y"]}
    points[target] = destination
    path = {
        "constraint_id": f"{action.action_id}:path",
        "type": "path_follow",
        "subject_ids": [target],
        "start": action.start,
        "end": action.end,
        "strength": "hard",
        "parameters": {"points": [origin, destination], "priority": 120, "intent": action.type},
    }
    # The hand keeps contact but must not fight the path, so it is the side
    # that moves and it is solved before the path constraint.
    return [path, _contact(action, actor, target, start=action.start, end=action.end, priority=90)]


def _articulation_constraints(action: Action, runtime: ComponentTreeRuntime, scene: Scene, poses: dict[str, float]) -> list[dict[str, Any]]:
    hinge = _target(action)
    _require("to_degrees" in action.parameters, f"{action.action_id}: {action.type} cần parameters.to_degrees")
    to_degrees = _number(action.parameters["to_degrees"], f"{action.action_id}.to_degrees")
    origin = action.parameters.get("from_degrees")
    if origin is not None:
        from_degrees = _number(origin, f"{action.action_id}.from_degrees")
    elif hinge in poses:
        # A later open/close/fold starts from the angle the previous one held.
        from_degrees = poses[hinge]
    else:
        from_degrees = sample_reference(runtime, hinge, action.start)["local_rotation"]
    poses[hinge] = to_degrees
    low, high = (from_degrees, to_degrees) if from_degrees <= to_degrees else (to_degrees, from_degrees)
    envelope = {
        "constraint_id": f"{action.action_id}:envelope",
        "type": "joint_limit",
        "subject_ids": [hinge],
        "start": action.start,
        "end": action.end,
        "strength": "hard",
        "parameters": {"min_degrees": low, "max_degrees": high, "priority": 80, "intent": action.type},
    }
    hold = {
        "constraint_id": f"{action.action_id}:hold",
        "type": "joint_limit",
        "subject_ids": [hinge],
        "start": action.end,
        "end": scene.end,
        "strength": "hard",
        "parameters": {"min_degrees": to_degrees, "max_degrees": to_degrees, "priority": 100, "intent": action.type},
    }
    return [envelope, hold]


def _exchange(action: Action) -> tuple[list[ComponentEvent], list[dict[str, Any]]]:
    actor, item = _actor(action), _target(action)
    events: list[ComponentEvent] = []
    constraints: list[dict[str, Any]] = []
    if action.type in {"receive", "transfer"}:
        parent = action.parameters.get("parent_component_id")
        _require(isinstance(parent, str) and parent, f"{action.action_id}: {action.type} cần parent_component_id")
        events.append(ComponentEvent(
            event_id=f"{action.action_id}:attach",
            component_id=item,
            time=action.end,
            parent_id=parent,
            state="attached",
            preserve_world=True,
        ))
    if action.type == "give":
        events.append(ComponentEvent(
            event_id=f"{action.action_id}:detach",
            component_id=item,
            time=action.end,
            parent_id=None,
            state="detached",
            preserve_world=True,
        ))
    if action.type == "transfer":
        midpoint = action.start + (action.end - action.start) / 2
        constraints.append(_contact(action, actor, item, start=action.start, end=midpoint, suffix="contact.giver"))
        constraints.append(_contact(action, action.parameters["parent_component_id"], item, start=midpoint, end=action.end, suffix="contact.receiver"))
    else:
        holder = action.parameters["parent_component_id"] if action.type == "receive" else actor
        constraints.append(_contact(action, holder, item, start=action.start, end=action.end))
    return events, constraints


def _placement_constraints(action: Action, scene: Scene) -> list[dict[str, Any]]:
    item = _target(action)
    container = action.parameters.get("container_ref")
    _require(isinstance(container, str) and container, f"{action.action_id}: place cần container_ref")
    # A placed object stays put until the scene ends unless told otherwise.
    hold_until = _number(action.parameters.get("hold_until", scene.end), f"{action.action_id}.hold_until")
    _require(hold_until >= action.end, f"{action.action_id}.hold_until phải sau khi đặt xong")
    bounds = action.parameters.get("bounds")
    if bounds is None:
        return [_contact(action, container, item, start=action.end, end=hold_until)]
    _require(isinstance(bounds, dict), f"{action.action_id}.bounds phải là object")
    return [{
        "constraint_id": f"{action.action_id}:containment",
        "type": "inside_container",
        "subject_ids": [item, container],
        "start": action.end,
        "end": hold_until,
        "strength": "hard",
        "parameters": {"bounds": copy.deepcopy(bounds), "priority": 100, "intent": "place"},
    }]


def _emission(action: Action, project_id: str, scene_id: str) -> Emission:
    material = action.parameters.get("material")
    _require(isinstance(material, str) and material, f"{action.action_id}: {action.type} cần material")
    _require(
        material in SUPPORTED_MATERIALS,
        f"{action.action_id}: material chưa có trong catalog UV-204: {material}",
    )
    rate = _number(action.parameters.get("rate", 1.0), f"{action.action_id}.rate")
    spread = _number(action.parameters.get("spread", 0.2), f"{action.action_id}.spread")
    _require(rate > 0, f"{action.action_id}.rate phải lớn hơn 0")
    _require(0 <= spread <= 1, f"{action.action_id}.spread cần trong [0,1]")
    return Emission(
        emission_id=f"{action.action_id}:emission",
        action_id=action.action_id,
        kind=action.type,
        material=material,
        source_ref=_actor(action),
        target_ref=action.target_ids[0] if action.target_ids else None,
        start=action.start,
        end=action.end,
        rate=rate,
        spread=spread,
        seed=_seed(project_id, _actor(action), action.action_id, material),
    )


def _unroutable_reason(action: Action, addressable: set[str], components: set[str]) -> str | None:
    """Why a primitive cannot address the component tree, or ``None`` if it can."""
    actor_ref = action.parameters.get("actor_ref", action.parameters.get("actor_component_id"))
    if not isinstance(actor_ref, str) or not actor_ref:
        return "missing_actor_ref"
    if actor_ref not in addressable:
        return "actor_is_not_a_component_or_anchor"
    if action.type in MATERIAL_PRIMITIVES:
        return None
    if not action.target_ids:
        return "missing_component_target"
    if action.target_ids[0] not in addressable:
        return "target_is_not_a_component_or_anchor"
    if action.type in EXCHANGE_PRIMITIVES and action.target_ids[0] not in components:
        return "exchange_target_must_be_a_component"
    return None


def compile_scene_interactions(
    scene: Scene,
    *,
    project_id: str = "",
    library: dict[str, Any] | None = None,
) -> InteractionPlan:
    """Expand composites and compile every primitive into runtime data."""
    primitives = expand_actions(scene, library)
    ids = [item.action_id for item in primitives]
    _require(len(ids) == len(set(ids)), "action_id bị trùng sau khi expand composite")
    working = scene.model_copy(update={"actions": primitives})
    definitions = component_definitions(scene)
    components = {item.component_id for item in definitions}
    addressable = components | {name for item in definitions for name in item.anchors}
    events = list(lifecycle_events(working))
    exchange_constraints: list[dict[str, Any]] = []
    unroutable_exchanges: list[SkippedAction] = []
    for action in primitives:
        if action.type not in EXCHANGE_PRIMITIVES:
            continue
        reason = _unroutable_reason(action, addressable, components)
        if reason is not None:
            unroutable_exchanges.append(SkippedAction(action_id=action.action_id, type=action.type, reason=reason))
            continue
        new_events, new_constraints = _exchange(action)
        events.extend(new_events)
        exchange_constraints.extend(new_constraints)
    runtime = ComponentTreeRuntime(definitions, events)

    constraints: list[dict[str, Any]] = [
        {
            "constraint_id": item.constraint_id,
            "type": item.type,
            "subject_ids": list(item.subject_ids),
            "start": item.start,
            "end": item.end,
            "strength": item.strength,
            "parameters": copy.deepcopy(item.parameters),
        }
        for item in scene.constraints
    ]
    emissions: list[Emission] = []
    skipped: list[SkippedAction] = []
    poses: dict[str, float] = {}
    points: dict[str, dict[str, float]] = {}
    for action in sorted(primitives, key=lambda item: (item.start, item.end, item.action_id)):
        if action.type in PRIMITIVE_ACTIONS:
            reason = _unroutable_reason(action, addressable, components)
            if reason is not None:
                # v1-derived actions still address whole entities. They stay
                # with the entity runtime and are reported, never silently
                # compiled into a contact that does not exist.
                skipped.append(SkippedAction(action_id=action.action_id, type=action.type, reason=reason))
                continue
        if action.type == "touch":
            constraints.append(_contact(action, _actor(action), _target(action), start=action.start, end=action.end))
        elif action.type in {"push", "pull", "drag"}:
            constraints.extend(_motion_constraints(action, runtime, points))
        elif action.type == "place":
            constraints.extend(_placement_constraints(action, scene))
        elif action.type in ARTICULATION_PRIMITIVES:
            constraints.extend(_articulation_constraints(action, runtime, scene, poses))
        elif action.type in MATERIAL_PRIMITIVES:
            emissions.append(_emission(action, project_id, scene.scene_id))
            contact_ref = action.parameters.get("contact_ref")
            if isinstance(contact_ref, str) and contact_ref:
                constraints.append(_contact(action, _actor(action), contact_ref, start=action.start, end=action.end))
    constraints.extend(exchange_constraints)
    skipped.extend(unroutable_exchanges)
    constraint_ids = [item["constraint_id"] for item in constraints]
    _require(len(constraint_ids) == len(set(constraint_ids)), "constraint_id bị trùng sau khi compile")
    return InteractionPlan(
        scene_id=scene.scene_id,
        primitives=tuple(primitives),
        events=tuple(events),
        constraints=tuple(constraints),
        emissions=tuple(emissions),
        skipped=tuple(sorted(skipped, key=lambda item: item.action_id)),
        runtime=runtime,
    )


def solve_scene_interactions(
    storyboard: dict[str, Any] | UniversalStoryboardV2,
    scene_id: str,
    seconds: float,
    *,
    max_passes: int = DEFAULT_MAX_PASSES,
    library: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compile a scene's interactions and solve them at an absolute timestamp."""
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    scene = next((item for item in model.scenes if item.scene_id == scene_id), None)
    _require(scene is not None, f"Scene không tồn tại: {scene_id}")
    assert scene is not None
    _require(scene.start <= seconds <= scene.end, "Timestamp nằm ngoài scene")
    plan = compile_scene_interactions(scene, project_id=model.project_id, library=library)
    payload = plan.solver(max_passes=max_passes).solve(seconds).as_dict()
    payload["plan"] = plan.as_dict()
    return payload


__all__ = [
    "ARTICULATION_PRIMITIVES",
    "COMPOSITE_SCHEMA",
    "CONTACT_PRIMITIVES",
    "EXCHANGE_PRIMITIVES",
    "Emission",
    "InteractionGrammarError",
    "InteractionPlan",
    "SkippedAction",
    "MATERIAL_PRIMITIVES",
    "PRIMITIVE_ACTIONS",
    "STEP_ACTIONS",
    "compile_scene_interactions",
    "composite_library",
    "expand_actions",
    "solve_scene_interactions",
    "validate_composite_library",
]
