"""Security helpers for local secret storage and path validation."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


ENCRYPTED_PREFIX = "enc:v1:"
SLUG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")


class SecretStore:
    def __init__(self, key_path: Path):
        self.key_path = key_path
        self.key_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.key_path.exists():
            fd = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(Fernet.generate_key())
        os.chmod(self.key_path, 0o600)
        self._key = self.key_path.read_bytes().strip()
        self._fernet = Fernet(self._key)

    def encrypt(self, value: str | None) -> str:
        if not value:
            return ""
        if value.startswith(ENCRYPTED_PREFIX):
            return value
        token = self._fernet.encrypt(value.encode("utf-8")).decode("ascii")
        return ENCRYPTED_PREFIX + token

    def decrypt(self, value: str | None) -> str:
        if not value:
            return ""
        if not value.startswith(ENCRYPTED_PREFIX):
            return value
        try:
            return self._fernet.decrypt(value[len(ENCRYPTED_PREFIX):].encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as exc:
            raise ValueError("Không thể giải mã dữ liệu bí mật; key không khớp") from exc

    def fingerprint(self, value: str) -> str:
        return hmac.new(self._key, value.encode("utf-8"), hashlib.sha256).hexdigest()

    def encrypt_bytes(self, value: bytes) -> bytes:
        return self._fernet.encrypt(value)

    def decrypt_bytes(self, value: bytes) -> bytes:
        try:
            return self._fernet.decrypt(value)
        except InvalidToken as exc:
            raise ValueError("Không thể giải mã file; key không khớp") from exc


def safe_child(root: Path, user_path: str, *, must_exist: bool = False) -> Path:
    """Resolve a user-provided path and guarantee it remains below root."""
    root_resolved = root.resolve()
    candidate = (root_resolved / user_path).resolve()
    if not candidate.is_relative_to(root_resolved):
        raise ValueError("Đường dẫn nằm ngoài thư mục được phép")
    if must_exist and not candidate.exists():
        raise FileNotFoundError(candidate)
    return candidate


def validate_slug(value: str) -> str:
    value = (value or "").strip()
    if not SLUG_RE.fullmatch(value) or value in {".", ".."}:
        raise ValueError("Slug không hợp lệ")
    return value


def harden_file_permissions(paths: list[Path]) -> None:
    for path in paths:
        try:
            if path.exists() and path.is_file():
                os.chmod(path, 0o600)
        except OSError:
            # A permission failure should be visible through deployment checks,
            # but must not make a local-only application unbootable.
            continue
