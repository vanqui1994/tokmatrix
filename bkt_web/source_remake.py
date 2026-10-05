"""Remake video nguồn (Kuaishou, TikTok, YouTube… đã tải) thành video hoạt hình vector cho một kênh Matrix.

Video nguồn → lời gốc (faster-whisper, tự nhận ngôn ngữ) + khung hình → Gemini viết lại thành lời dẫn bằng ngôn ngữ
của kênh (de/en/ko/ja), mỗi câu một ý hình và các đối tượng cần vẽ → engine `vector` của Matrix dựng, TTS bằng giọng
của kênh, render, Video QA (`compare_studio/tools/vector-sample.mjs --lines-file … --llm-storyboard`).

Đối tượng Gemini cần mà thư viện vector chưa có (không khớp nhãn subject nào của niche) được ghi vào hàng đợi học
(`vector_learning`); khi rig mới học xong, các job đang chờ đối tượng đó được dựng lại.

Job ở storage/source_remakes/<id>/job.json; một luồng nền chạy lần lượt.
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

ROOT = Path(__file__).resolve().parent.parent
BASE = Path(__file__).resolve().parent / "storage" / "source_remakes"
CHANNELS_DIR = ROOT / "compare_studio" / "config" / "channels"
LANG_NAMES = {"de": "German", "en": "English", "ko": "Korean", "ja": "Japanese"}
ACTIVE = ("queued", "transcribing", "writing", "rendering")

_lock = threading.Lock()
_wake = threading.Event()
_thread: Optional[threading.Thread] = None


# ------------------------------------------------------------------ lưu trữ
def _dir(jid: str) -> Path:
    if not re.fullmatch(r"[a-z0-9]{6,20}", jid or ""):
        raise ValueError("id không hợp lệ")
    return BASE / jid


def load(jid: str) -> Dict[str, Any]:
    return json.loads((_dir(jid) / "job.json").read_text())


def save(job: Dict[str, Any]) -> None:
    d = _dir(job["id"])
    d.mkdir(parents=True, exist_ok=True)
    job["updated"] = int(time.time())
    tmp = d / "job.json.tmp"
    tmp.write_text(json.dumps(job, ensure_ascii=False, indent=1))
    tmp.replace(d / "job.json")


def list_jobs() -> List[Dict[str, Any]]:
    out = []
    for f in BASE.glob("*/job.json") if BASE.exists() else []:
        try:
            out.append(json.loads(f.read_text()))
        except Exception:  # noqa: BLE001
            pass
    return sorted(out, key=lambda j: -j.get("created", 0))


def vector_channels() -> List[Dict[str, Any]]:
    """Kênh Matrix dùng được engine vector: niche có trong vector_niches.json, ngôn ngữ de/en/ko/ja."""
    try:
        from bkt_web.vector_video import niches as vn
    except ImportError:
        from vector_video import niches as vn
    allowed = set(vn.load()["niches"])
    out = []
    for f in sorted(CHANNELS_DIR.glob("*.yaml")):
        try:
            c = yaml.safe_load(f.read_text()) or {}
        except Exception:  # noqa: BLE001
            continue
        lang = ((c.get("publishing") or {}).get("language") or "").lower()
        if c.get("niche_id") in allowed and lang in LANG_NAMES:
            out.append({"id": c["channel_id"], "name": c.get("name") or c["channel_id"], "niche": c["niche_id"], "language": lang})
    return out


def _channel(channel_id: str) -> Dict[str, Any]:
    for c in vector_channels():
        if c["id"] == channel_id:
            return c
    raise ValueError(f"Kênh {channel_id} không dùng được engine vector (niche hoặc ngôn ngữ không hỗ trợ)")


def create(source: str, channel_id: str, title: str = "", source_url: str = "") -> Dict[str, Any]:
    src = Path(source).resolve()
    if not src.is_file():
        raise ValueError("Không có file video nguồn")
    ch = _channel(channel_id)
    job = {"id": uuid.uuid4().hex[:10], "source": str(src), "source_url": source_url, "title": title,
           "channel": ch["id"], "niche": ch["niche"], "language": ch["language"], "status": "queued",
           "created": int(time.time()), "step": "", "error": "", "gaps": [], "lines": [], "output": ""}
    save(job)
    _wake.set()
    return job


# ------------------------------------------------------------------ bước 1: lời gốc + khung hình
def transcribe(src: Path, work: Path) -> Dict[str, Any]:
    wav = work / "audio.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(wav)],
                   check=True, timeout=300)
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, info = model.transcribe(str(wav), vad_filter=True)
    segments = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs if s.text.strip()]
    return {"language": info.language, "segments": segments, "text": " ".join(s["text"] for s in segments)}


def keyframes(src: Path, work: Path, count: int = 8) -> List[Path]:
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                               capture_output=True, text=True, timeout=60).stdout.strip() or 0)
    out = []
    for i in range(count):
        t = dur * (i + 0.5) / count
        f = work / f"frame{i:02d}.jpg"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1",
                        "-vf", "scale=360:-2", "-q:v", "4", str(f)], timeout=60)
        if f.is_file():
            out.append(f)
    return out


# ------------------------------------------------------------------ bước 2: lời dẫn mới bằng ngôn ngữ kênh
WRITE = """You remake a short educational video as an original cartoon explainer for a {lang} TikTok channel (niche: {niche}).
Below: the source transcript (may be Chinese, may be empty when the video only has music) and {n} frames from the video.
Write a NEW narration in {lang} that teaches the same facts in your own words (do not translate word by word, no copied
jokes, no brand or show names). 8 to 14 lines, each line one sentence of 8 to 16 words ({cjk}), first line a hook question.
For every line give a short English visual idea and the concrete things that must be drawn (English singular nouns, e.g.
"stomach", "fish bone", "throat"; body parts, organs, objects, animals; not abstract words, not people).
Return JSON {{"title": "<short {lang} title>", "lines": [{{"line": "...", "visual": "...", "subjects": ["..."]}}]}}.
Source transcript:
{transcript}"""


def _gemini(parts: List[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        from bkt_web.key_vault import get_key
    except ImportError:
        from key_vault import get_key
    key = get_key("ai.gemini")
    body = json.dumps({"contents": [{"parts": parts}], "generationConfig": {"responseMimeType": "application/json"}}).encode()
    last = None
    for model in ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"):
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                                         body, {"Content-Type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=240))
            return json.loads(r["candidates"][0]["content"]["parts"][0]["text"])
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"Gemini không viết được lời dẫn: {last}")


def write_lines(transcript: Dict[str, Any], frames: List[Path], language: str, niche: str) -> Dict[str, Any]:
    lang = LANG_NAMES[language]
    cjk = "count characters, not words: 20 to 35 characters, no spaces between words" if language == "ja" else "plain sentences"
    prompt = WRITE.format(lang=lang, niche=niche.replace("_", " "), n=len(frames), cjk=cjk,
                          transcript=(transcript.get("text") or "(no speech)")[:6000])
    parts: List[Dict[str, Any]] = [{"text": prompt}]
    parts += [{"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(f.read_bytes()).decode()}} for f in frames]
    data = _gemini(parts)
    lines = []
    for item in data.get("lines") or []:
        line = re.sub(r"\s+", " ", str(item.get("line") or "")).replace("|", "/").strip()
        if not line:
            continue
        subjects = [re.sub(r"[^a-z ]", "", str(s).lower()).strip() for s in item.get("subjects") or []]
        lines.append({"line": line, "visual": re.sub(r"\s+", " ", str(item.get("visual") or line)).replace("|", "/").strip(),
                      "subjects": [s for s in subjects if s][:4]})
    if len(lines) < 4:
        raise RuntimeError("Gemini trả quá ít câu lời dẫn")
    return {"title": str(data.get("title") or "").strip()[:80], "lines": lines[:16]}


# ------------------------------------------------------------------ đối tượng thiếu
# Không phải thứ vẽ được thành một rig (khái niệm, chữ, bố cục) — không đưa vào hàng đợi học.
ABSTRACT = {"illustration", "diagram", "chart", "graph", "timeline", "arrow", "text", "label", "document", "library",
            "book page", "map", "symbol", "icon", "question mark", "exclamation mark", "number", "word", "screen",
            "background", "scene", "light", "shadow", "color", "motion", "speed", "energy", "pain", "time", "idea",
            "people", "person", "man", "woman", "child", "kid", "baby", "doctor", "nurse", "scientist", "patient", "crowd"}
MAX_GAPS_PER_JOB = 6


def _norm(word: str) -> str:
    """Tên chuẩn hoá: chữ thường, số ít đơn giản (uterus/virus/glass giữ nguyên)."""
    w = re.sub(r"\s+", " ", re.sub(r"[^a-z ]", "", (word or "").lower())).strip()
    if re.search(r"(ss|us|is|os)$", w):
        return w
    if len(w) <= 3:
        return w
    return re.sub(r"ies$", "y", w) if w.endswith("ies") else re.sub(r"s$", "", w)


def known_subjects(niche: str) -> Dict[str, str]:
    """nhãn/ id đã chuẩn hoá → subject id, chỉ subject niche được dùng (engine không vẽ subject ngoài niche)."""
    try:
        from bkt_web.vector_video import niches as vn
    except ImportError:
        from vector_video import niches as vn
    data = vn.load()
    allowed = set((data["niches"].get(niche) or {}).get("subjects") or [])
    out = {}
    for sid, spec in data["subjects"].items():
        if sid not in allowed:
            continue
        for name in (sid.replace("_", " "), spec.get("label", ""), spec.get("asset", "").replace("_", " ")):
            if name:
                out[_norm(name)] = sid
    return out


def find_gaps(lines: List[Dict[str, Any]], niche: str) -> List[str]:
    """Đối tượng niche chưa vẽ được, xếp theo số câu cần nó; tối đa MAX_GAPS_PER_JOB, bỏ khái niệm trừu tượng."""
    known = known_subjects(niche)
    count: Dict[str, int] = {}
    for item in lines:
        for s in dict.fromkeys(_norm(x) for x in item["subjects"]):
            if not s or s in ABSTRACT or s in known or any(k and (k in s.split() or s in k.split()) for k in known):
                continue
            count[s] = count.get(s, 0) + 1
    return [s for s, _ in sorted(count.items(), key=lambda kv: -kv[1])][:MAX_GAPS_PER_JOB]


# ------------------------------------------------------------------ bước 3: dựng vector
def render(job: Dict[str, Any], work: Path) -> Dict[str, Any]:
    lines_file = work / "lines.txt"
    lines_file.write_text("\n".join(f"{l['line']} | {l['visual']}" for l in job["lines"]) + "\n", encoding="utf-8")
    out_dir = work / "vector"
    cmd = ["node", str(ROOT / "compare_studio" / "tools" / "vector-sample.mjs"), "--channel", job["channel"],
           "--topic", job["title"] or job["id"], "--lines-file", str(lines_file), "--llm-storyboard", "--out", str(out_dir)]
    r = subprocess.run(cmd, cwd=str(ROOT / "compare_studio"), capture_output=True, text=True, timeout=3600)
    (work / "vector.log").write_text((r.stdout or "") + "\n" + (r.stderr or ""))
    m = re.search(r"\[vector-sample\] render (\S+) QA (passed|failed: .*)", r.stdout or "")
    if r.returncode != 0 or not m:
        tail = [l for l in ((r.stderr or "") + "\n" + (r.stdout or "")).splitlines() if l.strip()][-3:]
        raise RuntimeError("Dựng vector lỗi: " + " / ".join(tail)[:400])
    if m.group(2) != "passed":
        raise RuntimeError(f"Video QA không đạt: {m.group(2)[8:300]}")
    return {"output": m.group(1)}


# ------------------------------------------------------------------ luồng nền
def process(jid: str) -> None:
    job = load(jid)
    work = _dir(jid)
    try:
        src = Path(job["source"])
        if not job.get("transcript"):
            job.update(status="transcribing", step="Chép lời video nguồn"); save(job)
            job["transcript"] = transcribe(src, work)
            save(job)
        if not job.get("lines"):
            job.update(status="writing", step=f"Viết lời dẫn {LANG_NAMES[job['language']]}"); save(job)
            data = write_lines(job["transcript"], keyframes(src, work), job["language"], job["niche"])
            job["lines"] = data["lines"]
            job["title"] = job.get("title") or data["title"]
            save(job)
        job["gaps"] = find_gaps(job["lines"], job["niche"])
        if job["gaps"]:
            try:
                from bkt_web import vector_learning
            except ImportError:
                import vector_learning
            vector_learning.report(job["gaps"], niche=job["niche"], job_id=jid, frames=sorted(str(f) for f in work.glob("frame*.jpg")))
        job.update(status="rendering", step="Dựng hoạt hình vector, TTS, render"); save(job)
        job.update(render(job, work))
        job.update(status="done", step="", error="", finished=int(time.time()))
    except Exception as e:  # noqa: BLE001
        job.update(status="error", error=str(e)[:600])
    save(job)


def _loop() -> None:
    while True:
        todo = [j for j in list_jobs()[::-1] if j.get("status") in ACTIVE]
        if todo:
            with _lock:
                try:
                    process(todo[0]["id"])
                except Exception as e:  # noqa: BLE001 — job.json hỏng không được giết luồng nền
                    print(f"[source-remake] {todo[0].get('id')}: {e}", flush=True)
                    time.sleep(30)
            continue
        _wake.wait(30)
        _wake.clear()


def start() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    BASE.mkdir(parents=True, exist_ok=True)
    _thread = threading.Thread(target=_loop, name="source-remake", daemon=True)
    _thread.start()


def retry(jid: str, rerender_only: bool = True) -> Dict[str, Any]:
    """Dựng lại job (sau khi học rig mới, hoặc lỗi). rerender_only=False viết lại cả lời dẫn."""
    job = load(jid)
    if not rerender_only:
        job["lines"] = []
    job.update(status="queued", error="")
    save(job)
    _wake.set()
    return job
