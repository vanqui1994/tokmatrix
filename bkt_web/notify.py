"""Thông báo Telegram cho VPS TokMatrix (docs/PLAN_telegram_notifications.md).

    emit(event, text, severity, dedupe_key)  →  bảng notify_outbox (bkt_channels.db)
    sender thread (2 s)                      →  api.telegram.org sendMessage, ≤1 tin/giây/chat
    watcher thread (60 s, chỉ đọc)           →  job READY_TO_PUBLISH/SCHEDULED/DEAD_LETTER,
                                                upload SUCCESS/NEEDS_CHECK/ERROR, giữ/bỏ giữ đăng,
                                                trạng thái VPS theo giờ, quá tải kéo dài

Token bot nằm trong key vault (`notify.telegram`), chat nhận tin ở settings
`notify_telegram_chat_ids`. Không có token hoặc chat thì emit vẫn ghi outbox nhưng không gửi.

CLI (chạy ở thư mục gốc, bằng user sở hữu DB):
    python3 -m bkt_web.notify set-token          # đọc token từ stdin, không lộ trên ps/history
    python3 -m bkt_web.notify set-chat <id>[,<id>]
    python3 -m bkt_web.notify find-chat          # getUpdates: in chat_id của ai vừa nhắn cho bot
    python3 -m bkt_web.notify config [--quiet 0-7|off] [--render each|digest]
    python3 -m bkt_web.notify test               # gửi một tin thử ngay
    python3 -m bkt_web.notify send --severity critical "nội dung"   # gửi thẳng, không qua server
    python3 -m bkt_web.notify status             # tin chờ gửi / lỗi gần nhất
"""
from __future__ import annotations

import argparse
import datetime
import html
import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, deque
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    from bkt_web import key_vault
    from bkt_web import upload_states as us
    from bkt_web.db_utils import connect_db
except ImportError:  # chạy trực tiếp trong bkt_web/
    import key_vault
    import upload_states as us
    from db_utils import connect_db

logger = logging.getLogger("notify")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
MATRIX_DB = BASE_DIR / "storage" / "matrix_factory.db"
AUTOPILOT_DB = BASE_DIR / "storage" / "autopilot.db"

KEY_NAME = "notify.telegram"
API_BASE = os.environ.get("TOKMATRIX_TELEGRAM_API", "https://api.telegram.org")
MAX_LEN = 4096
SEVERITY_RANK = {"info": 0, "warn": 1, "critical": 2}
DEFAULT_COOLDOWN = 6 * 3600
GROUP_THRESHOLD = 5          # hơn 5 tin cùng loại đang chờ → một tin tổng hợp
DIGEST_SECONDS = 30 * 60     # chế độ render=digest: gom tin "video xong" mỗi 30 phút
MAX_ATTEMPTS = 8
STATUS_HOURS = (8, 14, 20)
OVERLOAD_MINUTES = 30

SETTING_CHATS = "notify_telegram_chat_ids"
SETTING_QUIET = "notify_quiet_hours"      # "" = tắt, "0-7" = 00:00–07:00 chỉ gửi critical
SETTING_RENDER = "notify_render_mode"     # each | digest

EVENT_LABELS = {
    "render_done": "🎬 video render xong",
    "job_dead": "☠️ job hỏng",
    "upload_success": "📤 đăng thành công",
    "upload_needs_check": "⚠️ cần kiểm tra",
    "upload_error": "❌ đăng lỗi",
}

_TOKEN_RE = re.compile(r"\b\d{6,12}:[A-Za-z0-9_-]{30,}\b")
_SECRET_RE = re.compile(r"(?i)\b(sessionid|sid_tt|sid_guard|cookie|token|password|passwd|secret|api[_-]?key)(\s*[=:]\s*)[^\s;,&\"']+")


# ------------------------------------------------------------------ DB

def _conn() -> sqlite3.Connection:
    conn = connect_db(DB_PATH)
    ensure_tables(conn)
    return conn


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS notify_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'info',
            dedupe_key TEXT DEFAULT '',
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            sent_at INTEGER DEFAULT 0,
            attempts INTEGER DEFAULT 0,
            next_attempt_at INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            error TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_notify_outbox_pending ON notify_outbox(status, next_attempt_at);
        CREATE TABLE IF NOT EXISTS notify_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        """
    )


def _state_get(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM notify_state WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def _state_set(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO notify_state(key, value, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (key, str(value), int(time.time())),
    )


def _setting(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return (row[0] if row and row[0] is not None else default).strip()


def _set_setting(conn, key: str, value: str) -> None:
    conn.execute("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (key, value))


def _ro(path: Path) -> Optional[sqlite3.Connection]:
    if not path.exists():
        return None
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


# ------------------------------------------------------------------ định dạng

def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=False)


def sanitize(text: str) -> str:
    """Lọc chuỗi giống token/cookie trước khi đưa vào tin nhắn."""
    text = _TOKEN_RE.sub("[token]", text or "")
    return _SECRET_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}[ẩn]", text)


def short(value: Any, limit: int = 300) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def truncate(text: str, limit: int = MAX_LEN) -> str:
    """Cắt tin quá dài mà không để lại thẻ HTML/entity dở dang."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 20]
    cut = re.sub(r"<[^>]*$", "", cut)
    cut = re.sub(r"&[#a-zA-Z0-9]*$", "", cut)
    for tag in ("b", "i", "code", "pre"):
        missing = cut.count(f"<{tag}>") - cut.count(f"</{tag}>")
        cut += f"</{tag}>" * max(0, missing)
    return cut + "\n…(đã cắt)"


def _fmt_ts(ts: Any) -> str:
    try:
        return datetime.datetime.fromtimestamp(int(ts)).strftime("%d/%m %H:%M")
    except (TypeError, ValueError, OSError):
        return "?"


# ------------------------------------------------------------------ emit

def emit(event: str, text: str, severity: str = "info", dedupe_key: str = "",
         cooldown: Optional[int] = DEFAULT_COOLDOWN, conn: Optional[sqlite3.Connection] = None) -> bool:
    """Ghi một tin vào outbox. Trả False nếu bị chặn vì dedupe/cooldown.

    `cooldown=None` nghĩa là chỉ gửi một lần duy nhất cho dedupe_key (ví dụ mỗi job).
    Cùng dedupe_key trong thời gian cooldown vẫn được gửi nếu mức độ nặng hơn lần trước.
    """
    severity = severity if severity in SEVERITY_RANK else "info"
    own = conn is None
    conn = conn or _conn()
    try:
        now = int(time.time())
        if dedupe_key:
            prev = _state_get(conn, f"dedupe:{dedupe_key}")
            if prev:
                prev_ts, _, prev_sev = prev.partition("|")
                recent = cooldown is None or now - int(prev_ts or 0) < cooldown
                if recent and SEVERITY_RANK.get(severity, 0) <= SEVERITY_RANK.get(prev_sev, 0):
                    return False
            _state_set(conn, f"dedupe:{dedupe_key}", f"{now}|{severity}")
        conn.execute(
            "INSERT INTO notify_outbox(event, severity, dedupe_key, text, created_at) VALUES (?, ?, ?, ?, ?)",
            (event, severity, dedupe_key, truncate(sanitize(text)), now),
        )
        conn.commit()
        return True
    except sqlite3.Error:
        logger.exception("notify: không ghi được outbox")
        return False
    finally:
        if own:
            conn.close()


def mark_seen(conn, dedupe_key: str, severity: str = "info") -> None:
    """Đánh dấu một sự kiện đã biết (không gửi) — dùng khi khởi tạo lần đầu để khỏi xả lịch sử."""
    _state_set(conn, f"dedupe:{dedupe_key}", f"{int(time.time())}|{severity}")


# ------------------------------------------------------------------ gửi

class TelegramError(Exception):
    def __init__(self, message: str, *, retry_after: int = 0, permanent: bool = False):
        super().__init__(message)
        self.retry_after = retry_after
        self.permanent = permanent


def _api(token: str, method: str, params: Dict[str, Any], timeout: float = 20) -> Dict[str, Any]:
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{API_BASE}/bot{token}/{method}", data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode() or "{}")
        except (ValueError, OSError):
            body = {}
        finally:
            exc.close()
        desc = sanitize(str(body.get("description") or exc.reason))
        if exc.code == 429:
            retry = int((body.get("parameters") or {}).get("retry_after") or 5)
            raise TelegramError(f"429 {desc}", retry_after=retry)
        raise TelegramError(f"{exc.code} {desc}", permanent=400 <= exc.code < 500)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise TelegramError(sanitize(f"mạng: {exc}"))
    if not body.get("ok"):
        raise TelegramError(sanitize(str(body.get("description") or "không rõ lỗi")), permanent=True)
    return body


def send_message(token: str, chat_id: str, text: str, *, silent: bool = False) -> None:
    _api(token, "sendMessage", {
        "chat_id": chat_id, "text": truncate(text), "parse_mode": "HTML",
        "disable_web_page_preview": "true", "disable_notification": "true" if silent else "false",
    })


def config(conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    own = conn is None
    conn = conn or _conn()
    try:
        chats = _setting(conn, SETTING_CHATS) or os.environ.get("TOKMATRIX_TELEGRAM_CHAT_ID", "")
        return {
            "token": key_vault.get_key(KEY_NAME) or os.environ.get("TOKMATRIX_TELEGRAM_TOKEN", ""),
            "chats": [c.strip() for c in chats.split(",") if c.strip()],
            "quiet": _setting(conn, SETTING_QUIET),
            "render_mode": _setting(conn, SETTING_RENDER, "each") or "each",
        }
    finally:
        if own:
            conn.close()


def in_quiet_hours(spec: str, now: Optional[datetime.datetime] = None) -> bool:
    m = re.fullmatch(r"\s*(\d{1,2})\s*-\s*(\d{1,2})\s*", spec or "")
    if not m:
        return False
    start, end = int(m.group(1)) % 24, int(m.group(2)) % 24
    hour = (now or datetime.datetime.now()).hour
    return start <= hour < end if start < end else (hour >= start or hour < end)


def _group_text(event: str, rows: Sequence[sqlite3.Row]) -> str:
    """Một tin tổng hợp: tiêu đề + mỗi tin gốc một dòng (dòng thứ hai của tin, hoặc dòng đầu bỏ tiêu đề)."""
    label = EVENT_LABELS.get(event, event)
    head = f"<b>{len(rows)} × {label}</b>"
    if event == "render_done":
        engines = Counter(m.group(1) for r in rows for m in [re.search(r"<i>([^<]+)</i>", r["text"])] if m)
        if engines:
            head += "\n" + " · ".join(f"{k} {v}" for k, v in engines.most_common())
    lines = [head, ""]
    for r in rows:
        parts = r["text"].split("\n")
        body = parts[1] if len(parts) > 1 and not parts[1].startswith("<code>") else \
            re.sub(r"^\S+\s+<b>[^<]*</b>\s*·?\s*", "", parts[0])
        lines.append("• " + body)
    return truncate("\n".join(lines))


def _due_batches(conn, cfg: Dict[str, Any], now: int) -> List[Tuple[str, str, List[sqlite3.Row]]]:
    """Chia tin chờ gửi thành các lô (event, severity, rows); lô >5 tin thành một tin tổng hợp."""
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM notify_outbox WHERE status='pending' AND next_attempt_at<=? ORDER BY id LIMIT 500", (now,)
    ).fetchall()
    conn.row_factory = None
    quiet = in_quiet_hours(cfg["quiet"])
    by_event: Dict[str, List[sqlite3.Row]] = {}
    for r in rows:
        if quiet and r["severity"] != "critical":
            continue  # giờ yên tĩnh: dồn lại, gửi gộp khi hết giờ
        by_event.setdefault(r["event"], []).append(r)
    batches: List[Tuple[str, str, List[sqlite3.Row]]] = []
    for event, items in by_event.items():
        if event == "render_done" and cfg["render_mode"] == "digest":
            if now - items[0]["created_at"] < DIGEST_SECONDS:
                continue
            batches.append((event, "info", items))
        elif len(items) > GROUP_THRESHOLD:
            sev = max((i["severity"] for i in items), key=lambda s: SEVERITY_RANK.get(s, 0))
            batches.append((event, sev, items))
        else:
            batches.extend((event, i["severity"], [i]) for i in items)
    batches.sort(key=lambda b: b[2][0]["id"])
    return batches


def flush_once(sleep=time.sleep) -> int:
    """Gửi các tin đến hạn; trả số tin (lô) đã gửi."""
    conn = _conn()
    try:
        cfg = config(conn)
        if not cfg["token"] or not cfg["chats"]:
            return 0
        now = int(time.time())
        sent = 0
        for event, severity, rows in _due_batches(conn, cfg, now):
            text = rows[0]["text"] if len(rows) == 1 and not (
                event == "render_done" and cfg["render_mode"] == "digest") else _group_text(event, rows)
            ids = [r["id"] for r in rows]
            marks = ",".join("?" * len(ids))
            try:
                for i, chat in enumerate(cfg["chats"]):
                    if sent or i:
                        sleep(1.05)  # ≤1 tin/giây/chat
                    send_message(cfg["token"], chat, text, silent=severity == "info")
            except TelegramError as exc:
                attempts = max(r["attempts"] for r in rows) + 1
                if exc.retry_after:
                    delay, status = exc.retry_after + 1, "pending"
                elif exc.permanent or attempts >= MAX_ATTEMPTS:
                    delay, status = 0, "failed"
                else:
                    delay, status = min(900, 5 * 2 ** attempts), "pending"
                conn.execute(
                    f"UPDATE notify_outbox SET attempts=attempts+1, next_attempt_at=?, status=?, error=? WHERE id IN ({marks})",
                    (now + delay, status, str(exc)[:500], *ids),
                )
                conn.commit()
                logger.warning("notify: gửi lỗi (%s): %s", event, exc)
                if exc.retry_after or not exc.permanent:
                    break  # mạng/429: chờ lượt sau, giữ thứ tự
                continue
            conn.execute(
                f"UPDATE notify_outbox SET status='sent', sent_at=?, attempts=attempts+1, error='' WHERE id IN ({marks})",
                (int(time.time()), *ids),
            )
            conn.commit()
            sent += 1
        # Giữ bảng gọn: tin đã gửi quá 30 ngày.
        conn.execute("DELETE FROM notify_outbox WHERE status!='pending' AND created_at<?", (now - 30 * 86400,))
        conn.commit()
        return sent
    finally:
        conn.close()


def send_direct(text: str, severity: str = "warn") -> None:
    """Gửi ngay không qua outbox (watchdog khi server chết, lệnh test)."""
    cfg = config()
    if not cfg["token"]:
        raise TelegramError(f"chưa có token — chạy: python3 -m bkt_web.notify set-token", permanent=True)
    if not cfg["chats"]:
        raise TelegramError("chưa có chat — chạy: python3 -m bkt_web.notify set-chat <chat_id>", permanent=True)
    for i, chat in enumerate(cfg["chats"]):
        if i:
            time.sleep(1.05)
        send_message(cfg["token"], chat, truncate(sanitize(text)), silent=severity == "info")


# ------------------------------------------------------------------ nguồn sự kiện

def _json(value: Any) -> Dict[str, Any]:
    try:
        data = json.loads(value or "{}")
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError):
        return {}


def _upload_for_slug(conn, slug: str) -> Optional[Tuple]:
    return conn.execute(
        "SELECT u.schedule_time, c.username FROM upload_tasks u LEFT JOIN channels c ON c.id=u.channel_id "
        "WHERE u.video_slug=? AND u.status<>? ORDER BY u.id DESC LIMIT 1", (slug, us.CANCELLED)
    ).fetchone()


LANG_FLAGS = {"DE": "🇩🇪", "EN": "🇺🇸", "US": "🇺🇸", "UK": "🇬🇧", "GB": "🇬🇧", "VI": "🇻🇳", "JA": "🇯🇵", "JP": "🇯🇵",
              "KO": "🇰🇷", "KR": "🇰🇷", "FR": "🇫🇷", "ES": "🇪🇸", "BG": "🇧🇬", "LU": "🇱🇺"}


def render_done_text(job: sqlite3.Row, upload: Optional[Tuple], min_lead_hours: int = 0) -> str:
    cfgj = _json(job["resolved_config_json"])
    lang = str(cfgj.get("language") or cfgj.get("lang") or "").upper()
    manifest = _json(job["manifest_json"])
    duration = manifest.get("duration") or manifest.get("durationSeconds") or manifest.get("total_duration")
    channel = f"📺 {esc(job['channel_name'])}"
    if lang:
        channel += f" · {LANG_FLAGS.get(lang, '🌐')} {esc(lang)}"
    style = f"🎨 <i>{esc(job['engine_type'])}</i>"
    try:
        if duration:
            style += f" · ⏱ {round(float(duration))}s"
    except (TypeError, ValueError):
        pass
    lines = ["🎬 <b>Video render xong</b>", channel, style, f"📝 “{esc(short(job['title'], 90))}”"]
    if upload and upload[0]:
        lines.append(f"📅 Lên lịch <b>{_fmt_ts(upload[0])}</b>" + (f" · @{esc(upload[1])}" if upload[1] else ""))
    elif min_lead_hours:
        lines.append(f"⏳ Chờ đăng từ <b>{_fmt_ts(int(job['updated_at']) + min_lead_hours * 3600)}</b>")
    lines.append(f"<code>{esc(job['video_slug'])}</code>")
    return "\n".join(lines)


def _autopilot_config() -> Dict[str, str]:
    conn = _ro(AUTOPILOT_DB)
    if not conn:
        return {}
    try:
        return {r[0]: r[1] for r in conn.execute("SELECT key, value FROM autopilot_config").fetchall()}
    except sqlite3.Error:
        return {}
    finally:
        conn.close()


def check_jobs(conn) -> int:
    mdb = _ro(MATRIX_DB)
    if not mdb:
        return 0
    try:
        first = _state_get(conn, "cursor:jobs") == ""
        cursor = int(_state_get(conn, "cursor:jobs", "0") or 0)
        rows = mdb.execute(
            """SELECT j.job_id, j.state, j.engine_type, j.video_slug, j.error_message, j.updated_at,
                      j.manifest_json, c.channel_name, c.niche_id, c.resolved_config_json, t.title
               FROM content_jobs j
               LEFT JOIN channels c ON c.channel_id=j.channel_id
               LEFT JOIN topics t ON t.topic_id=j.topic_id
               WHERE j.updated_at>? AND j.state IN ('READY_TO_PUBLISH','SCHEDULED','DEAD_LETTER')
               ORDER BY j.updated_at LIMIT 1000""",
            # Lùi 2 phút: job ghi cùng giây với lần đọc trước không bị lỡ; dedupe chặn gửi trùng.
            (max(0, cursor - 120),),
        ).fetchall()
    except sqlite3.Error as exc:
        logger.warning("notify: không đọc được matrix_factory.db: %s", exc)
        return 0
    finally:
        mdb.close()
    lead = int(_autopilot_config().get("min_lead_hours") or 0)
    emitted = 0
    for job in rows:
        cursor = max(cursor, int(job["updated_at"] or 0))
        if job["state"] == "DEAD_LETTER":
            key = f"job:{job['job_id']}:dead"
            if first:
                mark_seen(conn, key)
                continue
            text = "\n".join([
                "☠️ <b>Job hỏng (dead letter)</b>",
                f"📺 {esc(job['channel_name'])} · <i>{esc(job['niche_id'])}</i>",
                f"📝 “{esc(short(job['title'], 80))}”",
                f"💬 {esc(short(job['error_message'], 400))}",
                f"<code>{esc(job['video_slug'])}</code>",
            ])
            emitted += emit("job_dead", text, "warn", key, cooldown=None, conn=conn)
        else:
            key = f"job:{job['job_id']}:ready"
            if first:
                mark_seen(conn, key)
                continue
            upload = _upload_for_slug(conn, job["video_slug"]) if job["state"] == "SCHEDULED" else None
            emitted += emit("render_done", render_done_text(job, upload, lead), "info", key, cooldown=None, conn=conn)
    _state_set(conn, "cursor:jobs", str(max(cursor, int(time.time())) if first else cursor))
    conn.commit()
    return emitted


UPLOAD_EVENTS = {
    us.SUCCESS: ("upload_success", "info", "📤 <b>Đăng thành công</b>"),
    us.NEEDS_CHECK: ("upload_needs_check", "warn", "⚠️ <b>Cần kiểm tra bài đăng</b>\n<i>Đã bấm Đăng nhưng chưa thấy xác nhận — không tự đăng lại</i>"),
    us.ERROR: ("upload_error", "warn", "❌ <b>Đăng bài lỗi</b>"),
}


def check_uploads(conn) -> int:
    first = _state_get(conn, "init:uploads") == ""
    since = int(time.time()) - 7 * 86400
    watched_states = (us.SUCCESS, us.NEEDS_CHECK, us.ERROR)
    marks = us.sql_marks(watched_states)
    rows = conn.execute(
        f"""SELECT u.id, u.status, u.result_url, u.error_message, u.video_slug, u.attempt_count, c.username
            FROM upload_tasks u LEFT JOIN channels c ON c.id=u.channel_id
            WHERE u.status IN ({marks}) AND MAX(u.created_at, u.uploaded_at, u.started_at)>=?
            ORDER BY u.id""",
        (*watched_states, since),
    ).fetchall()
    emitted = 0
    for task_id, status, url, error, slug, attempts, username in rows:
        event, severity, head = UPLOAD_EVENTS[status]
        key = f"upload:{task_id}:{status}"
        if first:
            mark_seen(conn, key)
            continue
        lines = [head, f"👤 @{esc(username or '?')} · task #{task_id}"]
        if status == us.SUCCESS and url:
            lines.append(f"🔗 {esc(url)}")
        if status != us.SUCCESS and error:
            lines.append(f"💬 {esc(short(error, 400))}" + (f" (sau {attempts} lần)" if status == us.ERROR and attempts else ""))
        lines.append(f"<code>{esc(slug or '')}</code>")
        emitted += emit(event, "\n".join(lines), severity, key, cooldown=None, conn=conn)
    if first:
        _state_set(conn, "init:uploads", str(int(time.time())))
    conn.commit()
    return emitted


def check_hold(conn) -> int:
    hold = int(_autopilot_config().get("publish_hold_until") or 0)
    now = int(time.time())
    active = str(hold) if hold > now else "0"
    prev = _state_get(conn, "hold")
    _state_set(conn, "hold", active)
    conn.commit()
    if prev == "" or prev == active:
        return 0
    if active != "0":
        text = f"🧊 <b>Tạm giữ đăng</b> tới <b>{_fmt_ts(hold)}</b>\n<i>Video vẫn được làm và chờ ở READY_TO_PUBLISH</i>"
    elif prev != "0" and int(prev) <= now:
        text = "▶️ <b>Hết giờ giữ đăng</b> — Autopilot đăng lại theo lịch"
    else:
        text = "▶️ <b>Bỏ giữ đăng</b> — Autopilot đăng lại theo lịch"
    return int(emit("hold", text, "info", conn=conn, dedupe_key=""))


# ------------------------------------------------------------------ số liệu VPS

def _meminfo() -> Dict[str, int]:
    out: Dict[str, int] = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            name, _, rest = line.partition(":")
            out[name] = int(rest.split()[0]) * 1024
    except (OSError, ValueError, IndexError):
        pass
    return out


def _service_active(name: str) -> Optional[bool]:
    if not shutil.which("systemctl"):
        return None
    try:
        res = subprocess.run(["systemctl", "is-active", name], capture_output=True, text=True, timeout=5)
        return res.stdout.strip() == "active"
    except (OSError, subprocess.SubprocessError):
        return None


def _render_procs() -> int:
    try:
        res = subprocess.run(["pgrep", "-fc", "hyperframes|chrome-headless-shell|ffmpeg"],
                             capture_output=True, text=True, timeout=5)
        return int(res.stdout.strip() or 0)
    except (OSError, subprocess.SubprocessError, ValueError):
        return 0


def metrics() -> Dict[str, Any]:
    mem = _meminfo()
    load = os.getloadavg()[0] if hasattr(os, "getloadavg") else 0.0
    disk = shutil.disk_usage(str(BASE_DIR))
    data: Dict[str, Any] = {
        "load": round(load, 1), "cpus": os.cpu_count() or 1,
        "mem_avail_gb": round(mem.get("MemAvailable", 0) / 1e9, 1),
        "swap_used_gb": round((mem.get("SwapTotal", 0) - mem.get("SwapFree", 0)) / 1e9, 1),
        "disk_free_gb": round(disk.free / 1e9),
        "render_procs": _render_procs(),
    }
    ap = _ro(AUTOPILOT_DB)
    if ap:
        try:
            data["batches"] = ap.execute(
                "SELECT COUNT(*) FROM autopilot_plans WHERE status IN ('starting','producing')").fetchone()[0]
        except sqlite3.Error:
            pass
        finally:
            ap.close()
    main = _ro(DB_PATH)
    if main:
        try:
            data["images_pending"] = main.execute(
                "SELECT COUNT(*) FROM image_queue WHERE status IN ('pending','processing')").fetchone()[0]
            day = int(datetime.datetime.combine(datetime.date.today(), datetime.time()).timestamp())
            data["posted_today"] = main.execute(
                "SELECT COUNT(*) FROM upload_tasks WHERE status=? AND uploaded_at>=?", (us.SUCCESS, day)).fetchone()[0]
        except sqlite3.Error:
            pass
        finally:
            main.close()
    mdb = _ro(MATRIX_DB)
    if mdb:
        try:
            day = int(datetime.datetime.combine(datetime.date.today(), datetime.time()).timestamp())
            data["videos_today"] = mdb.execute(
                "SELECT COUNT(*) FROM content_jobs WHERE updated_at>=? AND state IN "
                "('READY_TO_PUBLISH','SCHEDULED','PUBLISHED','ANALYTICS_PENDING','COMPLETED')", (day,)).fetchone()[0]
        except sqlite3.Error:
            pass
        finally:
            mdb.close()
    for svc in ("antigravity-ide", "antigravity"):
        state = _service_active(svc)
        if state:
            data["agent"] = True
            break
        if state is False:
            data["agent"] = False
    return data


def _dot(level: int) -> str:
    return ("🟢", "🟡", "🔴")[max(0, min(2, level))]


def status_text(m: Optional[Dict[str, Any]] = None, title: str = "Trạng thái VPS") -> str:
    m = m or metrics()
    ratio = m["load"] / max(1, m["cpus"])
    min_free = int(_autopilot_config().get("min_free_disk_gb") or 15)
    lines = [
        f"🖥️ <b>{esc(title)}</b> · {esc(os.uname().nodename)} · {datetime.datetime.now():%H:%M %d/%m}",
        "",
        f"{_dot(0 if ratio < 1.5 else 1 if ratio < 3 else 2)} CPU: <b>{m['load']}</b> / {m['cpus']} lõi",
        f"{_dot(0 if m['mem_avail_gb'] >= 1.5 else 1 if m['mem_avail_gb'] >= 0.7 else 2)} RAM trống: "
        f"<b>{m['mem_avail_gb']} GB</b> · swap {m['swap_used_gb']} GB",
        f"{_dot(0 if m['disk_free_gb'] >= 2 * min_free else 1 if m['disk_free_gb'] >= min_free else 2)} "
        f"Đĩa trống: <b>{m['disk_free_gb']} GB</b>",
        "🟢 Web" + (f"   {'🟢' if m['agent'] else '🔴'} Agent Antigravity" if "agent" in m else ""),
    ]
    prod = [(key, label) for key, label in (
        ("batches", "Batch đang chạy"), ("render_procs", "Tiến trình render"),
        ("images_pending", "Ảnh chờ tạo"), ("videos_today", "Video xong hôm nay"),
        ("posted_today", "Đã đăng hôm nay")) if key in m]
    if prod:
        lines += ["", "🏭 <b>Sản xuất</b>"] + [f"• {label}: <b>{m[key]}</b>" for key, label in prod]
    return "\n".join(lines)


class _Overload:
    """Quá tải kéo dài: tải > 3×CPU hoặc swap > 3 GB liên tục OVERLOAD_MINUTES phút."""

    def __init__(self) -> None:
        self.samples: deque = deque()

    def feed(self, m: Dict[str, Any], now: float) -> Optional[str]:
        bad = m["load"] > 3 * m["cpus"] or m["swap_used_gb"] > 3
        self.samples.append((now, bad))
        while self.samples and now - self.samples[0][0] > OVERLOAD_MINUTES * 60 + 90:
            self.samples.popleft()
        span = now - self.samples[0][0]
        if span >= OVERLOAD_MINUTES * 60 and all(b for _, b in self.samples):
            return (f"🔥 <b>Quá tải kéo dài {OVERLOAD_MINUTES} phút</b>\n"
                    f"• CPU: <b>{m['load']}</b> / {m['cpus']} lõi\n• Swap: <b>{m['swap_used_gb']} GB</b>\n"
                    f"• Tiến trình render: <b>{m['render_procs']}</b>")
        return None


_overload = _Overload()


def check_metrics(conn, now: Optional[datetime.datetime] = None) -> int:
    now = now or datetime.datetime.now()
    emitted = 0
    need_status = now.hour in STATUS_HOURS and now.minute < 30
    slot = now.strftime("%Y%m%d%H")
    m = None
    if need_status and _state_get(conn, "status:last") != slot:
        m = metrics()
        _state_set(conn, "status:last", slot)
        conn.commit()
        emitted += emit("vps_status", status_text(m), "info", conn=conn)
    m = m or metrics()
    alert = _overload.feed(m, time.time())
    if alert:
        emitted += emit("overload", alert, "warn", "overload", conn=conn)
    return emitted


# ------------------------------------------------------------------ luồng nền

STOP = threading.Event()
_threads: List[threading.Thread] = []


def _loop(name: str, interval: float, fn) -> None:
    while not STOP.is_set():
        try:
            fn()
        except Exception:
            logger.exception("notify: %s lỗi", name)
        STOP.wait(interval)


def watch_once() -> int:
    conn = _conn()
    try:
        total = 0
        for fn in (check_jobs, check_uploads, check_hold, check_metrics):
            try:
                total += fn(conn)
            except sqlite3.Error:
                logger.exception("notify: %s lỗi", fn.__name__)
        conn.execute("DELETE FROM notify_state WHERE key LIKE 'dedupe:%' AND updated_at<?",
                     (int(time.time()) - 30 * 86400,))
        conn.commit()
        return total
    finally:
        conn.close()


def start() -> None:
    if os.environ.get("TOKMATRIX_NOTIFY", "1") == "0":
        return
    if any(t.is_alive() for t in _threads):
        return
    STOP.clear()
    _threads[:] = [
        threading.Thread(target=_loop, args=("sender", 2, flush_once), name="notify-sender", daemon=True),
        threading.Thread(target=_loop, args=("watcher", 60, watch_once), name="notify-watcher", daemon=True),
    ]
    for t in _threads:
        t.start()


def stop(timeout: float = 3) -> None:
    STOP.set()
    for t in _threads:
        t.join(timeout=timeout)


# ------------------------------------------------------------------ CLI

def _cmd_find_chat(_args) -> int:
    token = config()["token"]
    if not token:
        print("Chưa có token — chạy set-token trước.")
        return 1
    try:
        hook = _api(token, "getWebhookInfo", {})["result"].get("url")
        if hook:
            print(f"Bot đang có webhook ({urllib.parse.urlsplit(hook).netloc}) → Telegram không cho getUpdates.")
            print("Lấy chat_id cách khác (ví dụ nhắn @userinfobot) rồi chạy set-chat.")
            return 1
        updates = _api(token, "getUpdates", {"limit": 100})["result"]
    except TelegramError as exc:
        print(f"Lỗi: {exc}")
        return 1
    chats = {}
    for u in updates:
        msg = u.get("message") or u.get("channel_post") or (u.get("my_chat_member") or {})
        chat = msg.get("chat") or {}
        if chat.get("id"):
            chats[chat["id"]] = chat.get("title") or chat.get("username") or chat.get("first_name") or ""
    if not chats:
        print("Chưa thấy tin nào. Nhắn một tin cho bot (hoặc thêm bot vào group rồi nhắn) rồi chạy lại.")
        return 1
    for cid, name in chats.items():
        print(f"{cid}\t{name}")
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(prog="python3 -m bkt_web.notify")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("set-token", help="đọc token bot từ stdin, lưu vào key vault")
    p = sub.add_parser("set-chat")
    p.add_argument("chat_ids")
    sub.add_parser("find-chat")
    p = sub.add_parser("config")
    p.add_argument("--quiet", help='"0-7" hoặc "off"')
    p.add_argument("--render", choices=["each", "digest"])
    sub.add_parser("test")
    p = sub.add_parser("send")
    p.add_argument("--severity", default="warn", choices=list(SEVERITY_RANK))
    p.add_argument("text")
    sub.add_parser("status")
    sub.add_parser("vps", help="in trạng thái VPS (không gửi)")
    args = parser.parse_args(argv)

    if args.cmd == "set-token":
        token = sys.stdin.readline().strip()
        if not re.fullmatch(r"\d{6,12}:[A-Za-z0-9_-]{30,}", token):
            print("Token không đúng dạng <số>:<chuỗi>.")
            return 1
        key_vault.set_key(KEY_NAME, token)
        print("Đã lưu token vào key vault (notify.telegram).")
        return 0
    if args.cmd == "find-chat":
        return _cmd_find_chat(args)
    if args.cmd == "vps":
        print(status_text())
        return 0
    conn = _conn()
    try:
        if args.cmd == "set-chat":
            ids = ",".join(c.strip() for c in args.chat_ids.split(",") if re.fullmatch(r"-?\d+|@\w+", c.strip()))
            if not ids:
                print("chat_id không hợp lệ.")
                return 1
            _set_setting(conn, SETTING_CHATS, ids)
            conn.commit()
            print(f"Chat nhận tin: {ids}")
            return 0
        if args.cmd == "config":
            if args.quiet is not None:
                _set_setting(conn, SETTING_QUIET, "" if args.quiet == "off" else args.quiet)
            if args.render:
                _set_setting(conn, SETTING_RENDER, args.render)
            conn.commit()
            cfg = config(conn)
            print(json.dumps({"token": bool(cfg["token"]), "chats": cfg["chats"], "quiet": cfg["quiet"] or "off",
                              "render_mode": cfg["render_mode"]}, ensure_ascii=False))
            return 0
        if args.cmd == "status":
            for status, count in conn.execute("SELECT status, COUNT(*) FROM notify_outbox GROUP BY status"):
                print(f"{status}: {count}")
            for row in conn.execute("SELECT id, event, error FROM notify_outbox WHERE error!='' ORDER BY id DESC LIMIT 5"):
                print(f"#{row[0]} {row[1]}: {row[2]}")
            return 0
    finally:
        conn.close()
    try:
        if args.cmd == "test":
            send_direct("✅ <b>Kết nối Telegram OK</b>\n\n" + status_text(), "warn")
        else:
            send_direct(args.text, args.severity)
    except TelegramError as exc:
        print(f"Gửi lỗi: {exc}")
        return 1
    print("Đã gửi.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
