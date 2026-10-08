"""Kênh "POV" tự động: mỗi tài khoản TikTok một nhân vật cố định, mỗi ngày `per_day` video 9:16 (pov_story).

Nguồn ở storage/pov_channel.db (bảng `sources`: tài khoản, ngôn ngữ, niche, nhân vật, số video/ngày; bảng `videos`).
Luồng nền `pov-channel` (off: TOKMATRIX_POV=0) cứ CHECK_EVERY giây xem nguồn nào chưa đủ video trong 24 giờ:
  Gemini chọn một chủ đề POV mới (không trùng chủ đề đã làm của kênh) → pov_story.plan với nhân vật cố định
  → ImageRouter vẽ ảnh 9:16 → ghép (lia/zoom, TTS giọng tài khoản, phụ đề, nhạc êm)
  → upload_tasks.enqueue_auto (khung giờ kế tiếp của tài khoản, run_id `pov:<id>`).
Xoá video = xoá file + task đăng chưa đăng. Lỗi thì thử lại sau RETRY_AFTER, tối đa MAX_TRIES lần.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from bkt_web import muse_remake, pov_story, upload_tasks
    from bkt_web.services import gemini
except ImportError:
    import muse_remake
    import pov_story
    import upload_tasks
    from services import gemini

HERE = Path(__file__).resolve().parent
DB = HERE / "storage" / "pov_channel.db"
BASE = HERE / "storage" / "pov_channel"
CHANNELS_DB = HERE / "bkt_channels.db"
CHECK_EVERY = 600
RETRY_AFTER = 3600
MAX_TRIES = 3
SCENES = 18  # ~110 s: đủ > 60 s cho Creator Rewards

_thread: Optional[threading.Thread] = None
_wake = threading.Event()
_state: Dict[str, Any] = {"busy": None, "last": None}


def _conn() -> sqlite3.Connection:
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB), timeout=30)
    c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL UNIQUE, language TEXT NOT NULL,
        niche TEXT NOT NULL DEFAULT '', character TEXT NOT NULL, theme TEXT NOT NULL DEFAULT '',
        per_day INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, topic TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'queued', step TEXT NOT NULL DEFAULT '',
        final_path TEXT NOT NULL DEFAULT '', upload_task_id INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
        tries INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
    """)
    return c


def _upd(vid: int, **f) -> None:
    f["updated"] = int(time.time())
    with _conn() as c:
        c.execute(f"UPDATE videos SET {', '.join(k + '=?' for k in f)} WHERE id=?", (*f.values(), vid))


# ------------------------------------------------------------------ nguồn
CHARACTER = """Invent ONE original recurring main character for a reflective "POV" illustrated story channel in {lang}
(channel theme: {theme}). Describe the character precisely so an illustrator draws them identically every time:
age, gender, hair, face, one signature outfit with colours, one accessory. Avoid: dark navy polo shirt, khaki trousers,
dark curly hair, and the look "{avoid}". Return JSON {{"character": "..."}}"""


def add_source(channel_id: int, theme: str = "money, work and quietly choosing a calmer life than everyone around you",
               per_day: int = 1, character: str = "") -> Dict[str, Any]:
    voice = muse_remake.account_voice(channel_id)
    language = voice["language"]
    if language not in pov_story.LANG_NAMES:
        raise ValueError(f"Ngôn ngữ {language} không hỗ trợ (chỉ de/en/ko/ja)")
    if not character:
        with _conn() as c:
            avoid = "; ".join(r[0][:80] for r in c.execute("SELECT character FROM sources"))
        character = str(gemini.generate_json(CHARACTER.format(lang=pov_story.LANG_NAMES[language], theme=theme,
                                                              avoid=avoid or "none"), rounds=2).get("character") or "")
        if not character:
            raise RuntimeError("Gemini không tạo được nhân vật")
    with _conn() as c:
        try:
            c.execute("INSERT INTO sources(channel_id, language, niche, character, theme, per_day, created) VALUES (?,?,?,?,?,?,?)",
                      (channel_id, language, voice["niche"] or "", character[:600], theme[:300], max(1, min(5, per_day)), int(time.time())))
        except sqlite3.IntegrityError:
            raise ValueError("Tài khoản này đã có nguồn POV")
    _wake.set()
    return next(s for s in sources() if s["channel_id"] == channel_id)


def sources() -> List[Dict[str, Any]]:
    names = muse_remake._account_names()
    with _conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM sources ORDER BY id")]
        for r in rows:
            r["counts"] = {k: n for k, n in c.execute("SELECT status, COUNT(*) FROM videos WHERE source_id=? GROUP BY status", (r["id"],))}
            r["account"] = names.get(r["channel_id"], f"#{r['channel_id']}")
    return rows


def update_source(sid: int, *, per_day: Optional[int] = None, enabled: Optional[bool] = None) -> None:
    with _conn() as c:
        if per_day is not None:
            c.execute("UPDATE sources SET per_day=? WHERE id=?", (max(1, min(5, per_day)), sid))
        if enabled is not None:
            c.execute("UPDATE sources SET enabled=? WHERE id=?", (1 if enabled else 0, sid))
    _wake.set()


def videos(limit: int = 200) -> List[Dict[str, Any]]:
    with _conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM videos ORDER BY id DESC LIMIT ?", (limit,))]


# ------------------------------------------------------------------ một video
TOPIC = """Suggest ONE new topic for a reflective second-person "POV" story video ({lang} channel, theme: {theme}).
Format like "POV: You …" (short, in {lang}). It must be clearly different from these earlier topics:
{used}
Return JSON {{"topic": "..."}}"""


def _topic(src: Dict[str, Any]) -> str:
    with _conn() as c:
        used = [r[0] for r in c.execute("SELECT topic FROM videos WHERE source_id=? AND topic!='' ORDER BY id DESC LIMIT 60", (src["id"],))]
    data = gemini.generate_json(TOPIC.format(lang=pov_story.LANG_NAMES[src["language"]], theme=src["theme"],
                                             used="\n".join(f"- {u}" for u in used) or "- (none yet)"), rounds=2)
    topic = str(data.get("topic") or "").strip()
    if not topic:
        raise RuntimeError("Gemini không đề xuất được chủ đề")
    return topic[:200]


def process(vid: int) -> None:
    with _conn() as c:
        v = dict(c.execute("SELECT * FROM videos WHERE id=?", (vid,)).fetchone())
        src = dict(c.execute("SELECT * FROM sources WHERE id=?", (v["source_id"],)).fetchone())
    work = BASE / str(vid)
    work.mkdir(parents=True, exist_ok=True)
    if not v["topic"]:
        _upd(vid, status="writing", step="Chọn chủ đề")
        v["topic"] = _topic(src)
        _upd(vid, topic=v["topic"])
    story_file = work / "story.json"
    if story_file.is_file():
        story = json.loads(story_file.read_text())
    else:
        _upd(vid, status="writing", step="Viết kịch bản")
        story = pov_story.plan(v["topic"], src["language"], SCENES, character=src["character"])
        story_file.write_text(json.dumps(story, ensure_ascii=False, indent=1))
    _upd(vid, title=story["title"], status="drawing", step=f"Vẽ {len(story['scenes'])} ảnh")
    images = pov_story.draw(work, story, "9:16")
    _upd(vid, status="assembling", step="Lồng tiếng, phụ đề, ghép")
    voice = muse_remake.account_voice(src["channel_id"])
    final = pov_story.assemble(work, story, images, "9:16", src["language"], voice["voice"])
    caption = (story.get("caption") or story["title"]).strip()
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as conn:
        task = upload_tasks.enqueue_auto(conn, src["channel_id"], str(final), caption, niche=src["niche"] or "philosophy_paradox",
                                         language=src["language"], run_id=f"pov:{vid}")
    _upd(vid, status="queued_upload", step="", final_path=str(final), upload_task_id=task, error="")


def delete_video(vid: int) -> Dict[str, Any]:
    with _conn() as c:
        row = c.execute("SELECT upload_task_id FROM videos WHERE id=?", (vid,)).fetchone()
    if not row:
        raise ValueError("Không có video này")
    note = ""
    if row[0]:
        with sqlite3.connect(str(CHANNELS_DB), timeout=30) as conn:
            st = conn.execute("SELECT status FROM upload_tasks WHERE id=?", (row[0],)).fetchone()
            if st and st[0] == "SUCCESS":
                note = "video đã đăng lên TikTok: chỉ xoá khỏi danh sách, không gỡ khỏi TikTok"
            elif st:
                conn.execute("DELETE FROM upload_tasks WHERE id=? AND status!='SUCCESS'", (row[0],))
    shutil.rmtree(BASE / str(int(vid)), ignore_errors=True)
    _upd(vid, status="deleted", step="", final_path="", error=note)
    return {"deleted": vid, "note": note}


def retry_video(vid: int) -> None:
    _upd(vid, status="queued", error="", tries=0)
    _wake.set()


# ------------------------------------------------------------------ luồng nền
def _due() -> None:
    now = int(time.time())
    with _conn() as c:
        for s in c.execute("SELECT * FROM sources WHERE enabled=1").fetchall():
            made = c.execute("SELECT COUNT(*) FROM videos WHERE source_id=? AND created>=?", (s["id"], now - 86400)).fetchone()[0]
            for _ in range(max(0, s["per_day"] - made)):
                c.execute("INSERT INTO videos(source_id, created, updated) VALUES (?,?,?)", (s["id"], now, now))


def run_once() -> bool:
    _due()
    now = int(time.time())
    with _conn() as c:
        row = c.execute("SELECT id FROM videos WHERE status IN ('queued','writing','drawing','assembling') "
                        "OR (status='error' AND tries<? AND updated<?) ORDER BY id LIMIT 1", (MAX_TRIES, now - RETRY_AFTER)).fetchone()
    if not row:
        return False
    vid = row["id"]
    _state["busy"] = vid
    try:
        process(vid)
        _state["last"] = f"{time.strftime('%H:%M:%S')} video {vid} vào hàng đợi đăng"
    except Exception as e:  # noqa: BLE001
        with _conn() as c:
            c.execute("UPDATE videos SET status='error', step='', error=?, tries=tries+1, updated=? WHERE id=?",
                      (str(e)[:600], int(time.time()), vid))
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
            _wake.wait(CHECK_EVERY)
            _wake.clear()


def start() -> None:
    global _thread
    if os.environ.get("TOKMATRIX_POV", "1") == "0" or (_thread and _thread.is_alive()):
        return
    _thread = threading.Thread(target=_loop, name="pov-channel", daemon=True)
    _thread.start()


def status() -> Dict[str, Any]:
    return {"running": bool(_thread and _thread.is_alive()), **_state}
