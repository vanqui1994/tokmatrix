import copy
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


def record(**overrides):
    base = {
        "asset_id": "demo.card",
        "version": "1.0.0",
        "kind": "image",
        "renderer_ids": ["motion-graphics-v1"],
        "capabilities": {"effects": ["fade"]},
        "checksum": "sha256:" + "a" * 64,
        "content": {"kind": "inline", "media_type": "image/svg+xml"},
        "provenance": {
            "kind": "imported",
            "created_at": "2026-09-21T00:00:00Z",
            "agent": "tests",
            "license": {"id": "CC0-1.0"},
            "source_refs": ["fixture:card"],
        },
    }
    base.update(overrides)
    return base


def manifest(*records):
    from bkt_web.asset_manifest import ASSET_MANIFEST_SCHEMA

    return {
        "schema": ASSET_MANIFEST_SCHEMA,
        "version": "1.0.0",
        "assets": {item["asset_id"]: item for item in records},
    }


class AssetManifestTest(unittest.TestCase):
    def test_every_built_in_asset_declares_the_five_required_facts(self):
        from bkt_web.asset_manifest import asset_manifest, validate_asset_manifest

        document = asset_manifest()
        validate_asset_manifest(document)
        self.assertTrue(document["assets"])
        for asset_id, entry in document["assets"].items():
            self.assertEqual(entry["asset_id"], asset_id)
            self.assertRegex(entry["version"], r"^\d+\.\d+\.\d+")
            self.assertRegex(entry["checksum"], r"^sha256:[0-9a-f]{64}$")
            self.assertTrue(entry["provenance"]["license"]["id"])
            self.assertIn(entry["provenance"]["kind"], {"built-in", "imported", "generated", "composed", "source-media"})
            self.assertTrue(entry["capabilities"])

    def test_built_in_checksums_track_the_vector_catalog(self):
        from bkt_web.asset_manifest import native_manifest
        from bkt_web.capability_registry import inspect_registry

        registry = inspect_registry()
        for asset_id, entry in native_manifest()["assets"].items():
            self.assertEqual(entry["checksum"], registry["assets"][asset_id]["provenance"]["checksum"])

    def test_inspection_returns_a_copy(self):
        from bkt_web.asset_manifest import asset_manifest

        first = asset_manifest()
        first["assets"].clear()
        self.assertTrue(asset_manifest()["assets"])

    def test_manifest_hash_is_deterministic(self):
        from bkt_web.asset_manifest import asset_manifest, manifest_hash

        self.assertEqual(manifest_hash(asset_manifest()), manifest_hash(asset_manifest()))

    def test_declared_manifest_file_is_valid(self):
        from bkt_web.asset_manifest import declared_manifest, validate_asset_manifest

        validate_asset_manifest(declared_manifest())

    def test_generated_asset_must_record_model_config_and_sources(self):
        from bkt_web.asset_manifest import AssetManifestError, validate_asset_record

        provenance = {
            "kind": "generated",
            "created_at": "2026-09-21T00:00:00Z",
            "agent": "tests",
            "license": {"id": "LicenseRef-generated"},
            "source_refs": ["fixture:card"],
        }
        with self.assertRaises(AssetManifestError):
            validate_asset_record(record(provenance=provenance))
        provenance["generation"] = {"model": "diffusion-x", "config": {"steps": 20}, "source_refs": ["fixture:card"]}
        validate_asset_record(record(provenance=provenance))

    def test_imported_asset_without_source_reference_is_rejected(self):
        from bkt_web.asset_manifest import AssetManifestError, validate_asset_record

        broken = record()
        broken["provenance"]["source_refs"] = []
        with self.assertRaises(AssetManifestError):
            validate_asset_record(broken)

    def test_missing_license_checksum_or_capability_key_is_rejected(self):
        from bkt_web.asset_manifest import AssetManifestError, validate_asset_record

        for mutate in (
            lambda item: item["provenance"].pop("license"),
            lambda item: item.__setitem__("checksum", "sha256:zz"),
            lambda item: item["capabilities"].__setitem__("colours", ["red"]),
            lambda item: item.__setitem__("kind", "hologram"),
            lambda item: item.__setitem__("version", "1.0"),
            lambda item: item.__setitem__("asset_id", "Bad Id"),
            lambda item: item["provenance"].__setitem__("created_at", "2026-09-21"),
            lambda item: item.__setitem__("surprise", True),
        ):
            broken = record()
            mutate(broken)
            with self.assertRaises(AssetManifestError):
                validate_asset_record(broken)

    def test_capability_lists_must_be_sorted_and_unique(self):
        from bkt_web.asset_manifest import AssetManifestError, validate_asset_record

        with self.assertRaises(AssetManifestError):
            validate_asset_record(record(capabilities={"effects": ["zoom", "fade"]}))
        with self.assertRaises(AssetManifestError):
            validate_asset_record(record(capabilities={"effects": ["fade", "fade"]}))

    def test_file_content_rejects_path_traversal_and_absolute_paths(self):
        from bkt_web.asset_manifest import AssetManifestError, validate_asset_record

        for path in ("../secret.png", "/etc/passwd", "a/../../b.png"):
            with self.assertRaises(AssetManifestError):
                validate_asset_record(record(content={"kind": "file", "path": path, "bytes": 1, "media_type": "image/png"}))

    def test_remote_content_must_be_https(self):
        from bkt_web.asset_manifest import AssetManifestError, validate_asset_record

        with self.assertRaises(AssetManifestError):
            validate_asset_record(record(content={"kind": "remote", "uri": "http://example.com/a.png", "media_type": "image/png"}))

    def test_composition_cycle_is_rejected(self):
        from bkt_web.asset_manifest import AssetManifestError, validate_asset_manifest

        left = record(asset_id="left", provenance={
            "kind": "composed", "created_at": "2026-09-21T00:00:00Z", "agent": "tests",
            "license": {"id": "CC0-1.0"}, "source_refs": [],
        }, composition={"parts": ["right", "solo"]})
        right = record(asset_id="right", provenance={
            "kind": "composed", "created_at": "2026-09-21T00:00:00Z", "agent": "tests",
            "license": {"id": "CC0-1.0"}, "source_refs": [],
        }, composition={"parts": ["left", "solo"]})
        solo = record(asset_id="solo")
        with self.assertRaises(AssetManifestError) as error:
            validate_asset_manifest(manifest(left, right, solo))
        self.assertIn("chu trình", str(error.exception))

    def test_merge_rejects_a_conflicting_duplicate_id(self):
        from bkt_web.asset_manifest import AssetManifestError, merge_manifests

        first = manifest(record())
        second = manifest(record(version="2.0.0"))
        with self.assertRaises(AssetManifestError):
            merge_manifests(first, second)
        merged = merge_manifests(first, manifest(record()))
        self.assertEqual(sorted(merged["assets"]), ["demo.card"])

    def test_record_from_file_checksums_and_verification_detects_drift(self):
        from bkt_web.asset_manifest import asset_record_from_file, checksum_bytes, verify_asset_files

        with TemporaryDirectory() as root:
            base = Path(root)
            (base / "media").mkdir()
            target = base / "media" / "card.svg"
            target.write_bytes(b"<svg/>")
            entry = asset_record_from_file(
                "media/card.svg",
                root=base,
                asset_id="demo.card",
                version="1.0.0",
                kind="image",
                media_type="image/svg+xml",
                provenance={
                    "kind": "imported", "created_at": "2026-09-21T00:00:00Z", "agent": "tests",
                    "license": {"id": "CC0-1.0"}, "source_refs": ["fixture:card"],
                },
            )
            self.assertEqual(entry["checksum"], checksum_bytes(b"<svg/>"))
            self.assertEqual(entry["content"], {"kind": "file", "path": "media/card.svg", "bytes": 6, "media_type": "image/svg+xml"})
            document = manifest(entry)
            self.assertEqual(verify_asset_files(document, root=base), [])
            target.write_bytes(b"<svg x='1'/>")
            self.assertEqual(verify_asset_files(document, root=base)[0]["code"], "ASSET_CHECKSUM_MISMATCH")
            target.unlink()
            self.assertEqual(verify_asset_files(document, root=base)[0]["code"], "ASSET_FILE_MISSING")

    def test_add_asset_does_not_mutate_the_input_manifest(self):
        from bkt_web.asset_manifest import add_asset, native_manifest

        document = native_manifest()
        before = copy.deepcopy(document)
        grown = add_asset(document, record())
        self.assertEqual(document, before)
        self.assertIn("demo.card", grown["assets"])

    def test_manifest_file_on_disk_parses_as_json(self):
        from bkt_web.asset_manifest import ASSET_MANIFEST_PATH

        json.loads(ASSET_MANIFEST_PATH.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
