import copy
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "bkt_web/schemas/examples"


def agriculture():
    return json.loads((EXAMPLES / "agriculture.analysis-v1.json").read_text(encoding="utf-8"))


def ui_tutorial():
    return json.loads((EXAMPLES / "ui-tutorial.analysis-v1.json").read_text(encoding="utf-8"))


def observation(document, observation_id):
    return next(item for item in document["observations"] if item["observation_id"] == observation_id)


def codes(error):
    return {item.code for item in error.issues}


class ExampleTest(unittest.TestCase):
    def test_shipped_examples_validate(self):
        from bkt_web.analysis_result import validate_analysis_result

        for name, value in (("agriculture", agriculture()), ("ui-tutorial", ui_tutorial())):
            with self.subTest(example=name):
                document = validate_analysis_result(value)
                self.assertEqual(document.schema_version, "1.0.0")
                self.assertTrue(document.observations)

    def test_examples_cover_every_observation_kind(self):
        from bkt_web.analysis_result import OBSERVATION_KINDS, validate_analysis_result

        seen = set()
        for value in (agriculture(), ui_tutorial()):
            seen.update(item.kind for item in validate_analysis_result(value).observations)
        self.assertEqual(seen, set(OBSERVATION_KINDS))

    def test_json_schema_file_matches_the_models(self):
        from bkt_web.analysis_result import AnalysisResultV1

        stored = json.loads((ROOT / "bkt_web/schemas/analysis_result_v1.schema.json").read_text(encoding="utf-8"))
        generated = AnalysisResultV1.model_json_schema(mode="validation")
        self.assertEqual({key: stored[key] for key in generated}, generated)
        self.assertEqual(stored["$schema"], "https://json-schema.org/draft/2020-12/schema")

    def test_validation_does_not_mutate_the_input(self):
        from bkt_web.analysis_result import validate_analysis_result

        value = agriculture()
        before = copy.deepcopy(value)
        validate_analysis_result(value)
        self.assertEqual(value, before)

    def test_strict_json_parsing_rejects_nan_tokens(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result_json

        raw = json.dumps(agriculture()).replace('"confidence": 0.94', '"confidence": NaN')
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result_json(raw)
        self.assertIn("INVALID_JSON", codes(caught.exception))


class EvidenceAndConfidenceTest(unittest.TestCase):
    def test_every_observation_carries_confidence_interval_and_evidence(self):
        from bkt_web.analysis_result import validate_analysis_result

        document = validate_analysis_result(agriculture())
        for item in document.observations:
            self.assertTrue(0 <= item.confidence <= 1)
            self.assertLessEqual(item.source_interval.start, item.source_interval.end)
            self.assertTrue(item.evidence_ids)

    def test_an_observation_without_evidence_is_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_action_pick")["evidence_ids"] = []
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("INVALID_VALUE", codes(caught.exception))

    def test_unknown_evidence_analyzer_and_track_references_are_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        for path, mutate in (
            ("evidence_ids", lambda value: observation(value, "observation_action_pick").__setitem__("evidence_ids", ["evidence_ghost"])),
            ("analyzer_id", lambda value: observation(value, "observation_action_pick").__setitem__("analyzer_id", "analyzer_ghost")),
            ("actor_track_ref", lambda value: observation(value, "observation_action_pick").__setitem__("actor_track_ref", "observation_ghost")),
            ("track_ref", lambda value: observation(value, "observation_pose_farmer").__setitem__("track_ref", "observation_caption")),
        ):
            with self.subTest(field=path):
                value = agriculture()
                mutate(value)
                with self.assertRaises(AnalysisValidationError) as caught:
                    validate_analysis_result(value)
                self.assertIn("UNKNOWN_REFERENCE", codes(caught.exception))

    def test_evidence_must_point_at_the_analysed_source(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        value["evidence"][0]["source_id"] = "source_other_clip"
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("UNKNOWN_REFERENCE", codes(caught.exception))

    def test_a_resolved_identity_needs_real_confidence(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        track = observation(value, "observation_track_hand")
        track["confidence"] = 0.2
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("UNSUPPORTED_IDENTITY_CLAIM", codes(caught.exception))

    def test_uncertainty_is_expressible_without_being_resolved(self):
        from bkt_web.analysis_result import validate_analysis_result

        document = validate_analysis_result(agriculture())
        fruit = next(item for item in document.observations if item.observation_id == "observation_track_fruit")
        self.assertFalse(fruit.identity_resolved)
        self.assertEqual([item.label for item in fruit.alternatives], ["apple", "tomato"])
        self.assertEqual(fruit.review_status, "unreviewed")


class NoCreativeDecisionsTest(unittest.TestCase):
    def test_production_decision_fields_are_rejected_anywhere(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        cases = {
            "top level": lambda value: value.update({"renderer": "native-vector-v1"}),
            "observation": lambda value: observation(value, "observation_action_pick").update({"entity_id": "farmer_01"}),
            "analyzer parameters": lambda value: value["analyzers"][0].update({"parameters": {"template_id": "harvest"}}),
            "nested extension": lambda value: observation(value, "observation_camera_push").update(
                {"extensions": {"studio.example:hint": {"style": "cinematic"}}}
            ),
        }
        for label, mutate in cases.items():
            with self.subTest(case=label):
                value = agriculture()
                mutate(value)
                with self.assertRaises(AnalysisValidationError) as caught:
                    validate_analysis_result(value)
                self.assertIn("CREATIVE_DECISION_IN_ANALYSIS", codes(caught.exception))

    def test_the_schema_has_no_renderer_or_storyboard_fields(self):
        from bkt_web.analysis_result import FORBIDDEN_DECISION_KEYS

        schema = json.dumps(json.loads((ROOT / "bkt_web/schemas/analysis_result_v1.schema.json").read_text(encoding="utf-8")))
        for key in ("renderer", "render_plan", "storyboard", "asset_id", "palette"):
            self.assertIn(key, FORBIDDEN_DECISION_KEYS)
            self.assertNotIn(f'"{key}"', schema)

    def test_speaker_label_is_an_observation_not_an_identity(self):
        from bkt_web.analysis_result import validate_analysis_result

        document = validate_analysis_result(agriculture())
        speech = next(item for item in document.observations if item.kind == "transcript")
        self.assertEqual(speech.speaker_label, "speaker_00")
        self.assertFalse(hasattr(speech, "speaker_id"))


class TimingTest(unittest.TestCase):
    def test_intervals_may_not_run_past_the_source(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_shot_two")["source_interval"]["end"] = 99
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("INTERVAL_OUT_OF_SOURCE", codes(caught.exception))

    def test_reversed_intervals_are_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_shot_two")["source_interval"] = {"start": 5, "end": 4}
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("INVALID_INTERVAL", codes(caught.exception))

    def test_word_timings_stay_inside_their_observation_and_in_order(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_speech_one")["words"][0]["start"] = 0.0
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("WORD_OUTSIDE_OBSERVATION", codes(caught.exception))

        value = agriculture()
        words = observation(value, "observation_speech_one")["words"]
        words[1], words[2] = words[2], words[1]
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("WORDS_OUT_OF_ORDER", codes(caught.exception))

    def test_track_samples_stay_inside_their_observation_and_in_order(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_track_hand")["samples"][0]["time"] = 0.0
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("SAMPLE_OUTSIDE_OBSERVATION", codes(caught.exception))

        value = agriculture()
        samples = observation(value, "observation_track_hand")["samples"]
        samples[0], samples[2] = samples[2], samples[0]
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("SAMPLES_OUT_OF_ORDER", codes(caught.exception))

    def test_shots_from_one_analyzer_may_not_overlap(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_shot_two")["source_interval"]["start"] = 1.0
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("OVERLAPPING_SHOTS", codes(caught.exception))

    def test_two_analyzers_may_disagree_about_shots(self):
        from bkt_web.analysis_result import validate_analysis_result

        value = agriculture()
        value["analyzers"].append({"analyzer_id": "analyzer_shots.alt", "kind": "shot", "name": "second-opinion", "version": "1.0.0"})
        rival = copy.deepcopy(observation(value, "observation_shot_one"))
        rival.update({"observation_id": "observation_shot_alt", "analyzer_id": "analyzer_shots.alt",
                      "source_interval": {"start": 0, "end": 4.5}, "confidence": 0.6})
        value["observations"].append(rival)
        self.assertEqual(len(validate_analysis_result(value).observations), 13)


class StructureTest(unittest.TestCase):
    def test_duplicate_ids_are_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        value["observations"].append(copy.deepcopy(observation(value, "observation_shot_one")))
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("DUPLICATE_ID", codes(caught.exception))

    def test_unknown_observation_kind_and_unknown_field_are_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_shot_one")["kind"] = "vibe"
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("UNKNOWN_OBSERVATION_KIND", codes(caught.exception))

        value = agriculture()
        observation(value, "observation_shot_one")["mood"] = "warm"
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("UNKNOWN_FIELD", codes(caught.exception))

    def test_path_traversal_in_the_source_uri_is_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        value["source"]["uri"] = "media/../../etc/passwd"
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("PATH_TRAVERSAL", codes(caught.exception))

    def test_non_finite_numbers_are_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_shot_one")["confidence"] = float("inf")
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("NON_FINITE_NUMBER", codes(caught.exception))

    def test_all_issues_are_reported_together_with_json_paths(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        observation(value, "observation_shot_two")["source_interval"]["end"] = 99
        observation(value, "observation_action_pick")["analyzer_id"] = "analyzer_ghost"
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertGreaterEqual(len(caught.exception.issues), 2)
        self.assertTrue(all(item.path.startswith("$") for item in caught.exception.issues))
        self.assertEqual(caught.exception.as_dict()["code"], "ANALYSIS_RESULT_INVALID")


class PartialFailureTest(unittest.TestCase):
    def test_a_failed_analyzer_is_recorded_without_erasing_other_results(self):
        from bkt_web.analysis_result import observations_of, validate_analysis_result

        document = validate_analysis_result(agriculture())
        self.assertEqual([item.reason for item in document.failures], ["unsupported_media"])
        self.assertTrue(observations_of(document, "track"))
        self.assertTrue(observations_of(document, "transcript"))

    def test_a_failure_must_reference_a_declared_analyzer(self):
        from bkt_web.analysis_result import AnalysisValidationError, validate_analysis_result

        value = agriculture()
        value["failures"][0]["analyzer_id"] = "analyzer_ghost"
        with self.assertRaises(AnalysisValidationError) as caught:
            validate_analysis_result(value)
        self.assertIn("UNKNOWN_REFERENCE", codes(caught.exception))


class HelperTest(unittest.TestCase):
    def test_observations_of_and_covered_intervals(self):
        from bkt_web.analysis_result import covered_intervals, observations_of, validate_analysis_result

        document = validate_analysis_result(agriculture())
        self.assertEqual([item.observation_id for item in observations_of(document, "shot")],
                         ["observation_shot_one", "observation_shot_two"])
        self.assertEqual(covered_intervals(document, "shot"), ((0.0, 3.0), (3.0, 6.0)))

    def test_unknown_kind_is_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError, observations_of, validate_analysis_result

        document = validate_analysis_result(agriculture())
        with self.assertRaises(AnalysisValidationError):
            observations_of(document, "vibe")


if __name__ == "__main__":
    unittest.main()
