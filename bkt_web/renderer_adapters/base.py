"""Renderer adapter contract for Universal Storyboard v2 (Phase 4).

Every renderer implements the same six calls from the plan:
``inspect_capabilities``, ``validate``, ``compile``, ``render_frame``,
``render_range`` and ``report_fallbacks``.

Two honest frame modes exist.  ``draw-list`` renderers compute a deterministic
declarative draw list in Python, so a frame can be sampled offline without a
browser.  ``host-callback`` renderers (the existing JavaScript engine) declare
that Python cannot paint their pixels; they return the seek state plus the
entry point a host must call.  A renderer never claims offline frame rendering
it does not have.

Frames depend only on the compiled plan and the absolute timestamp: no wall
clock, no unseeded randomness and no state carried between frames.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Sequence

from bkt_web.universal_storyboard import Scene


ADAPTER_CONTRACT_VERSION = "1.0.0"
FRAME_SCHEMA = "tokmatrix.render-frame/v1"
COMPILED_SCHEMA = "tokmatrix.compiled-scene/v1"
TIME_EPSILON = 1e-9

FRAME_MODES = ("draw-list", "host-callback")
SOURCE_MEDIA_USAGE = ("none", "visual", "audio", "visual_and_audio")

# Canvas presets the multi-aspect adapters must support (UV-401 acceptance).
CANVAS_PRESETS: dict[str, dict[str, int]] = {
    "9:16": {"width": 1080, "height": 1920, "fps": 30},
    "16:9": {"width": 1920, "height": 1080, "fps": 30},
    "1:1": {"width": 1080, "height": 1080, "fps": 30},
}


@dataclass(frozen=True, slots=True)
class AdapterIssue:
    """One reason a scene cannot be rendered by an adapter."""

    code: str
    path: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "path": self.path, "message": self.message}


class AdapterError(ValueError):
    """Base class for adapter failures.  Never swallowed into a fake success."""


class SceneNotSupported(AdapterError):
    def __init__(self, renderer_id: str, issues: Sequence[AdapterIssue]):
        self.renderer_id = renderer_id
        self.issues = tuple(issues)
        summary = "; ".join(f"{item.code} at {item.path}: {item.message}" for item in self.issues)
        super().__init__(f"{renderer_id} không dựng được scene: {summary}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": "SCENE_NOT_SUPPORTED",
            "renderer_id": self.renderer_id,
            "errors": [item.as_dict() for item in self.issues],
        }


class FrameNotAvailable(AdapterError):
    """Raised instead of returning a placeholder or reusing source media."""


@dataclass(frozen=True)
class CompiledScene:
    renderer_id: str
    renderer_version: str
    scene_id: str
    start: float
    end: float
    canvas: dict[str, int]
    frame_mode: str
    plan: dict[str, Any]
    fallbacks: tuple[dict[str, Any], ...] = ()
    fidelity_class: str = "synthetic"
    source_media_usage: str = "none"
    assets: tuple[dict[str, Any], ...] = ()
    warnings: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": COMPILED_SCHEMA,
            "renderer_id": self.renderer_id,
            "renderer_version": self.renderer_version,
            "scene_id": self.scene_id,
            "start": self.start,
            "end": self.end,
            "canvas": dict(self.canvas),
            "frame_mode": self.frame_mode,
            "fidelity_class": self.fidelity_class,
            "source_media_usage": self.source_media_usage,
            "plan": copy.deepcopy(self.plan),
            "assets": [copy.deepcopy(item) for item in self.assets],
            "fallbacks": [copy.deepcopy(item) for item in self.fallbacks],
            "warnings": list(self.warnings),
        }


def builtin_provenance(spec: Any, kind: str = "built-in") -> dict[str, str]:
    """Checksum a built-in capability entry so provenance is verifiable."""
    payload = json.dumps(spec, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {"kind": kind, "checksum": "sha256:" + hashlib.sha256(payload).hexdigest()}


def as_scene(scene: Scene | Mapping[str, Any]) -> Scene:
    """Parse a scene without mutating the caller's dictionary."""
    if isinstance(scene, Scene):
        return scene
    if not isinstance(scene, Mapping):
        raise AdapterError("scene phải là dict hoặc Scene")
    return Scene.model_validate(copy.deepcopy(dict(scene)))


def finite(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return low if value < low else high if value > high else value


def ease(name: str, u: float) -> float:
    """Deterministic easing.  Unknown names are rejected, never guessed."""
    u = clamp(u)
    if name == "linear":
        return u
    if name == "hold":
        return 0.0
    if name == "smooth":
        return u * u * (3 - 2 * u)
    if name == "ease-in":
        return u * u
    if name == "ease-out":
        return 1 - (1 - u) * (1 - u)
    if name == "ease-in-out":
        return 2 * u * u if u < 0.5 else 1 - (-2 * u + 2) ** 2 / 2
    raise AdapterError(f"ease không được hỗ trợ: {name}")


EASES = ("linear", "hold", "smooth", "ease-in", "ease-out", "ease-in-out")


def sample_track(keys: Sequence[Mapping[str, Any]], seconds: float, defaults: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Sample absolute-time keyframes.  Pure function of ``seconds``."""
    current: dict[str, Any] = dict(defaults or {})
    if not keys:
        return current
    ordered = sorted(keys, key=lambda item: float(item["time"]))
    first = {**current, **ordered[0]}
    if seconds <= float(first["time"]):
        return first
    previous = first
    for entry in ordered[1:]:
        nxt = {**previous, **entry}
        if seconds >= float(nxt["time"]):
            previous = nxt
            continue
        span = float(nxt["time"]) - float(previous["time"])
        u = 0.0 if span <= 0 else clamp((seconds - float(previous["time"])) / span)
        u = ease(str(nxt.get("ease", "linear")), u)
        out = dict(previous)
        for key, value in nxt.items():
            if key == "ease":
                continue
            before = previous.get(key)
            if isinstance(value, (int, float)) and not isinstance(value, bool) and isinstance(before, (int, float)) and not isinstance(before, bool):
                out[key] = before + (value - before) * u
            else:
                out[key] = before if u < 1 else value
        out["time"] = seconds
        return out
    return previous


def frame_times(start: float, end: float, fps: float) -> list[float]:
    """Deterministic sample grid; identical for the same (start, end, fps)."""
    if not finite(start) or not finite(end) or not finite(fps) or fps <= 0 or end < start:
        raise AdapterError("render_range cần start <= end và fps > 0")
    count = int(math.floor((end - start) * fps + 1e-6))
    return [start + index / fps for index in range(count + 1)]


class RendererAdapter(ABC):
    """Common renderer contract.  Subclasses stay stateless per frame."""

    renderer_id: str = ""
    renderer_version: str = "1.0.0"
    frame_mode: str = "draw-list"
    default_canvas: dict[str, int] = dict(CANVAS_PRESETS["9:16"])
    supported_canvases: tuple[dict[str, int], ...] = (CANVAS_PRESETS["9:16"],)

    def __init__(self) -> None:
        if self.frame_mode not in FRAME_MODES:
            raise AdapterError(f"frame_mode không hợp lệ: {self.frame_mode}")
        self._compiled: CompiledScene | None = None

    # -- contract ---------------------------------------------------------
    @abstractmethod
    def inspect_capabilities(self) -> dict[str, Any]:
        """Return this renderer's capability-registry sub-document."""

    @abstractmethod
    def _validate(self, scene: Scene, assets: Mapping[str, Any]) -> list[AdapterIssue]:
        """Adapter-specific checks."""

    @abstractmethod
    def _compile(self, scene: Scene, assets: Mapping[str, Any], canvas: dict[str, int]) -> CompiledScene:
        """Build the deterministic render plan for one scene."""

    @abstractmethod
    def _frame(self, compiled: CompiledScene, seconds: float) -> dict[str, Any]:
        """Return the frame body (``layers`` or ``state``) at ``seconds``."""

    def validate(self, scene: Scene | Mapping[str, Any], assets: Mapping[str, Any] | None = None) -> list[AdapterIssue]:
        parsed = as_scene(scene)
        payload = copy.deepcopy(dict(assets or {}))
        issues = list(self._validate(parsed, payload))
        return sorted(issues, key=lambda item: (item.path, item.code))

    def resolve_canvas(self, canvas: Mapping[str, Any] | str | None) -> dict[str, int]:
        if canvas is None:
            resolved = dict(self.default_canvas)
        elif isinstance(canvas, str):
            if canvas not in CANVAS_PRESETS:
                raise AdapterError(f"canvas preset không được hỗ trợ: {canvas}")
            resolved = dict(CANVAS_PRESETS[canvas])
        else:
            resolved = {
                "width": int(canvas.get("width", self.default_canvas["width"])),
                "height": int(canvas.get("height", self.default_canvas["height"])),
                "fps": int(canvas.get("fps", self.default_canvas.get("fps", 30))),
            }
        if resolved["width"] <= 0 or resolved["height"] <= 0 or resolved["fps"] <= 0:
            raise AdapterError("canvas không hợp lệ")
        allowed = [(item["width"], item["height"]) for item in self.supported_canvases]
        if (resolved["width"], resolved["height"]) not in allowed:
            raise AdapterError(f"{self.renderer_id} không hỗ trợ canvas {resolved['width']}x{resolved['height']}")
        return resolved

    def compile(
        self,
        scene: Scene | Mapping[str, Any],
        assets: Mapping[str, Any] | None = None,
        *,
        canvas: Mapping[str, Any] | str | None = None,
    ) -> CompiledScene:
        parsed = as_scene(scene)
        payload = copy.deepcopy(dict(assets or {}))
        resolved = self.resolve_canvas(canvas if canvas is not None else payload.get("canvas"))
        issues = self.validate(parsed, payload)
        if issues:
            raise SceneNotSupported(self.renderer_id, issues)
        compiled = self._compile(parsed, payload, resolved)
        if compiled.frame_mode not in FRAME_MODES or compiled.source_media_usage not in SOURCE_MEDIA_USAGE:
            raise AdapterError("compile trả về metadata không hợp lệ")
        self._compiled = compiled
        return compiled

    def render_frame(self, seconds: float, *, compiled: CompiledScene | None = None) -> dict[str, Any]:
        target = compiled or self._compiled
        if target is None:
            raise FrameNotAvailable(f"{self.renderer_id}: cần compile() trước khi render_frame()")
        if not finite(seconds):
            raise AdapterError("seconds phải là số hữu hạn")
        if seconds < target.start - 1e-6 or seconds > target.end + 1e-6:
            raise FrameNotAvailable(
                f"{self.renderer_id}: {seconds} nằm ngoài scene [{target.start}, {target.end}]"
            )
        body = self._frame(target, float(seconds))
        frame = {
            "schema": FRAME_SCHEMA,
            "renderer_id": target.renderer_id,
            "renderer_version": target.renderer_version,
            "scene_id": target.scene_id,
            "seconds": float(seconds),
            "canvas": dict(target.canvas),
            "kind": target.frame_mode,
            "source_media_usage": target.source_media_usage,
        }
        frame.update(body)
        return frame

    def render_range(
        self,
        start: float,
        end: float,
        *,
        fps: float | None = None,
        compiled: CompiledScene | None = None,
    ) -> list[dict[str, Any]]:
        target = compiled or self._compiled
        if target is None:
            raise FrameNotAvailable(f"{self.renderer_id}: cần compile() trước khi render_range()")
        rate = float(fps if fps is not None else target.canvas.get("fps", 30))
        return [self.render_frame(value, compiled=target) for value in frame_times(start, end, rate)]

    def report_fallbacks(self) -> list[dict[str, Any]]:
        if self._compiled is None:
            return []
        return [copy.deepcopy(item) for item in self._compiled.fallbacks]


def fallback_record(
    *,
    fallback_id: str,
    scene_id: str,
    type: str,
    reason_code: str,
    disclosure: str,
    source_media_usage: str = "none",
    approval_required: bool = True,
    affected_requirement_ids: Iterable[str] = (),
) -> dict[str, Any]:
    """Build a storyboard-shaped Fallback so a render plan can absorb it."""
    if source_media_usage not in SOURCE_MEDIA_USAGE:
        raise AdapterError(f"source_media_usage không hợp lệ: {source_media_usage}")
    return {
        "fallback_id": fallback_id,
        "scene_id": scene_id,
        "type": type,
        "reason_code": reason_code,
        "disclosure": disclosure,
        "source_media_usage": source_media_usage,
        "approval_required": bool(approval_required),
        "affected_requirement_ids": sorted(affected_requirement_ids),
    }


__all__ = [
    "ADAPTER_CONTRACT_VERSION",
    "AdapterError",
    "AdapterIssue",
    "CANVAS_PRESETS",
    "COMPILED_SCHEMA",
    "CompiledScene",
    "EASES",
    "FRAME_SCHEMA",
    "FrameNotAvailable",
    "RendererAdapter",
    "SceneNotSupported",
    "as_scene",
    "builtin_provenance",
    "clamp",
    "ease",
    "fallback_record",
    "finite",
    "frame_times",
    "sample_track",
]
