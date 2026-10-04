"""Extract characters, clips, and story references from sample vector stories."""

import copy
import math
from collections import defaultdict
from typing import Dict, Any, List, Tuple, Optional

from bkt_web.remake_vector import sample_stories, held_pose, validate_story
from bkt_web.vector_characters.naming import (
    CHARACTER_METADATA,
    resolve_character_id,
    get_character_info,
)

TECH_DEMO_STORIES = {
    "articulated-hand-tool",
    "articulated-hand-poses",
    "articulated-branch",
    "farmer-ik-reach",
    "farmer-ik-carry",
}


def round_float(val: Any, digits: int = 3) -> Any:
    """Recursively round floats in data structures for deterministic output."""
    if isinstance(val, float):
        return round(val, digits)
    elif isinstance(val, dict):
        return {k: round_float(v, digits) for k, v in val.items()}
    elif isinstance(val, list):
        return [round_float(v, digits) for v in val]
    return val


def detect_clip_kind(
    story_id: str,
    asset: str,
    action_types: List[str],
    travel_px: float,
    keyframes: List[Dict[str, Any]],
    is_attached: bool,
    is_set_prop: bool,
) -> str:
    """Classify clip kind according to PLAN §2.2."""
    if story_id in TECH_DEMO_STORIES:
        return "technical"
    # Group actions
    if any(a in ("haul", "carry_together", "tug") for a in action_types):
        return "group"
    # Ride
    if "ride" in action_types:
        return "ride"
    # Interact
    interact_actions = {
        "pull_lever", "carve", "brush_teeth", "vaccinate", "listen",
        "take_temperature", "sort", "pick", "shake", "hammer_anvil",
        "cut", "slice", "water", "dig", "uproot", "apply_bandage"
    }
    if any(a in interact_actions for a in action_types):
        return "interact"
    # Emote
    if "emote" in action_types or any(k.get("emote") for k in keyframes):
        return "emote"
    # Gesture
    gesture_actions = {"gesture", "bow", "wave", "celebrate", "bounce", "dizzy"}
    if any(a in gesture_actions for a in action_types):
        return "gesture"
    # Locomotion
    locomotion_actions = {"hop", "fly", "swim", "crawl", "peck", "graze", "pollinate"}
    has_walk = any((k.get("walk") or 0) > 0 or (k.get("stride") or 0) > 0 for k in keyframes)
    if travel_px >= 50 or has_walk or any(a in locomotion_actions for a in action_types):
        return "locomotion"
    # Dynamic set piece / state
    if is_set_prop or asset in ("volcano", "cloud", "rainbow", "coral", "recycling_plant", "garbage_truck"):
        return "state"
    # Hold
    if is_attached or any("grip" in k or "held" in k for k in keyframes):
        return "hold"
    return "idle"


def make_action_slug(kind: str, action_types: List[str]) -> str:
    """Generate a readable slug for a clip action."""
    if action_types:
        return action_types[0]
    return kind


def extract_clip(
    story_id: str,
    scene_idx: int,
    start_time: float,
    end_time: float,
    actor_id: str,
    char_id: str,
    asset: str,
    keys: List[Dict[str, Any]],
    scene_actions: List[Dict[str, Any]],
    theme: str,
    is_attached: bool,
    is_set_prop: bool,
    held_meta: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Extract a single actor clip from a scene, returning (clip, at_reference)."""
    duration = round(end_time - start_time, 3)
    x0 = keys[0]["x"]
    y0 = keys[0]["y"]

    # Compute relative keyframes
    keyframes = []
    for k in keys:
        kf = {
            "t": round(k["time"] - start_time, 3),
            "dx": round(k["x"] - x0, 3),
            "dy": round(k["y"] - y0, 3),
        }
        for field, val in k.items():
            if field not in ("time", "x", "y"):
                kf[field] = round(val, 3) if isinstance(val, float) else val
        keyframes.append(kf)

    # Rule 5: Ensure keyframe 0 and keyframe -1 have persistent fields (opacity, outfit, flip)
    persistent_fields = ("opacity", "outfit", "flip")
    for f in persistent_fields:
        if f in keyframes[0] and f not in keyframes[-1]:
            keyframes[-1][f] = keyframes[0][f]

    # Calculate displacement and facing
    dx_last = keyframes[-1]["dx"]
    dy_last = keyframes[-1]["dy"]
    travel_px = round(math.hypot(dx_last, dy_last), 3)

    # Rule 6: Facing must match movement direction
    if dx_last > 10:
        facing = "right"
    elif dx_last < -10:
        facing = "left"
    elif keyframes[0].get("flip"):
        facing = "left"
    else:
        facing = "right"

    # Relevant actions involving this character
    relevant_actions = []
    action_types = []
    partners = []
    props_needed = []

    for act in scene_actions:
        is_actor = act.get("actor") == actor_id
        is_target = act.get("target") == actor_id
        is_tool = act.get("tool") == actor_id
        is_helper = actor_id in (act.get("helpers") or [])
        if is_actor or is_target or is_tool or is_helper:
            action_types.append(act.get("type", "unknown"))
            if is_actor:
                # Store action with relative timing
                a_copy = copy.deepcopy(act)
                a_copy["start"] = round(max(0.0, act["start"] - start_time), 3)
                a_copy["end"] = round(min(duration, act["end"] - start_time), 3)
                if "contact" in act:
                    a_copy["contact"] = round(act["contact"] - start_time, 3)
                if "pop_at" in act:
                    a_copy["pop_at"] = round(act["pop_at"] - start_time, 3)
                relevant_actions.append(a_copy)
                if "target" in act and act["target"] != actor_id:
                    partners.append(act["target"])
                if "helpers" in act:
                    partners.extend([h for h in act["helpers"] if h != actor_id])
                if "tool" in act:
                    props_needed.append(act["tool"])

    kind = detect_clip_kind(
        story_id, asset, action_types, travel_px, keyframes, is_attached, is_set_prop
    )

    slug = make_action_slug(kind, action_types)
    clip_id = f"{char_id}/{slug}_sc{scene_idx}"

    needs = {
        "background_theme": [theme] if theme else ["general"],
        "partners": sorted(list(set(partners))),
        "props": sorted(list(set(props_needed))),
    }

    clip = {
        "character": char_id,
        "kind": kind,
        "duration": duration,
        "space": "anchored" if is_attached else "relative",
        "keyframes": keyframes,
        "actions": relevant_actions,
        "needs": needs,
        "travel_px": travel_px,
        "facing": facing,
        "loopable": False,
        "source": {
            "story": story_id,
            "scene": scene_idx,
            "t0": round(start_time, 3),
            "t1": round(end_time, 3),
        },
        "sources": [
            {
                "story": story_id,
                "scene": scene_idx,
                "t0": round(start_time, 3),
                "t1": round(end_time, 3),
            }
        ],
    }

    at_ref = {
        "x": round(x0, 3) if isinstance(x0, float) else x0,
        "y": round(y0, 3) if isinstance(y0, float) else y0,
        "t": round(start_time, 3),
    }
    if held_meta:
        at_ref["held"] = held_meta

    return clip, at_ref


def build_neutral_stories() -> List[Dict[str, Any]]:
    """Build neutral variants of farm-life and giant_radish (§6.1)."""
    stories = sample_stories()
    farm_life = next(s for s in stories if s["id"] == "farm-life")
    giant_radish = next(s for s in stories if s["id"] == "giant_radish")

    # 1. farm-life__neutral: cow replaces buffalo, farmer_woman wears straw hat
    fl_neutral = copy.deepcopy(farm_life)
    fl_neutral["id"] = "farm-life__neutral"
    fl_neutral["name"] = "Farm life (neutral) · harvest, cow, chickens, watering, carrots"
    fl_neutral["cues"] = []  # bản cho de/us/kr/jp: không giữ lời thoại tiếng Việt, engine video tự viết lời
    for c in fl_neutral["characters"]:
        if c["id"] == "buffalo" or c["asset"] == "buffalo":
            c["asset"] = "cow"
            c["name"] = "Cow"
        if c["id"] == "woman" or c["asset"] == "farmer_woman":
            c["style"] = {"hat": "straw"}

    # 2. giant_radish__neutral: farmyard_barn replaces village_market in scene 3, farmer_woman wears straw hat
    gr_neutral = copy.deepcopy(giant_radish)
    gr_neutral["id"] = "giant_radish__neutral"
    gr_neutral["name"] = "Giant radish (neutral) · pulling together on the farm"
    gr_neutral["cues"] = []
    for c in gr_neutral["characters"]:
        if c.get("asset") == "farmer_woman" or c.get("id") == "farmer_woman":
            c["style"] = {"hat": "straw"}
    for sc in gr_neutral["scenes"]:
        if sc.get("background", {}).get("preset") == "village_market":
            sc["background"]["preset"] = "farmyard_barn"

    validate_story(fl_neutral)
    validate_story(gr_neutral)
    return [fl_neutral, gr_neutral]


def extract_library(include_neutrals: bool = True) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """Extract all characters, clips, and story references from 79 sample stories."""
    all_stories = sample_stories()
    if include_neutrals:
        all_stories = all_stories + build_neutral_stories()

    characters_db: Dict[str, Dict[str, Any]] = {}
    clips_db: Dict[str, Dict[str, Any]] = {}
    story_refs_db: Dict[str, Dict[str, Any]] = {}

    for story in all_stories:
        sid = story["id"]
        is_tech = sid in TECH_DEMO_STORIES

        # Map attached characters to their hosts
        attached_map = defaultdict(list)
        for c in story["characters"]:
            if "attach_to" in c:
                attached_map[c["attach_to"]["id"]].append(c)

        # 1. Register characters from story
        actor_to_char_id = {}
        for c in story["characters"]:
            cid = c["id"]
            asset = c["asset"]
            is_attached = "attach_to" in c

            # Detect outfit from character or first scene pose
            outfit = c.get("outfit")
            style = c.get("style", {})
            height = 300
            for sc in story["scenes"]:
                for p in sc.get("poses", {}).get(cid, []):
                    if "outfit" in p and not outfit:
                        outfit = p["outfit"]
                    if "height" in p:
                        height = p["height"]

            attached_props = tuple(sorted(p["asset"] for p in attached_map.get(cid, [])))

            char_id = resolve_character_id(
                rig=asset,
                outfit=outfit,
                props=attached_props,
                actor_id=cid,
                story_id=sid,
                style=style,
            )
            actor_to_char_id[cid] = char_id

            if not is_tech and not is_attached:
                if char_id not in characters_db:
                    info = get_character_info(char_id, rig=asset, outfit=outfit)
                    info["height"] = height
                    info["source_stories"] = [sid]
                    info["clips"] = []
                    info["expressions"] = []
                    characters_db[char_id] = info
                else:
                    if sid not in characters_db[char_id]["source_stories"]:
                        characters_db[char_id]["source_stories"].append(sid)

        # 2. Extract scenes and clips
        scenes_refs = []
        for sc_idx, sc in enumerate(story["scenes"]):
            st = sc["start_time"]
            et = sc["end_time"]
            bg = sc.get("background", {})
            theme = bg.get("preset", "garden")
            actors_refs = []

            for aid in sc.get("characters_present", []):
                if aid not in sc.get("poses", {}) or not sc["poses"][aid]:
                    continue
                keys = sc["poses"][aid]
                char_id = actor_to_char_id.get(aid, aid)
                char_def = next((c for c in story["characters"] if c["id"] == aid), None)
                asset = char_def["asset"] if char_def else aid
                is_attached = char_def is not None and "attach_to" in char_def

                # Check if this is a held tool with held_pose
                held_meta = None
                if is_attached and keys and "height" in keys[0]:
                    h = keys[0]["height"]
                    rot = keys[0].get("rotation", 0)
                    try:
                        hp = held_pose(asset, h, rot)
                        if abs(hp["x"] - keys[0]["x"]) < 1e-4 and abs(hp["y"] - keys[0]["y"]) < 1e-4:
                            held_meta = {"asset": asset, "height": h, "rotation": rot}
                    except Exception:
                        pass

                clip, at_ref = extract_clip(
                    story_id=sid,
                    scene_idx=sc_idx,
                    start_time=st,
                    end_time=et,
                    actor_id=aid,
                    char_id=char_id,
                    asset=asset,
                    keys=keys,
                    scene_actions=sc.get("actions", []),
                    theme=theme,
                    is_attached=is_attached,
                    is_set_prop=char_def is not None and char_def.get("role") == "set",
                    held_meta=held_meta,
                )

                clip_key = f"{clip['character']}/{clip['source']['story']}_s{sc_idx}_{aid}"
                clips_db[clip_key] = clip

                # Register clip under character
                if not is_tech and char_id in characters_db:
                    if clip_key not in characters_db[char_id]["clips"]:
                        characters_db[char_id]["clips"].append(clip_key)
                    for kf in clip["keyframes"]:
                        if "expression" in kf and kf["expression"] not in characters_db[char_id]["expressions"]:
                            characters_db[char_id]["expressions"].append(kf["expression"])

                actors_refs.append({
                    "id": aid,
                    "character": char_id,
                    "clip": clip_key,
                    "at": at_ref,
                })

            scene_ref = {
                "renderer": sc.get("renderer", "native-vector-v1"),
                "kind": sc.get("kind", "scene"),
                "start_time": round(st, 3),
                "end_time": round(et, 3),
                "background": bg,
                "characters_present": sc.get("characters_present", []),
                "actions": sc.get("actions", []),
                "actors": actors_refs,
            }
            if "camera" in sc and sc["camera"]:
                scene_ref["camera"] = sc["camera"]
            if "text" in sc:
                scene_ref["text"] = sc["text"]
            scenes_refs.append(scene_ref)

        story_ref = {
            "id": sid,
            "name": story.get("name", sid),
            "renderer": story.get("renderer", "native-vector-v1"),
            "fidelity": story.get("fidelity", "technical-demo"),
            "duration": round(story["duration"], 3),
            "characters": story["characters"],
            "scenes": scenes_refs,
            "cues": story.get("cues", []),
        }
        story_refs_db[sid] = story_ref

    # Deterministic sorting
    characters_db = {k: characters_db[k] for k in sorted(characters_db)}
    clips_db = {k: clips_db[k] for k in sorted(clips_db)}
    story_refs_db = {k: story_refs_db[k] for k in sorted(story_refs_db)}

    return characters_db, clips_db, story_refs_db
