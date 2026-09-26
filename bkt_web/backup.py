"""Create and validate encrypted database backups for TokMatrix."""

from __future__ import annotations

import argparse
import os
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

from bkt_web.security import SecretStore


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bkt_channels.db"
KEY_PATH = BASE_DIR / ".secret.key"


def check_database(path: Path) -> None:
    conn = sqlite3.connect(path)
    result = conn.execute("PRAGMA integrity_check").fetchone()
    conn.close()
    if not result or result[0] != "ok":
        raise RuntimeError(f"Database không hợp lệ: {result}")


def create_backup(output: Path) -> Path:
    store = SecretStore(KEY_PATH)
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tokmatrix-backup-") as tmp:
        snapshot = Path(tmp) / "snapshot.db"
        source = sqlite3.connect(DB_PATH)
        target = sqlite3.connect(snapshot)
        source.backup(target)
        target.close()
        source.close()
        check_database(snapshot)
        output.write_bytes(store.encrypt_bytes(snapshot.read_bytes()))
    os.chmod(output, 0o600)
    return output


def restore_backup(source: Path, *, confirmed: bool) -> None:
    if not confirmed:
        raise RuntimeError("Khôi phục cần cờ --yes và phải dừng server trước")
    store = SecretStore(KEY_PATH)
    raw = store.decrypt_bytes(source.resolve().read_bytes())
    fd, temp_name = tempfile.mkstemp(prefix="bkt-restore-", suffix=".db", dir=BASE_DIR)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
        temp_path = Path(temp_name)
        check_database(temp_path)
        os.chmod(temp_path, 0o600)
        os.replace(temp_path, DB_PATH)
        # WAL và shared-index của database CŨ phải biến mất cùng lúc: để lại thì
        # lần mở kế tiếp SQLite sẽ recover chúng và ghi đè lên bản vừa khôi phục.
        for sidecar in (Path(f"{DB_PATH}-wal"), Path(f"{DB_PATH}-shm")):
            sidecar.unlink(missing_ok=True)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--create", action="store_true")
    group.add_argument("--restore", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    if args.create:
        default = BASE_DIR / "backups" / f"bkt-{datetime.now():%Y%m%d-%H%M%S}.db.fernet"
        print(create_backup(args.output or default))
    else:
        restore_backup(args.restore, confirmed=args.yes)
        print(DB_PATH)


if __name__ == "__main__":
    main()
