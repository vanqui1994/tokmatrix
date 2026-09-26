import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
NEEDS_FFMPEG = unittest.skipUnless(HAS_FFMPEG, "cần ffmpeg và ffprobe trên PATH")


def frame(ops, *, width=64, height=48, opacity=1.0, source_media_usage="none"):
    return {
        "schema": "tokmatrix.renderer-frame/v1",
        "renderer_id": "motion-graphics-v1",
        "renderer_version": "1.0.0",
        "scene_id": "scene.one",
        "seconds": 0.0,
        "canvas": {"width": width, "height": height, "fps": 12},
        "source_media_usage": source_media_usage,
        "layers": [{"layer_id": "layer.one", "z": 0, "opacity": opacity, "ops": list(ops)}],
    }


def motion_graphics():
    import test_renderer_adapters as adapters
    from bkt_web.renderer_adapters import get_adapter

    adapter = get_adapter("motion-graphics-v1")
    compiled = adapter.compile(adapters.MotionGraphicsAdapterTest().payload(), canvas="9:16")
    return adapter, compiled


def colours(image):
    return {pixel for pixel in image.get_flattened_data()} if hasattr(image, "get_flattened_data") else set(image.getdata())


class RasteriseTest(unittest.TestCase):
    def test_a_rectangle_lands_where_it_was_asked_to(self):
        from bkt_web.frame_exporter import rasterise_frame

        image = rasterise_frame(frame([
            {"op": "rect", "x": 10, "y": 10, "width": 20, "height": 10, "fill": "#ff0000"},
        ]), background=(0, 0, 0))
        self.assertEqual(image.getpixel((15, 15)), (255, 0, 0))
        self.assertEqual(image.getpixel((5, 5)), (0, 0, 0))

    def test_every_supported_op_draws_something(self):
        from bkt_web.frame_exporter import SUPPORTED_OPS, rasterise_frame

        samples = {
            "rect": {"op": "rect", "x": 2, "y": 2, "width": 10, "height": 8, "fill": "#ff0000"},
            "rect_outline": {"op": "rect_outline", "x": 2, "y": 2, "width": 10, "height": 8, "stroke": "#00ff00"},
            "ellipse": {"op": "ellipse", "x": 2, "y": 2, "width": 10, "height": 8, "fill": "#0000ff"},
            "line": {"op": "line", "points": [[2, 2], [40, 30]], "stroke": "#ffff00", "width": 2},
            "polygon": {"op": "polygon", "points": [[2, 2], [20, 4], [10, 20]], "fill": "#ff00ff"},
            "text": {"op": "text", "x": 4, "y": 4, "text": "abc", "font_size": 16, "fill": "#ffffff"},
            "dim": {"op": "dim", "amount": 0.5},
            "mouth": {"op": "mouth", "x": 20, "y": 20, "width": 8, "height": 6, "fill": "#7d2f31"},
        }
        self.assertEqual(set(samples), set(SUPPORTED_OPS))
        # Nền xám để 'dim' cũng nhìn thấy được: mọi op phải làm frame khác đi
        # so với chính frame rỗng cùng nền.
        blank = rasterise_frame(frame([]), background=(128, 128, 128)).tobytes()
        for name, op in samples.items():
            with self.subTest(op=name):
                image = rasterise_frame(frame([op]), background=(128, 128, 128))
                self.assertNotEqual(image.tobytes(), blank, f"op '{name}' không vẽ ra gì")

    def test_an_unknown_op_is_an_error_not_a_silent_skip(self):
        from bkt_web.frame_exporter import FrameExportError, rasterise_frame

        with self.assertRaisesRegex(FrameExportError, "thiếu nội dung"):
            rasterise_frame(frame([{"op": "hologram", "x": 1, "y": 1}]))

    def test_reusing_source_footage_is_refused(self):
        from bkt_web.frame_exporter import FrameExportError, rasterise_frame

        with self.assertRaisesRegex(FrameExportError, "không dùng lại media nguồn"):
            rasterise_frame(frame([{"op": "video_frame", "x": 0, "y": 0, "width": 10, "height": 10}]))
        with self.assertRaisesRegex(FrameExportError, "chỉ dựng"):
            rasterise_frame(frame([{"op": "rect", "x": 0, "y": 0, "width": 4, "height": 4, "fill": "#fff"}],
                                  source_media_usage="visual"))

    def test_an_op_needing_a_frozen_asset_is_refused_with_its_reason(self):
        from bkt_web.frame_exporter import FrameExportError, rasterise_frame

        with self.assertRaisesRegex(FrameExportError, "UV-805"):
            rasterise_frame(frame([{"op": "image", "x": 0, "y": 0, "width": 4, "height": 4}]))

    def test_layer_opacity_and_z_order_are_honoured(self):
        from bkt_web.frame_exporter import rasterise_frame

        payload = frame([])
        payload["layers"] = [
            {"layer_id": "b.top", "z": 1, "opacity": 1.0,
             "ops": [{"op": "rect", "x": 0, "y": 0, "width": 20, "height": 20, "fill": "#00ff00"}]},
            {"layer_id": "a.bottom", "z": 0, "opacity": 1.0,
             "ops": [{"op": "rect", "x": 0, "y": 0, "width": 20, "height": 20, "fill": "#ff0000"}]},
        ]
        self.assertEqual(rasterise_frame(payload, background=(0, 0, 0)).getpixel((5, 5)), (0, 255, 0))

        payload["layers"][0]["opacity"] = 0.0
        self.assertEqual(rasterise_frame(payload, background=(0, 0, 0)).getpixel((5, 5)), (255, 0, 0))

    def test_colours_accept_short_long_and_alpha_forms(self):
        from bkt_web.frame_exporter import rasterise_frame

        for value, expected in (("#f00", (255, 0, 0)), ("#00ff00", (0, 255, 0))):
            with self.subTest(colour=value):
                image = rasterise_frame(frame([
                    {"op": "rect", "x": 0, "y": 0, "width": 20, "height": 20, "fill": value},
                ]), background=(0, 0, 0))
                self.assertEqual(image.getpixel((5, 5)), expected)

    def test_a_malformed_frame_is_rejected(self):
        from bkt_web.frame_exporter import FrameExportError, rasterise_frame

        with self.assertRaisesRegex(FrameExportError, "canvas"):
            rasterise_frame({"layers": []})
        with self.assertRaisesRegex(FrameExportError, "màu"):
            rasterise_frame(frame([{"op": "rect", "x": 0, "y": 0, "width": 4, "height": 4, "fill": "red"}]))
        with self.assertRaisesRegex(FrameExportError, "opacity"):
            rasterise_frame(frame([], opacity=2.0))
        with self.assertRaisesRegex(FrameExportError, "hai điểm"):
            rasterise_frame(frame([{"op": "line", "points": [[1, 1]]}]))

    def test_rasterising_is_deterministic(self):
        from bkt_web.frame_exporter import rasterise_frame

        payload = frame([
            {"op": "rect", "x": 2, "y": 2, "width": 20, "height": 10, "fill": "#123456"},
            {"op": "text", "x": 4, "y": 20, "text": "Xin chào", "font_size": 14, "fill": "#ffffff"},
        ])
        self.assertEqual(rasterise_frame(payload).tobytes(), rasterise_frame(payload).tobytes())


class FrameTimesTest(unittest.TestCase):
    def test_frames_sit_on_absolute_time(self):
        from bkt_web.frame_exporter import frame_times

        self.assertEqual(frame_times(0.0, 1.0, 4), [0.0, 0.25, 0.5, 0.75])
        self.assertEqual(frame_times(2.0, 3.0, 2), [2.0, 2.5])

    def test_a_scene_too_short_or_too_long_is_rejected(self):
        from bkt_web.frame_exporter import FrameExportError, frame_times

        with self.assertRaisesRegex(FrameExportError, "không có frame nào"):
            frame_times(0.0, 0.01, 24)
        with self.assertRaisesRegex(FrameExportError, "thời lượng dương"):
            frame_times(2.0, 2.0, 24)
        with self.assertRaisesRegex(FrameExportError, "vượt giới hạn"):
            frame_times(0.0, 3600.0, 60)


class AdapterFrameTest(unittest.TestCase):
    """Không cần ffmpeg: chỉ raster hoá frame của adapter thật."""

    def test_a_real_motion_graphics_frame_rasterises(self):
        from bkt_web.frame_exporter import rasterise_frame

        adapter, compiled = motion_graphics()
        image = rasterise_frame(adapter.render_frame(1.5, compiled=compiled))
        self.assertEqual(image.size, (compiled.canvas["width"], compiled.canvas["height"]))
        self.assertGreater(len(colours(image)), 5)

    def test_pixels_change_over_time(self):
        from bkt_web.frame_exporter import rasterise_frame

        adapter, compiled = motion_graphics()
        early = rasterise_frame(adapter.render_frame(0.2, compiled=compiled)).tobytes()
        middle = rasterise_frame(adapter.render_frame(2.0, compiled=compiled)).tobytes()
        late = rasterise_frame(adapter.render_frame(5.5, compiled=compiled)).tobytes()
        self.assertNotEqual(early, middle)
        self.assertNotEqual(middle, late)

    def test_seeking_backwards_gives_the_same_frame(self):
        from bkt_web.frame_exporter import rasterise_frame

        adapter, compiled = motion_graphics()
        forward = [rasterise_frame(adapter.render_frame(index / 2, compiled=compiled)).tobytes() for index in range(9)]
        backward = [rasterise_frame(adapter.render_frame(index / 2, compiled=compiled)).tobytes() for index in range(8, -1, -1)]
        self.assertEqual(forward, list(reversed(backward)))

    def test_a_host_callback_renderer_cannot_be_exported_this_way(self):
        from bkt_web.frame_exporter import FrameExportError, export_frames
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("native-vector-v1")
        compiled = type("Stub", (), {
            "frame_mode": "host-callback", "source_media_usage": "none",
            "canvas": {"width": 10, "height": 10, "fps": 4}, "start": 0.0, "end": 1.0,
        })()
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(FrameExportError, "draw-list"):
                export_frames(adapter, compiled, folder)


@NEEDS_FFMPEG
class ExportTest(unittest.TestCase):
    def test_a_scene_becomes_a_real_mp4(self):
        from bkt_web.frame_exporter import export_scene_to_mp4

        adapter, compiled = motion_graphics()
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "scene.mp4"
            result = export_scene_to_mp4(adapter, compiled, output, fps=6)
            self.assertTrue(output.is_file())
            self.assertGreater(output.stat().st_size, 1024)
            self.assertEqual(result.frames, 36)
            self.assertEqual((result.width, result.height), (1080, 1920))
            self.assertAlmostEqual(result.duration_seconds, 6.0, delta=0.5)
            self.assertEqual(json.loads(json.dumps(result.as_dict())), result.as_dict())

    def test_the_export_admits_it_used_a_fallback_font(self):
        from bkt_web.frame_exporter import export_scene_to_mp4

        adapter, compiled = motion_graphics()
        with tempfile.TemporaryDirectory() as folder:
            result = export_scene_to_mp4(adapter, compiled, Path(folder) / "scene.mp4", fps=4)
        self.assertTrue(any("default_font" in item for item in result.warnings))

    def test_the_exported_video_really_changes_over_time(self):
        """Mẫu test_native_renderer_is_seek_safe_and_has_no_source_images."""
        from bkt_web.frame_exporter import export_frames

        adapter, compiled = motion_graphics()
        with tempfile.TemporaryDirectory() as folder:
            frames = export_frames(adapter, compiled, folder, fps=2)
            self.assertEqual(len(frames), 12)
            digests = [path.read_bytes() for path in frames]
            self.assertGreater(len({bytes(item) for item in digests}), 3, "frame phải đổi theo thời gian")

    def test_a_failed_encode_raises_instead_of_leaving_a_stub_file(self):
        from bkt_web.frame_exporter import FrameExportError, encode_frames

        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "empty.mp4"
            with self.assertRaises(FrameExportError):
                encode_frames(folder, output, fps=12, frames=0)
            self.assertFalse(output.is_file() and output.stat().st_size > 1024)

    def test_exporting_twice_gives_the_same_frames(self):
        from bkt_web.frame_exporter import export_frames

        adapter, compiled = motion_graphics()
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            left = [path.read_bytes() for path in export_frames(adapter, compiled, first, fps=2)]
            right = [path.read_bytes() for path in export_frames(adapter, compiled, second, fps=2)]
            self.assertEqual(left, right)

    def test_a_missing_tool_is_reported_clearly(self):
        from bkt_web.frame_exporter import FrameExportError, encode_frames
        import bkt_web.frame_exporter as exporter

        original = shutil.which
        exporter.shutil.which = lambda name: None
        try:
            with tempfile.TemporaryDirectory() as folder:
                with self.assertRaisesRegex(FrameExportError, "không xuất được video"):
                    encode_frames(folder, Path(folder) / "out.mp4", fps=12, frames=1)
        finally:
            exporter.shutil.which = original


class PuppetRasterTest(unittest.TestCase):
    """UV-901: puppet-2d draw-lists rasterise through frame_exporter."""

    def _puppet_frame(self):
        """A minimal puppet-style frame with body, head, eyes and mouth."""
        return frame([
            # Torso
            {"op": "line", "points": [[32, 30], [32, 18]], "stroke": "#2f6f5a", "width": 4},
            # Head
            {"op": "ellipse", "x": 26, "y": 8, "width": 12, "height": 12, "fill": "#f0c9a5", "stroke": "#263c2c"},
            # Eyes
            {"op": "ellipse", "x": 29, "y": 12, "width": 3, "height": 3, "fill": "#1b2a24", "stroke": None},
            {"op": "ellipse", "x": 33, "y": 12, "width": 3, "height": 3, "fill": "#1b2a24", "stroke": None},
            # Mouth (open)
            {"op": "mouth", "x": 32, "y": 18, "width": 4, "height": 3, "fill": "#7d2f31", "viseme": "aa", "curve": 0.3},
            # Arms
            {"op": "line", "points": [[28, 20], [22, 25], [18, 28]], "stroke": "#f0c9a5", "width": 2},
            {"op": "line", "points": [[36, 20], [42, 25], [46, 28]], "stroke": "#f0c9a5", "width": 2},
            # Legs
            {"op": "line", "points": [[30, 30], [28, 38], [26, 44]], "stroke": "#2f6f5a", "width": 2},
            {"op": "line", "points": [[34, 30], [36, 38], [38, 44]], "stroke": "#2f6f5a", "width": 2},
        ])

    def test_a_puppet_frame_rasterises_without_error(self):
        from bkt_web.frame_exporter import rasterise_frame

        image = rasterise_frame(self._puppet_frame(), background=(10, 14, 18))
        self.assertEqual(image.size, (64, 48))
        # Should not be blank
        blank = rasterise_frame(frame([]), background=(10, 14, 18)).tobytes()
        self.assertNotEqual(image.tobytes(), blank)

    def test_mouth_closed_draws_nothing(self):
        from bkt_web.frame_exporter import rasterise_frame

        # width < 0.5: mouth is closed, should draw nothing
        mouth_closed = frame([
            {"op": "mouth", "x": 32, "y": 18, "width": 0.3, "height": 0.1, "fill": "#7d2f31"},
        ])
        blank = rasterise_frame(frame([]), background=(10, 14, 18)).tobytes()
        result = rasterise_frame(mouth_closed, background=(10, 14, 18)).tobytes()
        self.assertEqual(result, blank, "closed mouth should not add any pixels")

    def test_puppet_frame_is_deterministic(self):
        from bkt_web.frame_exporter import rasterise_frame

        a = rasterise_frame(self._puppet_frame()).tobytes()
        b = rasterise_frame(self._puppet_frame()).tobytes()
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
