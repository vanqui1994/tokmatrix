"""Chrome cookie database reader.

The bundled database stores plaintext values. Encrypted Chromium cookies are
intentionally skipped instead of returning unusable ciphertext.
"""

from __future__ import annotations

import shutil
import sqlite3
import tempfile
from pathlib import Path


class CookieManager:
    @staticmethod
    def load_from_sqlite(db_path: str | Path) -> list[dict]:
        source = Path(db_path).resolve()
        if not source.is_file():
            raise FileNotFoundError(source)

        # Chrome may hold a write lock. Reading a snapshot also prevents the
        # application from mutating the browser-owned database accidentally.
        with tempfile.TemporaryDirectory(prefix="ssmatool-cookies-") as temp_dir:
            snapshot = Path(temp_dir) / "Cookies"
            shutil.copy2(source, snapshot)
            conn = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    """
                    SELECT host_key, name, value, path, expires_utc,
                           is_secure, is_httponly, samesite
                    FROM cookies
                    WHERE value != ''
                    """
                ).fetchall()
            finally:
                conn.close()

        return [
            {
                "domain": row["host_key"],
                "name": row["name"],
                "value": row["value"],
                "path": row["path"] or "/",
                "expires_utc": row["expires_utc"],
                "secure": bool(row["is_secure"]),
                "http_only": bool(row["is_httponly"]),
                "same_site": row["samesite"],
            }
            for row in rows
        ]
