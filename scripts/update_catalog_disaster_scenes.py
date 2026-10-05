"""Update vector catalog for disaster_scenes pack (R10).
Idempotent script to register:
- engine_packs: disaster_scenes
- backgrounds: coastal_town, ash_sky_city, dust_bowl_farm
- background_specs: specs for 3 backgrounds
- assets: meteor_impact, tsunami_wave, supervolcano, earthquake_fissure, smoke_plume,
          dust_storm_wall, warning_beacon, rescue_vehicle, flood_sandbags, cartoon_microbe
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
        if "disaster_scenes" not in cat["engine_packs"]:
            cat["engine_packs"].append("disaster_scenes")

        # 2. backgrounds
        new_bgs = [
            "coastal_town",
            "ash_sky_city",
            "dust_bowl_farm",
        ]
        for bg in new_bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        bg_specs = {
            "coastal_town": {
                "label": "Fortified coastal seaside town",
                "theme": "water",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["disaster", "ocean", "coastal"]
            },
            "ash_sky_city": {
                "label": "Metropolitan city under ash overcast sky",
                "theme": "street",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["disaster", "city", "atmosphere"]
            },
            "dust_bowl_farm": {
                "label": "Windswept prairie farm in dust storm",
                "theme": "farm",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["disaster", "nature", "storm"]
            }
        }
        for bg, spec in bg_specs.items():
            cat["background_specs"][bg] = spec

        # 4. assets
        new_assets = {
            "meteor_impact": {
                "label": "a giant asteroid meteor impact for chicxulub and tunguska event",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "space", "catastrophe"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -85],
                    "rock": [12, -32],
                    "tail": [-15, -55],
                    "shockwave": [28, -28]
                }
            },
            "tsunami_wave": {
                "label": "a massive tsunami ocean wave for storegga slide and sea flood",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "ocean", "water"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -88],
                    "crest": [18, -82],
                    "foam": [24, -75],
                    "base_l": [-42, 0],
                    "base_r": [42, 0]
                }
            },
            "supervolcano": {
                "label": "a supervolcano caldera eruption for krakatoa tambora toba yellowstone helens laki and summer",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "volcano", "nature"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -92],
                    "crater": [0, -48],
                    "ash_top": [0, -86],
                    "flank_l": [-45, 0],
                    "flank_r": [45, 0]
                }
            },
            "earthquake_fissure": {
                "label": "an earthquake ground fissure fault for kanto lisbon messina tangshan and kobe",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "earthquake", "geology"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -25],
                    "top": [0, -50],
                    "chasm": [0, -18],
                    "left_ledge": [-36, -35],
                    "right_ledge": [36, -40]
                }
            },
            "smoke_plume": {
                "label": "a billowing smoke plume smog cloud for chicago london fire halifax explosion and flights",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "fire", "air"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -46],
                    "top": [0, -90],
                    "base": [0, -5],
                    "cloud_l": [-28, -60],
                    "cloud_r": [28, -60]
                }
            },
            "dust_storm_wall": {
                "label": "a towering dust bowl storm wall for aral sea and desert",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "weather", "desert"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -88],
                    "front": [24, -38],
                    "top_billow": [0, -84],
                    "base_l": [-42, 0]
                }
            },
            "warning_beacon": {
                "label": "an emergency warning beacon siren for fukushima carrington event and disaster",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "rescue", "signal"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -88],
                    "beacon": [0, -78],
                    "siren_l": [-16, -66],
                    "siren_r": [16, -66],
                    "solar": [-16, -50],
                    "base": [0, 0]
                }
            },
            "rescue_vehicle": {
                "label": "an emergency rescue vehicle truck for chernobyl exclusion zone",
                "group": "vehicle",
                "pack": "disaster_scenes",
                "topics": ["disaster", "rescue", "vehicle"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -32],
                    "top": [0, -66],
                    "lightbar": [0, -48],
                    "cab": [15, -35],
                    "rear": [-30, -35],
                    "wheel_f": [22, -10],
                    "wheel_r": [-22, -10]
                }
            },
            "flood_sandbags": {
                "label": "defensive flood sandbags barrier for north sea johnstown dam and flood",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "flood", "defense"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -28],
                    "top": [0, -56],
                    "stake_l": [-34, -48],
                    "stake_r": [34, -48],
                    "top_bag": [0, -45],
                    "base": [0, 0]
                }
            },
            "cartoon_microbe": {
                "label": "a cute virus cartoon microbe bacteria for black death and flu pandemic",
                "group": "prop",
                "pack": "disaster_scenes",
                "topics": ["disaster", "medical", "microbe"],
                "face": True,
                "face_scale": 0.6,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -40],
                    "face": [0, -40],
                    "top": [0, -75],
                    "pod_top": [0, -71],
                    "pod_l": [-31, -40],
                    "pod_r": [31, -40]
                }
            }
        }
        for asset_id, spec in new_assets.items():
            cat["assets"][asset_id] = spec


if __name__ == "__main__":
    update_catalog()
    print("disaster_scenes catalog update completed successfully.")
