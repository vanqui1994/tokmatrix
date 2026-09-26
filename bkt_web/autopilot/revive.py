"""Tự làm lại video hỏng (job FAILED/DEAD_LETTER) của Autopilot, vẫn cho đúng kênh/acc.

Job luôn thuộc một Matrix channel cố định; channel map 1:1 với TikTok acc, nên làm lại xong
video vẫn chỉ đăng lên đúng acc đó (publisher còn kiểm niche 4 nguồn trước khi đăng).
Chỉ làm lại khi channel vẫn đang được gán acc; tối đa `max_revives` lần mỗi job.

Thể loại hiếm (ít hơn một nửa thể loại nhiều nhất, cùng quy tắc với planner.plan_rarity) được
làm lại trước và được gấp đôi số lần làm lại: vox/folklore/mystery/newspaper… cần ảnh AI nên
hỏng nhiều hơn, bỏ sớm thì kho video chỉ còn kinetic/science.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from . import channels, planner, proc, store

try:
    from bkt_web import matrix_db
except ImportError:
    import matrix_db

# = RENDERABLE_ENGINES của native-engine-adapter.mjs (test so với Node). Thiếu engine ở đây thì job hỏng
# của engine đó bị chọn lại engine khác khi làm lại — mất đúng các thể loại mở rộng hiếm nhất.
RENDERABLE_ENGINES = {"mystery", "newspaper", "vox", "folklore", "kinetic", "science",
                      "tierlist", "survival", "chalk", "wildlife", "compare"}
RARE_REVIVE_FACTOR = 2
DEAD_STATES = {"FAILED", "DEAD_LETTER"}
COOL_DOWN_SECONDS = 600  # chờ một lúc sau khi hỏng, tránh vòng lặp hỏng → làm lại → hỏng liên tục
LIVE_PLAN_STATUSES = ("planned", "starting", "producing", "completed", "partial")

# Chỉ xét DÒNG ĐẦU của lỗi: phần sau thường là log dài của công cụ (vd "ANGLE (Mesa…)" của Chrome)
# dễ khớp nhầm từ khoá. Lỗi render được nhận diện trước lỗi kịch bản.
_RENDER_ERRORS = ("npm run check", "npm run render", "hyperframes", "video qa", "native render asset",
                  "composition changed", "rendered mp4", "native project")
_SCRIPT_ERRORS = ("script gate rejected", "script provider", "script is invalid", "angle provider",
                  "angle generator", "bridge task", "gemini", "opening hook")

_reported: Dict[str, str] = {}
_reported_lock = threading.Lock()


def _report_once(job_id: str, message: str, level: str = "warn") -> None:
    with _reported_lock:
        if _reported.get(job_id) == message:
            return
        _reported[job_id] = message
    store.log_event(message, level)


def classify(error: str, engine_changed: bool) -> Tuple[str, bool]:
    """(bước làm lại, có bỏ kịch bản cũ không) theo lỗi cuối của job."""
    first = (error or "").strip().splitlines()[0].lower() if (error or "").strip() else ""
    if any(key in first for key in _RENDER_ERRORS):
        return ("SCRIPT_QA", False) if engine_changed else ("ASSET_QA", False)  # giữ tài nguyên, dựng + render lại
    if any(key in first for key in _SCRIPT_ERRORS):
        return "PLANNING", True           # viết lại kịch bản (qua bridge)
    return "SCRIPT_QA", False             # giữ kịch bản, làm lại ảnh/giọng/cảnh (đổi engine cũng về đây)


_SNAPSHOT_ERRORS = ("source manifest or asset checksums changed", "different source composition")


def retire_video_dir(slug: str, now: float) -> Optional[str]:
    """Chuyển thư mục video của lần làm trước sang .runtime/retired-videos (không xoá) để dựng lại từ đầu.

    Bước dựng project bảo vệ bản chụp: thấy thư mục cũ khác nguồn thì từ chối ghi đè ("create a new job").
    """
    source = store.VIDEOS_DIR / slug
    if not slug or not source.is_dir() or source.resolve().parent != store.VIDEOS_DIR.resolve():
        return None
    target_dir = store.COMPARE_DIR / ".runtime" / "retired-videos"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{slug}-{int(now)}"
    shutil.move(str(source), str(target))
    return str(target)


def pick_engines(channel_ids: Iterable[str]) -> Dict[str, str]:
    ids = sorted(set(channel_ids))
    if not ids:
        return {}
    result = proc.run(["node", "tools/matrix-pick-engine.mjs", *ids], cwd=str(store.COMPARE_DIR), timeout=120,
                      env=planner.matrix_env())
    if result.returncode != 0:
        raise RuntimeError(f"matrix-pick-engine lỗi: {(result.stderr or result.stdout)[-300:]}")
    return json.loads(result.stdout.strip().splitlines()[-1])


def engine_rarity(counts: Dict[str, int]) -> Callable[[str], int]:
    """engine → số âm nếu là thể loại ưu tiên, số video đã xong nếu hiếm, planner.NOT_RARE nếu không."""
    top = max(counts.values(), default=0)
    priority = store.get_priority_engines()

    def rarity(engine: str) -> int:
        rank = planner.priority_rank(engine, priority)
        if rank is not None:
            return rank
        have = counts.get(engine, 0)
        return have if have * 2 < top else planner.NOT_RARE
    return rarity


def revive_failed_jobs(should_halt: Optional[Callable[[], bool]] = None, now: Optional[float] = None,
                       counts: Optional[Dict[str, int]] = None) -> Dict[str, int]:
    now = time.time() if now is None else now
    limit = store.get_int("max_revives")
    if limit <= 0:
        return {"revived": 0, "skipped": 0, "given_up": 0}
    rarity = engine_rarity(planner.engine_output_counts() if counts is None else counts)
    mapped = {cid for ids in channels.mapped_channels_by_niche().values() for cid in ids}
    candidates: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    for plan in store.get_plans_by_status(*LIVE_PLAN_STATUSES):
        if not plan["batch_id"]:
            continue
        for job in matrix_db.list_batch_jobs(plan["batch_id"]):
            if job["state"] in DEAD_STATES:
                candidates.append((plan, job))

    # Thể loại hiếm nhất làm lại trước.
    candidates.sort(key=lambda item: (rarity(item[1]["engine_type"]), float(item[1].get("updated_at") or 0)))
    counts = {"revived": 0, "skipped": 0, "given_up": 0}
    blocked_now = set(store.get_publish_block_engines())
    to_repick = [job["channel_id"] for _, job in candidates if job["engine_type"] not in RENDERABLE_ENGINES and job["engine_type"] not in blocked_now]
    engines = pick_engines(to_repick) if to_repick else {}
    reopened = set()
    blocked = set(store.get_publish_block_engines())
    for plan, job in candidates:
        if should_halt and should_halt():
            raise store.Halted("dừng giữa bước làm lại video hỏng")
        job_id, channel_id = job["job_id"], job["channel_id"]
        if job["engine_type"] in blocked:
            # Thể loại đang dừng (publish_block_engines): không dựng/render lại.
            counts["skipped"] += 1
            continue
        if channel_id not in mapped:
            _report_once(job_id, f"♻️ Không làm lại {job['video_slug']}: kênh {channel_id} không còn gán TikTok acc")
            counts["skipped"] += 1
            continue
        if float(job.get("updated_at") or 0) > now - COOL_DOWN_SECONDS:
            counts["skipped"] += 1
            continue
        full = matrix_db.get_job(job_id) or {}
        revived_before = int((full.get("manifest") or {}).get("revive_count") or 0)
        job_limit = limit * RARE_REVIVE_FACTOR if rarity(job["engine_type"]) < planner.NOT_RARE else limit
        if revived_before >= job_limit:
            _report_once(job_id, f"☠️ Bỏ hẳn {job['video_slug']} ({channel_id}) sau {revived_before} lần làm lại: "
                                 f"{(job.get('error_message') or '')[:160]}", "error")
            counts["given_up"] += 1
            continue
        new_engine = engines.get(channel_id) if job["engine_type"] not in RENDERABLE_ENGINES else None
        error = job.get("error_message") or ""
        to_state, drop_script = classify(error, engine_changed=bool(new_engine))
        if drop_script or new_engine or any(marker in error for marker in _SNAPSHOT_ERRORS):
            retired = retire_video_dir(job.get("video_slug") or "", now)
            if retired:
                store.log_event(f"📦 Chuyển bản cũ của {job['video_slug']} sang {retired} để dựng lại")
        matrix_db.revive_job(job_id=job_id, to_state=to_state, engine_type=new_engine, drop_script=drop_script)
        counts["revived"] += 1
        store.log_event(f"♻️ Làm lại {job['video_slug']} ({channel_id}) từ {to_state}"
                        + (f", engine {job['engine_type']}→{new_engine}" if new_engine else "")
                        + f" — lần {revived_before + 1}/{job_limit}; lỗi trước: {(job.get('error_message') or '')[:120]}")
        if plan["status"] in ("completed", "partial") and plan["id"] not in reopened:
            store.update_plan(plan["id"], status="producing", completed_at=None)  # để cycle resume batch
            reopened.add(plan["id"])
    return counts
