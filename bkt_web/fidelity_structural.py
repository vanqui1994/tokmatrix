"""Structural fidelity checks between two storyboards (UV-600).

Compares a **reference** project — normally the UV-304 compile of what the
source actually shows — against the **candidate** project that will be rendered,
and reports where the remake drifted from the source in ways no amount of
visual polish can excuse:

``timing``      duration, scene boundaries and event times
``speaker``     who says each line, including round-robin reassignment
``coverage``    entities and actions present, missing, or invented
``order``       the sequence of actions and dialogue
``continuity``  scene tiling and an entity disappearing mid-way

Both documents are validated first, neither is mutated, and the report is plain
JSON-safe data with a stable code per finding.  A check never guesses: when two
objects cannot be matched, that is reported as a missing or added object rather
than paired up to make the numbers look better.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from bkt_web.universal_storyboard import UniversalStoryboardV2, validate_storyboard_v2


FIDELITY_SCHEMA = "tokmatrix.structural-fidelity/v1"
CATEGORIES = ("timing", "speaker", "coverage", "order", "continuity")


class FidelityError(ValueError):
    """Raised when a fidelity run cannot be set up."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise FidelityError(message)


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise FidelityError(f"{label} phải là số hữu hạn")
    return float(value)


@dataclass(frozen=True, slots=True)
class FidelitySettings:
    """Thresholds a profile can tune; every report echoes the ones it used."""

    timing_tolerance_seconds: float = 0.05
    duration_tolerance_seconds: float = 0.05
    min_entity_coverage: float = 1.0
    min_action_coverage: float = 0.90
    min_dialogue_coverage: float = 1.0
    allow_added_entities: bool = True
    allow_added_actions: bool = False
    allow_reordering: bool = False

    def __post_init__(self) -> None:
        for name in ("timing_tolerance_seconds", "duration_tolerance_seconds"):
            value = _finite(getattr(self, name), f"settings.{name}")
            object.__setattr__(self, name, value)
            _require(value >= 0, f"settings.{name} không được âm")
        for name in ("min_entity_coverage", "min_action_coverage", "min_dialogue_coverage"):
            value = _finite(getattr(self, name), f"settings.{name}")
            object.__setattr__(self, name, value)
            _require(0 <= value <= 1, f"settings.{name} cần trong [0,1]")
        for name in ("allow_added_entities", "allow_added_actions", "allow_reordering"):
            _require(isinstance(getattr(self, name), bool), f"settings.{name} phải là boolean")

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class Finding:
    check_id: str
    category: str
    code: str
    severity: str
    message: str
    refs: tuple[str, ...] = ()
    measured: float | None = None
    expected: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "check_id": self.check_id,
            "category": self.category,
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "refs": list(self.refs),
            "measured": self.measured,
            "expected": self.expected,
        }


@dataclass(frozen=True, slots=True)
class FidelityReport:
    reference_project_id: str
    candidate_project_id: str
    settings: FidelitySettings
    findings: tuple[Finding, ...]
    metrics: dict[str, float]

    @property
    def failures(self) -> tuple[Finding, ...]:
        return tuple(item for item in self.findings if item.severity == "fail")

    @property
    def warnings(self) -> tuple[Finding, ...]:
        return tuple(item for item in self.findings if item.severity == "warn")

    @property
    def passed(self) -> bool:
        return not self.failures

    def by_category(self, category: str) -> tuple[Finding, ...]:
        if category not in CATEGORIES:
            raise FidelityError(f"Nhóm kiểm tra chưa hỗ trợ: {category}")
        return tuple(item for item in self.findings if item.category == category)

    def codes(self) -> tuple[str, ...]:
        return tuple(sorted({item.code for item in self.findings}))

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": FIDELITY_SCHEMA,
            "reference_project_id": self.reference_project_id,
            "candidate_project_id": self.candidate_project_id,
            "passed": self.passed,
            "settings": self.settings.as_dict(),
            "metrics": dict(sorted(self.metrics.items())),
            "findings": [item.as_dict() for item in self.findings],
        }


# --- Flattened views -----------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Entity:
    entity_id: str
    scene_id: str
    scene_index: int
    kind: str
    label: str
    role: str | None
    start: float
    end: float


@dataclass(frozen=True, slots=True)
class _Action:
    action_id: str
    scene_id: str
    scene_index: int
    type: str
    actor_ids: tuple[str, ...]
    target_ids: tuple[str, ...]
    start: float
    end: float


@dataclass(frozen=True, slots=True)
class _Dialogue:
    audio_event_id: str
    scene_id: str
    scene_index: int
    speaker_id: str
    text: str
    start: float
    end: float


def _entities(project: UniversalStoryboardV2) -> list[_Entity]:
    return sorted(
        (
            _Entity(
                entity_id=entity.entity_id,
                scene_id=scene.scene_id,
                scene_index=index,
                kind=entity.kind,
                label=(entity.label or "").strip().lower(),
                role=entity.role,
                start=scene.start,
                end=scene.end,
            )
            for index, scene in enumerate(project.scenes)
            for entity in scene.entities
        ),
        key=lambda item: (item.start, item.entity_id),
    )


def _actions(project: UniversalStoryboardV2) -> list[_Action]:
    return sorted(
        (
            _Action(
                action_id=action.action_id,
                scene_id=scene.scene_id,
                scene_index=index,
                type=action.type,
                actor_ids=tuple(action.actor_ids),
                target_ids=tuple(action.target_ids),
                start=action.start,
                end=action.end,
            )
            for index, scene in enumerate(project.scenes)
            for action in scene.actions
        ),
        key=lambda item: (item.start, item.action_id),
    )


def _dialogue(project: UniversalStoryboardV2) -> list[_Dialogue]:
    return sorted(
        (
            _Dialogue(
                audio_event_id=audio.audio_event_id,
                scene_id=scene.scene_id,
                scene_index=index,
                speaker_id=audio.speaker_id or "",
                text=(audio.text or "").strip(),
                start=audio.start,
                end=audio.end,
            )
            for index, scene in enumerate(project.scenes)
            for audio in scene.audio_events
            if audio.kind == "dialogue"
        ),
        key=lambda item: (item.start, item.audio_event_id),
    )


# --- Matching ------------------------------------------------------------


def _match_entities(
    reference: Sequence[_Entity],
    candidate: Sequence[_Entity],
    scene_paired: bool,
) -> tuple[dict[str, str], list[_Entity], list[_Entity]]:
    """Pair entities by id, then by kind and label. Never one-to-many.

    Entity ids are scene-scoped in Universal Storyboard v2, so when the two
    projects have the same number of scenes a match must stay inside its own
    scene; otherwise the same person in scene 1 could be paired with their
    appearance in scene 2 and a real disappearance would go unnoticed.
    """
    remaining = list(candidate)
    mapping: dict[str, str] = {}
    missing: list[_Entity] = []
    for item in reference:
        pool = [other for other in remaining if not scene_paired or other.scene_index == item.scene_index]
        exact = next((other for other in pool if other.entity_id == item.entity_id), None)
        fallback = exact or next(
            (
                other for other in sorted(pool, key=lambda entry: (entry.start, entry.entity_id))
                if other.kind == item.kind and other.label == item.label and other.label
            ),
            None,
        )
        if fallback is None:
            missing.append(item)
            continue
        mapping[item.entity_id] = fallback.entity_id
        remaining.remove(fallback)
    return mapping, missing, sorted(remaining, key=lambda item: (item.start, item.entity_id))


def _translate(ids: Iterable[str], mapping: dict[str, str]) -> tuple[str, ...]:
    return tuple(mapping.get(item, item) for item in ids)


def _match_actions(
    reference: Sequence[_Action],
    candidate: Sequence[_Action],
    mapping: dict[str, str],
    tolerance: float,
    scene_paired: bool,
) -> tuple[list[tuple[_Action, _Action]], list[_Action], list[_Action]]:
    remaining = list(candidate)
    matched: list[tuple[_Action, _Action]] = []
    missing: list[_Action] = []
    for item in reference:
        actors = _translate(item.actor_ids, mapping)
        targets = _translate(item.target_ids, mapping)
        best: _Action | None = None
        best_key: tuple[float, str] | None = None
        for other in remaining:
            if scene_paired and other.scene_index != item.scene_index:
                continue
            if other.type != item.type or other.actor_ids != actors or other.target_ids != targets:
                continue
            drift = max(abs(other.start - item.start), abs(other.end - item.end))
            key = (drift, other.action_id)
            if best_key is None or key < best_key:
                best, best_key = other, key
        if best is None:
            missing.append(item)
            continue
        matched.append((item, best))
        remaining.remove(best)
    return matched, missing, sorted(remaining, key=lambda item: (item.start, item.action_id))


def _match_dialogue(
    reference: Sequence[_Dialogue],
    candidate: Sequence[_Dialogue],
) -> tuple[list[tuple[_Dialogue, _Dialogue]], list[_Dialogue], list[_Dialogue]]:
    """Dialogue is paired on its text: the words are what the source said."""
    remaining = list(candidate)
    matched: list[tuple[_Dialogue, _Dialogue]] = []
    missing: list[_Dialogue] = []
    for item in reference:
        best = min(
            (other for other in remaining if other.text == item.text),
            key=lambda other: (abs(other.start - item.start), other.audio_event_id),
            default=None,
        )
        if best is None:
            missing.append(item)
            continue
        matched.append((item, best))
        remaining.remove(best)
    return matched, missing, sorted(remaining, key=lambda item: (item.start, item.audio_event_id))


# --- Checks --------------------------------------------------------------


class _Checker:
    def __init__(self, reference: UniversalStoryboardV2, candidate: UniversalStoryboardV2, settings: FidelitySettings):
        self.reference = reference
        self.candidate = candidate
        self.settings = settings
        self.findings: list[Finding] = []
        self.metrics: dict[str, float] = {}

    def add(self, category: str, code: str, severity: str, message: str, refs: Sequence[str] = (), measured: float | None = None, expected: float | None = None) -> None:
        self.findings.append(Finding(
            check_id=f"{category}.{code.lower()}.{len(self.findings)}",
            category=category,
            code=code,
            severity=severity,
            message=message,
            refs=tuple(refs),
            measured=measured,
            expected=expected,
        ))

    # timing ---------------------------------------------------------

    def check_timing(self, matched_actions: Sequence[tuple[_Action, _Action]], matched_dialogue: Sequence[tuple[_Dialogue, _Dialogue]]) -> None:
        tolerance = self.settings.timing_tolerance_seconds
        drift = abs(self.candidate.duration_seconds - self.reference.duration_seconds)
        self.metrics["duration_drift_seconds"] = round(drift, 9)
        if drift > self.settings.duration_tolerance_seconds:
            self.add("timing", "DURATION_MISMATCH", "fail",
                     "candidate duration differs from the source",
                     ("$.duration_seconds",), round(drift, 9), self.settings.duration_tolerance_seconds)

        reference_scenes = [(item.scene_id, item.start, item.end) for item in self.reference.scenes]
        candidate_scenes = [(item.scene_id, item.start, item.end) for item in self.candidate.scenes]
        if len(reference_scenes) != len(candidate_scenes):
            self.add("timing", "SCENE_COUNT_CHANGED", "fail",
                     f"source has {len(reference_scenes)} scenes, candidate has {len(candidate_scenes)}",
                     ("$.scenes",), float(len(candidate_scenes)), float(len(reference_scenes)))
        else:
            worst = 0.0
            for (reference_id, start, end), (candidate_id, other_start, other_end) in zip(reference_scenes, candidate_scenes):
                shift = max(abs(other_start - start), abs(other_end - end))
                worst = max(worst, shift)
                if shift > tolerance:
                    self.add("timing", "SCENE_TIMING_SHIFTED", "fail",
                             "scene boundary moved beyond the tolerance",
                             (reference_id, candidate_id), round(shift, 9), tolerance)
            self.metrics["scene_timing_drift_seconds"] = round(worst, 9)

        worst_event = 0.0
        for item, other in matched_actions:
            shift = max(abs(other.start - item.start), abs(other.end - item.end))
            worst_event = max(worst_event, shift)
            if shift > tolerance:
                self.add("timing", "ACTION_TIMING_SHIFTED", "fail",
                         f"action '{item.type}' moved beyond the tolerance",
                         (item.action_id, other.action_id), round(shift, 9), tolerance)
        for item, other in matched_dialogue:
            shift = max(abs(other.start - item.start), abs(other.end - item.end))
            worst_event = max(worst_event, shift)
            if shift > tolerance:
                self.add("timing", "DIALOGUE_TIMING_SHIFTED", "fail",
                         "dialogue moved beyond the tolerance",
                         (item.audio_event_id, other.audio_event_id), round(shift, 9), tolerance)
        self.metrics["event_timing_drift_seconds"] = round(worst_event, 9)

    # speaker --------------------------------------------------------

    def check_speaker(self, matched_dialogue: Sequence[tuple[_Dialogue, _Dialogue]], missing: Sequence[_Dialogue], added: Sequence[_Dialogue], mapping: dict[str, str]) -> None:
        total = len(matched_dialogue) + len(missing)
        coverage = 1.0 if total == 0 else len(matched_dialogue) / total
        self.metrics["dialogue_coverage"] = round(coverage, 9)
        for item in missing:
            self.add("speaker", "DIALOGUE_MISSING", "fail",
                     "a spoken line from the source has no counterpart",
                     (item.audio_event_id,))
        if coverage < self.settings.min_dialogue_coverage:
            self.add("speaker", "DIALOGUE_COVERAGE_LOW", "fail",
                     "too little of the source dialogue survived",
                     ("$.scenes[*].audio_events",), round(coverage, 9), self.settings.min_dialogue_coverage)
        for item in added:
            self.add("speaker", "DIALOGUE_ADDED", "warn",
                     "candidate speaks a line the source does not contain",
                     (item.audio_event_id,))

        kept = 0
        for item, other in matched_dialogue:
            expected_speaker = mapping.get(item.speaker_id, item.speaker_id)
            if other.speaker_id != expected_speaker:
                self.add("speaker", "SPEAKER_CHANGED", "fail",
                         "the line is attributed to a different speaker",
                         (item.audio_event_id, other.audio_event_id, item.speaker_id, other.speaker_id))
            else:
                kept += 1
        self.metrics["speaker_identity_kept"] = round(1.0 if not matched_dialogue else kept / len(matched_dialogue), 9)

        self._check_round_robin(matched_dialogue)

    def _identities(self, project: UniversalStoryboardV2) -> dict[str, str]:
        """Entity id to a cross-scene identity, since ids are scene-scoped."""
        return {
            entity.entity_id: f"{entity.kind}:{(entity.label or '').strip().lower()}"
            for scene in project.scenes
            for entity in scene.entities
        }

    def _check_round_robin(self, matched_dialogue: Sequence[tuple[_Dialogue, _Dialogue]]) -> None:
        """Catch speakers handed out in a cycle instead of taken from the source."""
        if len(matched_dialogue) < 3:
            return
        reference_identity = self._identities(self.reference)
        candidate_identity = self._identities(self.candidate)
        reference_speakers = [reference_identity.get(item.speaker_id, item.speaker_id) for item, _ in matched_dialogue]
        candidate_speakers = [candidate_identity.get(other.speaker_id, other.speaker_id) for _, other in matched_dialogue]
        distinct = sorted(set(candidate_speakers))
        if len(distinct) < 2:
            return
        first_seen: list[str] = []
        for speaker in candidate_speakers:
            if speaker not in first_seen:
                first_seen.append(speaker)
        cycle = [first_seen[index % len(first_seen)] for index in range(len(candidate_speakers))]
        reference_is_cyclic = reference_speakers == [
            reference_speakers[index % len(set(reference_speakers))] for index in range(len(reference_speakers))
        ]
        if candidate_speakers == cycle and not reference_is_cyclic:
            self.add("speaker", "SPEAKER_ASSIGNED_CYCLICALLY", "fail",
                     "speakers follow a round-robin cycle rather than the source attribution",
                     tuple(item.audio_event_id for item, _ in matched_dialogue))

    # coverage -------------------------------------------------------

    def check_coverage(
        self,
        reference_entities: Sequence[_Entity],
        missing_entities: Sequence[_Entity],
        added_entities: Sequence[_Entity],
        reference_actions: Sequence[_Action],
        matched_actions: Sequence[tuple[_Action, _Action]],
        missing_actions: Sequence[_Action],
        added_actions: Sequence[_Action],
    ) -> None:
        total_entities = len(reference_entities)
        entity_coverage = 1.0 if total_entities == 0 else (total_entities - len(missing_entities)) / total_entities
        self.metrics["entity_coverage"] = round(entity_coverage, 9)
        for item in missing_entities:
            self.add("coverage", "ENTITY_MISSING", "fail",
                     f"entity '{item.label or item.entity_id}' from the source is absent",
                     (item.entity_id, item.scene_id))
        if entity_coverage < self.settings.min_entity_coverage:
            self.add("coverage", "ENTITY_COVERAGE_LOW", "fail",
                     "too few of the source entities survived",
                     ("$.scenes[*].entities",), round(entity_coverage, 9), self.settings.min_entity_coverage)
        for item in added_entities:
            self.add("coverage", "ENTITY_ADDED", "warn" if self.settings.allow_added_entities else "fail",
                     f"candidate adds an entity the source does not show: {item.entity_id}",
                     (item.entity_id, item.scene_id))

        total_actions = len(reference_actions)
        action_coverage = 1.0 if total_actions == 0 else len(matched_actions) / total_actions
        self.metrics["action_coverage"] = round(action_coverage, 9)
        for item in missing_actions:
            self.add("coverage", "ACTION_MISSING", "fail",
                     f"action '{item.type}' from the source is absent",
                     (item.action_id, item.scene_id))
        if action_coverage < self.settings.min_action_coverage:
            self.add("coverage", "ACTION_COVERAGE_LOW", "fail",
                     "too few of the source actions survived",
                     ("$.scenes[*].actions",), round(action_coverage, 9), self.settings.min_action_coverage)
        for item in added_actions:
            # An action nobody observed is an invention, and the program's
            # first rule is not to invent.
            self.add("coverage", "ACTION_ADDED", "warn" if self.settings.allow_added_actions else "fail",
                     f"candidate performs an action the source does not show: {item.type}",
                     (item.action_id, item.scene_id))

    # order ----------------------------------------------------------

    def check_order(self, matched_actions: Sequence[tuple[_Action, _Action]], matched_dialogue: Sequence[tuple[_Dialogue, _Dialogue]]) -> None:
        severity = "warn" if self.settings.allow_reordering else "fail"
        inversions = 0
        for label, pairs, identify in (
            ("action", matched_actions, lambda item: item.action_id),
            ("dialogue", matched_dialogue, lambda item: item.audio_event_id),
        ):
            ordered = sorted(pairs, key=lambda pair: (pair[0].start, identify(pair[0])))
            for index in range(len(ordered) - 1):
                first_reference, first_candidate = ordered[index]
                next_reference, next_candidate = ordered[index + 1]
                if next_reference.start + 1e-9 < first_reference.start:
                    continue
                if next_candidate.start + 1e-9 < first_candidate.start:
                    inversions += 1
                    self.add("order", f"{label.upper()}_ORDER_CHANGED", severity,
                             f"{label} order differs from the source",
                             (identify(first_reference), identify(next_reference)))
        self.metrics["order_inversions"] = float(inversions)

    # continuity -----------------------------------------------------

    def check_continuity(self, mapping: dict[str, str]) -> None:
        for label, project in (("reference", self.reference), ("candidate", self.candidate)):
            cursor = 0.0
            for scene in project.scenes:
                if abs(scene.start - cursor) > 1e-6:
                    self.add("continuity", "SCENE_TIMELINE_BROKEN", "fail",
                             f"{label} scenes do not tile the timeline",
                             (scene.scene_id,), scene.start, cursor)
                cursor = max(cursor, scene.end)
            if abs(cursor - project.duration_seconds) > 1e-6:
                self.add("continuity", "SCENE_TIMELINE_BROKEN", "fail",
                         f"{label} scenes do not reach the end of the project",
                         ("$.scenes",), cursor, project.duration_seconds)

        if len(self.reference.scenes) != len(self.candidate.scenes):
            return
        # Entity ids are scene-scoped, so what carries an identity across
        # scenes is its kind and label.
        def presence(project: UniversalStoryboardV2) -> dict[tuple[str, str], set[int]]:
            output: dict[tuple[str, str], set[int]] = {}
            for index, scene in enumerate(project.scenes):
                for entity in scene.entities:
                    output.setdefault((entity.kind, (entity.label or "").strip().lower()), set()).add(index)
            return output

        reference_presence = presence(self.reference)
        candidate_presence = presence(self.candidate)
        for key, scenes in sorted(reference_presence.items()):
            if len(scenes) < 2:
                continue
            present = candidate_presence.get(key, set())
            gaps = sorted(index for index in scenes if index not in present)
            if gaps and present:
                self.add("continuity", "ENTITY_PRESENCE_GAP", "fail",
                         f"'{key[1] or key[0]}' stays on screen in the source but disappears in the candidate",
                         (f"{key[0]}:{key[1]}", *(self.reference.scenes[index].scene_id for index in gaps)))


def check_structural_fidelity(
    reference: UniversalStoryboardV2 | dict[str, Any],
    candidate: UniversalStoryboardV2 | dict[str, Any],
    settings: FidelitySettings | None = None,
) -> FidelityReport:
    """Compare a candidate storyboard against the source-faithful reference."""
    reference_project = reference if isinstance(reference, UniversalStoryboardV2) else validate_storyboard_v2(reference)
    candidate_project = candidate if isinstance(candidate, UniversalStoryboardV2) else validate_storyboard_v2(candidate)
    options = settings or FidelitySettings()
    _require(isinstance(options, FidelitySettings), "settings không hợp lệ")

    scene_paired = len(reference_project.scenes) == len(candidate_project.scenes)
    reference_entities = _entities(reference_project)
    candidate_entities = _entities(candidate_project)
    mapping, missing_entities, added_entities = _match_entities(reference_entities, candidate_entities, scene_paired)

    reference_actions = _actions(reference_project)
    matched_actions, missing_actions, added_actions = _match_actions(
        reference_actions, _actions(candidate_project), mapping, options.timing_tolerance_seconds, scene_paired,
    )
    matched_dialogue, missing_dialogue, added_dialogue = _match_dialogue(
        _dialogue(reference_project), _dialogue(candidate_project),
    )

    checker = _Checker(reference_project, candidate_project, options)
    checker.check_timing(matched_actions, matched_dialogue)
    checker.check_speaker(matched_dialogue, missing_dialogue, added_dialogue, mapping)
    checker.check_coverage(
        reference_entities, missing_entities, added_entities,
        reference_actions, matched_actions, missing_actions, added_actions,
    )
    checker.check_order(matched_actions, matched_dialogue)
    checker.check_continuity(mapping)

    return FidelityReport(
        reference_project_id=reference_project.project_id,
        candidate_project_id=candidate_project.project_id,
        settings=options,
        findings=tuple(checker.findings),
        metrics=dict(checker.metrics),
    )


__all__ = [
    "CATEGORIES",
    "FIDELITY_SCHEMA",
    "FidelityError",
    "FidelityReport",
    "FidelitySettings",
    "Finding",
    "check_structural_fidelity",
]
