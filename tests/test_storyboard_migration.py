import copy
import json
import subprocess
import unittest


class StoryboardMigrationTest(unittest.TestCase):
    @staticmethod
    def stories():
        from bkt_web.remake_vector import articulation_examples, examples, ik_examples

        return examples() + articulation_examples() + ik_examples()

    def test_all_native_examples_migrate_validate_and_round_trip_losslessly(self):
        from bkt_web.storyboard_migration import migrate_v1_to_v2, restore_v1_from_v2
        from bkt_web.universal_storyboard import validate_storyboard_v2

        for story in self.stories():
            with self.subTest(story=story["id"]):
                before = copy.deepcopy(story)
                migrated = migrate_v1_to_v2(story)
                validate_storyboard_v2(migrated)
                self.assertEqual(restore_v1_from_v2(migrated), story)
                self.assertEqual(story, before)
                self.assertEqual(
                    [(item["start"], item["end"]) for item in migrated["scenes"]],
                    [(item["start_time"], item["end_time"]) for item in story["scenes"]],
                )

    def test_speaker_identity_is_preserved_in_scoped_entity_metadata(self):
        from bkt_web.remake_vector import examples
        from bkt_web.storyboard_migration import V1_CUE_EXTENSION, V1_ID_EXTENSION, migrate_v1_to_v2

        story = examples()[0]
        migrated = migrate_v1_to_v2(story)
        event = migrated["scenes"][0]["audio_events"][0]
        entities = {item["entity_id"]: item for item in migrated["scenes"][0]["entities"]}
        self.assertEqual(entities[event["speaker_id"]]["extensions"][V1_ID_EXTENSION], story["cues"][0]["character_id"])
        self.assertEqual(event["extensions"][V1_CUE_EXTENSION]["character_id"], story["cues"][0]["character_id"])

    def test_cross_scene_cue_is_rejected_instead_of_retimed(self):
        from bkt_web.remake_vector import examples
        from bkt_web.storyboard_migration import StoryboardMigrationError, migrate_v1_to_v2

        story = examples()[0]
        story["cues"][0].update(start=7.9, end=8.1)
        with self.assertRaisesRegex(StoryboardMigrationError, "không tự chia lại timing"):
            migrate_v1_to_v2(story)

    def test_tampered_embedded_v1_payload_is_rejected(self):
        from bkt_web.remake_vector import examples
        from bkt_web.storyboard_migration import StoryboardMigrationError, V1_STORY_EXTENSION, migrate_v1_to_v2, restore_v1_from_v2

        migrated = migrate_v1_to_v2(examples()[0])
        migrated["extensions"][V1_STORY_EXTENSION]["name"] = "tampered"
        with self.assertRaisesRegex(StoryboardMigrationError, "checksum"):
            restore_v1_from_v2(migrated)

    def test_native_compiler_has_frame_sample_parity(self):
        from bkt_web.remake_vector import STATIC_DIR, catalog, examples
        from bkt_web.storyboard_migration import compile_v2_to_native_vector, migrate_v1_to_v2

        original = examples()[0]
        compiled = compile_v2_to_native_vector(migrate_v1_to_v2(original))
        program = r'''
const fs=require('fs'); require(process.argv[1]);
const {original,compiled,cat,times}=JSON.parse(fs.readFileSync(0,'utf8'));
for(const t of times){
  const a=JSON.stringify(RemakeVector.sample(original,cat,t));
  const b=JSON.stringify(RemakeVector.sample(compiled,cat,t));
  if(a!==b)throw Error(`frame sample mismatch at ${t}`);
}
'''
        result = subprocess.run(
            ["node", "-e", program, str(STATIC_DIR / "remake_vector_engine.js")],
            input=json.dumps({"original": original, "compiled": compiled, "cat": catalog(), "times": [0, 2, 7.999, 8, 11.999]}),
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
