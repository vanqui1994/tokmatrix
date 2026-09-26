"""Analysis-to-storyboard compiler (UV-304).

Turns what the analysis layer observed — UV-300 observations, UV-302 identities
and relations, UV-303 actions and camera — into a valid Universal Storyboard v2
project.  This is the seam between "what the source shows" and "what we will
build", and it is deliberately conservative:

* **Nothing is invented.**  Every entity, action, relation and audio event the
  compiler emits is backed by an observation and carries that observation's
  evidence ids.  An observation whose reference cannot be resolved is skipped
  and reported, never filled in with a guess.
* **Uncertainty survives.**  Confidence, review status and unresolved identity
  travel into the storyboard's ``analysis`` blocks and entity attributes, and
  every scene is routed ``needs-review`` with an explanation, because choosing a
  renderer is UV-104's and UV-502's decision, not this compiler's.
* **Compilation is deterministic.**  Ids derive from the observation ids, order
  is sorted, and the only clock value is one the caller supplies.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from bkt_web.action_inference import ActionInferenceResult, infer_actions_and_camera
from bkt_web.analysis_result import AnalysisResultV1, validate_analysis_result
from bkt_web.entity_tracking import TrackingResult, infer_tracking
from bkt_web.universal_storyboard import SCHEMA_VERSION, UniversalStoryboardV2, validate_storyboard_v2


COMPILER_AGENT = "bkt_web.analysis_compiler"
COMPILER_VERSION = "1.0.0"
UNASSIGNED_RENDERER = "renderer.unassigned"

_CAMERA_MOVEMENT = {"static": "static", "pan": "pan", "tilt": "tilt", "zoom": "zoom", "unknown": "custom"}
_ENTITY_KIND = {
    "person": "person",
    "face": "person",
    "hand": "person",
    "animal": "animal",
    "object": "object",
    "text": "text",
    "screen": "screen",
    "unknown": "object",
}


class CompilerError(ValueError):
    """Raised when an analysis cannot be compiled into a storyboard."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise CompilerError(message)


def _stem(value: str) -> str:
    """The distinctive part of an id, without its layer prefix."""
    for known in ("observation.", "observation_", "identity.", "identity_", "analysis.", "analysis_",
                  "relation.", "action.", "scene.", "project."):
        if value.startswith(known):
            return value[len(known):]
    return value


def _clean(value: str) -> str:
    """Reduce a fragment to alphanumeric groups separated by single dots."""
    cleaned: list[str] = []
    previous_separator = True
    for character in value.lower():
        if character.isalnum():
            cleaned.append(character)
            previous_separator = False
        elif not previous_separator:
            cleaned.append(".")
            previous_separator = True
    return "".join(cleaned).strip(".")


def _join(*parts: str) -> str:
    """Build one id in the storyboard grammar from several fragments."""
    return ".".join(fragment for fragment in (_clean(part) for part in parts) if fragment)


def _slug(value: str, prefix: str) -> str:
    """A stable id in the storyboard's id grammar, derived from an observation."""
    slug = _clean(_stem(value))
    return f"{prefix}.{slug}" if slug else prefix


@dataclass(frozen=True, slots=True)
class SkippedObservation:
    observation_id: str
    kind: str
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {"observation_id": self.observation_id, "kind": self.kind, "reason": self.reason}


@dataclass(frozen=True, slots=True)
class CompileResult:
    storyboard: dict[str, Any]
    project: UniversalStoryboardV2
    skipped: tuple[SkippedObservation, ...] = ()
    uncertainties: tuple[dict[str, Any], ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "storyboard": copy.deepcopy(self.storyboard),
            "skipped": [item.as_dict() for item in self.skipped],
            "uncertainties": [copy.deepcopy(item) for item in self.uncertainties],
        }


@dataclass(slots=True)
class _Build:
    analysis: AnalysisResultV1
    tracking: TrackingResult
    inference: ActionInferenceResult
    created_at: str
    instant_seconds: float = 0.04
    provenance_id: str = "provenance.analysis"
    skipped: list[SkippedObservation] = field(default_factory=list)
    uncertainties: list[dict[str, Any]] = field(default_factory=list)

    def window(self, start: float, end: float, scene_start: float, scene_end: float) -> tuple[float, float, bool] | None:
        """Clip an interval into the scene, widening a true instant.

        Universal Storyboard v2 needs ``start < end``, but a grip or a placement
        is observed as a moment. Such an event is widened by one frame inside
        the scene and marked, rather than dropped or silently stretched.
        """
        clipped_start = max(scene_start, start)
        clipped_end = min(scene_end, end)
        if clipped_end - clipped_start > 1e-9:
            return clipped_start, clipped_end, False
        forward = min(scene_end, clipped_start + self.instant_seconds)
        if forward - clipped_start > 1e-9:
            return clipped_start, forward, True
        backward = max(scene_start, clipped_end - self.instant_seconds)
        if clipped_end - backward > 1e-9:
            return backward, clipped_end, True
        return None

    def skip(self, observation_id: str, kind: str, reason: str) -> None:
        self.skipped.append(SkippedObservation(observation_id, kind, reason))

    def uncertain(self, target_id: str, kind: str, reason: str, confidence: float | None = None) -> None:
        self.uncertainties.append({"target_id": target_id, "kind": kind, "reason": reason, "confidence": confidence})


def _analysis_block(confidence: float, evidence_ids: tuple[str, ...] | list[str], model: str | None = None) -> dict[str, Any] | None:
    """An ``Analysis`` block, or ``None`` when there is no evidence to cite."""
    if not evidence_ids:
        return None
    return {
        "confidence": confidence,
        "evidence_ids": sorted(set(evidence_ids)),
        "model": model,
        "review_status": "unreviewed",
    }


def _scene_windows(build: _Build) -> list[tuple[str, float, float, tuple[str, ...]]]:
    """Scenes that tile the source exactly, from shot observations when present."""
    duration = build.analysis.duration_seconds
    shots = sorted(
        (item for item in build.analysis.observations if item.kind == "shot"),
        key=lambda item: (item.source_interval.start, item.observation_id),
    )
    if not shots:
        build.uncertain("scene.whole", "scene", "no_shot_observations_single_scene_assumed", None)
        return [("scene.whole", 0.0, duration, ())]
    windows: list[tuple[str, float, float, tuple[str, ...]]] = []
    cursor = 0.0
    for shot in shots:
        start = max(cursor, shot.source_interval.start)
        end = min(duration, shot.source_interval.end)
        if end <= start + 1e-9:
            build.skip(shot.observation_id, "shot", "shot_is_empty_after_clipping")
            continue
        if start > cursor + 1e-9:
            # A hole between shots still has to be covered; it is reported so
            # nobody mistakes the filler for a detected shot.
            windows.append((f"scene.gap.{len(windows)}", cursor, start, ()))
            build.uncertain(f"scene.gap.{len(windows) - 1}", "scene", "gap_between_shot_observations", None)
        windows.append((_slug(shot.observation_id, "scene"), start, end, tuple(shot.evidence_ids)))
        cursor = end
    if not windows:
        return [("scene.whole", 0.0, duration, ())]
    if cursor < duration - 1e-9:
        windows.append((f"scene.tail", cursor, duration, ()))
        build.uncertain("scene.tail", "scene", "source_continues_past_the_last_shot", None)
    last = windows[-1]
    if abs(last[2] - duration) > 1e-9:
        windows[-1] = (last[0], last[1], duration, last[3])
    return windows


def _entities(build: _Build, scene_id: str, start: float, end: float) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """One entity per identity overlapping the window, plus a track→entity map."""
    entities: list[dict[str, Any]] = []
    mapping: dict[str, str] = {}
    label_alternatives = {
        item.observation_id: [
            {"label": alternative.label, "confidence": alternative.confidence}
            for alternative in item.alternatives
        ]
        for item in build.analysis.observations
        if item.kind == "track"
    }
    for identity in build.tracking.identities:
        if identity.end <= start + 1e-9 or identity.start >= end - 1e-9:
            continue
        # Ids are scene-scoped: an identity that spans several scenes appears
        # as one entity per scene, and references never cross a scene boundary.
        entity_id = _join("entity", _stem(scene_id), _stem(identity.identity_id))
        alternatives = sorted(
            (alternative for track_id in identity.track_ids for alternative in label_alternatives.get(track_id, [])),
            key=lambda item: (-item["confidence"], item["label"]),
        )
        evidence: list[str] = []
        for observation in build.analysis.observations:
            if observation.kind == "track" and observation.observation_id in identity.track_ids:
                evidence.extend(observation.evidence_ids)
        entities.append({
            "entity_id": entity_id,
            "kind": _ENTITY_KIND.get(identity.category, "object"),
            "label": identity.label,
            "role": "observed",
            "components": [{
                "component_id": f"{entity_id}.body",
                "kind": "body",
                "state": "visible",
                "anchors": [],
                "attributes": {},
            }],
            "attributes": {
                "observed_category": identity.category,
                "identity_resolved": identity.resolved,
                "track_ids": list(identity.track_ids),
                "label_alternatives": alternatives,
            },
            "analysis": _analysis_block(identity.confidence, tuple(evidence)),
            "provenance_id": build.provenance_id,
        })
        for track_id in identity.track_ids:
            mapping[track_id] = entity_id
        if not identity.resolved:
            build.uncertain(entity_id, "entity", "identity_not_resolved", identity.confidence)
        if alternatives:
            build.uncertain(entity_id, "entity", "competing_labels_kept", identity.confidence)
    return sorted(entities, key=lambda item: item["entity_id"]), mapping


def _speaker_entities(build: _Build, scene_id: str, start: float, end: float, mapping: dict[str, str]) -> list[dict[str, Any]]:
    """Entities for diarisation labels, marked as unresolved identities."""
    speakers: dict[str, list[Any]] = {}
    for observation in build.analysis.observations:
        if observation.kind != "transcript" or observation.speaker_label is None:
            continue
        if observation.source_interval.end <= start + 1e-9 or observation.source_interval.start >= end - 1e-9:
            continue
        speakers.setdefault(observation.speaker_label, []).append(observation)
    entities: list[dict[str, Any]] = []
    for label in sorted(speakers):
        observations = speakers[label]
        entity_id = _join("entity", _stem(scene_id), "speaker", label)
        evidence = [item for observation in observations for item in observation.evidence_ids]
        confidence = min(item.confidence for item in observations)
        entities.append({
            "entity_id": entity_id,
            "kind": "person",
            "label": label,
            "role": "speaker",
            "components": [{
                "component_id": f"{entity_id}.body",
                "kind": "body",
                "state": "visible",
                "anchors": [],
                "attributes": {},
            }],
            "attributes": {
                # A diarisation label says two lines came from the same voice,
                # not who that voice belongs to.
                "identity_resolved": False,
                "identity_source": "diarisation_label",
                "speaker_label": label,
            },
            "analysis": _analysis_block(confidence, tuple(evidence)),
            "provenance_id": build.provenance_id,
        })
        mapping[f"speaker:{label}"] = entity_id
        build.uncertain(entity_id, "entity", "speaker_label_is_not_an_identity", confidence)
    return entities


def _relations(build: _Build, scene_id: str, start: float, end: float, mapping: dict[str, str]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for relation in build.tracking.relations:
        if relation.end <= start + 1e-9 or relation.start >= end - 1e-9:
            continue
        subject = mapping.get(relation.subject_track_id)
        object_ = mapping.get(relation.object_track_id)
        if subject is None or object_ is None:
            build.skip(relation.relation_id, "relation", "relation_track_has_no_entity_in_this_scene")
            continue
        window = build.window(relation.start, relation.end, start, end)
        if window is None:
            build.skip(relation.relation_id, "relation", "relation_does_not_fit_the_scene")
            continue
        output.append({
            "relation_id": _join("relation", _stem(scene_id), _stem(relation.relation_id)),
            "type": relation.type.replace("_", "."),
            "subject_id": subject,
            "object_id": object_,
            "start": window[0],
            "end": window[1],
            "attributes": {"basis": relation.basis, "review_required": relation.review_required, **relation.attributes},
            "analysis": _analysis_block(relation.confidence, relation.evidence_ids),
            "provenance_id": build.provenance_id,
        })
        if relation.review_required:
            build.uncertain(output[-1]["relation_id"], "relation", "inference_requires_review", relation.confidence)
    return sorted(output, key=lambda item: (item["start"], item["relation_id"]))


def _actions(build: _Build, scene_id: str, start: float, end: float, mapping: dict[str, str]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for action in build.inference.actions:
        if action.end <= start + 1e-9 or action.start > end + 1e-9:
            continue
        actor = mapping.get(action.actor_track_id)
        target = mapping.get(action.target_track_id)
        if actor is None or target is None:
            build.skip(action.action_id, "action", "action_track_has_no_entity_in_this_scene")
            continue
        window = build.window(action.start, action.end, start, end)
        if window is None:
            build.skip(action.action_id, "action", "action_does_not_fit_the_scene")
            continue
        action_id = _join("action", _stem(scene_id), _stem(action.action_id))
        output.append({
            "action_id": action_id,
            "type": action.type.replace("_", "."),
            "actor_ids": [actor],
            "target_ids": [target],
            "start": window[0],
            "end": window[1],
            "parameters": {"basis": action.basis, "review_required": action.review_required, "instant": window[2], **action.attributes},
            "analysis": _analysis_block(action.confidence, action.evidence_ids),
            "provenance_id": build.provenance_id,
        })
        if action.review_required:
            build.uncertain(action_id, "action", "inference_requires_review", action.confidence)
    return sorted(output, key=lambda item: (item["start"], item["action_id"]))


def _audio_events(build: _Build, scene_id: str, start: float, end: float, mapping: dict[str, str]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for observation in build.analysis.observations:
        if observation.kind != "transcript":
            continue
        if observation.source_interval.end <= start + 1e-9 or observation.source_interval.start >= end - 1e-9:
            continue
        if observation.speaker_label is None:
            # Dialogue without a speaker cannot be represented honestly, and
            # inventing a speaker would be exactly the wrong move.
            build.skip(observation.observation_id, "transcript", "dialogue_without_speaker_label")
            continue
        speaker = mapping.get(f"speaker:{observation.speaker_label}")
        if speaker is None:
            build.skip(observation.observation_id, "transcript", "speaker_entity_missing_in_this_scene")
            continue
        window = build.window(observation.source_interval.start, observation.source_interval.end, start, end)
        if window is None:
            build.skip(observation.observation_id, "transcript", "dialogue_does_not_fit_the_scene")
            continue
        output.append({
            "audio_event_id": _join("audio", _stem(scene_id), _stem(observation.observation_id)),
            "kind": "dialogue",
            "start": window[0],
            "end": window[1],
            "speaker_id": speaker,
            "text": observation.text,
            "language": observation.language,
            "analysis": _analysis_block(observation.confidence, observation.evidence_ids),
            "provenance_id": build.provenance_id,
        })
    return sorted(output, key=lambda item: (item["start"], item["audio_event_id"]))


def _camera(build: _Build, scene_id: str, start: float, end: float) -> dict[str, Any]:
    shots: list[dict[str, Any]] = []
    for segment in build.inference.camera:
        if segment.end <= start + 1e-9 or segment.start >= end - 1e-9:
            continue
        shots.append({
            "shot_id": f"{scene_id}.shot.{len(shots)}",
            "start": max(start, segment.start),
            "end": min(end, segment.end),
            # Framing is not inferred anywhere, so it is not claimed here.
            "framing": "custom",
            "movement": _CAMERA_MOVEMENT.get(segment.movement, "custom"),
            "subject_ids": [],
            "parameters": {"basis": segment.basis, "magnitude": segment.magnitude, "direction_degrees": segment.direction_degrees},
            "analysis": None,
            "provenance_id": build.provenance_id,
        })
        if segment.review_required:
            build.uncertain(shots[-1]["shot_id"], "camera", "camera_motion_not_separable", segment.confidence)
    if not shots:
        shots.append({
            "shot_id": f"{scene_id}.shot.0",
            "start": start,
            "end": end,
            "framing": "custom",
            "movement": "custom",
            "subject_ids": [],
            "parameters": {"basis": "no_camera_observation"},
            "analysis": None,
            "provenance_id": build.provenance_id,
        })
        build.uncertain(f"{scene_id}.shot.0", "camera", "no_camera_observation_for_this_scene", None)
    # Shots must tile the scene; stretch the ends rather than leave holes.
    shots[0]["start"] = start
    shots[-1]["end"] = end
    for index in range(len(shots) - 1):
        shots[index + 1]["start"] = shots[index]["end"]
    return {"camera_id": f"{scene_id}.camera", "shots": shots}


def compile_storyboard(
    analysis: AnalysisResultV1 | dict[str, Any],
    tracking: TrackingResult | None = None,
    inference: ActionInferenceResult | None = None,
    *,
    created_at: str | None = None,
    project_id: str | None = None,
) -> CompileResult:
    """Compile observations into a validated Universal Storyboard v2 project."""
    model = analysis if isinstance(analysis, AnalysisResultV1) else validate_analysis_result(analysis)
    tracking_result = tracking if tracking is not None else infer_tracking(model)
    _require(isinstance(tracking_result, TrackingResult), "tracking không hợp lệ")
    _require(tracking_result.analysis_id == model.analysis_id, "tracking result thuộc về analysis khác")
    inference_result = inference if inference is not None else infer_actions_and_camera(model, tracking_result)
    _require(isinstance(inference_result, ActionInferenceResult), "inference không hợp lệ")
    _require(inference_result.analysis_id == model.analysis_id, "inference result thuộc về analysis khác")

    stamp = created_at
    if stamp is None:
        stamps = sorted(item.ran_at for item in model.analyzers if item.ran_at)
        _require(bool(stamps), "created_at bắt buộc khi analyzer không khai báo ran_at")
        stamp = stamps[-1]

    frame_rate = model.source.frame_rate
    build = _Build(
        analysis=model,
        tracking=tracking_result,
        inference=inference_result,
        created_at=stamp,
        instant_seconds=(1.0 / frame_rate) if frame_rate else 0.04,
    )
    scenes: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []
    dialogue_items: list[dict[str, Any]] = []
    action_items: list[dict[str, Any]] = []
    selections: list[dict[str, Any]] = []

    for scene_id, start, end, evidence in _scene_windows(build):
        entities, mapping = _entities(build, scene_id, start, end)
        entities.extend(_speaker_entities(build, scene_id, start, end, mapping))
        scene = {
            "scene_id": scene_id,
            "start": start,
            "end": end,
            "summary": None,
            "entities": sorted(entities, key=lambda item: item["entity_id"]),
            "relations": _relations(build, scene_id, start, end, mapping),
            "actions": _actions(build, scene_id, start, end, mapping),
            "constraints": [],
            "camera": _camera(build, scene_id, start, end),
            "environment": None,
            "style": None,
            "audio_events": _audio_events(build, scene_id, start, end, mapping),
            "render_requirements": {"required": [], "preferred": [], "optional": []},
            "analysis": _analysis_block(1.0, evidence) if evidence else None,
            "provenance_id": build.provenance_id,
        }
        scenes.append(scene)
        timeline.append({"item_id": f"item.{scene_id}", "target_type": "scene", "target_id": scene_id, "start": start, "end": end, "layer": 0})
        dialogue_items.extend(
            {"item_id": f"item.{item['audio_event_id']}", "target_type": "audio_event", "target_id": item["audio_event_id"],
             "start": item["start"], "end": item["end"], "layer": 0}
            for item in scene["audio_events"]
        )
        action_items.extend(
            {"item_id": f"item.{item['action_id']}", "target_type": "action", "target_id": item["action_id"],
             "start": item["start"], "end": item["end"], "layer": 0}
            for item in scene["actions"]
        )
        selections.append({
            "selection_id": f"selection.{scene_id}",
            "scene_id": scene_id,
            "start": start,
            "end": end,
            "renderer_id": UNASSIGNED_RENDERER,
            "renderer_version": "0.0.0",
            "status": "needs-review",
            "satisfied_requirement_ids": [],
            "fallback_ids": [],
            "explanation": "Compiled from analysis observations only; choosing a renderer is a routing and direction decision.",
        })

    tracks = [{"track_id": "track.visual", "kind": "visual", "label": "Observed scenes", "items": timeline}]
    if dialogue_items:
        tracks.append({"track_id": "track.dialogue", "kind": "dialogue", "label": "Observed dialogue", "items": dialogue_items})
    if action_items:
        tracks.append({"track_id": "track.actions", "kind": "data", "label": "Inferred actions", "items": action_items})

    storyboard = {
        "schema_version": SCHEMA_VERSION,
        "project_id": project_id or _slug(model.analysis_id, "project"),
        "title": None,
        "source": {
            "source_id": model.source.source_id,
            "sha256": model.source.sha256,
            "media_type": model.source.media_type,
            "uri": model.source.uri,
            "width": model.source.width,
            "height": model.source.height,
            "frame_rate": model.source.frame_rate,
        },
        "duration_seconds": model.duration_seconds,
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": model.timebase.precision},
        "tracks": tracks,
        "scenes": scenes,
        "render_plan": {
            "render_plan_id": "render.plan.analysis",
            "status": "needs-review",
            "selections": selections,
            "fallbacks": [],
        },
        "provenance": [{
            "provenance_id": build.provenance_id,
            "kind": "analysis",
            "created_at": stamp,
            "agent": COMPILER_AGENT,
            "tool_version": COMPILER_VERSION,
            "source_refs": [model.source.source_id],
            "license": None,
            "evidence": [
                {
                    "evidence_id": item.evidence_id,
                    "kind": item.kind,
                    "source_id": item.source_id,
                    # A single-frame evidence record has start == end in the
                    # analysis layer; the storyboard's interval needs a width,
                    # and one frame is the width that frame actually had.
                    "interval": {
                        "start": item.interval.start,
                        "end": item.interval.end if item.interval.end > item.interval.start
                        else min(model.duration_seconds, item.interval.start + build.instant_seconds),
                    },
                    "region": None if item.region is None else {
                        "space": item.region.space, "x": item.region.x, "y": item.region.y,
                        "width": item.region.width, "height": item.region.height,
                    },
                    "quote": item.quote,
                    "annotation": item.annotation,
                }
                for item in sorted(model.evidence, key=lambda entry: entry.evidence_id)
            ],
        }],
    }

    project = validate_storyboard_v2(storyboard)
    return CompileResult(
        storyboard=storyboard,
        project=project,
        skipped=tuple(sorted(build.skipped, key=lambda item: item.observation_id)),
        uncertainties=tuple(sorted(build.uncertainties, key=lambda item: (item["kind"], item["target_id"], item["reason"]))),
    )


__all__ = [
    "COMPILER_AGENT",
    "COMPILER_VERSION",
    "CompileResult",
    "CompilerError",
    "SkippedObservation",
    "UNASSIGNED_RENDERER",
    "compile_storyboard",
]
