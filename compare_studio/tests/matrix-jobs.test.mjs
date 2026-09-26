import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimNextJob,
  createBatch,
  createJob,
  initializeMatrixDb,
  registerTopic,
  recordSceneArtifact,
  transitionJob,
} from "../matrix/orchestrator/job-manager.mjs";
import { getSceneResumePlan } from "../matrix/orchestrator/scene-resumer.mjs";

function seedChannel(dbPath) {
  execFileSync("python3", ["-c", [
    "import sqlite3,sys",
    "c=sqlite3.connect(sys.argv[1])",
    "c.execute(\"INSERT INTO channels(channel_id,niche_id,channel_name,persona_tone,preferred_voice_id,visual_style_id,created_at) VALUES('space_01','deep_space','Space 01','academic','vi-VN-NamMinhNeural','cosmic_space_v1',1)\")",
    "c.commit()",
    "c.close()",
  ].join(";"), dbPath]);
}

test("job manager leases atomically and scene resume reuses valid artifacts after scene 5", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-job-test-"));
  const dbPath = path.join(tmp, "matrix_factory.db");
  try {
    await initializeMatrixDb({ dbPath });
    await registerTopic({ topic_id: "topic-1", title: "A test topic", niche_id: "deep_space", dbPath });
    seedChannel(dbPath);
    await createBatch({ batch_id: "batch-1", topic_id: "topic-1", total_jobs: 1, dbPath });
    const manifest = {
      scenes: Array.from({ length: 12 }, (_, index) => ({
        scene_index: index + 1,
        required_artifacts: ["image", "narration"],
      })),
    };
    await createJob({
      job_id: "job-1", batch_id: "batch-1", channel_id: "space_01", topic_id: "topic-1",
      engine_type: "science", video_slug: "test-video", total_scenes: 12, manifest, dbPath,
    });

    const claims = await Promise.all([
      claimNextJob({ worker_id: "worker-a", dbPath }),
      claimNextJob({ worker_id: "worker-b", dbPath }),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const owner = claims.find(Boolean).locked_by;
    await transitionJob({ job_id: "job-1", to_state: "PLANNING", expected_state: "CREATED", worker_id: owner, dbPath });

    for (let sceneIndex = 1; sceneIndex <= 4; sceneIndex += 1) {
      for (const artifactType of ["image", "narration"]) {
        const filePath = path.join(tmp, `scene-${sceneIndex}-${artifactType}.dat`);
        fs.writeFileSync(filePath, `${sceneIndex}:${artifactType}`);
        await recordSceneArtifact({ job_id: "job-1", scene_index: sceneIndex, artifact_type: artifactType, file_path: filePath, dbPath });
      }
    }
    const partial = path.join(tmp, "scene-5-image.dat");
    fs.writeFileSync(partial, "5:image");
    await recordSceneArtifact({ job_id: "job-1", scene_index: 5, artifact_type: "image", file_path: partial, dbPath });

    const plan = await getSceneResumePlan("job-1", { dbPath });
    assert.deepEqual(plan.completedScenes, [1, 2, 3, 4]);
    assert.deepEqual(plan.pendingScenes, [5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal(plan.resumeFromSceneIndex, 5);
    assert.equal(plan.reusableArtifacts.length, 9);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
