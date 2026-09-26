import copy
import json
import math
import unittest
from pathlib import Path

from bkt_web.universal_storyboard import (
    StoryboardValidationError,
    UniversalStoryboardV2,
    validate_storyboard_v2,
    validate_storyboard_v2_json,
)


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "bkt_web" / "schemas" / "examples"


def load_example(name="agriculture.storyboard-v2.json"):
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def validate_error(data):
    with unittest.TestCase().assertRaises(StoryboardValidationError) as caught:
        validate_storyboard_v2(data)
    return caught.exception


class UniversalStoryboardV2Tests(unittest.TestCase):
    def assert_issue(self, error, code, path=None):
        matches = [issue for issue in error.issues if issue.code == code]
        self.assertTrue(matches, f"missing {code}; got {[item.as_dict() for item in error.issues]}")
        if path is not None:
            self.assertIn(path, [issue.path for issue in matches])

    def test_all_contract_examples_validate_and_input_is_unchanged(self):
        for path in sorted(EXAMPLES.glob("*.storyboard-v2.json")):
            with self.subTest(path=path.name):
                value = json.loads(path.read_text(encoding="utf-8"))
                original = copy.deepcopy(value)
                model = validate_storyboard_v2(value)
                self.assertIsInstance(model, UniversalStoryboardV2)
                self.assertEqual(value, original)

    def test_invalid_input_is_not_mutated(self):
        value = load_example()
        value["scenes"][0]["actions"][0]["target_ids"] = ["missing_target"]
        original = copy.deepcopy(value)
        error = validate_error(value)
        self.assert_issue(error, "UNKNOWN_REFERENCE", "$.scenes[0].actions[0].target_ids[0]")
        self.assertEqual(value, original)

    def test_structural_error_has_stable_code_and_json_path(self):
        value = load_example()
        del value["scenes"][0]["camera"]
        error = validate_error(value)
        self.assert_issue(error, "REQUIRED_FIELD", "$.scenes[0].camera")
        payload = error.as_dict()
        self.assertEqual(payload["code"], "STORYBOARD_V2_INVALID")
        self.assertEqual(payload["errors"][0]["path"], "$.scenes[0].camera")

    def test_rejects_nan_and_infinity_at_any_depth(self):
        for value, path in ((math.nan, "$.scenes[0].actions[0].parameters.value"), (math.inf, "$.scenes[0].actions[0].parameters.value")):
            with self.subTest(value=value):
                data = load_example()
                data["scenes"][0]["actions"][0].setdefault("parameters", {})["value"] = value
                error = validate_error(data)
                self.assert_issue(error, "NON_FINITE_NUMBER", path)

    def test_strict_json_rejects_nonstandard_numbers(self):
        raw = (EXAMPLES / "agriculture.storyboard-v2.json").read_text(encoding="utf-8")
        raw = raw.replace('"duration_seconds": 6', '"duration_seconds": NaN', 1)
        with self.assertRaises(StoryboardValidationError) as caught:
            validate_storyboard_v2_json(raw)
        self.assert_issue(caught.exception, "INVALID_JSON", "$")

    def test_numeric_fields_do_not_coerce_strings_or_booleans(self):
        for value in ("6", True):
            with self.subTest(value=value):
                data = load_example()
                data["duration_seconds"] = value
                self.assert_issue(validate_error(data), "INVALID_TYPE", "$.duration_seconds")

    def test_rejects_path_traversal_plain_encoded_and_windows(self):
        for uri in ("../private/video.mp4", "assets/%2e%2e/private.mp4", "assets\\..\\private.mp4"):
            with self.subTest(uri=uri):
                data = load_example()
                data["source"]["uri"] = uri
                self.assert_issue(validate_error(data), "PATH_TRAVERSAL", "$.source.uri")

    def test_global_duplicate_id_is_rejected(self):
        data = load_example()
        data["scenes"][0]["entities"][1]["entity_id"] = "farmer_01"
        error = validate_error(data)
        self.assert_issue(error, "DUPLICATE_ID", "$.scenes[0].entities[1].entity_id")

    def test_unknown_reference_and_type_mismatch_are_distinct(self):
        data = load_example()
        data["scenes"][0]["actions"][0]["actor_ids"] = ["missing_actor"]
        error = validate_error(data)
        self.assert_issue(error, "UNKNOWN_REFERENCE", "$.scenes[0].actions[0].actor_ids[0]")

        data = load_example()
        data["scenes"][0]["actions"][0]["actor_ids"] = ["action_detach"]
        error = validate_error(data)
        self.assert_issue(error, "REFERENCE_TYPE_MISMATCH", "$.scenes[0].actions[0].actor_ids[0]")

    def test_invalid_reference_id_is_rejected_before_lookup(self):
        data = load_example()
        data["scenes"][0]["actions"][0]["actor_ids"] = ["../../actor"]
        error = validate_error(data)
        self.assert_issue(error, "INVALID_ID", "$.scenes[0].actions[0].actor_ids[0]")

    def test_child_interval_must_be_inside_scene(self):
        data = load_example()
        data["scenes"][0]["actions"][0]["end"] = 7
        error = validate_error(data)
        self.assert_issue(error, "INTERVAL_OUT_OF_PARENT", "$.scenes[0].actions[0]")
        self.assert_issue(error, "INTERVAL_OUT_OF_PROJECT", "$.scenes[0].actions[0]")

    def test_start_must_precede_end(self):
        data = load_example()
        data["scenes"][0]["actions"][0]["start"] = 2
        data["scenes"][0]["actions"][0]["end"] = 2
        self.assert_issue(validate_error(data), "INVALID_INTERVAL", "$.scenes[0].actions[0]")

    def test_component_parent_cycle_is_rejected(self):
        data = load_example()
        components = data["scenes"][0]["entities"][0]["components"]
        components[0]["parent_component_id"] = components[1]["component_id"]
        components[1]["parent_component_id"] = components[0]["component_id"]
        self.assert_issue(validate_error(data), "COMPONENT_CYCLE", "$.scenes[0].entities[0].components")

    def test_component_parent_must_be_in_same_entity(self):
        data = load_example()
        data["scenes"][0]["entities"][0]["components"][1]["parent_component_id"] = "tomato_01_body"
        error = validate_error(data)
        self.assert_issue(error, "COMPONENT_PARENT_OUTSIDE_ENTITY", "$.scenes[0].entities[0].components[1].parent_component_id")

    def test_attachment_relation_cycle_is_rejected(self):
        data = load_example()
        data["scenes"][0]["relations"] = [
            {"relation_id": "relation_attach_a", "type": "attached_to", "subject_id": "tomato_01", "object_id": "basket_01", "start": 0, "end": 6, "provenance_id": "provenance_analysis"},
            {"relation_id": "relation_attach_b", "type": "attached_to", "subject_id": "basket_01", "object_id": "tomato_01", "start": 0, "end": 6, "provenance_id": "provenance_analysis"},
        ]
        self.assert_issue(validate_error(data), "ATTACHMENT_CYCLE", "$.scenes[0].relations")

    def test_scene_gap_overlap_and_end_coverage_are_rejected(self):
        first = load_example()["scenes"][0]
        first["end"] = 3
        first["camera"]["shots"][0]["end"] = 3
        for group in ("relations", "actions", "constraints"):
            first[group] = []
        first["render_requirements"] = {"required": [], "preferred": [], "optional": []}
        second = copy.deepcopy(first)
        second["scene_id"] = "scene_second"
        second["start"] = 4
        second["end"] = 6
        second["camera"]["camera_id"] = "camera_second"
        second["camera"]["shots"][0]["shot_id"] = "shot_second"
        second["camera"]["shots"][0]["start"] = 4
        second["camera"]["shots"][0]["end"] = 6
        # Remove nested objects to keep all IDs globally unique in this focused test.
        second["entities"] = []
        data = load_example()
        data["scenes"] = [first, second]
        data["tracks"] = []
        data["render_plan"] = {
            "render_plan_id": "render_plan_agriculture",
            "status": "draft",
            "selections": [
                {"selection_id": "selection_first", "scene_id": "scene_harvest", "start": 0, "end": 3, "renderer_id": "renderer_test", "renderer_version": "1.0.0", "status": "selected", "satisfied_requirement_ids": [], "fallback_ids": []},
                {"selection_id": "selection_second", "scene_id": "scene_second", "start": 4, "end": 6, "renderer_id": "renderer_test", "renderer_version": "1.0.0", "status": "selected", "satisfied_requirement_ids": [], "fallback_ids": []},
            ],
            "fallbacks": [],
        }
        self.assert_issue(validate_error(data), "SCENE_GAP", "$.scenes[1].start")

        data["scenes"][1]["start"] = 2.5
        data["scenes"][1]["camera"]["shots"][0]["start"] = 2.5
        data["render_plan"]["selections"][1]["start"] = 2.5
        self.assert_issue(validate_error(data), "SCENE_OVERLAP", "$.scenes[1].start")

        data["scenes"] = [first]
        data["render_plan"]["selections"] = data["render_plan"]["selections"][:1]
        self.assert_issue(validate_error(data), "SCENE_COVERAGE_END", "$.scenes")

    def test_requirement_cannot_appear_in_multiple_tiers(self):
        data = load_example()
        duplicate = copy.deepcopy(data["scenes"][0]["render_requirements"]["required"][0])
        data["scenes"][0]["render_requirements"]["preferred"].append(duplicate)
        error = validate_error(data)
        self.assert_issue(error, "REQUIREMENT_TIER_CONFLICT", "$.scenes[0].render_requirements.preferred[1].requirement_id")

    def test_selected_route_must_satisfy_every_required_requirement(self):
        data = load_example()
        data["render_plan"]["selections"][0]["satisfied_requirement_ids"] = []
        error = validate_error(data)
        self.assert_issue(error, "HARD_REQUIREMENT_UNSATISFIED", "$.render_plan.selections[0].satisfied_requirement_ids")

    def test_needs_review_requires_approval_fallback_for_missing_hard_requirement(self):
        data = load_example("ui-tutorial.storyboard-v2.json")
        data["render_plan"]["selections"][0]["fallback_ids"] = []
        error = validate_error(data)
        self.assert_issue(error, "HARD_REQUIREMENT_FALLBACK_MISSING", "$.render_plan.selections[0].fallback_ids")

    def test_source_media_fallback_requires_approval(self):
        data = load_example("ui-tutorial.storyboard-v2.json")
        data["render_plan"]["fallbacks"][0]["approval_required"] = False
        error = validate_error(data)
        self.assert_issue(error, "SOURCE_MEDIA_APPROVAL_REQUIRED", "$.render_plan.fallbacks[0].approval_required")

    def test_plan_status_and_selection_status_must_agree(self):
        data = load_example("ui-tutorial.storyboard-v2.json")
        data["render_plan"]["status"] = "routable"
        error = validate_error(data)
        self.assert_issue(error, "PLAN_STATUS_CONFLICT", "$.render_plan.status")
        self.assert_issue(error, "ROUTABLE_SCENE_NOT_SELECTED", "$.scenes[0].scene_id")

    def test_renderer_selections_must_cover_scene(self):
        data = load_example()
        data["render_plan"]["selections"][0]["end"] = 5
        error = validate_error(data)
        self.assert_issue(error, "ROUTE_COVERAGE_GAP", "$.scenes[0].scene_id")

    def test_track_interval_must_match_canonical_target(self):
        data = load_example()
        data["tracks"][0]["items"][0]["end"] = 5
        error = validate_error(data)
        self.assert_issue(error, "TRACK_TIME_MISMATCH", "$.tracks[0].items[0]")

    def test_dialogue_requires_valid_entity_speaker(self):
        data = load_example("talking-head.storyboard-v2.json")
        data["scenes"][0]["audio_events"][0].pop("speaker_id")
        error = validate_error(data)
        self.assert_issue(error, "DIALOGUE_SPEAKER_REQUIRED", "$.scenes[0].audio_events[0].speaker_id")

        data = load_example("talking-head.storyboard-v2.json")
        data["scenes"][0]["audio_events"][0]["speaker_id"] = "action_speak_intro"
        error = validate_error(data)
        self.assert_issue(error, "REFERENCE_TYPE_MISMATCH", "$.scenes[0].audio_events[0].speaker_id")

    def test_evidence_and_provenance_references_are_checked(self):
        data = load_example()
        data["scenes"][0]["analysis"]["evidence_ids"] = ["missing_evidence"]
        self.assert_issue(validate_error(data), "UNKNOWN_REFERENCE", "$.scenes[0].analysis.evidence_ids[0]")

        data = load_example()
        data["scenes"][0]["provenance_id"] = "evidence_harvest_frames"
        self.assert_issue(validate_error(data), "REFERENCE_TYPE_MISMATCH", "$.scenes[0].provenance_id")


if __name__ == "__main__":
    unittest.main()
