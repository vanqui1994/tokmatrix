"""Reconstruct full stories from vector character and clip references."""

import copy
from typing import Dict, Any

from bkt_web.remake_vector import validate_story, held_pose


def compose_story(
    story_ref: Dict[str, Any],
    characters_db: Dict[str, Any],
    clips_db: Dict[str, Any],
) -> Dict[str, Any]:
    """Compose a full playable story from references."""
    story = {
        "id": story_ref["id"],
        "name": story_ref.get("name", story_ref["id"]),
        "renderer": story_ref.get("renderer", "native-vector-v1"),
        "fidelity": story_ref.get("fidelity", "technical-demo"),
        "duration": story_ref["duration"],
        "characters": copy.deepcopy(story_ref["characters"]),
        "scenes": [],
        "cues": copy.deepcopy(story_ref.get("cues", [])),
    }

    for sc_idx, sc_ref in enumerate(story_ref["scenes"]):
        scene_poses = {}
        for aref in sc_ref["actors"]:
            aid = aref["id"]
            clip_id = aref["clip"]
            at = aref["at"]
            clip = clips_db[clip_id]

            poses_list = []
            for kf in clip["keyframes"]:
                k = {
                    "time": round(at["t"] + kf["t"], 3),
                    "x": round(at["x"] + kf.get("dx", 0), 3),
                    "y": round(at["y"] + kf.get("dy", 0), 3),
                }
                for field, val in kf.items():
                    if field not in ("t", "dx", "dy"):
                        k[field] = val
                poses_list.append(k)

            # Reconstruct exact mathematical coordinates for attached tools if held_pose was used
            if "held" in at:
                held = at["held"]
                for k in poses_list:
                    h = k.get("height", held.get("height"))
                    rot = k.get("rotation", held.get("rotation", 0))
                    try:
                        hp = held_pose(held["asset"], h, rot)
                        k["x"] = hp["x"]
                        k["y"] = hp["y"]
                    except Exception:
                        pass

            scene_poses[aid] = poses_list

        scene = {
            "renderer": sc_ref.get("renderer", "native-vector-v1"),
            "kind": sc_ref.get("kind", "scene"),
            "start_time": sc_ref["start_time"],
            "end_time": sc_ref["end_time"],
            "characters_present": list(sc_ref["characters_present"]),
            "poses": scene_poses,
            "actions": copy.deepcopy(sc_ref.get("actions", [])),
            "background": copy.deepcopy(sc_ref.get("background", {})),
        }
        if "camera" in sc_ref and sc_ref["camera"]:
            scene["camera"] = copy.deepcopy(sc_ref["camera"])
        if "text" in sc_ref:
            scene["text"] = sc_ref["text"]
        story["scenes"].append(scene)

    validate_story(story)
    return story
