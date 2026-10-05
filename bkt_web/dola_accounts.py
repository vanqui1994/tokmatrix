"""Pool tài khoản Dola phía client: xoay vòng giữa nhiều gateway / API key, mỗi mục có hạn mức ngày.

Hai tầng pool:
- Gateway (browser_pool.py của dola-render-gateway) tự xoay các tài khoản Dola trong `accounts/`
  của nó, 2 video/tài khoản/ngày. Lỗi 429 "All accounts reached Dola daily video limit" /
  "Insufficient credits" nghĩa là CẢ gateway đó đã hết lượt.
- Pool ở đây xoay giữa các mục (gateway + key). Mỗi mục có `daily_limit` = số video gateway đó
  render được mỗi ngày (một tài khoản Dola → 2; gateway có N tài khoản → 2N, hoặc daily_limit của key).

Cấu hình: file JSON `DOLA_ACCOUNTS_FILE` (mặc định bkt_web/storage/dola_accounts.json, ví dụ ở
docs/dola_accounts.example.json) hoặc env `DOLA_ACCOUNTS` (cùng định dạng JSON). Không có cả hai →
một mục "default" từ DOLA_GATEWAY_BASE_URL + khoá `video.dola`/DOLA_API_KEY (như trước).

Hạn mức ngày tính theo `DOLA_LIMIT_RESET_TZ` (mặc định Asia/Tokyo, trùng gateway để hai tầng reset
cùng lúc). Không cần cron: số đếm lưu theo ngày (`day`), khoá lưu `blocked_until` = 00:00 hôm sau,
nên qua nửa đêm mọi mục tự mở lại, kể cả khi server tắt đúng lúc 00:00.

Trạng thái (bkt_channels.db): dola_account_usage(account_id, day, used) và
dola_account_state(account_id, blocked_until, block_reason, last_used_at).
Video đang chạy trên một mục (dola_tasks QUEUED/PROCESSING) được tính là đã giữ chỗ, nên không
gửi quá hạn mức khi nhiều task chạy song song.
"""

import json
import logging
import os
import sqlite3
import threading
import time
from datetime import datetime, time as dt_time, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

import httpx
from pydantic import BaseModel, Field, field_validator

try:
    from bkt_web import dola_video as dv
    from bkt_web.db_utils import connect_db
except ImportError:
    import dola_video as dv
    from db_utils import connect_db

logger = logging.getLogger("dola_accounts")

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_ACCOUNTS_FILE = BASE_DIR / "storage" / "dola_accounts.json"
DEFAULT_TZ = "Asia/Tokyo"
# Lỗi tạm (503 pool rỗng, mất kết nối, hàng chờ gateway đầy): nghỉ ngắn rồi thử lại mục đó.
SHORT_COOLDOWN = 300
# Trạng thái dola_tasks đang giữ chỗ hạn mức của một mục.
INFLIGHT = ("QUEUED", "PROCESSING", "DOWNLOADING")


class AllAccountsExhausted(dv.DolaError):
    """Mọi mục trong pool đã hết lượt hoặc đang bị khoá."""

    def __init__(self, message: str, reset_at: float):
        super().__init__(message, status_code=429)
        self.reset_at = reset_at


class DolaAccountConfig(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    base_url: str = ""
    api_key: str = ""
    api_key_env: str = ""          # đọc key từ biến môi trường này (khỏi ghi key vào file)
    admin_key: str = ""            # DOLA_ADMIN_KEY của gateway, cho trang quản trị (/api/dola/gw/...)
    admin_key_env: str = ""
    daily_limit: int = Field(default=2, ge=0, le=10000)
    enabled: bool = True

    @field_validator("base_url")
    @classmethod
    def _url(cls, v: str) -> str:
        v = v.strip().rstrip("/")
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("base_url phải bắt đầu bằng http:// hoặc https://")
        return v

    def resolved_base_url(self) -> str:
        return self.base_url or os.environ.get("DOLA_GATEWAY_BASE_URL", "http://localhost:8000").rstrip("/")

    def resolved_admin_key(self) -> str:
        """Khoá admin của gateway: mục này → env DOLA_ADMIN_KEY → Kho Khoá `video.dola_admin`; trống = tự nhập trên trang."""
        if self.admin_key:
            return self.admin_key
        if self.admin_key_env and os.environ.get(self.admin_key_env):
            return os.environ[self.admin_key_env]
        if os.environ.get("DOLA_ADMIN_KEY"):
            return os.environ["DOLA_ADMIN_KEY"]
        try:
            try:
                from bkt_web.key_vault import get_key
            except ImportError:
                from key_vault import get_key
            return get_key("video.dola_admin") or ""
        except Exception:
            return ""

    def resolved_key(self) -> str:
        if self.api_key:
            return self.api_key
        if self.api_key_env:
            return os.environ.get(self.api_key_env, "")
        return ""


class DolaAccountStatus(BaseModel):
    id: str
    base_url: str
    has_key: bool
    enabled: bool
    daily_limit: int
    used_today: int
    inflight: int
    remaining: int
    is_blocked: bool
    blocked_until: Optional[float] = None
    block_reason: str = ""
    last_used_at: Optional[float] = None
    available: bool


def load_accounts() -> List[DolaAccountConfig]:
    raw = os.environ.get("DOLA_ACCOUNTS", "").strip()
    source = "DOLA_ACCOUNTS"
    if not raw:
        path = Path(os.environ.get("DOLA_ACCOUNTS_FILE") or DEFAULT_ACCOUNTS_FILE)
        if path.is_file():
            raw, source = path.read_text(encoding="utf-8"), str(path)
    if not raw:
        key = dv._api_key()
        return [DolaAccountConfig(id="default", api_key=key)]
    data = json.loads(raw)
    items = data.get("accounts", []) if isinstance(data, dict) else data
    accounts = [DolaAccountConfig.model_validate(item) for item in items]
    ids = [a.id for a in accounts]
    if len(set(ids)) != len(ids):
        raise ValueError(f"{source}: id tài khoản bị trùng")
    if not accounts:
        raise ValueError(f"{source}: danh sách tài khoản rỗng")
    return accounts


def classify_quota_error(message: str) -> str:
    """'day' = hết lượt tới lần reset; 'short' = tạm (hàng chờ gateway đầy)."""
    text = message.lower()
    if "pending task queue" in text:
        return "short"
    return "day"


class DolaAccountManager:
    def __init__(self, db_path: Path, accounts: Optional[List[DolaAccountConfig]] = None,
                 tz: Optional[str] = None, now_fn: Callable[[], float] = time.time):
        self.db_path = Path(db_path)
        self._accounts = accounts
        self.tz = ZoneInfo(tz or os.environ.get("DOLA_LIMIT_RESET_TZ", DEFAULT_TZ))
        self.now_fn = now_fn
        self._lock = threading.Lock()
        self._init_tables()

    # -- cấu hình ---------------------------------------------------------------

    @property
    def accounts(self) -> List[DolaAccountConfig]:
        # Đọc lại mỗi lần (file nhỏ) để sửa danh sách không cần khởi động lại server.
        return self._accounts if self._accounts is not None else load_accounts()

    def get(self, account_id: str) -> Optional[DolaAccountConfig]:
        return next((a for a in self.accounts if a.id == account_id), None)

    def client_for(self, account: DolaAccountConfig, **kw) -> dv.DolaClient:
        return dv.DolaClient(base_url=account.resolved_base_url(), api_key=account.resolved_key(), **kw)

    # -- thời gian ---------------------------------------------------------------

    def day(self, ts: Optional[float] = None) -> str:
        return datetime.fromtimestamp(ts if ts is not None else self.now_fn(), self.tz).date().isoformat()

    def next_reset(self, ts: Optional[float] = None) -> float:
        now = datetime.fromtimestamp(ts if ts is not None else self.now_fn(), self.tz)
        return datetime.combine(now.date() + timedelta(days=1), dt_time.min, tzinfo=self.tz).timestamp()

    # -- DB ----------------------------------------------------------------------

    def _conn(self) -> sqlite3.Connection:
        conn = connect_db(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self) -> None:
        conn = self._conn()
        try:
            conn.execute("""CREATE TABLE IF NOT EXISTS dola_account_usage (
                account_id TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (account_id, day))""")
            conn.execute("""CREATE TABLE IF NOT EXISTS dola_account_state (
                account_id TEXT PRIMARY KEY, blocked_until REAL DEFAULT 0, block_reason TEXT DEFAULT '',
                last_used_at REAL DEFAULT 0)""")
            conn.commit()
        finally:
            conn.close()

    def _inflight(self, conn: sqlite3.Connection) -> Dict[str, int]:
        try:
            rows = conn.execute(
                f"SELECT account_id, COUNT(*) AS n FROM dola_tasks WHERE status IN ({','.join('?' * len(INFLIGHT))}) "
                "GROUP BY account_id", INFLIGHT).fetchall()
        except sqlite3.OperationalError:     # chưa có bảng dola_tasks / cột account_id
            return {}
        return {r["account_id"]: r["n"] for r in rows}

    def _snapshot(self, conn: sqlite3.Connection) -> List[DolaAccountStatus]:
        now = self.now_fn()
        day = self.day(now)
        used = {r["account_id"]: r["used"] for r in conn.execute(
            "SELECT account_id, used FROM dola_account_usage WHERE day=?", (day,))}
        state = {r["account_id"]: r for r in conn.execute("SELECT * FROM dola_account_state")}
        inflight = self._inflight(conn)
        out = []
        for acc in self.accounts:
            st = state.get(acc.id)
            until = st["blocked_until"] if st and st["blocked_until"] > now else None
            u, f = used.get(acc.id, 0), inflight.get(acc.id, 0)
            remaining = max(0, acc.daily_limit - u - f)
            out.append(DolaAccountStatus(
                id=acc.id, base_url=acc.resolved_base_url(), has_key=bool(acc.resolved_key()),
                enabled=acc.enabled, daily_limit=acc.daily_limit, used_today=u, inflight=f,
                remaining=remaining, is_blocked=until is not None, blocked_until=until,
                block_reason=(st["block_reason"] if st and until else "") or "",
                last_used_at=(st["last_used_at"] or None) if st else None,
                available=acc.enabled and until is None and remaining > 0))
        return out

    # -- API của pool ----------------------------------------------------------------

    def status(self) -> List[DolaAccountStatus]:
        conn = self._conn()
        try:
            return self._snapshot(conn)
        finally:
            conn.close()

    def get_available_account(self, exclude: Iterable[str] = ()) -> DolaAccountConfig:
        """Mục còn lượt, dùng lâu nhất chưa tới (xoay vòng). Hết cả → AllAccountsExhausted."""
        skip = set(exclude)
        with self._lock:
            snap = self.status()
        free = [s for s in snap if s.available and s.id not in skip]
        if free:
            free.sort(key=lambda s: (s.last_used_at or 0, s.id))
            return self.get(free[0].id)
        reset_at = self._earliest_reopen(snap)
        when = datetime.fromtimestamp(reset_at, self.tz).strftime("%H:%M %d/%m (%Z)")
        detail = "; ".join(f"{s.id}: {s.used_today}/{s.daily_limit}"
                           + (f" +{s.inflight} đang chạy" if s.inflight else "")
                           + (f", khoá: {s.block_reason}" if s.is_blocked else "")
                           + ("" if s.enabled else ", tắt") for s in snap)
        raise AllAccountsExhausted(f"Mọi tài khoản Dola đã hết lượt, mở lại lúc {when}. [{detail}]", reset_at)

    def _earliest_reopen(self, snap: List[DolaAccountStatus]) -> float:
        times = []
        for s in snap:
            if not s.enabled or s.daily_limit == 0:
                continue
            if s.is_blocked:
                times.append(s.blocked_until)
            elif s.inflight and s.used_today < s.daily_limit:
                times.append(self.now_fn() + 60)     # task đang chạy có thể lỗi và trả lại chỗ
            else:
                times.append(self.next_reset())
        return min(times) if times else self.next_reset()

    def touch(self, account_id: str) -> None:
        self._upsert_state(account_id, last_used_at=self.now_fn())

    def record_success(self, account_id: str) -> int:
        """Một video render xong trên mục này. Trả số đã dùng hôm nay."""
        now = self.now_fn()
        day = self.day(now)
        with self._lock:
            conn = self._conn()
            try:
                conn.execute("INSERT INTO dola_account_usage(account_id, day, used) VALUES (?, ?, 1) "
                             "ON CONFLICT(account_id, day) DO UPDATE SET used = used + 1", (account_id, day))
                used = conn.execute("SELECT used FROM dola_account_usage WHERE account_id=? AND day=?",
                                    (account_id, day)).fetchone()[0]
                conn.commit()
            finally:
                conn.close()
        self._upsert_state(account_id, last_used_at=now)
        acc = self.get(account_id)
        if acc and used >= acc.daily_limit:
            self.mark_blocked(account_id, f"Đủ {used}/{acc.daily_limit} video hôm nay")
        return used

    def mark_blocked(self, account_id: str, reason: str, until: Optional[float] = None) -> float:
        until = until if until is not None else self.next_reset()
        self._upsert_state(account_id, blocked_until=until, block_reason=reason[:300])
        logger.warning("Dola account %s khoá tới %s: %s", account_id,
                       datetime.fromtimestamp(until, self.tz).isoformat(timespec="minutes"), reason)
        return until

    def mark_cooldown(self, account_id: str, reason: str, seconds: float = SHORT_COOLDOWN) -> float:
        return self.mark_blocked(account_id, reason, until=self.now_fn() + seconds)

    def unblock(self, account_id: str) -> None:
        self._upsert_state(account_id, blocked_until=0, block_reason="")

    def reset_daily(self) -> None:
        """Gỡ mọi khoá (dùng tay). Số đếm theo ngày tự về 0 khi sang ngày mới, không cần gọi."""
        conn = self._conn()
        try:
            conn.execute("UPDATE dola_account_state SET blocked_until=0, block_reason=''")
            conn.commit()
        finally:
            conn.close()

    def _upsert_state(self, account_id: str, **fields) -> None:
        cols = ", ".join(fields)
        marks = ", ".join("?" for _ in fields)
        updates = ", ".join(f"{k}=excluded.{k}" for k in fields)
        conn = self._conn()
        try:
            conn.execute(f"INSERT INTO dola_account_state(account_id, {cols}) VALUES (?, {marks}) "
                         f"ON CONFLICT(account_id) DO UPDATE SET {updates}", (account_id, *fields.values()))
            conn.commit()
        finally:
            conn.close()

    # -- tạo task có chuyển tài khoản ----------------------------------------------------

    def submit(self, req: dv.VideoRequest, client_kw: Optional[Dict[str, Any]] = None):
        """Tạo task trên mục còn lượt; 429/503/mất kết nối → khoá mục đó, thử mục kế tiếp.

        Trả (account, VideoTask). Hết mục → AllAccountsExhausted. Lỗi tham số (422) hay lỗi mạng sau
        khi yêu cầu đã đi (gateway có thể đã nhận task) được ném ra ngay, không thử mục khác.
        """
        tried: List[str] = []
        while True:
            account = self.get_available_account(exclude=tried)
            tried.append(account.id)
            with self.client_for(account, **(client_kw or {})) as client:
                try:
                    task = client.create_task(req, quota_retries=0)
                except dv.DolaQuotaError as exc:
                    if classify_quota_error(str(exc)) == "short":
                        self.mark_cooldown(account.id, str(exc))
                    else:
                        self.mark_blocked(account.id, str(exc))
                    logger.info("Dola %s hết lượt, chuyển tài khoản: %s", account.id, exc)
                    continue
                except (dv.DolaUnavailable, httpx.ConnectError) as exc:
                    self.mark_cooldown(account.id, f"Gateway không sẵn sàng: {exc}")
                    continue
                except dv.DolaError as exc:
                    if exc.status_code == 401:
                        self.mark_blocked(account.id, f"Sai API key: {exc}", until=self.now_fn() + 3600)
                        continue
                    raise
            self.touch(account.id)
            return account, task

    def generate_video_and_wait(self, payload, timeout: Optional[float] = None,
                                on_update: Optional[Callable[[dv.VideoTask], None]] = None,
                                client_kw: Optional[Dict[str, Any]] = None):
        """Bản đồng bộ (CLI/script): submit có xoay tài khoản → poll → record_success. Trả (account_id, task)."""
        req = payload if isinstance(payload, dv.VideoRequest) else dv._validate(payload)
        account, task = self.submit(req, client_kw)
        with self.client_for(account, **(client_kw or {})) as client:
            done = client.wait_for_task(task.id, timeout or client.timeout or req.default_timeout(),
                                        on_update=on_update)
        self.record_success(account.id)
        return account.id, done
