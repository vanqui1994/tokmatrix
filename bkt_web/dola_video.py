"""Dola Render Gateway (https://github.com/coll3879xx-cyber/dola-render-gateway): sinh video AI (Seedance).

API: POST /v1/videos/generations tạo task, GET /v1/videos/{id} trả trạng thái
queued|processing|completed|failed và `video_url` khi xong.

Cấu hình (env):
  DOLA_GATEWAY_BASE_URL   mặc định http://localhost:8000
  DOLA_API_KEY            Bearer token; trống = gateway dev mode. Kho Khoá: `video.dola` (ưu tiên).
  DOLA_DEFAULT_MODEL      seedance-2.0 | seedance-2.5 (mặc định seedance-2.0)
  DOLA_POLL_INTERVAL_MS   mặc định 5000
  DOLA_TIMEOUT_SECONDS    mặc định theo task: 300 s (10/15 s), 900 s (30 s hoặc có ảnh tham chiếu)

CLI thử: python3 -m bkt_web.dola_video generate "a red fox running in snow" --duration 10 --ratio 9:16 --out /tmp/fox.mp4
"""

import argparse
import json
import logging
import os
import random
import time
from pathlib import Path
from typing import Callable, List, Literal, Optional

import httpx
from pydantic import BaseModel, Field, field_validator

import re

# Chữ "độn" về chất lượng không thêm nội dung cho prompt.
QUALITY_FILLER_PATTERNS = re.compile(
    r"(?<![\w-])(8k|4k|hdr|photorealistic|hyperrealistic|octane render|"
    r"trending on artstation|masterpiece|ultra detailed|hd 1080p)(?:-\w+)?(?![\w-])",
    re.IGNORECASE,
)
LEAD_PATTERNS = re.compile(
    r"^(a|an|the|cinematic|stunning|dramatic|beautiful|slow motion|natural)\b",
    re.IGNORECASE,
)


def humanize_dola_prompt(raw_prompt: str) -> str:
    """Bỏ chữ độn chất lượng (8k, hdr, masterpiece, 4k-ready…), dọn dấu câu, thêm câu dẫn cinematic.
    Giữ nguyên viết tắt/tên riêng (NASA, NASA's, AI, McDonald)."""
    if not raw_prompt or not isinstance(raw_prompt, str):
        return ""
    text = QUALITY_FILLER_PATTERNS.sub("", raw_prompt.strip())
    text = re.sub(r"\(\s*\)|\[\s*\]", "", text)            # ngoặc rỗng
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*(?:,\s*)+", ", ", text)              # gộp dấu phẩy
    text = re.sub(r"[\s,]+([.!?;:])", r"\1", text)          # không để ", ." / " ."
    text = text.strip(" ,;:")
    if not text or text in {".", "!", "?"}:
        return ""
    if not LEAD_PATTERNS.search(text):
        first = text.split()[0]
        if first[:1].isupper() and first[1:].isalpha() and first[1:].islower():
            text = text[:1].lower() + text[1:]
        text = f"A natural cinematic visual of {text}"
    if not text.endswith((".", "!", "?")):
        text += "."
    return text

logger = logging.getLogger("dola_video")

KEY_NAME = "video.dola"
MODELS = ("seedance-2.0", "seedance-2.5")
DURATIONS = (10, 15, 30)
RATIOS = ("16:9", "9:16", "1:1", "4:3", "3:4")
# Gateway chỉ hiểu các size này (SIZE_TO_RATIO trong server.py của gateway); size khác bị bỏ qua.
SIZES = ("1280x720", "1920x1080", "720x1280", "1080x1920", "1024x1024", "1440x1080", "1080x1440")
MAX_REFERENCE_IMAGES = 30
TERMINAL = ("completed", "failed")

Status = Literal["queued", "processing", "completed", "failed"]


class DolaError(Exception):
    """Lỗi chung của gateway."""

    def __init__(self, message: str, status_code: int = 0, task_id: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.task_id = task_id


class DolaValidationError(DolaError):
    """Tham số sai (kiểm tra phía client hoặc HTTP 422)."""


class DolaQuotaError(DolaError):
    """HTTP 429: hết quota/credits hoặc pool tài khoản bị rate limit."""

    def __init__(self, message: str, retry_after: float = 0.0, **kw):
        super().__init__(message, **kw)
        self.retry_after = retry_after


class DolaUnavailable(DolaError):
    """HTTP 503: gateway chưa có tài khoản Dola nào trong pool; thử lại sau."""


class DolaTaskFailed(DolaError):
    """Task kết thúc với status=failed."""


class DolaTimeout(DolaError):
    """Task chưa xong trong thời gian cho phép."""


class VideoRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model: str = Field(default="", validate_default=True)
    duration: int = 10
    ratio: Optional[str] = "9:16"
    size: Optional[str] = None
    reference_images: List[str] = Field(default_factory=list)
    humanize: bool = False

    @field_validator("model")
    @classmethod
    def _model(cls, v: str) -> str:
        v = v or os.environ.get("DOLA_DEFAULT_MODEL", "seedance-2.0")
        if v not in MODELS:
            raise ValueError(f"model phải là một trong {MODELS}")
        return v

    @field_validator("duration")
    @classmethod
    def _duration(cls, v: int) -> int:
        if v not in DURATIONS:
            raise ValueError(f"duration phải là một trong {DURATIONS}")
        return v

    @field_validator("ratio")
    @classmethod
    def _ratio(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in RATIOS:
            raise ValueError(f"ratio phải là một trong {RATIOS}")
        return v

    @field_validator("size")
    @classmethod
    def _size(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in SIZES:
            raise ValueError(f"size phải là một trong {SIZES}")
        return v

    @field_validator("reference_images")
    @classmethod
    def _refs(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_REFERENCE_IMAGES:
            raise ValueError(f"tối đa {MAX_REFERENCE_IMAGES} ảnh tham chiếu")
        for url in v:
            if not url.startswith(("http://", "https://")):
                raise ValueError(f"ảnh tham chiếu phải là URL công khai: {url}")
        return v

    def body(self) -> dict:
        prompt_text = humanize_dola_prompt(self.prompt) if self.humanize else self.prompt
        data = {"prompt": prompt_text, "model": self.model, "duration": self.duration}
        if self.size:
            data["size"] = self.size
        elif self.ratio:
            data["ratio"] = self.ratio
        if self.reference_images:
            data["reference_images"] = self.reference_images
        return data

    def default_timeout(self) -> float:
        if self.duration == 30:
            return 3600.0   # Seedance 2.5: Dola báo ~45 phút
        if self.reference_images:
            return 900.0
        return 300.0


class VideoTask(BaseModel):
    id: str
    status: Status
    model: str = ""
    prompt: str = ""
    video_url: Optional[str] = None
    error: Optional[str] = None


def _api_key() -> str:
    try:
        try:
            from bkt_web.key_vault import get_key
        except ImportError:
            from key_vault import get_key
        value = get_key(KEY_NAME)
    except Exception:
        value = ""
    return value or os.environ.get("DOLA_API_KEY", "")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


class DolaClient:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None,
                 poll_interval: Optional[float] = None, timeout: Optional[float] = None,
                 request_timeout: float = 30.0, transport: Optional[httpx.BaseTransport] = None,
                 sleep: Callable[[float], None] = time.sleep):
        self.base_url = (base_url or os.environ.get("DOLA_GATEWAY_BASE_URL", "http://localhost:8000")).rstrip("/")
        key = _api_key() if api_key is None else api_key
        self.poll_interval = poll_interval if poll_interval is not None else _env_float("DOLA_POLL_INTERVAL_MS", 5000) / 1000
        env_timeout = os.environ.get("DOLA_TIMEOUT_SECONDS")
        self.timeout = timeout if timeout is not None else (_env_float("DOLA_TIMEOUT_SECONDS", 0) if env_timeout else None)
        self._sleep = sleep
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        self._http = httpx.Client(base_url=self.base_url, headers=headers,
                                  timeout=request_timeout, transport=transport)

    def close(self) -> None:
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- HTTP ---------------------------------------------------------------

    def _raise_for(self, resp: httpx.Response, task_id: str = "") -> None:
        if resp.status_code < 400:
            return
        try:
            detail = resp.json()
            detail = detail.get("detail") or detail.get("error") or detail
        except ValueError:
            detail = resp.text[:500]
        msg = f"HTTP {resp.status_code}: {detail}"
        if resp.status_code == 422:
            raise DolaValidationError(msg, resp.status_code, task_id)
        if resp.status_code == 429:
            retry = 0.0
            try:
                retry = float(resp.headers.get("Retry-After", 0))
            except ValueError:
                pass
            raise DolaQuotaError(msg, retry_after=retry, status_code=429, task_id=task_id)
        if resp.status_code == 503:
            raise DolaUnavailable(msg, resp.status_code, task_id)
        raise DolaError(msg, resp.status_code, task_id)

    def health(self) -> dict:
        """GET /health của gateway: ok, available, pending_tasks, accounts…"""
        resp = self._http.get("/health", timeout=10.0)
        self._raise_for(resp)
        return resp.json()

    def create_task(self, payload, quota_retries: int = 0) -> VideoTask:
        """Gửi yêu cầu sinh video. `payload` là VideoRequest hoặc dict (được validate).

        429 được thử lại `quota_retries` lần (chờ Retry-After hoặc 30/60/120 s), rồi ném DolaQuotaError.
        Không tự thử lại lỗi mạng khi tạo task: thử lại có thể tạo 2 task tốn 2 lần credit.
        """
        req = payload if isinstance(payload, VideoRequest) else _validate(payload)
        for attempt in range(quota_retries + 1):
            resp = self._http.post("/v1/videos/generations", json=req.body())
            try:
                self._raise_for(resp)
            except DolaQuotaError as exc:
                if attempt >= quota_retries:
                    raise
                wait = exc.retry_after or 30 * 2 ** attempt
                logger.warning("Dola 429, chờ %.0f s rồi thử lại: %s", wait, exc)
                self._sleep(wait)
                continue
            return VideoTask.model_validate(resp.json())
        raise AssertionError("unreachable")

    def get_task_status(self, task_id: str) -> VideoTask:
        resp = self._http.get(f"/v1/videos/{task_id}")
        self._raise_for(resp, task_id)
        return VideoTask.model_validate(resp.json())

    # -- Chờ ------------------------------------------------------------------

    def wait_for_task(self, task_id: str, timeout: float, poll_interval: Optional[float] = None,
                      on_update: Optional[Callable[[VideoTask], None]] = None) -> VideoTask:
        interval = poll_interval if poll_interval is not None else self.poll_interval
        deadline = time.monotonic() + timeout
        net_errors = 0
        last_status = ""
        while True:
            try:
                task = self.get_task_status(task_id)
                net_errors = 0
            except (httpx.TransportError, DolaQuotaError) as exc:
                # Mạng chập chờn / 429 khi poll: task vẫn chạy ở gateway, chỉ chờ lâu hơn.
                net_errors += 1
                logger.warning("Dola poll %s lỗi tạm (%d): %s", task_id, net_errors, exc)
                task = None
            except DolaError as exc:
                if exc.status_code >= 500:
                    net_errors += 1
                    logger.warning("Dola poll %s HTTP %s (%d)", task_id, exc.status_code, net_errors)
                    task = None
                else:
                    raise
            if task is not None:
                if task.status != last_status:
                    last_status = task.status
                    if on_update:
                        on_update(task)
                if task.status == "completed":
                    if not task.video_url:
                        raise DolaTaskFailed("completed nhưng không có video_url", task_id=task_id)
                    return task
                if task.status == "failed":
                    raise DolaTaskFailed(f"Dola task {task_id} failed: {task.error or 'không rõ lỗi'}",
                                         task_id=task_id)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise DolaTimeout(f"Dola task {task_id} chưa xong sau {timeout:.0f} s (status {last_status or '?'})",
                                  task_id=task_id)
            # Lỗi liên tiếp → giãn dần (tối đa 60 s) + jitter; bình thường giữ chu kỳ cố định.
            wait = interval if not net_errors else min(60.0, interval * 2 ** min(net_errors, 4))
            wait += random.uniform(0, interval * 0.1)
            self._sleep(min(wait, max(remaining, 0.1)))

    def generate_video_and_wait(self, payload, timeout: Optional[float] = None,
                                poll_interval: Optional[float] = None, quota_retries: int = 2,
                                on_update: Optional[Callable[[VideoTask], None]] = None) -> VideoTask:
        req = payload if isinstance(payload, VideoRequest) else _validate(payload)
        task = self.create_task(req, quota_retries=quota_retries)
        logger.info("Dola task %s tạo (%s, %d s)", task.id, req.model, req.duration)
        limit = timeout or self.timeout or req.default_timeout()
        return self.wait_for_task(task.id, limit, poll_interval, on_update)

    def download_video(self, video_url: str, destination: Path, retries: int = 3) -> Path:
        """Tải MP4 về `destination` (ghi file tạm rồi đổi tên); URL tương đối tính theo base_url."""
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        tmp = destination.with_suffix(destination.suffix + ".part")
        url = video_url if video_url.startswith("http") else f"{self.base_url}/{video_url.lstrip('/')}"
        for attempt in range(retries):
            try:
                # Không gửi Bearer key sang host khác (link CDN/S3).
                request = self._http.build_request("GET", url, timeout=300.0)
                if httpx.URL(url).host != httpx.URL(self.base_url).host:
                    request.headers.pop("Authorization", None)
                resp = self._http.send(request, stream=True)
                try:
                    if resp.status_code >= 400:
                        resp.read()
                    self._raise_for(resp)
                    with tmp.open("wb") as fh:
                        for chunk in resp.iter_bytes(1 << 20):
                            fh.write(chunk)
                finally:
                    resp.close()
                with tmp.open("rb") as fh:
                    head = fh.read(12)
                if b"ftyp" not in head:
                    raise DolaError(f"Tệp tải về không phải MP4: {url}")
                os.replace(tmp, destination)
                return destination
            except httpx.TransportError as exc:
                tmp.unlink(missing_ok=True)
                if attempt + 1 >= retries:
                    raise DolaError(f"Tải video lỗi: {exc}") from exc
                self._sleep(2 ** attempt * 2)
            except Exception:
                tmp.unlink(missing_ok=True)
                raise
        return destination


def _validate(payload: dict) -> VideoRequest:
    try:
        return VideoRequest.model_validate(payload)
    except Exception as exc:
        raise DolaValidationError(str(exc)) from exc


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m bkt_web.dola_video")
    sub = parser.add_subparsers(dest="cmd", required=True)
    gen = sub.add_parser("generate", help="Sinh 1 video và chờ xong")
    gen.add_argument("prompt")
    gen.add_argument("--model", default="")
    gen.add_argument("--duration", type=int, default=10)
    gen.add_argument("--ratio", default="9:16")
    gen.add_argument("--ref", action="append", default=[], help="URL ảnh tham chiếu (lặp lại được)")
    gen.add_argument("--humanize", action="store_true", help="Bỏ chữ độn chất lượng (8k, hdr…) và thêm câu dẫn cinematic")
    gen.add_argument("--timeout", type=float)
    gen.add_argument("--out", help="Lưu MP4 vào đây")
    st = sub.add_parser("status", help="Xem trạng thái task")
    st.add_argument("task_id")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    with DolaClient() as client:
        try:
            if args.cmd == "status":
                print(client.get_task_status(args.task_id).model_dump_json(indent=2))
                return 0
            task = client.generate_video_and_wait(
                {"prompt": args.prompt, "model": args.model, "duration": args.duration,
                 "ratio": args.ratio, "reference_images": args.ref, "humanize": args.humanize},
                timeout=args.timeout, on_update=lambda t: print(f"[{t.id}] {t.status}", flush=True))
            print(json.dumps(task.model_dump(), ensure_ascii=False, indent=2))
            if args.out:
                print("Đã lưu", client.download_video(task.video_url, Path(args.out)))
            return 0
        except DolaQuotaError as exc:
            print(f"Hết quota / bị rate limit: {exc}")
            return 3
        except DolaError as exc:
            print(f"Lỗi: {exc}")
            return 1
        except httpx.HTTPError as exc:
            print(f"Không kết nối được gateway {client.base_url}: {exc}")
            return 2


if __name__ == "__main__":
    raise SystemExit(main())
