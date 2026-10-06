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


class TranslateModeTest(unittest.TestCase):
    """Chế độ dịch: lời gốc (de) → lời Nhật đọc bằng TTS, đạo diễn vẽ người Nhật, phụ đề không cách chữ, font CJK."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        patch.object(tool, "ROOT", self.tmp).start()

    def tearDown(self):
        patch.stopall()

    def test_cjk_join_and_caption_font(self):
        self.assertEqual(tool._join_words(["海は", "塩の", "塊。"]), "海は塩の塊。")
        self.assertEqual(tool._join_words(["Das", "Meer"]), "Das Meer")
        self.assertEqual(tool._join_words(["바다는", "소금"]), "바다는 소금")
        out = self.tmp / "c.ass"
        tool._captions_ass([[0, .2, "海は"], [.2, .4, "塩の"]], 1.0, out, "ja")
        text = out.read_text()
        self.assertIn("Style: Cap,Noto Sans CJK JP,", text)
        self.assertIn(",海は塩の", text)
        tool._captions_ass([[0, .2, "Das"]], 1.0, out)
        self.assertIn("Style: Cap,DejaVu Serif,", out.read_text())

    def test_translate_voice_localizes_and_speaks_each_line(self):
        work = self.tmp / "v1"; work.mkdir()
        words = [[0, .5, "Meine"], [.5, 1, "Mutter"], [1, 1.5, "log."], [2, 2.5, "Ich"], [2.5, 3, "ging."]]
        (work / "orig_words.json").write_text(json.dumps({"lang": "de", "words": words}))
        asked, spoken = [], []
        patch.object(tool, "ask_gemini", lambda p: asked.append(p) or json.dumps({"lines": ["0: 母は 嘘を ついた。", "私は家を出た。"]})).start()
        patch.object(tool, "_account_voice", lambda lang: ("ja-JP-NanamiNeural", 1.0)).start()

        def fake_tts(text, voice, speed, out, lang):
            spoken.append((text, voice, lang))
            import subprocess
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=d=0.5", str(out)], check=True)
        patch.object(tool, "_tts_line", fake_tts).start()
        tool.translate_voice("v1", work, "ja", "de")
        self.assertIn("Japanese", asked[0]); self.assertIn("German", asked[0]); self.assertIn("name", asked[0])
        self.assertEqual([t for t, *_ in spoken], ["母は嘘をついた。", "私は家を出た。"])  # bỏ số thứ tự + dấu cách giữa chữ Nhật
        self.assertTrue((work / "vo.mp3").stat().st_size > 0)
        self.assertEqual(json.loads((work / "translation.json").read_text())["to"], "ja")
        tool.translate_voice("v1", work, "ja", "de")  # chạy lại: không gọi lại Gemini/TTS
        self.assertEqual(len(asked), 1)

    def test_director_gets_the_locale_look(self):
        work = self.tmp / "v2"; work.mkdir()
        got = []
        patch.object(tool, "ask_gemini", lambda p: got.append(p) or json.dumps({"cast": [], "scenes": [{"start": 0}]})).start()
        tool.direct("v2", work, [[0, 1, "母は"], [1, 2, "嘘。"]], "ja", tool.LOCALE_LOOK["ja"])
        self.assertIn("present-day Japan", got[0])


class NoStoryFilterTest(unittest.TestCase):
    """Owner 06/10: làm hết — chỉ bỏ video gần như không có lời; video bị bộ lọc cũ bỏ qua được làm lại."""

    def test_sparse_korean_and_short_videos_are_made(self):
        ko = [[i * 1.0, i * 1.0 + 0.8, "단어"] for i in range(20)]  # 20 cụm / 45 s ≈ 0,44 "từ"/giây
        self.assertTrue(tool.is_story(ko, 45))
        self.assertTrue(tool.is_story([[0, 1, "a"]] * 6, 12))  # Shorts dưới 30 s
        self.assertFalse(tool.is_story([[0, 1, "la"]] * 3, 40))  # gần như không có lời

    def test_old_filter_skips_are_redone(self):
        tmp = Path(tempfile.mkdtemp())
        with patch.object(tool, "ROOT", tmp), patch.object(tool, "fetch", side_effect=RuntimeError("đã vào lại pipeline")):
            (tmp / "k1").mkdir()
            (tmp / "k1" / "state.json").write_text(json.dumps({"id": "k1", "status": "skipped", "reason": "không phải story (20 từ / 45s)"}))
            (tmp / "k2").mkdir()
            (tmp / "k2" / "state.json").write_text(json.dumps({"id": "k2", "status": "skipped", "reason": "gần như không có lời (2 từ / 40s)"}))
            self.assertEqual(tool.remake({"id": "k1", "url": "u"})["status"], "error")  # chạy lại, không trả cached
            self.assertTrue(tool.remake({"id": "k2", "url": "u"}).get("cached"))
