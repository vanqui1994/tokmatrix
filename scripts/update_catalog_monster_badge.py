"""Pose `badge` (0–1) cho nhóm `monster`: 1 (mặc định) = vẽ huy hiệu bậc như cũ; 0 = không huy hiệu.

Engine video vector không được vẽ chữ, nên đặt `badge: 0` cho quái vật biển (niche monster_fishing). Chạy lại nhiều
lần không đổi kết quả.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.catalog_edit import edit_catalog  # noqa: E402

with edit_catalog() as cat:
    cat.setdefault("pose_defaults", {})["badge"] = 1
    cat.setdefault("pose_ranges", {})["badge"] = [0, 1]
print("pose_defaults.badge = 1")
