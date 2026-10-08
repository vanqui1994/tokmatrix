"""Khoá, mở và lưu phiên Chrome profile của từng kênh TikTok.

Mọi chỗ mở profile (đăng, lưu phiên, CLI) đi qua đây để dùng chung một binary
Chrome, một bộ tham số và một khoá theo kênh. Không bao giờ kill Chrome đang mở
tay, trừ `terminate_external_chrome` do người bấm "Lưu phiên" gọi.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import signal
import sqlite3
import subprocess
import tarfile
import threading
import time
import sys
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, Optional, Tuple

try:
    from bkt_web.db_utils import connect_db
    from bkt_web import profile_factory, vpn_manager
    from bkt_web.security import SecretStore
except ImportError:
    from db_utils import connect_db
    import profile_factory
    import vpn_manager
    from security import SecretStore

logger = logging.getLogger("profile_session")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
BACKUP_DIR = BASE_DIR / "storage" / "profile_backups"
SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")
CACHE_DIRS = ("Cache", "Code Cache", "GPUCache")
SINGLETON_FILES = ("SingletonLock", "SingletonCookie", "SingletonSocket")
# Giá trị cũ của fetch_tiktok_videos_real / fetch_tiktok_notifications_real, giữ nguyên.
LEGACY_SCAN_USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

_locks: Dict[int, threading.Lock] = {}
_guard = threading.Lock()
_busy: Dict[int, Dict[str, Any]] = {}


class ProfileBusy(Exception):
    def __init__(self, reason: str, pid: int = 0):
        self.reason, self.pid = reason, pid
        super().__init__("Profile đang bận: " + reason)


class ProfileMissing(Exception):
    pass


@contextmanager
def _db(db_path: Optional[Path] = None) -> Iterator[sqlite3.Connection]:
    # `with sqlite3.connect()` chỉ commit/rollback, không đóng kết nối.
    conn = connect_db(db_path or DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


def get_setting(key: str, default: str = "", db_path: Optional[Path] = None) -> str:
    try:
        with _db(db_path) as conn:
            row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row[0] if row else default
    except Exception:
        return default


def set_setting(key: str, value: Any, db_path: Optional[Path] = None) -> None:
    with _db(db_path) as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )
        conn.commit()


def _pdir(channel_id: int) -> Optional[Path]:
    try:
        with _db() as conn:
            row = conn.execute("SELECT profile_dir FROM channels WHERE id=?", (channel_id,)).fetchone()
        return Path(row[0]) if row and row[0] else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Khoá
# ---------------------------------------------------------------------------

def _chrome_cmdline(pid: int) -> str:
    try:
        return subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout
    except Exception:
        return ""


def external_chrome_pid(p_dir: Optional[Path]) -> int:
    """PID của Chrome đang giữ profile này, 0 nếu không có. Khoá mồ côi thì dọn."""
    if not p_dir:
        return 0
    lock = Path(p_dir) / "SingletonLock"
    if not lock.is_symlink():
        return 0
    try:
        pid = int(os.readlink(lock).rsplit("-", 1)[1])
    except (OSError, ValueError, IndexError):
        return 0
    try:
        os.kill(pid, 0)
    except OSError:
        for name in SINGLETON_FILES:
            try:
                (Path(p_dir) / name).unlink()
            except FileNotFoundError:
                pass
        return 0
    cmd = _chrome_cmdline(pid)
    return pid if str(p_dir) in cmd and "chrome" in cmd.lower() else 0


def terminate_external_chrome(p_dir: Path, timeout: float = 5.0) -> bool:
    """Đóng êm Chrome đang mở tay của đúng profile này. True nếu profile đã rảnh."""
    pid = external_chrome_pid(p_dir)
    if not pid:
        return True
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return external_chrome_pid(p_dir) == 0
    deadline = time.time() + timeout
    while time.time() < deadline:
        if external_chrome_pid(p_dir) == 0:
            return True
        time.sleep(0.25)
    return False


@contextmanager
def acquire(channel_id: int, owner: str):
    with _guard:
        lock = _locks.setdefault(int(channel_id), threading.Lock())
    if not lock.acquire(blocking=False):
        raise ProfileBusy("in_process")
    try:
        pid = external_chrome_pid(_pdir(channel_id))
        if pid:
            raise ProfileBusy("external_chrome", pid)
        with _guard:
            _busy[int(channel_id)] = {"owner": owner, "started_at": int(time.time())}
        yield
    finally:
        with _guard:
            _busy.pop(int(channel_id), None)
        lock.release()


def busy_channels() -> Dict[int, Dict[str, Any]]:
    with _guard:
        return {k: dict(v) for k, v in _busy.items()}


# ---------------------------------------------------------------------------
# Mở profile, cookie
# ---------------------------------------------------------------------------

def _locale_for(country: str) -> str:
    try:
        from bkt_web.tiktok_publisher import COUNTRY_LOCALES
    except ImportError:
        from tiktok_publisher import COUNTRY_LOCALES
    return COUNTRY_LOCALES.get((country or "").strip().upper(), "en-US")


# Màn hình phổ biến của máy bàn / laptop: mỗi kênh một cấu hình cố định (theo id), để ~250 profile trên cùng một VPS
# không cùng độ phân giải / số nhân / RAM (owner 08/10: 41 acc bị bóp phân phối, TikTok dễ gom các profile giống hệt).
DEVICE_SCREENS = ((1366, 768), (1440, 900), (1536, 864), (1600, 900), (1680, 1050), (1920, 1080), (1280, 800), (1280, 720),
                  (1600, 1000), (1920, 1200))
DEVICE_CORES = (4, 6, 8, 8, 12, 16)
DEVICE_MEMORY = (4, 8, 8, 16)


def device_for(channel_id: Any) -> Dict[str, Any]:
    """Thiết bị cố định của kênh: màn hình, cửa sổ (trừ thanh tab/địa chỉ, thanh tác vụ), số nhân, RAM."""
    import hashlib
    h = hashlib.sha256(f"device|{channel_id}".encode()).digest()
    sw, sh = DEVICE_SCREENS[h[0] % len(DEVICE_SCREENS)]
    return {"screen": {"width": sw, "height": sh}, "viewport": {"width": sw, "height": sh - 85 - (h[1] % 3) * 12},
            "cores": DEVICE_CORES[h[2] % len(DEVICE_CORES)], "memory": DEVICE_MEMORY[h[3] % len(DEVICE_MEMORY)]}


def device_init_script(device: Dict[str, Any]) -> str:
    return ("Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get:()=>%d,configurable:true});"
            "Object.defineProperty(Navigator.prototype,'deviceMemory',{get:()=>%d,configurable:true});") % (device["cores"], device["memory"])


def linux_user_agent(version: str = "120.0.0.0") -> str:
    """User-Agent khớp máy thật (Chrome trên Linux): trước đây lượt quét khai Mac trong khi lượt đăng là Chrome Linux
    trên cùng cookie + IP — TikTok thấy một phiên đổi thiết bị liên tục."""
    major = (version or "120").split(".")[0]
    return f"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36"


def launch_kwargs(cfg: Dict[str, Any], socks_port: Any = None, headless: bool = False,
                  locale: str = "", channel_id: Any = None) -> Dict[str, Any]:
    device = device_for(channel_id) if channel_id is not None else None
    kw: Dict[str, Any] = {
        "headless": headless,
        "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox",
                 "--disk-cache-size=52428800"] + profile_factory.chrome_launch_args(cfg),
        "viewport": device["viewport"] if device else {"width": 1440, "height": 900},
    }
    if device:
        kw["screen"] = device["screen"]
    exe = getattr(vpn_manager, "CHROME_EXEC_PATH", "")
    if exe and os.path.exists(exe):
        kw["executable_path"] = exe
    if socks_port:
        kw["proxy"] = {"server": f"socks5://127.0.0.1:{socks_port}"}
    if locale:
        kw["locale"] = locale
    if cfg.get("timezone"):
        kw["timezone_id"] = cfg["timezone"]
    if cfg.get("latitude") is not None and cfg.get("longitude") is not None:
        kw["geolocation"] = {
            "latitude": float(cfg["latitude"]),
            "longitude": float(cfg["longitude"]),
            "accuracy": float(cfg.get("accuracy", 60)),
        }
        kw["permissions"] = ["geolocation"]
    return kw


async def open_context(playwright, channel_id: int, socks_port: Any = None, headless: bool = False,
                       inject_db_cookie: bool = True) -> Tuple[Any, Dict[str, Any]]:
    """Mở persistent context của kênh.

    inject_db_cookie=False dùng cho "Lưu phiên": profile vừa được đăng nhập tay,
    bơm cookie DB (đã chết) vào sẽ đè mất phiên mới.
    """
    p_dir = _pdir(channel_id)
    if not p_dir or not p_dir.is_dir():
        raise ProfileMissing(channel_id)
    with _db() as conn:
        row = conn.execute("SELECT cookie, country, vpn_location FROM channels WHERE id=?", (channel_id,)).fetchone()
    if not row:
        raise ProfileMissing(channel_id)
    stored_cookie, country, vpn_location = row
    meta = profile_factory.read_profile_meta(p_dir) or profile_factory.resolve_profile_config(country or "", vpn_location or "")
    backup_once(channel_id, p_dir)
    context = await playwright.chromium.launch_persistent_context(
        str(p_dir), **launch_kwargs(meta, socks_port, headless, _locale_for(country or ""), channel_id=channel_id)
    )
    await context.add_init_script(device_init_script(device_for(channel_id)))
    source = "profile"
    plain = SECRET_STORE.decrypt(stored_cookie or "")
    # Hash cookie DB khác lần đồng bộ cuối = người vừa nhập cookie mới từ ngoài → DB thắng.
    if inject_db_cookie and plain and SECRET_STORE.fingerprint(plain) != meta.get("cookie_synced_hash"):
        await context.add_cookies(vpn_manager.build_persistent_cookie_list(plain))
        source = "db"
    return context, {"cookie_source": source, "profile_dir": str(p_dir)}


async def write_back(channel_id: int, context) -> bool:
    """Ghi cookie TikTok hiện tại của profile về DB. Chỉ ghi khi có sessionid."""
    cookies = [c for c in await context.cookies() if "tiktok.com" in (c.get("domain") or "")]
    if not any(c.get("name") == "sessionid" and c.get("value") for c in cookies):
        return False
    plain = "; ".join(f"{c['name']}={c.get('value', '')}" for c in cookies)
    with _db() as conn:
        old = conn.execute("SELECT cookie FROM channels WHERE id=?", (channel_id,)).fetchone()
        if old is None:
            return False
        if SECRET_STORE.decrypt(old[0] or "") != plain:
            try:
                conn.execute(
                    "UPDATE channels SET cookie=?, cookie_hash=? WHERE id=?",
                    (SECRET_STORE.encrypt(plain), SECRET_STORE.fingerprint(plain), channel_id),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                # cookie_hash là khoá duy nhất: cookie này đã thuộc một kênh khác.
                logger.warning("write_back #%s: cookie trùng với kênh khác, không ghi", channel_id)
                return False
    p_dir = _pdir(channel_id)
    if p_dir and p_dir.is_dir():
        meta = profile_factory.read_profile_meta(p_dir) or {}
        meta.update(cookie_synced_hash=SECRET_STORE.fingerprint(plain), cookie_synced_at=int(time.time()))
        profile_factory.write_profile_meta(p_dir, meta)
    return True


def mark_session(channel_id: int, state: str, source: str) -> None:
    now = int(time.time())
    with _db() as conn:
        old = conn.execute("SELECT session_state FROM channels WHERE id=?", (channel_id,)).fetchone()
        conn.execute("UPDATE channels SET session_state=?, session_checked_at=? WHERE id=?", (state, now, channel_id))
        if not old or old[0] != state:
            conn.execute(
                "INSERT INTO channel_session_events(channel_id, state, source, created_at) VALUES(?,?,?,?)",
                (channel_id, state, source, now),
            )
        conn.commit()


async def is_logged_out(page) -> bool:
    url = (getattr(page, "url", "") or "").lower()
    if "/login" in url or "passport" in url:
        return True
    for sel in ('input[name="username"]', '[data-e2e="login-modal"]'):
        try:
            if await page.query_selector(sel):
                return True
        except Exception:
            pass
    return False


# ---------------------------------------------------------------------------
# Trình duyệt cho các lượt quét (video, thông báo, keeper)
# ---------------------------------------------------------------------------

def scan_headless() -> bool:
    """Linux có DISPLAY (Xvfb trên VPS) → hiện hình; Mac → ẩn để không bật cửa sổ lên máy người dùng."""
    forced = os.environ.get("TOKMATRIX_SCAN_HEADLESS", "").strip().lower()
    if forced in {"1", "true", "yes"}:
        return True
    if forced in {"0", "false", "no"}:
        return False
    if sys.platform.startswith("linux"):
        return not bool(os.environ.get("DISPLAY"))
    return True


@asynccontextmanager
async def scan_context(playwright, channel_id: Optional[int], socks_port: Any,
                       cookie_list: Optional[list] = None, owner: str = "scan"):
    """Context cho một lượt quét chỉ đọc. Yield (context, mode) với mode 'profile' | 'clean'.

    Kênh có profile → dùng profile (ném ProfileBusy nếu đang bận, người gọi bỏ qua lượt
    quét), cuối phiên ghi ngược cookie. Không có profile → Chromium sạch + bơm cookie như cũ.
    """
    headless = scan_headless()
    p_dir = _pdir(channel_id) if channel_id else None
    if p_dir and p_dir.is_dir():
        with acquire(channel_id, owner):
            context, _ = await open_context(playwright, channel_id, socks_port, headless)
            try:
                yield context, "profile"
            finally:
                try:
                    await write_back(channel_id, context)
                except Exception as exc:
                    logger.warning("scan #%s: không ghi ngược cookie (%s)", channel_id, exc)
                await context.close()
        return

    # Đường sạch giữ nguyên cấu hình cũ của hai hàm quét (ẩn, User-Agent cố định).
    kwargs: Dict[str, Any] = {
        "headless": True,
        "args": ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
                + profile_factory.chrome_launch_args({}),
    }
    exe = getattr(vpn_manager, "CHROME_EXEC_PATH", "")
    if exe and os.path.exists(exe):
        kwargs["executable_path"] = exe
    browser = await playwright.chromium.launch(**kwargs)
    try:
        device = device_for(channel_id) if channel_id is not None else None
        ctx_kwargs: Dict[str, Any] = {
            # Cùng "máy" với lượt đăng: Chrome Linux đúng phiên bản, màn hình của kênh (trước: UA Mac cố định).
            "user_agent": linux_user_agent(browser.version),
            "viewport": device["viewport"] if device else {"width": 1280, "height": 800},
        }
        if device:
            ctx_kwargs["screen"] = device["screen"]
        if socks_port:
            ctx_kwargs["proxy"] = {"server": f"socks5://127.0.0.1:{socks_port}"}
        context = await browser.new_context(**ctx_kwargs)
        if device:
            await context.add_init_script(device_init_script(device))
        if cookie_list:
            await context.add_cookies(cookie_list)
        yield context, "clean"
    finally:
        try:
            await browser.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Sao lưu, bảo trì
# ---------------------------------------------------------------------------

def _backup_path(channel_id: int) -> Path:
    return BACKUP_DIR / f"channel_{channel_id}.tgz"


def backup_once(channel_id: int, p_dir: Path, force: bool = False) -> Path:
    out = _backup_path(channel_id)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and not force:
        return out
    tmp = out.with_suffix(".tgz.part")
    with tarfile.open(tmp, "w:gz") as tf:
        for root, dirs, files in os.walk(p_dir):
            dirs[:] = [d for d in dirs if d not in CACHE_DIRS]
            for name in files:
                if name.startswith("Singleton"):
                    continue
                full = Path(root) / name
                try:
                    tf.add(full, arcname=str(full.relative_to(p_dir)))
                except (FileNotFoundError, PermissionError):
                    continue  # Chrome xoá file tạm giữa chừng
    tmp.replace(out)
    return out


def _dir_size(path: Path) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def clean_caches(p_dir: Path) -> int:
    """Xoá cache của Chrome, trả số byte giải phóng. Không đụng Cookies/Local Storage/IndexedDB."""
    freed = 0
    for name in CACHE_DIRS:
        target = Path(p_dir) / "Default" / name
        if target.is_dir():
            freed += _dir_size(target)
            shutil.rmtree(target, ignore_errors=True)
    return freed


def restore_backup(channel_id: int) -> Path:
    p_dir = _pdir(channel_id)
    backup = _backup_path(channel_id)
    if not p_dir or not backup.exists():
        raise FileNotFoundError("Không có profile hoặc bản sao lưu")
    old = p_dir.with_name(p_dir.name + f".before-restore-{int(time.time())}")
    if p_dir.exists():
        p_dir.rename(old)
    p_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(backup, "r:gz") as tf:
        try:
            tf.extractall(p_dir, filter="data")
        except TypeError:  # Python < 3.12 chưa có filter
            tf.extractall(p_dir)
    return old


def _cli() -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Bảo trì Chrome profile TikTok")
    ap.add_argument("--status", nargs="?", const="all", help="id kênh, bỏ trống = tất cả")
    ap.add_argument("--backup", type=int, help="tạo lại bản sao lưu (ghi đè)")
    ap.add_argument("--restore", type=int)
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--clean-caches", help="id kênh hoặc 'all'")
    a = ap.parse_args()

    if a.restore:
        if not a.yes:
            print("Từ chối: --restore cần --yes")
            return 2
        pid = external_chrome_pid(_pdir(a.restore))
        if pid:
            print(f"Profile đang bận bởi PID {pid}")
            return 2
        print(f"Đã khôi phục, giữ bản cũ tại {restore_backup(a.restore)}")
        return 0
    if a.backup:
        p_dir = _pdir(a.backup)
        if not p_dir or not p_dir.is_dir():
            print("Kênh chưa có profile")
            return 2
        if external_chrome_pid(p_dir):
            print("Profile đang mở — đóng Chrome rồi chạy lại")
            return 2
        print(backup_once(a.backup, p_dir, force=True))
        return 0
    if a.clean_caches:
        if a.clean_caches == "all":
            with _db() as conn:
                ids = [r[0] for r in conn.execute("SELECT id FROM channels WHERE COALESCE(profile_dir,'')<>''")]
        else:
            ids = [int(a.clean_caches)]
        total = 0
        for cid in ids:
            p_dir = _pdir(cid)
            if not p_dir or not p_dir.is_dir():
                continue
            if external_chrome_pid(p_dir):
                print(f"Bỏ qua #{cid}: đang mở")
                continue
            freed = clean_caches(p_dir)
            total += freed
            print(f"Đã dọn #{cid}: {freed / 1048576:.1f} MB")
        print(f"Tổng giải phóng {total / 1048576:.1f} MB")
        return 0

    with _db() as conn:
        if a.status and a.status != "all":
            rows = conn.execute("SELECT id, COALESCE(session_state,'') FROM channels WHERE id=?", (int(a.status),)).fetchall()
        else:
            rows = conn.execute("SELECT id, COALESCE(session_state,'') FROM channels ORDER BY id").fetchall()
    for cid, state in rows:
        p_dir = _pdir(cid)
        print(json.dumps({
            "channel_id": cid,
            "profile_dir": str(p_dir or ""),
            "size_mb": round(_dir_size(p_dir) / 1048576, 1) if p_dir and p_dir.is_dir() else 0,
            "session_state": state,
            "busy": bool(external_chrome_pid(p_dir)),
            "backup": _backup_path(cid).exists(),
        }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
