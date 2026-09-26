"""Một chu kỳ Autopilot. Mỗi bước idempotent nên dừng ở đâu cũng chạy lại được."""
from __future__ import annotations

from typing import Any, Callable, Dict

from . import cleanup, housekeeping, planner, publisher, revive, store


def run_cleanup(should_halt: Callable[[], bool], force: bool = False) -> Dict[str, Any]:
    return {
        "posted": cleanup.cleanup_posted_videos(should_halt),
        "failed_jobs": cleanup.cleanup_failed_jobs(should_halt),
        "housekeeping": housekeeping.run(should_halt, force=force),
    }


def run_cleanup_now(should_halt: Callable[[], bool]) -> Dict[str, Any]:
    """Dọn tay (API/nút): bỏ qua housekeeping_interval_minutes."""
    return run_cleanup(should_halt, force=True)


def _log_publish(result: Dict[str, int]) -> None:
    if any(result.values()):
        store.log_event(
            f"📤 Đăng: {result['published']} đã xếp lịch, {result['deferred']} chờ, "
            f"{result['blocked']} bị chặn, {result['errors']} lỗi"
        )


def _start_video_checks() -> Dict[str, Any]:
    """Hỏi bot @tiktok_check_video_bot về video đã đăng (luồng nền; lỗi không làm hỏng cycle)."""
    try:
        from bkt_web import tiktok_dup_bot
        return {"started": tiktok_dup_bot.start_background()}
    except Exception as exc:
        return {"started": False, "error": f"{type(exc).__name__}: {exc}"}


def run_cycle(should_halt: Callable[[], bool], set_step: Callable[[str], None]) -> Dict[str, Any]:
    """recover → đăng job đã xong → lập plan → (kiểm tra đĩa) → khởi động batch nền → đăng → dọn dẹp.

    Batch chạy nền (planner.launch_pending_plans) nên một cycle chỉ mất vài giây tới vài phút;
    job làm xong được xếp lịch ở cycle kế tiếp thay vì chờ mọi batch khác chạy xong.
    """
    summary: Dict[str, Any] = {}
    today = store.today()

    def step(name: str, fn: Callable[[], Any]) -> Any:
        if should_halt():
            raise store.Halted(f"dừng trước bước {name}")
        set_step(name)
        summary[name] = fn()
        return summary[name]

    step("recover", lambda: planner.recover_plans(today))
    step("revive", lambda: revive.revive_failed_jobs(should_halt))
    _log_publish(step("publish", lambda: publisher.publish_ready_jobs(should_halt)))
    step("plan", lambda: planner.ensure_daily_plan(today))

    cleaned_early = False
    disk = summary["disk"] = cleanup.disk_status()
    if disk["low"]:
        store.log_event(f"⚠️ Đĩa còn {disk['free_gb']} GB (< {disk['min_free_gb']} GB), dọn dẹp trước", "warn")
        step("cleanup", lambda: run_cleanup(should_halt, force=True))
        cleaned_early = True
        disk = summary["disk_after_cleanup"] = cleanup.disk_status()

    if disk["low"]:
        store.log_event(f"⛔ Đĩa vẫn còn {disk['free_gb']} GB: tạm không chạy batch mới", "error")
        summary["produce"] = {"skipped": "low_disk"}
    else:
        step("produce", lambda: planner.launch_pending_plans(should_halt, today))

    _log_publish(step("publish_after", lambda: publisher.publish_ready_jobs(should_halt)))
    step("video_checks", _start_video_checks)
    if not cleaned_early:
        step("cleanup", lambda: run_cleanup(should_halt))
    return summary
