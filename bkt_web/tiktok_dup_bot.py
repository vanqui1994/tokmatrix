"""Tự hỏi bot @tiktok_check_video_bot xem video vừa đăng có bị "Trùng lặp" / "Shadowban" không.

Bot Telegram không nhận tin từ bot khác, nên dùng MỘT TÀI KHOẢN NGƯỜI DÙNG qua Telethon (MTProto).
Đăng nhập một lần, hai bước (để làm qua chat được):

    python3 -m bkt_web.tiktok_dup_bot login-start --api-id 123 --api-hash abc --phone +84...
    python3 -m bkt_web.tiktok_dup_bot login-finish --code 12345 [--password 2FA]
    python3 -m bkt_web.tiktok_dup_bot status
    python3 -m bkt_web.tiktok_dup_bot check https://www.tiktok.com/@user/video/123
    python3 -m bkt_web.tiktok_dup_bot run-once           # kiểm các video đã đăng chưa kiểm

api_id/api_hash lấy ở https://my.telegram.org → API development tools. Phiên (StringSession) lưu mã
hoá trong key vault "telegram.checker". Kết quả lưu ở bảng video_checks (bkt_channels.db).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from typing import Any, Dict, List, Optional

try:
    from bkt_web import key_vault
    from bkt_web.db_utils import connect_db
except ImportError:  # chạy trong thư mục bkt_web
    import key_vault
    from db_utils import connect_db

from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "bkt_channels.db"
KEY_NAME = "telegram.checker"
BOT = "tiktok_check_video_bot"
REPLY_TIMEOUT = 90
CHECK_DELAY_SECONDS = 20 * 60   # TikTok cần thời gian xử lý video trước khi bot đọc được
CHECK_SPACING_SECONDS = 30      # không dội bot (bot của người khác)

SCHEMA = """
CREATE TABLE IF NOT EXISTS video_checks (
    task_id INTEGER PRIMARY KEY,
    channel_id INTEGER,
    video_url TEXT,
    checked_at INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    shadowban INTEGER,            -- 1 có, 0 không, NULL chưa rõ
    duplicate INTEGER,            -- 1 trùng lặp, 0 không, NULL chưa rõ
    original_url TEXT DEFAULT '',
    original_task_id INTEGER,     -- task của CHÍNH MÌNH có published_video_id = id video gốc (nếu có)
    views INTEGER,
    raw TEXT DEFAULT '',
    error TEXT DEFAULT ''
);
"""


# ---------------------------------------------------------------------------
# Đọc câu trả lời của bot (định dạng quan sát 26/09)
# ---------------------------------------------------------------------------

def _flag(line: str) -> Optional[bool]:
    value = line.split(":", 1)[1] if ":" in line else line
    low = value.lower()
    if "không" in low or "✅" in value or "no" == low.strip():
        return False
    if "có" in low or "❌" in value or "trùng" in low:
        return True
    return None


def parse_reply(text: str, urls: Optional[List[str]] = None) -> Dict[str, Any]:
    """Tách các dòng "Shadowban: …", "Trùng lặp: …", "Views: …" và link VIDEO GỐC (entity URL)."""
    out: Dict[str, Any] = {"shadowban": None, "duplicate": None, "original_url": "", "views": None, "channel": ""}
    for line in (text or "").splitlines():
        low = line.lower()
        if "shadowban" in low:
            out["shadowban"] = _flag(line)
        elif "trùng lặp" in low or "duplicate" in low:
            out["duplicate"] = _flag(line)
        elif "views" in low or "lượt xem" in low:
            match = re.search(r"(?:views|lượt xem)\s*:\s*([\d.,]+)", line, re.I)
            if match:
                out["views"] = int(re.sub(r"[.,]", "", match.group(1)))
        elif low.strip().startswith(("👤", "kênh")) or "kênh:" in low:
            out["channel"] = line.split(":", 1)[-1].strip()
    originals = [u for u in (urls or []) if "tiktok.com" in u]
    if out["duplicate"] and originals:
        out["original_url"] = originals[-1]
    return out


_VIDEO_HEAD = re.compile(r"#(\d+)\s*:\s*(.*)")
_NUMBER = re.compile(r":\s*([\d.,]+)")


def _int(value: str) -> Optional[int]:
    digits = re.sub(r"[.,\s]", "", value or "")
    return int(digits) if digits.isdigit() else None


def parse_channel_reply(text: str, links: Optional[List[str]] = None) -> Dict[str, Any]:
    """Câu trả lời khi gửi link KÊNH: thông tin kênh + tối đa 5 video gần nhất (✅ bình thường, ❌ vi phạm).

    Link trong tin theo thứ tự: mỗi video 1 link video, video bị trùng có thêm link VIDEO GỐC ngay sau.
    """
    info: Dict[str, Any] = {"username": "", "followers": None, "likes": None, "videos_count": None, "videos": []}
    current: Optional[Dict[str, Any]] = None
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line or set(line) <= {"━", "-", "—"}:
            continue
        low = line.lower()
        head = _VIDEO_HEAD.search(line)
        if head and "thời gian" not in low and "shadowban" not in low:
            current = {"index": int(head.group(1)), "title": head.group(2).strip(), "created": "", "views": None,
                       "likes": None, "comments": None, "country": "", "shadowban": None, "duplicate": None,
                       "video_url": "", "original_url": ""}
            info["videos"].append(current)
            continue
        if current is None:
            value = line.split(":", 1)[1].strip() if ":" in line else ""
            if "username" in low:
                info["username"] = value.lstrip("@")
            elif "followers" in low:
                info["followers"] = _int(value)
            elif "likes" in low:
                info["likes"] = _int(value)
            elif low.split(":")[0].strip(" 🎬").endswith("videos"):
                info["videos_count"] = _int(value)
            continue
        if "thời gian tạo" in low:
            current["created"] = line.split(":", 1)[1].strip()
        elif "shadowban" in low:
            current["shadowban"] = _flag(line)
        elif "trùng lặp" in low or "duplicate" in low:
            current["duplicate"] = _flag(line)
        elif "quốc gia" in low:
            current["country"] = line.split(":", 1)[1].strip()
        else:
            numbers = [_int(n) for n in _NUMBER.findall(line)]
            if len(numbers) >= 3 and current["views"] is None:
                current["views"], current["likes"], current["comments"] = numbers[:3]
    video_links = [u for u in (links or []) if "/video/" in u]
    position = 0
    for video in info["videos"]:
        if position < len(video_links):
            video["video_url"] = video_links[position]
            position += 1
        if video["duplicate"] and position < len(video_links):
            video["original_url"] = video_links[position]
            position += 1
    return info


# ---------------------------------------------------------------------------
# Telethon
# ---------------------------------------------------------------------------

def _creds() -> Dict[str, Any]:
    raw = key_vault.get_key(KEY_NAME)
    return json.loads(raw) if raw else {}


def _save_creds(data: Dict[str, Any]) -> None:
    key_vault.set_key(KEY_NAME, json.dumps(data))


def _client(creds: Dict[str, Any], session: str = ""):
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    return TelegramClient(StringSession(session), int(creds["api_id"]), str(creds["api_hash"]))


async def _login_start(api_id: int, api_hash: str, phone: str) -> str:
    creds = {"api_id": int(api_id), "api_hash": api_hash, "phone": phone}
    client = _client(creds)
    await client.connect()
    sent = await client.send_code_request(phone)
    creds["pending_session"] = client.session.save()
    creds["phone_code_hash"] = sent.phone_code_hash
    creds.pop("session", None)
    _save_creds(creds)
    await client.disconnect()
    return "Đã gửi mã đăng nhập tới Telegram của số này. Chạy login-finish --code <mã>."


async def _login_finish(code: str, password: str = "") -> str:
    creds = _creds()
    if not creds.get("pending_session"):
        raise SystemExit("Chưa chạy login-start")
    client = _client(creds, creds["pending_session"])
    await client.connect()
    try:
        await client.sign_in(creds["phone"], code, phone_code_hash=creds["phone_code_hash"])
    except Exception as exc:
        if type(exc).__name__ != "SessionPasswordNeededError":
            raise
        if not password:
            raise SystemExit("Tài khoản có mật khẩu 2 lớp: chạy lại login-finish --code <mã> --password <mật khẩu>")
        await client.sign_in(password=password)
    me = await client.get_me()
    creds["session"] = client.session.save()
    for key in ("pending_session", "phone_code_hash"):
        creds.pop(key, None)
    _save_creds(creds)
    await client.disconnect()
    return f"Đã đăng nhập: {me.first_name or ''} (@{me.username or me.id})"


async def _ask_bot(url: str) -> Dict[str, Any]:
    creds = _creds()
    if not creds.get("session"):
        raise RuntimeError("Chưa đăng nhập Telegram cho bot kiểm trùng (tiktok_dup_bot login-start/login-finish)")
    client = _client(creds, creds["session"])
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise RuntimeError("Phiên Telegram hết hạn — đăng nhập lại")
        bot = await client.get_entity(BOT)
        sent = await client.send_message(bot, url)
        deadline = time.time() + REPLY_TIMEOUT
        while time.time() < deadline:
            await asyncio.sleep(3)
            async for message in client.iter_messages(bot, min_id=sent.id, limit=10):
                if message.out or not message.text:
                    continue
                text = message.text
                if "shadowban" not in text.lower() and "trùng" not in text.lower():
                    continue  # tin "đang xử lý…"
                urls = []
                for entity in message.entities or []:
                    if getattr(entity, "url", None):
                        urls.append(entity.url)
                return {**parse_reply(message.raw_text or text, urls), "raw": message.raw_text or text}
        raise TimeoutError(f"Bot không trả lời trong {REPLY_TIMEOUT}s")
    finally:
        await client.disconnect()


def check_url(url: str) -> Dict[str, Any]:
    """Telethon nếu đã đăng nhập bằng api_id; không thì Telegram Web (telegram_web_checker)."""
    if _creds().get("session"):
        return asyncio.run(_ask_bot(url))
    from bkt_web import telegram_web_checker
    return telegram_web_checker.check_url(url)


def available() -> bool:
    if _creds().get("session"):
        return True
    try:
        from bkt_web import telegram_web_checker
        return telegram_web_checker.logged_in()
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Kiểm các video đã đăng
# ---------------------------------------------------------------------------

def _ensure(conn) -> None:
    conn.executescript(SCHEMA)


def _original_task(conn, original_url: str) -> Optional[Dict[str, Any]]:
    """Bot ghép tên kênh ĐANG KIỂM với id video gốc, nên chỉ id là đáng tin: tìm id đó trong bài của mình."""
    match = re.search(r"/video/(\d+)", original_url or "")
    if not match:
        return None
    row = conn.execute(
        """SELECT u.id, u.channel_id, u.video_slug, COALESCE(c.username,'') FROM upload_tasks u
           LEFT JOIN channels c ON c.id = u.channel_id WHERE u.published_video_id = ? LIMIT 1""",
        (match.group(1),),
    ).fetchone()
    return {"task_id": row[0], "channel_id": row[1], "video_slug": row[2], "username": row[3]} if row else None


def _ensure_columns(conn) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(video_checks)")}
    if "original_task_id" not in cols:
        conn.execute("ALTER TABLE video_checks ADD COLUMN original_task_id INTEGER")


def due_tasks(conn, now: Optional[float] = None, limit: int = 5) -> List[Dict[str, Any]]:
    now = time.time() if now is None else now
    _ensure(conn)
    _ensure_columns(conn)
    rows = conn.execute(
        """SELECT u.id, u.channel_id, u.result_url FROM upload_tasks u
           LEFT JOIN video_checks v ON v.task_id = u.id
           WHERE u.status='SUCCESS' AND u.result_url LIKE '%/video/%' AND COALESCE(u.uploaded_at,0) <= ?
             AND (v.task_id IS NULL OR (v.checked_at = 0 AND v.attempts < 3))
           ORDER BY u.uploaded_at LIMIT ?""",
        (int(now - CHECK_DELAY_SECONDS), limit),
    ).fetchall()
    return [{"task_id": r[0], "channel_id": r[1], "video_url": r[2]} for r in rows]


def _notify(message: str, key: str) -> None:
    try:
        from bkt_web import notify
        notify.emit("video_check", message, severity="warn", dedupe_key=f"video_check:{key}", cooldown=None)
    except Exception:
        pass


def run_once(db_path: Optional[Path] = None, limit: int = 5, asker=None) -> int:
    """Hỏi bot cho tối đa `limit` video; trả số video đã kiểm. Chưa đăng nhập thì không làm gì."""
    if asker is None:
        if not available():
            return 0
        asker = check_url
    conn = connect_db(db_path or DB_PATH)
    try:
        done = 0
        for index, task in enumerate(due_tasks(conn, limit=limit)):
            if index:
                time.sleep(CHECK_SPACING_SECONDS)
            conn.execute("INSERT OR IGNORE INTO video_checks(task_id, channel_id, video_url) VALUES(?,?,?)",
                         (task["task_id"], task["channel_id"], task["video_url"]))
            try:
                result = asker(task["video_url"])
            except Exception as exc:
                conn.execute("UPDATE video_checks SET attempts=attempts+1, error=? WHERE task_id=?",
                             (f"{type(exc).__name__}: {exc}"[:500], task["task_id"]))
                conn.commit()
                continue
            conn.execute(
                """UPDATE video_checks SET checked_at=?, attempts=attempts+1, shadowban=?, duplicate=?, original_url=?,
                       views=?, raw=?, error='' WHERE task_id=?""",
                (int(time.time()), _bit(result.get("shadowban")), _bit(result.get("duplicate")), result.get("original_url") or "",
                 result.get("views"), (result.get("raw") or "")[:4000], task["task_id"]),
            )
            original = _original_task(conn, result.get("original_url") or "") if result.get("duplicate") else None
            if original:
                conn.execute("UPDATE video_checks SET original_task_id=? WHERE task_id=?", (original["task_id"], task["task_id"]))
            conn.commit()
            done += 1
            if result.get("duplicate") or result.get("shadowban"):
                flags = [name for name, key in (("TRÙNG LẶP", "duplicate"), ("SHADOWBAN", "shadowban")) if result.get(key)]
                source = ""
                if original:
                    source = f"\nTrùng với video của MÌNH: @{original['username']} — {original['video_slug']} (task #{original['task_id']})"
                elif result.get("original_url"):
                    source = f"\nVideo gốc (id): {result['original_url'].rstrip('/').split('/')[-1]} — không phải bài đã ghi nhận của mình"
                _notify(f"🚩 {' + '.join(flags)}: {task['video_url']}{source}", str(task["task_id"]))
        return done
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Kiểm theo KÊNH: một câu hỏi cho cả 5 video gần nhất của một acc
# ---------------------------------------------------------------------------

CHANNEL_INTERVAL_SECONDS = 6 * 3600   # mỗi acc đã đăng bài được kiểm lại sau ngần này
CHANNEL_SCHEMA = """
CREATE TABLE IF NOT EXISTS channel_checks (
    channel_id INTEGER PRIMARY KEY,
    username TEXT,
    checked_at INTEGER DEFAULT 0,
    followers INTEGER, likes INTEGER, videos_count INTEGER,
    flagged INTEGER DEFAULT 0,
    raw TEXT DEFAULT '',
    error TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS channel_video_checks (
    video_id TEXT PRIMARY KEY,
    channel_id INTEGER,
    task_id INTEGER,
    title TEXT, created TEXT,
    views INTEGER, likes INTEGER, comments INTEGER,
    shadowban INTEGER, duplicate INTEGER,
    original_video_id TEXT DEFAULT '',
    original_task_id INTEGER,
    checked_at INTEGER DEFAULT 0,
    notified INTEGER DEFAULT 0
);
"""


def _norm(text: str) -> str:
    return re.sub(r"[^\w]+", " ", (text or "").casefold()).strip()


def _video_id(url: str) -> str:
    match = re.search(r"/video/(\d+)", url or "")
    return match.group(1) if match else ""


def channels_due(conn, now: Optional[float] = None, limit: int = 5) -> List[Dict[str, Any]]:
    now = time.time() if now is None else now
    conn.executescript(CHANNEL_SCHEMA)
    rows = conn.execute(
        """SELECT u.channel_id, c.username, MAX(COALESCE(u.uploaded_at, u.started_at, 0)) AS last_post,
                  COALESCE(k.checked_at, 0) AS checked
           FROM upload_tasks u JOIN channels c ON c.id = u.channel_id
           LEFT JOIN channel_checks k ON k.channel_id = u.channel_id
           WHERE u.status IN ('SUCCESS','NEEDS_CHECK') AND COALESCE(c.username,'') <> ''
           GROUP BY u.channel_id
           HAVING last_post <= ? AND (checked < last_post OR checked <= ?)
           ORDER BY (checked < last_post) DESC, checked ASC LIMIT ?""",
        (int(now - CHECK_DELAY_SECONDS), int(now - CHANNEL_INTERVAL_SECONDS), limit),
    ).fetchall()
    return [{"channel_id": r[0], "username": r[1], "last_post": r[2], "checked_at": r[3]} for r in rows]


def _match_task(conn, channel_id: int, video: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    vid = _video_id(video.get("video_url") or "")
    if vid:
        row = conn.execute("SELECT id, caption, published_video_id FROM upload_tasks WHERE channel_id=? AND published_video_id=?",
                           (channel_id, vid)).fetchone()
        if row:
            return {"task_id": row[0], "published_video_id": row[2]}
    title = _norm(video.get("title"))[:40]
    if len(title) < 12:
        return None
    for task_id, caption, published in conn.execute(
            "SELECT id, caption, COALESCE(published_video_id,'') FROM upload_tasks WHERE channel_id=? AND status IN ('SUCCESS','NEEDS_CHECK')",
            (channel_id,)):
        if _norm(caption).startswith(title) or title.startswith(_norm(caption)[:40]):
            return {"task_id": task_id, "published_video_id": published}
    return None


def check_channel(conn, channel: Dict[str, Any], asker) -> Dict[str, Any]:
    reply = asker(channel["username"])
    info = parse_channel_reply(reply["text"], reply.get("links"))
    now = int(time.time())
    flagged = []
    for video in info["videos"]:
        vid = _video_id(video["video_url"])
        if not vid:
            continue
        task = _match_task(conn, channel["channel_id"], video)
        original_id = _video_id(video.get("original_url") or "")
        original = _original_task(conn, video.get("original_url") or "") if original_id else None
        if task and not task.get("published_video_id"):
            # bài đăng trước 26/09 chỉ lưu tiktokstudio/content: điền link thật từ câu trả lời của bot
            conn.execute("""UPDATE upload_tasks SET published_video_id=?,
                            result_url=CASE WHEN result_url LIKE '%/video/%' THEN result_url ELSE ? END WHERE id=?""",
                         (vid, video["video_url"], task["task_id"]))
        previous = conn.execute("SELECT shadowban, duplicate, notified FROM channel_video_checks WHERE video_id=?", (vid,)).fetchone()
        conn.execute(
            """INSERT INTO channel_video_checks(video_id,channel_id,task_id,title,created,views,likes,comments,shadowban,duplicate,
                                                original_video_id,original_task_id,checked_at,notified)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT notified FROM channel_video_checks WHERE video_id=?),0))
               ON CONFLICT(video_id) DO UPDATE SET task_id=excluded.task_id, views=excluded.views, likes=excluded.likes,
                   comments=excluded.comments, shadowban=excluded.shadowban, duplicate=excluded.duplicate,
                   original_video_id=excluded.original_video_id, original_task_id=excluded.original_task_id, checked_at=excluded.checked_at""",
            (vid, channel["channel_id"], task["task_id"] if task else None, video["title"][:300], video["created"],
             video["views"], video["likes"], video["comments"], _bit(video["shadowban"]), _bit(video["duplicate"]),
             original_id, original["task_id"] if original else None, now, vid),
        )
        if task:
            conn.execute(
                """INSERT INTO video_checks(task_id, channel_id, video_url, checked_at, attempts, shadowban, duplicate, original_url, views, original_task_id)
                   VALUES(?,?,?,?,1,?,?,?,?,?)
                   ON CONFLICT(task_id) DO UPDATE SET checked_at=excluded.checked_at, shadowban=excluded.shadowban,
                       duplicate=excluded.duplicate, original_url=excluded.original_url, views=excluded.views,
                       original_task_id=excluded.original_task_id, error=''""",
                (task["task_id"], channel["channel_id"], video["video_url"], now, _bit(video["shadowban"]), _bit(video["duplicate"]),
                 video.get("original_url") or "", video["views"], original["task_id"] if original else None),
            )
        if (video["shadowban"] or video["duplicate"]) and task:
            flagged.append((vid, video, original, previous))
    conn.execute(
        """INSERT INTO channel_checks(channel_id, username, checked_at, followers, likes, videos_count, flagged, raw, error)
           VALUES(?,?,?,?,?,?,?,?, '') ON CONFLICT(channel_id) DO UPDATE SET username=excluded.username, checked_at=excluded.checked_at,
           followers=excluded.followers, likes=excluded.likes, videos_count=excluded.videos_count, flagged=excluded.flagged,
           raw=excluded.raw, error=''""",
        (channel["channel_id"], channel["username"], now, info["followers"], info["likes"], info["videos_count"],
         len(flagged), (reply["text"] or "")[:4000]),
    )
    conn.commit()
    for vid, video, original, previous in flagged:
        if previous and previous[2]:
            continue  # đã báo video này
        flags = [name for name, value in (("TRÙNG LẶP", video["duplicate"]), ("SHADOWBAN", video["shadowban"])) if value]
        source = ""
        if original:
            source = f"\nTrùng với video của MÌNH: @{original['username']} — {original['video_slug']} (task #{original['task_id']})"
        elif video.get("original_url"):
            source = f"\nVideo gốc (id): {_video_id(video['original_url'])}"
        _notify(f"🚩 {' + '.join(flags)} @{channel['username']}: {video['video_url']}\n{video['title'][:80]}"
                f"\n👁 {video['views']}{source}", vid)
        conn.execute("UPDATE channel_video_checks SET notified=1 WHERE video_id=?", (vid,))
    conn.commit()
    return {"channel_id": channel["channel_id"], "videos": len(info["videos"]), "flagged": len(flagged)}


def run_channels_once(db_path: Optional[Path] = None, limit: int = 5, asker=None) -> List[Dict[str, Any]]:
    """Kiểm tối đa `limit` kênh đến hạn (30 s giữa hai câu hỏi cho bot)."""
    if asker is None:
        from bkt_web import telegram_web_checker
        if not telegram_web_checker.logged_in():
            return []
        asker = telegram_web_checker.ask_channel
    conn = connect_db(db_path or DB_PATH)
    try:
        conn.executescript(SCHEMA)
        _ensure_columns(conn)
        conn.executescript(CHANNEL_SCHEMA)
        results = []
        for index, channel in enumerate(channels_due(conn, limit=limit)):
            if index:
                time.sleep(CHECK_SPACING_SECONDS)
            try:
                results.append(check_channel(conn, channel, asker))
            except Exception as exc:
                # Ghi mốc kiểm = bây giờ: kênh lỗi chờ lượt kế (6 giờ hoặc khi có bài mới), không dội bot mỗi cycle.
                conn.execute("""INSERT INTO channel_checks(channel_id, username, checked_at, error) VALUES(?,?,?,?)
                                ON CONFLICT(channel_id) DO UPDATE SET checked_at=excluded.checked_at, error=excluded.error""",
                             (channel["channel_id"], channel["username"], int(time.time()), f"{type(exc).__name__}: {exc}"[:500]))
                conn.commit()
                results.append({"channel_id": channel["channel_id"], "error": str(exc)})
        return results
    finally:
        conn.close()


_worker = None


def start_background(limit: int = 5) -> bool:
    """Chạy run_once ở luồng nền (không chặn chu kỳ Autopilot); True nếu vừa khởi động một lượt."""
    import threading
    global _worker
    if _worker and _worker.is_alive():
        return False
    if not available():
        return False

    def work():
        try:
            run_channels_once(limit=limit)
        except Exception as exc:
            print(f"[tiktok_dup_bot] lỗi: {type(exc).__name__}: {exc}", flush=True)

    _worker = threading.Thread(target=work, name="tiktok-dup-bot", daemon=True)
    _worker.start()
    return True


def _bit(value: Optional[bool]) -> Optional[int]:
    return None if value is None else int(bool(value))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    start = sub.add_parser("login-start")
    start.add_argument("--api-id", type=int, required=True)
    start.add_argument("--api-hash", required=True)
    start.add_argument("--phone", required=True)
    finish = sub.add_parser("login-finish")
    finish.add_argument("--code", required=True)
    finish.add_argument("--password", default="")
    sub.add_parser("status")
    chk = sub.add_parser("check")
    chk.add_argument("url")
    chan = sub.add_parser("check-channel")
    chan.add_argument("username")
    runc = sub.add_parser("run-channels")
    runc.add_argument("--limit", type=int, default=5)
    run = sub.add_parser("run-once")
    run.add_argument("--limit", type=int, default=5)
    args = parser.parse_args(argv)
    if args.cmd == "login-start":
        print(asyncio.run(_login_start(args.api_id, args.api_hash, args.phone)))
    elif args.cmd == "login-finish":
        print(asyncio.run(_login_finish(args.code, args.password)))
    elif args.cmd == "status":
        creds = _creds()
        print("Telethon: " + ("đã đăng nhập" if creds.get("session") else "đang chờ mã" if creds.get("pending_session") else "chưa đăng nhập"))
        try:
            from bkt_web import telegram_web_checker
            print("Telegram Web: " + ("đã đăng nhập" if telegram_web_checker.logged_in() else "chưa đăng nhập"))
        except Exception as exc:
            print(f"Telegram Web: lỗi {exc}")
    elif args.cmd == "check":
        print(json.dumps(check_url(args.url), ensure_ascii=False, indent=2))
    elif args.cmd == "check-channel":
        from bkt_web import telegram_web_checker
        reply = telegram_web_checker.ask_channel(args.username)
        print(json.dumps(parse_channel_reply(reply["text"], reply["links"]), ensure_ascii=False, indent=2))
    elif args.cmd == "run-channels":
        print(json.dumps(run_channels_once(limit=args.limit), ensure_ascii=False))
    elif args.cmd == "run-once":
        print(f"đã kiểm {run_once(limit=args.limit)} video")
    return 0


if __name__ == "__main__":
    sys.exit(main())
