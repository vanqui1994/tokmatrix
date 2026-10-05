"""Ảnh AI qua muse.ai (agent chat của người dùng) — engine `muse` của hàng đợi ảnh.

Chrome riêng (service tokmatrix-muse-chrome, hồ sơ storage/muse_chrome_profile, người dùng tự đăng nhập qua noVNC)
mở cổng CDP 127.0.0.1:9333. Worker trong server lấy từng task `engine='muse'` đang chờ, gõ prompt vào ô "Message",
chờ ảnh mới xuất hiện trong chat, đọc blob ngay trong trang và hoàn tất task (model `muse`). Một task một lúc: Muse là
một cuộc chat, gửi song song sẽ lẫn ảnh.

  TOKMATRIX_MUSE=0          tắt worker
  TOKMATRIX_MUSE_CDP        mặc định http://127.0.0.1:9333
  TOKMATRIX_MUSE_TIMEOUT    giây chờ một ảnh (mặc định 300)
"""
from __future__ import annotations

import asyncio
import base64
import io
import os
import threading
import time
from typing import Any, Dict, Optional

CDP = os.environ.get("TOKMATRIX_MUSE_CDP", "http://127.0.0.1:9333")
TIMEOUT = int(os.environ.get("TOKMATRIX_MUSE_TIMEOUT", "300"))
MAX_ATTEMPTS = 3
ENGINE = "muse"
ASPECT_WORDS = {"9:16": "vertical 9:16 portrait", "16:9": "horizontal 16:9 landscape", "1:1": "square 1:1", "4:5": "vertical 4:5", "3:4": "vertical 3:4"}

_thread: Optional[threading.Thread] = None
_stop = threading.Event()
# Muse là MỘT cuộc chat: ảnh (worker này) và video (muse_film) dùng chung khoá để không gửi chồng prompt.
MUSE_LOCK = threading.Lock()
_state: Dict[str, Any] = {"last_ok": None, "last_error": None, "done": 0, "failed": 0, "busy": None}

# Muse gỡ ảnh cũ khỏi DOM khi chat dài: nhận ảnh mới theo địa chỉ blob: chưa thấy trước khi gửi prompt.
_IMGS = "()=>[...document.querySelectorAll('img')].filter(i=>i.naturalWidth>200 && i.src.startsWith('blob:')).map(i=>i.src)"
_GET_IMG = """async(src)=>{const im=[...document.querySelectorAll('img')].filter(i=>i.src===src && i.naturalWidth>200).pop();
 if(!im) return null; const b=await (await fetch(src)).blob(); const buf=new Uint8Array(await b.arrayBuffer()); let s='';
 for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));
 return {w:im.naturalWidth,h:im.naturalHeight,type:b.type,b64:btoa(s)}}"""


def _routes():
    try:
        from bkt_web import image_routes
    except ImportError:
        import image_routes
    return image_routes


def build_prompt(prompt: str, negative: str, aspect: str) -> str:
    fmt = ASPECT_WORDS.get(aspect, aspect)
    neg = f" Avoid: {negative}." if negative else ""
    return (f"Generate exactly one image, {fmt} format. Do not ask questions and do not add text to the image.{neg} "
            f"Image: {prompt}")


async def keep_awake(page) -> None:
    """Muse chỉ chạy khi tab đang được focus: tab nền/cửa sổ bị che thì Chrome hoãn timer và
    rendering, ảnh/clip đứng chờ mãi. Đưa tab lên trước và giả lập focus qua CDP."""
    try:
        await page.bring_to_front()
        cdp = await page.context.new_cdp_session(page)
        await cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
        await cdp.send("Page.setWebLifecycleState", {"state": "active"})
    except Exception as e:  # noqa: BLE001 — không chặn việc tạo ảnh vì bước phụ này
        print(f"[muse] keep_awake: {e}", flush=True)


async def _generate(prompt: str) -> Dict[str, Any]:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        pages = [pg for ctx in browser.contexts for pg in ctx.pages if "muse.ai" in pg.url]
        if not pages:
            raise RuntimeError("Chrome Muse chưa mở trang muse.ai")
        page = pages[0]
        box = page.locator("textarea[placeholder='Message']")
        if await box.count() == 0:
            raise RuntimeError("Muse chưa đăng nhập (không thấy ô Message) — đăng nhập lại qua noVNC")
        await keep_awake(page)
        seen = set(await page.evaluate(_IMGS))
        await box.fill(prompt)
        await box.press("Enter")
        t0 = time.time()
        while time.time() - t0 < TIMEOUT:
            await asyncio.sleep(3)
            new = [src for src in await page.evaluate(_IMGS) if src not in seen]
            if new:
                await asyncio.sleep(2)  # ảnh vừa hiện: đợi blob tải xong
                data = await page.evaluate(_GET_IMG, new[-1])
                if data:
                    return {"raw": base64.b64decode(data["b64"]), "size": (data["w"], data["h"]), "seconds": round(time.time() - t0, 1)}
        raise RuntimeError(f"Muse không trả ảnh sau {TIMEOUT}s")


def generate(prompt: str, negative: str = "", aspect: str = "9:16") -> Dict[str, Any]:
    """Vẽ một ảnh qua Muse, trả {"png": bytes, "size": (w,h), "seconds"}. Ảnh webp đổi sang PNG."""
    from PIL import Image
    with MUSE_LOCK:
        got = asyncio.run(_generate(build_prompt(prompt, negative, aspect)))
    with Image.open(io.BytesIO(got["raw"])) as im:
        out = io.BytesIO()
        im.convert("RGB").save(out, "PNG")
    return {"png": out.getvalue(), "size": got["size"], "seconds": got["seconds"]}


def _next_task():
    ir = _routes()
    conn = ir._db()
    try:
        now = int(time.time())
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """SELECT id, prompt, negative_prompt, aspect_ratio, attempt_count FROM image_queue
               WHERE status='pending' AND engine=? AND (next_retry_at IS NULL OR next_retry_at <= ?)
               ORDER BY created_ts ASC LIMIT 1""", (ENGINE, now)).fetchone()
        if not row:
            conn.commit()
            return None
        conn.execute("UPDATE image_queue SET status='processing', notes=?, updated_at=? WHERE id=?",
                     ("Muse đang vẽ", ir._now_str(), row[0]))
        conn.commit()
        return {"id": row[0], "prompt": row[1], "negative": row[2] or "", "aspect": row[3] or "9:16", "attempts": row[4] or 0}
    finally:
        conn.close()


def _finish(task: Dict[str, Any], png: Optional[bytes], error: str = "") -> None:
    ir = _routes()
    conn = ir._db()
    try:
        if png:
            name = f"muse_{int(time.time())}_{task['id'].split('_')[-1]}.png"
            (ir.GENERATED_DIR / name).write_bytes(png)
            conn.execute("""UPDATE image_queue SET status='completed', image_filename=?, image_url=?, model=?, notes=?,
                            error_message='', updated_at=? WHERE id=?""",
                         (name, f"/static/generated_images/{name}", "muse", "✅ Hoàn thành bởi Muse", ir._now_str(), task["id"]))
        else:
            attempts = task["attempts"] + 1
            final = attempts >= MAX_ATTEMPTS
            conn.execute("""UPDATE image_queue SET status=?, attempt_count=?, error_message=?, next_retry_at=?, notes=?,
                            updated_at=? WHERE id=?""",
                         ("failed" if final else "pending", attempts, error[:500], int(time.time()) + 60,
                          "Muse lỗi" + (" — dừng" if final else ", thử lại"), ir._now_str(), task["id"]))
        conn.commit()
    finally:
        conn.close()


def run_once() -> bool:
    task = _next_task()
    if not task:
        return False
    _state["busy"] = task["id"]
    try:
        got = generate(task["prompt"], task["negative"], task["aspect"])
        _finish(task, got["png"])
        _state.update(last_ok=time.strftime("%Y-%m-%d %H:%M:%S"), done=_state["done"] + 1)
    except Exception as exc:  # noqa: BLE001 — lỗi Muse không được làm chết worker
        _finish(task, None, str(exc))
        _state.update(last_error=f"{time.strftime('%H:%M:%S')} {exc}", failed=_state["failed"] + 1)
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
        _stop.wait(1 if worked else 10)


def start() -> None:
    global _thread
    if os.environ.get("TOKMATRIX_MUSE", "1") == "0" or (_thread and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="muse-images", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()


def status() -> Dict[str, Any]:
    import urllib.request
    try:
        urllib.request.urlopen(f"{CDP}/json/version", timeout=3).read()
        chrome = True
    except Exception:
        chrome = False
    return {"enabled": os.environ.get("TOKMATRIX_MUSE", "1") != "0", "chrome": chrome,
            "running": bool(_thread and _thread.is_alive()), **_state}
