import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT_PATH = ROOT / "bkt_web" / "static" / "remake_vector_catalog.json"

cat = json.loads(CAT_PATH.read_text(encoding="utf-8"))

# 1. engine_packs
if "us_culture" not in cat["engine_packs"]:
    cat["engine_packs"].append("us_culture")

# 2. backgrounds
new_bgs = [
    "suburb_backyard",
    "national_park",
    "wild_west_town",
    "launch_pad",
    "pumpkin_patch",
    "moon_surface"
]
for bg in new_bgs:
    if bg not in cat["backgrounds"]:
        cat["backgrounds"].append(bg)

# 3. background_specs
bg_specs = {
    "suburb_backyard": {
        "label": "Sân sau khu ngoại ô Mỹ",
        "theme": "home",
        "ground_y": 810
    },
    "national_park": {
        "label": "Vườn quốc gia hẻm núi và thác nước",
        "theme": "nature",
        "ground_y": 810
    },
    "wild_west_town": {
        "label": "Thị trấn miền Tây hoang dã",
        "theme": "home",
        "ground_y": 810
    },
    "launch_pad": {
        "label": "Bệ phóng tên lửa bờ biển",
        "theme": "space",
        "ground_y": 810
    },
    "pumpkin_patch": {
        "label": "Cánh đồng bí ngô mùa thu",
        "theme": "farm",
        "ground_y": 810
    },
    "moon_surface": {
        "label": "Bề mặt Mặt Trăng với hố thiên thạch",
        "theme": "space",
        "ground_y": 810
    }
}
for bg, spec in bg_specs.items():
    cat["background_specs"][bg] = spec

# 4. assets
new_assets = {
    "bison": {
        "label": "Bò rừng bizon Bắc Mỹ",
        "group": "animal",
        "pack": "us_culture",
        "topics": ["us_culture", "nature"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -82],
            "head": [-38, -55],
            "mouth": [-52, -45],
            "horn": [-40, -74],
            "back": [10, -75],
            "hip": [32, -50],
            "tail": [50, -42],
            "eye": [-42, -55]
        }
    },
    "bear": {
        "label": "Gấu đen Bắc Mỹ thân thiện",
        "group": "animal",
        "pack": "us_culture",
        "topics": ["us_culture", "nature"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -82],
            "head": [0, -68],
            "mouth": [0, -58],
            "ear_l": [-18, -80],
            "ear_r": [18, -80],
            "chest": [0, -42],
            "hand_l": [-26, -35],
            "hand_r": [26, -35],
            "back": [0, -48],
            "surface": [0, -42]
        }
    },
    "prairie_dog": {
        "label": "Sóc thảo nguyên",
        "group": "animal",
        "pack": "us_culture",
        "topics": ["us_culture", "nature"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -56],
            "head": [0, -48],
            "mouth": [0, -42],
            "eye": [4, -48],
            "paw_l": [-8, -30],
            "paw_r": [8, -30],
            "chest": [0, -28],
            "back": [0, -32],
            "tail": [-14, -12]
        }
    },
    "raccoon": {
        "label": "Gấu mèo Bắc Mỹ",
        "group": "animal",
        "pack": "us_culture",
        "topics": ["us_culture", "nature"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -45],
            "head": [-18, -36],
            "mouth": [-28, -32],
            "eye": [-20, -36],
            "paw_l": [-8, -10],
            "paw_r": [12, -10],
            "back": [10, -32],
            "tail": [36, -20]
        }
    },
    "salmon": {
        "label": "Cá hồi hoang dã",
        "group": "animal",
        "pack": "us_culture",
        "topics": ["us_culture", "nature"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -35],
            "mouth": [-38, -18],
            "eye": [-28, -22],
            "tail": [38, -18],
            "dorsal": [-2, -34],
            "belly": [0, -6],
            "surface": [0, -18]
        }
    },
    "jack_o_lantern": {
        "label": "Đèn lồng bí ngô Halloween",
        "group": "prop",
        "pack": "us_culture",
        "topics": ["us_culture", "festivals"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -56],
            "stem": [0, -54],
            "mouth": [0, -22],
            "eye_l": [-12, -32],
            "eye_r": [12, -32],
            "grip": [0, -52],
            "surface": [0, -26]
        },
        "rest_pose": {
            "lit": 0.0
        }
    },
    "harvest_basket": {
        "label": "Giỏ thu hoạch mùa thu",
        "group": "container",
        "pack": "us_culture",
        "topics": ["us_culture", "farm"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -52],
            "handle": [0, -50],
            "grip": [0, -50],
            "grip_l": [-18, -48],
            "grip_r": [18, -48],
            "opening": [0, -28],
            "surface": [0, -16]
        },
        "rest_pose": {
            "fill": 0.0
        }
    },
    "lemonade_stand": {
        "label": "Quầy nước chanh gỗ",
        "group": "furniture",
        "pack": "us_culture",
        "topics": ["us_culture", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -96],
            "counter": [0, -48],
            "pitcher": [-18, -55],
            "cups": [18, -52],
            "surface": [0, -48]
        }
    },
    "mailbox": {
        "label": "Hộp thư kiểu Mỹ",
        "group": "furniture",
        "pack": "us_culture",
        "topics": ["us_culture", "jobs"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -92],
            "door": [16, -74],
            "flag": [-12, -78],
            "post": [0, -40],
            "grip": [16, -74],
            "surface": [0, -74]
        },
        "rest_pose": {
            "flag_up": 0.0,
            "open": 0.0
        }
    },
    "fire_hydrant": {
        "label": "Trụ nước cứu hoả",
        "group": "furniture",
        "pack": "us_culture",
        "topics": ["us_culture", "safety"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -68],
            "bonnet": [0, -62],
            "nozzle_l": [-18, -38],
            "nozzle_r": [18, -38],
            "nozzle_f": [0, -36],
            "grip": [0, -36],
            "surface": [0, -36]
        }
    },
    "liberty_statue_generic": {
        "label": "Tượng giơ ngọn đuốc tự do",
        "group": "building",
        "pack": "us_culture",
        "topics": ["us_culture", "fables"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -96],
            "torch": [16, -92],
            "tablet": [-14, -58],
            "crown": [0, -78],
            "head": [0, -74],
            "pedestal": [0, -25],
            "surface": [0, -48]
        },
        "rest_pose": {
            "growth": 1.0
        }
    },
    "railroad_track": {
        "label": "Đường ray xe lửa",
        "group": "building",
        "pack": "us_culture",
        "topics": ["us_culture", "inventions"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -18],
            "start": [-58, 0],
            "end": [58, 0],
            "rail_l": [0, -10],
            "rail_r": [0, -4],
            "surface": [0, -6]
        },
        "rest_pose": {
            "growth": 1.0
        }
    },
    "moon_footprint": {
        "label": "Dấu chân trên Mặt Trăng",
        "group": "prop",
        "pack": "us_culture",
        "topics": ["us_culture", "space"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -55],
            "surface": [0, -25],
            "center": [0, -25]
        }
    },
    "seismometer": {
        "label": "Thiết bị đo địa chấn Mặt Trăng",
        "group": "tool",
        "pack": "us_culture",
        "topics": ["us_culture", "space"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -38],
            "dish": [0, -34],
            "panel_l": [-28, -16],
            "panel_r": [28, -16],
            "surface": [0, -16]
        }
    }
}

for aid, adef in new_assets.items():
    cat["assets"][aid] = adef

# 5. actions
cat["actions"]["carve"] = {
    "label": "Khắc bề mặt bí ngô",
    "actors": [
        "chibi_boy", "chibi_girl", "chibi_farmer", "chibi_kid"
    ],
    "targets": ["pumpkin", "jack_o_lantern"],
    "actor_anchor": "hand_r",
    "target_anchor": "surface",
    "channel": "cutaway",
    "motion": False,
    "hold": True,
    "pack": "us_culture",
    "topics": ["us_culture", "festivals"]
}

cat["actions"]["fireworks"] = {
    "label": "Bắn pháo hoa rực rỡ",
    "actors": ["chibi_kid", "chibi_boy", "chibi_girl"],
    "targets": [],
    "actor_anchor": "root",
    "target_anchor": None,
    "channel": None,
    "motion": False,
    "hold": False,
    "pack": "us_culture",
    "topics": ["us_culture", "festivals"]
}

# 6. outfits alias: costume_witch
if "costume_witch" not in cat["outfits"]:
    cat["outfits"]["costume_witch"] = {
        "label": "Trang phục phù thuỷ",
        "warm": False,
        "era": "modern",
        "locale": "neutral",
        "topics": ["festivals", "fables", "us_culture"],
        "parts": {
            "head": "witch_hat",
            "top": "black_dress",
            "bottom": "purple_skirt",
            "shoes": "boots"
        }
    }

if "carry_together" in cat["actions"] and "harvest_basket" not in cat["actions"]["carry_together"]["targets"]:
    cat["actions"]["carry_together"]["targets"].append("harvest_basket")

if "carry" in cat["actions"] and "harvest_basket" not in cat["actions"]["carry"]["targets"]:
    cat["actions"]["carry"]["targets"].append("harvest_basket")

# 7. pose_ranges
cat["pose_ranges"]["flag_up"] = [0, 1]
# fill đã có pose_defaults 0 từ trước (bình, chai, ống tiêm dùng nó) — không được xoá, chỉ bỏ flag_up.
cat["pose_defaults"].pop("flag_up", None)

# Review phase S: chảo đãi vàng lấp lánh (gold_pan.glint, mặc định 0 = hình cũ) và cao bồi cưỡi ngựa (ride → horse.seat).
cat["pose_ranges"]["glint"] = [0, 1]
cat["assets"]["horse"]["anchors"]["seat_1"] = list(cat["assets"]["horse"]["anchors"]["seat"])  # anchor mặc định của ride
if "horse" not in cat["actions"]["ride"]["targets"]:
    cat["actions"]["ride"]["targets"].append("horse")

CAT_PATH.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Updated catalog successfully. Total assets: {len(cat['assets'])}, backgrounds: {len(cat['backgrounds'])}")
