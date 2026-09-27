"""Stock video có giấy phép cho variant wildlife (docs/PLAN_VARIANT_V2_COMPLETION.md WS-E).

Chỉ lấy từ Pexels và Pixabay (API chính thức, giấy phép cho phép dùng thương mại, không cần ghi nguồn). Không bao giờ lấy
từ TikTok/YouTube. Key trong key vault `stock.pexels` / `stock.pixabay` (hoặc env PEXELS_API_KEY / PIXABAY_API_KEY).

Ledger `storage/stock_ledger.db` giữ mỗi clip đã nhận: provider, id, URL gốc, sha256 nội dung, pHash 5 khung, thời lượng,
giấy phép, tác giả, acc sở hữu và đoạn đã dùng. Một clip đã gán acc A không bao giờ được gán acc B, kể cả khi cùng footage
đến từ provider khác (≥ 3/5 khung pHash cách ≤ FRAME_MAX_DISTANCE bit).

Tắt mặc định: chỉ chạy khi TOKMATRIX_STOCK_VIDEO=1 (chủ repo chưa quyết Q3; variant vẫn dùng ảnh AI).

    python3 -m bkt_web.stock_video search "snow leopard hunting" [--provider pexels]
    python3 -m bkt_web.stock_video fetch "snow leopard hunting" --account 12 --out /tmp/clip.mp4 [--min-duration 6]
    python3 -m bkt_web.stock_video check /tmp/clip.mp4 --account 12
    python3 -m bkt_web.stock_video stats
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "storage" / "stock_ledger.db"
PROVIDERS = ("pexels", "pixabay")
KEY_NAMES = {"pexels": "stock.pexels", "pixabay": "stock.pixabay"}
KEY_ENV = {"pexels": "PEXELS_API_KEY", "pixabay": "PIXABAY_API_KEY"}
LICENSES = {"pexels": "Pexels License", "pixabay": "Pixabay Content License"}
FRAME_COUNT = 5
FRAME_MAX_DISTANCE = 8   # /64 bit: cùng footage nén lại, đổi cỡ, cắt nhẹ
FRAME_MATCHES = 3        # ≥ 3/5 khung khớp → cùng footage
USER_AGENT = "tokmatrix-stock/1"

SCHEMA = """
CREATE TABLE IF NOT EXISTS clips (
    provider TEXT NOT NULL,
    provider_clip_id TEXT NOT NULL,
    canonical_url TEXT DEFAULT '',
    content_sha256 TEXT NOT NULL,
    frame_hashes TEXT DEFAULT '',
    duration REAL DEFAULT 0,
    license TEXT DEFAULT '',
    author TEXT DEFAULT '',
    owner_account INTEGER NOT NULL,
    used_segments TEXT DEFAULT '[]',
    created_at REAL NOT NULL,
    PRIMARY KEY (provider, provider_clip_id)
);
CREATE INDEX IF NOT EXISTS clips_sha ON clips(content_sha256);
CREATE INDEX IF NOT EXISTS clips_owner ON clips(owner_account);
"""


def enabled() -> bool:
    return os.environ.get("TOKMATRIX_STOCK_VIDEO", "0").strip().lower() in ("1", "true", "on", "yes")


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

def api_key(provider: str) -> str:
    value = os.environ.get(KEY_ENV[provider], "").strip()
    if value:
        return value
    try:
        from bkt_web.key_vault import get_key
    except ImportError:  # chạy trong bkt_web/
        from key_vault import get_key  # type: ignore
    try:
        return get_key(KEY_NAMES[provider]) or ""
    except Exception:
        return ""


def _get_json(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 30) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _download(url: str, dest: Path, timeout: int = 120) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response, open(dest, "wb") as out:
        shutil.copyfileobj(response, out)


def _pick_file(files: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """File MP4 dọc (hoặc lớn nhất) có cạnh ngắn ≥ 720 và ≤ 1440 — đủ nét cho 1080×1920, không tải 4K vô ích."""
    usable = [f for f in files if f.get("link") and 720 <= min(f.get("width") or 0, f.get("height") or 0) <= 1440]
    if not usable:
        usable = [f for f in files if f.get("link")]
    if not usable:
        return None
    return sorted(usable, key=lambda f: (-(1 if (f.get("height") or 0) > (f.get("width") or 0) else 0), -(f.get("width") or 0)))[0]


def _pexels(query: str, key: str, per_page: int) -> List[Dict[str, Any]]:
    url = "https://api.pexels.com/videos/search?" + urllib.parse.urlencode({"query": query, "per_page": per_page, "orientation": "portrait"})
    data = _get_json(url, {"Authorization": key})
    out = []
    for video in data.get("videos") or []:
        chosen = _pick_file([{"link": f.get("link"), "width": f.get("width"), "height": f.get("height")}
                             for f in video.get("video_files") or [] if f.get("file_type") == "video/mp4"])
        if not chosen:
            continue
        out.append({
            "provider": "pexels", "provider_clip_id": str(video.get("id")), "canonical_url": video.get("url") or "",
            "download_url": chosen["link"], "width": chosen.get("width") or 0, "height": chosen.get("height") or 0,
            "duration": float(video.get("duration") or 0), "author": (video.get("user") or {}).get("name", ""),
            "license": LICENSES["pexels"],
        })
    return out


def _pixabay(query: str, key: str, per_page: int) -> List[Dict[str, Any]]:
    url = "https://pixabay.com/api/videos/?" + urllib.parse.urlencode({"key": key, "q": query, "per_page": max(3, per_page), "safesearch": "true"})
    data = _get_json(url)
    out = []
    for hit in data.get("hits") or []:
        sizes = hit.get("videos") or {}
        chosen = _pick_file([{"link": v.get("url"), "width": v.get("width"), "height": v.get("height")} for v in sizes.values()])
        if not chosen:
            continue
        out.append({
            "provider": "pixabay", "provider_clip_id": str(hit.get("id")), "canonical_url": hit.get("pageURL") or "",
            "download_url": chosen["link"], "width": chosen.get("width") or 0, "height": chosen.get("height") or 0,
            "duration": float(hit.get("duration") or 0), "author": hit.get("user") or "", "license": LICENSES["pixabay"],
        })
    return out


SEARCHERS = {"pexels": _pexels, "pixabay": _pixabay}


def search(query: str, providers: Iterable[str] = PROVIDERS, per_page: int = 10) -> List[Dict[str, Any]]:
    """Ứng viên từ các provider có key (provider không có key hoặc lỗi mạng bị bỏ qua, ghi vào `errors`)."""
    results: List[Dict[str, Any]] = []
    for provider in providers:
        key = api_key(provider)
        if not key:
            continue
        try:
            results.extend(SEARCHERS[provider](query, key, per_page))
        except Exception as exc:  # một provider lỗi không chặn provider kia
            print(f"stock_video: {provider} search failed: {exc}", file=sys.stderr)
    return results


# ---------------------------------------------------------------------------
# Vân tay + ledger
# ---------------------------------------------------------------------------

def fingerprint(path: Path) -> Dict[str, Any]:
    from bkt_web.video_fingerprint import _probe_duration, phash, video_frames

    path = Path(path)
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    duration = _probe_duration(path)
    frames = video_frames(path, count=FRAME_COUNT, duration=duration)
    return {"sha256": digest.hexdigest(), "frames": [format(phash(frame.astype("float32")), "016x") for frame in frames],
            "duration": round(duration, 3)}


def _hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def same_footage(a: List[str], b: List[str]) -> bool:
    """≥ FRAME_MATCHES khung của a có khung gần trong b (thứ tự khung có thể lệch vì cắt đầu/cuối khác nhau)."""
    if not a or not b:
        return False
    matches = sum(1 for x in a if any(_hamming(x, y) <= FRAME_MAX_DISTANCE for y in b))
    return matches >= min(FRAME_MATCHES, len(a), len(b))


def conflicts(conn: sqlite3.Connection, candidate: Dict[str, Any], fp: Dict[str, Any], account: int) -> List[Dict[str, Any]]:
    """Clip trong ledger thuộc acc KHÁC mà trùng id, trùng nội dung hoặc cùng footage."""
    out = []
    for row in conn.execute("SELECT * FROM clips WHERE owner_account != ?", (int(account),)):
        reason = None
        if row["provider"] == candidate.get("provider") and row["provider_clip_id"] == str(candidate.get("provider_clip_id")):
            reason = "same_clip"
        elif row["content_sha256"] == fp["sha256"]:
            reason = "same_bytes"
        elif same_footage(fp["frames"], [h for h in (row["frame_hashes"] or "").split(",") if h]):
            reason = "same_footage"
        if reason:
            out.append({"reason": reason, "provider": row["provider"], "provider_clip_id": row["provider_clip_id"],
                        "owner_account": row["owner_account"]})
    return out


def assign(conn: sqlite3.Connection, candidate: Dict[str, Any], fp: Dict[str, Any], account: int,
           segment: Optional[List[float]] = None) -> None:
    """Ghi clip cho acc (gọi sau khi conflicts rỗng). Cùng acc dùng lại clip thì chỉ thêm đoạn đã dùng."""
    key = (candidate["provider"], str(candidate["provider_clip_id"]))
    row = conn.execute("SELECT owner_account, used_segments FROM clips WHERE provider=? AND provider_clip_id=?", key).fetchone()
    if row and row["owner_account"] != int(account):
        raise ValueError(f"clip {key} already belongs to account {row['owner_account']}")
    segments = json.loads(row["used_segments"]) if row else []
    if segment:
        segments.append([round(float(segment[0]), 3), round(float(segment[1]), 3)])
    conn.execute(
        "INSERT INTO clips(provider, provider_clip_id, canonical_url, content_sha256, frame_hashes, duration, license, author,"
        " owner_account, used_segments, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
        " ON CONFLICT(provider, provider_clip_id) DO UPDATE SET used_segments=excluded.used_segments",
        (*key, candidate.get("canonical_url", ""), fp["sha256"], ",".join(fp["frames"]), fp["duration"],
         candidate.get("license", ""), candidate.get("author", ""), int(account), json.dumps(segments), time.time()),
    )
    conn.commit()


def fetch_for_scene(query: str, account: int, dest: Path, *, min_duration: float = 5.0, conn: Optional[sqlite3.Connection] = None,
                    providers: Iterable[str] = PROVIDERS, per_page: int = 10) -> Optional[Dict[str, Any]]:
    """Clip đầu tiên hợp lệ cho acc: đủ dài, không thuộc acc khác. Trả metadata (ghi ledger) hoặc None.

    None khi tắt, không có key, không có kết quả hay mọi ứng viên đều trùng: caller dùng bước fallback kế tiếp
    (IMAGE_AI) của assetProfile, không bao giờ im lặng lấy clip của acc khác.
    """
    if not enabled():
        return None
    own = conn is None
    conn = conn or connect()
    try:
        for candidate in search(query, providers, per_page):
            if candidate["duration"] < min_duration:
                continue
            with tempfile.TemporaryDirectory(prefix="stock-") as tmp:
                path = Path(tmp) / "clip.mp4"
                try:
                    _download(candidate["download_url"], path)
                    fp = fingerprint(path)
                except Exception as exc:
                    print(f"stock_video: skip {candidate['provider']}:{candidate['provider_clip_id']}: {exc}", file=sys.stderr)
                    continue
                if conflicts(conn, candidate, fp, account):
                    continue
                Path(dest).parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), str(dest))
            assign(conn, candidate, fp, account, [0, min(candidate["duration"], min_duration)])
            return {**{k: v for k, v in candidate.items() if k != "download_url"}, "sha256": fp["sha256"], "path": str(dest)}
        return None
    finally:
        if own:
            conn.close()


def stats(conn: sqlite3.Connection) -> Dict[str, Any]:
    rows = conn.execute("SELECT provider, COUNT(*) n, COUNT(DISTINCT owner_account) accounts FROM clips GROUP BY provider").fetchall()
    return {"providers": {row["provider"]: {"clips": row["n"], "accounts": row["accounts"]} for row in rows},
            "enabled": enabled(), "keys": {p: bool(api_key(p)) for p in PROVIDERS}}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m bkt_web.stock_video")
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--provider", choices=PROVIDERS, action="append")
    f = sub.add_parser("fetch")
    f.add_argument("query")
    f.add_argument("--account", type=int, required=True)
    f.add_argument("--out", required=True)
    f.add_argument("--min-duration", type=float, default=5.0)
    c = sub.add_parser("check")
    c.add_argument("path")
    c.add_argument("--account", type=int, required=True)
    sub.add_parser("stats")
    args = parser.parse_args(argv)
    if args.cmd == "search":
        print(json.dumps(search(args.query, args.provider or PROVIDERS), ensure_ascii=False, indent=1))
    elif args.cmd == "fetch":
        if not enabled():
            print("stock video is off (TOKMATRIX_STOCK_VIDEO=1 to enable)", file=sys.stderr)
            return 2
        result = fetch_for_scene(args.query, args.account, Path(args.out), min_duration=args.min_duration)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result else 1
    elif args.cmd == "check":
        with connect() as conn:
            found = conflicts(conn, {}, fingerprint(Path(args.path)), args.account)
        print(json.dumps(found))
        return 1 if found else 0
    else:
        with connect() as conn:
            print(json.dumps(stats(conn), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
