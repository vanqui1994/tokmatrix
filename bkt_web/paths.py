"""Đường dẫn dùng chung của web app (server.py và các router tách khỏi nó đều lấy từ đây).

Router đọc thuộc tính lúc gọi (`paths.DB_PATH`, không `from paths import DB_PATH`) để test thay được DB tạm.
"""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "bkt_channels.db"
DATA_COOKIES_PATH = PROJECT_ROOT / "data" / "Cookies"
SECRET_KEY_PATH = BASE_DIR / ".secret.key"

STORAGE_DIR = BASE_DIR / "storage"
DOWNLOADS_DIR = STORAGE_DIR / "downloads"
RENDERED_DIR = STORAGE_DIR / "rendered"
OVERLAYS_DIR = STORAGE_DIR / "overlays"
AUDIO_DIR = STORAGE_DIR / "audio"
GENERATED_IMAGES_DIR = STATIC_DIR / "generated_images"

AUTO_COMPARE_DIR = Path(os.environ.get("TOKMATRIX_COMPARE_DIR", str(PROJECT_ROOT / "compare_studio"))).resolve()
if not AUTO_COMPARE_DIR.exists() and (PROJECT_ROOT.parent / "auto-compare-video-mod").exists():
    AUTO_COMPARE_DIR = (PROJECT_ROOT.parent / "auto-compare-video-mod").resolve()
AUTO_COMPARE_VIDEOS_DIR = AUTO_COMPARE_DIR / "videos"
AUTO_COMPARE_TOOLS_DIR = AUTO_COMPARE_DIR / "tools"


def ensure_dirs() -> None:
    for d in (STORAGE_DIR, DOWNLOADS_DIR, RENDERED_DIR, OVERLAYS_DIR, AUDIO_DIR, GENERATED_IMAGES_DIR):
        d.mkdir(parents=True, exist_ok=True)


ensure_dirs()
