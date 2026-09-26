"""
Port 1:1 của testTuongTacWPF.ProxyParser từ nuoinickbaosam 11.10.14.

Giữ nguyên thứ tự kiểm tra, thông báo lỗi tiếng Việt và cách dựng chuỗi proxy
của bản gốc, kể cả trường hợp IPv6 có dải prefix.
"""

import ipaddress
import re
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional

_SCHEME_RE = re.compile(r"^(https?|socks5|socks4)://", re.IGNORECASE)


class ProxyKind(str, Enum):
    INVALID = "Invalid"
    IPV4 = "IPv4"
    IPV6_SINGLE = "IPv6Single"
    IPV6_RANGE = "IPv6Range"


@dataclass
class ProxyParseResult:
    kind: ProxyKind = ProxyKind.INVALID
    original_line: str = ""
    scheme: Optional[str] = None
    host: str = ""
    port: str = ""
    user: Optional[str] = None
    password: Optional[str] = None
    error: Optional[str] = None

    @property
    def is_valid(self) -> bool:
        return self.kind != ProxyKind.INVALID

    def build_proxy_string(self, default_scheme: Optional[str] = None) -> str:
        """BuildProxyString: không có scheme thì trả dạng host:port[:user:pass]."""
        scheme = self.scheme or default_scheme or ""
        has_user = self.user is not None
        if not scheme:
            if not has_user:
                return f"{self.host}:{self.port}"
            return f"{self.host}:{self.port}:{self.user}:{self.password}"
        credentials = f"{self.user}:{self.password}@" if has_user else ""
        return f"{scheme}://{credentials}{self.host}:{self.port}"

    def to_dict(self) -> dict:
        return {
            "kind": self.kind.value,
            "original_line": self.original_line,
            "scheme": self.scheme,
            "host": self.host,
            "port": self.port,
            "user": self.user,
            "is_valid": self.is_valid,
            "error": self.error,
        }


def _invalid(line: str, error: str) -> ProxyParseResult:
    return ProxyParseResult(kind=ProxyKind.INVALID, original_line=line, error=error)


def _is_port(value: str) -> bool:
    try:
        port = int(value)
    except (TypeError, ValueError):
        return False
    return 1 <= port <= 65535


def _parse_ipv4(body: str) -> ProxyParseResult:
    parts = body.split(":")
    if len(parts) not in (2, 4):
        return _invalid(body, "Sai cấu trúc - cần ip:port hoặc ip:port:user:pass")
    host = parts[0]
    try:
        if not isinstance(ipaddress.ip_address(host), ipaddress.IPv4Address):
            raise ValueError
    except ValueError:
        return _invalid(body, f'"{host}" không phải IPv4 hợp lệ')
    if not _is_port(parts[1]):
        return _invalid(body, f'"{parts[1]}" không phải port hợp lệ (1-65535)')
    return ProxyParseResult(
        kind=ProxyKind.IPV4,
        host=host,
        port=parts[1],
        user=parts[2] if len(parts) == 4 else None,
        password=parts[3] if len(parts) == 4 else None,
    )


def _parse_ipv6(body: str) -> ProxyParseResult:
    close = body.find("]")
    if close < 0:
        return _invalid(body, "Thiếu dấu ] đóng địa chỉ IPv6")
    host = body[1:close]
    rest = body[close + 1:]
    try:
        if not isinstance(ipaddress.ip_address(host), ipaddress.IPv6Address):
            raise ValueError
    except ValueError:
        return _invalid(body, f'"{host}" không phải IPv6 hợp lệ')

    is_range = rest.startswith("/")
    prefix = 0
    if is_range:
        colon = rest.find(":")
        if colon < 0:
            return _invalid(body, 'Thiếu ":port" sau dải IPv6')
        try:
            prefix = int(rest[1:colon])
        except ValueError:
            prefix = 0
        if prefix < 1 or prefix > 128:
            return _invalid(body, "Prefix dải IPv6 phải trong khoảng /1 - /128 (vd [2001:db8::]/64)")
        rest = rest[colon:]

    if not rest.startswith(":"):
        return _invalid(body, 'Thiếu ":port" sau địa chỉ IPv6')

    parts = rest.lstrip(":").split(":")
    if len(parts) not in (1, 3):
        return _invalid(body, "Sai cấu trúc - cần [ipv6]:port hoặc [ipv6]:port:user:pass")
    if not _is_port(parts[0]):
        return _invalid(body, f'"{parts[0]}" không phải port hợp lệ (1-65535)')

    return ProxyParseResult(
        kind=ProxyKind.IPV6_RANGE if is_range else ProxyKind.IPV6_SINGLE,
        host=f"[{host}]/{prefix}" if is_range else f"[{host}]",
        port=parts[0],
        user=parts[1] if len(parts) == 3 else None,
        password=parts[2] if len(parts) == 3 else None,
    )


def parse(line: str) -> ProxyParseResult:
    """ProxyParser.Parse"""
    text = (line or "").strip()
    if not text:
        return _invalid(text, "Dòng rỗng")
    scheme = None
    body = text
    match = _SCHEME_RE.match(text)
    if match:
        scheme = match.group(1).lower()
        body = text[match.end():]
    result = _parse_ipv6(body) if body.startswith("[") else _parse_ipv4(body)
    result.original_line = text
    result.scheme = scheme
    return result


def parse_many(raw: str) -> List[ProxyParseResult]:
    return [parse(line) for line in (raw or "").splitlines() if line.strip()]


def to_playwright_proxy(proxy: str) -> Optional[dict]:
    """
    Chuyển chuỗi proxy đã lưu thành tham số proxy của Playwright.
    Chấp nhận cả dạng scheme://user:pass@host:port lẫn host:port:user:pass.
    """
    result = parse(proxy)
    if not result.is_valid:
        return None
    scheme = result.scheme or "http"
    out = {"server": f"{scheme}://{result.host}:{result.port}"}
    if result.user is not None:
        out["username"] = result.user
        out["password"] = result.password or ""
    return out


# ==============================================================================
# PROXY LIVE CHECKER (Port từ ProxyLiveChecker của BaoSamBrowser)
# ==============================================================================

import asyncio
import time
import httpx
from typing import Dict, Any


async def check_proxy_live(raw_proxy: str, timeout: float = 8.0) -> Dict[str, Any]:
    """
    Kiểm tra độ trễ (ping ms), địa chỉ IP thật và quốc gia của proxy.
    """
    pw_proxy = to_playwright_proxy(raw_proxy)
    if not pw_proxy:
        return {
            "is_live": False,
            "ping_ms": -1,
            "real_ip": "",
            "country": "",
            "error": "Định dạng proxy không hợp lệ"
        }

    server = pw_proxy["server"]
    user = pw_proxy.get("username")
    pwd = pw_proxy.get("password")

    proxy_url = server
    if user:
        scheme, rest = server.split("://", 1)
        proxy_url = f"{scheme}://{user}:{pwd}@{rest}"

    start_t = time.time()
    try:
        async with httpx.AsyncClient(proxy=proxy_url, timeout=timeout) as client:
            resp = await client.get("http://ip-api.com/json/?fields=status,message,country,countryCode,query")
            elapsed = int((time.time() - start_t) * 1000)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "is_live": True,
                    "ping_ms": elapsed,
                    "real_ip": data.get("query", ""),
                    "country": data.get("countryCode", "") or data.get("country", ""),
                    "error": ""
                }
            return {
                "is_live": False,
                "ping_ms": elapsed,
                "real_ip": "",
                "country": "",
                "error": f"HTTP {resp.status_code}"
            }
    except Exception as exc:
        elapsed = int((time.time() - start_t) * 1000)
        return {
            "is_live": False,
            "ping_ms": elapsed if elapsed < int(timeout * 1000) else -1,
            "real_ip": "",
            "country": "",
            "error": str(exc)[:80]
        }


async def check_proxies_batch(proxies: List[str], max_concurrency: int = 10) -> List[Dict[str, Any]]:
    semaphore = asyncio.Semaphore(max_concurrency)

    async def _worker(p: str):
        async with semaphore:
            res = await check_proxy_live(p)
            res["raw_proxy"] = p
            return res

    tasks = [_worker(p) for p in proxies]
    return await asyncio.gather(*tasks)

