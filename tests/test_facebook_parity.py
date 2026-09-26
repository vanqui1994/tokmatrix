"""
Khoá module Facebook vào bản gốc SimpleFacebookProV2 1.0.1.

Ground truth là bundle renderer `main.c0c4e7274d9d82fe.js` giải nén từ
SimpleFacebookProV2_1.0.1.dmg. Nếu không có bundle trong cây mã nguồn thì
các test đối chiếu được skip, phần test thuần thuật toán vẫn chạy.
"""

import json
import re
import unittest
from pathlib import Path

from bkt_web.facebook_engine import (
    FB_GRAPHQL_DOC_IDS,
    FB_REACTION_IDS,
    GRAPHQL_CALLS,
    FacebookEngine,
)

BUNDLE = Path(__file__).resolve().parent.parent / "main.c0c4e7274d9d82fe.js"

# fb_api_req_friendly_name:"X" … doc_id:"Y" trong cùng một object tham số
PAIR_RE = re.compile(
    r'fb_api_req_friendly_name:"([^"]+)"'
    r'((?:(?!fb_api_req_friendly_name)[\s\S]){0,4000}?)'
    r'doc_id:"(\d+)"'
)


def load_truth():
    source = BUNDLE.read_text(encoding="utf-8", errors="replace")
    truth = {}
    for name, _, doc_id in PAIR_RE.findall(source):
        truth.setdefault(name, set()).add(doc_id)
    return truth


@unittest.skipUnless(BUNDLE.exists(), "Không có bundle gốc để đối chiếu")
class DocIdParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.truth = load_truth()

    def test_every_doc_id_matches_original(self):
        for name, value in FB_GRAPHQL_DOC_IDS.items():
            with self.subTest(friendly_name=name):
                self.assertIn(name, self.truth, "friendly name không có trong bản gốc")
                ids = value if isinstance(value, list) else [value]
                for doc_id in ids:
                    self.assertIn(doc_id, self.truth[name], "doc_id không thuộc friendly name này")

    def test_no_friendly_name_is_missing(self):
        self.assertEqual(set(FB_GRAPHQL_DOC_IDS), set(self.truth))

    def test_every_call_site_matches_original(self):
        for key, (name, doc_id, _lsd) in GRAPHQL_CALLS.items():
            with self.subTest(call_site=key):
                self.assertIn(doc_id, self.truth.get(name, set()))


class EngineAlgorithmTest(unittest.TestCase):
    """Các thuật toán bản gốc tự cài, không phụ thuộc bundle."""

    def test_jazoest_matches_get_numeric_value(self):
        # C.getNumericValue: "2" + tổng charCode
        self.assertEqual(FacebookEngine.get_numeric_value("abc"), "2294")
        self.assertEqual(FacebookEngine.get_numeric_value(""), "20")

    def test_reaction_ids_are_facebook_ids_not_ordinals(self):
        self.assertEqual(FB_REACTION_IDS["LIKE"], "1635855486666999")
        self.assertEqual(FB_REACTION_IDS["HAHA"], "115940658764963")
        for value in FB_REACTION_IDS.values():
            self.assertTrue(value.isdigit() and len(value) >= 15)

    def test_feedback_id_is_base64_encoded(self):
        self.assertEqual(FacebookEngine.b64("feedback:123"), "ZmVlZGJhY2s6MTIz")
        self.assertEqual(FacebookEngine.unb64("ZmVlZGJhY2s6MTIz"), "feedback:123")

    def test_desktop_params_carry_every_original_field(self):
        params = FacebookEngine.build_params_fb_desktop(
            {"uid": "100", "fbdtsg": "NAcM", "rev": "1019623812"}
        )
        expected = {
            "av", "__user", "__a", "__dyn", "__csr", "__req", "__beoa", "__pc",
            "dpr", "__ccg", "__rev", "__s", "__hsi", "__comet_req", "fb_dtsg",
            "jazoest", "__spin_r", "__spin_b", "__spin_t", "server_timestamps",
        }
        self.assertEqual(set(params), expected)
        self.assertEqual(params["jazoest"], FacebookEngine.get_numeric_value("NAcM"))
        self.assertEqual(len(params["__hsi"]), 22)

    def test_missing_init_data_is_rejected(self):
        from bkt_web.facebook_engine import FacebookError

        with self.assertRaises(FacebookError):
            FacebookEngine.build_params_fb_desktop({"uid": "100", "cookie": ""})

    def test_unknown_action_fails_instead_of_faking_success(self):
        result = FacebookEngine.execute_action({"uid": "1", "cookie": ""}, "khong_ton_tai")
        self.assertFalse(result["success"])

    def test_spin_text_resolves_nested_groups(self):
        for _ in range(20):
            self.assertIn(FacebookEngine.spin_text("{a|b}"), ("a", "b"))
        self.assertEqual(FacebookEngine.spin_text("{x}"), "x")


if __name__ == "__main__":
    unittest.main()
