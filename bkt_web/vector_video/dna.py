"""Vector DNA: hình ảnh riêng của từng kênh (docs/PLAN_vector_video_engine.md §5).

Năm trục; hai kênh cùng niche (kể cả khác nước — TikTok so trùng giữa mọi tài khoản, mỗi video là của một
nước) phải khác nhau ở ≥ 3/5 trục và không trùng dàn diễn. Kênh khác niche đã khác nền/vật thể; ràng buộc
3/5 cho cả một nước là bất khả ở quy mô thật (4 trục ngoài dàn diễn chỉ chứa ~36 mã cách nhau 3):
- `cast`: người dẫn (chỉ số trong danh sách host của niche) + bạn đồng hành (hoặc không có);
- `palette`: tông màu theo thời gian/thời tiết của các cảnh (`day`, `night`, `alternate`, `mist`);
- `framing`: khung hình (`wide`, `close` zoom nhẹ vào người dẫn, `pan` lia chậm);
- `pacing`: số beat tối đa mỗi cảnh (`calm` 1, `normal` 2, `busy` 3);
- `caption`: kiểu phụ đề HTML (`box`, `outline`, `band`, `pill`).

Gán bằng `assign()` (tham lam, tất định, giữ DNA đã có nếu còn hợp lệ) và lưu ở
`compare_studio/config/vector_dna.json` — không sửa YAML kênh. Kênh chưa được gán dùng `derive()` theo hash id.
"""
from __future__ import annotations

import hashlib
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DNA_PATH = ROOT / "compare_studio" / "config" / "vector_dna.json"
AXES = {
    "palette": ("day", "night", "alternate", "mist"),
    "framing": ("wide", "close", "pan"),
    "pacing": ("calm", "normal", "busy"),
    "caption": ("box", "outline", "band", "pill"),
}
MIN_DIFF = 3


def _h(text: str) -> int:
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:12], 16)


def derive(channel_id: str, host_count: int = 4, buddy_count: int = 3) -> dict:
    h = _h(channel_id)
    dna = {"cast": [h % max(1, host_count), (h >> 4) % (buddy_count + 1) - 1]}
    for i, (axis, values) in enumerate(AXES.items()):
        dna[axis] = values[(h >> (8 + 4 * i)) % len(values)]
    return dna


def differences(a: dict, b: dict) -> int:
    return int(a["cast"] != b["cast"]) + sum(int(a[axis] != b[axis]) for axis in AXES)


def load_assignments() -> dict:
    if not DNA_PATH.exists():
        return {}
    return json.loads(DNA_PATH.read_text(encoding="utf-8")).get("channels", {})


def for_channel(channel_id: str, host_count: int = 4, buddy_count: int = 3) -> dict:
    dna = load_assignments().get(channel_id)
    if dna:
        dna = dict(dna)
        dna["cast"] = [dna["cast"][0] % max(1, host_count), dna["cast"][1] if dna["cast"][1] < buddy_count else -1]
        return dna
    return derive(channel_id, host_count, buddy_count)


def _candidates(host_count: int, buddy_count: int):
    casts = [[h, b] for h in range(host_count) for b in range(-1, buddy_count)]
    for cast, *rest in itertools.product(casts, *AXES.values()):
        yield {"cast": cast, **dict(zip(AXES, rest))}


def assign(channels: list[dict], existing: dict | None = None) -> dict:
    """channels: [{channel_id, language, niche, hosts, buddies}] → {channel_id: dna}.

    Tham lam theo thứ tự channel_id: giữ DNA cũ nếu nó vẫn khác ≥ 3/5 trục với mọi kênh cùng nước đã chốt;
    nếu không, chọn ứng viên đầu tiên (thứ tự theo hash của kênh) thoả điều kiện, ưu tiên khác nhiều trục nhất.
    """
    existing = existing or {}
    out: dict[str, dict] = {}
    done: list[dict] = []
    for ch in sorted(channels, key=lambda c: c["channel_id"]):
        cid, lang = ch["channel_id"], ch["language"]
        peers = [out[d["channel_id"]] for d in done if d.get("niche") == ch.get("niche")]
        same_niche = [out[d["channel_id"]] for d in done if d.get("niche") == ch.get("niche")]

        def ok(cand):
            return all(differences(cand, p) >= MIN_DIFF for p in peers) and all(cand["cast"] != p["cast"] for p in same_niche)

        keep = existing.get(cid)
        if keep and ok(keep):
            out[cid] = keep
        else:
            pool = list(_candidates(ch["hosts"], ch["buddies"]))
            start = _h(cid) % len(pool)
            pool = pool[start:] + pool[:start]
            # Lấy ứng viên hợp lệ đầu tiên (thứ tự xoay theo hash kênh): chọn "khác nhiều nhất" làm cạn không gian
            # tổ hợp rất nhanh (kẹt ở kênh thứ ~29 của một nước).
            best = next((cand for cand in pool if ok(cand)), None)
            if best is None:
                raise ValueError(f"không tìm được DNA khác ≥ {MIN_DIFF}/5 trục cho {cid} ({lang}, {len(peers)} kênh cùng nước/niche)")
            out[cid] = best
        done.append(ch)
    return out


def violations(assignments: dict, languages: dict, niches: dict | None = None) -> list[str]:
    """Cặp kênh cùng nước hoặc cùng niche khác nhau < 3/5 trục, hoặc cùng niche trùng dàn diễn."""
    niches = niches or {}
    errs = []
    ids = sorted(assignments)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            same_niche = niches.get(a) is not None and niches.get(a) == niches.get(b)
            if same_niche and differences(assignments[a], assignments[b]) < MIN_DIFF:
                errs.append(f"{a} ~ {b}")
            elif same_niche and assignments[a]["cast"] == assignments[b]["cast"]:
                errs.append(f"{a} ~ {b} (cùng dàn diễn)")
    return errs
