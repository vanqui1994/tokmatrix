"""Cập nhật remake_vector_catalog.json cho gói body_more (Nhóm R12).

Sử dụng edit_catalog để an toàn khi nhiều agent chạy song song.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.catalog_edit import edit_catalog


PACK_NAME = "body_more"

NEW_ASSETS = {
    "regenerating_liver": {
        "label": "a regenerating liver",
        "group": "organ",
        "face": True,
        "face_scale": 0.55,
        "pack": PACK_NAME,
        "topics": ["medical", "body", "science"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -38],
            "face": [0, -42],
            "mouth": [-5, -38],
            "top": [0, -78],
            "hand_l": [-32, -32],
            "hand_r": [28, -28],
            "regrow_zone": [22, -38],
            "grip": [0, -38]
        }
    },
    "appendix_chibi": {
        "label": "an appendix chibi",
        "group": "organ",
        "face": True,
        "face_scale": 0.5,
        "pack": PACK_NAME,
        "topics": ["medical", "body", "science"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -36],
            "face": [0, -46],
            "mouth": [0, -41],
            "top": [0, -76],
            "hand_l": [-20, -38],
            "hand_r": [20, -42],
            "pouch": [0, -22],
            "grip": [0, -36]
        }
    },
    "neuron_chibi": {
        "label": "a neuron cell",
        "group": "organ",
        "face": True,
        "face_scale": 0.5,
        "pack": PACK_NAME,
        "topics": ["medical", "body", "science"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -48],
            "face": [0, -58],
            "mouth": [0, -55],
            "top": [0, -90],
            "soma": [0, -58],
            "dendrite_l": [-32, -76],
            "dendrite_r": [32, -76],
            "synapse": [0, -2],
            "grip": [0, -48]
        }
    },
    "fingerprint": {
        "label": "a fingerprint",
        "group": "prop",
        "face": False,
        "pack": PACK_NAME,
        "topics": ["medical", "science", "mystery"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "top": [0, -88],
            "core": [0, -50],
            "rim": [0, -86],
            "grip": [0, -46]
        }
    },
    "vaccine_training": {
        "label": "a vaccine training",
        "group": "prop",
        "face": True,
        "face_scale": 0.45,
        "pack": PACK_NAME,
        "topics": ["medical", "science", "body"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -42],
            "top": [0, -84],
            "vial": [-20, -35],
            "antibody": [20, -35],
            "shield": [36, -34],
            "face": [-20, -30],
            "grip": [0, -42]
        }
    },
    "fever_thermometer": {
        "label": "a fever thermometer",
        "group": "prop",
        "face": True,
        "face_scale": 0.45,
        "pack": PACK_NAME,
        "topics": ["medical", "health", "daily_life"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -90],
            "bulb": [0, -16],
            "face": [0, -16],
            "stem": [0, -60],
            "ice_pack": [0, -86],
            "grip": [0, -45]
        }
    },
    "fracture_healing_bone": {
        "label": "a healing bone fracture",
        "group": "organ",
        "face": True,
        "face_scale": 0.45,
        "pack": PACK_NAME,
        "topics": ["medical", "body", "health"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -43],
            "top": [0, -86],
            "face": [0, -62],
            "cast": [0, -41],
            "callus": [0, -43],
            "grip": [0, -43]
        }
    },
    "sleeping_brain": {
        "label": "a sleeping brain",
        "group": "organ",
        "face": True,
        "face_scale": 0.55,
        "pack": PACK_NAME,
        "topics": ["medical", "body", "science"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -42],
            "top": [0, -86],
            "face": [0, -38],
            "mouth": [0, -33],
            "nightcap": [14, -80],
            "pillow": [0, -6],
            "grip": [0, -42]
        }
    },
    "memory_cell_chibi": {
        "label": "a memory cell chibi",
        "group": "organ",
        "face": True,
        "face_scale": 0.5,
        "pack": PACK_NAME,
        "topics": ["medical", "body", "science"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -42],
            "top": [0, -82],
            "face": [0, -42],
            "mouth": [0, -40],
            "satchel": [-22, -36],
            "lens": [22, -38],
            "grip": [0, -40]
        }
    }
}

NEW_BACKGROUNDS = ["sleep_lab"]

NEW_BG_SPECS = {
    "sleep_lab": {
        "label": "Phòng nghiên cứu giấc ngủ",
        "theme": "interior",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["medical", "science", "daily_life"]
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
