"""Approved-pattern library (UV-701).

What the programme has learned, kept as reusable data: scene patterns, action
sequences, camera patterns and the fixes that resolved a review.  A pattern
enters the library only from something that was **approved** and **verified**,
and it carries the evidence of both.

Two hard rules, enforced rather than documented:

* **No secrets.**  A pattern whose payload contains anything that looks like a
  token, cookie, password or key is refused, and the refusal names the field,
  never the value.
* **No media the project has no right to reuse.**  A pattern may reference a
  media asset only when the reference carries a licence that permits reuse;
  source-derived media is refused outright, because a clip from somebody's
  video is not a pattern.

The library is plain JSON-safe data with stable ids, so it can be committed,
diffed and shipped between machines.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence


LIBRARY_SCHEMA = "tokmatrix.pattern-library/v1"
PATTERN_KINDS = ("scene", "action_sequence", "camera", "fix")
REUSABLE_LICENCES = ("CC0-1.0", "CC-BY-4.0", "original-owned", "built-in")

_SECRET_KEYS = re.compile(
    r"(?:^|[._-])(?:password|passwd|secret|token|api[._-]?key|apikey|access[._-]?key|private[._-]?key|"
    r"cookie|session|credential|authorization|auth[._-]?header|refresh[._-]?token|bearer)(?:$|[._-])",
    re.IGNORECASE,
)
_SECRET_VALUE = re.compile(
    r"(?:bearer\s+[A-Za-z0-9._~+/-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|"
    r"sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,})",
    re.IGNORECASE,
)


class PatternLibraryError(ValueError):
    """Raised when a pattern cannot be admitted to the library."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PatternLibraryError(message)


def _text(value: Any, label: str, *, limit: int = 300) -> str:
    _require(isinstance(value, str) and bool(value.strip()), f"{label} cần là chuỗi không rỗng")
    _require(len(value) <= limit, f"{label} quá dài")
    return value


def _scan_for_secrets(value: Any, path: str = "payload") -> None:
    """Refuse a payload that carries credentials, naming the field only."""
    if isinstance(value, dict):
        for key, child in value.items():
            _require(isinstance(key, str), f"{path}: khoá phải là chuỗi")
            _require(
                not _SECRET_KEYS.search(key),
                f"{path}.{key}: pattern không được chứa credential (chỉ báo tên field, không in giá trị)",
            )
            _scan_for_secrets(child, f"{path}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            _scan_for_secrets(child, f"{path}[{index}]")
    elif isinstance(value, str):
        _require(
            not _SECRET_VALUE.search(value),
            f"{path}: giá trị trông như credential và bị từ chối (không in giá trị)",
        )


def content_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


# --- Records -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MediaReference:
    """A media asset a pattern may reuse, with the licence that allows it."""

    asset_id: str
    licence: str
    checksum: str
    origin: str = "library"

    def __post_init__(self) -> None:
        object.__setattr__(self, "asset_id", _text(self.asset_id, "media.asset_id", limit=160))
        _require(
            self.licence in REUSABLE_LICENCES,
            f"media.{self.asset_id}: licence '{self.licence}' không cho phép tái sử dụng; hợp lệ: {list(REUSABLE_LICENCES)}",
        )
        checksum = _text(self.checksum, f"media.{self.asset_id}.checksum", limit=80)
        bare = checksum.split("sha256:", 1)[-1]
        _require(bool(re.fullmatch(r"[a-f0-9]{64}", bare)), f"media.{self.asset_id}.checksum cần là SHA-256")
        object.__setattr__(self, "checksum", f"sha256:{bare}")
        _require(
            self.origin in {"library", "generated", "built-in"},
            f"media.{self.asset_id}: media lấy từ nguồn không được đưa vào thư viện pattern",
        )

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class Approval:
    """Who approved this pattern and what verified it."""

    approved_by: str
    approved_at: str
    source_hash: str
    review_id: str | None = None
    fidelity_kinds: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "approved_by", _text(self.approved_by, "approval.approved_by"))
        object.__setattr__(self, "approved_at", _text(self.approved_at, "approval.approved_at", limit=64))
        bare = _text(self.source_hash, "approval.source_hash", limit=80).split("sha256:", 1)[-1]
        _require(bool(re.fullmatch(r"[a-f0-9]{64}", bare)), "approval.source_hash cần là SHA-256")
        object.__setattr__(self, "source_hash", f"sha256:{bare}")
        object.__setattr__(self, "fidelity_kinds", tuple(sorted({_text(item, "approval.fidelity_kind", limit=40) for item in self.fidelity_kinds})))
        _require(bool(self.fidelity_kinds), "approval: pattern cần ít nhất một loại fidelity đã chạy")

    def as_dict(self) -> dict[str, Any]:
        return {
            "approved_by": self.approved_by,
            "approved_at": self.approved_at,
            "source_hash": self.source_hash,
            "review_id": self.review_id,
            "fidelity_kinds": list(self.fidelity_kinds),
        }


@dataclass(frozen=True, slots=True)
class Pattern:
    pattern_id: str
    kind: str
    title: str
    genre: str
    payload: dict[str, Any]
    approval: Approval
    media: tuple[MediaReference, ...] = ()
    tags: tuple[str, ...] = ()
    notes: str | None = None
    uses: int = 0

    def __post_init__(self) -> None:
        object.__setattr__(self, "pattern_id", _text(self.pattern_id, "pattern.pattern_id", limit=160))
        _require(self.kind in PATTERN_KINDS, f"pattern.kind chưa hỗ trợ: {self.kind}")
        object.__setattr__(self, "title", _text(self.title, "pattern.title", limit=200))
        object.__setattr__(self, "genre", _text(self.genre, "pattern.genre", limit=100))
        _require(isinstance(self.payload, dict) and bool(self.payload), "pattern.payload cần là object không rỗng")
        _scan_for_secrets(self.payload)
        object.__setattr__(self, "payload", copy.deepcopy(self.payload))
        object.__setattr__(self, "tags", tuple(sorted({_text(item, "pattern.tag", limit=60) for item in self.tags})))
        _require(
            not isinstance(self.uses, bool) and isinstance(self.uses, int) and self.uses >= 0,
            "pattern.uses không hợp lệ",
        )
        self._check_kind()

    def _check_kind(self) -> None:
        payload = self.payload
        if self.kind == "action_sequence":
            steps = payload.get("steps")
            _require(isinstance(steps, list) and bool(steps), f"{self.pattern_id}: action_sequence cần steps")
            for index, step in enumerate(steps):
                _require(isinstance(step, dict), f"{self.pattern_id}.steps[{index}] cần là object")
                _text(step.get("type"), f"{self.pattern_id}.steps[{index}].type", limit=100)
        elif self.kind == "camera":
            _text(payload.get("movement"), f"{self.pattern_id}.movement", limit=60)
        elif self.kind == "fix":
            _text(payload.get("problem"), f"{self.pattern_id}.problem", limit=2000)
            _text(payload.get("resolution"), f"{self.pattern_id}.resolution", limit=2000)
        elif self.kind == "scene":
            _require(isinstance(payload.get("beats"), list) and bool(payload["beats"]), f"{self.pattern_id}: scene cần beats")

    @property
    def digest(self) -> str:
        return content_hash({"kind": self.kind, "payload": self.payload})

    def as_dict(self) -> dict[str, Any]:
        return {
            "pattern_id": self.pattern_id,
            "kind": self.kind,
            "title": self.title,
            "genre": self.genre,
            "payload": copy.deepcopy(self.payload),
            "approval": self.approval.as_dict(),
            "media": [item.as_dict() for item in self.media],
            "tags": list(self.tags),
            "notes": self.notes,
            "uses": self.uses,
            "digest": self.digest,
        }


# --- Library -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PatternLibrary:
    patterns: tuple[Pattern, ...]

    def __post_init__(self) -> None:
        identifiers = [item.pattern_id for item in self.patterns]
        _require(len(identifiers) == len(set(identifiers)), "pattern_id bị trùng")
        digests: dict[str, str] = {}
        for item in self.patterns:
            existing = digests.get(item.digest)
            _require(existing is None, f"{item.pattern_id}: trùng nội dung với {existing}")
            digests[item.digest] = item.pattern_id
        object.__setattr__(self, "patterns", tuple(sorted(self.patterns, key=lambda item: item.pattern_id)))

    def of_kind(self, kind: str) -> tuple[Pattern, ...]:
        _require(kind in PATTERN_KINDS, f"pattern.kind chưa hỗ trợ: {kind}")
        return tuple(item for item in self.patterns if item.kind == kind)

    def search(self, *, genre: str | None = None, kind: str | None = None, tags: Sequence[str] = ()) -> tuple[Pattern, ...]:
        """Patterns matching every given filter, most used first."""
        if kind is not None:
            _require(kind in PATTERN_KINDS, f"pattern.kind chưa hỗ trợ: {kind}")
        wanted = {str(item) for item in tags}
        found = [
            item for item in self.patterns
            if (genre is None or item.genre == genre)
            and (kind is None or item.kind == kind)
            and wanted <= set(item.tags)
        ]
        return tuple(sorted(found, key=lambda item: (-item.uses, item.pattern_id)))

    def add(self, pattern: Pattern) -> "PatternLibrary":
        return PatternLibrary(patterns=(*self.patterns, pattern))

    def remove(self, pattern_id: str) -> "PatternLibrary":
        remaining = tuple(item for item in self.patterns if item.pattern_id != pattern_id)
        _require(len(remaining) < len(self.patterns), f"Không có pattern: {pattern_id}")
        return PatternLibrary(patterns=remaining)

    def record_use(self, pattern_id: str, times: int = 1) -> "PatternLibrary":
        _require(not isinstance(times, bool) and isinstance(times, int) and times > 0, "times phải dương")
        found = next((item for item in self.patterns if item.pattern_id == pattern_id), None)
        _require(found is not None, f"Không có pattern: {pattern_id}")
        assert found is not None
        updated = Pattern(
            pattern_id=found.pattern_id,
            kind=found.kind,
            title=found.title,
            genre=found.genre,
            payload=found.payload,
            approval=found.approval,
            media=found.media,
            tags=found.tags,
            notes=found.notes,
            uses=found.uses + times,
        )
        return PatternLibrary(patterns=(*(item for item in self.patterns if item.pattern_id != pattern_id), updated))

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": LIBRARY_SCHEMA,
            "count": len(self.patterns),
            "patterns": [item.as_dict() for item in self.patterns],
        }


def pattern_from_approved_render(
    *,
    pattern_id: str,
    kind: str,
    title: str,
    genre: str,
    payload: dict[str, Any],
    manifest: Any,
    approved_by: str,
    approved_at: str,
    review_id: str | None = None,
    media: Iterable[MediaReference | dict[str, Any]] = (),
    tags: Iterable[str] = (),
    notes: str | None = None,
) -> Pattern:
    """Promote part of a verified render into a reusable pattern.

    The manifest has to show the render was actually checked and did not lean
    on source media: a pattern learned from an unverified or source-reusing
    render would teach the wrong lesson.
    """
    document = manifest.as_dict() if hasattr(manifest, "as_dict") else manifest
    _require(isinstance(document, dict), "manifest phải là object hoặc có as_dict()")
    fidelity = document.get("fidelity", [])
    _require(bool(fidelity), f"{pattern_id}: render chưa chạy fidelity thì chưa thể thành pattern")
    _require(
        all(item.get("passed") for item in fidelity),
        f"{pattern_id}: render còn fidelity thất bại thì chưa thể thành pattern",
    )
    _require(
        document.get("completion_claim") in {"complete", "partial"},
        f"{pattern_id}: chỉ học pattern từ render 'complete' hoặc 'partial', không từ '{document.get('completion_claim')}'",
    )
    for fallback in document.get("fallbacks", []):
        _require(
            fallback.get("source_media_usage") == "none",
            f"{pattern_id}: render dùng lại media nguồn nên không được đưa vào thư viện",
        )
    return Pattern(
        pattern_id=pattern_id,
        kind=kind,
        title=title,
        genre=genre,
        payload=payload,
        approval=Approval(
            approved_by=approved_by,
            approved_at=approved_at,
            source_hash=str(document.get("source", {}).get("sha256", "")),
            review_id=review_id,
            fidelity_kinds=tuple(str(item.get("kind")) for item in fidelity),
        ),
        media=tuple(item if isinstance(item, MediaReference) else MediaReference(**item) for item in media),
        tags=tuple(tags),
        notes=notes,
    )


def load_library(document: Any) -> PatternLibrary:
    """Rebuild a library from a stored document, re-running every guard."""
    _require(isinstance(document, dict), "library cần là object")
    _require(document.get("schema") == LIBRARY_SCHEMA, "library schema không được hỗ trợ")
    entries = document.get("patterns")
    _require(isinstance(entries, list), "library.patterns cần là danh sách")
    patterns = []
    for entry in entries:
        _require(isinstance(entry, dict), "pattern cần là object")
        payload = {key: value for key, value in entry.items() if key not in {"digest", "approval", "media"}}
        patterns.append(Pattern(
            **payload,
            approval=Approval(**entry["approval"]),
            media=tuple(MediaReference(**item) for item in entry.get("media", [])),
        ))
    return PatternLibrary(patterns=tuple(patterns))


__all__ = [
    "Approval",
    "LIBRARY_SCHEMA",
    "MediaReference",
    "PATTERN_KINDS",
    "Pattern",
    "PatternLibrary",
    "PatternLibraryError",
    "REUSABLE_LICENCES",
    "content_hash",
    "load_library",
    "pattern_from_approved_render",
]
