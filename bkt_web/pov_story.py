"""Thử nghiệm video "POV" kể chuyện minh hoạ (kiểu kênh YouTube "POV: You quietly outgrew…").

Một nhân vật chính cố định (mô tả trong `character`, gắn vào mọi prompt ảnh), giọng kể ngôi thứ hai suy ngẫm,
ảnh minh hoạ 2D nét mảnh, máy quay lia/zoom chậm, phụ đề, nhạc nền nhẹ. Xuất 9:16 và 16:9 từ cùng kịch bản
(mỗi khung một bộ ảnh riêng, không cắt ảnh).

  python3 -m bkt_web.pov_story --topic "You quietly stopped chasing status" --lang en --scenes 18 [--out DIR]

Ảnh: hàng đợi Antigravity dùng chung. Lời: compare_studio/tools/tts-line.mjs (muse_remake._tts).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import uuid
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List

try:
    from bkt_web import muse_remake
    from bkt_web.services import gemini
except ImportError:
    import muse_remake
    from services import gemini

BASE = Path(__file__).resolve().parent / "storage" / "pov_story"
FRAMES = {"9:16": (1080, 1920), "16:9": (1920, 1080)}
LANG_NAMES = {"en": "English", "de": "German", "ko": "Korean", "ja": "Japanese"}

PLAN = """Write a short reflective "POV" story video in {lang}, second person ("You…"), about: {topic}
Calm, thoughtful narration about money, work and quietly choosing a different life than everyone around you.
No real people, brands or company names. {n} scenes, each ONE narration sentence of 10 to 18 words ({cjk}).
Invent ONE original main character who appears in every scene, described precisely so an illustrator draws him/her
identically every time (age, hair, face, one signature outfit with colours, one accessory). Do NOT use a dark navy polo
shirt, khaki trousers or dark curly hair (that look belongs to another channel).
For each scene write "shot": an English illustration prompt (setting, what the main character does, other people,
mood, time of day). No text, signs, numbers or screens with readable words in the picture.
Also write "caption": one or two {lang} sentences for the post (no hashtags).
Return JSON {{"title": "...", "caption": "...", "character": "...", "scenes": [{{"line": "...", "shot": "..."}}]}}"""

FIXED_CHARACTER = """The main character is FIXED (the channel's recurring character); use exactly this person in every scene and
copy this description into "character" unchanged: {character}"""

STYLE = ("Hand-drawn 2D editorial illustration, clean thin dark ink outlines, soft muted watercolor-like colors, "
         "gentle cel shading, warm natural light, calm storybook mood, detailed but uncluttered background, "
         "no text, no letters, no logos, no watermark")

IMAGE_POLL_SECONDS = max(1, int(os.environ.get("TOKMATRIX_POV_IMAGE_POLL_SECONDS", "15")))
IMAGE_WAIT_MINUTES = max(1, int(os.environ.get("TOKMATRIX_POV_IMAGE_WAIT_MINUTES", "240")))
IMAGE_MAX_ATTEMPTS = 3
IMAGE_STATE_FILE = "antigravity_images.json"


def _image_backend():
    """Import lazily so script/planner-only hosts do not need image-worker dependencies."""
    try:
        from bkt_web import image_routes
    except ImportError:
        import image_routes
    return image_routes


def plan(topic: str, language: str, n: int, character: str = "") -> Dict[str, Any]:
    cjk = "count characters, 25 to 45 characters, no spaces between words" if language == "ja" else "plain sentences"
    prompt = PLAN.format(lang=LANG_NAMES[language], topic=topic, n=n, cjk=cjk)
    if character:  # nhân vật cố định của kênh (pov_channel): không để Gemini nghĩ nhân vật mới
        prompt += "\n" + FIXED_CHARACTER.format(character=character)
    data = gemini.generate_json(prompt, rounds=2)
    if character:
        data["character"] = character
    scenes = [s for s in data.get("scenes") or [] if s.get("line") and s.get("shot")][:n]
    if len(scenes) < max(6, n // 2) or not data.get("character"):
        raise RuntimeError("Gemini trả kịch bản thiếu cảnh hoặc thiếu nhân vật")
    return {"title": str(data.get("title") or topic)[:120], "caption": str(data.get("caption") or "")[:300],
            "character": str(data["character"])[:600], "scenes": scenes}


def _image_task(task_id: str) -> Dict[str, Any]:
    """Read one shared image-queue task without going through the HTTP server."""
    image_routes = _image_backend()
    conn = image_routes._db()
    try:
        row = conn.execute(
            "SELECT status, image_filename, model, error_message FROM image_queue WHERE id=?", (task_id,)
        ).fetchone()
    finally:
        conn.close()
    return dict(zip(("status", "image_filename", "model", "error_message"), row)) if row else {}


def _write_image_state(path: Path, state: Dict[str, Any]) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def draw(work: Path, story: Dict[str, Any], ratio: str) -> List[Path]:
    """One image per scene, submitted to the shared Antigravity queue.

    Task ids are persisted next to the frames, so a worker retry or server restart
    resumes the same requests instead of charging/drawing duplicates.
    """
    image_routes = _image_backend()
    folder = work / ratio.replace(":", "x")
    folder.mkdir(parents=True, exist_ok=True)
    state_path = folder / IMAGE_STATE_FILE
    try:
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {"items": {}}
    except (OSError, json.JSONDecodeError):
        state = {"items": {}}
    items = state.setdefault("items", {})
    composition = "vertical portrait composition, main character large in the lower half" if ratio == "9:16" else \
        "wide cinematic composition, main character on one third of the frame"

    outputs: List[Path] = []
    for i, sc in enumerate(story["scenes"]):
        out = folder / f"scene{i:02d}.png"
        outputs.append(out)
        if out.is_file():
            continue
        key = f"scene{i:02d}"
        prompt = f"{STYLE}. {composition}. Main character (always the same person): {story['character']}. Scene: {sc['shot']}"
        item = items.get(key) or {}
        if not item.get("task_id"):
            result = image_routes.enqueue_image(image_routes.EnqueueRequest(
                prompt=prompt, aspect_ratio=ratio, engine="antigravity",
                notes=f"Kênh POV · {work.name} · {key}",
            ))
            task_id = (result.get("task_ids") or [None])[0]
            if not task_id:
                raise RuntimeError(f"không xếp được Antigravity cho cảnh {i + 1}")
            items[key] = {"task_id": task_id, "attempts": 1, "prompt": prompt}
            _write_image_state(state_path, state)

    deadline = time.time() + IMAGE_WAIT_MINUTES * 60
    while time.time() < deadline:
        waiting = []
        for i, out in enumerate(outputs):
            if out.is_file():
                continue
            key = f"scene{i:02d}"
            item = items[key]
            task = _image_task(str(item["task_id"]))
            if task.get("status") == "completed" and task.get("image_filename"):
                src = image_routes.GENERATED_DIR / Path(str(task["image_filename"])).name
                if src.is_file() and src.stat().st_size:
                    tmp = out.with_suffix(".tmp")
                    shutil.copyfile(src, tmp)
                    tmp.replace(out)
                    item.update(source_model=task.get("model") or "", image_filename=src.name, error="")
                    _write_image_state(state_path, state)
                    continue
            if task.get("status") == "failed" or not task:
                attempts = int(item.get("attempts") or 1)
                if attempts < IMAGE_MAX_ATTEMPTS:
                    result = image_routes.enqueue_image(image_routes.EnqueueRequest(
                        prompt=item["prompt"], aspect_ratio=ratio, engine="antigravity",
                        notes=f"Kênh POV · {work.name} · {key} · thử lại",
                    ))
                    new_task_id = (result.get("task_ids") or [None])[0]
                    if not new_task_id:
                        raise RuntimeError(f"không xếp lại được Antigravity cho cảnh {i + 1}")
                    item["task_id"] = new_task_id
                    item["attempts"] = attempts + 1
                    item["error"] = str(task.get("error_message") or "task không còn")[:300]
                    _write_image_state(state_path, state)
                else:
                    error = str(task.get("error_message") or "task không còn")[:300]
                    raise RuntimeError(f"Antigravity vẽ cảnh {i + 1} lỗi sau {attempts} lần: {error}")
            waiting.append(key)
        if not waiting:
            return outputs
        time.sleep(IMAGE_POLL_SECONDS)
    missing = [f"scene{i:02d}" for i, out in enumerate(outputs) if not out.is_file()]
    raise RuntimeError(f"Antigravity chưa vẽ xong sau {IMAGE_WAIT_MINUTES} phút: {', '.join(missing)}")


def wrap(text: str, language: str, ratio: str) -> str:
    """Phụ đề xuống dòng theo bề ngang khung: ngang ~56 ký tự/dòng, dọc ~28 (muse_remake._wrap)."""
    if ratio == "9:16" or language == "ja":
        return muse_remake._wrap(text, language)
    lines, cur = [], ""
    for w_ in text.split():
        if len(cur) + len(w_) + 1 > 56 and cur:
            lines.append(cur)
            cur = w_
        else:
            cur = f"{cur} {w_}".strip()
    return "\\N".join([*lines, cur])


def assemble(work: Path, story: Dict[str, Any], images: List[Path], ratio: str, language: str, voice: str) -> Path:
    w, h = FRAMES[ratio]
    folder = images[0].parent
    segs, events, cuts, t = [], [], [], 0.0
    for i, (img, sc) in enumerate(zip(images, story["scenes"])):
        vo = work / f"vo{i:02d}.mp3"
        vd = muse_remake._probe(vo) if vo.is_file() else muse_remake._tts(sc["line"], voice, 1.0, vo, language)
        dur = round(vd + 0.6, 2)
        frames = int(dur * 30)
        zin = i % 2 == 0  # xen kẽ zoom vào / zoom ra, lia nhẹ
        z = f"min(1.0+0.12*on/{frames},1.12)" if zin else f"max(1.12-0.12*on/{frames},1.0)"
        seg = folder / f"seg{i:02d}.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(img), "-i", str(vo), "-filter_complex",
                        f"[0:v]scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
                        f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)+{'1' if zin else '-1'}*on*0.4':y='ih/2-(ih/zoom/2)':d={frames}:s={w}x{h}:fps=30,"
                        f"format=yuv420p[v];[1:a]adelay=250|250,apad,atrim=duration={dur},aresample=44100[a]",
                        "-map", "[v]", "-map", "[a]", "-t", str(dur), "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
                        "-c:a", "aac", "-ac", "2", str(seg)], check=True, timeout=600)
        segs.append(seg)
        events.append(f"Dialogue: 0,{muse_remake._ass_time(t + 0.25)},{muse_remake._ass_time(t + dur - 0.1)},Cap,,0,0,0,,"
                      f"{wrap(sc['line'], language, ratio)}")
        cuts.append(t)
        t += dur
    (folder / "list.txt").write_text("".join(f"file '{s.name}'\n" for s in segs))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"],
                   cwd=str(folder), check=True, timeout=600)
    font = {"ja": "Noto Sans CJK JP", "ko": "Noto Sans CJK KR"}.get(language, "DejaVu Sans")
    size, margin = (58, 300) if ratio == "9:16" else (46, 70)
    (folder / "caps.ass").write_text(
        f"[Script Info]\nScriptType: v4.00+\nPlayResX: {w}\nPlayResY: {h}\nWrapStyle: 2\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, "
        "StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Cap,{font},{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,3,1,2,90,90,{margin},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" + "\n".join(events) + "\n",
        encoding="utf-8")
    old_moods = muse_remake.BGM_MOODS
    muse_remake.BGM_MOODS = {"calm", "documentary"}  # chuyện suy ngẫm: nhạc êm, không whoosh mỗi cảnh
    try:
        graph = muse_remake._mix_audio(folder, [], t, story["title"])
    finally:
        muse_remake.BGM_MOODS = old_moods
    inputs = json.loads((folder / "mix_inputs.json").read_text())
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", "joined.mp4"]
    for f in inputs:
        cmd += ["-i", f]
    out = work / f"pov_{ratio.replace(':', 'x')}.mp4"
    cmd += ["-filter_complex", f"[0:v]ass=caps.ass[vout];{graph}", "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264",
            "-crf", "20", "-preset", "veryfast", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, cwd=str(folder), check=True, timeout=1200)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", required=True)
    ap.add_argument("--lang", default="en", choices=sorted(LANG_NAMES))
    ap.add_argument("--scenes", type=int, default=18)
    ap.add_argument("--ratios", default="9:16,16:9")
    ap.add_argument("--voice", default="")
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    work = Path(a.out) if a.out else BASE / uuid.uuid4().hex[:8]
    work.mkdir(parents=True, exist_ok=True)
    story_file = work / "story.json"
    story = json.loads(story_file.read_text()) if story_file.is_file() else plan(a.topic, a.lang, a.scenes)
    story_file.write_text(json.dumps(story, ensure_ascii=False, indent=1))
    print(f"[pov] {story['title']} — {len(story['scenes'])} cảnh\n[pov] nhân vật: {story['character']}", flush=True)
    voice = a.voice or muse_remake.DEFAULT_VOICE[a.lang]
    for ratio in [r.strip() for r in a.ratios.split(",") if r.strip()]:
        t0 = time.time()
        imgs = draw(work, story, ratio)
        print(f"[pov] {ratio}: {len(imgs)} ảnh trong {round(time.time() - t0)} s", flush=True)
        out = assemble(work, story, imgs, ratio, a.lang, voice)
        print(f"[pov] {ratio}: {out} ({round(muse_remake._probe(out))} s)", flush=True)


if __name__ == "__main__":
    main()
