"""deploy/tokmatrix-agent-quota.py — đọc lỗi 429 trong conversation Antigravity."""
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from importlib.machinery import SourceFileLoader
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
quota = SourceFileLoader("tokmatrix_agent_quota", str(ROOT / "deploy" / "tokmatrix-agent-quota.py")).load_module()


def _cid(ch):
    return f"{ch * 8}-{ch * 4}-{ch * 4}-{ch * 4}-{ch * 12}"


def _body(model, minutes=30, escaped=False):
    ts = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")
    text = json.dumps({"error": {"code": 429, "details": [
        {"reason": "QUOTA_EXHAUSTED", "metadata": {"model": model, "quotaResetTimeStamp": ts}}]}}, indent=2)
    return json.dumps(text) if escaped else text


class AgentQuotaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "conv").mkdir()
        self.orig = quota.STATE_DIR, quota.CONV_DIR
        quota.STATE_DIR, quota.CONV_DIR = root / "state", root / "conv"

    def tearDown(self):
        quota.STATE_DIR, quota.CONV_DIR = self.orig
        self.tmp.cleanup()

    def conv(self, ch, text):
        (quota.CONV_DIR / f"{_cid(ch)}.db").write_text(text)
        return _cid(ch)

    def check(self, bridge, account=""):
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = quota.check(bridge, account)
        return rc, buf.getvalue().split()[1:] if rc == 0 else []

    def test_embedded_agents_md_text_is_not_a_block(self):
        quota.record("image", self.conv("a", "skip dispatch until the `quotaResetTimeStamp` of a 429 QUOTA_EXHAUSTED"))
        self.assertEqual(self.check("image"), (1, []))

    def test_real_429_blocks_image_bridge_only(self):
        quota.record("image", self.conv("a", _body("gemini-3.1-flash-image")))
        self.assertEqual(self.check("image"), (0, ["gemini-3.1-flash-image"]))
        self.assertEqual(self.check("script"), (1, []))

    def test_text_model_blocks_both_bridges(self):
        quota.record("image", self.conv("a", _body("gemini-3-flash", escaped=True)))
        self.assertEqual(self.check("script")[0], 0)

    def test_account_filter_ignores_previous_account(self):
        quota.record("image", self.conv("a", _body("gemini-3.1-flash-image")), "old@x.com")
        quota.record("image", self.conv("b", "no error"), "new@x.com")
        self.assertEqual(self.check("image", "new@x.com"), (1, []))
        self.assertEqual(self.check("image", "old@x.com")[0], 0)
        self.assertEqual(self.check("image")[0], 0)      # không lọc: vẫn thấy

    def test_legacy_lines_without_account_do_not_block_named_account(self):
        path = quota.STATE_DIR / "image.cids"
        quota.STATE_DIR.mkdir(parents=True)
        cid = self.conv("a", _body("gemini-3.1-flash-image"))
        import time
        path.write_text(f"{int(time.time())} {cid}\n")
        self.assertEqual(self.check("image", "new@x.com"), (1, []))


if __name__ == "__main__":
    unittest.main()


class ValidationRequiredTest(AgentQuotaTest):
    BODY = json.dumps({"error": {"code": 403, "status": "PERMISSION_DENIED", "details": [
        {"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "VALIDATION_REQUIRED",
         "domain": "cloudcode-pa.googleapis.com", "metadata": {"validation_error_message": "Verify your account to continue."}}]}})

    def test_validation_error_blocks_every_bridge_for_that_account_only(self):
        quota.record("script", self.conv("b", self.BODY), "bad@x.com")
        self.assertEqual(self.check("script", "bad@x.com"), (0, ["VALIDATION_REQUIRED"]))
        self.assertEqual(self.check("image", "bad@x.com"), (0, ["VALIDATION_REQUIRED"]))
        self.assertEqual(self.check("image", "good@x.com"), (1, []))

    def test_escaped_error_is_detected_but_prose_is_not(self):
        quota.record("image", self.conv("c", json.dumps(self.BODY)), "bad@x.com")
        self.assertEqual(self.check("image", "bad@x.com")[1], ["VALIDATION_REQUIRED"])
        quota.record("image", self.conv("d", "Nếu gặp VALIDATION_REQUIRED thì xác minh tài khoản"), "ok@x.com")
        self.assertEqual(self.check("image", "ok@x.com"), (1, []))

