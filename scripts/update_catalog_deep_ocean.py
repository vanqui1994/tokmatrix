"""Cập nhật remake_vector_catalog.json cho gói deep_ocean (Nhóm R4).

Sử dụng edit_catalog để an toàn khi nhiều agent chạy song song.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.catalog_edit import edit_catalog


PACK_NAME = "deep_ocean"

NEW_ASSETS = {
    "giant_squid": {
        "label": "giant squid",
        "group": "animal",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "wildlife", "mystery"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "top": [0, -96],
            "head": [0, -42],
            "eye": [-10, -43],
            "tentacles": [0, -10],
            "mantle": [0, -75],
            "grip": [0, -40]
        }
    },
    "sperm_whale": {
        "label": "a sperm whale",
        "group": "animal",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "head": [35, -50],
            "mouth": [35, -34],
            "tail": [-48, -48],
            "top": [0, -76],
            "belly": [0, -36],
            "flipper": [6, -38],
            "grip": [0, -45]
        }
    },
    "bathyscaphe": {
        "label": "a bathyscaphe",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "inventions", "mystery"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -88],
            "sphere": [0, -28],
            "window": [12, -28],
            "light": [18, -32],
            "propeller": [-44, -58],
            "grip": [0, -30]
        }
    },
    "research_submarine": {
        "label": "a research submarine",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "science", "inventions"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -86],
            "viewport": [32, -38],
            "claw": [46, -10],
            "light": [36, -60],
            "thruster": [-44, -42],
            "grip": [0, -40]
        }
    },
    "hydrothermal_vent": {
        "label": "a hydrothermal vent",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "nature", "science"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -96],
            "chimney_top": [0, -68],
            "smoke": [0, -85],
            "base": [0, 0],
            "grip": [0, -45]
        }
    },
    "tube_worms": {
        "label": "tube worms",
        "group": "animal",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "wildlife", "nature"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -88],
            "plume_1": [-16, -72],
            "plume_2": [-2, -82],
            "plume_3": [25, -76],
            "base": [0, 0],
            "grip": [0, -45]
        }
    },
    "sunken_liner": {
        "label": "a sunken ocean liner",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "history", "mystery"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -40],
            "top": [0, -84],
            "bow": [46, -34],
            "stern": [-48, -38],
            "bridge": [0, -56],
            "funnel_1": [-8, -82],
            "funnel_2": [8, -76],
            "anchor": [40, -4],
            "grip": [0, -40]
        }
    },
    "rogue_wave": {
        "label": "a rogue wave",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "nature", "disaster"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [16, -94],
            "crest": [16, -88],
            "trough": [-35, -15],
            "curl": [26, -75],
            "grip": [0, -45]
        }
    },
    "bioluminescent_fish_swarm": {
        "label": "a swarm of bioluminescent fish",
        "group": "animal",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ocean", "wildlife", "nature"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [20, -86],
            "lead": [36, -65],
            "tail_group": [-36, -22],
            "glow_center": [0, -45],
            "grip": [0, -45]
        }
    }
}

NEW_BACKGROUNDS = ["trench_floor", "hydrothermal_field", "stormy_sea"]

NEW_BG_SPECS = {
    "trench_floor": {
        "label": "Đáy rãnh Mariana siêu sâu",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ocean", "nature", "mystery"]
    },
    "hydrothermal_field": {
        "label": "Cánh đồng thuỷ nhiệt đáy biển",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ocean", "nature", "science"]
    },
    "stormy_sea": {
        "label": "Biển bão tố gầm thét",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ocean", "nature", "disaster"]
    }
}


def update():
    with edit_catalog() as cat:
        # 1. engine_packs
        if PACK_NAME not in cat["engine_packs"]:
            cat["engine_packs"].append(PACK_NAME)

        # 2. backgrounds
        for bg in NEW_BACKGROUNDS:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        for bg, spec in NEW_BG_SPECS.items():
            cat["background_specs"][bg] = spec

        # 4. assets
        for asset, spec in NEW_ASSETS.items():
            cat["assets"][asset] = spec

    print(f"[{PACK_NAME}] Đã cập nhật catalog: {len(NEW_ASSETS)} rigs, {len(NEW_BACKGROUNDS)} backgrounds.")


if __name__ == "__main__":
    update()
