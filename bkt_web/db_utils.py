"""SQLite connection defaults shared by the web app and workers."""

from __future__ import annotations

import sqlite3
from pathlib import Path


def connect_db(path: str | Path, *, timeout: float = 20.0) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path), timeout=timeout)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=20000")
    return conn


def configure_database(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=20000")
