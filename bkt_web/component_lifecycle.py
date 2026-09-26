"""Storyboard-v2 attach/detach lifecycle compiler (UV-201).

Lifecycle actions compile to absolute-time :class:`ComponentEvent` values.
Transitions happen at ``action.end`` and preserve the world transform by
default, which prevents visual jumps at detach/attach boundaries.
"""

from __future__ import annotations

import copy
from typing import Any

from bkt_web.component_runtime import ComponentDefinition, ComponentEvent, ComponentRuntimeError, ComponentTreeRuntime, Transform2D
from bkt_web.universal_storyboard import Scene, UniversalStoryboardV2, validate_storyboard_v2


LIFECYCLE_ACTIONS = {"attach", "detach", "pluck", "cut-detach", "join"}
INTERACTION_LIFECYCLE_ACTIONS = {"grip", "carry", "place", "release"}


def _component_index(scene: Scene) -> tuple[dict[str, Any], dict[str, str]]:
    components: dict[str, Any] = {}
    entity_for_component: dict[str, str] = {}
    for entity in scene.entities:
        for component in entity.components:
            components[component.component_id] = component
            entity_for_component[component.component_id] = entity.entity_id
    return components, entity_for_component


def _anchor_transforms(component: Any) -> dict[str, Transform2D]:
    declared = component.attributes.get("anchor_transforms", {})
    if not isinstance(declared, dict):
        raise ComponentRuntimeError(f"{component.component_id}.anchor_transforms phải là object")
    output: dict[str, Transform2D] = {}
    for anchor in component.anchors:
        value = declared.get(anchor.anchor_id, declared.get(anchor.name, {}))
        transform = Transform2D.from_value(value, f"{component.component_id}.anchor.{anchor.name}")
        output[anchor.name] = transform
        output[anchor.anchor_id] = transform
    return output


def component_definitions(scene: Scene) -> list[ComponentDefinition]:
    """Compile v2 component declarations into runtime definitions."""
    output = []
    for entity in scene.entities:
        for component in entity.components:
            transform = component.attributes.get("transform", {})
            growth_stage = component.attributes.get("growth_stage", 0)
            output.append(ComponentDefinition(
                component_id=component.component_id,
                parent_id=component.parent_component_id,
                state=component.state,
                local_transform=Transform2D.from_value(transform, f"{component.component_id}.transform"),
                anchors=_anchor_transforms(component),
                growth_stage=growth_stage,
                attributes={
                    "entity_id": entity.entity_id,
                    "kind": component.kind,
                    **copy.deepcopy(component.attributes),
                },
            ))
    return output


def _target_component(action: Any, components: dict[str, Any], *, required: bool = True) -> str | None:
    explicit = action.parameters.get("component_id")
    candidates = [explicit, *action.target_ids]
    matches = [value for value in candidates if isinstance(value, str) and value in components]
    if not matches and not required:
        return None
    if len(set(matches)) != 1:
        raise ComponentRuntimeError(f"{action.action_id}: lifecycle action cần đúng một component target")
    return matches[0]


def lifecycle_events(scene: Scene) -> list[ComponentEvent]:
    """Compile lifecycle actions without changing the scene or its actions."""
    components, _entity_for_component = _component_index(scene)
    output: list[ComponentEvent] = []
    for action in scene.actions:
        if action.type not in LIFECYCLE_ACTIONS | INTERACTION_LIFECYCLE_ACTIONS:
            continue
        component_id = _target_component(action, components, required=action.type in LIFECYCLE_ACTIONS)
        # Existing v1-derived grip/carry/place actions target whole entities.
        # They remain owned by the entity runtime until a component target or
        # parameters.component_id is explicitly supplied.
        if component_id is None:
            continue
        preserve_world = action.parameters.get("preserve_world", True)
        if not isinstance(preserve_world, bool):
            raise ComponentRuntimeError(f"{action.action_id}.preserve_world phải là boolean")
        transform_value = action.parameters.get("local_transform")
        transform = Transform2D.from_value(transform_value, f"{action.action_id}.local_transform") if transform_value is not None else None
        if action.type in {"attach", "join", "grip", "carry"}:
            parent_id = action.parameters.get("parent_component_id", action.parameters.get("actor_component_id"))
            if not isinstance(parent_id, str) or parent_id not in components:
                raise ComponentRuntimeError(f"{action.action_id}: parent_component_id không tồn tại")
            state = "attached"
        else:
            parent_id = None
            state = "damaged" if action.type == "cut-detach" else "detached"
        output.append(ComponentEvent(
            event_id=action.action_id,
            component_id=component_id,
            time=action.end,
            parent_id=parent_id,
            state=state,
            local_transform=transform,
            preserve_world=preserve_world,
        ))
    return output


def runtime_for_scene(scene: Scene) -> ComponentTreeRuntime:
    return ComponentTreeRuntime(component_definitions(scene), lifecycle_events(scene))


def sample_storyboard_components(
    storyboard: dict[str, Any] | UniversalStoryboardV2,
    scene_id: str,
    seconds: float,
) -> dict[str, dict[str, Any]]:
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    scene = next((item for item in model.scenes if item.scene_id == scene_id), None)
    if scene is None:
        raise ComponentRuntimeError(f"Scene không tồn tại: {scene_id}")
    if seconds < scene.start or seconds > scene.end:
        raise ComponentRuntimeError("Timestamp nằm ngoài scene")
    return runtime_for_scene(scene).snapshot(seconds)


__all__ = [
    "INTERACTION_LIFECYCLE_ACTIONS",
    "LIFECYCLE_ACTIONS",
    "component_definitions",
    "lifecycle_events",
    "runtime_for_scene",
    "sample_storyboard_components",
]
