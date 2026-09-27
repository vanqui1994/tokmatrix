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
             mock.patch.object(planner.topic_packs, "pack_topics", lambda pid: stock[pid]):
            with mock.patch.object(planner.topic_packs, "channel_pack", lambda *a, **k: "p_free"):
                self.assertEqual(planner.pick_pack_topic("c1", "n", "d", [], cfg=cfg, packs=packs), "Orca pod tactics")
                self.assertIsNone(planner.pick_pack_topic("c1", "n", "d", ["orca tactics"], cfg=cfg, packs=packs))
            with mock.patch.object(planner.topic_packs, "channel_pack", lambda *a, **k: "p_vs"):
                self.assertEqual(planner.pick_pack_topic("c1", "n", "d", [], cfg=cfg, packs=packs), "")
            self.assertIsNone(planner.pick_pack_topic("c1", "n", "d", [], cfg={}, packs=packs))

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


if __name__ == "__main__":
    unittest.main()
