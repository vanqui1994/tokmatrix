# Durable remake task queue (UV-806)

Modules: `bkt_web/remake_task_store.py`, `bkt_web/remake_routes.py` · Database: `bkt_web/storage/remake_tasks.db` · Tests: `tests/test_remake_task_store.py`

Remake task state is stored in SQLite rather than the process-local `REMAKE_TASKS` dictionary. The existing status response remains compatible, but `/api/remake/status/{task_id}` reads the durable record first.

## Lifecycle

`pending → processing → completed | needs_review`

Pipeline exceptions use bounded retry: a failed attempt returns to `pending` with exponential backoff until `max_attempts` (default 3), then becomes `error`. `POST /api/remake/status/{task_id}/retry` puts a terminal error back in the queue without creating another task.

At application startup, records left in `processing` are changed to `pending` with a recovery message. The same task ID, attempt counter, logs and source/project binding survive the restart. One queue thread claims work through `BEGIN IMMEDIATE`, while the existing pipeline lock continues to prevent concurrent ffmpeg/Whisper runs.

## Idempotency

The queue has a partial unique index on `source_sha256` for remake jobs. Both `/start` and `/auto` hash the source bytes before enqueueing. A second submission of identical bytes returns the original task ID with `idempotent_reuse: true`; it does not create a second project. When no project name is supplied, the stable project ID is `remake-<first 12 hash characters>`.

Reviewed-story TTS is already checkpointed per cue in the stable project scratch directory. Its key includes text, engine, voice and role, and the cache is written atomically after each successful cue. Queue retries reuse those files, so a later pipeline failure does not buy the same completed voice line again.

## Verification

```bash
.venv/bin/python -m unittest discover -s tests -p test_remake_task_store.py
```

Coverage includes restart recovery through a new store instance, atomic SHA-256 deduplication, bounded retry/backoff, stable project IDs and TTS cache reuse across a retry.
