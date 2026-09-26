"""Offline export bundles for renderer adapters.

A draw-list renderer exports as a self-contained HTML page: the painter
(``remake_frame_runtime.js``) plus the frames the adapter already computed in
Python on a fixed grid.  Layout and timing are never recomputed in the
browser, so an exported frame equals the Python frame.

``native-vector-v1`` keeps its own bundle (engine + catalog embedded) because
its pixels are produced by the JavaScript engine.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from bkt_web.renderer_adapters.base import AdapterError, CompiledScene, RendererAdapter, frame_times


RUNTIME_PATH = Path(__file__).resolve().parents[1] / "static" / "remake_frame_runtime.js"


def _script_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


def build_draw_list_bundle(
    adapter: RendererAdapter,
    compiled: CompiledScene | None = None,
    *,
    assets: Mapping[str, str] | None = None,
    fps: float | None = None,
) -> str:
    """Return offline HTML exposing a deterministic ``window.renderFrame``."""
    target = compiled or adapter._compiled  # noqa: SLF001 - adapter's own state
    if target is None:
        raise AdapterError(f"{adapter.renderer_id}: cần compile() trước khi export")
    if target.frame_mode != "draw-list":
        raise AdapterError(f"{adapter.renderer_id} không xuất draw-list; dùng bundle riêng của renderer")
    rate = float(fps if fps is not None else target.canvas.get("fps", 30))
    frames = [adapter.render_frame(value, compiled=target) for value in frame_times(target.start, target.end, rate)]
    runtime = RUNTIME_PATH.read_text(encoding="utf-8")
    return (
        "<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\">"
        f"<title>{target.renderer_id} · {target.scene_id}</title>"
        "<style>html,body{margin:0;background:#0b1412}canvas{display:block;margin:0 auto;max-width:100%}</style>"
        "</head><body>"
        f"<canvas id=\"stage\" width=\"{target.canvas['width']}\" height=\"{target.canvas['height']}\"></canvas>"
        f"<script>{runtime}</script>"
        f"<script>const FRAMES={_script_json(frames)};const ASSET_URLS={_script_json(dict(assets or {}))};"
        "const assets={};"
        "const player=RemakeFrameRuntime.createPlayer(document.getElementById('stage'),FRAMES,assets);"
        "window.renderFrame=seconds=>player.renderFrame(seconds);"
        "const pending=Object.entries(ASSET_URLS).map(([id,url])=>new Promise(resolve=>{"
        "const image=new Image();image.onload=()=>{assets[id]=image;resolve();};image.onerror=()=>resolve();image.src=url;}));"
        "Promise.all(pending).then(()=>{window.assetsReady=true;window.renderFrame(FRAMES[0].seconds);});"
        "</script></body></html>"
    )


__all__ = ["build_draw_list_bundle"]
