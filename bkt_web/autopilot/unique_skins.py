"""1 skin = 1 tài khoản, tự động (owner 07/10/2026).

Mỗi cycle: danh sách kênh Matrix đang gắn tài khoản TikTok (autopilot_channel_map) trừ tài khoản remake (YouTube Story
Remake, Kuaishou → Muse, Kuaishou → vector) được ghi vào compare_studio/config/unique_skin_accounts.txt; nếu danh sách
đổi hoặc có kênh chưa có bố cục riêng, `tools/assign-unique-skins.mjs --global --apply` gán lại (mỗi kênh một engine + một
variant×composition không kênh nào khác dùng, kênh ngoài danh sách bỏ skin), kiểm config rồi đồng bộ vào DB Matrix.
Hết bố cục cho một kênh → báo Telegram, kênh đó giữ nguyên (cần thêm variant). Tắt bằng config `unique_skins=false`.
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Set

from . import store

ACCOUNTS_FILE = store.COMPARE_DIR / "config" / "unique_skin_accounts.txt"
WATCH_FILE = store.COMPARE_DIR / ".runtime" / "story-remake" / "watch.json"
STORAGE = store.BKT_DIR / "storage"
HEADER = ("# Kênh Matrix đang gắn tài khoản TikTok (autopilot_channel_map), trừ tài khoản remake YouTube/Kuaishou.\n"
          "# Ghi tự động bởi bkt_web/autopilot/unique_skins.py mỗi cycle; mỗi kênh có một bố cục không kênh nào khác dùng.\n")


def remake_accounts() -> Set[int]:
    """Tài khoản TikTok đang nhận video remake (YouTube Shorts, Kuaishou → Muse, Kuaishou → vector)."""
    out: Set[int] = set()
    try:
        data = json.loads(WATCH_FILE.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else data.get("channels", [])
        out |= {int(c["account_id"]) for c in items if c.get("account_id")}
    except (OSError, ValueError):
        pass
    for db in ("muse_remake.db", "kuaishou_vector.db"):
        path = STORAGE / db
        if not path.exists():
            continue
        try:
            with sqlite3.connect(str(path), timeout=30) as c:
                out |= {int(r[0]) for r in c.execute("SELECT channel_id FROM sources WHERE channel_id IS NOT NULL")}
        except sqlite3.Error:
            pass
    return out


def wanted_channels() -> List[str]:
    remake = remake_accounts()
    conn = store.adb()
    try:
        rows = conn.execute("SELECT matrix_channel_id, tiktok_channel_id FROM autopilot_channel_map").fetchall()
    finally:
        conn.close()
    return sorted(str(mid) for mid, tid in rows if int(tid) not in remake)


def _current() -> List[str]:
    if not ACCOUNTS_FILE.exists():
        return []
    return sorted(l.strip().split()[0] for l in ACCOUNTS_FILE.read_text(encoding="utf-8").splitlines()
                  if l.strip() and not l.startswith("#"))


def _tool(*args: str, timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(["node", "tools/assign-unique-skins.mjs", "--global", *args], cwd=str(store.COMPARE_DIR),
                          capture_output=True, text=True, timeout=timeout)


def _plan() -> Dict[str, Any]:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        out = Path(tmp.name)
    try:
        run = _tool("--json", str(out))
        if not out.exists() or not out.stat().st_size:
            raise RuntimeError(f"assign-unique-skins: {(run.stderr or run.stdout)[-400:]}")
        return json.loads(out.read_text(encoding="utf-8"))
    finally:
        out.unlink(missing_ok=True)


CHANNEL_DIR = store.COMPARE_DIR / "config" / "channels"


def _snapshot() -> Dict[str, bytes]:
    return {p.name: p.read_bytes() for p in CHANNEL_DIR.glob("*.yaml")}


def _restore(snapshot: Dict[str, bytes]) -> None:
    for name, data in snapshot.items():
        path = CHANNEL_DIR / name
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)


def ensure() -> Dict[str, Any]:
    if not store.get_bool("unique_skins"):
        return {"skipped": "off"}
    wanted = wanted_channels()
    list_changed = wanted != _current()
    if list_changed:
        ACCOUNTS_FILE.write_text(HEADER + "".join(f"{cid}\n" for cid in wanted), encoding="utf-8")
    plan = _plan()
    pending = [r for r in plan["rows"] if r.get("status") in ("change", "unskin")]
    missing = [r["channel_id"] for r in plan["rows"] if r.get("status") == "no_slot"]
    if missing:
        try:
            from .. import notify
            notify.emit("unique_skins_no_slot", f"⚠️ Hết bố cục riêng cho {len(missing)} kênh: {', '.join(missing[:10])} — cần thêm variant",
                        "warn", dedupe_key="unique_skins:" + ",".join(missing), cooldown=86400)
        except Exception:  # thông báo không được chặn cycle
            pass
        store.log_event(f"⚠️ 1 skin = 1 acc: hết bố cục cho {', '.join(missing)}", "warn")
    if not pending and not plan.get("violations") and not plan.get("duplicates"):
        return {"accounts": len(wanted), "list_changed": list_changed, "changed": 0, "no_slot": missing}
    # Kênh hết bố cục giữ skin cũ; mọi kênh khác vẫn được gán ngay (trước 07/10 thiếu một chỗ là không gán gì, 6 kênh
    # geopolitics mới ở lại template chung). Config được chép ra trước, validator lỗi → trả lại nguyên trạng.
    backup = _snapshot()
    run = _tool("--apply", "--allow-missing")
    if run.returncode:
        _restore(backup)
        raise RuntimeError(f"assign-unique-skins --apply: {(run.stderr or run.stdout)[-400:]}")
    check = subprocess.run(["node", "tools/validate-matrix-config.mjs"], cwd=str(store.COMPARE_DIR),
                           capture_output=True, text=True, timeout=300)
    if check.returncode:
        _restore(backup)
        raise RuntimeError(f"config không hợp lệ sau khi gán skin: {(check.stdout + check.stderr)[-600:]}")
    from ..matrix_config import sync_channel_configs
    synced = asyncio.run(sync_channel_configs())
    store.log_event(f"🎨 1 skin = 1 acc: gán lại {len(pending)} kênh ({', '.join(r['channel_id'] for r in pending[:8])})")
    return {"accounts": len(wanted), "changed": len(pending), "synced": synced.get("synced"), "no_slot": missing}
