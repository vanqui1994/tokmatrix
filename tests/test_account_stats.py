"""Thống kê tài khoản TikTok: /api/stats/accounts.

Các bài kiểm tra ở đây khoá lại hai điểm dễ sai khi tổng hợp số liệu kênh:
tiền tệ không được cộng gộp, và một ngày quét nhiều lần không được nhân đôi
số follower trong chuỗi tăng trưởng.
"""

import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from bkt_web import paths, server
from bkt_web.routes import stats_routes


def seed_database(db_path: Path) -> None:
    with patch.object(server, "DB_PATH", db_path):
        server.init_db()

    conn = sqlite3.connect(db_path)
    now = int(time.time())
    conn.executemany(
        """INSERT INTO channels
           (cookie, note, status, earned, balance, currency, rpm, country, kyc,
            username, last_checked, video_count, follower_count, like_count, view_count,
            vpn_config, profile_dir, publisher)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            ("ck1", "kênh EUR", "BKT", 10.5, 4.0, "EUR", 0.6, "DE", "Yes",
             "acc_de", now, 12, 1000, 500, 20000, "de.conf", "/p/1", "pub1"),
            ("ck2", "kênh GBP", "CHƯA BKT", 7.0, 2.0, "GBP", 0.4, "GB", "No",
             "acc_gb", now, 3, 250, 90, 4000, "gb.conf", "", "pub2"),
            ("ck3", "kênh chết", "DIE", 0.0, 0.0, "#", 0.0, "GB", "No",
             "acc_dead", 0, 0, 0, 0, 0, "", "", ""),
        ],
    )
    conn.execute(
        """INSERT INTO channel_videos
           (channel_id, video_id, desc, view_count, like_count, comment_count,
            share_count, is_original, is_prohibited, shadowban_status, video_url)
           VALUES (1, 'v1', 'video một', 900, 30, 4, 2, 1, 0, 'NORMAL', 'https://x/v1')"""
    )
    conn.execute(
        """INSERT INTO channel_videos
           (channel_id, video_id, desc, view_count, is_prohibited, shadowban_status)
           VALUES (2, 'v2', 'video hai', 10, 1, 'FLOP_0VIEW')"""
    )
    conn.commit()
    conn.close()


class AccountStatsTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Path(self._tmp.name) / "stats.db"
        seed_database(self.db)
        for target in (server, paths):  # route đọc paths.DB_PATH lúc gọi
            p = patch.object(target, "DB_PATH", self.db)
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self._tmp.cleanup)

    def add_metric(self, channel_id: int, ts: int, followers: int, views: int = 0):
        conn = sqlite3.connect(self.db)
        conn.execute(
            """INSERT INTO channel_metrics_history
               (channel_id, captured_at, captured_ts, status, earned, balance, currency,
                rpm, follower_count, view_count, like_count, video_count)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (channel_id, time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)), ts,
             "BKT", 0, 0, "EUR", 0, followers, views, 0, 0),
        )
        conn.commit()
        conn.close()

    def test_totals_and_audience(self):
        data = stats_routes.api_stats_accounts(30)["data"]
        totals = data["totals"]
        self.assertEqual(totals["channels"], 3)
        self.assertEqual(totals["monetized"], 1)       # "CHƯA BKT" không được tính là đã bật
        self.assertEqual(totals["dead"], 1)
        self.assertEqual(totals["never_checked"], 1)
        self.assertEqual(totals["kyc_done"], 1)
        self.assertEqual(totals["vpn_assigned"], 2)
        self.assertEqual(totals["with_profile"], 1)
        self.assertEqual(data["audience"]["followers"], 1250)
        self.assertEqual(data["audience"]["views"], 24000)

    def test_currencies_are_not_summed_together(self):
        money = {row["currency"]: row for row in stats_routes.api_stats_accounts(30)["data"]["money"]}
        self.assertEqual(set(money), {"EUR", "GBP", "#"})
        self.assertEqual(money["EUR"]["earned"], 10.5)
        self.assertEqual(money["GBP"]["earned"], 7.0)
        self.assertEqual(money["EUR"]["channels"], 1)

    def test_same_day_rescan_does_not_double_count(self):
        day = int(time.mktime(time.strptime("2026-09-20", "%Y-%m-%d")))
        self.add_metric(1, day + 3600, followers=100)
        self.add_metric(1, day + 7200, followers=140)   # quét lại cùng ngày
        self.add_metric(2, day + 7300, followers=60)

        # Ngày kế tiếp để có đủ hai điểm cho phần tăng trưởng.
        nxt = day + 86400
        self.add_metric(1, nxt + 3600, followers=180)
        self.add_metric(2, nxt + 3700, followers=70)

        days_back = max(1, int((time.time() - day) / 86400) + 2)
        data = stats_routes.api_stats_accounts(days_back)["data"]
        series = {p["day"]: p for p in data["series"]}
        self.assertEqual(series["2026-09-20"]["followers"], 200)   # 140 + 60, không phải 300
        self.assertEqual(series["2026-09-20"]["channels"], 2)
        self.assertEqual(data["growth"]["followers"], 50)          # 250 - 200

    def test_video_breakdown_and_stale_list(self):
        data = stats_routes.api_stats_accounts(30)["data"]
        videos = data["videos"]
        self.assertEqual(videos["total"], 2)
        self.assertEqual(videos["channels_with_videos"], 2)
        self.assertEqual(videos["prohibited"], 1)
        self.assertEqual(videos["top"][0]["video_id"], "v1")
        self.assertEqual(
            {row["shadowban"] for row in videos["by_shadowban"]},
            {"NORMAL", "FLOP_0VIEW"},
        )
        # Kênh chưa quét lần nào phải đứng đầu danh sách cần xử lý.
        self.assertEqual(data["stale"][0]["username"], "acc_dead")

    def test_days_parameter_is_clamped(self):
        self.assertEqual(stats_routes.api_stats_accounts(0)["data"]["days"], 1)
        self.assertEqual(stats_routes.api_stats_accounts(9999)["data"]["days"], 365)


if __name__ == "__main__":
    unittest.main()
