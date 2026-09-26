"""Renderer adapters for the Universal Video platform (Phase 4)."""

from bkt_web.renderer_adapters.base import (
    ADAPTER_CONTRACT_VERSION,
    AdapterError,
    AdapterIssue,
    CANVAS_PRESETS,
    CompiledScene,
    FRAME_SCHEMA,
    FrameNotAvailable,
    RendererAdapter,
    SceneNotSupported,
)
from bkt_web.renderer_adapters.offline import build_draw_list_bundle
from bkt_web.renderer_adapters.registry import (
    ADAPTER_CLASSES,
    adapter_capability_documents,
    adapter_for_selection,
    available_adapters,
    get_adapter,
    merge_adapter_capabilities,
)

__all__ = [
    "ADAPTER_CLASSES",
    "ADAPTER_CONTRACT_VERSION",
    "AdapterError",
    "AdapterIssue",
    "CANVAS_PRESETS",
    "CompiledScene",
    "FRAME_SCHEMA",
    "FrameNotAvailable",
    "RendererAdapter",
    "SceneNotSupported",
    "adapter_capability_documents",
    "adapter_for_selection",
    "available_adapters",
    "build_draw_list_bundle",
    "get_adapter",
    "merge_adapter_capabilities",
]
