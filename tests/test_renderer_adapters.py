"""Phase 4 renderer adapters (UV-400 … UV-405)."""

import copy
import unittest


PROVENANCE = "provenance:test"


def entity(entity_id, kind, attributes=None, components=None):
    return {
        "entity_id": entity_id,
        "kind": kind,
        "components": components or [],
        "attributes": attributes or {},
        "provenance_id": PROVENANCE,
    }


def action(action_id, type_, actors, start, end, targets=None):
    return {
        "action_id": action_id,
        "type": type_,
        "actor_ids": actors,
        "target_ids": targets or [],
        "start": start,
        "end": end,
        "provenance_id": PROVENANCE,
    }


def camera(start, end, movement="static", parameters=None, framing="wide"):
    return {
        "camera_id": "camera:test",
        "shots": [{
            "shot_id": "shot:test:1",
            "start": start,
            "end": end,
            "framing": framing,
            "movement": movement,
            "parameters": parameters or {},
            "provenance_id": PROVENANCE,
        }],
    }


def scene(scene_id, start, end, entities, actions=None, *, shots=None, audio_events=None, required=None):
    return {
        "scene_id": scene_id,
        "start": start,
        "end": end,
        "entities": entities,
        "relations": [],
        "actions": actions or [],
        "constraints": [],
        "camera": shots or camera(start, end),
        "audio_events": audio_events or [],
        "render_requirements": {"required": required or [], "preferred": [], "optional": []},
        "provenance_id": PROVENANCE,
    }


def requirement(requirement_id, capability, target_ids=()):
    return {"requirement_id": requirement_id, "capability": capability, "target_ids": list(target_ids)}


class AdapterContractTest(unittest.TestCase):
    def test_every_adapter_is_registered_and_merges_into_the_registry(self):
        from bkt_web.capability_registry import inspect_registry, validate_registry
        from bkt_web.renderer_adapters import available_adapters, get_adapter

        document = inspect_registry()
        validate_registry(document)
        for renderer_id in available_adapters():
            with self.subTest(renderer=renderer_id):
                adapter = get_adapter(renderer_id)
                self.assertIn(renderer_id, document["renderers"])
                self.assertEqual(document["renderers"][renderer_id]["version"], adapter.renderer_version)
                for method in ("inspect_capabilities", "validate", "compile", "render_frame", "render_range", "report_fallbacks"):
                    self.assertTrue(callable(getattr(adapter, method)), method)

    def test_registry_merge_is_deterministic_and_rejects_conflicts(self):
        from bkt_web.capability_registry import inspect_registry, native_registry_document
        from bkt_web.renderer_adapters import merge_adapter_capabilities

        self.assertEqual(inspect_registry(), inspect_registry())
        conflicting = {
            "schema": "tokmatrix.capability-registry/v1",
            "version": "1.0.0",
            "renderers": {},
            "assets": {},
            "actions": {"carry": {"id": "carry", "version": "9.9.9", "actors": [], "targets": []}},
            "materials": {},
            "effects": {},
            "fallbacks": {},
        }
        with self.assertRaises(ValueError):
            merge_adapter_capabilities(native_registry_document(), [conflicting])

    def test_offline_frame_render_is_declared_honestly(self):
        from bkt_web.capability_registry import inspect_registry
        from bkt_web.renderer_adapters import available_adapters, get_adapter

        document = inspect_registry()
        for renderer_id in available_adapters():
            with self.subTest(renderer=renderer_id):
                adapter = get_adapter(renderer_id)
                self.assertTrue(document["renderers"][renderer_id]["features"]["deterministic_seek"])
                self.assertIn(adapter.frame_mode, ("draw-list", "host-callback"))

    def test_render_frame_requires_compile_and_rejects_out_of_range(self):
        from bkt_web.renderer_adapters import FrameNotAvailable, get_adapter

        adapter = get_adapter("motion-graphics-v1")
        with self.assertRaises(FrameNotAvailable):
            adapter.render_frame(0.0)
        payload = scene("scene:mg", 0.0, 4.0, [entity("entity:title", "text", {"text": "Xin chào"})])
        adapter.compile(payload)
        with self.assertRaises(FrameNotAvailable):
            adapter.render_frame(9.0)
        with self.assertRaises(Exception):
            adapter.render_frame(float("nan"))

    def test_compile_does_not_mutate_its_input(self):
        from bkt_web.renderer_adapters import get_adapter

        payload = scene("scene:mg", 0.0, 4.0, [entity("entity:title", "text", {"text": "Giữ nguyên"})])
        before = copy.deepcopy(payload)
        get_adapter("motion-graphics-v1").compile(payload)
        self.assertEqual(payload, before)


class NativeVectorAdapterTest(unittest.TestCase):
    """UV-400 — the five library examples must render unchanged."""

    def test_five_examples_compile_without_changing_the_v1_story(self):
        from bkt_web.remake_vector import examples
        from bkt_web.renderer_adapters import get_adapter
        from bkt_web.storyboard_migration import migrate_v1_to_v2

        for story in examples():
            with self.subTest(example=story["id"]):
                migrated = migrate_v1_to_v2(copy.deepcopy(story))
                adapter = get_adapter("native-vector-v1")
                for index, scene_payload in enumerate(migrated["scenes"]):
                    compiled = adapter.compile(scene_payload, {"storyboard": migrated})
                    self.assertEqual(compiled.plan["story"], story)
                    self.assertEqual(compiled.plan["scene_index"], index)
                    self.assertEqual(compiled.source_media_usage, "none")

    def test_frames_declare_the_javascript_host_and_keep_scene_times(self):
        from bkt_web.remake_vector import examples
        from bkt_web.renderer_adapters import get_adapter
        from bkt_web.storyboard_migration import migrate_v1_to_v2

        story = examples()[0]
        migrated = migrate_v1_to_v2(copy.deepcopy(story))
        adapter = get_adapter("native-vector-v1")
        compiled = adapter.compile(migrated["scenes"][0], {"storyboard": migrated})
        self.assertEqual(compiled.start, story["scenes"][0]["start_time"])
        self.assertEqual(compiled.end, story["scenes"][0]["end_time"])
        frame = adapter.render_frame(compiled.start + 1.0)
        self.assertEqual(frame["kind"], "host-callback")
        self.assertFalse(frame["host"]["python_rasterisation"])
        self.assertEqual(frame["host"]["entry"], "window.renderFrame")
        self.assertEqual(frame["host"]["argument_seconds"], compiled.start + 1.0)

    def test_offline_bundle_embeds_engine_and_catalog_without_an_animation_loop(self):
        from bkt_web.remake_vector import examples
        from bkt_web.renderer_adapters import get_adapter
        from bkt_web.storyboard_migration import migrate_v1_to_v2

        migrated = migrate_v1_to_v2(copy.deepcopy(examples()[0]))
        adapter = get_adapter("native-vector-v1")
        adapter.compile(migrated["scenes"][0], {"storyboard": migrated})
        bundle = adapter.offline_bundle()
        self.assertIn("globalThis.RemakeVector", bundle)
        self.assertIn("\"native-vector-v1\"", bundle)
        self.assertIn("window.renderFrame=", bundle)
        self.assertNotIn("requestAnimationFrame", bundle)

    def test_unknown_asset_and_action_are_rejected(self):
        from bkt_web.renderer_adapters import SceneNotSupported, get_adapter

        adapter = get_adapter("native-vector-v1")
        payload = scene(
            "scene:native",
            0.0,
            4.0,
            [entity("entity:ghost", "fruit", {"asset": "not-in-catalog"})],
            [action("action:1", "teleport", ["entity:ghost"], 0.5, 1.0)],
        )
        codes = {issue.code for issue in adapter.validate(payload, {"storyboard": {}})}
        self.assertIn("NATIVE_ASSET_UNKNOWN", codes)
        self.assertIn("NATIVE_ACTION_UNSUPPORTED", codes)
        with self.assertRaises(SceneNotSupported):
            adapter.compile(payload, {"storyboard": {}})

    def test_router_selection_resolves_to_the_native_adapter(self):
        from bkt_web.remake_vector import articulation_examples
        from bkt_web.render_router import route_storyboard
        from bkt_web.renderer_adapters import adapter_for_selection
        from bkt_web.storyboard_migration import migrate_v1_to_v2

        routed = route_storyboard(migrate_v1_to_v2(articulation_examples()[0]))
        selection = routed["render_plan"]["selections"][0]
        self.assertEqual(selection["status"], "selected")
        self.assertEqual(adapter_for_selection(selection).renderer_id, selection["renderer_id"])


class MotionGraphicsAdapterTest(unittest.TestCase):
    """UV-401 — responsive layout, stable font fallback, no overflow."""

    def payload(self):
        return scene(
            "scene:mg",
            0.0,
            6.0,
            [
                entity("entity:title", "text", {"text": "Sản lượng tăng mạnh trong quý này", "font_family": "Inter"}),
                entity("entity:lower", "lower_third", {"text": "Nguyễn Văn A · Kỹ sư nông nghiệp"}),
                entity("entity:chart", "chart", {"series": [{"label": "Q1", "value": 12}, {"label": "Q2", "value": 20}]}),
                entity("entity:note", "callout", {"text": "Ghi chú", "anchor_point": {"x": 0.7, "y": 0.8}}),
            ],
            [
                action("action:reveal", "mg.reveal", ["entity:title"], 0.0, 1.0),
                action("action:grow", "mg.chart-grow", ["entity:chart"], 1.0, 3.0),
                action("action:point", "mg.callout-point", ["entity:note"], 1.0, 2.0),
                action("action:bye", "mg.dismiss", ["entity:title"], 5.0, 6.0),
            ],
        )

    def test_layout_fits_every_supported_aspect_ratio(self):
        from bkt_web.renderer_adapters import CANVAS_PRESETS, get_adapter

        for preset, size in CANVAS_PRESETS.items():
            with self.subTest(aspect=preset):
                adapter = get_adapter("motion-graphics-v1")
                compiled = adapter.compile(self.payload(), canvas=preset)
                self.assertEqual(compiled.canvas["width"], size["width"])
                for element in compiled.plan["elements"]:
                    box = element["box"]
                    self.assertLessEqual(box["x"] + box["width"], size["width"] + 1e-6)
                    self.assertLessEqual(box["y"] + box["height"], size["height"] + 1e-6)
                    layout = element.get("text_layout")
                    if layout:
                        self.assertLessEqual(len(layout["lines"]) * layout["line_height"], layout["max_height"] + 1e-6)
                        for line in layout["lines"]:
                            self.assertLessEqual(line["width"], layout["max_width"] + 1e-6)
                frame = adapter.render_frame(2.0)
                for layer in frame["layers"]:
                    for op in layer["ops"]:
                        if op["op"] == "text":
                            self.assertLessEqual(op["measured_width"], op["max_width"] + 1e-6)

    def test_font_fallback_is_stable_and_reported(self):
        from bkt_web.renderer_adapters import get_adapter
        from bkt_web.renderer_adapters.motion_graphics import resolve_font

        first = resolve_font("Không Tồn Tại Sans")
        second = resolve_font("Một Font Khác")
        self.assertTrue(first["fallback"])
        self.assertEqual(first["stack"], second["stack"])
        self.assertEqual(first["metric_class"], "sans")
        self.assertFalse(resolve_font("IBM Plex Mono")["fallback"])
        adapter = get_adapter("motion-graphics-v1")
        payload = scene("scene:mg", 0.0, 2.0, [entity("entity:t", "text", {"text": "Xin chào", "font_family": "Font Ảo"})])
        compiled = adapter.compile(payload)
        self.assertTrue(any("Font Ảo" in warning for warning in compiled.warnings))

    def test_text_that_cannot_fit_is_refused_instead_of_overflowing(self):
        from bkt_web.renderer_adapters import SceneNotSupported, get_adapter

        payload = scene(
            "scene:mg",
            0.0,
            2.0,
            [entity("entity:t", "text", {"text": "Chuỗi rất dài " * 60, "box": {"x": 0.1, "y": 0.1, "width": 0.12, "height": 0.06}})],
        )
        with self.assertRaises(SceneNotSupported) as raised:
            get_adapter("motion-graphics-v1").compile(payload)
        self.assertIn("MG_TEXT_OVERFLOW", {issue.code for issue in raised.exception.issues})

    def test_seek_is_deterministic_and_independent_of_playback_order(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("motion-graphics-v1")
        compiled = adapter.compile(self.payload())
        forward = adapter.render_range(0.0, 3.0, fps=10)
        backward = [adapter.render_frame(item["seconds"]) for item in reversed(forward)]
        self.assertEqual(forward, list(reversed(backward)))
        fresh = get_adapter("motion-graphics-v1")
        fresh.compile(self.payload())
        self.assertEqual(fresh.render_frame(2.0), adapter.render_frame(2.0))
        self.assertEqual(compiled.plan, fresh._compiled.plan)

    def test_unsupported_kind_and_action_are_reported_with_paths(self):
        from bkt_web.renderer_adapters import get_adapter

        payload = scene(
            "scene:mg",
            0.0,
            2.0,
            [entity("entity:x", "hologram", {}), entity("entity:t", "text", {"text": "ok"})],
            [action("action:1", "mg.chart-grow", ["entity:t"], 0.0, 1.0)],
        )
        issues = {issue.code: issue.path for issue in get_adapter("motion-graphics-v1").validate(payload)}
        self.assertEqual(issues["MG_ENTITY_KIND_UNSUPPORTED"], "$.entities[0].kind")
        self.assertIn("MG_ACTION_KIND_MISMATCH", issues)


class ScreenUiAdapterTest(unittest.TestCase):
    """UV-402 — privacy and deterministic crop/zoom."""

    IMAGES = {"shot-1": {"uri": "media/ui_tutorial.png", "sha256": "a" * 64, "width": 1920, "height": 1080}}

    def payload(self, *, redacted=True, private=True):
        entities = [
            entity("entity:screen", "screenshot", {"image_id": "shot-1"}),
            entity("entity:cursor", "cursor", {"path": [{"time": 0.0, "x": 0.1, "y": 0.9}, {"time": 2.0, "x": 0.6, "y": 0.4, "ease": "smooth"}], "click_times": [2.0]}),
            entity("entity:focus", "focus_ring", {"region": {"x": 0.5, "y": 0.3, "width": 0.2, "height": 0.1}}),
        ]
        if private:
            entities.append(entity("entity:email", "highlight", {"region": {"x": 0.05, "y": 0.05, "width": 0.2, "height": 0.05}, "contains_private_data": True}))
        if redacted:
            entities.append(entity("entity:redact", "redaction", {"region": {"x": 0.0, "y": 0.0, "width": 0.3, "height": 0.12}, "style": "blur"}))
        shots = camera(
            0.0,
            4.0,
            movement="zoom",
            framing="screen_capture",
            parameters={
                "from_region": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0},
                "to_region": {"x": 0.25, "y": 0.25, "width": 0.5, "height": 0.5},
                "ease": "linear",
            },
        )
        return scene("scene:ui", 0.0, 4.0, entities, shots=shots)

    def test_private_region_must_be_redacted_before_compiling(self):
        from bkt_web.renderer_adapters import SceneNotSupported, get_adapter

        adapter = get_adapter("screen-ui-v1")
        with self.assertRaises(SceneNotSupported) as raised:
            adapter.compile(self.payload(redacted=False), {"images": self.IMAGES}, canvas="16:9")
        self.assertIn("UI_PRIVATE_REGION_NOT_REDACTED", {issue.code for issue in raised.exception.issues})
        compiled = adapter.compile(self.payload(), {"images": self.IMAGES}, canvas="16:9")
        redaction_ops = [op for layer in adapter.render_frame(1.0, compiled=compiled)["layers"] for op in layer["ops"] if op["op"] == "blur_rect"]
        self.assertEqual(len(redaction_ops), 1)

    def test_remote_or_unchecksummed_images_are_rejected(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("screen-ui-v1")
        remote = {"shot-1": {"uri": "https://example.com/shot.png", "sha256": "b" * 64}}
        codes = {issue.code for issue in adapter.validate(self.payload(), {"images": remote})}
        self.assertIn("UI_IMAGE_REMOTE", codes)
        codes = {issue.code for issue in adapter.validate(self.payload(), {"images": {}})}
        self.assertIn("UI_IMAGE_NOT_FROZEN", codes)

    def test_crop_zoom_is_deterministic_and_linear_between_regions(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("screen-ui-v1")
        compiled = adapter.compile(self.payload(), {"images": self.IMAGES}, canvas="16:9")
        midpoint = adapter.crop_at(compiled, 2.0)
        self.assertAlmostEqual(midpoint["x"], 0.125, places=9)
        self.assertAlmostEqual(midpoint["width"], 0.75, places=9)
        self.assertEqual(adapter.crop_at(compiled, 4.0)["width"], 0.5)
        self.assertEqual(adapter.render_frame(1.5), adapter.render_frame(1.5))
        self.assertEqual(adapter.render_range(0.0, 2.0, fps=8)[-1], adapter.render_frame(2.0))

    def test_cursor_follows_the_declared_path_and_clicks_are_time_bound(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("screen-ui-v1")
        adapter.compile(self.payload(), {"images": self.IMAGES}, canvas="16:9")
        start_ops = [op for layer in adapter.render_frame(0.0)["layers"] for op in layer["ops"] if op["op"] == "cursor"]
        self.assertEqual(len(start_ops), 1)
        click_frame = adapter.render_frame(2.1)
        self.assertTrue(any(op["op"] == "ellipse" for layer in click_frame["layers"] for op in layer["ops"]))
        quiet_frame = adapter.render_frame(3.5)
        self.assertFalse(any(op["op"] == "ellipse" for layer in quiet_frame["layers"] for op in layer["ops"]))


class FootageCompositeAdapterTest(unittest.TestCase):
    """UV-403 — source reuse is disclosed, or refused."""

    SOURCES = {"source:clip": {"uri": "media/source.mp4", "sha256": "c" * 64}}

    def payload(self, *, forbid=False):
        required = [requirement("requirement:no-reuse", "feature.no_source_media_reuse")] if forbid else []
        return scene(
            "scene:fc",
            0.0,
            5.0,
            [
                entity("entity:mask", "mask", {"region": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8}}),
                entity("entity:clip", "footage", {
                    "source_id": "source:clip",
                    "source_start": 12.0,
                    "source_end": 17.0,
                    "crop": {"x": 0.1, "y": 0.0, "width": 0.8, "height": 1.0},
                    "mask_id": "entity:mask",
                    "remove_background": True,
                    "color_transform": {"exposure": 0.3, "saturation": 1.2},
                    "keep_source_audio": True,
                }),
            ],
            required=required,
        )

    def test_manifest_and_fallback_disclose_the_reused_footage(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("footage-composite-v1")
        compiled = adapter.compile(self.payload(), {"sources": self.SOURCES})
        manifest = adapter.manifest()
        self.assertEqual(compiled.fidelity_class, "source-composite")
        self.assertEqual(manifest["source_media_usage"], "visual_and_audio")
        self.assertEqual(manifest["segments"][0]["source_interval"], [12.0, 17.0])
        self.assertEqual(manifest["source_seconds_reused"], 5.0)
        self.assertIn("fc.remove-background", manifest["segments"][0]["operations"])
        fallback = adapter.report_fallbacks()[0]
        self.assertEqual(fallback["type"], "source_composite")
        self.assertEqual(fallback["reason_code"], "SOURCE_MEDIA_REUSED")
        self.assertTrue(fallback["approval_required"])
        self.assertIn("không phải remake hoàn chỉnh", fallback["disclosure"])

    def test_fallback_record_validates_inside_a_render_plan(self):
        from bkt_web.renderer_adapters import get_adapter
        from bkt_web.universal_storyboard import Fallback

        adapter = get_adapter("footage-composite-v1")
        adapter.compile(self.payload(), {"sources": self.SOURCES})
        parsed = Fallback.model_validate(adapter.report_fallbacks()[0])
        self.assertEqual(parsed.source_media_usage, "visual_and_audio")

    def test_policy_forbidding_source_reuse_stops_the_compile(self):
        from bkt_web.renderer_adapters import SceneNotSupported, get_adapter

        adapter = get_adapter("footage-composite-v1")
        with self.assertRaises(SceneNotSupported) as raised:
            adapter.compile(self.payload(forbid=True), {"sources": self.SOURCES})
        self.assertIn("FC_SOURCE_REUSE_FORBIDDEN", {issue.code for issue in raised.exception.issues})
        with self.assertRaises(SceneNotSupported):
            adapter.compile(self.payload(), {"sources": self.SOURCES, "policy": {"allow_source_reuse": False}})

    def test_source_timestamps_map_deterministically(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("footage-composite-v1")
        adapter.compile(self.payload(), {"sources": self.SOURCES})
        frame = adapter.render_frame(2.5)
        op = frame["layers"][0]["ops"][0]
        self.assertEqual(op["op"], "video_frame")
        self.assertAlmostEqual(op["source_seconds"], 14.5, places=9)
        self.assertEqual(op["sha256"], "c" * 64)
        self.assertEqual(adapter.render_frame(2.5), frame)

    def test_missing_or_remote_source_is_rejected(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("footage-composite-v1")
        codes = {issue.code for issue in adapter.validate(self.payload(), {"sources": {}})}
        self.assertIn("FC_SOURCE_NOT_DECLARED", codes)
        remote = {"source:clip": {"uri": "https://cdn.example.com/a.mp4", "sha256": "c" * 64}}
        codes = {issue.code for issue in adapter.validate(self.payload(), {"sources": remote})}
        self.assertIn("FC_SOURCE_REMOTE", codes)


class Puppet2DAdapterTest(unittest.TestCase):
    """UV-404 — IK, lip sync, expressions, reusable rigs."""

    def payload(self, rig="puppet.rig.adult", height=0.6):
        return scene(
            "scene:puppet",
            0.0,
            4.0,
            [
                entity("entity:host", "character", {
                    "rig": rig,
                    "height_fraction": height,
                    "speaker_id": "speaker:host",
                    "poses": [
                        {"time": 0.0, "hips": {"x": 0.5, "y": 0.8}, "expression": "neutral"},
                        {"time": 2.0, "hips": {"x": 0.5, "y": 0.8}, "hand_r": {"x": 0.62, "y": 0.62}, "expression": "happy", "ease": "smooth"},
                    ],
                }),
            ],
            [action("action:reach", "puppet.reach", ["entity:host"], 0.5, 2.0)],
            audio_events=[{
                "audio_event_id": "audio:1",
                "kind": "dialogue",
                "start": 0.5,
                "end": 2.5,
                "speaker_id": "speaker:host",
                "text": "Chào bạn, hôm nay ta thu hoạch",
                "provenance_id": PROVENANCE,
            }],
        )

    def test_two_bone_ik_reaches_and_clamps_honestly(self):
        from bkt_web.renderer_adapters.puppet_2d import two_bone_ik

        reachable = two_bone_ik((0.0, 0.0), (30.0, 10.0), 25.0, 25.0, 1, (0.0, 160.0))
        self.assertFalse(reachable["reach_limited"])
        self.assertAlmostEqual(reachable["effector"][0], 30.0, places=6)
        self.assertAlmostEqual(reachable["effector"][1], 10.0, places=6)
        self.assertAlmostEqual(
            ((reachable["joint"][0]) ** 2 + (reachable["joint"][1]) ** 2) ** 0.5, 25.0, places=6
        )
        far = two_bone_ik((0.0, 0.0), (400.0, 0.0), 25.0, 25.0, 1, (0.0, 160.0))
        self.assertTrue(far["reach_limited"])
        self.assertLessEqual(far["effector"][0], 50.0)

    def test_rigs_are_reusable_and_scale_with_character_height(self):
        from bkt_web.renderer_adapters import get_adapter
        from bkt_web.renderer_adapters.puppet_2d import rig_library

        library = rig_library()
        self.assertGreaterEqual(len(library["rigs"]), 3)
        small = get_adapter("puppet-2d-v1").compile(self.payload(height=0.4))
        large = get_adapter("puppet-2d-v1").compile(self.payload(height=0.8))
        ratio = large.plan["characters"][0]["bones"]["upper_arm"] / small.plan["characters"][0]["bones"]["upper_arm"]
        self.assertAlmostEqual(ratio, 2.0, places=9)
        child = get_adapter("puppet-2d-v1").compile(self.payload(rig="puppet.rig.child"))
        self.assertNotEqual(child.plan["characters"][0]["bones"], small.plan["characters"][0]["bones"])

    def test_lip_sync_follows_dialogue_and_closes_in_silence(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("puppet-2d-v1")
        adapter.compile(self.payload())
        speaking = adapter.render_frame(1.2)["layers"][0]["mouth"]
        silent = adapter.render_frame(3.5)["layers"][0]["mouth"]
        self.assertTrue(speaking["speaking"])
        self.assertFalse(silent["speaking"])
        self.assertEqual(silent["viseme"], "rest")
        self.assertEqual(adapter.render_frame(1.2)["layers"][0]["mouth"], speaking)

    def test_expression_and_pose_are_pure_functions_of_the_timestamp(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("puppet-2d-v1")
        adapter.compile(self.payload())
        self.assertEqual(adapter.render_frame(0.0)["layers"][0]["pose"]["expression"], "neutral")
        self.assertEqual(adapter.render_frame(2.0)["layers"][0]["pose"]["expression"], "happy")
        forward = adapter.render_range(0.0, 3.0, fps=6)
        self.assertEqual([adapter.render_frame(item["seconds"]) for item in forward], forward)

    def test_layered_character_has_clothes_hair_hands_shoes_and_face(self):
        from bkt_web.renderer_adapters import get_adapter

        payload = self.payload()
        payload["entities"][0]["attributes"].update({"hair_style": "bun", "accessory": "glasses"})
        adapter = get_adapter("puppet-2d-v1")
        adapter.compile(payload)
        ops = adapter.render_frame(1.0)["layers"][0]["ops"]
        self.assertGreaterEqual(len(ops), 30)
        self.assertIn("polygon", {op["op"] for op in ops})
        self.assertGreaterEqual(sum(op["op"] == "ellipse" for op in ops), 10)
        self.assertTrue(any(op.get("fill") == "#322923" for op in ops))

    def test_unknown_rig_and_unmapped_speaker_are_reported(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("puppet-2d-v1")
        broken = self.payload()
        broken["entities"][0]["attributes"]["rig"] = "puppet.rig.dragon"
        codes = {issue.code for issue in adapter.validate(broken)}
        self.assertIn("PUPPET_RIG_UNKNOWN", codes)
        mismatched = self.payload()
        mismatched["audio_events"][0]["speaker_id"] = "speaker:other"
        self.assertIn("PUPPET_SPEAKER_UNMAPPED", {issue.code for issue in adapter.validate(mismatched)})


class ThreeDSpikeAdapterTest(unittest.TestCase):
    """UV-405 — one deterministic camera + object + light scene, plus cost."""

    def payload(self):
        shots = camera(
            0.0,
            4.0,
            movement="orbit",
            parameters={
                "position": {"x": 0.0, "y": 1.5, "z": 5.0},
                "look_at": {"x": 0.0, "y": 0.0, "z": 0.0},
                "fov_degrees": 45.0,
                "orbit_degrees": 90.0,
                "ease": "linear",
            },
        )
        return scene(
            "scene:3d",
            0.0,
            4.0,
            [
                entity("entity:cube", "mesh", {"primitive": "cube", "position": {"x": 0.0, "y": 0.0, "z": 0.0}, "scale": 1.5, "colour": "#8ab6a0"}),
                entity("entity:light", "light", {"direction": {"x": -0.4, "y": -1.0, "z": -0.3}, "intensity": 1.0, "ambient": 0.25}),
            ],
            shots=shots,
        )

    def test_scene_renders_deterministically_with_visible_geometry(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("three-d-spike-v1")
        adapter.compile(self.payload(), canvas="16:9")
        frame = adapter.render_frame(1.0)
        self.assertGreater(frame["stats"]["polygons"], 0)
        self.assertEqual(adapter.render_frame(1.0), frame)
        fresh = get_adapter("three-d-spike-v1")
        fresh.compile(self.payload(), canvas="16:9")
        self.assertEqual(fresh.render_frame(1.0), frame)
        self.assertNotEqual(adapter.render_frame(3.0)["stats"]["camera_position"], frame["stats"]["camera_position"])

    def test_cost_report_states_the_spike_limits(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("three-d-spike-v1")
        adapter.compile(self.payload(), canvas="16:9")
        report = adapter.cost_report(samples=8)
        self.assertEqual(report["maturity"], "spike")
        self.assertTrue(report["deterministic_seek"])
        self.assertGreater(report["polygons_per_frame"]["max"], 0)
        self.assertGreater(report["seconds_per_frame"], 0)
        self.assertTrue(report["notes"])

    def test_scene_without_exactly_one_light_is_rejected(self):
        from bkt_web.renderer_adapters import get_adapter

        adapter = get_adapter("three-d-spike-v1")
        payload = self.payload()
        payload["entities"].append(entity("entity:light2", "light", {"direction": {"x": 1.0, "y": 0.0, "z": 0.0}}))
        self.assertIn("TD_LIGHT_COUNT", {issue.code for issue in adapter.validate(payload)})


class OfflineBundleTest(unittest.TestCase):
    def test_draw_list_bundle_is_self_contained_and_loop_free(self):
        from bkt_web.renderer_adapters import build_draw_list_bundle, get_adapter

        adapter = get_adapter("motion-graphics-v1")
        adapter.compile(scene("scene:mg", 0.0, 1.0, [entity("entity:t", "text", {"text": "Bản dựng offline"})]))
        bundle = build_draw_list_bundle(adapter, fps=5)
        self.assertIn("globalThis.RemakeFrameRuntime", bundle)
        self.assertIn("window.renderFrame=", bundle)
        self.assertNotIn("requestAnimationFrame", bundle)
        self.assertIn("\"kind\": \"draw-list\"".replace(" ", ""), bundle.replace(" ", ""))

    def test_host_callback_renderers_do_not_pretend_to_export_draw_lists(self):
        from bkt_web.remake_vector import examples
        from bkt_web.renderer_adapters import AdapterError, build_draw_list_bundle, get_adapter
        from bkt_web.storyboard_migration import migrate_v1_to_v2

        migrated = migrate_v1_to_v2(copy.deepcopy(examples()[0]))
        adapter = get_adapter("native-vector-v1")
        adapter.compile(migrated["scenes"][0], {"storyboard": migrated})
        with self.assertRaises(AdapterError):
            build_draw_list_bundle(adapter)


class RendererInspectionApiTest(unittest.TestCase):
    def test_api_lists_every_adapter_with_its_frame_mode(self):
        from bkt_web.remake_routes import get_renderer_capabilities
        from bkt_web.renderer_adapters import available_adapters

        payload = get_renderer_capabilities()
        listed = {item["renderer_id"]: item for item in payload["adapters"]}
        self.assertEqual(sorted(listed), available_adapters())
        self.assertEqual(listed["three-d-spike-v1"]["maturity"], "spike")
        self.assertFalse(listed["native-vector-v1"]["offline_frame_render"])
        self.assertTrue(listed["motion-graphics-v1"]["offline_frame_render"])


if __name__ == "__main__":
    unittest.main()
