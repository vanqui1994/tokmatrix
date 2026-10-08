"""ChatGPT web viết kịch bản cho Hàng Đợi Kịch Bản (owner 08/10, đã chấp nhận rủi ro điều khoản OpenAI / khoá tài khoản).

Một Chrome riêng (deploy/tokmatrix-chatgpt-chrome.service, profile storage/chatgpt_chrome_profile, CDP 127.0.0.1:9343,
màn hình ảo :1; chủ tài khoản đăng nhập chatgpt.com qua noVNC) được điều khiển qua CDP như Muse. Luồng `chatgpt-scripts`
nhận lần lượt từng task `script_queue` đang chờ, dán prompt (kèm yêu cầu chỉ trả một khối JSON) vào một cuộc chat tạm
(temporary chat, không lưu lịch sử), chờ trả lời xong, lấy JSON và đóng task. Matrix không đổi gì: provider `bridge`
(hoặc `auto` khi Gemini hết quota) đã gửi mọi lời gọi LLM vào hàng đợi này.

Khi ChatGPT sẵn sàng (`accepting()`), script_bridge_worker không đẩy task sang Antigravity; ChatGPT lỗi liên tiếp, bị đăng
xuất, hết hạn mức ngày hay tắt → Antigravity nhận lại như cũ. Một task một lúc, cách nhau ≥ GAP giây.

  TOKMATRIX_CHATGPT_WEB      1 = bật (mặc định 0)
  TOKMATRIX_CHATGPT_CDP      http://127.0.0.1:9343
  TOKMATRIX_CHATGPT_DAILY    tối đa task/ngày (200)
  TOKMATRIX_CHATGPT_GAP      giây nghỉ giữa hai task (20)
  TOKMATRIX_CHATGPT_TIMEOUT  giây chờ một câu trả lời (240)
CLI: python3 -m bkt_web.chatgpt_web status | ask "câu hỏi" (thử, không đụng hàng đợi)
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
from typing import Any, Dict, Optional

CDP = os.environ.get("TOKMATRIX_CHATGPT_CDP", "http://127.0.0.1:9343")
DAILY = int(os.environ.get("TOKMATRIX_CHATGPT_DAILY", "200") or 200)
GAP = int(os.environ.get("TOKMATRIX_CHATGPT_GAP", "20") or 20)
TIMEOUT = int(os.environ.get("TOKMATRIX_CHATGPT_TIMEOUT", "240") or 240)
FAIL_PAUSE = 30 * 60  # 3 lỗi liên tiếp → nhường Antigravity 30 phút
WORKER_ID = "chatgpt-web"
CHAT_URL = "https://chatgpt.com/?temporary-chat=true"
JSON_RULE = ("\n\n---\nIMPORTANT: Reply with ONLY one valid JSON object that follows the schema above, inside a single "
             "```json code block. No explanation before or after it. Do not ask questions.")

_state: Dict[str, Any] = {"day": "", "count": 0, "fails": 0, "paused_until": 0.0, "last_ok": "", "last_error": "", "busy": None}
_stop = threading.Event()
_thread: Optional[threading.Thread] = None
_lock = threading.Lock()

# Giao diện 10/2026 bỏ data-message-author-role: mỗi lần hỏi là một chat tạm mới nên trang chỉ có câu trả lời của ta —
# lấy khối code cuối + chữ cuối của <main>; "xong" = đã có nút Regenerate/Rate/Copy của lượt trả lời.
_LAST_ANSWER = """()=>{const m=[...document.querySelectorAll('[data-message-author-role="assistant"]')].pop();
 const root=m||document.querySelector('main')||document.body;
 const code=[...root.querySelectorAll('pre code, pre')].map(c=>c.innerText).slice(-1);
 const done=document.querySelectorAll('button[aria-label="Regenerate response"],button[aria-label="Rate response"],[data-testid="copy-turn-action-button"]').length;
 return {text:(root.innerText||'').slice(-8000), code, done}}"""
_GENERATING = """()=>!!document.querySelector('[data-testid="stop-button"],button[aria-label*="Stop"]')"""


def enabled() -> bool:
    return os.environ.get("TOKMATRIX_CHATGPT_WEB", "0") == "1"


def _reachable() -> bool:
    import urllib.request
    try:
        with urllib.request.urlopen(f"{CDP}/json/version", timeout=3) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def accepting() -> bool:
    """ChatGPT nhận task mới không (script_bridge_worker hỏi trước khi đẩy task sang Antigravity)."""
    if not enabled() or time.time() < _state["paused_until"]:
        return False
    if _state["day"] == _today() and _state["count"] >= DAILY:
        return False
    return _reachable()


def extract_json(answer: Dict[str, Any]) -> Dict[str, Any]:
    """JSON object trong câu trả lời: ưu tiên khối code, rồi đoạn {...} dài nhất trong chữ."""
    candidates = list(answer.get("code") or [])
    text = answer.get("text") or ""
    candidates += re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.S)
    if "{" in text and "}" in text:
        candidates.append(text[text.index("{"):text.rindex("}") + 1])
    for raw in candidates:
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        if isinstance(data, dict):
            return data
    raise ValueError("ChatGPT không trả JSON object hợp lệ")


async def _ask(prompt: str) -> Dict[str, Any]:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = next((pg for pg in ctx.pages if "chatgpt.com" in pg.url), None) or await ctx.new_page()
        await page.goto(CHAT_URL, wait_until="domcontentloaded", timeout=60000)
        try:
            from bkt_web.muse_image import keep_awake
        except ImportError:
            from muse_image import keep_awake
        await keep_awake(page)
        # Ô nhập: #prompt-textarea (giao diện cũ) hoặc div contenteditable "Ask ChatGPT" (10/2026).
        box = page.locator("#prompt-textarea, div[contenteditable='true'][aria-label], form textarea").first
        try:
            await box.wait_for(timeout=20000)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("ChatGPT chưa đăng nhập hoặc giao diện đổi (không thấy ô nhập) — đăng nhập lại qua noVNC") from exc
        await box.click()
        await page.keyboard.insert_text(prompt)
        await asyncio.sleep(0.8)
        await page.keyboard.press("Enter")
        t0, last, stable = time.time(), None, 0
        await asyncio.sleep(4)
        while time.time() - t0 < TIMEOUT:
            await asyncio.sleep(2)
            answer = await page.evaluate(_LAST_ANSWER)
            busy = await page.evaluate(_GENERATING)
            current = (answer or {}).get("text")
            stable = stable + 1 if (current and current == last and not busy and (answer or {}).get("done")) else 0
            last = current
            if stable >= 2:
                return {**answer, "seconds": round(time.time() - t0, 1)}
        raise RuntimeError(f"ChatGPT không trả lời xong sau {TIMEOUT}s")


def ask_json(prompt: str) -> Dict[str, Any]:
    with _lock:
        answer = asyncio.run(_ask(prompt + JSON_RULE))
    return extract_json(answer)


def _routes():
    try:
        from bkt_web import script_routes
    except ImportError:
        import script_routes
    return script_routes


def _claim_next() -> Optional[Dict[str, Any]]:
    routes = _routes()
    conn = routes._db()
    try:
        row = conn.execute("SELECT id FROM script_queue WHERE status='pending' AND engine=? ORDER BY created_ts LIMIT 1",
                           (routes.ENGINE,)).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    try:
        return routes.claim_script_task(row[0], routes.ClaimRequest(worker_id=WORKER_ID))["task"]
    except Exception:  # noqa: BLE001 — worker khác vừa nhận
        return None


def run_once() -> bool:
    if not accepting():
        return False
    task = _claim_next()
    if not task:
        return False
    routes = _routes()
    if _state["day"] != _today():
        _state.update(day=_today(), count=0)
    _state["busy"] = task["id"]
    try:
        script = ask_json(task["prompt"])
        routes.complete_script_task(task["id"], routes.CompleteScriptRequest(script_json=script, notes="Hoàn thành bởi ChatGPT web"))
        _state.update(count=_state["count"] + 1, fails=0, last_ok=time.strftime("%Y-%m-%d %H:%M:%S"))
    except Exception as exc:  # noqa: BLE001 — lỗi một task không làm chết worker; người gọi (bridge provider) thử lại
        routes.fail_script_task(task["id"], f"ChatGPT web: {exc}"[:500])
        _state.update(fails=_state["fails"] + 1, last_error=f"{time.strftime('%H:%M:%S')} {exc}"[:300])
        if _state["fails"] >= 3:
            _state.update(paused_until=time.time() + FAIL_PAUSE, fails=0)
            try:
                from bkt_web import notify
                notify.emit("chatgpt_web_paused", f"⚠️ ChatGPT web lỗi 3 lần liên tiếp ({exc}) — nhường Antigravity 30 phút",
                            "warn", dedupe_key="chatgpt_web_paused", cooldown=3600)
            except Exception:  # noqa: BLE001
                pass
    finally:
        _state["busy"] = None
    return True


def _loop() -> None:
    while not _stop.is_set():
        try:
            worked = run_once()
        except Exception as exc:  # noqa: BLE001
            _state["last_error"] = f"{time.strftime('%H:%M:%S')} loop: {exc}"
            worked = False
        _stop.wait(GAP if worked else 10)


def start() -> None:
    global _thread
    if not enabled() or (_thread and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="chatgpt-scripts", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()


def status() -> Dict[str, Any]:
    return {"enabled": enabled(), "chrome": _reachable(), "accepting": accepting(), "daily_cap": DAILY,
            "running": bool(_thread and _thread.is_alive()), **_state}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == "ask":
        print(json.dumps(ask_json(sys.argv[2]), ensure_ascii=False, indent=1))
    else:
        print(json.dumps(status(), ensure_ascii=False, indent=1))
