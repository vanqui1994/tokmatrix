"""Tải video từ nền tảng khác (TikTok qua chocode → tikwm, Kuaishou, link trực tiếp) và biên tập/render lại bằng ffmpeg."""

from __future__ import annotations

import ipaddress
import re
import secrets
import socket
import subprocess
import threading
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from curl_cffi import requests
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict, Field
try:
    from bkt_web import chocode_tiktok, multi_downloader
    from bkt_web.db_utils import connect_db
    from bkt_web.security import safe_child
except ImportError:
    import chocode_tiktok
    import multi_downloader
    from db_utils import connect_db
    from security import safe_child

try:
    from bkt_web import paths
except ImportError:
    import paths

router = APIRouter()


# --- Module 2: Auto Downloader (No-Watermark Video Downloader) ---
class DownloadItem(BaseModel):
    urls: Union[str, List[str]]
    platform: Optional[str] = "tiktok"
    profile_limit: int = Field(20, ge=1, le=200)  # link profile Kuaishou → tối đa N video mới nhất


TIKTOK_HOSTS = {"tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"}


MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024


def _is_allowed_tiktok_url(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value)
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and (host in TIKTOK_HOSTS or host.endswith(".tiktok.com"))
    except ValueError:
        return False


def _is_public_http_url(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)):
            ip = ipaddress.ip_address(info[4][0])
            if not ip.is_global:
                return False
        return True
    except (ValueError, OSError, socket.gaierror):
        return False


def _safe_stream_get(url: str, *, max_redirects: int = 5, headers: Optional[dict] = None):
    """Follow redirects manually so every hop receives the SSRF check."""
    current = url
    for _ in range(max_redirects + 1):
        if not _is_public_http_url(current):
            raise ValueError("URL media trỏ tới mạng nội bộ hoặc host không hợp lệ")
        response = requests.get(current, timeout=60, stream=True, allow_redirects=False, headers=headers)
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("location")
            if not location:
                raise ValueError("Redirect media không có Location")
            current = urllib.parse.urljoin(current, location)
            continue
        return response
    raise ValueError("Media redirect quá nhiều lần")


TIKTOK_MEDIA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Referer": "https://www.tiktok.com/",
}


def _resolve_tiktok_source_chocode(url: str) -> Optional[dict]:
    """Nguồn chính khi đã có khoá chocode; None nếu chưa cấu hình hoặc API trả dữ liệu mẫu."""
    if not chocode_tiktok.is_configured():
        return None
    try:
        info = chocode_tiktok.resolve_video_download(url)
    except chocode_tiktok.ChocodeError as e:
        print(f"[Downloader] chocode bỏ qua {url}: {e}")
        return None
    return {
        "provider": "chocode",
        "id": info["id"],
        "title": info["title"],
        "author": info["author"],
        "duration": info["duration"],
        "cover": info["cover"],
        "play_url": info["play_url"],
    }


def _resolve_tiktok_source_tikwm(url: str) -> Optional[dict]:
    r = requests.get("https://www.tikwm.com/api/", params={"url": url}, timeout=15, allow_redirects=False)
    if r.status_code != 200:
        return None
    d = r.json()
    if d.get("code") != 0 or "data" not in d:
        return None
    data = d["data"]
    return {
        "provider": "tikwm",
        "id": data.get("id"),
        "title": data.get("title"),
        "author": data.get("author", {}).get("unique_id", ""),
        "duration": int(data.get("duration", 0)),
        "cover": data.get("cover", ""),
        "play_url": data.get("play") or data.get("wmplay"),
    }


def download_single_video(url: str, errors: Optional[List[str]] = None) -> Optional[dict]:
    """TikTok: chocode → tikwm (không logo) → yt-dlp. Nền tảng khác (YouTube, Douyin, Instagram…): yt-dlp."""
    clean_url = url.strip()
    platform = multi_downloader.detect_platform(clean_url)
    if not platform:
        return None
    if platform == "kuaishou":  # không có trong yt-dlp: Chrome Kuaishou đã đăng nhập (multi_downloader.resolve_kuaishou)
        try:
            info = multi_downloader.resolve_kuaishou(clean_url)
            result = _download_resolved_video(clean_url, {**info, "provider": "kuaishou"}, "kuaishou",
                                              {"User-Agent": TIKTOK_MEDIA_HEADERS["User-Agent"], "Referer": "https://www.kuaishou.com/"})
            if not result:
                raise RuntimeError("tải file MP4 từ CDN Kuaishou thất bại")
            return result
        except Exception as e:
            print(f"[Downloader] Kuaishou lỗi với {clean_url}: {e}")
            if errors is not None:
                errors.append(f"Kuaishou: {e}")
            return None
    if platform == "tiktok":
        for resolver in (_resolve_tiktok_source_chocode, _resolve_tiktok_source_tikwm):
            try:
                result = _download_resolved_video(clean_url, resolver(clean_url))
            except Exception as e:
                print(f"[Downloader] {resolver.__name__} lỗi với {clean_url}: {e}")
                result = None
            if result:
                return result
    try:
        got = multi_downloader.download_ytdlp(clean_url, platform, paths.DOWNLOADS_DIR)
    except Exception as e:
        print(f"[Downloader] yt-dlp lỗi với {clean_url}: {e}")
        if errors is not None:
            errors.append(f"{multi_downloader.label(platform)}: {e}")
        return None
    return _record_download(clean_url, platform, got, got["path"])


def _download_resolved_video(clean_url: str, data: Optional[dict], platform: str = "tiktok",
                             headers: Optional[dict] = None) -> Optional[dict]:
    if not data or not data.get("play_url"):
        return None
    raw_id = str(data.get("id") or int(time.time() * 1000))
    vid_id = re.sub(r"[^0-9A-Za-z_-]", "", raw_id)[:80] or str(int(time.time() * 1000))
    title = data.get("title") or f"TikTok Video {vid_id}"
    author = data.get("author") or ""
    duration = int(data.get("duration") or 0)
    cover = data.get("cover") or ""
    out_filename = f"{vid_id}.mp4" if platform == "tiktok" else f"{platform}_{vid_id}.mp4"
    local_fpath = paths.DOWNLOADS_DIR / out_filename
    partial_fpath = paths.DOWNLOADS_DIR / f".{out_filename}.part"
    try:
        v_stream = _safe_stream_get(data["play_url"], headers=headers or TIKTOK_MEDIA_HEADERS)
        if v_stream.status_code != 200:
            raise ValueError(f"Media trả HTTP {v_stream.status_code}")
        declared_size = int(v_stream.headers.get("content-length") or 0)
        if declared_size > MAX_DOWNLOAD_BYTES:
            raise ValueError("Video vượt quá giới hạn 500 MB")
        total_written = 0
        with open(partial_fpath, "wb") as f:
            for chunk in v_stream.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                if total_written == 0 and b"ftyp" not in chunk[:16]:
                    raise ValueError("Media trả về không phải file MP4")
                total_written += len(chunk)
                if total_written > MAX_DOWNLOAD_BYTES:
                    raise ValueError("Video vượt quá giới hạn 500 MB")
                f.write(chunk)
        if total_written == 0:
            raise ValueError("Media trả về file rỗng")
        partial_fpath.replace(local_fpath)
    except Exception as e:
        print(f"[Downloader] {data.get('provider')} lỗi tải {clean_url}: {e}")
        if partial_fpath.exists():
            partial_fpath.unlink()
        return None

    return _record_download(clean_url, platform, data, local_fpath)


def _record_download(clean_url: str, platform: str, data: dict, local_fpath: Path) -> dict:
    vid_id = re.sub(r"[^0-9A-Za-z_-]", "", str(data.get("id") or ""))[:80] or local_fpath.stem
    title = data.get("title") or f"{multi_downloader.label(platform)} {vid_id}"
    author = data.get("author") or ""
    duration = int(data.get("duration") or 0)
    cover = data.get("cover") or ""
    f_size = local_fpath.stat().st_size
    now = int(time.time())
    conn = connect_db(paths.DB_PATH)
    conn.execute("""
        INSERT INTO downloaded_videos (original_url, platform, title, author, duration, cover_url, local_path, file_size, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
        ON CONFLICT(original_url) DO UPDATE SET
            platform=excluded.platform,
            title=excluded.title,
            author=excluded.author,
            duration=excluded.duration,
            cover_url=excluded.cover_url,
            local_path=excluded.local_path,
            file_size=excluded.file_size,
            status='COMPLETED',
            created_at=excluded.created_at
    """, (clean_url, multi_downloader.label(platform), title, author, duration, cover, str(local_fpath), f_size, now))
    conn.commit()
    conn.close()
    return {
        "id": vid_id,
        "title": title,
        "author": author,
        "duration": duration,
        "file_size": f_size,
        "local_path": str(local_fpath),
        "provider": data.get("provider"),
        "platform": platform,
    }


def _expand_profiles(job_id: int, urls: List[str], profile_limit: int, errors: List[str]) -> List[Any]:
    """Link profile Kuaishou → các video (đã có link MP4, không mở trang từng video); link khác giữ nguyên."""
    out: List[Any] = []
    for u in urls:
        if not multi_downloader.is_kuaishou_profile(u):
            out.append(u)
            continue
        try:
            out.extend(multi_downloader.kuaishou_profile(u, profile_limit))
        except Exception as e:
            print(f"[Downloader] profile Kuaishou lỗi {u}: {e}")
            errors.append(f"Kuaishou profile: {e}")
            out.append(None)  # tính là một lỗi
    conn = connect_db(paths.DB_PATH)
    conn.execute("UPDATE download_jobs SET total=? WHERE id=?", (len(out), job_id))
    conn.commit()
    conn.close()
    return out


def _download_kuaishou_item(item: dict, errors: List[str]) -> Optional[dict]:
    result = _download_resolved_video(item["url"], {**item, "provider": "kuaishou"}, "kuaishou",
                                      {"User-Agent": TIKTOK_MEDIA_HEADERS["User-Agent"], "Referer": "https://www.kuaishou.com/"})
    if not result:
        errors.append(f"Kuaishou: tải MP4 thất bại ({item['url']})")
    return result


def process_batch_download(job_id: int, urls: List[str], profile_limit: int = 20):
    conn = connect_db(paths.DB_PATH)
    conn.execute("UPDATE download_jobs SET status='PROCESSING' WHERE id=?", (job_id,))
    conn.commit()
    conn.close()
    errors: List[str] = []
    for u in _expand_profiles(job_id, urls, profile_limit, errors):
        if u is None:
            result = None
        elif isinstance(u, dict):
            result = _download_kuaishou_item(u, errors)
        else:
            result = download_single_video(u, errors)
        conn = connect_db(paths.DB_PATH)
        if result:
            conn.execute("UPDATE download_jobs SET completed=completed+1 WHERE id=?", (job_id,))
        else:
            conn.execute("UPDATE download_jobs SET failed=failed+1, error_message=? WHERE id=?", ("\n".join(errors[-5:])[:2000], job_id))
        conn.commit()
        conn.close()
    conn = connect_db(paths.DB_PATH)
    conn.execute(
        "UPDATE download_jobs SET status=?, finished_at=? WHERE id=?",
        ("COMPLETED", int(time.time()), job_id),
    )
    conn.commit()
    conn.close()


@router.post("/api/downloader/download")
def start_download_videos(item: DownloadItem, background_tasks: BackgroundTasks):
    raw_urls = item.urls
    lines = raw_urls if isinstance(raw_urls, list) else str(raw_urls).split("\n")
    lines = [u.strip() for u in lines if isinstance(u, str) and u.strip()]
    urls = list(dict.fromkeys(u for u in lines if multi_downloader.detect_platform(u)))
    skipped = len(lines) - len([u for u in lines if multi_downloader.detect_platform(u)])
    if not urls:
        names = ", ".join(multi_downloader.label(p) for p in multi_downloader.PLATFORMS)
        raise HTTPException(status_code=400, detail=f"Không có link https nào thuộc nền tảng hỗ trợ ({names})")
    if len(urls) > 50:
        raise HTTPException(status_code=400, detail="Mỗi lượt chỉ tải tối đa 50 video")
    conn = connect_db(paths.DB_PATH)
    cur = conn.execute(
        "INSERT INTO download_jobs(total, status, created_at) VALUES (?, 'QUEUED', ?)",
        (len(urls), int(time.time())),
    )
    job_id = cur.lastrowid
    conn.commit()
    conn.close()
    background_tasks.add_task(process_batch_download, job_id, urls, item.profile_limit)
    by_platform: Dict[str, int] = {}
    for u in urls:
        name = multi_downloader.label(multi_downloader.detect_platform(u))
        by_platform[name] = by_platform.get(name, 0) + 1
    summary = ", ".join(f"{n} {k}" for k, n in by_platform.items())
    note = f" (bỏ {skipped} link không hỗ trợ)" if skipped else ""
    return {"message": f"Bắt đầu tải {len(urls)} video: {summary}{note}", "total": len(urls), "job_id": job_id,
            "platforms": by_platform, "skipped": skipped}


@router.get("/api/downloader/platforms")
def downloader_platforms():
    return {"platforms": [{"id": k, "label": v["label"], "hosts": v["hosts"],
                           "cookies": bool(multi_downloader.cookie_file(k)),
                           "ready": multi_downloader.kuaishou_ready() if k == "kuaishou" else True}
                          for k, v in multi_downloader.PLATFORMS.items()]}


@router.get("/api/downloader/jobs/{job_id}")
def get_download_job(job_id: int):
    conn = connect_db(paths.DB_PATH)
    row = conn.execute(
        "SELECT id,total,completed,failed,status,error_message,created_at,finished_at FROM download_jobs WHERE id=?",
        (job_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tải")
    keys = ["id", "total", "completed", "failed", "status", "error_message", "created_at", "finished_at"]
    return dict(zip(keys, row))


@router.get("/api/downloader/videos")
def get_downloaded_videos():
    conn = connect_db(paths.DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, original_url, platform, title, author, duration, cover_url, local_path, file_size, status, created_at FROM downloaded_videos ORDER BY created_at DESC")
    rows = c.fetchall()
    conn.close()
    items = []
    for r in rows:
        local_name = Path(r[7]).name if r[7] else ""
        items.append({
            "id": r[0],
            "original_url": r[1],
            "platform": r[2],
            "title": r[3],
            "author": r[4],
            "duration": r[5],
            "cover_url": r[6],
            "local_path": r[7],
            "file_size": r[8],
            "status": r[9],
            "created_at": r[10],
            "video_url": f"/storage/downloads/{local_name}" if local_name else ""
        })
    return {"videos": items}


@router.delete("/api/downloader/videos/{vid_id}")
def delete_downloaded_video(vid_id: int):
    conn = connect_db(paths.DB_PATH)
    c = conn.cursor()
    c.execute("SELECT local_path FROM downloaded_videos WHERE id=?", (vid_id,))
    row = c.fetchone()
    if row and row[0]:
        try:
            p = Path(row[0]).resolve()
            if p.is_relative_to(paths.DOWNLOADS_DIR.resolve()) and p.exists():
                p.unlink()
        except Exception:
            pass
    c.execute("DELETE FROM downloaded_videos WHERE id=?", (vid_id,))
    conn.commit()
    conn.close()
    return {"message": "Đã xóa video khỏi danh sách"}


# --- Module 3: Auto Render (FFmpeg VideoToolbox & Format Normalization) ---
class RenderTaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video_id: Optional[int] = None
    input_path: Optional[str] = None
    task_name: str = Field(default="Render Video", max_length=120)
    flip: bool = True
    speed: float = Field(default=1.04, ge=0.5, le=2.0)
    crop_percent: float = Field(default=3.0, ge=0.0, le=20.0)
    color_adjust: bool = True
    overlay_filename: Optional[str] = None
    audio_filename: Optional[str] = None
    use_gpu: bool = True


RENDER_PROCESSES: Dict[int, subprocess.Popen] = {}


RENDER_PROCESSES_LOCK = threading.Lock()


def build_ffmpeg_render_cmd(
    in_file: str,
    out_file: str,
    flip: bool,
    speed: float,
    crop_pct: float,
    color_adj: bool,
    overlay_file: str,
    audio_file: str,
    use_gpu: bool,
) -> List[str]:
    """Dựng lệnh ffmpeg cho một tác vụ render. Tách riêng để kiểm thử được."""
    vf_filters = []
    if flip:
        vf_filters.append("hflip")
    if crop_pct > 0:
        pct = crop_pct / 100.0
        vf_filters.append(f"crop=in_w*(1-{pct}):in_h*(1-{pct}):(in_w*({pct}))/2:(in_h*({pct}))/2,scale=1080:1920")
    if color_adj:
        vf_filters.append("eq=brightness=0.02:contrast=1.04:saturation=1.05")
    if speed != 1.0:
        vf_filters.append(f"setpts=PTS/{speed}")

    vf_str = ",".join(vf_filters) if vf_filters else "null"
    cmd = ["ffmpeg", "-y", "-i", in_file]

    inputs = 1
    overlay_idx = -1
    audio_idx = -1
    if overlay_file:
        cmd.extend(["-i", overlay_file])
        overlay_idx = inputs
        inputs += 1
    if audio_file:
        cmd.extend(["-i", audio_file])
        audio_idx = inputs
        inputs += 1

    v_encoder = "h264_videotoolbox" if use_gpu else "libx264"

    if overlay_idx > 0:
        fc = f"[0:v]{vf_str}[v_main];[v_main][{overlay_idx}:v]overlay=0:0[vout]"
        cmd.extend(["-filter_complex", fc, "-map", "[vout]"])
    else:
        cmd.extend(["-vf", vf_str, "-map", "0:v"])

    if audio_idx > 0:
        cmd.extend(["-map", f"{audio_idx}:a", "-c:a", "aac", "-shortest"])
    else:
        # Đã -map video tường minh nên ffmpeg tắt chọn stream mặc định. Thiếu
        # "-map 0:a?" ở đây là mất sạch tiếng gốc, kể cả khi có -af, và ffmpeg
        # không hề cảnh báo.
        cmd.extend(["-map", "0:a?"])
        if speed != 1.0:
            cmd.extend(["-af", f"atempo={speed}"])
        cmd.extend(["-c:a", "aac"])

    cmd.extend(["-c:v", v_encoder, "-b:v", "4000k", out_file])
    return cmd


def execute_ffmpeg_render_job(task_id: int, in_file: str, out_file: str, flip: bool, speed: float, crop_pct: float, color_adj: bool, overlay_name: Optional[str], audio_name: Optional[str], use_gpu: bool):
    conn = connect_db(paths.DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE render_tasks SET status='PROCESSING', progress=15 WHERE id=?", (task_id,))
    conn.commit()
    conn.close()

    try:
        overlay_file = str(safe_child(paths.OVERLAYS_DIR, overlay_name, must_exist=True)) if overlay_name else ""
        audio_file = str(safe_child(paths.AUDIO_DIR, audio_name, must_exist=True)) if audio_name else ""
        cmd = build_ffmpeg_render_cmd(
            in_file, out_file, flip, speed, crop_pct, color_adj, overlay_file, audio_file, use_gpu
        )

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        with RENDER_PROCESSES_LOCK:
            RENDER_PROCESSES[task_id] = proc
        try:
            stdout, stderr = proc.communicate(timeout=1800)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate()
            raise RuntimeError("FFmpeg vượt quá thời gian render tối đa 30 phút")
        finally:
            with RENDER_PROCESSES_LOCK:
                RENDER_PROCESSES.pop(task_id, None)

        now = int(time.time())
        conn = connect_db(paths.DB_PATH)
        c = conn.cursor()
        current = c.execute("SELECT status FROM render_tasks WHERE id=?", (task_id,)).fetchone()
        if current and current[0] == "CANCELLED":
            # Tác vụ bị người dùng huỷ giữa chừng: bỏ luôn file dở dang.
            Path(out_file).unlink(missing_ok=True)
        elif proc.returncode == 0:
            c.execute("UPDATE render_tasks SET status='COMPLETED', progress=100, finished_at=? WHERE id=?", (now, task_id))
        else:
            err_msg = stderr[-1000:] if stderr else "FFmpeg exit non-zero"
            c.execute("UPDATE render_tasks SET status='ERROR', progress=0, error_message=? WHERE id=?", (err_msg, task_id))
            Path(out_file).unlink(missing_ok=True)
        conn.commit()
        conn.close()
    except Exception as e:
        Path(out_file).unlink(missing_ok=True)
        conn = connect_db(paths.DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE render_tasks SET status='ERROR', progress=0, error_message=? WHERE id=?", (str(e), task_id))
        conn.commit()
        conn.close()


@router.post("/api/render/create-task")
def create_render_task(item: RenderTaskCreate, background_tasks: BackgroundTasks):
    in_file = item.input_path
    title = item.task_name or "Render Video"
    if item.video_id:
        conn = connect_db(paths.DB_PATH)
        c = conn.cursor()
        c.execute("SELECT local_path, title FROM downloaded_videos WHERE id=?", (item.video_id,))
        r = c.fetchone()
        conn.close()
        if r:
            in_file, title = r[0], r[1]

    if not in_file or not Path(in_file).is_file():
        raise HTTPException(status_code=400, detail="Không tìm thấy file video đầu vào để biên tập")

    resolved_input = Path(in_file).resolve()
    allowed_roots = [paths.STORAGE_DIR.resolve(), paths.AUTO_COMPARE_VIDEOS_DIR.resolve()]
    if not any(resolved_input.is_relative_to(root) for root in allowed_roots):
        raise HTTPException(status_code=400, detail="Video đầu vào nằm ngoài thư viện được phép")
    in_file = str(resolved_input)

    try:
        if item.overlay_filename:
            safe_child(paths.OVERLAYS_DIR, item.overlay_filename, must_exist=True)
        if item.audio_filename:
            safe_child(paths.AUDIO_DIR, item.audio_filename, must_exist=True)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=400, detail="Overlay hoặc audio không hợp lệ")

    safe_stem = re.sub(r"[^0-9A-Za-z._-]", "_", Path(in_file).stem)[:80] or "video"
    out_name = f"render_{int(time.time())}_{secrets.token_hex(4)}_{safe_stem}.mp4"
    out_file = str(paths.RENDERED_DIR / out_name)

    now = int(time.time())
    conn = connect_db(paths.DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO render_tasks (input_video_path, output_video_path, title, overlay_path, audio_path, flip, speed, crop_percent, color_adjust, use_gpu, status, progress, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', 5, ?)
    """, (in_file, out_file, title, item.overlay_filename or "", item.audio_filename or "", 1 if item.flip else 0, item.speed, item.crop_percent, 1 if item.color_adjust else 0, 1 if item.use_gpu else 0, now))
    task_id = c.lastrowid
    conn.commit()
    conn.close()

    background_tasks.add_task(execute_ffmpeg_render_job, task_id, in_file, out_file, item.flip, item.speed, item.crop_percent, item.color_adjust, item.overlay_filename, item.audio_filename, item.use_gpu)
    return {"message": "Đã tạo tác vụ biên tập video thành công!", "task_id": task_id}


@router.get("/api/render/tasks")
def list_render_tasks():
    conn = connect_db(paths.DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, input_video_path, output_video_path, title, flip, speed, crop_percent, color_adjust, use_gpu, status, progress, error_message, created_at, finished_at FROM render_tasks ORDER BY created_at DESC")
    rows = c.fetchall()
    conn.close()
    items = []
    for r in rows:
        out_name = Path(r[2]).name if r[2] else ""
        items.append({
            "id": r[0],
            "input_video_path": r[1],
            "output_video_path": r[2],
            "title": r[3],
            "flip": r[4],
            "speed": r[5],
            "crop_percent": r[6],
            "color_adjust": r[7],
            "use_gpu": r[8],
            "status": r[9],
            "progress": r[10],
            "error_message": r[11],
            "created_at": r[12],
            "finished_at": r[13],
            "video_url": f"/storage/rendered/{out_name}" if out_name and (paths.RENDERED_DIR / out_name).exists() else ""
        })
    return {"tasks": items}


@router.delete("/api/render/tasks/{task_id}")
def delete_render_task(task_id: int):
    conn = connect_db(paths.DB_PATH)
    c = conn.cursor()
    c.execute("SELECT output_video_path, status FROM render_tasks WHERE id=?", (task_id,))
    row = c.fetchone()
    if row and row[1] == "PROCESSING":
        conn.close()
        raise HTTPException(status_code=409, detail="Hãy hủy tác vụ đang chạy trước khi xóa")
    if row and row[0]:
        try:
            p = Path(row[0]).resolve()
            if p.is_relative_to(paths.RENDERED_DIR.resolve()) and p.exists():
                p.unlink()
        except Exception:
            pass
    c.execute("DELETE FROM render_tasks WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    return {"message": "Đã xóa tác vụ biên tập"}


@router.post("/api/render/tasks/{task_id}/cancel")
def cancel_render_task(task_id: int):
    with RENDER_PROCESSES_LOCK:
        proc = RENDER_PROCESSES.get(task_id)
    if not proc or proc.poll() is not None:
        raise HTTPException(status_code=409, detail="Tác vụ không còn chạy")
    proc.terminate()
    conn = connect_db(paths.DB_PATH)
    conn.execute(
        "UPDATE render_tasks SET status='CANCELLED', progress=0, error_message='Đã hủy bởi người dùng', finished_at=? WHERE id=?",
        (int(time.time()), task_id),
    )
    conn.commit()
    conn.close()
    return {"message": "Đã gửi yêu cầu hủy render"}


@router.get("/api/render/assets")
def get_render_assets():
    overlays = [f.name for f in paths.OVERLAYS_DIR.glob("*.png")]
    audios = [f.name for f in paths.AUDIO_DIR.glob("*.*") if f.suffix.lower() in (".mp3", ".wav", ".m4a", ".aac")]
    return {"overlays": overlays, "audios": audios}
