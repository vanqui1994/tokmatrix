"""Perceptual frame and audio comparison (UV-602).

Structural (UV-600) and geometric (UV-601) checks work on the storyboard and
the solved scene.  This layer looks at what actually came out: rendered frames
and rendered audio, compared against a reference, **per scene** and **per
profile**.

Two rules shape the module:

* **No single threshold for every genre.**  A source-faithful remake and a
  meme cut are not held to the same numbers, so a comparison always runs under
  a named :class:`ComparisonProfile`; there is no global default to fall into.
* **Nothing is decoded that is not there.**  A missing frame or a missing audio
  track is reported, never treated as a silent pass, and a comparison of zero
  frames is a failure rather than a perfect score.

Frames are compared on a small grayscale grid with mean SSIM over tiles plus
RMSE; audio on duration, loudness and silence ratio.  Everything is pure
Python over small buffers, so a run is deterministic and needs no network.
"""

from __future__ import annotations

import math
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


VISUAL_SCHEMA = "tokmatrix.visual-audio-fidelity/v1"
GRID = 64
TILE = 8
_C1 = (0.01 * 255) ** 2
_C2 = (0.03 * 255) ** 2


class VisualFidelityError(ValueError):
    """Raised when a comparison cannot be set up or its inputs are unusable."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise VisualFidelityError(message)


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise VisualFidelityError(f"{label} phải là số hữu hạn")
    return float(value)


# --- Profiles ------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ComparisonProfile:
    """Thresholds for one kind of output. Every report echoes the one it used."""

    profile_id: str
    min_mean_ssim: float
    max_rmse: float
    min_frame_ssim: float
    audio_duration_tolerance_seconds: float
    audio_loudness_tolerance_db: float
    audio_silence_tolerance: float
    description: str = ""

    def __post_init__(self) -> None:
        _require(isinstance(self.profile_id, str) and bool(self.profile_id), "profile_id không hợp lệ")
        for name in ("min_mean_ssim", "max_rmse", "min_frame_ssim", "audio_silence_tolerance"):
            value = _finite(getattr(self, name), f"profile.{name}")
            object.__setattr__(self, name, value)
            _require(0 <= value <= 1, f"profile.{name} cần trong [0,1]")
        for name in ("audio_duration_tolerance_seconds", "audio_loudness_tolerance_db"):
            value = _finite(getattr(self, name), f"profile.{name}")
            object.__setattr__(self, name, value)
            _require(value >= 0, f"profile.{name} không được âm")
        _require(self.min_frame_ssim <= self.min_mean_ssim, "profile: ngưỡng từng frame phải dễ hơn ngưỡng trung bình")

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


PROFILES: dict[str, ComparisonProfile] = {
    item.profile_id: item
    for item in (
        ComparisonProfile("source-faithful", 0.96, 0.06, 0.90, 0.04, 1.0, 0.05,
                          "A remake that claims to reproduce the source."),
        ComparisonProfile("educational", 0.92, 0.10, 0.82, 0.10, 2.0, 0.10,
                          "Explainer work: the content must survive, the look may change."),
        ComparisonProfile("product", 0.94, 0.08, 0.86, 0.08, 1.5, 0.08,
                          "Product footage: the product must read correctly."),
        ComparisonProfile("news", 0.95, 0.07, 0.88, 0.05, 1.0, 0.05,
                          "News: timing and legibility over style."),
        ComparisonProfile("tiktok-fast", 0.80, 0.20, 0.65, 0.20, 3.0, 0.20,
                          "Fast social cut: heavy restyling is expected."),
        ComparisonProfile("meme", 0.60, 0.35, 0.40, 0.30, 4.0, 0.30,
                          "Meme edit: only the beats need to survive."),
    )
}


def profile(profile_id: str) -> ComparisonProfile:
    """Look up a shipped profile; an unknown name is an error, not a default."""
    found = PROFILES.get(profile_id)
    _require(found is not None, f"Profile chưa có: {profile_id}. Có sẵn: {sorted(PROFILES)}")
    assert found is not None
    return found


# --- Frame loading -------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Frame:
    """A frame reduced to a small grayscale grid, with its source size."""

    seconds: float
    width: int
    height: int
    pixels: tuple[int, ...]

    def __post_init__(self) -> None:
        _require(len(self.pixels) == GRID * GRID, f"frame cần {GRID * GRID} mẫu")


def _grayscale_grid(values: Sequence[Sequence[float]]) -> tuple[int, ...]:
    """Resample any 2D grid of 0..255 values onto the fixed comparison grid."""
    rows = len(values)
    _require(rows > 0, "frame rỗng")
    columns = len(values[0])
    _require(columns > 0, "frame rỗng")
    _require(all(len(row) == columns for row in values), "frame không phải lưới chữ nhật")
    output: list[int] = []
    for y in range(GRID):
        source_y = min(rows - 1, int(y * rows / GRID))
        row = values[source_y]
        for x in range(GRID):
            source_x = min(columns - 1, int(x * columns / GRID))
            value = _finite(row[source_x], "frame.pixel")
            _require(0 <= value <= 255, "giá trị pixel cần trong [0,255]")
            output.append(int(round(value)))
    return tuple(output)


def load_frame(source: Any, seconds: float = 0.0) -> Frame:
    """Build a comparable frame from a path, a PIL image or a 2D grid."""
    time = _finite(seconds, "seconds")
    if isinstance(source, Frame):
        return source
    if isinstance(source, (str, Path)):
        path = Path(source)
        _require(path.is_file(), f"Không tìm thấy frame: {path}")
        _require(".." not in str(path).replace("\\", "/").split("/"), "frame path chứa path traversal")
        try:
            from PIL import Image
        except ImportError as error:  # pragma: no cover - environment specific
            raise VisualFidelityError("Cần Pillow để đọc frame từ file") from error
        with Image.open(path) as image:
            grayscale = image.convert("L")
            width, height = grayscale.size
            rows = [
                [grayscale.getpixel((x, y)) for x in range(width)]
                for y in range(height)
            ]
        return Frame(seconds=time, width=width, height=height, pixels=_grayscale_grid(rows))
    if hasattr(source, "convert") and hasattr(source, "size"):
        grayscale = source.convert("L")
        width, height = grayscale.size
        rows = [[grayscale.getpixel((x, y)) for x in range(width)] for y in range(height)]
        return Frame(seconds=time, width=width, height=height, pixels=_grayscale_grid(rows))
    _require(isinstance(source, (list, tuple)) and bool(source), "frame cần là path, ảnh hoặc lưới 2D")
    rows = [list(row) for row in source]
    return Frame(seconds=time, width=len(rows[0]), height=len(rows), pixels=_grayscale_grid(rows))


def _statistics(values: Sequence[int]) -> tuple[float, float]:
    count = len(values)
    mean = sum(values) / count
    variance = sum((value - mean) ** 2 for value in values) / count
    return mean, variance


def frame_ssim(left: Frame, right: Frame) -> float:
    """Mean SSIM over fixed tiles of the comparison grid."""
    total = 0.0
    tiles = 0
    for tile_y in range(0, GRID, TILE):
        for tile_x in range(0, GRID, TILE):
            left_tile: list[int] = []
            right_tile: list[int] = []
            for y in range(tile_y, tile_y + TILE):
                base = y * GRID
                left_tile.extend(left.pixels[base + tile_x: base + tile_x + TILE])
                right_tile.extend(right.pixels[base + tile_x: base + tile_x + TILE])
            left_mean, left_variance = _statistics(left_tile)
            right_mean, right_variance = _statistics(right_tile)
            covariance = sum(
                (a - left_mean) * (b - right_mean) for a, b in zip(left_tile, right_tile)
            ) / len(left_tile)
            numerator = (2 * left_mean * right_mean + _C1) * (2 * covariance + _C2)
            denominator = (left_mean ** 2 + right_mean ** 2 + _C1) * (left_variance + right_variance + _C2)
            total += 1.0 if denominator == 0 else numerator / denominator
            tiles += 1
    return total / tiles


def frame_rmse(left: Frame, right: Frame) -> float:
    """Root mean squared error normalised to ``[0,1]``."""
    squares = sum((a - b) ** 2 for a, b in zip(left.pixels, right.pixels))
    return math.sqrt(squares / len(left.pixels)) / 255.0


# --- Audio loading -------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Audio:
    sample_rate: int
    samples: tuple[float, ...]

    @property
    def duration_seconds(self) -> float:
        return len(self.samples) / self.sample_rate

    @property
    def loudness_db(self) -> float:
        """RMS in dBFS; digital silence is reported as -120 dB, not -inf."""
        if not self.samples:
            return -120.0
        mean_square = sum(value * value for value in self.samples) / len(self.samples)
        if mean_square <= 1e-12:
            return -120.0
        return max(-120.0, 20 * math.log10(math.sqrt(mean_square)))

    def silence_ratio(self, threshold: float = 0.01) -> float:
        if not self.samples:
            return 1.0
        quiet = sum(1 for value in self.samples if abs(value) < threshold)
        return quiet / len(self.samples)


def load_audio(source: Any, sample_rate: int | None = None) -> Audio:
    """Build comparable audio from a WAV path or a sequence of -1..1 samples."""
    if isinstance(source, Audio):
        return source
    if isinstance(source, (str, Path)):
        path = Path(source)
        _require(path.is_file(), f"Không tìm thấy audio: {path}")
        with wave.open(str(path), "rb") as handle:
            _require(handle.getsampwidth() == 2, "chỉ hỗ trợ WAV PCM 16-bit")
            channels = handle.getnchannels()
            rate = handle.getframerate()
            raw = handle.readframes(handle.getnframes())
        values: list[float] = []
        for index in range(0, len(raw), 2 * channels):
            chunk = raw[index: index + 2]
            if len(chunk) < 2:
                break
            value = int.from_bytes(chunk, "little", signed=True) / 32768.0
            values.append(value)
        return Audio(sample_rate=rate, samples=tuple(values))
    _require(isinstance(source, (list, tuple)), "audio cần là path hoặc dãy mẫu")
    _require(isinstance(sample_rate, int) and not isinstance(sample_rate, bool) and sample_rate > 0,
             "cần sample_rate khi truyền dãy mẫu")
    assert sample_rate is not None
    samples = tuple(_finite(value, "audio.sample") for value in source)
    _require(all(-1.0 <= value <= 1.0 for value in samples), "mẫu audio cần trong [-1,1]")
    return Audio(sample_rate=sample_rate, samples=samples)


# --- Report --------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Finding:
    check_id: str
    category: str
    code: str
    severity: str
    message: str
    scene_id: str
    seconds: float | None = None
    measured: float | None = None
    allowed: float | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "check_id": self.check_id,
            "category": self.category,
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "scene_id": self.scene_id,
            "seconds": self.seconds,
            "measured": self.measured,
            "allowed": self.allowed,
        }


@dataclass(frozen=True, slots=True)
class SceneComparison:
    scene_id: str
    frames_compared: int
    mean_ssim: float | None
    worst_ssim: float | None
    worst_rmse: float | None
    audio_duration_drift: float | None
    audio_loudness_drift_db: float | None
    audio_silence_drift: float | None

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


@dataclass(frozen=True, slots=True)
class VisualReport:
    profile: ComparisonProfile
    scenes: tuple[SceneComparison, ...]
    findings: tuple[Finding, ...]

    @property
    def failures(self) -> tuple[Finding, ...]:
        return tuple(item for item in self.findings if item.severity == "fail")

    @property
    def passed(self) -> bool:
        return not self.failures

    def codes(self) -> tuple[str, ...]:
        return tuple(sorted({item.code for item in self.findings}))

    def for_scene(self, scene_id: str) -> SceneComparison:
        found = next((item for item in self.scenes if item.scene_id == scene_id), None)
        _require(found is not None, f"Scene không có trong báo cáo: {scene_id}")
        assert found is not None
        return found

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": VISUAL_SCHEMA,
            "passed": self.passed,
            "profile": self.profile.as_dict(),
            "scenes": [item.as_dict() for item in self.scenes],
            "findings": [item.as_dict() for item in self.findings],
        }


@dataclass(frozen=True, slots=True)
class SceneMedia:
    """What a renderer produced for one scene."""

    scene_id: str
    frames: tuple[Frame, ...] = ()
    audio: Audio | None = None

    @classmethod
    def build(cls, scene_id: str, frames: Iterable[Any] = (), audio: Any = None, sample_rate: int | None = None) -> "SceneMedia":
        _require(isinstance(scene_id, str) and bool(scene_id), "scene_id không hợp lệ")
        loaded = []
        for index, item in enumerate(frames):
            if isinstance(item, tuple) and len(item) == 2 and not isinstance(item[0], (list, tuple)):
                loaded.append(load_frame(item[1], float(item[0])))
            else:
                loaded.append(load_frame(item, float(index)))
        return cls(
            scene_id=scene_id,
            frames=tuple(loaded),
            audio=None if audio is None else load_audio(audio, sample_rate),
        )


def compare_render(
    reference: Sequence[SceneMedia],
    candidate: Sequence[SceneMedia],
    comparison_profile: ComparisonProfile | str,
) -> VisualReport:
    """Compare rendered media scene by scene under one named profile."""
    selected = comparison_profile if isinstance(comparison_profile, ComparisonProfile) else profile(str(comparison_profile))
    _require(bool(reference), "cần ít nhất một scene tham chiếu")
    reference_ids = [item.scene_id for item in reference]
    _require(len(reference_ids) == len(set(reference_ids)), "scene_id tham chiếu bị trùng")
    candidate_by_id = {item.scene_id: item for item in candidate}
    _require(len(candidate_by_id) == len(candidate), "scene_id ứng viên bị trùng")

    findings: list[Finding] = []
    comparisons: list[SceneComparison] = []

    def add(category: str, code: str, severity: str, message: str, scene_id: str, seconds: float | None = None, measured: float | None = None, allowed: float | None = None) -> None:
        findings.append(Finding(
            check_id=f"{category}.{code.lower()}.{len(findings)}",
            category=category,
            code=code,
            severity=severity,
            message=message,
            scene_id=scene_id,
            seconds=None if seconds is None else round(seconds, 6),
            measured=None if measured is None else round(measured, 6),
            allowed=allowed,
        ))

    for item in reference:
        other = candidate_by_id.get(item.scene_id)
        if other is None:
            add("visual", "SCENE_NOT_RENDERED", "fail", "the candidate rendered nothing for this scene", item.scene_id)
            comparisons.append(SceneComparison(item.scene_id, 0, None, None, None, None, None, None))
            continue

        mean_ssim: float | None = None
        worst_ssim: float | None = None
        worst_rmse: float | None = None
        pairs = min(len(item.frames), len(other.frames))
        if not item.frames:
            add("visual", "NO_REFERENCE_FRAMES", "fail", "there are no reference frames to compare against", item.scene_id)
        elif not other.frames:
            add("visual", "NO_CANDIDATE_FRAMES", "fail", "the candidate produced no frames for this scene", item.scene_id)
        else:
            if len(item.frames) != len(other.frames):
                add("visual", "FRAME_COUNT_MISMATCH", "fail",
                    f"{len(other.frames)} frames rendered against {len(item.frames)} reference frames",
                    item.scene_id, None, float(len(other.frames)), float(len(item.frames)))
            scores: list[float] = []
            for index in range(pairs):
                left, right = item.frames[index], other.frames[index]
                if (left.width, left.height) != (right.width, right.height):
                    add("visual", "FRAME_SIZE_MISMATCH", "warn",
                        "frame sizes differ; comparison uses the normalised grid",
                        item.scene_id, left.seconds)
                score = frame_ssim(left, right)
                error = frame_rmse(left, right)
                scores.append(score)
                worst_ssim = score if worst_ssim is None else min(worst_ssim, score)
                worst_rmse = error if worst_rmse is None else max(worst_rmse, error)
                if score < selected.min_frame_ssim:
                    add("visual", "FRAME_PERCEPTUAL_DRIFT", "fail",
                        "a frame differs from the reference beyond this profile's limit",
                        item.scene_id, left.seconds, score, selected.min_frame_ssim)
                if error > selected.max_rmse:
                    add("visual", "FRAME_RMSE_HIGH", "fail",
                        "a frame's pixel error exceeds this profile's limit",
                        item.scene_id, left.seconds, error, selected.max_rmse)
            mean_ssim = sum(scores) / len(scores)
            if mean_ssim < selected.min_mean_ssim:
                add("visual", "SCENE_PERCEPTUAL_DRIFT", "fail",
                    "the scene as a whole drifts from the reference",
                    item.scene_id, None, mean_ssim, selected.min_mean_ssim)

        duration_drift = loudness_drift = silence_drift = None
        if item.audio is not None and other.audio is None:
            add("audio", "AUDIO_MISSING", "fail", "the reference has audio and the candidate has none", item.scene_id)
        elif item.audio is not None and other.audio is not None:
            duration_drift = abs(other.audio.duration_seconds - item.audio.duration_seconds)
            loudness_drift = abs(other.audio.loudness_db - item.audio.loudness_db)
            silence_drift = abs(other.audio.silence_ratio() - item.audio.silence_ratio())
            if duration_drift > selected.audio_duration_tolerance_seconds:
                add("audio", "AUDIO_DURATION_DRIFT", "fail", "rendered audio is a different length",
                    item.scene_id, None, duration_drift, selected.audio_duration_tolerance_seconds)
            if loudness_drift > selected.audio_loudness_tolerance_db:
                add("audio", "AUDIO_LOUDNESS_DRIFT", "fail", "rendered audio sits at a different level",
                    item.scene_id, None, loudness_drift, selected.audio_loudness_tolerance_db)
            if silence_drift > selected.audio_silence_tolerance:
                add("audio", "AUDIO_SILENCE_DRIFT", "fail", "rendered audio is silent for a different share of the scene",
                    item.scene_id, None, silence_drift, selected.audio_silence_tolerance)
            if item.audio.loudness_db > -60.0 and other.audio.loudness_db <= -60.0:
                # A failed voice or mix must never pass as a finished scene.
                add("audio", "AUDIO_SILENT_OUTPUT", "fail", "the reference speaks here and the candidate is silent",
                    item.scene_id, None, other.audio.loudness_db, -60.0)

        comparisons.append(SceneComparison(
            scene_id=item.scene_id,
            frames_compared=pairs,
            mean_ssim=None if mean_ssim is None else round(mean_ssim, 6),
            worst_ssim=None if worst_ssim is None else round(worst_ssim, 6),
            worst_rmse=None if worst_rmse is None else round(worst_rmse, 6),
            audio_duration_drift=None if duration_drift is None else round(duration_drift, 6),
            audio_loudness_drift_db=None if loudness_drift is None else round(loudness_drift, 6),
            audio_silence_drift=None if silence_drift is None else round(silence_drift, 6),
        ))

    for scene_id in sorted(set(candidate_by_id) - set(reference_ids)):
        add("visual", "SCENE_NOT_IN_REFERENCE", "warn", "the candidate rendered a scene the reference does not have", scene_id)

    return VisualReport(profile=selected, scenes=tuple(comparisons), findings=tuple(findings))


__all__ = [
    "Audio",
    "ComparisonProfile",
    "Finding",
    "Frame",
    "PROFILES",
    "SceneComparison",
    "SceneMedia",
    "VISUAL_SCHEMA",
    "VisualFidelityError",
    "VisualReport",
    "compare_render",
    "frame_rmse",
    "frame_ssim",
    "load_audio",
    "load_frame",
    "profile",
]
