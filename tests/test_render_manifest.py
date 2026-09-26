import copy
import json
import unittest


STAMP = "2026-09-21T02:00:00Z"


def storyboard(scene_ids=("scene.one", "scene.two")):
    return {
        "schema_version": "2.0.0",
        "project_id": "project.demo",
        "source": {"source_id": "source.demo", "sha256": "a" * 64, "media_type": "video/mp4"},
        "duration_seconds": 6.0,
        "scenes": [{"scene_id": scene_id} for scene_id in scene_ids],
    }


def renderer(scene_ids=("scene.one", "scene.two"), renderer_id="native-vector-v1", version="1.4.0"):
    return {"renderer_id": renderer_id, "version": version, "scene_ids": list(scene_ids)}


def asset(asset_id="asset.tomato", checksum=None):
    return {
        "asset_id": asset_id,
        "version": "1.0.0",
        "checksum": checksum or "b" * 64,
        "provenance_kind": "built-in",
    }


def fidelity(kind="structural", passed=True, failures=0):
    return {"kind": kind, "passed": passed, "failure_count": failures, "warning_count": 0}


def fallback(source_media_usage="none", approved=False, fallback_id="fallback.one"):
    return {
        "fallback_id": fallback_id,
        "scene_id": "scene.two",
        "type": "source_composite" if source_media_usage != "none" else "simplify",
        "reason_code": "MISSING_RIG",
        "disclosure": "The plant rig is unavailable, so the shot was simplified.",
        "source_media_usage": source_media_usage,
        "approved": approved,
    }


def build(**overrides):
    from bkt_web.render_manifest import build_manifest

    values = {
        "manifest_id": "manifest.demo",
        "created_at": STAMP,
        "storyboard": storyboard(),
        "renderers": [renderer()],
        "assets": [asset()],
        "fidelity": [fidelity()],
    }
    values.update(overrides)
    return build_manifest(**values)


class ContentTest(unittest.TestCase):
    def test_the_manifest_carries_every_part_the_plan_lists(self):
        manifest = build(
            fallbacks=[fallback()],
            warnings=[{"code": "SLOW_RENDER", "message": "The last scene took unusually long.", "scene_id": "scene.two"}],
        )
        payload = manifest.as_dict()
        self.assertEqual(payload["source"]["sha256"], "a" * 64)
        self.assertEqual(payload["storyboard"]["schema_version"], "2.0.0")
        self.assertTrue(payload["storyboard"]["hash"].startswith("sha256:"))
        self.assertEqual([item["renderer_id"] for item in payload["renderers"]], ["native-vector-v1"])
        self.assertTrue(payload["assets"][0]["checksum"].startswith("sha256:"))
        self.assertEqual([item["fallback_id"] for item in payload["fallbacks"]], ["fallback.one"])
        self.assertEqual([item["code"] for item in payload["warnings"]], ["SLOW_RENDER"])
        self.assertEqual([item["kind"] for item in payload["fidelity"]], ["structural"])

    def test_the_manifest_is_json_serialisable_and_hashable(self):
        manifest = build()
        payload = manifest.as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.render-manifest/v1")
        self.assertTrue(manifest.digest().startswith("sha256:"))
        self.assertEqual(manifest.digest(), build().digest())

    def test_the_storyboard_hash_tracks_the_storyboard(self):
        first = build().storyboard_hash
        changed = storyboard()
        changed["duration_seconds"] = 7.0
        self.assertNotEqual(first, build(storyboard=changed).storyboard_hash)

    def test_building_does_not_mutate_its_inputs(self):
        document = storyboard()
        before = copy.deepcopy(document)
        build(storyboard=document)
        self.assertEqual(document, before)


class CompletionClaimTest(unittest.TestCase):
    def test_a_clean_render_claims_complete(self):
        manifest = build()
        self.assertEqual(manifest.completion_claim, "complete")
        self.assertTrue(manifest.passed)
        self.assertEqual(manifest.claim_reasons, ("all_scenes_rendered_and_every_fidelity_check_passed",))

    def test_a_failed_fidelity_result_cannot_claim_complete(self):
        manifest = build(fidelity=[fidelity(), fidelity("geometric", passed=False, failures=3)])
        self.assertEqual(manifest.completion_claim, "failed")
        self.assertIn("fidelity_failed:geometric", manifest.claim_reasons)

    def test_a_render_without_any_fidelity_result_needs_review(self):
        manifest = build(fidelity=[])
        self.assertEqual(manifest.completion_claim, "needs-review")
        self.assertIn("no_fidelity_result_recorded", manifest.claim_reasons)

    def test_a_scene_nobody_rendered_fails(self):
        manifest = build(renderers=[renderer(["scene.one"])])
        self.assertEqual(manifest.completion_claim, "failed")
        self.assertIn("scenes_without_a_renderer:scene.two", manifest.claim_reasons)

    def test_an_ordinary_fallback_downgrades_to_partial(self):
        manifest = build(fallbacks=[fallback()])
        self.assertEqual(manifest.completion_claim, "partial")
        self.assertIn("fallback_taken:fallback.one", manifest.claim_reasons)

    def test_reusing_source_media_without_approval_fails(self):
        manifest = build(fallbacks=[fallback("visual_and_audio", approved=False)])
        self.assertEqual(manifest.completion_claim, "failed")
        self.assertIn("source_media_reused:fallback.one:visual_and_audio", manifest.claim_reasons)

    def test_approved_source_reuse_is_partial_never_complete(self):
        manifest = build(fallbacks=[fallback("visual", approved=True)])
        self.assertEqual(manifest.completion_claim, "partial")
        self.assertIn("source_media_reused:fallback.one:visual", manifest.claim_reasons)

    def test_a_claim_the_evidence_does_not_support_is_rejected(self):
        from bkt_web.render_manifest import RenderManifestError

        with self.assertRaisesRegex(RenderManifestError, "không được bằng chứng ủng hộ"):
            build(fidelity=[fidelity("structural", passed=False, failures=1)], claimed="complete")
        with self.assertRaisesRegex(RenderManifestError, "không được bằng chứng ủng hộ"):
            build(fallbacks=[fallback("audio", approved=True)], claimed="complete")
        # A claim that matches the evidence is accepted.
        self.assertEqual(build(claimed="complete").completion_claim, "complete")


class FidelityFoldingTest(unittest.TestCase):
    def test_a_structural_report_folds_into_the_manifest(self):
        from bkt_web.render_manifest import FidelityResult

        class FakeReport:
            def __init__(self):
                self.failures = ()
                self.warnings = ("one",)

            def as_dict(self):
                return {
                    "candidate_project_id": "project.demo",
                    "metrics": {"entity_coverage": 1.0, "action_coverage": 0.95},
                    "findings": [{"severity": "warn"}],
                }

        result = FidelityResult.from_report("structural", FakeReport())
        self.assertTrue(result.passed)
        self.assertEqual(result.failure_count, 0)
        self.assertEqual(result.warning_count, 1)
        self.assertEqual(result.scope, "project.demo")
        self.assertEqual(result.metrics["action_coverage"], 0.95)
        self.assertTrue(result.report_hash.startswith("sha256:"))

    def test_a_plain_dict_report_is_counted_by_severity(self):
        from bkt_web.render_manifest import FidelityResult

        result = FidelityResult.from_report("geometric", {
            "scene_id": "scene.one",
            "findings": [{"severity": "fail"}, {"severity": "fail"}, {"severity": "warn"}],
        })
        self.assertFalse(result.passed)
        self.assertEqual((result.failure_count, result.warning_count), (2, 1))
        self.assertEqual(result.scope, "scene.one")

    def test_a_real_structural_report_can_be_folded(self):
        import test_fidelity_structural as structural
        from bkt_web.fidelity_structural import check_structural_fidelity
        from bkt_web.render_manifest import FidelityResult

        reference = structural.reference_project()
        report = check_structural_fidelity(reference, copy.deepcopy(reference))
        result = FidelityResult.from_report("structural", report)
        self.assertTrue(result.passed)
        manifest = build(fidelity=[result])
        self.assertEqual(manifest.completion_claim, "complete")

    def test_a_result_that_contradicts_itself_is_rejected(self):
        from bkt_web.render_manifest import FidelityResult, RenderManifestError

        with self.assertRaisesRegex(RenderManifestError, "passed phải khớp"):
            FidelityResult(kind="structural", passed=True, failure_count=2)
        with self.assertRaisesRegex(RenderManifestError, "kind không hợp lệ"):
            FidelityResult(kind="vibes", passed=True, failure_count=0)


class ValidationTest(unittest.TestCase):
    def test_a_built_manifest_validates(self):
        from bkt_web.render_manifest import validate_manifest

        validate_manifest(build().as_dict())

    def test_a_forged_complete_claim_is_caught_by_validation(self):
        from bkt_web.render_manifest import RenderManifestError, validate_manifest

        payload = build(fallbacks=[fallback("visual", approved=True)]).as_dict()
        payload["completion_claim"] = "complete"
        with self.assertRaisesRegex(RenderManifestError, "dùng lại media nguồn"):
            validate_manifest(payload)

        payload = build().as_dict()
        payload["fidelity"] = []
        payload["completion_claim"] = "complete"
        with self.assertRaisesRegex(RenderManifestError, "chưa chạy fidelity"):
            validate_manifest(payload)

        payload = build().as_dict()
        payload["fidelity"][0]["passed"] = False
        with self.assertRaisesRegex(RenderManifestError, "fidelity thất bại"):
            validate_manifest(payload)

    def test_malformed_parts_are_rejected(self):
        from bkt_web.render_manifest import RenderManifestError

        with self.assertRaisesRegex(RenderManifestError, "SHA-256"):
            build(storyboard={**storyboard(), "source": {"source_id": "s", "sha256": "nope", "media_type": "video/mp4"}})
        with self.assertRaisesRegex(RenderManifestError, "semantic version"):
            build(renderers=[{**renderer(), "version": "one"}])
        with self.assertRaisesRegex(RenderManifestError, "UPPER_SNAKE_CASE"):
            build(fallbacks=[{**fallback(), "reason_code": "lower case"}])
        with self.assertRaisesRegex(RenderManifestError, "timezone"):
            build(created_at="2026-09-21T02:00:00")
        with self.assertRaisesRegex(RenderManifestError, "ít nhất một renderer"):
            build(renderers=[])
        with self.assertRaisesRegex(RenderManifestError, "scene không tồn tại"):
            build(renderers=[renderer(["scene.ghost"])])
        with self.assertRaisesRegex(RenderManifestError, "asset_id bị trùng"):
            build(assets=[asset(), asset()])
        with self.assertRaisesRegex(RenderManifestError, "schema không được hỗ trợ"):
            from bkt_web.render_manifest import validate_manifest

            validate_manifest({"schema": "other/v1"})


class DiffTest(unittest.TestCase):
    def test_two_renders_can_be_compared(self):
        from bkt_web.render_manifest import diff_manifests

        earlier = build().as_dict()
        later = build(
            assets=[asset(checksum="c" * 64), asset("asset.basket")],
            fidelity=[fidelity("structural", passed=False, failures=1)],
            fallbacks=[fallback()],
        ).as_dict()
        difference = diff_manifests(earlier, later)
        self.assertFalse(difference["source_changed"])
        self.assertFalse(difference["storyboard_changed"])
        self.assertEqual(difference["completion_claim"], ["complete", "failed"])
        self.assertEqual(difference["assets_added"], ["asset.basket"])
        self.assertEqual(difference["assets_changed"], ["asset.tomato"])
        self.assertEqual(difference["fallbacks_added"], ["fallback.one"])
        self.assertEqual(difference["fidelity_regressed"], ["structural"])

    def test_a_changed_source_is_visible(self):
        from bkt_web.render_manifest import diff_manifests

        changed = storyboard()
        changed["source"]["sha256"] = "d" * 64
        difference = diff_manifests(build().as_dict(), build(storyboard=changed).as_dict())
        self.assertTrue(difference["source_changed"])
        self.assertTrue(difference["storyboard_changed"])

    def test_diffing_two_projects_is_rejected(self):
        from bkt_web.render_manifest import RenderManifestError, diff_manifests

        other = storyboard()
        other["project_id"] = "project.other"
        with self.assertRaisesRegex(RenderManifestError, "hai project khác nhau"):
            diff_manifests(build().as_dict(), build(storyboard=other).as_dict())


if __name__ == "__main__":
    unittest.main()
