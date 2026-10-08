"""Dự phòng cho hàng đợi ảnh Antigravity: ImageRouter trước, Cloudflare Worker sau.

Chỉ nhận task engine=antigravity khi Antigravity không vẽ được:
  * agent đang bị chặn quota (tokmatrix-agent-quota check image còn >= 5 phút), hoặc
  * task đã chờ quá TOKMATRIX_CF_IMAGE_MAX_WAIT_MINUTES (mặc định 120).

Task đã nằm trong inbox của agent (status='processing') chỉ được nhận khi agent bị chặn
quota, hoặc task nằm đó quá TOKMATRIX_CF_IMAGE_INBOX_STALE_MINUTES (mặc định 45, dài hơn slot 25 phút của bridge) — agent
đọc cả inbox ngay đầu conversation rồi vẽ tuần tự, nên vẽ chen vào đó là agent vẽ lại
đúng task ấy và ảnh của nó thành bản trùng (đo 25/09: 43/62 ảnh agent bị bỏ).

Cảnh có chủ thể là vật mang chữ (bản đồ, tài liệu, báo, màn hình báo lỗi, biểu đồ…:
imagerouter_image.subject_needs_text) chỉ Antigravity (Gemini) vẽ được chữ thật; FLUX/SDXL ra
chữ vô nghĩa. Dự phòng bỏ qua các task đó cho tới khi chúng chờ quá
TOKMATRIX_CF_IMAGE_TEXT_MAX_WAIT_MINUTES (mặc định 480) — video làm trước lịch đăng 1 ngày
nên chờ được; quá hạn thì vẫn vẽ để video không kẹt mãi.

Mỗi task thử ImageRouter (imagerouter_image: FLUX-2-klein-4b, có trần chi phí ngày) trước;
ImageRouter tắt/hết trần/lỗi thì vẽ bằng Cloudflare Worker (SDXL, prompt rút gọn).

Ảnh không đi đường riêng: worker ghi `outbox/<task_id>.png` cùng file đánh dấu
`outbox/<task_id>.cf.json` (engine + model của nguồn đã vẽ), rồi bridge importer của
image_routes nhập vào Thư viện, đóng task và ghi model='cf-worker' hoặc
'imagerouter:<model>'. Phía video đọc model đó và ghi source "cf_worker"/"imagerouter"
vào images.json, không nhận là ảnh Antigravity.

Task pending được giữ bằng next_retry_at (lease) để bridge không kéo nó vào inbox
trong lúc worker đang vẽ; lỗi thì trả lease, task vẫn thuộc Antigravity.

Token: khoá `image.cf_worker` trong Kho Khoá API (hoặc env TOKMATRIX_CF_IMAGE_TOKEN).
Tắt hẳn: TOKMATRIX_CF_IMAGE_FALLBACK=0.
"""

import io
import json
import logging
import os
import re
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

try:
    from bkt_web import imagerouter_image
except ImportError:  # chạy trực tiếp trong bkt_web
    import imagerouter_image

logger = logging.getLogger("cf_image_fallback")

KEY_NAME = "image.cf_worker"
MODEL_ID = "cf-worker"
SOURCE_ID = "cf_worker"
MARKER_ENGINES = (SOURCE_ID, imagerouter_image.SOURCE_ID, "gemini_web")
DEFAULT_URL = "https://free-image-generation-api.tomtran613.workers.dev/"
QUOTA_HELPER = Path("/usr/local/bin/tokmatrix-agent-quota")
# Email tài khoản Antigravity đang active (tokmatrix-rotator ghi). Có thì chỉ tính lỗi của
# tài khoản đó: lỗi xác minh/quota của tài khoản cũ không được coi là Antigravity đang bị chặn.
ACTIVE_ACCOUNT_FILE = Path("/var/lib/tokmatrix-bridge/active_account")


def _env_int(name: str, default: int, low: int = 1) -> int:
    try:
        return max(low, int(os.environ.get(name, default)))
    except ValueError:
        return default


ENABLED = os.environ.get("TOKMATRIX_CF_IMAGE_FALLBACK", "1") != "0"
URL = os.environ.get("TOKMATRIX_CF_IMAGE_URL", DEFAULT_URL)
CONCURRENCY = _env_int("TOKMATRIX_CF_IMAGE_CONCURRENCY", 2)
MAX_WAIT_MINUTES = _env_int("TOKMATRIX_CF_IMAGE_MAX_WAIT_MINUTES", 120)
INBOX_STALE_MINUTES = _env_int("TOKMATRIX_CF_IMAGE_INBOX_STALE_MINUTES", 45)
TEXT_MAX_WAIT_MINUTES = _env_int("TOKMATRIX_CF_IMAGE_TEXT_MAX_WAIT_MINUTES", 480)
MIN_BLOCK_SECONDS = 5 * 60      # quota sắp reset thì để Antigravity tự làm
LEASE_SECONDS = 15 * 60         # giữ task pending khỏi bridge trong lúc vẽ
REQUEST_TIMEOUT = 240.0
POLL_SECONDS = 15

# Kích thước xin worker (hiện worker trả 1024x1024 bất kể) và kích thước ảnh giao ra.
# 9:16 phải >= 720x1280 để qua Matrix asset QA.
REQUEST_DIMS = {"1:1": (1024, 1024), "9:16": (768, 1344), "16:9": (1344, 768),
                "4:3": (1152, 864), "3:4": (864, 1152)}
OUTPUT_DIMS = {"1:1": (1024, 1024), "9:16": (1080, 1920), "16:9": (1920, 1080),
               "4:3": (1024, 768), "3:4": (768, 1024)}

_state_lock = threading.Lock()
_in_flight: set = set()
_cooldown_until = 0.0
_blocked_cache = (0.0, 0.0)     # (lúc đọc, epoch reset)
_stats: Dict[str, Any] = {"completed": 0, "failed": 0, "last_error": "", "last_ok_at": 0}
_stop = threading.Event()
_thread: Optional[threading.Thread] = None


def _routes():
    try:
        from bkt_web import image_routes
    except ImportError:  # chạy trực tiếp trong bkt_web
        import image_routes
    return image_routes


def _token() -> str:
    try:
        try:
            from bkt_web.key_vault import get_key
        except ImportError:
            from key_vault import get_key
        value = get_key(KEY_NAME)
    except Exception:
        value = ""
    return value or os.environ.get("TOKMATRIX_CF_IMAGE_TOKEN", "")


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_DROP_SEGMENT = re.compile(
    r"#[0-9a-f]{3,8}\b|\bpalette\b|\b\d+\s*:\s*\d+\b|\bcomposition\b|caption|\btext\b|watermark|\blogo\b",
    re.I,
)
_LABEL = re.compile(r"^(camera|shot|lens|style|mood|lighting)\s*:\s*", re.I)


def shorten_prompt(prompt: str, max_words: int = 55) -> str:
    """Rút prompt pipeline về các ý chính mà model kiểu SDXL (~77 token) còn đọc được.

    Bỏ mã màu hex, bảng màu, tỉ lệ khung, "composition", yêu cầu không chữ (worker
    không hiểu), bỏ nhãn "camera:" nhưng giữ giá trị, bỏ cụm lặp.
    """
    out: List[str] = []
    seen = set()
    words = 0
    for raw in re.split(r"[,.;\n]+", prompt or ""):
        part = " ".join(raw.split()).strip(" -:")
        part = _LABEL.sub("", part)
        if not part or _DROP_SEGMENT.search(part):
            continue
        key = part.lower()
        if key in seen:
            continue
        count = len(part.split())
        if out and words + count > max_words:
            break
        seen.add(key)
        out.append(part)
        words += count
    return ", ".join(out) or " ".join((prompt or "").split()[:max_words])


# ---------------------------------------------------------------------------
# Ảnh
# ---------------------------------------------------------------------------

def fit_to_ratio(data: bytes, ratio: str) -> bytes:
    """Cắt giữa về đúng tỉ lệ rồi đưa về OUTPUT_DIMS, trả PNG. Không phải ảnh thì ValueError."""
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            img = im.convert("RGB")
    except Exception as exc:
        raise ValueError(f"worker không trả ảnh hợp lệ: {exc}") from exc
    tw, th = OUTPUT_DIMS.get(ratio, OUTPUT_DIMS["1:1"])
    target = tw / th
    w, h = img.size
    if w / h > target:
        nw = round(h * target)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    elif w / h < target:
        nh = round(w / target)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    if img.size != (tw, th):
        img = img.resize((tw, th), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


class CfError(Exception):
    def __init__(self, message: str, cooldown: int = 0):
        super().__init__(message)
        self.cooldown = cooldown


def generate(prompt: str, negative: str, ratio: str, token: str,
             client: Optional[httpx.Client] = None) -> Dict[str, Any]:
    """Gọi worker, trả {"png": bytes, "prompt": prompt đã gửi, "source_size": (w,h)}."""
    short = shorten_prompt(prompt)
    width, height = REQUEST_DIMS.get(ratio, REQUEST_DIMS["1:1"])
    body = {"prompt": short, "negative_prompt": negative or "", "width": width,
            "height": height, "aspect_ratio": ratio}
    owns = client is None
    client = client or httpx.Client(timeout=REQUEST_TIMEOUT)
    try:
        resp = client.post(URL, json=body, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise CfError(f"không gọi được worker: {exc}", cooldown=120) from exc
    finally:
        if owns:
            client.close()
    if resp.status_code == 429:
        raise CfError("worker báo 429 (hết hạn mức)", cooldown=30 * 60)
    if resp.status_code in (401, 403):
        raise CfError(f"worker từ chối token (HTTP {resp.status_code})", cooldown=60 * 60)
    if resp.status_code != 200:
        raise CfError(f"worker lỗi HTTP {resp.status_code}: {resp.text[:200]}", cooldown=5 * 60)
    from PIL import Image
    try:
        with Image.open(io.BytesIO(resp.content)) as im:
            source_size = im.size
    except Exception:
        raise CfError(f"worker không trả ảnh: {resp.text[:200]}", cooldown=5 * 60)
    return {"png": fit_to_ratio(resp.content, ratio), "prompt": short, "source_size": source_size}


# ---------------------------------------------------------------------------
# Chọn task
# ---------------------------------------------------------------------------

def _active_account() -> str:
    try:
        value = ACTIVE_ACCOUNT_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    return value if re.fullmatch(r"[^\s@]+@[^\s@]+", value) else ""


def antigravity_blocked_until(now: Optional[float] = None) -> float:
    """Epoch Antigravity còn bị chặn quota ảnh, 0 nếu không (đọc tokmatrix-agent-quota, cache 30 s)."""
    global _blocked_cache
    now = now or time.time()
    read_at, until = _blocked_cache
    if now - read_at < 30:
        return until
    until = 0.0
    if QUOTA_HELPER.exists():
        try:
            cmd = [str(QUOTA_HELPER), "check", "image"]
            account = _active_account()
            if account:
                cmd += ["--account", account]
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if out.returncode == 0 and out.stdout.split():
                until = float(out.stdout.split()[0])
        except (OSError, subprocess.SubprocessError, ValueError):
            until = 0.0
    _blocked_cache = (now, until)
    return until


def eligible_tasks(limit: int, now: Optional[float] = None,
                   blocked_until: Optional[float] = None) -> List[Dict[str, Any]]:
    ir = _routes()
    now = now or time.time()
    blocked = (blocked_until if blocked_until is not None else antigravity_blocked_until(now)) - now >= MIN_BLOCK_SECONDS
    oldest = now - MAX_WAIT_MINUTES * 60
    stale_inbox = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now - INBOX_STALE_MINUTES * 60))
    engines = ir.EXTERNAL_ENGINES
    marks = ",".join("?" * len(engines))
    conn = ir._db()
    try:
        rows = conn.execute(
            f"""SELECT id, prompt, negative_prompt, aspect_ratio, status, created_ts FROM image_queue
                WHERE COALESCE(engine, '') IN ({marks})
                  AND ((status='pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)
                        AND (? OR COALESCE(created_ts, 0) <= ?))
                       OR (status='processing' AND (? OR COALESCE(updated_at, '') <= ?)))
                ORDER BY created_ts ASC LIMIT ?""",
            (*engines, int(now), 1 if blocked else 0, int(oldest), 1 if blocked else 0, stale_inbox,
             limit * 10 + len(_in_flight) + 50),   # dư chỗ: cảnh cần chữ bị lọc bên dưới
        ).fetchall()
    finally:
        conn.close()
    tasks = []
    text_deadline = now - TEXT_MAX_WAIT_MINUTES * 60
    for r in rows:
        if r[0] in _in_flight:
            continue
        # Khi Antigravity còn hoạt động, giữ cảnh cần chữ cho Gemini để tránh chữ giả từ
        # FLUX/SDXL. Khi quota Antigravity đang bị chặn, ưu tiên duy trì pipeline: giao cả
        # cảnh sơ đồ/bản đồ/chữ cho ImageRouter, rồi Cloudflare Worker nếu nguồn đó lỗi.
        if (not blocked and (r[5] or 0) > text_deadline
                and imagerouter_image.subject_needs_text(r[1] or "")):
            continue
        tasks.append({"id": r[0], "prompt": r[1] or "", "negative_prompt": r[2] or "",
                      "aspect_ratio": r[3] or "1:1", "status": r[4], "created_ts": r[5] or 0})
    return tasks[:limit]


def _claim(task: Dict[str, Any], now: float) -> bool:
    """Giữ task: in-memory cho mọi task, thêm lease next_retry_at cho task pending."""
    with _state_lock:
        if task["id"] in _in_flight:
            return False
        _in_flight.add(task["id"])
    if task["status"] != "pending":
        return True
    ir = _routes()
    conn = ir._db()
    try:
        cur = conn.execute(
            """UPDATE image_queue SET next_retry_at=?
               WHERE id=? AND status='pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)""",
            (int(now) + LEASE_SECONDS, task["id"], int(now)),
        )
        conn.commit()
        ok = cur.rowcount == 1
    finally:
        conn.close()
    if not ok:
        with _state_lock:
            _in_flight.discard(task["id"])
    return ok


def _release(task: Dict[str, Any], error: str) -> None:
    ir = _routes()
    conn = ir._db()
    try:
        conn.execute(
            """UPDATE image_queue SET next_retry_at=0, error_message=?, updated_at=?
               WHERE id=? AND status='pending'""",
            (f"Dự phòng ảnh lỗi: {error}"[:500], ir._now_str(), task["id"]),
        )
        conn.execute(
            "UPDATE image_queue SET error_message=?, updated_at=? WHERE id=? AND status='processing'",
            (f"Dự phòng ảnh lỗi: {error}"[:500], ir._now_str(), task["id"]),
        )
        conn.commit()
    finally:
        conn.close()


def generate_imagerouter(prompt: str, negative: str, ratio: str, client: Optional[httpx.Client] = None) -> Dict[str, Any]:
    """Vẽ qua ImageRouter, trả cùng dạng generate() kèm marker của nguồn."""
    from PIL import Image
    got = imagerouter_image.generate(imagerouter_image.prepare_prompt(prompt, negative, client), ratio, client)
    try:
        with Image.open(io.BytesIO(got["raw"])) as im:
            source_size = im.size
    except Exception as exc:
        raise imagerouter_image.ImageRouterError(f"{got['model']} không trả ảnh hợp lệ: {exc}") from exc
    return {"png": fit_to_ratio(got["raw"], ratio), "prompt": got["prompt"],
            "source_size": source_size, "engine": imagerouter_image.SOURCE_ID,
            "model": imagerouter_image.MODEL_PREFIX + got["model"], "cost": got["cost"]}


def _deliver(task_id: str, result: Dict[str, Any]) -> None:
    """Ghi file đánh dấu trước, ảnh sau (đổi tên nguyên tử) để importer luôn thấy cả hai."""
    ir = _routes()
    outbox = ir._bridge_dirs()["outbox"]
    engine = result.get("engine") or SOURCE_ID
    marker = {"engine": engine, "model": result.get("model") or MODEL_ID,
              "url": {imagerouter_image.SOURCE_ID: imagerouter_image.API_URL, "gemini_web": "https://gemini.google.com/app"}.get(engine, URL),
              "prompt_sent": result["prompt"], "source_size": list(result["source_size"]),
              **({"cost_usd": result["cost"]} if "cost" in result else {}),
              "created_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    (outbox / f"{task_id}.cf.json").write_text(json.dumps(marker, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp = outbox / f".{task_id}.png.part"
    tmp.write_bytes(result["png"])
    tmp.replace(outbox / f"{task_id}.png")


def read_marker(path: Path) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("engine") not in MARKER_ENGINES:
        return None
    if data["engine"] == imagerouter_image.SOURCE_ID and not str(data.get("model", "")).startswith(
            imagerouter_image.MODEL_PREFIX):
        data["model"] = imagerouter_image.MODEL_PREFIX + str(data.get("model") or "unknown")
    return data


def _cf_ready(token: str) -> bool:
    return bool(token) and time.time() >= _cooldown_until


def process_task(task: Dict[str, Any], token: str, client: Optional[httpx.Client] = None) -> bool:
    global _cooldown_until
    ir_error = ""
    try:
        # Gemini web (miễn phí, Chrome đã đăng nhập — owner 08/10) trước ImageRouter trả phí.
        try:
            from bkt_web import chatgpt_web
            if chatgpt_web.image_ready():
                got = chatgpt_web.generate_image(task["prompt"], task["negative_prompt"], task["aspect_ratio"])
                _deliver(task["id"], {"png": fit_to_ratio(got["raw"], task["aspect_ratio"]), "prompt": got["prompt"],
                                      "source_size": got["size"], "engine": chatgpt_web.IMAGE_SOURCE_ID,
                                      "model": chatgpt_web.IMAGE_MODEL})
                logger.info("Gemini web vẽ xong %s", task["id"])
                return True
        except Exception as exc:  # noqa: BLE001 — chuyển ImageRouter / Cloudflare
            ir_error = f"Gemini web: {exc}"
            logger.warning("Gemini web lỗi %s: %s", task["id"], exc)
        if imagerouter_image.available():
            try:
                result = generate_imagerouter(task["prompt"], task["negative_prompt"], task["aspect_ratio"], client)
                _deliver(task["id"], result)
                logger.info("ImageRouter vẽ xong %s (%s)", task["id"], result["model"])
                return True
            except Exception as exc:
                ir_error = f"ImageRouter: {exc}"
                logger.warning("ImageRouter lỗi %s, chuyển Cloudflare: %s", task["id"], exc)
        if not _cf_ready(token):
            raise CfError(ir_error or "không nguồn dự phòng nào sẵn sàng")
        result = generate(task["prompt"], task["negative_prompt"], task["aspect_ratio"], token, client)
        _deliver(task["id"], result)
        with _state_lock:
            _stats["completed"] += 1
            _stats["last_ok_at"] = int(time.time())
        logger.info("CF fallback vẽ xong %s", task["id"])
        return True
    except Exception as exc:
        message = "; ".join(filter(None, [ir_error if ir_error not in str(exc) else "", str(exc)]))
        with _state_lock:
            _stats["failed"] += 1
            _stats["last_error"] = message[:300]
            if getattr(exc, "cooldown", 0) or not isinstance(exc, CfError):
                _cooldown_until = max(_cooldown_until, time.time() + getattr(exc, "cooldown", 5 * 60))
        logger.warning("Dự phòng ảnh lỗi %s: %s", task["id"], message)
        _release(task, message)
        return False
    finally:
        with _state_lock:
            _in_flight.discard(task["id"])


def run_once(limit: Optional[int] = None, now: Optional[float] = None,
             client: Optional[httpx.Client] = None, pool: Optional[ThreadPoolExecutor] = None) -> int:
    """Nhận tối đa `limit` task đủ điều kiện. Có pool thì chạy nền, không thì chạy tuần tự."""
    if not ENABLED:
        return 0
    token = _token()
    if not imagerouter_image.available() and not _cf_ready(token):
        return 0
    now = now or time.time()
    free = (limit if limit is not None else CONCURRENCY) - len(_in_flight)
    if free <= 0:
        return 0
    started = 0
    for task in eligible_tasks(free, now):
        if not _claim(task, now):
            continue
        started += 1
        if pool:
            pool.submit(process_task, task, token, client)
        else:
            process_task(task, token, client)
    return started


def _loop() -> None:
    with ThreadPoolExecutor(max_workers=CONCURRENCY, thread_name_prefix="cf-image") as pool:
        while not _stop.wait(POLL_SECONDS):
            try:
                run_once(pool=pool)
            except Exception:
                logger.exception("CF fallback: vòng quét lỗi")


def start() -> None:
    global _thread
    if not ENABLED:
        return
    _stop.clear()
    if not _thread or not _thread.is_alive():
        _thread = threading.Thread(target=_loop, name="cf-image-fallback", daemon=True)
        _thread.start()


def stop() -> None:
    _stop.set()


def status() -> Dict[str, Any]:
    now = time.time()
    blocked = antigravity_blocked_until(now)
    with _state_lock:
        return {
            "enabled": ENABLED, "has_token": bool(_token()), "url": URL,
            "concurrency": CONCURRENCY, "max_wait_minutes": MAX_WAIT_MINUTES,
            "text_max_wait_minutes": TEXT_MAX_WAIT_MINUTES,
            "inbox_stale_minutes": INBOX_STALE_MINUTES,
            "antigravity_blocked_until": int(blocked) if blocked > now else 0,
            "cooldown_until": int(_cooldown_until) if _cooldown_until > now else 0,
            "in_flight": sorted(_in_flight), **_stats,
            "imagerouter": imagerouter_image.status(),
        }
