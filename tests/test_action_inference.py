import copy
import json
import unittest


def region(x, y, width=0.1, height=0.1):
    return {"space": "normalized_source", "x": x, "y": y, "width": width, "height": height}


def track(observation_id, start, end, boxes, *, category="object", label="thing", confidence=0.9):
    span = end - start
    step = span / (len(boxes) - 1) if len(boxes) > 1 else 0.0
    return {
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


def pose(observation_id, time, keypoints, *, track_ref=None, confidence=0.9):
    return {
        "observation_id": observation_id,
        "kind": "pose",
        "analyzer_id": "analyzer.vision",
        "source_interval": {"start": time, "end": time},
        "confidence": confidence,
        "evidence_ids": ["evidence.frames"],
        "track_ref": track_ref,
        "time": time,
        "keypoints": [{"name": name, "x": x, "y": y, "confidence": 0.9} for name, (x, y) in keypoints.items()],
    }


def document(observations, duration=10.0):
    return {
        "schema_version": "1.0.0",
        "analysis_id": "analysis.case",
        "source": {"source_id": "source.case", "sha256": "a" * 64, "media_type": "video/mp4", "width": 1920, "height": 1080},
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
        "duration_seconds": duration,
        "analyzers": [{"analyzer_id": "analyzer.vision", "kind": "multi", "name": "fixture-vision", "version": "1.0.0"}],
        "evidence": [{"evidence_id": "evidence.frames", "kind": "frame_range", "source_id": "source.case",
                      "interval": {"start": 0, "end": duration}}],
        "observations": copy.deepcopy(observations),
        "failures": [],
    }


def infer(observations, duration=10.0, **settings):
    from bkt_web.action_inference import InferenceSettings, infer_actions_and_camera

    return infer_actions_and_camera(document(observations, duration), None, InferenceSettings(**settings) if settings else None)


def steps_of(start, end, count, x_at, y_at, size=0.1):
    """A track whose box position is given by two functions of the step index."""
    return [region(x_at(index), y_at(index), size, size) for index in range(count)]


def pan_scene(shift=0.06, count=5):
    """Two unrelated objects that both slide the same way: the camera panned."""
    return [
        track("observation.a", 0.0, 2.0, steps_of(0, 2, count, lambda i: 0.10 + i * shift, lambda i: 0.20)),
        track("observation.b", 0.0, 2.0, steps_of(0, 2, count, lambda i: 0.60 + i * shift, lambda i: 0.70)),
    ]


class CameraSeparationTest(unittest.TestCase):
    def test_everything_sliding_together_is_read_as_a_pan(self):
        result = infer(pan_scene())
        self.assertEqual([item.movement for item in result.camera], ["pan"])
        segment = result.camera[0]
        self.assertGreater(segment.magnitude, 0.2)
        self.assertAlmostEqual(segment.direction_degrees, 0.0)
        self.assertEqual(segment.basis, "median_track_motion")
        self.assertFalse(segment.review_required)

    def test_a_pan_is_not_mistaken_for_object_motion(self):
        result = infer(pan_scene())
        self.assertEqual(result.motions, ())
        self.assertEqual(result.actions, ())

    def test_vertical_agreement_is_a_tilt(self):
        result = infer([
            track("observation.a", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.10, lambda i: 0.20 + i * 0.06)),
            track("observation.b", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.60, lambda i: 0.50 + i * 0.06)),
        ])
        self.assertEqual([item.movement for item in result.camera], ["tilt"])
        self.assertAlmostEqual(result.camera[0].direction_degrees, 90.0)

    def test_one_object_moving_while_the_rest_hold_still_is_object_motion(self):
        result = infer([
            track("observation.mover", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.10 + i * 0.10, lambda i: 0.20)),
            track("observation.still", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.60, lambda i: 0.70)),
            track("observation.also.still", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.80, lambda i: 0.30)),
        ])
        self.assertEqual({item.movement for item in result.camera}, {"static"})
        self.assertEqual([item.track_id for item in result.motions], ["observation.mover"])

    def test_residual_motion_removes_the_camera_from_an_objects_path(self):
        # The object moves 0.10 per step while the camera pans 0.06 the other
        # way; what is left after compensation is the object's own motion.
        drifting = [
            track("observation.mover", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.10 + i * 0.16, lambda i: 0.20)),
            track("observation.b", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.50 + i * 0.06, lambda i: 0.70)),
            track("observation.c", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.70 + i * 0.06, lambda i: 0.30)),
        ]
        result = infer(drifting)
        self.assertEqual([item.movement for item in result.camera], ["pan"])
        moved = {item.track_id: item.displacement for item in result.motions}
        self.assertEqual(list(moved), ["observation.mover"])
        self.assertAlmostEqual(moved["observation.mover"], 0.40, places=6)

    def test_an_agreed_scale_change_is_a_zoom(self):
        result = infer([
            track("observation.a", 0.0, 2.0, [region(0.30, 0.30, 0.10 + i * 0.03, 0.10 + i * 0.03) for i in range(5)]),
            track("observation.b", 0.0, 2.0, [region(0.60, 0.60, 0.10 + i * 0.03, 0.10 + i * 0.03) for i in range(5)]),
        ])
        self.assertEqual([item.movement for item in result.camera], ["zoom"])
        self.assertIsNone(result.camera[0].direction_degrees)
        self.assertGreater(result.camera[0].magnitude, 0.0)

    def test_one_object_growing_alone_is_not_a_zoom(self):
        result = infer([
            track("observation.approaching", 0.0, 2.0, [region(0.30, 0.30, 0.10 + i * 0.03, 0.10 + i * 0.03) for i in range(5)]),
            track("observation.still", 0.0, 2.0, [region(0.60, 0.60) for _ in range(5)]),
        ])
        self.assertEqual({item.movement for item in result.camera}, {"static"})

    def test_a_single_track_cannot_separate_camera_from_object(self):
        result = infer([
            track("observation.only", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.10 + i * 0.10, lambda i: 0.20)),
        ])
        self.assertEqual([item.movement for item in result.camera], ["unknown"])
        self.assertTrue(result.camera[0].review_required)
        self.assertEqual(result.camera[0].confidence, 0.0)
        self.assertEqual(result.camera[0].basis, "single_track_not_separable")
        self.assertEqual(
            [item.reason for item in result.review_items],
            ["camera_motion_not_separable_from_object_motion"],
        )


def harvest_scene(**kwargs):
    """A hand reaches a fruit, grips it, carries it into a basket and lets go.

    Two static background tracks stand in for the rest of the frame, so the
    camera estimate has a still majority to work from.
    """
    times = [index * 0.5 for index in range(9)]
    hand_centers = [
        (0.14, 0.42), (0.24, 0.42), (0.34, 0.42), (0.425, 0.425),
        (0.50, 0.46), (0.58, 0.50), (0.65, 0.55), (0.74, 0.40), (0.80, 0.35),
    ]
    fruit_centers = [
        (0.425, 0.425), (0.425, 0.425), (0.425, 0.425), (0.425, 0.425),
        # Carried: a constant offset from the hand until it is let go.
        (0.51, 0.475), (0.59, 0.515), (0.66, 0.565), (0.66, 0.565), (0.66, 0.565),
    ]

    def from_centers(observation_id, label, category, centers, size):
        return {
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

    return infer([
        from_centers("observation.hand", "hand", "hand", hand_centers, 0.08),
        from_centers("observation.fruit", "fruit", "object", fruit_centers, 0.05),
        from_centers("observation.basket", "basket", "object", [(0.75, 0.62)] * 9, 0.24),
        from_centers("observation.tree", "tree", "object", [(0.15, 0.80)] * 9, 0.10),
        from_centers("observation.post", "post", "object", [(0.90, 0.15)] * 9, 0.06),
    ], **kwargs)


class ActionInferenceTest(unittest.TestCase):
    def test_every_action_has_an_actor_a_target_a_span_and_evidence(self):
        result = harvest_scene()
        self.assertTrue(result.actions)
        for action in result.actions:
            self.assertTrue(action.actor_track_id)
            self.assertTrue(action.target_track_id)
            self.assertLessEqual(action.start, action.end)
            self.assertTrue(action.evidence_ids)
            self.assertIn(action.type, ("carry", "grip", "look_at", "place", "reach", "release"))

    def test_the_harvest_sequence_is_recovered_in_order(self):
        result = harvest_scene()
        kinds = [item.type for item in result.actions]
        self.assertIn("grip", kinds)
        self.assertIn("carry", kinds)
        self.assertEqual(kinds, sorted(kinds, key=lambda kind: [item.type for item in result.actions].index(kind)))
        grip = result.actions_of("grip")[0]
        self.assertEqual((grip.actor_track_id, grip.target_track_id), ("observation.hand", "observation.fruit"))
        carry = result.actions_of("carry")[0]
        self.assertEqual(carry.basis, "held_with_residual_motion")
        self.assertLessEqual(grip.end, carry.end)

    def test_a_reach_is_only_claimed_when_the_distance_actually_shrinks(self):
        result = harvest_scene()
        reaches = result.actions_of("reach")
        self.assertEqual(len(reaches), 1)
        reach = reaches[0]
        self.assertEqual(reach.basis, "residual_approach")
        self.assertLess(reach.attributes["distance_after"], reach.attributes["distance_before"])
        self.assertLessEqual(reach.end, result.actions_of("grip")[0].end)

    def test_a_hold_that_ends_inside_a_container_is_a_place(self):
        result = harvest_scene()
        places = result.actions_of("place")
        self.assertEqual(len(places), 1)
        self.assertEqual(places[0].target_track_id, "observation.basket")
        self.assertEqual(places[0].attributes["released_track_id"], "observation.fruit")
        self.assertEqual(places[0].basis, "hold_ends_in_containment")
        self.assertEqual(result.actions_of("release"), ())

    def test_a_hold_that_ends_in_the_open_is_a_release(self):
        hand = track("observation.hand", 0.0, 2.0, [region(0.10 + i * 0.05, 0.40, 0.08, 0.08) for i in range(5)], category="hand", label="hand")
        fruit = track("observation.fruit", 0.0, 2.0, [region(0.13 + i * 0.05, 0.42, 0.05, 0.05) for i in range(5)], label="fruit")
        far = track("observation.wall", 0.0, 2.0, [region(0.90, 0.05, 0.05, 0.05) for _ in range(5)], label="wall")
        result = infer([hand, fruit, far])
        self.assertEqual([item.type for item in result.actions_of("release")], ["release"])
        self.assertEqual(result.actions_of("place"), ())
        self.assertEqual(result.actions_of("release")[0].basis, "holds_offset")

    def test_gaze_becomes_a_look_at_action(self):
        looker = track("observation.host", 0.0, 2.0, [region(0.10, 0.45)] * 3, category="person", label="host")
        target = track("observation.product", 0.0, 2.0, [region(0.40, 0.45, 0.06, 0.06)] * 3, label="product")
        facing = pose("observation.pose", 1.0, {"eye.left": (0.13, 0.46), "eye.right": (0.17, 0.46), "nose": (0.20, 0.47)},
                      track_ref="observation.host")
        result = infer([looker, target, facing])
        looks = result.actions_of("look_at")
        self.assertEqual(len(looks), 1)
        self.assertEqual((looks[0].actor_track_id, looks[0].target_track_id), ("observation.host", "observation.product"))

    def test_motion_without_a_counterpart_is_not_an_action(self):
        result = infer([
            track("observation.mover", 0.0, 2.0, steps_of(0, 2, 5, lambda i: 0.05 + i * 0.10, lambda i: 0.10)),
            track("observation.still", 0.0, 2.0, [region(0.80, 0.80)] * 5),
            track("observation.also.still", 0.0, 2.0, [region(0.60, 0.10)] * 5),
        ])
        self.assertEqual(result.actions, ())
        self.assertEqual([item.track_id for item in result.motions], ["observation.mover"])


class ReviewTest(unittest.TestCase):
    def test_low_confidence_actions_become_review_items(self):
        result = harvest_scene(review_threshold=0.99)
        self.assertTrue(result.actions)
        self.assertTrue(all(item.review_required for item in result.actions))
        reasons = {item.reason for item in result.review_items if item.kind == "action"}
        self.assertEqual(reasons, {"confidence_below_threshold"})
        for action in result.actions:
            self.assertIn(f"review.{action.action_id}", [item.review_id for item in result.review_items])

    def test_confident_actions_do_not_raise_review_items(self):
        result = harvest_scene(review_threshold=0.1)
        self.assertTrue(result.actions)
        self.assertFalse(any(item.review_required for item in result.actions))
        self.assertEqual([item for item in result.review_items if item.kind == "action"], [])

    def test_an_unresolved_identity_puts_its_actions_under_review(self):
        # Two equally plausible predecessors leave the later hand unresolved.
        hand_a = track("observation.hand.a", 0.0, 1.0, [region(0.10, 0.40, 0.08, 0.08)] * 2, category="hand", label="hand")
        hand_b = track("observation.hand.b", 0.0, 1.0, [region(0.10, 0.40, 0.08, 0.08)] * 2, category="hand", label="hand")
        hand_c = track("observation.hand.c", 1.2, 3.0, [region(0.10 + i * 0.05, 0.40, 0.08, 0.08) for i in range(5)], category="hand", label="hand")
        fruit = track("observation.fruit", 1.2, 3.0, [region(0.13 + i * 0.05, 0.42, 0.05, 0.05) for i in range(5)], label="fruit")
        result = infer([hand_a, hand_b, hand_c, fruit])
        self.assertTrue(result.actions)
        self.assertTrue(all(item.review_required for item in result.actions))
        self.assertIn("actor_or_target_identity_unresolved", {item.reason for item in result.review_items if item.kind == "action"})
        self.assertIn("competing_links_within_margin", {item.reason for item in result.review_items if item.kind == "identity"})

    def test_reviewable_relations_propagate_into_the_actions_built_on_them(self):
        from bkt_web.action_inference import infer_actions_and_camera
        from bkt_web.entity_tracking import infer_tracking

        value = document([
            track("observation.host", 0.0, 2.0, [region(0.10, 0.45)] * 3, category="person", label="host"),
            track("observation.product", 0.0, 2.0, [region(0.40, 0.45, 0.06, 0.06)] * 3, label="product"),
            pose("observation.pose", 1.0, {"nose": (0.20, 0.47), "gaze": (0.30, 0.47)}),
        ])
        tracking = infer_tracking(value)
        self.assertTrue(tracking.relations_of("looks_at")[0].review_required)
        result = infer_actions_and_camera(value, tracking)
        looks = result.actions_of("look_at")
        self.assertTrue(looks[0].review_required)
        self.assertIn("derived_from_reviewable_relation", {item.reason for item in result.review_items if item.kind == "action"})


class DeterminismTest(unittest.TestCase):
    def observations(self):
        return [
            track("observation.hand", 0.0, 2.0, [region(0.10 + i * 0.05, 0.40, 0.08, 0.08) for i in range(5)], category="hand", label="hand"),
            track("observation.fruit", 0.0, 2.0, [region(0.13 + i * 0.05, 0.42, 0.05, 0.05) for i in range(5)], label="fruit"),
            track("observation.wall", 0.0, 2.0, [region(0.90, 0.05, 0.05, 0.05)] * 5, label="wall"),
        ]

    def test_observation_order_does_not_change_the_result(self):
        self.assertEqual(infer(self.observations()).as_dict(), infer(list(reversed(self.observations()))).as_dict())

    def test_running_twice_gives_the_same_result(self):
        self.assertEqual(infer(self.observations()).as_dict(), infer(self.observations()).as_dict())

    def test_the_result_is_json_serialisable_and_echoes_its_settings(self):
        payload = infer(self.observations()).as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.action-inference/v1")
        self.assertEqual(payload["settings"]["review_threshold"], 0.60)

    def test_inference_does_not_mutate_the_document(self):
        from bkt_web.action_inference import infer_actions_and_camera

        value = document(self.observations())
        before = copy.deepcopy(value)
        infer_actions_and_camera(value)
        self.assertEqual(value, before)


class ValidationTest(unittest.TestCase):
    def test_bad_settings_are_rejected(self):
        from bkt_web.action_inference import InferenceError, InferenceSettings

        with self.assertRaisesRegex(InferenceError, "review_threshold"):
            InferenceSettings(review_threshold=2)
        with self.assertRaisesRegex(InferenceError, "camera_min_tracks"):
            InferenceSettings(camera_min_tracks=0)
        with self.assertRaisesRegex(InferenceError, "hữu hạn"):
            InferenceSettings(min_motion_per_second=float("inf"))
        with self.assertRaisesRegex(InferenceError, "không được âm"):
            InferenceSettings(release_window_seconds=-1)

    def test_unknown_action_type_is_rejected(self):
        from bkt_web.action_inference import InferenceError

        with self.assertRaisesRegex(InferenceError, "chưa hỗ trợ"):
            infer([]).actions_of("teleport")

    def test_a_tracking_result_from_another_analysis_is_rejected(self):
        from bkt_web.action_inference import InferenceError, infer_actions_and_camera
        from bkt_web.entity_tracking import infer_tracking

        other = document([track("observation.a", 0.0, 1.0, [region(0.1, 0.1)] * 2)])
        other["analysis_id"] = "analysis.other"
        tracking = infer_tracking(other)
        with self.assertRaisesRegex(InferenceError, "analysis khác"):
            infer_actions_and_camera(document([track("observation.a", 0.0, 1.0, [region(0.1, 0.1)] * 2)]), tracking)

    def test_an_invalid_analysis_document_is_rejected(self):
        from bkt_web.action_inference import infer_actions_and_camera
        from bkt_web.analysis_result import AnalysisValidationError

        value = document([])
        value["observations"] = [{"observation_id": "observation.broken", "kind": "track"}]
        with self.assertRaises(AnalysisValidationError):
            infer_actions_and_camera(value)


class ShippedExampleTest(unittest.TestCase):
    def test_the_agriculture_example_reports_a_static_camera_and_no_invented_actions(self):
        from pathlib import Path

        from bkt_web.action_inference import infer_actions_and_camera

        root = Path(__file__).resolve().parents[1]
        value = json.loads((root / "bkt_web/schemas/examples/agriculture.analysis-v1.json").read_text(encoding="utf-8"))
        result = infer_actions_and_camera(value)
        self.assertEqual({item.movement for item in result.camera}, {"static"})
        # The clip only shows contact, never a hold, so no grip is claimed.
        self.assertEqual(result.actions, ())
        self.assertEqual([item.track_id for item in result.motions], ["observation_track_hand"])


if __name__ == "__main__":
    unittest.main()
