"""Kuaishou → Muse remake → hàng đợi đăng TikTok.

Mỗi nguồn là một profile Kuaishou gán cho MỘT tài khoản TikTok (bảng `sources`). Luồng nền quét profile (Chrome
Kuaishou đã đăng nhập, multi_downloader.kuaishou_profile), lấy video mới theo hạn mức mỗi ngày, rồi với từng video:

  tải MP4 → chia ~5 s một cảnh, lấy khung hình giữa cảnh, chép lời (faster-whisper)
  → Gemini (chỉ viết chữ) viết cho từng cảnh: mô tả cảnh quay (tiếng Anh, cho Muse) + một câu lời dẫn bằng ngôn ngữ
    của tài khoản (de/en/ko/ja), tiêu đề + caption
  → Muse quay lại từng cảnh, đính kèm khung hình gốc làm mẫu phong cách (muse_film.create_shots, chạy song song trên
    các tài khoản Muse)
  → TTS bằng giọng của tài khoản (kênh Matrix được gán; không có thì giọng mặc định của ngôn ngữ), mỗi cảnh kéo dài
    cho vừa lời, phụ đề ASS, ghép 1080×1920
  → upload_tasks (QUEUED) của đúng tài khoản ở khung giờ kế tiếp (autopilot.scheduler.next_slot).

Video ở storage/muse_remake/<id>/ (nằm trong STORAGE_DIR nên trình đăng chấp nhận). Xoá video = xoá file + task
đăng chưa đăng. Cảnh Muse lỗi: video vẫn ghép nếu đủ ≥ 60 % cảnh, nếu không thì báo lỗi.
"""
from __future__ import annotations

import json
import re
import shutil
import sqlite3
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

try:
    from bkt_web import multi_downloader, muse_film, source_remake
except ImportError:
    import multi_downloader
    import muse_film
    import source_remake

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BASE = HERE / "storage" / "muse_remake"
DB = HERE / "storage" / "muse_remake.db"
CHANNELS_DB = HERE / "bkt_channels.db"
SCAN_EVERY = 6 * 3600
SCENE_SECONDS = 5.0
LANG_NAMES = {"de": "German", "en": "English", "ko": "Korean", "ja": "Japanese"}
DEFAULT_VOICE = {"de": "de-DE-ConradNeural", "en": "en-US-AndrewNeural", "ko": "ko-KR-InJoonNeural", "ja": "ja-JP-KeitaNeural"}
ACTIVE = ("new", "downloading", "analyzing", "shooting", "voicing")
AUDIO_DIR = ROOT / "compare_studio" / "shared" / "audio"
MUSIC_CATALOG = ROOT / "compare_studio" / "config" / "music" / "cc0_catalog.json"
BGM_MOODS = {"playful", "upbeat"}  # hoạt hình vui: chỉ nhạc CC0 vui tươi
BGM_GAIN, SFX_GAIN = 0.16, 0.45

_thread: Optional[threading.Thread] = None
_wake = threading.Event()
_state: Dict[str, Any] = {"busy": None, "last": None}


# ------------------------------------------------------------------ DB
def _conn() -> sqlite3.Connection:
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB), timeout=30)
    c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, profile_url TEXT NOT NULL UNIQUE, channel_id INTEGER NOT NULL UNIQUE,
        per_day INTEGER NOT NULL DEFAULT 2, enabled INTEGER NOT NULL DEFAULT 1, author TEXT NOT NULL DEFAULT '',
        last_scan INTEGER NOT NULL DEFAULT 0, scan_error TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, ks_id TEXT NOT NULL, url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', duration INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'available', step TEXT NOT NULL DEFAULT '', film_id TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '', new_title TEXT NOT NULL DEFAULT '', final_path TEXT NOT NULL DEFAULT '',
        upload_task_id INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}',
        posted INTEGER NOT NULL DEFAULT 0, started INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(source_id, ks_id));
    """)
    return c


def _vid_update(vid: int, **fields) -> None:
    fields["updated"] = int(time.time())
    if "data" in fields and not isinstance(fields["data"], str):
        fields["data"] = json.dumps(fields["data"], ensure_ascii=False)
    with _conn() as c:
        c.execute(f"UPDATE videos SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?", (*fields.values(), vid))


def _video(vid: int) -> Dict[str, Any]:
    with _conn() as c:
        row = c.execute("SELECT * FROM videos WHERE id=?", (vid,)).fetchone()
    if not row:
        raise ValueError("Không có video này")
    d = dict(row)
    d["data"] = json.loads(d["data"] or "{}")
    return d


def sources() -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM sources ORDER BY id")]
        for r in rows:
            r["counts"] = {k: n for k, n in c.execute("SELECT status, COUNT(*) FROM videos WHERE source_id=? GROUP BY status", (r["id"],))}
    names = _account_names()
    for r in rows:
        r["account"] = names.get(r["channel_id"], f"#{r['channel_id']}")
        r["language"] = account_voice(r["channel_id"])["language"]
    return rows


def videos(source_id: Optional[int] = None, limit: int = 200) -> List[Dict[str, Any]]:
    q = "SELECT * FROM videos WHERE status!='available'" + (" AND source_id=?" if source_id else "") + " ORDER BY updated DESC LIMIT ?"
    with _conn() as c:
        rows = [dict(r) for r in c.execute(q, ((source_id, limit) if source_id else (limit,)))]
    for r in rows:
        r.pop("data", None)
    return rows


def add_source(profile_url: str, channel_id: int, per_day: int = 2) -> Dict[str, Any]:
    url = multi_downloader.kuaishou_profile_url(profile_url)
    if not url:
        raise ValueError("Cần link profile Kuaishou: https://www.kuaishou.com/profile/… hoặc link chia sẻ profile "
                         "v.kuaishou.com/… (link chia sẻ một video không dùng được)")
    if channel_id not in _account_names():
        raise ValueError("Không có tài khoản TikTok này")
    with _conn() as c:
        try:
            c.execute("INSERT INTO sources(profile_url, channel_id, per_day, created) VALUES (?,?,?,?)",
                      (url, channel_id, max(1, min(10, per_day)), int(time.time())))
        except sqlite3.IntegrityError:
            raise ValueError("Profile này hoặc tài khoản này đã được gán (một profile ↔ một tài khoản)")
    _wake.set()
    return next(s for s in sources() if s["profile_url"] == url)


def update_source(sid: int, *, per_day: Optional[int] = None, enabled: Optional[bool] = None) -> None:
    with _conn() as c:
        if per_day is not None:
            c.execute("UPDATE sources SET per_day=? WHERE id=?", (max(1, min(10, per_day)), sid))
        if enabled is not None:
            c.execute("UPDATE sources SET enabled=? WHERE id=?", (1 if enabled else 0, sid))
    _wake.set()


def delete_source(sid: int) -> None:
    with _conn() as c:
        c.execute("DELETE FROM sources WHERE id=?", (sid,))
        c.execute("DELETE FROM videos WHERE source_id=? AND status='available'", (sid,))


# ------------------------------------------------------------------ tài khoản, giọng
def _account_names() -> Dict[int, str]:
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
        return {r[0]: (r[1] or f"#{r[0]}") for r in c.execute("SELECT id, username FROM channels")}


_CFG_CACHE: Dict[str, Any] = {"at": 0.0, "configs": {}}


def _matrix_configs() -> Dict[str, Any]:
    """Cấu hình kênh Matrix (237 file YAML, ~0,6 s): đọc một lần, giữ 5 phút."""
    if time.time() - _CFG_CACHE["at"] > 300:
        try:
            from bkt_web.autopilot import channels as ach
        except ImportError:
            from autopilot import channels as ach
        _CFG_CACHE.update(at=time.time(), configs=ach.load_matrix_channel_configs())
    return _CFG_CACHE["configs"]


def account_voice(channel_id: int) -> Dict[str, Any]:
    """Ngôn ngữ + giọng của tài khoản: kênh Matrix được gán (voice_id, voice_speed) → không có thì theo quốc gia."""
    try:
        from bkt_web.autopilot import channels as ach
    except ImportError:
        from autopilot import channels as ach
    mapping = ach.get_mapping_for_tiktok(channel_id) or {}
    language = (mapping.get("language") or ach.account_language(channel_id) or "en").lower()
    language = language if language in LANG_NAMES else "en"
    voice, speed, niche = DEFAULT_VOICE[language], 1.0, mapping.get("niche_id") or ""
    if mapping.get("matrix_channel_id"):
        cfg = (_matrix_configs().get(mapping["matrix_channel_id"]) or {}).get("config") or {}
        audio = cfg.get("audio") or {}
        voice, speed = audio.get("voice_id") or voice, float(audio.get("voice_speed") or 1.0)
    return {"language": language, "voice": voice, "speed": speed, "niche": niche}


# ------------------------------------------------------------------ quét profile
def scan(source: Dict[str, Any]) -> int:
    items = multi_downloader.kuaishou_profile(source["profile_url"], 30)
    now, added = int(time.time()), 0
    with _conn() as c:
        for it in items:
            cur = c.execute("INSERT OR IGNORE INTO videos(source_id, ks_id, url, title, cover, duration, posted, created, updated) "
                            "VALUES (?,?,?,?,?,?,?,?,?)", (source["id"], it["id"], it["url"], it["title"], it["cover"], it["duration"],
                                                          it.get("posted", 0), now, now))
            added += cur.rowcount
        c.execute("UPDATE sources SET last_scan=?, scan_error='', author=? WHERE id=?",
                  (now, items[0].get("author", "") if items else "", source["id"]))
    return added


def _start_due() -> None:
    """Đưa video `available` mới nhất sang `new` cho tới hết hạn mức 24 giờ của từng nguồn (đếm cả video đã xoá)."""
    now = int(time.time())
    with _conn() as c:
        for s in c.execute("SELECT * FROM sources WHERE enabled=1").fetchall():
            used = c.execute("SELECT COUNT(*) FROM videos WHERE source_id=? AND started>=?", (s["id"], now - 86400)).fetchone()[0]
            for v in c.execute("SELECT id FROM videos WHERE source_id=? AND status='available' ORDER BY posted DESC, id ASC LIMIT ?",
                               (s["id"], max(0, s["per_day"] - used))).fetchall():
                c.execute("UPDATE videos SET status='new', started=?, updated=? WHERE id=?", (now, now, v["id"]))


# ------------------------------------------------------------------ một video
def _dir(vid: int) -> Path:
    return BASE / str(int(vid))


def _download(v: Dict[str, Any], work: Path) -> Path:
    out = work / "source.mp4"
    if out.is_file() and out.stat().st_size > 10000:
        return out
    item = multi_downloader.resolve_kuaishou(v["url"])  # link CDN có hạn: lấy mới mỗi lần tải
    with requests.get(item["play_url"], stream=True, timeout=60,
                      headers={"Referer": "https://www.kuaishou.com/", "User-Agent": "Mozilla/5.0"}) as r:
        r.raise_for_status()
        tmp = out.with_suffix(".part")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    tmp.replace(out)
    return out


def _probe(src: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                         capture_output=True, text=True, timeout=60).stdout.strip()
    return float(out or 0)


def _frames(src: Path, work: Path, n: int, dur: float) -> List[Path]:
    out = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        f = work / f"ref{i:02d}.jpg"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1",
                        "-vf", "scale=720:-2", "-q:v", "3", str(f)], timeout=60)
        if f.is_file():
            out.append(f)
    return out


def _soft(ref: str) -> Optional[str]:
    """Bản mờ của khung hình gốc cho Muse: giữ màu và bố cục, chữ/watermark của kênh gốc không còn đọc được
    (Muse chép lại watermark khi nhận ảnh nét)."""
    src = Path(ref)
    if not src.is_file():
        return None
    out = src.with_name(src.stem + "_soft.jpg")
    if not out.is_file():
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", "scale=40:-2,scale=720:-2,gblur=sigma=10",
                        "-q:v", "4", str(out)], timeout=60)
    return str(out) if out.is_file() else None


TEXT_CHECK = """These are {n} frames, one from each cartoon clip, in order (index 0..{last}).
List the indexes of frames that show ANY text: letters, words, numbers used as text, usernames, @handles, logos,
watermarks or subtitles (numbers printed on a cap or shirt as part of a costume are fine).
Return JSON {{"text": [indexes]}}."""


def _text_scenes(film: Dict[str, Any], work: Path) -> List[int]:
    """Cảnh nào trong clip Muse có chữ/watermark (Gemini nhìn một khung hình giữa mỗi clip)."""
    import base64
    done = [s for s in film["scenes"] if s["status"] == "done"]
    frames = []
    for s in done:
        clip = muse_film._dir(film["id"]) / "clips" / f"scene{s['i']:02d}.mp4"
        f = work / f"check{s['i']:02d}.jpg"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "2.5", "-i", str(clip), "-frames:v", "1",
                        "-vf", "scale=480:-2", "-q:v", "4", str(f)], timeout=60)
        frames.append((s["i"], f))
    frames = [(i, f) for i, f in frames if f.is_file()]
    if not frames:
        return []
    parts = [{"text": TEXT_CHECK.format(n=len(frames), last=len(frames) - 1)}]
    parts += [{"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(f.read_bytes()).decode()}} for _, f in frames]
    try:
        bad = source_remake._gemini(parts).get("text") or []
    except Exception:  # noqa: BLE001 — kiểm tra lỗi thì không chặn video
        return []
    return [frames[k][0] for k in bad if isinstance(k, int) and 0 <= k < len(frames)]


PLAN = """You remake a short Chinese educational cartoon as a NEW original video for a {lang} TikTok account.
Attached: {n} frames, one per scene, in order. Source transcript (may be empty): {transcript}
First write "style": one English sentence describing the visual style of these frames in your own words (e.g. flat 2D
cartoon, thick dark outlines, bright saturated colours, chibi characters with big round eyes, simple painted backgrounds).
For EACH of the {n} scenes write:
 - "shot": an English prompt for a video model describing a fresh, ORIGINAL shot with the same story beat as its frame:
   characters (describe their look), a gentle action, camera move, setting; about 5 seconds; no text, no subtitles, no
   speech bubbles. It must be family-friendly: no weapons (no swords, knives, guns), nobody hurt, cut, hit, burned or
   scared; turn any rough action into a gentle one (e.g. trimming leaves with garden shears, watering, pointing,
   cheering). Do not name the source channel, brands or existing characters. Muse also refuses babies or unborn
   babies, bodies or close-ups of body parts, and toilet/bathroom or bodily-function humour: show those ideas with cute
   mascot characters, objects or a visual metaphor instead (e.g. a smiling seed in a cosy pod instead of a baby in a womb).
 - "line": ONE narration sentence in {lang} for that scene ({length}), teaching the same facts in your own words,
   flowing as one story; scene 1 is a hook question.
Also "title" (short, {lang}) and "caption" (1-2 sentences, {lang}, no hashtags).
Return JSON {{"title": "...", "caption": "...", "style": "...", "scenes": [{{"shot": "...", "line": "..."}}]}} with exactly {n} scenes."""


def _plan(frames: List[Path], transcript: Dict[str, Any], language: str) -> Dict[str, Any]:
    import base64
    lang = LANG_NAMES[language]
    length = "18 to 30 characters, no spaces between words" if language == "ja" else (
        "20 to 40 characters" if language == "ko" else "8 to 14 words")
    parts = [{"text": PLAN.format(lang=lang, n=len(frames), transcript=(transcript.get("text") or "(none)")[:5000], length=length)}]
    parts += [{"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(f.read_bytes()).decode()}} for f in frames]
    data = source_remake._gemini(parts)
    scenes = [s for s in data.get("scenes") or [] if s.get("shot") and s.get("line")]
    if len(scenes) < max(3, len(frames) // 2):
        raise RuntimeError("Gemini trả quá ít cảnh")
    return {"title": str(data.get("title") or "")[:80], "caption": str(data.get("caption") or "")[:300],
            "style": str(data.get("style") or "bright flat 2D cartoon, thick outlines, cute characters with big eyes")[:300],
            "scenes": scenes[:len(frames)]}


def _tts(text: str, voice: str, speed: float, out: Path, language: str = "en") -> float:
    """Một câu lời dẫn → mp3 bằng giọng tài khoản (compare_studio/tools/tts-line.mjs); trả thời lượng (s)."""
    payload = json.dumps({"text": text, "voice": voice, "out": str(out), "speed": speed, "lang": language})
    r = subprocess.run(["node", str(ROOT / "compare_studio" / "tools" / "tts-line.mjs")], input=payload, capture_output=True,
                       text=True, timeout=180, cwd=str(ROOT / "compare_studio"))
    line = (r.stdout or "").strip().splitlines()[-1:] or ["{}"]
    try:
        res = json.loads(line[0])
    except ValueError:
        res = {}
    if not res.get("ok") or not out.is_file():
        raise RuntimeError(f"TTS lỗi ({voice}): {res.get('error') or (r.stderr or '')[-200:]}")
    return float(res.get("duration") or _probe(out))


def _ass_time(t: float) -> str:
    cs = int(round(t * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def _wrap(text: str, language: str) -> str:
    if language == "ja":
        n = 14
        return "\\N".join(text[i:i + n] for i in range(0, len(text), n))
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > 28 and cur:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    return "\\N".join([*lines, cur])


def _pick_bgm(key: str, seconds: float) -> Optional[Path]:
    """Một bài CC0 vui tươi cố định theo video (sha256 của key), đủ dài để không phải lặp; thiếu file thì bỏ nhạc."""
    import hashlib
    try:
        data = json.loads(MUSIC_CATALOG.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    tracks = [t for t in (data.get("tracks", data) if isinstance(data, dict) else data)
              if BGM_MOODS & set(t.get("moods", [])) and float(t.get("duration_seconds") or 0) >= seconds + 2
              and (AUDIO_DIR / "cc0" / f"{t['id']}.mp3").is_file()]
    if not tracks:
        return None
    tracks.sort(key=lambda t: t["id"])
    pick = tracks[int(hashlib.sha256(key.encode()).hexdigest(), 16) % len(tracks)]
    return AUDIO_DIR / "cc0" / f"{pick['id']}.mp3"


def _mix_audio(work: Path, cuts: List[float], total: float, key: str) -> Optional[str]:
    """filter_complex trộn lời (input 0) + nhạc nền tự hạ khi có lời + whoosh mỗi lần chuyển cảnh + pop ở câu mở đầu."""
    bgm = _pick_bgm(key, total)
    whoosh, pop = AUDIO_DIR / "sfx" / "whoosh.mp3", AUDIO_DIR / "sfx" / "pop.mp3"
    inputs, chains, mix = [], ["[0:a]aresample=44100,asplit=2[vo][sc]"], ["[vo]"]
    if bgm:
        inputs.append(str(bgm))
        chains.append(f"[1:a]aresample=44100,atrim=0:{total:.2f},volume={BGM_GAIN},afade=t=in:d=1,"
                      f"afade=t=out:st={max(0.0, total - 2):.2f}:d=2[bg0];"
                      "[bg0][sc]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[bg]")
        mix.append("[bg]")
    else:
        chains[0] = "[0:a]aresample=44100[vo]"
    sfx = [(whoosh, c - 0.25) for c in cuts if c > 0.5 and whoosh.is_file()] + ([(pop, 0.05)] if pop.is_file() else [])
    for k, (f, at) in enumerate(sfx):
        idx = len(inputs) + 1
        inputs.append(str(f))
        ms = int(max(0.0, at) * 1000)
        chains.append(f"[{idx}:a]aresample=44100,volume={SFX_GAIN},adelay={ms}|{ms}[s{k}]")
        mix.append(f"[s{k}]")
    chains.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:duration=first,alimiter=limit=0.95[aout]")
    (work / "mix_inputs.json").write_text(json.dumps(inputs))
    return ";".join(chains)


def _assemble(work: Path, clips: List[Path], lines: List[str], voice: Dict[str, Any], language: str) -> Path:
    segs, events, t, cuts = [], [], 0.0, []
    for i, (clip, line) in enumerate(zip(clips, lines)):
        vo = work / f"vo{i:02d}.mp3"
        vd = _tts(line, voice["voice"], voice["speed"], vo, language)
        cd = _probe(clip)
        dur = max(cd, vd + 0.35)
        seg = work / f"seg{i:02d}.mp4"
        # clip giữ khung cuối cho tới hết lời; lời bắt đầu 0,15 s sau đầu cảnh
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(clip), "-i", str(vo),
                        "-filter_complex", f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,"
                        f"tpad=stop_mode=clone:stop_duration={max(0.0, dur - cd) + 0.1:.2f},trim=duration={dur:.2f},format=yuv420p[v];"
                        f"[1:a]adelay=150|150,apad,atrim=duration={dur:.2f},aresample=44100[a]",
                        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac",
                        "-ac", "2", str(seg)], check=True, timeout=300)
        segs.append(seg)
        events.append(f"Dialogue: 0,{_ass_time(t + 0.15)},{_ass_time(t + dur - 0.05)},Cap,,0,0,0,,{_wrap(line, language)}")
        cuts.append(t)
        t += dur
    (work / "list.txt").write_text("".join(f"file '{s.name}'\n" for s in segs))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"],
                   cwd=str(work), check=True, timeout=300)
    font = {"ja": "Noto Sans CJK JP", "ko": "Noto Sans CJK KR"}.get(language, "DejaVu Sans")
    (work / "caps.ass").write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, "
        "StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Cap,{font},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,4,2,2,70,70,330,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" + "\n".join(events) + "\n",
        encoding="utf-8")
    graph = _mix_audio(work, cuts, t, str(work))
    inputs = json.loads((work / "mix_inputs.json").read_text())
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", "joined.mp4"]
    for f in inputs:
        cmd += ["-i", f]
    cmd += ["-filter_complex", f"[0:v]ass=caps.ass[vout];{graph}", "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264",
            "-crf", "20", "-preset", "veryfast", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "final.mp4"]
    subprocess.run(cmd, cwd=str(work), check=True, timeout=900)
    return work / "final.mp4"


def _wait_film(film_id: str, vid: int) -> Dict[str, Any]:
    t0 = time.time()
    while time.time() - t0 < 6 * 3600:
        p = muse_film.load(film_id)
        done = sum(1 for s in p["scenes"] if s["status"] == "done")
        _vid_update(vid, step=f"Muse quay {done}/{len(p['scenes'])} cảnh")
        if p["status"] in ("done", "partial", "error", "stopped"):
            return p
        if _video(vid)["status"] == "deleted":
            muse_film.stop(film_id)
            raise RuntimeError("đã xoá")
        time.sleep(15)
    raise RuntimeError("Muse quay quá 6 giờ")


def _enqueue_upload(v: Dict[str, Any], channel_id: int, final: Path, caption: str, language: str, niche: str) -> int:
    try:
        from bkt_web import upload_tasks
    except ImportError:
        import upload_tasks
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
        return upload_tasks.enqueue_auto(c, channel_id, str(final), caption, niche=niche or "medical_anomalies",
                                         language=language, run_id=f"muse_remake:{v['id']}")


def _task_pending(task_id: int) -> bool:
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
        row = c.execute("SELECT status FROM upload_tasks WHERE id=?", (task_id,)).fetchone()
    return bool(row) and row[0] in ("QUEUED", "PENDING", "WAITING_RENDER")


def recheck_text(vid: int) -> None:
    """Video đã xong nhưng có cảnh dính chữ/watermark: chạy lại từ bước kiểm tra chữ (giữ task đăng)."""
    _vid_update(vid, status="shooting", step="Kiểm tra chữ/watermark", error="")
    _wake.set()


def process(vid: int) -> None:
    v = _video(vid)
    with _conn() as c:
        src = dict(c.execute("SELECT * FROM sources WHERE id=?", (v["source_id"],)).fetchone() or {})
    if not src:
        raise RuntimeError("nguồn đã bị xoá")
    voice = account_voice(src["channel_id"])
    language = voice["language"]
    work = _dir(vid)
    work.mkdir(parents=True, exist_ok=True)
    data = v["data"]
    _vid_update(vid, status="downloading", step="Tải video Kuaishou", language=language, error="")
    source = _download(v, work)
    if not data.get("plan"):
        _vid_update(vid, status="analyzing", step="Chép lời, lấy khung hình, viết lời dẫn")
        dur = _probe(source)
        n = int(max(5, min(12, round(dur / SCENE_SECONDS))))
        frames = _frames(source, work, n, dur)
        transcript = source_remake.transcribe(source, work)
        data["plan"] = _plan(frames, transcript, language)
        data["refs"] = [str(f) for f in frames]
        _vid_update(vid, data=data, new_title=data["plan"]["title"])
    plan = data["plan"]
    if not data.get("film_id"):
        # Không bảo Muse "y hệt ảnh đính kèm" (Muse từ chối chép phong cách của người khác): phong cách tả bằng chữ,
        # ảnh chỉ để tham khảo bố cục và màu.
        style = plan.get("style") or "bright flat 2D cartoon, thick outlines, cute characters with big eyes"
        shots = [{"prompt": ("Generate one short video clip (about 5 seconds), vertical 9:16 format, no speech. Never draw any "
                             "text, letters, logos, usernames, @handles or watermarks anywhere in the picture. "
                             f"Style: {style}. Use the attached blurry picture only as a loose reference for the layout and colour "
                             f"mood, drawn in your own way. Shot: {s['shot']}"),
                  "text": s["line"], "ref": _soft(data["refs"][i]) if i < len(data["refs"]) else None} for i, s in enumerate(plan["scenes"])]
        film = muse_film.create_shots(plan["title"] or v["title"], shots, "9:16", keep_audio=False, origin=f"muse_remake:{vid}")
        data["film_id"] = film["id"]
        _vid_update(vid, data=data, film_id=film["id"])
    _vid_update(vid, status="shooting", step="Muse quay từng cảnh")
    film = _wait_film(data["film_id"], vid)
    for rnd in range(2):  # clip có chữ/watermark → quay lại cảnh đó không kèm ảnh mẫu
        bad = _text_scenes(film, work)
        if not bad:
            break
        _vid_update(vid, status="shooting", step=f"Quay lại {len(bad)} cảnh có chữ/watermark")
        p = muse_film.load(film["id"])
        for sc in p["scenes"]:
            if sc["i"] in bad:
                sc["ref"] = None
                sc["prompt"] = sc["prompt"].replace("Use the attached blurry picture only as a loose reference for the layout and colour mood, drawn in your own way. ", "")
        muse_film.save(p)
        for i in bad:
            muse_film.retry_scene(film["id"], i)
        film = _wait_film(film["id"], vid)
    clips, lines = [], []
    for s in film["scenes"]:
        clip = muse_film._dir(film["id"]) / "clips" / f"scene{s['i']:02d}.mp4"
        if s["status"] == "done" and clip.is_file():
            clips.append(clip)
            lines.append(plan["scenes"][s["i"]]["line"])
    if len(clips) < max(3, int(len(film["scenes"]) * 0.6)):
        raise RuntimeError(f"Muse chỉ quay được {len(clips)}/{len(film['scenes'])} cảnh")
    _vid_update(vid, status="voicing", step=f"Lồng tiếng {LANG_NAMES[language]}, phụ đề, ghép")
    final = _assemble(work, clips, lines, voice, language)
    caption = (plan.get("caption") or plan.get("title") or "").strip()
    task_id = v["upload_task_id"]
    if not (task_id and _task_pending(task_id)):  # làm lại video đã có task chưa đăng: thay file, giữ task và giờ đăng
        task_id = _enqueue_upload(v, src["channel_id"], final, caption, language, voice["niche"])
    _vid_update(vid, status="queued", step="", final_path=str(final), upload_task_id=task_id)


def delete_video(vid: int) -> Dict[str, Any]:
    """Xoá video remake: dừng Muse nếu đang quay, xoá task đăng chưa đăng, xoá file. Không quét lại video này nữa."""
    v = _video(vid)
    note = ""
    if v["upload_task_id"]:
        with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
            row = c.execute("SELECT status FROM upload_tasks WHERE id=?", (v["upload_task_id"],)).fetchone()
            if row and row[0] == "SUCCESS":
                note = "video đã đăng lên TikTok: chỉ xoá khỏi danh sách, không gỡ khỏi TikTok"
            elif row:
                c.execute("DELETE FROM upload_tasks WHERE id=? AND status!='SUCCESS'", (v["upload_task_id"],))
    if v["film_id"]:
        try:
            muse_film.stop(v["film_id"])
        except Exception:  # noqa: BLE001
            pass
    shutil.rmtree(_dir(vid), ignore_errors=True)
    _vid_update(vid, status="deleted", step="deleted", final_path="", error=note)
    return {"deleted": vid, "note": note}


def retry_video(vid: int) -> None:
    _vid_update(vid, status="new", error="")
    _wake.set()


# ------------------------------------------------------------------ luồng nền
def run_once() -> bool:
    now = int(time.time())
    with _conn() as c:
        due = [dict(r) for r in c.execute("SELECT * FROM sources WHERE enabled=1 AND last_scan<?", (now - SCAN_EVERY,))]
    for s in due:
        try:
            scan(s)
        except Exception as e:  # noqa: BLE001
            with _conn() as c:
                c.execute("UPDATE sources SET last_scan=?, scan_error=? WHERE id=?", (now - SCAN_EVERY + 1800, str(e)[:300], s["id"]))
    _start_due()
    with _conn() as c:
        row = c.execute(f"SELECT id FROM videos WHERE status IN ({','.join('?' * len(ACTIVE))}) ORDER BY updated ASC LIMIT 1",
                        ACTIVE).fetchone()
    if not row:
        return False
    vid = row["id"]
    _state["busy"] = vid
    try:
        process(vid)
        _state["last"] = f"{time.strftime('%H:%M:%S')} video {vid} vào hàng đợi đăng"
    except Exception as e:  # noqa: BLE001 — một video lỗi không được giết luồng
        if _video(vid)["status"] != "deleted":
            _vid_update(vid, status="error", step="", error=str(e)[:600])
        _state["last"] = f"{time.strftime('%H:%M:%S')} video {vid} lỗi: {str(e)[:120]}"
    finally:
        _state["busy"] = None
    return True


def _loop() -> None:
    while True:
        try:
            worked = run_once()
        except Exception as e:  # noqa: BLE001
            _state["last"] = f"loop: {e}"
            worked = False
        if not worked:
            _wake.wait(120)
            _wake.clear()


def start() -> None:
    global _thread
    import os
    if os.environ.get("TOKMATRIX_MUSE_REMAKE", "1") == "0" or (_thread and _thread.is_alive()):
        return
    _thread = threading.Thread(target=_loop, name="muse-remake", daemon=True)
    _thread.start()


def wake() -> None:
    _wake.set()


def status() -> Dict[str, Any]:
    return {"running": bool(_thread and _thread.is_alive()), **_state}
