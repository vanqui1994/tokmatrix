"""Generated asset pipeline — placeholder assets cho chủ đề mới (UV-902).

Khi ``asset_resolver`` trả ``ASSET_NEEDS_REVIEW`` vì entity không có trong
catalog, module này tạo **placeholder** thay vì dừng hẳn:

* Character → puppet rig (adult/child dựa trên cue gợi ý) + màu ngẫu nhiên
  nhưng tất định (hash từ entity name).
* Object → rect đơn giản + label.

Placeholder **không bịa thành asset thật**: ``provenance.kind = "generated"``,
``licence = "original-owned"``, và manifest ghi ``completion_claim = "partial"``
(trừ khi có bằng chứng đủ).  Nếu người dùng thay hình sau, provenance cập
nhật, placeholder bị xoá.

Asset tạm sống trong scope của một lần render, **không merge vào catalog vĩnh
viễn**.  Nếu pattern library promote nó, pattern sẽ mang ``provenance`` gốc.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Sequence


GENERATOR_SCHEMA = "tokmatrix.asset-generator/v1"
DEFAULT_RIG = "puppet.rig.adult"
CHILD_KEYWORDS = frozenset({"trẻ", "bé", "con", "nhỏ", "child", "kid", "baby", "em"})
PRESENTER_KEYWORDS = frozenset({"dẫn", "mc", "presenter", "host", "anchor"})

# Palette tất định: entity name → màu outfit qua hash, đẹp hơn random.
PALETTE = (
    "#2f6f5a", "#5a3d8a", "#8a4f3d", "#3d6f8a", "#6f3d5a",
    "#4a7a3d", "#7a3d4a", "#3d5a7a", "#5a7a3d", "#7a5a3d",
    "#3d8a6f", "#8a3d6f", "#6f8a3d", "#4f3d8a", "#3d8a4f",
)


class AssetGeneratorError(ValueError):
    """Raised when asset generation encounters an irrecoverable problem."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise AssetGeneratorError(message)


def _deterministic_colour(name: str) -> str:
    """Pick a colour from PALETTE, deterministic on entity name."""
    index = int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:8], 16) % len(PALETTE)
    return PALETTE[index]


def _guess_rig(entity_name: str, hints: dict[str, Any] | None = None) -> str:
    """Pick a rig id from keywords in entity name or hints."""
    combined = entity_name.lower()
    if hints:
        combined += " " + " ".join(str(v) for v in hints.values()).lower()
    if any(keyword in combined for keyword in CHILD_KEYWORDS):
        return "puppet.rig.child"
    if any(keyword in combined for keyword in PRESENTER_KEYWORDS):
        return "puppet.rig.presenter"
    return DEFAULT_RIG


@dataclass(frozen=True, slots=True)
class GeneratedAsset:
    """A placeholder asset generated for an entity that has no catalog match."""
    asset_id: str
    entity_id: str | None
    entity_name: str
    entity_kind: str
    rig_id: str | None
    skin: str
    outfit: str
    label: str
    provenance: dict[str, Any]
    licence: str = "original-owned"

    def as_dict(self) -> dict[str, Any]:
        return {
            "asset_id": self.asset_id,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "entity_kind": self.entity_kind,
            "rig_id": self.rig_id,
            "skin": self.skin,
            "outfit": self.outfit,
            "label": self.label,
            "provenance": dict(self.provenance),
            "licence": self.licence,
        }

    @property
    def checksum(self) -> str:
        """Content-addressable hash for manifest recording."""
        payload = json.dumps(self.as_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class GenerationResult:
    """Result of generating placeholder assets for a storyboard."""
    assets: tuple[GeneratedAsset, ...]
    warnings: tuple[str, ...]

    @property
    def asset_map(self) -> dict[str, GeneratedAsset]:
        return {a.asset_id: a for a in self.assets}

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": GENERATOR_SCHEMA,
            "generated_count": len(self.assets),
            "assets": [a.as_dict() for a in self.assets],
            "warnings": list(self.warnings),
        }


def generate_placeholders(
    asset_gaps: Sequence[dict[str, Any]],
    *,
    storyboard: dict[str, Any] | None = None,
) -> GenerationResult:
    """Generate placeholder assets for entities listed in asset_gaps.

    Each gap must have at minimum ``entity_name`` and ``entity_kind``.
    Characters get a puppet rig; objects get a rect+label placeholder.
    """
    _require(isinstance(asset_gaps, (list, tuple)), "asset_gaps phải là list/tuple")

    generated: list[GeneratedAsset] = []
    warnings: list[str] = []
    seen_identities: set[str] = set()

    for index, gap in enumerate(asset_gaps):
        _require(isinstance(gap, dict), f"asset_gaps[{index}] phải là object")
        entity_name = str(gap.get("entity_name", "")).strip()
        if not entity_name:
            warnings.append(f"asset_gaps[{index}]: thiếu entity_name, bỏ qua")
            continue
        entity_id = str(gap.get("entity_id", "")).strip() or None
        identity = entity_id or entity_name.casefold()
        if identity in seen_identities:
            continue
        seen_identities.add(identity)

        entity_kind = str(gap.get("entity_kind", "object"))
        hints = gap.get("hints", {})
        asset_id = f"generated.{hashlib.sha256(entity_name.encode('utf-8')).hexdigest()[:12]}"

        is_character = entity_kind in ("character", "human", "puppet", "person", "animal")
        rig_id = _guess_rig(entity_name, hints) if is_character else None
        outfit = _deterministic_colour(entity_name)

        # Skin: characters get warm skin tone, objects get neutral grey
        skin = "#f0c9a5" if is_character else "#c0c0c0"

        generated.append(GeneratedAsset(
            asset_id=asset_id,
            entity_id=entity_id,
            entity_name=entity_name,
            entity_kind=entity_kind,
            rig_id=rig_id,
            skin=skin,
            outfit=outfit,
            label=entity_name,
            provenance={
                "kind": "generated",
                "generator": "asset_generator/v1",
                "source_entity": entity_name,
                "is_placeholder": True,
            },
        ))

    return GenerationResult(
        assets=tuple(generated),
        warnings=tuple(warnings),
    )


def inject_generated_assets(
    storyboard: dict[str, Any],
    result: GenerationResult,
) -> dict[str, Any]:
    """Return a shallow copy of storyboard with generated asset attributes injected.

    For each scene entity whose name matches a generated asset, adds
    ``rig``, ``skin``, ``outfit`` and ``provenance`` to the entity's attributes.
    Does **not** mutate the original storyboard.
    """
    import copy as _copy
    sb = _copy.deepcopy(storyboard)
    by_id: dict[str, GeneratedAsset] = {a.entity_id: a for a in result.assets if a.entity_id}
    by_name: dict[str, GeneratedAsset] = {a.entity_name.casefold(): a for a in result.assets}

    for scene in sb.get("scenes", []):
        for entity in scene.get("entities", []):
            name = str(entity.get("label") or entity.get("name") or "")
            asset = by_id.get(entity.get("entity_id")) or by_name.get(name.casefold())
            if asset is None:
                continue
            attrs = entity.setdefault("attributes", {})
            if asset.rig_id and "rig" not in attrs:
                attrs["rig"] = asset.rig_id
            if "skin" not in attrs:
                attrs["skin"] = asset.skin
            if "outfit" not in attrs:
                attrs["outfit"] = asset.outfit
            attrs.setdefault("provenance", asset.provenance)
    return sb


__all__ = [
    "GENERATOR_SCHEMA",
    "AssetGeneratorError",
    "GeneratedAsset",
    "GenerationResult",
    "generate_placeholders",
    "inject_generated_assets",
]
