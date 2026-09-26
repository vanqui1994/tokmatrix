"""Daemon Autopilot: state machine + thread + cycle lock.

Trạng thái (``AutopilotEngine.state``):
  stopped   — không có thread
  disabled  — thread sống, config enabled=false
  paused    — thread sống, config paused=true (giữ qua restart)
  idle      — chờ tới lượt kế tiếp
  running   — đang chạy một cycle hoặc thao tác thủ công
  stopping  — đã yêu cầu dừng, đang chờ thread thoát

Chỉ một cycle/thao tác chạy tại một thời điểm (``_cycle_lock``); thao tác thứ hai
nhận ``Busy`` thay vì chạy song song.
"""
from __future__ import annotations

import datetime
import logging
import threading
import time
from enum import Enum
from typing import Any, Callable, Dict, Optional

from . import store

logger = logging.getLogger("autopilot")

THREAD_NAME = "autopilot-daemon"
CycleFn = Callable[[Callable[[], bool], Callable[[str], None]], Dict[str, Any]]


class State(str, Enum):
    STOPPED = "stopped"
    DISABLED = "disabled"
    PAUSED = "paused"
    IDLE = "idle"
    RUNNING = "running"
    STOPPING = "stopping"


class Busy(Exception):
    """Đang có cycle khác chạy, hoặc Autopilot đang tạm dừng."""


def _iso(ts: Optional[float]) -> Optional[str]:
    return datetime.datetime.fromtimestamp(ts).isoformat(timespec="seconds") if ts else None


class AutopilotEngine:
    def __init__(self, cycle_fn: CycleFn, *, max_wait: float = 30.0):
        self._cycle_fn = cycle_fn
        self._max_wait = max_wait
        self._halt = threading.Event()   # stop() yêu cầu dừng mọi việc đang chạy
        self._wake = threading.Event()   # đánh thức vòng lặp (resume, start lại)
        self._cycle_lock = threading.Lock()
        self._lock = threading.Lock()    # bảo vệ các field bên dưới
        self._thread: Optional[threading.Thread] = None
        self._paused = False
        self._step: Optional[str] = None
        self._trigger: Optional[str] = None
        self._started_at: Optional[float] = None
        self.next_run_at = 0.0
        self.metrics: Dict[str, Any] = {
            "cycles_total": 0, "last_cycle_at": None, "last_run": None,
            "last_error": None, "last_error_at": None,
        }

    # -- điều khiển ---------------------------------------------------------

    def should_halt(self) -> bool:
        return self._halt.is_set() or self._paused

    def start(self) -> bool:
        """Khởi động thread. False nếu thread cũ vẫn đang dừng dở."""
        with self._lock:
            if self._thread and self._thread.is_alive():
                if self._halt.is_set():
                    return False
                self._wake.set()
                return True
            self._halt.clear()
            self._wake.clear()
            self._paused = store.get_bool("paused")
            if not self._cycle_lock.locked():
                store.mark_interrupted_runs()
            self._thread = threading.Thread(target=self._loop, name=THREAD_NAME, daemon=True)
            self._thread.start()
            return True

    def stop(self, timeout: float = 30.0) -> bool:
        """Yêu cầu dừng; bước đang chạy tự thoát (kể cả subprocess). True khi thread đã thoát."""
        self._halt.set()
        self._wake.set()
        thread = self._thread
        if thread:
            thread.join(timeout)
        with self._lock:
            if self._thread is thread and (thread is None or not thread.is_alive()):
                self._thread = None
            return self._thread is None

    def pause(self) -> None:
        store.set_config("paused", "true")
        self._paused = True
        store.log_event("⏸️ Autopilot tạm dừng — bước đang chạy sẽ dừng ở điểm an toàn")

    def resume(self) -> None:
        store.set_config("paused", "false")
        self._paused = False
        self._wake.set()
        store.log_event("▶️ Autopilot tiếp tục")

    # -- chạy việc ----------------------------------------------------------

    def _set_step(self, step: str) -> None:
        with self._lock:
            self._step = step

    def _acquire(self) -> None:
        if self._paused:
            raise Busy("Autopilot đang tạm dừng — bấm Tiếp tục trước")
        if not self._cycle_lock.acquire(blocking=False):
            raise Busy(f"Autopilot đang chạy ({self._trigger or 'cycle'}, bước {self._step or '…'})")
        if not (self._thread and self._thread.is_alive()):
            self._halt.clear()  # chạy tay khi daemon đã dừng

    def _execute(self, fn: Callable[[], Any], trigger: str) -> Dict[str, Any]:
        """Chạy fn khi đã giữ _cycle_lock; luôn nhả lock và ghi autopilot_runs."""
        try:
            with self._lock:
                self._trigger, self._started_at, self._step = trigger, time.time(), None
            run_id = store.start_run(trigger)
            status, error, summary = "ok", "", {}
            try:
                result = fn()
                summary = result if isinstance(result, dict) else {"result": result}
            except store.Halted as exc:
                status, error = "halted", str(exc)
                store.log_event(f"⏹️ {trigger}: {exc}", "warn")
            except Exception as exc:  # cycle lỗi không được giết daemon
                status, error = "error", f"{type(exc).__name__}: {exc}"
                logger.exception("Autopilot %s error", trigger)
                store.log_event(f"❌ Lỗi {trigger}: {error}", "error")
            finally:
                store.finish_run(run_id, status, summary, error)
                now = time.time()
                with self._lock:
                    self.metrics["last_run"] = {"trigger": trigger, "status": status, "at": _iso(now), "run_id": run_id}
                    if trigger in ("schedule", "manual"):
                        self.metrics["cycles_total"] += 1
                        self.metrics["last_cycle_at"] = now
                    if status == "error":
                        self.metrics["last_error"], self.metrics["last_error_at"] = error, now
                    elif trigger in ("schedule", "manual") and status == "ok":
                        self.metrics["last_error"] = None
            return {"status": status, "summary": summary, "error": error, "run_id": run_id}
        finally:
            with self._lock:
                self._trigger = self._started_at = self._step = None
            self._cycle_lock.release()

    def run_exclusive(self, fn: Callable[[Callable[[], bool]], Any], trigger: str) -> Dict[str, Any]:
        """Chạy một thao tác (publish-ready, cleanup…) độc quyền với cycle. Raise Busy."""
        self._acquire()
        return self._execute(lambda: fn(self.should_halt), trigger)

    def run_cycle(self, trigger: str = "manual") -> Dict[str, Any]:
        self._acquire()
        return self._execute(lambda: self._cycle_fn(self.should_halt, self._set_step), trigger)

    def run_cycle_in_background(self, trigger: str = "manual") -> None:
        """Như run_cycle nhưng không chặn request HTTP. Raise Busy ngay nếu đang bận."""
        self._acquire()
        fn = lambda: self._cycle_fn(self.should_halt, self._set_step)  # noqa: E731
        threading.Thread(target=self._execute, args=(fn, trigger), name="autopilot-manual", daemon=True).start()

    def _loop(self) -> None:
        store.log_event("🤖 Autopilot daemon khởi động")
        while not self._halt.is_set():
            try:
                self._paused = store.get_bool("paused")
                if store.get_bool("enabled") and not self._paused and time.time() >= self.next_run_at:
                    try:
                        self.run_cycle("schedule")
                    except Busy:
                        pass  # đang có lượt chạy tay; tính như đã chạy
                    self.next_run_at = time.time() + store.get_int("check_interval_seconds")
            except Exception:
                logger.exception("Autopilot loop error")
            wait = max(1.0, min(self._max_wait, self.next_run_at - time.time()))
            self._wake.wait(wait)
            self._wake.clear()
        store.log_event("🛑 Autopilot daemon dừng")

    # -- trạng thái ---------------------------------------------------------

    @property
    def state(self) -> State:
        thread = self._thread
        alive = bool(thread and thread.is_alive())
        if alive and self._halt.is_set():
            return State.STOPPING
        if self._cycle_lock.locked():
            return State.RUNNING
        if not alive:
            return State.STOPPED
        if self._paused:
            return State.PAUSED
        if not store.get_bool("enabled"):
            return State.DISABLED
        return State.IDLE

    def snapshot(self) -> Dict[str, Any]:
        state = self.state
        with self._lock:
            metrics = dict(self.metrics)
            step, trigger, started = self._step, self._trigger, self._started_at
        return {
            "state": state.value,
            "running": state == State.RUNNING,
            "daemon_alive": bool(self._thread and self._thread.is_alive()),
            "enabled": store.get_bool("enabled"),
            "paused": self._paused,
            "current_step": step,
            "current_trigger": trigger,
            "cycle_started_at": _iso(started),
            "next_run_at": _iso(self.next_run_at) if state in (State.IDLE, State.RUNNING) and self.next_run_at else None,
            "cycles_total": metrics["cycles_total"],
            "last_cycle": _iso(metrics["last_cycle_at"]),
            "last_run": metrics["last_run"],
            "last_error": metrics["last_error"],
            "last_error_at": _iso(metrics["last_error_at"]),
        }
