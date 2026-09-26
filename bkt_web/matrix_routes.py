"""HTTP boundary for the Matrix factory workstation.

The route deliberately does not choose TikTok accounts.  A Matrix channel is
editorial DNA, whereas a publish channel is a credentialed TikTok account and
must be supplied explicitly at scheduling time.
"""
from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from bkt_web import matrix_db, publish_flow
from bkt_web import matrix_analytics

ROOT = Path(__file__).resolve().parent.parent
COMPARE = ROOT / "compare_studio"
router = APIRouter(prefix="/api/matrix", tags=["matrix"])
_runs: Dict[str, Dict[str, Any]] = {}
_runs_lock = threading.Lock()


class BatchCreate(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    niche_id: str = Field(pattern=r"^[a-z0-9_]+$")
    channel_count: int = Field(default=10, ge=1, le=10)
    channel_ids: Optional[List[str]] = None
    auto_render: bool = False


class PublishAssignment(BaseModel):
    job_id: str
    channel_id: int
    schedule_ts: Optional[int] = None
    confirm_nearby: bool = False


class PublishSchedule(BaseModel):
    assignments: List[PublishAssignment] = Field(min_length=1, max_length=10)


class MetricsIngest(BaseModel):
    content_id: str = Field(min_length=1)
    provider: str = Field(min_length=1, max_length=80)
    metrics: Dict[str, float]
    available_metrics: Optional[List[str]] = None
    captured_at: Optional[int] = None
    snapshot_id: Optional[str] = None


def _node(args: List[str]) -> Dict[str, Any]:
    """Run the existing CLI only; no second implementation of the pipeline."""
    result = subprocess.run(
        ["node", "tools/batch-matrix.mjs", *args], cwd=COMPARE, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20 * 60,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout or "Matrix worker failed").strip()[-4000:])
    # CLI logs before a pretty-printed final JSON summary.
    for index, char in enumerate(result.stdout):
        if char != "{":
            continue
        try:
            return json.loads(result.stdout[index:])
        except json.JSONDecodeError:
            pass
    return {"output": result.stdout[-4000:]}


def _start(batch_id: str, args: List[str]) -> None:
    def work() -> None:
        try:
            outcome = _node(args)
            state = "DONE"
            error = ""
        except Exception as exc:  # retain error for monitor; DB remains source of truth
            outcome, state, error = {}, "ERROR", str(exc)
        with _runs_lock:
            _runs[batch_id] = {"state": state, "error": error, "outcome": outcome}
    with _runs_lock:
        _runs[batch_id] = {"state": "RUNNING", "error": "", "outcome": {}}
    threading.Thread(target=work, name=f"matrix-{batch_id}", daemon=True).start()


@router.get("/niches/{niche_id}/channels")
def niche_channels(niche_id: str):
    """Return detailed channel configs for a niche, including engine scores."""
    try:
        import yaml
        matrix_data = yaml.safe_load((COMPARE / "config" / "compatibility_matrix.yaml").read_text(encoding="utf-8")) or {}
        niche_meta = next((n for n in matrix_data.get("niches", []) if n["id"] == niche_id), None)
        if not niche_meta:
            raise HTTPException(404, f"Niche '{niche_id}' không tồn tại")
        scores = niche_meta.get("scores", {})
        minimum_score = matrix_data.get("minimum_score", 0.55)
        channels_dir = COMPARE / "config" / "channels"
        channels = []
        for file in sorted(channels_dir.glob("*.yaml")):
            cfg = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
            if cfg.get("niche_id") != niche_id:
                continue
            preferred_engines = cfg.get("creative", {}).get("preferred_engines", [])
            engine_scores = []
            for idx, eng_id in enumerate(preferred_engines):
                s = scores.get(eng_id, 0)
                engine_scores.append({"id": eng_id, "score": s, "preferred_rank": idx})
            # Pick best engine (same logic as template-selector.mjs)
            best_engine = None
            if engine_scores:
                ranked = sorted(engine_scores, key=lambda e: (e["preferred_rank"], -e["score"], e["id"]))
                best_engine = ranked[0]
            channels.append({
                "channel_id": cfg.get("channel_id"),
                "name": cfg.get("name"),
                "niche_id": niche_id,
                "persona_tone": cfg.get("persona", {}).get("tone"),
                "voice_id": cfg.get("audio", {}).get("voice_id"),
                "visual_style_id": cfg.get("creative", {}).get("visual_style_id"),
                "preferred_engines": preferred_engines,
                "engine_scores": engine_scores,
                "best_engine": best_engine,
                "config_version": cfg.get("config_version"),
            })
        return {
            "niche_id": niche_id,
            "niche_name": niche_meta.get("name"),
            "minimum_score": minimum_score,
            "all_scores": scores,
            "channels": channels,
            "selection_rules": [
                "Kênh được sắp xếp theo thứ tự channel_id (A→Z)",
                f"Engine được chọn ưu tiên theo preferred_engines, sau đó theo điểm tương thích (min {minimum_score})",
                "Mỗi kênh có Channel DNA riêng: giọng nói, phong cách hình ảnh, nhịp cắt, persona",
                "Tối đa 10 kênh/mẻ — chọn ít hơn để tập trung chất lượng",
            ],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Không thể tải channel configs: {exc}") from exc


@router.post("/batch/create", status_code=201)
def create_batch(payload: BatchCreate):
    matrix_db.init_db()
    # Creation is quick and establishes an id we can immediately monitor.  The
    # worker is then started in the background to avoid holding an HTTP request.
    batch_id = f"ui-{__import__('uuid').uuid4().hex[:16]}"
    effective_count = len(payload.channel_ids) if payload.channel_ids else payload.channel_count
    args = ["--topic", payload.topic, "--niche", payload.niche_id, "--channels", str(effective_count), "--batch-id", batch_id]
    if payload.channel_ids:
        args += ["--channel-ids", ",".join(payload.channel_ids)]
    _start(batch_id, args + (["--render", "--approve-render"] if payload.auto_render else []))
    return {"batch_id": batch_id, "worker_state": "RUNNING", "render_requested": payload.auto_render}


@router.get("/batch/{batch_id}")
def batch_status(batch_id: str):
    matrix_db.init_db()
    batch = matrix_db.get_batch(batch_id)
    with _runs_lock:
        run = dict(_runs.get(batch_id, {}))
    if not batch and not run:
        raise HTTPException(404, "Không tìm thấy Matrix batch")
    jobs = matrix_db.list_batch_jobs(batch_id) if batch else []
    return {"batch": batch, "jobs": jobs, "worker": run or {"state": "IDLE"}}


@router.get("/jobs/active")
def active_jobs():
    matrix_db.init_db()
    # The DB API intentionally exposes batches/jobs rather than an unsafe raw SQL endpoint.
    return {"runs": [{"batch_id": key, **value} for key, value in _runs.items() if value.get("state") == "RUNNING"]}


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str):
    matrix_db.init_db()
    job = matrix_db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Không tìm thấy job")
    _start(job["batch_id"], ["--resume", job["batch_id"], "--render", "--approve-render"])
    return {"job_id": job_id, "batch_id": job["batch_id"], "worker_state": "RUNNING"}


@router.get("/channels")
def matrix_channels():
    matrix_db.init_db()
    # Configuration sync is performed by batch creation; return active snapshots only.
    import sqlite3
    conn = sqlite3.connect(matrix_db.DB_PATH)
    try:
        rows = conn.execute("SELECT channel_id,niche_id,channel_name,tiktok_account_id,status,config_version FROM channels ORDER BY niche_id,channel_id").fetchall()
        return {"channels": [dict(zip(("channel_id", "niche_id", "channel_name", "tiktok_account_id", "status", "config_version"), row)) for row in rows]}
    finally:
        conn.close()


@router.get("/niches")
def matrix_niches():
    """Catalog is sourced from versioned YAML, not a UI-only hard-coded list."""
    try:
        import yaml
        matrix = yaml.safe_load((COMPARE / "config" / "compatibility_matrix.yaml").read_text(encoding="utf-8")) or {}
        files = list((COMPARE / "config" / "channels").glob("*.yaml"))
        channel_counts: Dict[str, int] = {}
        for file in files:
            item = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
            niche_id = item.get("niche_id")
            if niche_id:
                channel_counts[niche_id] = channel_counts.get(niche_id, 0) + 1
        return {"niches": [{"id": item["id"], "name": item["name"], "channel_count": channel_counts.get(item["id"], 0)} for item in matrix.get("niches", [])]}
    except Exception as exc:
        raise HTTPException(500, f"Không thể tải Matrix niche catalog: {exc}") from exc


@router.post("/batch/{batch_id}/schedule")
def schedule_batch(batch_id: str, payload: PublishSchedule):
    matrix_db.init_db()
    jobs = {job["job_id"]: job for job in matrix_db.list_batch_jobs(batch_id)}
    if not jobs:
        raise HTTPException(404, "Không tìm thấy Matrix batch")
    if len({item.job_id for item in payload.assignments}) != len(payload.assignments):
        raise HTTPException(400, "Mỗi Matrix job chỉ được xếp lịch một lần trong một yêu cầu")
    scheduled = []
    for item in payload.assignments:
        job = jobs.get(item.job_id)
        if not job:
            raise HTTPException(400, f"Job {item.job_id} không thuộc batch")
        if job["state"] != "READY_TO_PUBLISH":
            raise HTTPException(409, f"Job {item.job_id} chưa sẵn sàng để đăng ({job['state']})")
        try:
            queued = publish_flow.enqueue_upload(
                job["video_slug"], item.channel_id, "", "", schedule_ts=item.schedule_ts,
                ai_generated=True, run_id=batch_id, confirm_nearby=item.confirm_nearby,
            )
            matrix_db.transition_job(job_id=job["job_id"], expected_state="READY_TO_PUBLISH", to_state="SCHEDULED")
            scheduled.append({"job_id": job["job_id"], "upload_task": queued})
        except publish_flow.PublishError as exc:
            raise HTTPException(exc.status, detail={"message": exc.message, **exc.extra}) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
    return {"batch_id": batch_id, "scheduled": scheduled}


@router.post("/analytics/ingest", status_code=201)
def ingest_analytics(payload: MetricsIngest):
    try:
        return matrix_analytics.ingest_metrics(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/analytics/strategy/{niche_id}")
def analytics_strategy(niche_id: str, cutoff: Optional[int] = None):
    return matrix_analytics.replay_strategy(niche_id=niche_id, cutoff=cutoff)


@router.post("/analytics/strategy/{niche_id}", status_code=201)
def version_analytics_strategy(niche_id: str, cutoff: Optional[int] = None):
    return matrix_analytics.create_strategy_version(niche_id=niche_id, cutoff=cutoff)
