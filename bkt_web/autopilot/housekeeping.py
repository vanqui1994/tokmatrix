"""Dọn dung lượng định kỳ (26/09: đĩa VPS mất ~16 GB/ngày, không có cơ chế nào dọn).

Chạy trong cycle Autopilot, tối đa mỗi `housekeeping_interval_minutes` một lần. Mỗi mục có config riêng
(0 = tắt):

- bridge_archive_keep_hours (12): antigravity_bridge/archive là bản gốc bị chuyển vào SAU KHI ảnh đã nhập
  vào static/generated_images → bản sao thuần, không ai đọc lại.
- generated_images_keep_days (1): ảnh trong static/generated_images cũ hơn ngần này ngày VÀ đã có bản giống
  hệt (cùng kích thước + md5) trong compare_studio/videos/*/assets. Ảnh chưa có ở video nào thì giữ.
- purge_posted_after_days (3): video đã đăng SUCCESS quá ngần này ngày, không còn task nào khác cần:
  xoá MP4, assets, projects/<job_id>; GIỮ meta.json/index.html/images.json và vân tay (so trùng vẫn so được).
- npx_keep_versions (2): cache npx của HyperFrames — giữ N phiên bản mới nhất, bản code ghim cứng
  (hyperframes@X.Y.Z trong compare_studio/matrix/render, tools) và mọi bản/thư mục đang chạy.
- profile_blob_keep_hours (24): bản sao video TikTok Chrome giữ lại sau upload (Default/blob_storage,
  Default/IndexedDB/*.indexeddb.blob) — 29/09 chiếm 19/21 GB của bkt_web/profiles. Chỉ xoá file cũ hơn ngần này giờ,
  bỏ qua profile đang có Chrome mở (--user-data-dir); cookie đăng nhập ở file khác nên acc không bị đăng xuất.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from . import store

BASE_DIR = Path(__file__).resolve().parent.parent
BRIDGE_ARCHIVE = BASE_DIR / "storage" / "antigravity_bridge" / "archive"
GENERATED_IMAGES = BASE_DIR / "static" / "generated_images"
PROFILES_DIR = BASE_DIR / "profiles"
NPX_DIR = Path(os.environ.get("npm_config_cache", str(Path.home() / ".npm"))) / "_npx"
KEEP_IN_VIDEO = {"meta.json", "index.html", "images.json", "spec.json", "package.json", "hyperframes.json"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
_last_run = 0.0


def _int(key: str, default: int) -> int:
    try:
        return int(store.get_config(key, str(default)))
    except ValueError:
        return default


def _size_of(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def _remove(path: Path) -> int:
    try:
        size = _size_of(path)
        shutil.rmtree(path) if path.is_dir() else path.unlink()
        return size
    except OSError:
        return 0


def clean_bridge_archive(keep_hours: int, now: float) -> Dict[str, int]:
    if keep_hours <= 0 or not BRIDGE_ARCHIVE.is_dir():
        return {"files": 0, "bytes": 0}
    cutoff = now - keep_hours * 3600
    files = freed = 0
    for path in BRIDGE_ARCHIVE.iterdir():
        if path.is_file() and path.stat().st_mtime < cutoff:
            freed += _remove(path)
            files += 1
    return {"files": files, "bytes": freed}


def _md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_generated_images(keep_days: int, now: float) -> Dict[str, int]:
    """Chỉ xoá ảnh đã có bản sao y hệt trong một thư mục video (lọc theo kích thước trước, md5 sau)."""
    if keep_days <= 0 or not GENERATED_IMAGES.is_dir():
        return {"files": 0, "bytes": 0, "kept_unique": 0}
    cutoff = now - keep_days * 86400
    candidates = [p for p in GENERATED_IMAGES.iterdir()
                  if p.is_file() and p.suffix.lower() in IMAGE_EXTS and p.stat().st_mtime < cutoff]
    if not candidates:
        return {"files": 0, "bytes": 0, "kept_unique": 0}
    sizes = {p.stat().st_size for p in candidates}
    copies: Dict[int, List[Path]] = {}
    for path in store.VIDEOS_DIR.glob("*/assets/**/*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            size = path.stat().st_size
            if size in sizes:
                copies.setdefault(size, []).append(path)
    hashed: Dict[Path, str] = {}
    files = freed = unique = 0
    for image in candidates:
        same_size = copies.get(image.stat().st_size, [])
        if not same_size:
            unique += 1
            continue
        digest = _md5(image)
        if any(hashed.setdefault(copy, _md5(copy)) == digest for copy in same_size):
            freed += _remove(image)
            files += 1
        else:
            unique += 1
    return {"files": files, "bytes": freed, "kept_unique": unique}


def purge_posted_media(after_days: int, now: float, should_halt: Callable[[], bool]) -> Dict[str, int]:
    if after_days <= 0:
        return {"videos": 0, "bytes": 0}
    from bkt_web import video_fingerprint as vf
    from . import cleanup

    cutoff = int(now - after_days * 86400)
    conn = store.channels_db()
    try:
        rows = conn.execute(
            "SELECT id, video_slug FROM upload_tasks WHERE status='SUCCESS' AND uploaded_at > 0 AND uploaded_at < ? "
            "AND COALESCE(archived_at,0)=0 AND COALESCE(video_slug,'')<>''", (cutoff,)).fetchall()
        busy = {slug for _, slug in rows if cleanup._slug_still_needed(conn, slug, cutoff)}
        busy |= {r[0] for r in conn.execute("SELECT video_slug FROM upload_tasks WHERE status='ERROR'")}
    finally:
        conn.close()
    by_slug: Dict[str, List[int]] = {}
    for task_id, slug in rows:
        by_slug.setdefault(slug, []).append(task_id)
    fp_conn = vf.connect()
    videos = freed = 0
    for slug, task_ids in by_slug.items():
        if should_halt():
            raise store.Halted("dừng giữa bước dọn video đã đăng")
        if slug in busy or not re.fullmatch(r"[A-Za-z0-9._-]+", slug):
            continue
        video_dir = store.VIDEOS_DIR / slug
        if not video_dir.is_dir():
            cleanup._mark_archived(task_ids)
            continue
        try:
            vf.get_or_compute(fp_conn, slug)  # giữ vân tay trước khi xoá MP4 (so trùng về sau)
        except Exception as exc:
            store.log_event(f"⚠️ Chưa dọn {slug}: không lấy được vân tay ({exc})", "warn")
            continue
        for child in list(video_dir.iterdir()):
            if child.name not in KEEP_IN_VIDEO:
                freed += _remove(child)
        project = cleanup.project_dir_for_slug(slug)
        if project and project.exists():
            freed += _remove(project)
        cleanup._mark_archived(task_ids)
        videos += 1
    return {"videos": videos, "bytes": freed}


def _npx_version(entry: Path) -> Optional[tuple]:
    try:
        wanted = json.loads((entry / "package.json").read_text()).get("dependencies", {}).get("hyperframes", "")
    except (OSError, ValueError):
        return None
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", wanted)
    return tuple(int(x) for x in match.groups()) if match else None


VERSION_RE = re.compile(r"hyperframes@(\d+)\.(\d+)\.(\d+)")
PINNED_SOURCES = ("compare_studio/matrix/render", "compare_studio/tools")


def _npx_in_use() -> Set[str]:
    """Thư mục _npx/<hash> và phiên bản hyperframes@X.Y.Z xuất hiện trong lệnh của tiến trình đang chạy."""
    used: Set[str] = set()
    proc = Path("/proc")
    if not proc.is_dir():
        return used
    for pid in proc.iterdir():
        if not pid.name.isdigit():
            continue
        try:
            cmd = (pid / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "ignore")
        except OSError:
            continue
        used.update(m.group(1) for m in re.finditer(r"_npx/([0-9a-f]{16})", cmd))
        used.update(".".join(m.groups()) for m in VERSION_RE.finditer(cmd))
    return used


def _pinned_versions() -> Set[tuple]:
    """Phiên bản code đang ghim cứng (vd chalk/adapter: hyperframes@0.7.58) — xoá đi thì lần render sau cài lại."""
    pinned: Set[tuple] = set()
    for folder in PINNED_SOURCES:
        for path in (BASE_DIR.parent / folder).glob("*.mjs"):
            try:
                pinned.update(tuple(int(x) for x in m.groups()) for m in VERSION_RE.finditer(path.read_text("utf-8", "ignore")))
            except OSError:
                continue
    return pinned


def clean_npx(keep_versions: int) -> Dict[str, int]:
    """Giữ N phiên bản mới nhất + bản code ghim + bản/thư mục đang chạy; xoá các bản cũ còn lại."""
    if keep_versions <= 0 or not NPX_DIR.is_dir():
        return {"dirs": 0, "bytes": 0}
    in_use = _npx_in_use()
    entries = [(v, e) for e in NPX_DIR.iterdir() if e.is_dir() for v in [_npx_version(e)] if v]
    keep = set(sorted({v for v, _ in entries}, reverse=True)[:keep_versions]) | _pinned_versions()
    keep |= {tuple(int(x) for x in item.split(".")) for item in in_use if "." in item}
    dirs = freed = 0
    for version, entry in entries:
        if version in keep or entry.name in in_use:
            continue
        freed += _remove(entry)
        dirs += 1
    return {"dirs": dirs, "bytes": freed}


def _profiles_in_use() -> Set[str]:
    """Tên thư mục profile mà một tiến trình Chrome đang mở (--user-data-dir=.../profiles/<tên>)."""
    used: Set[str] = set()
    proc = Path("/proc")
    if not proc.is_dir():
        return used
    for pid in proc.iterdir():
        if not pid.name.isdigit():
            continue
        try:
            cmd = (pid / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "ignore")
        except OSError:
            continue
        used.update(m.group(1) for m in re.finditer(r"--user-data-dir=\S*/profiles/([^/\s]+)", cmd))
    return used


def clean_profile_blobs(keep_hours: int, now: float, root: Optional[Path] = None, in_use: Optional[Set[str]] = None) -> Dict[str, int]:
    """Xoá blob upload cũ (> keep_hours) của các profile Chrome không mở; giữ cookie, Local Storage, IndexedDB leveldb."""
    root = PROFILES_DIR if root is None else root
    if keep_hours <= 0 or not root.is_dir():
        return {"files": 0, "bytes": 0}
    in_use = _profiles_in_use() if in_use is None else in_use
    cutoff = now - keep_hours * 3600
    files = freed = 0
    for profile in root.iterdir():
        if not profile.is_dir() or profile.name in in_use:
            continue
        default = profile / "Default"
        targets = [default / "blob_storage", *(default / "IndexedDB").glob("*.indexeddb.blob")]
        for target in targets:
            if not target.is_dir():
                continue
            for item in target.rglob("*"):
                try:
                    if item.is_file() and item.stat().st_mtime < cutoff:
                        size = item.stat().st_size
                        item.unlink()
                        files += 1
                        freed += size
                except OSError:
                    continue
    return {"files": files, "bytes": freed}


def run(should_halt: Callable[[], bool] = lambda: False, now: Optional[float] = None, force: bool = False) -> Dict[str, Any]:
    global _last_run
    now = time.time() if now is None else now
    interval = _int("housekeeping_interval_minutes", 60) * 60
    if not force and now - _last_run < interval:
        return {"skipped": True}
    _last_run = now
    result: Dict[str, Any] = {}
    for name, fn in (
        ("bridge_archive", lambda: clean_bridge_archive(_int("bridge_archive_keep_hours", 12), now)),
        ("generated_images", lambda: clean_generated_images(_int("generated_images_keep_days", 1), now)),
        ("posted_media", lambda: purge_posted_media(_int("purge_posted_after_days", 3), now, should_halt)),
        ("npx", lambda: clean_npx(_int("npx_keep_versions", 2))),
        ("profile_blobs", lambda: clean_profile_blobs(_int("profile_blob_keep_hours", 24), now)),
    ):
        try:
            result[name] = fn()
        except store.Halted:
            raise
        except Exception as exc:  # một mục lỗi không chặn các mục khác
            result[name] = {"error": f"{type(exc).__name__}: {exc}"}
    freed = sum(v.get("bytes", 0) for v in result.values() if isinstance(v, dict))
    if freed:
        store.log_event(f"🧹 Dọn dung lượng: giải phóng {freed / 1e9:.2f} GB — " + ", ".join(
            f"{k}: {v.get('files', v.get('videos', v.get('dirs', 0)))}" for k, v in result.items() if isinstance(v, dict) and v.get("bytes")))
    result["freed_bytes"] = freed
    return result
