import asyncio
import os
import unittest


MODAL = '''<div contenteditable="true" id="cap" style="width:300px;height:60px">caption</div>
<div id="portal" style="position:fixed;inset:0"><div class="TUXModal-overlay" style="position:fixed;inset:0;background:#0006"></div>
<div role="dialog" class="TUXModal common-modal" style="position:fixed;top:30%;left:30%;background:#fff;padding:20px">
<h2>Turn on automatic content checks?</h2>
<button onclick="window.choice='turnon';document.getElementById('portal').remove()">Turn on</button>
<button onclick="window.choice='cancel';document.getElementById('portal').remove()">Cancel</button></div></div>'''


# Giống ảnh chụp lỗi thật (25/09): tour react-joyride "Got it" + banner cookie trong shadow DOM.
TOUR = '''<div contenteditable="true" id="cap" style="width:300px;height:60px">caption</div>
<div id="react-joyride-portal"><div class="react-joyride__overlay" style="position:fixed;inset:0;background:#0005"></div></div>
<div class="__floater __floater__open" style="position:fixed;bottom:10px;right:10px;background:#fff;padding:12px">
<div class="react-joyride__tooltip"><b>New editing features added</b><p>Now it's easier…</p>
<button onclick="window.tour='done';document.getElementById('react-joyride-portal').remove();this.closest('.__floater').remove()">Got it</button></div></div>
<tiktok-cookie-banner id="cb"></tiktok-cookie-banner>
<script>const root=document.getElementById('cb').attachShadow({mode:'open'});
root.innerHTML='<div style="position:fixed;left:0;right:0;bottom:200px;background:#1da1c1;padding:10px">Allow cookies? <button id="d">Decline optional cookies</button> <button>Allow all</button></div>';
root.getElementById('d').onclick=()=>{window.cookies='declined';document.getElementById('cb').remove();};</script>'''


class PublisherModalTest(unittest.TestCase):
    def test_blocking_studio_modal_is_declined_before_caption(self):
        from playwright.async_api import async_playwright
        from bkt_web.tiktok_publisher import _dismiss_blocking_modals

        async def run():
            async with async_playwright() as p:
                browser = await p.chromium.launch(executable_path=os.environ.get("TOKMATRIX_CHROME_PATH") or None)
                page = await browser.new_page()
                await page.set_content(MODAL)
                with self.assertRaises(Exception):
                    await page.click("#cap", timeout=1000)
                logs = []
                self.assertEqual(await _dismiss_blocking_modals(page, lambda m, level="info": logs.append(m)), 1)
                self.assertEqual(await page.evaluate("window.choice"), "cancel")  # từ chối, không bật tính năng
                self.assertIn("automatic content checks", logs[0])
                await page.click("#cap", timeout=1000)
                self.assertEqual(await _dismiss_blocking_modals(page, lambda *a: None), 0)
                await browser.close()

        asyncio.run(run())

    def test_feature_tour_and_cookie_banner_are_cleared(self):
        from playwright.async_api import async_playwright
        from bkt_web.tiktok_publisher import _dismiss_blocking_modals

        async def run():
            async with async_playwright() as p:
                browser = await p.chromium.launch(executable_path=os.environ.get("TOKMATRIX_CHROME_PATH") or None)
                page = await browser.new_page()
                await page.set_content(TOUR)
                with self.assertRaises(Exception):
                    await page.click("#cap", timeout=1000)
                logs = []
                self.assertGreaterEqual(await _dismiss_blocking_modals(page, lambda m, level="info": logs.append(m)), 1)
                self.assertEqual(await page.evaluate("window.tour"), "done")
                self.assertEqual(await page.evaluate("window.cookies"), "declined")
                self.assertTrue(any("New editing features" in m for m in logs))
                await page.click("#cap", timeout=1000)
                await browser.close()

        asyncio.run(run())


class PostButtonTest(unittest.TestCase):
    def test_form_post_button_is_chosen_not_sidebar_posts(self):
        from playwright.async_api import async_playwright
        from bkt_web.tiktok_publisher import _find_post_button

        sidebar = '<nav><button onclick="window.hit=\'sidebar\'">Posts</button></nav>'
        with_e2e = sidebar + '<div style="height:1500px"></div><button data-e2e="post_video_button" onclick="window.hit=\'form\'">Post</button>'
        without_e2e = sidebar + '<div style="height:1500px"></div><button onclick="window.hit=\'form\'">Post</button><button>Discard</button>'

        async def run():
            async with async_playwright() as p:
                browser = await p.chromium.launch(executable_path=os.environ.get("TOKMATRIX_CHROME_PATH") or None)
                page = await browser.new_page()
                for html in (with_e2e, without_e2e):
                    await page.set_content(html)
                    button = await _find_post_button(page)
                    self.assertIsNotNone(button)
                    await button.click()
                    self.assertEqual(await page.evaluate("window.hit"), "form")
                await page.set_content(sidebar)
                self.assertIsNone(await _find_post_button(page))
                await browser.close()

        asyncio.run(run())

class PublishedUrlTest(unittest.TestCase):
    def test_reads_link_of_row_matching_caption(self):
        from playwright.async_api import async_playwright
        from bkt_web.tiktok_publisher import _published_video_url

        html = '''<table>
        <tr><td><a href="https://www.tiktok.com/@u/video/111?lang=en">x</a></td><td>Older post about sharks</td></tr>
        <tr><td><a href="https://www.tiktok.com/@u/video/222">x</a></td><td>Crustaceans duel with shields. Instead of…</td></tr>
        </table>'''

        async def run():
            async with async_playwright() as p:
                browser = await p.chromium.launch(executable_path=os.environ.get("TOKMATRIX_CHROME_PATH") or None)
                page = await browser.new_page()
                await page.set_content(html)
                url = await _published_video_url(page, "Crustaceans duel with shields.\n\nInstead of dodging", lambda *a: None, wait_seconds=2)
                self.assertEqual(url, "https://www.tiktok.com/@u/video/222")
                self.assertEqual(await _published_video_url(page, "Something never posted", lambda *a: None, wait_seconds=1), "")
                await browser.close()

        asyncio.run(run())

class AiLabelPolicyTest(unittest.TestCase):
    def test_ai_label_is_off_unless_explicitly_enabled(self):
        from unittest import mock
        from bkt_web.tiktok_publisher import ai_label_enabled
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TOKMATRIX_TIKTOK_AI_LABEL", None)
            self.assertFalse(ai_label_enabled())
        with mock.patch.dict(os.environ, {"TOKMATRIX_TIKTOK_AI_LABEL": "1"}):
            self.assertTrue(ai_label_enabled())
        with mock.patch.dict(os.environ, {"TOKMATRIX_TIKTOK_AI_LABEL": "0"}):
            self.assertFalse(ai_label_enabled())

    def test_ai_label_modes_off_auto_on(self):
        from unittest import mock
        from bkt_web.tiktok_publisher import ai_label_mode, should_label_ai
        cases = {"off": (False, False), "auto": (True, False), "on": (True, True), "1": (True, False), "weird": (False, False)}
        for value, (with_flag, without_flag) in cases.items():
            with mock.patch.dict(os.environ, {"TOKMATRIX_TIKTOK_AI_LABEL": value}):
                self.assertEqual(should_label_ai(True), with_flag, value)
                self.assertEqual(should_label_ai(False), without_flag, value)
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TOKMATRIX_TIKTOK_AI_LABEL", None)
            self.assertEqual(ai_label_mode(), "off")

if __name__ == "__main__":
    unittest.main()
