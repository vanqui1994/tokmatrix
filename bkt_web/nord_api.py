import os
import time
import json
import re
import socket
import tempfile
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, List, Optional
from curl_cffi import requests as curl_requests

BASE_DIR = Path(__file__).resolve().parent
BIN_DIR = BASE_DIR / "bin"
WIREPROXY_BIN = BIN_DIR / "wireproxy"
if os.environ.get("TOKMATRIX_WIREPROXY_PATH"):
    WIREPROXY_BIN = Path(os.environ["TOKMATRIX_WIREPROXY_PATH"])
if not WIREPROXY_BIN.exists():
    WIREPROXY_BIN = Path.home() / "go" / "bin" / "wireproxy"

DEFAULT_WIREGUARD_PRIVATE_KEY = os.environ.get(
    "NORDVPN_WIREGUARD_PRIVATE_KEY",
    "Kgz4EIyGI06Sms7Zm/TszuoPsF9i02zSGkF4dkmz1Bo="
)

# In-memory caches
_COUNTRIES_CACHE: Dict[str, Any] = {"data": None, "timestamp": 0}
_SERVERS_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_COUNTRIES = 3600  # 1 hour
CACHE_TTL_SERVERS = 180     # 3 minutes

# Active test tunnels tracked by hostname: { "proc": Popen, "socks_port": int, "conf_file": str, "started_at": float }
ACTIVE_NORD_TUNNELS: Dict[str, Dict[str, Any]] = {}

def country_code_to_flag(code: str) -> str:
    """Generates flag emoji from 2-letter ISO code: 'US' -> 🇺🇸"""
    if not code or len(code) != 2:
        return "🌐"
    try:
        return "".join(chr(127397 + ord(c)) for c in code.upper())
    except Exception:
        return "🌐"

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def is_port_listening(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except Exception:
        return False

def get_nord_countries(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetches all 150+ countries from NordVPN API with server counts.
    Returns: { "total_servers": int, "total_countries": int, "countries": [...] }
    """
    now = time.time()
    if not force_refresh and _COUNTRIES_CACHE["data"] and (now - _COUNTRIES_CACHE["timestamp"] < CACHE_TTL_COUNTRIES):
        return _COUNTRIES_CACHE["data"]

    url = "https://api.nordvpn.com/v1/servers/countries"
    req = urllib.request.Request(url, headers={"User-Agent": "TokMatrix-Workstation/3.0"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        # Fallback to cached if available
        if _COUNTRIES_CACHE["data"]:
            return _COUNTRIES_CACHE["data"]
        raise RuntimeError(f"Không thể kết nối đến NordVPN API: {str(e)}")

    processed_countries = []
    total_servers = 0

    for c in raw:
        code = (c.get("code") or "").upper()
        name = c.get("name") or code
        server_count = c.get("serverCount") or 0
        cid = c.get("id")
        total_servers += server_count

        processed_countries.append({
            "id": cid,
            "code": code,
            "name": name,
            "flag": country_code_to_flag(code),
            "server_count": server_count,
            "cities": [{"id": ct.get("id"), "name": ct.get("name"), "server_count": ct.get("serverCount", 0)} for ct in c.get("cities", [])]
        })

    # Sort countries by server_count descending
    processed_countries.sort(key=lambda x: x["server_count"], reverse=True)

    result = {
        "total_servers": total_servers,
        "total_countries": len(processed_countries),
        "countries": processed_countries,
        "updated_at": int(now)
    }

    _COUNTRIES_CACHE["data"] = result
    _COUNTRIES_CACHE["timestamp"] = now
    return result

def get_nord_servers_for_country(country_code: str, limit: int = 100, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetches top recommended WireGuard servers for a country from NordVPN API.
    Sorted by lowest server load (fastest & most stable).
    """
    code = (country_code or "DE").strip().upper()
    now = time.time()

    if not force_refresh and code in _SERVERS_CACHE:
        cached = _SERVERS_CACHE[code]
        if now - cached["timestamp"] < CACHE_TTL_SERVERS:
            return cached["data"]

    countries_data = get_nord_countries()
    country_obj = next((c for c in countries_data["countries"] if c["code"] == code), None)
    if not country_obj:
        raise ValueError(f"Không tìm thấy quốc gia với mã '{code}' trên hệ thống NordVPN")

    cid = country_obj["id"]
    # Query Nord recommendations filtered by country and WireGuard technology
    url = f"https://api.nordvpn.com/v1/servers/recommendations?filters[country_id]={cid}&filters[servers_technologies][identifier]=wireguard_udp&limit={limit}"
    req = urllib.request.Request(url, headers={"User-Agent": "TokMatrix-Workstation/3.0"})

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw_servers = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        if code in _SERVERS_CACHE:
            return _SERVERS_CACHE[code]["data"]
        raise RuntimeError(f"Lỗi khi tải server của {country_obj['name']} từ NordVPN API: {str(e)}")

    server_list = []
    for s in raw_servers:
        hostname = s.get("hostname")
        if not hostname:
            continue

        # Extract Wireguard Public Key
        wg_key = None
        for tech in s.get("technologies", []):
            if tech.get("identifier") == "wireguard_udp":
                for meta in tech.get("metadata", []):
                    if meta.get("name") == "public_key":
                        wg_key = meta.get("value")
                        break
            if wg_key:
                break

        if not wg_key:
            continue

        # Extract City
        city_name = "Default"
        locations = s.get("locations", [])
        if locations:
            city_obj = locations[0].get("country", {}).get("city", {}) or locations[0].get("city", {})
            if isinstance(city_obj, dict):
                city_name = city_obj.get("name", "Default")

        # Extract Groups/Tags
        groups = [g.get("title") for g in s.get("groups", []) if g.get("title")]

        server_list.append({
            "id": s.get("id"),
            "name": s.get("name") or hostname.split(".")[0],
            "hostname": hostname,
            "station": s.get("station") or "",
            "load": s.get("load", 0),
            "status": s.get("status", "online"),
            "city": city_name,
            "country_code": code,
            "country_name": country_obj["name"],
            "flag": country_obj["flag"],
            "public_key": wg_key,
            "groups": groups,
            "endpoint": f"{hostname}:51820"
        })

    # Sort primarily by load ascending
    server_list.sort(key=lambda x: x["load"])

    result = {
        "country": country_obj,
        "count": len(server_list),
        "servers": server_list,
        "updated_at": int(now)
    }

    _SERVERS_CACHE[code] = {"data": result, "timestamp": now}
    return result

def start_dynamic_nord_tunnel(hostname: str, public_key: str, private_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Spawns or reuses a wireproxy process on a free local SOCKS5 port for a live NordVPN server.
    """
    clean_host = hostname.strip().lower()
    priv = (private_key or DEFAULT_WIREGUARD_PRIVATE_KEY).strip()
    pub = public_key.strip()

    # Re-use existing live tunnel if still listening
    existing = ACTIVE_NORD_TUNNELS.get(clean_host)
    if existing and is_port_listening(existing["socks_port"]):
        return existing

    # Cleanup dead tunnel entry if any
    if existing:
        stop_dynamic_nord_tunnel(clean_host)

    socks_port = get_free_port()
    conf_content = f"""[Interface]
PrivateKey = {priv}
Address = 10.5.0.2/16
DNS = 103.86.96.100, 8.8.8.8, 1.1.1.1

[Peer]
PublicKey = {pub}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = {clean_host}:51820
PersistentKeepalive = 25

[Socks5]
BindAddress = 127.0.0.1:{socks_port}
"""

    tmp_conf = tempfile.NamedTemporaryFile("w", suffix=f"_nord_{socks_port}.conf", delete=False)
    tmp_conf.write(conf_content)
    tmp_conf.flush()
    tmp_conf.close()

    wireproxy_exec = str(WIREPROXY_BIN)
    if not os.path.exists(wireproxy_exec):
        Path(tmp_conf.name).unlink(missing_ok=True)
        raise RuntimeError(f"wireproxy binary không tồn tại tại {wireproxy_exec}")

    try:
        proc = subprocess.Popen(
            [wireproxy_exec, "-s", "-c", tmp_conf.name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception:
        Path(tmp_conf.name).unlink(missing_ok=True)
        raise

    # Wait for port to be listening (up to 4s)
    opened = False
    for _ in range(20):
        time.sleep(0.2)
        if is_port_listening(socks_port):
            opened = True
            break
        if proc.poll() is not None:
            break

    if not opened:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        Path(tmp_conf.name).unlink(missing_ok=True)
        raise RuntimeError(f"Không thể mở WireGuard tunnel đến {clean_host} trên cổng {socks_port}")

    tunnel_info = {
        "hostname": clean_host,
        "socks_port": socks_port,
        "socks5_url": f"socks5://127.0.0.1:{socks_port}",
        "proc": proc,
        "conf_file": tmp_conf.name,
        "started_at": int(time.time()),
        "public_key": pub
    }
    ACTIVE_NORD_TUNNELS[clean_host] = tunnel_info
    return tunnel_info

def stop_dynamic_nord_tunnel(hostname: str) -> None:
    clean_host = hostname.strip().lower()
    if clean_host in ACTIVE_NORD_TUNNELS:
        t = ACTIVE_NORD_TUNNELS.pop(clean_host)
        proc = t.get("proc")
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        conf_file = t.get("conf_file")
        if conf_file:
            Path(conf_file).unlink(missing_ok=True)

def stop_all_dynamic_nord_tunnels() -> int:
    hosts = list(ACTIVE_NORD_TUNNELS.keys())
    for h in hosts:
        stop_dynamic_nord_tunnel(h)
    return len(hosts)

def test_nord_server_connection(hostname: str, public_key: str, target_country: str = "DE", city: str = "") -> Dict[str, Any]:
    """
    Connects to a live NordVPN server, queries IP Geolocation, and tests TikTok CDN & anti-bot WAF.
    """
    tunnel = start_dynamic_nord_tunnel(hostname, public_key)
    socks5_proxy = tunnel["socks5_url"]
    target_country = (target_country or "DE").upper()

    report: Dict[str, Any] = {
        "success": True,
        "hostname": hostname,
        "target_country": target_country,
        "city": city,
        "socks5_port": tunnel["socks_port"],
        "api": {},
        "tiktok": {},
        "match": {}
    }

    # 1. IP Geolocation Test
    try:
        t0 = time.time()
        resp = curl_requests.get(
            "http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,isp,org,timezone,query",
            proxy=socks5_proxy,
            timeout=8
        )
        latency = int((time.time() - t0) * 1000)
        data = resp.json()
        if data.get("status") == "success":
            report["api"] = {
                "success": True,
                "ip": data.get("query"),
                "country": data.get("country"),
                "country_code": data.get("countryCode"),
                "city": data.get("city"),
                "region_name": data.get("regionName"),
                "isp": data.get("isp"),
                "org": data.get("org"),
                "timezone": data.get("timezone"),
                "latency_ms": latency
            }
        else:
            report["api"] = {"success": False, "error": data.get("message", "Lỗi kiểm tra IP")}
    except Exception as e:
        report["api"] = {"success": False, "error": f"Lỗi IP: {str(e)}"}

    # 2. TikTok CDN & Anti-Bot Detection Test
    try:
        t0 = time.time()
        tt_resp = curl_requests.get(
            "https://www.tiktok.com/",
            proxy=socks5_proxy,
            impersonate="chrome120",
            timeout=10,
            headers={
                "Accept-Language": "en-US,en;q=0.9",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        tt_latency = int((time.time() - t0) * 1000)
        html = tt_resp.text
        cluster = tt_resp.headers.get("x-tt-logid", "Edge")[:12] if tt_resp.headers.get("x-tt-logid") else "Standard Edge"

        # Look for region in app-context
        tt_region = None
        m = re.search(r'"region"\s*:\s*"([A-Z]{2})"', html)
        if m:
            tt_region = m.group(1)
        elif report["api"].get("country_code"):
            tt_region = report["api"].get("country_code")

        waf_passed = tt_resp.status_code == 200 and "verify-bar" not in html and "captcha" not in html

        report["tiktok"] = {
            "success": True,
            "status_code": tt_resp.status_code,
            "region": tt_region or target_country,
            "cluster": cluster,
            "waf_passed": waf_passed,
            "latency_ms": tt_latency
        }
    except Exception as e:
        report["tiktok"] = {
            "success": False,
            "error": f"Lỗi TikTok: {str(e)}"
        }

    # 3. Assess matching
    api_cc = (report["api"].get("country_code") or "").upper()
    tt_reg = (report["tiktok"].get("region") or "").upper()

    if api_cc == target_country and (tt_reg == target_country or not tt_reg):
        report["match"] = {
            "is_match": True,
            "status": "PERFECT",
            "message": f"Hoàn toàn trùng khớp 100%: Mục tiêu ({target_country}) ⟷ IP ({api_cc}) ⟷ TikTok ({tt_reg or api_cc})"
        }
    elif api_cc:
        report["match"] = {
            "is_match": False,
            "status": "MISMATCH",
            "message": f"Lệch vùng: Mục tiêu ({target_country}) ≠ IP thực tế ({api_cc})"
        }
    else:
        report["match"] = {
            "is_match": False,
            "status": "UNKNOWN",
            "message": "Không thể kết nối qua WireGuard"
        }

    report["ip"] = report["api"].get("ip") or "N/A"
    report["time_ms"] = report["api"].get("latency_ms") or 0
    return report
