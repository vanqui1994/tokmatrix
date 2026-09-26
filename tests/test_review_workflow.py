import copy
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


EXAMPLES = Path(__file__).resolve().parent.parent / "bkt_web" / "schemas" / "examples"
DECIDED_AT = "2026-09-21T10:00:00Z"


def storyboard():
    return json.loads((EXAMPLES / "agriculture.storyboard-v2.json").read_text(encoding="utf-8"))


def session(value=None, profile_id="tiktok-fast"):
    from bkt_web.auto_director import direct
    from bkt_web.review_workflow import open_review

    value = value if value is not None else storyboard()
    return value, open_review(direct(value, profile_id=profile_id), value)


def approve_all(review, status="approved"):
    from bkt_web.review_workflow import empty_store, record_decision

    store = empty_store()
    for item in review["items"]:
        store = record_decision(store, review, item_id=item["item_id"], status=status, reviewer="qa.bot", decided_at=DECIDED_AT)
    return store


class ReviewSessionTest(unittest.TestCase):
    def test_review_opens_items_per_reviewable_subject(self):
        _value, review = session()
        self.assertTrue(review["items"])
        for item in review["items"]:
            self.assertIn(item["target_type"], {"scene", "action", "entity", "decision", "project"})
            self.assertTrue(item["reason_codes"])
            self.assertTrue(item["entry_key"].startswith("sha256:"))

    def test_low_confidence_decisions_are_opened_for_review(self):
        from bkt_web.auto_director import direct
        from bkt_web.review_workflow import open_review

        value = storyboard()
        plan = direct(value, profile_id="tiktok-fast")
        review = open_review(plan, value, low_confidence_threshold=1.0)
        decision_items = [item for item in review["items"] if item["target_type"] == "decision"]
        self.assertTrue(decision_items)
        self.assertIn("DECISION_LOW_CONFIDENCE", decision_items[0]["reason_codes"])

    def test_review_refuses_a_plan_from_a_different_source(self):
        from bkt_web.auto_director import direct
        from bkt_web.review_workflow import ReviewError, open_review

        value = storyboard()
        plan = direct(value, profile_id="tiktok-fast")
        other = storyboard()
        other["source"]["sha256"] = "9" * 64
        with self.assertRaises(ReviewError):
            open_review(plan, other)

    def test_review_is_deterministic(self):
        first = session()[1]
        second = session()[1]
        self.assertEqual(first, second)


class ReviewDecisionTest(unittest.TestCase):
    def test_recording_every_item_approves_the_release(self):
        from bkt_web.review_workflow import apply_review, is_release_approved

        _value, review = session()
        resolved = apply_review(review, approve_all(review))
        self.assertEqual(resolved["status"], "approved")
        self.assertEqual(resolved["pending_item_ids"], [])
        self.assertTrue(is_release_approved(resolved))

    def test_an_unreviewed_item_keeps_the_release_pending(self):
        from bkt_web.review_workflow import apply_review, empty_store, is_release_approved

        _value, review = session()
        resolved = apply_review(review, empty_store())
        self.assertEqual(resolved["status"], "pending")
        self.assertEqual(resolved["pending_item_ids"], sorted(item["item_id"] for item in review["items"]))
        self.assertFalse(is_release_approved(resolved))

    def test_a_rejection_outranks_other_verdicts(self):
        from bkt_web.review_workflow import apply_review

        _value, review = session()
        self.assertEqual(apply_review(review, approve_all(review, "rejected"))["status"], "rejected")
        self.assertEqual(apply_review(review, approve_all(review, "changes-requested"))["status"], "changes-requested")

    def test_recording_does_not_mutate_the_store_it_was_given(self):
        from bkt_web.review_workflow import empty_store, record_decision

        _value, review = session()
        store = empty_store()
        before = copy.deepcopy(store)
        record_decision(store, review, item_id=review["items"][0]["item_id"], status="approved", reviewer="qa.bot", decided_at=DECIDED_AT)
        self.assertEqual(store, before)

    def test_bad_verdicts_are_refused(self):
        from bkt_web.review_workflow import ReviewError, empty_store, record_decision

        _value, review = session()
        item_id = review["items"][0]["item_id"]
        for kwargs in (
            {"status": "looks-fine"},
            {"reviewer": "  "},
            {"decided_at": "2026-09-21"},
            {"item_id": "sha256:" + "0" * 64},
            {"note": "x" * 2001},
        ):
            payload = {"item_id": item_id, "status": "approved", "reviewer": "qa.bot", "decided_at": DECIDED_AT}
            payload.update(kwargs)
            with self.assertRaises(ReviewError):
                record_decision(empty_store(), review, **payload)


class ReviewInvalidationTest(unittest.TestCase):
    def test_a_new_source_hash_invalidates_earlier_approvals(self):
        from bkt_web.review_workflow import apply_review, invalidate

        value, review = session()
        store = approve_all(review)
        value["source"]["sha256"] = "3" * 64
        _value, next_review = session(value)
        result = invalidate(store, next_review)
        self.assertTrue(result["invalidated"])
        self.assertEqual({entry["reason"] for entry in result["invalidated"]}, {"SOURCE_HASH_CHANGED"})
        self.assertEqual(apply_review(next_review, result["store"])["status"], "pending")

    def test_a_new_schema_version_invalidates_earlier_approvals(self):
        from bkt_web.review_workflow import apply_review, invalidate

        _value, review = session()
        store = approve_all(review)
        for entry in store["entries"].values():
            entry["schema_version"] = "1.9.0"
        result = invalidate(store, review)
        self.assertEqual({entry["reason"] for entry in result["invalidated"]}, {"SCHEMA_VERSION_CHANGED"})
        self.assertEqual(apply_review(review, result["store"])["status"], "pending")

    def test_editing_the_reviewed_scene_invalidates_its_approval(self):
        from bkt_web.review_workflow import apply_review, invalidate

        value, review = session()
        scene_items = [item for item in review["items"] if item["target_type"] == "scene"]
        self.assertTrue(scene_items)
        store = approve_all(review)
        value["scenes"][0]["summary"] = "The farmer picks two tomatoes instead."
        _value, next_review = session(value)
        result = invalidate(store, next_review)
        self.assertEqual({entry["reason"] for entry in result["invalidated"]}, {"TARGET_CONTENT_CHANGED"})
        resolved = apply_review(next_review, result["store"])
        self.assertEqual(resolved["status"], "pending")
        self.assertEqual(resolved["items"][0]["review"]["stale_reason"], "TARGET_CONTENT_CHANGED")

    def test_an_untouched_storyboard_keeps_its_approvals(self):
        from bkt_web.review_workflow import apply_review, invalidate

        _value, review = session()
        store = approve_all(review)
        result = invalidate(store, review)
        self.assertEqual(result["invalidated"], [])
        self.assertEqual(apply_review(review, result["store"])["status"], "approved")

    def test_approvals_do_not_leak_between_projects(self):
        from bkt_web.review_workflow import apply_review

        _value, first = session()
        store = approve_all(first)
        other = json.loads((EXAMPLES / "talking-head.storyboard-v2.json").read_text(encoding="utf-8"))
        _other_value, second = session(other, profile_id="news")
        for item in apply_review(second, store)["items"]:
            self.assertEqual(item["review_status"], "pending")


class ReviewStoreTest(unittest.TestCase):
    def test_store_round_trips_through_disk(self):
        from bkt_web.review_workflow import load_store, save_store

        _value, review = session()
        store = approve_all(review)
        with TemporaryDirectory() as workdir:
            path = Path(workdir) / "nested" / "decisions.json"
            save_store(store, path)
            self.assertEqual(load_store(path), store)
            self.assertEqual(sorted(item.name for item in path.parent.iterdir()), ["decisions.json"])

    def test_missing_store_file_reads_as_empty(self):
        from bkt_web.review_workflow import empty_store, load_store

        with TemporaryDirectory() as workdir:
            self.assertEqual(load_store(Path(workdir) / "absent.json"), empty_store())

    def test_a_corrupt_store_is_rejected(self):
        from bkt_web.review_workflow import ReviewError, validate_store

        _value, review = session()
        for mutate in (
            lambda store: store.__setitem__("schema", "other/v1"),
            lambda store: list(store["entries"].values())[0].__setitem__("status", "maybe"),
            lambda store: list(store["entries"].values())[0].__setitem__("state", "unknown"),
            lambda store: list(store["entries"].values())[0].__setitem__("decided_at", "yesterday"),
            lambda store: list(store["entries"].values())[0].pop("fingerprint"),
        ):
            store = approve_all(review)
            mutate(store)
            with self.assertRaises(ReviewError):
                validate_store(store)


if __name__ == "__main__":
    unittest.main()
