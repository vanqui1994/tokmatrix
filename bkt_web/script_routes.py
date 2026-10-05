"""Hàng Đợi Kịch Bản AI — sinh kịch bản video qua Antigravity IDE.

Mô phỏng y hệt image_routes.py nhưng cho kịch bản: tác nhân ngoài (Antigravity)
nhận yêu cầu → viết kịch bản → POST /complete với JSON kết quả.
Worker nội bộ KHÔNG xử lý task engine='antigravity'.

Hàng đợi dùng cùng DB bkt_channels.db nhưng bảng riêng ``script_queue``.
"""

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

try:
    from bkt_web.db_utils import connect_db
except ImportError:
    from db_utils import connect_db

script_router = APIRouter(prefix="/api/scripts", tags=["script_queue"])

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
STORAGE_DIR = BASE_DIR / "storage"
SCRIPTS_DIR = STORAGE_DIR / "generated_scripts"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

# Thể loại video hỗ trợ
VALID_VIDEO_TYPES = {
    "compare", "folklore", "mystery", "survival", "vox", "newspaper",
    "kinetic", "chalk", "tierlist", "wildlife", "science",
    "matrix",  # angle/kịch bản của AI Matrix: prompt + JSON schema nằm sẵn trong task
    "vector_rig",  # code vẽ rig vector mới cho vector_learner (prompt tự chứa quy ước + ảnh tham chiếu Muse)
}

ENGINE = "antigravity"


# --------------------------------------------------------------------------- DB


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _db():
    return connect_db(DB_PATH)


def init_script_tables() -> None:
    """Tạo bảng script_queue nếu chưa có."""
    conn = _db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS script_queue (
                id TEXT PRIMARY KEY,
                video_type TEXT NOT NULL DEFAULT 'compare',
                lang TEXT NOT NULL DEFAULT 'vi',
                prompt TEXT DEFAULT '',
                channel_config TEXT DEFAULT '{}',
                target_duration INTEGER DEFAULT 65,
                extra_params TEXT DEFAULT '{}',
                status TEXT DEFAULT 'pending',
                engine TEXT DEFAULT 'antigravity',
                worker_id TEXT DEFAULT '',
                script_json TEXT,
                script_filename TEXT,
                notes TEXT DEFAULT '',
                error_message TEXT DEFAULT '',
                attempt_count INTEGER DEFAULT 0,
                created_at TEXT,
                created_ts INTEGER DEFAULT 0,
                updated_at TEXT,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_script_queue_status
                ON script_queue(status, created_ts);
            CREATE INDEX IF NOT EXISTS idx_script_queue_engine
                ON script_queue(engine, status);
            """
        )
        # Task đang chạy dở khi tắt app -> trả về hàng đợi.
        conn.execute(
            "UPDATE script_queue SET status='pending', worker_id='' "
            "WHERE status='processing'"
        )
        conn.commit()
    finally:
        conn.close()


# ------------------------------------------------------------- pydantic models


class EnqueueScriptRequest(BaseModel):
    video_type: str = "compare"
    lang: str = "vi"
    prompt: str = ""
    channel_config: Optional[dict] = None
    target_duration: int = 65
    extra_params: Optional[dict] = None
    notes: str = ""
    batch_size: int = 1


class CompleteScriptRequest(BaseModel):
    script_json: dict
    notes: str = ""


class ClaimRequest(BaseModel):
    worker_id: str = "antigravity-ide"


# --------------------------------------------------------- helpers


def _queue_row_to_dict(r) -> Dict[str, Any]:
    return {
        "id": r[0], "video_type": r[1], "lang": r[2], "prompt": r[3],
        "channel_config": r[4], "target_duration": r[5], "extra_params": r[6],
        "status": r[7], "engine": r[8], "worker_id": r[9],
        "script_json": r[10], "script_filename": r[11], "notes": r[12],
        "error_message": r[13], "attempt_count": r[14],
        "created_at": r[15], "updated_at": r[16], "completed_at": r[17],
    }


QUEUE_COLUMNS = """id, video_type, lang, prompt, channel_config, target_duration,
                   extra_params, status, engine, worker_id, script_json,
                   script_filename, notes, error_message, attempt_count,
                   created_at, updated_at, completed_at"""


# -------------------------------------------------------------- endpoints


@script_router.post("/queue")
def enqueue_script(req: EnqueueScriptRequest):
    """Đưa yêu cầu kịch bản vào hàng đợi Antigravity."""
    vtype = req.video_type.lower().strip()
    if vtype not in VALID_VIDEO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"video_type không hợp lệ. Chấp nhận: {', '.join(sorted(VALID_VIDEO_TYPES))}",
        )
    lang = (req.lang or "vi").strip()[:5]
    batch = max(1, min(int(req.batch_size or 1), 20))

    created: List[str] = []
    conn = _db()
    try:
        for i in range(batch):
            task_id = f"script_{int(time.time())}_{uuid.uuid4().hex[:6]}"
            conn.execute(
                f"""INSERT INTO script_queue
                   (id, video_type, lang, prompt, channel_config, target_duration,
                    extra_params, status, engine, notes,
                    created_at, created_ts, updated_at)
                   VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?)""",
                (
                    task_id, vtype, lang,
                    (req.prompt or "").strip(),
                    json.dumps(req.channel_config or {}, ensure_ascii=False),
                    max(30, min(180, req.target_duration)),
                    json.dumps(req.extra_params or {}, ensure_ascii=False),
                    ENGINE,
                    req.notes or f"Đang chờ Antigravity viết kịch bản {vtype}",
                    _now_str(), int(time.time()) + i, _now_str(),
                ),
            )
            created.append(task_id)
        conn.commit()
    finally:
        conn.close()

    return {
        "success": True,
        "message": f"Đã thêm {len(created)} yêu cầu kịch bản vào Hàng Đợi Antigravity!",
        "task_ids": created,
        "engine": ENGINE,
    }


@script_router.get("/queue")
def get_script_queue(
    status: Optional[str] = Query(None),
    video_type: Optional[str] = Query(None),
    engine: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """Xem hàng đợi kịch bản."""
    conn = _db()
    try:
        sql = f"SELECT {QUEUE_COLUMNS} FROM script_queue"
        where: List[str] = []
        params: List[Any] = []
        if status:
            where.append("status=?")
            params.append(status)
        if video_type:
            where.append("video_type=?")
            params.append(video_type)
        if engine:
            where.append("engine=?")
            params.append(engine)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY created_ts DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        counts = dict(
            conn.execute(
                "SELECT status, COUNT(*) FROM script_queue GROUP BY status"
            ).fetchall()
        )
    finally:
        conn.close()

    queue = [_queue_row_to_dict(r) for r in rows]
    return {
        "success": True,
        "queue": queue,
        "total": len(queue),
        "pending_count": counts.get("pending", 0),
        "processing_count": counts.get("processing", 0),
        "completed_count": counts.get("completed", 0),
        "failed_count": counts.get("failed", 0),
    }


@script_router.get("/queue/stats")
def script_queue_stats():
    """Thống kê nhanh hàng đợi kịch bản."""
    conn = _db()
    try:
        counts = dict(
            conn.execute(
                "SELECT status, COUNT(*) FROM script_queue GROUP BY status"
            ).fetchall()
        )
        type_counts = dict(
            conn.execute(
                "SELECT video_type, COUNT(*) FROM script_queue "
                "WHERE status='pending' GROUP BY video_type"
            ).fetchall()
        )
    finally:
        conn.close()

    return {
        "success": True,
        "pending": counts.get("pending", 0),
        "processing": counts.get("processing", 0),
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
        "pending_by_type": type_counts,
    }


@script_router.post("/queue/{task_id}/claim")
def claim_script_task(task_id: str, req: ClaimRequest):
    """Agent claim một task để xử lý."""
    conn = _db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            f"SELECT {QUEUE_COLUMNS} FROM script_queue WHERE id=?",
            (task_id,),
        ).fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
        task = _queue_row_to_dict(row)
        if task["status"] not in ("pending",):
            conn.rollback()
            raise HTTPException(
                status_code=409,
                detail=f"Task đang ở trạng thái '{task['status']}', không claim được",
            )
        conn.execute(
            "UPDATE script_queue SET status='processing', worker_id=?, "
            "updated_at=? WHERE id=?",
            (req.worker_id or "antigravity-ide", _now_str(), task_id),
        )
        conn.commit()
        # Đọc lại sau update
        row = conn.execute(
            f"SELECT {QUEUE_COLUMNS} FROM script_queue WHERE id=?",
            (task_id,),
        ).fetchone()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {"success": True, "task": _queue_row_to_dict(row)}


@script_router.post("/queue/{task_id}/complete")
def complete_script_task(task_id: str, req: CompleteScriptRequest):
    """Agent nộp kịch bản hoàn thành."""
    if not req.script_json:
        raise HTTPException(status_code=400, detail="script_json là bắt buộc")

    # Lưu kịch bản ra file
    script_filename = f"{task_id}.json"
    script_path = SCRIPTS_DIR / script_filename
    tmp = script_path.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(req.script_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    tmp.replace(script_path)

    conn = _db()
    try:
        cur = conn.execute(
            """UPDATE script_queue
               SET status='completed', script_json=?, script_filename=?,
                   notes=?, completed_at=?, updated_at=?
               WHERE id=?""",
            (
                json.dumps(req.script_json, ensure_ascii=False),
                script_filename,
                req.notes or "Hoàn thành bởi Antigravity",
                _now_str(), _now_str(), task_id,
            ),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(
                status_code=404, detail="Không tìm thấy task trong hàng đợi"
            )
    finally:
        conn.close()

    return {
        "success": True,
        "message": "Đã nhận kịch bản hoàn thành",
        "script_file": str(script_path),
    }


@script_router.post("/queue/{task_id}/fail")
def fail_script_task(task_id: str, error: str = ""):
    """Đánh dấu task lỗi."""
    conn = _db()
    try:
        cur = conn.execute(
            "UPDATE script_queue SET status='failed', error_message=?, "
            "attempt_count=attempt_count+1, updated_at=? WHERE id=?",
            (error or "Lỗi không xác định", _now_str(), task_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
    finally:
        conn.close()
    return {"success": True, "message": "Đã đánh dấu task lỗi"}


@script_router.post("/queue/{task_id}/retry")
def retry_script_task(task_id: str):
    """Đưa task lỗi trở lại hàng đợi."""
    conn = _db()
    try:
        cur = conn.execute(
            "UPDATE script_queue SET status='pending', error_message='', "
            "worker_id='', updated_at=? WHERE id=? AND status='failed'",
            (_now_str(), task_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Không tìm thấy task lỗi để thử lại",
            )
    finally:
        conn.close()
    return {"success": True, "message": "Đã đưa task trở lại hàng đợi"}


@script_router.delete("/queue/{task_id}")
def delete_script_task(task_id: str):
    """Xoá task khỏi hàng đợi."""
    conn = _db()
    try:
        cur = conn.execute("DELETE FROM script_queue WHERE id=?", (task_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
    finally:
        conn.close()
    # Xoá file kịch bản nếu có
    script_path = SCRIPTS_DIR / f"{task_id}.json"
    if script_path.exists():
        script_path.unlink(missing_ok=True)
    return {"success": True, "message": "Đã xoá task khỏi hàng đợi"}


@script_router.post("/queue/clear-completed")
def clear_completed_scripts():
    """Dọn sạch task đã hoàn thành."""
    conn = _db()
    try:
        cur = conn.execute("DELETE FROM script_queue WHERE status='completed'")
        conn.commit()
        count = cur.rowcount
    finally:
        conn.close()
    return {"success": True, "message": f"Đã xoá {count} task hoàn thành"}


@script_router.get("/queue/{task_id}")
def get_script_task(task_id: str):
    """Xem chi tiết một task."""
    conn = _db()
    try:
        row = conn.execute(
            f"SELECT {QUEUE_COLUMNS} FROM script_queue WHERE id=?",
            (task_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy task")
    task = _queue_row_to_dict(row)
    # Parse JSON fields cho dễ đọc
    for field in ("channel_config", "extra_params", "script_json"):
        if task[field] and isinstance(task[field], str):
            try:
                task[field] = json.loads(task[field])
            except Exception:
                pass
    return {"success": True, "task": task}
