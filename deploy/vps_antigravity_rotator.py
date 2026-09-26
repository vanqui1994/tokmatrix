#!/usr/bin/env python3
"""VPS Antigravity Account Rotator — xoay tài khoản Google của Antigravity khi hết quota.

Cài bằng bản sao thuộc root (không symlink vào /opt/tokmatrix, user tokmatrix — cũng là
user chạy agent — không được sửa code mà root chạy):
    install -m 755 deploy/vps_antigravity_rotator.py /usr/local/bin/tokmatrix-rotator

Pool tài khoản: /etc/tokmatrix/antigravity_accounts_pool.json (root:root 600). File chứa
refresh_token và OAuth client secret, không để trong /opt/tokmatrix (agent đọc được,
chown -R của tokmatrix-web, bản sao lưu).

Bridge gọi (tokmatrix-bridge-run / tokmatrix-script-bridge-run):
    tokmatrix-rotator active
    tokmatrix-rotator rotate --kind image --account <email> --until <epoch> --model <model>

- Chỉ khoá đúng tài khoản gây lỗi (--account phải là tài khoản đang active; khác thì bridge
  kia đã xoay rồi, không làm gì) và chỉ khoá loại quota đó (image | text) tới mốc reset thật.
- Mọi thao tác ghi pool/đổi tài khoản chạy dưới flock, hai bridge không xoay chồng.
- Đổi tài khoản: stop antigravity → ghi 3 nơi lưu phiên → đọc lại kiểm tra → start → chờ
  language_server. Ghi lỗi thì khôi phục file cũ. Electron đang chạy sẽ ghi đè state.vscdb
  khi tắt, nên không ghi lúc nó còn chạy.
- Làm mới token lỗi (invalid_grant...) thì đánh dấu disabled và thử tài khoản kế tiếp.

Lệnh tay: status | switch <email> | reset-cooldown [--email X] [--include-disabled]

Mỗi lần đổi tài khoản (tự động hoặc tay), hết sạch tài khoản, token hỏng hay đổi lỗi đều báo
Telegram qua `python -m bkt_web.notify send` chạy dưới quyền tokmatrix (không chạy code của
/opt/tokmatrix bằng root). Gửi lỗi không bao giờ làm hỏng việc xoay. Tắt: TOKMATRIX_ROTATOR_NOTIFY=0.
"""

from __future__ import annotations

import argparse
import base64
import fcntl
import html
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

POOL_FILE = Path(os.environ.get("TOKMATRIX_ACCOUNT_POOL", "/etc/tokmatrix/antigravity_accounts_pool.json"))
LOCK_FILE = Path(os.environ.get("TOKMATRIX_ROTATOR_LOCK", "/run/lock/tokmatrix-rotator.lock"))
# Email tài khoản đang active, đọc được bởi user tokmatrix (pool là root 600): dự phòng ảnh
# Cloudflare trong web app cần biết tài khoản nào để chỉ tính lỗi của đúng tài khoản đó.
ACTIVE_FILE = Path(os.environ.get("TOKMATRIX_ACTIVE_ACCOUNT_FILE", "/var/lib/tokmatrix-bridge/active_account"))
# Trạng thái quota từng tài khoản cho bảng "Quota Antigravity" trong Cài Đặt (web app, user
# tokmatrix). KHÔNG chứa refresh_token/access_token/client secret.
STATUS_FILE = Path(os.environ.get("TOKMATRIX_ACCOUNT_STATUS_FILE", "/var/lib/tokmatrix-bridge/accounts_status.json"))
STATUS_FIELDS = ("email", "tier", "name", "blocked", "disabled", "disabled_reason", "disabled_at", "last_used_at")
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
SERVICE = "antigravity"
APP_USER = "tokmatrix"
HOME = Path("/opt/tokmatrix")
JETSKI_TOKEN_PATH = HOME / ".gemini/jetski-standalone-oauth-token"
APP_STORAGE_PATH = HOME / ".config/Antigravity/app_storage.json"
VSCDB_PATH = HOME / ".config/Antigravity/User/globalStorage/state.vscdb"
VSCDB_KEY = "antigravityUnifiedStateSync.oauthToken"
LS_PATTERN = "language_server --standalone.*subclient_type hub"
KINDS = ("image", "text")
MAX_BLOCK_SECONDS = 24 * 3600
LS_WAIT_SECONDS = 90
EXHAUSTED_STAMP = Path("/run/tokmatrix/rotator-exhausted")
EXHAUSTED_COOLDOWN = 3600
KIND_LABEL = {"image": "ảnh", "text": "chữ/kịch bản"}


# ---------------------------------------------------------------------------
# Thông báo Telegram (best-effort)
# ---------------------------------------------------------------------------

def _e(value: Any) -> str:
    return html.escape(str(value or ""), quote=False)


def _hm(ts: float) -> str:
    return time.strftime("%H:%M %d/%m", time.localtime(ts))


def notify(severity: str, text: str) -> None:
    if os.environ.get("TOKMATRIX_ROTATOR_NOTIFY", "1") == "0":
        return
    cmd = [str(HOME / "venv/bin/python"), "-m", "bkt_web.notify", "send", "--severity", severity, text]
    if os.geteuid() == 0:
        cmd = ["runuser", "-u", APP_USER, "--", *cmd]
    try:
        subprocess.run(cmd, cwd=str(HOME), capture_output=True, timeout=30)
    except Exception as exc:  # không để thông báo làm hỏng việc xoay tài khoản
        print(f"(không gửi được Telegram: {exc})", file=sys.stderr)


def _pool_summary(pool: Dict[str, Any], kind: str, now: float) -> str:
    accounts = pool.get("accounts", [])
    ready = sum(1 for a in accounts if is_free(a, kind, now))
    disabled = sum(1 for a in accounts if a.get("disabled"))
    line = f"📊 Còn quota {KIND_LABEL.get(kind, kind)}: <b>{ready}</b>/{len(accounts)} tài khoản"
    return line + (f" · {disabled} disabled" if disabled else "")


def kind_of_model(model: str) -> str:
    return "image" if "image" in (model or "") else "text"


# ---------------------------------------------------------------------------
# Protobuf (giữ nguyên định dạng antigravityUnifiedStateSync.oauthToken đang dùng)
# ---------------------------------------------------------------------------

def encode_varint(n: int) -> bytes:
    res = bytearray()
    while n >= 0x80:
        res.append((n & 0x7F) | 0x80)
        n >>= 7
    res.append(n)
    return bytes(res)


def encode_field(field_num: int, wire_type: int, data: Any) -> bytes:
    tag = (field_num << 3) | wire_type
    if wire_type == 0:
        return encode_varint(tag) + encode_varint(int(data))
    if wire_type == 2:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return encode_varint(tag) + encode_varint(len(data)) + data
    raise ValueError(f"Unsupported wire type: {wire_type}")


def build_antigravity_oauth_payload(access_token: str, token_type: str, refresh_token: str,
                                    expiry_ts: int, id_token: str) -> str:
    """Wrapper {1: {1: "oauthTokenInfoSentinelKey", 2: {1: base64(inner)}}}, inner =
    {1: access_token, 2: token_type, 3: refresh_token, 4: {1: expiry, 2: 0}, 5: id_token}."""
    f4_expiry = encode_field(1, 0, int(expiry_ts)) + encode_field(2, 0, 0)
    inner = (
        encode_field(1, 2, access_token)
        + encode_field(2, 2, token_type or "Bearer")
        + encode_field(3, 2, refresh_token)
        + encode_field(4, 2, f4_expiry)
        + encode_field(5, 2, id_token or "")
    )
    inner_b64 = base64.b64encode(inner).decode("ascii")
    outer_f1 = encode_field(1, 2, "oauthTokenInfoSentinelKey") + encode_field(2, 2, encode_field(1, 2, inner_b64))
    return base64.b64encode(encode_field(1, 2, outer_f1)).decode("ascii")


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------

class RefreshError(RuntimeError):
    pass


def refresh_google_access_token(client_id: str, client_secret: str, refresh_token: str) -> Dict[str, Any]:
    data = urllib.parse.urlencode({
        "client_id": client_id, "client_secret": client_secret,
        "refresh_token": refresh_token, "grant_type": "refresh_token",
    }).encode("utf-8")
    req = urllib.request.Request(OAUTH_TOKEN_URL, data=data, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise RefreshError(f"Google OAuth refresh thất bại ({exc.code}): {body[:300]}")
    except Exception as exc:
        raise RefreshError(f"Không kết nối được Google OAuth: {exc}")


# ---------------------------------------------------------------------------
# Pool
# ---------------------------------------------------------------------------

@contextmanager
def pool_lock():
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_FILE, "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def _normalize(pool: Dict[str, Any]) -> Dict[str, Any]:
    for acc in pool.get("accounts", []):
        blocked = acc.get("blocked")
        if not isinstance(blocked, dict):
            legacy = int(acc.pop("blocked_until", 0) or 0)   # bản cũ: một mốc cho cả tài khoản
            blocked = {kind: legacy for kind in KINDS}
        acc["blocked"] = {kind: int(blocked.get(kind, 0) or 0) for kind in KINDS}
        acc.pop("blocked_until", None)
    return pool


def load_pool() -> Dict[str, Any]:
    if not POOL_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file pool tài khoản tại: {POOL_FILE}")
    return _normalize(json.loads(POOL_FILE.read_text(encoding="utf-8")))


def save_pool(pool: Dict[str, Any]) -> None:
    tmp = POOL_FILE.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(pool, fh, ensure_ascii=False, indent=2)
    os.chmod(tmp, 0o600)
    tmp.replace(POOL_FILE)
    publish_active(pool.get("active_email", ""))
    publish_status(pool)


def public_status(pool: Dict[str, Any]) -> Dict[str, Any]:
    """Pool bỏ mọi bí mật: chỉ các trường trong STATUS_FIELDS."""
    return {
        "generated_at": int(time.time()),
        "active_email": pool.get("active_email", ""),
        "accounts": [{k: acc[k] for k in STATUS_FIELDS if k in acc} for acc in pool.get("accounts", [])],
    }


def publish_status(pool: Dict[str, Any]) -> None:
    try:
        STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STATUS_FILE.with_name(STATUS_FILE.name + ".tmp")
        tmp.write_text(json.dumps(public_status(pool), ensure_ascii=False, indent=2), encoding="utf-8")
        os.chmod(tmp, 0o644)
        tmp.replace(STATUS_FILE)
    except OSError as exc:
        print(f"⚠️ Không ghi được {STATUS_FILE}: {exc}", file=sys.stderr)


def publish_active(email: str) -> None:
    try:
        ACTIVE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = ACTIVE_FILE.with_name(ACTIVE_FILE.name + ".tmp")
        tmp.write_text(email + "\n", encoding="utf-8")
        os.chmod(tmp, 0o644)
        tmp.replace(ACTIVE_FILE)
    except OSError as exc:
        print(f"⚠️ Không ghi được {ACTIVE_FILE}: {exc}", file=sys.stderr)


def _find(pool: Dict[str, Any], email: str) -> Optional[Dict[str, Any]]:
    return next((a for a in pool.get("accounts", []) if a["email"].lower() == (email or "").lower()), None)


def is_free(acc: Dict[str, Any], kind: str, now: float) -> bool:
    return not acc.get("disabled") and acc["blocked"].get(kind, 0) <= now


def candidates(pool: Dict[str, Any], kind: str, now: float, exclude: str = "") -> List[Dict[str, Any]]:
    """Tài khoản còn quota loại cần dùng; ưu tiên còn cả hai loại, rồi Ultra, rồi lâu chưa dùng."""
    free = [a for a in pool.get("accounts", []) if a["email"].lower() != exclude.lower() and is_free(a, kind, now)]
    free.sort(key=lambda a: (0 if all(is_free(a, k, now) for k in KINDS) else 1,
                             0 if a.get("tier") == "ultra" else 1,
                             a.get("last_used_at", 0)))
    return free


# ---------------------------------------------------------------------------
# Antigravity: dừng, ghi phiên, khởi động
# ---------------------------------------------------------------------------

def _systemctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["systemctl", *args], capture_output=True, text=True)


def _chown_app(path: Path) -> None:
    if os.geteuid() == 0:
        shutil.chown(path, APP_USER, APP_USER)


def _write_private(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.chmod(tmp, 0o600)
    _chown_app(tmp)
    tmp.replace(path)


def write_session(payload_b64: str, token: Dict[str, Any], email: str) -> None:
    """Ghi 3 nơi Antigravity lưu phiên đăng nhập rồi đọc lại. Lỗi thì raise."""
    expiry = int(token["expiry_timestamp"])
    jetski = {
        "token": {
            "access_token": token["access_token"],
            "token_type": token.get("token_type", "Bearer"),
            "refresh_token": token["refresh_token"],
            "expiry": time.strftime("%Y-%m-%dT%H:%M:%S.000000000%z", time.localtime(expiry)),
        },
        "auth_method": "consumer",
        "id_token": token.get("id_token", ""),
    }
    # %z cho +0700; định dạng gốc có dấu hai chấm (+07:00)
    exp = jetski["token"]["expiry"]
    jetski["token"]["expiry"] = exp[:-2] + ":" + exp[-2:]
    JETSKI_TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    _write_private(JETSKI_TOKEN_PATH, json.dumps(jetski, indent=2))

    if APP_STORAGE_PATH.exists():
        storage = json.loads(APP_STORAGE_PATH.read_text(encoding="utf-8"))
        storage["jetski.onboarding.lastLoginUsername"] = email
        tmp = APP_STORAGE_PATH.with_name(APP_STORAGE_PATH.name + ".tmp")
        tmp.write_text(json.dumps(storage, indent=2), encoding="utf-8")
        _chown_app(tmp)
        tmp.replace(APP_STORAGE_PATH)

    if not VSCDB_PATH.exists():
        raise RuntimeError(f"không có {VSCDB_PATH} (Antigravity chưa đăng nhập lần nào?)")
    conn = sqlite3.connect(str(VSCDB_PATH), timeout=10)
    try:
        conn.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", (VSCDB_KEY, payload_b64))
        conn.commit()
        row = conn.execute("SELECT value FROM ItemTable WHERE key=?", (VSCDB_KEY,)).fetchone()
    finally:
        conn.close()
    if not row or row[0] != payload_b64:
        raise RuntimeError("đọc lại state.vscdb không khớp token vừa ghi")
    if json.loads(JETSKI_TOKEN_PATH.read_text(encoding="utf-8"))["token"]["access_token"] != token["access_token"]:
        raise RuntimeError("đọc lại jetski-standalone-oauth-token không khớp")


def _snapshot() -> Dict[Path, Optional[bytes]]:
    return {p: (p.read_bytes() if p.exists() else None) for p in (JETSKI_TOKEN_PATH, APP_STORAGE_PATH, VSCDB_PATH)}


def _restore(snapshot: Dict[Path, Optional[bytes]]) -> None:
    for path, data in snapshot.items():
        if data is None:
            continue
        path.write_bytes(data)
        _chown_app(path)
    if JETSKI_TOKEN_PATH.exists():
        os.chmod(JETSKI_TOKEN_PATH, 0o600)


def wait_language_server(timeout: int = LS_WAIT_SECONDS) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if subprocess.run(["pgrep", "-u", APP_USER, "-f", LS_PATTERN], capture_output=True).returncode == 0:
            return True
        time.sleep(3)
    return False


def apply_session(payload_b64: str, token: Dict[str, Any], email: str) -> None:
    """stop → ghi → kiểm tra → start. Ghi lỗi thì khôi phục phiên cũ và start lại."""
    res = _systemctl("stop", SERVICE)
    if res.returncode != 0:
        raise RuntimeError(f"không dừng được {SERVICE}: {res.stderr.strip()}")
    snapshot = _snapshot()
    try:
        write_session(payload_b64, token, email)
    except Exception:
        _restore(snapshot)
        _systemctl("reset-failed", SERVICE)
        _systemctl("start", SERVICE)
        raise
    _systemctl("reset-failed", SERVICE)
    res = _systemctl("start", SERVICE)
    if res.returncode != 0:
        raise RuntimeError(f"không khởi động được {SERVICE}: {res.stderr.strip()}")
    if not wait_language_server():
        print(f"⚠️ {SERVICE} đã start nhưng chưa thấy language_server sau {LS_WAIT_SECONDS}s", file=sys.stderr)


# ---------------------------------------------------------------------------
# Đổi tài khoản
# ---------------------------------------------------------------------------

def switch_to(pool: Dict[str, Any], acc: Dict[str, Any]) -> None:
    """Làm mới token rồi đưa tài khoản lên Antigravity. RefreshError: token hỏng."""
    new = refresh_google_access_token(pool["google_client_id"], pool["google_client_secret"], acc["refresh_token"])
    if new.get("refresh_token"):
        acc["refresh_token"] = new["refresh_token"]   # Google có thể cấp refresh_token mới
    token = {
        "access_token": new["access_token"],
        "token_type": new.get("token_type", "Bearer"),
        "refresh_token": acc["refresh_token"],
        "expiry_timestamp": int(time.time()) + int(new.get("expires_in", 3600)),
        "id_token": new.get("id_token", acc.get("id_token", "")),
    }
    payload = build_antigravity_oauth_payload(token["access_token"], token["token_type"], token["refresh_token"],
                                              token["expiry_timestamp"], token["id_token"])
    apply_session(payload, token, acc["email"])
    acc["last_used_at"] = int(time.time())
    acc.pop("access_token", None)          # không lưu access token trong pool
    acc.pop("expiry_timestamp", None)
    pool["active_email"] = acc["email"]


def try_candidates(pool: Dict[str, Any], kind: str, now: float, exclude: str = "",
                   broken: Optional[List[str]] = None) -> Optional[str]:
    """Thử lần lượt các tài khoản còn quota. Refresh hỏng → disabled (ghi vào `broken`), thử tiếp."""
    for acc in candidates(pool, kind, now, exclude):
        print(f"--> Chuyển sang {acc['email']} ({acc.get('tier', 'pro').upper()})")
        try:
            switch_to(pool, acc)
            return acc["email"]
        except RefreshError as exc:
            acc["disabled"] = True
            acc["disabled_reason"] = str(exc)[:300]
            acc["disabled_at"] = int(time.time())
            print(f"✗ {acc['email']}: {exc} — đánh dấu disabled", file=sys.stderr)
            if broken is not None:
                broken.append(acc["email"])
        finally:
            save_pool(pool)
    return None


def cmd_active(args: argparse.Namespace) -> int:
    try:
        print(load_pool().get("active_email", ""))
        return 0
    except FileNotFoundError:
        return 1


VALIDATION_MODEL = "VALIDATION_REQUIRED"  # tokmatrix-agent-quota báo khi Google trả 403 "Verify your account"


def cmd_rotate(args: argparse.Namespace) -> int:
    kind = args.kind
    now = time.time()
    broken: List[str] = []
    until = 0
    with pool_lock():
        pool = load_pool()
        active = pool.get("active_email", "")
        if args.account and active.lower() != args.account.lower():
            print(f"Tài khoản đã được đổi sang {active} (bởi bridge khác) — không xoay nữa.")
            return 0
        current = _find(pool, active)
        if current and args.model == VALIDATION_MODEL:
            # Google đòi xác minh tài khoản (403): không phải hết quota, chờ bao lâu cũng không tự hết.
            current["disabled"] = True
            current["disabled_reason"] = "Google yeu cau xac minh tai khoan (403 VALIDATION_REQUIRED) — dang nhap tay de xac minh"
            current["disabled_at"] = int(now)
            broken.append(active)
            print(f"[!] {active}: Google yêu cầu xác minh tài khoản — đánh dấu disabled.")
            save_pool(pool)
        elif current:
            until = int(args.until) if args.until else int(now + 3600)
            until = min(until, int(now + MAX_BLOCK_SECONDS))
            current["blocked"][kind] = max(current["blocked"][kind], until)
            print(f"[!] {active} hết quota {kind} ({args.model or '?'}), khoá tới {time.strftime('%H:%M', time.localtime(until))}.")
            save_pool(pool)
        try:
            switched = try_candidates(pool, kind, now, exclude=active, broken=broken)
        except Exception as exc:
            notify("critical", "\n".join([
                "🚨 <b>Đổi tài khoản Antigravity lỗi</b>",
                f"📉 {_e(active)} hết quota {KIND_LABEL.get(kind, kind)}",
                f"💬 {_e(str(exc)[:300])}",
                "Kiểm tra: <code>tokmatrix-rotator status</code>",
            ]))
            raise
        waits = [a["blocked"][kind] for a in pool["accounts"] if not a.get("disabled")]
        summary = _pool_summary(pool, kind, now)
        new_acc = _find(pool, switched) if switched else None
    head = [f"📉 <b>{_e(active)}</b> hết quota {KIND_LABEL.get(kind, kind)}"
            + (f" (<code>{_e(args.model)}</code>)" if args.model else "")]
    if until:
        head.append(f"🔒 Khoá tới {_hm(until)}")
    tail = [f"⚠️ Token hỏng, đã disable: {_e(', '.join(broken))}"] if broken else []
    if switched:
        print(f"✓ Antigravity đã chuyển sang {switched}")
        EXHAUSTED_STAMP.unlink(missing_ok=True)
        tier = (new_acc or {}).get("tier", "pro").upper()
        notify("warn" if broken else "info", "\n".join(
            ["🔄 <b>Đổi tài khoản Antigravity</b>", *head,
             f"✅ Đang dùng: <b>{_e(switched)}</b> ({_e(tier)})", summary, *tail]))
        return 0
    if waits:
        soonest = min(waits)
        print(f"✗ Không còn tài khoản nào có quota {kind}. Sớm nhất mở lại lúc "
              f"{time.strftime('%H:%M', time.localtime(soonest))}.", file=sys.stderr)
        reason = f"⏳ Sớm nhất mở lại: <b>{_hm(soonest)}</b>"
    else:
        print("✗ Mọi tài khoản đều disabled (refresh token hỏng).", file=sys.stderr)
        reason = "⛔ Mọi tài khoản đều disabled (refresh token hỏng) — cần đăng nhập lại"
    fresh = not EXHAUSTED_STAMP.exists() or now - EXHAUSTED_STAMP.stat().st_mtime > EXHAUSTED_COOLDOWN
    if fresh or broken:
        notify("critical", "\n".join(
            [f"🚨 <b>Hết tài khoản Antigravity ({KIND_LABEL.get(kind, kind)})</b>", *head, reason,
             f"Bridge {KIND_LABEL.get(kind, kind)} tạm dừng tới khi có tài khoản mở lại", summary, *tail]))
        try:
            EXHAUSTED_STAMP.parent.mkdir(parents=True, exist_ok=True)
            EXHAUSTED_STAMP.touch()
        except OSError:
            pass
    return 1


def cmd_switch(args: argparse.Namespace) -> int:
    with pool_lock():
        pool = load_pool()
        previous = pool.get("active_email", "")
        acc = _find(pool, args.email)
        if not acc:
            print(f"✗ Không tìm thấy tài khoản {args.email} trong pool.", file=sys.stderr)
            return 1
        try:
            switch_to(pool, acc)
        except RefreshError as exc:
            print(f"✗ Lỗi làm mới token: {exc}", file=sys.stderr)
            notify("warn", f"⚠️ <b>Đổi tài khoản Antigravity (tay) thất bại</b>\n👤 {_e(acc['email'])}\n"
                           f"💬 Token hỏng: {_e(str(exc)[:200])}\n↩️ Vẫn dùng: {_e(previous)}")
            return 1
        except Exception as exc:
            notify("critical", f"🚨 <b>Đổi tài khoản Antigravity (tay) lỗi</b>\n👤 {_e(acc['email'])}\n"
                               f"💬 {_e(str(exc)[:300])}")
            raise
        finally:
            save_pool(pool)
        now = time.time()
        lines = ["🔄 <b>Đổi tài khoản Antigravity (tay)</b>",
                 f"↪️ {_e(previous or '?')} → <b>{_e(acc['email'])}</b> ({_e(acc.get('tier', 'pro').upper())})",
                 _pool_summary(pool, "image", now), _pool_summary(pool, "text", now)]
    print(f"✓ Antigravity đã chuyển sang {acc['email']}")
    notify("info", "\n".join(lines))
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    pool = load_pool()
    now = time.time()
    active = pool.get("active_email", "")
    print(f"=== ANTIGRAVITY ACCOUNT POOL ({len(pool.get('accounts', []))} tài khoản) — active: {active}\n")
    print(f"{'STT':<4} {'Tier':<6} {'Email':<34} {'Ảnh':<12} {'Chữ':<12} Ghi chú")
    for idx, acc in enumerate(pool.get("accounts", []), 1):
        def cell(kind):
            until = acc["blocked"][kind]
            return f"chờ {int((until - now) / 60)}m" if until > now else "sẵn sàng"
        note = "▶ ACTIVE" if acc["email"] == active else ""
        if acc.get("disabled"):
            note = f"DISABLED: {acc.get('disabled_reason', '')[:40]}"
        print(f"{idx:<4} {acc.get('tier', 'pro').upper():<6} {acc['email']:<34} {cell('image'):<12} {cell('text'):<12} {note}")
    return 0


def cmd_reset_cooldown(args: argparse.Namespace) -> int:
    with pool_lock():
        pool = load_pool()
        count = 0
        for acc in pool.get("accounts", []):
            if args.email and acc["email"].lower() != args.email.lower():
                continue
            acc["blocked"] = {kind: 0 for kind in KINDS}
            if args.include_disabled:
                for key in ("disabled", "disabled_reason", "disabled_at"):
                    acc.pop(key, None)
            count += 1
        save_pool(pool)
    print(f"✓ Đã gỡ khoá cho {count} tài khoản.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="VPS Antigravity Account Rotator")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="Danh sách tài khoản và trạng thái quota")
    sub.add_parser("active", help="In email tài khoản đang active")
    p_rotate = sub.add_parser("rotate", help="Khoá tài khoản vừa hết quota và chuyển tài khoản")
    p_rotate.add_argument("--kind", choices=KINDS, required=True, help="image | text")
    p_rotate.add_argument("--account", default="", help="Tài khoản gây lỗi; khác active thì không xoay")
    p_rotate.add_argument("--until", type=float, default=0, help="Mốc reset quota (epoch)")
    p_rotate.add_argument("--model", default="", help="Model báo 429 (chỉ để ghi log)")
    p_switch = sub.add_parser("switch", help="Chuyển sang một tài khoản cụ thể")
    p_switch.add_argument("email")
    p_reset = sub.add_parser("reset-cooldown", help="Gỡ khoá quota")
    p_reset.add_argument("--email", default=None)
    p_reset.add_argument("--include-disabled", action="store_true", help="Gỡ cả trạng thái disabled")
    args = parser.parse_args()
    return {"status": cmd_status, "active": cmd_active, "rotate": cmd_rotate,
            "switch": cmd_switch, "reset-cooldown": cmd_reset_cooldown}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
