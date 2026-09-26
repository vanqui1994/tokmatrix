import copy
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

# Every role of every shipped composite, bound to a real component or anchor of
# the agriculture fixture, plus every ``$param`` those composites ask for.
ROLE_BINDINGS = {
    # Actor roles bind to entities; contact roles bind to components/anchors.
    "farmer": "farmer_01",
    "actor": "farmer_01",
    "giver": "farmer_01",
    "hand": "farmer_01_grip_right",
    "fruit": "tomato_01_body",
    "basket": "basket_01_interior",
    "can": "tomato_01_body",
    "soil": "basket_01_body",
    "giver_hand": "farmer_01_grip_right",
    "item": "tomato_01_body",
    "receiver_hand": "farmer_01_hand_right",
    "lid": "farmer_01_hand_right",
    "interior": "basket_01_interior",
    "object": "tomato_01_body",
    "sprayer": "tomato_01_body",
    "plant": "basket_01_body",
    "bag": "tomato_01_body",
    "field": "basket_01_body",
}
COMPOSITE_PARAMS = {
    "drop_point": {"x": 500, "y": 600},
    "basket_bounds": {"min_x": -40, "min_y": -30, "max_x": 40, "max_y": 30},
    "interior_bounds": {"min_x": -40, "min_y": -30, "max_x": 40, "max_y": 30},
    "tip_degrees": 70,
    "open_degrees": 85,
    "to": {"x": 260, "y": 300},
}


def base_story():
    """Agriculture example with concrete component transforms."""
    value = json.loads((ROOT / "bkt_web/schemas/examples/agriculture.storyboard-v2.json").read_text(encoding="utf-8"))
    scene = value["scenes"][0]
    entities = {item["entity_id"]: item for item in scene["entities"]}

    def component(entity_id, component_id):
        return next(item for item in entities[entity_id]["components"] if item["component_id"] == component_id)

    component("farmer_01", "farmer_01_body")["attributes"] = {"transform": {"x": 100, "y": 400}}
    component("farmer_01", "farmer_01_hand_right")["attributes"] = {
        "transform": {"x": 40, "y": -60},
        "anchor_transforms": {"grip": {"x": 6, "y": -4}},
    }
    component("tomato_01", "tomato_01_body")["attributes"] = {"transform": {"x": 320, "y": 180}}
    component("basket_01", "basket_01_body")["attributes"] = {
        "transform": {"x": 500, "y": 620},
        "anchor_transforms": {"interior": {"x": 0, "y": -20}},
    }
    # UV-201's compiler needs one component target for a lifecycle action.
    next(item for item in scene["actions"] if item["action_id"] == "action_detach")["target_ids"] = ["tomato_01_body"]
    return value


def story_with_actions(actions, constraints=None):
    value = base_story()
    scene = value["scenes"][0]
    scene["actions"] = copy.deepcopy(actions)
    scene["constraints"] = copy.deepcopy(constraints or [])
    ids = [item["constraint_id"] for item in scene["constraints"]]
    for item in scene["render_requirements"]["required"]:
        if item["capability"].startswith("constraint."):
            item["target_ids"] = ids or ["farmer_01"]
    action_ids = [item["action_id"] for item in scene["actions"]]
    for item in scene["render_requirements"]["preferred"]:
        if item["capability"].startswith("action."):
            item["target_ids"] = action_ids or ["farmer_01"]
    return value


def composite_action(action_id, composite_id, roles, start, end, **parameters):
    return {
        "action_id": action_id,
        "type": composite_id,
        "actor_ids": ["farmer_01"],
        "target_ids": [],
        "start": start,
        "end": end,
        "parameters": {"roles": roles, **parameters},
        "provenance_id": "provenance_human",
    }


def primitive_action(action_id, kind, actors, targets, start, end, **parameters):
    return {
        "action_id": action_id,
        "type": kind,
        "actor_ids": list(actors),
        "target_ids": list(targets),
        "start": start,
        "end": end,
        "parameters": parameters,
        "provenance_id": "provenance_human",
    }


def scene_of(value):
    from bkt_web.universal_storyboard import validate_storyboard_v2

    return validate_storyboard_v2(value).scenes[0]


def compile_story(value):
    from bkt_web.interaction_grammar import compile_scene_interactions
    from bkt_web.universal_storyboard import validate_storyboard_v2

    model = validate_storyboard_v2(value)
    return compile_scene_interactions(model.scenes[0], project_id=model.project_id)


def roles_for(composite):
    return {role: ROLE_BINDINGS[role] for role in composite["roles"]}


class CompositeLibraryTest(unittest.TestCase):
    def test_shipped_library_is_valid_and_covers_six_sequences(self):
        from bkt_web.interaction_grammar import STEP_ACTIONS, composite_library, validate_composite_library

        library = composite_library()
        validate_composite_library(library)
        self.assertGreaterEqual(len(library["composites"]), 6)
        for composite_id, composite in library["composites"].items():
            with self.subTest(composite=composite_id):
                self.assertTrue(composite["steps"])
                for step in composite["steps"]:
                    self.assertIn(step["type"], STEP_ACTIONS)
                    self.assertNotIn(step["type"], library["composites"])

    def test_library_copy_cannot_corrupt_the_cached_document(self):
        from bkt_web.interaction_grammar import composite_library

        mutated = composite_library()
        mutated["composites"].clear()
        self.assertGreaterEqual(len(composite_library()["composites"]), 6)

    def test_every_shipped_composite_expands_to_primitives_only(self):
        from bkt_web.interaction_grammar import STEP_ACTIONS, composite_library, expand_actions

        library = composite_library()
        for composite_id, composite in library["composites"].items():
            with self.subTest(composite=composite_id):
                action = composite_action("action_case", composite_id, roles_for(composite), 1, 5, **COMPOSITE_PARAMS)
                primitives = expand_actions(scene_of(story_with_actions([action])))
                self.assertEqual(len(primitives), len(composite["steps"]))
                for item, step in zip(primitives, composite["steps"]):
                    self.assertEqual(item.action_id, f"action_case:{step['step_id']}")
                    self.assertIn(item.type, STEP_ACTIONS)
                    self.assertNotIn(item.type, library["composites"])
                    self.assertAlmostEqual(item.start, 1 + 4 * step["start_ratio"])
                    self.assertAlmostEqual(item.end, 1 + 4 * step["end_ratio"])
                    self.assertGreaterEqual(item.start, action["start"])
                    self.assertLessEqual(item.end, action["end"])
                    self.assertEqual(item.parameters["composite_action_id"], "action_case")
                    self.assertEqual(item.provenance_id, action["provenance_id"])

    def test_a_new_composite_needs_data_only_no_code(self):
        from bkt_web.interaction_grammar import compile_scene_interactions, composite_library
        from bkt_web.universal_storyboard import validate_storyboard_v2

        library = composite_library()
        library["composites"]["tidy_up"] = {
            "id": "tidy_up",
            "summary": "Custom sequence defined entirely in data.",
            "roles": ["worker", "hand", "item", "shelf"],
            "steps": [
                {"step_id": "touch", "type": "touch", "start_ratio": 0, "end_ratio": 0.4,
                 "actor_roles": ["worker"], "target_roles": ["item"],
                 "parameters": {"actor_ref": {"$role": "hand"}}},
                {"step_id": "drag", "type": "drag", "start_ratio": 0.4, "end_ratio": 0.8,
                 "actor_roles": ["worker"], "target_roles": ["item"],
                 "parameters": {"to": {"$param": "shelf_point"}, "actor_ref": {"$role": "hand"}}},
                {"step_id": "place", "type": "place", "start_ratio": 0.8, "end_ratio": 1.0,
                 "actor_roles": ["worker"], "target_roles": ["item"],
                 "parameters": {"container_ref": {"$role": "shelf"}, "actor_ref": {"$role": "hand"}}},
            ],
        }
        action = composite_action(
            "action_tidy", "tidy_up",
            {"worker": "farmer_01", "hand": "farmer_01_grip_right", "item": "tomato_01_body", "shelf": "basket_01_interior"},
            1, 5, shelf_point={"x": 480, "y": 560},
        )
        model = validate_storyboard_v2(story_with_actions([action]))
        plan = compile_scene_interactions(model.scenes[0], project_id=model.project_id, library=library)
        self.assertEqual(
            [item.action_id for item in plan.primitives],
            ["action_tidy:touch", "action_tidy:drag", "action_tidy:place"],
        )
        self.assertEqual(plan.skipped, ())
        self.assertIn("action_tidy:drag:path", [item["constraint_id"] for item in plan.constraints])


class PrimitiveCompilationTest(unittest.TestCase):
    def plan_for(self, composite_id, start=1, end=5, **overrides):
        from bkt_web.interaction_grammar import composite_library

        composite = composite_library()["composites"][composite_id]
        parameters = {**COMPOSITE_PARAMS, **overrides}
        action = composite_action(f"action_{composite_id}", composite_id, roles_for(composite), start, end, **parameters)
        return compile_story(story_with_actions([action]))

    def test_harvest_sequence_produces_contact_path_and_containment(self):
        plan = self.plan_for("harvest_fruit")
        ids = [item["constraint_id"] for item in plan.constraints]
        self.assertEqual(plan.skipped, ())
        self.assertIn("action_harvest_fruit:touch:contact", ids)
        self.assertIn("action_harvest_fruit:drag:path", ids)
        self.assertIn("action_harvest_fruit:place:containment", ids)
        path = next(item for item in plan.constraints if item["constraint_id"] == "action_harvest_fruit:drag:path")
        # The unspecified start point is sampled from the component tree.
        self.assertEqual(path["parameters"]["points"][0], {"x": 320.0, "y": 180.0})
        self.assertEqual(path["parameters"]["points"][1], {"x": 500.0, "y": 600.0})
        # The dragged fruit moves; the hand follows it at lower priority.
        contact = next(item for item in plan.constraints if item["constraint_id"] == "action_harvest_fruit:drag:contact")
        self.assertEqual(contact["parameters"]["movable_id"], "farmer_01_grip_right")
        self.assertLess(contact["parameters"]["priority"], path["parameters"]["priority"])

    def test_handover_reparents_the_item_and_splits_contact_at_the_midpoint(self):
        plan = self.plan_for("hand_over_item", start=0, end=4)
        attach = next(item for item in plan.events if item.event_id == "action_hand_over_item:transfer:attach")
        self.assertEqual(attach.component_id, "tomato_01_body")
        self.assertEqual(attach.parent_id, "farmer_01_hand_right")
        self.assertEqual(attach.state, "attached")
        self.assertAlmostEqual(attach.time, 4)
        giver = next(item for item in plan.constraints if item["constraint_id"].endswith("transfer:contact.giver"))
        receiver = next(item for item in plan.constraints if item["constraint_id"].endswith("transfer:contact.receiver"))
        self.assertAlmostEqual(giver["end"], receiver["start"])
        self.assertAlmostEqual(giver["start"], 1.2)
        self.assertAlmostEqual(receiver["end"], 4)
        self.assertEqual(giver["parameters"]["movable_id"], "tomato_01_body")

    def test_open_and_close_emit_a_motion_envelope_and_a_hold(self):
        plan = self.plan_for("store_in_box")
        hinges = {item["constraint_id"]: item for item in plan.constraints if item["type"] == "joint_limit"}
        envelope = hinges["action_store_in_box:open:envelope"]
        hold = hinges["action_store_in_box:open:hold"]
        self.assertEqual((envelope["parameters"]["min_degrees"], envelope["parameters"]["max_degrees"]), (0.0, 85.0))
        self.assertEqual((hold["parameters"]["min_degrees"], hold["parameters"]["max_degrees"]), (85.0, 85.0))
        self.assertAlmostEqual(hold["start"], envelope["end"])
        self.assertAlmostEqual(hold["end"], 6)
        close_envelope = hinges["action_store_in_box:close:envelope"]
        self.assertEqual((close_envelope["parameters"]["min_degrees"], close_envelope["parameters"]["max_degrees"]), (0.0, 85.0))

    def test_pour_scatter_and_spray_emit_deterministic_seeded_material(self):
        water = self.plan_for("water_plant").emissions
        seeds = self.plan_for("scatter_seed").emissions
        spray = self.plan_for("spray_crop").emissions
        self.assertEqual([item.material for item in water], ["water"])
        self.assertEqual([item.material for item in seeds], ["seed"])
        self.assertEqual([item.material for item in spray], ["fertilizer"])
        self.assertEqual(water[0].source_ref, "tomato_01_body")
        self.assertEqual(water[0].target_ref, "basket_01_body")
        self.assertAlmostEqual(water[0].start, 1 + 4 * 0.4)
        self.assertEqual(water[0].seed, self.plan_for("water_plant").emissions[0].seed)
        self.assertNotEqual(water[0].seed, seeds[0].seed)
        self.assertGreaterEqual(water[0].seed, 0)

    def test_push_sequence_ends_with_a_release_detach(self):
        plan = self.plan_for("push_object_aside")
        release = next(item for item in plan.events if item.event_id == "action_push_object_aside:release")
        self.assertIsNone(release.parent_id)
        self.assertEqual(release.state, "detached")
        path = next(item for item in plan.constraints if item["constraint_id"].endswith("push:path"))
        self.assertEqual(path["parameters"]["intent"], "push")
        self.assertEqual(path["parameters"]["points"][-1], {"x": 260.0, "y": 300.0})

    def test_pull_records_its_own_intent(self):
        plan = self.plan_for("scatter_seed")
        path = next(item for item in plan.constraints if item["constraint_id"].endswith("pull:path"))
        self.assertEqual(path["parameters"]["intent"], "pull")

    def test_scene_constraints_are_kept_alongside_derived_ones(self):
        from bkt_web.interaction_grammar import composite_library

        composite = composite_library()["composites"]["harvest_fruit"]
        action = composite_action("action_harvest", "harvest_fruit", roles_for(composite), 1, 5, **COMPOSITE_PARAMS)
        declared = {
            "constraint_id": "constraint_grip_tomato",
            "type": "anchor_contact",
            "subject_ids": ["farmer_01_grip_right", "tomato_01_body"],
            "start": 1,
            "end": 2,
            "strength": "hard",
            "provenance_id": "provenance_human",
        }
        plan = compile_story(story_with_actions([action], [declared]))
        self.assertIn("constraint_grip_tomato", [item["constraint_id"] for item in plan.constraints])


class InteractionSolveTest(unittest.TestCase):
    def harvest_story(self):
        from bkt_web.interaction_grammar import composite_library

        composite = composite_library()["composites"]["harvest_fruit"]
        action = composite_action("action_harvest", "harvest_fruit", roles_for(composite), 1, 5, **COMPOSITE_PARAMS)
        return story_with_actions([action])

    def test_placed_fruit_ends_inside_the_basket_bounds(self):
        from bkt_web.interaction_grammar import solve_scene_interactions

        payload = solve_scene_interactions(self.harvest_story(), "scene_harvest", 5.0)
        self.assertEqual(payload["conflicts"], [])
        fruit = payload["components"]["tomato_01_body"]["world_transform"]
        interior = payload["components"]["basket_01_body"]["anchors"]["interior"]
        self.assertLessEqual(abs(fruit["x"] - interior["x"]), 40 + 1e-6)
        self.assertLessEqual(abs(fruit["y"] - interior["y"]), 30 + 1e-6)

    def test_drag_position_follows_absolute_time(self):
        from bkt_web.interaction_grammar import solve_scene_interactions

        story = self.harvest_story()
        midpoint = solve_scene_interactions(story, "scene_harvest", 3.0)["components"]["tomato_01_body"]["world_transform"]
        self.assertGreater(midpoint["x"], 320)
        self.assertLess(midpoint["x"], 500)

    def test_seek_order_and_repeated_calls_give_identical_frames(self):
        from bkt_web.interaction_grammar import solve_scene_interactions

        story = self.harvest_story()
        forward = [solve_scene_interactions(story, "scene_harvest", t / 2) for t in range(0, 13)]
        backward = [solve_scene_interactions(story, "scene_harvest", t / 2) for t in range(12, -1, -1)]
        self.assertEqual(forward, list(reversed(backward)))
        self.assertEqual(json.dumps(forward[6], sort_keys=True), json.dumps(solve_scene_interactions(story, "scene_harvest", 3.0), sort_keys=True))

    def test_solving_does_not_mutate_the_storyboard(self):
        from bkt_web.interaction_grammar import solve_scene_interactions

        story = self.harvest_story()
        before = copy.deepcopy(story)
        solve_scene_interactions(story, "scene_harvest", 4.0)
        self.assertEqual(story, before)

    def test_plan_snapshot_is_json_serialisable(self):
        from bkt_web.interaction_grammar import solve_scene_interactions

        payload = solve_scene_interactions(self.harvest_story(), "scene_harvest", 4.0)
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["plan"]["needs_review"], [])
        self.assertEqual(
            [item["action_id"] for item in payload["plan"]["primitives"]],
            ["action_harvest:touch", "action_harvest:pluck", "action_harvest:drag", "action_harvest:place"],
        )


class InteractionValidationTest(unittest.TestCase):
    def test_entity_level_actions_are_reported_not_silently_compiled(self):
        plan = compile_story(base_story())
        self.assertEqual(
            [item.as_dict() for item in plan.skipped],
            [{"action_id": "action_place", "type": "place", "reason": "missing_actor_ref"}],
        )
        self.assertEqual([item["constraint_id"] for item in plan.constraints], ["constraint_grip_tomato"])

    def test_missing_role_binding_or_parameter_is_rejected(self):
        from bkt_web.interaction_grammar import InteractionGrammarError, expand_actions

        partial = composite_action("action_x", "harvest_fruit", {"hand": "farmer_01_grip_right"}, 1, 5, **COMPOSITE_PARAMS)
        with self.assertRaisesRegex(InteractionGrammarError, "thiếu role"):
            expand_actions(scene_of(story_with_actions([partial])))

        from bkt_web.interaction_grammar import composite_library

        composite = composite_library()["composites"]["harvest_fruit"]
        no_param = composite_action("action_x", "harvest_fruit", roles_for(composite), 1, 5)
        with self.assertRaisesRegex(InteractionGrammarError, "thiếu parameter"):
            expand_actions(scene_of(story_with_actions([no_param])))

    def test_missing_primitive_parameters_fail_loudly(self):
        from bkt_web.interaction_grammar import InteractionGrammarError

        with self.assertRaisesRegex(InteractionGrammarError, "parameters.to"):
            compile_story(story_with_actions([
                primitive_action("action_drag", "drag", ["farmer_01"], ["tomato_01_body"], 1, 3, actor_ref="farmer_01_grip_right"),
            ]))
        with self.assertRaisesRegex(InteractionGrammarError, "to_degrees"):
            compile_story(story_with_actions([
                primitive_action("action_open", "open", ["farmer_01"], ["farmer_01_hand_right"], 1, 3, actor_ref="farmer_01_grip_right"),
            ]))
        with self.assertRaisesRegex(InteractionGrammarError, "parent_component_id"):
            compile_story(story_with_actions([
                primitive_action("action_receive", "receive", ["farmer_01"], ["tomato_01_body"], 1, 3, actor_ref="farmer_01_grip_right"),
            ]))
        with self.assertRaisesRegex(InteractionGrammarError, "material"):
            compile_story(story_with_actions([
                primitive_action("action_pour", "pour", ["farmer_01"], ["basket_01_body"], 1, 3, actor_ref="tomato_01_body"),
            ]))
        with self.assertRaisesRegex(InteractionGrammarError, "container_ref"):
            compile_story(story_with_actions([
                primitive_action("action_place", "place", ["farmer_01"], ["tomato_01_body"], 1, 3, actor_ref="farmer_01_grip_right"),
            ]))

    def test_nested_or_malformed_composites_are_rejected(self):
        from bkt_web.interaction_grammar import InteractionGrammarError, composite_library, validate_composite_library

        nested = composite_library()
        nested["composites"]["harvest_fruit"]["steps"][0]["type"] = "water_plant"
        with self.assertRaisesRegex(InteractionGrammarError, "primitive đã đăng ký|lồng nhau"):
            validate_composite_library(nested)

        out_of_order = composite_library()
        out_of_order["composites"]["harvest_fruit"]["steps"][1]["start_ratio"] = 0.0
        with self.assertRaisesRegex(InteractionGrammarError, "thứ tự thời gian"):
            validate_composite_library(out_of_order)

        bad_ratio = composite_library()
        bad_ratio["composites"]["harvest_fruit"]["steps"][0]["end_ratio"] = 1.5
        with self.assertRaisesRegex(InteractionGrammarError, r"\[0,1\]"):
            validate_composite_library(bad_ratio)

        unknown_role = composite_library()
        unknown_role["composites"]["harvest_fruit"]["steps"][0]["target_roles"] = ["ghost"]
        with self.assertRaisesRegex(InteractionGrammarError, "role lạ"):
            validate_composite_library(unknown_role)

        wrong_schema = composite_library()
        wrong_schema["schema"] = "something/v9"
        with self.assertRaisesRegex(InteractionGrammarError, "schema"):
            validate_composite_library(wrong_schema)

    def test_unknown_movable_side_is_rejected(self):
        from bkt_web.interaction_grammar import InteractionGrammarError

        with self.assertRaisesRegex(InteractionGrammarError, "movable"):
            compile_story(story_with_actions([
                primitive_action("action_touch", "touch", ["farmer_01"], ["tomato_01_body"], 1, 3, actor_ref="farmer_01_grip_right", movable="basket"),
            ]))

    def test_timestamp_outside_the_scene_is_rejected(self):
        from bkt_web.interaction_grammar import InteractionGrammarError, solve_scene_interactions

        with self.assertRaisesRegex(InteractionGrammarError, "ngoài scene"):
            solve_scene_interactions(base_story(), "scene_harvest", 99)
        with self.assertRaisesRegex(InteractionGrammarError, "không tồn tại"):
            solve_scene_interactions(base_story(), "scene_missing", 1)


if __name__ == "__main__":
    unittest.main()
