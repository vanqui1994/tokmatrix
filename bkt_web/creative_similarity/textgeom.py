"""Hộp chữ thật của một composition HyperFrames (tín hiệu `text`, PLAN_VARIANT_V2_COMPLETION WS-A2).

Mở index.html bằng Chromium (Playwright, không mạng), ở mỗi mốc thời gian chỉ hiện các `.clip` đang chạy (theo
data-start/data-duration như player HyperFrames), rồi đo getClientRects của mọi text node trong #root và cộng độ phủ vào
lưới 9×16 ô (120 px). Không cần OCR: renderer là HTML nên hộp chữ đo trực tiếp được.
"""
from __future__ import annotations

import atexit
import glob
import os
import threading
from pathlib import Path
from typing import List, Optional

GRID_W, GRID_H, CELL = 9, 16, 120

_JS = """(times) => {
  const W = 1080, H = 1920, GW = %d, GH = %d, CELL = %d;
  const root = document.getElementById('root') || document.body;
  const clips = [...document.querySelectorAll('.clip')];
  const out = [];
  for (const t of times) {
    for (const c of clips) {
      const s = Number(c.dataset.start || 0), d = Number(c.dataset.duration || 1e9);
      c.style.display = (t >= s && t < s + d) ? '' : 'none';
    }
    const grid = new Array(GW * GH).fill(0);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const b of range.getClientRects()) {
        const x0 = Math.max(0, b.left), x1 = Math.min(W, b.right), y0 = Math.max(0, b.top), y1 = Math.min(H, b.bottom);
        if (x1 - x0 < 1 || y1 - y0 < 1) continue;
        for (let cy = Math.floor(y0 / CELL); cy <= Math.min(GH - 1, Math.floor((y1 - 1) / CELL)); cy++) {
          for (let cx = Math.floor(x0 / CELL); cx <= Math.min(GW - 1, Math.floor((x1 - 1) / CELL)); cx++) {
            const ox = Math.min(x1, (cx + 1) * CELL) - Math.max(x0, cx * CELL);
            const oy = Math.min(y1, (cy + 1) * CELL) - Math.max(y0, cy * CELL);
            if (ox > 0 && oy > 0) grid[cy * GW + cx] += (ox * oy) / (CELL * CELL);
          }
        }
      }
    }
    out.push(grid.map((v) => Math.min(1, v)));
  }
  return out;
}""" % (GRID_W, GRID_H, CELL)

_lock = threading.Lock()
_state: dict = {}


def _executable() -> Optional[str]:
    base = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
    found = sorted(glob.glob(f"{base}/chromium-*/chrome-linux*/chrome"))
    return found[-1] if found else None


def _browser():
    if "browser" not in _state:
        from playwright.sync_api import sync_playwright

        pw = sync_playwright().start()
        exe = _executable()
        _state["pw"] = pw
        _state["browser"] = pw.chromium.launch(executable_path=exe, args=["--disable-gpu"]) if exe else pw.chromium.launch(args=["--disable-gpu"])
        atexit.register(close)
    return _state["browser"]


def close() -> None:
    browser, pw = _state.pop("browser", None), _state.pop("pw", None)
    if browser:
        browser.close()
    if pw:
        pw.stop()


def text_grids(html_path: Path, times: List[float]) -> List[List[float]]:
    """Lưới độ phủ chữ (9×16, 0..1) ở từng mốc thời gian."""
    with _lock:
        page = _browser().new_page(viewport={"width": 1080, "height": 1920})
        try:
            page.route("http*://**", lambda route: route.abort())  # composition phải offline; không tải mạng
            page.goto(Path(html_path).resolve().as_uri(), wait_until="load")
            page.evaluate("document.fonts ? document.fonts.ready : null")
            return page.evaluate(_JS, list(times))
        finally:
            page.close()
