import json
import math
import tempfile
import unittest
import wave
from pathlib import Path


def grid(value=128, size=32):
    return [[value] * size for _ in range(size)]


def gradient(size=32, scale=8):
    return [[(x * scale + y * scale) % 256 for x in range(size)] for y in range(size)]


def noisy(base, delta=40, every=3, size=32):
    """A deterministic perturbation of a flat grid."""
    return [
        [min(255, base + (delta if (x + y) % every == 0 else 0)) for x in range(size)]
        for y in range(size)
    ]


def tone(seconds=1.0, rate=8000, amplitude=0.5, frequency=220.0):
    count = int(seconds * rate)
    return [amplitude * math.sin(2 * math.pi * frequency * index / rate) for index in range(count)]


def silence(seconds=1.0, rate=8000):
    return [0.0] * int(seconds * rate)


def media(scene_id, frames=(), audio=None, rate=8000):
    from bkt_web.fidelity_visual import SceneMedia

    return SceneMedia.build(scene_id, frames, audio, rate)


def compare(reference, candidate, profile_id="source-faithful"):
    from bkt_web.fidelity_visual import compare_render

    return compare_render(reference, candidate, profile_id)


class ProfileTest(unittest.TestCase):
    def test_every_profile_in_the_director_vocabulary_exists(self):
        from bkt_web.fidelity_visual import PROFILES

        self.assertEqual(
            set(PROFILES),
            {"source-faithful", "educational", "product", "news", "tiktok-fast", "meme"},
        )

    def test_profiles_are_not_all_the_same_threshold(self):
        from bkt_web.fidelity_visual import PROFILES

        thresholds = {item.min_mean_ssim for item in PROFILES.values()}
        self.assertGreater(len(thresholds), 3)
        self.assertGreater(PROFILES["source-faithful"].min_mean_ssim, PROFILES["meme"].min_mean_ssim)
        self.assertLess(PROFILES["source-faithful"].max_rmse, PROFILES["tiktok-fast"].max_rmse)

    def test_an_unknown_profile_is_an_error_not_a_default(self):
        from bkt_web.fidelity_visual import VisualFidelityError, profile

        with self.assertRaisesRegex(VisualFidelityError, "Profile chưa có"):
            profile("cinematic")
        with self.assertRaisesRegex(VisualFidelityError, "Profile chưa có"):
            compare([media("scene.one", [grid()])], [media("scene.one", [grid()])], "cinematic")

    def test_a_custom_profile_is_validated(self):
        from bkt_web.fidelity_visual import ComparisonProfile, VisualFidelityError

        with self.assertRaisesRegex(VisualFidelityError, r"min_mean_ssim"):
            ComparisonProfile("custom", 1.5, 0.1, 0.5, 0.1, 1.0, 0.1)
        with self.assertRaisesRegex(VisualFidelityError, "không được âm"):
            ComparisonProfile("custom", 0.9, 0.1, 0.5, -1, 1.0, 0.1)
        with self.assertRaisesRegex(VisualFidelityError, "dễ hơn"):
            ComparisonProfile("custom", 0.80, 0.1, 0.95, 0.1, 1.0, 0.1)


class FrameComparisonTest(unittest.TestCase):
    def test_identical_frames_score_one(self):
        from bkt_web.fidelity_visual import frame_rmse, frame_ssim, load_frame

        left, right = load_frame(gradient()), load_frame(gradient())
        self.assertAlmostEqual(frame_ssim(left, right), 1.0, places=9)
        self.assertAlmostEqual(frame_rmse(left, right), 0.0, places=9)

    def test_an_identical_render_passes_the_strictest_profile(self):
        reference = [media("scene.one", [gradient(), gradient()])]
        candidate = [media("scene.one", [gradient(), gradient()])]
        report = compare(reference, candidate)
        self.assertTrue(report.passed, report.codes())
        self.assertEqual(report.for_scene("scene.one").mean_ssim, 1.0)
        self.assertEqual(report.for_scene("scene.one").frames_compared, 2)

    def test_a_visibly_different_frame_fails_a_faithful_profile(self):
        reference = [media("scene.one", [grid(40)])]
        candidate = [media("scene.one", [grid(220)])]
        report = compare(reference, candidate)
        self.assertIn("FRAME_RMSE_HIGH", report.codes())
        self.assertFalse(report.passed)
        self.assertGreater(report.for_scene("scene.one").worst_rmse, 0.06)

    def test_the_same_difference_can_pass_a_looser_profile(self):
        reference = [media("scene.one", [noisy(120)])]
        candidate = [media("scene.one", [noisy(120, delta=55)])]
        self.assertFalse(compare(reference, candidate, "source-faithful").passed)
        self.assertTrue(compare(reference, candidate, "meme").passed)

    def test_a_missing_scene_or_missing_frames_never_passes_quietly(self):
        report = compare([media("scene.one", [grid()])], [])
        self.assertIn("SCENE_NOT_RENDERED", report.codes())
        self.assertFalse(report.passed)

        empty = compare([media("scene.one", [grid()])], [media("scene.one", [])])
        self.assertIn("NO_CANDIDATE_FRAMES", empty.codes())
        self.assertFalse(empty.passed)

        nothing = compare([media("scene.one", [])], [media("scene.one", [])])
        self.assertIn("NO_REFERENCE_FRAMES", nothing.codes())
        self.assertFalse(nothing.passed)

    def test_a_different_frame_count_is_reported(self):
        report = compare(
            [media("scene.one", [gradient(), gradient(), gradient()])],
            [media("scene.one", [gradient(), gradient()])],
        )
        self.assertIn("FRAME_COUNT_MISMATCH", report.codes())
        self.assertEqual(report.for_scene("scene.one").frames_compared, 2)

    def test_an_extra_scene_is_a_warning(self):
        report = compare([media("scene.one", [gradient()])], [media("scene.one", [gradient()]), media("scene.two", [gradient()])])
        self.assertIn("SCENE_NOT_IN_REFERENCE", report.codes())
        self.assertTrue(report.passed)

    def test_frames_of_different_sizes_are_compared_on_the_shared_grid(self):
        report = compare(
            [media("scene.one", [gradient(size=32, scale=8)])],
            [media("scene.one", [gradient(size=64, scale=4)])],
        )
        self.assertIn("FRAME_SIZE_MISMATCH", report.codes())
        self.assertEqual([item.severity for item in report.findings if item.code == "FRAME_SIZE_MISMATCH"], ["warn"])

    def test_frames_can_be_loaded_from_png_files(self):
        from PIL import Image

        from bkt_web.fidelity_visual import frame_ssim, load_frame

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "frame.png"
            Image.new("RGB", (32, 32), (10, 200, 60)).save(path)
            loaded = load_frame(path, seconds=1.5)
            self.assertEqual((loaded.width, loaded.height), (32, 32))
            self.assertEqual(loaded.seconds, 1.5)
            self.assertAlmostEqual(frame_ssim(loaded, load_frame(path)), 1.0, places=9)

    def test_bad_frame_inputs_are_rejected(self):
        from bkt_web.fidelity_visual import VisualFidelityError, load_frame

        with self.assertRaisesRegex(VisualFidelityError, "Không tìm thấy frame"):
            load_frame("/tmp/does-not-exist-xyz.png")
        with self.assertRaisesRegex(VisualFidelityError, r"\[0,255\]"):
            load_frame([[300, 0], [0, 0]])
        with self.assertRaisesRegex(VisualFidelityError, "lưới chữ nhật"):
            load_frame([[1, 2], [3]])
        with self.assertRaisesRegex(VisualFidelityError, "path, ảnh hoặc lưới"):
            load_frame(42)


class AudioComparisonTest(unittest.TestCase):
    def test_identical_audio_passes(self):
        reference = [media("scene.one", [gradient()], tone())]
        candidate = [media("scene.one", [gradient()], tone())]
        report = compare(reference, candidate)
        self.assertTrue(report.passed, report.codes())
        self.assertEqual(report.for_scene("scene.one").audio_duration_drift, 0.0)

    def test_a_shorter_render_fails_on_duration(self):
        report = compare(
            [media("scene.one", [gradient()], tone(1.0))],
            [media("scene.one", [gradient()], tone(0.5))],
        )
        self.assertIn("AUDIO_DURATION_DRIFT", report.codes())
        self.assertAlmostEqual(report.for_scene("scene.one").audio_duration_drift, 0.5)

    def test_a_quieter_render_fails_on_loudness(self):
        report = compare(
            [media("scene.one", [gradient()], tone(amplitude=0.5))],
            [media("scene.one", [gradient()], tone(amplitude=0.05))],
        )
        self.assertIn("AUDIO_LOUDNESS_DRIFT", report.codes())
        self.assertGreater(report.for_scene("scene.one").audio_loudness_drift_db, 1.0)

    def test_a_silent_render_of_a_spoken_scene_is_a_failure(self):
        report = compare(
            [media("scene.one", [gradient()], tone())],
            [media("scene.one", [gradient()], silence())],
        )
        self.assertIn("AUDIO_SILENT_OUTPUT", report.codes())
        self.assertIn("AUDIO_SILENCE_DRIFT", report.codes())
        self.assertFalse(report.passed)

    def test_missing_audio_is_a_failure_not_an_omission(self):
        report = compare(
            [media("scene.one", [gradient()], tone())],
            [media("scene.one", [gradient()])],
        )
        self.assertIn("AUDIO_MISSING", report.codes())

    def test_audio_can_be_loaded_from_a_wav_file(self):
        from bkt_web.fidelity_visual import load_audio

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "clip.wav"
            with wave.open(str(path), "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(8000)
                handle.writeframes(b"".join(
                    int(value * 32767).to_bytes(2, "little", signed=True) for value in tone(0.25)
                ))
            loaded = load_audio(path)
            self.assertEqual(loaded.sample_rate, 8000)
            self.assertAlmostEqual(loaded.duration_seconds, 0.25, places=3)
            self.assertGreater(loaded.loudness_db, -20.0)

    def test_digital_silence_reports_a_floor_not_infinity(self):
        from bkt_web.fidelity_visual import load_audio

        quiet = load_audio(silence(0.2), 8000)
        self.assertEqual(quiet.loudness_db, -120.0)
        self.assertEqual(quiet.silence_ratio(), 1.0)

    def test_bad_audio_inputs_are_rejected(self):
        from bkt_web.fidelity_visual import VisualFidelityError, load_audio

        with self.assertRaisesRegex(VisualFidelityError, "sample_rate"):
            load_audio([0.1, 0.2])
        with self.assertRaisesRegex(VisualFidelityError, r"\[-1,1\]"):
            load_audio([2.0], 8000)
        with self.assertRaisesRegex(VisualFidelityError, "Không tìm thấy audio"):
            load_audio("/tmp/does-not-exist-xyz.wav")


class ReportTest(unittest.TestCase):
    def test_the_report_is_json_serialisable_and_names_its_profile(self):
        payload = compare([media("scene.one", [gradient()])], [media("scene.one", [gradient()])], "product").as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.visual-audio-fidelity/v1")
        self.assertEqual(payload["profile"]["profile_id"], "product")
        self.assertTrue(payload["passed"])

    def test_comparison_is_deterministic(self):
        first = compare([media("scene.one", [noisy(100)])], [media("scene.one", [noisy(100, delta=20)])]).as_dict()
        second = compare([media("scene.one", [noisy(100)])], [media("scene.one", [noisy(100, delta=20)])]).as_dict()
        self.assertEqual(first, second)

    def test_duplicate_scene_ids_and_empty_references_are_rejected(self):
        from bkt_web.fidelity_visual import VisualFidelityError

        with self.assertRaisesRegex(VisualFidelityError, "ít nhất một scene"):
            compare([], [media("scene.one", [gradient()])])
        with self.assertRaisesRegex(VisualFidelityError, "tham chiếu bị trùng"):
            compare([media("scene.one", [gradient()]), media("scene.one", [gradient()])], [])
        with self.assertRaisesRegex(VisualFidelityError, "ứng viên bị trùng"):
            compare([media("scene.one", [gradient()])],
                    [media("scene.one", [gradient()]), media("scene.one", [gradient()])])

    def test_a_scene_report_is_available_per_scene(self):
        from bkt_web.fidelity_visual import VisualFidelityError

        report = compare(
            [media("scene.one", [gradient()]), media("scene.two", [gradient()])],
            [media("scene.one", [gradient()]), media("scene.two", [gradient()])],
        )
        self.assertEqual([item.scene_id for item in report.scenes], ["scene.one", "scene.two"])
        with self.assertRaisesRegex(VisualFidelityError, "không có trong báo cáo"):
            report.for_scene("scene.three")

    def test_frames_carry_their_own_timestamps(self):
        reference = [media("scene.one", [(0.0, grid(50)), (0.5, grid(50))])]
        candidate = [media("scene.one", [(0.0, grid(50)), (0.5, grid(250))])]
        report = compare(reference, candidate)
        drift = [item for item in report.findings if item.code == "FRAME_RMSE_HIGH"]
        self.assertEqual([item.seconds for item in drift], [0.5])


if __name__ == "__main__":
    unittest.main()
