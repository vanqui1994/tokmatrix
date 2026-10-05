"""Update vector catalog for Pack wildlife_apex (Nhóm R2).
10 rigs: lion, tiger, jaguar, great_white_shark, killer_whale, polar_bear, rhino, peregrine_falcon, snowy_owl, komodo_dragon
3 backgrounds: savanna, arctic_ice, open_ocean_surface

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
        if "wildlife_apex" not in cat["engine_packs"]:
            cat["engine_packs"].append("wildlife_apex")

        # 2. backgrounds
        bgs = ["savanna", "arctic_ice", "open_ocean_surface"]
        for bg in bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        cat["background_specs"]["savanna"] = {
            "label": "Savanna (Thảo nguyên hoang dã)",
            "theme": "nature",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["wildlife", "africa", "nature", "safari"]
        }
        cat["background_specs"]["arctic_ice"] = {
            "label": "Arctic Ice (Băng tuyết Bắc Cực)",
            "theme": "nature",
            "ground_y": 810,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["arctic", "ice", "polar", "wildlife"]
        }
        cat["background_specs"]["open_ocean_surface"] = {
            "label": "Open Ocean Surface (Mặt biển đại dương)",
            "theme": "water",
            "ground_y": 810,
            "open_water": True,
            "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
            "topics": ["ocean", "sea", "wildlife", "marine"]
        }

        # 4. assets (10 apex predator rigs)
        new_assets = {
            "lion": {
                "label": "a lion",
                "group": "animal",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["wildlife", "safari", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "head": [28, -52],
                    "face": [32, -50],
                    "mouth": [42, -45],
                    "nose": [44, -48],
                    "back": [-6, -50],
                    "surface": [-6, -50],
                    "tail": [-46, -30],
                    "grip": [0, -35],
                    "top": [28, -68]
                }
            },
            "tiger": {
                "label": "a tiger",
                "group": "animal",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["wildlife", "asia", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "head": [30, -50],
                    "face": [34, -48],
                    "mouth": [44, -44],
                    "nose": [46, -46],
                    "back": [-6, -48],
                    "surface": [-6, -48],
                    "tail": [-48, -28],
                    "grip": [0, -35],
                    "top": [30, -64]
                }
            },
            "jaguar": {
                "label": "a jaguar",
                "group": "animal",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["wildlife", "jungle", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "head": [28, -48],
                    "face": [32, -46],
                    "mouth": [42, -42],
                    "nose": [44, -44],
                    "back": [-6, -46],
                    "surface": [-6, -46],
                    "tail": [-46, -26],
                    "grip": [0, -32],
                    "top": [28, -62]
                }
            },
            "great_white_shark": {
                "label": "a great white shark",
                "group": "fish",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["ocean", "marine", "shark", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -36],
                    "head": [44, -36],
                    "mouth": [40, -28],
                    "snout": [54, -36],
                    "eye": [36, -40],
                    "dorsal": [4, -68],
                    "top": [4, -68],
                    "back": [0, -50],
                    "belly": [0, -18],
                    "tail": [-52, -36],
                    "grip": [0, -36]
                }
            },
            "killer_whale": {
                "label": "a killer whale",
                "group": "animal",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["ocean", "marine", "whale", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -36],
                    "head": [46, -36],
                    "mouth": [54, -32],
                    "eye": [38, -38],
                    "blowhole": [20, -56],
                    "dorsal": [2, -72],
                    "top": [2, -72],
                    "back": [0, -52],
                    "belly": [0, -16],
                    "fluke": [-54, -36],
                    "grip": [0, -36]
                }
            },
            "polar_bear": {
                "label": "a polar bear",
                "group": "animal",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["arctic", "polar", "bear", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "head": [36, -56],
                    "face": [40, -54],
                    "mouth": [52, -48],
                    "nose": [54, -52],
                    "back": [-6, -58],
                    "surface": [-6, -58],
                    "tail": [-48, -42],
                    "grip": [0, -40],
                    "top": [36, -70]
                }
            },
            "rhino": {
                "label": "a rhino",
                "group": "animal",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["wildlife", "safari", "savanna"],
                "anchors": {
                    "root": [0, 0],
                    "head": [32, -50],
                    "face": [36, -48],
                    "mouth": [46, -38],
                    "snout": [48, -42],
                    "horn": [52, -58],
                    "back": [-8, -58],
                    "surface": [-8, -58],
                    "tail": [-46, -32],
                    "grip": [0, -40],
                    "top": [30, -72]
                }
            },
            "peregrine_falcon": {
                "label": "a peregrine falcon",
                "group": "bird",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["bird", "raptor", "speed", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "head": [12, -58],
                    "face": [14, -56],
                    "beak": [28, -54],
                    "mouth": [26, -52],
                    "eye": [16, -58],
                    "wing": [-10, -40],
                    "back": [-6, -50],
                    "surface": [-6, -50],
                    "tail": [-28, -20],
                    "grip": [0, -25],
                    "top": [12, -70]
                }
            },
            "snowy_owl": {
                "label": "a snowy owl",
                "group": "bird",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["bird", "owl", "arctic", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "head": [0, -56],
                    "face": [2, -56],
                    "beak": [6, -52],
                    "mouth": [6, -50],
                    "eye": [2, -58],
                    "wing": [-18, -36],
                    "back": [-12, -48],
                    "surface": [-12, -48],
                    "tail": [-18, -12],
                    "grip": [0, -30],
                    "top": [0, -74]
                }
            },
            "komodo_dragon": {
                "label": "a komodo dragon",
                "group": "animal",
                "face": False,
                "pack": "wildlife_apex",
                "topics": ["wildlife", "reptile", "lizard", "apex"],
                "anchors": {
                    "root": [0, 0],
                    "head": [36, -34],
                    "face": [40, -32],
                    "snout": [48, -30],
                    "mouth": [46, -26],
                    "tongue": [58, -28],
                    "back": [-8, -32],
                    "surface": [-8, -32],
                    "tail": [-50, -18],
                    "grip": [0, -20],
                    "top": [32, -46]
                }
            }
        }
        for k, v in new_assets.items():
            cat["assets"][k] = v

    print("Updated catalog successfully for wildlife_apex.")


if __name__ == "__main__":
    main()
