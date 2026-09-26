import hashlib
import json
import math
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "universal_video"
EXPECTED_CATEGORIES = {
    "agriculture",
    "talking_head",
    "product_review",
    "ui_tutorial",
    "infographic",
    "footage_composite",
}


def _load_json(path: Path):
    return json.loads(
        path.read_text(encoding="utf-8"),
        parse_constant=lambda value: (_ for _ in ()).throw(
            ValueError(f"non-finite JSON value: {value}")
        ),
    )


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _fixture_path(relative: str) -> Path:
    candidate = (FIXTURE_ROOT / relative).resolve()
    candidate.relative_to(FIXTURE_ROOT.resolve())
    return candidate


class UniversalVideoGoldenFixtureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = _load_json(FIXTURE_ROOT / "manifest.json")
        cls.expectations = _load_json(FIXTURE_ROOT / "expectations.json")

    def test_manifest_has_all_six_categories_and_matching_expectations(self):
        manifest_rows = self.manifest["fixtures"]
        expectation_rows = self.expectations["fixtures"]
        self.assertEqual(
            {row["category"] for row in manifest_rows}, EXPECTED_CATEGORIES
        )
        self.assertEqual(
            {row["category"] for row in expectation_rows}, EXPECTED_CATEGORIES
        )
        self.assertEqual(
            {(row["id"], row["category"]) for row in manifest_rows},
            {(row["id"], row["category"]) for row in expectation_rows},
        )
        self.assertEqual(len(manifest_rows), len({row["id"] for row in manifest_rows}))

    def test_media_is_small_offline_safe_and_matches_integrity_ledger(self):
        total_size = 0
        for row in self.manifest["fixtures"]:
            media = row["media"]
            self.assertFalse(media["network_required"])
            self.assertEqual(media["media_type"], "image/svg+xml")
            self.assertEqual(media["license"], "CC0-1.0")
            self.assertTrue(media["provenance"])
            path = _fixture_path(media["path"])
            self.assertTrue(path.is_file())
            self.assertEqual(_sha256(path), media["sha256"])
            total_size += path.stat().st_size

            root = ET.fromstring(path.read_bytes())
            self.assertTrue(root.tag.endswith("svg"))
            for element in root.iter():
                self.assertFalse(element.tag.endswith("script"))
                for name, value in element.attrib.items():
                    if name.endswith("href"):
                        self.assertFalse(value.startswith(("http:", "https:", "//")))

        self.assertLess(total_size, 32 * 1024)
        expected_file = _fixture_path(self.manifest["expectations"]["path"])
        self.assertEqual(
            _sha256(expected_file), self.manifest["expectations"]["sha256"]
        )

    def test_timing_speakers_entities_actions_and_fallback_are_explicit(self):
        for fixture in self.expectations["fixtures"]:
            expected = fixture["expected"]
            duration = expected["duration_seconds"]
            self.assertTrue(math.isfinite(duration) and duration > 0)
            entity_ids = {entity["id"] for entity in expected["entities"]}
            speaker_ids = {speaker["id"] for speaker in expected["speakers"]}
            self.assertEqual(len(entity_ids), len(expected["entities"]))
            self.assertEqual(len(speaker_ids), len(expected["speakers"]))
            for speaker in expected["speakers"]:
                self.assertIn(speaker["entity_id"], entity_ids)

            observed_actions = set()
            previous_end = 0.0
            for scene in expected["scenes"]:
                self.assertEqual(scene["start"], previous_end)
                self.assertGreater(scene["end"], scene["start"])
                self.assertLessEqual(scene["end"], duration)
                self.assertTrue(set(scene["entity_ids"]).issubset(entity_ids))
                self.assertTrue(set(scene["speaker_ids"]).issubset(speaker_ids))
                for action in scene["actions"]:
                    self.assertIn(action["actor"], entity_ids)
                    if action["target"] is not None:
                        self.assertIn(action["target"], entity_ids)
                    self.assertGreaterEqual(action["start"], scene["start"])
                    self.assertGreater(action["end"], action["start"])
                    self.assertLessEqual(action["end"], scene["end"])
                    observed_actions.add(action["type"])
                previous_end = scene["end"]
            self.assertEqual(previous_end, duration)
            self.assertEqual(observed_actions, set(expected["action_types"]))

            for cue in expected["dialogue"]:
                self.assertIn(cue["speaker_id"], speaker_ids)
                self.assertGreaterEqual(cue["start"], 0)
                self.assertGreater(cue["end"], cue["start"])
                self.assertLessEqual(cue["end"], duration)
                self.assertTrue(cue["text"])

            fallback = expected["fallback"]
            self.assertIs(fallback["allowed"], True)
            self.assertIn(fallback["route"], {"footage-composite", "needs-review"})
            self.assertIn(
                fallback["completion_claim"], {"partial-remake", "needs-review"}
            )
            self.assertTrue(fallback["reason_code"])

    def test_json_fixture_inputs_are_stable_and_do_not_require_network(self):
        first_manifest = _load_json(FIXTURE_ROOT / "manifest.json")
        first_expectations = _load_json(FIXTURE_ROOT / "expectations.json")
        second_manifest = _load_json(FIXTURE_ROOT / "manifest.json")
        second_expectations = _load_json(FIXTURE_ROOT / "expectations.json")
        self.assertEqual(first_manifest, second_manifest)
        self.assertEqual(first_expectations, second_expectations)
        serialized = json.dumps(
            {"manifest": first_manifest, "expectations": first_expectations},
            sort_keys=True,
            allow_nan=False,
        )
        self.assertNotIn("TEST_TOKEN", serialized)
        self.assertNotIn("credential", serialized.lower())


if __name__ == "__main__":
    unittest.main()
