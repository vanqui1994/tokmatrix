import copy
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STAMP = "2026-09-21T02:00:00Z"


def region(x, y, width=0.1, height=0.1):
    return {"space": "normalized_source", "x": x, "y": y, "width": width, "height": height}


def track(observation_id, start, end, boxes, *, category="object", label="thing", confidence=0.9, alternatives=None):
    span = end - start
    step = span / (len(boxes) - 1) if len(boxes) > 1 else 0.0
    entry = {
        "observation_id": observation_id,
        "kind": "track",
        "analyzer_id": "analyzer.vision",
        "source_interval": {"start": start, "end": end},
        "confidence": confidence,
        "evidence_ids": ["evidence.frames"],
        "label": label,
        "category": category,
        "samples": [
            {"time": start + index * step, "region": box, "confidence": confidence}
            for index, box in enumerate(boxes)
        ],
    }
    if alternatives:
        entry["alternatives"] = [{"label": name, "confidence": value} for name, value in alternatives]
    return entry


def shot(observation_id, start, end, index, confidence=0.95):
    return {
        "observation_id": observation_id,
        "kind": "shot",
        "analyzer_id": "analyzer.shots",
        "source_interval": {"start": start, "end": end},
        "confidence": confidence,
        "evidence_ids": ["evidence.frames"],
        "index": index,
        "boundary": "cut",
    }


def transcript(observation_id, start, end, text, *, speaker="speaker.00", confidence=0.88):
    entry = {
        "observation_id": observation_id,
        "kind": "transcript",
        "analyzer_id": "analyzer.speech",
        "source_interval": {"start": start, "end": end},
        "confidence": confidence,
        "evidence_ids": ["evidence.audio"],
        "text": text,
        "language": "en",
    }
    if speaker is not None:
        entry["speaker_label"] = speaker
    return entry


def document(observations, duration=4.0):
    return {
        "schema_version": "1.0.0",
        "analysis_id": "analysis.case",
        "source": {"source_id": "source.case", "sha256": "a" * 64, "media_type": "video/mp4", "width": 1920, "height": 1080},
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
        "duration_seconds": duration,
        "analyzers": [
            {"analyzer_id": "analyzer.vision", "kind": "multi", "name": "fixture-vision", "version": "1.0.0", "ran_at": STAMP},
            {"analyzer_id": "analyzer.shots", "kind": "shot", "name": "fixture-shots", "version": "1.0.0"},
            {"analyzer_id": "analyzer.speech", "kind": "transcript", "name": "fixture-asr", "version": "1.0.0"},
        ],
        "evidence": [
            {"evidence_id": "evidence.frames", "kind": "frame_range", "source_id": "source.case",
             "interval": {"start": 0, "end": duration}},
            {"evidence_id": "evidence.audio", "kind": "audio_range", "source_id": "source.case",
             "interval": {"start": 0, "end": duration}},
        ],
        "observations": copy.deepcopy(observations),
        "failures": [],
    }


def harvest_observations():
    """A hand carries a fruit into a basket, with two static background tracks."""
    times = [index * 0.5 for index in range(9)]
    hand_centers = [
        (0.14, 0.42), (0.24, 0.42), (0.34, 0.42), (0.425, 0.425),
        (0.50, 0.46), (0.58, 0.50), (0.65, 0.55), (0.74, 0.40), (0.80, 0.35),
    ]
    fruit_centers = [
        (0.425, 0.425), (0.425, 0.425), (0.425, 0.425), (0.425, 0.425),
        (0.51, 0.475), (0.59, 0.515), (0.66, 0.565), (0.66, 0.565), (0.66, 0.565),
    ]

    def from_centers(observation_id, label, category, centers, size, **kwargs):
        entry = {
            "observation_id": observation_id,
            "kind": "track",
            "analyzer_id": "analyzer.vision",
            "source_interval": {"start": 0.0, "end": 4.0},
            "confidence": 0.9,
            "evidence_ids": ["evidence.frames"],
            "label": label,
            "category": category,
            "samples": [
                {"time": times[index], "region": region(cx - size / 2, cy - size / 2, size, size), "confidence": 0.9}
                for index, (cx, cy) in enumerate(centers)
            ],
        }
        entry.update(kwargs)
        return entry

    return [
        from_centers("observation.hand", "hand", "hand", hand_centers, 0.08),
        from_centers("observation.fruit", "fruit", "object", fruit_centers, 0.05,
                     alternatives=[{"label": "apple", "confidence": 0.4}, {"label": "tomato", "confidence": 0.45}]),
        from_centers("observation.basket", "basket", "object", [(0.75, 0.62)] * 9, 0.24),
        from_centers("observation.tree", "tree", "object", [(0.15, 0.80)] * 9, 0.10),
        from_centers("observation.post", "post", "object", [(0.90, 0.15)] * 9, 0.06),
        transcript("observation.line", 0.2, 1.4, "This one is ripe."),
    ]


def compile_document(observations, duration=4.0, **kwargs):
    from bkt_web.analysis_compiler import compile_storyboard

    kwargs.setdefault("created_at", STAMP)
    return compile_storyboard(document(observations, duration), **kwargs)


class ValidStoryboardTest(unittest.TestCase):
    def test_the_compiled_project_passes_storyboard_validation(self):
        from bkt_web.universal_storyboard import validate_storyboard_v2

        result = compile_document(harvest_observations())
        self.assertEqual(result.project.schema_version, "2.0.0")
        # Re-validating the emitted dict proves the output is the contract, not
        # just the in-memory model.
        validate_storyboard_v2(result.storyboard)
        self.assertEqual(result.storyboard["project_id"], "project.case")

    def test_scenes_tile_the_source_exactly(self):
        result = compile_document(harvest_observations() + [shot("observation.shot.a", 0.0, 2.5, 0), shot("observation.shot.b", 2.5, 4.0, 1)])
        scenes = result.storyboard["scenes"]
        self.assertEqual([(item["start"], item["end"]) for item in scenes], [(0.0, 2.5), (2.5, 4.0)])
        self.assertEqual([item["scene_id"] for item in scenes], ["scene.shot.a", "scene.shot.b"])

    def test_a_source_without_shots_becomes_one_scene_and_says_so(self):
        result = compile_document(harvest_observations())
        self.assertEqual([item["scene_id"] for item in result.storyboard["scenes"]], ["scene.whole"])
        self.assertIn(
            "no_shot_observations_single_scene_assumed",
            [item["reason"] for item in result.uncertainties],
        )

    def test_a_gap_between_shots_is_filled_and_reported(self):
        result = compile_document(
            harvest_observations() + [shot("observation.shot.a", 0.0, 1.0, 0), shot("observation.shot.b", 2.0, 4.0, 1)],
        )
        scenes = result.storyboard["scenes"]
        self.assertEqual([(item["start"], item["end"]) for item in scenes], [(0.0, 1.0), (1.0, 2.0), (2.0, 4.0)])
        self.assertIn("gap_between_shot_observations", [item["reason"] for item in result.uncertainties])

    def test_every_scene_has_a_camera_that_covers_it(self):
        result = compile_document(harvest_observations())
        for scene in result.storyboard["scenes"]:
            shots = scene["camera"]["shots"]
            self.assertEqual(shots[0]["start"], scene["start"])
            self.assertEqual(shots[-1]["end"], scene["end"])
            for previous, following in zip(shots, shots[1:]):
                self.assertEqual(previous["end"], following["start"])
            # Framing is never inferred, so it is never claimed.
            self.assertEqual({item["framing"] for item in shots}, {"custom"})


class NoInventionTest(unittest.TestCase):
    def test_every_entity_action_and_relation_carries_evidence(self):
        result = compile_document(harvest_observations())
        scene = result.storyboard["scenes"][0]
        self.assertTrue(scene["entities"])
        for group in ("entities", "relations", "actions"):
            for item in scene[group]:
                self.assertIsNotNone(item["analysis"], f"{group} entry without an analysis block")
                self.assertTrue(item["analysis"]["evidence_ids"])
        for item in scene["audio_events"]:
            self.assertTrue(item["analysis"]["evidence_ids"])

    def test_entities_come_only_from_observed_identities(self):
        result = compile_document(harvest_observations())
        scene = result.storyboard["scenes"][0]
        observed_tracks = {"observation.hand", "observation.fruit", "observation.basket", "observation.tree", "observation.post"}
        mapped = {
            track_id
            for item in scene["entities"]
            for track_id in item["attributes"].get("track_ids", [])
        }
        self.assertEqual(mapped, observed_tracks)
        speakers = [item for item in scene["entities"] if item["role"] == "speaker"]
        self.assertEqual([item["label"] for item in speakers], ["speaker.00"])

    def test_an_action_whose_track_has_no_entity_is_skipped_not_faked(self):
        from bkt_web.analysis_compiler import compile_storyboard

        value = document(harvest_observations() + [shot("observation.shot.a", 0.0, 1.0, 0), shot("observation.shot.b", 1.0, 4.0, 1)])
        result = compile_storyboard(value, created_at=STAMP)
        first, second = result.storyboard["scenes"]
        # The carry and the placement happen in the second scene; the first
        # must not borrow them, and its own reach must stay inside it.
        self.assertEqual({item["type"] for item in first["actions"]}, {"reach"})
        self.assertTrue({"carry", "place"} <= {item["type"] for item in second["actions"]})
        for scene in (first, second):
            for action in scene["actions"]:
                self.assertGreaterEqual(action["start"], scene["start"])
                self.assertLessEqual(action["end"], scene["end"])
                self.assertTrue(action["actor_ids"][0].startswith(f"entity.{scene['scene_id'].split('scene.')[1]}."))

    def test_dialogue_without_a_speaker_label_is_skipped(self):
        observations = harvest_observations()[:-1] + [transcript("observation.line", 0.2, 1.4, "Unattributed line.", speaker=None)]
        result = compile_document(observations)
        self.assertEqual(result.storyboard["scenes"][0]["audio_events"], [])
        self.assertEqual(
            [item.as_dict() for item in result.skipped],
            [{"observation_id": "observation.line", "kind": "transcript", "reason": "dialogue_without_speaker_label"}],
        )

    def test_no_constraints_or_requirements_are_invented(self):
        result = compile_document(harvest_observations())
        for scene in result.storyboard["scenes"]:
            self.assertEqual(scene["constraints"], [])
            self.assertEqual(scene["render_requirements"], {"required": [], "preferred": [], "optional": []})
            self.assertIsNone(scene["style"])
            self.assertIsNone(scene["environment"])

    def test_no_renderer_is_chosen(self):
        from bkt_web.analysis_compiler import UNASSIGNED_RENDERER

        plan = compile_document(harvest_observations()).storyboard["render_plan"]
        self.assertEqual(plan["status"], "needs-review")
        self.assertEqual({item["status"] for item in plan["selections"]}, {"needs-review"})
        self.assertEqual({item["renderer_id"] for item in plan["selections"]}, {UNASSIGNED_RENDERER})
        self.assertEqual(plan["fallbacks"], [])
        self.assertIn("routing and direction decision", plan["selections"][0]["explanation"])


class UncertaintyTest(unittest.TestCase):
    def test_a_speaker_label_is_carried_as_an_unresolved_identity(self):
        result = compile_document(harvest_observations())
        speaker = next(item for item in result.storyboard["scenes"][0]["entities"] if item["role"] == "speaker")
        self.assertFalse(speaker["attributes"]["identity_resolved"])
        self.assertEqual(speaker["attributes"]["identity_source"], "diarisation_label")
        self.assertIn("speaker_label_is_not_an_identity", [item["reason"] for item in result.uncertainties])

    def test_competing_labels_survive_into_the_entity(self):
        result = compile_document(harvest_observations())
        fruit = next(
            item for item in result.storyboard["scenes"][0]["entities"]
            if "observation.fruit" in item["attributes"].get("track_ids", [])
        )
        self.assertEqual(
            [item["label"] for item in fruit["attributes"]["label_alternatives"]],
            ["tomato", "apple"],
        )
        self.assertIn("competing_labels_kept", [item["reason"] for item in result.uncertainties])

    def test_confidence_and_review_status_reach_the_storyboard(self):
        result = compile_document(harvest_observations())
        scene = result.storyboard["scenes"][0]
        for item in scene["entities"] + scene["actions"] + scene["relations"]:
            self.assertEqual(item["analysis"]["review_status"], "unreviewed")
            self.assertGreaterEqual(item["analysis"]["confidence"], 0.0)
            self.assertLessEqual(item["analysis"]["confidence"], 1.0)

    def test_reviewable_inferences_are_marked_on_the_action_itself(self):
        result = compile_document(harvest_observations())
        actions = result.storyboard["scenes"][0]["actions"]
        self.assertTrue(actions)
        self.assertTrue(all("review_required" in item["parameters"] for item in actions))
        self.assertTrue(all("basis" in item["parameters"] for item in actions))

    def test_depth_hints_keep_their_review_flag(self):
        result = compile_document(harvest_observations())
        depth = [item for item in result.storyboard["scenes"][0]["relations"] if item["type"] == "in.front.of"]
        if depth:
            self.assertTrue(all(item["attributes"]["review_required"] for item in depth))
            self.assertIn("inference_requires_review", [item["reason"] for item in result.uncertainties])


class DeterminismTest(unittest.TestCase):
    def test_compiling_twice_gives_an_identical_document(self):
        first = compile_document(harvest_observations()).storyboard
        second = compile_document(harvest_observations()).storyboard
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))

    def test_observation_order_does_not_change_the_document(self):
        forward = compile_document(harvest_observations()).storyboard
        backward = compile_document(list(reversed(harvest_observations()))).storyboard
        self.assertEqual(forward, backward)

    def test_the_document_is_json_serialisable(self):
        payload = compile_document(harvest_observations()).storyboard
        self.assertEqual(json.loads(json.dumps(payload)), payload)

    def test_compiling_does_not_mutate_the_analysis(self):
        from bkt_web.analysis_compiler import compile_storyboard

        value = document(harvest_observations())
        before = copy.deepcopy(value)
        compile_storyboard(value, created_at=STAMP)
        self.assertEqual(value, before)

    def test_evidence_travels_into_provenance_unchanged(self):
        result = compile_document(harvest_observations())
        provenance = result.storyboard["provenance"][0]
        self.assertEqual(provenance["kind"], "analysis")
        self.assertEqual(provenance["created_at"], STAMP)
        self.assertEqual(
            [item["evidence_id"] for item in provenance["evidence"]],
            ["evidence.audio", "evidence.frames"],
        )


class ClockTest(unittest.TestCase):
    def test_the_analyzer_timestamp_is_used_when_no_clock_is_given(self):
        from bkt_web.analysis_compiler import compile_storyboard

        result = compile_storyboard(document(harvest_observations()))
        self.assertEqual(result.storyboard["provenance"][0]["created_at"], STAMP)

    def test_a_missing_clock_is_an_error_not_an_invented_time(self):
        from bkt_web.analysis_compiler import CompilerError, compile_storyboard

        value = document(harvest_observations())
        for analyzer in value["analyzers"]:
            analyzer.pop("ran_at", None)
        with self.assertRaisesRegex(CompilerError, "created_at"):
            compile_storyboard(value)


class ValidationTest(unittest.TestCase):
    def test_mismatched_tracking_or_inference_is_rejected(self):
        from bkt_web.analysis_compiler import CompilerError, compile_storyboard
        from bkt_web.action_inference import infer_actions_and_camera
        from bkt_web.entity_tracking import infer_tracking

        other = document(harvest_observations())
        other["analysis_id"] = "analysis.other"
        foreign_tracking = infer_tracking(other)
        with self.assertRaisesRegex(CompilerError, "analysis khác"):
            compile_storyboard(document(harvest_observations()), foreign_tracking, created_at=STAMP)

        value = document(harvest_observations())
        tracking = infer_tracking(value)
        foreign_inference = infer_actions_and_camera(other, foreign_tracking)
        with self.assertRaisesRegex(CompilerError, "analysis khác"):
            compile_storyboard(value, tracking, foreign_inference, created_at=STAMP)

    def test_an_invalid_analysis_document_is_rejected(self):
        from bkt_web.analysis_compiler import compile_storyboard
        from bkt_web.analysis_result import AnalysisValidationError

        value = document([])
        value["observations"] = [{"observation_id": "observation.broken", "kind": "track"}]
        with self.assertRaises(AnalysisValidationError):
            compile_storyboard(value, created_at=STAMP)

    def test_a_project_id_can_be_supplied(self):
        result = compile_document(harvest_observations(), project_id="project.custom")
        self.assertEqual(result.storyboard["project_id"], "project.custom")


class ShippedExampleTest(unittest.TestCase):
    def test_the_agriculture_analysis_example_compiles(self):
        from bkt_web.analysis_compiler import compile_storyboard
        from bkt_web.universal_storyboard import validate_storyboard_v2

        value = json.loads((ROOT / "bkt_web/schemas/examples/agriculture.analysis-v1.json").read_text(encoding="utf-8"))
        result = compile_storyboard(value)
        validate_storyboard_v2(result.storyboard)
        scenes = result.storyboard["scenes"]
        self.assertEqual([(item["start"], item["end"]) for item in scenes], [(0.0, 3.0), (3.0, 6.0)])
        self.assertEqual(result.storyboard["duration_seconds"], 6.0)
        speakers = [item for scene in scenes for item in scene["entities"] if item["role"] == "speaker"]
        self.assertTrue(speakers)
        self.assertTrue(all(not item["attributes"]["identity_resolved"] for item in speakers))

    def test_the_ui_tutorial_analysis_example_compiles(self):
        from bkt_web.analysis_compiler import compile_storyboard
        from bkt_web.universal_storyboard import validate_storyboard_v2

        value = json.loads((ROOT / "bkt_web/schemas/examples/ui-tutorial.analysis-v1.json").read_text(encoding="utf-8"))
        result = compile_storyboard(value, created_at=STAMP)
        validate_storyboard_v2(result.storyboard)
        self.assertEqual(result.storyboard["render_plan"]["status"], "needs-review")


if __name__ == "__main__":
    unittest.main()
