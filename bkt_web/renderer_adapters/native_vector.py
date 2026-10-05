"""UV-400 — adapter around the existing ``native-vector-v1`` engine.

This is a wrapper, not a rewrite.  The engine, the catalog and the v1 story
payload are untouched: the adapter only exposes them through the Phase 4
renderer contract, declares the capabilities the engine actually has, and
builds the offline bundle that embeds engine + catalog for frame-by-frame
export.

The engine paints in JavaScript, so this adapter declares ``host-callback``
frames.  It never pretends to rasterise frames in Python.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Mapping

from bkt_web.renderer_adapters.base import (
    AdapterError,
    AdapterIssue,
    CompiledScene,
    RendererAdapter,
)
from bkt_web.universal_storyboard import Scene


NATIVE_RENDERER = "native-vector-v1"
STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
ENGINE_PATH = STATIC_DIR / "remake_vector_engine.js"
CATALOG_PATH = STATIC_DIR / "remake_vector_catalog.json"


def _catalog() -> dict[str, Any]:
    from bkt_web.remake_vector import catalog

    return catalog()


def _script_json(value: Any) -> str:
    """Embed JSON inside <script> without letting it close the tag."""
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


class NativeVectorAdapter(RendererAdapter):
    renderer_id = NATIVE_RENDERER
    frame_mode = "host-callback"

    def __init__(self) -> None:
        catalog = _catalog()
        self.renderer_version = catalog["version"]
        canvas = {"width": catalog["canvas"]["width"], "height": catalog["canvas"]["height"], "fps": catalog["canvas"]["fps"]}
        self.default_canvas = dict(canvas)
        # Khổ ngang (story["frame"] = "landscape") vẽ trên canvas 1820×1024 cùng fps.
        from bkt_web.remake_vector import FRAMES

        landscape = {"width": FRAMES["landscape"][0], "height": FRAMES["landscape"][1], "fps": canvas["fps"]}
        self.supported_canvases = (dict(canvas), landscape)
        super().__init__()

    # -- capabilities -----------------------------------------------------
    def inspect_capabilities(self) -> dict[str, Any]:
        """Declare exactly what the engine has; nothing is overclaimed."""
        from bkt_web.capability_registry import native_registry_document

        return native_registry_document()

    # -- validation -------------------------------------------------------
    def _validate(self, scene: Scene, assets: Mapping[str, Any]) -> list[AdapterIssue]:
        catalog = _catalog()
        issues: list[AdapterIssue] = []
        known_assets = catalog["assets"]
        entity_assets: dict[str, str] = {}
        for index, entity in enumerate(scene.entities):
            asset = entity.attributes.get("asset")
            path = f"$.entities[{index}].attributes.asset"
            if not isinstance(asset, str):
                issues.append(AdapterIssue("NATIVE_ENTITY_WITHOUT_ASSET", path, "entity thiếu asset của catalog native"))
                continue
            if asset not in known_assets:
                issues.append(AdapterIssue("NATIVE_ASSET_UNKNOWN", path, f"asset không có trong catalog: {asset}"))
                continue
            entity_assets[entity.entity_id] = asset
        for index, action in enumerate(scene.actions):
            path = f"$.actions[{index}]"
            spec = catalog["actions"].get(action.type)
            if spec is None:
                issues.append(AdapterIssue("NATIVE_ACTION_UNSUPPORTED", f"{path}.type", f"engine không hỗ trợ action: {action.type}"))
                continue
            for role, allowed in (("actor_ids", "actors"), ("target_ids", "targets")):
                for position, reference in enumerate(getattr(action, role)):
                    asset = entity_assets.get(reference)
                    if asset is None:
                        issues.append(AdapterIssue("NATIVE_ACTION_REFERENCE", f"{path}.{role}[{position}]", f"không tìm thấy entity native: {reference}"))
                    elif spec[allowed] and asset not in spec[allowed]:
                        issues.append(AdapterIssue("NATIVE_ACTION_ASSET_MISMATCH", f"{path}.{role}[{position}]", f"asset {asset} không hợp lệ cho action {action.type}"))
        if assets.get("storyboard") is None:
            issues.append(AdapterIssue("NATIVE_STORY_PAYLOAD_MISSING", "$.assets.storyboard", "cần storyboard v2 đã migrate để khôi phục story v1"))
        return issues

    # -- compile ----------------------------------------------------------
    def _compile(self, scene: Scene, assets: Mapping[str, Any], canvas: dict[str, int]) -> CompiledScene:
        from bkt_web.storyboard_migration import restore_v1_from_v2

        story = restore_v1_from_v2(copy.deepcopy(assets["storyboard"]))
        index = self._scene_index(scene, story)
        if index is None:
            raise AdapterError(f"{self.renderer_id}: không tìm thấy scene {scene.scene_id} trong story v1")
        catalog = _catalog()
        from bkt_web.remake_vector import frame_size

        # Canvas theo khổ của story (dọc 576×1024, ngang 1820×1024); fps giữ theo yêu cầu.
        try:
            width, height = frame_size(story)
        except ValueError as exc:
            raise AdapterError(f"{self.renderer_id}: {exc}") from exc
        canvas = {**canvas, "width": width, "height": height}
        return CompiledScene(
            renderer_id=self.renderer_id,
            renderer_version=self.renderer_version,
            scene_id=scene.scene_id,
            start=scene.start,
            end=scene.end,
            canvas=canvas,
            frame_mode=self.frame_mode,
            fidelity_class="native-vector",
            source_media_usage="none",
            plan={
                # The v1 story is carried through byte-identical so the five
                # library examples keep rendering exactly as before.
                "story": story,
                "scene_index": index,
                "catalog_version": catalog["version"],
                "engine": ENGINE_PATH.name,
                "offline_frame_render": "javascript",
                "entry": "window.renderFrame",
            },
            assets=tuple(
                {"asset_id": entity.attributes["asset"], "entity_id": entity.entity_id, "provenance": "built-in"}
                for entity in scene.entities
            ),
        )

    @staticmethod
    def _scene_index(scene: Scene, story: Mapping[str, Any]) -> int | None:
        """Match by explicit source times; never by re-slicing the timeline."""
        for index, item in enumerate(story.get("scenes", [])):
            if abs(float(item["start_time"]) - scene.start) <= 1e-6 and abs(float(item["end_time"]) - scene.end) <= 1e-6:
                return index
        return None

    # -- frames -----------------------------------------------------------
    def _frame(self, compiled: CompiledScene, seconds: float) -> dict[str, Any]:
        return {
            "layers": None,
            "host": {
                "runtime": self.renderer_id,
                "entry": compiled.plan["entry"],
                "argument_seconds": seconds,
                "engine": compiled.plan["engine"],
                "catalog_version": compiled.plan["catalog_version"],
                "scene_index": compiled.plan["scene_index"],
                "deterministic_seek": True,
                "python_rasterisation": False,
            },
        }

    # -- offline bundle ---------------------------------------------------
    def offline_bundle(self, compiled: CompiledScene | None = None) -> str:
        """Self-contained HTML with engine + catalog embedded, no RAF loop."""
        target = compiled or self._compiled
        if target is None:
            raise AdapterError(f"{self.renderer_id}: cần compile() trước khi tạo offline bundle")
        try:
            from bkt_web.remake_vector import engine_sources
        except ImportError:
            from remake_vector import engine_sources
        # Không quay về engine lõi khi gói lỗi: video sẽ thiếu rig mà vẫn báo hoàn thành.
        engine = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        story = target.plan["story"]
        return (
            "<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\">"
            f"<title>{target.scene_id}</title>"
            "<style>html,body{margin:0;background:#0b1412}canvas{display:block;margin:0 auto}</style>"
            "</head><body>"
            f"<canvas id=\"stage\" width=\"{target.canvas['width']}\" height=\"{target.canvas['height']}\"></canvas>"
            f"<script>{engine}</script>"
            f"<script>const CATALOG={_script_json(catalog)};const STORY={_script_json(story)};"
            "const renderer=new RemakeVector.Renderer(document.getElementById('stage'),CATALOG,STORY);"
            "window.renderFrame=seconds=>renderer.render(seconds);"
            "window.renderFrame(0);"
            "</script></body></html>"
        )


ADAPTER = NativeVectorAdapter


__all__ = ["ADAPTER", "NATIVE_RENDERER", "NativeVectorAdapter"]
