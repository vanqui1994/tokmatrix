import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT_PATH = ROOT / "bkt_web" / "static" / "remake_vector_catalog.json"

cat = json.loads(CAT_PATH.read_text(encoding="utf-8"))

# 1. engine_packs
for pack_id in ["space", "nature"]:
    if pack_id not in cat["engine_packs"]:
        cat["engine_packs"].append(pack_id)

# 2. backgrounds
new_bgs = [
    "space_orbit",
    "mars_surface",
    "water_cycle_valley",
    "volcano_island",
    "dig_site"
]
for bg in new_bgs:
    if bg not in cat["backgrounds"]:
        cat["backgrounds"].append(bg)

# 3. background_specs
bg_specs = {
    "space_orbit": {
        "label": "Quỹ đạo không gian nhìn về Trái Đất",
        "theme": "highland",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["space", "nature"]
    },
    "mars_surface": {
        "label": "Bề mặt Sao Hoả đỏ",
        "theme": "farm",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["space", "nature"]
    },
    "water_cycle_valley": {
        "label": "Thung lũng vòng tuần hoàn nước",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["nature", "daily_life"]
    },
    "volcano_island": {
        "label": "Đảo núi lửa nhiệt đới",
        "theme": "water",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["nature", "disaster"]
    },
    "dig_site": {
        "label": "Hố khai quật khảo cổ và cổ sinh",
        "theme": "highland",
        "ground_y": 810,
        "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
        "topics": ["nature", "ancient"]
    }
}
for bg, spec in bg_specs.items():
    cat["background_specs"][bg] = spec

# 4. assets
new_assets = {
    # Pack space
    "planet": {
        "label": "Hành tinh Hệ Mặt Trời",
        "group": "prop",
        "pack": "space",
        "topics": ["space", "nature"],
        "face": True,
        "face_scale": 0.5,
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "face": [0, -50],
            "top": [0, -94],
            "ring_l": [-56, -50],
            "ring_r": [56, -50]
        },
        "rest_pose": {
            "variant": "earth"
        }
    },
    "sun": {
        "label": "Mặt trời rực rỡ",
        "group": "prop",
        "pack": "space",
        "topics": ["space", "nature"],
        "face": True,
        "face_scale": 0.6,
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "face": [0, -50],
            "top": [0, -93],
            "ray_top": [0, -92],
            "ray_bottom": [0, -8],
            "ray_left": [-42, -50],
            "ray_right": [42, -50]
        }
    },
    "moon": {
        "label": "Mặt trăng các pha",
        "group": "prop",
        "pack": "space",
        "topics": ["space", "nature"],
        "face": True,
        "face_scale": 0.55,
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "face": [0, -50],
            "top": [0, -85],
            "crater": [-10, -58]
        },
        "rest_pose": {
            "phase": 0.5
        }
    },
    "comet": {
        "label": "Sao chổi băng bụi",
        "group": "prop",
        "pack": "space",
        "topics": ["space", "nature"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "nucleus": [16, -60],
            "tail": [-48, -25],
            "center": [0, -50],
            "top": [0, -74]
        }
    },
    "satellite": {
        "label": "Vệ tinh viễn thông nhân tạo",
        "group": "prop",
        "pack": "space",
        "topics": ["space", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "body": [0, -50],
            "panel_l": [-46, -50],
            "panel_r": [46, -50],
            "antenna": [2, -84],
            "top": [0, -85]
        }
    },
    "space_station": {
        "label": "Trạm không gian quốc tế",
        "group": "prop",
        "pack": "space",
        "topics": ["space", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "core": [0, -50],
            "dock": [0, -28],
            "panel_l": [-48, -50],
            "panel_r": [48, -50],
            "top": [0, -74]
        }
    },
    # Pack nature
    "cloud": {
        "label": "Đám mây thời tiết",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "weather"],
        "face": True,
        "face_scale": 0.5,
        "anchors": {
            "root": [0, 0],
            "center": [0, -52],
            "face": [0, -52],
            "top": [0, -74],
            "cloud_l": [-38, -52],
            "cloud_r": [38, -52],
            "rain_bottom": [0, -4]
        },
        "rest_pose": {
            "rain": 0.0,
            "storm": 0.0
        }
    },
    "raindrop_chibi": {
        "label": "Giọt nước tuần hoàn chibi",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "weather"],
        "face": True,
        "face_scale": 0.6,
        "anchors": {
            "root": [0, 0],
            "center": [0, -35],
            "face": [0, -32],
            "top": [0, -70],
            "hand_l": [-18, -28],
            "hand_r": [18, -28]
        }
    },
    "rainbow": {
        "label": "Cầu vồng 7 màu",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "weather"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "arc_top": [0, -88],
            "arc_left": [-88, 0],
            "arc_right": [88, 0],
            "center": [0, -44],
            "top": [0, -88]
        },
        "rest_pose": {
            "growth": 1.0
        }
    },
    "volcano": {
        "label": "Núi lửa địa chất",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "disaster"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "crater": [0, -62],
            "peak": [0, -62],
            "magma_chamber": [0, -20],
            "smoke_top": [0, -94],
            "top": [0, -94]
        },
        "rest_pose": {
            "cutaway": 0.0,
            "erupt": 0.0
        }
    },
    "earth_cutaway": {
        "label": "Mặt cắt cấu tạo Trái Đất",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "center": [0, -50],
            "crust": [0, -92],
            "mantle": [0, -72],
            "outer_core": [0, -62],
            "inner_core": [0, -50],
            "top": [0, -92]
        }
    },
    "fossil": {
        "label": "Hoá thạch khủng long",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "ancient"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "center": [0, -22],
            "bone": [0, -22],
            "surface": [0, -22],
            "top": [0, -44],
            "rock_base": [0, 0]
        },
        "rest_pose": {
            "exposed": 1.0
        }
    },
    "lever": {
        "label": "Đòn bẩy cơ học",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "fulcrum": [0, -26],
            "effort_point": [-38, -26],
            "load_point": [38, -26],
            "center": [0, -26],
            "top": [0, -53]
        },
        "rest_pose": {
            "tilt": 0.0
        }
    },
    "pulley": {
        "label": "Ròng rọc cơ học",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "wheel": [0, -78],
            "rope_pull": [-9, -40],
            "load": [9, -20],
            "top": [0, -88],
            "center": [0, -46]
        },
        "rest_pose": {
            "lift": 0.0
        }
    },
    "ramp": {
        "label": "Mặt phẳng nghiêng",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "bottom": [-40, 0],
            "top": [38, -44],
            "slope_mid": [-1, -22],
            "center": [-1, -22]
        }
    },
    "wheel_axle": {
        "label": "Bánh xe và trục",
        "group": "prop",
        "pack": "nature",
        "topics": ["nature", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "axle": [0, -44],
            "wheel_l": [-34, -44],
            "wheel_r": [34, -44],
            "center": [0, -44],
            "top": [0, -79]
        }
    }
}
for asset_id, spec in new_assets.items():
    cat["assets"][asset_id] = spec

# 5. actions
new_actions = {
    "evaporate": {
        "label": "Bốc hơi nước",
        "actors": ["raindrop_chibi"],
        "targets": [],
        "actor_anchor": "root",
        "motion": False,
        "channel": None,
        "hold": True,
        "pack": "nature",
        "topics": ["nature", "weather"]
    },
    "condense": {
        "label": "Ngưng tụ mây",
        "actors": ["cloud"],
        "targets": [],
        "actor_anchor": "center",
        "motion": False,
        "channel": None,
        "hold": True,
        "pack": "nature",
        "topics": ["nature", "weather"]
    }
}
for act_id, spec in new_actions.items():
    cat["actions"][act_id] = spec

if "fossil" not in cat["actions"]["dig"]["targets"]:
    cat["actions"]["dig"]["targets"].append("fossil")
cat["actions"]["dig"]["motion"] = False

for emote_actor in ["raindrop_chibi", "cloud", "planet", "sun", "moon"]:
    if emote_actor not in cat["actions"]["emote"]["actors"]:
        cat["actions"]["emote"]["actors"].append(emote_actor)

if "rocket" not in cat["actions"]["fly"]["actors"]:
    cat["actions"]["fly"]["actors"].append("rocket")

chibis = [k for k, v in cat["assets"].items() if v.get("group") == "chibi"]
for act in ["pick", "grip", "shake"]:
    if act in cat["actions"]:
        for c in chibis:
            if c not in cat["actions"][act]["actors"]:
                cat["actions"][act]["actors"].append(c)


# 6. pose_ranges
new_ranges = {
    "phase": [0.0, 1.0],
    "rain": [0.0, 1.0],
    "storm": [0.0, 1.0],
    "erupt": [0.0, 1.0],
    "exposed": [0.0, 1.0],
    "tilt": [-90.0, 90.0],
    "walk": [0.0, 1.0]
}
for field, rng in new_ranges.items():
    cat["pose_ranges"][field] = rng

cat["pose_defaults"]["fill"] = 0

CAT_PATH.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Đã cập nhật catalog thành công: {len(new_assets)} assets, {len(bg_specs)} backgrounds, {len(new_actions)} actions.")
