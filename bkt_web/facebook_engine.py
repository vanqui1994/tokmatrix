"""
Facebook Automation Engine
Port 1:1 từ SimpleFacebookProV2 1.0.1 (ATP Software / Alosoft).

Nguồn đối chiếu: bundle renderer `main.c0c4e7274d9d82fe.js` của bản DMG gốc.
Mọi doc_id, `variables`, tham số request, header và điều kiện xác nhận thành công
đều được trích trực tiếp từ bundle đó, không suy đoán.

Khác biệt kiến trúc duy nhất so với bản gốc: bản gốc điều khiển Puppeteer và
`gotoUrl()` vào trang thật trước/sau mỗi mutation; bản này gửi HTTP trực tiếp
bằng curl_cffi. Các tác vụ bản gốc chỉ làm được qua thao tác UI (gửi tin nhắn
Messenger) được báo lỗi rõ ràng thay vì trả thành công giả.
"""

import re
import json
import time
import base64
import random
import hmac
import struct
import hashlib
import urllib.parse
from typing import Dict, Any, List, Optional

from curl_cffi import requests

GRAPHQL_URL = "https://www.facebook.com/api/graphql/"
GRAPHQL_BATCH_URL = "https://www.facebook.com/api/graphqlbatch/"

# er.USER_AGENT_DESKTOP / er.UserAgentDesktop trong bản gốc
USER_AGENT_DESKTOP = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

# er.GraphFacebook + er.AvatarFBParam
GRAPH_FACEBOOK = "https://graph.facebook.com"
AVATAR_FB_PARAM = (
    "picture?height=500&width=500"
    "&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662"
)

# Chuỗi __dyn cố định trong C.buildParamsFBDesktop
FB_DYN = (
    "1KQdAmm1gxu4U4ifGh28sBBgS5UqxKcwRwAxu3-UcodUbE6u7HzE24xm6Uhx61rxicwcW4o29wm"
    "U1a852q3q5U2nwvE6W786q5Esx26UhwWwnElzaw5KzHzoaUae1AwgE5y6E52229wcq1FwKCwyxe"
)

DEFAULT_HS = "20223.HYP:comet_pkg.2.1...1"
DEFAULT_CRN = "comet.fbweb.CometPYMKSuggestionsRoute"
ASBD_ID = "359341"

# dR trong bản gốc — id reaction thật của Facebook, KHÔNG phải 1..7
FB_REACTION_IDS = {
    "LIKE": "1635855486666999",
    "LOVE": "1678524932434102",
    "LOVELOVE": "613557422527858",
    "HAHA": "115940658764963",
    "WOW": "478547315650144",
    "SAD": "908563459236466",
}
# Fee — danh sách reaction bản gốc cho phép chọn
FB_REACTIONS_SUPPORTED = ["Like", "Love", "LoveLove", "Haha", "Wow", "Sad"]
# Giao diện gọi biểu tượng ôm là "Care"; bản gốc đặt tên "LoveLove"
FB_REACTION_ALIASES = {"CARE": "LOVELOVE", "HUG": "LOVELOVE"}
# Giữ tên cũ để facebook_routes.py import được
REACTION_MAP = FB_REACTION_IDS

# Toàn bộ 53 friendly name -> doc_id trích từ bundle gốc.
# Tên nào bản gốc dùng ở nhiều call site với doc_id khác nhau thì ghi list.
FB_GRAPHQL_DOC_IDS: Dict[str, Any] = {
    "CometActivityLogStoriesListPaginationQuery": "24552699064401678",
    "CometHovercardQueryRendererQuery": "5437427149678807",
    "CometNewsFeedPaginationQuery": "9957095364411180",
    "CometNotificationsListPaginationQuery": "24270421129216356",
    "CometNotificationsUpdateSeenStateMutation": "9077759465660685",
    "CometPhotoRootContentQuery": "6637928502937814",
    "CometProfilePlusLikeMutation": "10062329867123540",
    "CometResharesFeedPaginationQuery": "24228619126827707",
    "CometSinglePostDialogContentQuery": "24002447362717951",
    "CometUFIFeedbackReactMutation": ["9518016021660044", "24034997962776771"],
    "CometUFIReactionsDialogTabContentRefetchQuery": ["9561069197331106", "31470716059194219"],
    "CometUserUnfollowMutation": "9829779950432073",
    "CometVideoHomeFeedSectionPaginationQuery": "10062801637135626",
    "CommentsListComponentsPaginationQuery": ["24318751341124243", "9994312660685367"],
    "ComposerLinkAttachmentPreviewQuery": "24138745772416942",
    "ComposerStoryCreateMutation": ["30414495441498438", "9510250992417785", "25306684598942431"],
    "FetchGroupAboutInfo": "2955612984492958",
    "FriendListCometRootQuery": "29800661609524801",
    "FriendingCometFriendRequestConfirmMutation": "10003720989745533",
    "FriendingCometFriendRequestDeleteMutation": ["9869125063134847", "7885384641585723"],
    "FriendingCometFriendRequestSendMutation": "9408332592608561",
    "FriendingCometFriendRequestsSectionPanelPaginationQuery": "24062887186648527",
    "FriendingCometOutgoingRequestsDialogPaginationQuery": "9776114965832879",
    "FriendingCometPYMKPanelPaginationQuery": "9917809191634193",
    "FriendingCometUnfriendMutation": "23930708339886851",
    "GroupCometJoinForumMutation": "23945723458372755",
    "GroupCometLeaveForumMutation": "24471243335909558",
    "GroupsCometAllJoinedGroupsSectionPaginationQuery": "9676137519162874",
    "GroupsCometFeedRegularStoriesPaginationQuery": "9755367644572581",
    "GroupsCometMembersPageNewMembersSectionRefetchQuery": "24670246842562940",
    "GroupsCometMembershipQuestionsDialogQuery": "24850850671182236",
    "GroupsCometPendingGroupJoinsSectionPaginationQuery": "9924911067556167",
    "MediaUploadFBDefaultServerConfigurationRetrieverQuery": "6325794097543029",
    "PagesCometLaunchPointUnifiedQueryPagesListRedesignedUpdatedPagesSectionQuery": "29849393258040848",
    "PokesMutatorPokeMutation": "29511440545169840",
    "ProfileCometAppCollectionListRendererPaginationQuery": ["24526674566935562", "30641504615463060"],
    "ProfileCometAppCollectionReelsRendererPaginationQuery": "5279476072161634",
    "ProfileCometAppCollectionSelfFriendsListRendererPaginationQuery": "10011574712286842",
    "ProfileCometRootLeftNavMenuQuery": ["25099262403096266", "24704553295801584"],
    "ProfileCometTimelineFeedRefetchQuery": "29857242777255325",
    "ReactivateProfileMutation": "30461474920118000",
    "ReactivateProfileRootQuery": "9878455382192938",
    "SearchCometResultsPaginatedResultsQuery": ["9729744383789355", "26255795984077549"],
    "StoriesCreateMutation": "24226878183562473",
    "StoriesTrayRectangularQuery": "9861985363909710",
    "storiesUpdateSeenStateMutation": "9567413276713742",
    "useCometFeedStoryDeleteMutation": "31820264164288906",
    "useCometProfilePlusSendFriendFollowerInviteMutation": "9655810507808142",
    "useCometUFICreateCommentMutation": ["9261808033920695", "24503988615886273"],
    "useFriendListCometUpdateMembersMutation": "9980273685337937",
    "useGroupAddMembersMutation": "9856173864498377",
    "useGroupMembershipAnswersSaveMutation": "23951724534439437",
    "useStoriesSendReplyMutation": "9697491553691692",
}

# Mỗi call site trong bản gốc là một bộ (friendly_name, doc_id, lsd) riêng.
# Giữ nguyên hằng lsd của từng call site đúng như bundle.
GRAPHQL_CALLS: Dict[str, tuple] = {
    "friend_request_send": ("FriendingCometFriendRequestSendMutation", "9408332592608561", "g_DqKdpIObrBoAhdPTb0YS"),
    "friend_request_confirm": ("FriendingCometFriendRequestConfirmMutation", "10003720989745533", "TQ5To1WPzyYReDVrIenEs2"),
    "friend_request_refuse": ("FriendingCometFriendRequestDeleteMutation", "9869125063134847", "g_DqKdpIObrBoAhdPTb0YS"),
    "friend_request_cancel": ("FriendingCometFriendRequestDeleteMutation", "7885384641585723", "TQ5To1WPzyYReDVrIenEs2"),
    "unfriend": ("FriendingCometUnfriendMutation", "23930708339886851", "TQ5To1WPzyYReDVrIenEs2"),
    "unfollow": ("CometUserUnfollowMutation", "9829779950432073", "TQ5To1WPzyYReDVrIenEs2"),
    "poke": ("PokesMutatorPokeMutation", "29511440545169840", "TQ5To1WPzyYReDVrIenEs2"),
    "best_friend": ("useFriendListCometUpdateMembersMutation", "9980273685337937", "6owikSjJw5V90LKZ6TFMVn"),
    "friend_list_root": ("FriendListCometRootQuery", "29800661609524801", "1puw_PhkkkhxhPFwp1ofCZ"),
    "scan_pymk": ("FriendingCometPYMKPanelPaginationQuery", "9917809191634193", "ykEi6FxiFel3RTKes1M9zh"),
    "scan_friend_requests": ("FriendingCometFriendRequestsSectionPanelPaginationQuery", "24062887186648527", "ykEi6FxiFel3RTKes1M9zh"),
    "scan_outgoing_requests": ("FriendingCometOutgoingRequestsDialogPaginationQuery", "9776114965832879", "RGC-IHES4Bq1DeeCmxmEbv"),
    "scan_self_friends": ("ProfileCometAppCollectionSelfFriendsListRendererPaginationQuery", "10011574712286842", None),
    "scan_user_friends": ("ProfileCometAppCollectionListRendererPaginationQuery", "24526674566935562", None),
    "react_post": ("CometUFIFeedbackReactMutation", "9518016021660044", "PrIJrKMIrYI8aDmBhLArOY"),
    "react_comment": ("CometUFIFeedbackReactMutation", "24034997962776771", "PrIJrKMIrYI8aDmBhLArOY"),
    "comment_post": ("useCometUFICreateCommentMutation", "9261808033920695", "I51unSoewaxrwBMBZmcv_5"),
    "reply_comment": ("useCometUFICreateCommentMutation", "24503988615886273", "jrzpZwHdqFmY_xAp-KFP-2"),
    "scan_comments": ("CommentsListComponentsPaginationQuery", "24318751341124243", "O3LRarg3WQrhAKe3BRDeT0"),
    "scan_reactions": ("CometUFIReactionsDialogTabContentRefetchQuery", "9561069197331106", "Fbq4wAL03YG68pDsw0oXBM"),
    "create_post": ("ComposerStoryCreateMutation", "30414495441498438", "ta6AH2qWQA2vA0jyJ5HgFZ"),
    "share_post": ("ComposerStoryCreateMutation", "9510250992417785", "35e7JJY0Xn28nS1p9XXs"),
    "review_fanpage": ("ComposerStoryCreateMutation", "25306684598942431", "nTUZOGvu4AZNXy48llwHZi"),
    "delete_post": ("useCometFeedStoryDeleteMutation", "31820264164288906", "-O3pG7yTGruMERWsXbN_jj"),
    "join_group": ("GroupCometJoinForumMutation", "23945723458372755", "-5ObLomaro0TqOJZOjWz6U"),
    "leave_group": ("GroupCometLeaveForumMutation", "24471243335909558", "8cv973UWReSdkQKVjpTpGH"),
    "invite_group": ("useGroupAddMembersMutation", "9856173864498377", "Iqai-m3YjmvUFUrF_a1nyk"),
    "group_questions": ("GroupsCometMembershipQuestionsDialogQuery", "24850850671182236", "-ixa7RXxhwMoRD9Qu-xJlZK"),
    "group_answers_save": ("useGroupMembershipAnswersSaveMutation", "23951724534439437", "8cv973UWReSdkQKVjpTpGH"),
    "scan_joined_groups": ("GroupsCometAllJoinedGroupsSectionPaginationQuery", "9676137519162874", "Iqai-m3YjmvUFUrF_a1nyk"),
    "scan_pending_groups": ("GroupsCometPendingGroupJoinsSectionPaginationQuery", "9924911067556167", "MZgTWUpUO-O6rh-qSoWfzp"),
    "scan_group_members": ("GroupsCometMembersPageNewMembersSectionRefetchQuery", "24670246842562940", "fOvrkKcfOWr_4YL5TAEkDr"),
    "group_about": ("FetchGroupAboutInfo", "2955612984492958", "fOvrkKcfOWr_4YL5TAEkDr"),
    "search_groups": ("SearchCometResultsPaginatedResultsQuery", "9729744383789355", None),
    "search_in_group": ("SearchCometResultsPaginatedResultsQuery", "26255795984077549", "7MQSOOFNILrkvy2Ja73EQo"),
    "news_feed": ("CometNewsFeedPaginationQuery", "9957095364411180", "ykEi6FxiFel3RTKes1M9zh"),
    "video_feed": ("CometVideoHomeFeedSectionPaginationQuery", "10062801637135626", "xPOi5rEl2hp_btZPQvv6SA"),
    "timeline_feed": ("ProfileCometTimelineFeedRefetchQuery", "29857242777255325", None),
    "group_feed": ("GroupsCometFeedRegularStoriesPaginationQuery", "9755367644572581", None),
    "activity_log": ("CometActivityLogStoriesListPaginationQuery", "24552699064401678", None),
    "stories_tray": ("StoriesTrayRectangularQuery", "9861985363909710", "uY6uGgCcwQ1aNyP3mboCBP"),
    "stories_seen": ("storiesUpdateSeenStateMutation", "9567413276713742", "s0UMhpfTEr-c8EA3Gj8Cb0"),
    "stories_reply": ("useStoriesSendReplyMutation", "9697491553691692", "QVaLPZqaUdhcu7udk4qCHj"),
    "notifications": ("CometNotificationsListPaginationQuery", "24270421129216356", "72oJXqwMVJOdYHsNeltZiE"),
    "notifications_seen": ("CometNotificationsUpdateSeenStateMutation", "9077759465660685", None),
    "scan_fanpages": ("PagesCometLaunchPointUnifiedQueryPagesListRedesignedUpdatedPagesSectionQuery", "29849393258040848", "6ZK8pZg2uuh5fCnTbpq2wO"),
    "like_fanpage": ("CometProfilePlusLikeMutation", "10062329867123540", "qbYXirMV6CUc5YC6Q0B9eL"),
    "invite_like_fanpage": ("useCometProfilePlusSendFriendFollowerInviteMutation", "9655810507808142", "AWjEdAA1Nrqj9-N3aPHs5Q"),
    "profile_menu": ("ProfileCometRootLeftNavMenuQuery", "25099262403096266", "62lM8UGufFCuYxBOPGQieU"),
    "profile_menu_page": ("ProfileCometRootLeftNavMenuQuery", "24704553295801584", "6ZK8pZg2uuh5fCnTbpq2wO"),
    "reactivate_root": ("ReactivateProfileRootQuery", "9878455382192938", "4fwo9DoVHmlgsWQaq4K3w6"),
    "reactivate_profile": ("ReactivateProfileMutation", "30461474920118000", "sAhA_D6FdtlmELL_G8Mo5f"),
    "link_preview": ("ComposerLinkAttachmentPreviewQuery", "24138745772416942", "iGS3803cC92e4PORkupwoU"),
}

_ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
_BASE64URL = _ALPHANUM + "-_"


class FacebookError(Exception):
    """Tương đương lớp `ue` trong bản gốc — lỗi nghiệp vụ Facebook."""


def _get(data: Any, path: str) -> Any:
    """Tương đương C.handleGetValue(() => a.b.c[0].d) — trả None nếu đứt đường dẫn."""
    cur = data
    for token in re.findall(r"[^.\[\]]+", path):
        try:
            cur = cur[int(token)] if token.isdigit() else cur[token]
        except (KeyError, IndexError, TypeError):
            return None
    return cur


class FacebookEngine:
    # ---------------------------------------------------------------- helpers

    @staticmethod
    def make_id(length: int) -> str:
        """C.makeid"""
        return "".join(random.choice(_ALPHANUM) for _ in range(length))

    @staticmethod
    def make_number(length: int) -> str:
        """C.makeNumber"""
        return "".join(random.choice("0123456789") for _ in range(length))

    @staticmethod
    def generate_random_code(length: int) -> str:
        """C.generateRandomCode — bảng 64 ký tự base64url"""
        return "".join(random.choice(_BASE64URL) for _ in range(length))

    @staticmethod
    def get_rticket() -> int:
        """C.getRticket — milliseconds"""
        return int(time.time() * 1000)

    @staticmethod
    def get_spin_t() -> int:
        """C.getSpinT — seconds"""
        return int(round(time.time()))

    @staticmethod
    def get_logging_interaction_key() -> str:
        """C.getLoggingInteractionKey — uuid v4"""
        out = []
        for ch in "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx":
            if ch in ("4", "-"):
                out.append(ch)
                continue
            r = random.randrange(16)
            out.append(format(r if ch == "x" else (r & 3) | 8, "x"))
        return "".join(out)

    uuidv4 = get_logging_interaction_key

    @staticmethod
    def b64(value: str) -> str:
        """btoa"""
        return base64.b64encode(value.encode("utf-8")).decode("ascii")

    @staticmethod
    def unb64(value: str) -> str:
        """atob — bù padding vì Facebook trả chuỗi không padding"""
        pad = "=" * (-len(value) % 4)
        return base64.b64decode(value + pad).decode("utf-8", "replace")

    @staticmethod
    def spin_text(text: str) -> str:
        """C.spinText — cú pháp {a|b|c}, giải lồng nhau từ trong ra ngoài"""
        if not text:
            return ""
        pattern = r"\{([^{}]*)\}"
        while re.search(pattern, text):
            text = re.sub(pattern, lambda m: random.choice(m.group(1).split("|")), text, count=1)
        return text

    @staticmethod
    def get_numeric_value(fbdtsg: str) -> str:
        """C.getNumericValue — jazoest = "2" + tổng charCode của fb_dtsg"""
        return "2" + str(sum(ord(c) for c in fbdtsg or ""))

    # Giữ tên cũ cho tương thích ngược
    generate_numeric_jazoest = get_numeric_value

    @staticmethod
    def get_2fa_code(secret_key: str) -> Optional[str]:
        """TOTP 30 giây sinh cục bộ; không gửi seed đi đâu."""
        try:
            secret_clean = (secret_key or "").replace(" ", "").strip().upper()
            secret_clean += "=" * ((8 - len(secret_clean) % 8) % 8)
            key = base64.b32decode(secret_clean, casefold=True)
            counter = int(time.time()) // 30
            digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
            offset = digest[-1] & 0x0F
            code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
            return f"{code:06d}"
        except Exception:
            return None

    @staticmethod
    def parse_cookie_string(cookie_str: str) -> Dict[str, str]:
        cookies = {}
        for item in (cookie_str or "").split(";"):
            if "=" in item:
                k, v = item.strip().split("=", 1)
                cookies[k.strip()] = v.strip()
        return cookies

    @staticmethod
    def _proxies(proxy: Optional[str]) -> Optional[Dict[str, str]]:
        return {"http": proxy, "https": proxy} if proxy else None

    @staticmethod
    def _is_login_response(response) -> bool:
        """Nhận diện Facebook đã đẩy cookie hết hạn về màn hình đăng nhập."""
        final_url = str(getattr(response, "url", "") or "").lower()
        body = (getattr(response, "text", "") or "").lower()
        return (
            "/login/" in final_url
            or "login.php" in final_url
            or 'id="login_form"' in body
            or 'name="login"' in body
        )

    # ------------------------------------------------------------ init data

    @classmethod
    def fetch_init_data(cls, account: Dict[str, Any], proxy: Optional[str] = None) -> Dict[str, str]:
        """
        Lấy fb_dtsg + client_revision như bản gốc lấy qua Puppeteer.
        Bản gốc ném "Tài khoản chưa lấy facebookInitData" nếu thiếu — ở đây ta
        chủ động tải https://www.facebook.com/ rồi bóc từ HTML.
        """
        cookies = cls.parse_cookie_string(account.get("cookie", ""))
        res = requests.get(
            "https://www.facebook.com/",
            cookies=cookies,
            proxies=cls._proxies(proxy),
            headers={"user-agent": USER_AGENT_DESKTOP},
            timeout=20,
            impersonate="chrome120",
        )
        if cls._is_login_response(res):
            raise FacebookError("Cookie Facebook đã hết hạn hoặc không còn phiên đăng nhập")
        html = res.text
        dtsg = None
        for pattern in (
            r'"DTSGInitialData"\s*,\s*\[\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"',
            r'name="fb_dtsg"\s+value="([^"]+)"',
            r'"dtsg"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"',
        ):
            m = re.search(pattern, html)
            if m:
                dtsg = m.group(1)
                break
        rev = None
        for pattern in (r'"client_revision"\s*:\s*(\d+)', r'"__spin_r"\s*:\s*(\d+)', r'"rev"\s*:\s*(\d+)'):
            m = re.search(pattern, html)
            if m:
                rev = m.group(1)
                break
        if not dtsg:
            raise FacebookError("Không lấy được fb_dtsg — cookie hỏng hoặc tài khoản bị checkpoint")
        return {"fbdtsg": dtsg, "rev": rev or ""}

    @classmethod
    def ensure_init_data(cls, account: Dict[str, Any], proxy: Optional[str] = None) -> Dict[str, Any]:
        """
        Bảo đảm account có fbdtsg/rev trước khi gọi GraphQL. Mutate account tại chỗ
        và đánh dấu `_init_data_refreshed` để lớp route ghi ngược vào DB.
        """
        if account.get("fbdtsg") and account.get("rev"):
            return account
        data = cls.fetch_init_data(account, proxy)
        account["fbdtsg"] = data["fbdtsg"]
        account["rev"] = data["rev"] or account.get("rev") or ""
        account["_init_data_refreshed"] = True
        return account

    # ------------------------------------------------------------ transport

    @classmethod
    def build_params_fb_desktop(cls, account: Dict[str, Any]) -> Dict[str, Any]:
        """C.buildParamsFBDesktop — giữ nguyên đủ 22 tham số của bản gốc."""
        fbdtsg = account.get("fbdtsg")
        rev = account.get("rev")
        if not fbdtsg or not rev:
            raise FacebookError("Tài khoản chưa lấy facebookInitData")
        user_id = account.get("uid") or cls.parse_cookie_string(account.get("cookie", "")).get("c_user", "")
        return {
            "av": user_id,
            "__user": user_id,
            "__a": "1",
            "__dyn": FB_DYN,
            "__csr": "",
            "__req": cls.make_id(2),
            "__beoa": "0",
            "__pc": "EXP2:comet_pkg",
            "dpr": "1",
            "__ccg": "EXCELLENT",
            "__rev": rev,
            "__s": f"{cls.make_id(6)}:{cls.make_id(6)}:{cls.make_id(6)}",
            "__hsi": "6" + cls.make_number(19) + "-0",
            "__comet_req": "0",
            "fb_dtsg": fbdtsg,
            "jazoest": cls.get_numeric_value(fbdtsg),
            "__spin_r": rev,
            "__spin_b": "trunk",
            "__spin_t": cls.get_spin_t(),
            "server_timestamps": "true",
        }

    @staticmethod
    def _parse_fb_response(text: str) -> Any:
        """Bản gốc: JSON.parse(data.replace("for (;;);","").split("\\n")[0])"""
        cleaned = (text or "").replace("for (;;);", "").strip()
        if not cleaned:
            raise FacebookError("Facebook trả về nội dung rỗng")
        return json.loads(cleaned.split("\n")[0])

    @staticmethod
    def _error_message(data: Any, fallback: str) -> str:
        """C.getErrorFB + C.showMessageErrorFb"""
        raw = ""
        if isinstance(data, dict):
            desc = data.get("errorDescription")
            if isinstance(desc, dict):
                raw = desc.get("__html", "")
            elif isinstance(desc, str):
                raw = desc
            if not raw and data.get("errors"):
                raw = str(_get(data, "errors.0.message") or "")
            if not raw and data.get("error"):
                raw = str(data["error"])
        if "checkpoint_required" in raw:
            return "Tài khoản của bạn đã bị checkpoint."
        if "Error loading application" in raw:
            return "Vui lòng đăng nhập lại."
        if "<li>" in raw:
            return raw.split("<li>")[1].replace("<br />", "").replace("</li>", "").replace("  ", "")
        if any(s in raw for s in ("www.facebook.com/help", "Sorry, something went wrong", "Unexpected token")):
            return "Server Facebook bị lỗi, vui lòng thử lại sau!"
        return raw or fallback

    @classmethod
    def execute_graphql(
        cls,
        account: Dict[str, Any],
        call_key: str,
        variables: Any,
        proxy: Optional[str] = None,
        extra_params: Optional[Dict[str, Any]] = None,
        caller_class: str = "RelayModern",
        crn: Optional[str] = DEFAULT_CRN,
        hs: Optional[str] = DEFAULT_HS,
        analytics_tags: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Gửi một call site GraphQL đúng như bản gốc dựng nó:
        buildParamsFBDesktop + __aaid/__hs/lsd/__crn + friendly name + doc_id,
        kèm header x-asbd-id / x-fb-friendly-name / x-fb-lsd.
        """
        if call_key not in GRAPHQL_CALLS:
            raise FacebookError(f"Không có call site GraphQL cho '{call_key}'")
        friendly_name, doc_id, lsd = GRAPHQL_CALLS[call_key]
        lsd = lsd or cls.make_id(22)

        cls.ensure_init_data(account, proxy)
        params: Dict[str, Any] = cls.build_params_fb_desktop(account)
        # Thao tác dưới danh nghĩa fanpage: bản gốc đổi `av` sang page id, giữ `__user` là user
        if account.get("_page_id"):
            params["av"] = account["_page_id"]
        params["__aaid"] = "0"
        if hs:
            params["__hs"] = hs
        params["lsd"] = lsd
        if crn:
            params["__crn"] = crn
        params["fb_api_caller_class"] = caller_class
        params["fb_api_req_friendly_name"] = friendly_name
        if analytics_tags:
            params["fb_api_analytics_tags"] = analytics_tags
        params["variables"] = variables if isinstance(variables, str) else json.dumps(variables, separators=(",", ":"))
        params["doc_id"] = doc_id
        if extra_params:
            params.update(extra_params)

        headers = {
            "content-type": "application/x-www-form-urlencoded",
            "x-asbd-id": ASBD_ID,
            "x-fb-friendly-name": friendly_name,
            "x-fb-lsd": lsd,
            "origin": "https://www.facebook.com",
            "referer": "https://www.facebook.com/",
            "user-agent": account.get("userAgent") or USER_AGENT_DESKTOP,
        }

        res = requests.post(
            GRAPHQL_URL,
            data=urllib.parse.urlencode(params, doseq=True),
            headers=headers,
            cookies=cls.parse_cookie_string(account.get("cookie", "")),
            proxies=cls._proxies(proxy),
            timeout=30,
            impersonate="chrome120",
        )
        if res.status_code >= 400:
            raise FacebookError(f"Facebook HTTP {res.status_code}")
        return cls._parse_fb_response(res.text)

    @classmethod
    def _call(
        cls,
        account: Dict[str, Any],
        call_key: str,
        variables: Any,
        proxy: Optional[str],
        check_path: Optional[str],
        fail_message: str,
        expect: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Gọi GraphQL rồi xác nhận kết quả nghiệp vụ đúng cách bản gốc làm:
        không có `check_path` khớp thì coi là THẤT BẠI, kể cả khi HTTP 200.
        """
        try:
            data = cls.execute_graphql(account, call_key, variables, proxy, **kwargs)
        except FacebookError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as exc:
            return {"success": False, "error": f"Lỗi kết nối: {exc}"}

        if check_path is None:
            if isinstance(data, dict) and data.get("errors"):
                return {"success": False, "error": cls._error_message(data, fail_message)}
            return {"success": True, "data": data}

        value = _get(data, check_path)
        if value is None or value is False:
            return {"success": False, "error": cls._error_message(data, fail_message)}
        if expect is not None and value != expect:
            return {"success": False, "error": f"{fail_message} ({value})"}
        return {"success": True, "data": data, "value": value}

    # ------------------------------------------------------------ live check

    @classmethod
    def check_live_status(cls, uid: str, proxy: Optional[str] = None) -> Dict[str, Any]:
        """
        Kiểm tra Live/Die qua avatar Graph API — đúng endpoint và access_token
        mà bản gốc dùng (er.GraphFacebook + er.AvatarFBParam).
        """
        url = f"{GRAPH_FACEBOOK}/{uid}/{AVATAR_FB_PARAM}"
        try:
            res = requests.get(
                url,
                timeout=15,
                proxies=cls._proxies(proxy),
                headers={"user-agent": USER_AGENT_DESKTOP},
                allow_redirects=True,
                impersonate="chrome120",
            )
        except Exception as exc:
            return {"status": "Chưa check", "message": f"Lỗi kết nối kiểm tra: {exc}"}

        ctype = (res.headers.get("content-type") or "").lower()
        if res.status_code == 200 and ctype.startswith("image/"):
            return {"status": "Live", "message": "Tài khoản đang hoạt động bình thường", "avatar": url}
        if res.status_code in (400, 404):
            return {"status": "Die", "message": "Tài khoản không tồn tại hoặc đã bị khoá"}
        if res.status_code == 200:
            # Graph trả JSON lỗi kèm HTTP 200 khi uid bị vô hiệu hoá
            try:
                body = res.json()
            except Exception:
                body = {}
            msg = _get(body, "error.message") or "Không đọc được avatar"
            return {"status": "Die", "message": str(msg)}
        return {"status": "Checkpoint", "message": f"Nghi vấn Checkpoint (HTTP {res.status_code})"}

    # ------------------------------------------------------- friends actions

    @classmethod
    def send_friend_request(cls, account, target_uid: str, proxy=None):
        """Gửi lời mời kết bạn — FriendingCometFriendRequestSendMutation"""
        uid = account.get("uid")
        t = cls.get_rticket()
        attribution = (
            f"ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,unexpected,{t},110784,190055527696468,,;"
            f"FriendingCometSuggestionsRoot.react,comet.friending.suggestions,unexpected,{t},164747,,,;"
            f"FriendingCometRoot.react,comet.friending,unexpected,{t},543258,2356318349,,;"
            f"FriendingCometFriendRequestsRoot.react,comet.friending.friendrequests,unexpected,{t},993633,2356318349,,;"
            f"FriendingCometRoot.react,comet.friending,tap_tabbar,{t},970696,2356318349,,"
        )
        variables = {
            "input": {
                "attribution_id_v2": attribution,
                "click_proof_validation_result": None,
                "friend_requestee_ids": [target_uid],
                "friending_channel": "PROFILE_BUTTON",
                "warn_ack_for_ids": [],
                "actor_id": uid,
                "client_mutation_id": "8",
            },
            "scale": 2,
        }
        return cls._call(
            account, "friend_request_send", variables, proxy,
            "data.friend_request_send.friend_requestees.0.friendship_status",
            f"Gửi lời mời kết bạn cho user {target_uid} thất bại",
            expect="OUTGOING_REQUEST",
        )

    @classmethod
    def confirm_friend_request(cls, account, requester_uid: str, proxy=None):
        """Đồng ý kết bạn — FriendingCometFriendRequestConfirmMutation"""
        variables = {
            "input": {
                "click_proof_validation_result": '{"validated":true}',
                "friend_requester_id": requester_uid,
                "friending_channel": "FRIENDS_HOME_REQUESTS",
                "warn_ack": False,
                "actor_id": account.get("uid"),
                "client_mutation_id": "2",
            },
            "scale": 2,
            "refresh_num": 0,
            "should_fix_banner": False,
        }
        return cls._call(
            account, "friend_request_confirm", variables, proxy,
            "data.friend_request_accept.friend_requester.friendship_status",
            f"Chấp nhận lời mời kết bạn với user {requester_uid} thất bại",
        )

    @classmethod
    def refuse_friend_request(cls, account, requester_uid: str, proxy=None):
        """Từ chối lời mời kết bạn đến — FriendingCometFriendRequestDeleteMutation"""
        variables = {
            "input": {
                "click_proof_validation_result": '{"validated":true}',
                "friend_requester_id": requester_uid,
                "friending_channel": "FRIENDS_HOME_MAIN",
                "actor_id": account.get("uid"),
                "client_mutation_id": "3",
            },
            "scale": 2,
            "refresh_num": 0,
        }
        return cls._call(
            account, "friend_request_refuse", variables, proxy,
            "data.friend_request_delete.friend_requester.friendship_status",
            f"Từ chối lời mời kết bạn của user {requester_uid} thất bại",
        )

    @classmethod
    def cancel_friend_request(cls, account, target_uid: str, proxy=None):
        """Huỷ lời mời mình đã gửi đi — FriendingCometFriendRequestDeleteMutation (call site khác)"""
        variables = {
            "input": {
                "attribution_id_v2": (
                    "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,via_cold_start,"
                    f"{cls.get_rticket()},831982,250100865708545,,"
                ),
                "cancelled_friend_requestee_id": target_uid,
                "click_proof_validation_result": None,
                "friending_channel": "PROFILE_BUTTON",
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "scale": 2,
        }
        return cls._call(
            account, "friend_request_cancel", variables, proxy,
            "data.friend_request_delete.friend_requester.friendship_status",
            f"Huỷ lời mời kết bạn đã gửi cho user {target_uid} thất bại",
        )

    # Giữ tên cũ; bản cũ gộp nhầm hai call site khác nhau vào một hàm
    delete_friend_request = refuse_friend_request

    @classmethod
    def unfriend(cls, account, target_uid: str, proxy=None):
        """Huỷ kết bạn — FriendingCometUnfriendMutation"""
        variables = {
            "input": {
                "source": "bd_profile_button",
                "unfriended_user_id": target_uid,
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "scale": 2,
        }
        return cls._call(
            account, "unfriend", variables, proxy,
            "data.friend_remove.unfriended_person.friendship_status",
            f"Huỷ kết bạn user {target_uid} thất bại",
        )

    @classmethod
    def unfollow(cls, account, target_uid: str, proxy=None):
        """Bỏ theo dõi — CometUserUnfollowMutation"""
        variables = {
            "action_render_location": "WWW_COMET_FRIEND_MENU",
            "input": {
                "attribution_id_v2": (
                    "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,via_cold_start,"
                    f"{cls.get_rticket()},50182,190055527696468,,"
                ),
                "is_tracking_encrypted": False,
                "subscribe_location": "PROFILE",
                "tracking": None,
                "unsubscribee_id": target_uid,
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "scale": 2,
        }
        return cls._call(
            account, "unfollow", variables, proxy,
            "data.actor_unsubscribe.unsubscribee.subscribe_status",
            f"Huỷ theo dõi user {target_uid} thất bại",
        )

    @classmethod
    def poke_friend(cls, account, target_uid: str, proxy=None):
        """Chọc bạn — PokesMutatorPokeMutation"""
        variables = {"input": {"client_mutation_id": "4", "actor_id": account.get("uid"), "user_id": target_uid}}
        return cls._call(
            account, "poke", variables, proxy,
            "data.user_poke.user.poke_status",
            f"Chọc bạn user {target_uid} thất bại",
        )

    @classmethod
    def set_best_friend(cls, account, target_uid, proxy=None, list_id: Optional[str] = None):
        """
        Thêm vào danh sách bạn thân — useFriendListCometUpdateMembersMutation.
        Bản gốc lấy list_id từ FriendListCometRootQuery trước khi gọi mutation.
        """
        if not list_id:
            root = cls._call(account, "friend_list_root", "{}", proxy, None, "Không lấy được danh sách bạn thân")
            if not root.get("success"):
                return root
            list_id = (
                _get(root["data"], "data.viewer.close_friends_list.id")
                or _get(root["data"], "data.viewer.actor.close_friends_list.id")
            )
            if not list_id:
                return {"success": False, "error": "Không tìm thấy list_id danh sách bạn thân"}
        add_ids = target_uid if isinstance(target_uid, list) else [target_uid]
        variables = {
            "input": {
                "client_mutation_id": "4",
                "actor_id": account.get("uid"),
                "add_ids": add_ids,
                "close_friends_current_surface": "CFL_EDIT",
                "close_friends_ref": "FRIENDS_TAB",
                "list_id": list_id,
                "remove_ids": [],
            }
        }
        return cls._call(
            account, "best_friend", variables, proxy,
            "data.friend_list_update_members.friend_list",
            "Thiết lập bạn thân thất bại",
        )

    # ------------------------------------------------------ post interaction

    @classmethod
    def react_to_feedback(cls, account, feedback_id: str, reaction_type: str = "Like", proxy=None, is_comment: bool = False):
        """
        Thả cảm xúc — CometUFIFeedbackReactMutation.
        feedback_id được mã hoá btoa("feedback:<id>") và reaction là id 16 chữ số.
        """
        key = (reaction_type or "Like").replace(" ", "").upper()
        key = FB_REACTION_ALIASES.get(key, key)
        reaction_id = FB_REACTION_IDS.get(key)
        if not reaction_id:
            return {"success": False, "error": f"Reaction '{reaction_type}' không được hỗ trợ (chỉ {', '.join(FB_REACTIONS_SUPPORTED)})"}
        variables = {
            "input": {
                "attribution_id_v2": (
                    f"CometHomeRoot.react,comet.home,logo,{cls.get_spin_t()}96,93{cls.make_number(4)},47{cls.make_number(8)},,"
                ),
                "feedback_id": cls.b64(f"feedback:{feedback_id}"),
                "feedback_reaction_id": reaction_id,
                "feedback_source": "NEWS_FEED",
                "feedback_referrer": "/permalink.php",
                "is_tracking_encrypted": True,
                "tracking": [cls.generate_random_code(1454)],
                "session_id": cls.get_logging_interaction_key(),
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "useDefaultActor": False,
            "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": False,
        }
        return cls._call(
            account, "react_comment" if is_comment else "react_post", variables, proxy,
            "data.feedback_react.feedback.id",
            f"Thả tương tác '{feedback_id}' thất bại",
        )

    @classmethod
    def create_comment(cls, account, feedback_id: str, message: str, proxy=None, attachment_id: Optional[str] = None):
        """Bình luận bài viết — useCometUFICreateCommentMutation"""
        uid = account.get("uid")
        text = cls.spin_text(message)
        variables = {
            "feedLocation": "TIMELINE",
            "feedbackSource": 0,
            "groupID": None,
            "input": {
                "client_mutation_id": "5",
                "actor_id": uid,
                "attachments": [{"media": {"id": attachment_id}}] if attachment_id else None,
                "feedback_id": cls.b64(f"feedback:{feedback_id}"),
                "formatting_style": None,
                "message": {"ranges": [], "text": text},
                "attribution_id_v2": (
                    "ProfileCometTimelineListViewRoot.react,comet.profile.timeline.list,tap_bookmark,"
                    f"{cls.get_rticket()},188846,{uid},,"
                ),
                "vod_video_timestamp": None,
                "is_tracking_encrypted": True,
                "tracking": [
                    cls.generate_random_code(1454),
                    '{"assistant_caller":"comet_above_composer","conversation_guide_session_id":null,"conversation_guide_shown":null}',
                ],
                "feedback_source": "PROFILE",
                "idempotence_token": f"client:{cls.get_logging_interaction_key()}",
                "session_id": cls.get_logging_interaction_key(),
            },
            "inviteShortLinkKey": None,
            "renderLocation": None,
            "scale": 2,
            "useDefaultActor": False,
            "focusCommentID": None,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
        }
        res = cls._call(
            account, "comment_post", variables, proxy,
            "data.comment_create.feedback_comment_edge.node.id",
            f"Comment bài viết {feedback_id} thất bại",
        )
        if res.get("success"):
            try:
                res["comment_id"] = cls.unb64(res["value"]).split("_")[1]
            except Exception:
                pass
        return res

    @classmethod
    def reply_comment(cls, account, post_id: str, comment_id: str, message: str, proxy=None, attachment_id: Optional[str] = None):
        """Trả lời bình luận — useCometUFICreateCommentMutation (call site reply)"""
        uid = account.get("uid")
        text = cls.spin_text(message)
        t = cls.get_rticket()
        variables = {
            "feedLocation": "NEWSFEED",
            "feedbackSource": 0,
            "groupID": None,
            "input": {
                "client_mutation_id": "6",
                "actor_id": uid,
                "attachments": [{"media": {"id": attachment_id}}] if attachment_id else None,
                "feedback_id": cls.b64(f"feedback:{post_id}_{comment_id}"),
                "formatting_style": None,
                "message": {"ranges": [], "text": text},
                "reply_comment_parent_fbid": cls.b64(f"comment:{post_id}_{comment_id}"),
                "reply_target_clicked": True,
                "attribution_id_v2": (
                    f"CometGroupDiscussionRoot.react,comet.group,unexpected,{t},967278,2361831622,,;"
                    f"GroupsCometCrossGroupFeedRoot.react,comet.groups.feed,via_cold_start,{t},884446,2361831622,,"
                ),
                "vod_video_timestamp": None,
                "feedback_referrer": "/permalink.php",
                "is_tracking_encrypted": True,
                "tracking": [
                    cls.generate_random_code(1603),
                    '{"assistant_caller":"comet_above_composer","conversation_guide_session_id":null,"conversation_guide_shown":null}',
                ],
                "feedback_source": "PROFILE",
                "idempotence_token": f"client:{cls.get_logging_interaction_key()}",
                "session_id": cls.get_logging_interaction_key(),
            },
            "inviteShortLinkKey": None,
            "renderLocation": None,
            "scale": 2,
            "useDefaultActor": False,
            "focusCommentID": None,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
        }
        return cls._call(
            account, "reply_comment", variables, proxy,
            "data.comment_create.feedback_comment_edge.node.id",
            f"Trả lời bình luận {comment_id} thất bại",
        )

    @classmethod
    def create_post(cls, account, message: str, target_group_id: Optional[str] = None, proxy=None, attachments: Optional[List[Dict]] = None):
        """Đăng bài lên tường hoặc nhóm — ComposerStoryCreateMutation"""
        uid = account.get("uid")
        session = cls.uuidv4()
        t = cls.get_rticket()
        is_group = bool(target_group_id)
        surface = {
            "composer_source_surface": "group" if is_group else "newsfeed",
            "composer_type": "group" if is_group else "feed",
            "audience": {"to_id": target_group_id} if is_group else {
                "privacy": {"allow": [], "base_state": "FRIENDS", "deny": [], "tag_expansion_state": "UNSPECIFIED"}
            },
            "publishing_flow": None if is_group else {"supported_flows": ["ASYNC_SILENT", "ASYNC_NOTIF", "FALLBACK"]},
            "feedLocation": "GROUP" if is_group else "NEWSFEED",
            "feedbackSource": 0 if is_group else 1,
            "checkPhotosToReelsUpsellEligibility": not is_group,
            "renderLocation": "group" if is_group else "homepage_stream",
            "isFeed": not is_group,
            "isGroup": is_group,
            "navigation_data": {
                "attribution_id_v2": (
                    f"CometGroupDiscussionRoot.react,comet.group,via_cold_start,{t},97903,2361831622,,"
                    if is_group else
                    f"CometHomeRoot.react,comet.home,via_cold_start,{t},575272,4748854339,,"
                )
            },
        }
        media = []
        for item in attachments or []:
            if item.get("photoId"):
                media.append({"photo": {"id": item["photoId"]}})
            elif item.get("videoId"):
                media.append({"video": {"id": item["videoId"], "notify_when_processed": True}})

        inp = {
            "composer_entry_point": "inline_composer" if is_group else "publisher_bar_anonymous_author",
            "composer_source_surface": surface["composer_source_surface"],
            "composer_type": surface["composer_type"],
            "idempotence_token": f"{session}_FEED",
            "source": "WWW",
            "audience": surface["audience"],
            "message": {"ranges": [], "text": cls.spin_text(message)},
            "inline_activities": [],
            "text_format_preset_id": "0",
            "attachments": media,
            "logging": {"composer_session_id": session},
            "navigation_data": surface["navigation_data"],
            "tracking": [None],
            "event_share_metadata": {"surface": "newsfeed"},
            "actor_id": uid,
            "client_mutation_id": "1",
        }
        if surface["publishing_flow"] is not None:
            inp["publishing_flow"] = surface["publishing_flow"]
        if not is_group:
            inp["ask_admin_to_post_for_user"] = {"is_asking_admin_to_post": True}

        variables = {
            "input": inp,
            "feedLocation": surface["feedLocation"],
            "feedbackSource": surface["feedbackSource"],
            "focusCommentID": None,
            "gridMediaWidth": None,
            "groupID": None,
            "scale": 2,
            "privacySelectorRenderLocation": "COMET_STREAM",
            "checkPhotosToReelsUpsellEligibility": surface["checkPhotosToReelsUpsellEligibility"],
            "renderLocation": surface["renderLocation"],
            "useDefaultActor": False,
            "inviteShortLinkKey": None,
            "isFeed": surface["isFeed"],
            "isFundraiser": False,
            "isFunFactPost": False,
            "isGroup": surface["isGroup"],
            "isEvent": False,
            "isTimeline": False,
            "isSocialLearning": False,
            "isPageNewsFeed": False,
            "isProfileReviews": False,
            "isWorkSharedDraft": False,
            "hashtag": None,
            "canUserManageOffers": False,
            "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": True,
            "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": False,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
            "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": False,
            "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": True,
            "__relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider": False,
            "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": False,
            "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": False,
            "__relay_internal__pv__IsMergQAPollsrelayprovider": False,
            "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": False,
            "__relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider": True,
            "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": False,
            "__relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider": True,
        }
        res = cls._call(
            account, "create_post", variables, proxy, None, "Đăng bài thất bại",
            extra_params={"av": uid, "__user": uid},
        )
        if not res.get("success"):
            return res
        data = res["data"]
        story = _get(data, "data.story_create.story_id") or _get(data, "data.story_create.story.id")
        if not story:
            return {"success": False, "error": cls._error_message(data, "Đăng bài thất bại")}
        try:
            res["post_id"] = cls.unb64(story).split(":")[-1]
        except Exception:
            res["post_id"] = story
        return res

    @classmethod
    def delete_post(cls, account, story_id: str, proxy=None):
        """Xoá bài viết — useCometFeedStoryDeleteMutation"""
        uid = account.get("uid")
        variables = {
            "input": {
                "story_id": cls.b64(f"S:_I{uid}:{story_id}:{story_id}"),
                "story_location": "PERMALINK",
                "actor_id": uid,
                "client_mutation_id": "1",
            },
            "groupID": None,
            "inviteShortLinkKey": None,
            "renderLocation": None,
            "scale": 2,
        }
        return cls._call(
            account, "delete_post", variables, proxy,
            "data.story_delete.deleted_story_id",
            f"Xoá bài viết {story_id} thất bại",
            analytics_tags='["qpl_active_flow_ids=55246849"]',
        )

    # -------------------------------------------------------- group actions

    @classmethod
    def join_group(cls, account, group_id: str, proxy=None):
        """Tham gia nhóm — GroupCometJoinForumMutation"""
        t = cls.get_rticket()
        variables = {
            "feedType": "DISCUSSION",
            "groupID": group_id,
            "input": {
                "action_source": "SEARCH",
                "attribution_id_v2": (
                    f"SearchCometGlobalSearchDefaultTabRoot.react,comet.search_results.default_tab,unexpected,{t},392907,391724414624676,,;"
                    f"SearchCometGlobalSearchDefaultTabRoot.react,comet.search_results.default_tab,tap_search_bar,{t},363379,391724414624676,,"
                ),
                "group_id": group_id,
                "group_share_tracking_params": None,
                "actor_id": account.get("uid"),
                "client_mutation_id": "8",
            },
            "inviteShortLinkKey": None,
            "isChainingRecommendationUnit": False,
            "scale": 2,
            "source": "SEARCH",
            "renderLocation": "group_mall",
            "__relay_internal__pv__GroupsCometGroupChatLazyLoadLastMessageSnippetrelayprovider": False,
        }
        return cls._call(
            account, "join_group", variables, proxy,
            "data.group_request_to_join.group.viewer_join_state",
            f"Tham gia nhóm {group_id} thất bại",
        )

    @classmethod
    def leave_group(cls, account, group_id: str, proxy=None):
        """Rời nhóm — GroupCometLeaveForumMutation"""
        variables = {
            "input": {
                "attribution_id_v2": (
                    f"CometGroupDiscussionRoot.react,comet.group,tap_bookmark,{cls.get_rticket()},275719,{group_id},,"
                ),
                "group_id": group_id,
                "actor_id": account.get("uid"),
                "client_mutation_id": "4",
            },
            "inviteShortLinkKey": None,
            "isChainingRecommendationUnit": False,
            "ordering": ["viewer_added"],
            "scale": 2,
            "groupID": group_id,
            "__relay_internal__pv__GroupsCometGroupChatLazyLoadLastMessageSnippetrelayprovider": False,
        }
        return cls._call(
            account, "leave_group", variables, proxy,
            "data.leave_forum_group.group.viewer_join_state",
            "Rời nhóm thất bại",
        )

    @classmethod
    def invite_friend_group(cls, account, group_id: str, friend_uids, proxy=None):
        """Mời bạn vào nhóm — useGroupAddMembersMutation"""
        uids = friend_uids if isinstance(friend_uids, list) else [friend_uids]
        variables = {
            "input": {
                "attribution_id_v2": (
                    f"CometGroupDiscussionRoot.react,comet.group,tap_bookmark,{cls.get_rticket()},164055,{group_id},,"
                ),
                "email_addresses": [],
                "group_id": group_id,
                "source": "comet_invite_friends",
                "user_ids": uids,
                "actor_id": account.get("uid"),
                "client_mutation_id": "2",
            },
            "groupID": group_id,
        }
        return cls._call(
            account, "invite_group", variables, proxy,
            "data.group_add_member.added_users",
            "Mời bạn bè vào nhóm thất bại (addedUsers)",
        )

    @classmethod
    def answer_group_questions(cls, account, group_id: str, answers: List[Dict], proxy=None):
        """Trả lời câu hỏi vào nhóm — useGroupMembershipAnswersSaveMutation"""
        variables = {
            "input": {
                "answers": [
                    {
                        "answer": a.get("answer"),
                        "question_id": a.get("questionId") or a.get("question_id"),
                        "selected_options": a.get("selectedOptionsId") or a.get("selected_options"),
                    }
                    for a in answers
                ],
                "attribution_id_v2": "CometGroupAboutRoot.react,comet.group.about,via_cold_start,1749700828787,725980,2361831622,,",
                "group_id": group_id,
                "rules_agreement_status": None,
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "inviteShortLinkKey": None,
            "isChainingRecommendationUnit": False,
            "profileID": None,
            "scale": 2,
            "groupID": group_id,
        }
        return cls._call(
            account, "group_answers_save", variables, proxy,
            "data.group_membership_questions_answers_save.group.viewer_membership_questions_answer_state",
            "Trả lời câu hỏi thất bại",
        )

    @classmethod
    def get_group_questions(cls, account, group_id: str, proxy=None):
        """GroupsCometMembershipQuestionsDialogQuery"""
        return cls._call(
            account, "group_questions", {"group_id": group_id, "scale": 2}, proxy,
            "data", f"Không lấy được câu hỏi của nhóm {group_id}",
        )

    @classmethod
    def get_group_about(cls, account, group_id: str, proxy=None):
        """FetchGroupAboutInfo — caller_class 'graphservice', không có __crn/__hs"""
        variables = {
            "group_id": group_id,
            "profile_picture_size": 105,
            "scale": "3",
            "nt_context": {"using_white_navbar": True, "styles_id": cls.make_id(32), "pixel_ratio": 3},
            "use_server_member_info": True,
            "show_tetra_linked_groups_hscroll": True,
        }
        res = cls._call(
            account, "group_about", variables, proxy,
            "data.group_address", "Quét thông tin nhóm thất bại (group_address)",
            caller_class="graphservice", crn=None, hs=None,
            analytics_tags='["GraphServices"]',
        )
        if res.get("success"):
            addr = res["value"]
            res["info"] = {
                "visibilityLabel": _get(addr, "visibility_label.text"),
                "memberCount": _get(addr, "group_member_profiles.count"),
                "visibility": addr.get("visibility"),
            }
        return res

    @classmethod
    def search_groups(cls, account, keyword: str, proxy=None, cursor: Optional[str] = None):
        """Tìm nhóm theo từ khoá — SearchCometResultsPaginatedResultsQuery (GROUPS_TAB)"""
        variables = {
            "allow_streaming": False,
            "args": {
                "callsite": "COMET_GLOBAL_SEARCH",
                "config": {
                    "exact_match": False, "high_confidence_config": None,
                    "intercept_config": None, "sts_disambiguation": None, "watch_config": None,
                },
                "context": {"bsid": cls.uuidv4(), "tsid": str(random.random())},
                "experience": {
                    "client_defined_experiences": ["ADS_PARALLEL_FETCH"],
                    "encoded_server_defined_params": None, "fbid": None, "type": "GROUPS_TAB",
                },
                "filters": [],
                "text": keyword,
            },
            "count": 5,
            "cursor": cursor,
            "feedLocation": "SEARCH",
            "feedbackSource": 23,
            "fetch_filters": True,
            "focusCommentID": None,
            "locale": None,
            "privacySelectorRenderLocation": "COMET_STREAM",
            "renderLocation": "search_results_page",
            "scale": 2,
            "stream_initial_count": 0,
            "useDefaultActor": False,
            "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
            "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": True,
            "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": False,
            "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": False,
            "__relay_internal__pv__IsMergQAPollsrelayprovider": False,
            "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": True,
            "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": False,
            "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": True,
            "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": False,
            "__relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider": True,
            "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": True,
        }
        res = cls._call(
            account, "search_groups", variables, proxy,
            "data.serpResponse.results.edges",
            f"Không quét được nhóm theo từ khoá '{keyword}'",
        )
        if res.get("success"):
            groups = []
            for edge in res["value"]:
                node = _get(edge, "relay_rendering_strategy.view_model.profile") or _get(edge, "rendering_strategy.view_model.profile")
                if node and node.get("id"):
                    groups.append({"groupId": node.get("id"), "name": node.get("name")})
            res["groups"] = groups
            res["message"] = f"Quét được {len(groups)} nhóm cho từ khoá '{keyword}'"
        return res

    # ----------------------------------------------------- fanpage actions

    @classmethod
    def like_fanpage(cls, account, page_id: str, proxy=None):
        """Thích fanpage — CometProfilePlusLikeMutation"""
        variables = {
            "input": {
                "is_tracking_encrypted": False,
                "page_id": page_id,
                "source": None,
                "tracking": None,
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "scale": 2,
        }
        return cls._call(
            account, "like_fanpage", variables, proxy,
            "data.page_like.page.subscribe_status",
            "Thích fanpage thất bại",
            expect="IS_SUBSCRIBED",
        )

    @classmethod
    def invite_friend_like_fanpage(cls, account, page_id: str, friend_uids, proxy=None):
        """Mời bạn thích fanpage — useCometProfilePlusSendFriendFollowerInviteMutation"""
        uids = friend_uids if isinstance(friend_uids, list) else [friend_uids]
        variables = {
            "input": {
                "client_mutation_id": "1",
                "actor_id": account.get("uid"),
                "invitee_ids": uids,
                "invitee_type": "FRIENDS",
                "profile_id": page_id,
                "referrer": "FRIEND_INVITER",
                "use_group_selector": False,
            }
        }
        return cls._call(
            account, "invite_like_fanpage", variables, proxy,
            "data.profile_plus_send_friend_follower_invite.invitees",
            "Gửi lời mời thích fanpage thất bại",
        )

    @classmethod
    def review_fanpage(cls, account, page_id: str, message: str, proxy=None):
        """Đánh giá fanpage — ComposerStoryCreateMutation (page_recommendation)"""
        uid = account.get("uid")
        session = cls.get_logging_interaction_key()
        variables = {
            "input": {
                "composer_entry_point": "inline_composer",
                "composer_source_surface": "page_recommendation_tab",
                "idempotence_token": f"{session}_FEED",
                "source": "WWW",
                "audience": {"privacy": {"allow": [], "base_state": "EVERYONE", "deny": [], "tag_expansion_state": "UNSPECIFIED"}},
                "message": {"ranges": [], "text": cls.spin_text(message)},
                "with_tags_ids": None,
                "text_format_preset_id": "0",
                "page_recommendation": {"page_id": page_id, "rec_type": "POSITIVE"},
                "logging": {"composer_session_id": session},
                "navigation_data": {
                    "attribution_id_v2": (
                        "ProfileCometReviewsTabRoot.react,comet.profile.reviews,via_cold_start,"
                        f"{cls.get_rticket()},967906,250100865708545,,"
                    )
                },
                "tracking": [None],
                "event_share_metadata": {"surface": "newsfeed"},
                "actor_id": uid,
                "client_mutation_id": "2",
            },
            "feedLocation": "PAGE_SURFACE_RECOMMENDATIONS",
            "feedbackSource": 0,
            "focusCommentID": None,
            "gridMediaWidth": None,
            "groupID": None,
            "scale": 2,
            "privacySelectorRenderLocation": "COMET_STREAM",
            "checkPhotosToReelsUpsellEligibility": False,
            "renderLocation": "timeline",
            "useDefaultActor": False,
            "inviteShortLinkKey": None,
            "isFeed": False,
            "isFundraiser": False,
            "isFunFactPost": False,
            "isGroup": False,
            "isEvent": False,
            "isTimeline": True,
            "isSocialLearning": False,
            "isPageNewsFeed": False,
            "isProfileReviews": True,
            "isWorkSharedDraft": False,
            "hashtag": None,
            "canUserManageOffers": False,
            "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": True,
            "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": False,
            "__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider": False,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
            "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": False,
            "__relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider": False,
            "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": True,
            "__relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider": False,
            "__relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider": False,
            "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": False,
            "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": False,
            "__relay_internal__pv__IsMergQAPollsrelayprovider": False,
            "__relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider": True,
            "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": True,
            "__relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider": True,
            "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": True,
            "__relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider": 150,
            "__relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider": False,
            "__relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider": True,
            "__relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider": False,
        }
        return cls._call(
            account, "review_fanpage", variables, proxy,
            "data.story_create", f"Đánh giá fanpage {page_id} thất bại",
        )

    @classmethod
    def reactivate_fanpage(cls, account, page_id: str, proxy=None):
        """Mở khoá fanpage — ReactivateProfileMutation"""
        variables = {"profile_id": page_id, "delegate_page_id": None}
        return cls._call(
            account, "reactivate_profile", variables, proxy,
            "data.reactivate_profile.id", "Mở khoá fanpage thất bại",
        )

    @classmethod
    def scan_fanpages(cls, account, proxy=None, cursor: Optional[str] = None):
        """PagesCometLaunchPointUnifiedQuery…UpdatedPagesSectionQuery"""
        return cls._call(
            account, "scan_fanpages", {"count": 10, "cursor": cursor, "scale": 2}, proxy,
            "data", "Không quét được danh sách fanpage",
        )

    # --------------------------------------------------------- view / scan

    @classmethod
    def view_news_feed(cls, account, proxy=None, cursor: Optional[str] = None):
        """Lướt bảng tin — CometNewsFeedPaginationQuery"""
        variables = {
            "RELAY_INCREMENTAL_DELIVERY": True,
            "clientQueryId": cls.uuidv4(),
            "clientSession": None,
            "connectionClass": "EXCELLENT",
            "count": 5,
            "cursor": cursor,
            "experimentalValues": None,
            "feedLocation": "NEWSFEED",
            "feedStyle": "DEFAULT",
            "feedbackSource": 1,
            "focusCommentID": None,
            "orderby": ["TOP_STORIES"],
            "privacySelectorRenderLocation": "COMET_STREAM",
            "recentVPVs": [],
            "refreshMode": "AUTO",
            "renderLocation": "homepage_stream",
            "scale": 2,
            "shouldChangeBRSLabelFieldName": True,
            "shouldChangeSponsoredAuctionDistanceFieldName": True,
            "shouldChangeSponsoredDataFieldName": True,
            "shouldObfuscateCategoryField": False,
            "useDefaultActor": False,
            "__relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": True,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
            "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": True,
            "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": False,
            "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": False,
            "__relay_internal__pv__IsMergQAPollsrelayprovider": False,
            "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": True,
            "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": False,
            "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": True,
            "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": False,
            "__relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider": True,
            "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": False,
        }
        return cls._call(
            account, "news_feed", variables, proxy,
            "data.viewer.news_feed.edges", "Không đọc được bảng tin",
        )

    @classmethod
    def view_videos(cls, account, proxy=None, cursor: Optional[str] = None):
        """Xem video — CometVideoHomeFeedSectionPaginationQuery"""
        variables = {
            "caller": None,
            "count": 3,
            "cursor": cursor,
            "feedLocation": "VIDEO_HOME_FEED",
            "isComet": True,
            "isLoggedOut": False,
            "privacySelectorRenderLocation": "COMET_STREAM",
            "renderLocation": "video_home",
            "scale": 2,
            "useDefaultActor": False,
            "id": "dmg6MTgzODE5NjMxOTgxNzg5Ng==",
            "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": True,
            "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": True,
            "__relay_internal__pv__FBReels_enable_click_to_see_more_logging_gkrelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": True,
        }
        return cls._call(account, "video_feed", variables, proxy, "data", "Không xem được video")

    @classmethod
    def view_notifications(cls, account, proxy=None, cursor: Optional[str] = None):
        """Xem thông báo — CometNotificationsListPaginationQuery"""
        variables = {
            "count": 10,
            "cursor": cursor,
            "environment": "MAIN_SURFACE",
            "filter_tokens": [],
            "notif_cache_ids": [],
            "notif_query_flags": ["IS_COMET", "INCLUDE_WA_P2B_NOTIFS", "HIDE_SEE_MORE_BUTTON"],
            "scale": 2,
        }
        return cls._call(account, "notifications", variables, proxy, "data", "Không đọc được thông báo")

    @classmethod
    def mark_notification_seen(cls, account, notif_id: str, query_id: str, proxy=None):
        """CometNotificationsUpdateSeenStateMutation"""
        variables = {
            "input": {
                "environment": "MAIN_SURFACE",
                "is_comet": True,
                "last_notif_sync_time": 0,
                "notif_ids": [notif_id],
                "query_id": query_id,
                "source": "unknown",
                "update_type": "MARK_READ",
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "environment": "MAIN_SURFACE",
        }
        return cls._call(account, "notifications_seen", variables, proxy, "data", "Đánh dấu đã đọc thông báo thất bại")

    @classmethod
    def view_stories(cls, account, proxy=None, cursor: Optional[str] = None):
        """Quét tray story — StoriesTrayRectangularQuery"""
        variables = {
            "blur": 10,
            "bucketsToFetch": 5,
            "cursor": cursor,
            "isFbNotesIncluded": False,
            "scale": 2,
            "trayType": None,
            "id": account.get("uid"),
            "__relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider": False,
            "__relay_internal__pv__StoriesShouldEnableVideoAutoplayrelayprovider": False,
        }
        res = cls._call(
            account, "stories_tray", variables, proxy,
            "data.node.unified_stories_buckets.edges",
            "Không quét được danh sách story (edges)",
        )
        if res.get("success"):
            buckets = []
            for edge in res["value"]:
                node = edge.get("node") or {}
                if _get(node, "story_bucket_owner.id") == account.get("uid"):
                    continue
                story_ids = []
                for n in (_get(node, "unified_stories.nodes") or []):
                    try:
                        story_ids.append(cls.unb64(n["id"]).split(":")[-1])
                    except Exception:
                        pass
                buckets.append({"bucketId": node.get("id"), "storyIds": story_ids})
            res["buckets"] = buckets
            res["message"] = f"Quét được {len(buckets)} bucket story"
        return res

    @classmethod
    def mark_story_seen(cls, account, bucket_id: str, story_id: str, proxy=None):
        """storiesUpdateSeenStateMutation"""
        variables = {
            "input": {
                "bucket_id": bucket_id,
                "story_id": cls.b64(f"S:_ISC:{story_id}"),
                "actor_id": account.get("uid"),
                "client_mutation_id": "1",
            },
            "scale": 2,
        }
        return cls._call(
            account, "stories_seen", variables, proxy,
            "data.direct_message_thread_update_seen_state.story.story_card_seen_state.is_seen_by_viewer",
            "Xem story thất bại (isSeenByViewer)",
        )

    @classmethod
    def reply_story(cls, account, story_id: str, reaction: str, proxy=None):
        """useStoriesSendReplyMutation — thả cảm xúc nhẹ vào story"""
        variables = {
            "input": {
                "attribution_id_v2": (
                    f"StoriesCometSuspenseRoot.react,comet.stories.viewer,via_cold_start,{cls.get_rticket()},558655,,,"
                ),
                "lightweight_reaction_actions": {"offsets": [0], "reaction": reaction},
                "message": reaction,
                "story_id": cls.b64(f"S:_ISC:{story_id}"),
                "story_reply_type": "LIGHT_WEIGHT",
                "actor_id": account.get("uid"),
                "client_mutation_id": "3",
            }
        }
        return cls._call(
            account, "stories_reply", variables, proxy,
            "data.direct_message_reply.story.story_card_info.story_card_reactions.edges.0.node.last5.edges.0.node.reaction",
            "Thả cảm xúc story thất bại",
        )

    @classmethod
    def scan_groups(cls, account, proxy=None, cursor: Optional[str] = None, ordering: str = "viewer_added"):
        """Nhóm đã tham gia — GroupsCometAllJoinedGroupsSectionPaginationQuery"""
        variables = {"count": 20, "cursor": cursor, "ordering": [ordering], "scale": 2}
        return cls._call(account, "scan_joined_groups", variables, proxy, "data", "Không quét được danh sách nhóm")

    @classmethod
    def scan_pending_groups(cls, account, proxy=None, cursor: Optional[str] = None, ordering: str = "viewer_added"):
        """GroupsCometPendingGroupJoinsSectionPaginationQuery — chú ý scale:1 như bản gốc"""
        variables = {"count": 20, "cursor": cursor, "ordering": [ordering], "scale": 1}
        return cls._call(account, "scan_pending_groups", variables, proxy, "data", "Không quét được nhóm chờ duyệt")

    @classmethod
    def scan_group_members(cls, account, group_id: str, proxy=None, cursor: Optional[str] = None):
        """GroupsCometMembersPageNewMembersSectionRefetchQuery"""
        variables = {
            "count": 10, "cursor": cursor, "groupID": group_id,
            "recruitingGroupFilterNonCompliant": False, "scale": 2, "id": group_id,
        }
        return cls._call(account, "scan_group_members", variables, proxy, "data", "Không quét được thành viên nhóm")

    @classmethod
    def get_collection_ids(cls, account, target_uid: Optional[str] = None, proxy=None) -> Dict[str, str]:
        """
        Bóc collection id của các tab profile từ HTML, đúng cách bản gốc làm:
        cutStringStartEnd(body, '{"tab_key":"<tab>","id":"', '"').
        Các id này là tham số `id` bắt buộc của AppCollection…PaginationQuery.
        """
        uid = target_uid or account.get("uid")
        headers = {
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "accept-language": "vi,fr-FR;q=0.9,fr;q=0.8,en-US;q=0.7,en;q=0.6",
            "upgrade-insecure-requests": "1",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            "user-agent": account.get("userAgent") or USER_AGENT_DESKTOP,
        }
        res = requests.get(
            f"https://www.facebook.com/{uid}",
            headers=headers,
            cookies=cls.parse_cookie_string(account.get("cookie", "")),
            proxies=cls._proxies(proxy),
            timeout=30,
            impersonate="chrome120",
        )
        if cls._is_login_response(res):
            raise FacebookError("Cookie Facebook đã hết hạn hoặc không còn phiên đăng nhập")
        body = res.text
        out = {}
        for tab in ("friends_all", "friends_mutual", "owner_reels", "followers", "following"):
            m = re.search(r'\{"tab_key":"%s","id":"([^"]+)"' % tab, body)
            out[tab] = m.group(1) if m else ""
        return out

    @classmethod
    def scan_friends(cls, account, target_uid: Optional[str] = None, proxy=None, cursor: Optional[str] = None,
                     collection_id: Optional[str] = None):
        """
        Bạn bè của chính mình dùng SelfFriendsListRenderer, của người khác dùng
        ListRenderer — hai doc_id khác nhau, đúng như bản gốc. Tham số `id` là
        collection id lấy từ HTML profile chứ không tự dựng được.
        """
        uid = target_uid or account.get("uid")
        is_self = str(uid) == str(account.get("uid"))
        if not collection_id:
            try:
                collection_id = cls.get_collection_ids(account, uid, proxy).get("friends_all")
            except Exception as exc:
                return {"success": False, "error": f"Không lấy được collection id danh sách bạn bè: {exc}"}
        if not collection_id:
            return {"success": False, "error": f"Không tìm thấy tab bạn bè của user {uid} (profile ẩn hoặc cookie hỏng)"}
        variables = {"count": 8, "cursor": cursor, "scale": 2, "search": None, "id": collection_id}
        return cls._call(
            account, "scan_self_friends" if is_self else "scan_user_friends",
            variables, proxy, "data.node.pageItems.edges", "Không quét được danh sách bạn bè",
        )

    @classmethod
    def scan_suggested_friends(cls, account, proxy=None, cursor: Optional[str] = None):
        """FriendingCometPYMKPanelPaginationQuery"""
        variables = {"count": 30, "cursor": cursor, "location": "FRIENDS_HOME_MAIN", "scale": 2}
        return cls._call(
            account, "scan_pymk", variables, proxy,
            "data.viewer.people_you_may_know.edges", "Không quét được gợi ý kết bạn",
        )

    @classmethod
    def scan_friend_requests(cls, account, proxy=None, cursor: Optional[str] = None):
        """FriendingCometFriendRequestsSectionPanelPaginationQuery"""
        return cls._call(
            account, "scan_friend_requests", {"count": 20, "cursor": cursor, "scale": 2}, proxy,
            "data.viewer.friending_possibilities.edges", "Không quét được lời mời kết bạn",
        )

    @classmethod
    def scan_outgoing_requests(cls, account, proxy=None, cursor: Optional[str] = None):
        """FriendingCometOutgoingRequestsDialogPaginationQuery"""
        return cls._call(
            account, "scan_outgoing_requests", {"count": 10, "cursor": cursor, "scale": 2}, proxy,
            "data", "Không quét được lời mời đã gửi",
        )

    @classmethod
    def scan_messenger_threads(cls, account, proxy=None, before: Optional[str] = None):
        """
        Quét danh sách hội thoại Messenger — batch query doc_id 5229768917103351
        qua /api/graphqlbatch/, đúng như bản gốc (MessengerGraphQLThreadlistFetcher).
        """
        try:
            cls.ensure_init_data(account, proxy)
            params = cls.build_params_fb_desktop(account)
            params["__hs"] = "19151.BP:bizweb_pkg.2.1.0.0."
            params["lsd"] = "8CFdgUvTVhp86lB8FRbd5c"
            params["batch_name"] = "MessengerGraphQLThreadlistFetcher"
            params["queries"] = json.dumps({
                "o0": {
                    "doc_id": "5229768917103351",
                    "query_params": {
                        "limit": 50, "before": before, "tags": ["INBOX"], "isWorkUser": False,
                        "includeDeliveryReceipts": True, "includeSeqID": False,
                        "is_work_teamwork_not_putting_muted_in_unreads": False,
                        "threadlistViewFieldsOnly": False, "source": "mercury",
                    },
                }
            }, separators=(",", ":"))
            res = requests.post(
                GRAPHQL_BATCH_URL,
                data=urllib.parse.urlencode(params, doseq=True),
                headers={
                    "content-type": "application/x-www-form-urlencoded",
                    "x-asbd-id": ASBD_ID,
                    "x-fb-friendly-name": "FriendingCometPYMKPanelPaginationQuery",
                    "x-fb-lsd": "8CFdgUvTVhp86lB8FRbd5c",
                    "user-agent": USER_AGENT_DESKTOP,
                },
                cookies=cls.parse_cookie_string(account.get("cookie", "")),
                proxies=cls._proxies(proxy),
                timeout=30,
                impersonate="chrome120",
            )
            data = cls._parse_fb_response(res.text)
        except FacebookError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as exc:
            return {"success": False, "error": f"Lỗi kết nối: {exc}"}

        nodes = _get(data, "o0.data.viewer.message_threads.nodes")
        if not nodes:
            return {"success": False, "error": cls._error_message(data, "Không quét được danh user nhắn tin (nodes)")}
        threads = []
        for n in nodes:
            if n.get("thread_type") != "ONE_TO_ONE":
                continue
            actor = _get(n, "all_participants.edges.0.node.messaging_actor") or {}
            threads.append({
                "userId": actor.get("id"),
                "name": actor.get("name"),
                "gender": actor.get("gender"),
                "timestampInbox": int(float(n.get("updated_time_precise", 0)) / 1000),
            })
        return {"success": True, "threads": threads, "message": f"Quét được {len(threads)} hội thoại"}

    # -------------------------------------------------- share / timeline

    @classmethod
    def get_link_preview(cls, account, url: str, proxy=None):
        """ComposerLinkAttachmentPreviewQuery — lấy share_scrape_data để chia sẻ bài viết."""
        variables = {
            "feedLocation": "FEED_COMPOSER",
            "focusCommentID": None,
            "goodwillCampaignId": "",
            "goodwillCampaignMediaIds": [],
            "goodwillContentType": None,
            "params": {"url": url},
            "privacySelectorRenderLocation": "COMET_COMPOSER",
            "renderLocation": "composer_preview",
            "parentStoryID": None,
            "scale": 2,
            "useDefaultActor": False,
            "shouldIncludeStoryAttachment": False,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
            "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": False,
            "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": False,
            "__relay_internal__pv__IsMergQAPollsrelayprovider": False,
            "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": True,
            "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": False,
        }
        res = cls._call(
            account, "link_preview", variables, proxy,
            "data.link_preview.share_scrape_data", "Lấy thông tin link thất bại",
        )
        if res.get("success"):
            raw = res["value"]
            try:
                parsed = json.loads(raw)
                res["share_type"] = parsed.get("share_type")
                params = parsed.get("share_params") or []
                res["scanned_id"] = str(params[0]) if params else None
            except Exception:
                return {"success": False, "error": "Không đọc được share_scrape_data"}
            res["share_scrape_data"] = raw
        return res

    @classmethod
    def share_post(cls, account, post_id: str, message: str = "", proxy=None, group_id: Optional[str] = None):
        """Chia sẻ bài viết — ComposerStoryCreateMutation (call site share)."""
        preview = cls.get_link_preview(account, f"https://www.facebook.com/{post_id}", proxy)
        if not preview.get("success"):
            return preview
        share_type = "group" if group_id else "feed_story"
        uid = account.get("uid")
        session = cls.uuidv4()
        text = cls.spin_text(message)
        surface = {
            "group": {
                "composer_entry_point": "inline_composer",
                "composer_source_surface": "group",
                "composer_type": "group",
                "idempotence_token": None,
                "audience": {"to_id": group_id},
                "feedLocation": "GROUP",
                "renderLocation": "group",
                "isGroup": True,
                "isFeed": False,
                "composed_text": {
                    "block_data": ["{}"], "block_depths": [0], "block_types": [0],
                    "blocks": [text], "entities": ["[]"], "entity_map": "{}", "inline_styles": ["[]"],
                },
                "feedbackSource": 0,
                "reels_ads": True,
                "ifu_hover": False,
            },
            "feed_story": {
                "composer_entry_point": "share_modal",
                "composer_source_surface": "feed_story",
                "composer_type": "share",
                "idempotence_token": f"{session}_FEED",
                "audience": {"privacy": {"allow": [], "base_state": "FRIENDS", "deny": [], "tag_expansion_state": "UNSPECIFIED"}},
                "feedLocation": "NEWSFEED",
                "renderLocation": "homepage_stream",
                "isGroup": False,
                "isFeed": True,
                "composed_text": None,
                "feedbackSource": 1,
                "reels_ads": False,
                "ifu_hover": True,
            },
        }[share_type]

        variables = {
            "input": {
                "composer_entry_point": surface["composer_entry_point"],
                "composer_source_surface": surface["composer_source_surface"],
                "composer_type": surface["composer_type"],
                "idempotence_token": surface["idempotence_token"],
                "source": "WWW",
                "text_format_preset_id": "0",
                "attachments": [{"link": {"share_scrape_data": json.dumps(
                    {"share_type": preview.get("share_type"), "share_params": [post_id]}, separators=(",", ":")
                )}}],
                "composed_text": surface["composed_text"],
                "reshare_original_post": "RESHARE_ORIGINAL_POST",
                "audience": surface["audience"],
                "is_tracking_encrypted": True,
                "tracking": [cls.generate_random_code(2222), None],
                "message": {"ranges": [], "text": text},
                "logging": {"composer_session_id": session},
                "navigation_data": {
                    "attribution_id_v2": f"CometHomeRoot.react,comet.home,logo,{cls.get_rticket()},561824,4748854339,,"
                },
                "event_share_metadata": {"surface": "newsfeed"},
                "actor_id": uid,
                "client_mutation_id": "1",
            },
            "feedLocation": surface["feedLocation"],
            "feedbackSource": surface["feedbackSource"],
            "focusCommentID": None,
            "gridMediaWidth": None,
            "groupID": None,
            "scale": 2,
            "privacySelectorRenderLocation": "COMET_STREAM",
            "checkPhotosToReelsUpsellEligibility": False,
            "renderLocation": surface["renderLocation"],
            "useDefaultActor": False,
            "inviteShortLinkKey": None,
            "isFeed": surface["isFeed"],
            "isFundraiser": False,
            "isFunFactPost": False,
            "isGroup": surface["isGroup"],
            "isEvent": False,
            "isTimeline": False,
            "isSocialLearning": False,
            "isPageNewsFeed": False,
            "isProfileReviews": False,
            "isWorkSharedDraft": False,
            "hashtag": None,
            "canUserManageOffers": False,
            "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": True,
            "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": False,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
            "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": False,
            "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": True,
            "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": False,
            "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": False,
            "__relay_internal__pv__IsMergQAPollsrelayprovider": False,
            "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": surface["reels_ads"],
            "__relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider": True,
            "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": surface["ifu_hover"],
            "__relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider": True,
        }
        check = (
            "data.story_create.group_feed_story_edge.node.post_id" if share_type == "group"
            else "data.story_create.feed_story_edge.node.post_id"
        )
        return cls._call(
            account, "share_post", variables, proxy, check,
            f"Chia sẻ bài viết {post_id} thất bại",
        )

    @classmethod
    def scan_timeline_posts(cls, account, target_uid: Optional[str] = None, proxy=None, cursor: Optional[str] = None):
        """Quét bài trên dòng thời gian — ProfileCometTimelineFeedRefetchQuery"""
        uid = target_uid or account.get("uid")
        variables = {
            "afterTime": None, "beforeTime": None, "count": 3, "cursor": cursor,
            "feedLocation": "TIMELINE", "feedbackSource": 0, "focusCommentID": None,
            "memorializedSplitTimeFilter": None, "omitPinnedPost": True, "postedBy": None,
            "privacy": None, "privacySelectorRenderLocation": "COMET_STREAM",
            "renderLocation": "timeline", "scale": 2, "stream_count": 1, "taggedInOnly": None,
            "trackingCode": None, "useDefaultActor": False, "id": uid,
            "__relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider": True,
            "__relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider": True,
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
            "__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider": True,
            "__relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider": False,
            "__relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider": False,
            "__relay_internal__pv__IsMergQAPollsrelayprovider": False,
            "__relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider": True,
            "__relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider": False,
            "__relay_internal__pv__CometUFIShareActionMigrationrelayprovider": True,
            "__relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider": False,
            "__relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider": True,
            "__relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider": False,
        }
        return cls._call(account, "timeline_feed", variables, proxy, "data", "Không quét được bài viết dòng thời gian")

    @classmethod
    def scan_recent_friends(cls, account, proxy=None, cursor: Optional[str] = None):
        """Bạn bè mới thêm gần đây — CometActivityLogStoriesListPaginationQuery (category friends)"""
        variables = {
            "audience": None, "category": "friends", "category_key": "friends",
            "count": 25, "cursor": cursor, "feedLocation": None, "media_content_filters": [],
            "month": None, "person_id": None, "privacy": "NONE", "scale": 2,
            "timeline_visibility": "ALL", "year": None, "id": account.get("uid"),
        }
        res = cls._call(
            account, "activity_log", variables, proxy,
            "data.node.activity_log_stories.edges",
            "Không quét được thông tin thời gian thêm bạn bè (edges)",
        )
        if res.get("success"):
            res["items"] = [
                {"postId": _get(e, "node.post_id"), "creationTime": _get(e, "node.creation_time")}
                for e in res["value"]
            ]
        return res

    @classmethod
    def scan_profile_collection(cls, account, tab: str, target_uid: Optional[str] = None, proxy=None, cursor: Optional[str] = None):
        """
        Followers / Following — cùng ProfileCometAppCollectionListRendererPaginationQuery
        với collection id của tab tương ứng lấy từ HTML profile.
        """
        uid = target_uid or account.get("uid")
        try:
            collection_id = cls.get_collection_ids(account, uid, proxy).get(tab)
        except Exception as exc:
            return {"success": False, "error": f"Không lấy được collection id tab '{tab}': {exc}"}
        if not collection_id:
            return {"success": False, "error": f"Không tìm thấy tab '{tab}' của user {uid}"}
        variables = {"count": 8, "cursor": cursor, "scale": 2, "search": None, "id": collection_id}
        return cls._call(
            account, "scan_user_friends", variables, proxy,
            "data.node.pageItems.edges", f"Không quét được danh sách '{tab}'",
        )

    @classmethod
    def get_profile_menu(cls, account, target_uid: Optional[str] = None, proxy=None):
        """
        ProfileCometRootLeftNavMenuQuery — trả id, tên và delegatePageId.
        Bản gốc dùng delegatePageId để thao tác dưới danh nghĩa fanpage.
        """
        uid = target_uid or account.get("uid")
        variables = {
            "scale": 2, "userID": uid,
            "__relay_internal__pv__ProfilePageImprovementsEnabledrelayprovider": True,
        }
        res = cls._call(
            account, "profile_menu", variables, proxy,
            "data.user.comet_profile_entity_menu.user", "Không lấy được thông tin trang cá nhân",
        )
        if res.get("success"):
            user = res["value"]
            res["profile"] = {
                "id": user.get("id"),
                "name": user.get("name"),
                "delegatePageId": _get(user, "delegate_page.id"),
            }
        return res

    @classmethod
    def as_page(cls, account, page_id: str, proxy=None) -> Dict[str, Any]:
        """
        Dựng bản sao account thao tác dưới danh nghĩa fanpage: bản gốc đổi `av`
        sang page id trong buildParamsFBDesktopByProfile, `__user` giữ nguyên user.
        """
        page = dict(account)
        page["_page_id"] = str(page_id)
        return page

    # ------------------------------------------------- interaction scanning

    @classmethod
    def scan_post_comments(cls, account, post_id: str, proxy=None, cursor: Optional[str] = None):
        """CommentsListComponentsPaginationQuery — người bình luận một bài viết."""
        variables = {
            "commentsAfterCount": -1,
            "commentsAfterCursor": cursor,
            "commentsBeforeCount": None,
            "commentsBeforeCursor": None,
            "commentsIntentToken": "RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1",
            "feedLocation": "DEDICATED_COMMENTING_SURFACE",
            "focusCommentID": None,
            "scale": 2,
            "useDefaultActor": False,
            "id": cls.b64(f"feedback:{post_id}"),
            "__relay_internal__pv__IsWorkUserrelayprovider": False,
        }
        return cls._call(
            account, "scan_comments", variables, proxy,
            "data.node.comment_rendering_instance_for_feed_location.comments.edges",
            f"Không quét được bình luận của bài viết {post_id}",
        )

    @classmethod
    def scan_post_reactions(cls, account, post_id: str, proxy=None, cursor: Optional[str] = None):
        """CometUFIReactionsDialogTabContentRefetchQuery — người thả cảm xúc một bài viết."""
        feedback = cls.b64(f"feedback:{post_id}")
        variables = {
            "count": 10, "cursor": cursor, "feedbackTargetID": feedback,
            "reactionID": None, "scale": 2, "id": feedback,
        }
        return cls._call(
            account, "scan_reactions", variables, proxy,
            "data.node.reactors.edges",
            f"Không quét được cảm xúc của bài viết {post_id}",
        )

    @classmethod
    def scan_friend_interaction(cls, account, post_id: str, proxy=None):
        """
        Tổng hợp người tương tác với một bài viết.
        Bản gốc không có một mutation riêng cho việc này — nó ghép hai truy vấn
        bình luận và cảm xúc ở trên, nên bản port dựng lại đúng như vậy.
        """
        if not post_id:
            return {"success": False, "error": "Quét tương tác cần ID bài viết"}
        people: Dict[str, Dict[str, Any]] = {}
        errors = []

        comments = cls.scan_post_comments(account, post_id, proxy)
        if comments.get("success"):
            for edge in comments["value"]:
                author = _get(edge, "node.author") or {}
                if author.get("id"):
                    entry = people.setdefault(author["id"], {"userId": author["id"], "name": author.get("name")})
                    entry["commented"] = True
        else:
            errors.append(comments.get("error"))

        reactions = cls.scan_post_reactions(account, post_id, proxy)
        if reactions.get("success"):
            for edge in reactions["value"]:
                node = edge.get("node") or {}
                if node.get("id"):
                    entry = people.setdefault(node["id"], {"userId": node["id"], "name": node.get("name")})
                    entry["reacted"] = True
        else:
            errors.append(reactions.get("error"))

        if not people:
            return {"success": False, "error": "; ".join(e for e in errors if e) or "Không có tương tác nào"}
        return {
            "success": True,
            "people": list(people.values()),
            "message": f"Quét được {len(people)} người tương tác với bài viết {post_id}",
        }

    # ------------------------------------------------------------ dispatcher

    @classmethod
    def execute_action(
        cls,
        account: Dict[str, Any],
        action_type: str,
        target: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        proxy: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Điều phối tác vụ. Không có nhánh nào trả thành công giả."""
        p = payload or {}
        act = (action_type or "").lower().replace("-", "_")
        tgt = target or ""

        try:
            # --- Nhóm
            if act in ("scan_groups", "groups_joined"):
                return cls.scan_groups(account, proxy)
            if act in ("scan_pending_groups", "groups_pending"):
                return cls.scan_pending_groups(account, proxy)
            if act in ("join_group", "auto_join_groups"):
                return cls.join_group(account, tgt, proxy)
            if act in ("out_group", "leave_group", "auto_out_groups"):
                return cls.leave_group(account, tgt, proxy)
            if act in ("invite_friend_group", "auto_invite_friend_group"):
                group_id = p.get("group_id") or tgt
                friend_ids = p.get("friend_ids") or []
                if not friend_ids and "|" in tgt:
                    group_id, raw_friend_ids = (part.strip() for part in tgt.split("|", 1))
                    friend_ids = [item.strip() for item in raw_friend_ids.split(",") if item.strip()]
                if not group_id or not friend_ids:
                    return {"success": False, "error": "Cần nhập đúng định dạng GROUP_ID|UID1,UID2"}
                return cls.invite_friend_group(account, group_id, friend_ids, proxy)
            if act == "scan_group_by_keyword":
                return cls.search_groups(account, p.get("keyword") or tgt, proxy)
            if act in ("scan_group_members", "group_members"):
                return cls.scan_group_members(account, tgt, proxy)
            if act in ("group_about", "scan_group_info"):
                return cls.get_group_about(account, tgt, proxy)
            if act in ("answer_group_questions",):
                return cls.answer_group_questions(account, tgt, p.get("answers") or [], proxy)

            # --- Tương tác bài viết
            if act in ("reaction_post", "auto_reaction", "reaction"):
                return cls.react_to_feedback(account, tgt, p.get("reaction") or p.get("reaction_type") or "Like", proxy)
            if act in ("reaction_comment", "auto_reaction_comment"):
                return cls.react_to_feedback(account, tgt, p.get("reaction") or "Like", proxy, is_comment=True)
            if act in ("comment_post", "auto_comment", "comment", "up_top_post", "auto_uptop_post"):
                msg = p.get("comment") or p.get("message")
                if not msg:
                    return {"success": False, "error": "Thiếu nội dung bình luận"}
                return cls.create_comment(account, tgt, msg, proxy, p.get("attachment_id"))
            if act in ("reply_comment", "auto_reply_comment"):
                msg = p.get("comment") or p.get("reply")
                post_id = tgt
                comment_id = p.get("comment_id")
                if not comment_id and "|" in tgt:
                    post_id, comment_id = (part.strip() for part in tgt.split("|", 1))
                if not msg or not comment_id:
                    return {"success": False, "error": "Trả lời bình luận cần định dạng POST_ID|COMMENT_ID và nội dung"}
                return cls.reply_comment(account, post_id, comment_id, msg, proxy, p.get("attachment_id"))
            if act in ("upload_post", "auto_post", "post"):
                msg = p.get("content") or p.get("message") or tgt
                if not msg:
                    return {"success": False, "error": "Thiếu nội dung bài viết"}
                return cls.create_post(account, msg, p.get("group_id") or tgt or None, proxy, p.get("attachments"))
            if act in ("delete_post", "auto_delete_post"):
                return cls.delete_post(account, tgt, proxy)
            if act in ("view_news_feed", "auto_view_news_feed", "newfeed"):
                return cls.view_news_feed(account, proxy)
            if act in ("view_notification", "auto_view_notification"):
                return cls.view_notifications(account, proxy)
            if act in ("view_stories_friends", "auto_view_stories_friends", "story"):
                return cls.view_stories(account, proxy)
            if act in ("view_videos", "auto_view_videos"):
                return cls.view_videos(account, proxy)
            if act in ("pokes_friend", "auto_poke_friends"):
                return cls.poke_friend(account, tgt, proxy)
            if act in ("review_fanpage_by_profile", "review_fanpage"):
                msg = p.get("content") or p.get("message")
                if not msg:
                    return {"success": False, "error": "Thiếu nội dung đánh giá fanpage"}
                return cls.review_fanpage(account, tgt, msg, proxy)

            # --- Bạn bè
            if act in ("add_friend", "auto_add_friends"):
                return cls.send_friend_request(account, tgt, proxy)
            if act in ("accept_friend", "auto_accept_friends"):
                return cls.confirm_friend_request(account, tgt, proxy)
            if act in ("refused_friends", "auto_refused_friends"):
                return cls.refuse_friend_request(account, tgt, proxy)
            if act in ("cancel_invited_friends", "auto_cancel_invited_friends"):
                return cls.cancel_friend_request(account, tgt, proxy)
            if act in ("unfollow_friends", "auto_unfollow_friends"):
                return cls.unfollow(account, tgt, proxy)
            if act in ("cancel_friend", "auto_cancel_friends"):
                return cls.unfriend(account, tgt, proxy)
            if act in ("set_best_friend", "set_best_friends"):
                return cls.set_best_friend(account, tgt, proxy, p.get("list_id"))
            if act in ("scan_friends", "my_friends"):
                return cls.scan_friends(account, tgt or None, proxy)
            if act in ("scan_suggested_friends", "suggested_friends"):
                return cls.scan_suggested_friends(account, proxy)
            if act in ("scan_friend_requests", "friend_requests"):
                return cls.scan_friend_requests(account, proxy)
            if act in ("scan_outgoing_requests", "invited_friends"):
                return cls.scan_outgoing_requests(account, proxy)
            if act in ("scan_messenger", "scan_inbox"):
                return cls.scan_messenger_threads(account, proxy)
            if act in ("send_inbox_friends", "send_inbox_by_fanpage", "messenger"):
                return {
                    "success": False,
                    "error": "Gửi tin nhắn Messenger cần điều khiển trình duyệt (bản gốc làm qua Puppeteer), "
                             "không thực hiện được bằng GraphQL. Dùng 'scan_messenger' để quét hội thoại.",
                }

            # --- Chia sẻ & dòng thời gian
            if act in ("share_post", "auto_share"):
                return cls.share_post(account, tgt, p.get("content") or p.get("message") or "", proxy, p.get("group_id"))
            if act in ("scan_post", "scan_timeline_posts"):
                return cls.scan_timeline_posts(account, tgt or None, proxy)
            if act in ("recently_added_friends",):
                return cls.scan_recent_friends(account, proxy)
            if act in ("friend_list", "scan_friend_list"):
                return cls.scan_friends(account, tgt or None, proxy)
            if act in ("suggest_friend_list", "scan_suggest_friend_list"):
                return cls.scan_suggested_friends(account, proxy)
            if act in ("friend_request_list",):
                return cls.scan_friend_requests(account, proxy)
            if act in ("sent_friend_requests",):
                return cls.scan_outgoing_requests(account, proxy)
            if act in ("followers_list",):
                return cls.scan_profile_collection(account, "followers", tgt or None, proxy)
            if act in ("following_list",):
                return cls.scan_profile_collection(account, "following", tgt or None, proxy)
            if act in ("scan_user_inbox",):
                return cls.scan_messenger_threads(account, proxy)
            if act in ("scan_friend_interaction",):
                return cls.scan_friend_interaction(account, tgt, proxy)
            if act in ("scan_comments", "post_comments"):
                return cls.scan_post_comments(account, tgt, proxy)
            if act in ("scan_reactions", "post_reactions"):
                return cls.scan_post_reactions(account, tgt, proxy)
            if act in ("profile_menu", "scan_profile"):
                return cls.get_profile_menu(account, tgt or None, proxy)

            # --- Biến thể chạy dưới danh nghĩa fanpage
            if act.endswith("_fanpage") and act not in (
                "like_fanpage", "auto_like_fanpage", "invite_friend_like_fanpage",
                "auto_invite_friend_like_fanpage", "unlock_fanpage", "reactivate_fanpage",
                "auto_unlock_fanpage", "scan_fanpage_of_account",
                "fanpage_blocked", "my_fanpage",
            ):
                target_parts = [part.strip() for part in tgt.split("|")] if tgt else []
                page_id = p.get("page_id") or (target_parts[0] if target_parts else "")
                if not page_id:
                    return {"success": False, "error": "Tác vụ Fanpage cần ID Page thực hiện ở đầu mỗi dòng"}
                base = act[: -len("_fanpage")]
                aliases = {
                    "post": "upload_post",
                    "reaction_post": "reaction_post",
                    "comment_post": "comment_post",
                    "reply_comment": "reply_comment",
                    "delete_post": "delete_post",
                    "scan_user_inbox": "scan_user_inbox",
                    "scan_groups": "scan_groups",
                    "join_group_by": "join_group",
                    "fanpage_blocked": "unlock_fanpage",
                    "review_fanpage_by": "review_fanpage",
                }
                inner = aliases.get(base)
                if not inner:
                    return {"success": False, "error": f"Tác vụ fanpage '{action_type}' chưa được hỗ trợ"}
                inner_payload = dict(p)
                inner_target = target_parts[1] if len(target_parts) > 1 else ""
                if act == "post_fanpage":
                    inner_target = ""
                elif act == "reply_comment_fanpage" and len(target_parts) > 2:
                    inner_payload["comment_id"] = target_parts[2]
                elif act not in ("scan_user_inbox_fanpage", "scan_groups_fanpage") and not inner_target:
                    return {"success": False, "error": "Thiếu ID mục tiêu sau ký tự |"}
                return cls.execute_action(cls.as_page(account, page_id), inner, inner_target, inner_payload, proxy)

            # --- Fanpage
            if act in ("my_fanpage", "scan_fanpage_of_account"):
                return cls.scan_fanpages(account, proxy)
            if act in ("like_fanpage", "auto_like_fanpage"):
                return cls.like_fanpage(account, tgt, proxy)
            if act in ("invite_friend_like_fanpage", "auto_invite_friend_like_fanpage"):
                page_id = p.get("page_id") or tgt
                friend_ids = p.get("friend_ids") or []
                if not friend_ids and "|" in tgt:
                    page_id, raw_friend_ids = (part.strip() for part in tgt.split("|", 1))
                    friend_ids = [item.strip() for item in raw_friend_ids.split(",") if item.strip()]
                if not page_id or not friend_ids:
                    return {"success": False, "error": "Cần nhập đúng định dạng PAGE_ID|UID1,UID2"}
                return cls.invite_friend_like_fanpage(account, page_id, friend_ids, proxy)
            if act in ("unlock_fanpage", "reactivate_fanpage", "auto_unlock_fanpage", "fanpage_blocked"):
                return cls.reactivate_fanpage(account, tgt, proxy)

            return {"success": False, "error": f"Tác vụ '{action_type}' chưa được hỗ trợ"}

        except FacebookError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as exc:
            return {"success": False, "error": f"Lỗi thực thi: {exc}"}
