"""Kuaishou → vector: quét, chọn theo hạn mức, tải, source_remake dựng, vào hàng đợi đăng một lần, thử lại khi lỗi."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bkt_web import kuaishou_vector as kv

T = 1_800_000_000


class KuaishouVectorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.chdb = self.tmp / "ch.db"
        with sqlite3.connect(self.chdb) as c:
            c.execute("CREATE TABLE upload_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INT, video_path TEXT, caption TEXT, "
                      "hashtags TEXT, schedule_time INT, status TEXT, created_at INT, ai_generated INT, run_id TEXT)")
        self.jobs = {}
        out = self.tmp / "vector.mp4"
        out.write_bytes(b"mp4")
        self.out = out

        def create(src, channel, title="", source_url=""):
            jid = f"job{len(self.jobs)}"
            self.jobs[jid] = {"id": jid, "status": "queued", "channel": channel}
            return self.jobs[jid]

        def download(v, work):
            p = work / "source.mp4"; p.write_bytes(b"src"); return p

        for p in (patch.object(kv, "DB", self.tmp / "kv.db"), patch.object(kv, "BASE", self.tmp / "kv"),
                  patch.object(kv, "CHANNELS_DB", self.chdb),
                  patch.object(kv.multi_downloader, "kuaishou_profile_url", lambda u: u),
                  patch.object(kv.multi_downloader, "kuaishou_profile", lambda u, n: [
                      {"id": f"k{i}", "url": f"https://www.kuaishou.com/short-video/k{i}", "title": "", "posted": 100 - i} for i in range(5)]),
                  patch.object(kv.muse_remake, "_account_names", lambda: {7: "acc_ko", 8: "acc_ja"}),
                  patch.object(kv.muse_remake, "sources", lambda: [{"profile_url": "https://www.kuaishou.com/profile/muse", "channel_id": 9}]),
                  patch.object(kv.muse_remake, "_download", download),
                  patch.object(kv.source_remake, "_channel", lambda cid: {"id": cid, "niche": "ocean_mysteries", "language": "ko"}),
                  patch.object(kv.source_remake, "create", create),
                  patch.object(kv.source_remake, "load", lambda jid: self.jobs[jid]),
                  patch.object(kv.source_remake, "retry", lambda jid, rerender_only=True: self.jobs[jid].update(status="queued")),
                  patch("bkt_web.autopilot.scheduler.next_slot", lambda a: T + 3600)):
            p.start()

    def tearDown(self):
        patch.stopall()

    def tasks(self):
        with sqlite3.connect(self.chdb) as c:
            return c.execute("SELECT channel_id, status, run_id, schedule_time FROM upload_tasks").fetchall()

    def test_one_profile_one_account_across_both_kuaishou_lines(self):
        kv.add_source("https://www.kuaishou.com/profile/a", 7, 2, "ocean_mysteries_11")
        for url, acc in (("https://www.kuaishou.com/profile/a", 8), ("https://www.kuaishou.com/profile/b", 7),
                         ("https://www.kuaishou.com/profile/muse", 8)):
            with self.assertRaises(ValueError):
                kv.add_source(url, acc, 2, "ocean_mysteries_03")
        with self.assertRaises(ValueError):  # tài khoản không có kênh Matrix
            with patch.object(kv, "matrix_channel_for", lambda a: ""):
                kv.add_source("https://www.kuaishou.com/profile/c", 8, 2)

    def test_videos_flow_to_the_upload_queue_once_within_the_daily_quota(self):
        kv.add_source("https://www.kuaishou.com/profile/a", 7, 2, "ocean_mysteries_11")
        kv.tick(T)
        with kv._conn() as c:
            st = dict(c.execute("SELECT ks_id, status FROM videos").fetchall())
        self.assertEqual(sorted(k for k, s in st.items() if s == "making"), ["k0", "k1"])  # 2/ngày, mới nhất trước
        self.assertEqual(sum(s == "available" for s in st.values()), 3)
        for j in self.jobs.values():
            j.update(status="done", output=str(self.out), title="바다의 비밀")
        kv.tick(T + 60)
        kv.tick(T + 120)
        self.assertEqual(sorted(self.tasks()), [(7, "QUEUED", "kuaishou_vector:1", T + 3600), (7, "QUEUED", "kuaishou_vector:2", T + 3600)])
        kv.tick(T + 3600)  # chưa hết 24 h: không lấy thêm video
        self.assertEqual(len(self.jobs), 2)

    def test_errors_retry_after_an_hour_up_to_three_times(self):
        kv.add_source("https://www.kuaishou.com/profile/a", 7, 1, "ocean_mysteries_11")
        kv.tick(T)
        self.jobs["job0"]["status"] = "error"; self.jobs["job0"]["error"] = "Gemini 429"
        kv.tick(T + 60)
        with kv._conn() as c:
            self.assertEqual(c.execute("SELECT status, attempts FROM videos WHERE job_id='job0'").fetchone()[:], ("error", 1))
        kv.tick(T + 60 + kv.RETRY_AFTER + 1)
        with kv._conn() as c:
            self.assertEqual(c.execute("SELECT status FROM videos WHERE job_id='job0'").fetchone()[0], "making")


if __name__ == "__main__":
    unittest.main()
