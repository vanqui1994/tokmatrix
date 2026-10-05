import json
import sys
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))  # chạy trực tiếp (--update-hashes) vẫn import được bkt_web
STATIC_DIR = ROOT / "bkt_web" / "static"
HASHES_FILE = ROOT / "tests" / "data" / "vector_hashes.json"
LANDSCAPE_HASHES_FILE = ROOT / "tests" / "data" / "vector_hashes_landscape.json"
SAMPLE_TIMES = [0.2, 0.8, 1.6, 2.4, 3.2]
# Hình nền đã vẽ cho khổ ngang (plan docs/PLAN_vector_widescreen.md nhóm B2): core + farm_fun + modular_scenes.
# "preset@locale" là một locale của hình nền lắp ghép. Thêm hình nền vào đây khi nó đã vẽ theo `w`.
LANDSCAPE_BACKGROUNDS = [
    # B2
    "garden", "orchard", "balcony", "pepper_patch", "soil_cutaway", "pond", "river", "sea", "underwater",
    "farmyard_barn", "village_market",
    *(f"street@{loc}" for loc in ("neutral", "de", "us", "kr", "jp")),
    *(f"interior@{loc}" for loc in ("neutral", "de", "us", "kr", "jp")),
    # B3 - Ancient
    "stone_age_cave", "nile_bank", "desert_dunes", "roman_town", "greek_stadium",
    # B3 - Medieval
    "castle_yard", "medieval_village", "viking_fjord",
    # B3 - Inventions
    "workshop_1900", "old_town_1900",
    # B3 - German culture
    "black_forest_village", "christmas_market", "allotment_garden", "alpine_meadow",
    # B3 - Japanese culture
    "edo_town", "jp_school", "train_platform", "shrine_generic", "onsen_snow",
    # B3 - Korean culture
    "hanok_village", "joseon_palace_generic", "kr_market", "kr_school", "apartment_street",
    # B3 - US culture
    "suburb_backyard", "national_park", "wild_west_town", "launch_pad", "pumpkin_patch", "moon_surface",
]
LANDSCAPE_SIZE = (1820, 1024)


def load_engine_code():
    from bkt_web.remake_vector import engine_sources
    sources = engine_sources()  # thiếu gói thì lỗi luôn, không so trên engine thiếu
    return "\n;\n".join(src.read_text(encoding="utf-8") for src in sources)


def compute_hashes():
    cat = json.loads((STATIC_DIR / "remake_vector_catalog.json").read_text(encoding="utf-8"))
    engine_js = load_engine_code()
    stories = json.loads((STATIC_DIR / "remake_vector_examples.json").read_text(encoding="utf-8"))

    with sync_playwright() as p:
        # Raster phần mềm, màu sRGB cố định: GPU raster đổi cách khử răng cưa khi máy tải nặng
        # (sau các test Playwright khác) làm hash lệch dù hình không đổi.
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
        page = browser.new_page()
        page.set_content(f"""
        <html><body>
        <canvas id="stage" width="576" height="1024"></canvas>
        <script>{engine_js}</script>
        <script>
          window.cat = {json.dumps(cat)};
          function hashPixels(data) {{
            let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
            for (let i = 0; i < data.length; i += 4) {{
              const v = (data[i] << 24) | (data[i+1] << 16) | (data[i+2] << 8) | data[i+3];
              h1 = Math.imul(h1 ^ v, 2654435761);
              h2 = Math.imul(h2 ^ (v >>> 16), 1597334677);
            }}
            return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
          }}
          window.renderAssetBatch = function(assets, times) {{
            const canvas = document.getElementById('stage');
            const ctx = canvas.getContext('2d');
            const res = {{}};
            for (const a of assets) {{
              const story = {{
                id: 'test-' + a, renderer: 'native-vector-v1', duration: 4,
                characters: [{{ id: 'actor', asset: a }}],
                scenes: [{{
                  renderer: 'native-vector-v1', start_time: 0, end_time: 4,
                  characters_present: ['actor'],
                  background: {{ preset: 'garden' }},
                  poses: {{ actor: [{{ time: 0, x: 288, y: 760, height: 400, growth: 0.5 }}, {{ time: 4, x: 288, y: 760, height: 400, growth: 0.5 }}] }},
                  actions: []
                }}]
              }};
              const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
              res[a] = [];
              for (const t of times) {{
                renderer.render(t);
                const data = ctx.getImageData(0, 0, 576, 1024).data;
                res[a].push(hashPixels(data));
              }}
            }}
            return res;
          }};
          window.renderBackgroundBatch = function(backgrounds, times) {{
            const canvas = document.getElementById('stage');
            const ctx = canvas.getContext('2d');
            const res = {{}};
            for (const bg of backgrounds) {{
              res[bg] = {{}};
              for (const timeOfDay of ['day', 'night', ...window.cat.weather.filter(w => w !== 'clear')]) {{
                const story = {{
                  id: 'test-bg-' + bg + '-' + timeOfDay, renderer: 'native-vector-v1', duration: 4,
                  characters: [],
                  scenes: [{{
                    renderer: 'native-vector-v1', start_time: 0, end_time: 4,
                    characters_present: [],
                    background: ['day', 'night'].includes(timeOfDay) ? {{ preset: bg, time: timeOfDay }} : {{ preset: bg, weather: timeOfDay }},
                    poses: {{}},
                    actions: []
                  }}]
                }};
                const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
                res[bg][timeOfDay] = [];
                for (const t of times) {{
                  renderer.render(t);
                  const data = ctx.getImageData(0, 0, 576, 1024).data;
                  res[bg][timeOfDay].push(hashPixels(data));
                }}
              }}
            }}
            return res;
          }};
          // Story mẫu phủ động tác, cầm/thả, IK, thời tiết: hình đứng yên không bắt được lỗi ở các chỗ đó.
          window.renderStoryBatch = function(stories) {{
            const canvas = document.getElementById('stage');
            const ctx = canvas.getContext('2d');
            const res = {{}};
            for (const story of stories) {{
              const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
              const d = story.duration;
              res[story.id] = [0.4, d * 0.25, d * 0.5, d * 0.75, d - 0.3].map(t => {{
                renderer.render(t);
                return hashPixels(ctx.getImageData(0, 0, 576, 1024).data);
              }});
            }}
            return res;
          }};
        </script>
        </body></html>
        """)

        assets = list(cat["assets"].keys())
        backgrounds = cat["backgrounds"]
        asset_hashes = page.evaluate("([assets, times]) => window.renderAssetBatch(assets, times)", [assets, SAMPLE_TIMES])
        bg_hashes = page.evaluate("([bgs, times]) => window.renderBackgroundBatch(bgs, times)", [backgrounds, [0.5, 2.0]])
        story_hashes = page.evaluate("(stories) => window.renderStoryBatch(stories)", stories)
        browser.close()

    return {
        "sample_times": SAMPLE_TIMES,
        "assets": asset_hashes,
        "backgrounds": bg_hashes,
        "stories": story_hashes,
    }


def compute_landscape_hashes(backgrounds=None):
    """Hash 1820×1024 của mọi hình nền khổ ngang × ngày/đêm/mọi weather (t = 0.5, 2.0)."""
    cat = json.loads((STATIC_DIR / "remake_vector_catalog.json").read_text(encoding="utf-8"))
    engine_js = load_engine_code()
    backgrounds = list(backgrounds or LANDSCAPE_BACKGROUNDS)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
        page = browser.new_page()
        page.set_content(f"""
        <html><body>
        <canvas id="stage"></canvas>
        <script>{engine_js}</script>
        <script>
          window.cat = {json.dumps(cat)};
          function hashPixels(data) {{
            let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
            for (let i = 0; i < data.length; i += 4) {{
              const v = (data[i] << 24) | (data[i+1] << 16) | (data[i+2] << 8) | data[i+3];
              h1 = Math.imul(h1 ^ v, 2654435761);
              h2 = Math.imul(h2 ^ (v >>> 16), 1597334677);
            }}
            return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
          }}
          window.renderLandscapeBatch = function(keys, times) {{
            const canvas = document.getElementById('stage');
            const res = {{}};
            for (const key of keys) {{
              const [preset, locale] = key.split('@');
              res[key] = {{}};
              for (const variant of ['day', 'night', ...window.cat.weather.filter(w => w !== 'clear')]) {{
                const background = ['day', 'night'].includes(variant) ? {{ preset, time: variant }} : {{ preset, weather: variant }};
                if (locale) background.locale = locale;
                const story = {{
                  id: 'wide-' + key + '-' + variant, renderer: 'native-vector-v1', duration: 4, frame: 'landscape',
                  characters: [],
                  scenes: [{{ renderer: 'native-vector-v1', start_time: 0, end_time: 4, characters_present: [],
                              background, poses: {{}}, actions: [] }}]
                }};
                const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
                const ctx = canvas.getContext('2d');
                res[key][variant] = times.map(t => {{
                  renderer.render(t);
                  return hashPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data) + '@' + canvas.width + 'x' + canvas.height;
                }});
              }}
            }}
            return res;
          }};
        </script>
        </body></html>
        """)
        hashes = page.evaluate("([keys, times]) => window.renderLandscapeBatch(keys, times)", [backgrounds, [0.5, 2.0]])
        browser.close()
    return {"size": list(LANDSCAPE_SIZE), "backgrounds": hashes}


class VectorRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Thiếu mốc thì phải đỏ: tự tạo mốc từ bản đang sửa sẽ luôn "đạt" mà không so gì.
        if not HASHES_FILE.exists():
            raise AssertionError(f"Thiếu {HASHES_FILE}; chạy python3 tests/test_remake_vector_regression.py --update-hashes trên bản đã duyệt")
        cls.baseline = json.loads(HASHES_FILE.read_text(encoding="utf-8"))
        cls.current = compute_hashes()

    def test_all_baseline_assets_match_pixel_hashes(self):
        mismatches = []
        for asset, expected_hashes in self.baseline["assets"].items():
            curr_hashes = self.current["assets"].get(asset)
            if curr_hashes != expected_hashes:
                mismatches.append((asset, expected_hashes, curr_hashes))
        self.assertEqual(mismatches, [], f"Pixel regression detected in {len(mismatches)} assets: {[m[0] for m in mismatches]}")

    def test_all_baseline_backgrounds_match_pixel_hashes(self):
        mismatches = []
        for bg, expected in self.baseline["backgrounds"].items():
            current = self.current["backgrounds"].get(bg) or {}
            for variant, hashes in expected.items():
                if current.get(variant) != hashes:
                    mismatches.append(f"{bg}/{variant}")
        self.assertEqual(mismatches, [], f"Pixel regression detected in {len(mismatches)} backgrounds: {mismatches}")

    def test_all_baseline_stories_match_pixel_hashes(self):
        baseline = self.baseline.get("stories")
        self.assertTrue(baseline, "Mốc chưa có story mẫu; cập nhật mốc bằng --update-hashes")
        mismatches = [sid for sid, expected in baseline.items() if self.current["stories"].get(sid) != expected]
        self.assertEqual(mismatches, [], f"Pixel regression detected in {len(mismatches)} stories: {mismatches}")


class VectorLandscapeRegressionTest(unittest.TestCase):
    """Mốc riêng cho khổ ngang; không đụng mốc khổ dọc vector_hashes.json."""

    @classmethod
    def setUpClass(cls):
        if not LANDSCAPE_HASHES_FILE.exists():
            raise AssertionError(f"Thiếu {LANDSCAPE_HASHES_FILE}; chạy python3 tests/test_remake_vector_regression.py --update-landscape-hashes trên bản đã duyệt")
        cls.baseline = json.loads(LANDSCAPE_HASHES_FILE.read_text(encoding="utf-8"))
        cls.current = compute_landscape_hashes()

    def test_baseline_covers_every_landscape_background(self):
        self.assertEqual(sorted(self.baseline["backgrounds"]), sorted(LANDSCAPE_BACKGROUNDS))
        self.assertEqual(self.baseline["size"], list(LANDSCAPE_SIZE))

    def test_landscape_backgrounds_match_pixel_hashes(self):
        mismatches = []
        for bg, expected in self.baseline["backgrounds"].items():
            current = self.current["backgrounds"].get(bg) or {}
            for variant, hashes in expected.items():
                if current.get(variant) != hashes:
                    mismatches.append(f"{bg}/{variant}")
        self.assertEqual(mismatches, [], f"Landscape pixel regression in {len(mismatches)} backgrounds: {mismatches}")


if __name__ == "__main__":
    if "--update-hashes" in sys.argv:
        print("Rendering and updating baseline hashes...")
        data = compute_hashes()
        HASHES_FILE.parent.mkdir(parents=True, exist_ok=True)
        HASHES_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Updated {len(data['assets'])} assets, {len(data['backgrounds'])} backgrounds, {len(data['stories'])} stories in {HASHES_FILE}")
    elif "--update-landscape-hashes" in sys.argv:
        # Chỉ ghi mốc khổ ngang; mốc khổ dọc giữ nguyên.
        print("Rendering and updating landscape baseline hashes...")
        data = compute_landscape_hashes()
        LANDSCAPE_HASHES_FILE.parent.mkdir(parents=True, exist_ok=True)
        LANDSCAPE_HASHES_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Updated {len(data['backgrounds'])} landscape backgrounds in {LANDSCAPE_HASHES_FILE}")
    else:
        unittest.main()
