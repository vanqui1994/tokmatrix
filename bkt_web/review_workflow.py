"""Human review of director decisions (UV-503).

A review is opened per scene, action, entity or individual decision.  Each
approval is stored under a key built from the **source hash**, the **schema
version** and a fingerprint of the exact thing that was reviewed, which is what
makes the record safe to reuse: re-cut the source, bump the storyboard schema
or edit the reviewed scene and the old approval no longer matches — it is
marked stale with a reason instead of quietly continuing to authorise output
nobody looked at.

Stale entries are kept rather than deleted, so the audit trail survives, but
``apply_review`` ignores them.  The store is plain JSON, written atomically,
and holds no media and no credentials — only ids, hashes, a status, a reviewer
name and a short note.
"""

from __future__ import annotations

import copy
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from bkt_web.asset_manifest import checksum_value
from bkt_web.universal_storyboard import UniversalStoryboardV2, validate_storyboard_v2


REVIEW_SCHEMA = "tokmatrix.review-session/v1"
REVIEW_STORE_SCHEMA = "tokmatrix.review-store/v1"
REVIEW_WORKFLOW_VERSION = "1.0.0"
REVIEW_STORE_PATH = Path(__file__).resolve().parent / "storage" / "universal_review_decisions.json"

REVIEW_STATUSES = ("approved", "rejected", "changes-requested")
TARGET_TYPES = ("scene", "action", "entity", "decision", "project")
LOW_CONFIDENCE_THRESHOLD = 0.7

_STALE_REASONS = ("SOURCE_HASH_CHANGED", "SCHEMA_VERSION_CHANGED", "TARGET_CONTENT_CHANGED", "TARGET_REMOVED")
_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$", re.IGNORECASE)


class ReviewError(ValueError):
    """Raised when a review record or store cannot be trusted."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ReviewError(message)


def _rfc3339(value: Any, label: str) -> str:
    _require(isinstance(value, str) and bool(value), f"{label}: cần RFC 3339 date-time")
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        raise ReviewError(f"{label}: cần RFC 3339 date-time") from None
    _require(parsed.tzinfo is not None, f"{label}: thiếu timezone")
    return value


def entry_key(*, source_sha256: str, schema_version: str, project_id: str, target_type: str, target_id: str, fingerprint: str) -> str:
    """Stable key: an approval only applies to this source, schema and subject."""

    _require(target_type in TARGET_TYPES, f"target_type không hợp lệ: {target_type}")
    return checksum_value({
        "source_sha256": source_sha256,
        "schema_version": schema_version,
        "project_id": project_id,
        "target_type": target_type,
        "target_id": target_id,
        "fingerprint": fingerprint,
    })


def _subject_fingerprints(model: UniversalStoryboardV2) -> dict[tuple[str, str], str]:
    """Content hash of every reviewable subject in the storyboard."""

    fingerprints: dict[tuple[str, str], str] = {}
    document = model.model_dump(mode="json", exclude_none=True)
    fingerprints[("project", document["source"]["source_id"])] = checksum_value(document["source"])
    for scene in document["scenes"]:
        fingerprints[("scene", scene["scene_id"])] = checksum_value(scene)
        for action in scene["actions"]:
            fingerprints[("action", action["action_id"])] = checksum_value(action)
        for entity in scene["entities"]:
            fingerprints[("entity", entity["entity_id"])] = checksum_value(entity)
    return fingerprints


def open_review(plan: dict[str, Any], storyboard: dict[str, Any] | UniversalStoryboardV2, *, low_confidence_threshold: float = LOW_CONFIDENCE_THRESHOLD) -> dict[str, Any]:
    """Build the review session for a direction plan: one item per subject."""

    _require(isinstance(plan, dict) and plan.get("schema") == "tokmatrix.direction-plan/v1", "Direction plan schema không được hỗ trợ")
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    _require(model.source.sha256 == plan["source_sha256"], "Storyboard và direction plan không cùng source")
    _require(model.project_id == plan["project_id"], "Storyboard và direction plan không cùng project")
    fingerprints = _subject_fingerprints(model)
    source_id = model.source.source_id
    items: dict[str, dict[str, Any]] = {}

    def add(target_type: str, target_id: str, reason_code: str, detail: str, scene_id: str | None, fingerprint: str) -> None:
        item_id = checksum_value({"target_type": target_type, "target_id": target_id, "reason_code": reason_code})
        item = items.setdefault(item_id, {
            "item_id": item_id,
            "target_type": target_type,
            "target_id": target_id,
            "scene_id": scene_id,
            "reason_codes": [],
            "details": [],
            "fingerprint": fingerprint,
            "entry_key": entry_key(
                source_sha256=plan["source_sha256"],
                schema_version=plan["schema_version"],
                project_id=plan["project_id"],
                target_type=target_type,
                target_id=target_id,
                fingerprint=fingerprint,
            ),
        })
        if reason_code not in item["reason_codes"]:
            item["reason_codes"].append(reason_code)
        if detail not in item["details"]:
            item["details"].append(detail)

    for review_item in plan.get("review_items", []):
        target_type = review_item["target_type"]
        target_id = review_item["target_id"]
        fingerprint = fingerprints.get((target_type, target_id))
        if fingerprint is None:
            # A target the storyboard does not own (a shot, a request id) is
            # reviewed against its scene, never against a made-up fingerprint.
            target_type, target_id = "scene", review_item["scene_id"]
            fingerprint = fingerprints.get((target_type, target_id), checksum_value(review_item))
        add(target_type, target_id, review_item["reason_code"], review_item["detail"], review_item["scene_id"], fingerprint)

    for decision in plan.get("decisions", []):
        needs = []
        if decision.get("requires_approval"):
            needs.append("DECISION_REQUIRES_APPROVAL")
        if decision["confidence"] < low_confidence_threshold:
            needs.append("DECISION_LOW_CONFIDENCE")
        for reason_code in needs:
            add("decision", decision["decision_id"], reason_code,
                f"{decision['kind']} ({decision['rule']}), confidence {decision['confidence']}: {decision['explanation']}",
                decision["scene_id"], checksum_value(decision["value"]))

    ordered = sorted(items.values(), key=lambda item: (item["target_type"], item["target_id"], item["item_id"]))
    for item in ordered:
        item["reason_codes"].sort()
        item["details"].sort()
    return {
        "schema": REVIEW_SCHEMA,
        "version": REVIEW_WORKFLOW_VERSION,
        "project_id": plan["project_id"],
        "source_sha256": plan["source_sha256"],
        "schema_version": plan["schema_version"],
        "profile_id": plan["profile_id"],
        "plan_hash": plan["plan_hash"],
        "source_id": source_id,
        "fingerprints": {f"{kind}:{target_id}": value for (kind, target_id), value in sorted(fingerprints.items())},
        "items": ordered,
        "status": "clean" if not ordered else "pending",
    }


def empty_store() -> dict[str, Any]:
    return {"schema": REVIEW_STORE_SCHEMA, "version": REVIEW_WORKFLOW_VERSION, "entries": {}}


def validate_store(store: Any) -> None:
    _require(isinstance(store, dict) and store.get("schema") == REVIEW_STORE_SCHEMA, "Review store schema không được hỗ trợ")
    entries = store.get("entries")
    _require(isinstance(entries, dict), "store.entries: cần object")
    for key, entry in entries.items():
        _require(isinstance(entry, dict) and entry.get("entry_key") == key, f"store.entries.{key}: entry_key không khớp")
        _require(entry.get("status") in REVIEW_STATUSES, f"store.entries.{key}.status không hợp lệ")
        _require(entry.get("target_type") in TARGET_TYPES, f"store.entries.{key}.target_type không hợp lệ")
        _require(entry.get("state") in {"active", "stale"}, f"store.entries.{key}.state không hợp lệ")
        _require(entry.get("stale_reason") in (None, *_STALE_REASONS), f"store.entries.{key}.stale_reason không hợp lệ")
        for field in ("source_sha256", "schema_version", "project_id", "target_id", "fingerprint", "reviewer"):
            _require(isinstance(entry.get(field), str) and bool(entry[field]), f"store.entries.{key}.{field} bị thiếu")
        _rfc3339(entry.get("decided_at"), f"store.entries.{key}.decided_at")
        note = entry.get("note")
        _require(note is None or (isinstance(note, str) and len(note) <= 2000), f"store.entries.{key}.note không hợp lệ")


def load_store(path: str | Path | None = None) -> dict[str, Any]:
    target = Path(path) if path is not None else REVIEW_STORE_PATH
    if not target.is_file():
        return empty_store()
    store = json.loads(target.read_text(encoding="utf-8"))
    validate_store(store)
    return store


def save_store(store: dict[str, Any], path: str | Path | None = None) -> Path:
    validate_store(store)
    target = Path(path) if path is not None else REVIEW_STORE_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({**store, "entries": dict(sorted(store["entries"].items()))}, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    staging = target.with_name(target.name + f".tmp.{os.getpid()}")
    staging.write_text(payload, encoding="utf-8")
    staging.replace(target)
    return target


def record_decision(
    store: dict[str, Any],
    review: dict[str, Any],
    *,
    item_id: str,
    status: str,
    reviewer: str,
    decided_at: str,
    note: str | None = None,
) -> dict[str, Any]:
    """Return a new store with this reviewer's verdict; input is not mutated."""

    validate_store(store)
    _require(review.get("schema") == REVIEW_SCHEMA, "Review session schema không được hỗ trợ")
    _require(status in REVIEW_STATUSES, f"status không hợp lệ: {status}")
    _require(isinstance(reviewer, str) and bool(reviewer.strip()) and len(reviewer) <= 200, "reviewer bị thiếu")
    _require(note is None or (isinstance(note, str) and len(note) <= 2000), "note quá dài")
    _rfc3339(decided_at, "decided_at")
    item = next((candidate for candidate in review["items"] if candidate["item_id"] == item_id), None)
    _require(item is not None, f"Review item không tồn tại: {item_id}")
    entry = {
        "entry_key": item["entry_key"],
        "project_id": review["project_id"],
        "source_sha256": review["source_sha256"],
        "schema_version": review["schema_version"],
        "profile_id": review["profile_id"],
        "target_type": item["target_type"],
        "target_id": item["target_id"],
        "fingerprint": item["fingerprint"],
        "reason_codes": list(item["reason_codes"]),
        "status": status,
        "reviewer": reviewer,
        "note": note,
        "decided_at": decided_at,
        "state": "active",
        "stale_reason": None,
    }
    updated = copy.deepcopy(store)
    updated["entries"][entry["entry_key"]] = entry
    validate_store(updated)
    return updated


def invalidate(store: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    """Mark entries that no longer describe the current source/schema/subject."""

    validate_store(store)
    _require(review.get("schema") == REVIEW_SCHEMA, "Review session schema không được hỗ trợ")
    updated = copy.deepcopy(store)
    invalidated: list[dict[str, str]] = []
    current = review["fingerprints"]
    for key, entry in sorted(updated["entries"].items()):
        if entry["project_id"] != review["project_id"] or entry["state"] == "stale":
            continue
        reason: str | None = None
        if entry["source_sha256"] != review["source_sha256"]:
            reason = "SOURCE_HASH_CHANGED"
        elif entry["schema_version"] != review["schema_version"]:
            reason = "SCHEMA_VERSION_CHANGED"
        elif entry["target_type"] != "decision":
            fingerprint = current.get(f"{entry['target_type']}:{entry['target_id']}")
            if fingerprint is None:
                reason = "TARGET_REMOVED"
            elif fingerprint != entry["fingerprint"]:
                reason = "TARGET_CONTENT_CHANGED"
        else:
            live = next((item for item in review["items"] if item["target_type"] == "decision" and item["target_id"] == entry["target_id"]), None)
            if live is not None and live["fingerprint"] != entry["fingerprint"]:
                reason = "TARGET_CONTENT_CHANGED"
        if reason:
            entry["state"] = "stale"
            entry["stale_reason"] = reason
            invalidated.append({"entry_key": key, "target_id": entry["target_id"], "reason": reason})
    validate_store(updated)
    return {"store": updated, "invalidated": invalidated}


def apply_review(review: dict[str, Any], store: dict[str, Any]) -> dict[str, Any]:
    """Attach stored verdicts to a review session and compute its status."""

    validate_store(store)
    _require(review.get("schema") == REVIEW_SCHEMA, "Review session schema không được hỗ trợ")
    resolved = copy.deepcopy(review)
    for item in resolved["items"]:
        entry = store["entries"].get(item["entry_key"])
        if entry is None:
            # No live approval for this exact subject.  A verdict recorded for
            # the same target under an older source, schema or content hash is
            # surfaced as history — it never approves the current version.
            previous = sorted(
                (
                    candidate for candidate in store["entries"].values()
                    if candidate["project_id"] == review["project_id"]
                    and candidate["target_type"] == item["target_type"]
                    and candidate["target_id"] == item["target_id"]
                ),
                key=lambda candidate: (candidate["decided_at"], candidate["entry_key"]),
            )
            item["review_status"] = "pending"
            item["review"] = None if not previous else {
                "stale_reason": previous[-1]["stale_reason"] or "TARGET_CONTENT_CHANGED",
                "previous_status": previous[-1]["status"],
                "reviewer": previous[-1]["reviewer"],
            }
            continue
        if entry["state"] != "active":
            item["review_status"] = "pending"
            item["review"] = {"stale_reason": entry["stale_reason"], "previous_status": entry["status"], "reviewer": entry["reviewer"]}
            continue
        item["review_status"] = entry["status"]
        item["review"] = {"reviewer": entry["reviewer"], "decided_at": entry["decided_at"], "note": entry["note"], "status": entry["status"]}
    statuses = {item["review_status"] for item in resolved["items"]}
    if not resolved["items"]:
        resolved["status"] = "clean"
    elif statuses == {"approved"}:
        resolved["status"] = "approved"
    elif "rejected" in statuses:
        resolved["status"] = "rejected"
    elif "changes-requested" in statuses:
        resolved["status"] = "changes-requested"
    else:
        resolved["status"] = "pending"
    resolved["pending_item_ids"] = sorted(item["item_id"] for item in resolved["items"] if item["review_status"] == "pending")
    return resolved


def is_release_approved(resolved_review: dict[str, Any]) -> bool:
    """True only when every open item has a live approval for this exact source."""

    return resolved_review["status"] in {"approved", "clean"}


__all__ = [
    "LOW_CONFIDENCE_THRESHOLD",
    "REVIEW_SCHEMA",
    "REVIEW_STATUSES",
    "REVIEW_STORE_PATH",
    "REVIEW_STORE_SCHEMA",
    "REVIEW_WORKFLOW_VERSION",
    "TARGET_TYPES",
    "ReviewError",
    "apply_review",
    "empty_store",
    "entry_key",
    "invalidate",
    "is_release_approved",
    "load_store",
    "open_review",
    "record_decision",
    "save_store",
    "validate_store",
]
