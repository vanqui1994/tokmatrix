"""Sơ đồ luồng live — số liệu từng bước của Autopilot, Đăng TikTok, Script Queue.

Chỉ đọc: mở các DB ở chế độ read-only, không ghi, không gọi mạng. Bố cục node
nằm ở static/flow_view.js; ở đây chỉ trả số liệu theo id node.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, HTTPException, Query

try:
    from bkt_web import autopilot
    from bkt_web import upload_states as us
except ImportError:
    import autopilot
    import upload_states as us

router = APIRouter(prefix="/api/flow", tags=["flow"])

BASE_DIR = Path(__file__).resolve().parent
MAIN_DB = BASE_DIR / "bkt_channels.db"
MATRIX_DB = BASE_DIR / "storage" / "matrix_factory.db"
AUTOPILOT_DB = BASE_DIR / "storage" / "autopilot.db"
SCRIPT_BRIDGE = Path(
    os.environ.get("TOKMATRIX_SCRIPT_BRIDGE_DIR", BASE_DIR / "storage" / "script_bridge")
).expanduser()
GENERATED_SCRIPTS = BASE_DIR / "storage" / "generated_scripts"
IMAGE_BRIDGE = BASE_DIR / "storage" / "antigravity_bridge"

ITEM_LIMIT = 40

# state của content_jobs là bước VỪA XONG; job đang chờ/chạy ở node kế tiếp.
MATRIX_STATE_NODE = {
    "CREATED": "script", "PLANNING": "script", "SCRIPTING": "script",
    "SCRIPT_QA": "assets", "ASSET_GENERATING": "assets", "ASSET_QA": "assets",
    "READY_TO_RENDER": "render", "RENDERING": "render", "VIDEO_QA": "render",
    "READY_TO_PUBLISH": "publish_check",
    "SCHEDULED": "scheduled", "PUBLISHED": "scheduled",
    "ANALYTICS_PENDING": "scheduled", "COMPLETED": "scheduled",
    "FAILED": "failed", "DEAD_LETTER": "failed",
}
MATRIX_STATE_LABEL = {
    "CREATED": "Chờ lập kế hoạch", "PLANNING": "Chờ viết kịch bản", "SCRIPTING": "Chờ QA kịch bản",
    "SCRIPT_QA": "Chờ tạo ảnh + TTS", "ASSET_GENERATING": "Chờ QA tài nguyên",
    "ASSET_QA": "Chờ dựng project", "READY_TO_RENDER": "Chờ duyệt render",
    "RENDERING": "Chờ render MP4", "VIDEO_QA": "Chờ QA video",
    "READY_TO_PUBLISH": "Chờ kiểm tra đăng", "SCHEDULED": "Đã lên lịch",
    "PUBLISHED": "Đã đăng", "ANALYTICS_PENDING": "Chờ thống kê", "COMPLETED": "Hoàn tất",
    "RETRY_WAIT": "Chờ thử lại", "FAILED": "Lỗi", "DEAD_LETTER": "Bỏ (dead letter)",
}


def _ro(path: Path) -> Optional[sqlite3.Connection]:
    if not path.exists():
        return None
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _rows(conn: Optional[sqlite3.Connection], sql: str, params: Iterable[Any] = ()) -> List[Dict[str, Any]]:
    if conn is None:
        return []
    try:
        return [dict(r) for r in conn.execute(sql, tuple(params)).fetchall()]
    except sqlite3.OperationalError:
        # Bảng/cột chưa có (DB mới, chưa migrate) → coi như rỗng.
        return []


def _thread_alive(name: str) -> bool:
    return any(t.name == name and t.is_alive() for t in threading.enumerate())


def _count_files(folder: Path, pattern: str = "*.json") -> int:
    try:
        return sum(1 for _ in folder.glob(pattern))
    except OSError:
        return 0


def _node(**counts: int) -> Dict[str, Any]:
    return {"counts": {k: int(v) for k, v in counts.items()}, "items": [], "note": ""}


def _bump(node: Dict[str, Any], key: str, n: int = 1) -> None:
    node["counts"][key] = node["counts"].get(key, 0) + n


def _add_item(node: Dict[str, Any], item: Dict[str, Any]) -> None:
    if len(node["items"]) < ITEM_LIMIT:
        node["items"].append(item)


# ---------------------------------------------------------------------------
# Autopilot
# ---------------------------------------------------------------------------

def _publish_hold_reason(job: Dict[str, Any], min_lead_hours: int, now: int) -> Optional[str]:
    """Video đã xong đang chờ theo lịch: giữ đăng toàn hệ thống, acc đang ngâm, hoặc chưa đủ min_lead_hours."""
    try:
        tiktok_id = autopilot.channels.get_tiktok_for_matrix(job["channel_id"])
        reason = autopilot.publisher.publish_wait_reason(tiktok_id) if tiktok_id else None
    except Exception:
        reason = None
    ready_at = int(job.get("updated_at") or 0)
    if not reason and min_lead_hours and ready_at + min_lead_hours * 3600 > now:
        reason = (f"video làm trước lịch đăng {min_lead_hours}h — xếp lịch sớm nhất "
                  f"{time.strftime('%d/%m %H:%M', time.localtime(ready_at + min_lead_hours * 3600))}")
    return reason


def autopilot_snapshot(hours: int) -> Dict[str, Any]:
    now = int(time.time())
    since = now - hours * 3600
    status = autopilot.engine_snapshot()
    adb = _ro(AUTOPILOT_DB)
    mdb = _ro(MATRIX_DB)
    main = _ro(MAIN_DB)
    try:
        cfg = {r["key"]: r["value"] for r in _rows(adb, "SELECT key, value FROM autopilot_config")}
        enabled = cfg.get("enabled", "false") == "true"
        daemon = _thread_alive("autopilot-daemon")

        nodes: Dict[str, Dict[str, Any]] = {k: _node() for k in (
            "trigger", "plan", "batch", "script", "script_ai", "registry", "assets", "images", "tts",
            "render", "publish_check", "scheduled", "blocked", "failed", "upload", "cleanup",
        )}

        trig = nodes["trigger"]
        paused = bool(status.get("paused"))
        trig["state"] = "running" if (enabled and daemon and not paused) else ("idle" if daemon else "off")
        trig["note"] = (
            f"{'Tạm dừng' if paused else 'Đang bật' if enabled else 'Đang tắt'} · chu kỳ {cfg.get('check_interval_seconds', '3600')}s"
            + (f" · lần chạy cuối {status.get('last_cycle')}" if status.get("last_cycle") else "")
        )
        trig["meta"] = {"enabled": enabled, "paused": paused, "state": status.get("state"),
                        "current_step": status.get("current_step"),
                        "daemon_alive": daemon, "last_cycle": status.get("last_cycle"),
                        "last_error": status.get("last_error")}
        if status.get("last_error"):
            trig["error"] = str(status["last_error"])[:300]
        try:
            batches = len(autopilot.planner.running_plan_ids())
        except Exception:
            batches = 0
        hold = int(float(cfg.get("publish_hold_until", "0") or 0))
        trig["note"] += f" · {batches} batch chạy nền" + (
            f" · giữ đăng tới {time.strftime('%d/%m %H:%M', time.localtime(hold))}" if hold > now else "")

        # Kế hoạch ngày (autopilot_plans)
        since_date = time.strftime("%Y-%m-%d", time.localtime(since))
        plans = _rows(adb, "SELECT * FROM autopilot_plans WHERE plan_date >= ? ORDER BY id DESC", (since_date,))
        for p in plans:
            _bump(nodes["plan"], p["status"] or "planned")
            _add_item(nodes["plan"], {
                "id": p["id"], "title": p["topic"] or "(chưa có topic)",
                "sub": f"{p['plan_date']} · {p['niche_id']} · {p.get('channel_count') or 0} kênh",
                "status": p["status"], "error": p.get("error_message") or "",
            })
        plan_batches = {p["batch_id"] for p in plans if p.get("batch_id")}

        # Batch Matrix
        batches = _rows(mdb, "SELECT * FROM batches WHERE batch_id LIKE 'autopilot-%' AND created_at >= ? "
                             "ORDER BY created_at DESC", (since,))
        for b in batches:
            _bump(nodes["batch"], b["status"] or "RUNNING")
            _add_item(nodes["batch"], {
                "id": b["batch_id"], "title": b["batch_id"],
                "sub": f"{b['completed_jobs']}/{b['total_jobs']} xong · {b['failed_jobs']} lỗi",
                "status": b["status"],
            })
        running_plans = sum(1 for p in plans if p["status"] == "producing" and not p.get("batch_id"))
        if running_plans:
            _bump(nodes["batch"], "starting", running_plans)

        # Job theo bước
        stale_after = int(float(cfg.get("check_interval_seconds", "3600"))) + 300
        jobs = _rows(mdb, """
            SELECT job_id, batch_id, channel_id, state, resume_state, video_slug, locked_by, retry_count,
                   max_retries, error_message, current_scene_index, total_scenes, updated_at, next_retry_at
            FROM content_jobs
            WHERE batch_id LIKE 'autopilot-%'
              AND (state NOT IN ('COMPLETED','FAILED','DEAD_LETTER','SCHEDULED','PUBLISHED','ANALYTICS_PENDING')
                   OR updated_at >= ?)
            ORDER BY updated_at DESC
        """, (since,))
        min_lead = int(float(cfg.get("min_lead_hours", "0") or 0))
        for j in jobs:
            state = j["state"]
            effective = j["resume_state"] if state == "RETRY_WAIT" and j.get("resume_state") else state
            node_id = MATRIX_STATE_NODE.get(effective, "failed")
            hold_reason = _publish_hold_reason(j, min_lead, now) if node_id == "publish_check" else None
            if node_id == "publish_check" and not hold_reason and (j.get("updated_at") or now) < now - stale_after:
                node_id = "blocked"  # đã qua ít nhất một chu kỳ mà vẫn chưa được lên lịch
            node = nodes[node_id]
            if hold_reason:
                key = "held"  # đang chờ theo lịch (giữ đăng / ngâm acc / làm trước 24h), không phải lỗi
            elif node_id == "blocked":
                key = "blocked"
            elif state == "RETRY_WAIT":
                key = "retry"
            elif node_id in ("scheduled",):
                key = "done"
            elif node_id == "failed":
                key = "failed"
            elif j.get("locked_by"):
                key = "running"
            else:
                key = "waiting"
            _bump(node, key)
            node.setdefault("by_state", {})
            node["by_state"][state] = node["by_state"].get(state, 0) + 1
            _add_item(node, {
                "id": j["job_id"], "title": j["video_slug"] or j["job_id"],
                "sub": f"{j['channel_id']} · {MATRIX_STATE_LABEL.get(state, state)}"
                       + (f" · cảnh {j['current_scene_index']}/{j['total_scenes']}" if node_id == "assets" else "")
                       + (f" · thử lại {j['retry_count']}/{j['max_retries']}" if j.get("retry_count") else ""),
                "status": key, "error": hold_reason or j.get("error_message") or "", "ts": j.get("updated_at"),
            })

        # Sub-node: Antigravity image queue + bridge
        img = nodes["images"]
        for r in _rows(main, "SELECT status, COUNT(*) n FROM image_queue "
                             "WHERE engine IN ('antigravity','antigravity_queue') GROUP BY status"):
            key = {"pending": "waiting", "processing": "running", "completed": "done", "failed": "failed"}.get(
                r["status"], r["status"])
            if key == "done":
                continue  # tổng tích lũy, không phải việc đang có
            _bump(img, key, r["n"])
        img["meta"] = {"inbox": _count_files(IMAGE_BRIDGE / "inbox"),
                       "outbox": _count_files(IMAGE_BRIDGE / "outbox")}
        img["note"] = f"Bridge inbox {img['meta']['inbox']} · outbox {img['meta']['outbox']}"
        for r in _rows(main, "SELECT id, prompt, status, error_message FROM image_queue "
                             "WHERE engine IN ('antigravity','antigravity_queue') AND status IN ('pending','processing','failed') "
                             "ORDER BY created_ts DESC LIMIT ?", (ITEM_LIMIT,)):
            _add_item(img, {"id": r["id"], "title": (r["prompt"] or "")[:90], "status": r["status"],
                            "error": r["error_message"] or ""})
        voiced = _rows(mdb, "SELECT COUNT(*) n FROM scene_artifacts WHERE artifact_type='narration' AND created_at >= ?",
                       (now - 3600,))
        voiced_n = voiced[0]["n"] if voiced else 0
        if voiced_n:
            _bump(nodes["tts"], "done", voiced_n)
        nodes["tts"]["note"] = (f"{voiced_n} đoạn giọng đọc trong 1 giờ qua · "
                                "đo thời lượng TTS thật cho từng câu (cache theo text + engine + giọng + vai)")
        nodes["script_ai"]["note"] = "generateScript theo ngôn ngữ của kênh"
        nodes["registry"]["note"] = "content_registry — chặn kịch bản trùng lặp giữa các kênh"
        hold_until = int(float(cfg.get("publish_hold_until", "0") or 0))
        nodes["publish_check"]["note"] = (
            (f"Đang giữ đăng tới {time.strftime('%d/%m %H:%M', time.localtime(hold_until))} · " if hold_until > now else "")
            + (f"video làm trước lịch đăng ≥ {min_lead}h · " if min_lead else "")
            + "map kênh 1:1 · đúng niche · đúng ngôn ngữ/giọng · còn slot trong 7 ngày")
        nodes["blocked"]["note"] = ("Job nằm ở READY_TO_PUBLISH quá một chu kỳ mà chưa được lên lịch "
                                    "(sai niche/ngôn ngữ, chưa map kênh hoặc hết slot) — xem log Autopilot")

        # Upload tasks sinh ra từ Autopilot
        up = nodes["upload"]
        for r in _rows(main, "SELECT status, COUNT(*) n FROM upload_tasks WHERE run_id LIKE 'autopilot-%' "
                             "AND (status NOT IN (?,?) OR created_at >= ?) GROUP BY status",
                       (us.SUCCESS, us.CANCELLED, since)):
            _bump(up, r["status"], r["n"])

        # Dọn dẹp
        cl = nodes["cleanup"]
        archived = _rows(main, "SELECT COUNT(*) n FROM upload_tasks WHERE COALESCE(archived_at, 0) > 0")
        _bump(cl, "done", archived[0]["n"] if archived else 0)
        success_old = _rows(main, "SELECT COUNT(*) n FROM upload_tasks WHERE status=? AND uploaded_at > 0 "
                                  "AND uploaded_at < ? AND COALESCE(archived_at, 0) = 0",
                            (us.SUCCESS, now - int(float(cfg.get("cleanup_after_days", "2")) * 86400),))
        pending_cleanup = success_old[0]["n"] if success_old else 0
        if pending_cleanup:
            _bump(cl, "waiting", pending_cleanup)
            if not cfg.get("archive_vps_host") and cfg.get("cleanup_without_backup", "false") != "true":
                cl["warning"] = (f"{pending_cleanup} video đã đăng quá hạn đang chờ dọn nhưng chưa cấu hình "
                                 "archive_vps_host (hoặc bật cleanup_without_backup).")
        cl["note"] = f"Sau {cfg.get('cleanup_after_days', '2')} ngày: backup VPS rồi xoá MP4/project local"

        logs = autopilot.recent_logs(60)
        return {
            "flow": "autopilot", "generated_at": now, "window_hours": hours, "nodes": nodes,
            "workers": {"autopilot-daemon": daemon, "enabled": enabled},
            "logs": logs, "plan_batches": sorted(plan_batches),
            "sources": {"matrix_db": MATRIX_DB.exists(), "autopilot_db": AUTOPILOT_DB.exists()},
        }
    finally:
        for c in (adb, mdb, main):
            if c is not None:
                c.close()


# ---------------------------------------------------------------------------
# Đăng TikTok
# ---------------------------------------------------------------------------

UPLOAD_STATUS_NODE = {
    "WAITING_RENDER": "wait_render",
    "QUEUED": "queue", "PENDING": "queue",
    "UPLOADING": "uploading",
    "SUCCESS": "success",
    "NEEDS_CHECK": "needs_check",
    "ERROR": "error", "FAILED": "error",
    "CANCELLED": "cancelled",
}


def publish_snapshot(hours: int) -> Dict[str, Any]:
    now = int(time.time())
    since = now - hours * 3600
    main = _ro(MAIN_DB)
    try:
        nodes: Dict[str, Dict[str, Any]] = {k: _node() for k in (
            "source", "channel", "preflight", "wait_render", "queue", "uploading", "profile", "vpn", "cookie", "browser",
            "confirm", "success", "needs_check", "verifier", "error", "cancelled",
        )}
        tasks = _rows(main, """
            SELECT t.id, t.channel_id, t.status, t.schedule_time, t.created_at, t.uploaded_at, t.error_message,
                   t.attempt_count, t.next_retry_at, t.started_at, t.run_id, t.video_slug, t.video_path,
                   t.clicked_post_at, t.result_url, c.username, c.country, c.vpn_location,
                   COALESCE(t.publish_mode,''), COALESCE(t.verify_note,''), COALESCE(t.next_verify_at,0), COALESCE(t.published_video_id,'')
            FROM upload_tasks t LEFT JOIN channels c ON c.id = t.channel_id
            WHERE t.status NOT IN ('SUCCESS','CANCELLED') OR t.created_at >= ? OR t.uploaded_at >= ?
            ORDER BY COALESCE(NULLIF(t.started_at, 0), t.schedule_time, t.created_at) DESC
        """, (since, since))
        src = nodes["source"]
        for t in tasks:
            status = (t["status"] or "PENDING").upper()
            node_id = UPLOAD_STATUS_NODE.get(status, "error")
            node = nodes[node_id]
            origin = "Autopilot" if (t.get("run_id") or "").startswith("autopilot-") else (
                "Matrix/Xưởng" if t.get("run_id") else "Thủ công")
            if (t.get("created_at") or 0) >= since:
                _bump(src, origin)
            if node_id == "queue":
                if "Profile đang mở" in (t.get("error_message") or "") and (t.get("next_retry_at") or 0) > now:
                    key = "deferred"
                elif (t.get("next_retry_at") or 0) > now:
                    key = "retry"
                elif (t.get("schedule_time") or 0) <= now:
                    key = "due"
                else:
                    key = "scheduled"
            elif node_id == "uploading":
                key = "running"
            else:
                key = status
            _bump(node, key)
            when = t.get("uploaded_at") or t.get("started_at") or t.get("schedule_time") or t.get("created_at")
            _add_item(node, {
                "id": t["id"], "title": t.get("video_slug") or Path(t.get("video_path") or "").name or f"Task #{t['id']}",
                "sub": f"@{t.get('username') or t['channel_id']} · {t.get('country') or '--'} · {origin}"
                       + (f" · lần {t['attempt_count']}" if t.get("attempt_count") else ""),
                "status": key, "error": t.get("error_message") or "", "ts": when,
                "url": t.get("result_url") or "",
            })
            if t.get("publish_mode") == "profile": _bump(nodes["profile"], "profile")
            elif t.get("publish_mode") == "clean": _bump(nodes["profile"], "clean")
            if t.get("verify_note") or t.get("next_verify_at") or t.get("published_video_id"):
                _bump(nodes["verifier"], "waiting" if t.get("next_verify_at") else ("found" if t.get("published_video_id") else "manual"))
        uploading = nodes["uploading"]["counts"].get("running", 0)
        for sub in ("vpn", "cookie", "browser"):
            if uploading:
                nodes[sub]["state"] = "running"
        nodes["channel"]["note"] = "Chọn kênh tường minh — không bao giờ tự chọn; kênh phải có cookie"
        nodes["preflight"]["note"] = "Không còn ảnh placeholder trong images.json · có MP4 mới hơn lần render"
        nodes["vpn"]["note"] = "WireGuard SOCKS5 theo vpn_config của kênh"
        nodes["cookie"]["note"] = "Giải mã cookie đã lưu của kênh"
        nodes["browser"]["note"] = "Playwright mở TikTok Studio → tải MP4 → điền caption → nhãn AI"
        try:
            from bkt_web import profile_session
            nodes["profile"]["note"] = f"publish_profile_channels={profile_session.get_setting('publish_profile_channels','')} · bận={len(profile_session.busy_channels())}"
            nodes["profile"]["counts"]["busy"] = len(profile_session.busy_channels())
        except Exception: pass
        nodes["verifier"]["note"] = "Chỉ đọc chocode; nhiều ứng viên hoặc hết lịch thì giữ NEEDS_CHECK"
        nodes["confirm"]["note"] = "Đã bấm Đăng: thấy xác nhận → SUCCESS; không thấy → NEEDS_CHECK (không tự thử lại)"
        nodes["queue"]["note"] = "Scheduler quét 3s/lần; lỗi thì chờ 60·2ⁿ giây, tối đa 3 lần"
        return {
            "flow": "publish", "generated_at": now, "window_hours": hours, "nodes": nodes,
            "workers": {"upload-scheduler": _thread_alive("upload-scheduler")},
        }
    finally:
        if main is not None:
            main.close()


# ---------------------------------------------------------------------------
# Script Queue
# ---------------------------------------------------------------------------

def scripts_snapshot(hours: int) -> Dict[str, Any]:
    now = int(time.time())
    since = now - hours * 3600
    main = _ro(MAIN_DB)
    try:
        nodes: Dict[str, Dict[str, Any]] = {k: _node() for k in (
            "enqueue", "pending", "processing", "inbox", "agent", "outbox", "completed", "failed",
        )}
        rows = _rows(main, """
            SELECT id, video_type, lang, status, worker_id, attempt_count, error_message, prompt,
                   script_filename, created_ts, updated_at, completed_at
            FROM script_queue
            WHERE status IN ('pending','processing','failed') OR created_ts >= ?
            ORDER BY created_ts DESC
        """, (since,))
        for r in rows:
            status = r["status"] or "pending"
            node_id = status if status in nodes else "failed"
            if (r.get("created_ts") or 0) >= since:
                _bump(nodes["enqueue"], r["video_type"] or "khác")
            key = {"pending": "waiting", "processing": "running", "completed": "done", "failed": "failed"}.get(status, status)
            _bump(nodes[node_id], key)
            _add_item(nodes[node_id], {
                "id": r["id"], "title": (r.get("prompt") or r["id"])[:100],
                "sub": f"{r['video_type']} · {r['lang']}"
                       + (f" · {r['worker_id']}" if r.get("worker_id") else "")
                       + (f" · lỗi {r['attempt_count']} lần" if r.get("attempt_count") else ""),
                "status": key, "error": r.get("error_message") or "", "ts": r.get("created_ts"),
            })
        inbox = _count_files(SCRIPT_BRIDGE / "inbox", "*.json")
        outbox = _count_files(SCRIPT_BRIDGE / "outbox", "*.json")
        _bump(nodes["inbox"], "waiting", inbox)
        _bump(nodes["outbox"], "waiting", outbox)
        nodes["inbox"]["note"] = f"{SCRIPT_BRIDGE / 'inbox'} — bundle .json + .md cho agent"
        nodes["outbox"]["note"] = "watch/import_outbox_once gọi /complete rồi chuyển file vào archive/"
        nodes["agent"]["note"] = "Antigravity đọc .md trong inbox, viết JSON vào outbox"
        nodes["completed"]["note"] = f"Lưu {GENERATED_SCRIPTS.name}/<id>.json · tổng {_count_files(GENERATED_SCRIPTS)} file"
        if nodes["processing"]["counts"].get("running"):
            nodes["agent"]["state"] = "running"
        return {"flow": "scripts", "generated_at": now, "window_hours": hours, "nodes": nodes, "workers": {}}
    finally:
        if main is not None:
            main.close()


SNAPSHOTS = {"autopilot": autopilot_snapshot, "publish": publish_snapshot, "scripts": scripts_snapshot}


@router.get("/{flow_id}")
def flow_snapshot(flow_id: str, hours: int = Query(48, ge=1, le=24 * 30)) -> Dict[str, Any]:
    fn = SNAPSHOTS.get(flow_id)
    if fn is None:
        raise HTTPException(status_code=404, detail="Không có luồng này")
    return fn(hours)
