"""Recurring cast module for Phase V: Apocalypse & Survival.

Implements reusable cast actors, stateful poses, and performance clips according to PLAN §4.
Provides:
- cast_actor(cid, id=None, state="normal")
- cast_pose(cid, t, x, y, state="normal", **extra)
- cast_clip(cid, clip_id, at, x=288, y=810, state="normal", **extra)
"""

import copy
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

ROOT = Path(__file__).resolve().parent.parent.parent
CAST_PATH = ROOT / "bkt_web" / "static" / "remake_vector_cast.json"
CLIPS_PATH = ROOT / "bkt_web" / "static" / "remake_vector_clips.json"

_CAST_CACHE: Optional[Dict[str, Any]] = None


def get_cast_data() -> Dict[str, Any]:
    global _CAST_CACHE
    if _CAST_CACHE is None:
        if CAST_PATH.exists():
            _CAST_CACHE = json.loads(CAST_PATH.read_text(encoding="utf-8"))
        else:
            _CAST_CACHE = {}
    return _CAST_CACHE


class CastActor(list):
    """Wrapper for cast actor declaration that behaves as both a list (main + props) and a dict (main actor)."""

    def __init__(self, main_actor: Dict[str, Any], prop_actors: Optional[List[Dict[str, Any]]] = None, signature_props: Optional[List[Dict[str, Any]]] = None):
        props = prop_actors or []
        super().__init__([main_actor] + props)
        self.actor = main_actor
        self.props = props
        self.signature_props = signature_props or []

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, (int, slice)):
            return super().__getitem__(key)
        return self.actor[key]

    def __setitem__(self, key: Any, value: Any) -> None:
        if isinstance(key, int):
            super().__setitem__(key, value)
        else:
            self.actor[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self.actor.get(key, default)

    def __contains__(self, key: Any) -> bool:
        if isinstance(key, str):
            return key in self.actor
        return super().__contains__(key)

    def keys(self):
        return self.actor.keys()

    def values(self):
        return self.actor.values()

    def items(self):
        return self.actor.items()


class CastClipResult(list):
    """List of pose dictionaries with associated actions and metadata."""

    def __init__(self, poses: List[Dict[str, Any]], actions: Optional[List[Dict[str, Any]]] = None, duration: float = 0.0):
        super().__init__(poses)
        self.actions = actions or []
        self.duration = duration


def cast_actor(cid: str, id: Optional[str] = None, state: str = "normal", with_props: bool = True) -> CastActor:
    """Declare a recurring cast actor and any signature handheld props.
    
    Returns a CastActor (list containing main actor dict and attached prop dicts).
    """
    cast_db = get_cast_data()
    if cid not in cast_db:
        raise ValueError(f"Nhân vật không có trong dàn diễn viên tái sử dụng: {cid}")

    info = copy.deepcopy(cast_db[cid])
    actor_id = id or cid
    state_conf = info.get("states", {}).get(state, {})

    outfit = state_conf.get("outfit", info.get("base_outfit"))

    main_actor: Dict[str, Any] = {
        "id": actor_id,
        "name": info["label"].get("en", actor_id),
        "asset": info["rig"],
        "role": info.get("role", "hero"),
    }
    if outfit and outfit != "none":
        main_actor["outfit"] = outfit
    if info.get("style"):
        main_actor["style"] = copy.deepcopy(info["style"])

    prop_actors: List[Dict[str, Any]] = []
    sig_props = info.get("signature_props", [])
    if with_props and sig_props:
        for p in sig_props:
            prop_id = f"{actor_id}_{p['asset']}"
            prop_actors.append({
                "id": prop_id,
                "asset": p["asset"],
                "attach_to": {
                    "id": actor_id,
                    "anchor": p.get("hand", "hand_r")
                }
            })

    return CastActor(main_actor, prop_actors, sig_props)


def cast_pose(cid: str, t: float, x: float, y: float, state: str = "normal", **extra) -> Dict[str, Any]:
    """Generate a keyframe for a cast actor with all state fields explicitly populated.
    
    Fields guaranteed on every keyframe:
    time, x, y, height, outfit, style, zombie, cured, opacity, expression.
    """
    cast_db = get_cast_data()
    if cid not in cast_db:
        raise ValueError(f"Nhân vật không có trong dàn diễn viên tái sử dụng: {cid}")

    info = cast_db[cid]
    state_conf = info.get("states", {}).get(state, {})

    outfit = state_conf.get("outfit", info.get("base_outfit"))
    zombie = state_conf.get("zombie", 1.0 if state == "zombie" else 0.0)
    cured = state_conf.get("cured", 1.0 if state == "cured" else 0.0)
    default_expr = state_conf.get("expression", "dazed" if zombie > 0 else ("happy" if cured > 0 else "neutral"))

    rig = info.get("rig", "")
    is_chibi = rig.startswith("chibi") or "chibi" in rig

    pose_dict: Dict[str, Any] = {
        "time": round(float(t), 3),
        "x": round(float(x), 2),
        "y": round(float(y), 2),
        "height": float(extra.pop("height", info.get("height", 220))),
        "zombie": float(zombie),
        "cured": float(cured),
        "opacity": 1.0,
        "expression": default_expr,
    }
    if is_chibi and outfit:
        pose_dict["outfit"] = outfit

    # Merge extra overrides
    pose_dict.update(extra)
    return pose_dict


# -------------------------------------------------------------
# DEFINITION OF REUSABLE CAST CLIPS (Plan §4.3)
# -------------------------------------------------------------

def _make_common_clips(cid: str, height: float) -> Dict[str, Dict[str, Any]]:
    """Create the 10 shared performance clips for a character."""
    return {
        "idle": {
            "character": cid,
            "duration": 3.0,
            "facing": "right",
            "kind": "idle",
            "loopable": True,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "lean": 0.0, "expression": "neutral"},
                {"t": 1.5, "dx": 0.0, "dy": 0.0, "height": height, "lean": 0.02, "expression": "neutral"},
                {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": height, "lean": 0.0, "expression": "neutral"},
            ],
            "actions": []
        },
        "walk_in": {
            "character": cid,
            "duration": 3.0,
            "facing": "right",
            "kind": "locomotion",
            "loopable": False,
            "space": "relative",
            "travel_px": 120.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "walk": 0.6, "stride": 0.0, "expression": "neutral"},
                {"t": 1.5, "dx": 60.0, "dy": 0.0, "height": height, "walk": 0.6, "stride": 9.0, "expression": "neutral"},
                {"t": 3.0, "dx": 120.0, "dy": 0.0, "height": height, "walk": 0.0, "stride": 18.0, "expression": "neutral"},
            ],
            "actions": []
        },
        "walk_out": {
            "character": cid,
            "duration": 3.0,
            "facing": "right",
            "kind": "locomotion",
            "loopable": False,
            "space": "relative",
            "travel_px": 120.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "walk": 0.6, "stride": 0.0, "expression": "neutral"},
                {"t": 1.5, "dx": 60.0, "dy": 0.0, "height": height, "walk": 0.6, "stride": 9.0, "expression": "neutral"},
                {"t": 3.0, "dx": 120.0, "dy": 0.0, "height": height, "walk": 0.0, "stride": 18.0, "expression": "neutral"},
            ],
            "actions": []
        },
        "look_around": {
            "character": cid,
            "duration": 3.0,
            "facing": "right",
            "kind": "gesture",
            "loopable": False,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "look_x": 0.0, "expression": "curious"},
                {"t": 1.0, "dx": 0.0, "dy": 0.0, "height": height, "look_x": -0.8, "expression": "curious"},
                {"t": 2.0, "dx": 0.0, "dy": 0.0, "height": height, "look_x": 0.8, "expression": "curious"},
                {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": height, "look_x": 0.0, "expression": "neutral"},
            ],
            "actions": []
        },
        "crouch_hide": {
            "character": cid,
            "duration": 3.0,
            "facing": "right",
            "kind": "gesture",
            "loopable": True,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "lean": 0.1, "expression": "worried"},
                {"t": 0.8, "dx": 0.0, "dy": 0.0, "height": height, "lean": 0.35, "expression": "worried"},
                {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": height, "lean": 0.35, "expression": "worried"},
            ],
            "actions": []
        },
        "run_short": {
            "character": cid,
            "duration": 2.0,
            "facing": "right",
            "kind": "locomotion",
            "loopable": False,
            "space": "relative",
            "travel_px": 140.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "walk": 0.9, "stride": 0.0, "lean": 0.15, "expression": "focused"},
                {"t": 1.0, "dx": 70.0, "dy": 0.0, "height": height, "walk": 0.9, "stride": 8.0, "lean": 0.18, "expression": "focused"},
                {"t": 2.0, "dx": 140.0, "dy": 0.0, "height": height, "walk": 0.0, "stride": 16.0, "lean": 0.0, "expression": "neutral"},
            ],
            "actions": []
        },
        "wave": {
            "character": cid,
            "duration": 2.5,
            "facing": "right",
            "kind": "gesture",
            "loopable": False,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "hand_r_y": -22, "hand_r_x": 16, "expression": "happy"},
                {"t": 0.6, "dx": 0.0, "dy": 0.0, "height": height, "hand_r_y": -46, "hand_r_x": 22, "expression": "happy"},
                {"t": 1.2, "dx": 0.0, "dy": 0.0, "height": height, "hand_r_y": -46, "hand_r_x": 14, "expression": "happy"},
                {"t": 1.8, "dx": 0.0, "dy": 0.0, "height": height, "hand_r_y": -46, "hand_r_x": 22, "expression": "happy"},
                {"t": 2.5, "dx": 0.0, "dy": 0.0, "height": height, "hand_r_y": -22, "hand_r_x": 16, "expression": "happy"},
            ],
            "actions": []
        },
        "talk": {
            "character": cid,
            "duration": 3.0,
            "facing": "right",
            "kind": "gesture",
            "loopable": True,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "mouth_talk": 0.0, "expression": "neutral"},
                {"t": 0.7, "dx": 0.0, "dy": 0.0, "height": height, "mouth_talk": 0.8, "expression": "happy"},
                {"t": 1.5, "dx": 0.0, "dy": 0.0, "height": height, "mouth_talk": 0.2, "expression": "neutral"},
                {"t": 2.3, "dx": 0.0, "dy": 0.0, "height": height, "mouth_talk": 0.9, "expression": "happy"},
                {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": height, "mouth_talk": 0.0, "expression": "neutral"},
            ],
            "actions": []
        },
        "emote_heart": {
            "character": cid,
            "duration": 2.0,
            "facing": "right",
            "kind": "gesture",
            "loopable": False,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "expression": "happy"},
                {"t": 2.0, "dx": 0.0, "dy": 0.0, "height": height, "expression": "happy"},
            ],
            "actions": [
                {"type": "emote", "start": 0.2, "end": 1.8, "actor": cid, "emote": "heart"}
            ]
        },
        "emote_exclamation": {
            "character": cid,
            "duration": 2.0,
            "facing": "right",
            "kind": "gesture",
            "loopable": False,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": height, "expression": "surprised"},
                {"t": 2.0, "dx": 0.0, "dy": 0.0, "height": height, "expression": "surprised"},
            ],
            "actions": [
                {"type": "emote", "start": 0.2, "end": 1.8, "actor": cid, "emote": "exclamation"}
            ]
        },
    }


def _build_all_cast_clips() -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Assemble all Plan §4.3 clips for the entire cast."""
    cast_db = get_cast_data()
    all_clips: Dict[str, Dict[str, Dict[str, Any]]] = {}

    for cid in ("mika", "leo", "dr_hana", "grandpa_otto", "pip", "nora"):
        h = cast_db.get(cid, {}).get("height", 230)
        all_clips[cid] = _make_common_clips(cid, h)

    # 1. Mika specific: radio_call
    all_clips["mika"]["radio_call"] = {
        "character": "mika",
        "duration": 3.5,
        "facing": "right",
        "kind": "interact",
        "loopable": False,
        "space": "relative",
        "travel_px": 0.0,
        "keyframes": [
            {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 16, "hand_r_y": -22, "expression": "focused"},
            {"t": 0.8, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 10, "hand_r_y": -38, "expression": "focused"},
            {"t": 2.7, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 10, "hand_r_y": -38, "expression": "confident"},
            {"t": 3.5, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 16, "hand_r_y": -22, "expression": "happy"},
        ],
        "actions": []
    }

    # 2. Leo specific: flashlight_sweep
    all_clips["leo"]["flashlight_sweep"] = {
        "character": "leo",
        "duration": 4.0,
        "facing": "right",
        "kind": "interact",
        "loopable": False,
        "space": "relative",
        "travel_px": 0.0,
        "keyframes": [
            {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 20, "hand_r_y": -28, "expression": "focused"},
            {"t": 1.0, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 28, "hand_r_y": -34, "expression": "focused"},
            {"t": 2.0, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 12, "hand_r_y": -24, "expression": "surprised"},
            {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 26, "hand_r_y": -32, "expression": "focused"},
            {"t": 4.0, "dx": 0.0, "dy": 0.0, "height": 230, "hand_r_x": 18, "hand_r_y": -24, "expression": "smile"},
        ],
        "actions": []
    }

    # 3. Dr. Hana specific: cure_spray, inspect
    all_clips["dr_hana"]["cure_spray"] = {
        "character": "dr_hana",
        "duration": 4.0,
        "facing": "right",
        "kind": "interact",
        "loopable": False,
        "space": "relative",
        "travel_px": 0.0,
        "keyframes": [
            {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 250, "hand_r_x": 18, "hand_r_y": -24, "expression": "serious"},
            {"t": 1.0, "dx": 0.0, "dy": 0.0, "height": 250, "hand_r_x": 30, "hand_r_y": -34, "expression": "focused"},
            {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": 250, "hand_r_x": 30, "hand_r_y": -34, "expression": "focused"},
            {"t": 4.0, "dx": 0.0, "dy": 0.0, "height": 250, "hand_r_x": 18, "hand_r_y": -24, "expression": "happy"},
        ],
        "actions": []
    }
    all_clips["dr_hana"]["inspect"] = {
        "character": "dr_hana",
        "duration": 3.5,
        "facing": "right",
        "kind": "gesture",
        "loopable": False,
        "space": "relative",
        "travel_px": 0.0,
        "keyframes": [
            {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 250, "lean": 0.0, "expression": "thinking"},
            {"t": 1.0, "dx": 0.0, "dy": 0.0, "height": 250, "lean": 0.22, "hand_r_y": -32, "expression": "focused"},
            {"t": 2.5, "dx": 0.0, "dy": 0.0, "height": 250, "lean": 0.22, "hand_r_y": -32, "expression": "thinking"},
            {"t": 3.5, "dx": 0.0, "dy": 0.0, "height": 250, "lean": 0.0, "expression": "happy"},
        ],
        "actions": []
    }

    # 4. Grandpa Otto specific: barricade, repair
    all_clips["grandpa_otto"]["barricade"] = {
        "character": "grandpa_otto",
        "duration": 4.0,
        "facing": "right",
        "kind": "interact",
        "loopable": False,
        "space": "relative",
        "travel_px": 0.0,
        "keyframes": [
            {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 240, "hand_r_x": 18, "hand_r_y": -24, "expression": "serious"},
            {"t": 1.0, "dx": 0.0, "dy": 0.0, "height": 240, "hand_r_x": 26, "hand_r_y": -40, "expression": "focused"},
            {"t": 2.0, "dx": 0.0, "dy": 0.0, "height": 240, "hand_r_x": 22, "hand_r_y": -26, "expression": "focused"},
            {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": 240, "hand_r_x": 26, "hand_r_y": -40, "expression": "focused"},
            {"t": 4.0, "dx": 0.0, "dy": 0.0, "height": 240, "hand_r_x": 18, "hand_r_y": -24, "expression": "proud"},
        ],
        "actions": []
    }
    all_clips["grandpa_otto"]["repair"] = {
        "character": "grandpa_otto",
        "duration": 3.5,
        "facing": "right",
        "kind": "interact",
        "loopable": False,
        "space": "relative",
        "travel_px": 0.0,
        "keyframes": [
            {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 240, "lean": 0.1, "expression": "serious"},
            {"t": 1.2, "dx": 0.0, "dy": 0.0, "height": 240, "lean": 0.28, "hand_r_y": -26, "expression": "focused"},
            {"t": 2.5, "dx": 0.0, "dy": 0.0, "height": 240, "lean": 0.28, "hand_r_y": -36, "expression": "focused"},
            {"t": 3.5, "dx": 0.0, "dy": 0.0, "height": 240, "lean": 0.0, "expression": "warm"},
        ],
        "actions": []
    }

    # 5. Pip specific: crank_radio
    all_clips["pip"]["crank_radio"] = {
        "character": "pip",
        "duration": 4.0,
        "facing": "right",
        "kind": "interact",
        "loopable": False,
        "space": "relative",
        "travel_px": 0.0,
        "keyframes": [
            {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 210, "hand_r_x": 14, "hand_r_y": -22, "expression": "curious"},
            {"t": 1.0, "dx": 0.0, "dy": 0.0, "height": 210, "hand_r_x": 22, "hand_r_y": -30, "expression": "smile"},
            {"t": 2.0, "dx": 0.0, "dy": 0.0, "height": 210, "hand_r_x": 18, "hand_r_y": -20, "expression": "happy"},
            {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": 210, "hand_r_x": 22, "hand_r_y": -30, "expression": "smile"},
            {"t": 4.0, "dx": 0.0, "dy": 0.0, "height": 210, "hand_r_x": 14, "hand_r_y": -22, "expression": "happy"},
        ],
        "actions": []
    }

    # 6. Biscuit (dog): idle, walk, alert, emote_heart
    all_clips["biscuit"] = {
        "idle": {
            "character": "biscuit",
            "duration": 3.0,
            "facing": "right",
            "kind": "idle",
            "loopable": True,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 120, "wag": 0.2, "expression": "happy"},
                {"t": 1.5, "dx": 0.0, "dy": 0.0, "height": 120, "wag": 0.8, "expression": "happy"},
                {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": 120, "wag": 0.2, "expression": "happy"},
            ],
            "actions": []
        },
        "walk": {
            "character": "biscuit",
            "duration": 3.0,
            "facing": "right",
            "kind": "locomotion",
            "loopable": False,
            "space": "relative",
            "travel_px": 120.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 120, "stride": 0.0, "expression": "curious"},
                {"t": 1.5, "dx": 60.0, "dy": 0.0, "height": 120, "stride": 9.0, "expression": "curious"},
                {"t": 3.0, "dx": 120.0, "dy": 0.0, "height": 120, "stride": 18.0, "expression": "happy"},
            ],
            "actions": []
        },
        "alert": {
            "character": "biscuit",
            "duration": 3.0,
            "facing": "right",
            "kind": "gesture",
            "loopable": False,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 120, "expression": "alert"},
                {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": 120, "expression": "alert"},
            ],
            "actions": [
                {"type": "emote", "start": 0.5, "end": 2.5, "actor": "biscuit", "emote": "exclamation"}
            ]
        },
        "emote_heart": {
            "character": "biscuit",
            "duration": 2.0,
            "facing": "right",
            "kind": "gesture",
            "loopable": False,
            "space": "relative",
            "travel_px": 0.0,
            "keyframes": [
                {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": 120, "expression": "happy", "wag": 0.9},
                {"t": 2.0, "dx": 0.0, "dy": 0.0, "height": 120, "expression": "happy", "wag": 0.9},
            ],
            "actions": [
                {"type": "emote", "start": 0.2, "end": 1.8, "actor": "biscuit", "emote": "heart"}
            ]
        }
    }

    # 7. Zombie crowd walkers: shamble, turn_to_sound, idle
    for zw in ("zombie_walker_a", "zombie_walker_b", "zombie_walker_c"):
        h = cast_db.get(zw, {}).get("height", 230)
        all_clips[zw] = {
            "shamble": {
                "character": zw,
                "duration": 4.0,
                "facing": "right",
                "kind": "locomotion",
                "loopable": False,
                "space": "relative",
                "travel_px": 80.0,
                "keyframes": [
                    {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": h, "walk": 0.5, "stride": 0.0, "expression": "dazed", "zombie": 1.0},
                    {"t": 2.0, "dx": 40.0, "dy": 0.0, "height": h, "walk": 0.5, "stride": 12.0, "expression": "dazed", "zombie": 1.0},
                    {"t": 4.0, "dx": 80.0, "dy": 0.0, "height": h, "walk": 0.0, "stride": 24.0, "expression": "dazed", "zombie": 1.0},
                ],
                "actions": [
                    {"type": "shamble", "start": 0.0, "end": 4.0, "actor": zw, "distance": 80}
                ]
            },
            "turn_to_sound": {
                "character": zw,
                "duration": 3.0,
                "facing": "right",
                "kind": "gesture",
                "loopable": False,
                "space": "relative",
                "travel_px": 0.0,
                "keyframes": [
                    {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": h, "look_x": 0.0, "expression": "dazed", "zombie": 1.0},
                    {"t": 1.2, "dx": 0.0, "dy": 0.0, "height": h, "look_x": -0.8, "flip": True, "expression": "surprised", "zombie": 1.0},
                    {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": h, "look_x": -0.8, "flip": True, "expression": "dazed", "zombie": 1.0},
                ],
                "actions": []
            },
            "idle": {
                "character": zw,
                "duration": 3.0,
                "facing": "right",
                "kind": "idle",
                "loopable": True,
                "space": "relative",
                "travel_px": 0.0,
                "keyframes": [
                    {"t": 0.0, "dx": 0.0, "dy": 0.0, "height": h, "lean": 0.0, "expression": "dazed", "zombie": 1.0},
                    {"t": 1.5, "dx": 0.0, "dy": 0.0, "height": h, "lean": 0.08, "expression": "dazed", "zombie": 1.0},
                    {"t": 3.0, "dx": 0.0, "dy": 0.0, "height": h, "lean": 0.0, "expression": "dazed", "zombie": 1.0},
                ],
                "actions": []
            }
        }

    for cid, clips in all_clips.items():
        src_story = (
            "last_city_morning" if cid in ("mika", "leo", "pip", "biscuit")
            else "barricade_night" if cid == "grandpa_otto"
            else "the_cure" if cid in ("dr_hana", "nora")
            else "quiet_street"
        )
        for cname, cdata in clips.items():
            if not cdata.get("sources"):
                cdata["sources"] = [{"story": src_story, "scene": 0}]

    return all_clips


_ALL_CAST_CLIPS: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = None


def get_all_cast_clips() -> Dict[str, Dict[str, Dict[str, Any]]]:
    global _ALL_CAST_CLIPS
    if _ALL_CAST_CLIPS is None:
        _ALL_CAST_CLIPS = _build_all_cast_clips()
    return _ALL_CAST_CLIPS


def cast_clip(cid: str, clip_id: str, at: Union[float, Dict[str, Any]], x: Optional[float] = None, y: Optional[float] = None, state: str = "normal", **extra) -> CastClipResult:
    """Place a pre-baked performance clip of a recurring cast character into a story.
    
    Arguments:
    - cid: Cast character id (e.g. 'mika', 'leo')
    - clip_id: Name of clip (e.g. 'idle', 'walk_in', 'radio_call')
    - at: Start time (float) or reference dict {'time': ..., 'x': ..., 'y': ...}
    - x, y: Base world position (defaults to 288, 810)
    - state: Cast state ('normal', 'rain', 'cold', 'night', 'zombie', 'cured')
    - extra: Additional keyframe properties
    """
    all_clips = get_all_cast_clips()
    if cid not in all_clips:
        raise ValueError(f"Nhân vật không có clip diễn: {cid}")

    # Strip character prefix if passed as 'cid/clip_name'
    short_clip_id = clip_id.split("/")[-1] if "/" in clip_id else clip_id
    if short_clip_id not in all_clips[cid]:
        raise ValueError(f"Clip '{short_clip_id}' không tồn tại cho nhân vật '{cid}'. Các clip có sẵn: {list(all_clips[cid].keys())}")

    clip_spec = all_clips[cid][short_clip_id]

    # Resolve start time and base coordinates
    if isinstance(at, (int, float)):
        start_time = float(at)
        base_x = 288.0 if x is None else float(x)
        base_y = 810.0 if y is None else float(y)
    elif isinstance(at, dict):
        start_time = float(at.get("time", 0.0))
        base_x = float(at.get("x", 288.0 if x is None else x))
        base_y = float(at.get("y", 810.0 if y is None else y))
    else:
        start_time = 0.0
        base_x = 288.0 if x is None else float(x)
        base_y = 810.0 if y is None else float(y)

    poses: List[Dict[str, Any]] = []
    for kf in clip_spec["keyframes"]:
        kf_t = round(start_time + kf["t"], 3)
        kf_x = round(base_x + kf.get("dx", 0.0), 2)
        kf_y = round(base_y + kf.get("dy", 0.0), 2)

        kf_extra = {k: v for k, v in kf.items() if k not in ("t", "dx", "dy")}
        kf_extra.update(extra)

        pose = cast_pose(cid, kf_t, kf_x, kf_y, state=state, **kf_extra)
        poses.append(pose)

    # Shift action timings
    actions: List[Dict[str, Any]] = []
    for act in clip_spec.get("actions", []):
        act_copy = copy.deepcopy(act)
        act_copy["start"] = round(start_time + act["start"], 3)
        act_copy["end"] = round(start_time + act["end"], 3)
        actions.append(act_copy)

    return CastClipResult(poses, actions, clip_spec["duration"])


def sync_cast_clips_to_db() -> int:
    """Save all recurring cast clips to remake_vector_clips.json."""
    all_clips = get_all_cast_clips()
    clips_db: Dict[str, Any] = {}
    if CLIPS_PATH.exists():
        try:
            clips_db = json.loads(CLIPS_PATH.read_text(encoding="utf-8"))
        except Exception:
            clips_db = {}

    count = 0
    for cid, clips in all_clips.items():
        for clip_name, clip_data in clips.items():
            key = f"{cid}/{clip_name}"
            clips_db[key] = copy.deepcopy(clip_data)
            count += 1

    CLIPS_PATH.write_text(json.dumps(clips_db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return count


if __name__ == "__main__":
    saved = sync_cast_clips_to_db()
    print(f"Successfully synced {saved} recurring cast clips to remake_vector_clips.json")
