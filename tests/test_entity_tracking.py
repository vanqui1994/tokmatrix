import copy
import json
import unittest


def region(x, y, width=0.1, height=0.1):
    return {"space": "normalized_source", "x": x, "y": y, "width": width, "height": height}


def track(observation_id, start, end, boxes, *, category="object", label="thing", confidence=0.9, evidence="evidence.frames"):
    """A track observation whose samples are evenly spread over its interval."""
    span = end - start
    step = span / (len(boxes) - 1) if len(boxes) > 1 else 0.0
    return {
        "observation_id": observation_id,
        "kind": "track",
        "analyzer_id": "analyzer.vision",
        "source_interval": {"start": start, "end": end},
        "confidence": confidence,
        "evidence_ids": [evidence],
        "label": label,
        "category": category,
        "samples": [
            {"time": start + index * step, "region": box, "confidence": confidence}
            for index, box in enumerate(boxes)
        ],
    }


def pose(observation_id, time, keypoints, *, track_ref=None, confidence=0.8, evidence="evidence.frames"):
    return {
        "observation_id": observation_id,
        "kind": "pose",
        "analyzer_id": "analyzer.vision",
        "source_interval": {"start": time, "end": time},
        "confidence": confidence,
        "evidence_ids": [evidence],
        "track_ref": track_ref,
        "time": time,
        "keypoints": [
            {"name": name, "x": x, "y": y, "confidence": 0.9}
            for name, (x, y) in keypoints.items()
        ],
    }


def document(observations, duration=10.0):
    return {
        "schema_version": "1.0.0",
        "analysis_id": "analysis.case",
        "source": {"source_id": "source.case", "sha256": "a" * 64, "media_type": "video/mp4", "width": 1920, "height": 1080},
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
        "duration_seconds": duration,
        "analyzers": [{"analyzer_id": "analyzer.vision", "kind": "multi", "name": "fixture-vision", "version": "1.0.0"}],
        "evidence": [
            {"evidence_id": "evidence.frames", "kind": "frame_range", "source_id": "source.case",
             "interval": {"start": 0, "end": duration}},
            {"evidence_id": "evidence.second", "kind": "frame_range", "source_id": "source.case",
             "interval": {"start": 0, "end": duration}},
        ],
        "observations": copy.deepcopy(observations),
        "failures": [],
    }


def infer(observations, duration=10.0, **settings):
    from bkt_web.entity_tracking import TrackingSettings, infer_tracking

    return infer_tracking(document(observations, duration), TrackingSettings(**settings) if settings else None)


class IdentityLinkingTest(unittest.TestCase):
    def test_a_person_seen_in_two_shots_becomes_one_identity(self):
        result = infer([
            track("observation.host.a", 0.0, 2.0, [region(0.30, 0.40), region(0.32, 0.41)], category="person", label="host"),
            track("observation.host.b", 2.4, 5.0, [region(0.33, 0.41), region(0.35, 0.42)], category="person", label="host"),
        ])
        self.assertEqual([item.track_ids for item in result.identities], [("observation.host.a", "observation.host.b")])
        identity = result.identities[0]
        self.assertTrue(identity.resolved)
        self.assertEqual(identity.identity_id, "identity.host.a")
        self.assertEqual((identity.start, identity.end), (0.0, 5.0))
        self.assertEqual(identity.confidence, 0.9)
        self.assertEqual(result.ambiguities, ())

    def test_two_equally_plausible_predecessors_are_never_merged(self):
        result = infer([
            track("observation.left", 0.0, 2.0, [region(0.30, 0.40), region(0.30, 0.40)], category="person", label="host"),
            track("observation.right", 0.0, 2.0, [region(0.30, 0.40), region(0.30, 0.40)], category="person", label="host"),
            track("observation.later", 2.2, 4.0, [region(0.30, 0.40), region(0.30, 0.40)], category="person", label="host"),
        ])
        self.assertEqual([len(item.track_ids) for item in result.identities], [1, 1, 1])
        self.assertTrue(all(not item.resolved for item in result.identities if "later" in item.identity_id))
        self.assertEqual([item.reason for item in result.ambiguities], ["competing_links_within_margin"])
        ambiguity = result.ambiguities[0]
        self.assertIn("observation.later", ambiguity.track_ids)
        self.assertEqual(len(ambiguity.candidates), 2)
        self.assertAlmostEqual(ambiguity.candidates[0].score, ambiguity.candidates[1].score)

    def test_a_clear_winner_beats_a_weak_rival(self):
        result = infer([
            track("observation.near", 0.0, 2.0, [region(0.30, 0.40), region(0.30, 0.40)], category="person", label="host"),
            track("observation.far", 0.0, 2.0, [region(0.85, 0.05, 0.03, 0.03)], category="person", label="guest"),
            track("observation.later", 2.2, 4.0, [region(0.31, 0.40), region(0.31, 0.40)], category="person", label="host"),
        ])
        merged = [item for item in result.identities if len(item.track_ids) > 1]
        self.assertEqual([item.track_ids for item in merged], [("observation.near", "observation.later")])
        self.assertEqual(result.ambiguities, ())

    def test_tracks_of_different_categories_never_link(self):
        result = infer([
            track("observation.hand", 0.0, 2.0, [region(0.30, 0.40)], category="hand", label="hand"),
            track("observation.fruit", 2.2, 4.0, [region(0.30, 0.40)], category="object", label="hand"),
        ])
        self.assertEqual([len(item.track_ids) for item in result.identities], [1, 1])
        self.assertEqual(result.ambiguities, ())

    def test_a_low_confidence_track_is_flagged_instead_of_merged(self):
        result = infer([
            track("observation.first", 0.0, 2.0, [region(0.30, 0.40)], category="person", label="host", confidence=0.3),
            track("observation.second", 2.2, 4.0, [region(0.30, 0.40)], category="person", label="host"),
        ])
        self.assertEqual([len(item.track_ids) for item in result.identities], [1, 1])
        self.assertEqual([item.reason for item in result.ambiguities], ["track_confidence_below_threshold"])
        self.assertTrue(all(not item.resolved for item in result.identities))

    def test_one_track_cannot_continue_into_two(self):
        result = infer([
            track("observation.source", 0.0, 2.0, [region(0.30, 0.40)], category="person", label="host"),
            track("observation.branch.a", 2.2, 3.0, [region(0.30, 0.40)], category="person", label="host"),
            track("observation.branch.b", 2.3, 3.5, [region(0.30, 0.40)], category="person", label="host"),
        ])
        reasons = [item.reason for item in result.ambiguities]
        self.assertIn("source_track_already_continued", reasons)
        merged = [item for item in result.identities if len(item.track_ids) > 1]
        self.assertLessEqual(len(merged), 1)

    def test_a_long_gap_is_not_bridged(self):
        result = infer([
            track("observation.first", 0.0, 2.0, [region(0.30, 0.40)], category="person", label="host"),
            track("observation.second", 8.0, 9.0, [region(0.30, 0.40)], category="person", label="host"),
        ])
        self.assertEqual([len(item.track_ids) for item in result.identities], [1, 1])

    def test_a_distant_reappearance_is_not_linked_by_label_alone(self):
        result = infer([
            track("observation.first", 0.0, 2.0, [region(0.05, 0.05, 0.05, 0.05)], category="person", label="host"),
            track("observation.second", 2.2, 4.0, [region(0.90, 0.90, 0.05, 0.05)], category="person", label="host"),
        ])
        self.assertEqual([len(item.track_ids) for item in result.identities], [1, 1])


class RelationInferenceTest(unittest.TestCase):
    def test_touching_boxes_produce_a_touches_relation(self):
        # In contact throughout, but the gap between them keeps changing, so
        # this is contact rather than something being carried.
        result = infer([
            track("observation.a", 0.0, 2.0, [region(0.30, 0.40), region(0.31, 0.40), region(0.32, 0.40)], category="object", label="box"),
            track("observation.b", 0.0, 2.0, [region(0.38, 0.40), region(0.34, 0.40), region(0.30, 0.40)], category="object", label="lid"),
        ])
        touches = result.relations_of("touches")
        self.assertEqual(len(touches), 1)
        self.assertEqual((touches[0].subject_track_id, touches[0].object_track_id), ("observation.a", "observation.b"))
        self.assertEqual(touches[0].basis, "box_contact")
        self.assertGreaterEqual(touches[0].start, 0.0)
        self.assertLessEqual(touches[0].end, 2.0)
        self.assertEqual(sorted(touches[0].evidence_ids), ["evidence.frames"])

    def test_a_hand_carrying_an_object_is_a_holds_relation(self):
        hand = [region(0.30 + index * 0.05, 0.40) for index in range(5)]
        fruit = [region(0.33 + index * 0.05, 0.42, 0.05, 0.05) for index in range(5)]
        result = infer([
            track("observation.hand", 0.0, 2.0, hand, category="hand", label="hand"),
            track("observation.fruit", 0.0, 2.0, fruit, category="object", label="fruit"),
        ])
        holds = result.relations_of("holds")
        self.assertEqual(len(holds), 1)
        self.assertEqual(holds[0].subject_track_id, "observation.hand")
        self.assertEqual(holds[0].object_track_id, "observation.fruit")
        self.assertEqual(holds[0].basis, "contact_and_constant_offset")
        self.assertEqual(result.relations_of("touches"), ())

    def test_two_objects_moving_together_are_attached_not_held(self):
        left = [region(0.20 + index * 0.05, 0.50) for index in range(5)]
        right = [region(0.23 + index * 0.05, 0.52, 0.05, 0.05) for index in range(5)]
        result = infer([
            track("observation.plate", 0.0, 2.0, left, category="object", label="plate"),
            track("observation.logo", 0.0, 2.0, right, category="object", label="logo"),
        ])
        attached = result.relations_of("attached_to")
        self.assertEqual(len(attached), 1)
        self.assertEqual(result.relations_of("holds"), ())
        self.assertEqual(attached[0].subject_track_id, "observation.logo")

    def test_a_contained_object_produces_inside_in_one_direction(self):
        result = infer([
            track("observation.basket", 0.0, 2.0, [region(0.20, 0.20, 0.40, 0.40)] * 3, category="object", label="basket"),
            track("observation.fruit", 0.0, 2.0, [region(0.30, 0.30, 0.05, 0.05)] * 3, category="object", label="fruit"),
        ])
        inside = result.relations_of("inside")
        self.assertEqual(len(inside), 1)
        self.assertEqual(inside[0].subject_track_id, "observation.fruit")
        self.assertEqual(inside[0].object_track_id, "observation.basket")
        self.assertEqual(inside[0].basis, "containment_ratio")

    def test_depth_is_only_ever_a_reviewable_hint(self):
        result = infer([
            track("observation.front", 0.0, 2.0, [region(0.30, 0.50, 0.20, 0.20)] * 3, category="object", label="front"),
            track("observation.back", 0.0, 2.0, [region(0.35, 0.40, 0.20, 0.20)] * 3, category="object", label="back"),
        ])
        depth = result.relations_of("in_front_of")
        self.assertEqual(len(depth), 1)
        self.assertEqual(depth[0].subject_track_id, "observation.front")
        self.assertTrue(depth[0].review_required)
        self.assertLess(depth[0].confidence, 0.5)
        self.assertEqual(depth[0].basis, "lower_edge_heuristic")

    def test_a_momentary_overlap_is_below_the_minimum_duration(self):
        result = infer([
            track("observation.a", 0.0, 2.0, [region(0.10, 0.40), region(0.30, 0.40), region(0.70, 0.40)], category="object", label="a"),
            track("observation.b", 0.0, 2.0, [region(0.32, 0.40)] * 3, category="object", label="b"),
        ], min_relation_seconds=1.5)
        self.assertEqual(result.relations_of("touches"), ())

    def test_gaze_needs_a_facing_cue_and_respects_the_cone(self):
        looker = track("observation.host", 0.0, 2.0, [region(0.10, 0.45)] * 3, category="person", label="host")
        target = track("observation.product", 0.0, 2.0, [region(0.40, 0.45, 0.06, 0.06)] * 3, category="object", label="product")
        behind = track("observation.plant", 0.0, 2.0, [region(0.01, 0.45, 0.02, 0.02)] * 3, category="object", label="plant")
        facing = pose("observation.pose", 1.0, {"eye.left": (0.13, 0.46), "eye.right": (0.17, 0.46), "nose": (0.20, 0.47)},
                      track_ref="observation.host")
        result = infer([looker, target, behind, facing])
        looks = result.relations_of("looks_at")
        self.assertEqual([item.object_track_id for item in looks], ["observation.product"])
        self.assertEqual(looks[0].subject_track_id, "observation.host")
        self.assertEqual(looks[0].basis, "pose_facing_cone")
        self.assertFalse(looks[0].review_required)
        self.assertIn("angle_degrees", looks[0].attributes)

    def test_no_facing_keypoints_means_no_invented_gaze(self):
        looker = track("observation.host", 0.0, 2.0, [region(0.10, 0.45)] * 3, category="person", label="host")
        target = track("observation.product", 0.0, 2.0, [region(0.40, 0.45, 0.06, 0.06)] * 3, category="object", label="product")
        blind = pose("observation.pose", 1.0, {"wrist.right": (0.2, 0.6), "elbow.right": (0.18, 0.7)}, track_ref="observation.host")
        self.assertEqual(infer([looker, target, blind]).relations_of("looks_at"), ())

    def test_gaze_without_a_track_ref_is_marked_for_review(self):
        target = track("observation.product", 0.0, 2.0, [region(0.40, 0.45, 0.06, 0.06)] * 3, category="object", label="product")
        floating = pose("observation.pose", 1.0, {"nose": (0.20, 0.47), "gaze": (0.30, 0.47)})
        looks = infer([target, floating]).relations_of("looks_at")
        self.assertEqual(len(looks), 1)
        self.assertTrue(looks[0].review_required)

    def test_tracks_that_never_overlap_in_time_have_no_relations(self):
        result = infer([
            track("observation.a", 0.0, 1.0, [region(0.30, 0.40)] * 2, category="object", label="a"),
            track("observation.b", 5.0, 6.0, [region(0.30, 0.40)] * 2, category="object", label="b"),
        ])
        self.assertEqual(result.relations, ())


class DeterminismTest(unittest.TestCase):
    def observations(self):
        return [
            track("observation.hand", 0.0, 2.0, [region(0.30 + index * 0.05, 0.40) for index in range(5)], category="hand", label="hand"),
            track("observation.fruit", 0.0, 2.0, [region(0.33 + index * 0.05, 0.42, 0.05, 0.05) for index in range(5)], category="object", label="fruit"),
            track("observation.hand.later", 2.3, 4.0, [region(0.50, 0.40), region(0.52, 0.40)], category="hand", label="hand"),
        ]

    def test_observation_order_does_not_change_the_result(self):
        forward = infer(self.observations()).as_dict()
        backward = infer(list(reversed(self.observations()))).as_dict()
        self.assertEqual(forward, backward)

    def test_running_twice_gives_the_same_result(self):
        self.assertEqual(infer(self.observations()).as_dict(), infer(self.observations()).as_dict())

    def test_the_result_is_json_serialisable_and_records_its_settings(self):
        payload = infer(self.observations()).as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.entity-tracking/v1")
        self.assertEqual(payload["analysis_id"], "analysis.case")
        self.assertEqual(payload["settings"]["link_threshold"], 0.70)

    def test_inference_does_not_mutate_the_document(self):
        from bkt_web.entity_tracking import infer_tracking

        value = document(self.observations())
        before = copy.deepcopy(value)
        infer_tracking(value)
        self.assertEqual(value, before)

    def test_thresholds_change_the_outcome_in_a_declared_way(self):
        observations = [
            track("observation.first", 0.0, 2.0, [region(0.30, 0.40)], category="person", label="host"),
            track("observation.second", 2.2, 4.0, [region(0.45, 0.40)], category="person", label="host"),
        ]
        strict = infer(observations, link_threshold=0.95)
        relaxed = infer(observations, link_threshold=0.50)
        self.assertEqual([len(item.track_ids) for item in strict.identities], [1, 1])
        self.assertEqual([len(item.track_ids) for item in relaxed.identities], [2])


class ValidationTest(unittest.TestCase):
    def test_bad_settings_are_rejected(self):
        from bkt_web.entity_tracking import TrackingError, TrackingSettings

        with self.assertRaisesRegex(TrackingError, "link_threshold"):
            TrackingSettings(link_threshold=1.5)
        with self.assertRaisesRegex(TrackingError, "không được âm"):
            TrackingSettings(touch_distance=-1)
        with self.assertRaisesRegex(TrackingError, "hữu hạn"):
            TrackingSettings(position_scale=float("nan"))
        with self.assertRaisesRegex(TrackingError, "max_link_gap_seconds"):
            TrackingSettings(max_link_gap_seconds=0)

    def test_unknown_relation_type_is_rejected(self):
        from bkt_web.entity_tracking import TrackingError

        with self.assertRaisesRegex(TrackingError, "chưa hỗ trợ"):
            infer([]).relations_of("smells_like")

    def test_an_invalid_analysis_document_is_rejected(self):
        from bkt_web.analysis_result import AnalysisValidationError
        from bkt_web.entity_tracking import infer_tracking

        value = document([])
        value["observations"] = [{"observation_id": "observation.broken", "kind": "track"}]
        with self.assertRaises(AnalysisValidationError):
            infer_tracking(value)

    def test_every_relation_type_in_the_plan_is_supported(self):
        from bkt_web.entity_tracking import RELATION_TYPES

        self.assertEqual(
            set(RELATION_TYPES),
            {"holds", "touches", "looks_at", "inside", "in_front_of", "attached_to"},
        )

    def test_identity_lookup_helper(self):
        result = infer([
            track("observation.host.a", 0.0, 2.0, [region(0.30, 0.40), region(0.32, 0.41)], category="person", label="host"),
            track("observation.host.b", 2.4, 5.0, [region(0.33, 0.41), region(0.35, 0.42)], category="person", label="host"),
        ])
        self.assertEqual(result.identity_of("observation.host.b").identity_id, "identity.host.a")
        self.assertIsNone(result.identity_of("observation.ghost"))


class ShippedExampleTest(unittest.TestCase):
    def test_the_agriculture_example_infers_contact_without_inventing_identity(self):
        import json as _json
        from pathlib import Path

        from bkt_web.entity_tracking import infer_tracking

        root = Path(__file__).resolve().parents[1]
        value = _json.loads((root / "bkt_web/schemas/examples/agriculture.analysis-v1.json").read_text(encoding="utf-8"))
        result = infer_tracking(value)
        self.assertEqual({item.type for item in result.relations}, {"touches", "in_front_of"})
        self.assertEqual(result.ambiguities, ())
        # The fruit's identity is still ambiguous in the source document, and
        # tracking must not upgrade a label into an identity.
        fruit = result.identity_of("observation_track_fruit")
        self.assertEqual(fruit.label, "red round object")
        self.assertEqual(len(fruit.track_ids), 1)


if __name__ == "__main__":
    unittest.main()
