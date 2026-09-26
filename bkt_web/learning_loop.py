"""Vòng học chạy trên dữ liệu thật (UV-807).

Nối ba module đã xây — benchmark dashboard (UV-700), approved-pattern library
(UV-701) và capability gap prioritizer (UV-702) — vào dữ liệu render thật do
UV-804 ghi lại, để chương trình biết mình thật sự đứng ở đâu thay vì chỉ
chạy unit-test trên fixture.

Luồng:

1.  ``collect_runs`` quét thư mục project, nhận dạng evidence envelope UV-804
    và manifest cũ, trả ``BenchmarkRun`` cho mỗi thứ tìm được.  Manifest cũ
    **không** bịa thành đã kiểm — nó vào ``unverified``.

2.  ``run_learning_cycle`` chạy toàn bộ vòng:
    dashboard → gap ranking → pattern promotion (nếu có candidate).

3.  ``save_report`` / ``load_report`` lưu kết quả ra đĩa, có validate.

Acceptance đòi ≥10 render thật. Nếu chưa đủ thì report nói rõ ``sufficient``
bằng False kèm ``actual_runs`` — **không bịa thêm fixture**.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

from bkt_web.benchmark_dashboard import (
    BenchmarkRun,
    Dashboard,
    build_dashboard,
)
from bkt_web.capability_gaps import (
    CostEstimate,
    GapObservation,
    GapReport,
    gaps_from_dashboard,
    prioritise_gaps,
)
from bkt_web.pattern_library import (
    Pattern,
    PatternLibrary,
    PatternLibraryError,
    pattern_from_approved_render,
)

REPORT_SCHEMA = "tokmatrix.learning-report/v1"
EVIDENCE_SCHEMA = "tokmatrix.render-evidence/v1"
MINIMUM_RUNS = 10
GENRE_FROM_THEME: dict[str, str] = {
    "papaya_latex": "agriculture",
    "peanut_farm": "agriculture",
    "apple_orchard": "agriculture",
    "tomato_garden": "agriculture",
    "garden": "agriculture",
    "agriculture": "agriculture",
    "talking_head": "talking-head",
    "product_review": "product",
    "ui_tutorial": "ui-tutorial",
    "infographic": "infographic",
    "universal": "other",
}
GAP_KIND_FROM_PREFIX: dict[str, str] = {
    "ENTITY_HAS_NO_ASSET": "asset",
    "SCENE_HAS_NO_POSES": "renderer",
    "SCENE_HAS_NO_BACKGROUND": "renderer",
    "ACTION_NOT_IN_CATALOG": "action",
    "ACTION_ASSET_NOT_SUPPORTED": "action",
    "ACTION_ACTOR_HAS_NO_ASSET": "asset",
    "CAPABILITY_MISSING": "renderer",
    "NO_FIDELITY_REQUIREMENTS": "analysis",
    "SOURCE_MEDIA_REUSE_NOT_APPROVED": "renderer",
    "COMPILED_WITH_SKIPPED_OBSERVATIONS": "analysis",
    "MG_TEXT_OVERFLOW": "renderer",
    "FC_SOURCE_REUSE_FORBIDDEN": "renderer",
    "UI_PRIVATE_REGION_NOT_REDACTED": "renderer",
    "ANALYSIS_FAILED": "analysis",
}


class LearningLoopError(ValueError):
    """Raised when the learning loop encounters an unrecoverable problem."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise LearningLoopError(message)


# --------------------------------------------------------------------------- #
# Collect runs from project directories
# --------------------------------------------------------------------------- #


def _run_from_evidence(project_id: str, payload: dict[str, Any]) -> BenchmarkRun:
    """Build a BenchmarkRun from a UV-804 evidence envelope."""
    manifest = payload.get("manifest", {})
    genre = str(manifest.get("source", {}).get("genre", "")
                or manifest.get("genre", "")
                or "other")
    return BenchmarkRun.from_manifest(manifest, genre=genre, run_id=project_id)


def _run_from_legacy(project_id: str, payload: dict[str, Any]) -> BenchmarkRun:
    """Build an *unverified* run from a pre-UV-804 localization manifest."""
    theme = str(payload.get("theme", "other"))
    genre = GENRE_FROM_THEME.get(theme, "other")
    renderer = str(payload.get("renderer", payload.get("script_source", "unknown")))
    scenes = payload.get("scenes", [])
    return BenchmarkRun(
        run_id=project_id,
        genre=genre,
        project_id=project_id,
        renderers=(renderer if renderer and renderer != "?" else "unknown",),
        actions=(),
        completion_claim="needs-review",
        failure_reasons=(),
        scene_count=max(1, len(scenes) if isinstance(scenes, list) else 1),
        fidelity={},  # → unverified
    )


def _run_from_verified_script(sha: str, script: dict[str, Any]) -> BenchmarkRun:
    """Build an *unverified* run from a verified script entry."""
    theme = str(script.get("theme", "other"))
    genre = GENRE_FROM_THEME.get(theme, "other")
    renderer = str(script.get("renderer", "unknown"))
    if renderer == "?" or not renderer:
        renderer = "unknown"
    scenes = script.get("scenes", [])
    return BenchmarkRun(
        run_id=f"script-{sha[:16]}",
        genre=genre,
        project_id=f"script-{sha[:16]}",
        renderers=(renderer,),
        actions=(),
        completion_claim="needs-review",
        failure_reasons=(),
        scene_count=max(1, len(scenes) if isinstance(scenes, list) else 1),
        fidelity={},
    )


def _run_from_scratch(slug: str, scratch_dir: Path) -> BenchmarkRun | None:
    """Build an *unverified* run from a pipeline scratch directory."""
    cues_path = scratch_dir / "cues.json"
    if not cues_path.is_file():
        return None
    try:
        cues = json.loads(cues_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(cues, list) or not cues:
        return None
    return BenchmarkRun(
        run_id=f"scratch-{slug}",
        genre="other",
        project_id=f"scratch-{slug}",
        renderers=("unknown",),
        actions=(),
        completion_claim="needs-review",
        failure_reasons=(),
        scene_count=1,
        fidelity={},
    )


@dataclass(frozen=True, slots=True)
class CollectResult:
    """Result of scanning project directories for benchmark runs."""
    runs: tuple[BenchmarkRun, ...]
    evidence_count: int
    legacy_count: int
    script_count: int
    scratch_count: int
    warnings: tuple[str, ...]

    @property
    def total(self) -> int:
        return len(self.runs)

    def as_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "evidence_count": self.evidence_count,
            "legacy_count": self.legacy_count,
            "script_count": self.script_count,
            "scratch_count": self.scratch_count,
            "warnings": list(self.warnings),
        }


def collect_runs(
    projects_dir: str | Path,
    *,
    scripts_path: str | Path | None = None,
    scratch_dir: str | Path | None = None,
) -> CollectResult:
    """Scan project directories, verified scripts, and scratch dirs for runs.

    Sources, in priority order:
    1. Evidence envelopes (UV-804 format) in ``projects_dir/*/manifest.json``
    2. Legacy project manifests in ``projects_dir/*/manifest.json``
    3. Verified scripts from ``scripts_path``
    4. Pipeline scratch directories from ``scratch_dir``

    Duplicate run IDs are resolved by keeping the first source that produced them.
    """
    projects = Path(projects_dir)
    seen_ids: set[str] = set()
    runs: list[BenchmarkRun] = []
    warnings: list[str] = []
    evidence_count = 0
    legacy_count = 0

    # 1 + 2: Project manifests
    if projects.is_dir():
        for child in sorted(projects.iterdir()):
            if not child.is_dir():
                continue
            manifest_path = child / "manifest.json"
            if not manifest_path.is_file():
                # Try project.json as fallback
                manifest_path = child / "project.json"
                if not manifest_path.is_file():
                    continue
            project_id = child.name
            if not re.fullmatch(r"[a-z0-9_-]{1,80}", project_id):
                warnings.append(f"bỏ qua {project_id}: tên không hợp lệ")
                continue
            try:
                payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                warnings.append(f"bỏ qua {project_id}: {str(exc)[:100]}")
                continue
            if not isinstance(payload, dict):
                warnings.append(f"bỏ qua {project_id}: không phải object")
                continue
            try:
                if payload.get("schema") == EVIDENCE_SCHEMA:
                    run = _run_from_evidence(project_id, payload)
                    evidence_count += 1
                else:
                    run = _run_from_legacy(project_id, payload)
                    legacy_count += 1
                if run.run_id not in seen_ids:
                    runs.append(run)
                    seen_ids.add(run.run_id)
            except Exception as exc:
                warnings.append(f"bỏ qua {project_id}: {str(exc)[:120]}")

    # 3: Verified scripts
    script_count = 0
    if scripts_path is not None:
        scripts_file = Path(scripts_path)
        if scripts_file.is_file():
            try:
                scripts = json.loads(scripts_file.read_text(encoding="utf-8"))
                if isinstance(scripts, dict):
                    for sha, script in scripts.items():
                        if not isinstance(script, dict):
                            continue
                        try:
                            run = _run_from_verified_script(sha, script)
                            if run.run_id not in seen_ids:
                                runs.append(run)
                                seen_ids.add(run.run_id)
                                script_count += 1
                        except Exception as exc:
                            warnings.append(f"bỏ qua script {sha[:16]}: {str(exc)[:100]}")
            except (json.JSONDecodeError, OSError) as exc:
                warnings.append(f"bỏ qua verified scripts: {str(exc)[:100]}")

    # 4: Scratch directories
    scratch_count_val = 0
    if scratch_dir is not None:
        scratch = Path(scratch_dir)
        if scratch.is_dir():
            for child in sorted(scratch.iterdir()):
                if not child.is_dir():
                    continue
                slug = child.name
                run = _run_from_scratch(slug, child)
                if run is not None and run.run_id not in seen_ids:
                    runs.append(run)
                    seen_ids.add(run.run_id)
                    scratch_count_val += 1

    return CollectResult(
        runs=tuple(runs),
        evidence_count=evidence_count,
        legacy_count=legacy_count,
        script_count=script_count,
        scratch_count=scratch_count_val,
        warnings=tuple(warnings),
    )


# --------------------------------------------------------------------------- #
# Learning cycle
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class PatternCandidate:
    """A pattern the caller wants to promote, together with its manifest."""
    pattern_id: str
    kind: str
    title: str
    genre: str
    payload: dict[str, Any]
    manifest: dict[str, Any]
    approved_by: str
    approved_at: str
    review_id: str | None = None
    tags: tuple[str, ...] = ()
    notes: str | None = None


@dataclass(frozen=True, slots=True)
class LearningReport:
    """Everything the learning cycle discovered."""
    dashboard: Dashboard
    gap_report: GapReport
    promoted_patterns: tuple[Pattern, ...]
    rejected_patterns: tuple[dict[str, str], ...]
    sufficient: bool
    actual_runs: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": REPORT_SCHEMA,
            "sufficient": self.sufficient,
            "actual_runs": self.actual_runs,
            "minimum_runs": MINIMUM_RUNS,
            "dashboard": self.dashboard.as_dict(),
            "gap_report": self.gap_report.as_dict(),
            "promoted_patterns": [p.as_dict() for p in self.promoted_patterns],
            "rejected_patterns": [dict(r) for r in self.rejected_patterns],
        }


def run_learning_cycle(
    runs: Sequence[BenchmarkRun],
    *,
    costs: Iterable[CostEstimate | dict[str, Any]] = (),
    pattern_candidates: Sequence[PatternCandidate] = (),
    minimum_sample: int = 2,
) -> LearningReport:
    """Run the full learning cycle: dashboard → gaps → pattern promotion."""
    _require(isinstance(runs, (list, tuple)), "runs phải là list hoặc tuple")

    # Dashboard
    dashboard = build_dashboard(runs, minimum_sample=minimum_sample)

    # Gaps
    observations = gaps_from_dashboard(dashboard, kind_of=GAP_KIND_FROM_PREFIX)
    gap_report = prioritise_gaps(
        observations,
        total_runs=max(1, len(runs)),
        costs=costs,
        minimum_sample=minimum_sample,
    )

    # Pattern promotion
    promoted: list[Pattern] = []
    rejected: list[dict[str, str]] = []
    for candidate in pattern_candidates:
        try:
            pattern = pattern_from_approved_render(
                pattern_id=candidate.pattern_id,
                kind=candidate.kind,
                title=candidate.title,
                genre=candidate.genre,
                payload=candidate.payload,
                manifest=candidate.manifest,
                approved_by=candidate.approved_by,
                approved_at=candidate.approved_at,
                review_id=candidate.review_id,
                tags=candidate.tags,
                notes=candidate.notes,
            )
            promoted.append(pattern)
        except (PatternLibraryError, ValueError) as exc:
            rejected.append({
                "pattern_id": candidate.pattern_id,
                "reason": str(exc)[:300],
            })

    return LearningReport(
        dashboard=dashboard,
        gap_report=gap_report,
        promoted_patterns=tuple(promoted),
        rejected_patterns=tuple(rejected),
        sufficient=len(runs) >= MINIMUM_RUNS,
        actual_runs=len(runs),
    )


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #


def save_report(folder: str | Path, report: LearningReport) -> Path:
    """Write the learning report, dashboard, and gap ranking to *folder*."""
    target = Path(folder)
    target.mkdir(parents=True, exist_ok=True)

    payload = report.as_dict()
    report_path = target / "learning_report.json"
    report_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    # Convenience: separate dashboard and gap ranking files
    (target / "dashboard.json").write_text(
        json.dumps(report.dashboard.as_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (target / "gap_ranking.json").write_text(
        json.dumps(report.gap_report.as_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return report_path


def load_report(folder: str | Path) -> dict[str, Any]:
    """Read and validate a saved learning report."""
    path = Path(folder) / "learning_report.json"
    _require(path.is_file(), f"Không có learning report tại {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    _require(
        isinstance(payload, dict) and payload.get("schema") == REPORT_SCHEMA,
        "learning report schema không hợp lệ",
    )
    _require(isinstance(payload.get("dashboard"), dict), "learning report thiếu dashboard")
    _require(isinstance(payload.get("gap_report"), dict), "learning report thiếu gap_report")
    return payload


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def _default_paths() -> tuple[Path, Path, Path]:
    """Return default project, scripts and scratch paths."""
    base = Path(__file__).resolve().parent
    return (
        base / "static" / "remake_projects",
        base / "storage" / "remake_verified_scripts.json",
        base / "storage" / "remake_scratch",
    )


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point: collect → learn → save → print."""
    import argparse

    parser = argparse.ArgumentParser(
        description="UV-807: Vòng học chạy trên dữ liệu thật",
    )
    projects_default, scripts_default, scratch_default = _default_paths()
    parser.add_argument(
        "--projects-dir", type=Path, default=projects_default,
        help="Thư mục chứa remake_projects (mặc định: %(default)s)",
    )
    parser.add_argument(
        "--scripts", type=Path, default=scripts_default,
        help="File verified scripts JSON (mặc định: %(default)s)",
    )
    parser.add_argument(
        "--scratch-dir", type=Path, default=scratch_default,
        help="Thư mục scratch pipeline (mặc định: %(default)s)",
    )
    parser.add_argument(
        "--output", type=Path, default=None,
        help="Thư mục xuất report (mặc định: in ra terminal)",
    )
    args = parser.parse_args(argv)

    print("Collecting runs...")
    collected = collect_runs(
        args.projects_dir,
        scripts_path=args.scripts,
        scratch_dir=args.scratch_dir,
    )
    print(f"  Evidence manifests: {collected.evidence_count}")
    print(f"  Legacy manifests:   {collected.legacy_count}")
    print(f"  Verified scripts:   {collected.script_count}")
    print(f"  Scratch dirs:       {collected.scratch_count}")
    print(f"  Total runs:         {collected.total}")
    for warning in collected.warnings:
        print(f"  ⚠ {warning}")

    if not collected.runs:
        print("\nKhông có dữ liệu nào. Thoát.")
        return 1

    print("\nRunning learning cycle...")
    report = run_learning_cycle(collected.runs)

    print(f"\n{'='*60}")
    print(f"Sufficient (≥{MINIMUM_RUNS}): {report.sufficient}")
    print(f"Actual runs: {report.actual_runs}")
    print(f"\n{report.dashboard.as_text()}")
    print(f"\n{'='*60}")
    print("Gap ranking:")
    print(report.gap_report.as_text())

    if report.promoted_patterns:
        print(f"\nPromoted patterns: {len(report.promoted_patterns)}")
        for p in report.promoted_patterns:
            print(f"  ✓ {p.pattern_id} ({p.kind})")
    if report.rejected_patterns:
        print(f"\nRejected patterns: {len(report.rejected_patterns)}")
        for r in report.rejected_patterns:
            print(f"  ✗ {r['pattern_id']}: {r['reason'][:80]}")

    if args.output:
        path = save_report(args.output, report)
        print(f"\nReport saved to {path}")
    else:
        print("\n(dùng --output DIR để lưu report)")

    return 0


if __name__ == "__main__":
    sys.exit(main())


__all__ = [
    "EVIDENCE_SCHEMA",
    "GENRE_FROM_THEME",
    "GAP_KIND_FROM_PREFIX",
    "MINIMUM_RUNS",
    "REPORT_SCHEMA",
    "CollectResult",
    "LearningLoopError",
    "LearningReport",
    "PatternCandidate",
    "collect_runs",
    "load_report",
    "main",
    "run_learning_cycle",
    "save_report",
]
