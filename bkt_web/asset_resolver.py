"""Deterministic asset resolution and freezing (UV-501).

The resolver answers one question per request — *which concrete asset renders
this entity* — by walking a fixed ladder:

1. an exact reusable asset already in the manifest,
2. a composition of compatible assets that together cover the capabilities,
3. a generated asset, produced by an injected generator,
4. an approved source-media fallback, and
5. ``needs-review`` when nothing above is allowed or possible.

Every rung is recorded, so a resolution explains not only what was chosen but
what was tried and why it failed.  Resolution is also the only place that may
touch the network: a remote record is fetched, checksum-verified and written
into the local cache *here*, never while a frame is being rendered.
``assert_offline_ready`` turns that rule into a check the caller can run before
handing a plan to a renderer.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from bkt_web.asset_manifest import (
    ASSET_MANIFEST_SCHEMA,
    AssetManifestError,
    CAPABILITY_KEYS,
    add_asset,
    asset_manifest,
    checksum_bytes,
    checksum_value,
    media_extension,
    validate_asset_manifest,
    validate_asset_record,
)


RESOLVER_VERSION = "1.0.0"
RESOLUTION_PLAN_SCHEMA = "tokmatrix.asset-resolution-plan/v1"
STRATEGY_ORDER = ("exact", "composition", "generated", "source-fallback", "needs-review")

_SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$")
_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$")


class AssetResolutionError(ValueError):
    """Raised when a resolution cannot be trusted (bad input, checksum drift)."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise AssetResolutionError(message)


def _semver_key(value: str) -> tuple[int, int, int]:
    match = _SEMVER_RE.fullmatch(value)
    _require(match is not None, f"version không hợp lệ: {value}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def _normalized_capabilities(value: Mapping[str, Sequence[str]] | None) -> dict[str, tuple[str, ...]]:
    result: dict[str, tuple[str, ...]] = {}
    for key, items in dict(value or {}).items():
        _require(key in CAPABILITY_KEYS, f"required_capabilities: key lạ {key}")
        _require(isinstance(items, (list, tuple)), f"required_capabilities.{key}: cần danh sách")
        for item in items:
            _require(isinstance(item, str) and bool(item), f"required_capabilities.{key}: cần chuỗi không rỗng")
        if items:
            result[key] = tuple(sorted(set(items)))
    return dict(sorted(result.items()))


@dataclass(frozen=True)
class AssetRequest:
    """One entity's need for a concrete asset."""

    request_id: str
    renderer_id: str
    kind: str = "vector-rig"
    asset_id: str | None = None
    entity_id: str | None = None
    required_capabilities: Mapping[str, Sequence[str]] = field(default_factory=dict)
    media_type: str | None = None
    source_ref: str | None = None
    source_media_usage: str = "visual"

    def normalized(self) -> dict[str, Any]:
        _require(bool(_ID_RE.fullmatch(self.request_id)), f"request_id không hợp lệ: {self.request_id}")
        _require(bool(_ID_RE.fullmatch(self.renderer_id)), f"renderer_id không hợp lệ: {self.renderer_id}")
        _require(self.source_media_usage in {"none", "visual", "audio", "visual_and_audio"}, "source_media_usage không hợp lệ")
        return {
            "request_id": self.request_id,
            "renderer_id": self.renderer_id,
            "kind": self.kind,
            "asset_id": self.asset_id,
            "entity_id": self.entity_id,
            "required_capabilities": {key: list(value) for key, value in _normalized_capabilities(self.required_capabilities).items()},
            "media_type": self.media_type,
            "source_ref": self.source_ref,
        }


@dataclass(frozen=True)
class ResolutionPolicy:
    """What the resolver is allowed to do when no exact asset exists."""

    allow_composition: bool = True
    allow_generated: bool = False
    allow_source_fallback: bool = False
    approved_source_refs: tuple[str, ...] = ()
    source_license: Mapping[str, str] = field(default_factory=lambda: {"id": "LicenseRef-source-media", "notes": "Reuse of the analysed source media; requires human approval."})


def _covers(record: dict[str, Any], required: dict[str, tuple[str, ...]]) -> dict[str, list[str]]:
    """Capabilities the record is missing, per key (empty when it covers all)."""

    missing: dict[str, list[str]] = {}
    available = record.get("capabilities", {})
    for key, items in required.items():
        gap = sorted(set(items) - set(available.get(key, [])))
        if gap:
            missing[key] = gap
    return missing


def _renderer_ok(record: dict[str, Any], renderer_id: str) -> bool:
    declared = record.get("renderer_ids", [])
    # An empty list means renderer-neutral media (an image, a font, a LUT).
    return not declared or renderer_id in declared


def _candidates(manifest: dict[str, Any], request: AssetRequest) -> list[dict[str, Any]]:
    records = [copy.deepcopy(record) for _asset_id, record in sorted(manifest["assets"].items())]
    return [record for record in records if _renderer_ok(record, request.renderer_id) and (request.kind is None or record["kind"] == request.kind)]


def _freeze_bytes(data: bytes, media_type: str, cache_dir: Path) -> tuple[Path, str]:
    checksum = checksum_bytes(data)
    target = cache_dir / f"{checksum.split(':', 1)[1]}{media_extension(media_type)}"
    if target.exists():
        if checksum_bytes(target.read_bytes()) != checksum:
            raise AssetResolutionError(f"cache bị hỏng tại {target.name}")
    else:
        cache_dir.mkdir(parents=True, exist_ok=True)
        # Write to a temp name first so a crash cannot leave a half file that
        # a later run would trust because the name already matches the hash.
        staging = target.with_suffix(target.suffix + ".part")
        staging.write_bytes(data)
        staging.replace(target)
    return target, checksum


def _freeze_record(
    record: dict[str, Any],
    *,
    cache_dir: Path | None,
    project_root: Path,
    fetcher: Callable[[str], bytes] | None,
) -> tuple[str | None, str | None]:
    """Return ``(local_path, reason_code)``; the path is None when not frozen."""

    content = record["content"]
    if content["kind"] == "inline":
        # Inline rigs travel inside the catalog the renderer already embeds.
        return None, None
    if content["kind"] == "remote" and fetcher is None:
        # Say what is actually wrong: nothing may reach the network later on.
        return None, "REMOTE_ASSET_NOT_FROZEN"
    if cache_dir is None:
        return None, "ASSET_CACHE_REQUIRED"
    if content["kind"] == "file":
        source = (project_root / content["path"]).resolve()
        if not str(source).startswith(str(project_root.resolve())):
            return None, "PATH_ESCAPES_ROOT"
        if not source.is_file():
            return None, "ASSET_FILE_MISSING"
        data = source.read_bytes()
        if checksum_bytes(data) != record["checksum"]:
            return None, "ASSET_CHECKSUM_MISMATCH"
        target, _checksum = _freeze_bytes(data, content["media_type"], cache_dir)
        return str(target), None
    data = fetcher(content["uri"])
    if not isinstance(data, (bytes, bytearray)):
        return None, "REMOTE_ASSET_NOT_FROZEN"
    if checksum_bytes(bytes(data)) != record["checksum"]:
        return None, "REMOTE_ASSET_CHECKSUM_MISMATCH"
    target, _checksum = _freeze_bytes(bytes(data), content["media_type"], cache_dir)
    return str(target), None


def _composition(manifest: dict[str, Any], request: AssetRequest, required: dict[str, tuple[str, ...]]) -> dict[str, Any] | None:
    """Smallest deterministic set of records covering every required capability."""

    pool = [record for record in _candidates(manifest, request) if record["provenance"]["kind"] != "composed"]
    remaining = {key: set(items) for key, items in required.items()}
    chosen: list[dict[str, Any]] = []
    if request.asset_id is not None:
        # A composition may extend an explicitly identified subject, but must
        # never replace it with a merely compatible-looking catalog item.  If
        # the requested subject is absent, generation/source fallback/review
        # are the only honest remaining rungs.
        base = next((record for record in pool if record["asset_id"] == request.asset_id), None)
        if base is None:
            return None
        chosen.append(base)
        for key, items in remaining.items():
            items -= set(base.get("capabilities", {}).get(key, []))
    while any(remaining.values()):
        scored = []
        for record in pool:
            if record in chosen:
                continue
            gain = sum(len(items & set(record.get("capabilities", {}).get(key, []))) for key, items in remaining.items())
            if gain:
                scored.append((-gain, record["asset_id"], record))
        if not scored:
            return None
        scored.sort(key=lambda item: (item[0], item[1]))
        record = scored[0][2]
        chosen.append(record)
        for key, items in remaining.items():
            items -= set(record.get("capabilities", {}).get(key, []))
    if len(chosen) < 2:
        return None
    parts = sorted(record["asset_id"] for record in chosen)
    asset_id = "composed:" + ":".join(parts)
    if len(asset_id) > 160 or not _ID_RE.fullmatch(asset_id):
        asset_id = "composed:" + checksum_value(parts).split(":", 1)[1][:24]
    capabilities: dict[str, list[str]] = {}
    for record in chosen:
        for key, items in record.get("capabilities", {}).items():
            capabilities.setdefault(key, [])
            capabilities[key] = sorted(set(capabilities[key]) | set(items))
    version = max((record["version"] for record in chosen), key=_semver_key)
    created_at = max(record["provenance"]["created_at"] for record in chosen)
    composed = {
        "asset_id": asset_id,
        "version": version,
        "kind": "component-composition",
        "renderer_ids": [request.renderer_id],
        "capabilities": {key: value for key, value in sorted(capabilities.items())},
        "checksum": checksum_value({"parts": [{"asset_id": record["asset_id"], "checksum": record["checksum"]} for record in chosen]}),
        "content": {"kind": "inline", "media_type": "application/json"},
        "provenance": {
            "kind": "composed",
            "created_at": created_at,
            "agent": "bkt_web.asset_resolver",
            "license": dict(chosen[0]["provenance"]["license"]),
            "source_refs": sorted({ref for record in chosen for ref in record["provenance"]["source_refs"]}),
            "tool_version": RESOLVER_VERSION,
        },
        "composition": {"parts": parts, "notes": "Composed by the asset resolver to cover requested capabilities."},
    }
    validate_asset_record(composed)
    return composed


def _generated_record(payload: Any, request: AssetRequest, required: dict[str, tuple[str, ...]]) -> dict[str, Any]:
    _require(isinstance(payload, dict), "generator phải trả object")
    data = payload.get("bytes")
    _require(isinstance(data, (bytes, bytearray)), "generator.bytes: cần bytes")
    media_type = payload.get("media_type")
    _require(isinstance(media_type, str) and bool(media_type), "generator.media_type bị thiếu")
    asset_id = payload.get("asset_id") or f"generated:{request.request_id}"
    capabilities = _normalized_capabilities(payload.get("capabilities") or required)
    record = {
        "asset_id": asset_id,
        "version": payload.get("version", "1.0.0"),
        "kind": payload.get("kind", request.kind if request.kind != "vector-rig" else "image"),
        "renderer_ids": sorted(payload.get("renderer_ids", [request.renderer_id])),
        "capabilities": {key: list(value) for key, value in capabilities.items()},
        "checksum": checksum_bytes(bytes(data)),
        "content": {"kind": "file", "path": "", "bytes": len(bytes(data)), "media_type": media_type},
        "provenance": {
            "kind": "generated",
            "created_at": payload.get("created_at", ""),
            "agent": payload.get("agent", "bkt_web.asset_resolver"),
            "license": dict(payload.get("license") or {"id": "LicenseRef-generated"}),
            "source_refs": sorted(payload.get("source_refs", [])),
            "generation": {
                "model": payload.get("model", ""),
                "config": payload.get("config", {}),
                "source_refs": sorted(payload.get("source_refs", [])),
            },
        },
    }
    if payload.get("model_version"):
        record["provenance"]["generation"]["model_version"] = payload["model_version"]
    if payload.get("prompt_sha256"):
        record["provenance"]["generation"]["prompt_sha256"] = payload["prompt_sha256"]
    return record


def _source_record(request: AssetRequest, policy: ResolutionPolicy, data: bytes, media_type: str, created_at: str) -> dict[str, Any]:
    record = {
        "asset_id": f"source:{request.request_id}",
        "version": "1.0.0",
        "kind": "source-clip",
        "renderer_ids": [request.renderer_id],
        "capabilities": {},
        "checksum": checksum_bytes(data),
        "content": {"kind": "file", "path": "", "bytes": len(data), "media_type": media_type},
        "provenance": {
            "kind": "source-media",
            "created_at": created_at,
            "agent": "bkt_web.asset_resolver",
            "license": dict(policy.source_license),
            "source_refs": [str(request.source_ref)],
        },
    }
    return record


def resolve_asset(
    request: AssetRequest,
    *,
    manifest: dict[str, Any] | None = None,
    policy: ResolutionPolicy | None = None,
    cache_dir: str | Path | None = None,
    project_root: str | Path | None = None,
    generator: Callable[[AssetRequest, dict[str, list[str]]], dict[str, Any]] | None = None,
    source_media: Mapping[str, Mapping[str, Any]] | None = None,
    fetcher: Callable[[str], bytes] | None = None,
) -> dict[str, Any]:
    """Resolve one request, freezing whatever it selects to the local cache."""

    document = copy.deepcopy(manifest) if manifest is not None else asset_manifest()
    validate_asset_manifest(document)
    policy = policy or ResolutionPolicy()
    normalized = request.normalized()
    required = _normalized_capabilities(request.required_capabilities)
    root = Path(project_root).resolve() if project_root is not None else Path(__file__).resolve().parent.parent
    cache = Path(cache_dir).resolve() if cache_dir is not None else None
    attempts: list[dict[str, Any]] = []

    def resolved(strategy: str, record: dict[str, Any], local_path: str | None, *, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "request_id": request.request_id,
            "entity_id": request.entity_id,
            "renderer_id": request.renderer_id,
            "status": "resolved",
            "strategy": strategy,
            "asset_id": record["asset_id"],
            "asset_version": record["version"],
            "checksum": record["checksum"],
            "local_path": local_path,
            "record": copy.deepcopy(record),
            "requires_approval": record["provenance"]["kind"] == "source-media",
            "source_media_usage": request.source_media_usage if record["provenance"]["kind"] == "source-media" else "none",
            "disclosure": "Dùng lại media nguồn; không được coi là remake hoàn chỉnh." if record["provenance"]["kind"] == "source-media" else None,
            "missing_capabilities": {},
            "attempts": attempts,
            "explanation": f"{strategy}: {record['asset_id']}@{record['version']}",
            **(extra or {}),
        }

    def review(reason_code: str, explanation: str, missing: dict[str, list[str]] | None = None) -> dict[str, Any]:
        return {
            "request_id": request.request_id,
            "entity_id": request.entity_id,
            "renderer_id": request.renderer_id,
            "status": "needs-review",
            "strategy": "needs-review",
            "asset_id": None,
            "asset_version": None,
            "checksum": None,
            "local_path": None,
            "record": None,
            "requires_approval": True,
            "source_media_usage": "none",
            "disclosure": None,
            "reason_code": reason_code,
            "missing_capabilities": missing or {},
            "attempts": attempts,
            "explanation": explanation,
        }

    # 1 — exact reusable asset.
    exact_pool = _candidates(document, request)
    if request.asset_id is not None:
        exact_pool = [record for record in exact_pool if record["asset_id"] == request.asset_id]
        if not exact_pool:
            attempts.append({"strategy": "exact", "outcome": "rejected", "reason": "ASSET_NOT_IN_MANIFEST", "detail": request.asset_id})
    for record in exact_pool:
        missing = _covers(record, required)
        if missing:
            if request.asset_id is not None:
                attempts.append({"strategy": "exact", "outcome": "rejected", "reason": "CAPABILITY_MISSING", "detail": record["asset_id"]})
            continue
        local_path, reason = _freeze_record(record, cache_dir=cache, project_root=root, fetcher=fetcher)
        if reason:
            attempts.append({"strategy": "exact", "outcome": "rejected", "reason": reason, "detail": record["asset_id"]})
            continue
        attempts.append({"strategy": "exact", "outcome": "selected", "reason": "EXACT_ASSET_AVAILABLE", "detail": record["asset_id"]})
        return resolved("exact", record, local_path)
    if not any(attempt["strategy"] == "exact" for attempt in attempts):
        attempts.append({"strategy": "exact", "outcome": "rejected", "reason": "NO_EXACT_ASSET", "detail": None})

    # 2 — composition of compatible assets.
    if not policy.allow_composition:
        attempts.append({"strategy": "composition", "outcome": "skipped", "reason": "COMPOSITION_NOT_ALLOWED", "detail": None})
    elif not required:
        attempts.append({"strategy": "composition", "outcome": "skipped", "reason": "NO_CAPABILITY_REQUESTED", "detail": None})
    else:
        composed = _composition(document, request, required)
        if composed is None:
            attempts.append({"strategy": "composition", "outcome": "rejected", "reason": "NO_COMPATIBLE_COMPOSITION", "detail": None})
        else:
            attempts.append({"strategy": "composition", "outcome": "selected", "reason": "COMPOSITION_COVERS_CAPABILITIES", "detail": composed["asset_id"]})
            part_paths: dict[str, str | None] = {}
            for part in composed["composition"]["parts"]:
                local_path, reason = _freeze_record(document["assets"][part], cache_dir=cache, project_root=root, fetcher=fetcher)
                if reason:
                    return review(reason, f"Không freeze được part {part} của composition")
                part_paths[part] = local_path
            return resolved("composition", composed, None, extra={"part_paths": part_paths})

    # 3 — generated asset.
    if not policy.allow_generated or generator is None:
        attempts.append({"strategy": "generated", "outcome": "skipped", "reason": "GENERATION_NOT_ALLOWED", "detail": None})
    elif cache is None:
        attempts.append({"strategy": "generated", "outcome": "rejected", "reason": "ASSET_CACHE_REQUIRED", "detail": None})
    else:
        gap = {key: sorted(set(items) - set()) for key, items in required.items()}
        payload = generator(request, gap)
        record = _generated_record(payload, request, required)
        try:
            data = bytes(payload["bytes"])
            target, _checksum = _freeze_bytes(data, record["content"]["media_type"], cache)
            record["content"]["path"] = target.name
            validate_asset_record(record)
        except (AssetManifestError, AssetResolutionError) as error:
            attempts.append({"strategy": "generated", "outcome": "rejected", "reason": "GENERATED_ASSET_INVALID", "detail": str(error)})
            return review("GENERATED_ASSET_INVALID", f"Generated asset không hợp lệ: {error}")
        missing = _covers(record, required)
        if missing:
            attempts.append({"strategy": "generated", "outcome": "rejected", "reason": "CAPABILITY_MISSING", "detail": record["asset_id"]})
            return review("CAPABILITY_MISSING", "Generated asset không phủ hết capability yêu cầu", missing)
        attempts.append({"strategy": "generated", "outcome": "selected", "reason": "GENERATED_ASSET_CREATED", "detail": record["asset_id"]})
        return resolved("generated", record, str(target))

    # 4 — approved source-media fallback.
    approved = request.source_ref is not None and request.source_ref in set(policy.approved_source_refs)
    if not policy.allow_source_fallback or not approved:
        attempts.append({
            "strategy": "source-fallback",
            "outcome": "skipped",
            "reason": "SOURCE_FALLBACK_NOT_APPROVED",
            "detail": request.source_ref,
        })
    else:
        entry = dict((source_media or {}).get(request.source_ref) or {})
        path = entry.get("path")
        created_at = entry.get("created_at")
        if not path or not created_at:
            attempts.append({"strategy": "source-fallback", "outcome": "rejected", "reason": "SOURCE_MEDIA_NOT_AVAILABLE", "detail": request.source_ref})
            return review("SOURCE_MEDIA_NOT_AVAILABLE", f"Source media {request.source_ref} chưa có bản local để freeze")
        if cache is None:
            attempts.append({"strategy": "source-fallback", "outcome": "rejected", "reason": "ASSET_CACHE_REQUIRED", "detail": request.source_ref})
            return review("ASSET_CACHE_REQUIRED", "Source fallback cần cache_dir để freeze media nguồn")
        data = Path(path).read_bytes()
        record = _source_record(request, policy, data, str(entry.get("media_type", "video/mp4")), str(created_at))
        target, _checksum = _freeze_bytes(data, record["content"]["media_type"], cache)
        record["content"]["path"] = target.name
        validate_asset_record(record)
        attempts.append({"strategy": "source-fallback", "outcome": "selected", "reason": "APPROVED_SOURCE_FALLBACK", "detail": request.source_ref})
        return resolved("source-fallback", record, str(target))

    # 5 — needs-review.
    best_gap: dict[str, list[str]] = {}
    for record in _candidates(document, request):
        gap = _covers(record, required)
        if gap and (not best_gap or sum(map(len, gap.values())) < sum(map(len, best_gap.values()))):
            best_gap = gap
    return review("NO_ASSET_ROUTE", "Không có asset nào hợp lệ theo policy hiện tại; cần người duyệt.", best_gap or {key: list(value) for key, value in required.items()})


def resolve_assets(
    requests: Sequence[AssetRequest],
    *,
    manifest: dict[str, Any] | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Resolve a batch and return a plan plus the manifest it grew into."""

    document = copy.deepcopy(manifest) if manifest is not None else asset_manifest()
    validate_asset_manifest(document)
    seen: set[str] = set()
    resolutions: list[dict[str, Any]] = []
    for request in requests:
        _require(request.request_id not in seen, f"request_id bị trùng: {request.request_id}")
        seen.add(request.request_id)
        resolution = resolve_asset(request, manifest=document, **kwargs)
        resolutions.append(resolution)
        if resolution["record"] is not None and resolution["record"]["asset_id"] not in document["assets"]:
            document = add_asset(document, resolution["record"])
    resolutions.sort(key=lambda item: item["request_id"])
    return {
        "schema": RESOLUTION_PLAN_SCHEMA,
        "version": RESOLVER_VERSION,
        "resolutions": resolutions,
        "needs_review": [item["request_id"] for item in resolutions if item["status"] == "needs-review"],
        "source_fallback_request_ids": [item["request_id"] for item in resolutions if item["strategy"] == "source-fallback"],
        "manifest": document,
    }


def assert_offline_ready(plan_or_resolutions: Any) -> None:
    """Fail if any resolved asset still needs the network at render time."""

    resolutions = plan_or_resolutions["resolutions"] if isinstance(plan_or_resolutions, dict) and "resolutions" in plan_or_resolutions else plan_or_resolutions
    for resolution in resolutions:
        if resolution["status"] != "resolved":
            continue
        record = resolution["record"]
        content = record["content"]
        if content["kind"] == "remote":
            raise AssetResolutionError(f"{resolution['request_id']}: asset remote chưa được freeze")
        if content["kind"] == "inline":
            for path in (resolution.get("part_paths") or {}).values():
                if path is not None and not Path(path).is_file():
                    raise AssetResolutionError(f"{resolution['request_id']}: part đã freeze nhưng file biến mất")
            continue
        local_path = resolution.get("local_path")
        if not local_path or not Path(local_path).is_file():
            raise AssetResolutionError(f"{resolution['request_id']}: asset chưa có bản local")
        if checksum_bytes(Path(local_path).read_bytes()) != record["checksum"]:
            raise AssetResolutionError(f"{resolution['request_id']}: checksum bản local không khớp manifest")


__all__ = [
    "RESOLUTION_PLAN_SCHEMA",
    "RESOLVER_VERSION",
    "STRATEGY_ORDER",
    "AssetRequest",
    "AssetResolutionError",
    "ResolutionPolicy",
    "assert_offline_ready",
    "resolve_asset",
    "resolve_assets",
]
