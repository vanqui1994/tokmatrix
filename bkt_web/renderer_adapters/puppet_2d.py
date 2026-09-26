"""UV-404 — 2D puppet adapter.

Reusable rigs (``bkt_web/schemas/puppet_rigs.json``) drive full-body two-bone
IK, keyframed expressions and text-derived lip sync.  Nothing depends on the
previous frame: every pose is an analytic function of the absolute timestamp,
so seeking to a timestamp gives the same frame as playing up to it.

Lip sync is derived from the dialogue text already present in the storyboard;
the mouth is closed whenever no dialogue of that speaker is active.  The
adapter never invents dialogue that the storyboard does not contain.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping, Sequence

from bkt_web.renderer_adapters.base import (
    AdapterIssue,
    CANVAS_PRESETS,
    CompiledScene,
    RendererAdapter,
    builtin_provenance,
    clamp,
    ease,
    sample_track,
)
from bkt_web.universal_storyboard import Scene


RENDERER_ID = "puppet-2d-v1"
RENDERER_VERSION = "1.1.0"
RIG_PATH = Path(__file__).resolve().parents[1] / "schemas" / "puppet_rigs.json"

KINDS = ("character", "human", "person", "puppet")
ACTIONS = ("puppet.pose", "puppet.reach", "puppet.walk", "puppet.gesture", "puppet.speak", "puppet.express")
EFFECTS = ("puppet.blink",)
EFFECTORS = ("hand_l", "hand_r", "foot_l", "foot_r")
VISEME_FOR = {
    **{character: "aa" for character in "aáàảãạăắằẳẵặâấầẩẫậ"},
    **{character: "e" for character in "eéèẻẽẹêếềểễệ"},
    **{character: "i" for character in "iíìỉĩịyýỳỷỹỵ"},
    **{character: "o" for character in "oóòỏõọôốồổỗộơớờởỡợ"},
    **{character: "u" for character in "uúùủũụưứừửữự"},
    **{character: "mbp" for character in "mbp"},
    **{character: "fv" for character in "fvph"},
    **{character: "l" for character in "lnr"},
    **{character: "s" for character in "szxjcgkqdtw"},
}


@lru_cache(maxsize=1)
def rig_library() -> dict[str, Any]:
    return json.loads(RIG_PATH.read_text(encoding="utf-8"))


def two_bone_ik(root: tuple[float, float], target: tuple[float, float], first: float, second: float, bend: int, limit: tuple[float, float]) -> dict[str, Any]:
    """Analytic two-bone IK.  Out-of-reach targets are clamped and flagged."""
    dx, dy = target[0] - root[0], target[1] - root[1]
    distance = math.hypot(dx, dy)
    reach = first + second
    floor = abs(first - second)
    limited = distance > reach or distance < floor
    solved = min(max(distance, floor + 1e-9), reach - 1e-9)
    base = math.atan2(dy, dx) if distance > 1e-12 else 0.0
    cosine = clamp((solved * solved + first * first - second * second) / (2 * solved * first), -1.0, 1.0)
    offset = math.acos(cosine)
    angle = base + bend * offset
    joint = (root[0] + first * math.cos(angle), root[1] + first * math.sin(angle))
    if limited:
        scale = solved / distance if distance > 1e-12 else 0.0
        effector = (root[0] + dx * scale, root[1] + dy * scale)
    else:
        effector = (target[0], target[1])
    interior = math.degrees(math.acos(clamp((first * first + second * second - solved * solved) / (2 * first * second), -1.0, 1.0)))
    bend_angle = 180.0 - interior
    clamped_bend = min(max(bend_angle, limit[0]), limit[1])
    joint_limited = abs(clamped_bend - bend_angle) > 1e-9
    return {
        "root": [round(root[0], 6), round(root[1], 6)],
        "joint": [round(joint[0], 6), round(joint[1], 6)],
        "effector": [round(effector[0], 6), round(effector[1], 6)],
        "bend_degrees": round(bend_angle, 6),
        "reach_limited": limited,
        "joint_limited": joint_limited,
    }


def lip_sync_schedule(text: str, start: float, end: float) -> list[dict[str, Any]]:
    """Deterministic viseme schedule derived from the dialogue text."""
    visemes: list[str] = []
    previous = None
    for character in text.lower():
        viseme = VISEME_FOR.get(character)
        if viseme is None:
            previous = None
            continue
        if viseme == previous:
            continue
        visemes.append(viseme)
        previous = viseme
    if not visemes:
        return []
    span = max(end - start, 1e-9) / len(visemes)
    return [
        {"viseme": viseme, "start": round(start + index * span, 9), "end": round(start + (index + 1) * span, 9)}
        for index, viseme in enumerate(visemes)
    ]


def rest_targets(hips: tuple[float, float], bones: Mapping[str, float], facing: int) -> dict[str, tuple[float, float]]:
    """Resting effector positions derived from the hips of that keyframe."""
    chest = (hips[0], hips[1] - bones["torso"])
    shoulder_l = (chest[0] - bones["shoulder_offset"] * facing, chest[1])
    shoulder_r = (chest[0] + bones["shoulder_offset"] * facing, chest[1])
    hip_l = (hips[0] - bones["hip_offset"] * facing, hips[1])
    hip_r = (hips[0] + bones["hip_offset"] * facing, hips[1])
    arm_drop = bones["upper_arm"] + bones["forearm"] * 0.7
    leg_drop = bones["thigh"] + bones["shin"] * 0.98
    return {
        "hand_l": (shoulder_l[0] - bones["forearm"] * 0.4, shoulder_l[1] + arm_drop),
        "hand_r": (shoulder_r[0] + bones["forearm"] * 0.4, shoulder_r[1] + arm_drop),
        "foot_l": (hip_l[0], hip_l[1] + leg_drop),
        "foot_r": (hip_r[0], hip_r[1] + leg_drop),
    }


def resolve_poses(poses: Sequence[Mapping[str, Any]], bones: Mapping[str, float], facing: int, canvas: Mapping[str, int]) -> list[dict[str, Any]]:
    """Fill every channel of every keyframe in pixel space.

    A channel that first appears in a later keyframe would otherwise have
    nothing to interpolate from, so each keyframe carries the rest pose for the
    effectors it does not mention.  Sampling then never meets a missing value.
    """
    width, height = canvas["width"], canvas["height"]
    resolved: list[dict[str, Any]] = []
    hips = (0.5 * width, 0.75 * height)
    expression = "neutral"
    for pose in poses:
        if isinstance(pose.get("hips"), Mapping):
            hips = (float(pose["hips"]["x"]) * width, float(pose["hips"]["y"]) * height)
        defaults = rest_targets(hips, bones, facing)
        expression = pose.get("expression", expression)
        entry: dict[str, Any] = {"time": float(pose["time"]), "hips.x": hips[0], "hips.y": hips[1], "expression": expression}
        if "ease" in pose:
            entry["ease"] = pose["ease"]
        for effector in EFFECTORS:
            point = pose.get(effector)
            if isinstance(point, Mapping):
                entry[f"{effector}.x"] = float(point["x"]) * width
                entry[f"{effector}.y"] = float(point["y"]) * height
            else:
                entry[f"{effector}.x"], entry[f"{effector}.y"] = defaults[effector]
        resolved.append(entry)
    return resolved


class Puppet2DAdapter(RendererAdapter):
    renderer_id = RENDERER_ID
    renderer_version = RENDERER_VERSION
    frame_mode = "draw-list"
    default_canvas = dict(CANVAS_PRESETS["9:16"])
    supported_canvases = tuple(dict(value) for value in CANVAS_PRESETS.values())

    def inspect_capabilities(self) -> dict[str, Any]:
        library = rig_library()
        assets: dict[str, Any] = {}
        for rig_id, rig in sorted(library["rigs"].items()):
            entry = {
                "id": rig_id,
                "version": rig["version"],
                "renderer": RENDERER_ID,
                "entity_types": list(KINDS),
                "anchors": sorted(rig["anchors"]),
                "actions": sorted(ACTIONS),
                "states": sorted(library["expressions"]) + ["speaking", "silent"],
            }
            entry["provenance"] = builtin_provenance(entry)
            assets[rig_id] = entry
        actions = {
            action_id: {"id": action_id, "version": RENDERER_VERSION, "actors": sorted(assets), "targets": []}
            for action_id in ACTIONS
        }
        return {
            "schema": "tokmatrix.capability-registry/v1",
            "version": "1.0.0",
            "renderers": {
                RENDERER_ID: {
                    "id": RENDERER_ID,
                    "version": RENDERER_VERSION,
                    "media": ["vector-2d", "character"],
                    "features": {
                        "deterministic_seek": True,
                        "offline_render": True,
                        "alpha_output": True,
                        "audio_tracks": False,
                        "nested_compositions": False,
                        "full_body_ik": True,
                        "lip_sync": True,
                    },
                    "supports": {"entities": sorted(KINDS), "actions": sorted(ACTIONS), "materials": [], "effects": sorted(EFFECTS)},
                    "fallbacks": [],
                    "limits": {
                        "max_entities_per_project": 40,
                        "max_scene_duration_seconds": 3600,
                        "canvas_sizes": [[item["width"], item["height"]] for item in self.supported_canvases],
                    },
                    "fidelity": {"photorealism": 0.0, "character_motion": 0.8, "typography": 0.3},
                }
            },
            "assets": assets,
            "actions": actions,
            "materials": {},
            "effects": {effect_id: {"id": effect_id, "version": RENDERER_VERSION} for effect_id in EFFECTS},
            "fallbacks": {},
        }

    # -- validation -------------------------------------------------------
    def _validate(self, scene: Scene, assets: Mapping[str, Any]) -> list[AdapterIssue]:
        library = rig_library()
        issues: list[AdapterIssue] = []
        entity_ids: set[str] = set()
        speakers: set[str] = set()
        for index, entity in enumerate(scene.entities):
            path = f"$.entities[{index}]"
            attributes = entity.attributes
            if entity.kind not in KINDS:
                issues.append(AdapterIssue("PUPPET_ENTITY_KIND_UNSUPPORTED", f"{path}.kind", f"kind không được hỗ trợ: {entity.kind}"))
                continue
            rig_id = attributes.get("rig")
            if rig_id not in library["rigs"]:
                issues.append(AdapterIssue("PUPPET_RIG_UNKNOWN", f"{path}.attributes.rig", f"rig không có trong thư viện: {rig_id}"))
                continue
            entity_ids.add(entity.entity_id)
            if isinstance(attributes.get("speaker_id"), str):
                speakers.add(attributes["speaker_id"])
            height = attributes.get("height_fraction", 0.6)
            if isinstance(height, bool) or not isinstance(height, (int, float)) or not 0 < height <= 1:
                issues.append(AdapterIssue("PUPPET_HEIGHT_INVALID", f"{path}.attributes.height_fraction", "height_fraction phải nằm trong (0,1]"))
            poses = attributes.get("poses")
            if not isinstance(poses, list) or not poses:
                issues.append(AdapterIssue("PUPPET_POSES_MISSING", f"{path}.attributes.poses", "cần ít nhất một pose theo thời gian tuyệt đối"))
                continue
            for position, pose in enumerate(poses):
                pose_path = f"{path}.attributes.poses[{position}]"
                if not isinstance(pose, dict) or isinstance(pose.get("time"), bool) or not isinstance(pose.get("time"), (int, float)):
                    issues.append(AdapterIssue("PUPPET_POSE_INVALID", pose_path, "pose cần time là số"))
                    continue
                if pose["time"] < scene.start - 1e-6 or pose["time"] > scene.end + 1e-6:
                    issues.append(AdapterIssue("PUPPET_POSE_OUT_OF_SCENE", pose_path, "pose nằm ngoài khoảng scene"))
                for key in ("hips", *EFFECTORS):
                    point = pose.get(key)
                    if point is None:
                        continue
                    if not isinstance(point, dict) or any(
                        isinstance(point.get(axis), bool) or not isinstance(point.get(axis), (int, float)) or not 0 <= point[axis] <= 1
                        for axis in ("x", "y")
                    ):
                        issues.append(AdapterIssue("PUPPET_POINT_INVALID", f"{pose_path}.{key}", "điểm phải chuẩn hoá {x,y} trong [0,1]"))
                if "expression" in pose and pose["expression"] not in library["expressions"]:
                    issues.append(AdapterIssue("PUPPET_EXPRESSION_UNKNOWN", f"{pose_path}.expression", f"biểu cảm không có trong thư viện: {pose['expression']}"))
                if "ease" in pose and pose["ease"] not in {"linear", "smooth", "hold", "ease-in", "ease-out", "ease-in-out"}:
                    issues.append(AdapterIssue("PUPPET_EASE_UNSUPPORTED", f"{pose_path}.ease", "ease không được hỗ trợ"))
        for index, action in enumerate(scene.actions):
            path = f"$.actions[{index}]"
            if action.type not in ACTIONS:
                issues.append(AdapterIssue("PUPPET_ACTION_UNSUPPORTED", f"{path}.type", f"action không được hỗ trợ: {action.type}"))
                continue
            for position, actor in enumerate(action.actor_ids):
                if actor not in entity_ids:
                    issues.append(AdapterIssue("PUPPET_ACTION_REFERENCE", f"{path}.actor_ids[{position}]", f"không tìm thấy nhân vật: {actor}"))
        for index, event in enumerate(scene.audio_events):
            if event.kind != "dialogue" or event.speaker_id is None:
                continue
            if event.speaker_id not in speakers and event.speaker_id not in entity_ids:
                issues.append(AdapterIssue("PUPPET_SPEAKER_UNMAPPED", f"$.audio_events[{index}].speaker_id", f"không có nhân vật nào nhận speaker {event.speaker_id}"))
        return issues

    # -- compile ----------------------------------------------------------
    def _compile(self, scene: Scene, assets: Mapping[str, Any], canvas: dict[str, int]) -> CompiledScene:
        library = rig_library()
        characters: list[dict[str, Any]] = []
        used: list[dict[str, Any]] = []
        for entity in scene.entities:
            attributes = entity.attributes
            rig_id = attributes["rig"]
            rig = library["rigs"][rig_id]
            height = float(attributes.get("height_fraction", 0.6)) * canvas["height"]
            speaker_id = attributes.get("speaker_id", entity.entity_id)
            dialogue = [
                {"start": event.start, "end": event.end, "schedule": lip_sync_schedule(event.text or "", event.start, event.end)}
                for event in scene.audio_events
                if event.kind == "dialogue" and event.speaker_id == speaker_id and event.text
            ]
            dialogue.sort(key=lambda item: item["start"])
            characters.append({
                "entity_id": entity.entity_id,
                "rig_id": rig_id,
                "speaker_id": speaker_id,
                "height": height,
                "facing": 1 if attributes.get("facing", "right") == "right" else -1,
                "skin": attributes.get("skin", "#f0c9a5"),
                "outfit": attributes.get("outfit", "#2f6f5a"),
                "outfit_secondary": attributes.get("outfit_secondary", "#e3a857"),
                "trousers": attributes.get("trousers", "#28443b"),
                "shoes": attributes.get("shoes", "#2b2825"),
                "hair": attributes.get("hair", "#322923"),
                "hair_style": attributes.get("hair_style", "side-part"),
                "outline": attributes.get("outline", "#26352f"),
                "accessory": attributes.get("accessory", "none"),
                "character_id": attributes.get("character_id", entity.entity_id),
                "poses": sorted(
                    ({**pose, "time": float(pose["time"])} for pose in attributes["poses"]),
                    key=lambda item: item["time"],
                ),
                "resolved_poses": [],
                "dialogue": dialogue,
                "bones": {name: value * height for name, value in rig["proportions"].items()},
                "limits": rig["limits"],
                "chains": rig["chains"],
            })
            character = characters[-1]
            character["resolved_poses"] = resolve_poses(character["poses"], character["bones"], character["facing"], canvas)
            used.append({"asset_id": rig_id, "entity_id": entity.entity_id, "provenance": "built-in"})
        characters.sort(key=lambda item: item["entity_id"])
        return CompiledScene(
            renderer_id=self.renderer_id,
            renderer_version=self.renderer_version,
            scene_id=scene.scene_id,
            start=scene.start,
            end=scene.end,
            canvas=canvas,
            frame_mode=self.frame_mode,
            fidelity_class="puppet-2d",
            source_media_usage="none",
            plan={"characters": characters, "expressions": library["expressions"], "visemes": library["visemes"]},
            assets=tuple(used),
        )

    # -- frames -----------------------------------------------------------
    def pose_at(self, character: Mapping[str, Any], canvas: Mapping[str, int], seconds: float) -> dict[str, Any]:
        """Solve one character's full-body pose at an absolute timestamp."""
        sampled = sample_track(character["resolved_poses"], seconds)
        bones, facing = character["bones"], character["facing"]
        hips = (sampled["hips.x"], sampled["hips.y"])
        chest = (hips[0], hips[1] - bones["torso"])
        head_centre = (chest[0], chest[1] - bones["neck"] - bones["head_radius"])
        roots = {
            "arm_l": (chest[0] - bones["shoulder_offset"] * facing, chest[1]),
            "arm_r": (chest[0] + bones["shoulder_offset"] * facing, chest[1]),
            "leg_l": (hips[0] - bones["hip_offset"] * facing, hips[1]),
            "leg_r": (hips[0] + bones["hip_offset"] * facing, hips[1]),
        }
        chains: dict[str, Any] = {}
        for chain_id, chain in character["chains"].items():
            effector = chain["effector"]
            target = (sampled[f"{effector}.x"], sampled[f"{effector}.y"])
            limit = character["limits"]["elbow" if chain_id.startswith("arm") else "knee"]
            chains[chain_id] = two_bone_ik(
                roots[chain_id],
                target,
                bones[chain["bones"][0]],
                bones[chain["bones"][1]],
                int(chain["bend"]) * facing,
                (float(limit[0]), float(limit[1])),
            )
        return {
            "hips": [round(hips[0], 6), round(hips[1], 6)],
            "chest": [round(chest[0], 6), round(chest[1], 6)],
            "head": [round(head_centre[0], 6), round(head_centre[1], 6)],
            "head_radius": round(bones["head_radius"], 6),
            "chains": chains,
            "expression": sampled["expression"],
        }

    def mouth_at(self, character: Mapping[str, Any], visemes: Mapping[str, Any], seconds: float) -> dict[str, Any]:
        for event in character["dialogue"]:
            if not event["start"] - 1e-9 <= seconds <= event["end"] + 1e-9:
                continue
            for slot in event["schedule"]:
                if slot["start"] - 1e-9 <= seconds < slot["end"] or (seconds >= event["end"] - 1e-9 and slot is event["schedule"][-1]):
                    shape = visemes[slot["viseme"]]
                    return {"viseme": slot["viseme"], "open": shape["open"], "wide": shape["wide"], "speaking": True}
        rest = visemes["rest"]
        return {"viseme": "rest", "open": rest["open"], "wide": rest["wide"], "speaking": False}

    def _frame(self, compiled: CompiledScene, seconds: float) -> dict[str, Any]:
        layers = []
        expressions, visemes = compiled.plan["expressions"], compiled.plan["visemes"]
        for index, character in enumerate(compiled.plan["characters"]):
            pose = self.pose_at(character, compiled.canvas, seconds)
            mouth = self.mouth_at(character, visemes, seconds)
            expression = expressions[pose["expression"]]
            h, r = character["height"], pose["head_radius"]
            outline, skin = character["outline"], character["skin"]
            chest, hips, head = pose["chest"], pose["hips"], pose["head"]
            left_foot = pose["chains"]["leg_l"]["effector"]
            right_foot = pose["chains"]["leg_r"]["effector"]
            ground_y = max(left_foot[1], right_foot[1]) + h * 0.025
            # Stable back-to-front layer order: shadow → hair → limbs → clothes → face.
            ops: list[dict[str, Any]] = [{
                "op": "ellipse", "x": hips[0] - h * 0.13, "y": ground_y - h * 0.018,
                "width": h * 0.26, "height": h * 0.036, "fill": "#17251f55", "stroke": None,
            }, {
                "op": "ellipse", "x": head[0] - r * 1.04, "y": head[1] - r * 1.12,
                "width": r * 2.08, "height": r * 2.35, "fill": character["hair"], "stroke": outline, "stroke_width": max(2, h * 0.006),
            }]
            for chain_id in ("leg_l", "leg_r"):
                chain = pose["chains"][chain_id]
                ops.extend([
                    {"op": "line", "points": [chain["root"], chain["joint"], chain["effector"]], "stroke": outline, "width": h * 0.065, "chain": chain_id},
                    {"op": "line", "points": [chain["root"], chain["joint"], chain["effector"]], "stroke": character["trousers"], "width": h * 0.047, "chain": chain_id},
                    {"op": "ellipse", "x": chain["effector"][0] - h * 0.035, "y": chain["effector"][1] - h * 0.015, "width": h * 0.085, "height": h * 0.038, "fill": character["shoes"], "stroke": outline, "stroke_width": max(2, h * 0.005)},
                ])
            torso_half = h * 0.105
            ops.extend([
                {"op": "polygon", "points": [[chest[0] - torso_half, chest[1] - h * 0.015], [chest[0] + torso_half, chest[1] - h * 0.015], [hips[0] + torso_half * .72, hips[1]], [hips[0] - torso_half * .72, hips[1]]], "fill": character["outfit"], "stroke": outline},
                {"op": "line", "points": [[chest[0] - torso_half * .82, chest[1] + h * .055], [chest[0] + torso_half * .82, chest[1] + h * .055]], "stroke": character["outfit_secondary"], "width": max(3, h * .018)},
            ])
            for chain_id in ("arm_l", "arm_r"):
                chain = pose["chains"][chain_id]
                ops.extend([
                    {"op": "line", "points": [chain["root"], chain["joint"]], "stroke": outline, "width": h * 0.064, "chain": chain_id},
                    {"op": "line", "points": [chain["root"], chain["joint"]], "stroke": character["outfit"], "width": h * 0.048, "chain": chain_id},
                    {"op": "line", "points": [chain["joint"], chain["effector"]], "stroke": outline, "width": h * 0.052},
                    {"op": "line", "points": [chain["joint"], chain["effector"]], "stroke": skin, "width": h * 0.037},
                    {"op": "ellipse", "x": chain["effector"][0] - h * .026, "y": chain["effector"][1] - h * .026, "width": h * .052, "height": h * .052, "fill": skin, "stroke": outline, "stroke_width": max(2, h * .005)},
                ])
            # Neck and ears make the head read as a layered character, not an icon.
            ops.extend([
                {"op": "line", "points": [[head[0], head[1] + r * .72], [chest[0], chest[1] + h * .01]], "stroke": outline, "width": h * .052},
                {"op": "line", "points": [[head[0], head[1] + r * .72], [chest[0], chest[1] + h * .01]], "stroke": skin, "width": h * .038},
                {"op": "ellipse", "x": head[0] - r * 1.12, "y": head[1] - r * .12, "width": r * .28, "height": r * .42, "fill": skin, "stroke": outline, "stroke_width": max(2, h * .005)},
                {"op": "ellipse", "x": head[0] + r * .84, "y": head[1] - r * .12, "width": r * .28, "height": r * .42, "fill": skin, "stroke": outline, "stroke_width": max(2, h * .005)},
            ])
            ops.append({
                "op": "ellipse",
                "x": round(pose["head"][0] - pose["head_radius"], 4),
                "y": round(pose["head"][1] - pose["head_radius"], 4),
                "width": round(pose["head_radius"] * 2, 4),
                "height": round(pose["head_radius"] * 2, 4),
                "fill": character["skin"],
                "stroke": outline,
                "stroke_width": max(2, h * 0.007),
            })
            # Front hair varies by bible style while preserving the same silhouette.
            hair_points = {
                "crop": [[head[0] - r*.9, head[1] - r*.55], [head[0], head[1] - r*1.08], [head[0] + r*.9, head[1] - r*.55]],
                "bob": [[head[0] - r*.98, head[1] - r*.35], [head[0] - r*.3, head[1] - r*1.1], [head[0] + r*.92, head[1] - r*.45]],
                "waves": [[head[0] - r*.95, head[1] - r*.35], [head[0] - r*.4, head[1] - r*1.08], [head[0] + r*.1, head[1] - r*.72], [head[0] + r*.9, head[1] - r*.42]],
                "side-part": [[head[0] - r*.95, head[1] - r*.42], [head[0] - r*.25, head[1] - r*1.08], [head[0] + r*.35, head[1] - r*.82], [head[0] + r*.9, head[1] - r*.48]],
                "bun": [[head[0] - r*.9, head[1] - r*.45], [head[0], head[1] - r*1.08], [head[0] + r*.9, head[1] - r*.45]],
                "curly": [[head[0] - r*.98, head[1] - r*.38], [head[0] - r*.55, head[1] - r*1.02], [head[0], head[1] - r*.78], [head[0] + r*.55, head[1] - r*1.02], [head[0] + r*.98, head[1] - r*.38]],
            }.get(character["hair_style"], [[head[0] - r*.9, head[1] - r*.55], [head[0], head[1] - r*1.08], [head[0] + r*.9, head[1] - r*.55]])
            ops.append({"op": "polygon", "points": hair_points, "fill": character["hair"], "stroke": outline})
            if character["hair_style"] == "bun":
                ops.append({"op": "ellipse", "x": head[0] - r*.36, "y": head[1] - r*1.42, "width": r*.72, "height": r*.72, "fill": character["hair"], "stroke": outline, "stroke_width": max(2, h*.005)})
            for side in (-1, 1):
                eye_x = pose["head"][0] + side * r * 0.38
                ops.append({
                    "op": "ellipse",
                    "x": round(eye_x - r * 0.15, 4), "y": round(head[1] - r * .22, 4),
                    "width": round(r * .30, 4), "height": round(max(r*.04, r * .28 * expression["eye_open"]), 4),
                    "fill": "#f9f4e9", "stroke": outline, "stroke_width": max(1, h*.003),
                })
                ops.append({"op": "ellipse", "x": round(eye_x-r*.055,4), "y": round(head[1]-r*.15,4), "width": r*.11, "height": max(r*.04,r*.13*expression["eye_open"]), "fill": "#24342e", "stroke": None})
                brow_y = head[1] - r * (.38 + expression["brow"]*.12)
                ops.append({"op": "line", "points": [[eye_x-r*.15,brow_y],[eye_x+r*.15,brow_y-expression["brow"]*r*.08*side]], "stroke": character["hair"], "width": max(2,h*.006)})
            ops.append({"op": "line", "points": [[head[0]+r*.03,head[1]-r*.02],[head[0]-r*.02,head[1]+r*.18],[head[0]+r*.10,head[1]+r*.20]], "stroke": "#b8785e", "width": max(1,h*.003)})
            ops.append({
                "op": "mouth",
                "x": round(pose["head"][0], 4),
                "y": round(pose["head"][1] + pose["head_radius"] * 0.42, 4),
                "width": round(pose["head_radius"] * mouth["wide"], 4),
                "height": round(pose["head_radius"] * mouth["open"], 4),
                "curve": expression["mouth_curve"],
                "viseme": mouth["viseme"],
                "fill": "#7d2f31",
            })
            if character["accessory"] == "glasses":
                for side in (-1, 1):
                    ops.append({"op": "ellipse", "x": head[0]+side*r*.38-r*.23, "y": head[1]-r*.30, "width": r*.46, "height": r*.36, "fill": "#ffffff00", "stroke": outline, "stroke_width": max(2,h*.005)})
                ops.append({"op":"line","points":[[head[0]-r*.15,head[1]-r*.12],[head[0]+r*.15,head[1]-r*.12]],"stroke":outline,"width":max(2,h*.005)})
            layers.append({
                "layer_id": character["entity_id"],
                "z": index,
                "opacity": 1.0,
                "ops": ops,
                "pose": pose,
                "mouth": mouth,
            })
        return {"layers": layers}


ADAPTER = Puppet2DAdapter

__all__ = ["ADAPTER", "Puppet2DAdapter", "RENDERER_ID", "lip_sync_schedule", "resolve_poses", "rest_targets", "rig_library", "two_bone_ik"]
