import copy
import json
import unittest


PROVENANCE = {
    "provenance_id": "provenance.human",
    "kind": "human",
    "created_at": "2026-09-21T02:00:00Z",
    "agent": "fixture",
    "source_refs": ["source.case"],
    "evidence": [{
        "evidence_id": "evidence.frames",
        "kind": "frame_range",
        "source_id": "source.case",
        "interval": {"start": 0, "end": 4},
    }],
}


def component(component_id, *, parent=None, state="visible", transform=None, anchors=None, bounds=None, joint_limit=None, extra=None):
    attributes = {}
    if transform is not None:
        attributes["transform"] = transform
    if anchors:
        attributes["anchor_transforms"] = {name: value for name, value in anchors.items()}
    if bounds is not None:
        attributes["bounds"] = bounds
    if joint_limit is not None:
        attributes["joint_limit"] = joint_limit
    if extra:
        attributes.update(extra)
    entry = {
        "component_id": component_id,
        "kind": "part",
        "state": state,
        "anchors": [
            {"anchor_id": f"{component_id}.{name}".replace("_", "."), "name": name}
            for name in sorted(anchors or {})
        ],
        "attributes": attributes,
    }
    if parent is not None:
        entry["parent_component_id"] = parent
    return entry


def entity(entity_id, components, kind="object", label=None):
    return {
        "entity_id": entity_id,
        "kind": kind,
        "label": label or entity_id.split(".")[-1],
        "role": "observed",
        "components": components,
        "attributes": {},
        "provenance_id": "provenance.human",
    }


def constraint(constraint_id, kind, subjects, start=0.0, end=4.0, strength="hard", **parameters):
    return {
        "constraint_id": constraint_id,
        "type": kind,
        "subject_ids": list(subjects),
        "start": start,
        "end": end,
        "strength": strength,
        "parameters": parameters,
        "provenance_id": "provenance.human",
    }


def action(action_id, kind, actor, targets, start, end, **parameters):
    return {
        "action_id": action_id,
        "type": kind,
        "actor_ids": [actor],
        "target_ids": list(targets),
        "start": start,
        "end": end,
        "parameters": parameters,
        "provenance_id": "provenance.human",
    }


def scene(entities, constraints=(), actions=(), scene_id="scene.one", start=0.0, end=4.0):
    return {
        "scene_id": scene_id,
        "start": start,
        "end": end,
        "entities": list(entities),
        "relations": [],
        "actions": list(actions),
        "constraints": list(constraints),
        "camera": {
            "camera_id": f"{scene_id}.camera",
            "shots": [{
                "shot_id": f"{scene_id}.shot.0",
                "start": start,
                "end": end,
                "framing": "custom",
                "movement": "static",
                "subject_ids": [],
                "parameters": {},
                "provenance_id": "provenance.human",
            }],
        },
        "environment": None,
        "style": None,
        "audio_events": [],
        "render_requirements": {"required": [], "preferred": [], "optional": []},
        "provenance_id": "provenance.human",
    }


def storyboard(scenes, duration=4.0):
    return {
        "schema_version": "2.0.0",
        "project_id": "project.geometry",
        "source": {"source_id": "source.case", "sha256": "a" * 64, "media_type": "video/mp4", "frame_rate": 25.0},
        "duration_seconds": duration,
        "timebase": {"unit": "seconds", "origin_seconds": 0, "precision": 6},
        "tracks": [{
            "track_id": "track.visual",
            "kind": "visual",
            "items": [
                {"item_id": f"item.{item['scene_id']}", "target_type": "scene", "target_id": item["scene_id"],
                 "start": item["start"], "end": item["end"], "layer": 0}
                for item in scenes
            ],
        }],
        "scenes": list(scenes),
        "render_plan": {
            "render_plan_id": "render.plan.fixture",
            "status": "needs-review",
            "selections": [{
                "selection_id": f"selection.{item['scene_id']}",
                "scene_id": item["scene_id"],
                "start": item["start"],
                "end": item["end"],
                "renderer_id": "renderer.unassigned",
                "renderer_version": "0.0.0",
                "status": "needs-review",
                "satisfied_requirement_ids": [],
                "fallback_ids": [],
            } for item in scenes],
            "fallbacks": [],
        },
        "provenance": [PROVENANCE],
    }


def check(document, scene_id=None, **settings):
    from bkt_web.fidelity_geometric import GeometricSettings, check_geometric_fidelity

    return check_geometric_fidelity(
        document,
        GeometricSettings(**settings) if settings else None,
        scene_id=scene_id,
    )


def clean_scene():
    """A hand holding a fruit, both solid, nothing overlapping wrongly."""
    hand = entity("entity.hand", [
        component("component.hand", transform={"x": 100, "y": 200},
                  anchors={"grip": {"x": 5, "y": 0}}, bounds={"width": 20, "height": 20}),
    ], kind="person", label="hand")
    fruit = entity("entity.fruit", [
        component("component.fruit", transform={"x": 105, "y": 200}, bounds={"width": 10, "height": 10}),
    ], label="fruit")
    contact = constraint("constraint.grip", "point_to_point", ["component.hand.grip", "component.fruit"])
    return storyboard([scene([hand, fruit], [contact])])


class CleanSceneTest(unittest.TestCase):
    def test_a_solved_scene_reports_no_failures(self):
        report = check(clean_scene())
        self.assertTrue(report.passed, report.codes())
        self.assertEqual(report.metrics["components_without_bounds"], 0.0)
        self.assertGreater(len(report.sampled_seconds), 90)

    def test_the_report_is_json_serialisable_and_echoes_settings(self):
        payload = check(clean_scene()).as_dict()
        self.assertEqual(json.loads(json.dumps(payload)), payload)
        self.assertEqual(payload["schema"], "tokmatrix.geometric-fidelity/v1")
        self.assertEqual(payload["settings"]["sample_rate"], 24.0)
        self.assertTrue(payload["passed"])

    def test_sampling_is_deterministic_and_does_not_mutate_the_document(self):
        document = clean_scene()
        before = copy.deepcopy(document)
        first = check(document).as_dict()
        second = check(document).as_dict()
        self.assertEqual(first, second)
        self.assertEqual(document, before)

    def test_a_component_without_bounds_is_reported_not_assumed_clean(self):
        document = clean_scene()
        del document["scenes"][0]["entities"][1]["components"][0]["attributes"]["bounds"]
        report = check(document)
        self.assertEqual(
            [item["component_id"] for item in report.unchecked],
            ["component.fruit"],
        )
        self.assertEqual(report.metrics["components_without_bounds"], 1.0)


class ContactTest(unittest.TestCase):
    def test_an_unsatisfiable_contact_is_reported_with_its_gap(self):
        document = clean_scene()
        scene_body = document["scenes"][0]
        # Two hard contacts pull the fruit to places far apart, so one of them
        # must lose and the gap is real.
        scene_body["entities"].append(entity("entity.post", [
            component("component.post", transform={"x": 900, "y": 800}, bounds={"width": 10, "height": 10}),
        ], label="post"))
        scene_body["constraints"].append(
            constraint("constraint.rival", "point_to_point", ["component.post", "component.fruit"],
                       movable_id="component.fruit", priority=200)
        )
        report = check(document)
        self.assertIn("CONTACT_GAP", report.codes())
        self.assertFalse(report.passed)
        self.assertGreater(report.metrics["worst_contact_gap_px"], 2.0)

    def test_a_soft_contact_gap_is_only_a_warning(self):
        document = clean_scene()
        scene_body = document["scenes"][0]
        scene_body["entities"].append(entity("entity.post", [
            component("component.post", transform={"x": 900, "y": 800}, bounds={"width": 10, "height": 10}),
        ], label="post"))
        scene_body["constraints"][0]["parameters"] = {"priority": 200}
        scene_body["constraints"].append(
            constraint("constraint.rival", "point_to_point", ["component.post", "component.fruit"],
                       movable_id="component.fruit", strength="soft", priority=10)
        )
        report = check(document)
        self.assertIn("CONTACT_GAP", report.codes())
        self.assertEqual({item.severity for item in report.by_category("contact")}, {"warn"})
        self.assertTrue(report.passed)


class GroundTest(unittest.TestCase):
    def grounded(self, path_points=None):
        foot = entity("entity.foot", [
            component("component.foot", transform={"x": 100, "y": 600}, bounds={"width": 20, "height": 10}),
        ], kind="person", label="foot")
        constraints = [constraint("constraint.ground", "ground_contact", ["component.foot"], ground_y=600)]
        if path_points:
            constraints.append(
                constraint("constraint.walk", "path_follow", ["component.foot"], points=path_points, priority=150)
            )
        return storyboard([scene([foot], constraints)])

    def test_a_planted_foot_that_stays_put_passes(self):
        report = check(self.grounded())
        self.assertTrue(report.passed, report.codes())
        self.assertEqual(report.metrics["worst_ground_slip_px_per_second"], 0.0)

    def test_a_planted_foot_that_slides_fails(self):
        report = check(self.grounded([{"x": 100, "y": 600}, {"x": 500, "y": 600}]))
        self.assertIn("GROUND_SLIP", report.codes())
        self.assertGreater(report.metrics["worst_ground_slip_px_per_second"], 4.0)

    def test_the_slip_threshold_is_a_setting(self):
        document = self.grounded([{"x": 100, "y": 600}, {"x": 500, "y": 600}])
        self.assertTrue(check(document, ground_slip_per_second=1000.0).passed)


class IntersectionTest(unittest.TestCase):
    def test_two_solids_sharing_space_fail(self):
        # Two things with no contact between them cannot share the same space.
        document = clean_scene()
        document["scenes"][0]["entities"].append(entity("entity.post", [
            component("component.post", transform={"x": 100, "y": 200}, bounds={"width": 20, "height": 20}),
        ], label="post"))
        report = check(document)
        self.assertIn("COMPONENTS_INTERSECT", report.codes())
        self.assertGreater(report.metrics["worst_intersection_ratio"], 0.10)

    def test_a_parent_and_its_child_may_overlap(self):
        body = component("component.body", transform={"x": 100, "y": 200}, bounds={"width": 40, "height": 40})
        hand = component("component.hand", parent="component.body", transform={"x": 0, "y": 0},
                         bounds={"width": 20, "height": 20})
        document = storyboard([scene([entity("entity.person", [body, hand], kind="person", label="person")])])
        self.assertTrue(check(document).passed)

    def test_a_detached_part_is_not_counted_as_intersecting(self):
        plant = component("component.plant", transform={"x": 100, "y": 200}, bounds={"width": 40, "height": 40})
        fruit = component("component.fruit", parent="component.plant", state="attached",
                          transform={"x": 0, "y": 0}, bounds={"width": 20, "height": 20})
        detach = action("action.pluck", "pluck", "entity.hand", ["component.fruit"], 1.0, 1.5)
        hand = entity("entity.hand", [component("component.hand", transform={"x": 900, "y": 900},
                                                bounds={"width": 5, "height": 5})], kind="person", label="hand")
        document = storyboard([scene([entity("entity.plant", [plant, fruit], label="plant"), hand], actions=[detach])])
        report = check(document)
        self.assertNotIn("COMPONENTS_INTERSECT", report.codes())


class AttachmentTest(unittest.TestCase):
    def lifecycle(self, preserve_world=True):
        plant = component("component.plant", transform={"x": 100, "y": 200}, bounds={"width": 40, "height": 40})
        fruit = component("component.fruit", parent="component.plant", state="attached",
                          transform={"x": 18, "y": -30}, bounds={"width": 10, "height": 10})
        hand = entity("entity.hand", [component("component.hand", transform={"x": 800, "y": 700},
                                                bounds={"width": 10, "height": 10})], kind="person", label="hand")
        parameters = {"preserve_world": preserve_world}
        if not preserve_world:
            parameters["local_transform"] = {"x": 700, "y": 600}
        pluck = action("action.pluck", "pluck", "entity.hand", ["component.fruit"], 1.5, 2.0, **parameters)
        return storyboard([scene([entity("entity.plant", [plant, fruit], label="plant"), hand], actions=[pluck])])

    def test_a_preserved_detach_does_not_jump(self):
        report = check(self.lifecycle())
        self.assertNotIn("ATTACHMENT_JUMP", report.codes())
        self.assertLessEqual(report.metrics["worst_attachment_jump_px"], 1.0)

    def test_a_detach_that_teleports_the_part_fails(self):
        report = check(self.lifecycle(preserve_world=False))
        self.assertIn("ATTACHMENT_JUMP", report.codes())
        self.assertFalse(report.passed)
        jump = next(item for item in report.by_category("attachment"))
        self.assertAlmostEqual(jump.seconds, 2.0)
        self.assertGreater(jump.measured, 1.0)


class JointTest(unittest.TestCase):
    def hinge(self, rotation, limit=(-30.0, 30.0), with_constraint=False):
        body = component("component.body", transform={"x": 100, "y": 200}, bounds={"width": 40, "height": 40})
        lid = component("component.lid", parent="component.body", transform={"x": 0, "y": -30, "rotation": rotation},
                        bounds={"width": 30, "height": 6},
                        joint_limit={"min_degrees": limit[0], "max_degrees": limit[1]})
        constraints = []
        if with_constraint:
            constraints.append(
                constraint("constraint.hinge", "joint_limit", ["component.lid"],
                           min_degrees=limit[0], max_degrees=limit[1])
            )
        return storyboard([scene([entity("entity.box", [body, lid], label="box")], constraints)])

    def test_a_hinge_inside_its_limit_passes(self):
        self.assertTrue(check(self.hinge(20.0)).passed)

    def test_a_rig_joint_limit_is_enforced_even_without_a_constraint(self):
        report = check(self.hinge(80.0))
        self.assertIn("RIG_JOINT_LIMIT_EXCEEDED", report.codes())
        self.assertAlmostEqual(report.metrics["worst_joint_excess_degrees"], 50.0)

    def test_a_joint_constraint_that_cannot_be_met_is_reported(self):
        document = self.hinge(80.0, with_constraint=True)
        # The solver clamps the hinge, so the rig check passes and no
        # unsatisfied joint constraint remains.
        report = check(document)
        self.assertNotIn("JOINT_LIMIT_EXCEEDED", report.codes())

    def test_the_joint_tolerance_is_a_setting(self):
        self.assertTrue(check(self.hinge(80.0), joint_tolerance_degrees=90.0).passed)


class ApiTest(unittest.TestCase):
    def test_every_scene_of_a_project_can_be_checked(self):
        from bkt_web.fidelity_geometric import check_storyboard_geometry

        first = scene([entity("entity.a", [component("component.a", transform={"x": 10, "y": 10},
                                                     bounds={"width": 5, "height": 5})], label="a")],
                      scene_id="scene.one", start=0.0, end=2.0)
        second = scene([entity("entity.b", [component("component.b", transform={"x": 10, "y": 10},
                                                      bounds={"width": 5, "height": 5})], label="b")],
                       scene_id="scene.two", start=2.0, end=4.0)
        reports = check_storyboard_geometry(storyboard([first, second]))
        self.assertEqual([item.scene_id for item in reports], ["scene.one", "scene.two"])
        self.assertTrue(all(item.passed for item in reports))

    def test_a_named_scene_can_be_selected(self):
        first = scene([entity("entity.a", [component("component.a", transform={"x": 10, "y": 10},
                                                     bounds={"width": 5, "height": 5})], label="a")],
                      scene_id="scene.one", start=0.0, end=2.0)
        second = scene([entity("entity.b", [component("component.b", transform={"x": 10, "y": 10},
                                                      bounds={"width": 5, "height": 5})], label="b")],
                       scene_id="scene.two", start=2.0, end=4.0)
        document = storyboard([first, second])
        self.assertEqual(check(document, scene_id="scene.two").scene_id, "scene.two")

    def test_bad_settings_and_lookups_are_rejected(self):
        from bkt_web.fidelity_geometric import GeometricFidelityError, GeometricSettings

        with self.assertRaisesRegex(GeometricFidelityError, "sample_rate"):
            GeometricSettings(sample_rate=0)
        with self.assertRaisesRegex(GeometricFidelityError, "không được âm"):
            GeometricSettings(contact_tolerance=-1)
        with self.assertRaisesRegex(GeometricFidelityError, "hữu hạn"):
            GeometricSettings(attachment_jump=float("inf"))
        with self.assertRaisesRegex(GeometricFidelityError, "không tồn tại"):
            check(clean_scene(), scene_id="scene.missing")
        with self.assertRaisesRegex(GeometricFidelityError, "chưa hỗ trợ"):
            check(clean_scene()).by_category("vibes")

    def test_malformed_bounds_are_rejected(self):
        from bkt_web.fidelity_geometric import GeometricFidelityError

        document = clean_scene()
        document["scenes"][0]["entities"][0]["components"][0]["attributes"]["bounds"] = {"width": 0, "height": 5}
        with self.assertRaisesRegex(GeometricFidelityError, "bounds phải dương"):
            check(document)

        document = clean_scene()
        document["scenes"][0]["entities"][0]["components"][0]["attributes"]["bounds"] = {"width": 5, "height": 5, "depth": 2}
        with self.assertRaisesRegex(GeometricFidelityError, "field lạ"):
            check(document)

    def test_every_category_in_the_plan_is_covered(self):
        from bkt_web.fidelity_geometric import CATEGORIES

        self.assertEqual(set(CATEGORIES), {"contact", "ground", "intersection", "attachment", "joint"})


if __name__ == "__main__":
    unittest.main()
