"""UV-403 — footage composite adapter.

Clip, crop, mask, overlay, background removal and color transforms over the
source footage.

Reusing source media is never silent.  Every compile emits a manifest that
names each segment of source footage it keeps, the compiled scene is labelled
``source-composite`` (never a full remake), and an approval-required fallback
records the disclosure.  When the fidelity policy forbids source reuse the
adapter refuses to compile instead of quietly shipping the original frames.
"""

from __future__ import annotations

from typing import Any, Mapping

from bkt_web.renderer_adapters.base import (
    AdapterIssue,
    CANVAS_PRESETS,
    CompiledScene,
    RendererAdapter,
    SceneNotSupported,
    builtin_provenance,
    clamp,
    fallback_record,
    finite,
)
from bkt_web.universal_storyboard import Scene


RENDERER_ID = "footage-composite-v1"
RENDERER_VERSION = "1.0.0"

KINDS = ("footage", "overlay", "mask")
ACTIONS = ("fc.cut", "fc.crop", "fc.mask", "fc.overlay", "fc.remove-background", "fc.color-transform")
EFFECTS = ("fc.matte", "fc.color-grade")
NO_REUSE_CAPABILITIES = {"feature.no_source_media_reuse", "fidelity.no_source_reuse"}
COLOR_RANGES = {"exposure": (-4.0, 4.0), "contrast": (0.0, 4.0), "saturation": (0.0, 4.0), "temperature": (-1.0, 1.0)}


def _region(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    for key in ("x", "y", "width", "height"):
        item = value.get(key)
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not 0 <= item <= 1:
            return False
    return value["width"] > 0 and value["height"] > 0 and value["x"] + value["width"] <= 1.0001 and value["y"] + value["height"] <= 1.0001


class FootageCompositeAdapter(RendererAdapter):
    renderer_id = RENDERER_ID
    renderer_version = RENDERER_VERSION
    frame_mode = "draw-list"
    default_canvas = dict(CANVAS_PRESETS["9:16"])
    supported_canvases = tuple(dict(value) for value in CANVAS_PRESETS.values())

    def inspect_capabilities(self) -> dict[str, Any]:
        asset_actions = {
            "fc.clip": ["fc.color-transform", "fc.crop", "fc.cut", "fc.remove-background"],
            "fc.overlay": ["fc.overlay"],
            "fc.mask": ["fc.mask"],
        }
        entity_types = {"fc.clip": "footage", "fc.overlay": "overlay", "fc.mask": "mask"}
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
        fallbacks = {
            "fc.source-reuse": {
                "id": "fc.source-reuse",
                "version": RENDERER_VERSION,
                "provides": [{"kind": "media", "id": "source-footage"}],
                "conflicts_with": [{"kind": "feature", "id": "no_source_media_reuse"}],
                "cost": 0.8,
                "requires_approval": True,
                "changes_fidelity_class": True,
                "disclosure": "Cảnh giữ lại footage nguồn; đây là bản dựng lai, không phải remake hoàn chỉnh.",
            }
        }
        return {
            "schema": "tokmatrix.capability-registry/v1",
            "version": "1.0.0",
            "renderers": {
                RENDERER_ID: {
                    "id": RENDERER_ID,
                    "version": RENDERER_VERSION,
                    "media": ["footage", "raster-2d"],
                    "features": {
                        "deterministic_seek": True,
                        "offline_render": True,
                        "alpha_output": True,
                        "audio_tracks": True,
                        "nested_compositions": False,
                        "source_media_reuse": True,
                    },
                    "supports": {"entities": sorted(KINDS), "actions": sorted(ACTIONS), "materials": [], "effects": sorted(EFFECTS)},
                    "fallbacks": ["fc.source-reuse"],
                    "limits": {
                        "max_entities_per_project": 100,
                        "max_scene_duration_seconds": 7200,
                        "canvas_sizes": [[item["width"], item["height"]] for item in self.supported_canvases],
                    },
                    "fidelity": {"photorealism": 1.0, "character_motion": 1.0, "typography": 0.5},
                }
            },
            "assets": assets,
            "actions": actions,
            "materials": {},
            "effects": {effect_id: {"id": effect_id, "version": RENDERER_VERSION} for effect_id in EFFECTS},
            "fallbacks": fallbacks,
        }

    # -- policy -----------------------------------------------------------
    @staticmethod
    def source_reuse_allowed(scene: Scene, assets: Mapping[str, Any]) -> tuple[bool, str | None, list[str]]:
        blocking = [
            item.requirement_id
            for item in scene.render_requirements.required
            if item.capability in NO_REUSE_CAPABILITIES
        ]
        if blocking:
            return False, "fidelity policy của scene cấm dùng lại media nguồn", blocking
        policy = assets.get("policy")
        if isinstance(policy, Mapping) and policy.get("allow_source_reuse") is False:
            return False, "policy của render job cấm dùng lại media nguồn", []
        return True, None, []

    # -- validation -------------------------------------------------------
    def _validate(self, scene: Scene, assets: Mapping[str, Any]) -> list[AdapterIssue]:
        sources = assets.get("sources") if isinstance(assets.get("sources"), dict) else {}
        issues: list[AdapterIssue] = []
        allowed, reason, blocking = self.source_reuse_allowed(scene, assets)
        mask_ids = {entity.entity_id for entity in scene.entities if entity.kind == "mask"}
        clips = 0
        for index, entity in enumerate(scene.entities):
            path = f"$.entities[{index}]"
            attributes = entity.attributes
            if entity.kind not in KINDS:
                issues.append(AdapterIssue("FC_ENTITY_KIND_UNSUPPORTED", f"{path}.kind", f"kind không được hỗ trợ: {entity.kind}"))
                continue
            if entity.kind == "mask":
                if not _region(attributes.get("region")) and not isinstance(attributes.get("path"), str):
                    issues.append(AdapterIssue("FC_MASK_INVALID", f"{path}.attributes", "mask cần region chuẩn hoá hoặc path SVG"))
                continue
            if entity.kind == "overlay":
                if not _region(attributes.get("region")):
                    issues.append(AdapterIssue("FC_REGION_INVALID", f"{path}.attributes.region", "overlay cần region chuẩn hoá"))
                continue
            clips += 1
            if not allowed:
                issues.append(AdapterIssue("FC_SOURCE_REUSE_FORBIDDEN", f"{path}.attributes.source_id", f"{reason}: {', '.join(blocking) or 'render policy'}"))
            source_id = attributes.get("source_id")
            source = sources.get(source_id) if isinstance(source_id, str) else None
            if not isinstance(source, dict):
                issues.append(AdapterIssue("FC_SOURCE_NOT_DECLARED", f"{path}.attributes.source_id", "footage phải tham chiếu assets['sources'] đã freeze local"))
            else:
                if not isinstance(source.get("sha256"), str) or len(str(source.get("sha256"))) != 64:
                    issues.append(AdapterIssue("FC_SOURCE_CHECKSUM_MISSING", f"{path}.attributes.source_id", "source cần sha256"))
                if str(source.get("uri", "")).startswith(("http://", "https://", "//")):
                    issues.append(AdapterIssue("FC_SOURCE_REMOTE", f"{path}.attributes.source_id", "source phải có bản local trước khi render"))
            for key in ("source_start", "source_end"):
                if not finite(attributes.get(key)) or attributes[key] < 0:
                    issues.append(AdapterIssue("FC_SOURCE_INTERVAL_INVALID", f"{path}.attributes.{key}", "cần thời điểm nguồn hữu hạn >= 0"))
            if finite(attributes.get("source_start")) and finite(attributes.get("source_end")) and attributes["source_end"] <= attributes["source_start"]:
                issues.append(AdapterIssue("FC_SOURCE_INTERVAL_INVALID", f"{path}.attributes.source_end", "source_end phải lớn hơn source_start"))
            crop = attributes.get("crop")
            if crop is not None and not _region(crop):
                issues.append(AdapterIssue("FC_REGION_INVALID", f"{path}.attributes.crop", "crop phải chuẩn hoá trong [0,1]"))
            mask_ref = attributes.get("mask_id")
            if mask_ref is not None and mask_ref not in mask_ids:
                issues.append(AdapterIssue("FC_MASK_REFERENCE", f"{path}.attributes.mask_id", f"không tìm thấy mask: {mask_ref}"))
            color = attributes.get("color_transform")
            if color is not None:
                if not isinstance(color, dict):
                    issues.append(AdapterIssue("FC_COLOR_TRANSFORM_INVALID", f"{path}.attributes.color_transform", "color_transform phải là object"))
                else:
                    for key, value in color.items():
                        if key == "lut_id":
                            if not isinstance(value, str) or not value:
                                issues.append(AdapterIssue("FC_COLOR_TRANSFORM_INVALID", f"{path}.attributes.color_transform.lut_id", "lut_id phải là chuỗi"))
                            continue
                        if key not in COLOR_RANGES:
                            issues.append(AdapterIssue("FC_COLOR_TRANSFORM_UNSUPPORTED", f"{path}.attributes.color_transform.{key}", f"tham số không được hỗ trợ: {key}"))
                        elif not finite(value) or not COLOR_RANGES[key][0] <= value <= COLOR_RANGES[key][1]:
                            issues.append(AdapterIssue("FC_COLOR_TRANSFORM_INVALID", f"{path}.attributes.color_transform.{key}", "giá trị ngoài dải cho phép"))
        if clips == 0:
            issues.append(AdapterIssue("FC_CLIP_MISSING", "$.entities", "scene cần ít nhất một clip footage"))
        for index, action in enumerate(scene.actions):
            if action.type not in ACTIONS:
                issues.append(AdapterIssue("FC_ACTION_UNSUPPORTED", f"$.actions[{index}].type", f"action không được hỗ trợ: {action.type}"))
        return issues

    # -- compile ----------------------------------------------------------
    def _compile(self, scene: Scene, assets: Mapping[str, Any], canvas: dict[str, int]) -> CompiledScene:
        allowed, reason, blocking = self.source_reuse_allowed(scene, assets)
        if not allowed:
            raise SceneNotSupported(
                self.renderer_id,
                [AdapterIssue("FC_SOURCE_REUSE_FORBIDDEN", "$.render_requirements.required", f"{reason}: {', '.join(blocking) or 'render policy'}")],
            )
        sources = assets.get("sources") or {}
        masks = {
            entity.entity_id: {"region": dict(entity.attributes["region"]) if _region(entity.attributes.get("region")) else None, "path": entity.attributes.get("path")}
            for entity in scene.entities
            if entity.kind == "mask"
        }
        segments: list[dict[str, Any]] = []
        overlays: list[dict[str, Any]] = []
        used: list[dict[str, Any]] = []
        audio = False
        for entity in scene.entities:
            attributes = entity.attributes
            if entity.kind == "overlay":
                overlays.append({
                    "entity_id": entity.entity_id,
                    "region": dict(attributes["region"]),
                    "fill": attributes.get("fill", "#00000066"),
                    "start": float(attributes.get("start", scene.start)),
                    "end": float(attributes.get("end", scene.end)),
                })
                used.append({"asset_id": "fc.overlay", "entity_id": entity.entity_id, "provenance": "built-in"})
                continue
            if entity.kind != "footage":
                continue
            source = sources[attributes["source_id"]]
            out_start = float(attributes.get("start", scene.start))
            out_end = float(attributes.get("end", scene.end))
            source_start = float(attributes["source_start"])
            source_end = float(attributes["source_end"])
            out_span = max(out_end - out_start, 1e-9)
            keeps_audio = bool(attributes.get("keep_source_audio", False))
            audio = audio or keeps_audio
            operations = ["fc.cut"]
            if attributes.get("crop") is not None:
                operations.append("fc.crop")
            if attributes.get("mask_id") is not None:
                operations.append("fc.mask")
            if attributes.get("remove_background") is True:
                operations.append("fc.remove-background")
            if attributes.get("color_transform") is not None:
                operations.append("fc.color-transform")
            segments.append({
                "entity_id": entity.entity_id,
                "source_id": attributes["source_id"],
                "sha256": source["sha256"],
                "source_start": source_start,
                "source_end": source_end,
                "start": out_start,
                "end": out_end,
                "speed": (source_end - source_start) / out_span,
                "crop": dict(attributes["crop"]) if attributes.get("crop") is not None else dict({"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}),
                "mask": masks.get(attributes.get("mask_id")),
                "mask_id": attributes.get("mask_id"),
                "remove_background": bool(attributes.get("remove_background", False)),
                "color_transform": dict(attributes["color_transform"]) if attributes.get("color_transform") is not None else None,
                "keep_source_audio": keeps_audio,
                "operations": operations,
            })
            used.append({"asset_id": "fc.clip", "entity_id": entity.entity_id, "provenance": "source-footage", "sha256": source["sha256"]})
        segments.sort(key=lambda item: (item["start"], item["entity_id"]))
        usage = "visual_and_audio" if audio else "visual"
        manifest = {
            "manifest_version": "1.0.0",
            "scene_id": scene.scene_id,
            "fidelity_class": "source-composite",
            "source_media_usage": usage,
            "segments": [
                {
                    "entity_id": item["entity_id"],
                    "source_id": item["source_id"],
                    "sha256": item["sha256"],
                    "source_interval": [item["source_start"], item["source_end"]],
                    "output_interval": [item["start"], item["end"]],
                    "operations": item["operations"],
                    "keeps_source_audio": item["keep_source_audio"],
                }
                for item in segments
            ],
            "source_seconds_reused": round(sum(item["source_end"] - item["source_start"] for item in segments), 6),
        }
        disclosure = (
            "Cảnh này giữ lại "
            f"{manifest['source_seconds_reused']}s footage nguồn ({', '.join(sorted({item['source_id'] for item in segments}))}); "
            "kết quả là bản dựng lai source-composite, không phải remake hoàn chỉnh."
        )
        fallback = fallback_record(
            fallback_id=f"fallback:{scene.scene_id}:source-composite",
            scene_id=scene.scene_id,
            type="source_composite",
            reason_code="SOURCE_MEDIA_REUSED",
            disclosure=disclosure,
            source_media_usage=usage,
            approval_required=True,
        )
        return CompiledScene(
            renderer_id=self.renderer_id,
            renderer_version=self.renderer_version,
            scene_id=scene.scene_id,
            start=scene.start,
            end=scene.end,
            canvas=canvas,
            frame_mode=self.frame_mode,
            fidelity_class="source-composite",
            source_media_usage=usage,
            plan={"segments": segments, "overlays": overlays, "manifest": manifest},
            fallbacks=(fallback,),
            assets=tuple(used),
            warnings=(disclosure,),
        )

    def manifest(self, compiled: CompiledScene | None = None) -> dict[str, Any]:
        target = compiled or self._compiled
        if target is None:
            raise SceneNotSupported(self.renderer_id, [AdapterIssue("FC_NOT_COMPILED", "$", "cần compile() trước khi đọc manifest")])
        return dict(target.plan["manifest"])

    # -- frames -----------------------------------------------------------
    def _frame(self, compiled: CompiledScene, seconds: float) -> dict[str, Any]:
        canvas = compiled.canvas
        layers: list[dict[str, Any]] = []
        for index, segment in enumerate(compiled.plan["segments"]):
            active = segment["start"] - 1e-9 <= seconds <= segment["end"] + 1e-9
            ops: list[dict[str, Any]] = []
            if active:
                offset = clamp((seconds - segment["start"]) / max(segment["end"] - segment["start"], 1e-9))
                source_seconds = segment["source_start"] + offset * (segment["source_end"] - segment["source_start"])
                ops.append({
                    "op": "video_frame",
                    "source_id": segment["source_id"],
                    "sha256": segment["sha256"],
                    "source_seconds": round(source_seconds, 9),
                    "source_rect": dict(segment["crop"]),
                    "x": 0,
                    "y": 0,
                    "width": canvas["width"],
                    "height": canvas["height"],
                    "mask": segment["mask"],
                    "remove_background": segment["remove_background"],
                    "color_transform": segment["color_transform"],
                })
            layers.append({"layer_id": segment["entity_id"], "z": index, "opacity": 1.0 if active else 0.0, "ops": ops})
        for index, overlay in enumerate(compiled.plan["overlays"]):
            active = overlay["start"] - 1e-9 <= seconds <= overlay["end"] + 1e-9
            region = overlay["region"]
            ops = [{
                "op": "rect",
                "x": round(region["x"] * canvas["width"], 4),
                "y": round(region["y"] * canvas["height"], 4),
                "width": round(region["width"] * canvas["width"], 4),
                "height": round(region["height"] * canvas["height"], 4),
                "fill": overlay["fill"],
                "radius": 0,
            }] if active else []
            layers.append({"layer_id": overlay["entity_id"], "z": 100 + index, "opacity": 1.0 if active else 0.0, "ops": ops})
        return {"layers": layers, "source_media_usage": compiled.source_media_usage}


ADAPTER = FootageCompositeAdapter

__all__ = ["ADAPTER", "FootageCompositeAdapter", "RENDERER_ID"]
