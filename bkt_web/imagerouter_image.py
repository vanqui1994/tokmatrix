"""ImageRouter (imagerouter.io): nguồn ảnh dự phòng thứ nhất khi Antigravity không vẽ được.

Không có vòng quét riêng: cf_image_fallback chọn task (cùng điều kiện quota/chờ lâu, cùng
lease) rồi gọi `generate()` ở đây trước, lỗi mới rơi xuống Cloudflare Worker. Ảnh về
outbox kèm file đánh dấu engine="imagerouter", model="imagerouter:<model>", nên Thư
viện, hàng đợi và images.json ghi đúng nguồn, không bao giờ nhận là ảnh Antigravity.

Model: TOKMATRIX_IMAGEROUTER_MODELS (thử lần lượt), mặc định FLUX-2-klein-4b ($0.0006/ảnh
9:16, ~2,4 s) rồi Z-Image-Turbo. Trần chi phí mỗi ngày (giờ máy) TOKMATRIX_IMAGEROUTER_DAILY_USD
(mặc định 3): cộng dồn trường `cost` API trả về, chạm trần thì dừng tới ngày hôm sau.

Prompt không phải tiếng Anh (kênh Đức/Hàn/Nhật…) được dịch sang tiếng Anh bằng Gemini
(TOKMATRIX_IMAGEROUTER_TRANSLATE_MODEL, mặc định gemini-3.5-flash-lite; khoá ai.gemini hoặc
GEMNINI_KEY của compare_studio/.env), có cache; dịch lỗi thì gửi prompt gốc. Tắt dịch:
TOKMATRIX_IMAGEROUTER_TRANSLATE=0.

Khoá: `image.imagerouter` trong Kho Khoá API (hoặc env TOKMATRIX_IMAGEROUTER_KEY).
Tắt hẳn: TOKMATRIX_IMAGEROUTER=0.
"""

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("imagerouter_image")

KEY_NAME = "image.imagerouter"
SOURCE_ID = "imagerouter"
MODEL_PREFIX = "imagerouter:"
API_URL = os.environ.get("TOKMATRIX_IMAGEROUTER_URL",
                         "https://api.imagerouter.io/v1/openai/images/generations")
CREDITS_URL = "https://api.imagerouter.io/v1/credits"
DEFAULT_MODELS = "black-forest-labs/FLUX-2-klein-4b,Tongyi-MAI/Z-Image-Turbo"

ENABLED = os.environ.get("TOKMATRIX_IMAGEROUTER", "1") != "0"
MODELS = [m.strip() for m in os.environ.get("TOKMATRIX_IMAGEROUTER_MODELS", DEFAULT_MODELS).split(",") if m.strip()]
try:
    DAILY_USD = max(0.0, float(os.environ.get("TOKMATRIX_IMAGEROUTER_DAILY_USD", "3")))
except ValueError:
    DAILY_USD = 3.0
REQUEST_TIMEOUT = 120.0
MAX_PROMPT_CHARS = 2000

# Cạnh phải là bội số 16 (FLUX); cf_image_fallback.fit_to_ratio cắt về OUTPUT_DIMS sau đó.
REQUEST_DIMS = {"1:1": (1024, 1024), "9:16": (1088, 1920), "16:9": (1920, 1088),
                "4:3": (1152, 864), "3:4": (864, 1152)}

SPEND_FILE = Path(__file__).resolve().parent / "storage" / "imagerouter_spend.json"
TRANSLATE_ENABLED = os.environ.get("TOKMATRIX_IMAGEROUTER_TRANSLATE", "1") != "0"
TRANSLATE_MODEL = os.environ.get("TOKMATRIX_IMAGEROUTER_TRANSLATE_MODEL", "gemini-3.5-flash-lite")
TRANSLATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TRANSLATE_CACHE_FILE = Path(__file__).resolve().parent / "storage" / "imagerouter_translations.json"
TRANSLATE_CACHE_MAX = 3000
COMPARE_ENV = Path(__file__).resolve().parent.parent / "compare_studio" / ".env"

_lock = threading.Lock()
_model_cooldown: Dict[str, float] = {}   # model → epoch hết nghỉ (model lỗi tạm thời)
_account_cooldown = 0.0                   # cả tài khoản (khoá sai, hết credit, 429)
_stats: Dict[str, Any] = {"completed": 0, "failed": 0, "last_error": "", "last_ok_at": 0, "last_model": "",
                          "translated": 0, "translate_failed": 0, "translate_last_error": ""}
_translate_cooldown = 0.0
_translate_cache: Optional[Dict[str, str]] = None


class ImageRouterError(Exception):
    pass


class _Retry(Exception):
    def __init__(self, message: str, model_cooldown: int = 0, account_cooldown: int = 0):
        super().__init__(message)
        self.model_cooldown = model_cooldown
        self.account_cooldown = account_cooldown


def _token() -> str:
    try:
        try:
            from bkt_web.key_vault import get_key
        except ImportError:
            from key_vault import get_key
        value = get_key(KEY_NAME)
    except Exception:
        value = ""
    return value or os.environ.get("TOKMATRIX_IMAGEROUTER_KEY", "")


# ---------------------------------------------------------------------------
# Chi phí theo ngày
# ---------------------------------------------------------------------------

def _today(now: Optional[float] = None) -> str:
    return time.strftime("%Y-%m-%d", time.localtime(now or time.time()))


def _read_spend() -> Dict[str, Any]:
    try:
        data = json.loads(SPEND_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def spent_today(now: Optional[float] = None) -> float:
    day = _read_spend().get(_today(now)) or {}
    return float(day.get("usd") or 0)


def _add_spend(cost: float, model: str, now: Optional[float] = None) -> None:
    with _lock:
        data = _read_spend()
        key = _today(now)
        day = data.setdefault(key, {"usd": 0.0, "images": 0, "models": {}})
        day["usd"] = round(float(day.get("usd") or 0) + cost, 6)
        day["images"] = int(day.get("images") or 0) + 1
        day.setdefault("models", {})[model] = int(day["models"].get(model, 0)) + 1
        for old in sorted(data)[:-30]:  # giữ 30 ngày
            data.pop(old, None)
        SPEND_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = SPEND_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(SPEND_FILE)


def available(now: Optional[float] = None) -> bool:
    """Có thể gọi ImageRouter lúc này không (bật, có khoá, chưa chạm trần, không bị nghỉ)."""
    now = now or time.time()
    if not ENABLED or not MODELS or now < _account_cooldown:
        return False
    if DAILY_USD and spent_today(now) >= DAILY_USD:
        return False
    return bool(_token())


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_NO_TEXT_WORDS = ("text", "letter", "word", "watermark", "logo", "signature", "caption")

# Cụm phụ (sau chủ thể) mà FLUX vẽ thành chữ giả: bảng màu "text #F2EEE6", mã hex, tỉ lệ khung,
# và các vật mang chữ (bảng chứng cứ, giấy lưu trữ, tài liệu, báo…). Đo 25/09: prompt Matrix gốc
# ra ảnh đầy chữ vô nghĩa, bỏ các cụm này thì sạch.
_FLUX_DROP = re.compile(
    r"#[0-9a-f]{3,8}\b|\bpalette\b|\b\d+\s*:\s*\d+\b|caption|\btext\b|typograph|lettering|headline|"
    r"\blabels?\b|\bsign(age|s)?\b|posters?|evidence|archival|\bdocuments?\b|\bpapers?\b|newspaper|\bletters?\b|\bnotes?\b",
    re.I,
)
_LABEL = re.compile(r"^(camera|shot|lens|style|mood|lighting)\s*:\s*", re.I)


# Chủ thể là vật mang chữ đọc được: FLUX chỉ vẽ ra chữ vô nghĩa, cảnh này phải chờ Antigravity.
# Tiếng Anh + các từ Đức hay gặp (kênh DE viết prompt tiếng Đức).
_TEXT_SUBJECT = re.compile(
    r"\b(maps?|documents?|newspapers?|headlines?|letters?|ledgers?|manuscripts?|certificates?|receipts?|"
    r"posters?|signs?|signboards?|billboards?|placards?|banners?|labels?|charts?|graphs?|diagrams?|"
    r"infographics?|dashboards?|spreadsheets?|tables?\s+of|timelines?|calendars?|menus?|book\s+pages?|"
    r"pages?\s+of|text|typed|handwrit\w*|inscriptions?|error\s+messages?|screens?\s+(showing|displaying)|"
    r"karten?|landkarten?|dokumente?n?|zeitungs?\w*|schlagzeilen?|briefe?|urkunden?|akten?|schilder?|"
    r"plakate?|diagramme?|tabellen?|fehlermeldungen?|bildschirm\w*|inschriften?)\b",
    re.I,
)


def subject_needs_text(prompt: str) -> bool:
    """Cụm chủ thể (trước dấu phẩy/chấm đầu) nói tới vật phải có chữ đọc được."""
    head = re.split(r"[,;\n]|\.\s", prompt or "", maxsplit=1)[0]
    return bool(_TEXT_SUBJECT.search(head))


def clean_prompt(prompt: str) -> str:
    """Giữ nguyên cụm đầu (chủ thể); các cụm phụ bỏ những gì làm FLUX vẽ chữ, bỏ nhãn "camera:", bỏ lặp."""
    parts = [" ".join(p.split()).strip(" -:.") for p in re.split(r"[,;\n]+|\.\s+", prompt or "")]
    parts = [p for p in parts if p]
    if not parts:
        return ""
    out, seen = [parts[0]], {parts[0].lower()}
    for part in parts[1:]:
        part = _LABEL.sub("", part)
        if not part or _FLUX_DROP.search(part) or part.lower() in seen:
            continue
        seen.add(part.lower())
        out.append(part)
    return ", ".join(out)


# ---------------------------------------------------------------------------
# Dịch prompt sang tiếng Anh (FLUX klein hiểu kém tiếng Đức: "khí quyển sao Kim" ra thiên hà)
# ---------------------------------------------------------------------------

_FOREIGN_WORDS = {
    "der", "die", "das", "und", "mit", "von", "zu", "auf", "ein", "eine", "einer", "im", "den", "dem", "des",
    "sich", "wie", "nach", "aus", "gegen", "unter", "zwischen", "wird", "werden", "ist", "sind", "nicht",
    "le", "la", "les", "et", "une", "des", "du", "dans", "el", "los", "las", "y", "con", "del", "por",
}


def _non_latin(text: str) -> bool:
    return any(ord(ch) > 127 and unicodedata.category(ch).startswith("L")
               and "LATIN" not in unicodedata.name(ch, "") for ch in text)


def needs_translation(prompt: str) -> bool:
    """Prompt có vẻ không phải tiếng Anh: chữ ngoài hệ Latin, ≥2 chữ Latin có dấu (ä, é…) hoặc
    ≥2 từ chức năng Đức/Pháp/Tây Ban Nha. Một từ mượn như "café" không đủ."""
    text = prompt or ""
    if _non_latin(text):
        return True
    accented = sum(1 for ch in text if ord(ch) > 127 and unicodedata.category(ch).startswith("L"))
    stopwords = sum(word in _FOREIGN_WORDS for word in re.findall(r"[a-zäöüß]+", text.lower()))
    return accented >= 2 or stopwords >= 2


def _gemini_key() -> str:
    try:
        try:
            from bkt_web.key_vault import get_key
        except ImportError:
            from key_vault import get_key
        value = get_key("ai.gemini")
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


def _cache() -> Dict[str, str]:
    global _translate_cache
    if _translate_cache is None:
        try:
            data = json.loads(TRANSLATE_CACHE_FILE.read_text(encoding="utf-8"))
            _translate_cache = data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            _translate_cache = {}
    return _translate_cache


def _cache_put(key: str, value: str) -> None:
    with _lock:
        cache = _cache()
        cache[key] = value
        while len(cache) > TRANSLATE_CACHE_MAX:
            cache.pop(next(iter(cache)))
        try:
            TRANSLATE_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = TRANSLATE_CACHE_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            tmp.replace(TRANSLATE_CACHE_FILE)
        except OSError:
            pass


def to_english(prompt: str, client: Optional[httpx.Client] = None) -> str:
    """Dịch prompt sang tiếng Anh nếu cần (cache theo SHA-1). Lỗi/không có khoá → trả prompt gốc."""
    global _translate_cooldown
    prompt = " ".join((prompt or "").split())
    if not TRANSLATE_ENABLED or not needs_translation(prompt):
        return prompt
    key = hashlib.sha1(prompt.encode("utf-8")).hexdigest()
    cached = _cache().get(key)
    if cached:
        return cached
    api_key = _gemini_key()
    if not api_key or time.time() < _translate_cooldown:
        return prompt
    body = {"contents": [{"parts": [{"text": (
        "Translate this image-generation prompt into natural English. Keep its comma-separated structure, "
        "keep parts that are already English unchanged, add nothing. Output only the translated prompt.\n\n"
        + prompt[:MAX_PROMPT_CHARS])}]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 800}}
    owns = client is None
    client = client or httpx.Client(timeout=30.0)
    try:
        resp = client.post(TRANSLATE_URL.format(model=TRANSLATE_MODEL), params={"key": api_key}, json=body,
                           timeout=30.0)
        data = resp.json() if resp.content else {}
        if resp.status_code != 200:
            raise ValueError(f"Gemini HTTP {resp.status_code}: {str((data.get('error') or {}).get('message', ''))[:120]}")
        parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
        text = " ".join(" ".join(str(p.get("text", "")) for p in parts).split()).strip().strip('"')
        if not text or _non_latin(text):
            raise ValueError("Gemini không trả bản dịch tiếng Anh")
    except (httpx.HTTPError, ValueError) as exc:
        with _lock:
            _stats["translate_failed"] += 1
            _stats["translate_last_error"] = str(exc)[:200]
            _translate_cooldown = time.time() + (120 if "429" in str(exc) else 30)
        logger.warning("Dịch prompt ImageRouter lỗi, gửi bản gốc: %s", exc)
        return prompt
    finally:
        if owns:
            client.close()
    _cache_put(key, text)
    with _lock:
        _stats["translated"] += 1
    return text


def prepare_prompt(prompt: str, negative: str, client: Optional[httpx.Client] = None) -> str:
    """Prompt gửi ImageRouter: dịch sang tiếng Anh nếu cần → làm sạch cho FLUX → câu "không chữ"."""
    return with_negative(to_english(prompt, client), negative)


def with_negative(prompt: str, negative: str) -> str:
    """Làm sạch prompt cho FLUX; FLUX không có negative prompt nên yêu cầu "không chữ/logo" thành một câu."""
    prompt = clean_prompt(prompt)
    neg = (negative or "").lower()
    if any(word in neg for word in _NO_TEXT_WORDS) and "no text" not in prompt.lower():
        suffix = ". Clean image with no text, letters, captions, watermark or logo."
        return prompt[:MAX_PROMPT_CHARS - len(suffix)].rstrip(" .") + suffix
    return prompt[:MAX_PROMPT_CHARS]


# ---------------------------------------------------------------------------
# Gọi API
# ---------------------------------------------------------------------------

def _call(model: str, prompt: str, ratio: str, token: str, client: httpx.Client) -> Dict[str, Any]:
    width, height = REQUEST_DIMS.get(ratio, REQUEST_DIMS["1:1"])
    prompt = prompt[:MAX_PROMPT_CHARS]
    body = {"prompt": prompt, "model": model, "size": f"{width}x{height}",
            "response_format": "b64_json", "output_format": "png"}
    try:
        resp = client.post(API_URL, json=body, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise _Retry(f"không gọi được ImageRouter: {exc}", model_cooldown=120) from exc
    try:
        data = resp.json()
    except ValueError:
        data = {}
    err = data.get("error") if isinstance(data, dict) else None
    message = (err or {}).get("message", "") if isinstance(err, dict) else ""
    if resp.status_code in (401, 403):
        raise _Retry(f"ImageRouter từ chối khoá (HTTP {resp.status_code}): {message[:120]}", account_cooldown=3600)
    if resp.status_code == 402 or "credit" in message.lower() or "balance" in message.lower():
        raise _Retry(f"ImageRouter hết credit: {message[:160]}", account_cooldown=3600)
    if resp.status_code == 429:
        raise _Retry(f"ImageRouter 429: {message[:160]}", account_cooldown=15 * 60)
    if resp.status_code != 200 or err or not data.get("data"):
        # Lỗi của riêng model/nhà cung cấp (kích thước, provider sập…): thử model sau.
        raise _Retry(f"{model} lỗi HTTP {resp.status_code}: {(message or resp.text)[:200]}", model_cooldown=10 * 60)
    item = data["data"][0] or {}
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        try:
            got = client.get(item["url"])
            got.raise_for_status()
        except httpx.HTTPError as exc:
            raise _Retry(f"{model}: không tải được ảnh: {exc}", model_cooldown=120) from exc
        raw = got.content
    else:
        raise _Retry(f"{model}: phản hồi không có ảnh", model_cooldown=10 * 60)
    return {"raw": raw, "cost": float(data.get("cost") or 0), "model": model, "prompt": prompt}


def generate(prompt: str, ratio: str, client: Optional[httpx.Client] = None,
             now: Optional[float] = None) -> Dict[str, Any]:
    """Vẽ bằng model đầu tiên còn dùng được. Trả {"raw", "cost", "model", "prompt"} hoặc ImageRouterError."""
    global _account_cooldown
    now = now or time.time()
    if not available(now):
        raise ImageRouterError("ImageRouter không khả dụng (tắt, thiếu khoá, chạm trần ngày hoặc đang nghỉ)")
    token = _token()
    owns = client is None
    client = client or httpx.Client(timeout=REQUEST_TIMEOUT)
    errors: List[str] = []
    try:
        for model in MODELS:
            if _model_cooldown.get(model, 0) > now:
                continue
            try:
                result = _call(model, prompt, ratio, token, client)
            except _Retry as exc:
                errors.append(str(exc))
                with _lock:
                    if exc.model_cooldown:
                        _model_cooldown[model] = time.time() + exc.model_cooldown
                    if exc.account_cooldown:
                        _account_cooldown = max(_account_cooldown, time.time() + exc.account_cooldown)
                if exc.account_cooldown:
                    break
                continue
            _add_spend(result["cost"], model)
            with _lock:
                _stats["completed"] += 1
                _stats["last_ok_at"] = int(time.time())
                _stats["last_model"] = model
            return result
    finally:
        if owns:
            client.close()
    message = "; ".join(errors) or "mọi model ImageRouter đang nghỉ"
    with _lock:
        _stats["failed"] += 1
        _stats["last_error"] = message[:300]
    raise ImageRouterError(message)


def credits(timeout: float = 10.0) -> Optional[Dict[str, Any]]:
    token = _token()
    if not token:
        return None
    try:
        resp = httpx.get(CREDITS_URL, headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
        return resp.json() if resp.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None


def status(include_credits: bool = False) -> Dict[str, Any]:
    now = time.time()
    day = _read_spend().get(_today(now)) or {}
    with _lock:
        out = {
            "enabled": ENABLED, "has_token": bool(_token()), "models": MODELS,
            "daily_usd_cap": DAILY_USD, "spent_today_usd": round(float(day.get("usd") or 0), 4),
            "images_today": int(day.get("images") or 0), "models_today": day.get("models") or {},
            "account_cooldown_until": int(_account_cooldown) if _account_cooldown > now else 0,
            "model_cooldown_until": {m: int(t) for m, t in _model_cooldown.items() if t > now},
            "translate": {"enabled": TRANSLATE_ENABLED, "model": TRANSLATE_MODEL,
                          "cooldown_until": int(_translate_cooldown) if _translate_cooldown > now else 0},
            **_stats,
        }
    if include_credits:
        out["credits"] = credits()
    return out
