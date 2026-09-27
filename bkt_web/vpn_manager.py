import os
import time
import json
import random
import socket
import tempfile
import subprocess
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from curl_cffi import requests as curl_requests

try:
    from bkt_web.db_utils import connect_db
    from bkt_web.security import SecretStore, safe_child
    from bkt_web import profile_factory
except ImportError:
    from db_utils import connect_db
    from security import SecretStore, safe_child
    import profile_factory

BASE_DIR = Path(__file__).resolve().parent
VPN_CONFIGS_DIR = BASE_DIR / "vpn_configs"
PROFILES_DIR = BASE_DIR / "profiles"
BIN_DIR = BASE_DIR / "bin"
WIREPROXY_BIN = BIN_DIR / "wireproxy"
if os.environ.get("TOKMATRIX_WIREPROXY_PATH"):
    WIREPROXY_BIN = Path(os.environ["TOKMATRIX_WIREPROXY_PATH"])
if not WIREPROXY_BIN.exists():
    WIREPROXY_BIN = Path.home() / "go" / "bin" / "wireproxy"

CHROME_EXEC_PATH = os.environ.get(
    "TOKMATRIX_CHROME_PATH",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)
DB_PATH = BASE_DIR / "bkt_channels.db"
SECRET_STORE = SecretStore(BASE_DIR / ".secret.key")

# Country mapping to subfolders
COUNTRY_FOLDER_MAP = {
    "GB": "NordVPN_United_Kingdom",
    "UK": "NordVPN_United_Kingdom",
    "US": "NordVPN_United_States",
    "DE": "NordVPN_Germany",
    "JP": "NordVPN_Japan",
    "KR": "NordVPN_South_Korea_Seoul",
}

# In-memory tracking of active tunnels: channel_id -> dict
ACTIVE_TUNNELS: Dict[Any, Dict[str, Any]] = {}
# Cấp cổng và spawn wireproxy phải nối tiếp nhau: FastAPI chạy endpoint sync
# trong threadpool nên hai request song song có thể nhận trùng cổng.
TUNNEL_LOCK = threading.RLock()
# Mọi config NordVPN dùng chung 1–2 khoá của một tài khoản (giới hạn ~10 kết nối). Giữ tổng số tunnel
# dưới ngưỡng đó; tunnel quét/kiểm kênh (có idle_ttl) bị tắt trước để nhường chỗ, tunnel đăng bài thì không.
MAX_TUNNELS = max(1, int(os.environ.get("TOKMATRIX_MAX_TUNNELS", "6")))
MAX_SCAN_TUNNELS = max(1, int(os.environ.get("TOKMATRIX_MAX_SCAN_TUNNELS", "4")))

def get_free_port() -> int:
    """Finds a free local TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def reserve_free_port() -> tuple:
    """
    Như get_free_port nhưng GIỮ socket lại, trả về (socket, cổng).

    get_free_port đóng socket trước khi trả về, nên giữa lúc đó và lúc wireproxy
    bind có một khe thời gian mà một tunnel khác có thể bốc trúng cùng cổng.
    Người gọi phải tự đóng socket ngay trước khi spawn wireproxy.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    return s, s.getsockname()[1]


def _wait_for_tunnel(proc: subprocess.Popen, socks_port: int, timeout: float = 4.0) -> bool:
    """
    Chờ wireproxy mở cổng SOCKS5, và chỉ báo thành công khi CHÍNH tiến trình này
    còn sống.

    Dùng proc.wait() thay cho sleep+poll: wait() thu hồi tiến trình ngay nên
    không có độ trễ khiến ta tưởng nó còn sống. Nếu không, một tiến trình khác
    đang nghe trên cùng cổng sẽ làm is_port_listening trả True và thực thể này
    lặng lẽ đi ra bằng IP của thực thể kia.
    """
    deadline = time.time() + timeout
    opened = False
    while time.time() < deadline:
        try:
            proc.wait(timeout=0.2)
            return False  # tiến trình đã thoát
        except subprocess.TimeoutExpired:
            pass
        if is_port_listening(socks_port):
            opened = True
            break
    if not opened:
        return False
    # Cổng đã mở, nhưng nếu tiến trình chết ngay sau đó thì cổng ấy là của người
    # khác. Cho thêm một nhịp để loại hẳn trường hợp này.
    try:
        proc.wait(timeout=0.3)
        return False
    except subprocess.TimeoutExpired:
        return True

def get_vpn_catalog() -> Dict[str, List[Dict[str, str]]]:
    """
    Scans and indexes all WireGuard .conf files grouped by country code.
    Returns: { "GB": [{ "rel_path": "...", "server": "uk2474", "city": "Glasgow", "label": "..." }] }
    """
    catalog: Dict[str, List[Dict[str, str]]] = {
        "GB": [],
        "US": [],
        "DE": [],
        "JP": [],
        "KR": []
    }
    if not VPN_CONFIGS_DIR.exists():
        return catalog

    for code, folder in [("GB", "NordVPN_United_Kingdom"),
                         ("US", "NordVPN_United_States"),
                         ("DE", "NordVPN_Germany"),
                         ("JP", "NordVPN_Japan"),
                         ("KR", "NordVPN_South_Korea_Seoul")]:
        folder_path = VPN_CONFIGS_DIR / folder
        if not folder_path.exists():
            continue

        for conf in folder_path.glob("**/*.conf"):
            rel = conf.relative_to(VPN_CONFIGS_DIR)
            parts = rel.parts
            # parts e.g. ('NordVPN_United_Kingdom', 'Standard_P2P', 'Glasgow', 'uk2474.conf')
            city = parts[-2] if len(parts) >= 3 else "Default"
            server = conf.stem
            category = parts[1] if len(parts) >= 4 else ""
            label = f"{city} • {server} ({category})" if category else f"{city} • {server}"
            catalog[code].append({
                "rel_path": str(rel),
                "server": server,
                "city": city.replace("_", " "),
                "category": category.replace("_", " "),
                "label": label,
                "country": code
            })

    return catalog

def get_vpn_stats() -> Dict[str, Any]:
    """Returns overview statistics of available VPN configs."""
    cat = get_vpn_catalog()
    return {
        "total": sum(len(v) for v in cat.values()),
        "countries": {
            "GB": {"count": len(cat["GB"]), "name": "Vương Quốc Anh (UK)"},
            "US": {"count": len(cat["US"]), "name": "Hoa Kỳ (US)"},
            "DE": {"count": len(cat["DE"]), "name": "Cộng Hòa Liên Bang Đức (DE)"},
            "JP": {"count": len(cat["JP"]), "name": "Nhật Bản (JP)"},
            "KR": {"count": len(cat["KR"]), "name": "Hàn Quốc (KR)"},
        }
    }

def format_vpn_location(rel_path: str) -> str:
    """Formats relative path into human readable string: 'Glasgow, UK (uk2474)'"""
    if not rel_path:
        return ""
    parts = Path(rel_path).parts
    server = Path(rel_path).stem
    city = parts[-2].replace("_", " ") if len(parts) >= 3 else ""
    country_name = parts[0].replace("NordVPN_", "").replace("_", " ") if len(parts) >= 1 else ""
    return f"{city} ({server})" if city else server


def resolve_vpn_config(conf_rel_path: str) -> Path:
    if not conf_rel_path or not conf_rel_path.lower().endswith(".conf"):
        raise ValueError("Tên file VPN không hợp lệ")
    return safe_child(VPN_CONFIGS_DIR, conf_rel_path, must_exist=True)

# --- Phát hiện & thay server VPN đã khai tử ---------------------------------
# NordVPN rút server khỏi hạ tầng nhưng file .conf vẫn nằm lại trong kho, nên
# kênh trỏ vào đó sẽ hỏng lặng lẽ: wireproxy chỉ báo "no such host" và mọi thao
# tác của kênh (quét, dựng profile, mở trình duyệt) đều fail mà không nói vì sao.
_VPN_HOST_ALIVE_CACHE: Dict[str, bool] = {}
_VPN_HOST_CACHE_LOCK = threading.Lock()


def vpn_endpoint_host(conf_rel_path: str) -> str:
    """Đọc hostname trong dòng Endpoint của file config."""
    try:
        conf_path = safe_child(VPN_CONFIGS_DIR, conf_rel_path)
        text = conf_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    m = re.search(r"Endpoint\s*=\s*([^:\s]+)", text)
    return m.group(1).strip() if m else ""


def is_vpn_host_alive(host: str, use_cache: bool = True) -> bool:
    """Server còn sống hay không, xét bằng phân giải DNS (có nhớ kết quả)."""
    if not host:
        return False
    if use_cache:
        with _VPN_HOST_CACHE_LOCK:
            if host in _VPN_HOST_ALIVE_CACHE:
                return _VPN_HOST_ALIVE_CACHE[host]
    try:
        socket.getaddrinfo(host, None)
        alive = True
    except Exception:
        alive = False
    with _VPN_HOST_CACHE_LOCK:
        _VPN_HOST_ALIVE_CACHE[host] = alive
    return alive


def is_vpn_config_alive(conf_rel_path: str) -> bool:
    return is_vpn_host_alive(vpn_endpoint_host(conf_rel_path))


def find_dead_vpn_assignments() -> List[Dict[str, Any]]:
    """Liệt kê các kênh đang trỏ vào server VPN không còn phân giải được."""
    conn = connect_db(DB_PATH)
    rows = conn.execute(
        """SELECT id, username, note, country, publisher, vpn_config, vpn_location
           FROM channels WHERE trim(coalesce(vpn_config,''))<>'' ORDER BY id"""
    ).fetchall()
    conn.close()

    hosts = {}
    for r in rows:
        hosts.setdefault(vpn_endpoint_host(r[5]), []).append(r)

    dead = []
    with ThreadPoolExecutor(max_workers=32) as ex:
        results = dict(zip(hosts.keys(), ex.map(lambda h: is_vpn_host_alive(h, use_cache=False), hosts.keys())))
    for host, chans in hosts.items():
        if results.get(host):
            continue
        for r in chans:
            dead.append({
                "channel_id": r[0],
                "username": r[1] or (r[2] or ""),
                "country": (r[3] or "").upper(),
                "publisher": r[4] or "",
                "vpn_config": r[5],
                "vpn_location": r[6] or "",
                "dead_host": host or "(không đọc được Endpoint)",
            })
    return dead


def reassign_dead_vpns(apply: bool = True, refresh_profile_meta: bool = True) -> Dict[str, Any]:
    """Tự chuyển các kênh đang dính server chết sang server còn sống cùng nước.

    apply=False chỉ liệt kê để xem trước. Nếu kênh đã có profile thì cập nhật
    luôn toạ độ/thành phố trong profile_meta.json cho khớp điểm thoát mới
    (múi giờ không đổi vì vẫn cùng quốc gia).
    """
    dead = find_dead_vpn_assignments()
    moved, failed = [], []

    for item in dead:
        ch_id, country = item["channel_id"], item["country"] or "DE"
        if not apply:
            continue
        picked = None
        for _ in range(12):
            cand = pick_random_vpn(country)
            if cand and is_vpn_config_alive(cand["rel_path"]):
                picked = cand
                break
        if not picked:
            failed.append({**item, "error": f"Không tìm được server {country} còn sống"})
            continue

        conn = connect_db(DB_PATH)
        conn.execute("UPDATE channels SET vpn_config=?, vpn_location=? WHERE id=?",
                     (picked["rel_path"], picked["label"], ch_id))
        conn.commit()
        conn.close()

        if refresh_profile_meta:
            p_dir = PROFILES_DIR / f"channel_{ch_id}"
            if (p_dir / profile_factory.META_FILENAME).exists():
                cfg = profile_factory.resolve_profile_config(country, picked["label"])
                profile_factory.write_profile_meta(p_dir, cfg)

        # Tunnel cũ (nếu còn) đang trỏ vào server chết, phải bỏ đi.
        try:
            stop_wireguard_proxy(ch_id)
        except Exception:
            pass

        moved.append({**item, "new_config": picked["rel_path"], "new_location": picked["label"]})

    return {"dead_found": len(dead), "moved": len(moved), "failed": len(failed),
            "details": moved, "errors": failed, "dead": dead}


def pick_random_vpn(country: str, require_alive: bool = True, max_tries: int = 12) -> Optional[Dict[str, str]]:
    """Bốc ngẫu nhiên một config VPN theo mã quốc gia.

    Kho còn lẫn những server NordVPN đã khai tử (dải de731-739, một số kr…):
    file .conf vẫn nằm đó nhưng hostname không phân giải được nữa, gán trúng là
    kênh hỏng lặng lẽ. Vì vậy mặc định chỉ trả về server còn sống — DNS đã được
    nhớ nên chi phí gần như bằng không sau lần tra đầu.
    """
    c = country.strip().upper()
    if c == "UK":
        c = "GB"
    cat = get_vpn_catalog()
    confs = cat.get(c, [])
    if not confs:
        # Fallback to US or GB if country not in list
        confs = cat.get("GB") or cat.get("US", [])
    if not confs:
        return None

    p2p = [x for x in confs if "Standard_P2P" in x.get("rel_path", "")]
    pool = p2p or confs
    if not require_alive:
        return random.choice(pool)

    for _ in range(min(max_tries, len(pool))):
        cand = random.choice(pool)
        if is_vpn_config_alive(cand.get("rel_path", "")):
            return cand
    # Không tra được server sống trong giới hạn thử: thà trả về một cái còn hơn
    # chặn luồng gọi, phía trên vẫn báo lỗi rõ khi tunnel không lên.
    return random.choice(pool)

def pick_distinct_vpns(country: str, count: int, exclude: Optional[set] = None,
                       require_alive: bool = True) -> List[Dict[str, str]]:
    """
    Bốc `count` config cho cùng một quốc gia, KHÔNG hoàn lại, nên các tài khoản
    không dùng trùng server (và do đó không trùng IP).

    Cùng thứ tự ưu tiên với pick_random_vpn: có Standard_P2P thì chỉ lấy P2P.
    Nếu số config còn lại ít hơn `count` thì xáo lại rồi đi tiếp vòng mới —
    vẫn là cách phân bổ đều nhất có thể thay vì bốc trùng ngẫu nhiên.
    """
    if count <= 0:
        return []
    c = country.strip().upper()
    if c == "UK":
        c = "GB"
    cat = get_vpn_catalog()
    confs = cat.get(c, []) or cat.get("GB") or cat.get("US", [])
    if not confs:
        return []
    p2p = [x for x in confs if "Standard_P2P" in x.get("rel_path", "")]
    pool = p2p or confs

    excluded = exclude or set()
    preferred = [x for x in pool if x.get("rel_path") not in excluded] or pool

    picked: List[Dict[str, str]] = []
    bag: List[Dict[str, str]] = []
    attempts = 0
    # Chặn vòng lặp vô hạn nếu cả nhóm server của quốc gia đó đều chết.
    max_attempts = count * 20 + len(pool)
    while len(picked) < count and attempts < max_attempts:
        if not bag:
            bag = list(preferred if len(picked) == 0 or preferred is not pool else pool)
            random.shuffle(bag)
            preferred = pool
        cand = bag.pop()
        attempts += 1
        # Bỏ qua server đã khai tử, nếu không cả lô kênh sẽ được gán vào một
        # hostname không phân giải được và hỏng lặng lẽ.
        if require_alive and not is_vpn_config_alive(cand.get("rel_path", "")):
            continue
        picked.append(cand)
    return picked


def assign_unique_vpn(channel_id: int, country: str) -> Optional[str]:
    """Gán cho kênh một config VPN chưa kênh nào dùng (cùng nước), lưu vào channels.vpn_config.

    Mỗi acc phải ra Internet từ MỘT IP riêng cố định: 26/09 lối quét kênh cũ dồn 61 acc vào cùng
    uk6083 (và acc Đức vào IP Anh) → TikTok thấy nhiều acc chung IP.
    """
    conn = connect_db(DB_PATH)
    try:
        used = {r[0] for r in conn.execute("SELECT vpn_config FROM channels WHERE trim(coalesce(vpn_config,''))<>''")}
        picked = pick_distinct_vpns(country or "GB", 1, exclude=used)
        if not picked or picked[0]["rel_path"] in used:
            return None
        rel = picked[0]["rel_path"]
        conn.execute("UPDATE channels SET vpn_config=?, vpn_location=? WHERE id=? AND trim(coalesce(vpn_config,''))=''",
                     (rel, picked[0]["label"], channel_id))
        conn.commit()
        row = conn.execute("SELECT vpn_config FROM channels WHERE id=?", (channel_id,)).fetchone()
        return (row[0] if row else "") or None
    finally:
        conn.close()


def is_port_listening(port: int) -> bool:
    """Checks if a local TCP port is accepting connections."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except Exception:
        return False

def build_sanitized_wireproxy_config(conf_rel_path: str, socks_port: int, http_port: int = 0) -> str:
    """
    Reads a WireGuard .conf file, sanitizes malformed keys,
    adds reliable global DNS servers, and sets up [Socks5].
    """
    full_path = resolve_vpn_config(conf_rel_path)

    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    sanitized_lines = []
    dns_written = False
    for line in lines:
        stripped = line.strip()
        if stripped.lower().startswith("privatekey"):
            parts = line.split("=", 1)
            val = parts[1].strip()
            # WireGuard base64 key is exactly 44 characters ending with '='
            if len(val) > 44:
                val = val[:44]
            sanitized_lines.append(f"PrivateKey = {val}\n")
        elif stripped.lower().startswith("dns"):
            # Ensure high-availability DNS for international TikTok endpoints
            sanitized_lines.append("DNS = 103.86.96.100, 8.8.8.8, 1.1.1.1\n")
            dns_written = True
        else:
            sanitized_lines.append(line)

    if not dns_written:
        # File .conf không khai DNS thì tự chèn, nếu không tunnel sẽ đi theo
        # resolver của máy và lộ vùng thật khi phân giải tên miền.
        for idx, line in enumerate(sanitized_lines):
            if line.strip().lower().startswith("[interface]"):
                sanitized_lines.insert(idx + 1, "DNS = 103.86.96.100, 8.8.8.8, 1.1.1.1\n")
                break

    sanitized_lines.append("\n[Socks5]\n")
    sanitized_lines.append(f"BindAddress = 127.0.0.1:{socks_port}\n")

    return "".join(sanitized_lines)

def _public_tunnel(info: Dict[str, Any]) -> Dict[str, Any]:
    """Bản sao không kèm đối tượng Popen, để trả ra ngoài thì JSON hoá được."""
    return {k: v for k, v in info.items() if k != "proc"}


def _discard_tunnel(active: Dict[str, Any]) -> None:
    """Kết thúc tiến trình và xoá file config tạm của một tunnel đã bỏ."""
    proc = active.get("proc")
    if proc:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    conf_file = active.get("conf_file")
    if conf_file:
        # File này chứa PrivateKey của WireGuard, không được để lại trong /tmp.
        Path(conf_file).unlink(missing_ok=True)


_reaper_started = False


def _ensure_reaper() -> None:
    """Luồng nền tắt tunnel quét/kiểm kênh hết hạn, kể cả khi không còn ai mở tunnel mới."""
    global _reaper_started
    with TUNNEL_LOCK:
        if _reaper_started:
            return
        _reaper_started = True

    def loop() -> None:
        while True:
            time.sleep(60)
            try:
                reap_idle_tunnels()
            except Exception:
                pass

    threading.Thread(target=loop, name="vpn-tunnel-reaper", daemon=True).start()


def _make_room_locked(scan: bool) -> List[Any]:
    """Gọi khi đang giữ TUNNEL_LOCK, trước khi dựng tunnel mới: tắt tunnel quét dùng lâu nhất nếu vượt
    MAX_SCAN_TUNNELS (tunnel quét mới) hoặc MAX_TUNNELS (mọi tunnel). Không bao giờ tắt tunnel đăng bài."""
    evicted: List[Any] = []
    while True:
        scans = sorted(((info["expires_at"], key) for key, info in ACTIVE_TUNNELS.items() if info.get("expires_at")),
                       key=lambda item: item[0])
        over = len(ACTIVE_TUNNELS) >= MAX_TUNNELS or (scan and len(scans) >= MAX_SCAN_TUNNELS)
        if not over or not scans:
            return evicted
        key = scans[0][1]
        _discard_tunnel(ACTIVE_TUNNELS.pop(key))
        evicted.append(key)


def _proc_start_ticks(pid: int) -> Optional[int]:
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
        return int(stat.rsplit(")", 1)[1].split()[19])
    except (OSError, ValueError, IndexError):
        return None


def cleanup_orphan_tunnels() -> List[int]:
    """Khi app khởi động (Linux): tắt tiến trình wireproxy cùng user mà app này không quản lý và đã chạy
    trước app — mồ côi từ lần chạy cũ (27/09 có 6 tiến trình chạy 3–4 ngày, chiếm kết nối NordVPN) — và
    xoá file config tạm chứa PrivateKey của chúng."""
    proc_root = Path("/proc")
    my_start = _proc_start_ticks(os.getpid())
    if not proc_root.is_dir() or my_start is None:
        return []
    with TUNNEL_LOCK:
        managed = {info.get("pid") for info in ACTIVE_TUNNELS.values()}
    killed = []
    uid = os.getuid()
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        try:
            if entry.stat().st_uid != uid:
                continue
            argv = (entry / "cmdline").read_bytes().split(b"\0")
        except OSError:
            continue
        if not argv or not argv[0].endswith(b"wireproxy") or pid in managed:
            continue
        start = _proc_start_ticks(pid)
        if start is None or start >= my_start:
            continue
        try:
            os.kill(pid, 15)
            killed.append(pid)
        except OSError:
            continue
        if b"-c" in argv[:-1]:
            conf = Path(argv[argv.index(b"-c") + 1].decode(errors="ignore"))
            if conf.parent == Path(tempfile.gettempdir()) and conf.suffix == ".conf":
                conf.unlink(missing_ok=True)
    return killed


def tunnel_count() -> Dict[str, int]:
    with TUNNEL_LOCK:
        scan = sum(1 for info in ACTIVE_TUNNELS.values() if info.get("expires_at"))
        return {"total": len(ACTIVE_TUNNELS), "scan": scan, "publish": len(ACTIVE_TUNNELS) - scan}


def reap_idle_tunnels(now: Optional[float] = None) -> int:
    """Tắt tunnel mở với idle_ttl (quét/kiểm kênh) đã quá hạn. Tunnel không có hạn (đăng bài) không bị đụng."""
    now = time.time() if now is None else now
    with TUNNEL_LOCK:
        expired = [key for key, info in ACTIVE_TUNNELS.items()
                   if info.get("expires_at") and info["expires_at"] < now]
    for key in expired:
        stop_wireguard_proxy(key)
    return len(expired)


def start_wireguard_proxy(channel_id: Any, conf_rel_path: str, idle_ttl: Optional[int] = None) -> Dict[str, Any]:
    """
    Bật hoặc dùng lại một tiến trình wireproxy nền cho một thực thể, trên một
    cổng SOCKS5 cục bộ riêng.

    idle_ttl (giây): tunnel tự tắt khi quá hạn kể từ lần dùng cuối (reap_idle_tunnels). Gọi không có
    idle_ttl (đăng bài, tự dừng tunnel khi xong) thì bỏ hạn của tunnel đang dùng lại, để không bị tắt giữa chừng.
    """
    reap_idle_tunnels()
    with TUNNEL_LOCK:
        existing = ACTIVE_TUNNELS.get(channel_id)

        if existing:
            proc_alive = existing.get("proc") is None or existing["proc"].poll() is None
            same_conf = existing.get("conf_rel_path") == conf_rel_path
            if same_conf and proc_alive and is_port_listening(existing.get("socks_port", 0)):
                if idle_ttl is None:
                    existing.pop("expires_at", None)
                elif existing.get("expires_at"):
                    existing["expires_at"] = max(existing["expires_at"], time.time() + idle_ttl)
                return _public_tunnel(existing)
            # Đổi config, hoặc tiến trình đã chết: dọn hẳn tiến trình và file
            # config cũ trước khi dựng lại, nếu không sẽ bỏ lại tiến trình mồ côi
            # và file .conf chứa private key trong /tmp.
            ACTIVE_TUNNELS.pop(channel_id, None)
            _discard_tunnel(existing)

        _make_room_locked(scan=bool(idle_ttl))

        wireproxy_exec = str(WIREPROXY_BIN)
        if not os.path.exists(wireproxy_exec):
            raise RuntimeError(f"wireproxy binary not found at {wireproxy_exec}")

        # Giữ cổng cho tới sát lúc spawn để không tunnel nào bốc trùng.
        reservation, socks_port = reserve_free_port()
        try:
            conf_content = build_sanitized_wireproxy_config(conf_rel_path, socks_port)
            tmp_conf = tempfile.NamedTemporaryFile("w", suffix=f"_{channel_id}.conf", delete=False)
            tmp_conf.write(conf_content)
            tmp_conf.flush()
            tmp_conf.close()
        finally:
            reservation.close()

        try:
            proc = subprocess.Popen(
                [wireproxy_exec, "-s", "-c", tmp_conf.name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except Exception:
            Path(tmp_conf.name).unlink(missing_ok=True)
            raise

        if not _wait_for_tunnel(proc, socks_port):
            _discard_tunnel({"proc": proc, "conf_file": tmp_conf.name})
            raise RuntimeError(f"Không thể khởi động WireGuard tunnel trên cổng {socks_port}")

        tunnel_info = {
            "channel_id": channel_id,
            "conf_rel_path": conf_rel_path,
            "socks_port": socks_port,
            "socks5_url": f"socks5://127.0.0.1:{socks_port}",
            "proc": proc,
            "pid": proc.pid,
            "conf_file": tmp_conf.name,
            "started_at": int(time.time()),
            "location": format_vpn_location(conf_rel_path)
        }
        if idle_ttl:
            tunnel_info["expires_at"] = time.time() + idle_ttl
            _ensure_reaper()

        ACTIVE_TUNNELS[channel_id] = tunnel_info
        return _public_tunnel(tunnel_info)


TUNNEL_PROBE_URL = "https://www.tiktok.com/"


def tunnel_reaches(socks_port: int, url: str = TUNNEL_PROBE_URL, timeout: int = 8) -> bool:
    """Tunnel đã thật sự ra được Internet chưa: gọi url qua SOCKS5 (cổng mở chưa chắc handshake xong)."""
    try:
        out = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", str(timeout),
             "--socks5-hostname", f"127.0.0.1:{socks_port}", url],
            capture_output=True, text=True, timeout=timeout + 5,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    code = (out.stdout or "").strip()
    return code.isdigit() and code != "000"


def start_verified_wireguard_proxy(channel_id: Any, conf_rel_path: str, tunnels: int = 3, checks: int = 3,
                                   check_gap: float = 5.0, probe=None, log=None) -> Dict[str, Any]:
    """start_wireguard_proxy + chỉ trả tunnel khi gọi được TikTok qua nó.

    NordVPN (mọi config dùng chung 1–2 khoá) thỉnh thoảng không bắt tay được trên tunnel mới: cổng SOCKS
    vẫn mở nhưng mọi kết nối treo → trình duyệt ERR_TIMED_OUT sau 30 s (27/09: 7 task). Dựng lại tunnel
    thường được ngay. Thử tối đa `tunnels` tunnel, mỗi tunnel `checks` lần cách `check_gap` giây.
    """
    probe = probe or tunnel_reaches
    last_error = ""
    for attempt in range(1, tunnels + 1):
        try:
            tunnel = start_wireguard_proxy(channel_id, conf_rel_path)
        except Exception as exc:
            last_error = str(exc)
            tunnel = None
        if tunnel:
            for check in range(checks):
                if probe(tunnel["socks_port"]):
                    return tunnel
                if check + 1 < checks:
                    time.sleep(check_gap)
            last_error = f"tunnel {format_vpn_location(conf_rel_path)} không gọi được TikTok"
        stop_wireguard_proxy(channel_id)
        if log and attempt < tunnels:
            log(f"🛡️ VPN chưa thông ({last_error}) — dựng lại tunnel lần {attempt + 1}/{tunnels}", "warning")
    raise RuntimeError(f"VPN không kết nối được tới TikTok sau {tunnels} lần dựng tunnel: {last_error}")


def stop_wireguard_proxy(channel_id: Any):
    """Gracefully terminates wireproxy process for a channel."""
    with TUNNEL_LOCK:
        active = ACTIVE_TUNNELS.pop(channel_id, None)
    if active:
        _discard_tunnel(active)


def stop_all_wireguard_proxies() -> None:
    with TUNNEL_LOCK:
        keys = list(ACTIVE_TUNNELS)
    for channel_id in keys:
        stop_wireguard_proxy(channel_id)

def check_vpn_ip_and_tiktok(
    conf_rel_path: str,
    channel_id: Optional[int] = None,
    cookie_str: Optional[str] = None,
    target_country: Optional[str] = None
) -> Dict[str, Any]:
    """
    Toàn diện: Kiểm tra IP WireGuard VPN qua IP API & kiểm tra nhận diện vùng / kết nối từ TikTok.
    1. Tái sử dụng tunnel đang chạy của kênh nếu có, hoặc khởi tạo tunnel tạm thời.
    2. Chạy đồng thời:
       - Tra cứu IP công khai, Quốc gia, Thành phố, ISP, Latency từ IP Geolocation API.
       - Kết nối TikTok (curl_cffi Chrome impersonation) kiểm tra WAF, Region, Cluster, Latency & Cookie.
    3. Đánh giá độ trùng khớp vùng giữa Quốc Gia Kênh - IP API - TikTok.
    """
    target_country = (target_country or "").strip().upper()
    if target_country == "UK":
        target_country = "GB"

    reused_tunnel = False
    proc = None
    tmp_conf_path = None
    socks_port = 0

    if channel_id and channel_id in ACTIVE_TUNNELS:
        active = ACTIVE_TUNNELS[channel_id]
        candidate_port = active.get("socks_port", 0)
        if candidate_port and is_port_listening(candidate_port):
            socks_port = candidate_port
            reused_tunnel = True

    if not reused_tunnel:
        socks_port = get_free_port()
        conf_content = build_sanitized_wireproxy_config(conf_rel_path, socks_port)
        tmp = tempfile.NamedTemporaryFile("w", suffix=f"_check_{socks_port}.conf", delete=False)
        tmp.write(conf_content)
        tmp.flush()
        tmp.close()
        tmp_conf_path = tmp.name

        wireproxy_exec = str(WIREPROXY_BIN)
        if not os.path.exists(wireproxy_exec):
            Path(tmp_conf_path).unlink(missing_ok=True)
            return {
                "success": False,
                "error": f"Không tìm thấy binary wireproxy tại {wireproxy_exec}"
            }

        try:
            proc = subprocess.Popen(
                [wireproxy_exec, "-s", "-c", tmp_conf_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except Exception as exc:
            Path(tmp_conf_path).unlink(missing_ok=True)
            return {"success": False, "error": f"Không thể chạy wireproxy: {exc}"}

        opened = False
        for _ in range(25):
            time.sleep(0.12)
            if is_port_listening(socks_port):
                opened = True
                break
            if proc.poll() is not None:
                break

        if not opened:
            if proc:
                try:
                    proc.terminate()
                except Exception:
                    pass
            if tmp_conf_path and os.path.exists(tmp_conf_path):
                try:
                    os.remove(tmp_conf_path)
                except Exception:
                    pass
            return {
                "success": False,
                "error": f"Không thể khởi động WireGuard tunnel trên cổng {socks_port}. Vui lòng thử lại hoặc đổi server VPN khác."
            }

    api_result: Dict[str, Any] = {"success": False}
    tiktok_result: Dict[str, Any] = {"success": False}

    def run_api_check():
        t0 = time.time()
        try:
            r = subprocess.run(
                [
                    "curl", "-s", "--connect-timeout", "6",
                    "--socks5-hostname", f"127.0.0.1:{socks_port}",
                    "http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,zip,timezone,isp,org,as,query"
                ],
                capture_output=True,
                text=True,
                timeout=8
            )
            elapsed = int((time.time() - t0) * 1000)
            if r.returncode == 0 and r.stdout:
                d = json.loads(r.stdout)
                if d.get("status") == "success":
                    return {
                        "success": True,
                        "ip": d.get("query"),
                        "country": d.get("country"),
                        "country_code": (d.get("countryCode") or "").upper(),
                        "city": d.get("city"),
                        "region_name": d.get("regionName"),
                        "isp": d.get("isp"),
                        "org": d.get("org"),
                        "timezone": d.get("timezone"),
                        "latency_ms": elapsed
                    }
        except Exception:
            pass

        # Fallback to ipify
        try:
            t0 = time.time()
            r = subprocess.run(
                ["curl", "-s", "--connect-timeout", "6", "--socks5-hostname", f"127.0.0.1:{socks_port}", "https://api.ipify.org?format=json"],
                capture_output=True,
                text=True,
                timeout=8
            )
            elapsed = int((time.time() - t0) * 1000)
            if r.returncode == 0 and r.stdout:
                d = json.loads(r.stdout)
                return {
                    "success": True,
                    "ip": d.get("ip"),
                    "country": "Đang nhận diện",
                    "country_code": target_country or "",
                    "city": "",
                    "isp": "WireGuard Server",
                    "latency_ms": elapsed
                }
        except Exception as e:
            return {"success": False, "error": f"Lỗi truy vấn IP API: {e}"}

        return {"success": False, "error": "Không nhận được phản hồi từ máy chủ kiểm tra IP"}

    def run_tiktok_check():
        t0 = time.time()
        try:
            s = curl_requests.Session(
                impersonate="chrome120",
                proxies={"http": f"socks5h://127.0.0.1:{socks_port}", "https": f"socks5h://127.0.0.1:{socks_port}"}
            )
            s.headers.update({
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://www.tiktok.com/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            })

            cookie_dict = {}
            if cookie_str:
                for item in cookie_str.split(";"):
                    if "=" in item:
                        k, v = item.strip().split("=", 1)
                        cookie_dict[k.strip()] = v.strip()
                if cookie_dict:
                    s.cookies.update(cookie_dict)

            r = s.get("https://www.tiktok.com/", timeout=10)
            elapsed = int((time.time() - t0) * 1000)

            tt_region = None
            cluster = None
            lang = None

            m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', r.text)
            if m:
                try:
                    d = json.loads(m.group(1))
                    app_ctx = d.get("__DEFAULT_SCOPE__", {}).get("webapp.app-context", {})
                    tt_region = app_ctx.get("region")
                    cluster = app_ctx.get("clusterRegion")
                    lang = app_ctx.get("language")
                except Exception:
                    pass

            waf_passed = (r.status_code == 200) and ("_wafchallengeid" not in r.text)

            res = {
                "success": True,
                "status_code": r.status_code,
                "region": (tt_region or "").upper() if tt_region else None,
                "cluster": cluster,
                "language": lang,
                "waf_passed": waf_passed,
                "latency_ms": elapsed,
                "cookie_status": "N/A",
                "account_username": None
            }

            if cookie_dict and r.status_code == 200:
                try:
                    acc_r = s.get("https://www.tiktok.com/passport/web/account/info/", timeout=6)
                    if acc_r.status_code == 200:
                        acc_d = acc_r.json()
                        if acc_d.get("message") == "success" and "data" in acc_d:
                            res["cookie_status"] = "LIVE"
                            res["account_username"] = acc_d["data"].get("username")
                        else:
                            res["cookie_status"] = "EXPIRED"
                except Exception:
                    pass

            return res
        except Exception as e:
            return {"success": False, "error": f"Lỗi kết nối TikTok: {e}"}

    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            f_api = ex.submit(run_api_check)
            f_tt = ex.submit(run_tiktok_check)
            api_result = f_api.result()
            tiktok_result = f_tt.result()
    finally:
        if not reused_tunnel:
            if proc:
                try:
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
            if tmp_conf_path and os.path.exists(tmp_conf_path):
                try:
                    os.remove(tmp_conf_path)
                except Exception:
                    pass

    # Match analysis
    api_cc = (api_result.get("country_code") or "").upper()
    tt_reg = (tiktok_result.get("region") or "").upper()
    target_c = target_country.upper() if target_country else ""

    match_status = "UNKNOWN"
    match_msg = ""
    is_match = False

    if api_result.get("success") and tiktok_result.get("success"):
        if target_c and api_cc and tt_reg:
            if target_c == api_cc and target_c == tt_reg:
                match_status = "PERFECT"
                is_match = True
                match_msg = f"Hoàn toàn trùng khớp 100%: Kênh ({target_c}) ⟷ IP ({api_cc}) ⟷ TikTok ({tt_reg})"
            elif api_cc == tt_reg:
                match_status = "VPN_TIKTOK_MATCH"
                is_match = (api_cc == target_c)
                match_msg = f"IP & TikTok đều nhận diện {api_cc}, nhưng kênh đăng ký là {target_c}"
            else:
                match_status = "MISMATCH"
                is_match = False
                match_msg = f"Lệch vùng: Kênh ({target_c}) ⟷ IP ({api_cc}) ⟷ TikTok ({tt_reg})"
        elif api_cc and tt_reg:
            if api_cc == tt_reg:
                match_status = "PERFECT"
                is_match = True
                match_msg = f"IP API và TikTok đều nhận diện chuẩn vùng {api_cc}"
            else:
                match_status = "MISMATCH"
                is_match = False
                match_msg = f"IP API ({api_cc}) khác vùng TikTok nhận diện ({tt_reg})"
    elif api_result.get("success"):
        match_msg = f"Chỉ kiểm tra được IP API ({api_cc})"
    else:
        match_msg = "Không thể kết nối qua VPN"

    return {
        "success": True,
        "conf_path": conf_rel_path,
        "location": format_vpn_location(conf_rel_path),
        "target_country": target_c,
        "reused_tunnel": reused_tunnel,
        "api": api_result,
        "tiktok": tiktok_result,
        "match": {
            "is_match": is_match,
            "status": match_status,
            "message": match_msg
        }
    }

def test_vpn_exit_ip(conf_rel_path: str) -> Dict[str, Any]:
    """
    Backwards-compatible test function.
    Returns: { "success": True, "ip": "84.247.42.61", "time_ms": 250, "location": "Glasgow (uk2474)" }
    """
    full_res = check_vpn_ip_and_tiktok(conf_rel_path)
    if full_res.get("success") and full_res.get("api", {}).get("success"):
        api = full_res["api"]
        return {
            "success": True,
            "ip": api.get("ip"),
            "time_ms": api.get("latency_ms", 0),
            "location": full_res.get("location"),
            "full": full_res
        }
    return {
        "success": False,
        "error": full_res.get("error") or full_res.get("api", {}).get("error") or "Không thể kiểm tra VPN"
    }

def ensure_profile_dir(channel_id: int) -> Path:
    """Creates and returns the persistent profile directory for a channel."""
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    p_dir = PROFILES_DIR / f"channel_{channel_id}"
    p_dir.mkdir(parents=True, exist_ok=True)
    return p_dir

async def sync_cookies_to_profile(channel_id: int, cookie_str: str, socks_port: int) -> bool:
    """
    Uses a temporary headless Playwright persistent context to inject cookies
    directly into the Chrome user-data-dir profile SQLite store.
    """
    from playwright.async_api import async_playwright
    p_dir = ensure_profile_dir(channel_id)

    # Cookie phải có hạn dùng, nếu không Chrome coi là session cookie và xoá
    # hết ở lần mở sau — xem build_persistent_cookie_list().
    cookie_list = build_persistent_cookie_list(cookie_str)

    if not cookie_list:
        return False

    try:
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                str(p_dir),
                executable_path=CHROME_EXEC_PATH if os.path.exists(CHROME_EXEC_PATH) else None,
                headless=True,
                proxy={"server": f"socks5://127.0.0.1:{socks_port}"},
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled"] + profile_factory.chrome_launch_args({})
            )
            await context.add_cookies(cookie_list)
            # Brief check
            page = await context.new_page()
            try:
                await page.goto("https://www.tiktok.com/", wait_until="commit", timeout=5000)
            except Exception:
                pass
            await context.close()
            return True
    except Exception as e:
        print(f"[VPN/Profile] Error syncing cookies for channel #{channel_id}: {e}")
        return False

def cleanup_profile_locks(p_dir: Path, target_socks_port: int):
    """
    Cleans up stale Chrome SingletonLock symlinks.
    If an existing Chrome is running with an old/dead proxy port, terminates it
    so the fresh Chrome instance can bind to the new active WireGuard tunnel.
    """
    lock_file = p_dir / "SingletonLock"
    if lock_file.exists() or lock_file.is_symlink():
        try:
            target = os.readlink(str(lock_file))
            pid_str = target.split("-")[-1]
            pid = int(pid_str)
            try:
                os.kill(pid, 0)
                cmd_out = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout
                # PID trong SingletonLock có thể đã được hệ thống cấp lại cho
                # tiến trình khác, nên chỉ giết khi chắc chắn đó là đúng Chrome
                # của đúng profile này mà lại đang gắn cổng SOCKS5 khác.
                owns_profile = str(p_dir) in cmd_out
                is_chrome = "chrome" in cmd_out.lower()
                if owns_profile and is_chrome and f":{target_socks_port}" not in cmd_out:
                    os.kill(pid, 15)
                    time.sleep(0.5)
            except OSError:
                pass
        except Exception:
            pass

        for fname in ["SingletonLock", "SingletonSocket", "SingletonCookie"]:
            fpath = p_dir / fname
            if fpath.exists() or fpath.is_symlink():
                try:
                    fpath.unlink()
                except Exception:
                    pass

# --- Dựng sẵn profile theo quốc gia -----------------------------------------

COOKIE_TTL_SECONDS = 365 * 24 * 3600


def build_persistent_cookie_list(cookie_str: str, ttl: int = COOKIE_TTL_SECONDS) -> List[Dict[str, Any]]:
    """Tách chuỗi cookie thành danh sách cho Playwright, CÓ hạn dùng.

    Nếu không đặt `expires`, Chrome xếp chúng vào loại session cookie
    (is_persistent=0) và xoá sạch ngay lần khởi động sau — profile vừa dựng
    xong mở ra là mất đăng nhập. Kiểm chứng: profile tiêm 31 cookie, mở lại
    một lần chỉ còn đúng 1 cookie persistent duy nhất.
    """
    expires = int(time.time()) + ttl
    out: List[Dict[str, Any]] = []
    for item in (cookie_str or "").split(";"):
        item = item.strip()
        if "=" not in item:
            continue
        k, v = item.split("=", 1)
        k = k.strip()
        if not k:
            continue
        out.append({
            "name": k,
            "value": v.strip(),
            "domain": ".tiktok.com",
            "path": "/",
            "expires": expires,
            "secure": True,
        })
    return out


async def build_channel_profile(channel_id: int, inject_cookie: bool = True) -> Dict[str, Any]:
    """Dựng sẵn một Chrome profile khớp quốc gia cho kênh, KHÔNG mở cửa sổ.

    Chạy tunnel WireGuard đúng vùng, tạo user-data-dir bằng một phiên Chrome ẩn
    đã đặt múi giờ / toạ độ / chặn WebRTC, tiêm cookie, rồi ghi profile_meta.json
    và cột channels.profile_dir. Tunnel được tắt sau khi xong để không bỏ lại
    hàng trăm tiến trình wireproxy khi chạy cả dàn kênh.
    """
    from playwright.async_api import async_playwright

    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT username, cookie, country, vpn_config, vpn_location, note FROM channels WHERE id=?", (channel_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Không tìm thấy kênh ID #{channel_id}")

    username, stored_cookie, country, vpn_conf, vpn_loc, note = row
    cookie_str = SECRET_STORE.decrypt(stored_cookie)
    country = (country or "KR").upper()

    if not vpn_conf:
        picked = pick_random_vpn(country)
        if not picked:
            conn.close()
            raise ValueError(f"Không có cấu hình VPN cho quốc gia {country}")
        vpn_conf, vpn_loc = picked["rel_path"], picked["label"]
        c.execute("UPDATE channels SET vpn_config=?, vpn_location=? WHERE id=?", (vpn_conf, vpn_loc, channel_id))
        conn.commit()
    conn.close()

    cfg = profile_factory.resolve_profile_config(country, vpn_loc or "")
    p_dir = ensure_profile_dir(channel_id)

    tunnel = start_wireguard_proxy(channel_id, vpn_conf)
    socks_port = tunnel["socks_port"]
    cleanup_profile_locks(p_dir, socks_port)

    cookie_list = build_persistent_cookie_list(cookie_str)

    cookies_ok = False
    try:
        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                str(p_dir),
                executable_path=CHROME_EXEC_PATH,
                headless=True,
                proxy={"server": f"socks5://127.0.0.1:{socks_port}"},
                timezone_id=cfg["timezone"],
                geolocation={
                    "latitude": cfg["latitude"],
                    "longitude": cfg["longitude"],
                    "accuracy": cfg["accuracy"],
                },
                permissions=["geolocation"],
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled"]
                     + profile_factory.chrome_launch_args(cfg),
            )
            if inject_cookie and cookie_list:
                await context.add_cookies(cookie_list)
                cookies_ok = True
            page = await context.new_page()
            try:
                await page.goto("https://www.tiktok.com/", wait_until="commit", timeout=8000)
            except Exception:
                pass
            await context.close()
    finally:
        # Tunnel chỉ cần trong lúc dựng; giữ lại sẽ tốn cổng và tiến trình.
        stop_wireguard_proxy(channel_id)

    profile_factory.pregrant_geolocation(p_dir)
    profile_factory.write_profile_meta(p_dir, cfg)

    conn = connect_db(DB_PATH)
    conn.execute("UPDATE channels SET profile_dir=? WHERE id=?", (str(p_dir), channel_id))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "channel_id": channel_id,
        "username": username or (note or ""),
        "country": country,
        "timezone": cfg["timezone"],
        "city": cfg["city"],
        "vpn_location": vpn_loc or "",
        "profile_dir": str(p_dir),
        "cookies_injected": cookies_ok,
    }


def build_profiles_for_channels(
    channel_ids: List[int],
    inject_cookie: bool = True,
    progress_cb: Optional[Any] = None,
) -> Dict[str, Any]:
    """Dựng profile tuần tự cho một danh sách kênh, trả về tổng kết."""
    import asyncio

    done, failed = [], []
    for idx, ch_id in enumerate(channel_ids, 1):
        try:
            res = asyncio.run(build_channel_profile(ch_id, inject_cookie=inject_cookie))
            done.append(res)
        except Exception as exc:
            failed.append({"channel_id": ch_id, "error": str(exc)})
            try:
                stop_wireguard_proxy(ch_id)
            except Exception:
                pass
        if progress_cb:
            try:
                progress_cb(idx, len(channel_ids), done, failed)
            except Exception:
                pass
    return {"total": len(channel_ids), "ok": len(done), "failed": len(failed),
            "done": done, "errors": failed}


def launch_channel_browser_profile(channel_id: int, start_url: str = "https://www.tiktok.com/",
                                   sync_cookie: bool = True) -> Dict[str, Any]:
    """
    1-Click Launcher:
    1. Fetches channel cookie, country, and vpn_config from DB.
    2. Auto-assigns VPN config if not yet assigned.
    3. Starts WireGuard tunnel on a dedicated SOCKS5 port.
    4. Cleans up stale profile locks from dead processes.
    5. Launches Google Chrome with isolated --user-data-dir and --proxy-server.
    """
    import asyncio

    conn = connect_db(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT username, cookie, country, vpn_config, vpn_location FROM channels WHERE id=?", (channel_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Không tìm thấy kênh ID #{channel_id}")

    username, stored_cookie, country, vpn_conf, vpn_loc_hint = row
    vpn_loc_hint = vpn_loc_hint or ""
    cookie_str = SECRET_STORE.decrypt(stored_cookie)
    country = (country or "KR").upper()

    # Auto assign VPN if missing
    if not vpn_conf:
        picked = pick_random_vpn(country)
        if picked:
            vpn_conf = picked["rel_path"]
            vpn_loc_hint = picked["label"]
            c.execute("UPDATE channels SET vpn_config=?, vpn_location=? WHERE id=?", (vpn_conf, vpn_loc_hint, channel_id))
            conn.commit()
    conn.close()

    if not vpn_conf:
        raise ValueError(f"Không tìm thấy file cấu hình VPN phù hợp cho quốc gia {country}")

    # Start WireGuard tunnel
    tunnel = start_wireguard_proxy(channel_id, vpn_conf)
    socks_port = tunnel["socks_port"]

    # Profile directory
    p_dir = ensure_profile_dir(channel_id)
    cleanup_profile_locks(p_dir, socks_port)

    # Synchronize the account session into the isolated profile before opening
    # the visible browser. Failure is explicit so the wrong account is never
    # opened silently.
    # sync_cookie=False khi kênh đã bị đăng xuất: bơm cookie chết vào chỉ làm rối
    # lần đăng nhập tay sắp tới.
    if sync_cookie and cookie_str and not asyncio.run(sync_cookies_to_profile(channel_id, cookie_str, socks_port)):
        raise RuntimeError("Không thể đồng bộ cookie vào Chrome profile")

    # Áp lại đúng cấu hình đã dựng profile: múi giờ qua biến môi trường TZ,
    # WebRTC bị ép chỉ dùng UDP đã qua proxy. Profile cũ (dựng trước khi có
    # profile_factory) không có meta thì suy ra từ quốc gia hiện tại.
    cfg = profile_factory.read_profile_meta(p_dir) or profile_factory.resolve_profile_config(country, vpn_loc_hint)
    chrome_env = profile_factory.chrome_launch_env(cfg)

    # Phải chạy thẳng binary chứ không qua `open -na`: `open` bàn giao tiến
    # trình cho launchd nên biến môi trường TZ sẽ bị bỏ, múi giờ lại về giờ máy.
    chrome_exec = Path(CHROME_EXEC_PATH).resolve()
    chrome_cmd = [str(chrome_exec)] + [
        f"--user-data-dir={str(p_dir)}",
        f"--proxy-server=socks5://127.0.0.1:{socks_port}",
        "--no-first-run",
        "--no-default-browser-check",
    ] + profile_factory.chrome_launch_args(cfg) + [
        start_url
    ]

    try:
        subprocess.Popen(chrome_cmd, env=chrome_env)
        return {
            "success": True,
            "channel_id": channel_id,
            "username": username,
            "country": country,
            "timezone": cfg.get("timezone", ""),
            "vpn_location": tunnel["location"],
            "socks5": tunnel["socks5_url"],
            "profile_dir": str(p_dir),
            "message": f"Đã mở Chrome qua WireGuard VPN ({tunnel['location']}), múi giờ {cfg.get('timezone', '')}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Lỗi khởi chạy trình duyệt: {e}"
        }
