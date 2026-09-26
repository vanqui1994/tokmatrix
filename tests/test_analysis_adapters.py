import copy
import json
import socket
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/universal_video"

# Awkward on purpose: a timestamp that any rounding or frame-snapping breaks.
ODD_START = 1.2345678901
ODD_END = 2.7182818284


def expectations():
    return json.loads((FIXTURES / "expectations.json").read_text(encoding="utf-8"))


def fixture(fixture_id):
    return next(item for item in expectations()["fixtures"] if item["id"] == fixture_id)


def request_for(fixture_id="agriculture_harvest", **overrides):
    from bkt_web.analysis_adapters import AnalysisRequest

    expected = fixture(fixture_id)["expected"]
    values = {
        "analysis_id": f"analysis.{fixture_id.replace('_', '.')}",
        "source": {
            "source_id": f"source.{fixture_id.replace('_', '.')}",
            "sha256": "a" * 64,
            "media_type": "video/mp4",
            "width": 160,
            "height": 90,
        },
        "duration_seconds": expected["duration_seconds"],
    }
    values.update(overrides)
    return AnalysisRequest(**values)


def transcript_segments(fixture_id):
    """Feed the golden dialogue back in as analyzer-native segments."""
    return [
        {
            "start": item["start"],
            "end": item["end"],
            "text": item["text"],
            "speaker": f"speaker.{index}",
            "language": "en",
            "confidence": 0.9,
        }
        for index, item in enumerate(fixture(fixture_id)["expected"]["dialogue"])
    ]


class BrokenAdapter:
    """An adapter that always fails, to prove failures stay isolated."""

    analyzer_id = "analyzer.broken"
    analyzer_kind = "multi"

    def __init__(self, error=None):
        self.error = error or RuntimeError("model weights are missing")
        self.calls = 0

    def analyzer(self):
        return {"analyzer_id": self.analyzer_id, "kind": self.analyzer_kind, "name": "broken", "version": "1.0.0"}

    def produce(self, request):
        self.calls += 1
        raise self.error


class TimestampPreservationTest(unittest.TestCase):
    def test_transcript_segment_and_word_times_are_copied_verbatim(self):
        from bkt_web.analysis_adapters import TranscriptAdapter, run_analysis

        segment = {
            "start": ODD_START,
            "end": ODD_END,
            "text": "Precise timing matters.",
            "confidence": 0.77,
            "words": [
                {"text": "Precise", "start": ODD_START, "end": 1.9876543210, "confidence": 0.8},
                {"text": "timing", "start": 1.9876543210, "end": 2.3141592653, "confidence": 0.7},
                {"text": "matters", "start": 2.3141592653, "end": ODD_END, "confidence": 0.75},
            ],
        }
        document = run_analysis(request_for(), [TranscriptAdapter([segment])]).document
        observation = document.observations[0]
        self.assertEqual(observation.source_interval.start, ODD_START)
        self.assertEqual(observation.source_interval.end, ODD_END)
        self.assertEqual([item.start for item in observation.words], [ODD_START, 1.9876543210, 2.3141592653])
        self.assertEqual([item.end for item in observation.words], [1.9876543210, 2.3141592653, ODD_END])

    def test_shot_edges_use_the_cut_times_exactly(self):
        from bkt_web.analysis_adapters import ShotBoundaryAdapter, run_analysis

        document = run_analysis(request_for(), [
            ShotBoundaryAdapter([{"time": ODD_START, "confidence": 0.81}, {"time": 4.0}]),
        ]).document
        edges = [(item.source_interval.start, item.source_interval.end) for item in document.observations]
        self.assertEqual(edges, [(0.0, ODD_START), (ODD_START, 4.0), (4.0, 6.4)])
        self.assertEqual([item.index for item in document.observations], [0, 1, 2])
        self.assertEqual(document.observations[1].confidence, 0.81)

    def test_ocr_times_and_normalized_boxes_are_exact(self):
        from bkt_web.analysis_adapters import OcrAdapter, run_analysis

        document = run_analysis(request_for(), [
            OcrAdapter([
                {"start": ODD_START, "end": ODD_END, "text": "SUBMIT", "confidence": 0.66,
                 "box": {"space": "pixels", "x": 16, "y": 9, "width": 32, "height": 18}},
            ]),
        ]).document
        observation = document.observations[0]
        self.assertEqual((observation.source_interval.start, observation.source_interval.end), (ODD_START, ODD_END))
        self.assertEqual(observation.region.x, 0.1)
        self.assertEqual(observation.region.y, 0.1)
        self.assertEqual(observation.region.width, 0.2)
        self.assertEqual(observation.region.height, 0.2)

    def test_segments_are_never_merged_reordered_or_deduplicated(self):
        from bkt_web.analysis_adapters import TranscriptAdapter, run_analysis

        segments = [
            {"start": 3.0, "end": 3.5, "text": "second"},
            {"start": 0.5, "end": 1.0, "text": "first"},
            {"start": 0.5, "end": 1.0, "text": "first"},
        ]
        document = run_analysis(request_for(), [TranscriptAdapter(segments)]).document
        self.assertEqual(
            [(item.source_interval.start, item.text) for item in document.observations],
            [(3.0, "second"), (0.5, "first"), (0.5, "first")],
        )

    def test_golden_dialogue_round_trips_through_the_adapter(self):
        from bkt_web.analysis_adapters import TranscriptAdapter, run_analysis

        for fixture_id in ("agriculture_harvest", "ui_tutorial_form", "infographic_growth"):
            with self.subTest(fixture=fixture_id):
                expected = fixture(fixture_id)["expected"]["dialogue"]
                document = run_analysis(request_for(fixture_id), [TranscriptAdapter(transcript_segments(fixture_id))]).document
                self.assertEqual(
                    [(item.source_interval.start, item.source_interval.end, item.text) for item in document.observations],
                    [(item["start"], item["end"], item["text"]) for item in expected],
                )


class OfflineTest(unittest.TestCase):
    def test_a_full_run_works_with_every_socket_blocked(self):
        from bkt_web.analysis_adapters import OcrAdapter, ShotBoundaryAdapter, TranscriptAdapter, run_analysis

        adapters = [
            ShotBoundaryAdapter([{"time": 2.5}]),
            TranscriptAdapter(transcript_segments("agriculture_harvest"), emit_audio_events=True),
            OcrAdapter([{"start": 0.5, "end": 2.0, "text": "HARVEST", "box": {"x": 0.1, "y": 0.8, "width": 0.4, "height": 0.1}}]),
        ]
        original = socket.socket.connect
        socket.socket.connect = lambda *args, **kwargs: self.fail("the test itself must not reach the network")
        try:
            result = run_analysis(request_for(), adapters)
        finally:
            socket.socket.connect = original
        self.assertEqual(result.failures, ())
        self.assertEqual(len(result.document.observations), 5)

    def test_an_adapter_that_reaches_the_network_is_recorded_as_a_failure(self):
        from bkt_web.analysis_adapters import AnalysisAdapter, AdapterOutput, ShotBoundaryAdapter, run_analysis

        class Phoning(AnalysisAdapter):
            analyzer_kind = "transcript"

            def produce(self, request):
                socket.create_connection(("127.0.0.1", 9))
                return AdapterOutput((), ())

        result = run_analysis(request_for(), [
            ShotBoundaryAdapter([{"time": 2.5}]),
            Phoning("analyzer.cloud", "cloud-asr", "1.0.0"),
        ])
        self.assertEqual([item["analyzer_id"] for item in result.failures], ["analyzer.cloud"])
        self.assertEqual(result.failures[0]["reason"], "unavailable")
        self.assertEqual(len(result.document.observations), 2)

    def test_the_socket_guard_is_removed_after_the_run(self):
        from bkt_web.analysis_adapters import ShotBoundaryAdapter, run_analysis

        before = socket.socket.connect
        run_analysis(request_for(), [ShotBoundaryAdapter([{"time": 2.5}])])
        self.assertIs(socket.socket.connect, before)

    def test_the_guard_is_restored_even_when_the_run_raises(self):
        from bkt_web.analysis_adapters import AnalysisAllAdaptersFailed, run_analysis

        before = socket.socket.connect
        with self.assertRaises(AnalysisAllAdaptersFailed):
            run_analysis(request_for(), [BrokenAdapter()])
        self.assertIs(socket.socket.connect, before)

    def test_network_is_allowed_only_when_the_request_says_so(self):
        from bkt_web.analysis_adapters import AnalysisAdapter, AnalysisAllAdaptersFailed, run_analysis

        seen = []

        class Checking(AnalysisAdapter):
            def produce(self, request):
                seen.append(socket.create_connection)
                raise NotImplementedError("probe only, no observations")

        original = socket.create_connection
        with self.assertRaises(AnalysisAllAdaptersFailed):
            run_analysis(request_for(), [Checking("analyzer.probe", "probe", "1.0.0")])
        self.assertIsNot(seen[-1], original)

        with self.assertRaises(AnalysisAllAdaptersFailed):
            run_analysis(request_for(allow_network=True), [Checking("analyzer.probe", "probe", "1.0.0")])
        self.assertIs(seen[-1], original)

    def test_remote_media_paths_are_refused(self):
        from bkt_web.analysis_adapters import AdapterError, AnalysisRequest

        with self.assertRaisesRegex(AdapterError, "đường dẫn cục bộ"):
            request_for(media_path="https://example.com/clip.mp4")
        with self.assertRaisesRegex(AdapterError, "path traversal"):
            request_for(media_path="../../etc/passwd")
        self.assertIsInstance(request_for(media_path=str(FIXTURES / "media/agriculture.svg")), AnalysisRequest)


class PartialFailureTest(unittest.TestCase):
    def test_one_broken_adapter_does_not_erase_the_others(self):
        from bkt_web.analysis_adapters import ShotBoundaryAdapter, TranscriptAdapter, run_analysis

        broken = BrokenAdapter()
        result = run_analysis(request_for(), [
            ShotBoundaryAdapter([{"time": 2.5}]),
            broken,
            TranscriptAdapter(transcript_segments("agriculture_harvest")),
        ])
        self.assertEqual(broken.calls, 1)
        self.assertEqual([item.kind for item in result.document.observations], ["shot", "shot", "transcript"])
        self.assertEqual([item.analyzer_id for item in result.document.failures], ["analyzer.broken"])
        self.assertEqual(result.document.failures[0].reason, "internal_error")
        self.assertIn("model weights", result.document.failures[0].message)
        self.assertEqual(result.succeeded_analyzer_ids, ("analyzer.shots", "analyzer.speech"))

    def test_failure_reasons_are_mapped_from_the_raised_error(self):
        from bkt_web.analysis_adapters import AdapterError, ShotBoundaryAdapter, run_analysis

        cases = {
            TimeoutError("took too long"): "timeout",
            NotImplementedError("not built yet"): "unavailable",
            AdapterError("this codec is not supported", reason="unsupported_media"): "unsupported_media",
            ValueError("garbage in"): "internal_error",
        }
        for error, reason in cases.items():
            with self.subTest(error=type(error).__name__):
                result = run_analysis(request_for(), [ShotBoundaryAdapter([{"time": 2.5}]), BrokenAdapter(error)])
                self.assertEqual(result.failures[0]["reason"], reason)
                self.assertEqual(len(result.document.observations), 2)

    def test_an_adapter_with_invalid_output_is_dropped_not_the_whole_run(self):
        from bkt_web.analysis_adapters import AnalysisAdapter, AdapterOutput, ShotBoundaryAdapter, run_analysis

        class Sloppy(AnalysisAdapter):
            analyzer_kind = "ocr"

            def produce(self, request):
                return AdapterOutput(
                    evidence=(),
                    observations=({
                        "observation_id": "observation.sloppy",
                        "kind": "ocr",
                        "analyzer_id": self.analyzer_id,
                        "source_interval": {"start": 0, "end": 1},
                        "confidence": 0.5,
                        "evidence_ids": ["evidence.that.does.not.exist"],
                        "text": "?",
                        "region": {"space": "normalized_source", "x": 0, "y": 0, "width": 0.1, "height": 0.1},
                    },),
                )

        result = run_analysis(request_for(), [ShotBoundaryAdapter([{"time": 2.5}]), Sloppy("analyzer.sloppy", "sloppy", "1.0.0")])
        self.assertEqual([item["analyzer_id"] for item in result.failures], ["analyzer.sloppy"])
        self.assertIn("not a valid analysis result", result.failures[0]["message"])
        self.assertEqual([item.kind for item in result.document.observations], ["shot", "shot"])

    def test_every_adapter_failing_raises_with_the_failures_attached(self):
        from bkt_web.analysis_adapters import AnalysisAllAdaptersFailed, run_analysis

        with self.assertRaises(AnalysisAllAdaptersFailed) as caught:
            run_analysis(request_for(), [BrokenAdapter()])
        self.assertEqual([item["analyzer_id"] for item in caught.exception.failures], ["analyzer.broken"])

    def test_failed_analyzers_are_still_declared_in_the_document(self):
        from bkt_web.analysis_adapters import ShotBoundaryAdapter, run_analysis

        result = run_analysis(request_for(), [ShotBoundaryAdapter([{"time": 2.5}]), BrokenAdapter()])
        self.assertIn("analyzer.broken", [item.analyzer_id for item in result.document.analyzers])


class DeterminismTest(unittest.TestCase):
    def adapters(self):
        from bkt_web.analysis_adapters import OcrAdapter, ShotBoundaryAdapter, TranscriptAdapter

        return [
            OcrAdapter([{"start": 0.5, "end": 2.0, "text": "HARVEST", "box": {"x": 0.1, "y": 0.8, "width": 0.4, "height": 0.1}}]),
            ShotBoundaryAdapter([{"time": 2.5}]),
            TranscriptAdapter(transcript_segments("agriculture_harvest")),
        ]

    def test_adapter_order_does_not_change_the_document(self):
        from bkt_web.analysis_adapters import run_analysis

        forward = run_analysis(request_for(), self.adapters()).payload
        backward = run_analysis(request_for(), list(reversed(self.adapters()))).payload
        self.assertEqual(forward, backward)
        self.assertEqual(json.loads(json.dumps(forward)), forward)

    def test_running_twice_gives_the_same_document(self):
        from bkt_web.analysis_adapters import run_analysis

        self.assertEqual(run_analysis(request_for(), self.adapters()).payload, run_analysis(request_for(), self.adapters()).payload)

    def test_the_run_does_not_mutate_its_inputs(self):
        from bkt_web.analysis_adapters import TranscriptAdapter, run_analysis

        segments = transcript_segments("agriculture_harvest")
        before = copy.deepcopy(segments)
        source = {"source_id": "source.copy", "sha256": "b" * 64, "media_type": "video/mp4"}
        source_before = copy.deepcopy(source)
        run_analysis(request_for(source=source), [TranscriptAdapter(segments)])
        self.assertEqual(segments, before)
        self.assertEqual(source, source_before)


class ValidationTest(unittest.TestCase):
    def test_bad_adapter_payloads_are_reported_per_adapter(self):
        from bkt_web.analysis_adapters import OcrAdapter, ShotBoundaryAdapter, TranscriptAdapter, run_analysis

        cases = {
            "cut outside the clip": ShotBoundaryAdapter([{"time": 99}], analyzer_id="analyzer.case"),
            "cuts out of order": ShotBoundaryAdapter([{"time": 3.0}, {"time": 1.0}], analyzer_id="analyzer.case"),
            "duplicate cuts": ShotBoundaryAdapter([{"time": 1.0}, {"time": 1.0}], analyzer_id="analyzer.case"),
            "segment past the clip": TranscriptAdapter([{"start": 1, "end": 99, "text": "x"}], analyzer_id="analyzer.case"),
            "blank text": TranscriptAdapter([{"start": 1, "end": 2, "text": "   "}], analyzer_id="analyzer.case"),
            "word outside segment": TranscriptAdapter(
                [{"start": 1, "end": 2, "text": "x", "words": [{"text": "x", "start": 0.1, "end": 0.2, "confidence": 1}]}],
                analyzer_id="analyzer.case",
            ),
            "confidence out of range": TranscriptAdapter([{"start": 1, "end": 2, "text": "x", "confidence": 4}], analyzer_id="analyzer.case"),
            "box outside the frame": OcrAdapter(
                [{"start": 1, "end": 2, "text": "x", "box": {"x": 0.9, "y": 0.9, "width": 0.4, "height": 0.4}}],
                analyzer_id="analyzer.case",
            ),
            "pixel box without frame size": OcrAdapter(
                [{"start": 1, "end": 2, "text": "x", "box": {"space": "pixels", "x": 1, "y": 1, "width": 2, "height": 2}}],
                analyzer_id="analyzer.case",
            ),
        }
        no_size = {"source_id": "source.nosize", "sha256": "c" * 64, "media_type": "video/mp4"}
        for label, adapter in cases.items():
            with self.subTest(case=label):
                request = request_for(source=no_size) if "without frame size" in label else request_for()
                result = run_analysis(request, [ShotBoundaryAdapter([{"time": 2.5}]), adapter])
                self.assertEqual([item["analyzer_id"] for item in result.failures], ["analyzer.case"])
                self.assertEqual(len(result.document.observations), 2)

    def test_runner_rejects_duplicate_analyzer_ids_and_an_empty_adapter_list(self):
        from bkt_web.analysis_adapters import AdapterError, ShotBoundaryAdapter, run_analysis

        with self.assertRaisesRegex(AdapterError, "trùng"):
            run_analysis(request_for(), [ShotBoundaryAdapter([{"time": 1.0}]), ShotBoundaryAdapter([{"time": 2.0}])])
        with self.assertRaisesRegex(AdapterError, "ít nhất một adapter"):
            run_analysis(request_for(), [])

    def test_diarisation_stays_a_label_not_an_identity(self):
        from bkt_web.analysis_adapters import TranscriptAdapter, run_analysis

        document = run_analysis(request_for(), [TranscriptAdapter(transcript_segments("agriculture_harvest"))]).document
        observation = document.observations[0]
        self.assertEqual(observation.speaker_label, "speaker.0")
        self.assertFalse(hasattr(observation, "speaker_id"))


if __name__ == "__main__":
    unittest.main()
