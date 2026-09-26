"""Lossless migration between native-vector v1 stories and Storyboard v2.

The v2 projection is renderer neutral and queryable by the capability router.
The original validated v1 document is also retained in a namespaced extension
so the native adapter can round-trip every renderer-specific pose field without
guessing or weakening the v2 core contract.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any

from bkt_web.universal_storyboard import UniversalStoryboardV2, validate_storyboard_v2


MIGRATION_VERSION = "1.0.0"
V1_STORY_EXTENSION = "com.ssmatool.v1:story"
V1_HASH_EXTENSION = "com.ssmatool.v1:canonical_sha256"
V1_ID_EXTENSION = "com.ssmatool.v1:character_id"
V1_POSES_EXTENSION = "com.ssmatool.v1:poses"
V1_ACTION_EXTENSION = "com.ssmatool.v1:action"
V1_CUE_EXTENSION = "com.ssmatool.v1:cue"
NATIVE_RENDERER = "native-vector-v1"


class StoryboardMigrationError(ValueError):
    pass


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value)).hexdigest()


def _stable_id(*parts: Any) -> str:
    text = ":".join(str(part) for part in parts if str(part))
    text = re.sub(r"[^a-z0-9._:-]+", "-", text.lower()).strip("._:-")
    if not text or not text[0].isalpha():
        text = "id:" + text
    return text[:160].rstrip("._:-")


def _scene_id(story_id: str, index: int) -> str:
    return _stable_id("scene", story_id, index + 1)


def _entity_id(scene_id: str, character_id: str) -> str:
    return _stable_id(scene_id, "entity", character_id)


def _cue_scene(cue: dict[str, Any], scenes: list[dict[str, Any]]) -> int:
    matches = [
        index
        for index, scene in enumerate(scenes)
        if cue["start"] >= scene["start_time"] - 1e-6 and cue["end"] <= scene["end_time"] + 1e-6
    ]
    if len(matches) != 1:
        raise StoryboardMigrationError("Cue v1 phải nằm trọn trong đúng một scene; migration không tự chia lại timing")
    return matches[0]


def migrate_v1_to_v2(
    story: dict[str, Any],
    *,
    source_sha256: str | None = None,
    source_uri: str | None = None,
    created_at: str = "1970-01-01T00:00:00Z",
) -> dict[str, Any]:
    """Validate and migrate one native-vector v1 story without mutating it."""
    from bkt_web.remake_vector import catalog, validate_story

    original = copy.deepcopy(story)
    if isinstance(original.get("scenes"), list):
        for cue in original.get("cues", []):
            _cue_scene(cue, original["scenes"])
    validate_story(copy.deepcopy(original))
    if original.get("renderer") != NATIVE_RENDERER:
        raise StoryboardMigrationError("UV-102 chỉ migration storyboard native-vector-v1")
    source_hash = source_sha256 or _sha256(original)
    if not re.fullmatch(r"[a-f0-9]{64}", source_hash):
        raise StoryboardMigrationError("source_sha256 phải là 64 ký tự hex thường")

    story_id = _stable_id(original.get("id", "native-story"))
    project_id = _stable_id("project", story_id)
    source_id = _stable_id("source", story_id)
    provenance_id = _stable_id("provenance", story_id, "migration")
    render_plan_id = _stable_id("render-plan", story_id)
    native_catalog = catalog()
    characters = {item["id"]: item for item in original["characters"]}
    cues_by_scene: dict[int, list[dict[str, Any]]] = {index: [] for index in range(len(original["scenes"]))}
    for cue in original.get("cues", []):
        cues_by_scene[_cue_scene(cue, original["scenes"])].append(cue)

    v2_scenes: list[dict[str, Any]] = []
    visual_items: list[dict[str, Any]] = []
    dialogue_items: list[dict[str, Any]] = []
    selections: list[dict[str, Any]] = []

    for index, v1_scene in enumerate(original["scenes"]):
        scene_id = _scene_id(story_id, index)
        camera_id = _stable_id(scene_id, "camera")
        start, end = v1_scene["start_time"], v1_scene["end_time"]
        visual_items.append({
            "item_id": _stable_id("track-item", scene_id),
            "target_type": "scene",
            "target_id": scene_id,
            "start": start,
            "end": end,
            "layer": 0,
        })
        present = list(v1_scene.get("characters_present", []))
        cue_speakers = [
            cue.get("character_id") or cue.get("speaker") or cue.get("speaker_id")
            for cue in cues_by_scene[index]
            if not cue.get("offscreen")
        ]
        entity_source_ids = list(dict.fromkeys([*present, *(speaker for speaker in cue_speakers if speaker)]))
        entity_map = {cid: _entity_id(scene_id, cid) for cid in entity_source_ids}
        entities: list[dict[str, Any]] = []
        for cid in entity_source_ids:
            character = characters.get(cid, {"id": cid, "name": cid, "asset": "face", "face": False})
            asset_id = character["asset"]
            asset = native_catalog["assets"][asset_id]
            entity_id = entity_map[cid]
            root_component = _stable_id(entity_id, "component", "root")
            anchors = [
                {"anchor_id": _stable_id(entity_id, "anchor", name), "name": name, "semantic": name}
                for name in sorted(asset["anchors"])
            ]
            entity = {
                "entity_id": entity_id,
                "kind": asset["group"],
                "label": character.get("name", asset["label"]),
                "role": "speaker" if cid in cue_speakers else "actor",
                "components": [{
                    "component_id": root_component,
                    "kind": asset_id,
                    "state": "visible" if cid in present else "hidden",
                    "anchors": anchors,
                    "attributes": {"asset": asset_id},
                }],
                "attributes": {
                    "asset": asset_id,
                    "face": character.get("face", asset["face"]),
                    "style": copy.deepcopy(character.get("style", {})),
                    "v1_character_id": cid,
                },
                "provenance_id": provenance_id,
                "extensions": {
                    V1_ID_EXTENSION: cid,
                    V1_POSES_EXTENSION: copy.deepcopy(v1_scene.get("poses", {}).get(cid, [])),
                },
            }
            entities.append(entity)

        relations: list[dict[str, Any]] = []
        for cid in present:
            attachment = characters[cid].get("attach_to")
            if not attachment or attachment["id"] not in entity_map:
                continue
            relations.append({
                "relation_id": _stable_id(scene_id, "relation", "attached", cid),
                "type": "attached_to",
                "subject_id": entity_map[cid],
                "object_id": entity_map[attachment["id"]],
                "start": start,
                "end": end,
                "attributes": {"anchor": attachment["anchor"]},
                "provenance_id": provenance_id,
            })

        actions: list[dict[str, Any]] = []
        requirements: list[dict[str, Any]] = [{
            "requirement_id": _stable_id(scene_id, "requirement", "deterministic-seek"),
            "capability": "feature.deterministic_seek",
            "target_ids": [camera_id],
            "description": "Native v1 frame sampling must remain deterministic.",
        }]
        for action_index, v1_action in enumerate(v1_scene.get("actions", [])):
            action_id = _stable_id(scene_id, "action", action_index + 1, v1_action["type"])
            actor = v1_action.get("actor")
            target = v1_action.get("target")
            actor_ids = [entity_map[actor]] if actor in entity_map else ([entity_map[target]] if target in entity_map else [])
            if not actor_ids:
                raise StoryboardMigrationError(f"Scene {index}: action {v1_action['type']} không có actor/target hợp lệ")
            # Unary v1 actions such as ``grow`` have no actor.  They use the
            # target as a synthetic v2 actor to satisfy the generic Action
            # shape, but retain the same entity in target_ids so capability
            # matching still checks the target asset/action intersection.
            target_ids = [entity_map[target]] if target in entity_map else []
            actions.append({
                "action_id": action_id,
                "type": v1_action["type"],
                "actor_ids": actor_ids,
                "target_ids": target_ids,
                "start": v1_action["start"],
                "end": v1_action["end"],
                "parameters": {key: copy.deepcopy(value) for key, value in v1_action.items() if key not in {"type", "actor", "target", "start", "end"}},
                "provenance_id": provenance_id,
                "extensions": {V1_ACTION_EXTENSION: copy.deepcopy(v1_action)},
            })
            requirements.append({
                "requirement_id": _stable_id(scene_id, "requirement", "action", action_index + 1, v1_action["type"]),
                "capability": f"action.{v1_action['type']}",
                "target_ids": [action_id],
            })

        audio_events: list[dict[str, Any]] = []
        for cue_index, cue in enumerate(cues_by_scene[index]):
            speaker = cue.get("character_id") or cue.get("speaker") or cue.get("speaker_id")
            event_id = _stable_id(scene_id, "dialogue", cue_index + 1)
            event: dict[str, Any] = {
                "audio_event_id": event_id,
                "kind": "dialogue",
                "start": cue["start"],
                "end": cue["end"],
                "text": cue["text"],
                "language": cue.get("language", "vi"),
                "provenance_id": provenance_id,
                "extensions": {V1_CUE_EXTENSION: copy.deepcopy(cue)},
            }
            if speaker and speaker in entity_map:
                event["speaker_id"] = entity_map[speaker]
            elif not cue.get("offscreen"):
                raise StoryboardMigrationError(f"Scene {index}: speaker {speaker!r} không tồn tại")
            else:
                # The v2 core requires a speaker for dialogue. Offscreen cues with
                # no entity are represented as custom audio while the lossless
                # extension retains the original cue identity.
                event["kind"] = "custom"
            audio_events.append(event)
            dialogue_items.append({
                "item_id": _stable_id("track-item", event_id),
                "target_type": "audio_event",
                "target_id": event_id,
                "start": cue["start"],
                "end": cue["end"],
                "layer": 0,
            })

        camera_keys = copy.deepcopy(v1_scene.get("camera", []))
        scene_extensions = {"com.ssmatool.v1:scene": copy.deepcopy(v1_scene)}
        scene = {
            "scene_id": scene_id,
            "start": start,
            "end": end,
            "summary": v1_scene.get("text") or f"Migrated native-vector scene {index + 1}",
            "entities": entities,
            "relations": relations,
            "actions": actions,
            "constraints": [],
            "camera": {
                "camera_id": camera_id,
                "shots": [{
                    "shot_id": _stable_id(scene_id, "shot", 1),
                    "start": start,
                    "end": end,
                    "framing": "custom",
                    "movement": "custom" if len(camera_keys) > 1 else "static",
                    "subject_ids": [entity_map[cid] for cid in present],
                    "parameters": {"v1_keyframes": camera_keys},
                    "provenance_id": provenance_id,
                }],
            },
            "environment": {
                "environment_id": _stable_id(scene_id, "environment"),
                "kind": _stable_id(v1_scene.get("background", {}).get("preset", "unspecified")).replace(":", "-"),
                "attributes": copy.deepcopy(v1_scene.get("background", {})),
            },
            "audio_events": audio_events,
            "render_requirements": {"required": requirements, "preferred": [], "optional": []},
            "provenance_id": provenance_id,
            "extensions": scene_extensions,
        }
        v2_scenes.append(scene)
        requirement_ids = [item["requirement_id"] for item in requirements]
        selections.append({
            "selection_id": _stable_id(scene_id, "selection", NATIVE_RENDERER),
            "scene_id": scene_id,
            "start": start,
            "end": end,
            "renderer_id": NATIVE_RENDERER,
            "renderer_version": native_catalog["version"],
            "status": "selected",
            "satisfied_requirement_ids": requirement_ids,
            "fallback_ids": [],
            "explanation": "Lossless migration preserves the validated native-vector-v1 route.",
        })

    tracks = [{"track_id": _stable_id("track", story_id, "visual"), "kind": "visual", "items": visual_items}]
    if dialogue_items:
        tracks.append({"track_id": _stable_id("track", story_id, "dialogue"), "kind": "dialogue", "items": dialogue_items})
    source: dict[str, Any] = {"source_id": source_id, "sha256": source_hash, "media_type": "application/json"}
    if source_uri is not None:
        source["uri"] = source_uri
    result = {
        "schema_version": "2.0.0",
        "project_id": project_id,
        "title": original.get("name") or original.get("id"),
        "source": source,
        "duration_seconds": original["duration"],
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
        "tracks": tracks,
        "scenes": v2_scenes,
        "render_plan": {"render_plan_id": render_plan_id, "status": "routable", "selections": selections, "fallbacks": []},
        "provenance": [{
            "provenance_id": provenance_id,
            "kind": "migrated",
            "created_at": created_at,
            "agent": "bkt_web.storyboard_migration",
            "tool_version": MIGRATION_VERSION,
            "source_refs": [source_id],
            "evidence": [],
        }],
        "extensions": {
            V1_STORY_EXTENSION: original,
            V1_HASH_EXTENSION: _sha256(original),
        },
    }
    validated = validate_storyboard_v2(result)
    if story != original:
        raise AssertionError("migration mutated its input")
    return validated.model_dump(mode="json", exclude_none=True)


def restore_v1_from_v2(storyboard: dict[str, Any] | UniversalStoryboardV2) -> dict[str, Any]:
    """Restore the exact validated v1 payload retained by the migration."""
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    extensions = model.extensions or {}
    value = extensions.get(V1_STORY_EXTENSION)
    expected = extensions.get(V1_HASH_EXTENSION)
    if not isinstance(value, dict) or not isinstance(expected, str):
        raise StoryboardMigrationError("Storyboard v2 không chứa payload migration v1")
    if _sha256(value) != expected:
        raise StoryboardMigrationError("Payload v1 trong extension không khớp checksum")
    from bkt_web.remake_vector import validate_story

    restored = copy.deepcopy(value)
    validate_story(copy.deepcopy(restored))
    return restored


def compile_v2_to_native_vector(storyboard: dict[str, Any] | UniversalStoryboardV2) -> dict[str, Any]:
    """Compile a losslessly migrated v2 project for the existing native engine."""
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    active = [selection for selection in model.render_plan.selections if selection.status == "selected"]
    if not active or any(selection.renderer_id != NATIVE_RENDERER for selection in active):
        raise StoryboardMigrationError("Render plan không chọn native-vector-v1 cho toàn bộ route đang active")
    return restore_v1_from_v2(model)


__all__ = [
    "MIGRATION_VERSION",
    "StoryboardMigrationError",
    "compile_v2_to_native_vector",
    "migrate_v1_to_v2",
    "restore_v1_from_v2",
]
