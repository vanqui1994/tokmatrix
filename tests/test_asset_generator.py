"""Tests for the generated asset pipeline (UV-902)."""

import hashlib
import json
import unittest


class GeneratePlaceholdersTest(unittest.TestCase):
    """generate_placeholders builds placeholder assets from asset gaps."""

    def test_character_gets_puppet_rig(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [{"entity_name": "con bò", "entity_kind": "animal"}]
        result = generate_placeholders(gaps)
        self.assertEqual(len(result.assets), 1)
        asset = result.assets[0]
        self.assertIsNotNone(asset.rig_id)
        self.assertEqual(asset.entity_name, "con bò")
        self.assertEqual(asset.provenance["kind"], "generated")
        self.assertTrue(asset.provenance["is_placeholder"])
        self.assertEqual(asset.licence, "original-owned")

    def test_child_keyword_selects_child_rig(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [{"entity_name": "bé Lan", "entity_kind": "character"}]
        result = generate_placeholders(gaps)
        self.assertEqual(result.assets[0].rig_id, "puppet.rig.child")

    def test_presenter_keyword_selects_presenter_rig(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [{"entity_name": "MC Quyền Linh", "entity_kind": "human"}]
        result = generate_placeholders(gaps)
        self.assertEqual(result.assets[0].rig_id, "puppet.rig.presenter")

    def test_object_gets_no_rig(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [{"entity_name": "cái bàn", "entity_kind": "object"}]
        result = generate_placeholders(gaps)
        self.assertIsNone(result.assets[0].rig_id)
        self.assertEqual(result.assets[0].skin, "#c0c0c0")

    def test_deterministic_colour_from_name(self):
        from bkt_web.asset_generator import generate_placeholders

        result1 = generate_placeholders([{"entity_name": "robot", "entity_kind": "character"}])
        result2 = generate_placeholders([{"entity_name": "robot", "entity_kind": "character"}])
        self.assertEqual(result1.assets[0].outfit, result2.assets[0].outfit)

    def test_different_names_get_different_colours(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [
            {"entity_name": "alpha", "entity_kind": "character"},
            {"entity_name": "beta", "entity_kind": "character"},
        ]
        result = generate_placeholders(gaps)
        # Very unlikely to collide with SHA-256 diversity
        self.assertEqual(len(result.assets), 2)
        # Both should have valid hex colours
        for asset in result.assets:
            self.assertTrue(asset.outfit.startswith("#"))

    def test_duplicate_names_deduplicated(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [
            {"entity_name": "cow", "entity_kind": "animal"},
            {"entity_name": "cow", "entity_kind": "animal"},
        ]
        result = generate_placeholders(gaps)
        self.assertEqual(len(result.assets), 1)

    def test_missing_entity_name_produces_warning(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [{"entity_kind": "character"}]
        result = generate_placeholders(gaps)
        self.assertEqual(len(result.assets), 0)
        self.assertTrue(any("entity_name" in w for w in result.warnings))

    def test_empty_gaps_returns_empty(self):
        from bkt_web.asset_generator import generate_placeholders

        result = generate_placeholders([])
        self.assertEqual(len(result.assets), 0)
        self.assertEqual(len(result.warnings), 0)

    def test_checksum_is_deterministic(self):
        from bkt_web.asset_generator import generate_placeholders

        r1 = generate_placeholders([{"entity_name": "dog", "entity_kind": "animal"}])
        r2 = generate_placeholders([{"entity_name": "dog", "entity_kind": "animal"}])
        self.assertEqual(r1.assets[0].checksum, r2.assets[0].checksum)
        self.assertTrue(r1.assets[0].checksum.startswith("sha256:"))

    def test_serialisation_round_trip(self):
        from bkt_web.asset_generator import generate_placeholders

        gaps = [
            {"entity_name": "cow", "entity_kind": "animal"},
            {"entity_name": "table", "entity_kind": "object"},
        ]
        result = generate_placeholders(gaps)
        payload = result.as_dict()
        self.assertEqual(payload["schema"], "tokmatrix.asset-generator/v1")
        self.assertEqual(payload["generated_count"], 2)
        # JSON round-trip
        restored = json.loads(json.dumps(payload))
        self.assertEqual(restored, payload)


class InjectAssetsTest(unittest.TestCase):
    """inject_generated_assets patches storyboard entities with generated assets."""

    def _storyboard(self):
        return {
            "scenes": [
                {
                    "scene_id": "s1",
                    "entities": [
                        {"entity_id": "e1", "label": "cow", "kind": "animal", "attributes": {}},
                        {"entity_id": "e2", "label": "farmer", "kind": "character", "attributes": {"rig": "puppet.rig.adult"}},
                    ],
                },
            ],
        }

    def test_injects_rig_and_colours(self):
        from bkt_web.asset_generator import generate_placeholders, inject_generated_assets

        result = generate_placeholders([{"entity_name": "cow", "entity_kind": "animal"}])
        storyboard = self._storyboard()
        patched = inject_generated_assets(storyboard, result)
        # Original not mutated
        self.assertNotIn("rig", storyboard["scenes"][0]["entities"][0]["attributes"])
        # Patched has rig
        entity = patched["scenes"][0]["entities"][0]
        self.assertIn("rig", entity["attributes"])
        self.assertIn("skin", entity["attributes"])
        self.assertIn("outfit", entity["attributes"])
        self.assertEqual(entity["attributes"]["provenance"]["kind"], "generated")

    def test_does_not_overwrite_existing_rig(self):
        from bkt_web.asset_generator import generate_placeholders, inject_generated_assets

        result = generate_placeholders([{"entity_name": "farmer", "entity_kind": "character"}])
        patched = inject_generated_assets(self._storyboard(), result)
        # Farmer already had rig set
        entity = patched["scenes"][0]["entities"][1]
        self.assertEqual(entity["attributes"]["rig"], "puppet.rig.adult")

    def test_matches_schema_label_and_prefers_entity_id(self):
        from bkt_web.asset_generator import generate_placeholders, inject_generated_assets

        result = generate_placeholders([{"entity_id": "e1", "entity_name": "renamed", "entity_kind": "character"}])
        patched = inject_generated_assets(self._storyboard(), result)
        self.assertEqual(patched["scenes"][0]["entities"][0]["attributes"]["rig"], "puppet.rig.adult")


if __name__ == "__main__":
    unittest.main()
