"""Đưa job READY_TO_PUBLISH vào hàng đợi đăng, idempotent.

Thứ tự cho mỗi job:
  safety check → đã có upload task cho (slug, acc)? → có: chỉ chuyển job sang SCHEDULED
  → chưa: kiểm tra ngôn ngữ → chọn giờ → enqueue_upload → chuyển job sang SCHEDULED.

Nếu process chết giữa enqueue và chuyển trạng thái, lượt sau thấy task đã có nên
chỉ hoàn tất chuyển trạng thái, không tạo task thứ hai (không đăng trùng).
"""
from __future__ import annotations

import datetime
import json
import threading
import time
from collections import Counter
from typing import Any, Callable, Dict, Mapping, Optional, Tuple

from . import captions, channels, dupguard, safety, scheduler, store

try:
    from bkt_web import asset_ledger, matrix_db, publish_flow
except ImportError:
    import asset_ledger
    import matrix_db
    import publish_flow

PUBLISHED_STATES = {"SCHEDULED", "PUBLISHED", "ANALYTICS_PENDING", "COMPLETED"}
FAILED_STATES = {"FAILED", "DEAD_LETTER"}
ACTIVE_PLAN_STATUSES = ("starting", "producing")

# Lý do chặn đã ghi log cho mỗi job → không lặp lại log mỗi giờ.
_reported: Dict[str, str] = {}
_reported_lock = threading.Lock()


def _report_once(job_id: str, message: str, level: str = "warn") -> None:
    with _reported_lock:
        if _reported.get(job_id) == message:
            return
        if len(_reported) > 5000:
            _reported.clear()
        _reported[job_id] = message
    store.log_event(message, level)


def publish_wait_reason(tiktok_id: int, now: Optional[float] = None) -> Optional[str]:
    """Lý do chưa được xếp lịch đăng (tạm giữ toàn hệ thống / acc đang ngâm sau khi tiêm cookie)."""
    now = time.time() if now is None else now
    hold_until = store.get_int("publish_hold_until")
    if hold_until > now:
        return f"đang tạm giữ đăng tới {datetime.datetime.fromtimestamp(hold_until):%d/%m %H:%M}"
    warmup = store.get_int("warmup_hours") * 3600
    injected = channels.cookie_injected_at(tiktok_id)
    if warmup and injected and now < injected + warmup:
        return f"acc đang ngâm sau khi tiêm cookie tới {datetime.datetime.fromtimestamp(injected + warmup):%d/%m %H:%M}"
    return None


def blocked_engine(job: Mapping[str, Any]) -> Optional[str]:
    """Engine bị chặn đăng của job: xét engine_type của job VÀ engine thật đã render (meta.json),
    vì job được làm lại có thể đổi engine mà vẫn giữ slug cũ (vd tierlist-… render bằng science)."""
    blocked = set(store.get_publish_block_engines())
    if not blocked:
        return None
    engines = [job.get("engine_type") or ""]
    slug = job.get("video_slug") or ""
    if slug:
        try:
            meta = json.loads((store.VIDEOS_DIR / slug / "meta.json").read_text(encoding="utf-8"))
            engines.append(meta.get("type") or "")
        except (OSError, ValueError):
            pass
    return next((engine for engine in engines if engine in blocked), None)


def find_existing_task(slug: str, tiktok_id: int) -> Optional[Tuple[int, str]]:
    conn = store.channels_db()
    try:
        row = conn.execute(
            "SELECT id, status FROM upload_tasks WHERE video_slug=? AND channel_id=? ORDER BY id DESC LIMIT 1",
            (slug, tiktok_id),
        ).fetchone()
        return (row[0], row[1]) if row else None
    finally:
        conn.close()


def _mark_scheduled(job_id: str) -> None:
    try:
        matrix_db.transition_job(job_id=job_id, expected_state="READY_TO_PUBLISH", to_state="SCHEDULED")
    except (ValueError, KeyError) as exc:
        # Task đăng đã có; job không còn READY nên lượt sau cũng không tạo task mới.
        store.log_event(f"⚠️ Job {job_id}: đã có task đăng nhưng không chuyển được sang SCHEDULED ({exc})", "warn")


def publish_job(
    job: Mapping[str, Any],
    plan: Mapping[str, Any],
    *,
    dry_run: bool = False,
    reserved: Optional[Dict[int, list]] = None,
    details: Optional[list] = None,
) -> str:
    """Trả 'scheduled' | 'recovered' | 'blocked' | 'deferred' | 'error'.

    dry_run: chỉ tính, không tạo task, không đổi trạng thái job, không ghi log sự kiện.
    `reserved` giữ các slot đã chọn trong lượt chạy thử để các job cùng acc không trùng giờ.
    """
    job_id = job["job_id"]
    outcome = _publish_job(job, plan, dry_run=dry_run, reserved=reserved if reserved is not None else {})
    if details is not None:
        details.append({"job_id": job_id, "video_slug": job.get("video_slug"), **outcome})
    return outcome["outcome"]


def _publish_job(job: Mapping[str, Any], plan: Mapping[str, Any], *, dry_run: bool, reserved: Dict[int, list]) -> Dict[str, Any]:
    job_id = job["job_id"]
    report = (lambda _job_id, _message, _level="warn": None) if dry_run else _report_once
    slug = job.get("video_slug") or ""
    mapping = channels.get_mapping_for_matrix(job["channel_id"])
    verdict = safety.check_niche_match(
        job=job, plan=plan, mapping=mapping, job_niches=matrix_db.job_niche_ids(job_id),
    )
    if not verdict.ok:
        report(job_id, f"⛔ BẢO VỆ: {slug or job_id} bị chặn — {verdict.reason}")
        return {"outcome": "blocked", "reason": verdict.reason}
    if not slug:
        report(job_id, f"⛔ BẢO VỆ: job {job_id} không có video_slug")
        return {"outcome": "blocked", "reason": "thiếu video_slug"}
    tiktok_id = int(mapping["tiktok_channel_id"])

    existing = find_existing_task(slug, tiktok_id)
    if existing:
        if not dry_run:
            _mark_scheduled(job_id)
            store.log_event(f"↩️ {slug} → acc #{tiktok_id}: đã có task #{existing[0]} ({existing[1]}), chỉ cập nhật job")
        return {"outcome": "recovered", "tiktok_id": tiktok_id, "task_id": existing[0]}

    problem = safety.video_language_problem(slug, tiktok_id, job_id)
    if problem:
        report(job_id, f"⛔ BẢO VỆ: {slug} → acc #{tiktok_id}: {problem}")
        return {"outcome": "blocked", "tiktok_id": tiktok_id, "reason": problem}

    blocked = blocked_engine(job)
    if blocked:
        reason = f"thể loại {blocked} đang tạm dừng đăng (publish_block_engines)"
        report(job_id, f"🧊 {slug} → acc #{tiktok_id}: {reason}, giữ video chờ", "info")
        return {"outcome": "deferred", "tiktok_id": tiktok_id, "reason": reason}

    wait = publish_wait_reason(tiktok_id)
    if wait:
        report(job_id, f"🧊 {slug} → acc #{tiktok_id}: {wait}, giữ video chờ", "info")
        return {"outcome": "deferred", "tiktok_id": tiktok_id, "reason": wait}

    reused = asset_ledger.verdict(slug, tiktok_id, videos_dir=store.VIDEOS_DIR)
    if reused:
        report(job_id, f"⛔ BẢO VỆ: {slug} → acc #{tiktok_id}: {reused}")
        return {"outcome": "blocked", "tiktok_id": tiktok_id, "reason": reused}

    if not dry_run:  # đo vân tay có ghi DB → không chạy trong lượt chạy thử
        too_close = dupguard.verdict(slug, tiktok_id)
        if too_close:
            report(job_id, f"🧬 {slug} → acc #{tiktok_id}: {too_close}, giữ video chờ", "warn")
            return {"outcome": "deferred", "tiktok_id": tiktok_id, "reason": too_close}

    # Video phải làm xong trước khung đăng ít nhất min_lead_hours (luôn có sẵn video trước 1 ngày).
    earliest = max(time.time(), float(job.get("updated_at") or 0) + store.get_int("min_lead_hours") * 3600)
    schedule_ts = scheduler.next_slot(tiktok_id, now=earliest, extra_used=reserved.get(tiktok_id, ()))
    if schedule_ts is None:
        report(job_id, f"⏸️ Acc #{tiktok_id} đã kín lịch {scheduler.LOOKAHEAD_DAYS} ngày tới, giữ {slug} chờ lượt sau", "info")
        return {"outcome": "deferred", "tiktok_id": tiktok_id, "reason": "kín lịch"}
    if dry_run:
        reserved.setdefault(tiktok_id, []).append(schedule_ts)
        language = mapping.get("language") or channels.account_language(tiktok_id)
        caption, hashtags = captions.build_caption(slug, plan.get("niche_id") or mapping["niche_id"], language)
        return {"outcome": "scheduled", "tiktok_id": tiktok_id, "schedule_ts": schedule_ts,
                "caption": caption[:120], "hashtags": hashtags}

    language = mapping.get("language") or channels.account_language(tiktok_id)
    caption, hashtags = captions.build_caption(slug, plan.get("niche_id") or mapping["niche_id"], language)
    try:
        publish_flow.enqueue_upload(
            slug, tiktok_id, caption, hashtags,
            schedule_ts=schedule_ts,
            ai_generated=True,
            run_id=plan.get("batch_id") or "",
            # Khoảng cách giữa các bài đã do scheduler giữ theo gap_between_posts_minutes.
            confirm_nearby=True,
            db_path=store.DB_PATH,
        )
    except publish_flow.PublishError as exc:
        if exc.status == 409:  # còn ảnh chờ Antigravity… → thử lại lượt sau
            _report_once(job_id, f"⏳ {slug}: {exc.message}", "info")
            return {"outcome": "deferred", "tiktok_id": tiktok_id, "reason": exc.message}
        store.log_event(f"❌ Không tạo được task đăng {slug} → acc #{tiktok_id}: {exc.message}", "error")
        return {"outcome": "error", "tiktok_id": tiktok_id, "reason": exc.message}

    try:
        asset_ledger.record(slug, tiktok_id, videos_dir=store.VIDEOS_DIR)
    except Exception as exc:  # ledger lỗi không được làm mất task đăng đã tạo
        store.log_event(f"⚠️ asset ledger không ghi được {slug}: {exc}", "warn")
    _mark_scheduled(job_id)
    when = datetime.datetime.fromtimestamp(schedule_ts).strftime("%d/%m %H:%M")
    store.log_event(f"✅ {slug} → acc #{tiktok_id} lúc {when}")
    return {"outcome": "scheduled", "tiktok_id": tiktok_id, "schedule_ts": schedule_ts}


def refresh_plan_stats(plan: Mapping[str, Any]) -> Dict[str, Any]:
    """Đếm lại theo trạng thái job; chỉ chốt plan khi batch đã chạy xong (producing)."""
    jobs = matrix_db.list_batch_jobs(plan["batch_id"])
    published = sum(1 for j in jobs if j["state"] in PUBLISHED_STATES)
    failed = sum(1 for j in jobs if j["state"] in FAILED_STATES)
    ready_or_later = sum(1 for j in jobs if j["state"] == "READY_TO_PUBLISH") + published
    fields: Dict[str, Any] = {"jobs_completed": ready_or_later, "jobs_failed": failed, "jobs_published": published}
    if plan["status"] == "producing" and jobs and published + failed >= len(jobs):
        fields["status"] = "completed" if failed == 0 else "partial"
        fields["completed_at"] = datetime.datetime.now().isoformat()
    store.update_plan(plan["id"], **fields)
    return fields


def publish_ready_jobs(should_halt: Optional[Callable[[], bool]] = None, *, dry_run: bool = False) -> Dict[str, Any]:
    if not dry_run:  # chạy thử không được ghi gì, kể cả migration
        matrix_db.init_db()
    counts: Counter = Counter()
    reserved: Dict[int, list] = {}
    details: list = []
    # Plan 'planned' còn batch_id là batch bị dừng giữa chừng (restart, stop, lỗi) chờ --resume;
    # video đã xong của nó vẫn phải được đăng, không đợi tới lượt batch được chạy lại.
    for plan in store.get_plans_by_status(*ACTIVE_PLAN_STATUSES, "planned"):
        if not plan["batch_id"]:
            continue
        for job in matrix_db.list_batch_jobs(plan["batch_id"]):
            if should_halt and should_halt():
                raise store.Halted("dừng giữa bước đăng")
            if job["state"] == "READY_TO_PUBLISH":
                counts[publish_job(job, plan, dry_run=dry_run, reserved=reserved, details=details)] += 1
        if not dry_run:
            refresh_plan_stats(plan)
    result: Dict[str, Any] = {
        "published": counts["scheduled"] + counts["recovered"],
        "recovered": counts["recovered"],
        "blocked": counts["blocked"],
        "deferred": counts["deferred"],
        "errors": counts["error"],
    }
    if dry_run:
        result.update(dry_run=True, details=details)
    return result
