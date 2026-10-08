"""Xưởng Tạo Ảnh AI — sinh ảnh tức thì, hàng đợi chạy ngầm, thư viện và kho prompt.

Hàng đợi dùng SQLite (không phải file JSON) và có worker chạy nền thật sự, theo
đúng mô hình của `run_upload_scheduler` trong server.py: một worker duy nhất,
khoá bằng `BEGIN IMMEDIATE`, đếm số lần thử và hẹn giờ thử lại.
"""

import io
import os
import time
import json
import uuid
import random
import zipfile
import threading
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, List

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import cf_image_fallback
    from bkt_web import muse_image
except ImportError:  # chạy trực tiếp trong thư mục bkt_web
    from db_utils import connect_db
    import cf_image_fallback
    import muse_image

image_router = APIRouter(prefix="/api/ai-images", tags=["ai_images"])

BASE_DIR = Path(__file__).resolve().parent
GENERATED_DIR = BASE_DIR / "static" / "generated_images"
STORAGE_DIR = BASE_DIR / "storage"
DB_PATH = BASE_DIR / "bkt_channels.db"
LEGACY_QUEUE_FILE = STORAGE_DIR / "image_queue.json"

GENERATED_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

QUEUE_STOP = threading.Event()
QUEUE_THREAD: Optional[threading.Thread] = None

MAX_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 45

# Engine do tác nhân NGOÀI (Antigravity) sinh ảnh rồi tự gọi
# POST /api/ai-images/queue/{task_id}/complete để báo kết quả.
# Worker nội bộ (Pollinations) KHÔNG được đụng vào các task này.
EXTERNAL_ENGINES = ("antigravity", "antigravity_queue")
_EXTERNAL_ENGINES_SQL = ",".join("?" * len(EXTERNAL_ENGINES))
# Engine có worker riêng trong server (muse_image.py điều khiển muse.ai qua Chrome CDP): Pollinations và bridge
# Antigravity đều không đụng vào.
SELF_HOSTED_ENGINES = ("muse",)
_NOT_INTERNAL = EXTERNAL_ENGINES + SELF_HOSTED_ENGINES
_NOT_INTERNAL_SQL = ",".join("?" * len(_NOT_INTERNAL))

# Các bộ máy sinh ảnh sẵn dùng (Pollinations — miễn phí, không cần API key).
AVAILABLE_MODELS = [
    {"id": "flux", "name": "Flux", "desc": "Chất lượng cao, chi tiết tốt nhất", "default": True},
    {"id": "turbo", "name": "Turbo", "desc": "Nhanh nhất, hợp thử ý tưởng", "default": False},
    {"id": "flux-realism", "name": "Flux Realism", "desc": "Ảnh thật, chân dung", "default": False},
    {"id": "flux-anime", "name": "Flux Anime", "desc": "Anime / manga", "default": False},
    {"id": "flux-3d", "name": "Flux 3D", "desc": "Render 3D, mascot", "default": False},
]
VALID_MODEL_IDS = {m["id"] for m in AVAILABLE_MODELS}

RATIO_DIMENSIONS = {
    "1:1": (1024, 1024),
    "9:16": (768, 1365),
    "16:9": (1365, 768),
    "4:3": (1024, 768),
    "3:4": (768, 1024),
}


# --------------------------------------------------------------------------- DB


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _db():
    return connect_db(DB_PATH)


def init_image_tables() -> None:
    """Tạo bảng và nạp dữ liệu cũ (hàng đợi JSON + metadata .json rời)."""
    conn = _db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS image_queue (
                id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                negative_prompt TEXT DEFAULT '',
                aspect_ratio TEXT DEFAULT '1:1',
                model TEXT DEFAULT 'flux',
                seed INTEGER,
                notes TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                attempt_count INTEGER DEFAULT 0,
                next_retry_at INTEGER DEFAULT 0,
                error_message TEXT DEFAULT '',
                image_url TEXT,
                image_filename TEXT,
                engine TEXT DEFAULT 'queue_worker',
                created_at TEXT,
                created_ts INTEGER DEFAULT 0,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_image_queue_status ON image_queue(status, next_retry_at);

            CREATE TABLE IF NOT EXISTS image_assets (
                filename TEXT PRIMARY KEY,
                prompt TEXT DEFAULT '',
                negative_prompt TEXT DEFAULT '',
                aspect_ratio TEXT DEFAULT '1:1',
                model TEXT DEFAULT '',
                seed INTEGER,
                engine TEXT DEFAULT 'instant_free',
                tags TEXT DEFAULT '',
                width INTEGER DEFAULT 0,
                height INTEGER DEFAULT 0,
                size_bytes INTEGER DEFAULT 0,
                created_at TEXT,
                created_ts INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_image_assets_ts ON image_assets(created_ts DESC);

            CREATE TABLE IF NOT EXISTS prompt_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                negative_prompt TEXT DEFAULT '',
                aspect_ratio TEXT DEFAULT '1:1',
                model TEXT DEFAULT 'flux',
                use_count INTEGER DEFAULT 0,
                created_at TEXT
            );
            """
        )
        conn.commit()
        _import_legacy_queue(conn)
        _sync_assets_from_disk(conn)
        # Task đang chạy dở khi tắt app -> trả về hàng đợi, trừ task còn file trong inbox:
        # agent Antigravity chạy ngoài app nên vẫn đang vẽ nó; trả về pending thì dự phòng
        # Cloudflare vẽ chen và một trong hai ảnh thành bản trùng.
        try:
            inbox = _bridge_dirs()["inbox"]
        except Exception:
            inbox = None
        for (task_id,) in conn.execute("SELECT id FROM image_queue WHERE status='processing'").fetchall():
            if inbox is not None and (inbox / f"{task_id}.md").exists():
                continue
            conn.execute("UPDATE image_queue SET status='pending', next_retry_at=0 WHERE id=?", (task_id,))
        conn.commit()
    finally:
        conn.close()


def _import_legacy_queue(conn) -> None:
    if not LEGACY_QUEUE_FILE.exists():
        return
    try:
        items = json.loads(LEGACY_QUEUE_FILE.read_text(encoding="utf-8"))
        if not isinstance(items, list):
            return
    except Exception:
        return

    for it in items:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO image_queue
                   (id, prompt, aspect_ratio, notes, status, image_url, image_filename,
                    engine, created_at, created_ts, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    it.get("id") or f"task_{uuid.uuid4().hex[:8]}",
                    it.get("prompt", ""),
                    it.get("aspect_ratio", "1:1"),
                    it.get("notes", ""),
                    it.get("status", "pending"),
                    it.get("image_url"),
                    it.get("image_filename"),
                    it.get("engine", "antigravity"),
                    it.get("created_at") or _now_str(),
                    int(time.time()),
                    it.get("updated_at") or _now_str(),
                ),
            )
        except Exception:
            continue
    conn.commit()
    try:
        LEGACY_QUEUE_FILE.rename(LEGACY_QUEUE_FILE.with_suffix(".json.imported"))
    except Exception:
        pass


def _sync_assets_from_disk(conn) -> None:
    """Đánh chỉ mục ảnh trong thư mục vào DB để thư viện không phải đọc N file JSON."""
    known = {r[0] for r in conn.execute("SELECT filename FROM image_assets")}
    valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
    on_disk = set()

    for p in GENERATED_DIR.iterdir():
        if p.suffix.lower() not in valid_exts:
            continue
        on_disk.add(p.name)
        if p.name in known:
            continue
        meta = {}
        meta_path = p.with_suffix(".json")
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta = {}
        st = p.stat()
        conn.execute(
            """INSERT OR REPLACE INTO image_assets
               (filename, prompt, negative_prompt, aspect_ratio, model, seed, engine,
                tags, width, height, size_bytes, created_at, created_ts)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p.name,
                meta.get("prompt") or p.stem.replace("_", " "),
                meta.get("negative_prompt", ""),
                meta.get("aspect_ratio", "1:1"),
                meta.get("model", ""),
                meta.get("seed"),
                meta.get("engine", "instant_free"),
                meta.get("tags", ""),
                meta.get("width", 0),
                meta.get("height", 0),
                meta.get("size_bytes", st.st_size),
                meta.get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime)),
                int(st.st_mtime),
            ),
        )

    # Ảnh đã bị xoá tay ngoài thư mục thì gỡ khỏi chỉ mục.
    for gone in known - on_disk:
        conn.execute("DELETE FROM image_assets WHERE filename=?", (gone,))
    conn.commit()


# ------------------------------------------------------------------- sinh ảnh


def _dimensions(aspect_ratio: str) -> tuple:
    return RATIO_DIMENSIONS.get((aspect_ratio or "").strip(), (1024, 1024))


def _build_url(prompt: str, negative: str, width: int, height: int, seed: int, model: str) -> str:
    full_prompt = prompt
    if negative:
        # Pollinations không có tham số negative riêng; nối vào prompt là cách chuẩn.
        full_prompt = f"{prompt} | avoid: {negative}"
    url = (
        f"https://image.pollinations.ai/prompt/{urllib.parse.quote(full_prompt)}"
        f"?width={width}&height={height}&seed={seed}&nologo=true"
    )
    if model:
        url += f"&model={model}"
    return url


def generate_image_file(
    prompt: str,
    *,
    negative_prompt: str = "",
    aspect_ratio: str = "1:1",
    model: str = "flux",
    seed: Optional[int] = None,
    engine: str = "instant_free",
    prefix: str = "instant",
) -> Dict[str, Any]:
    """Gọi Pollinations, lưu file + metadata + chỉ mục DB. Chạy đồng bộ (dùng trong thread)."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("Vui lòng nhập mô tả ảnh (prompt)")

    width, height = _dimensions(aspect_ratio)
    if seed is None:
        seed = random.randint(1, 99999999)
    model = model if model in VALID_MODEL_IDS else "flux"

    url = _build_url(prompt, negative_prompt, width, height, seed, model)
    content = b""
    with httpx.Client(timeout=90.0, follow_redirects=True) as client:
        resp = client.get(url)
        if resp.status_code != 200 or len(resp.content) < 1000:
            # Model bận -> thử lại bằng model mặc định của dịch vụ.
            resp = client.get(_build_url(prompt, negative_prompt, width, height, seed, ""))
        if resp.status_code != 200 or len(resp.content) < 1000:
            raise RuntimeError(f"Dịch vụ sinh ảnh trả về HTTP {resp.status_code}")
        content = resp.content

    filename = f"{prefix}_{int(time.time())}_{uuid.uuid4().hex[:6]}.jpg"
    target_path = GENERATED_DIR / filename
    target_path.write_bytes(content)

    metadata = {
        "filename": filename,
        "url": f"/static/generated_images/{filename}",
        "prompt": prompt,
        "negative_prompt": negative_prompt or "",
        "aspect_ratio": aspect_ratio,
        "model": model,
        "seed": seed,
        "width": width,
        "height": height,
        "engine": engine,
        "tags": "",
        "created_at": _now_str(),
        "size_bytes": len(content),
    }
    try:
        target_path.with_suffix(".json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception:
        pass

    conn = _db()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO image_assets
               (filename, prompt, negative_prompt, aspect_ratio, model, seed, engine,
                tags, width, height, size_bytes, created_at, created_ts)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (filename, prompt, negative_prompt or "", aspect_ratio, model, seed, engine,
             "", width, height, len(content), metadata["created_at"], int(time.time())),
        )
        conn.commit()
    finally:
        conn.close()

    return metadata


# ------------------------------------------------------------ worker hàng đợi


def run_image_queue_worker() -> None:
    """Worker đơn luồng: lấy từng task pending, sinh ảnh, ghi kết quả, thử lại khi lỗi."""
    while not QUEUE_STOP.wait(3):
        task = None
        conn = _db()
        try:
            now = int(time.time())
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                f"""SELECT id, prompt, negative_prompt, aspect_ratio, model, seed, attempt_count
                    FROM image_queue
                    WHERE status='pending'
                      AND (next_retry_at IS NULL OR next_retry_at <= ?)
                      AND COALESCE(engine, '') NOT IN ({_NOT_INTERNAL_SQL})
                    ORDER BY created_ts ASC LIMIT 1""",
                (now, *_NOT_INTERNAL),
            ).fetchone()
            if row:
                task = row
                conn.execute(
                    "UPDATE image_queue SET status='processing', updated_at=? WHERE id=?",
                    (_now_str(), row[0]),
                )
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
        finally:
            conn.close()

        if not task:
            continue

        task_id, prompt, negative, ratio, model, seed, attempts = task
        try:
            meta = generate_image_file(
                prompt,
                negative_prompt=negative or "",
                aspect_ratio=ratio or "1:1",
                model=model or "flux",
                seed=seed,
                engine="queue_worker",
                prefix="queue",
            )
            conn = _db()
            try:
                conn.execute(
                    """UPDATE image_queue
                       SET status='completed', image_url=?, image_filename=?, seed=?,
                           error_message='', updated_at=?, notes='Worker đã tạo xong'
                       WHERE id=?""",
                    (meta["url"], meta["filename"], meta["seed"], _now_str(), task_id),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            attempts = (attempts or 0) + 1
            failed = attempts >= MAX_ATTEMPTS
            conn = _db()
            try:
                conn.execute(
                    """UPDATE image_queue
                       SET status=?, attempt_count=?, next_retry_at=?, error_message=?, updated_at=?
                       WHERE id=?""",
                    (
                        "failed" if failed else "pending",
                        attempts,
                        0 if failed else int(time.time()) + RETRY_BACKOFF_SECONDS * attempts,
                        str(exc)[:300],
                        _now_str(),
                        task_id,
                    ),
                )
                conn.commit()
            finally:
                conn.close()


def start_image_queue_worker() -> None:
    global QUEUE_THREAD
    QUEUE_STOP.clear()
    if not QUEUE_THREAD or not QUEUE_THREAD.is_alive():
        QUEUE_THREAD = threading.Thread(
            target=run_image_queue_worker, name="image-queue-worker", daemon=True
        )
        QUEUE_THREAD.start()
    _start_bridge_worker()
    cf_image_fallback.start()
    muse_image.start()
    try:
        from bkt_web import muse_film, muse_remake
    except ImportError:
        import muse_film
        import muse_remake
    muse_film.start()
    muse_remake.start()
    try:
        from bkt_web import pov_channel
    except ImportError:
        import pov_channel
    pov_channel.start()


def stop_image_queue_worker() -> None:
    QUEUE_STOP.set()
    if QUEUE_THREAD and QUEUE_THREAD.is_alive():
        QUEUE_THREAD.join(timeout=5)
    _stop_bridge_worker()
    cf_image_fallback.stop()
    muse_image.stop()


# -------------------------------------------------- Bridge Auto Worker
# Worker tự động 2 việc:
#   1. Pull: task pending engine=antigravity → tạo gói .json+.md trong inbox
#      để tác nhân Antigravity IDE đọc và sinh ảnh.
#   2. Watch: quét outbox, thấy ảnh → import vào Thư viện + đóng task.
# Không gọi API bên ngoài — Antigravity IDE agent (chạy trong IDE) là engine.

BRIDGE_STOP = threading.Event()
BRIDGE_THREAD: Optional[threading.Thread] = None

# Số task tối đa nằm trong inbox cùng lúc (mỗi lượt agent xử lý hết inbox).
try:
    BRIDGE_MAX_PROCESSING = max(1, int(os.environ.get("TOKMATRIX_BRIDGE_MAX_TASKS", "8")))
except ValueError:
    BRIDGE_MAX_PROCESSING = 8


def _run_bridge_worker() -> None:
    """Worker: auto-pull pending tasks + auto-import outbox images, mỗi 5 giây."""
    while not BRIDGE_STOP.wait(5):
        try:
            _bridge_auto_pull()
        except Exception:
            pass
        try:
            _bridge_auto_import()
        except Exception:
            pass


def _bridge_auto_pull() -> None:
    """Pull task pending engine=antigravity vào inbox cho tới khi đủ BRIDGE_MAX_PROCESSING."""
    for _ in range(BRIDGE_MAX_PROCESSING):
        if not _bridge_pull_one():
            return


def _bridge_pull_one() -> bool:
    """Pull một task vào inbox. Trả False khi đã đủ giới hạn hoặc hết task pending."""
    dirs = _bridge_dirs()

    # Đếm task đang processing (đã pull nhưng chưa xong)
    conn = _db()
    try:
        processing = conn.execute(
            f"""SELECT COUNT(*) FROM image_queue
                WHERE status='processing'
                  AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})""",
            EXTERNAL_ENGINES,
        ).fetchone()[0]
    finally:
        conn.close()

    if processing >= BRIDGE_MAX_PROCESSING:
        return False  # Đủ task đang xử lý, không pull thêm

    # Lấy 1 task pending
    conn = _db()
    try:
        now = int(time.time())
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            f"""SELECT {QUEUE_COLUMNS} FROM image_queue
                WHERE status='pending'
                  AND (next_retry_at IS NULL OR next_retry_at <= ?)
                  AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})
                ORDER BY created_ts ASC LIMIT 1""",
            (now, *EXTERNAL_ENGINES),
        ).fetchone()
        if not row:
            conn.commit()
            return False

        task = _queue_row_to_dict(row)
        task_id = task["id"]

        # Claim nguyên tử
        conn.execute(
            "UPDATE image_queue SET status='processing', notes=?, updated_at=? WHERE id=?",
            ("⏳ Đã gửi cho Antigravity IDE — chờ agent sinh ảnh...", _now_str(), task_id),
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()

    # Tạo gói file trong inbox
    clean_id = "".join(ch for ch in task_id if ch.isalnum() or ch in "_-")
    if not clean_id or clean_id != task_id:
        return False

    ratio = task.get("aspect_ratio") or "1:1"
    width, height = _BRIDGE_RATIO_DIMS.get(ratio, _BRIDGE_RATIO_DIMS["1:1"])
    output_path = dirs["outbox"] / f"{clean_id}.png"

    payload = {
        "schema": "tokmatrix.antigravity-bridge/v1",
        "task_id": clean_id,
        "prompt": task.get("prompt", ""),
        "negative_prompt": task.get("negative_prompt", ""),
        "aspect_ratio": ratio,
        "recommended_size": {"width": width, "height": height},
        "seed": task.get("seed"),
        "notes": task.get("notes", ""),
        "output_path": str(output_path),
        "callback": f"/api/ai-images/queue/{clean_id}/complete",
        "claimed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    json_path = dirs["inbox"] / f"{clean_id}.json"
    md_path = dirs["inbox"] / f"{clean_id}.md"

    tmp_json = json_path.with_suffix(".json.tmp")
    tmp_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_json.replace(json_path)

    negative = payload["negative_prompt"] or "(không có)"
    md_content = f"""# Antigravity image task `{clean_id}`

Tạo đúng **một ảnh** trong Antigravity IDE. Không đổi nội dung, không thêm chữ,
logo hoặc watermark nếu prompt không yêu cầu.

## Prompt

{payload['prompt']}

## Tránh

{negative}

## Thông số

- Tỉ lệ: `{ratio}`
- Kích thước khuyến nghị: `{width} × {height}`
- Seed: `{payload['seed'] if payload['seed'] is not None else 'tự động'}`

## Bàn giao bắt buộc

Xuất PNG/JPG/WebP vào đúng đường dẫn sau (tên gốc phải là task id):

`{output_path}`

Bridge watcher sẽ tự kiểm tra ảnh, chép vào Thư viện TokMatrix và đóng task.
"""
    tmp_md = md_path.with_suffix(".md.tmp")
    tmp_md.write_text(md_content, encoding="utf-8")
    tmp_md.replace(md_path)
    return True


def _bridge_auto_import() -> None:
    """Quét outbox, thấy ảnh thì import vào Thư viện + đóng task."""
    dirs = _bridge_dirs()

    if not dirs["outbox"].exists():
        return

    image_files = [
        p for p in dirs["outbox"].iterdir()
        if p.is_file() and p.suffix.lower() in _BRIDGE_VALID_EXTS
    ]
    if not image_files:
        return

    for image_path in image_files:
        task_id = image_path.stem
        try:
            clean = "".join(ch for ch in task_id if ch.isalnum() or ch in "_-")
            if not clean or clean != task_id:
                continue

            conn = _db()
            try:
                row = conn.execute(
                    f"SELECT {QUEUE_COLUMNS} FROM image_queue WHERE id=?", (task_id,)
                ).fetchone()
            finally:
                conn.close()

            if not row:
                continue
            task = _queue_row_to_dict(row)
            if task.get("engine") not in EXTERNAL_ENGINES:
                continue
            # Ảnh do dự phòng (cf_image_fallback: ImageRouter hoặc Cloudflare Worker) vẽ có file đánh dấu đi kèm.
            marker_path = dirs["outbox"] / f"{task_id}.cf.json"
            fallback = cf_image_fallback.read_marker(marker_path)
            if task.get("status") == "completed":
                # Agent vẽ lại task đã xong (chạy chồng hoặc sau restart): cất
                # bản trùng, không thêm ảnh thứ hai vào Thư viện, không đổi
                # ảnh mà task (và video dùng nó) đang trỏ tới.
                dup_path = dirs["archive"] / f"{task_id}-dup-{int(time.time())}{image_path.suffix.lower()}"
                shutil.move(str(image_path), dup_path)
                if marker_path.exists():
                    shutil.move(str(marker_path), dirs["archive"] / f"{task_id}-dup-{int(time.time())}.cf.json")
                continue

            # Chép ảnh vào thư viện
            GENERATED_DIR.mkdir(parents=True, exist_ok=True)
            ext = image_path.suffix.lower()
            via_router = bool(fallback) and fallback.get("engine") == "imagerouter"
            via_gemini = bool(fallback) and fallback.get("engine") == "gemini_web"
            prefix = ("gemini" if via_gemini else "imagerouter" if via_router else "cfworker") if fallback else "antigravity"
            filename = f"{prefix}_{int(time.time())}_{task_id.split('_')[-1]}{ext}"
            if fallback:
                model = fallback.get("model") or cf_image_fallback.MODEL_ID
                engine = fallback["engine"]
                tags = "gemini-web,fallback" if via_gemini else "imagerouter,fallback" if via_router else "cf-worker,fallback"
            else:
                model, engine, tags = "antigravity-ide", "antigravity", "antigravity,ide-bridge"
            dest = GENERATED_DIR / filename
            shutil.copy2(str(image_path), dest)

            img_width, img_height = 0, 0
            try:
                from PIL import Image as _PIL_Image
                with _PIL_Image.open(dest) as im:
                    img_width, img_height = im.size
            except Exception:
                pass

            sidecar = {
                "filename": filename,
                "url": f"/static/generated_images/{filename}",
                "prompt": task.get("prompt", ""),
                "negative_prompt": task.get("negative_prompt", ""),
                "aspect_ratio": task.get("aspect_ratio") or "1:1",
                "model": model,
                "seed": task.get("seed"),
                "width": img_width, "height": img_height,
                "engine": engine,
                "tags": tags,
                **({"prompt_sent": fallback.get("prompt_sent", "")} if fallback else {}),
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "size_bytes": dest.stat().st_size,
            }
            dest.with_suffix(".json").write_text(
                json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            # Insert vào gallery DB
            conn2 = _db()
            try:
                conn2.execute(
                    """INSERT OR REPLACE INTO image_assets
                       (filename, prompt, negative_prompt, aspect_ratio, model, seed, engine,
                        tags, width, height, size_bytes, created_at, created_ts)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (filename, task.get("prompt", ""), task.get("negative_prompt", ""),
                     task.get("aspect_ratio") or "1:1", model, task.get("seed"),
                     engine, tags, img_width, img_height,
                     dest.stat().st_size, sidecar["created_at"], int(time.time())),
                )
                conn2.commit()
            finally:
                conn2.close()

            # Đánh dấu task completed
            conn3 = _db()
            try:
                conn3.execute(
                    """UPDATE image_queue
                       SET status='completed', image_filename=?, image_url=?, model=?,
                           error_message='', notes=?, updated_at=?
                       WHERE id=?""",
                    (filename, f"/static/generated_images/{filename}", model,
                     (f"✅ Dự phòng ImageRouter {model[len('imagerouter:'):]} (Antigravity hết quota/chờ quá lâu)"
                      if via_router else
                      "✅ Dự phòng Cloudflare Worker (Antigravity hết quota/chờ quá lâu)" if fallback
                      else "✅ Hoàn thành bởi Antigravity IDE (tự động)"), _now_str(), task_id),
                )
                conn3.commit()
            finally:
                conn3.close()

            # Di chuyển vào archive
            archive_path = dirs["archive"] / f"{task_id}{ext}"
            if archive_path.exists():
                archive_path = dirs["archive"] / f"{task_id}-{int(time.time())}{ext}"
            shutil.move(str(image_path), archive_path)
            if marker_path.exists():
                shutil.move(str(marker_path), dirs["archive"] / marker_path.name)
            for suffix in (".json", ".md"):
                req_file = dirs["inbox"] / f"{task_id}{suffix}"
                if req_file.exists():
                    shutil.move(str(req_file), dirs["archive"] / req_file.name)

        except Exception:
            pass


def _start_bridge_worker() -> None:
    global BRIDGE_THREAD
    BRIDGE_STOP.clear()
    if not BRIDGE_THREAD or not BRIDGE_THREAD.is_alive():
        BRIDGE_THREAD = threading.Thread(
            target=_run_bridge_worker, name="bridge-auto-worker", daemon=True
        )
        BRIDGE_THREAD.start()


def _stop_bridge_worker() -> None:
    BRIDGE_STOP.set()
    if BRIDGE_THREAD and BRIDGE_THREAD.is_alive():
        BRIDGE_THREAD.join(timeout=5)


# ------------------------------------------------------------------ mô hình dữ liệu


class GenerateInstantRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
    aspect_ratio: str = "1:1"
    model: str = "flux"
    seed: Optional[int] = None
    batch_size: int = 1


class EnqueueRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
    aspect_ratio: str = "1:1"
    model: str = "flux"
    seed: Optional[int] = None
    batch_size: int = 1
    notes: Optional[str] = ""
    engine: Optional[str] = "antigravity"


class CompleteQueueItemRequest(BaseModel):
    image_filename: str
    notes: Optional[str] = ""


class ClaimQueueItemRequest(BaseModel):
    worker_id: str = "antigravity-ide"


class FailQueueItemRequest(BaseModel):
    error: str
    retry: bool = False


class BulkFilesRequest(BaseModel):
    filenames: List[str]


class TagsRequest(BaseModel):
    tags: str = ""


class PromptSaveRequest(BaseModel):
    name: str
    prompt: str
    negative_prompt: Optional[str] = ""
    aspect_ratio: str = "1:1"
    model: str = "flux"


# ----------------------------------------------------------------- endpoints


@image_router.get("/models")
def list_models():
    return {"success": True, "models": AVAILABLE_MODELS, "ratios": list(RATIO_DIMENSIONS.keys())}


@image_router.post("/generate-instant")
async def generate_instant(req: GenerateInstantRequest):
    """Sinh ảnh tức thì (1–4 ảnh) qua Pollinations, miễn phí, không cần API key."""
    import asyncio

    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Vui lòng nhập mô tả ảnh (prompt)")

    batch = max(1, min(int(req.batch_size or 1), 4))
    images: List[Dict[str, Any]] = []
    errors: List[str] = []

    for i in range(batch):
        # Cùng seed cho mọi ảnh trong lô sẽ ra ảnh giống hệt -> lệch seed theo chỉ số.
        seed = (req.seed + i) if req.seed is not None else None
        try:
            meta = await asyncio.to_thread(
                generate_image_file,
                prompt,
                negative_prompt=req.negative_prompt or "",
                aspect_ratio=req.aspect_ratio,
                model=req.model,
                seed=seed,
                engine="instant_free",
                prefix="instant",
            )
            images.append(meta)
        except Exception as exc:
            errors.append(str(exc))

    if not images:
        raise HTTPException(status_code=502, detail=errors[0] if errors else "Không tạo được ảnh")

    return {
        "success": True,
        "message": f"Đã tạo {len(images)}/{batch} ảnh!",
        "image": images[0],
        "images": images,
        "errors": errors,
    }


@image_router.post("/queue")
def enqueue_image(req: EnqueueRequest):
    """Đưa yêu cầu vào hàng đợi."""
    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Vui lòng nhập mô tả ảnh (prompt)")

    batch = max(1, min(int(req.batch_size or 1), 4))
    created = []
    engine_val = req.engine or "antigravity"
    conn = _db()
    try:
        for i in range(batch):
            task_id = f"task_{int(time.time())}_{uuid.uuid4().hex[:6]}"
            seed = (req.seed + i) if req.seed is not None else None
            default_notes = "Đang chờ Antigravity xử lý (8K không watermark)" if engine_val == "antigravity" else "Đang chờ worker xử lý"
            conn.execute(
                """INSERT INTO image_queue
                   (id, prompt, negative_prompt, aspect_ratio, model, seed, notes, status,
                    attempt_count, next_retry_at, engine, created_at, created_ts, updated_at)
                   VALUES (?,?,?,?,?,?,?,'pending',0,0,?,?,?,?)""",
                (
                    task_id, prompt, req.negative_prompt or "", req.aspect_ratio,
                    req.model if req.model in VALID_MODEL_IDS else "flux", seed,
                    req.notes or default_notes, engine_val, _now_str(), int(time.time()) + i, _now_str(),
                ),
            )
            created.append(task_id)
        conn.commit()
    finally:
        conn.close()

    msg = f"Đã thêm {len(created)} yêu cầu vào Hàng Đợi Antigravity!" if engine_val == "antigravity" else f"Đã thêm {len(created)} yêu cầu vào hàng đợi!"
    return {
        "success": True,
        "message": msg,
        "task_ids": created,
        "engine": engine_val,
    }


def _queue_row_to_dict(r) -> Dict[str, Any]:
    return {
        "id": r[0], "prompt": r[1], "negative_prompt": r[2], "aspect_ratio": r[3],
        "model": r[4], "seed": r[5], "notes": r[6], "status": r[7],
        "attempt_count": r[8], "error_message": r[9], "image_url": r[10],
        "image_filename": r[11], "engine": r[12], "created_at": r[13], "updated_at": r[14],
    }


QUEUE_COLUMNS = """id, prompt, negative_prompt, aspect_ratio, model, seed, notes, status,
                   attempt_count, error_message, image_url, image_filename, engine,
                   created_at, updated_at"""


# Trạng thái pool tài khoản Antigravity do tokmatrix-rotator xuất (không chứa token).
ACCOUNT_STATUS_FILE = Path(os.environ.get("TOKMATRIX_ACCOUNT_STATUS_FILE",
                                          "/var/lib/tokmatrix-bridge/accounts_status.json"))


@image_router.get("/antigravity-accounts")
def antigravity_accounts():
    """Bảng "Quota Antigravity" trong Cài Đặt: quota ảnh/chữ từng tài khoản, hàng đợi, dự phòng CF."""
    try:
        pool = json.loads(ACCOUNT_STATUS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        pool = None
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Không đọc được {ACCOUNT_STATUS_FILE.name}: {exc}")
    conn = _db()
    try:
        rows = conn.execute(
            f"""SELECT status, COUNT(*) FROM image_queue
                WHERE COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL}) AND status IN ('pending', 'processing')
                GROUP BY status""",
            EXTERNAL_ENGINES,
        ).fetchall()
        since = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - 24 * 3600))
        done = conn.execute(
            f"""SELECT COALESCE(model, ''), COUNT(*) FROM image_queue
                WHERE COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL}) AND status='completed' AND updated_at >= ?
                GROUP BY COALESCE(model, '')""",
            (*EXTERNAL_ENGINES, since),
        ).fetchall()
    finally:
        conn.close()
    completed = {"antigravity": 0, "imagerouter": 0, "cf_worker": 0}
    for model, count in done:
        if model == cf_image_fallback.MODEL_ID:
            completed["cf_worker"] += count
        elif model.startswith(cf_image_fallback.imagerouter_image.MODEL_PREFIX):
            completed["imagerouter"] += count
        else:
            completed["antigravity"] += count
    try:
        fallback = cf_image_fallback.status()
    except Exception as exc:  # trạng thái phụ, không làm hỏng cả bảng
        fallback = {"error": str(exc)}
    return {
        "now": int(time.time()),
        "pool": pool,
        "queue": {status: count for status, count in rows},
        "completed_24h": completed,
        "cf_fallback": fallback,
    }


@image_router.get("/cf-fallback/status")
def cf_fallback_status():
    """Trạng thái dự phòng Cloudflare Worker (bật/tắt, token, Antigravity còn bị chặn quota tới khi nào)."""
    return cf_image_fallback.status()


@image_router.get("/muse/status")
def muse_status():
    """Engine muse (muse.ai qua Chrome CDP): Chrome có chạy, worker, ảnh xong/lỗi, lỗi gần nhất."""
    return muse_image.status()


@image_router.get("/imagerouter/status")
def imagerouter_status(credits: bool = True):
    """Dự phòng ImageRouter: model, chi tiêu hôm nay so với trần, credit còn lại của tài khoản."""
    return cf_image_fallback.imagerouter_image.status(include_credits=credits)


@image_router.get("/queue")
def get_queue(
    status: Optional[str] = Query(None),
    engine: Optional[str] = Query(None, description="Lọc theo engine, vd 'antigravity' để tác nhân ngoài lấy đúng phần việc của mình"),
):
    conn = _db()
    try:
        sql = f"SELECT {QUEUE_COLUMNS} FROM image_queue"
        where: List[str] = []
        params: List[Any] = []
        if status:
            where.append("status=?")
            params.append(status)
        if engine:
            where.append("COALESCE(engine, '')=?")
            params.append(engine)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY created_ts DESC"
        rows = conn.execute(sql, params).fetchall()
        counts = dict(conn.execute("SELECT status, COUNT(*) FROM image_queue GROUP BY status").fetchall())
    finally:
        conn.close()

    queue = [_queue_row_to_dict(r) for r in rows]
    return {
        "success": True,
        "queue": queue,
        "total": len(queue),
        "pending_count": counts.get("pending", 0) + counts.get("processing", 0),
        "processing_count": counts.get("processing", 0),
        "completed_count": counts.get("completed", 0),
        "failed_count": counts.get("failed", 0),
        "worker_alive": bool(QUEUE_THREAD and QUEUE_THREAD.is_alive()),
    }


@image_router.delete("/queue/{task_id}")
def delete_queue_item(task_id: str):
    conn = _db()
    try:
        cur = conn.execute("DELETE FROM image_queue WHERE id=?", (task_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task")
    finally:
        conn.close()
    return {"success": True, "message": "Đã xoá yêu cầu khỏi hàng đợi"}


@image_router.post("/queue/{task_id}/retry")
def retry_queue_item(task_id: str):
    """Đưa một task lỗi trở lại hàng đợi."""
    conn = _db()
    try:
        cur = conn.execute(
            """UPDATE image_queue
               SET status='pending', attempt_count=0, next_retry_at=0,
                   error_message='', notes='Đã đưa lại vào hàng đợi', updated_at=?
               WHERE id=? AND status IN ('failed','completed')""",
            (_now_str(), task_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task cần chạy lại")
    finally:
        conn.close()
    return {"success": True, "message": "Đã đưa task trở lại hàng đợi"}


@image_router.post("/queue/{task_id}/claim")
def claim_external_queue_item(task_id: str, req: ClaimQueueItemRequest):
    """Claim nguyên tử một task Antigravity để nhiều IDE agent không làm trùng."""
    worker_id = (req.worker_id or "antigravity-ide").strip()[:80]
    conn = _db()
    try:
        cur = conn.execute(
            f"""UPDATE image_queue
                SET status='processing', notes=?, updated_at=?
                WHERE id=? AND status='pending'
                  AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})""",
            (f"Antigravity IDE đang xử lý · {worker_id}", _now_str(), task_id, *EXTERNAL_ENGINES),
        )
        conn.commit()
        if cur.rowcount == 0:
            row = conn.execute(
                f"SELECT {QUEUE_COLUMNS} FROM image_queue WHERE id=?", (task_id,)
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Không tìm thấy task")
            task = _queue_row_to_dict(row)
            if task["engine"] not in EXTERNAL_ENGINES:
                raise HTTPException(status_code=409, detail="Task không thuộc Antigravity")
            raise HTTPException(status_code=409, detail=f"Task đã ở trạng thái {task['status']}")
        row = conn.execute(
            f"SELECT {QUEUE_COLUMNS} FROM image_queue WHERE id=?", (task_id,)
        ).fetchone()
        task = _queue_row_to_dict(row)
    finally:
        conn.close()
    return {"success": True, "message": "Đã claim task cho Antigravity IDE", "task": task}


@image_router.post("/queue/{task_id}/fail")
def fail_external_queue_item(task_id: str, req: FailQueueItemRequest):
    """IDE agent báo lỗi; có thể trả task về pending để làm lại."""
    error = (req.error or "Antigravity IDE không tạo được ảnh").strip()[:1000]
    status = "pending" if req.retry else "failed"
    conn = _db()
    try:
        cur = conn.execute(
            f"""UPDATE image_queue
                SET status=?, error_message=?, notes=?, updated_at=?
                WHERE id=? AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})""",
            (status, error, error, _now_str(), task_id, *EXTERNAL_ENGINES),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task Antigravity")
    finally:
        conn.close()
    return {"success": True, "status": status, "message": "Đã cập nhật lỗi từ Antigravity IDE"}


@image_router.post("/queue/clear-completed")
def clear_completed_queue():
    conn = _db()
    try:
        cur = conn.execute("DELETE FROM image_queue WHERE status IN ('completed','failed')")
        conn.commit()
        removed = cur.rowcount
    finally:
        conn.close()
    return {"success": True, "message": f"Đã dọn {removed} mục đã xong/lỗi", "removed": removed}


@image_router.post("/queue/{task_id}/complete")
def complete_queue_item(task_id: str, req: CompleteQueueItemRequest):
    """Giữ cho tác nhân ngoài (Antigravity/script) tự báo hoàn thành."""
    filename = Path(req.image_filename).name
    if filename != req.image_filename or Path(filename).suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=422, detail="Tên file ảnh kết quả không hợp lệ")
    if not (GENERATED_DIR / filename).is_file():
        raise HTTPException(status_code=422, detail="Ảnh kết quả chưa tồn tại trong thư viện")
    conn = _db()
    try:
        cur = conn.execute(
            """UPDATE image_queue
               SET status='completed', image_filename=?, image_url=?, notes=?, updated_at=?
               WHERE id=?""",
            (
                filename,
                f"/static/generated_images/{filename}",
                req.notes or "Hoàn thành bởi tác nhân ngoài",
                _now_str(),
                task_id,
            ),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy task trong hàng đợi")
    finally:
        conn.close()
    return {"success": True, "message": "Đã cập nhật hoàn thành task"}


@image_router.get("/gallery")
def get_gallery(
    q: Optional[str] = Query(None, description="Tìm trong prompt"),
    ratio: Optional[str] = Query(None),
    engine: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200),
):
    conn = _db()
    try:
        _sync_assets_from_disk(conn)
        where, params = [], []
        if q:
            where.append("(prompt LIKE ? OR tags LIKE ?)")
            params += [f"%{q}%", f"%{q}%"]
        if ratio:
            where.append("aspect_ratio=?")
            params.append(ratio)
        if engine:
            where.append("engine=?")
            params.append(engine)
        if tag:
            where.append("tags LIKE ?")
            params.append(f"%{tag}%")
        clause = (" WHERE " + " AND ".join(where)) if where else ""

        total = conn.execute(f"SELECT COUNT(*) FROM image_assets{clause}", params).fetchone()[0]
        rows = conn.execute(
            f"""SELECT filename, prompt, negative_prompt, aspect_ratio, model, seed, engine,
                       tags, width, height, size_bytes, created_at
                FROM image_assets{clause}
                ORDER BY created_ts DESC LIMIT ? OFFSET ?""",
            params + [page_size, (page - 1) * page_size],
        ).fetchall()
        all_tags = set()
        for (t,) in conn.execute("SELECT tags FROM image_assets WHERE tags != ''"):
            all_tags.update(x.strip() for x in (t or "").split(",") if x.strip())
    finally:
        conn.close()

    images = [
        {
            "filename": r[0], "url": f"/static/generated_images/{r[0]}", "prompt": r[1],
            "negative_prompt": r[2], "aspect_ratio": r[3], "model": r[4], "seed": r[5],
            "engine": r[6], "tags": r[7], "width": r[8], "height": r[9],
            "size_bytes": r[10], "created_at": r[11],
        }
        for r in rows
    ]
    return {
        "success": True,
        "images": images,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": page * page_size < total,
        "all_tags": sorted(all_tags),
    }


def _delete_one_image(filename: str) -> bool:
    safe_name = os.path.basename(filename)
    target_path = GENERATED_DIR / safe_name
    ok = False
    try:
        if target_path.exists():
            target_path.unlink()
            ok = True
        meta_path = target_path.with_suffix(".json")
        if meta_path.exists():
            meta_path.unlink()
    except Exception:
        return False
    conn = _db()
    try:
        conn.execute("DELETE FROM image_assets WHERE filename=?", (safe_name,))
        conn.commit()
    finally:
        conn.close()
    return ok


@image_router.delete("/gallery/{filename}")
def delete_image(filename: str):
    if not _delete_one_image(filename):
        raise HTTPException(status_code=404, detail="Không tìm thấy file ảnh")
    return {"success": True, "message": f"Đã xoá ảnh {os.path.basename(filename)}"}


@image_router.post("/gallery/bulk-delete")
def bulk_delete_images(req: BulkFilesRequest):
    removed = sum(1 for f in req.filenames if _delete_one_image(f))
    return {"success": True, "message": f"Đã xoá {removed}/{len(req.filenames)} ảnh", "removed": removed}


@image_router.post("/gallery/download-zip")
def download_zip(req: BulkFilesRequest):
    if not req.filenames:
        raise HTTPException(status_code=400, detail="Chưa chọn ảnh nào")

    buf = io.BytesIO()
    added = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in req.filenames[:500]:
            p = GENERATED_DIR / os.path.basename(name)
            if p.exists():
                zf.write(p, arcname=p.name)
                added += 1
    if added == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh nào để tải")

    buf.seek(0)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="anh_ai_{stamp}.zip"'},
    )


@image_router.put("/gallery/{filename}/tags")
def set_image_tags(filename: str, req: TagsRequest):
    safe_name = os.path.basename(filename)
    tags = ",".join(sorted({t.strip() for t in (req.tags or "").split(",") if t.strip()}))
    conn = _db()
    try:
        cur = conn.execute("UPDATE image_assets SET tags=? WHERE filename=?", (tags, safe_name))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy ảnh")
    finally:
        conn.close()

    meta_path = (GENERATED_DIR / safe_name).with_suffix(".json")
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            meta["tags"] = tags
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass
    return {"success": True, "tags": tags}


# --------------------------------------------------------------- kho prompt


@image_router.get("/prompts")
def list_prompts():
    conn = _db()
    try:
        rows = conn.execute(
            """SELECT id, name, prompt, negative_prompt, aspect_ratio, model, use_count, created_at
               FROM prompt_library ORDER BY use_count DESC, id DESC"""
        ).fetchall()
    finally:
        conn.close()
    return {
        "success": True,
        "prompts": [
            {"id": r[0], "name": r[1], "prompt": r[2], "negative_prompt": r[3],
             "aspect_ratio": r[4], "model": r[5], "use_count": r[6], "created_at": r[7]}
            for r in rows
        ],
    }


@image_router.post("/prompts")
def save_prompt(req: PromptSaveRequest):
    name = (req.name or "").strip()
    prompt = (req.prompt or "").strip()
    if not name or not prompt:
        raise HTTPException(status_code=400, detail="Cần tên gợi nhớ và nội dung prompt")
    conn = _db()
    try:
        cur = conn.execute(
            """INSERT INTO prompt_library
               (name, prompt, negative_prompt, aspect_ratio, model, use_count, created_at)
               VALUES (?,?,?,?,?,0,?)""",
            (name, prompt, req.negative_prompt or "", req.aspect_ratio, req.model, _now_str()),
        )
        conn.commit()
        new_id = cur.lastrowid
    finally:
        conn.close()
    return {"success": True, "message": f'Đã lưu prompt "{name}"', "id": new_id}


@image_router.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: int):
    conn = _db()
    try:
        cur = conn.execute("DELETE FROM prompt_library WHERE id=?", (prompt_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy prompt")
    finally:
        conn.close()
    return {"success": True, "message": "Đã xoá prompt"}


@image_router.post("/prompts/{prompt_id}/use")
def use_prompt(prompt_id: int):
    conn = _db()
    try:
        conn.execute("UPDATE prompt_library SET use_count=use_count+1 WHERE id=?", (prompt_id,))
        conn.commit()
    finally:
        conn.close()
    return {"success": True}


# -------------------------------------------------------- Antigravity Bridge UI


import shutil
import socket as _socket

_BRIDGE_ROOT = Path(
    os.environ.get("TOKMATRIX_ANTIGRAVITY_BRIDGE_DIR", BASE_DIR / "storage" / "antigravity_bridge")
).expanduser().resolve()

_BRIDGE_VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
_BRIDGE_RATIO_DIMS = {
    "1:1": (2048, 2048), "9:16": (1440, 2560), "16:9": (2560, 1440),
    "4:3": (2048, 1536), "3:4": (1536, 2048),
}


def _bridge_dirs() -> Dict[str, Path]:
    dirs = {name: _BRIDGE_ROOT / name for name in ("inbox", "outbox", "archive", "failed")}
    _BRIDGE_ROOT.mkdir(parents=True, exist_ok=True)
    for path in dirs.values():
        path.mkdir(parents=True, exist_ok=True)
    return dirs


def _bridge_file_list(directory: Path) -> List[Dict[str, Any]]:
    """Danh sách file trong một thư mục bridge, sắp theo mtime giảm dần."""
    if not directory.exists():
        return []
    items = []
    for p in sorted(directory.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.name.startswith(".") or p.is_dir():
            continue
        st = p.stat()
        items.append({
            "name": p.name,
            "suffix": p.suffix.lower(),
            "size_bytes": st.st_size,
            "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime)),
        })
    return items


@image_router.get("/bridge/status")
def bridge_status():
    """Trạng thái bridge: thư mục, file counts, doctor checks."""
    dirs = _bridge_dirs()

    inbox_files = _bridge_file_list(dirs["inbox"])
    outbox_files = _bridge_file_list(dirs["outbox"])
    archive_files = _bridge_file_list(dirs["archive"])
    failed_files = _bridge_file_list(dirs["failed"])

    # Đếm task Antigravity đang pending trong DB
    conn = _db()
    try:
        pending_count = conn.execute(
            f"SELECT COUNT(*) FROM image_queue WHERE status='pending' AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})",
            EXTERNAL_ENGINES,
        ).fetchone()[0]
        processing_count = conn.execute(
            f"SELECT COUNT(*) FROM image_queue WHERE status='processing' AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})",
            EXTERNAL_ENGINES,
        ).fetchone()[0]
        completed_count = conn.execute(
            f"SELECT COUNT(*) FROM image_queue WHERE status='completed' AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})",
            EXTERNAL_ENGINES,
        ).fetchone()[0]
    finally:
        conn.close()

    # Doctor checks
    app_candidates = [
        # macOS
        Path("/Applications/Antigravity.app"),
        Path.home() / "Applications" / "Antigravity.app",
        # Linux (bản tar.gz giải nén, ví dụ trên VPS)
        Path("/opt/antigravity/antigravity"),
        Path("/usr/local/bin/antigravity"),
        Path.home() / ".local" / "share" / "antigravity" / "antigravity",
    ]
    app_path = next((str(p) for p in app_candidates if p.exists()), None)
    agentapi_path = Path.home() / ".gemini" / "antigravity-ide" / "bin" / "agentapi"

    return {
        "success": True,
        "bridge_dir": str(_BRIDGE_ROOT),
        "inbox": {"count": len(inbox_files), "files": inbox_files},
        "outbox": {"count": len(outbox_files), "files": outbox_files},
        "archive": {"count": len(archive_files), "files": archive_files[:50]},
        "failed": {"count": len(failed_files), "files": failed_files},
        "queue": {
            "pending": pending_count,
            "processing": processing_count,
            "completed": completed_count,
        },
        "doctor": {
            "server_ok": True,
            "antigravity_app": app_path,
            "agentapi": str(agentapi_path) if agentapi_path.exists() else None,
        },
    }


class BridgePullRequest(BaseModel):
    limit: int = 1
    worker_id: str = ""


@image_router.post("/bridge/pull")
def bridge_pull(req: BridgePullRequest):
    """Claim task từ hàng đợi và tạo gói công việc trong inbox cho IDE agent."""
    dirs = _bridge_dirs()
    limit = max(1, min(req.limit or 1, 10))
    worker_id = (req.worker_id or f"web-{_socket.gethostname()}-{os.getpid()}").strip()[:80]

    conn = _db()
    try:
        # Lấy task pending engine Antigravity
        rows = conn.execute(
            f"""SELECT {QUEUE_COLUMNS} FROM image_queue
                WHERE status='pending' AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})
                ORDER BY created_ts ASC LIMIT ?""",
            (*EXTERNAL_ENGINES, limit),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return {"success": True, "message": "Không có task Antigravity nào đang chờ.", "pulled": []}

    pulled = []
    for row in rows:
        task = _queue_row_to_dict(row)
        task_id = task["id"]

        # Claim nguyên tử
        conn2 = _db()
        try:
            cur = conn2.execute(
                f"""UPDATE image_queue
                    SET status='processing', notes=?, updated_at=?
                    WHERE id=? AND status='pending'
                      AND COALESCE(engine, '') IN ({_EXTERNAL_ENGINES_SQL})""",
                (f"Antigravity IDE đang xử lý · {worker_id}", _now_str(), task_id, *EXTERNAL_ENGINES),
            )
            conn2.commit()
            if cur.rowcount == 0:
                continue
        finally:
            conn2.close()

        # Tạo gói file
        clean_id = "".join(ch for ch in task_id if ch.isalnum() or ch in "_-")
        if not clean_id or clean_id != task_id:
            continue

        ratio = task.get("aspect_ratio") or "1:1"
        width, height = _BRIDGE_RATIO_DIMS.get(ratio, _BRIDGE_RATIO_DIMS["1:1"])
        output_path = dirs["outbox"] / f"{clean_id}.png"

        payload = {
            "schema": "tokmatrix.antigravity-bridge/v1",
            "task_id": clean_id,
            "prompt": task.get("prompt", ""),
            "negative_prompt": task.get("negative_prompt", ""),
            "aspect_ratio": ratio,
            "recommended_size": {"width": width, "height": height},
            "seed": task.get("seed"),
            "notes": task.get("notes", ""),
            "output_path": str(output_path),
            "callback": f"/api/ai-images/queue/{clean_id}/complete",
            "claimed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        json_path = dirs["inbox"] / f"{clean_id}.json"
        md_path = dirs["inbox"] / f"{clean_id}.md"
        tmp_json = json_path.with_suffix(".json.tmp")
        tmp_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_json.replace(json_path)

        negative = payload["negative_prompt"] or "(không có)"
        md_content = f"""# Antigravity image task `{clean_id}`

Tạo đúng **một ảnh** trong Antigravity IDE. Không đổi nội dung, không thêm chữ,
logo hoặc watermark nếu prompt không yêu cầu.

## Prompt

{payload['prompt']}

## Tránh

{negative}

## Thông số

- Tỉ lệ: `{ratio}`
- Kích thước khuyến nghị: `{width} × {height}`
- Seed: `{payload['seed'] if payload['seed'] is not None else 'tự động'}`

## Bàn giao bắt buộc

Xuất PNG/JPG/WebP vào đúng đường dẫn sau (tên gốc phải là task id):

`{output_path}`

Bridge watcher sẽ tự kiểm tra ảnh, chép vào Thư viện TokMatrix và đóng task.
"""
        tmp_md = md_path.with_suffix(".md.tmp")
        tmp_md.write_text(md_content, encoding="utf-8")
        tmp_md.replace(md_path)

        pulled.append({
            "task_id": clean_id,
            "prompt": task.get("prompt", ""),
            "json": str(json_path),
            "markdown": str(md_path),
            "output": str(output_path),
        })

    return {
        "success": True,
        "message": f"Đã pull {len(pulled)} task cho Antigravity IDE.",
        "pulled": pulled,
    }


@image_router.post("/bridge/import-outbox")
def bridge_import_outbox():
    """Quét outbox, import ảnh đã sinh vào Thư viện và đóng task."""
    dirs = _bridge_dirs()
    imported = []
    errors = []

    image_files = sorted(
        (p for p in dirs["outbox"].iterdir() if p.is_file() and p.suffix.lower() in _BRIDGE_VALID_EXTS),
        key=lambda x: x.stat().st_mtime,
    )

    for image_path in image_files:
        task_id = image_path.stem
        if (dirs["outbox"] / f"{task_id}.cf.json").exists():
            continue  # ảnh dự phòng CF: importer tự động nhập và ghi đúng nguồn
        try:
            # Validate task_id
            clean = "".join(ch for ch in task_id if ch.isalnum() or ch in "_-")
            if not clean or clean != task_id:
                raise ValueError("Task id không an toàn")

            # Kiểm tra task tồn tại
            conn = _db()
            try:
                row = conn.execute(
                    f"SELECT {QUEUE_COLUMNS} FROM image_queue WHERE id=?", (task_id,)
                ).fetchone()
            finally:
                conn.close()

            if not row:
                raise ValueError(f"Không tìm thấy task '{task_id}' trong hàng đợi")
            task = _queue_row_to_dict(row)
            if task.get("engine") not in EXTERNAL_ENGINES:
                raise ValueError("Task không thuộc engine Antigravity")
            if task.get("status") == "completed":
                dup_path = dirs["archive"] / f"{task_id}-dup-{int(time.time())}{image_path.suffix.lower()}"
                shutil.move(str(image_path), dup_path)
                raise ValueError("Task đã hoàn thành trước đó — bản trùng đã cất vào archive, không nhập lại")

            # Chép ảnh vào thư viện
            GENERATED_DIR.mkdir(parents=True, exist_ok=True)
            ext = image_path.suffix.lower()
            filename = f"antigravity_{int(time.time())}_{task_id.split('_')[-1]}{ext}"
            dest = GENERATED_DIR / filename
            shutil.copy2(str(image_path), dest)

            # Đọc kích thước ảnh
            img_width, img_height = 0, 0
            try:
                from PIL import Image as _PIL_Image
                with _PIL_Image.open(dest) as im:
                    img_width, img_height = im.size
            except Exception:
                pass

            # Sidecar metadata
            sidecar = {
                "filename": filename,
                "url": f"/static/generated_images/{filename}",
                "prompt": task.get("prompt", ""),
                "negative_prompt": task.get("negative_prompt", ""),
                "aspect_ratio": task.get("aspect_ratio") or "1:1",
                "model": "antigravity-ide",
                "seed": task.get("seed"),
                "width": img_width,
                "height": img_height,
                "engine": "antigravity",
                "tags": "antigravity,ide-bridge",
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "size_bytes": dest.stat().st_size,
            }
            dest.with_suffix(".json").write_text(
                json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            # Đánh dấu task completed
            conn2 = _db()
            try:
                conn2.execute(
                    """UPDATE image_queue
                       SET status='completed', image_filename=?, image_url=?,
                           notes=?, updated_at=?
                       WHERE id=?""",
                    (filename, f"/static/generated_images/{filename}",
                     "Hoàn thành qua Antigravity IDE bridge", _now_str(), task_id),
                )
                conn2.commit()
            finally:
                conn2.close()

            # Di chuyển file vào archive
            archive_name = f"{task_id}{ext}"
            archive_path = dirs["archive"] / archive_name
            if archive_path.exists():
                archive_path = dirs["archive"] / f"{task_id}-{int(time.time())}{ext}"
            shutil.move(str(image_path), archive_path)

            # Di chuyển file inbox vào archive
            for suffix in (".json", ".md"):
                request_file = dirs["inbox"] / f"{task_id}{suffix}"
                if request_file.exists():
                    shutil.move(str(request_file), dirs["archive"] / request_file.name)

            imported.append({
                "task_id": task_id,
                "filename": filename,
                "url": f"/static/generated_images/{filename}",
                "width": img_width,
                "height": img_height,
            })
        except Exception as exc:
            errors.append({"file": image_path.name, "error": str(exc)})

    return {
        "success": True,
        "message": f"Đã nhập {len(imported)} ảnh từ outbox." if imported else "Không có ảnh nào trong outbox.",
        "imported": imported,
        "errors": errors,
    }


@image_router.get("/bridge/file/{folder}/{filename}")
def bridge_read_file(folder: str, filename: str):
    """Đọc nội dung file text trong thư mục bridge (inbox/outbox/archive/failed)."""
    if folder not in ("inbox", "outbox", "archive", "failed"):
        raise HTTPException(status_code=400, detail="Thư mục không hợp lệ")
    safe_name = os.path.basename(filename)
    target = _BRIDGE_ROOT / folder / safe_name
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy file")
    if target.suffix.lower() not in (".md", ".json", ".txt"):
        raise HTTPException(status_code=400, detail="Chỉ đọc được file .md, .json hoặc .txt")
    try:
        content = target.read_text(encoding="utf-8")
    except Exception:
        raise HTTPException(status_code=500, detail="Không đọc được file")
    return {"success": True, "folder": folder, "filename": safe_name, "content": content}
