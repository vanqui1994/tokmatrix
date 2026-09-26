import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
NEEDS_FFMPEG = unittest.skipUnless(HAS_FFMPEG, "cần ffmpeg và ffprobe trên PATH")
STAMP = "2026-09-21T02:00:00Z"


def motion_graphics():
    import test_renderer_adapters as adapters
    from bkt_web.renderer_adapters import get_adapter

    adapter = get_adapter("motion-graphics-v1")
    return adapter, adapter.compile(adapters.MotionGraphicsAdapterTest().payload(), canvas="9:16")


def rendered_clip(folder, *, fps=4):
    from bkt_web.frame_exporter import export_scene_to_mp4

    adapter, compiled = motion_graphics()
    output = Path(folder) / "scene.mp4"
    export_scene_to_mp4(adapter, compiled, output, fps=fps)
    return output


def flat_clip(folder, *, seconds=2.0, name="flat.mp4"):
    output = Path(folder) / name
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
         "-i", f"color=c=black:s=64x48:r=10:d={seconds}", "-pix_fmt", "yuv420p", str(output)],
        check=True, capture_output=True,
    )
    return output


def migrated_storyboard():
    from bkt_web.remake_vector import examples
    from bkt_web.storyboard_migration import migrate_v1_to_v2

    return migrate_v1_to_v2(examples()[0], source_sha256="a" * 64)


class EmptyCheckTest(unittest.TestCase):
    """Phép kiểm không xem xét gì thì không được tính là đạt."""

    def test_geometric_evidence_on_a_v1_storyboard_is_not_applicable(self):
        from bkt_web.render_evidence import geometric_evidence

        outcome = geometric_evidence(migrated_storyboard())
        self.assertFalse(outcome.applicable)
        self.assertFalse(outcome.passed)
        self.assertIn("không component nào khai bounds", outcome.detail)

    def test_an_inapplicable_check_refuses_to_become_a_fidelity_result(self):
        from bkt_web.render_evidence import RenderEvidenceError, geometric_evidence

        with self.assertRaisesRegex(RenderEvidenceError, "không xem xét gì"):
            geometric_evidence(migrated_storyboard()).as_fidelity_result()

    def test_comparing_a_storyboard_with_itself_proves_nothing(self):
        from bkt_web.render_evidence import structural_evidence

        storyboard = migrated_storyboard()
        outcome = structural_evidence(storyboard, json.loads(json.dumps(storyboard)))
        self.assertFalse(outcome.applicable)
        self.assertIn("không chứng minh được gì", outcome.detail)

    def test_a_real_comparison_is_applicable(self):
        import test_fidelity_structural as structural
        from bkt_web.render_evidence import structural_evidence

        reference = structural.reference_project()
        candidate = structural.reference_project()
        del candidate["scenes"][1]["audio_events"][1]
        outcome = structural_evidence(reference, candidate)
        self.assertTrue(outcome.applicable)
        self.assertFalse(outcome.passed)
        self.assertTrue(any(item.code == "DIALOGUE_MISSING" for item in outcome.findings))

    def test_two_equal_lifecycle_snapshots_can_be_checked(self):
        from bkt_web.render_evidence import structural_evidence

        reference = migrated_storyboard()
        candidate = json.loads(json.dumps(reference))
        outcome = structural_evidence(reference, candidate, allow_equal_snapshots=True)
        self.assertTrue(outcome.applicable)
        self.assertTrue(outcome.passed)

    def test_a_geometric_check_with_real_bounds_is_applicable(self):
        import test_fidelity_geometric as geometric
        from bkt_web.render_evidence import geometric_evidence

        document = geometric.clean_scene()
        outcome = geometric_evidence(document)
        self.assertTrue(outcome.applicable)
        self.assertTrue(outcome.passed)
        self.assertGreater(outcome.metrics["components_with_bounds"], 0)

    def test_actual_renderer_must_match_the_render_plan(self):
        from bkt_web.render_evidence import renderer_plan_evidence

        storyboard = migrated_storyboard()
        self.assertTrue(renderer_plan_evidence(storyboard, "native-vector-v1").passed)
        mismatch = renderer_plan_evidence(storyboard, "vision-sprite")
        self.assertFalse(mismatch.passed)
        self.assertEqual(mismatch.findings[0].code, "RENDERER_PLAN_MISMATCH")


@NEEDS_FFMPEG
class OutputVideoTest(unittest.TestCase):
    def test_a_real_render_passes_every_output_check(self):
        from bkt_web.render_evidence import verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            clip = rendered_clip(folder)
            outcome = verify_output_video(clip, expected_duration=6.0)
        self.assertTrue(outcome.applicable)
        self.assertTrue(outcome.passed, [item.code for item in outcome.findings])
        self.assertAlmostEqual(outcome.metrics["duration_seconds"], 6.0, delta=0.5)
        self.assertLess(outcome.metrics["lowest_adjacent_ssim"], 0.999)

    def test_a_missing_or_tiny_output_fails(self):
        from bkt_web.render_evidence import verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            missing = verify_output_video(Path(folder) / "nope.mp4", expected_duration=2.0)
            self.assertEqual([item.code for item in missing.findings], ["OUTPUT_MISSING"])

            stub = Path(folder) / "stub.mp4"
            stub.write_bytes(b"\x00" * 100)
            tiny = verify_output_video(stub, expected_duration=2.0)
            self.assertEqual([item.code for item in tiny.findings], ["OUTPUT_TOO_SMALL"])
            self.assertFalse(tiny.passed)

    def test_handing_back_the_source_file_is_caught(self):
        from bkt_web.render_evidence import verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            source = flat_clip(folder, name="source.mp4")
            copy = Path(folder) / "output.mp4"
            copy.write_bytes(source.read_bytes())
            outcome = verify_output_video(copy, expected_duration=2.0, source_path=source)
        self.assertIn("OUTPUT_IS_SOURCE_COPY", [item.code for item in outcome.findings])
        self.assertFalse(outcome.passed)

    def test_a_frozen_or_blank_render_is_caught(self):
        from bkt_web.render_evidence import verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            clip = flat_clip(folder, seconds=2.0)
            outcome = verify_output_video(clip, expected_duration=2.0)
        codes = [item.code for item in outcome.findings]
        self.assertIn("OUTPUT_FROZEN", codes)
        self.assertIn("OUTPUT_BLANK", codes)
        self.assertFalse(outcome.passed)

    def test_a_wrong_length_render_is_caught(self):
        from bkt_web.render_evidence import verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            clip = rendered_clip(folder)
            outcome = verify_output_video(clip, expected_duration=30.0)
        self.assertIn("DURATION_MISMATCH", [item.code for item in outcome.findings])
        self.assertAlmostEqual(outcome.metrics["duration_drift_seconds"], 24.0, delta=0.5)

    def test_a_partial_sample_is_visible_rather_than_silent(self):
        from bkt_web.render_evidence import verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            clip = rendered_clip(folder)
            outcome = verify_output_video(clip, expected_duration=6.0)
        self.assertIn("frames_requested", outcome.metrics)
        self.assertIn("frames_sampled", outcome.metrics)
        if outcome.metrics["frames_sampled"] < outcome.metrics["frames_requested"]:
            self.assertIn("SAMPLES_INCOMPLETE", [item.code for item in outcome.findings])

    def test_too_few_samples_is_refused(self):
        from bkt_web.render_evidence import RenderEvidenceError, verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            clip = rendered_clip(folder)
            with self.assertRaisesRegex(RenderEvidenceError, "ít nhất hai mẫu"):
                verify_output_video(clip, expected_duration=6.0, samples=1)


@NEEDS_FFMPEG
class ManifestTest(unittest.TestCase):
    def evidence(self, folder, *, extra_outcomes=()):
        from bkt_web.render_evidence import (
            build_project_evidence,
            geometric_evidence,
            verify_output_video,
        )
        from bkt_web.render_manifest import RendererRecord

        clip = rendered_clip(folder)
        storyboard = migrated_storyboard()
        outcomes = [
            verify_output_video(clip, expected_duration=6.0),
            geometric_evidence(storyboard),
            *extra_outcomes,
        ]
        return build_project_evidence(
            manifest_id="manifest.test",
            created_at=STAMP,
            storyboard=storyboard,
            renderers=[RendererRecord("native-vector-v1", "1.0.0", tuple(
                item["scene_id"] for item in storyboard["scenes"]
            ))],
            outcomes=outcomes,
        )

    def test_a_good_render_with_one_real_check_claims_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            evidence = self.evidence(folder)
        self.assertEqual(evidence.completion_claim, "complete")
        self.assertTrue(evidence.complete)

    def test_the_inapplicable_check_is_recorded_as_a_warning_not_a_pass(self):
        with tempfile.TemporaryDirectory() as folder:
            evidence = self.evidence(folder)
        kinds = [item["kind"] for item in evidence.manifest["fidelity"]]
        self.assertEqual(kinds, ["visual"], "chỉ phép kiểm thật mới vào fidelity")
        self.assertEqual([item["kind"] for item in evidence.not_applicable], ["geometric"])
        self.assertTrue(any(
            item["code"] == "FIDELITY_NOT_APPLICABLE" for item in evidence.manifest["warnings"]
        ))

    def test_a_failing_check_stops_the_complete_claim(self):
        from bkt_web.render_evidence import verify_output_video

        with tempfile.TemporaryDirectory() as folder:
            bad = verify_output_video(flat_clip(folder), expected_duration=2.0)
            evidence = self.evidence(folder, extra_outcomes=[bad])
        self.assertNotEqual(evidence.completion_claim, "complete")
        self.assertFalse(evidence.complete)

    def test_the_manifest_is_written_validated_and_read_back(self):
        from bkt_web.render_evidence import load_manifest, write_manifest

        with tempfile.TemporaryDirectory() as folder:
            evidence = self.evidence(folder)
            path = write_manifest(folder, evidence)
            self.assertTrue(path.is_file())
            payload = load_manifest(folder)
        self.assertEqual(payload["manifest"]["completion_claim"], "complete")
        self.assertEqual(payload["schema"], "tokmatrix.render-evidence/v1")
        self.assertEqual(json.loads(json.dumps(payload)), payload)

    def test_storyboard_assets_and_fallbacks_are_recorded(self):
        from bkt_web.render_evidence import asset_records_from_storyboard, fallback_records_from_storyboard

        storyboard = migrated_storyboard()
        assets = asset_records_from_storyboard(storyboard)
        self.assertTrue(assets)
        self.assertTrue(all(item.checksum.startswith("sha256:") for item in assets))

        scene_id = storyboard["scenes"][0]["scene_id"]
        storyboard["render_plan"]["fallbacks"] = [{
            "fallback_id": "fallback.test", "scene_id": scene_id,
            "type": "needs-review", "reason_code": "CAPABILITY_MISSING",
            "disclosure": "Cần người duyệt", "source_media_usage": "none",
            "approval_required": True, "affected_requirement_ids": [],
        }]
        fallbacks = fallback_records_from_storyboard(storyboard)
        self.assertEqual(fallbacks[0].fallback_id, "fallback.test")
        self.assertFalse(fallbacks[0].approved)

    def test_a_tampered_manifest_is_refused_on_read(self):
        from bkt_web.render_evidence import load_manifest, write_manifest
        from bkt_web.render_manifest import RenderManifestError

        with tempfile.TemporaryDirectory() as folder:
            evidence = self.evidence(folder)
            path = write_manifest(folder, evidence)
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["manifest"]["fidelity"][0]["passed"] = False
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RenderManifestError, "fidelity thất bại"):
                load_manifest(folder)

    def test_a_missing_manifest_is_reported(self):
        from bkt_web.render_evidence import RenderEvidenceError, load_manifest

        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RenderEvidenceError, "Không có manifest"):
                load_manifest(folder)


class PipelineWiringTest(unittest.TestCase):
    """`attach_render_evidence` gắn vào project mà không phá bản dựng."""

    def pipeline(self, folder):
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_pipeline import RemakePipeline

        pipeline = RemakePipeline(str(Path(folder) / "source.mp4"), "evidence-test", log_callback=lambda *_: None)
        pipeline.metadata = {"sha256": "b" * 64, "duration": 12}
        return pipeline_module, pipeline

    def test_a_project_without_a_video_is_marked_not_rendered(self):
        from bkt_web import remake_pipeline as pipeline_module

        with tempfile.TemporaryDirectory() as folder, \
                patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(folder)):
            _module, pipeline = self.pipeline(folder)
            result = pipeline.attach_render_evidence({}, {})
        self.assertEqual(result["manifest_status"], "not_rendered")
        self.assertNotIn("manifest_url", result)

    @NEEDS_FFMPEG
    def test_a_rendered_project_gets_a_manifest_and_a_claim(self):
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_vector import examples

        with tempfile.TemporaryDirectory() as folder, \
                patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(folder)):
            _module, pipeline = self.pipeline(folder)
            clip = rendered_clip(folder)
            story = examples()[0]
            pipeline.metadata["duration"] = story["duration"]
            result = pipeline.attach_render_evidence({"preview_path": str(clip)}, story)
            payload = json.loads((Path(folder) / "evidence-test" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(result["manifest_status"], "written")
        self.assertIn("manifest_url", result)
        self.assertIn(result["completion_claim"], {"complete", "partial", "needs-review", "failed"})
        self.assertIn("structural", [item["kind"] for item in payload["manifest"]["fidelity"]])
        self.assertTrue(payload["manifest"]["assets"])

    @NEEDS_FFMPEG
    def test_a_render_that_fails_its_checks_loses_the_complete_badge(self):
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_vector import examples

        with tempfile.TemporaryDirectory() as folder, \
                patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(folder)):
            _module, pipeline = self.pipeline(folder)
            frozen = flat_clip(folder)
            story = examples()[0]
            pipeline.metadata["duration"] = 2.0
            result = pipeline.attach_render_evidence(
                {"preview_path": str(frozen), "fidelity": "ok", "badge": "HOÀN CHỈNH"}, story,
            )
        self.assertNotEqual(result["completion_claim"], "complete")
        self.assertEqual(result["fidelity"], "needs_review")
        self.assertIn("CHƯA ĐỦ BẰNG CHỨNG", result["badge"])

    def test_a_broken_evidence_step_never_deletes_the_render(self):
        from bkt_web import remake_pipeline as pipeline_module

        with tempfile.TemporaryDirectory() as folder, \
                patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(folder)):
            _module, pipeline = self.pipeline(folder)
            clip = Path(folder) / "video.mp4"
            clip.write_bytes(b"x" * 5000)
            with patch("bkt_web.render_evidence.verify_output_video", side_effect=RuntimeError("hỏng")):
                result = pipeline.attach_render_evidence(
                    {"preview_path": str(clip), "preview_url": "/static/x.mp4"}, {},
                )
        self.assertEqual(result["manifest_status"], "failed")
        self.assertEqual(result["completion_claim"], "needs-review")
        self.assertEqual(result["preview_url"], "/static/x.mp4", "bản dựng không được xoá")


class ManifestApiTest(unittest.TestCase):
    def test_api_reads_a_validated_project_manifest(self):
        from bkt_web import remake_routes
        from bkt_web.render_evidence import CheckOutcome, build_project_evidence, write_manifest
        from bkt_web.render_manifest import RendererRecord

        storyboard = migrated_storyboard()
        evidence = build_project_evidence(
            manifest_id="manifest.api-test", created_at=STAMP, storyboard=storyboard,
            renderers=[RendererRecord("native-vector-v1", "1.5.0", tuple(
                item["scene_id"] for item in storyboard["scenes"]
            ))],
            outcomes=[CheckOutcome("custom", True, True, detail="api fixture")],
        )
        with tempfile.TemporaryDirectory() as folder, patch.object(remake_routes, "STATIC_DIR", Path(folder)):
            write_manifest(Path(folder) / "remake_projects" / "api-test", evidence)
            payload = remake_routes.get_remake_project_manifest("api-test")
        self.assertEqual(payload["manifest"]["completion_claim"], "complete")

    def test_api_rejects_path_traversal(self):
        from fastapi import HTTPException
        from bkt_web.remake_routes import get_remake_project_manifest

        with self.assertRaises(HTTPException) as raised:
            get_remake_project_manifest("../outside")
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
