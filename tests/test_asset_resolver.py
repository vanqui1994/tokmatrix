import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


CREATED_AT = "2026-09-21T00:00:00Z"


def half_manifest(**extra):
    """Two assets that each cover half of what a request asks for."""

    from bkt_web.asset_manifest import ASSET_MANIFEST_SCHEMA, checksum_value

    def entry(asset_id, actions):
        return {
            "asset_id": asset_id,
            "version": "1.0.0",
            "kind": "vector-rig",
            "renderer_ids": ["native-vector-v1"],
            "capabilities": {"actions": sorted(actions)},
            "checksum": checksum_value({"asset": asset_id}),
            "content": {"kind": "inline", "media_type": "application/json"},
            "provenance": {
                "kind": "built-in", "created_at": CREATED_AT, "agent": "tests",
                "license": {"id": "CC0-1.0"}, "source_refs": [],
            },
        }

    assets = {"left.rig": entry("left.rig", ["grip"]), "right.rig": entry("right.rig", ["pour"])}
    assets.update(extra)
    return {"schema": ASSET_MANIFEST_SCHEMA, "version": "1.0.0", "assets": assets}


class AssetResolverTest(unittest.TestCase):
    def test_exact_built_in_asset_wins_and_needs_no_cache(self):
        from bkt_web.asset_resolver import AssetRequest, resolve_asset

        result = resolve_asset(AssetRequest(
            request_id="request.farmer", renderer_id="native-vector-v1",
            asset_id="farmer", required_capabilities={"actions": ["reach"]},
        ))
        self.assertEqual((result["status"], result["strategy"], result["asset_id"]), ("resolved", "exact", "farmer"))
        self.assertEqual(result["source_media_usage"], "none")
        self.assertFalse(result["requires_approval"])

    def test_resolution_is_deterministic(self):
        from bkt_web.asset_resolver import AssetRequest, resolve_asset

        request = AssetRequest(request_id="request.any", renderer_id="native-vector-v1", required_capabilities={"actions": ["grip"]})
        self.assertEqual(resolve_asset(request), resolve_asset(request))

    def test_composition_covers_what_no_single_asset_covers(self):
        from bkt_web.asset_resolver import AssetRequest, resolve_asset

        result = resolve_asset(
            AssetRequest(request_id="request.both", renderer_id="native-vector-v1", required_capabilities={"actions": ["grip", "pour"]}),
            manifest=half_manifest(),
        )
        self.assertEqual(result["strategy"], "composition")
        self.assertEqual(result["record"]["composition"]["parts"], ["left.rig", "right.rig"])
        self.assertEqual(result["record"]["provenance"]["kind"], "composed")
        self.assertEqual(result["record"]["capabilities"]["actions"], ["grip", "pour"])

    def test_composition_can_be_switched_off_by_policy(self):
        from bkt_web.asset_resolver import AssetRequest, ResolutionPolicy, resolve_asset

        result = resolve_asset(
            AssetRequest(request_id="request.both", renderer_id="native-vector-v1", required_capabilities={"actions": ["grip", "pour"]}),
            manifest=half_manifest(),
            policy=ResolutionPolicy(allow_composition=False),
        )
        self.assertEqual(result["status"], "needs-review")
        self.assertEqual(result["reason_code"], "NO_ASSET_ROUTE")
        self.assertTrue(result["missing_capabilities"])

    def test_generation_records_model_config_and_freezes_bytes(self):
        from bkt_web.asset_resolver import AssetRequest, ResolutionPolicy, assert_offline_ready, resolve_asset

        def generator(request, gap):
            return {
                "bytes": b"<svg id='generated'/>",
                "media_type": "image/svg+xml",
                "asset_id": "generated.crate",
                "model": "vector-synth",
                "model_version": "2.1.0",
                "config": {"style": "flat", "seed": 7},
                "source_refs": ["fixture:crate"],
                "created_at": CREATED_AT,
                "kind": "image",
                "capabilities": {"actions": ["grip", "pour"]},
                "license": {"id": "LicenseRef-generated"},
            }

        with TemporaryDirectory() as cache:
            result = resolve_asset(
                AssetRequest(request_id="request.crate", renderer_id="native-vector-v1", kind="image", required_capabilities={"actions": ["grip", "pour"]}),
                manifest=half_manifest(),
                policy=ResolutionPolicy(allow_composition=False, allow_generated=True),
                cache_dir=cache,
                generator=generator,
            )
            self.assertEqual(result["strategy"], "generated")
            generation = result["record"]["provenance"]["generation"]
            self.assertEqual(generation["model"], "vector-synth")
            self.assertEqual(generation["config"], {"style": "flat", "seed": 7})
            self.assertEqual(generation["source_refs"], ["fixture:crate"])
            self.assertTrue(Path(result["local_path"]).is_file())
            assert_offline_ready([result])

    def test_generated_asset_without_a_timestamp_is_not_accepted(self):
        from bkt_web.asset_resolver import AssetRequest, ResolutionPolicy, resolve_asset

        def generator(request, gap):
            return {"bytes": b"x", "media_type": "image/png", "model": "m", "config": {}, "capabilities": {"actions": ["grip"]}}

        with TemporaryDirectory() as cache:
            result = resolve_asset(
                AssetRequest(request_id="request.nostamp", renderer_id="native-vector-v1", kind="image", required_capabilities={"actions": ["grip"]}),
                manifest=half_manifest(),
                policy=ResolutionPolicy(allow_composition=False, allow_generated=True),
                cache_dir=cache,
                generator=generator,
            )
            self.assertEqual(result["status"], "needs-review")
            self.assertEqual(result["reason_code"], "GENERATED_ASSET_INVALID")

    def test_source_fallback_needs_explicit_approval(self):
        from bkt_web.asset_resolver import AssetRequest, ResolutionPolicy, resolve_asset

        request = AssetRequest(
            request_id="request.clip", renderer_id="native-vector-v1", kind="source-clip",
            required_capabilities={"actions": ["grip"]}, source_ref="source.demo",
        )
        with TemporaryDirectory() as workdir:
            media = Path(workdir) / "clip.mp4"
            media.write_bytes(b"fake-mp4")
            source_media = {"source.demo": {"path": str(media), "media_type": "video/mp4", "created_at": CREATED_AT}}
            unapproved = resolve_asset(
                request, manifest=half_manifest(),
                policy=ResolutionPolicy(allow_composition=False, allow_source_fallback=True),
                cache_dir=workdir, source_media=source_media,
            )
            self.assertEqual(unapproved["status"], "needs-review")
            self.assertIn(
                "SOURCE_FALLBACK_NOT_APPROVED",
                [attempt["reason"] for attempt in unapproved["attempts"]],
            )
            approved = resolve_asset(
                request, manifest=half_manifest(),
                policy=ResolutionPolicy(allow_composition=False, allow_source_fallback=True, approved_source_refs=("source.demo",)),
                cache_dir=workdir, source_media=source_media,
            )
            self.assertEqual(approved["strategy"], "source-fallback")
            self.assertTrue(approved["requires_approval"])
            self.assertEqual(approved["source_media_usage"], "visual")
            self.assertIn("remake hoàn chỉnh", approved["disclosure"])
            self.assertEqual(approved["record"]["provenance"]["source_refs"], ["source.demo"])

    def test_approved_source_fallback_without_local_media_is_not_faked(self):
        from bkt_web.asset_resolver import AssetRequest, ResolutionPolicy, resolve_asset

        with TemporaryDirectory() as cache:
            result = resolve_asset(
                AssetRequest(request_id="request.clip", renderer_id="native-vector-v1", kind="source-clip", source_ref="source.demo"),
                manifest=half_manifest(),
                policy=ResolutionPolicy(allow_composition=False, allow_source_fallback=True, approved_source_refs=("source.demo",)),
                cache_dir=cache,
            )
            self.assertEqual(result["reason_code"], "SOURCE_MEDIA_NOT_AVAILABLE")

    def test_remote_asset_is_frozen_at_resolve_time_or_refused(self):
        from bkt_web.asset_manifest import checksum_bytes
        from bkt_web.asset_resolver import AssetRequest, resolve_asset

        payload = b"<svg id='remote'/>"
        remote = {
            "asset_id": "remote.card", "version": "1.0.0", "kind": "image",
            "renderer_ids": ["native-vector-v1"], "capabilities": {"effects": ["fade"]},
            "checksum": checksum_bytes(payload),
            "content": {"kind": "remote", "uri": "https://example.com/card.svg", "media_type": "image/svg+xml"},
            "provenance": {"kind": "imported", "created_at": CREATED_AT, "agent": "tests", "license": {"id": "CC0-1.0"}, "source_refs": ["fixture:card"]},
        }
        document = half_manifest(**{"remote.card": remote})
        request = AssetRequest(request_id="request.remote", renderer_id="native-vector-v1", kind="image", asset_id="remote.card", required_capabilities={"effects": ["fade"]})

        offline = resolve_asset(request, manifest=document)
        self.assertEqual(offline["status"], "needs-review")
        self.assertIn("REMOTE_ASSET_NOT_FROZEN", [attempt["reason"] for attempt in offline["attempts"]])

        with TemporaryDirectory() as cache:
            tampered = resolve_asset(request, manifest=document, cache_dir=cache, fetcher=lambda uri: b"different")
            self.assertIn("REMOTE_ASSET_CHECKSUM_MISMATCH", [attempt["reason"] for attempt in tampered["attempts"]])

            frozen = resolve_asset(request, manifest=document, cache_dir=cache, fetcher=lambda uri: payload)
            self.assertEqual(frozen["strategy"], "exact")
            self.assertTrue(Path(frozen["local_path"]).is_file())
            self.assertEqual(Path(frozen["local_path"]).read_bytes(), payload)

    def test_offline_check_fails_when_a_frozen_file_disappears(self):
        from bkt_web.asset_manifest import checksum_bytes
        from bkt_web.asset_resolver import AssetRequest, AssetResolutionError, assert_offline_ready, resolve_asset

        payload = b"<svg id='local'/>"
        with TemporaryDirectory() as root:
            base = Path(root)
            (base / "media").mkdir()
            (base / "media" / "card.svg").write_bytes(payload)
            local = {
                "asset_id": "local.card", "version": "1.0.0", "kind": "image",
                "renderer_ids": ["native-vector-v1"], "capabilities": {"effects": ["fade"]},
                "checksum": checksum_bytes(payload),
                "content": {"kind": "file", "path": "media/card.svg", "bytes": len(payload), "media_type": "image/svg+xml"},
                "provenance": {"kind": "imported", "created_at": CREATED_AT, "agent": "tests", "license": {"id": "CC0-1.0"}, "source_refs": ["fixture:card"]},
            }
            cache = base / "cache"
            result = resolve_asset(
                AssetRequest(request_id="request.local", renderer_id="native-vector-v1", kind="image", asset_id="local.card", required_capabilities={"effects": ["fade"]}),
                manifest=half_manifest(**{"local.card": local}), cache_dir=cache, project_root=base,
            )
            self.assertEqual(result["strategy"], "exact")
            assert_offline_ready([result])
            Path(result["local_path"]).unlink()
            with self.assertRaises(AssetResolutionError):
                assert_offline_ready([result])

    def test_unknown_asset_id_ends_in_needs_review(self):
        from bkt_web.asset_resolver import AssetRequest, resolve_asset

        result = resolve_asset(
            AssetRequest(request_id="request.ghost", renderer_id="native-vector-v1", asset_id="ghost.rig"),
            manifest=half_manifest(),
        )
        self.assertEqual(result["status"], "needs-review")
        self.assertIn("ASSET_NOT_IN_MANIFEST", [attempt["reason"] for attempt in result["attempts"]])

    def test_batch_plan_grows_the_manifest_and_flags_reviews(self):
        from bkt_web.asset_resolver import AssetRequest, resolve_assets

        plan = resolve_assets(
            [
                AssetRequest(request_id="request.grip", renderer_id="native-vector-v1", required_capabilities={"actions": ["grip"]}),
                AssetRequest(request_id="request.both", renderer_id="native-vector-v1", required_capabilities={"actions": ["grip", "pour"]}),
                AssetRequest(request_id="request.ghost", renderer_id="native-vector-v1", asset_id="ghost.rig"),
            ],
            manifest=half_manifest(),
        )
        self.assertEqual(plan["needs_review"], ["request.ghost"])
        self.assertIn("composed:left.rig:right.rig", plan["manifest"]["assets"])
        self.assertEqual([item["request_id"] for item in plan["resolutions"]], ["request.both", "request.ghost", "request.grip"])

    def test_duplicate_request_ids_are_rejected(self):
        from bkt_web.asset_resolver import AssetRequest, AssetResolutionError, resolve_assets

        request = AssetRequest(request_id="request.grip", renderer_id="native-vector-v1", required_capabilities={"actions": ["grip"]})
        with self.assertRaises(AssetResolutionError):
            resolve_assets([request, request], manifest=half_manifest())

    def test_unknown_capability_key_is_rejected(self):
        from bkt_web.asset_resolver import AssetRequest, AssetResolutionError, resolve_asset

        with self.assertRaises(AssetResolutionError):
            resolve_asset(AssetRequest(request_id="request.bad", renderer_id="native-vector-v1", required_capabilities={"colours": ["red"]}))


if __name__ == "__main__":
    unittest.main()
