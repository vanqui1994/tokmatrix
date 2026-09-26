import copy
import json
import tempfile
import unittest
from pathlib import Path


def storyboard():
    entity = lambda entity_id: {"entity_id": entity_id, "kind": "character", "label": "Lan", "attributes": {}}
    return {
        "project_id": "demo",
        "scenes": [
            {"scene_id": "s1", "start": 0.0, "end": 2.0, "entities": [entity("lan:wide")], "actions": [], "audio_events": []},
            {"scene_id": "s2", "start": 2.0, "end": 5.0, "entities": [entity("lan:close")], "actions": [], "audio_events": []},
        ],
    }


class CharacterBibleTest(unittest.TestCase):
    def test_identity_is_shared_across_scenes_and_deterministic(self):
        from bkt_web.character_bible import build_character_bible
        source = storyboard()
        before = copy.deepcopy(source)
        one = build_character_bible(source)
        two = build_character_bible(source)
        self.assertEqual(one, two)
        self.assertEqual(source, before)
        self.assertEqual(len(one["characters"]), 1)
        self.assertEqual(one["characters"][0]["scene_ids"], ["s1", "s2"])

    def test_appearance_is_injected_in_every_occurrence(self):
        from bkt_web.character_bible import apply_character_bible, build_character_bible
        bible = build_character_bible(storyboard())
        result = apply_character_bible(storyboard(), bible)
        attrs = [scene["entities"][0]["attributes"] for scene in result["scenes"]]
        self.assertEqual(attrs[0]["character_id"], attrs[1]["character_id"])
        self.assertEqual(attrs[0]["hair"], attrs[1]["hair"])
        self.assertEqual(attrs[0]["outfit"], attrs[1]["outfit"])

    def test_save_load_validates_review_document(self):
        from bkt_web.character_bible import load_character_bible, save_character_bible
        bible = __import__("bkt_web.character_bible", fromlist=["build_character_bible"]).build_character_bible(storyboard())
        bible["characters"][0]["status"] = "approved"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "character_bible.json"
            saved = save_character_bible(path, bible)
            self.assertEqual(saved["review_status"], "approved")
            self.assertEqual(load_character_bible(path), json.loads(path.read_text()))


class MotionLibraryTest(unittest.TestCase):
    def test_absolute_times_and_settle_are_seek_safe(self):
        from bkt_web.motion_library import motion_poses
        poses = motion_poses("point", 4.0, 7.0)
        self.assertEqual([p["time"] for p in poses][::3], [4.0, 7.0])
        self.assertEqual(poses[0]["hips"], poses[-1]["hips"])
        self.assertIn("hand_r", poses[2])

    def test_applies_motion_without_overwriting_authored_poses(self):
        from bkt_web.motion_library import apply_motion_library
        source = storyboard()
        source["scenes"][0]["entities"][0]["attributes"]["poses"] = [{"time": 0.0}]
        before = copy.deepcopy(source)
        result = apply_motion_library(source)
        self.assertEqual(source, before)
        self.assertEqual(result["scenes"][0]["entities"][0]["attributes"]["poses"], [{"time": 0.0}])
        self.assertEqual(result["scenes"][1]["entities"][0]["attributes"]["poses"][0]["time"], 2.0)


if __name__ == "__main__":
    unittest.main()
