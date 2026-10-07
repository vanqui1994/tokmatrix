"""Compare Studio chạy native trong bkt_web.

Thay cho máy chủ Node ``compare_studio/studio/server/index.mjs`` (cổng 4321) và
proxy ``compare_proxy.py``. Mọi route cũ giữ nguyên đường dẫn và định dạng phản
hồi để frontend không phải đổi:

- Thư viện video, chi tiết kịch bản, sửa kịch bản, đổi ảnh, file tĩnh, luồng
  render, SFX/BGM, tác vụ chạy nền và log SSE: viết lại hoàn toàn bằng Python.
- Các thư viện JS của series (sinh chủ đề bằng AI, preview template, danh sách
  giọng, theme, auto-SFX, publishing kit, dựng lại composition so sánh) được gọi
  một lần mỗi yêu cầu qua ``compare_studio/tools/studio-bridge.mjs``, không còn
  tiến trình Node thường trực.
- Tạo video, sinh giọng, check và render vẫn là các script của từng dự án
  HyperFrames (``npm run check`` / ``npm run render``); chúng được khởi chạy trực
  tiếp từ đây như trước.
"""
from __future__ import annotations

import asyncio
import base64
import datetime
import json
import os
import random
import re
import shutil
import signal
import subprocess
import threading
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

try:
    from bkt_web.security import safe_child
except ImportError:  # chạy trực tiếp trong bkt_web/
    from security import safe_child

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COMPARE_DIR = Path(
    os.environ.get("TOKMATRIX_COMPARE_DIR", str(PROJECT_ROOT / "compare_studio"))
).resolve()
if not COMPARE_DIR.exists() and (PROJECT_ROOT.parent / "auto-compare-video-mod").exists():
    COMPARE_DIR = (PROJECT_ROOT.parent / "auto-compare-video-mod").resolve()
VIDEOS_DIR = COMPARE_DIR / "videos"
TOOLS_DIR = COMPARE_DIR / "tools"
SHARED_AUDIO_DIR = COMPARE_DIR / "shared" / "audio"
BRIDGE = TOOLS_DIR / "studio-bridge.mjs"
STATIC_DIR = Path(__file__).resolve().parent / "static"
GENERATED_IMAGES_DIR = STATIC_DIR / "generated_images"

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

compare_native_router = APIRouter(tags=["compare_studio_native"])

SLUG_RE = re.compile(r"^[a-z0-9-]+$", re.I)
ANSI_RE = re.compile("\x1b\\[[0-9;]*m")
MEDIA_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".woff2": "font/woff2",
    ".json": "application/json",
}


def error(code: int, message: str, **extra: Any) -> JSONResponse:
    return JSONResponse(status_code=code, content={"error": message, **extra})


def safe_slug(slug: Any) -> bool:
    return isinstance(slug, str) and bool(SLUG_RE.fullmatch(slug))


# ---------------------------------------------------------------------------
# Ngữ nghĩa JS: `a || b` coi [] và {} là truthy, `a ?? b` chỉ bỏ qua null.
# Phần phân tích kịch bản dựa nhiều vào hai toán tử này nên giữ đúng như bản Node.
# ---------------------------------------------------------------------------
def _truthy(value: Any) -> bool:
    if value is None or value is False:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value == value and value != 0  # NaN và 0 là falsy
    if isinstance(value, str):
        return value != ""
    return True


def jor(*values: Any) -> Any:
    for value in values[:-1]:
        if _truthy(value):
            return value
    return values[-1]


def nn(*values: Any) -> Any:
    for value in values[:-1]:
        if value is not None:
            return value
    return values[-1]


def g(obj: Any, *keys: Any) -> Any:
    """Optional chaining: g(spec, "survivalConfig", "tiers")."""
    for key in keys:
        if isinstance(obj, dict):
            obj = obj.get(key)
        elif isinstance(obj, list) and isinstance(key, int):
            obj = obj[key] if -len(obj) <= key < len(obj) else None
        else:
            return None
    return obj


def _num(value: Any, default: float = 0) -> float:
    try:
        out = float(value)
        return int(out) if out.is_integer() else out
    except (TypeError, ValueError):
        return default


def read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def read_json(path: Path) -> Any:
    text = read_text(path)
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def _js_numbers(value: Any) -> Any:
    """JSON.stringify ghi 64.0 thành 64; giữ file giống hệt bản Node đã ghi."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: _js_numbers(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_js_numbers(v) for v in value]
    return value


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(_js_numbers(data), ensure_ascii=False, indent=2), encoding="utf-8")


def parse_const_array(html: Optional[str], pattern: str) -> Optional[list]:
    if not html:
        return None
    m = re.search(pattern, html)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return None
    return data if isinstance(data, list) else None


def to_iso(ts: float) -> str:
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(ts * 1000) % 1000:03d}Z"


def iso_ts(value: Any) -> float:
    if not isinstance(value, str):
        return 0.0
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# Cầu gọi thư viện JS
# ---------------------------------------------------------------------------
class BridgeError(RuntimeError):
    pass


async def bridge(op: str, args: Optional[Dict[str, Any]] = None, *, timeout: float = 120) -> Any:
    if not BRIDGE.exists():
        raise BridgeError(f"Thiếu {BRIDGE}")
    proc = await asyncio.create_subprocess_exec(
        "node", str(BRIDGE), op,
        cwd=str(COMPARE_DIR),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        # Matrix's resolved 180-channel catalog is ~600 KB; asyncio's 64 KB
        # default reader limit otherwise truncates the one-line bridge JSON.
        limit=1024 * 1024,
        env={**os.environ, "FORCE_COLOR": "0"},
    )
    try:
        out, err = await asyncio.wait_for(
            proc.communicate(json.dumps(args or {}, ensure_ascii=False).encode()), timeout
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise BridgeError(f"'{op}' quá thời gian {int(timeout)}s")
    lines = [l for l in out.decode("utf-8", "replace").splitlines() if l.strip()]
    try:
        payload = json.loads(lines[-1])
    except (IndexError, ValueError):
        tail = err.decode("utf-8", "replace").strip().splitlines()[-3:]
        raise BridgeError(" | ".join(tail) or f"'{op}' không trả kết quả")
    if not payload.get("ok"):
        raise BridgeError(payload.get("error") or f"'{op}' thất bại")
    return payload.get("result")


_curated_cache: Dict[str, Any] = {"key": None, "data": {"tierlist": {}, "chalk": {}, "wildlife": {}}}
_CURATED_FILES = ("tierlist-configs.mjs", "chalk-configs.mjs", "wildlife-configs.mjs")


async def curated_topics() -> Dict[str, Dict[str, Any]]:
    """Chủ đề tuyển chọn (tierlist/chalk/wildlife) — đọc một lần, làm mới khi file đổi."""
    key = tuple((TOOLS_DIR / f).stat().st_mtime if (TOOLS_DIR / f).exists() else 0 for f in _CURATED_FILES)
    if _curated_cache["key"] != key:
        try:
            _curated_cache["data"] = await bridge("curated", timeout=30)
            _curated_cache["key"] = key
        except BridgeError as exc:
            print(f"[compare_native] Không đọc được curated topics: {exc}")
    return _curated_cache["data"]


# ---------------------------------------------------------------------------
# Thư viện video
# ---------------------------------------------------------------------------
def list_slugs() -> List[str]:
    if not VIDEOS_DIR.exists():
        return []
    return sorted(p.name for p in VIDEOS_DIR.iterdir() if p.is_dir())


def frontmatter(md: Optional[str]) -> Dict[str, str]:
    if not md or not md.startswith("---"):
        return {}
    end = md.find("\n---", 3)
    if end < 0:
        return {}
    out = {}
    for line in md[4:end].split("\n"):
        m = re.match(r"^([a-z_]+):\s*(.*)$", line, re.I)
        if m:
            out[m.group(1)] = re.sub(r"^[\"']|[\"']$", "", m.group(2)).strip()
    return out


def latest_render(renders_dir: Path) -> Optional[Dict[str, Any]]:
    try:
        # Bản trượt Video QA được cất thành <slug>.rejected.mp4 — không bao giờ là bản render hiện tại.
        files = [p for p in renders_dir.iterdir() if p.name.endswith(".mp4") and not p.name.endswith(".rejected.mp4") and p.is_file()]
    except OSError:
        return None
    if not files:
        return None
    newest = max(files, key=lambda p: p.stat().st_mtime)
    st = newest.stat()
    return {"name": newest.name, "size": st.st_size, "mtime": st.st_mtime * 1000}


def _video_dir(slug: str) -> Path:
    return safe_child(VIDEOS_DIR, slug)


# ---------------------------------------------------------------------------
# Nhận diện thể loại — MỘT chỗ duy nhất cho trang chi tiết, sửa kịch bản, thư viện.
#
# Trước đây mỗi nhánh tự đoán theo marker HTML và xét theo thứ tự cố định, nên
# video wildlife/mystery (HTML có `const SCENES =`) bị nhánh chalk bắt trước, còn
# kinetic (có `const BEATS =`) bị nhánh vox bắt. Giờ xét khai báo tường minh trước,
# marker HTML chỉ là phương án cuối.
# ---------------------------------------------------------------------------
VIDEO_TYPES = ("compare", "survival", "tierlist", "vox", "newspaper", "chalk",
               "wildlife", "kinetic", "science", "mystery", "folklore", "vector")
_TYPE_CATEGORIES = {"vox-collage": "vox", "retro-newspaper": "newspaper", "dark-cyber-kinetic": "kinetic"}
_TYPE_CONFIG_KEYS = (
    ("folkloreConfig", "folklore"), ("survivalConfig", "survival"), ("tierListConfig", "tierlist"),
    ("chalkConfig", "chalk"), ("wildlifeConfig", "wildlife"), ("mysteryConfig", "mystery"),
    ("scienceConfig", "science"), ("voxConfig", "vox"), ("newspaperConfig", "newspaper"),
    ("kineticConfig", "kinetic"), ("vectorConfig", "vector"),
)
_TYPE_PREFIXES = (
    ("folklore-", "folklore"), ("survival-", "survival"), ("tierlist-", "tierlist"), ("chalk-", "chalk"),
    ("wildlife-", "wildlife"), ("dong-vat-", "wildlife"), ("mystery-", "mystery"), ("bi-an-", "mystery"),
    ("science-", "science"), ("vox-", "vox"), ("newspaper-", "newspaper"), ("kinetic-", "kinetic"),
    ("vector-", "vector"),
)
# Marker riêng của từng template trước, marker chung (mảng dữ liệu) sau.
_TYPE_HTML_MARKERS = (
    ("scanner-card", "survival"), ("chalk-card", "chalk"), ("viewfinder-grid", "wildlife"),
    ("tactical-stats-hud", "wildlife"), ("story-card", "mystery"), ("cyber-ambient-bg", "kinetic"),
    ("wireframe-wrap", "kinetic"), ("newsprint-bg", "newspaper"), ("vox-collage", "vox"),
    ("const FOLKLORE =", "folklore"), ("const ITEMS =", "tierlist"), ("const DIALOGUES =", "science"),
    ("const ACTS =", "newspaper"), ("const BEATS =", "vox"), ("const SCENES =", "chalk"),
)


def detect_video_type(slug: str, meta: Any = None, spec: Any = None, html: Optional[str] = None, brief: Optional[str] = None) -> str:
    """Thể loại của một video: khai báo type → cấu hình nhúng → tiền tố slug → marker HTML → compare."""
    for value in (g(spec, "type"), g(meta, "type"), g(meta, "template"), g(spec, "template")):
        if value in VIDEO_TYPES:
            return value
    for value in (g(meta, "category"), g(spec, "category")):
        if value in _TYPE_CATEGORIES:
            return _TYPE_CATEGORIES[value]
    for key, kind in _TYPE_CONFIG_KEYS:
        if _truthy(g(spec, key)) or _truthy(g(meta, key)):  # {} vẫn tính là có, như JS
            return kind
    for prefix, kind in _TYPE_PREFIXES:
        if slug.startswith(prefix):
            return kind
    if _has(brief, "anthropomorphic-science"):
        return "science"
    for marker, kind in _TYPE_HTML_MARKERS:
        if _has(html, marker):
            return kind
    return "compare"


_LANGS = ("vi", "en", "de", "fr", "ja", "ko")
_TITLE_KEYS = (
    ("folkloreConfig", "topicTitle"), ("mysteryConfig", "topicTitle"), ("wildlifeConfig", "topicTitle"),
    ("voxConfig", "topicTitle"), ("newspaperConfig", "topicTitle"), ("kineticConfig", "headline"),
    ("tierListConfig", "topicTitle"), ("chalkConfig", "topicTitle"), ("survivalConfig", "title"),
)


def video_lang_title(slug: str) -> Dict[str, str]:
    """Ngôn ngữ và tiêu đề hiển thị thật của video (không đoán từ chuỗi con của slug).

    Ngôn ngữ ưu tiên khai báo (spec/meta/config) rồi mới đến VIDEO_LANG, BRIEF, đuôi slug
    và cuối cùng <html lang> — vài template ghi cứng lang="en" trong HTML.
    """
    d = _video_dir(slug)
    meta, spec = read_json(d / "meta.json"), read_json(d / "spec.json")
    brief = read_text(d / "BRIEF.md")
    fm = frontmatter(brief)
    vo = read_text(d / "scripts" / "generate-vo.mjs") or ""
    html = read_text(d / "index.html") or ""
    vo_lang = re.search(r'const VIDEO_LANG = "([a-z]{2})"', vo)
    html_lang = re.search(r"<html[^>]+lang=[\"']([a-z]{2,5})[\"']", html, re.I)
    tail = slug.rsplit("-", 1)[-1]
    candidates = [g(spec, "lang"), g(meta, "lang"), *(g(meta, k, "lang") for k, _ in _TITLE_KEYS),
                  *(g(spec, k, "lang") for k, _ in _TITLE_KEYS), vo_lang and vo_lang.group(1), fm.get("language"),
                  tail if tail in _LANGS else None, html_lang and html_lang.group(1)]
    lang = next((c[:2] for c in candidates if isinstance(c, str) and c[:2] in _LANGS), "en")

    if detect_video_type(slug, meta, spec, html, brief) == "compare":
        # meta.name của compare không tin được ("comparison-video", slug…): lấy 2 vế so sánh.
        left, right = g(spec, "labelLeft"), g(spec, "labelRight")
        if not (left and right) and "-vs-" in slug:
            words = [w for w in slug.split("-") if w not in _LANGS or w == "vs"]
            joined = " ".join(words)
            left, right = [p.strip().title() for p in joined.split(" vs ", 1)]
        if left and right:
            return {"lang": lang, "title": f"{left} vs {right}"}

    title = ""
    name = str(g(meta, "name") or "").strip()
    for value in (*(g(meta, k, f) for k, f in _TITLE_KEYS), *(g(spec, k, f) for k, f in _TITLE_KEYS),
                  g(spec, "topicTitle"), g(spec, "title"), name if name.lower() != slug.lower() else None):
        if isinstance(value, str) and value.strip():
            title = value.strip()
            break
    if not title and brief:
        heading = re.search(r"^# (.+)$", brief, re.M)
        title = heading.group(1).strip() if heading else ""
    if not title and g(spec, "labelLeft") and g(spec, "labelRight"):
        title = f"{spec['labelLeft']} vs {spec['labelRight']}"
    if not title:
        title = re.sub(r"\b\w", lambda m: m.group(0).upper(), slug.replace("-", " "))
    return {"lang": lang, "title": title}


# ---------------------------------------------------------------------------
# Ảnh Antigravity của video — cùng định dạng với compare_studio/tools/antigravity-images.mjs
# (videos/<slug>/images.json). Ảnh AI chỉ đi qua hàng đợi Antigravity, không Pollinations.
# ---------------------------------------------------------------------------
IMAGE_STATE_FILE = "images.json"
DEFAULT_IMAGE_NEGATIVE = "text, letters, words, watermark, logo, signature, frame border, blurry, low quality"
# Nguồn ảnh dùng được để render/đăng: ảnh Antigravity, ảnh dự phòng ImageRouter / Cloudflare
# Worker (khi Antigravity hết quota), ảnh cũ đang chờ thay, ảnh người dùng tự tải lên.
READY_IMAGE_SOURCES = ("antigravity", "imagerouter", "cf_worker", "replacing", "manual")
_TYPE_IMAGE_ASPECT = {"folklore": "1:1", "vox": "1:1", "newspaper": "1:1", "wildlife": "9:16", "mystery": "4:3", "compare": "1:1"}


def read_image_state(d: Path) -> Dict[str, Any]:
    data = read_json(d / IMAGE_STATE_FILE)
    return data if isinstance(data, dict) and isinstance(data.get("items"), dict) else {"version": 1, "items": {}}


# Khoá read-modify-write images.json giữa request đổi ảnh và luồng tự gán ảnh.
IMAGE_STATE_LOCK = threading.Lock()


def write_image_state(d: Path, state: Dict[str, Any]) -> None:
    state = {**state, "version": 1, "updatedAt": to_iso(time.time())}
    tmp = d / f"{IMAGE_STATE_FILE}.tmp"
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(d / IMAGE_STATE_FILE)


def pending_images(slug: str) -> List[str]:
    """Ảnh khiến video chưa render/đăng được (đang chờ Antigravity, nền tạm, mất file)."""
    d = _video_dir(slug)
    items = read_image_state(d)["items"]
    return [key for key, it in items.items()
            if it.get("source") not in READY_IMAGE_SOURCES or not (d / str(it.get("dest") or "")).is_file()]


def image_status(slug: str) -> Dict[str, Any]:
    d = _video_dir(slug)
    items = read_image_state(d)["items"]
    pending = pending_images(slug)
    return {
        "total": len(items),
        "ready": len(items) - len(pending),
        "pending": pending,
        "replacing": [k for k, it in items.items() if it.get("source") == "replacing"],
        "failed": [k for k, it in items.items() if it.get("error") and (it.get("attempts") or 0) >= 3],
    }


def detect_video_type_for_slug(slug: str) -> str:
    """Như detect_video_type nhưng tự đọc file trong videos/<slug>/."""
    d = _video_dir(slug)
    return detect_video_type(
        slug, read_json(d / "meta.json"), read_json(d / "spec.json"),
        read_text(d / "index.html"), read_text(d / "BRIEF.md"),
    )


async def video_summary(slug: str) -> Dict[str, Any]:
    d = _video_dir(slug)
    brief = read_text(d / "BRIEF.md")
    html = read_text(d / "index.html")
    durations_assets = read_json(d / "assets" / "vo" / "durations.json")
    durations_scripts = read_json(d / "scripts" / "durations.json")
    meta = read_json(d / "meta.json")
    fm = frontmatter(brief)

    # Cùng thứ tự với video_lang_title: khai báo (spec/meta/config) trước, <html lang> sau cùng —
    # vài template ghi cứng lang (science: "vi") nên video tiếng Đức từng bị gắn cờ Việt.
    lang_title = video_lang_title(slug)
    dur_match = re.search(r"const (?:ROOT|TOTAL)_DURATION = ([\d.]+);", html or "")
    duration = _num(nn(g(meta, "duration"), dur_match.group(1) if dur_match else None, nn(g(durations_scripts, "rootDuration"), 0)))
    render = latest_render(d / "renders")

    created_at = g(meta, "createdAt")
    if not created_at:
        try:
            st = d.stat()
            created_at = to_iso(getattr(st, "st_birthtime", 0) or st.st_mtime)
        except OSError:
            pass

    lines_count = 0
    if isinstance(durations_assets, dict):
        lines_count = len(durations_assets)
    else:
        for keys, extra in (
            (("results",), 0),
            (("mysteryConfig", "scenes"), 0),
            (("voxConfig", "beats"), 0),
            (("newspaperConfig", "acts"), 0),
            (("kineticConfig", "beats"), 0),
            (("survivalConfig", "tiers"), 2),
            (("scienceConfig", "dialogues"), 0),
            (("tierListConfig", "items"), 0),
            (("chalkConfig", "scenes"), 0),
            (("wildlifeConfig", "scenes"), 0),
            (("folkloreConfig", "scenes"), 0),
        ):
            source = durations_scripts if keys == ("results",) else meta
            seq = g(source, *keys)
            if isinstance(seq, list) and seq:
                lines_count = len(seq) + extra
                break
        else:
            for pattern in (r"const ITEMS = (\[[\s\S]*?\]);", r"const SCENES = (\[[\s\S]*?\]);", r"const DIALOGUES = (\[[\s\S]*?\]);"):
                arr = parse_const_array(html, pattern)
                if arr:
                    lines_count = len(arr)
                    break
            if not lines_count:
                curated = await curated_topics()
                for kind, field in (("tierlist", "items"), ("chalk", "scenes"), ("wildlife", "scenes")):
                    seq = g(curated, kind, slug, field)
                    if isinstance(seq, list) and seq:
                        lines_count = len(seq)
                        break

    return {
        "slug": slug,
        "type": detect_video_type(slug, meta, read_json(d / "spec.json"), html, brief),
        "title": lang_title["title"],
        "lang": lang_title["lang"],
        "duration": duration,
        "lines": lines_count,
        "message": fm.get("message", ""),
        "hasRender": bool(render),
        "render": render,
        "hasSnapshot": (d / "snapshots" / "contact-sheet.jpg").exists(),
        "imagesPending": len(pending_images(slug)),
        "createdAt": created_at or to_iso(time.time()),
    }


BEATS_20 = [
    "hook", "hook",
    "stakes", "question",
    "side A (def)", "side A (mech)", "side A (power)", "side A (flaw)",
    "bridge",
    "side B (def)", "side B (sol)", "side B (power)", "side B (tradeoff)",
    "round 1", "round 2", "round 3", "summary",
    "golden rule", "payoff", "cta",
]
BEATS_12 = ["hook", "hook", "question", "side A", "side A", "side A", "side B", "side B", "side B", "compare", "compare", "payoff"]

VO_LINE_RE = re.compile(r"""(?:id|["']id["'])\s*:\s*["']line-(\d+)["'][\s\S]*?(?:text|["']text["'])\s*:\s*["']([\s\S]*?)["']\s*\}""")
TAIL_SCENES = r"const SCENES = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|</script>|window\.__timelines)"
TAIL_BEATS = r"const BEATS = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|</script>|window\.__timelines)"
TAIL_ACTS = r"const ACTS = (\[[\s\S]*?\]);\s*(?:const TOTAL_DURATION|</script>|window\.__timelines)"


def _has(html: Optional[str], needle: str) -> bool:
    return bool(html) and needle in html


def _matrix_scene_list(script: Any) -> list:
    """Cảnh của video Matrix (spec.script) theo các tên trường mà video_detail của từng thể loại đọc."""
    out = []
    for i, sc in enumerate(script if isinstance(script, list) else []):
        if not isinstance(sc, dict):
            continue
        line = sc.get("line") or ""
        out.append({"line": line, "text": line, "caption": line, "spoken": line,
                    "start": sc.get("start_seconds"), "duration": sc.get("duration_seconds"),
                    "telemetry": sc.get("beat_id") or "", "imagePrompt": sc.get("image_prompt") or sc.get("visual_intent") or "",
                    "visual": sc.get("visual_intent") or "", "n": sc.get("scene_index") or i + 1})
    return out


def _fix_variant_scenes(*docs: Any) -> None:
    """Video Matrix dùng layout biến thể lưu `<x>Config.scenes` là SỐ cảnh (vd. mysteryConfig {variant_id, scenes: 12}),
    danh sách thật ở spec.script → thay bằng danh sách dựng từ script (trước đây /api/videos/<slug> lỗi 500 với 79 video)."""
    script = next((doc.get("script") for doc in docs if isinstance(doc, dict) and isinstance(doc.get("script"), list)), None)
    for doc in docs:
        if not isinstance(doc, dict):
            continue
        for key, cfg in doc.items():
            if key.endswith("Config") and isinstance(cfg, dict) and "scenes" in cfg and not isinstance(cfg["scenes"], list):
                cfg["scenes"] = _matrix_scene_list(script)


async def video_detail(slug: str) -> Dict[str, Any]:
    d = _video_dir(slug)
    summary = await video_summary(slug)
    vo = read_text(d / "scripts" / "generate-vo.mjs")
    html = read_text(d / "index.html")
    durations_assets = read_json(d / "assets" / "vo" / "durations.json")
    durations_scripts = read_json(d / "scripts" / "durations.json")
    brief = read_text(d / "BRIEF.md")
    spec_raw = read_json(d / "spec.json")
    meta = read_json(d / "meta.json")
    _fix_variant_scenes(spec_raw, meta)
    brief_out = brief if brief is not None else ""

    def exists(rel: str) -> bool:
        return (d / rel).exists()

    def media(rel: str) -> str:
        return f"/videos/{slug}/{rel}"

    results = g(durations_scripts, "results")
    if durations_assets:
        durations = durations_assets
    elif results:
        durations = {f"line-{i + 1}": r.get("dur") for i, r in enumerate(results) if isinstance(r, dict)}
    else:
        durations = durations_scripts

    spec = spec_raw
    if not _truthy(spec):
        has_cfg = jor(g(meta, "type"), g(meta, "mysteryConfig"), g(meta, "scienceConfig"), g(meta, "survivalConfig"))
        spec = dict(meta) if _truthy(has_cfg) and isinstance(meta, dict) else None

    def dur_of(key: str) -> Any:
        return g(durations, key) if isinstance(durations, dict) else None

    spoken: Dict[int, str] = {}
    if vo:
        for m in VO_LINE_RE.finditer(vo):
            spoken[int(m.group(1))] = m.group(2).replace('\\"', '"').replace("\\n", " ")

    kind = detect_video_type(slug, meta, spec_raw, html, brief)

    def matrix_script() -> list:
        rows = []
        for i, sc in enumerate(_matrix_scene_list(g(spec_raw, "script"))):
            n = i + 1
            img = next((r for r in (f"assets/images/scene-{n}.jpg", f"assets/images/scene-{n}.png") if exists(r)), None)
            rows.append({"n": n, "sceneId": n, "spoken": sc["line"], "caption": sc["line"],
                         "start": nn(sc["start"], i * 5.0), "dur": nn(sc["duration"], 5.0),
                         "beat": f"Cảnh {n}: {sc['telemetry'] or f'Phân cảnh {n}'}", "title": f"Phân cảnh {n}",
                         "imagePrompt": sc["imagePrompt"], **({"image": media(img)} if img else {})})
        return rows

    def done(script: list, *, override_lines: bool = False) -> Dict[str, Any]:
        if not script:  # thể loại không đọc được cảnh (layout biến thể Matrix): dựng từ spec.script
            script = matrix_script()
            override_lines = override_lines or bool(script)
        out = {**summary, "script": script, "spec": spec, "brief": brief_out}
        if override_lines:
            out["lines"] = len(script)
        return out

    # --- Tâm Linh Dân Gian ---------------------------------------------------
    if kind == "folklore":
        cfg = jor(g(meta, "folkloreConfig"), g(spec, "folkloreConfig"), {})
        shots = {s.get("id"): s for s in (cfg.get("shots") or []) if isinstance(s, dict)}
        script = []
        for idx, sc in enumerate(cfg.get("scenes") or []):
            n = idx + 1
            shot_id = sc.get("shot") or 1
            shot = shots.get(shot_id) or {}
            img_rel = f"assets/images/scene-{shot_id}.jpg"
            source = shot.get("imageSource")
            script.append({
                "n": n,
                "sceneId": shot_id,
                "shot": shot_id,
                "spoken": jor(sc.get("line"), ""),
                "caption": jor(sc.get("line"), ""),
                "start": sc.get("start"),
                "dur": sc.get("duration"),
                "beat": f"Shot {shot_id}" + (f" · FX {sc['fx']}" if sc.get("fx") and cfg.get("vfx") == "horror" else ""),
                "title": f"Shot {shot_id}",
                "fx": sc.get("fx"),
                "desc": {
                    "antigravity": "Ảnh Antigravity",
                    "imagerouter": "Ảnh dự phòng ImageRouter",
                    "cf_worker": "Ảnh dự phòng Cloudflare Worker",
                    "instant": "Ảnh sinh tức thì",
                    "instant-fallback": "Ảnh dự phòng — chờ Antigravity",
                    "placeholder": "Chưa có ảnh — chờ Antigravity",
                }.get(source, "Chưa có ảnh"),
                "imageSource": source,
                "image": media(img_rel) if exists(img_rel) else None,
                "imagePrompt": jor(shot.get("prompt"), shot.get("visual"), ""),
            })
        if not _truthy(spec):
            spec = {"type": "folklore", "slug": slug, "folkloreConfig": cfg, **(meta or {})}
        elif not spec.get("folkloreConfig"):
            spec["folkloreConfig"] = cfg
        return done(script, override_lines=True)

    # --- Survival -----------------------------------------------------------
    is_survival = kind == "survival"
    if is_survival:
        cfg = jor(g(spec, "survivalConfig"), g(meta, "survivalConfig"), None)
        if not _truthy(cfg) or not _truthy(g(cfg, "tiers")):
            tiers_match = re.search(r"const TIERS = (\[[\s\S]*?\]);", html or "")
            parsed = parse_const_array(html, r"const TIERS = (\[[\s\S]*?\]);")
            if tiers_match and parsed is None:
                # TIERS là literal JS (không phải JSON): giữ cấu hình tối thiểu như bản Node.
                cfg = {"lang": summary["lang"], "slug": slug, "tiers": [], **(cfg or {})}
            else:
                cfg = {
                    "lang": summary["lang"], "slug": slug, "tiers": parsed or [],
                    "prologueSpoken": jor(spoken.get(1), ""), "prologueText": jor(spoken.get(1), ""),
                    "ctaSpoken": jor(spoken.get(12), ""), "ctaText": jor(spoken.get(12), ""),
                    **(cfg or {}),
                }
        tiers = jor(cfg.get("tiers"), [])
        script = [{
            "n": 1,
            "spoken": nn(spoken.get(1), cfg.get("prologueSpoken"), ""),
            "caption": nn(cfg.get("prologueText"), cfg.get("prologueSpoken"), spoken.get(1), ""),
            "start": 0.2,
            "dur": nn(dur_of("line-1"), 3.48),
            "beat": "Lời mở đầu (Hook)",
            "image": None,
        }]
        for idx, t in enumerate(tiers):
            n, tier_id = idx + 2, idx + 1
            img_rel = f"assets/images/tier-{tier_id}.jpg"
            title = jor(t.get("title"), "")
            desc = jor(t.get("desc"), "")
            script.append({
                "n": n,
                "tierId": tier_id,
                "spoken": nn(spoken.get(n), t.get("caption"), ""),
                "caption": nn(t.get("caption"), spoken.get(n), ""),
                "start": 4.2 + idx * 5.5,
                "dur": nn(dur_of(f"line-{n}"), 4.69),
                "beat": f"Cấp {tier_id}/10: {title}",
                "title": title,
                "desc": desc,
                "survival": jor(t.get("survival"), ""),
                "image": media(img_rel) if exists(img_rel) else None,
                "imagePrompt": jor(t.get("imagePrompt"), f"A detailed 3D cinematic rendering of {title}, {desc}"),
            })
        script.append({
            "n": 12,
            "spoken": nn(spoken.get(12), cfg.get("ctaSpoken"), ""),
            "caption": nn(cfg.get("ctaText"), cfg.get("ctaSpoken"), spoken.get(12), ""),
            "start": 59.2,
            "dur": nn(dur_of("line-12"), 4.3),
            "beat": "Lời kết (Outro / CTA)",
            "image": None,
        })
        if not _truthy(spec):
            spec = {"type": "survival", "slug": slug, "survivalConfig": cfg, **(meta or {})}
        elif not spec.get("survivalConfig"):
            spec["survivalConfig"] = cfg
        return done(script)

    # --- Tier list ----------------------------------------------------------
    is_tierlist = kind == "tierlist"
    if is_tierlist:
        curated = g(await curated_topics(), "tierlist", slug)
        cfg = jor(g(spec, "tierListConfig"), g(meta, "tierListConfig"), curated, {})
        items = jor(cfg.get("items"), g(spec_raw, "items"), [])
        if not items and html:
            items = parse_const_array(html, r"const ITEMS = (\[[\s\S]*?\]);") or items
        curated_items = g(curated, "items") or []
        if curated_items:
            if not items:
                items = curated_items
            else:
                merged = []
                for idx, it in enumerate(items):
                    c = curated_items[idx] if idx < len(curated_items) else None
                    if not c:
                        c = next((x for x in curated_items if x.get("id") == it.get("id") or x.get("name") == it.get("name")), {})
                    merged.append({**c, **it})
                items = merged

        script = []
        for idx, it in enumerate(items):
            n = idx + 1
            icon_rel, showcase_rel = f"assets/images/item-{n}-icon.jpg", f"assets/images/item-{n}-showcase.jpg"
            scene_rel = f"assets/images/scene-{n}.jpg"
            chosen = icon_rel if exists(icon_rel) else showcase_rel if exists(showcase_rel) else (scene_rel if exists(scene_rel) else None)
            spoken_text = jor(it.get("spoken"), " ".join(x for x in (it.get("hook"), it.get("review"), it.get("verdict")) if _truthy(x)))
            tier = jor(it.get("tier"), "?")
            name = jor(it.get("name"), f"Ứng viên {n}")
            caption = jor(it.get("caption"), f"{jor(it.get('name'), '')} — Bậc {tier}: {jor(it.get('verdict'), it.get('review'), '')}")
            start = nn(it.get("itemStart"), it.get("start"), idx * 14.0)
            item_end = it.get("itemEnd")
            dur = nn(it.get("duration"), max(2, item_end - start) if _truthy(item_end) else 14.0)
            script.append({
                "n": n,
                "sceneId": n,
                "tierId": it.get("tier"),
                "tier": it.get("tier"),
                "spoken": spoken_text,
                "caption": caption,
                "hook": jor(it.get("hook"), ""),
                "review": jor(it.get("review"), ""),
                "verdict": jor(it.get("verdict"), ""),
                "start": start,
                "dur": dur,
                "beat": f"Bậc {tier}: {name}",
                "title": name,
                "desc": f"Bậc: {tier} — {jor(it.get('subtitle'), '')}",
                "image": media(chosen) if chosen else None,
            })
        if not _truthy(spec):
            spec = {"type": "tierlist", "slug": slug, "tierListConfig": {**cfg, "items": items}, "items": items, **(spec_raw or {}), **(meta or {})}
        else:
            spec.setdefault("tierListConfig", None)
            if not spec["tierListConfig"]:
                spec["tierListConfig"] = {**cfg, "items": items}
            if not spec.get("items"):
                spec["items"] = items
        return done(script, override_lines=True)

    # --- Chalkboard ---------------------------------------------------------
    is_chalk = kind == "chalk"
    if is_chalk:
        curated = g(await curated_topics(), "chalk", slug)
        cfg = jor(g(spec, "chalkConfig"), g(meta, "chalkConfig"), curated, {})
        scenes = jor(cfg.get("scenes"), g(spec_raw, "scenes"), [])
        if not scenes and html:
            scenes = parse_const_array(html, r"const SCENES = (\[[\s\S]*?\]);") or scenes
        if g(curated, "scenes") and not scenes:
            scenes = curated["scenes"]
        script = []
        for idx, sc in enumerate(scenes):
            n = idx + 1
            map_key = jor(sc.get("map"), "master")
            scene_img = f"assets/images/scene-{n}.jpg"
            map_img = f"assets/images/map-{map_key}.jpg"
            chosen_rel = scene_img if exists(scene_img) else (map_img if exists(map_img) else None)
            header = jor(sc.get("header"), "")
            script.append({
                "n": n,
                "sceneId": n,
                "spoken": jor(sc.get("line"), ""),
                "caption": jor(sc.get("line"), ""),
                "start": nn(g(spec_raw, "startTimes", idx), sc.get("start"), idx * 7.5),
                "dur": nn(g(spec_raw, "durations", idx), sc.get("dur"), 7.0),
                "beat": f"Cảnh {n}: {jor(sc.get('header'), f'Bản đồ {map_key}')}",
                "title": jor(sc.get("header"), f"Cảnh {n}"),
                "header": header,
                "badge": jor(sc.get("badge"), ""),
                "sfx": jor(sc.get("sfx"), ""),
                "desc": f"Bản đồ: {map_key}",
                "image": media(chosen_rel) if chosen_rel else None,
            })
        if not _truthy(spec):
            spec = {"type": "chalk", "slug": slug, "chalkConfig": {**cfg, "scenes": scenes}, "scenes": scenes, **(spec_raw or {}), **(meta or {})}
        else:
            if not spec.get("chalkConfig"):
                spec["chalkConfig"] = {**cfg, "scenes": scenes}
            if not spec.get("scenes"):
                spec["scenes"] = scenes
        return done(script, override_lines=True)

    # --- Wildlife -----------------------------------------------------------
    is_wildlife = kind == "wildlife"
    if is_wildlife:
        curated = g(await curated_topics(), "wildlife", slug)
        cfg = jor(g(spec, "wildlifeConfig"), g(meta, "wildlifeConfig"), curated, {})
        scenes = jor(cfg.get("scenes"), g(spec_raw, "scenes"), [])
        if not scenes and html:
            scenes = parse_const_array(html, r"const SCENES = (\[[\s\S]*?\]);") or scenes
        if g(curated, "scenes") and not scenes:
            scenes = curated["scenes"]
        script = []
        for idx, sc in enumerate(scenes):
            n = idx + 1
            img_rel = jor(sc.get("imgSrc"), f"assets/images/scene-{n}.jpg")
            svg_rel = re.sub(r"\.jpg$", ".svg", img_rel)
            final = img_rel if exists(img_rel) else svg_rel
            script.append({
                "n": n,
                "sceneId": n,
                "spoken": jor(sc.get("line"), ""),
                "caption": jor(sc.get("line"), ""),
                "start": nn(sc.get("start"), idx * 8.0),
                "dur": nn(sc.get("duration"), sc.get("dur"), 7.5),
                "beat": jor(sc.get("badge"), f"Cảnh {n}: Thông Số Sinh Tồn"),
                "title": jor(sc.get("badge"), f"Cảnh {n}"),
                "badge": jor(sc.get("badge"), ""),
                "telemetry": jor(sc.get("telemetry"), ""),
                "highlightWords": jor(sc.get("highlightWords"), []),
                "visualPrompt": jor(sc.get("visualPrompt"), ""),
                "desc": jor(sc.get("telemetry"), "Chỉ số sinh tồn"),
                "image": media(final) if exists(img_rel) or exists(svg_rel) else None,
            })
        if not _truthy(spec):
            spec = {
                "type": "wildlife", "slug": slug,
                "title": jor(cfg.get("topicTitle"), "Thế Giới Động Vật"),
                "latinName": jor(cfg.get("latinName"), ""),
                "habitat": jor(cfg.get("habitat"), ""),
                "stats": jor(cfg.get("stats"), {}),
                "wildlifeConfig": {**cfg, "scenes": scenes},
                "scenes": scenes,
                **(spec_raw or {}), **(meta or {}),
            }
        else:
            if not spec.get("wildlifeConfig"):
                spec["wildlifeConfig"] = {**cfg, "scenes": scenes}
            if not spec.get("scenes"):
                spec["scenes"] = scenes
        return done(script, override_lines=True)

    # --- Mystery ------------------------------------------------------------
    is_mystery = kind == "mystery"
    if is_mystery:
        cfg = jor(g(spec, "mysteryConfig"), g(meta, "mysteryConfig"), {})
        scenes = jor(cfg.get("scenes"), [])
        if not scenes:
            scenes = parse_const_array(html, TAIL_SCENES) or []
            cfg = {"lang": summary["lang"], "slug": slug, "scenes": scenes, **cfg}
        script = []
        for idx, sc in enumerate(scenes):
            n = idx + 1
            img_rel = jor(sc.get("imgSrc"), f"assets/images/scene-{n}.jpg")
            has_img = exists(img_rel) or exists(re.sub(r"\.jpg$", ".png", img_rel)) or exists(re.sub(r"\.jpg$", ".svg", img_rel))
            telemetry = jor(sc.get("telemetry"), "")
            script.append({
                "n": n,
                "sceneId": n,
                "spoken": jor(sc.get("line"), ""),
                "caption": jor(sc.get("line"), ""),
                "start": nn(sc.get("start"), 0.5 + idx * 6.5),
                "dur": nn(sc.get("duration"), 6),
                "beat": f"Cảnh {n}: {jor(sc.get('telemetry'), f'Phân cảnh {n}')}",
                "title": f"Phân cảnh {n}",
                "desc": telemetry,
                "telemetry": telemetry,
                "image": media(img_rel) if has_img else media(f"assets/images/scene-{n}.jpg"),
                "imagePrompt": jor(sc.get("imagePrompt"), f"Cinematic documentary shot of {jor(sc.get('line'), '')}, 8k photorealistic"),
            })
        if not _truthy(spec):
            spec = {"type": "mystery", "slug": slug, "mysteryConfig": {**cfg, "scenes": scenes}, **(meta or {})}
        elif not spec.get("mysteryConfig"):
            spec["mysteryConfig"] = {**cfg, "scenes": scenes}
        return done(script)

    # --- Science ------------------------------------------------------------
    is_science = kind == "science"
    if is_science:
        dialogues = jor(g(spec, "scienceConfig", "dialogues"), g(meta, "scienceConfig", "dialogues"), None)
        if not dialogues:
            if results:
                dialogues = results
            else:
                dialogues = parse_const_array(html, r"const DIALOGUES = (\[[\s\S]*?\]);\s*(?:const ROOT_DURATION|tl\.)") or []
        char_images = {
            "charA": "assets/characters/char-a.png",
            "charB": "assets/characters/char-b.png",
            "narrator": "assets/characters/stomp-boot.png",
        }
        script = []
        for idx, dl in enumerate(dialogues or []):
            n = idx + 1
            speaker = jor(dl.get("speaker"), "narrator")
            title = "Nhân vật A" if speaker == "charA" else "Nhân vật B" if speaker == "charB" else "Người dẫn chuyện / Bác Nông Dân"
            img_rel = char_images.get(speaker)
            emotion = jor(dl.get("emotion"), "")
            script.append({
                "n": n,
                "dialogueId": n,
                "speaker": speaker,
                "emotion": emotion,
                "spoken": jor(dl.get("text"), ""),
                "caption": jor(dl.get("text"), ""),
                "start": dl.get("start"),
                "dur": dl.get("dur"),
                "beat": f"{title}{f' • {emotion}' if emotion else ''}",
                "title": title,
                "desc": f"Biểu cảm: {emotion}" if emotion else "",
                "image": media(img_rel) if img_rel and exists(img_rel) else None,
            })
        if not _truthy(spec):
            spec = {"type": "science", "slug": slug, "scienceConfig": {"dialogues": dialogues}, **(meta or {})}
        elif not spec.get("scienceConfig"):
            spec["scienceConfig"] = {"dialogues": dialogues}
        return done(script)

    # --- Vox / Newspaper / Kinetic -----------------------------------------
    def sequence_branch(kind: str, cfg_key: str, list_key: str, tail: str, builder) -> Dict[str, Any]:
        nonlocal spec
        cfg = jor(g(spec, cfg_key), g(meta, cfg_key), {})
        seq = jor(cfg.get(list_key), [])
        if not seq:
            seq = parse_const_array(html, tail) or []
        script = [builder(idx, item) for idx, item in enumerate(seq)]
        if not _truthy(spec):
            spec = {"type": kind, "slug": slug, cfg_key: {**cfg, list_key: seq}, **(meta or {})}
        elif not spec.get(cfg_key):
            spec[cfg_key] = {**cfg, list_key: seq}
        return done(script)

    def image_or_svg(rel: str) -> Optional[str]:
        return media(rel) if exists(rel) or exists(re.sub(r"\.jpg$", ".svg", rel)) else None

    if kind == "vox":
        def vox(idx: int, bt: Dict[str, Any]) -> Dict[str, Any]:
            n = idx + 1
            return {
                "n": n,
                "spoken": jor(bt.get("line"), ""),
                "caption": jor(bt.get("line"), ""),
                "start": nn(bt.get("start"), 0.5 + idx * 8.0),
                "dur": nn(bt.get("duration"), 8.0),
                "beat": f"Hồi {n}: {jor(bt.get('name'), bt.get('label'), f'Sticker {n}')}",
                "title": jor(bt.get("label"), bt.get("name"), f"Sticker {n}"),
                "desc": jor(bt.get("marker"), bt.get("note"), ""),
                "image": image_or_svg(f"assets/images/sticker-{n}.jpg"),
            }
        return sequence_branch("vox", "voxConfig", "beats", TAIL_BEATS, vox)

    if kind == "newspaper":
        def newspaper(idx: int, act: Dict[str, Any]) -> Dict[str, Any]:
            n = idx + 1
            return {
                "n": n,
                "spoken": jor(act.get("line"), ""),
                "caption": jor(act.get("line"), ""),
                "start": nn(act.get("start"), 0.5 + idx * 8.0),
                "dur": nn(act.get("duration"), 8.0),
                "beat": f"Hồi {n}: {jor(act.get('headline'), f'Tư liệu {n}')}",
                "title": jor(act.get("headline"), f"Tư liệu {n}"),
                "desc": f"Con dấu: {act['stamp']}" if _truthy(act.get("stamp")) else "",
                "image": image_or_svg(f"assets/images/act-{n}.jpg"),
            }
        return sequence_branch("newspaper", "newspaperConfig", "acts", TAIL_ACTS, newspaper)

    if kind == "kinetic":
        def kinetic(idx: int, bt: Dict[str, Any]) -> Dict[str, Any]:
            n = idx + 1
            metric = bt.get("metricValue")
            return {
                "n": n,
                "spoken": jor(bt.get("line"), ""),
                "caption": jor(bt.get("line"), ""),
                "start": nn(bt.get("start"), 0.5 + idx * 7.5),
                "dur": nn(bt.get("duration"), 7.5),
                "beat": f"Nhịp {n}: {jor(bt.get('punchline'), f'Giao thức {n}')}",
                "title": jor(bt.get("punchline"), f"Giao thức {n}"),
                "desc": f"Chỉ số: {metric} ({jor(bt.get('metricLabel'), '')})" if _truthy(metric) else "",
                "image": None,
            }
        return sequence_branch("kinetic", "kineticConfig", "beats", TAIL_BEATS, kinetic)

    # --- So sánh (mặc định) -------------------------------------------------
    captions: Dict[int, str] = {}
    for m in re.finditer(r'id="line-(\d+)"><span[^>]*>(.*?)</span></div>', html or "", re.S):
        captions[int(m.group(1))] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(2))).strip()
    timing: Dict[int, Dict[str, float]] = {}
    for m in re.finditer(r"(\d+): \{ start: ([\d.]+), dur: ([\d.]+) \}", html or ""):
        timing[int(m.group(1))] = {"start": _num(m.group(2)), "dur": _num(m.group(3))}

    spec_captions = g(spec, "captions") if isinstance(g(spec, "captions"), list) else []
    count = max(len(spoken), len(captions), len(spec_captions))

    def icon(side: str) -> Optional[str]:
        for ext in ("png", "jpg"):
            if exists(f"assets/icons/{side}.{ext}"):
                return f"assets/icons/{side}.{ext}"
        return None

    left_rel, right_rel = icon("left"), icon("right")
    script = []
    for i in range(count):
        n = i + 1
        beat = BEATS_20[i] if count == 20 else BEATS_12[i] if count == 12 else f"line {n}"
        side_a, side_b = "side a" in beat.lower(), "side b" in beat.lower()
        image = media(left_rel) if side_a and left_rel else media(right_rel) if side_b and right_rel else None
        script.append({
            "n": n,
            "spoken": nn(spoken.get(n), g(spec, "spoken", i), ""),
            "caption": nn(captions.get(n), g(spec, "captions", i), spoken.get(n), ""),
            "start": g(timing, n, "start"),
            "dur": nn(g(timing, n, "dur"), dur_of(f"line-{n}"), None),
            "beat": beat,
            "image": image,
            "side": "left" if side_a else "right" if side_b else None,
        })
    return done(script)


# ---------------------------------------------------------------------------
# Tác vụ chạy nền (create / vo / check / render / fit / batch_global) + SSE
# ---------------------------------------------------------------------------
RENDER_IF_MISSING = object()  # render sau "create" nếu script tạo chưa render (xem start_run)
RENDER_IF_READY = object()    # render sau "images"/"fit" — chỉ khi đủ ảnh Antigravity
TASKS = {"check": "check", "render": "render", "vo": None, "fit": None, "create": None, "batch_global": None, "images": None}
MAX_RUN_LINES = 2000
RUNS: Dict[str, Dict[str, Any]] = {}
RUNS_LOCK = threading.Lock()

# create cho các template không phải so sánh: gọi hàm create*Video của module.
_CREATE_MODULES = {
    "mystery": ("create-mystery-video.mjs", "createMysteryVideo", "spec"),
    "vox": ("create-vox-video.mjs", "createVoxVideo", "spec"),
    "newspaper": ("create-newspaper-video.mjs", "createNewspaperVideo", "spec"),
    "kinetic": ("create-kinetic-video.mjs", "createKineticVideo", "spec"),
    "science": ("create-science-video.mjs", "createScienceVideo", "spec"),
    "wildlife": ("create-wildlife-video.mjs", "createWildlifeVideo", "spec"),
    "folklore": ("create-folklore-video.mjs", "createFolkloreVideo", "spec"),
    "chalk": ("create-chalk-video.mjs", "createChalkVideo", "prompt"),
    "tierlist": ("create-tierlist-video.mjs", "createTierListVideo", "prompt"),
}


def _create_command(slug: str, spec: Dict[str, Any], spec_path: Path, opts: Dict[str, Any]) -> List[str]:
    kind = spec.get("type")
    render = "true" if opts.get("render") else "false"
    if kind == "survival":
        cmd = ["node", "tools/create-survival-video.mjs", "--spec", str(spec_path),
               "--lang", spec.get("lang") or "vi", "--slug", slug]
        if spec.get("voice"):
            cmd += ["--voice", str(spec["voice"])]
        if opts.get("render"):
            cmd.append("--render")
        return cmd
    if kind in _CREATE_MODULES:
        module, fn, style = _CREATE_MODULES[kind]
        # Đường dẫn và slug truyền qua JSON để không phải nối chuỗi vào mã JS.
        args = json.dumps({"specPath": str(spec_path), "slug": slug, "render": bool(opts.get("render"))})
        if style == "spec":
            call = f"{fn}({{ spec, slug: a.slug, lang: spec.lang || 'vi', render: a.render }})"
        elif fn == "createChalkVideo":
            # createChalkVideo đọc opts.slug (presetSlug bị bỏ qua) — truyền cả hai để giữ đúng slug.
            call = f"{fn}({{ slug: a.slug, presetSlug: a.slug, prompt: spec.prompt || spec.topicTitle || spec.title, voice: spec.voice, render: a.render }})"
        else:
            call = f"{fn}({{ slug: a.slug, prompt: spec.prompt || spec.topicTitle || spec.title, voice: spec.voice, render: a.render }})"
        code = (
            f"import {{ {fn} }} from './tools/{module}'; import fs from 'fs';"
            f" const a = {args}; const spec = JSON.parse(fs.readFileSync(a.specPath, 'utf8'));"
            f" await {call};"
        )
        return ["node", "--input-type=module", "-e", code]
    cmd = ["node", "tools/create-video.mjs", "--spec", str(spec_path)]
    if opts.get("target"):
        cmd += ["--target", str(opts["target"])]
    if opts.get("render"):
        cmd.append("--render")
    return cmd


def _publish_flow():
    try:
        from bkt_web import publish_flow
    except ImportError:
        import publish_flow
    return publish_flow


def start_run(slug: str, task: str, opts: Dict[str, Any], run_id: Optional[str] = None) -> Dict[str, Any]:
    run_id = run_id or str(uuid.uuid4())
    run: Dict[str, Any] = {
        "id": run_id, "slug": slug, "task": task, "lines": [], "done": False,
        "code": None, "startedAt": time.time() * 1000, "proc": None,
    }
    video_cwd = VIDEOS_DIR / slug
    temp_spec: Optional[Path] = None

    if task == "vo":
        cmd, cwd = ["node", "scripts/generate-vo.mjs"], video_cwd
    elif task == "batch_global":
        cmd = ["node", "tools/batch-global.mjs", str(opts["topic"])]
        if opts.get("target"):
            cmd += ["--target", str(opts["target"])]
        if opts.get("render"):
            cmd.append("--render")
        cwd = COMPARE_DIR
    elif task == "fit":
        cmd = ["node", "tools/fit-duration.mjs", slug, str(opts["target"])]
        cwd = COMPARE_DIR
    elif task == "images":
        # Lấy tiếp ảnh Antigravity (mọi thể loại); folklore chép thêm nguồn ảnh vào meta.json.
        tool = "tools/folklore-images.mjs" if detect_video_type_for_slug(slug) == "folklore" else "tools/antigravity-images.mjs"
        cmd, cwd = ["node", tool, slug, "--timeout", "20"], COMPARE_DIR
    elif task == "create":
        temp_spec = TOOLS_DIR / f".tmp-spec-{run_id}.json"
        write_json(temp_spec, opts.get("spec") or {})
        cmd, cwd = _create_command(slug, opts.get("spec") or {}, temp_spec, opts), COMPARE_DIR
    else:
        if task == "render":
            num_workers = str(max(1, min(4, os.cpu_count() or 4)))
            cmd, cwd = ["npm", "run", "render", "--", "--workers", num_workers, "--no-low-memory-mode"], video_cwd
        else:
            cmd, cwd = ["npm", "run", TASKS[task]], video_cwd

    # fit + render là hai bước nối tiếp; trước đây chạy qua `sh -c` ghép chuỗi.
    steps = [(cmd, cwd)]
    if task in ("fit", "images") and opts.get("render"):
        steps.append((RENDER_IF_READY, video_cwd))
    # Tạo video + tích "Render": vox, newspaper, kinetic, wildlife và mystery bỏ qua cờ
    # render trong script tạo, nên video không bao giờ được xuất MP4. Sau khi tạo xong,
    # nếu chưa có MP4 mới hơn lúc bắt đầu tác vụ thì tự render — thể loại nào tự render
    # rồi (compare, survival, chalk, tierlist, folklore, science) thì bỏ qua.
    if task == "create" and opts.get("render"):
        steps.append((RENDER_IF_MISSING, video_cwd))

    def push(line: str, stream: str) -> None:
        line = ANSI_RE.sub("", line.rstrip("\r\n"))
        if not line.strip():
            return
        with RUNS_LOCK:
            run["lines"].append({"t": int(time.time() * 1000), "stream": stream, "line": line})
            if len(run["lines"]) > MAX_RUN_LINES:
                del run["lines"][0]
                run["dropped"] = run.get("dropped", 0) + 1

    def pump(pipe, stream: str) -> None:
        for raw in iter(pipe.readline, ""):
            for part in raw.split("\r"):
                push(part, stream)
        pipe.close()

    def worker() -> None:
        code = 0
        try:
            for step_cmd, step_cwd in steps:
                if step_cmd is RENDER_IF_MISSING or step_cmd is RENDER_IF_READY:
                    vdir = Path(step_cwd)
                    if not (vdir / "package.json").is_file():
                        push(f"⚠ Không thấy videos/{vdir.name}/package.json — bỏ qua bước render", "err")
                        continue
                    waiting = pending_images(vdir.name) if (vdir / IMAGE_STATE_FILE).is_file() else []
                    if waiting:
                        run["renderBlocked"] = waiting
                        push(f"⏳ Chưa render: còn {len(waiting)} ảnh chờ Antigravity ({', '.join(waiting[:6])}"
                             f"{'…' if len(waiting) > 6 else ''}). Bấm \"🎨 Ảnh Antigravity\" khi ảnh xong.", "out")
                        continue
                    if step_cmd is RENDER_IF_MISSING:
                        latest = latest_render(vdir / "renders")
                        if latest and latest["mtime"] >= run["startedAt"]:
                            push(f"✓ Script tạo đã render {latest['name']} — không render lại", "out")
                            continue
                        push("▶ Script tạo không render — tự chạy npm run render", "out")
                    num_workers = str(max(1, min(4, os.cpu_count() or 4)))
                    step_cmd = ["npm", "run", "render", "--", "--workers", num_workers, "--no-low-memory-mode"]
                proc = subprocess.Popen(
                    step_cmd, cwd=str(step_cwd), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    text=True, encoding="utf-8", errors="replace", bufsize=1,
                    env={**os.environ, "FORCE_COLOR": "0", "PRODUCER_LOW_MEMORY_MODE": "false"}, start_new_session=True,
                )
                run["proc"] = proc
                readers = [
                    threading.Thread(target=pump, args=(proc.stdout, "out"), daemon=True),
                    threading.Thread(target=pump, args=(proc.stderr, "err"), daemon=True),
                ]
                for r in readers:
                    r.start()
                code = proc.wait()
                for r in readers:
                    r.join(timeout=5)
                if code != 0 or run.get("stopped"):
                    break
        except OSError as exc:
            push(f"Không khởi chạy được tác vụ: {exc}", "err")
            code = 127
        finally:
            if temp_spec and temp_spec.exists():
                try:
                    temp_spec.unlink()
                except OSError:
                    pass
            # Bước sau render: task đăng đang chờ video này → QUEUED (có MP4 mới) hoặc ERROR.
            rendered_task = task == "render" or (task in ("create", "images", "fit") and opts.get("render"))
            if rendered_task:  # bị dừng → mã thoát ≠ 0 → task đăng của lần chạy này chuyển ERROR
                try:
                    _publish_flow().activate_waiting(
                        slug, run_id=run_id, render_ok=code == 0, started_at_ms=run["startedAt"],
                        blocked_by_images=bool(run.get("renderBlocked")), log=lambda m: push(m, "out"),
                    )
                except Exception as exc:  # không để lỗi hàng đợi đăng làm hỏng kết quả render
                    push(f"⚠ Không cập nhật được hàng đợi đăng: {exc}", "err")
            run["code"] = code
            run["done"] = True
            run["proc"] = None

    with RUNS_LOCK:
        RUNS[run_id] = run
    threading.Thread(target=worker, name=f"compare-run-{task}", daemon=True).start()
    return run


# ---------------------------------------------------------------------------
# Routes: chủ đề & sinh kịch bản
# ---------------------------------------------------------------------------
async def _json_body(request: Request) -> Dict[str, Any]:
    raw = await request.body()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


async def _bridge_response(op: str, args: Dict[str, Any], *, code_on_error: int = 400, timeout: float = 300) -> Response:
    try:
        return JSONResponse(await bridge(op, args, timeout=timeout))
    except BridgeError as exc:
        return error(code_on_error, str(exc))


@compare_native_router.get("/api/topics")
async def api_topics(category: Optional[str] = None, query: Optional[str] = None, lang: str = "en"):
    return await _bridge_response("topics.list", {"category": category, "query": query, "lang": lang}, code_on_error=500, timeout=30)


@compare_native_router.post("/api/topics/generate")
async def api_topics_generate(request: Request):
    return await _bridge_response("topics.generate", await _json_body(request))


@compare_native_router.get("/api/science/topics")
async def api_science_topics():
    return await _bridge_response("science.topics", {}, code_on_error=500, timeout=30)


@compare_native_router.post("/api/science/generate")
async def api_science_generate(request: Request):
    body = await _json_body(request)
    return await _bridge_response("science.generate", {"id": body.get("id"), "prompt": body.get("prompt"), "lang": body.get("lang") or "vi"})


GENERATOR_STYLES = {"survival", "mystery", "vox", "newspaper", "kinetic", "chalk", "tierlist", "wildlife", "folklore"}
SUGGEST_STYLES = GENERATOR_STYLES - {"survival"}


@compare_native_router.post("/api/{style}/generate")
async def api_style_generate(style: str, request: Request):
    if style not in GENERATOR_STYLES:
        return error(404, "not found")
    return await _bridge_response("style.generate", {**(await _json_body(request)), "style": style})


@compare_native_router.post("/api/{style}/suggest-topics")
async def api_style_suggest(style: str, request: Request):
    if style not in SUGGEST_STYLES:
        return error(404, "not found")
    body = await _json_body(request)
    return await _bridge_response("style.suggest", {"style": style, "lang": body.get("lang") or "vi", "count": body.get("count")})


@compare_native_router.get("/api/images/search")
async def api_images_search(q: str = "", mode: str = "all"):
    if not q:
        return error(400, "Thiếu query param 'q'")
    return await _bridge_response("images.search", {"q": q, "mode": mode}, code_on_error=500, timeout=60)


# ---------------------------------------------------------------------------
# Routes: giọng đọc, theme, template
# ---------------------------------------------------------------------------
@compare_native_router.get("/api/voices")
async def api_voices():
    return await _bridge_response("voices", {}, code_on_error=500, timeout=30)


TTS_SAMPLES = {
    "vi": "Xin chào! Đây là bản nghe thử giọng đọc cho video của bạn.",
    "en": "Hello! This is a voice preview for your upcoming video.",
    "de": "Hallo! Dies ist eine Hörprobe für deine Videonarration.",
    "fr": "Bonjour! Ceci est un aperçu vocal pour la narration de votre vidéo.",
    "ja": "こんにちは！これは動画ナレーションの音声プレビューです。",
    "ko": "안녕하세요! 동영상 내레이션을 위한 음성 미리듣기입니다.",
}


@compare_native_router.get("/api/tts/preview")
async def api_tts_preview(voice: str = "BV421_vivn_streaming", lang: str = "vi", text: Optional[str] = None):
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", voice) or not re.fullmatch(r"[a-z]{2,5}", lang):
        return error(400, "voice hoặc lang không hợp lệ")
    text = text or TTS_SAMPLES.get(lang) or TTS_SAMPLES["vi"]
    text_key = base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")[:16]
    cache_dir = TOOLS_DIR / ".cache" / "voice-previews"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{voice.replace(':', '_')}_{lang}_{text_key}.mp3"
    if not cache_file.exists():
        try:
            await bridge("tts.synthesize", {"text": text, "voice": voice, "lang": lang, "outPath": str(cache_file)}, timeout=90)
        except BridgeError as exc:
            return error(500, str(exc))
    if not cache_file.exists():
        return error(500, "Không thể tạo file nghe thử audio")
    return FileResponse(str(cache_file), media_type="audio/mpeg")


@compare_native_router.get("/api/themes")
async def api_themes():
    return await _bridge_response("themes", {}, code_on_error=500, timeout=30)


@compare_native_router.get("/api/template")
@compare_native_router.get("/api/template/preview")
async def api_template_preview(type: str = "compare", lang: str = "vi"):
    try:
        data = await bridge("template.preview", {"type": type, "lang": lang}, timeout=30)
    except BridgeError as exc:
        return error(500, str(exc))
    return Response(
        content=data.get("html") or "",
        media_type="text/html; charset=utf-8",
        headers={"cache-control": "no-store", "x-root-duration": str(data.get("root"))},
    )


@compare_native_router.get("/api/template/timing")
async def api_template_timing(type: str = "compare", lang: str = "vi"):
    return await _bridge_response("template.timing", {"type": type, "lang": lang}, code_on_error=500, timeout=30)


# ---------------------------------------------------------------------------
# Routes: âm thanh
# ---------------------------------------------------------------------------
@compare_native_router.get("/api/audio/sfx")
async def api_audio_sfx_catalog():
    return await _bridge_response("audio.sfx", {}, code_on_error=500, timeout=30)


@compare_native_router.get("/api/audio/presets")
async def api_audio_presets():
    return await _bridge_response("audio.presets", {}, code_on_error=500, timeout=30)


@compare_native_router.post("/api/audio/detect-sfx")
async def api_audio_detect_sfx(request: Request):
    body = await _json_body(request)
    items = body.get("items")
    if not isinstance(items, list):
        items = []
        for idx, line in enumerate(body.get("lines") or []):
            if isinstance(line, str):
                items.append({"start": idx * 4, "dur": 3.5, "text": line})
            else:
                items.append({
                    "start": nn(line.get("start"), idx * 4),
                    "dur": nn(line.get("dur"), line.get("duration"), 3.5),
                    "text": jor(line.get("text"), line.get("caption"), ""),
                })
    total = body.get("totalDuration") or ((items[-1]["start"] + items[-1]["dur"] + 2) if items else 60)
    return await _bridge_response("audio.detect-sfx", {
        "archetype": body.get("archetype") or body.get("style") or "compare",
        "items": items,
        "totalDuration": total,
        "ambientVol": nn(body.get("ambientVol"), 0.12),
        "boostVol": nn(body.get("boostVol"), 0.28),
    }, timeout=30)


def _audio_file(kind: str, name: str) -> Response:
    name = re.sub(r"\.mp3$", "", name)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        return error(404, f"Không tìm thấy file {kind.upper()}")
    path = SHARED_AUDIO_DIR / kind / f"{name}.mp3"
    if not path.is_file():
        return error(404, f"Không tìm thấy file {kind.upper()}")
    return FileResponse(str(path), media_type="audio/mpeg")


@compare_native_router.get("/api/audio/bgm/{track}")
async def api_audio_bgm(track: str):
    return _audio_file("bgm", track)


@compare_native_router.get("/api/audio/sfx/{effect}")
async def api_audio_sfx_file(effect: str):
    return _audio_file("sfx", effect)


# ---------------------------------------------------------------------------
# Routes: video
# ---------------------------------------------------------------------------
@compare_native_router.get("/api/videos")
async def api_videos():
    summaries = [await video_summary(slug) for slug in list_slugs() if safe_slug(slug)]
    summaries.sort(key=lambda v: iso_ts(v.get("createdAt")), reverse=True)
    return summaries


def _existing_video(slug: str) -> Optional[Path]:
    if not safe_slug(slug):
        return None
    d = VIDEOS_DIR / slug
    return d if d.is_dir() else None


@compare_native_router.get("/api/videos/{slug}")
async def api_video_detail(slug: str):
    if not _existing_video(slug):
        return error(404, "không có video này")
    return await video_detail(slug)


@compare_native_router.get("/api/videos/{slug}/render")
async def api_video_render(slug: str):
    d = _existing_video(slug)
    latest = latest_render(d / "renders") if d else None
    if not latest:
        return error(404, "chưa render")
    return FileResponse(str(d / "renders" / latest["name"]), media_type="video/mp4")


@compare_native_router.get("/api/videos/{slug}/download")
async def api_video_download(slug: str):
    d = _existing_video(slug)
    latest = latest_render(d / "renders") if d else None
    if not latest:
        return error(404, "chưa có bản render mp4 để tải")
    return FileResponse(str(d / "renders" / latest["name"]), media_type="video/mp4", filename=f"{slug}.mp4")


@compare_native_router.get("/api/videos/{slug}/snapshot")
async def api_video_snapshot(slug: str):
    d = _existing_video(slug)
    snap = d / "snapshots" / "contact-sheet.jpg" if d else None
    if not snap or not snap.is_file():
        return Response("not found", status_code=404)
    return FileResponse(str(snap), media_type="image/jpeg")


@compare_native_router.get("/api/videos/{slug}/publishing-kit")
async def api_video_publishing_kit(slug: str):
    if not safe_slug(slug):
        return error(400, "slug không hợp lệ")
    if not _existing_video(slug):
        return error(404, "không có video này")
    try:
        from bkt_web.publish_kit import build_publish_kit
    except ImportError:
        from publish_kit import build_publish_kit
    return await build_publish_kit(slug)


def extract_video_frame(d: Path, time_sec: float = 5.0) -> Path:
    latest = latest_render(d / "renders")
    if not latest:
        raise RuntimeError(f"Video \"{d.name}\" chưa có bản render MP4 nào để trích xuất frame.")
    out = d / "cover-frame.jpg"
    second = max(1, min(9, int(time_sec)))
    subprocess.run(
        ["ffmpeg", "-y", "-ss", f"00:00:0{second}.000", "-i", str(d / "renders" / latest["name"]),
         "-vframes", "1", "-q:v", "2", str(out)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=False,
    )
    if not out.exists():
        raise RuntimeError("Không thể xuất ảnh từ video với ffmpeg.")
    return out


@compare_native_router.get("/api/videos/{slug}/thumbnail")
async def api_video_thumbnail(slug: str, type: str = "frame"):
    d = _existing_video(slug)
    if not d:
        return error(404, "không có video này")
    if type != "svg":
        frame = d / "cover-frame.jpg"
        if not frame.exists():
            try:
                frame = await asyncio.to_thread(extract_video_frame, d, 5.0)
            except (RuntimeError, OSError, subprocess.SubprocessError):
                snap = d / "snapshots" / "contact-sheet.jpg"
                if snap.exists():
                    frame = snap
        if frame.exists():
            return FileResponse(str(frame), media_type="image/jpeg", headers={"cache-control": "no-cache"})
        return error(404, "Chưa có ảnh bìa video — hãy render video trước.")
    try:
        data = await bridge("thumbnail.svg", {"slug": slug}, timeout=30)
    except BridgeError as exc:
        return error(400, str(exc))
    return Response(content=data.get("svg") or "", media_type="image/svg+xml; charset=utf-8", headers={"cache-control": "no-cache"})


def _replace_first(pattern: str, replacement: str, text: str) -> str:
    return re.sub(pattern, lambda _m: replacement, text, count=1)


def _write_vo_lines(vo_path: Path, lines_str: str) -> None:
    if vo_path.exists():
        src = vo_path.read_text(encoding="utf-8")
        vo_path.write_text(_replace_first(r"const LINES = \[[\s\S]*?\n\];", lines_str, src), encoding="utf-8")


def _scenes_from_html(d: Path, pattern: str) -> Optional[list]:
    return parse_const_array(read_text(d / "index.html"), pattern)


@compare_native_router.post("/api/videos/{slug}/edit-script")
async def api_video_edit_script(slug: str, request: Request):
    d = _existing_video(slug)
    if not d:
        return error(404, "không có video này")
    body = await _json_body(request)
    captions = body.get("captions")
    tiers_data = body.get("tiersData") or []
    scenes_data = body.get("scenesData") or []
    dialogues_data = body.get("dialoguesData") or []
    if not isinstance(captions, list) or not captions:
        return error(400, "Danh sách câu kịch bản không hợp lệ (không được để trống)")

    def at(seq: Any, i: int) -> Dict[str, Any]:
        return seq[i] if isinstance(seq, list) and i < len(seq) and isinstance(seq[i], dict) else {}

    spec_path, meta_path = d / "spec.json", d / "meta.json"
    vo_path, html_path = d / "scripts" / "generate-vo.mjs", d / "index.html"
    meta = read_json(meta_path) if meta_path.exists() else None
    spec = read_json(spec_path) if spec_path.exists() else (dict(meta) if meta else {})
    spec = spec if isinstance(spec, dict) else {}
    # Cùng một hàm nhận diện với trang chi tiết. Trước đây chỗ này tự đoán riêng và
    # rơi xuống nhánh "so sánh" cho mọi thể loại nó không nhận ra (vd survival không
    # khai báo type) — nhánh đó dựng lại composition bằng template so sánh, ghi đè
    # index.html của video gốc.
    kind = detect_video_type(slug, meta, read_json(spec_path), read_text(html_path), read_text(d / "BRIEF.md"))
    if kind in ("vox", "newspaper", "kinetic"):
        return error(400, f"Chưa hỗ trợ sửa kịch bản trực tiếp cho thể loại {kind}; hãy tạo lại video với kịch bản mới")
    is_survival, is_mystery, is_science = kind == "survival", kind == "mystery", kind == "science"
    is_tierlist, is_chalk, is_wildlife = kind == "tierlist", kind == "chalk", kind == "wildlife"

    if kind == "folklore":
        cfg = g(meta, "folkloreConfig") or spec.get("folkloreConfig") or {}
        scenes = cfg.get("scenes") if isinstance(cfg.get("scenes"), list) else []
        if len(captions) != len(scenes):
            return error(400, f"Kịch bản có {len(scenes)} câu; gửi đúng {len(scenes)} câu (thêm/bớt câu thì tạo video mới)")
        for sc, caption in zip(scenes, captions):
            sc["line"] = re.sub(r"\s+", " ", str(caption)).strip()
        if meta is not None:
            meta["folkloreConfig"] = cfg
            write_json(meta_path, meta)
        try:
            ret = await bridge("folklore.rebuild", {"slug": slug}, timeout=60)
        except BridgeError as exc:
            return error(500, str(exc))
        return {
            "ok": True, "slug": slug, "root": _js_numbers(g(ret, "root")),
            "note": "Đã cập nhật phụ đề. Chạy tác vụ giọng đọc để đọc lại theo kịch bản mới.",
        }

    def save_meta(key: str, cfg: Dict[str, Any], kind: Optional[str] = None) -> None:
        if meta:
            if kind:
                meta["type"] = kind
            meta[key] = cfg
            write_json(meta_path, meta)

    if is_survival:
        if not spec.get("survivalConfig"):
            spec["survivalConfig"] = g(meta, "survivalConfig") or {}
        cfg = spec["survivalConfig"]
        tiers = cfg.get("tiers") if isinstance(cfg.get("tiers"), list) else []
        if captions[0]:
            cfg["prologueSpoken"] = cfg["prologueText"] = captions[0]
        for i, tier in enumerate(tiers):
            if i + 1 < len(captions) and captions[i + 1]:
                tier["caption"] = captions[i + 1]
            td = at(tiers_data, i)
            for field in ("title", "desc", "survival"):
                if td.get(field):
                    tier[field] = td[field]
        if len(captions) > 11 and captions[11]:
            cfg["ctaSpoken"] = cfg["ctaText"] = captions[11]
        write_json(spec_path, spec)
        lines = (
            [{"id": "line-1", "text": cfg.get("prologueSpoken")}]
            + [{"id": f"line-{i + 2}", "text": t.get("caption")} for i, t in enumerate(tiers)]
            + [{"id": "line-12", "text": cfg.get("ctaSpoken")}]
        )
        _write_vo_lines(vo_path, "const LINES = " + json.dumps(lines, ensure_ascii=False, indent=2) + ";")
        if html_path.exists():
            src = html_path.read_text(encoding="utf-8")
            for i, tier in enumerate(tiers):
                caption = str(tier.get("caption") or "").replace('"', '\\"')
                src = re.sub(
                    rf'("id":\s*{i + 1}[\s\S]*?"caption":\s*")[^"]*(")',
                    lambda m, c=caption: m.group(1) + c + m.group(2), src, count=1,
                )
            src = _replace_first(
                r'<div id="caption-text" class="caption-text">[\s\S]*?</div>',
                f'<div id="caption-text" class="caption-text">{cfg.get("prologueText") or cfg.get("prologueSpoken") or ""}</div>',
                src,
            )
            html_path.write_text(src, encoding="utf-8")
        return {"ok": True, "slug": slug, "root": 65}

    if is_mystery:
        if not spec.get("mysteryConfig"):
            spec["mysteryConfig"] = g(meta, "mysteryConfig") or {}
        cfg = spec["mysteryConfig"]
        if not cfg.get("scenes"):
            parsed = _scenes_from_html(d, TAIL_SCENES)
            if parsed:
                cfg["scenes"] = parsed
        if not isinstance(cfg.get("scenes"), list):
            cfg["scenes"] = []
        scenes = cfg["scenes"]
        for i, caption in enumerate(captions):
            if i >= len(scenes) or not scenes[i]:
                entry = {"id": f"scene-{i + 1}", "index": i + 1, "telemetry": "", "line": caption}
                if i < len(scenes):
                    scenes[i] = entry
                else:
                    scenes.extend([None] * (i - len(scenes)))
                    scenes.append(entry)
            else:
                scenes[i]["line"] = caption
            if at(scenes_data, i).get("telemetry"):
                scenes[i]["telemetry"] = scenes_data[i]["telemetry"]
        spec["type"] = "mystery"
        write_json(spec_path, spec)
        save_meta("mysteryConfig", cfg, "mystery")
        if html_path.exists():
            src = html_path.read_text(encoding="utf-8")
            scenes_str = "const SCENES = " + json.dumps(scenes, ensure_ascii=False, indent=2) + ";"
            src = _replace_first(r"const SCENES = \[[\s\S]*?\];\s*(?:const TOTAL_DURATION|window\.__timelines)", scenes_str + "\n    ", src)
            html_path.write_text(src, encoding="utf-8")
        if vo_path.exists() and "const LINES =" in vo_path.read_text(encoding="utf-8"):
            lines = [{"id": f"line-{i + 1}", "scene": i + 1, "text": sc.get("line")} for i, sc in enumerate(scenes)]
            _write_vo_lines(vo_path, "const LINES = " + json.dumps(lines, ensure_ascii=False, indent=2) + ";")
        return {"ok": True, "slug": slug, "root": _num(g(meta, "duration") or cfg.get("totalDuration") or 29)}

    if is_science:
        if not spec.get("scienceConfig"):
            spec["scienceConfig"] = g(meta, "scienceConfig") or {}
        cfg = spec["scienceConfig"]
        dur_path = d / "scripts" / "durations.json"
        if not cfg.get("dialogues"):
            results = g(read_json(dur_path), "results")
            if results:
                cfg["dialogues"] = results
        if not cfg.get("dialogues"):
            parsed = _scenes_from_html(d, r"const DIALOGUES = (\[[\s\S]*?\]);\s*(?:const ROOT_DURATION|tl\.)")
            if parsed:
                cfg["dialogues"] = parsed
        dialogues = cfg.get("dialogues") if isinstance(cfg.get("dialogues"), list) else []
        cfg["dialogues"] = dialogues
        for i, caption in enumerate(captions):
            dd = at(dialogues_data, i)
            if i >= len(dialogues) or not dialogues[i]:
                entry = {"speaker": dd.get("speaker") or "narrator", "text": caption, "emotion": dd.get("emotion") or "explain"}
                if i < len(dialogues):
                    dialogues[i] = entry
                else:
                    dialogues.extend([None] * (i - len(dialogues)))
                    dialogues.append(entry)
            else:
                dialogues[i]["text"] = caption
                if dd.get("speaker"):
                    dialogues[i]["speaker"] = dd["speaker"]
                if dd.get("emotion"):
                    dialogues[i]["emotion"] = dd["emotion"]
        spec["type"] = "science"
        write_json(spec_path, spec)
        save_meta("scienceConfig", cfg, "science")
        if html_path.exists():
            src = html_path.read_text(encoding="utf-8")
            dlg_str = "const DIALOGUES = " + json.dumps(dialogues, ensure_ascii=False, indent=2) + ";"
            src = _replace_first(r"const DIALOGUES = \[[\s\S]*?\];\s*(?:const ROOT_DURATION|tl\.)", dlg_str + "\n      ", src)
            html_path.write_text(src, encoding="utf-8")
        if vo_path.exists():
            simple = [{"speaker": dl.get("speaker"), "text": dl.get("text"), "emotion": dl.get("emotion") or "", "dur": dl.get("dur") or 2.0} for dl in dialogues]
            src = vo_path.read_text(encoding="utf-8")
            src = _replace_first(r"const DIALOGUES = \[[\s\S]*?\n\];", "const DIALOGUES = " + json.dumps(simple, ensure_ascii=False, indent=2) + ";", src)
            vo_path.write_text(src, encoding="utf-8")
        dur_json = read_json(dur_path)
        if isinstance(g(dur_json, "results"), list):
            for i, dl in enumerate(dialogues):
                if i < len(dur_json["results"]) and dur_json["results"][i]:
                    dur_json["results"][i]["text"] = dl.get("text")
                    if dl.get("speaker"):
                        dur_json["results"][i]["speaker"] = dl["speaker"]
                    if dl.get("emotion"):
                        dur_json["results"][i]["emotion"] = dl["emotion"]
            write_json(dur_path, dur_json)
        return {"ok": True, "slug": slug, "root": _num(g(meta, "duration") or 44)}

    async def list_branch(kind: str, key: str, list_key: str, curated_kind: Optional[str], default_root: int, *, telemetry: bool = False, tierlist: bool = False):
        if not spec.get(key):
            curated = g(await curated_topics(), curated_kind, slug) if curated_kind else None
            spec[key] = g(meta, key) or curated or {}
        cfg = spec[key]
        if not cfg.get(list_key):
            pattern = r"const ITEMS = (\[[\s\S]*?\]);" if tierlist else r"const SCENES = (\[[\s\S]*?\]);"
            parsed = _scenes_from_html(d, pattern)
            if parsed:
                cfg[list_key] = parsed
        seq = cfg.get(list_key) if isinstance(cfg.get(list_key), list) else []
        cfg[list_key] = seq
        for i, caption in enumerate(captions):
            if i < len(seq) and seq[i]:
                if tierlist:
                    seq[i]["caption"] = seq[i]["spoken"] = caption
                else:
                    seq[i]["line"] = caption
                if telemetry and at(scenes_data, i).get("telemetry"):
                    seq[i]["telemetry"] = scenes_data[i]["telemetry"]
        spec["type"] = kind
        spec["items" if tierlist else "scenes"] = seq
        write_json(spec_path, spec)
        save_meta(key, cfg)
        return {"ok": True, "slug": slug, "root": _num(g(meta, "totalDuration") or g(meta, "duration") or default_root)}

    if is_tierlist:
        return await list_branch("tierlist", "tierListConfig", "items", "tierlist", 65, tierlist=True)
    if is_chalk:
        return await list_branch("chalk", "chalkConfig", "scenes", "chalk", 60)
    if is_wildlife:
        return await list_branch("wildlife", "wildlifeConfig", "scenes", "wildlife", 52, telemetry=True)

    # Video so sánh: ghi spec, cập nhật LINES rồi dựng lại composition + retime.
    if kind != "compare":  # phòng thủ: không bao giờ dựng template so sánh đè lên thể loại khác
        return error(400, f"Không sửa được kịch bản cho thể loại {kind}")
    spec["captions"] = captions
    spec["spoken"] = [re.sub(r"\*(.*?)\*", r"\1", re.sub(r"\[\[(.*?)\]\]", r"\1", str(c))).strip() for c in captions]
    write_json(spec_path, spec)
    _write_vo_lines(
        vo_path,
        "const LINES = [\n" + "".join(f'  {{ id: "line-{i + 1}", text: {json.dumps(t, ensure_ascii=False)} }},\n' for i, t in enumerate(spec["spoken"])) + "];",
    )
    try:
        ret = await bridge("compare.rebuild", {"slug": slug, "spec": spec}, timeout=60)
    except BridgeError as exc:
        return error(500, str(exc))
    return {"ok": True, "slug": slug, "root": _js_numbers(g(ret, "root"))}


async def _fetch_image(url: str, timeout: float = 60) -> bytes:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}")
    return resp.content


def _mark_manual_image(d: Path, key: str, dest: Path) -> None:
    """Ảnh người dùng tự tải lên / dán URL: đủ điều kiện render, huỷ yêu cầu Antigravity cũ."""
    state = read_image_state(d)
    if key in state["items"] or state["items"]:
        prev = state["items"].get(key, {})
        state["items"][key] = {**prev, "dest": dest.relative_to(d).as_posix(), "source": "manual", "taskId": None, "error": ""}
        write_image_state(d, state)


def _image_aspect_for(slug: str, key: str, prev: Dict[str, Any]) -> str:
    if prev.get("aspect"):
        return prev["aspect"]
    kind = detect_video_type_for_slug(slug)
    if kind == "tierlist":
        return "9:16" if key.endswith("-showcase") else "1:1"
    return _TYPE_IMAGE_ASPECT.get(kind, "1:1")


async def _request_antigravity_replacement(slug: str, d: Path, key: str, dest: Path, prompt: Optional[str]) -> Response:
    try:
        from bkt_web.image_routes import EnqueueRequest, enqueue_image
    except ImportError:
        from image_routes import EnqueueRequest, enqueue_image
    state = read_image_state(d)
    prev = state["items"].get(key, {})
    prompt = (prompt or prev.get("prompt") or "").strip()
    if not prompt:
        return error(400, "Cần mô tả (prompt) cho ảnh mới")
    aspect = _image_aspect_for(slug, key, prev)
    res = await asyncio.to_thread(enqueue_image, EnqueueRequest(
        prompt=prompt, negative_prompt=prev.get("negative") or DEFAULT_IMAGE_NEGATIVE,
        aspect_ratio=aspect, engine="antigravity", notes=f"Đổi ảnh · {slug} · {key}",
    ))
    task_id = (res.get("task_ids") or [None])[0]
    with IMAGE_STATE_LOCK:
        state = read_image_state(d)
        prev = state["items"].get(key, prev)
        state["items"][key] = {
            **prev, "prompt": prompt, "negative": prev.get("negative") or DEFAULT_IMAGE_NEGATIVE, "aspect": aspect,
            "dest": dest.relative_to(d).as_posix(), "taskId": task_id, "attempts": 1, "error": "",
            # Đã có ảnh thì vẫn dùng ảnh đó cho tới khi ảnh mới về (luồng tự gán thay vào).
            "source": "replacing" if dest.is_file() else "pending",
        }
        write_image_state(d, state)
    rel = dest.relative_to(d).as_posix()
    return JSONResponse({
        "ok": True, "slug": slug, "target": key, "pending": True, "taskId": task_id, "aspect": aspect,
        "imageUrl": f"/videos/{slug}/{rel}?t={int(time.time() * 1000)}",
        "message": "Đã gửi Antigravity. Ảnh mới về sau vài phút sẽ tự gán vào đúng cảnh; render lại sau đó.",
    })


@compare_native_router.get("/api/videos/{slug}/images")
async def api_video_images(slug: str):
    if not _existing_video(slug):
        return error(404, "không có video này")
    return {"slug": slug, **image_status(slug), "items": read_image_state(_video_dir(slug))["items"]}


# ---------------------------------------------------------------------------
# Tự gán ảnh Antigravity về đúng cảnh của video (thay cho việc bấm "🎨 Ảnh Antigravity").
# Cùng quy tắc với compare_studio/tools/antigravity-images.mjs: chép nguyên file ảnh của task
# vào `dest`, nguồn theo model của task (không bao giờ ghi ảnh dự phòng là Antigravity), task lỗi
# thì xin lại tối đa IMAGE_MAX_ATTEMPTS lần. Bỏ qua video đang có tác vụ chạy (tool Node ghi cùng file).
# ---------------------------------------------------------------------------
IMAGE_MAX_ATTEMPTS = 3
AUTO_ASSIGN_SECONDS = max(10, int(os.environ.get("TOKMATRIX_IMAGE_AUTOASSIGN_SECONDS", "30") or 30))
_AI_DONE_SOURCES = ("antigravity", "imagerouter", "cf_worker", "manual")
_AUTO_ASSIGN_STOP = threading.Event()
_AUTO_ASSIGN_THREAD: Optional[threading.Thread] = None


def task_image_source(model: Any) -> str:
    model = str(model or "")
    if model == "cf-worker":
        return "cf_worker"
    if model.startswith("imagerouter:"):
        return "imagerouter"
    if model == "muse":
        return "muse"
    return "antigravity"


def _image_waiting(d: Path, it: Dict[str, Any]) -> bool:
    return bool(it.get("taskId")) and not (
        it.get("source") in _AI_DONE_SOURCES and (d / str(it.get("dest") or "")).is_file())


def _queue_rows(task_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    try:
        from bkt_web.image_routes import _db
    except ImportError:
        from image_routes import _db
    if not task_ids:
        return {}
    conn = _db()
    try:
        marks = ",".join("?" * len(task_ids))
        rows = conn.execute(
            f"SELECT id, status, model, image_filename, error_message FROM image_queue WHERE id IN ({marks})", task_ids,
        ).fetchall()
    finally:
        conn.close()
    return {r[0]: {"status": r[1], "model": r[2], "image_filename": r[3], "error_message": r[4]} for r in rows}


def _slug_busy(slug: str) -> bool:
    with RUNS_LOCK:
        return any(r["slug"] == slug and not r["done"] for r in RUNS.values())


def auto_assign_images(slug: str) -> Dict[str, int]:
    """Gán ảnh đã xong của một video; trả số ảnh vừa gán / xin lại / còn chờ."""
    try:
        from bkt_web.image_routes import EnqueueRequest, enqueue_image
    except ImportError:
        from image_routes import EnqueueRequest, enqueue_image
    d = _video_dir(slug)
    result = {"assigned": 0, "retried": 0, "waiting": 0}
    with IMAGE_STATE_LOCK:
        state = read_image_state(d)
        waiting = {k: it for k, it in state["items"].items() if _image_waiting(d, it)}
        if not waiting:
            return result
        rows = _queue_rows([str(it["taskId"]) for it in waiting.values()])
        changed = False
        for key, it in waiting.items():
            row = rows.get(str(it["taskId"]))
            status = (row or {}).get("status")
            if status == "completed" and row.get("image_filename"):
                src = GENERATED_IMAGES_DIR / Path(str(row["image_filename"])).name
                try:
                    data = src.read_bytes()
                except OSError:
                    result["waiting"] += 1
                    continue
                if len(data) < 2000:
                    result["waiting"] += 1
                    continue
                dest = d / str(it["dest"])
                dest.parent.mkdir(parents=True, exist_ok=True)
                tmp = dest.with_name(f".{dest.name}.tmp")
                tmp.write_bytes(data)
                tmp.replace(dest)
                it.update(source=task_image_source(row.get("model")), imageFile=src.name, error="")
                result["assigned"] += 1
                changed = True
            elif status == "failed" or row is None:
                error_text = (row or {}).get("error_message") or "task không còn trong hàng đợi"
                attempts = int(it.get("attempts") or 1)
                if attempts < IMAGE_MAX_ATTEMPTS and it.get("prompt"):
                    res = enqueue_image(EnqueueRequest(
                        prompt=it["prompt"], negative_prompt=it.get("negative") or DEFAULT_IMAGE_NEGATIVE,
                        aspect_ratio=it.get("aspect") or "1:1", engine="antigravity",
                        notes=f"Tự gán ảnh · {slug} · {key} (xin lại)",
                    ))
                    new_id = (res.get("task_ids") or [None])[0]
                    if new_id:
                        it.update(taskId=new_id, attempts=attempts + 1, error=str(error_text)[:300])
                        result["retried"] += 1
                        changed = True
                        continue
                if it.get("error") != str(error_text)[:300]:
                    it["error"] = str(error_text)[:300]
                    changed = True
            else:
                result["waiting"] += 1
        if changed:
            write_image_state(d, state)
    return result


def _render_if_publish_waiting(slug: str) -> None:
    """Đủ ảnh mà có task đăng chờ video này (WAITING_RENDER) → render như tác vụ "images" + render."""
    if pending_images(slug) or _slug_busy(slug):
        return
    try:
        if _publish_flow().has_waiting(slug):
            start_run(slug, "render", {"target": None, "render": True, "spec": None, "topic": None})
    except Exception as exc:  # không để luồng nền chết vì một video
        print(f"[image-autoassign] {slug}: không tự render được: {exc}")


def auto_assign_all() -> Dict[str, Dict[str, int]]:
    done: Dict[str, Dict[str, int]] = {}
    for state_file in VIDEOS_DIR.glob(f"*/{IMAGE_STATE_FILE}"):
        slug = state_file.parent.name
        if not safe_slug(slug) or _slug_busy(slug):
            continue
        try:
            if '"taskId"' not in state_file.read_text(encoding="utf-8"):
                continue
            res = auto_assign_images(slug)
        except Exception as exc:
            print(f"[image-autoassign] {slug}: {exc}")
            continue
        if res["assigned"] or res["retried"]:
            done[slug] = res
            print(f"[image-autoassign] {slug}: gán {res['assigned']} ảnh, xin lại {res['retried']}, còn chờ {res['waiting']}")
            if res["assigned"]:
                _render_if_publish_waiting(slug)
    return done


def _auto_assign_loop() -> None:
    while not _AUTO_ASSIGN_STOP.wait(AUTO_ASSIGN_SECONDS):
        try:
            auto_assign_all()
        except Exception as exc:
            print(f"[image-autoassign] lỗi: {exc}")


def start_image_autoassign() -> None:
    global _AUTO_ASSIGN_THREAD
    if os.environ.get("TOKMATRIX_IMAGE_AUTOASSIGN", "1") == "0":
        return
    if _AUTO_ASSIGN_THREAD and _AUTO_ASSIGN_THREAD.is_alive():
        return
    _AUTO_ASSIGN_STOP.clear()
    _AUTO_ASSIGN_THREAD = threading.Thread(target=_auto_assign_loop, name="image-autoassign", daemon=True)
    _AUTO_ASSIGN_THREAD.start()


def stop_image_autoassign() -> None:
    _AUTO_ASSIGN_STOP.set()


def _save_image_bytes(raw_bytes: bytes, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(raw_bytes))
        suffix = dest.suffix.lower()
        if suffix in (".jpg", ".jpeg"):
            if im.mode in ("RGBA", "P", "LA"):
                if im.mode == "RGBA":
                    bg = Image.new("RGB", im.size, (15, 23, 42))
                    bg.paste(im, mask=im.split()[3])
                    im = bg
                else:
                    im = im.convert("RGB")
            elif im.mode != "RGB":
                im = im.convert("RGB")
            im.save(dest, format="JPEG", quality=92)
        elif suffix == ".png":
            im.save(dest, format="PNG")
        else:
            dest.write_bytes(raw_bytes)
    except Exception:
        dest.write_bytes(raw_bytes)


@compare_native_router.post("/api/videos/{slug}/change-image")
async def api_video_change_image(slug: str, request: Request):
    d = _existing_video(slug)
    if not d:
        return error(404, "không có video này")
    body = await _json_body(request)
    target, kind = body.get("target"), body.get("type")
    if not target:
        return error(400, "Thiếu target (ví dụ: tier-1, tier-2, left, right)")
    if not isinstance(target, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", target):
        return error(400, "target không hợp lệ")

    if target in ("left", "right"):
        dest = d / "assets" / "icons" / f"{target}.png"
    else:
        dest = d / "assets" / "images" / f"{target}.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)

    try:
        if kind == "upload":
            data = body.get("data")
            if not data:
                return error(400, "Thiếu dữ liệu ảnh upload")
            raw_b64 = re.sub(r"^data:image/[^;]+;base64,", "", data)
            raw_bytes = base64.b64decode(raw_b64)
            _save_image_bytes(raw_bytes, dest)
            _mark_manual_image(d, target, dest)
        elif kind == "url":
            url = str(body.get("url") or "").strip()
            if not url:
                return error(400, "Thiếu URL ảnh")

            raw_bytes = None
            parsed = urllib.parse.urlparse(url)
            path_part = parsed.path if parsed.scheme in ("http", "https") else url
            if "/static/generated_images/" in path_part:
                fname = Path(path_part).name
                local_file = GENERATED_IMAGES_DIR / fname
                if local_file.is_file():
                    raw_bytes = local_file.read_bytes()
            elif path_part.startswith("/videos/"):
                parts = [p for p in path_part.split("/") if p]
                if len(parts) >= 2 and parts[0] == "videos":
                    v_slug = parts[1]
                    v_sub = "/".join(parts[2:])
                    v_file = VIDEOS_DIR / v_slug / v_sub
                    if v_file.is_file():
                        raw_bytes = v_file.read_bytes()

            if raw_bytes is None:
                if parsed.scheme not in ("http", "https"):
                    return error(400, "URL ảnh phải là http(s) hoặc đường dẫn nội bộ")
                raw_bytes = await _fetch_image(url)

            _save_image_bytes(raw_bytes, dest)
            _mark_manual_image(d, target, dest)
        elif kind in ("ai", "antigravity"):
            # Xin ảnh qua hàng đợi Antigravity (bất đồng bộ) — không Pollinations. Ảnh cũ giữ
            # nguyên tới khi ảnh mới về; tác vụ "images" hoặc Studio tải ảnh mới về sau.
            return await _request_antigravity_replacement(slug, d, target, dest, body.get("prompt"))
        else:
            return error(400, "Loại hành động không hợp lệ")
    except Exception as exc:
        return error(500, f"Lỗi đổi hình ảnh: {exc}")

    rel = dest.relative_to(d).as_posix()
    return {"ok": True, "slug": slug, "target": target, "imageUrl": f"/videos/{slug}/{rel}?t={int(time.time() * 1000)}"}


# ---------------------------------------------------------------------------
# Routes: runs
# ---------------------------------------------------------------------------
@compare_native_router.post("/api/runs", status_code=201)
async def api_runs_create(request: Request):
    body = await _json_body(request)
    slug, task, target = body.get("slug"), body.get("task"), body.get("target")
    spec, topic = body.get("spec"), body.get("topic")
    if task not in TASKS:
        return error(400, "task không hợp lệ")
    if task != "batch_global" and not safe_slug(slug):
        return error(400, "slug không hợp lệ")
    if task == "batch_global" and not topic:
        return error(400, "cần topic để tạo batch toàn cầu")
    is_number = isinstance(target, (int, float)) and not isinstance(target, bool)
    if task == "fit" and not (is_number and 8 <= target <= 180):
        return error(400, "thời lượng mục tiêu phải nằm trong 8-180 giây")
    if task not in ("create", "batch_global") and not (VIDEOS_DIR / slug).exists():
        return error(404, "không có video này")
    if task == "create" and (VIDEOS_DIR / slug).exists():
        return error(409, f"video '{slug}' đã tồn tại — hãy chọn slug khác")
    if task == "create" and not isinstance(spec, dict):
        return error(400, "cần spec để tạo video mới")
    if task == "render":
        waiting = pending_images(slug)
        if waiting:
            return error(409, f"Còn {len(waiting)} ảnh chờ Antigravity — chưa render được", pending=waiting)
    with RUNS_LOCK:
        busy = next((r for r in RUNS.values() if (r["slug"] == slug if slug else r["task"] == task) and not r["done"]), None)
    if busy:
        return error(409, f"đang chạy '{busy['task']}'", id=busy["id"])

    render = bool(body.get("render"))
    run_id = str(uuid.uuid4())
    publish = body.get("publish")
    flow = _publish_flow()
    if task == "images" and not render and flow.has_waiting(slug):
        render = True  # đã có task đăng chờ video này: đủ ảnh thì render luôn
    if publish is not None:
        # Tự đăng sau render: chỉ khi người dùng đã chọn kênh (không bao giờ tự chọn).
        if not isinstance(publish, dict):
            return error(400, "publish phải là object")
        if task not in ("create", "render", "images", "fit") or (task != "render" and not render):
            return error(400, "Tự đăng sau render cần tác vụ có render")
        try:
            flow.enqueue_upload(
                slug, publish.get("channel_id"), publish.get("caption") or "", publish.get("hashtags") or "",
                schedule_ts=publish.get("schedule_ts"), ai_generated=publish.get("ai_generated", True) is not False,
                status="WAITING_RENDER", run_id=run_id, confirm_nearby=bool(publish.get("confirm_nearby")),
            )
        except flow.PublishError as exc:
            return error(exc.status, exc.message, **exc.extra)
    run = start_run(slug or "batch-global", task, {
        "target": target if is_number else None,
        "render": render,
        "spec": spec,
        "topic": topic,
    }, run_id=run_id)
    return JSONResponse(status_code=201, content={"id": run["id"], "slug": slug or "batch-global", "task": task})


@compare_native_router.get("/api/runs/{run_id}/stream")
async def api_runs_stream(run_id: str, request: Request):
    run = RUNS.get(run_id)
    if not run:
        return error(404, "run không tồn tại")

    async def events():
        sent = 0  # vị trí tuyệt đối trong log, kể cả dòng đã bị cắt bớt
        while True:
            with RUNS_LOCK:
                dropped = run.get("dropped", 0)
                start = max(sent - dropped, 0)
                fresh = run["lines"][start:]
                sent = dropped + len(run["lines"])
                finished = run["done"]
            for entry in fresh:
                yield f"data: {json.dumps(entry, ensure_ascii=False)}\n\n"
            if finished:
                yield f"event: done\ndata: {json.dumps({'code': run['code']})}\n\n"
                return
            if await request.is_disconnected():
                return
            await asyncio.sleep(0.25)

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"cache-control": "no-cache", "connection": "keep-alive", "x-accel-buffering": "no"},
    )


@compare_native_router.post("/api/runs/{run_id}/stop")
async def api_runs_stop(run_id: str):
    run = RUNS.get(run_id)
    if not run or run["done"]:
        return error(404, "không có run đang chạy")
    run["stopped"] = True
    proc = run.get("proc")
    if proc and proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)  # cả npm lẫn tiến trình con của nó
        except (ProcessLookupError, PermissionError, OSError):
            proc.terminate()
    return {"stopped": True}


def stop_all_runs() -> None:
    with RUNS_LOCK:
        procs = [r.get("proc") for r in RUNS.values() if not r["done"]]
    for proc in procs:
        if proc and proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError, OSError):
                proc.terminate()


# ---------------------------------------------------------------------------
# File tĩnh trong videos/<slug>/...
# ---------------------------------------------------------------------------
@compare_native_router.api_route("/videos/{slug}", methods=["GET", "HEAD"])
@compare_native_router.api_route("/videos/{slug}/{sub:path}", methods=["GET", "HEAD"])
async def serve_video_asset(slug: str, sub: str = ""):
    if not _existing_video(slug):
        return Response("not found", status_code=404)
    try:
        path = safe_child(VIDEOS_DIR / slug, sub or "index.html")
    except ValueError:
        return Response("not found", status_code=404)
    if not path.is_file():
        return Response("not found", status_code=404)
    return FileResponse(str(path), media_type=MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream"))
