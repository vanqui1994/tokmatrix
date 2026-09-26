"""UV-405 — 3D adapter research spike.

Scope is deliberately one scene: a camera, primitive objects and one
directional light, rendered by a small deterministic software rasteriser that
emits projected polygons as a draw list.  It exists to answer "can a 3D route
seek deterministically and what does it cost?" — it is not a production path
and says so through ``maturity: "spike"`` in its capabilities.

Everything is closed-form float maths: no scene graph state, no caches between
frames, no randomness.
"""

from __future__ import annotations

import math
import time
from typing import Any, Mapping, Sequence

from bkt_web.renderer_adapters.base import (
    AdapterIssue,
    CANVAS_PRESETS,
    CompiledScene,
    RendererAdapter,
    builtin_provenance,
    clamp,
    ease,
    finite,
)
from bkt_web.universal_storyboard import Scene


RENDERER_ID = "three-d-spike-v1"
RENDERER_VERSION = "0.1.0"

KINDS = ("mesh", "light")
ACTIONS = ("td.translate", "td.rotate", "td.orbit")
PRIMITIVES = ("cube", "pyramid", "plane")

Vector = tuple[float, float, float]


def _sub(a: Vector, b: Vector) -> Vector:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a: Vector, b: Vector) -> Vector:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a: Vector, b: Vector) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _normalise(a: Vector) -> Vector:
    length = math.sqrt(_dot(a, a))
    return (0.0, 0.0, 0.0) if length < 1e-12 else (a[0] / length, a[1] / length, a[2] / length)


def primitive_mesh(name: str) -> dict[str, Any]:
    """Unit-sized primitives centred on the origin."""
    if name == "cube":
        vertices = [
            (-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5),
            (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5),
        ]
        faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]
    elif name == "pyramid":
        vertices = [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, -0.5, 0.5), (-0.5, -0.5, 0.5), (0.0, 0.5, 0.0)]
        faces = [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]
    elif name == "plane":
        vertices = [(-0.5, 0.0, -0.5), (0.5, 0.0, -0.5), (0.5, 0.0, 0.5), (-0.5, 0.0, 0.5)]
        faces = [[0, 1, 2, 3]]
    else:
        raise ValueError(f"primitive không được hỗ trợ: {name}")
    return {"vertices": vertices, "faces": faces}


def _shade(colour: str, intensity: float) -> str:
    value = colour.lstrip("#")
    channels = [int(value[index : index + 2], 16) for index in (0, 2, 4)]
    return "#" + "".join(f"{min(255, max(0, round(channel * intensity))):02x}" for channel in channels)


def _point(value: Any) -> bool:
    return isinstance(value, dict) and all(finite(value.get(axis)) for axis in ("x", "y", "z"))


def _vector(value: Mapping[str, Any]) -> Vector:
    return (float(value["x"]), float(value["y"]), float(value["z"]))


class ThreeDSpikeAdapter(RendererAdapter):
    renderer_id = RENDERER_ID
    renderer_version = RENDERER_VERSION
    frame_mode = "draw-list"
    default_canvas = dict(CANVAS_PRESETS["16:9"])
    supported_canvases = tuple(dict(value) for value in CANVAS_PRESETS.values())

    def inspect_capabilities(self) -> dict[str, Any]:
        assets: dict[str, Any] = {}
        for asset_id, entity_type, actions in (
            ("td.primitive", "mesh", ACTIONS),
            ("td.light", "light", ("td.rotate",)),
        ):
            entry = {
                "id": asset_id,
                "version": RENDERER_VERSION,
                "renderer": RENDERER_ID,
                "entity_types": [entity_type],
                "anchors": ["origin"],
                "actions": sorted(actions),
                "states": ["visible", "hidden"],
            }
            entry["provenance"] = builtin_provenance(entry)
            assets[asset_id] = entry
        actions = {
            action_id: {
                "id": action_id,
                "version": RENDERER_VERSION,
                "actors": sorted(asset_id for asset_id, entry in assets.items() if action_id in entry["actions"]),
                "targets": [],
            }
            for action_id in ACTIONS
        }
        return {
            "schema": "tokmatrix.capability-registry/v1",
            "version": "1.0.0",
            "renderers": {
                RENDERER_ID: {
                    "id": RENDERER_ID,
                    "version": RENDERER_VERSION,
                    "media": ["3d-spike"],
                    "features": {
                        "deterministic_seek": True,
                        "offline_render": True,
                        "alpha_output": False,
                        "audio_tracks": False,
                        "nested_compositions": False,
                        # Honest limits of the spike: flat shading only.
                        "textures": False,
                        "shadows": False,
                        "production_ready": False,
                    },
                    "supports": {"entities": sorted(KINDS), "actions": sorted(ACTIONS), "materials": [], "effects": []},
                    "fallbacks": [],
                    "limits": {
                        "max_entities_per_project": 12,
                        "max_scene_duration_seconds": 600,
                        "canvas_sizes": [[item["width"], item["height"]] for item in self.supported_canvases],
                    },
                    "fidelity": {"photorealism": 0.25, "character_motion": 0.0, "typography": 0.0},
                    "maturity": "spike",
                }
            },
            "assets": assets,
            "actions": actions,
            "materials": {},
            "effects": {},
            "fallbacks": {},
        }

    # -- validation -------------------------------------------------------
    def _validate(self, scene: Scene, assets: Mapping[str, Any]) -> list[AdapterIssue]:
        issues: list[AdapterIssue] = []
        meshes = lights = 0
        for index, entity in enumerate(scene.entities):
            path = f"$.entities[{index}]"
            attributes = entity.attributes
            if entity.kind not in KINDS:
                issues.append(AdapterIssue("TD_ENTITY_KIND_UNSUPPORTED", f"{path}.kind", f"kind không được hỗ trợ: {entity.kind}"))
                continue
            if entity.kind == "mesh":
                meshes += 1
                if attributes.get("primitive") not in PRIMITIVES:
                    issues.append(AdapterIssue("TD_PRIMITIVE_UNSUPPORTED", f"{path}.attributes.primitive", f"spike chỉ hỗ trợ {', '.join(PRIMITIVES)}"))
                if not _point(attributes.get("position")):
                    issues.append(AdapterIssue("TD_VECTOR_INVALID", f"{path}.attributes.position", "cần vector {x,y,z}"))
                scale = attributes.get("scale", 1.0)
                if not finite(scale) or scale <= 0:
                    issues.append(AdapterIssue("TD_SCALE_INVALID", f"{path}.attributes.scale", "scale phải là số dương"))
            else:
                lights += 1
                if not _point(attributes.get("direction")):
                    issues.append(AdapterIssue("TD_VECTOR_INVALID", f"{path}.attributes.direction", "cần vector {x,y,z}"))
                intensity = attributes.get("intensity", 1.0)
                if not finite(intensity) or not 0 <= intensity <= 4:
                    issues.append(AdapterIssue("TD_INTENSITY_INVALID", f"{path}.attributes.intensity", "intensity phải nằm trong [0,4]"))
        if meshes == 0:
            issues.append(AdapterIssue("TD_MESH_MISSING", "$.entities", "cần ít nhất một mesh"))
        if lights != 1:
            issues.append(AdapterIssue("TD_LIGHT_COUNT", "$.entities", "spike hỗ trợ đúng một directional light"))
        shot = scene.camera.shots[0]
        for key in ("position", "look_at"):
            if not _point(shot.parameters.get(key)):
                issues.append(AdapterIssue("TD_CAMERA_INVALID", f"$.camera.shots[0].parameters.{key}", "camera cần position và look_at"))
        fov = shot.parameters.get("fov_degrees", 45.0)
        if not finite(fov) or not 5 <= fov <= 150:
            issues.append(AdapterIssue("TD_CAMERA_FOV_INVALID", "$.camera.shots[0].parameters.fov_degrees", "fov_degrees phải nằm trong [5,150]"))
        if shot.movement == "orbit" and not finite(shot.parameters.get("orbit_degrees", 0.0)):
            issues.append(AdapterIssue("TD_CAMERA_ORBIT_INVALID", "$.camera.shots[0].parameters.orbit_degrees", "orbit_degrees phải là số"))
        for index, action in enumerate(scene.actions):
            if action.type not in ACTIONS:
                issues.append(AdapterIssue("TD_ACTION_UNSUPPORTED", f"$.actions[{index}].type", f"action không được hỗ trợ: {action.type}"))
        return issues

    # -- compile ----------------------------------------------------------
    def _compile(self, scene: Scene, assets: Mapping[str, Any], canvas: dict[str, int]) -> CompiledScene:
        meshes: list[dict[str, Any]] = []
        light: dict[str, Any] = {}
        used: list[dict[str, Any]] = []
        for entity in scene.entities:
            attributes = entity.attributes
            if entity.kind == "mesh":
                meshes.append({
                    "entity_id": entity.entity_id,
                    "primitive": attributes["primitive"],
                    "position": _vector(attributes["position"]),
                    "scale": float(attributes.get("scale", 1.0)),
                    "colour": attributes.get("colour", "#8ab6a0"),
                    "spin_degrees_per_second": float(attributes.get("spin_degrees_per_second", 0.0)),
                    "mesh": primitive_mesh(attributes["primitive"]),
                })
                used.append({"asset_id": "td.primitive", "entity_id": entity.entity_id, "provenance": "built-in"})
            else:
                light = {
                    "entity_id": entity.entity_id,
                    "direction": _normalise(_vector(attributes["direction"])),
                    "intensity": float(attributes.get("intensity", 1.0)),
                    "ambient": float(attributes.get("ambient", 0.25)),
                }
                used.append({"asset_id": "td.light", "entity_id": entity.entity_id, "provenance": "built-in"})
        meshes.sort(key=lambda item: item["entity_id"])
        shot = scene.camera.shots[0]
        camera = {
            "position": _vector(shot.parameters["position"]),
            "look_at": _vector(shot.parameters["look_at"]),
            "fov_degrees": float(shot.parameters.get("fov_degrees", 45.0)),
            "orbit_degrees": float(shot.parameters.get("orbit_degrees", 0.0)) if shot.movement == "orbit" else 0.0,
            "ease": str(shot.parameters.get("ease", "smooth")),
            "start": shot.start,
            "end": shot.end,
        }
        return CompiledScene(
            renderer_id=self.renderer_id,
            renderer_version=self.renderer_version,
            scene_id=scene.scene_id,
            start=scene.start,
            end=scene.end,
            canvas=canvas,
            frame_mode=self.frame_mode,
            fidelity_class="3d-spike",
            source_media_usage="none",
            plan={"meshes": meshes, "light": light, "camera": camera},
            assets=tuple(used),
            warnings=("three-d-spike-v1 là research spike: flat shading, không texture, không shadow.",),
        )

    # -- frames -----------------------------------------------------------
    def camera_at(self, camera: Mapping[str, Any], seconds: float) -> dict[str, Any]:
        span = max(camera["end"] - camera["start"], 1e-9)
        u = ease(camera["ease"], clamp((seconds - camera["start"]) / span))
        angle = math.radians(camera["orbit_degrees"] * u)
        target = camera["look_at"]
        offset = _sub(camera["position"], target)
        x = offset[0] * math.cos(angle) - offset[2] * math.sin(angle)
        z = offset[0] * math.sin(angle) + offset[2] * math.cos(angle)
        return {"position": (target[0] + x, target[1] + offset[1], target[2] + z), "look_at": target, "fov_degrees": camera["fov_degrees"]}

    def _frame(self, compiled: CompiledScene, seconds: float) -> dict[str, Any]:
        canvas, plan = compiled.canvas, compiled.plan
        camera = self.camera_at(plan["camera"], seconds)
        eye = camera["position"]
        forward = _normalise(_sub(camera["look_at"], eye))
        right = _normalise(_cross(forward, (0.0, 1.0, 0.0)))
        up = _cross(right, forward)
        focal = (canvas["height"] / 2) / math.tan(math.radians(camera["fov_degrees"]) / 2)
        light = plan["light"]
        polygons: list[dict[str, Any]] = []
        culled = 0
        for mesh in plan["meshes"]:
            spin = math.radians(mesh["spin_degrees_per_second"] * (seconds - compiled.start))
            world = []
            for vertex in mesh["mesh"]["vertices"]:
                x = vertex[0] * math.cos(spin) - vertex[2] * math.sin(spin)
                z = vertex[0] * math.sin(spin) + vertex[2] * math.cos(spin)
                world.append((
                    mesh["position"][0] + x * mesh["scale"],
                    mesh["position"][1] + vertex[1] * mesh["scale"],
                    mesh["position"][2] + z * mesh["scale"],
                ))
            for face in mesh["mesh"]["faces"]:
                points = [world[index] for index in face]
                normal = _normalise(_cross(_sub(points[1], points[0]), _sub(points[2], points[0])))
                centroid = tuple(sum(point[axis] for point in points) / len(points) for axis in range(3))
                if _dot(normal, _sub(centroid, eye)) >= 0:
                    culled += 1
                    continue
                projected = []
                depth = 0.0
                behind = False
                for point in points:
                    relative = _sub(point, eye)
                    camera_z = _dot(relative, forward)
                    if camera_z <= 1e-6:
                        behind = True
                        break
                    depth += camera_z
                    projected.append([
                        round(canvas["width"] / 2 + focal * _dot(relative, right) / camera_z, 6),
                        round(canvas["height"] / 2 - focal * _dot(relative, up) / camera_z, 6),
                    ])
                if behind:
                    culled += 1
                    continue
                lambert = max(0.0, -_dot(normal, light["direction"]))
                intensity = clamp(light["ambient"] + lambert * light["intensity"], 0.0, 2.0)
                polygons.append({
                    "op": "polygon",
                    "points": projected,
                    "fill": _shade(mesh["colour"], intensity),
                    "depth": round(depth / len(points), 6),
                    "entity_id": mesh["entity_id"],
                })
        # Painter's algorithm: far polygons first, ties broken by entity ID so
        # the ordering never depends on dictionary iteration luck.
        polygons.sort(key=lambda item: (-item["depth"], item["entity_id"], item["points"]))
        return {
            "layers": [{"layer_id": "3d", "z": 0, "opacity": 1.0, "ops": polygons}],
            "stats": {"polygons": len(polygons), "culled": culled, "camera_position": [round(value, 6) for value in eye]},
        }

    # -- spike cost report ------------------------------------------------
    def cost_report(self, compiled: CompiledScene | None = None, *, samples: int = 24) -> dict[str, Any]:
        """Measured cost of the spike.  Timings are informational, not asserted."""
        target = compiled or self._compiled
        if target is None:
            raise ValueError("cần compile() trước khi đo chi phí")
        times = [target.start + index * (target.end - target.start) / max(samples - 1, 1) for index in range(samples)]
        started = time.perf_counter()
        frames = [self.render_frame(value, compiled=target) for value in times]
        elapsed = time.perf_counter() - started
        polygons = [frame["stats"]["polygons"] for frame in frames]
        return {
            "renderer_id": self.renderer_id,
            "renderer_version": self.renderer_version,
            "maturity": "spike",
            "samples": samples,
            "polygons_per_frame": {"min": min(polygons), "max": max(polygons), "mean": round(sum(polygons) / len(polygons), 3)},
            "meshes": len(target.plan["meshes"]),
            "seconds_total": round(elapsed, 6),
            "seconds_per_frame": round(elapsed / samples, 6),
            "deterministic_seek": True,
            "notes": [
                "Software rasteriser trong Python; đủ cho spike, chưa đủ cho production.",
                "Chưa có texture, shadow, anti-aliasing hay z-buffer per-pixel.",
                "Cần đánh giá GPU/offline renderer trước khi productionize (UV-405).",
            ],
        }


ADAPTER = ThreeDSpikeAdapter

__all__ = ["ADAPTER", "RENDERER_ID", "ThreeDSpikeAdapter", "primitive_mesh"]
