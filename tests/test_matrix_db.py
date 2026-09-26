import hashlib
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bkt_web import matrix_db


class MatrixDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "matrix_factory.db"
        matrix_db.init_db(self.db_path)
        matrix_db.register_topic(topic_id="topic-1", title="Test topic", niche_id="deep_space", db_path=self.db_path)
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """INSERT INTO channels(channel_id,niche_id,channel_name,persona_tone,preferred_voice_id,
                   visual_style_id,created_at) VALUES('space_01','deep_space','Space 01','academic',
                   'vi-VN-NamMinhNeural','cosmic_space_v1',1)"""
        )
        conn.commit()
        conn.close()
        matrix_db.create_batch(batch_id="batch-1", topic_id="topic-1", total_jobs=1, db_path=self.db_path)
        self.create_job()

    def tearDown(self):
        self.temp.cleanup()

    def create_job(self, **overrides):
        params = {
            "job_id": "job-1", "batch_id": "batch-1", "channel_id": "space_01",
            "topic_id": "topic-1", "engine_type": "science", "video_slug": "test-video",
            "total_scenes": 12, "max_retries": 2, "manifest": {"scenes": []}, "db_path": self.db_path,
        }
        params.update(overrides)
        return matrix_db.create_job(**params)

    def test_revive_job_resets_a_dead_job_for_the_same_channel(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("UPDATE content_jobs SET state='DEAD_LETTER', retry_count=4, error_message='CHART scene 1 requires chart_spec data', "
                     "manifest_json=? WHERE job_id='job-1'", ('{"script": {"scenes": [1]}, "scenes": [1], "channel": {"engine_type": "tierlist"}}',))
        conn.commit()
        conn.close()
        with self.assertRaises(ValueError):
            matrix_db.revive_job(job_id="job-1", to_state="RENDERING", db_path=self.db_path)
        job = matrix_db.revive_job(job_id="job-1", to_state="SCRIPT_QA", engine_type="kinetic", db_path=self.db_path)
        self.assertEqual((job["state"], job["retry_count"], job["error_message"]), ("SCRIPT_QA", 0, None))
        self.assertEqual((job["engine_type"], job["channel_id"], job["video_slug"]), ("kinetic", "space_01", "test-video"))
        self.assertEqual(job["manifest"]["revive_count"], 1)
        self.assertEqual(job["manifest"]["channel"]["engine_type"], "kinetic")
        self.assertIn("script", job["manifest"])  # SCRIPT_QA giữ kịch bản
        with self.assertRaises(ValueError):  # job đang sống thì không revive
            matrix_db.revive_job(job_id="job-1", to_state="PLANNING", db_path=self.db_path)
        conn = sqlite3.connect(self.db_path)
        conn.execute("UPDATE content_jobs SET state='FAILED' WHERE job_id='job-1'")
        conn.commit()
        conn.close()
        job = matrix_db.revive_job(job_id="job-1", to_state="PLANNING", drop_script=True, db_path=self.db_path)
        self.assertNotIn("script", job["manifest"])
        self.assertEqual(job["manifest"]["revive_count"], 2)

    def test_autopilot_lookup_helpers(self):
        self.assertEqual(matrix_db.job_niche_ids("job-1", db_path=self.db_path),
                         {"channel_niche": "deep_space", "topic_niche": "deep_space"})
        self.assertEqual(matrix_db.job_niche_ids("missing", db_path=self.db_path),
                         {"channel_niche": None, "topic_niche": None})
        self.assertEqual(matrix_db.get_job_by_slug("test-video", db_path=self.db_path)["job_id"], "job-1")
        self.assertIsNone(matrix_db.get_job_by_slug("other", db_path=self.db_path))
        self.assertEqual(matrix_db.list_topics("deep_space", db_path=self.db_path), ["Test topic"])
        created = matrix_db.get_job("job-1", db_path=self.db_path)
        jobs = matrix_db.list_jobs_in_states({created["state"]}, updated_before=created["updated_at"] + 1, db_path=self.db_path)
        self.assertEqual([j["job_id"] for j in jobs], ["job-1"])
        self.assertEqual(matrix_db.list_jobs_in_states({"FAILED"}, updated_before=2**31, db_path=self.db_path), [])
        self.assertEqual(matrix_db.list_jobs_in_states({"NOT_A_STATE"}, updated_before=2**31, db_path=self.db_path), [])

    def test_schema_contains_seven_matrix_tables(self):
        conn = sqlite3.connect(self.db_path)
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        conn.close()
        self.assertTrue({"topics", "channels", "content_registry", "content_jobs", "batches", "scene_artifacts", "analytics_snapshots"}.issubset(tables))

    def test_legacy_jobs_table_gains_lease_columns_without_losing_rows(self):
        legacy_path = Path(self.temp.name) / "legacy_factory.db"
        conn = sqlite3.connect(legacy_path)
        conn.execute(
            """CREATE TABLE content_jobs (
                job_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, channel_id TEXT NOT NULL,
                topic_id TEXT NOT NULL, engine_type TEXT NOT NULL, state TEXT NOT NULL,
                current_scene_index INTEGER DEFAULT 0, total_scenes INTEGER DEFAULT 12,
                completed_scenes_mask TEXT DEFAULT '', video_slug TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 3, error_message TEXT,
                cost_tokens INTEGER DEFAULT 0, cost_images INTEGER DEFAULT 0, manifest_json TEXT,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
            )"""
        )
        conn.execute(
            "INSERT INTO content_jobs(job_id,batch_id,channel_id,topic_id,engine_type,state,video_slug,created_at,updated_at) VALUES('legacy-job','batch-old','space_01','topic-1','science','SCRIPTING','old-video',1,1)"
        )
        conn.commit()
        conn.close()

        matrix_db.init_db(legacy_path)
        conn = sqlite3.connect(legacy_path)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(content_jobs)")}
        row = conn.execute("SELECT state FROM content_jobs WHERE job_id='legacy-job'").fetchone()
        conn.close()
        self.assertTrue({"locked_by", "locked_at", "lease_expires_at", "heartbeat_at", "next_retry_at", "initial_manifest_hash", "resume_state"}.issubset(columns))
        self.assertEqual(row[0], "SCRIPTING")

    def test_expired_lease_can_be_reclaimed_but_old_worker_cannot_heartbeat(self):
        first = matrix_db.claim_next_job(worker_id="worker-a", lease_seconds=10, now=100, db_path=self.db_path)
        self.assertEqual(first["locked_by"], "worker-a")
        self.assertFalse(matrix_db.heartbeat_job(job_id="job-1", worker_id="worker-a", lease_seconds=10, now=111, db_path=self.db_path))
        second = matrix_db.claim_next_job(worker_id="worker-b", lease_seconds=10, now=111, db_path=self.db_path)
        self.assertEqual(second["locked_by"], "worker-b")

    def test_two_workers_cannot_claim_the_same_job(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(
                lambda worker: matrix_db.claim_next_job(worker_id=worker, db_path=self.db_path),
                ("worker-a", "worker-b"),
            ))
        claimed = [job for job in claims if job is not None]
        self.assertEqual(len(claimed), 1)
        self.assertEqual(claimed[0]["job_id"], "job-1")
        self.assertIn(claimed[0]["locked_by"], {"worker-a", "worker-b"})
        self.assertIsNone(matrix_db.claim_next_job(worker_id="worker-c", db_path=self.db_path))

    def test_waiting_for_external_assets_defers_without_spending_retry_budget(self):
        claimed = matrix_db.claim_next_job(worker_id="worker-a", lease_seconds=300, now=100, db_path=self.db_path)
        matrix_db.transition_job(job_id="job-1", to_state="PLANNING", worker_id="worker-a", now=110, db_path=self.db_path)
        waiting = matrix_db.defer_job(job_id="job-1", worker_id="worker-a", delay_seconds=10, now=120, db_path=self.db_path)
        self.assertEqual(waiting["state"], "RETRY_WAIT")
        self.assertEqual(waiting["retry_count"], 0)
        self.assertEqual(waiting["resume_state"], "PLANNING")
        self.assertIsNone(matrix_db.claim_next_job(worker_id="worker-b", states=["PLANNING"], now=129, db_path=self.db_path))
        resumed = matrix_db.claim_next_job(worker_id="worker-b", states=["PLANNING"], now=130, db_path=self.db_path)
        self.assertEqual(resumed["state"], "PLANNING")
        self.assertEqual(resumed["retry_count"], 0)

    def test_state_machine_lease_heartbeat_and_retry_backoff(self):
        job = matrix_db.claim_next_job(worker_id="worker-a", lease_seconds=300, now=100, db_path=self.db_path)
        self.assertEqual(job["state"], "CREATED")
        self.assertTrue(matrix_db.heartbeat_job(job_id="job-1", worker_id="worker-a", lease_seconds=300, now=110, db_path=self.db_path))
        with self.assertRaisesRegex(ValueError, "invalid job transition"):
            matrix_db.transition_job(job_id="job-1", to_state="READY_TO_RENDER", worker_id="worker-a", now=110, db_path=self.db_path)
        matrix_db.transition_job(job_id="job-1", to_state="PLANNING", worker_id="worker-a", expected_state="CREATED", now=110, db_path=self.db_path)
        waiting = matrix_db.retry_job(job_id="job-1", worker_id="worker-a", error_message="temporary", base_delay_seconds=5, now=200, db_path=self.db_path)
        self.assertEqual(waiting["state"], "RETRY_WAIT")
        self.assertEqual(waiting["resume_state"], "PLANNING")
        self.assertEqual(waiting["next_retry_at"], 205)
        self.assertIsNone(matrix_db.claim_next_job(worker_id="worker-b", now=204, db_path=self.db_path))
        resumed = matrix_db.claim_next_job(worker_id="worker-b", now=205, db_path=self.db_path)
        self.assertEqual(resumed["state"], "PLANNING")
        self.assertEqual(resumed["retry_count"], 1)

    def test_exhausted_retries_go_to_dead_letter_and_update_batch(self):
        job = matrix_db.claim_next_job(worker_id="worker-a", now=300, db_path=self.db_path)
        matrix_db.retry_job(job_id=job["job_id"], worker_id="worker-a", error_message="persistent", now=300, db_path=self.db_path)
        job = matrix_db.claim_next_job(worker_id="worker-b", now=330, db_path=self.db_path)
        matrix_db.retry_job(job_id=job["job_id"], worker_id="worker-b", error_message="persistent", now=330, db_path=self.db_path)
        job = matrix_db.claim_next_job(worker_id="worker-c", now=390, db_path=self.db_path)
        dead = matrix_db.retry_job(job_id=job["job_id"], worker_id="worker-c", error_message="persistent", now=390, db_path=self.db_path)
        self.assertEqual(dead["state"], "DEAD_LETTER")
        conn = sqlite3.connect(self.db_path)
        status = conn.execute("SELECT status,failed_jobs FROM batches WHERE batch_id='batch-1'").fetchone()
        conn.close()
        self.assertEqual(status, ("PARTIAL_FAILED", 1))

    def test_mutable_job_manifest_keeps_immutable_initial_hash(self):
        original = matrix_db.get_job("job-1", db_path=self.db_path)
        claimed = matrix_db.claim_next_job(worker_id="worker-a", db_path=self.db_path)
        updated = matrix_db.update_job_manifest(
            job_id="job-1", worker_id=claimed["locked_by"], manifest={"scenes": [], "asset_pipeline": {"pending_count": 1}},
            db_path=self.db_path,
        )
        self.assertEqual(updated["initial_manifest_hash"], original["initial_manifest_hash"])
        self.assertEqual(updated["manifest"]["asset_pipeline"]["pending_count"], 1)
        self.assertEqual(self.create_job()["manifest"], updated["manifest"])
        with self.assertRaisesRegex(ValueError, "different immutable parameters"):
            self.create_job(manifest={"scenes": [{"line": "changed"}]})
        self.assertEqual(matrix_db.get_batch("batch-1", db_path=self.db_path)["total_jobs"], 1)
        self.assertEqual(len(matrix_db.list_batch_jobs("batch-1", db_path=self.db_path)), 1)

    def test_claim_batch_filter_leaves_other_batches_untouched(self):
        matrix_db.create_batch(batch_id="batch-2", topic_id="topic-1", total_jobs=1, db_path=self.db_path)
        matrix_db.create_job(
            job_id="job-2", batch_id="batch-2", channel_id="space_01", topic_id="topic-1",
            engine_type="science", video_slug="science-space-01-test", manifest={"id": 2}, db_path=self.db_path,
        )
        claimed = matrix_db.claim_next_job(
            worker_id="worker-a", states=["CREATED"], batch_id="batch-2", db_path=self.db_path,
        )
        self.assertEqual(claimed["job_id"], "job-2")
        self.assertIsNone(matrix_db.claim_next_job(
            worker_id="worker-b", states=["CREATED"], batch_id="batch-2", db_path=self.db_path,
        ))
        self.assertEqual(matrix_db.get_job("job-1", db_path=self.db_path)["state"], "CREATED")

    def test_claim_state_filter_respects_retry_resume_stage(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "UPDATE content_jobs SET state='RETRY_WAIT',resume_state='READY_TO_RENDER',next_retry_at=0 WHERE job_id='job-1'"
        )
        conn.commit()
        conn.close()
        self.assertIsNone(matrix_db.claim_next_job(worker_id="worker-a", states=["CREATED"], db_path=self.db_path))
        ready = matrix_db.claim_next_job(worker_id="worker-b", states=["READY_TO_RENDER"], db_path=self.db_path)
        self.assertEqual(ready["state"], "READY_TO_RENDER")

    def test_video_qa_retry_resumes_render_stage(self):
        matrix_db.claim_next_job(worker_id="worker-a", lease_seconds=300, now=100, db_path=self.db_path)
        conn = sqlite3.connect(self.db_path)
        conn.execute("UPDATE content_jobs SET state='VIDEO_QA' WHERE job_id='job-1'")
        conn.commit()
        conn.close()
        waiting = matrix_db.retry_job(
            job_id="job-1", worker_id="worker-a", resume_state="RENDERING", error_message="Video QA rejected output",
            base_delay_seconds=5, now=110, db_path=self.db_path,
        )
        self.assertEqual(waiting["resume_state"], "RENDERING")
        resumed = matrix_db.claim_next_job(worker_id="worker-b", states=["RENDERING"], now=115, db_path=self.db_path)
        self.assertEqual(resumed["state"], "RENDERING")

    def test_registry_requires_both_qa_gates_and_searches_by_niche(self):
        entry = {
            "content_id": "content-1", "channel_id": "space_01", "topic_id": "topic-1",
            "angle_title": "A distinct angle", "hook_text": "A question", "blueprint_id": "science_explainer",
            "engine_type": "science", "full_script": "Known facts, clearly explained.", "source_job_id": "job-1",
            "similarity_decision": "PASS", "similarity_policy_version": 1, "similarity_threshold": 0.62,
            "similarity_score": 0.1, "script_qa_status": "PASS", "script_qa_score": 100,
        }
        with self.assertRaisesRegex(ValueError, "only similarity and script-QA PASS"):
            matrix_db.create_registry_entry(entry={**entry, "similarity_decision": "REJECT"}, db_path=self.db_path)
        matrix_db.create_registry_entry(entry=entry, db_path=self.db_path)
        matrix_db.create_registry_entry(entry=entry, db_path=self.db_path)
        found = matrix_db.search_registry(niche_id="deep_space", db_path=self.db_path)
        self.assertEqual(len(found), 1)
        self.assertEqual(matrix_db.search_registry(niche_id="deep_space", exclude_source_job_id="job-1", db_path=self.db_path), [])
        self.assertEqual(found[0]["similarity_policy_version"], 1)
        self.assertEqual(found[0]["script_qa_score"], 100)
        self.assertEqual(matrix_db.search_registry(niche_id="unsolved_mysteries", db_path=self.db_path), [])

    def test_scene_artifact_checksum_and_mask_are_persisted(self):
        artifact = Path(self.temp.name) / "scene-01.bin"
        artifact.write_bytes(b"scene one")
        row = matrix_db.record_scene_artifact(
            job_id="job-1", scene_index=1, artifact_type="image", file_path=str(artifact), db_path=self.db_path,
        )
        self.assertEqual(row["checksum"], hashlib.sha256(b"scene one").hexdigest())
        self.assertEqual(len(matrix_db.list_scene_artifacts("job-1", db_path=self.db_path)), 1)
        with self.assertRaisesRegex(ValueError, "checksum"):
            matrix_db.record_scene_artifact(
                job_id="job-1", scene_index=1, artifact_type="image", file_path=str(artifact),
                checksum="0" * 64, db_path=self.db_path,
            )
        mask = matrix_db.update_scene_mask(job_id="job-1", mask=[1] + [0] * 11, db_path=self.db_path)
        self.assertEqual(mask, "[1,0,0,0,0,0,0,0,0,0,0,0]")


if __name__ == "__main__":
    unittest.main()
