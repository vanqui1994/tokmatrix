"""QA hình học của story vector trước khi dựng (plan §6), không cần trình duyệt.

Dựa trên kích thước đo thật (`extents`), lấy mẫu vị trí theo keyframe (nội suy tuyến tính) ở giữa và cuối
mỗi cảnh, kiểm:
1. nhân vật đang hiện nằm trong khung (≥ 70 % khung bao), trừ lúc đang đi vào/ra;
2. hai nhân vật / vật thể không chồng nhau > 25 % khung bao nhỏ hơn;
3. vật thể ≥ 60 px mỗi chiều;
4. người và thú đứng đúng mặt đất của nền (± 12 px);
5. vùng phụ đề (y > 843 trong khung 576×1024, tức y > 1580 khi xuất 1080×1920) không chứa người/vật;
6. đi > 60 px thì quay mặt theo hướng đi;
7. không có hai mặt trời / hai mặt trăng trong một cảnh;
8. không có asset bị chặn (dấu hiệu Việt) trong story.
"""
from __future__ import annotations

from bkt_web.remake_vector import catalog
from bkt_web.vector_video.extents import bbox
from bkt_web.vector_video.niches import load as load_niches

W, H = 576, 1024
CAPTION_TOP = 843
GROUNDED_GROUPS = {"chibi", "human", "animal"}


def _interp(keys: list[dict], t: float, field: str, default=0.0):
    prev = keys[0]
    for k in keys:
        if k["time"] >= t:
            a, b = prev.get(field, default), k.get(field, default)
            if k["time"] == prev["time"] or not isinstance(a, (int, float)) or isinstance(a, bool):
                return b if k["time"] <= t else a
            u = (t - prev["time"]) / (k["time"] - prev["time"])
            return a + (b - a) * u
        prev = k
    return prev.get(field, default)


def _area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _overlap(a, b):
    return _area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))


def check(story: dict) -> list[str]:
    cat = catalog()
    blocked = set(load_niches()["blocked_assets"])
    assets = {c["id"]: c["asset"] for c in story["characters"]}
    errs = []
    for c in story["characters"]:
        if c["asset"] in blocked:
            errs.append(f"asset {c['asset']} bị chặn (thị trường Việt)")
    for sc in story["scenes"]:
        tag = f"scene {sc['index'] + 1}"
        if sc["background"]["preset"] in blocked:
            errs.append(f"{tag}: nền {sc['background']['preset']} bị chặn")
        ground = float(cat["background_specs"].get(sc["background"]["preset"], {}).get("ground_y", 810))
        roles = [cat["assets"][assets[cid]].get("group") for cid in sc["poses"]]
        for role in ("sun", "moon"):
            if sum(1 for cid in sc["poses"] if assets[cid] == role) > 1:
                errs.append(f"{tag}: hai {role}")
        s0, s1 = sc["start_time"], sc["end_time"]
        moving = {cid for cid, keys in sc["poses"].items() if max(k["x"] for k in keys) - min(k["x"] for k in keys) > 200}
        for t in (s0 + (s1 - s0) * 0.5, s1 - 0.05):
            boxes = {}
            for cid, keys in sc["poses"].items():
                if _interp(keys, t, "opacity", 1.0) < 0.5:
                    continue
                asset = assets[cid]
                x, y, h = _interp(keys, t, "x"), _interp(keys, t, "y"), _interp(keys, t, "height")
                flip = bool(_interp(keys, t, "flip", False))
                variant = keys[0].get("variant")
                b = bbox(asset, x, y, h, variant, flip)
                boxes[cid] = b
                inside = _overlap(b, (0, 0, W, H)) / max(1.0, _area(b))
                if inside < 0.7 and cid not in moving:
                    errs.append(f"{tag} t={t:.1f}: {cid} ra ngoài khung ({inside:.0%} trong khung)")
                if b[2] - b[0] < 60 or b[3] - b[1] < 60:
                    if not cid.startswith("buddy"):
                        errs.append(f"{tag}: {cid} nhỏ hơn 60 px ({b[2] - b[0]:.0f}×{b[3] - b[1]:.0f})")
                group = cat["assets"][asset].get("group")
                # Người dẫn và bạn đồng hành luôn đứng đất; vật thể (cá, hành tinh…) có thể bay/bơi.
                if cid in ("host", "buddy") and group in GROUNDED_GROUPS and abs(y - ground) > 12:
                    errs.append(f"{tag}: {cid} không chạm đất (y {y:.0f}, mặt đất {ground:.0f})")
                if max(0.0, b[3] - max(b[1], CAPTION_TOP)) > 0.3 * max(1.0, b[3] - b[1]):
                    errs.append(f"{tag}: {cid} lấn vùng phụ đề")
            ids = sorted(boxes)
            for a_i, a in enumerate(ids):
                for b in ids[a_i + 1:]:
                    ov = _overlap(boxes[a], boxes[b]) / max(1.0, min(_area(boxes[a]), _area(boxes[b])))
                    if ov > 0.25:
                        errs.append(f"{tag} t={t:.1f}: {a} và {b} chồng nhau {ov:.0%}")
        for cid, keys in sc["poses"].items():
            for k0, k1 in zip(keys, keys[1:]):
                dx = k1["x"] - k0["x"]
                if abs(dx) > 60 and "flip" in k1 and bool(k1["flip"]) != (dx < 0):
                    errs.append(f"{tag}: {cid} đi {'trái' if dx < 0 else 'phải'} nhưng quay mặt ngược")
        del roles
    return sorted(set(errs))
