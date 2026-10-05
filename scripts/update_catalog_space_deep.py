"""Update remake_vector_catalog.json for space_deep pack (Agent A)."""
from __future__ import annotations

from scripts.catalog_edit import edit_catalog


def update_catalog():
    with edit_catalog() as cat:
        # 1. engine_packs
        if "space_deep" not in cat["engine_packs"]:
            cat["engine_packs"].append("space_deep")

        # 2. backgrounds
        new_bgs = [
            "deep_space_view",
            "observatory_night"
        ]
        for bg in new_bgs:
            if bg not in cat["backgrounds"]:
                cat["backgrounds"].append(bg)

        # 3. background_specs
        bg_specs = {
            "deep_space_view": {
                "label": "Deep Space Cosmic Panorama",
                "theme": "highland",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["deep_space", "space"]
            },
            "observatory_night": {
                "label": "Mountain Night Observatory",
                "theme": "highland",
                "ground_y": 810,
                "weather": ["clear", "rain", "snow", "wind", "fog", "storm", "hot"],
                "topics": ["deep_space", "space", "technology"]
            }
        }
        for bg, spec in bg_specs.items():
            cat["background_specs"][bg] = spec

        # 4. assets
        new_assets = {
            "black_hole": {
                "label": "Supermassive Black Hole",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space", "mega_catastrophes"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "jet_top": [0, -90],
                    "jet_bottom": [0, -10],
                    "accretion_l": [-70, -50],
                    "accretion_r": [70, -50]
                }
            },
            "neutron_star": {
                "label": "Pulsar Neutron Star",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "beam_top": [0, -95],
                    "beam_bottom": [0, -5],
                    "magnetic_l": [-45, -50],
                    "magnetic_r": [45, -50]
                }
            },
            "spiral_galaxy": {
                "label": "Spiral Galaxy",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "arm_1": [-60, -50],
                    "arm_2": [60, -50],
                    "core": [0, -50]
                }
            },
            "nebula": {
                "label": "Emission Nebula Cloud",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "cloud_l": [-55, -50],
                    "cloud_r": [55, -50],
                    "star_core": [0, -50]
                }
            },
            "space_telescope": {
                "label": "Deep Space Orbital Telescope",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space", "technology"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "solar_l": [-75, -50],
                    "solar_r": [75, -50],
                    "aperture": [0, -90],
                    "antenna": [0, -10]
                }
            },
            "space_probe": {
                "label": "Deep Space Interstellar Probe",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space", "technology"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "dish": [0, -70],
                    "golden_record": [0, -35],
                    "boom_l": [-55, -45],
                    "boom_r": [55, -45]
                }
            },
            "pluto": {
                "label": "Pluto Dwarf Planet",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space"],
                "face": True,
                "face_scale": 0.5,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "face": [0, -50],
                    "top": [0, -90],
                    "heart": [10, -45],
                    "moon_charon": [70, -70]
                }
            },
            "asteroid": {
                "label": "Rocky Asteroid",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space", "mega_catastrophes"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "crater_top": [0, -75],
                    "edge_l": [-45, -50],
                    "edge_r": [45, -50]
                }
            },
            "shooting_star": {
                "label": "Meteor Shooting Star",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space", "mega_catastrophes"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "head": [40, -25],
                    "tail": [-65, -75]
                }
            },
            "exoplanet_lava": {
                "label": "Volcanic Lava Exoplanet",
                "group": "prop",
                "pack": "space_deep",
                "topics": ["deep_space", "space"],
                "face": False,
                "anchors": {
                    "root": [0, 0],
                    "center": [0, -50],
                    "lava_lake": [0, -45],
                    "atmospheric_rim": [0, -92]
                }
            }
        }
        for asset_id, asset_spec in new_assets.items():
            cat["assets"][asset_id] = asset_spec


if __name__ == "__main__":
    update_catalog()
    print("Catalog updated with space_deep pack successfully.")
