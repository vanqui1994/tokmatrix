import datetime
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

from bkt_web import autopilot
from bkt_web.autopilot import channels, safety, scheduler, store


def _write_meta(root: Path, slug: str, meta: dict) -> None:
    (root / slug).mkdir(parents=True)
    (root / slug / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


class ChannelLanguageConfigTest(unittest.TestCase):
    def test_german_account_gets_german_voice_and_version_bump(self):
        cfg = {"config_version": 2, "audio": {"voice_id": "vi-VN-NamMinhNeural"}, "publishing": {"language": "vi"}}
        self.assertTrue(autopilot.apply_language_to_channel_config(cfg, "de"))
        self.assertEqual(cfg["publishing"]["language"], "de")
        self.assertEqual(cfg["audio"]["voice_id"], "de-DE-ConradNeural")
        self.assertEqual(cfg["config_version"], 3)

    def test_female_voice_stays_female(self):
        cfg = {"audio": {"voice_id": "vi-VN-HoaiMyNeural"}, "publishing": {"language": "vi"}}
        autopilot.apply_language_to_channel_config(cfg, "en")
        self.assertEqual(cfg["audio"]["voice_id"], "en-US-AvaNeural")

    def test_matching_config_is_left_alone(self):
        cfg = {"config_version": 4, "audio": {"voice_id": "de-DE-KatjaNeural"}, "publishing": {"language": "de"}}
        self.assertFalse(autopilot.apply_language_to_channel_config(cfg, "de"))
        self.assertEqual(cfg["audio"]["voice_id"], "de-DE-KatjaNeural")
        self.assertEqual(cfg["config_version"], 4)

    def test_every_supported_language_has_both_voices(self):
        for language, voices in autopilot.LANGUAGE_VOICES.items():
            self.assertTrue(voices["male"].startswith(f"{language}-"))
            self.assertTrue(voices["female"].startswith(f"{language}-"))


class VideoLanguageGuardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.videos = Path(self.tmp.name)
        patches = [
            mock.patch.object(store, "VIDEOS_DIR", self.videos),
            mock.patch.object(channels, "account_language", return_value="de"),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.addCleanup(self.tmp.cleanup)

    def _job(self, voice, lines):
        return {"manifest": {"audio": {"voice_id": voice}, "scenes": [{"line": line} for line in lines]}}

    def test_blocks_vietnamese_script_tagged_as_german(self):
        # Đúng trường hợp đã gặp trên VPS: lang=de nhưng lời thoại tiếng Việt.
        _write_meta(self.videos, "science-space-01", {
            "name": "Vượt Qua Giới Hạn Tolman-Oppenheimer-Volkoff", "lang": "de",
            "scienceConfig": {"fullScriptHtml": "Vật chất biến mất đâu?"},
        })
        with mock.patch.object(safety.matrix_db, "get_job", return_value=self._job("de-DE-ConradNeural", ["Hallo"])):
            problem = autopilot.video_language_problem("science-space-01", 63, "job-1")
        self.assertIn("tiếng Việt", problem)

    def test_blocks_vietnamese_voice(self):
        _write_meta(self.videos, "v", {"name": "Schwarze Löcher", "lang": "de"})
        with mock.patch.object(safety.matrix_db, "get_job", return_value=self._job("vi-VN-NamMinhNeural", ["Hallo"])):
            problem = autopilot.video_language_problem("v", 63, "job-1")
        self.assertIn("vi-VN-NamMinhNeural", problem)

    def test_blocks_wrong_lang_tag(self):
        _write_meta(self.videos, "v", {"name": "Black holes", "lang": "en"})
        with mock.patch.object(safety.matrix_db, "get_job", return_value=None):
            problem = autopilot.video_language_problem("v", 63, "")
        self.assertIn("lang=en", problem)

    def test_allows_german_video_for_german_account(self):
        _write_meta(self.videos, "v", {
            "name": "Schwarze Löcher gegen Neutronensterne", "lang": "de",
            "scienceConfig": {"fullScriptHtml": "Wohin verschwindet die Materie? Größer als die Sonne."},
        })
        job = self._job("de-DE-ConradNeural", ["Wohin verschwindet die Materie?"])
        with mock.patch.object(safety.matrix_db, "get_job", return_value=job):
            self.assertIsNone(autopilot.video_language_problem("v", 63, "job-1"))

    def test_french_accents_are_not_mistaken_for_vietnamese(self):
        _write_meta(self.videos, "v", {"name": "La fête côté étoiles", "lang": "fr"})
        job = self._job("fr-FR-HenriNeural", ["Même la bête a peur."])
        with mock.patch.object(channels, "account_language", return_value="fr"), \
                mock.patch.object(safety.matrix_db, "get_job", return_value=job):
            self.assertIsNone(autopilot.video_language_problem("v", 63, "job-1"))

    def test_account_without_country_is_blocked(self):
        _write_meta(self.videos, "v", {"name": "x", "lang": "de"})
        with mock.patch.object(channels, "account_language", return_value=""):
            self.assertIn("country", autopilot.video_language_problem("v", 63, ""))


class ScheduleTimeTest(unittest.TestCase):
    """Giờ đăng theo giờ địa phương của acc, không phụ thuộc múi giờ VPS."""

    CONFIG = {"posting_hours": "[8,9,10,12]", "gap_between_posts_minutes": "60", "videos_per_day_per_channel": "1",
              "slot_jitter_minutes": "0", "spread_posting_hours": "false"}

    def setUp(self):
        import sqlite3
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "channels.db"
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, country TEXT)")
        conn.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INTEGER, schedule_time INTEGER, status TEXT)")
        conn.executemany("INSERT INTO channels VALUES (?, ?)", [(63, "DE"), (64, "GB"), (65, "KR")])
        conn.commit()
        conn.close()
        for patch in (
            mock.patch.object(store, "channels_db", side_effect=lambda: sqlite3.connect(self.db)),
            mock.patch.object(store, "get_config", side_effect=lambda key, default="": self.CONFIG.get(key, default)),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    @staticmethod
    def _utc(text):
        return datetime.datetime.fromisoformat(text).replace(tzinfo=datetime.timezone.utc).timestamp()

    def _local(self, ts, zone):
        return datetime.datetime.fromtimestamp(ts, ZoneInfo(zone)).strftime("%Y-%m-%d %H:%M")

    def test_german_summer_and_winter_time_both_post_at_8_local(self):
        summer = scheduler.next_slot(63, now=self._utc("2026-09-24 12:00"))
        self.assertEqual(self._local(summer, "Europe/Berlin"), "2026-09-25 08:00")
        self.assertEqual(datetime.datetime.fromtimestamp(summer, datetime.timezone.utc).hour, 6)  # CEST +2
        winter = scheduler.next_slot(63, now=self._utc("2026-11-10 12:00"))
        self.assertEqual(self._local(winter, "Europe/Berlin"), "2026-11-11 08:00")
        self.assertEqual(datetime.datetime.fromtimestamp(winter, datetime.timezone.utc).hour, 7)  # CET +1

    def test_result_does_not_depend_on_server_timezone(self):
        import os
        import time as _time
        now = self._utc("2026-09-24 12:00")
        results = []
        old = os.environ.get("TZ")
        try:
            for zone in ("Asia/Ho_Chi_Minh", "Europe/Berlin", "UTC"):
                os.environ["TZ"] = zone
                _time.tzset()
                results.append(scheduler.next_slot(63, now=now))
        finally:
            if old is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = old
            _time.tzset()
        self.assertEqual(len(set(results)), 1)

    def test_today_slot_used_when_still_ahead(self):
        # 05:00 giờ Seoul → 08:00 hôm nay vẫn còn
        ts = scheduler.next_slot(65, now=self._utc("2026-09-23 20:00"))
        self.assertEqual(self._local(ts, "Asia/Seoul"), "2026-09-24 08:00")

    def test_full_day_moves_to_next_day_and_never_returns_zero(self):
        import sqlite3
        first = scheduler.next_slot(64, now=self._utc("2026-09-24 12:00"))
        conn = sqlite3.connect(self.db)
        conn.execute("INSERT INTO upload_tasks (channel_id, schedule_time, status) VALUES (64, ?, 'QUEUED')", (first,))
        conn.commit()
        conn.close()
        second = scheduler.next_slot(64, now=self._utc("2026-09-24 12:00"))
        self.assertEqual(self._local(first, "Europe/London"), "2026-09-25 08:00")
        self.assertEqual(self._local(second, "Europe/London"), "2026-09-26 08:00")

    def test_fully_booked_week_returns_none(self):
        import sqlite3
        now = self._utc("2026-09-24 12:00")
        conn = sqlite3.connect(self.db)
        for day in range(8):
            conn.execute("INSERT INTO upload_tasks (channel_id, schedule_time, status) VALUES (63, ?, 'QUEUED')",
                         (int(now) + day * 86400,))
        conn.commit()
        conn.close()
        self.assertIsNone(scheduler.next_slot(63, now=now))


if __name__ == "__main__":
    unittest.main()
