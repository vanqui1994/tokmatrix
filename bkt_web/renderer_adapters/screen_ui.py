"""UV-402 — screen / UI adapter.

Renders screen recordings rebuilt from frozen screenshots: cursor motion,
click feedback, focus rings, highlights, deterministic crop/zoom and
redaction.

Privacy is a hard gate, not a warning.  Any region marked
``contains_private_data`` must be fully covered by a redaction for the whole
scene, otherwise compilation fails.  Images must be frozen locally: a remote
URI is rejected so a frame never depends on the network.
"""

from __future__ import annotations

from typing import Any, Mapping

from bkt_web.renderer_adapters.base import (
    AdapterIssue,
    CANVAS_PRESETS,
    CompiledScene,
    RendererAdapter,
    builtin_provenance,
    clamp,
    ease,
)
from bkt_web.universal_storyboard import Scene


RENDERER_ID = "screen-ui-v1"
RENDERER_VERSION = "1.0.0"

KINDS = ("screenshot", "cursor", "highlight", "redaction", "focus_ring")
ACTIONS = ("ui.cursor-move", "ui.click", "ui.type", "ui.scroll", "ui.zoom", "ui.highlight", "ui.redact")
EFFECTS = ("ui.dim", "ui.blur")
REDACTION_STYLES = ("blur", "solid")
FULL_REGION = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}


def _region(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    for key in ("x", "y", "width", "height"):
        item = value.get(key)
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not 0 <= item <= 1:
            return False
    return value["width"] > 0 and value["height"] > 0 and value["x"] + value["width"] <= 1.0001 and value["y"] + value["height"] <= 1.0001


def _covers(outer: Mapping[str, float], inner: Mapping[str, float]) -> bool:
    return (
        outer["x"] <= inner["x"] + 1e-9
        and outer["y"] <= inner["y"] + 1e-9
        and outer["x"] + outer["width"] >= inner["x"] + inner["width"] - 1e-9
        and outer["y"] + outer["height"] >= inner["y"] + inner["height"] - 1e-9
    )


def _lerp_region(start: Mapping[str, float], end: Mapping[str, float], u: float) -> dict[str, float]:
    return {key: start[key] + (end[key] - start[key]) * u for key in ("x", "y", "width", "height")}


class ScreenUiAdapter(RendererAdapter):
    renderer_id = RENDERER_ID
    renderer_version = RENDERER_VERSION
    frame_mode = "draw-list"
    default_canvas = dict(CANVAS_PRESETS["16:9"])
    supported_canvases = tuple(dict(value) for value in CANVAS_PRESETS.values())

    def inspect_capabilities(self) -> dict[str, Any]:
        asset_actions = {
            "ui.screenshot": ["ui.scroll", "ui.zoom"],
            "ui.cursor": ["ui.click", "ui.cursor-move", "ui.type"],
            "ui.highlight": ["ui.highlight"],
            "ui.redaction": ["ui.redact"],
            "ui.focus-ring": ["ui.highlight"],
        }
        entity_types = {
            "ui.screenshot": "screenshot",
            "ui.cursor": "cursor",
            "ui.highlight": "highlight",
            "ui.redaction": "redaction",
            "ui.focus-ring": "focus_ring",
        }
        assets: dict[str, Any] = {}
        for asset_id, actions in asset_actions.items():
            entry = {
                "id": asset_id,
                "version": RENDERER_VERSION,
                "renderer": RENDERER_ID,
                "entity_types": [entity_types[asset_id]],
                "anchors": ["top-left", "center"],
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
                    "media": ["screen-capture", "raster-2d"],
                    "features": {
                        "deterministic_seek": True,
                        "offline_render": True,
                        "alpha_output": False,
                        "audio_tracks": False,
                        "nested_compositions": False,
                        "redaction": True,
                    },
                    "supports": {"entities": sorted(KINDS), "actions": sorted(ACTIONS), "materials": [], "effects": sorted(EFFECTS)},
                    "fallbacks": [],
                    "limits": {
                        "max_entities_per_project": 200,
                        "max_scene_duration_seconds": 3600,
                        "canvas_sizes": [[item["width"], item["height"]] for item in self.supported_canvases],
                    },
                    "fidelity": {"photorealism": 0.6, "character_motion": 0.0, "typography": 0.8},
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
        images = assets.get("images") if isinstance(assets.get("images"), dict) else {}
        issues: list[AdapterIssue] = []
        kinds: dict[str, str] = {}
        private: list[tuple[str, dict[str, float]]] = []
        redactions: list[dict[str, float]] = []
        screenshots = 0
        for index, entity in enumerate(scene.entities):
            path = f"$.entities[{index}]"
            attributes = entity.attributes
            if entity.kind not in KINDS:
                issues.append(AdapterIssue("UI_ENTITY_KIND_UNSUPPORTED", f"{path}.kind", f"kind không được hỗ trợ: {entity.kind}"))
                continue
            kinds[entity.entity_id] = entity.kind
            if entity.kind == "screenshot":
                screenshots += 1
                image_id = attributes.get("image_id")
                image = images.get(image_id) if isinstance(image_id, str) else None
                if not isinstance(image, dict):
                    issues.append(AdapterIssue("UI_IMAGE_NOT_FROZEN", f"{path}.attributes.image_id", "ảnh phải được khai báo trong assets['images'] và có sẵn offline"))
                else:
                    uri = str(image.get("uri", ""))
                    if uri.startswith(("http://", "https://", "//")):
                        issues.append(AdapterIssue("UI_IMAGE_REMOTE", f"{path}.attributes.image_id", "ảnh phải được freeze local, không dùng URL mạng"))
                    if not isinstance(image.get("sha256"), str) or len(str(image.get("sha256"))) != 64:
                        issues.append(AdapterIssue("UI_IMAGE_CHECKSUM_MISSING", f"{path}.attributes.image_id", "ảnh cần sha256 để kiểm chứng provenance"))
            if entity.kind in {"highlight", "redaction", "focus_ring"} or attributes.get("region") is not None:
                region = attributes.get("region")
                if not _region(region):
                    issues.append(AdapterIssue("UI_REGION_INVALID", f"{path}.attributes.region", "region phải chuẩn hoá trong [0,1]"))
                    continue
                if entity.kind == "redaction":
                    style = attributes.get("style", "blur")
                    if style not in REDACTION_STYLES:
                        issues.append(AdapterIssue("UI_REDACTION_STYLE_UNSUPPORTED", f"{path}.attributes.style", f"style không được hỗ trợ: {style}"))
                    redactions.append(dict(region))
            if attributes.get("contains_private_data") is True:
                region = attributes.get("region")
                private.append((entity.entity_id, dict(region) if _region(region) else dict(FULL_REGION)))
            if entity.kind == "cursor":
                path_keys = attributes.get("path")
                if not isinstance(path_keys, list) or not path_keys:
                    issues.append(AdapterIssue("UI_CURSOR_PATH_MISSING", f"{path}.attributes.path", "cursor cần keyframe path"))
                else:
                    for position, key in enumerate(path_keys):
                        key_path = f"{path}.attributes.path[{position}]"
                        if not isinstance(key, dict) or not all(
                            not isinstance(key.get(name), bool) and isinstance(key.get(name), (int, float)) for name in ("time", "x", "y")
                        ):
                            issues.append(AdapterIssue("UI_CURSOR_KEY_INVALID", key_path, "keyframe cần time/x/y là số"))
                            continue
                        if not 0 <= key["x"] <= 1 or not 0 <= key["y"] <= 1:
                            issues.append(AdapterIssue("UI_CURSOR_KEY_OUT_OF_RANGE", key_path, "toạ độ cursor phải chuẩn hoá trong [0,1]"))
                        if key["time"] < scene.start - 1e-6 or key["time"] > scene.end + 1e-6:
                            issues.append(AdapterIssue("UI_CURSOR_KEY_OUT_OF_SCENE", key_path, "keyframe nằm ngoài khoảng scene"))
        if screenshots == 0:
            issues.append(AdapterIssue("UI_SCREENSHOT_MISSING", "$.entities", "scene cần ít nhất một screenshot nền"))
        for entity_id, region in private:
            if not any(_covers(cover, region) for cover in redactions):
                issues.append(AdapterIssue("UI_PRIVATE_REGION_NOT_REDACTED", f"$.entities['{entity_id}']", "vùng chứa dữ liệu riêng tư chưa được che hoàn toàn"))
        for index, shot in enumerate(scene.camera.shots):
            path = f"$.camera.shots[{index}]"
            if shot.movement == "zoom":
                for key in ("from_region", "to_region"):
                    if not _region(shot.parameters.get(key)):
                        issues.append(AdapterIssue("UI_ZOOM_REGION_INVALID", f"{path}.parameters.{key}", "zoom cần from_region và to_region chuẩn hoá"))
                if str(shot.parameters.get("ease", "smooth")) not in {"linear", "smooth", "ease-in", "ease-out", "ease-in-out", "hold"}:
                    issues.append(AdapterIssue("UI_ZOOM_EASE_UNSUPPORTED", f"{path}.parameters.ease", "ease không được hỗ trợ"))
        for index, action in enumerate(scene.actions):
            path = f"$.actions[{index}]"
            if action.type not in ACTIONS:
                issues.append(AdapterIssue("UI_ACTION_UNSUPPORTED", f"{path}.type", f"action không được hỗ trợ: {action.type}"))
                continue
            for position, actor in enumerate(action.actor_ids):
                if actor not in kinds:
                    issues.append(AdapterIssue("UI_ACTION_REFERENCE", f"{path}.actor_ids[{position}]", f"không tìm thấy entity: {actor}"))
        return issues

    # -- compile ----------------------------------------------------------
    def _compile(self, scene: Scene, assets: Mapping[str, Any], canvas: dict[str, int]) -> CompiledScene:
        images = assets.get("images") or {}
        screenshot: dict[str, Any] | None = None
        cursors: list[dict[str, Any]] = []
        overlays: list[dict[str, Any]] = []
        redactions: list[dict[str, Any]] = []
        used: list[dict[str, Any]] = []
        for entity in scene.entities:
            attributes = entity.attributes
            if entity.kind == "screenshot" and screenshot is None:
                image = images[attributes["image_id"]]
                screenshot = {"entity_id": entity.entity_id, "image_id": attributes["image_id"], "sha256": image["sha256"], "uri": image.get("uri")}
                used.append({"asset_id": "ui.screenshot", "entity_id": entity.entity_id, "provenance": "frozen-local", "sha256": image["sha256"]})
            elif entity.kind == "cursor":
                clicks = [float(value) for value in attributes.get("click_times", []) if isinstance(value, (int, float)) and not isinstance(value, bool)]
                cursors.append({
                    "entity_id": entity.entity_id,
                    "path": sorted(({"time": float(key["time"]), "x": float(key["x"]), "y": float(key["y"]), "ease": str(key.get("ease", "smooth"))} for key in attributes["path"]), key=lambda item: item["time"]),
                    "click_times": sorted(clicks),
                })
                used.append({"asset_id": "ui.cursor", "entity_id": entity.entity_id, "provenance": "built-in"})
            elif entity.kind == "redaction":
                redactions.append({
                    "entity_id": entity.entity_id,
                    "region": dict(attributes["region"]),
                    "style": attributes.get("style", "blur"),
                    "radius": float(attributes.get("radius", 18)),
                })
                used.append({"asset_id": "ui.redaction", "entity_id": entity.entity_id, "provenance": "built-in"})
            elif entity.kind in {"highlight", "focus_ring"}:
                overlays.append({
                    "entity_id": entity.entity_id,
                    "kind": entity.kind,
                    "region": dict(attributes["region"]),
                    "stroke": attributes.get("stroke", "#ffd166"),
                    "dim": float(attributes.get("dim", 0.45)) if entity.kind == "highlight" else 0.0,
                    "start": float(attributes.get("start", scene.start)),
                    "end": float(attributes.get("end", scene.end)),
                })
                used.append({"asset_id": "ui.highlight" if entity.kind == "highlight" else "ui.focus-ring", "entity_id": entity.entity_id, "provenance": "built-in"})
        crop_shots = [
            {
                "start": shot.start,
                "end": shot.end,
                "from_region": dict(shot.parameters["from_region"]),
                "to_region": dict(shot.parameters["to_region"]),
                "ease": str(shot.parameters.get("ease", "smooth")),
            }
            for shot in scene.camera.shots
            if shot.movement == "zoom"
        ]
        crop_shots.sort(key=lambda item: item["start"])
        assert screenshot is not None  # validate() guarantees one screenshot
        return CompiledScene(
            renderer_id=self.renderer_id,
            renderer_version=self.renderer_version,
            scene_id=scene.scene_id,
            start=scene.start,
            end=scene.end,
            canvas=canvas,
            frame_mode=self.frame_mode,
            fidelity_class="screen-capture-rebuild",
            source_media_usage="none",
            plan={
                "screenshot": screenshot,
                "cursors": cursors,
                "overlays": overlays,
                "redactions": redactions,
                "crop_shots": crop_shots,
            },
            assets=tuple(used),
        )

    # -- frames -----------------------------------------------------------
    def crop_at(self, compiled: CompiledScene, seconds: float) -> dict[str, float]:
        """Deterministic crop rectangle; identical for identical timestamps."""
        region = dict(FULL_REGION)
        for shot in compiled.plan["crop_shots"]:
            if seconds <= shot["start"]:
                if seconds >= compiled.start and shot is compiled.plan["crop_shots"][0]:
                    region = dict(shot["from_region"])
                break
            span = max(shot["end"] - shot["start"], 1e-9)
            u = ease(shot["ease"], clamp((seconds - shot["start"]) / span))
            region = _lerp_region(shot["from_region"], shot["to_region"], u)
            if seconds < shot["end"]:
                break
        return {key: round(value, 9) for key, value in region.items()}

    def _frame(self, compiled: CompiledScene, seconds: float) -> dict[str, Any]:
        canvas, plan = compiled.canvas, compiled.plan
        crop = self.crop_at(compiled, seconds)

        def project(region: Mapping[str, float]) -> dict[str, float]:
            scale_x = canvas["width"] / crop["width"]
            scale_y = canvas["height"] / crop["height"]
            return {
                "x": round((region["x"] - crop["x"]) * scale_x, 4),
                "y": round((region["y"] - crop["y"]) * scale_y, 4),
                "width": round(region["width"] * scale_x, 4),
                "height": round(region["height"] * scale_y, 4),
            }

        layers: list[dict[str, Any]] = [{
            "layer_id": plan["screenshot"]["entity_id"],
            "z": 0,
            "opacity": 1.0,
            "ops": [{
                "op": "image",
                "image_id": plan["screenshot"]["image_id"],
                "sha256": plan["screenshot"]["sha256"],
                "source_rect": crop,
                "x": 0,
                "y": 0,
                "width": canvas["width"],
                "height": canvas["height"],
            }],
        }]
        for overlay in plan["overlays"]:
            visible = overlay["start"] - 1e-9 <= seconds <= overlay["end"] + 1e-9
            ops: list[dict[str, Any]] = []
            if visible:
                geometry = project(overlay["region"])
                if overlay["dim"] > 0:
                    ops.append({"op": "dim", "x": 0, "y": 0, "width": canvas["width"], "height": canvas["height"], "hole": geometry, "alpha": overlay["dim"]})
                ops.append({"op": "rect_outline", **geometry, "stroke": overlay["stroke"], "width": 4, "radius": 8})
            layers.append({"layer_id": overlay["entity_id"], "z": 1, "opacity": 1.0 if visible else 0.0, "ops": ops})
        for redaction in plan["redactions"]:
            geometry = project(redaction["region"])
            op = {"op": "blur_rect", **geometry, "radius": redaction["radius"]} if redaction["style"] == "blur" else {"op": "rect", **geometry, "fill": "#101314", "radius": 0}
            layers.append({"layer_id": redaction["entity_id"], "z": 2, "opacity": 1.0, "ops": [op]})
        for cursor in plan["cursors"]:
            point = self._cursor_at(cursor["path"], seconds)
            geometry = project({"x": point["x"], "y": point["y"], "width": 1e-9, "height": 1e-9})
            ops = [{"op": "cursor", "x": geometry["x"], "y": geometry["y"], "size": round(canvas["height"] * 0.035, 4)}]
            ripple = self._click_ripple(cursor["click_times"], seconds)
            if ripple is not None:
                ops.append({"op": "ellipse", "x": round(geometry["x"] - ripple * canvas["height"] * 0.05, 4), "y": round(geometry["y"] - ripple * canvas["height"] * 0.05, 4), "width": round(ripple * canvas["height"] * 0.1, 4), "height": round(ripple * canvas["height"] * 0.1, 4), "fill": None, "stroke": "#ffffff", "opacity": round(1 - ripple, 4)})
            layers.append({"layer_id": cursor["entity_id"], "z": 3, "opacity": 1.0, "ops": ops})
        return {"layers": layers, "crop": crop}

    @staticmethod
    def _cursor_at(keys: list[dict[str, Any]], seconds: float) -> dict[str, float]:
        if seconds <= keys[0]["time"]:
            return {"x": keys[0]["x"], "y": keys[0]["y"]}
        for previous, nxt in zip(keys, keys[1:]):
            if seconds >= nxt["time"]:
                continue
            span = max(nxt["time"] - previous["time"], 1e-9)
            u = ease(nxt["ease"], clamp((seconds - previous["time"]) / span))
            return {"x": previous["x"] + (nxt["x"] - previous["x"]) * u, "y": previous["y"] + (nxt["y"] - previous["y"]) * u}
        return {"x": keys[-1]["x"], "y": keys[-1]["y"]}

    @staticmethod
    def _click_ripple(click_times: list[float], seconds: float, duration: float = 0.35) -> float | None:
        for moment in click_times:
            if moment <= seconds < moment + duration:
                return ease("ease-out", (seconds - moment) / duration)
        return None


ADAPTER = ScreenUiAdapter

__all__ = ["ADAPTER", "RENDERER_ID", "ScreenUiAdapter"]
