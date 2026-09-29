import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT_PATH = ROOT / "bkt_web" / "static" / "remake_vector_catalog.json"

cat = json.loads(CAT_PATH.read_text(encoding="utf-8"))

# 1. engine_packs
if "medieval" not in cat["engine_packs"]:
    cat["engine_packs"].append("medieval")

# 2. backgrounds
new_bgs = ["castle_yard", "medieval_village", "viking_fjord"]
for bg in new_bgs:
    if bg not in cat["backgrounds"]:
        cat["backgrounds"].append(bg)

# 3. background_specs
bg_specs = {
    "castle_yard": {
        "label": "Sân trong lâu đài trung cổ",
        "theme": "home",
        "ground_y": 810
    },
    "medieval_village": {
        "label": "Làng trung cổ châu Âu",
        "theme": "home",
        "ground_y": 810
    },
    "viking_fjord": {
        "label": "Vịnh hẹp Viking Fjord",
        "theme": "water",
        "ground_y": 810
    }
}
for bg, spec in bg_specs.items():
    cat["background_specs"][bg] = spec

# 4. assets
new_assets = {
    "well": {
        "label": "Giếng nước đá trung cổ",
        "group": "furniture",
        "pack": "medieval",
        "topics": ["medieval", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -92],
            "surface": [0, -42],
            "opening": [0, -42],
            "bucket": [0, -40],
            "crank": [32, -60]
        },
        "rest_pose": {
            "lift": 1.0
        }
    },
    "anvil": {
        "label": "Đe thợ rèn",
        "group": "furniture",
        "pack": "medieval",
        "topics": ["medieval", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -52],
            "surface": [6, -50],
            "horn": [-34, -50],
            "base": [0, -22]
        }
    },
    "forge": {
        "label": "Lò rèn truyền thống",
        "group": "furniture",
        "pack": "medieval",
        "topics": ["medieval", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -95],
            "hearth": [0, -42],
            "fire": [0, -44],
            "chimney": [0, -90],
            "bellows": [42, -45]
        },
        "rest_pose": {
            "lit": 1.0
        }
    },
    "horseshoe": {
        "label": "Móng ngựa sắt",
        "group": "tool",
        "pack": "medieval",
        "topics": ["medieval", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -48],
            "grip": [0, -25],
            "center": [0, -25],
            "toe": [0, -48],
            "heel_l": [-18, -6],
            "heel_r": [18, -6]
        }
    },
    "spinning_wheel": {
        "label": "Xa quay sợi gỗ",
        "group": "furniture",
        "pack": "medieval",
        "topics": ["medieval", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -84],
            "wheel": [-16, -52],
            "spindle": [24, -45],
            "pedal": [-8, -6],
            "grip": [24, -45]
        }
    },
    "wool_basket": {
        "label": "Giỏ mây đựng len",
        "group": "container",
        "pack": "medieval",
        "topics": ["medieval", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -48],
            "grip": [0, -46],
            "center": [0, -22]
        }
    },
    "banner_plain": {
        "label": "Cờ đuôi nheo trung cổ",
        "group": "tool",
        "pack": "medieval",
        "topics": ["medieval", "fables"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -98],
            "pole_top": [0, -98],
            "grip": [0, -42],
            "cloth_center": [24, -70]
        }
    },
    "star_compass_viking": {
        "label": "Đĩa định hướng mặt trời Viking",
        "group": "tool",
        "pack": "medieval",
        "topics": ["medieval", "ocean"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -50],
            "center": [0, -25],
            "grip": [0, -8],
            "gnomon": [0, -25]
        }
    },
    "viking_longhouse": {
        "label": "Nhà dài Viking",
        "group": "building",
        "pack": "medieval",
        "topics": ["medieval", "fables"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -94],
            "roof_top": [0, -94],
            "door": [0, -18],
            "chimney": [0, -88],
            "surface": [0, -45]
        },
        "rest_pose": {
            "growth": 1.0
        }
    }
}

for aid, adef in new_assets.items():
    cat["assets"][aid] = adef

# 5. actions
cat["actions"]["hammer_anvil"] = {
    "label": "Gõ búa rèn trên đe",
    "actors": [
        "chibi_boy", "chibi_chef", "chibi_dentist", "chibi_doctor", "chibi_farmer",
        "chibi_girl", "chibi_grandma", "chibi_grandpa", "chibi_kid", "chibi_nurse",
        "chibi_patient", "chibi_pharmacist", "chibi_teacher", "farmer", "farmer_woman"
    ],
    "targets": ["anvil"],
    "actor_anchor": "hand_r",
    "target_anchor": "surface",
    "channel": None,
    "motion": False,
    "hold": False,
    "pack": "medieval",
    "topics": ["medieval", "jobs"]
}

# 6. pose_ranges for medieval animatable fields
cat["pose_ranges"]["lift"] = [0, 1]
cat["pose_ranges"]["spin"] = [-3600, 3600]
cat["pose_ranges"]["hot"] = [0, 1]
for k in ("lift", "spin", "hot"):
    cat["pose_defaults"].pop(k, None)

CAT_PATH.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Updated catalog successfully. Total assets: {len(cat['assets'])}, backgrounds: {len(cat['backgrounds'])}")
