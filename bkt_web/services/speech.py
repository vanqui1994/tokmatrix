"""Nhận dạng giọng nói (faster-whisper, CPU int8) — chỗ duy nhất tải model và đọc kết quả.

    from bkt_web.services import speech
    r = speech.transcribe(path, size="small", vad=True)          # {"language", "probability", "segments": [...]}
    r = speech.transcribe(path, language="ko", words=True)       # segments kèm "words": [[start, end, word], ...]

Model không giữ lại trong RAM giữa các lần gọi (server chạy lâu, VPS ít RAM); `keep=True` giữ lại cho vòng lặp nhiều file.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Dict, Optional, Union

_lock = threading.Lock()
_models: Dict[str, Any] = {}


def model(size: str = "small", keep: bool = False):
    from faster_whisper import WhisperModel

    with _lock:
        if size in _models:
            return _models[size]
        m = WhisperModel(size, device="cpu", compute_type="int8")
        if keep:
            _models[size] = m
        return m


def transcribe(audio: Union[str, Path], *, size: str = "small", language: Optional[str] = None, vad: bool = False,
               words: bool = False, keep: bool = False) -> Dict[str, Any]:
    """Các đoạn có chữ (đã strip, bỏ đoạn rỗng). `language` None/"auto" = tự nhận."""
    lang = None if language in (None, "", "auto") else language
    segs, info = model(size, keep).transcribe(str(audio), language=lang, vad_filter=vad, word_timestamps=words)
    segments = []
    for s in segs:
        item: Dict[str, Any] = {"start": round(float(s.start), 2), "end": round(float(s.end), 2), "text": s.text.strip()}
        if words:
            item["words"] = [[round(float(w.start), 2), round(float(w.end), 2), w.word.strip()] for w in (s.words or [])]
        if item["text"] or item.get("words"):
            segments.append(item)
    return {"language": info.language, "probability": round(float(info.language_probability), 4), "segments": segments}
