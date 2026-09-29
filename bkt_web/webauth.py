"""Đăng nhập cho giao diện web TokMatrix.

Thiết kế:

- Mật khẩu được băm bằng ``hashlib.scrypt`` (thư viện chuẩn, không thêm phụ
  thuộc), lưu ở ``bkt_web/.webauth.json`` quyền 600. File này không bao giờ
  chứa mật khẩu gốc.
- Cookie phiên là chuỗi tự chứa ``payload.chữ_ký``. Chữ ký HMAC-SHA256 dùng
  chính khoá đã bền hoá trong ``.session_token``, nên phiên đăng nhập sống sót
  qua các lần khởi động lại server — đúng vấn đề đã gây ra lỗi 401 im lặng khi
  token còn sinh mới mỗi lần import.
- Có hạn dùng nhúng trong payload, hết hạn thì tự mất hiệu lực.

Đặt tài khoản (chạy trên máy có mã nguồn, mật khẩu gõ trực tiếp, không qua
tham số dòng lệnh để khỏi lọt vào lịch sử shell)::

    python3 -m bkt_web.webauth
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import threading
from collections import OrderedDict, deque
from pathlib import Path
from typing import Any, Dict, Optional

BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_FILE = BASE_DIR / ".webauth.json"

COOKIE_NAME = "tokmatrix_auth"
SESSION_TTL_SECONDS = 14 * 24 * 3600

# Tham số scrypt: n=2**14 tốn khoảng 16MB bộ nhớ mỗi lần băm, đủ chậm để chống
# dò ngoại tuyến mà vẫn dưới 100ms trên vCPU của VPS.
_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LEN = 32


# ----------------------------------------------------------------- lưu trữ ---
def _read_credentials() -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or "username" not in data or "hash" not in data:
        return None
    return data


def has_credentials() -> bool:
    """Đã đặt tài khoản chưa."""
    return _read_credentials() is not None


def get_username() -> str:
    data = _read_credentials()
    return str(data.get("username", "")) if data else ""


def set_credentials(username: str, password: str) -> None:
    """Ghi tài khoản mới, ghi đè tài khoản cũ nếu có."""
    username = (username or "").strip()
    if not username:
        raise ValueError("Tên đăng nhập không được để trống")
    if len(password or "") < 8:
        raise ValueError("Mật khẩu phải từ 8 ký tự trở lên")

    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt,
        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_KEY_LEN,
    )
    payload = {
        "username": username,
        "algo": "scrypt",
        "n": _SCRYPT_N,
        "r": _SCRYPT_R,
        "p": _SCRYPT_P,
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(digest).decode("ascii"),
        "updated_at": int(time.time()),
    }
    CREDENTIALS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    try:
        os.chmod(CREDENTIALS_FILE, 0o600)
    except OSError:
        pass


def verify_password(username: str, password: str) -> bool:
    """So khớp tài khoản. Luôn so sánh theo thời gian hằng định."""
    data = _read_credentials()
    if not data:
        return False
    try:
        salt = base64.b64decode(data["salt"])
        expected = base64.b64decode(data["hash"])
        digest = hashlib.scrypt(
            (password or "").encode("utf-8"), salt=salt,
            n=int(data.get("n", _SCRYPT_N)),
            r=int(data.get("r", _SCRYPT_R)),
            p=int(data.get("p", _SCRYPT_P)),
            dklen=len(expected),
        )
    except (KeyError, ValueError, TypeError):
        return False
    name_ok = hmac.compare_digest(str(data.get("username", "")), (username or "").strip())
    hash_ok = hmac.compare_digest(digest, expected)
    return name_ok and hash_ok


# ------------------------------------------------------------------ phiên ---
def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64u(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_session(username: str, signing_key: str, ttl: int = SESSION_TTL_SECONDS) -> str:
    """Tạo giá trị cookie đã ký cho một tài khoản."""
    payload = json.dumps(
        {"u": username, "exp": int(time.time()) + int(ttl)},
        separators=(",", ":"),
    ).encode("utf-8")
    body = _b64u(payload)
    sig = hmac.new(signing_key.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64u(sig)}"


def read_session(value: str, signing_key: str) -> Optional[str]:
    """Trả về tên đăng nhập nếu cookie hợp lệ và chưa hết hạn, ngược lại None."""
    if not value or "." not in value:
        return None
    body, _, sig = value.partition(".")
    expected = hmac.new(signing_key.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(_unb64u(sig), expected):
            return None
        data = json.loads(_unb64u(body).decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError):
        return None
    if int(data.get("exp", 0)) < time.time():
        return None
    username = str(data.get("u", ""))
    # Đổi tài khoản là vô hiệu hoá mọi phiên cũ.
    return username if username and username == get_username() else None


# ------------------------------------------------- chặn dò mật khẩu đơn giản ---
# Bounded TTL/LRU cache: bản cũ là dict không giới hạn nên một lượng lớn IP giả
# có thể làm process giữ key mãi cho tới restart. Giữ limiter trong RAM vẫn đủ
# cho một worker, nhưng luôn có trần và tự dọn entry hết hạn.
_ATTEMPTS = OrderedDict()
_ATTEMPTS_LOCK = threading.Lock()
MAX_ATTEMPTS = 6
ATTEMPT_WINDOW = 600
MAX_TRACKED_CLIENTS = 2048
_PRUNE_INTERVAL = 60
_LAST_PRUNE = 0.0


def _prune_attempts(now: float, *, force: bool = False) -> None:
    global _LAST_PRUNE
    if not force and now - _LAST_PRUNE < _PRUNE_INTERVAL:
        return
    for client, hits in list(_ATTEMPTS.items()):
        while hits and now - hits[0] >= ATTEMPT_WINDOW:
            hits.popleft()
        if not hits:
            _ATTEMPTS.pop(client, None)
    while len(_ATTEMPTS) > MAX_TRACKED_CLIENTS:
        _ATTEMPTS.popitem(last=False)
    _LAST_PRUNE = now


def too_many_attempts(client: str) -> bool:
    now = time.time()
    key = client or "unknown"
    with _ATTEMPTS_LOCK:
        _prune_attempts(now)
        hits = _ATTEMPTS.get(key)
        if not hits:
            return False
        while hits and now - hits[0] >= ATTEMPT_WINDOW:
            hits.popleft()
        if not hits:
            _ATTEMPTS.pop(key, None)
            return False
        _ATTEMPTS.move_to_end(key)
        return len(hits) >= MAX_ATTEMPTS


def record_failure(client: str) -> None:
    now = time.time()
    key = client or "unknown"
    with _ATTEMPTS_LOCK:
        _prune_attempts(now)
        hits = _ATTEMPTS.get(key)
        if hits is None:
            if len(_ATTEMPTS) >= MAX_TRACKED_CLIENTS:
                _ATTEMPTS.popitem(last=False)
            hits = deque()
            _ATTEMPTS[key] = hits
        while hits and now - hits[0] >= ATTEMPT_WINDOW:
            hits.popleft()
        hits.append(now)
        _ATTEMPTS.move_to_end(key)


def clear_attempts(client: str) -> None:
    with _ATTEMPTS_LOCK:
        _ATTEMPTS.pop(client or "unknown", None)


# -------------------------------------------------------------------- CLI ---
def _main() -> int:
    import argparse
    import getpass

    parser = argparse.ArgumentParser(description="Đặt tài khoản đăng nhập web TokMatrix")
    parser.add_argument("--username", help="Tên đăng nhập (bỏ trống sẽ hỏi)")
    parser.add_argument("--show", action="store_true", help="Chỉ xem tài khoản hiện tại")
    args = parser.parse_args()

    if args.show:
        if has_credentials():
            print(f"Tài khoản hiện tại: {get_username()}")
            print(f"File: {CREDENTIALS_FILE}")
        else:
            print("Chưa đặt tài khoản nào.")
        return 0

    username = args.username or input("Tên đăng nhập: ").strip()
    password = getpass.getpass("Mật khẩu (tối thiểu 8 ký tự): ")
    confirm = getpass.getpass("Nhập lại mật khẩu: ")
    if password != confirm:
        print("Hai lần nhập không khớp.")
        return 1
    try:
        set_credentials(username, password)
    except ValueError as exc:
        print(f"Lỗi: {exc}")
        return 1
    print(f"Đã đặt tài khoản '{username}'. Ghi vào {CREDENTIALS_FILE} (quyền 600).")
    print("Mọi phiên đăng nhập cũ đã bị vô hiệu hoá.")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
