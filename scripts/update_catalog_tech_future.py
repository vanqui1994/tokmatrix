"""Update vector catalog for tech_future pack (R11).
Idempotent script to register:
- engine_packs: tech_future
- backgrounds: data_center, smart_city, chip_fab_clean_room
- background_specs: specs for 3 backgrounds
- assets: friendly_robot, ai_chip, server_rack, undersea_cable, satellite_gps,
          lithium_battery, autonomous_car, quantum_computer, ai_chat_bubble, telecom_tower
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.catalog_edit import edit_catalog


def update_catalog():
    with edit_catalog() as cat:
        # 1. engine_packs
        if "tech_future" not in cat["engine_packs"]:
            cat["engine_packs"].append("tech_future")

        # 2. backgrounds
        new_bgs = [
            "data_center",
            "smart_city",
            "chip_fab_clean_room",
        ]
        for bg in new_bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        bg_specs = {
            "data_center": {
                "label": "Hyperscale enterprise server data center",
                "theme": "building",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["tech", "ai", "computers"]
            },
            "smart_city": {
                "label": "Futuristic eco smart city boulevard",
                "theme": "street",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["tech", "future", "city"]
            },
            "chip_fab_clean_room": {
                "label": "Semiconductor cleanroom fabrication facility",
                "theme": "building",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["tech", "semiconductor", "science"]
            }
        }
        for bg, spec in bg_specs.items():
            cat["background_specs"][bg] = spec

        # 4. assets
        new_assets = {
            "friendly_robot": {
                "label": "a friendly humanoid robot helper for turing test facial recognition and laundry",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "robot", "ai"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -88],
                    "hand_l": [-20, -42],
                    "hand_r": [20, -42],
                    "head": [0, -68]
                }
            },
            "ai_chip": {
                "label": "an AI neural processor chip for semiconductors cpu moore brain-computer interfaces and crispr",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "chip", "hardware"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -40],
                    "top": [0, -80],
                    "die": [0, -40],
                    "pin_l": [-34, -40],
                    "pin_r": [34, -40]
                }
            },
            "server_rack": {
                "label": "a datacenter server rack unit for supercomputers weather data desktop bug and meat",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "datacenter", "internet"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -92],
                    "leds": [17, -60],
                    "handle": [-24, -45]
                }
            },
            "undersea_cable": {
                "label": "an undersea fiber-optic cable for internet fiber oceans and cables",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "network", "cables"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -38],
                    "top": [0, -76],
                    "core": [0, -38],
                    "armor": [0, -38]
                }
            },
            "satellite_gps": {
                "label": "a GPS navigation satellite for starlink and navigation with solar and debris",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "satellite", "space"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -82],
                    "wing_l": [-44, -45],
                    "wing_r": [44, -45],
                    "antenna": [0, -18]
                }
            },
            "lithium_battery": {
                "label": "a rechargeable lithium battery cell and batteries",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "energy", "battery"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -42],
                    "top": [0, -84],
                    "cap_top": [0, -80],
                    "window": [0, -42]
                }
            },
            "autonomous_car": {
                "label": "an autonomous electric car self-driving vehicle for tesla and drones",
                "group": "vehicle",
                "pack": "tech_future",
                "topics": ["tech", "car", "ai"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -32],
                    "top": [0, -64],
                    "lidar": [0, -51],
                    "wheel_f": [24, -10],
                    "wheel_r": [-24, -10]
                }
            },
            "quantum_computer": {
                "label": "a quantum computer processor for quantum computing windows macos and fusion",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "quantum", "computer"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "top": [0, -94],
                    "top_flange": [0, -87],
                    "stage_2": [0, -62],
                    "stage_3": [0, -40],
                    "qpu": [0, -11]
                }
            },
            "ai_chat_bubble": {
                "label": "an AI chat bubble interface for chatgpt search language models and deepfakes",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "ai", "software"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -85],
                    "prompt": [-6, -64],
                    "response": [6, -28]
                }
            },
            "telecom_tower": {
                "label": "a 5G and 6G telecom cellular tower for networks noise-cancelling headphones and twin",
                "group": "prop",
                "pack": "tech_future",
                "topics": ["tech", "network", "telecom"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -48],
                    "top": [0, -96],
                    "antenna_top": [0, -88],
                    "dish": [-18, -48],
                    "beacon": [0, -94]
                }
            }
        }
        for asset_id, spec in new_assets.items():
            cat["assets"][asset_id] = spec


if __name__ == "__main__":
    update_catalog()
    print("tech_future catalog update completed successfully.")
