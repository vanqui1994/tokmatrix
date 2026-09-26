import copy
import json
import unittest


def run(run_id, genre="agriculture", *, renderers=("native-vector-v1",), actions=("grip",),
        claim="complete", reasons=(), scenes=2, fidelity=None):
    return {
        "run_id": run_id,
        "genre": genre,
        "project_id": f"project.{run_id}",
        "renderers": list(renderers),
        "actions": list(actions),
        "completion_claim": claim,
        "failure_reasons": list(reasons),
        "scene_count": scenes,
        "fidelity": {"structural": True, "geometric": True} if fidelity is None else fidelity,
    }


def build(runs, **kwargs):
    from bkt_web.benchmark_dashboard import build_dashboard

    return build_dashboard(runs, **kwargs)


class OutcomeTest(unittest.TestCase):
    def test_a_clean_verified_run_passes(self):
        dashboard = build([run("run.one")])
        self.assertEqual(dashboard.runs[0].outcome, "passed")
        self.assertEqual(dashboard.totals["pass_rate"], 1.0)

    def test_a_run_nobody_checked_is_unverified_not_a_pass(self):
        dashboard = build([run("run.one", fidelity={})])
        self.assertEqual(dashboard.runs[0].outcome, "unverified")
        self.assertEqual(dashboard.totals["passed"], 0)
        self.assertEqual(dashboard.totals["unverified"], 1)
        self.assertEqual(dashboard.totals["verified_rate"], 0.0)

    def test_a_failed_fidelity_result_outranks_a_complete_claim(self):
        dashboard = build([run("run.one", fidelity={"structural": True, "geometric": False})])
        self.assertEqual(dashboard.runs[0].outcome, "failed")

    def test_a_partial_claim_is_partial_even_when_checks_pass(self):
        self.assertEqual(build([run("run.one", claim="partial")]).runs[0].outcome, "partial")
        self.assertEqual(build([run("run.one", claim="needs-review")]).runs[0].outcome, "partial")
        self.assertEqual(build([run("run.one", claim="failed")]).runs[0].outcome, "failed")


class SliceTest(unittest.TestCase):
    def sample(self):
        return [
            run("run.a", "agriculture"),
            run("run.b", "agriculture", claim="partial"),
            run("run.c", "agriculture", fidelity={"structural": False}, reasons=["fidelity_failed:structural"]),
            run("run.d", "ui_tutorial", renderers=("screen-ui-v1",), actions=("click",)),
            run("run.e", "ui_tutorial", renderers=("screen-ui-v1",), actions=("click", "reveal")),
            run("run.f", "ui_tutorial", renderers=("screen-ui-v1",), actions=("click",),
                fidelity={"visual": False}, reasons=["fidelity_failed:visual", "source_media_reused:fallback.one:visual"]),
            run("run.g", "talking_head", renderers=("puppet-2d-v1",), actions=("speak",)),
        ]

    def test_metrics_are_sliced_by_all_four_dimensions(self):
        from bkt_web.benchmark_dashboard import DIMENSIONS

        dashboard = build(self.sample())
        self.assertEqual(set(DIMENSIONS), {"genre", "action", "renderer", "failure_reason"})
        genres = {item.key: item for item in dashboard.slices("genre")}
        self.assertEqual(set(genres), {"agriculture", "ui_tutorial", "talking_head"})
        self.assertEqual(genres["agriculture"].runs, 3)
        self.assertEqual(genres["agriculture"].passed, 1)
        self.assertEqual(genres["agriculture"].failed, 1)
        self.assertAlmostEqual(genres["agriculture"].pass_rate, 1 / 3, places=6)

        renderers = {item.key: item for item in dashboard.slices("renderer")}
        self.assertEqual(renderers["screen-ui-v1"].runs, 3)
        actions = {item.key: item for item in dashboard.slices("action")}
        self.assertEqual(actions["click"].runs, 3)
        self.assertEqual(actions["reveal"].runs, 1)
        reasons = {item.key: item for item in dashboard.slices("failure_reason")}
        self.assertEqual(reasons["fidelity_failed:visual"].runs, 1)

    def test_every_rate_comes_with_the_counts_behind_it(self):
        dashboard = build(self.sample())
        for item in dashboard.slices("genre"):
            payload = item.as_dict()
            self.assertEqual(payload["sample_size"], item.runs)
            self.assertEqual(
                payload["passed"] + payload["partial"] + payload["failed"] + payload["unverified"],
                payload["sample_size"],
            )

    def test_the_weakest_slices_are_ranked_but_only_above_the_sample_floor(self):
        dashboard = build(self.sample(), minimum_sample=3)
        weakest = dashboard.weakest("genre")
        self.assertEqual([item.key for item in weakest], ["agriculture", "ui_tutorial"])
        self.assertNotIn("talking_head", [item.key for item in weakest])
        self.assertEqual([item.key for item in dashboard.under_sampled("genre")], ["talking_head"])

    def test_the_sample_floor_is_configurable(self):
        dashboard = build(self.sample(), minimum_sample=1)
        self.assertIn("talking_head", [item.key for item in dashboard.weakest("genre", limit=10)])
        self.assertEqual(dashboard.under_sampled("genre"), ())

    def test_failure_reasons_are_ranked_by_frequency(self):
        runs = self.sample() + [
            run("run.h", "ui_tutorial", fidelity={"visual": False}, reasons=["fidelity_failed:visual"]),
        ]
        ranked = build(runs).failure_reasons()
        self.assertEqual(ranked[0]["reason"], "fidelity_failed:visual")
        self.assertEqual(ranked[0]["runs"], 2)
        self.assertAlmostEqual(ranked[0]["share"], 0.25)

    def test_fidelity_is_broken_down_by_kind(self):
        breakdown = build(self.sample()).fidelity_breakdown()
        # Five runs use the default pair plus run.c which failed structurally.
        self.assertEqual(breakdown["structural"]["runs"], 6)
        self.assertEqual(breakdown["structural"]["passed"], 5)
        self.assertAlmostEqual(breakdown["visual"]["pass_rate"], 0.0)

    def test_an_unknown_dimension_is_rejected(self):
        from bkt_web.benchmark_dashboard import BenchmarkError

        with self.assertRaisesRegex(BenchmarkError, "Chiều chưa hỗ trợ"):
            build(self.sample()).slices("vibes")


class ManifestIntegrationTest(unittest.TestCase):
    def test_a_run_can_be_built_from_a_render_manifest(self):
        import test_render_manifest as manifests
        from bkt_web.benchmark_dashboard import BenchmarkRun

        manifest = manifests.build()
        item = BenchmarkRun.from_manifest(manifest, genre="agriculture", actions=["grip", "place"])
        self.assertEqual(item.run_id, "manifest.demo")
        self.assertEqual(item.project_id, "project.demo")
        self.assertEqual(item.renderers, ("native-vector-v1",))
        self.assertEqual(item.actions, ("grip", "place"))
        self.assertEqual(item.scene_count, 2)
        self.assertEqual(item.outcome, "passed")
        self.assertEqual(item.failure_reasons, ())

    def test_a_failing_manifest_carries_its_reasons_into_the_dashboard(self):
        import test_render_manifest as manifests
        from bkt_web.benchmark_dashboard import BenchmarkRun

        manifest = manifests.build(fallbacks=[manifests.fallback("visual", approved=False)])
        item = BenchmarkRun.from_manifest(manifest, genre="agriculture")
        self.assertEqual(item.outcome, "failed")
        self.assertIn("source_media_reused:fallback.one:visual", item.failure_reasons)
        dashboard = build([item])
        self.assertEqual(dashboard.failure_reasons()[0]["runs"], 1)


class ReportTest(unittest.TestCase):
    def test_the_dashboard_is_json_serialisable(self):
        payload = build(SliceTest().sample()).as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.benchmark-dashboard/v1")
        self.assertEqual(payload["totals"]["runs"], 7)
        self.assertIn("genre", payload["slices"])

    def test_the_text_view_shows_every_dimension_and_flags_small_samples(self):
        text = build(SliceTest().sample()).as_text()
        for dimension in ("genre", "action", "renderer", "failure_reason"):
            self.assertIn(f"[{dimension}]", text)
        self.assertIn("under-sampled", text)
        self.assertIn("runs=7", text)

    def test_aggregation_is_deterministic_and_order_independent(self):
        runs = SliceTest().sample()
        first = build(runs).as_dict()
        second = build(list(reversed(runs))).as_dict()
        self.assertEqual(first, second)

    def test_building_does_not_mutate_the_input_runs(self):
        runs = SliceTest().sample()
        before = copy.deepcopy(runs)
        build(runs)
        self.assertEqual(runs, before)


class ValidationTest(unittest.TestCase):
    def test_malformed_runs_are_rejected(self):
        from bkt_web.benchmark_dashboard import BenchmarkError

        with self.assertRaisesRegex(BenchmarkError, "ít nhất một renderer"):
            build([run("run.one", renderers=())])
        with self.assertRaisesRegex(BenchmarkError, "scene_count"):
            build([run("run.one", scenes=0)])
        with self.assertRaisesRegex(BenchmarkError, "completion_claim"):
            build([run("run.one", claim="perfect")])
        with self.assertRaisesRegex(BenchmarkError, "run_id bị trùng"):
            build([run("run.one"), run("run.one")])
        with self.assertRaisesRegex(BenchmarkError, "minimum_sample"):
            build([run("run.one")], minimum_sample=0)
        with self.assertRaisesRegex(BenchmarkError, "limit phải dương"):
            build([run("run.one")]).weakest("genre", limit=0)

    def test_an_empty_dashboard_reports_zero_without_dividing_by_zero(self):
        dashboard = build([])
        self.assertEqual(dashboard.totals["runs"], 0)
        self.assertEqual(dashboard.totals["pass_rate"], 0.0)
        self.assertEqual(dashboard.slices("genre"), ())
        self.assertEqual(dashboard.failure_reasons(), ())


if __name__ == "__main__":
    unittest.main()
