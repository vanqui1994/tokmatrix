import datetime
import json
import sqlite3
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs

from bkt_web import notify

TOKEN = "123456789:AAFakeTokenFakeTokenFakeTokenFakeTok"


class FakeTelegram:
    """Bot API giả: ghi lại sendMessage; `queue` điều khiển các phản hồi kế tiếp."""

    def __init__(self):
        self.sent = []
        self.queue = []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode())
                params = {k: v[0] for k, v in body.items()}
                code, payload = fake.queue.pop(0) if fake.queue else (200, {"ok": True, "result": {}})
                if code == 200:
                    fake.sent.append(params)
                data = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def close(self):
        self.server.shutdown()


class NotifyTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.db = root / "bkt.db"
        self.matrix = root / "matrix.db"
        self.autopilot = root / "autopilot.db"
        conn = sqlite3.connect(self.db)
        conn.executescript(
            """
            CREATE TABLE channels (id INTEGER PRIMARY KEY, username TEXT);
            CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INTEGER, status TEXT, result_url TEXT DEFAULT '',
                error_message TEXT DEFAULT '', video_slug TEXT DEFAULT '', attempt_count INTEGER DEFAULT 0,
                schedule_time INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0, uploaded_at INTEGER DEFAULT 0,
                started_at INTEGER DEFAULT 0);
            INSERT INTO channels VALUES (1, 'kosmos11');
            """
        )
        conn.commit()
        conn.close()
        m = sqlite3.connect(self.matrix)
        m.executescript(
            """
            CREATE TABLE channels (channel_id TEXT PRIMARY KEY, channel_name TEXT, niche_id TEXT, resolved_config_json TEXT);
            CREATE TABLE topics (topic_id TEXT PRIMARY KEY, title TEXT);
            CREATE TABLE content_jobs (job_id TEXT PRIMARY KEY, channel_id TEXT, topic_id TEXT, engine_type TEXT,
                state TEXT, video_slug TEXT, error_message TEXT, manifest_json TEXT, updated_at INTEGER);
            INSERT INTO channels VALUES ('c1', 'Kosmos & Physik 11', 'science', '{"language":"de"}');
            INSERT INTO topics VALUES ('t1', 'Die Suwałki-Lücke <NATO>');
            """
        )
        m.commit()
        m.close()
        a = sqlite3.connect(self.autopilot)
        a.executescript("CREATE TABLE autopilot_config (key TEXT PRIMARY KEY, value TEXT);"
                        "CREATE TABLE autopilot_plans (id INTEGER PRIMARY KEY, status TEXT);")
        a.commit()
        a.close()
        self.tg = FakeTelegram()
        patches = [
            mock.patch.object(notify, "DB_PATH", self.db),
            mock.patch.object(notify, "MATRIX_DB", self.matrix),
            mock.patch.object(notify, "AUTOPILOT_DB", self.autopilot),
            mock.patch.object(notify, "API_BASE", self.tg.url),
            mock.patch.object(notify.key_vault, "get_key", lambda name: TOKEN),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tg.close)
        self.addCleanup(self.tmp.cleanup)
        with self.conn() as c:
            notify._set_setting(c, notify.SETTING_CHATS, "111")

    def conn(self):
        return notify._conn()

    def flush(self):
        return notify.flush_once(sleep=lambda _s: None)

    def matrix_exec(self, sql, *params):
        m = sqlite3.connect(self.matrix)
        m.execute(sql, params)
        m.commit()
        m.close()

    def outbox(self):
        c = sqlite3.connect(self.db)
        try:
            return c.execute("SELECT event, severity, status, text FROM notify_outbox ORDER BY id").fetchall()
        finally:
            c.close()


class FormatTests(unittest.TestCase):
    def test_sanitize_hides_tokens_and_cookies(self):
        text = notify.sanitize(f"lỗi {TOKEN} sessionid=abc123; password: hunter2")
        self.assertNotIn("AAFake", text)
        self.assertNotIn("abc123", text)
        self.assertNotIn("hunter2", text)

    def test_truncate_keeps_html_balanced(self):
        text = "<b>" + "x" * 5000 + "</b>"
        out = notify.truncate(text)
        self.assertLessEqual(len(out), notify.MAX_LEN)
        self.assertEqual(out.count("<b>"), out.count("</b>"))

    def test_truncate_does_not_cut_entities(self):
        out = notify.truncate("&amp;" * 2000)
        self.assertNotRegex(out.split("\n")[0], r"&[a-z]*$")

    def test_quiet_hours(self):
        at = lambda h: datetime.datetime(2026, 9, 25, h)
        self.assertTrue(notify.in_quiet_hours("0-7", at(3)))
        self.assertFalse(notify.in_quiet_hours("0-7", at(7)))
        self.assertTrue(notify.in_quiet_hours("22-6", at(23)))
        self.assertTrue(notify.in_quiet_hours("22-6", at(5)))
        self.assertFalse(notify.in_quiet_hours("", at(3)))


class OutboxTests(NotifyTestBase):
    def test_emit_and_send_html_silent_info(self):
        notify.emit("x", "<b>hi</b>", "info")
        self.assertEqual(self.flush(), 1)
        self.assertEqual(self.tg.sent[0]["chat_id"], "111")
        self.assertEqual(self.tg.sent[0]["parse_mode"], "HTML")
        self.assertEqual(self.tg.sent[0]["disable_notification"], "true")
        notify.emit("x", "warn", "warn")
        self.flush()
        self.assertEqual(self.tg.sent[1]["disable_notification"], "false")

    def test_dedupe_cooldown_allows_escalation(self):
        self.assertTrue(notify.emit("disk", "a", "warn", "disk"))
        self.assertFalse(notify.emit("disk", "b", "warn", "disk"))
        self.assertTrue(notify.emit("disk", "c", "critical", "disk"))
        self.assertFalse(notify.emit("disk", "d", "warn", "disk"))
        self.assertTrue(notify.emit("job", "e", "info", "job:1", cooldown=None))
        self.assertFalse(notify.emit("job", "e", "info", "job:1", cooldown=None))

    def test_groups_more_than_five(self):
        for i in range(7):
            notify.emit("render_done", f"🎬 <b>Video xong</b> · kênh {i} · <i>{'kinetic' if i % 2 else 'vox'}</i> · x")
        notify.emit("other", "single")
        self.assertEqual(self.flush(), 2)
        self.assertIn("7 × ", self.tg.sent[0]["text"])
        self.assertIn("kinetic 3", self.tg.sent[0]["text"])
        self.assertIn("vox 4", self.tg.sent[0]["text"])
        self.assertTrue(all(r[2] == "sent" for r in self.outbox()))

    def test_429_retry_after_keeps_pending(self):
        self.tg.queue.append((429, {"ok": False, "description": "Too Many Requests", "parameters": {"retry_after": 30}}))
        notify.emit("x", "hello")
        self.assertEqual(self.flush(), 0)
        c = sqlite3.connect(self.db)
        status, next_at, err = c.execute("SELECT status, next_attempt_at, error FROM notify_outbox").fetchone()
        c.close()
        self.assertEqual(status, "pending")
        self.assertGreaterEqual(next_at, time.time() + 29)
        self.assertIn("429", err)

    def test_permanent_error_marks_failed_and_continues(self):
        self.tg.queue.append((400, {"ok": False, "description": "Bad Request: chat not found"}))
        notify.emit("x", "one")
        notify.emit("y", "two")
        self.assertEqual(self.flush(), 1)
        self.assertEqual([r[2] for r in self.outbox()], ["failed", "sent"])

    def test_quiet_hours_only_critical(self):
        with self.conn() as c:
            notify._set_setting(c, notify.SETTING_QUIET, "0-24")
        notify.emit("x", "info")
        notify.emit("y", "boom", "critical")
        with mock.patch.object(notify, "in_quiet_hours", return_value=True):
            self.assertEqual(self.flush(), 1)
        self.assertEqual(self.tg.sent[0]["text"], "boom")
        with mock.patch.object(notify, "in_quiet_hours", return_value=False):
            self.flush()
        self.assertEqual(self.tg.sent[1]["text"], "info")

    def test_no_chat_means_nothing_sent(self):
        with self.conn() as c:
            notify._set_setting(c, notify.SETTING_CHATS, "")
        notify.emit("x", "hello")
        with mock.patch.dict("os.environ", {"TOKMATRIX_TELEGRAM_CHAT_ID": ""}):
            self.assertEqual(self.flush(), 0)
        self.assertEqual(self.outbox()[0][2], "pending")


class WatcherTests(NotifyTestBase):
    def test_first_run_does_not_flood_history(self):
        self.matrix_exec("INSERT INTO content_jobs VALUES ('j0','c1','t1','science','READY_TO_PUBLISH','old','',"
                         "'{}',?)", int(time.time()) - 3600)
        c = self.conn()
        try:
            self.assertEqual(notify.check_jobs(c), 0)
            self.matrix_exec("INSERT INTO content_jobs VALUES ('j1','c1','t1','science','READY_TO_PUBLISH','slug-1','',"
                             "'{\"duration\": 58.4}',?)", int(time.time()) + 1)
            self.assertEqual(notify.check_jobs(c), 1)
            # cùng job sang SCHEDULED không báo lần hai
            self.matrix_exec("UPDATE content_jobs SET state='SCHEDULED', updated_at=? WHERE job_id='j1'", int(time.time()) + 2)
            self.assertEqual(notify.check_jobs(c), 0)
        finally:
            c.close()
        text = self.outbox()[0][3]
        self.assertIn("Kosmos &amp; Physik 11 · 🇩🇪 DE", text)
        self.assertIn("&lt;NATO&gt;", text)
        self.assertIn("58s", text)

    def test_dead_letter_is_warn(self):
        c = self.conn()
        try:
            notify.check_jobs(c)
            self.matrix_exec("INSERT INTO content_jobs VALUES ('j2','c1','t1','science','DEAD_LETTER','s2','render failed',"
                             "'{}',?)", int(time.time()) + 1)
            self.assertEqual(notify.check_jobs(c), 1)
        finally:
            c.close()
        self.assertEqual(self.outbox()[0][:2], ("job_dead", "warn"))

    def test_upload_events(self):
        now = int(time.time())
        c = self.conn()
        try:
            c.execute("INSERT INTO upload_tasks(id, channel_id, status, video_slug, created_at) VALUES (1, 1, 'SUCCESS', 'old', ?)", (now,))
            c.commit()
            self.assertEqual(notify.check_uploads(c), 0)  # lần đầu chỉ ghi nhận
            c.execute("INSERT INTO upload_tasks(id, channel_id, status, video_slug, result_url, created_at) "
                      "VALUES (2, 1, 'SUCCESS', 's', 'https://tiktok.com/@kosmos11/video/1', ?)", (now,))
            c.execute("INSERT INTO upload_tasks(id, channel_id, status, video_slug, error_message, attempt_count, created_at) "
                      "VALUES (3, 1, 'ERROR', 's', 'cookie chết', 3, ?)", (now,))
            c.commit()
            self.assertEqual(notify.check_uploads(c), 2)
            self.assertEqual(notify.check_uploads(c), 0)
            c.execute("UPDATE upload_tasks SET status='NEEDS_CHECK' WHERE id=2")
            c.commit()
            self.assertEqual(notify.check_uploads(c), 1)
        finally:
            c.close()
        events = [r[0] for r in self.outbox()]
        self.assertEqual(events, ["upload_success", "upload_error", "upload_needs_check"])
        self.assertIn("sau 3 lần", self.outbox()[1][3])

    def test_hold_and_release(self):
        c = self.conn()
        a = sqlite3.connect(self.autopilot)
        try:
            self.assertEqual(notify.check_hold(c), 0)
            a.execute("INSERT OR REPLACE INTO autopilot_config VALUES ('publish_hold_until', ?)", (str(int(time.time()) + 3600),))
            a.commit()
            self.assertEqual(notify.check_hold(c), 1)
            self.assertEqual(notify.check_hold(c), 0)
            a.execute("UPDATE autopilot_config SET value='0'")
            a.commit()
            self.assertEqual(notify.check_hold(c), 1)
        finally:
            a.close()
            c.close()
        self.assertIn("Bỏ giữ đăng", self.outbox()[1][3])

    def test_status_once_per_slot_and_overload(self):
        fake = {"load": 14.0, "cpus": 4, "mem_avail_gb": 1.0, "swap_used_gb": 3.4, "disk_free_gb": 70,
                "render_procs": 16}
        c = self.conn()
        try:
            with mock.patch.object(notify, "metrics", return_value=fake):
                at = datetime.datetime(2026, 9, 25, 8, 1)
                self.assertEqual(notify.check_metrics(c, at), 1)
                self.assertEqual(notify.check_metrics(c, at), 0)
            ov = notify._Overload()
            self.assertIsNone(ov.feed(fake, 0))
            self.assertIsNone(ov.feed(fake, 29 * 60))
            self.assertIn("Quá tải", ov.feed(fake, 30 * 60))
            ov.feed(dict(fake, load=1.0, swap_used_gb=0.0), 31 * 60)
            self.assertIsNone(ov.feed(fake, 32 * 60))
        finally:
            c.close()
        self.assertIn("VPS", self.outbox()[0][3])


if __name__ == "__main__":
    unittest.main()
