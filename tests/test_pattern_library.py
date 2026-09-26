import copy
import json
import unittest


STAMP = "2026-09-21T02:00:00Z"
SOURCE_HASH = "a" * 64


def approval(**overrides):
    from bkt_web.pattern_library import Approval

    values = {
        "approved_by": "reviewer.mai",
        "approved_at": STAMP,
        "source_hash": SOURCE_HASH,
        "review_id": "review.one",
        "fidelity_kinds": ("structural", "geometric"),
    }
    values.update(overrides)
    return Approval(**values)


def pattern(pattern_id="pattern.harvest", kind="action_sequence", payload=None, **overrides):
    from bkt_web.pattern_library import Pattern

    payloads = {
        "action_sequence": {"steps": [{"type": "reach"}, {"type": "grip"}, {"type": "place"}]},
        "scene": {"beats": [{"beat": "establish"}, {"beat": "payoff"}]},
        "camera": {"movement": "push-in", "magnitude": 0.2},
        "fix": {"problem": "The fruit jumped at detach.", "resolution": "Keep the world transform on detach."},
    }
    values = {
        "pattern_id": pattern_id,
        "kind": kind,
        "title": "Harvest in three beats",
        "genre": "agriculture",
        "payload": payload if payload is not None else payloads[kind],
        "approval": approval(),
        "tags": ("harvest", "hand"),
    }
    values.update(overrides)
    return Pattern(**values)


def library(patterns=None):
    from bkt_web.pattern_library import PatternLibrary

    return PatternLibrary(patterns=tuple(patterns if patterns is not None else [pattern()]))


class AdmissionTest(unittest.TestCase):
    def test_a_pattern_of_each_kind_is_accepted(self):
        from bkt_web.pattern_library import PATTERN_KINDS

        items = [pattern(f"pattern.{kind}", kind) for kind in PATTERN_KINDS]
        store = library(items)
        self.assertEqual(len(store.patterns), 4)
        for kind in PATTERN_KINDS:
            self.assertEqual(len(store.of_kind(kind)), 1)

    def test_each_kind_must_carry_the_fields_that_make_it_reusable(self):
        from bkt_web.pattern_library import PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "action_sequence cần steps"):
            pattern(kind="action_sequence", payload={"note": "nothing"})
        with self.assertRaisesRegex(PatternLibraryError, "scene cần beats"):
            pattern(kind="scene", payload={"note": "nothing"})
        with self.assertRaisesRegex(PatternLibraryError, "movement"):
            pattern(kind="camera", payload={"note": "nothing"})
        with self.assertRaisesRegex(PatternLibraryError, "resolution"):
            pattern(kind="fix", payload={"problem": "something broke"})

    def test_a_pattern_needs_an_approval_with_a_fidelity_run(self):
        from bkt_web.pattern_library import PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "ít nhất một loại fidelity"):
            approval(fidelity_kinds=())
        with self.assertRaisesRegex(PatternLibraryError, "source_hash"):
            approval(source_hash="nope")

    def test_duplicate_ids_and_duplicate_content_are_both_rejected(self):
        from bkt_web.pattern_library import PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "pattern_id bị trùng"):
            library([pattern(), pattern()])
        with self.assertRaisesRegex(PatternLibraryError, "trùng nội dung"):
            library([pattern("pattern.one"), pattern("pattern.two")])


class SecretTest(unittest.TestCase):
    def test_a_payload_carrying_a_credential_field_is_refused(self):
        from bkt_web.pattern_library import PatternLibraryError

        for field_name in ("password", "api_key", "access_token", "session_cookie", "refresh-token", "authorization"):
            with self.subTest(field=field_name):
                with self.assertRaises(PatternLibraryError) as caught:
                    pattern(payload={"steps": [{"type": "grip"}], field_name: "TEST_TOKEN_DO_NOT_USE"})
                message = str(caught.exception)
                self.assertIn(field_name, message)
                # The refusal names the field and never echoes the value.
                self.assertNotIn("TEST_TOKEN_DO_NOT_USE", message)

    def test_a_credential_shaped_value_is_refused_without_being_echoed(self):
        from bkt_web.pattern_library import PatternLibraryError

        for value in ("Bearer abcdefghijklmnopqrstu", "sk-abcdefghijklmnopqrstuvwx", "ghp_abcdefghijklmnopqrstuvwxyz0123"):
            with self.subTest(value=value[:6]):
                with self.assertRaises(PatternLibraryError) as caught:
                    pattern(payload={"steps": [{"type": "grip"}], "note": value})
                self.assertNotIn(value, str(caught.exception))

    def test_a_credential_nested_deep_in_the_payload_is_still_caught(self):
        from bkt_web.pattern_library import PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, r"payload\.steps\[0\]\.auth\.token"):
            pattern(payload={"steps": [{"type": "grip", "auth": {"token": "x" * 40}}]})

    def test_an_ordinary_payload_passes(self):
        item = pattern(payload={"steps": [{"type": "grip", "parameters": {"tolerance": 0.5}}]})
        self.assertEqual(item.payload["steps"][0]["parameters"]["tolerance"], 0.5)


class MediaTest(unittest.TestCase):
    def test_reusable_media_is_allowed(self):
        from bkt_web.pattern_library import MediaReference

        item = pattern(media=(MediaReference("asset.leaf", "CC0-1.0", "b" * 64),))
        self.assertEqual(item.media[0].checksum, "sha256:" + "b" * 64)

    def test_media_without_a_reusable_licence_is_refused(self):
        from bkt_web.pattern_library import MediaReference, PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "không cho phép tái sử dụng"):
            MediaReference("asset.clip", "all-rights-reserved", "b" * 64)

    def test_media_taken_from_the_source_is_refused(self):
        from bkt_web.pattern_library import MediaReference, PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "lấy từ nguồn"):
            MediaReference("asset.frame", "CC0-1.0", "b" * 64, origin="source")

    def test_a_bad_checksum_is_refused(self):
        from bkt_web.pattern_library import MediaReference, PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "SHA-256"):
            MediaReference("asset.leaf", "CC0-1.0", "not-a-hash")


class PromotionTest(unittest.TestCase):
    def manifest(self, **overrides):
        import test_render_manifest as manifests

        return manifests.build(**overrides)

    def promote(self, manifest, **overrides):
        from bkt_web.pattern_library import pattern_from_approved_render

        values = {
            "pattern_id": "pattern.learned",
            "kind": "action_sequence",
            "title": "Reach, grip, place",
            "genre": "agriculture",
            "payload": {"steps": [{"type": "reach"}, {"type": "grip"}, {"type": "place"}]},
            "manifest": manifest,
            "approved_by": "reviewer.mai",
            "approved_at": STAMP,
            "review_id": "review.one",
            "tags": ["harvest"],
        }
        values.update(overrides)
        return pattern_from_approved_render(**values)

    def test_a_verified_render_can_be_promoted(self):
        item = self.promote(self.manifest())
        self.assertEqual(item.pattern_id, "pattern.learned")
        self.assertEqual(item.approval.fidelity_kinds, ("structural",))
        self.assertEqual(item.approval.source_hash, "sha256:" + "a" * 64)
        self.assertTrue(item.digest.startswith("sha256:"))

    def test_an_unverified_render_cannot_teach_anything(self):
        from bkt_web.pattern_library import PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "chưa chạy fidelity"):
            self.promote(self.manifest(fidelity=[]))

    def test_a_failing_render_cannot_teach_anything(self):
        import test_render_manifest as manifests
        from bkt_web.pattern_library import PatternLibraryError

        failing = self.manifest(fidelity=[manifests.fidelity("structural", passed=False, failures=2)])
        with self.assertRaisesRegex(PatternLibraryError, "fidelity thất bại"):
            self.promote(failing)

    def test_a_render_that_reused_source_media_cannot_teach_anything(self):
        import test_render_manifest as manifests
        from bkt_web.pattern_library import PatternLibraryError

        reusing = self.manifest(fallbacks=[manifests.fallback("visual", approved=True)])
        with self.assertRaisesRegex(PatternLibraryError, "dùng lại media nguồn"):
            self.promote(reusing)

    def test_a_partial_render_may_still_teach_a_pattern(self):
        import test_render_manifest as manifests

        partial = self.manifest(fallbacks=[manifests.fallback()])
        self.assertEqual(partial.completion_claim, "partial")
        self.assertEqual(self.promote(partial).genre, "agriculture")


class LibraryTest(unittest.TestCase):
    def store(self):
        return library([
            pattern("pattern.harvest", "action_sequence"),
            pattern("pattern.push", "camera", genre="product", tags=("hero",)),
            pattern("pattern.detach.fix", "fix", genre="agriculture", tags=("harvest", "lifecycle")),
        ])

    def test_patterns_can_be_searched_by_genre_kind_and_tag(self):
        store = self.store()
        self.assertEqual([item.pattern_id for item in store.search(genre="agriculture")],
                         ["pattern.detach.fix", "pattern.harvest"])
        self.assertEqual([item.pattern_id for item in store.search(kind="camera")], ["pattern.push"])
        self.assertEqual([item.pattern_id for item in store.search(tags=["lifecycle"])], ["pattern.detach.fix"])
        self.assertEqual(store.search(genre="agriculture", tags=["hero"]), ())

    def test_use_counts_rank_the_search(self):
        store = self.store().record_use("pattern.harvest", 3)
        self.assertEqual(store.search(genre="agriculture")[0].pattern_id, "pattern.harvest")
        self.assertEqual(store.search(genre="agriculture")[0].uses, 3)

    def test_patterns_can_be_added_and_removed(self):
        store = self.store()
        bigger = store.add(pattern("pattern.new", "scene"))
        self.assertEqual(len(bigger.patterns), 4)
        smaller = bigger.remove("pattern.new")
        self.assertEqual(len(smaller.patterns), 3)

    def test_removing_or_using_an_unknown_pattern_is_an_error(self):
        from bkt_web.pattern_library import PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "Không có pattern"):
            self.store().remove("pattern.ghost")
        with self.assertRaisesRegex(PatternLibraryError, "Không có pattern"):
            self.store().record_use("pattern.ghost")

    def test_the_library_round_trips_through_json_with_the_guards_rerun(self):
        from bkt_web.pattern_library import load_library

        payload = self.store().as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        restored = load_library(json.loads(json.dumps(payload)))
        self.assertEqual(restored.as_dict(), payload)

    def test_a_tampered_stored_library_is_refused_on_load(self):
        from bkt_web.pattern_library import PatternLibraryError, load_library

        payload = self.store().as_dict()
        payload["patterns"][0]["payload"]["api_key"] = "x" * 40
        with self.assertRaisesRegex(PatternLibraryError, "api_key"):
            load_library(payload)

        payload = self.store().as_dict()
        payload["schema"] = "other/v1"
        with self.assertRaisesRegex(PatternLibraryError, "schema không được hỗ trợ"):
            load_library(payload)

    def test_the_library_does_not_mutate_a_payload_it_was_given(self):
        source = {"steps": [{"type": "grip"}]}
        item = pattern(payload=source)
        item.payload["steps"].append({"type": "wave"})
        self.assertEqual(source, {"steps": [{"type": "grip"}]})

    def test_an_unknown_kind_is_rejected(self):
        from bkt_web.pattern_library import PatternLibraryError

        with self.assertRaisesRegex(PatternLibraryError, "kind chưa hỗ trợ"):
            pattern(kind="vibes", payload={"note": "x"})
        with self.assertRaisesRegex(PatternLibraryError, "kind chưa hỗ trợ"):
            self.store().of_kind("vibes")


if __name__ == "__main__":
    unittest.main()
