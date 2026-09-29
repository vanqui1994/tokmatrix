import copy
import unittest
from unittest.mock import patch


class CapabilityRegistryTest(unittest.TestCase):
    @staticmethod
    def _registry_with_renderer(renderer_id, *, source_id="native-vector-v1"):
        """Return an isolated registry with one additional renderer.

        Entity IDs deliberately use the current native catalog vocabulary. The
        canonical v2 entity vocabulary is owned by UV-100 and is not fixed here.
        """
        from bkt_web.capability_registry import native_registry_document

        document = native_registry_document()
        renderer = copy.deepcopy(document["renderers"][source_id])
        renderer["id"] = renderer_id
        document["renderers"][renderer_id] = renderer
        return document

    def test_native_registry_is_valid_and_isolated(self):
        from bkt_web.capability_registry import inspect_registry, validate_registry

        first = inspect_registry()
        validate_registry(first)
        self.assertIn("native-vector-v1", first["renderers"])
        self.assertIn("carry", first["renderers"]["native-vector-v1"]["supports"]["actions"])
        first["renderers"].clear()
        self.assertIn("native-vector-v1", inspect_registry()["renderers"])

    def test_hard_requirement_rejects_and_explains(self):
        from bkt_web.capability_registry import match_renderer

        result = match_renderer("native-vector-v1", {"required": [{"kind": "action", "id": "cloth_simulation"}]})
        self.assertFalse(result["eligible"])
        self.assertEqual(result["score"], 0)
        self.assertEqual(result["missing_required"][0]["id"], "cloth_simulation")
        self.assertIn("cloth_simulation", result["explanation"])

    def test_asset_anchor_and_fidelity_matching(self):
        from bkt_web.capability_registry import match_renderer

        requirements = {
            "required": [
                {"kind": "feature", "id": "deterministic_seek"},
                {"kind": "action", "id": "carry"},
                {"kind": "anchor", "entity": "fruit_1", "id": "grip_l"},
            ],
            "preferred": [{"kind": "fidelity", "id": "character_motion", "minimum": 0.8}],
        }
        before = copy.deepcopy(requirements)
        result = match_renderer("native-vector-v1", requirements, {"entities": {"fruit_1": {"asset": "watermelon"}}})
        self.assertTrue(result["eligible"])
        self.assertEqual(result["missing_required"], [])
        self.assertEqual(result["missing_preferred"][0]["id"], "character_motion")
        self.assertEqual(requirements, before)

    def test_invalid_registry_and_requirement_are_rejected(self):
        from bkt_web.capability_registry import inspect_registry, match_renderer, validate_registry

        document = inspect_registry()
        document["assets"]["watermelon"]["renderer"] = "missing"
        with self.assertRaises(ValueError):
            validate_registry(document)
        with self.assertRaises(ValueError):
            match_renderer("native-vector-v1", {"required": [{"kind": "invented", "id": "x"}]})

    def test_rank_is_deterministic(self):
        from bkt_web.capability_registry import rank_renderers

        requirements = {"required": [{"kind": "feature", "id": "offline_render"}]}
        self.assertEqual(rank_renderers(requirements), rank_renderers(requirements))

    def test_minimum_version_is_checked_on_each_capability_entry(self):
        from bkt_web.capability_registry import inspect_registry, match_renderer

        cases = (
            ("action", "carry", "actions"),
            ("asset", "watermelon", "assets"),
            ("effect", "rain", "effects"),
            ("material", "paper", "materials"),
        )
        for kind, capability_id, section in cases:
            with self.subTest(kind=kind):
                document = inspect_registry()
                renderer = document["renderers"]["native-vector-v1"]
                renderer["version"] = "9.0.0"
                if kind == "material":
                    document[section][capability_id] = {"id": capability_id, "version": "1.0.0"}
                    renderer["supports"]["materials"] = [capability_id]
                else:
                    document[section][capability_id]["version"] = "1.0.0"
                result = match_renderer(
                    "native-vector-v1",
                    {"required": [{"kind": kind, "id": capability_id, "minimum_version": "1.1.0"}]},
                    registry=document,
                )
                self.assertFalse(result["eligible"])
                self.assertEqual(result["missing_required"][0]["reason"], "version_too_low")

    def test_version_range_is_enforced(self):
        from bkt_web.capability_registry import inspect_registry, match_renderer

        document = inspect_registry()
        document["actions"]["carry"]["version"] = "1.2.0"
        result = match_renderer(
            "native-vector-v1",
            {"required": [{"kind": "action", "id": "carry", "version_range": ">=2.0.0,<3.0.0"}]},
            registry=document,
        )
        self.assertFalse(result["eligible"])
        self.assertEqual(result["missing_required"][0]["reason"], "version_out_of_range")

    def test_invalid_version_range_is_rejected(self):
        from bkt_web.capability_registry import inspect_registry, match_renderer

        document = inspect_registry()
        with self.assertRaises(ValueError):
            match_renderer(
                "native-vector-v1",
                {"required": [{"kind": "action", "id": "carry", "version_range": "not-a-range"}]},
                registry=document,
            )

    def test_semver_prerelease_precedes_release(self):
        from bkt_web.capability_registry import inspect_registry, match_renderer

        document = inspect_registry()
        document["actions"]["carry"]["version"] = "1.2.0-alpha.1"
        result = match_renderer(
            "native-vector-v1",
            {"required": [{"kind": "action", "id": "carry", "minimum_version": "1.2.0"}]},
            registry=document,
        )
        self.assertFalse(result["eligible"])
        self.assertEqual(result["missing_required"][0]["reason"], "version_too_low")

    def test_semver_build_metadata_is_valid(self):
        from bkt_web.capability_registry import inspect_registry, validate_registry

        document = inspect_registry()
        document["actions"]["carry"]["version"] = "1.2.0+catalog.7"
        validate_registry(document)

    def test_action_requires_compatible_actor_and_target_assets(self):
        from bkt_web.capability_registry import match_renderer

        requirements = {
            "required": [
                {
                    "kind": "action",
                    "id": "carry",
                    "actor": "farmer_1",
                    "target": "pepper_1",
                }
            ]
        }
        context = {
            "entities": {
                "farmer_1": {"asset": "farmer"},
                "pepper_1": {"asset": "pepper"},
            }
        }
        result = match_renderer("native-vector-v1", requirements, context)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["missing_required"][0]["reason"], "asset_action_unsupported")

        compatible = copy.deepcopy(requirements)
        compatible["required"][0]["target"] = "watermelon_1"
        context["entities"]["watermelon_1"] = {"asset": "watermelon"}
        self.assertTrue(match_renderer("native-vector-v1", compatible, context)["eligible"])

    def test_unknown_fidelity_never_satisfies_a_required_capability(self):
        from bkt_web.capability_registry import match_renderer

        result = match_renderer(
            "native-vector-v1",
            {"required": [{"kind": "fidelity", "id": "does_not_exist"}]},
        )
        self.assertFalse(result["eligible"])
        self.assertEqual(result["missing_required"][0]["reason"], "unknown_capability")

    def test_registry_rejects_dangling_capability_references(self):
        from bkt_web.capability_registry import inspect_registry, validate_registry

        mutations = (
            lambda document: document["renderers"]["native-vector-v1"]["supports"]["actions"].append("ghost_action"),
            lambda document: document["renderers"]["native-vector-v1"]["supports"]["effects"].append("ghost_effect"),
            lambda document: document["assets"]["watermelon"]["actions"].append("ghost_action"),
        )
        for mutate in mutations:
            with self.subTest(mutation=mutate.__code__.co_firstlineno):
                document = inspect_registry()
                mutate(document)
                with self.assertRaises(ValueError):
                    validate_registry(document)

    def test_registry_enforces_bidirectional_asset_action_invariant(self):
        from bkt_web.capability_registry import inspect_registry, validate_registry

        # An action role and the corresponding asset.actions declaration are
        # two views of one capability relation and must never disagree.
        document = inspect_registry()
        document["actions"]["carry"]["targets"].append("pepper")
        with self.assertRaises(ValueError):
            validate_registry(document)

        document = inspect_registry()
        document["assets"]["watermelon"]["actions"].remove("carry")
        with self.assertRaises(ValueError):
            validate_registry(document)

    def test_matcher_checks_asset_action_intersection_defensively(self):
        from bkt_web.capability_registry import inspect_registry, match_renderer

        document = inspect_registry()
        document["actions"]["carry"]["targets"].append("pepper")
        requirements = {
            "required": [
                {"kind": "action", "id": "carry", "actor": "farmer_1", "target": "pepper_1"}
            ]
        }
        context = {
            "entities": {
                "farmer_1": {"asset": "farmer"},
                "pepper_1": {"asset": "pepper"},
            }
        }
        # Bypass registry validation only to prove the matcher itself does not
        # trust one side of the relation. Normal callers still validate first.
        with patch("bkt_web.capability_registry.validate_registry"):
            result = match_renderer("native-vector-v1", requirements, context, registry=document)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["missing_required"][0]["reason"], "asset_action_unsupported")

    def test_multiple_same_actions_use_actor_and_target_in_identity(self):
        from bkt_web.capability_registry import match_renderer

        requirements = {
            "required": [
                {"kind": "action", "id": "carry", "actor": "farmer_1", "target": "melon_1"},
                {"kind": "action", "id": "carry", "actor": "farmer_2", "target": "melon_2"},
            ]
        }
        context = {
            "entities": {
                "farmer_1": {"asset": "farmer"},
                "farmer_2": {"asset": "farmer"},
                "melon_1": {"asset": "watermelon"},
                "melon_2": {"asset": "watermelon"},
            }
        }
        result = match_renderer("native-vector-v1", requirements, context)
        self.assertTrue(result["eligible"])
        self.assertEqual(len(result["matched"]), 2)

    def test_exact_action_duplicate_across_tiers_is_rejected(self):
        from bkt_web.capability_registry import match_renderer

        action = {"kind": "action", "id": "carry", "actor": "farmer_1", "target": "melon_1"}
        with self.assertRaises(ValueError):
            match_renderer(
                "native-vector-v1",
                {"required": [copy.deepcopy(action)], "preferred": [copy.deepcopy(action)]},
            )

    def test_native_asset_states_are_conservative_and_match_engine_effects(self):
        from bkt_web.capability_registry import native_registry_document

        document = native_registry_document()
        branches_7 = {f"branch_{index}" for index in range(1, 8)}
        branches_10 = {f"branch_{index}" for index in range(1, 11)}
        expected = {
            "watermelon": {"cut", "damage", "slice", "wet"},
            "apple": {"cut", "damage", "growth", "slice", "wet"},
            "tomato": {"cut", "damage", "growth", "slice", "wet"},
            "pepper": {"cut", "damage", "wet"},
            "tomato_plant": {"bend", "growth", "nutrients", "roots", "wet"} | branches_7,
            "peanut_plant": {"bend", "growth", "nutrients", "roots", "wet"} | branches_10,
            "papaya_tree": {"cut", "growth", "roots", "wet"},
            "insect": {"wet"},
            "hand": {"hand_pose", "index", "middle", "pinky", "ring", "thumb", "wrist", "wet"},
            "foot": {"wet"},
            "farmer": {"arm", "hand_l_x", "hand_l_y", "hand_r_x", "hand_r_y", "wrist_l", "wrist_r", "wet"},
            "knife": {"wet"},
            "sprayer": {"wet"},
            "pot": {"cutaway", "nutrients", "wet"},
            "bucket": {"fill", "wet"},
            "bag": {"wet"},
            "seed": {"wet"},
            "face": {"expression", "look_x", "look_y", "wet"},
            # Fishing set: the states below are the ones remake_vector_engine.js
            # actually reads for these assets, nothing more.
            "fisherman": {"arm", "hand_l_x", "hand_l_y", "hand_r_x", "hand_r_y", "wrist_l", "wrist_r", "wet"},
            "fishing_rod": {"wet"},
            "boat": {"wet"},
            "hook": {"wet"},
            "bobber": {"swim", "wet"},
            "fish": {"hooked", "mouth", "wet"},
            "big_fish": {"hooked", "mouth", "wet"},
            "sea_monster_s": {"jaw", "rage", "rise", "tentacle", "wet"},
            "sea_monster_ss": {"jaw", "rage", "rise", "tentacle", "wet"},
            "sea_monster_leviathan": {"jaw", "rage", "rise", "tentacle", "wet"},
            "sea_monster_drake": {"jaw", "rage", "rise", "tentacle", "wet"},
            "sea_monster_behemoth": {"jaw", "rage", "rise", "tentacle", "wet"},
            "sea_monster_crystal_whale": {"jaw", "rage", "rise", "tentacle", "wet"},
            "sea_monster_magma": {"jaw", "rage", "rise", "tentacle", "wet"},
            "sea_monster_megalodon": {"jaw", "rage", "rise", "tentacle", "wet"},
            # Farm set: hand_right mirrors hand, farmer_woman shares farmerSkeleton.
            "hand_right": {"hand_pose", "index", "middle", "pinky", "ring", "thumb", "wrist", "wet"},
            "farmer_woman": {"arm", "hand_l_x", "hand_l_y", "hand_r_x", "hand_r_y", "wrist_l", "wrist_r", "wet"},
            "scarecrow": {"wet"}, "buffalo": {"wet"}, "chicken": {"wet"}, "earthworm": {"wet"}, "snail": {"wet"}, "bee": {"wet"},
            "rice_plant": {"bend", "cut", "growth", "nutrients", "roots", "wet"},
            "corn_plant": {"bend", "cut", "growth", "nutrients", "roots", "wet"},
            "sunflower": {"cut", "growth", "nutrients", "roots", "wet"},
            "banana_tree": {"cut", "growth", "roots", "wet"},
            "cabbage": {"cut", "growth", "nutrients", "roots", "wet"},
            "carrot": {"growth", "nutrients", "roots", "wet"},
            "pumpkin": {"cut", "damage", "growth", "slice", "wet"},
            "eggplant": {"cut", "damage", "growth", "slice", "wet"},
            "corn": {"cut", "damage", "growth", "slice", "wet"},
            "hoe": {"wet"}, "sickle": {"wet"}, "watering_can": {"wet"},
            "basket": {"fill", "wet"},
            "grass_tuft": {"cut", "growth", "nutrients", "roots", "wet"},
            "cow": {"wet"}, "pig": {"wet"}, "goat": {"wet"}, "sheep": {"wet"},
            "horse": {"wet"}, "dog": {"wet"}, "cat": {"wet"}, "rabbit": {"wet"}, "mouse": {"wet"},
            "duck": {"wet"}, "chick": {"wet"}, "rooster": {"wet"}, "sparrow": {"wet"},
            "butterfly": {"wet"}, "dragonfly": {"wet"}, "ladybug": {"wet"}, "ant": {"wet"}, "caterpillar": {"wet"}, "frog": {"wet"},
            "mango": {"cut", "damage", "growth", "slice", "wet"},
            "orange": {"cut", "damage", "growth", "slice", "wet"},
            "lime": {"cut", "damage", "growth", "slice", "wet"},
            "guava": {"cut", "damage", "growth", "slice", "wet"},
            "lychee": {"cut", "damage", "growth", "slice", "wet"},
            "rambutan": {"cut", "damage", "growth", "slice", "wet"},
            "mangosteen": {"cut", "damage", "growth", "slice", "wet"},
            "durian": {"cut", "damage", "growth", "slice", "wet"},
            "coconut": {"cut", "damage", "growth", "slice", "wet"},
            "avocado": {"cut", "damage", "growth", "slice", "wet"},
            "strawberry": {"cut", "damage", "growth", "slice", "wet"},
            "pineapple": {"cut", "damage", "growth", "slice", "wet"},
            "grape": {"cut", "damage", "growth", "wet"},
            "dragon_fruit": {"cut", "damage", "growth", "slice", "wet"},
            "starfruit": {"cut", "damage", "growth", "slice", "wet"},
            "jackfruit": {"cut", "damage", "growth", "slice", "wet"},
            "banana_fruit": {"cut", "damage", "growth", "slice", "wet"},
            "rose": {"cut", "growth", "nutrients", "roots", "wet"},
            "lotus": {"cut", "growth", "nutrients", "roots", "wet"},
            "tulip": {"cut", "growth", "nutrients", "roots", "wet"},
            "daisy": {"cut", "growth", "nutrients", "roots", "wet"},
            "marigold": {"cut", "growth", "nutrients", "roots", "wet"},
            "hibiscus": {"cut", "growth", "nutrients", "roots", "wet"},
            "orchid": {"cut", "growth", "nutrients", "roots", "wet"},
            "peach_blossom": {"cut", "growth", "nutrients", "roots", "wet"},
            "apricot_blossom": {"cut", "growth", "nutrients", "roots", "wet"},
            "lily": {"cut", "growth", "nutrients", "roots", "wet"},
            "shovel": {"wet"},
            "rake": {"wet"},
            "axe": {"wet"},
            "pruning_shears": {"wet"},
            "soil_bed": {"cut", "wet"},
            "wheelbarrow": {"fill", "wet"},
            "crate": {"fill", "wet"},
            "sack": {"wet"},
            "hay_bale": {"wet"},
            "egg": {"damage", "wet"},
            "nest": {"fill", "wet"},
            "beehive": {"wet"},
            "lantern": {"wet"},
            "bowl": {"fill", "wet"},
            "fence": {"wet"},
            "mango_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "orange_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "lime_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "apple_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "coconut_palm": {"fruits", "growth", "nutrients", "roots", "wet"},
            "durian_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "jackfruit_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "lychee_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "rambutan_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "guava_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "avocado_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "dragon_fruit_cactus": {"fruits", "growth", "nutrients", "roots", "wet"},
            "pineapple_plant": {"fruits", "growth", "nutrients", "roots", "wet"},
            "strawberry_plant": {"fruits", "growth", "nutrients", "roots", "wet"},
            "mangosteen_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "starfruit_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            # Phase C Trellis Props
            "trellis_a": {"wet"}, "trellis_net": {"wet"}, "pergola": {"wet"},
            # Phase C Trellis Fruits
            "cucumber": {"cut", "damage", "growth", "slice", "wet"},
            "bitter_melon": {"cut", "damage", "growth", "slice", "wet"},
            "luffa": {"cut", "damage", "growth", "slice", "wet"},
            "bottle_gourd": {"cut", "damage", "growth", "slice", "wet"},
            "winter_melon": {"cut", "damage", "growth", "slice", "wet"},
            "passion_fruit": {"cut", "damage", "growth", "slice", "wet"},
            "chayote": {"cut", "damage", "growth", "slice", "wet"},
            "long_bean": {"cut", "damage", "growth", "slice", "wet"},
            "kiwi": {"cut", "damage", "growth", "slice", "wet"},
            # Phase C Trellis Vines
            "cucumber_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "bitter_melon_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "luffa_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "bottle_gourd_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "winter_melon_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "passion_fruit_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "chayote_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "long_bean_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "grape_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            "kiwi_vine": {"fruits", "growth", "nutrients", "roots", "wet"},
            # Phase D Temperate Fruits
            "pear": {"cut", "damage", "growth", "slice", "wet"},
            "peach": {"cut", "damage", "growth", "slice", "wet"},
            "plum": {"cut", "damage", "growth", "slice", "wet"},
            "cherry": {"cut", "damage", "growth", "slice", "wet"},
            "persimmon": {"cut", "damage", "growth", "slice", "wet"},
            "blueberry": {"cut", "damage", "growth", "slice", "wet"},
            "raspberry": {"cut", "damage", "growth", "slice", "wet"},
            "apricot": {"cut", "damage", "growth", "slice", "wet"},
            "pomegranate": {"cut", "damage", "growth", "slice", "wet"},
            # Phase D Temperate Trees
            "persimmon_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "peach_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "pear_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "cherry_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            # Phase E Harvested Vegetables
            "kohlrabi": {"cut", "damage", "growth", "slice", "wet"},
            "potato": {"cut", "damage", "growth", "slice", "wet"},
            "sweet_potato": {"cut", "damage", "growth", "slice", "wet"},
            "cassava": {"cut", "damage", "growth", "slice", "wet"},
            "taro": {"cut", "damage", "growth", "slice", "wet"},
            "radish": {"cut", "damage", "growth", "slice", "wet"},
            "beet": {"cut", "damage", "growth", "slice", "wet"},
            "onion": {"cut", "damage", "growth", "slice", "wet"},
            "garlic": {"cut", "damage", "growth", "slice", "wet"},
            "ginger": {"cut", "damage", "growth", "slice", "wet"},
            "cauliflower": {"cut", "damage", "growth", "slice", "wet"},
            "broccoli": {"cut", "damage", "growth", "slice", "wet"},
            "okra": {"cut", "damage", "growth", "slice", "wet"},
            "chili": {"cut", "damage", "growth", "slice", "wet"},
            "mushroom": {"cut", "damage", "growth", "slice", "wet"},
            # Phase E Soil Crops
            "kohlrabi_plant": {"growth", "nutrients", "roots", "wet"},
            "potato_plant": {"growth", "nutrients", "roots", "wet"},
            "sweet_potato_plant": {"growth", "nutrients", "roots", "wet"},
            "cassava_plant": {"growth", "nutrients", "roots", "wet"},
            "taro_plant": {"growth", "nutrients", "roots", "wet"},
            "radish_plant": {"growth", "nutrients", "roots", "wet"},
            "beet_plant": {"growth", "nutrients", "roots", "wet"},
            "onion_plant": {"growth", "nutrients", "roots", "wet"},
            "garlic_plant": {"growth", "nutrients", "roots", "wet"},
            "ginger_plant": {"growth", "nutrients", "roots", "wet"},
            "cauliflower_plant": {"growth", "nutrients", "roots", "wet"},
            "broccoli_plant": {"growth", "nutrients", "roots", "wet"},
            "lettuce": {"growth", "nutrients", "roots", "wet"},
            "napa_cabbage": {"growth", "nutrients", "roots", "wet"},
            "water_spinach": {"growth", "nutrients", "roots", "wet"},
            "mustard_greens": {"growth", "nutrients", "roots", "wet"},
            "spring_onion": {"growth", "nutrients", "roots", "wet"},
            "giant_radish": {"growth", "nutrients", "roots", "wet"},
            # Phase F Agrochem Props & Tools
            "fertilizer_sack": {"fill", "wet"},
            "compost_heap": {"wet"},
            "manure_pile": {"flies", "wet"},
            "compost_bin": {"cutaway", "wet"},
            "granules": {"wet"},
            "pesticide_bottle": {"wet"},
            "backpack_sprayer": {"wet"},
            "jerrycan": {"wet"},
            "chem_cabinet": {"open", "wet"},
            "ppe_gloves": {"wet"},
            "ppe_mask": {"wet"},
            "ppe_goggles": {"wet"},
            "ppe_boots": {"wet"},
            "warning_sign": {"wet"},
            "rinse_basin": {"wet"},
            # Wildlife Savanna
            "elephant": {"wet"}, "hippo": {"wet"}, "crocodile": {"wet"}, "gorilla": {"wet"}, "cheetah": {"wet"},
            "hyena": {"wet"}, "giraffe": {"wet"}, "meerkat": {"wet"}, "warthog": {"wet"},
            # Wildlife Forest
            "koala": {"wet"}, "red_panda": {"wet"}, "donkey": {"wet"}, "pug": {"wet"}, "shiba": {"wet"},
            "hedgehog": {"wet"}, "sloth": {"wet"}, "beaver": {"wet"}, "black_goat": {"wet"}, "white_goat": {"wet"},
            "fluffy_sheep": {"wet"}, "squirrel": {"wet"}, "turtle": {"wet"},
            # Ancient Dinosaurs
            "trex": {"wet"}, "triceratops": {"wet"}, "pterodactyl": {"wet"}, "ancient_lizard": {"wet"},
            # Polar Birds & Cartoon Specials
            "eagle": {"wet"}, "penguin": {"wet"}, "wild_rabbit": {"wet"}, "capybara": {"wet"}, "cartoon_tiger": {"wet"},
            "cartoon_monkey": {"wet"}, "armored_bear": {"wet"}, "armored_wolf": {"wet"}, "chibi_cow": {"wet"}, "cartoon_snake": {"wet"}, "vulture": {"wet"},
            # Chibi & Medical
            "chibi_boy": {"wet"}, "chibi_girl": {"wet"}, "chibi_kid": {"wet"}, "chibi_teacher": {"wet"},
            "chibi_doctor": {"wet"}, "chibi_nurse": {"wet"}, "chibi_dentist": {"wet"}, "chibi_pharmacist": {"wet"},
            "chibi_patient": {"wet"}, "chibi_grandma": {"wet"}, "chibi_grandpa": {"wet"}, "chibi_farmer": {"wet"}, "chibi_chef": {"wet"},
            "stethoscope": {"wet"}, "thermometer": {"wet"}, "syringe": {"wet"}, "pill": {"wet"}, "pill_bottle": {"wet"},
            "syrup_bottle": {"wet"}, "spoon": {"wet"}, "band_aid": {"wet"}, "bandage_roll": {"wet"}, "face_mask": {"wet"},
            "soap": {"wet"}, "sanitizer": {"wet"}, "towel": {"wet"}, "toothbrush": {"wet"}, "toothpaste": {"wet"},
            "water_glass": {"wet"}, "first_aid_kit": {"wet"}, "ice_pack": {"wet"}, "hospital_bed": {"wet"},
            "wheelchair": {"wet"}, "crutches": {"wet"}, "scale": {"wet"}, "height_chart": {"wet"}, "lunch_tray": {"wet"},
            "good_bacteria": {"wet"}, "bacteria_rod": {"wet"}, "virus_spike": {"wet"}, "tooth_chibi": {"wet"},
            # Phase I Body World Cells, Microbes & Organs
            "rbc_courier": {"wet"}, "neutrophil_scout": {"wet"}, "macrophage_chef": {"wet"}, "dendritic_messenger": {"wet"},
            "helper_t_captain": {"wet"}, "killer_t_knight": {"wet"}, "b_cell_archer": {"wet"}, "nk_ninja": {"wet"},
            "platelet_builder": {"wet"}, "memory_cell_librarian": {"wet"}, "mast_cell_alarm": {"wet"}, "cilia_sweeper": {"wet"}, "skin_guard": {"wet"},
            "bacteria_chain": {"wet"}, "bacteria_cluster": {"wet"}, "infected_cell": {"wet"}, "fungus_spore": {"wet"},
            "parasite_worm": {"wet"}, "cavity_germ": {"wet"}, "plaque_goo": {"wet"}, "toxin_blob": {"wet"},
            "pollen_puff": {"wet"}, "superbug_boss": {"wet"},
            "heart_chibi": {"wet"}, "lungs_chibi": {"wet"}, "brain_chibi": {"wet"}, "stomach_chibi": {"wet"},
            "intestine_chibi": {"wet"}, "liver_chibi": {"wet"}, "kidney_chibi": {"wet"}, "bladder_chibi": {"wet"},
            "tongue_chibi": {"wet"}, "eye_chibi": {"wet"}, "ear_chibi": {"wet"}, "nose_chibi": {"wet"},
            "skin_patch": {"wet"}, "bone_chibi": {"wet"}, "muscle_chibi": {"wet"}, "blood_drop_chibi": {"wet"},
            "body_xray": {"wet"},
            # Phase J Vehicles
            "bicycle": {"wet"}, "car": {"wet"}, "school_bus": {"wet"}, "city_bus": {"wet"}, "fire_truck": {"wet"},
            "ambulance": {"wet"}, "police_car": {"wet"}, "tractor": {"wet"}, "excavator": {"wet"}, "dump_truck": {"wet"},
            "horse_cart": {"wet"}, "covered_wagon": {"wet"}, "motorcar_1886": {"wet"}, "steam_train": {"wet"},
            "high_speed_train": {"wet"}, "tram": {"wet"}, "sailing_ship": {"wet"}, "longship": {"wet"},
            "turtle_ship": {"wet"}, "biplane_1903": {"wet"}, "hot_air_balloon": {"wet"}, "rocket": {"wet"}, "lunar_lander": {"wet"},
            # Phase J Buildings
            "house": {"wet"}, "castle": {"wet"}, "pyramid": {"wet"}, "temple_classic": {"wet"}, "aqueduct": {"wet"},
            "lighthouse": {"wet"}, "windmill": {"wet"}, "school_building": {"wet"}, "fire_station": {"wet"},
            "shop_front": {"wet"}, "igloo": {"wet"}, "stone_hut": {"wet"}, "moai_generic": {"wet"}, "standing_stones": {"wet"},
            # Phase J Foods
            "bread_loaf": {"wet"}, "pretzel": {"wet"}, "pancake_stack": {"wet"}, "apple_pie": {"wet"},
            "roast_turkey": {"wet"}, "gingerbread": {"wet"}, "easter_egg": {"wet"}, "christmas_cookie": {"wet"},
            "hamburger": {"wet"}, "onigiri": {"wet"}, "bento_box": {"wet"}, "sushi": {"wet"}, "ramen_bowl": {"wet"},
            "mochi": {"wet"}, "dango": {"wet"}, "kimchi": {"wet"}, "songpyeon": {"wet"}, "tteokguk": {"wet"},
            "bibimbap": {"wet"}, "rice_bowl": {"wet"}, "soup_pot": {"wet"},
            # Phase J Containers
            "bin_paper": {"wet"}, "bin_plastic": {"wet"}, "bin_glass": {"wet"}, "bin_bio": {"wet"}, "bin_residual": {"wet"},
            "onggi_jar": {"wet"}, "barrel": {"wet"}, "treasure_chest": {"wet"}, "amphora": {"wet"}, "lunchbox": {"wet"},
            "emergency_backpack": {"wet"},
            # Phase J Furniture
            "desk": {"wet"}, "chair": {"wet"}, "table": {"wet"}, "low_table": {"wet"}, "kotatsu": {"wet"},
            "bed": {"wet"}, "shelf": {"wet"}, "bookcase": {"wet"}, "workbench": {"wet"},
            # Phase J Extended Tools & Props
            "hammer": {"wet"}, "saw": {"wet"}, "chisel": {"wet"}, "trowel": {"wet"}, "pickaxe": {"wet"}, "rope": {"wet"}, "ladder": {"wet"},
            "broom": {"wet"}, "dustpan": {"wet"}, "rice_paddle": {"wet"}, "chopsticks": {"wet"}, "fork": {"wet"}, "whisk": {"wet"},
            "frying_pan": {"wet"}, "ladle": {"wet"}, "magnifier": {"wet"}, "telescope": {"wet"}, "compass": {"wet"},
            "map_blank": {"wet"}, "paint_brush": {"wet"}, "quill": {"wet"}, "calligraphy_brush": {"wet"},
            "flashlight": {"fire_extinguisher": {"wet"}, "whistle": {"wet"}, "umbrella": {"wet"}}.get("whistle", {"wet"}),
            "fire_extinguisher": {"wet"}, "whistle": {"wet"}, "umbrella": {"wet"},
            "kite": {"wet"}, "ball": {"wet"}, "jump_rope": {"wet"}, "lantern_star": {"wet"},
            "gold_pan": {"wet"}, "wooden_shield": {"wet"}, "toy_sword": {"wet"}, "printing_press": {"wet"},
            "early_bulb": {"wet"}, "sign_post": {"wet"}, "pictogram_card": {"wet"}, "screen": {"wet"},
            # Phase K Recycling Rigs
            "plastic_bottle": {"wet"}, "can": {"wet"}, "glass_jar": {"wet"}, "newspaper_bundle": {"wet"},
            "cardboard_box": {"wet"}, "banana_peel": {"wet"}, "apple_core": {"wet"}, "battery": {"wet"},
            "garbage_truck": {"wet"}, "recycling_plant": {"wet"},
            # Phase L Safety & Disaster Rigs
            "traffic_light": {"wet"}, "crosswalk": {"wet"}, "traffic_cone": {"wet"}, "smoke_detector": {"wet"},
            "fire_blanket": {"wet"}, "swim_ring": {"wet"}, "rescue_buoy": {"wet"}, "radio": {"wet"},
            "megaphone": {"wet"}, "sandbag": {"wet"},
            # Phase M Ancient History Rigs
            "olive": {"cut", "damage", "growth", "slice", "wet"},
            "olive_tree": {"fruits", "growth", "nutrients", "roots", "wet"},
            "mammoth": {"wet"}, "camel": {"wet"},
            "stone_block": {"wet"}, "sledge": {"wet"}, "papyrus_roll": {"wet"}, "campfire": {"wet"},
            "cave_wall": {"wet"}, "laurel_torch": {"wet"}, "discus": {"wet"}, "javelin_training": {"wet"},
            "paving_stone": {"wet"}, "chalkboard_wax_tablet": {"wet"},
            # Phase O Inventions & Early Life Rigs
            "draisine_1817": {"wet"}, "phonograph": {"wet"}, "early_telephone": {"wet"},
            "movable_type_tray": {"wet"}, "water_clock": {"wet"}, "rain_gauge": {"wet"},
            "eyeglasses_early": {"wet"}, "toothbrush_early": {"wet"}, "paper_sheet_stack": {"wet"},
            "coin_stack": {"wet"}, "workbench_clutter": {"wet"}, "smartphone": {"wet"},
            "led_bulb": {"wet"},
            # Phase P German Culture Rigs
            "schultuete": {"wet"}, "advent_wreath": {"wet"}, "christmas_tree_decor": {"wet"},
            "gingerbread_house": {"wet"}, "market_stall": {"wet"}, "cuckoo_clock": {"wet"},
            "fox": {"wet"}, "owl": {"wet"}, "deer": {"wet"}, "wolf": {"wet"},
            "stork": {"wet"}, "wild_boar": {"wet"},
            # Phase Q Japanese Culture Rigs
            "koinobori": {"wet"}, "tanabata_bamboo": {"wet"}, "bamboo": {"growth", "roots", "wet"},
            "paper_lantern_jp": {"wet"}, "school_bag_randoseru": {"wet"}, "train_ticket_gate": {"wet"},
            "pheasant": {"wet"}, "crab": {"wet"}, "tanuki": {"wet"}, "crane": {"wet"},
            "koi": {"hooked", "mouth", "wet"}, "snow_monkey": {"wet"},
            # Phase R Korean Culture Rigs
            "hangul_brush_scroll": {"wet"}, "yut_sticks": {"wet"}, "jegi": {"wet"},
            "gourd": {"wet"}, "low_dining_table_kr": {"wet"}, "sebae_cushion": {"wet"},
            "bokjumeoni": {"wet"}, "swallow": {"wet"}, "magpie": {"wet"},
            # Phase N Medieval Rigs
            "well": {"wet"}, "anvil": {"wet"}, "forge": {"wet"},
            "horseshoe": {"wet"}, "spinning_wheel": {"wet"}, "wool_basket": {"wet"},
            "banner_plain": {"wet"}, "star_compass_viking": {"wet"}, "viking_longhouse": {"wet"},
            # Phase S US Culture Rigs
            "bison": {"wet"}, "bear": {"wet"}, "prairie_dog": {"wet"}, "raccoon": {"wet"}, "salmon": {"wet"},
            "jack_o_lantern": {"wet"}, "harvest_basket": {"wet"}, "lemonade_stand": {"wet"}, "mailbox": {"wet"},
            "fire_hydrant": {"wet"}, "liberty_statue_generic": {"wet"}, "railroad_track": {"wet"},
            "moon_footprint": {"wet"}, "seismometer": {"wet"},
            # Phase T Nature & Space Rigs
            "planet": {"wet"}, "sun": {"wet"}, "moon": {"wet"}, "comet": {"wet"},
            "satellite": {"wet"}, "space_station": {"wet"},
            "cloud": {"wet"}, "raindrop_chibi": {"wet"}, "rainbow": {"wet"},
            "volcano": {"wet"}, "earth_cutaway": {"wet"}, "fossil": {"wet"},
            "lever": {"wet"}, "pulley": {"wet"}, "ramp": {"wet"}, "wheel_axle": {"wet"},
        }
        self.assertEqual(set(document["assets"]), set(expected))
        for asset_id, states in expected.items():
            with self.subTest(asset=asset_id):
                self.assertEqual(set(document["assets"][asset_id]["states"]), states)

    def test_gap_records_have_precise_reason_codes(self):
        from bkt_web.capability_registry import match_renderer

        cases = (
            ({"kind": "action", "id": "missing_action"}, {}, "unknown_capability"),
            ({"kind": "anchor", "entity": "missing_entity", "id": "grip"}, {}, "entity_not_found"),
            (
                {"kind": "anchor", "entity": "pepper_1", "id": "grip_l"},
                {"entities": {"pepper_1": {"asset": "pepper"}}},
                "anchor_unsupported",
            ),
            ({"kind": "fidelity", "id": "character_motion", "minimum": 0.9}, {}, "below_minimum"),
        )
        for requirement, context, reason in cases:
            with self.subTest(reason=reason):
                result = match_renderer("native-vector-v1", {"required": [requirement]}, context)
                self.assertFalse(result["eligible"])
                self.assertEqual(result["missing_required"][0]["reason"], reason)

    def test_context_limits_reject_an_unsafe_scene(self):
        from bkt_web.capability_registry import match_renderer

        contexts = (
            ({"entities": {f"entity_{index}": {"asset": "watermelon"} for index in range(65)}}, "max_entities_per_project"),
            ({"scene_duration_seconds": 1800.001}, "max_scene_duration_seconds"),
            ({"canvas_size": [1080, 1920]}, "canvas_sizes"),
        )
        requirements = {"required": [{"kind": "feature", "id": "offline_render"}]}
        for context, limit_id in contexts:
            with self.subTest(limit=limit_id):
                result = match_renderer("native-vector-v1", requirements, context)
                self.assertFalse(result["eligible"])
                self.assertEqual(result["limit_violations"][0]["id"], limit_id)
                self.assertEqual(result["limit_violations"][0]["reason"], "limit_exceeded")

    def test_media_is_a_queryable_renderer_capability(self):
        from bkt_web.capability_registry import match_renderer

        supported = match_renderer(
            "native-vector-v1",
            {"required": [{"kind": "media", "id": "vector-2d"}]},
        )
        self.assertTrue(supported["eligible"])

        unsupported = match_renderer(
            "native-vector-v1",
            {"required": [{"kind": "media", "id": "raster-video"}]},
        )
        self.assertFalse(unsupported["eligible"])
        self.assertEqual(unsupported["missing_required"][0]["reason"], "unsupported_media")

    def test_match_and_rank_do_not_mutate_any_input(self):
        from bkt_web.capability_registry import match_renderer, rank_renderers

        document = self._registry_with_renderer("native-vector-copy")
        requirements = {
            "required": [{"kind": "entity", "id": "fruit"}],
            "preferred": [{"kind": "fidelity", "id": "character_motion", "minimum": 0.7}],
        }
        context = {"entities": {"fruit_1": {"asset": "watermelon"}}, "canvas_size": [576, 1024]}
        before = copy.deepcopy((document, requirements, context))
        match_renderer("native-vector-v1", requirements, context, registry=document)
        rank_renderers(requirements, context, registry=document)
        self.assertEqual((document, requirements, context), before)

    def test_multi_renderer_ranking_is_stable_across_insertion_order(self):
        from bkt_web.capability_registry import rank_renderers

        first = self._registry_with_renderer("alpha-vector")
        zeta = copy.deepcopy(first["renderers"]["native-vector-v1"])
        zeta["id"] = "zeta-vector"
        first["renderers"]["zeta-vector"] = zeta
        first["renderers"]["zeta-vector"]["features"]["offline_render"] = False
        second = copy.deepcopy(first)
        second["renderers"] = dict(reversed(list(second["renderers"].items())))
        requirements = {"required": [{"kind": "feature", "id": "offline_render"}]}
        ranked_first = rank_renderers(requirements, registry=first)
        ranked_second = rank_renderers(requirements, registry=second)
        self.assertEqual(ranked_first, ranked_second)
        self.assertEqual(
            [item["renderer"] for item in ranked_first],
            ["alpha-vector", "native-vector-v1", "zeta-vector"],
        )
        self.assertEqual([item["eligible"] for item in ranked_first], [True, True, False])

    def test_source_reuse_fallback_conflict_stays_ineligible_and_is_explained(self):
        from bkt_web.capability_registry import match_renderer, native_registry_document

        document = native_registry_document()
        document["fallbacks"] = {
            "source-footage-overlay": {
                "id": "source-footage-overlay",
                "version": "1.0.0",
                "provides": [{"kind": "effect", "id": "motion_blur"}],
                "cost": 0.2,
                "changes_fidelity_class": True,
                "requires_approval": True,
                "disclosure": "This scene reuses source footage.",
                "conflicts_with": [{"kind": "fidelity", "id": "no_source_reuse"}],
            }
        }
        document["renderers"]["native-vector-v1"]["fallbacks"] = ["source-footage-overlay"]
        document["renderers"]["native-vector-v1"]["fidelity"]["no_source_reuse"] = 1
        requirements = {
            "required": [
                {"kind": "effect", "id": "motion_blur"},
                {"kind": "fidelity", "id": "no_source_reuse", "minimum": 1},
            ]
        }
        result = match_renderer("native-vector-v1", requirements, registry=document)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["fallbacks"][0]["id"], "source-footage-overlay")
        self.assertFalse(result["fallbacks"][0]["eligible"])
        self.assertEqual(result["fallbacks"][0]["reason"], "fallback_conflicts_required_fidelity")

    def test_typed_fallback_provides_does_not_cross_capability_kinds(self):
        from bkt_web.capability_registry import match_renderer, native_registry_document

        document = native_registry_document()
        document["fallbacks"] = {
            "spray-effect-fallback": {
                "id": "spray-effect-fallback",
                "version": "1.0.0",
                "provides": [{"kind": "effect", "id": "spray"}],
                "cost": 0.1,
                "changes_fidelity_class": False,
                "requires_approval": False,
                "disclosure": "Adds a spray visual effect.",
                "conflicts_with": [],
            }
        }
        document["renderers"]["native-vector-v1"]["fallbacks"] = ["spray-effect-fallback"]
        result = match_renderer(
            "native-vector-v1",
            {"required": [{"kind": "material", "id": "spray"}]},
            registry=document,
        )
        self.assertFalse(result["eligible"])
        self.assertEqual(result["fallbacks"], [])


if __name__ == "__main__":
    unittest.main()
