from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from functools import lru_cache
from typing import Any


REGISTRY_SCHEMA = "tokmatrix.capability-registry/v1"
_KINDS = {"feature", "action", "material", "effect", "entity", "asset", "anchor", "fidelity", "media"}
_SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
_RANGE_PART = re.compile(r"^(>=|<=|>|<|==|=)?(.+)$")


def _canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def _semver(value: str, label: str) -> tuple[Any, ...]:
    if not isinstance(value, str):
        raise ValueError(f"{label}: semantic version không hợp lệ")
    match = _SEMVER.fullmatch(value)
    if not match:
        raise ValueError(f"{label}: semantic version không hợp lệ")
    major, minor, patch, prerelease, _build = match.groups()
    if prerelease is None:
        prekey: tuple[Any, ...] = ((2, ""),)
    else:
        identifiers = prerelease.split(".")
        if any(identifier.isdigit() and len(identifier) > 1 and identifier.startswith("0") for identifier in identifiers):
            raise ValueError(f"{label}: semantic version không hợp lệ")
        prekey = tuple((0, int(identifier)) if identifier.isdigit() else (1, identifier) for identifier in identifiers)
    return int(major), int(minor), int(patch), prekey


def _version_satisfies(version: str, requirement: dict[str, Any]) -> tuple[bool, str | None]:
    current = _semver(version, "capability.version")
    if "minimum_version" in requirement and current < _semver(requirement["minimum_version"], "minimum_version"):
        return False, "version_too_low"
    expression = requirement.get("version_range")
    if expression is None:
        return True, None
    if not isinstance(expression, str) or not expression.strip():
        raise ValueError("version_range không hợp lệ")
    for raw in expression.split(","):
        match = _RANGE_PART.fullmatch(raw.strip())
        if not match:
            raise ValueError("version_range không hợp lệ")
        operator, expected_text = match.groups()
        expected = _semver(expected_text, "version_range")
        operator = operator or "=="
        passed = {
            ">=": current >= expected,
            "<=": current <= expected,
            ">": current > expected,
            "<": current < expected,
            "==": current == expected,
            "=": current == expected,
        }[operator]
        if not passed:
            return False, "version_out_of_range"
    return True, None


def _string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        raise ValueError(f"{label}: cần danh sách ID")
    if len(value) != len(set(value)):
        raise ValueError(f"{label}: ID bị trùng")
    return value


def validate_registry(document: dict[str, Any]) -> None:
    if not isinstance(document, dict) or document.get("schema") != REGISTRY_SCHEMA:
        raise ValueError("Registry schema không được hỗ trợ")
    _semver(document.get("version"), "registry.version")
    sections = ("renderers", "assets", "actions", "materials", "effects", "fallbacks")
    for section in sections:
        entries = document.get(section, {} if section == "fallbacks" else None)
        if not isinstance(entries, dict):
            raise ValueError(f"registry.{section}: cần object")
        for stable_id, entry in entries.items():
            if not isinstance(stable_id, str) or not stable_id or not isinstance(entry, dict):
                raise ValueError(f"registry.{section}: entry không hợp lệ")
            if entry.get("id") != stable_id:
                raise ValueError(f"registry.{section}.{stable_id}: stable ID không khớp")
            _semver(entry.get("version"), f"registry.{section}.{stable_id}.version")
    actions, materials, effects = set(document["actions"]), set(document["materials"]), set(document["effects"])
    fallback_ids = set(document.get("fallbacks", {}))
    for renderer_id, renderer in document["renderers"].items():
        features, supports = renderer.get("features"), renderer.get("supports")
        if not isinstance(features, dict) or any(not isinstance(key, str) or not isinstance(value, bool) for key, value in features.items()):
            raise ValueError(f"renderer.{renderer_id}.features không hợp lệ")
        if not isinstance(supports, dict):
            raise ValueError(f"renderer.{renderer_id}.supports cần object")
        for key in ("entities", "actions", "materials", "effects"):
            _string_list(supports.get(key, []), f"renderer.{renderer_id}.supports.{key}")
        if not set(supports["actions"]).issubset(actions) or not set(supports["materials"]).issubset(materials) or not set(supports["effects"]).issubset(effects):
            raise ValueError(f"renderer.{renderer_id}: capability reference không tồn tại")
        _string_list(renderer.get("media", []), f"renderer.{renderer_id}.media")
        _string_list(renderer.get("fallbacks", []), f"renderer.{renderer_id}.fallbacks")
        if not set(renderer.get("fallbacks", [])).issubset(fallback_ids):
            raise ValueError(f"renderer.{renderer_id}: fallback reference không tồn tại")
        fidelity = renderer.get("fidelity", {})
        if not isinstance(fidelity, dict):
            raise ValueError(f"renderer.{renderer_id}.fidelity cần object")
        for key, value in fidelity.items():
            if not isinstance(key, str) or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError(f"renderer.{renderer_id}.fidelity.{key} cần số trong [0,1]")
        limits = renderer.get("limits", {})
        if not isinstance(limits, dict):
            raise ValueError(f"renderer.{renderer_id}.limits cần object")
        for key in ("max_entities_per_project", "max_scene_duration_seconds"):
            value = limits.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                raise ValueError(f"renderer.{renderer_id}.limits.{key} không hợp lệ")
        sizes = limits.get("canvas_sizes")
        if not isinstance(sizes, list) or any(not isinstance(size, list) or len(size) != 2 or any(isinstance(v, bool) or not isinstance(v, int) or v <= 0 for v in size) for size in sizes):
            raise ValueError(f"renderer.{renderer_id}.limits.canvas_sizes không hợp lệ")
    for action_id, action in document["actions"].items():
        for role in ("actors", "targets"):
            _string_list(action.get(role, []), f"action.{action_id}.{role}")
            if not set(action[role]).issubset(document["assets"]):
                raise ValueError(f"action.{action_id}.{role}: asset reference không tồn tại")
    for asset_id, asset in document["assets"].items():
        renderer_id = asset.get("renderer")
        if renderer_id not in document["renderers"]:
            raise ValueError(f"asset.{asset_id}: renderer không tồn tại")
        for key in ("entity_types", "anchors", "actions", "states"):
            _string_list(asset.get(key, []), f"asset.{asset_id}.{key}")
        if not set(asset["actions"]).issubset(actions):
            raise ValueError(f"asset.{asset_id}: action reference không tồn tại")
        if not set(asset["actions"]).issubset(document["renderers"][renderer_id]["supports"]["actions"]):
            raise ValueError(f"asset.{asset_id}: renderer không hỗ trợ action đã khai báo")
        expected_actions = {
            action_id
            for action_id, action in document["actions"].items()
            if asset_id in action["actors"] or asset_id in action["targets"]
        }
        if set(asset["actions"]) != expected_actions:
            raise ValueError(f"asset.{asset_id}: action intersection không khớp action registry")
        provenance = asset.get("provenance")
        if not isinstance(provenance, dict) or provenance.get("kind") not in {"built-in", "generated", "imported"} or not re.fullmatch(r"sha256:[0-9a-f]{64}", str(provenance.get("checksum", ""))):
            raise ValueError(f"asset.{asset_id}.provenance không hợp lệ")
    for fallback_id, fallback in document.get("fallbacks", {}).items():
        provides = fallback.get("provides", [])
        if not isinstance(provides, list) or any(not isinstance(item, dict) or item.get("kind") not in _KINDS or not isinstance(item.get("id"), str) or not item["id"] for item in provides):
            raise ValueError(f"fallback.{fallback_id}.provides không hợp lệ")
        conflicts = fallback.get("conflicts_with", [])
        if not isinstance(conflicts, list) or any(not isinstance(item, dict) or item.get("kind") not in _KINDS or not isinstance(item.get("id"), str) for item in conflicts):
            raise ValueError(f"fallback.{fallback_id}.conflicts_with không hợp lệ")
        cost = fallback.get("cost")
        if isinstance(cost, bool) or not isinstance(cost, (int, float)) or not math.isfinite(cost) or not 0 <= cost <= 1:
            raise ValueError(f"fallback.{fallback_id}.cost không hợp lệ")
        if not isinstance(fallback.get("requires_approval"), bool) or not isinstance(fallback.get("changes_fidelity_class"), bool) or not isinstance(fallback.get("disclosure"), str):
            raise ValueError(f"fallback.{fallback_id}: metadata không hợp lệ")


def validate_requirements(requirements: dict[str, Any]) -> None:
    if not isinstance(requirements, dict):
        raise ValueError("requirements cần object")
    seen: set[tuple[str, str, str]] = set()
    for tier in ("required", "preferred", "optional"):
        items = requirements.get(tier, [])
        if not isinstance(items, list):
            raise ValueError(f"requirements.{tier} cần danh sách")
        for index, item in enumerate(items):
            if not isinstance(item, dict) or item.get("kind") not in _KINDS or not isinstance(item.get("id"), str) or not item["id"]:
                raise ValueError(f"requirements.{tier}[{index}] không hợp lệ")
            identity = item["kind"], item["id"], str(item.get("entity", "")), str(item.get("actor", "")), str(item.get("target", ""))
            if identity in seen:
                raise ValueError("Một requirement không được xuất hiện ở nhiều tier")
            seen.add(identity)
            if item["kind"] == "anchor" and not isinstance(item.get("entity"), str):
                raise ValueError(f"requirements.{tier}[{index}].entity bị thiếu")
            if item["kind"] == "action":
                for role in ("actor", "target"):
                    if role in item and not isinstance(item[role], str):
                        raise ValueError(f"requirements.{tier}[{index}].{role} không hợp lệ")
            if "minimum" in item:
                value = item["minimum"]
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                    raise ValueError(f"requirements.{tier}[{index}].minimum cần số trong [0,1]")
            if "minimum_version" in item:
                _semver(item["minimum_version"], f"requirements.{tier}[{index}].minimum_version")
            if "version_range" in item:
                _version_satisfies("0.0.0", {"version_range": item["version_range"]})


def _asset_states(asset_id: str, group: str) -> list[str]:
    states = {"wet"}
    if group in {"fruit", "vegetable"}:
        states.update(("cut", "damage"))
        if asset_id in {
            "apple", "tomato", "pumpkin", "eggplant", "corn",
            "mango", "orange", "lime", "guava", "lychee", "rambutan", "mangosteen",
            "durian", "coconut", "avocado", "strawberry", "pineapple", "grape",
            "dragon_fruit", "starfruit", "jackfruit", "banana_fruit",
            "cucumber", "bitter_melon", "luffa", "bottle_gourd", "winter_melon",
            "passion_fruit", "chayote", "long_bean", "kiwi",
            "pear", "peach", "plum", "cherry", "persimmon", "blueberry",
            "raspberry", "apricot", "pomegranate", "olive",
            "kohlrabi", "potato", "sweet_potato", "cassava", "taro",
            "radish", "beet", "onion", "garlic", "ginger",
            "cauliflower", "broccoli", "okra", "chili", "mushroom",
        }:
            states.add("growth")
        if asset_id in {
            "watermelon", "apple", "tomato", "pumpkin", "eggplant", "corn",
            "mango", "orange", "lime", "guava", "lychee", "rambutan", "mangosteen",
            "durian", "coconut", "avocado", "strawberry", "pineapple",
            "dragon_fruit", "starfruit", "jackfruit", "banana_fruit",
            "cucumber", "bitter_melon", "luffa", "bottle_gourd", "winter_melon",
            "passion_fruit", "chayote", "long_bean", "kiwi",
            "pear", "peach", "plum", "cherry", "persimmon", "blueberry",
            "raspberry", "apricot", "pomegranate", "olive",
            "kohlrabi", "potato", "sweet_potato", "cassava", "taro",
            "radish", "beet", "onion", "garlic", "ginger",
            "cauliflower", "broccoli", "okra", "chili", "mushroom",
        }:
            states.add("slice")
    if group == "plant":
        states.update(("growth", "roots"))
        if asset_id in {"papaya_tree", "rice_plant", "corn_plant", "sunflower", "banana_tree", "cabbage", "grass_tuft", "rose", "lotus", "tulip", "daisy", "marigold", "hibiscus", "orchid", "peach_blossom", "apricot_blossom", "lily"}:
            states.add("cut")
        if asset_id in {"rice_plant", "corn_plant"}:
            states.add("bend")
        if asset_id in {
            "rice_plant", "corn_plant", "sunflower", "cabbage", "carrot", "grass_tuft", "rose", "lotus", "tulip", "daisy", "marigold", "hibiscus", "orchid", "peach_blossom", "apricot_blossom", "lily", "mango_tree", "orange_tree", "lime_tree", "apple_tree", "coconut_palm", "durian_tree", "jackfruit_tree", "lychee_tree", "rambutan_tree", "guava_tree", "avocado_tree", "dragon_fruit_cactus", "pineapple_plant", "strawberry_plant", "mangosteen_tree", "starfruit_tree", "cucumber_vine", "bitter_melon_vine", "luffa_vine", "bottle_gourd_vine", "winter_melon_vine", "passion_fruit_vine", "chayote_vine", "long_bean_vine", "grape_vine", "kiwi_vine", "persimmon_tree", "peach_tree", "pear_tree", "cherry_tree", "olive_tree",
            "kohlrabi_plant", "potato_plant", "sweet_potato_plant", "cassava_plant", "taro_plant", "radish_plant", "beet_plant", "onion_plant", "garlic_plant", "ginger_plant", "cauliflower_plant", "broccoli_plant", "lettuce", "napa_cabbage", "water_spinach", "mustard_greens", "spring_onion", "giant_radish",
        }:
            states.add("nutrients")
        if asset_id in {"mango_tree", "orange_tree", "lime_tree", "apple_tree", "coconut_palm", "durian_tree", "jackfruit_tree", "lychee_tree", "rambutan_tree", "guava_tree", "avocado_tree", "dragon_fruit_cactus", "pineapple_plant", "strawberry_plant", "mangosteen_tree", "starfruit_tree", "cucumber_vine", "bitter_melon_vine", "luffa_vine", "bottle_gourd_vine", "winter_melon_vine", "passion_fruit_vine", "chayote_vine", "long_bean_vine", "grape_vine", "kiwi_vine", "persimmon_tree", "peach_tree", "pear_tree", "cherry_tree", "olive_tree"}:
            states.add("fruits")
        if asset_id in {"tomato_plant", "peanut_plant"}:
            states.update(("bend", "nutrients"))
            branch_count = 10 if asset_id == "peanut_plant" else 7
            states.update(f"branch_{index}" for index in range(1, branch_count + 1))
        if asset_id == "peanut_bush":
            # peanut_field: bụi bị ép dẹt theo `bend` (cùng plantPoint của core).
            states.add("bend")
    if asset_id in {"hand", "hand_right"}:
        states.update(("hand_pose", "index", "middle", "pinky", "ring", "thumb", "wrist"))
    if asset_id in {"farmer", "fisherman", "farmer_woman"}:
        # The engine draws both through farmerSkeleton(), so they expose the
        # same joints; declaring fewer would make the router reject scenes the
        # renderer can actually draw.
        states.update(("arm", "hand_l_x", "hand_l_y", "hand_r_x", "hand_r_y", "wrist_l", "wrist_r"))
    if group == "fish":
        states.update(("hooked", "mouth"))
    if group == "monster":
        states.update(("jaw", "rage", "rise", "tentacle"))
    if asset_id == "bobber":
        states.add("swim")
    if asset_id in {"pot", "compost_bin"}:
        states.add("cutaway")
    if asset_id == "pot":
        states.add("nutrients")
    if asset_id in {"bucket", "basket", "wheelbarrow", "crate", "nest", "bowl", "fertilizer_sack"}:
        states.add("fill")
    if asset_id == "manure_pile":
        states.add("flies")
    if asset_id == "chem_cabinet":
        states.add("open")
    if asset_id == "soil_inset":
        states.add("growth")  # tia lạc đâm sâu rồi phình củ
    if asset_id == "soil_bed":
        states.add("cut")
    if asset_id == "egg":
        states.add("damage")
    if group == "rig":
        states.update(("expression", "look_x", "look_y"))
    return sorted(states)


@lru_cache(maxsize=1)
def _native_registry() -> dict[str, Any]:
    from bkt_web.remake_vector import catalog

    vector = catalog()
    assets: dict[str, Any] = {}
    for asset_id, spec in vector["assets"].items():
        supported_actions = sorted(action_id for action_id, action in vector["actions"].items() if asset_id in action["actors"] or asset_id in action["targets"])
        assets[asset_id] = {
            "id": asset_id,
            "version": vector["version"],
            "renderer": vector["renderer"],
            "entity_types": [spec["group"]],
            "anchors": sorted(spec["anchors"]),
            "actions": supported_actions,
            "states": _asset_states(asset_id, spec["group"]),
            "provenance": {"kind": "built-in", "checksum": _canonical_hash(spec)},
        }
    renderer_id = vector["renderer"]
    renderer = {
        "id": renderer_id,
        "version": vector["version"],
        "media": ["vector-2d"],
        "features": {"deterministic_seek": True, "offline_render": True, "alpha_output": False, "audio_tracks": False, "nested_compositions": False},
        "supports": {
            "entities": sorted({spec["group"] for spec in vector["assets"].values()}),
            "actions": sorted(vector["actions"]),
            "materials": [],
            "effects": ["rain", "spray"],
        },
        "fallbacks": [],
        "limits": {"max_entities_per_project": 64, "max_scene_duration_seconds": 1800, "canvas_sizes": [[vector["canvas"]["width"], vector["canvas"]["height"]]]},
        "fidelity": {"photorealism": 0, "character_motion": 0.65, "typography": 0.45},
    }
    actions = {
        key: {"id": key, "version": vector["version"], "actors": sorted(spec["actors"]), "targets": sorted(spec["targets"])}
        for key, spec in vector["actions"].items()
    }
    document = {
        "schema": REGISTRY_SCHEMA,
        "version": "1.0.0",
        "renderers": {renderer_id: renderer},
        "assets": assets,
        "actions": actions,
        "materials": {},
        "effects": {key: {"id": key, "version": "1.0.0"} for key in renderer["supports"]["effects"]},
        "fallbacks": {},
    }
    validate_registry(document)
    return document


def native_registry_document() -> dict[str, Any]:
    """The native-vector-v1 sub-document, without any adapter merged in."""
    return copy.deepcopy(_native_registry())


@lru_cache(maxsize=1)
def _merged_registry() -> dict[str, Any]:
    """Native capabilities plus every self-registering renderer adapter."""
    from bkt_web.renderer_adapters.registry import merge_adapter_capabilities

    return merge_adapter_capabilities(copy.deepcopy(_native_registry()))


def inspect_registry() -> dict[str, Any]:
    return copy.deepcopy(_merged_registry())


def _context_entity(document: dict[str, Any], context: dict[str, Any], entity_id: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    entity = context.get("entities", {}).get(entity_id)
    if not isinstance(entity, dict):
        return None, None
    return entity, document["assets"].get(entity.get("asset"))


def _capability_version(document: dict[str, Any], renderer: dict[str, Any], requirement: dict[str, Any], context: dict[str, Any]) -> str:
    kind, capability_id = requirement["kind"], requirement["id"]
    if kind in {"action", "material", "effect", "asset"}:
        section = "assets" if kind == "asset" else f"{kind}s"
        entry = document[section].get(capability_id)
        return entry["version"] if entry else renderer["version"]
    if kind == "anchor":
        _entity, asset = _context_entity(document, context, requirement["entity"])
        return asset["version"] if asset else renderer["version"]
    return renderer["version"]


def _evaluate(document: dict[str, Any], renderer: dict[str, Any], requirement: dict[str, Any], context: dict[str, Any]) -> tuple[bool, str | None]:
    kind, capability_id = requirement["kind"], requirement["id"]
    if kind == "feature":
        if renderer["features"].get(capability_id) is not True:
            return False, "unsupported_feature"
    elif kind == "media":
        if capability_id not in renderer["media"]:
            return False, "unsupported_media"
    elif kind in {"action", "material", "effect"}:
        section = f"{kind}s"
        if capability_id not in document[section]:
            return False, "unknown_capability"
        if capability_id not in renderer["supports"].get(section, []):
            return False, f"unsupported_{kind}"
        if kind == "action":
            action = document["actions"][capability_id]
            for role, allowed_key in (("actor", "actors"), ("target", "targets")):
                if role not in requirement:
                    continue
                entity, asset = _context_entity(document, context, requirement[role])
                if entity is None:
                    return False, "entity_not_found"
                if asset is None or asset["renderer"] != renderer["id"] or entity.get("asset") not in action[allowed_key] or capability_id not in asset["actions"]:
                    return False, "asset_action_unsupported"
    elif kind == "entity":
        if capability_id not in renderer["supports"].get("entities", []):
            return False, "unsupported_entity"
    elif kind == "fidelity":
        if capability_id not in renderer["fidelity"]:
            return False, "unknown_capability"
        if renderer["fidelity"][capability_id] < requirement.get("minimum", 0):
            return False, "below_minimum"
    elif kind == "asset":
        asset = document["assets"].get(capability_id)
        if asset is None:
            return False, "unknown_capability"
        if asset["renderer"] != renderer["id"]:
            return False, "asset_renderer_mismatch"
    elif kind == "anchor":
        entity, asset = _context_entity(document, context, requirement["entity"])
        if entity is None:
            return False, "entity_not_found"
        if asset is None or asset["renderer"] != renderer["id"]:
            return False, "asset_not_found"
        if capability_id not in asset["anchors"]:
            return False, "anchor_unsupported"
    else:
        raise ValueError(f"Capability kind không được hỗ trợ: {kind}")
    passed, reason = _version_satisfies(_capability_version(document, renderer, requirement, context), requirement)
    return passed, reason


def _limit_violations(renderer: dict[str, Any], context: dict[str, Any]) -> list[dict[str, Any]]:
    limits, violations = renderer["limits"], []
    entities = context.get("entities", {})
    if not isinstance(entities, dict):
        raise ValueError("context.entities cần object")
    if len(entities) > limits["max_entities_per_project"]:
        violations.append({"id": "max_entities_per_project", "reason": "limit_exceeded", "actual": len(entities), "limit": limits["max_entities_per_project"]})
    duration = context.get("scene_duration_seconds")
    if duration is not None:
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration < 0:
            raise ValueError("context.scene_duration_seconds không hợp lệ")
        if duration > limits["max_scene_duration_seconds"]:
            violations.append({"id": "max_scene_duration_seconds", "reason": "limit_exceeded", "actual": duration, "limit": limits["max_scene_duration_seconds"]})
    canvas = context.get("canvas_size")
    if canvas is not None:
        if not isinstance(canvas, list) or len(canvas) != 2 or any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in canvas):
            raise ValueError("context.canvas_size không hợp lệ")
        if canvas not in limits["canvas_sizes"]:
            violations.append({"id": "canvas_sizes", "reason": "limit_exceeded", "actual": canvas, "limit": limits["canvas_sizes"]})
    return violations


def _fallback_candidates(document: dict[str, Any], renderer: dict[str, Any], missing: list[dict[str, Any]], requirements: dict[str, Any]) -> list[dict[str, Any]]:
    required_pairs = {(item["kind"], item["id"]) for item in requirements.get("required", [])}
    output = []
    missing_pairs = {(item["kind"], item["id"]) for item in missing}
    for fallback_id in sorted(renderer.get("fallbacks", [])):
        fallback = document.get("fallbacks", {}).get(fallback_id)
        provided_pairs = {(item["kind"], item["id"]) for item in fallback["provides"]} if fallback else set()
        if not fallback or not missing_pairs.intersection(provided_pairs):
            continue
        conflict = any((item["kind"], item["id"]) in required_pairs for item in fallback.get("conflicts_with", []))
        output.append({
            "id": fallback_id,
            "eligible": not conflict,
            "reason": "fallback_conflicts_required_fidelity" if conflict else "fallback_available",
            "requires_approval": fallback["requires_approval"],
            "disclosure": fallback["disclosure"],
        })
    return output


def match_renderer(renderer_id: str, requirements: dict[str, Any], context: dict[str, Any] | None = None, *, registry: dict[str, Any] | None = None) -> dict[str, Any]:
    document = copy.deepcopy(registry) if registry is not None else inspect_registry()
    if "fallbacks" not in document:
        document["fallbacks"] = {}
    validate_registry(document)
    validate_requirements(requirements)
    context = copy.deepcopy(context or {})
    if renderer_id not in document["renderers"]:
        raise ValueError("Renderer không tồn tại trong registry")
    renderer = document["renderers"][renderer_id]
    matched: list[dict[str, Any]] = []
    missing_required: list[dict[str, Any]] = []
    missing_preferred: list[dict[str, Any]] = []
    missing_optional: list[dict[str, Any]] = []
    for tier, missing in (("required", missing_required), ("preferred", missing_preferred), ("optional", missing_optional)):
        for requirement in sorted(requirements.get(tier, []), key=lambda item: (item["kind"], item["id"], item.get("entity", ""))):
            passed, reason = _evaluate(document, renderer, requirement, context)
            record = {"tier": tier, **copy.deepcopy(requirement)}
            if passed:
                matched.append(record)
            else:
                record["reason"] = reason
                missing.append(record)
    limit_violations = _limit_violations(renderer, context)
    eligible = not missing_required and not limit_violations
    score = max(0.0, 1.0 - len(missing_preferred) * 0.1 - len(missing_optional) * 0.02) if eligible else 0.0
    fallbacks = _fallback_candidates(document, renderer, missing_required + missing_preferred + missing_optional, requirements)
    if limit_violations:
        explanation = f"{renderer_id} vượt giới hạn {limit_violations[0]['id']}"
    elif missing_required:
        first = missing_required[0]
        explanation = f"{renderer_id}: {first['reason']} cho {first['kind']} {first['id']}"
    elif missing_preferred:
        explanation = f"{renderer_id} hợp lệ nhưng thiếu {len(missing_preferred)} capability ưu tiên"
    else:
        explanation = f"{renderer_id} đáp ứng toàn bộ capability bắt buộc"
    return {
        "renderer": renderer_id,
        "eligible": eligible,
        "score": round(score, 6),
        "matched": matched,
        "missing_required": missing_required,
        "missing_preferred": missing_preferred,
        "missing_optional": missing_optional,
        "limit_violations": limit_violations,
        "fallbacks": fallbacks,
        "explanation": explanation,
    }


def rank_renderers(requirements: dict[str, Any], context: dict[str, Any] | None = None, *, registry: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    document = copy.deepcopy(registry) if registry is not None else inspect_registry()
    if "fallbacks" not in document:
        document["fallbacks"] = {}
    validate_registry(document)
    results = [match_renderer(renderer_id, requirements, context, registry=document) for renderer_id in sorted(document["renderers"])]
    return sorted(results, key=lambda item: (not item["eligible"], -item["score"], item["renderer"]))


def explain_gap(renderer_id: str, requirements: dict[str, Any], context: dict[str, Any] | None = None, *, registry: dict[str, Any] | None = None) -> dict[str, Any]:
    result = match_renderer(renderer_id, requirements, context, registry=registry)
    return {key: result[key] for key in ("renderer", "eligible", "missing_required", "missing_preferred", "missing_optional", "limit_violations", "fallbacks", "explanation")}
