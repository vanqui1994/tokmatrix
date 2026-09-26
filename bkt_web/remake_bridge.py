"""
TokMatrix — Cầu nối Remake Video ↔ tác nhân Antigravity.

Khác với bridge ảnh (antigravity_agent.py) chỉ xin một tấm ảnh, bridge này giao
cho Antigravity nguyên một "gói dựng nhân vật" của video remake:

    Server làm                        Antigravity làm               Server làm nốt
    ─────────────────────────────     ──────────────────────────    ─────────────────
    tách audio, ASR, chuyển thể   →   xem keyframe, phân tích   →   dựng animation
    kịch bản Việt, sinh TTS            vẽ nhân vật (PNG nền        (nhép môi theo cue,
                                       trong suốt), đo rig mặt      chớp mắt theo rig),
                                       (mắt/miệng/nhịp chớp)        lồng tiếng, trả web

Vì sao chia như vậy: nhép môi và chớp mắt cần biết toạ độ mắt/miệng trên từng
sprite. Antigravity là bên duy nhất "nhìn" được sprite nó vừa vẽ nên nó đo rig;
thiếu rig thì renderer tự dò vùng đầu từ kênh alpha. Phần render 60fps và mux
audio vẫn để server làm cho nhanh và ổn định.

Tác nhân chạy bất đồng bộ: pipeline không chờ. Tạo task xong thì project ở trạng
thái `waiting_antigravity`; khi agent nộp bài, `finalize_task()` mới dựng video và
cập nhật registry để web thấy.

Quy ước thư mục dùng chung với bridge ảnh:
    storage/antigravity_bridge/inbox/<task_id>.json   gói việc (máy đọc)
    storage/antigravity_bridge/inbox/<task_id>.md     hướng dẫn (agent đọc)
    storage/antigravity_bridge/inbox/<task_id>/       keyframes + cues.json
    storage/antigravity_bridge/outbox/<task_id>/      nơi agent nộp bài
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STORAGE_DIR = BASE_DIR / "storage"
BRIDGE_ROOT = Path(
    os.environ.get("TOKMATRIX_ANTIGRAVITY_BRIDGE_DIR", STORAGE_DIR / "antigravity_bridge")
)
TASKS_FILE = STORAGE_DIR / "remake_bridge_tasks.json"

SCHEMA = "tokmatrix.antigravity-remake/v1"
STATUS_PENDING = "pending"
STATUS_WAITING = "waiting_antigravity"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

VALID_SPRITE_EXTS = {".png", ".webp"}
_STORE_LOCK = threading.Lock()


# --------------------------------------------------------------- lưu trạng thái


def _dirs() -> Dict[str, Path]:
    dirs = {name: BRIDGE_ROOT / name for name in ("inbox", "outbox", "archive", "failed")}
    BRIDGE_ROOT.mkdir(parents=True, exist_ok=True)
    for path in dirs.values():
        path.mkdir(parents=True, exist_ok=True)
    return dirs


def _safe_id(task_id: str) -> str:
    clean = "".join(ch for ch in str(task_id) if ch.isalnum() or ch in "_-")
    if not clean or clean != str(task_id):
        raise ValueError(f"Task id không an toàn: {task_id!r}")
    return clean


def _atomic_write_json(path: Path, data: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_tasks() -> List[Dict[str, Any]]:
    if not TASKS_FILE.exists():
        return []
    try:
        loaded = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, list) else []
    except (OSError, ValueError):
        # Giữ nguyên tinh thần register_project: hỏng thì sao lưu, không xoá trắng.
        backup = TASKS_FILE.with_suffix(f".corrupt-{int(time.time())}.json")
        try:
            TASKS_FILE.replace(backup)
        except OSError:
            pass
        return []


def save_task(entry: Dict[str, Any]) -> None:
    with _STORE_LOCK:
        tasks = [t for t in load_tasks() if t.get("task_id") != entry["task_id"]]
        tasks.insert(0, entry)
        STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        _atomic_write_json(TASKS_FILE, tasks[:100])


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    tid = _safe_id(task_id)
    return next((t for t in load_tasks() if t.get("task_id") == tid), None)


def list_tasks(status: Optional[str] = None) -> List[Dict[str, Any]]:
    tasks = load_tasks()
    if status:
        tasks = [t for t in tasks if t.get("status") == status]
    return tasks


def _update(task_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    task = get_task(task_id)
    if task is None:
        return None
    task.update(fields)
    task["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_task(task)
    return task


# ------------------------------------------------------------------ tạo gói việc


def create_task(
    *,
    slug: str,
    video_path: Path,
    keyframes: List[Path],
    characters: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    cues: List[Dict[str, Any]],
    audio_path: Path,
    duration: float,
    job_dir: Path,
    project_name: str = "",
    log: Optional[Callable[[str, int], None]] = None,
) -> Dict[str, Any]:
    """Đóng gói mọi thứ Antigravity cần rồi đặt vào inbox."""
    dirs = _dirs()
    task_id = _safe_id(f"remake_{int(time.time())}_{slug[:24]}")
    work_dir = dirs["inbox"] / task_id
    frames_dir = work_dir / "keyframes"
    frames_dir.mkdir(parents=True, exist_ok=True)
    out_dir = dirs["outbox"] / task_id
    (out_dir / "sprites").mkdir(parents=True, exist_ok=True)

    # Keyframe là thứ duy nhất agent "nhìn" được, chép hẳn vào gói cho gọn.
    frame_names = []
    for frame in keyframes:
        try:
            shutil.copy2(frame, frames_dir / frame.name)
            frame_names.append(frame.name)
        except OSError:
            continue

    cues_public = [
        {
            "start": round(float(c.get("start", 0)), 2),
            "end": round(float(c.get("end", 0)), 2),
            "text": c.get("text", ""),
            "character_id": c.get("character_id", ""),
            "speaker": c.get("speaker", c.get("speaker_id", "")),
        }
        for c in cues
    ]
    (work_dir / "cues.json").write_text(
        json.dumps(cues_public, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    payload = {
        "schema": SCHEMA,
        "task_id": task_id,
        "project_slug": slug,
        "project_name": project_name or slug,
        "duration": round(float(duration), 2),
        "source_video": str(video_path),
        "keyframes_dir": str(frames_dir),
        "keyframes": frame_names,
        "cues_file": str(work_dir / "cues.json"),
        "characters": characters,
        "scenes": scenes,
        "output_dir": str(out_dir),
        "sprites_dir": str(out_dir / "sprites"),
        "rig_file": str(out_dir / "rig.json"),
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    _atomic_write_json(dirs["inbox"] / f"{task_id}.json", payload)
    (dirs["inbox"] / f"{task_id}.md").write_text(_instructions(payload), encoding="utf-8")

    entry = {
        "task_id": task_id,
        "schema": SCHEMA,
        "project_slug": slug,
        "project_name": project_name or slug,
        "status": STATUS_WAITING,
        "duration": payload["duration"],
        "characters": characters,
        "scenes": scenes,
        "cues": cues_public,
        "audio_path": str(audio_path),
        "job_dir": str(job_dir),
        "source_video": str(video_path),
        "inbox_json": str(dirs["inbox"] / f"{task_id}.json"),
        "inbox_md": str(dirs["inbox"] / f"{task_id}.md"),
        "output_dir": str(out_dir),
        "created_at": payload["created_at"],
        "updated_at": payload["created_at"],
        "error": "",
        "preview_url": "",
    }
    save_task(entry)
    if log:
        log(f"Đã giao gói dựng nhân vật cho Antigravity (task {task_id})", 70)
    return entry


def _instructions(payload: Dict[str, Any]) -> str:
    chars = payload["characters"] or []
    char_lines = "\n".join(
        f"- `{c.get('id', '?')}` — {c.get('name', '?')}"
        + (f" · {c.get('description', '')}" if c.get("description") else "")
        for c in chars
    ) or "- (Vision chưa tách được nhân vật — tự xác định từ keyframe)"
    scene_lines = "\n".join(
        f"- Cảnh {i}: {s.get('action', '(không mô tả)')} · tâm trạng `{s.get('mood', 'happy')}`"
        for i, s in enumerate(payload["scenes"] or [])
    ) or "- (chưa tách cảnh)"

    return f"""# Antigravity remake task `{payload['task_id']}`

Dự án **{payload['project_name']}** · thời lượng `{payload['duration']}s`.

Việc của bạn: **xem keyframe → vẽ nhân vật → đo rig khuôn mặt**. Không cần dựng
video và không cần lồng tiếng — server tự làm hai phần đó sau khi bạn nộp bài.

## Nguyên liệu

- Keyframe video gốc: `{payload['keyframes_dir']}` ({len(payload['keyframes'])} ảnh)
- Lời thoại tiếng Việt đã căn thời gian: `{payload['cues_file']}`
- Video gốc (nếu cần xem kỹ): `{payload['source_video']}`

## Nhân vật Vision đã nhận ra

{char_lines}

## Cảnh

{scene_lines}

## Bàn giao bắt buộc

### 1. Sprite nhân vật → `{payload['sprites_dir']}`

Mỗi nhân vật một file PNG **nền trong suốt**, đặt tên đúng bằng id ở trên
(ví dụ `{(chars[0].get('id') if chars else 'char_1')}.png`). Yêu cầu:

- Nhìn thẳng, toàn thân hoặc nửa người, đầu không bị cắt
- **Chừa sẵn mắt và miệng ở tư thế đóng/nghỉ** — server sẽ vẽ đè mắt chớp và
  miệng nhép lên trên, nên đừng vẽ miệng đang há to
- Phong cách 2D vector, cute, hợp TikTok; không chữ, không watermark
- Nền cảnh (tuỳ chọn): `bg_scene_0.png`, `bg_scene_1.png`… tỉ lệ 9:16

### Cel nguyên dáng (khi scene có `renderer: hand-drawn-canvas-v1`)

Không ghép tay/chân như puppet. Vẽ lại toàn bộ silhouette cho các key và
breakdown quan trọng (anticipation, contact, recovery), rồi đặt tên
`<character_id>__<drawing_id>.png` — ví dụ `farmer__lean_back.png`. Ghi đúng
`drawing_id` đó vào pose tương ứng trong storyboard. Cel được giữ nguyên nét
trong suốt exposure; chỉ dùng inbetween khi hình học thực sự tương ứng.

### 2. Rig khuôn mặt → `{payload['rig_file']}`

Đây là phần **quyết định nhép môi và chớp mắt có chạy hay không**. Với mỗi
sprite bạn vừa vẽ, đo vị trí mắt/miệng theo **tỉ lệ so với kích thước sprite**
(gốc toạ độ là tâm sprite, trục y hướng xuống — giá trị âm là phía trên tâm):

```json
{{
  "{(chars[0].get('id') if chars else 'char_1')}": {{
    "eyeL":  {{ "dx": -0.070, "dy": -0.300, "r": 0.045 }},
    "eyeR":  {{ "dx":  0.070, "dy": -0.300, "r": 0.045 }},
    "mouth": {{ "dx":  0.000, "dy": -0.235, "mw": 0.042, "mh": 0.018 }},
    "blinkPeriod": 3.4,
    "blinkOffset": 0.0,
    "eyeFill": "#ffffff"
  }}
}}
```

- `dx`/`dy`: tâm mắt/miệng, đơn vị = tỉ lệ chiều rộng/cao sprite
- `r`: bán kính mắt · `mw`/`mh`: nửa rộng/nửa cao miệng lúc đóng
- `blinkPeriod`: giây giữa hai lần chớp (2.5–4.0 là tự nhiên)
- `blinkOffset`: lệch pha để các nhân vật không chớp cùng lúc
- `eyeFill`: màu lòng trắng mắt, khớp tông da nhân vật

Thiếu rig thì mặt nhân vật sẽ đứng im — sprite vẫn hiện nhưng không nhép môi.

## Sau khi nộp

```bash
python3 bkt_web/antigravity_remake.py complete {payload['task_id']}
```

Server sẽ dựng animation 60fps (nhép môi bám theo `cues.json`, chớp mắt theo
rig), lồng tiếng Việt đã sinh sẵn, rồi đẩy video lên web.

Không gọi `agentapi` để sinh ảnh — đó là language server của IDE, không phải API ảnh.
"""


# ---------------------------------------------------------------- nhận kết quả


def collect_submission(task_id: str) -> Dict[str, Any]:
    """Đọc bài nộp trong outbox, xác thực trước khi dựng video."""
    task = get_task(task_id)
    if task is None:
        raise ValueError(f"Không có task remake '{task_id}'")

    out_dir = Path(task["output_dir"])
    sprites_dir = out_dir / "sprites"
    if not sprites_dir.is_dir():
        raise ValueError(f"Chưa thấy thư mục sprite: {sprites_dir}")

    sprites = {
        p.stem.lower(): p
        for p in sorted(sprites_dir.iterdir())
        if p.suffix.lower() in VALID_SPRITE_EXTS
    }
    if not sprites:
        raise ValueError(
            f"Thư mục sprite rỗng: {sprites_dir}\n"
            f"  Cần ít nhất một PNG nền trong suốt đặt tên theo id nhân vật."
        )

    rigs: Dict[str, Any] = {}
    rig_file = out_dir / "rig.json"
    if rig_file.is_file():
        try:
            loaded = json.loads(rig_file.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                rigs = loaded
        except ValueError as exc:
            raise ValueError(f"rig.json không phải JSON hợp lệ: {exc}")

    characters = task.get("characters") or []
    char_ids = [c.get("id", "") for c in characters]
    missing_sprite = [cid for cid in char_ids if cid and cid.lower() not in sprites]
    missing_rig = [cid for cid in char_ids if cid and cid not in rigs]

    return {
        "task": task,
        "sprites": {k: str(v) for k, v in sprites.items()},
        "sprites_dir": str(sprites_dir),
        "rigs": rigs,
        "missing_sprite": missing_sprite,
        "missing_rig": missing_rig,
    }


def finalize_task(
    task_id: str,
    *,
    log: Optional[Callable[[str, int], None]] = None,
    strict: bool = False,
) -> Dict[str, Any]:
    """Dựng video từ bài nộp rồi cập nhật registry cho web thấy.

    Mặc định không chặn khi bài nộp còn thiếu: renderer tự dò rig từ sprite, và
    nhân vật chưa có sprite thì được vẽ thân tạm — nhép môi với chớp mắt vẫn
    chạy cho mọi nhân vật. Thiếu sót chỉ được cảnh báo để còn nộp bổ sung rồi
    dựng lại. `strict=True` mới bắt buộc đủ sprite và rig.
    """
    emit = log or (lambda msg, pct: print(f"[{pct}%] {msg}"))
    sub = collect_submission(task_id)
    task = sub["task"]

    if strict and (sub["missing_sprite"] or sub["missing_rig"]):
        problems = []
        if sub["missing_sprite"]:
            problems.append("thiếu sprite: " + ", ".join(sub["missing_sprite"]))
        if sub["missing_rig"]:
            problems.append("thiếu rig: " + ", ".join(sub["missing_rig"]))
        raise ValueError(" · ".join(problems) + f"\n  Nộp bổ sung vào {sub['sprites_dir']}")

    if sub["missing_sprite"]:
        emit(
            "Chưa có sprite cho: " + ", ".join(sub["missing_sprite"])
            + " — vẽ thân tạm, mặt vẫn nhép môi và chớp mắt",
            72,
        )
    if sub["missing_rig"]:
        emit(
            "Chưa có rig cho: " + ", ".join(sub["missing_rig"])
            + " — renderer tự dò vùng đầu từ sprite",
            73,
        )

    try:
        from bkt_web.remake_composer import compose_animated_video
    except ImportError:
        from remake_composer import compose_animated_video

    slug = task["project_slug"]
    audio_path = Path(task["audio_path"])
    output_path = STATIC_DIR / f"remake_{slug}_preview.mp4"

    emit("Đang dựng animation từ sprite Antigravity (nhép môi + chớp mắt)...", 75)
    result = compose_animated_video(
        project_slug=slug,
        characters=task.get("characters") or [],
        scenes=task.get("scenes") or [],
        cues=task.get("cues") or [],
        audio_path=audio_path,
        output_path=output_path,
        duration=float(task.get("duration") or 30.0),
        sprite_dir=Path(sub["sprites_dir"]),
        face_rigs=sub["rigs"],
        log=emit,
    )

    preview_url = ""
    if result and Path(result).exists():
        preview_url = f"/static/remake_{slug}_preview.mp4"
        emit(f"Video remake hoàn tất: {Path(result).name}", 95)
    else:
        emit("Chưa xuất được MP4 — vẫn còn bản HTML animation để xem trên trình duyệt", 95)

    _sync_registry(slug, preview_url, sub["rigs"])
    _archive(task_id)
    entry = _update(
        task_id,
        status=STATUS_COMPLETED,
        preview_url=preview_url,
        animated_html=f"/static/remake_{slug}_animated.html",
        sprite_count=len(sub["sprites"]),
        rig_count=len(sub["rigs"]),
        error="",
    )
    emit("Đã cập nhật project — web sẽ thấy ngay khi làm mới", 100)
    return entry or {}


def fail_task(task_id: str, error: str) -> Optional[Dict[str, Any]]:
    return _update(task_id, status=STATUS_FAILED, error=str(error)[:500])


def _sync_registry(slug: str, preview_url: str, rigs: Dict[str, Any]) -> None:
    """Ghi kết quả vào remake_projects.json để web hiển thị."""
    try:
        from bkt_web.remake_pipeline import PROJECTS_REGISTRY, register_project
    except ImportError:
        from remake_pipeline import PROJECTS_REGISTRY, register_project

    if not PROJECTS_REGISTRY.exists():
        return
    try:
        projects = json.loads(PROJECTS_REGISTRY.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if not isinstance(projects, list):
        return

    entry = next((p for p in projects if p.get("id") == slug), None)
    if entry is None:
        return
    if preview_url:
        entry["preview_url"] = preview_url
    entry["renderer"] = "antigravity-sprite"
    entry["badge"] = "ANTIGRAVITY 2D"
    entry["face_rig_count"] = len(rigs)
    entry["animated_html"] = f"/static/remake_{slug}_animated.html"
    register_project(entry)


def _archive(task_id: str) -> None:
    dirs = _dirs()
    tid = _safe_id(task_id)
    for name in (f"{tid}.json", f"{tid}.md"):
        src = dirs["inbox"] / name
        if src.exists():
            try:
                src.replace(dirs["archive"] / name)
            except OSError:
                pass
