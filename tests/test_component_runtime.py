import copy
import unittest


class ComponentRuntimeTest(unittest.TestCase):
    @staticmethod
    def definitions():
        return [
            {
                "component_id": "plant",
                "local_transform": {"x": 100, "y": 200, "rotation": 10},
                "anchors": {"stem": {"x": 0, "y": -40}},
                "growth_stage": 0.4,
            },
            {
                "component_id": "fruit",
                "parent_id": "plant",
                "state": "attached",
                "local_transform": {"x": 20, "y": -35, "rotation": -10},
                "anchors": {"grip": {"x": 0, "y": -8}},
                "attributes": {"asset": "tomato"},
            },
        ]

    def test_parent_child_world_transform_and_named_anchor(self):
        from bkt_web.component_runtime import ComponentTreeRuntime

        frame = ComponentTreeRuntime(self.definitions()).sample(0)
        fruit = frame["fruit"]
        self.assertAlmostEqual(fruit.world_transform.rotation, 0)
        self.assertNotEqual(fruit.world_transform.x, 20)
        self.assertNotEqual(fruit.anchors["grip"].y, fruit.world_transform.y)
        self.assertEqual(frame["plant"].growth_stage, 0.4)

    def test_detach_preserves_world_transform_and_backward_seek(self):
        from bkt_web.component_runtime import ComponentTreeRuntime

        runtime = ComponentTreeRuntime(self.definitions(), [{
            "event_id": "detach-fruit",
            "component_id": "fruit",
            "time": 2,
            "parent_id": None,
            "state": "detached",
            "preserve_world": True,
        }])
        before = runtime.sample(2 - 1e-9)["fruit"]
        at = runtime.sample(2)["fruit"]
        self.assertEqual(at.state, "detached")
        self.assertIsNone(at.parent_id)
        self.assertAlmostEqual(before.world_transform.x, at.world_transform.x)
        self.assertAlmostEqual(before.world_transform.y, at.world_transform.y)
        late = runtime.snapshot(5)
        self.assertEqual(runtime.snapshot(1), runtime.snapshot(1))
        self.assertEqual(late, runtime.snapshot(5))
        self.assertEqual(runtime.sample(1)["fruit"].state, "attached")

    def test_attach_preserves_world_transform(self):
        from bkt_web.component_runtime import ComponentTreeRuntime

        definitions = self.definitions()
        definitions[1]["parent_id"] = None
        definitions[1]["state"] = "detached"
        definitions[1]["local_transform"] = {"x": 180, "y": 120, "rotation": 25}
        runtime = ComponentTreeRuntime(definitions, [{
            "event_id": "join-fruit",
            "component_id": "fruit",
            "time": 3,
            "parent_id": "plant",
            "state": "attached",
        }])
        before = runtime.sample(3 - 1e-9)["fruit"].world_transform
        after = runtime.sample(3)["fruit"].world_transform
        self.assertAlmostEqual(before.x, after.x)
        self.assertAlmostEqual(before.y, after.y)
        self.assertAlmostEqual(before.rotation, after.rotation)

    def test_state_growth_and_explicit_transform_event(self):
        from bkt_web.component_runtime import ComponentTreeRuntime

        runtime = ComponentTreeRuntime(self.definitions(), [{
            "event_id": "damage-fruit",
            "component_id": "fruit",
            "time": 1,
            "state": "damaged",
            "growth_stage": 0.8,
            "local_transform": {"x": 30, "y": -20, "rotation": 5},
        }])
        fruit = runtime.sample(1)["fruit"]
        self.assertEqual(fruit.state, "damaged")
        self.assertEqual(fruit.growth_stage, 0.8)
        self.assertEqual(fruit.local_transform.x, 30)

    def test_static_and_event_cycles_are_rejected(self):
        from bkt_web.component_runtime import ComponentRuntimeError, ComponentTreeRuntime

        definitions = self.definitions()
        definitions[0]["parent_id"] = "fruit"
        with self.assertRaisesRegex(ComponentRuntimeError, "cycle"):
            ComponentTreeRuntime(definitions)
        with self.assertRaisesRegex(ComponentRuntimeError, "cycle"):
            ComponentTreeRuntime(self.definitions(), [{
                "event_id": "bad-cycle",
                "component_id": "plant",
                "time": 2,
                "parent_id": "fruit",
            }])

    def test_inputs_are_not_mutated_and_invalid_numbers_are_rejected(self):
        from bkt_web.component_runtime import ComponentEvent, ComponentRuntimeError, ComponentTreeRuntime

        definitions = self.definitions()
        original = copy.deepcopy(definitions)
        runtime = ComponentTreeRuntime(definitions)
        runtime.sample(4)
        self.assertEqual(definitions, original)
        event = ComponentEvent(event_id="damage", component_id="fruit", time=1, state="damaged")
        self.assertEqual(ComponentTreeRuntime(definitions, [event]).sample(1)["fruit"].state, "damaged")
        invalid = self.definitions()
        invalid[0]["local_transform"]["x"] = float("nan")
        with self.assertRaises(ComponentRuntimeError):
            ComponentTreeRuntime(invalid)


if __name__ == "__main__":
    unittest.main()
