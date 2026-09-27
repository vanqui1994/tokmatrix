import os
import re
import sys
import time
import asyncio
import json
import subprocess
from pathlib import Path
from typing import Callable, Optional, Dict, Any
from urllib.parse import urlparse
from playwright.async_api import async_playwright

try:
    from bkt_web.db_utils import connect_db
    from bkt_web.security import SecretStore
    from bkt_web import profile_factory
except ImportError:
    from db_utils import connect_db
    from security import SecretStore
    import profile_factory

# Ngôn ngữ giao diện khai báo theo quốc gia của kênh. Một tài khoản Đức mở
# TikTok bằng locale en-US là mâu thuẫn với múi giờ và IP của chính nó.
COUNTRY_LOCALES = {
    "DE": "de-DE", "GB": "en-GB", "UK": "en-GB", "US": "en-US",
    "JP": "ja-JP", "KR": "ko-KR", "FR": "fr-FR", "BG": "bg-BG",
    "LU": "fr-LU", "VN": "vi-VN",
}


def resolve_headless(explicit: Optional[bool] = None) -> bool:
    """Quyết định có chạy ẩn hay không.

    Chrome chạy `headless` tự khai `HeadlessChrome/<ver>` ngay trong
    navigator.userAgent — chỉ một dòng JS là TikTok biết đây là máy tự động.
    Máy chủ đã có màn hình ảo Xvfb (DISPLAY) nên mở hiện hình được, và đó cũng
    là cách profile mở tay vẫn chạy. Đặt TOKMATRIX_PUBLISH_HEADLESS=1 để ép ẩn
    khi cần chạy ở nơi không có màn hình.
    """
    if explicit is not None:
        return explicit
    forced = os.environ.get("TOKMATRIX_PUBLISH_HEADLESS", "").strip().lower()
    if forced in {"1", "true", "yes"}:
        return True
    if forced in {"0", "false", "no"}:
        return False
    if sys.platform.startswith("linux"):
        # Không có DISPLAY thì mở hiện hình sẽ ném lỗi ngay khi khởi chạy.
        return not bool(os.environ.get("DISPLAY"))
    return False

CHROME_EXEC_PATH = os.environ.get(
    "TOKMATRIX_CHROME_PATH",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)
UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=creator_center"

POST_SUCCESS_MARKERS = (
    "uploaded successfully",
    "video has been uploaded",
    "video published",
    "đã đăng",
    "đang được xử lý",
    "being processed",
)


def _post_is_confirmed(url: str, body_text: str = "") -> bool:
    """Chỉ nhận redirect TikTok Studio hoặc thông báo thành công rõ ràng.

    Rời ``/upload`` không đủ để kết luận: phiên hết hạn cũng có thể chuyển sang
    login/home. Task 68 đã xác nhận bằng cả redirect ``/tiktokstudio/content``
    và toast ``Video published``.
    """
    parsed = urlparse(url or "")
    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower().rstrip("/")
    trusted_tiktok = host == "tiktok.com" or host.endswith(".tiktok.com")
    if trusted_tiktok and (
        path.startswith("/tiktokstudio/content")
        or path.startswith("/creator-center/content")
    ):
        return True
    if not trusted_tiktok:
        return False
    text = (body_text or "").lower()
    return any(marker in text for marker in POST_SUCCESS_MARKERS)

# Công tắc khai báo nội dung AI trong phần "Hiển thị thêm" của TikTok Studio, theo các
# ngôn ngữ giao diện kênh có thể dùng (khớp COUNTRY_LOCALES).
AI_TOGGLE_LABELS = (
    "ai-generated content", "ai generated content", "ai-generated", "nội dung do ai tạo", "do ai tạo",
    "ki-generierte inhalte", "ki-generiert", "contenu généré par l'ia", "généré par l'ia",
    "ai生成コンテンツ", "ai によって生成", "ai 생성 콘텐츠", "ai로 생성",
)
SHOW_MORE_LABELS = ("show more", "more options", "hiển thị thêm", "xem thêm", "mehr anzeigen", "afficher plus", "もっと見る", "더보기", "더 보기")
AI_CONFIRM_LABELS = ("turn on", "bật", "einschalten", "activer", "オンにする", "켜기")


async def _enable_ai_label(page, log) -> None:
    """Bật "AI-generated content". Không tìm thấy công tắc thì ném lỗi — không đăng khi chưa khai báo."""
    await page.evaluate(
        r"""(labels) => {
            const els = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
            const el = els.find(e => labels.includes((e.textContent || '').trim().toLowerCase()));
            if (el) el.click();
        }""",
        list(SHOW_MORE_LABELS),
    )
    await page.wait_for_timeout(1200)
    state = await page.evaluate(
        r"""(labels) => {
            const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const nodes = Array.from(document.querySelectorAll('span, div, label, p'))
                .filter(n => n.children.length <= 2 && labels.some(l => norm(n.textContent).startsWith(l)));
            for (const n of nodes) {
                let box = n;
                for (let i = 0; i < 6 && box; i++, box = box.parentElement) {
                    const sw = box.querySelector('[role="switch"], input[type="checkbox"], [class*="switch" i], [class*="Switch"]');
                    if (sw) {
                        const on = sw.getAttribute('aria-checked') === 'true' || sw.checked === true
                            || /checked|active|\bon\b/i.test(sw.className || '');
                        if (!on) sw.click();
                        return on ? 'already-on' : 'clicked';
                    }
                }
            }
            return 'not-found';
        }""",
        list(AI_TOGGLE_LABELS),
    )
    if state == "not-found":
        raise RuntimeError("Không tìm thấy công tắc 'AI-generated content' trên TikTok Studio — không đăng khi chưa khai báo nội dung AI")
    if state == "clicked":
        await page.wait_for_timeout(800)
        # Một số phiên bản hỏi xác nhận khi bật nhãn AI.
        await page.evaluate(
            r"""(labels) => {
                const btn = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .find(b => labels.includes((b.textContent || '').trim().toLowerCase()));
                if (btn) btn.click();
            }""",
            list(AI_CONFIRM_LABELS),
        )
        await page.wait_for_timeout(600)
    log("🏷️ Đã bật nhãn 'AI-generated content' (nội dung do AI tạo)." if state == "clicked"
        else "🏷️ Nhãn 'AI-generated content' đã bật sẵn.", "info")

# Hộp thoại TikTok Studio bật lên sau khi chọn file (kiểm tra nội dung tự động, tính năng mới,
# bản nháp…) phủ lên cả trang: mọi cú click sau đó hết giờ chờ. Chỉ đóng TRƯỚC khi bấm Đăng,
# ưu tiên nút từ chối/để sau để không vô tình bật tính năng hay bỏ bản đang soạn.
MODAL_SELECTOR = '.TUXModal[role="dialog"], [role="dialog"].common-modal, [role="dialog"][aria-modal="true"]'
# Thứ tự quan trọng: nút từ chối/huỷ của mọi ngôn ngữ trước, nút xác nhận chung ("ok", "확인") sau cùng.
# Acc Nhật/Hàn (27/09) nhận hộp thoại "Bật kiểm tra nội dung tự động?" bằng tiếng của acc; trước đây chỉ
# có nhãn Anh/Việt/Đức nên rơi xuống phím Esc — TikTok không đóng hộp thoại này bằng Esc → click hết giờ.
MODAL_DISMISS_LABELS = (
    "not now", "cancel", "maybe later", "skip",
    "để sau", "không phải bây giờ", "hủy", "huỷ", "bỏ qua",
    "nicht jetzt", "abbrechen", "später",
    "キャンセル", "後で", "今はしない", "スキップ",
    "취소", "나중에", "지금은 안 함", "건너뛰기",
    "annuler", "plus tard", "pas maintenant", "cancelar", "más tarde", "ahora no",
    "got it", "đã hiểu", "verstanden", "了解", "알겠습니다",
    "close", "đóng", "schließen", "閉じる", "닫기", "fermer", "cerrar",
    "done", "ok", "확인",
)
# Nút phụ (từ chối) của hộp thoại TUX, không phụ thuộc ngôn ngữ — dùng khi không khớp nhãn nào.
MODAL_SECONDARY_BUTTON = 'button[class*="TUXButton--secondary"], button[class*="secondary" i]'


async def _click_labelled(scope, labels) -> Optional[str]:
    """Bấm nút đầu tiên có chữ đúng bằng một nhãn (không phân biệt hoa thường) và đang hiện."""
    for label in labels:
        buttons = scope.get_by_role("button", name=label, exact=False)
        try:
            count = await buttons.count()
        except Exception:
            count = 0
        for index in range(count):
            candidate = buttons.nth(index)
            try:
                name = ((await candidate.inner_text()) or "").strip().lower()
                if name == label and await candidate.is_visible():
                    await candidate.click(timeout=5000)
                    return name
            except Exception:
                continue
    return None


# Chữ Hàn/Nhật/Trung gõ từng phím vào trình soạn của TikTok bị rơi/đảo (27/09: mất "아킬레우스가",
# câu tiếng Nhật bị cụt, hashtag nhảy lên đầu). Đoạn CJK được chèn nguyên cụm (insert_text = một sự kiện
# nhập, không qua bộ gõ); chữ Latin/hashtag vẫn gõ từng phím như cũ để TikTok nhận hashtag.
_CJK = "ᄀ-ᇿ　-ヿ㄰-㆏㐀-鿿가-힯豈-﫿＀-￯"
_CJK_RUN = re.compile(f"[{_CJK}]+(?:[ \\t]*[{_CJK}0-9.,!?%]+)*")


def caption_chunks(text: str):
    """[(cách nhập, đoạn)]: "insert" cho cụm CJK, "type" cho phần còn lại (giữ nguyên thứ tự)."""
    chunks, pos = [], 0
    text = text or ""
    for match in _CJK_RUN.finditer(text):
        if match.start() > pos:
            chunks.append(("type", text[pos:match.start()]))
        chunks.append(("insert", match.group(0)))
        pos = match.end()
    if pos < len(text):
        chunks.append(("type", text[pos:]))
    return chunks


async def _type_caption(page, text: str) -> None:
    for how, chunk in caption_chunks(text):
        if how == "insert":
            await page.keyboard.insert_text(chunk)
            await page.wait_for_timeout(120)
        else:
            await page.keyboard.type(chunk, delay=25)


async def _click_first_visible(locator, description: str) -> Optional[str]:
    """Bấm phần tử đầu tiên đang hiện của locator; trả mô tả nếu bấm được."""
    try:
        count = min(await locator.count(), 6)
    except Exception:
        return None
    for index in range(count):
        candidate = locator.nth(index)
        try:
            if await candidate.is_visible():
                await candidate.click(timeout=5000)
                return description
        except Exception:
            continue
    return None


# Hướng dẫn "New editing features added" (react-joyride) và banner cookie cũng phủ lên trang.
TOUR_SELECTOR = ".react-joyride__overlay, .react-joyride__tooltip, .react-joyride__spotlight, .__floater__open"
TOUR_LABELS = ("got it", "skip", "đã hiểu", "bỏ qua", "verstanden", "überspringen", "close", "đóng",
               "スキップ", "閉じる", "건너뛰기", "닫기", "ok", "확인", "了解", "알겠습니다")
# Nút của tooltip react-joyride theo thuộc tính, không phụ thuộc ngôn ngữ.
TOUR_BUTTON = ('.react-joyride__tooltip button[data-action="skip"], .react-joyride__tooltip button[data-action="close"], '
               '.react-joyride__tooltip button[data-action="primary"], .react-joyride__tooltip button, .__floater__open button')
COOKIE_DECLINE_LABELS = ("decline optional cookies", "từ chối cookie tùy chọn", "từ chối cookie không bắt buộc", "optionale cookies ablehnen", "reject all")


async def _dismiss_blocking_modals(page, log, rounds: int = 4) -> int:
    closed = 0
    for _ in range(rounds):
        acted = False
        modal = page.locator(MODAL_SELECTOR).first
        try:
            visible = await modal.count() and await modal.is_visible()
        except Exception:
            visible = False
        if visible:
            text = " | ".join(line.strip() for line in (await modal.inner_text()).splitlines() if line.strip())[:200]
            how = await _click_labelled(modal, MODAL_DISMISS_LABELS)
            how = f'nút "{how}"' if how else None
            if not how:
                how = await _click_first_visible(modal.locator(MODAL_SECONDARY_BUTTON), "nút phụ (từ chối)")
            if not how:
                close = modal.locator('[aria-label="Close" i], [aria-label="Đóng"], [aria-label="Schließen"], [aria-label="閉じる"], [aria-label="닫기"], button[class*="close" i]')
                if await close.count() and await close.first.is_visible():
                    await close.first.click(timeout=5000)
                    how = "nút ×"
                else:
                    await page.keyboard.press("Escape")
                    how = "phím Esc"
            log(f"Đã đóng hộp thoại TikTok ({how}): {text}", "warning")
            acted = True
        tour = page.locator(TOUR_SELECTOR)
        tour_visible = False
        try:
            for index in range(min(await tour.count(), 6)):
                if await tour.nth(index).is_visible():
                    tour_visible = True
                    break
        except Exception:
            tour_visible = False
        if tour_visible:
            box = page.locator(".react-joyride__tooltip, .__floater__open").first
            text = ""
            try:
                if await box.count():
                    text = " | ".join(line.strip() for line in (await box.inner_text()).splitlines() if line.strip())[:160]
            except Exception:
                pass
            how = await _click_labelled(page, TOUR_LABELS)
            how = f'nút "{how}"' if how else await _click_first_visible(page.locator(TOUR_BUTTON), "nút của hướng dẫn")
            if not how:
                await page.keyboard.press("Escape")
                how = "phím Esc"
            log(f"Đã tắt hướng dẫn TikTok ({how}): {text}", "warning")
            acted = True
        how = await _click_labelled(page, COOKIE_DECLINE_LABELS)  # get_by_role xuyên được shadow DOM của banner
        if how:
            log(f'Đã từ chối cookie tuỳ chọn trên banner TikTok (nút "{how}")', "info")
            acted = True
        if not acted:
            break
        closed += 1
        await page.wait_for_timeout(900)
    return closed

async def _debug_shot(page, db_path, task_id, channel_id, log, tag: str = "error") -> None:
    """Ảnh chụp toàn trang lúc lỗi, để biết TikTok đang hiện gì (storage/publish_debug)."""
    try:
        if page is None:
            return
        shot = Path(db_path).resolve().parent / "storage" / "publish_debug" / f"{tag}_{task_id or 'manual'}_{channel_id}_{int(time.time())}.png"
        shot.parent.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(shot), full_page=True)
        log(f"Ảnh chụp ({tag}): {shot}", "info")
    except Exception:
        pass


AI_LABEL_MODES = ("off", "auto", "on")


def ai_label_mode() -> str:
    """Nhãn "AI-generated content" trên TikTok, TOKMATRIX_TIKTOK_AI_LABEL = off | auto | on.

    off (mặc định, production — yêu cầu của chủ kênh 25/09): không bao giờ bật nhãn.
    auto: bật khi task có cờ ai_generated (giá trị cũ "1/true/yes" = auto).
    on:   bật cho mọi video.
    Cờ ai_generated của task vẫn được giữ để thống kê. Giá trị lạ → off.
    """
    value = os.environ.get("TOKMATRIX_TIKTOK_AI_LABEL", "off").strip().lower()
    if value in ("1", "true", "yes"):
        return "auto"
    return value if value in AI_LABEL_MODES else "off"


def ai_label_enabled() -> bool:
    return ai_label_mode() != "off"


def should_label_ai(ai_generated: bool) -> bool:
    mode = ai_label_mode()
    return mode == "on" or (mode == "auto" and bool(ai_generated))


POST_BUTTON_NAMES = ("Post", "Đăng", "Posten", "Publier", "Publicar", "投稿", "게시")


async def _find_post_button(page):
    """Nút Post của form upload (không phải mục "Posts" trong menu)."""
    for selector in ('button[data-e2e="post_video_button"]', '[data-e2e="post_video_button"] button'):
        handle = await page.query_selector(selector)
        if handle and await handle.is_visible():
            return handle
    for name in POST_BUTTON_NAMES:
        buttons = page.get_by_role("button", name=name, exact=True)
        count = await buttons.count()
        # Nút của form nằm cuối trang: lấy nút khớp đúng tên, hiện, ở dưới cùng.
        for index in range(count - 1, -1, -1):
            candidate = buttons.nth(index)
            if await candidate.is_visible():
                return await candidate.element_handle()
    return None


async def _published_video_url(page, caption: str, log, wait_seconds: int = 25) -> str:
    """Link video vừa đăng, đọc từ trang Posts mà TikTok chuyển tới sau khi đăng.

    Bot kiểm trùng/shadowban cần link video; trước 26/09 task chỉ lưu tiktokstudio/content.
    Chọn dòng có mô tả khớp đầu caption; không khớp dòng nào thì để trống (không đoán).
    """
    want = " ".join((caption or "").split())[:28].lower()
    for _ in range(wait_seconds):
        # Mỗi dòng = khối lớn nhất chỉ chứa link của MỘT video (ảnh bìa + tiêu đề có thể là 2 link cùng video).
        rows = await page.evaluate(r"""() => {
            const id = h => (h.split('?')[0].match(/\/video\/(\d+)/) || [])[1];
            const ids = el => new Set(Array.from(el.querySelectorAll('a[href*="/video/"]')).map(x => id(x.href)));
            return Array.from(document.querySelectorAll('a[href*="/video/"]')).map(a => {
                let box = a;
                for (let i = 0; i < 10 && box.parentElement && ids(box.parentElement).size <= 1; i++) box = box.parentElement;
                return { href: a.href, text: (box.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase() };
            });
        }""")
        for row in rows or []:
            if want and want in row.get("text", ""):
                url = row["href"].split("?")[0]
                log(f"🔗 Link video vừa đăng: {url}", "info")
                return url
        await page.wait_for_timeout(1000)
    log("Chưa đọc được link video từ trang Posts (bot kiểm trùng sẽ bỏ qua video này)", "warning")
    return ""


def parse_cookie_string(cookie_str: str):
    cookies = []
    for item in cookie_str.split(";"):
        item = item.strip()
        if "=" in item:
            name, val = item.split("=", 1)
            name = name.strip()
            val = val.strip()
            if name:
                cookies.append({
                    "name": name,
                    "value": val,
                    "domain": ".tiktok.com",
                    "path": "/",
                })
    return cookies

async def publish_tiktok_video(
    channel_id: int,
    video_path: str,
    caption: str,
    hashtags: str = "#fyp #viral #trending",
    db_path: Optional[str] = None,
    log_cb: Optional[Callable[[str, str], None]] = None,
    headless: Optional[bool] = None,
    task_id: Optional[int] = None,
    ai_generated: bool = False,
    dry_run: bool = False,
    screenshot_path: Optional[str] = None,
    use_profile: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Automated Playwright TikTok Studio Publisher.
    Loads cookies from channel in database, navigates to TikTok Studio,
    uploads video file, sets caption, monitors content check, and submits.
    """
    post_was_clicked = False

    def log(msg: str, level: str = "info"):
        if log_cb:
            log_cb(msg, level)
        print(f"[{level.upper()}] {msg}")

    def mark_task(status: str, error: str = "", result_url: str = ""):
        if not task_id or dry_run:
            return
        conn = connect_db(db_path)
        if status == "SUCCESS":
            conn.execute(
                """
                UPDATE upload_tasks
                SET status='SUCCESS', uploaded_at=?, error_message='', result_url=?
                WHERE id=?
                """,
                (int(time.time()), result_url, task_id),
            )
        else:
            conn.execute(
                "UPDATE upload_tasks SET status=?, error_message=? WHERE id=?",
                (status, error[:1000], task_id),
            )
        conn.commit()
        conn.close()

    log(f"Khởi động phiên Playwright đăng video cho kênh ID #{channel_id}...", "info")
    
    # 1. Fetch channel cookie
    if not db_path:
        db_path = str(Path(__file__).resolve().parent / "bkt_channels.db")
    
    conn = connect_db(db_path)
    c = conn.cursor()
    c.execute(
        "SELECT username, cookie, country, vpn_config, vpn_location, profile_dir "
        "FROM channels WHERE id=?",
        (channel_id,),
    )
    row = c.fetchone()
    conn.close()

    if not row or not row[1]:
        err = f"Không tìm thấy cookie hợp lệ cho kênh #{channel_id}"
        log(f"❌ {err}", "error")
        mark_task("ERROR", err)
        return {"success": False, "error": err}

    username, stored_cookie, country, vpn_config, vpn_location, profile_dir = row
    cookie_str = SecretStore(Path(db_path).resolve().parent / ".secret.key").decrypt(stored_cookie)
    u_display = username or f"Channel_{channel_id}"
    log(f"Đã nạp Cookie kênh: @{u_display} (Quốc gia: {country})", "info")

    try:
        from bkt_web import profile_session
        configured = profile_session.get_setting("publish_profile_channels", "", db_path)
        enabled_ids = {int(x.strip()) for x in configured.split(",") if x.strip().isdigit()}
        profile_enabled = use_profile if use_profile is not None else (configured.strip().lower() == "all" or channel_id in enabled_ids)
    except Exception:
        profile_session = None
        profile_enabled = bool(use_profile)
    use_profile_path = bool(profile_enabled and profile_dir and profile_session)
    if use_profile_path and task_id and not dry_run:
        conn = connect_db(db_path)
        conn.execute("UPDATE upload_tasks SET publish_mode='profile' WHERE id=?", (task_id,)); conn.commit(); conn.close()
    elif task_id and not dry_run:
        conn = connect_db(db_path)
        conn.execute("UPDATE upload_tasks SET publish_mode='clean' WHERE id=?", (task_id,)); conn.commit(); conn.close()

    if not os.path.exists(video_path):
        err = f"Tệp video không tồn tại tại: {video_path}"
        log(f"❌ {err}", "error")
        mark_task("ERROR", err)
        return {"success": False, "error": err}

    file_size_mb = round(os.path.getsize(video_path) / (1024 * 1024), 2)
    if Path(video_path).suffix.lower() not in {".mp4", ".mov", ".webm"}:
        err = "Định dạng video không được hỗ trợ; hãy dùng MP4, MOV hoặc WebM"
        mark_task("ERROR", err)
        return {"success": False, "error": err}
    if file_size_mb > 4096:
        err = "Video vượt quá giới hạn 4 GB"
        mark_task("ERROR", err)
        return {"success": False, "error": err}
    log(f"Tệp video MP4: {Path(video_path).name} ({file_size_mb} MB)", "info")

    full_caption = f"{caption} {hashtags}".strip()
    if len(full_caption) > 2200:
        err = f"Caption và hashtag dài {len(full_caption)} ký tự, vượt giới hạn 2200"
        mark_task("ERROR", err)
        return {"success": False, "error": err}

    try:
        probe = subprocess.run(
            [
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height,codec_name:format=duration",
                "-of", "json", video_path,
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=True,
        )
        info = json.loads(probe.stdout)
        stream = (info.get("streams") or [{}])[0]
        duration = float((info.get("format") or {}).get("duration") or 0)
        if not stream.get("width") or not stream.get("height") or duration <= 0:
            raise ValueError("không đọc được kích thước hoặc thời lượng")
        if duration > 600:
            raise ValueError("video dài hơn 10 phút")
        log(
            f"Preflight: {stream.get('width')}×{stream.get('height')}, "
            f"{duration:.1f}s, codec {stream.get('codec_name') or 'unknown'}",
            "info",
        )
    except Exception as exc:
        err = f"Video không vượt qua kiểm tra kỹ thuật: {exc}"
        mark_task("ERROR", err)
        return {"success": False, "error": err}

    # Dấu vết của kênh: lấy đúng cấu hình đã ghi khi dựng profile, thiếu thì suy
    # ra từ quốc gia + điểm thoát VPN như profile_factory vẫn làm. Trước đây ngữ
    # cảnh đăng bài khai cứng User-Agent macOS, locale en-US và không đặt múi
    # giờ: cùng một tài khoản, TikTok thấy máy Đức giờ Berlin lúc duyệt web
    # nhưng lại thấy máy Mac giờ UTC lúc đăng.
    p_cfg = {}
    if profile_dir:
        try:
            p_cfg = profile_factory.read_profile_meta(Path(profile_dir))
        except Exception:
            p_cfg = {}
    if not p_cfg:
        p_cfg = profile_factory.resolve_profile_config(country or "", vpn_location or "")

    # WireGuard VPN Tunnel Check — bật SAU preflight: các bước kiểm tra file ở trên
    # return sớm, bật trước thì tunnel bị bỏ chạy mỗi lần video lỗi.
    proxy_config = None
    started_tunnel = False
    if vpn_config:
        try:
            from bkt_web import vpn_manager
            # Chỉ mở trình duyệt khi tunnel đã gọi được TikTok (tunnel mới đôi khi treo → ERR_TIMED_OUT).
            tunnel = await asyncio.to_thread(vpn_manager.start_verified_wireguard_proxy, channel_id, vpn_config, log=log)
            proxy_config = {"server": f"socks5://127.0.0.1:{tunnel['socks_port']}"}
            started_tunnel = True
            log(f"🛡️ Kích hoạt WireGuard VPN: {tunnel['location']} (SOCKS5 :{tunnel['socks_port']})", "info")
        except Exception as ve:
            err = f"Không thể khởi động VPN đã gán: {ve}"
            log(f"❌ {err}", "error")
            mark_task("ERROR", err)
            return {"success": False, "error": err}

    def stop_tunnel() -> None:
        if not started_tunnel:
            return
        try:
            from bkt_web import vpn_manager
            vpn_manager.stop_wireguard_proxy(channel_id)
            log("🛡️ Đã tắt tunnel VPN của phiên đăng.", "info")
        except Exception as exc:
            log(f"Cảnh báo: không tắt được tunnel VPN ({exc})", "warning")

    use_headless = resolve_headless(headless)

    # 2. Launch Browser & Context
    async with async_playwright() as p:
        profile_cm = None
        profile_context = None
        browser = None
        page = None
        profile_logged_out = False
        if use_profile_path:
            try:
                profile_cm = profile_session.acquire(channel_id, owner=f"publish:{task_id or 'manual'}")
                profile_cm.__enter__()
                log("Đường profile: mở Chrome persistent profile của kênh", "info")
                profile_context, context_info = await profile_session.open_context(p, channel_id, (proxy_config or {}).get("server", "").split(":")[-1] if proxy_config else None, use_headless)
                log(f"cookie_source={context_info.get('cookie_source')}", "info")
            except profile_session.ProfileBusy:
                if profile_cm:
                    try: profile_cm.__exit__(None, None, None)
                    except Exception: pass
                log("Profile đang mở — hoãn 5 phút", "warning")
                stop_tunnel()
                return {"success": False, "deferred": True, "error": "Profile đang mở — hoãn 5 phút"}
            except profile_session.ProfileMissing:
                log("Kênh chưa có profile — dùng đường sạch", "warning")
                use_profile_path = False
                if task_id and not dry_run:
                    conn = connect_db(db_path); conn.execute("UPDATE upload_tasks SET publish_mode='clean' WHERE id=?", (task_id,)); conn.commit(); conn.close()
            except Exception as exc:
                if profile_cm:
                    try: profile_cm.__exit__(None, None, None)
                    except Exception: pass
                err = f"Không mở được Chrome profile của kênh: {exc}"
                log(f"❌ {err}", "error")
                # Ghi ERROR để scheduler thử lại theo lượt như mọi lỗi trước khi bấm Đăng;
                # trả về mà không đổi trạng thái sẽ để task kẹt ở UPLOADING.
                mark_task("ERROR", err)
                stop_tunnel()
                return {"success": False, "error": err}
        log(
            ("Mở trình duyệt Chromium sạch (không dùng profile) " if not use_profile_path else "")
            + ("(chế độ ẩn)" if use_headless else "(hiện hình trên màn hình ảo)"),
            "info",
        )
        if not use_profile_path:
          browser = await p.chromium.launch(
            executable_path=CHROME_EXEC_PATH if os.path.exists(CHROME_EXEC_PATH) else None,
            headless=use_headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-infobars",
                "--start-maximized",
            ] + profile_factory.chrome_launch_args(p_cfg),
          )

        # Không ép User-Agent nữa: để Chrome khai đúng nền tảng nó đang chạy.
        # Khai macOS trong khi navigator.platform là Linux là một mâu thuẫn tự
        # tạo ra, dễ bị phát hiện hơn là cứ để nguyên.
        context_kwargs = {
            "viewport": {"width": 1440, "height": 900},
            "locale": COUNTRY_LOCALES.get((country or "").strip().upper(), "en-US"),
        }
        if p_cfg.get("timezone"):
            context_kwargs["timezone_id"] = p_cfg["timezone"]
        if p_cfg.get("latitude") is not None and p_cfg.get("longitude") is not None:
            context_kwargs["geolocation"] = {
                "latitude": float(p_cfg["latitude"]),
                "longitude": float(p_cfg["longitude"]),
                "accuracy": float(p_cfg.get("accuracy", 60)),
            }
            context_kwargs["permissions"] = ["geolocation"]
        if proxy_config:
            context_kwargs["proxy"] = proxy_config

        log(
            "Dấu vết kênh: múi giờ "
            f"{context_kwargs.get('timezone_id', 'mặc định')}, ngôn ngữ "
            f"{context_kwargs['locale']}, vị trí {p_cfg.get('city') or 'không đặt'}",
            "info",
        )

        context = profile_context if use_profile_path else await browser.new_context(**context_kwargs)

        # Inject cookies
        if not use_profile_path:
            parsed_cookies = parse_cookie_string(cookie_str)
            await context.add_cookies(parsed_cookies)
            log(f"Đã bơm {len(parsed_cookies)} cookies bảo mật vào phiên duyệt.", "info")

        page = await context.new_page()

        try:
            log("Điều hướng tới TikTok Studio: tiktokstudio/upload...", "info")
            await page.goto(UPLOAD_URL, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(3000)

            curr_url = page.url
            if use_profile_path and await profile_session.is_logged_out(page):
                # Profile giữ phiên thật của kênh: bị đăng xuất thì thử lại cũng vô ích.
                err = "Phiên hết hạn — cần đăng nhập lại (Chrome profile của kênh)"
                log(f"❌ {err}", "error")
                profile_logged_out = True
                profile_session.mark_session(channel_id, "LOGGED_OUT", "publish")
                mark_task("ERROR", err)
                return {"success": False, "error": err, "no_retry": True, "logged_out": True}
            if "login" in curr_url.lower() or "passport" in curr_url.lower():
                err = "Cookie kênh đã hết hạn hoặc cần xác minh đăng nhập (Login/Verify Required)"
                log(f"❌ {err}", "error")
                mark_task("ERROR", err)
                return {"success": False, "error": err}

            log("Đã truy cập thành công TikTok Studio! Tìm ô tải tệp lên...", "info")
            await _dismiss_blocking_modals(page, log)

            # 3. Find file input
            file_input = None
            try:
                # Direct file input or inside iframe
                await page.wait_for_selector('input[type="file"]', timeout=15000)
                file_input = await page.query_selector('input[type="file"]')
            except Exception:
                # Try finding in iframes
                for frame in page.frames:
                    inp = await frame.query_selector('input[type="file"]')
                    if inp:
                        file_input = inp
                        break

            if not file_input:
                err = "Không tìm thấy nút tải tệp trên giao diện TikTok Studio"
                log(f"❌ {err}", "error")
                await _debug_shot(page, db_path, task_id, channel_id, log, 'no_file_input')
                mark_task("ERROR", err)
                return {"success": False, "error": err}

            log("Đang nạp file video MP4 vào input...", "info")
            await file_input.set_input_files(video_path)
            log("Đã gửi tệp MP4. Chờ TikTok xử lý tải lên...", "info")

            # Wait for upload progress
            await page.wait_for_timeout(6000)
            await _dismiss_blocking_modals(page, log)
            log("Đang thiết lập Caption & Bộ Hashtags hot trend...", "info")

            # Try locating caption editor
            caption_selectors = [
                'div[contenteditable="true"]',
                '.notranslate.public-DraftEditor-content',
                'textarea[placeholder*="caption"]',
                'div[placeholder*="caption"]'
            ]
            caption_el = None
            for sel in caption_selectors:
                caption_el = await page.query_selector(sel)
                if caption_el:
                    break

            if caption_el:
                try:
                    await caption_el.click(timeout=10000)
                except Exception:
                    # Hộp thoại có thể bật lên muộn hơn lượt kiểm tra ở trên.
                    if not await _dismiss_blocking_modals(page, log):
                        raise
                    await caption_el.click(timeout=10000)
                await page.wait_for_timeout(500)
                # TikTok điền sẵn tên file vào mô tả. "Meta+A" chỉ chọn hết trên macOS; VPS là Linux
                # nên trước đây tên file bị giữ lại và caption dính vào sau nó.
                for combo in ("ControlOrMeta+A", "Control+A"):
                    await page.keyboard.press(combo)
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(200)
                    if not ((await caption_el.inner_text()) or "").strip():
                        break
                await _type_caption(page, full_caption)
                await page.keyboard.type(" ", delay=25)  # đóng danh sách gợi ý hashtag vừa gõ
                await page.wait_for_timeout(600)
                written = " ".join(((await caption_el.inner_text()) or "").split())
                expected = " ".join(full_caption.split())
                if not written.startswith(expected[:40]):
                    err = "Mô tả trên TikTok không khớp caption đã điền — dừng, không đăng"
                    log(f"❌ {err}: {written[:120]!r}", "error")
                    await _debug_shot(page, db_path, task_id, channel_id, log, "caption_mismatch")
                    mark_task("ERROR", err)
                    return {"success": False, "error": err}
                log(f"Đã điền nội dung caption thành công ({len(full_caption)} ký tự).", "info")
            else:
                log("Cảnh báo: Không thể tự động điền caption vào ô nhập", "warning")

            log("Đang theo dõi tiến trình kiểm duyệt bản quyền âm thanh (Content Check)...", "info")
            await page.wait_for_timeout(8000)

            await _dismiss_blocking_modals(page, log)
            if ai_generated and not should_label_ai(ai_generated):
                log("Không bật nhãn 'AI-generated content' (đã tắt theo cấu hình).", "info")
            ai_generated = should_label_ai(ai_generated)
            if ai_generated:
                await _enable_ai_label(page, log)
            await _dismiss_blocking_modals(page, log)

            # Look for Post / Publish button
            # KHÔNG dùng has-text("Post"): nó khớp cả mục "Posts" ở menu trái — bấm vào đó TikTok
            # hỏi "Are you sure that you want to exit?" và video không bao giờ được đăng (25/09).
            post_btn = await _find_post_button(page)
            if post_btn:
                info = await post_btn.evaluate("b => (b.getAttribute('data-e2e') || '') + ' | ' + (b.innerText || '').trim()")
                log(f"Nút Đăng được chọn: {info}", "info")

            if post_btn:
                ready = False
                for _ in range(120):
                    if await post_btn.is_enabled():
                        ready = True
                        break
                    await page.wait_for_timeout(1000)
                if not ready:
                    err = "TikTok chưa hoàn tất xử lý video sau 120 giây"
                    log(f"❌ {err}", "error")
                    await _debug_shot(page, db_path, task_id, channel_id, log, 'not_ready')
                    mark_task("ERROR", err)
                    return {"success": False, "error": err}
                if dry_run:
                    shot = screenshot_path or str(Path(db_path).resolve().parent / "storage" / "publish_dryrun" / f"dryrun_{channel_id}_{int(time.time())}.png")
                    Path(shot).parent.mkdir(parents=True, exist_ok=True)
                    await page.screenshot(path=shot, full_page=True)
                    log(f"🧪 Chạy khô: đã tải video, điền caption{', bật nhãn AI' if ai_generated else ''} — DỪNG trước khi bấm Đăng.", "success")
                    return {"success": True, "dry_run": True, "message": "Chạy khô xong, chưa đăng", "screenshot": shot}
                log("Đã tìm thấy nút Đăng Bài! Tiến hành kích hoạt Đăng...", "info")
                if task_id:
                    # Mốc "đã bấm Đăng": từ đây mọi lỗi đều có thể là video đã lên → không tự thử lại.
                    conn = connect_db(db_path)
                    conn.execute("UPDATE upload_tasks SET clicked_post_at=? WHERE id=?", (int(time.time()), task_id))
                    conn.commit()
                    conn.close()
                post_was_clicked = True
                await _debug_shot(page, db_path, task_id, channel_id, log, "pre_post")
                await post_btn.click()
                confirmed = False
                for second in range(1, 31):
                    await page.wait_for_timeout(1000)
                    if second in (3, 8, 15):
                        # Chuỗi ảnh sau khi bấm Đăng: TikTok đăng xong sẽ chuyển sang trang Posts.
                        log(f"Sau khi bấm Đăng {second}s — URL: {page.url}", "info")
                        await _debug_shot(page, db_path, task_id, channel_id, log, f"post_{second:02d}s")
                    if _post_is_confirmed(page.url):
                        confirmed = True
                        break
                    body_text = (await page.locator("body").inner_text()).lower()
                    if _post_is_confirmed(page.url, body_text):
                        confirmed = True
                        break

                await _debug_shot(page, db_path, task_id, channel_id, log, "post_done" if confirmed else "post_timeout")
                if confirmed:
                    log("✅ TikTok đã xác nhận tiếp nhận video.", "success")
                    video_url = await _published_video_url(page, full_caption, log)
                    mark_task("SUCCESS", result_url=video_url or page.url)
                    if video_url and task_id and not dry_run:
                        conn = connect_db(db_path)
                        conn.execute("UPDATE upload_tasks SET published_video_id=? WHERE id=?",
                                     (video_url.rstrip("/").split("/")[-1], task_id))
                        conn.commit()
                        conn.close()
                    return {"success": True, "message": "TikTok đã xác nhận tiếp nhận video!", "result_url": video_url or page.url,
                            "video_url": video_url}

                err = ("Đã bấm Đăng nhưng chưa nhận được xác nhận từ TikTok — video CÓ THỂ đã lên. "
                       "Kiểm tra kênh rồi bấm 'Đã lên' hoặc 'Thử lại'.")
                log(f"⚠️ {err}", "warning")
                mark_task("NEEDS_CHECK", err)
                return {"success": False, "error": err, "clicked": True, "needs_check": True}
            else:
                err = "Không tìm thấy nút Đăng sau khi tải video"
                log(f"❌ {err}", "error")
                await _debug_shot(page, db_path, task_id, channel_id, log, 'no_post_button')
                mark_task("ERROR", err)
                return {"success": False, "error": err}

        except Exception as e:
            err = f"Lỗi trong quá trình đăng bài: {str(e)}"
            log(f"❌ {err}", "error")
            await _debug_shot(page, db_path, task_id, channel_id, log)
            if post_was_clicked:
                # Bất kỳ lỗi nào sau mốc click đều là trạng thái không chắc chắn:
                # video có thể đã lên dù Playwright không đọc được redirect/toast.
                # Tuyệt đối không để scheduler tự xếp lại và đăng trùng.
                uncertain = f"Lỗi sau khi đã bấm Đăng: {str(e)}"
                mark_task("NEEDS_CHECK", uncertain)
                return {
                    "success": False,
                    "error": uncertain,
                    "clicked": True,
                    "needs_check": True,
                }
            mark_task("ERROR", err)
            return {"success": False, "error": err}
        finally:
            if use_profile_path and not profile_logged_out:
                try:
                    if await profile_session.write_back(channel_id, context):
                        profile_session.mark_session(channel_id, "OK", "publish")
                except Exception as exc:
                    log(f"Cảnh báo: không ghi ngược cookie ({exc})", "warning")
            if browser is not None:
                await browser.close()
            elif profile_context is not None:
                await profile_context.close()
            if profile_cm:
                profile_cm.__exit__(None, None, None)
            log("Đã đóng phiên duyệt an toàn.", "info")
            stop_tunnel()
