"""Adapter discovery and capability merging.

Adapters are listed explicitly — no import-time scanning — so the set of
renderers, and therefore routing, is identical on every machine and in every
process.  Merging is conservative: an ID may only appear twice if both
definitions are byte-identical, otherwise the conflict is raised instead of
one renderer silently shadowing another.
"""

from __future__ import annotations

import copy
from typing import Any, Iterable

from bkt_web.renderer_adapters.base import RendererAdapter
from bkt_web.renderer_adapters.footage_composite import FootageCompositeAdapter
from bkt_web.renderer_adapters.motion_graphics import MotionGraphicsAdapter
from bkt_web.renderer_adapters.native_vector import NativeVectorAdapter
from bkt_web.renderer_adapters.puppet_2d import Puppet2DAdapter
from bkt_web.renderer_adapters.screen_ui import ScreenUiAdapter
from bkt_web.renderer_adapters.three_d_spike import ThreeDSpikeAdapter


ADAPTER_CLASSES: tuple[type[RendererAdapter], ...] = (
    NativeVectorAdapter,
    MotionGraphicsAdapter,
    ScreenUiAdapter,
    FootageCompositeAdapter,
    Puppet2DAdapter,
    ThreeDSpikeAdapter,
)
SECTIONS = ("renderers", "assets", "actions", "materials", "effects", "fallbacks")


def available_adapters() -> list[str]:
    return sorted(adapter_class.renderer_id for adapter_class in ADAPTER_CLASSES)


def get_adapter(renderer_id: str) -> RendererAdapter:
    for adapter_class in ADAPTER_CLASSES:
        if adapter_class.renderer_id == renderer_id:
            return adapter_class()
    raise KeyError(f"Không có renderer adapter: {renderer_id}")


def adapter_capability_documents() -> list[dict[str, Any]]:
    """Capability sub-documents, ordered by renderer ID for determinism."""
    documents = [get_adapter(renderer_id).inspect_capabilities() for renderer_id in available_adapters()]
    from bkt_web.capability_registry import validate_registry

    for document in documents:
        validate_registry(document)
    return documents


def merge_adapter_capabilities(base: dict[str, Any], documents: Iterable[dict[str, Any]] | None = None) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    merged.setdefault("fallbacks", {})
    for document in documents if documents is not None else adapter_capability_documents():
        for section in SECTIONS:
            entries = document.get(section, {})
            target = merged.setdefault(section, {})
            for entry_id, entry in entries.items():
                existing = target.get(entry_id)
                if existing is not None and existing != entry:
                    raise ValueError(f"Capability trùng ID nhưng khác định nghĩa: {section}.{entry_id}")
                target[entry_id] = copy.deepcopy(entry)
    from bkt_web.capability_registry import validate_registry

    validate_registry(merged)
    return merged


def adapter_for_selection(selection: dict[str, Any]) -> RendererAdapter:
    """Instantiate the adapter a render-plan selection points at."""
    if selection.get("status") != "selected":
        raise ValueError(f"Selection chưa được chọn: {selection.get('status')}")
    return get_adapter(selection["renderer_id"])


__all__ = [
    "ADAPTER_CLASSES",
    "adapter_capability_documents",
    "adapter_for_selection",
    "available_adapters",
    "get_adapter",
    "merge_adapter_capabilities",
]
