import copy
import json
import unittest


REQUIRED_MATERIALS = ("water", "soil", "seed", "fertilizer", "sap", "smoke", "dust")


def emitter(material="water", **overrides):
    from bkt_web.material_runtime import EmitterSpec, MaterialEmitter

    spec = {
        "emitter_id": "emitter_test",
        "material": material,
        "start": 1.0,
        "end": 3.0,
        "seed": 12345,
        "ground_y": 600.0,
    }
    origin = overrides.pop("origin", {"x": 200.0, "y": 100.0})
    spec.update(overrides)
    return MaterialEmitter(EmitterSpec(**spec), origin)


class MaterialCatalogTest(unittest.TestCase):
    def test_catalog_covers_every_material_the_plan_lists(self):
        from bkt_web.material_runtime import SUPPORTED_MATERIALS, material_catalog

        catalog = material_catalog()
        for material_id in REQUIRED_MATERIALS:
            self.assertIn(material_id, catalog["materials"])
            self.assertIn(material_id, SUPPORTED_MATERIALS)

    def test_catalog_copy_cannot_corrupt_the_cached_document(self):
        from bkt_web.material_runtime import material_catalog

        mutated = material_catalog()
        mutated["materials"].clear()
        self.assertEqual(len(material_catalog()["materials"]), len(REQUIRED_MATERIALS))

    def test_invalid_catalog_documents_are_rejected(self):
        from bkt_web.material_runtime import MaterialError, material_catalog, validate_material_catalog

        wrong_schema = material_catalog()
        wrong_schema["schema"] = "other/v1"
        with self.assertRaisesRegex(MaterialError, "schema"):
            validate_material_catalog(wrong_schema)

        bad_phase = material_catalog()
        bad_phase["materials"]["water"]["phase"] = "plasma"
        with self.assertRaisesRegex(MaterialError, "phase"):
            validate_material_catalog(bad_phase)

        bad_number = material_catalog()
        bad_number["materials"]["water"]["lifetime_seconds"] = -1
        with self.assertRaisesRegex(MaterialError, "lifetime_seconds"):
            validate_material_catalog(bad_number)

        non_finite = material_catalog()
        non_finite["materials"]["water"]["gravity"] = float("inf")
        with self.assertRaisesRegex(MaterialError, "hữu hạn"):
            validate_material_catalog(non_finite)

        gas_with_volume = material_catalog()
        gas_with_volume["materials"]["smoke"]["volume_per_particle"] = 0.5
        with self.assertRaisesRegex(MaterialError, "lắng đọng"):
            validate_material_catalog(gas_with_volume)

    def test_unknown_material_is_rejected(self):
        from bkt_web.material_runtime import MaterialError, material

        with self.assertRaisesRegex(MaterialError, "chưa có trong catalog"):
            material("lava")


class EmitterSeedTest(unittest.TestCase):
    def test_seed_is_derived_from_project_entity_and_action(self):
        from bkt_web.material_runtime import emitter_seed

        base = emitter_seed("project_a", "bucket_01", "action_pour", "water")
        self.assertEqual(base, emitter_seed("project_a", "bucket_01", "action_pour", "water"))
        self.assertNotEqual(base, emitter_seed("project_b", "bucket_01", "action_pour", "water"))
        self.assertNotEqual(base, emitter_seed("project_a", "bucket_02", "action_pour", "water"))
        self.assertNotEqual(base, emitter_seed("project_a", "bucket_01", "action_spill", "water"))
        self.assertNotEqual(base, emitter_seed("project_a", "bucket_01", "action_pour", "sap"))
        self.assertTrue(0 <= base < 2 ** 32)

    def test_two_emitters_with_different_seeds_do_not_share_a_stream(self):
        left = emitter(seed=1).sample(2.0)
        right = emitter(seed=2).sample(2.0)
        self.assertEqual(len(left.particles), len(right.particles))
        self.assertNotEqual(
            [(item.x, item.y) for item in left.particles],
            [(item.x, item.y) for item in right.particles],
        )

    def test_unit_random_is_stable_and_in_range(self):
        from bkt_web.material_runtime import unit_random

        values = [unit_random(99, index, channel) for index in range(50) for channel in range(3)]
        self.assertTrue(all(0.0 <= value < 1.0 for value in values))
        self.assertEqual(values, [unit_random(99, index, channel) for index in range(50) for channel in range(3)])
        self.assertGreater(len(set(values)), 100)


class SeekDeterminismTest(unittest.TestCase):
    def test_a_frame_never_depends_on_the_frames_before_it(self):
        forward = emitter()
        backward = emitter()
        times = [1.0 + index / 20 for index in range(41)]
        ahead = [forward.sample(t).as_dict() for t in times]
        behind = [backward.sample(t).as_dict() for t in reversed(times)]
        self.assertEqual(ahead, list(reversed(behind)))

    def test_one_random_frame_matches_the_same_frame_in_a_sequence(self):
        played = emitter()
        for t in [1.0 + index / 10 for index in range(21)]:
            played.sample(t)
        late = played.sample(2.7).as_dict()
        self.assertEqual(late, emitter().sample(2.7).as_dict())

    def test_particle_state_is_a_closed_form_of_its_own_spawn_time(self):
        source = emitter(material="seed")
        particle = source.particle_at(3, 2.5)
        self.assertIsNotNone(particle)
        self.assertEqual(particle.as_dict(), source.particle_at(3, 2.5).as_dict())
        self.assertAlmostEqual(particle.age, 2.5 - source.spawn_time(3))

    def test_particles_spawn_at_the_catalog_rate_and_stop_at_the_end(self):
        source = emitter(material="seed")  # 8 particles per second, 2 seconds
        self.assertEqual(source.sample(0.5).spawned, 0)
        self.assertEqual(source.sample(1.0).spawned, 1)
        self.assertEqual(source.sample(2.0).spawned, 9)
        self.assertEqual(source.sample(3.0).spawned, 17)
        self.assertEqual(source.sample(9.0).spawned, 17)

    def test_particles_expire_after_their_lifetime(self):
        source = emitter(material="dust", end=1.0)  # lifetime 1.6s, no settling
        self.assertEqual(len(source.sample(1.0).particles), 1)
        self.assertEqual(source.sample(5.0).particles, ())

    def test_a_moving_emitter_samples_its_origin_at_spawn_time(self):
        from bkt_web.material_runtime import EmitterSpec, MaterialEmitter

        spec = EmitterSpec(emitter_id="emitter_moving", material="sap", start=0.0, end=2.0, seed=7)
        moving = MaterialEmitter(spec, lambda seconds: {"x": 100 * seconds, "y": 0})
        first = moving.particle_at(0, 1.0)
        later = moving.particle_at(3, 1.0)
        self.assertLess(first.x, later.x)
        self.assertEqual(moving.particle_at(3, 1.0).as_dict(), later.as_dict())


class PhysicsTest(unittest.TestCase):
    def test_a_drag_free_particle_follows_the_ballistic_closed_form(self):
        from bkt_web.material_runtime import EmitterSpec, MaterialEmitter, material

        physics = material("seed")
        physics["drag"] = 0.0
        physics["cone_degrees"] = 0.0
        physics["speed_variance"] = 0.0
        spec = EmitterSpec(
            emitter_id="emitter_ballistic", material="seed", start=0.0, end=0.0, seed=3,
            direction_degrees=0.0, physics=physics,
        )
        source = MaterialEmitter(spec, {"x": 0.0, "y": 0.0})
        particle = source.particle_at(0, 1.0)
        self.assertAlmostEqual(particle.x, physics["initial_speed"] * 1.0)
        self.assertAlmostEqual(particle.y, 0.5 * physics["gravity"] * 1.0)

    def test_settling_material_stops_at_the_ground_and_stays_there(self):
        source = emitter(material="soil", ground_y=400.0)
        landed = source.sample(2.9)
        settled = [item for item in landed.particles if item.settled]
        self.assertTrue(settled)
        for item in settled:
            self.assertAlmostEqual(item.y, 400.0)
            self.assertEqual((item.vx, item.vy), (0.0, 0.0))

    def test_gas_rises_and_never_settles(self):
        # Smoke is authored pointing up; screen space has +y downwards.
        source = emitter(material="smoke", origin={"x": 0.0, "y": 500.0}, ground_y=600.0, direction_degrees=-90.0)
        sample = source.sample(2.0)
        self.assertTrue(sample.particles)
        self.assertEqual(sample.settled, 0)
        oldest = max(sample.particles, key=lambda item: item.age)
        self.assertLess(oldest.y, 500.0)

    def test_landing_points_are_stable_and_ahead_of_the_spawn(self):
        source = emitter(material="water")
        landing = source.landing_point(5)
        self.assertEqual(landing, source.landing_point(5))
        self.assertAlmostEqual(landing["y"], 600.0)
        self.assertGreater(landing["time"], source.spawn_time(5))

    def test_non_settling_material_has_no_landing_point(self):
        self.assertIsNone(emitter(material="dust").landing_point(0))


class ContainerFillTest(unittest.TestCase):
    def container(self, **overrides):
        from bkt_web.material_runtime import Container

        values = {
            "container_id": "bucket_01",
            "min_x": 100.0,
            "min_y": 590.0,
            "max_x": 300.0,
            "max_y": 650.0,
            "capacity": 1.0,
        }
        values.update(overrides)
        return Container(**values)

    def test_fill_level_grows_with_time_and_is_reported_with_capacity(self):
        source = emitter(material="water")
        early = source.fill_report(self.container(), 1.2)
        late = source.fill_report(self.container(), 3.0)
        self.assertGreater(late.captured, early.captured)
        self.assertGreater(late.volume, early.volume)
        self.assertEqual(late.capacity, 1.0)
        self.assertAlmostEqual(late.level, min(1.0, late.volume / 1.0))
        self.assertEqual(late.as_dict()["container_id"], "bucket_01")

    def test_spill_is_reported_instead_of_an_overflowing_container(self):
        source = emitter(material="water")
        tiny = source.fill_report(self.container(capacity=0.05), 3.0)
        self.assertTrue(tiny.overflowed)
        self.assertEqual(tiny.level, 1.0)
        self.assertAlmostEqual(tiny.spilled_volume, tiny.volume - 0.05)

        roomy = source.fill_report(self.container(capacity=100.0), 3.0)
        self.assertFalse(roomy.overflowed)
        self.assertEqual(roomy.spilled_volume, 0.0)
        self.assertLess(roomy.level, 1.0)

    def test_material_landing_outside_the_bounds_is_not_counted(self):
        source = emitter(material="water")
        inside = source.fill_report(self.container(), 3.0)
        aside = source.fill_report(self.container(min_x=1000.0, max_x=1200.0), 3.0)
        self.assertGreater(inside.captured, 0)
        self.assertEqual(aside.captured, 0)
        self.assertEqual(aside.level, 0.0)

    def test_fill_report_is_seek_independent(self):
        source = emitter(material="water")
        box = self.container()
        forward = [source.fill_report(box, 1 + index / 10).as_dict() for index in range(21)]
        backward = [source.fill_report(box, 1 + index / 10).as_dict() for index in range(20, -1, -1)]
        self.assertEqual(forward, list(reversed(backward)))

    def test_invalid_containers_and_unsupported_materials_are_rejected(self):
        from bkt_web.material_runtime import Container, MaterialError

        with self.assertRaisesRegex(MaterialError, "capacity"):
            Container(container_id="bad", min_x=0, min_y=0, max_x=1, max_y=1, capacity=0)
        with self.assertRaisesRegex(MaterialError, "bounds"):
            Container(container_id="bad", min_x=5, min_y=0, max_x=1, max_y=1, capacity=1)
        with self.assertRaisesRegex(MaterialError, "field lạ"):
            Container.from_value({"container_id": "bad", "min_x": 0, "min_y": 0, "max_x": 1, "max_y": 1, "capacity": 1, "colour": "red"})
        with self.assertRaisesRegex(MaterialError, "lắng đọng"):
            emitter(material="smoke").fill_report(self.container(), 2.0)
        with self.assertRaisesRegex(MaterialError, "ground_y phải nằm trong bounds"):
            emitter(material="water").fill_report(self.container(min_y=10.0, max_y=20.0), 2.0)


class EmitterValidationTest(unittest.TestCase):
    def test_bad_emitter_specs_are_rejected(self):
        from bkt_web.material_runtime import MaterialError

        with self.assertRaisesRegex(MaterialError, "end không được nhỏ hơn start"):
            emitter(start=3.0, end=1.0)
        with self.assertRaisesRegex(MaterialError, "start không được âm"):
            emitter(start=-1.0, end=1.0)
        with self.assertRaisesRegex(MaterialError, "seed"):
            emitter(seed=-5)
        with self.assertRaisesRegex(MaterialError, "rate_scale"):
            emitter(rate_scale=0)
        with self.assertRaisesRegex(MaterialError, "hữu hạn"):
            emitter(ground_y=float("nan"))
        with self.assertRaisesRegex(MaterialError, "field lạ"):
            from bkt_web.material_runtime import MaterialEmitter

            MaterialEmitter({"emitter_id": "x", "material": "water", "start": 0, "end": 1, "seed": 1, "colour": "blue"}, {"x": 0, "y": 0})

    def test_particle_budget_is_enforced_before_any_sampling(self):
        from bkt_web.material_runtime import MaterialError

        with self.assertRaisesRegex(MaterialError, "vượt giới hạn"):
            emitter(material="water", start=0.0, end=10_000.0)

    def test_negative_timestamp_is_rejected(self):
        from bkt_web.material_runtime import MaterialError

        with self.assertRaisesRegex(MaterialError, "seconds không được âm"):
            emitter().sample(-1)

    def test_sampling_several_emitters_requires_unique_ids(self):
        from bkt_web.material_runtime import MaterialError, sample_emitters

        first, second = emitter(), emitter(emitter_id="emitter_other", material="soil")
        snapshot = sample_emitters([second, first], 2.0)
        self.assertEqual(list(snapshot), ["emitter_other", "emitter_test"])
        self.assertEqual(json.loads(json.dumps(snapshot)), snapshot)
        with self.assertRaisesRegex(MaterialError, "trùng"):
            sample_emitters([first, emitter()], 2.0)


class GrammarIntegrationTest(unittest.TestCase):
    """UV-203 emissions must drive UV-204 emitters without a second seed rule."""

    def plan(self):
        import test_interaction_grammar as grammar_tests
        from bkt_web.interaction_grammar import composite_library

        composite = composite_library()["composites"]["water_plant"]
        action = grammar_tests.composite_action(
            "action_water", "water_plant", grammar_tests.roles_for(composite), 1, 5,
            **grammar_tests.COMPOSITE_PARAMS,
        )
        return grammar_tests.compile_story(grammar_tests.story_with_actions([action]))

    def test_an_emission_builds_an_emitter_with_the_same_seed(self):
        from bkt_web.material_runtime import emitter_from_emission, emitter_seed

        emission = self.plan().emissions[0]
        self.assertEqual(emission.seed, emitter_seed("project_agriculture_demo", emission.source_ref, emission.action_id, emission.material))
        source = emitter_from_emission(emission, {"x": 320.0, "y": 180.0}, ground_y=620.0)
        self.assertEqual(source.spec.seed, emission.seed)
        self.assertEqual(source.spec.material, "water")
        self.assertEqual((source.spec.start, source.spec.end), (emission.start, emission.end))
        self.assertTrue(source.sample(emission.end).particles)

    def test_emitter_origin_can_track_the_component_tree(self):
        from bkt_web.constraint_solver import sample_reference
        from bkt_web.material_runtime import emitter_from_emission

        plan = self.plan()
        emission = plan.emissions[0]

        def origin(seconds):
            point = sample_reference(plan.runtime, emission.source_ref, seconds)
            return {"x": point["x"], "y": point["y"]}

        source = emitter_from_emission(emission, origin, ground_y=620.0)
        self.assertEqual(source.sample(4.0).as_dict(), source.sample(4.0).as_dict())
        self.assertTrue(source.sample(4.0).particles)

    def test_compiling_does_not_mutate_the_emission(self):
        from bkt_web.material_runtime import emitter_from_emission

        emission = self.plan().emissions[0]
        before = copy.deepcopy(emission.as_dict())
        emitter_from_emission(emission, {"x": 0.0, "y": 0.0}, ground_y=620.0).sample(3.0)
        self.assertEqual(emission.as_dict(), before)


if __name__ == "__main__":
    unittest.main()
