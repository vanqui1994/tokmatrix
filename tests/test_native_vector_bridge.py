import copy
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def compiled_storyboard():
    """The UV-304 compile of the shipped agriculture analysis."""
    from bkt_web.analysis_compiler import compile_storyboard

    value = json.loads((ROOT / "bkt_web/schemas/examples/agriculture.analysis-v1.json").read_text(encoding="utf-8"))
    return compile_storyboard(value).storyboard


def migrated_storyboard(index=0):
    """A v1 native example carried up into v2 by UV-102."""
    from bkt_web.remake_vector import examples
    from bkt_web.storyboard_migration import migrate_v1_to_v2

    story = examples()[index]
    return story, migrate_v1_to_v2(story, source_sha256="a" * 64)


def inspect(storyboard, **kwargs):
    from bkt_web.native_vector_bridge import inspect_native_bridge

    return inspect_native_bridge(storyboard, **kwargs)


class MigratedStoryboardTest(unittest.TestCase):
    """A storyboard that came from v1 already carries its own native story."""

    def test_a_migrated_storyboard_is_renderable_with_no_gaps(self):
        _story, storyboard = migrated_storyboard()
        report = inspect(storyboard)
        self.assertTrue(report.carries_v1_payload)
        self.assertTrue(report.renderable)
        self.assertEqual(report.gaps, ())
        self.assertIn("có thể dựng", report.reason())

    def test_every_shipped_example_round_trips_without_losing_source_facts(self):
        from bkt_web.native_vector_bridge import assert_round_trip_preserves_source_facts
        from bkt_web.remake_vector import examples
        from bkt_web.storyboard_migration import migrate_v1_to_v2, restore_v1_from_v2

        for index, story in enumerate(examples()):
            with self.subTest(example=story.get("id", index)):
                storyboard = migrate_v1_to_v2(story, source_sha256="b" * 64)
                restored = restore_v1_from_v2(storyboard)
                self.assertEqual(assert_round_trip_preserves_source_facts(story, restored), [])

    def test_the_fact_checker_notices_a_moved_scene_time(self):
        from bkt_web.native_vector_bridge import assert_round_trip_preserves_source_facts

        story, _storyboard = migrated_storyboard()
        broken = copy.deepcopy(story)
        broken["scenes"][0]["end_time"] = broken["scenes"][0]["end_time"] + 1
        problems = assert_round_trip_preserves_source_facts(story, broken)
        self.assertTrue(any("end_time" in item for item in problems))

    def test_the_fact_checker_notices_a_reassigned_speaker(self):
        from bkt_web.native_vector_bridge import assert_round_trip_preserves_source_facts

        story = {
            "scenes": [], "characters": [], "duration": 3.0,
            "cues": [{"character_id": "farmer", "start": 0.2, "text": "Ready."}],
        }
        reassigned = copy.deepcopy(story)
        reassigned["cues"][0]["character_id"] = "host"
        self.assertEqual(
            assert_round_trip_preserves_source_facts(story, reassigned),
            ["cue speaker/thời điểm/lời thoại đổi"],
        )

    def test_the_fact_checker_notices_a_dropped_action_or_character(self):
        from bkt_web.native_vector_bridge import assert_round_trip_preserves_source_facts

        story, _storyboard = migrated_storyboard()
        stripped = copy.deepcopy(story)
        stripped["scenes"][0]["actions"] = []
        self.assertTrue(any("actions" in item for item in assert_round_trip_preserves_source_facts(story, stripped)))

        fewer = copy.deepcopy(story)
        fewer["characters"] = fewer["characters"][:-1]
        self.assertIn("danh sách character id đổi", assert_round_trip_preserves_source_facts(story, fewer))


class CompiledStoryboardTest(unittest.TestCase):
    """A storyboard compiled from analysis has no native story to fall back on."""

    def test_restore_refuses_a_compiled_storyboard(self):
        from bkt_web.storyboard_migration import StoryboardMigrationError, restore_v1_from_v2

        with self.assertRaisesRegex(StoryboardMigrationError, "không chứa payload migration v1"):
            restore_v1_from_v2(compiled_storyboard())

    def test_the_bridge_says_what_is_missing_instead_of_only_saying_no(self):
        report = inspect(compiled_storyboard())
        self.assertFalse(report.carries_v1_payload)
        self.assertFalse(report.renderable)
        self.assertTrue(report.gaps)
        # Every gap names a code, a JSON path and the subject it concerns.
        for gap in report.gaps:
            self.assertTrue(gap.code)
            self.assertTrue(gap.path.startswith("$."))
            self.assertTrue(gap.detail)

    def test_the_missing_pieces_are_the_ones_the_engine_really_needs(self):
        codes = inspect(compiled_storyboard()).codes()
        # No canvas coordinates and no background: the two things the v1
        # engine cannot invent for itself.
        self.assertIn("SCENE_HAS_NO_POSES", codes)
        self.assertIn("SCENE_HAS_NO_BACKGROUND", codes)

    def test_entities_are_bound_to_catalog_assets_where_possible(self):
        report = inspect(compiled_storyboard())
        bound = {item.entity_id: item.asset_id for item in report.bindings if item.asset_id}
        self.assertTrue(bound, "ít nhất một entity phải khớp asset")
        # The farmer's hand reads as the catalog 'hand'; the speaker entity is
        # a diarisation label and has no asset.
        self.assertIn("hand", set(bound.values()))
        self.assertTrue(report.unbound_entity_ids)

    def test_the_reason_line_is_usable_as_a_needs_review_message(self):
        reason = inspect(compiled_storyboard()).reason()
        self.assertIn("native-vector-v1 chưa dựng được", reason)
        self.assertIn("SCENE_HAS_NO_POSES", reason)


class GapDetectionTest(unittest.TestCase):
    def storyboard(self, *, entity_label="Nông dân", entity_kind="person", poses=None,
                   background="garden", action_type=None, target_label="Quả cà chua"):
        entity = {
            "entity_id": "entity.one.actor",
            "kind": entity_kind,
            "label": entity_label,
            "role": "observed",
            "components": [{"component_id": "entity.one.actor.body", "kind": "body", "state": "visible", "anchors": []}],
            "attributes": {"observed_category": entity_kind, **({"poses": poses} if poses else {})},
            "provenance_id": "provenance.human",
        }
        target = {
            "entity_id": "entity.one.target",
            "kind": "object",
            "label": target_label,
            "role": "observed",
            "components": [{"component_id": "entity.one.target.body", "kind": "body", "state": "visible", "anchors": []}],
            "attributes": {"observed_category": "object", **({"poses": poses} if poses else {})},
            "provenance_id": "provenance.human",
        }
        actions = []
        if action_type is not None:
            actions.append({
                "action_id": "action.one",
                "type": action_type,
                "actor_ids": ["entity.one.actor"],
                "target_ids": ["entity.one.target"],
                "start": 0.5,
                "end": 1.5,
                "parameters": {},
                "provenance_id": "provenance.human",
            })
        scene = {
            "scene_id": "scene.one",
            "start": 0.0,
            "end": 3.0,
            "entities": [entity, target],
            "relations": [],
            "actions": actions,
            "constraints": [],
            "camera": {
                "camera_id": "scene.one.camera",
                "shots": [{
                    "shot_id": "scene.one.shot.0", "start": 0.0, "end": 3.0,
                    "framing": "custom", "movement": "static", "subject_ids": [],
                    "parameters": {}, "provenance_id": "provenance.human",
                }],
            },
            "environment": None if background is None else {
                "environment_id": "environment.one", "kind": "garden", "attributes": {"preset": background},
            },
            "style": None,
            "audio_events": [],
            "render_requirements": {"required": [], "preferred": [], "optional": []},
            "provenance_id": "provenance.human",
        }
        return {
            "schema_version": "2.0.0",
            "project_id": "project.bridge",
            "source": {"source_id": "source.one", "sha256": "c" * 64, "media_type": "video/mp4"},
            "duration_seconds": 3.0,
            "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
            "tracks": [{"track_id": "track.visual", "kind": "visual", "items": [
                {"item_id": "item.scene.one", "target_type": "scene", "target_id": "scene.one",
                 "start": 0.0, "end": 3.0, "layer": 0}]}],
            "scenes": [scene],
            "render_plan": {
                "render_plan_id": "render.plan.bridge", "status": "needs-review",
                "selections": [{
                    "selection_id": "selection.one", "scene_id": "scene.one", "start": 0.0, "end": 3.0,
                    "renderer_id": "renderer.unassigned", "renderer_version": "0.0.0",
                    "status": "needs-review", "satisfied_requirement_ids": [], "fallback_ids": [],
                }],
                "fallbacks": [],
            },
            "provenance": [{
                "provenance_id": "provenance.human", "kind": "human",
                "created_at": "2026-09-21T02:00:00Z", "agent": "fixture",
                "source_refs": ["source.one"],
                "evidence": [{"evidence_id": "evidence.one", "kind": "frame_range",
                              "source_id": "source.one", "interval": {"start": 0, "end": 3}}],
            }],
        }

    def poses(self):
        return [{"time": 0.0, "x": 288, "y": 800, "height": 400}]

    def test_a_fully_specified_scene_is_renderable(self):
        report = inspect(self.storyboard(poses=self.poses(), action_type="grip"))
        self.assertEqual(report.gaps, ())
        self.assertTrue(report.renderable)

    def test_an_unknown_entity_gets_no_asset(self):
        report = inspect(self.storyboard(entity_label="con rồng lửa", entity_kind="dragon", poses=self.poses()))
        self.assertIn("ENTITY_HAS_NO_ASSET", report.codes())
        self.assertIn("entity.one.actor", report.unbound_entity_ids)

    def test_a_scene_without_poses_is_reported(self):
        report = inspect(self.storyboard(poses=None))
        self.assertIn("SCENE_HAS_NO_POSES", report.codes())

    def test_a_scene_without_a_known_background_is_reported(self):
        self.assertIn("SCENE_HAS_NO_BACKGROUND", inspect(self.storyboard(poses=self.poses(), background=None)).codes())
        self.assertIn(
            "SCENE_HAS_NO_BACKGROUND",
            inspect(self.storyboard(poses=self.poses(), background="sao_hoa")).codes(),
        )

    def test_an_action_outside_the_catalog_is_reported(self):
        report = inspect(self.storyboard(poses=self.poses(), action_type="teleport"))
        self.assertIn("ACTION_NOT_IN_CATALOG", report.codes())

    def test_an_action_the_catalog_has_but_not_for_that_asset_is_reported(self):
        # 'grip' exists, but a tomato is not one of its actors.
        report = inspect(self.storyboard(
            entity_label="Quả cà chua", entity_kind="object", poses=self.poses(), action_type="grip",
        ))
        self.assertIn("ACTION_ASSET_NOT_SUPPORTED", report.codes())

    def test_an_action_whose_actor_has_no_asset_is_reported_separately(self):
        report = inspect(self.storyboard(
            entity_label="con rồng lửa", entity_kind="dragon", poses=self.poses(), action_type="grip",
        ))
        self.assertIn("ACTION_ACTOR_HAS_NO_ASSET", report.codes())
        self.assertNotIn("ACTION_ASSET_NOT_SUPPORTED", report.codes())

    def test_dotted_action_names_map_onto_catalog_names(self):
        # The compiler writes ids with dots; the catalog spells actions with
        # underscores, so 'set.hook' has to find 'set_hook'.
        report = inspect(self.storyboard(poses=self.poses(), action_type="set.hook"))
        self.assertNotIn("ACTION_NOT_IN_CATALOG", report.codes())

    def test_an_action_the_compiler_emits_but_the_catalog_lacks_is_surfaced(self):
        # 'look_at' is a real UV-303 output and genuinely absent from the
        # catalog; the bridge has to say so rather than let it through.
        report = inspect(self.storyboard(poses=self.poses(), action_type="look.at"))
        self.assertIn("ACTION_NOT_IN_CATALOG", report.codes())


class BindingTest(unittest.TestCase):
    def test_an_asset_is_matched_by_id_label_word_or_category(self):
        from bkt_web.native_vector_bridge import inspect_native_bridge

        cases = {
            "farmer": "label",            # catalog id
            "Nông dân": "label",          # catalog label, accented
            "right hand": "label_word",   # trailing word of an observed label
        }
        for label, expected in cases.items():
            with self.subTest(label=label):
                document = GapDetectionTest().storyboard(entity_label=label, poses=GapDetectionTest().poses())
                report = inspect_native_bridge(document)
                binding = next(item for item in report.bindings if item.entity_id == "entity.one.actor")
                self.assertIsNotNone(binding.asset_id)
                self.assertEqual(binding.matched_by, expected)

    def test_a_group_name_shared_by_several_assets_never_binds(self):
        document = GapDetectionTest().storyboard(entity_label="fruit", entity_kind="fruit", poses=GapDetectionTest().poses())
        report = inspect(document)
        binding = next(item for item in report.bindings if item.entity_id == "entity.one.actor")
        self.assertIsNone(binding.asset_id, "'fruit' không được tự chọn một quả cụ thể")


class ReportTest(unittest.TestCase):
    def test_the_report_is_json_serialisable(self):
        payload = inspect(compiled_storyboard()).as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.native-vector-bridge/v1")
        self.assertFalse(payload["renderable"])

    def test_inspection_is_deterministic_and_does_not_mutate_the_storyboard(self):
        document = compiled_storyboard()
        before = copy.deepcopy(document)
        first = inspect(document).as_dict()
        second = inspect(document).as_dict()
        self.assertEqual(first, second)
        self.assertEqual(document, before)

    def test_an_invalid_storyboard_or_catalog_is_rejected(self):
        from bkt_web.native_vector_bridge import NativeBridgeError
        from bkt_web.universal_storyboard import StoryboardValidationError

        broken = compiled_storyboard()
        broken["scenes"][0]["entities"][0]["entity_id"] = "Not An Id"
        with self.assertRaises(StoryboardValidationError):
            inspect(broken)
        with self.assertRaisesRegex(NativeBridgeError, "catalog không hợp lệ"):
            inspect(compiled_storyboard(), native_catalog={"nope": True})

    def test_every_gap_code_is_declared(self):
        from bkt_web.native_vector_bridge import GAP_CODES

        self.assertEqual(set(inspect(compiled_storyboard()).codes()) - set(GAP_CODES), set())


if __name__ == "__main__":
    unittest.main()
