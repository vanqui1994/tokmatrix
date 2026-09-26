import copy
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def agriculture():
    return json.loads((ROOT / "bkt_web/schemas/examples/agriculture.storyboard-v2.json").read_text(encoding="utf-8"))


def lifecycle_story():
    value = agriculture()
    scene = value["scenes"][0]
    tomato = next(item for item in scene["entities"] if item["entity_id"] == "tomato_01")
    tomato["components"].insert(0, {
        "component_id": "tomato_01_plant",
        "kind": "plant",
        "state": "visible",
        "anchors": [{"anchor_id": "tomato_01_plant_stem", "name": "stem"}],
        "attributes": {"transform": {"x": 100, "y": 200, "rotation": 12}},
    })
    fruit = next(item for item in tomato["components"] if item["component_id"] == "tomato_01_body")
    fruit["parent_component_id"] = "tomato_01_plant"
    fruit["attributes"] = {
        "transform": {"x": 18, "y": -42, "rotation": -12},
        "anchor_transforms": {"stem": {"x": 0, "y": -9}},
        "growth_stage": 1,
    }
    detach = next(item for item in scene["actions"] if item["action_id"] == "action_detach")
    detach["type"] = "pluck"
    detach["target_ids"] = ["tomato_01_body"]
    detach["end"] = 3
    return value


class ComponentLifecycleTest(unittest.TestCase):
    def test_pluck_compiles_to_absolute_detach_without_jump(self):
        from bkt_web.component_lifecycle import runtime_for_scene
        from bkt_web.universal_storyboard import validate_storyboard_v2

        model = validate_storyboard_v2(lifecycle_story())
        runtime = runtime_for_scene(model.scenes[0])
        before = runtime.sample(3 - 1e-9)["tomato_01_body"]
        after = runtime.sample(3)["tomato_01_body"]
        self.assertEqual(before.state, "attached")
        self.assertEqual(after.state, "detached")
        self.assertIsNone(after.parent_id)
        self.assertAlmostEqual(before.world_transform.x, after.world_transform.x)
        self.assertAlmostEqual(before.world_transform.y, after.world_transform.y)

    def test_cut_detach_marks_damage_and_join_can_reattach(self):
        from bkt_web.component_lifecycle import runtime_for_scene
        from bkt_web.universal_storyboard import validate_storyboard_v2

        value = lifecycle_story()
        scene = value["scenes"][0]
        detach = next(item for item in scene["actions"] if item["action_id"] == "action_detach")
        detach["type"] = "cut-detach"
        scene["actions"].append({
            "action_id": "action_join_fruit",
            "type": "join",
            "actor_ids": ["farmer_01"],
            "target_ids": ["tomato_01_body"],
            "start": 4,
            "end": 5,
            "parameters": {"parent_component_id": "farmer_01_hand_right"},
            "provenance_id": "provenance_human",
        })
        model = validate_storyboard_v2(value)
        runtime = runtime_for_scene(model.scenes[0])
        self.assertEqual(runtime.sample(3)["tomato_01_body"].state, "damaged")
        before = runtime.sample(5 - 1e-9)["tomato_01_body"].world_transform
        joined = runtime.sample(5)["tomato_01_body"]
        self.assertEqual(joined.state, "attached")
        self.assertEqual(joined.parent_id, "farmer_01_hand_right")
        self.assertAlmostEqual(before.x, joined.world_transform.x)
        self.assertAlmostEqual(before.y, joined.world_transform.y)

    def test_lifecycle_sampling_is_seek_safe_and_does_not_mutate_story(self):
        from bkt_web.component_lifecycle import sample_storyboard_components

        value = lifecycle_story()
        before = copy.deepcopy(value)
        scene_id = value["scenes"][0]["scene_id"]
        late = sample_storyboard_components(value, scene_id, 5.5)
        early = sample_storyboard_components(value, scene_id, 1)
        self.assertEqual(late, sample_storyboard_components(value, scene_id, 5.5))
        self.assertEqual(early["tomato_01_body"]["state"], "attached")
        self.assertEqual(value, before)

    def test_invalid_or_cyclic_parent_is_rejected_before_sampling(self):
        from bkt_web.component_lifecycle import runtime_for_scene
        from bkt_web.component_runtime import ComponentRuntimeError
        from bkt_web.universal_storyboard import UniversalStoryboardV2

        value = lifecycle_story()
        scene = value["scenes"][0]
        next(item for item in scene["actions"] if item["action_id"] == "action_detach")["type"] = "place"
        scene["actions"].append({
            "action_id": "action_bad_join",
            "type": "join",
            "actor_ids": ["farmer_01"],
            "target_ids": ["tomato_01_plant"],
            "start": 2,
            "end": 2.5,
            "parameters": {"parent_component_id": "tomato_01_body"},
            "provenance_id": "provenance_human",
        })
        model = UniversalStoryboardV2.model_validate(value)
        with self.assertRaisesRegex(ComponentRuntimeError, "cycle"):
            runtime_for_scene(model.scenes[0])


if __name__ == "__main__":
    unittest.main()
