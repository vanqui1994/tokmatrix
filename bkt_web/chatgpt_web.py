"""ChatGPT web + Gemini web viết kịch bản cho Hàng Đợi Kịch Bản (owner 08/10, đã chấp nhận rủi ro điều khoản / khoá
tài khoản của OpenAI và Google).

Một Chrome riêng (deploy/tokmatrix-chatgpt-chrome.service, profile storage/chatgpt_chrome_profile, CDP 127.0.0.1:9343,
màn hình ảo :1; chủ tài khoản đăng nhập chatgpt.com và gemini.google.com qua noVNC) được điều khiển qua CDP như Muse.
Luồng `chatgpt-scripts` nhận lần lượt từng task `script_queue` đang chờ và giao cho nguồn đầu tiên còn nhận việc theo
thứ tự PROVIDERS (ChatGPT → Gemini web): mở một cuộc chat mới, dán prompt (kèm yêu cầu chỉ trả một khối JSON), chờ trả
lời xong, lấy JSON và đóng task. Matrix không đổi gì: provider `bridge` gửi mọi lời gọi LLM vào hàng đợi này.

Mỗi nguồn có hạn mức ngày và bộ đếm lỗi riêng: 3 lỗi liên tiếp → nguồn đó nghỉ 30 phút (Telegram). Khi không nguồn
web nào nhận (tắt, Chrome chết, đăng xuất, hết hạn mức), script_bridge_worker giao task cho Antigravity như cũ.

  TOKMATRIX_CHATGPT_WEB      1 = bật (mặc định 0)
  TOKMATRIX_WEB_LLMS         thứ tự nguồn, mặc định "chatgpt,gemini"
  TOKMATRIX_CHATGPT_CDP      http://127.0.0.1:9343
  TOKMATRIX_CHATGPT_DAILY / TOKMATRIX_GEMINI_WEB_DAILY   task/ngày mỗi nguồn (200 / 150)
  TOKMATRIX_CHATGPT_GAP      giây nghỉ giữa hai task (20)
  TOKMATRIX_CHATGPT_TIMEOUT  giây chờ một câu trả lời (240)
CLI: python3 -m bkt_web.chatgpt_web status | ask "câu hỏi" [chatgpt|gemini]   (thử, không đụng hàng đợi)
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional

CDP = os.environ.get("TOKMATRIX_CHATGPT_CDP", "http://127.0.0.1:9343")
GAP = int(os.environ.get("TOKMATRIX_CHATGPT_GAP", "20") or 20)
TIMEOUT = int(os.environ.get("TOKMATRIX_CHATGPT_TIMEOUT", "240") or 240)
FAIL_PAUSE = 30 * 60
JSON_RULE = ("\n\n---\nIMPORTANT: Reply with ONLY one valid JSON object that follows the schema above, inside a single "
             "```json code block. No explanation before or after it. Do not ask questions.")

PROVIDERS: Dict[str, Dict[str, Any]] = {
    "chatgpt": {
        "label": "ChatGPT web", "host": "chatgpt.com", "url": "https://chatgpt.com/?temporary-chat=true",
        "daily": int(os.environ.get("TOKMATRIX_CHATGPT_DAILY", "200") or 200),
        # Ô nhập: #prompt-textarea (giao diện cũ) hoặc div contenteditable "Ask ChatGPT" (10/2026).
        "composer": "#prompt-textarea, div[contenteditable='true'][aria-label], form textarea",
        # Giao diện 10/2026 bỏ data-message-author-role: chat tạm mới nên trang chỉ có câu trả lời của ta.
        "answer": """()=>{const m=[...document.querySelectorAll('[data-message-author-role="assistant"]')].pop();
 const root=m||document.querySelector('main')||document.body;
 const code=[...root.querySelectorAll('pre code, pre')].map(c=>c.innerText).slice(-1);
 const done=document.querySelectorAll('button[aria-label="Regenerate response"],button[aria-label="Rate response"],[data-testid="copy-turn-action-button"]').length;
 const busy=!!document.querySelector('[data-testid="stop-button"],button[aria-label*="Stop"]');
 return {text:(root.innerText||'').slice(-8000), code, done:done>0, busy}}""",
    },
    "gemini": {
        "label": "Gemini web", "host": "gemini.google.com", "url": "https://gemini.google.com/app",
        "daily": int(os.environ.get("TOKMATRIX_GEMINI_WEB_DAILY", "150") or 150),
        "composer": "div.ql-editor[contenteditable='true'], rich-textarea [contenteditable='true']",
        "answer": """()=>{const m=[...document.querySelectorAll('model-response')].pop();
 const root=m||document.querySelector('main')||document.body;
 const code=[...root.querySelectorAll('pre code, code-block, pre')].map(c=>c.innerText).slice(-1);
 const busy=!![...document.querySelectorAll('button[aria-label]')].find(b=>/stop|dừng/i.test(b.getAttribute('aria-label')));
 return {text:(root.innerText||'').slice(-8000), code, done:!!m, busy}}""",
    },
}


def _new_state() -> Dict[str, Any]:
    return {"day": "", "count": 0, "fails": 0, "paused_until": 0.0, "last_ok": "", "last_error": ""}


_states: Dict[str, Dict[str, Any]] = {name: _new_state() for name in PROVIDERS}
_state: Dict[str, Any] = {"busy": None, "last_provider": ""}
_stop = threading.Event()
_thread: Optional[threading.Thread] = None
_lock = threading.Lock()


def enabled() -> bool:
    return os.environ.get("TOKMATRIX_CHATGPT_WEB", "0") == "1"


def order() -> List[str]:
    names = [n.strip() for n in os.environ.get("TOKMATRIX_WEB_LLMS", "chatgpt,gemini").split(",")]
    return [n for n in names if n in PROVIDERS]


def _reachable() -> bool:
    import urllib.request
    try:
        with urllib.request.urlopen(f"{CDP}/json/version", timeout=3) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def provider_ready(name: str) -> bool:
    st = _states[name]
    if time.time() < st["paused_until"]:
        return False
    return not (st["day"] == _today() and st["count"] >= PROVIDERS[name]["daily"])


def next_provider() -> Optional[str]:
    if not enabled() or not _reachable():
        return None
    return next((n for n in order() if provider_ready(n)), None)


def accepting() -> bool:
    """Có nguồn web nào nhận task không (script_bridge_worker hỏi trước khi đẩy task sang Antigravity)."""
    return next_provider() is not None


def extract_json(answer: Dict[str, Any]) -> Dict[str, Any]:
    """JSON object trong câu trả lời: ưu tiên khối code, rồi khối ```json``` trong chữ, rồi đoạn {...} ngoài cùng."""
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
    raise ValueError("câu trả lời không có JSON object hợp lệ")


async def _ask(name: str, prompt: str) -> Dict[str, Any]:
    from playwright.async_api import async_playwright
    spec = PROVIDERS[name]
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = next((pg for pg in ctx.pages if spec["host"] in pg.url), None) or await ctx.new_page()
        await page.goto(spec["url"], wait_until="domcontentloaded", timeout=60000)
        try:
            from bkt_web.muse_image import keep_awake
        except ImportError:
            from muse_image import keep_awake
        await keep_awake(page)
        box = page.locator(spec["composer"]).first
        try:
            await box.wait_for(timeout=20000)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"{spec['label']} chưa đăng nhập hoặc giao diện đổi (không thấy ô nhập) — đăng nhập lại qua noVNC") from exc
        # Popup / thẻ giới thiệu của trang có thể che ô nhập: Esc rồi focus bằng JS thay vì bấm chuột.
        await page.keyboard.press("Escape")
        await box.evaluate("e => { e.scrollIntoView({block: 'center'}); e.focus(); }")
        await page.keyboard.insert_text(prompt)
        await asyncio.sleep(0.8)
        await page.keyboard.press("Enter")
        t0, last, stable = time.time(), None, 0
        await asyncio.sleep(4)
        while time.time() - t0 < TIMEOUT:
            await asyncio.sleep(2)
            answer = await page.evaluate(spec["answer"]) or {}
            current = answer.get("text")
            stable = stable + 1 if (current and current == last and answer.get("done") and not answer.get("busy")) else 0
            last = current
            if stable >= 2:
                return {**answer, "seconds": round(time.time() - t0, 1)}
        raise RuntimeError(f"{spec['label']} không trả lời xong sau {TIMEOUT}s")


def ask_json(prompt: str, name: str = "chatgpt") -> Dict[str, Any]:
    with _lock:
        answer = asyncio.run(_ask(name, prompt + JSON_RULE))
    return extract_json(answer)


def _routes():
    try:
        from bkt_web import script_routes
    except ImportError:
        import script_routes
    return script_routes


def _claim_next(worker_id: str) -> Optional[Dict[str, Any]]:
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
        return routes.claim_script_task(row[0], routes.ClaimRequest(worker_id=worker_id))["task"]
    except Exception:  # noqa: BLE001 — worker khác vừa nhận
        return None


def run_once() -> bool:
    name = next_provider()
    if not name:
        return False
    task = _claim_next(f"{name}-web")
    if not task:
        return False
    routes, st, label = _routes(), _states[name], PROVIDERS[name]["label"]
    if st["day"] != _today():
        st.update(day=_today(), count=0)
    _state.update(busy=task["id"], last_provider=name)
    try:
        script = ask_json(task["prompt"], name)
        routes.complete_script_task(task["id"], routes.CompleteScriptRequest(script_json=script, notes=f"Hoàn thành bởi {label}"))
        st.update(count=st["count"] + 1, fails=0, last_ok=time.strftime("%Y-%m-%d %H:%M:%S"))
    except Exception as exc:  # noqa: BLE001 — lỗi một task không làm chết worker; bridge provider của Matrix thử lại
        routes.fail_script_task(task["id"], f"{label}: {exc}"[:500])
        st.update(fails=st["fails"] + 1, last_error=f"{time.strftime('%H:%M:%S')} {exc}"[:300])
        if st["fails"] >= 3:
            st.update(paused_until=time.time() + FAIL_PAUSE, fails=0)
            try:
                from bkt_web import notify
                notify.emit("web_llm_paused", f"⚠️ {label} lỗi 3 lần liên tiếp ({exc}) — nghỉ 30 phút, chuyển nguồn kế tiếp",
                            "warn", dedupe_key=f"web_llm_paused:{name}", cooldown=3600)
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
    return {"enabled": enabled(), "chrome": _reachable(), "order": order(), "next": next_provider(),
            "running": bool(_thread and _thread.is_alive()), **_state,
            "providers": {n: {**_states[n], "daily_cap": PROVIDERS[n]["daily"], "ready": provider_ready(n)} for n in PROVIDERS}}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == "ask":
        print(json.dumps(ask_json(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "chatgpt"), ensure_ascii=False, indent=1))
    else:
        print(json.dumps(status(), ensure_ascii=False, indent=1))
