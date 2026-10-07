"""Danh sách worker chạy nền của web app — một chỗ để biết có những luồng nào, ai khởi động, tắt bằng biến gì.

Mỗi worker vẫn do module sở hữu tự start/stop (thứ tự khởi động nằm ở `server.app_startup`). Ở đây chỉ mô tả và
đọc trạng thái từ `threading.enumerate()` theo tên thread, nên đúng khi gọi trong tiến trình server.
`GET /api/system/workers` trả `status()`; trang "Worker nền" trong bảng quản trị hiển thị nó.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class Worker:
    name: str               # tên thread (hoặc tiền tố khi kết thúc bằng "*")
    label: str
    group: str
    owner: str              # module khởi động nó
    env: str = ""           # biến môi trường tắt worker (giá trị "0")
    default_on: bool = True
    note: str = ""

    def enabled(self) -> bool:
        if not self.env:
            return True
        return os.environ.get(self.env, "1" if self.default_on else "0") != "0"


WORKERS: Tuple[Worker, ...] = (
    # Đăng bài
    Worker("upload-scheduler", "Lịch đăng TikTok", "Đăng bài", "server.app_startup", note="lấy task QUEUED tới giờ và đăng"),
    Worker("needs-check-verifier", "Xác minh bài cần kiểm tra", "Đăng bài", "server.app_startup → needs_check_verifier"),
    Worker("profile-maintenance", "Bảo trì profile Chrome", "Đăng bài", "server.app_startup → profile_workers"),
    Worker("vpn-tunnel-reaper", "Dọn tunnel VPN hết hạn", "Đăng bài", "vpn_manager"),
    Worker("channel-rescan", "Quét lại kênh mỗi 6 giờ", "Tài khoản", "server.app_startup", env="TOKMATRIX_CHANNEL_RESCAN_MINUTES",
           note="cùng hàm nút 'Quét tất cả'; chu kỳ = TOKMATRIX_CHANNEL_RESCAN_MINUTES (360), 0 = tắt"),
    # Tự động hoá
    Worker("autopilot-daemon", "Autopilot", "Tự động hoá", "autopilot.start_autopilot", note="bật/tắt trong trang Autopilot"),
    Worker("autopilot-manual", "Autopilot (chạy tay)", "Tự động hoá", "autopilot.engine", note="chỉ có khi đang chạy một bước tay"),
    Worker("matrix-*", "Matrix batch", "Tự động hoá", "matrix_routes", note="mỗi batch một thread"),
    Worker("tiktok-dup-bot", "Kiểm tra video trùng", "Tự động hoá", "autopilot.cycle → tiktok_dup_bot"),
    # Ảnh & kịch bản
    Worker("image-queue-worker", "Hàng đợi ảnh (Pollinations)", "Ảnh & kịch bản", "image_routes.start_image_queue_worker"),
    Worker("bridge-auto-worker", "Antigravity bridge ảnh", "Ảnh & kịch bản", "image_routes._start_bridge_worker"),
    Worker("cf-image-fallback", "Dự phòng ImageRouter / Cloudflare", "Ảnh & kịch bản", "cf_image_fallback", "TOKMATRIX_CF_IMAGE_FALLBACK"),
    Worker("muse-images-*", "Muse vẽ ảnh", "Ảnh & kịch bản", "muse_image", "TOKMATRIX_MUSE"),
    Worker("image-autoassign", "Gán ảnh cho video Studio", "Ảnh & kịch bản", "compare_native", "TOKMATRIX_IMAGE_AUTOASSIGN"),
    Worker("script-bridge-worker", "Antigravity bridge kịch bản", "Ảnh & kịch bản", "script_bridge_worker"),
    # Sản xuất video
    Worker("remake-queue-worker", "Canvas Remake", "Sản xuất video", "remake_routes"),
    Worker("story-remake-watch", "Story Remake theo dõi nguồn", "Sản xuất video", "story_remake_routes", "TOKMATRIX_STORY_WATCH"),
    Worker("kuaishou-vector", "Kuaishou → vector", "Sản xuất video", "story_remake_routes → kuaishou_vector", "TOKMATRIX_KUAISHOU_VECTOR"),
    Worker("source-remake", "Remake từ video nguồn (vector)", "Sản xuất video", "kuaishou_vector → source_remake"),
    Worker("vector-learner", "Học rig vector mới", "Sản xuất video", "vector_learner", "TOKMATRIX_VECTOR_LEARNER"),
    Worker("muse-remake", "Kuaishou → Muse", "Sản xuất video", "image_routes → muse_remake", "TOKMATRIX_MUSE_REMAKE"),
    Worker("muse-film", "Phim AI (Muse)", "Sản xuất video", "image_routes → muse_film", "TOKMATRIX_MUSE"),
    Worker("dola-worker", "Video AI Dola", "Sản xuất video", "dola_routes", "TOKMATRIX_DOLA_WORKER"),
    Worker("compare-run-*", "Tác vụ Video Studio", "Sản xuất video", "compare_native", note="check/render/vo/fit đang chạy"),
    # Hệ thống
    Worker("notify-sender", "Gửi thông báo Telegram", "Hệ thống", "notify", "TOKMATRIX_NOTIFY"),
    Worker("notify-watcher", "Theo dõi sự kiện để báo", "Hệ thống", "notify", "TOKMATRIX_NOTIFY"),
)


def _match(worker: Worker, thread_name: str) -> bool:
    if worker.name.endswith("*"):
        return thread_name.startswith(worker.name[:-1])
    return thread_name == worker.name


def status(threads: Optional[List[threading.Thread]] = None) -> Dict[str, Any]:
    threads = threads if threads is not None else threading.enumerate()
    alive = [t.name for t in threads if t.is_alive()]
    rows = []
    for w in WORKERS:
        names = [n for n in alive if _match(w, n)]
        rows.append({"name": w.name, "label": w.label, "group": w.group, "owner": w.owner, "env": w.env,
                     "enabled": w.enabled(), "running": len(names), "threads": names, "note": w.note})
    known = {n for r in rows for n in r["threads"]}
    other = sorted(n for n in alive if n not in known and n != "MainThread")
    return {"workers": rows, "other_threads": other, "thread_count": len(alive)}
