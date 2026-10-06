"""Lưu trữ của Autopilot: đường dẫn, kết nối DB, config, plan, topic, nhật ký chạy.

Các module khác gọi qua ``store.X`` (không ``from store import X``) để test patch
được một chỗ duy nhất.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import logging
import sqlite3
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    from bkt_web.db_utils import connect_db
except ImportError:  # chạy trực tiếp trong bkt_web/
    from db_utils import connect_db

logger = logging.getLogger("autopilot")

BKT_DIR = Path(__file__).resolve().parent.parent
ROOT = BKT_DIR.parent
COMPARE_DIR = ROOT / "compare_studio"
VIDEOS_DIR = COMPARE_DIR / "videos"
PROJECTS_DIR = COMPARE_DIR / "projects"
CHANNELS_CONFIG_DIR = COMPARE_DIR / "config" / "channels"
TOPICS_DIR = COMPARE_DIR / "config" / "topics"
DB_PATH = BKT_DIR / "bkt_channels.db"
AUTOPILOT_DB = BKT_DIR / "storage" / "autopilot.db"

EVENT_RETENTION_DAYS = 30


class Halted(Exception):
    """Cycle dừng giữa chừng vì có lệnh stop/pause."""


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS autopilot_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS autopilot_channel_map (
    matrix_channel_id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    tiktok_channel_id INTEGER NOT NULL UNIQUE,
    country TEXT DEFAULT '',
    language TEXT DEFAULT 'vi',
    assigned_at TEXT
);

CREATE TABLE IF NOT EXISTS autopilot_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_date TEXT NOT NULL,
    niche_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    language TEXT DEFAULT 'vi',
    batch_id TEXT,
    status TEXT DEFAULT 'planned',
    channel_count INTEGER DEFAULT 0,
    jobs_completed INTEGER DEFAULT 0,
    jobs_failed INTEGER DEFAULT 0,
    jobs_published INTEGER DEFAULT 0,
    error_message TEXT DEFAULT '',
    created_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    matrix_channel_id TEXT NOT NULL DEFAULT '',
    UNIQUE(plan_date, niche_id, language, matrix_channel_id)
);
CREATE INDEX IF NOT EXISTS idx_plans_date ON autopilot_plans(plan_date, status);

CREATE TABLE IF NOT EXISTS autopilot_topic_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    niche_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    topic_hash TEXT NOT NULL,
    batch_id TEXT,
    plan_date TEXT NOT NULL,
    created_at TEXT,
    UNIQUE(niche_id, topic_hash)
);
CREATE INDEX IF NOT EXISTS idx_topic_niche ON autopilot_topic_history(niche_id);

CREATE TABLE IF NOT EXISTS autopilot_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    summary_json TEXT DEFAULT '{}',
    error TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON autopilot_runs(started_at);

CREATE TABLE IF NOT EXISTS autopilot_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    ts INTEGER NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON autopilot_events(ts);
"""

# Trạng thái plan:
#   planned → starting (đã giữ batch_id, đang chạy batch-matrix) → producing
#   → completed | partial;  failed khi batch lỗi;  expired khi qua ngày mà chưa chạy.
PLAN_STATUSES = ("planned", "starting", "producing", "completed", "partial", "failed", "expired")

DEFAULT_CONFIG = {
    "enabled": "false",
    "paused": "false",
    "check_interval_seconds": "600",
    "plan_hour": "0",
    "timezone": "",
    "videos_per_day_per_channel": "6",
    "posting_hours": "[8,10,12,14,17,19]",
    "gap_between_posts_minutes": "120",
    "cleanup_enabled": "true",
    "cleanup_after_days": "2",
    "cleanup_without_backup": "false",
    "cleanup_failed_after_days": "7",
    "min_free_disk_gb": "10",
    # rclone remote lưu MP4 trước khi dọn (vd "gdrive:TokMatrix/archive"); ưu tiên hơn archive_vps_host.
    "archive_rclone_remote": "",
    "archive_vps_host": "",
    "archive_vps_dir": "/data/video-archive",
    "auto_render": "true",
    "max_concurrent_batches": "3",
    "batch_timeout_minutes": "240",
    "matrix_workers": "3",
    "topic_source": "curated",
    # Giữ đăng toàn hệ thống tới timestamp này (0 = không giữ); vẫn sản xuất video bình thường.
    "publish_hold_until": "0",
    # Acc vừa tiêm cookie phải "ngâm" đủ số giờ này mới được xếp lịch đăng (0 = tắt).
    "warmup_hours": "24",
    # Mỗi acc đăng lệch cố định 0..N phút so với khung giờ (0 = đúng HH:00).
    "slot_jitter_minutes": "45",
    # Mỗi acc ưu tiên một "giờ nhà" trong posting_hours (theo id) để bài không dồn vào khung sớm nhất.
    "spread_posting_hours": "true",
    # Video chỉ được xếp vào khung giờ cách lúc làm xong (READY_TO_PUBLISH) ít nhất ngần này giờ (0 = tắt).
    "min_lead_hours": "0",
    # Video hỏng (FAILED/DEAD_LETTER) được làm lại tối đa ngần này lần, vẫn cho đúng kênh/acc (0 = tắt).
    "max_revives": "2",
    # Thể loại (engine Matrix) ưu tiên, cách nhau dấu phẩy, vd "survival". Batch mới chọn engine này cho mọi
    # kênh có nó trong preferred_engines; plan/job của nó được chạy và làm lại trước cả thể loại hiếm.
    "priority_engines": "",
    # Thể loại tạm DỪNG, cách nhau dấu phẩy, vd "science,kinetic": không xếp lịch đăng (video giữ ở
    # READY_TO_PUBLISH), batch mới không chọn (MATRIX_BLOCKED_ENGINES), không làm lại job hỏng của nó.
    # Dùng khi TikTok đánh trùng một khuôn hình dùng chung cho nhiều acc (26/09).
    "publish_block_engines": "",
    # So trùng vân tay video với mọi video đã/đang/sắp đăng (autopilot/dupguard.py):
    # off | report (chỉ ghi dup_checks + log) | block (hoãn video có tỉ lệ khung giống ≥ ngưỡng).
    "dup_check_mode": "report",
    "dup_frames_threshold": "0.30",
    "dup_composite_threshold": "",
    # Mỗi TikTok acc một plan + topic riêng mỗi ngày (26/09: 5 acc cùng đăng về tôm tít trong 16 phút
    # → TikTok đánh trùng dù khác khuôn hình). false = kiểu cũ, 1 topic cho cả niche.
    "topic_per_channel": "true",
    # Hai acc cùng niche không nhận topic chung chủ thể (≥2 từ khoá) trong ngần này ngày.
    "topic_subject_gap_days": "3",
    # Dọn dung lượng định kỳ (autopilot/housekeeping.py), 0 = tắt từng mục.
    "housekeeping_interval_minutes": "60",
    "bridge_archive_keep_hours": "12",
    "generated_images_keep_days": "1",
    "purge_posted_after_days": "3",
    "npx_keep_versions": "2",
    "profile_blob_keep_hours": "24",
    "story_remake_work_keep_hours": "2",
    "muse_remake_purge": "1",
}
# = RENDERABLE_ENGINES của native-engine-adapter.mjs
ENGINE_IDS = ("mystery", "newspaper", "vox", "folklore", "kinetic", "science",
              "tierlist", "survival", "chalk", "wildlife", "compare", "vector")

_BOOL_KEYS = {"enabled", "paused", "cleanup_enabled", "cleanup_without_backup", "auto_render", "spread_posting_hours",
              "topic_per_channel"}
_INT_RANGES = {
    "check_interval_seconds": (60, 86400),
    "plan_hour": (0, 23),
    "videos_per_day_per_channel": (1, 50),
    "gap_between_posts_minutes": (0, 1440),
    "cleanup_after_days": (1, 365),
    "cleanup_failed_after_days": (0, 365),
    "min_free_disk_gb": (0, 10000),
    "max_concurrent_batches": (1, 10),
    "batch_timeout_minutes": (10, 1440),
    "matrix_workers": (1, 10),
    "publish_hold_until": (0, 4_102_444_800),
    "warmup_hours": (0, 720),
    "slot_jitter_minutes": (0, 59),
    "min_lead_hours": (0, 168),
    "max_revives": (0, 5),
    "housekeeping_interval_minutes": (5, 1440),
    "bridge_archive_keep_hours": (0, 720),
    "generated_images_keep_days": (0, 365),
    "purge_posted_after_days": (0, 365),
    "npx_keep_versions": (0, 10),
    "profile_blob_keep_hours": (0, 720),
    "story_remake_work_keep_hours": (0, 720),
    "muse_remake_purge": (0, 1),
    "topic_subject_gap_days": (0, 30),
}
TOPIC_SOURCES = ("curated", "file", "matrix")


def validate_config(key: str, value: str) -> str:
    """Chuẩn hoá giá trị config; ValueError nếu key lạ hoặc giá trị sai kiểu."""
    if key not in DEFAULT_CONFIG:
        raise ValueError(f"config không tồn tại: {key}")
    value = str(value).strip()
    if key in _BOOL_KEYS:
        if value.lower() not in ("true", "false"):
            raise ValueError(f"{key} phải là true/false")
        return value.lower()
    if key in _INT_RANGES:
        low, high = _INT_RANGES[key]
        try:
            number = int(value)
        except ValueError:
            raise ValueError(f"{key} phải là số nguyên") from None
        if not low <= number <= high:
            raise ValueError(f"{key} phải trong khoảng {low}–{high}")
        return str(number)
    if key == "posting_hours":
        try:
            hours = json.loads(value)
        except ValueError:
            raise ValueError("posting_hours phải là JSON, ví dụ [8,12,19]") from None
        if not isinstance(hours, list) or not hours or not all(isinstance(h, int) and 0 <= h <= 23 for h in hours):
            raise ValueError("posting_hours phải là danh sách giờ 0–23")
        return json.dumps(sorted(set(hours)))
    if key == "timezone" and value:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"timezone không hợp lệ: {value}") from None
    if key == "topic_source" and value not in TOPIC_SOURCES:
        raise ValueError(f"topic_source phải là một trong {', '.join(TOPIC_SOURCES)}")
    if key == "archive_rclone_remote" and value and (":" not in value or value.startswith(("-", ":")) or any(c in value for c in "\n\r\0")):
        raise ValueError("archive_rclone_remote phải có dạng <remote>:<thư mục>, vd gdrive:TokMatrix/archive")
    if key == "archive_vps_dir" and value and not value.startswith("/"):
        raise ValueError("archive_vps_dir phải là đường dẫn tuyệt đối")
    if key == "dup_check_mode" and value not in ("off", "report", "block"):
        raise ValueError("dup_check_mode phải là off, report hoặc block")
    if key == "dup_frames_threshold":
        try:
            number = float(value)
        except ValueError:
            raise ValueError("dup_frames_threshold phải là số 0–1") from None
        if not 0 < number <= 1:
            raise ValueError("dup_frames_threshold phải trong (0, 1]")
        return f"{number:.2f}"
    if key == "dup_composite_threshold":
        if value.strip() == "":
            return ""  # tắt: composite chỉ được ghi/báo, không tham gia verdict
        try:
            number = float(value)
        except ValueError:
            raise ValueError("dup_composite_threshold phải để trống hoặc là số 0–1") from None
        if not 0 < number <= 1:
            raise ValueError("dup_composite_threshold phải trong (0, 1]")
        return f"{number:.2f}"
    if key in ("priority_engines", "publish_block_engines"):
        engines = []
        for item in value.replace(" ", ",").split(","):
            item = item.strip().lower()
            if not item:
                continue
            if item not in ENGINE_IDS:
                raise ValueError(f"{key}: engine không có: {item} (có: {', '.join(ENGINE_IDS)})")
            if item not in engines:
                engines.append(item)
        return ",".join(engines)
    return value


# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------

def adb() -> sqlite3.Connection:
    conn = sqlite3.connect(str(AUTOPILOT_DB), timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def channels_db() -> sqlite3.Connection:
    return connect_db(DB_PATH)


def _plans_table_sql() -> str:
    """Câu CREATE TABLE autopilot_plans trong SCHEMA_SQL (một nguồn duy nhất cho cả bảng mới và migration)."""
    body = SCHEMA_SQL.split("CREATE TABLE IF NOT EXISTS autopilot_plans", 1)[1].split(";", 1)[0]
    return "CREATE TABLE autopilot_plans" + body


def _migrate_plans_per_channel(conn: sqlite3.Connection) -> None:
    """26/09: plan theo từng acc (matrix_channel_id) — UNIQUE cũ (ngày, niche, ngôn ngữ) không cho 2 plan/niche/ngày."""
    cols = [r[1] for r in conn.execute("PRAGMA table_info(autopilot_plans)")]
    if "matrix_channel_id" in cols:
        return
    old = ", ".join(cols)
    conn.executescript(f"""
        BEGIN;
        ALTER TABLE autopilot_plans RENAME TO autopilot_plans_old;
        {_plans_table_sql()};
        INSERT INTO autopilot_plans({old}) SELECT {old} FROM autopilot_plans_old;
        DROP TABLE autopilot_plans_old;
        CREATE INDEX IF NOT EXISTS idx_plans_date ON autopilot_plans(plan_date, status);
        COMMIT;
    """)


def init_db() -> None:
    AUTOPILOT_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = adb()
    try:
        conn.executescript(SCHEMA_SQL)
        _migrate_plans_per_channel(conn)
        for key, value in DEFAULT_CONFIG.items():
            conn.execute("INSERT OR IGNORE INTO autopilot_config(key, value) VALUES (?, ?)", (key, value))
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def get_config(key: str, default: str = "") -> str:
    conn = adb()
    try:
        row = conn.execute("SELECT value FROM autopilot_config WHERE key=?", (key,)).fetchone()
        return row[0] if row else (default or DEFAULT_CONFIG.get(key, ""))
    finally:
        conn.close()


def get_int(key: str) -> int:
    try:
        return int(get_config(key, DEFAULT_CONFIG[key]))
    except ValueError:
        return int(DEFAULT_CONFIG[key])


def get_publish_block_engines() -> List[str]:
    """Thể loại đang tạm dừng đăng (config publish_block_engines)."""
    return [e for e in get_config("publish_block_engines", "").split(",") if e]


def get_priority_engines() -> List[str]:
    """Danh sách engine ưu tiên theo thứ tự (config priority_engines)."""
    return [e for e in get_config("priority_engines", "").split(",") if e]


def get_bool(key: str) -> bool:
    return get_config(key, DEFAULT_CONFIG[key]).lower() == "true"


def set_config(key: str, value: str) -> str:
    value = validate_config(key, value)
    conn = adb()
    try:
        conn.execute(
            "INSERT INTO autopilot_config(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()
    return value


def get_all_config() -> Dict[str, str]:
    conn = adb()
    try:
        return dict(conn.execute("SELECT key, value FROM autopilot_config ORDER BY key").fetchall())
    finally:
        conn.close()


def plan_timezone() -> Optional[ZoneInfo]:
    name = get_config("timezone", "")
    try:
        return ZoneInfo(name) if name else None
    except (ZoneInfoNotFoundError, ValueError):
        return None


def now_local() -> datetime.datetime:
    """Giờ dùng để chia ngày lập plan: theo config ``timezone``, trống thì giờ máy chủ."""
    tz = plan_timezone()
    return datetime.datetime.now(tz) if tz else datetime.datetime.now()


def today() -> str:
    return now_local().date().isoformat()


# ---------------------------------------------------------------------------
# Topic history
# ---------------------------------------------------------------------------

def topic_hash(topic: str) -> str:
    return hashlib.sha256(topic.strip().lower().encode("utf-8")).hexdigest()[:32]


def get_topic_history(niche_id: str, limit: int = 100) -> List[str]:
    conn = adb()
    try:
        rows = conn.execute(
            "SELECT topic FROM autopilot_topic_history WHERE niche_id=? ORDER BY id DESC LIMIT ?",
            (niche_id, limit),
        ).fetchall()
        return [r[0] for r in rows]
    finally:
        conn.close()


def is_topic_used(niche_id: str, topic: str) -> bool:
    conn = adb()
    try:
        return conn.execute(
            "SELECT 1 FROM autopilot_topic_history WHERE niche_id=? AND topic_hash=?",
            (niche_id, topic_hash(topic)),
        ).fetchone() is not None
    finally:
        conn.close()


def save_topic(niche_id: str, topic: str, batch_id: str = "", plan_date: str = "") -> None:
    conn = adb()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO autopilot_topic_history"
            "(niche_id, topic, topic_hash, batch_id, plan_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (niche_id, topic, topic_hash(topic), batch_id, plan_date or today(),
             datetime.datetime.now().isoformat()),
        )
        if batch_id:
            conn.execute(
                "UPDATE autopilot_topic_history SET batch_id=? WHERE niche_id=? AND topic_hash=?",
                (batch_id, niche_id, topic_hash(topic)),
            )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------

_PLAN_KEYS = ("id", "plan_date", "niche_id", "topic", "batch_id", "status",
              "channel_count", "jobs_completed", "jobs_failed", "jobs_published",
              "error_message", "created_at", "started_at", "completed_at", "matrix_channel_id")
_PLAN_UPDATABLE = set(_PLAN_KEYS) - {"id", "plan_date", "niche_id", "created_at", "matrix_channel_id"}


def _plan_rows(where: str, params: tuple) -> List[Dict[str, Any]]:
    conn = adb()
    try:
        rows = conn.execute(f"SELECT {', '.join(_PLAN_KEYS)} FROM autopilot_plans WHERE {where}", params).fetchall()
        return [dict(zip(_PLAN_KEYS, r)) for r in rows]
    finally:
        conn.close()


def niche_last_started() -> Dict[str, str]:
    """niche_id → started_at (ISO) của batch gần nhất; niche chưa từng chạy không có trong dict."""
    conn = adb()
    try:
        rows = conn.execute(
            "SELECT niche_id, MAX(started_at) FROM autopilot_plans "
            "WHERE started_at IS NOT NULL AND started_at != '' GROUP BY niche_id"
        ).fetchall()
        return {niche: started for niche, started in rows}
    finally:
        conn.close()


def recent_plan_topics(niche_id: str, since_date: str) -> List[str]:
    """Topic của các plan niche này từ since_date (YYYY-MM-DD) trở đi."""
    conn = adb()
    try:
        return [r[0] for r in conn.execute(
            "SELECT topic FROM autopilot_plans WHERE niche_id=? AND plan_date>=?", (niche_id, since_date))]
    finally:
        conn.close()


def get_plans_for_date(plan_date: str) -> List[Dict[str, Any]]:
    return _plan_rows("plan_date=? ORDER BY niche_id", (plan_date,))


def get_plans_by_status(*statuses: str) -> List[Dict[str, Any]]:
    marks = ",".join("?" for _ in statuses)
    return _plan_rows(f"status IN ({marks}) ORDER BY id", statuses)


def get_plan(plan_id: int) -> Optional[Dict[str, Any]]:
    rows = _plan_rows("id=?", (plan_id,))
    return rows[0] if rows else None


def create_plan(plan_date: str, niche_id: str, topic: str, channel_count: int, matrix_channel_id: str = "") -> int:
    """Tạo plan (matrix_channel_id rỗng = plan cả niche kiểu cũ); sqlite3.IntegrityError nếu đã có."""
    conn = adb()
    try:
        cursor = conn.execute(
            "INSERT INTO autopilot_plans(plan_date, niche_id, topic, channel_count, status, created_at, matrix_channel_id) "
            "VALUES (?, ?, ?, ?, 'planned', ?, ?)",
            (plan_date, niche_id, topic, channel_count, datetime.datetime.now().isoformat(), matrix_channel_id),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def update_plan(plan_id: int, **fields: Any) -> None:
    unknown = set(fields) - _PLAN_UPDATABLE
    if unknown:
        raise ValueError(f"không cập nhật được cột plan: {', '.join(sorted(unknown))}")
    if not fields:
        return
    conn = adb()
    try:
        sets = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE autopilot_plans SET {sets} WHERE id=?", (*fields.values(), plan_id))
        conn.commit()
    finally:
        conn.close()


def claim_plan(plan_id: int, batch_id: str, from_statuses: tuple = ("planned",)) -> bool:
    """planned (hoặc producing khi resume) → starting, giữ batch_id. False nếu plan đã bị nhận."""
    marks = ",".join("?" for _ in from_statuses)
    conn = adb()
    try:
        cursor = conn.execute(
            "UPDATE autopilot_plans SET status='starting', batch_id=?, started_at=?, error_message='' "
            f"WHERE id=? AND status IN ({marks})",
            (batch_id, datetime.datetime.now().isoformat(), plan_id, *from_statuses),
        )
        conn.commit()
        return cursor.rowcount == 1
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Runs + events (nhật ký bền vững, UI đọc lại được sau khi restart)
# ---------------------------------------------------------------------------

_LOG_LEVELS = {"info": logging.INFO, "warn": logging.WARNING, "error": logging.ERROR}
_events_lock = threading.Lock()
_memory_events: Deque[Dict[str, Any]] = deque(maxlen=500)
_current_run = threading.local()


def start_run(trigger: str) -> int:
    conn = adb()
    try:
        cursor = conn.execute(
            "INSERT INTO autopilot_runs(trigger, started_at, status) VALUES (?, ?, 'running')",
            (trigger, int(time.time())),
        )
        conn.commit()
        run_id = cursor.lastrowid
    finally:
        conn.close()
    _current_run.id = run_id
    return run_id


def finish_run(run_id: int, status: str, summary: Dict[str, Any], error: str = "") -> None:
    conn = adb()
    try:
        conn.execute(
            "UPDATE autopilot_runs SET finished_at=?, status=?, summary_json=?, error=? WHERE id=?",
            (int(time.time()), status, json.dumps(summary, ensure_ascii=False, default=str), error[:2000], run_id),
        )
        conn.execute("DELETE FROM autopilot_events WHERE ts < ?", (int(time.time()) - EVENT_RETENTION_DAYS * 86400,))
        conn.commit()
    finally:
        conn.close()
    _current_run.id = None


def mark_interrupted_runs() -> int:
    """Run còn 'running' từ lần chạy trước (server chết giữa chừng) → 'interrupted'."""
    conn = adb()
    try:
        cursor = conn.execute(
            "UPDATE autopilot_runs SET status='interrupted', finished_at=? WHERE status='running'",
            (int(time.time()),),
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def list_runs(limit: int = 20) -> List[Dict[str, Any]]:
    conn = adb()
    try:
        rows = conn.execute(
            "SELECT id, trigger, started_at, finished_at, status, summary_json, error "
            "FROM autopilot_runs ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    finally:
        conn.close()
    result = []
    for r in rows:
        try:
            summary = json.loads(r[5] or "{}")
        except ValueError:
            summary = {}
        result.append({"id": r[0], "trigger": r[1], "started_at": r[2], "finished_at": r[3],
                       "status": r[4], "summary": summary, "error": r[6]})
    return result


def log_event(message: str, level: str = "info") -> None:
    ts = int(time.time())
    logger.log(_LOG_LEVELS.get(level, logging.INFO), message)
    event = {"ts": ts, "level": level, "message": message}
    with _events_lock:
        _memory_events.append(event)
    try:
        conn = adb()
        try:
            conn.execute(
                "INSERT INTO autopilot_events(run_id, ts, level, message) VALUES (?, ?, ?, ?)",
                (getattr(_current_run, "id", None), ts, level, message[:2000]),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        logger.exception("Không ghi được autopilot_events")


def recent_events(limit: int = 100) -> List[Dict[str, Any]]:
    """Sự kiện mới nhất, cũ → mới. Đọc DB; DB lỗi thì trả bản trong RAM."""
    try:
        conn = adb()
        try:
            rows = conn.execute(
                "SELECT ts, level, message FROM autopilot_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        finally:
            conn.close()
        return [{"ts": r[0], "level": r[1], "message": r[2]} for r in reversed(rows)]
    except sqlite3.Error:
        with _events_lock:
            return list(_memory_events)[-limit:]


def format_event(event: Dict[str, Any]) -> str:
    return f"[{time.strftime('%H:%M:%S', time.localtime(event['ts']))}] {event['message']}"
