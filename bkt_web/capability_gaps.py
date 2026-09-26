"""Capability gap prioritizer (UV-702).

Turns the benchmark evidence into an ordered list of what to build next.  A
gap is something the pipeline could not do — a renderer that refused a scene,
an action with no runtime, an asset that was missing, a fidelity check that
kept failing — and each one is ranked by three factors the plan names:

``frequency``       how often it blocked a run
``fidelity_impact`` how badly it hurt the runs it touched
``cost``            how much work it is to close, as estimated by a human

The ranking is a transparent weighted score, not a black box: every gap
carries its three normalised components and the counts behind them, so a
decision can be argued with rather than just believed.

Two honesty rules:

* a gap with **no cost estimate** is not silently assumed cheap — it is ranked
  with the declared ``unknown`` cost and flagged, so nobody plans around a
  number nobody gave;
* gaps seen fewer times than the sample floor are reported separately as
  ``emerging`` instead of being mixed into the ranking.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence


GAP_SCHEMA = "tokmatrix.capability-gaps/v1"
GAP_KINDS = ("renderer", "action", "asset", "constraint", "material", "analysis", "audio", "other")
COST_LEVELS = {"small": 0.2, "medium": 0.5, "large": 0.8, "unknown": 0.6}
SEVERITY_WEIGHT = {"blocked": 1.0, "degraded": 0.6, "cosmetic": 0.25}


class CapabilityGapError(ValueError):
    """Raised when a gap or a prioritisation request is not usable."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise CapabilityGapError(message)


def _text(value: Any, label: str, *, limit: int = 200) -> str:
    _require(isinstance(value, str) and bool(value.strip()), f"{label} cần là chuỗi không rỗng")
    _require(len(value) <= limit, f"{label} quá dài")
    return value


def _unit(value: Any, label: str) -> float:
    _require(
        not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value),
        f"{label} phải là số hữu hạn",
    )
    number = float(value)
    _require(0 <= number <= 1, f"{label} cần trong [0,1]")
    return number


@dataclass(frozen=True, slots=True)
class Weights:
    frequency: float = 0.45
    fidelity_impact: float = 0.40
    cost: float = 0.15

    def __post_init__(self) -> None:
        for name in self.__slots__:
            object.__setattr__(self, name, _unit(getattr(self, name), f"weights.{name}"))
        total = self.frequency + self.fidelity_impact + self.cost
        _require(abs(total - 1.0) < 1e-9, f"weights phải cộng lại bằng 1, hiện tại {total}")

    def as_dict(self) -> dict[str, float]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class GapObservation:
    """One run blocked or degraded by one missing capability."""

    gap_id: str
    kind: str
    run_id: str
    severity: str = "blocked"
    genre: str | None = None
    detail: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "gap_id", _text(self.gap_id, "gap.gap_id"))
        _require(self.kind in GAP_KINDS, f"{self.gap_id}: kind chưa hỗ trợ: {self.kind}")
        object.__setattr__(self, "run_id", _text(self.run_id, "gap.run_id"))
        _require(self.severity in SEVERITY_WEIGHT, f"{self.gap_id}: severity chưa hỗ trợ: {self.severity}")

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class CostEstimate:
    gap_id: str
    level: str
    estimated_by: str | None = None
    notes: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "gap_id", _text(self.gap_id, "cost.gap_id"))
        _require(self.level in COST_LEVELS, f"{self.gap_id}: cost level chưa hỗ trợ: {self.level}")

    @property
    def factor(self) -> float:
        return COST_LEVELS[self.level]

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class RankedGap:
    gap_id: str
    kind: str
    score: float
    runs_blocked: int
    runs_seen: int
    genres: tuple[str, ...]
    severity_mix: dict[str, int]
    frequency_score: float
    fidelity_impact_score: float
    cost_level: str
    cost_score: float
    cost_estimated: bool
    details: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "gap_id": self.gap_id,
            "kind": self.kind,
            "score": self.score,
            "runs_blocked": self.runs_blocked,
            "runs_seen": self.runs_seen,
            "genres": list(self.genres),
            "severity_mix": dict(sorted(self.severity_mix.items())),
            "frequency_score": self.frequency_score,
            "fidelity_impact_score": self.fidelity_impact_score,
            "cost_level": self.cost_level,
            "cost_score": self.cost_score,
            "cost_estimated": self.cost_estimated,
            "details": list(self.details),
        }


@dataclass(frozen=True, slots=True)
class GapReport:
    total_runs: int
    weights: Weights
    minimum_sample: int
    ranked: tuple[RankedGap, ...]
    emerging: tuple[RankedGap, ...]

    @property
    def unestimated(self) -> tuple[str, ...]:
        return tuple(item.gap_id for item in (*self.ranked, *self.emerging) if not item.cost_estimated)

    def top(self, limit: int = 5) -> tuple[RankedGap, ...]:
        _require(not isinstance(limit, bool) and isinstance(limit, int) and limit > 0, "limit phải dương")
        return self.ranked[:limit]

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": GAP_SCHEMA,
            "total_runs": self.total_runs,
            "weights": self.weights.as_dict(),
            "minimum_sample": self.minimum_sample,
            "ranked": [item.as_dict() for item in self.ranked],
            "emerging": [item.as_dict() for item in self.emerging],
            "unestimated": list(self.unestimated),
        }

    def as_text(self) -> str:
        lines = [f"runs={self.total_runs} weights={self.weights.as_dict()}"]
        for index, item in enumerate(self.ranked, start=1):
            flag = "" if item.cost_estimated else "  (cost not estimated)"
            lines.append(
                f"{index:>2}. {item.gap_id:<36} {item.kind:<10} score={item.score:.3f} "
                f"blocked={item.runs_blocked}/{item.runs_seen} cost={item.cost_level}{flag}"
            )
        for item in self.emerging:
            lines.append(f"  · emerging: {item.gap_id} (seen {item.runs_seen}×, below the sample floor)")
        return "\n".join(lines)


def prioritise_gaps(
    observations: Iterable[GapObservation | dict[str, Any]],
    *,
    total_runs: int,
    costs: Iterable[CostEstimate | dict[str, Any]] = (),
    weights: Weights | None = None,
    minimum_sample: int = 2,
) -> GapReport:
    """Rank capability gaps by frequency, fidelity impact and cost."""
    _require(
        not isinstance(total_runs, bool) and isinstance(total_runs, int) and total_runs > 0,
        "total_runs phải dương",
    )
    _require(
        not isinstance(minimum_sample, bool) and isinstance(minimum_sample, int) and minimum_sample >= 1,
        "minimum_sample phải >= 1",
    )
    scoring = weights or Weights()
    records = tuple(
        item if isinstance(item, GapObservation) else GapObservation(**copy.deepcopy(item))
        for item in observations
    )
    cost_records = {
        item.gap_id: item
        for item in (entry if isinstance(entry, CostEstimate) else CostEstimate(**copy.deepcopy(entry)) for entry in costs)
    }

    buckets: dict[str, list[GapObservation]] = {}
    for item in records:
        buckets.setdefault(item.gap_id, []).append(item)

    ranked: list[RankedGap] = []
    for gap_id, items in buckets.items():
        kinds = {item.kind for item in items}
        _require(len(kinds) == 1, f"{gap_id}: cùng một gap_id không được mang hai kind khác nhau: {sorted(kinds)}")
        runs = {item.run_id for item in items}
        _require(len(runs) <= total_runs, f"{gap_id}: số run có gap lớn hơn total_runs")
        blocked = {item.run_id for item in items if item.severity == "blocked"}
        severity_mix: dict[str, int] = {}
        for item in items:
            severity_mix[item.severity] = severity_mix.get(item.severity, 0) + 1
        frequency_score = len(runs) / total_runs
        impact = sum(SEVERITY_WEIGHT[item.severity] for item in items) / len(items)
        estimate = cost_records.get(gap_id)
        cost_level = estimate.level if estimate is not None else "unknown"
        # A cheap fix scores higher, so the cost factor is inverted.
        cost_score = 1.0 - COST_LEVELS[cost_level]
        score = (
            scoring.frequency * frequency_score
            + scoring.fidelity_impact * impact
            + scoring.cost * cost_score
        )
        ranked.append(RankedGap(
            gap_id=gap_id,
            kind=next(iter(kinds)),
            score=round(score, 6),
            runs_blocked=len(blocked),
            runs_seen=len(runs),
            genres=tuple(sorted({item.genre for item in items if item.genre})),
            severity_mix=severity_mix,
            frequency_score=round(frequency_score, 6),
            fidelity_impact_score=round(impact, 6),
            cost_level=cost_level,
            cost_score=round(cost_score, 6),
            cost_estimated=estimate is not None,
            details=tuple(sorted({item.detail for item in items if item.detail})),
        ))

    ordered = sorted(ranked, key=lambda item: (-item.score, -item.runs_seen, item.gap_id))
    return GapReport(
        total_runs=total_runs,
        weights=scoring,
        minimum_sample=minimum_sample,
        ranked=tuple(item for item in ordered if item.runs_seen >= minimum_sample),
        emerging=tuple(item for item in ordered if item.runs_seen < minimum_sample),
    )


def gaps_from_dashboard(dashboard: Any, *, kind_of: dict[str, str] | None = None) -> tuple[GapObservation, ...]:
    """Read gap observations out of a UV-700 dashboard's failure reasons.

    A reason of the form ``<something>:<id>`` becomes a gap on that id; the
    caller can map a reason prefix onto a gap kind, and anything unmapped is
    recorded as ``other`` rather than guessed at.
    """
    runs = getattr(dashboard, "runs", None)
    _require(runs is not None, "dashboard cần có .runs")
    mapping = dict(kind_of or {})
    output: list[GapObservation] = []
    for run in runs:
        for reason in run.failure_reasons:
            prefix, _, remainder = str(reason).partition(":")
            gap_id = remainder.split(":", 1)[0] if remainder else prefix
            output.append(GapObservation(
                gap_id=f"{prefix}:{gap_id}" if remainder else prefix,
                kind=mapping.get(prefix, "other"),
                run_id=run.run_id,
                severity="blocked" if run.outcome == "failed" else "degraded",
                genre=run.genre,
                detail=str(reason),
            ))
    return tuple(output)


__all__ = [
    "COST_LEVELS",
    "CapabilityGapError",
    "CostEstimate",
    "GAP_KINDS",
    "GAP_SCHEMA",
    "GapObservation",
    "GapReport",
    "RankedGap",
    "SEVERITY_WEIGHT",
    "Weights",
    "gaps_from_dashboard",
    "prioritise_gaps",
]
