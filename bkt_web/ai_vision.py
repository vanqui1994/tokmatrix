"""
AI Vision — port 1:1 từ testTuongTacWPF.Automation của nuoinickbaosam 11.10.14.

Gồm ba phần của bản gốc:
  - AiVisionFlowStep / AiVisionStepType: mô hình một bước trong kịch bản.
  - AiVisionSettings: cấu hình nhà cung cấp AI và mặc định của chúng.
  - AiVisionClient: dựng prompt và gọi Claude / Gemini / HHTechApi / VietApi / Custom.

Prompt, thang toạ độ 0-1000, cách thu nhỏ ảnh (cạnh dài 400px, JPEG chất lượng 40)
và thứ tự thử nhà cung cấp đều giữ đúng bản gốc.
"""

import base64
import io
import json
import random
import re
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence

import httpx

CLAUDE_URL = "https://api.anthropic.com/v1/messages"
HHTECH_URL = "https://hhtechapi.net/v1/messages"
VIETAPI_URL = "https://api.vietapi.tech/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

ANTHROPIC_VERSION = "2023-06-01"
MAX_TOKENS = 4096
# AiVisionClient: cạnh dài ảnh gửi cho AI và chất lượng JPEG
SCREENSHOT_MAX_EDGE = 400
SCREENSHOT_JPEG_QUALITY = 40
# Số phần tử tối đa liệt kê trong prompt và số lần thử lại mỗi nhà cung cấp
MAX_ELEMENTS_IN_PROMPT = 40
RETRY_PER_PROVIDER = 2


class AiVisionProviders:
    CLAUDE = "Claude"
    GEMINI = "Gemini"
    HHTECH = "HHTechApi"
    VIETAPI = "VietApi"
    CUSTOM = "Custom"
    GEMINI_ANTIGRAVITY = "GeminiAntigravity"


class AiVisionStepType(str, Enum):
    AI_GOAL = "AiGoal"
    WAIT = "Wait"
    RANDOM_WAIT = "RandomWait"
    TAP = "Tap"
    SWIPE = "Swipe"
    TEXT = "Text"
    GOTO = "Goto"
    SCROLL = "Scroll"
    KEY_PRESS = "KeyPress"


class AiVisionTargetKind(str, Enum):
    PHONE = "Phone"
    CHROME = "Chrome"


@dataclass
class UiElement:
    """UiElement — một phần tử bấm được trên màn hình."""
    label: str = ""
    left: int = 0
    top: int = 0
    right: int = 0
    bottom: int = 0

    @property
    def center(self) -> tuple:
        return ((self.left + self.right) // 2, (self.top + self.bottom) // 2)


@dataclass
class AiVisionFlowStep:
    """AiVisionFlowStep — giữ nguyên toàn bộ trường của bản gốc."""
    type: AiVisionStepType = AiVisionStepType.TAP
    goal: str = ""
    max_steps: int = 0
    wait_ms: int = 0
    random_min_ms: int = 0
    random_max_ms: int = 0
    resource_id: Optional[str] = None
    content_desc: Optional[str] = None
    element_text: Optional[str] = None
    screen_texts: Optional[List[str]] = None
    x: int = 0
    y: int = 0
    x2: int = 0
    y2: int = 0
    text: str = ""
    url: str = ""
    disambiguator_text: Optional[str] = None
    disambiguator_x: int = 0
    disambiguator_y: int = 0
    is_marked_complete: bool = False

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "AiVisionFlowStep":
        step = AiVisionFlowStep()
        for key, value in (data or {}).items():
            snake = re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower()
            if snake == "type":
                try:
                    step.type = AiVisionStepType(value)
                except ValueError:
                    step.type = AiVisionStepType.TAP
            elif hasattr(step, snake):
                setattr(step, snake, value)
        return step

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["type"] = self.type.value
        return data

    @property
    def type_label(self) -> str:
        return {
            AiVisionStepType.AI_GOAL: "Mục tiêu AI",
            AiVisionStepType.WAIT: "Chờ",
            AiVisionStepType.RANDOM_WAIT: "Chờ ngẫu nhiên",
            AiVisionStepType.TAP: "Nhấn",
            AiVisionStepType.SWIPE: "Vuốt",
            AiVisionStepType.TEXT: "Gõ chữ",
            AiVisionStepType.GOTO: "Mở URL",
            AiVisionStepType.SCROLL: "Cuộn",
            AiVisionStepType.KEY_PRESS: "Nhấn phím",
        }[self.type]


@dataclass
class AiVisionAction:
    """AiVisionAction — JSON mà AI trả về."""
    action: str = ""
    element_index: Optional[int] = None
    x: int = 0
    y: int = 0
    x2: int = 0
    y2: int = 0
    text: str = ""
    reason: str = ""


@dataclass
class AiVisionSettings:
    """AiVisionSettings — giữ nguyên tên trường và giá trị mặc định của bản gốc."""
    provider: str = AiVisionProviders.CLAUDE
    priority_targets: List[str] = field(default_factory=list)
    api_key: str = ""
    model: str = "claude-sonnet-4-5"
    google_api_key: str = ""
    google_model: str = "gemini-flash-latest"
    hhtech_api_key: str = ""
    hhtech_model: str = "claude-sonnet-5"
    vietapi_key: str = ""
    vietapi_model: str = "kimi-k2.6"
    custom_api_url: str = ""
    custom_api_key: str = ""
    custom_model: str = ""
    custom_format: str = "OpenAI"
    step_delay_ms: int = 0
    max_concurrent_devices: int = 1
    pool_match_retry_attempts: int = 0
    pool_match_retry_delay_ms: int = 0
    send_screenshot: bool = True

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "AiVisionSettings":
        settings = AiVisionSettings()
        for key, value in (data or {}).items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        # Bản gốc: nếu chưa chọn mục tiêu ưu tiên nào thì dùng đúng provider đang chọn
        if not settings.priority_targets and settings.provider != AiVisionProviders.GEMINI_ANTIGRAVITY:
            settings.priority_targets = [settings.provider]
        return settings

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def redacted(self) -> Dict[str, Any]:
        data = self.to_dict()
        for key in ("api_key", "google_api_key", "hhtech_api_key", "vietapi_key", "custom_api_key"):
            data[key] = "***" if data.get(key) else ""
        return data


class AiVisionError(Exception):
    pass


def encode_screenshot(png_bytes: bytes) -> tuple:
    """
    Bản gốc thu nhỏ ảnh về cạnh dài tối đa 400px rồi mã hoá JPEG chất lượng 40.

    Trả về (bytes, media_type). Nếu Pillow không có hoặc mã hoá lỗi thì trả
    nguyên ảnh PNG kèm đúng media_type của nó — khai PNG là JPEG sẽ bị các API
    vision từ chối request.
    """
    try:
        from PIL import Image

        image = Image.open(io.BytesIO(png_bytes))
        scale = min(1.0, SCREENSHOT_MAX_EDGE / max(image.width, image.height))
        if scale < 1.0:
            image = image.resize(
                (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
                Image.LANCZOS,
            )
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=SCREENSHOT_JPEG_QUALITY)
        return buffer.getvalue(), "image/jpeg"
    except Exception:
        return png_bytes, "image/png"


def downscale_screenshot(png_bytes: bytes) -> bytes:
    """Giữ lại cho mã cũ; chỉ trả phần bytes của encode_screenshot."""
    return encode_screenshot(png_bytes)[0]


def _truncate(value: str, length: int) -> str:
    value = value or ""
    return value if len(value) <= length else value[:length]


def build_prompt(
    goal: str,
    history: Sequence[str],
    elements: Sequence[UiElement],
    target: AiVisionTargetKind,
    send_screenshot: bool,
) -> str:
    """
    Dựng đúng chuỗi prompt của AiVisionClient, ghép từ 10 mảnh theo thứ tự gốc.
    """
    history_text = (
        "(chưa làm bước nào)" if not history
        else "\n".join(f"{i + 1}. {item}" for i, item in enumerate(history))
    )
    is_phone = target == AiVisionTargetKind.PHONE
    surface = "điện thoại Android" if is_phone else "trang web đang mở trong trình duyệt Chrome"
    empty_note = (
        "(không phát hiện được phần tử nào - có thể màn hình dạng WebView/game, chỉ dựa vào ảnh)"
        if is_phone else
        "(không phát hiện được phần tử nào - chỉ dựa vào ảnh)"
    )
    elements_text = (
        empty_note if not elements
        else "\n".join(
            f'{i}: "{_truncate(el.label, 50)}"'
            for i, el in enumerate(list(elements)[:MAX_ELEMENTS_IN_PROMPT])
        )
    )
    verbs = "tap|swipe|text|keyevent|wait|done" if is_phone else "tap|text|keyevent|navigate|wait|done"
    with_image = send_screenshot or not elements

    parts = [
        f"Nhiệm vụ trên {surface}: {goal}\n\n"
        f"Đã làm:\n{history_text}\n\n"
        f"Phần tử bấm được trên màn hình HIỆN TẠI (đánh số từ 0):\n{elements_text}\n\n",

        "Nhìn ảnh đính kèm + danh sách trên, quyết định 1 hành động DUY NHẤT tiếp theo. "
        if with_image else
        "KHÔNG có ảnh đính kèm lần này - chỉ dựa vào danh sách phần tử ở trên, quyết định 1 hành động DUY NHẤT tiếp theo. ",

        'Chỉ trả lời đúng 1 JSON, không thêm chữ nào khác:\n{"action": "',
        verbs,
        '", "elementIndex": null, "x": 0, "y": 0, "x2": 0, "y2": 0, "text": "", "reason": ""}\n'
        '- tap phần tử có trong danh sách: set đúng "elementIndex" (chính xác hơn đoán toạ độ), bỏ qua x/y.\n',

        '- tap chỗ KHÔNG có trong danh sách: "elementIndex": null, x/y theo thang TỈ LỆ 0-1000 so với ảnh '
        '(0=trái/trên, 1000=phải/dưới), KHÔNG dùng pixel thật.\n'
        if with_image else
        '- không có phần tử nào phù hợp trong danh sách để tap: KHÔNG đoán toạ độ tap (không có ảnh để tham chiếu) '
        '- trả về "wait" để chờ chụp lại, hoặc "keyevent"/"navigate" nếu phù hợp.\n',

        '- swipe: (x,y)→(x2,y2), luôn theo thang 0-1000 - vẫn dùng được dù không có ảnh, '
        'ước lượng theo mô tả mục tiêu (vd "vuốt xuống" ≈ (500,800)→(500,200)).\n'
        if is_phone else "",

        '- text: gõ "text" (chữ không dấu/số/ký tự cơ bản) - CHỈ khi bước TRƯỚC vừa tap đúng ô nhập, '
        'chưa chắc ô nào focus thì tap trước, đừng gõ ngay.\n',

        '- keyevent: phím cứng Android, "text" = tên keycode (BACK, HOME, ENTER...).\n'
        if is_phone else
        '- keyevent: phím bàn phím, "text" = tên phím (Enter, Escape, Tab...).\n'
        '- navigate: mở thẳng URL trong "text" - chỉ khi biết chắc URL.\n',

        "- wait: chờ tải/hiệu ứng xong rồi chụp lại.\n- done: đã xong mục tiêu.\n",
    ]
    return "".join(parts)


def parse_action(raw: str) -> AiVisionAction:
    """Bóc JSON đầu tiên trong câu trả lời và ánh xạ sang AiVisionAction."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"```\s*$", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise AiVisionError(f"AI không trả về JSON hợp lệ: {raw[:200]}")
    data = json.loads(text[start:end + 1])
    return AiVisionAction(
        action=str(data.get("action", "")).strip().lower(),
        element_index=data.get("elementIndex"),
        x=int(data.get("x") or 0),
        y=int(data.get("y") or 0),
        x2=int(data.get("x2") or 0),
        y2=int(data.get("y2") or 0),
        text=str(data.get("text") or ""),
        reason=str(data.get("reason") or ""),
    )


# --------------------------------------------------------------- transports

async def _post_json(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: float = 120.0) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
        if response.status_code >= 400:
            raise AiVisionError(f"HTTP {response.status_code}: {response.text[:300]}")
        return response.json()


def _anthropic_payload(model: str, prompt: str, image: Optional[bytes], media_type: str = "image/jpeg") -> Dict[str, Any]:
    content: List[Dict[str, Any]] = []
    if image:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64.b64encode(image).decode("ascii"),
            },
        })
    content.append({"type": "text", "text": prompt})
    return {"model": model, "max_tokens": MAX_TOKENS, "messages": [{"role": "user", "content": content}]}


def _openai_payload(model: str, prompt: str, image: Optional[bytes], media_type: str = "image/jpeg") -> Dict[str, Any]:
    content: List[Dict[str, Any]] = []
    if image:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{media_type};base64," + base64.b64encode(image).decode("ascii")},
        })
    content.append({"type": "text", "text": prompt})
    return {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "stream": False,
        "messages": [{"role": "user", "content": content}],
    }


def _gemini_payload(prompt: str, image: Optional[bytes], media_type: str = "image/jpeg") -> Dict[str, Any]:
    parts: List[Dict[str, Any]] = []
    if image:
        parts.append({
            "inline_data": {
                "mime_type": media_type,
                "data": base64.b64encode(image).decode("ascii"),
            }
        })
    parts.append({"text": prompt})
    return {"contents": [{"parts": parts}]}


def _anthropic_text(data: Dict[str, Any]) -> str:
    blocks = data.get("content") or []
    return "".join(b.get("text", "") for b in blocks if isinstance(b, dict))


def _openai_text(data: Dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    return (choices[0].get("message") or {}).get("content") or ""


def _gemini_text(data: Dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    parts = ((candidates[0].get("content") or {}).get("parts") or [])
    return "".join(p.get("text", "") for p in parts if isinstance(p, dict))


async def call_provider(
    settings: AiVisionSettings, provider: str, prompt: str, image: Optional[bytes],
    media_type: str = "image/jpeg",
) -> str:
    """Gọi đúng một nhà cung cấp, trả về phần text thô của câu trả lời."""
    if provider == AiVisionProviders.CLAUDE:
        if not settings.api_key:
            raise AiVisionError("Chưa nhập API key Claude")
        data = await _post_json(
            CLAUDE_URL,
            {"x-api-key": settings.api_key, "anthropic-version": ANTHROPIC_VERSION,
             "content-type": "application/json"},
            _anthropic_payload(settings.model, prompt, image, media_type),
        )
        return _anthropic_text(data)

    if provider == AiVisionProviders.HHTECH:
        if not settings.hhtech_api_key:
            raise AiVisionError("Chưa nhập API key HHTechApi")
        data = await _post_json(
            HHTECH_URL,
            {"x-api-key": settings.hhtech_api_key, "anthropic-version": ANTHROPIC_VERSION,
             "content-type": "application/json"},
            _anthropic_payload(settings.hhtech_model, prompt, image, media_type),
        )
        return _anthropic_text(data)

    if provider == AiVisionProviders.VIETAPI:
        if not settings.vietapi_key:
            raise AiVisionError("Chưa nhập API key VietApi")
        data = await _post_json(
            VIETAPI_URL,
            {"Authorization": f"Bearer {settings.vietapi_key}", "content-type": "application/json"},
            _openai_payload(settings.vietapi_model, prompt, image, media_type),
        )
        return _openai_text(data)

    if provider == AiVisionProviders.GEMINI:
        if not settings.google_api_key:
            raise AiVisionError("Chưa nhập API key Google")
        url = GEMINI_URL.format(model=settings.google_model)
        data = await _post_json(
            url,
            {"x-goog-api-key": settings.google_api_key, "content-type": "application/json"},
            _gemini_payload(prompt, image, media_type),
        )
        return _gemini_text(data)

    if provider == AiVisionProviders.CUSTOM:
        if not settings.custom_api_url:
            raise AiVisionError("Chưa nhập Base URL cho nhà cung cấp tự thêm")
        headers = {"content-type": "application/json"}
        if settings.custom_format == "Anthropic":
            headers["x-api-key"] = settings.custom_api_key
            headers["anthropic-version"] = ANTHROPIC_VERSION
            data = await _post_json(
                settings.custom_api_url,
                headers,
                _anthropic_payload(settings.custom_model, prompt, image, media_type),
            )
            return _anthropic_text(data)
        headers["Authorization"] = f"Bearer {settings.custom_api_key}"
        data = await _post_json(
            settings.custom_api_url,
            headers,
            _openai_payload(settings.custom_model, prompt, image, media_type),
        )
        return _openai_text(data)

    raise AiVisionError(f"Nhà cung cấp '{provider}' chưa được hỗ trợ")


async def decide_next_action(
    settings: AiVisionSettings,
    screenshot_png: Optional[bytes],
    goal: str,
    history: Sequence[str],
    elements: Sequence[UiElement],
    target: AiVisionTargetKind = AiVisionTargetKind.CHROME,
) -> AiVisionAction:
    """
    AiVisionClient.DecideNextActionAsync — thử lần lượt từng mục tiêu ưu tiên,
    mỗi mục tiêu thử tối đa 2 lần, đúng như vòng lặp của bản gốc.
    """
    prompt = build_prompt(goal, history, elements, target, settings.send_screenshot)
    send_image = settings.send_screenshot or not elements
    image, media_type = (
        encode_screenshot(screenshot_png) if (send_image and screenshot_png) else (None, "image/jpeg")
    )

    targets = settings.priority_targets or [AiVisionProviders.CLAUDE]
    last_error: Optional[Exception] = None
    for provider in targets:
        for _ in range(RETRY_PER_PROVIDER):
            try:
                return parse_action(await call_provider(settings, provider, prompt, image, media_type))
            except Exception as exc:  # bản gốc bỏ qua mọi lỗi trừ huỷ tác vụ
                last_error = exc
                continue

    if len(targets) == 1:
        raise AiVisionError(str(last_error) if last_error else "Không gọi được AI.")
    raise AiVisionError(
        f"Cả {len(targets)} mục tiêu AI đã bật đều lỗi - lỗi gần nhất: {last_error}"
    )


def random_delay(min_ms: int, max_ms: int) -> int:
    """PlaywrightHumanHelpers.RandomDelay"""
    if max_ms <= min_ms:
        return max(0, min_ms)
    return random.randint(min_ms, max_ms)
