"""Guarded single-video deletion through the channel's existing browser session."""

from __future__ import annotations

from bkt_web import profile_session, vpn_manager
from playwright.async_api import async_playwright

DELETE_JS = """async (itemId) => {
    const token = (document.cookie.match(/tt_csrf_token=([^;]+)/) || [])[1] || '';
    const query = new URLSearchParams({aweme_id: itemId, tt_csrf_token: token});
    const response = await fetch('/api/aweme/delete/?' + query, {
        method: 'POST', credentials: 'include', headers: {'tt-csrf-token': token}
    });
    return {http_status: response.status, body: (await response.text()).slice(0, 1500)};
}"""


def parse_delete_response(response: dict) -> dict:
    body = (response.get("body") or "").strip()
    if response.get("http_status") != 200 or not body or body.startswith("<"):
        return {"ok": False, "error": "TikTok từ chối hoặc trả phản hồi rỗng; chưa xóa khỏi dữ liệu local"}
    try:
        import json
        payload = json.loads(body)
    except ValueError:
        return {"ok": False, "error": "TikTok trả phản hồi không hợp lệ"}
    if isinstance(payload, dict) and payload.get("status_code") == 0:
        return {"ok": True}
    return {"ok": False, "error": "TikTok không xác nhận xóa video", "status_code": payload.get("status_code") if isinstance(payload, dict) else None}


async def delete_video(channel_id: int, video_id: str, cookie: str, socks_port: int) -> dict:
    cookie_list = vpn_manager.build_persistent_cookie_list(cookie)
    async with async_playwright() as p:
        async with profile_session.scan_context(p, channel_id, socks_port, cookie_list, "video-delete") as (context, _):
            page = await context.new_page()
            await page.goto("https://www.tiktok.com/", wait_until="domcontentloaded", timeout=60000)
            response = await page.evaluate(DELETE_JS, video_id)
            return parse_delete_response(response)
