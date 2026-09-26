"""Auto Director: profile-driven production decisions (UV-502).

The director turns a validated Universal Storyboard v2 into a *direction plan*:
renderer selection, staging, framing, continuity and caption safe zones, one
explained decision at a time.

Two rules shape the whole module:

* **Hard source facts win.**  Scene times, dialogue speaker identity, dialogue
  text, action order and the source geometry are extracted first and marked
  locked.  A creative profile that would change one of them does not get its
  way: the rule is dropped, a violation is recorded with the fact it collided
  with, and — where a human should look — a review item is raised.  Nothing is
  retimed and no speaker is reassigned, ever.
* **Every decision explains itself.**  A decision carries the rule that fired,
  a confidence derived from the analysis confidence underneath it, and a
  human-readable explanation.  A decision the director cannot make becomes a
  review item instead of a guess.

Input is never mutated, and the plan is a pure function of (storyboard,
profile, registry, manifest) — no wall clock, no randomness, no global state.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

from bkt_web.asset_manifest import checksum_value
from bkt_web.asset_resolver import AssetRequest, ResolutionPolicy, resolve_assets
from bkt_web.capability_registry import inspect_registry
from bkt_web.render_router import route_storyboard
from bkt_web.universal_storyboard import Scene, UniversalStoryboardV2, validate_storyboard_v2


DIRECTOR_VERSION = "1.0.0"
DIRECTION_PLAN_SCHEMA = "tokmatrix.direction-plan/v1"
PROFILES_SCHEMA = "tokmatrix.director-profiles/v1"
PROFILES_PATH = Path(__file__).resolve().parent / "schemas" / "director_profiles.json"

DECISION_KINDS = ("renderer", "staging", "framing", "continuity", "caption_safe_zone", "asset")
LOCKED_FACT_KINDS = ("scene_timing", "speaker", "dialogue_text", "action_order", "source_geometry")

_SIDES = ("center", "left", "right")
_ASPECT_TOLERANCE = 0.02
_DEFAULT_CONFIDENCE = 0.8
_RULE_STRENGTH = {"explicit": 1.0, "default": 0.85, "source_locked": 1.0}
_FRAMINGS = {
    "extreme_wide", "wide", "full", "medium", "close_up", "extreme_close_up",
    "over_shoulder", "point_of_view", "screen_capture", "custom",
}


class DirectorError(ValueError):
    """Raised when a profile document or a director input is not usable."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DirectorError(message)


def _fraction(value: Any, label: str) -> float:
    _require(not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value < 1, f"{label}: cần fraction trong [0,1)")
    return float(value)


def validate_director_profiles(document: Any) -> None:
    _require(isinstance(document, dict) and document.get("schema") == PROFILES_SCHEMA, "Profile schema không được hỗ trợ")
    aspects = document.get("aspects")
    _require(isinstance(aspects, dict) and bool(aspects), "profiles.aspects: cần object")
    for key, value in aspects.items():
        _require(isinstance(key, str) and not isinstance(value, bool) and isinstance(value, (int, float)) and value > 0, f"aspects.{key} không hợp lệ")
    profiles = document.get("profiles")
    _require(isinstance(profiles, dict) and bool(profiles), "profiles: cần object")
    for profile_id, profile in profiles.items():
        label = f"profile.{profile_id}"
        _require(isinstance(profile, dict) and profile.get("id") == profile_id, f"{label}: id không khớp key")
        _require(isinstance(profile.get("source_faithful"), bool), f"{label}.source_faithful cần bool")
        framing = profile.get("framing")
        _require(isinstance(framing, dict) and framing.get("default") in _FRAMINGS, f"{label}.framing.default không hợp lệ")
        _require(isinstance(framing.get("allow_reframe"), bool), f"{label}.framing.allow_reframe cần bool")
        for key in ("by_action", "by_role"):
            table = framing.get(key, {})
            _require(isinstance(table, dict), f"{label}.framing.{key}: cần object")
            for name, value in table.items():
                _require(isinstance(name, str) and value in _FRAMINGS, f"{label}.framing.{key}.{name} không hợp lệ")
        staging = profile.get("staging")
        _require(isinstance(staging, dict), f"{label}.staging: cần object")
        _require(isinstance(staging.get("max_subjects"), int) and not isinstance(staging["max_subjects"], bool) and staging["max_subjects"] > 0, f"{label}.staging.max_subjects không hợp lệ")
        _require(staging.get("primary_side") in _SIDES, f"{label}.staging.primary_side không hợp lệ")
        _fraction(staging.get("margin_fraction"), f"{label}.staging.margin_fraction")
        _require(isinstance(staging.get("rule_of_thirds"), bool), f"{label}.staging.rule_of_thirds cần bool")
        captions = profile.get("captions")
        _require(isinstance(captions, dict) and isinstance(captions.get("enabled"), bool), f"{label}.captions: cần object")
        _require(captions.get("position") in {"top", "center", "bottom", "lower_third"}, f"{label}.captions.position không hợp lệ")
        _require(isinstance(captions.get("max_chars_per_line"), int) and captions["max_chars_per_line"] > 0, f"{label}.captions.max_chars_per_line không hợp lệ")
        safe_area = captions.get("safe_area")
        _require(isinstance(safe_area, dict) and "custom" in safe_area, f"{label}.captions.safe_area cần key custom")
        for aspect, insets in safe_area.items():
            _require(aspect == "custom" or aspect in aspects, f"{label}.captions.safe_area.{aspect}: aspect chưa khai báo")
            _require(isinstance(insets, dict) and set(insets) == {"top", "bottom", "left", "right"}, f"{label}.captions.safe_area.{aspect}: cần top/bottom/left/right")
            for side, value in insets.items():
                _fraction(value, f"{label}.captions.safe_area.{aspect}.{side}")
            _require(insets["top"] + insets["bottom"] < 1 and insets["left"] + insets["right"] < 1, f"{label}.captions.safe_area.{aspect}: inset che hết khung")
        continuity = profile.get("continuity")
        _require(isinstance(continuity, dict), f"{label}.continuity: cần object")
        for key in ("min_shot_seconds", "max_cuts_per_second"):
            value = continuity.get(key)
            _require(not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value > 0, f"{label}.continuity.{key} không hợp lệ")
        for key in ("lock_speaker_screen_side", "preserve_entity_side"):
            _require(isinstance(continuity.get(key), bool), f"{label}.continuity.{key} cần bool")
        renderer = profile.get("renderer")
        _require(isinstance(renderer, dict) and isinstance(renderer.get("preferred_ids"), list), f"{label}.renderer: cần object")
        minimums = renderer.get("min_fidelity", {})
        _require(isinstance(minimums, dict), f"{label}.renderer.min_fidelity: cần object")
        for key, value in minimums.items():
            _require(not isinstance(value, bool) and isinstance(value, (int, float)) and 0 <= value <= 1, f"{label}.renderer.min_fidelity.{key} không hợp lệ")


@lru_cache(maxsize=1)
def _profiles_document() -> dict[str, Any]:
    document = json.loads(PROFILES_PATH.read_text(encoding="utf-8"))
    validate_director_profiles(document)
    return document


def director_profiles() -> dict[str, Any]:
    return copy.deepcopy(_profiles_document())


def profile(profile_id: str) -> dict[str, Any]:
    document = _profiles_document()
    if profile_id not in document["profiles"]:
        raise DirectorError(f"Profile không tồn tại: {profile_id}")
    return copy.deepcopy(document["profiles"][profile_id])


# --- Hard source facts ---------------------------------------------------


def source_facts(storyboard: dict[str, Any] | UniversalStoryboardV2) -> list[dict[str, Any]]:
    """Facts taken from the source that no creative profile may overwrite."""

    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else validate_storyboard_v2(storyboard)
    facts: list[dict[str, Any]] = []
    source = model.source
    facts.append({
        "fact_id": "fact:source_geometry:" + source.source_id,
        "kind": "source_geometry",
        "target_id": source.source_id,
        "value": {"width": source.width, "height": source.height, "frame_rate": source.frame_rate, "sha256": source.sha256},
        "locked": True,
    })
    for scene in model.scenes:
        facts.append({
            "fact_id": f"fact:scene_timing:{scene.scene_id}",
            "kind": "scene_timing",
            "target_id": scene.scene_id,
            "value": {"start": scene.start, "end": scene.end},
            "locked": True,
        })
        facts.append({
            "fact_id": f"fact:action_order:{scene.scene_id}",
            "kind": "action_order",
            "target_id": scene.scene_id,
            "value": [
                {"action_id": action.action_id, "type": action.type, "start": action.start, "end": action.end,
                 "actor_ids": list(action.actor_ids), "target_ids": list(action.target_ids)}
                for action in sorted(scene.actions, key=lambda item: (item.start, item.action_id))
            ],
            "locked": True,
        })
        for event in sorted(scene.audio_events, key=lambda item: (item.start, item.audio_event_id)):
            if event.kind != "dialogue":
                continue
            facts.append({
                "fact_id": f"fact:speaker:{event.audio_event_id}",
                "kind": "speaker",
                "target_id": event.audio_event_id,
                "value": {"speaker_id": event.speaker_id, "start": event.start, "end": event.end},
                "locked": True,
            })
            if event.text is not None:
                facts.append({
                    "fact_id": f"fact:dialogue_text:{event.audio_event_id}",
                    "kind": "dialogue_text",
                    "target_id": event.audio_event_id,
                    "value": {"text": event.text, "language": event.language},
                    "locked": True,
                })
    return facts


# --- Decision helpers ----------------------------------------------------


def _confidence(values: list[float | None], strength: str) -> float:
    known = [value for value in values if value is not None]
    base = min(known) if known else _DEFAULT_CONFIDENCE
    return round(base * _RULE_STRENGTH[strength], 6)


def _analysis_confidence(item: Any) -> float | None:
    analysis = getattr(item, "analysis", None)
    return None if analysis is None else analysis.confidence


def _decision(kind: str, scene_id: str, target_id: str, value: Any, *, rule: str | None, explanation: str, confidence: float, locked_by: list[str] | None = None, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "decision_id": f"decision:{kind}:{target_id}",
        "kind": kind,
        "scene_id": scene_id,
        "target_id": target_id,
        "value": value,
        "rule": rule,
        "explanation": explanation,
        "confidence": confidence,
        "locked_by_source_fact_ids": sorted(locked_by or []),
        **(extra or {}),
    }


def _aspect_key(model: UniversalStoryboardV2, aspects: dict[str, float]) -> str:
    width, height = model.source.width, model.source.height
    if not width or not height:
        return "custom"
    ratio = width / height
    best, best_delta = "custom", _ASPECT_TOLERANCE
    for key, value in sorted(aspects.items()):
        delta = abs(ratio - value)
        if delta <= best_delta:
            best, best_delta = key, delta
    return best


def _subjects(scene: Scene) -> list[str]:
    """Entities ordered by first involvement, then id — never by list order."""

    first_seen: dict[str, float] = {}
    for action in scene.actions:
        for entity_id in list(action.actor_ids) + list(action.target_ids):
            if entity_id not in first_seen or action.start < first_seen[entity_id]:
                first_seen[entity_id] = action.start
    known = {entity.entity_id for entity in scene.entities}
    ordered = sorted(known, key=lambda entity_id: (first_seen.get(entity_id, math.inf), entity_id))
    return ordered


def _framing_for_shot(scene: Scene, shot: Any, spec: dict[str, Any], roles: dict[str, str | None]) -> tuple[str, str]:
    by_action = spec["framing"].get("by_action", {})
    overlapping = sorted(
        (action for action in scene.actions if action.start < shot.end and action.end > shot.start and action.type in by_action),
        key=lambda action: (action.start, action.action_id),
    )
    if overlapping:
        return by_action[overlapping[0].type], f"framing.by_action.{overlapping[0].type}"
    by_role = spec["framing"].get("by_role", {})
    for subject_id in sorted(shot.subject_ids):
        role = roles.get(subject_id)
        if role and role in by_role:
            return by_role[role], f"framing.by_role.{role}"
    return spec["framing"]["default"], "framing.default"


def _caption_box(insets: dict[str, float], position: str) -> dict[str, float]:
    left, right, top, bottom = insets["left"], insets["right"], insets["top"], insets["bottom"]
    width = round(1.0 - left - right, 6)
    available_top, available_bottom = top, 1.0 - bottom
    height = round(min(0.18, available_bottom - available_top), 6)
    if position == "top":
        y = available_top
    elif position == "center":
        y = round((available_top + available_bottom - height) / 2, 6)
    elif position == "lower_third":
        y = round(min(available_bottom - height, 2.0 / 3.0), 6)
    else:
        y = round(available_bottom - height, 6)
    return {"x": round(left, 6), "y": round(y, 6), "width": width, "height": height}


def _asset_requests(scene: Scene, renderer_id: str, registry: dict[str, Any]) -> list[AssetRequest]:
    known_actions = set(registry.get("actions", {}))
    requests: list[AssetRequest] = []
    for entity in sorted(scene.entities, key=lambda item: item.entity_id):
        actions = sorted({
            action.type
            for action in scene.actions
            if action.type in known_actions and (entity.entity_id in action.actor_ids or entity.entity_id in action.target_ids)
        })
        anchors = sorted({anchor.name for component in entity.components for anchor in component.anchors})
        capabilities: dict[str, list[str]] = {}
        if actions:
            capabilities["actions"] = actions
        if anchors:
            capabilities["anchors"] = anchors
        asset_id = entity.attributes.get("asset")
        if not isinstance(asset_id, str):
            # A label is an identity constraint, not a similarity prompt.  A
            # normalized exact ID can hit a reusable catalog record; an
            # unknown ID deliberately flows to generation/fallback/review and
            # cannot silently select the first compatible rig.
            label = entity.label.strip() if isinstance(entity.label, str) else ""
            ascii_label = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode("ascii").lower()
            candidate = re.sub(r"[^a-z0-9]+", "_", ascii_label).strip("_")
            if candidate and candidate[0].isalpha():
                asset_id = candidate[:160].rstrip("_")
            else:
                digest = hashlib.sha256(entity.entity_id.encode("utf-8")).hexdigest()[:16]
                asset_id = f"unresolved:{digest}"
        requests.append(AssetRequest(
            request_id=f"request:{scene.scene_id}:{entity.entity_id}",
            renderer_id=renderer_id,
            kind="vector-rig",
            asset_id=asset_id if isinstance(asset_id, str) else None,
            entity_id=entity.entity_id,
            required_capabilities=capabilities,
        ))
    return requests


# --- The director --------------------------------------------------------


def direct(
    storyboard: dict[str, Any] | UniversalStoryboardV2,
    *,
    profile_id: str = "source-faithful",
    registry: dict[str, Any] | None = None,
    manifest: dict[str, Any] | None = None,
    plan_assets: bool = True,
    cache_dir: str | Path | None = None,
    project_root: str | Path | None = None,
    resolution_policy: ResolutionPolicy | None = None,
) -> dict[str, Any]:
    """Return a direction plan for ``storyboard`` under ``profile_id``."""

    # Parse the structure only: a stale render plan is exactly what routing is
    # about to replace, so the routed output — not the input — is what gets the
    # full semantic validation, inside route_storyboard.
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else UniversalStoryboardV2.model_validate(copy.deepcopy(storyboard))
    before = model.model_dump(mode="json", exclude_none=True)
    document = copy.deepcopy(registry) if registry is not None else inspect_registry()
    spec = profile(profile_id)
    aspects = _profiles_document()["aspects"]
    facts = source_facts(model)
    fact_index = {fact["fact_id"]: fact for fact in facts}

    routed = route_storyboard(model, registry=document)
    selections = {selection["scene_id"]: selection for selection in routed["render_plan"]["selections"]}

    decisions: list[dict[str, Any]] = []
    review_items: list[dict[str, Any]] = []
    violations: list[dict[str, Any]] = []
    asset_requests: list[AssetRequest] = []
    request_scenes: dict[str, str] = {}
    request_entities: dict[str, dict[str, str]] = {}
    speaker_sides: dict[str, str] = {}

    def review(code: str, scene_id: str, target_type: str, target_id: str, detail: str) -> None:
        review_items.append({
            "item_id": f"review:{code.lower().replace('_', '.')}:{target_id}",
            "reason_code": code,
            "scene_id": scene_id,
            "target_type": target_type,
            "target_id": target_id,
            "detail": detail,
        })

    def violation(rule: str, fact_id: str, scene_id: str, detail: str) -> None:
        violations.append({
            "code": "SOURCE_FACT_PROTECTED",
            "rule": rule,
            "fact_id": fact_id,
            "fact_kind": fact_index[fact_id]["kind"],
            "scene_id": scene_id,
            "resolution": "rule_dropped",
            "detail": detail,
        })

    aspect = _aspect_key(model, aspects)
    if aspect == "custom" and model.source.width and model.source.height:
        review("ASPECT_NOT_RECOGNISED", model.scenes[0].scene_id if model.scenes else model.project_id, "project", model.source.source_id,
               f"Tỷ lệ {model.source.width}x{model.source.height} không khớp aspect nào đã khai báo; dùng safe area mặc định.")

    for scene in model.scenes:
        scene_confidence = _analysis_confidence(scene)
        roles = {entity.entity_id: entity.role for entity in scene.entities}

        # --- renderer ---------------------------------------------------
        selection = selections.get(scene.scene_id)
        if selection is None:
            review("NO_RENDERER_SELECTION", scene.scene_id, "scene", scene.scene_id, "Router không trả selection cho scene này.")
        else:
            renderer_id = selection["renderer_id"]
            preferred = spec["renderer"]["preferred_ids"]
            rule = "renderer.preferred" if renderer_id in preferred else "renderer.router"
            decisions.append(_decision(
                "renderer", scene.scene_id, scene.scene_id,
                {"renderer_id": renderer_id, "renderer_version": selection["renderer_version"], "status": selection["status"], "fallback_ids": selection["fallback_ids"]},
                rule=rule,
                explanation=selection.get("explanation") or f"Router chọn {renderer_id}",
                confidence=_confidence([scene_confidence], "explicit" if rule == "renderer.preferred" else "default"),
                locked_by=[f"fact:scene_timing:{scene.scene_id}"],
            ))
            if selection["status"] != "selected":
                review("RENDERER_NEEDS_REVIEW", scene.scene_id, "scene", scene.scene_id, selection.get("explanation") or "Router không tìm được renderer đủ capability.")
            elif preferred and renderer_id not in preferred:
                review("PROFILE_RENDERER_UNAVAILABLE", scene.scene_id, "scene", scene.scene_id,
                       f"Profile ưu tiên {preferred} nhưng router chỉ đáp ứng {renderer_id}.")
            fidelity = document["renderers"].get(renderer_id, {}).get("fidelity", {})
            for key, minimum in sorted(spec["renderer"].get("min_fidelity", {}).items()):
                if fidelity.get(key, 0) < minimum:
                    review("PROFILE_FIDELITY_UNMET", scene.scene_id, "scene", scene.scene_id,
                           f"{renderer_id}.{key}={fidelity.get(key, 0)} thấp hơn mức {minimum} profile mong muốn.")
            if plan_assets and selection["status"] == "selected":
                scene_requests = _asset_requests(scene, renderer_id, document)
                asset_requests.extend(scene_requests)
                request_scenes.update({request.request_id: scene.scene_id for request in scene_requests})
                by_id = {entity.entity_id: entity for entity in scene.entities}
                for request in scene_requests:
                    entity = by_id[request.entity_id]
                    request_entities[request.request_id] = {
                        "entity_id": entity.entity_id,
                        "entity_name": entity.label or entity.entity_id,
                        "entity_kind": entity.kind,
                    }

        # --- staging ------------------------------------------------------
        subjects = _subjects(scene)
        placements = []
        for index, entity_id in enumerate(subjects):
            if index == 0:
                side = spec["staging"]["primary_side"]
            else:
                side = "left" if index % 2 == 1 else "right"
            placements.append({"entity_id": entity_id, "side": side, "order": index, "role": roles.get(entity_id)})
        decisions.append(_decision(
            "staging", scene.scene_id, scene.scene_id,
            {"placements": placements, "margin_fraction": spec["staging"]["margin_fraction"], "rule_of_thirds": spec["staging"]["rule_of_thirds"]},
            rule="staging.profile",
            explanation=f"{len(placements)} subject xếp theo thứ tự xuất hiện trong nguồn, phía chính {spec['staging']['primary_side']}.",
            confidence=_confidence([scene_confidence], "default"),
            locked_by=[f"fact:action_order:{scene.scene_id}"],
        ))
        if len(subjects) > spec["staging"]["max_subjects"]:
            review("STAGING_OVER_CAPACITY", scene.scene_id, "scene", scene.scene_id,
                   f"Scene có {len(subjects)} subject, profile chỉ dàn cảnh tốt cho {spec['staging']['max_subjects']}; không tự loại bỏ entity nào.")

        # --- framing ------------------------------------------------------
        for shot in sorted(scene.camera.shots, key=lambda item: (item.start, item.shot_id)):
            proposed, rule = _framing_for_shot(scene, shot, spec, roles)
            allow_reframe = spec["framing"]["allow_reframe"]
            value = proposed if allow_reframe else shot.framing
            suppressed = None if allow_reframe or proposed == shot.framing else proposed
            explanation = (
                f"{rule} -> {value}" if allow_reframe
                else f"Profile giữ framing nguồn ({shot.framing})" + (f"; bỏ đề xuất {suppressed}" if suppressed else "")
            )
            decisions.append(_decision(
                "framing", scene.scene_id, shot.shot_id,
                {"framing": value, "movement": shot.movement, "source_framing": shot.framing, "start": shot.start, "end": shot.end, "subject_ids": sorted(shot.subject_ids)},
                rule=rule if allow_reframe else "framing.source_locked",
                explanation=explanation,
                confidence=_confidence([_analysis_confidence(shot), scene_confidence], "explicit" if rule != "framing.default" else "default"),
                locked_by=[f"fact:scene_timing:{scene.scene_id}"],
                extra={"suppressed_by_profile": suppressed},
            ))

        # --- continuity ----------------------------------------------------
        shots = sorted(scene.camera.shots, key=lambda item: (item.start, item.shot_id))
        duration = scene.end - scene.start
        short_shots = [shot.shot_id for shot in shots if (shot.end - shot.start) < spec["continuity"]["min_shot_seconds"]]
        cuts_per_second = round((len(shots) - 1) / duration, 6) if duration > 0 else 0.0
        for shot_id in short_shots:
            violation("continuity.min_shot_seconds", f"fact:scene_timing:{scene.scene_id}", scene.scene_id,
                      f"Shot {shot_id} ngắn hơn {spec['continuity']['min_shot_seconds']}s nhưng timing nguồn không bị sửa.")
            review("SHOT_BELOW_PROFILE_MINIMUM", scene.scene_id, "scene", shot_id,
                   "Profile muốn shot dài hơn; cần người quyết định thay vì tự retime.")
        if cuts_per_second > spec["continuity"]["max_cuts_per_second"]:
            violation("continuity.max_cuts_per_second", f"fact:scene_timing:{scene.scene_id}", scene.scene_id,
                      f"Nhịp cắt {cuts_per_second}/s vượt {spec['continuity']['max_cuts_per_second']}/s; không gộp shot của nguồn.")
            review("CUT_RATE_ABOVE_PROFILE", scene.scene_id, "scene", scene.scene_id,
                   "Nhịp cắt cao hơn profile mong muốn; giữ nguyên nguồn và chờ duyệt.")
        placement_side = {item["entity_id"]: item["side"] for item in placements}
        scene_speaker_sides: dict[str, str] = {}
        for event in sorted(scene.audio_events, key=lambda item: (item.start, item.audio_event_id)):
            if event.kind != "dialogue" or event.speaker_id is None:
                continue
            side = placement_side.get(event.speaker_id, spec["staging"]["primary_side"])
            if spec["continuity"]["lock_speaker_screen_side"] and event.speaker_id in speaker_sides:
                locked_side = speaker_sides[event.speaker_id]
                if locked_side != side:
                    review("SPEAKER_SIDE_CONFLICT", scene.scene_id, "entity", event.speaker_id,
                           f"Speaker đổi phía khung ({locked_side} -> {side}); giữ {locked_side} cho liên tục.")
                side = locked_side
            speaker_sides.setdefault(event.speaker_id, side)
            scene_speaker_sides[event.speaker_id] = side
        decisions.append(_decision(
            "continuity", scene.scene_id, scene.scene_id,
            {
                "shot_count": len(shots),
                "cuts_per_second": cuts_per_second,
                "shots_below_minimum": short_shots,
                "speaker_screen_sides": dict(sorted(scene_speaker_sides.items())),
                "preserve_entity_side": spec["continuity"]["preserve_entity_side"],
            },
            rule="continuity.profile",
            explanation=f"{len(shots)} shot, {cuts_per_second} cắt/giây; timing và speaker giữ nguyên từ nguồn.",
            confidence=_confidence([scene_confidence], "source_locked"),
            locked_by=sorted(
                [f"fact:scene_timing:{scene.scene_id}"]
                + [f"fact:speaker:{event.audio_event_id}" for event in scene.audio_events if event.kind == "dialogue"]
            ),
        ))

        # --- caption safe zone ----------------------------------------------
        cues = [
            {"audio_event_id": event.audio_event_id, "start": event.start, "end": event.end, "speaker_id": event.speaker_id, "text": event.text}
            for event in sorted(scene.audio_events, key=lambda item: (item.start, item.audio_event_id))
            if event.kind == "dialogue"
        ]
        insets = spec["captions"]["safe_area"].get(aspect, spec["captions"]["safe_area"]["custom"])
        decisions.append(_decision(
            "caption_safe_zone", scene.scene_id, scene.scene_id,
            {
                "enabled": spec["captions"]["enabled"] and bool(cues),
                "aspect": aspect,
                "position": spec["captions"]["position"],
                "max_chars_per_line": spec["captions"]["max_chars_per_line"],
                "safe_area": dict(sorted(insets.items())),
                "box": _caption_box(insets, spec["captions"]["position"]),
                "cues": cues,
            },
            rule=f"captions.{spec['captions']['position']}",
            explanation=f"Caption trong safe area {aspect}; lời thoại và mốc thời gian sao chép nguyên văn từ nguồn.",
            confidence=_confidence([scene_confidence], "source_locked" if cues else "default"),
            locked_by=sorted([f"fact:dialogue_text:{cue['audio_event_id']}" for cue in cues if cue["text"] is not None]),
        ))

    # --- assets -------------------------------------------------------------
    asset_plan: dict[str, Any] | None = None
    asset_gaps: list[dict[str, Any]] = []
    if plan_assets and asset_requests:
        asset_plan = resolve_assets(
            asset_requests,
            manifest=manifest,
            policy=resolution_policy or ResolutionPolicy(),
            cache_dir=cache_dir,
            project_root=project_root,
        )
        for resolution in asset_plan["resolutions"]:
            scene_id = request_scenes[resolution["request_id"]]
            if resolution["status"] == "resolved":
                decisions.append(_decision(
                    "asset", scene_id, resolution["request_id"],
                    {"asset_id": resolution["asset_id"], "version": resolution["asset_version"], "strategy": resolution["strategy"], "checksum": resolution["checksum"], "local_path": resolution["local_path"]},
                    rule=f"asset.{resolution['strategy']}",
                    explanation=resolution["explanation"],
                    confidence=_confidence([None], "explicit" if resolution["strategy"] == "exact" else "default"),
                    extra={"requires_approval": resolution["requires_approval"], "source_media_usage": resolution["source_media_usage"]},
                ))
                if resolution["requires_approval"]:
                    review("SOURCE_MEDIA_REUSE", scene_id, "entity", resolution["entity_id"] or resolution["request_id"],
                           resolution["disclosure"] or "Dùng lại media nguồn; cần duyệt.")
            else:
                identity = request_entities[resolution["request_id"]]
                detail = (
                    f"Không có asset phù hợp cho entity '{identity['entity_name']}' "
                    f"({identity['entity_id']}): {resolution['explanation']}"
                )
                asset_gaps.append({
                    "gap_id": f"gap:asset:{resolution['request_id']}",
                    "reason_code": resolution.get("reason_code", "NO_ASSET_ROUTE"),
                    "scene_id": scene_id,
                    "entity_id": identity["entity_id"],
                    "entity_name": identity["entity_name"],
                    "entity_kind": identity.get("entity_kind", "object"),
                    "requested_asset_id": next(
                        request.asset_id for request in asset_requests
                        if request.request_id == resolution["request_id"]
                    ),
                    "missing_capabilities": copy.deepcopy(resolution["missing_capabilities"]),
                    "attempts": copy.deepcopy(resolution["attempts"]),
                    "detail": detail,
                })
                review("ASSET_NEEDS_REVIEW", scene_id, "entity", identity["entity_id"], detail)

    decisions.sort(key=lambda item: (item["scene_id"], DECISION_KINDS.index(item["kind"]), item["decision_id"]))
    review_items.sort(key=lambda item: (item["scene_id"], item["reason_code"], item["item_id"]))
    violations.sort(key=lambda item: (item["scene_id"], item["rule"], item["fact_id"]))

    plan = {
        "schema": DIRECTION_PLAN_SCHEMA,
        "version": DIRECTOR_VERSION,
        "profile_id": profile_id,
        "profile_source_faithful": spec["source_faithful"],
        "project_id": model.project_id,
        "source_sha256": model.source.sha256,
        "schema_version": model.schema_version,
        "aspect": aspect,
        "registry_version": document["version"],
        "render_plan": routed["render_plan"],
        "source_facts": facts,
        "decisions": decisions,
        "review_items": review_items,
        "violations": violations,
        "asset_plan": None if asset_plan is None else {key: asset_plan[key] for key in ("schema", "version", "resolutions", "needs_review", "source_fallback_request_ids")},
        "asset_gaps": asset_gaps,
        "status": "needs-review" if review_items or routed["render_plan"]["status"] == "needs-review" else "directed",
    }
    plan["plan_hash"] = checksum_value({key: value for key, value in plan.items() if key != "plan_hash"})
    if model.model_dump(mode="json", exclude_none=True) != before:
        raise AssertionError("director mutated its input")
    return plan


__all__ = [
    "DECISION_KINDS",
    "DIRECTION_PLAN_SCHEMA",
    "DIRECTOR_VERSION",
    "LOCKED_FACT_KINDS",
    "PROFILES_PATH",
    "DirectorError",
    "direct",
    "director_profiles",
    "profile",
    "source_facts",
    "validate_director_profiles",
]
