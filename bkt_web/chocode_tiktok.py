"""
Client cho TikTok REST API Gateway của chocode (https://tiktok-api.chocode.com.vn).

Xác thực bằng header ``X-API-Key``; key nằm trong kho khoá chung dưới tên
``tiktok.chocode`` (Cài Đặt Hệ Thống → Kho Khoá API).

Lưu ý quan trọng: khi không lấy được dữ liệu thật, gateway này vẫn trả
``"status": "success"`` kèm dữ liệu mẫu bịa ra (uid 719283019283019, sec_uid
ghép từ username, mô tả "TikTok Trending Video", link MP4 trả 403...).
``find_mock_markers`` nhận diện các mẫu đó; mọi chỗ ghi vào DB hoặc tải video
phải từ chối kết quả có dấu hiệu giả thay vì coi là thành công.
"""

from __future__ import annotations

import os
import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple

import httpx

try:
    from bkt_web import key_vault
except ImportError:
    import key_vault

KEY_NAME = "tiktok.chocode"
BASE_URL = os.environ.get("CHOCODE_TIKTOK_API_BASE", "https://tiktok-api.chocode.com.vn").rstrip("/")
DEFAULT_TIMEOUT = 60.0


class ChocodeError(RuntimeError):
    """Lỗi gọi API; ``status_code`` là mã HTTP nên trả về cho trình duyệt."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class Endpoint:
    method: str
    path: str
    params: Tuple[str, ...]
    label: str
    group: str
    # Lệnh ghi tác động lên tài khoản TikTok (tim, follow, bình luận, DM...)
    write: bool = False


# Sinh từ /openapi.json của gateway (v3.0.0).
ENDPOINTS: List[Endpoint] = [
    Endpoint("POST", "/api/v1/social/tiktok/shorten/landing_url", ('url',), "Mở rộng link rút gọn (Landing URL)", "Link"),
    Endpoint("POST", "/api/v1/social/tiktok/shorten/url", ('url',), "Tạo URL video chuẩn sạch", "Link"),
    Endpoint("POST", "/api/v1/social/tiktok/shorten/url_share", ('url',), "Tạo đường dẫn chia sẻ video", "Link"),
    Endpoint("POST", "/api/v1/social/tiktok/detail/aweme", ('aweme_id',), "Chi tiết video qua ID (Aweme ID)", "Video (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/detail/url", ('url',), "Chi tiết video qua URL", "Video (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/poi/get", ('id', 'poi_id'), "Chi tiết địa điểm check-in (POI)", "Địa điểm"),
    Endpoint("POST", "/api/v1/social/tiktok/poi/video_list", ('id', 'count', 'cursor'), "Danh sách video check-in tại địa điểm", "Địa điểm"),
    Endpoint("POST", "/api/v1/social/tiktok/poi/about", ('id',), "Thông tin giới thiệu & vị trí địa điểm", "Địa điểm"),
    Endpoint("POST", "/api/v1/social/tiktok/poi/review", ('id', 'count', 'cursor'), "Đánh giá & Review địa điểm", "Địa điểm"),
    Endpoint("GET", "/api/v1/social/tiktok/incentive/campaign", (), "Thông tin sự kiện thưởng xu (Campaign)", "Sự kiện"),
    Endpoint("GET", "/api/v1/social/tiktok/incentive/campaign_material", (), "Vật phẩm & Quà tặng sự kiện", "Sự kiện"),
    Endpoint("GET", "/api/v1/social/tiktok/incentive/main", (), "Trang chủ chương trình thưởng xu", "Sự kiện"),
    Endpoint("POST", "/api/v1/social/tiktok/search/challenge", ('keyword', 'count', 'cursor'), "Tìm kiếm Hashtag / Thử thách", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/full", ('keyword', 'count', 'cursor'), "Tìm kiếm tổng hợp Mobile", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/item", ('keyword', 'count', 'cursor'), "Tìm kiếm Video", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/single", ('keyword', 'count', 'cursor'), "Tìm kiếm Video đơn lẻ", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/music", ('keyword', 'count', 'cursor'), "Tìm kiếm Bài hát / Âm thanh", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/sug", ('keyword',), "Gợi ý từ khóa tự động (Sug)", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/suggest", ('keyword',), "Gợi ý từ khóa nâng cao (Suggest)", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/videosug", ('keyword',), "Gợi ý Video xu hướng (VideoSug)", "Tìm kiếm (App)"),
    Endpoint("POST", "/api/v1/social/tiktok/search/stream", ('keyword', 'count', 'cursor'), "Tìm kiếm Live Stream", "Tìm kiếm (App)"),
    Endpoint("GET", "/api/v1/social/tiktok/abtest/index", (), "Cấu hình ABTest tính năng Mobile", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/content/translation", ('text', 'target_lang'), "Dịch mô tả nội dung video", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/favorite/list", ('count', 'cursor'), "Danh sách video đã lưu yêu thích", "App khác"),
    Endpoint("GET", "/api/v1/social/tiktok/following/recommend", ('count',), "Gợi ý tài khoản nên theo dõi", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/feed/index", ('count',), "Bảng tin Xu hướng (For You Page)", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/general/collect_count", ('id',), "Đếm lượt lưu trữ tổng hợp", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/general/collect_lauch_plan", (), "Kế hoạch tính năng lưu trữ", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/music/detail", ('id',), "Chi tiết bài hát / Nhạc nền", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/music/aweme", ('id', 'count', 'cursor'), "Danh sách video sử dụng nhạc nền", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/original/effect_list", (), "Danh sách hiệu ứng gốc", "App khác"),
    Endpoint("GET", "/api/v1/social/tiktok/original/effect_list_v3", (), "Danh sách hiệu ứng v3", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/original/music_list", (), "Danh sách âm thanh gốc", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/post/detail", ('id',), "Chi tiết bài đăng", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/sticker/aweme", ('id', 'count', 'cursor'), "Danh sách video sử dụng Sticker", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/sticker/detail", ('id',), "Chi tiết Sticker / Hiệu ứng", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/user/detail", ('username', 'user_id'), "Hồ sơ tài khoản (User Profile)", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/user/stories", ('user_id',), "Danh sách Tin Story người dùng", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/user/collect_count", ('user_id',), "Số mục lưu trữ tài khoản", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/user/lauchplan", (), "Kế hoạch người dùng", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/category/list", (), "Danh sách thể loại / danh mục video", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/comment/list", ('id', 'aweme_id', 'count', 'cursor'), "Danh sách bình luận dưới video", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/comment/reply", ('id', 'comment_id', 'count', 'cursor'), "Danh sách phản hồi bình luận", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/notice/count", (), "Đếm thông báo mới", "App khác"),
    Endpoint("POST", "/api/v1/social/tiktok/web/item/detail", ('id',), "Chi tiết video Web theo Item ID", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/item/detail/url", ('url',), "Chi tiết video Web theo URL", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/challenge/detail", ('id', 'name'), "Chi tiết Hashtag Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/challenge/item_list", ('id', 'count', 'cursor'), "Danh sách video theo Hashtag Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/challenge/newtab", (), "Tab thử thách mới Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/challenge/related", ('id',), "Hashtag liên quan Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/comment/list", ('id', 'count', 'cursor'), "Danh sách bình luận Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/comment/reply", ('id', 'count', 'cursor'), "Danh sách phản hồi bình luận Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/creator/item_list", ('user_id', 'count', 'cursor'), "Danh sách video của nhà sáng tạo Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/discover/challenge", (), "Khám phá Hashtag Web", "Web"),
    Endpoint("GET", "/api/v1/social/tiktok/web/discover/index", (), "Trang chủ Khám phá Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/discover/music", (), "Khám phá Âm nhạc Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/discover/user", (), "Khám phá Tài khoản Web", "Web"),
    Endpoint("GET", "/api/v1/social/tiktok/web/explore/item_list", ('count', 'cursor'), "Danh sách video trang Khám phá Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/mix/item_list", ('id', 'count', 'cursor'), "Danh sách video trong Series / Mix Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/music/item_list", ('id', 'count', 'cursor'), "Danh sách video theo nhạc Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/music/detail", ('id',), "Chi tiết bài hát Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/post/item_list", ('username', 'count', 'cursor'), "Danh sách bài đăng của kênh Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/search/preview", ('keyword',), "Xem trước kết quả tìm kiếm Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/search/suggest", ('keyword',), "Gợi ý từ khóa tìm kiếm Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/search/item", ('keyword', 'count', 'cursor'), "Tìm kiếm Video Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/search/user", ('keyword', 'count', 'cursor'), "Tìm kiếm Người dùng Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/search/full", ('keyword', 'count', 'cursor'), "Tìm kiếm tổng hợp Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/url/detail", ('url',), "Giải mã chi tiết đường dẫn Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/user/detail", ('username',), "Hồ sơ người dùng Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/user/info", ('username',), "Thông tin người dùng Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/user/playlist", ('user_id',), "Danh sách phát người dùng Web", "Web"),
    Endpoint("POST", "/api/v1/social/tiktok/web/user/stories", ('user_id',), "Danh sách Story người dùng Web", "Web"),
    Endpoint("GET", "/api/v1/user/by-username", ('username',), "Lấy hồ sơ người dùng qua username", "Cơ bản"),
    Endpoint("GET", "/api/v1/profile", ('username', 'sec_user_id'), "Lấy thông tin profile đầy đủ", "Cơ bản"),
    Endpoint("GET", "/api/v1/search", ('keyword', 'limit'), "Tìm kiếm tài khoản người dùng", "Cơ bản"),
    Endpoint("POST", "/api/v1/search/user", ('keyword', 'limit'), "Tìm kiếm người dùng", "Cơ bản"),
    Endpoint("GET", "/api/v1/search/video", ('keyword', 'limit'), "Tìm kiếm Video theo từ khóa", "Cơ bản"),
    Endpoint("GET", "/api/v1/followers", ('user_id', 'sec_user_id', 'count'), "Danh sách Followers", "Cơ bản"),
    Endpoint("GET", "/api/v1/following", ('user_id', 'sec_user_id', 'count'), "Danh sách Following", "Cơ bản"),
    Endpoint("GET", "/api/v1/feed", ('limit', 'count'), "Bảng tin TikTok (Feed FYP)", "Cơ bản"),
    Endpoint("GET", "/api/v1/user/posts", ('username', 'sec_user_id', 'limit'), "Danh sách bài đăng của người dùng", "Cơ bản"),
    Endpoint("GET", "/api/v1/video/detail", ('url', 'aweme_id'), "Chi tiết video qua URL hoặc ID", "Cơ bản"),
    Endpoint("GET", "/api/v1/video/download", ('aweme_id', 'url'), "Tải video TikTok không logo HD", "Cơ bản"),
    Endpoint("POST", "/api/v1/interact/like", (), "Thả tim / Bỏ tim Video", "Cơ bản", write=True),
    Endpoint("POST", "/api/v1/interact/favorite", (), "Yêu thích / Bỏ yêu thích Video", "Cơ bản", write=True),
    Endpoint("POST", "/api/v1/interact/comment", (), "Bình luận bài viết", "Cơ bản", write=True),
    Endpoint("POST", "/api/v1/user/follow", (), "Follow / Unfollow người dùng", "Cơ bản", write=True),
    Endpoint("POST", "/api/v1/message/chat_notice", (), "Thông báo tin nhắn nhắn tin DM", "Cơ bản", write=True),
    Endpoint("POST", "/api/v1/message/send", (), "Gửi tin nhắn DM", "Cơ bản", write=True),
    Endpoint("POST", "/api/v1/showcase", (), "Showcase sản phẩm TikTok Shop", "Cơ bản", write=True),
    Endpoint("GET", "/api/v1/search/live", ('keyword', 'limit'), "Tìm kiếm Live Broadcasts", "Cơ bản"),
    Endpoint("GET", "/api/v1/search/hashtag", ('tag', 'limit'), "Tìm kiếm Video theo Hashtag", "Cơ bản"),
    Endpoint("GET", "/api/v1/music/videos", ('music_id', 'limit'), "Danh sách video theo Music ID", "Cơ bản"),
    Endpoint("GET", "/api/v1/trending/videos", ('limit',), "Danh sách video đang xu hướng", "Cơ bản"),
]

ENDPOINT_BY_PATH: Dict[str, Endpoint] = {ep.path: ep for ep in ENDPOINTS}

# --- Nhận diện dữ liệu mẫu ---------------------------------------------------

MOCK_UID = "719283019283019"
MOCK_POST_SEC_UID = "MS4wLjABAAAAh7gQgDfu1m3WIbiBKk8k95kc_X"
MOCK_DESC_RE = re.compile(r"^(TikTok Trending Video|Trending TikTok video #\d+ for #.*)$")
MOCK_MEDIA_PATH_RE = re.compile(r"/video/tos/useast2a/tos-useast2a-ve-0068c001/\d+\.mp4$")


def find_mock_markers(data: Any, _limit: int = 20) -> List[str]:
    """Liệt kê các dấu hiệu dữ liệu mẫu trong kết quả; rỗng nghĩa là không phát hiện."""
    found: List[str] = []

    def add(reason: str) -> None:
        if reason not in found:
            found.append(reason)

    def walk(node: Any, depth: int) -> None:
        if len(found) >= _limit or depth > 12:
            return
        if isinstance(node, dict):
            for key, value in node.items():
                if isinstance(value, str):
                    k = key.lower()
                    if k == "uid" and value == MOCK_UID:
                        add(f"uid mẫu {MOCK_UID}")
                    elif k in ("sec_uid", "sec_user_id") and (
                        value.endswith("_sec_uid_hash_signature") or value == MOCK_POST_SEC_UID
                    ):
                        add("sec_uid mẫu")
                    elif k == "desc" and MOCK_DESC_RE.match(value.strip()):
                        add("mô tả video mẫu (“TikTok Trending Video…”)")
                    elif k in ("no_watermark_url", "play_url") and (
                        MOCK_MEDIA_PATH_RE.search(value) or re.match(r"^https://www\.tiktok\.com/@", value)
                    ):
                        add("link video không phải file MP4 thật")
                    elif k == "signature" and value.startswith("Official TikTok Profile @"):
                        add("tiểu sử mẫu")
                else:
                    walk(value, depth + 1)
        elif isinstance(node, list):
            for item in node[:200]:
                walk(item, depth + 1)

    walk(data, 0)
    return found


# --- Gọi API -------------------------------------------------------------------

def api_key() -> str:
    return os.environ.get("CHOCODE_TIKTOK_API_KEY", "").strip() or key_vault.get_key(KEY_NAME)


def is_configured() -> bool:
    return bool(api_key())


def _clean_params(endpoint: Endpoint, params: Optional[Dict[str, Any]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for name, value in (params or {}).items():
        if name not in endpoint.params:
            raise ChocodeError(f"Tham số '{name}' không có trong {endpoint.path}", 400)
        if value is None or str(value).strip() == "":
            continue
        out[name] = str(value).strip()
    return out


def call(path: str, params: Optional[Dict[str, Any]] = None, body: Optional[Dict[str, Any]] = None,
         *, timeout: float = DEFAULT_TIMEOUT, client: Optional[httpx.Client] = None) -> Dict[str, Any]:
    """
    Gọi một endpoint trong danh mục. Trả ``{"status", "message", "data", "mock_markers"}``.
    Chỉ path có trong ``ENDPOINTS`` mới được gọi, tham số query phải đúng tên trong spec.
    """
    endpoint = ENDPOINT_BY_PATH.get(path)
    if not endpoint:
        raise ChocodeError(f"Endpoint không có trong danh mục: {path}", 404)
    key = api_key()
    if not key:
        raise ChocodeError("Chưa cấu hình khoá TikTok API (chocode) trong Kho Khoá API", 400)
    query = _clean_params(endpoint, params)
    headers = {"X-API-Key": key, "Accept": "application/json"}
    url = BASE_URL + endpoint.path
    owns_client = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False)
    try:
        if endpoint.method == "GET":
            resp = client.get(url, params=query, headers=headers)
        else:
            resp = client.post(url, params=query, json=body or {}, headers=headers)
    except httpx.HTTPError as exc:
        raise ChocodeError(f"Không kết nối được TikTok API: {exc}") from exc
    finally:
        if owns_client:
            client.close()

    try:
        payload = resp.json()
    except ValueError:
        raise ChocodeError(f"TikTok API trả về không phải JSON (HTTP {resp.status_code})")
    if resp.status_code >= 400:
        detail = payload.get("detail") if isinstance(payload, dict) else None
        if isinstance(detail, list):
            detail = "; ".join(str(d.get("msg", d)) for d in detail if d)
        code = resp.status_code if resp.status_code in (400, 401, 403, 404, 422, 429) else 502
        raise ChocodeError(f"TikTok API lỗi HTTP {resp.status_code}: {detail or payload}", code)
    if not isinstance(payload, dict):
        raise ChocodeError("TikTok API trả về dữ liệu không đúng định dạng")
    status = str(payload.get("status") or "").lower()
    if status and status not in ("success", "ok"):
        raise ChocodeError(f"TikTok API báo lỗi: {payload.get('message') or status}")
    data = payload.get("data")
    return {
        "status": payload.get("status"),
        "message": payload.get("message"),
        "data": data,
        "mock_markers": find_mock_markers(data),
    }


BLOCK_MOCK_SETTING = "tiktok_api_block_mock"


def block_mock() -> bool:
    """Công tắc "Chặn dữ liệu mẫu" (bảng settings); mặc định bật."""
    try:
        conn = key_vault.connect_db(key_vault.DB_PATH)
        try:
            row = conn.execute("SELECT value FROM settings WHERE key=?", (BLOCK_MOCK_SETTING,)).fetchone()
        finally:
            conn.close()
    except Exception:
        return True
    return not row or str(row[0]) != "0"


def set_block_mock(enabled: bool) -> None:
    conn = key_vault.connect_db(key_vault.DB_PATH)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (BLOCK_MOCK_SETTING, "1" if enabled else "0"),
        )
        conn.commit()
    finally:
        conn.close()


def _reject_markers(markers: List[str]) -> None:
    if markers and block_mock():
        raise ChocodeError("TikTok API trả dữ liệu mẫu, không phải dữ liệu thật: " + "; ".join(markers), 502)


def call_real(path: str, params: Optional[Dict[str, Any]] = None, **kwargs) -> Any:
    """Như ``call`` nhưng coi dữ liệu mẫu là lỗi (khi công tắc chặn bật); dùng cho chỗ ghi DB / tải file."""
    result = call(path, params, **kwargs)
    _reject_markers(result["mock_markers"])
    return result["data"]


def health(timeout: float = 15.0) -> Dict[str, Any]:
    try:
        resp = httpx.get(BASE_URL + "/", timeout=timeout, trust_env=False)
        return {"online": resp.status_code == 200, **(resp.json() if resp.status_code == 200 else {})}
    except (httpx.HTTPError, ValueError) as exc:
        return {"online": False, "error": str(exc)}


def catalog() -> List[Dict[str, Any]]:
    return [asdict(ep) for ep in ENDPOINTS]


# --- Chuẩn hoá ----------------------------------------------------------------

def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def normalize_profile(data: Dict[str, Any]) -> Dict[str, Any]:
    stats = data.get("stats") or {}
    return {
        "username": data.get("username") or data.get("unique_id") or "",
        "nickname": data.get("nickname") or "",
        "uid": str(data.get("uid") or ""),
        "sec_uid": data.get("sec_uid") or data.get("sec_user_id") or "",
        "avatar": data.get("avatar") or "",
        "signature": data.get("signature") or "",
        "verified": bool(data.get("verified")),
        "private": bool(data.get("privateAccount")),
        "follower_count": _int(data.get("followerCount") or stats.get("followerCount")),
        "following_count": _int(data.get("followingCount") or stats.get("followingCount")),
        "like_count": _int(data.get("heartCount") or stats.get("heart")),
        "video_count": _int(data.get("videoCount") or stats.get("videoCount")),
    }


def fetch_profile(username: str) -> Dict[str, Any]:
    username = (username or "").strip().lstrip("@")
    if not username:
        raise ChocodeError("Thiếu username", 400)
    data = call_real("/api/v1/user/by-username", {"username": username})
    if not isinstance(data, dict) or not (data.get("uid") or data.get("sec_uid")):
        raise ChocodeError(f"Không tìm thấy hồ sơ @{username}", 404)
    return normalize_profile(data)


def normalize_video(data: Dict[str, Any]) -> Dict[str, Any]:
    video = data.get("video") or {}
    author = data.get("author") or {}
    stats = data.get("statistics") or {}
    duration = _int(video.get("duration") or data.get("duration"))
    if duration > 1000:  # một số endpoint trả mili-giây
        duration //= 1000
    return {
        "id": str(data.get("aweme_id") or data.get("id") or ""),
        "title": data.get("desc") or data.get("title") or "",
        "author": author.get("unique_id") if isinstance(author, dict) else str(author or ""),
        "duration": duration,
        "cover": video.get("cover_url") or video.get("origin_cover") or data.get("cover") or "",
        "play_url": video.get("no_watermark_url") or video.get("play_url") or data.get("play") or "",
        "play_count": _int(stats.get("play_count")),
        "like_count": _int(stats.get("digg_count")),
        "comment_count": _int(stats.get("comment_count")),
        "share_count": _int(stats.get("share_count")),
    }


def resolve_video_download(url: str) -> Dict[str, Any]:
    """Thông tin tải video không logo; lỗi nếu gateway trả dữ liệu mẫu hoặc thiếu link MP4."""
    data = call_real("/api/v1/video/download", {"url": url})
    if not isinstance(data, dict):
        raise ChocodeError("TikTok API không trả thông tin video")
    info = normalize_video(data)
    if not info["play_url"].startswith("https://"):
        raise ChocodeError("TikTok API không trả link MP4 không logo")
    return info


# --- Dùng cho luồng quét kênh / quét video của server.py -------------------------

def _username(value: str) -> str:
    return (value or "").strip().lstrip("@").lower()


def fill_profile_stats(res: Dict[str, Any], username: str) -> bool:
    """
    Bổ sung follower / tim / số video vào kết quả quét khi đọc trang profile
    thất bại (``profile_ok`` False). Chỉ nhận hồ sơ thật, đúng username; mọi lỗi
    đều bị nuốt để lần quét vẫn ghi được trạng thái/doanh thu lấy từ cookie.
    """
    username = _username(username)
    if res.get("profile_ok") or not username or not is_configured():
        return False
    try:
        prof = fetch_profile(username)
    except ChocodeError as exc:
        res["profile_api_error"] = str(exc)
        return False
    if _username(prof["username"]) != username:
        res["profile_api_error"] = f"API trả hồ sơ @{prof['username']} khác @{username}"
        return False
    res.update(
        video_count=prof["video_count"],
        follower_count=prof["follower_count"],
        like_count=prof["like_count"],
        profile_ok=True,
        profile_source="chocode",
    )
    if not res.get("nickname"):
        res["nickname"] = prof["nickname"]
    if not res.get("username"):
        res["username"] = prof["username"]
    return True


def to_web_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Đổi video của gateway sang dạng itemList của TikTok web mà evaluate_video_diagnostics đọc."""
    video = item.get("video") or {}
    stats = item.get("statistics") or {}
    author = item.get("author") or {}
    duration = _int(video.get("duration"))
    if duration > 1000:
        duration //= 1000
    return {
        "id": str(item.get("aweme_id") or item.get("id") or ""),
        "desc": item.get("desc") or "",
        "createTime": _int(item.get("create_time")),
        "author": {"uniqueId": author.get("unique_id") or ""},
        "video": {"duration": duration, "cover": video.get("cover_url") or ""},
        "stats": {
            "playCount": _int(stats.get("play_count")),
            "diggCount": _int(stats.get("digg_count")),
            "commentCount": _int(stats.get("comment_count")),
            "shareCount": _int(stats.get("share_count")),
        },
        "source": "chocode",
    }


VIDEO_LIST_PATH = "/api/v1/social/tiktok/web/post/item_list"
USER_POSTS_PATH = "/api/v1/user/posts"


def _page_items(result: Dict[str, Any], username: str, seen: set, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    strict = block_mock()
    # Danh sách không cần link MP4, nên bỏ dấu hiệu "link không phải MP4".
    _reject_markers([m for m in result["mock_markers"] if not m.startswith("link video")])
    data = result["data"] if isinstance(result["data"], dict) else {}
    for raw in data.get("item_list") or data.get("itemList") or data.get("aweme_list") or []:
        if not isinstance(raw, dict):
            continue
        item = to_web_item(raw)
        if not item["id"] or item["id"] in seen:
            continue
        if strict and _username(item["author"]["uniqueId"]) not in ("", username):
            raise ChocodeError(f"API trả video của @{item['author']['uniqueId']} thay vì @{username}")
        seen.add(item["id"])
        items.append(item)
    return data


def _videos_by_sec_uid(client, username: str, max_items: int) -> List[Dict[str, Any]]:
    """Cách chocode khuyên dùng: username → sec_uid (API hồ sơ) → /api/v1/user/posts."""
    prof = normalize_profile(call_real("/api/v1/user/by-username", {"username": username}, client=client))
    if _username(prof["username"]) != username or not prof["sec_uid"]:
        raise ChocodeError(f"Không lấy được sec_uid của @{username}")
    items: List[Dict[str, Any]] = []
    result = call(USER_POSTS_PATH, {"sec_user_id": prof["sec_uid"], "limit": max_items}, client=client)
    _page_items(result, username, set(), items)
    return items


def _videos_by_username(client, username: str, max_items: int, page_size: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen: set = set()
    cursor: Any = 0
    for _ in range(max(1, max_items // page_size + 1)):
        result = call(VIDEO_LIST_PATH, {"username": username, "count": page_size, "cursor": cursor}, client=client)
        data = _page_items(result, username, seen, items)
        page = data.get("item_list") or data.get("itemList") or data.get("aweme_list") or []
        next_cursor = data.get("cursor") or data.get("max_cursor")
        if not page or not data.get("has_more") or not next_cursor or next_cursor == cursor \
                or len(items) >= max_items:
            break
        cursor = next_cursor
    return items


def fetch_user_videos(username: str, max_items: int = 200, page_size: int = 35) -> List[Dict[str, Any]]:
    """
    Danh sách video của kênh (dạng itemList web): thử sec_uid → user/posts trước,
    rồi web/post/item_list theo username. Lỗi nếu cả hai đều trả dữ liệu mẫu hoặc
    video của tác giả khác — người gọi giữ nguyên cache cũ.
    """
    username = _username(username)
    if not username:
        raise ChocodeError("Kênh chưa có username để tra cứu", 400)
    errors = []
    with httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=False, trust_env=False) as client:
        for label, fetch in (
            ("user/posts", lambda: _videos_by_sec_uid(client, username, max_items)),
            ("web/post/item_list", lambda: _videos_by_username(client, username, max_items, page_size)),
        ):
            try:
                return fetch()[:max_items]
            except ChocodeError as exc:
                errors.append(f"{label}: {exc}")
    raise ChocodeError(" | ".join(errors))


VIDEO_DETAIL_PATH = "/api/v1/video/detail"


def fetch_video_detail(aweme_id: str, client: Optional[httpx.Client] = None) -> Dict[str, Any]:
    """Chi tiết một video (dạng itemList web); lỗi nếu dữ liệu mẫu hoặc sai ID."""
    result = call(VIDEO_DETAIL_PATH, {"aweme_id": aweme_id}, client=client)
    # Chỉ cần số liệu, không cần file MP4.
    _reject_markers([m for m in result["mock_markers"] if not m.startswith("link video")])
    data = result["data"]
    if not isinstance(data, dict):
        raise ChocodeError(f"Không có chi tiết video {aweme_id}")
    item = to_web_item(data)
    if item["id"] != str(aweme_id):
        raise ChocodeError(f"API trả chi tiết video {item['id']} thay vì {aweme_id}")
    return item


def fetch_channel_videos(username: str, max_items: int = 200, detail_limit: int = 30) -> Dict[str, Any]:
    """
    Flow đầy đủ cho một kênh: username → sec_uid → danh sách video → chi tiết
    ``detail_limit`` video mới nhất. Chi tiết lỗi/mẫu thì giữ số liệu từ danh sách.
    Trả ``{"items", "details_ok", "details_failed"}``.
    """
    items = fetch_user_videos(username, max_items=max_items)
    items.sort(key=lambda i: i["createTime"], reverse=True)
    ok = failed = 0
    with httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=False, trust_env=False) as client:
        for idx, item in enumerate(items[:max(0, detail_limit)]):
            try:
                detail = fetch_video_detail(item["id"], client=client)
            except ChocodeError:
                failed += 1
                continue
            merged = dict(item)
            for key in ("desc", "createTime"):
                merged[key] = detail[key] or item[key]
            merged["video"] = {k: detail["video"][k] or item["video"][k] for k in item["video"]}
            merged["stats"] = {k: max(detail["stats"][k], item["stats"][k]) for k in item["stats"]}
            items[idx] = merged
            ok += 1
    return {"items": items, "details_ok": ok, "details_failed": failed}
