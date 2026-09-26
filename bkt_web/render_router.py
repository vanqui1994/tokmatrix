"""Deterministic renderer routing for Universal Storyboard v2 (UV-104).

This module plans routes only.  It never compiles or renders media, and it
conservatively emits ``needs-review`` when no renderer satisfies every hard
requirement.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from bkt_web.capability_registry import inspect_registry, rank_renderers, validate_registry
from bkt_web.universal_storyboard import Scene, UniversalStoryboardV2, validate_storyboard_v2


ROUTER_VERSION = "1.0.0"
_REGISTRY_KINDS = {"feature", "action", "material", "effect", "entity", "asset", "anchor", "fidelity", "media"}


def _stable_id(*parts: Any) -> str:
    value = ":".join(str(part) for part in parts if str(part))
    value = re.sub(r"[^a-z0-9._:-]+", "-", value.lower()).strip("._:-")
    if not value or not value[0].isalpha():
        value = "id:" + value
    return value[:160].rstrip("._:-")


def _capability(value: str) -> tuple[str, str]:
    prefix, separator, capability_id = value.partition(".")
    if separator and prefix in _REGISTRY_KINDS and capability_id:
        return prefix, capability_id
    # Unknown semantic namespaces are hard feature requirements.  A renderer
    # must explicitly declare them; the router never guesses equivalence.
    return "feature", value


def _scene_context(scene: Scene) -> dict[str, Any]:
    entities: dict[str, dict[str, Any]] = {}
    for entity in scene.entities:
        asset = entity.attributes.get("asset")
        if not isinstance(asset, str):
            for component in entity.components:
                candidate = component.attributes.get("asset")
                if isinstance(candidate, str):
                    asset = candidate
                    break
        entry: dict[str, Any] = {"kind": entity.kind}
        if isinstance(asset, str):
            entry["asset"] = asset
        entities[entity.entity_id] = entry
    return {"entities": entities, "scene_duration_seconds": scene.end - scene.start}


def _requirements(scene: Scene, registry: dict[str, Any]) -> tuple[dict[str, list[dict[str, Any]]], dict[str, str]]:
    actions = {item.action_id: item for item in scene.actions}
    requirements: dict[str, list[dict[str, Any]]] = {"required": [], "preferred": [], "optional": []}
    requirement_ids: dict[str, str] = {}
    for tier in requirements:
        for item in getattr(scene.render_requirements, tier):
            kind, capability_id = _capability(item.capability)
            normalized: dict[str, Any] = {
                "kind": kind,
                "id": capability_id,
                "requirement_id": item.requirement_id,
            }
            requirement_ids[item.requirement_id] = tier
            if kind == "fidelity" and item.tolerance is not None:
                normalized["minimum"] = item.tolerance
            if kind == "action" and item.target_ids:
                action = actions.get(item.target_ids[0])
                action_spec = registry.get("actions", {}).get(capability_id, {})
                if action:
                    if action_spec.get("actors") and action.actor_ids:
                        normalized["actor"] = action.actor_ids[0]
                    if action_spec.get("targets") and action.target_ids:
                        normalized["target"] = action.target_ids[0]
            elif kind == "anchor" and item.target_ids:
                normalized["entity"] = item.target_ids[0]
            requirements[tier].append(normalized)
    return requirements, requirement_ids


def route_storyboard(
    storyboard: dict[str, Any] | UniversalStoryboardV2,
    *,
    registry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a validated copy with a newly computed render plan.

    Required capabilities are hard gates.  Preferred capabilities affect the
    registry score only.  If every candidate fails, the scene is covered by a
    ``needs-review`` selection and an approval-required fallback containing a
    concrete machine-readable reason.
    """
    # Routing is allowed to repair a draft/stale render plan.  Parse the strict
    # structure first, then run full semantic validation on the routed output.
    # All non-plan reference/timeline errors still surface at the final check.
    model = storyboard if isinstance(storyboard, UniversalStoryboardV2) else UniversalStoryboardV2.model_validate(copy.deepcopy(storyboard))
    document = copy.deepcopy(registry) if registry is not None else inspect_registry()
    validate_registry(document)
    original = model.model_dump(mode="json", exclude_none=True)
    output = copy.deepcopy(original)
    selections: list[dict[str, Any]] = []
    fallbacks: list[dict[str, Any]] = []
    needs_review = False

    for scene in model.scenes:
        requirements, _requirement_tiers = _requirements(scene, document)
        ranked = rank_renderers(requirements, _scene_context(scene), registry=document)
        eligible = next((item for item in ranked if item["eligible"]), None)
        if eligible:
            renderer_id = eligible["renderer"]
            matched_ids = sorted({item["requirement_id"] for item in eligible["matched"] if "requirement_id" in item})
            selections.append({
                "selection_id": _stable_id("selection", scene.scene_id, renderer_id),
                "scene_id": scene.scene_id,
                "start": scene.start,
                "end": scene.end,
                "renderer_id": renderer_id,
                "renderer_version": document["renderers"][renderer_id]["version"],
                "status": "selected",
                "satisfied_requirement_ids": matched_ids,
                "fallback_ids": [],
                "explanation": eligible["explanation"],
                "extensions": {"com.ssmatool.router:score": eligible["score"]},
            })
            continue

        needs_review = True
        # With several renderers registered, the closest candidate explains the
        # gap better than the alphabetically first one: fewest hard capabilities
        # missing, then fewest limit violations, then the registry score.
        best = min(
            ranked,
            key=lambda item: (len(item["missing_required"]), len(item["limit_violations"]), -item["score"], item["renderer"]),
        ) if ranked else None
        renderer_id = best["renderer"] if best else "needs-review"
        renderer_version = document["renderers"][renderer_id]["version"] if best else "0.0.0"
        missing = best["missing_required"] if best else []
        affected = sorted({item["requirement_id"] for item in missing if "requirement_id" in item})
        if not affected:
            affected = sorted(item.requirement_id for item in scene.render_requirements.required)
        if best and best["limit_violations"]:
            reason_code = "RENDERER_LIMIT_EXCEEDED"
            disclosure = best["explanation"]
        elif best:
            reason_code = "REQUIRED_CAPABILITY_MISSING"
            disclosure = best["explanation"]
        else:
            reason_code = "NO_RENDERER_REGISTERED"
            disclosure = "Không có renderer nào được đăng ký; scene cần người dùng duyệt."
        fallback_id = _stable_id("fallback", scene.scene_id, "needs-review")
        fallbacks.append({
            "fallback_id": fallback_id,
            "scene_id": scene.scene_id,
            "type": "needs-review",
            "reason_code": reason_code,
            "disclosure": disclosure,
            "source_media_usage": "none",
            "approval_required": True,
            "affected_requirement_ids": affected,
        })
        satisfied = []
        if best:
            satisfied = sorted({item["requirement_id"] for item in best["matched"] if "requirement_id" in item})
        selections.append({
            "selection_id": _stable_id("selection", scene.scene_id, renderer_id),
            "scene_id": scene.scene_id,
            "start": scene.start,
            "end": scene.end,
            "renderer_id": renderer_id,
            "renderer_version": renderer_version,
            "status": "needs-review",
            "satisfied_requirement_ids": satisfied,
            "fallback_ids": [fallback_id],
            "explanation": disclosure,
        })

    output["render_plan"] = {
        "render_plan_id": model.render_plan.render_plan_id,
        "status": "needs-review" if needs_review else "routable",
        "selections": selections,
        "fallbacks": fallbacks,
        "extensions": {
            "com.ssmatool.router:version": ROUTER_VERSION,
            "com.ssmatool.router:registry_version": document["version"],
        },
    }
    routed = validate_storyboard_v2(output).model_dump(mode="json", exclude_none=True)
    if model.model_dump(mode="json", exclude_none=True) != original:
        raise AssertionError("router mutated its input")
    return routed


__all__ = ["ROUTER_VERSION", "route_storyboard"]
