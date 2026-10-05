"""Trang quản trị Dola Render Gateway mở ngay trong TokMatrix: /api/dola/gw/<account_id>/

Không viết lại giao diện: trang là chính web/index.html của gateway (Dashboard, Accounts,
Task Queue, API Keys), lấy trực tiếp từ gateway nên luôn giống bản trong git của gateway.
TokMatrix chỉ chuyển tiếp, và chỉ cho đi qua đúng ba nhóm đường dẫn:

  GET  /api/dola/gw/<id>/                 → trang "/" của gateway, chèn một đoạn script nhỏ
  *    /api/dola/gw/<id>/api/admin/<path>  → /api/admin/<path> (X-Admin-Key)
  GET  /api/dola/gw/<id>/videos/<file>     → /videos/<file> (có Range, để tua video)

Đoạn script chèn vào chỉ đổi đường dẫn tuyệt đối "/api/admin/..." thành đường dẫn chuyển tiếp ở
trên, và đổi `video_url` (gateway trả theo DOLA_PUBLIC_BASE, thường là 127.0.0.1 của gateway,
trình duyệt không mở được) thành /api/dola/gw/<id>/videos/<file>.

<id> phải là một mục trong pool (dola_accounts), nên không chuyển tiếp tới địa chỉ tuỳ ý.
Khoá admin: mục pool `admin_key`/`admin_key_env` → env DOLA_ADMIN_KEY → Kho Khoá `video.dola_admin`.
Có khoá ở server thì trang vào thẳng; không có thì trang hiện ô đăng nhập của gateway như bình thường.
Mọi đường dẫn nằm dưới /api/ nên vẫn phải đăng nhập TokMatrix.
"""

import json
import re


import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

try:
    from bkt_web import dola_routes
except ImportError:
    import dola_routes

router = APIRouter(prefix="/api/dola", tags=["dola"])

ADMIN_PATH_RE = re.compile(r"^[A-Za-z0-9_.~%-]+(/[A-Za-z0-9_.~%-]+)*$")
VIDEO_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+\.(mp4|webm|mov)$")
PASS_RESPONSE_HEADERS = ("content-type", "content-length", "content-range", "accept-ranges",
                         "last-modified", "etag")


def _account(account_id: str):
    acc = dola_routes.manager().get(account_id)
    if acc is None:
        raise HTTPException(404, f"Không có gateway '{account_id}' trong pool Dola")
    return acc


def _shim(account_id: str) -> str:
    prefix = json.dumps(f"/api/dola/gw/{account_id}")
    return f"""<script>
/* TokMatrix: chuyển tiếp trang quản trị gateway qua {account_id}. */
(function(){{
  const P={prefix};
  const fix=u=>{{try{{const x=new URL(u,location.href);if(x.pathname.startsWith('/videos/'))return P+x.pathname;}}catch(e){{}}return u;}};
  const orig=window.fetch.bind(window);
  window.fetch=async function(u,o){{
    if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith(P))u=P+u;
    const r=await orig(u,o);
    if(typeof u==='string'&&u.indexOf('/api/admin/tasks')>=0&&r.ok){{
      const d=await r.clone().json().catch(()=>null);
      if(d&&Array.isArray(d.tasks)){{
        d.tasks.forEach(t=>{{if(t.video_url)t.video_url=fix(t.video_url);}});
        return new Response(JSON.stringify(d),{{status:r.status,headers:{{'Content-Type':'application/json'}}}});
      }}
    }}
    return r;
  }};
}})();
</script>"""


def _offline_page(account_id: str, base_url: str, error: str) -> str:
    from html import escape
    return f"""<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Gateway Dola chưa chạy</title>
<style>
:root{{--bg:#f5f7f6;--card:#fff;--text:#1d2b27;--sub:#5d6d68;--line:#e3e8e6;--bad:#e5484d}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1513;--card:#17201d;--text:#e6eeeb;--sub:#9aaba5;--line:#26332f}}}}
body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:680px;margin:48px auto;padding:0 16px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}}
h1{{font-size:20px;margin:0 0 8px}} .dot{{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--bad);margin-right:8px}}
code,pre{{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px}}
pre{{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere}}
li{{margin:6px 0}} .sub{{color:var(--sub)}} a{{color:#0a8f5c}}
</style></head><body><main><div class="card">
<h1><span class="dot"></span>Gateway Dola chưa chạy</h1>
<p class="sub">TokMatrix không kết nối được tới gateway <b>{escape(account_id)}</b> ở <code>{escape(base_url)}</code>.</p>
<pre>{escape(error)}</pre>
<ul>
<li>Gateway phải đang chạy ở đúng địa chỉ trên (repo <code>dola-render-gateway</code>, <code>uvicorn server:app</code>).</li>
<li>Gateway chạy ở máy khác: đặt <code>DOLA_GATEWAY_BASE_URL</code> trong <code>.env</code> của TokMatrix,
hoặc khai báo trong <code>bkt_web/storage/dola_accounts.json</code>, rồi khởi động lại TokMatrix.</li>
<li>Khoá admin của gateway: Cài Đặt → Kho Khoá → “Dola Gateway — khoá admin”.</li>
</ul>
<p><a href="">Thử lại</a> · <a href="/">Về TokMatrix</a></p>
</div></main></body></html>"""


@router.get("/gateways")
def gateways():
    """Các gateway khác nhau trong pool (mỗi base_url một mục) cho nút "Quản trị gateway"."""
    seen, out = set(), []
    for acc in dola_routes.manager().accounts:
        url = acc.resolved_base_url()
        if url in seen:
            continue
        seen.add(url)
        out.append({"id": acc.id, "base_url": url, "url": f"/api/dola/gw/{acc.id}/",
                    "has_admin_key": bool(acc.resolved_admin_key())})
    return {"gateways": out}


@router.get("/gw/{account_id}", include_in_schema=False)
@router.get("/gw/{account_id}/", include_in_schema=False)
def admin_page(account_id: str):
    acc = _account(account_id)
    try:
        resp = httpx.get(acc.resolved_base_url() + "/", timeout=15.0)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        # Trả 200 kèm trang giải thích: mã 5xx thì Cloudflare thay bằng trang lỗi của nó, mất lý do.
        return HTMLResponse(_offline_page(account_id, acc.resolved_base_url(), str(exc)),
                            headers={"Cache-Control": "no-store", "X-Dola-Gateway": "offline"})
    html = resp.text
    shim = _shim(account_id)
    m = re.search(r"<head[^>]*>", html, re.I)
    html = html[:m.end()] + shim + html[m.end():] if m else shim + html
    # Trang lấy từ gateway: không cho nó bị nhúng ở nơi khác, không lưu cache (trạng thái đổi liên tục).
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


@router.api_route("/gw/{account_id}/api/admin/{path:path}", methods=["GET", "POST", "PATCH", "DELETE"],
                  include_in_schema=False)
async def admin_api(account_id: str, path: str, request: Request):
    acc = _account(account_id)
    if not ADMIN_PATH_RE.match(path) or ".." in path.split("/"):
        raise HTTPException(400, "Đường dẫn không hợp lệ")
    headers = {"Content-Type": request.headers.get("content-type", "application/json")}
    # Khoá người dùng đã đăng nhập trên trang thắng; không có thì dùng khoá cất ở server.
    key = request.headers.get("x-admin-key", "") or acc.resolved_admin_key()
    if key:
        headers["X-Admin-Key"] = key
    body = await request.body()
    try:
        async with httpx.AsyncClient(base_url=acc.resolved_base_url(), timeout=60.0) as client:
            resp = await client.request(request.method, f"/api/admin/{path}", params=request.query_params,
                                        content=body or None, headers=headers)
    except httpx.HTTPError as exc:
        return Response(json.dumps({"detail": f"Gateway không phản hồi: {exc}"}), status_code=502,
                        media_type="application/json")
    return Response(resp.content, status_code=resp.status_code,
                    media_type=resp.headers.get("content-type", "application/json"))


@router.get("/gw/{account_id}/videos/{name}", include_in_schema=False)
async def video(account_id: str, name: str, request: Request):
    acc = _account(account_id)
    if not VIDEO_NAME_RE.match(name):
        raise HTTPException(400, "Tên file không hợp lệ")
    headers = {}
    if request.headers.get("range"):
        headers["Range"] = request.headers["range"]
    client = httpx.AsyncClient(base_url=acc.resolved_base_url(), timeout=httpx.Timeout(30.0, read=300.0))
    try:
        req = client.build_request("GET", f"/videos/{name}", headers=headers)
        resp = await client.send(req, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(502, f"Gateway không phản hồi: {exc}")

    async def close():
        await resp.aclose()
        await client.aclose()

    out_headers = {k: v for k, v in resp.headers.items() if k.lower() in PASS_RESPONSE_HEADERS}
    return StreamingResponse(resp.aiter_raw(), status_code=resp.status_code, headers=out_headers,
                             background=BackgroundTask(close))
