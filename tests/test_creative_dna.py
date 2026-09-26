"""Creative DNA assignment dry-run (docs/MATRIX_VARIANT_SYSTEM_V2.md mục 11) — Phase 0."""
import hashlib
import json
import os
import subprocess
import unittest
from pathlib import Path

from bkt_web.autopilot import creative_dna as cd

ROOT = Path(__file__).resolve().parent.parent
CHANNELS = ["ancient_mythology_01", "ancient_mythology_02", "ancient_mythology_03",
            "folklore_legends_01", "folklore_legends_02", "ocean_mysteries_01"]


def tree_hash(path: Path) -> str:
    digest = hashlib.sha256()
    for file in sorted(path.rglob("*")):
        if file.is_file():
            digest.update(str(file.relative_to(path)).encode())
            digest.update(file.read_bytes())
    return digest.hexdigest()


class CreativeDnaDryRunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = cd.load_registry(include_reference=True)
        cls.channels = cd.load_channels()
        cls.niches = cd.load_niche_engines()

    def plan(self, only=CHANNELS, channels=None, mapping=None):
        return cd.plan_assignments(channels or self.channels, self.registry, self.niches, mapping, only)

    def test_dry_run_is_deterministic_and_writes_nothing(self):
        before = tree_hash(cd.CONFIG_DIR)
        first, second = self.plan(), self.plan()
        self.assertEqual(first["plan_sha256"], second["plan_sha256"])
        self.assertEqual(first["rows"], second["rows"])
        code = cd.main(["--dry-run", "--include-reference", "--channels", ",".join(CHANNELS)])
        self.assertEqual(code, 0)
        self.assertEqual(tree_hash(cd.CONFIG_DIR), before, "dry-run must not touch channel configs")

    def test_structural_key_is_unique_per_country_and_capacity_is_reported(self):
        rows = self.plan()["rows"]
        by_country = {}
        for row in rows:
            if row["structural_key"]:
                self.assertNotIn(row["structural_key"], by_country.setdefault(row["country"], set()))
                by_country[row["country"]].add(row["structural_key"])
        # 1 reference variant × 2 compositions: DE has 3 accounts → the third cannot get a unique identity.
        statuses = {r["channel_id"]: r["collision"] for r in rows}
        self.assertEqual(statuses["ancient_mythology_03"], "hard:capacity")
        self.assertFalse(self.plan()["summary"]["applicable"])
        self.assertEqual(statuses["folklore_legends_01"], "soft:cross_country")

    def test_rows_carry_the_review_columns_and_signatures_match_node(self):
        row = next(r for r in self.plan()["rows"] if r["collision"] == "ok")
        for key in ("channel_id", "country", "old_engine", "old_niche", "engine", "variant_id", "composition", "voice", "signature"):
            self.assertTrue(row[key], key)
        self.assertEqual(row["dna"]["dna_version"], self.registry["dna_version"])
        payload = json.dumps({"dna": row["dna"], "variant_id": row["variant_id"], "country": row["lang"]})
        out = subprocess.run(["node", "tools/list-variants.mjs", "--signature", payload], cwd=str(cd.COMPARE_DIR),
                             capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout)["signature"], row["signature"])
        table = cd.format_table(self.plan())
        self.assertTrue(table.startswith(" | ".join(cd.PLAN_COLUMNS)))

    def test_same_country_accounts_get_different_signatures_and_voices_come_from_registered_catalog(self):
        rows = [r for r in self.plan()["rows"] if r["signature"]]
        self.assertEqual(len({r["signature"] for r in rows}), len(rows))
        registered = {(v["id"], v["lang"]) for v in self.registry["voices"]}
        for row in rows:
            self.assertIn((row["voice"], row["lang"]), registered)
        # CapCut là một phần của Voice DNA (chủ dự án: "nhớ dùng capcut tts"), không chỉ Edge.
        providers = {v["id"]: v["provider"] for v in self.registry["voices"]}
        self.assertIn("capcut", {providers[r["voice"]] for r in rows})

    def test_existing_valid_dna_is_kept(self):
        channels = json.loads(json.dumps(self.channels))
        first = next(r for r in self.plan()["rows"] if r["channel_id"] == "ancient_mythology_02")
        channels["ancient_mythology_01"]["creative"]["variant_id"] = first["variant_id"]
        channels["ancient_mythology_01"]["creative"]["dna"] = first["dna"]
        rows = {r["channel_id"]: r for r in self.plan(channels=channels)["rows"]}
        self.assertEqual(rows["ancient_mythology_01"]["collision"], "keep")
        self.assertEqual(rows["ancient_mythology_01"]["composition"], first["composition"])
        self.assertNotEqual(rows["ancient_mythology_02"]["composition"], first["composition"])

    def test_mapping_limits_accounts_and_sets_country(self):
        plan = self.plan(only=None, mapping={"folklore_legends_01": {"country": "gb", "niche_id": "folklore_legends"}})
        self.assertEqual([r["channel_id"] for r in plan["rows"]], ["folklore_legends_01"])
        self.assertEqual(plan["rows"][0]["country"], "GB")

    def test_without_active_variants_nothing_is_assignable(self):
        registry = cd.load_registry(include_reference=False)
        plan = cd.plan_assignments(self.channels, registry, self.niches, None, CHANNELS[:1])
        self.assertEqual(plan["rows"][0]["collision"], "hard:capacity")

    def test_apply_is_refused_in_phase_0(self):
        self.assertEqual(cd.main(["--apply"]), 2)


if __name__ == "__main__":
    unittest.main()
