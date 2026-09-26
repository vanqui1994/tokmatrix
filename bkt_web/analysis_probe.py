"""Analyzers that run on a real media file (UV-801).

UV-301 built the adapter contract and the normalisers; everything that fed it
so far was a fixture.  This module supplies the first analyzers that look at an
actual file:

``probe_source``          ffprobe → the ``source`` block and duration
``FfmpegShotAdapter``     ffmpeg scene detection → shot boundaries
``TranscriptionAdapter``  the pipeline's own ASR output → transcript segments
``analyse_media``         the three together, through ``run_analysis``

Three properties are kept deliberately:

* **Timestamps are copied, never rounded.**  ``showinfo`` prints
  ``pts_time:1.234567``; that exact float becomes the cut time.
* **Offline by default.**  Only local paths are accepted, ffmpeg is invoked
  with ``-nostdin`` on a file argument, and no analyzer opens a socket.  The
  in-process socket guard in ``run_analysis`` cannot police a subprocess, so
  the protection here is that no URL is ever passed to ffmpeg.
* **A missing tool is a recorded failure, not a crash.**  No ffmpeg on the
  machine means the shot analyzer reports ``unavailable`` and the transcript
  still lands in the document.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from bkt_web.analysis_adapters import (
    AdapterError,
    AdapterOutput,
    AnalysisAdapter,
    AnalysisRequest,
    AnalysisRunResult,
    ShotBoundaryAdapter,
    TranscriptAdapter,
    run_analysis,
)


FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"
DEFAULT_SCENE_THRESHOLD = 0.35
PROBE_TIMEOUT_SECONDS = 120
_PTS_TIME = re.compile(r"pts_time:([0-9]+(?:\.[0-9]+)?)")
_MEDIA_TYPES = {
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v",
    ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
}


class ProbeError(AdapterError):
    """Raised when a media file cannot be probed at all."""

    def __init__(self, message: str, reason: str = "unsupported_media"):
        super().__init__(message, reason)


def _require(condition: bool, message: str, reason: str = "unsupported_media") -> None:
    if not condition:
        raise ProbeError(message, reason)


def _local_file(path: str | Path) -> Path:
    """A readable local file, with no URL and no traversal segment."""
    text = str(path)
    _require("://" not in text, "chỉ nhận đường dẫn cục bộ, không nhận URL")
    _require(".." not in text.replace("\\", "/").split("/"), "đường dẫn chứa path traversal")
    resolved = Path(text)
    _require(resolved.is_file(), f"Không tìm thấy file: {resolved}")
    return resolved


def _tool(name: str) -> str:
    found = shutil.which(name)
    if found is None:
        raise ProbeError(f"Không có '{name}' trên PATH", reason="unavailable")
    return found


def file_sha256(path: str | Path, *, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with _local_file(path).open("rb") as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def _slug(value: str) -> str:
    cleaned: list[str] = []
    previous = True
    for character in value.lower():
        if character.isalnum():
            cleaned.append(character)
            previous = False
        elif not previous:
            cleaned.append(".")
            previous = True
    return "".join(cleaned).strip(".") or "media"


@dataclass(frozen=True, slots=True)
class SourceProbe:
    """What ffprobe could read about one file."""

    path: str
    source_id: str
    sha256: str
    media_type: str
    duration_seconds: float
    width: int | None
    height: int | None
    frame_rate: float | None

    def as_source(self) -> dict[str, Any]:
        source: dict[str, Any] = {
            "source_id": self.source_id,
            "sha256": self.sha256,
            "media_type": self.media_type,
        }
        for key in ("width", "height", "frame_rate"):
            value = getattr(self, key)
            if value is not None:
                source[key] = value
        return source

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__slots__}


def _fraction(value: Any) -> float | None:
    if not isinstance(value, str) or "/" not in value:
        return None
    numerator, _, denominator = value.partition("/")
    try:
        top, bottom = float(numerator), float(denominator)
    except ValueError:
        return None
    return None if bottom == 0 else top / bottom


def probe_source(path: str | Path, *, source_id: str | None = None, timeout: int = PROBE_TIMEOUT_SECONDS) -> SourceProbe:
    """Read duration, size and frame rate from a local file with ffprobe."""
    resolved = _local_file(path)
    binary = _tool(FFPROBE)
    completed = subprocess.run(
        [binary, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(resolved)],
        capture_output=True, text=True, timeout=timeout, check=False,
    )
    _require(completed.returncode == 0, f"ffprobe không đọc được file: {completed.stderr.strip()[:300]}")
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ProbeError(f"ffprobe trả JSON không hợp lệ: {error}", reason="internal_error") from None

    duration = payload.get("format", {}).get("duration")
    streams = payload.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    if duration is None and video is not None:
        duration = video.get("duration")
    _require(duration is not None, "file không khai thời lượng")
    try:
        seconds = float(duration)
    except (TypeError, ValueError):
        raise ProbeError("thời lượng không phải số", reason="unsupported_media") from None
    _require(seconds > 0, "thời lượng phải lớn hơn 0")

    width = height = None
    frame_rate = None
    if video is not None:
        width = int(video["width"]) if str(video.get("width", "")).isdigit() else None
        height = int(video["height"]) if str(video.get("height", "")).isdigit() else None
        frame_rate = _fraction(video.get("avg_frame_rate")) or _fraction(video.get("r_frame_rate"))
        if frame_rate is not None and frame_rate <= 0:
            frame_rate = None

    return SourceProbe(
        path=str(resolved),
        source_id=source_id or f"source.{_slug(resolved.stem)}",
        sha256=file_sha256(resolved),
        media_type=_MEDIA_TYPES.get(resolved.suffix.lower(), "application/octet-stream"),
        duration_seconds=seconds,
        width=width,
        height=height,
        frame_rate=frame_rate,
    )


# --- Shot detection ------------------------------------------------------


def parse_scene_times(output: str) -> list[float]:
    """Cut times from ffmpeg ``showinfo`` output, in order, verbatim."""
    times: list[float] = []
    for match in _PTS_TIME.finditer(output):
        value = float(match.group(1))
        if not times or value > times[-1]:
            times.append(value)
    return times


class FfmpegShotAdapter(AnalysisAdapter):
    """Shot boundaries from ffmpeg's scene-change filter.

    ffmpeg reports the frame *after* each change; those times are used exactly
    as printed, and the boundaries are handed to UV-301's
    :class:`ShotBoundaryAdapter` so the partition rules stay in one place.
    """

    analyzer_kind = "shot"

    def __init__(
        self,
        *,
        analyzer_id: str = "analyzer.ffmpeg.shots",
        name: str = "ffmpeg-scene-detect",
        version: str = "1.0.0",
        threshold: float = DEFAULT_SCENE_THRESHOLD,
        confidence: float = 0.75,
        timeout: int = PROBE_TIMEOUT_SECONDS,
        **kwargs: Any,
    ) -> None:
        _require(0 < threshold < 1, "threshold cần trong (0,1)", "internal_error")
        _require(0 <= confidence <= 1, "confidence cần trong [0,1]", "internal_error")
        super().__init__(analyzer_id, name, version, parameters={"threshold": threshold}, **kwargs)
        self.threshold = threshold
        self.confidence = confidence
        self.timeout = timeout

    def detect(self, path: str | Path) -> list[float]:
        resolved = _local_file(path)
        binary = _tool(FFMPEG)
        completed = subprocess.run(
            [
                binary, "-nostdin", "-v", "info", "-i", str(resolved),
                "-filter:v", f"select='gt(scene,{self.threshold})',showinfo",
                "-an", "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=self.timeout, check=False,
        )
        if completed.returncode != 0:
            raise AdapterError(
                f"ffmpeg scene-detect thất bại: {completed.stderr.strip()[-300:]}",
                reason="internal_error",
            )
        return parse_scene_times(completed.stderr)

    def produce(self, request: AnalysisRequest) -> AdapterOutput:
        if request.media_path is None:
            raise AdapterError("cần request.media_path để dò cảnh", reason="unsupported_media")
        cuts = [
            {"time": value, "confidence": self.confidence, "boundary": "cut"}
            for value in self.detect(request.media_path)
            if 0 < value < request.duration_seconds
        ]
        return ShotBoundaryAdapter(
            cuts,
            analyzer_id=self.analyzer_id,
            name=self.name,
            version=self.version,
        ).produce(request)


# --- Transcription -------------------------------------------------------


class TranscriptionAdapter(AnalysisAdapter):
    """Normalises the pipeline's own ASR output into transcript observations.

    The ASR itself stays in ``remake_pipeline.step2_transcribe``; this adapter
    only converts its ``{"language", "segments": [{start, end, text}]}`` shape
    into UV-300 observations, so there is one transcription engine, not two.
    """

    analyzer_kind = "transcript"

    def __init__(
        self,
        transcription: dict[str, Any],
        *,
        analyzer_id: str = "analyzer.pipeline.asr",
        name: str = "pipeline-transcription",
        version: str = "1.0.0",
        confidence: float = 0.8,
        speaker_label: str | None = None,
        emit_audio_events: bool = True,
        **kwargs: Any,
    ) -> None:
        super().__init__(analyzer_id, name, version, **kwargs)
        if not isinstance(transcription, dict):
            raise AdapterError("transcription phải là object", reason="internal_error")
        self.transcription = json.loads(json.dumps(transcription))
        self.confidence = confidence
        self.speaker_label = speaker_label
        self.emit_audio_events = emit_audio_events

    def segments(self) -> list[dict[str, Any]]:
        raw = self.transcription.get("segments")
        if not isinstance(raw, list) or not raw:
            raise AdapterError("transcription không có segment nào", reason="low_quality_input")
        language = self.transcription.get("language")
        if isinstance(language, str) and language.lower() in {"auto", "", "unknown"}:
            language = None
        output: list[dict[str, Any]] = []
        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                raise AdapterError(f"segments[{index}] phải là object", reason="internal_error")
            segment: dict[str, Any] = {
                "start": item.get("start"),
                "end": item.get("end"),
                "text": item.get("text"),
                "confidence": item.get("confidence", self.confidence),
            }
            if language:
                segment["language"] = language
            label = item.get("speaker") or item.get("speaker_label") or self.speaker_label
            if label:
                segment["speaker"] = label
            output.append(segment)
        return output

    def produce(self, request: AnalysisRequest) -> AdapterOutput:
        return TranscriptAdapter(
            self.segments(),
            analyzer_id=self.analyzer_id,
            name=self.name,
            version=self.version,
            emit_audio_events=self.emit_audio_events,
        ).produce(request)


# --- Entry point ---------------------------------------------------------


def analyse_media(
    path: str | Path,
    *,
    transcription: dict[str, Any] | None = None,
    analysis_id: str | None = None,
    extra_adapters: Sequence[AnalysisAdapter] = (),
    scene_threshold: float = DEFAULT_SCENE_THRESHOLD,
    allow_network: bool = False,
    source_id: str | None = None,
) -> AnalysisRunResult:
    """Probe a real file and run the shot and transcript analyzers over it."""
    probe = probe_source(path, source_id=source_id)
    request = AnalysisRequest(
        analysis_id=analysis_id or f"analysis.{_slug(Path(probe.path).stem)}",
        source=probe.as_source(),
        duration_seconds=probe.duration_seconds,
        media_path=probe.path,
        allow_network=allow_network,
    )
    adapters: list[AnalysisAdapter] = [FfmpegShotAdapter(threshold=scene_threshold)]
    if transcription is not None:
        adapters.append(TranscriptionAdapter(transcription))
    adapters.extend(extra_adapters)
    return run_analysis(request, adapters)


__all__ = [
    "DEFAULT_SCENE_THRESHOLD",
    "FfmpegShotAdapter",
    "ProbeError",
    "SourceProbe",
    "TranscriptionAdapter",
    "analyse_media",
    "file_sha256",
    "parse_scene_times",
    "probe_source",
]
