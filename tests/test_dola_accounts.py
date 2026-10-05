"""Pool tài khoản Dola: chuyển tài khoản khi hết lượt, hạn mức 2/ngày, reset 00:00, giữ chỗ khi chạy song song."""

import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import dola_accounts as da
from bkt_web import dola_routes as dr
from bkt_web import dola_video as dv

TOKYO = ZoneInfo("Asia/Tokyo")
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"0" * 64


def ts(y, m, d, hh=12, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=TOKYO).timestamp()


class MultiGateway:
    """Nhiều gateway giả, phân biệt theo host. `quota[host]` = số lần POST tiếp theo trả 429."""

    def __init__(self):
        self.posts = []          # (host, authorization)
        self.polls = []
        self.quota = {}
        self.errors = {}         # host → Response/Exception trả cho POST tiếp theo

    def __call__(self, req: httpx.Request):
        host = req.url.host
        if req.method == "POST":
            self.posts.append((host, req.headers.get("authorization")))
            if host in self.errors:
                err = self.errors.pop(host)
                if isinstance(err, Exception):
                    raise err
                return err
            if self.quota.get(host, 0) > 0:
                self.quota[host] -= 1
                return httpx.Response(429, json={"detail": "Insufficient credits: All accounts lack points, waiting for refresh"})
            return httpx.Response(200, json={"id": f"video_{host}_{len(self.posts)}", "status": "queued"})
        if req.url.path.endswith(".mp4"):
            return httpx.Response(200, content=MP4)
        if req.url.path == "/health":
            return httpx.Response(200, json={"ok": True, "available": True, "pending_tasks": 0, "accounts": []})
        self.polls.append((host, req.headers.get("authorization")))
        tid = req.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json={"id": tid, "status": "completed",
                                         "video_url": f"http://{host}/videos/{tid}.mp4"})


class AccountPoolTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "db.sqlite"
        self.clock = [ts(2026, 10, 4, 15)]
        self.gw = MultiGateway()
        self.kw = dict(poll_interval=0, transport=httpx.MockTransport(self.gw), sleep=lambda s: None)
        self.accounts = [
            da.DolaAccountConfig(id="acc_01", base_url="http://gw1", api_key="k1"),
            da.DolaAccountConfig(id="acc_02", base_url="http://gw2", api_key="k2"),
        ]
        self.mgr = da.DolaAccountManager(self.db, self.accounts, tz="Asia/Tokyo", now_fn=lambda: self.clock[0])

    def tearDown(self):
        self.tmp.cleanup()

    def gen(self):
        return self.mgr.generate_video_and_wait({"prompt": "fox"}, client_kw=self.kw)

    def by_id(self):
        return {s.id: s for s in self.mgr.status()}

    # --- Kịch bản demo: acc_01 hết quota → tự chuyển sang acc_02 ---
    def test_demo_quota_on_acc1_switches_to_acc2(self):
        self.gw.quota["gw1"] = 1
        account_id, task = self.gen()
        self.assertEqual(account_id, "acc_02")
        self.assertEqual(task.status, "completed")
        self.assertEqual(self.gw.posts, [("gw1", "Bearer k1"), ("gw2", "Bearer k2")])
        self.assertEqual(self.gw.polls[0], ("gw2", "Bearer k2"))      # poll đúng gateway/key đã nhận task
        st = self.by_id()
        self.assertTrue(st["acc_01"].is_blocked)
        self.assertIn("Insufficient credits", st["acc_01"].block_reason)
        self.assertEqual(st["acc_01"].blocked_until, ts(2026, 10, 5, 0))
        self.assertEqual(st["acc_02"].used_today, 1)

    def test_two_per_day_then_next_account_then_exhausted(self):
        used = [self.gen()[0] for _ in range(4)]
        self.assertEqual(sorted(used), ["acc_01", "acc_01", "acc_02", "acc_02"])
        self.assertEqual(used[:2], ["acc_01", "acc_02"])                # xoay vòng, không dồn một mục
        st = self.by_id()
        self.assertEqual((st["acc_01"].used_today, st["acc_01"].remaining), (2, 0))
        self.assertTrue(st["acc_01"].is_blocked)
        with self.assertRaises(da.AllAccountsExhausted) as ctx:
            self.gen()
        self.assertEqual(ctx.exception.reset_at, ts(2026, 10, 5, 0))
        self.assertIn("acc_01: 2/2", str(ctx.exception))
        self.assertEqual(len(self.gw.posts), 4)                         # hết lượt thì không gọi gateway nữa

    def test_midnight_reset_in_configured_timezone(self):
        for _ in range(4):
            self.gen()
        self.clock[0] = ts(2026, 10, 4, 23, 59)
        self.assertRaises(da.AllAccountsExhausted, self.mgr.get_available_account)
        self.clock[0] = ts(2026, 10, 5, 0, 0) + 1
        st = self.by_id()
        self.assertEqual([st[a].used_today for a in st], [0, 0])
        self.assertFalse(any(s.is_blocked for s in st.values()))
        self.assertEqual(self.gen()[0], "acc_01")
        # 00:00 Tokyo là 15:00 UTC: giờ Việt Nam 22:00 đã sang ngày mới theo Tokyo.
        self.assertEqual(self.mgr.day(datetime(2026, 10, 5, 22, 0, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")).timestamp()),
                         "2026-10-06")

    def test_unavailable_and_wrong_key_switch(self):
        self.gw.errors["gw1"] = httpx.Response(503, json={"detail": "no account in pool"})
        self.assertEqual(self.gen()[0], "acc_02")
        st = self.by_id()["acc_01"]
        self.assertEqual(st.blocked_until, self.clock[0] + da.SHORT_COOLDOWN)   # chỉ nghỉ ngắn
        self.clock[0] += da.SHORT_COOLDOWN + 1
        self.gw.errors["gw1"] = httpx.Response(401, json={"detail": "invalid api key"})
        self.assertEqual(self.gen()[0], "acc_02")
        self.assertIn("Sai API key", self.by_id()["acc_01"].block_reason)

    def test_read_timeout_does_not_switch(self):
        self.gw.errors["gw1"] = httpx.ReadTimeout("slow")
        with self.assertRaises(httpx.ReadTimeout):
            self.gen()
        self.assertEqual(len(self.gw.posts), 1)                         # không gửi sang acc_02 → không tốn 2 lần

    def test_validation_error_is_not_retried_on_other_accounts(self):
        self.gw.errors["gw1"] = httpx.Response(422, json={"detail": "bad"})
        with self.assertRaises(dv.DolaValidationError):
            self.gen()
        self.assertEqual(len(self.gw.posts), 1)

    def test_disabled_and_zero_limit_skipped(self):
        accounts = [da.DolaAccountConfig(id="off", base_url="http://gw1", enabled=False),
                    da.DolaAccountConfig(id="zero", base_url="http://gw1", daily_limit=0),
                    da.DolaAccountConfig(id="on", base_url="http://gw2")]
        mgr = da.DolaAccountManager(self.db, accounts, tz="Asia/Tokyo", now_fn=lambda: self.clock[0])
        self.assertEqual(mgr.get_available_account().id, "on")


class AccountConfigTest(unittest.TestCase):
    def test_load_from_file_env_key_and_fallback(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "acc.json"
            path.write_text(json.dumps({"accounts": [
                {"id": "acc_01", "base_url": "http://a:8000/", "api_key_env": "MY_DOLA_KEY"},
                {"id": "acc_02", "base_url": "http://b:8000", "api_key": "k2", "daily_limit": 6},
            ]}))
            with mock.patch.dict(os.environ, {"DOLA_ACCOUNTS_FILE": str(path), "DOLA_ACCOUNTS": "",
                                              "MY_DOLA_KEY": "secret"}):
                accs = da.load_accounts()
                self.assertEqual(accs[0].resolved_key(), "secret")
            self.assertEqual([a.id for a in accs], ["acc_01", "acc_02"])
            self.assertEqual(accs[0].resolved_base_url(), "http://a:8000")
            self.assertEqual((accs[0].daily_limit, accs[1].daily_limit), (2, 6))
            path.write_text(json.dumps([{"id": "x"}, {"id": "x"}]))
            with mock.patch.dict(os.environ, {"DOLA_ACCOUNTS_FILE": str(path), "DOLA_ACCOUNTS": ""}):
                self.assertRaises(ValueError, da.load_accounts)
            with mock.patch.dict(os.environ, {"DOLA_ACCOUNTS_FILE": str(Path(d) / "none.json"), "DOLA_ACCOUNTS": ""}):
                self.assertEqual([a.id for a in da.load_accounts()], ["default"])

    def test_example_file_is_valid(self):
        path = Path(__file__).resolve().parent.parent / "docs" / "dola_accounts.example.json"
        with mock.patch.dict(os.environ, {"DOLA_ACCOUNTS_FILE": str(path), "DOLA_ACCOUNTS": ""}):
            self.assertGreaterEqual(len(da.load_accounts()), 2)


class WorkerPoolTest(unittest.TestCase):
    """Luồng nền: không vượt hạn mức khi nhiều task chạy song song, hết pool thì chờ reset."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.saved = (dr.DB_PATH, dr.VIDEO_DIR, dict(dr.CLIENT_KW), dr.accounts_override, dr.now_fn)
        dr.DB_PATH, dr.VIDEO_DIR = root / "db.sqlite", root / "videos"
        self.clock = [ts(2026, 10, 4, 15)]
        dr.now_fn = lambda: self.clock[0]
        self.gw = MultiGateway()
        dr.CLIENT_KW.clear()
        dr.CLIENT_KW.update(poll_interval=0, transport=httpx.MockTransport(self.gw), sleep=lambda s: None)
        dr.accounts_override = [da.DolaAccountConfig(id="acc_01", base_url="http://gw1", api_key="k1"),
                                da.DolaAccountConfig(id="acc_02", base_url="http://gw2", api_key="k2")]
        dr.init_tables()
        app = FastAPI()
        app.include_router(dr.router)
        self.api = TestClient(app)
        self._tz = mock.patch.dict(os.environ, {"DOLA_LIMIT_RESET_TZ": "Asia/Tokyo"})
        self._tz.start()
        dr._managers.clear()

    def tearDown(self):
        self._tz.stop()
        dr.DB_PATH, dr.VIDEO_DIR, kw, dr.accounts_override, dr.now_fn = self.saved
        dr.CLIENT_KW.clear()
        dr.CLIENT_KW.update(kw)
        dr._managers.clear()
        self.tmp.cleanup()

    def test_parallel_tasks_respect_limit_and_wait_for_reset(self):
        ids = self.api.post("/api/dola/tasks", json={"prompt": "fox", "count": 4}).json()["ids"]
        ids += self.api.post("/api/dola/tasks", json={"prompt": "owl"}).json()["ids"]
        dr.tick()                                       # gửi 4 task; task thứ 5 không còn chỗ
        tasks = {i: dr._row(i) for i in ids}
        per_acc = {}
        for t in tasks.values():
            if t["account_id"]:
                per_acc[t["account_id"]] = per_acc.get(t["account_id"], 0) + 1
        self.assertEqual(per_acc, {"acc_01": 2, "acc_02": 2})
        last = tasks[ids[-1]]
        self.assertEqual(last["status"], "SUBMITTING")
        self.assertEqual(len(self.gw.posts), 4)
        dr.tick()                                       # poll → completed → tải về, +1 lượt mỗi task
        dr.tick()
        acc = {a["id"]: a for a in self.api.get("/api/dola/accounts").json()["accounts"]}
        self.assertEqual((acc["acc_01"]["used_today"], acc["acc_02"]["used_today"]), (2, 2))
        # Lúc gửi, 4 task kia còn chạy (có thể lỗi và trả chỗ) nên chỉ chờ 60 s; thử lại thì chờ tới 00:00.
        self.assertEqual(dr._row(ids[-1])["next_attempt_at"], ts(2026, 10, 4, 15) + 60)
        self.clock[0] += 61
        dr.tick()
        self.assertEqual(dr._row(ids[-1])["next_attempt_at"], ts(2026, 10, 5, 0))
        self.assertEqual(len(self.gw.posts), 4)
        self.clock[0] = ts(2026, 10, 5, 0) + 1          # qua 00:00 Tokyo
        dr.tick()
        dr.tick()
        self.assertEqual(dr._row(ids[-1])["status"], "COMPLETED")
        polled = {h for h, _ in self.gw.polls}
        self.assertEqual(polled, {"gw1", "gw2"})
        self.assertTrue(all(auth == {"gw1": "Bearer k1", "gw2": "Bearer k2"}[h] for h, auth in self.gw.polls))

    def test_quota_mid_day_switches_in_worker_and_unblock(self):
        self.gw.quota["gw1"] = 1
        [tid] = self.api.post("/api/dola/tasks", json={"prompt": "fox"}).json()["ids"]
        dr.tick()
        self.assertEqual(dr._row(tid)["account_id"], "acc_02")
        acc = {a["id"]: a for a in self.api.get("/api/dola/status").json()["accounts"]}
        self.assertTrue(acc["acc_01"]["is_blocked"])
        res = self.api.post("/api/dola/accounts/acc_01/unblock").json()
        self.assertFalse({a["id"]: a for a in res["accounts"]}["acc_01"]["is_blocked"])
        self.assertEqual(self.api.post("/api/dola/accounts/nope/unblock").status_code, 404)

    def test_task_of_removed_account_fails_clearly(self):
        [tid] = self.api.post("/api/dola/tasks", json={"prompt": "fox"}).json()["ids"]
        dr.tick()
        gone = dr._row(tid)["account_id"]
        dr.accounts_override = [a for a in dr.accounts_override if a.id != gone]
        dr.tick()
        t = dr._row(tid)
        self.assertEqual(t["status"], "FAILED")
        self.assertIn("không còn trong cấu hình", t["error"])


if __name__ == "__main__":
    unittest.main()
