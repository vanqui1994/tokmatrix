import asyncio
import hashlib
import json
import re
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel

try:
    from bkt_web.remake_pipeline import RemakePipeline, PROJECTS_REGISTRY, STATIC_DIR, register_project
    from bkt_web.remake_localization import COUNTRIES, public_country, profile_for_source, synthesize_locale
    from bkt_web.remake_task_store import RemakeTaskStore
except ImportError:
    from remake_pipeline import RemakePipeline, PROJECTS_REGISTRY, STATIC_DIR, register_project
    from remake_localization import COUNTRIES, public_country, profile_for_source, synthesize_locale
    from remake_task_store import RemakeTaskStore

remake_router = APIRouter(prefix="/api/remake", tags=["remake_pipeline"])
PROJECT_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = Path(__file__).resolve().parent / "storage" / "remake_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".webm"}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024

# Task phụ (localize/publish) vẫn dùng cache ngắn hạn này. Remake production dùng
# SQLite bên dưới làm source of truth; cache chỉ giữ tương thích nội bộ.
REMAKE_TASKS: Dict[str, Dict[str, Any]] = {}
MAX_TASKS_KEPT = 50
MAX_LOG_LINES = 400

# Pipeline gọi ffmpeg + Whisper rất nặng; chỉ cho một tiến trình chạy mỗi lúc.
PIPELINE_LOCK = threading.Lock()
REMAKE_TASK_DB = Path(__file__).resolve().parent / "storage" / "remake_tasks.db"
REMAKE_TASK_STORE = RemakeTaskStore(REMAKE_TASK_DB)
REMAKE_QUEUE_STOP = threading.Event()
REMAKE_QUEUE_WAKE = threading.Event()
REMAKE_QUEUE_THREAD: threading.Thread | None = None


def _source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _durable_task(task_id: str) -> Dict[str, Any] | None:
    task = REMAKE_TASK_STORE.get(task_id)
    if task is not None:
        REMAKE_TASKS[task_id] = task
    return task


def _append_log(task: Dict[str, Any], line: str) -> None:
    logs = task.setdefault("logs", [])
    logs.append(line)
    if len(logs) > MAX_LOG_LINES:
        del logs[: len(logs) - MAX_LOG_LINES]
    if task.get("kind") == "remake":
        REMAKE_TASK_STORE.put(task)


def _register_task(task_id: str, task: Dict[str, Any]) -> None:
    REMAKE_TASKS[task_id] = task
    if len(REMAKE_TASKS) > MAX_TASKS_KEPT:
        for stale_id, stale in sorted(REMAKE_TASKS.items(), key=lambda kv: kv[1].get("created_ts", 0)):
            if stale.get("status") in ("completed", "error") and stale_id != task_id:
                REMAKE_TASKS.pop(stale_id, None)
            if len(REMAKE_TASKS) <= MAX_TASKS_KEPT:
                break

class StartRemakeRequest(BaseModel):
    video_path: str
    project_name: Optional[str] = None


class LocalizeRemakeRequest(BaseModel):
    locales: List[str]


def _resolve_source_video(value: str) -> Path:
    """Resolve only files inside approved source roots."""
    root = PROJECT_ROOT
    approved_roots = (root, root / "compare_studio" / "source_videos", UPLOAD_DIR)
    candidate = Path(value)
    candidates = [candidate.resolve()] if candidate.is_absolute() else [
        (approved_root / candidate).resolve() for approved_root in approved_roots
    ]
    for resolved in candidates:
        if not resolved.is_file() or resolved.suffix.lower() not in ALLOWED_VIDEO_SUFFIXES:
            continue
        if any(resolved == base.resolve() or base.resolve() in resolved.parents for base in approved_roots):
            return resolved
    raise HTTPException(status_code=404, detail="Video không tồn tại hoặc nằm ngoài thư mục nguồn được phép")


def _safe_upload_name(filename: str) -> str:
    original = Path(filename or "video.mp4")
    suffix = original.suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ video MP4, MOV hoặc WebM")
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", original.stem).strip("-_").lower() or "video"
    return f"{stem[:60]}-{uuid.uuid4().hex[:8]}{suffix}"


def _probe_uploaded_video(path: Path) -> Dict[str, Any]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise ValueError("File tải lên không phải video hợp lệ")
    data = json.loads(result.stdout or "{}")
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "video"), None)
    duration = float((data.get("format") or {}).get("duration") or 0)
    if not stream or duration <= 0:
        raise ValueError("Không tìm thấy video stream hoặc thời lượng hợp lệ")
    return {"duration": round(duration, 3), "width": int(stream.get("width") or 0), "height": int(stream.get("height") or 0)}


@remake_router.post("/upload")
async def upload_remake_video(file: UploadFile = File(...)):
    stored_name = _safe_upload_name(file.filename or "video.mp4")
    final_path = UPLOAD_DIR / stored_name
    temp_path = UPLOAD_DIR / f".{stored_name}.uploading"
    size = 0
    try:
        with temp_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Video vượt quá giới hạn 500 MB")
                output.write(chunk)
        # subprocess.run chặn tới 30s; chạy trong thread để không treo cả API.
        metadata = await asyncio.to_thread(_probe_uploaded_video, temp_path)
        temp_path.replace(final_path)
    except HTTPException:
        temp_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        await file.close()
    return {
        "success": True,
        "filename": stored_name,
        "original_filename": file.filename,
        "path": str(final_path.relative_to(PROJECT_ROOT)),
        "size_mb": round(size / (1024 * 1024), 2),
        **metadata,
    }


def background_remake_worker(task_id: str, video_path: str | None = None, project_name: Optional[str] = None):
    task_info = _durable_task(task_id)
    if not task_info:
        return
    video_path = video_path or task_info.get("video_path")
    project_name = project_name or task_info.get("project_name")

    def log_cb(msg: str, pct: int):
        task_info["progress"] = pct
        task_info["current_step"] = msg
        _append_log(task_info, f"[{time.strftime('%H:%M:%S')}] ({pct}%) {msg}")

    # Hai tác vụ cùng chạy sẽ tranh nhau CPU cho ffmpeg/Whisper và có thể ghi đè
    # lẫn nhau nếu trùng mã project -> xếp hàng tuần tự.
    if not PIPELINE_LOCK.acquire(blocking=False):
        task_info["current_step"] = "Đang chờ tác vụ remake trước chạy xong..."
        _append_log(task_info, "[Hàng đợi] Có tác vụ remake khác đang chạy, đang xếp hàng...")
        PIPELINE_LOCK.acquire()

    try:
        task_info["status"] = "processing"
        REMAKE_TASK_STORE.put(task_info)
        log_cb("Khởi động Worker Remake Pipeline...", 2)

        pipeline = RemakePipeline(str(video_path), project_name, log_callback=log_cb)
        result = pipeline.run_all()

        task_info["status"] = result.get("status", "completed")
        task_info["result"] = result
        if task_info["status"] == "completed":
            log_cb("Đã dựng xong bản xem trước; cần đối chiếu hình với nguồn", 100)
        else:
            log_cb("Đang chờ duyệt storyboard hoặc tài nguyên; chưa có bản remake hoàn chỉnh", 45)
    except Exception as e:
        _append_log(task_info, f"[LỖI] {str(e)}")
        task_info = REMAKE_TASK_STORE.fail_or_retry(task_id, str(e))
        REMAKE_TASKS[task_id] = task_info
    finally:
        if task_info.get("status") != "pending":
            REMAKE_TASK_STORE.put(task_info)
        PIPELINE_LOCK.release()


def _remake_queue_loop() -> None:
    # Một lỗi thoáng qua của SQLite (khoá bận, file vừa bị đổi chủ sở hữu) từng
    # ném thẳng ra khỏi vòng lặp và giết luôn thread: hàng đợi chết âm thầm,
    # task mới nằm 'pending' mãi cho tới khi khởi động lại dịch vụ mà không ai
    # được báo. Nuốt lỗi tại đây rồi thử lại là cách duy nhất giữ worker sống.
    while not REMAKE_QUEUE_STOP.is_set():
        try:
            task = REMAKE_TASK_STORE.claim_next()
            if task is None:
                REMAKE_QUEUE_WAKE.wait(timeout=1.0)
                REMAKE_QUEUE_WAKE.clear()
                continue
            background_remake_worker(task["id"], task["video_path"], task.get("project_name"))
        except Exception:
            traceback.print_exc()
            REMAKE_QUEUE_STOP.wait(timeout=5.0)


def start_remake_queue_worker() -> None:
    global REMAKE_QUEUE_THREAD
    REMAKE_TASK_STORE.recover_interrupted()
    REMAKE_QUEUE_STOP.clear()
    if REMAKE_QUEUE_THREAD is None or not REMAKE_QUEUE_THREAD.is_alive():
        REMAKE_QUEUE_THREAD = threading.Thread(target=_remake_queue_loop, name="remake-queue-worker", daemon=True)
        REMAKE_QUEUE_THREAD.start()
    REMAKE_QUEUE_WAKE.set()


def stop_remake_queue_worker() -> None:
    REMAKE_QUEUE_STOP.set()
    REMAKE_QUEUE_WAKE.set()
    if REMAKE_QUEUE_THREAD and REMAKE_QUEUE_THREAD.is_alive():
        REMAKE_QUEUE_THREAD.join(timeout=5)


def _enqueue_remake(target: Path, project_name: str | None, *, initial_log: str) -> tuple[dict[str, Any], bool]:
    source_hash = _source_sha256(target)
    stable_project = project_name or f"remake-{source_hash[:12]}"
    task, created = REMAKE_TASK_STORE.create_remake(
        task_id=uuid.uuid4().hex[:12],
        source_sha256=source_hash,
        video_path=str(target),
        project_name=stable_project,
        initial_log=initial_log,
    )
    REMAKE_TASKS[task["id"]] = task
    REMAKE_QUEUE_WAKE.set()
    return task, created


@remake_router.post("/start")
def start_remake(req: StartRemakeRequest, background_tasks: BackgroundTasks):
    target = _resolve_source_video(req.video_path)
    if req.project_name and not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", req.project_name):
        raise HTTPException(status_code=422, detail="Mã dự án không hợp lệ")

    task, created = _enqueue_remake(target, req.project_name, initial_log=f"Tạo tác vụ Remake cho {target.name}")
    return {
        "success": True, "task_id": task["id"], "source_sha256": task["source_sha256"],
        "idempotent_reuse": not created,
        "message": "Đã đưa vào quy trình chạy tự động" if created else "Nguồn này đã có tác vụ; dùng lại trạng thái hiện có",
    }


@remake_router.get("/status/{task_id}")
def get_remake_status(task_id: str):
    task = _durable_task(task_id) or REMAKE_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ")
    return task


@remake_router.post("/status/{task_id}/retry")
def retry_remake_task(task_id: str):
    try:
        task = REMAKE_TASK_STORE.retry(task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    REMAKE_TASKS[task_id] = task
    REMAKE_QUEUE_WAKE.set()
    return {"success": True, "task_id": task_id, "status": task["status"]}


@remake_router.get("/projects")
def get_remake_projects():
    projects = []
    if PROJECTS_REGISTRY.exists():
        try:
            with open(PROJECTS_REGISTRY, "r", encoding="utf-8") as f:
                projects = json.load(f)
        except Exception:
            projects = []

    return {"projects": projects}


@remake_router.get("/projects/{project_id}/manifest")
def get_remake_project_manifest(project_id: str):
    """Read and validate the evidence manifest stored beside a project."""
    if not re.fullmatch(r"[a-z0-9_-]{1,80}", project_id):
        raise HTTPException(status_code=422, detail="Mã project không hợp lệ")
    try:
        from bkt_web.render_evidence import RenderEvidenceError, load_manifest
        from bkt_web.render_manifest import RenderManifestError

        return load_manifest(STATIC_DIR / "remake_projects" / project_id)
    except RenderEvidenceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (RenderManifestError, json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=409, detail=f"Manifest không hợp lệ: {str(exc)[:300]}") from exc


def _character_bible_path(project_id: str) -> Path:
    if not re.fullmatch(r"[a-z0-9_-]{1,80}", project_id):
        raise HTTPException(status_code=422, detail="Mã project không hợp lệ")
    return STATIC_DIR / "remake_projects" / project_id / "character_bible.json"


@remake_router.get("/projects/{project_id}/characters")
def get_remake_project_characters(project_id: str):
    """Character review document shared by every scene in a remake."""
    from bkt_web.character_bible import CharacterBibleError, build_character_bible, load_character_bible, save_character_bible

    path = _character_bible_path(project_id)
    try:
        if path.is_file():
            return load_character_bible(path)
        review_path = path.parent / "review.json"
        if not review_path.is_file():
            raise HTTPException(status_code=404, detail="Project chưa có Character Bible")
        review = json.loads(review_path.read_text(encoding="utf-8"))
        storyboard = (review.get("automatic_route") or {}).get("storyboard") or review
        document = build_character_bible(storyboard, project_id=project_id)
        return save_character_bible(path, document)
    except HTTPException:
        raise
    except (OSError, ValueError, CharacterBibleError) as exc:
        raise HTTPException(status_code=409, detail=f"Character Bible không hợp lệ: {str(exc)[:300]}") from exc


@remake_router.put("/projects/{project_id}/characters")
def update_remake_project_characters(project_id: str, document: Dict[str, Any]):
    """Validate and atomically save the project-level character decisions."""
    from bkt_web.character_bible import CharacterBibleError, save_character_bible

    path = _character_bible_path(project_id)
    if not path.parent.is_dir():
        raise HTTPException(status_code=404, detail="Không tìm thấy project")
    if document.get("project_id") != project_id:
        raise HTTPException(status_code=422, detail="project_id trong Character Bible không khớp URL")
    try:
        clean = save_character_bible(path, document)
    except (OSError, ValueError, CharacterBibleError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    projects = get_remake_projects()["projects"]
    project = next((item for item in projects if item.get("id") == project_id), None)
    if project:
        project["character_count"] = len(clean["characters"])
        project["character_review_status"] = clean["review_status"]
        register_project(project)
    return {"success": True, "message": "Đã lưu Character Bible", "character_bible": clean}


@remake_router.get("/motion-library")
def get_remake_motion_library():
    from bkt_web.motion_library import library_manifest
    return library_manifest()


class VectorPreviewRequest(BaseModel):
    duration: float
    characters: List[Dict[str, Any]]
    scenes: List[Dict[str, Any]]
    cues: List[Dict[str, Any]] = []


@remake_router.get("/library")
def get_vector_library():
    try:
        from bkt_web.remake_vector import catalog
    except ImportError:
        from remake_vector import catalog
    return {"catalog": catalog(), "showcase_url": "/static/remake_vector_library.html", "examples_url": "/static/remake_vector_examples.json"}


@remake_router.get("/renderers")
def get_renderer_capabilities():
    """Inspection API: every self-registered renderer adapter (Phase 4)."""
    from bkt_web.capability_registry import inspect_registry
    from bkt_web.renderer_adapters import available_adapters, get_adapter

    registry = inspect_registry()
    adapters = []
    for renderer_id in available_adapters():
        adapter = get_adapter(renderer_id)
        renderer = registry["renderers"][renderer_id]
        adapters.append({
            "renderer_id": renderer_id,
            "renderer_version": adapter.renderer_version,
            "frame_mode": adapter.frame_mode,
            "offline_frame_render": adapter.frame_mode == "draw-list",
            "canvas_sizes": [[item["width"], item["height"]] for item in adapter.supported_canvases],
            "features": renderer["features"],
            "supports": renderer["supports"],
            "fidelity": renderer["fidelity"],
            "limits": renderer["limits"],
            "maturity": renderer.get("maturity", "production"),
        })
    return {"registry_version": registry["version"], "adapters": adapters}


@remake_router.post("/library/validate")
def validate_vector_preview(req: VectorPreviewRequest):
    try:
        from bkt_web.remake_vector import ground_warnings, validate_story
    except ImportError:
        from remake_vector import ground_warnings, validate_story
    story = req.model_dump()
    try:
        validate_story(story)
    except (ValueError, KeyError, TypeError, AttributeError, IndexError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"success": True, "renderer": "native-vector-v1", "fidelity": "not-reviewed", "message": "Schema hợp lệ; chưa xác minh độ bám nguồn.", "warnings": ground_warnings(story)}


class ApproveStoryboardRequest(BaseModel):
    source_sha256: str
    approved: bool = False
    characters: List[Dict[str, Any]]
    scenes: List[Dict[str, Any]]
    cues: List[Dict[str, Any]]
    theme: str = "reviewed_story"
    label: str = "Storyboard đã duyệt"


@remake_router.put("/projects/{project_id}/storyboard")
def approve_storyboard(project_id: str, req: ApproveStoryboardRequest):
    try:
        from bkt_web import remake_pipeline as pipeline_module
        from bkt_web.remake_composer import validate_timeline
    except ImportError:
        import remake_pipeline as pipeline_module
        from remake_composer import validate_timeline
    project = next((p for p in get_remake_projects()["projects"] if p.get("id") == project_id), None)
    if not project:
        raise HTTPException(404, "Không tìm thấy dự án")
    if not req.approved or not re.fullmatch(r"[a-f0-9]{64}", req.source_sha256) or req.source_sha256 != project.get("source_sha256"):
        raise HTTPException(422, "Cần xác nhận duyệt và SHA-256 khớp đúng video nguồn")
    if not req.cues or len(req.cues) > 2000 or len(req.scenes) > 500 or not req.characters:
        raise HTTPException(422, "Storyboard thiếu dữ liệu hoặc vượt giới hạn")
    try:
        validate_timeline(req.scenes, req.cues, req.characters, float(project["duration"]))
    except (ValueError, KeyError, TypeError, AttributeError, IndexError) as exc:
        raise HTTPException(422, str(exc)) from exc
    cast = {c["id"]: c for c in req.characters}
    for cue in req.cues:
        if not isinstance(cue.get("text"), str) or not cue["text"].strip():
            raise HTTPException(422, "Mỗi câu cần lời Việt đã duyệt")
        cid = cue.get("character_id") or cue.get("speaker") or cue.get("speaker_id")
        cue.update(speaker=cid, character_id=cid, speaker_verified=True, translation_verified=True)
        role = cast.get(cid, {}).get("role", "narrator")
        cue.setdefault("voice_role", role)
        cue.setdefault("voice", pipeline_module.VOICE_BY_ROLE.get(role, "vi-VN-NamMinhNeural"))
        cue.setdefault("engine", "capcut")
    if not PIPELINE_LOCK.acquire(blocking=False):
        raise HTTPException(409, "Đợi tác vụ dựng hiện tại kết thúc trước khi duyệt")
    try:
        path = pipeline_module.VERIFIED_SCRIPTS_FILE
        scripts = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        scripts[req.source_sha256] = {
            "theme": req.theme, "label": req.label, "characters": req.characters,
            "scenes": req.scenes, "cues": req.cues, "reviewed_by": "user",
            "renderer": req.scenes[0].get("renderer", "storyboard"),
        }
        pipeline_module._atomic_write_json(path, scripts)
    finally:
        PIPELINE_LOCK.release()
    return {"success": True, "message": "Đã lưu storyboard theo hash nguồn. Chạy lại dự án để dựng bản đã duyệt."}


@remake_router.delete("/projects")
def clear_all_remake_projects(confirm: str = ""):
    """Xóa toàn bộ các dự án remake. Bắt buộc truyền ?confirm=XOA-TAT-CA.

    Endpoint này xoá sạch registry + toàn bộ thư mục project + scratch, không
    hoàn tác được, nên không cho phép gọi nhầm chỉ bằng một request rỗng.
    """
    if confirm != "XOA-TAT-CA":
        raise HTTPException(
            status_code=428,
            detail="Thao tác xoá toàn bộ cần tham số ?confirm=XOA-TAT-CA",
        )
    if PROJECTS_REGISTRY.exists():
        PROJECTS_REGISTRY.write_text("[]", encoding="utf-8")

    # Xóa các thư mục scratch tạm
    scratch_dir = PROJECT_ROOT / "bkt_web" / "storage" / "remake_scratch"
    if scratch_dir.exists():
        for item in scratch_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            elif item.is_file() and not item.name.startswith("."):
                item.unlink(missing_ok=True)

    # Xóa các project artifacts trong static/remake_projects
    public_proj_dir = STATIC_DIR / "remake_projects"
    if public_proj_dir.exists():
        for item in public_proj_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)

    # Xóa các file master audio và video preview đã sinh
    for f in STATIC_DIR.glob("remake_*_master.mp3"):
        f.unlink(missing_ok=True)
    for f in STATIC_DIR.glob("remake_*_preview.mp4"):
        f.unlink(missing_ok=True)
    for f in STATIC_DIR.glob("remake_*_video.mp4"):
        f.unlink(missing_ok=True)

    return {"success": True, "message": "Đã xóa toàn bộ các video và dự án remake"}


PROJECT_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,80}")


def _validate_project_id(project_id: str) -> str:
    """Chặn '.', '..' và mọi ký tự đường dẫn.

    Thiếu bước này thì project_id='..' sẽ khiến shutil.rmtree xoá nguyên thư mục
    storage/ (gồm cả hàng đợi ảnh và video đã upload).
    """
    if not PROJECT_ID_RE.fullmatch(project_id or ""):
        raise HTTPException(status_code=422, detail="Mã project không hợp lệ")
    return project_id


@remake_router.delete("/projects/{project_id}")
def delete_single_remake_project(project_id: str):
    """Xóa một dự án remake theo ID."""
    _validate_project_id(project_id)
    projects = _load_projects()
    new_projects = [p for p in projects if p.get("id") != project_id]
    PROJECTS_REGISTRY.write_text(json.dumps(new_projects, ensure_ascii=False, indent=2), encoding="utf-8")

    scratch_dir = PROJECT_ROOT / "bkt_web" / "storage" / "remake_scratch" / project_id
    if scratch_dir.exists():
        shutil.rmtree(scratch_dir, ignore_errors=True)

    public_proj_dir = STATIC_DIR / "remake_projects" / project_id
    if public_proj_dir.exists():
        shutil.rmtree(public_proj_dir, ignore_errors=True)

    (STATIC_DIR / f"remake_{project_id}_master.mp3").unlink(missing_ok=True)
    (STATIC_DIR / f"remake_{project_id}_demo.html").unlink(missing_ok=True)

    return {"success": True, "message": f"Đã xóa dự án {project_id}"}


@remake_router.get("/bridge/tasks")
def list_bridge_tasks(status: Optional[str] = None):
    """Trạng thái các gói dựng nhân vật đang giao cho Antigravity.

    Web dùng endpoint này để hiện 'đang chờ Antigravity vẽ' thay vì tưởng
    project treo. Agent nộp bài xong thì status chuyển sang completed và
    preview_url có giá trị.
    """
    try:
        from bkt_web import remake_bridge
    except ImportError:
        import remake_bridge

    tasks = remake_bridge.list_tasks(status)
    slim = [
        {
            "task_id": t.get("task_id"),
            "project_slug": t.get("project_slug"),
            "project_name": t.get("project_name"),
            "status": t.get("status"),
            "duration": t.get("duration"),
            "character_count": len(t.get("characters") or []),
            "cue_count": len(t.get("cues") or []),
            "preview_url": t.get("preview_url", ""),
            "animated_html": t.get("animated_html", ""),
            "inbox_md": t.get("inbox_md", ""),
            "output_dir": t.get("output_dir", ""),
            "error": t.get("error", ""),
            "created_at": t.get("created_at"),
            "updated_at": t.get("updated_at"),
        }
        for t in tasks
    ]
    waiting = sum(1 for t in slim if t["status"] == remake_bridge.STATUS_WAITING)
    return {
        "success": True,
        "tasks": slim,
        "total": len(slim),
        "waiting_count": waiting,
    }


@remake_router.post("/bridge/tasks/{task_id}/finalize")
def finalize_bridge_task(task_id: str):
    """Dựng video từ bài nộp của Antigravity (tương đương lệnh CLI complete)."""
    try:
        from bkt_web import remake_bridge
    except ImportError:
        import remake_bridge

    try:
        entry = remake_bridge.finalize_task(task_id)
    except ValueError as exc:
        remake_bridge.fail_task(task_id, str(exc))
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "success": True,
        "message": "Đã dựng xong video remake",
        "task": {
            "task_id": entry.get("task_id"),
            "status": entry.get("status"),
            "preview_url": entry.get("preview_url", ""),
            "animated_html": entry.get("animated_html", ""),
        },
    }


@remake_router.get("/countries")
def get_remake_countries():
    return {"countries": [public_country(country) for country in COUNTRIES]}


def _load_projects() -> List[Dict[str, Any]]:
    if not PROJECTS_REGISTRY.exists():
        return []
    try:
        loaded = json.loads(PROJECTS_REGISTRY.read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def background_localize_worker(task_id: str, project_id: str, locales: List[str]):
    task = REMAKE_TASKS.get(task_id)
    if not task:
        return
    try:
        task["status"] = "processing"
        projects = _load_projects()
        project = next((item for item in projects if item.get("id") == project_id), None)
        if not project:
            raise ValueError("Không tìm thấy project")
        profile = profile_for_source(project.get("source_sha256", ""))
        if not profile:
            raise ValueError("Project chưa có Story Bible xác minh để phân vai")
        project_dir = STATIC_DIR / "remake_projects" / project_id
        manifest_path = project_dir / "manifest.json"
        if not manifest_path.is_file():
            manifest_path = project_dir / "project.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        completed = []
        for locale_index, locale in enumerate(locales):
            def locale_log(message: str, code: str = locale, idx: int = locale_index):
                task["current_step"] = message
                task["progress"] = 5 + round((idx / max(1, len(locales))) * 90)
                _append_log(task, f"[{time.strftime('%H:%M:%S')}] [{code}] {message}")

            locale_log("Đang dịch kịch bản, giữ nguyên vai và nội dung")
            package = synthesize_locale(project_dir, profile, locale, locale_log)
            manifest.setdefault("localizations", {})[locale] = {
                "status": "ready",
                "audio_url": package["audio_url"],
                "dialogue_url": f"/static/remake_projects/{project_id}/locales/{locale}/dialogue.json",
                "country": package["country"],
            }
            completed.append(locale)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        project["locales"] = sorted(set(project.get("locales", [])) | set(completed))
        # Dùng chung hàm ghi có khoá + ghi nguyên tử thay vì tự ghi đè cả file.
        register_project(project)
        task.update({"status": "completed", "progress": 100, "current_step": "Đã tạo xong các bản lồng tiếng", "result": {"project_id": project_id, "locales": completed}})
        _append_log(task, f"[{time.strftime('%H:%M:%S')}] Hoàn tất: {', '.join(completed)}")
    except Exception as exc:
        task["status"] = "error"
        task["error"] = str(exc)
        _append_log(task, f"[LỖI] {exc}")


@remake_router.post("/projects/{project_id}/localize")
def localize_remake_project(project_id: str, req: LocalizeRemakeRequest, background_tasks: BackgroundTasks):
    if not re.fullmatch(r"[a-z0-9_-]{1,80}", project_id):
        raise HTTPException(status_code=422, detail="Mã project không hợp lệ")
    supported = {country["code"] for country in COUNTRIES}
    locales = list(dict.fromkeys(req.locales))
    if not locales or len(locales) > 8:
        raise HTTPException(status_code=422, detail="Chọn từ 1 đến 8 quốc gia mỗi lần")
    invalid = [locale for locale in locales if locale not in supported]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Locale chưa hỗ trợ: {', '.join(invalid)}")
    project = next((item for item in _load_projects() if item.get("id") == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy project")
    if not profile_for_source(project.get("source_sha256", "")):
        raise HTTPException(status_code=409, detail="Project chưa có Story Bible xác minh để phân vai")
    task_id = str(uuid.uuid4())[:8]
    _register_task(task_id, {
        "id": task_id, "status": "pending", "progress": 0,
        "current_step": "Đang chuẩn bị bản dịch và voice cast...",
        "logs": [f"Tạo gói lồng tiếng {', '.join(locales)} cho {project_id}"],
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "created_ts": time.time(), "result": None,
    })
    background_tasks.add_task(background_localize_worker, task_id, project_id, locales)
    return {"success": True, "task_id": task_id}


@remake_router.get("/source-videos")
def get_source_videos():
    root = PROJECT_ROOT
    videos = []
    seen_names = set()
    for ext in ["*.mp4", "*.webm", "*.mov"]:
        for p in root.glob(ext):
            if p.is_file() and not p.name.startswith("."):
                seen_names.add(p.name.lower())
                videos.append({
                    "filename": p.name,
                    "path": str(p.relative_to(root)),
                    "size_mb": round(p.stat().st_size / (1024 * 1024), 2)
                })

    # Thêm trong compare_studio/source_videos
    src_dir = root / "compare_studio" / "source_videos"
    if src_dir.exists():
        for p in src_dir.glob("*.mp4"):
            if p.name.lower() in seen_names:
                continue
            seen_names.add(p.name.lower())
            videos.append({
                "filename": p.name,
                "path": str(p.relative_to(root)),
                "size_mb": round(p.stat().st_size / (1024 * 1024), 2)
            })

    for p in sorted(UPLOAD_DIR.iterdir()):
        if not p.is_file() or p.suffix.lower() not in ALLOWED_VIDEO_SUFFIXES:
            continue
        videos.append({
            "filename": p.name,
            "path": str(p.relative_to(root)),
            "size_mb": round(p.stat().st_size / (1024 * 1024), 2),
            "uploaded": True,
        })

    return {"videos": sorted(videos, key=lambda x: x["filename"])}


# =====================================================================
# ENDPOINT MỚI: Upload + Auto-Remake + Publish
# =====================================================================


@remake_router.get("/uploads")
def list_remake_uploads():
    """Liệt kê video đã upload trong thư mục remake_uploads."""
    files = []
    for p in sorted(UPLOAD_DIR.iterdir()):
        if not p.is_file() or p.suffix.lower() not in ALLOWED_VIDEO_SUFFIXES:
            continue
        if p.name.startswith("."):
            continue
        stat = p.stat()
        files.append({
            "filename": p.name,
            "path": str(p.relative_to(PROJECT_ROOT)),
            "size_mb": round(stat.st_size / (1024 * 1024), 2),
            "uploaded_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
        })
    return {"uploads": files, "count": len(files)}


@remake_router.post("/auto")
async def auto_remake(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
):
    """Upload video + tự động bắt đầu remake pipeline trong một bước.

    Kết hợp POST /upload + POST /start: nhận file, validate, lưu, rồi tạo
    background task chạy toàn bộ pipeline 5 bước.
    """
    stored_name = _safe_upload_name(file.filename or "video.mp4")
    final_path = UPLOAD_DIR / stored_name
    temp_path = UPLOAD_DIR / f".{stored_name}.uploading"
    size = 0
    try:
        with temp_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Video vượt quá giới hạn 500 MB")
                output.write(chunk)
        metadata = await asyncio.to_thread(_probe_uploaded_video, temp_path)
        temp_path.replace(final_path)
    except HTTPException:
        temp_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        await file.close()

    task, created = _enqueue_remake(
        final_path, None,
        initial_log=f"Auto-Remake: đã upload {stored_name} ({round(size / (1024 * 1024), 2)} MB)",
    )
    return {
        "success": True,
        "task_id": task["id"],
        "source_sha256": task["source_sha256"],
        "idempotent_reuse": not created,
        "filename": stored_name,
        "original_filename": file.filename,
        "slug": task["project_name"],
        "size_mb": round(size / (1024 * 1024), 2),
        **metadata,
        "message": "Đã upload và đưa vào pipeline remake tự động",
    }


class PublishRemakeRequest(BaseModel):
    channel_id: int
    caption: str = ""
    hashtags: str = "#fyp #viral #trending"


def background_publish_worker(
    task_id: str,
    project_id: str,
    channel_id: int,
    video_path: str,
    caption: str,
    hashtags: str,
):
    """Worker nền đăng video remake đã xuất lên TikTok."""
    task_info = REMAKE_TASKS.get(task_id)
    if not task_info:
        return

    def log_cb(msg: str, pct: int = -1):
        task_info["current_step"] = msg
        if pct >= 0:
            task_info["progress"] = pct
        _append_log(task_info, f"[{time.strftime('%H:%M:%S')}] {msg}")

    try:
        task_info["status"] = "processing"
        log_cb("Khởi động phiên đăng video lên TikTok…", 10)

        try:
            from bkt_web.tiktok_publisher import publish_tiktok_video
        except ImportError:
            from tiktok_publisher import publish_tiktok_video

        import asyncio
        db_path = str(Path(__file__).resolve().parent / "bkt_channels.db")

        def publisher_log(msg: str, level: str = "info"):
            log_cb(f"[{level.upper()}] {msg}")

        result = asyncio.run(publish_tiktok_video(
            channel_id=channel_id,
            video_path=video_path,
            caption=caption,
            hashtags=hashtags,
            db_path=db_path,
            log_cb=publisher_log,
        ))

        if result.get("success"):
            task_info["status"] = "completed"
            task_info["progress"] = 100
            task_info["result"] = {
                "project_id": project_id,
                "channel_id": channel_id,
                "result_url": result.get("result_url", ""),
            }
            log_cb("✅ Đăng video lên TikTok thành công!", 100)
        else:
            task_info["status"] = "error"
            task_info["error"] = result.get("error", "Không rõ lỗi")
            log_cb(f"❌ Đăng lỗi: {result.get('error')}")
    except Exception as exc:
        task_info["status"] = "error"
        task_info["error"] = str(exc)
        _append_log(task_info, f"[LỖI] {exc}")


@remake_router.post("/projects/{project_id}/publish")
def publish_remake_project(
    project_id: str,
    req: PublishRemakeRequest,
    background_tasks: BackgroundTasks,
):
    """Đăng video của một project remake đã hoàn thành lên kênh TikTok.

    Tìm video preview MP4 hoặc audio master, ghép với poster tạo video
    rồi upload qua tiktok_publisher.
    """
    _validate_project_id(project_id)
    projects = _load_projects()
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Không tìm thấy project")

    # Tìm video đã xuất — ưu tiên preview MP4, rồi video master
    static_dir = Path(__file__).resolve().parent / "static"
    candidates = [
        static_dir / f"remake_{project_id}_preview.mp4",
        static_dir / f"remake_{project_id}_video.mp4",
    ]
    # Nếu chưa có video preview, tìm source video gốc trong project
    source_file = project.get("source", "")
    if source_file:
        project_source = static_dir / "remake_projects" / project_id / f"source{Path(source_file).suffix.lower()}"
        candidates.append(project_source)
        # Thêm file nguồn ở project root
        candidates.append(Path(__file__).resolve().parent.parent / source_file)

    video_path = None
    for candidate in candidates:
        if candidate.is_file() and candidate.suffix.lower() in ALLOWED_VIDEO_SUFFIXES:
            video_path = candidate
            break

    if not video_path:
        raise HTTPException(
            status_code=409,
            detail="Chưa có video đã xuất cho project này. Hãy chạy remake trước.",
        )

    caption = req.caption.strip() or f"Remake 2D · {project.get('theme_label', project_id)}"

    task_id = str(uuid.uuid4())[:8]
    _register_task(task_id, {
        "id": task_id,
        "video": video_path.name,
        "status": "pending",
        "progress": 0,
        "current_step": "Chuẩn bị đăng video lên TikTok…",
        "logs": [f"Publish task: project={project_id}, kênh={req.channel_id}"],
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "created_ts": time.time(),
        "result": None,
    })

    background_tasks.add_task(
        background_publish_worker,
        task_id, project_id, req.channel_id,
        str(video_path), caption, req.hashtags,
    )
    return {
        "success": True,
        "task_id": task_id,
        "video": video_path.name,
        "message": f"Đã đưa vào hàng đợi đăng TikTok cho kênh #{req.channel_id}",
    }
