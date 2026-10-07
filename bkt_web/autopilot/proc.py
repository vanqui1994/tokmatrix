"""Chạy subprocess dài (batch-matrix, rsync) mà vẫn dừng được khi stop/pause."""
from __future__ import annotations

import os
import signal
import subprocess
import time
from typing import Callable, Dict, List, Optional

from . import store

POLL_SECONDS = 1.0


def lower_priority() -> None:
    """preexec_fn cho việc nặng chạy nền (batch-matrix, render, remake): nice thêm TOKMATRIX_BG_NICE (10).

    Chúng là tiến trình con của web server, chung cgroup và cùng nice; trên VPS 4 lõi (load 30+ khi render) web phản
    hồi rất chậm (owner 07/10). Ưu tiên thấp hơn để web và trình đăng bài luôn được CPU trước.
    """
    try:
        os.nice(int(os.environ.get("TOKMATRIX_BG_NICE", "10") or 0))
    except (OSError, ValueError):
        pass


def _kill_group(proc: subprocess.Popen) -> None:
    # batch-matrix sinh thêm tiến trình con (Chromium, ffmpeg) → giết cả nhóm.
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(proc.pid, sig)
        except (ProcessLookupError, PermissionError):
            return
        try:
            proc.wait(timeout=5)
            return
        except subprocess.TimeoutExpired:
            continue


def run(
    args: List[str],
    *,
    timeout: float,
    should_halt: Optional[Callable[[], bool]] = None,
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
) -> subprocess.CompletedProcess:
    """Như subprocess.run(capture_output, text); raise store.Halted khi should_halt() bật."""
    proc = subprocess.Popen(
        args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        start_new_session=True, env=env, preexec_fn=lower_priority,
    )
    deadline = time.monotonic() + timeout
    while True:
        try:
            out, err = proc.communicate(timeout=POLL_SECONDS)
            return subprocess.CompletedProcess(args, proc.returncode, out, err)
        except subprocess.TimeoutExpired:
            if should_halt and should_halt():
                _kill_group(proc)
                proc.communicate()
                raise store.Halted(f"đã dừng {args[0]} theo lệnh stop/pause")
            if time.monotonic() > deadline:
                _kill_group(proc)
                proc.communicate()
                raise subprocess.TimeoutExpired(args, timeout)
