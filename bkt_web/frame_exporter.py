"""Draw-list → frame → MP4 cho renderer v2 (UV-803).

Năm adapter v2 sinh ``frame_mode="draw-list"`` nhưng không adapter nào biến
draw-list thành pixel, nên chưa có đường nào ra video. Module này đóng mắt đó:
raster hoá draw-list bằng Pillow rồi ghép frame bằng ffmpeg.

Không dùng trình duyệt. Đường v1 phải mở Chromium vì template của nó là HTML;
draw-list thì chỉ gồm primitive hình học, nên raster thẳng trong Python vừa
tất định hơn (không phụ thuộc phiên bản Chromium), vừa không cần mạng.

Ba nguyên tắc, cưỡng chế bằng code chứ không bằng kỷ luật:

* **Op lạ là lỗi, không phải bỏ qua.** Bỏ qua một op nghĩa là xuất ra frame
  thiếu nội dung rồi báo thành công.
* **Không dùng lại media nguồn.** ``video_frame`` của footage-composite bị từ
  chối thẳng: exporter này dựng, không phát lại.
* **Lỗi render là lỗi thật.** Không ghi file rỗng, không trả footage nguồn;
  MP4 xuất xong còn bị kiểm lại kích thước và thời lượng.
"""

from __future__ import annotations

import math
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence


EXPORT_SCHEMA = "tokmatrix.frame-export/v1"
FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"
MAX_FRAMES = 36_000
DEFAULT_BACKGROUND = (10, 14, 18)

SUPPORTED_OPS = ("rect", "rect_outline", "ellipse", "line", "polygon", "text", "dim", "mouth")
REFUSED_OPS = {
    "video_frame": "op 'video_frame' phát lại footage nguồn; exporter này không dùng lại media nguồn",
    "image": "op 'image' cần asset đã freeze; asset pipeline là UV-805",
}


class FrameExportError(ValueError):
    """Raised khi một frame hoặc một lần xuất video không hoàn thành được."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise FrameExportError(message)


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise FrameExportError(f"{label} phải là số hữu hạn")
    return float(value)


def _tool(name: str) -> str:
    found = shutil.which(name)
    _require(found is not None, f"Không có '{name}' trên PATH nên không xuất được video")
    assert found is not None
    return found


def _colour(value: Any, label: str, default: tuple[int, int, int, int] | None = None) -> tuple[int, int, int, int] | None:
    """`#rgb`, `#rrggbb`, `#rrggbbaa` → RGBA; None giữ nguyên nghĩa 'không tô'."""
    if value is None:
        return default
    _require(isinstance(value, str) and value.startswith("#"), f"{label}: màu phải dạng #rrggbb")
    text = value[1:]
    if len(text) == 3:
        text = "".join(character * 2 for character in text)
    _require(len(text) in {6, 8}, f"{label}: màu '{value}' không hợp lệ")
    try:
        channels = [int(text[index:index + 2], 16) for index in range(0, len(text), 2)]
    except ValueError:
        raise FrameExportError(f"{label}: màu '{value}' không hợp lệ") from None
    if len(channels) == 3:
        channels.append(255)
    return (channels[0], channels[1], channels[2], channels[3])


def _box(op: dict[str, Any], label: str) -> tuple[float, float, float, float]:
    x = _finite(op.get("x"), f"{label}.x")
    y = _finite(op.get("y"), f"{label}.y")
    width = _finite(op.get("width"), f"{label}.width")
    height = _finite(op.get("height"), f"{label}.height")
    _require(width >= 0 and height >= 0, f"{label}: width/height không được âm")
    return x, y, x + width, y + height


@dataclass(frozen=True, slots=True)
class ExportResult:
    path: str
    frames: int
    fps: float
    width: int
    height: int
    duration_seconds: float
    warnings: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": EXPORT_SCHEMA,
            "path": self.path,
            "frames": self.frames,
            "fps": self.fps,
            "width": self.width,
            "height": self.height,
            "duration_seconds": self.duration_seconds,
            "warnings": list(self.warnings),
        }


# --- Raster hoá ----------------------------------------------------------


def _font(size: float, cache: dict[int, Any]):
    """Font mặc định của Pillow, cùng đi kèm thư viện nên mọi máy như nhau."""
    from PIL import ImageFont

    key = max(8, int(round(size)))
    if key not in cache:
        cache[key] = ImageFont.load_default(size=key)
    return cache[key]


def rasterise_frame(frame: dict[str, Any], *, background: tuple[int, int, int] = DEFAULT_BACKGROUND):
    """Một frame draw-list → ảnh Pillow. Op lạ ném lỗi chứ không bỏ qua."""
    from PIL import Image, ImageDraw

    _require(isinstance(frame, dict), "frame phải là object")
    canvas = frame.get("canvas")
    _require(isinstance(canvas, dict), "frame thiếu canvas")
    width = canvas.get("width")
    height = canvas.get("height")
    _require(
        isinstance(width, int) and isinstance(height, int) and 0 < width <= 8192 and 0 < height <= 8192,
        "canvas width/height không hợp lệ",
    )
    _require(
        frame.get("source_media_usage", "none") == "none",
        f"frame khai dùng media nguồn ({frame.get('source_media_usage')}); exporter này chỉ dựng",
    )

    image = Image.new("RGBA", (width, height), (*background, 255))
    fonts: dict[int, Any] = {}
    layers = frame.get("layers") or []
    _require(isinstance(layers, list), "frame.layers phải là danh sách")

    for index, layer in enumerate(sorted(layers, key=lambda item: (item.get("z", 0), str(item.get("layer_id", ""))))):
        label = f"layers[{index}]"
        _require(isinstance(layer, dict), f"{label} phải là object")
        opacity = _finite(layer.get("opacity", 1.0), f"{label}.opacity")
        _require(0 <= opacity <= 1, f"{label}.opacity cần trong [0,1]")
        if opacity == 0:
            continue
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        for position, op in enumerate(layer.get("ops", []) or []):
            _draw_op(draw, op, f"{label}.ops[{position}]", fonts)
        if opacity < 1:
            alpha = overlay.getchannel("A").point(lambda value: int(value * opacity))
            overlay.putalpha(alpha)
        image = Image.alpha_composite(image, overlay)
    return image.convert("RGB")


def _draw_op(draw: Any, op: Any, label: str, fonts: dict[int, Any]) -> None:
    _require(isinstance(op, dict), f"{label} phải là object")
    kind = op.get("op")
    if kind in REFUSED_OPS:
        raise FrameExportError(f"{label}: {REFUSED_OPS[kind]}")
    _require(
        kind in SUPPORTED_OPS,
        f"{label}: op '{kind}' chưa raster hoá được; bỏ qua nó sẽ cho ra frame thiếu nội dung",
    )

    if kind in {"rect", "rect_outline"}:
        box = _box(op, label)
        radius = _finite(op.get("radius", 0), f"{label}.radius")
        fill = _colour(op.get("fill"), f"{label}.fill", None if kind == "rect_outline" else (255, 255, 255, 255))
        stroke = _colour(op.get("stroke"), f"{label}.stroke")
        stroke_width = max(1, int(round(_finite(op.get("stroke_width", op.get("width_stroke", 2)), f"{label}.stroke_width")))) if stroke else 0
        if radius > 0:
            draw.rounded_rectangle(box, radius=radius, fill=fill, outline=stroke, width=stroke_width)
        else:
            draw.rectangle(box, fill=fill, outline=stroke, width=stroke_width)
        return

    if kind == "ellipse":
        box = _box(op, label)
        draw.ellipse(
            box,
            fill=_colour(op.get("fill"), f"{label}.fill", (255, 255, 255, 255)),
            outline=_colour(op.get("stroke"), f"{label}.stroke"),
            width=max(1, int(round(_finite(op.get("stroke_width", 2), f"{label}.stroke_width")))),
        )
        return

    if kind in {"line", "polygon"}:
        points = op.get("points")
        _require(isinstance(points, list) and len(points) >= 2, f"{label}.points cần ít nhất hai điểm")
        flat = [
            (_finite(point[0], f"{label}.points.x"), _finite(point[1], f"{label}.points.y"))
            for point in points
        ]
        if kind == "polygon":
            draw.polygon(
                flat,
                fill=_colour(op.get("fill"), f"{label}.fill", (255, 255, 255, 255)),
                outline=_colour(op.get("stroke"), f"{label}.stroke"),
            )
        else:
            draw.line(
                flat,
                fill=_colour(op.get("stroke"), f"{label}.stroke", (255, 255, 255, 255)),
                width=max(1, int(round(_finite(op.get("width", 2), f"{label}.width")))),
                joint="curve",
            )
        return

    if kind == "mouth":
        # Puppet-2d lip sync op: ellipse whose width/height are pre-computed
        # by the adapter from viseme open/wide values.
        cx = _finite(op.get("x"), f"{label}.x")
        cy = _finite(op.get("y"), f"{label}.y")
        mw = max(0.0, _finite(op.get("width", 0), f"{label}.width"))
        mh = max(0.0, _finite(op.get("height", 0), f"{label}.height"))
        fill = _colour(op.get("fill"), f"{label}.fill", (125, 47, 49, 255))
        if mw < 0.5 or mh < 0.5:
            # Mouth closed — nothing to draw
            return
        box = (cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2)
        draw.ellipse(box, fill=fill)
        return

    if kind == "dim":
        box = _box(op, label) if "width" in op else (0, 0, draw.im.size[0], draw.im.size[1])
        amount = _finite(op.get("amount", 0.5), f"{label}.amount")
        _require(0 <= amount <= 1, f"{label}.amount cần trong [0,1]")
        draw.rectangle(box, fill=(0, 0, 0, int(round(amount * 255))))
        return

    # text
    text = op.get("text")
    _require(isinstance(text, str), f"{label}.text phải là chuỗi")
    if not text:
        return
    font = _font(_finite(op.get("font_size", 32), f"{label}.font_size"), fonts)
    align = op.get("align", "left")
    _require(align in {"left", "center", "right"}, f"{label}.align không hợp lệ")
    anchor = {"left": "la", "center": "ma", "right": "ra"}[align]
    draw.text(
        (_finite(op.get("x"), f"{label}.x"), _finite(op.get("y"), f"{label}.y")),
        text,
        font=font,
        anchor=anchor,
        fill=_colour(op.get("fill"), f"{label}.fill", (255, 255, 255, 255)),
    )


# --- Xuất video ----------------------------------------------------------


def frame_times(start: float, end: float, fps: float) -> list[float]:
    """Mốc thời gian tuyệt đối của từng frame; mốc cuối không vượt quá end."""
    _require(fps > 0, "fps phải lớn hơn 0")
    _require(end > start, "scene phải có thời lượng dương")
    count = int(math.floor((end - start) * fps + 1e-9))
    _require(count >= 1, "scene quá ngắn so với fps nên không có frame nào")
    _require(count <= MAX_FRAMES, f"scene cần {count} frame, vượt giới hạn {MAX_FRAMES}")
    return [start + index / fps for index in range(count)]


def export_frames(
    adapter: Any,
    compiled: Any,
    folder: str | Path,
    *,
    fps: float | None = None,
    background: tuple[int, int, int] = DEFAULT_BACKGROUND,
) -> list[Path]:
    """Ghi từng frame ra PNG; mỗi frame lấy từ ``render_frame`` theo thời gian tuyệt đối."""
    _require(compiled.frame_mode == "draw-list", f"chỉ xuất được frame_mode 'draw-list', không phải '{compiled.frame_mode}'")
    _require(
        compiled.source_media_usage == "none",
        f"scene khai dùng media nguồn ({compiled.source_media_usage}); exporter này chỉ dựng",
    )
    rate = float(fps or compiled.canvas.get("fps") or 30)
    target = Path(folder)
    target.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for index, seconds in enumerate(frame_times(compiled.start, compiled.end, rate)):
        frame = adapter.render_frame(seconds, compiled=compiled)
        image = rasterise_frame(frame, background=background)
        path = target / f"frame.{index:06d}.png"
        image.save(path, format="PNG", optimize=False, compress_level=1)
        written.append(path)
    return written


def encode_frames(
    folder: str | Path,
    output: str | Path,
    *,
    fps: float,
    frames: int,
    timeout: int = 600,
) -> Path:
    """Ghép PNG thành MP4 và kiểm lại kết quả thay vì tin ffmpeg."""
    binary = _tool(FFMPEG)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        [
            binary, "-nostdin", "-v", "error", "-y",
            "-framerate", f"{fps}",
            "-i", str(Path(folder) / "frame.%06d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "veryfast", "-crf", "20",
            str(target),
        ],
        capture_output=True, text=True, timeout=timeout, check=False,
    )
    _require(completed.returncode == 0, f"ffmpeg không ghép được video: {completed.stderr.strip()[-400:]}")
    _require(target.is_file() and target.stat().st_size > 1024, "ffmpeg trả file rỗng hoặc quá nhỏ")
    return target


def probe_duration(path: str | Path) -> float:
    binary = _tool(FFPROBE)
    completed = subprocess.run(
        [binary, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=60, check=False,
    )
    _require(completed.returncode == 0, f"ffprobe không đọc được video vừa xuất: {completed.stderr.strip()[:200]}")
    try:
        return float(completed.stdout.strip())
    except ValueError:
        raise FrameExportError("video vừa xuất không khai thời lượng") from None


def export_scene_to_mp4(
    adapter: Any,
    compiled: Any,
    output: str | Path,
    *,
    fps: float | None = None,
    workdir: str | Path | None = None,
    background: tuple[int, int, int] = DEFAULT_BACKGROUND,
) -> ExportResult:
    """draw-list → PNG → MP4, kèm kiểm chứng file xuất ra là thật."""
    import tempfile

    rate = float(fps or compiled.canvas.get("fps") or 30)
    warnings: list[str] = [
        "text_rendered_with_pillow_default_font: chữ dùng font mặc định của Pillow, "
        "không phải font trong font_stack của storyboard",
    ]
    if workdir is None:
        with tempfile.TemporaryDirectory() as folder:
            frames = export_frames(adapter, compiled, folder, fps=rate, background=background)
            path = encode_frames(folder, output, fps=rate, frames=len(frames))
    else:
        folder = Path(workdir)
        frames = export_frames(adapter, compiled, folder, fps=rate, background=background)
        path = encode_frames(folder, output, fps=rate, frames=len(frames))

    duration = probe_duration(path)
    _require(duration > 0, "video vừa xuất có thời lượng 0")
    expected = len(frames) / rate
    if abs(duration - expected) > max(0.2, expected * 0.1):
        warnings.append(f"duration_drift: video {duration:.3f}s so với {expected:.3f}s dự kiến")
    return ExportResult(
        path=str(path),
        frames=len(frames),
        fps=rate,
        width=int(compiled.canvas["width"]),
        height=int(compiled.canvas["height"]),
        duration_seconds=duration,
        warnings=tuple(warnings),
    )


__all__ = [
    "EXPORT_SCHEMA",
    "ExportResult",
    "FrameExportError",
    "MAX_FRAMES",
    "REFUSED_OPS",
    "SUPPORTED_OPS",
    "encode_frames",
    "export_frames",
    "export_scene_to_mp4",
    "frame_times",
    "probe_duration",
    "rasterise_frame",
]
