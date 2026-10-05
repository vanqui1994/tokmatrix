import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "bkt_web" / "static"
sys.path.insert(0, str(ROOT))

from bkt_web.remake_vector import (
    engine_sources,
    catalog,
    tiger_and_persimmon_examples,
    kimchi_day_examples,
    seollal_morning_examples,
    rain_gauge_examples,
)

ART_DIR = Path("/Users/vfa/.gemini/antigravity-ide/brain/49239a9e-43cd-4cf1-968a-b3a91afc986a/scratch")
ART_DIR.mkdir(parents=True, exist_ok=True)

stories = {
    "tiger_and_persimmon": tiger_and_persimmon_examples()[0],
    "kimchi_day": kimchi_day_examples()[0],
    "seollal_morning": seollal_morning_examples()[0],
    "rain_gauge": rain_gauge_examples()[0],
}

cat = catalog()
engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
    page = browser.new_page()
    page.set_content(f"""
    <html><body>
    <canvas id="stage" width="576" height="1024"></canvas>
    <script>{engine_js}</script>
    <script>
      window.cat = {json.dumps(cat)};
      window.renderStoryFrame = function(story, t) {{
        const canvas = document.getElementById('stage');
        const renderer = new RemakeVector.Renderer(canvas, window.cat, story);
        renderer.render(t);
        return canvas.toDataURL('image/png');
      }};
    </script>
    </body></html>
    """)

    for name, story in stories.items():
        dur = story["duration"]
        # 5 evenly spaced sample times
        times = [1.0, dur * 0.3, dur * 0.5, dur * 0.75, dur - 0.5]
        print(f"Rendering {name} at times: {times}")
        for i, t in enumerate(times):
            data_url = page.evaluate("args => renderStoryFrame(args[0], args[1])", [story, t])
            import base64
            img_data = base64.b64decode(data_url.split(",")[1])
            out_file = ART_DIR / f"{name}_{i}_{t:.1f}s.png"
            out_file.write_bytes(img_data)
            print(f"Saved {out_file.name}")

    browser.close()
print("Done rendering all story frames!")
