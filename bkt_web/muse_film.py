"""Phim AI (Muse): ý tưởng → nhiều cảnh → mỗi cảnh một clip video Muse (~5 s) → ghép thành một phim.

Dự án ở storage/muse_films/<id>/ (project.json + clips/sceneNN.mp4 + film.mp4). Một luồng nền chạy lần lượt các dự án:
kịch bản (Gemini, dự phòng: tách dòng người dùng nhập) → clip từng cảnh qua muse.ai (Chrome CDP, khoá chung với ảnh Muse)
(nhiều tài khoản Muse: các cảnh chia cho các tài khoản rảnh, quay song song) → ffmpeg ghép (chuyển cảnh hoà 0,4 s, chuẩn hoá 720×1280 24 fps). Cảnh lỗi thử lại 2 lần rồi đánh dấu lỗi; nút "tạo lại"
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

# Muse chỉ giữ vài video gần nhất trong DOM (video cũ bị gỡ khi chat dài), nên không đếm video mà nhận
# video mới theo địa chỉ blob: chưa từng thấy trước khi gửi prompt.
_VIDEOS = "()=>[...document.querySelectorAll('video')].filter(v=>(v.videoWidth>=600||v.videoHeight>=600)&&(v.currentSrc||v.src||'').startsWith('blob:')).map(v=>v.currentSrc||v.src)"
_GET_VIDEO = """async(src)=>{const v=[...document.querySelectorAll('video')].filter(v=>(v.currentSrc||v.src)===src).pop();
 if(!v||!(v.duration>0)) return null; const b=await (await fetch(src)).blob();
 const buf=new Uint8Array(await b.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));
 return {w:v.videoWidth,h:v.videoHeight,d:v.duration,type:b.type,b64:btoa(s)}}"""


# ------------------------------------------------------------------ lưu trữ
def _dir(pid: str) -> Path:
    if not re.fullmatch(r"[a-z0-9]{6,20}", pid or ""):
        raise ValueError("id không hợp lệ")
    return BASE / pid


def load(pid: str) -> Dict[str, Any]:
    return json.loads((_dir(pid) / "project.json").read_text())


_SAVE_LOCK = threading.Lock()


def save(p: Dict[str, Any]) -> None:
    """Ghi project.json nguyên tử. Nhiều luồng ghi cùng dự án (các tài khoản Muse quay song song, muse_remake đánh dấu
    quay lại): mỗi lần ghi một file tạm riêng + khoá, nếu không hai luồng chung một .tmp sẽ trộn nội dung."""
    d = _dir(p["id"])
    d.mkdir(parents=True, exist_ok=True)
    p["updated"] = int(time.time())
    text = json.dumps(p, ensure_ascii=False, indent=1)
    with _SAVE_LOCK:
        tmp = d / f"project.json.{os.getpid()}.{threading.get_ident()}.tmp"
        tmp.write_text(text)
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


def create_shots(title: str, shots: List[Dict[str, Any]], aspect: str = "9:16", keep_audio: bool = False,
                 origin: str = "") -> Dict[str, Any]:
    """Dự án có sẵn từng cảnh (prompt Muse, chữ hiển thị, ảnh mẫu `ref`), bỏ bước viết kịch bản. Dùng cho remake video nguồn."""
    pid = uuid.uuid4().hex[:10]
    p = {"id": pid, "title": title[:80] or pid, "idea": "\n".join(s.get("text", "") for s in shots), "n": len(shots),
         "style": "cinematic", "aspect": aspect if aspect in ASPECTS else "9:16", "keep_audio": bool(keep_audio),
         "status": "rendering", "created": int(time.time()), "manual": [], "cast": [], "error": "", "origin": origin,
         "scenes": [{"i": i, "text": s.get("text") or s["prompt"], "prompt": s["prompt"], "ref": s.get("ref"),
                     "status": "pending", "tries": 0, "error": ""} for i, s in enumerate(shots)]}
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
        from bkt_web.services import gemini
    except ImportError:
        from services import gemini
    try:
        return gemini.generate_json(prompt, models=gemini.FLASH_CHAIN)
    except gemini.GeminiError as e:
        raise RuntimeError(f"Gemini không trả kịch bản: {e}") from e


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
# Tin cuối của chat: tin của mình bắt đầu bằng "You:" (khung group/msg), tin Muse là khung touch:select-none.
_LAST_MSG = """()=>{const m=[...document.querySelectorAll('[class*=message],[class*=Message],[class*="group/msg"],[class*="touch:select-none"]')]
 .filter(e=>(e.innerText||'').trim()); const e=m[m.length-1]; return e ? (e.innerText||'').trim().slice(0,600) : ''}"""
REFUSAL = re.compile(r"(can[’']?t|cannot|unable to|won[’']?t be able to|not able to) (make|do|create|help|generate)", re.I)
OFFER = re.compile(r"\?\s*$|want (that|me|it)|if you('d)? like|i (could|can) (do|make)", re.I)
ACCEPT = "Yes, please make that version as a 9:16 video clip."


async def _attach(page, ref: str) -> None:
    """Đính kèm ảnh mẫu (khung hình gốc) vào ô chat Muse rồi chờ ảnh tải lên xong."""
    before = await page.evaluate("document.querySelectorAll('img').length")
    await page.locator("input[type=file]").first.set_input_files(ref)
    for _ in range(40):  # ≤ 20 s: ảnh xem trước hiện trong ô chat
        await asyncio.sleep(0.5)
        if await page.evaluate("document.querySelectorAll('img').length") > before:
            break
    await asyncio.sleep(2)  # chờ tải lên máy chủ Muse (nút gửi bị khoá trong lúc tải)


async def _clip(prompt: str, cdp: str, ref: Optional[str] = None) -> Dict[str, Any]:
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(cdp)
        pages = [pg for ctx in browser.contexts for pg in ctx.pages if "muse.ai" in pg.url]
        if not pages:
            raise RuntimeError("Chrome Muse chưa mở trang muse.ai")
        page = pages[0]
        box = page.locator("textarea[placeholder='Message']")
        if await box.count() == 0:
            raise RuntimeError("Muse chưa đăng nhập — đăng nhập lại qua noVNC")
        await muse_image.keep_awake(page)
        seen = set(await page.evaluate(_VIDEOS))
        if ref and Path(ref).is_file():
            await _attach(page, ref)
        await box.fill(prompt)
        await box.press("Enter")
        t0 = time.time()
        accepted = False
        while time.time() - t0 < TIMEOUT:
            await asyncio.sleep(5)
            last = await page.evaluate(_LAST_MSG)
            if last and not last.startswith("You") and REFUSAL.search(last):
                # Muse từ chối (bạo lực, chép phong cách…): nhận phương án Muse tự đề nghị một lần, không thì báo lỗi ngay
                if accepted or not OFFER.search(last):
                    raise RuntimeError(f"Muse từ chối: {last[:300]}")
                accepted = True
                await box.fill(ACCEPT)
                await box.press("Enter")
                await asyncio.sleep(3)
                continue
            new = [src for src in await page.evaluate(_VIDEOS) if src not in seen]
            if new:
                for _ in range(6):
                    data = await page.evaluate(_GET_VIDEO, new[-1])
                    if data:
                        return {"raw": base64.b64decode(data["b64"]), "w": data["w"], "h": data["h"], "d": data["d"], "sec": round(time.time() - t0)}
                    await asyncio.sleep(3)
        raise RuntimeError(f"Muse không trả video sau {TIMEOUT}s")


BATCH = max(1, min(10, int(os.environ.get("TOKMATRIX_MUSE_BATCH", "10"))))  # cảnh tối đa mỗi tin nhắn (Muse: ≤ 10 subagent)
BATCH_WAIT = int(os.environ.get("TOKMATRIX_MUSE_BATCH_WAIT", "900"))
BATCH_REFS = os.environ.get("TOKMATRIX_MUSE_BATCH_REFS", "0") == "1"
# Tin của mình chưa tới Muse (gửi hỏng): Muse hiện chữ này dưới tin.
_UNDELIVERED = """()=>{const m=[...document.querySelectorAll('[class*="group/msg"]')]; const e=m[m.length-1];
 return !!e && /Delivery not confirmed|Not delivered|Failed to send/i.test(e.innerText||'')}"""


class BatchIncomplete(RuntimeError):
    """Lô không về đủ clip (Muse từ chối một cảnh, quá giờ…): các cảnh của lô quay lại từng cảnh một."""


def batch_prompt(prompts: List[str], with_refs: bool) -> str:
    """Một tin nhắn cho cả lô: phần chung (khung, phong cách, luật) một lần + từng cảnh đánh số."""
    head = prompts[0].rpartition("Shot: ")[0] if "Shot: " in prompts[0] else ""
    head = head.replace("Use the attached blurry picture only as a loose reference for the layout and colour mood, drawn in your own way. ", "")
    shots = [pr.rpartition("Shot: ")[2] if "Shot: " in pr else pr for pr in prompts]
    refs = (f"The {len(prompts)} attached blurry pictures are loose references for the layout and colour mood of the clips "
            "in the same order (picture 1 for clip 1, …); draw them in your own way. ") if with_refs else ""
    return (f"Generate these {len(prompts)} short video clips in parallel, one subagent per clip, and return them in exactly "
            f"this order. Each clip: {head.replace('Generate one short video clip', 'one short video clip').strip()} {refs}\n"
            + "\n".join(f"{i + 1}. {sh.strip()}" for i, sh in enumerate(shots)))


async def _clip_batch(prompts: List[str], cdp: str, refs: List[Optional[str]]) -> List[Dict[str, Any]]:
    """Một tin nhắn N cảnh → N clip theo đúng thứ tự (thứ tự video trong trang = thứ tự đã liệt kê, đã thử 08/10).
    Chỉ nhận khi về ĐỦ N clip; thiếu (từ chối một cảnh, quá giờ) → BatchIncomplete, không đoán clip nào của cảnh nào."""
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(cdp)
        pages = [pg for ctx in browser.contexts for pg in ctx.pages if "muse.ai" in pg.url]
        if not pages:
            raise RuntimeError("Chrome Muse chưa mở trang muse.ai")
        page = pages[0]
        box = page.locator("textarea[placeholder='Message']")
        if await box.count() == 0:
            raise RuntimeError("Muse chưa đăng nhập — đăng nhập lại qua noVNC")
        await muse_image.keep_awake(page)
        seen = set(await page.evaluate(_VIDEOS))
        # Lô không kèm ảnh mẫu: tin kèm 4 ảnh đứng ở "Delivery not confirmed" (08/10); phong cách đã tả bằng chữ.
        files = [r for r in refs if r and Path(r).is_file()] if BATCH_REFS else []
        with_refs = bool(files) and len(files) == len(prompts)
        if with_refs:
            before = await page.evaluate("document.querySelectorAll('img').length")
            await page.locator("input[type=file]").first.set_input_files(files)
            for _ in range(60):
                await asyncio.sleep(0.5)
                if await page.evaluate("document.querySelectorAll('img').length") >= before + len(files):
                    break
            await asyncio.sleep(3)
        await box.fill(batch_prompt(prompts, with_refs))
        await box.press("Enter")
        t0, last_new, count = time.time(), time.time(), 0
        while time.time() - t0 < BATCH_WAIT:
            await asyncio.sleep(5)
            new = [src for src in await page.evaluate(_VIDEOS) if src not in seen]
            if not new and time.time() - t0 > 45 and await page.evaluate(_UNDELIVERED):
                raise BatchIncomplete("tin nhắn lô không tới được Muse (Delivery not confirmed)")
            if len(new) != count:
                count, last_new = len(new), time.time()
            if count >= len(prompts):
                await asyncio.sleep(8)  # clip cuối vừa hiện: đợi blob tải xong
                new = [src for src in await page.evaluate(_VIDEOS) if src not in seen][:len(prompts)]
                out = []
                for src in new:
                    data = None
                    for _ in range(6):
                        data = await page.evaluate(_GET_VIDEO, src)
                        if data:
                            break
                        await asyncio.sleep(3)
                    if not data:
                        raise BatchIncomplete("không đọc được một clip của lô")
                    out.append({"raw": base64.b64decode(data["b64"]), "w": data["w"], "h": data["h"], "d": data["d"],
                                "sec": round(time.time() - t0)})
                return out
            last = await page.evaluate(_LAST_MSG)
            refused = last and not last.startswith("You") and REFUSAL.search(last)
            if refused and time.time() - last_new > 90:  # Muse đã trả lời (từ chối một phần) và không còn clip nào về thêm
                raise BatchIncomplete(f"lô về {count}/{len(prompts)} clip, Muse: {last[:200]}")
        raise BatchIncomplete(f"lô về {count}/{len(prompts)} clip sau {BATCH_WAIT}s")


def make_batch(prompts: List[str], label: str = "batch", refs: Optional[List[Optional[str]]] = None) -> List[Dict[str, Any]]:
    with muse_image.account(label) as cdp:
        got = asyncio.run(_clip_batch(prompts, cdp, refs or [None] * len(prompts)))
    for g_ in got:
        g_["account"] = cdp
    return got


SOFTEN = """A video model (Muse) refused to generate this shot for a family-friendly cartoon. Its reply was:
"{refusal}"
Rewrite ONLY the shot description so it keeps the same story beat but is clearly safe: no babies or unborn babies,
no bodies or body-part close-ups, no toilet/bathroom or bodily-function humour, no weapons, nobody hurt or scared,
no real people or existing characters. Use cute mascot characters, objects or a visual metaphor instead.
Keep it one or two sentences, English, about 5 seconds of action. Return JSON {{"shot": "..."}}.
Shot: {shot}"""


def soften(prompt: str, refusal: str) -> str:
    """Prompt cảnh Muse từ chối → bản viết lại an toàn hơn (chỉ phần sau "Shot:"; phần đầu — khung, phong cách — giữ nguyên)."""
    head, sep, shot = prompt.rpartition("Shot: ")
    if not sep:
        head, shot = "", prompt
    new = str((_gemini(SOFTEN.format(refusal=refusal[:500], shot=shot[:1200])) or {}).get("shot") or "").strip()
    if not new:
        raise RuntimeError("Gemini không viết lại được cảnh Muse từ chối")
    return f"{head}{sep}{new}" if sep else new


def _is_refusal(error: str) -> bool:
    return (error or "").startswith("Muse từ chối")


def make_clip(prompt: str, label: str = "clip", ref: Optional[str] = None) -> Dict[str, Any]:
    with muse_image.account(label) as cdp:
        got = asyncio.run(_clip(prompt, cdp, ref))
    got["account"] = cdp
    return got


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
        todo = []
        for s in p["scenes"]:
            if s["status"] in ("done", "skipped"):
                continue
            if not shot_text(s.get("text", "")):  # dự án tạo trước khi lọc dòng ">" / dòng trống
                s.update(status="skipped", error=""); save(p)
                continue
            if s["status"] == "running":  # web app khởi động lại giữa lúc quay
                s["status"] = "pending"
            todo.append(s)
        guard = threading.Lock()  # các luồng cùng sửa p và ghi project.json

        def shoot(s):
            while s["tries"] < 2 and s["status"] != "done" and p["status"] != "stopped":
                if _stopped(pid):
                    with guard:
                        p["status"] = "stopped"
                    return
                if s.get("soften") or _is_refusal(s.get("error", "")):
                    # Muse từ chối lần trước: viết lại cảnh an toàn hơn và bỏ ảnh mẫu (ảnh gốc có thể chính là lý do)
                    try:
                        new = soften(s["prompt"], s.get("error", ""))
                        with guard:
                            s.update(prompt=new, ref=None, soften=False, softened=s.get("softened", 0) + 1)
                    except Exception as e:  # noqa: BLE001 — viết lại hỏng thì vẫn thử prompt cũ
                        print(f"[muse-film] soften {pid}/{s['i']}: {e}", flush=True)
                with guard:
                    s["status"] = "running"; save(p)
                try:
                    got = make_clip(s["prompt"], f"{pid} cảnh {s['i'] + 1}", s.get("ref"))
                    (_dir(pid) / "clips" / f"scene{s['i']:02d}.mp4").write_bytes(got["raw"])
                    upd = dict(status="done", error="", seconds=got["sec"], size=[got["w"], got["h"]], duration=round(got["d"], 2), account=got["account"])
                except Exception as e:  # noqa: BLE001
                    s["tries"] += 1
                    upd = dict(status="error" if s["tries"] >= 2 else "pending", error=str(e)[:300])
                with guard:
                    s.update(upd); save(p)

        def shoot_batch(chunk):
            """Một lô cảnh trong một tin nhắn (Muse chạy song song); lô thiếu clip → từng cảnh một như cũ."""
            fresh = [x for x in chunk if not (x.get("soften") or _is_refusal(x.get("error", "")))]
            if len(fresh) >= 2 and not _stopped(pid):
                with guard:
                    for x in fresh:
                        x["status"] = "running"
                    save(p)
                try:
                    got = make_batch([x["prompt"] for x in fresh], f"{pid} lô {fresh[0]['i'] + 1}-{fresh[-1]['i'] + 1}",
                                     [x.get("ref") for x in fresh])
                    with guard:
                        for x, clip in zip(fresh, got):
                            (_dir(pid) / "clips" / f"scene{x['i']:02d}.mp4").write_bytes(clip["raw"])
                            x.update(status="done", error="", seconds=clip["sec"], size=[clip["w"], clip["h"]],
                                     duration=round(clip["d"], 2), account=clip["account"], batch=len(fresh))
                        save(p)
                except Exception as e:  # noqa: BLE001 — lô hỏng: không mất cảnh nào, quay lẻ
                    print(f"[muse-film] lô {pid}: {e}", flush=True)
                    with guard:
                        for x in fresh:
                            if x["status"] != "done":
                                x["status"] = "pending"
                        save(p)
            for x in chunk:
                if x["status"] != "done":
                    shoot(x)

        # Chia đều cho các tài khoản Muse, mỗi lô tối đa BATCH (Muse chạy mỗi clip một subagent, tối đa 10 song song)
        size = max(1, min(BATCH, -(-len(todo) // max(1, len(muse_image.ACCOUNTS)))))
        chunks = [todo[k:k + size] for k in range(0, len(todo), size)]
        workers = max(1, min(len(muse_image.ACCOUNTS), len(chunks)))
        if chunks:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(workers, thread_name_prefix=f"muse-film-{pid}") as pool:
                list(pool.map(shoot_batch, chunks))
        if p["status"] == "stopped" or _stopped(pid):
            p["status"] = "stopped"; save(p)
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
            # bấm "Quay lại" một cảnh Muse đã từ chối: gửi y nguyên thì Muse lại từ chối, nên lần quay tới viết lại cảnh
            s.update(status="pending", tries=0, error="", soften=_is_refusal(s.get("error", "")) or bool(s.get("soften")))
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
