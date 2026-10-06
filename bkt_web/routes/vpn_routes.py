"""Mạng & VPN: kho config WireGuard theo nước, server chết, tunnel đang mở, NordVPN API."""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
try:
    from bkt_web import vpn_manager
except ImportError:
    import vpn_manager

try:
    from bkt_web import paths
except ImportError:
    import paths

router = APIRouter()


@router.get("/api/vpn/stats")
def api_get_vpn_stats():
    return vpn_manager.get_vpn_stats()


@router.get("/api/vpn/catalog/{country}")
def api_get_vpn_catalog_country(country: str):
    cat = vpn_manager.get_vpn_catalog()
    c = country.strip().upper()
    if c == "UK":
        c = "GB"
    return cat.get(c, [])


@router.get("/api/vpn/dead-servers")
def api_list_dead_vpn_servers():
    """Liệt kê kênh đang trỏ vào server VPN đã khai tử (chỉ xem, không sửa)."""
    dead = vpn_manager.find_dead_vpn_assignments()
    return {"count": len(dead), "channels": dead}


@router.post("/api/vpn/reassign-dead")
def api_reassign_dead_vpn_servers(apply: bool = True):
    """Tự chuyển các kênh dính server chết sang server còn sống cùng quốc gia."""
    try:
        return vpn_manager.reassign_dead_vpns(apply=apply)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TestVpnServerItem(BaseModel):
    vpn_config: str
    country: Optional[str] = "DE"


@router.post("/api/vpn/test-server")
def api_test_server(item: TestVpnServerItem):
    if not item.vpn_config:
        raise HTTPException(status_code=400, detail="Thiếu file cấu hình vpn_config")
    try:
        vpn_manager.resolve_vpn_config(item.vpn_config)
    except (ValueError, FileNotFoundError):
        raise HTTPException(status_code=400, detail="Cấu hình VPN không hợp lệ")
    res = vpn_manager.check_vpn_ip_and_tiktok(
        conf_rel_path=item.vpn_config,
        target_country=item.country or "DE"
    )
    if res.get("api", {}).get("success"):
        res["ip"] = res["api"].get("ip")
        res["time_ms"] = res["api"].get("latency_ms")
    return res


@router.get("/api/vpn/active-tunnels")
def api_get_active_tunnels():
    tunnels = []
    for cid, t in vpn_manager.ACTIVE_TUNNELS.items():
        tunnels.append({
            "channel_id": cid,
            "socks_port": t.get("socks_port"),
            "conf_rel_path": t.get("conf_rel_path"),
            "location": t.get("location"),
            "pid": t.get("pid")
        })
    return {"count": len(tunnels), "tunnels": tunnels}


@router.post("/api/vpn/stop-all")
def api_stop_all_tunnels():
    count = len(vpn_manager.ACTIVE_TUNNELS)
    vpn_manager.stop_all_wireguard_proxies()
    try:
        from bkt_web import nord_api
        count += nord_api.stop_all_dynamic_nord_tunnels()
    except Exception:
        pass
    return {"success": True, "message": f"Đã ngắt toàn bộ {count} tunnel WireGuard!", "stopped_count": count}


# --- NordVPN Live API Endpoints (150+ Countries, 8000+ Servers) ---
class TestNordServerItem(BaseModel):
    hostname: str
    public_key: str
    country_code: Optional[str] = "DE"
    city: Optional[str] = ""


@router.get("/api/vpn/nord/countries")
def api_get_nord_countries(refresh: bool = False):
    try:
        from bkt_web import nord_api
        return nord_api.get_nord_countries(force_refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/vpn/nord/servers/{country_code}")
def api_get_nord_servers(country_code: str, limit: int = 100, refresh: bool = False):
    try:
        from bkt_web import nord_api
        return nord_api.get_nord_servers_for_country(country_code, limit=limit, force_refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/vpn/nord/test")
def api_test_nord_server(item: TestNordServerItem):
    try:
        from bkt_web import nord_api
        return nord_api.test_nord_server_connection(
            hostname=item.hostname,
            public_key=item.public_key,
            target_country=item.country_code or "DE",
            city=item.city or ""
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
