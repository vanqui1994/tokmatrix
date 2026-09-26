import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseBatchMatrixArgs } from "../tools/batch-matrix.mjs";
import { execFileSync } from "node:child_process";
import { buildBatchPlan, createMatrixBatch, makeHandlers, processClaimedJob, runWorkerPool } from "../matrix/orchestrator/queue-worker.mjs";
import { getBatch, getJob, listBatchJobs } from "../matrix/orchestrator/job-manager.mjs";

function makeAngles(count) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Góc ${index + 1}`,
    angle: `Luận điểm độc lập ${index + 1}`,
    hook: `Câu hỏi ${index + 1}?`,
    evidence_set: [`nhóm bằng chứng ${index + 1}`],
    narrative_structure: [`cấu trúc ${index + 1}`, `kết luận ${index + 1}`],
    hook_type: `hook-${index + 1}`,
  }));
}

function makeScriptProvider() {
  return async () => ({
    title: "Kịch bản thử nghiệm",
    scenes: Array.from({ length: 12 }, (_, index) => ({
      line: index === 0 ? "Một tín hiệu đã biến mất." : `Bằng chứng thứ ${index + 1} mở ra một câu hỏi mới.`,
      visual_intent: `Hình ảnh biên tập cho cảnh ${index + 1}`,
    })),
  });
}

test("batch CLI parsing separates prepare, render approval and resume modes", () => {
  assert.deepEqual(
    (({ topic, nicheId, channelCount, renderRequested, renderApproved }) => ({ topic, nicheId, channelCount, renderRequested, renderApproved }))(
      parseBatchMatrixArgs(["Chủ đề thử", "--niche", "deep_space", "--channels", "10", "--render"]),
    ),
    { topic: "Chủ đề thử", nicheId: "deep_space", channelCount: 10, renderRequested: true, renderApproved: false },
  );
  const resume = parseBatchMatrixArgs(["--resume", "batch-1", "--render", "--approve-render"]);
  assert.equal(resume.resumeBatchId, "batch-1");
  assert.equal(resume.renderApproved, true);
  assert.throws(() => parseBatchMatrixArgs(["--topic", "A", "--niche", "deep_space", "--auto-publish"]), /Sprint 7/);
  assert.throws(() => parseBatchMatrixArgs(["--resume", "batch-1", "--topic", "A"]), /cannot be combined/);
  const ids = Array.from({ length: 14 }, (_, i) => `space_${i + 1}`).join(",");
  assert.equal(parseBatchMatrixArgs(["--topic", "A", "--niche", "deep_space", "--channels", "14", "--channel-ids", ids]).channelIds.length, 14);
  assert.throws(() => parseBatchMatrixArgs(["--topic", "A", "--niche", "deep_space", "--channel-ids", Array(51).fill("x").join(",")]), /1–50/);
});

test("catalog planning stays local in dry-run and respects ten configured channels", async () => {
  const plan = buildBatchPlan({ topic: "Deep ocean mysteries", nicheId: "deep_space", channelCount: 10 });
  assert.equal(plan.available_channels, 10);
  assert.equal(plan.channels.length, 10);
  let calls = 0;
  const dryRun = await createMatrixBatch({
    topic: "Deep ocean mysteries",
    nicheId: "deep_space",
    channelCount: 10,
    dryRun: true,
    angleProvider: async () => { calls += 1; throw new Error("dry-run must not call a provider"); },
    store: { syncChannelConfigs: async () => { calls += 1; } },
  });
  assert.equal(dryRun.dry_run, true);
  assert.equal(dryRun.plan.available_channels, 10);
  assert.equal(calls, 0);
});

test("Matrix batch persists one job per channel right after the angle call, before any script is written", async () => {
  const persisted = { synced: 0, topics: [], batches: [], jobs: [] };
  const store = {
    syncChannelConfigs: async () => { persisted.synced += 1; },
    registerTopic: async (entry) => { persisted.topics.push(entry); },
    createBatch: async (entry) => { persisted.batches.push(entry); },
    createJob: async (entry) => { persisted.jobs.push(entry); return entry; },
  };
  const batch = await createMatrixBatch({
    topic: "A star disappeared",
    nicheId: "deep_space",
    channelCount: 10,
    batchId: "batch-pilot-test",
    store,
    angleProvider: async () => ({ angles: makeAngles(10) }),
    scriptProvider: async () => { throw new Error("scripts are written by the worker, not at batch creation"); },
  });
  assert.equal(persisted.synced, 1);
  assert.equal(persisted.batches.length, 1);
  assert.equal(persisted.jobs.length, 10);
  assert.equal(new Set(persisted.jobs.map((job) => job.video_slug)).size, 10);
  assert.ok(new Set(persisted.jobs.map((job) => job.engine_type)).size >= 4);
  assert.equal(batch.jobs.every((job) => !job.manifest.script && job.manifest.angle.angle_id && job.manifest.outline.scene_count === job.total_scenes), true);
  assert.equal(new Set(batch.jobs.map((job) => job.manifest.angle.angle_id)).size, 10);
  assert.equal(batch.jobs.every((job) => job.manifest.channel.config_hash), true);
});

test("batch command syncs pilot Channel DNA and persists jobs through the Python database wrapper", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-batch-db-"));
  const dbPath = path.join(directory, "matrix.db");
  try {
    const result = await createMatrixBatch({
      topic: "A star disappeared",
      nicheId: "deep_space",
      channelCount: 5,
      batchId: "batch-real-sync-test",
      dbPath,
      angleProvider: async () => ({ angles: makeAngles(5) }),
      scriptProvider: makeScriptProvider(),
    });
    assert.equal((await getBatch({ batch_id: result.batch_id, dbPath })).total_jobs, 5);
    assert.equal((await listBatchJobs({ batch_id: result.batch_id, dbPath })).length, 5);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("database-backed worker pool advances a batch once and does not re-render ready jobs", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-worker-pool-"));
  const dbPath = path.join(directory, "matrix.db");
  try {
    const batch = await createMatrixBatch({
      topic: "A star disappeared",
      nicheId: "deep_space",
      channelCount: 5,
      batchId: "batch-worker-pool-test",
      dbPath,
      angleProvider: async () => ({ angles: makeAngles(5) }),
      scriptProvider: makeScriptProvider(),
    });
    const handlers = Object.fromEntries(["plan", "script", "scriptQA", "creative", "assetQA", "buildProject", "renderApproval", "render", "videoQA"].map((name) => [name, async (job) => ({ manifest: { ...job.manifest, [name]: true } })]));
    let renderCount = 0;
    handlers.render = async (job) => { renderCount += 1; return { manifest: { ...job.manifest, rendered: true } }; };
    const prepared = await runWorkerPool({ batchId: batch.batch_id, dbPath, workerCount: 2, handlers, log: () => {} });
    assert.equal(prepared.outcomes.length, 5);
    assert.equal(prepared.jobs.every((job) => job.state === "READY_TO_RENDER"), true);
    const rendered = await runWorkerPool({
      batchId: batch.batch_id, dbPath, workerCount: 2, renderRequested: true, renderApproved: true, handlers, log: () => {},
    });
    assert.equal(rendered.jobs.every((job) => job.state === "READY_TO_PUBLISH"), true);
    assert.equal(renderCount, 5);
    const resumed = await runWorkerPool({
      batchId: batch.batch_id, dbPath, workerCount: 2, renderRequested: true, renderApproved: true, handlers, log: () => {},
    });
    assert.equal(resumed.outcomes.length, 0);
    assert.equal(renderCount, 5);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("scripts are checkpointed per job: a resumed batch only writes the scripts that are still missing", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-script-checkpoint-"));
  const dbPath = path.join(directory, "matrix.db");
  try {
    const batch = await createMatrixBatch({
      topic: "A star disappeared", nicheId: "deep_space", channelCount: 5,
      batchId: "batch-checkpoint-test", dbPath, angleProvider: async () => ({ angles: makeAngles(5) }),
    });
    let calls = 0;
    const scriptProvider = async (...args) => {
      // Kênh gán engine mở rộng gọi thêm bước engine extras; ở đây chỉ đếm lượt viết kịch bản.
      if (String(args[0]?.systemPrompt || "").includes("structured on-screen data")) throw new Error("extras skipped in test");
      calls += 1;
      if (calls === 3) throw new Error("Gemini returned HTTP 503");  // mất kết nối giữa batch
      return makeScriptProvider()(...args);
    };
    const passThrough = async (job) => ({ manifest: job.manifest });
    const handlers = () => ({
      ...makeHandlers({ dbPath, scriptProvider }),
      scriptQA: passThrough, creative: passThrough, assetQA: passThrough, buildProject: passThrough,
    });
    const first = await runWorkerPool({ batchId: batch.batch_id, dbPath, workerCount: 2, handlers: handlers(), log: () => {} });
    assert.equal(calls, 5);
    assert.equal(first.jobs.filter((job) => job.state === "READY_TO_RENDER").length, 4);
    const waiting = first.jobs.find((job) => job.state === "RETRY_WAIT");
    assert.ok(waiting);
    const written = await Promise.all(first.jobs.map((job) => getJob({ job_id: job.job_id, dbPath })));
    assert.equal(written.filter((job) => job.manifest.script?.scenes?.length === 12).length, 4);

    execFileSync("python3", ["-c", "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('UPDATE content_jobs SET next_retry_at=0'); c.commit()", dbPath]);
    const resumed = await runWorkerPool({ batchId: batch.batch_id, dbPath, workerCount: 2, handlers: handlers(), log: () => {} });
    assert.equal(calls, 6);  // chỉ sinh lại đúng kịch bản còn thiếu
    assert.equal(resumed.jobs.every((job) => job.state === "READY_TO_RENDER"), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fakeStore() {
  const store = {
    transitions: [],
    deferred: 0,
    released: 0,
    retries: [],
    heartbeatJob: async () => ({ renewed: true }),
    transitionJob: async ({ to_state, manifest }) => {
      store.job = { ...store.job, state: to_state, manifest, locked_by: "worker-1" };
      store.transitions.push(to_state);
      return store.job;
    },
    releaseJob: async () => { store.released += 1; store.job.locked_by = null; return true; },
    updateJobManifest: async ({ manifest }) => { store.job.manifest = manifest; return store.job; },
    deferJob: async ({ reason }) => {
      store.deferred += 1;
      store.job = { ...store.job, state: "RETRY_WAIT", resume_state: "ASSET_GENERATING", error_message: reason, locked_by: null };
      return store.job;
    },
    retryJob: async (args) => {
      store.retries.push(args);
      store.job = { ...store.job, state: "RETRY_WAIT", resume_state: args.resume_state || store.job.state, locked_by: null };
      return store.job;
    },
  };
  return store;
}

test("worker prepares a preview project but never renders without explicit approval", async () => {
  const store = fakeStore();
  store.job = { job_id: "job-preview", state: "CREATED", locked_by: "worker-1", manifest: {} };
  const calls = [];
  const handlers = Object.fromEntries(["plan", "script", "scriptQA", "creative", "assetQA", "buildProject"].map((name) => [name, async () => {
    calls.push(name);
    return { manifest: { ...store.job.manifest, [name]: true } };
  }]));
  handlers.render = async () => { calls.push("render"); return {}; };
  const result = await processClaimedJob(store.job, {
    workerId: "worker-1", store, handlers, renderRequested: true, renderApproved: false,
  });
  assert.equal(result.preview_ready, true);
  assert.equal(result.job.state, "READY_TO_RENDER");
  assert.equal(calls.includes("render"), false);
  assert.equal(store.released, 1);
});

test("worker can resume at RENDERING, run video QA once and stop at READY_TO_PUBLISH", async () => {
  const store = fakeStore();
  store.job = { job_id: "job-render", state: "READY_TO_RENDER", locked_by: "worker-1", manifest: {} };
  const calls = [];
  const handlers = {
    renderApproval: async () => ({ manifest: store.job.manifest }),
    render: async () => { calls.push("render"); return { manifest: { rendered: true } }; },
    videoQA: async () => { calls.push("videoQA"); return { manifest: { video_qa: { passed: true } } }; },
  };
  const result = await processClaimedJob(store.job, {
    workerId: "worker-1", store, handlers, renderRequested: true, renderApproved: true,
  });
  assert.equal(result.ready_to_publish, true);
  assert.deepEqual(store.transitions, ["RENDERING", "VIDEO_QA", "READY_TO_PUBLISH"]);
  assert.deepEqual(calls, ["render", "videoQA"]);
  assert.equal(store.released, 1);
});

test("external asset waiting defers the job without incrementing a retry", async () => {
  const store = fakeStore();
  store.job = { job_id: "job-assets", state: "ASSET_GENERATING", locked_by: "worker-1", manifest: {} };
  const result = await processClaimedJob(store.job, {
    workerId: "worker-1",
    store,
    handlers: { assetQA: async () => ({ manifest: { pending: true }, defer: true, reason: "waiting for Antigravity" }) },
  });
  assert.equal(result.deferred, true);
  assert.equal(result.job.state, "RETRY_WAIT");
  assert.equal(store.deferred, 1);
  assert.equal(store.retries.length, 0);
});

test("channels only get engines the native renderer can build", async () => {
  const { pickEngine } = await import("../matrix/planner/template-selector.mjs");
  const { RENDERABLE_ENGINES } = await import("../matrix/render/native-engine-adapter.mjs");
  const channel = (preferred, engines) => ({
    resolved_config: { channel: { creative: { preferred_engines: preferred } }, compatibility: { engines } },
  });
  const unbuilt = { id: "hologram", score: 0.95 };  // engine chưa có renderer
  const tier = { id: "tierlist", score: 0.9 };
  const vox = { id: "vox", score: 0.7 };
  const kinetic = { id: "kinetic", score: 0.8 };
  assert.equal(pickEngine(channel(["hologram", "vox"], [unbuilt, vox, kinetic])).id, "vox");
  assert.equal(pickEngine(channel(["hologram"], [unbuilt, vox, kinetic])).id, "kinetic");  // hết ưu tiên → điểm cao nhất
  assert.equal(pickEngine(channel(["hologram"], [unbuilt])), null);  // resolveChannelsForTopic sẽ dùng FALLBACK_ENGINE
  // Engine mở rộng đã có renderer (engines/*.mjs) được chọn như engine gốc.
  assert.equal(pickEngine(channel(["tierlist", "vox"], [tier, vox, kinetic])).id, "tierlist");
  const plan = buildBatchPlan({ topic: "x", nicheId: "deep_space", channelCount: 14 });
  assert.ok(plan.channels.every((c) => RENDERABLE_ENGINES.includes(c.engine_type)));
});
