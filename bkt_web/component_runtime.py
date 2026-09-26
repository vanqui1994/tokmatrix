"""Deterministic component-tree runtime for Universal Storyboard v2 (UV-200).

The runtime is intentionally renderer-neutral.  It evaluates immutable
component definitions and absolute-time lifecycle events into world transforms,
states, growth stages and named anchor transforms.  No prior frame needs to be
sampled, so backward seeking and offline frame rendering are deterministic.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Literal


ComponentState = Literal["visible", "hidden", "attached", "detached", "damaged"]
_STATES = {"visible", "hidden", "attached", "detached", "damaged"}
_UNCHANGED = object()


class ComponentRuntimeError(ValueError):
    """Raised when a component tree or lifecycle event is not safe to sample."""


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ComponentRuntimeError(f"{label} phải là số hữu hạn")
    return float(value)


@dataclass(frozen=True, slots=True)
class Transform2D:
    x: float = 0.0
    y: float = 0.0
    rotation: float = 0.0
    scale_x: float = 1.0
    scale_y: float = 1.0

    def __post_init__(self) -> None:
        for name in ("x", "y", "rotation", "scale_x", "scale_y"):
            object.__setattr__(self, name, _finite(getattr(self, name), f"transform.{name}"))
        if abs(self.scale_x) < 1e-12 or abs(self.scale_y) < 1e-12:
            raise ComponentRuntimeError("Transform scale không được bằng 0")

    @classmethod
    def from_value(cls, value: Any, label: str = "transform") -> "Transform2D":
        if value is None:
            return cls()
        if isinstance(value, cls):
            return value
        if not isinstance(value, dict):
            raise ComponentRuntimeError(f"{label} phải là object")
        unknown = set(value) - {"x", "y", "rotation", "scale_x", "scale_y"}
        if unknown:
            raise ComponentRuntimeError(f"{label} chứa thuộc tính không hỗ trợ: {sorted(unknown)}")
        return cls(**value)

    def apply(self, point: tuple[float, float]) -> tuple[float, float]:
        px = _finite(point[0], "point.x") * self.scale_x
        py = _finite(point[1], "point.y") * self.scale_y
        radians = math.radians(self.rotation)
        cosine, sine = math.cos(radians), math.sin(radians)
        return self.x + px * cosine - py * sine, self.y + px * sine + py * cosine

    def compose(self, child: "Transform2D") -> "Transform2D":
        x, y = self.apply((child.x, child.y))
        return Transform2D(
            x=x,
            y=y,
            rotation=self.rotation + child.rotation,
            scale_x=self.scale_x * child.scale_x,
            scale_y=self.scale_y * child.scale_y,
        )

    def relative_to(self, parent: "Transform2D") -> "Transform2D":
        dx, dy = self.x - parent.x, self.y - parent.y
        radians = math.radians(-parent.rotation)
        cosine, sine = math.cos(radians), math.sin(radians)
        x = (dx * cosine - dy * sine) / parent.scale_x
        y = (dx * sine + dy * cosine) / parent.scale_y
        return Transform2D(
            x=x,
            y=y,
            rotation=self.rotation - parent.rotation,
            scale_x=self.scale_x / parent.scale_x,
            scale_y=self.scale_y / parent.scale_y,
        )

    def as_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y, "rotation": self.rotation, "scale_x": self.scale_x, "scale_y": self.scale_y}


@dataclass(frozen=True, slots=True)
class ComponentDefinition:
    component_id: str
    parent_id: str | None = None
    state: ComponentState = "visible"
    local_transform: Transform2D = field(default_factory=Transform2D)
    anchors: dict[str, Transform2D] = field(default_factory=dict)
    growth_stage: float = 0.0
    attributes: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.component_id, str) or not self.component_id:
            raise ComponentRuntimeError("component_id không hợp lệ")
        if self.parent_id is not None and (not isinstance(self.parent_id, str) or not self.parent_id):
            raise ComponentRuntimeError("parent_id không hợp lệ")
        if self.state not in _STATES:
            raise ComponentRuntimeError(f"Trạng thái component không hỗ trợ: {self.state}")
        object.__setattr__(self, "local_transform", Transform2D.from_value(self.local_transform))
        anchors = {
            str(name): Transform2D.from_value(transform, f"anchors.{name}")
            for name, transform in copy.deepcopy(self.anchors).items()
        }
        if any(not name for name in anchors):
            raise ComponentRuntimeError("Tên anchor không được rỗng")
        object.__setattr__(self, "anchors", anchors)
        growth = _finite(self.growth_stage, "growth_stage")
        if not 0 <= growth <= 1:
            raise ComponentRuntimeError("growth_stage cần trong [0,1]")
        object.__setattr__(self, "growth_stage", growth)
        object.__setattr__(self, "attributes", copy.deepcopy(self.attributes))


@dataclass(frozen=True, slots=True)
class ComponentEvent:
    event_id: str
    component_id: str
    time: float
    parent_id: str | None | object = _UNCHANGED
    state: ComponentState | None = None
    local_transform: Transform2D | None = None
    growth_stage: float | None = None
    preserve_world: bool = True

    def __post_init__(self) -> None:
        if not isinstance(self.event_id, str) or not self.event_id:
            raise ComponentRuntimeError("event_id không hợp lệ")
        if not isinstance(self.component_id, str) or not self.component_id:
            raise ComponentRuntimeError("event.component_id không hợp lệ")
        object.__setattr__(self, "time", _finite(self.time, "event.time"))
        if self.time < 0:
            raise ComponentRuntimeError("event.time không được âm")
        if self.parent_id is not _UNCHANGED and self.parent_id is not None and not isinstance(self.parent_id, str):
            raise ComponentRuntimeError("event.parent_id không hợp lệ")
        if self.state is not None and self.state not in _STATES:
            raise ComponentRuntimeError(f"Trạng thái event không hỗ trợ: {self.state}")
        if self.local_transform is not None:
            object.__setattr__(self, "local_transform", Transform2D.from_value(self.local_transform))
        if self.growth_stage is not None:
            growth = _finite(self.growth_stage, "event.growth_stage")
            if not 0 <= growth <= 1:
                raise ComponentRuntimeError("event.growth_stage cần trong [0,1]")
            object.__setattr__(self, "growth_stage", growth)
        if not isinstance(self.preserve_world, bool):
            raise ComponentRuntimeError("event.preserve_world phải là boolean")


@dataclass(frozen=True, slots=True)
class ComponentSample:
    component_id: str
    parent_id: str | None
    state: ComponentState
    local_transform: Transform2D
    world_transform: Transform2D
    anchors: dict[str, Transform2D]
    growth_stage: float
    attributes: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "component_id": self.component_id,
            "parent_id": self.parent_id,
            "state": self.state,
            "local_transform": self.local_transform.as_dict(),
            "world_transform": self.world_transform.as_dict(),
            "anchors": {name: value.as_dict() for name, value in sorted(self.anchors.items())},
            "growth_stage": self.growth_stage,
            "attributes": copy.deepcopy(self.attributes),
        }


@dataclass(slots=True)
class _MutableComponent:
    parent_id: str | None
    state: ComponentState
    local_transform: Transform2D
    anchors: dict[str, Transform2D]
    growth_stage: float
    attributes: dict[str, Any]


class ComponentTreeRuntime:
    def __init__(self, definitions: Iterable[ComponentDefinition | dict[str, Any]], events: Iterable[ComponentEvent | dict[str, Any]] = ()):
        raw_definitions = [copy.deepcopy(item) if isinstance(item, dict) else item for item in definitions]
        raw_events = [copy.deepcopy(item) if isinstance(item, dict) else item for item in events]
        self._definitions = tuple(item if isinstance(item, ComponentDefinition) else self._definition(item) for item in raw_definitions)
        self._events = tuple(item if isinstance(item, ComponentEvent) else self._event(item) for item in raw_events)
        ids = [item.component_id for item in self._definitions]
        if not ids:
            raise ComponentRuntimeError("Component tree cần ít nhất một component")
        if len(ids) != len(set(ids)):
            raise ComponentRuntimeError("component_id bị trùng")
        event_ids = [item.event_id for item in self._events]
        if len(event_ids) != len(set(event_ids)):
            raise ComponentRuntimeError("event_id bị trùng")
        known = set(ids)
        for item in self._definitions:
            if item.parent_id is not None and item.parent_id not in known:
                raise ComponentRuntimeError(f"Parent component không tồn tại: {item.parent_id}")
        for item in self._events:
            if item.component_id not in known:
                raise ComponentRuntimeError(f"Event tham chiếu component không tồn tại: {item.component_id}")
            if item.parent_id is not _UNCHANGED and item.parent_id is not None and item.parent_id not in known:
                raise ComponentRuntimeError(f"Event parent không tồn tại: {item.parent_id}")
            if item.parent_id == item.component_id:
                raise ComponentRuntimeError("Component không thể làm parent của chính nó")
        baseline = self._fresh_state()
        self._validate_graph(baseline)
        # Validate every topology boundary at construction time so a bad event
        # cannot hide until a particular frame is rendered.
        for event in sorted(self._events, key=lambda item: (item.time, item.event_id)):
            self._apply_event(baseline, event)
            self._validate_graph(baseline)

    @staticmethod
    def _definition(value: dict[str, Any]) -> ComponentDefinition:
        if not isinstance(value, dict):
            raise ComponentRuntimeError("Component definition phải là object")
        allowed = {"component_id", "parent_id", "state", "local_transform", "anchors", "growth_stage", "attributes"}
        unknown = set(value) - allowed
        if unknown:
            raise ComponentRuntimeError(f"Component definition có field lạ: {sorted(unknown)}")
        return ComponentDefinition(**value)

    @staticmethod
    def _event(value: dict[str, Any]) -> ComponentEvent:
        if not isinstance(value, dict):
            raise ComponentRuntimeError("Component event phải là object")
        allowed = {"event_id", "component_id", "time", "parent_id", "state", "local_transform", "growth_stage", "preserve_world"}
        unknown = set(value) - allowed
        if unknown:
            raise ComponentRuntimeError(f"Component event có field lạ: {sorted(unknown)}")
        return ComponentEvent(**value)

    def _fresh_state(self) -> dict[str, _MutableComponent]:
        return {
            item.component_id: _MutableComponent(
                parent_id=item.parent_id,
                state=item.state,
                local_transform=item.local_transform,
                anchors=copy.deepcopy(item.anchors),
                growth_stage=item.growth_stage,
                attributes=copy.deepcopy(item.attributes),
            )
            for item in self._definitions
        }

    @staticmethod
    def _validate_graph(state: dict[str, _MutableComponent]) -> None:
        for component_id in state:
            visiting: set[str] = set()
            current: str | None = component_id
            while current is not None:
                if current in visiting:
                    raise ComponentRuntimeError(f"Component cycle tại {current}")
                visiting.add(current)
                current = state[current].parent_id

    @staticmethod
    def _world_transform(state: dict[str, _MutableComponent], component_id: str, memo: dict[str, Transform2D] | None = None) -> Transform2D:
        memo = memo if memo is not None else {}
        if component_id in memo:
            return memo[component_id]
        item = state[component_id]
        world = item.local_transform
        if item.parent_id is not None:
            world = ComponentTreeRuntime._world_transform(state, item.parent_id, memo).compose(item.local_transform)
        memo[component_id] = world
        return world

    @classmethod
    def _apply_event(cls, state: dict[str, _MutableComponent], event: ComponentEvent) -> None:
        item = state[event.component_id]
        new_parent = item.parent_id if event.parent_id is _UNCHANGED else event.parent_id
        if event.parent_id is not _UNCHANGED and event.preserve_world:
            before = cls._world_transform(state, event.component_id)
            if new_parent is None:
                item.local_transform = before
            else:
                parent_world = cls._world_transform(state, new_parent)
                item.local_transform = before.relative_to(parent_world)
        item.parent_id = new_parent
        if event.local_transform is not None:
            item.local_transform = event.local_transform
        if event.state is not None:
            item.state = event.state
        if event.growth_stage is not None:
            item.growth_stage = event.growth_stage

    def sample(self, seconds: float) -> dict[str, ComponentSample]:
        time = _finite(seconds, "seconds")
        if time < 0:
            raise ComponentRuntimeError("seconds không được âm")
        state = self._fresh_state()
        for event in sorted(self._events, key=lambda item: (item.time, item.event_id)):
            if event.time > time:
                break
            self._apply_event(state, event)
        self._validate_graph(state)
        memo: dict[str, Transform2D] = {}
        result: dict[str, ComponentSample] = {}
        for component_id in sorted(state):
            item = state[component_id]
            world = self._world_transform(state, component_id, memo)
            anchors = {name: world.compose(transform) for name, transform in item.anchors.items()}
            result[component_id] = ComponentSample(
                component_id=component_id,
                parent_id=item.parent_id,
                state=item.state,
                local_transform=item.local_transform,
                world_transform=world,
                anchors=anchors,
                growth_stage=item.growth_stage,
                attributes=copy.deepcopy(item.attributes),
            )
        return result

    def snapshot(self, seconds: float) -> dict[str, dict[str, Any]]:
        return {component_id: sample.as_dict() for component_id, sample in self.sample(seconds).items()}


__all__ = [
    "ComponentDefinition",
    "ComponentEvent",
    "ComponentRuntimeError",
    "ComponentSample",
    "ComponentTreeRuntime",
    "Transform2D",
]
