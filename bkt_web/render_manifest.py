"""Render manifest and observability (UV-603).

One document that says exactly what a render was made of and what it should
not be trusted for:

* the **source** it came from, by SHA-256
* the **storyboard** it rendered, by schema version and content hash
* the **renderers** that drew it, with their versions
* the **assets** it used, with their checksums
* the **fallbacks** taken, including any reuse of source media
* the **warnings** raised along the way
* the **fidelity results** from UV-600, UV-601 and UV-602

The manifest is the place a claim of completion has to survive contact with
the evidence, so two rules are enforced rather than documented:

* a manifest whose fidelity results contain a failure, or whose fallbacks
  reuse source media without approval, **cannot** be marked ``complete``;
* the completion claim is derived, not asserted: :func:`build_manifest`
  computes it from the parts and refuses a claim the parts do not support.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence


MANIFEST_SCHEMA = "tokmatrix.render-manifest/v1"
COMPLETION_CLAIMS = ("complete", "partial", "needs-review", "failed")
SOURCE_MEDIA_USAGE = ("none", "visual", "audio", "visual_and_audio")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")
_RFC3339_TZ = re.compile(r"(Z|[+-][0-9]{2}:[0-9]{2})$")


class RenderManifestError(ValueError):
    """Raised when a manifest cannot be built or does not validate."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RenderManifestError(message)


def _text(value: Any, label: str, *, limit: int = 300) -> str:
    _require(isinstance(value, str) and bool(value.strip()), f"{label} cần là chuỗi không rỗng")
    _require(len(value) <= limit, f"{label} quá dài")
    return value


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def content_hash(value: Any) -> str:
    """A stable ``sha256:`` digest of any JSON-serialisable value."""
    return "sha256:" + hashlib.sha256(canonical_json(value)).hexdigest()


def _sha256(value: Any, label: str) -> str:
    text = _text(value, label, limit=80)
    bare = text.split("sha256:", 1)[-1]
    _require(bool(_SHA256.fullmatch(bare)), f"{label} cần là SHA-256 hex")
    return bare


def _timestamp(value: Any, label: str) -> str:
    text = _text(value, label, limit=64)
    from datetime import datetime

    candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        raise RenderManifestError(f"{label} cần là RFC 3339 date-time") from None
    _require(parsed.tzinfo is not None and bool(_RFC3339_TZ.search(text)), f"{label} cần có timezone")
    return text


# --- Parts ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SourceRecord:
    source_id: str
    sha256: str
    media_type: str
    duration_seconds: float | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "source_id", _text(self.source_id, "source.source_id", limit=160))
        object.__setattr__(self, "sha256", _sha256(self.sha256, "source.sha256"))
        object.__setattr__(self, "media_type", _text(self.media_type, "source.media_type", limit=120))
        if self.duration_seconds is not None:
            value = self.duration_seconds
            _require(
                not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value >= 0,
                "source.duration_seconds không hợp lệ",
            )
            object.__setattr__(self, "duration_seconds", float(value))

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class RendererRecord:
    renderer_id: str
    version: str
    scene_ids: tuple[str, ...]
    frame_mode: str = "host-callback"

    def __post_init__(self) -> None:
        object.__setattr__(self, "renderer_id", _text(self.renderer_id, "renderer.renderer_id", limit=160))
        _require(bool(_SEMVER.fullmatch(str(self.version))), "renderer.version cần là semantic version")
        _require(bool(self.scene_ids), "renderer.scene_ids không được rỗng")
        object.__setattr__(self, "scene_ids", tuple(_text(item, "renderer.scene_id", limit=160) for item in self.scene_ids))
        object.__setattr__(self, "frame_mode", _text(self.frame_mode, "renderer.frame_mode", limit=60))

    def as_dict(self) -> dict[str, Any]:
        return {
            "renderer_id": self.renderer_id,
            "version": self.version,
            "scene_ids": list(self.scene_ids),
            "frame_mode": self.frame_mode,
        }


@dataclass(frozen=True, slots=True)
class AssetRecord:
    asset_id: str
    version: str
    checksum: str
    provenance_kind: str
    license: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "asset_id", _text(self.asset_id, "asset.asset_id", limit=160))
        _require(bool(_SEMVER.fullmatch(str(self.version))), f"asset.{self.asset_id}.version cần là semantic version")
        object.__setattr__(self, "checksum", "sha256:" + _sha256(self.checksum, f"asset.{self.asset_id}.checksum"))
        _require(
            self.provenance_kind in {"built-in", "generated", "imported", "source"},
            f"asset.{self.asset_id}.provenance_kind không hợp lệ",
        )

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class FallbackRecord:
    fallback_id: str
    scene_id: str
    type: str
    reason_code: str
    disclosure: str
    source_media_usage: str = "none"
    approved: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "fallback_id", _text(self.fallback_id, "fallback.fallback_id", limit=160))
        object.__setattr__(self, "scene_id", _text(self.scene_id, "fallback.scene_id", limit=160))
        object.__setattr__(self, "type", _text(self.type, "fallback.type", limit=60))
        _require(
            bool(re.fullmatch(r"[A-Z][A-Z0-9_]*", str(self.reason_code))),
            "fallback.reason_code cần dạng UPPER_SNAKE_CASE",
        )
        object.__setattr__(self, "disclosure", _text(self.disclosure, "fallback.disclosure", limit=4000))
        _require(self.source_media_usage in SOURCE_MEDIA_USAGE, "fallback.source_media_usage không hợp lệ")
        _require(isinstance(self.approved, bool), "fallback.approved phải là boolean")

    @property
    def reuses_source_media(self) -> bool:
        return self.source_media_usage != "none"

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class Warning_:
    code: str
    message: str
    scene_id: str | None = None

    def __post_init__(self) -> None:
        _require(bool(re.fullmatch(r"[A-Z][A-Z0-9_]*", str(self.code))), "warning.code cần dạng UPPER_SNAKE_CASE")
        object.__setattr__(self, "message", _text(self.message, "warning.message", limit=2000))

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "scene_id": self.scene_id}


@dataclass(frozen=True, slots=True)
class FidelityResult:
    """One fidelity run folded into the manifest, by kind."""

    kind: str
    passed: bool
    failure_count: int
    warning_count: int = 0
    scope: str | None = None
    report_hash: str | None = None
    metrics: dict[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require(self.kind in {"structural", "geometric", "visual", "audio", "custom"}, f"fidelity.kind không hợp lệ: {self.kind}")
        _require(isinstance(self.passed, bool), "fidelity.passed phải là boolean")
        for name in ("failure_count", "warning_count"):
            value = getattr(self, name)
            _require(not isinstance(value, bool) and isinstance(value, int) and value >= 0, f"fidelity.{name} không hợp lệ")
        _require(self.passed == (self.failure_count == 0), "fidelity.passed phải khớp với failure_count")
        object.__setattr__(self, "metrics", {str(key): float(value) for key, value in dict(self.metrics).items()})

    def as_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "passed": self.passed,
            "failure_count": self.failure_count,
            "warning_count": self.warning_count,
            "scope": self.scope,
            "report_hash": self.report_hash,
            "metrics": dict(sorted(self.metrics.items())),
        }

    @classmethod
    def from_report(cls, kind: str, report: Any, scope: str | None = None) -> "FidelityResult":
        """Fold a UV-600/601/602 report object into a manifest record."""
        payload = report.as_dict() if hasattr(report, "as_dict") else report
        _require(isinstance(payload, dict), "fidelity report phải là object hoặc có as_dict()")
        failures = getattr(report, "failures", None)
        warnings = getattr(report, "warnings", None)
        findings = payload.get("findings", [])
        failure_count = len(failures) if failures is not None else sum(1 for item in findings if item.get("severity") == "fail")
        warning_count = len(warnings) if warnings is not None else sum(1 for item in findings if item.get("severity") == "warn")
        return cls(
            kind=kind,
            passed=failure_count == 0,
            failure_count=failure_count,
            warning_count=warning_count,
            scope=scope or payload.get("scene_id") or payload.get("candidate_project_id"),
            report_hash=content_hash(payload),
            metrics={key: float(value) for key, value in dict(payload.get("metrics", {})).items()},
        )


# --- Manifest ------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RenderManifest:
    manifest_id: str
    created_at: str
    project_id: str
    storyboard_schema_version: str
    storyboard_hash: str
    source: SourceRecord
    renderers: tuple[RendererRecord, ...]
    assets: tuple[AssetRecord, ...]
    fallbacks: tuple[FallbackRecord, ...]
    warnings: tuple[Warning_, ...]
    fidelity: tuple[FidelityResult, ...]
    completion_claim: str
    claim_reasons: tuple[str, ...]

    @property
    def passed(self) -> bool:
        return self.completion_claim == "complete"

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": MANIFEST_SCHEMA,
            "manifest_id": self.manifest_id,
            "created_at": self.created_at,
            "project_id": self.project_id,
            "storyboard": {
                "schema_version": self.storyboard_schema_version,
                "hash": self.storyboard_hash,
            },
            "source": self.source.as_dict(),
            "renderers": [item.as_dict() for item in self.renderers],
            "assets": [item.as_dict() for item in self.assets],
            "fallbacks": [item.as_dict() for item in self.fallbacks],
            "warnings": [item.as_dict() for item in self.warnings],
            "fidelity": [item.as_dict() for item in self.fidelity],
            "completion_claim": self.completion_claim,
            "claim_reasons": list(self.claim_reasons),
        }

    def digest(self) -> str:
        return content_hash(self.as_dict())


def _claim(
    renderers: Sequence[RendererRecord],
    fallbacks: Sequence[FallbackRecord],
    fidelity: Sequence[FidelityResult],
    scene_ids: Sequence[str],
) -> tuple[str, tuple[str, ...]]:
    """Derive the completion claim from the evidence, never from a caller."""
    reasons: list[str] = []
    claim = "complete"

    covered = {scene_id for item in renderers for scene_id in item.scene_ids}
    uncovered = sorted(set(scene_ids) - covered)
    if uncovered:
        reasons.append(f"scenes_without_a_renderer:{','.join(uncovered)}")
        claim = "failed"

    if not fidelity:
        reasons.append("no_fidelity_result_recorded")
        claim = "needs-review" if claim == "complete" else claim

    for item in fidelity:
        if not item.passed:
            reasons.append(f"fidelity_failed:{item.kind}")
            claim = "failed"

    for item in fallbacks:
        if item.reuses_source_media:
            # Reusing the source and calling the result a finished remake is
            # the dishonesty this whole program exists to prevent.
            reasons.append(f"source_media_reused:{item.fallback_id}:{item.source_media_usage}")
            if not item.approved:
                claim = "failed"
            elif claim not in {"failed"}:
                claim = "partial"
        elif claim == "complete":
            reasons.append(f"fallback_taken:{item.fallback_id}")
            claim = "partial"

    if claim == "complete" and not reasons:
        reasons.append("all_scenes_rendered_and_every_fidelity_check_passed")
    return claim, tuple(reasons)


def build_manifest(
    *,
    manifest_id: str,
    created_at: str,
    storyboard: dict[str, Any],
    renderers: Iterable[RendererRecord | dict[str, Any]],
    assets: Iterable[AssetRecord | dict[str, Any]] = (),
    fallbacks: Iterable[FallbackRecord | dict[str, Any]] = (),
    warnings: Iterable[Warning_ | dict[str, Any]] = (),
    fidelity: Iterable[FidelityResult | dict[str, Any]] = (),
    claimed: str | None = None,
) -> RenderManifest:
    """Assemble a manifest and derive its completion claim from the parts."""
    _require(isinstance(storyboard, dict), "storyboard cần là object")
    project_id = _text(storyboard.get("project_id"), "storyboard.project_id", limit=160)
    schema_version = _text(storyboard.get("schema_version"), "storyboard.schema_version", limit=40)
    source_block = storyboard.get("source")
    _require(isinstance(source_block, dict), "storyboard.source cần là object")
    source = SourceRecord(
        source_id=source_block.get("source_id"),
        sha256=source_block.get("sha256"),
        media_type=source_block.get("media_type"),
        duration_seconds=storyboard.get("duration_seconds"),
    )
    scene_ids = [str(item.get("scene_id")) for item in storyboard.get("scenes", []) if isinstance(item, dict)]
    _require(bool(scene_ids), "storyboard cần ít nhất một scene")

    renderer_records = tuple(item if isinstance(item, RendererRecord) else RendererRecord(**item) for item in renderers)
    _require(bool(renderer_records), "cần ít nhất một renderer")
    asset_records = tuple(sorted(
        (item if isinstance(item, AssetRecord) else AssetRecord(**item) for item in assets),
        key=lambda item: item.asset_id,
    ))
    fallback_records = tuple(sorted(
        (item if isinstance(item, FallbackRecord) else FallbackRecord(**item) for item in fallbacks),
        key=lambda item: item.fallback_id,
    ))
    warning_records = tuple(item if isinstance(item, Warning_) else Warning_(**item) for item in warnings)
    fidelity_records = tuple(item if isinstance(item, FidelityResult) else FidelityResult(**item) for item in fidelity)

    unknown_scenes = sorted({
        scene_id
        for item in (*renderer_records,)
        for scene_id in item.scene_ids
        if scene_id not in scene_ids
    } | {item.scene_id for item in fallback_records if item.scene_id not in scene_ids})
    _require(not unknown_scenes, f"tham chiếu scene không tồn tại: {unknown_scenes}")

    duplicate_assets = [item.asset_id for item in asset_records]
    _require(len(duplicate_assets) == len(set(duplicate_assets)), "asset_id bị trùng")
    duplicate_fallbacks = [item.fallback_id for item in fallback_records]
    _require(len(duplicate_fallbacks) == len(set(duplicate_fallbacks)), "fallback_id bị trùng")

    claim, reasons = _claim(renderer_records, fallback_records, fidelity_records, scene_ids)
    if claimed is not None:
        _require(claimed in COMPLETION_CLAIMS, f"completion claim không hợp lệ: {claimed}")
        _require(
            claimed == claim,
            f"completion claim '{claimed}' không được bằng chứng ủng hộ; bằng chứng cho '{claim}': {list(reasons)}",
        )

    return RenderManifest(
        manifest_id=_text(manifest_id, "manifest_id", limit=160),
        created_at=_timestamp(created_at, "created_at"),
        project_id=project_id,
        storyboard_schema_version=schema_version,
        storyboard_hash=content_hash(storyboard),
        source=source,
        renderers=renderer_records,
        assets=asset_records,
        fallbacks=fallback_records,
        warnings=warning_records,
        fidelity=fidelity_records,
        completion_claim=claim,
        claim_reasons=reasons,
    )


def validate_manifest(document: Any) -> None:
    """Check a manifest document round-tripped through JSON."""
    _require(isinstance(document, dict), "manifest cần là object")
    _require(document.get("schema") == MANIFEST_SCHEMA, "manifest schema không được hỗ trợ")
    for key in ("manifest_id", "created_at", "project_id", "completion_claim"):
        _text(document.get(key), f"manifest.{key}", limit=200)
    _require(document["completion_claim"] in COMPLETION_CLAIMS, "completion_claim không hợp lệ")
    storyboard = document.get("storyboard")
    _require(isinstance(storyboard, dict) and str(storyboard.get("hash", "")).startswith("sha256:"),
             "manifest.storyboard.hash không hợp lệ")
    source = document.get("source")
    _require(isinstance(source, dict), "manifest.source cần là object")
    _sha256(source.get("sha256"), "manifest.source.sha256")
    for key in ("renderers", "assets", "fallbacks", "warnings", "fidelity", "claim_reasons"):
        _require(isinstance(document.get(key), list), f"manifest.{key} cần là danh sách")
    for entry in document["assets"]:
        _require(str(entry.get("checksum", "")).startswith("sha256:"), "asset checksum cần tiền tố sha256:")
    claimed_complete = document["completion_claim"] == "complete"
    if claimed_complete:
        _require(all(item.get("passed") for item in document["fidelity"]),
                 "manifest không thể 'complete' khi có fidelity thất bại")
        _require(bool(document["fidelity"]), "manifest không thể 'complete' khi chưa chạy fidelity")
        _require(all(item.get("source_media_usage") == "none" for item in document["fallbacks"]),
                 "manifest không thể 'complete' khi còn dùng lại media nguồn")


def diff_manifests(earlier: dict[str, Any], later: dict[str, Any]) -> dict[str, Any]:
    """What changed between two renders of the same project."""
    validate_manifest(earlier)
    validate_manifest(later)
    _require(earlier["project_id"] == later["project_id"], "hai manifest thuộc hai project khác nhau")

    def index(document: dict[str, Any], key: str, field_name: str) -> dict[str, Any]:
        return {str(item[field_name]): item for item in document[key]}

    earlier_assets = index(earlier, "assets", "asset_id")
    later_assets = index(later, "assets", "asset_id")
    return {
        "project_id": later["project_id"],
        "source_changed": earlier["source"]["sha256"] != later["source"]["sha256"],
        "storyboard_changed": earlier["storyboard"]["hash"] != later["storyboard"]["hash"],
        "completion_claim": [earlier["completion_claim"], later["completion_claim"]],
        "assets_added": sorted(set(later_assets) - set(earlier_assets)),
        "assets_removed": sorted(set(earlier_assets) - set(later_assets)),
        "assets_changed": sorted(
            asset_id for asset_id in set(earlier_assets) & set(later_assets)
            if earlier_assets[asset_id]["checksum"] != later_assets[asset_id]["checksum"]
        ),
        "fallbacks_added": sorted(
            set(index(later, "fallbacks", "fallback_id")) - set(index(earlier, "fallbacks", "fallback_id"))
        ),
        "fidelity_regressed": sorted(
            item["kind"] for item in later["fidelity"]
            if not item["passed"] and any(other["kind"] == item["kind"] and other["passed"] for other in earlier["fidelity"])
        ),
    }


__all__ = [
    "AssetRecord",
    "COMPLETION_CLAIMS",
    "FallbackRecord",
    "FidelityResult",
    "MANIFEST_SCHEMA",
    "RenderManifest",
    "RenderManifestError",
    "RendererRecord",
    "SourceRecord",
    "Warning_",
    "build_manifest",
    "content_hash",
    "diff_manifests",
    "validate_manifest",
]
