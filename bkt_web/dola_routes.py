"""Endpoint /api/dola/* và luồng nền sinh video AI qua Dola Render Gateway.

Mỗi yêu cầu là một dòng `dola_tasks` (bkt_channels.db), nên khởi động lại server không mất
task đang chạy ở gateway. Luồng `dola-worker` (mỗi DOLA_POLL_INTERVAL_MS) đi qua các trạng thái:

  SUBMITTING → QUEUED/PROCESSING → DOWNLOADING → COMPLETED
            ↘ FAILED                ↘ TIMEOUT (quá hạn chờ; "Kiểm tra lại" để chờ tiếp)

- Tạo task đi qua pool tài khoản (dola_accounts.DolaAccountManager): 429/503/mất kết nối khoá
  mục đó và chuyển ngay sang mục kế tiếp. Hết cả pool → task ở lại SUBMITTING, chờ tới giờ mục
  sớm nhất mở lại (thường 00:00 DOLA_LIMIT_RESET_TZ) rồi tự gửi. Lỗi mạng sau khi yêu cầu đã đi
  (timeout đọc) thì FAILED, không tự gửi lại: gateway có thể đã nhận task, gửi lại tốn hai lần credit.
- Task nhớ `account_id`; poll và tải bằng đúng gateway/key đó. Gateway báo completed → +1 lượt.
- Khi poll: lỗi mạng/5xx/429 chỉ là chờ lâu hơn; 404 nghĩa là gateway không còn task.
- MP4 lưu ở storage/dola_videos/dola-<id>.mp4, hiện trong thư viện của tab Lịch Đăng TikTok
  (nguồn "dola"). Đăng vẫn qua /api/upload/create-task, nên vẫn phải chọn kênh rõ ràng.

Tắt luồng nền: TOKMATRIX_DOLA_WORKER=0.
"""

import json
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

try:
    from bkt_web import dola_accounts as da
    from bkt_web import dola_video as dv
    from bkt_web.db_utils import connect_db
except ImportError:
    import dola_accounts as da
    import dola_video as dv
    from db_utils import connect_db

logger = logging.getLogger("dola_routes")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
VIDEO_DIR = BASE_DIR / "storage" / "dola_videos"

WORKER_ENABLED = os.environ.get("TOKMATRIX_DOLA_WORKER", "1") != "0"
DOWNLOAD_MAX_ATTEMPTS = 5
MAX_BATCH = 4

ACTIVE = ("SUBMITTING", "QUEUED", "PROCESSING", "DOWNLOADING")
TERMINAL = ("COMPLETED", "FAILED", "TIMEOUT")
# Trạng thái upload_tasks còn có thể đọc file video (chưa xong hẳn).
UPLOAD_DONE = ("SUCCESS", "ERROR", "FAILED", "CANCELLED", "NEEDS_CHECK")

router = APIRouter(prefix="/api/dola", tags=["dola"])

_stop = threading.Event()
_wake = threading.Event()
_thread: Optional[threading.Thread] = None
_worker_state: Dict[str, Any] = {"last_tick": 0, "last_error": ""}

# Cho test thay transport (MockTransport), danh sách tài khoản và giờ.
CLIENT_KW: Dict[str, Any] = {}
accounts_override: Optional[List[da.DolaAccountConfig]] = None
now_fn = time.time
_managers: Dict[str, da.DolaAccountManager] = {}


def manager() -> da.DolaAccountManager:
    key = str(DB_PATH)
    mgr = _managers.get(key)
    if mgr is None:
        mgr = _managers[key] = da.DolaAccountManager(DB_PATH, now_fn=lambda: now_fn())
    mgr._accounts = accounts_override
    return mgr


def _client(account_id: str) -> dv.DolaClient:
    mgr = manager()
    acc = mgr.get(account_id) if account_id else mgr.accounts[0]
    if acc is None:
        raise dv.DolaError(f"Tài khoản Dola '{account_id}' không còn trong cấu hình; thêm lại để theo dõi task")
    return mgr.client_for(acc, **CLIENT_KW)


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def _conn():
    conn = connect_db(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_tables() -> None:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    conn = _conn()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dola_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                remote_id TEXT DEFAULT '',
                prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                duration INTEGER NOT NULL,
                ratio TEXT DEFAULT '',
                reference_images TEXT DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'SUBMITTING',
                remote_status TEXT DEFAULT '',
                error TEXT DEFAULT '',
                video_url TEXT DEFAULT '',
                local_path TEXT DEFAULT '',
                attempts INTEGER DEFAULT 0,
                next_attempt_at REAL DEFAULT 0,
                deadline_at REAL DEFAULT 0,
                created_at REAL NOT NULL,
                submitted_at REAL DEFAULT 0,
                updated_at REAL DEFAULT 0,
                finished_at REAL DEFAULT 0
            )""")
        cols = {r[1] for r in conn.execute("PRAGMA table_info(dola_tasks)")}
        if "account_id" not in cols:
            conn.execute("ALTER TABLE dola_tasks ADD COLUMN account_id TEXT DEFAULT ''")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dola_tasks_status ON dola_tasks(status)")
        conn.commit()
    finally:
        conn.close()


def _update(task_id: int, expect: Optional[str] = None, **fields) -> bool:
    """Ghi trường cho task; `expect` = chỉ ghi nếu status vẫn là giá trị đó (tránh đè thao tác tay)."""
    fields["updated_at"] = now_fn()
    cols = ", ".join(f"{k}=?" for k in fields)
    sql = f"UPDATE dola_tasks SET {cols} WHERE id=?"
    args = list(fields.values()) + [task_id]
    if expect:
        sql += " AND status=?"
        args.append(expect)
    conn = _conn()
    try:
        changed = conn.execute(sql, args).rowcount
        conn.commit()
        return changed > 0
    finally:
        conn.close()


def _row(task_id: int) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        row = conn.execute("SELECT * FROM dola_tasks WHERE id=?", (task_id,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


def _public(row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    out["reference_images"] = json.loads(row.get("reference_images") or "[]")
    path = Path(row["local_path"]) if row.get("local_path") else None
    out["file_url"] = f"/storage/dola_videos/{path.name}" if path and path.is_file() else ""
    out["file_mb"] = round(path.stat().st_size / 1e6, 1) if out["file_url"] else 0
    return out


def _request_of(row: Dict[str, Any]) -> dv.VideoRequest:
    return dv.VideoRequest(prompt=row["prompt"], model=row["model"], duration=row["duration"],
                           ratio=row["ratio"] or None,
                           reference_images=json.loads(row["reference_images"] or "[]"))


def _timeout_for(req: dv.VideoRequest) -> float:
    env = os.environ.get("DOLA_TIMEOUT_SECONDS")
    return float(env) if env and dv._env_float("DOLA_TIMEOUT_SECONDS", 0) > 0 else req.default_timeout()


def _notify(text: str, severity: str, key: str) -> None:
    try:
        try:
            from bkt_web import notify
        except ImportError:
            import notify
        notify.emit("dola_video", text, severity=severity, dedupe_key=key, cooldown=None)
    except Exception as exc:
        logger.debug("notify lỗi: %s", exc)


def _finish_failed(row: Dict[str, Any], error: str, status: str = "FAILED", expect: Optional[str] = None) -> None:
    if _update(row["id"], expect=expect or row["status"], status=status, error=error[:1000],
               finished_at=now_fn()):
        logger.warning("Dola #%s %s: %s", row["id"], status, error)
        _notify(f"🎬 Video Dola #{row['id']} {status}: {error[:300]}", "warning", f"dola:{row['id']}:{status}")


# ---------------------------------------------------------------------------
# Luồng nền
# ---------------------------------------------------------------------------

def _backoff(attempts: int, retry_after: float = 0) -> float:
    return retry_after or min(1800.0, 60.0 * 2 ** min(attempts, 5))


def _submit(row: Dict[str, Any]) -> None:
    now = now_fn()
    try:
        req = _request_of(row)
    except Exception as exc:
        _finish_failed(row, f"Tham số không hợp lệ: {exc}")
        return
    try:
        account, task = manager().submit(req, CLIENT_KW)
    except da.AllAccountsExhausted as exc:
        # Hoãn tới khi mục sớm nhất mở lại; không bao giờ tự đánh FAILED vì hết lượt.
        _update(row["id"], expect="SUBMITTING", attempts=row["attempts"] + 1,
                next_attempt_at=max(exc.reset_at, now + 30), error=str(exc)[:1000])
        return
    except httpx.TransportError as exc:
        _finish_failed(row, "Mất kết nối sau khi đã gửi yêu cầu; gateway có thể đã nhận task. "
                            f"Kiểm tra trang quản trị gateway trước khi tạo lại. ({exc})")
        return
    except dv.DolaError as exc:
        _finish_failed(row, str(exc))
        return
    _update(row["id"], expect="SUBMITTING", remote_id=task.id, account_id=account.id, status="QUEUED",
            remote_status=task.status, submitted_at=now, deadline_at=now + _timeout_for(req), attempts=0,
            next_attempt_at=0, error="")
    logger.info("Dola #%s → %s (tài khoản %s)", row["id"], task.id, account.id)


def _poll(client: dv.DolaClient, row: Dict[str, Any]) -> None:
    now = now_fn()
    try:
        task = client.get_task_status(row["remote_id"])
    except (httpx.TransportError, dv.DolaQuotaError, dv.DolaUnavailable) as exc:
        task, err = None, str(exc)
    except dv.DolaError as exc:
        if exc.status_code >= 500:
            task, err = None, str(exc)
        elif exc.status_code == 404:
            _finish_failed(row, f"Gateway không còn task {row['remote_id']} (404)")
            return
        else:
            _finish_failed(row, str(exc))
            return
    if task is None:
        wait = _backoff(row["attempts"]) / 4
        _update(row["id"], expect=row["status"], attempts=row["attempts"] + 1, next_attempt_at=now + wait,
                error=f"Poll lỗi tạm: {err}"[:1000])
    elif task.status == "completed":
        if not task.video_url:
            _finish_failed(row, "Gateway báo completed nhưng không có video_url")
            return
        if not _update(row["id"], expect=row["status"], status="DOWNLOADING", remote_status="completed",
                       video_url=task.video_url, attempts=0, next_attempt_at=0, error=""):
            return
        # Gateway đã render xong = đã tiêu một lượt của tài khoản này (kể cả khi tải về lỗi).
        if row.get("account_id"):
            manager().record_success(row["account_id"])
        row = _row(row["id"])
        if row:
            _download(client, row)
        return
    elif task.status == "failed":
        _finish_failed(row, f"Gateway: {task.error or 'task failed'}")
        return
    else:
        new = "PROCESSING" if task.status == "processing" else "QUEUED"
        _update(row["id"], expect=row["status"], status=new, remote_status=task.status, attempts=0,
                next_attempt_at=0, error="")
        row = dict(row, status=new)
    if row["deadline_at"] and now > row["deadline_at"]:
        _finish_failed(row, f"Quá {(row['deadline_at'] - row['submitted_at']):.0f} s chưa xong "
                            "(task vẫn có thể chạy ở gateway; bấm Kiểm tra lại)", status="TIMEOUT",
                       expect=row["status"])


def _download(client: dv.DolaClient, row: Dict[str, Any]) -> None:
    dest = VIDEO_DIR / f"dola-{row['id']}.mp4"
    try:
        client.download_video(row["video_url"], dest, retries=1)
    except Exception as exc:
        attempts = row["attempts"] + 1
        if attempts >= DOWNLOAD_MAX_ATTEMPTS:
            _finish_failed(row, f"Tải video lỗi {attempts} lần: {exc}", expect="DOWNLOADING")
        else:
            _update(row["id"], expect="DOWNLOADING", attempts=attempts,
                    next_attempt_at=now_fn() + 30 * attempts, error=f"Tải lỗi, thử lại: {exc}"[:1000])
        return
    if _update(row["id"], expect="DOWNLOADING", status="COMPLETED", local_path=str(dest), error="",
               finished_at=now_fn()):
        mb = dest.stat().st_size / 1e6
        logger.info("Dola #%s xong: %s (%.1f MB)", row["id"], dest, mb)
        _notify(f"🎬 Video Dola #{row['id']} xong ({row['duration']} s, {mb:.1f} MB): {row['prompt'][:120]}",
                "info", f"dola:{row['id']}:done")


def tick() -> int:
    """Xử lý mọi task đến hạn một lượt. Trả số task đã đụng tới."""
    now = now_fn()
    conn = _conn()
    try:
        rows = [dict(r) for r in conn.execute(
            f"SELECT * FROM dola_tasks WHERE status IN ({','.join('?' * len(ACTIVE))}) "
            "AND next_attempt_at <= ? ORDER BY id", (*ACTIVE, now))]
    finally:
        conn.close()
    if not rows:
        return 0
    for row in rows:
        if _stop.is_set():
            break
        try:
            if row["status"] == "SUBMITTING":
                _submit(row)
                continue
            try:
                client = _client(row.get("account_id") or "")
            except dv.DolaError as exc:
                _finish_failed(row, str(exc))
                continue
            with client:
                if row["status"] == "DOWNLOADING":
                    _download(client, row)
                else:
                    _poll(client, row)
        except Exception as exc:  # một task lỗi lạ không được làm chết luồng
            logger.exception("Dola #%s lỗi không lường trước", row["id"])
            _update(row["id"], next_attempt_at=now_fn() + 60, error=f"Lỗi nội bộ: {exc}"[:1000])
    return len(rows)


def _loop() -> None:
    while not _stop.is_set():
        try:
            tick()
            _worker_state.update(last_tick=now_fn(), last_error="")
        except Exception as exc:
            _worker_state["last_error"] = str(exc)
            logger.exception("dola-worker lỗi")
        interval = max(1.0, dv._env_float("DOLA_POLL_INTERVAL_MS", 5000) / 1000)
        _wake.wait(interval)
        _wake.clear()


def start_worker() -> None:
    global _thread
    init_tables()
    if not WORKER_ENABLED or (_thread and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="dola-worker", daemon=True)
    _thread.start()


def stop_worker() -> None:
    _stop.set()
    _wake.set()


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def allowed_durations() -> List[int]:
    """Thời lượng thật sự chọn được. Gateway nhận 10/15/30, nhưng giao diện Dola (10/2026) chỉ còn 5s/10s:
    xin 15/30 thì gateway lặng lẽ làm 10 s. Mặc định chỉ 10; mở thêm bằng DOLA_ALLOWED_DURATIONS=10,15."""
    raw = os.environ.get("DOLA_ALLOWED_DURATIONS", "10,15,30")
    vals = [int(x) for x in raw.split(",") if x.strip().isdigit() and int(x) in dv.DURATIONS]
    return vals or [10, 15, 30]


class CreateItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1, max_length=4000)
    model: str = ""
    duration: int = 10
    ratio: str = "9:16"
    reference_images: List[str] = Field(default_factory=list)
    count: int = Field(default=1, ge=1, le=MAX_BATCH)
    humanize: bool = False


class HumanizeIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


@router.post("/humanize-prompt")
def humanize_prompt_endpoint(item: HumanizeIn):
    return {"prompt": item.prompt, "humanized": dv.humanize_dola_prompt(item.prompt)}


def _health(base_url: str, key: str) -> Dict[str, Any]:
    try:
        with dv.DolaClient(base_url=base_url, api_key=key, **CLIENT_KW) as c:
            return {"online": True, **c.health()}
    except Exception as exc:
        return {"online": False, "error": str(exc)[:300]}


@router.get("/status")
def status():
    try:
        mgr = manager()
        accounts = [a.model_dump() for a in mgr.status()]
        config_error = ""
    except Exception as exc:   # JSON tài khoản sai: báo rõ, không làm hỏng cả tab
        mgr, accounts, config_error = None, [], f"Cấu hình tài khoản Dola lỗi: {exc}"
    gateways: Dict[str, Dict[str, Any]] = {}
    if mgr:
        from concurrent.futures import ThreadPoolExecutor
        targets = {}
        for acc in mgr.accounts:
            targets.setdefault(acc.resolved_base_url(), acc.resolved_key())
        with ThreadPoolExecutor(max_workers=max(1, min(8, len(targets)))) as pool:
            gateways = dict(zip(targets, pool.map(lambda kv: _health(*kv), targets.items())))
        for acc in accounts:
            acc["gateway_online"] = gateways.get(acc["base_url"], {}).get("online", False)
    conn = _conn()
    try:
        counts = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) AS n FROM dola_tasks GROUP BY status")}
    finally:
        conn.close()
    first = next(iter(gateways.values()), {"online": False, "error": config_error})
    return {
        "base_url": next(iter(gateways), ""),
        "has_key": any(a["has_key"] for a in accounts),
        "default_model": os.environ.get("DOLA_DEFAULT_MODEL", "seedance-2.0"),
        "models": list(dv.MODELS), "durations": allowed_durations(), "ratios": list(dv.RATIOS),
        "max_reference_images": dv.MAX_REFERENCE_IMAGES, "max_batch": MAX_BATCH,
        "gateway": dict(first, online=any(g.get("online") for g in gateways.values())),
        "gateways": gateways, "accounts": accounts, "config_error": config_error,
        "reset_tz": str(mgr.tz) if mgr else "", "next_reset": mgr.next_reset() if mgr else 0,
        "counts": counts,
        "worker": {"enabled": WORKER_ENABLED, "running": bool(_thread and _thread.is_alive()), **_worker_state},
    }


@router.get("/accounts")
def list_accounts():
    mgr = manager()
    return {"accounts": [a.model_dump() for a in mgr.status()], "reset_tz": str(mgr.tz),
            "next_reset": mgr.next_reset()}


@router.post("/accounts/{account_id}/unblock")
def unblock_account(account_id: str):
    """Gỡ khoá một mục (ví dụ vừa nạp thêm credit). Không xoá số video đã dùng hôm nay."""
    mgr = manager()
    if not mgr.get(account_id):
        raise HTTPException(404, "Không có tài khoản này trong cấu hình")
    mgr.unblock(account_id)
    _wake.set()
    return {"accounts": [a.model_dump() for a in mgr.status()]}


@router.get("/tasks")
def list_tasks(limit: int = 100, status: str = ""):
    limit = max(1, min(limit, 500))
    conn = _conn()
    try:
        if status:
            rows = conn.execute("SELECT * FROM dola_tasks WHERE status=? ORDER BY id DESC LIMIT ?",
                                (status.upper(), limit)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM dola_tasks ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    finally:
        conn.close()
    return {"tasks": [_public(dict(r)) for r in rows]}


@router.get("/tasks/{task_id}")
def get_task(task_id: int):
    row = _row(task_id)
    if not row:
        raise HTTPException(404, "Không có task")
    return _public(row)


@router.post("/tasks")
def create_tasks(item: CreateItem):
    if item.duration not in allowed_durations():
        raise HTTPException(422, f"Dola hiện chỉ tạo được {allowed_durations()} giây; "
                                 f"{item.duration} s sẽ bị gateway làm thành 10 s")
    prompt = dv.humanize_dola_prompt(item.prompt.strip()) if item.humanize else item.prompt.strip()
    model = item.model
    if item.duration == 30:
        model = "seedance-2.5"
    elif item.duration in (10, 15):
        model = "seedance-2.0"
    try:
        req = dv.VideoRequest(prompt=prompt, model=model, duration=item.duration,
                              ratio=item.ratio, reference_images=[u.strip() for u in item.reference_images if u.strip()],
                              humanize=item.humanize)
    except Exception as exc:
        raise HTTPException(422, str(exc))
    init_tables()
    now = now_fn()
    conn = _conn()
    try:
        ids = []
        for _ in range(item.count):
            cur = conn.execute(
                "INSERT INTO dola_tasks(prompt, model, duration, ratio, reference_images, status, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, 'SUBMITTING', ?, ?)",
                (req.prompt, req.model, req.duration, req.ratio or "", json.dumps(req.reference_images), now, now))
            ids.append(cur.lastrowid)
        conn.commit()
    finally:
        conn.close()
    _wake.set()
    return {"ids": ids, "tasks": [_public(_row(i)) for i in ids]}


@router.post("/tasks/{task_id}/recheck")
def recheck(task_id: int):
    """TIMEOUT, hoặc FAILED khi đã có video_url (tải lỗi): hỏi lại gateway / tải lại, không tạo task mới."""
    row = _row(task_id)
    if not row:
        raise HTTPException(404, "Không có task")
    if row["status"] == "TIMEOUT" or (row["status"] == "FAILED" and row["remote_id"] and row["video_url"]):
        new = "DOWNLOADING" if row["video_url"] else "PROCESSING"
        extra = _timeout_for(_request_of(row))
        _update(task_id, expect=row["status"], status=new, attempts=0, next_attempt_at=0, error="",
                finished_at=0, deadline_at=now_fn() + extra)
        _wake.set()
        return _public(_row(task_id))
    raise HTTPException(409, "Chỉ kiểm tra lại được task TIMEOUT hoặc task đã xong ở gateway nhưng tải lỗi")


@router.post("/tasks/{task_id}/retry")
def retry(task_id: int):
    """Tạo task MỚI cùng tham số (tốn credit lần nữa). Task cũ giữ nguyên để đối chiếu."""
    row = _row(task_id)
    if not row:
        raise HTTPException(404, "Không có task")
    if row["status"] not in ("FAILED", "TIMEOUT"):
        raise HTTPException(409, "Chỉ tạo lại task FAILED hoặc TIMEOUT")
    return create_tasks(CreateItem(prompt=row["prompt"], model=row["model"], duration=row["duration"],
                                   ratio=row["ratio"] or "9:16",
                                   reference_images=json.loads(row["reference_images"] or "[]")))


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    row = _row(task_id)
    if not row:
        raise HTTPException(404, "Không có task")
    if row["status"] not in TERMINAL:
        raise HTTPException(409, "Task còn đang chạy ở gateway; chờ xong hoặc hết hạn rồi mới xoá")
    path = row["local_path"]
    conn = _conn()
    try:
        if path:
            try:
                pending = conn.execute(
                    f"SELECT COUNT(*) FROM upload_tasks WHERE video_path=? AND status NOT IN "
                    f"({','.join('?' * len(UPLOAD_DONE))})", (path, *UPLOAD_DONE)).fetchone()[0]
            except Exception:
                pending = 0
            if pending:
                raise HTTPException(409, f"Video đang nằm trong {pending} lịch đăng TikTok chưa xong")
        conn.execute("DELETE FROM dola_tasks WHERE id=?", (task_id,))
        conn.commit()
    finally:
        conn.close()
    if path:
        Path(path).unlink(missing_ok=True)
    return {"deleted": task_id}


def library_videos(limit: int = 50) -> List[Dict[str, Any]]:
    """Video Dola đã tải xong, theo định dạng của /api/upload/library-videos."""
    try:
        conn = _conn()
        try:
            rows = conn.execute("SELECT * FROM dola_tasks WHERE status='COMPLETED' ORDER BY id DESC LIMIT ?",
                                (limit,)).fetchall()
        finally:
            conn.close()
    except Exception:
        return []
    out = []
    for r in rows:
        path = Path(r["local_path"] or "")
        if not path.is_file():
            continue
        out.append({
            "id": f"dola:{r['id']}", "source": "dola", "slug": f"dola-{r['id']}",
            "title": r["prompt"][:90], "hashtags": "#fyp #viral",
            "video_path": str(path), "stream_url": f"/storage/dola_videos/{path.name}",
            "thumbnail_url": None, "created_at": int(r["finished_at"] or r["created_at"]),
        })
    return out
