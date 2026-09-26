"""What a compiled storyboard still needs before native-vector-v1 can draw it (UV-800).

``storyboard_migration`` carries a v1 native story **up** into v2 and back down
again losslessly, because it keeps the original payload in an extension.  A
storyboard that came the other way — compiled from analysis by UV-304 — has no
such payload, so ``restore_v1_from_v2`` refuses it with one opaque message.

That refusal is correct but useless to a caller: it says *no* without saying
*what is missing*.  This module answers the second question, field by field:

* which entities have no asset in the native catalog;
* which scenes have no canvas poses, which the v1 engine cannot invent;
* which actions are not in the catalog, or are but not for those assets;
* which scenes have no background preset.

The report is the honest `needs_review` reason UV-802 will hand back to a user,
and the work list UV-805 will hand to the asset resolver.  Nothing here renders
or repairs anything: it only states what is not yet possible.
"""

from __future__ import annotations

import copy
import unicodedata
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from bkt_web.storyboard_migration import NATIVE_RENDERER, V1_STORY_EXTENSION
from bkt_web.universal_storyboard import UniversalStoryboardV2, validate_storyboard_v2


BRIDGE_SCHEMA = "tokmatrix.native-vector-bridge/v1"

GAP_CODES = (
    "ENTITY_HAS_NO_ASSET",
    "SCENE_HAS_NO_POSES",
    "SCENE_HAS_NO_BACKGROUND",
    "ACTION_NOT_IN_CATALOG",
    "ACTION_ASSET_NOT_SUPPORTED",
    "ACTION_ACTOR_HAS_NO_ASSET",
)


class NativeBridgeError(ValueError):
    """Raised when a storyboard cannot even be inspected for the bridge."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise NativeBridgeError(message)


def _fold(value: str) -> str:
    """Lowercase and strip accents so 'Quả cà chua' matches 'qua ca chua'."""
    decomposed = unicodedata.normalize("NFD", value.lower())
    return "".join(character for character in decomposed if unicodedata.category(character) != "Mn").strip()


@dataclass(frozen=True, slots=True)
class BridgeGap:
    code: str
    path: str
    detail: str
    subject_id: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "path": self.path, "detail": self.detail, "subject_id": self.subject_id}


@dataclass(frozen=True, slots=True)
class EntityBinding:
    entity_id: str
    scene_id: str
    label: str
    observed_category: str | None
    asset_id: str | None
    matched_by: str | None

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class BridgeReport:
    project_id: str
    carries_v1_payload: bool
    renderable: bool
    bindings: tuple[EntityBinding, ...]
    gaps: tuple[BridgeGap, ...]

    @property
    def unbound_entity_ids(self) -> tuple[str, ...]:
        return tuple(item.entity_id for item in self.bindings if item.asset_id is None)

    def codes(self) -> tuple[str, ...]:
        return tuple(sorted({item.code for item in self.gaps}))

    def reason(self) -> str:
        """One line a pipeline can put in a needs_review record."""
        if self.renderable:
            return "native-vector-v1 có thể dựng storyboard này"
        counts: dict[str, int] = {}
        for item in self.gaps:
            counts[item.code] = counts.get(item.code, 0) + 1
        listed = ", ".join(f"{code}×{count}" for code, count in sorted(counts.items()))
        return f"native-vector-v1 chưa dựng được: {listed}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": BRIDGE_SCHEMA,
            "project_id": self.project_id,
            "carries_v1_payload": self.carries_v1_payload,
            "renderable": self.renderable,
            "reason": self.reason(),
            "bindings": [item.as_dict() for item in self.bindings],
            "gaps": [item.as_dict() for item in self.gaps],
        }


def _asset_index(native_catalog: dict[str, Any]) -> dict[str, str]:
    """Lookup from an id, a folded label and a group name to an asset id."""
    index: dict[str, str] = {}
    groups: dict[str, list[str]] = {}
    for asset_id, spec in native_catalog["assets"].items():
        index[_fold(asset_id)] = asset_id
        index[_fold(asset_id.replace("_", " "))] = asset_id
        index[_fold(str(spec.get("label", "")))] = asset_id
        groups.setdefault(_fold(str(spec.get("group", ""))), []).append(asset_id)
    for group, members in groups.items():
        # A group name only resolves when it names exactly one asset; "fruit"
        # must not silently pick a tomato.
        if len(members) == 1 and group not in index:
            index[group] = members[0]
    index.pop("", None)
    return index


def _bind_entity(entity: Any, index: dict[str, str]) -> tuple[str | None, str | None]:
    label = _fold(entity.label or "")
    if label in index:
        return index[label], "label"
    for word in reversed(label.split()):
        if word in index:
            return index[word], "label_word"
    category = _fold(str(entity.attributes.get("observed_category", "")))
    if category and category in index:
        return index[category], "observed_category"
    kind = _fold(entity.kind)
    if kind in index:
        return index[kind], "kind"
    return None, None


def inspect_native_bridge(
    storyboard: dict[str, Any] | UniversalStoryboardV2,
    *,
    native_catalog: dict[str, Any] | None = None,
) -> BridgeReport:
    """List everything native-vector-v1 would still need for this storyboard."""
    project = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    if native_catalog is None:
        from bkt_web.remake_vector import catalog

        native_catalog = catalog()
    _require(isinstance(native_catalog, dict) and "assets" in native_catalog, "catalog không hợp lệ")

    extensions = project.extensions or {}
    carries_payload = isinstance(extensions.get(V1_STORY_EXTENSION), dict)
    if carries_payload:
        # A storyboard migrated up from v1 already holds its own native story,
        # so the bridge has nothing to ask for.
        return BridgeReport(
            project_id=project.project_id,
            carries_v1_payload=True,
            renderable=True,
            bindings=(),
            gaps=(),
        )

    index = _asset_index(native_catalog)
    actions = native_catalog.get("actions", {})
    backgrounds = set(native_catalog.get("backgrounds", {}))
    bindings: list[EntityBinding] = []
    gaps: list[BridgeGap] = []
    asset_of: dict[str, str | None] = {}

    for scene_index, scene in enumerate(project.scenes):
        base = f"$.scenes[{scene_index}]"
        for entity_index, entity in enumerate(scene.entities):
            asset_id, matched_by = _bind_entity(entity, index)
            asset_of[entity.entity_id] = asset_id
            bindings.append(EntityBinding(
                entity_id=entity.entity_id,
                scene_id=scene.scene_id,
                label=entity.label or "",
                observed_category=entity.attributes.get("observed_category"),
                asset_id=asset_id,
                matched_by=matched_by,
            ))
            if asset_id is None:
                gaps.append(BridgeGap(
                    code="ENTITY_HAS_NO_ASSET",
                    path=f"{base}.entities[{entity_index}]",
                    detail=f"'{entity.label or entity.entity_id}' ({entity.kind}) không khớp asset nào trong catalog",
                    subject_id=entity.entity_id,
                ))

        # The v1 engine needs canvas coordinates; it cannot invent a layout.
        posed = [
            entity.entity_id
            for entity in scene.entities
            if isinstance(entity.attributes.get("poses"), list) and entity.attributes["poses"]
        ]
        if scene.entities and not posed:
            gaps.append(BridgeGap(
                code="SCENE_HAS_NO_POSES",
                path=f"{base}.entities[*].attributes.poses",
                detail="không có toạ độ canvas cho entity nào; native-vector-v1 không tự bố cục",
                subject_id=scene.scene_id,
            ))

        preset = None
        if scene.environment is not None:
            preset = scene.environment.attributes.get("preset") or scene.environment.kind
        if preset is None or _fold(str(preset)) not in {_fold(item) for item in backgrounds}:
            gaps.append(BridgeGap(
                code="SCENE_HAS_NO_BACKGROUND",
                path=f"{base}.environment",
                detail=f"bối cảnh '{preset}' không có trong catalog backgrounds" if preset else "scene chưa khai bối cảnh",
                subject_id=scene.scene_id,
            ))

        for action_index, action in enumerate(scene.actions):
            apath = f"{base}.actions[{action_index}]"
            native_action = action.type.replace(".", "_")
            spec = actions.get(native_action)
            if spec is None:
                gaps.append(BridgeGap(
                    code="ACTION_NOT_IN_CATALOG",
                    path=apath,
                    detail=f"action '{action.type}' không có trong catalog",
                    subject_id=action.action_id,
                ))
                continue
            actor_asset = asset_of.get(action.actor_ids[0]) if action.actor_ids else None
            if actor_asset is None:
                gaps.append(BridgeGap(
                    code="ACTION_ACTOR_HAS_NO_ASSET",
                    path=f"{apath}.actor_ids[0]",
                    detail=f"actor của '{action.type}' chưa có asset nên không kiểm được hỗ trợ",
                    subject_id=action.action_id,
                ))
                continue
            if actor_asset not in spec.get("actors", []):
                gaps.append(BridgeGap(
                    code="ACTION_ASSET_NOT_SUPPORTED",
                    path=f"{apath}.actor_ids[0]",
                    detail=f"asset '{actor_asset}' không nằm trong actors của action '{native_action}'",
                    subject_id=action.action_id,
                ))
            targets = spec.get("targets", [])
            for position, target_id in enumerate(action.target_ids):
                target_asset = asset_of.get(target_id)
                if target_asset is not None and targets and target_asset not in targets:
                    gaps.append(BridgeGap(
                        code="ACTION_ASSET_NOT_SUPPORTED",
                        path=f"{apath}.target_ids[{position}]",
                        detail=f"asset '{target_asset}' không nằm trong targets của action '{native_action}'",
                        subject_id=action.action_id,
                    ))

    ordered = tuple(sorted(gaps, key=lambda item: (item.path, item.code)))
    return BridgeReport(
        project_id=project.project_id,
        carries_v1_payload=False,
        renderable=not ordered,
        bindings=tuple(sorted(bindings, key=lambda item: (item.scene_id, item.entity_id))),
        gaps=ordered,
    )


def assert_round_trip_preserves_source_facts(original: dict[str, Any], restored: dict[str, Any]) -> list[str]:
    """Differences in the facts a remake may never change, between two v1 stories.

    Used to prove a v1 → v2 → v1 migration kept scene times, speaker identity
    and actions; an empty list means nothing a viewer would notice moved.
    """
    _require(isinstance(original, dict) and isinstance(restored, dict), "cần hai story v1 dạng object")
    problems: list[str] = []

    if len(original.get("scenes", [])) != len(restored.get("scenes", [])):
        problems.append(f"số scene đổi: {len(original.get('scenes', []))} → {len(restored.get('scenes', []))}")
    else:
        for index, (before, after) in enumerate(zip(original["scenes"], restored["scenes"])):
            for field_name in ("start_time", "end_time"):
                if before.get(field_name) != after.get(field_name):
                    problems.append(f"scenes[{index}].{field_name}: {before.get(field_name)} → {after.get(field_name)}")
            if sorted(before.get("characters_present", [])) != sorted(after.get("characters_present", [])):
                problems.append(f"scenes[{index}].characters_present đổi")
            if len(before.get("actions", [])) != len(after.get("actions", [])):
                problems.append(f"scenes[{index}].actions: mất hoặc thêm action")

    def speakers(story: dict[str, Any]) -> list[tuple[Any, Any, Any]]:
        return [
            (cue.get("character_id") or cue.get("speaker") or cue.get("speaker_id"), cue.get("start"), cue.get("text"))
            for cue in story.get("cues", [])
        ]

    if speakers(original) != speakers(restored):
        problems.append("cue speaker/thời điểm/lời thoại đổi")

    if [item.get("id") for item in original.get("characters", [])] != [item.get("id") for item in restored.get("characters", [])]:
        problems.append("danh sách character id đổi")
    if original.get("duration") != restored.get("duration"):
        problems.append(f"duration: {original.get('duration')} → {restored.get('duration')}")
    return problems


__all__ = [
    "BRIDGE_SCHEMA",
    "BridgeGap",
    "BridgeReport",
    "EntityBinding",
    "GAP_CODES",
    "NATIVE_RENDERER",
    "NativeBridgeError",
    "assert_round_trip_preserves_source_facts",
    "inspect_native_bridge",
]
