import copy
import unittest
from types import SimpleNamespace
from unittest.mock import patch


def storyboard():
    from bkt_web.remake_vector import articulation_examples
    from bkt_web.storyboard_migration import migrate_v1_to_v2

    return migrate_v1_to_v2(articulation_examples()[0])


class SemanticAssetResolutionTest(unittest.TestCase):
    def test_unknown_named_entity_is_not_replaced_by_a_compatible_catalog_asset(self):
        from bkt_web.asset_resolver import AssetRequest, resolve_asset

        result = resolve_asset(AssetRequest(
            request_id="request.space-dragon",
            renderer_id="native-vector-v1",
            asset_id="space_dragon",
            required_capabilities={"actions": ["grip"]},
        ))

        self.assertEqual(result["status"], "needs-review")
        self.assertEqual(result["reason_code"], "NO_ASSET_ROUTE")
        self.assertIsNone(result["asset_id"])
        self.assertIn("ASSET_NOT_IN_MANIFEST", {item["reason"] for item in result["attempts"]})

    def test_exact_entity_label_can_resolve_a_reusable_asset(self):
        from bkt_web.auto_director import direct

        value = storyboard()
        entity = value["scenes"][0]["entities"][0]
        entity["attributes"].pop("asset")
        entity["label"] = "hand"

        plan = direct(value)
        decision = next(
            item for item in plan["decisions"]
            if item["kind"] == "asset" and item["target_id"].endswith(entity["entity_id"])
        )
        self.assertEqual(decision["value"]["asset_id"], "hand")
        self.assertEqual(decision["value"]["strategy"], "exact")
        self.assertEqual(plan["asset_gaps"], [])

    def test_unknown_entity_creates_a_named_gap_and_needs_review(self):
        from bkt_web.auto_director import direct

        value = storyboard()
        entity = value["scenes"][0]["entities"][0]
        entity["attributes"].pop("asset")
        entity["label"] = "Space Dragon"

        plan = direct(value)
        gap = next(item for item in plan["asset_gaps"] if item["entity_id"] == entity["entity_id"])
        self.assertEqual(plan["status"], "needs-review")
        self.assertEqual(gap["entity_name"], "Space Dragon")
        self.assertEqual(gap["requested_asset_id"], "space_dragon")
        self.assertEqual(gap["reason_code"], "NO_ASSET_ROUTE")
        self.assertIn("Space Dragon", gap["detail"])
        self.assertFalse(any(
            item["kind"] == "asset" and item["target_id"].endswith(entity["entity_id"])
            for item in plan["decisions"]
        ))


class ProductionAssetGateTest(unittest.TestCase):
    def test_assess_source_propagates_asset_gap_and_entity_name(self):
        from bkt_web.pipeline_route import assess_source

        value = storyboard()
        entity = value["scenes"][0]["entities"][0]
        entity["attributes"].pop("asset")
        entity["label"] = "Space Dragon"
        run = SimpleNamespace(payload={}, document=SimpleNamespace(analysis_id="analysis.asset-gap"))
        compiled = SimpleNamespace(storyboard=value, skipped=(), uncertainties=())

        with patch("bkt_web.analysis_probe.analyse_media", return_value=run), \
                patch("bkt_web.analysis_compiler.compile_storyboard", return_value=compiled):
            verdict = assess_source("unused.mp4")

        self.assertFalse(verdict.ok)
        self.assertIn("ASSET_NEEDS_REVIEW", verdict.reason_codes)
        self.assertEqual(verdict.asset_gaps[0]["entity_name"], "Space Dragon")
        payload = verdict.as_dict()
        self.assertEqual(payload["asset_gaps"][0]["entity_id"], entity["entity_id"])
        self.assertIn("Space Dragon", payload["reasons"][-1])

    def test_manifest_capabilities_include_every_registry_asset_state(self):
        # A catalog addition without its _asset_states declaration changes
        # this derived contract and must be accompanied by a test update.
        from bkt_web.asset_manifest import native_manifest
        from bkt_web.capability_registry import inspect_registry

        manifest = native_manifest()
        registry = inspect_registry()
        self.assertEqual(set(manifest["assets"]), set(registry["assets"]))
        for asset_id, entry in registry["assets"].items():
            with self.subTest(asset=asset_id):
                self.assertEqual(
                    manifest["assets"][asset_id]["capabilities"]["states"],
                    sorted(entry["states"]),
                )


if __name__ == "__main__":
    unittest.main()
