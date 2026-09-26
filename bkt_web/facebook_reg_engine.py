"""
Facebook Registration Engine (BaoSamReg Web Port)
Ported from BaoSamReg (.NET 8 Playwright / SQLite / Mobile Automation)
Supports:
- Random Identity Generator (Vietnamese Name, Gender, Birthday, Strong Password, RFC 6238 TOTP 2FA)
- Mail Verification Providers (DongVanFb, 10minutemail, TempMail, Tmailor, TempMail100, TempMailIo, TemporaryMail, Random)
- Phone Verification Providers (FunOtp, Random Vietnamese carrier numbers)
- Facebook Registration Runner (Playwright Stealth, Mobile View m.facebook.com, Desktop, Antidetect GPM/OMO, xoay vòng server VPN)
- Multi-threaded execution pool with live logging and status callbacks
"""

import os
import re
import time
import json
import base64
import hmac
import struct
import hashlib
import random
import asyncio
import logging
from datetime import datetime, date
from typing import Dict, List, Any, Optional, Tuple, Callable
from pathlib import Path
import sqlite3
import httpx
import threading

try:
    from bkt_web.security import SecretStore
    from bkt_web.facebook_session import is_blocked_facebook_url, validate_session_cookies
    from bkt_web import vpn_manager
except ImportError:
    from security import SecretStore
    from facebook_session import is_blocked_facebook_url, validate_session_cookies
    import vpn_manager

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")

logger = logging.getLogger("facebook_reg_engine")

CHROME_PATH = os.environ.get(
    "TOKMATRIX_CHROME_PATH",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)

# -----------------------------------------------------------------------------
# 1. Random Identity Generator (Họ tên, Giới tính, Mật khẩu, 2FA, Ngày sinh)
# -----------------------------------------------------------------------------

VIETNAMESE_HO = [
    "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng",
    "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đào", "Đoàn", "Vương", "Trịnh",
    "Trương", "Đinh", "Lâm", "Phùng", "Mai", "Tô", "Hà", "Thái", "Bạch", "Tạ"
]

VIETNAMESE_DEM_NAM = ["Văn", "Hữu", "Đức", "Thành", "Quốc", "Minh", "Tuấn", "Hoàng", "Bảo", "Tiến", "Xuân", "Quang"]
VIETNAMESE_TEN_NAM = [
    "An", "Bình", "Cường", "Dũng", "Đạt", "Đức", "Hải", "Hiếu", "Huy", "Hùng",
    "Khánh", "Khoa", "Kiên", "Lâm", "Long", "Minh", "Nam", "Nghĩa", "Nhật", "Phong",
    "Phúc", "Quân", "Quang", "Sơn", "Tài", "Tâm", "Thắng", "Thịnh", "Tiến", "Toàn",
    "Trung", "Tú", "Tuấn", "Tùng", "Việt", "Vinh", "Vũ", "Thành", "Khôi", "Trọng"
]

VIETNAMESE_DEM_NU = ["Thị", "Ngọc", "Thị Mỹ", "Phương", "Thu", "Mai", "Hồng", "Khánh", "Như", "Diệu", "Ánh", "Thanh"]
VIETNAMESE_TEN_NU = [
    "Anh", "Ánh", "Bích", "Chi", "Cúc", "Diệp", "Dung", "Duyên", "Giang", "Hà",
    "Hân", "Hằng", "Hạnh", "Hiền", "Hoa", "Hoài", "Hương", "Huyền", "Khánh", "Lan",
    "Linh", "Loan", "Ly", "Mai", "My", "Nga", "Ngân", "Ngọc", "Nhi", "Nhung",
    "Phương", "Quỳnh", "Thảo", "Thu", "Thủy", "Trang", "Trâm", "Tuyết", "Uyên", "Yến"
]

VIETNAMESE_PHONE_PREFIXES = {
    "viettel": ["086", "096", "097", "098", "032", "033", "034", "035", "036", "037", "038", "039"],
    "mobifone": ["089", "090", "093", "070", "079", "077", "076", "078"],
    "vinaphone": ["088", "091", "094", "083", "084", "085", "081", "082"],
    "vietnamobile": ["092", "056", "058"],
    "gmobile": ["099", "059"]
}


ENGLISH_FIRST_MALE = [
    "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Charles",
    "Daniel", "Matthew", "Anthony", "Mark", "Donald", "Steven", "Paul", "Andrew", "Joshua", "Kenneth",
    "Kevin", "Brian", "George", "Edward", "Ronald", "Timothy", "Jason", "Jeffrey", "Ryan", "Jacob",
    "Gary", "Nicholas", "Eric", "Jonathan", "Stephen", "Larry", "Justin", "Scott", "Brandon", "Benjamin",
    "Samuel", "Gregory", "Alexander", "Frank", "Patrick", "Raymond", "Jack", "Dennis", "Jerry", "Tyler"
]
ENGLISH_FIRST_FEMALE = [
    "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Barbara", "Susan", "Jessica", "Sarah", "Karen",
    "Lisa", "Nancy", "Betty", "Margaret", "Sandra", "Ashley", "Kimberly", "Emily", "Donna", "Michelle",
    "Carol", "Amanda", "Dorothy", "Melissa", "Deborah", "Stephanie", "Rebecca", "Sharon", "Laura", "Cynthia",
    "Kathleen", "Amy", "Angela", "Shirley", "Anna", "Brenda", "Pamela", "Emma", "Nicole", "Helen",
    "Samantha", "Katherine", "Christine", "Debra", "Rachel", "Carolyn", "Janet", "Maria", "Heather", "Diane"
]
ENGLISH_LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
    "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
    "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
    "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Hill", "Flores", "Green",
    "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts", "Gomez"
]


class RandomFacebookIdentityGenerator:
    """Sinh dữ liệu danh tính ngẫu nhiên tương tự RandomFacebookIdentityGenerator trong BaoSamReg"""

    @staticmethod
    def random_gender() -> str:
        return random.choice(["Nam", "Nữ"])

    @staticmethod
    def random_fullname(gender: str = "Nam", include_middle_name: bool = True, is_western: bool = False) -> Dict[str, str]:
        if is_western:
            if gender in ["Nữ", "Female"]:
                fn = random.choice(ENGLISH_FIRST_FEMALE)
            else:
                fn = random.choice(ENGLISH_FIRST_MALE)
            ln = random.choice(ENGLISH_LAST_NAMES)
            return {
                "fullname": f"{fn} {ln}",
                "firstname": fn,
                "lastname": ln,
                "gender": gender
            }

        ho = random.choice(VIETNAMESE_HO)
        if gender == "Nữ":
            dem = random.choice(VIETNAMESE_DEM_NU) if include_middle_name else ""
            ten = random.choice(VIETNAMESE_TEN_NU)
        else:
            dem = random.choice(VIETNAMESE_DEM_NAM) if include_middle_name else ""
            ten = random.choice(VIETNAMESE_TEN_NAM)

        if dem:
            full = f"{ho} {dem} {ten}"
            firstname = ten
            lastname = f"{ho} {dem}"
        else:
            full = f"{ho} {ten}"
            firstname = ten
            lastname = ho

        return {
            "fullname": full,
            "firstname": firstname,
            "lastname": lastname,
            "gender": gender
        }

    @staticmethod
    def random_password(
        min_len: int = 10,
        max_len: int = 14,
        include_upper: bool = True,
        include_lower: bool = True,
        include_digits: bool = True,
        include_special: bool = True
    ) -> str:
        chars = ""
        required = []
        if include_lower:
            chars += "abcdefghjkmnpqrstuvwxyz"
            required.append(random.choice("abcdefghjkmnpqrstuvwxyz"))
        if include_upper:
            chars += "ABCDEFGHJKLMNPQRSTUVWXYZ"
            required.append(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ"))
        if include_digits:
            chars += "23456789"
            required.append(random.choice("23456789"))
        if include_special:
            chars += "@#$%&*!"
            required.append(random.choice("@#$%&*!"))

        if not chars:
            chars = "abcdefghijklmnopqrstuvwxyz1234567890"

        length = random.randint(min_len, max_len)
        remaining = length - len(required)
        pwd_list = required + [random.choice(chars) for _ in range(max(0, remaining))]
        random.shuffle(pwd_list)
        return "".join(pwd_list)

    @staticmethod
    def random_birthday(min_age: int = 18, max_age: int = 40) -> Dict[str, Any]:
        year = datetime.now().year - random.randint(min_age, max_age)
        month = random.randint(1, 12)
        if month in [1, 3, 5, 7, 8, 10, 12]:
            day = random.randint(1, 31)
        elif month == 2:
            day = random.randint(1, 28)
        else:
            day = random.randint(1, 30)
        return {
            "day": str(day),
            "month": str(month),
            "year": str(year),
            "iso": f"{year:04d}-{month:02d}-{day:02d}"
        }

    @staticmethod
    def generate_2fa_secret() -> str:
        """Sinh mã 2FA Base32 16 hoặc 32 ký tự"""
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        return "".join(random.choice(alphabet) for _ in range(32))

    @staticmethod
    def get_totp_code(secret: str) -> str:
        """Tạo mã 6 số TOTP RFC 6238 từ secret Base32 (Pure Python)"""
        try:
            cleaned = secret.replace(" ", "").upper()
            missing_padding = len(cleaned) % 8
            if missing_padding != 0:
                cleaned += "=" * (8 - missing_padding)
            key = base64.b32decode(cleaned, casefold=True)
            counter = int(time.time() // 30)
            msg = struct.pack(">Q", counter)
            h = hmac.new(key, msg, hashlib.sha1).digest()
            offset = h[-1] & 0x0F
            code = (struct.unpack(">I", h[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000
            return f"{code:06d}"
        except Exception:
            return "000000"

    @staticmethod
    def random_vietnamese_phone(carriers: Optional[List[str]] = None) -> str:
        if not carriers:
            carriers = ["viettel", "mobifone", "vinaphone"]
        carrier = random.choice(carriers)
        prefix = random.choice(VIETNAMESE_PHONE_PREFIXES.get(carrier, ["098"]))
        suffix = "".join([str(random.randint(0, 9)) for _ in range(7)])
        return f"{prefix}{suffix}"

    @staticmethod
    def random_email_from_name(fullname: str, domain: str = "gmail.com") -> str:
        # Convert Vietnamese accents to ASCII
        s = fullname.lower()
        substitutions = {
            "à": "a", "á": "a", "ả": "a", "ã": "a", "ạ": "a",
            "ă": "a", "ằ": "a", "ắ": "a", "ẳ": "a", "ẵ": "a", "ặ": "a",
            "â": "a", "ầ": "a", "ấ": "a", "ẩ": "a", "ẫ": "a", "ậ": "a",
            "đ": "d",
            "è": "e", "é": "e", "ẻ": "e", "ẽ": "e", "ẹ": "e",
            "ê": "e", "ề": "e", "ế": "e", "ể": "e", "ễ": "e", "ệ": "e",
            "ì": "i", "í": "i", "ỉ": "i", "ĩ": "i", "ị": "i",
            "ò": "o", "ó": "o", "ỏ": "o", "õ": "o", "ọ": "o",
            "ô": "o", "ồ": "o", "ố": "o", "ổ": "o", "ỗ": "o", "ộ": "o",
            "ơ": "o", "ờ": "o", "ớ": "o", "ở": "o", "ỡ": "o", "ợ": "o",
            "ù": "u", "ú": "u", "ủ": "u", "ũ": "u", "ụ": "u",
            "ư": "u", "ừ": "u", "ứ": "u", "ử": "u", "ữ": "u", "ự": "u",
            "ỳ": "y", "ý": "y", "ỷ": "y", "ỹ": "y", "ỵ": "y"
        }
        for k, v in substitutions.items():
            s = s.replace(k, v)
        words = [re.sub(r'[^a-z0-9]', '', w) for w in s.split() if w]
        user_part = "".join(words) + str(random.randint(100, 9999))
        return f"{user_part}@{domain}"


# -----------------------------------------------------------------------------
# 2. Mail & Phone Verification Clients (DongVanFb, FunOtp, Tempmail...)
# -----------------------------------------------------------------------------

DONGVAN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

DONGVAN_CODE_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    "Origin": "https://dongvanfb.net",
    "Pragma": "no-cache",
    "Referer": "https://dongvanfb.net/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
}


class DongVanFbClient:
    """Kết nối API dongvanfb.net và tools.dongvanfb.net lấy mail Hotmail/Outlook & đọc mã xác nhận FB"""

    def __init__(self, api_key: str, folder_id: str = "1"):
        self.api_key = (api_key or "").strip()
        self.folder_id = (folder_id or "").strip() or "1"
        self.buy_url = "https://api.dongvanfb.net/user/buy"
        self.balance_url = "https://api.dongvanfb.net/user/balance"
        self.account_type_url = "https://api.dongvanfb.net/user/account_type"
        self.code_graph_url = "https://tools.dongvanfb.net/api/graph_code"
        self.code_oauth_url = "https://tools.dongvanfb.net/api/get_code_oauth2"

    async def check_balance(self) -> Dict[str, Any]:
        if not self.api_key or self.api_key.lower() in ["test", "test_dv_key_123"]:
            return {
                "success": False,
                "message": "Chưa nhập API Key DongVanFb hợp lệ. Vui lòng nhập API Key từ dongvanfb.net hoặc chuyển sang cổng 10MinuteMail."
            }
        async with httpx.AsyncClient(headers=DONGVAN_HEADERS, timeout=15.0) as client:
            try:
                res = await client.get(f"{self.balance_url}?apikey={self.api_key}")
                data = res.json()
                if data.get("error_code") == 404 or "account not found" in str(data.get("message", "")).lower():
                    return {
                        "success": False,
                        "message": "API Key DongVanFb không tồn tại hoặc chưa đăng ký tài khoản trên dongvanfb.net ('Account not found!').",
                        "raw": data
                    }
                return {"success": True, "balance": data.get("balance", 0), "raw": data}
            except Exception as e:
                return {"success": False, "message": f"Không kiểm tra được số dư dongvanfb.net: {e}"}

    async def get_account_types(self) -> Dict[str, Any]:
        """Tra cứu danh sách các gói mail và số lượng tồn kho còn lại trên dongvanfb.net"""
        if not self.api_key or self.api_key.lower() in ["test", "test_dv_key_123"]:
            return {
                "success": False,
                "message": "Chưa có API Key DongVanFb. Hãy nhập API Key của bạn để tải danh sách loại mail."
            }
        async with httpx.AsyncClient(headers=DONGVAN_HEADERS, timeout=15.0) as client:
            try:
                res = await client.get(f"{self.account_type_url}?apikey={self.api_key}")
                data = res.json()
                if data.get("error_code") == 404 or "account not found" in str(data.get("message", "")).lower():
                    return {
                        "success": False,
                        "message": "API Key DongVanFb không tồn tại hoặc chưa đăng ký tài khoản trên dongvanfb.net ('Account not found!').",
                        "raw": data
                    }
                types_list = data.get("list_data") or data.get("data") or []
                return {"success": True, "types": types_list, "raw": data}
            except Exception as e:
                return {"success": False, "message": f"Lỗi lấy danh sách loại mail dongvanfb.net: {e}"}

    async def get_new_mail(self) -> Dict[str, Any]:
        if not self.api_key or self.api_key.lower() in ["test", "test_dv_key_123"]:
            return {
                "success": False,
                "message": "Chưa cấu hình API Key DongVanFb hợp lệ. Vui lòng vào tab '📧 Cài Đặt Verify Mail' nhập API Key của bạn, hoặc đổi sang cổng '10MinuteMail' (miễn phí) để chạy ngay."
            }
        async with httpx.AsyncClient(headers=DONGVAN_HEADERS, timeout=25.0) as client:
            try:
                url = f"{self.buy_url}?apikey={self.api_key}&account_type={self.folder_id}&quality=1&type=full"
                res = await client.get(url)
                data = res.json()

                # Phân tích các mã lỗi phổ biến từ dongvanfb.net
                if data.get("error_code") == 404 or "account not found" in str(data.get("message", "")).lower():
                    return {
                        "success": False,
                        "message": "API Key DongVanFb không tồn tại hoặc tài khoản chưa đăng ký trên dongvanfb.net ('Account not found!'). Hãy vào tab '📧 Cài Đặt Verify Mail' nhập API Key thật & nạp tiền, hoặc chọn cổng '10MinuteMail' (miễn phí 100%)."
                    }
                if data.get("error_code") == 400 or "hết hàng" in str(data.get("message", "")).lower() or "out of stock" in str(data.get("message", "")).lower():
                    return {
                        "success": False,
                        "message": f"Loại mail ID {self.folder_id} trên DongVanFb đang tạm hết hàng hoặc số dư tài khoản không đủ. Vui lòng chọn loại mail khác hoặc nạp tiền."
                    }

                list_data = data.get("list_data") or []
                if not list_data:
                    raw_err = data.get("message") or str(data)
                    return {"success": False, "message": f"DongVanFb từ chối mua mail: {raw_err}"}

                raw_line = list_data[0]
                parts = raw_line.split("|")
                if len(parts) >= 4:
                    email, password, refresh_token, client_id = parts[0], parts[1], parts[2], parts[3]
                elif len(parts) >= 2:
                    email, password = parts[0], parts[1]
                    refresh_token, client_id = "", ""
                else:
                    return {"success": False, "message": f"Dữ liệu mail dongvanfb.net không đúng định dạng: {raw_line}"}

                return {
                    "success": True,
                    "email": email.strip(),
                    "password": password.strip(),
                    "refresh_token": refresh_token.strip(),
                    "client_id": client_id.strip(),
                    "raw": raw_line
                }
            except Exception as e:
                return {"success": False, "message": f"Lỗi kết nối API dongvanfb.net: {e}"}

    async def try_get_otp(self, email_info: Dict[str, Any], max_attempts: int = 15, delay_sec: int = 5) -> Dict[str, Any]:
        email = email_info.get("email", "")
        refresh_token = email_info.get("refresh_token", "")
        client_id = email_info.get("client_id", "")
        pass_mail = email_info.get("pass_mail") or email_info.get("password") or ""

        async with httpx.AsyncClient(headers=DONGVAN_CODE_HEADERS, timeout=20.0) as client:
            for attempt in range(max_attempts):
                try:
                    if refresh_token and client_id:
                        payload = {
                            "email": email,
                            "pass": pass_mail,
                            "refresh_token": refresh_token,
                            "client_id": client_id,
                            "type": ""
                        }
                        res = await client.post(self.code_oauth_url, json=payload)
                        if res.status_code == 200:
                            data = res.json()
                            code = data.get("code") or ""
                            if code and re.search(r'\b\d{5,8}\b', str(code)):
                                m = re.search(r'\b\d{5,8}\b', str(code))
                                return {
                                    "success": True,
                                    "otp": m.group(0),
                                    "subject": data.get("content", ""),
                                    "from": data.get("from", ""),
                                    "attempt": attempt + 1
                                }

                    g_res = await client.get(f"{self.code_graph_url}?email={email}&type=facebook", headers=DONGVAN_HEADERS)
                    if g_res.status_code == 200:
                        text = g_res.text
                        m = re.search(r'\b\d{5,8}\b', text)
                        if m:
                            return {"success": True, "otp": m.group(0), "attempt": attempt + 1}
                except Exception:
                    pass

                await asyncio.sleep(delay_sec)

        return {"success": False, "message": f"Không đọc được mã xác nhận từ dongvanfb.net sau {max_attempts} lần thử."}


class FunOtpClient:
    """Kết nối API funotp.com lấy số điện thoại và đọc mã OTP xác minh Facebook"""

    def __init__(self, api_key: str, service: str = "facebook", country: str = "vn"):
        self.api_key = api_key.strip()
        self.service = service.strip() or "facebook"
        self.country = country.strip() or "vn"
        self.base_url = "https://funotp.com/api"

    async def get_new_phone(self) -> Dict[str, Any]:
        if not self.api_key:
            return {"success": False, "message": "Chưa nhập API Key cho funotp.com"}
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                url = f"{self.base_url}?action=number&service={self.service}&apikey={self.api_key}&country={self.country}"
                res = await client.get(url)
                data = res.json()
                data_obj = data.get("data") or {}
                order_id = data_obj.get("id") or data.get("id")
                number = data_obj.get("number") or data.get("number") or data.get("phone")
                if not number:
                    return {"success": False, "message": f"funotp.com không trả về số điện thoại: {data}"}
                return {"success": True, "phone": str(number).strip(), "id": str(order_id)}
            except Exception as e:
                return {"success": False, "message": f"Lỗi gọi API funotp.com: {e}"}

    async def try_get_otp(self, order_id: str, max_attempts: int = 15, delay_sec: int = 5) -> Dict[str, Any]:
        if not order_id:
            return {"success": False, "message": "Thiếu mã đơn hàng FunOtp"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            for attempt in range(max_attempts):
                try:
                    url = f"{self.base_url}?action=code&id={order_id}&apikey={self.api_key}"
                    res = await client.get(url)
                    data = res.json()
                    data_obj = data.get("data") or {}
                    code = data_obj.get("code") or data.get("code") or data.get("sms")
                    if code:
                        m = re.search(r'\b\d{5,8}\b', str(code))
                        if m:
                            return {"success": True, "otp": m.group(0), "attempt": attempt + 1}
                except Exception:
                    pass
                await asyncio.sleep(delay_sec)
        return {"success": False, "message": f"Không nhận được OTP từ funotp.com sau {max_attempts} lần thử"}


class TenMinuteMailClient:
    """Scraper cho 10minutemail.net"""

    async def get_new_mail(self) -> Dict[str, Any]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
        async with httpx.AsyncClient(headers=headers, timeout=25.0, follow_redirects=True) as client:
            try:
                res = await client.get("https://10minutemail.net/?lang=en")
                cookies = dict(res.cookies)
                m = re.search(r'id="fe_text"[^>]*value="([^"]*)"', res.text)
                if m:
                    email = m.group(1).strip()
                    return {"success": True, "email": email, "cookies": cookies}
                return {"success": False, "message": "Không đọc được địa chỉ mail từ 10minutemail.net"}
            except Exception as e:
                return {"success": False, "message": f"Lỗi kết nối 10minutemail.net: {e}"}

    async def try_get_otp(self, mail_data: Dict[str, Any], max_attempts: int = 15, delay_sec: int = 5) -> Dict[str, Any]:
        cookies = mail_data.get("cookies", {})
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Referer": "https://10minutemail.net/?lang=en"
        }
        async with httpx.AsyncClient(headers=headers, cookies=cookies, timeout=20.0, follow_redirects=True) as client:
            for attempt in range(max_attempts):
                try:
                    res = await client.get("https://10minutemail.net/?lang=en")
                    m = re.search(r'readmail\.html\?mid=([a-zA-Z0-9_-]+)', res.text)
                    if m:
                        mid = m.group(1)
                        read_res = await client.get(f"https://10minutemail.net/readmail.html?mid={mid}")
                        content = read_res.text
                        otp_match = re.search(r'\b\d{5,8}\b', content)
                        if otp_match:
                            return {"success": True, "otp": otp_match.group(0), "attempt": attempt + 1}
                except Exception:
                    pass
                await asyncio.sleep(delay_sec)
        return {"success": False, "message": "Không nhận được mã xác nhận từ 10minutemail.net"}


class MicrosoftImapOAuth2Client:
    """
    Kết nối Microsoft OAuth2 + IMAP4_SSL XOAUTH2 đọc thư và trích xuất mã OTP
    từ kho Hotmail/Outlook mà không cần nạp tiền bên thứ 3.
    """

    def __init__(
        self,
        email: str,
        refresh_token: str,
        client_id: str = "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
        pass_mail: str = "",
        on_token_refresh: Optional[Callable[[str, str], None]] = None
    ):
        self.email = email.strip()
        self.refresh_token = refresh_token.strip()
        self.client_id = client_id.strip() or "9e5f94bc-e8a4-4e73-b8be-63364c29d753"
        self.pass_mail = pass_mail.strip()
        self.on_token_refresh = on_token_refresh
        self._cached_access_token = ""
        self._token_expires_at = 0

    async def get_access_token(self) -> Optional[str]:
        now = time.time()
        if self._cached_access_token and now < self._token_expires_at:
            return self._cached_access_token

        token_url = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
        data = {
            "client_id": self.client_id,
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.post(token_url, data=data)
                if res.status_code == 200:
                    data_obj = res.json()
                    new_rf = data_obj.get("refresh_token")
                    if new_rf and new_rf != self.refresh_token:
                        self.refresh_token = new_rf
                        if self.on_token_refresh:
                            try:
                                self.on_token_refresh(self.email, new_rf)
                            except Exception:
                                pass
                    acc_token = data_obj.get("access_token")
                    if acc_token:
                        self._cached_access_token = acc_token
                        self._token_expires_at = now + int(data_obj.get("expires_in", 3500)) - 60
                        return acc_token
            except Exception:
                pass
        return None

    def _sync_read_imap(self, access_token: str) -> List[Dict[str, Any]]:
        import imaplib, email
        from email.header import decode_header

        def decode_mime(val):
            if not val:
                return ""
            try:
                parts = decode_header(val)
                res = []
                for text, enc in parts:
                    if isinstance(text, bytes):
                        res.append(text.decode(enc or 'utf-8', errors='ignore'))
                    else:
                        res.append(str(text))
                return "".join(res)
            except Exception:
                return str(val)

        messages = []
        try:
            auth_str = f"user={self.email}\x01auth=Bearer {access_token}\x01\x01"
            mail = imaplib.IMAP4_SSL("outlook.office365.com", 993, timeout=12)
            mail.authenticate("XOAUTH2", lambda x: auth_str.encode("utf-8"))
            for folder in ["INBOX", "Junk"]:
                try:
                    mail.select(folder)
                    typ, data = mail.search(None, "ALL")
                    if data and data[0]:
                        ids = data[0].split()
                        # Lấy 10 thư mới nhất trong thư mục
                        for msg_id in reversed(ids[-10:]):
                            try:
                                typ, mdata = mail.fetch(msg_id, "(RFC822)")
                                if mdata and mdata[0] and len(mdata[0]) > 1:
                                    import email.utils
                                    msg = email.message_from_bytes(mdata[0][1])
                                    subj = decode_mime(msg.get("Subject", ""))
                                    frm = decode_mime(msg.get("From", ""))
                                    date_str = msg.get("Date", "")
                                    msg_timestamp = 0
                                    if date_str:
                                        try:
                                            dt = email.utils.parsedate_to_datetime(date_str)
                                            msg_timestamp = int(dt.timestamp())
                                        except Exception:
                                            pass

                                    body = ""
                                    if msg.is_multipart():
                                        for part in msg.walk():
                                            if part.get_content_type() in ["text/plain", "text/html"]:
                                                payload = part.get_payload(decode=True)
                                                if payload:
                                                    body += payload.decode("utf-8", errors="ignore")
                                    else:
                                        payload = msg.get_payload(decode=True)
                                        if payload:
                                            body = payload.decode("utf-8", errors="ignore")

                                    messages.append({
                                        "id": msg_id.decode(),
                                        "from": frm,
                                        "subject": subj,
                                        "body": body[:800],
                                        "timestamp": msg_timestamp
                                    })
                            except Exception:
                                pass
                except Exception:
                    pass
            try:
                mail.close()
                mail.logout()
            except Exception:
                pass
        except Exception:
            pass
        return messages

    async def try_get_otp_fast_api(self, filter_type: str = "facebook") -> Optional[Dict[str, Any]]:
        """
        Gọi endpoint https://tools.dongvanfb.net/api/get_code_oauth2 (như trong quy_manager.html / api/get-code-oauth2.js)
        để lấy mã OTP cực nhanh (2-4s) qua server proxy chuyên dụng.
        """
        if not self.refresh_token or not self.client_id:
            return None
        payload = {
            "email": self.email,
            "pass": self.pass_mail,
            "refresh_token": self.refresh_token,
            "client_id": self.client_id,
            "type": ""
        }
        try:
            async with httpx.AsyncClient(headers=DONGVAN_CODE_HEADERS, timeout=12.0) as client:
                res = await client.post("https://tools.dongvanfb.net/api/get_code_oauth2", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    if data.get("status") and data.get("code"):
                        code = str(data.get("code")).strip()
                        frm = str(data.get("from", "")).lower()
                        content = str(data.get("content", "")).lower()

                        # Kiểm tra xem mã có thuộc đúng nền tảng không
                        if filter_type == "facebook":
                            if not any(k in frm or k in content for k in ["facebook", "fb", "registration@facebookmail.com"]):
                                return None
                        elif filter_type == "tiktok":
                            if not any(k in frm or k in content for k in ["tiktok", "bytedance"]):
                                return None

                        m = re.search(r'\b\d{5,8}\b', code)
                        if m:
                            return {
                                "success": True,
                                "otp": m.group(0),
                                "subject": data.get("content", ""),
                                "from": data.get("from", ""),
                                "method": "dongvan_get_code_oauth2"
                            }
        except Exception:
            pass
        return None

    async def try_get_otp(
        self,
        filter_type: str = "facebook",
        min_timestamp: int = 0,
        max_attempts: int = 10,
        delay_sec: int = 4,
        on_attempt: Optional[Callable[[int, int], None]] = None
    ) -> Dict[str, Any]:
        """
        Đọc mã OTP xác minh kết hợp:
        1. Thử lấy nhanh tức thì qua get_code_oauth2 (quy-tool)
        2. Tự động fallback sang Direct IMAP XOAUTH2 quét hộp thư INBOX và Junk
        """
        loop = asyncio.get_running_loop()
        for attempt in range(max_attempts):
            if on_attempt:
                try:
                    on_attempt(attempt + 1, max_attempts)
                except Exception:
                    pass

            # 1. Thử qua get_code_oauth2 (quy-tool fast API) trước tiên
            fast_res = await self.try_get_otp_fast_api(filter_type=filter_type)
            if fast_res:
                fast_res["attempt"] = attempt + 1
                return fast_res

            # 2. Fallback sang Direct IMAP XOAUTH2
            token = await self.get_access_token()
            if token:
                messages = await loop.run_in_executor(None, self._sync_read_imap, token)
                for m in messages:
                    frm = m.get("from", "").lower()
                    subj = m.get("subject", "").lower()
                    msg_ts = m.get("timestamp", 0)

                    # Bỏ qua thư cũ nếu có min_timestamp
                    if min_timestamp > 0 and msg_ts > 0 and msg_ts < (min_timestamp - 60):
                        continue

                    # Kiểm tra người gửi theo dịch vụ
                    is_valid_sender = True
                    if filter_type == "facebook":
                        is_valid_sender = (
                            any(k in frm for k in ["facebook", "fb.com", "facebookmail"])
                            or any(k in subj for k in ["facebook", "fb-", "mã xác nhận facebook"])
                        )
                    elif filter_type == "tiktok":
                        is_valid_sender = any(k in frm for k in ["tiktok", "bytedance"]) or "tiktok" in subj

                    if not is_valid_sender:
                        continue

                    combined = f"{m.get('subject', '')} {m.get('body', '')}"
                    # Ưu tiên regex mã Facebook
                    fb_m = re.search(r'(?:FB-|code\s+is\s+|mã\s+là\s+|mã:\s*|xác nhận:\s*)(\d{5,6})\b', combined, re.IGNORECASE)
                    if fb_m:
                        return {
                            "success": True,
                            "otp": fb_m.group(1),
                            "subject": m.get("subject", ""),
                            "from": m.get("from", ""),
                            "attempt": attempt + 1,
                            "method": "imap_xoauth2"
                        }

                    # Fallback tìm 5-8 chữ số nếu người gửi đúng là Facebook
                    codes = re.findall(r'\b\d{5,8}\b', combined)
                    if codes:
                        return {
                            "success": True,
                            "otp": codes[0],
                            "subject": m.get("subject", ""),
                            "from": m.get("from", ""),
                            "attempt": attempt + 1,
                            "method": "imap_xoauth2"
                        }
            await asyncio.sleep(delay_sec)

        return {"success": False, "message": f"Không nhận được mã xác nhận {filter_type.upper()} từ {self.email} sau {max_attempts} lần thử."}


STORE_EMAIL_LOCK = threading.Lock()


def get_next_available_store_email() -> Optional[Dict[str, Any]]:
    """Lấy tài khoản email tiếp theo sẵn sàng trong kho fb_email_store (thread-safe, luân phiên)"""
    try:
        with STORE_EMAIL_LOCK:
            with sqlite3.connect(DB_PATH, timeout=30.0) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id, email, pass_mail, refresh_token, client_id, source
                    FROM fb_email_store
                    WHERE status = 'Ready'
                    ORDER BY last_used_at ASC, id ASC LIMIT 1
                """)
                row = cursor.fetchone()
                if row:
                    em_id, email, enc_pass, enc_token, client_id, source = row
                    try:
                        pass_mail = SECRET_STORE.decrypt(enc_pass)
                    except Exception:
                        pass_mail = enc_pass
                    try:
                        refresh_token = SECRET_STORE.decrypt(enc_token)
                    except Exception:
                        refresh_token = enc_token

                    cursor.execute("UPDATE fb_email_store SET status = 'In-Use', last_used_at = ? WHERE id = ?", (int(time.time()), em_id))
                    conn.commit()
                    return {
                        "id": em_id,
                        "email": email,
                        "pass_mail": pass_mail,
                        "refresh_token": refresh_token,
                        "client_id": client_id,
                        "source": source
                    }
    except Exception as e:
        logger.error(f"Lỗi lấy email từ kho fb_email_store: {e}")
    return None


def update_store_email_status(email: str, status: str, used_for: str = ""):
    """Cập nhật trạng thái email trong kho sau khi reg"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE fb_email_store
                SET status = ?, used_for = ?, last_used_at = ?
                WHERE email = ?
            """, (status, used_for, int(time.time()), email.lower().strip()))
            conn.commit()
    except Exception as e:
        logger.error(f"Lỗi cập nhật trạng thái store email: {e}")


def update_store_email_token(email: str, new_refresh_token: str):
    """Cập nhật refresh token mới khi Microsoft xoay vòng token"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE fb_email_store
                SET refresh_token = ?
                WHERE email = ?
            """, (SECRET_STORE.encrypt(new_refresh_token), email.lower().strip()))
            conn.commit()
    except Exception as e:
        logger.error(f"Lỗi cập nhật refresh token store email: {e}")


# -----------------------------------------------------------------------------
# 3. Facebook Registration Runner (Playwright & Mobile View Automation)
# -----------------------------------------------------------------------------

class FacebookRegistrationRunner:
    """
    Điều khiển tiến trình đăng ký tài khoản Facebook tự động
    Hỗ trợ:
    - Kịch bản:
      + 'Reg FB and Verify': Web view đầy đủ với xác minh OTP
      + 'Reg FB novery': Đăng ký nhanh không chờ OTP
      + 'Reg FB and Verify (M)': Mobile view m.facebook.com kèm xác minh OTP
      + 'Reg FB novery (M)': Mobile view không xác minh
      + 'Verify Nick Novery': Kích hoạt tài khoản chưa verify
      + 'Đăng nhập & Giữ phiên': Login và lấy cookie/token
    """

    def __init__(
        self,
        script_name: str = "Reg FB and Verify (M)",
        browser_mode: str = "chrome_stealth",
        mail_provider: str = "DongVanFb",
        mail_config: Optional[Dict[str, Any]] = None,
        phone_provider: str = "FunOtp",
        phone_config: Optional[Dict[str, Any]] = None,
        proxy: str = "",
        vpn_mode: str = "none",
        headless: bool = True,
        on_log: Optional[Callable[[str, str], None]] = None,
        thread_id: int = 1
    ):
        self.script_name = script_name
        self.browser_mode = browser_mode
        self.mail_provider = mail_provider
        self.mail_config = mail_config or {}
        self.phone_provider = phone_provider
        self.phone_config = phone_config or {}
        self.proxy = proxy.strip()
        self.vpn_mode = (vpn_mode or "none").strip().lower()
        self.headless = headless
        self.on_log = on_log or (lambda lvl, msg: logger.info(f"[{lvl}] {msg}"))
        self.thread_id = thread_id

    @staticmethod
    def resolve_target_locale(country: str) -> Dict[str, Any]:
        """Trả về cấu hình quốc gia, URL đăng ký Facebook và ngôn ngữ phù hợp"""
        c = (country or "VN").strip().upper()
        if c in ["UK", "GB"]:
            return {
                "target_country": "GB",
                "fb_locale": "en_GB",
                "page_locale": "en-GB",
                "accept_language": "en-GB,en;q=0.9,en-US;q=0.8",
                "is_western": True,
                "target_url": "https://www.facebook.com/r.php?locale=en_GB"
            }
        elif c == "US":
            return {
                "target_country": "US",
                "fb_locale": "en_US",
                "page_locale": "en-US",
                "accept_language": "en-US,en;q=0.9",
                "is_western": True,
                "target_url": "https://www.facebook.com/r.php?locale=en_US"
            }
        elif c == "DE":
            return {
                "target_country": "DE",
                "fb_locale": "de_DE",
                "page_locale": "de-DE",
                "accept_language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
                "is_western": True,
                "target_url": "https://www.facebook.com/r.php?locale=de_DE"
            }
        elif c == "JP":
            return {
                "target_country": "JP",
                "fb_locale": "ja_JP",
                "page_locale": "ja-JP",
                "accept_language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
                "is_western": True,
                "target_url": "https://www.facebook.com/r.php?locale=ja_JP"
            }
        elif c in ["NONE", "VN", ""]:
            return {
                "target_country": "VN",
                "fb_locale": "vi_VN",
                "page_locale": "vi-VN",
                "accept_language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
                "is_western": False,
                "target_url": "https://www.facebook.com/r.php?locale=vi_VN"
            }
        else:
            return {
                "target_country": c,
                "fb_locale": "en_US",
                "page_locale": "en-US",
                "accept_language": "en-US,en;q=0.9",
                "is_western": True,
                "target_url": "https://www.facebook.com/r.php?locale=en_US"
            }

    def log(self, msg: str, level: str = "info"):
        if self.on_log:
            try:
                self.on_log(level, msg)
            except Exception:
                pass

    async def run_single_registration(self, identity: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Thực hiện một lượt đăng ký tài khoản Facebook hoàn chỉnh"""
        from playwright.async_api import async_playwright

        # 1. Xác định quốc gia mục tiêu từ cấu hình VPN / Proxy
        initial_country = "VN"
        if self.vpn_mode and self.vpn_mode != "none":
            c = self.vpn_mode.upper()
            if c in ["UK", "GB"]:
                initial_country = "GB"
            elif c == "AUTO":
                initial_country = random.choice(["US", "GB", "DE", "JP"])
            else:
                initial_country = c

        # WireGuard VPN Setup if enabled and no manual proxy
        wireguard_tunnel = None
        vpn_config = ""
        vpn_channel_id = 88000 + (self.thread_id % 1000)

        if self.vpn_mode and self.vpn_mode != "none" and not self.proxy:
            picked = vpn_manager.pick_random_vpn(initial_country)
            if not picked:
                message = f"Không tìm thấy cấu hình WireGuard cho quốc gia {initial_country}"
                self.log(message, "error")
                return {
                    "success": False,
                    "status": "Lỗi VPN",
                    "message": message,
                    "name": "",
                    "mail": "",
                }
            try:
                wireguard_tunnel = vpn_manager.start_wireguard_proxy(vpn_channel_id, picked["rel_path"])
                vpn_config = picked["rel_path"]
                self.proxy = wireguard_tunnel["socks5_url"]
                self.log(f"Đã kích hoạt VPN WireGuard: {wireguard_tunnel['location']} ({self.proxy})")
            except Exception as e:
                message = f"Không khởi động được VPN {picked.get('label')}: {e}"
                self.log(message, "error")
                try:
                    vpn_manager.stop_wireguard_proxy(vpn_channel_id)
                except Exception:
                    pass
                return {
                    "success": False,
                    "status": "Lỗi VPN",
                    "message": message,
                    "name": "",
                    "mail": "",
                }

        # Tinh chỉnh quốc gia thực tế từ WireGuard location nếu có
        effective_country = initial_country
        if wireguard_tunnel:
            loc = wireguard_tunnel.get("location", "").lower()
            if any(k in loc for k in ["united kingdom", "glasgow", "london", "edinburgh", "manchester"]):
                effective_country = "GB"
            elif any(k in loc for k in ["united states", "san francisco", "atlanta", "new york", "chicago", "los angeles", "seattle", "dallas", "miami"]):
                effective_country = "US"
            elif any(k in loc for k in ["germany", "frankfurt", "berlin"]):
                effective_country = "DE"
            elif any(k in loc for k in ["japan", "tokyo"]):
                effective_country = "JP"

        locale_meta = self.resolve_target_locale(effective_country)
        target_country = locale_meta["target_country"]
        target_url = locale_meta["target_url"]
        page_locale = locale_meta["page_locale"]
        accept_lang = locale_meta["accept_language"]
        is_western = locale_meta["is_western"]

        # 2. Khởi tạo thông tin danh tính (đồng bộ quốc gia / ngôn ngữ của VPN)
        if not identity:
            gender = RandomFacebookIdentityGenerator.random_gender()
            name_info = RandomFacebookIdentityGenerator.random_fullname(
                gender=gender, include_middle_name=True, is_western=is_western
            )
            password = RandomFacebookIdentityGenerator.random_password()
            birthday = RandomFacebookIdentityGenerator.random_birthday()
            twofa_secret = RandomFacebookIdentityGenerator.generate_2fa_secret()
        else:
            gender = identity.get("gender") or "Nam"
            name_info = {
                "fullname": identity.get("fullname", "Nguyễn Văn An"),
                "firstname": identity.get("firstname", "An"),
                "lastname": identity.get("lastname", "Nguyễn Văn"),
                "gender": gender
            }
            password = identity.get("password") or RandomFacebookIdentityGenerator.random_password()
            birthday = identity.get("birthday") or RandomFacebookIdentityGenerator.random_birthday()
            twofa_secret = identity.get("twofa_secret") or RandomFacebookIdentityGenerator.generate_2fa_secret()

        self.log(f"Bắt đầu đăng ký tài khoản: {name_info['fullname']} | Giới tính: {gender} | Kịch bản: {self.script_name}")

        reg_mail = ""
        reg_pass_mail = ""
        mail_client_data = {}
        reg_phone = ""
        is_phone_reg = False

        # 3. Chuẩn bị Mail hoặc SĐT theo cấu hình
        if "phone" in self.script_name.lower() or self.mail_provider == "FunOtp":
            is_phone_reg = True
            self.log(f"Đang lấy số điện thoại qua cổng '{self.phone_provider}'...")
            if self.phone_provider == "FunOtp":
                fun_client = FunOtpClient(
                    api_key=self.phone_config.get("api_key", ""),
                    service=self.phone_config.get("service", "facebook"),
                    country=self.phone_config.get("country", "vn")
                )
                p_res = await fun_client.get_new_phone()
                if not p_res.get("success"):
                    self.log(f"Lỗi lấy số điện thoại: {p_res.get('message')}", "error")
                    return {"success": False, "message": p_res.get("message")}
                reg_phone = p_res.get("phone", "")
                mail_client_data["phone_id"] = p_res.get("id")
                self.log(f"Đã nhận SĐT: {reg_phone}")
            else:
                reg_phone = RandomFacebookIdentityGenerator.random_vietnamese_phone()
                self.log(f"Đã sinh SĐT ngẫu nhiên: {reg_phone}")
        else:
            self.log(f"Đang lấy email qua cổng '{self.mail_provider}'...")
            if self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"]:
                loop = asyncio.get_running_loop()
                store_acc = await loop.run_in_executor(None, get_next_available_store_email)
                if not store_acc:
                    self.log("Kho Email (Store) đã hết tài khoản khả dụng!", "error")
                    return {"success": False, "status": "Hết Email Kho", "message": "Kho Email Store không còn tài khoản Ready.", "name": name_info["fullname"]}
                reg_mail = store_acc["email"]
                reg_pass_mail = store_acc["pass_mail"]
                mail_client_data = store_acc
                self.log(f"Đã lấy email từ Kho Store: {reg_mail} (Nguồn: {store_acc.get('source')})")
            elif self.mail_provider == "DongVanFb":
                dv_client = DongVanFbClient(
                    api_key=self.mail_config.get("api_key", ""),
                    folder_id=self.mail_config.get("folder_id", "1")
                )
                m_res = await dv_client.get_new_mail()
                if not m_res.get("success"):
                    self.log(f"Lỗi lấy mail dongvanfb: {m_res.get('message')}", "error")
                    return {"success": False, "status": "Lỗi API Mail", "message": m_res.get("message"), "name": name_info["fullname"]}
                reg_mail = m_res.get("email", "")
                reg_pass_mail = m_res.get("password", "")
                mail_client_data = m_res
                self.log(f"Đã nhận mail: {reg_mail}")
            elif self.mail_provider == "10MinuteMail":
                ten_client = TenMinuteMailClient()
                m_res = await ten_client.get_new_mail()
                if not m_res.get("success"):
                    self.log(f"Lỗi lấy mail 10minutemail: {m_res.get('message')}", "error")
                    return {"success": False, "status": "Lỗi lấy mail", "message": m_res.get("message"), "name": name_info["fullname"]}
                reg_mail = m_res.get("email", "")
                mail_client_data = m_res
                self.log(f"Đã nhận mail: {reg_mail}")
            else:
                reg_mail = RandomFacebookIdentityGenerator.random_email_from_name(name_info["fullname"], domain=self.mail_config.get("domain", "gmail.com"))
                self.log(f"Sinh mail giả lập: {reg_mail}")

        is_mobile = "(M)" in self.script_name or "mobile" in self.script_name.lower()
        if is_mobile:
            user_agent = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.83 Mobile Safari/537.36"
            viewport_cfg = {"width": 412, "height": 915}
            device_scale = 2.625
            client_hints = {
                "Sec-CH-UA": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
                "Sec-CH-UA-Mobile": "?1",
                "Sec-CH-UA-Platform": '"Android"',
                "Sec-CH-UA-Platform-Version": '"14.0.0"',
                "Sec-CH-UA-Model": '"Pixel 7"',
                "Accept-Language": accept_lang
            }
        else:
            user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.83 Safari/537.36"
            viewport_cfg = {"width": 1280, "height": 800}
            device_scale = 1.0
            client_hints = {
                "Sec-CH-UA": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": '"Windows"',
                "Sec-CH-UA-Platform-Version": '"15.0.0"',
                "Sec-CH-UA-Model": '""',
                "Accept-Language": accept_lang
            }

        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-infobars",
            "--window-position=0,0",
            "--ignore-certificate-errors",
            "--disable-notifications"
        ]

        proxy_dict = None
        if self.proxy:
            px = self.proxy.strip()
            if "://" not in px:
                parts = px.split(":")
                if len(parts) == 4:
                    proxy_dict = {"server": f"http://{parts[0]}:{parts[1]}", "username": parts[2], "password": parts[3]}
                elif len(parts) == 2:
                    proxy_dict = {"server": f"http://{parts[0]}:{parts[1]}"}
            else:
                proxy_dict = {"server": px}
            if not wireguard_tunnel:
                self.log(f"Sử dụng Proxy: {self.proxy}")

        reg_start_time = int(time.time())
        vpn_label = f"WireGuard ({wireguard_tunnel['location']})" if wireguard_tunnel else ""
        account_res = {
            "uid": "",
            "name": name_info["fullname"],
            "gender": gender,
            "password": password,
            "mail": reg_mail,
            "pass_mail": reg_pass_mail,
            "phone": reg_phone,
            "birthday": birthday["iso"],
            "twofa": twofa_secret,
            "cookie": "",
            "token": "",
            "vpn_config": vpn_config,
            "vpn_location": vpn_label,
            "script": self.script_name,
            "status": "Đang chạy",
            "message": "",
            "created_at": reg_start_time
        }

        try:
            async with async_playwright() as p:
                launch_kwargs = {
                    "headless": self.headless,
                    "args": launch_args,
                    "proxy": proxy_dict
                }
                if CHROME_PATH and os.path.exists(CHROME_PATH):
                    launch_kwargs["executable_path"] = CHROME_PATH

                browser = await p.chromium.launch(**launch_kwargs)
                context = await browser.new_context(
                    user_agent=user_agent,
                    viewport=viewport_cfg,
                    device_scale_factor=device_scale,
                    is_mobile=is_mobile,
                    has_touch=is_mobile,
                    locale=page_locale,
                    extra_http_headers=client_hints
                )

                stealth_script = f"""
                    // 1. Mask navigator.webdriver
                    try {{
                        Object.defineProperty(navigator, 'webdriver', {{ get: () => undefined, configurable: true }});
                        delete navigator.__proto__.webdriver;
                    }} catch (e) {{}}

                    // 2. Mock navigator.platform và userAgentData theo đúng kịch bản
                    const isMobileMode = {json.dumps(is_mobile)};
                    try {{
                        Object.defineProperty(navigator, 'platform', {{
                            get: () => isMobileMode ? 'Linux armv81' : 'Win32',
                            configurable: true
                        }});
                        if (isMobileMode) {{
                            Object.defineProperty(navigator, 'maxTouchPoints', {{ get: () => 5, configurable: true }});
                        }}
                    }} catch (e) {{}}

                    try {{
                        const brands = [
                            {{ brand: 'Not A(Brand', version: '8' }},
                            {{ brand: 'Chromium', version: '132' }},
                            {{ brand: 'Google Chrome', version: '132' }}
                        ];
                        const uad = {{
                            brands: brands,
                            mobile: isMobileMode,
                            platform: isMobileMode ? 'Android' : 'Windows',
                            getHighEntropyValues: async (hints) => ({{
                                brands: brands,
                                mobile: isMobileMode,
                                platform: isMobileMode ? 'Android' : 'Windows',
                                platformVersion: isMobileMode ? '14.0.0' : '15.0.0',
                                architecture: isMobileMode ? 'arm' : 'x86',
                                model: isMobileMode ? 'Pixel 7' : '',
                                bitness: '64'
                            }})
                        }};
                        Object.defineProperty(navigator, 'userAgentData', {{ get: () => uad, configurable: true }});
                    }} catch (e) {{}}

                    // 3. Mock window.chrome
                    try {{
                        window.chrome = {{
                            app: {{
                                isInstalled: false,
                                InstallState: {{ DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }},
                                RunningState: {{ CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }}
                            }},
                            runtime: {{
                                OnInstalledReason: {{}},
                                OnRestartRequiredReason: {{}},
                                PlatformArch: {{}},
                                PlatformNaclArch: {{}},
                                PlatformOs: {{}},
                                RequestUpdateCheckStatus: {{}}
                            }},
                            loadTimes: () => ({{}}),
                            csi: () => ({{}})
                        }};
                    }} catch (e) {{}}

                    // 4. Mock navigator.plugins
                    try {{
                        const mockPlugins = [
                            {{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }},
                            {{ name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' }}
                        ];
                        Object.defineProperty(navigator, 'plugins', {{ get: () => mockPlugins, configurable: true }});
                    }} catch (e) {{}}

                    // 5. Mock permissions
                    try {{
                        const origQuery = window.navigator.permissions.query;
                        window.navigator.permissions.query = (parameters) => (
                            parameters.name === 'notifications'
                                ? Promise.resolve({{ state: Notification.permission }})
                                : origQuery(parameters)
                        );
                    }} catch (e) {{}}
                """
                await context.add_init_script(stealth_script)

                page = await context.new_page()
                self.log(f"Đang kết nối tới: {target_url}...")
                await page.goto(target_url, timeout=45000, wait_until="domcontentloaded")
                await asyncio.sleep(random.uniform(2.0, 3.5))

                page_text = await page.content()
                if any(x in page_text.lower() for x in ["không thể tạo tài khoản", "we've restricted", "chúng tôi hạn chế", "something went wrong"]):
                    self.log("Facebook phát hiện và hạn chế IP/thiết bị này.", "error")
                    if self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"] and reg_mail:
                        update_store_email_status(reg_mail, "Ready", "Tạm hoãn do IP bị hạn chế")
                    await browser.close()
                    account_res["status"] = "Bị chặn IP"
                    account_res["message"] = "Facebook hạn chế địa chỉ IP/trình duyệt."
                    return account_res

                # Điền form đăng ký
                account_res = await self._fill_desktop_reg_form(
                    page=page,
                    name_info=name_info,
                    birthday=birthday,
                    gender=gender,
                    credential=reg_phone if is_phone_reg else reg_mail,
                    password=password,
                    account_res=account_res,
                    target_country=target_country
                )

                # Nếu Facebook từ chối hoặc điền form lỗi, dừng ngay và xử lý trạng thái email
                if account_res.get("status") in ["Bị Facebook từ chối", "Bị chặn IP", "Lỗi điền form desktop", "Lỗi điền form"]:
                    self.log(f"Đăng ký thất bại: {account_res.get('message', account_res.get('status'))}", "error")
                    if self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"] and reg_mail:
                        if account_res.get("status") == "Bị Facebook từ chối":
                            update_store_email_status(reg_mail, "Failed", f"FB từ chối: {account_res.get('message', '')[:60]}")
                        else:
                            update_store_email_status(reg_mail, "Ready", f"Lỗi phụ: {account_res.get('status')}")
                    await browser.close()
                    return account_res

                need_verify = "verify" in self.script_name.lower() and "novery" not in self.script_name.lower()
                if need_verify:
                    self.log("Đang chờ và đọc mã OTP xác nhận từ Facebook...")
                    otp_code = ""
                    if is_phone_reg and self.phone_provider == "FunOtp":
                        fun_client = FunOtpClient(self.phone_config.get("api_key", ""))
                        otp_res = await fun_client.try_get_otp(mail_client_data.get("phone_id", ""))
                        if otp_res.get("success"):
                            otp_code = otp_res["otp"]
                    elif not is_phone_reg and self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"]:
                        store_client = MicrosoftImapOAuth2Client(
                            email=reg_mail,
                            refresh_token=mail_client_data.get("refresh_token", ""),
                            client_id=mail_client_data.get("client_id", ""),
                            pass_mail=mail_client_data.get("pass_mail", ""),
                            on_token_refresh=update_store_email_token
                        )
                        # Lọc đúng thư gửi từ Facebook và chỉ nhận thư sau mốc thời gian bắt đầu reg
                        otp_res = await store_client.try_get_otp(
                            filter_type="facebook",
                            min_timestamp=reg_start_time,
                            max_attempts=10,
                            delay_sec=4,
                            on_attempt=lambda cur, tot: self.log(f"Đang kiểm tra mã OTP từ Facebook (lần {cur}/{tot})...")
                        )
                        if otp_res.get("success"):
                            otp_code = otp_res["otp"]
                    elif not is_phone_reg and self.mail_provider == "DongVanFb":
                        dv_client = DongVanFbClient(self.mail_config.get("api_key", ""))
                        otp_res = await dv_client.try_get_otp(mail_client_data)
                        if otp_res.get("success"):
                            otp_code = otp_res["otp"]
                    elif not is_phone_reg and self.mail_provider == "10MinuteMail":
                        ten_client = TenMinuteMailClient()
                        otp_res = await ten_client.try_get_otp(mail_client_data)
                        if otp_res.get("success"):
                            otp_code = otp_res["otp"]

                    if otp_code:
                        self.log(f"Đã nhận mã OTP Facebook: {otp_code}. Đang nhập xác minh...")
                        await self._submit_otp_code(page, otp_code)
                        await asyncio.sleep(5.0)
                    else:
                        account_res["status"] = "Chờ OTP thất bại"
                        account_res["message"] = "Không nhận được mã OTP xác minh từ Facebook."
                        self.log("Không nhận được mã OTP xác minh từ Facebook.", "warning")
                        if self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"] and reg_mail:
                            update_store_email_status(reg_mail, "Ready", "")
                        await browser.close()
                        return account_res

                # Kiểm tra cookie c_user thực tế để xác nhận tài khoản đã được Facebook tạo thành công
                cookies = await context.cookies()
                cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
                account_res["cookie"] = cookie_str
                account_res["profile_cookies"] = cookies

                c_user_val = ""
                xs_val = ""
                for c in cookies:
                    if c["name"] == "c_user" and c["value"] and str(c["value"]).isdigit():
                        c_user_val = str(c["value"])
                    elif c["name"] == "xs" and c["value"]:
                        xs_val = str(c["value"])

                if not c_user_val:
                    m = re.search(r'c_user=(\d+)', cookie_str)
                    if m:
                        c_user_val = m.group(1)

                # c_user một mình cũng xuất hiện ở một số phiên checkpoint. Một
                # phiên đăng nhập dùng được phải có cả xs và không bị Facebook
                # chuyển về login/checkpoint khi mở /me.
                session_ok, cookie_uid, session_error = validate_session_cookies(cookies)
                if cookie_uid:
                    c_user_val = cookie_uid
                if session_ok:
                    current_url = page.url.lower()
                    if is_blocked_facebook_url(current_url):
                        session_ok = False
                        session_error = f"Facebook chuyển tới {page.url}"
                        if "1501092823525282" in current_url:
                            self.log(f"Tài khoản {c_user_val} bị Facebook đưa vào Checkpoint 282 (đình chỉ danh tính)", "error")
                    else:
                        try:
                            if not any(k in current_url for k in ["facebook.com/me", "facebook.com/profile"]):
                                await page.goto(
                                    "https://www.facebook.com/me",
                                    timeout=30000,
                                    wait_until="domcontentloaded",
                                )
                                await asyncio.sleep(2.5)
                            final_url = page.url.lower()
                            if is_blocked_facebook_url(final_url):
                                session_ok = False
                                session_error = f"Facebook chuyển tới {page.url}"
                                if "1501092823525282" in final_url:
                                    self.log(f"Tài khoản {c_user_val} bị Facebook đưa vào Checkpoint 282 (đình chỉ danh tính)", "error")
                        except Exception as exc:
                            session_ok = False
                            session_error = f"Không xác nhận được trang /me: {exc}"

                if session_ok:
                    cookies = await context.cookies()
                    account_res["profile_cookies"] = cookies
                    account_res["cookie"] = "; ".join(
                        f"{c['name']}={c['value']}" for c in cookies
                    )
                    account_res["uid"] = c_user_val
                    account_res["status"] = "Live (Đã Verify)" if need_verify else "Đăng ký thành công (Novery)"
                    account_res["message"] = "Tạo tài khoản và xác nhận phiên đăng nhập thành công"
                    if self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"] and reg_mail:
                        update_store_email_status(reg_mail, "Used", f"Facebook ({c_user_val})")
                    self.log(f"Đăng ký thành công! UID: {c_user_val} | Trạng thái: {account_res['status']}", "success")
                else:
                    # Chụp ảnh debug nếu gặp checkpoint hoặc lỗi phiên
                    try:
                        debug_dir = BASE_DIR / "storage" / "fb_reg_debug"
                        debug_dir.mkdir(parents=True, exist_ok=True)
                        shot_name = f"checkpoint_{c_user_val or 'nouser'}_{int(time.time())}.png"
                        shot_path = debug_dir / shot_name
                        await page.screenshot(path=str(shot_path), full_page=False)
                        self.log(f"Đã lưu ảnh màn hình lỗi: storage/fb_reg_debug/{shot_name}", "warning")
                    except Exception:
                        pass

                    account_res["uid"] = c_user_val
                    account_res["status"] = "Checkpoint 282" if "1501092823525282" in str(session_error) else "Phiên đăng nhập chưa hợp lệ"
                    account_res["message"] = session_error or (
                        "Facebook chưa cấp đủ cookie phiên c_user + xs. "
                        "Tài khoản có thể đang checkpoint hoặc chưa hoàn tất xác minh."
                    )
                    if self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"] and reg_mail:
                        update_store_email_status(reg_mail, "Ready", "")
                    self.log(f"Đăng ký chưa hợp lệ: {account_res['message']}", "warning")

                await browser.close()
                return account_res

        except Exception as e:
            self.log(f"Lỗi trong quá trình đăng ký Playwright: {e}", "error")
            account_res["status"] = "Lỗi kỹ thuật"
            account_res["message"] = str(e)
            if self.mail_provider in ["EmailStore", "KhoHotmail", "StoreEmail"] and reg_mail:
                update_store_email_status(reg_mail, "Ready", "")
            return account_res
        finally:
            if wireguard_tunnel:
                try:
                    vpn_manager.stop_wireguard_proxy(vpn_channel_id)
                except Exception:
                    pass

    async def _dismiss_cookie_banner_if_needed(self, page) -> bool:
        """Đóng cookie consent banner của Facebook (đặc biệt khi dùng VPN UK / EU / DE / US)"""
        for _ in range(5):
            try:
                dismissed = await page.evaluate("""() => {
                    const acceptTexts = [
                        'cho phép tất cả cookie', 'từ chối cookie không bắt buộc',
                        'allow all cookies', 'decline optional cookies',
                        'allow essential and optional cookies', 'only allow essential cookies',
                        'accept all', 'accept cookies',
                        'alle cookies erlauben', 'nur essenzielle cookies erlauben',
                        'cookies ablehnen', 'zustimmen', 'chấp nhận tất cả'
                    ];
                    const elements = Array.from(document.querySelectorAll('[role="button"], button, div[data-cookiebanner] [role="button"]'));
                    for (const el of elements) {
                        const txt = (el.textContent || '').trim().toLowerCase();
                        const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
                        if (acceptTexts.some(at => txt === at || txt.includes(at) || aria === at || aria.includes(at))) {
                            if (txt.includes('tìm hiểu thêm') || aria.includes('tìm hiểu thêm')) continue;
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }""")
                if dismissed:
                    self.log("Đã phát hiện và chấp nhận Cookie Consent Banner.")
                    await asyncio.sleep(1.0)
                    await page.evaluate("""() => {
                        document.querySelectorAll('[role="dialog"], [data-cookiebanner]').forEach(d => {
                            try { d.remove(); } catch(e) {}
                        });
                    }""")
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.4)
        return False

    async def _fill_desktop_reg_form(
        self, page, name_info, birthday, gender, credential, password, account_res, target_country: str = "VN"
    ) -> Dict[str, Any]:
        """Điền form desktop www.facebook.com/r.php hỗ trợ cả giao diện mới Meta Accounts Center và giao diện cũ"""
        submitted = False
        try:
            # 0. Tự động đóng cookie consent banner nếu có
            await self._dismiss_cookie_banner_if_needed(page)

            self.log(f"Đang điền thông tin đăng ký: {name_info['fullname']} ({gender}) | Ngày sinh: {birthday['iso']}")
            
            # Helper mô phỏng người thật gõ phím với độ trễ ngẫu nhiên tự nhiên
            async def human_type_input(el, text: str):
                if not el:
                    return
                try:
                    await el.click()
                    await asyncio.sleep(random.uniform(0.12, 0.28))
                    await el.fill("")
                    for ch in str(text):
                        await page.keyboard.type(ch, delay=random.randint(45, 110))
                    await asyncio.sleep(random.uniform(0.2, 0.45))
                except Exception:
                    await el.fill(str(text))

            # 1. Kiểm tra giao diện cũ (nếu có input[name='firstname'])
            if await page.query_selector("input[name='firstname']"):
                await human_type_input(await page.query_selector("input[name='firstname']"), name_info["firstname"])
                await asyncio.sleep(random.uniform(0.2, 0.4))
                await human_type_input(await page.query_selector("input[name='lastname']"), name_info["lastname"])
                await asyncio.sleep(random.uniform(0.2, 0.4))
                await human_type_input(await page.query_selector("input[name='reg_email__']"), credential)
                await asyncio.sleep(random.uniform(0.2, 0.4))
                if await page.is_visible("input[name='reg_email_confirmation__']"):
                    await human_type_input(await page.query_selector("input[name='reg_email_confirmation__']"), credential)
                    await asyncio.sleep(random.uniform(0.2, 0.4))
                await human_type_input(await page.query_selector("input[name='reg_passwd__']"), password)
                await asyncio.sleep(random.uniform(0.3, 0.6))

                if await page.query_selector("select[name='birthday_day']"):
                    await page.select_option("select[name='birthday_day']", str(int(birthday["day"])))
                    await page.select_option("select[name='birthday_month']", str(int(birthday["month"])))
                    await page.select_option("select[name='birthday_year']", str(birthday["year"]))

                if gender in ["Nữ", "Female"]:
                    if await page.query_selector("input[name='sex'][value='1']"):
                        await page.click("input[name='sex'][value='1']")
                else:
                    if await page.query_selector("input[name='sex'][value='2']"):
                        await page.click("input[name='sex'][value='2']")

                await asyncio.sleep(1.0)
                submit_btn = await page.query_selector("button[name='websubmit'], button[type='submit']")
                if submit_btn:
                    await submit_btn.click()
                    submitted = True
            else:
                # 2. Giao diện Meta Accounts Center hiện đại (r.php)
                await page.evaluate("""() => {
                    document.querySelectorAll('[role="dialog"], [data-cookiebanner]').forEach(d => {
                        try { d.remove(); } catch(e) {}
                    });
                }""")
                await asyncio.sleep(0.3)

                text_inputs = await page.query_selector_all("input[type='text'], input[type='email'], input[type='tel']")
                pwd_input = await page.query_selector("input[type='password']")

                if len(text_inputs) >= 3 and pwd_input:
                    # Kiểm tra ô 0 là First Name hay Last Name (tùy theo giao diện US/UK hay VN)
                    inp0_ph = ((await text_inputs[0].get_attribute("placeholder")) or "").lower()
                    inp0_aria = ((await text_inputs[0].get_attribute("aria-label")) or "").lower()
                    is_first_name_first = (
                        "first" in inp0_ph or "first" in inp0_aria
                        or ("tên" in inp0_ph and "họ" not in inp0_ph)
                        or (target_country != "VN" and "họ" not in inp0_ph)
                    )
                    if is_first_name_first:
                        await human_type_input(text_inputs[0], name_info["firstname"])
                        await asyncio.sleep(random.uniform(0.25, 0.55))
                        await human_type_input(text_inputs[1], name_info["lastname"])
                    else:
                        await human_type_input(text_inputs[0], name_info["lastname"])
                        await asyncio.sleep(random.uniform(0.25, 0.55))
                        await human_type_input(text_inputs[1], name_info["firstname"])
                    await asyncio.sleep(random.uniform(0.3, 0.6))

                    # Điền Email / Số điện thoại vào ô thứ 3 bằng gõ phím tự nhiên
                    await human_type_input(text_inputs[2], credential)
                    await asyncio.sleep(random.uniform(0.4, 0.75))

                    # Điền Mật khẩu bằng gõ phím tự nhiên
                    await human_type_input(pwd_input, password)
                    await asyncio.sleep(random.uniform(0.4, 0.8))

                    # Helper chọn combobox cho Meta form bằng click thật của Playwright
                    async def select_meta_combo(idx: int, label_hints: List[str], target_values: List[str]) -> bool:
                        combo = None
                        for hint in label_hints:
                            combo = await page.query_selector(f'[role="combobox"][aria-label*="{hint}" i]')
                            if not combo:
                                combo = await page.query_selector(f'[role="combobox"]:has-text("{hint}")')
                            if combo:
                                break
                        if not combo:
                            combos = await page.query_selector_all('[role="combobox"]')
                            if idx < len(combos):
                                combo = combos[idx]

                        if combo:
                            try:
                                await combo.click()
                            except Exception:
                                await page.evaluate('(el) => el.click()', combo)
                            await asyncio.sleep(random.uniform(0.3, 0.5))

                            for target in target_values:
                                opt = await page.query_selector(f'[role="option"]:has-text("{target}")')
                                if opt and await opt.is_visible():
                                    try:
                                        await opt.click()
                                        await asyncio.sleep(random.uniform(0.2, 0.4))
                                        return True
                                    except Exception:
                                        pass

                            matched = await page.evaluate("""(targets) => {
                                const opts = Array.from(document.querySelectorAll('[role="option"]'));
                                for (const target of targets) {
                                    const tLower = target.toLowerCase();
                                    for (const o of opts) {
                                        const txt = (o.textContent || '').trim().toLowerCase();
                                        if (txt === tLower) {
                                            o.click();
                                            return o.textContent.trim();
                                        }
                                    }
                                }
                                for (const target of targets) {
                                    const tLower = target.toLowerCase();
                                    for (const o of opts) {
                                        const txt = (o.textContent || '').trim().toLowerCase();
                                        if (txt.includes(tLower)) {
                                            o.click();
                                            return o.textContent.trim();
                                        }
                                    }
                                }
                                return null;
                            }""", target_values)
                            await asyncio.sleep(random.uniform(0.2, 0.4))
                            return bool(matched)
                        return False

                    MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
                    MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                    m_num = max(1, min(12, int(birthday.get("month", "5"))))
                    m_str_en = MONTH_EN[m_num - 1]
                    m_short_en = MONTH_SHORT[m_num - 1]
                    d_str = str(int(birthday.get("day", "15")))
                    y_str = str(birthday.get("year", "1998"))

                    is_us = (target_country == "US")
                    day_idx = 1 if is_us else 0
                    month_idx = 0 if is_us else 1
                    year_idx = 2
                    gender_idx = 3

                    # Combo Tháng / Month
                    await select_meta_combo(month_idx, ["tháng", "month", "monat"], [f"Tháng {m_num}", m_str_en, m_short_en, str(m_num)])
                    # Combo Ngày / Day
                    await select_meta_combo(day_idx, ["ngày", "day", "tag", "date"], [d_str])
                    # Combo Năm / Year
                    await select_meta_combo(year_idx, ["năm", "year", "jahr"], [y_str])
                    # Combo Giới tính / Gender
                    if gender in ["Nữ", "Female"]:
                        await select_meta_combo(gender_idx, ["giới tính", "gender", "geschlecht", "sex"], ["Nữ", "Female", "Weiblich", "Woman"])
                    else:
                        await select_meta_combo(gender_idx, ["giới tính", "gender", "geschlecht", "sex"], ["Nam", "Male", "Männlich", "Man"])

                    await asyncio.sleep(0.5)

                    # Bấm nút gửi / Submit
                    submit_clicked = await page.evaluate("""() => {
                        const submitTexts = ['gửi', 'đăng ký', 'tiếp tục', 'sign up', 'submit', 'registrieren', 'next', 'continue'];
                        const buttons = Array.from(document.querySelectorAll('[role="button"], button, input[type="submit"]'));
                        for (const b of buttons) {
                            const txt = (b.textContent || b.value || '').trim().toLowerCase();
                            if (submitTexts.includes(txt)) {
                                b.click();
                                return txt;
                            }
                        }
                        return null;
                    }""")
                    if submit_clicked:
                        self.log(f"Đã bấm nút gửi biểu mẫu: '{submit_clicked}'")
                        submitted = True
                    else:
                        submit_selectors = [
                            "[role='button']:has-text('Gửi')",
                            "[role='button']:has-text('Đăng ký')",
                            "[role='button']:has-text('Tiếp tục')",
                            "[role='button']:has-text('Sign Up')",
                            "[role='button']:has-text('Submit')",
                            "[role='button']:has-text('Continue')",
                            "button[type='submit']",
                            "button[name='websubmit']"
                        ]
                        for sel in submit_selectors:
                            btn = await page.query_selector(sel)
                            if btn and await btn.is_visible():
                                txt = (await btn.inner_text()).strip()
                                self.log(f"Đã bấm nút gửi biểu mẫu: '{txt}'")
                                await btn.click(force=True)
                                submitted = True
                                break

                else:
                    self.log(f"Không tìm thấy đủ ô nhập liệu trên trang đăng ký (tìm thấy {len(text_inputs)} text, pwd={bool(pwd_input)}).", "warning")

            if not submitted:
                self.log("Chưa thể gửi biểu mẫu đăng ký (không tìm thấy nút gửi hoặc form bị gián đoạn).", "warning")
                account_res["status"] = "Lỗi điền form desktop"
                account_res["message"] = "Không thể gửi biểu mẫu đăng ký Facebook."
                return account_res

            # Chờ Facebook phản hồi sau khi gửi form (tối đa 25 giây)
            error_keywords = [
                "đã xảy ra lỗi trong lúc bạn đăng ký",
                "không thể tạo tài khoản",
                "vui lòng thử lại sau",
                "an error occurred",
                "we've restricted",
                "something went wrong",
                "hành vi bất thường",
                "bạn không thể sử dụng facebook vào lúc này"
            ]

            for wait_sec in range(25):
                await asyncio.sleep(1.0)
                try:
                    cookies = await page.context.cookies()
                    c_user = [c for c in cookies if c.get("name") == "c_user" and str(c.get("value", "")).isdigit()]
                    if c_user:
                        c_val = str(c_user[0]["value"])
                        self.log(f"Đã bắt được cookie c_user: {c_val}", "success")
                        account_res["uid"] = c_val
                        account_res["status"] = "Đã điền form"
                        return account_res
                except Exception:
                    pass

                url = page.url.lower()
                if any(x in url for x in ["confirm", "checkpoint", "two_step"]):
                    self.log(f"Facebook chuyển hướng sang trang xác minh: {page.url}")
                    account_res["status"] = "Đã điền form"
                    return account_res

                try:
                    page_text = await page.inner_text("body")
                    page_lower = page_text.lower()
                    for kw in error_keywords:
                        if kw in page_lower:
                            self.log(f"Facebook từ chối đăng ký: '{kw}'. (IP hoặc thiết bị đang bị hạn chế)", "error")
                            account_res["status"] = "Bị Facebook từ chối"
                            account_res["message"] = f"Facebook từ chối: {kw.capitalize()}. Vui lòng đổi sang server VPN khác."
                            try:
                                debug_dir = BASE_DIR / "storage" / "fb_reg_debug"
                                debug_dir.mkdir(parents=True, exist_ok=True)
                                shot_name = f"rejected_ip_{int(time.time())}.png"
                                await page.screenshot(path=str(debug_dir / shot_name), full_page=False)
                                self.log(f"Đã lưu ảnh màn hình lỗi: storage/fb_reg_debug/{shot_name}", "warning")
                            except Exception:
                                pass
                            return account_res
                except Exception:
                    pass

            # Kiểm tra xem biểu mẫu đăng ký còn tồn tại trên màn hình hay không
            still_reg_inputs = await page.query_selector_all("input[type='password']")
            if len(still_reg_inputs) > 0 and any(k in page.url.lower() for k in ["r.php", "reg"]):
                page_text = await page.inner_text("body")
                page_lower = page_text.lower()
                error_msg = "Facebook từ chối tạo tài khoản (IP/thiết bị bị hạn chế, vui lòng đổi sang server VPN khác)."
                for kw in error_keywords:
                    if kw in page_lower:
                        error_msg = f"Facebook từ chối: {kw.capitalize()}. Vui lòng đổi sang server VPN khác."
                        break
                self.log(f"Đăng ký thất bại: {error_msg}", "error")
                account_res["status"] = "Bị Facebook từ chối"
                account_res["message"] = error_msg
                try:
                    debug_dir = BASE_DIR / "storage" / "fb_reg_debug"
                    debug_dir.mkdir(parents=True, exist_ok=True)
                    shot_name = f"rejected_form_{int(time.time())}.png"
                    await page.screenshot(path=str(debug_dir / shot_name), full_page=False)
                    self.log(f"Đã lưu ảnh màn hình lỗi: storage/fb_reg_debug/{shot_name}", "warning")
                except Exception:
                    pass
                return account_res

            account_res["status"] = "Đã điền form"
            return account_res

        except Exception as e:
            self.log(f"Lỗi khi điền form desktop: {e}", "warning")
            account_res["status"] = "Lỗi điền form desktop"
            account_res["message"] = str(e)
            return account_res

    async def _fill_mobile_reg_form(
        self, page, name_info, birthday, gender, credential, is_phone, password, account_res, target_country: str = "VN"
    ) -> Dict[str, Any]:
        """Điền form mobile m.facebook.com"""
        # Dự phòng gọi form desktop vì Facebook chặn m.facebook.com redirect
        return await self._fill_desktop_reg_form(page, name_info, birthday, gender, credential, password, account_res, target_country=target_country)

    async def _click_next_button(self, page):
        next_selectors = [
            "button:has-text('Tiếp')", "button:has-text('Next')",
            "button[type='submit']", "button[name='submit']"
        ]
        for sel in next_selectors:
            if await page.is_visible(sel):
                await page.click(sel)
                return True
        return False

    async def _click_any_text(self, page, texts: List[str]):
        for t in texts:
            sel = f"label:has-text('{t}'), span:has-text('{t}'), button:has-text('{t}')"
            if await page.is_visible(sel):
                await page.click(sel)
                return True
        return False

    async def _submit_otp_code(self, page, code: str):
        try:
            self.log("Đang tìm ô nhập mã xác minh (OTP)...")
            inp = await page.query_selector(
                "input[placeholder*='Confirmation code' i], input[aria-label*='Confirmation code' i], "
                "input[placeholder*='Mã xác nhận' i], input[aria-label*='Mã xác nhận' i], "
                "input[placeholder*='code' i], input[aria-label*='code' i], "
                "input[name='code'], input[name='c'], input[type='text'], input[type='number'], input[type='tel']"
            )
            if inp:
                self.log(f"Đã tìm thấy ô nhập mã xác minh. Đang nhập mã OTP {code}...")
                await inp.click()
                await asyncio.sleep(random.uniform(0.2, 0.45))
                await inp.fill("")
                for ch in str(code).strip():
                    await page.keyboard.type(ch, delay=random.randint(80, 180))
                await asyncio.sleep(random.uniform(1.2, 2.2))

                confirm_btn = [
                    "[role='button']:has-text('Continue')", "button:has-text('Continue')",
                    "[role='button']:has-text('Tiếp tục')", "button:has-text('Tiếp tục')",
                    "[role='button']:has-text('Confirm')", "button:has-text('Confirm')",
                    "[role='button']:has-text('Xác nhận')", "button:has-text('Xác nhận')",
                    "[role='button']:has-text('Next')", "button:has-text('Next')",
                    "[role='button']:has-text('Tiếp')", "button:has-text('Tiếp')",
                    "[role='button']:has-text('Weiter')", "button:has-text('Weiter')",
                    "[role='button']:has-text('Bestätigen')", "button:has-text('Bestätigen')",
                    "button[name='confirm']", "button[name='submit']",
                    "button[type='submit']", "input[type='submit']"
                ]
                clicked = False
                for sel in confirm_btn:
                    btn = await page.query_selector(sel)
                    if btn and await btn.is_visible():
                        self.log(f"Đã bấm nút xác nhận mã OTP ({sel})")
                        await btn.click()
                        clicked = True
                        await asyncio.sleep(4.0)
                        break

                if not clicked:
                    self.log("Chưa thấy nút bấm xác nhận mã OTP rõ ràng, gửi phím Enter...")
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(4.0)

                # Kiểm tra nếu Facebook hiện popup "Account Confirmed" (Xác nhận thành công) với nút OK
                try:
                    ok_selectors = [
                        "button:has-text('OK')", "[role='button']:has-text('OK')",
                        "button:has-text('Đồng ý')", "[role='button']:has-text('Đồng ý')",
                        "a:has-text('OK')", "button:has-text('Got it')"
                    ]
                    for osel in ok_selectors:
                        ok_btn = await page.query_selector(osel)
                        if ok_btn and await ok_btn.is_visible():
                            self.log("Phát hiện popup 'Account Confirmed', đang bấm OK...")
                            await ok_btn.click()
                            await asyncio.sleep(2.0)
                            break
                except Exception:
                    pass
            else:
                self.log("Không tìm thấy ô nhập mã xác minh trên trang!", "warning")
        except Exception as e:
            self.log(f"Lỗi khi gửi mã xác nhận OTP: {e}", "warning")


# -----------------------------------------------------------------------------
# 4. Multi-Thread Registration Batch Manager
# -----------------------------------------------------------------------------

class RegistrationBatchManager:
    """Quản lý hàng đợi và điều phối đăng ký Facebook đa luồng"""

    def __init__(self):
        self.is_running = False
        self.stop_requested = False
        self.current_tasks: List[Dict[str, Any]] = []
        self.logs: List[Dict[str, Any]] = []
        self.max_logs = 1000

    def add_log(self, level: str, message: str, thread_id: int = 0):
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = {
            "timestamp": timestamp,
            "level": level,
            "message": message,
            "thread_id": thread_id
        }
        self.logs.append(entry)
        if len(self.logs) > self.max_logs:
            self.logs = self.logs[-self.max_logs:]

    async def start_batch(
        self,
        thread_count: int,
        total_accounts: int,
        script_name: str,
        mail_provider: str,
        mail_config: Dict[str, Any],
        phone_provider: str,
        phone_config: Dict[str, Any],
        vpn_country: str,
        headless: bool,
        db_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        if self.is_running:
            return {"success": False, "message": "Tiến trình đăng ký đang chạy!"}

        self.is_running = True
        self.stop_requested = False
        self.current_tasks = []
        self.add_log("info", f"Khởi động tiến trình Reg FB: {total_accounts} tài khoản | {thread_count} luồng đồng thời | Kịch bản: {script_name}")

        if "verify" in script_name.lower() and "novery" not in script_name.lower():
            if mail_provider == "DongVanFb":
                dv_key = (mail_config.get("api_key") or "").strip()
                if not dv_key or dv_key.lower() in ["test", "test_dv_key_123"]:
                    self.add_log(
                        "warning",
                        "[Lưu ý Cổng Mail] Bạn đang chọn cổng DongVanFb nhưng chưa cấu hình API Key thật. Nếu chưa nạp tiền tài khoản DongVanFb, hãy chuyển sang cổng '10MinuteMail' (miễn phí 100%) hoặc 'Sinh Mail Giả (Ảo)'."
                    )

        semaphore = asyncio.Semaphore(thread_count)
        queue = asyncio.Queue()

        for idx in range(total_accounts):
            queue.put_nowait(idx + 1)

        async def worker(worker_id: int):
            while not queue.empty() and not self.stop_requested:
                task_idx = await queue.get()
                # Runner tự mở tunnel WireGuard riêng cho từng luồng theo vpn_country
                assigned_proxy = ""
                vpn_label = f"VPN {vpn_country}" if vpn_country and vpn_country.lower() != "none" else ""

                task_info = {
                    "id": task_idx,
                    "worker_id": worker_id,
                    "status": "Đang chạy",
                    "fullname": "",
                    "gender": "",
                    "mail": "",
                    "password": "",
                    "uid": "",
                    "vpn_location": vpn_label or "IP Máy",
                    "start_time": datetime.now().strftime("%H:%M:%S")
                }
                self.current_tasks.append(task_info)

                async with semaphore:
                    if self.stop_requested:
                        task_info["status"] = "Đã dừng"
                        queue.task_done()
                        break

                    try:
                        runner = FacebookRegistrationRunner(
                            script_name=script_name,
                            mail_provider=mail_provider,
                            mail_config=mail_config,
                            phone_provider=phone_provider,
                            phone_config=phone_config,
                            proxy=assigned_proxy,
                            vpn_mode=vpn_country,
                            headless=headless,
                            on_log=lambda lvl, msg: self.add_log(lvl, f"[Luồng {worker_id}] {msg}", worker_id),
                            thread_id=worker_id
                        )

                        res = await runner.run_single_registration()
                        task_info["status"] = res.get("status", "Hoàn thành")
                        task_info["fullname"] = res.get("name", "")
                        task_info["gender"] = res.get("gender", "")
                        task_info["mail"] = res.get("mail", "")
                        task_info["password"] = res.get("password", "")
                        task_info["uid"] = res.get("uid", "")

                        if db_callback and res.get("uid") and str(res.get("uid")).isdigit() and ("live" in res.get("status", "").lower() or "thành công" in res.get("status", "").lower()):
                            try:
                                db_callback(res)
                            except Exception as e:
                                self.add_log("error", f"Lỗi lưu DB: {e}")
                    except Exception as e:
                        # Một lượt lỗi không được làm chết cả luồng
                        task_info["status"] = "Lỗi kỹ thuật"
                        self.add_log("error", f"[Luồng {worker_id}] {e}", worker_id)

                queue.task_done()
                await asyncio.sleep(random.uniform(1.0, 3.0))

        tasks = [asyncio.create_task(worker(i + 1)) for i in range(thread_count)]
        await asyncio.gather(*tasks, return_exceptions=True)

        self.is_running = False
        self.add_log("success", "Tiến trình đăng ký Facebook đã kết thúc!")
        return {"success": True, "message": "Hoàn tất tiến trình đăng ký."}

    def stop_batch(self):
        if self.is_running:
            self.stop_requested = True
            self.add_log("warning", "Nhận tín hiệu dừng tiến trình từ người dùng...")
            return {"success": True, "message": "Đang dừng các luồng..."}
        return {"success": False, "message": "Không có tiến trình nào đang chạy"}


# Global singleton instance
REG_MANAGER = RegistrationBatchManager()
