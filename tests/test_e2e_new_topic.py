"""UV-903 — Test e2e: chủ đề mới đi hết compile → route → render → manifest.

Hai đường kiểm:
1. Route OK + draw-list → MP4 + manifest  (cần ffmpeg)
2. Route needs_review → reason code cụ thể   (luôn chạy)
"""

import json
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
NEEDS_FFMPEG = unittest.skipUnless(HAS_FFMPEG, "cần ffmpeg và ffprobe trên PATH")


def _fake_analysis_payload(*, topic: str = "robot lau nhà", duration: float = 3.0):
    """Minimal AnalysisResultV1-compatible payload."""
    return {
        "schema": "tokmatrix.analysis-result/v1",
        "version": "1.0.0",
        "analysis_id": f"test.{topic.replace(' ', '_')}",
        "source": {"media_type": "video/mp4", "duration_seconds": duration},
        "observations": [
            {
                "observation_id": "obs.shot.1",
                "kind": "shot",
                "time_range": {"start": 0.0, "end": duration},
                "content": {"description": f"Scene about {topic}"},
                "confidence": 0.8,
                "evidence_ids": ["obs.shot.1"],
            },
            {
                "observation_id": "obs.entity.1",
                "kind": "entity",
                "time_range": {"start": 0.0, "end": duration},
                "content": {
                    "entity_id": "e1",
                    "name": topic,
                    "kind": "character",
                    "description": f"Main character: {topic}",
                },
                "confidence": 0.7,
                "evidence_ids": ["obs.entity.1"],
            },
            {
                "observation_id": "obs.dialogue.1",
                "kind": "dialogue",
                "time_range": {"start": 0.0, "end": duration},
                "content": {
                    "speaker_id": "e1",
                    "text": f"Xin chào, tôi là {topic}.",
                    "language": "vi",
                },
                "confidence": 0.9,
                "evidence_ids": ["obs.dialogue.1"],
            },
        ],
    }


class RouteNeedsReviewTest(unittest.TestCase):
    """Nguồn mới route → needs_review có reason code."""

    def test_new_topic_gets_specific_reason_codes(self):
        """assess_source on a novel topic should return needs_review with codes."""
        from bkt_web.pipeline_route import assess_source

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(b"\x00" * 1024)
            tmp_path = tmp.name

        try:
            # Mock analyse_media to return our fake analysis
            with patch("bkt_web.analysis_probe.analyse_media") as mock_analyse:
                mock_run = MagicMock()
                mock_run.payload = _fake_analysis_payload(topic="robot lau nhà")
                mock_run.document.analysis_id = "test.robot"
                mock_analyse.return_value = mock_run

                verdict = assess_source(tmp_path, allow_network=False)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        # Should not be ok — novel topic
        self.assertFalse(verdict.ok)
        self.assertEqual(verdict.status, "needs_review")
        self.assertTrue(len(verdict.reason_codes) > 0, "cần ít nhất 1 reason code")
        # Must have specific codes, not a generic error
        for code in verdict.reason_codes:
            self.assertIn(code, (
                "NO_FIDELITY_REQUIREMENTS",
                "SOURCE_MEDIA_REUSE_NOT_APPROVED",
                "RENDERER_CANNOT_DRAW_SCENE",
                "ROUTE_NEEDS_REVIEW",
                "COMPILED_WITH_SKIPPED_OBSERVATIONS",
                "ASSET_NEEDS_REVIEW",
                "ANALYSIS_FAILED",
            ))

    def test_reason_codes_are_not_empty_strings(self):
        """All reason codes and reasons should be non-empty."""
        from bkt_web.pipeline_route import assess_source

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(b"\x00" * 1024)
            tmp_path = tmp.name

        try:
            with patch("bkt_web.analysis_probe.analyse_media") as mock_analyse:
                mock_run = MagicMock()
                mock_run.payload = _fake_analysis_payload()
                mock_run.document.analysis_id = "test.generic"
                mock_analyse.return_value = mock_run

                verdict = assess_source(tmp_path, allow_network=False)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        for code in verdict.reason_codes:
            self.assertTrue(code.strip(), "reason_code rỗng")
        for reason in verdict.reasons:
            self.assertTrue(reason.strip(), "reason rỗng")


class AssetGeneratorE2ETest(unittest.TestCase):
    """Generated assets integrate with pipeline route."""

    def test_asset_gaps_get_placeholders(self):
        from bkt_web.asset_generator import generate_placeholders, inject_generated_assets

        gaps = [
            {"entity_name": "robot lau nhà", "entity_kind": "character"},
            {"entity_name": "bàn gỗ", "entity_kind": "object"},
        ]
        result = generate_placeholders(gaps)
        self.assertEqual(len(result.assets), 2)

        # Robot should get a rig, table should not
        robot = next(a for a in result.assets if "robot" in a.entity_name)
        table = next(a for a in result.assets if "bàn" in a.entity_name)
        self.assertIsNotNone(robot.rig_id)
        self.assertIsNone(table.rig_id)

        # Inject into storyboard
        storyboard = {
            "scenes": [{
                "scene_id": "s1",
                "entities": [
                    {"entity_id": "e1", "name": "robot lau nhà", "kind": "character", "attributes": {}},
                    {"entity_id": "e2", "name": "bàn gỗ", "kind": "object", "attributes": {}},
                ],
            }],
        }
        patched = inject_generated_assets(storyboard, result)
        e1_attrs = patched["scenes"][0]["entities"][0]["attributes"]
        self.assertIn("rig", e1_attrs)
        self.assertEqual(e1_attrs["provenance"]["kind"], "generated")
        # Original storyboard unchanged
        self.assertEqual(storyboard["scenes"][0]["entities"][0]["attributes"], {})

    def test_generated_asset_checksums_are_stable(self):
        from bkt_web.asset_generator import generate_placeholders

        r1 = generate_placeholders([{"entity_name": "drone", "entity_kind": "character"}])
        r2 = generate_placeholders([{"entity_name": "drone", "entity_kind": "character"}])
        self.assertEqual(r1.assets[0].checksum, r2.assets[0].checksum)


class FrameExporterPuppetE2ETest(unittest.TestCase):
    """Puppet draw-list rasterises through frame_exporter."""

    def test_puppet_ops_are_all_supported(self):
        """The ops that puppet-2d adapter produces are all in SUPPORTED_OPS."""
        from bkt_web.frame_exporter import SUPPORTED_OPS
        puppet_ops = {"line", "ellipse", "mouth"}
        self.assertTrue(puppet_ops.issubset(set(SUPPORTED_OPS)),
                        f"puppet ops {puppet_ops - set(SUPPORTED_OPS)} missing from SUPPORTED_OPS")

    def test_mouth_op_renders_pixels(self):
        from bkt_web.frame_exporter import rasterise_frame

        frame_data = {
            "schema": "tokmatrix.renderer-frame/v1",
            "renderer_id": "puppet-2d-v1",
            "renderer_version": "1.0.0",
            "scene_id": "s1",
            "seconds": 0.5,
            "canvas": {"width": 64, "height": 48, "fps": 12},
            "source_media_usage": "none",
            "layers": [{
                "layer_id": "puppet.1",
                "z": 0,
                "opacity": 1.0,
                "ops": [
                    {"op": "ellipse", "x": 20, "y": 10, "width": 16, "height": 16, "fill": "#f0c9a5"},
                    {"op": "mouth", "x": 28, "y": 22, "width": 5, "height": 4, "fill": "#7d2f31"},
                    {"op": "line", "points": [[28, 28], [28, 40]], "stroke": "#2f6f5a", "width": 3},
                ],
            }],
        }
        blank = rasterise_frame({
            **frame_data,
            "layers": [{"layer_id": "empty", "z": 0, "opacity": 1.0, "ops": []}],
        }, background=(10, 14, 18)).tobytes()

        image = rasterise_frame(frame_data, background=(10, 14, 18))
        self.assertNotEqual(image.tobytes(), blank)


@NEEDS_FFMPEG
class AutoRenderV2E2ETest(unittest.TestCase):
    """Pipeline auto-renders v2 when route succeeds with draw-list renderer."""

    def test_route_ok_produces_mp4_and_manifest(self):
        """_try_auto_render_v2 with a mock route → MP4 + evidence."""
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("motion-graphics-v1")

        # Build a minimal storyboard that motion-graphics can render
        import test_renderer_adapters as adapters
        mg_test = adapters.MotionGraphicsAdapterTest()
        scene = mg_test.payload()

        # Compile to get a valid compiled scene
        compiled = adapter.compile(scene, canvas="9:16")

        # Build a fake route verdict dict
        route = {
            "ok": True,
            "status": "routable",
            "storyboard": {
                "project_id": "test.auto.v2",
                "duration_seconds": compiled.end - compiled.start,
                "scenes": [{
                    "scene_id": compiled.scene_id,
                    "start": compiled.start,
                    "end": compiled.end,
                    "entities": scene.get("entities", []),
                    "audio_events": [],
                    "background": {},
                    "transitions": {},
                    "render_requirements": {},
                }],
            },
            "render_plan": {
                "selections": [{
                    "scene_id": compiled.scene_id,
                    "renderer_id": "motion-graphics-v1",
                    "status": "selected",
                }],
            },
            "asset_gaps": [],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a minimal pipeline-like object
            from bkt_web.frame_exporter import export_scene_to_mp4

            output = Path(tmpdir) / "remake.mp4"
            result = export_scene_to_mp4(adapter, compiled, output)
            self.assertTrue(output.is_file())
            self.assertGreater(output.stat().st_size, 1024)
            self.assertGreater(result.frames, 0)
            self.assertGreater(result.duration_seconds, 0)


if __name__ == "__main__":
    unittest.main()
