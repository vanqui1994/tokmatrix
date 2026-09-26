"""Khoá, cookie và sao lưu Chrome profile theo kênh (bkt_web/profile_session.py).

Chỉ dùng SQLite + thư mục tạm, Playwright giả. Không mở Chrome thật.
"""
import asyncio
import json
import os
import sqlite3
from contextlib import closing
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from bkt_web import profile_session as ps


class FakeStore:
    def encrypt(self, value):
        return "enc:" + value

    def decrypt(self, value):
        return value[4:] if value and value.startswith("enc:") else value

    def fingerprint(self, value):
        return "fp:" + value


class FakeContext:
    def __init__(self, cookies=None):
        self.added = []
        self._cookies = cookies or []

    async def add_cookies(self, cookies):
        self.added.extend(cookies)

    async def cookies(self):
        return list(self._cookies)


class FakeChromium:
    def __init__(self, context):
        self.context = context
        self.kwargs = None

    async def launch_persistent_context(self, user_data_dir, **kwargs):
        self.kwargs = kwargs
        return self.context


class FakePlaywright:
    def __init__(self, context):
        self.chromium = FakeChromium(context)


class ProfileSessionBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.db = root / "test.db"
        self.p_dir = root / "profiles" / "channel_1"
        (self.p_dir / "Default" / "Cache").mkdir(parents=True)
        (self.p_dir / "Default" / "Cache" / "blob").write_bytes(b"x" * 2048)
        (self.p_dir / "Default" / "Cookies").write_text("cookie-db")
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.executescript("""
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE channels (id INTEGER PRIMARY KEY, cookie TEXT, cookie_hash TEXT UNIQUE,
                    country TEXT, vpn_location TEXT, profile_dir TEXT,
                    session_state TEXT DEFAULT '', session_checked_at INTEGER DEFAULT 0);
                CREATE TABLE channel_session_events (id INTEGER PRIMARY KEY AUTOINCREMENT,
                    channel_id INTEGER, state TEXT, source TEXT, created_at INTEGER);
            """)
            conn.execute("INSERT INTO channels (id, cookie, cookie_hash, country, vpn_location, profile_dir) "
                         "VALUES (1, 'enc:sessionid=old', 'fp:sessionid=old', 'DE', 'Berlin', ?)", (str(self.p_dir),))
            conn.execute("INSERT INTO channels (id, cookie, cookie_hash, country, profile_dir) "
                         "VALUES (2, 'enc:sessionid=taken', 'fp:sessionid=taken', 'DE', '')")
        patches = [
            mock.patch.object(ps, "DB_PATH", self.db),
            mock.patch.object(ps, "BACKUP_DIR", root / "backups"),
            mock.patch.object(ps, "SECRET_STORE", FakeStore()),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self._tmp.cleanup()

    def write_meta(self, **meta):
        (self.p_dir / "profile_meta.json").write_text(json.dumps(meta))


class LockTests(ProfileSessionBase):
    def test_nested_acquire_same_channel_is_busy(self):
        with ps.acquire(1, "a"):
            with self.assertRaises(ps.ProfileBusy) as ctx:
                with ps.acquire(1, "b"):
                    pass
            self.assertEqual(ctx.exception.reason, "in_process")
        with ps.acquire(1, "c"):  # đã nhả khoá
            self.assertIn(1, ps.busy_channels())
        self.assertNotIn(1, ps.busy_channels())

    def test_external_chrome_is_reported_and_never_killed(self):
        os.symlink("host-4242", self.p_dir / "SingletonLock")
        cmd = f"/usr/bin/google-chrome --user-data-dir={self.p_dir}"
        with mock.patch.object(ps.os, "kill") as kill, mock.patch.object(ps, "_chrome_cmdline", return_value=cmd):
            with self.assertRaises(ps.ProfileBusy) as ctx:
                with ps.acquire(1, "publish"):
                    pass
        self.assertEqual((ctx.exception.reason, ctx.exception.pid), ("external_chrome", 4242))
        # Chỉ được thăm dò bằng tín hiệu 0, tuyệt đối không SIGTERM/SIGKILL.
        self.assertEqual([c.args for c in kill.call_args_list], [(4242, 0)])

    def test_dead_pid_lock_is_cleaned(self):
        os.symlink("host-999999", self.p_dir / "SingletonLock")
        with mock.patch.object(ps.os, "kill", side_effect=ProcessLookupError):
            with ps.acquire(1, "publish"):
                pass
        self.assertFalse((self.p_dir / "SingletonLock").is_symlink())


class OpenContextTests(ProfileSessionBase):
    def run_open(self, **kwargs):
        ctx = FakeContext()
        pw = FakePlaywright(ctx)
        with mock.patch.object(ps, "_locale_for", return_value="de-DE"):
            asyncio.run(ps.open_context(pw, 1, "1080", False, **kwargs))
        return ctx, pw

    def test_db_cookie_changed_is_injected(self):
        self.write_meta(timezone="Europe/Berlin", cookie_synced_hash="fp:sessionid=older")
        ctx, pw = self.run_open()
        self.assertTrue(ctx.added)
        self.assertEqual(pw.chromium.kwargs["locale"], "de-DE")
        self.assertEqual(pw.chromium.kwargs["proxy"], {"server": "socks5://127.0.0.1:1080"})

    def test_db_cookie_unchanged_trusts_profile(self):
        self.write_meta(timezone="Europe/Berlin", cookie_synced_hash="fp:sessionid=old")
        ctx, _ = self.run_open()
        self.assertEqual(ctx.added, [])

    def test_save_session_mode_never_injects(self):
        self.write_meta(timezone="Europe/Berlin")  # chưa từng đồng bộ
        ctx, _ = self.run_open(inject_db_cookie=False)
        self.assertEqual(ctx.added, [])

    def test_missing_profile_dir(self):
        with self.assertRaises(ps.ProfileMissing):
            asyncio.run(ps.open_context(FakePlaywright(FakeContext()), 2))


class WriteBackTests(ProfileSessionBase):
    def row(self, cid=1):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            return conn.execute("SELECT cookie, cookie_hash FROM channels WHERE id=?", (cid,)).fetchone()

    def test_without_sessionid_nothing_written(self):
        ctx = FakeContext([{"name": "ttwid", "value": "x", "domain": ".tiktok.com"}])
        self.assertFalse(asyncio.run(ps.write_back(1, ctx)))
        self.assertEqual(self.row(), ("enc:sessionid=old", "fp:sessionid=old"))

    def test_new_cookie_encrypted_and_meta_updated(self):
        self.write_meta(timezone="Europe/Berlin")
        ctx = FakeContext([
            {"name": "sessionid", "value": "new", "domain": ".tiktok.com"},
            {"name": "other", "value": "1", "domain": ".example.com"},
        ])
        self.assertTrue(asyncio.run(ps.write_back(1, ctx)))
        self.assertEqual(self.row(), ("enc:sessionid=new", "fp:sessionid=new"))
        meta = json.loads((self.p_dir / "profile_meta.json").read_text())
        self.assertEqual(meta["cookie_synced_hash"], "fp:sessionid=new")
        self.assertEqual(meta["timezone"], "Europe/Berlin")

    def test_cookie_owned_by_other_channel_is_not_written(self):
        ctx = FakeContext([{"name": "sessionid", "value": "taken", "domain": ".tiktok.com"}])
        self.assertFalse(asyncio.run(ps.write_back(1, ctx)))
        self.assertEqual(self.row(), ("enc:sessionid=old", "fp:sessionid=old"))


class SessionStateTests(ProfileSessionBase):
    def test_event_only_on_change(self):
        ps.mark_session(1, "OK", "publish")
        ps.mark_session(1, "OK", "scan")
        ps.mark_session(1, "LOGGED_OUT", "publish")
        with closing(sqlite3.connect(self.db)) as conn, conn:
            events = conn.execute("SELECT state, source FROM channel_session_events ORDER BY id").fetchall()
            state = conn.execute("SELECT session_state FROM channels WHERE id=1").fetchone()[0]
        self.assertEqual(events, [("OK", "publish"), ("LOGGED_OUT", "publish")])
        self.assertEqual(state, "LOGGED_OUT")


class BackupTests(ProfileSessionBase):
    def test_backup_once_skips_cache_and_force_overwrites(self):
        out = ps.backup_once(1, self.p_dir)
        with tarfile.open(out) as tf:
            names = tf.getnames()
        self.assertIn("Default/Cookies", names)
        self.assertFalse(any("Cache" in n for n in names))
        mtime = out.stat().st_mtime_ns
        (self.p_dir / "Default" / "Cookies").write_text("changed")
        ps.backup_once(1, self.p_dir)
        self.assertEqual(out.stat().st_mtime_ns, mtime)
        ps.backup_once(1, self.p_dir, force=True)
        with tarfile.open(out) as tf:
            self.assertEqual(tf.extractfile("Default/Cookies").read(), b"changed")

    def test_clean_caches_keeps_session_data(self):
        freed = ps.clean_caches(self.p_dir)
        self.assertEqual(freed, 2048)
        self.assertFalse((self.p_dir / "Default" / "Cache").exists())
        self.assertTrue((self.p_dir / "Default" / "Cookies").exists())

    def test_restore_keeps_previous_dir(self):
        ps.backup_once(1, self.p_dir)
        (self.p_dir / "Default" / "Cookies").write_text("broken")
        old = ps.restore_backup(1)
        self.assertEqual((old / "Default" / "Cookies").read_text(), "broken")
        self.assertEqual((self.p_dir / "Default" / "Cookies").read_text(), "cookie-db")


class FakeBrowser:
    def __init__(self, context):
        self.context = context
        self.ctx_kwargs = None
        self.closed = False

    async def new_context(self, **kwargs):
        self.ctx_kwargs = kwargs
        return self.context

    async def close(self):
        self.closed = True


class ScanContextTests(ProfileSessionBase):
    def test_profile_path_writes_back_and_closes(self):
        self.write_meta(timezone="Europe/Berlin", cookie_synced_hash="fp:sessionid=old")
        ctx = FakeContext([{"name": "sessionid", "value": "rotated", "domain": ".tiktok.com"}])
        ctx.close = mock.AsyncMock()

        async def run():
            with mock.patch.object(ps, "_locale_for", return_value="de-DE"):
                async with ps.scan_context(FakePlaywright(ctx), 1, "1080") as (context, mode):
                    self.assertEqual(mode, "profile")
                    self.assertIn(1, ps.busy_channels())
        asyncio.run(run())
        ctx.close.assert_awaited_once()
        self.assertNotIn(1, ps.busy_channels())
        with closing(sqlite3.connect(self.db)) as conn:
            self.assertEqual(conn.execute("SELECT cookie FROM channels WHERE id=1").fetchone()[0], "enc:sessionid=rotated")

    def test_profile_busy_propagates(self):
        async def run():
            with ps.acquire(1, "publish"):
                async with ps.scan_context(FakePlaywright(FakeContext()), 1, "1080"):
                    pass
        with self.assertRaises(ps.ProfileBusy):
            asyncio.run(run())

    def test_clean_path_keeps_legacy_settings(self):
        ctx = FakeContext()
        browser = FakeBrowser(ctx)
        launch = mock.AsyncMock(return_value=browser)
        pw = SimpleNamespace(chromium=SimpleNamespace(launch=launch))

        async def run():
            async with ps.scan_context(pw, 2, "1080", [{"name": "sessionid", "value": "x"}]) as (_, mode):
                self.assertEqual(mode, "clean")
        asyncio.run(run())
        self.assertTrue(launch.call_args.kwargs["headless"])
        self.assertEqual(browser.ctx_kwargs["user_agent"], ps.LEGACY_SCAN_USER_AGENT)
        self.assertEqual(browser.ctx_kwargs["proxy"], {"server": "socks5://127.0.0.1:1080"})
        self.assertEqual(ctx.added, [{"name": "sessionid", "value": "x"}])
        self.assertTrue(browser.closed)


class CacheWorkerTests(ProfileSessionBase):
    def setUp(self):
        super().setUp()
        from bkt_web import profile_workers
        self.pw = profile_workers
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute("CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INTEGER, status TEXT, schedule_time INTEGER)")

    def test_cleans_idle_profile_and_records_time(self):
        res = self.pw.clean_cache_batch(now=10_000_000, db_path=self.db)
        self.assertEqual(res, {"cleaned": [1], "freed_bytes": 2048})
        meta = json.loads((self.p_dir / "profile_meta.json").read_text())
        self.assertEqual(meta["cache_cleaned_at"], 10_000_000)
        # Vừa dọn → lượt sau trong vòng 7 ngày bỏ qua.
        self.assertEqual(self.pw.clean_cache_batch(now=10_000_100, db_path=self.db)["cleaned"], [])

    def test_skips_channel_with_post_nearby(self):
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute("INSERT INTO upload_tasks VALUES (1, 1, 'QUEUED', 10_000_600)")
        self.assertEqual(self.pw.clean_cache_batch(now=10_000_000, db_path=self.db)["cleaned"], [])

    def test_skips_busy_profile(self):
        with ps.acquire(1, "publish"):
            self.assertEqual(self.pw.clean_cache_batch(now=10_000_000, db_path=self.db)["cleaned"], [])
        self.assertTrue((self.p_dir / "Default" / "Cache").exists())


if __name__ == "__main__":
    unittest.main()
