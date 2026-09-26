"""Tests for the learning loop (UV-807).

All tests run offline, no ffmpeg/network required.  Fixtures are synthetic
but structurally identical to real pipeline data: evidence envelopes, legacy
manifests, verified scripts and scratch directories.
"""

import json
import tempfile
import unittest
from pathlib import Path


STAMP = "2026-09-21T10:00:00+00:00"


# ---------------------------------------------------------------------------
# Helpers: build realistic fixtures
# ---------------------------------------------------------------------------


def _evidence_envelope(
    project_id: str = "test-project",
    genre: str = "agriculture",
    renderer: str = "native-vector-v1",
    completion_claim: str = "complete",
    fidelity_passed: bool = True,
    source_sha: str = "a" * 64,
) -> dict:
    """A UV-804 evidence envelope, structurally valid."""
    return {
        "schema": "tokmatrix.render-evidence/v1",
        "completion_claim": completion_claim,
        "manifest": {
            "schema": "tokmatrix.render-manifest/v1",
            "manifest_id": f"manifest.{project_id}",
            "created_at": STAMP,
            "project_id": project_id,
            "completion_claim": completion_claim,
            "source": {"sha256": source_sha, "genre": genre},
            "renderers": [
                {"renderer_id": renderer, "version": "1.0.0", "scene_ids": ["s1"]},
            ],
            "assets": [],
            "fallbacks": [],
            "warnings": [],
            "fidelity": [
                {"kind": "visual", "passed": fidelity_passed, "failure_count": 0 if fidelity_passed else 1, "warning_count": 0},
            ] if fidelity_passed is not None else [],
            "claim_reasons": [],
        },
        "checks": [],
        "not_applicable": [],
    }


def _legacy_manifest(
    project_id: str = "legacy-proj",
    theme: str = "papaya_latex",
    duration: float = 30.0,
    scenes: int = 3,
) -> dict:
    """A pre-UV-804 localization manifest, no evidence schema."""
    return {
        "id": project_id,
        "duration": duration,
        "theme": theme,
        "theme_label": "Test Theme",
        "script_source": "verified",
        "source_sha256": "b" * 64,
        "characters": [{"id": "c1", "name": "Narrator"}],
        "cues": [{"text": "Xin chào", "start": 0, "end": 2}],
        "scenes": [{"scene_id": f"s{i}", "start": i * 10, "end": (i + 1) * 10} for i in range(scenes)],
    }


def _verified_script(theme: str = "apple_orchard", scenes: int = 0) -> dict:
    return {
        "theme": theme,
        "label": "Test script",
        "cues": [{"text": "Hello", "start": 0, "end": 1}],
        **({"scenes": [{"scene_id": f"s{i}"} for i in range(scenes)], "characters": [{"id": "c1"}]} if scenes else {}),
    }


def _write_project(base: Path, name: str, payload: dict, filename: str = "manifest.json") -> None:
    folder = base / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / filename).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _write_scratch(base: Path, slug: str, cues: list | None = None) -> None:
    folder = base / slug
    folder.mkdir(parents=True, exist_ok=True)
    if cues is not None:
        (folder / "cues.json").write_text(json.dumps(cues), encoding="utf-8")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class CollectRunsTest(unittest.TestCase):
    """collect_runs scans multiple sources and deduplicates."""

    def test_evidence_envelope_is_recognised(self):
        from bkt_web.learning_loop import collect_runs

        with tempfile.TemporaryDirectory() as folder:
            projects = Path(folder) / "projects"
            _write_project(projects, "proj-a", _evidence_envelope("proj-a"))
            result = collect_runs(projects)
        self.assertEqual(result.total, 1)
        self.assertEqual(result.evidence_count, 1)
        self.assertEqual(result.legacy_count, 0)
        run = result.runs[0]
        self.assertEqual(run.run_id, "proj-a")
        self.assertEqual(run.genre, "agriculture")
        self.assertEqual(run.outcome, "passed")

    def test_legacy_manifest_becomes_unverified(self):
        from bkt_web.learning_loop import collect_runs

        with tempfile.TemporaryDirectory() as folder:
            projects = Path(folder) / "projects"
            _write_project(projects, "old-proj", _legacy_manifest("old-proj"))
            result = collect_runs(projects)
        self.assertEqual(result.total, 1)
        self.assertEqual(result.legacy_count, 1)
        self.assertEqual(result.runs[0].outcome, "unverified")

    def test_verified_scripts_are_collected(self):
        from bkt_web.learning_loop import collect_runs

        with tempfile.TemporaryDirectory() as folder:
            scripts_path = Path(folder) / "scripts.json"
            scripts_path.write_text(json.dumps({
                "aa" * 32: _verified_script("peanut_farm"),
                "bb" * 32: _verified_script("tomato_garden"),
            }), encoding="utf-8")
            result = collect_runs(
                Path(folder) / "nonexistent",
                scripts_path=scripts_path,
            )
        self.assertEqual(result.script_count, 2)
        self.assertEqual(result.total, 2)
        self.assertTrue(all(r.outcome == "unverified" for r in result.runs))

    def test_scratch_dirs_are_collected(self):
        from bkt_web.learning_loop import collect_runs

        with tempfile.TemporaryDirectory() as folder:
            scratch = Path(folder) / "scratch"
            _write_scratch(scratch, "run-1", cues=[{"text": "hi"}])
            _write_scratch(scratch, "run-2", cues=[{"text": "hey"}])
            _write_scratch(scratch, "run-3", cues=None)  # no cues → skipped
            result = collect_runs(
                Path(folder) / "nonexistent",
                scratch_dir=scratch,
            )
        self.assertEqual(result.scratch_count, 2)
        self.assertEqual(result.total, 2)

    def test_mixed_sources_deduplication(self):
        from bkt_web.learning_loop import collect_runs

        with tempfile.TemporaryDirectory() as folder:
            projects = Path(folder) / "projects"
            _write_project(projects, "proj-a", _evidence_envelope("proj-a"))
            _write_project(projects, "proj-b", _legacy_manifest("proj-b"))

            scripts = Path(folder) / "scripts.json"
            scripts.write_text(json.dumps({"cc" * 32: _verified_script()}), encoding="utf-8")

            scratch = Path(folder) / "scratch"
            _write_scratch(scratch, "run-x", cues=[{"text": "yo"}])

            result = collect_runs(projects, scripts_path=scripts, scratch_dir=scratch)
        self.assertEqual(result.total, 4)
        ids = [r.run_id for r in result.runs]
        self.assertEqual(len(ids), len(set(ids)), "no duplicates")

    def test_broken_files_produce_warnings(self):
        from bkt_web.learning_loop import collect_runs

        with tempfile.TemporaryDirectory() as folder:
            projects = Path(folder) / "projects"
            broken = projects / "bad-proj"
            broken.mkdir(parents=True)
            (broken / "manifest.json").write_text("NOT JSON", encoding="utf-8")
            result = collect_runs(projects)
        self.assertEqual(result.total, 0)
        self.assertTrue(any("bad-proj" in w for w in result.warnings))

    def test_empty_dir_returns_zero_runs(self):
        from bkt_web.learning_loop import collect_runs

        with tempfile.TemporaryDirectory() as folder:
            result = collect_runs(Path(folder) / "nonexistent")
        self.assertEqual(result.total, 0)
        self.assertEqual(result.warnings, ())


class LearningCycleTest(unittest.TestCase):
    """run_learning_cycle produces dashboard + gaps from runs."""

    def _runs(self, n: int, *, failed: int = 0) -> list:
        from bkt_web.benchmark_dashboard import BenchmarkRun

        runs = []
        for i in range(n):
            is_failed = i < failed
            runs.append(BenchmarkRun(
                run_id=f"run-{i:03d}",
                genre="agriculture" if i % 2 == 0 else "talking-head",
                project_id=f"proj-{i:03d}",
                renderers=("native-vector-v1",),
                actions=("walk",) if i % 3 == 0 else (),
                completion_claim="failed" if is_failed else "complete",
                failure_reasons=("ENTITY_HAS_NO_ASSET:farmer",) if is_failed else (),
                scene_count=2,
                fidelity={"visual": not is_failed},
            ))
        return runs

    def test_sufficient_when_at_least_ten_runs(self):
        from bkt_web.learning_loop import run_learning_cycle

        report = run_learning_cycle(self._runs(10))
        self.assertTrue(report.sufficient)
        self.assertEqual(report.actual_runs, 10)
        self.assertEqual(report.dashboard.totals["runs"], 10)

    def test_insufficient_when_below_ten(self):
        from bkt_web.learning_loop import run_learning_cycle

        report = run_learning_cycle(self._runs(5))
        self.assertFalse(report.sufficient)
        self.assertEqual(report.actual_runs, 5)

    def test_gap_ranking_from_failure_reasons(self):
        from bkt_web.learning_loop import run_learning_cycle

        report = run_learning_cycle(self._runs(10, failed=4))
        ranked = report.gap_report.ranked
        self.assertTrue(ranked, "should have at least one ranked gap")
        top = ranked[0]
        self.assertIn("ENTITY_HAS_NO_ASSET", top.gap_id)
        self.assertEqual(top.kind, "asset")
        self.assertGreater(top.score, 0)

    def test_pattern_promotion_from_complete_manifest(self):
        from bkt_web.learning_loop import PatternCandidate, run_learning_cycle

        manifest = _evidence_envelope("test", completion_claim="complete", fidelity_passed=True)["manifest"]
        candidate = PatternCandidate(
            pattern_id="pat.test",
            kind="scene",
            title="Test scene",
            genre="agriculture",
            payload={"beats": [{"type": "establish"}]},
            manifest=manifest,
            approved_by="QA",
            approved_at=STAMP,
        )
        report = run_learning_cycle(self._runs(3), pattern_candidates=[candidate])
        self.assertEqual(len(report.promoted_patterns), 1)
        self.assertEqual(report.promoted_patterns[0].pattern_id, "pat.test")

    def test_pattern_rejected_when_fidelity_fails(self):
        from bkt_web.learning_loop import PatternCandidate, run_learning_cycle

        manifest = _evidence_envelope("test", completion_claim="failed", fidelity_passed=False)["manifest"]
        candidate = PatternCandidate(
            pattern_id="pat.bad",
            kind="scene",
            title="Bad scene",
            genre="agriculture",
            payload={"beats": [{"type": "establish"}]},
            manifest=manifest,
            approved_by="QA",
            approved_at=STAMP,
        )
        report = run_learning_cycle(self._runs(3), pattern_candidates=[candidate])
        self.assertEqual(len(report.promoted_patterns), 0)
        self.assertEqual(len(report.rejected_patterns), 1)
        self.assertIn("pat.bad", report.rejected_patterns[0]["pattern_id"])

    def test_deterministic_output(self):
        from bkt_web.learning_loop import run_learning_cycle

        runs = self._runs(12, failed=3)
        r1 = run_learning_cycle(runs)
        r2 = run_learning_cycle(runs)
        self.assertEqual(r1.as_dict(), r2.as_dict())


class PersistenceTest(unittest.TestCase):
    """save_report and load_report round-trip correctly."""

    def test_save_and_load_round_trip(self):
        from bkt_web.benchmark_dashboard import BenchmarkRun
        from bkt_web.learning_loop import load_report, run_learning_cycle, save_report

        runs = [
            BenchmarkRun(
                run_id=f"rt-{i}", genre="agriculture", project_id=f"p-{i}",
                renderers=("native-vector-v1",), completion_claim="complete",
                fidelity={"visual": True},
            )
            for i in range(5)
        ]
        report = run_learning_cycle(runs)
        with tempfile.TemporaryDirectory() as folder:
            path = save_report(folder, report)
            self.assertTrue(path.is_file())
            self.assertTrue((Path(folder) / "dashboard.json").is_file())
            self.assertTrue((Path(folder) / "gap_ranking.json").is_file())
            loaded = load_report(folder)
        self.assertEqual(loaded["schema"], "tokmatrix.learning-report/v1")
        self.assertEqual(loaded["actual_runs"], 5)
        self.assertEqual(loaded["dashboard"]["totals"]["runs"], 5)

    def test_missing_report_raises(self):
        from bkt_web.learning_loop import LearningLoopError, load_report

        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(LearningLoopError):
                load_report(folder)


class RealDataIntegrationTest(unittest.TestCase):
    """Run collect_runs against the actual project/scratch/scripts dirs."""

    def test_collect_from_real_project_dirs(self):
        from bkt_web.learning_loop import collect_runs

        projects, scripts, scratch = _real_paths()
        result = collect_runs(projects, scripts_path=scripts, scratch_dir=scratch)
        # At least some runs should be collected from the real data on disk
        self.assertGreaterEqual(result.total, 1, "real project dirs should yield at least one run")
        # No crashes
        for run in result.runs:
            self.assertTrue(run.run_id)
            self.assertTrue(run.genre)

    def test_full_cycle_on_real_data(self):
        from bkt_web.learning_loop import collect_runs, run_learning_cycle

        projects, scripts, scratch = _real_paths()
        collected = collect_runs(projects, scripts_path=scripts, scratch_dir=scratch)
        if not collected.runs:
            self.skipTest("no real data on disk")
        report = run_learning_cycle(collected.runs)
        self.assertEqual(report.actual_runs, collected.total)
        # Dashboard should have the same count
        self.assertEqual(report.dashboard.totals["runs"], collected.total)
        # Report serialises without error
        payload = report.as_dict()
        self.assertEqual(payload["schema"], "tokmatrix.learning-report/v1")


def _real_paths():
    base = Path(__file__).resolve().parent.parent / "bkt_web"
    return (
        base / "static" / "remake_projects",
        base / "storage" / "remake_verified_scripts.json",
        base / "storage" / "remake_scratch",
    )


if __name__ == "__main__":
    unittest.main()
