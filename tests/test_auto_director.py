import copy
import json
import unittest
from pathlib import Path


EXAMPLES = Path(__file__).resolve().parent.parent / "bkt_web" / "schemas" / "examples"
PROFILE_IDS = ("source-faithful", "tiktok-fast", "educational", "product", "news", "meme")


def example(name):
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def migrated():
    from bkt_web.remake_vector import articulation_examples
    from bkt_web.storyboard_migration import migrate_v1_to_v2

    return migrate_v1_to_v2(articulation_examples()[0])


class DirectorProfileTest(unittest.TestCase):
    def test_every_planned_profile_exists_and_validates(self):
        from bkt_web.auto_director import director_profiles, validate_director_profiles

        document = director_profiles()
        validate_director_profiles(document)
        self.assertEqual(sorted(document["profiles"]), sorted(PROFILE_IDS))

    def test_only_the_source_faithful_profile_locks_framing(self):
        from bkt_web.auto_director import director_profiles

        profiles = director_profiles()["profiles"]
        self.assertTrue(profiles["source-faithful"]["source_faithful"])
        self.assertFalse(profiles["source-faithful"]["framing"]["allow_reframe"])
        for profile_id in set(PROFILE_IDS) - {"source-faithful"}:
            self.assertTrue(profiles[profile_id]["framing"]["allow_reframe"])

    def test_profile_documents_are_rejected_when_malformed(self):
        from bkt_web.auto_director import DirectorError, director_profiles, validate_director_profiles

        for mutate in (
            lambda doc: doc.__setitem__("schema", "other/v1"),
            lambda doc: doc["profiles"]["news"]["framing"].__setitem__("default", "dolly"),
            lambda doc: doc["profiles"]["news"]["captions"]["safe_area"]["16:9"].__setitem__("top", 0.9),
            lambda doc: doc["profiles"]["news"]["captions"]["safe_area"].pop("custom"),
            lambda doc: doc["profiles"]["news"]["continuity"].__setitem__("min_shot_seconds", 0),
            lambda doc: doc["profiles"]["news"]["staging"].__setitem__("primary_side", "diagonal"),
        ):
            document = director_profiles()
            mutate(document)
            with self.assertRaises(DirectorError):
                validate_director_profiles(document)

    def test_unknown_profile_is_an_error(self):
        from bkt_web.auto_director import DirectorError, direct

        with self.assertRaises(DirectorError):
            direct(migrated(), profile_id="cinematic")


class DirectorPlanTest(unittest.TestCase):
    def test_plan_is_deterministic_and_does_not_mutate_input(self):
        from bkt_web.auto_director import direct

        value = migrated()
        before = copy.deepcopy(value)
        first = direct(value, profile_id="tiktok-fast")
        second = direct(value, profile_id="tiktok-fast")
        self.assertEqual(first, second)
        self.assertEqual(value, before)

    def test_every_decision_carries_an_explanation_and_confidence(self):
        from bkt_web.auto_director import DECISION_KINDS, direct

        for profile_id in PROFILE_IDS:
            plan = direct(migrated(), profile_id=profile_id)
            self.assertTrue(plan["decisions"])
            for decision in plan["decisions"]:
                self.assertIn(decision["kind"], DECISION_KINDS)
                self.assertTrue(decision["explanation"])
                self.assertGreaterEqual(decision["confidence"], 0.0)
                self.assertLessEqual(decision["confidence"], 1.0)

    def test_renderer_staging_framing_continuity_and_captions_are_all_decided(self):
        from bkt_web.auto_director import direct

        plan = direct(example("talking-head.storyboard-v2.json"), profile_id="news")
        kinds = {decision["kind"] for decision in plan["decisions"]}
        self.assertLessEqual({"renderer", "staging", "framing", "continuity", "caption_safe_zone"}, kinds)

    def test_hard_source_facts_survive_every_profile(self):
        from bkt_web.auto_director import direct, source_facts

        storyboard = example("talking-head.storyboard-v2.json")
        baseline = source_facts(storyboard)
        for profile_id in PROFILE_IDS:
            plan = direct(storyboard, profile_id=profile_id)
            self.assertEqual(plan["source_facts"], baseline)
            timing = next(fact for fact in plan["source_facts"] if fact["kind"] == "scene_timing")
            self.assertEqual(timing["value"], {"start": 0, "end": 4.2})
            speaker = next(fact for fact in plan["source_facts"] if fact["kind"] == "speaker")
            self.assertEqual(speaker["value"]["speaker_id"], "speaker_lan")
            text = next(fact for fact in plan["source_facts"] if fact["kind"] == "dialogue_text")
            self.assertEqual(text["value"]["text"], storyboard["scenes"][0]["audio_events"][0]["text"])

    def test_a_profile_that_wants_a_different_rhythm_reports_instead_of_retiming(self):
        from bkt_web.auto_director import direct

        storyboard = example("talking-head.storyboard-v2.json")
        scene = storyboard["scenes"][0]
        shot = scene["camera"]["shots"][0]
        scene["camera"]["shots"] = [
            {**copy.deepcopy(shot), "shot_id": f"shot_cut_{index}", "start": round(index * 1.05, 2), "end": round((index + 1) * 1.05, 2)}
            for index in range(4)
        ]
        plan = direct(storyboard, profile_id="news")

        rules = {violation["rule"] for violation in plan["violations"]}
        self.assertIn("continuity.min_shot_seconds", rules)
        self.assertIn("continuity.max_cuts_per_second", rules)
        for violation in plan["violations"]:
            self.assertEqual(violation["code"], "SOURCE_FACT_PROTECTED")
            self.assertEqual(violation["resolution"], "rule_dropped")
            self.assertEqual(violation["fact_kind"], "scene_timing")
        timing = next(fact for fact in plan["source_facts"] if fact["kind"] == "scene_timing")
        self.assertEqual(timing["value"], {"start": 0, "end": 4.2})
        continuity = next(decision for decision in plan["decisions"] if decision["kind"] == "continuity")
        self.assertEqual(continuity["value"]["shot_count"], 4)
        self.assertEqual(len(continuity["value"]["shots_below_minimum"]), 4)
        self.assertIn("CUT_RATE_ABOVE_PROFILE", {item["reason_code"] for item in plan["review_items"]})

    def test_source_faithful_keeps_framing_while_a_creative_profile_reframes(self):
        from bkt_web.auto_director import direct

        storyboard = example("talking-head.storyboard-v2.json")
        source_framing = storyboard["scenes"][0]["camera"]["shots"][0]["framing"]

        faithful = next(item for item in direct(storyboard, profile_id="source-faithful")["decisions"] if item["kind"] == "framing")
        self.assertEqual(faithful["value"]["framing"], source_framing)
        self.assertEqual(faithful["rule"], "framing.source_locked")

        meme = next(item for item in direct(storyboard, profile_id="meme")["decisions"] if item["kind"] == "framing")
        self.assertEqual(meme["value"]["source_framing"], source_framing)
        self.assertEqual(meme["value"]["framing"], "extreme_close_up")

    def test_caption_zone_stays_inside_the_frame_and_copies_cues_verbatim(self):
        from bkt_web.auto_director import direct

        storyboard = example("talking-head.storyboard-v2.json")
        event = storyboard["scenes"][0]["audio_events"][0]
        for profile_id in PROFILE_IDS:
            plan = direct(storyboard, profile_id=profile_id)
            self.assertEqual(plan["aspect"], "16:9")
            captions = next(decision for decision in plan["decisions"] if decision["kind"] == "caption_safe_zone")
            box = captions["value"]["box"]
            self.assertGreaterEqual(box["x"], 0)
            self.assertGreaterEqual(box["y"], 0)
            self.assertLessEqual(box["x"] + box["width"], 1)
            self.assertLessEqual(box["y"] + box["height"], 1)
            self.assertEqual(captions["value"]["cues"], [{
                "audio_event_id": event["audio_event_id"],
                "start": event["start"],
                "end": event["end"],
                "speaker_id": event["speaker_id"],
                "text": event["text"],
            }])

    def test_vertical_source_selects_the_vertical_safe_area(self):
        from bkt_web.auto_director import direct, director_profiles

        plan = direct(example("agriculture.storyboard-v2.json"), profile_id="tiktok-fast")
        self.assertEqual(plan["aspect"], "9:16")
        captions = next(decision for decision in plan["decisions"] if decision["kind"] == "caption_safe_zone")
        expected = director_profiles()["profiles"]["tiktok-fast"]["captions"]["safe_area"]["9:16"]
        self.assertEqual(captions["value"]["safe_area"], dict(sorted(expected.items())))

    def test_staging_reports_over_capacity_without_dropping_an_entity(self):
        from bkt_web.auto_director import direct

        plan = direct(migrated(), profile_id="product")
        staging = next(decision for decision in plan["decisions"] if decision["kind"] == "staging")
        scene_entities = {entity["entity_id"] for entity in migrated()["scenes"][0]["entities"]}
        self.assertEqual({item["entity_id"] for item in staging["value"]["placements"]}, scene_entities)

    def test_a_scene_without_a_renderer_becomes_a_review_item(self):
        from bkt_web.auto_director import direct

        value = migrated()
        scene = value["scenes"][0]
        scene["render_requirements"]["required"].append({
            "requirement_id": "requirement:cloth-simulation",
            "capability": "action.cloth_simulation",
            "target_ids": [scene["actions"][0]["action_id"]],
        })
        plan = direct(value, profile_id="tiktok-fast")
        self.assertEqual(plan["status"], "needs-review")
        self.assertIn("RENDERER_NEEDS_REVIEW", {item["reason_code"] for item in plan["review_items"]})
        self.assertEqual(plan["render_plan"]["status"], "needs-review")
        self.assertIsNone(plan["asset_plan"])

    def test_assets_are_resolved_and_recorded_for_a_routable_scene(self):
        from bkt_web.auto_director import direct

        plan = direct(migrated(), profile_id="source-faithful")
        self.assertEqual(plan["status"], "directed")
        assets = [decision for decision in plan["decisions"] if decision["kind"] == "asset"]
        self.assertTrue(assets)
        for decision in assets:
            self.assertEqual(decision["value"]["strategy"], "exact")
            self.assertRegex(decision["value"]["checksum"], r"^sha256:[0-9a-f]{64}$")
            self.assertFalse(decision["requires_approval"])
        self.assertEqual(plan["asset_plan"]["needs_review"], [])
        self.assertEqual(plan["asset_plan"]["source_fallback_request_ids"], [])

    def test_asset_planning_can_be_switched_off(self):
        from bkt_web.auto_director import direct

        plan = direct(migrated(), plan_assets=False)
        self.assertIsNone(plan["asset_plan"])
        self.assertEqual([decision for decision in plan["decisions"] if decision["kind"] == "asset"], [])

    def test_plan_hash_changes_with_the_profile(self):
        from bkt_web.auto_director import direct

        value = migrated()
        hashes = {direct(value, profile_id=profile_id)["plan_hash"] for profile_id in PROFILE_IDS}
        self.assertGreater(len(hashes), 1)


if __name__ == "__main__":
    unittest.main()
