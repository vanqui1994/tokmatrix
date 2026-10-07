"""Evidence-based TikTok video eligibility and cover-frame duplicate checks."""

from __future__ import annotations

import io
import json
import re
from urllib.parse import urlparse

from curl_cffi import requests
from PIL import Image

PAGE_DATA = re.compile(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', re.S)
ALLOWED_COVERS = ("tiktokcdn.com", "tiktok.com")


def public_verdict(html: str) -> dict:
    match = PAGE_DATA.search(html)
    if not match:
        return {"verdict": "unknown", "index_enabled": None, "reason": "Không đọc được dữ liệu video công khai"}
    try:
        detail = json.loads(match.group(1))["__DEFAULT_SCOPE__"]["webapp.reflow.video.detail"]
    except (KeyError, TypeError, ValueError):
        return {"verdict": "unknown", "index_enabled": None, "reason": "Phản hồi trang video không hợp lệ"}
    code = detail.get("statusCode")
    item = ((detail.get("itemInfo") or {}).get("itemStruct") or {})
    if code is None:
        verdict, reason = "unknown", "TikTok không trả statusCode"
    elif code != 0:
        verdict, reason = "removed", f"TikTok không phục vụ video (statusCode={code})"
    elif not item:
        verdict, reason = "unknown", "TikTok không trả itemStruct"
    elif any(item.get(k) for k in ("takeDown", "isReviewing", "divertToPrivate", "privateItem", "secret", "forFriend")):
        verdict, reason = "restricted", "Video bị giới hạn quyền xem hoặc đang xét duyệt"
    elif item.get("indexEnabled") is False:
        verdict, reason = "deindexed", "indexEnabled=false; chưa thể kết luận nguyên nhân"
    elif item.get("indexEnabled") is True:
        verdict, reason = "indexed", "indexEnabled=true"
    else:
        verdict, reason = "unknown", "TikTok không trả indexEnabled"
    return {"verdict": verdict, "index_enabled": item.get("indexEnabled"),
            "status_code": code, "reason": reason}


def official_penalty(payload: dict) -> dict:
    if not isinstance(payload, dict) or payload.get("status_code") != 0:
        return {"status": "unknown", "reason": "TikTok Studio không trả trạng thái hợp lệ"}
    status = payload.get("appeal_status")
    penalties = payload.get("penalties") or []
    if status in (2, 4) and not penalties:
        return {"status": "eligible", "reason": "Không có hình phạt NFF", "appeal_status": status}
    if penalties and status in (0, 1, 3, 5, 6):
        codes = [str(code) for entry in penalties if isinstance(entry, dict)
                 for code in (entry.get("reason_codes") or [])]
        return {"status": "ineligible", "penalty_type": (payload.get("top_penalty_details") or {}).get("penalty_type"),
                "reason_codes": codes, "appeal_status": status, "can_appeal": status == 0}
    return {"status": "unknown", "reason": "TikTok chưa có kết luận NFF", "appeal_status": status}


def check_video(cookie: str, socks_port: int, video_id: str) -> dict:
    if not cookie or not socks_port or not video_id.isdecimal() or len(video_id) > 25:
        return {"ok": False, "error": "Thiếu cookie, VPN hoặc video_id hợp lệ"}
    session = requests.Session(impersonate="chrome120")
    proxy = f"socks5h://127.0.0.1:{socks_port}"
    session.proxies = {"http": proxy, "https": proxy}
    public = {"verdict": "unknown", "index_enabled": None, "reason": "Không tải được trang video"}
    official = {"status": "unknown", "reason": "Không đọc được trạng thái NFF từ Studio"}
    try:
        try:
            page = session.get(f"https://m.tiktok.com/v/{video_id}.html", timeout=20,
                               allow_redirects=True)
            if page.status_code == 200:
                public = public_verdict(page.text)
        except requests.RequestsError:
            pass
        try:
            session.headers.update({"Cookie": cookie, "Referer": "https://www.tiktok.com/tiktokstudio/content"})
            response = session.get("https://www.tiktok.com/mod/v1/getPenaltyDetails/",
                                   params={"aid": "1988", "app_name": "tiktok_creator_center",
                                           "device_platform": "web_pc", "locale": "en", "vid": video_id},
                                   timeout=20, allow_redirects=False)
            if response.status_code == 200 and "json" in response.headers.get("content-type", ""):
                official = official_penalty(response.json())
        except (ValueError, requests.RequestsError):
            pass
    finally:
        session.close()
    return {"ok": public["verdict"] != "unknown" or official["status"] != "unknown",
            "video_id": video_id, "public": public, "official": official}


def cover_hash(image_bytes: bytes) -> int:
    with Image.open(io.BytesIO(image_bytes)) as image:
        gray = image.convert("L").resize((9, 8))
        pixels = gray.tobytes()
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (pixels[y * 9 + x] > pixels[y * 9 + x + 1])
    return bits


def compare_covers(rows: list[tuple], socks_port: int, max_images: int = 60) -> dict:
    session = requests.Session(impersonate="chrome120")
    proxy = f"socks5h://127.0.0.1:{socks_port}"
    session.proxies = {"http": proxy, "https": proxy}
    hashes = []
    skipped = 0
    try:
        for channel_id, video_id, cover, created in rows[:max_images]:
            parsed = urlparse(cover or "")
            host = (parsed.hostname or "").lower()
            if parsed.scheme != "https" or not any(host == domain or host.endswith("." + domain) for domain in ALLOWED_COVERS):
                skipped += 1
                continue
            try:
                response = session.get(cover, timeout=15, allow_redirects=False,
                                       headers={"Referer": "https://www.tiktok.com/"})
                if response.status_code != 200 or len(response.content) > 3_000_000:
                    skipped += 1
                    continue
                hashes.append((channel_id, video_id, created, cover_hash(response.content)))
            except (ValueError, OSError, requests.RequestsError):
                skipped += 1
    finally:
        session.close()
    pairs = []
    for i, (ch_id, vid, created, fingerprint) in enumerate(hashes):
        for prev_ch, prev_vid, prev_created, prev_hash in hashes[:i]:
            distance = (fingerprint ^ prev_hash).bit_count()
            if distance <= 10:
                original, duplicate = ((prev_ch, prev_vid), (ch_id, vid)) if prev_created <= created else ((ch_id, vid), (prev_ch, prev_vid))
                pairs.append({"original_channel_id": original[0], "original_video_id": original[1],
                              "duplicate_channel_id": duplicate[0], "duplicate_video_id": duplicate[1],
                              "distance": distance})
    return {"checked": len(hashes), "skipped": skipped + max(0, len(rows) - max_images),
            "pairs": pairs, "method": "cover_dhash", "scope": "sampled_covers_only"}
