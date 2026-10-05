"""Story Remake: hết video mới thì lượt chạy đi tiếp xuống video cũ chưa từng remake."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("story_remake_tool", ROOT / "compare_studio" / "tools" / "story_remake.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class BackfillTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        patch.object(tool, "ROOT", self.tmp).start()
        self.items = [{"id": f"v{i}", "url": f"u{i}", "title": ""} for i in range(6)]  # v0 mới nhất
        for i in range(3):  # 3 video mới nhất đã làm ở lượt trước
            (self.tmp / f"v{i}").mkdir(parents=True)
            (self.tmp / f"v{i}" / "state.json").write_text(json.dumps({"id": f"v{i}", "status": "done"}))
        (self.tmp / "v3").mkdir()
        (self.tmp / "v3" / "state.json").write_text(json.dumps({"id": "v3", "status": "error", "attempts": 3}))
        self.made = []

        def fake_remake(item, lang="auto"):
            st = json.loads((self.tmp / item["id"] / "state.json").read_text()) if (self.tmp / item["id"] / "state.json").exists() else {}
            if st.get("status") in ("done", "skipped") or st.get("attempts", 0) >= tool.MAX_ATTEMPTS:
                return {**st, "cached": True}
            self.made.append(item["id"])
            return {"id": item["id"], "status": "done"}
        patch.object(tool, "remake", fake_remake).start()
        patch.object(tool, "list_channel", lambda url, limit: self.items).start()

    def tearDown(self):
        patch.stopall()

    def test_already_done_videos_do_not_use_up_the_run_limit(self):
        with patch.object(sys, "argv", ["x", "channel", "https://www.youtube.com/@k/shorts", "--limit", "2", "--jobs", "1"]):
            tool._main()
        self.assertEqual(self.made, ["v4", "v5"])  # bỏ qua v0–v2 (xong) và v3 (lỗi 3 lần), làm 2 video cũ hơn
        self.assertEqual([r["id"] for r in json.loads((self.tmp / "last_run.json").read_text())], ["v4", "v5"])
