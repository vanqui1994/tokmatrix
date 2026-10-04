"""Update vector catalog for Phase V: Apocalypse & Survival (wasteland, zombies, survival_kit).
Idempotent script to register:
- engine_packs: wasteland, zombies, survival_kit
- backgrounds: 6 wasteland backgrounds
- background_specs: specs for 6 backgrounds
- assets: 12 wasteland rigs + 9 survival_kit rigs = 21 rigs
- outfits: survivor_jacket, survivor_hoodie, survivor_hoodie_purple, torn
- expressions: dazed
- pose_ranges & pose_defaults: decay, zombie, cured, boil, clarity, crank, powered
- actions: shamble, chase_slow, distract, cure_spray, purify_water, crank_radio, signal, scavenge, barricade
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT_PATH = ROOT / "bkt_web" / "static" / "remake_vector_catalog.json"

cat = json.loads(CAT_PATH.read_text(encoding="utf-8"))

# 1. engine_packs
for p in ["wasteland", "zombies", "survival_kit"]:
    if p not in cat["engine_packs"]:
        cat["engine_packs"].append(p)

# 2. backgrounds
new_bgs = [
    "abandoned_street",
    "overgrown_plaza",
    "rooftop_garden",
    "subway_tunnel",
    "flooded_downtown",
    "safe_camp",
]
for bg in new_bgs:
    if bg not in cat["backgrounds"]:
        cat["backgrounds"].append(bg)

# 3. background_specs
bg_specs = {
    "abandoned_street": {
        "label": "Phố cũ bỏ hoang",
        "theme": "street",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["apocalypse", "survival", "city"]
    },
    "overgrown_plaza": {
        "label": "Quảng trường cây mọc hoang",
        "theme": "street",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["apocalypse", "survival", "nature"]
    },
    "rooftop_garden": {
        "label": "Vườn sân thượng sinh tồn",
        "theme": "building",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["apocalypse", "survival", "farming"]
    },
    "subway_tunnel": {
        "label": "Đường hầm tàu điện ngầm",
        "theme": "building",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["apocalypse", "survival", "underground"]
    },
    "flooded_downtown": {
        "label": "Khu phố ngập nước",
        "theme": "water",
        "ground_y": 810,
        "open_water": True,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["apocalypse", "survival", "flood"]
    },
    "safe_camp": {
        "label": "Căn cứ trại an toàn",
        "theme": "street",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["apocalypse", "survival", "camp"]
    }
}
for bg, spec in bg_specs.items():
    cat["background_specs"][bg] = spec

# 4. assets (12 wasteland + 9 survival_kit = 21 assets)
new_assets = {
    # Wasteland (12)
    "barricade_boards": {
        "label": "Ván gỗ gia cố chốt cửa (Barricade boards)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -70],
            "surface": [0, -35],
            "board_1": [-15, -20],
            "board_2": [10, -45],
            "grip": [0, -35]
        }
    },
    "rain_barrel_filter": {
        "label": "Thùng lọc hứng nước mưa (Rain barrel filter)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "water"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -85],
            "opening": [0, -80],
            "spigot": [18, -20],
            "surface": [0, -45]
        }
    },
    "solar_panel_small": {
        "label": "Tấm pin năng lượng mặt trời (Solar panel)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "energy"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -65],
            "plug": [15, -15],
            "surface": [0, -35]
        }
    },
    "tent": {
        "label": "Lều dã ngoại sinh tồn (Survival tent)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "camp"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -75],
            "door": [0, -25],
            "inside": [0, -20],
            "surface": [0, -40]
        }
    },
    "sleeping_bag": {
        "label": "Túi ngủ ấm (Sleeping bag)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "camp"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -25],
            "pillow": [-25, -20],
            "foot": [25, -10],
            "surface": [0, -12]
        }
    },
    "vine_wall": {
        "label": "Tường bê tông phủ dây leo (Vine wall)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "nature"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -90],
            "surface": [0, -45]
        }
    },
    "street_lamp_old": {
        "label": "Cột đèn đường cũ nghiêng (Old street lamp)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "city"],
        "anchors": {
            "root": [0, 0],
            "top": [12, -95],
            "lamp": [15, -85],
            "surface": [0, -50]
        }
    },
    "shopping_cart": {
        "label": "Xe đẩy hàng chở đồ (Shopping cart)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -60],
            "handle": [-28, -52],
            "basket": [5, -35],
            "grip": [-28, -52],
            "wheel_f": [24, 0],
            "wheel_r": [-22, 0]
        }
    },
    "canned_food_stack": {
        "label": "Chồng đồ hộp dự trữ (Canned food stack)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "food"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -40],
            "grip": [0, -20],
            "surface": [0, -20]
        }
    },
    "water_filter_bottle": {
        "label": "Bình nước có lõi lọc (Water filter bottle)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "water"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -45],
            "grip": [0, -22],
            "mouth": [0, -42]
        }
    },
    "signal_mirror": {
        "label": "Gương phát tín hiệu cứu hộ (Signal mirror)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "signal"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -35],
            "grip": [0, -10],
            "mirror": [0, -25]
        }
    },
    "walkie_talkie": {
        "label": "Bộ đàm cầm tay liên lạc (Walkie talkie)",
        "group": "prop",
        "face": False,
        "pack": "wasteland",
        "topics": ["apocalypse", "survival", "signal"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -60],
            "grip": [0, -22],
            "antenna": [8, -58],
            "speaker": [0, -28]
        }
    },

    # Survival Kit (9)
    "water_pot_boiling": {
        "label": "Nồi nước đun sôi khử trùng (Boiling water pot)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival", "water"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -35],
            "rim": [0, -30],
            "handle_l": [-26, -24],
            "handle_r": [26, -24],
            "surface": [0, -18]
        }
    },
    "cloth_filter": {
        "label": "Vải lọc nước cát than (Cloth filter)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival", "water"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -50],
            "opening": [0, -48],
            "drip": [0, -2],
            "surface": [0, -25]
        }
    },
    "firewood_bundle": {
        "label": "Bó củi bổ sẵn (Firewood bundle)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival", "camp"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -35],
            "surface": [0, -20],
            "log_top": [0, -32],
            "grip": [0, -20]
        }
    },
    "fishing_rod_simple": {
        "label": "Cần câu trúc sinh tồn (Simple fishing rod)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival", "food"],
        "anchors": {
            "root": [0, 0],
            "top": [35, -85],
            "grip": [-20, -10],
            "tip": [35, -85],
            "hook": [35, -15]
        }
    },
    "snare_free": {
        "label": "Bẫy sinh tồn để ngỏ (Open snare loop)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -25],
            "peg": [-15, 0],
            "loop": [10, -12]
        }
    },
    "seed_tray": {
        "label": "Khay ươm hạt mầm sinh tồn (Seed sprout tray)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival", "farming"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -22],
            "sprouts": [0, -18],
            "surface": [0, -10]
        }
    },
    "hand_crank_radio": {
        "label": "Đài khẩn cấp quay tay dynamo (Hand crank radio)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival", "signal"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -48],
            "grip": [-18, -20],
            "crank": [16, -25],
            "antenna": [-12, -45]
        }
    },
    "sos_stones": {
        "label": "Đá xếp tín hiệu SOS hình học (SOS stones)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["survival", "signal"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -20],
            "center": [0, -10]
        }
    },
    "cure_sprayer": {
        "label": "Bình xịt thuốc giải sương mù (Cure mist sprayer)",
        "group": "prop",
        "face": False,
        "pack": "survival_kit",
        "topics": ["apocalypse", "survival", "cure"],
        "anchors": {
            "root": [0, 0],
            "top": [0, -55],
            "grip": [-12, -22],
            "nozzle": [26, -38],
            "tank": [-10, -25]
        }
    }
}
for asset_id, spec in new_assets.items():
    cat["assets"][asset_id] = spec

# 5. Outfits
if "outfits" not in cat:
    cat["outfits"] = {}

cat["outfits"]["survivor_jacket"] = {
    "label": "Áo khoác sinh tồn cam (Survivor jacket)",
    "parts": {
        "top": "survivor_jacket",
        "bottom": "work_pants",
        "shoes": "boots"
    },
    "topics": ["survival", "adventure"]
}
cat["outfits"]["survivor_hoodie"] = {
    "label": "Áo hoodie sinh tồn kèm balo đỏ (Survivor hoodie)",
    "parts": {
        "top": "survivor_hoodie",
        "bottom": "work_pants",
        "shoes": "boots",
        "back": "red_backpack"
    },
    "topics": ["survival", "adventure"]
}
cat["outfits"]["survivor_hoodie_purple"] = {
    "label": "Áo hoodie sinh tồn tím (Survivor purple hoodie)",
    "parts": {
        "top": "survivor_hoodie_purple",
        "bottom": "work_pants",
        "shoes": "boots"
    },
    "topics": ["survival", "adventure"]
}
cat["outfits"]["torn"] = {
    "label": "Trang phục rách tả tơi (Torn survivor clothes)",
    "parts": {
        "top": "torn_top",
        "bottom": "torn_pants",
        "shoes": "boots"
    },
    "topics": ["survival", "drama"]
}

# 6. Expressions
if "expressions" in cat:
    if "dazed" not in cat["expressions"]:
        cat["expressions"].append("dazed")

# 7. Pose ranges & defaults
if "pose_ranges" in cat:
    ranges = {
        "decay": [0, 1],
        "zombie": [0, 1],
        "cured": [0, 1],
        "boil": [0, 1],
        "clarity": [0, 1],
        "crank": [0, 1],
        "powered": [0, 1],
        "signal": [0, 1]
    }
    for k, v in ranges.items():
        cat["pose_ranges"][k] = v

if "pose_defaults" in cat:
    defaults = {
        "decay": 0,
        "zombie": 0,
        "cured": 0,
        "boil": 0,
        "clarity": 1,
        "crank": 0,
        "powered": 0,
        "signal": 0
    }
    for k, v in defaults.items():
        cat["pose_defaults"][k] = v

# 8. Actions
if "actions" not in cat:
    cat["actions"] = {}

human_actors = ["chibi_boy", "chibi_girl", "chibi_kid", "chibi_grandpa", "chibi_teacher", "farmer", "farmer_woman"]

# Clean up any legacy farmer_man in actions if present
for act_data in cat.get("actions", {}).values():
    if "actors" in act_data and "farmer_man" in act_data["actors"]:
        act_data["actors"] = [("farmer" if a == "farmer_man" else a) for a in act_data["actors"]]
        # deduplicate while preserving order
        act_data["actors"] = list(dict.fromkeys(act_data["actors"]))

cat["actions"]["shamble"] = {
    "label": "Bước đi lảo đảo (Shamble)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": human_actors,
    "targets": [],
    "actor_anchor": "root",
    "target_anchor": "root"
}
cat["actions"]["chase_slow"] = {
    "label": "Đuổi theo chậm giữ khoảng cách (Chase slow)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": human_actors,
    "targets": human_actors + ["dog"],
    "actor_anchor": "root",
    "target_anchor": "root"
}
cat["actions"]["distract"] = {
    "label": "Đánh lạc hướng tiếng động (Distract)",
    "motion": False,
    "hold": False,
    "channel": None,
    "actors": human_actors,
    "targets": ["can", "shopping_cart", "canned_food_stack"],
    "actor_anchor": "hand_r",
    "target_anchor": "grip"
}
cat["actions"]["cure_spray"] = {
    "label": "Phun sương thuốc giải (Cure spray)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": ["chibi_teacher", "chibi_girl", "chibi_boy", "farmer_woman"],
    "targets": human_actors,
    "actor_anchor": "hand_r",
    "target_anchor": "top"
}
cat["actions"]["purify_water"] = {
    "label": "Lọc và đun nước sạch (Purify water)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": ["cloth_filter", "chibi_girl", "chibi_boy", "chibi_kid", "farmer_woman"],
    "targets": ["water_pot_boiling", "rain_barrel_filter"],
    "actor_anchor": "root",
    "target_anchor": "surface"
}
cat["actions"]["crank_radio"] = {
    "label": "Quay tay phát điện dynamo (Crank radio)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": ["chibi_kid", "chibi_boy", "chibi_girl", "farmer"],
    "targets": ["hand_crank_radio"],
    "actor_anchor": "hand_r",
    "target_anchor": "crank"
}
cat["actions"]["signal"] = {
    "label": "Phát tín hiệu SOS (Signal SOS)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": human_actors,
    "targets": ["signal_mirror", "flashlight"],
    "actor_anchor": "hand_r",
    "target_anchor": "grip"
}
cat["actions"]["scavenge"] = {
    "label": "Tìm kiếm đồ đạc (Scavenge)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": human_actors,
    "targets": ["shopping_cart", "crate", "car", "city_bus"],
    "actor_anchor": "hand_r",
    "target_anchor": "grip"
}
cat["actions"]["barricade"] = {
    "label": "Gia cố chốt cửa (Barricade)",
    "motion": False,
    "hold": True,
    "channel": None,
    "actors": ["chibi_grandpa", "chibi_boy", "farmer"],
    "targets": ["barricade_boards"],
    "actor_anchor": "hand_r",
    "target_anchor": "grip"
}

# Ensure take_cover keeps original targets (requiring anchor 'under')
if "take_cover" in cat["actions"]:
    cat["actions"]["take_cover"]["targets"] = ["desk", "kotatsu", "low_table", "table"]

if "emote" in cat["actions"]:
    for ac in human_actors + ["dog"]:
        if ac not in cat["actions"]["emote"].get("actors", []):
            cat["actions"]["emote"]["actors"].append(ac)

if "style_colors" in cat:
    for sc in ["hair", "pants", "shoes"]:
        if sc not in cat["style_colors"]:
            cat["style_colors"].append(sc)

CAT_PATH.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Updated catalog successfully for Phase V. Total assets: {len(cat['assets'])}, backgrounds: {len(cat['backgrounds'])}")
