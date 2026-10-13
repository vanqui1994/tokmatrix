"""Đọc metadata nội bộ của video TikTok (categoryType, diversificationId, penaltyContext).

Bảng mã và luật phân loại lấy từ tài liệu tham chiếu `tiktok.md` — đó là ánh xạ
tham khảo, TikTok không công bố chính thức. Vì vậy:
  * trường TikTok không trả thì để None, KHÔNG gán giá trị "sạch" mặc định;
  * thiếu penaltyContext (hoặc thiếu mã bắt buộc) → action NO_PENALTY_DATA, không bao giờ QUALIFIED_NORMAL;
  * đủ điều kiện TikTok Shop chỉ khi video sạch và ec_global_verdict == 1.

Đầu vào là JSON của danh sách video (response `api/post/item_list`, chuỗi `itemList`,
một item) hoặc HTML view-source của trang TikTok (`__UNIVERSAL_DATA_FOR_REHYDRATION__`,
`SIGI_STATE`).
"""

from __future__ import annotations

import json
import re

CATEGORY_TYPES = {
    0: ("DEFAULT_UNDEFINED", "Mặc định / Chưa phân loại"),
    100: ("ANIMATION_COMICS", "Hoạt hình & Truyện tranh"),
    101: ("PERFORMANCE", "Biểu diễn nghệ thuật"),
    102: ("BEAUTY_CARE", "Chăm sóc sắc đẹp"),
    103: ("GAME", "Trò chơi điện tử"),
    104: ("COMEDY", "Hài hước & Giải trí"),
    105: ("DAILY_LIFE", "Đời sống thường ngày"),
    106: ("FAMILY", "Gia đình & Con cái"),
    107: ("EMOTIONAL_RELATIONSHIP", "Mối quan hệ tình cảm"),
    108: ("DRAMA", "Phim ngắn / Tình huống"),
    109: ("DRESS_UP", "Thời trang & Phối đồ"),
    110: ("DUBBING", "Lồng tiếng & POV"),
    111: ("FOOD", "Ẩm thực & Nấu ăn"),
    112: ("SPORTS", "Thể thao"),
    113: ("ANIMALS", "Động vật & Thú cưng"),
    114: ("SOCIETY", "Đời sống xã hội"),
    115: ("CAR", "Xe cộ"),
    116: ("EDUCATION", "Giáo dục & Kiến thức"),
    117: ("FITNESS_HEALTH", "Thể hình & Sức khỏe"),
    118: ("TECHNOLOGY", "Công nghệ & Thiết bị"),
    119: ("SINGING_DANCING", "Ca hát & Nhảy múa"),
    120: ("ALL_GENERAL", "Toàn bộ / Tổng hợp"),
}

SUB_NICHE_CODES = {
    10001: "Dance Challenge", 10005: "Lip-sync / Cover",
    10023: "Daily Vlog", 10032: "ASMR Cleaning", 10035: "Storytelling",
    10043: "Itinerary", 10048: "Camping / Survival", 10055: "Check-in",
    10072: "Drama ngắn", 10075: "Couple / Tâm sự tình yêu", 10078: "Tình bạn",
    10082: "Cooking Tutorial", 10088: "Mukbang", 10102: "Food Review",
    10115: "Game Highlight", 10122: "Thủ thuật phần mềm", 10135: "Unboxing",
}

SUB_NICHE_RANGES = (
    (1, 99, "Danh mục thô cấp hệ thống"),
    (10000, 10020, "Âm nhạc & Trào lưu biểu diễn"),
    (10021, 10040, "Đời sống & Vlogs"),
    (10041, 10060, "Du lịch & Ngoài trời"),
    (10061, 10080, "Tình cảm & Kịch bản"),
    (10081, 10110, "Ẩm thực & Nấu nướng"),
    (10111, 10150, "Gaming & Thiết bị"),
)

ACTIONS = {
    "QUALIFIED_NORMAL": "Sạch, phân phối bình thường",
    "DISCARD_UNAVAILABLE": "Video không còn công khai",
    "FLAG_REUP_SUPPRESSED": "Cờ reup / trùng lặp",
    "FLAG_AUDIO_COPYRIGHT": "Cờ bản quyền âm thanh",
    "FLAG_FYP_SHADOWBAN": "Chặn phân phối FYP",
    "FLAG_POLICY_VIOLATION": "Vi phạm / hạn chế khác",
    "PENDING_REVIEW": "Đang chờ quét kiểm duyệt",
    "NO_PENALTY_DATA": "TikTok không trả penaltyContext",
}

PENALTY_KEYS = ("status", "tns_status", "video_status", "reviewed", "ec_global_verdict",
                "arb_content_safety_status", "display_penalty_type", "display_ui_type", "display_policy")

_SCRIPT = re.compile(r'<script[^>]*id="(__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE)"[^>]*>(.*?)</script>', re.S)


def _int(value):
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def category_value(item: dict):
    """item_list web trả `CategoryType` (C hoa); tài liệu ghi `categoryType`."""
    return item.get("CategoryType", item.get("categoryType")) if isinstance(item, dict) else None


def category_label(value) -> dict | None:
    code = _int(value)
    if code is None:
        return None
    ident, name = CATEGORY_TYPES.get(code, ("UNKNOWN", f"Mã chưa có trong bảng ({code})"))
    return {"id": code, "identifier": ident, "name": name}


def sub_niche_label(value) -> dict | None:
    code = _int(value)
    if code is None:
        return None
    group = next((name for lo, hi, name in SUB_NICHE_RANGES if lo <= code <= hi), "Ngoài dải đã biết")
    return {"id": code, "group": group, "name": SUB_NICHE_CODES.get(code)}


def evaluate(item: dict) -> dict:
    """Phán quyết theo rule engine của tiktok.md, chỉ dựa trên mã TikTok thực sự trả."""
    raw = item.get("penaltyContext") if isinstance(item, dict) else None
    penalty = raw if isinstance(raw, dict) else {}
    codes = {k: penalty.get(k) for k in PENALTY_KEYS if k in penalty}
    tns = _int(penalty.get("tns_status"))
    arb = _int(penalty.get("arb_content_safety_status"))
    video_status = _int(penalty.get("video_status"))
    display = penalty.get("display_penalty_type")
    display = None if display is None or display == "" else str(display).strip()
    ec = _int(penalty.get("ec_global_verdict"))

    flags = {
        "is_active": None if video_status is None else video_status == 10,
        "is_reup": None if arb is None else arb in (301, 302),
        "is_muted": (arb is not None and 200 <= arb <= 204) or display == "1" or video_status in (7, 8),
        "is_shadowbanned": display == "3",
        "is_restricted": tns is not None and 201 <= tns <= 205,
        "is_severe": tns is not None and 301 <= tns <= 305,
        "is_pending": tns in (101, 103),
    }
    # Item guest thật (10/2026): khoảng một nửa không có arb_content_safety_status → thiếu arb = không có cờ
    # bản quyền/reup; tns_status và display_penalty_type thì bắt buộc mới được kết luận sạch.
    known = tns is not None and display is not None
    is_clean = (known and tns == 102 and arb in (None, 102) and display == "0"
                and flags["is_active"] is not False)

    if not penalty:
        action = "NO_PENALTY_DATA"
    elif flags["is_active"] is False:
        action = "DISCARD_UNAVAILABLE"
    elif flags["is_reup"]:
        action = "FLAG_REUP_SUPPRESSED"
    elif flags["is_muted"]:
        action = "FLAG_AUDIO_COPYRIGHT"
    elif flags["is_shadowbanned"]:
        action = "FLAG_FYP_SHADOWBAN"
    elif flags["is_severe"] or flags["is_restricted"] or (display not in (None, "0")):
        action = "FLAG_POLICY_VIOLATION"
    elif flags["is_pending"]:
        action = "PENDING_REVIEW"
    elif is_clean:
        action = "QUALIFIED_NORMAL"
    elif known:
        action = "FLAG_POLICY_VIOLATION"  # có đủ mã nhưng không phải mã sạch
    else:
        action = "NO_PENALTY_DATA"  # thiếu mã bắt buộc → không kết luận sạch

    return {
        "action": action,
        "action_label": ACTIONS[action],
        "is_clean": is_clean,
        "is_shop_eligible": bool(is_clean and ec == 1),
        "flags": flags,
        "penalty": codes,
        "category": category_label(category_value(item)),
        "sub_niche": sub_niche_label(item.get("diversificationId")),
        "index_enabled": item.get("indexEnabled") if isinstance(item.get("indexEnabled"), bool) else None,
    }


def _items_from(data) -> list[dict]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("itemList", "item_list", "aweme_list", "items"):
        if isinstance(data.get(key), list):
            return _items_from(data[key])
    if isinstance(data.get("data"), (dict, list)):
        found = _items_from(data["data"])
        if found:
            return found
    scope = data.get("__DEFAULT_SCOPE__")
    if isinstance(scope, dict):
        detail = scope.get("webapp.video-detail") or scope.get("webapp.reflow.video.detail") or {}
        struct = (detail.get("itemInfo") or {}).get("itemStruct")
        if isinstance(struct, dict):
            return [struct]
        for value in scope.values():
            found = _items_from(value) if isinstance(value, dict) else []
            if found:
                return found
    if isinstance(data.get("ItemModule"), dict):  # SIGI_STATE (giao diện cũ)
        return [x for x in data["ItemModule"].values() if isinstance(x, dict)]
    struct = (data.get("itemInfo") or {}).get("itemStruct") if isinstance(data.get("itemInfo"), dict) else None
    if isinstance(struct, dict):
        return [struct]
    if data.get("id") and ("desc" in data or "penaltyContext" in data or category_value(data) is not None):
        return [data]
    return []


def extract_items(text: str) -> list[dict]:
    """Lấy danh sách item từ JSON dán vào hoặc HTML view-source; ValueError nếu không đọc được."""
    text = (text or "").strip()
    if not text:
        raise ValueError("Chưa có nội dung")
    if text[0] in "[{":
        try:
            items = _items_from(json.loads(text))
        except ValueError as exc:
            raise ValueError(f"JSON không hợp lệ: {exc}") from exc
    else:
        items = []
        for _name, body in _SCRIPT.findall(text):
            try:
                items = _items_from(json.loads(body))
            except ValueError:
                continue
            if items:
                break
    if not items:
        raise ValueError("Không tìm thấy danh sách video (itemList / itemStruct) trong nội dung")
    return items


def summarize(items: list[dict]) -> dict:
    rows = []
    for item in items:
        verdict = evaluate(item)
        stats = item.get("stats") or item.get("statsV2") or {}
        rows.append({
            "video_id": str(item.get("id") or item.get("aweme_id") or ""),
            "desc": item.get("desc") or "",
            "create_time": _int(item.get("createTime") or item.get("create_time")),
            "view_count": _int(stats.get("playCount")),
            **verdict,
        })
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["action"]] = counts.get(row["action"], 0) + 1
    return {"total": len(rows), "actions": counts, "videos": rows}
