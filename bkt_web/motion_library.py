"""Seek-safe named motion clips for layered 2D puppets."""

from __future__ import annotations

import copy
from typing import Any, Mapping


MOTION_LIBRARY_SCHEMA = "tokmatrix.motion-library/v1"
MOTION_NAMES = ("idle", "talk", "explain", "point", "nod", "surprised", "walk", "reach", "hold")


def _point(x: float, y: float) -> dict[str, float]:
    return {"x": round(max(0.0, min(1.0, x)), 6), "y": round(max(0.0, min(1.0, y)), 6)}


def motion_poses(name: str, start: float, end: float, *, x: float = 0.5, ground: float = 0.76, facing: str = "right") -> list[dict[str, Any]]:
    """Return absolute-time poses. Anticipation and settle are finite."""
    if name not in MOTION_NAMES:
        name = "idle"
    duration = max(float(end) - float(start), 0.001)
    sign = 1 if facing == "right" else -1
    times = [start, start + duration * 0.18, start + duration * 0.62, end]
    base = {"hips": _point(x, ground), "expression": "neutral"}
    frames: list[dict[str, Any]] = []
    for index, time in enumerate(times):
        pose = {**base, "time": round(time, 9), "ease": "ease-in-out"}
        # Small finite breathing arc; last frame returns exactly to rest.
        if index in (1, 2):
            pose["hips"] = _point(x, ground - (0.006 if index == 1 else 0.003))
        frames.append(pose)
    if name in {"talk", "explain"}:
        frames[1]["hand_r"] = _point(x + 0.15 * sign, ground - 0.29)
        frames[2]["hand_l"] = _point(x - 0.13 * sign, ground - 0.25)
        frames[2]["expression"] = "happy"
    elif name == "point":
        frames[1]["hand_r"] = _point(x + 0.08 * sign, ground - 0.24)
        frames[2]["hand_r"] = _point(x + 0.25 * sign, ground - 0.35)
        frames[2]["expression"] = "focused"
    elif name == "reach":
        frames[1]["hand_r"] = _point(x + 0.10 * sign, ground - 0.18)
        frames[2]["hand_r"] = _point(x + 0.22 * sign, ground - 0.16)
    elif name == "surprised":
        frames[1]["expression"] = "surprised"
        frames[2]["expression"] = "surprised"
        frames[2]["hand_l"] = _point(x - 0.12 * sign, ground - 0.35)
        frames[2]["hand_r"] = _point(x + 0.12 * sign, ground - 0.35)
    elif name == "nod":
        frames[1]["expression"] = "focused"
        frames[2]["expression"] = "happy"
    elif name == "walk":
        travel = 0.10 * sign
        frames[1]["hips"] = _point(x + travel * 0.25, ground - 0.01)
        frames[1]["foot_l"] = _point(x - 0.04, ground + 0.18)
        frames[2]["hips"] = _point(x + travel * 0.75, ground)
        frames[2]["foot_r"] = _point(x + 0.07, ground + 0.18)
        frames[3]["hips"] = _point(x + travel, ground)
    elif name == "hold":
        frames[1]["hand_l"] = _point(x - 0.07, ground - 0.20)
        frames[1]["hand_r"] = _point(x + 0.07, ground - 0.20)
        frames[2].update({"hand_l": _point(x - 0.07, ground - 0.20), "hand_r": _point(x + 0.07, ground - 0.20)})
    return frames


def _motion_for(entity_id: str, scene: Mapping[str, Any]) -> str:
    for action in scene.get("actions", []) or []:
        if entity_id not in (action.get("actor_ids") or []):
            continue
        text = f"{action.get('type', '')} {action.get('parameters', {}).get('motion', '')}".casefold()
        for name in MOTION_NAMES:
            if name in text:
                return name
        if "speak" in text or "gesture" in text:
            return "explain"
    for event in scene.get("audio_events", []) or []:
        if event.get("kind") == "dialogue" and event.get("speaker_id") in {entity_id, scene.get("speaker_id")}:
            return "talk"
    return "idle"


def apply_motion_library(storyboard: Mapping[str, Any]) -> dict[str, Any]:
    """Add poses only where a character has none, preserving authored motion."""
    output = copy.deepcopy(storyboard)
    for scene in output.get("scenes", []) or []:
        start, end = float(scene.get("start", 0)), float(scene.get("end", 0))
        characters = [e for e in scene.get("entities", []) or [] if e.get("kind") in {"character", "human", "person", "puppet"}]
        for index, entity in enumerate(characters):
            attrs = entity.setdefault("attributes", {})
            if isinstance(attrs.get("poses"), list) and attrs["poses"]:
                continue
            motion = attrs.get("motion") or _motion_for(str(entity.get("entity_id", "")), scene)
            x = float(attrs.get("x", (index + 1) / (len(characters) + 1)))
            facing = str(attrs.get("facing", "right"))
            attrs["motion"] = motion if motion in MOTION_NAMES else "idle"
            attrs["poses"] = motion_poses(attrs["motion"], start, end, x=x, facing=facing)
    return output


def library_manifest() -> dict[str, Any]:
    return {"schema": MOTION_LIBRARY_SCHEMA, "version": "1.0.0", "motions": [{"id": name, "seek_safe": True} for name in MOTION_NAMES]}


__all__ = ["MOTION_LIBRARY_SCHEMA", "MOTION_NAMES", "apply_motion_library", "library_manifest", "motion_poses"]
