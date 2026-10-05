"""Update remake_vector_catalog.json for mystery_props pack (Agent A)."""
from __future__ import annotations

from scripts.catalog_edit import edit_catalog


def update_catalog():
    with edit_catalog() as cat:
        # 1. engine_packs
        if "mystery_props" not in cat["engine_packs"]:
            cat["engine_packs"].append("mystery_props")

        # 2. backgrounds
        new_bgs = [
            "foggy_harbor",
            "radio_telescope_field"
        ]
        for bg in new_bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        bg_specs = {
            "foggy_harbor": {
                "label": "Foggy Harbor Pier",
                "theme": "water",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["unsolved_mysteries", "ocean"]
            },
            "radio_telescope_field": {
                "label": "Radio Telescope Observatory Field",
                "theme": "highland",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["unsolved_mysteries", "deep_space", "technology"]
            }
        }
        for bg, spec in bg_specs.items():
            cat["background_specs"][bg] = spec

        # 4. assets
        new_assets = {
            "cipher_manuscript": {
                "label": "Voynich Cipher Manuscript",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "ancient", "mystery"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -90],
                    "page_l": [-40, -50],
                    "page_r": [40, -50]
                }
            },
            "twin_engine_plane": {
                "label": "Electra Twin Engine Plane",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "inventions", "vehicle"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "nose": [65, -50],
                    "tail": [-65, -60],
                    "wing_l": [-10, -35],
                    "wing_r": [-10, -65],
                    "propeller_1": [30, -35],
                    "propeller_2": [30, -65]
                }
            },
            "ghost_ship": {
                "label": "Ghost Ship Mary Celeste",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "ocean", "vehicle"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "bow": [70, -45],
                    "stern": [-65, -50],
                    "mast_main": [0, -95],
                    "mast_fore": [40, -85],
                    "mast_mizzen": [-35, -85],
                    "wheel": [-45, -55]
                }
            },
            "abandoned_lighthouse": {
                "label": "Abandoned Cliffside Lighthouse",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "ocean", "building"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -95],
                    "lamp": [0, -80],
                    "balcony": [0, -70],
                    "door": [0, -15],
                    "rock_base": [0, -5]
                }
            },
            "money_pit": {
                "label": "Oak Island Money Pit",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "mystery", "building"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -95],
                    "pulley": [0, -85],
                    "surface": [0, -65],
                    "depth": [0, -15],
                    "chest_depth": [0, -20]
                }
            },
            "phaistos_disk": {
                "label": "Ancient Phaistos Disk",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "ancient", "mystery"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -90],
                    "edge_l": [-45, -50],
                    "edge_r": [45, -50],
                    "center_spiral": [0, -50]
                }
            },
            "radio_telescope": {
                "label": "Radio Telescope Parabolic Dish",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "technology", "deep_space"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "dish_center": [10, -65],
                    "feed_horn": [28, -78],
                    "base": [0, -10],
                    "dish_rim_l": [-35, -50],
                    "dish_rim_r": [55, -80]
                }
            },
            "antique_compass": {
                "label": "Antique Navigational Brass Compass",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "inventions", "ocean"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "ring_top": [0, -92],
                    "needle_n": [0, -78],
                    "needle_s": [0, -22],
                    "edge_l": [-45, -50],
                    "edge_r": [45, -50]
                }
            },
            "treasure_map": {
                "label": "Parchment Treasure Map",
                "group": "prop",
                "pack": "mystery_props",
                "topics": ["unsolved_mysteries", "ocean", "mystery"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -88],
                    "mark_x": [15, -45],
                    "island": [-10, -50],
                    "roll_l": [-45, -50],
                    "roll_r": [45, -50]
                }
            }
        }
        for asset_id, asset_spec in new_assets.items():
            cat["assets"][asset_id] = asset_spec


if __name__ == "__main__":
    update_catalog()
    print("Catalog updated with mystery_props pack successfully.")
