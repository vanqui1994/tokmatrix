import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT_PATH = ROOT / "bkt_web" / "static" / "remake_vector_catalog.json"

cat = json.loads(CAT_PATH.read_text(encoding="utf-8"))

# 1. engine_packs
for p in ["ocean", "mysteries", "fables"]:
    if p not in cat["engine_packs"]:
        cat["engine_packs"].append(p)

# 2. backgrounds
new_bgs = [
    "coral_reef",
    "beach_cleanup",
    "deep_sea",
    "easter_island_generic",
    "stone_circle_field",
    "ruins_underwater"
]
for bg in new_bgs:
    if bg not in cat["backgrounds"]:
        cat["backgrounds"].append(bg)

# 3. background_specs
bg_specs = {
    "coral_reef": {
        "label": "Rạn san hô dưới nước",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ocean", "nature"]
    },
    "beach_cleanup": {
        "label": "Bãi biển dọn rác",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ocean", "environment"]
    },
    "deep_sea": {
        "label": "Đáy đại dương sâu",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["ocean", "nature"]
    },
    "easter_island_generic": {
        "label": "Đồi cỏ đảo Phục Sinh chung chung",
        "theme": "highland",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["history", "mystery"]
    },
    "stone_circle_field": {
        "label": "Cánh đồng cự thạch Stonehenge",
        "theme": "highland",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["history", "mystery"]
    },
    "ruins_underwater": {
        "label": "Tàn tích Atlantis dưới đáy biển",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["history", "ocean"]
    }
}
for bg, spec in bg_specs.items():
    cat["background_specs"][bg] = spec

# 4. assets
new_assets = {
    # Ocean (9)
    "sea_turtle": {
        "label": "Rùa biển (Sea Turtle)",
        "group": "animal",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "head": [45, -35],
            "mouth": [54, -33],
            "face": [45, -35],
            "back": [0, -48],
            "top": [0, -52],
            "belly": [0, -18],
            "tail": [-45, -30],
            "grip": [0, -35]
        }
    },
    "jellyfish": {
        "label": "Sứa biển phát quang (Jellyfish)",
        "group": "animal",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -75],
            "mouth": [0, -45],
            "face": [0, -50],
            "grip": [0, -35]
        }
    },
    "octopus": {
        "label": "Bạch tuộc đại dương (Octopus)",
        "group": "animal",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "head": [0, -55],
            "mouth": [0, -32],
            "top": [0, -70],
            "tentacle_l": [-35, -10],
            "tentacle_r": [35, -10],
            "grip": [0, -25]
        }
    },
    "whale": {
        "label": "Cá voi xanh khổng lồ (Whale)",
        "group": "animal",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "head": [50, -30],
            "mouth": [65, -25],
            "eye": [45, -35],
            "blowhole": [15, -48],
            "top": [0, -52],
            "back": [0, -48],
            "belly": [0, -12],
            "fluke": [-60, -30],
            "grip": [0, -30]
        }
    },
    "seal": {
        "label": "Hải cẩu đáng yêu (Seal)",
        "group": "animal",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -30],
            "head": [32, -38],
            "nose": [42, -36],
            "mouth": [40, -32],
            "face": [32, -38],
            "eye": [30, -42],
            "back": [-5, -42],
            "top": [0, -48],
            "tail": [-42, -15],
            "grip": [0, -25]
        }
    },
    "coral": {
        "label": "Rạn san hô rực rỡ (Coral)",
        "group": "prop",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "nature"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -40],
            "top": [0, -75],
            "branch_l": [-30, -55],
            "branch_r": [30, -55],
            "grip": [0, -35]
        }
    },
    "seaweed": {
        "label": "Rong biển khổng lồ (Seaweed)",
        "group": "prop",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "nature"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -45],
            "top": [0, -82],
            "leaf_l": [-22, -50],
            "leaf_r": [22, -50],
            "grip": [0, -35]
        }
    },
    "anglerfish": {
        "label": "Cá vây chân đáy biển (Anglerfish)",
        "group": "animal",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "head": [25, -35],
            "mouth": [35, -30],
            "esca": [32, -62],
            "eye": [20, -44],
            "top": [15, -68],
            "tail": [-38, -35],
            "grip": [0, -30]
        }
    },
    "plastic_bag": {
        "label": "Túi nilon rác biển (Plastic Bag)",
        "group": "prop",
        "face": False,
        "pack": "ocean",
        "topics": ["ocean", "environment"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -40],
            "top": [0, -72],
            "grip": [0, -40],
            "handle_l": [-24, -64],
            "handle_r": [24, -64],
            "opening": [0, -16]
        }
    },

    # Mysteries (3 new rigs in pack mysteries, moai_generic & standing_stones reused from buildings pack)
    "sunken_ship": {
        "label": "Xác tàu đắm cổ đại (Sunken Ship)",
        "group": "vehicle",
        "face": False,
        "pack": "mysteries",
        "topics": ["history", "ocean"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "bow": [45, -35],
            "stern": [-45, -35],
            "deck": [0, -35],
            "mast": [-10, -72],
            "top": [0, -75],
            "grip": [0, -25]
        }
    },
    "atlantis_ruins": {
        "label": "Tàn tích thành phố chìm Atlantis (Atlantis Ruins)",
        "group": "building",
        "face": False,
        "pack": "mysteries",
        "topics": ["history", "ocean"],
        "rest_pose": {"growth": 1},
        "anchors": {
            "root": [0, 0],
            "center": [0, -40],
            "top": [0, -78],
            "base": [0, -8],
            "column_l": [-25, -40],
            "column_r": [25, -40],
            "arch": [0, -68],
            "grip": [0, -35]
        }
    },
    "excavation_grid": {
        "label": "Lưới dây khảo cổ (Excavation Grid)",
        "group": "prop",
        "face": False,
        "pack": "mysteries",
        "topics": ["history", "science"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -20],
            "top": [0, -38],
            "stake_tl": [-40, -30],
            "stake_tr": [40, -30],
            "stake_bl": [-40, -5],
            "stake_br": [40, -5],
            "grip": [0, -15]
        }
    },

    # Fables (3)
    "grasshopper": {
        "label": "Châu chấu kéo vĩ cầm (Grasshopper)",
        "group": "animal",
        "face": False,
        "pack": "fables",
        "topics": ["fable", "wildlife"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -30],
            "head": [20, -38],
            "face": [20, -38],
            "mouth": [25, -32],
            "eye": [18, -42],
            "top": [20, -58],
            "hand_r": [12, -28],
            "hand_l": [4, -28],
            "violin": [8, -26],
            "bow": [14, -26],
            "back": [-12, -35],
            "grip": [0, -25]
        }
    },
    "tortoise": {
        "label": "Rùa cạn chậm rãi (Tortoise)",
        "group": "animal",
        "face": False,
        "pack": "fables",
        "topics": ["fable", "animal"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -25],
            "head": [36, -26],
            "face": [36, -26],
            "mouth": [42, -24],
            "eye": [34, -28],
            "back": [0, -42],
            "top": [0, -46],
            "tail": [-35, -14],
            "grip": [0, -22]
        }
    },
    "city_mouse": {
        "label": "Chuột thành phố thanh lịch (City Mouse)",
        "group": "animal",
        "face": True,
        "face_scale": 0.42,  # đầu bầu dục nhỏ 22×18 (tâm 16,−34); mặt mặc định to hơn cả đầu
        "pack": "fables",
        "topics": ["fable", "animal"],
        "anchors": {
            "root": [0, 0],
            "center": [0, -28],
            "head": [16, -34],
            "face": [19, -34],
            "mouth": [30, -32],
            "ear_l": [10, -45],
            "ear_r": [21, -46],
            "back": [-4, -30],
            "tail": [-38, -10],
            "hand_r": [16, -20],
            "hand_l": [4, -20],
            "cane": [22, -10],
            "top": [15, -56],
            "grip": [0, -22]
        }
    }
}
for asset_id, spec in new_assets.items():
    cat["assets"][asset_id] = spec

# Ensure moai_generic has hitch anchor for hauling
if "moai_generic" in cat["assets"]:
    if "anchors" in cat["assets"]["moai_generic"] and "hitch" not in cat["assets"]["moai_generic"]["anchors"]:
        cat["assets"]["moai_generic"]["anchors"]["hitch"] = [0, -15]

# 5. Actions updates
# sort
if "sort" in cat.get("actions", {}):
    if "plastic_bag" not in cat["actions"]["sort"].get("actors", []):
        cat["actions"]["sort"]["actors"].append("plastic_bag")

# haul
if "haul" in cat.get("actions", {}):
    if "moai_generic" not in cat["actions"]["haul"].get("targets", []):
        cat["actions"]["haul"]["targets"].append("moai_generic")

# swim
if "swim" in cat.get("actions", {}):
    for sw in ["sea_turtle", "whale", "seal", "octopus", "jellyfish", "anglerfish"]:
        if sw not in cat["actions"]["swim"].get("targets", []):
            cat["actions"]["swim"]["targets"].append(sw)

# emote
if "emote" in cat.get("actions", {}):
    for em in ["sea_turtle", "whale", "seal", "octopus", "jellyfish", "anglerfish", "tortoise", "grasshopper", "city_mouse", "fox"]:
        if em not in cat["actions"]["emote"].get("actors", []):
            cat["actions"]["emote"]["actors"].append(em)

# hop
if "hop" in cat.get("actions", {}):
    for hp in ["fox", "grasshopper"]:
        if hp not in cat["actions"]["hop"].get("actors", []):
            cat["actions"]["hop"]["actors"].append(hp)

# ensure ant is not in carry actors since ant uses grip anchor
if "carry" in cat.get("actions", {}) and "ant" in cat["actions"]["carry"].get("actors", []):
    cat["actions"]["carry"]["actors"].remove("ant")

# 6. Pose ranges and defaults
if "pose_ranges" in cat:
    if "bleached" not in cat["pose_ranges"]:
        cat["pose_ranges"]["bleached"] = [0, 1]
    if "spout" not in cat["pose_ranges"]:
        cat["pose_ranges"]["spout"] = [0, 1]
    if "lit" not in cat["pose_ranges"]:
        cat["pose_ranges"]["lit"] = [0, 1]
    if "fiddle" not in cat["pose_ranges"]:
        cat["pose_ranges"]["fiddle"] = [0, 1]

if "pose_defaults" in cat:
    if "bleached" not in cat["pose_defaults"]:
        cat["pose_defaults"]["bleached"] = 0
    if "spout" not in cat["pose_defaults"]:
        cat["pose_defaults"]["spout"] = 0
    if "lit" not in cat["pose_defaults"]:
        cat["pose_defaults"]["lit"] = 1
    if "fiddle" not in cat["pose_defaults"]:
        cat["pose_defaults"]["fiddle"] = 0

CAT_PATH.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Updated catalog successfully for Phase U. Total assets: {len(cat['assets'])}, backgrounds: {len(cat['backgrounds'])}")
