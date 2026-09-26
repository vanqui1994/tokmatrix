"""
Cầu nối VPN dùng chung cho mọi module.

Toàn bộ ứng dụng đã bỏ proxy ngoài; mọi kết nối đi ra đều qua WireGuard. Module
này bọc `vpn_manager` lại thành một API gọn: gán config cho một thực thể, mở
tunnel khi cần chạy, rồi trả về `socks5://127.0.0.1:<cổng>` để lớp bên dưới
(curl_cffi, Playwright, GPM/OMO) dùng như một proxy cục bộ.

`vpn_manager.ACTIVE_TUNNELS` là một dict chung cho cả ứng dụng, nên mỗi nhóm
thực thể phải có tiền tố riêng để id không đụng nhau: kênh TikTok dùng id số,
còn ở đây dùng khoá dạng "fb-12", "nn-7", "reg-3".
"""

from contextlib import contextmanager
from typing import Any, Dict, Optional, Tuple

try:
    from bkt_web import vpn_manager
except ImportError:
    import vpn_manager

# Tiền tố khoá tunnel cho từng nhóm thực thể
SCOPE_FACEBOOK = "fb"
SCOPE_NUOINICK = "nn"
SCOPE_FBREG = "reg"

DEFAULT_COUNTRY = "US"


class VpnError(Exception):
    pass


def tunnel_key(scope: str, entity_id: Any) -> str:
    return f"{scope}-{entity_id}"


def pick_config(country: Optional[str] = None) -> Tuple[str, str]:
    """
    Chọn ngẫu nhiên một config WireGuard theo quốc gia.
    Trả về (đường dẫn tương đối, nhãn hiển thị); ném lỗi nếu chưa nạp config nào.
    """
    picked = vpn_manager.pick_random_vpn(country or DEFAULT_COUNTRY)
    if not picked:
        raise VpnError(
            "Chưa có file cấu hình WireGuard nào trong bkt_web/vpn_configs. "
            "Thêm config rồi thử lại."
        )
    return picked["rel_path"], picked["label"]


def open_tunnel(scope: str, entity_id: Any, conf_rel_path: str) -> str:
    """
    Bật (hoặc dùng lại) tunnel cho một thực thể, trả về URL socks5 cục bộ.
    Tunnel được giữ lại giữa các lần chạy nên lần sau gọi gần như tức thì.
    """
    if not conf_rel_path:
        raise VpnError("Thực thể này chưa được gán VPN")
    try:
        info = vpn_manager.start_wireguard_proxy(tunnel_key(scope, entity_id), conf_rel_path)
    except Exception as exc:
        raise VpnError(f"Không bật được VPN: {exc}") from exc
    return info["socks5_url"]


def close_tunnel(scope: str, entity_id: Any) -> None:
    vpn_manager.stop_wireguard_proxy(tunnel_key(scope, entity_id))


@contextmanager
def tunnel(scope: str, entity_id: Any, conf_rel_path: str, keep_alive: bool = True):
    """
    Dùng tunnel trong một khối lệnh. Mặc định giữ tunnel sống sau khi xong để
    lần chạy kế tiếp của cùng thực thể không phải bắt tay WireGuard lại từ đầu.
    """
    url = open_tunnel(scope, entity_id, conf_rel_path)
    try:
        yield url
    finally:
        if not keep_alive:
            close_tunnel(scope, entity_id)


def location_label(conf_rel_path: str) -> str:
    return vpn_manager.format_vpn_location(conf_rel_path) if conf_rel_path else ""


def catalog() -> Dict[str, Any]:
    return vpn_manager.get_vpn_catalog()


def stats() -> Dict[str, Any]:
    return vpn_manager.get_vpn_stats()


def test_exit_ip(conf_rel_path: str) -> Dict[str, Any]:
    return vpn_manager.test_vpn_exit_ip(conf_rel_path)


def to_playwright_proxy(socks5_url: str) -> Dict[str, str]:
    """Playwright nhận socks5 cục bộ trực tiếp, không cần tài khoản đăng nhập."""
    return {"server": socks5_url}
