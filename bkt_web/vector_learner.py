"""Tự học vector: biến một mục của hàng đợi học (vector_learning) thành subject vẽ được, không cần duyệt tay.

Tầng 1 — dùng lại: Gemini chọn trong catalog một rig có sẵn khớp đối tượng (rig của pack khác, chưa gán cho niche)
→ subject bí danh `learned_<tên>` trỏ tới rig đó.
Tầng 2 — vẽ mới: Gemini viết thân hàm vẽ `(ctx, s, t)` theo quy ước engine (gốc ở chân, y âm lên trên, cao ~100,
chỉ dùng ctx + RemakeVector.kit). Kiểm tra tự động, sai thì đưa lỗi cho Gemini sửa (tối đa ROUNDS lần):
  - tĩnh: không gọi mạng/DOM/eval, không vẽ chữ (fillText/strokeText) — §31
  - chạy thật trong engine (Playwright, mọi pack + rig mới): không ném lỗi, có hình, khung bao hợp lý
  - ít đỏ (không máu me), Gemini nhìn ảnh chấm điểm nhận ra được đối tượng ≥ PASS_SCORE
Đạt → vector_learned.add (rig + subject cho niche) → các job đang chờ được dựng lại (source_remake.retry).
"""
from __future__ import annotations

import base64
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from bkt_web import vector_learned, vector_learning
except ImportError:
    import vector_learned
    import vector_learning

ROUNDS = 3
PASS_SCORE = 6
SHEETS = vector_learned.DIR / "sheets"
FORBIDDEN = re.compile(r"\b(fillText|strokeText|measureText|fetch|XMLHttpRequest|WebSocket|import|require|eval|Function|"
                       r"document|window|globalThis|localStorage|setTimeout|setInterval|while\s*\(|Image|drawImage)\b")

_thread: Optional[threading.Thread] = None
_wake = threading.Event()
_state: Dict[str, Any] = {"busy": None, "last": None, "learned": 0, "failed": 0}


# ------------------------------------------------------------------ Gemini
def _gemini(parts: List[Dict[str, Any]], *, models=("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash")) -> Dict[str, Any]:
    try:
        from bkt_web.services import gemini
    except ImportError:
        from services import gemini
    try:  # 503/429 thường hết sau vài giây: thử lại cả chuỗi model 3 lần
        return gemini.generate_json(parts, models=models, timeout=300, rounds=3, round_delay=8)
    except gemini.GeminiError as e:
        raise RuntimeError(f"Gemini lỗi: {e}") from e


def _img(path: str | Path) -> Dict[str, Any]:
    p = Path(path)
    mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(p.read_bytes()).decode()}}


# ------------------------------------------------------------------ tầng 1: dùng lại rig có sẵn
def find_existing(name: str) -> Optional[str]:
    from bkt_web.remake_vector import catalog
    assets = catalog()["assets"]
    rows = [f"{aid}: {a.get('group', '')}" for aid, a in sorted(assets.items()) if not a.get("learned")]
    data = _gemini([{"text": (
        f"A cartoon video needs to draw: \"{name}\". Below is the list of existing vector rig ids (id: group). "
        "Pick the ONE id that depicts exactly this thing (same object, a cute chibi version is fine), or null when none "
        "really is it (a related but different object is NOT a match). Return JSON {\"asset\": \"<id>\"|null}.\n" + "\n".join(rows))}])
    aid = data.get("asset")
    return aid if isinstance(aid, str) and aid in assets else None


# ------------------------------------------------------------------ tầng 2: vẽ rig mới
STYLE = """You are a senior canvas illustrator for a cute flat cartoon library (kids' educational videos, chibi style).
Write the body of a JavaScript function `draw(ctx, s, t)` that draws ONE {name} on an HTML5 canvas 2D context.
Coordinate system: the rig's ROOT is (0, 0) at its bottom/feet; y is NEGATIVE upwards; the drawing fits in a box
about x -50..50, y -100..0 (the engine scales it by the pose height). `t` = seconds (use only for a gentle idle
wiggle, amplitude <= 2 units). `s` = pose state (ignore it).
Helpers you may call (already in scope): INK (outline colour), TAU, ellipse(ctx, x, y, rx, ry, fill, stroke, lineWidth),
path(ctx, svgPathString, fill, stroke, lineWidth), line(ctx, [[x1,y1],[x2,y2],...], stroke, lineWidth),
taper(ctx, x1, y1, x2, y2, r1, r2, fill, stroke, lineWidth), mixColor(hexA, hexB, k), clamp, smooth, mix.
Plain ctx calls are fine too (beginPath, moveTo, lineTo, quadraticCurveTo, bezierCurveTo, arc, ellipse, closePath,
fill, stroke, createLinearGradient/addColorStop, save/restore, translate, rotate, scale, globalAlpha).
Style: thick dark outlines (INK, lineWidth 1.6-2.4), 2-4 flat colours with a soft highlight, rounded friendly shapes,
recognisable silhouette, centred on x = 0, standing on y = 0. {face_rule}
Rules: NO text of any kind (no fillText/strokeText), no gore/blood, red only as a small accent, no images, no DOM,
no window/document, no loops longer than 64 iterations, no randomness (Math.random is forbidden; deterministic).
Example of a finished rig body in this library (an appendix organ):
{example}
Reference frames from the source video are attached (draw the object as it appears there, simplified).
Return JSON {{"label": "<English name>", "group": "organ|prop|tool|food|animal|plant|vehicle|building|nature",
"face": true|false, "float": true|false, "anchors": {{"root": [0,0], "center": [x,y], "top": [x,y], "grip": [x,y]{face_anchor}}},
"labels": {{"de": "<German noun|synonym>", "ko": "<Korean>", "ja": "<Japanese>"}}, "code": "<function body>"}}"""

EXAMPLE = """ellipse(ctx, -8, -2, 4.5, 2.8, '#ea580c', INK, 1.2);
ellipse(ctx, 8, -2, 4.5, 2.8, '#ea580c', INK, 1.2);
ctx.beginPath(); ctx.moveTo(-16, -70); ctx.quadraticCurveTo(-24, -40, -18, -20); ctx.quadraticCurveTo(-14, -6, 0, -6);
ctx.quadraticCurveTo(14, -6, 18, -20); ctx.quadraticCurveTo(22, -45, 14, -70); ctx.closePath();
const g = ctx.createLinearGradient(-15, -70, 15, -10); g.addColorStop(0, '#fdba74'); g.addColorStop(1, '#f472b6');
ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.0; ctx.stroke();
ellipse(ctx, -5, -55, 4, 7, 'rgba(255,255,255,0.45)', null);"""


def _prompt(name: str, feedback: str) -> str:
    organ_like = True
    face_rule = ("Organs, food, cells and small cute objects get a friendly face drawn by the engine: set face=true, leave an "
                 "empty smooth area around the face anchor and do NOT draw eyes/mouth yourself. Tools, vehicles, buildings: face=false."
                 if organ_like else "")
    text = STYLE.format(name=name, face_rule=face_rule, example=EXAMPLE, face_anchor=', "face": [x,y], "mouth": [x,y]')
    if feedback:
        text += f"\n\nYour previous attempt failed these checks, fix them:\n{feedback}"
    return text


def static_check(code: str) -> List[str]:
    errs = []
    if not code or len(code) < 80:
        errs.append("code is empty or too short")
    if len(code) > 12000:
        errs.append("code is too long (keep it under 12000 characters)")
    m = FORBIDDEN.search(code or "")
    if m:
        errs.append(f"forbidden identifier `{m.group(1)}`")
    if "Math.random" in (code or ""):
        errs.append("Math.random is forbidden (rigs must be deterministic)")
    return errs


def render_check(rid: str, spec: Dict[str, Any], out_png: Path) -> Dict[str, Any]:
    """Vẽ rig trong engine thật (mọi pack + rig mới) → lỗi, khung bao (đơn vị height), tỉ lệ pixel, tỉ lệ đỏ, ảnh PNG."""
    from playwright.sync_api import sync_playwright
    from bkt_web.remake_vector import catalog, engine_sources
    cat = catalog()
    cat["assets"][rid] = {"label": spec["label"], "group": spec["group"], "face": bool(spec.get("face")), "pack": "learned",
                          "anchors": spec["anchors"], "learned": True}
    others = {k: v for k, v in vector_learned.rigs().items() if k != rid}
    js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources() if src != vector_learned.JS)
    js += "\n;\n" + vector_learned.pack_js({**others, rid: spec})
    page_js = """
RemakeVector.register({ backgrounds: { learn_blank: { label: 'blank', theme: 'garden', ground_y: 900,
  draw(ctx, s) { const f = RemakeVector.kit.frameSpan(s); ctx.fillStyle = '#ff00ff'; ctx.fillRect(f.x0, 0, f.x1 - f.x0, 1024); } },
  learn_white: { label: 'white', theme: 'garden', ground_y: 900,
  draw(ctx, s) { const f = RemakeVector.kit.frameSpan(s); ctx.fillStyle = '#ffffff'; ctx.fillRect(f.x0, 0, f.x1 - f.x0, 1024); } } } });
window.probe = (asset) => {
  const errors = [];
  const orig = console.error; console.error = (...a) => { errors.push(a.join(' ')); orig(...a); };
  const story = (bg, x, y, h, t) => ({ id: 'p', renderer: 'native-vector-v1', duration: 2, cues: [], characters: [{ id: 'a', name: 'a', asset }],
    scenes: [{ renderer: 'native-vector-v1', kind: 'scene', start_time: 0, end_time: 2, characters_present: ['a'],
      poses: { a: [{ time: 0, x, y, height: h }] }, actions: [], background: { preset: bg } }] });
  const canvas = document.getElementById('c');
  let box = null, ink = 0, red = 0;
  try {
    for (const t of [0.1, 0.9, 1.7]) new RemakeVector.Renderer(canvas, window.cat, story('learn_blank', 288, 700, 200)).render(t);
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      if (g < 40 && r > 120 && b > 120 && Math.abs(r - b) < 40) continue;
      ink++; if (r > 150 && g < 70 && b < 70) red++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 >= x0) box = [(x0 - 288) / 200, (y0 - 700) / 200, (x1 + 1 - 288) / 200, (y1 + 1 - 700) / 200].map(v => Math.round(v * 1000) / 1000);
    new RemakeVector.Renderer(canvas, window.cat, story('learn_white', 288, 880, 640)).render(0.5);
  } catch (err) { errors.push(String(err && err.stack || err)); }
  console.error = orig;
  return { errors, box, ink, red };
};
"""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu"])
        page = browser.new_page(viewport={"width": 576, "height": 1024})
        page_errors: List[str] = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.set_content(f"<canvas id=c width=576 height=1024></canvas><script>{js}</script>"
                         f"<script>window.cat={json.dumps(cat)};</script><script>{page_js}</script>")
        res = page.evaluate("(a) => window.probe(a)", rid)
        page.locator("#c").screenshot(path=str(out_png))
        browser.close()
    res["errors"] = (res.get("errors") or []) + page_errors
    return res


def judge(name: str, png: Path) -> Dict[str, Any]:
    data = _gemini([{"text": (
        f"This is a cartoon vector drawing meant to show: \"{name}\". Score 0-10 how clearly a child would recognise it as "
        f"{name} (10 = instantly, 5 = needs the caption, 0 = something else or a blob). Also list problems (broken shapes, "
        "parts outside the object, text, scary/gory look). Return JSON {\"score\": n, \"problems\": [\"...\"]}.")}, _img(png)])
    try:
        return {"score": float(data.get("score") or 0), "problems": [str(x) for x in data.get("problems") or []][:6]}
    except (TypeError, ValueError):
        return {"score": 0.0, "problems": ["judge returned no score"]}


def check(rid: str, spec: Dict[str, Any], name: str, png: Path) -> List[str]:
    errs = static_check(spec.get("code", ""))
    if not isinstance(spec.get("anchors"), dict) or "root" not in spec["anchors"]:
        errs.append("anchors must include root [0,0]")
    if errs:
        return errs
    res = render_check(rid, spec, png)
    if res["errors"]:
        return [f"runtime error: {e[:300]}" for e in res["errors"][:3]]
    box = res.get("box")
    if not box or res["ink"] < 1500:
        return ["the drawing is empty or tiny (draw it in the -50..50 x -100..0 box)"]
    left, top, right, bottom = box
    if top > -0.25 or bottom > 0.12 or left < -0.9 or right > 0.9 or top < -1.6:
        errs.append(f"bounding box {box} (in pose heights) is off: it must stand on y=0 and reach about y=-100 (top -0.4..-1.2)")
    if res["red"] / max(res["ink"], 1) > 0.18:
        errs.append("too much pure red (looks like blood): use pinks/oranges, red only as a small accent")
    spec["extent"] = box
    if errs:
        return errs
    verdict = judge(name, png)
    spec["score"] = verdict["score"]
    if verdict["score"] < PASS_SCORE:
        return [f"a reviewer scored it {verdict['score']}/10 as '{name}': " + "; ".join(verdict["problems"]) or "not recognisable"]
    return []


def learn_new(item: Dict[str, Any]) -> Dict[str, Any]:
    name = item["name"]
    rid = "learned_" + vector_learning.slug(name)
    SHEETS.mkdir(parents=True, exist_ok=True)
    frames = [f for f in item.get("frames", []) if Path(f).is_file()][:3]
    feedback, last = "", []
    for rnd in range(1, ROUNDS + 1):
        data = _gemini([{"text": _prompt(name, feedback)}] + [_img(f) for f in frames])
        spec = {"label": str(data.get("label") or name)[:60], "group": str(data.get("group") or "prop"),
                "face": bool(data.get("face")), "float": bool(data.get("float")), "anchors": data.get("anchors") or {},
                "labels": {k: str(v)[:80] for k, v in (data.get("labels") or {}).items() if k in ("de", "ko", "ja")},
                "code": str(data.get("code") or "")}
        if spec["face"]:
            spec["face_scale"] = 0.5
        png = SHEETS / f"{rid}.png"
        last = check(rid, spec, name, png)
        if not last:
            spec.update(name=name, subject_label=f"a {name}", niches=item.get("niches", []), rounds=rnd,
                        settings=_settings(item.get("niches", [])), size="m", sheet=str(png))
            return {"rig_id": rid, "spec": spec}
        feedback = "\n".join(f"- {e}" for e in last)
    raise RuntimeError("; ".join(last)[:700])


def _settings(niches: List[str]) -> List[str]:
    from bkt_web.vector_video import niches as vn
    data = vn.load()["niches"]
    out: List[str] = []
    for n in niches:
        out += (data.get(n) or {}).get("settings", [])[:4]
    return list(dict.fromkeys(out))


# ------------------------------------------------------------------ một mục
def learn(item: Dict[str, Any]) -> str:
    name = item["name"]
    rid = "learned_" + vector_learning.slug(name)
    existing = find_existing(name)
    if existing:
        vector_learned.add(rid, {"alias_of": existing, "label": name, "name": name, "subject_label": f"a {name}",
                                 "niches": item.get("niches", []), "settings": _settings(item.get("niches", [])), "size": "m"})
        return rid
    got = learn_new(item)
    vector_learned.add(got["rig_id"], got["spec"])
    return got["rig_id"]


def run_once() -> bool:
    item = vector_learning.claim_next(max_attempts=2)
    if not item:
        return False
    _state["busy"] = item["name"]
    try:
        rid = learn(item)
        spec = vector_learned.rigs().get(rid, {})
        vector_learning.finish(item["name"], rig_id=rid, sheet=spec.get("sheet", ""))
        _state.update(learned=_state["learned"] + 1, last=f"{time.strftime('%H:%M:%S')} {item['name']} → {rid}")
        _rerender(item.get("jobs", []))
    except Exception as e:  # noqa: BLE001 — một đối tượng khó không được giết worker
        vector_learning.finish(item["name"], error=str(e), retry=item.get("attempts", 0) < 2)
        _state.update(failed=_state["failed"] + 1, last=f"{time.strftime('%H:%M:%S')} {item['name']} lỗi: {str(e)[:120]}")
    finally:
        _state["busy"] = None
    return True


def _rerender(job_ids: List[str]) -> None:
    """Dựng lại job đã xong/lỗi đang chờ đối tượng vừa học (job đang chạy để nguyên: lần sau tự có)."""
    try:
        from bkt_web import source_remake
    except ImportError:
        import source_remake
    for jid in job_ids:
        try:
            if source_remake.load(jid).get("status") in ("done", "error"):
                source_remake.retry(jid)
        except Exception:  # noqa: BLE001
            pass


def _loop() -> None:
    while True:
        try:
            worked = run_once()
        except Exception as e:  # noqa: BLE001
            _state["last"] = f"loop: {e}"
            worked = False
        if not worked:
            _wake.wait(60)
            _wake.clear()


def start() -> None:
    global _thread
    if os.environ.get("TOKMATRIX_VECTOR_LEARNER", "1") == "0" or (_thread and _thread.is_alive()):
        return
    _thread = threading.Thread(target=_loop, name="vector-learner", daemon=True)
    _thread.start()


def wake() -> None:
    _wake.set()


def status() -> Dict[str, Any]:
    return {"running": bool(_thread and _thread.is_alive()), **_state}
