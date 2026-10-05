"""
TokMatrix — Ghép video MP4 từ Sprite & Canvas animation (AI Remake Engine v5).

Phương pháp:
  1. Nạp sprites (PNG trong suốt) + nền cảnh AI, mã hóa Data URI (base64) để tránh lỗi CORS/file protocol
  2. Tạo HTML từ antigravity_template.html với character & scene metadata
  3. Playwright headless: mở HTML → ghi video 60fps → mux master audio bằng ffmpeg
  4. Fallback nếu Playwright không khả dụng
"""

from __future__ import annotations

import base64
import json
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


TEMPLATE_DIR = Path(__file__).resolve().parent / "remake_templates"
STATIC_DIR = Path(__file__).resolve().parent / "static"


def _file_to_data_uri(path: Path) -> str:
    """Chuyển đổi file ảnh sang data URI base64 để nhúng thẳng vào HTML."""
    if not path.exists():
        return ""
    suffix = path.suffix.lower()
    mime = {".png": "image/png", ".webp": "image/webp"}.get(suffix, "image/jpeg")
    b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def validate_timeline(scenes, cues, characters, duration):
    import math

    ids = {c["id"] for c in characters}
    if len(ids) != len(characters) or any(not isinstance(cid, str) or not cid for cid in ids):
        raise ValueError("ID nhân vật phải duy nhất và không được rỗng")
    if not math.isfinite(duration) or duration <= 0 or not scenes:
        raise ValueError("Thiếu thời lượng hoặc mốc cảnh nguồn")
    previous = 0.0
    for scene in scenes:
        start, end = scene.get("start_time"), scene.get("end_time")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            raise ValueError("Mỗi cảnh cần mốc start_time/end_time từ nguồn")
        if not all(math.isfinite(v) for v in (start, end)) or abs(start - previous) > 0.05 or not 0 <= start < end <= duration + 0.05:
            raise ValueError("Mốc cảnh bị hở, chồng lấn hoặc vượt thời lượng nguồn")
        if not set(scene.get("characters_present", [])) <= ids:
            raise ValueError("Cảnh chứa nhân vật không có trong dàn vai")
        previous = end
    if abs(previous - duration) > 0.05:
        raise ValueError("Mốc cảnh chưa phủ hết video nguồn")
    previous_end = 0.0
    for cue in cues:
        cid = cue.get("character_id") or cue.get("speaker") or cue.get("speaker_id")
        if cid not in ids | {"narrator"}:
            raise ValueError("Chưa xác minh nhân vật nói; không được gán vai luân phiên")
        start, end = cue.get("start", -1), cue.get("end", -1)
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (start, end)) or not 0 <= start < end <= duration + 0.05:
            raise ValueError("Mốc lời thoại không hợp lệ")
        if start < previous_end - 0.05:
            raise ValueError("Lời thoại chồng lấn; cần duyệt lại timeline")
        previous_end = end
        if cid != "narrator" and not cue.get("offscreen"):
            for scene in scenes:
                if scene["start_time"] < end and scene["end_time"] > start and cid not in scene.get("characters_present", []):
                    raise ValueError(f"Nhân vật {cid} nói nhưng không xuất hiện trong cảnh")
    if any(s.get("renderer") == "native-vector-v1" for s in scenes):
        try:
            from bkt_web.remake_vector import validate_vector_scenes, validate_vector_cues
        except ImportError:
            from remake_vector import validate_vector_scenes, validate_vector_cues
        validate_vector_scenes(characters, scenes)
        validate_vector_cues(cues)


def compose_animated_video(
    project_slug: str,
    characters: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    cues: List[Dict[str, Any]],
    audio_path: Path,
    output_path: Path,
    duration: float = 30.0,
    sprite_dir: Optional[Path] = None,
    face_rigs: Optional[Dict[str, Any]] = None,
    log: Optional[Callable[[str, int], None]] = None,
    frame: str = "portrait",
) -> Optional[Path]:
    """Ghép video bằng Playwright headless — ghi lại Sprite Canvas animation.

    `face_rigs` là bảng rig khuôn mặt do Antigravity đo từ sprite nó vẽ
    ({char_id: {eyeL, eyeR, mouth, blinkPeriod, blinkOffset, eyeFill}}). Nhân vật
    nào không có rig thì renderer tự dò vùng đầu từ kênh alpha của sprite, nên
    nhép môi và chớp mắt luôn chạy cho mọi nhân vật.

    `frame` (chỉ thư viện vector): "portrait" dựng 576×1024; "landscape" dựng canvas 1820×1024 và
    xuất MP4 1920×1080.
    """
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", project_slug):
        raise ValueError("Mã dự án không an toàn")
    try:
        from bkt_web.remake_vector import EXPORT_SIZES, FRAMES, frame_name
    except ImportError:
        from remake_vector import EXPORT_SIZES, FRAMES, frame_name
    frame = frame_name(frame)
    validate_timeline(scenes, cues, characters, duration)
    if log:
        log("Đang chuẩn bị animation theo timeline nguồn...", 80)

    sprite_data_uris: Dict[str, str] = {}
    extra_assets: Dict[str, str] = {}

    # -------- Thu thập sprites từ sprite_dir hoặc static --------
    search_dirs = []
    if sprite_dir and sprite_dir.exists():
        search_dirs.append(sprite_dir)
    sprite_static = STATIC_DIR / f"remake_sprites_{project_slug}"
    if sprite_static.exists():
        search_dirs.append(sprite_static)

    all_sprites: Dict[str, Path] = {}
    for sdir in search_dirs:
        for f in sdir.glob("*.*"):
            if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                # Ưu tiên PNG hơn JPG cho cùng tên stem
                stem = f.stem.lower()
                if stem not in all_sprites or f.suffix.lower() == ".png":
                    all_sprites[stem] = f

    # Map character id → data URI (exact -> fuzzy -> keyword)
    for c in characters:
        cid = c.get("id", "").lower()
        matched_path: Optional[Path] = None

        # 1. Exact match
        if cid in all_sprites:
            matched_path = all_sprites[cid]

        # 2. Fuzzy match
        if not matched_path:
            cid_clean = cid.replace("_", "")
            for sname, spath in all_sprites.items():
                if sname.startswith("bg_") or sname.startswith("transition_"):
                    continue
                sname_clean = sname.replace("_", "")
                if cid_clean in sname_clean or sname_clean in cid_clean:
                    matched_path = spath
                    break

        # 3. Keyword match
        if not matched_path:
            keywords = {
                "knife": "knife", "dao": "knife", "blade": "knife", "scalpel": "knife",
                "tree": "tree", "papaya": "papaya", "du_du": "papaya",
                "farmer": "farmer", "nong": "farmer", "person": "farmer"
            }
            for kw, target in keywords.items():
                if kw in cid:
                    for sname, spath in all_sprites.items():
                        if target in sname and not sname.startswith("bg_"):
                            matched_path = spath
                            break
                    if matched_path:
                        break

        if matched_path:
            sprite_data_uris[c.get("id", cid)] = _file_to_data_uri(matched_path)

    # Extra assets (bucket, transition, background)
    for key in ("bucket", "transition_later", "bg_farm", "bg_scene", *(f"bg_scene_{i}" for i in range(len(scenes)))):
        if key in all_sprites:
            extra_assets[key] = _file_to_data_uri(all_sprites[key])

    # Background per scene
    bg_data_uris: Dict[int, str] = {}
    for i, s in enumerate(scenes):
        if s.get("background_provenance") != "redrawn":
            continue
        sc_bg_key = f"bg_scene_{i}"
        if sc_bg_key in extra_assets:
            bg_data_uris[i] = extra_assets[sc_bg_key]
        elif "bg_farm" in extra_assets:
            bg_data_uris[i] = extra_assets["bg_farm"]
        elif "bg_scene" in extra_assets:
            bg_data_uris[i] = extra_assets["bg_scene"]

    # -------- Chuẩn bị dữ liệu cho template --------
    chars_json = []
    for c in characters:
        cid = c.get("id", "char")
        # Whole-pose cels for the hand-drawn renderer are optional additions to
        # the normal character sprite.  A cel named ``hero__lean.png`` is
        # addressed by ``drawing_id: "lean"`` in a scene pose.  Keep the
        # mapping embedded with the HTML so native frame export stays offline.
        pose_sprites = {}
        prefix = f"{cid.lower()}__"
        for sprite_name, sprite_path in all_sprites.items():
            if sprite_name.startswith(prefix):
                drawing_id = sprite_name[len(prefix):]
                if drawing_id:
                    pose_sprites[drawing_id] = _file_to_data_uri(sprite_path)
        chars_json.append({
            **c,
            "id": cid,
            "name": c.get("name", cid),
            "draw": c.get("draw", {}),
            "sprite_url": sprite_data_uris.get(cid, ""),
            "pose_sprites": pose_sprites,
        })

    scenes_json = []
    for i, s in enumerate(scenes):
        scene_start = s["start_time"]
        scene_end = s["end_time"]
        scenes_json.append({
            **s,
            "index": s.get("index", i),
            "characters_present": s.get("characters_present", [c["id"] for c in characters[:2]]),
            "action": s.get("action", ""),
            "mood": s.get("mood", "happy"),
            "draw": s.get("draw", {}),
            "bg_url": bg_data_uris.get(i, ""),
            "start_time": scene_start,
            "end_time": scene_end,
        })

    char_name_map = {c.get("id"): c.get("name", c.get("id")) for c in characters}
    cues_json = []
    for cu in cues:
        cid = cu.get("character_id") or cu.get("speaker") or cu.get("speaker_id")
        cues_json.append({
            **{key: cu[key] for key in ("expression", "visemes", "offscreen") if key in cu},
            "start": cu.get("start", 0),
            "end": cu.get("end", 0),
            "text": cu.get("text", ""),
            "character_id": cid,
            "character_name": char_name_map.get(cid, ""),
        })

    # -------- Render HTML từ template --------
    # Dự án 77-aaaf287e (video đu đủ) có kịch bản hoạt hình riêng (cây đu đủ, dao cắt, sữa chảy, nông dân)
    # nên dùng sprite_template.html. Các dự án khác dùng renderer tổng quát antigravity_template.html.
    if all(s.get("renderer") == "native-vector-v1" for s in scenes):
        template_name = "vector_library_template.html"
    elif frame != "portrait":
        raise ValueError("Khổ ngang chỉ hỗ trợ cho thư viện vector (native-vector-v1)")
    elif all(s.get("renderer") == "papaya-native-v1" for s in scenes):
        template_name = "papaya_native_template.html"
    else:
        template_name = "antigravity_template.html"
        import math
        for scene in scenes:
            for cid in scene.get("characters_present", []):
                if cid not in sprite_data_uris:
                    raise ValueError(f"Thiếu sprite đã vẽ lại cho {cid}; không dùng nhân vật thay thế")
                poses = scene.get("poses", {}).get(cid, [])
                if not poses:
                    raise ValueError(f"Thiếu keyframe vị trí/hành động cho {cid}")
                last_time = -1.0
                for pose in poses:
                    if not all(isinstance(pose.get(key), (int, float)) and math.isfinite(pose[key]) for key in ("time", "x", "y", "height")) or pose["height"] <= 0 or pose["time"] <= last_time:
                        raise ValueError(f"Keyframe không hợp lệ cho {cid}")
                    last_time = pose["time"]

    template_path = TEMPLATE_DIR / template_name
    if not template_path.exists():
        if log:
            log(f"Không tìm thấy {template_name}", 80)
        return None

    if log:
        if template_name == "vector_library_template.html":
            log("Thư viện vector: rig, điểm tiếp xúc và động tác theo storyboard", 81)
        elif template_name == "papaya_native_template.html":
            log("Renderer vector độc lập: cây, quả, dao, nhựa, nông dân theo timeline nguồn", 81)
        else:
            rig_count = len(face_rigs or {})
            auto = len(chars_json) - rig_count
            detail = f"{rig_count} rig do Antigravity đo"
            if auto > 0:
                detail += f" + {auto} nhân vật tự dò rig từ sprite"
            log(f"Renderer tổng quát: {detail}", 81)
            if any(s.get("renderer") == "hand-drawn-canvas-v1" for s in scenes):
                log("Chế độ vẽ tay: cel nguyên dáng, exposure theo drawing_id và nét mực ổn định", 81)

    def script_json(value):
        return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c")

    html = template_path.read_text(encoding="utf-8")
    if template_name == "vector_library_template.html":
        library_dir = Path(__file__).resolve().parent / "static"
        try:
            from bkt_web.remake_vector import engine_sources
        except ImportError:
            from remake_vector import engine_sources
        sources = engine_sources()
        engine_js = "\n;\n".join(src.read_text(encoding="utf-8") for src in sources)
        html = html.replace("{{VECTOR_ENGINE_JS}}", engine_js)
        html = html.replace("{{VECTOR_CATALOG_JSON}}", script_json(json.loads((library_dir / "remake_vector_catalog.json").read_text(encoding="utf-8"))))
    html = html.replace("{{FACE_RIGS_JSON}}", script_json(face_rigs or {}))
    html = html.replace("{{CHARACTERS_JSON}}", script_json(chars_json))
    html = html.replace("{{SCENES_JSON}}", script_json(scenes_json))
    html = html.replace("{{CUES_JSON}}", script_json(cues_json))
    html = html.replace("{{EXTRA_ASSETS_JSON}}", script_json(extra_assets))
    html = html.replace("{{AUDIO_URL}}", f"/static/{audio_path.name}" if audio_path.exists() else "")
    html = html.replace("{{PROJECT_NAME}}", project_slug)
    html = html.replace("{{DURATION}}", str(duration))
    html = html.replace("{{FRAME}}", frame)

    # Lưu HTML rendered
    rendered_html = STATIC_DIR / f"remake_{project_slug}_animated.html"
    rendered_html.write_text(html, encoding="utf-8")
    if log:
        log(f"Đã tạo HTML animation: {rendered_html.name}", 82)

    # -------- Ghi video bằng Playwright --------
    video_raw = _record_with_playwright(rendered_html, duration, log, size=FRAMES[frame])

    if video_raw and video_raw.exists():
        offset = 0.0 if video_raw.name.endswith("-frames.mp4") else _find_sync_offset(video_raw)
        if log:
            log(
                f"Animation bắt đầu ở {offset:.2f}s trong bản quay — cắt phần chờ để khớp tiếng"
                if offset > 0.05 else
                "Không thấy mốc đồng bộ — giữ nguyên bản quay",
                91,
            )
        final = _mux_audio(video_raw, audio_path, output_path, log, start_offset=offset,
                           size=EXPORT_SIZES[frame] if frame != "portrait" else None)
        video_raw.unlink(missing_ok=True)
        return final

    # -------- Fallback --------
    if log:
        log("Playwright không khả dụng — HTML animation đã sẵn sàng mở trên trình duyệt", 90)
    return None


def _record_with_playwright(
    html_path: Path,
    duration: float,
    log: Optional[Callable[[str, int], None]] = None,
    size: tuple = (576, 1024),
) -> Optional[Path]:
    """Mở HTML trong Playwright headless, ghi video (viewport = `size` của khổ khung)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        if log:
            log("Playwright chưa cài — bỏ qua ghi video (dùng HTML animation)", 85)
        return None

    video_dir = html_path.parent / ".playwright_video"
    video_dir.mkdir(exist_ok=True)

    if log:
        log(f"Đang ghi video animation ({duration:.0f}s) bằng Playwright headless...", 84)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--allow-file-access-from-files",
                    "--disable-web-security",
                    "--autoplay-policy=no-user-gesture-required",
                ],
            )
            context = browser.new_context(
                viewport={"width": size[0], "height": size[1]},
                record_video_dir=str(video_dir),
                record_video_size={"width": size[0], "height": size[1]},
            )
            page = context.new_page()
            page.goto(html_path.as_uri() + "?render=1", wait_until="load")
            page.wait_for_function("(typeof pending === 'undefined' || pending === 0) && Array.from(document.images).every(img => img.complete)")

            if page.evaluate("typeof window.renderFrame === 'function'"):
                import math
                raw_path = video_dir / f"{html_path.stem}-frames.mp4"
                encoder = subprocess.Popen([
                    "ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-vcodec", "png",
                    "-framerate", "30", "-i", "-", "-an", "-c:v", "libx264", "-preset", "fast",
                    "-crf", "18", "-pix_fmt", "yuv420p", str(raw_path),
                ], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
                try:
                    for frame in range(math.ceil(duration * 30)):
                        encoded = page.evaluate("t => { window.renderFrame(t); return document.querySelector('canvas').toDataURL('image/png').split(',')[1]; }", frame / 30)
                        encoder.stdin.write(base64.b64decode(encoded))
                        if log and frame % 150 == 0:
                            log(f"Đã dựng frame {frame}/{math.ceil(duration * 30)} theo timestamp", 84 + int(6 * frame / (duration * 30)))
                    encoder.stdin.close()
                    error = encoder.stderr.read().decode()
                    if encoder.wait(timeout=120):
                        raise RuntimeError(f"Không mã hóa được animation: {error[-300:]}")
                except Exception:
                    encoder.kill()
                    encoder.wait()
                    raise
                finally:
                    context.close()
                    browser.close()
                return raw_path

            # Click để kích hoạt animation & audio
            try:
                page.click("canvas", timeout=3000)
            except Exception:
                pass

            # Quay dư ở hai đầu: đầu video còn màn chờ trước khi animation chạy,
            # composer sẽ cắt theo mốc đồng bộ nên phải có đủ phần dư mà cắt.
            wait_ms = int((duration + RECORD_LEAD_PAD + 1.5) * 1000)
            if log:
                log(f"Đang phát animation... chờ {duration:.0f}s", 86)
            page.wait_for_timeout(wait_ms)

            page.close()
            context.close()
            browser.close()

        videos = list(video_dir.glob("*.webm"))
        if videos:
            # Lấy video mới nhất
            newest = max(videos, key=lambda f: f.stat().st_mtime)
            if log:
                log(f"Đã ghi video animation: {newest.name}", 90)
            return newest
    except Exception as exc:
        if log:
            log(f"Lỗi ghi Playwright: {str(exc)[:100]}", 85)

    return None


RECORD_LEAD_PAD = 5.0   # giây quay dư ở đầu, đủ cho trang nạp ảnh rồi mới chạy
SYNC_MARK_FPS = 20      # độ phân giải thời gian khi dò mốc (±50ms)


def _find_sync_offset(video: Path, max_scan: float = 10.0) -> float:
    """Tìm thời điểm animation thật sự bắt đầu trong video thô.

    Renderer nháy một ô magenta 18x18 ở góc trên-trái đúng lúc t=0. Đọc riêng
    góc đó ở dạng raw nên rẻ, không phải giải mã cả khung hình.
    """
    crop = 10
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-v", "error", "-i", str(video), "-t", str(max_scan),
                "-vf", f"crop={crop}:{crop}:2:2,fps={SYNC_MARK_FPS},format=rgb24",
                "-f", "rawvideo", "-",
            ],
            capture_output=True, timeout=120,
        )
    except (OSError, subprocess.SubprocessError):
        return 0.0

    buf = proc.stdout
    stride = crop * crop * 3
    for i in range(len(buf) // stride):
        r, g, b = buf[i * stride], buf[i * stride + 1], buf[i * stride + 2]
        if r > 190 and g < 80 and b > 190:
            return i / SYNC_MARK_FPS
    return 0.0


def _mux_audio(
    video_path: Path,
    audio_path: Path,
    output_path: Path,
    log: Optional[Callable[[str, int], None]] = None,
    start_offset: float = 0.0,
    size: Optional[tuple] = None,
) -> Optional[Path]:
    """Ghép video (Playwright, không audio) với audio master thành MP4.

    `start_offset` là lúc animation thật sự bắt đầu trong video thô; cắt bỏ
    phần chờ đó thì khung hình đầu tiên trùng với mẫu âm thanh đầu tiên, nhờ
    vậy miệng nhép khớp lời. `size` (rộng, cao) co giãn video ra cỡ xuất
    (khổ ngang 1820×1024 → 1920×1080); None giữ nguyên cỡ canvas.
    """
    if log:
        log("Đang ghép audio master vào video...", 92)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        cmd = ["ffmpeg", "-y"]
        if start_offset > 0.05:
            # -ss trước -i để cắt nhanh, +0.05s cho qua hẳn khung nháy mốc
            cmd += ["-ss", f"{start_offset + 0.05:.3f}"]
        cmd += [
            "-i", str(video_path),
            "-i", str(audio_path),
            *(["-vf", f"scale={size[0]}:{size[1]}:flags=lanczos,setsar=1"] if size else []),
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            "-pix_fmt", "yuv420p",
            str(output_path),
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if result.returncode == 0 and output_path.exists():
            size_mb = output_path.stat().st_size / (1024 * 1024)
            if log:
                log(f"✅ Video hoàn tất: {output_path.name} ({size_mb:.2f} MB)", 98)
            return output_path
        else:
            if log:
                log(f"Lỗi ffmpeg mux: {result.stderr[-200:]}", 92)
    except Exception as exc:
        if log:
            log(f"Lỗi ghép audio: {str(exc)[:100]}", 92)

    return None
