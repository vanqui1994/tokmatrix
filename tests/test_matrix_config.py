import asyncio
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from bkt_web.matrix_config import sync_channel_configs


class MatrixConfigResolverTests(unittest.TestCase):
    def test_sync_resolves_pilot_configs_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "matrix_factory.db"
            first = asyncio.run(sync_channel_configs(db_path))
            self.assertEqual(first["synced"], 10)
            self.assertEqual(len(first["channel_ids"]), 10)

            conn = sqlite3.connect(db_path)
            rows = conn.execute(
                "SELECT channel_id, config_version, resolved_config_json, status FROM channels ORDER BY channel_id"
            ).fetchall()
            self.assertEqual(len(rows), 10)
            self.assertTrue(all(version == 2 for _, version, _, _ in rows))
            self.assertTrue(all(json.loads(config)["config_hash"] for _, _, config, _ in rows))
            conn.execute("UPDATE channels SET status='PAUSED' WHERE channel_id=?", (rows[0][0],))
            conn.commit()
            conn.close()

            second = asyncio.run(sync_channel_configs(db_path))
            self.assertEqual(second["synced"], 10)
            conn = sqlite3.connect(db_path)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0], 10)
            self.assertEqual(conn.execute("SELECT status FROM channels WHERE channel_id=?", (rows[0][0],)).fetchone()[0], "PAUSED")
            conn.close()

    def test_sync_migrates_legacy_channel_table_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "matrix_factory.db"
            conn = sqlite3.connect(db_path)
            conn.execute(
                """CREATE TABLE channels (
                    channel_id TEXT PRIMARY KEY, niche_id TEXT NOT NULL, channel_name TEXT NOT NULL,
                    tiktok_account_id TEXT, persona_tone TEXT NOT NULL, preferred_voice_id TEXT NOT NULL,
                    visual_style_id TEXT NOT NULL, cut_rate_seconds REAL DEFAULT 2.5,
                    status TEXT DEFAULT 'ACTIVE', created_at INTEGER NOT NULL
                )"""
            )
            conn.commit()
            conn.close()

            asyncio.run(sync_channel_configs(db_path))
            conn = sqlite3.connect(db_path)
            columns = {row[1] for row in conn.execute("PRAGMA table_info(channels)")}
            self.assertTrue({"config_version", "resolved_config_json", "updated_at"}.issubset(columns))
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0], 10)
            conn.close()


if __name__ == "__main__":
    unittest.main()
