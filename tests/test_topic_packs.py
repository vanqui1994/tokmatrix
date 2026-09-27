import unittest
from collections import Counter

from bkt_web.autopilot import creative_dna, topic_packs


class TopicPackTest(unittest.TestCase):
    PACKS = {
        "mystery_cold_case": {"id": "mystery_cold_case", "engine": "mystery", "brief": "b", "format": "free", "niches": ["unsolved_mysteries"]},
        "mystery_cryptids": {"id": "mystery_cryptids", "engine": "mystery", "brief": "b", "format": "free", "niches": ["unsolved_mysteries", "folklore_legends"]},
    }

    def test_choice_is_deterministic_weighted_and_limited_to_the_niche(self):
        weights = {"mystery_cold_case": 0.7, "mystery_cryptids": 0.3}
        picks = [topic_packs.choose_pack(f"ch_{i}", "2026-09-27", weights, self.PACKS, "unsolved_mysteries") for i in range(400)]
        self.assertEqual(picks, [topic_packs.choose_pack(f"ch_{i}", "2026-09-27", weights, self.PACKS, "unsolved_mysteries") for i in range(400)])
        share = Counter(picks)["mystery_cold_case"] / len(picks)
        self.assertTrue(0.6 < share < 0.8, share)
        self.assertEqual({topic_packs.choose_pack(f"ch_{i}", "d", weights, self.PACKS, "folklore_legends") for i in range(50)}, {"mystery_cryptids"})
        self.assertIsNone(topic_packs.choose_pack("ch", "d", weights, self.PACKS, "deep_space"))
        self.assertIsNone(topic_packs.channel_pack("ch", {"creative": {}}, "unsolved_mysteries", "d", self.PACKS))

    def test_validation_catches_missing_packs_wrong_engine_and_unknown_niche(self):
        bad = {**self.PACKS, "x": {"id": "x", "engine": "vox", "brief": "b", "format": "list", "niches": ["nope"]}}
        errors = topic_packs.validate_packs(bad, {"mystery/a": {"mystery_cold_case": 1, "missing": 1}, "mystery/b": {"x": 1}}, ["unsolved_mysteries", "folklore_legends"])
        text = "\n".join(errors)
        for needle in ("format must be", "unknown niche nope", "missing has no", "belongs to engine vox"):
            self.assertIn(needle, text)

    def test_planner_uses_the_pack_and_never_falls_back_for_versus_packs(self):
        from unittest import mock
        from bkt_web.autopilot import planner

        packs = {"p_free": {"id": "p_free", "format": "free"}, "p_vs": {"id": "p_vs", "format": "versus"}}
        cfg = {"creative": {"variant_id": "x/y"}}
        stock = {"p_free": ["Lion hunting at night", "Orca pod tactics"], "p_vs": []}
        with mock.patch.object(planner.store, "is_topic_used", lambda niche, t: t.startswith("Lion")), \
             mock.patch.object(planner.store, "log_event", lambda *a, **k: None), \
             mock.patch.object(planner.topics, "refill_pack", lambda *a, **k: 0), \
             mock.patch.object(planner, "topic_candidates", lambda niche: []), \
             mock.patch.object(planner.topic_packs, "pack_topics", lambda pid, fmt=None: stock[pid]):
            with mock.patch.object(planner.topic_packs, "channel_pack", lambda *a, **k: "p_free"):
                self.assertEqual(planner.pick_pack_topic("c1", "n", "d", [], cfg=cfg, packs=packs), "Orca pod tactics")
                self.assertIsNone(planner.pick_pack_topic("c1", "n", "d", ["orca tactics"], cfg=cfg, packs=packs))
            with mock.patch.object(planner.topic_packs, "channel_pack", lambda *a, **k: "p_vs"):
                self.assertEqual(planner.pick_pack_topic("c1", "n", "d", [], cfg=cfg, packs=packs), "")
            self.assertIsNone(planner.pick_pack_topic("c1", "n", "d", [], cfg={}, packs=packs))

    def test_versus_and_ranking_topics_must_fit_their_format(self):
        self.assertEqual(topic_packs.split_subjects("Lion vs Tiger: who wins the big-cat fight"), ["Lion", "Tiger"])
        self.assertEqual(topic_packs.split_subjects("F-22 or J-20: which jet rules the sky"), ["F-22", "J-20"])
        self.assertIsNone(topic_packs.split_subjects("The deadliest snake on earth"))
        self.assertIsNone(topic_packs.split_subjects("Cats vs cats"))
        self.assertTrue(topic_packs.fits_format("Ranking every Roman emperor by madness", "ranking"))
        self.assertTrue(topic_packs.fits_format("Deadliest sharks ranked from least to most dangerous", "ranking"))
        self.assertTrue(topic_packs.fits_format("Ancient civilizations tier list", "ranking"))
        self.assertFalse(topic_packs.fits_format("The mystery of the Bermuda triangle", "ranking"))
        self.assertTrue(topic_packs.fits_format("The mystery of the Bermuda triangle", "free"))

    def test_wrong_format_topics_are_never_stored_or_picked(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        from bkt_web.autopilot import topics

        with tempfile.TemporaryDirectory() as tmp:
            generated = Path(tmp) / "p_vs.txt"
            prompts = []
            fake = lambda niche, existing, count, brief: prompts.append(brief) or ["Orca vs Great White: who rules the ocean", "The loneliest whale"]
            with mock.patch.object(topics, "generate", fake), \
                 mock.patch.object(topic_packs, "generated_file", lambda pid: generated), \
                 mock.patch.object(topics.store, "log_event", lambda *a, **k: None):
                added = topics.refill_pack({"id": "p_vs", "brief": "sea predators", "format": "versus"}, "ocean_mysteries", [], 5)
                self.assertEqual(added, 1)
                self.assertIn("vs", prompts[0])
                self.assertEqual(generated.read_text().splitlines(), ["Orca vs Great White: who rules the ocean"])
                generated.write_text(generated.read_text() + "A single-subject topic\n")
                self.assertEqual(topic_packs.pack_topics("p_vs", "versus"), ["Orca vs Great White: who rules the ocean"])
                self.assertEqual(len(topic_packs.pack_topics("p_vs", "free")), 2)

    def test_pack_topics_are_not_repeated_across_the_niches_a_pack_serves(self):
        from unittest import mock
        from bkt_web.autopilot import planner

        packs = {"p": {"id": "p", "format": "free", "niches": ["unsolved_mysteries", "infamous_figures"]}}
        cfg = {"creative": {"variant_id": "x/y"}}
        stock = ["Black Dahlia murder of 1947", "Hinterkaifeck farm murders", "Villisca axe murders"]
        used = {("infamous_figures", "Black Dahlia murder of 1947")}
        recent = {"infamous_figures": ["The Hinterkaifeck farm case revisited"]}
        with mock.patch.object(planner.store, "is_topic_used", lambda niche, t: (niche, t) in used), \
             mock.patch.object(planner.store, "recent_plan_topics", lambda niche, since: recent.get(niche, [])), \
             mock.patch.object(planner.store, "log_event", lambda *a, **k: None), \
             mock.patch.object(planner.topics, "refill_pack", lambda *a, **k: 0), \
             mock.patch.object(planner.topic_packs, "channel_pack", lambda *a, **k: "p"), \
             mock.patch.object(planner.topic_packs, "pack_topics", lambda pid, fmt=None: stock):
            # used in the other niche, then planned there within the gap → the third topic
            self.assertEqual(planner.pick_pack_topic("c1", "unsolved_mysteries", "d", [], cfg=cfg, packs=packs, since="d0"), "Villisca axe murders")
            # without a gap window only "already used" counts
            self.assertEqual(planner.pick_pack_topic("c1", "unsolved_mysteries", "d", [], cfg=cfg, packs=packs), "Hinterkaifeck farm murders")

    def test_every_registered_variant_pack_exists_in_the_repo(self):
        packs = topic_packs.load_packs()
        niches = list(creative_dna.load_niche_engines())
        registry = creative_dna.load_registry(include_reference=False)
        variant_packs = {v["id"]: v["topic_packs"] for v in registry["variants"]}
        self.assertEqual(topic_packs.validate_packs(packs, variant_packs, niches), [])
        # Mỗi pack phải có ít nhất một niche cho phép engine của nó, nếu không pack không bao giờ được chọn.
        engines = creative_dna.load_niche_engines()
        for pack_id, pack in packs.items():
            self.assertTrue(any(pack["engine"] in engines.get(n, []) for n in pack["niches"]), pack_id)
            # Seed có sẵn trong repo (không phụ thuộc Gemini ngày đầu), đúng định dạng của pack.
            seed = topic_packs.PACK_TOPICS_DIR / f"{pack_id}.txt"
            self.assertTrue(seed.exists(), f"{pack_id}: no seed topics")
            self.assertGreaterEqual(len(topic_packs.pack_topics(pack_id, pack["format"])), 10, pack_id)


if __name__ == "__main__":
    unittest.main()
