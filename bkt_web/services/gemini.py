"""Gọi Google Gemini (generateContent) — chỗ duy nhất giữ khoá, thứ tự model dự phòng và luật thử lại.

    from bkt_web.services import gemini
    data = gemini.generate_json("…", models=gemini.FLASH_CHAIN)
    text = gemini.generate([gemini.text("…"), gemini.image(path)], temperature=0.2)

Luật: thử từng model theo thứ tự; 429/5xx/404/lỗi mạng → thử lại model đó (`attempts`) rồi sang model kế; lỗi 4xx
khác (prompt/khoá sai) dừng ngay vì model khác cũng trả vậy. `rounds` lặp lại cả chuỗi model (503 "high demand"
thường hết sau vài giây). Mỗi pipeline vẫn tự chọn chuỗi model và timeout của mình.
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

import httpx

URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# Chuỗi model mặc định cho các pipeline viết kịch bản/đạo diễn (mới nhất trước, lite cuối).
FLASH_CHAIN = ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite")
RETRYABLE = {404, 429, 500, 502, 503, 504}
COMPARE_ENV = Path(__file__).resolve().parents[2] / "compare_studio" / ".env"

Part = Dict[str, Any]


class GeminiError(RuntimeError):
    """Mọi model đều lỗi. `errors` liệt kê lỗi từng lần thử."""

    def __init__(self, message: str, errors: Sequence[str] = ()):
        super().__init__(message)
        self.errors = list(errors)


def api_key() -> str:
    """Khoá Gemini: kho khoá (`ai.gemini`) → env GEMINI_API_KEY/GEMNINI_KEY → compare_studio/.env."""
    try:
        try:
            from bkt_web.key_vault import get_key
        except ImportError:
            from key_vault import get_key
        value = get_key("ai.gemini") or ""
    except Exception:
        value = ""
    value = value or os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GEMNINI_KEY", "")
    if value:
        return value
    try:
        for line in COMPARE_ENV.read_text(encoding="utf-8").splitlines():
            name, _, raw = line.partition("=")
            if name.strip() in ("GEMNINI_KEY", "GEMINI_API_KEY") and raw.strip():
                return raw.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def text(value: str) -> Part:
    return {"text": value}


def image(path: Union[str, Path], mime: Optional[str] = None) -> Part:
    p = Path(path)
    mime = mime or {".png": "image/png", ".webp": "image/webp"}.get(p.suffix.lower(), "image/jpeg")
    return inline(p.read_bytes(), mime)


def inline(data: bytes, mime: str) -> Part:
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}}


def response_text(data: Dict[str, Any]) -> str:
    parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    return "".join(str(p.get("text", "")) for p in parts)


def generate(prompt: Union[str, Iterable[Part]], *, models: Sequence[str] = FLASH_CHAIN, json_mode: bool = False,
             temperature: Optional[float] = None, max_tokens: Optional[int] = None, thinking_budget: Optional[int] = None,
             timeout: float = 180.0, attempts: int = 1, retry_delay: float = 3.0, rounds: int = 1, round_delay: float = 8.0,
             key: Optional[str] = None, client: Optional[httpx.Client] = None) -> str:
    """Văn bản trả về của model đầu tiên thành công. Ném GeminiError khi tất cả đều lỗi."""
    key = key or api_key()
    if not key:
        raise GeminiError("Chưa có khoá Gemini (Cài đặt → Kho khoá API → ai.gemini)")
    parts = [text(prompt)] if isinstance(prompt, str) else list(prompt)
    config: Dict[str, Any] = {}
    if json_mode:
        config["responseMimeType"] = "application/json"
    if temperature is not None:
        config["temperature"] = temperature
    if max_tokens is not None:
        config["maxOutputTokens"] = max_tokens
    if thinking_budget is not None:
        config["thinkingConfig"] = {"thinkingBudget": thinking_budget}
    body: Dict[str, Any] = {"contents": [{"parts": parts}]}
    if config:
        body["generationConfig"] = config

    errors: List[str] = []
    owns = client is None
    client = client or httpx.Client(timeout=timeout)
    try:
        for rnd in range(max(1, rounds)):
            if rnd:
                time.sleep(round_delay)
            for model in dict.fromkeys(models):
                for attempt in range(max(1, attempts)):
                    if attempt:
                        time.sleep(retry_delay * attempt)
                    try:
                        resp = client.post(URL.format(model=model), headers={"x-goog-api-key": key}, json=body, timeout=timeout)
                    except httpx.HTTPError as exc:
                        errors.append(f"{model}: {type(exc).__name__}")
                        continue
                    if resp.status_code == 200:
                        out = response_text(resp.json())
                        if out.strip():
                            return out
                        errors.append(f"{model}: trả rỗng")
                        continue
                    try:
                        msg = str((resp.json().get("error") or {}).get("message", ""))[:120]
                    except ValueError:
                        msg = resp.text[:120]
                    errors.append(f"{model}: HTTP {resp.status_code} {msg}".strip())
                    if resp.status_code not in RETRYABLE:
                        raise GeminiError("Gemini từ chối yêu cầu — " + errors[-1], errors)
                    if resp.status_code in (404, 429):
                        break  # model này không có / hết quota: sang model kế ngay
    finally:
        if owns:
            client.close()
    raise GeminiError("Gemini lỗi — " + "; ".join(errors[-6:]), errors)


def parse_json(raw: str) -> Any:
    """JSON trong câu trả lời; chịu được ```json … ``` và chữ thừa quanh object/array."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I | re.S)
    try:
        return json.loads(cleaned)
    except ValueError:
        starts = [i for i in (cleaned.find("{"), cleaned.find("[")) if i >= 0]
        if not starts:
            raise
        start = min(starts)
        end = max(cleaned.rfind("}"), cleaned.rfind("]"))
        return json.loads(cleaned[start:end + 1])


def generate_json(prompt: Union[str, Iterable[Part]], **kwargs: Any) -> Any:
    """Như generate() ở chế độ JSON, trả object đã parse. Một model trả JSON hỏng thì thử model kế."""
    models = list(kwargs.pop("models", FLASH_CHAIN))
    last: Optional[Exception] = None
    for i, model in enumerate(models):
        try:
            return parse_json(generate(prompt, models=models[i:], json_mode=True, **kwargs))
        except ValueError as exc:  # JSON hỏng: model sau có thể trả đúng
            last = exc
        except GeminiError:
            raise
    raise GeminiError(f"Gemini trả JSON không hợp lệ: {last}")
