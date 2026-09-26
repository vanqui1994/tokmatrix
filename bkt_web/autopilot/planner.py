"""Lập plan trong ngày (mỗi acc 1 topic riêng — topic_per_channel; hoặc 1 topic/niche) và chạy Matrix batch cho từng plan."""
from __future__ import annotations

import datetime
import json
import os
import sqlite3
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional

from . import channels, proc, store, topics

try:
    from bkt_web import matrix_db
except ImportError:
    import matrix_db

ShouldHalt = Callable[[], bool]


def _never() -> bool:
    return False


# ---------------------------------------------------------------------------
# Niches + topics
# ---------------------------------------------------------------------------

def get_niches() -> List[Dict[str, str]]:
    """Danh sách niche từ compatibility_matrix.yaml."""
    import yaml

    matrix_file = store.COMPARE_DIR / "config" / "compatibility_matrix.yaml"
    matrix = yaml.safe_load(matrix_file.read_text(encoding="utf-8")) or {}
    return [{"id": n["id"], "name": n.get("name", n["id"])} for n in matrix.get("niches", [])]


def _file_topics(niche_id: str) -> List[str]:
    path = store.TOPICS_DIR / f"{niche_id}.txt"
    if not path.exists():
        return []
    lines = (line.strip() for line in path.read_text(encoding="utf-8").splitlines())
    return [line for line in lines if line and not line.startswith("#")]


def topic_candidates(niche_id: str) -> List[str]:
    """Mọi topic theo topic_source: file curated, topic Gemini viết thêm (topics.py), bảng topics READY của Matrix."""
    source = store.get_config("topic_source", "curated")
    candidates: List[str] = []
    if source in ("curated", "file"):
        candidates += _file_topics(niche_id) + topics.generated_topics(niche_id)
    if source in ("curated", "matrix"):
        try:
            candidates += matrix_db.list_topics(niche_id)
        except sqlite3.Error as exc:
            store.log_event(f"⚠️ Không đọc được topics Matrix cho {niche_id}: {exc}", "warn")
    return candidates


def pick_topic(niche_id: str, avoid_subjects: Optional[List[str]] = None) -> Optional[str]:
    """Topic chưa dùng đầu tiên theo topic_source, không chung chủ thể với avoid_subjects.

    curated = file config/topics/<niche>.txt (+ topic Gemini viết thêm) rồi bảng topics READY của Matrix;
    file / matrix = chỉ một nguồn. Hết topic thì trả None (không tự bịa topic).
    """
    avoid = avoid_subjects or []
    for candidate in topic_candidates(niche_id):
        if not store.is_topic_used(niche_id, candidate) and not topics.same_subject(candidate, avoid):
            return candidate
    return None


# ---------------------------------------------------------------------------
# Daily plan
# ---------------------------------------------------------------------------

def ensure_daily_plan(plan_date: Optional[str] = None, *, respect_plan_hour: bool = True) -> Dict[str, Any]:
    """Tạo plan cho các niche (hoặc từng acc, topic_per_channel) còn thiếu trong ngày. Chạy lại bao nhiêu lần cũng được."""
    plan_date = plan_date or store.today()
    plan_hour = store.get_int("plan_hour")
    if respect_plan_hour and plan_date == store.today() and store.now_local().hour < plan_hour:
        return {"created": [], "waiting_until_hour": plan_hour}
    if store.get_bool("topic_per_channel"):
        return _ensure_channel_plans(plan_date)

    have = {p["niche_id"] for p in store.get_plans_for_date(plan_date)}
    channel_counts = {niche: len(ids) for niche, ids in channels.mapped_channels_by_niche().items()}

    created, no_topic = [], []
    for niche in get_niches():
        niche_id = niche["id"]
        count = channel_counts.get(niche_id, 0)
        if niche_id in have or count == 0:
            continue
        topic = pick_topic(niche_id)
        if not topic:
            no_topic.append(niche_id)
            store.log_event(f"⚠️ Hết topic chưa dùng cho {niche_id} — thêm vào config/topics/{niche_id}.txt", "warn")
            continue
        try:
            store.create_plan(plan_date, niche_id, topic, count)
        except sqlite3.IntegrityError:
            continue  # niche vừa được tạo plan ở chỗ khác
        store.save_topic(niche_id, topic, plan_date=plan_date)
        created.append(niche_id)
        store.log_event(f"📝 {niche_id}: \"{topic}\" ({count} channels)")
    return {"created": created, "no_topic": no_topic, "existing": sorted(have)}


def _ensure_channel_plans(plan_date: str) -> Dict[str, Any]:
    """Mỗi Matrix channel đã gán acc một plan riêng, topic riêng, không chung chủ thể với acc khác cùng niche
    trong topic_subject_gap_days ngày. Niche đã có plan kiểu cũ (cả niche) trong ngày thì để nguyên."""
    plans = store.get_plans_for_date(plan_date)
    whole_niche = {p["niche_id"] for p in plans if not p["matrix_channel_id"]}
    have = {(p["niche_id"], p["matrix_channel_id"]) for p in plans}
    gap = store.get_int("topic_subject_gap_days")
    since = (datetime.date.fromisoformat(plan_date) - datetime.timedelta(days=max(gap - 1, 0))).isoformat()

    created, no_topic = [], []
    for niche_id, channel_ids in sorted(channels.mapped_channels_by_niche().items()):
        missing = [cid for cid in channel_ids if (niche_id, cid) not in have]
        if niche_id in whole_niche or not missing:
            continue
        recent = store.recent_plan_topics(niche_id, since) if gap else []
        stock = [t for t in topic_candidates(niche_id) if not store.is_topic_used(niche_id, t)]
        if len(stock) < len(missing) * 2:
            topics.refill(niche_id, topic_candidates(niche_id), len(missing))
        for channel_id in missing:
            topic = pick_topic(niche_id, recent)
            if not topic:
                no_topic.append(channel_id)
                continue
            try:
                store.create_plan(plan_date, niche_id, topic, 1, matrix_channel_id=channel_id)
            except sqlite3.IntegrityError:
                continue
            store.save_topic(niche_id, topic, plan_date=plan_date)
            recent.append(topic)
            created.append(channel_id)
            store.log_event(f"📝 {channel_id}: \"{topic}\"")
    if no_topic:
        store.log_event(f"⚠️ Hết topic cho {len(no_topic)} acc: {', '.join(no_topic[:8])}"
                        f"{'…' if len(no_topic) > 8 else ''} — thêm vào config/topics/<niche>.txt", "warn")
    return {"created": created, "no_topic": no_topic, "existing": sorted(f"{n}/{c}" if c else n for n, c in have)}


def recover_plans(today: Optional[str] = None) -> Dict[str, int]:
    """Sửa plan kẹt do lần chạy trước chết giữa chừng (bỏ qua plan đang có batch chạy nền)."""
    today = today or store.today()
    running = running_plan_ids()
    resumed = expired = 0
    for plan in store.get_plans_by_status("starting"):
        if plan["id"] in running:
            continue
        # batch-matrix của plan này không còn chạy → về planned, giữ batch_id để --resume.
        store.update_plan(plan["id"], status="planned")
        resumed += 1
    for plan in store.get_plans_by_status("producing"):
        if not plan["batch_id"]:  # dữ liệu cũ: đặt producing trước khi có batch_id
            store.update_plan(plan["id"], status="planned")
            resumed += 1
    for plan in store.get_plans_by_status("planned"):
        if plan["plan_date"] < today and not plan["batch_id"]:
            # Qua ngày mà chưa chạy: không dồn thêm vào quota hôm nay.
            store.update_plan(plan["id"], status="expired", error_message="quá ngày mà chưa chạy")
            expired += 1
    if resumed or expired:
        store.log_event(f"🩺 Khôi phục plan: {resumed} chạy lại/resume, {expired} hết hạn")
    return {"resumed": resumed, "expired": expired}


# ---------------------------------------------------------------------------
# Matrix batch
# ---------------------------------------------------------------------------

def new_batch_id(niche_id: str) -> str:
    return f"autopilot-{datetime.date.today().isoformat()}-{niche_id}-{uuid.uuid4().hex[:8]}"


def _parse_summary(stdout: str) -> Dict[str, Any]:
    for i, char in enumerate(stdout):
        if char != "{":
            continue
        try:
            return json.loads(stdout[i:])
        except json.JSONDecodeError:
            pass
    return {}


def trigger_matrix_batch(
    topic: str,
    niche_id: str,
    channel_count: int = 10,
    auto_render: bool = True,
    batch_id: Optional[str] = None,
    resume: bool = False,
    should_halt: ShouldHalt = _never,
    channel_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Chạy tools/batch-matrix.mjs (mới hoặc --resume). Raise store.Halted khi bị dừng."""
    batch_id = batch_id or new_batch_id(niche_id)
    if resume:
        args = ["node", "tools/batch-matrix.mjs", "--resume", batch_id]
        store.log_event(f"▶ Resume Matrix batch {batch_id} ({niche_id})")
    else:
        args = ["node", "tools/batch-matrix.mjs", "--topic", topic, "--niche", niche_id,
                "--channels", str(len(channel_ids) if channel_ids else channel_count), "--batch-id", batch_id]
        if channel_ids:
            args += ["--channel-ids", ",".join(channel_ids)]
        store.log_event(f"▶ Matrix batch: {niche_id} → \"{topic}\" ({channel_count} channels)")
    args += ["--workers", str(store.get_int("matrix_workers"))]
    if auto_render:
        args += ["--render", "--approve-render"]

    # Kịch bản viết qua agent Antigravity (MATRIX_LLM_PROVIDER=bridge) chậm hơn API nhiều → timeout theo config.
    timeout = store.get_int("batch_timeout_minutes") * 60
    result = proc.run(args, cwd=str(store.COMPARE_DIR), timeout=timeout, should_halt=should_halt,
                      env=matrix_env())
    if result.returncode < 0 or (result.returncode != 0 and should_halt()):
        # Bị giết bằng tín hiệu (vd systemd dừng cả nhóm tiến trình khi restart) → dừng giữa chừng, không phải lỗi.
        raise store.Halted(f"batch-matrix {batch_id} bị dừng (mã {result.returncode})")
    if result.returncode != 0:
        error = (result.stderr or result.stdout or "Matrix batch failed").strip()[-2000:]
        raise RuntimeError(f"Matrix batch thất bại cho {niche_id}: {error}")
    return {"batch_id": batch_id, "output": _parse_summary(result.stdout)}


def run_plan_item(plan: Dict[str, Any], should_halt: ShouldHalt = _never) -> str:
    """Chạy batch cho 1 plan. Trả 'started' | 'failed' | 'skipped'; raise Halted khi bị dừng."""
    if should_halt():
        raise store.Halted("dừng trước khi chạy batch")
    batch_id = plan["batch_id"] or new_batch_id(plan["niche_id"])
    resume = bool(plan["batch_id"]) and matrix_db.get_batch(batch_id) is not None
    mapped = [] if resume else channels.mapped_channels_by_niche().get(plan["niche_id"], [])
    own = plan.get("matrix_channel_id") or ""
    channel_ids = ([own] if own in mapped else []) if own else mapped
    if not resume and not channel_ids:
        store.update_plan(plan["id"], status="failed", error_message="niche không còn channel nào đã gán TikTok acc")
        store.log_event(f"❌ {plan['niche_id']}: không có channel đã gán acc, bỏ plan", "error")
        return "failed"
    if not store.claim_plan(plan["id"], batch_id, from_statuses=("planned", "producing")):
        return "skipped"
    if channel_ids:
        store.update_plan(plan["id"], channel_count=len(channel_ids))
    try:
        trigger_matrix_batch(
            topic=plan["topic"], niche_id=plan["niche_id"], channel_count=plan["channel_count"],
            auto_render=store.get_bool("auto_render"), batch_id=batch_id, resume=resume,
            should_halt=should_halt, channel_ids=channel_ids,
        )
    except store.Halted:
        store.update_plan(plan["id"], status="planned")  # giữ batch_id, lượt sau --resume
        store.log_event(f"⏹️ Dừng batch {batch_id} giữa chừng, sẽ resume lượt sau", "warn")
        raise
    except subprocess.TimeoutExpired:
        # Batch chạy quá batch_timeout_minutes (chờ ảnh/render): job vẫn ở DB, cycle sau --resume tiếp.
        store.update_plan(plan["id"], status="producing", error_message="")
        store.log_event(f"⏱️ Batch {plan['niche_id']} chạy quá {store.get_int('batch_timeout_minutes')} phút, "
                        "sẽ resume ở cycle sau", "warn")
        return "started"
    except (RuntimeError, OSError) as exc:
        store.update_plan(plan["id"], status="failed", error_message=str(exc)[:500])
        store.log_event(f"❌ Batch thất bại cho {plan['niche_id']}: {exc}", "error")
        return "failed"
    store.update_plan(plan["id"], status="producing")
    store.save_topic(plan["niche_id"], plan["topic"], batch_id=batch_id, plan_date=plan["plan_date"])
    store.log_event(f"✅ Batch {batch_id} xong phần sản xuất cho {plan['niche_id']}")
    return "started"


# Job ở các trạng thái này không cần batch-matrix chạy tiếp (đã xong phần sản xuất hoặc đã hỏng hẳn).
PRODUCTION_DONE_STATES = {"READY_TO_PUBLISH", "SCHEDULED", "PUBLISHED", "ANALYTICS_PENDING", "COMPLETED", "FAILED", "DEAD_LETTER"}


def has_unfinished_jobs(batch_id: str) -> bool:
    done = PRODUCTION_DONE_STATES | (set() if store.get_bool("auto_render") else {"READY_TO_RENDER"})
    try:
        return any(job["state"] not in done for job in matrix_db.list_batch_jobs(batch_id))
    except Exception:  # DB Matrix chưa có batch này
        return False


def pending_plans(today: Optional[str] = None) -> List[Dict[str, Any]]:
    """Plan cần chạy batch: planned hôm nay/đang dở, và producing còn job chưa xong.

    batch-matrix tự thoát khi tạm thời không còn job nhận được (đang chờ ảnh, đang chờ retry);
    mỗi cycle resume lại để các job đó đi tiếp thay vì kẹt vĩnh viễn.
    """
    today = today or store.today()
    planned = [p for p in store.get_plans_by_status("planned") if p["plan_date"] == today or p["batch_id"]]
    producing = [p for p in store.get_plans_by_status("producing") if p["batch_id"] and has_unfinished_jobs(p["batch_id"])]
    return planned + producing


def run_pending_plans(should_halt: ShouldHalt = _never, today: Optional[str] = None) -> Dict[str, int]:
    """Chạy các plan planned, tối đa max_concurrent_batches batch song song."""
    plans = pending_plans(today)
    if not plans:
        return {"started": 0, "failed": 0, "skipped": 0}
    workers = min(store.get_int("max_concurrent_batches"), len(plans))
    results: Dict[str, int] = {"started": 0, "failed": 0, "skipped": 0}
    halted = False
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="autopilot-batch") as pool:
        futures = [pool.submit(run_plan_item, plan, should_halt) for plan in plans]
        for future in futures:
            try:
                results[future.result()] += 1
            except store.Halted:
                halted = True
    if halted:
        raise store.Halted("dừng giữa bước sản xuất")
    return results


# ---------------------------------------------------------------------------
# Batch chạy nền: cycle không phải chờ sản xuất xong mới được xếp lịch đăng
# ---------------------------------------------------------------------------

_running: Dict[int, threading.Thread] = {}
_running_lock = threading.Lock()
# Lần khởi động batch gần nhất của từng plan (monotonic). Dùng để xoay vòng: trước đây plan
# planned luôn đứng trước producing nên 3 slot bị plan mới chiếm mãi, plan cũ có video đã đủ
# ảnh (vox/folklore/mystery/newspaper chờ 12 ảnh AI) không được resume suốt nhiều giờ.
_last_launch: Dict[int, float] = {}


NOT_RARE = 10 ** 9


def matrix_env() -> Dict[str, str]:
    """Env cho tiến trình Node của Matrix: MATRIX_PRIORITY_ENGINES để pickEngine chọn thể loại ưu tiên."""
    env = dict(os.environ)
    env["MATRIX_PRIORITY_ENGINES"] = ",".join(store.get_priority_engines())
    # Thể loại đang dừng: pickEngine/topicEngine không chọn, không dùng làm engine dự phòng.
    env["MATRIX_BLOCKED_ENGINES"] = ",".join(store.get_publish_block_engines())
    return env


def priority_rank(engine: str, priority: Optional[List[str]] = None) -> Optional[int]:
    """Thể loại ưu tiên (config priority_engines) xếp trước mọi thể loại hiếm: số âm, cái đầu tiên nhỏ nhất."""
    priority = store.get_priority_engines() if priority is None else priority
    return -(len(priority) - priority.index(engine)) if engine in priority else None


def engine_output_counts() -> Dict[str, int]:
    """Số video đã làm xong (READY_TO_PUBLISH trở đi) theo engine_type."""
    finished = sorted(PRODUCTION_DONE_STATES - {"FAILED", "DEAD_LETTER"})
    try:
        conn = matrix_db._connect()
        try:
            rows = conn.execute(
                f"""SELECT engine_type, COUNT(*) FROM content_jobs
                    WHERE state IN ({','.join('?' for _ in finished)}) GROUP BY engine_type""",
                finished,
            ).fetchall()
        finally:
            conn.close()
    except Exception:  # DB Matrix chưa có
        return {}
    return {engine: count for engine, count in rows if engine}


def plan_rarity(plans: List[Dict[str, Any]], counts: Optional[Dict[str, int]] = None) -> Dict[int, int]:
    """plan_id → số video đã có của thể loại hiếm nhất mà plan còn job dở (NOT_RARE nếu không có).

    Thể loại "hiếm": ít hơn một nửa thể loại nhiều nhất (kinetic/science ra nhanh vì không cần
    ảnh AI; vox/folklore/mystery/newspaper cần 12 ảnh nên bị bỏ xa). Ưu tiên hiếm trước để kho
    video không toàn một thể loại; đếm lại mỗi lần nên tự cân bằng khi thể loại đó có thêm video.
    """
    counts = engine_output_counts() if counts is None else counts
    top = max(counts.values(), default=0)
    done = PRODUCTION_DONE_STATES | (set() if store.get_bool("auto_render") else {"READY_TO_RENDER"})
    priority = store.get_priority_engines()
    rarity: Dict[int, int] = {}
    for plan in plans:
        best = NOT_RARE
        if plan.get("batch_id"):
            try:
                jobs = matrix_db.list_batch_jobs(plan["batch_id"])
            except Exception:
                jobs = []
            for job in jobs:
                if job["state"] in done:
                    continue
                rank = priority_rank(job["engine_type"], priority)
                if rank is not None:
                    best = min(best, rank)
                    continue
                have = counts.get(job["engine_type"], 0)
                if have * 2 < top:
                    best = min(best, have)
        rarity[plan["id"]] = best
    return rarity


READY_STATES = {"RETRY_WAIT", "ASSET_QA"}


def ready_job_counts(plans: List[Dict[str, Any]]) -> Dict[int, int]:
    """plan_id → số job đã đủ ảnh AI (mọi task ảnh trong images.json đã completed) đang chờ dựng/render.

    Những job này chỉ đi tiếp khi batch của chúng được resume; trước đây chúng xếp hàng sau plan mới và
    batch chạy hàng giờ, nên hàng chục video đủ ảnh nằm ở RETRY_WAIT. Job không dùng ảnh AI không tính.
    """
    try:
        conn = sqlite3.connect(f"file:{store.DB_PATH}?mode=ro", uri=True, timeout=10)
        try:
            status = dict(conn.execute("SELECT id, status FROM image_queue").fetchall())
        finally:
            conn.close()
    except sqlite3.Error:
        return {}
    counts: Dict[int, int] = {}
    for plan in plans:
        if not plan.get("batch_id"):
            continue
        try:
            jobs = matrix_db.list_batch_jobs(plan["batch_id"])
        except Exception:
            continue
        ready = 0
        for job in jobs:
            if job["state"] not in READY_STATES:
                continue
            try:
                items = json.loads((store.PROJECTS_DIR / job["job_id"] / "images.json").read_text()).get("items", {})
            except (OSError, ValueError):
                continue
            tasks = [item.get("taskId") for item in items.values()]
            if tasks and all(status.get(task) == "completed" for task in tasks):
                ready += 1
        if ready:
            counts[plan["id"]] = ready
    return counts


def launch_order(plans: List[Dict[str, Any]], rarity: Optional[Dict[int, int]] = None,
                 ready: Optional[Dict[int, int]] = None) -> List[Dict[str, Any]]:
    """Plan có nhiều job đủ ảnh chờ render nhất trước; rồi thể loại ưu tiên/hiếm; rồi plan lâu chưa được chạy
    nhất; bằng nhau thì producing trước planned."""
    rarity = rarity or {}
    ready = ready or {}
    return sorted(plans, key=lambda p: (-ready.get(p["id"], 0), rarity.get(p["id"], NOT_RARE), _last_launch.get(p["id"], 0.0),
                                        0 if p.get("status") == "producing" else 1, p["id"]))


def running_plan_ids() -> set:
    with _running_lock:
        for plan_id in [pid for pid, thread in _running.items() if not thread.is_alive()]:
            del _running[plan_id]
        return set(_running)


def _run_in_background(plan: Dict[str, Any], should_halt: ShouldHalt) -> None:
    try:
        run_plan_item(plan, should_halt)
    except store.Halted:
        pass  # plan đã về planned, lượt sau resume
    except Exception as exc:  # không để lỗi lạ giết thread mà plan kẹt ở 'starting'
        store.update_plan(plan["id"], status="planned")
        store.log_event(f"❌ Batch {plan['niche_id']} lỗi bất ngờ, sẽ thử lại: {type(exc).__name__}: {exc}", "error")


def launch_pending_plans(should_halt: ShouldHalt = _never, today: Optional[str] = None) -> Dict[str, int]:
    """Khởi động batch cho plan đang chờ tới khi đủ max_concurrent_batches; không chờ chúng xong."""
    running = running_plan_ids()
    free = store.get_int("max_concurrent_batches") - len(running)
    launched = waiting = 0
    candidates = pending_plans(today)
    ready = ready_job_counts(candidates) if free > 0 else {}
    ordered = launch_order(candidates, plan_rarity(candidates) if free > 0 else {}, ready)
    # Plan mới: niche lâu chưa chạy nhất trước (chưa từng chạy = ""). Xếp theo id thì niche tạo sau luôn cuối
    # hàng rồi hết hạn cuối ngày — ocean_mysteries/philosophy_paradox (toàn bộ kênh ko/ja) chưa chạy lần nào.
    served = store.niche_last_started()
    is_new = lambda p: p.get("status") == "planned" and not ready.get(p["id"])  # noqa: E731
    fresh = iter(sorted((p for p in ordered if is_new(p)), key=lambda p: (served.get(p.get("niche_id"), ""), p["id"])))
    ordered = [next(fresh) if is_new(p) else p for p in ordered]
    # Giữ ít nhất một slot cho plan MỚI (planned): thể loại mới (survival/tierlist/wildlife/compare, engine mở
    # rộng) chỉ ra từ batch mới; nếu plan cũ còn job hiếm thì chúng chiếm hết slot và batch mới chờ mãi.
    new_ids = {p["id"] for p in store.get_plans_by_status("planned", "starting")}
    if not any(pid in new_ids for pid in running):
        first_new = next((p for p in ordered if is_new(p) and p["id"] not in running), None)
        if first_new:
            ordered.remove(first_new)
            ordered.insert(0, first_new)
    for plan in ordered:
        if plan["id"] in running:
            continue
        if free <= 0 or should_halt():
            waiting += 1
            continue
        thread = threading.Thread(target=_run_in_background, args=(plan, should_halt),
                                  name=f"autopilot-batch-{plan['niche_id']}", daemon=True)
        with _running_lock:
            _running[plan["id"]] = thread
            _last_launch[plan["id"]] = time.monotonic()
        thread.start()
        launched += 1
        free -= 1
    return {"launched": launched, "running": len(running) + launched, "waiting": waiting}


def wait_running(timeout: float = 30.0) -> bool:
    """Chờ các batch nền thoát (dùng khi dừng engine và trong test). True nếu đã thoát hết."""
    deadline = time.monotonic() + timeout
    for thread in list(_running.values()):
        thread.join(max(0.0, deadline - time.monotonic()))
    return not running_plan_ids()
