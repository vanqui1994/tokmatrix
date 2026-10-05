#!/usr/bin/env python3
"""
TokMatrix AI Studio - 100% Native 2D Vector Animation & Multi-Voice Remake Pipeline
Chuyển hóa video bất kỳ thành Hoạt Hình 2D Vector HTML5 Canvas 60 FPS + Lồng tiếng đa vai TikTok
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Fix macOS proxy bug: ::1 trong no_proxy gây crash httpx 0.28
# (InvalidURL: Invalid port: ':1'). Xóa để httpx không auto-detect.
os.environ.pop("NO_PROXY", None)
os.environ.pop("no_proxy", None)

try:
    from deep_translator import GoogleTranslator, MyMemoryTranslator
except ImportError:
    GoogleTranslator = None
    MyMemoryTranslator = None

try:
    from bkt_web.remake_localization import profile_for_source
except ImportError:
    try:
        from remake_localization import profile_for_source
    except ImportError:
        profile_for_source = lambda h: None

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"
SCRATCH_DIR = BASE_DIR / "storage" / "remake_scratch"
PROJECTS_REGISTRY = BASE_DIR / "storage" / "remake_projects.json"
PUBLIC_PROJECTS_DIR = STATIC_DIR / "remake_projects"
CAPCUT_CLI = PROJECT_ROOT / "compare_studio" / "tools" / "capcut-cli.py"

for d in (SCRATCH_DIR, PROJECTS_REGISTRY.parent, PUBLIC_PROJECTS_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-_").lower()
    if not slug:
        raise ValueError("Tên dự án không tạo được slug hợp lệ")
    if len(slug) > 80:
        slug = slug[:80].rstrip("-_")
        if not slug:
            raise ValueError("Tên dự án không tạo được slug hợp lệ")
    return slug


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def translate_text(text: str, source_lang: str = "zh") -> str:
    """Tự động dịch kịch bản sang tiếng Việt tự nhiên"""
    if not text or not text.strip():
        return text
    
    # Thử GoogleTranslator
    if GoogleTranslator:
        try:
            res = GoogleTranslator(source=source_lang if source_lang != "zh" else "zh-CN", target="vi").translate(text)
            if res and len(res.strip()) > 0:
                return res.strip()
        except Exception:
            pass

    # Thử MyMemoryTranslator
    if MyMemoryTranslator:
        try:
            sl = "zh-CN" if source_lang == "zh" else ("auto" if not source_lang else source_lang)
            res = MyMemoryTranslator(source=sl, target="vi-VN").translate(text)
            if res and len(res.strip()) > 0:
                return res.strip()
        except Exception:
            pass

    return text.strip()


def translate_cues_with_ai(segments: List[Dict[str, Any]], source_lang: str = "zh") -> List[str]:
    """Chuyển thể kịch bản sang tiếng Việt đối đáp tự nhiên TikTok bằng Gemini Flash siêu tốc"""
    try:
        from bkt_web import key_vault
    except ImportError:
        try:
            import key_vault
        except ImportError:
            key_vault = None

    api_key = key_vault.get_key("ai.gemini") if key_vault else None
    payload = [{"id": i, "text": s["text"]} for i, s in enumerate(segments)]

    if api_key and payload:
        try:
            import httpx
            model = os.environ.get("TOKMATRIX_GEMINI_MODEL", "gemini-3.5-flash")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            prompt = (
                "Bạn là biên kịch hoạt hình TikTok hàng đầu Việt Nam. Hãy chuyển thể danh sách câu thoại sau sang tiếng Việt đối đáp "
                "tự nhiên, hài hước, dí dỏm, giữ đúng thứ tự câu và nội dung câu chuyện. Trả về đúng JSON array [{\"id\": 0, \"text\": \"...\"}].\n"
                f"Kịch bản nguồn ({source_lang}): " + json.dumps(payload, ensure_ascii=False)
            )
            res = httpx.post(
                url,
                headers={"x-goog-api-key": api_key, "content-type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "thinkingConfig": {"thinkingBudget": 0}
                    }
                },
                timeout=30
            )
            if res.status_code == 200:
                body = res.json()
                text_content = body["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text_content)
                parsed_map = {item["id"]: item["text"] for item in parsed if isinstance(item, dict) and "id" in item and "text" in item}
                return [parsed_map.get(i, segments[i]["text"]) for i in range(len(segments))]
        except Exception as e:
            print(f"[Gemini Translate Error] {e}")

    # Fallback to local
    return [translate_text(s["text"], source_lang) for s in segments]



def generate_tts(
    text: str,
    engine: str,
    voice: Optional[str],
    out_path: Path,
    voice_role: Optional[str] = None,
    allow_fallback: bool = True,
) -> bool:
    """Sinh giọng đọc AI (CapCut hoặc Edge-TTS).

    `voice_role` giữ đúng vai khi phải rơi về Edge-TTS: trước đây mọi nhân vật
    dùng CapCut đều bị gom về một giọng nữ duy nhất, làm sập phân vai đa giọng.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 1. Thử CapCut CLI
    if engine == "capcut" and CAPCUT_CLI.exists():
        v = voice or "BV421_vivn_streaming"
        cmd = ["python3", str(CAPCUT_CLI), "tts", "--text", text, "--voice", v, "--out", str(out_path), "--timeout", "45"]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if r.returncode == 0 and out_path.exists() and out_path.stat().st_size > 1000:
                return True
        except Exception:
            pass

    if engine == "capcut" and not allow_fallback:
        return False

    # 2. Fallback Edge-TTS — chọn giọng theo vai, không gom chung một giọng
    if voice and "Neural" in voice:
        edge_v = voice
    elif voice_role and voice_role in VOICE_BY_ROLE:
        edge_v = VOICE_BY_ROLE[voice_role]
    else:
        edge_v = "vi-VN-NamMinhNeural"
    cmd = ["edge-tts", "--voice", edge_v, "--rate=+10%", "--text", text, "--write-media", str(out_path)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if r.returncode == 0 and out_path.exists() and out_path.stat().st_size > 1000:
            return True
    except Exception:
        pass

    return False



REGISTRY_LOCK = threading.Lock()


def _atomic_write_json(path: Path, data: Any) -> None:
    """Ghi qua file tạm rồi replace, tránh hỏng file khi bị ngắt giữa chừng."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def register_project(entry: Dict[str, Any]) -> None:
    """Thêm/cập nhật một project trong registry.

    Bản cũ đọc file rồi ghi đè toàn bộ; nếu đọc lỗi thì `projects = []` khiến
    TẤT CẢ project cũ biến mất. Nay giữ nguyên danh sách khi đọc lỗi và không
    cho hai tiến trình ghi chồng nhau.
    """
    with REGISTRY_LOCK:
        projects: List[Dict[str, Any]] = []
        if PROJECTS_REGISTRY.exists():
            try:
                loaded = json.loads(PROJECTS_REGISTRY.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    projects = loaded
                else:
                    raise ValueError("registry không phải danh sách")
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                # Không ghi đè lên dữ liệu không đọc được — sao lưu lại rồi mới ghi tiếp.
                backup = PROJECTS_REGISTRY.with_suffix(f".corrupt-{int(time.time())}.json")
                try:
                    PROJECTS_REGISTRY.replace(backup)
                    print(f"[Remake] Registry lỗi ({exc}), đã sao lưu sang {backup.name}")
                except OSError:
                    pass
                projects = []

        projects = [p for p in projects if p.get("id") != entry["id"]]
        projects.insert(0, entry)
        _atomic_write_json(PROJECTS_REGISTRY, projects)


# =========================================================================
# NHẬN DẠNG CHỦ ĐỀ & PHÂN VAI TỪ NỘI DUNG (không đoán theo tên file)
# =========================================================================

VERIFIED_SCRIPTS_FILE = BASE_DIR / "storage" / "remake_verified_scripts.json"

SCRIPT_SOURCE_LABEL = {
    "verified": "kịch bản đã xác minh cho đúng file này",
    "ai": "AI phân tích bản bóc băng",
    "heuristic": "suy luận theo từ khoá lời thoại",
}

# 4 vai chuẩn, khớp với voice_role của remake_localization để lồng tiếng đa quốc gia
VOICE_BY_ROLE = {
    "young_1": "vi-VN-HoaiMyNeural",
    "young_2": "vi-VN-HoaiMyNeural",
    "adult": "vi-VN-NamMinhNeural",
    "narrator": "vi-VN-NamMinhNeural",
}
ROLE_ORDER = ["young_1", "young_2", "adult", "narrator"]


THEME_TEMPLATE = {
    "tomato_garden": "tomato",
    "peanut_farm": "peanut",
    "apple_orchard": "apple",
    "caterpillar_pest": "caterpillar",
    "watermelon_farm": "watermelon",
    "fruit_plant": "peanut",
    "critter_bug": "caterpillar",
}


def load_verified_script(source_sha256: str) -> Optional[Dict[str, Any]]:
    """Kịch bản viết tay chỉ áp dụng cho đúng file có hash trùng khớp."""
    if not source_sha256 or not VERIFIED_SCRIPTS_FILE.exists():
        return None
    try:
        data = json.loads(VERIFIED_SCRIPTS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    entry = data.get(source_sha256)
    return entry if isinstance(entry, dict) else None


def _guess_voice_role(cue: Dict[str, Any], index: int) -> str:
    """Suy ra vai giọng khi kịch bản cũ chưa khai báo."""
    name = (cue.get("name") or "").lower()
    speaker = (cue.get("speaker") or "").lower()
    if any(k in name or k in speaker for k in ("lời bình", "narrator", "dẫn", "thuyết minh")):
        return "narrator"
    if any(k in name or k in speaker for k in ("bác", "ông", "nông dân", "farmer", "gardener", "người làm vườn")):
        return "adult"
    return "young_1"


# Bộ từ khoá dùng cho nhánh dự phòng — soi LỜI THOẠI, không soi tên file.
KEYWORD_THEMES: List[Dict[str, Any]] = [
    {
        "theme": "fruit_plant", "label": "Cây trái & nhà vườn",
        "keywords": ["cây", "lá", "trái", "quả", "hạt", "rau", "củ", "hoa", "nông", "vườn", "bón", "tưới",
                     "plant", "fruit", "farm", "garden", "西瓜", "番茄", "花生", "果", "菜", "肥料"],
        "cast": [
            {"id": "plant_a", "name": "Cây Trồng", "avatar": "🌱", "voice_role": "young_1"},
            {"id": "farmer", "name": "Bác Nông Dân", "avatar": "👨‍🌾", "voice_role": "adult"},
        ],
    },
    {
        "theme": "critter_bug", "label": "Con vật & côn trùng",
        "keywords": ["sâu", "bọ", "chim", "chuột", "kiến", "ong", "cá", "mèo", "chó", "cún", "gà",
                     "animal", "bug", "worm", "bird", "虫", "鸟", "猫", "狗", "鱼"],
        "cast": [
            {"id": "critter", "name": "Bé Con Vật", "avatar": "🐛", "voice_role": "young_1"},
            {"id": "companion", "name": "Người Bạn", "avatar": "🐦", "voice_role": "young_2"},
        ],
    },
    {
        "theme": "kitchen_food", "label": "Bếp núc & món ăn",
        "keywords": ["nấu", "món", "ăn", "bếp", "chiên", "xào", "nướng", "gia vị", "công thức",
                     "cook", "recipe", "kitchen", "食", "做饭", "菜谱"],
        "cast": [
            {"id": "chef", "name": "Đầu Bếp", "avatar": "👩‍🍳", "voice_role": "adult"},
            {"id": "taster", "name": "Người Nếm Thử", "avatar": "😋", "voice_role": "young_1"},
        ],
    },
    {
        "theme": "howto_tips", "label": "Mẹo vặt & hướng dẫn",
        "keywords": ["mẹo", "cách", "bước", "hướng dẫn", "lưu ý", "bí quyết", "tip", "how to", "step",
                     "教程", "方法", "技巧"],
        "cast": [
            {"id": "guide", "name": "Người Hướng Dẫn", "avatar": "🧑‍🏫", "voice_role": "adult"},
            {"id": "learner", "name": "Người Học", "avatar": "🙋", "voice_role": "young_1"},
        ],
    },
]

DEFAULT_CAST = [
    {"id": "hero", "name": "Nhân Vật A", "avatar": "🌟", "voice_role": "young_1"},
    {"id": "friend", "name": "Nhân Vật B", "avatar": "✨", "voice_role": "young_2"},
]


def detect_theme_by_keywords(segments: List[Dict[str, Any]]):
    """Dự phòng khi không có AI: chấm điểm từ khoá trên chính lời thoại."""
    text = " ".join(s.get("text", "") for s in segments).lower()
    best, best_score = None, 0
    for candidate in KEYWORD_THEMES:
        score = sum(1 for keyword in candidate["keywords"] if keyword in text)
        if score > best_score:
            best, best_score = candidate, score

    chosen = best if best and best_score >= 2 else None
    cast_src = chosen["cast"] if chosen else DEFAULT_CAST
    cast = [
        {
            **role,
            "engine": "capcut" if idx == 0 else "edge",
            "voice": VOICE_BY_ROLE.get(role["voice_role"], "vi-VN-NamMinhNeural"),
        }
        for idx, role in enumerate(cast_src)
    ]
    if chosen:
        return chosen["theme"], chosen["label"], cast
    return "dynamic_duo", "Hội thoại hai nhân vật", cast


def analyze_story_with_ai(
    segments: List[Dict[str, Any]],
    source_lang: str,
    log: Optional[Callable[[str, int], None]] = None,
) -> Optional[Dict[str, Any]]:
    """Nhờ Gemini đọc bản bóc băng: tìm chủ đề, dàn nhân vật và gán vai cho từng câu.

    Chỉ dựa trên lời thoại đã bóc được. Trả None nếu không có API key hoặc
    kết quả không hợp lệ, để lớp gọi tự rơi về nhánh từ khoá.
    """
    try:
        from bkt_web import key_vault
    except ImportError:
        try:
            import key_vault
        except ImportError:
            key_vault = None

    api_key = None
    if key_vault:
        try:
            api_key = key_vault.get_key("ai.gemini")
        except Exception as exc:
            if log:
                log(f"Không đọc được API key Gemini ({exc})", 43)
    if not api_key:
        if log:
            log("Chưa có API key Gemini trong Kho Khoá — dùng suy luận từ khoá", 43)
        return None
    if not segments:
        return None

    payload = [{"id": i, "start": s["start"], "end": s["end"], "text": s["text"]}
               for i, s in enumerate(segments)]
    prompt = (
        "Bạn là biên kịch hoạt hình 2D. Dưới đây là bản bóc băng lời thoại của MỘT video "
        f"(ngôn ngữ nguồn: {source_lang}). Hãy phân tích và trả về JSON object đúng schema:\n"
        '{"theme":"<slug_tieng_anh_khong_dau>","label":"<tên chủ đề tiếng Việt ngắn>",'
        '"characters":[{"id":"<slug>","name":"<tên tiếng Việt>","avatar":"<1 emoji>",'
        '"voice_role":"young_1|young_2|adult|narrator"}],'
        '"lines":[{"id":<số thứ tự câu>,"speaker":"<id nhân vật>","text":"<lời thoại tiếng Việt>"}]}\n\n'
        "RÀNG BUỘC BẮT BUỘC:\n"
        "- Chủ đề và nhân vật phải suy ra TỪ CHÍNH LỜI THOẠI, không bịa thêm tình tiết.\n"
        "- Giữ nguyên số câu và đúng thứ tự: mảng lines phải có đủ id từ 0 đến "
        f"{len(segments) - 1}.\n"
        "- Tối đa 4 nhân vật. Gán người kể chuyện voice_role='narrator' nếu có lời dẫn.\n"
        "- text là bản tiếng Việt tự nhiên, khẩu ngữ TikTok, giữ đúng ý câu gốc.\n\n"
        "Bản bóc băng: " + json.dumps(payload, ensure_ascii=False)
    )

    # Gemini hay trả 503 nhất thời; một cú lỗi không nên đẩy cả video sang
    # nhánh suy luận từ khoá kém chính xác hơn.
    parsed = None
    last_error = ""
    try:
        import httpx
    except ImportError:
        return None

    model = os.environ.get("TOKMATRIX_GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    for attempt in range(4):
        try:
            res = httpx.post(
                url,
                headers={"x-goog-api-key": api_key, "content-type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json",
                                         "thinkingConfig": {"thinkingBudget": 0}},
                },
                timeout=60,
            )
            if res.status_code == 200:
                parsed = json.loads(res.json()["candidates"][0]["content"]["parts"][0]["text"])
                break
            last_error = f"HTTP {res.status_code}"
            if res.status_code < 500:
                break           # lỗi do request, thử lại cũng vậy
        except Exception as exc:
            last_error = str(exc)[:120]

        if attempt < 3:
            wait = 2 * (attempt + 1)
            if log:
                log(f"AI phân tích lỗi ({last_error}) — thử lại sau {wait}s", 43)
            time.sleep(wait)

    if parsed is None:
        if log:
            log(f"AI phân tích không dùng được ({last_error}) — chuyển sang suy luận từ khoá", 44)
        return None

    characters = parsed.get("characters") or []
    lines = parsed.get("lines") or []
    if not characters or not lines:
        if log:
            log("AI trả về kết quả thiếu nhân vật hoặc lời thoại — dùng suy luận từ khoá", 44)
        return None

    cast: Dict[str, Dict[str, Any]] = {}
    for idx, character in enumerate(characters[:4]):
        cid = str(character.get("id") or f"char_{idx}")
        role = character.get("voice_role")
        if role not in VOICE_BY_ROLE:
            role = ROLE_ORDER[idx % len(ROLE_ORDER)]
        cast[cid] = {
            "id": cid,
            "name": str(character.get("name") or f"Nhân vật {idx + 1}"),
            "avatar": str(character.get("avatar") or "🎭")[:4],
            "voice_role": role,
            "engine": "capcut" if idx == 0 else "edge",
            "voice": VOICE_BY_ROLE[role],
        }

    fallback = next(iter(cast.values()))
    by_id = {int(item["id"]): item for item in lines
             if isinstance(item, dict) and str(item.get("id", "")).isdigit()}

    cues: List[Dict[str, Any]] = []
    for idx, seg in enumerate(segments):
        item = by_id.get(idx)
        if not item:
            # Thiếu câu nào thì giữ nguyên lời gốc, không bỏ câu.
            speaker, text = fallback, seg["text"]
        else:
            speaker = cast.get(str(item.get("speaker")), fallback)
            text = str(item.get("text") or seg["text"]).strip() or seg["text"]
        cues.append({
            "start": seg["start"], "end": seg["end"],
            "speaker": speaker["id"], "name": speaker["name"],
            "text": text, "engine": speaker["engine"], "voice": speaker["voice"],
            "avatar": speaker["avatar"], "voice_role": speaker["voice_role"],
        })

    return {
        "theme": str(parsed.get("theme") or "auto_story")[:40],
        "label": str(parsed.get("label") or "Chủ đề tự nhận dạng")[:80],
        "characters": list(cast.values()),
        "cues": cues,
    }


# =========================================================================
# LỚP ĐIỀU HÀNH PIPELINE REMAKE TOÀN DIỆN
# =========================================================================

class RemakePipeline:
    def __init__(
        self,
        video_path: str,
        project_name: Optional[str] = None,
        log_callback: Optional[Callable[[str, int], None]] = None,
    ):
        self.video_path = Path(video_path).resolve()
        self.slug = _safe_slug(project_name or self.video_path.stem)
        self.log_callback = log_callback or (lambda msg, pct: print(f"[{pct}%] {msg}"))

        self.job_dir = SCRATCH_DIR / self.slug
        self.audio_dir = self.job_dir / "audio"
        self.frames_dir = self.job_dir / "keyframes"
        self.public_dir = PUBLIC_PROJECTS_DIR / self.slug

        self.job_dir.mkdir(parents=True, exist_ok=True)
        self.audio_dir.mkdir(parents=True, exist_ok=True)
        self.frames_dir.mkdir(parents=True, exist_ok=True)
        self.public_dir.mkdir(parents=True, exist_ok=True)

        self.metadata: Dict[str, Any] = {}
        self.transcription: Dict[str, Any] = {}
        self.adapted_cues: List[Dict[str, Any]] = []
        self.vector_frames: List[Dict[str, Any]] = []
        self.detected_theme: str = "dynamic_duo"

        self.source_audio_path = self.job_dir / "source_audio.mp3"
        self.master_audio_path = STATIC_DIR / f"remake_{self.slug}_master.mp3"
        self.html_demo_path = STATIC_DIR / f"remake_{self.slug}_demo.html"

    def log(self, message: str, percent: int) -> None:
        self.log_callback(message, percent)

    @staticmethod
    def _vectorize_frame(frame_path: Path, long_edge: int = 320, colors: int = 12) -> Dict[str, Any]:
        """Quantize a real source frame into deterministic horizontal vector runs."""
        from PIL import Image

        frame_path = Path(frame_path)
        with Image.open(frame_path) as source:
            image = source.convert("RGB")
            width, height = image.size
            if max(width, height) > long_edge:
                scale = long_edge / max(width, height)
                width = max(1, round(width * scale))
                height = max(1, round(height * scale))
                image = image.resize((width, height), Image.Resampling.LANCZOS)

            quantized = image.quantize(
                colors=max(2, min(int(colors), 256)),
                method=Image.Quantize.MEDIANCUT,
            )
            raw_palette = quantized.getpalette() or []
            pixel_data = (
                quantized.get_flattened_data()
                if hasattr(quantized, "get_flattened_data")
                else quantized.getdata()
            )
            pixels = list(pixel_data)
            used = sorted(set(pixels))
            palette = [
                "#{:02x}{:02x}{:02x}".format(*raw_palette[index * 3:index * 3 + 3])
                for index in used
            ]
            palette_index = {value: index for index, value in enumerate(used)}

        rects: List[Dict[str, int]] = []
        for y in range(height):
            row = pixels[y * width:(y + 1) * width]
            start = 0
            for x in range(1, width + 1):
                if x == width or row[x] != row[start]:
                    rects.append({
                        "x": start, "y": y, "width": x - start, "height": 1,
                        "color": palette_index[row[start]],
                    })
                    start = x

        return {
            "width": width,
            "height": height,
            "palette": palette,
            "rects": rects,
            "source_frame_sha256": _sha256(frame_path),
            "provenance": "quantized-from-source-frame",
        }

    # -------------------------------------------------------------
    # BƯỚC 1: PHÂN TÍCH & TRÍCH XUẤT VIDEO NGUỒN
    # -------------------------------------------------------------
    def step1_analyze_and_extract(self) -> Dict[str, Any]:
        self.log(f"Đang phân tích video nguồn: {self.video_path.name}", 5)
        if not self.video_path.is_file():
            raise FileNotFoundError(f"Không tìm thấy video: {self.video_path}")

        probe = subprocess.run([
            "ffprobe", "-v", "error", "-show_format", "-show_streams",
            "-of", "json", str(self.video_path),
        ], capture_output=True, text=True, check=True)
        
        probe_data = json.loads(probe.stdout)
        video_stream = next((s for s in probe_data.get("streams", []) if s.get("codec_type") == "video"), None)
        if not video_stream:
            raise ValueError("File nguồn không có video stream")
        audio_stream = next((s for s in probe_data.get("streams", []) if s.get("codec_type") == "audio"), None)

        fmt = probe_data.get("format", {})
        duration = float(fmt.get("duration") or video_stream.get("duration") or 0)
        width = int(video_stream.get("width") or 720)
        height = int(video_stream.get("height") or 1280)

        # Trích xuất dải audio nguồn
        self.log("Trích xuất audio gốc từ video...", 10)
        subprocess.run([
            "ffmpeg", "-y", "-i", str(self.video_path),
            "-vn", "-codec:a", "libmp3lame", "-q:a", "2", str(self.source_audio_path)
        ], capture_output=True, check=True)

        # Lưu bản sao nguồn
        public_source = self.public_dir / f"source{self.video_path.suffix.lower()}"
        shutil.copy2(self.video_path, public_source)

        self.metadata = {
            "source_file": str(self.video_path),
            "filename": self.video_path.name,
            "sha256": _sha256(self.video_path),
            "duration": round(duration, 3),
            "width": width,
            "height": height,
            "has_audio": bool(audio_stream),
            "aspect_ratio": "9:16" if height >= width else "16:9"
        }
        self.log(f"Trích xuất thành công: {duration:.1f}s, độ phân giải {width}x{height}", 18)
        return self.metadata

    # -------------------------------------------------------------
    # BƯỚC 2: NHẬN DIỆN GIỌNG NÓI & KỊCH BẢN (ASR)
    # -------------------------------------------------------------
    def step2_transcribe(self) -> Dict[str, Any]:
        self.log("Đang nhận diện giọng nói bằng Faster-Whisper ASR...", 22)
        verified = load_verified_script(self.metadata.get("sha256", ""))
        if verified and verified.get("cues"):
            self.transcription = {"language": verified.get("source_language", "auto"), "source": "reviewed-source-script", "segments": [
                {"start": c["start"], "end": c["end"], "text": c.get("original_text", c["text"])}
                for c in verified["cues"]
            ]}
            _atomic_write_json(self.job_dir / "transcription.json", self.transcription)
            return self.transcription
        try:
            from faster_whisper import WhisperModel
            model = WhisperModel("base", device="cpu", compute_type="int8")
            segments, info = model.transcribe(str(self.source_audio_path), vad_filter=True)
            
            raw_segments = []
            for s in segments:
                t = s.text.strip()
                if t:
                    raw_segments.append({
                        "start": round(s.start, 2),
                        "end": round(s.end, 2),
                        "text": t
                    })
            
            self.transcription = {
                "language": info.language,
                "probability": round(float(info.language_probability), 4),
                "segments": raw_segments
            }
        except Exception as e:
            # Trước đây chỗ này chèn 2 câu thoại tự chế rồi báo "thành công" — người dùng
            # nhận được video dựng trên nội dung không hề có trong nguồn. Nay dừng hẳn.
            raise RuntimeError(
                f"Không nhận diện được giọng nói trong video ({e}). "
                "Hãy kiểm tra video có tiếng nói rõ ràng, hoặc cài faster-whisper."
            ) from e

        if not self.transcription.get("segments"):
            raise RuntimeError(
                "Không tìm thấy câu thoại nào trong video. "
                "Video cần có lời nói để dựng được kịch bản."
            )

        with open(self.job_dir / "transcription.json", "w", encoding="utf-8") as f:
            json.dump(self.transcription, f, ensure_ascii=False, indent=2)

        self.log(f"Đã bóc tách {len(self.transcription['segments'])} câu thoại (Ngôn ngữ: {self.transcription.get('language', 'auto').upper()})", 35)
        return self.transcription

    # -------------------------------------------------------------
    # BƯỚC 3: CHUYỂN THỂ KỊCH BẢN & PHÂN VAI TỰ ĐỘNG
    # -------------------------------------------------------------
    def step3_adapt_vietnamese_script(self) -> List[Dict[str, Any]]:
        """Nhận dạng chủ đề & phân vai từ NỘI DUNG video, không đoán theo tên file.

        Thứ tự ưu tiên:
          1. Kịch bản đã xác minh thủ công, khoá theo sha256 của chính file nguồn
          2. AI (Gemini) đọc bản bóc băng để tìm chủ đề, dàn nhân vật và gán vai
          3. Suy luận theo từ khoá trong bản bóc băng (khi không có API key)
        """
        segments = self.transcription.get("segments", [])
        if not segments:
            raise RuntimeError("Bản bóc băng rỗng — không thể dựng kịch bản")

        lang = self.transcription.get("language", "auto")
        source_hash = self.metadata.get("sha256", "")

        # --- 1) Kịch bản đã xác minh cho đúng file này (khoá bằng sha256) ---
        verified = load_verified_script(source_hash)
        if verified:
            self.detected_theme = verified.get("theme", "verified_story")
            self.theme_label = verified.get("label", self.detected_theme)
            self.script_source = "verified"
            self.adapted_cues = [dict(cue) for cue in verified.get("cues", [])]
            self.log(
                f"Nhận ra file nguồn đã có kịch bản xác minh: {self.theme_label} "
                f"({len(self.adapted_cues)} câu)", 45
            )
        else:
            # --- 2) Để AI đọc bản bóc băng và tự phân tích ---
            self.log("Đang phân tích nội dung để nhận dạng chủ đề và dàn nhân vật...", 42)
            analysis = analyze_story_with_ai(segments, lang, self.log)

            if analysis:
                self.detected_theme = analysis["theme"]
                self.theme_label = analysis["label"]
                self.script_source = "ai"
                # AI chỉ được phân tích chủ đề. Lời thoại và danh tính người nói
                # phải bám dữ liệu ASR; không biến suy đoán thành dữ kiện.
                self.adapted_cues = [self._literal_cue(seg, idx) for idx, seg in enumerate(segments)]
                names = ", ".join(c.get("name", "") for c in analysis.get("characters", []) if c.get("name"))
                self.log(
                    f"AI nhận dạng chủ đề «{self.theme_label}»"
                    + (f"; gợi ý dàn nhân vật: {names}" if names else ""), 50
                )
            else:
                # --- 3) Suy luận theo từ khoá của chính lời thoại ---
                self.log("Không dùng được AI — suy luận chủ đề theo từ khoá trong lời thoại", 46)
                theme, label, cast = detect_theme_by_keywords(segments)
                self.detected_theme = theme
                self.theme_label = label
                self.script_source = "heuristic"
                self.adapted_cues = [self._literal_cue(seg, idx) for idx, seg in enumerate(segments)]

        # Chỉ bổ sung cấu hình giọng cho cue đã có speaker đáng tin cậy. Không
        # gán vòng A/B cho transcript chưa diarize vì đó là vai giả.
        for idx, cue in enumerate(self.adapted_cues):
            cue.setdefault("original_text", cue.get("text", ""))
            if cue.get("speaker") or cue.get("speaker_verified"):
                cue.setdefault("voice_role", _guess_voice_role(cue, idx))
                cue.setdefault("engine", "edge")
                cue.setdefault("voice", VOICE_BY_ROLE.get(cue["voice_role"], "vi-VN-NamMinhNeural"))

        with open(self.job_dir / "cues.json", "w", encoding="utf-8") as f:
            json.dump(self.adapted_cues, f, ensure_ascii=False, indent=2)

        covered = self.adapted_cues[-1]["end"] if self.adapted_cues else 0
        duration = float(self.metadata.get("duration") or 0)
        if duration and covered < duration - 5:
            self.log(
                f"⚠️ Lưu ý: lời thoại chỉ phủ tới giây {covered:.1f}/{duration:.1f} "
                f"({duration - covered:.1f}s cuối không có thoại)", 52
            )

        self.log(
            f"Đã dựng {len(self.adapted_cues)} câu thoại · chủ đề: {self.theme_label} "
            f"· nguồn kịch bản: {SCRIPT_SOURCE_LABEL.get(self.script_source, self.script_source)}",
            52,
        )
        return self.adapted_cues

    @staticmethod
    def _literal_cue(segment: Dict[str, Any], index: int) -> Dict[str, Any]:
        """Copy ASR evidence without translating text or inventing a speaker."""
        text = str(segment.get("text") or "").strip()
        cue: Dict[str, Any] = {
            "id": segment.get("id", f"asr-{index:04d}"),
            "start": float(segment.get("start") or 0),
            "end": float(segment.get("end") or 0),
            "text": text,
            "original_text": text,
            "source": segment.get("source", "asr"),
            "speaker_id": segment.get("speaker_id"),
            "speaker_verified": bool(segment.get("speaker_verified", False)),
        }
        if cue["speaker_verified"] and cue["speaker_id"]:
            cue["speaker"] = str(cue["speaker_id"])
        return cue

    # -------------------------------------------------------------
    # BƯỚC 4: SINH GIỌNG AI & HÒA ÂM MASTER AUDIO
    # -------------------------------------------------------------
    def step4_synthesize_and_mix_audio(self) -> str:
        self.log("Bắt đầu sinh giọng lồng tiếng AI (CapCut + Edge-TTS)...", 55)
        if (load_verified_script(self.metadata.get("sha256", "")) or {}).get("scenes"):
            return self._synthesize_timed_audio()

        cue_audio_files: List[Tuple[Path, float]] = []
        for idx, cue in enumerate(self.adapted_cues):
            eng = cue.get("engine", "capcut")
            text = cue["text"]
            voice = cue.get("voice")
            out_file = self.audio_dir / f"cue_{idx:02d}.mp3"
            cue["audio_file"] = str(out_file)

            success = generate_tts(text, eng, voice, out_file, cue.get("voice_role"))
            if success and out_file.exists():
                cue_audio_files.append((out_file, cue["start"]))
                pct = 55 + int((idx + 1) / len(self.adapted_cues) * 20)
                speaker_label = cue.get("name") or cue.get("speaker") or cue.get("speaker_id") or "Chưa xác định"
                self.log(f"  ✓ [{idx+1}/{len(self.adapted_cues)}] {speaker_label}: '{text[:24]}...'", pct)
            else:
                self.log(f"  ⚠️ Cảnh báo: không sinh được giọng cho câu {idx}: '{text[:20]}...'", 65)

        # Hòa âm Master Audio với SFX và BGM bằng FFmpeg
        self.log("Hòa âm Master Audio (Giọng thoại + Hiệu ứng SFX + Nhạc nền BGM)...", 78)
        sfx_pop = PROJECT_ROOT / "compare_studio" / "shared" / "audio" / "sfx" / "pop.mp3"
        sfx_whoosh = PROJECT_ROOT / "compare_studio" / "shared" / "audio" / "sfx" / "whoosh.mp3"
        sfx_chime = PROJECT_ROOT / "compare_studio" / "shared" / "audio" / "sfx" / "chime.mp3"
        sfx_ding = PROJECT_ROOT / "compare_studio" / "shared" / "audio" / "sfx" / "ding.mp3"
        bgm = PROJECT_ROOT / "compare_studio" / "tools" / "template-kinetic" / "assets" / "audio" / "bgm.mp3"

        # Trước đây ép max(40.0, duration): video 12s vẫn bị kéo thành 40s audio.
        total_dur = float(self.metadata.get("duration") or 0) or 40.0
        inputs = []
        filter_parts = []

        for idx, (fpath, st) in enumerate(cue_audio_files):
            inputs.extend(["-i", str(fpath)])
            delay_ms = int(st * 1000)
            filter_parts.append(f"[{idx}:a]adelay={delay_ms}|{delay_ms},apad,volume=1.35[a{idx}]")

        # Thêm các SFX chuyển cảnh
        extra_count = 0
        extra_labels = ""

        if sfx_pop.exists():
            idx_pop = len(cue_audio_files) + extra_count
            inputs.extend(["-i", str(sfx_pop)])
            filter_parts.append(f"[{idx_pop}:a]adelay=3500|3500,apad,volume=0.9[apop]")
            extra_labels += "[apop]"
            extra_count += 1

        if sfx_whoosh.exists():
            idx_whoosh = len(cue_audio_files) + extra_count
            inputs.extend(["-i", str(sfx_whoosh)])
            mid_ms = int(total_dur * 500)
            filter_parts.append(f"[{idx_whoosh}:a]adelay={mid_ms}|{mid_ms},apad,volume=1.0[awhoosh]")
            extra_labels += "[awhoosh]"
            extra_count += 1

        if sfx_chime.exists():
            idx_chime = len(cue_audio_files) + extra_count
            inputs.extend(["-i", str(sfx_chime)])
            chime_ms = int(total_dur * 800)
            filter_parts.append(f"[{idx_chime}:a]adelay={chime_ms}|{chime_ms},apad,volume=1.0[achime]")
            extra_labels += "[achime]"
            extra_count += 1

        if sfx_ding.exists():
            idx_ding = len(cue_audio_files) + extra_count
            inputs.extend(["-i", str(sfx_ding)])
            end_ms = int((total_dur - 2.0) * 1000)
            filter_parts.append(f"[{idx_ding}:a]adelay={end_ms}|{end_ms},apad,volume=1.0[ading]")
            extra_labels += "[ading]"
            extra_count += 1

        # Nhạc nền BGM
        if bgm.exists():
            idx_bgm = len(cue_audio_files) + extra_count
            inputs.extend(["-i", str(bgm)])
            filter_parts.append(f"[{idx_bgm}:a]atrim=0:{total_dur},volume=0.10,afade=t=out:st={total_dur-2.5}:d=2.5,apad[abgm]")
            extra_labels += "[abgm]"
            extra_count += 1

        all_cue_labels = "".join(f"[a{i}]" for i in range(len(cue_audio_files)))
        filter_parts.append(f"{all_cue_labels}{extra_labels}amix=inputs={len(cue_audio_files) + extra_count}:duration=longest:dropout_transition=2[outa]")

        cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", ";".join(filter_parts), "-map", "[outa]", "-t", str(total_dur), str(self.master_audio_path)]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            self.log(f"Đã tạo thành công Master Audio: {self.master_audio_path.name}", 85)
        except Exception as e:
            self.log(f"Cảnh báo hòa âm: {e}. Tạo audio dự phòng...", 85)
            # Fallback copy first audio or source audio
            if self.source_audio_path.exists():
                shutil.copy2(self.source_audio_path, self.master_audio_path)

        return str(self.master_audio_path)

    # -------------------------------------------------------------
    # BƯỚC 5: TỰ ĐỘNG DỰNG HOẠT HÌNH 2D VECTOR NGHỆ THUẬT & ĐĂNG KÝ
    # -------------------------------------------------------------
    def step5_register_project(self) -> Dict[str, Any]:
        self.log("Đang đăng ký bản dựng và hồ sơ đối chiếu nguồn...", 90)

        animated = STATIC_DIR / f"remake_{self.slug}_animated.html"
        if animated.exists():
            shutil.copy2(animated, self.html_demo_path)
        else:
            self.generate_demo_html()
        profile = self.build_profile()      # hồ sơ nhân vật để lồng tiếng đa quốc gia
        self.write_project_manifest(profile)

        friendly_name = f"Remake 2D · {self.theme_label} ({self.video_path.name})"

        project_entry = {
            "id": self.slug,
            "name": friendly_name,
            "source": self.video_path.name,
            # sha256 + renderer + profile là dữ liệu hệ lồng tiếng cần.
            "source_sha256": self.metadata.get("sha256", ""),
            "renderer": "character-rig",
            "duration": round(float(self.metadata.get("duration", 0)), 1),
            "demo_url": f"/static/remake_{self.slug}_demo.html",
            "audio_url": f"/static/remake_{self.slug}_master.mp3",
            "locales": ["vi-VN"],
            "cues_count": len(self.adapted_cues),
            "keyframes_count": 0,
            "theme": self.detected_theme,
            "theme_label": self.theme_label,
            "script_source": self.script_source,
            "script_source_label": SCRIPT_SOURCE_LABEL.get(self.script_source, self.script_source),
            "fidelity": "needs_visual_review",
            "style": "2D Cartoon Native Canvas",
            "voice": " + ".join(sorted({c.get("voice", "unknown") for c in self.adapted_cues})),
            "fps": 30,
            "badge": "BẢN DỰNG · CHỜ DUYỆT HÌNH",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        register_project(project_entry)
        self.log(f"🎉 Hoàn thành Remake cho {self.video_path.name} · chủ đề {self.theme_label}!", 100)
        return project_entry

    def _synthesize_timed_audio(self) -> str:
        try:
            from bkt_web.remake_localization import _atempo_chain
        except ImportError:
            from remake_localization import _atempo_chain
        inputs, filters, labels = [], [], []
        cache_file = self.audio_dir / "cache.json"
        cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
        for index, cue in enumerate(self.adapted_cues):
            out = self.audio_dir / f"cue_{index:02d}.mp3"
            signature = hashlib.sha256(json.dumps([cue["text"], cue.get("engine"), cue.get("voice"), cue.get("voice_role")], ensure_ascii=False).encode()).hexdigest()
            success = cache.get(str(index)) == signature and out.exists() and out.stat().st_size > 1000
            for attempt in range(3):
                if success:
                    break
                success = generate_tts(cue["text"], cue.get("engine", "edge"), cue.get("voice"), out, cue.get("voice_role"), allow_fallback=False)
                if not success and attempt < 2:
                    time.sleep(2)
            if not success:
                raise RuntimeError(f"Không sinh được giọng câu {index + 1}; dừng để tránh bản thiếu thoại")
            cache[str(index)] = signature
            _atomic_write_json(cache_file, cache)
            probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(out)], capture_output=True, text=True, check=True)
            length = float(json.loads(probe.stdout)["format"]["duration"])
            slot = float(cue["end"]) - float(cue["start"])
            speed = max(1.0, length / slot)
            if speed > 1.8:
                raise ValueError(f"Câu {index + 1} quá dài cho nhịp nguồn; cần rút gọn bản dịch")
            inputs += ["-i", str(out)]
            delay = round(float(cue["start"]) * 1000)
            filters.append(f"[{index}:a]{_atempo_chain(speed)},atrim=0:{slot},asetpts=PTS-STARTPTS,adelay={delay}:all=1,apad[a{index}]")
            labels.append(f"[a{index}]")
            cue["audio_file"] = str(out)
            cue["audio_tempo"] = speed
            self.log(f"Giọng {cue.get('speaker')}: câu {index + 1}/{len(self.adapted_cues)}", 55 + int(20 * (index + 1) / len(self.adapted_cues)))
        if not inputs:
            raise ValueError("Storyboard chưa có lời thoại")
        filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,alimiter=limit=0.95:latency=1[outa]")
        subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[outa]", "-t", str(self.metadata["duration"]), str(self.master_audio_path)], check=True, capture_output=True)
        _atomic_write_json(self.job_dir / "cues.json", self.adapted_cues)
        return str(self.master_audio_path)

    def build_profile(self) -> Dict[str, Any]:
        """Dựng hồ sơ nhân vật đúng schema mà remake_localization cần."""
        characters: Dict[str, Dict[str, Any]] = {}
        for cue in self.adapted_cues:
            cid = cue.get("speaker") or cue.get("speaker_id")
            if not cid:
                continue
            if cid not in characters:
                characters[cid] = {
                    "id": cid,
                    "name": cue.get("name", cid),
                    "voice_role": cue.get("voice_role", "young_1"),
                    "avatar": cue.get("avatar", "🎭"),
                    "evidence": [],
                }
            characters[cid]["evidence"].append(cue.get("start", 0))

        return {
            "id": self.slug,
            "renderer": f"/static/remake_{self.slug}_demo.html",
            "default_audio_url": f"/static/remake_{self.slug}_master.mp3",
            "default_locale": "vi-VN",
            "duration": float(self.metadata.get("duration", 0)),
            "theme": self.detected_theme,
            "theme_label": getattr(self, "theme_label", self.detected_theme),
            "script_source": getattr(self, "script_source", "unknown"),
            "source_sha256": self.metadata.get("sha256", ""),
            "characters": list(characters.values()),
            "cues": [
                {
                    "start": c["start"], "end": c["end"],
                    "speaker": c.get("speaker") or c.get("speaker_id"),
                    "text": c["text"],
                }
                for c in self.adapted_cues
            ],
        }

    def _build_manifest(self, profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Build the public manifest and an auditable fidelity verdict."""
        if profile is None:
            profile = self.build_profile()

        violations: List[str] = []
        for index, cue in enumerate(self.adapted_cues):
            original = str(cue.get("original_text", cue.get("text", ""))).strip()
            rendered = str(cue.get("text", "")).strip()
            if original != rendered and not cue.get("translation_verified"):
                violations.append(f"Câu {index + 1} không còn nguyên văn so với transcript nguồn")
            if cue.get("speaker") and not cue.get("speaker_verified", self.script_source == "verified"):
                violations.append(f"Câu {index + 1} có người nói chưa được xác minh")

        for index, frame in enumerate(self.vector_frames):
            if frame.get("provenance") != "quantized-from-source-frame":
                violations.append(f"Frame vector {index + 1} không có nguồn gốc từ frame video")

        return {
            "id": self.slug,
            "duration": profile["duration"],
            "theme": self.detected_theme,
            "theme_label": getattr(self, "theme_label", self.detected_theme),
            "script_source": getattr(self, "script_source", "unknown"),
            "source_sha256": self.metadata.get("sha256", ""),
            "characters": profile["characters"],
            "cues": self.adapted_cues,
            "vector_frames": self.vector_frames,
            "scenes": (load_verified_script(self.metadata.get("sha256", "")) or {}).get("scenes", []),
            "fidelity": {
                "status": "failed" if violations else "needs_visual_review",
                "script_checked": not violations,
                "violations": violations,
            },
            "localizations": {
                "vi-VN": {
                    "status": "ready",
                    "audio_url": f"/static/remake_{self.slug}_master.mp3",
                    "country": "Việt Nam",
                }
            },
        }

    def write_project_manifest(self, profile: Dict[str, Any]) -> None:
        """Ghi manifest + profile vào thư mục công khai của project."""
        self.public_dir.mkdir(parents=True, exist_ok=True)
        (self.public_dir / "profile.json").write_text(
            json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        manifest = self._build_manifest(profile)
        # `manifest.json` dành riêng cho evidence manifest UV-804. Hồ sơ cũ
        # vẫn được giữ để localization đọc, nhưng không được giả làm manifest.
        (self.public_dir / "project.json").write_text(
            json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )

    def generate_demo_html(self, force: bool = True) -> str:
        """Dựng trang HTML5 Canvas 2D theo chủ đề đã nhận dạng được từ nội dung."""
        if not force and self.html_demo_path.exists():
            return str(self.html_demo_path)

        templates_dir = BASE_DIR / "remake_templates"
        # Chỉ dựa vào detected_theme — trước đây chỗ này dò lại tên file lần thứ tư
        # và có thể cho kết quả khác hẳn với kịch bản đã dựng ở bước 3.
        template_file = templates_dir / f"{THEME_TEMPLATE.get(self.detected_theme, 'universal')}_template.html"
        if not template_file.exists():
            template_file = templates_dir / "universal_template.html"
        if not template_file.exists():
            # Chưa có template trung tính thì mượn tạm template có sẵn bất kỳ.
            available = sorted(templates_dir.glob("*_template.html"))
            template_file = available[0] if available else STATIC_DIR / "remake_peanut_test_demo.html"

        if template_file.exists():
            try:
                with open(template_file, "r", encoding="utf-8") as f:
                    html = f.read()

                dur = round(float(self.metadata.get("duration", 46.5)), 1)
                cues_js = json.dumps(self.adapted_cues, ensure_ascii=False, indent=6)

                # Thay thế Title & Tiêu đề
                html = re.sub(r"<title>.*?</title>", f"<title>Remake 2D: {self.video_path.name} (TokMatrix Vector)</title>", html)
                html = re.sub(r'<span class="nav-title">.*?</span>', f'<span class="nav-title">Hoạt Hình 2D: {self.video_path.name}</span>', html)
                html = re.sub(r'<h2 class="panel-h2">.*?</h2>', f'<h2 class="panel-h2">✨ Kịch Bản Việt Hóa Đa Vai ({self.video_path.name})</h2>', html)

                # Thay thế Audio URL (hỗ trợ cả id="master-audio" lẫn id="masterAudio")
                audio_src = f"/static/remake_{self.slug}_master.mp3"
                html = re.sub(r'(<audio\s+id=["\'](?:master-audio|masterAudio)["\'][^>]*?\ssrc=)["\'][^"\']*["\']', rf'\1"{audio_src}"', html)

                # Thay thế Mảng CUES (hỗ trợ cả const CUES lẫn const cues).
                # Template universal khai báo sẵn cả `const CUES = [...]` lẫn
                # `const cues = CUES;`. Chèn thêm alias khi nó đã có sẽ thành
                # khai báo trùng -> SyntaxError -> cả trang hoạt hình đứng im.
                # Vì vậy chỉ thêm alias khi template chưa có, và hai nhánh loại
                # trừ nhau. Dùng lambda cho re.sub để chuỗi JSON có dấu gạch
                # chéo ngược không bị hiểu thành nhóm thay thế.
                has_lower_alias = re.search(r"const\s+cues\s*=\s*CUES\s*;", html) is not None
                has_upper_alias = re.search(r"const\s+CUES\s*=\s*cues\s*;", html) is not None

                if re.search(r"const\s+CUES\s*=\s*\[.*?\];", html, flags=re.DOTALL):
                    repl = f"const CUES = {cues_js};"
                    if not has_lower_alias:
                        repl += " const cues = CUES;"
                    html = re.sub(r"const\s+CUES\s*=\s*\[.*?\];", lambda _m: repl, html, flags=re.DOTALL)
                elif re.search(r"const\s+cues\s*=\s*\[.*?\];", html, flags=re.DOTALL):
                    repl = f"const cues = {cues_js};"
                    if not has_upper_alias:
                        repl += " const CUES = cues;"
                    html = re.sub(r"const\s+cues\s*=\s*\[.*?\];", lambda _m: repl, html, flags=re.DOTALL)

                # Thay thế Thời lượng
                html = re.sub(r"const\s+totalDuration\s*=\s*[0-9.]+;", f"const totalDuration = {dur};", html)

                # Sinh động hóa thẻ nhân vật (Cast Cards) theo kịch bản thực tế
                unique_speakers = {}
                for c in self.adapted_cues:
                    spk = c.get("speaker", "char")
                    if spk not in unique_speakers:
                        unique_speakers[spk] = {
                            "name": c.get("name", spk),
                            "avatar": c.get("avatar", "🌟"),
                            "voice": f"{c.get('engine', 'TTS')} · {c.get('voice', '')}"
                        }
                if unique_speakers:
                    cards_html = ""
                    for spk, meta in unique_speakers.items():
                        cards_html += f"""
        <div class="cast-card">
          <div class="cast-avatar">{meta['avatar']}</div>
          <div>
            <div class="cast-name">{meta['name']}</div>
            <div class="cast-voice">{meta['voice']}</div>
          </div>
        </div>"""
                    html = re.sub(r'<div class="cast-grid">.*?</div>\s*<!-- Timeline Cues -->', f'<div class="cast-grid">{cards_html}\n      </div>\n\n      <!-- Timeline Cues -->', html, flags=re.DOTALL)

                with open(self.html_demo_path, "w", encoding="utf-8") as f:
                    f.write(html)

                self.log(f"Đã tự động khởi tạo giao diện 2D Canvas: {self.html_demo_path.name}", 95)
                return str(self.html_demo_path)
            except Exception as e:
                self.log(f"Cảnh báo sinh HTML demo: {e}", 95)
        return ""

    # -------------------------------------------------------------
    # BƯỚC 6: XUẤT VIDEO PREVIEW MP4 (source video + audio master)
    # -------------------------------------------------------------
    def step6_export_preview_video(self) -> Optional[str]:
        """Ghép video nguồn với audio master đã lồng tiếng thành MP4 mới.

        Kết quả là video 9:16, giữ hình ảnh gốc nhưng thay toàn bộ âm thanh
        bằng bản lồng tiếng đa vai. File này sẵn sàng đăng TikTok.
        """
        self.log("Đang xuất video preview MP4 (hình gốc + audio lồng tiếng)...", 93)
        preview_path = STATIC_DIR / f"remake_{self.slug}_preview.mp4"

        if not self.master_audio_path.exists():
            self.log("Bỏ qua xuất video: chưa có audio master", 93)
            return None

        # Tìm file source gốc trong thư mục public
        source_video = self.public_dir / f"source{self.video_path.suffix.lower()}"
        if not source_video.exists():
            source_video = self.video_path  # dùng file gốc ban đầu

        if not source_video.exists():
            self.log("Bỏ qua xuất video: không tìm thấy video nguồn", 93)
            return None

        try:
            cmd = [
                "ffmpeg", "-y",
                "-i", str(source_video),
                "-i", str(self.master_audio_path),
                "-map", "0:v:0",           # lấy video từ source
                "-map", "1:a:0",           # lấy audio từ master
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                "-shortest",               # cắt theo track ngắn hơn
                str(preview_path),
            ]
            subprocess.run(cmd, capture_output=True, check=True, timeout=120)
            if preview_path.exists() and preview_path.stat().st_size > 10000:
                size_mb = round(preview_path.stat().st_size / (1024 * 1024), 2)
                self.log(f"Đã xuất video preview: {preview_path.name} ({size_mb} MB)", 96)
                return str(preview_path)
        except Exception as e:
            self.log(f"Cảnh báo xuất video: {e}. Bỏ qua bước này.", 96)

        return None

    # -------------------------------------------------------------
    # BƯỚC 7: TẠO TASK THUMBNAIL CHO ANTIGRAVITY BRIDGE (tuỳ chọn)
    # -------------------------------------------------------------
    def step7_request_thumbnail(self) -> Optional[Dict[str, Any]]:
        """Tạo task sinh thumbnail/poster cho Antigravity IDE.

        Nếu bridge có sẵn và image queue đang chạy, đặt một task kiểu
        'remake_thumbnail' để agent trong IDE tạo poster cho video này.
        Task này không chặn pipeline — nó chạy bất đồng bộ.
        """
        self.log("Kiểm tra Antigravity bridge để tạo poster/thumbnail...", 97)

        try:
            import urllib.request
            import urllib.error

            base_url = os.environ.get("TOKMATRIX_URL", "http://127.0.0.1:8080")
            theme_label = getattr(self, "theme_label", self.detected_theme)
            cue_texts = " · ".join(c.get("text", "")[:30] for c in self.adapted_cues[:3])

            prompt = (
                f"Minh họa hoạt hình 2D phong cách TikTok cho video '{theme_label}'. "
                f"Nội dung: {cue_texts}. "
                "Phong cách: cute, colorful, vector art, chibi characters, "
                "nền gradient pastel, không chữ, không watermark. "
                "Tỉ lệ 9:16, chất lượng cao."
            )

            payload = json.dumps({
                "prompt": prompt,
                "aspect_ratio": "9:16",
                "engine": "antigravity",
                "notes": f"Poster cho remake project {self.slug}",
            }).encode()

            req = urllib.request.Request(
                f"{base_url}/api/ai-images/queue",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                result = json.load(resp)

            if result.get("success"):
                task_id = result.get("task", {}).get("id", "?")
                self.log(f"Đã tạo task Antigravity poster (ID: {task_id})", 98)
                return result.get("task")
        except Exception as e:
            self.log(f"Bỏ qua Antigravity poster: {e}", 98)

        return None

    # -------------------------------------------------------------
    # VISION-DRIVEN REMAKE: AI phân tích → Canvas tự vẽ
    # -------------------------------------------------------------
    def vision_remake_flow(self) -> Optional[Dict[str, Any]]:
        """Luồng remake thông minh: Gemini Vision phân tích video gốc → trả
        draw_params → Canvas tự vẽ nhân vật + nền + animation (nhép môi,
        chớp mắt, chuyển động). Không dùng API sinh ảnh bên ngoài.
        """
        try:
            from bkt_web.remake_vision import extract_keyframes, analyze_with_vision
            from bkt_web.remake_composer import compose_animated_video
        except ImportError:
            try:
                from remake_vision import extract_keyframes, analyze_with_vision
                from remake_composer import compose_animated_video
            except ImportError as exc:
                self.log(f"Thiếu module remake mới: {exc}", 40)
                return None

        storyboard = load_verified_script(self.metadata.get("sha256", "")) or {}
        if storyboard.get("scenes") and storyboard.get("characters"):
            from bkt_web.character_bible import apply_performance_plan
            storyboard = apply_performance_plan({**storyboard, "cues": self.adapted_cues})
            preview = STATIC_DIR / f"remake_{self.slug}_preview.mp4"
            result = compose_animated_video(
                project_slug=self.slug, characters=storyboard["characters"],
                scenes=storyboard["scenes"], cues=storyboard["cues"],
                audio_path=self.master_audio_path, output_path=preview,
                duration=float(self.metadata["duration"]),
                sprite_dir=self.job_dir / "sprites", log=self.log,
            )
            return {
                "status": "completed" if result else "render_failed",
                "renderer": storyboard.get("renderer", storyboard["scenes"][0].get("renderer", "storyboard")),
                "animated_html": f"/static/remake_{self.slug}_animated.html",
                **({"preview_url": f"/static/{preview.name}", "preview_path": str(preview)} if result else {}),
            }

        # 1. Trích keyframe
        kf_dir = self.job_dir / "vision_keyframes"
        duration = self.metadata.get("duration", 30)
        keyframes = extract_keyframes(
            self.video_path, kf_dir,
            interval_sec=3.0, max_frames=10, log=self.log,
        )
        if not keyframes:
            self.log("Không trích được keyframe — bỏ qua Vision flow", 25)
            return None

        # 2. Gemini Vision phân tích → draw_params
        segments = self.transcription.get("segments", [])
        source_lang = self.transcription.get("language", "auto")
        vision_data = analyze_with_vision(
            keyframes, segments, source_lang, log=self.log,
        )
        if not vision_data:
            self.log("Vision analysis thất bại — dùng pipeline cũ", 35)
            return None

        # Lưu vision data
        vision_path = self.job_dir / "vision_analysis.json"
        vision_path.write_text(json.dumps(vision_data, ensure_ascii=False, indent=2))

        characters = vision_data.get("characters", [])
        scenes = vision_data.get("scenes", [])
        char_names = ", ".join(c.get("name", "?") for c in characters)
        self.log(f"Vision: {len(characters)} nhân vật ({char_names}), {len(scenes)} cảnh", 45)

        # 3. Gán character_id cho mỗi cue
        for cue in self.adapted_cues:
            if "character_id" not in cue and characters:
                speaker = cue.get("speaker_id", cue.get("speaker", ""))
                matched = next((c for c in characters if c["id"] == speaker), None)
                if matched:
                    cue["character_id"] = matched["id"]
                else:
                    raise ValueError("Chưa xác minh nhân vật nói; cần duyệt storyboard trước khi dựng")

        # 4. Chưa có sprite thì giao cho Antigravity vẽ nhân vật + đo rig mặt.
        #    Agent chạy bất đồng bộ nên pipeline không chờ: project dừng ở trạng
        #    thái waiting_antigravity, `antigravity_remake.py complete` sẽ dựng
        #    video và cập nhật registry khi bài nộp về.
        sprite_dir = self.job_dir / "sprites"
        has_sprites = sprite_dir.exists() and any(
            f.suffix.lower() in (".png", ".webp") for f in sprite_dir.glob("*.*")
        )
        if not has_sprites and os.environ.get("REMAKE_ANTIGRAVITY", "1") != "0":
            try:
                try:
                    from bkt_web import remake_bridge
                except ImportError:
                    import remake_bridge

                task = remake_bridge.create_task(
                    slug=self.slug,
                    video_path=self.video_path,
                    keyframes=keyframes,
                    characters=characters,
                    scenes=scenes,
                    cues=self.adapted_cues,
                    audio_path=self.master_audio_path,
                    duration=duration,
                    job_dir=self.job_dir,
                    project_name=getattr(self, "theme_label", self.slug),
                    log=self.log,
                )
                self.log(
                    "Chờ Antigravity vẽ nhân vật — xem việc bằng "
                    "`python3 bkt_web/antigravity_remake.py list`",
                    75,
                )
                return {
                    "status": "waiting_antigravity",
                    "bridge_task_id": task["task_id"],
                    "bridge_inbox": task["inbox_md"],
                    "bridge_outbox": task["output_dir"],
                    "vision_data": vision_data,
                }
            except Exception as exc:
                self.log(f"Không tạo được task Antigravity: {str(exc)[:120]}", 75)

        # 5. Đã có sprite -> dựng luôn
        self.log("Canvas đang vẽ nhân vật + nền từ draw_params (nhép môi + chớp mắt)...", 65)
        preview_path = STATIC_DIR / f"remake_{self.slug}_preview.mp4"

        result = compose_animated_video(
            project_slug=self.slug,
            characters=characters,
            scenes=scenes,
            cues=self.adapted_cues,
            audio_path=self.master_audio_path,
            output_path=preview_path,
            duration=duration,
            sprite_dir=sprite_dir if sprite_dir.exists() else None,
            log=self.log,
        )

        if result and result.exists():
            size_mb = round(result.stat().st_size / (1024 * 1024), 2)
            self.log(f"✅ Video remake hoàn tất: {result.name} ({size_mb} MB)", 98)
            return {
                "preview_url": f"/static/remake_{self.slug}_preview.mp4",
                "preview_path": str(result),
                "animated_html": f"/static/remake_{self.slug}_animated.html",
                "vision_data": vision_data,
            }

        self.log("Video export chưa thành công — dùng animated HTML trên trình duyệt", 95)
        return {
            "animated_html": f"/static/remake_{self.slug}_animated.html",
            "vision_data": vision_data,
        }

    # -------------------------------------------------------------
    # CHẠY TOÀN BỘ QUY TRÌNH (1-CLICK EXECUTION)
    # -------------------------------------------------------------
    def assess_automatic_route(self) -> Dict[str, Any]:
        """Nguồn chưa có kịch bản duyệt có tự dựng được không, và vì sao không.

        Chạy đường v2 (UV-801 → UV-304 → UV-502 → UV-104) chỉ để **phán
        quyết**: không TTS, không render, không đụng gì tới đường kịch bản đã
        duyệt. Mọi lỗi của tầng v2 đều trở thành một lý do needs_review chứ
        không được phép làm hỏng luồng hiện có.
        """
        try:
            from bkt_web.pipeline_route import assess_source

            verdict = assess_source(
                str(self.video_path),
                transcription=self.transcription or None,
                created_at=time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
            )
            return verdict.as_dict()
        except Exception as exc:  # noqa: BLE001 - cổng đánh giá không bao giờ được chặn pipeline
            return {
                "schema": "tokmatrix.pipeline-route/v1",
                "ok": False,
                "status": "needs_review",
                "summary": f"không đánh giá được đường tự động: {str(exc)[:200]}",
                "reason_codes": ["ANALYSIS_FAILED"],
                "reasons": [str(exc)[:500]],
            }

    def attach_render_evidence(
        self,
        result: Dict[str, Any],
        storyboard: Dict[str, Any],
        *,
        reference_storyboard: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Kiểm bản dựng vừa xuất và ghi manifest cạnh project.

        `completion_claim` do bằng chứng quyết định (UV-603), nên một project
        có fidelity thất bại sẽ **không** mang nhãn hoàn chỉnh. Mọi lỗi của
        tầng bằng chứng chỉ làm project mất manifest, không được phép xoá bản
        dựng hay đổi kết quả thành công thành thất bại một cách âm thầm.
        """
        try:
            from bkt_web.render_evidence import (
                asset_records_from_storyboard,
                build_project_evidence,
                fallback_records_from_storyboard,
                geometric_evidence,
                renderer_plan_evidence,
                structural_evidence,
                verify_output_video,
                write_manifest,
            )
            from bkt_web.render_manifest import RendererRecord
            from bkt_web.storyboard_migration import migrate_v1_to_v2

            video = result.get("preview_path")
            if not video or not Path(video).is_file():
                result["manifest_status"] = "not_rendered"
                return result

            source_hash = str(self.metadata.get("sha256") or "")
            # Kịch bản đã xác minh không lưu `duration`; validate_story bắt buộc
            # có. Lấy mốc kết thúc scene cuối (giữ nguyên thời gian scene nguồn;
            # ffprobe lệch vài µs sẽ làm hỏng SCENE_COVERAGE_END), chỉ dùng độ dài
            # video nguồn khi không có scene. Chỉ sửa trên bản sao.
            source_duration = self.metadata.get("duration")

            def _with_duration(story: Dict[str, Any]) -> Dict[str, Any]:
                if story.get("duration") is not None:
                    return story
                ends = [s.get("end_time") for s in story.get("scenes") or [] if isinstance(s.get("end_time"), (int, float))]
                duration = max(ends) if ends else source_duration
                if duration is None:
                    return story
                return {**story, "duration": float(duration)}

            storyboard = _with_duration(storyboard)
            if reference_storyboard is not None:
                reference_storyboard = _with_duration(reference_storyboard)
            v2 = migrate_v1_to_v2(storyboard, source_sha256=source_hash if len(source_hash) == 64 else None)
            reference_v2 = migrate_v1_to_v2(
                reference_storyboard if reference_storyboard is not None else storyboard,
                source_sha256=source_hash if len(source_hash) == 64 else None,
            )
            renderer_id = str(result.get("renderer") or "native-vector-v1")
            outcomes = [
                structural_evidence(reference_v2, v2, allow_equal_snapshots=True),
                renderer_plan_evidence(v2, renderer_id),
                verify_output_video(
                    video,
                    expected_duration=float(self.metadata.get("duration") or v2["duration_seconds"]),
                    source_path=str(self.video_path),
                ),
                geometric_evidence(v2),
            ]
            renderer_version = "1.0.0"
            frame_mode = "host-callback"
            try:
                from bkt_web.renderer_adapters import get_adapter

                adapter = get_adapter(renderer_id)
                renderer_version = adapter.renderer_version
                frame_mode = adapter.frame_mode
            except KeyError:
                pass
            evidence = build_project_evidence(
                manifest_id=f"manifest.{self.slug}".replace("_", "."),
                created_at=time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                storyboard=v2,
                renderers=[RendererRecord(
                    renderer_id=renderer_id,
                    version=renderer_version,
                    scene_ids=tuple(item["scene_id"] for item in v2["scenes"]),
                    frame_mode=frame_mode,
                )],
                outcomes=outcomes,
                assets=asset_records_from_storyboard(v2) if renderer_id == "native-vector-v1" else (),
                fallbacks=fallback_records_from_storyboard(v2),
            )
            self.public_dir.mkdir(parents=True, exist_ok=True)
            write_manifest(self.public_dir, evidence)
            result["manifest_url"] = f"/static/remake_projects/{self.slug}/manifest.json"
            result["manifest_status"] = "written"
            result["completion_claim"] = evidence.completion_claim
            if evidence.complete:
                result["fidelity"] = "passed"
                result["badge"] = "HOÀN CHỈNH · ĐÃ KIỂM BẰNG CHỨNG"
            else:
                result["fidelity"] = "needs_review"
                result["badge"] = "CHƯA ĐỦ BẰNG CHỨNG HOÀN CHỈNH"
            self.log(f"Bằng chứng bản dựng: {evidence.completion_claim}", 97)
        except Exception as exc:  # noqa: BLE001 - thiếu bằng chứng không được xoá bản dựng
            result["manifest_status"] = "failed"
            result["manifest_error"] = str(exc)[:300]
            result["completion_claim"] = "needs-review"
            result["fidelity"] = "needs_review"
            self.log(f"Không thu được bằng chứng bản dựng: {str(exc)[:160]}", 97)
        return result

    def _try_auto_render_v2(self, route: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """UV-900: tự render v2 khi route thành công với draw-list renderer.

        Trả result nếu thành công, None nếu thất bại (caller sẽ rơi vào
        needs_review). Không bao giờ dùng lại footage nguồn hay trả file rỗng.
        """
        try:
            from bkt_web.renderer_adapters import get_adapter
            from bkt_web.frame_exporter import export_scene_to_mp4

            storyboard_v2 = route["storyboard"]
            render_plan = route.get("render_plan", {})
            selections = render_plan.get("selections", [])

            # Tìm renderer draw-list đầu tiên có thể dựng
            renderer_id = None
            for sel in selections:
                if sel.get("status") == "rejected":
                    continue
                try:
                    adapter = get_adapter(sel.get("renderer_id", ""))
                    if adapter.frame_mode == "draw-list":
                        renderer_id = sel["renderer_id"]
                        break
                except (KeyError, Exception):
                    continue

            if renderer_id is None:
                self.log("Route OK nhưng không có draw-list renderer; cần review", 50)
                return None

            adapter = get_adapter(renderer_id)
            scenes = storyboard_v2.get("scenes", [])
            if not scenes:
                self.log("Storyboard v2 không có scene nào", 50)
                return None

            self.log(f"Tự dựng v2 bằng {renderer_id} ({len(scenes)} scene)...", 55)

            # Generate placeholders for missing assets (UV-902)
            asset_gaps = route.get("asset_gaps", [])
            if asset_gaps:
                try:
                    from bkt_web.asset_generator import generate_placeholders, inject_generated_assets
                    gen_result = generate_placeholders(asset_gaps)
                    if gen_result.assets:
                        storyboard_v2 = inject_generated_assets(storyboard_v2, gen_result)
                        self.log(f"Đã sinh {len(gen_result.assets)} asset placeholder", 58)
                except Exception as exc:
                    self.log(f"Không sinh được asset placeholder: {str(exc)[:100]}", 58)

            # One project-level identity source, then a finite seek-safe motion
            # clip for every character that has no authored pose track.
            from bkt_web.character_bible import apply_character_bible, build_character_bible, save_character_bible
            from bkt_web.motion_library import apply_motion_library
            bible = build_character_bible(storyboard_v2, project_id=self.slug)
            storyboard_v2 = apply_character_bible(storyboard_v2, bible)
            storyboard_v2 = apply_motion_library(storyboard_v2)
            save_character_bible(self.public_dir / "character_bible.json", bible)
            scenes = storyboard_v2.get("scenes", [])
            self.log(f"Đã khóa nhận dạng {len(bible['characters'])} nhân vật và áp motion library", 59)

            # Compile + export từng scene
            import tempfile
            from bkt_web.universal_storyboard import Scene

            compiled_scenes = []
            reference_storyboard = json.loads(json.dumps(storyboard_v2))
            output_path = self.public_dir / "remake.mp4"

            # Nếu chỉ 1 scene: export thẳng
            # Nếu nhiều scene: export từng cái rồi ghép
            with tempfile.TemporaryDirectory() as workdir:
                scene_mp4s = []
                for i, scene_data in enumerate(scenes):
                    self.log(f"Scene {i + 1}/{len(scenes)}: {scene_data.get('scene_id', '?')}", 60 + i * 5)
                    try:
                        scene_obj = Scene(**{k: v for k, v in scene_data.items()
                                           if k in Scene.__dataclass_fields__}) if isinstance(scene_data, dict) else scene_data
                        compiled = adapter.compile(scene_obj, canvas="9:16")
                        scene_path = Path(workdir) / f"scene_{i:03d}.mp4"
                        export_result = export_scene_to_mp4(
                            adapter, compiled, scene_path,
                            workdir=Path(workdir) / f"frames_{i:03d}",
                        )
                        scene_mp4s.append(str(scene_path))
                        compiled_scenes.append(compiled)
                    except Exception as exc:
                        self.log(f"Scene {i + 1} render lỗi: {str(exc)[:120]}", 65)
                        return None  # Render lỗi → needs_review, không fallback

                if not scene_mp4s:
                    return None

                # Ghép các scene MP4
                if len(scene_mp4s) == 1:
                    import shutil
                    shutil.copy2(scene_mp4s[0], output_path)
                else:
                    concat_list = Path(workdir) / "concat.txt"
                    concat_list.write_text(
                        "\n".join(f"file '{p}'" for p in scene_mp4s), encoding="utf-8"
                    )
                    import subprocess
                    subprocess.run(
                        ["ffmpeg", "-nostdin", "-v", "error", "-y",
                         "-f", "concat", "-safe", "0", "-i", str(concat_list),
                         "-c", "copy", str(output_path)],
                        capture_output=True, check=True, timeout=300,
                    )

            if not output_path.is_file() or output_path.stat().st_size < 1024:
                self.log("Video xuất quá nhỏ hoặc không tồn tại", 90)
                return None

            self.log(f"Đã xuất video v2: {output_path.stat().st_size} bytes", 90)

            # Register project
            result = {
                "id": self.slug,
                "name": f"Auto v2 · {self.video_path.name}",
                "source": self.video_path.name,
                "source_sha256": self.metadata.get("sha256"),
                "status": "rendered_v2",
                "renderer": renderer_id,
                "badge": "BẢN DỰNG TỰ ĐỘNG V2",
                "fidelity": "needs_review",
                "duration": self.metadata.get("duration"),
                "cues_count": len(self.adapted_cues),
                "preview_url": f"/static/remake_projects/{self.slug}/remake.mp4",
                "preview_path": str(output_path),
                "locales": [],
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "route_status": route.get("status"),
                "route_reason_codes": [],
            }

            # Attach evidence manifest (UV-804)
            self.attach_render_evidence(result, storyboard_v2, reference_storyboard=reference_storyboard)

            register_project(result)
            return result

        except Exception as exc:
            self.log(f"Auto-render v2 thất bại: {str(exc)[:200]}; chuyển sang needs_review", 50)
            return None

    def run_all(self) -> Dict[str, Any]:
        self.step1_analyze_and_extract()
        self.step2_transcribe()
        self.step3_adapt_vietnamese_script()
        storyboard = load_verified_script(self.metadata.get("sha256", "")) or {}
        if not storyboard.get("scenes") or not storyboard.get("characters"):
            self.public_dir.mkdir(parents=True, exist_ok=True)
            route = self.assess_automatic_route()

            # UV-900: nếu route thành công với draw-list renderer → tự render v2
            if route.get("ok") and route.get("storyboard"):
                v2_result = self._try_auto_render_v2(route)
                if v2_result is not None:
                    return v2_result

            # Route không thành công hoặc render v2 thất bại → needs_review
            review = {
                "source_sha256": self.metadata.get("sha256"),
                "duration": self.metadata.get("duration"),
                "transcript": self.transcription,
                "library_url": "/api/remake/library",
                "examples_url": "/static/remake_vector_examples.json",
                "cues": self.adapted_cues,
                "characters": storyboard.get("characters", []),
                "scenes": storyboard.get("scenes", []),
                "automatic_route": route,
                "requirements": ["Xác minh người nói từng câu", "Duyệt bản dịch tiếng Việt", "Đo mốc cảnh và hành động từ video nguồn", "Cảnh tổng quát cần poses: {character_id: [{time, x, y, height, rotation, drawing_id?}]} với toạ độ canvas 576x1024", "Native-vector-v1 dùng asset trong /api/remake/library, không cần sprite. Renderer sprite cũ cần ảnh vẽ mới; không dùng frame nguồn làm nền", "Chế độ hand-drawn-canvas-v1: nộp whole-pose cels <character_id>__<drawing_id>.png, dùng drawing_id tại key/breakdown; cel giữ nguyên trong exposure"],
            }
            if route.get("storyboard"):
                try:
                    from bkt_web.character_bible import build_character_bible, save_character_bible
                    bible = build_character_bible(route["storyboard"], project_id=self.slug)
                    save_character_bible(self.public_dir / "character_bible.json", bible)
                    review["character_review_url"] = f"/api/remake/projects/{self.slug}/characters"
                    review["character_count"] = len(bible["characters"])
                except Exception as exc:
                    review["character_bible_error"] = str(exc)[:300]
            _atomic_write_json(self.public_dir / "review.json", review)
            result = {
                "id": self.slug, "name": f"Chờ duyệt · {self.video_path.name}",
                "source": self.video_path.name, "source_sha256": self.metadata.get("sha256"),
                "status": "needs_review", "fidelity": "needs_review", "badge": "CẦN DUYỆT STORYBOARD",
                "duration": self.metadata.get("duration"), "cues_count": len(self.adapted_cues),
                "review_url": f"/static/remake_projects/{self.slug}/review.json",
                "locales": [], "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "route_status": route.get("status"),
                "route_reason_codes": route.get("reason_codes", []),
            }
            register_project(result)
            self.log(f"Chưa đủ dữ liệu xác minh: {route.get('summary')}", 45)
            return result
        try:
            from bkt_web.remake_composer import validate_timeline
        except ImportError:
            from remake_composer import validate_timeline
        validate_timeline(storyboard["scenes"], self.adapted_cues, storyboard["characters"], float(self.metadata["duration"]))
        # Snapshot trước khi renderer chạy. Structural fidelity so snapshot này
        # với storyboard sau render để phát hiện renderer/composer làm rơi scene,
        # cue, speaker hoặc timing.
        reference_storyboard = json.loads(json.dumps(storyboard))
        self.step4_synthesize_and_mix_audio()

        # Thử Vision-driven remake trước (AI phân tích + sinh ảnh + animation)
        vision_result = None
        try:
            vision_result = self.vision_remake_flow()
        except Exception as exc:
            self.log(f"Vision flow lỗi: {str(exc)[:100]} — dùng pipeline cũ", 80)

        if not vision_result or vision_result.get("status") == "render_failed":
            raise RuntimeError("Dựng storyboard thất bại; không thay bằng video nguồn hoặc báo hoàn chỉnh")

        # Đăng ký project (dù Vision thành công hay không)
        result = self.step5_register_project()

        if vision_result and vision_result.get("status") == "waiting_antigravity":
            # Antigravity đang vẽ nhân vật; video sẽ có sau khi agent nộp bài.
            result.update(vision_result)
            result["renderer"] = "antigravity-pending"
            result["badge"] = "CHỜ ANTIGRAVITY"
        elif vision_result:
            result.update(vision_result)
            result["renderer"] = vision_result.get("renderer", "vision-sprite")
            result["demo_url"] = vision_result["animated_html"]
            result["badge"] = "BẢN DỰNG · CHỜ DUYỆT HÌNH"
            result["fidelity"] = "needs_visual_review"
        else:
            # Fallback: xuất video từ source + audio (pipeline cũ)
            preview = self.step6_export_preview_video()
            if preview:
                result["preview_url"] = f"/static/remake_{self.slug}_preview.mp4"
                result["preview_path"] = preview

        # Bằng chứng cho bản dựng: kiểm chính file vừa xuất rồi đính manifest.
        # Không có bằng chứng thì không được gắn nhãn hoàn chỉnh.
        self.attach_render_evidence(result, storyboard, reference_storyboard=reference_storyboard)

        # step5 ghi registry TRƯỚC khi render xong, nên `preview_url` thêm vào
        # `result` ở trên chỉ nằm trong RAM rồi mất. Đó là lý do tab Remake có
        # file MP4 trên đĩa mà không hiện nút xem video. Ghi lại một lần nữa ở
        # đây, sau khi mọi nhánh đã bổ sung xong kết quả.
        register_project(result)

        # Task Antigravity poster (bất đồng bộ, không chặn)
        if not storyboard.get("scenes"):
            self.step7_request_thumbnail()

        return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline Remake Video 2D Hoạt Hình TikTok")
    parser.add_argument("--input", required=True, help="Đường dẫn file video đầu vào")
    parser.add_argument("--name", help="Mã dự án (slug)")
    args = parser.parse_args()

    pipeline = RemakePipeline(args.input, args.name)
    result = pipeline.run_all()
    print("\n" + "=" * 50)
    print("KẾT QUẢ REMAKE:")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("=" * 50)


if __name__ == "__main__":
    main()
