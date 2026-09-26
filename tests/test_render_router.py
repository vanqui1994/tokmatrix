import copy
import unittest


class RenderRouterTest(unittest.TestCase):
    def migrated(self):
        from bkt_web.remake_vector import articulation_examples
        from bkt_web.storyboard_migration import migrate_v1_to_v2

        return migrate_v1_to_v2(articulation_examples()[0])

    def test_native_scene_routes_and_input_is_not_mutated(self):
        from bkt_web.render_router import route_storyboard

        value = self.migrated()
        before = copy.deepcopy(value)
        routed = route_storyboard(value)
        self.assertEqual(routed["render_plan"]["status"], "routable")
        self.assertEqual(routed["render_plan"]["selections"][0]["renderer_id"], "native-vector-v1")
        self.assertEqual(routed["render_plan"]["selections"][0]["status"], "selected")
        self.assertEqual(value, before)

    def test_missing_hard_capability_becomes_needs_review_with_reason(self):
        from bkt_web.render_router import route_storyboard
        from bkt_web.universal_storyboard import validate_storyboard_v2

        value = self.migrated()
        scene = value["scenes"][0]
        scene["render_requirements"]["required"].append({
            "requirement_id": "requirement:cloth-simulation",
            "capability": "action.cloth_simulation",
            "target_ids": [scene["actions"][0]["action_id"]],
        })
        routed = route_storyboard(value)
        validate_storyboard_v2(routed)
        plan = routed["render_plan"]
        self.assertEqual(plan["status"], "needs-review")
        self.assertEqual(plan["selections"][0]["status"], "needs-review")
        self.assertEqual(plan["fallbacks"][0]["reason_code"], "REQUIRED_CAPABILITY_MISSING")
        self.assertTrue(plan["fallbacks"][0]["approval_required"])
        self.assertIn("requirement:cloth-simulation", plan["fallbacks"][0]["affected_requirement_ids"])
        self.assertEqual(plan["fallbacks"][0]["source_media_usage"], "none")

    def test_preferred_gap_does_not_override_hard_capability_match(self):
        from bkt_web.render_router import route_storyboard

        value = self.migrated()
        scene = value["scenes"][0]
        scene["render_requirements"]["preferred"].append({
            "requirement_id": "requirement:photorealism",
            "capability": "fidelity.photorealism",
            "target_ids": [scene["entities"][0]["entity_id"]],
            "tolerance": 0.9,
        })
        routed = route_storyboard(value)
        self.assertEqual(routed["render_plan"]["status"], "routable")
        selection = routed["render_plan"]["selections"][0]
        self.assertEqual(selection["status"], "selected")
        self.assertIn("thiếu 1 capability ưu tiên", selection["explanation"])

    def test_hard_limit_violation_requires_review(self):
        from bkt_web.capability_registry import inspect_registry
        from bkt_web.render_router import route_storyboard

        value = self.migrated()
        registry = inspect_registry()
        registry["renderers"]["native-vector-v1"]["limits"]["max_scene_duration_seconds"] = 1
        routed = route_storyboard(value, registry=registry)
        self.assertEqual(routed["render_plan"]["fallbacks"][0]["reason_code"], "RENDERER_LIMIT_EXCEEDED")

    def test_router_result_is_deterministic(self):
        from bkt_web.render_router import route_storyboard

        value = self.migrated()
        self.assertEqual(route_storyboard(value), route_storyboard(value))


if __name__ == "__main__":
    unittest.main()
