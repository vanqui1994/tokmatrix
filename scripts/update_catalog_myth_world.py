"""Cập nhật remake_vector_catalog.json cho gói myth_world (nhóm R5).
An toàn khi chạy song song qua scripts.catalog_edit.edit_catalog.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.catalog_edit import edit_catalog

PACK_NAME = "myth_world"

NEW_BACKGROUNDS = [
    "olympus_clouds",
    "asgard_bridge",
    "duat_river",
    "takamagahara",
    "underworld_river",
]

NEW_BACKGROUND_SPECS = {
    "olympus_clouds": {
        "label": "Đỉnh Olympus bồng bềnh mây (Mount Olympus Clouds)",
        "theme": "highland",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ancient_mythology", "history"]
    },
    "asgard_bridge": {
        "label": "Cầu vồng Bifrost tới Asgard (Bifrost Rainbow Bridge)",
        "theme": "highland",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ancient_mythology", "fantasy"]
    },
    "duat_river": {
        "label": "Dòng sông Duat cõi âm Ai Cập (Duat River of the Afterlife)",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ancient_mythology", "mysteries"]
    },
    "takamagahara": {
        "label": "Cao Thiên Nguyên Takamagahara (High Plain of Heaven)",
        "theme": "garden",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ancient_mythology", "jp_culture"]
    },
    "underworld_river": {
        "label": "Dòng sông Styx cõi âm Hy Lạp (River Styx Underworld)",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ancient_mythology", "mysteries"]
    },
}

NEW_ASSETS = {
    "chibi_deity_greek": {
        "label": "a Greek deity",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -88],
            "head": [0, -62],
            "face": [0, -62],
            "hand_r": [22, -35],
            "hand_l": [-22, -35],
            "grip": [22, -35]
        }
    },
    "chibi_deity_norse": {
        "label": "a Norse deity",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -92],
            "head": [0, -60],
            "face": [0, -60],
            "hand_r": [24, -36],
            "hand_l": [-24, -36],
            "grip": [24, -36]
        }
    },
    "chibi_deity_egypt": {
        "label": "an Egyptian deity",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -46],
            "top": [0, -94],
            "head": [0, -60],
            "face": [0, -60],
            "hand_r": [22, -35],
            "hand_l": [-22, -35],
            "grip": [22, -35]
        }
    },
    "chibi_deity_jp": {
        "label": "a Japanese deity",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology", "jp_culture"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -90],
            "head": [0, -62],
            "face": [0, -62],
            "hand_r": [22, -35],
            "hand_l": [-22, -35],
            "grip": [22, -35]
        }
    },
    "chibi_deity_kr": {
        "label": "a Korean deity",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology", "kr_culture"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -92],
            "head": [0, -60],
            "face": [0, -60],
            "hand_r": [22, -35],
            "hand_l": [-22, -35],
            "grip": [22, -35]
        }
    },
    "world_tree_yggdrasil": {
        "label": "the world tree Yggdrasil",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology", "nature"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -48],
            "top": [0, -96],
            "trunk": [0, -30],
            "canopy": [0, -70],
            "grip": [0, -45]
        }
    },
    "thunder_hammer": {
        "label": "Thor's thunder hammer",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -40],
            "top": [0, -82],
            "head": [0, -65],
            "grip": [0, -25]
        }
    },
    "scale_of_truth": {
        "label": "the scale of truth",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -90],
            "pan_l": [-24, -40],
            "pan_r": [24, -40],
            "grip": [0, -45]
        }
    },
    "myth_labyrinth": {
        "label": "the Cretan labyrinth",
        "group": "building",
        "rest_pose": {"growth": 1},
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology", "history"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "top": [0, -75],
            "entrance": [0, -10],
            "core": [0, -38],
            "grip": [0, -35]
        }
    },
    "wooden_horse_trojan": {
        "label": "the Trojan wooden horse",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology", "history"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [12, -92],
            "head": [24, -75],
            "body": [-5, -45],
            "hatch": [-5, -42],
            "grip": [0, -45]
        }
    },
    "yamata_serpent": {
        "label": "the eight-headed serpent",
        "group": "animal",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology", "jp_culture"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -42],
            "top": [0, -88],
            "head_main": [0, -78],
            "head_1": [-28, -70],
            "head_2": [28, -70],
            "grip": [0, -40]
        }
    },
    "pandora_jar": {
        "label": "Pandora's jar",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -40],
            "top": [0, -85],
            "opening": [0, -62],
            "mist": [8, -78],
            "grip": [0, -40]
        }
    },
    "sun_barge": {
        "label": "the sun barge of Ra",
        "group": "vehicle",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "top": [0, -80],
            "prow": [38, -55],
            "stern": [-38, -55],
            "sun": [0, -58],
            "grip": [0, -35]
        }
    },
    "prometheus_torch": {
        "label": "the torch of Prometheus",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -92],
            "flame": [0, -75],
            "grip": [0, -32]
        }
    },
    "icarus_wings": {
        "label": "the wings of Icarus",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -85],
            "wing_l": [-32, -60],
            "wing_r": [32, -60],
            "grip": [0, -45]
        }
    },
    "golden_lyre": {
        "label": "the golden lyre of Orpheus",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -86],
            "strings": [0, -45],
            "grip": [0, -38]
        }
    },
    "sisyphus_boulder": {
        "label": "the boulder of Sisyphus",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -42],
            "top": [0, -84],
            "grip": [0, -42]
        }
    },
    "myth_dragon": {
        "label": "a mythical dragon",
        "group": "animal",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["ancient_mythology", "folklore_legends"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -90],
            "head": [22, -68],
            "wing": [-16, -60],
            "tail": [-34, -20],
            "grip": [0, -45]
        }
    }
}


def update():
    with edit_catalog() as cat:
        # 1. engine_packs
        if PACK_NAME not in cat["engine_packs"]:
            cat["engine_packs"].append(PACK_NAME)

        # 2. backgrounds list
        for bg in NEW_BACKGROUNDS:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        for bg, spec in NEW_BACKGROUND_SPECS.items():
            cat["background_specs"][bg] = spec

        # 4. assets
        for asset, spec in NEW_ASSETS.items():
            cat["assets"][asset] = spec

    print(f"Catalog updated successfully for pack '{PACK_NAME}' ({len(NEW_ASSETS)} assets, {len(NEW_BACKGROUNDS)} backgrounds).")


if __name__ == "__main__":
    update()
