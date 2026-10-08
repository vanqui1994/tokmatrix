"""Kênh Heo & Rồng tự động: mỗi acc đã cấu hình nhận per_day video kiến thức comic mỗi ngày.

Cấu hình `storage/mascot_explainer/channels.json`: [{"account": 266, "lang": "de", "per_day": 1, "enabled": true}].
Mỗi lượt (CHECK_EVERY giây, một video một lúc): acc nào hôm nay (giờ máy) chưa đủ per_day task `mascot_explainer:*`
và còn ít hơn STOCK_MAX video chờ đăng thì Gemini chọn một chủ đề mới (không trùng các tựa đã làm, lưu ở
`topics_<account>.txt`) rồi chạy `compare_studio/tools/mascot_explainer.py --account` (kịch bản → giọng → Gemini web vẽ
→ render → 1 task đăng ở khung giờ kế tiếp của acc). Lỗi: thử lại sau RETRY_AFTER, tối đa MAX_TRIES lần/ngày/acc.
Tắt bằng TOKMATRIX_MASCOT=0. Trạng thái: status().
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List

try:
    from bkt_web import paths
    from bkt_web.services import gemini
except ImportError:
    import paths
    from services import gemini

REPO = Path(__file__).resolve().parent.parent
BASE = Path(__file__).resolve().parent / "storage" / "mascot_explainer"
CONFIG = BASE / "channels.json"
TOOL = REPO / "compare_studio" / "tools" / "mascot_explainer.py"
CHECK_EVERY = 600
RETRY_AFTER = 3600
MAX_TRIES = 3
STOCK_MAX = 3
LANG_NAMES = {"en": "English", "de": "German", "ko": "Korean", "ja": "Japanese"}
AUDIENCE = {"de": "people in Germany", "en": "people in the UK and US", "ko": "people in South Korea", "ja": "people in Japan"}

TOPIC = """Pick ONE topic for a 60-second funny comic explainer (two cartoon mascots, a pig and a dragon) for {audience}.
Everyday knowledge, food, history of everyday things, science of daily life, odd local customs, animals, inventions.
It must be surprising, true and easy to explain. No politics, no war, no religion, no real people, no brands or companies,
no tragedy. Do not repeat or closely resemble any of these earlier topics:
{done}
Write the topic as a short question in {lang} (max 12 words). Return JSON {{"topic": str}}"""

_state: Dict[str, Any] = {"busy": None, "last": "", "tries": {}}
_wake = threading.Event()
_thread: threading.Thread | None = None


def channels() -> List[Dict[str, Any]]:
    try:
        return [c for c in json.loads(CONFIG.read_text(encoding="utf-8")) if c.get("enabled", True)]
    except (OSError, ValueError):
        return []


def _made_today(account: int) -> int:
    start = int(time.mktime(time.strptime(time.strftime("%Y-%m-%d"), "%Y-%m-%d")))
    with sqlite3.connect(str(paths.DB_PATH), timeout=30) as c:
        return c.execute("SELECT COUNT(*) FROM upload_tasks WHERE channel_id=? AND run_id LIKE 'mascot_explainer:%' "
                         "AND created_at>=?", (account, start)).fetchone()[0]


def _waiting(account: int) -> int:
    with sqlite3.connect(str(paths.DB_PATH), timeout=30) as c:
        return c.execute("SELECT COUNT(*) FROM upload_tasks WHERE channel_id=? AND run_id LIKE 'mascot_explainer:%' "
                         "AND status IN ('QUEUED','PENDING','WAITING_RENDER')", (account,)).fetchone()[0]


def _topics_file(account: int) -> Path:
    return BASE / f"topics_{account}.txt"


def pick_topic(account: int, lang: str) -> str:
    f = _topics_file(account)
    done = [t for t in f.read_text(encoding="utf-8").splitlines() if t.strip()] if f.exists() else []
    data = gemini.generate_json(TOPIC.format(audience=AUDIENCE.get(lang, "a general audience"), lang=LANG_NAMES[lang],
                                             done="\n".join(f"- {t}" for t in done[-120:]) or "- (none)"),
                                models=gemini.FLASH_CHAIN, temperature=1.0, timeout=120)
    topic = " ".join(str(data.get("topic") or "").split())
    if not topic:
        raise RuntimeError("Gemini không trả chủ đề")
    return topic


def make_video(cfg: Dict[str, Any]) -> Dict[str, Any]:
    account, lang = int(cfg["account"]), cfg.get("lang", "de")
    topic = pick_topic(account, lang)
    vid = f"{lang}-{account}-{time.strftime('%Y%m%d-%H%M')}"
    BASE.mkdir(parents=True, exist_ok=True)
    with _topics_file(account).open("a", encoding="utf-8") as fh:
        fh.write(topic + "\n")
    r = subprocess.run([str(REPO / "venv" / "bin" / "python"), str(TOOL), "--topic", topic, "--lang", lang, "--id", vid,
                        "--account", str(account)], cwd=str(REPO), capture_output=True, text=True, timeout=3 * 3600)
    if r.returncode:
        raise RuntimeError(f"{vid}: {(r.stderr or r.stdout)[-500:]}")
    return {"id": vid, "topic": topic, "out": r.stdout.strip().splitlines()[-1:]}


def run_once() -> bool:
    today = time.strftime("%Y-%m-%d")
    for cfg in channels():
        account = int(cfg["account"])
        tries = _state["tries"].setdefault(f"{today}:{account}", {"n": 0, "at": 0})
        if (_made_today(account) >= int(cfg.get("per_day", 1)) or _waiting(account) >= STOCK_MAX
                or tries["n"] >= MAX_TRIES or time.time() - tries["at"] < RETRY_AFTER):
            continue
        _state["busy"] = account
        try:
            res = make_video(cfg)
            _state["last"] = f"{time.strftime('%H:%M:%S')} acc #{account}: {res['topic']} → hàng đợi đăng"
        except Exception as e:  # noqa: BLE001
            tries.update(n=tries["n"] + 1, at=time.time())
            _state["last"] = f"{time.strftime('%H:%M:%S')} acc #{account} lỗi: {str(e)[:300]}"
        finally:
            _state["busy"] = None
        return True
    return False


def _loop() -> None:
    while True:
        try:
            worked = run_once()
        except Exception as e:  # noqa: BLE001
            _state["last"] = f"loop: {e}"
            worked = False
        if not worked:
            _wake.wait(CHECK_EVERY)
            _wake.clear()


def start() -> None:
    global _thread
    if os.environ.get("TOKMATRIX_MASCOT", "1") == "0" or (_thread and _thread.is_alive()):
        return
    _thread = threading.Thread(target=_loop, name="mascot-channel", daemon=True)
    _thread.start()


def status() -> Dict[str, Any]:
    return {"running": bool(_thread and _thread.is_alive()), "busy": _state["busy"], "last": _state["last"],
            "channels": channels()}
