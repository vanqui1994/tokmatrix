#!/usr/bin/env python3
"""Sync Antigravity accounts from VPS pool into local Cockpit Tools (~/.antigravity_cockpit).

Workflow:
1. Đọc VPS_CREDENTIALS.md hoặc dùng SSH alias 'tokmatrix' để lấy pool mới nhất từ VPS.
2. Sao lưu an toàn ~/.antigravity_cockpit/accounts.json và thư mục accounts/.
3. Làm mới OAuth access_token / id_token cho từng tài khoản qua Google OAuth.
4. Mã hoá từng tài khoản bằng AES-GCM với secure-account-storage.key của Cockpit Tools.
5. Ghi vào ~/.antigravity_cockpit/accounts/<id>.json và cập nhật accounts.json.
6. Tự động khởi động lại Cockpit Tools.app để nạp đầy đủ danh sách tài khoản.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("Cần cài đặt cryptography: pip install cryptography", file=sys.stderr)
    sys.exit(1)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOCAL_POOL_FILE = PROJECT_ROOT / "deploy" / "antigravity_accounts_pool.json"
COCKPIT_DIR = Path(os.path.expanduser("~/.antigravity_cockpit"))
KEY_FILE = COCKPIT_DIR / "secure-account-storage.key"
ACCOUNTS_DIR = COCKPIT_DIR / "accounts"
ACCOUNTS_INDEX = COCKPIT_DIR / "accounts.json"
BACKUPS_DIR = COCKPIT_DIR / "backups"

OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"


def sync_pool_from_vps() -> bool:
    """Tải /etc/tokmatrix/antigravity_accounts_pool.json từ VPS về deploy/."""
    print("==> 1. Đồng bộ pool tài khoản từ VPS (tokmatrix:/etc/tokmatrix/antigravity_accounts_pool.json)...")
    cmd = ["scp", "-o", "ConnectTimeout=10", "tokmatrix:/etc/tokmatrix/antigravity_accounts_pool.json", str(LOCAL_POOL_FILE)]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if res.returncode == 0 and LOCAL_POOL_FILE.exists():
            print(f"    ✓ Đã tải pool mới nhất từ VPS về: {LOCAL_POOL_FILE}")
            return True
        else:
            print(f"    [!] Cảnh báo: Không thể tải từ VPS qua SSH ({res.stderr.strip()}).")
            if LOCAL_POOL_FILE.exists():
                print(f"    -> Dùng pool hiện có tại local: {LOCAL_POOL_FILE}")
                return True
            return False
    except Exception as exc:
        print(f"    [!] Lỗi khi scp từ VPS: {exc}")
        if LOCAL_POOL_FILE.exists():
            print(f"    -> Dùng pool hiện có tại local: {LOCAL_POOL_FILE}")
            return True
        return False


def backup_local_cockpit() -> Path:
    """Sao lưu thư mục và file accounts hiện tại."""
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = BACKUPS_DIR / f"cockpit_sync_backup_{ts}"
    backup_path.mkdir(parents=True, exist_ok=True)
    
    if ACCOUNTS_INDEX.exists():
        shutil.copy2(ACCOUNTS_INDEX, backup_path / "accounts.json")
    if ACCOUNTS_DIR.exists():
        shutil.copytree(ACCOUNTS_DIR, backup_path / "accounts", dirs_exist_ok=True)
        
    print(f"==> 2. Đã sao lưu dữ liệu Cockpit hiện tại vào:")
    print(f"    {backup_path}")
    return backup_path


def is_cockpit_running() -> bool:
    res = subprocess.run(["pgrep", "-f", "Cockpit Tools.app"], capture_output=True)
    return res.returncode == 0


def quit_cockpit_tools() -> None:
    if is_cockpit_running():
        print("==> Đang đóng Cockpit Tools.app để cập nhật file cấu hình...")
        subprocess.run(["osascript", "-e", 'quit app "Cockpit Tools"'], capture_output=True)
        for _ in range(10):
            time.sleep(0.5)
            if not is_cockpit_running():
                break
        if is_cockpit_running():
            subprocess.run(["pkill", "-f", "cockpit-tools"], capture_output=True)
            time.sleep(1)


def restart_cockpit_tools() -> None:
    print("==> Khởi động lại Cockpit Tools.app...")
    subprocess.run(["open", "-a", "Cockpit Tools"])


def refresh_google_token(client_id: str, client_secret: str, refresh_token: str) -> dict | None:
    """Làm mới Google OAuth access token."""
    req_data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token"
    }).encode("utf-8")
    req = urllib.request.Request(OAUTH_TOKEN_URL, data=req_data)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"      [!] Lỗi refresh token: {exc}", file=sys.stderr)
        return None


def parse_jwt_payload(token_str: str) -> dict:
    try:
        parts = token_str.split(".")
        if len(parts) >= 2:
            padding = "=" * (4 - len(parts[1]) % 4)
            return json.loads(base64.b64decode(parts[1] + padding).decode("utf-8"))
    except Exception:
        pass
    return {}


def main() -> int:
    if not KEY_FILE.exists():
        print(f"✗ Không tìm thấy key mã hoá tại: {KEY_FILE}", file=sys.stderr)
        return 1

    # 1. Tải pool từ VPS
    if not sync_pool_from_vps():
        print("✗ Không có file pool để sync.", file=sys.stderr)
        return 1

    # 2. Đọc key mã hoá
    key_b64 = KEY_FILE.read_text(encoding="utf-8").strip()
    key_bytes = base64.b64decode(key_b64)
    aesgcm = AESGCM(key_bytes)

    # 3. Đọc dữ liệu pool
    pool_data = json.loads(LOCAL_POOL_FILE.read_text(encoding="utf-8"))
    client_id = pool_data.get("google_client_id")
    client_secret = pool_data.get("google_client_secret")
    pool_accounts = pool_data.get("accounts", [])
    active_email = pool_data.get("active_email", "")

    if not pool_accounts:
        print("✗ Danh sách tài khoản trong pool trống.", file=sys.stderr)
        return 1

    print(f"==> Tìm thấy {len(pool_accounts)} tài khoản trong pool.")

    # 4. Đọc các tài khoản hiện có trong Cockpit để giữ lại ID/quota nếu có
    ACCOUNTS_DIR.mkdir(parents=True, exist_ok=True)
    existing_by_email: dict[str, dict] = {}
    for f in ACCOUNTS_DIR.glob("*.json"):
        if f.name.endswith(".bak"):
            continue
        try:
            raw_meta = json.loads(f.read_text(encoding="utf-8"))
            nonce = base64.b64decode(raw_meta["nonce"])
            ciphertext = base64.b64decode(raw_meta["ciphertext"])
            decrypted = json.loads(aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8"))
            em = decrypted.get("email", "").lower().strip()
            if em:
                existing_by_email[em] = {
                    "file": f,
                    "data": decrypted,
                }
        except Exception as exc:
            print(f"    [!] Bỏ qua file lỗi {f.name}: {exc}")

    # 5. Sao lưu
    backup_local_cockpit()

    # 6. Đóng Cockpit Tools nếu đang chạy
    cockpit_was_running = is_cockpit_running()
    if cockpit_was_running:
        quit_cockpit_tools()

    # 7. Xử lý từng tài khoản
    print(f"\n==> 3. Tiến hành làm mới token và mã hoá vào Cockpit Tools:")
    synced_accounts = []
    active_account_id = None
    now_ts = int(time.time())

    template_models = []
    for item in existing_by_email.values():
        mods = item["data"].get("quota", {}).get("models", [])
        if mods:
            template_models = mods
            break

    for idx, acc in enumerate(pool_accounts, 1):
        email = acc.get("email", "").strip()
        ref_token = acc.get("refresh_token", "").strip()
        tier = acc.get("tier", "pro").lower()
        sub_tier = "g1-ultra-tier" if tier == "ultra" else "g1-pro-tier"
        tag = "⭐ ULTRA" if tier == "ultra" else "   PRO "

        print(f"    [{idx:2d}/{len(pool_accounts)}] [{tag}] {email}...", end=" ", flush=True)

        token_resp = refresh_google_token(client_id, client_secret, ref_token)
        if not token_resp:
            print("FAILED")
            continue

        access_token = token_resp.get("access_token", "")
        id_token = token_resp.get("id_token") or acc.get("id_token", "")
        expires_in = token_resp.get("expires_in", 3599)
        expiry_ts = now_ts + expires_in

        jwt_data = parse_jwt_payload(id_token)
        google_sub = jwt_data.get("sub", "")
        account_name = acc.get("name") or jwt_data.get("name") or email

        # Xác định account ID
        em_lower = email.lower()
        if em_lower in existing_by_email:
            acc_id = existing_by_email[em_lower]["data"].get("id")
            existing_obj = existing_by_email[em_lower]["data"]
            quota_obj = existing_obj.get("quota") or {}
            created_at = existing_obj.get("created_at", now_ts)
        else:
            orig_id = acc.get("id", "")
            try:
                uuid_obj = uuid.UUID(orig_id)
                acc_id = str(uuid_obj)
            except Exception:
                acc_id = str(uuid.uuid4())
            quota_obj = {
                "models": template_models,
                "last_updated": now_ts,
                "quota_summary_stale": True,
                "quota_summary_updated_at": now_ts,
                "is_forbidden": False,
                "subscription_tier": sub_tier,
                "credits": [],
                "tier_id": None,
                "is_gcp_tos": None,
                "project_id": None,
            }
            created_at = now_ts

        # Đảm bảo subscription_tier đồng bộ
        if quota_obj:
            quota_obj["subscription_tier"] = sub_tier

        account_payload = {
            "id": acc_id,
            "email": email,
            "name": account_name,
            "pending_oauth": False,
            "token": {
                "access_token": access_token,
                "refresh_token": ref_token,
                "expires_in": expires_in,
                "expiry_timestamp": expiry_ts,
                "token_type": "Bearer",
                "email": email,
                "oauth_client_key": "antigravity_enterprise",
                "id_token": id_token,
                "session_id": google_sub or str(acc_id),
            },
            "quota": quota_obj,
            "disabled": False,
            "usage_updated_at": now_ts,
            "created_at": created_at,
            "last_used": now_ts,
        }

        # Mã hoá bằng AES-GCM
        payload_bytes = json.dumps(account_payload, ensure_ascii=False).encode("utf-8")
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, payload_bytes, None)

        file_content = {
            "version": 1,
            "kind": "antigravity",
            "algorithm": "AES-256-GCM",
            "key_id": "local-secure-account-storage-v1",
            "nonce": base64.b64encode(nonce).decode("utf-8"),
            "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
            "encrypted_at": now_ts,
        }

        target_file = ACCOUNTS_DIR / f"{acc_id}.json"
        target_file.write_text(json.dumps(file_content, indent=2), encoding="utf-8")

        synced_accounts.append({
            "id": acc_id,
            "email": email,
            "name": account_name,
            "created_at": created_at,
            "last_used": now_ts,
        })

        if email == active_email or (not active_account_id and idx == 1):
            active_account_id = acc_id

        print(f"OK (ID: {acc_id[:8]}...)")

    if not synced_accounts:
        print("✗ Không có tài khoản nào được đồng bộ thành công.", file=sys.stderr)
        return 1

    if not active_account_id:
        active_account_id = synced_accounts[0]["id"]

    # 8. Cập nhật accounts.json
    index_data = {
        "version": "2.0",
        "accounts": synced_accounts,
        "current_account_id": active_account_id,
    }
    ACCOUNTS_INDEX.write_text(json.dumps(index_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n==> 4. Đã cập nhật file chỉ mục: {ACCOUNTS_INDEX}")

    # 9. Khởi động lại Cockpit Tools
    if cockpit_was_running:
        restart_cockpit_tools()

    print("\n" + "=" * 65)
    print(f"🎉 ĐỒNG BỘ THÀNH CÔNG {len(synced_accounts)} TÀI KHOẢN VÀO COCKPIT TOOLS!")
    print("=" * 65)
    for i, a in enumerate(synced_accounts, 1):
        star = " (Active)" if a["id"] == active_account_id else ""
        print(f"  {i:2d}. {a['email']} - {a['name']}{star}")
    print("=" * 65)
    return 0


if __name__ == "__main__":
    sys.exit(main())
