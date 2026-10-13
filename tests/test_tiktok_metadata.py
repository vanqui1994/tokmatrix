import json
import unittest

from bkt_web import tiktok_metadata as tm


def item(**penalty):
    return {"id": "1", "desc": "x", "CategoryType": 113, "diversificationId": 10048,
            "stats": {"playCount": 5}, "penaltyContext": penalty}


CLEAN = dict(tns_status=102, arb_content_safety_status=102, video_status=10, display_penalty_type="0", ec_global_verdict=1)


class EvaluateTest(unittest.TestCase):
    def test_clean_video_is_qualified_and_shop_eligible(self):
        r = tm.evaluate(item(**CLEAN))
        self.assertEqual(r["action"], "QUALIFIED_NORMAL")
        self.assertTrue(r["is_shop_eligible"])
        self.assertEqual(r["category"]["identifier"], "ANIMALS")
        self.assertEqual(r["sub_niche"]["name"], "Camping / Survival")

    def test_missing_penalty_context_is_never_clean(self):
        r = tm.evaluate({"id": "1", "categoryType": 104})
        self.assertEqual(r["action"], "NO_PENALTY_DATA")
        self.assertFalse(r["is_clean"])
        self.assertFalse(r["is_shop_eligible"])

    def test_real_guest_item_without_arb_is_clean(self):
        # Dạng thật của item_list guest (10/2026): số nguyên, không có arb_content_safety_status.
        r = tm.evaluate(item(display_penalty_type=0, display_policy=0, display_ui_type=0, ec_global_verdict=6,
                             reviewed=1, status=102, tns_status=102, video_status=10))
        self.assertEqual(r["action"], "QUALIFIED_NORMAL")
        self.assertFalse(r["is_shop_eligible"])  # 6 không có trong bảng mã → không kết luận Shop

    def test_lowercase_category_key_still_read(self):
        self.assertEqual(tm.evaluate({"categoryType": 104})["category"]["identifier"], "COMEDY")

    def test_partial_codes_do_not_default_to_clean(self):
        r = tm.evaluate(item(video_status=10))
        self.assertEqual(r["action"], "NO_PENALTY_DATA")
        self.assertFalse(r["is_clean"])

    def test_verdict_priority(self):
        cases = [
            (dict(CLEAN, video_status=4), "DISCARD_UNAVAILABLE"),
            (dict(CLEAN, arb_content_safety_status=301), "FLAG_REUP_SUPPRESSED"),
            (dict(CLEAN, arb_content_safety_status=202), "FLAG_AUDIO_COPYRIGHT"),
            (dict(CLEAN, display_penalty_type="1"), "FLAG_AUDIO_COPYRIGHT"),
            (dict(CLEAN, display_penalty_type=3), "FLAG_FYP_SHADOWBAN"),
            (dict(CLEAN, tns_status=303), "FLAG_POLICY_VIOLATION"),
            (dict(CLEAN, display_penalty_type="4"), "FLAG_POLICY_VIOLATION"),
            (dict(CLEAN, tns_status=101), "PENDING_REVIEW"),
        ]
        for penalty, expected in cases:
            with self.subTest(penalty=penalty):
                r = tm.evaluate(item(**penalty))
                self.assertEqual(r["action"], expected)
                self.assertFalse(r["is_shop_eligible"])

    def test_unknown_category_code_is_reported_not_guessed(self):
        self.assertEqual(tm.category_label("999")["identifier"], "UNKNOWN")
        self.assertIsNone(tm.category_label(None))
        self.assertEqual(tm.sub_niche_label(50000)["group"], "Ngoài dải đã biết")


class ExtractTest(unittest.TestCase):
    def test_item_list_response(self):
        text = json.dumps({"statusCode": 0, "itemList": [item(**CLEAN), item()]})
        r = tm.summarize(tm.extract_items(text))
        self.assertEqual(r["total"], 2)
        self.assertEqual(r["actions"], {"QUALIFIED_NORMAL": 1, "NO_PENALTY_DATA": 1})
        self.assertEqual(r["videos"][0]["view_count"], 5)

    def test_view_source_html(self):
        data = {"__DEFAULT_SCOPE__": {"webapp.video-detail": {"itemInfo": {"itemStruct": item(**CLEAN)}}}}
        html = ('<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'
                + json.dumps(data) + "</script></html>")
        self.assertEqual(tm.extract_items(html)[0]["CategoryType"], 113)

    def test_sigi_state_html(self):
        html = '<script id="SIGI_STATE">' + json.dumps({"ItemModule": {"1": item(**CLEAN)}}) + "</script>"
        self.assertEqual(len(tm.extract_items(html)), 1)

    def test_invalid_input(self):
        for text in ("", "{bad", "<html>nothing</html>", json.dumps({"foo": 1})):
            with self.subTest(text=text), self.assertRaises(ValueError):
                tm.extract_items(text)


class GuestTest(unittest.TestCase):
    def test_clean_username(self):
        from bkt_web import tiktok_guest as g
        self.assertEqual(g.clean_username("@khaby.lame"), "khaby.lame")
        self.assertEqual(g.clean_username("https://www.tiktok.com/@tiktok/video/1?x=1"), "tiktok")
        for bad in ("", "a b", "x" * 30, "../etc"):
            with self.subTest(bad=bad), self.assertRaises(g.GuestScanError):
                g.clean_username(bad)


class GuestVpnFallbackTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import contextlib, sqlite3, tempfile, os
        from unittest import mock
        from bkt_web import paths
        from bkt_web.routes import stats_routes
        self.stats_routes = stats_routes
        self.db = os.path.join(tempfile.mkdtemp(), "t.db")
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT, vpn_config TEXT)")
        conn.execute("INSERT INTO channels VALUES (7, 'Own.Chan', 'NordLive/de1.conf'), (8, 'novpn', '')")
        conn.commit(); conn.close()
        self.tunnels = []

        @contextlib.asynccontextmanager
        async def fake_tunnel(ch_id, conf):
            self.tunnels.append((ch_id, conf))
            yield 4242
        self.patches = [mock.patch.object(paths, "DB_PATH", self.db),
                        mock.patch.object(stats_routes, "channel_tunnel", fake_tunnel)]
        for p in self.patches:
            p.start()

    async def asyncTearDown(self):
        for p in self.patches:
            p.stop()

    def fetch(self, blocked_direct):
        from bkt_web import tiktok_guest
        calls = []

        async def fake(username, max_items=60, timeout=90.0, socks_port=None):
            calls.append(socks_port)
            if blocked_direct and not socks_port:
                raise tiktok_guest.GuestBlocked("chặn")
            return {"username": username, "items": [item(**CLEAN)], "pages": 1, "has_more": False}
        return calls, fake

    async def test_direct_when_not_blocked(self):
        from unittest import mock
        from bkt_web import tiktok_guest
        calls, fake = self.fetch(False)
        with mock.patch.object(tiktok_guest, "fetch_guest_items", fake):
            r = await self.stats_routes.guest_items("own.chan")
        self.assertEqual((r["via"], calls, self.tunnels), ("direct", [None], []))

    async def test_blocked_retries_through_the_channels_own_tunnel(self):
        from unittest import mock
        from bkt_web import tiktok_guest
        calls, fake = self.fetch(True)
        with mock.patch.object(tiktok_guest, "fetch_guest_items", fake):
            r = await self.stats_routes.guest_items("@own.chan")
        self.assertEqual(r["via"], "vpn")
        self.assertEqual(calls, [None, 4242])
        self.assertEqual(self.tunnels, [(7, "NordLive/de1.conf")])

    async def test_blocked_without_own_vpn_never_borrows_a_tunnel(self):
        from unittest import mock
        from fastapi import HTTPException
        from bkt_web import tiktok_guest
        for name in ("novpn", "stranger"):
            calls, fake = self.fetch(True)
            with self.subTest(name=name), mock.patch.object(tiktok_guest, "fetch_guest_items", fake), \
                    self.assertRaises(HTTPException):
                await self.stats_routes.guest_items(name)
        self.assertEqual(self.tunnels, [])


class DiagnosticsTest(unittest.TestCase):
    def test_evaluate_video_diagnostics_carries_metadata(self):
        from bkt_web import server
        v = server.evaluate_video_diagnostics(item(**CLEAN), channel_country="DE", author_username="a")
        self.assertEqual(v["category_type"], 113)
        self.assertEqual(v["diversification_id"], 10048)
        self.assertEqual(v["meta_action"], "QUALIFIED_NORMAL")
        self.assertEqual(v["penalty_context"]["tns_status"], 102)


if __name__ == "__main__":
    unittest.main()
