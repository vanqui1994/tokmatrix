"""Asset manifest and provenance for the universal video platform (UV-500).

Every asset the platform may draw from carries the same five things: a stable
id, a semantic version, a license, a content checksum and an explicit
capability list.  Nothing is anonymous and nothing is trusted because it
happens to sit on disk — a record without provenance is rejected, and a
generated asset must name the model, the config and the source references it
came from.

Built-in records are derived from the capability registry (UV-103), so the
vector catalog stays the single source of truth for what the native renderer
owns.  Additional records live in ``bkt_web/schemas/asset_manifest.json`` and
are merged on top; a duplicate id with different content is an error, never a
silent overwrite.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any


ASSET_MANIFEST_SCHEMA = "tokmatrix.asset-manifest/v1"
ASSET_MANIFEST_PATH = Path(__file__).resolve().parent / "schemas" / "asset_manifest.json"

# Built-in records describe the vector catalog, which has no authored date of
# its own.  A fixed timestamp keeps the derived manifest byte-stable.
BUILTIN_CREATED_AT = "2026-09-21T00:00:00Z"
BUILTIN_AGENT = "bkt_web.remake_vector"
BUILTIN_LICENSE = {"id": "LicenseRef-ssmatool-internal", "holder": "SSMATool"}

ASSET_KINDS = frozenset({
    "vector-rig", "image", "audio", "video", "font", "lut", "component-composition", "source-clip",
})
PROVENANCE_KINDS = frozenset({"built-in", "imported", "generated", "composed", "source-media"})
CONTENT_KINDS = frozenset({"inline", "file", "remote"})
CAPABILITY_KEYS = frozenset({"entity_types", "anchors", "actions", "states", "materials", "effects"})

_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$")
_SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$")
_CHECKSUM_RE = re.compile(r"^sha256:[0-9a-f]{64}$")

_MEDIA_EXTENSIONS = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "video/mp4": ".mp4",
    "font/woff2": ".woff2",
    "application/json": ".json",
    "text/plain": ".txt",
}


class AssetManifestError(ValueError):
    """Raised when an asset record or manifest document is not trustworthy."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise AssetManifestError(message)


def _text(value: Any, label: str, *, max_length: int = 300) -> str:
    _require(isinstance(value, str) and value.strip() and len(value) <= max_length, f"{label}: cần chuỗi không rỗng")
    return value


def _stable_id(value: Any, label: str) -> str:
    _require(isinstance(value, str) and bool(_ID_RE.fullmatch(value)) and len(value) <= 160, f"{label}: stable ID không hợp lệ")
    return value


def _semver(value: Any, label: str) -> str:
    _require(isinstance(value, str) and bool(_SEMVER_RE.fullmatch(value)), f"{label}: semantic version không hợp lệ")
    return value


def _rfc3339(value: Any, label: str) -> str:
    _require(isinstance(value, str) and bool(value), f"{label}: cần RFC 3339 date-time")
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        raise AssetManifestError(f"{label}: cần RFC 3339 date-time") from None
    _require(parsed.tzinfo is not None, f"{label}: thiếu timezone")
    return value


def _string_list(value: Any, label: str) -> list[str]:
    _require(isinstance(value, list), f"{label}: cần danh sách")
    for index, item in enumerate(value):
        _require(isinstance(item, str) and bool(item) and len(item) <= 200, f"{label}[{index}]: cần chuỗi không rỗng")
    _require(len(value) == len(set(value)), f"{label}: phần tử bị trùng")
    _require(value == sorted(value), f"{label}: phải sắp xếp để manifest deterministic")
    return value


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def checksum_bytes(data: bytes) -> str:
    _require(isinstance(data, (bytes, bytearray)), "checksum_bytes: cần bytes")
    return "sha256:" + hashlib.sha256(bytes(data)).hexdigest()


def checksum_value(value: Any) -> str:
    """Checksum of a JSON-serialisable payload, used for inline catalog assets."""

    return checksum_bytes(canonical_json(value))


def media_extension(media_type: str) -> str:
    return _MEDIA_EXTENSIONS.get(media_type, ".bin")


def _relative_path(value: Any, label: str) -> str:
    text = _text(value, label, max_length=1024)
    _require("\x00" not in text and "\\" not in text, f"{label}: path không hợp lệ")
    candidate = Path(text)
    _require(not candidate.is_absolute(), f"{label}: path phải là relative")
    _require(".." not in candidate.parts, f"{label}: path traversal bị từ chối")
    return text


def _validate_license(value: Any, label: str) -> None:
    _require(isinstance(value, dict), f"{label}: cần object license")
    _text(value.get("id"), f"{label}.id", max_length=200)
    for key in ("holder", "url", "notes"):
        if key in value:
            _text(value[key], f"{label}.{key}", max_length=1000)
    unknown = set(value) - {"id", "holder", "url", "notes"}
    _require(not unknown, f"{label}: field lạ {sorted(unknown)}")


def _validate_content(value: Any, label: str) -> None:
    _require(isinstance(value, dict), f"{label}: cần object content")
    kind = value.get("kind")
    _require(kind in CONTENT_KINDS, f"{label}.kind không được hỗ trợ")
    if kind == "file":
        _relative_path(value.get("path"), f"{label}.path")
        size = value.get("bytes")
        _require(isinstance(size, int) and not isinstance(size, bool) and size >= 0, f"{label}.bytes không hợp lệ")
        _text(value.get("media_type"), f"{label}.media_type", max_length=200)
    elif kind == "remote":
        uri = _text(value.get("uri"), f"{label}.uri", max_length=2000)
        _require(uri.startswith("https://"), f"{label}.uri: chỉ chấp nhận https")
        _text(value.get("media_type"), f"{label}.media_type", max_length=200)
    else:
        if "media_type" in value:
            _text(value["media_type"], f"{label}.media_type", max_length=200)
    unknown = set(value) - {"kind", "path", "bytes", "media_type", "uri"}
    _require(not unknown, f"{label}: field lạ {sorted(unknown)}")


def _validate_provenance(value: Any, label: str) -> None:
    _require(isinstance(value, dict), f"{label}: cần object provenance")
    kind = value.get("kind")
    _require(kind in PROVENANCE_KINDS, f"{label}.kind không được hỗ trợ")
    _rfc3339(value.get("created_at"), f"{label}.created_at")
    _text(value.get("agent"), f"{label}.agent")
    _validate_license(value.get("license"), f"{label}.license")
    source_refs = _string_list(value.get("source_refs", []), f"{label}.source_refs")
    if "tool_version" in value:
        _text(value["tool_version"], f"{label}.tool_version", max_length=100)
    if kind in {"imported", "source-media"}:
        _require(bool(source_refs), f"{label}.source_refs: asset {kind} phải ghi nguồn")
    if kind == "generated":
        generation = value.get("generation")
        _require(isinstance(generation, dict), f"{label}.generation: asset generated phải ghi model/config/source")
        _text(generation.get("model"), f"{label}.generation.model", max_length=300)
        _require(isinstance(generation.get("config"), dict), f"{label}.generation.config: cần object")
        _string_list(generation.get("source_refs", []), f"{label}.generation.source_refs")
        if "prompt_sha256" in generation:
            _require(bool(_CHECKSUM_RE.fullmatch(str(generation["prompt_sha256"]))), f"{label}.generation.prompt_sha256 không hợp lệ")
        unknown = set(generation) - {"model", "model_version", "config", "source_refs", "prompt_sha256"}
        _require(not unknown, f"{label}.generation: field lạ {sorted(unknown)}")
        if "model_version" in generation:
            _text(generation["model_version"], f"{label}.generation.model_version", max_length=100)
    else:
        _require("generation" not in value, f"{label}.generation chỉ dành cho asset generated")
    unknown = set(value) - {"kind", "created_at", "agent", "license", "source_refs", "tool_version", "generation"}
    _require(not unknown, f"{label}: field lạ {sorted(unknown)}")


def validate_asset_record(record: Any, *, label: str = "asset") -> None:
    _require(isinstance(record, dict), f"{label}: cần object")
    asset_id = _stable_id(record.get("asset_id"), f"{label}.asset_id")
    label = f"asset.{asset_id}"
    _semver(record.get("version"), f"{label}.version")
    _require(record.get("kind") in ASSET_KINDS, f"{label}.kind không được hỗ trợ")
    for renderer_id in _string_list(record.get("renderer_ids", []), f"{label}.renderer_ids"):
        _stable_id(renderer_id, f"{label}.renderer_ids")
    capabilities = record.get("capabilities")
    _require(isinstance(capabilities, dict), f"{label}.capabilities: cần object")
    unknown = set(capabilities) - CAPABILITY_KEYS
    _require(not unknown, f"{label}.capabilities: key lạ {sorted(unknown)}")
    for key, value in capabilities.items():
        _string_list(value, f"{label}.capabilities.{key}")
    _require(bool(_CHECKSUM_RE.fullmatch(str(record.get("checksum", "")))), f"{label}.checksum không hợp lệ")
    _validate_content(record.get("content"), f"{label}.content")
    _validate_provenance(record.get("provenance"), f"{label}.provenance")
    if record["provenance"]["kind"] == "composed":
        composition = record.get("composition")
        _require(isinstance(composition, dict), f"{label}.composition: asset composed phải ghi parts")
        parts = _string_list(composition.get("parts", []), f"{label}.composition.parts")
        _require(len(parts) >= 2, f"{label}.composition.parts: cần ít nhất hai asset")
        _require(asset_id not in parts, f"{label}.composition.parts: asset không thể chứa chính nó")
        unknown = set(composition) - {"parts", "notes"}
        _require(not unknown, f"{label}.composition: field lạ {sorted(unknown)}")
        if "notes" in composition:
            _text(composition["notes"], f"{label}.composition.notes", max_length=2000)
    else:
        _require("composition" not in record, f"{label}.composition chỉ dành cho asset composed")
    if "label" in record:
        _text(record["label"], f"{label}.label", max_length=300)
    known = {"asset_id", "version", "kind", "label", "renderer_ids", "capabilities", "checksum", "content", "provenance", "composition"}
    unknown = set(record) - known
    _require(not unknown, f"{label}: field lạ {sorted(unknown)}")


def _assert_acyclic(assets: dict[str, Any]) -> None:
    state: dict[str, int] = {}

    def visit(asset_id: str, trail: tuple[str, ...]) -> None:
        if state.get(asset_id) == 2:
            return
        _require(state.get(asset_id) != 1, f"asset.{asset_id}: composition tạo thành chu trình {' -> '.join(trail + (asset_id,))}")
        state[asset_id] = 1
        for part in assets[asset_id].get("composition", {}).get("parts", []):
            _require(part in assets, f"asset.{asset_id}.composition.parts: {part} không tồn tại trong manifest")
            visit(part, trail + (asset_id,))
        state[asset_id] = 2

    for asset_id in sorted(assets):
        visit(asset_id, ())


def validate_asset_manifest(document: Any) -> None:
    _require(isinstance(document, dict), "manifest: cần object")
    _require(document.get("schema") == ASSET_MANIFEST_SCHEMA, "Manifest schema không được hỗ trợ")
    _semver(document.get("version"), "manifest.version")
    assets = document.get("assets")
    _require(isinstance(assets, dict), "manifest.assets: cần object")
    for asset_id, record in assets.items():
        _require(isinstance(record, dict) and record.get("asset_id") == asset_id, f"manifest.assets.{asset_id}: asset_id không khớp key")
        validate_asset_record(record)
    _assert_acyclic(assets)
    unknown = set(document) - {"schema", "version", "notes", "assets"}
    _require(not unknown, f"manifest: field lạ {sorted(unknown)}")


def asset_record_from_file(
    path: str | Path,
    *,
    asset_id: str,
    version: str,
    kind: str,
    media_type: str,
    provenance: dict[str, Any],
    renderer_ids: list[str] | None = None,
    capabilities: dict[str, list[str]] | None = None,
    root: str | Path | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Build a validated record for a local file, checksum included."""

    base = Path(root).resolve() if root is not None else Path(path).resolve().parent
    absolute = (base / Path(path)).resolve() if root is not None else Path(path).resolve()
    _require(absolute.is_file(), f"asset.{asset_id}: file không tồn tại")
    try:
        relative = absolute.relative_to(base)
    except ValueError:
        raise AssetManifestError(f"asset.{asset_id}: file nằm ngoài root") from None
    data = absolute.read_bytes()
    record = {
        "asset_id": asset_id,
        "version": version,
        "kind": kind,
        "renderer_ids": sorted(renderer_ids or []),
        "capabilities": {key: sorted(value) for key, value in sorted((capabilities or {}).items())},
        "checksum": checksum_bytes(data),
        "content": {"kind": "file", "path": relative.as_posix(), "bytes": len(data), "media_type": media_type},
        "provenance": copy.deepcopy(provenance),
    }
    if label is not None:
        record["label"] = label
    validate_asset_record(record)
    return record


@lru_cache(maxsize=1)
def _native_manifest() -> dict[str, Any]:
    from bkt_web.capability_registry import inspect_registry

    registry = inspect_registry()
    assets: dict[str, Any] = {}
    for asset_id, entry in sorted(registry["assets"].items()):
        assets[asset_id] = {
            "asset_id": asset_id,
            "version": entry["version"],
            "kind": "vector-rig",
            "renderer_ids": [entry["renderer"]],
            "capabilities": {
                "actions": sorted(entry["actions"]),
                "anchors": sorted(entry["anchors"]),
                "entity_types": sorted(entry["entity_types"]),
                "states": sorted(entry["states"]),
            },
            "checksum": entry["provenance"]["checksum"],
            # The rig lives inside the catalog the renderer already embeds, so
            # there is no separate file to freeze before rendering.
            "content": {"kind": "inline", "media_type": "application/json"},
            "provenance": {
                "kind": "built-in",
                "created_at": BUILTIN_CREATED_AT,
                "agent": BUILTIN_AGENT,
                "license": dict(BUILTIN_LICENSE),
                "source_refs": [],
                "tool_version": registry["renderers"][entry["renderer"]]["version"],
            },
        }
    document = {"schema": ASSET_MANIFEST_SCHEMA, "version": "1.0.0", "notes": "Derived from the vector catalog via the capability registry.", "assets": assets}
    validate_asset_manifest(document)
    return document


def native_manifest() -> dict[str, Any]:
    return copy.deepcopy(_native_manifest())


@lru_cache(maxsize=1)
def _declared_manifest() -> dict[str, Any]:
    if not ASSET_MANIFEST_PATH.is_file():
        return {"schema": ASSET_MANIFEST_SCHEMA, "version": "1.0.0", "assets": {}}
    document = json.loads(ASSET_MANIFEST_PATH.read_text(encoding="utf-8"))
    validate_asset_manifest(document)
    return document


def declared_manifest() -> dict[str, Any]:
    return copy.deepcopy(_declared_manifest())


def merge_manifests(base: dict[str, Any], other: dict[str, Any]) -> dict[str, Any]:
    """Union of two manifests; a duplicate id must carry identical content."""

    validate_asset_manifest(base)
    validate_asset_manifest(other)
    assets = copy.deepcopy(base["assets"])
    for asset_id, record in other["assets"].items():
        existing = assets.get(asset_id)
        if existing is not None and canonical_json(existing) != canonical_json(record):
            raise AssetManifestError(f"asset.{asset_id}: hai manifest khai báo khác nhau cho cùng một ID")
        assets[asset_id] = copy.deepcopy(record)
    version = base["version"] if base["version"] >= other["version"] else other["version"]
    document = {"schema": ASSET_MANIFEST_SCHEMA, "version": version, "assets": dict(sorted(assets.items()))}
    validate_asset_manifest(document)
    return document


def asset_manifest() -> dict[str, Any]:
    """Built-in records merged with the declared manifest file."""

    return merge_manifests(native_manifest(), declared_manifest())


def add_asset(document: dict[str, Any], record: dict[str, Any]) -> dict[str, Any]:
    """Return a new manifest containing ``record``; the input is not mutated."""

    validate_asset_manifest(document)
    validate_asset_record(record)
    existing = document["assets"].get(record["asset_id"])
    if existing is not None and canonical_json(existing) != canonical_json(record):
        raise AssetManifestError(f"asset.{record['asset_id']}: manifest đã có ID này với nội dung khác")
    assets = copy.deepcopy(document["assets"])
    assets[record["asset_id"]] = copy.deepcopy(record)
    grown = {"schema": ASSET_MANIFEST_SCHEMA, "version": document["version"], "assets": dict(sorted(assets.items()))}
    validate_asset_manifest(grown)
    return grown


def asset_record(asset_id: str, *, manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    document = manifest if manifest is not None else asset_manifest()
    record = document.get("assets", {}).get(asset_id)
    if record is None:
        raise AssetManifestError(f"asset.{asset_id}: không có trong manifest")
    return copy.deepcopy(record)


def verify_asset_files(manifest: dict[str, Any], *, root: str | Path) -> list[dict[str, str]]:
    """Report missing files and checksum drift for every ``file`` record."""

    validate_asset_manifest(manifest)
    base = Path(root).resolve()
    problems: list[dict[str, str]] = []
    for asset_id, record in sorted(manifest["assets"].items()):
        content = record["content"]
        if content["kind"] != "file":
            continue
        target = (base / content["path"]).resolve()
        if not str(target).startswith(str(base)):
            problems.append({"asset_id": asset_id, "code": "PATH_ESCAPES_ROOT", "detail": content["path"]})
            continue
        if not target.is_file():
            problems.append({"asset_id": asset_id, "code": "ASSET_FILE_MISSING", "detail": content["path"]})
            continue
        data = target.read_bytes()
        if checksum_bytes(data) != record["checksum"]:
            problems.append({"asset_id": asset_id, "code": "ASSET_CHECKSUM_MISMATCH", "detail": content["path"]})
        elif len(data) != content["bytes"]:
            problems.append({"asset_id": asset_id, "code": "ASSET_SIZE_MISMATCH", "detail": content["path"]})
    return problems


def manifest_hash(manifest: dict[str, Any]) -> str:
    validate_asset_manifest(manifest)
    return checksum_value(manifest)


__all__ = [
    "ASSET_KINDS",
    "ASSET_MANIFEST_PATH",
    "ASSET_MANIFEST_SCHEMA",
    "AssetManifestError",
    "CAPABILITY_KEYS",
    "CONTENT_KINDS",
    "PROVENANCE_KINDS",
    "add_asset",
    "asset_manifest",
    "asset_record",
    "asset_record_from_file",
    "canonical_json",
    "checksum_bytes",
    "checksum_value",
    "declared_manifest",
    "manifest_hash",
    "media_extension",
    "merge_manifests",
    "native_manifest",
    "validate_asset_manifest",
    "validate_asset_record",
    "verify_asset_files",
]
