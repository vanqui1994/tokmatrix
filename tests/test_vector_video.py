"""Engine video vector (docs/PLAN_vector_video_engine.md): niche, DNA, builder, QA hình học."""
import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bkt_web.remake_vector import catalog, validate_story  # noqa: E402
from bkt_web.vector_video import builder, dna, qa  # noqa: E402
from bkt_web.vector_video.cli import build  # noqa: E402
from bkt_web.vector_video.extents import bbox, load_extents  # noqa: E402
from bkt_web.vector_video.niches import allowed, problems, supported_niches  # noqa: E402

LINES = ["Imagine standing on Mars tonight.", "The red planet is freezing cold.", "Its thin air is mostly carbon dioxide.",
         "Dust storms can cover the whole planet.", "Jupiter has no solid ground at all.", "Saturn wears rings of ice and rock.",
         "One day people may look back at Earth from there."]


def scenes(lines=LINES):
    out, t = [], 0.0
    for i, line in enumerate(lines):
        d = 3.6 + (i % 3) * 1.2
        out.append({"start": round(t, 2), "duration": d, "line": line, "visual_intent": line})
        t += d + 0.2
    return out, round(t + 1.0, 2)


def make(niche="deep_space", lang="en", channel="deep_space_en_1", storyboard=None, lines=LINES):
    sc, total = scenes(lines)
    return build({"slug": "t", "lang": lang, "niche": niche, "channel_id": channel, "total": total, "scenes": sc, "storyboard": storyboard})


class ConfigTest(unittest.TestCase):
    def test_niche_config_matches_catalog_and_extents(self):
        self.assertEqual(problems(), [])

    def test_every_catalog_rig_has_a_measured_extent(self):
        ext = load_extents()
        missing = [a for a in catalog()["assets"] if a not in ext]
        self.assertEqual(missing, [])

    def test_no_vietnamese_market(self):
        for niche in supported_niches():
            allow = allowed(niche, "en")
            self.assertNotIn("chibi_farmer", {h["rig"] for h in allow["hosts"].values()})
        with self.assertRaises(ValueError):
            allowed("deep_space", "vi")

    def test_unsupported_niche_is_refused(self):
        with self.assertRaises(ValueError):
            allowed("geopolitics_maps", "en")


class BuilderTest(unittest.TestCase):
    def test_fallback_story_validates_and_passes_qa_for_every_niche_and_language(self):
        for niche in supported_niches():
            for lang in ("de", "en", "ko", "ja"):
                for k in range(3):
                    with self.subTest(niche=niche, lang=lang, k=k):
                        result = make(niche, lang, f"{niche}_{lang}_{k}")
                        self.assertEqual(result["qa"], [])
                        story = {key: v for key, v in result["story"].items() if key != "vector_meta"}
                        validate_story(copy.deepcopy(story))

    def test_scene_times_follow_measured_tts(self):
        sc, total = scenes()
        story = make()["story"]
        self.assertEqual([s["start_time"] for s in story["scenes"]][1:], [s["start"] for s in sc][1:])
        self.assertEqual(story["scenes"][0]["start_time"], 0.0)
        self.assertEqual(story["scenes"][-1]["end_time"], total)
        self.assertEqual(story["cues"], [], "phụ đề là lớp HTML, không vẽ lên canvas")

    def test_build_is_deterministic(self):
        self.assertEqual(json.dumps(make()["story"], sort_keys=True), json.dumps(make()["story"], sort_keys=True))

    def test_llm_storyboard_is_used_when_valid_and_falls_back_when_not(self):
        board = {"scenes": [{"scene_index": i + 1, "setting": "mars_surface", "subject": "planet_mars" if i else "none", "mood": "happy",
                             "beats": [{"type": "reveal", "who": "subject"}, {"type": "point", "who": "host"}] if i else [{"type": "enter", "who": "host"}]}
                            for i in range(len(LINES))]}
        result = make(storyboard=board)
        self.assertEqual(result["storyboard_source"], "llm")
        self.assertEqual(result["qa"], [])
        mars = result["story"]["scenes"][1]["poses"]["subject_planet_mars"]
        self.assertEqual(mars[0]["opacity"], 0.0, "reveal: vật thể hiện dần")
        self.assertEqual(mars[-1]["opacity"], 1.0)
        bad = copy.deepcopy(board)
        bad["scenes"][2]["setting"] = "rice_paddy"
        self.assertEqual(make(storyboard=bad)["storyboard_source"], "fallback")

    def test_fallback_never_shows_an_unrelated_subject(self):
        story = make(lines=["Hello there.", "Let us begin.", "Nothing specific here.", "Still nothing.", "The end."])["story"]
        self.assertFalse([c for c in story["characters"] if c["id"].startswith("subject_")])
        story = make()["story"]
        subjects = {c["id"] for c in story["characters"] if c["id"].startswith("subject_")}
        self.assertIn("subject_planet_mars", subjects)
        self.assertIn("subject_planet_saturn", subjects)

    def test_localized_labels_let_the_fallback_find_subjects_in_every_language(self):
        from bkt_web.vector_video.builder import _mentions
        spec = {"label": "a whale", "labels": {"de": "Wal|Wale", "ko": "고래", "ja": "クジラ"}}
        self.assertTrue(_mentions(spec, "ja", "巨大なクジラは歌う", set()))
        self.assertTrue(_mentions(spec, "ko", "거대한 고래는", {"거대한", "고래는"}))
        self.assertTrue(_mentions(spec, "de", "der wal singt", {"der", "wal", "singt"}))
        self.assertFalse(_mentions(spec, "de", "walnuss", {"walnuss"}))

    def test_subjects_are_big_enough_and_never_overlap_people(self):
        story = make()["story"]
        assets = {c["id"]: c["asset"] for c in story["characters"]}
        for sc in story["scenes"]:
            for cid, keys in sc["poses"].items():
                if cid.startswith("subject_"):
                    k = keys[-1]
                    b = bbox(assets[cid], k["x"], k["y"], k["height"], k.get("variant"))
                    self.assertGreaterEqual(b[2] - b[0], 60)
                    self.assertGreaterEqual(b[3] - b[1], 60)

    def test_walking_faces_the_direction_of_travel(self):
        story = make()["story"]
        host = story["scenes"][0]["poses"]["host"]
        self.assertLess(host[0]["x"], 0, "cảnh 1 bắt đầu bằng enter từ ngoài khung")
        self.assertFalse(host[1]["flip"], "đi sang phải thì không lật")


class QaTest(unittest.TestCase):
    def base(self):
        return copy.deepcopy(make()["story"])

    def test_clean_story_passes(self):
        self.assertEqual(qa.check(self.base()), [])

    def test_catches_overlap(self):
        story = self.base()
        sc = story["scenes"][2]
        host = sc["poses"]["host"][-1]
        other = next(c for c in sc["poses"] if c != "host")
        for k in sc["poses"][other]:
            k["x"], k["y"] = host["x"], host["y"] + 0.45 * k["height"] - 100
        self.assertTrue(any("chồng nhau" in e for e in qa.check(story)))

    def test_catches_off_frame_and_floating(self):
        story = self.base()
        for k in story["scenes"][3]["poses"]["host"]:
            k["x"] = 700
        self.assertTrue(any("ngoài khung" in e for e in qa.check(story)))
        story = self.base()
        for k in story["scenes"][3]["poses"]["host"]:
            k["y"] = 600
        self.assertTrue(any("không chạm đất" in e for e in qa.check(story)))

    def test_catches_tiny_subject_caption_zone_and_two_suns(self):
        story = self.base()
        sc = story["scenes"][1]
        cid = next(c for c in sc["poses"] if c.startswith("subject_"))
        for k in sc["poses"][cid]:
            k["height"] = 30
        self.assertTrue(any("nhỏ hơn 60" in e for e in qa.check(story)))
        story = self.base()
        sc = story["scenes"][1]
        for k in sc["poses"][cid]:
            k["y"] = 1150
        self.assertTrue(any("phụ đề" in e for e in qa.check(story)))
        story = self.base()
        story["characters"] += [{"id": "s1", "name": "s", "asset": "sun"}, {"id": "s2", "name": "s", "asset": "sun"}]
        story["scenes"][0]["poses"]["s1"] = [{"time": 0, "x": 150, "y": 300, "height": 150}]
        story["scenes"][0]["poses"]["s2"] = [{"time": 0, "x": 420, "y": 300, "height": 150}]
        self.assertTrue(any("hai sun" in e for e in qa.check(story)))

    def test_catches_backwards_walk_and_blocked_assets(self):
        story = self.base()
        host = story["scenes"][0]["poses"]["host"]
        moving = next(k1 for k0, k1 in zip(host, host[1:]) if k1["x"] - k0["x"] > 60)
        moving["flip"] = True
        self.assertTrue(any("quay mặt ngược" in e for e in qa.check(story)))
        story = self.base()
        story["characters"][0]["asset"] = "chibi_farmer"
        self.assertTrue(any("bị chặn" in e for e in qa.check(story)))


class DnaTest(unittest.TestCase):
    def test_assignment_keeps_same_niche_channels_apart(self):
        channels = [{"channel_id": f"c{i:02d}", "language": "de" if i % 2 else "en", "niche": ["deep_space", "ocean_mysteries", "medical_anomalies"][i % 3], "hosts": 5, "buddies": 4} for i in range(24)]
        result = dna.assign(channels)
        self.assertEqual(dna.violations(result, {c["channel_id"]: c["language"] for c in channels}, {c["channel_id"]: c["niche"] for c in channels}), [])
        self.assertEqual(result, dna.assign(channels), "tất định")
        again = dna.assign(channels, result)
        self.assertEqual(again, result, "giữ DNA cũ còn hợp lệ")

    def test_same_niche_channels_of_different_countries_never_share_a_cast(self):
        channels = [{"channel_id": f"ocean_{i:02d}", "language": ["ko", "ja"][i % 2], "niche": "ocean_mysteries", "hosts": 7, "buddies": 4} for i in range(13)]
        result = dna.assign(channels)
        casts = [tuple(v["cast"]) for v in result.values()]
        self.assertEqual(len(casts), len(set(casts)))
        self.assertEqual(dna.violations(result, {c["channel_id"]: c["language"] for c in channels}, {c["channel_id"]: c["niche"] for c in channels}), [])

    def test_axes_change_the_story(self):
        a, b = dna.derive("x1"), dna.derive("x2")
        self.assertGreaterEqual(len(dna.AXES) + 1, dna.differences(a, b))


class EnableTest(unittest.TestCase):
    def test_enable_puts_vector_first_bumps_version_and_assigns_dna_on_a_copy(self):
        import shutil
        import tempfile
        import yaml
        import bkt_web.vector_video.cli as cli
        tmp = Path(tempfile.mkdtemp())
        try:
            shutil.copytree(ROOT / "compare_studio" / "config", tmp / "compare_studio" / "config")
            old_root, old_dna = cli.ROOT, dna.DNA_PATH
            cli.ROOT, dna.DNA_PATH = tmp, tmp / "compare_studio" / "config" / "vector_dna.json"
            try:
                dry = cli.enable(None, 2, False)
                self.assertEqual(sorted({p["language"] for p in dry}), ["de", "en", "ja", "ko"])
                self.assertFalse(dna.DNA_PATH.exists(), "dry-run không ghi gì")
                before = yaml.safe_load((tmp / "compare_studio/config/channels/deep_space_11.yaml").read_text())
                cli.enable(["deep_space_11"], 0, True)
                after = yaml.safe_load((tmp / "compare_studio/config/channels/deep_space_11.yaml").read_text())
                self.assertEqual(after["creative"]["preferred_engines"], ["vector", *before["creative"]["preferred_engines"]])
                self.assertEqual(after["config_version"], before["config_version"] + 1)
                self.assertIn("deep_space_11", json.loads(dna.DNA_PATH.read_text())["channels"])
                with self.assertRaises(SystemExit):
                    cli.enable(["geopolitics_maps_01"], 0, True)
            finally:
                cli.ROOT, dna.DNA_PATH = old_root, old_dna
        finally:
            shutil.rmtree(tmp)


class CliTest(unittest.TestCase):
    def test_build_command_speaks_json(self):
        sc, total = scenes()
        payload = {"slug": "t", "lang": "de", "niche": "ocean_mysteries", "channel_id": "ocean_de_1", "total": total, "scenes": sc}
        out = subprocess.run([sys.executable, "-m", "bkt_web.vector_video", "build"], input=json.dumps(payload), capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(out.returncode, 0, out.stderr)
        data = json.loads(out.stdout)
        self.assertEqual(data["qa"], [])
        bad = subprocess.run([sys.executable, "-m", "bkt_web.vector_video", "build"], input=json.dumps({**payload, "lang": "vi"}), capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(bad.returncode, 2)
        self.assertIn("de/en/ko/ja", json.loads(bad.stdout)["error"])


if __name__ == "__main__":
    unittest.main()
