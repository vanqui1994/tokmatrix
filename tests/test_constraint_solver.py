import copy
import json
import math
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def agriculture():
    return json.loads((ROOT / "bkt_web/schemas/examples/agriculture.storyboard-v2.json").read_text(encoding="utf-8"))


def constraint_story(constraints=None, *, transforms=True):
    """Agriculture example with explicit component transforms and constraints."""
    value = agriculture()
    scene = value["scenes"][0]
    farmer = next(item for item in scene["entities"] if item["entity_id"] == "farmer_01")
    body = next(item for item in farmer["components"] if item["component_id"] == "farmer_01_body")
    hand = next(item for item in farmer["components"] if item["component_id"] == "farmer_01_hand_right")
    tomato = next(item for item in scene["entities"] if item["entity_id"] == "tomato_01")
    fruit = next(item for item in tomato["components"] if item["component_id"] == "tomato_01_body")
    basket = next(item for item in scene["entities"] if item["entity_id"] == "basket_01")
    basket_body = next(item for item in basket["components"] if item["component_id"] == "basket_01_body")
    if transforms:
        body["attributes"] = {"transform": {"x": 100, "y": 400}}
        hand["attributes"] = {
            "transform": {"x": 40, "y": -60},
            "anchor_transforms": {"grip": {"x": 6, "y": -4}},
        }
        fruit["attributes"] = {"transform": {"x": 320, "y": 180}}
        basket_body["attributes"] = {
            "transform": {"x": 500, "y": 620},
            "anchor_transforms": {"interior": {"x": 0, "y": -20}},
        }
    # The example's detach action targets the whole entity; the lifecycle
    # compiler needs one component target.
    detach = next(item for item in scene["actions"] if item["action_id"] == "action_detach")
    detach["target_ids"] = ["tomato_01_body"]
    if constraints is not None:
        scene["constraints"] = copy.deepcopy(constraints)
        # The example pins a fidelity requirement to its own constraint id, and
        # the render plan references that requirement, so repoint instead of drop.
        ids = [item["constraint_id"] for item in scene["constraints"]]
        for item in scene["render_requirements"]["required"]:
            if item["capability"].startswith("constraint."):
                item["target_ids"] = ids or ["farmer_01"]
    return value


def scene_of(value):
    from bkt_web.universal_storyboard import validate_storyboard_v2

    return validate_storyboard_v2(value).scenes[0]


def constraint(constraint_id, kind, subjects, **parameters):
    return {
        "constraint_id": constraint_id,
        "type": kind,
        "subject_ids": list(subjects),
        "start": 0,
        "end": 6,
        "strength": parameters.pop("strength", "hard"),
        "parameters": parameters,
        "provenance_id": "provenance_human",
    }


class ConstraintFamilyTest(unittest.TestCase):
    def solve(self, constraints, seconds=3.0, **kwargs):
        from bkt_web.constraint_solver import solver_for_scene

        scene = scene_of(constraint_story(constraints))
        return solver_for_scene(scene, **kwargs).solve(seconds)

    def test_point_to_point_moves_the_free_body_onto_the_anchor(self):
        solution = self.solve([
            constraint("constraint_grip_tomato", "anchor_contact", ["farmer_01_grip_right", "tomato_01_body"]),
        ])
        self.assertTrue(solution.converged)
        self.assertEqual(solution.conflicts, ())
        grip = solution.components["farmer_01_hand_right"]["anchors"]["grip"]
        fruit = solution.components["tomato_01_body"]["world_transform"]
        self.assertAlmostEqual(grip["x"], fruit["x"])
        self.assertAlmostEqual(grip["y"], fruit["y"])
        # The rig itself must not be dragged towards the fruit.
        self.assertAlmostEqual(solution.components["farmer_01_body"]["world_transform"]["x"], 100)

    def test_distance_band_clamps_without_moving_when_already_inside(self):
        inside = self.solve([
            constraint("constraint_reach", "distance", ["tomato_01_body", "farmer_01_grip_right"], max_distance=1000),
        ])
        self.assertAlmostEqual(inside.components["tomato_01_body"]["world_transform"]["x"], 320)
        clamped = self.solve([
            constraint("constraint_reach", "distance", ["tomato_01_body", "farmer_01_grip_right"], max_distance=50),
        ])
        grip = clamped.components["farmer_01_hand_right"]["anchors"]["grip"]
        fruit = clamped.components["tomato_01_body"]["world_transform"]
        self.assertAlmostEqual(math.hypot(fruit["x"] - grip["x"], fruit["y"] - grip["y"]), 50, places=6)

    def test_look_at_rotates_subject_towards_target(self):
        solution = self.solve([
            constraint("constraint_gaze", "gaze_target", ["farmer_01_body", "tomato_01_body"]),
        ])
        self.assertTrue(solution.converged)
        body = solution.components["farmer_01_body"]["world_transform"]
        expected = math.degrees(math.atan2(180 - 400, 320 - 100))
        self.assertAlmostEqual(body["rotation"], expected, places=6)

    def test_ground_contact_on_and_above_modes(self):
        on_ground = self.solve([
            constraint("constraint_ground", "ground_contact", ["tomato_01_body"], ground_y=700),
        ])
        self.assertAlmostEqual(on_ground.components["tomato_01_body"]["world_transform"]["y"], 700)
        above = self.solve([
            constraint("constraint_ground", "ground_contact", ["tomato_01_body"], ground_y=700, mode="above"),
        ])
        # y=180 is already above the ground line, so nothing moves.
        self.assertAlmostEqual(above.components["tomato_01_body"]["world_transform"]["y"], 180)

    def test_inside_container_clamps_into_basket_bounds(self):
        solution = self.solve([
            constraint(
                "constraint_in_basket",
                "containment",
                ["tomato_01_body", "basket_01_interior"],
                bounds={"min_x": -40, "min_y": -30, "max_x": 40, "max_y": 30},
            ),
        ])
        self.assertTrue(solution.converged)
        fruit = solution.components["tomato_01_body"]["world_transform"]
        interior = solution.components["basket_01_body"]["anchors"]["interior"]
        self.assertAlmostEqual(fruit["x"], interior["x"] - 40)
        self.assertAlmostEqual(fruit["y"], interior["y"] - 30)

    def test_joint_limit_clamps_rotation_relative_to_parent(self):
        story = constraint_story([
            constraint("constraint_wrist", "joint_limit", ["farmer_01_hand_right"], min_degrees=-30, max_degrees=30),
        ])
        scene = story["scenes"][0]
        farmer = next(item for item in scene["entities"] if item["entity_id"] == "farmer_01")
        hand = next(item for item in farmer["components"] if item["component_id"] == "farmer_01_hand_right")
        hand["attributes"]["transform"]["rotation"] = 80

        from bkt_web.constraint_solver import solver_for_scene

        solution = solver_for_scene(scene_of(story)).solve(3.0)
        self.assertTrue(solution.converged)
        self.assertAlmostEqual(solution.components["farmer_01_hand_right"]["world_transform"]["rotation"], 30)

    def test_path_follow_is_absolute_time_parameterised(self):
        spec = constraint(
            "constraint_path",
            "path_follow",
            ["tomato_01_body"],
            points=[{"x": 0, "y": 0}, {"x": 100, "y": 0}],
        )
        spec["start"], spec["end"] = 2, 6
        midpoint = self.solve([spec], seconds=4.0)
        self.assertAlmostEqual(midpoint.components["tomato_01_body"]["world_transform"]["x"], 50)
        end = self.solve([spec], seconds=6.0)
        self.assertAlmostEqual(end.components["tomato_01_body"]["world_transform"]["x"], 100)
        # Outside the interval the constraint is inactive and nothing is forced.
        before = self.solve([spec], seconds=1.0)
        self.assertEqual(before.results, ())
        self.assertAlmostEqual(before.components["tomato_01_body"]["world_transform"]["x"], 320)


class ConstraintPriorityTest(unittest.TestCase):
    def conflicting_story(self, low_priority=10, high_priority=90):
        low = constraint(
            "constraint_low",
            "point_to_point",
            ["tomato_01_body", "basket_01_interior"],
            priority=low_priority,
        )
        high = constraint(
            "constraint_high",
            "point_to_point",
            ["tomato_01_body", "farmer_01_grip_right"],
            priority=high_priority,
        )
        return constraint_story([low, high])

    def test_higher_priority_constraint_wins_and_conflict_is_reported(self):
        from bkt_web.constraint_solver import solver_for_scene

        solution = solver_for_scene(scene_of(self.conflicting_story())).solve(3.0)
        self.assertFalse(solution.converged)
        self.assertEqual([item.constraint_id for item in solution.conflicts], ["constraint_low"])
        conflict = solution.conflicts[0]
        self.assertEqual(conflict.competing_constraint_ids, ("constraint_high",))
        self.assertEqual(conflict.reason, "competing_constraints")
        self.assertGreater(conflict.residual, conflict.tolerance)
        # The winner ends up satisfied at the grip anchor.
        grip = solution.components["farmer_01_hand_right"]["anchors"]["grip"]
        fruit = solution.components["tomato_01_body"]["world_transform"]
        self.assertAlmostEqual(grip["x"], fruit["x"])
        self.assertAlmostEqual(grip["y"], fruit["y"])

    def test_priority_order_is_the_only_thing_that_decides_the_winner(self):
        from bkt_web.constraint_solver import solver_for_scene

        flipped = solver_for_scene(scene_of(self.conflicting_story(low_priority=90, high_priority=10))).solve(3.0)
        self.assertEqual([item.constraint_id for item in flipped.conflicts], ["constraint_high"])
        interior = flipped.components["basket_01_body"]["anchors"]["interior"]
        fruit = flipped.components["tomato_01_body"]["world_transform"]
        self.assertAlmostEqual(interior["x"], fruit["x"])
        self.assertAlmostEqual(interior["y"], fruit["y"])

    def test_solver_terminates_within_the_pass_budget(self):
        from bkt_web.constraint_solver import solver_for_scene

        solution = solver_for_scene(scene_of(self.conflicting_story()), max_passes=4).solve(3.0)
        self.assertEqual(solution.passes, 4)
        self.assertFalse(solution.converged)

    def test_unsatisfiable_single_constraint_reports_pass_budget(self):
        from bkt_web.constraint_solver import solver_for_scene

        story = constraint_story([
            constraint(
                "constraint_soft_reach",
                "point_to_point",
                ["tomato_01_body", "farmer_01_grip_right"],
                strength="soft",
                weight=0.25,
            ),
        ])
        solution = solver_for_scene(scene_of(story), max_passes=2).solve(3.0)
        self.assertEqual(solution.passes, 2)
        self.assertEqual([item.reason for item in solution.conflicts], ["unsatisfiable_within_pass_budget"])
        self.assertEqual(solution.conflicts[0].competing_constraint_ids, ())


class ConstraintDeterminismTest(unittest.TestCase):
    def story(self):
        return constraint_story([
            constraint("constraint_grip_tomato", "anchor_contact", ["farmer_01_grip_right", "tomato_01_body"]),
            constraint("constraint_ground", "ground_contact", ["basket_01_body"], ground_y=640, strength="soft"),
        ])

    def test_seek_order_does_not_change_any_frame(self):
        from bkt_web.constraint_solver import solve_storyboard_constraints

        value = self.story()
        scene_id = value["scenes"][0]["scene_id"]
        forward = [solve_storyboard_constraints(value, scene_id, t / 2) for t in range(0, 13)]
        backward = [solve_storyboard_constraints(value, scene_id, t / 2) for t in range(12, -1, -1)]
        self.assertEqual(forward, list(reversed(backward)))

    def test_solving_does_not_mutate_the_storyboard(self):
        from bkt_web.constraint_solver import solve_storyboard_constraints

        value = self.story()
        before = copy.deepcopy(value)
        scene_id = value["scenes"][0]["scene_id"]
        solve_storyboard_constraints(value, scene_id, 3.0)
        self.assertEqual(value, before)

    def test_declaration_order_does_not_change_the_result(self):
        from bkt_web.component_lifecycle import runtime_for_scene
        from bkt_web.constraint_solver import ConstraintSolver

        specs = self.story()["scenes"][0]["constraints"]
        runtime = runtime_for_scene(scene_of(self.story()))
        forward = ConstraintSolver(runtime, specs).solve(3.0).as_dict()
        reversed_order = ConstraintSolver(runtime, list(reversed(specs))).solve(3.0).as_dict()
        self.assertEqual(forward, reversed_order)

    def test_snapshot_is_json_serialisable_and_stable(self):
        from bkt_web.constraint_solver import solve_storyboard_constraints

        value = self.story()
        scene_id = value["scenes"][0]["scene_id"]
        first = json.dumps(solve_storyboard_constraints(value, scene_id, 3.0), sort_keys=True)
        second = json.dumps(solve_storyboard_constraints(value, scene_id, 3.0), sort_keys=True)
        self.assertEqual(first, second)


class ConstraintValidationTest(unittest.TestCase):
    def test_unknown_type_is_routed_to_review_not_silently_dropped(self):
        from bkt_web.constraint_solver import solve_storyboard_constraints, unsupported_constraints

        value = constraint_story([constraint("constraint_lipsync", "lip_sync", ["farmer_01_body"])])
        scene = scene_of(value)
        self.assertEqual(unsupported_constraints(scene), ("constraint_lipsync",))
        payload = solve_storyboard_constraints(value, value["scenes"][0]["scene_id"], 3.0)
        self.assertEqual(payload["needs_review_constraint_ids"], ["constraint_lipsync"])
        self.assertEqual(payload["results"], [])

    def test_unknown_subject_reference_is_rejected(self):
        from bkt_web.constraint_solver import ConstraintError, ConstraintSolver
        from bkt_web.component_lifecycle import runtime_for_scene

        scene = scene_of(constraint_story([]))
        solver = ConstraintSolver(
            runtime_for_scene(scene),
            [constraint("constraint_ghost", "point_to_point", ["tomato_01_body", "ghost_component"])],
        )
        with self.assertRaisesRegex(ConstraintError, "ghost_component"):
            solver.solve(3.0)

    def test_invalid_parameters_are_rejected(self):
        from bkt_web.constraint_solver import ConstraintError, constraint_spec

        with self.assertRaisesRegex(ConstraintError, "tolerance"):
            constraint_spec(constraint("constraint_bad", "point_to_point", ["a", "b"], tolerance=0))
        with self.assertRaisesRegex(ConstraintError, "weight"):
            constraint_spec(constraint("constraint_bad", "point_to_point", ["a", "b"], weight=0))
        with self.assertRaisesRegex(ConstraintError, "số hữu hạn"):
            constraint_spec(constraint("constraint_bad", "point_to_point", ["a", "b"], tolerance=float("nan")))
        with self.assertRaisesRegex(ConstraintError, "chưa hỗ trợ"):
            constraint_spec(constraint("constraint_bad", "magnetism", ["a", "b"]))

    def test_duplicate_constraint_ids_and_bad_budget_are_rejected(self):
        from bkt_web.constraint_solver import ConstraintError, ConstraintSolver
        from bkt_web.component_lifecycle import runtime_for_scene

        runtime = runtime_for_scene(scene_of(constraint_story([])))
        duplicate = constraint("constraint_dup", "ground_contact", ["tomato_01_body"], ground_y=10)
        with self.assertRaisesRegex(ConstraintError, "trùng"):
            ConstraintSolver(runtime, [duplicate, copy.deepcopy(duplicate)])
        with self.assertRaisesRegex(ConstraintError, "max_passes"):
            ConstraintSolver(runtime, [], max_passes=0)

    def test_timestamp_outside_the_scene_is_rejected(self):
        from bkt_web.constraint_solver import ConstraintError, solve_storyboard_constraints

        value = constraint_story([])
        with self.assertRaisesRegex(ConstraintError, "ngoài scene"):
            solve_storyboard_constraints(value, value["scenes"][0]["scene_id"], 10_000)


if __name__ == "__main__":
    unittest.main()
