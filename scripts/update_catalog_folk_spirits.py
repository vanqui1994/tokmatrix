#!/usr/bin/env python3
"""Thêm pack folk_spirits (R7) vào remake_vector_catalog.json an toàn đa luồng."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.catalog_edit import edit_catalog


def update_catalog():
    with edit_catalog() as cat:
        # 1. engine_packs
        if "folk_spirits" not in cat["engine_packs"]:
            cat["engine_packs"].append("folk_spirits")

        # 2. backgrounds
        new_bgs = ["misty_forest_night", "rhine_cliff", "korean_mountain_night"]
        for bg in new_bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        cat["background_specs"]["misty_forest_night"] = {
            "label": "Misty enchanted night forest",
            "theme": "highland",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["folklore", "nature"]
        }
        cat["background_specs"]["rhine_cliff"] = {
            "label": "Loreley Rhine river cliff",
            "theme": "water",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["folklore", "nature"]
        }
        cat["background_specs"]["korean_mountain_night"] = {
            "label": "Korean mountain ridge under moonlight",
            "theme": "highland",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["folklore", "nature"]
        }

        # 4. assets (10 rigs)
        new_assets = {
            "kitsune": {
                "label": "Kitsune spirit fox",
                "group": "animal",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -88],
                    "head": [0, -62],
                    "orb": [28, -68],
                    "tail_l": [-34, -40],
                    "tail_r": [34, -40]
                }
            },
            "gumiho": {
                "label": "Gumiho nine-tailed fox",
                "group": "animal",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -88],
                    "head": [0, -60],
                    "bead": [0, -32],
                    "tail_fan": [0, -50]
                }
            },
            "dokkaebi": {
                "label": "Dokkaebi goblin with club",
                "group": "chibi",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -90],
                    "head": [0, -60],
                    "horn": [0, -88],
                    "club": [26, -48],
                    "hand_l": [-22, -40],
                    "hand_r": [22, -40]
                }
            },
            "yuki_onna": {
                "label": "Yuki-onna snow maiden",
                "group": "chibi",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -46],
                    "top": [0, -92],
                    "head": [0, -66],
                    "hand_l": [-20, -42],
                    "hand_r": [20, -42],
                    "snow_swirl": [25, -55]
                }
            },
            "krampus_folk": {
                "label": "Krampus alpine spirit",
                "group": "animal",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -46],
                    "top": [0, -95],
                    "head": [0, -62],
                    "horn_l": [-22, -92],
                    "horn_r": [22, -92],
                    "bell": [0, -28],
                    "twigs": [-26, -50]
                }
            },
            "clay_golem": {
                "label": "Clay golem guardian",
                "group": "chibi",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -94],
                    "head": [0, -72],
                    "rune": [0, -78],
                    "chest": [0, -52],
                    "fist_l": [-34, -35],
                    "fist_r": [34, -35]
                }
            },
            "will_o_wisp": {
                "label": "Will-o'-the-wisp spirit light",
                "group": "prop",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -48],
                    "top": [0, -90],
                    "orb_main": [0, -50],
                    "orb_small1": [-24, -35],
                    "orb_small2": [24, -62]
                }
            },
            "selkie": {
                "label": "Selkie seal spirit",
                "group": "animal",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -42],
                    "top": [0, -84],
                    "head": [0, -60],
                    "pelt": [-15, -45],
                    "flipper_l": [-26, -20],
                    "flipper_r": [26, -20]
                }
            },
            "rubezahl_spirit": {
                "label": "Rübezahl mountain spirit",
                "group": "chibi",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -96],
                    "head": [0, -68],
                    "staff_top": [30, -92],
                    "beard": [0, -50],
                    "lantern": [30, -60]
                }
            },
            "welsh_red_dragon": {
                "label": "Welsh red dragon",
                "group": "animal",
                "pack": "folk_spirits",
                "topics": ["folklore"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -48],
                    "top": [0, -92],
                    "head": [0, -68],
                    "wing_l": [-38, -65],
                    "wing_r": [38, -65],
                    "tail_tip": [35, -25],
                    "mouth: [14, -62]": [14, -62]
                }
            }
        }
        # fix anchor mouth for welsh_red_dragon
        new_assets["welsh_red_dragon"]["anchors"]["mouth"] = [14, -62]
        if "mouth: [14, -62]" in new_assets["welsh_red_dragon"]["anchors"]:
            del new_assets["welsh_red_dragon"]["anchors"]["mouth: [14, -62]"]

        for aid, spec in new_assets.items():
            cat["assets"][aid] = spec


if __name__ == "__main__":
    update_catalog()
    print("Updated catalog for folk_spirits successfully.")
