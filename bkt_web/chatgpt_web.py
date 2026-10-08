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
     python3 -m bkt_web.chatgpt_web images < {"intro","prompts"}   (Gemini web vẽ chuỗi ảnh trong một chat, tab riêng)
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


# Ảnh trong câu trả lời mới nhất của Gemini (blob: đã tải, khung to); đọc bằng canvas ngay trong trang.
_GEMINI_IMGS = """()=>{const m=[...document.querySelectorAll('model-response')].pop(); if(!m) return [];
 return [...m.querySelectorAll('img')].filter(i=>i.complete && i.naturalWidth>300).map(i=>i.src)}"""
_GEMINI_READ = """async(src)=>{const im=[...document.querySelectorAll('model-response img')].find(i=>i.src===src); if(!im) return null;
 const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
 try { c.getContext('2d').drawImage(im,0,0); return c.toDataURL('image/png').split(',')[1]; } catch(e) {
  const b=await (await fetch(src)).blob(); const u=new Uint8Array(await b.arrayBuffer()); let s=''; for(const x of u) s+=String.fromCharCode(x); return btoa(s); } }"""


async def _gemini_images(prompts: List[str], intro: str, per_image: int, on_image) -> None:
    """Một cuộc chat Gemini mới (tab riêng): `intro` mô tả nhân vật cố định, rồi mỗi prompt một ảnh, nối tiếp trong cùng chat
    để Gemini giữ đúng ngoại hình qua các cảnh. Gọi on_image(i, png_bytes | None, error)."""
    import base64
    from playwright.async_api import async_playwright
    spec = PROVIDERS["gemini"]
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await ctx.new_page()
        try:
            await page.goto(spec["url"], wait_until="domcontentloaded", timeout=60000)
            box = page.locator(spec["composer"]).first
            try:
                await box.wait_for(timeout=20000)
            except Exception as exc:  # noqa: BLE001
                raise RuntimeError("Gemini web chưa đăng nhập hoặc giao diện đổi — đăng nhập lại qua noVNC") from exc
            seen: set = set()
            for i, prompt in enumerate(prompts):
                text = (intro + "\n\n" if i == 0 and intro else "") + prompt
                await page.keyboard.press("Escape")
                await box.evaluate("e => { e.scrollIntoView({block: 'center'}); e.focus(); }")
                await page.keyboard.insert_text(text)
                await asyncio.sleep(0.8)
                await page.keyboard.press("Enter")
                await asyncio.sleep(6)
                t0, png, err = time.time(), None, "không thấy ảnh"
                while time.time() - t0 < per_image:
                    await asyncio.sleep(3)
                    new = [u for u in await page.evaluate(_GEMINI_IMGS) if u not in seen]
                    if new:
                        await asyncio.sleep(2)
                        data = await page.evaluate(_GEMINI_READ, new[-1])
                        seen.update(new)
                        if data:
                            png, err = base64.b64decode(data), ""
                        break
                on_image(i, png, err)
                _states["gemini"].update(day=_today(), count=(_states["gemini"]["count"] if _states["gemini"]["day"] == _today() else 0) + 1)
        finally:
            await page.close()


def gemini_images(prompts: List[str], intro: str = "", per_image: int = 180, on_image=None) -> List[Optional[bytes]]:
    """Vẽ một chuỗi ảnh bằng Gemini web (cùng một chat). Trả list png (None = cảnh lỗi)."""
    out: List[Optional[bytes]] = [None] * len(prompts)

    def keep(i, png, err):
        out[i] = png
        if on_image:
            on_image(i, png, err)
    with _lock:
        asyncio.run(_gemini_images(prompts, intro, per_image, keep))
    return out


# ------------------------------------------------------------------------------------------- ảnh qua Gemini web
# Owner 08/10: Gemini web vẽ ảnh làm nguồn dự phòng thứ nhất của hàng đợi Antigravity (trước ImageRouter trả phí):
# cf_image_fallback gọi generate_image() khi image_ready(). Chung Chrome + chung _lock với phần viết kịch bản.
IMAGE_DAILY = int(os.environ.get("TOKMATRIX_GEMINI_IMAGE_DAILY", "60") or 60)
IMAGE_SOURCE_ID = "gemini_web"
IMAGE_MODEL = "gemini-web"
_image_state: Dict[str, Any] = _new_state()
ASPECT_WORDS = {"9:16": "vertical 9:16 portrait", "16:9": "horizontal 16:9 landscape", "1:1": "square 1:1", "4:5": "vertical 4:5", "3:4": "vertical 3:4"}
_GEMINI_IMAGES = """()=>{const m=[...document.querySelectorAll('model-response')].pop(); if(!m) return [];
 return [...m.querySelectorAll('img')].filter(i=>i.naturalWidth>400).map(i=>i.src)}"""
# Blob của Gemini không fetch lại được (Failed to fetch): vẽ ảnh đã tải lên canvas cùng origin rồi xuất PNG.
_GET_BLOB = """(src)=>{const im=[...document.querySelectorAll('model-response img')].filter(i=>i.src===src).pop();
 if(!im||!im.complete) return null; const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
 c.getContext('2d').drawImage(im,0,0); return {w:im.naturalWidth,h:im.naturalHeight,b64:c.toDataURL('image/png').split(',')[1]}}"""


def image_ready() -> bool:
    if not enabled() or "gemini" not in order() or time.time() < _image_state["paused_until"]:
        return False
    if _image_state["day"] == _today() and _image_state["count"] >= IMAGE_DAILY:
        return False
    return _reachable()


async def _download_full(page) -> Optional[Dict[str, Any]]:
    """Ảnh gốc qua nút tải xuống của Gemini (bản trong chat chỉ 572×1024). Lỗi → None."""
    import io
    from PIL import Image
    try:
        await page.locator("model-response img").last.hover()
        button = page.locator("model-response button[aria-label*='đầy đủ'], model-response button[aria-label*='full size'], "
                              "model-response button[aria-label*='Download']").last
        async with page.expect_download(timeout=60000) as info:
            await button.click()
        download = await info.value
        raw = open(await download.path(), "rb").read()
        with Image.open(io.BytesIO(raw)) as im:
            return {"raw": raw, "size": im.size}
    except Exception as exc:  # noqa: BLE001
        print(f"[gemini-web] tải ảnh gốc lỗi, dùng bản xem trước: {exc}", flush=True)
        return None


async def _draw(prompt: str) -> Dict[str, Any]:
    import base64
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await ctx.new_page()  # tab riêng cho mỗi ảnh, đóng sau khi lấy ảnh
        try:
            await page.goto(PROVIDERS["gemini"]["url"], wait_until="domcontentloaded", timeout=60000)
            box = page.locator(PROVIDERS["gemini"]["composer"]).first
            await box.wait_for(timeout=20000)
            await page.keyboard.press("Escape")
            await box.evaluate("e => { e.scrollIntoView({block: 'center'}); e.focus(); }")
            await page.keyboard.insert_text(prompt)
            await asyncio.sleep(0.8)
            await page.keyboard.press("Enter")
            t0 = time.time()
            while time.time() - t0 < TIMEOUT:
                await asyncio.sleep(3)
                srcs = await page.evaluate(_GEMINI_IMAGES)
                if srcs:
                    await asyncio.sleep(3)
                    got = await _download_full(page)  # bản gốc 1536×2752 qua nút "Tải … kích thước đầy đủ"
                    if not got:
                        data = await page.evaluate(_GET_BLOB, srcs[-1])  # dự phòng: bản xem trước 572×1024
                        if data:
                            got = {"raw": base64.b64decode(data["b64"]), "size": (data["w"], data["h"])}
                    if got:
                        return {**got, "seconds": round(time.time() - t0, 1)}
            raise RuntimeError(f"Gemini web không trả ảnh sau {TIMEOUT}s")
        finally:
            await page.close()


def generate_image(prompt: str, negative: str = "", ratio: str = "9:16") -> Dict[str, Any]:
    """Vẽ một ảnh qua Gemini web: {"raw": bytes, "size": (w, h), "prompt": …}. Lỗi 3 lần liên tiếp → nghỉ 30 phút."""
    st = _image_state
    if st["day"] != _today():
        st.update(day=_today(), count=0)
    text = (f"Generate exactly one image, {ASPECT_WORDS.get(ratio, ratio)} format. Do not ask questions, do not add any text, "
            f"letters, captions or logos to the image.{' Avoid: ' + negative + '.' if negative else ''} Image: {prompt}")
    try:
        with _lock:
            got = asyncio.run(_draw(text))
    except Exception as exc:
        st.update(fails=st["fails"] + 1, last_error=f"{time.strftime('%H:%M:%S')} {exc}"[:300])
        if st["fails"] >= 3:
            st.update(paused_until=time.time() + FAIL_PAUSE, fails=0)
        raise
    st.update(count=st["count"] + 1, fails=0, last_ok=time.strftime("%Y-%m-%d %H:%M:%S"))
    return {**got, "prompt": text}


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
            "images": {**_image_state, "daily_cap": IMAGE_DAILY, "ready": image_ready()},
            "running": bool(_thread and _thread.is_alive()), **_state,
            "providers": {n: {**_states[n], "daily_cap": PROVIDERS[n]["daily"], "ready": provider_ready(n)} for n in PROVIDERS}}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "images":
        # stdin: {"intro": str, "prompts": [str]} → mỗi ảnh một dòng JSON {"i", "png" (base64), "error"}
        import base64
        job = json.loads(sys.stdin.read())
        gemini_images(job["prompts"], job.get("intro", ""), int(job.get("per_image", 180)),
                      lambda i, png, err: print(json.dumps({"i": i, "png": base64.b64encode(png).decode() if png else "",
                                                            "error": err}), flush=True))
    elif len(sys.argv) > 2 and sys.argv[1] == "ask":
        print(json.dumps(ask_json(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "chatgpt"), ensure_ascii=False, indent=1))
    else:
        print(json.dumps(status(), ensure_ascii=False, indent=1))
