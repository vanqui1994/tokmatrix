"""Sửa remake_vector_catalog.json an toàn khi nhiều agent chạy song song.

    from scripts.catalog_edit import edit_catalog
    with edit_catalog() as cat:      # khoá file, đọc bản MỚI NHẤT, ghi lại khi thoát khối
        cat["assets"]["my_rig"] = {...}

Chỉ thêm/sửa mục của gói mình; không ghi lại cả catalog từ bản đọc lúc đầu chạy script (sẽ xoá mục gói khác vừa thêm).
"""
from __future__ import annotations

import contextlib
import fcntl
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "bkt_web" / "static" / "remake_vector_catalog.json"
LOCK = CATALOG.with_suffix(".lock")


@contextlib.contextmanager
def edit_catalog(path: Path = CATALOG):
    with open(LOCK, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            yield data
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            tmp.replace(path)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
