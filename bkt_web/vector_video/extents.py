"""Kích thước thật của từng rig, tính theo `height` của pose.

Mỗi rig được vẽ một mình (hình nền một màu) ở x = 288, y = 700, height = 200; khung bao các pixel khác màu nền
được lưu dưới dạng tỉ lệ so với height: `[left, top, right, bottom]` (left/top âm, tính từ điểm gốc của rig).
Builder dùng nó để chọn cỡ và chỗ đứng, QA dùng nó để biết hai nhân vật có chồng nhau không — không cần
trình duyệt lúc chạy (VPS không có Playwright cho Python). Đo lại khi thêm rig: `python3 -m bkt_web.vector_video extents`.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXTENTS_PATH = ROOT / "bkt_web" / "static" / "remake_vector_extents.json"
PROBE = {"x": 288, "y": 700, "height": 200}
# Nhân vật chibi đo kèm trang phục mặc định (outfit none) — áo không đổi khung bao đáng kể.


@lru_cache(maxsize=1)
def load_extents() -> dict:
    return json.loads(EXTENTS_PATH.read_text(encoding="utf-8"))["assets"]


def extent(asset: str, variant: str | None = None) -> list[float]:
    """[left, top, right, bottom] theo đơn vị height; rig chưa đo thì ném lỗi (không đoán)."""
    table = load_extents()
    key = f"{asset}.{variant}" if variant and f"{asset}.{variant}" in table else asset
    if key not in table:
        raise KeyError(f"chưa đo kích thước rig {key}; chạy python3 -m bkt_web.vector_video extents")
    return table[key]


def bbox(asset: str, x: float, y: float, height: float, variant: str | None = None, flip: bool = False) -> tuple[float, float, float, float]:
    left, top, right, bottom = extent(asset, variant)
    if flip:
        left, right = -right, -left
    return (x + left * height, y + top * height, x + right * height, y + bottom * height)


def measure(variants: dict[str, list[str]] | None = None) -> dict:
    """Đo mọi rig của catalog (cần Playwright). `variants`: asset → các biến thể cần đo riêng (vd. planet)."""
    from playwright.sync_api import sync_playwright
    from bkt_web.remake_vector import catalog, engine_sources

    cat = catalog()
    js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
    jobs = [[a, None] for a in sorted(cat["assets"])]
    for asset, names in (variants or {}).items():
        jobs += [[asset, v] for v in names]
    page_js = """
RemakeVector.register({ backgrounds: { measure_blank: { label: 'measure', theme: 'garden', ground_y: 900,
  draw(ctx, s) { const f = RemakeVector.kit.frameSpan(s); ctx.fillStyle = '#ff00ff'; ctx.fillRect(f.x0, 0, f.x1 - f.x0, 1024); } } } });
window.measureAll = (jobs, probe) => {
  const canvas = document.createElement('canvas'), out = {};
  for (const [asset, variant] of jobs) {
    const pose = { time: 0, x: probe.x, y: probe.y, height: probe.height };
    if (variant) pose.variant = variant;
    const story = { id: 'm', renderer: 'native-vector-v1', duration: 1, cues: [], characters: [{ id: 'a', name: 'a', asset }],
      scenes: [{ renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 1, characters_present: ['a'],
                 poses: { a: [pose] }, actions: [], background: { preset: 'measure_blank' } }] };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    try {
      new RemakeVector.Renderer(canvas, window.cat, story).render(0.5);
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        // Bỏ nền magenta và bóng tiếp xúc mờ (nền tối đi một chút vẫn còn sắc magenta).
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (g < 40 && r > 120 && b > 120 && Math.abs(r - b) < 40) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    } catch (err) { out[variant ? asset + '.' + variant : asset] = { error: String(err) }; continue; }
    const h = probe.height;
    out[variant ? asset + '.' + variant : asset] = x1 < x0 ? null : [(x0 - probe.x) / h, (y0 - probe.y) / h, (x1 + 1 - probe.x) / h, (y1 + 1 - probe.y) / h].map(v => Math.round(v * 1000) / 1000);
  }
  return out;
};
"""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu"])
        page = browser.new_page()
        page.set_content(f"<script>{js}</script><script>window.cat={json.dumps(cat)};</script><script>{page_js}</script>")
        result = page.evaluate("([jobs, probe]) => window.measureAll(jobs, probe)", [jobs, PROBE])
        browser.close()
    errors = {k: v for k, v in result.items() if isinstance(v, dict)}
    assets = {k: v for k, v in result.items() if isinstance(v, list)}
    return {"probe": PROBE, "assets": assets, "errors": errors, "empty": sorted(k for k, v in result.items() if v is None)}


def write_extents(variants: dict[str, list[str]] | None = None) -> Path:
    data = measure(variants)
    EXTENTS_PATH.write_text(json.dumps(data, indent=1, sort_keys=True), encoding="utf-8")
    load_extents.cache_clear()
    return EXTENTS_PATH
