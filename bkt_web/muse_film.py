"""Phim AI (Muse): ý tưởng → nhiều cảnh → mỗi cảnh một clip video Muse (~5 s) → ghép thành một phim.

Dự án ở storage/muse_films/<id>/ (project.json + clips/sceneNN.mp4 + film.mp4). Một luồng nền chạy lần lượt các dự án:
kịch bản (Gemini, dự phòng: tách dòng người dùng nhập) → clip từng cảnh qua muse.ai (Chrome CDP, khoá chung với ảnh Muse)
→ ffmpeg ghép (chuyển cảnh hoà 0,4 s, chuẩn hoá 720×1280 24 fps). Cảnh lỗi thử lại 2 lần rồi đánh dấu lỗi; nút "tạo lại"
chỉ làm lại cảnh đó.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import subprocess
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from bkt_web import muse_image
except ImportError:
    import muse_image

BASE = Path(__file__).resolve().parent / "storage" / "muse_films"
TIMEOUT = int(os.environ.get("TOKMATRIX_MUSE_VIDEO_TIMEOUT", "600"))
ASPECTS = {"9:16": (720, 1280, "vertical 9:16"), "16:9": (1280, 720, "horizontal 16:9"), "1:1": (960, 960, "square 1:1")}
STYLES = {
    "cinematic": "cinematic film look, photorealistic, anamorphic lens, dramatic lighting, rich colour grade",
    "anime": "high quality anime film style, detailed backgrounds, soft lighting",
    "3d": "3D animated feature film style, Pixar-like lighting, expressive characters",
    "documentary": "nature documentary look, photorealistic, natural light, handheld camera",
}

_lock = threading.Lock()
_wake = threading.Event()
_thread: Optional[threading.Thread] = None

_VIDEOS = "()=>[...document.querySelectorAll('video')].filter(v=>(v.videoWidth>=600||v.videoHeight>=600)&&(v.currentSrc||v.src||'').startsWith('blob:')).length"
_LAST_VIDEO = """async()=>{const vs=[...document.querySelectorAll('video')].filter(v=>(v.videoWidth>=600||v.videoHeight>=600)&&(v.currentSrc||v.src||'').startsWith('blob:'));
 const v=vs.pop(); if(!v||!(v.duration>0)) return null; const b=await (await fetch(v.currentSrc||v.src)).blob();
 const buf=new Uint8Array(await b.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));
 return {w:v.videoWidth,h:v.videoHeight,d:v.duration,type:b.type,b64:btoa(s)}}"""


# ------------------------------------------------------------------ lưu trữ
def _dir(pid: str) -> Path:
    if not re.fullmatch(r"[a-z0-9]{6,20}", pid or ""):
        raise ValueError("id không hợp lệ")
    return BASE / pid


def load(pid: str) -> Dict[str, Any]:
    return json.loads((_dir(pid) / "project.json").read_text())


def save(p: Dict[str, Any]) -> None:
    d = _dir(p["id"])
    d.mkdir(parents=True, exist_ok=True)
    p["updated"] = int(time.time())
    tmp = d / "project.json.tmp"
    tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1))
    tmp.replace(d / "project.json")


def list_projects() -> List[Dict[str, Any]]:
    out = []
    if BASE.exists():
        for f in BASE.glob("*/project.json"):
            try:
                out.append(json.loads(f.read_text()))
            except Exception:
                pass
    return sorted(out, key=lambda p: -p.get("created", 0))


def shot_text(line: str) -> str:
    """Một dòng ý tưởng → mô tả cảnh: bỏ dấu trích dẫn Markdown (">"), gạch đầu dòng, số thứ tự và "**";
    trả "" khi không còn chữ nào (Muse nhận "Shot: >" là mô tả rỗng)."""
    t = re.sub(r"^\s*(?:>\s*)+", "", line or "")
    t = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s+", "", t).replace("**", "").strip()
    return t if re.search(r"\w", t) else ""


def create(idea: str, scenes: int, style: str, aspect: str, keep_audio: bool, title: str = "") -> Dict[str, Any]:
    pid = uuid.uuid4().hex[:10]
    lines = [t for t in (shot_text(l) for l in idea.splitlines()) if t]
    manual = lines if len(lines) >= 2 else []
    p = {"id": pid, "title": title or idea.strip().splitlines()[0][:60], "idea": idea, "n": max(2, min(30, scenes)),
         "style": style if style in STYLES else "cinematic", "aspect": aspect if aspect in ASPECTS else "9:16",
         "keep_audio": bool(keep_audio), "status": "queued", "created": int(time.time()), "scenes": [],
         "manual": manual, "cast": [], "error": ""}
    save(p)
    _wake.set()
    return p


# ------------------------------------------------------------------ kịch bản
PLAN = """You are a film director. Turn the idea below into a short film of exactly {n} consecutive shots, each ~5 seconds of video.
Define the recurring cast (max 4) with a precise fixed look (age, ethnicity, hair, face, outfit) so a video model draws them identically.
For each shot write a vivid video prompt: framing, camera movement, action, setting, lighting; mention cast by their look; no on-screen text.
The shots must tell the story in order with clear visual continuity (same places, same outfits).
Return JSON {{"title": "...", "cast":[{{"id","look"}}], "shots":[{{"prompt","camera"}}]}}. Idea (any language):
{idea}"""


def _gemini(prompt: str) -> Dict[str, Any]:
    try:
        from bkt_web.key_vault import get_key
    except ImportError:
        from key_vault import get_key
    key = get_key("ai.gemini")
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json"}}).encode()
    last = None
    for model in ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"):
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}", body, {"Content-Type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=180))
            return json.loads(r["candidates"][0]["content"]["parts"][0]["text"])
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"Gemini không trả kịch bản: {last}")


def plan(p: Dict[str, Any]) -> None:
    if p["scenes"]:
        return
    style = STYLES[p["style"]]
    if p["manual"]:
        shots = [{"prompt": l} for l in p["manual"][:30]]
        cast = []
    else:
        data = _gemini(PLAN.format(n=p["n"], idea=p["idea"]))
        shots, cast = data.get("shots", [])[: p["n"]], data.get("cast", [])
        p["title"] = data.get("title") or p["title"]
    bible = "; ".join(f"{c.get('id')}: {c.get('look')}" for c in cast)
    fmt = ASPECTS[p["aspect"]][2]
    p["cast"] = cast
    p["scenes"] = [{
        "i": i, "text": s.get("prompt", ""), "status": "pending", "tries": 0, "error": "",
        "prompt": (f"Generate one short video clip (about 5 seconds), {fmt} format, no on-screen text, no subtitles, no watermark. "
                   f"Style: {style}. " + (f"Recurring characters (keep identical): {bible}. " if bible else "") + f"Shot: {s.get('prompt', '')}"),
    } for i, s in enumerate(shots)]


# ------------------------------------------------------------------ clip Muse
async def _clip(prompt: str) -> Dict[str, Any]:
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(muse_image.CDP)
        pages = [pg for ctx in browser.contexts for pg in ctx.pages if "muse.ai" in pg.url]
        if not pages:
            raise RuntimeError("Chrome Muse chưa mở trang muse.ai")
        page = pages[0]
        box = page.locator("textarea[placeholder='Message']")
        if await box.count() == 0:
            raise RuntimeError("Muse chưa đăng nhập — đăng nhập lại qua noVNC")
        await muse_image.keep_awake(page)
        before = await page.evaluate(_VIDEOS)
        await box.fill(prompt)
        await box.press("Enter")
        t0 = time.time()
        while time.time() - t0 < TIMEOUT:
            await asyncio.sleep(5)
            if await page.evaluate(_VIDEOS) > before:
                for _ in range(6):
                    data = await page.evaluate(_LAST_VIDEO)
                    if data:
                        return {"raw": base64.b64decode(data["b64"]), "w": data["w"], "h": data["h"], "d": data["d"], "sec": round(time.time() - t0)}
                    await asyncio.sleep(3)
        raise RuntimeError(f"Muse không trả video sau {TIMEOUT}s")


def make_clip(prompt: str) -> Dict[str, Any]:
    with muse_image.MUSE_LOCK:
        return asyncio.run(_clip(prompt))


# ------------------------------------------------------------------ ghép phim
def assemble(p: Dict[str, Any]) -> Path:
    d = _dir(p["id"])
    w, h, _ = ASPECTS[p["aspect"]]
    clips = [d / "clips" / f"scene{s['i']:02d}.mp4" for s in p["scenes"] if s["status"] == "done"]
    if not clips:
        raise RuntimeError("Chưa có clip nào")
    norm = []
    for c in clips:  # chuẩn hoá cỡ/fps/âm thanh để xfade/acrossfade chạy được
        n = c.with_suffix(".norm.mp4")
        vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps=24,format=yuv420p"
        has_audio = bool(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(c)], capture_output=True, text=True).stdout.strip())
        if has_audio and p["keep_audio"]:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(c), "-vf", vf, "-af", "aresample=44100", "-ac", "2", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac", str(n)]
        else:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(c), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest", "-vf", vf, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac", str(n)]
        subprocess.run(cmd, check=True)
        norm.append(n)
    out = d / "film.mp4"
    if len(norm) == 1:
        norm[0].replace(out)
        return out
    durs = [float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(n)], capture_output=True, text=True).stdout) for n in norm]
    fade = 0.4
    inputs, vparts, aparts = [], [], []
    for n in norm:
        inputs += ["-i", str(n)]
    vprev, aprev, offset = "[0:v]", "[0:a]", 0.0
    for k in range(1, len(norm)):
        offset += durs[k - 1] - fade
        vparts.append(f"{vprev}[{k}:v]xfade=transition=fade:duration={fade}:offset={offset:.3f}[v{k}]")
        aparts.append(f"{aprev}[{k}:a]acrossfade=d={fade}[a{k}]")
        vprev, aprev = f"[v{k}]", f"[a{k}]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(vparts + aparts),
                    "-map", vprev, "-map", aprev, "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac", "-movflags", "+faststart", str(out)], check=True)
    for n in norm:
        n.unlink(missing_ok=True)
    return out


# ------------------------------------------------------------------ luồng nền
def _stopped(pid: str) -> bool:
    try:
        return load(pid).get("status") == "stopped"
    except Exception:  # noqa: BLE001
        return False


def process(pid: str) -> None:
    p = load(pid)

    def save(p):  # nút Dừng ghi "stopped" lên đĩa trong lúc một clip đang chạy — không được ghi đè
        if _stopped(pid):
            p["status"] = "stopped"
        globals()["save"](p)
    try:
        p["status"] = "planning"; save(p)
        plan(p)
        p["status"] = "rendering"; save(p)
        (_dir(pid) / "clips").mkdir(exist_ok=True)
        for s in p["scenes"]:
            if s["status"] in ("done", "skipped"):
                continue
            if not shot_text(s.get("text", "")):  # dự án tạo trước khi lọc dòng ">" / dòng trống
                s.update(status="skipped", error=""); save(p)
                continue
            if _stopped(pid):
                return
            while s["tries"] < 2 and s["status"] != "done" and p["status"] != "stopped":
                s["status"] = "running"; save(p)
                try:
                    got = make_clip(s["prompt"])
                    (_dir(pid) / "clips" / f"scene{s['i']:02d}.mp4").write_bytes(got["raw"])
                    s.update(status="done", error="", seconds=got["sec"], size=[got["w"], got["h"]], duration=round(got["d"], 2))
                except Exception as e:  # noqa: BLE001
                    s["tries"] += 1
                    s.update(status="error" if s["tries"] >= 2 else "pending", error=str(e)[:300])
                save(p)
            if p["status"] == "stopped":
                return
        p["status"] = "assembling"; save(p)
        assemble(p)
        bad = [s["i"] for s in p["scenes"] if s["status"] not in ("done", "skipped")]
        p.update(status="done" if not bad else "partial", error=f"cảnh lỗi: {bad}" if bad else "")
    except Exception as e:  # noqa: BLE001
        p.update(status="error", error=str(e)[:500])
    save(p)


def _loop() -> None:
    while True:
        todo = [p for p in list_projects()[::-1] if p.get("status") in ("queued", "planning", "rendering", "assembling")]
        if todo:
            with _lock:
                try:
                    process(todo[0]["id"])
                except Exception as e:  # noqa: BLE001 — project.json hỏng không được giết luồng nền
                    print(f"[muse-film] {todo[0].get('id')}: {e}")
                    time.sleep(30)
            continue
        _wake.wait(30)
        _wake.clear()


def start() -> None:
    global _thread
    if os.environ.get("TOKMATRIX_MUSE", "1") == "0" or (_thread and _thread.is_alive()):
        return
    BASE.mkdir(parents=True, exist_ok=True)
    _thread = threading.Thread(target=_loop, name="muse-film", daemon=True)
    _thread.start()


def retry_scene(pid: str, i: int) -> Dict[str, Any]:
    p = load(pid)
    for s in p["scenes"]:
        if s["i"] == i:
            s.update(status="pending", tries=0, error="")
            if s.get("prompt_edit"):
                s["prompt"] = s["prompt_edit"]
    p["status"] = "rendering"
    save(p)
    _wake.set()
    return p


def stop(pid: str) -> Dict[str, Any]:
    p = load(pid)
    if p["status"] not in ("done", "error"):
        p["status"] = "stopped"
    save(p)
    return p


def resume(pid: str) -> Dict[str, Any]:
    p = load(pid)
    p["status"] = "rendering" if p["scenes"] else "queued"
    save(p)
    _wake.set()
    return p
