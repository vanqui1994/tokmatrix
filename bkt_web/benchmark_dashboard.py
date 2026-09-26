"""Benchmark dashboard over many renders (UV-700).

Rolls the per-render evidence — UV-603 manifests plus the UV-600/601/602
fidelity reports they carry — into aggregate metrics sliced by **genre**,
**action**, **renderer** and **failure reason**, so the programme can see
where it actually stands instead of arguing from the last clip somebody
watched.

The aggregation is deliberately blunt about what it does not know:

* a run with no fidelity result is counted as ``unverified``, never as a pass;
* a slice with too few runs reports ``sample_size`` alongside its rate, and
  :meth:`Dashboard.weakest` refuses to rank a slice below the minimum sample;
* every rate is reported with the counts it came from, so nobody has to trust
  a bare percentage.

Nothing here reads the network or the clock: a dashboard is a pure function of
the runs handed to it.
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence


DASHBOARD_SCHEMA = "tokmatrix.benchmark-dashboard/v1"
DIMENSIONS = ("genre", "action", "renderer", "failure_reason")
OUTCOMES = ("passed", "partial", "failed", "unverified")


class BenchmarkError(ValueError):
    """Raised when a benchmark run or a query is not usable."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise BenchmarkError(message)


def _text(value: Any, label: str, *, limit: int = 200) -> str:
    _require(isinstance(value, str) and bool(value.strip()), f"{label} cần là chuỗi không rỗng")
    _require(len(value) <= limit, f"{label} quá dài")
    return value


def _rate(numerator: int, denominator: int) -> float:
    return 0.0 if denominator == 0 else round(numerator / denominator, 6)


@dataclass(frozen=True, slots=True)
class BenchmarkRun:
    """One render, with the evidence that decides whether it counts as good."""

    run_id: str
    genre: str
    project_id: str
    renderers: tuple[str, ...]
    actions: tuple[str, ...] = ()
    completion_claim: str = "needs-review"
    failure_reasons: tuple[str, ...] = ()
    scene_count: int = 1
    fidelity: dict[str, bool] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "run_id", _text(self.run_id, "run.run_id"))
        object.__setattr__(self, "genre", _text(self.genre, "run.genre", limit=100))
        object.__setattr__(self, "project_id", _text(self.project_id, "run.project_id"))
        _require(bool(self.renderers), f"{self.run_id}: cần ít nhất một renderer")
        object.__setattr__(self, "renderers", tuple(sorted({_text(item, "run.renderer", limit=160) for item in self.renderers})))
        object.__setattr__(self, "actions", tuple(sorted({_text(item, "run.action", limit=100) for item in self.actions})))
        object.__setattr__(self, "failure_reasons", tuple(sorted({_text(item, "run.failure_reason", limit=200) for item in self.failure_reasons})))
        _require(
            not isinstance(self.scene_count, bool) and isinstance(self.scene_count, int) and self.scene_count > 0,
            f"{self.run_id}: scene_count phải dương",
        )
        _require(
            self.completion_claim in {"complete", "partial", "needs-review", "failed"},
            f"{self.run_id}: completion_claim không hợp lệ",
        )
        fidelity = {str(key): bool(value) for key, value in dict(self.fidelity).items()}
        object.__setattr__(self, "fidelity", fidelity)

    @property
    def outcome(self) -> str:
        """A run is only a pass when something actually checked it."""
        if not self.fidelity:
            return "unverified"
        if not all(self.fidelity.values()):
            return "failed"
        if self.completion_claim == "complete":
            return "passed"
        if self.completion_claim in {"partial", "needs-review"}:
            return "partial"
        return "failed"

    def as_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "genre": self.genre,
            "project_id": self.project_id,
            "renderers": list(self.renderers),
            "actions": list(self.actions),
            "completion_claim": self.completion_claim,
            "failure_reasons": list(self.failure_reasons),
            "scene_count": self.scene_count,
            "fidelity": dict(sorted(self.fidelity.items())),
            "outcome": self.outcome,
        }

    @classmethod
    def from_manifest(
        cls,
        manifest: Any,
        *,
        genre: str,
        actions: Iterable[str] = (),
        run_id: str | None = None,
    ) -> "BenchmarkRun":
        """Build a run from a UV-603 manifest (object or plain document)."""
        payload = manifest.as_dict() if hasattr(manifest, "as_dict") else manifest
        _require(isinstance(payload, dict), "manifest phải là object hoặc có as_dict()")
        reasons = [
            str(item) for item in payload.get("claim_reasons", [])
            if not str(item).startswith("all_scenes_rendered")
        ]
        return cls(
            run_id=run_id or _text(payload.get("manifest_id"), "manifest.manifest_id"),
            genre=genre,
            project_id=_text(payload.get("project_id"), "manifest.project_id"),
            renderers=tuple(str(item.get("renderer_id")) for item in payload.get("renderers", [])),
            actions=tuple(actions),
            completion_claim=str(payload.get("completion_claim", "needs-review")),
            failure_reasons=tuple(reasons),
            scene_count=max(1, len({
                scene_id
                for item in payload.get("renderers", [])
                for scene_id in item.get("scene_ids", [])
            })),
            fidelity={str(item.get("kind")): bool(item.get("passed")) for item in payload.get("fidelity", [])},
        )


@dataclass(frozen=True, slots=True)
class Slice:
    dimension: str
    key: str
    runs: int
    passed: int
    partial: int
    failed: int
    unverified: int

    @property
    def pass_rate(self) -> float:
        return _rate(self.passed, self.runs)

    @property
    def failure_rate(self) -> float:
        return _rate(self.failed, self.runs)

    @property
    def verified_rate(self) -> float:
        return _rate(self.runs - self.unverified, self.runs)

    def as_dict(self) -> dict[str, Any]:
        return {
            "dimension": self.dimension,
            "key": self.key,
            "sample_size": self.runs,
            "passed": self.passed,
            "partial": self.partial,
            "failed": self.failed,
            "unverified": self.unverified,
            "pass_rate": self.pass_rate,
            "failure_rate": self.failure_rate,
            "verified_rate": self.verified_rate,
        }


@dataclass(frozen=True, slots=True)
class Dashboard:
    runs: tuple[BenchmarkRun, ...]
    minimum_sample: int

    @property
    def totals(self) -> dict[str, Any]:
        counts = {name: sum(1 for item in self.runs if item.outcome == name) for name in OUTCOMES}
        return {
            "runs": len(self.runs),
            **counts,
            "pass_rate": _rate(counts["passed"], len(self.runs)),
            "verified_rate": _rate(len(self.runs) - counts["unverified"], len(self.runs)),
            "scenes": sum(item.scene_count for item in self.runs),
        }

    def _keys(self, run: BenchmarkRun, dimension: str) -> tuple[str, ...]:
        if dimension == "genre":
            return (run.genre,)
        if dimension == "renderer":
            return run.renderers
        if dimension == "action":
            return run.actions
        return run.failure_reasons

    def slices(self, dimension: str) -> tuple[Slice, ...]:
        _require(dimension in DIMENSIONS, f"Chiều chưa hỗ trợ: {dimension}")
        buckets: dict[str, list[BenchmarkRun]] = {}
        for run in self.runs:
            for key in self._keys(run, dimension):
                buckets.setdefault(key, []).append(run)
        output = [
            Slice(
                dimension=dimension,
                key=key,
                runs=len(items),
                passed=sum(1 for item in items if item.outcome == "passed"),
                partial=sum(1 for item in items if item.outcome == "partial"),
                failed=sum(1 for item in items if item.outcome == "failed"),
                unverified=sum(1 for item in items if item.outcome == "unverified"),
            )
            for key, items in buckets.items()
        ]
        return tuple(sorted(output, key=lambda item: (-item.runs, item.key)))

    def weakest(self, dimension: str, limit: int = 5) -> tuple[Slice, ...]:
        """Worst slices by pass rate, skipping anything below the sample floor."""
        _require(not isinstance(limit, bool) and isinstance(limit, int) and limit > 0, "limit phải dương")
        eligible = [item for item in self.slices(dimension) if item.runs >= self.minimum_sample]
        return tuple(sorted(eligible, key=lambda item: (item.pass_rate, -item.runs, item.key))[:limit])

    def under_sampled(self, dimension: str) -> tuple[Slice, ...]:
        return tuple(item for item in self.slices(dimension) if item.runs < self.minimum_sample)

    def failure_reasons(self, limit: int = 10) -> tuple[dict[str, Any], ...]:
        counts: dict[str, int] = {}
        for run in self.runs:
            for reason in run.failure_reasons:
                counts[reason] = counts.get(reason, 0) + 1
        ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
        return tuple({"reason": reason, "runs": count, "share": _rate(count, len(self.runs))} for reason, count in ordered)

    def fidelity_breakdown(self) -> dict[str, dict[str, Any]]:
        kinds: dict[str, dict[str, int]] = {}
        for run in self.runs:
            for kind, passed in run.fidelity.items():
                bucket = kinds.setdefault(kind, {"runs": 0, "passed": 0})
                bucket["runs"] += 1
                bucket["passed"] += int(passed)
        return {
            kind: {**counts, "pass_rate": _rate(counts["passed"], counts["runs"])}
            for kind, counts in sorted(kinds.items())
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": DASHBOARD_SCHEMA,
            "minimum_sample": self.minimum_sample,
            "totals": self.totals,
            "slices": {
                dimension: [item.as_dict() for item in self.slices(dimension)]
                for dimension in DIMENSIONS
            },
            "weakest": {
                dimension: [item.as_dict() for item in self.weakest(dimension)]
                for dimension in ("genre", "action", "renderer")
            },
            "under_sampled": {
                dimension: [item.key for item in self.under_sampled(dimension)]
                for dimension in ("genre", "action", "renderer")
            },
            "failure_reasons": [dict(item) for item in self.failure_reasons()],
            "fidelity": self.fidelity_breakdown(),
        }

    def as_text(self) -> str:
        """A compact table for a terminal or a commit comment."""
        totals = self.totals
        lines = [
            f"runs={totals['runs']} passed={totals['passed']} partial={totals['partial']} "
            f"failed={totals['failed']} unverified={totals['unverified']} pass_rate={totals['pass_rate']:.3f}",
        ]
        for dimension in DIMENSIONS:
            rows = self.slices(dimension)
            if not rows:
                continue
            lines.append(f"[{dimension}]")
            for row in rows:
                flag = "" if row.runs >= self.minimum_sample else "  (under-sampled)"
                lines.append(
                    f"  {row.key:<40} n={row.runs:<4} pass={row.pass_rate:.3f} "
                    f"fail={row.failure_rate:.3f} unverified={row.unverified}{flag}"
                )
        return "\n".join(lines)


def build_dashboard(runs: Iterable[BenchmarkRun | dict[str, Any]], *, minimum_sample: int = 3) -> Dashboard:
    """Aggregate benchmark runs; duplicate run ids are rejected."""
    _require(
        not isinstance(minimum_sample, bool) and isinstance(minimum_sample, int) and minimum_sample >= 1,
        "minimum_sample phải >= 1",
    )
    records = tuple(item if isinstance(item, BenchmarkRun) else BenchmarkRun(**copy.deepcopy(item)) for item in runs)
    identifiers = [item.run_id for item in records]
    _require(len(identifiers) == len(set(identifiers)), "run_id bị trùng")
    return Dashboard(runs=tuple(sorted(records, key=lambda item: item.run_id)), minimum_sample=minimum_sample)


__all__ = [
    "BenchmarkError",
    "BenchmarkRun",
    "DASHBOARD_SCHEMA",
    "DIMENSIONS",
    "Dashboard",
    "OUTCOMES",
    "Slice",
    "build_dashboard",
]
