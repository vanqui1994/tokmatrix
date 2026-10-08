import sqlite3
import sys
import tempfile
import json
import subprocess
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import video_fingerprint

from bkt_web.autopilot import cleanup, cycle, engine, housekeeping, planner, proc, publisher, revive, safety, store, topics


class FakeMatrix:
    """Thay matrix_db: job nằm trong dict, transition kiểm tra expected_state như bản thật."""

    def __init__(self):
        self.jobs = {}
        self.niches = {}
        self.batches = set()
        self.topics = {}
        self.fail_transition = False

    def add_job(self, job_id, batch_id, channel_id, slug, state="READY_TO_PUBLISH", niche="space",
                engine="science", error=None):
        self.jobs[job_id] = {"job_id": job_id, "batch_id": batch_id, "channel_id": channel_id,
                             "video_slug": slug, "state": state, "updated_at": 0, "engine_type": engine,
                             "error_message": error, "manifest": {}}
        self.niches[job_id] = {"channel_niche": niche, "topic_niche": niche}

    def init_db(self, *a, **k):
        pass

    def list_batch_jobs(self, batch_id, *a, **k):
        return [dict(j) for j in self.jobs.values() if j["batch_id"] == batch_id]

    def job_niche_ids(self, job_id, *a, **k):
        return self.niches.get(job_id, {"channel_niche": None, "topic_niche": None})

    def transition_job(self, *, job_id, to_state, expected_state=None, **k):
        if self.fail_transition:
            raise RuntimeError("process chết giữa chừng")
        job = self.jobs[job_id]
        if expected_state and job["state"] != expected_state:
            raise ValueError(f"job {job_id} is {job['state']}, expected {expected_state}")
        job["state"] = to_state
        return job

    def get_job(self, job_id, *a, **k):
        return self.jobs.get(job_id)

    def get_batch(self, batch_id, *a, **k):
        return {"batch_id": batch_id} if batch_id in self.batches else None

    def get_job_by_slug(self, slug, *a, **k):
        for job in self.jobs.values():
            if job["video_slug"] == slug:
                return job
        return None

    def list_jobs_in_states(self, states, *, updated_before, **k):
        return [j for j in self.jobs.values() if j["state"] in states and j["updated_at"] < updated_before]

    def list_topics(self, niche_id, *a, **k):
        return list(self.topics.get(niche_id, []))

    def revive_job(self, *, job_id, to_state, engine_type=None, drop_script=False, **k):
        job = self.jobs[job_id]
        assert job["state"] in {"FAILED", "DEAD_LETTER"}
        manifest = job.setdefault("manifest", {})
        manifest["revive_count"] = int(manifest.get("revive_count") or 0) + 1
        job.update(state=to_state, error_message=None, revived_with=(to_state, engine_type, drop_script))
        if engine_type:
            job["engine_type"] = engine_type
        return job


class AutopilotTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.videos = root / "videos"
        self.projects = root / "projects"
        self.videos.mkdir()
        self.projects.mkdir()
        self.channels_db = root / "channels.db"
        self.fake = FakeMatrix()
        patches = [
            mock.patch.object(store, "AUTOPILOT_DB", root / "autopilot.db"),
            mock.patch.object(store, "DB_PATH", self.channels_db),
            mock.patch.object(store, "VIDEOS_DIR", self.videos),
            mock.patch.object(store, "PROJECTS_DIR", self.projects),
            mock.patch.object(store, "COMPARE_DIR", root),
            mock.patch.object(store, "TOPICS_DIR", root / "topics"),
            mock.patch.object(video_fingerprint, "DB_PATH", root / "video_fingerprints.db"),
            mock.patch.object(video_fingerprint, "VIDEOS_DIR", self.videos),
            # dọn dung lượng không bao giờ chạm vào thư mục thật khi test
            mock.patch.object(housekeeping, "BRIDGE_ARCHIVE", root / "no-archive"),
            mock.patch.object(housekeeping, "GENERATED_IMAGES", root / "no-generated"),
            mock.patch.object(housekeeping, "NPX_DIR", root / "no-npx"),
            # sinh topic: không bao giờ gọi Gemini thật khi test
            mock.patch.object(topics, "GENERATED_DIR", root / "generated-topics"),
            mock.patch.object(topics, "_ask_gemini", side_effect=RuntimeError("no network in tests")),
            mock.patch.dict(topics._failed_until, clear=True),
        ]
        for module in (publisher, safety, planner, cleanup, revive):
            patches.append(mock.patch.object(module, "matrix_db", self.fake))
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        store.init_db()
        conn = sqlite3.connect(self.channels_db)
        conn.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, country TEXT)")
        conn.execute(
            "CREATE TABLE upload_tasks (id INTEGER PRIMARY KEY, channel_id INTEGER, video_path TEXT, "
            "schedule_time INTEGER, status TEXT, uploaded_at INTEGER DEFAULT 0, archived_at INTEGER DEFAULT 0, "
            "video_slug TEXT DEFAULT '', run_id TEXT DEFAULT '')"
        )
        conn.execute("INSERT INTO channels VALUES (63, 'DE')")
        conn.commit()
        conn.close()

    def sql(self, query, params=()):
        conn = sqlite3.connect(self.channels_db)
        try:
            rows = conn.execute(query, params).fetchall()
            conn.commit()
            return rows
        finally:
            conn.close()

    def add_mapping(self, matrix_channel="ch-space-1", niche="space", tiktok_id=63):
        conn = store.adb()
        conn.execute(
            "INSERT INTO autopilot_channel_map(matrix_channel_id, niche_id, tiktok_channel_id, country, language) "
            "VALUES (?, ?, ?, 'DE', 'de')",
            (matrix_channel, niche, tiktok_id),
        )
        conn.commit()
        conn.close()


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

class ConfigValidationTest(AutopilotTestCase):
    def test_normalises_valid_values(self):
        self.assertEqual(store.validate_config("enabled", "TRUE"), "true")
        self.assertEqual(store.validate_config("posting_hours", "[19, 8, 8]"), "[8, 19]")
        self.assertEqual(store.validate_config("max_concurrent_batches", " 2 "), "2")

    def test_rejects_bad_values(self):
        for key, value in [("unknown", "1"), ("enabled", "yes"), ("plan_hour", "24"),
                           ("posting_hours", "[25]"), ("posting_hours", "8"), ("timezone", "Mars/Base"),
                           ("topic_source", "ai"), ("check_interval_seconds", "5")]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                store.validate_config(key, value)

    def test_set_config_refuses_invalid_value(self):
        with self.assertRaises(ValueError):
            store.set_config("videos_per_day_per_channel", "0")
        self.assertEqual(store.get_config("videos_per_day_per_channel"), "6")


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

class NicheSafetyTest(unittest.TestCase):
    JOB = {"job_id": "j1", "channel_id": "ch-1"}
    PLAN = {"niche_id": "space"}
    MAPPING = {"matrix_channel_id": "ch-1", "niche_id": "space"}
    NICHES = {"channel_niche": "space", "topic_niche": "space"}

    def check(self, **overrides):
        args = {"job": self.JOB, "plan": self.PLAN, "mapping": self.MAPPING, "job_niches": self.NICHES}
        args.update(overrides)
        return safety.check_niche_match(**args)

    def test_all_sources_match(self):
        self.assertTrue(self.check().ok)

    def test_job_topic_niche_differs_from_plan(self):
        verdict = self.check(job_niches={"channel_niche": "space", "topic_niche": "folklore"})
        self.assertFalse(verdict.ok)
        self.assertIn("topic=folklore", verdict.reason)

    def test_account_niche_differs(self):
        self.assertFalse(self.check(mapping={"matrix_channel_id": "ch-1", "niche_id": "wildlife"}).ok)

    def test_missing_source_blocks(self):
        verdict = self.check(job_niches={"channel_niche": None, "topic_niche": "space"})
        self.assertFalse(verdict.ok)
        self.assertIn("channel", verdict.reason)

    def test_mapping_for_other_channel_blocks(self):
        self.assertFalse(self.check(mapping={"matrix_channel_id": "ch-2", "niche_id": "space"}).ok)

    def test_no_mapping_blocks(self):
        self.assertFalse(self.check(mapping=None).ok)


# ---------------------------------------------------------------------------
# Publisher
# ---------------------------------------------------------------------------

class PublisherTest(AutopilotTestCase):
    PLAN = {"id": 0, "niche_id": "space", "batch_id": "b1", "status": "producing"}

    def setUp(self):
        super().setUp()
        self.add_mapping()
        self.fake.add_job("j1", "b1", "ch-space-1", "space-01")
        self.enqueued = []
        self.captions = []

        def fake_enqueue(slug, channel_id, caption, hashtags, **kwargs):
            self.enqueued.append((slug, channel_id, kwargs))
            self.captions.append((caption, hashtags))
            self.sql("INSERT INTO upload_tasks (channel_id, schedule_time, status, video_slug) VALUES (?, ?, 'QUEUED', ?)",
                     (channel_id, kwargs["schedule_ts"], slug))
            return {"id": 1}

        for patch in (
            mock.patch.object(publisher.publish_flow, "enqueue_upload", side_effect=fake_enqueue),
            mock.patch.object(safety, "video_language_problem", return_value=None),
            mock.patch.object(publisher.scheduler, "next_slot", return_value=2_000_000_000),
            mock.patch.object(publisher.captions, "build_caption", return_value=("Caption", "#space #fyp")),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    def job(self):
        return dict(self.fake.jobs["j1"])

    def test_schedules_matching_job(self):
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "scheduled")
        self.assertEqual(self.fake.jobs["j1"]["state"], "SCHEDULED")
        self.assertEqual(len(self.enqueued), 1)
        self.assertTrue(self.enqueued[0][2]["confirm_nearby"])
        self.assertEqual(self.captions, [("Caption", "#space #fyp")])

    def test_crash_between_enqueue_and_transition_does_not_post_twice(self):
        self.fake.fail_transition = True
        with self.assertRaises(RuntimeError):
            publisher.publish_job(self.job(), self.PLAN)
        self.assertEqual(self.fake.jobs["j1"]["state"], "READY_TO_PUBLISH")
        self.fake.fail_transition = False
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "recovered")
        self.assertEqual(len(self.enqueued), 1)
        self.assertEqual(self.sql("SELECT COUNT(*) FROM upload_tasks")[0][0], 1)
        self.assertEqual(self.fake.jobs["j1"]["state"], "SCHEDULED")

    def test_niche_mismatch_is_blocked_without_enqueue(self):
        self.fake.niches["j1"] = {"channel_niche": "space", "topic_niche": "folklore"}
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "blocked")
        self.assertEqual(self.enqueued, [])
        self.assertEqual(self.fake.jobs["j1"]["state"], "READY_TO_PUBLISH")

    def test_block_is_logged_once(self):
        self.fake.niches["j1"] = {"channel_niche": None, "topic_niche": None}
        publisher._reported.clear()
        publisher.publish_job(self.job(), self.PLAN)
        publisher.publish_job(self.job(), self.PLAN)
        blocks = [e for e in store.recent_events(50) if "BẢO VỆ" in e["message"]]
        self.assertEqual(len(blocks), 1)

    def test_pending_images_defer_instead_of_error(self):
        publisher.publish_flow.enqueue_upload.side_effect = publisher.publish_flow.PublishError(409, "Còn 2 ảnh chờ")
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "deferred")
        self.assertEqual(self.fake.jobs["j1"]["state"], "READY_TO_PUBLISH")

    def test_full_calendar_defers(self):
        publisher.scheduler.next_slot.return_value = None
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "deferred")
        self.assertEqual(self.enqueued, [])

    def test_dry_run_writes_nothing_and_reserves_distinct_slots(self):
        self.fake.add_job("j2", "b1", "ch-space-1", "space-02")
        publisher.scheduler.next_slot.side_effect = lambda tid, now=None, extra_used=(): 2_000_000_000 + 3600 * len(list(extra_used))
        plan_id = store.create_plan("2026-09-24", "space", "t", 1)
        store.update_plan(plan_id, batch_id="b1", status="producing")
        result = publisher.publish_ready_jobs(dry_run=True)
        self.assertEqual(result["published"], 2)
        self.assertEqual(sorted(d["schedule_ts"] for d in result["details"]), [2_000_000_000, 2_000_003_600])
        self.assertEqual(self.enqueued, [])
        self.assertEqual({j["state"] for j in self.fake.jobs.values()}, {"READY_TO_PUBLISH"})
        self.assertEqual(store.get_plan(plan_id)["jobs_published"], 0)
        self.assertEqual(store.recent_events(10), [])

    def test_global_hold_defers_without_enqueue(self):
        store.set_config("publish_hold_until", str(int(time.time()) + 3600))
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "deferred")
        self.assertEqual(self.enqueued, [])
        self.assertEqual(self.fake.jobs["j1"]["state"], "READY_TO_PUBLISH")
        store.set_config("publish_hold_until", "0")
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "scheduled")

    def test_account_warms_up_after_cookie_injection(self):
        from bkt_web.autopilot import channels
        self.sql("ALTER TABLE channels ADD COLUMN cookie_injected_at INTEGER DEFAULT 0")
        self.sql("UPDATE channels SET cookie_injected_at=? WHERE id=63", (int(time.time()) - 3600,))
        details = []
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN, details=details), "deferred")
        self.assertIn("ngâm", details[0]["reason"])
        store.set_config("warmup_hours", "0")
        self.assertIsNone(publisher.publish_wait_reason(63))
        store.set_config("warmup_hours", "1")
        self.assertIsNone(publisher.publish_wait_reason(63, now=time.time() + 5))
        self.assertEqual(channels.cookie_injected_at(999), 0)

    def test_min_lead_hours_pushes_slot_past_ready_time(self):
        ready_at = int(time.time())
        self.fake.jobs["j1"]["updated_at"] = ready_at
        store.set_config("min_lead_hours", "24")
        publisher.publish_job(self.job(), self.PLAN)
        self.assertGreaterEqual(publisher.scheduler.next_slot.call_args.kwargs["now"], ready_at + 24 * 3600)
        store.set_config("min_lead_hours", "0")
        self.fake.jobs["j1"]["state"] = "READY_TO_PUBLISH"
        self.sql("DELETE FROM upload_tasks")
        publisher.publish_job(self.job(), self.PLAN)
        self.assertLess(publisher.scheduler.next_slot.call_args.kwargs["now"], ready_at + 3600)

    def test_no_slot_is_handed_out_before_the_publish_hold_ends(self):
        from bkt_web.autopilot import scheduler
        hold = int(time.time()) + 2 * 86400
        store.set_config("publish_hold_until", str(hold))
        slots = scheduler.free_slots(1)
        self.assertTrue(slots)
        self.assertGreaterEqual(min(slots), hold)  # task remake xếp lúc đang giữ không đăng dồn khi mốc hết
        store.set_config("publish_hold_until", "0")
        self.assertLess(min(scheduler.free_slots(1)), hold)

    def test_upload_scheduler_respects_publish_hold(self):
        from bkt_web.server import upload_hold_active
        store.set_config("publish_hold_until", str(int(time.time()) + 3600))
        self.assertTrue(upload_hold_active())
        store.set_config("publish_hold_until", "0")
        self.assertFalse(upload_hold_active())

    def test_blocked_engine_defers_by_job_engine_or_rendered_engine(self):
        store.set_config("publish_block_engines", "science, kinetic")
        self.assertEqual(store.get_config("publish_block_engines"), "science,kinetic")
        details = []
        self.fake.jobs["j1"]["engine_type"] = "science"
        self.assertEqual(publisher.publish_job(self.job(), self.PLAN, details=details), "deferred")
        self.assertIn("science", details[0]["reason"])
        self.assertEqual(self.enqueued, [])
        self.assertEqual(self.fake.jobs["j1"]["state"], "READY_TO_PUBLISH")
        # slug cũ nhưng render bằng engine bị chặn (meta.json) → vẫn chặn
        self.fake.jobs["j1"]["engine_type"] = "tierlist"
        with mock.patch.object(publisher.store, "VIDEOS_DIR") as videos:
            videos.__truediv__.return_value.__truediv__.return_value.read_text.return_value = '{"type": "kinetic"}'
            self.assertEqual(publisher.blocked_engine(self.job()), "kinetic")
        store.set_config("publish_block_engines", "")
        self.assertIsNone(publisher.blocked_engine(self.job()))
        with self.assertRaises(ValueError):
            store.validate_config("publish_block_engines", "sciencee")

    def _fp(self, slug, frames, bgm="b1"):
        video_fingerprint.save(video_fingerprint.connect(), {
            "video_slug": slug, "engine": "science", "lang": "en", "duration": 60.0, "frames": [f"{h:016x}" for h in frames],
            "mean_frame": f"{frames[0]:016x}", "audio": video_fingerprint.np.zeros(0, dtype=video_fingerprint.np.uint32),
            "bgm_md5": bgm, "voice": "", "mtime": 0.0})

    def test_dupguard_finds_closest_published_video_and_blocks_only_in_block_mode(self):
        from bkt_web.autopilot import dupguard
        template = [0x0F0F0F0F0F0F0F0F ^ (i << 3) for i in range(24)]   # cùng khuôn: khung gần như trùng
        other = [(0x1234567890ABCDEF * (i + 7)) & 0xFFFFFFFFFFFFFFFF for i in range(24)]
        self._fp("science-first", template)
        self._fp("vox-other", other, bgm="b2")
        self._fp("space-01", [h ^ 0b11 for h in template])            # video sắp đăng
        self.sql("INSERT INTO upload_tasks(channel_id,video_path,status,video_slug) VALUES(70,'x','SUCCESS','science-first')")
        self.sql("INSERT INTO upload_tasks(channel_id,video_path,status,video_slug) VALUES(71,'y','QUEUED','vox-other')")
        with mock.patch.object(video_fingerprint, "get_or_compute", side_effect=lambda conn, slug, videos_dir=None: video_fingerprint.load(conn, [slug])[slug]):
            result = dupguard.check("space-01", 63)
            self.assertEqual(result["closest_slug"], "science-first")
            self.assertEqual(result["closest_channel"], 70)
            self.assertEqual(result["frames"], 1.0)
            self.assertTrue(result["same_bgm"])
            self.assertEqual(result["compared"], 2)
            self.assertIsNone(dupguard.verdict("space-01", 63))              # report: chỉ ghi
            store.set_config("dup_check_mode", "block")
            self.assertIn("science-first", dupguard.verdict("space-01", 63))
            self.assertEqual(publisher.publish_job(self.job(), self.PLAN), "deferred")
            self.assertEqual(self.enqueued, [])
            store.set_config("dup_frames_threshold", "1")
            self.assertEqual(store.get_config("dup_frames_threshold"), "1.00")
            store.set_config("dup_check_mode", "off")
            self.assertIsNone(dupguard.verdict("space-01", 63))
        self.assertGreaterEqual(len(dupguard.recent()), 3)
        with self.assertRaises(ValueError):
            store.validate_config("dup_check_mode", "strict")

    def test_dupguard_records_composite_and_blocks_on_it_only_when_configured(self):
        import tempfile
        from bkt_web import creative_similarity as cs
        from bkt_web.autopilot import dupguard
        template = [0x0F0F0F0F0F0F0F0F ^ (i << 3) for i in range(24)]
        far = [(0x1234567890ABCDEF * (i + 7)) & 0xFFFFFFFFFFFFFFFF for i in range(24)]
        self._fp("mystery-a", far)                                     # khác khung…
        self._fp("mystery-b", template)
        self._fp("mystery-new", [h ^ 0xF0F0F0F0F0F0F0F0 for h in template])
        self.sql("INSERT INTO upload_tasks(channel_id,video_path,status,video_slug) VALUES(80,'a','SUCCESS','mystery-a')")
        self.sql("INSERT INTO upload_tasks(channel_id,video_path,status,video_slug) VALUES(81,'b','SUCCESS','mystery-b')")
        features = {"mystery-new": {"n": 1}, "mystery-a": {"n": 2}, "mystery-b": {"n": 3}}
        composite = {"mystery-a": 0.71, "mystery-b": 0.4}              # …nhưng cùng khuôn đa tín hiệu với mystery-a
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(cs, "DB_PATH", Path(tmp) / "cs.db"), \
                mock.patch.object(cs, "features_for", side_effect=lambda slug, conn: features[slug]), \
                mock.patch.object(cs, "compare", side_effect=lambda a, b: {"layout": 0.9, "composite": composite[{2: "mystery-a", 3: "mystery-b"}[b["n"]]]}), \
                mock.patch.object(video_fingerprint, "get_or_compute", side_effect=lambda conn, slug, videos_dir=None: video_fingerprint.load(conn, [slug])[slug]):
            result = dupguard.check("mystery-new", 64)
            self.assertEqual((result["composite"], result["composite_slug"], result["composite_channel"]), (0.71, "mystery-a", 80))
            self.assertLess(result["frames"], dupguard.threshold())
            self.assertEqual(dupguard.recent(1)[0]["composite_slug"], "mystery-a")
            store.set_config("dup_check_mode", "block")
            self.assertIsNone(dupguard.verdict("mystery-new", 64), "composite alone never blocks while the threshold is unset")
            store.set_config("dup_composite_threshold", "0.62")
            self.assertEqual(store.get_config("dup_composite_threshold"), "0.62")
            self.assertIn("mystery-a", dupguard.verdict("mystery-new", 64))
            store.set_config("dup_composite_threshold", "")
            self.assertIsNone(dupguard.verdict("mystery-new", 64))
        with mock.patch.object(cs, "features_for", side_effect=OSError("no meta.json")), \
                mock.patch.object(video_fingerprint, "get_or_compute", side_effect=lambda conn, slug, videos_dir=None: video_fingerprint.load(conn, [slug])[slug]):
            result = dupguard.check("mystery-new", 64, record=False)
            self.assertIsNone(result["composite"], "a composite failure keeps the frame result")
        for bad in ("abc", "0", "1.5"):
            with self.assertRaises(ValueError):
                store.validate_config("dup_composite_threshold", bad)

    def test_halted_plan_waiting_for_resume_still_publishes_finished_videos(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 1)
        store.update_plan(plan_id, batch_id="b1", status="planned")  # batch bị dừng, chờ --resume
        result = publisher.publish_ready_jobs()
        self.assertEqual(result["published"], 1)
        self.assertEqual(self.fake.jobs["j1"]["state"], "SCHEDULED")
        self.assertEqual(store.get_plan(plan_id)["status"], "planned")  # không tự chốt plan chưa chạy xong
        fresh = store.create_plan("2026-09-25", "space", "t2", 1)  # plan mới chưa có batch → bỏ qua
        self.assertEqual(store.get_plan(fresh)["batch_id"], None)

    def test_plan_stats_count_job_states_and_finish_only_when_producing(self):
        plan_id = store.create_plan("2026-09-24", "space", "Black holes", 2)
        self.fake.add_job("j2", "b1", "ch-space-2", "space-02", state="FAILED")
        store.update_plan(plan_id, batch_id="b1", status="starting")
        publisher.publish_ready_jobs()
        plan = store.get_plan(plan_id)
        self.assertEqual((plan["jobs_published"], plan["jobs_failed"]), (1, 1))
        self.assertEqual(plan["status"], "starting")  # batch vẫn đang chạy → chưa chốt
        store.update_plan(plan_id, status="producing")
        publisher.publish_ready_jobs()
        self.assertEqual(store.get_plan(plan_id)["status"], "partial")


# ---------------------------------------------------------------------------
# Planner
# ---------------------------------------------------------------------------

class PlannerTest(AutopilotTestCase):
    def setUp(self):
        super().setUp()
        niches = [{"id": "space", "name": "Space"}, {"id": "folklore", "name": "Folklore"}, {"id": "empty", "name": "E"}]
        self.mapped = {"space": ["a", "b"], "folklore": ["c"], **{f"n{i}": [f"x{i}"] for i in range(5)}}
        for patch in (
            mock.patch.object(planner, "get_niches", return_value=niches),
            mock.patch.object(planner.channels, "mapped_channels_by_niche", side_effect=lambda: self.mapped),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        store.TOPICS_DIR.mkdir()
        (store.TOPICS_DIR / "space.txt").write_text("# comment\nBlack holes\nNeutron stars\n", encoding="utf-8")
        self.fake.topics["folklore"] = ["Ma da"]
        store.set_config("topic_per_channel", "false")  # các test dưới là kiểu cũ 1 topic/niche; xem ChannelPlanTest

    def test_creates_missing_niches_only_and_is_idempotent(self):
        today = store.today()
        store.create_plan(today, "space", "Old topic", 2)
        result = planner.ensure_daily_plan(today, respect_plan_hour=False)
        self.assertEqual(result["created"], ["folklore"])
        self.assertEqual(planner.ensure_daily_plan(today, respect_plan_hour=False)["created"], [])
        self.assertEqual({p["niche_id"] for p in store.get_plans_for_date(today)}, {"space", "folklore"})

    def test_skips_used_topics(self):
        store.save_topic("space", "black HOLES ")
        self.assertEqual(planner.pick_topic("space"), "Neutron stars")

    def test_topic_source_file_ignores_matrix(self):
        store.set_config("topic_source", "file")
        self.assertIsNone(planner.pick_topic("folklore"))
        store.set_config("topic_source", "matrix")
        self.assertEqual(planner.pick_topic("folklore"), "Ma da")

    def test_waits_for_plan_hour(self):
        store.set_config("plan_hour", "23")
        with mock.patch.object(store, "now_local") as now:
            now.return_value = mock.Mock(hour=5, date=lambda: mock.Mock(isoformat=lambda: "2026-09-24"))
            result = planner.ensure_daily_plan("2026-09-24")
        self.assertEqual(result["waiting_until_hour"], 23)
        self.assertEqual(store.get_plans_for_date("2026-09-24"), [])

    def test_recover_plans(self):
        starting = store.create_plan("2026-09-24", "space", "t1", 2)
        store.update_plan(starting, status="starting", batch_id="b-start")
        legacy = store.create_plan("2026-09-24", "folklore", "t2", 1)
        store.update_plan(legacy, status="producing")
        stale = store.create_plan("2026-09-20", "space", "t3", 2)
        stale_resumable = store.create_plan("2026-09-20", "folklore", "t4", 1)
        store.update_plan(stale_resumable, batch_id="b-old")
        planner.recover_plans("2026-09-24")
        self.assertEqual(store.get_plan(starting)["status"], "planned")
        self.assertEqual(store.get_plan(starting)["batch_id"], "b-start")
        self.assertEqual(store.get_plan(legacy)["status"], "planned")
        self.assertEqual(store.get_plan(stale)["status"], "expired")
        self.assertEqual(store.get_plan(stale_resumable)["status"], "planned")
        pending = {p["id"] for p in planner.pending_plans("2026-09-24")}
        self.assertEqual(pending, {starting, legacy, stale_resumable})

    def test_halted_batch_keeps_batch_id_for_resume(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 2)
        with mock.patch.object(planner, "trigger_matrix_batch", side_effect=store.Halted("stop")):
            with self.assertRaises(store.Halted):
                planner.run_plan_item(store.get_plan(plan_id))
        plan = store.get_plan(plan_id)
        self.assertEqual(plan["status"], "planned")
        self.assertTrue(plan["batch_id"])
        self.fake.batches.add(plan["batch_id"])
        with mock.patch.object(planner, "trigger_matrix_batch", return_value={}) as trigger:
            self.assertEqual(planner.run_plan_item(store.get_plan(plan_id)), "started")
        self.assertTrue(trigger.call_args.kwargs["resume"])
        self.assertEqual(trigger.call_args.kwargs["batch_id"], plan["batch_id"])
        self.assertEqual(store.get_plan(plan_id)["status"], "producing")

    def test_batch_gets_only_mapped_channel_ids(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 14)
        with mock.patch.object(planner, "trigger_matrix_batch", return_value={}) as trigger:
            planner.run_plan_item(store.get_plan(plan_id))
        self.assertEqual(trigger.call_args.kwargs["channel_ids"], ["a", "b"])
        self.assertEqual(store.get_plan(plan_id)["channel_count"], 2)

    def test_niche_without_mapped_channels_fails_without_batch(self):
        self.mapped.pop("space")
        plan_id = store.create_plan("2026-09-24", "space", "t", 2)
        with mock.patch.object(planner, "trigger_matrix_batch") as trigger:
            self.assertEqual(planner.run_plan_item(store.get_plan(plan_id)), "failed")
        trigger.assert_not_called()

    def test_cli_args_carry_channel_ids(self):
        with mock.patch.object(planner.proc, "run", return_value=mock.Mock(returncode=0, stdout="{}", stderr="")) as run:
            planner.trigger_matrix_batch("t", "space", batch_id="b1", channel_ids=["a", "b"], auto_render=False)
        args = run.call_args.args[0]
        self.assertEqual(args[args.index("--channels") + 1], "2")
        self.assertEqual(args[args.index("--channel-ids") + 1], "a,b")

    def test_batch_killed_by_signal_is_halted_not_failed(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 2)
        with mock.patch.object(planner.proc, "run", return_value=mock.Mock(returncode=-15, stdout="[MATRIX-WORKER] …", stderr="")):
            with self.assertRaises(store.Halted):
                planner.run_plan_item(store.get_plan(plan_id))
        plan = store.get_plan(plan_id)
        self.assertEqual(plan["status"], "planned")
        self.assertTrue(plan["batch_id"])

    def test_producing_plan_with_unfinished_jobs_is_resumed(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 2)
        store.update_plan(plan_id, status="producing", batch_id="b-prod")
        self.fake.batches.add("b-prod")
        self.fake.add_job("j1", "b-prod", "a", "s1", state="RETRY_WAIT")
        self.fake.add_job("j2", "b-prod", "b", "s2", state="READY_TO_PUBLISH")
        self.assertEqual([p["id"] for p in planner.pending_plans("2026-09-24")], [plan_id])
        with mock.patch.object(planner, "trigger_matrix_batch", return_value={}) as trigger:
            self.assertEqual(planner.run_plan_item(store.get_plan(plan_id)), "started")
        self.assertTrue(trigger.call_args.kwargs["resume"])
        self.fake.jobs["j1"]["state"] = "FAILED"
        self.assertEqual(planner.pending_plans("2026-09-24"), [])  # hết job dở → không resume nữa

    def test_batch_timeout_keeps_plan_for_resume(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 2)
        with mock.patch.object(planner, "trigger_matrix_batch", side_effect=planner.subprocess.TimeoutExpired("node", 60)):
            self.assertEqual(planner.run_plan_item(store.get_plan(plan_id)), "started")
        self.assertEqual(store.get_plan(plan_id)["status"], "producing")

    def test_failed_batch_marks_plan_failed(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 2)
        with mock.patch.object(planner, "trigger_matrix_batch", side_effect=RuntimeError("node exploded")):
            self.assertEqual(planner.run_plan_item(store.get_plan(plan_id)), "failed")
        self.assertEqual(store.get_plan(plan_id)["status"], "failed")
        self.assertIn("node exploded", store.get_plan(plan_id)["error_message"])

    def test_plan_is_claimed_once(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 2)
        self.assertTrue(store.claim_plan(plan_id, "b1"))
        self.assertFalse(store.claim_plan(plan_id, "b2"))
        self.assertEqual(store.get_plan(plan_id)["batch_id"], "b1")

    def test_background_launch_respects_limit_and_does_not_block(self):
        today = store.today()
        for i in range(4):
            store.create_plan(today, f"n{i}", "t", 1)
        store.set_config("max_concurrent_batches", "2")
        gate = threading.Event()

        def slow_batch(**kwargs):
            gate.wait(5)
            return {}

        with mock.patch.object(planner, "trigger_matrix_batch", side_effect=slow_batch):
            started = time.monotonic()
            first = planner.launch_pending_plans(today=today)
            self.assertLess(time.monotonic() - started, 1)  # không chờ batch chạy xong
            self.assertEqual((first["launched"], first["waiting"]), (2, 2))
            running = planner.running_plan_ids()
            self.assertEqual(len(running), 2)
            deadline = time.monotonic() + 5  # thread nền cần chút thời gian để nhận plan (planned → starting)
            while time.monotonic() < deadline and not all(store.get_plan(pid)["status"] == "starting" for pid in running):
                time.sleep(0.02)
            # recover không được kéo plan đang chạy nền về planned
            planner.recover_plans(today)
            self.assertTrue(all(store.get_plan(pid)["status"] == "starting" for pid in running))
            self.assertEqual(planner.launch_pending_plans(today=today)["launched"], 0)
            gate.set()
            self.assertTrue(planner.wait_running(5))
            self.assertEqual(planner.launch_pending_plans(today=today)["launched"], 2)
            self.assertTrue(planner.wait_running(5))
        self.assertEqual({p["status"] for p in store.get_plans_for_date(today)}, {"producing"})

    def test_launch_order_round_robins_so_old_producing_plans_are_not_starved(self):
        old_a = {"id": 1, "status": "producing"}
        old_b = {"id": 2, "status": "producing"}
        new_c = {"id": 3, "status": "planned"}
        with mock.patch.dict(planner._last_launch, {}, clear=True):
            # chưa chạy lần nào: producing (có video dở) trước planned
            self.assertEqual([p["id"] for p in planner.launch_order([new_c, old_b, old_a])], [1, 2, 3])
            # plan 1 và 3 vừa chạy, plan 2 bị bỏ lượt từ lâu → plan 2 lên đầu
            planner._last_launch.update({1: 200.0, 3: 100.0})
            self.assertEqual([p["id"] for p in planner.launch_order([old_a, old_b, new_c])], [2, 3, 1])

    def test_rare_engines_launch_first(self):
        counts = {"kinetic": 45, "science": 28, "vox": 2, "folklore": 4, "mystery": 1}
        jobs = {
            "b-kin": [{"engine_type": "kinetic", "state": "RETRY_WAIT"}],
            "b-vox": [{"engine_type": "vox", "state": "RETRY_WAIT"}, {"engine_type": "kinetic", "state": "READY_TO_PUBLISH"}],
            "b-mys": [{"engine_type": "mystery", "state": "PLANNING"}],
            "b-sci": [{"engine_type": "science", "state": "SCRIPT_QA"}],       # 28*2 >= 45 → không hiếm
            "b-done": [{"engine_type": "folklore", "state": "READY_TO_PUBLISH"}],  # xong rồi → không tính
        }
        plans = [{"id": i, "status": "producing", "batch_id": b} for i, b in enumerate(jobs, 1)]
        plans.append({"id": 9, "status": "planned", "batch_id": None})
        with mock.patch.object(planner.matrix_db, "list_batch_jobs", side_effect=lambda b: jobs[b]), \
             mock.patch.dict(planner._last_launch, {}, clear=True):
            rarity = planner.plan_rarity(plans, counts)
            self.assertEqual(rarity[3], 1)                       # mystery hiếm nhất
            self.assertEqual(rarity[2], 2)                       # vox
            self.assertEqual({rarity[1], rarity[4], rarity[5], rarity[9]}, {planner.NOT_RARE})
            order = [p["id"] for p in planner.launch_order(plans, rarity)]
            self.assertEqual(order[:2], [3, 2])
            # phần còn lại xoay vòng như cũ: producing trước planned
            self.assertEqual(order[2:], [1, 4, 5, 9])

    def test_priority_engines_config_launch_order_and_batch_env(self):
        with self.assertRaises(ValueError):
            store.validate_config("priority_engines", "survival,nope")
        self.assertEqual(store.validate_config("priority_engines", " Survival chalk,survival "), "survival,chalk")
        store.set_config("priority_engines", "survival")
        counts = {"kinetic": 45, "vox": 0}
        jobs = {"b-vox": [{"engine_type": "vox", "state": "RETRY_WAIT"}],
                "b-surv": [{"engine_type": "survival", "state": "PLANNING"}]}
        plans = [{"id": 1, "status": "producing", "batch_id": "b-vox"},
                 {"id": 2, "status": "producing", "batch_id": "b-surv"}]
        with mock.patch.object(planner.matrix_db, "list_batch_jobs", side_effect=lambda b: jobs[b]), \
             mock.patch.dict(planner._last_launch, {}, clear=True):
            rarity = planner.plan_rarity(plans, counts)
            self.assertLess(rarity[2], rarity[1])        # survival (ưu tiên) trước cả vox (hiếm, 0 video)
            self.assertEqual([p["id"] for p in planner.launch_order(plans, rarity)], [2, 1])
        calls = []
        with mock.patch.object(planner.proc, "run", side_effect=lambda args, **kw: calls.append(kw) or
                               subprocess.CompletedProcess(args, 0, stdout="{}", stderr="")):
            try:
                planner.trigger_matrix_batch("t", "space", batch_id="b-x")
            except Exception:
                pass
        self.assertEqual(calls[0]["env"]["MATRIX_PRIORITY_ENGINES"], "survival")

    def test_one_slot_is_kept_for_new_plans(self):
        today = store.today()
        store.set_config("max_concurrent_batches", "2")
        old_ids = []
        for i in range(3):
            pid = store.create_plan("2026-09-20", f"old{i}", "t", 1)
            store.update_plan(pid, batch_id=f"b-old{i}", status="producing")
            old_ids.append(pid)
        new_id = store.create_plan(today, "fresh", "t", 1)
        launched = []
        with mock.patch.object(planner, "has_unfinished_jobs", return_value=True), \
             mock.patch.object(planner, "plan_rarity", side_effect=lambda plans: {p["id"]: (0 if p["batch_id"] else planner.NOT_RARE) for p in plans}), \
             mock.patch.object(planner, "_run_in_background", side_effect=lambda plan, halt: launched.append(plan["id"])), \
             mock.patch.dict(planner._last_launch, {}, clear=True):
            planner.launch_pending_plans(today=today)
        self.assertIn(new_id, launched)            # plan mới không bị plan cũ (thể loại hiếm) chiếm hết slot
        self.assertEqual(len(launched), 2)

    def test_plans_with_image_ready_jobs_launch_first(self):
        today = store.today()
        store.set_config("max_concurrent_batches", "2")
        fresh = store.create_plan(today, "ocean_mysteries", "t", 1)            # plan mới, niche chưa chạy
        rare = store.create_plan("2026-09-24", "deep_space", "t", 1)
        store.update_plan(rare, batch_id="b-rare", status="producing")
        ready = store.create_plan("2026-09-24", "folklore_legends", "t", 1)
        store.update_plan(ready, batch_id="b-ready", status="planned")         # batch bị dừng, job đã đủ ảnh
        jobs = {"b-rare": [{"job_id": "j1", "engine_type": "vox", "state": "RETRY_WAIT"}],
                "b-ready": [{"job_id": "j2", "engine_type": "folklore", "state": "RETRY_WAIT"},
                            {"job_id": "j3", "engine_type": "folklore", "state": "ASSET_QA"}]}
        for job_id, done in (("j1", False), ("j2", True), ("j3", True)):
            d = store.PROJECTS_DIR / job_id
            d.mkdir(parents=True)
            (d / "images.json").write_text(json.dumps({"items": {"a": {"taskId": f"t-{job_id}"}}}))
        conn = sqlite3.connect(store.DB_PATH)
        conn.execute("CREATE TABLE image_queue (id TEXT PRIMARY KEY, status TEXT)")
        conn.executemany("INSERT INTO image_queue VALUES (?, ?)",
                         [("t-j1", "pending"), ("t-j2", "completed"), ("t-j3", "completed")])
        conn.commit(); conn.close()
        launched = []
        with mock.patch.object(planner, "has_unfinished_jobs", return_value=True), \
             mock.patch.object(planner.matrix_db, "list_batch_jobs", side_effect=lambda b: jobs[b]), \
             mock.patch.object(planner, "engine_output_counts", return_value={"kinetic": 50}), \
             mock.patch.object(planner, "_run_in_background", side_effect=lambda plan, halt: launched.append(plan["id"])), \
             mock.patch.dict(planner._last_launch, {}, clear=True):
            self.assertEqual(planner.ready_job_counts(store.get_plans_by_status("planned", "producing")), {ready: 2})
            planner.launch_pending_plans(today=today)
        self.assertEqual(launched[0], fresh)          # slot dành cho plan mới vẫn giữ
        self.assertEqual(launched[1], ready)          # rồi tới plan có job đủ ảnh, trước plan hiếm
        self.assertEqual(len(launched), 2)

    def test_new_plans_of_never_served_niches_go_first(self):
        today = store.today()
        store.set_config("max_concurrent_batches", "1")
        served = store.create_plan("2026-09-20", "deep_space", "t", 1)
        store.update_plan(served, batch_id="b-old", status="completed", started_at="2026-09-20T10:00:00")
        first = store.create_plan(today, "deep_space", "t", 1)          # id nhỏ hơn nhưng niche đã chạy
        starved = store.create_plan(today, "ocean_mysteries", "t", 1)   # chưa chạy lần nào (kênh ko/ja)
        launched = []
        with mock.patch.object(planner, "_run_in_background", side_effect=lambda plan, halt: launched.append(plan["id"])), \
             mock.patch.dict(planner._last_launch, {}, clear=True):
            planner.launch_pending_plans(today=today)
        self.assertEqual(launched, [starved])
        self.assertLess(first, starved)

    def test_concurrency_limit(self):
        today = store.today()
        for i in range(5):
            conn = store.adb()
            conn.execute("INSERT INTO autopilot_plans(plan_date, niche_id, topic, channel_count, status) "
                         "VALUES (?, ?, 't', 1, 'planned')", (today, f"n{i}"))
            conn.commit()
            conn.close()
        store.set_config("max_concurrent_batches", "2")
        active, peak, lock = [0], [0], threading.Lock()

        def slow_batch(**kwargs):
            with lock:
                active[0] += 1
                peak[0] = max(peak[0], active[0])
            time.sleep(0.05)
            with lock:
                active[0] -= 1
            return {}

        with mock.patch.object(planner, "trigger_matrix_batch", side_effect=slow_batch):
            result = planner.run_pending_plans(today=today)
        self.assertEqual(result["started"], 5)
        self.assertEqual(peak[0], 2)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

class ChannelPlanTest(AutopilotTestCase):
    """topic_per_channel: mỗi acc một plan + topic riêng, không chung chủ thể với acc cùng niche."""

    def setUp(self):
        super().setUp()
        self.mapped = {"wild": ["w1", "w2", "w3"]}
        for patch in (
            mock.patch.object(planner, "get_niches", return_value=[{"id": "wild", "name": "Wildlife"}]),
            mock.patch.object(planner.channels, "mapped_channels_by_niche", side_effect=lambda: self.mapped),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        store.TOPICS_DIR.mkdir()
        (store.TOPICS_DIR / "wild.txt").write_text(
            "Mantis shrimp punch boils water\nWhy mantis shrimp see sixteen colors\nOrca hunting tactics\n"
            "Honey badger venom immunity\nTardigrade survives outer space\nAxolotl regrows its brain\n"
            "Pistol shrimp sonic snap\n", encoding="utf-8")

    def test_each_channel_gets_its_own_topic_with_distinct_subject(self):
        result = planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)
        self.assertEqual(sorted(result["created"]), ["w1", "w2", "w3"])
        plans = store.get_plans_for_date("2026-09-27")
        self.assertEqual({p["matrix_channel_id"] for p in plans}, {"w1", "w2", "w3"})
        chosen = [p["topic"] for p in plans]
        self.assertEqual(len(set(chosen)), 3)
        self.assertNotIn("Why mantis shrimp see sixteen colors", chosen)  # cùng chủ thể với topic đầu
        self.assertTrue(all(p["channel_count"] == 1 for p in plans))
        self.assertEqual(planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)["created"], [])

    def test_subject_gap_spans_days(self):
        planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)
        planner.ensure_daily_plan("2026-09-28", respect_plan_hour=False)
        day2 = [p["topic"] for p in store.get_plans_for_date("2026-09-28")]
        self.assertFalse(any("mantis" in t.lower() for t in day2))

    def test_legacy_whole_niche_plan_is_left_alone(self):
        store.create_plan("2026-09-27", "wild", "Orca hunting tactics", 3)
        self.assertEqual(planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)["created"], [])

    def test_runs_batch_for_only_its_channel(self):
        planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)
        plan = next(p for p in store.get_plans_for_date("2026-09-27") if p["matrix_channel_id"] == "w2")
        with mock.patch.object(planner, "trigger_matrix_batch", return_value={}) as trigger:
            self.assertEqual(planner.run_plan_item(plan), "started")
        self.assertEqual(trigger.call_args.kwargs["channel_ids"], ["w2"])

    def test_unmapped_channel_plan_fails_instead_of_running_the_whole_niche(self):
        planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)
        plan = next(p for p in store.get_plans_for_date("2026-09-27") if p["matrix_channel_id"] == "w3")
        self.mapped = {"wild": ["w1", "w2"]}
        with mock.patch.object(planner, "trigger_matrix_batch") as trigger:
            self.assertEqual(planner.run_plan_item(plan), "failed")
        trigger.assert_not_called()

    def test_refills_topics_with_gemini_when_stock_runs_low(self):
        self.mapped = {"wild": [f"w{i}" for i in range(6)]}
        reply = "Komodo dragon venom glands\nPeregrine falcon dive speed\nBlue whale heart size\n" \
                "Mantis shrimp armored club\n"
        with mock.patch.object(topics, "_ask_gemini", return_value=reply):
            result = planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)
        self.assertEqual(len(result["created"]), 6)
        generated = topics.generated_topics("wild")
        self.assertIn("Komodo dragon venom glands", generated)
        self.assertNotIn("Mantis shrimp armored club", generated)  # trùng chủ thể với topic đã có

    def test_gemini_failure_leaves_channels_without_topic(self):
        self.mapped = {"wild": [f"w{i}" for i in range(9)]}
        result = planner.ensure_daily_plan("2026-09-27", respect_plan_hour=False)
        self.assertEqual(len(result["created"]) + len(result["no_topic"]), 9)
        self.assertGreater(len(result["no_topic"]), 0)

    def test_subject_words(self):
        self.assertTrue(topics.same_subject("Mantis shrimp punch boils water", ["Why mantis shrimp see colors"]))
        self.assertFalse(topics.same_subject("Pistol shrimp sonic snap", ["Mantis shrimp punch"]))


class PlanMigrationTest(unittest.TestCase):
    def test_old_unique_constraint_is_migrated_and_rows_kept(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "a.db"
            old = store.SCHEMA_SQL.replace("    matrix_channel_id TEXT NOT NULL DEFAULT '',\n", "").replace(
                "UNIQUE(plan_date, niche_id, language, matrix_channel_id)", "UNIQUE(plan_date, niche_id, language)")
            conn = sqlite3.connect(db)
            conn.executescript(old)
            conn.execute("INSERT INTO autopilot_plans(plan_date, niche_id, topic, status) VALUES ('2026-09-26','x','t','producing')")
            conn.commit()
            conn.close()
            with mock.patch.object(store, "AUTOPILOT_DB", db):
                store.init_db()
                store.init_db()
                store.create_plan("2026-09-26", "x", "t2", 1, matrix_channel_id="a")
                store.create_plan("2026-09-26", "x", "t3", 1, matrix_channel_id="b")
                plans = store.get_plans_for_date("2026-09-26")
            self.assertEqual(len(plans), 3)
            self.assertEqual(plans[0]["status"], "producing")


class FreeSlotsTest(AutopilotTestCase):
    def setUp(self):
        super().setUp()
        # Nhịp khởi động (account_pacing) có test riêng; ở đây acc coi như đã ấm và không nghỉ.
        from bkt_web import account_pacing
        for name, value in (("WARMUP_FOLLOWERS", 0), ("rest_until", lambda *a, **k: 0)):
            p = mock.patch.object(account_pacing, name, value); p.start(); self.addCleanup(p.stop)

    def test_slots_respect_gap_daily_cap_and_account_timezone(self):
        import datetime as dt
        from zoneinfo import ZoneInfo
        from bkt_web.autopilot import scheduler
        store.set_config("posting_hours", "[8,9,10,12,14]")
        store.set_config("gap_between_posts_minutes", "90")
        store.set_config("videos_per_day_per_channel", "3")
        store.set_config("slot_jitter_minutes", "0")
        store.set_config("spread_posting_hours", "false")
        now = dt.datetime(2026, 9, 24, 12, 0, tzinfo=dt.timezone.utc).timestamp()
        slots = scheduler.free_slots(63, now)
        local = [dt.datetime.fromtimestamp(t, ZoneInfo("Europe/Berlin")) for t in slots]
        first_day = [t.strftime("%H:%M") for t in local if t.date() == local[0].date()]
        self.assertEqual(first_day, ["08:00", "10:00", "12:00"])  # 09:00 quá gần 08:00, tối đa 3/ngày
        self.assertEqual(len(slots), 3 * scheduler.LOOKAHEAD_DAYS - 3)  # hôm nay 14:00 CEST đã qua
        self.assertEqual(scheduler.next_slot(63, now, extra_used=[slots[0]]), slots[1])

    def test_accounts_spread_across_posting_hours(self):
        import collections
        import datetime as dt
        from zoneinfo import ZoneInfo
        from bkt_web.autopilot import scheduler
        store.set_config("posting_hours", "[8,10,12,14,17,19]")
        store.set_config("videos_per_day_per_channel", "6")
        store.set_config("slot_jitter_minutes", "0")
        self.sql("DELETE FROM channels")
        self.sql("INSERT INTO channels (id, country) " + " UNION ALL ".join(f"SELECT {i}, 'DE'" for i in range(1, 121)))
        now = dt.datetime(2026, 9, 25, 5, 0, tzinfo=dt.timezone.utc).timestamp()  # 07:00 Berlin, mọi khung còn trước mặt
        hours = collections.Counter(dt.datetime.fromtimestamp(scheduler.next_slot(i, now), ZoneInfo("Europe/Berlin")).hour
                                    for i in range(1, 121))
        self.assertEqual(sorted(hours), [8, 10, 12, 14, 17, 19])
        self.assertEqual(set(hours.values()), {20})  # 120 acc chia đều 6 khung thay vì dồn hết vào 08:00

    def test_jitter_is_fixed_per_account_and_within_bounds(self):
        import datetime as dt
        from zoneinfo import ZoneInfo
        from bkt_web.autopilot import scheduler
        store.set_config("slot_jitter_minutes", "45")
        offsets = {tid: scheduler.slot_offset_seconds(tid) for tid in range(1, 205)}
        self.assertTrue(all(0 <= o <= 45 * 60 and o % 60 == 0 for o in offsets.values()))
        self.assertGreater(len(set(offsets.values())), 30)  # các acc không dồn vào cùng một phút
        self.assertEqual(scheduler.slot_offset_seconds(63), offsets[63])
        now = dt.datetime(2026, 9, 24, 12, 0, tzinfo=dt.timezone.utc).timestamp()
        first = dt.datetime.fromtimestamp(scheduler.free_slots(63, now)[0], ZoneInfo("Europe/Berlin"))
        self.assertEqual(first.minute, offsets[63] // 60)


class MappedChannelsTest(AutopilotTestCase):
    def test_only_mapped_channels_with_matching_yaml(self):
        from bkt_web.autopilot import channels
        self.add_mapping("ch-1", "space", 63)
        self.add_mapping("ch-2", "space", 64)      # YAML nói niche khác → loại
        self.add_mapping("ch-gone", "space", 65)   # không có YAML → loại
        configs = {"ch-1": {"niche_id": "space"}, "ch-2": {"niche_id": "folklore"}, "ch-unmapped": {"niche_id": "space"}}
        with mock.patch.object(channels, "load_matrix_channel_configs", return_value=configs):
            self.assertEqual(channels.mapped_channels_by_niche(), {"space": ["ch-1"]})


class CookieTrackingTest(AutopilotTestCase):
    def test_trigger_records_only_real_cookie_changes(self):
        from bkt_web.autopilot import channels
        self.sql("DROP TABLE channels")
        self.sql("CREATE TABLE channels (id INTEGER PRIMARY KEY, cookie TEXT, cookie_hash TEXT UNIQUE, country TEXT)")
        self.sql("INSERT INTO channels (id, cookie, cookie_hash, country) VALUES (1, 'old', 'h-old', 'DE')")
        channels.ensure_cookie_tracking()
        channels.ensure_cookie_tracking()  # chạy lại không lỗi
        self.assertEqual(channels.cookie_injected_at(1), 0)  # acc có từ trước coi như đã ngâm
        self.sql("UPDATE channels SET cookie='new', cookie_hash='h-new' WHERE id=1")
        stamped = channels.cookie_injected_at(1)
        self.assertAlmostEqual(stamped, time.time(), delta=5)
        self.sql("UPDATE channels SET cookie_injected_at=123 WHERE id=1")
        self.sql("INSERT INTO channels (cookie, cookie_hash) VALUES ('new2', 'h-new') "
                 "ON CONFLICT(cookie_hash) DO UPDATE SET cookie=excluded.cookie")  # import lại cùng cookie
        self.assertEqual(channels.cookie_injected_at(1), 123)
        self.sql("INSERT INTO channels (id, cookie, cookie_hash) VALUES (2, 'c2', 'h2')")
        self.assertGreater(channels.cookie_injected_at(2), 0)


class CaptionTest(AutopilotTestCase):
    def test_caption_uses_kit_text_but_own_hashtags(self):
        from bkt_web.autopilot import captions
        (self.videos / "v1").mkdir()
        (self.videos / "v1" / "meta.json").write_text('{"name": "Die Suwałki-Lücke"}', encoding="utf-8")
        with mock.patch.object(captions.publish_flow, "_kit_caption", return_value={"caption": "Europas Engpass?", "hashtags": "#khoahoc"}):
            caption, tags = captions.build_caption("v1", "geopolitics_maps", "de")
        self.assertEqual(caption, "Europas Engpass?")
        self.assertEqual(tags, "#geopolitics #maps #history #fürdich #wissen #fyp")
        self.assertNotIn("#khoahoc", tags)

    def test_vietnamese_or_empty_caption_falls_back_to_title(self):
        from bkt_web.autopilot import captions
        (self.videos / "v2").mkdir()
        (self.videos / "v2" / "meta.json").write_text('{"name": "Black holes"}', encoding="utf-8")
        for kit in ({"caption": "Hố đen nuốt ánh sáng"}, {"caption": ""}):
            with mock.patch.object(captions.publish_flow, "_kit_caption", return_value=kit):
                self.assertEqual(captions.build_caption("v2", "deep_space", "en")[0], "Black holes")
        with mock.patch.object(captions.publish_flow, "_kit_caption", return_value={"caption": "x" * 5000}):
            caption, tags = captions.build_caption("v2", "deep_space", "ko")
        self.assertLessEqual(len(f"{caption} {tags}"), 2200)
        self.assertIn("#추천", tags)


class ReviveTest(AutopilotTestCase):
    def setUp(self):
        super().setUp()
        self.plan_id = store.create_plan("2026-09-24", "space", "t", 3)
        store.update_plan(self.plan_id, batch_id="b1", status="partial")
        old = 0  # hỏng từ lâu → đã qua thời gian chờ
        self.fake.add_job("j-script", "b1", "ch-a", "s1", state="DEAD_LETTER", error="script gate rejected x: similarity: lexical_overlap")
        self.fake.add_job("j-render", "b1", "ch-b", "s2", state="DEAD_LETTER", engine="vox", error="video QA failed: black frames\n[x] ANGLE renderer")
        self.fake.add_job("j-engine", "b1", "ch-c", "s3", state="DEAD_LETTER", engine="memechart", error="CHART scene 1 requires chart_spec data")
        self.fake.add_job("j-unmapped", "b1", "ch-gone", "s4", state="FAILED", error="render timeout")
        for job in self.fake.jobs.values():
            job["updated_at"] = old
        for patch in (
            mock.patch.object(revive.channels, "mapped_channels_by_niche", return_value={"space": ["ch-a", "ch-b", "ch-c"]}),
            mock.patch.object(revive, "pick_engines", side_effect=lambda ids: {cid: "kinetic" for cid in ids}),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    def test_revives_to_the_right_stage_and_keeps_the_channel(self):
        result = revive.revive_failed_jobs(now=10_000)
        self.assertEqual(result, {"revived": 3, "skipped": 1, "given_up": 0})
        jobs = self.fake.jobs
        self.assertEqual(jobs["j-script"]["revived_with"], ("PLANNING", None, True))
        self.assertEqual(jobs["j-render"]["revived_with"], ("ASSET_QA", None, False))
        self.assertEqual(jobs["j-engine"]["revived_with"], ("SCRIPT_QA", "kinetic", False))
        self.assertEqual(jobs["j-engine"]["channel_id"], "ch-c")  # vẫn đúng kênh → đúng acc
        self.assertEqual(jobs["j-unmapped"]["state"], "FAILED")   # kênh không còn acc → không làm lại
        self.assertEqual(store.get_plan(self.plan_id)["status"], "producing")  # để batch được resume

    def test_blocked_engines_are_not_revived_and_are_passed_to_node(self):
        store.set_config("publish_block_engines", "vox")
        result = revive.revive_failed_jobs(now=10_000)
        self.assertEqual(self.fake.jobs["j-render"]["state"], "DEAD_LETTER")  # vox bị dừng → không dựng lại
        self.assertNotIn("revived_with", self.fake.jobs["j-render"])
        self.assertEqual(result["revived"], 2)
        from bkt_web.autopilot import planner
        self.assertEqual(planner.matrix_env()["MATRIX_BLOCKED_ENGINES"], "vox")
        store.set_config("publish_block_engines", "")

    def test_limits_revives_and_waits_after_failure(self):
        self.fake.jobs["j-script"]["manifest"]["revive_count"] = 2
        self.fake.jobs["j-render"]["updated_at"] = 9_800  # vừa hỏng 200 s trước
        result = revive.revive_failed_jobs(now=10_000)
        self.assertEqual(result["given_up"], 1)
        self.assertEqual(self.fake.jobs["j-script"]["state"], "DEAD_LETTER")
        self.assertEqual(self.fake.jobs["j-render"]["state"], "DEAD_LETTER")
        store.set_config("max_revives", "0")
        self.assertEqual(revive.revive_failed_jobs(now=10_000)["revived"], 0)

    def test_rare_engines_revive_first_and_get_more_attempts(self):
        counts = {"kinetic": 50, "science": 30, "vox": 0}      # vox hiếm, kinetic thì không
        self.fake.jobs["j-render"]["manifest"]["revive_count"] = 2   # vox: 2 < 2*2 → vẫn làm lại
        self.fake.jobs["j-script"]["manifest"]["revive_count"] = 2   # kinetic: 2 >= 2 → bỏ
        order = []
        real = self.fake.revive_job
        self.fake.revive_job = lambda **kw: (order.append(kw["job_id"]), real(**kw))[1]
        result = revive.revive_failed_jobs(now=10_000, counts=counts)
        self.assertEqual(result["given_up"], 1)
        self.assertEqual(self.fake.jobs["j-script"]["state"], "DEAD_LETTER")
        self.assertEqual(order[0], "j-render")                        # thể loại hiếm làm lại trước
        self.assertEqual(self.fake.jobs["j-render"]["revived_with"], ("ASSET_QA", None, False))

    def test_renderable_engines_match_node(self):
        out = subprocess.run(
            ["node", "--input-type=module", "-e",
             'const m = await import("./matrix/render/native-engine-adapter.mjs"); console.log(JSON.stringify(m.RENDERABLE_ENGINES))'],
            cwd=Path(__file__).resolve().parents[1] / "compare_studio", capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(revive.RENDERABLE_ENGINES, set(json.loads(out.stdout.strip().splitlines()[-1])))

    def test_script_rewrite_retires_old_video_dir_but_render_retry_keeps_it(self):
        for slug in ("s1", "s2"):
            (self.videos / slug / "renders").mkdir(parents=True)
            (self.videos / slug / "renders" / f"{slug}.mp4").write_bytes(b"x")
        revive.revive_failed_jobs(now=10_000)
        self.assertFalse((self.videos / "s1").exists())          # kịch bản viết lại → dựng lại từ đầu
        retired = list((store.COMPARE_DIR / ".runtime" / "retired-videos").iterdir())
        self.assertEqual([p.name for p in retired], ["s1-10000"])
        self.assertTrue((self.videos / "s2" / "renders" / "s2.mp4").exists())  # chỉ render lại → giữ MP4 để dùng lại

    def test_classify_uses_first_line_only(self):
        log = ("Command failed: npm run check\n[INFO] [Compiler] Fetched 5 font faces\n"
               '[hyperframes] browserGpuMode probe → software (renderer="ANGLE (Mesa, llvmpipe)") hook rectangle')
        self.assertEqual(revive.classify(log, False), ("ASSET_QA", False))
        self.assertEqual(revive.classify("script gate rejected job: similarity: lexical_overlap", False), ("PLANNING", True))
        self.assertEqual(revive.classify("", False), ("SCRIPT_QA", False))

    def test_classify(self):
        self.assertEqual(revive.classify("bridge task x failed: agent chưa trả kết quả", False), ("PLANNING", True))
        self.assertEqual(revive.classify("job needs a supported native engine", False), ("SCRIPT_QA", False))
        self.assertEqual(revive.classify("video QA failed", True), ("SCRIPT_QA", False))  # đổi engine → làm lại tài nguyên


class CleanupTest(AutopilotTestCase):
    OLD = int(time.time()) - 5 * 86400

    def make_video(self, slug, job_id):
        renders = self.videos / slug / "renders"
        renders.mkdir(parents=True)
        (renders / "final.mp4").write_bytes(b"x" * 10)
        (self.videos / slug / "meta.json").write_text("{}")
        (self.projects / job_id).mkdir()
        self.fake.add_job(job_id, "b", "ch", slug, state="SCHEDULED")

    def add_task(self, slug, status="SUCCESS", uploaded_at=None):
        self.sql("INSERT INTO upload_tasks (channel_id, status, uploaded_at, video_slug) VALUES (63, ?, ?, ?)",
                 (status, self.OLD if uploaded_at is None else uploaded_at, slug))

    def test_skips_without_backup_target(self):
        self.make_video("abc-1", "job-1")
        self.add_task("abc-1")
        result = cleanup.cleanup_posted_videos()
        self.assertTrue(result["skipped"])
        self.assertTrue((self.videos / "abc-1" / "renders" / "final.mp4").exists())

    def test_deletes_exact_project_only(self):
        store.set_config("cleanup_without_backup", "true")
        self.make_video("abc-1", "job-1")
        self.make_video("abc-12", "job-12")
        self.add_task("abc-1")
        result = cleanup.cleanup_posted_videos()
        self.assertEqual(result["archived"], 1)
        self.assertFalse((self.videos / "abc-1" / "renders" / "final.mp4").exists())
        self.assertTrue((self.videos / "abc-1" / "meta.json").exists())
        self.assertFalse((self.projects / "job-1").exists())
        self.assertTrue((self.projects / "job-12").exists())
        self.assertTrue((self.videos / "abc-12" / "renders" / "final.mp4").exists())
        self.assertGreater(self.sql("SELECT archived_at FROM upload_tasks WHERE video_slug='abc-1'")[0][0], 0)

    def test_posted_status_is_success_not_posted(self):
        store.set_config("cleanup_without_backup", "true")
        self.make_video("abc-1", "job-1")
        self.add_task("abc-1", status="POSTED")
        self.assertEqual(cleanup.cleanup_posted_videos()["total_checked"], 0)

    def test_keeps_video_still_queued_for_another_account(self):
        store.set_config("cleanup_without_backup", "true")
        self.make_video("abc-1", "job-1")
        self.add_task("abc-1")
        self.add_task("abc-1", status="QUEUED", uploaded_at=0)
        result = cleanup.cleanup_posted_videos()
        self.assertEqual(result["kept"], 1)
        self.assertTrue((self.videos / "abc-1" / "renders" / "final.mp4").exists())

    def test_failed_backup_keeps_files(self):
        store.set_config("archive_vps_host", "archive")
        self.make_video("abc-1", "job-1")
        self.add_task("abc-1")
        with mock.patch.object(cleanup, "backup_to_vps", return_value=False):
            result = cleanup.cleanup_posted_videos()
        self.assertEqual(result["failed"], 1)
        self.assertTrue((self.videos / "abc-1" / "renders" / "final.mp4").exists())
        self.assertEqual(self.sql("SELECT archived_at FROM upload_tasks")[0][0], 0)

    def test_backup_requires_matching_remote_size(self):
        mp4 = self.videos / "f.mp4"
        mp4.write_bytes(b"x" * 10)
        ok = mock.Mock(returncode=0, stdout="", stderr="")
        with mock.patch.object(cleanup.proc, "run", side_effect=[ok, mock.Mock(returncode=0, stdout="9\n")]):
            self.assertFalse(cleanup.backup_to_vps(mp4, "s", "archive", "/data"))
        with mock.patch.object(cleanup.proc, "run", side_effect=[ok, mock.Mock(returncode=0, stdout="10\n")]):
            self.assertTrue(cleanup.backup_to_vps(mp4, "s", "archive", "/data"))

    def test_failed_jobs_cleanup_skips_jobs_with_upload_tasks(self):
        self.make_video("dead-1", "job-d1")
        self.make_video("dead-2", "job-d2")
        for job_id in ("job-d1", "job-d2"):
            self.fake.jobs[job_id].update(state="FAILED", updated_at=self.OLD - 10 * 86400)
        self.add_task("dead-2", status="NEEDS_CHECK", uploaded_at=0)
        result = cleanup.cleanup_failed_jobs()
        self.assertEqual(result["cleaned"], 1)
        self.assertFalse((self.projects / "job-d1").exists())
        self.assertTrue((self.projects / "job-d2").exists())


# ---------------------------------------------------------------------------
# Cycle + subprocess
# ---------------------------------------------------------------------------

class HousekeepingTest(AutopilotTestCase):
    def test_rclone_backup_verifies_size_and_is_preferred_over_vps(self):
        import tempfile, types
        from unittest import mock
        from bkt_web.autopilot import cleanup, store as st
        with tempfile.TemporaryDirectory() as tmp:
            mp4 = Path(tmp) / "v.mp4"
            mp4.write_bytes(b"x" * 1234)
            calls = []
            def fake_run(args, **kw):
                calls.append(args)
                if args[1] == "lsjson":
                    return types.SimpleNamespace(returncode=0, stdout='[{"Size": %d}]' % size, stderr="")
                return types.SimpleNamespace(returncode=0, stdout="", stderr="")
            size = 1234
            with mock.patch.object(cleanup.proc, "run", fake_run):
                self.assertTrue(cleanup.backup_to_rclone(mp4, "slug-1", "gdrive:TokMatrix/archive"))
            self.assertEqual(calls[0][:4], ["rclone", "copyto", str(mp4), "gdrive:TokMatrix/archive/slug-1/v.mp4"])
            size = 99  # kích thước trên Drive lệch → không được coi là đã backup
            with mock.patch.object(cleanup.proc, "run", fake_run):
                self.assertFalse(cleanup.backup_to_rclone(mp4, "slug-1", "gdrive:TokMatrix/archive"))
        st.set_config("archive_vps_host", "vps2")
        self.assertIsNotNone(cleanup.archive_target())
        st.set_config("archive_rclone_remote", "gdrive:TokMatrix/archive")
        with mock.patch.object(cleanup, "backup_to_rclone", return_value=True) as rc, mock.patch.object(cleanup, "backup_to_vps") as vps:
            self.assertTrue(cleanup.archive_target()(Path("/x.mp4"), "s"))
            rc.assert_called_once()
            vps.assert_not_called()
        for bad in ("gdrive", "-flag:x", ":local"):
            with self.assertRaises(ValueError):
                st.validate_config("archive_rclone_remote", bad)

    def test_profile_blobs_old_files_only_and_skip_open_profiles(self):
        import tempfile, os, time
        from bkt_web.autopilot import housekeeping
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            now = time.time()
            def mk(rel, age_h):
                f = root / rel
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(b"x" * 100)
                os.utime(f, (now - age_h * 3600, now - age_h * 3600))
                return f
            old = mk("channel_1/Default/blob_storage/u/1", 48)
            fresh = mk("channel_1/Default/blob_storage/u/2", 1)
            idb = mk("channel_1/Default/IndexedDB/https_www.tiktok.com_0.indexeddb.blob/1/00/a", 48)
            leveldb = mk("channel_1/Default/IndexedDB/https_www.tiktok.com_0.indexeddb.leveldb/000003.log", 48)
            cookies = mk("channel_1/Default/Cookies", 48)
            busy = mk("channel_2/Default/blob_storage/u/1", 48)
            out = housekeeping.clean_profile_blobs(24, now, root=root, in_use={"channel_2"})
            self.assertEqual(out["files"], 2)
            self.assertFalse(old.exists())
            self.assertFalse(idb.exists())
            for kept in (fresh, leveldb, cookies, busy):
                self.assertTrue(kept.exists(), kept)
            self.assertEqual(housekeeping.clean_profile_blobs(0, now, root=root, in_use=set())["files"], 0)

    def test_profile_in_use_parsing_handles_spaces_and_lock(self):
        import tempfile, os, time
        from bkt_web.autopilot import housekeeping
        args = ["chrome", "--user-data-dir=/Users/x/SSMATool Tiktok/bkt_web/profiles/My Channel", "--foo",
                "--user-data-dir", "/opt/t/profiles/channel_9/"]
        self.assertEqual(housekeeping._user_data_profiles(args), {"My Channel", "channel_9"})
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            now = time.time()
            f = root / "ch" / "Default" / "blob_storage" / "1"
            f.parent.mkdir(parents=True)
            f.write_bytes(b"x")
            os.utime(f, (now - 48 * 3600,) * 2)
            os.symlink("host-123", root / "ch" / "SingletonLock")
            self.assertEqual(housekeeping.clean_profile_blobs(24, now, root=root, in_use=set())["files"], 0)
            self.assertTrue(f.exists())

    def setUp(self):
        super().setUp()
        root = Path(self.tmp.name)
        self.archive, self.generated, self.npx = root / "archive", root / "generated", root / "npx"
        for folder in (self.archive, self.generated, self.npx):
            folder.mkdir()
        for name, value in (("BRIDGE_ARCHIVE", self.archive), ("GENERATED_IMAGES", self.generated), ("NPX_DIR", self.npx)):
            patch = mock.patch.object(housekeeping, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.now = time.time()

    def write(self, path, data=b"x", age_hours=0):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        stamp = self.now - age_hours * 3600
        import os
        os.utime(path, (stamp, stamp))
        return path

    def test_bridge_archive_removes_only_old_files(self):
        old = self.write(self.archive / "old.png", age_hours=13)
        new = self.write(self.archive / "new.png", age_hours=1)
        result = housekeeping.clean_bridge_archive(12, self.now)
        self.assertEqual(result["files"], 1)
        self.assertFalse(old.exists())
        self.assertTrue(new.exists())

    def test_generated_images_removed_only_when_copied_into_a_video(self):
        copied = self.write(self.generated / "a.png", b"same-bytes", age_hours=30)
        self.write(self.videos / "v1" / "assets" / "images" / "scene-1.png", b"same-bytes")
        other = self.write(self.generated / "b.png", b"diff-bytes", age_hours=30)  # cùng cỡ, khác nội dung
        self.write(self.videos / "v1" / "assets" / "images" / "scene-2.png", b"DIFF-bytes")
        fresh = self.write(self.generated / "c.png", b"same-bytes", age_hours=2)
        result = housekeeping.clean_generated_images(1, self.now)
        self.assertFalse(copied.exists())
        self.assertTrue(other.exists())
        self.assertTrue(fresh.exists())
        self.assertEqual((result["files"], result["kept_unique"]), (1, 1))

    def test_posted_media_keeps_meta_and_fingerprint(self):
        video = self.videos / "v1"
        self.write(video / "meta.json", b"{}")
        mp4 = self.write(video / "renders" / "v1.mp4", b"mp4")
        self.write(video / "assets" / "images" / "scene-1.png")
        self.fake.add_job("j1", "b1", "ch", "v1", state="SCHEDULED")
        project = self.projects / "j1"
        self.write(project / "manifest.json")
        old = int(self.now - 4 * 86400)
        self.sql("INSERT INTO upload_tasks(id, channel_id, status, uploaded_at, video_slug) VALUES (1, 63, 'SUCCESS', ?, 'v1')", (old,))
        with mock.patch.object(video_fingerprint, "get_or_compute", return_value={}) as fp:
            result = housekeeping.purge_posted_media(3, self.now, lambda: False)
        fp.assert_called_once()
        self.assertEqual(result["videos"], 1)
        self.assertFalse(mp4.exists())
        self.assertFalse((video / "assets").exists())
        self.assertFalse(project.exists())
        self.assertTrue((video / "meta.json").exists())
        self.assertGreater(self.sql("SELECT archived_at FROM upload_tasks WHERE id=1")[0][0], 0)

    def test_posted_media_skips_recent_or_still_needed(self):
        self.write(self.videos / "v1" / "renders" / "v1.mp4")
        self.write(self.videos / "v2" / "renders" / "v2.mp4")
        old, recent = int(self.now - 4 * 86400), int(self.now - 86400)
        self.sql("INSERT INTO upload_tasks(id, channel_id, status, uploaded_at, video_slug) VALUES (1, 63, 'SUCCESS', ?, 'v1')", (old,))
        self.sql("INSERT INTO upload_tasks(id, channel_id, status, uploaded_at, video_slug) VALUES (2, 64, 'QUEUED', 0, 'v1')")
        self.sql("INSERT INTO upload_tasks(id, channel_id, status, uploaded_at, video_slug) VALUES (3, 63, 'SUCCESS', ?, 'v2')", (recent,))
        with mock.patch.object(video_fingerprint, "get_or_compute", return_value={}):
            result = housekeeping.purge_posted_media(3, self.now, lambda: False)
        self.assertEqual(result["videos"], 0)
        self.assertTrue((self.videos / "v1" / "renders" / "v1.mp4").exists())

    def test_posted_media_kept_when_fingerprint_fails(self):
        self.write(self.videos / "v1" / "renders" / "v1.mp4")
        self.sql("INSERT INTO upload_tasks(id, channel_id, status, uploaded_at, video_slug) VALUES (1, 63, 'SUCCESS', ?, 'v1')",
                 (int(self.now - 5 * 86400),))
        with mock.patch.object(video_fingerprint, "get_or_compute", side_effect=RuntimeError("ffmpeg")):
            result = housekeeping.purge_posted_media(3, self.now, lambda: False)
        self.assertEqual(result["videos"], 0)
        self.assertTrue((self.videos / "v1" / "renders" / "v1.mp4").exists())

    def npx_entry(self, name, version):
        self.write(self.npx / name / "package.json", json.dumps({"dependencies": {"hyperframes": version}}).encode())
        self.write(self.npx / name / "node_modules" / "big.bin", b"0" * 100)

    def test_npx_keeps_newest_pinned_and_running_versions(self):
        self.npx_entry("aaaaaaaaaaaaaaaa", "0.7.58")   # code ghim
        self.npx_entry("bbbbbbbbbbbbbbbb", "0.8.10")   # bị xoá
        self.npx_entry("cccccccccccccccc", "0.8.77")
        self.npx_entry("ffffffffffffffff", "0.8.78")
        self.npx_entry("dddddddddddddddd", "0.6.1")    # thư mục đang chạy
        self.npx_entry("1111111111111111", "0.5.0")    # phiên bản đang chạy (npm exec hyperframes@0.5.0)
        self.write(self.npx / "eeeeeeeeeeeeeeee" / "package.json", b'{"dependencies": {"other": "1.0.0"}}')
        with mock.patch.object(housekeeping, "_npx_in_use", return_value={"dddddddddddddddd", "0.5.0"}), \
                mock.patch.object(housekeeping, "_pinned_versions", return_value={(0, 7, 58)}):
            result = housekeeping.clean_npx(2)
        self.assertEqual(result["dirs"], 1)
        self.assertFalse((self.npx / "bbbbbbbbbbbbbbbb").exists())
        self.assertEqual(len(list(self.npx.iterdir())), 6)

    def test_pinned_versions_found_in_source(self):
        self.assertIn((0, 7, 58), housekeeping._pinned_versions())

    def test_run_respects_interval_and_zero_disables(self):
        self.write(self.archive / "old.png", age_hours=20)
        store.set_config("bridge_archive_keep_hours", "0")
        with mock.patch.object(housekeeping, "_last_run", 0.0):
            first = housekeeping.run(now=self.now)
            self.assertTrue((self.archive / "old.png").exists())
            self.assertTrue(housekeeping.run(now=self.now + 60)["skipped"])
            store.set_config("bridge_archive_keep_hours", "12")
            forced = housekeeping.run(now=self.now + 60, force=True)
        self.assertEqual(first["bridge_archive"]["files"], 0)
        self.assertEqual(forced["bridge_archive"]["files"], 1)


class CycleTest(AutopilotTestCase):
    def test_low_disk_skips_production(self):
        calls = []
        for patch in (
            mock.patch.object(cycle.planner, "recover_plans", return_value={}),
            mock.patch.object(cycle.unique_skins, "ensure", return_value={}),
            mock.patch.object(cycle.planner, "ensure_daily_plan", return_value={}),
            mock.patch.object(cycle.planner, "launch_pending_plans", side_effect=lambda *a, **k: calls.append("produce")),
            mock.patch.object(cycle.publisher, "publish_ready_jobs",
                              return_value={"published": 0, "deferred": 0, "blocked": 0, "errors": 0, "recovered": 0}),
            mock.patch.object(cycle, "run_cleanup", return_value={}),
            mock.patch.object(cycle.cleanup, "disk_status", return_value={"free_gb": 1, "min_free_gb": 10, "low": True}),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        summary = cycle.run_cycle(lambda: False, lambda step: None)
        self.assertEqual(summary["produce"], {"skipped": "low_disk"})
        self.assertEqual(calls, [])
        cycle.run_cleanup.assert_called_once()

    def test_halt_between_steps(self):
        steps = []
        with mock.patch.object(cycle.planner, "recover_plans", return_value={}):
            with self.assertRaises(store.Halted):
                cycle.run_cycle(lambda: len(steps) >= 1, steps.append)
        self.assertEqual(steps, ["recover"])


class ProcTest(unittest.TestCase):
    def test_halt_kills_long_subprocess(self):
        flag = threading.Event()
        threading.Timer(0.3, flag.set).start()
        started = time.monotonic()
        with self.assertRaises(store.Halted):
            proc.run([sys.executable, "-c", "import time; time.sleep(30)"], timeout=60, should_halt=flag.is_set)
        self.assertLess(time.monotonic() - started, 10)

    def test_returns_output(self):
        result = proc.run([sys.executable, "-c", "print('hi')"], timeout=30)
        self.assertEqual((result.returncode, result.stdout.strip()), (0, "hi"))


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class EngineTest(AutopilotTestCase):
    def setUp(self):
        super().setUp()
        self.calls = []
        self.gate = threading.Event()
        self.gate.set()

        def cycle_fn(should_halt, set_step):
            self.calls.append(time.monotonic())
            set_step("work")
            while not self.gate.is_set():
                if should_halt():
                    raise store.Halted("halt")
                time.sleep(0.01)
            return {"ok": True}

        self.engine = engine.AutopilotEngine(cycle_fn, max_wait=0.05)
        self.addCleanup(lambda: self.engine.stop(timeout=5))

    def wait_for(self, predicate, timeout=3.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            time.sleep(0.01)
        return False

    def test_disabled_daemon_does_not_run(self):
        self.assertTrue(self.engine.start())
        self.assertTrue(self.wait_for(lambda: self.engine.state == engine.State.DISABLED))
        time.sleep(0.15)
        self.assertEqual(self.calls, [])

    def test_first_cycle_runs_immediately_when_enabled(self):
        store.set_config("enabled", "true")
        self.engine.start()
        self.assertTrue(self.wait_for(lambda: len(self.calls) == 1))
        self.assertTrue(self.wait_for(lambda: self.engine.state == engine.State.IDLE))
        runs = store.list_runs()
        self.assertEqual((runs[0]["trigger"], runs[0]["status"]), ("schedule", "ok"))
        self.assertIsNotNone(self.engine.snapshot()["next_run_at"])

    def test_concurrent_run_is_busy(self):
        self.gate.clear()
        self.engine.run_cycle_in_background("manual")
        self.assertTrue(self.wait_for(lambda: self.engine.state == engine.State.RUNNING))
        with self.assertRaises(engine.Busy):
            self.engine.run_cycle("manual")
        with self.assertRaises(engine.Busy):
            self.engine.run_exclusive(lambda halt: {}, "publish")
        self.gate.set()
        self.assertTrue(self.wait_for(lambda: self.engine.state == engine.State.STOPPED))

    def test_pause_halts_running_cycle_and_persists(self):
        store.set_config("enabled", "true")
        self.gate.clear()
        self.engine.start()
        self.assertTrue(self.wait_for(lambda: self.engine.snapshot()["current_step"] == "work"))
        self.engine.pause()
        self.assertTrue(self.wait_for(lambda: self.engine.state == engine.State.PAUSED))
        self.assertEqual(store.list_runs()[0]["status"], "halted")
        self.assertEqual(store.get_config("paused"), "true")
        with self.assertRaises(engine.Busy):
            self.engine.run_cycle("manual")
        self.gate.set()
        self.engine.next_run_at = 0
        self.engine.resume()
        self.assertTrue(self.wait_for(lambda: len(self.calls) == 2))

    def test_stop_interrupts_and_start_again(self):
        store.set_config("enabled", "true")
        self.gate.clear()
        self.engine.start()
        self.assertTrue(self.wait_for(lambda: len(self.calls) == 1))
        self.assertTrue(self.engine.stop(timeout=5))
        self.assertEqual(self.engine.state, engine.State.STOPPED)
        self.assertEqual(store.list_runs()[0]["status"], "halted")
        self.gate.set()
        self.engine.next_run_at = 0
        self.assertTrue(self.engine.start())
        self.assertTrue(self.wait_for(lambda: len(self.calls) == 2))
        self.assertEqual(sum(t.name == engine.THREAD_NAME and t.is_alive() for t in threading.enumerate()), 1)

    def test_manual_run_after_stop_is_not_halted(self):
        self.engine.start()
        self.engine.stop(timeout=5)
        self.assertEqual(self.engine.run_cycle("manual")["status"], "ok")

    def test_cycle_error_is_recorded_and_daemon_survives(self):
        def broken(should_halt, set_step):
            raise KeyError("boom")

        eng = engine.AutopilotEngine(broken, max_wait=0.05)
        self.addCleanup(lambda: eng.stop(timeout=5))
        result = eng.run_cycle("manual")
        self.assertEqual(result["status"], "error")
        self.assertIn("boom", eng.snapshot()["last_error"])
        self.assertEqual(store.list_runs()[0]["status"], "error")

    def test_interrupted_runs_marked_on_start(self):
        run_id = store.start_run("schedule")
        self.engine.start()
        self.assertEqual({r["id"]: r["status"] for r in store.list_runs()}[run_id], "interrupted")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

class RoutesTest(AutopilotTestCase):
    def setUp(self):
        super().setUp()
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from bkt_web import autopilot, autopilot_routes

        self.engine = engine.AutopilotEngine(lambda halt, step: {}, max_wait=0.05)
        patch = mock.patch.object(autopilot, "ENGINE", self.engine)
        patch.start()
        self.addCleanup(patch.stop)
        self.addCleanup(lambda: self.engine.stop(timeout=5))
        app = FastAPI()
        app.include_router(autopilot_routes.router)
        self.client = TestClient(app)

    def test_invalid_config_is_rejected(self):
        response = self.client.post("/api/autopilot/config", json={"config": {"plan_hour": "3", "enabled": "maybe"}})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(store.get_config("plan_hour"), "0")  # không ghi nửa chừng

    def test_put_config_uses_url_key(self):
        response = self.client.put("/api/autopilot/config/plan_hour", json={"key": "enabled", "value": "true"})
        self.assertEqual(response.status_code, 400)
        response = self.client.put("/api/autopilot/config/plan_hour", json={"value": "6"})
        self.assertEqual((response.status_code, store.get_config("plan_hour")), (200, "6"))

    def test_busy_returns_409(self):
        self.engine._cycle_lock.acquire()
        try:
            self.assertEqual(self.client.post("/api/autopilot/run-now").status_code, 409)
            self.assertEqual(self.client.post("/api/autopilot/publish-ready").status_code, 409)
        finally:
            self.engine._cycle_lock.release()

    def test_pause_resume_and_status(self):
        self.assertEqual(self.client.post("/api/autopilot/pause").json()["status"]["paused"], True)
        self.assertEqual(self.client.post("/api/autopilot/run-now").status_code, 409)
        self.assertEqual(self.client.post("/api/autopilot/resume").json()["status"]["paused"], False)
        self.assertEqual(self.client.post("/api/autopilot/run-now").status_code, 202)

    def test_start_clears_persisted_pause(self):
        store.set_config("paused", "true")  # còn lại từ trước khi restart
        response = self.client.post("/api/autopilot/start")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(store.get_config("paused"), "false")
        self.assertEqual(store.get_config("enabled"), "true")
        self.assertFalse(response.json()["status"]["paused"])

    def test_retry_only_failed_plan(self):
        plan_id = store.create_plan("2026-09-24", "space", "t", 1)
        self.assertEqual(self.client.post(f"/api/autopilot/plans/{plan_id}/retry").status_code, 409)
        store.update_plan(plan_id, status="failed", batch_id="b1")
        response = self.client.post(f"/api/autopilot/plans/{plan_id}/retry")
        self.assertEqual(response.json()["plan"]["status"], "planned")
        self.assertEqual(response.json()["plan"]["batch_id"], "b1")


if __name__ == "__main__":
    unittest.main()


class VoiceLanguageTest(unittest.TestCase):
    def test_edge_prefix_and_capcut_catalog(self):
        from bkt_web.autopilot import safety
        self.assertEqual(safety.voice_languages("de-DE-KatjaNeural"), {"de"})
        self.assertIn("de", safety.voice_languages("DiT_de_female_jiangshi"))
        self.assertEqual(safety.voice_languages("no_such_voice_xyz"), set())
