"""Update vector catalog for Pack wildlife_weird (Nhóm R3).
10 rigs: mantis_shrimp, tardigrade, axolotl, greenland_shark, electric_eel, bombardier_beetle, wood_frog, naked_mole_rat, archerfish, arctic_tern
1 background: micro_world

Uses edit_catalog() context manager for atomic and safe multi-agent mutations.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.catalog_edit import edit_catalog


def main():
    with edit_catalog() as cat:
        # 1. engine_packs
        if "wildlife_weird" not in cat["engine_packs"]:
            cat["engine_packs"].append("wildlife_weird")

        # 2. backgrounds
        if "micro_world" not in cat["backgrounds"]:
            cat["backgrounds"].append("micro_world")

        # 3. background_specs
        cat["background_specs"]["micro_world"] = {
            "label": "Micro World (Thế giới giọt nước vi mô)",
            "theme": "nature",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["micro", "biology", "weird", "nature", "science"]
        }

        # 4. assets (10 weird wildlife rigs)
        new_assets = {
            "mantis_shrimp": {
                "label": "a mantis shrimp",
                "group": "fish",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["marine", "ocean", "weird", "shrimp"],
                "anchors": {
                    "root": [0, 0],
                    "head": [28, -36],
                    "face": [30, -36],
                    "eye": [32, -44],
                    "club": [24, -22],
                    "back": [-6, -38],
                    "surface": [-6, -38],
                    "tail": [-40, -26],
                    "grip": [0, -25],
                    "top": [28, -52]
                }
            },
            "tardigrade": {
                "label": "a tardigrade",
                "group": "animal",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["micro", "space", "weird", "tardigrade", "biology"],
                "anchors": {
                    "root": [0, 0],
                    "head": [30, -35],
                    "mouth": [38, -32],
                    "eye": [28, -38],
                    "back": [-2, -48],
                    "surface": [-2, -48],
                    "grip": [0, -30],
                    "top": [-2, -54]
                }
            },
            "axolotl": {
                "label": "an axolotl",
                "group": "fish",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["amphibian", "weird", "axolotl", "biology"],
                "anchors": {
                    "root": [0, 0],
                    "head": [26, -36],
                    "face": [28, -36],
                    "mouth": [34, -30],
                    "gill": [20, -48],
                    "back": [-8, -34],
                    "surface": [-8, -34],
                    "tail": [-42, -26],
                    "grip": [0, -25],
                    "top": [20, -56]
                }
            },
            "greenland_shark": {
                "label": "a greenland shark",
                "group": "fish",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["ocean", "shark", "ancient", "weird", "deep_sea"],
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -34],
                    "head": [44, -34],
                    "mouth": [42, -24],
                    "eye": [36, -38],
                    "top": [2, -54],
                    "back": [0, -48],
                    "belly": [0, -18],
                    "tail": [-52, -34],
                    "grip": [0, -30]
                }
            },
            "electric_eel": {
                "label": "an electric eel",
                "group": "fish",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["river", "electric", "fish", "weird"],
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -30],
                    "head": [46, -34],
                    "face": [44, -34],
                    "mouth": [52, -32],
                    "eye": [42, -38],
                    "back": [0, -42],
                    "surface": [0, -42],
                    "tail": [-50, -26],
                    "top": [0, -48],
                    "grip": [0, -30]
                }
            },
            "bombardier_beetle": {
                "label": "a bombardier beetle",
                "group": "animal",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["insect", "beetle", "chemical", "weird"],
                "anchors": {
                    "root": [0, 0],
                    "head": [28, -32],
                    "antenna": [36, -46],
                    "thorax": [12, -34],
                    "back": [-10, -36],
                    "surface": [-10, -36],
                    "nozzle": [-32, -22],
                    "top": [-2, -48],
                    "grip": [0, -25]
                }
            },
            "wood_frog": {
                "label": "a wood frog",
                "group": "animal",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["amphibian", "frog", "arctic", "freeze", "weird"],
                "anchors": {
                    "root": [0, 0],
                    "head": [20, -32],
                    "face": [22, -32],
                    "mouth": [26, -26],
                    "eye": [18, -38],
                    "back": [-12, -34],
                    "surface": [-12, -34],
                    "leg": [-20, -18],
                    "grip": [0, -20],
                    "top": [12, -46]
                }
            },
            "naked_mole_rat": {
                "label": "a naked mole rat",
                "group": "animal",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["mammal", "underground", "weird", "longevity"],
                "anchors": {
                    "root": [0, 0],
                    "head": [28, -28],
                    "face": [30, -28],
                    "teeth": [36, -24],
                    "nose": [34, -30],
                    "back": [-6, -30],
                    "surface": [-6, -30],
                    "tail": [-38, -18],
                    "grip": [0, -20],
                    "top": [12, -40]
                }
            },
            "archerfish": {
                "label": "an archerfish",
                "group": "fish",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["fish", "river", "shooter", "weird"],
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -32],
                    "head": [32, -36],
                    "mouth": [38, -38],
                    "eye": [28, -42],
                    "back": [-4, -48],
                    "top": [-4, -54],
                    "tail": [-42, -30],
                    "grip": [0, -28]
                }
            },
            "arctic_tern": {
                "label": "an arctic tern",
                "group": "bird",
                "face": False,
                "pack": "wildlife_weird",
                "topics": ["bird", "arctic", "migration", "weird", "ocean"],
                "anchors": {
                    "root": [0, 0],
                    "head": [16, -52],
                    "face": [18, -50],
                    "beak": [32, -48],
                    "eye": [18, -52],
                    "wing": [-8, -42],
                    "back": [-6, -42],
                    "surface": [-6, -42],
                    "tail": [-36, -26],
                    "grip": [0, -25],
                    "top": [16, -64]
                }
            }
        }
        for k, v in new_assets.items():
            cat["assets"][k] = v

    print("Updated catalog successfully for wildlife_weird.")


if __name__ == "__main__":
    main()
