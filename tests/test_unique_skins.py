"""1 skin = 1 acc tự động: danh sách kênh lấy từ map Autopilot trừ tài khoản remake, chỉ gán lại khi có thay đổi."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bkt_web.autopilot import unique_skins as us


class UniqueSkinsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.adb = self.tmp / "a.db"
        with sqlite3.connect(self.adb) as c:
            c.execute("CREATE TABLE autopilot_channel_map(matrix_channel_id TEXT, tiktok_channel_id INT)")
            c.executemany("INSERT INTO autopilot_channel_map VALUES (?,?)", [("space_01", 1), ("vox_02", 2), ("remake_03", 3)])
        (self.tmp / "watch.json").write_text(json.dumps({"channels": [{"url": "x", "account_id": 3}]}))
        self.plan = {"rows": [], "violations": [], "duplicates": []}
        self.calls = []
        for p in (patch.object(us, "ACCOUNTS_FILE", self.tmp / "accounts.txt"), patch.object(us, "WATCH_FILE", self.tmp / "watch.json"),
                  patch.object(us, "STORAGE", self.tmp), patch.object(us.store, "adb", lambda: sqlite3.connect(self.adb)),
                  patch.object(us.store, "get_bool", lambda k: True), patch.object(us.store, "log_event", lambda *a, **k: None),
                  patch.object(us, "_plan", lambda: self.plan), patch.object(us, "_tool", self.tool)):
            p.start()
        self.addCleanup(patch.stopall)

    def tool(self, *args, **kw):
        self.calls.append(args)
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    def test_remake_accounts_are_left_out_and_nothing_is_applied_without_changes(self):
        result = us.ensure()
        self.assertEqual(us._current(), ["space_01", "vox_02"])
        self.assertEqual(result["changed"], 0)
        self.assertEqual(self.calls, [])

    def test_a_new_account_is_assigned_validated_and_synced(self):
        self.plan["rows"] = [{"channel_id": "vox_02", "status": "change"}]
        with patch.object(us.subprocess, "run", lambda *a, **k: type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()), \
             patch("bkt_web.matrix_config.sync_channel_configs", self.sync):
            result = us.ensure()
        self.assertEqual(self.calls, [("--apply",)])
        self.assertEqual(result["changed"], 1)

    async def sync(self):
        return {"synced": 2}

    def test_no_free_layout_never_applies(self):
        self.plan["rows"] = [{"channel_id": "space_01", "status": "no_slot"}, {"channel_id": "vox_02", "status": "change"}]
        result = us.ensure()
        self.assertEqual(result["no_slot"], ["space_01"])
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
