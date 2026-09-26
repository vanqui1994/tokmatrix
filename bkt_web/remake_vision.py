"""
TokMatrix — Phân tích video bằng Gemini Vision → trả drawing parameters cho Canvas.

Luồng:
  1. Trích keyframe từ video bằng ffmpeg (mỗi ~3s)
  2. Gửi keyframes + transcript cho Gemini Vision
  3. Nhận về draw_params: tham số vẽ cho Canvas (màu sắc, hình dáng, phong cách)
  4. Canvas dùng params này để vẽ nhân vật + nền — không cần sinh ảnh bên ngoài
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

# Fix macOS proxy bug: ::1 trong no_proxy gây crash httpx 0.28
os.environ.pop("NO_PROXY", None)
os.environ.pop("no_proxy", None)

try:
    from bkt_web import key_vault
except ImportError:
    try:
        import key_vault
    except ImportError:
        key_vault = None


def _get_gemini_key() -> Optional[str]:
    if key_vault:
        try:
            return key_vault.get_key("ai.gemini")
        except Exception:
            pass
    return os.environ.get("GEMINI_API_KEY")


# ------------------------------------------------------------------ keyframes


def extract_keyframes(
    video_path: Path,
    output_dir: Path,
    interval_sec: float = 3.0,
    max_frames: int = 12,
    log: Optional[Callable[[str, int], None]] = None,
) -> List[Path]:
    """Trích keyframe từ video bằng ffmpeg, mỗi `interval_sec` giây."""
    output_dir.mkdir(parents=True, exist_ok=True)

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(video_path)],
        capture_output=True, text=True, timeout=15,
    )
    duration = float(json.loads(probe.stdout).get("format", {}).get("duration", 30))
    actual_interval = max(interval_sec, duration / max_frames)

    if log:
        log(f"Trích keyframe mỗi {actual_interval:.1f}s từ video {duration:.1f}s", 20)

    pattern = str(output_dir / "kf_%03d.jpg")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", f"fps=1/{actual_interval},scale=768:-2",
        "-q:v", "3",
        "-frames:v", str(max_frames),
        pattern,
    ]
    subprocess.run(cmd, capture_output=True, timeout=60)

    frames = sorted(output_dir.glob("kf_*.jpg"))
    if log:
        log(f"Đã trích {len(frames)} keyframe", 25)
    return frames


# ------------------------------------------------------------------ vision


def _encode_image_b64(path: Path, max_size: int = 800) -> str:
    """Đọc ảnh, resize nếu cần, trả base64."""
    try:
        from PIL import Image
        import io
        with Image.open(path) as im:
            if max(im.size) > max_size:
                im.thumbnail((max_size, max_size))
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=60)
            return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        return base64.b64encode(path.read_bytes()).decode()


def analyze_with_vision(
    keyframes: List[Path],
    transcript_segments: List[Dict[str, Any]],
    source_lang: str = "auto",
    log: Optional[Callable[[str, int], None]] = None,
) -> Optional[Dict[str, Any]]:
    """Gửi keyframes + transcript cho Gemini Vision → trả drawing parameters.

    Returns JSON với draw_params cho Canvas: màu sắc, hình dáng, phong cách
    để Canvas tự vẽ nhân vật + nền, không cần sinh ảnh bên ngoài.
    """
    api_key = _get_gemini_key()
    if not api_key:
        if log:
            log("Chưa có Gemini API key — bỏ qua Vision analysis", 30)
        return None

    if not keyframes:
        return None

    if log:
        log(f"Đang gửi {len(keyframes)} keyframe cho Gemini Vision phân tích...", 28)

    parts = []
    for kf in keyframes[:10]:
        b64 = _encode_image_b64(kf)
        parts.append({
            "inline_data": {
                "mime_type": "image/jpeg",
                "data": b64,
            }
        })

    transcript_text = "\n".join(
        f"[{s['start']:.1f}s] {s['text']}"
        for s in (transcript_segments or [])[:30]
    )

    prompt = f"""Phân tích video hoạt hình/TikTok này dựa trên các keyframe và lời thoại.
Mục đích: trả về THAM SỐ VẼ (drawing parameters) để Canvas HTML5 tự vẽ lại nhân vật và nền.

TRANSCRIPT ({source_lang}):
{transcript_text}

YÊU CẦU: Trả về JSON object chính xác theo schema sau. Tất cả màu sắc phải là mã hex.
{{
  "characters": [
    {{
      "id": "<slug tiếng Anh, ví dụ: tomato, farmer, little_girl>",
      "name": "<tên tiếng Việt ngắn>",
      "role": "<narrator / young_1 / young_2 / adult>",
      "draw": {{
        "body_type": "<tree / fruit / round / humanoid / tall / blade / blob>",
        "body_color": "#hex màu thân chính",
        "body_color2": "#hex màu gradient thân",
        "skin_color": "#hex màu da mặt",
        "eye_style": "<round / oval / dot / anime>",
        "eye_color": "#hex",
        "has_blush": true/false,
        "blush_color": "#hex",
        "hair_style": "<none / short / long / leaf / spiky / ponytail / bun>",
        "hair_color": "#hex",
        "outfit": "<none / vest / dress / overalls / shirt / apron>",
        "outfit_color": "#hex",
        "accessory": "<none / hat / glasses / bow / crown / scarf / leaf_hat>",
        "accessory_color": "#hex",
        "limb_color": "#hex màu tay chân hoặc thân cây",
        "size_ratio": <0.5 tới 1.5, so với default>
      }}
    }}
  ],
  "scenes": [
    {{
      "index": <số thứ tự 0-based>,
      "characters_present": ["<id nhân vật>"],
      "action": "<hành động ngắn>",
      "mood": "<happy / sad / excited / calm / tense / funny>",
      "draw": {{
        "sky_top": "#hex màu trời trên",
        "sky_bottom": "#hex màu trời dưới",
        "ground_type": "<grass / soil / floor / water / sand / stone / wood>",
        "ground_color": "#hex",
        "ground_color2": "#hex gradient",
        "elements": ["<sun / moon / stars / clouds / trees / flowers / mountains / house / fence / river / rain / snow / bushes>"],
        "time": "<day / night / sunset / dawn>"
      }}
    }}
  ]
}}

RÀNG BUỘC BẮT BUỘC:
- body_type PHẢI chọn đúng:
  • "tree" = cây cối (đu đủ, cây xoài, cây cam...) — vẽ thân cây + tán lá + quả
  • "fruit" = quả/rau (cà chua, dưa hấu, quả cam...) — vẽ tròn mũm mĩm
  • "blade" = dao, kéo, dụng cụ sắc nhọn — vẽ hình lưỡi dao kim loại
  • "humanoid" = người, nông dân — vẽ đầu tròn + thân + tay chân
  • "round" = vật tròn khác (bóng, đồng xu...) — vẽ hình tròn
  • "blob" = dạng amip/không rõ hình
- Nhân vật phải KHỚP với hình ảnh trong keyframe: đúng màu sắc, hình dáng.
- Với body_type "tree": body_color là màu tán lá, limb_color là màu thân gỗ.
- Mỗi nhân vật phải có bộ màu RIÊNG BIỆT, phân biệt rõ ràng.
- Không bịa nhân vật không xuất hiện trong keyframe.
- Tối đa 4 nhân vật.
- Tối đa 6 cảnh.
- scene.elements tối đa 5 phần tử mỗi cảnh."""

    parts.append({"text": prompt})

    try:
        import httpx
    except ImportError:
        if log:
            log("Thiếu httpx — không gọi được Gemini", 30)
        return None

    # Thử nhiều model: env var → 3.5-flash → 2.5-flash
    models_to_try = [
        os.environ.get("TOKMATRIX_GEMINI_MODEL", "gemini-3.5-flash"),
        "gemini-3.5-flash",
        "gemini-2.5-flash",
    ]
    # Deduplicate, giữ thứ tự
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

    parsed = None
    last_error = ""
    for model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        if log:
            log(f"Thử model {model}...", 30)
        for attempt in range(2):
            try:
                res = httpx.post(
                    url,
                    headers={"x-goog-api-key": api_key, "content-type": "application/json"},
                    json={
                        "contents": [{"parts": parts}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "thinkingConfig": {"thinkingBudget": 0},
                        },
                    },
                    timeout=90,
                )
                if res.status_code == 200:
                    text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(text)
                    break
                last_error = f"HTTP {res.status_code} ({model})"
                if res.status_code == 429:
                    break  # Chuyển model khác
                if res.status_code < 500:
                    break
            except Exception as exc:
                last_error = str(exc)[:120]

            if attempt < 1:
                time.sleep(3)

        if parsed:
            break

    if parsed is None:
        if log:
            log(f"Gemini Vision thất bại: {last_error}", 32)
        return None

    # Validate cơ bản
    parsed.setdefault("characters", [])
    parsed.setdefault("scenes", [])
    for c in parsed["characters"]:
        c.setdefault("draw", _default_char_draw())
    for s in parsed["scenes"]:
        s.setdefault("draw", _default_scene_draw())

    if log:
        chars = parsed["characters"]
        scenes = parsed["scenes"]
        names = ", ".join(c.get("name", "?") for c in chars)
        log(f"Vision: {len(chars)} nhân vật ({names}), {len(scenes)} cảnh", 35)

    return parsed


def _default_char_draw() -> Dict[str, Any]:
    """Default draw params khi Vision không trả đủ."""
    return {
        "body_type": "round",
        "body_color": "#e74c3c",
        "body_color2": "#c0392b",
        "skin_color": "#ffeaa7",
        "eye_style": "round",
        "eye_color": "#2d3436",
        "has_blush": True,
        "blush_color": "#fab1a0",
        "hair_style": "none",
        "hair_color": "#2d3436",
        "outfit": "none",
        "outfit_color": "#0984e3",
        "accessory": "none",
        "accessory_color": "#fdcb6e",
        "limb_color": "#2d3436",
        "size_ratio": 1.0,
    }


def _default_scene_draw() -> Dict[str, Any]:
    """Default scene draw params."""
    return {
        "sky_top": "#74b9ff",
        "sky_bottom": "#a29bfe",
        "ground_type": "grass",
        "ground_color": "#00b894",
        "ground_color2": "#00cec9",
        "elements": ["sun", "clouds"],
        "time": "day",
    }
