import tempfile
import unittest
import subprocess
from pathlib import Path
from unittest.mock import patch

import httpx
from PIL import Image, ImageDraw

from bkt_web.remake_pipeline import RemakePipeline, _safe_slug
from bkt_web.remake_routes import _safe_upload_name
from bkt_web.server import app
from bkt_web.remake_localization import (
    COUNTRIES, SOURCE_1_HASH, SOURCE_2_HASH, SOURCE_4_HASH, _atempo_chain, profile_for_source, translate_cues,
)


class RemakeTimelineTest(unittest.TestCase):
    def test_writer_performance_plan_never_assigns_unknown_speaker(self):
        from bkt_web.character_bible import apply_performance_plan, build_character_bible
        story = {"characters": [{"id": "tree", "name": "Cây cà chua", "asset": "tomato_plant"}], "scenes": [], "cues": [{"start": 0, "end": 1, "character_id": "tree", "text": "Ôi, đừng cắt tôi!"}, {"start": 1, "end": 2, "speaker": "unknown", "text": "Xin chào"}]}
        planned = apply_performance_plan(story)
        self.assertEqual(planned["cues"][0]["expression"], "surprised")
        self.assertNotIn("character_id", planned["cues"][1])
        self.assertEqual(planned["performance_plan"]["beats"][1]["status"], "unresolved")
        bible = build_character_bible(story, project_id="writer-test")
        self.assertEqual(bible["characters"][0]["performance"]["role"], "living-stakes")
    def test_scene_times_are_required_not_evenly_distributed(self):
        from bkt_web.remake_composer import validate_timeline
        with self.assertRaisesRegex(ValueError, "mốc"):
            validate_timeline([{"characters_present": []}], [], [], 10)

    def test_unknown_speaker_is_not_assigned_to_first_character(self):
        from bkt_web.remake_composer import validate_timeline
        scenes = [{"start_time": 0, "end_time": 10, "characters_present": ["tree"]}]
        with self.assertRaisesRegex(ValueError, "nhân vật"):
            validate_timeline(scenes, [{"start": 1, "end": 2, "text": "Hello"}], [{"id": "tree"}], 10)

    def test_offscreen_narrator_and_transition_are_valid(self):
        from bkt_web.remake_composer import validate_timeline
        scenes = [
            {"start_time": 0, "end_time": 7, "characters_present": ["tree"]},
            {"start_time": 7, "end_time": 10, "characters_present": [], "kind": "title", "text": "Vài phút sau"},
        ]
        validate_timeline(scenes, [{"start": 7, "end": 9, "character_id": "narrator"}], [{"id": "tree"}], 10)

    def test_composer_preserves_scene_timing_and_uses_content_renderer(self):
        import json
        from bkt_web import remake_composer as composer
        scenes = [
            {"start_time": 0, "end_time": 7, "characters_present": ["tree"], "renderer": "papaya-native-v1"},
            {"start_time": 7, "end_time": 10, "characters_present": [], "kind": "title", "renderer": "papaya-native-v1"},
        ]
        with tempfile.TemporaryDirectory() as tmp, patch.object(composer, "STATIC_DIR", Path(tmp)), patch.object(composer, "_record_with_playwright", return_value=None):
            composer.compose_animated_video("arbitrary-name", [{"id": "tree"}], scenes, [], Path(tmp) / "audio.mp3", Path(tmp) / "out.mp4", duration=10, log=lambda *_: None)
            html = (Path(tmp) / "remake_arbitrary-name_animated.html").read_text()
            self.assertIn('"end_time": 7', html)
            self.assertIn('window.renderFrame=renderFrame', html)
            self.assertNotIn('{{', html)

    def test_hand_drawn_renderer_embeds_whole_pose_cels(self):
        import json
        from bkt_web import remake_composer as composer
        scenes = [{
            "start_time": 0, "end_time": 2, "characters_present": ["hero"],
            "renderer": "hand-drawn-canvas-v1",
            "poses": {"hero": [
                {"time": 0, "x": 280, "y": 820, "height": 360, "drawing_id": "rest"},
                {"time": 1, "x": 300, "y": 820, "height": 360, "drawing_id": "lean"},
            ]},
        }]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sprites = root / "sprites"
            sprites.mkdir()
            Image.new("RGBA", (16, 24), "#e57f74").save(sprites / "hero.png")
            Image.new("RGBA", (16, 24), "#74a8e5").save(sprites / "hero__lean.png")
            with patch.object(composer, "STATIC_DIR", root), patch.object(composer, "_record_with_playwright", return_value=None):
                composer.compose_animated_video(
                    "hand-drawn-test", [{"id": "hero"}], scenes, [], root / "audio.mp3", root / "out.mp4",
                    duration=2, sprite_dir=sprites,
                )
            html = (root / "remake_hand-drawn-test_animated.html").read_text()
            self.assertIn('"hand-drawn-canvas-v1"', html)
            self.assertIn('"lean": "data:image/png;base64,', html)
            self.assertIn("drawInkCel", html)
            self.assertNotIn("{{", html)

    def test_unreviewed_pipeline_does_not_generate_audio_or_fallback_video(self):
        from bkt_web import remake_pipeline as pipeline_module
        with tempfile.TemporaryDirectory() as tmp, patch.object(pipeline_module, "SCRATCH_DIR", Path(tmp)), patch.object(pipeline_module, "PUBLIC_PROJECTS_DIR", Path(tmp)):
            pipeline = RemakePipeline(str(Path(tmp) / "source.mp4"), "review-test", log_callback=lambda *_: None)
            pipeline.metadata = {"sha256": "unknown", "duration": 5}
            pipeline.transcription = {"language": "zh", "segments": [{"start": 0, "end": 1, "text": "你好"}]}
            with patch.object(pipeline, "step1_analyze_and_extract"), patch.object(pipeline, "step2_transcribe"), patch.object(pipeline_module, "analyze_story_with_ai", return_value=None), patch.object(pipeline_module, "register_project"), patch.object(pipeline, "step4_synthesize_and_mix_audio") as tts, patch.object(pipeline, "step6_export_preview_video") as fallback:
                result = pipeline.run_all()
            self.assertEqual(result["status"], "needs_review")
            self.assertTrue((pipeline.public_dir / "review.json").is_file())
            tts.assert_not_called()
            fallback.assert_not_called()

    def test_papaya_script_has_source_locked_roles_and_title(self):
        from bkt_web.remake_pipeline import load_verified_script
        from bkt_web.remake_composer import validate_timeline
        story = load_verified_script("da790a54a3095d7a2d084e38c424c0f9dab619099a658259eee668f11ba1c175")
        validate_timeline(story["scenes"], story["cues"], story["characters"], 48.414)
        self.assertEqual([c["speaker"] for c in story["cues"][:4]], ["papaya_tree", "papaya_tree", "knife", "papaya_tree"])
        self.assertEqual(story["scenes"][4]["start_time"], 35)
        self.assertEqual(story["scenes"][4]["kind"], "title")
        self.assertTrue(all(c["translation_verified"] for c in story["cues"]))

    def test_capcut_uses_supported_output_argument(self):
        from bkt_web.remake_pipeline import generate_tts
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "tts.mp3"
            out.write_bytes(b"x" * 1100)
            with patch("bkt_web.remake_pipeline.subprocess.run") as run:
                run.return_value.returncode = 0
                self.assertTrue(generate_tts("Xin chào", "capcut", "BV421_vivn_streaming", out))
                self.assertIn("--out", run.call_args.args[0])
                self.assertNotIn("--output", run.call_args.args[0])

    def test_native_renderer_is_seek_safe_and_has_no_source_images(self):
        from playwright.sync_api import sync_playwright
        from bkt_web.remake_pipeline import load_verified_script
        from bkt_web import remake_composer as composer
        story = load_verified_script("da790a54a3095d7a2d084e38c424c0f9dab619099a658259eee668f11ba1c175")
        with tempfile.TemporaryDirectory() as tmp, patch.object(composer, "STATIC_DIR", Path(tmp)), patch.object(composer, "_record_with_playwright", return_value=None):
            composer.compose_animated_video("native-test", story["characters"], story["scenes"], story["cues"], Path(tmp) / "audio.mp3", Path(tmp) / "out.mp4", duration=48.414)
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 576, "height": 1024})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto((Path(tmp) / "remake_native-test_animated.html").as_uri())
                images = []
                for t in (10, 35.5, 40, 10):
                    page.evaluate("t => renderFrame(t)", t)
                    images.append(page.locator("canvas").screenshot())
                self.assertEqual(images[0], images[3])
                self.assertNotEqual(images[0], images[1])
                self.assertNotEqual(images[1], images[2])
                self.assertEqual(page.locator("img,video").count(), 0)
                self.assertEqual(errors, [])
                browser.close()

    def test_absent_speaker_is_rejected(self):
        from bkt_web.remake_composer import validate_timeline
        with self.assertRaisesRegex(ValueError, "xuất hiện"):
            validate_timeline(
                [{"start_time": 0, "end_time": 10, "characters_present": ["tree"]}],
                [{"start": 1, "end": 2, "character_id": "farmer"}],
                [{"id": "tree"}, {"id": "farmer"}], 10,
            )


class RemakePipelineFidelityTest(unittest.TestCase):
    def test_upload_filename_is_randomized_and_sanitized(self):
        name = _safe_upload_name("Video nguồn (01).MP4")
        self.assertRegex(name, r"^video-ngu-n-01-[a-f0-9]{8}\.mp4$")
        with self.assertRaises(Exception):
            _safe_upload_name("payload.exe")

    def test_country_catalog_and_verified_story_profile(self):
        codes = [country["code"] for country in COUNTRIES]
        self.assertEqual(len(codes), len(set(codes)))
        self.assertIn("vi-VN", codes)
        self.assertIn("en-US", codes)
        profile = profile_for_source(SOURCE_1_HASH)
        self.assertEqual(profile["renderer"], "/static/remake_2d_demo.html")
        self.assertEqual(len(profile["characters"]), 4)
        self.assertEqual(len(profile["cues"]), 9)
        caterpillar = profile_for_source(SOURCE_2_HASH)
        self.assertEqual(caterpillar["renderer"], "/static/remake_caterpillar_demo.html")
        self.assertEqual(len(caterpillar["characters"]), 3)
        self.assertEqual(len(caterpillar["cues"]), 22)
        peanut = profile_for_source(SOURCE_4_HASH)
        self.assertEqual(peanut["renderer"], "/static/remake_peanut_demo.html")
        self.assertEqual(peanut["default_locale"], "zh-CN")
        self.assertEqual(len(peanut["characters"]), 4)
        self.assertEqual(len(peanut["cues"]), 20)

    def test_vietnamese_localization_preserves_lines_and_speakers(self):
        source = [{"start": 0, "end": 1, "speaker": "hero", "text": "Xin chào"}]
        translated = translate_cues(source, "vi-VN")
        self.assertEqual(translated[0]["text"], "Xin chào")
        self.assertEqual(translated[0]["speaker"], "hero")
        self.assertEqual(translated[0]["source_text"], "Xin chào")

    def test_source_locale_is_preserved_without_false_translation(self):
        source = [{"start": 0, "end": 1, "speaker": "plant", "text": "去哪里啊"}]
        translated = translate_cues(source, "zh-CN", source_locale="zh-CN")
        self.assertEqual(translated[0]["text"], "去哪里啊")
        self.assertEqual(translated[0]["locale"], "zh-CN")

    def test_audio_tempo_chain_stays_inside_ffmpeg_limits(self):
        factors = [float(item.split("=")[1]) for item in _atempo_chain(4.5).split(",")]
        self.assertTrue(all(0.5 <= factor <= 2.0 for factor in factors))

    def make_pipeline(self, tmp: str, source_name: str, project_name: str) -> RemakePipeline:
        source = Path(tmp) / source_name
        source.touch()
        with (
            patch("bkt_web.remake_pipeline.SCRATCH_DIR", Path(tmp) / "scratch"),
            patch("bkt_web.remake_pipeline.PUBLIC_PROJECTS_DIR", Path(tmp) / "public"),
        ):
            return RemakePipeline(str(source), project_name)

    def test_slug_cannot_escape_project_directories(self):
        self.assertEqual(_safe_slug("Video Demo 01"), "video-demo-01")
        self.assertNotIn("/", _safe_slug("../../outside"))
        with self.assertRaises(ValueError):
            _safe_slug("!!!")

    def test_vector_frame_is_derived_from_real_pixels(self):
        with tempfile.TemporaryDirectory() as tmp:
            frame = Path(tmp) / "source.png"
            image = Image.new("RGB", (48, 24), "white")
            ImageDraw.Draw(image).rectangle((4, 3, 28, 20), fill="red")
            image.save(frame)

            result = RemakePipeline._vectorize_frame(frame, long_edge=48, colors=4)

            self.assertEqual((result["width"], result["height"]), (48, 24))
            self.assertGreaterEqual(len(result["palette"]), 2)
            self.assertTrue(result["rects"])
            self.assertEqual(len(result["source_frame_sha256"]), 64)

    def test_transcript_is_not_rewritten_or_assigned_fake_roles(self):
        with tempfile.TemporaryDirectory() as tmp:
            pipeline = self.make_pipeline(tmp, "source.mp4", "literal-test")
            pipeline.transcription = {
                "language": "zh",
                "segments": [{
                    "id": "asr-0000",
                    "start": 0.2,
                    "end": 1.8,
                    "text": "原文台词",
                    "source": "faster-whisper",
                    "speaker_id": None,
                    "speaker_verified": False,
                }],
            }

            with patch("bkt_web.remake_pipeline.analyze_story_with_ai", return_value=None):
                cues = pipeline.step3_adapt_vietnamese_script()

            self.assertEqual(cues[0]["text"], "原文台词")
            self.assertEqual(cues[0]["original_text"], "原文台词")
            self.assertIsNone(cues[0]["speaker_id"])
            self.assertNotIn("name", cues[0])
            self.assertNotIn("avatar", cues[0])

    def test_fidelity_guard_rejects_modified_dialogue(self):
        with tempfile.TemporaryDirectory() as tmp:
            pipeline = self.make_pipeline(tmp, "source.mp4", "guard-test")
            pipeline.metadata = {"duration": 2.0, "has_audio": False}
            pipeline.adapted_cues = [{
                "id": "asr-0000", "start": 0.0, "end": 1.0,
                "text": "invented", "original_text": "source",
            }]
            pipeline.vector_frames = [{"id": "frame-0000", "provenance": "quantized-from-source-frame"}]

            manifest = pipeline._build_manifest()

            self.assertEqual(manifest["fidelity"]["status"], "failed")
            self.assertTrue(any("không còn nguyên văn" in item for item in manifest["fidelity"]["violations"]))


if __name__ == "__main__":
    unittest.main()


class RemakeUploadApiTest(unittest.IsolatedAsyncioTestCase):
    async def test_storyboard_approval_requires_confirmation_and_matching_source(self):
        from bkt_web import remake_routes, remake_pipeline
        import json
        sha = "a" * 64
        project = {"id": "approval-test", "source_sha256": sha, "duration": 3}
        payload = {"source_sha256": sha, "approved": False, "characters": [{"id": "tree", "role": "young_1"}], "scenes": [{"start_time": 0, "end_time": 3, "characters_present": ["tree"]}], "cues": [{"start": 0, "end": 2, "speaker": "tree", "text": "Xin chào"}]}
        with tempfile.TemporaryDirectory() as tmp, patch.object(remake_routes, "get_remake_projects", return_value={"projects": [project]}), patch.object(remake_pipeline, "VERIFIED_SCRIPTS_FILE", Path(tmp) / "verified.json"):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.put("/api/remake/projects/approval-test/storyboard", json=payload)
                self.assertEqual(response.status_code, 422)
                payload["approved"] = True
                payload["source_sha256"] = "b" * 64
                self.assertEqual((await client.put("/api/remake/projects/approval-test/storyboard", json=payload)).status_code, 422)
                payload["source_sha256"] = sha
                response = await client.put("/api/remake/projects/approval-test/storyboard", json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                saved = json.loads((Path(tmp) / "verified.json").read_text())
                self.assertEqual(saved[sha]["cues"][0]["character_id"], "tree")

    async def test_upload_accepts_a_real_video_and_rejects_fake_video(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x96:d=0.4",
                "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
            ], capture_output=True, check=True)
            upload_dir = root / "uploads"
            upload_dir.mkdir()
            with (
                patch("bkt_web.remake_routes.PROJECT_ROOT", root),
                patch("bkt_web.remake_routes.UPLOAD_DIR", upload_dir),
            ):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                    response = await client.post(
                        "/api/remake/upload",
                        files={"file": ("My Clip.mp4", source.read_bytes(), "video/mp4")},
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    payload = response.json()
                    self.assertEqual(payload["width"], 64)
                    self.assertEqual(payload["height"], 96)
                    self.assertTrue((root / payload["path"]).is_file())

                    invalid = await client.post(
                        "/api/remake/upload",
                        files={"file": ("fake.mp4", b"not a video", "video/mp4")},
                    )
                    self.assertEqual(invalid.status_code, 422)
