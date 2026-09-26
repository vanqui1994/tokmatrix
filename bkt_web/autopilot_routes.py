"""HTTP API cho Autopilot Engine.

Endpoints điều khiển bật/tắt/tạm dừng, cấu hình, mapping channels, xem plan,
lịch sử chạy và logs. Thao tác nặng chạy độc quyền với cycle; đang bận → 409.
"""
from __future__ import annotations

import sqlite3
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from bkt_web import autopilot
from bkt_web.autopilot import channels, cycle, planner, publisher, store

router = APIRouter(prefix="/api/autopilot", tags=["autopilot"])


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class ConfigUpdate(BaseModel):
    key: Optional[str] = Field(default=None, max_length=100)
    value: str = Field(max_length=2000)


class BulkConfigUpdate(BaseModel):
    config: Dict[str, str]


class ChannelMapping(BaseModel):
    matrix_channel_id: str
    niche_id: str
    tiktok_channel_id: int


class ManualPlanItem(BaseModel):
    niche_id: str
    topic: str = Field(min_length=3, max_length=500)


def _exclusive(fn: Callable[[Callable[[], bool]], Any], trigger: str) -> Dict[str, Any]:
    try:
        return autopilot.ENGINE.run_exclusive(fn, trigger)
    except autopilot.Busy as exc:
        raise HTTPException(409, str(exc))


# ---------------------------------------------------------------------------
# Control
# ---------------------------------------------------------------------------

@router.post("/start")
def api_start():
    """Bật autopilot (enabled=true, bỏ tạm dừng, khởi động daemon)."""
    store.set_config("enabled", "true")
    if store.get_bool("paused"):
        autopilot.resume_autopilot()
    if not autopilot.start_autopilot():
        raise HTTPException(409, "Daemon cũ vẫn đang dừng dở, thử lại sau ít giây")
    return {"success": True, "message": "Autopilot đã bật", "status": autopilot.engine_snapshot()}


@router.post("/stop")
def api_stop():
    """Tắt autopilot: enabled=false và dừng daemon (bước đang chạy tự thoát)."""
    store.set_config("enabled", "false")
    stopped = autopilot.stop_autopilot()
    return {
        "success": True,
        "stopped": stopped,
        "message": "Autopilot đã tắt" if stopped else "Đang dừng — bước hiện tại sẽ thoát ở điểm an toàn",
        "status": autopilot.engine_snapshot(),
    }


@router.post("/pause")
def api_pause():
    """Tạm dừng: daemon vẫn sống nhưng không chạy cycle; giữ qua restart."""
    autopilot.pause_autopilot()
    return {"success": True, "status": autopilot.engine_snapshot()}


@router.post("/resume")
def api_resume():
    autopilot.resume_autopilot()
    return {"success": True, "status": autopilot.engine_snapshot()}


@router.get("/status")
def api_status():
    return autopilot.get_status()


@router.post("/run-now", status_code=202)
def api_run_now():
    """Chạy 1 cycle ngay ở nền; theo dõi qua /status và /runs."""
    try:
        autopilot.ENGINE.run_cycle_in_background("manual")
    except autopilot.Busy as exc:
        raise HTTPException(409, str(exc))
    return {"success": True, "message": "Đã bắt đầu cycle", "status": autopilot.engine_snapshot()}


@router.get("/runs")
def api_runs(limit: int = 20):
    return {"runs": store.list_runs(max(1, min(limit, 200)))}


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@router.get("/config")
def api_get_config():
    return {"config": store.get_all_config(), "defaults": store.DEFAULT_CONFIG}


@router.post("/config")
def api_update_config(payload: BulkConfigUpdate):
    """Cập nhật nhiều config; kiểm tra hết trước khi ghi."""
    try:
        cleaned = {key: store.validate_config(key, value) for key, value in payload.config.items()}
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    for key, value in cleaned.items():
        store.set_config(key, value)
    return {"success": True, "updated": cleaned}


@router.put("/config/{key}")
def api_set_config(key: str, payload: ConfigUpdate):
    if payload.key and payload.key != key:
        raise HTTPException(400, f"key trong body ({payload.key}) khác key trên URL ({key})")
    try:
        value = store.set_config(key, payload.value)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"success": True, "key": key, "value": value}


# ---------------------------------------------------------------------------
# Channel mapping
# ---------------------------------------------------------------------------

@router.get("/map")
def api_get_map():
    return {"map": channels.get_channel_map()}


@router.post("/map/auto-link")
def api_auto_link():
    """Tự động gán Matrix channels ↔ TikTok accounts."""
    return channels.auto_link_channels()


@router.post("/map")
def api_set_mapping(payload: ChannelMapping):
    try:
        channels.set_channel_mapping(payload.matrix_channel_id, payload.niche_id, payload.tiktok_channel_id)
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"TikTok acc #{payload.tiktok_channel_id} đã gán cho channel khác")
    return {"success": True}


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------

@router.get("/plans")
def api_get_plans(date: Optional[str] = None):
    plan_date = date or store.today()
    return {"date": plan_date, "plans": store.get_plans_for_date(plan_date)}


@router.post("/plans")
def api_create_plan(payload: ManualPlanItem):
    """Tạo plan thủ công cho 1 niche hôm nay."""
    day = store.today()
    channel_count = channels.count_channels_for_niche(payload.niche_id)
    if channel_count == 0:
        raise HTTPException(404, f"Niche '{payload.niche_id}' không có channel nào")
    if store.is_topic_used(payload.niche_id, payload.topic):
        raise HTTPException(409, f"Topic đã dùng cho niche {payload.niche_id}")
    try:
        plan_id = store.create_plan(day, payload.niche_id, payload.topic, channel_count)
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"Niche {payload.niche_id} đã có plan hôm nay")
    store.save_topic(payload.niche_id, payload.topic, plan_date=day)
    return {"success": True, "plan_id": plan_id, "channel_count": channel_count}


@router.post("/plans/{plan_id}/retry")
def api_retry_plan(plan_id: int):
    """Plan failed → planned; giữ batch_id để batch-matrix --resume ở cycle sau."""
    plan = store.get_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Không có plan này")
    if plan["status"] != "failed":
        raise HTTPException(409, f"Chỉ chạy lại được plan failed (hiện là {plan['status']})")
    store.update_plan(plan_id, status="planned", error_message="")
    return {"success": True, "plan": store.get_plan(plan_id)}


@router.post("/plan-now")
def api_plan_now():
    """Tạo plan cho các niche còn thiếu hôm nay (bỏ qua plan_hour)."""
    result = _exclusive(lambda _halt: planner.ensure_daily_plan(respect_plan_hour=False), "plan")
    return {**result, "plans": store.get_plans_for_date(store.today())}


# ---------------------------------------------------------------------------
# Topic history
# ---------------------------------------------------------------------------

@router.get("/topics/{niche_id}")
def api_topic_history(niche_id: str, limit: int = 50):
    return {"niche_id": niche_id, "topics": store.get_topic_history(niche_id, limit=limit)}


# ---------------------------------------------------------------------------
# Publish + cleanup
# ---------------------------------------------------------------------------

@router.post("/publish-ready")
def api_publish_ready(dry_run: bool = False):
    """Kiểm tra và xếp lịch đăng các job READY_TO_PUBLISH.

    dry_run=true: chỉ tính giờ đăng dự kiến (không tạo task, không đổi job), không cần chờ cycle.
    """
    if dry_run:
        return publisher.publish_ready_jobs(dry_run=True)
    return _exclusive(publisher.publish_ready_jobs, "publish")


@router.post("/cleanup")
def api_cleanup():
    return _exclusive(cycle.run_cleanup_now, "cleanup")


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

@router.get("/logs")
def api_logs(limit: int = 100):
    events = store.recent_events(max(1, min(limit, 1000)))
    return {"logs": [store.format_event(e) for e in events], "events": events, "total": len(events)}
