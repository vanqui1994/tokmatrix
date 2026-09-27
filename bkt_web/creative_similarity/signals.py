"""Tín hiệu so độ giống giữa hai video (plugin): mỗi tín hiệu có name, version, extract(sample) → features (JSON được),
compare(a, b) → 0..1 (1 = giống hệt). docs/MATRIX_VARIANT_SYSTEM_V2.md mục 10.

`sample` = {"slug", "frames": [np.ndarray RGB uint8 H×W×3], "meta": {...}} — khung lấy từ MP4 (ffmpeg) hoặc từ ảnh
chụp preview (hyperframes snapshot). Chỉ dùng numpy + PIL.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List

import numpy as np
from PIL import Image

GRID_W = 9
GRID_H = 16


def _gray(frame: np.ndarray) -> np.ndarray:
    return (frame[..., 0] * 0.299 + frame[..., 1] * 0.587 + frame[..., 2] * 0.114).astype(np.float32)


def _resize(frame: np.ndarray, width: int, height: int) -> np.ndarray:
    return np.asarray(Image.fromarray(frame).resize((width, height), Image.BILINEAR))


def _cells(values: np.ndarray) -> np.ndarray:
    """Trung bình theo lưới 9×16 (ảnh đã resize về bội số của lưới)."""
    h, w = values.shape
    return values.reshape(GRID_H, h // GRID_H, GRID_W, w // GRID_W).mean(axis=(1, 3))


def _correlation(a: List[float], b: List[float]) -> float:
    x = np.asarray(a, dtype=np.float64)
    y = np.asarray(b, dtype=np.float64)
    if x.size == 0 or x.size != y.size:
        return 0.0
    x = x - x.mean()
    y = y - y.mean()
    den = float(np.sqrt((x * x).sum() * (y * y).sum()))
    if den < 1e-9:
        return 1.0 if float(np.abs(x - y).sum()) < 1e-9 else 0.0
    return float(max(0.0, min(1.0, (x * y).sum() / den)))


# --- layout: mật độ cạnh theo lưới 9×16, trung bình qua các khung (bố cục tĩnh của template) -----------------------
def layout_extract(sample: Dict[str, Any]) -> Dict[str, Any]:
    maps = []
    for frame in sample["frames"]:
        g = _gray(_resize(frame, GRID_W * 20, GRID_H * 20))
        gx = np.abs(np.diff(g, axis=1, append=g[:, -1:]))
        gy = np.abs(np.diff(g, axis=0, append=g[-1:, :]))
        maps.append(_cells(gx + gy))
    mean = np.mean(maps, axis=0)
    total = float(mean.sum()) or 1.0
    return {"grid": (mean / total).round(6).flatten().tolist()}


def layout_compare(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    return _correlation(a["grid"], b["grid"])


# --- motion: năng lượng khác biệt giữa các khung liên tiếp theo ô lưới ------------------------------------------------
def motion_extract(sample: Dict[str, Any]) -> Dict[str, Any]:
    frames = [_gray(_resize(frame, GRID_W * 12, GRID_H * 12)) for frame in sample["frames"]]
    if len(frames) < 2:
        return {"grid": [0.0] * (GRID_W * GRID_H), "energy": 0.0}
    diffs = [_cells(np.abs(b - a)) for a, b in zip(frames, frames[1:])]
    mean = np.mean(diffs, axis=0)
    return {"grid": mean.round(4).flatten().tolist(), "energy": round(float(mean.mean()), 4)}


def motion_compare(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    spatial = _correlation(a["grid"], b["grid"])
    ea, eb = a["energy"], b["energy"]
    level = 1.0 - abs(ea - eb) / max(ea, eb, 1e-6)
    return round(0.7 * spatial + 0.3 * max(0.0, level), 6)


# --- color: histogram HSV (12 sắc × 4 bão hoà × 4 sáng), so bằng giao histogram ------------------------------------
def color_extract(sample: Dict[str, Any]) -> Dict[str, Any]:
    hist = np.zeros(12 * 4 * 4, dtype=np.float64)
    for frame in sample["frames"]:
        hsv = np.asarray(Image.fromarray(_resize(frame, 108, 192)).convert("HSV")).reshape(-1, 3).astype(np.int32)
        idx = (hsv[:, 0] * 12 // 256) * 16 + (hsv[:, 1] * 4 // 256) * 4 + (hsv[:, 2] * 4 // 256)
        hist += np.bincount(idx, minlength=hist.size)
    hist /= hist.sum() or 1.0
    return {"hist": hist.round(6).tolist()}


def color_compare(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    return float(np.minimum(np.asarray(a["hist"]), np.asarray(b["hist"])).sum())


# --- timing: nhịp cảnh (tỉ lệ thời lượng) — phụ thuộc TTS nên trọng số thấp ----------------------------------------
def timing_extract(sample: Dict[str, Any]) -> Dict[str, Any]:
    durations = [float(d) for d in (sample.get("meta", {}).get("scene_durations") or [])]
    total = sum(durations) or 1.0
    return {"ratios": [round(d / total, 5) for d in durations]}


def timing_compare(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    x, y = a["ratios"], b["ratios"]
    if not x or not y:
        return 0.0
    n = max(len(x), len(y))
    x = x + [0.0] * (n - len(x))
    y = y + [0.0] * (n - len(y))
    return round(1.0 - 0.5 * float(np.abs(np.asarray(x) - np.asarray(y)).sum()), 6)


# --- declared: trục hiệu lực + vùng bố cục khai trong meta.creative (tĩnh, không cần video) ------------------------
AXES = ("composition", "textPlacement", "background", "transition", "imageMotion", "typography")


def declared_extract(sample: Dict[str, Any]) -> Dict[str, Any]:
    creative = sample.get("meta", {}).get("creative") or {}
    return {"axes": creative.get("axes") or {}, "layout": creative.get("layout") or {}}


def _iou(a: List[float], b: List[float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def declared_compare(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    parts = []
    if a["axes"] and b["axes"]:
        parts.append(sum(1 for axis in AXES if a["axes"].get(axis) == b["axes"].get(axis)) / len(AXES))
    for region in ("visual", "text", "header"):
        ra, rb = a["layout"].get(region), b["layout"].get(region)
        if ra and rb:
            parts.append(_iou(ra, rb))
        elif ra or rb:
            parts.append(0.0)
    return round(sum(parts) / len(parts), 6) if parts else 0.0


# --- asset: tỉ lệ ảnh/clip trùng sha256 giữa hai video (từ asset ledger hoặc meta) ---------------------------------
def asset_extract(sample: Dict[str, Any]) -> Dict[str, Any]:
    return {"sha256": sorted(set(sample.get("meta", {}).get("asset_sha256") or []))}


def asset_compare(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    x, y = set(a["sha256"]), set(b["sha256"])
    if not x or not y:
        return 0.0
    return round(len(x & y) / min(len(x), len(y)), 6)


# --- visual: pHash từng khung (thuật toán v1 của video_fingerprint), so theo cặp khung cùng vị trí ------------------
def visual_extract(sample: Dict[str, Any]) -> Dict[str, Any]:
    from bkt_web.video_fingerprint import phash

    hashes = []
    for frame in sample["frames"]:
        gray = np.asarray(Image.fromarray(frame).convert("L").resize((64, 64), Image.BILINEAR), dtype=np.float32)
        hashes.append(format(phash(gray), "016x"))
    return {"phash": hashes}


def visual_compare(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    pairs = list(zip(a["phash"], b["phash"]))
    if not pairs:
        return 0.0
    return round(sum(1.0 - bin(int(x, 16) ^ int(y, 16)).count("1") / 64.0 for x, y in pairs) / len(pairs), 6)


class Signal:
    def __init__(self, name: str, version: int, weight: float, extract: Callable, compare: Callable, needs_frames: bool):
        self.name = name
        self.version = version
        self.weight = weight
        self.extract = extract
        self.compare = compare
        self.needs_frames = needs_frames


# Trọng số composite: layout + declared là "khuôn hình" (TikTok gắn cờ vì khuôn dùng chung); timing thấp vì do TTS.
SIGNALS: Dict[str, Signal] = {
    s.name: s for s in [
        Signal("layout", 1, 0.30, layout_extract, layout_compare, True),
        Signal("declared", 1, 0.15, declared_extract, declared_compare, False),
        Signal("visual", 1, 0.15, visual_extract, visual_compare, True),
        Signal("motion", 1, 0.15, motion_extract, motion_compare, True),
        Signal("color", 1, 0.10, color_extract, color_compare, True),
        Signal("asset", 1, 0.10, asset_extract, asset_compare, False),
        Signal("timing", 1, 0.05, timing_extract, timing_compare, False),
    ]
}
