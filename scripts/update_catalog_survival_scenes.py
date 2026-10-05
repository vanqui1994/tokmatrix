"""Update vector catalog for survival_scenes pack (R9).
Idempotent script to register:
- engine_packs: survival_scenes
- backgrounds: jungle_crash_site, antarctic_camp, mine_tunnel, mountain_peak, desert_noon
- background_specs: specs for 5 backgrounds
- assets: crashed_plane, life_raft, icebound_ship, snow_shelter, miner_helmet,
          climbing_rope, oxygen_tank, avalanche_probe, rescue_flare, canteen_flask
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
        if "survival_scenes" not in cat["engine_packs"]:
            cat["engine_packs"].append("survival_scenes")

        # 2. backgrounds
        new_bgs = [
            "jungle_crash_site",
            "antarctic_camp",
            "mine_tunnel",
            "mountain_peak",
            "desert_noon",
        ]
        for bg in new_bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        bg_specs = {
            "jungle_crash_site": {
                "label": "Jungle crash site clearing",
                "theme": "farm",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["survival", "nature", "forest"]
            },
            "antarctic_camp": {
                "label": "Antarctic polar expedition camp",
                "theme": "highland",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["survival", "polar", "ice"]
            },
            "mine_tunnel": {
                "label": "Underground mine shaft tunnel",
                "theme": "building",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["survival", "underground", "rescue"]
            },
            "mountain_peak": {
                "label": "Alpine mountain summit ridge",
                "theme": "highland",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["survival", "mountain", "climbing"]
            },
            "desert_noon": {
                "label": "Midday desert sand dunes",
                "theme": "farm",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["survival", "desert", "heat"]
            }
        }
        for bg, spec in bg_specs.items():
            cat["background_specs"][bg] = spec

        # 4. assets
        new_assets = {
            "crashed_plane": {
                "label": "a crashed plane flight in the jungle or forest",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "airplane", "forest"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -80],
                    "cockpit": [15, -45],
                    "wing_l": [-35, -45],
                    "wing_r": [35, -45],
                    "tail": [-45, -75]
                }
            },
            "life_raft": {
                "label": "an inflatable rescue life raft for currents raft adrift submarine selkirk crusoe and drowning survivors",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "ocean", "rescue"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -30],
                    "top": [0, -65],
                    "canopy": [0, -60],
                    "rim_l": [-42, -18],
                    "rim_r": [42, -18],
                    "inside": [0, -15],
                    "grip": [0, -20]
                }
            },
            "icebound_ship": {
                "label": "an icebound expedition ship in antarctic ice for shackleton crew",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "polar", "ship"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -45],
                    "top": [0, -90],
                    "mast": [5, -88],
                    "bow": [40, -25],
                    "stern": [-42, -30],
                    "ice_base": [0, -5]
                }
            },
            "snow_shelter": {
                "label": "a mountain snow shelter igloo for frostbite hypothermia lightning storm and andes survivors",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "polar", "shelter"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -35],
                    "top": [0, -65],
                    "entrance": [20, -15],
                    "dome_top": [0, -62]
                }
            },
            "miner_helmet": {
                "label": "a miner helmet with headlamp for miners underground earthquake and cave rescue",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "underground", "gear"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -32],
                    "top": [0, -60],
                    "headlamp": [18, -32],
                    "beam": [38, -32],
                    "grip": [0, -20]
                }
            },
            "climbing_rope": {
                "label": "a climbing rope with carabiners for ralston canyon quicksand and mountain",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "mountain", "gear"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -35],
                    "top": [0, -68],
                    "grip": [0, -35],
                    "carabiner_top": [12, -64],
                    "carabiner_bottom": [-10, -10]
                }
            },
            "oxygen_tank": {
                "label": "an altitude oxygen tank cylinder for extreme altitude and apollo space",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "mountain", "medical"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -40],
                    "top": [0, -78],
                    "valve": [0, -72],
                    "gauge": [12, -68],
                    "mask": [24, -40],
                    "grip": [-14, -38]
                }
            },
            "avalanche_probe": {
                "label": "an avalanche rescue probe pole for avalanche victims",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "mountain", "rescue"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -42],
                    "top": [0, -82],
                    "handle": [0, -78],
                    "tip": [0, -5],
                    "grip": [0, -45]
                }
            },
            "rescue_flare": {
                "label": "a glowing rescue signal flare to signal for rescue evacuation from the air",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "rescue", "signal"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -40],
                    "top": [0, -85],
                    "flame": [0, -78],
                    "nozzle": [0, -55],
                    "grip": [0, -25]
                }
            },
            "canteen_flask": {
                "label": "a survival canteen flask for water shade lost in forests desert sahara heat stroke",
                "group": "prop",
                "pack": "survival_scenes",
                "topics": ["survival", "water", "gear"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -32],
                    "top": [0, -64],
                    "cap": [0, -60],
                    "strap_l": [-28, -25],
                    "strap_r": [28, -25],
                    "grip": [0, -25]
                }
            }
        }
        for asset_id, spec in new_assets.items():
            cat["assets"][asset_id] = spec


if __name__ == "__main__":
    update_catalog()
    print("survival_scenes catalog update completed successfully.")
