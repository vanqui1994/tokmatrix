"""Media stream payload decryption and prompt formatting utility for Seedance video pipeline.

Provides:
1. Decoding for `qAAB...` encrypted stream tokens (AES-128-CBC with key/IV derived from SHA-512(seed) + salt).
2. Prompt formatting (Prompt Cleaner & Enhancer): strips quality buzzwords (e.g. 8k, masterpiece)
   and ensures consistent cinematic phrasing.
"""

import base64
import functools
import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("dola_decrypt")

# Salt used in Seedance / Dola media stream player
QAAB_SALT_HEX = (
    "4dd4c2e6b83162090e52b3c7a6733ba4"
    "1cb2462b829ab58a196b39db57177524"
    "f49baf7f08e8d68d26a72e37c1a95a2f"
    "1f05a51892aef2949732b62a38aadd58"
)
QAAB_SALT_BYTES = bytes.fromhex(QAAB_SALT_HEX)

# Magic header for valid stream token payload
MAGIC_HEADER = b"\xa8\x00\x01\x00"

# Redundant quality buzzwords that do not contribute to prompt semantics
QUALITY_FILLER_PATTERNS = re.compile(
    r"(?<![\w-])(8k|4k|hdr|photorealistic|hyperrealistic|octane render|"
    r"trending on artstation|masterpiece|ultra detailed|hd 1080p)(?:-\w+)?(?![\w-])",
    re.IGNORECASE,
)
LEAD_PATTERNS = re.compile(
    r"^(a|an|the|cinematic|stunning|dramatic|beautiful|slow motion|natural)\b",
    re.IGNORECASE,
)


@functools.lru_cache(maxsize=128)
def derive_qaab_key_iv(seed_32: bytes) -> Tuple[bytes, bytes]:
    """Derives AES-128 key and IV from 32-byte seed with cached digest."""
    digest1 = hashlib.sha512(seed_32).digest()
    digest2 = hashlib.sha512(digest1 + QAAB_SALT_BYTES).digest()
    return digest2[:16], digest2[16:32]


def decode_base64_loose(text: str) -> bytes:
    """Decodes loose Base64 supporting custom URL-safe mappings ($, @, #, -, _)."""
    if not text:
        return b""
    raw = str(text).strip()
    table = str.maketrans({"$": "+", "@": "/", "#": "=", "-": "+", "_": "/"})
    normalized = raw.translate(table)
    pad = (4 - len(normalized) % 4) % 4
    normalized += "=" * pad
    try:
        return base64.b64decode(normalized)
    except Exception:
        return b""


def strip_pkcs7(data: bytes) -> bytes:
    """Safely strips PKCS#7 padding if valid."""
    if not data:
        return b""
    pad = data[-1]
    if 1 <= pad <= 16 and len(data) >= pad:
        if data[-pad:] == bytes([pad]) * pad:
            return data[:-pad]
    return data


def is_ascii_url(data: bytes) -> str:
    """Validates that bytes represent a printable ASCII HTTP/HTTPS URL."""
    if not data:
        return ""
    for b in data:
        if b != 9 and b != 10 and b != 13 and (b < 32 or b > 126):
            return ""
    try:
        url = data.decode("ascii").strip()
        if url.startswith("http://") or url.startswith("https://"):
            return url
    except Exception:
        pass
    return ""


def decrypt_qaab_token(token_str: str, key_seed_str: str) -> str:
    """Decodes `qAAB...` token into direct MP4 stream URL.
    
    Workflow:
    1. seed = base64_decode(key_seed)[:32]
    2. key, iv = derive_qaab_key_iv(seed)
    3. AES-128-CBC decryption and PKCS#7 unpadding.
    """
    if not token_str or not key_seed_str:
        return ""

    data = decode_base64_loose(token_str)
    seed = decode_base64_loose(key_seed_str)
    if not data or not seed:
        return ""

    try:
        key, iv = derive_qaab_key_iv(seed[:32])

        attempts: List[Tuple[bytes, bytes, bytes]] = []

        if len(data) >= 4 and data[:4] == MAGIC_HEADER:
            attempts.append((data[4:], key, iv))
            attempts.append((data[4:], iv, key))
            if len(data) > 36:
                attempts.append((data[36:], key, data[20:36]))
                attempts.append((data[36:], key, iv))
        else:
            attempts.append((data, key, iv))

        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        for payload, cur_key, cur_iv in attempts:
            if not payload or len(payload) % 16 != 0:
                continue
            try:
                cipher = Cipher(algorithms.AES(cur_key), modes.CBC(cur_iv), backend=default_backend())
                decryptor = cipher.decryptor()
                plain = decryptor.update(payload) + decryptor.finalize()

                url_direct = is_ascii_url(plain)
                if url_direct:
                    return url_direct

                stripped = strip_pkcs7(plain)
                url_stripped = is_ascii_url(stripped)
                if url_stripped:
                    return url_stripped
            except Exception:
                continue
    except Exception as exc:
        logger.debug("Stream token decryption error: %s", exc)

    return ""


def decode_main_url(token: str, key_seed: str = "") -> str:
    """Resolves stream token into URL: supports plain URL, plain base64, or qAAB token."""
    if not token or not isinstance(token, str):
        return ""
    token = token.strip()
    if token.startswith("http://") or token.startswith("https://"):
        return token

    # Check plain base64
    try:
        raw_bytes = decode_base64_loose(token)
        if raw_bytes:
            url_text = is_ascii_url(raw_bytes)
            if url_text:
                return url_text
    except Exception:
        pass

    # Encrypted stream token
    if token.startswith("qAAB") and key_seed:
        return decrypt_qaab_token(token, key_seed)

    return ""


def find_key_seed_deep(value: Any, depth: int = 0) -> str:
    """Finds key_seed string recursively in data structures."""
    if depth > 10 or value is None:
        return ""

    if isinstance(value, str):
        m = re.search(r'(?:^|[?&])key_seed=([^&"\'<>\s]+)', value, re.IGNORECASE)
        if m:
            import urllib.parse
            return urllib.parse.unquote(m.group(1))
        m = re.search(r'["\']key_seed["\']\s*:\s*["\']([^"\']+)', value, re.IGNORECASE)
        if m:
            import urllib.parse
            return urllib.parse.unquote(m.group(1))
        return ""

    if isinstance(value, dict):
        if "key_seed" in value and isinstance(value["key_seed"], str):
            seed = value["key_seed"].strip()
            if seed:
                return seed
        for v in value.values():
            hit = find_key_seed_deep(v, depth + 1)
            if hit:
                return hit
    elif isinstance(value, list):
        for item in value:
            hit = find_key_seed_deep(item, depth + 1)
            if hit:
                return hit

    return ""


def extract_unwatermarked_url_from_video_model(video_model_raw: Any, fallback_url: str = "") -> str:
    """Extracts highest resolution direct stream URL from video_model payload."""
    try:
        data = video_model_raw
        if isinstance(data, str):
            try:
                data = json.loads(data or "{}")
            except Exception:
                data = {}

        if not isinstance(data, dict):
            return fallback_url

        key_seed = find_key_seed_deep(data)

        video_list = data.get("video_list")
        if isinstance(video_list, dict):
            entries = list(video_list.values())
        elif isinstance(video_list, list):
            entries = video_list
        else:
            entries = [data]

        candidates: List[Tuple[int, str]] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            token = entry.get("main_url") or entry.get("play_url") or ""
            if not token or not isinstance(token, str):
                continue
            
            score = int(entry.get("bitrate") or entry.get("real_bitrate") or 0)
            score += int(entry.get("vwidth") or entry.get("width") or 0) * int(
                entry.get("vheight") or entry.get("height") or 0
            )

            resolved_url = decode_main_url(token, key_seed)
            if resolved_url and (resolved_url.startswith("http://") or resolved_url.startswith("https://")):
                candidates.append((score, resolved_url))

        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            return candidates[0][1]
    except Exception as exc:
        logger.debug("Video model resolution error: %s", exc)

    return fallback_url


def humanize_dola_prompt(raw_prompt: str) -> str:
    """Formats prompt with cinematic phrasing and removes quality buzzword clutter.
    
    1. Removes quality filler words (8k, hdr, photorealistic, etc.) including hyphenated forms (4k-ready).
    2. Cleans up empty brackets, leftover commas, and dangling spaces before punctuation.
    3. Adds cinematic visual phrasing while preserving acronyms (NASA, NASA's, AI, McDonald).
    4. Normalizes sentence punctuation.
    """
    if not raw_prompt or not isinstance(raw_prompt, str):
        return ""
    text = QUALITY_FILLER_PATTERNS.sub("", raw_prompt.strip())
    text = re.sub(r"\(\s*\)|\[\s*\]", "", text)            # empty brackets
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*(?:,\s*)+", ", ", text)              # collapse commas
    text = re.sub(r"[\s,]+([.!?;:])", r"\1", text)          # no ", ." / " ."
    text = text.strip(" ,;:")
    if not text or text in {".", "!", "?"}:
        return ""
    if not LEAD_PATTERNS.search(text):
        first = text.split()[0]
        # Lowercase only standard capitalized common words (Fox -> fox); preserve NASA, NASA's, McDonald, iPhone
        if first[:1].isupper() and first[1:].isalpha() and first[1:].islower():
            text = text[:1].lower() + text[1:]
        text = f"A natural cinematic visual of {text}"
    if not text.endswith((".", "!", "?")):
        text += "."
    return text
