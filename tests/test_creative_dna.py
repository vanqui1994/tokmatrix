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
        full = cd.load_registry(include_reference=True)
        # Các test capacity dựng trên đúng một variant (reference, 2 composition), độc lập với số variant thật.
        cls.full_registry = full
        cls.registry = {**full, "variants": [v for v in full["variants"] if v["id"] == "mystery/reference-dossier"]}
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
        registry = {**self.full_registry, "variants": []}
        plan = cd.plan_assignments(self.channels, registry, self.niches, None, CHANNELS[:1])
        self.assertEqual(plan["rows"][0]["collision"], "hard:capacity")

    def test_apply_needs_the_reviewed_plan_and_its_sha(self):
        self.assertEqual(cd.main(["--apply"]), 2)


class CreativeDnaApplyTest(unittest.TestCase):
    """Apply chỉ chạy trên BẢN SAO config trong test — không bao giờ đụng config của repo."""

    def setUp(self):
        import tempfile, shutil
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.config = self.tmp / "config"
        shutil.copytree(cd.CONFIG_DIR, self.config)
        self.repo_hash = tree_hash(cd.CONFIG_DIR)
        registry = cd.load_registry(include_reference=False)
        self.plan = cd.plan_assignments(cd.load_channels(self.config), registry, cd.load_niche_engines(self.config), None, CHANNELS)

    def load(self, cid):
        import yaml
        return yaml.safe_load((self.config / "channels" / f"{cid}.yaml").read_text(encoding="utf-8"))

    def test_apply_on_a_copy_validates_backs_up_and_rolls_back(self):
        self.assertTrue(self.plan["summary"]["applicable"], self.plan["summary"])
        before = {cid: self.load(cid) for cid in CHANNELS}
        result = cd.apply_plan(self.plan, self.plan["plan_sha256"], config_dir=self.config, backup_root=self.tmp / "b", preflight=False)
        self.assertEqual(result["applied"], len(CHANNELS))
        for row in self.plan["rows"]:
            cfg = self.load(row["channel_id"])
            self.assertEqual(cfg["creative"]["variant_id"], row["variant_id"])
            self.assertEqual(cfg["creative"]["preferred_engines"], [row["engine"]])
            self.assertEqual(cfg["creative"]["dna"], row["dna"])
            self.assertEqual(cfg["audio"]["voice_id"], row["voice"])
            self.assertEqual(cfg["config_version"], before[row["channel_id"]]["config_version"] + 1)
        self.assertFalse((self.config / "channels" / cd.LOCK_NAME).exists())
        self.assertEqual(tree_hash(cd.CONFIG_DIR), self.repo_hash, "repo configs untouched")

        cd.rollback(Path(result["inverse"]), config_dir=self.config, preflight=False)
        for cid in CHANNELS:
            cfg = self.load(cid)
            self.assertEqual(cfg["creative"], before[cid]["creative"])
            self.assertEqual(cfg["audio"], before[cid]["audio"])
            self.assertEqual(cfg["config_version"], before[cid]["config_version"] + 2, "version never goes back")

    def test_apply_refuses_wrong_sha_hard_rows_lock_and_invalid_result(self):
        with self.assertRaises(cd.ApplyError):
            cd.apply_plan(self.plan, "0" * 64, config_dir=self.config, backup_root=self.tmp / "b", preflight=False)
        tampered = json.loads(json.dumps(self.plan))
        tampered["rows"][0]["voice"] = "de-DE-KatjaNeural"
        with self.assertRaises(cd.ApplyError):
            cd.apply_plan(tampered, self.plan["plan_sha256"], config_dir=self.config, backup_root=self.tmp / "b", preflight=False)
        hard = json.loads(json.dumps(self.plan))
        hard["rows"][0]["collision"] = "hard:capacity"
        hard["plan_sha256"] = cd.recompute_sha(hard)
        with self.assertRaises(cd.ApplyError):
            cd.apply_plan(hard, hard["plan_sha256"], config_dir=self.config, backup_root=self.tmp / "b", preflight=False)
        (self.config / "channels" / cd.LOCK_NAME).write_text("other")
        with self.assertRaises(cd.ApplyError):
            cd.apply_plan(self.plan, self.plan["plan_sha256"], config_dir=self.config, backup_root=self.tmp / "b", preflight=False)
        (self.config / "channels" / cd.LOCK_NAME).unlink()
        before = tree_hash(self.config)
        with self.assertRaises(cd.ApplyError):
            cd.apply_plan(self.plan, self.plan["plan_sha256"], config_dir=self.config, backup_root=self.tmp / "b",
                          preflight=False, validate=lambda _dir: ["boom"])
        self.assertEqual(tree_hash(self.config), before, "validator failure changes nothing")


class CreativeDnaCanaryTest(unittest.TestCase):
    """Canary cohort (Phase 7): tập con tất định, cộng dồn, bỏ dòng hard; apply được trên bản sao."""

    @classmethod
    def setUpClass(cls):
        cls.plan = cd.plan_assignments(cd.load_channels(), cd.load_registry(), cd.load_niche_engines())

    def test_c1_takes_at_most_one_account_per_engine_and_country_and_is_deterministic(self):
        c1 = cd.canary_plan(self.plan, "C1")
        self.assertLessEqual(len(c1["rows"]), 8)
        pairs = [(r["engine"], r["country"]) for r in c1["rows"]]
        self.assertEqual(len(pairs), len(set(pairs)))
        self.assertGreater(len({r["country"] for r in c1["rows"]}), 1, "C1 spreads over countries")
        self.assertEqual(c1, cd.canary_plan(self.plan, "C1"))
        self.assertEqual(c1["plan_sha256"], cd.recompute_sha(c1))
        self.assertEqual(c1["source_plan_sha256"], self.plan["plan_sha256"])

    def test_cohorts_grow_and_never_include_hard_rows(self):
        hard = {r["channel_id"] for r in self.plan["rows"] if r["collision"].startswith("hard")}
        sizes = []
        for cohort in cd.CANARY_COHORTS:
            plan = cd.canary_plan(self.plan, cohort)
            self.assertFalse(hard & {r["channel_id"] for r in plan["rows"]})
            self.assertEqual(sorted(hard), plan["summary"]["left_legacy"])
            sizes.append(len(plan["rows"]))
        self.assertEqual(sizes, sorted(sizes))
        self.assertEqual(sizes[1], min(20, sizes[-1]))
        self.assertEqual(sizes[-1], len(self.plan["rows"]) - len(hard))
        with self.assertRaises(ValueError):
            cd.canary_plan(self.plan, "C9")

    def test_kept_accounts_count_toward_the_cohort(self):
        plan = json.loads(json.dumps(self.plan))
        usable = [r for r in plan["rows"] if r["variant_id"]]
        for row in usable[:5]:
            row["collision"] = "keep"
        c1 = cd.canary_plan(plan, "C1")
        self.assertEqual(len(c1["rows"]), 8)
        self.assertEqual(c1["summary"]["new"], 3)

    def test_voice_changer_voices_are_never_assigned_as_narrator(self):
        registry = cd.load_registry()
        character = {v["id"] for v in registry["voices"] if v.get("character")}
        self.assertIn("BV075_streaming_robot_dsp", character)
        self.assertFalse(character & {r["voice"] for r in self.plan["rows"]})
        self.assertTrue(any(r["country"] == "VN" and r["variant_id"] for r in self.plan["rows"]), "VN channels get variants")

    def test_cohort_plan_applies_on_a_copy(self):
        import tempfile, shutil
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        config = tmp / "config"
        shutil.copytree(cd.CONFIG_DIR, config)
        c1 = cd.canary_plan(self.plan, "C1")
        result = cd.apply_plan(c1, c1["plan_sha256"], config_dir=config, backup_root=tmp / "b", preflight=False)
        self.assertEqual(result["applied"], len(c1["rows"]))
        again = cd.plan_assignments(cd.load_channels(config), cd.load_registry(), cd.load_niche_engines(config))
        kept = {r["channel_id"] for r in again["rows"] if r["collision"] == "keep"}
        self.assertEqual(kept, {r["channel_id"] for r in c1["rows"]}, "the next dry-run keeps the canary DNA")


if __name__ == "__main__":
    unittest.main()
