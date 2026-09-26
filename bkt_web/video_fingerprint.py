"""Dấu vân tay video để phát hiện trước những video TikTok sẽ đánh "trùng lặp".

26/09: TikTok đánh trùng video science/kinetic với *video đầu tiên cùng thể loại* — khuôn hình dùng
chung (nhân vật, nền, khung) + cùng nhạc nền + cùng giọng. Module này đo độ giống giữa hai video:

- hình: pHash 64-bit của 24 khung trải đều + pHash của "khung trung bình" (phần đứng yên của template);
- âm thanh: vân tay dải tần kiểu Haitsma–Kalker (31 bit/khung ~46 ms), so ở nhiều độ lệch;
- metadata: md5 file nhạc nền và giọng đọc (đọc từ thư mục video nếu có).

Chỉ dùng ffmpeg + numpy + PIL (không cần fpcalc). Vân tay lưu ở storage/video_fingerprints.db.

    python3 -m bkt_web.video_fingerprint scan            # tính vân tay mọi video đã render (bỏ qua cái đã có)
    python3 -m bkt_web.video_fingerprint report          # độ giống theo thể loại + các cặp giống nhất
    python3 -m bkt_web.video_fingerprint compare A B     # so hai slug
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
VIDEOS_DIR = BASE_DIR.parent / "compare_studio" / "videos"
DB_PATH = BASE_DIR / "storage" / "video_fingerprints.db"
VERSION = 1
FRAMES = 24
AUDIO_RATE = 5512
FRAME_MATCH_BITS = 12  # hai khung coi là "giống" nếu pHash lệch ≤ 12/64 bit

SCHEMA = """
CREATE TABLE IF NOT EXISTS fingerprints (
    video_slug TEXT PRIMARY KEY,
    engine TEXT DEFAULT '',
    lang TEXT DEFAULT '',
    duration REAL DEFAULT 0,
    frames TEXT NOT NULL,        -- JSON list pHash (hex)
    mean_frame TEXT NOT NULL,    -- pHash khung trung bình
    audio BLOB,                  -- uint32 vân tay âm thanh
    bgm_md5 TEXT DEFAULT '',
    voice TEXT DEFAULT '',
    mtime REAL DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT 0
);
"""


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


# ---------------------------------------------------------------------------
# Hình
# ---------------------------------------------------------------------------

def _dct_matrix(n: int) -> np.ndarray:
    k = np.arange(n)
    m = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n))
    m[0] *= 1 / np.sqrt(2)
    return m * np.sqrt(2 / n)


_DCT32 = _dct_matrix(32)


def phash(gray: np.ndarray) -> int:
    """pHash 64-bit của ảnh xám (bất kỳ cỡ) — DCT 32×32, lấy khối 8×8 tần số thấp trừ DC."""
    img = np.asarray(Image.fromarray(gray.astype(np.uint8)).resize((32, 32), Image.LANCZOS), dtype=np.float64)
    coeffs = _DCT32 @ img @ _DCT32.T
    block = coeffs[:8, :8].flatten()[1:]
    bits = block > np.median(block)
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return value


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def _probe_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, timeout=60)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def video_frames(path: Path, count: int = FRAMES, duration: Optional[float] = None) -> List[np.ndarray]:
    """count khung xám 96×170 trải đều, bỏ 0,5 s đầu và cuối."""
    duration = duration or _probe_duration(path)
    if duration <= 1.5:
        raise ValueError(f"video quá ngắn: {path}")
    fps = count / max(0.5, duration - 1.0)
    cmd = ["ffmpeg", "-v", "error", "-ss", "0.5", "-i", str(path), "-t", f"{duration - 1.0:.3f}",
           "-vf", f"fps={fps:.6f},scale=96:170,format=gray", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, timeout=300).stdout
    size = 96 * 170
    frames = [np.frombuffer(raw[i:i + size], dtype=np.uint8).reshape(170, 96) for i in range(0, len(raw) - size + 1, size)]
    return frames[:count]


# ---------------------------------------------------------------------------
# Âm thanh
# ---------------------------------------------------------------------------

def audio_fingerprint(path: Path) -> np.ndarray:
    """Vân tay 31 bit/khung (Haitsma–Kalker) trên 33 dải log 300–2000 Hz."""
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(AUDIO_RATE), "-f", "s16le", "-"]
    pcm = np.frombuffer(subprocess.run(cmd, capture_output=True, timeout=300).stdout, dtype=np.int16).astype(np.float32)
    if pcm.size < 4096:
        return np.zeros(0, dtype=np.uint32)
    win, hop = 2048, 256
    count = 1 + (pcm.size - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(count)[:, None]
    spectrum = np.abs(np.fft.rfft(pcm[idx] * np.hanning(win), axis=1)) ** 2
    freqs = np.fft.rfftfreq(win, 1 / AUDIO_RATE)
    edges = np.geomspace(300, 2000, 34)
    bands = np.stack([spectrum[:, (freqs >= lo) & (freqs < hi)].sum(axis=1) for lo, hi in zip(edges[:-1], edges[1:])], axis=1)
    bands = np.log1p(bands)
    diff = bands[:, :-1] - bands[:, 1:]
    bits = (diff[1:] - diff[:-1]) > 0  # (frames-1, 32)
    bits = bits[:, :31]
    weights = (1 << np.arange(31, dtype=np.uint64)).astype(np.uint64)
    return (bits.astype(np.uint64) * weights).sum(axis=1).astype(np.uint32)


def _popcount32(x: np.ndarray) -> np.ndarray:
    x = x - ((x >> 1) & 0x55555555)
    x = (x & 0x33333333) + ((x >> 2) & 0x33333333)
    x = (x + (x >> 4)) & 0x0F0F0F0F
    return ((x * 0x01010101) & 0xFFFFFFFF) >> 24


def audio_similarity(a: np.ndarray, b: np.ndarray, max_shift_seconds: float = 8.0) -> float:
    """1 − tỉ lệ bit lệch tốt nhất khi dịch b quanh a (0,5 ≈ không liên quan → quy về 0)."""
    if a.size < 64 or b.size < 64:
        return 0.0
    hop_seconds = 256 / AUDIO_RATE
    max_shift = int(max_shift_seconds / hop_seconds)
    best = 1.0
    for shift in range(-max_shift, max_shift + 1, 4):
        if shift >= 0:
            x, y = a[shift:], b
        else:
            x, y = a, b[-shift:]
        n = min(x.size, y.size)
        if n < 64:
            continue
        ber = float(_popcount32(np.bitwise_xor(x[:n], y[:n]).astype(np.uint64)).sum()) / (n * 31)
        best = min(best, ber)
    return max(0.0, min(1.0, (0.5 - best) / 0.5))


# ---------------------------------------------------------------------------
# Vân tay 1 video
# ---------------------------------------------------------------------------

def _md5(path: Path) -> str:
    try:
        return hashlib.md5(path.read_bytes()).hexdigest()
    except OSError:
        return ""


def _render_path(video_dir: Path) -> Optional[Path]:
    renders = sorted((p for p in (video_dir / "renders").glob("*.mp4") if ".rejected" not in p.name),
                     key=lambda p: p.stat().st_mtime, reverse=True)
    exact = video_dir / "renders" / f"{video_dir.name}.mp4"
    return exact if exact.exists() else (renders[0] if renders else None)


def fingerprint_video(slug: str, videos_dir: Path = VIDEOS_DIR) -> Dict[str, Any]:
    video_dir = videos_dir / slug
    path = _render_path(video_dir)
    if not path:
        raise FileNotFoundError(f"chưa có MP4: {slug}")
    meta: Dict[str, Any] = {}
    try:
        meta = json.loads((video_dir / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    duration = _probe_duration(path)
    frames = video_frames(path, duration=duration)
    hashes = [phash(f) for f in frames]
    mean = phash(np.mean(np.stack(frames), axis=0)) if frames else 0
    voice = ""
    for key, value in meta.items():
        if isinstance(value, dict) and value.get("voice"):
            voice = str(value.get("voice"))
            break
    return {
        "video_slug": slug, "engine": str(meta.get("type") or ""), "lang": str(meta.get("lang") or ""),
        "duration": duration, "frames": [f"{h:016x}" for h in hashes], "mean_frame": f"{mean:016x}",
        "audio": audio_fingerprint(path), "bgm_md5": _md5(video_dir / "assets" / "audio" / "bgm.mp3"),
        "voice": voice, "mtime": path.stat().st_mtime,
    }


def save(conn: sqlite3.Connection, fp: Dict[str, Any]) -> None:
    conn.execute(
        """INSERT OR REPLACE INTO fingerprints(video_slug,engine,lang,duration,frames,mean_frame,audio,bgm_md5,voice,mtime,version,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (fp["video_slug"], fp["engine"], fp["lang"], fp["duration"], json.dumps(fp["frames"]), fp["mean_frame"],
         fp["audio"].astype(np.uint32).tobytes(), fp["bgm_md5"], fp["voice"], fp["mtime"], VERSION, int(time.time())),
    )
    conn.commit()


def load(conn: sqlite3.Connection, slugs: Optional[Iterable[str]] = None) -> Dict[str, Dict[str, Any]]:
    rows = conn.execute("SELECT video_slug,engine,lang,duration,frames,mean_frame,audio,bgm_md5,voice FROM fingerprints").fetchall()
    wanted = set(slugs) if slugs is not None else None
    out = {}
    for slug, engine, lang, duration, frames, mean, audio, bgm, voice in rows:
        if wanted is not None and slug not in wanted:
            continue
        out[slug] = {"video_slug": slug, "engine": engine, "lang": lang, "duration": duration,
                     "frames": [int(h, 16) for h in json.loads(frames)], "mean_frame": int(mean, 16),
                     "audio": np.frombuffer(audio or b"", dtype=np.uint32), "bgm_md5": bgm, "voice": voice}
    return out


def get_or_compute(conn: sqlite3.Connection, slug: str, videos_dir: Path = VIDEOS_DIR) -> Dict[str, Any]:
    path = _render_path(videos_dir / slug)
    row = conn.execute("SELECT mtime, version FROM fingerprints WHERE video_slug=?", (slug,)).fetchone()
    if not row or not path or abs(row[0] - path.stat().st_mtime) > 1 or row[1] != VERSION:
        fp = fingerprint_video(slug, videos_dir)
        save(conn, fp)
    return load(conn, [slug])[slug]


# ---------------------------------------------------------------------------
# So sánh
# ---------------------------------------------------------------------------

def visual_similarity(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, float]:
    fa, fb = a["frames"], b["frames"]
    if not fa or not fb:
        return {"frames": 0.0, "mean": 0.0}
    def matched(x, y):
        return sum(1 for h in x if min(hamming(h, g) for g in y) <= FRAME_MATCH_BITS) / len(x)
    frames = (matched(fa, fb) + matched(fb, fa)) / 2
    mean = 1 - hamming(a["mean_frame"], b["mean_frame"]) / 64
    return {"frames": round(frames, 3), "mean": round(mean, 3)}


def similarity(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    visual = visual_similarity(a, b)
    return {
        "frames": visual["frames"], "mean_frame": visual["mean"],
        "audio": round(audio_similarity(a["audio"], b["audio"]), 3),
        "same_bgm": bool(a["bgm_md5"]) and a["bgm_md5"] == b["bgm_md5"],
        "same_voice": bool(a["voice"]) and a["voice"] == b["voice"],
    }


def score(sim: Dict[str, Any]) -> float:
    """Một con số 0–1 để xếp hạng: hình là chính, âm thanh/nhạc/giọng cộng thêm."""
    return round(0.55 * sim["frames"] + 0.2 * max(0.0, (sim["mean_frame"] - 0.5) * 2) + 0.15 * sim["audio"]
                 + 0.05 * sim["same_bgm"] + 0.05 * sim["same_voice"], 3)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_scan(args) -> int:
    conn = connect()
    done = {r[0]: r[1] for r in conn.execute("SELECT video_slug, mtime FROM fingerprints WHERE version=?", (VERSION,))}
    slugs = sorted(p.name for p in VIDEOS_DIR.iterdir() if p.is_dir())
    todo = []
    for slug in slugs:
        path = _render_path(VIDEOS_DIR / slug)
        if path and (slug not in done or abs(done[slug] - path.stat().st_mtime) > 1):
            todo.append(slug)
    print(f"{len(todo)} video cần tính vân tay (đã có {len(done)})", flush=True)
    for i, slug in enumerate(todo, 1):
        try:
            save(conn, fingerprint_video(slug))
        except Exception as exc:  # một video lỗi không dừng cả lượt
            print(f"  lỗi {slug}: {exc}", flush=True)
        if i % 20 == 0:
            print(f"  {i}/{len(todo)}", flush=True)
    return 0


def cmd_report(args) -> int:
    fps = load(connect())
    by_engine: Dict[str, List[Dict[str, Any]]] = {}
    for fp in fps.values():
        by_engine.setdefault(fp["engine"] or "?", []).append(fp)
    rng = np.random.default_rng(0)
    print(f"{len(fps)} video có vân tay\n")
    print(f"{'thể loại':10} {'số':>4} | {'cùng thể loại: khung / TB / âm':>32} | {'khác thể loại: khung / TB / âm':>32}")
    all_fps = list(fps.values())
    for engine, items in sorted(by_engine.items(), key=lambda kv: -len(kv[1])):
        same, other = [], []
        for _ in range(min(120, len(items) * (len(items) - 1) // 2)):
            a, b = rng.choice(len(items), 2, replace=False)
            same.append(similarity(items[a], items[b]))
        for _ in range(60):
            a = items[rng.integers(len(items))]
            b = all_fps[rng.integers(len(all_fps))]
            if b["engine"] != engine:
                other.append(similarity(a, b))
        def fmt(rows):
            if not rows:
                return "-"
            return f"{np.median([r['frames'] for r in rows]):.2f} / {np.median([r['mean_frame'] for r in rows]):.2f} / {np.median([r['audio'] for r in rows]):.2f}"
        print(f"{engine:10} {len(items):>4} | {fmt(same):>32} | {fmt(other):>32}")
    if args.pairs:
        print("\nCặp giống nhất:")
        pairs = []
        for engine, items in by_engine.items():
            for i in range(len(items)):
                for j in range(i + 1, len(items)):
                    sim = similarity(items[i], items[j])
                    pairs.append((score(sim), items[i]["video_slug"], items[j]["video_slug"], sim))
        for s, a, b, sim in sorted(pairs, reverse=True)[: args.pairs]:
            print(f"  {s:.2f}  {a}  ~  {b}  {sim}")
    return 0


def cmd_compare(args) -> int:
    conn = connect()
    a, b = get_or_compute(conn, args.a), get_or_compute(conn, args.b)
    sim = similarity(a, b)
    print(json.dumps({**sim, "score": score(sim)}, ensure_ascii=False))
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("scan").set_defaults(fn=cmd_scan)
    rep = sub.add_parser("report")
    rep.add_argument("--pairs", type=int, default=0)
    rep.set_defaults(fn=cmd_report)
    cmp_ = sub.add_parser("compare")
    cmp_.add_argument("a")
    cmp_.add_argument("b")
    cmp_.set_defaults(fn=cmd_compare)
    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
