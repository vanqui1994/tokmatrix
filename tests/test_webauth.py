import unittest
from unittest import mock

from bkt_web import webauth


class WebAuthRateLimitTest(unittest.TestCase):
    def setUp(self):
        with webauth._ATTEMPTS_LOCK:
            webauth._ATTEMPTS.clear()
            webauth._LAST_PRUNE = 0.0

    def tearDown(self):
        with webauth._ATTEMPTS_LOCK:
            webauth._ATTEMPTS.clear()
            webauth._LAST_PRUNE = 0.0

    def test_limit_expires_after_window(self):
        with mock.patch.object(webauth.time, "time", return_value=1000.0):
            for _ in range(webauth.MAX_ATTEMPTS):
                webauth.record_failure("1.2.3.4")
            self.assertTrue(webauth.too_many_attempts("1.2.3.4"))

        with mock.patch.object(
            webauth.time, "time", return_value=1000.0 + webauth.ATTEMPT_WINDOW + 1
        ):
            self.assertFalse(webauth.too_many_attempts("1.2.3.4"))

    def test_cache_is_bounded_and_evicts_oldest_client(self):
        with mock.patch.object(webauth, "MAX_TRACKED_CLIENTS", 3), \
             mock.patch.object(webauth.time, "time", return_value=2000.0):
            for client in ("ip-1", "ip-2", "ip-3", "ip-4"):
                webauth.record_failure(client)

        with webauth._ATTEMPTS_LOCK:
            self.assertEqual(len(webauth._ATTEMPTS), 3)
            self.assertNotIn("ip-1", webauth._ATTEMPTS)
            self.assertEqual(list(webauth._ATTEMPTS), ["ip-2", "ip-3", "ip-4"])

    def test_clear_attempts_removes_client(self):
        with mock.patch.object(webauth.time, "time", return_value=3000.0):
            webauth.record_failure("client")
            webauth.clear_attempts("client")
            self.assertFalse(webauth.too_many_attempts("client"))


if __name__ == "__main__":
    unittest.main()
