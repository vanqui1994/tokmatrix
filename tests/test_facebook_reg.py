"""
Test Facebook Registration Engine - Concurrency & Store Email Acquisition
"""

import unittest
import concurrent.futures
import sqlite3
import time
from pathlib import Path
from bkt_web.facebook_reg_engine import (
    get_next_available_store_email,
    update_store_email_status,
    FacebookRegistrationRunner,
    RandomFacebookIdentityGenerator,
    DB_PATH
)


class TestFacebookRegEngine(unittest.TestCase):
    def test_store_email_concurrency_race_condition(self):
        """Đảm bảo 10 luồng đồng thời lấy email không bao giờ nhận trùng nhau"""
        thread_count = 10
        with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
            futures = [executor.submit(get_next_available_store_email) for _ in range(thread_count)]
            results = [f.result() for f in futures]

        valid_results = [r for r in results if r is not None]
        emails = [r["email"] for r in valid_results]

        # Kiểm tra không có email nào bị trùng lặp
        self.assertEqual(len(emails), len(set(emails)), f"Bị trùng lặp email giữa các luồng: {emails}")

        # Dọn dẹp trạng thái test trong db
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            for r in valid_results:
                cursor.execute("UPDATE fb_email_store SET status = 'Ready' WHERE id = ?", (r["id"],))
            conn.commit()

    def test_resolve_target_locale_vpn_us_and_gb(self):
        """Đảm bảo cấu hình locale, URL và header khớp với VPN US / UK thay vì mặc định VN"""
        us_meta = FacebookRegistrationRunner.resolve_target_locale("US")
        self.assertEqual(us_meta["target_country"], "US")
        self.assertEqual(us_meta["fb_locale"], "en_US")
        self.assertEqual(us_meta["page_locale"], "en-US")
        self.assertEqual(us_meta["target_url"], "https://www.facebook.com/r.php?locale=en_US")
        self.assertTrue(us_meta["is_western"])
        self.assertIn("en-US", us_meta["accept_language"])

        uk_meta = FacebookRegistrationRunner.resolve_target_locale("UK")
        self.assertEqual(uk_meta["target_country"], "GB")
        self.assertEqual(uk_meta["fb_locale"], "en_GB")
        self.assertEqual(uk_meta["page_locale"], "en-GB")
        self.assertEqual(uk_meta["target_url"], "https://www.facebook.com/r.php?locale=en_GB")
        self.assertTrue(uk_meta["is_western"])

        vn_meta = FacebookRegistrationRunner.resolve_target_locale("none")
        self.assertEqual(vn_meta["target_country"], "VN")
        self.assertEqual(vn_meta["fb_locale"], "vi_VN")
        self.assertEqual(vn_meta["page_locale"], "vi-VN")
        self.assertEqual(vn_meta["target_url"], "https://www.facebook.com/r.php?locale=vi_VN")
        self.assertFalse(vn_meta["is_western"])

    def test_western_identity_generation(self):
        """Kiểm tra sinh danh tính US/UK không mang họ tên dấu tiếng Việt"""
        for _ in range(20):
            western = RandomFacebookIdentityGenerator.random_fullname(gender="Nam", is_western=True)
            self.assertTrue(western["firstname"].isalpha())
            self.assertTrue(western["lastname"].isalpha())
            # Không chứa ký tự tiếng Việt có dấu
            self.assertTrue(all(ord(c) < 128 for c in western["fullname"]))

        vn = RandomFacebookIdentityGenerator.random_fullname(gender="Nam", is_western=False)
        self.assertIn("fullname", vn)
        self.assertTrue(len(vn["fullname"].split()) >= 2)


if __name__ == "__main__":
    unittest.main()
