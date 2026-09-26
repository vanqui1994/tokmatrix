import copy
import json
import unittest


def observation(gap_id, run_id, *, kind="action", severity="blocked", genre="agriculture", detail=None):
    return {
        "gap_id": gap_id,
        "kind": kind,
        "run_id": run_id,
        "severity": severity,
        "genre": genre,
        "detail": detail,
    }


def cost(gap_id, level, estimated_by="platform.team"):
    return {"gap_id": gap_id, "level": level, "estimated_by": estimated_by}


def prioritise(observations, total_runs=10, **kwargs):
    from bkt_web.capability_gaps import prioritise_gaps

    return prioritise_gaps(observations, total_runs=total_runs, **kwargs)


class RankingTest(unittest.TestCase):
    def sample(self):
        return [
            observation("action:pour", "run.a"),
            observation("action:pour", "run.b"),
            observation("action:pour", "run.c"),
            observation("renderer:puppet-2d", "run.d", kind="renderer"),
            observation("renderer:puppet-2d", "run.e", kind="renderer", severity="degraded"),
            observation("asset:papaya", "run.f", kind="asset", severity="cosmetic"),
            observation("asset:papaya", "run.g", kind="asset", severity="cosmetic"),
        ]

    def test_a_frequent_blocking_gap_outranks_a_rare_cosmetic_one(self):
        report = prioritise(self.sample())
        order = [item.gap_id for item in report.ranked]
        self.assertEqual(order[0], "action:pour")
        self.assertLess(order.index("action:pour"), order.index("asset:papaya"))

    def test_every_gap_shows_the_three_components_behind_its_score(self):
        report = prioritise(self.sample())
        top = report.ranked[0]
        self.assertAlmostEqual(top.frequency_score, 0.3)
        self.assertAlmostEqual(top.fidelity_impact_score, 1.0)
        self.assertEqual(top.runs_seen, 3)
        self.assertEqual(top.runs_blocked, 3)
        self.assertAlmostEqual(
            top.score,
            0.45 * top.frequency_score + 0.40 * top.fidelity_impact_score + 0.15 * top.cost_score,
            places=6,
        )

    def test_a_cheap_fix_is_promoted_over_an_equally_common_expensive_one(self):
        observations = [
            observation("action:pour", "run.a"),
            observation("action:pour", "run.b"),
            observation("action:spray", "run.a"),
            observation("action:spray", "run.b"),
        ]
        report = prioritise(observations, costs=[cost("action:pour", "large"), cost("action:spray", "small")])
        self.assertEqual([item.gap_id for item in report.ranked], ["action:spray", "action:pour"])

    def test_severity_changes_the_impact_component(self):
        blocking = prioritise([observation("action:pour", "run.a"), observation("action:pour", "run.b")])
        cosmetic = prioritise([
            observation("action:pour", "run.a", severity="cosmetic"),
            observation("action:pour", "run.b", severity="cosmetic"),
        ])
        self.assertGreater(blocking.ranked[0].fidelity_impact_score, cosmetic.ranked[0].fidelity_impact_score)
        self.assertGreater(blocking.ranked[0].score, cosmetic.ranked[0].score)

    def test_weights_can_be_retuned_and_must_sum_to_one(self):
        from bkt_web.capability_gaps import CapabilityGapError, Weights

        report = prioritise(self.sample(), weights=Weights(frequency=0.8, fidelity_impact=0.1, cost=0.1))
        self.assertEqual(report.weights.frequency, 0.8)
        with self.assertRaisesRegex(CapabilityGapError, "cộng lại bằng 1"):
            Weights(frequency=0.9, fidelity_impact=0.9, cost=0.9)

    def test_the_genres_and_details_a_gap_came_from_are_kept(self):
        report = prioritise([
            observation("action:pour", "run.a", genre="agriculture", detail="no pour runtime"),
            observation("action:pour", "run.b", genre="product", detail="no pour runtime"),
        ])
        top = report.ranked[0]
        self.assertEqual(top.genres, ("agriculture", "product"))
        self.assertEqual(top.details, ("no pour runtime",))


class HonestyTest(unittest.TestCase):
    def test_a_gap_without_a_cost_estimate_is_flagged_not_assumed_cheap(self):
        report = prioritise([observation("action:pour", "run.a"), observation("action:pour", "run.b")])
        top = report.ranked[0]
        self.assertFalse(top.cost_estimated)
        self.assertEqual(top.cost_level, "unknown")
        self.assertEqual(report.unestimated, ("action:pour",))
        # Unknown sits between medium and large, never at "small".
        self.assertLess(top.cost_score, 1.0 - 0.2)

    def test_an_estimated_gap_is_not_flagged(self):
        report = prioritise(
            [observation("action:pour", "run.a"), observation("action:pour", "run.b")],
            costs=[cost("action:pour", "medium")],
        )
        self.assertTrue(report.ranked[0].cost_estimated)
        self.assertEqual(report.unestimated, ())

    def test_a_gap_seen_once_is_emerging_not_ranked(self):
        report = prioritise([
            observation("action:pour", "run.a"),
            observation("action:pour", "run.b"),
            observation("action:fold", "run.c"),
        ], minimum_sample=2)
        self.assertEqual([item.gap_id for item in report.ranked], ["action:pour"])
        self.assertEqual([item.gap_id for item in report.emerging], ["action:fold"])

    def test_the_sample_floor_is_configurable(self):
        observations = [observation("action:fold", "run.c")]
        self.assertEqual(len(prioritise(observations, minimum_sample=1).ranked), 1)
        self.assertEqual(len(prioritise(observations, minimum_sample=5).ranked), 0)

    def test_frequency_is_measured_against_all_runs_not_just_failures(self):
        observations = [observation("action:pour", f"run.{index}") for index in range(4)]
        few = prioritise(observations, total_runs=4).ranked[0]
        many = prioritise(observations, total_runs=100).ranked[0]
        self.assertAlmostEqual(few.frequency_score, 1.0)
        self.assertAlmostEqual(many.frequency_score, 0.04)
        self.assertGreater(few.score, many.score)

    def test_repeat_observations_in_one_run_do_not_inflate_frequency(self):
        report = prioritise([
            observation("action:pour", "run.a"),
            observation("action:pour", "run.a"),
            observation("action:pour", "run.a"),
        ], minimum_sample=1)
        self.assertEqual(report.ranked[0].runs_seen, 1)
        self.assertAlmostEqual(report.ranked[0].frequency_score, 0.1)


class DashboardIntegrationTest(unittest.TestCase):
    def dashboard(self):
        import test_benchmark_dashboard as benchmarks

        return benchmarks.build(benchmarks.SliceTest().sample())

    def test_gaps_can_be_read_from_a_dashboard(self):
        from bkt_web.capability_gaps import gaps_from_dashboard

        observations = gaps_from_dashboard(self.dashboard())
        identifiers = {item.gap_id for item in observations}
        self.assertIn("fidelity_failed:structural", identifiers)
        self.assertIn("source_media_reused:fallback.one", identifiers)
        self.assertTrue(all(item.kind == "other" for item in observations))

    def test_a_reason_prefix_can_be_mapped_onto_a_gap_kind(self):
        from bkt_web.capability_gaps import gaps_from_dashboard

        observations = gaps_from_dashboard(self.dashboard(), kind_of={"fidelity_failed": "analysis"})
        kinds = {item.gap_id: item.kind for item in observations}
        self.assertEqual(kinds["fidelity_failed:structural"], "analysis")
        self.assertEqual(kinds["source_media_reused:fallback.one"], "other")

    def test_dashboard_gaps_flow_straight_into_the_ranking(self):
        from bkt_web.capability_gaps import gaps_from_dashboard, prioritise_gaps

        dashboard = self.dashboard()
        observations = gaps_from_dashboard(dashboard)
        report = prioritise_gaps(observations, total_runs=dashboard.totals["runs"], minimum_sample=1)
        self.assertTrue(report.ranked)
        self.assertLessEqual(report.ranked[0].frequency_score, 1.0)

    def test_a_dashboard_without_runs_is_rejected(self):
        from bkt_web.capability_gaps import CapabilityGapError, gaps_from_dashboard

        with self.assertRaisesRegex(CapabilityGapError, r"cần có \.runs"):
            gaps_from_dashboard(object())


class ReportTest(unittest.TestCase):
    def test_the_report_is_json_serialisable(self):
        payload = prioritise(RankingTest().sample()).as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.capability-gaps/v1")
        self.assertEqual(payload["total_runs"], 10)

    def test_the_text_view_shows_the_ranking_and_flags_missing_estimates(self):
        text = prioritise(RankingTest().sample()).as_text()
        self.assertIn("action:pour", text)
        self.assertIn("cost not estimated", text)
        self.assertIn("runs=10", text)

    def test_the_top_slice_is_bounded(self):
        from bkt_web.capability_gaps import CapabilityGapError

        report = prioritise(RankingTest().sample())
        self.assertEqual(len(report.top(2)), 2)
        with self.assertRaisesRegex(CapabilityGapError, "limit phải dương"):
            report.top(0)

    def test_ranking_is_deterministic_and_does_not_mutate_its_input(self):
        observations = RankingTest().sample()
        before = copy.deepcopy(observations)
        first = prioritise(observations).as_dict()
        second = prioritise(list(reversed(observations))).as_dict()
        self.assertEqual(first, second)
        self.assertEqual(observations, before)


class ValidationTest(unittest.TestCase):
    def test_malformed_observations_are_rejected(self):
        from bkt_web.capability_gaps import CapabilityGapError

        with self.assertRaisesRegex(CapabilityGapError, "kind chưa hỗ trợ"):
            prioritise([observation("gap.one", "run.a", kind="vibes")])
        with self.assertRaisesRegex(CapabilityGapError, "severity chưa hỗ trợ"):
            prioritise([observation("gap.one", "run.a", severity="annoying")])
        with self.assertRaisesRegex(CapabilityGapError, "total_runs phải dương"):
            prioritise([observation("gap.one", "run.a")], total_runs=0)
        with self.assertRaisesRegex(CapabilityGapError, "lớn hơn total_runs"):
            prioritise([observation("gap.one", "run.a"), observation("gap.one", "run.b")], total_runs=1)
        with self.assertRaisesRegex(CapabilityGapError, "hai kind khác nhau"):
            prioritise([observation("gap.one", "run.a"), observation("gap.one", "run.b", kind="asset")])
        with self.assertRaisesRegex(CapabilityGapError, "cost level chưa hỗ trợ"):
            prioritise([observation("gap.one", "run.a")], costs=[cost("gap.one", "cheap")])

    def test_the_cost_scale_covers_unknown_explicitly(self):
        from bkt_web.capability_gaps import COST_LEVELS

        self.assertEqual(set(COST_LEVELS), {"small", "medium", "large", "unknown"})
        self.assertGreater(COST_LEVELS["unknown"], COST_LEVELS["medium"])
        self.assertLess(COST_LEVELS["unknown"], COST_LEVELS["large"])


if __name__ == "__main__":
    unittest.main()
