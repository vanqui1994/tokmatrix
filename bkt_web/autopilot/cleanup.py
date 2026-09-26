"""Dọn file nặng sau thời gian lưu: backup (có xác minh) rồi mới xoá, giữ metadata."""
from __future__ import annotations

import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from . import proc, store

try:
    from bkt_web import matrix_db
except ImportError:
    import matrix_db

ShouldHalt = Callable[[], bool]
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$")
# Task còn cần file MP4 (đang chờ, đang đăng, cần người kiểm tra).
ACTIVE_TASK_STATUSES = ("QUEUED", "PENDING", "UPLOADING", "WAITING_RENDER", "NEEDS_CHECK")
SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20"]
BACKUP_TIMEOUT_SECONDS = 600


def _never() -> bool:
    return False


# ---------------------------------------------------------------------------
# Disk
# ---------------------------------------------------------------------------

def disk_status() -> Dict[str, Any]:
    usage = shutil.disk_usage(store.COMPARE_DIR if store.COMPARE_DIR.exists() else store.ROOT)
    free_gb = round(usage.free / 1024 ** 3, 1)
    minimum = store.get_int("min_free_disk_gb")
    return {"free_gb": free_gb, "min_free_gb": minimum, "low": minimum > 0 and free_gb < minimum}


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def _inside(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def project_dir_for_slug(slug: str) -> Optional[Path]:
    """compare_studio/projects/<job_id> của job đã tạo video này (khớp chính xác, không glob)."""
    job = matrix_db.get_job_by_slug(slug)
    if not job or not SAFE_NAME.fullmatch(str(job["job_id"])):
        return None
    path = store.PROJECTS_DIR / job["job_id"]
    return path if _inside(path, store.PROJECTS_DIR) else None


def render_files(slug: str) -> List[Path]:
    renders = store.VIDEOS_DIR / slug / "renders"
    if not renders.is_dir() or not _inside(renders, store.VIDEOS_DIR):
        return []
    return sorted(renders.glob("*.mp4"))


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

def backup_to_vps(local_path: Path, slug: str, vps_host: str, vps_dir: str,
                  should_halt: ShouldHalt = _never) -> bool:
    """rsync lên VPS rồi đối chiếu kích thước file trên VPS. True chỉ khi khớp."""
    remote_path = f"{vps_dir.rstrip('/')}/{slug}/{local_path.name}"
    try:
        copied = proc.run(
            ["rsync", "-az", "--mkpath", "-e", "ssh " + " ".join(SSH_OPTS), str(local_path), f"{vps_host}:{remote_path}"],
            timeout=BACKUP_TIMEOUT_SECONDS, should_halt=should_halt,
        )
        if copied.returncode != 0:
            store.log_event(f"⚠️ rsync {slug}/{local_path.name} lỗi: {(copied.stderr or '').strip()[-300:]}", "warn")
            return False
        checked = proc.run(["ssh", *SSH_OPTS, vps_host, "stat", "-c", "%s", remote_path],
                           timeout=60, should_halt=should_halt)
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        store.log_event(f"⚠️ Backup {slug}/{local_path.name} lỗi: {exc}", "warn")
        return False
    remote_size = (checked.stdout or "").strip()
    if checked.returncode != 0 or remote_size != str(local_path.stat().st_size):
        store.log_event(f"⚠️ Backup {slug}/{local_path.name}: kích thước trên VPS ({remote_size or '?'}) không khớp", "warn")
        return False
    return True


# ---------------------------------------------------------------------------
# Upload tasks
# ---------------------------------------------------------------------------

def _mark_archived(task_ids: List[int]) -> None:
    conn = store.channels_db()
    try:
        conn.executemany("UPDATE upload_tasks SET archived_at=? WHERE id=?",
                         [(int(time.time()), task_id) for task_id in task_ids])
        conn.commit()
    finally:
        conn.close()


def _slug_still_needed(conn, slug: str, cutoff: int) -> bool:
    """Còn task khác cần MP4 này (chưa đăng xong, hoặc mới đăng chưa hết hạn lưu)."""
    marks = ",".join("?" for _ in ACTIVE_TASK_STATUSES)
    row = conn.execute(
        f"SELECT 1 FROM upload_tasks WHERE video_slug=? AND (status IN ({marks}) "
        "OR (status='SUCCESS' AND uploaded_at >= ?)) LIMIT 1",
        (slug, *ACTIVE_TASK_STATUSES, cutoff),
    ).fetchone()
    return row is not None


def _remove(paths: List[Path]) -> List[str]:
    errors = []
    for path in paths:
        try:
            if path.is_dir():
                shutil.rmtree(path)
            elif path.exists():
                path.unlink()
        except OSError as exc:
            errors.append(f"{path.name}: {exc}")
    return errors


def cleanup_posted_videos(should_halt: ShouldHalt = _never) -> Dict[str, Any]:
    """Video đã đăng thành công quá cleanup_after_days: backup VPS → xoá MP4 + projects/<job_id>."""
    if not store.get_bool("cleanup_enabled"):
        return {"skipped": True, "reason": "cleanup_enabled=false"}
    vps_host = store.get_config("archive_vps_host", "")
    vps_dir = store.get_config("archive_vps_dir", "/data/video-archive")
    if not vps_host and not store.get_bool("cleanup_without_backup"):
        return {"skipped": True,
                "reason": "chưa cấu hình archive_vps_host (bật cleanup_without_backup nếu chấp nhận xoá không backup)"}

    cutoff = int(time.time()) - store.get_int("cleanup_after_days") * 86400
    conn = store.channels_db()
    try:
        rows = conn.execute(
            "SELECT id, video_slug FROM upload_tasks WHERE status='SUCCESS' AND uploaded_at > 0 "
            "AND uploaded_at < ? AND COALESCE(archived_at, 0) = 0 AND COALESCE(video_slug, '') != ''",
            (cutoff,),
        ).fetchall()
        by_slug: Dict[str, List[int]] = {}
        for task_id, slug in rows:
            by_slug.setdefault(slug, []).append(task_id)
        needed = {slug for slug in by_slug if _slug_still_needed(conn, slug, cutoff)}
    finally:
        conn.close()

    archived = failed = kept = 0
    for slug, task_ids in by_slug.items():
        if should_halt():
            raise store.Halted("dừng giữa bước dọn dẹp")
        if not SAFE_NAME.fullmatch(slug):
            store.log_event(f"⚠️ Bỏ qua slug lạ khi dọn: {slug!r}", "warn")
            failed += 1
            continue
        if slug in needed:
            kept += 1
            continue
        mp4s = render_files(slug)
        if vps_host and not all(backup_to_vps(mp4, slug, vps_host, vps_dir, should_halt) for mp4 in mp4s):
            store.log_event(f"⚠️ Backup thất bại cho {slug}, giữ file local", "warn")
            failed += 1
            continue
        project = project_dir_for_slug(slug)
        errors = _remove(mp4s + ([project] if project else []))
        if errors:
            store.log_event(f"⚠️ Dọn {slug} chưa hết: {'; '.join(errors)[:300]}", "warn")
            failed += 1
            continue
        _mark_archived(task_ids)
        archived += 1
        if mp4s or project:
            store.log_event(f"🧹 Đã dọn {slug}: {'backup VPS + ' if vps_host else ''}xoá {len(mp4s)} MP4"
                            f"{' + project' if project else ''}")
    return {"archived": archived, "failed": failed, "kept": kept, "total_checked": len(by_slug)}


def cleanup_failed_jobs(should_halt: ShouldHalt = _never) -> Dict[str, Any]:
    """Job FAILED/DEAD_LETTER quá cleanup_failed_after_days mà chưa từng có task đăng: xoá MP4 + project tạm."""
    days = store.get_int("cleanup_failed_after_days")
    if days <= 0 or not store.get_bool("cleanup_enabled"):
        return {"skipped": True}
    jobs = matrix_db.list_jobs_in_states(("FAILED", "DEAD_LETTER"), updated_before=int(time.time()) - days * 86400)
    conn = store.channels_db()
    try:
        used = {
            job["video_slug"] for job in jobs
            if conn.execute(
                "SELECT 1 FROM upload_tasks WHERE video_slug=? AND status NOT IN ('ERROR','CANCELLED') LIMIT 1",
                (job["video_slug"],),
            ).fetchone()
        }
    finally:
        conn.close()
    cleaned = 0
    for job in jobs:
        if should_halt():
            raise store.Halted("dừng giữa bước dọn job lỗi")
        slug, job_id = job["video_slug"], str(job["job_id"])
        if slug in used or not SAFE_NAME.fullmatch(slug or "") or not SAFE_NAME.fullmatch(job_id):
            continue
        latest = matrix_db.get_job_by_slug(slug)
        if latest and latest["job_id"] != job_id:
            continue  # slug đã được job khác dùng lại

        project = store.PROJECTS_DIR / job_id
        targets = render_files(slug) + ([project] if project.exists() and _inside(project, store.PROJECTS_DIR) else [])
        if targets and not _remove(targets):
            cleaned += 1
    if cleaned:
        store.log_event(f"🧹 Dọn {cleaned} job lỗi quá {days} ngày")
    return {"cleaned": cleaned, "checked": len(jobs)}
