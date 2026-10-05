#!/usr/bin/env python3
"""Thêm pack ancient_sites (R6) vào remake_vector_catalog.json an toàn đa luồng."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.catalog_edit import edit_catalog


def update_catalog():
    with edit_catalog() as cat:
        # 1. engine_packs
        if "ancient_sites" not in cat["engine_packs"]:
            cat["engine_packs"].append("ancient_sites")

        # 2. backgrounds
        new_bgs = ["andes_terraces", "jungle_temple", "rock_canyon"]
        for bg in new_bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        cat["background_specs"]["andes_terraces"] = {
            "label": "High Andes mountain terraces",
            "theme": "highland",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["ancient", "nature", "lost_civilizations"]
        }
        cat["background_specs"]["jungle_temple"] = {
            "label": "Dense jungle ancient temple ruins",
            "theme": "farm",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["ancient", "nature", "lost_civilizations"]
        }
        cat["background_specs"]["rock_canyon"] = {
            "label": "Sandstone desert rock canyon",
            "theme": "farm",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["ancient", "nature", "lost_civilizations", "unsolved_mysteries"]
        }

        # 4. assets (9 rigs)
        new_assets = {
            "machu_picchu": {
                "label": "Machu Picchu ruins",
                "group": "building",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations"],
                "face": False,
                "rest_pose": {
                    "growth": 1
                },
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -95],
                    "peak": [15, -92],
                    "terrace_1": [-24, -30],
                    "terrace_2": [24, -45]
                }
            },
            "angkor_temple": {
                "label": "Angkor temple",
                "group": "building",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations"],
                "face": False,
                "rest_pose": {
                    "growth": 1
                },
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -52],
                    "top": [0, -95],
                    "tower_c": [0, -95],
                    "tower_l": [-28, -65],
                    "tower_r": [28, -65],
                    "entrance": [0, -18]
                }
            },
            "petra_facade": {
                "label": "Petra rock-cut facade",
                "group": "building",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations"],
                "face": False,
                "rest_pose": {
                    "growth": 1
                },
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -54],
                    "top": [0, -95],
                    "urn": [0, -95],
                    "column_l": [-26, -30],
                    "column_r": [26, -30],
                    "portal": [0, -15]
                }
            },
            "nazca_geoglyph": {
                "label": "Nazca hummingbird geoglyph",
                "group": "prop",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations", "unsolved_mysteries"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -94],
                    "beak_tip": [0, -94],
                    "wing_l": [-42, -52],
                    "wing_r": [42, -52],
                    "tail": [0, -10]
                }
            },
            "terracotta_warriors": {
                "label": "Terracotta army warriors",
                "group": "prop",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -88],
                    "head_c": [0, -82],
                    "head_l": [-26, -74],
                    "head_r": [26, -74],
                    "chest": [0, -52]
                }
            },
            "antikythera_mechanism": {
                "label": "Antikythera mechanism",
                "group": "prop",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations", "unsolved_mysteries"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -94],
                    "dial": [0, -50],
                    "crank": [38, -50],
                    "gear_main": [0, -50]
                }
            },
            "gobekli_pillar": {
                "label": "Göbekli Tepe stone pillar",
                "group": "building",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations", "unsolved_mysteries"],
                "face": False,
                "rest_pose": {
                    "growth": 1
                },
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -94],
                    "cap_l": [-32, -85],
                    "cap_r": [32, -85],
                    "belt": [0, -25],
                    "relief": [0, -52]
                }
            },
            "underground_city": {
                "label": "Underground city cutaway",
                "group": "building",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations", "unsolved_mysteries"],
                "face": False,
                "rest_pose": {
                    "growth": 1
                },
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -94],
                    "stone_door": [-24, -26],
                    "vent_shaft": [28, -75],
                    "level_1": [0, -74],
                    "level_2": [0, -42],
                    "level_3": [0, -16]
                }
            },
            "ancient_library_scroll": {
                "label": "Ancient library scroll stack",
                "group": "prop",
                "pack": "ancient_sites",
                "topics": ["ancient", "lost_civilizations", "unsolved_mysteries"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -48],
                    "top": [0, -92],
                    "scroll_open": [0, -32],
                    "shelf_top": [0, -84],
                    "tag": [-20, -55]
                }
            }
        }
        for aid, spec in new_assets.items():
            cat["assets"][aid] = spec


if __name__ == "__main__":
    update_catalog()
    print("Updated catalog for ancient_sites successfully.")
