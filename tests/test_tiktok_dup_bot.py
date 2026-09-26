import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import tiktok_dup_bot as bot

FLAGGED = """🎬 THÔNG TIN VIDEO
👤 Kênh: gilbert4mwp2905 (@gilbert4mwp2905)
📝 Tiêu đề: Too fast for muscle? #wildlife #fyp
👁 Views: 1 | ❤️ Likes: 0 | 💬 Comments: 0
🌍 Quốc gia: GB
📅 Thời gian tạo: 2026-09-26 02:37:29
🚫 Shadowban: ❌ Có
🔁 Trùng lặp: ❌ Trùng lặp (VIDEO GỐC)"""

CLEAN = FLAGGED.replace("Shadowban: ❌ Có", "Shadowban: ✅ Không").replace("Trùng lặp: ❌ Trùng lặp (VIDEO GỐC)", "Trùng lặp: ✅ Không trùng")


class ParseTest(unittest.TestCase):
    def test_flagged_reply_from_screenshot(self):
        out = bot.parse_reply(FLAGGED, ["https://www.tiktok.com/@gilbert4mwp2905", "https://www.tiktok.com/@x/video/111"])
        self.assertTrue(out["shadowban"])
        self.assertTrue(out["duplicate"])
        self.assertEqual(out["original_url"], "https://www.tiktok.com/@x/video/111")
        self.assertEqual(out["views"], 1)

    def test_clean_reply(self):
        out = bot.parse_reply(CLEAN, [])
        self.assertIs(out["shadowban"], False)
        self.assertIs(out["duplicate"], False)
        self.assertEqual(out["original_url"], "")


class RunOnceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "ch.db"
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE upload_tasks(id INTEGER PRIMARY KEY, channel_id INT, status TEXT, result_url TEXT, uploaded_at INT, published_video_id TEXT DEFAULT '', video_slug TEXT DEFAULT '')")
        conn.execute("CREATE TABLE channels(id INTEGER PRIMARY KEY, username TEXT)")
        conn.execute("INSERT INTO channels VALUES(129, 'donald.william.qae.2')")
        old = int(time.time()) - 3600
        conn.executemany("INSERT INTO upload_tasks(id,channel_id,status,result_url,uploaded_at,published_video_id,video_slug) VALUES(?,?,?,?,?,?,?)", [
            (1, 140, "SUCCESS", "https://www.tiktok.com/@a/video/1", old, "1", "science-b"),
            (2, 141, "SUCCESS", "https://www.tiktok.com/tiktokstudio/content", old, "", ""),   # không có link video → bỏ
            (3, 142, "SUCCESS", "https://www.tiktok.com/@c/video/3", int(time.time()), "3", ""),  # vừa đăng → chờ
            (4, 143, "QUEUED", "", 0, "", ""),
            (5, 129, "SUCCESS", "https://www.tiktok.com/tiktokstudio/content", old, "9", "science-a"),  # video gốc của mình
        ])
        conn.commit()
        conn.close()
        self.addCleanup(self.tmp.cleanup)

    def test_checks_due_videos_once_and_records_flags(self):
        asked = []
        def asker(url):
            asked.append(url)
            return {**bot.parse_reply(FLAGGED, ["https://www.tiktok.com/@x/video/9"]), "raw": FLAGGED}
        with mock.patch.object(bot, "_notify") as notified, mock.patch.object(bot, "CHECK_SPACING_SECONDS", 0):
            self.assertEqual(bot.run_once(self.db, asker=asker), 1)
            self.assertEqual(bot.run_once(self.db, asker=asker), 0)   # đã kiểm → không hỏi lại
        self.assertEqual(asked, ["https://www.tiktok.com/@a/video/1"])
        notified.assert_called_once()
        self.assertIn("@donald.william.qae.2", notified.call_args[0][0])   # bot ghép sai tên kênh, id vẫn tra ra đúng bài của mình
        row = sqlite3.connect(self.db).execute("SELECT shadowban, duplicate, original_url, views, original_task_id FROM video_checks WHERE task_id=1").fetchone()
        self.assertEqual(row, (1, 1, "https://www.tiktok.com/@x/video/9", 1, 5))

    def test_errors_retry_at_most_three_times(self):
        def boom(url):
            raise TimeoutError("no reply")
        with mock.patch.object(bot, "CHECK_SPACING_SECONDS", 0):
            for _ in range(4):
                bot.run_once(self.db, asker=boom)
        row = sqlite3.connect(self.db).execute("SELECT attempts, checked_at, error FROM video_checks WHERE task_id=1").fetchone()
        self.assertEqual(row[0], 3)
        self.assertEqual(row[1], 0)
        self.assertIn("TimeoutError", row[2])

    def test_not_logged_in_does_nothing(self):
        from bkt_web import telegram_web_checker
        with mock.patch.object(bot, "_creds", return_value={}), mock.patch.object(telegram_web_checker, "logged_in", return_value=False):
            self.assertEqual(bot.run_once(self.db), 0)
            self.assertFalse(bot.start_background())


class WebFallbackTest(unittest.TestCase):
    def test_uses_telegram_web_when_no_telethon_session(self):
        from bkt_web import telegram_web_checker
        with mock.patch.object(bot, "_creds", return_value={}), \
             mock.patch.object(telegram_web_checker, "logged_in", return_value=True), \
             mock.patch.object(telegram_web_checker, "check_url", return_value={"duplicate": True}) as web:
            self.assertTrue(bot.available())
            self.assertEqual(bot.check_url("https://www.tiktok.com/@a/video/1"), {"duplicate": True})
        web.assert_called_once()


if __name__ == "__main__":
    unittest.main()


GILBERT = """━━━━━━━━━━━━━━━━━
👤 Username: gilbert4mwp2905
✨ Name: gilbert4mwp2905
🆔 ID: 7683788374548988960
👥 Followers: 0
❤️ Likes: 4
🎬 Videos: 2
━━━━━━━━━━━━━━━━━
🏷️ 5 video gần nhất (✅ là bình thường, ❌ là vi phạm):

🔗 #1: Too fast for muscle? Pure muscle contraction cannot accelerate fast enough to vaporize surrounding water. #wildlife #fyp
📅 Thời gian tạo: 2026-09-26 02:37:29
👁️:1 ❤️:0 💬:0
🌍 Quốc gia: GB
🚫 Shadowban: ❌
🔁 Trùng lặp: ❌ (VIDEO GỐC)

🔗 #2: LAURA SOFÍA depende #profejesusandres
📅 Thời gian tạo: 2026-09-13 01:44:19
👁️:422 ❤️:5 💬:0
🌍 Quốc gia: GB
🚫 Shadowban: ✅
🔁 Trùng lặp: ✅
━━━━━━━━━━━━━━━━━"""
GILBERT_LINKS = ["https://tiktok.com/@gilbert4mwp2905/video/7689543849525628163",
                 "https://tiktok.com/@gilbert4mwp2905/video/7689542029377883414",
                 "https://tiktok.com/@gilbert4mwp2905/video/7684706032186084630"]


class ChannelReplyTest(unittest.TestCase):
    def test_parses_real_channel_reply(self):
        info = bot.parse_channel_reply(GILBERT, GILBERT_LINKS)
        self.assertEqual((info["username"], info["followers"], info["likes"], info["videos_count"]), ("gilbert4mwp2905", 0, 4, 2))
        first, second = info["videos"]
        self.assertTrue(first["shadowban"] and first["duplicate"])
        self.assertEqual(first["video_url"], GILBERT_LINKS[0])
        self.assertEqual(first["original_url"], GILBERT_LINKS[1])     # link ngay sau video bị trùng
        self.assertEqual((first["views"], first["likes"], first["comments"]), (1, 0, 0))
        self.assertIs(second["shadowban"], False)
        self.assertIs(second["duplicate"], False)
        self.assertEqual(second["video_url"], GILBERT_LINKS[2])
        self.assertEqual(second["views"], 422)

    def test_channel_check_matches_tasks_backfills_links_and_notifies_once(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        db = Path(tmp.name) / "ch.db"
        conn = sqlite3.connect(db)
        conn.execute("CREATE TABLE channels(id INTEGER PRIMARY KEY, username TEXT)")
        conn.executemany("INSERT INTO channels VALUES(?,?)", [(130, "gilbert4mwp2905"), (129, "donald.william.qae.2")])
        conn.execute("CREATE TABLE upload_tasks(id INTEGER PRIMARY KEY, channel_id INT, status TEXT, result_url TEXT, uploaded_at INT, "
                     "started_at INT DEFAULT 0, published_video_id TEXT DEFAULT '', video_slug TEXT DEFAULT '', caption TEXT DEFAULT '')")
        old = int(time.time()) - 7200
        conn.executemany("INSERT INTO upload_tasks(id,channel_id,status,result_url,uploaded_at,published_video_id,video_slug,caption) VALUES(?,?,?,?,?,?,?,?)", [
            (62, 130, "SUCCESS", "https://www.tiktok.com/tiktokstudio/content", old, "", "tierlist-extreme-wildlife-02",
             "Too fast for muscle? Pure muscle contraction cannot accelerate fast enough to vaporize surrounding water."),
            (61, 129, "SUCCESS", "https://www.tiktok.com/tiktokstudio/content", old - 420, "7689542029377883414", "wildlife-extreme-wildlife-01", "Hotter than the sun?"),
        ])
        conn.commit(); conn.close()
        asked = []
        def asker(username):
            asked.append(username)
            return {"text": GILBERT, "links": GILBERT_LINKS} if username == "gilbert4mwp2905" else {"text": "👤 Username: x", "links": []}
        with mock.patch.object(bot, "_notify") as notified, mock.patch.object(bot, "CHECK_SPACING_SECONDS", 0):
            results = bot.run_channels_once(db, asker=asker)
            self.assertEqual(sorted(asked), ["donald.william.qae.2", "gilbert4mwp2905"])
            self.assertEqual(bot.run_channels_once(db, asker=asker), [])         # vừa kiểm → chưa tới hạn
        self.assertEqual(next(r for r in results if r["channel_id"] == 130)["flagged"], 1)
        notified.assert_called_once()
        self.assertIn("@donald.william.qae.2", notified.call_args[0][0])        # video gốc là bài của chính mình
        conn = sqlite3.connect(db)
        self.assertEqual(conn.execute("SELECT published_video_id, result_url FROM upload_tasks WHERE id=62").fetchone(),
                         ("7689543849525628163", GILBERT_LINKS[0]))            # điền link cho bài cũ
        self.assertEqual(conn.execute("SELECT shadowban, duplicate, original_task_id FROM video_checks WHERE task_id=62").fetchone(), (1, 1, 61))
        self.assertIsNone(conn.execute("SELECT task_id FROM channel_video_checks WHERE video_id='7684706032186084630'").fetchone()[0])  # video không phải của mình
