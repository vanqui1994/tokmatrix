import copy
import json
import unittest


PROVENANCE = {
    "provenance_id": "provenance.human",
    "kind": "human",
    "created_at": "2026-09-21T02:00:00Z",
    "agent": "fixture",
    "source_refs": ["source.case"],
    "evidence": [{
        "evidence_id": "evidence.frames",
        "kind": "frame_range",
        "source_id": "source.case",
        "interval": {"start": 0, "end": 6},
    }],
}


def entity(entity_id, kind="person", label=None, role="observed"):
    return {
        "entity_id": entity_id,
        "kind": kind,
        "label": label or entity_id.split(".")[-1],
        "role": role,
        "components": [{"component_id": f"{entity_id}.body", "kind": "body", "state": "visible", "anchors": []}],
        "attributes": {},
        "provenance_id": "provenance.human",
    }


def action(action_id, kind, actor, target, start, end):
    return {
        "action_id": action_id,
        "type": kind,
        "actor_ids": [actor],
        "target_ids": [target],
        "start": start,
        "end": end,
        "parameters": {},
        "provenance_id": "provenance.human",
    }


def dialogue(audio_event_id, speaker, text, start, end):
    return {
        "audio_event_id": audio_event_id,
        "kind": "dialogue",
        "start": start,
        "end": end,
        "speaker_id": speaker,
        "text": text,
        "language": "en",
        "provenance_id": "provenance.human",
    }


def scene(scene_id, start, end, entities, actions=(), audio_events=()):
    return {
        "scene_id": scene_id,
        "start": start,
        "end": end,
        "entities": list(entities),
        "relations": [],
        "actions": list(actions),
        "constraints": [],
        "camera": {
            "camera_id": f"{scene_id}.camera",
            "shots": [{
                "shot_id": f"{scene_id}.shot.0",
                "start": start,
                "end": end,
                "framing": "custom",
                "movement": "static",
                "subject_ids": [],
                "parameters": {},
                "provenance_id": "provenance.human",
            }],
        },
        "environment": None,
        "style": None,
        "audio_events": list(audio_events),
        "render_requirements": {"required": [], "preferred": [], "optional": []},
        "provenance_id": "provenance.human",
    }


def storyboard(scenes, project_id="project.reference", duration=6.0):
    return {
        "schema_version": "2.0.0",
        "project_id": project_id,
        "source": {"source_id": "source.case", "sha256": "a" * 64, "media_type": "video/mp4", "frame_rate": 25.0},
        "duration_seconds": duration,
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
        "tracks": [{
            "track_id": "track.visual",
            "kind": "visual",
            "items": [
                {"item_id": f"item.{item['scene_id']}", "target_type": "scene", "target_id": item["scene_id"],
                 "start": item["start"], "end": item["end"], "layer": 0}
                for item in scenes
            ],
        }],
        "scenes": list(scenes),
        "render_plan": {
            "render_plan_id": "render.plan.fixture",
            "status": "needs-review",
            "selections": [{
                "selection_id": f"selection.{item['scene_id']}",
                "scene_id": item["scene_id"],
                "start": item["start"],
                "end": item["end"],
                "renderer_id": "renderer.unassigned",
                "renderer_version": "0.0.0",
                "status": "needs-review",
                "satisfied_requirement_ids": [],
                "fallback_ids": [],
            } for item in scenes],
            "fallbacks": [],
        },
        "provenance": [PROVENANCE],
    }


def reference_project():
    """Two scenes: a farmer picks fruit and speaks, then a host replies.

    Entity ids are scene-scoped, as Universal Storyboard v2 requires; the
    farmer appears in both scenes under two ids with the same kind and label.
    """
    first = scene(
        "scene.one", 0.0, 3.0,
        [entity("entity.one.farmer", label="farmer"), entity("entity.one.fruit", kind="object", label="fruit")],
        [action("action.grip", "grip", "entity.one.farmer", "entity.one.fruit", 1.0, 1.5)],
        [dialogue("audio.one", "entity.one.farmer", "This one is ripe.", 0.2, 1.0)],
    )
    second = scene(
        "scene.two", 3.0, 6.0,
        [entity("entity.two.farmer", label="farmer"), entity("entity.two.host", label="host")],
        [action("action.place", "place", "entity.two.farmer", "entity.two.host", 3.5, 4.0)],
        [dialogue("audio.two", "entity.two.host", "Looks good.", 3.2, 4.0),
         dialogue("audio.three", "entity.two.farmer", "Thanks.", 4.5, 5.0)],
    )
    return storyboard([first, second])


def check(reference, candidate, **settings):
    from bkt_web.fidelity_structural import FidelitySettings, check_structural_fidelity

    return check_structural_fidelity(reference, candidate, FidelitySettings(**settings) if settings else None)


class IdenticalTest(unittest.TestCase):
    def test_a_faithful_copy_passes_everything(self):
        report = check(reference_project(), reference_project())
        self.assertTrue(report.passed)
        self.assertEqual(report.findings, ())
        self.assertEqual(report.metrics["entity_coverage"], 1.0)
        self.assertEqual(report.metrics["action_coverage"], 1.0)
        self.assertEqual(report.metrics["dialogue_coverage"], 1.0)
        self.assertEqual(report.metrics["speaker_identity_kept"], 1.0)

    def test_renamed_ids_still_match_by_kind_and_label(self):
        candidate = reference_project()
        candidate["project_id"] = "project.candidate"
        for item in candidate["scenes"]:
            for entry in item["entities"]:
                if entry["entity_id"].endswith(".farmer"):
                    renamed = entry["entity_id"].replace("entity.", "entity.rig.")
                    entry["entity_id"] = renamed
                    entry["components"][0]["component_id"] = f"{renamed}.body"
            for entry in item["actions"]:
                for key in ("actor_ids", "target_ids"):
                    entry[key] = [value.replace("entity.", "entity.rig.") if value.endswith(".farmer") else value for value in entry[key]]
            for entry in item["audio_events"]:
                if entry["speaker_id"].endswith(".farmer"):
                    entry["speaker_id"] = entry["speaker_id"].replace("entity.", "entity.rig.")
        report = check(reference_project(), candidate)
        self.assertTrue(report.passed, report.codes())
        self.assertEqual(report.candidate_project_id, "project.candidate")

    def test_the_report_is_json_serialisable_and_echoes_settings(self):
        payload = check(reference_project(), reference_project()).as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.structural-fidelity/v1")
        self.assertEqual(payload["settings"]["min_action_coverage"], 0.90)
        self.assertTrue(payload["passed"])

    def test_checking_does_not_mutate_either_document(self):
        reference, candidate = reference_project(), reference_project()
        before_reference, before_candidate = copy.deepcopy(reference), copy.deepcopy(candidate)
        check(reference, candidate)
        self.assertEqual(reference, before_reference)
        self.assertEqual(candidate, before_candidate)


class TimingTest(unittest.TestCase):
    def test_a_different_duration_fails(self):
        candidate = reference_project()
        candidate["duration_seconds"] = 7.0
        candidate["scenes"][1]["end"] = 7.0
        candidate["scenes"][1]["camera"]["shots"][0]["end"] = 7.0
        candidate["tracks"][0]["items"][1]["end"] = 7.0
        candidate["render_plan"]["selections"][1]["end"] = 7.0
        report = check(reference_project(), candidate)
        self.assertIn("DURATION_MISMATCH", report.codes())
        self.assertFalse(report.passed)
        self.assertAlmostEqual(report.metrics["duration_drift_seconds"], 1.0)

    def test_a_moved_scene_boundary_fails(self):
        candidate = reference_project()
        for holder in (candidate["scenes"][0], candidate["scenes"][0]["camera"]["shots"][0]):
            holder["end"] = 2.0
        candidate["scenes"][1]["start"] = 2.0
        candidate["scenes"][1]["camera"]["shots"][0]["start"] = 2.0
        candidate["tracks"][0]["items"][0]["end"] = 2.0
        candidate["tracks"][0]["items"][1]["start"] = 2.0
        candidate["render_plan"]["selections"][0]["end"] = 2.0
        candidate["render_plan"]["selections"][1]["start"] = 2.0
        report = check(reference_project(), candidate)
        self.assertIn("SCENE_TIMING_SHIFTED", report.codes())
        self.assertAlmostEqual(report.metrics["scene_timing_drift_seconds"], 1.0)

    def test_a_shifted_action_fails_but_a_tiny_nudge_passes(self):
        nudged = reference_project()
        nudged["scenes"][0]["actions"][0]["start"] = 1.02
        self.assertTrue(check(reference_project(), nudged).passed)

        shifted = reference_project()
        shifted["scenes"][0]["actions"][0]["start"] = 1.9
        shifted["scenes"][0]["actions"][0]["end"] = 2.4
        report = check(reference_project(), shifted)
        self.assertIn("ACTION_TIMING_SHIFTED", report.codes())

    def test_shifted_dialogue_fails(self):
        candidate = reference_project()
        candidate["scenes"][0]["audio_events"][0]["start"] = 1.5
        candidate["scenes"][0]["audio_events"][0]["end"] = 2.3
        report = check(reference_project(), candidate)
        self.assertIn("DIALOGUE_TIMING_SHIFTED", report.codes())

    def test_a_dropped_scene_is_reported(self):
        candidate = reference_project()
        candidate["scenes"][0]["end"] = 6.0
        candidate["scenes"][0]["camera"]["shots"][0]["end"] = 6.0
        candidate["tracks"][0]["items"][0]["end"] = 6.0
        candidate["render_plan"]["selections"][0]["end"] = 6.0
        del candidate["scenes"][1]
        del candidate["tracks"][0]["items"][1]
        del candidate["render_plan"]["selections"][1]
        report = check(reference_project(), candidate)
        self.assertIn("SCENE_COUNT_CHANGED", report.codes())


class SpeakerTest(unittest.TestCase):
    def test_reattributing_a_line_fails(self):
        candidate = reference_project()
        candidate["scenes"][1]["audio_events"][0]["speaker_id"] = "entity.two.farmer"
        report = check(reference_project(), candidate)
        self.assertIn("SPEAKER_CHANGED", report.codes())
        self.assertLess(report.metrics["speaker_identity_kept"], 1.0)

    def test_a_dropped_line_fails(self):
        candidate = reference_project()
        del candidate["scenes"][1]["audio_events"][1]
        report = check(reference_project(), candidate)
        self.assertIn("DIALOGUE_MISSING", report.codes())
        self.assertIn("DIALOGUE_COVERAGE_LOW", report.codes())
        self.assertLess(report.metrics["dialogue_coverage"], 1.0)

    def test_an_added_line_is_a_warning_not_a_silent_pass(self):
        candidate = reference_project()
        candidate["scenes"][1]["audio_events"].append(
            dialogue("audio.extra", "entity.two.host", "And that is all.", 5.0, 5.5)
        )
        report = check(reference_project(), candidate)
        self.assertIn("DIALOGUE_ADDED", report.codes())
        self.assertEqual([item.severity for item in report.by_category("speaker") if item.code == "DIALOGUE_ADDED"], ["warn"])

    def test_round_robin_speaker_assignment_is_caught(self):
        reference = reference_project()
        # Source attribution: farmer, host, farmer.
        candidate = reference_project()
        speakers = ["entity.one.farmer", "entity.two.host", "entity.two.farmer"]
        self.assertEqual(
            [item["speaker_id"] for scene_item in reference["scenes"] for item in scene_item["audio_events"]],
            speakers,
        )
        # Candidate hands them out in a cycle instead: farmer, host, farmer...
        # made visible by a fourth line continuing the pattern.
        for holder in (reference, candidate):
            holder["scenes"][1]["audio_events"].append(dialogue("audio.four", "entity.two.host", "Bye.", 5.2, 5.6))
        # Source: farmer, host, host, host — not a cycle.
        reference["scenes"][1]["audio_events"][1]["speaker_id"] = "entity.two.host"
        # Candidate: farmer, host, farmer, host — a round robin.
        candidate["scenes"][1]["audio_events"][1]["speaker_id"] = "entity.two.farmer"
        candidate["scenes"][1]["audio_events"][2]["speaker_id"] = "entity.two.host"
        report = check(reference, candidate)
        self.assertIn("SPEAKER_ASSIGNED_CYCLICALLY", report.codes())

    def test_a_genuinely_alternating_source_is_not_flagged(self):
        reference = reference_project()
        reference["scenes"][1]["audio_events"].append(dialogue("audio.four", "entity.two.host", "Bye.", 5.2, 5.6))
        report = check(reference, copy.deepcopy(reference))
        self.assertNotIn("SPEAKER_ASSIGNED_CYCLICALLY", report.codes())
        self.assertTrue(report.passed)


class CoverageTest(unittest.TestCase):
    def test_a_missing_entity_fails(self):
        candidate = reference_project()
        candidate["scenes"][0]["entities"] = [entity("entity.one.farmer", label="farmer")]
        candidate["scenes"][0]["actions"] = []
        report = check(reference_project(), candidate)
        self.assertIn("ENTITY_MISSING", report.codes())
        self.assertIn("ACTION_MISSING", report.codes())
        self.assertLess(report.metrics["entity_coverage"], 1.0)

    def test_an_added_entity_is_a_warning_by_default_and_can_be_forbidden(self):
        candidate = reference_project()
        candidate["scenes"][0]["entities"].append(entity("entity.one.logo", kind="graphic", label="logo"))
        relaxed = check(reference_project(), candidate)
        self.assertIn("ENTITY_ADDED", relaxed.codes())
        self.assertTrue(relaxed.passed)

        strict = check(reference_project(), candidate, allow_added_entities=False)
        self.assertFalse(strict.passed)

    def test_an_invented_action_fails_by_default(self):
        candidate = reference_project()
        candidate["scenes"][0]["actions"].append(
            action("action.wave", "wave", "entity.one.farmer", "entity.one.fruit", 2.0, 2.5)
        )
        report = check(reference_project(), candidate)
        self.assertIn("ACTION_ADDED", report.codes())
        self.assertFalse(report.passed)
        self.assertTrue(check(reference_project(), candidate, allow_added_actions=True).passed)

    def test_coverage_thresholds_are_reported_against_their_setting(self):
        candidate = reference_project()
        candidate["scenes"][1]["actions"] = []
        report = check(reference_project(), candidate)
        low = next(item for item in report.findings if item.code == "ACTION_COVERAGE_LOW")
        self.assertAlmostEqual(low.measured, 0.5)
        self.assertAlmostEqual(low.expected, 0.90)


class OrderTest(unittest.TestCase):
    def test_swapped_dialogue_order_fails(self):
        candidate = reference_project()
        first, second = candidate["scenes"][1]["audio_events"]
        first["start"], first["end"], second["start"], second["end"] = 4.5, 5.0, 3.2, 4.0
        report = check(reference_project(), candidate)
        self.assertIn("DIALOGUE_ORDER_CHANGED", report.codes())
        self.assertGreaterEqual(report.metrics["order_inversions"], 1)

    def test_reordering_can_be_allowed_by_profile(self):
        candidate = reference_project()
        first, second = candidate["scenes"][1]["audio_events"]
        first["start"], first["end"], second["start"], second["end"] = 4.5, 5.0, 3.2, 4.0
        report = check(reference_project(), candidate, allow_reordering=True, timing_tolerance_seconds=2.0)
        self.assertIn("DIALOGUE_ORDER_CHANGED", report.codes())
        self.assertTrue(report.passed)


class ContinuityTest(unittest.TestCase):
    def test_an_entity_that_vanishes_mid_way_fails(self):
        candidate = reference_project()
        candidate["scenes"][1]["entities"] = [entity("entity.two.host", label="host")]
        candidate["scenes"][1]["actions"] = []
        candidate["scenes"][1]["audio_events"] = [
            item for item in candidate["scenes"][1]["audio_events"] if item["speaker_id"] != "entity.two.farmer"
        ]
        report = check(reference_project(), candidate)
        self.assertIn("ENTITY_PRESENCE_GAP", report.codes())

    def test_a_broken_timeline_in_either_document_is_reported(self):
        from bkt_web.fidelity_structural import check_structural_fidelity
        from bkt_web.universal_storyboard import UniversalStoryboardV2

        candidate = reference_project()
        candidate["scenes"][1]["start"] = 3.5
        candidate["scenes"][1]["camera"]["shots"][0]["start"] = 3.5
        # The schema itself rejects a gap, so this is only reachable when a
        # caller hands over a model that skipped semantic validation.
        model = UniversalStoryboardV2.model_validate(candidate)
        report = check_structural_fidelity(reference_project(), model)
        self.assertIn("SCENE_TIMELINE_BROKEN", report.codes())


class ValidationTest(unittest.TestCase):
    def test_bad_settings_are_rejected(self):
        from bkt_web.fidelity_structural import FidelityError, FidelitySettings

        with self.assertRaisesRegex(FidelityError, "min_action_coverage"):
            FidelitySettings(min_action_coverage=1.5)
        with self.assertRaisesRegex(FidelityError, "không được âm"):
            FidelitySettings(timing_tolerance_seconds=-1)
        with self.assertRaisesRegex(FidelityError, "hữu hạn"):
            FidelitySettings(duration_tolerance_seconds=float("nan"))
        with self.assertRaisesRegex(FidelityError, "allow_added_actions"):
            FidelitySettings(allow_added_actions="yes")

    def test_unknown_category_is_rejected(self):
        from bkt_web.fidelity_structural import FidelityError

        with self.assertRaisesRegex(FidelityError, "chưa hỗ trợ"):
            check(reference_project(), reference_project()).by_category("vibes")

    def test_an_invalid_storyboard_is_rejected(self):
        from bkt_web.universal_storyboard import StoryboardValidationError

        broken = reference_project()
        broken["scenes"][0]["entities"][0]["entity_id"] = "Not An Id"
        with self.assertRaises(StoryboardValidationError):
            check(broken, reference_project())

    def test_every_category_in_the_plan_is_covered(self):
        from bkt_web.fidelity_structural import CATEGORIES

        self.assertEqual(set(CATEGORIES), {"timing", "speaker", "coverage", "order", "continuity"})


class CompilerIntegrationTest(unittest.TestCase):
    """A UV-304 compile checked against itself is the fidelity floor."""

    def storyboard_from_analysis(self):
        import json as _json
        from pathlib import Path

        from bkt_web.analysis_compiler import compile_storyboard

        root = Path(__file__).resolve().parents[1]
        value = _json.loads((root / "bkt_web/schemas/examples/agriculture.analysis-v1.json").read_text(encoding="utf-8"))
        return compile_storyboard(value).storyboard

    def test_a_compiled_storyboard_is_faithful_to_itself(self):
        compiled = self.storyboard_from_analysis()
        report = check(compiled, copy.deepcopy(compiled))
        self.assertTrue(report.passed, report.codes())

    def test_dropping_a_compiled_scene_entity_is_caught(self):
        compiled = self.storyboard_from_analysis()
        candidate = copy.deepcopy(compiled)
        victim = candidate["scenes"][0]["entities"].pop()
        candidate["scenes"][0]["relations"] = [
            item for item in candidate["scenes"][0]["relations"]
            if victim["entity_id"] not in (item["subject_id"], item["object_id"])
        ]
        candidate["scenes"][0]["actions"] = [
            item for item in candidate["scenes"][0]["actions"]
            if victim["entity_id"] not in item["actor_ids"] + item["target_ids"]
        ]
        removed_audio = {
            item["audio_event_id"] for item in candidate["scenes"][0]["audio_events"]
            if item["speaker_id"] == victim["entity_id"]
        }
        candidate["scenes"][0]["audio_events"] = [
            item for item in candidate["scenes"][0]["audio_events"]
            if item["audio_event_id"] not in removed_audio
        ]
        for track in candidate["tracks"]:
            track["items"] = [item for item in track["items"] if item["target_id"] not in removed_audio]
        candidate["tracks"] = [item for item in candidate["tracks"] if item["items"]]
        report = check(compiled, candidate)
        self.assertIn("ENTITY_MISSING", report.codes())
        self.assertFalse(report.passed)


if __name__ == "__main__":
    unittest.main()
