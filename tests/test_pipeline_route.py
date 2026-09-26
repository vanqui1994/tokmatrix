import copy
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


def make_clip(folder, *, seconds=2.0, cut_at=1.0):
    folder = Path(folder)
    first, second, output = folder / "a.mp4", folder / "b.mp4", folder / "clip.mp4"
    for path, colour, duration in ((first, "red", cut_at), (second, "blue", seconds - cut_at)):
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
             "-i", f"color=c={colour}:s=64x48:r=10:d={duration}", "-pix_fmt", "yuv420p", str(path)],
            check=True, capture_output=True,
        )
    listing = folder / "list.txt"
    listing.write_text(f"file '{first}'\nfile '{second}'\n", encoding="utf-8")
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0",
         "-i", str(listing), "-c", "copy", str(output)],
        check=True, capture_output=True,
    )
    return output


def transcription():
    return {"language": "vi", "segments": [{"start": 0.2, "end": 0.9, "text": "Quả này chín rồi."}]}


def compiled_storyboard():
    from bkt_web.analysis_compiler import compile_storyboard

    root = Path(__file__).resolve().parents[1]
    value = json.loads((root / "bkt_web/schemas/examples/agriculture.analysis-v1.json").read_text(encoding="utf-8"))
    return compile_storyboard(value, created_at=STAMP).storyboard


def plan_for(storyboard):
    from bkt_web.auto_director import direct

    return direct(storyboard, profile_id="source-faithful", plan_assets=False)["render_plan"]


def assess(storyboard, render_plan=None, **kwargs):
    from bkt_web.pipeline_route import assess_render_plan

    return assess_render_plan(storyboard, render_plan or plan_for(storyboard), **kwargs)


class GateTest(unittest.TestCase):
    """Ba cái bẫy phát hiện khi nối thật, mỗi cái một test."""

    def test_an_empty_requirement_set_is_not_a_pass(self):
        storyboard = compiled_storyboard()
        self.assertTrue(all(
            not scene["render_requirements"]["required"] for scene in storyboard["scenes"]
        ), "compiler cố ý không bịa requirement")
        codes, reasons = assess(storyboard)
        self.assertIn("NO_FIDELITY_REQUIREMENTS", codes)
        self.assertTrue(any("chưa kiểm gì" in item for item in reasons))

    def test_a_route_that_replays_the_source_is_blocked(self):
        storyboard = compiled_storyboard()
        render_plan = plan_for(storyboard)
        # Router tự chọn footage-composite cho nguồn mới: phát lại video gốc.
        chosen = {item["renderer_id"] for item in render_plan["selections"]}
        self.assertIn("footage-composite-v1", chosen)
        codes, reasons = assess(storyboard, render_plan)
        self.assertIn("SOURCE_MEDIA_REUSE_NOT_APPROVED", codes)
        self.assertTrue(any("không phải là remake" in item for item in reasons))

    def test_source_reuse_passes_only_when_a_human_approved_it(self):
        storyboard = compiled_storyboard()
        codes, _reasons = assess(storyboard, allow_source_media_reuse=True)
        self.assertNotIn("SOURCE_MEDIA_REUSE_NOT_APPROVED", codes)

    def test_native_vector_is_cross_checked_against_the_bridge(self):
        storyboard = compiled_storyboard()
        render_plan = plan_for(storyboard)
        for item in render_plan["selections"]:
            item["renderer_id"] = "native-vector-v1"
            item["renderer_version"] = "1.0.0"
        codes, reasons = assess(storyboard, render_plan)
        self.assertIn("RENDERER_CANNOT_DRAW_SCENE", codes)
        self.assertTrue(any("SCENE_HAS_NO_POSES" in item for item in reasons))
        self.assertNotIn("SOURCE_MEDIA_REUSE_NOT_APPROVED", codes)

    def test_a_needs_review_selection_is_reported_with_its_scenes(self):
        storyboard = compiled_storyboard()
        render_plan = plan_for(storyboard)
        render_plan["selections"][0]["status"] = "needs-review"
        codes, reasons = assess(storyboard, render_plan)
        self.assertIn("ROUTE_NEEDS_REVIEW", codes)
        self.assertTrue(any(storyboard["scenes"][0]["scene_id"] in item for item in reasons))

    def test_a_storyboard_with_real_requirements_clears_that_gate(self):
        storyboard = compiled_storyboard()
        scene = storyboard["scenes"][0]
        scene["render_requirements"]["required"] = [{
            "requirement_id": "requirement.one",
            "capability": "feature.deterministic_seek",
            "target_ids": [scene["entities"][0]["entity_id"]],
        }]
        codes, _reasons = assess(storyboard)
        self.assertNotIn("NO_FIDELITY_REQUIREMENTS", codes)

    def test_a_clean_plan_clears_every_gate(self):
        storyboard = compiled_storyboard()
        scene_ids = [item["scene_id"] for item in storyboard["scenes"]]
        for scene in storyboard["scenes"]:
            scene["render_requirements"]["required"] = [{
                "requirement_id": f"requirement.{scene['scene_id']}",
                "capability": "feature.deterministic_seek",
                "target_ids": [scene["entities"][0]["entity_id"]],
            }]
        render_plan = {
            "render_plan_id": "render.plan.clean",
            "status": "routable",
            "selections": [{
                "selection_id": f"selection.{scene_id}",
                "scene_id": scene_id,
                "start": 0.0,
                "end": 1.0,
                "renderer_id": "motion-graphics-v1",
                "renderer_version": "1.0.0",
                "status": "selected",
                "satisfied_requirement_ids": [f"requirement.{scene_id}"],
                "fallback_ids": [],
            } for scene_id in scene_ids],
            "fallbacks": [],
        }
        codes, reasons = assess(storyboard, render_plan)
        self.assertEqual((codes, reasons), ([], []))


class VerdictTest(unittest.TestCase):
    def test_the_verdict_is_json_serialisable_without_the_storyboard(self):
        from bkt_web.pipeline_route import RouteVerdict

        verdict = RouteVerdict(
            ok=False, status="needs_review",
            reason_codes=("NO_FIDELITY_REQUIREMENTS",), reasons=("chưa kiểm gì",),
            project_id="project.one", storyboard={"big": "payload"},
        )
        payload = verdict.as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertNotIn("storyboard", payload)
        self.assertIn("storyboard", verdict.as_dict(include_storyboard=True))

    def test_a_passing_verdict_names_the_renderer(self):
        from bkt_web.pipeline_route import RouteVerdict

        verdict = RouteVerdict(ok=True, status="routable", renderers=("motion-graphics-v1",))
        self.assertIn("motion-graphics-v1", verdict.summary())

    def test_every_reason_code_is_declared(self):
        from bkt_web.pipeline_route import REASON_CODES

        storyboard = compiled_storyboard()
        codes, _reasons = assess(storyboard)
        self.assertEqual(set(codes) - set(REASON_CODES), set())


@NEEDS_FFMPEG
class SourceAssessmentTest(unittest.TestCase):
    def test_a_real_source_is_assessed_end_to_end_and_refused_honestly(self):
        from bkt_web.pipeline_route import assess_source

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            verdict = assess_source(clip, transcription=transcription(), created_at=STAMP)
        self.assertFalse(verdict.ok)
        self.assertEqual(verdict.status, "needs_review")
        self.assertEqual(verdict.scene_count, 2)
        self.assertTrue(verdict.analysis_id)
        self.assertIn("NO_FIDELITY_REQUIREMENTS", verdict.reason_codes)
        self.assertIn("SOURCE_MEDIA_REUSE_NOT_APPROVED", verdict.reason_codes)

    def test_an_unreadable_source_becomes_a_reason_not_a_crash(self):
        from bkt_web.pipeline_route import assess_source

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "notes.mp4"
            path.write_text("not a video", encoding="utf-8")
            verdict = assess_source(path, created_at=STAMP)
        self.assertFalse(verdict.ok)
        self.assertEqual(verdict.reason_codes, ("ANALYSIS_FAILED",))
        self.assertTrue(verdict.reasons[0])

    def test_dropped_dialogue_is_a_reason_not_a_silent_loss(self):
        from bkt_web.pipeline_route import assess_source

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            # ASR không có nhãn speaker → compiler bỏ câu thoại (đúng), nên
            # cổng phải nói ra thay vì để pipeline dựng video mất lời.
            verdict = assess_source(clip, transcription=transcription(), created_at=STAMP)
        self.assertIn("COMPILED_WITH_SKIPPED_OBSERVATIONS", verdict.reason_codes)
        self.assertEqual(
            [item["reason"] for item in verdict.skipped],
            ["dialogue_without_speaker_label"],
        )
        self.assertTrue(any("dialogue_without_speaker_label" in item for item in verdict.reasons))

    def test_uncertainties_from_the_compiler_travel_with_the_verdict(self):
        from bkt_web.pipeline_route import assess_source

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            verdict = assess_source(clip, transcription=transcription(), created_at=STAMP)
        self.assertTrue(verdict.uncertainties)
        self.assertEqual({item["kind"] for item in verdict.uncertainties}, {"camera"})


class PipelineWiringTest(unittest.TestCase):
    """Cổng phải nối vào run_all mà không đổi hành vi đã có."""

    def pipeline(self, folder, route):
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_pipeline import RemakePipeline

        pipeline = RemakePipeline(str(Path(folder) / "source.mp4"), "route-test", log_callback=lambda *_: None)
        pipeline.metadata = {"sha256": "unknown", "duration": 5}
        pipeline.transcription = {"language": "vi", "segments": [{"start": 0, "end": 1, "text": "Xin chào"}]}
        return pipeline_module, pipeline

    def run_unreviewed(self, route):
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_pipeline import RemakePipeline

        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(pipeline_module, "SCRATCH_DIR", Path(tmp)), \
                patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(tmp)):
            pipeline = RemakePipeline(str(Path(tmp) / "source.mp4"), "route-test", log_callback=lambda *_: None)
            pipeline.metadata = {"sha256": "unknown", "duration": 5}
            pipeline.transcription = {"language": "vi", "segments": [{"start": 0, "end": 1, "text": "Xin chào"}]}
            with patch.object(pipeline, "step1_analyze_and_extract"), \
                    patch.object(pipeline, "step2_transcribe"), \
                    patch.object(pipeline_module, "analyze_story_with_ai", return_value=None), \
                    patch.object(pipeline_module, "register_project"), \
                    patch.object(pipeline, "assess_automatic_route", return_value=route), \
                    patch.object(pipeline, "step4_synthesize_and_mix_audio") as tts, \
                    patch.object(pipeline, "step6_export_preview_video") as fallback:
                result = pipeline.run_all()
            review = json.loads((pipeline.public_dir / "review.json").read_text(encoding="utf-8"))
        return result, review, tts, fallback

    def test_the_route_verdict_reaches_the_review_record_and_the_project(self):
        route = {
            "schema": "tokmatrix.pipeline-route/v1",
            "ok": False,
            "status": "needs_review",
            "summary": "route dùng lại media nguồn mà chưa có người duyệt",
            "reason_codes": ["SOURCE_MEDIA_REUSE_NOT_APPROVED"],
            "reasons": ["phát lại video gốc không phải là remake"],
        }
        result, review, tts, fallback = self.run_unreviewed(route)
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["route_status"], "needs_review")
        self.assertEqual(result["route_reason_codes"], ["SOURCE_MEDIA_REUSE_NOT_APPROVED"])
        self.assertEqual(review["automatic_route"], route)
        tts.assert_not_called()
        fallback.assert_not_called()

    def test_a_routable_verdict_still_does_not_invent_a_render_yet(self):
        # UV-803 chưa có đường frame → MP4, nên ngay cả khi cổng nói ok,
        # pipeline vẫn dừng ở needs_review thay vì giả vờ đã dựng.
        route = {"ok": True, "status": "routable", "summary": "ok", "reason_codes": [], "reasons": []}
        result, review, tts, fallback = self.run_unreviewed(route)
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["route_status"], "routable")
        tts.assert_not_called()
        fallback.assert_not_called()

    def test_a_broken_gate_never_breaks_the_existing_path(self):
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_pipeline import RemakePipeline

        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(pipeline_module, "SCRATCH_DIR", Path(tmp)), \
                patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(tmp)):
            pipeline = RemakePipeline(str(Path(tmp) / "source.mp4"), "route-test", log_callback=lambda *_: None)
            pipeline.metadata = {"sha256": "unknown", "duration": 5}
            pipeline.transcription = {"language": "vi", "segments": [{"start": 0, "end": 1, "text": "Xin chào"}]}
            with patch("bkt_web.pipeline_route.assess_source", side_effect=RuntimeError("cổng hỏng")), \
                    patch.object(pipeline, "step1_analyze_and_extract"), \
                    patch.object(pipeline, "step2_transcribe"), \
                    patch.object(pipeline_module, "analyze_story_with_ai", return_value=None), \
                    patch.object(pipeline_module, "register_project"), \
                    patch.object(pipeline, "step4_synthesize_and_mix_audio") as tts, \
                    patch.object(pipeline, "step6_export_preview_video") as fallback:
                result = pipeline.run_all()
            review = json.loads((pipeline.public_dir / "review.json").read_text(encoding="utf-8"))
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(review["automatic_route"]["reason_codes"], ["ANALYSIS_FAILED"])
        self.assertIn("cổng hỏng", review["automatic_route"]["reasons"][0])
        tts.assert_not_called()
        fallback.assert_not_called()

    def test_the_gate_only_reads_and_never_renders(self):
        from bkt_web.remake_pipeline import RemakePipeline

        source = Path(__file__).resolve().parents[1] / "bkt_web"
        with tempfile.TemporaryDirectory() as tmp:
            pipeline = RemakePipeline(str(Path(tmp) / "missing.mp4"), "route-test", log_callback=lambda *_: None)
            pipeline.transcription = {}
            route = pipeline.assess_automatic_route()
        # File không tồn tại nên cổng phải trả lý do, không ném ra ngoài.
        self.assertFalse(route["ok"])
        self.assertEqual(route["reason_codes"], ["ANALYSIS_FAILED"])


if __name__ == "__main__":
    unittest.main()
