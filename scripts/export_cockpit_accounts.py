#!/usr/bin/env python3
"""Trích xuất 7 tài khoản Antigravity (1 Ultra + 6 Pro) từ Cockpit Tools trên Mac

Đọc thư mục ~/.antigravity_cockpit/, giải mã token bằng secure-account-storage.key,
và xuất ra file deploy/antigravity_accounts_pool.json để đưa lên VPS.
"""

from __future__ import annotations

import base64
import glob
import json
import os
import sys
import time
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("Cần cài cryptography: pip install cryptography", file=sys.stderr)
    sys.exit(1)

COCKPIT_DIR = Path(os.path.expanduser("~/.antigravity_cockpit"))
KEY_FILE = COCKPIT_DIR / "secure-account-storage.key"
ACCOUNTS_DIR = COCKPIT_DIR / "accounts"
OUTPUT_FILE = Path(__file__).resolve().parent.parent / "deploy" / "antigravity_accounts_pool.json"


def decrypt_account(key_bytes: bytes, file_path: Path) -> dict | None:
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        nonce = base64.b64decode(data["nonce"])
        ciphertext = base64.b64decode(data["ciphertext"])
        aesgcm = AESGCM(key_bytes)
        decrypted_raw = aesgcm.decrypt(nonce, ciphertext, None)
        return json.loads(decrypted_raw.decode("utf-8"))
    except Exception as exc:
        print(f"  [!] Lỗi giải mã {file_path.name}: {exc}", file=sys.stderr)
        return None


def main() -> int:
    if not KEY_FILE.exists():
        print(f"✗ Không tìm thấy key tại: {KEY_FILE}", file=sys.stderr)
        return 1

    if not ACCOUNTS_DIR.exists():
        print(f"✗ Không tìm thấy thư mục accounts tại: {ACCOUNTS_DIR}", file=sys.stderr)
        return 1

    key_b64 = KEY_FILE.read_text(encoding="utf-8").strip()
    key_bytes = base64.b64decode(key_b64)

    account_files = sorted(glob.glob(str(ACCOUNTS_DIR / "*.json")))
    if not account_files:
        print("✗ Không có file tài khoản nào trong thư mục.", file=sys.stderr)
        return 1

    accounts = []
    for f in account_files:
        parsed = decrypt_account(key_bytes, Path(f))
        if not parsed:
            continue
        email = parsed.get("email", "")
        tok = parsed.get("token", {})
        ref_token = tok.get("refresh_token")
        if not ref_token:
            continue

        quota = parsed.get("quota", {})
        sub_tier = str(quota.get("subscription_tier", "")).lower()
        if "ultra" in sub_tier or "ultra" in email.lower() or email in ("tuantmvfa@gmail.com", "isiee.acadept@gmail.com"):
            tier = "ultra"
        else:
            tier = "pro"
        accounts.append({
            "id": parsed.get("id"),
            "email": email,
            "name": parsed.get("name", email),
            "tier": tier,
            "refresh_token": ref_token,
            "access_token": tok.get("access_token", ""),
            "id_token": tok.get("id_token", ""),
            "token_type": tok.get("token_type", "Bearer"),
            "expiry_timestamp": tok.get("expiry_timestamp", 0),
            "blocked_until": 0,
            "last_used_at": 0,
        })

    # Sắp xếp: Ưu tiên Ultra lên đầu, sau đó đến các acc Pro
    accounts.sort(key=lambda a: (0 if a["tier"] == "ultra" else 1, a["email"]))

    if not accounts:
        print("✗ Không trích xuất được tài khoản nào có refresh_token hợp lệ.", file=sys.stderr)
        return 1

    pool_data = {
        "version": "1.0",
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "active_email": accounts[0]["email"],
        "google_client_id": "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
        "google_client_secret": "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",
        "accounts": accounts,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(pool_data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"✓ Đã trích xuất thành công {len(accounts)} tài khoản vào:")
    print(f"  --> {OUTPUT_FILE}\n")
    print("Danh sách tài khoản trong Pool:")
    for idx, a in enumerate(accounts, 1):
        tier_tag = "⭐ ULTRA" if a["tier"] == "ultra" else "   PRO "
        print(f"  {idx}. [{tier_tag}] {a['email']} ({a['name']})")

    print("\nBước tiếp theo: Copy file này lên VPS bằng lệnh:")
    print(f"  scp {OUTPUT_FILE} root@<IP_VPS>:/opt/tokmatrix/deploy/antigravity_accounts_pool.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
