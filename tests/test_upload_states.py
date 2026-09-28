import unittest

from bkt_web import upload_states as us
from bkt_web import publish_flow
from bkt_web.autopilot import cleanup


class UploadStateVocabularyTest(unittest.TestCase):
    def test_state_groups_only_use_known_states(self):
        for group in (us.QUEUE_STATES, us.SLOT_BLOCKING_STATES, us.ISSUE_STATES, us.TERMINAL_STATES):
            self.assertTrue(set(group).issubset(us.ALL_STATES))

    def test_uncertain_post_blocks_slot_but_is_not_terminal(self):
        self.assertIn(us.NEEDS_CHECK, us.SLOT_BLOCKING_STATES)
        self.assertNotIn(us.NEEDS_CHECK, us.TERMINAL_STATES)
        self.assertIn(us.NEEDS_CHECK, us.ISSUE_STATES)

    def test_modules_share_the_canonical_states(self):
        self.assertEqual(publish_flow.NEARBY_BLOCKING_STATUSES, us.SLOT_BLOCKING_STATES)
        self.assertEqual(
            cleanup.ACTIVE_TASK_STATUSES,
            (us.QUEUED, us.PENDING, us.UPLOADING, us.WAITING_RENDER, us.NEEDS_CHECK),
        )

    def test_sql_marks_matches_group_size(self):
        self.assertEqual(us.sql_marks(us.QUEUE_STATES), "?,?")
        with self.assertRaises(ValueError):
            us.sql_marks(())


if __name__ == "__main__":
    unittest.main()
