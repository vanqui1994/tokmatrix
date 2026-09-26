"""Autopilot Engine — tự động tạo video hằng ngày cho các TikTok account.

Nối 3 hệ thống đã có: Xưởng Video AI + AI Matrix + Upload Scheduler. Mỗi TikTok
account gắn cứng 1 niche (1:1). Autopilot chọn topic theo niche, gọi Matrix batch
tạo video, rồi xếp lịch đăng cho đúng account sau khi qua safety check.

Module:
  store      DB autopilot.db, config (có validate), plan, topic, nhật ký chạy
  channels   mapping Matrix channel ↔ TikTok acc, ngôn ngữ/giọng theo quốc gia
  planner    lập plan ngày, chọn topic, chạy batch-matrix (song song có giới hạn)
  safety     kiểm tra niche 4 nguồn + ngôn ngữ video trước khi đăng
  scheduler  chọn giờ đăng theo giờ địa phương của acc
  publisher  READY_TO_PUBLISH → upload task → SCHEDULED (idempotent)
  cleanup    backup có xác minh → xoá MP4/project, kiểm tra dung lượng đĩa
  cycle      thứ tự các bước trong một chu kỳ
  engine     state machine, thread daemon, cycle lock
"""
from __future__ import annotations

from typing import Any, Dict

from . import channels, cleanup, cycle, planner, publisher, revive, safety, scheduler, store
from .channels import (
    LANGUAGE_VOICES,
    apply_language_to_channel_config,
    auto_link_channels,
    count_channels_for_niche,
    country_to_language,
    get_channel_map,
    get_mapping_for_matrix,
    get_mapping_for_tiktok,
    get_tiktok_for_matrix,
    set_channel_mapping,
    sync_channel_languages,
)
from .engine import AutopilotEngine, Busy, State
from .safety import video_language_problem
from .store import (
    get_all_config,
    get_config,
    get_plans_for_date,
    get_topic_history,
    is_topic_used,
    save_topic,
    set_config,
    today,
)

ENGINE = AutopilotEngine(cycle.run_cycle)


def init_autopilot_db() -> None:
    store.init_db()
    channels.ensure_cookie_tracking()


def start_autopilot() -> bool:
    return ENGINE.start()


def stop_autopilot(timeout: float = 30.0) -> bool:
    stopped = ENGINE.stop(timeout)
    planner.wait_running(timeout=min(timeout, 15))  # batch nền thấy lệnh dừng, giết batch-matrix, trả plan về planned
    return stopped


def pause_autopilot() -> None:
    ENGINE.pause()


def resume_autopilot() -> None:
    ENGINE.resume()


def engine_snapshot() -> Dict[str, Any]:
    return ENGINE.snapshot()


def recent_logs(limit: int = 100) -> list:
    return [store.format_event(e) for e in store.recent_events(limit)]


def get_status() -> Dict[str, Any]:
    day = store.today()
    return {
        **ENGINE.snapshot(),
        "config": store.get_all_config(),
        "today": day,
        "plans": store.get_plans_for_date(day),
        "channel_map_count": len(channels.get_channel_map()),
        "batches_running": sorted(planner.running_plan_ids()),
        "disk": cleanup.disk_status(),
        "logs": recent_logs(100),
    }


def create_plan(plan_date: str, niche_id: str, topic: str, channel_count: int) -> int:
    return store.create_plan(plan_date, niche_id, topic, channel_count)


# Tên cũ, giữ cho code/test gọi trực tiếp.
_calculate_schedule_time = scheduler.next_slot


def daily_cycle() -> Dict[str, Any]:
    return ENGINE.run_cycle("manual")


def auto_publish_ready_jobs() -> Dict[str, Any]:
    return ENGINE.run_exclusive(publisher.publish_ready_jobs, "publish")


def cleanup_posted_videos() -> Dict[str, Any]:
    return ENGINE.run_exclusive(cycle.run_cleanup_now, "cleanup")
