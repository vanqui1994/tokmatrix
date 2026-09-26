import copy
import json
import shutil
import socket
import subprocess
import tempfile
import unittest
from pathlib import Path


HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
NEEDS_FFMPEG = unittest.skipUnless(HAS_FFMPEG, "cần ffmpeg và ffprobe trên PATH")


def make_clip(folder, *, seconds=2.0, cut_at=1.0, width=64, height=48, fps=10):
    """A tiny silent clip: solid red, then solid blue, so there is one real cut."""
    folder = Path(folder)
    first, second, output = folder / "a.mp4", folder / "b.mp4", folder / "clip.mp4"
    for path, colour, duration in ((first, "red", cut_at), (second, "blue", seconds - cut_at)):
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
             "-i", f"color=c={colour}:s={width}x{height}:r={fps}:d={duration}",
             "-pix_fmt", "yuv420p", str(path)],
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


def transcription(segments=None, language="vi"):
    return {
        "language": language,
        "segments": segments if segments is not None else [
            {"start": 0.2, "end": 0.9, "text": "Quả này chín rồi."},
            {"start": 1.2, "end": 1.8, "text": "Hái thôi."},
        ],
    }


class SceneParsingTest(unittest.TestCase):
    """The parser is pure, so it runs everywhere."""

    def test_pts_times_are_read_verbatim_and_in_order(self):
        from bkt_web.analysis_probe import parse_scene_times

        output = (
            "[Parsed_showinfo_1 @ 0x1] n:0 pts:1234 pts_time:1.2345678 duration:1\n"
            "[Parsed_showinfo_1 @ 0x1] n:1 pts:4321 pts_time:2.7182818 duration:1\n"
        )
        self.assertEqual(parse_scene_times(output), [1.2345678, 2.7182818])

    def test_repeated_or_backwards_times_are_dropped(self):
        from bkt_web.analysis_probe import parse_scene_times

        output = "pts_time:1.5\npts_time:1.5\npts_time:1.2\npts_time:3.0\n"
        self.assertEqual(parse_scene_times(output), [1.5, 3.0])

    def test_output_without_scene_changes_gives_no_cuts(self):
        from bkt_web.analysis_probe import parse_scene_times

        self.assertEqual(parse_scene_times("frame= 20 fps=0.0 q=-1.0 Lsize=N/A\n"), [])


class PathGuardTest(unittest.TestCase):
    def test_a_url_or_traversal_path_is_refused(self):
        from bkt_web.analysis_probe import ProbeError, probe_source

        with self.assertRaisesRegex(ProbeError, "không nhận URL"):
            probe_source("https://example.com/clip.mp4")
        with self.assertRaisesRegex(ProbeError, "path traversal"):
            probe_source("media/../../etc/passwd")
        with self.assertRaisesRegex(ProbeError, "Không tìm thấy file"):
            probe_source("/tmp/does-not-exist-xyz.mp4")

    def test_a_missing_tool_is_an_unavailable_failure_not_a_crash(self):
        from bkt_web.analysis_probe import FfmpegShotAdapter, ProbeError

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "clip.mp4"
            path.write_bytes(b"not really a video")
            adapter = FfmpegShotAdapter()
            original = shutil.which
            shutil.which = lambda name: None
            try:
                with self.assertRaises(ProbeError) as caught:
                    adapter.detect(path)
            finally:
                shutil.which = original
            self.assertEqual(caught.exception.reason, "unavailable")


class TranscriptionAdapterTest(unittest.TestCase):
    """Runs without ffmpeg: the adapter only reshapes what ASR already found."""

    def request(self, duration=2.0):
        from bkt_web.analysis_adapters import AnalysisRequest

        return AnalysisRequest(
            analysis_id="analysis.case",
            source={"source_id": "source.case", "sha256": "a" * 64, "media_type": "video/mp4"},
            duration_seconds=duration,
        )

    def test_pipeline_segments_become_transcript_observations(self):
        from bkt_web.analysis_probe import TranscriptionAdapter

        output = TranscriptionAdapter(transcription()).produce(self.request())
        kinds = [item["kind"] for item in output.observations]
        self.assertEqual(kinds.count("transcript"), 2)
        self.assertEqual(kinds.count("audio_event"), 2)
        first = output.observations[0]
        self.assertEqual(first["source_interval"], {"start": 0.2, "end": 0.9})
        self.assertEqual(first["text"], "Quả này chín rồi.")
        self.assertEqual(first["language"], "vi")

    def test_timestamps_are_copied_verbatim(self):
        from bkt_web.analysis_probe import TranscriptionAdapter

        odd = transcription([{"start": 0.1234567, "end": 1.7654321, "text": "Chính xác."}])
        output = TranscriptionAdapter(odd).produce(self.request())
        self.assertEqual(output.observations[0]["source_interval"], {"start": 0.1234567, "end": 1.7654321})

    def test_an_auto_language_is_left_unset_rather_than_asserted(self):
        from bkt_web.analysis_probe import TranscriptionAdapter

        output = TranscriptionAdapter(transcription(language="auto")).produce(self.request())
        self.assertNotIn("language", output.observations[0])

    def test_a_per_segment_speaker_wins_over_the_default(self):
        from bkt_web.analysis_probe import TranscriptionAdapter

        value = transcription([
            {"start": 0.1, "end": 0.5, "text": "Một.", "speaker": "speaker.01"},
            {"start": 0.6, "end": 1.0, "text": "Hai."},
        ])
        output = TranscriptionAdapter(value, speaker_label="speaker.00").produce(self.request())
        labels = [item.get("speaker_label") for item in output.observations if item["kind"] == "transcript"]
        self.assertEqual(labels, ["speaker.01", "speaker.00"])

    def test_an_empty_transcription_is_a_low_quality_failure(self):
        from bkt_web.analysis_adapters import AdapterError
        from bkt_web.analysis_probe import TranscriptionAdapter

        with self.assertRaises(AdapterError) as caught:
            TranscriptionAdapter({"segments": []}).produce(self.request())
        self.assertEqual(caught.exception.reason, "low_quality_input")

    def test_the_adapter_does_not_mutate_the_transcription_it_was_given(self):
        from bkt_web.analysis_probe import TranscriptionAdapter

        value = transcription()
        before = copy.deepcopy(value)
        TranscriptionAdapter(value).produce(self.request())
        self.assertEqual(value, before)


@NEEDS_FFMPEG
class RealFileTest(unittest.TestCase):
    def test_ffprobe_reads_the_source_block(self):
        from bkt_web.analysis_probe import probe_source

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder, seconds=2.0, cut_at=1.0, width=64, height=48, fps=10)
            probe = probe_source(clip)
            self.assertAlmostEqual(probe.duration_seconds, 2.0, places=1)
            self.assertEqual((probe.width, probe.height), (64, 48))
            self.assertAlmostEqual(probe.frame_rate, 10.0, places=3)
            self.assertEqual(probe.media_type, "video/mp4")
            self.assertRegex(probe.sha256, r"^[a-f0-9]{64}$")
            self.assertEqual(probe.as_source()["sha256"], probe.sha256)

    def test_the_file_hash_is_the_real_content_hash(self):
        import hashlib

        from bkt_web.analysis_probe import file_sha256

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "blob.bin"
            path.write_bytes(b"xyz" * 1000)
            self.assertEqual(file_sha256(path), hashlib.sha256(b"xyz" * 1000).hexdigest())

    def test_a_real_cut_is_detected_and_becomes_two_shots(self):
        from bkt_web.analysis_probe import FfmpegShotAdapter, analyse_media

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder, seconds=2.0, cut_at=1.0)
            cuts = FfmpegShotAdapter().detect(clip)
            self.assertTrue(cuts, "phải thấy ít nhất một điểm cắt")
            self.assertAlmostEqual(cuts[0], 1.0, delta=0.2)

            document = analyse_media(clip).document
            shots = [item for item in document.observations if item.kind == "shot"]
            self.assertEqual(len(shots), 2)
            self.assertEqual(shots[0].source_interval.start, 0.0)
            self.assertAlmostEqual(shots[0].source_interval.end, cuts[0])
            self.assertAlmostEqual(shots[1].source_interval.start, cuts[0])
            self.assertAlmostEqual(shots[1].source_interval.end, document.duration_seconds)

    def test_a_real_file_produces_a_valid_analysis_document(self):
        from bkt_web.analysis_probe import analyse_media
        from bkt_web.analysis_result import validate_analysis_result

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            result = analyse_media(clip, transcription=transcription())
            validate_analysis_result(result.payload)
            kinds = {item.kind for item in result.document.observations}
            self.assertEqual(kinds, {"shot", "transcript", "audio_event"})
            self.assertEqual(result.failures, ())
            self.assertEqual(result.document.source.sha256, result.document.source.sha256.lower())

    def test_the_document_can_be_compiled_into_a_storyboard(self):
        from bkt_web.analysis_compiler import compile_storyboard
        from bkt_web.analysis_probe import analyse_media
        from bkt_web.universal_storyboard import validate_storyboard_v2

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            result = analyse_media(clip, transcription=transcription())
            compiled = compile_storyboard(result.payload, created_at="2026-09-21T02:00:00Z")
            validate_storyboard_v2(compiled.storyboard)
            self.assertEqual(len(compiled.storyboard["scenes"]), 2)

    def test_a_scene_with_no_cut_becomes_a_single_shot(self):
        from bkt_web.analysis_probe import analyse_media

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "flat.mp4"
            subprocess.run(
                ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
                 "-i", "color=c=green:s=64x48:r=10:d=1.5", "-pix_fmt", "yuv420p", str(path)],
                check=True, capture_output=True,
            )
            document = analyse_media(path).document
            shots = [item for item in document.observations if item.kind == "shot"]
            self.assertEqual(len(shots), 1)
            self.assertEqual(shots[0].source_interval.start, 0.0)

    def test_a_broken_analyzer_does_not_erase_the_transcript(self):
        from bkt_web.analysis_probe import FfmpegShotAdapter, TranscriptionAdapter, probe_source
        from bkt_web.analysis_adapters import AnalysisRequest, run_analysis

        class BrokenShots(FfmpegShotAdapter):
            def detect(self, path):
                raise TimeoutError("scene detect took too long")

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            probe = probe_source(clip)
            request = AnalysisRequest(
                analysis_id="analysis.partial",
                source=probe.as_source(),
                duration_seconds=probe.duration_seconds,
                media_path=probe.path,
            )
            result = run_analysis(request, [BrokenShots(), TranscriptionAdapter(transcription())])
            self.assertEqual([item["reason"] for item in result.failures], ["timeout"])
            self.assertTrue([item for item in result.document.observations if item.kind == "transcript"])
            self.assertIn("analyzer.ffmpeg.shots", [item.analyzer_id for item in result.document.analyzers])

    def test_the_run_touches_no_socket(self):
        from bkt_web.analysis_probe import analyse_media

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            original = socket.socket.connect
            socket.socket.connect = lambda *args, **kwargs: self.fail("analyzer không được gọi mạng")
            try:
                result = analyse_media(clip, transcription=transcription())
            finally:
                socket.socket.connect = original
            self.assertEqual(result.failures, ())

    def test_running_twice_on_the_same_file_gives_the_same_document(self):
        from bkt_web.analysis_probe import analyse_media

        with tempfile.TemporaryDirectory() as folder:
            clip = make_clip(folder)
            first = analyse_media(clip, transcription=transcription()).payload
            second = analyse_media(clip, transcription=transcription()).payload
            self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))

    def test_a_file_that_is_not_media_is_refused_clearly(self):
        from bkt_web.analysis_probe import ProbeError, probe_source

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "notes.mp4"
            path.write_text("this is not a video", encoding="utf-8")
            with self.assertRaises(ProbeError):
                probe_source(path)


if __name__ == "__main__":
    unittest.main()
