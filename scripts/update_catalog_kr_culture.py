import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT_PATH = ROOT / "bkt_web" / "static" / "remake_vector_catalog.json"

with open(CAT_PATH, "r", encoding="utf-8") as f:
    cat = json.load(f)

# 1. engine_packs
if "kr_culture" not in cat.get("engine_packs", []):
    cat["engine_packs"].append("kr_culture")

# 2. backgrounds
new_bgs = ["hanok_village", "joseon_palace_generic", "kr_market", "kr_school", "apartment_street"]
for bg in new_bgs:
    if bg not in cat["backgrounds"]:
        cat["backgrounds"].append(bg)

# 3. background_specs
specs = {
    "hanok_village": {
        "label": "Làng Hanok truyền thống",
        "theme": "home",
        "ground_y": 810
    },
    "joseon_palace_generic": {
        "label": "Cung điện Joseon chung chung",
        "theme": "garden",
        "ground_y": 810
    },
    "kr_market": {
        "label": "Chợ truyền thống Hàn Quốc",
        "theme": "market",
        "ground_y": 810
    },
    "kr_school": {
        "label": "Lớp học kiểu Hàn Quốc",
        "theme": "school",
        "ground_y": 810
    },
    "apartment_street": {
        "label": "Phố chung cư hiện đại Hàn Quốc",
        "theme": "street",
        "ground_y": 810
    }
}
for bg, spec in specs.items():
    cat["background_specs"][bg] = spec

# 4. assets
new_assets = {
    "hangul_brush_scroll": {
        "label": "Cuộn giấy cọ nét Huấn Dân Chính Âm",
        "group": "prop",
        "pack": "kr_culture",
        "topics": ["kr_culture", "history"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -96],
            "bottom": [0, 0],
            "grip": [0, -45],
            "scroll_top": [0, -90],
            "scroll_bottom": [0, 0]
        }
    },
    "yut_sticks": {
        "label": "Bộ que gỗ Yut Nori",
        "group": "prop",
        "pack": "kr_culture",
        "topics": ["kr_culture", "games"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -72],
            "grip": [0, -36],
            "center": [0, -36],
            "stick_1": [-16, -36],
            "stick_2": [-5, -36],
            "stick_3": [5, -36],
            "stick_4": [16, -36]
        }
    },
    "jegi": {
        "label": "Quả cầu đá cầu Jegichagi",
        "group": "prop",
        "pack": "kr_culture",
        "topics": ["kr_culture", "games"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -70],
            "grip": [0, -18],
            "tassel_top": [0, -70],
            "coin_base": [0, -6]
        }
    },
    "gourd": {
        "label": "Quả bầu hồ lô vàng khô",
        "group": "prop",
        "pack": "kr_culture",
        "topics": ["kr_culture", "folklore"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -76],
            "grip": [0, -40],
            "stem": [0, -72],
            "waist": [0, -44]
        }
    },
    "low_dining_table_kr": {
        "label": "Bàn ăn thấp Soban",
        "group": "furniture",
        "pack": "kr_culture",
        "topics": ["kr_culture", "daily_life"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -36],
            "surface": [0, -36],
            "grip": [42, -24],
            "grip_l": [-45, -24],
            "grip_r": [45, -24],
            "under": [0, -12]
        }
    },
    "sebae_cushion": {
        "label": "Đệm ngồi quỳ lạy Sebae",
        "group": "furniture",
        "pack": "kr_culture",
        "topics": ["kr_culture", "festivals"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -22],
            "surface": [0, -22],
            "center": [0, -11],
            "grip": [36, -11]
        }
    },
    "bokjumeoni": {
        "label": "Túi phúc ngũ sắc Bokjumeoni",
        "group": "prop",
        "pack": "kr_culture",
        "topics": ["kr_culture", "festivals"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -66],
            "grip": [0, -48],
            "pouch_center": [0, -24],
            "knot": [0, -44]
        }
    },
    "swallow": {
        "label": "Chim én",
        "group": "bird",
        "pack": "kr_culture",
        "topics": ["kr_culture", "animals"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -68],
            "mouth": [18, -48],
            "beak": [24, -48],
            "head": [12, -48],
            "body": [0, -35],
            "back": [0, -40],
            "tail": [-30, -15]
        }
    },
    "magpie": {
        "label": "Chim ác là",
        "group": "bird",
        "pack": "kr_culture",
        "topics": ["kr_culture", "animals"],
        "face": False,
        "anchors": {
            "root": [0, 0],
            "top": [0, -82],
            "mouth": [22, -62],
            "beak": [28, -62],
            "head": [15, -62],
            "body": [0, -45],
            "back": [0, -52],
            "tail": [-38, -32]
        }
    }
}
for asset_id, asset_def in new_assets.items():
    cat["assets"][asset_id] = asset_def

# 5. onggi_jar handles for carry_together
if "onggi_jar" in cat["assets"]:
    cat["assets"]["onggi_jar"]["anchors"]["grip_l"] = [-22, -32]
    cat["assets"]["onggi_jar"]["anchors"]["grip_r"] = [22, -32]

# 6. action bow
cat["actions"]["bow"] = {
    "description": "Cúi lạy chúc Tết (Sebae): quỳ gối, cúi gập người, hai tay trước trán",
    "actor_anchor": "root",
    "actors": [
        "chibi_boy",
        "chibi_chef",
        "chibi_dentist",
        "chibi_doctor",
        "chibi_farmer",
        "chibi_girl",
        "chibi_grandma",
        "chibi_grandpa",
        "chibi_kid",
        "chibi_nurse",
        "chibi_patient",
        "chibi_pharmacist",
        "chibi_teacher",
        "farmer",
        "farmer_woman"
    ],
    "targets": [],
    "motion": False,
    "channel": None,
    "hold": True,
    "pack": "kr_culture"
}

with open(CAT_PATH, "w", encoding="utf-8") as f:
    json.dump(cat, f, indent=2, ensure_ascii=False)

print(f"Updated catalog: {len(cat['assets'])} assets, {len(cat['backgrounds'])} backgrounds")
