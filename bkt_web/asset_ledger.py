"""Asset ledger: một ảnh/clip thuộc scope ACCOUNT / VIDEO / SCENE chỉ được xuất hiện ở MỘT acc TikTok.

docs/MATRIX_VARIANT_SYSTEM_V2.md mục 9.1. Ghi sha256 + pHash của ảnh cảnh (`videos/<slug>/assets/images/*`) khi
video được xếp lịch đăng lên một acc; trước khi xếp lịch, video nào có ảnh (trùng sha256, hoặc pHash gần) đã thuộc
acc khác thì bị chặn. Asset GLOBAL/COUNTRY/VARIANT (texture, font, kit trong `assets/kit`, `assets/fonts`) không
được ghi — chúng là một phần layout và được đo bằng bkt_web.creative_similarity.

Clip stock của video (`assets/video/*.mp4`, variant wildlife stock-first) được ghi như ảnh cảnh (sha256, scope VIDEO), và
`verdict` còn đòi mỗi clip trong `meta.json` → `creative.stock_clips` thuộc đúng acc trong stock ledger
(bkt_web.stock_video): clip chưa ghi hoặc của acc khác thì chặn. Kiểm tra sở hữu stock này chạy cả khi
TOKMATRIX_ASSET_LEDGER=0 (clip stock không bao giờ được đăng ở acc không sở hữu).

Tắt bằng TOKMATRIX_ASSET_LEDGER=0.

    python3 -m bkt_web.asset_ledger check <slug> <tiktok_id>
    python3 -m bkt_web.asset_ledger stats
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "storage" / "asset_ledger.db"
VIDEOS_DIR = BASE_DIR.parent / "compare_studio" / "videos"
PRIVATE_SCOPES = ("ACCOUNT", "VIDEO", "SCENE")
SCOPES = ("GLOBAL", "COUNTRY", "VARIANT") + PRIVATE_SCOPES
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_SUFFIXES = {".mp4"}
PHASH_MAX_DISTANCE = 6  # /64 bit — ảnh cắt lại/nén lại của cùng một ảnh

SCHEMA = """
CREATE TABLE IF NOT EXISTS assets (
    sha256 TEXT NOT NULL,
    phash TEXT DEFAULT '',
    scope TEXT NOT NULL,
    owner_account INTEGER,
    provider TEXT DEFAULT '',
    provider_id TEXT DEFAULT '',
    video_slug TEXT DEFAULT '',
    path TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (sha256, owner_account)
);
CREATE INDEX IF NOT EXISTS idx_assets_phash ON assets(phash);
CREATE INDEX IF NOT EXISTS idx_assets_slug ON assets(video_slug);
"""


def enabled() -> bool:
    return os.environ.get("TOKMATRIX_ASSET_LEDGER", "1").strip().lower() not in ("0", "false", "off", "no")


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.executescript(SCHEMA)
    return conn


def _phash_file(path: Path) -> str:
    try:
        import numpy as np
        from PIL import Image

        from bkt_web.video_fingerprint import phash

        gray = np.asarray(Image.open(path).convert("L").resize((64, 64), Image.BILINEAR), dtype=np.float32)
        return format(phash(gray), "016x")
    except Exception:  # ảnh hỏng/không đọc được: vẫn so bằng sha256
        return ""


def stock_clips(slug: str, videos_dir: Path = VIDEOS_DIR) -> List[Dict[str, Any]]:
    """Clip stock mà video dùng (meta.json → creative.stock_clips), rỗng nếu không có."""
    try:
        meta = json.loads((Path(videos_dir) / slug / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    clips = (meta.get("creative") or {}).get("stock_clips") if isinstance(meta, dict) else None
    return [clip for clip in clips or [] if isinstance(clip, dict)]


def _stock_assets(slug: str, vdir: Path, videos_dir: Path) -> List[Dict[str, Any]]:
    clips_dir = vdir / "assets" / "video"
    if not clips_dir.is_dir():
        return []
    by_file = {Path(str(clip.get("file") or "")).name: clip for clip in stock_clips(slug, videos_dir)}
    out = []
    for path in sorted(clips_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in VIDEO_SUFFIXES:
            continue
        info = by_file.get(path.name, {})
        out.append({
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "phash": "", "scope": "VIDEO",
            "provider": str(info.get("provider") or "stock"), "provider_id": str(info.get("provider_clip_id") or ""),
            "path": str(path.relative_to(vdir)),
        })
    return out


def stock_verdict(slug: str, tiktok_id: int, *, videos_dir: Path = VIDEOS_DIR,
                  stock_conn: Optional[sqlite3.Connection] = None) -> Optional[str]:
    """Lý do chặn nếu video có clip stock mà acc không sở hữu trong stock ledger; None nếu không có clip hoặc hợp lệ."""
    clips = stock_clips(slug, videos_dir)
    if not clips:
        return None
    try:
        from bkt_web import stock_video
    except ImportError:  # chạy trong bkt_web/
        import stock_video  # type: ignore
    if stock_conn is None and not stock_video.DB_PATH.exists():
        return f"{len(clips)} clip stock nhưng chưa có stock ledger"
    own = stock_conn or stock_video.connect()
    try:
        problems = stock_video.ownership_problems(clips, tiktok_id, own)
    finally:
        if stock_conn is None:
            own.close()
    return f"{problems[0]}" + (f" (+{len(problems) - 1})" if len(problems) > 1 else "") if problems else None


def video_assets(slug: str, videos_dir: Path = VIDEOS_DIR) -> List[Dict[str, Any]]:
    """Ảnh cảnh + clip stock (scope VIDEO) của một video, kèm nguồn từ images.json / meta.json nếu có."""
    vdir = Path(videos_dir) / slug
    images_dir = vdir / "assets" / "images"
    sources: Dict[str, Dict[str, Any]] = {}
    try:
        state = json.loads((vdir / "images.json").read_text(encoding="utf-8"))
        items = state.get("items") if isinstance(state, dict) else state
        for item in (items.values() if isinstance(items, dict) else items or []):
            if isinstance(item, dict) and item.get("dest"):
                sources[Path(str(item["dest"])).name] = item
    except (OSError, ValueError):
        pass
    out = _stock_assets(slug, vdir, videos_dir)
    if not images_dir.is_dir():
        return out
    for path in sorted(images_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        info = sources.get(path.name, {})
        out.append({
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "phash": _phash_file(path),
            "scope": "VIDEO",
            "provider": str(info.get("source") or ""),
            "provider_id": str(info.get("taskId") or ""),
            "path": str(path.relative_to(vdir)),
        })
    return out


def _hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def conflicts(conn: sqlite3.Connection, assets: Iterable[Dict[str, Any]], owner_account: int) -> List[Dict[str, Any]]:
    """Asset riêng tư đã thuộc một acc KHÁC (trùng sha256, hoặc pHash cách ≤ PHASH_MAX_DISTANCE)."""
    found = []
    marks = ",".join("?" for _ in PRIVATE_SCOPES)
    others = conn.execute(
        f"SELECT sha256, phash, owner_account, video_slug, path FROM assets WHERE scope IN ({marks}) AND owner_account<>?",
        (*PRIVATE_SCOPES, int(owner_account)),
    ).fetchall()
    by_sha = {}
    for row in others:
        by_sha.setdefault(row[0], row)
    for asset in assets:
        if asset.get("scope", "VIDEO") not in PRIVATE_SCOPES:
            continue
        hit = by_sha.get(asset["sha256"])
        kind = "sha256"
        if hit is None and asset.get("phash"):
            for row in others:
                if row[1] and _hamming(asset["phash"], row[1]) <= PHASH_MAX_DISTANCE:
                    hit, kind = row, "phash"
                    break
        if hit is not None:
            found.append({"path": asset["path"], "match": kind, "owner_account": hit[2], "video_slug": hit[3], "other_path": hit[4]})
    return found


def register(conn: sqlite3.Connection, slug: str, owner_account: int, assets: Iterable[Dict[str, Any]]) -> int:
    now = int(time.time())
    rows = [(a["sha256"], a.get("phash", ""), a.get("scope", "VIDEO"), int(owner_account), a.get("provider", ""),
             a.get("provider_id", ""), slug, a.get("path", ""), now) for a in assets]
    conn.executemany("INSERT OR IGNORE INTO assets VALUES (?,?,?,?,?,?,?,?,?)", rows)
    conn.commit()
    return len(rows)


def verdict(slug: str, tiktok_id: int, *, conn: Optional[sqlite3.Connection] = None,
            videos_dir: Path = VIDEOS_DIR, stock_conn: Optional[sqlite3.Connection] = None) -> Optional[str]:
    """Lý do chặn (clip stock không thuộc acc, ảnh/clip cảnh đã thuộc acc khác) hoặc None. Không ghi gì."""
    stock = stock_verdict(slug, tiktok_id, videos_dir=videos_dir, stock_conn=stock_conn)
    if stock:
        return stock
    if not enabled():
        return None
    if conn is None and not DB_PATH.exists():  # chưa có gì được ghi → không thể trùng; không tạo DB (chạy thử)
        return None
    own = conn or connect()
    try:
        hits = conflicts(own, video_assets(slug, videos_dir), tiktok_id)
    finally:
        if conn is None:
            own.close()
    if not hits:
        return None
    first = hits[0]
    return (f"{len(hits)} ảnh cảnh đã dùng cho acc #{first['owner_account']} "
            f"({first['video_slug']}/{first['other_path']}, trùng {first['match']})")


def record(slug: str, tiktok_id: int, *, conn: Optional[sqlite3.Connection] = None, videos_dir: Path = VIDEOS_DIR) -> int:
    """Ghi ảnh cảnh của video cho acc (gọi sau khi task đăng được tạo)."""
    if not enabled():
        return 0
    assets = video_assets(slug, videos_dir)
    if not assets:
        return 0
    own = conn or connect()
    try:
        return register(own, slug, tiktok_id, assets)
    finally:
        if conn is None:
            own.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Asset ledger")
    sub = parser.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("slug")
    c.add_argument("tiktok_id", type=int)
    sub.add_parser("stats")
    args = parser.parse_args(argv)
    conn = connect()
    if args.cmd == "check":
        reason = verdict(args.slug, args.tiktok_id, conn=conn)
        print(reason or "ok")
        return 1 if reason else 0
    rows = conn.execute("SELECT scope, COUNT(*), COUNT(DISTINCT owner_account) FROM assets GROUP BY scope").fetchall()
    print(json.dumps({scope: {"assets": n, "accounts": accounts} for scope, n, accounts in rows}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
