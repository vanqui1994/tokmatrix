"""Offline acceptance tests for Matrix Sprint 8 analytics."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from bkt_web import matrix_analytics as analytics
from bkt_web import matrix_db


class MatrixAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "matrix.db"
        matrix_db.init_db(self.db)
        with sqlite3.connect(self.db) as conn:
            conn.execute("INSERT INTO topics VALUES ('topic-1','Topic','deep_space','evergreen',.5,'READY',1,1)")
            conn.execute("INSERT INTO channels(channel_id,niche_id,channel_name,persona_tone,preferred_voice_id,visual_style_id,created_at) VALUES ('space_01','deep_space','Space','calm','voice','style',1)")
            conn.execute("INSERT INTO content_jobs(job_id,batch_id,channel_id,topic_id,engine_type,state,video_slug,manifest_json,created_at,updated_at) VALUES ('job-1','batch-1','space_01','topic-1','science','READY_TO_PUBLISH','slug',?,1,1)", (json.dumps({"angle":{"hook_type":"paradox_question"}}),))
            conn.execute("INSERT INTO content_registry(content_id,source_job_id,channel_id,topic_id,angle_title,hook_text,blueprint_id,engine_type,full_script,script_hash,created_at) VALUES ('content-1','job-1','space_01','topic-1','a','h','science_explainer','science','text','hash',1)")

    def tearDown(self):
        self.tmp.cleanup()

    def test_ingest_preserves_available_metrics_and_features(self):
        row = analytics.ingest_metrics(content_id="content-1", provider="fixture", metrics={"completion_rate": .6, "likes": 2}, captured_at=100, db_path=self.db)
        payload = json.loads(row["metrics_json"])
        self.assertEqual(payload["available_metrics"], ["completion_rate", "likes"])
        self.assertEqual(payload["features"]["hook_style"], "paradox_question")
        self.assertEqual(payload["features"]["blueprint_id"], "science_explainer")

    def test_replay_is_conservative_and_versioned_without_mutating_job(self):
        for index, rate in enumerate((.6, .7, .56), 1):
            analytics.ingest_metrics(content_id="content-1", provider=f"fixture-{index}", metrics={"completion_rate": rate}, captured_at=index, db_path=self.db)
        strategy = analytics.replay_strategy(niche_id="deep_space", cutoff=10, db_path=self.db)
        self.assertEqual(strategy["weights"]["hook_styles"]["paradox_question"]["weight"], 1.15)
        version = analytics.create_strategy_version(niche_id="deep_space", cutoff=10, db_path=self.db)
        self.assertTrue(version["strategy_version_id"].startswith("strategy-"))
        self.assertEqual(matrix_db.get_job("job-1", db_path=self.db)["manifest"]["angle"]["hook_type"], "paradox_question")

    def test_insufficient_samples_do_not_change_weight(self):
        analytics.ingest_metrics(content_id="content-1", provider="fixture", metrics={"completion_rate": .9}, captured_at=1, db_path=self.db)
        item = analytics.replay_strategy(niche_id="deep_space", cutoff=2, db_path=self.db)["weights"]["blueprints"]["science_explainer"]
        self.assertEqual((item["sample_size"], item["weight"], item["delta"]), (1, 1.0, 0.0))


if __name__ == "__main__":
    unittest.main()
