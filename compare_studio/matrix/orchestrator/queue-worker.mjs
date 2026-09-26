import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  claimNextJob, createBatch, createJob, deferJob, getBatch, heartbeatJob, listBatchJobs,
  listSceneArtifacts, registerTopic, releaseJob,
  retryJob, syncChannelConfigs, transitionJob, updateJobManifest, updateSceneMask,
} from "./job-manager.mjs";
import { resolveChannelsForTopic } from "../planner/template-selector.mjs";
import { generateAngles, generateAngleSet } from "../planner/angle-generator.mjs";
import { buildBlueprintOutline } from "../story/blueprint-engine.mjs";
import { generateScript } from "../story/script-generator.mjs";
import { attachEngineExtras } from "../story/engine-extras.mjs";
import { evaluateAndRegisterScript } from "../qa/content-registry.mjs";
import { checkSceneAssets } from "../qa/asset-qa.mjs";
import { prepareSceneAssets } from "../creative/asset-manager.mjs";
import { orchestrateAudioForJob } from "../creative/audio-orchestrator.mjs";
import {
  buildNativeVideoProject, checkMatrixVideo, markVideoQaPassed, renderNativeProject,
} from "../render/native-engine-adapter.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FLOW = {
  CREATED: { handler: "plan", next: "PLANNING" },
  PLANNING: { handler: "script", next: "SCRIPTING" },
  SCRIPTING: { handler: "scriptQA", next: "SCRIPT_QA" },
  SCRIPT_QA: { handler: "creative", next: "ASSET_GENERATING" },
  ASSET_GENERATING: { handler: "assetQA", next: "ASSET_QA" },
  ASSET_QA: { handler: "buildProject", next: "READY_TO_RENDER" },
  READY_TO_RENDER: { handler: "renderApproval", next: "RENDERING" },
  RENDERING: { handler: "render", next: "VIDEO_QA" },
  VIDEO_QA: { handler: "videoQA", next: "READY_TO_PUBLISH" },
};
const PRE_RENDER_STATES = ["CREATED", "PLANNING", "SCRIPTING", "SCRIPT_QA", "ASSET_GENERATING", "ASSET_QA"];
const RENDER_STATES = [...PRE_RENDER_STATES, "READY_TO_RENDER", "RENDERING", "VIDEO_QA"];

function fail(message, { permanent = false, resumeState, leaseLost = false } = {}) {
  const error = new Error(message);
  error.permanent = permanent;
  error.resumeState = resumeState;
  error.leaseLost = leaseLost;
  return error;
}

function normalizedAngle(angle) {
  return [angle?.angle, angle?.hook, angle?.evidence_set?.join(" "), angle?.narrative_structure?.join(" ")]
    .join(" ").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function channelContext(channel) {
  const dna = channel?.resolved_config?.channel || channel?.channel || channel;
  return { ...channel, ...dna, channel: dna, resolved_config: channel?.resolved_config };
}

function channelLanguage(channel) {
  return channelContext(channel).publishing?.language || "vi";
}

// Góc tiếp cận dùng chung cho cả batch: cùng một ngôn ngữ thì viết luôn bằng
// ngôn ngữ đó, lẫn nhiều ngôn ngữ thì viết tiếng Anh rồi mỗi kịch bản tự viết
// bằng ngôn ngữ của kênh mình.
function batchAngleLanguage(channels) {
  const languages = new Set(channels.map(channelLanguage));
  return languages.size === 1 ? [...languages][0] : "en";
}

function selectedBlueprint(channel) {
  const resolved = channel?.resolved_config;
  const blueprintIds = resolved?.channel?.story?.preferred_blueprints || [];
  const choices = resolved?.blueprints || [];
  return choices.find((item) => item.blueprint_id === blueprintIds[0]) || choices[0];
}

function topicIdFor(title, nicheId) {
  const normalized = String(title).normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  return `topic-${crypto.createHash("sha256").update(`${nicheId}\n${normalized}`).digest("hex").slice(0, 24)}`;
}

function safeBatchId(value) {
  const batchId = String(value || `batch-${crypto.randomUUID()}`);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u.test(batchId)) throw new Error("batch-id must be 1–96 alphanumeric, underscore or hyphen characters");
  return batchId;
}

export function buildBatchPlan({ topic, nicheId, channelCount = 10, configDir, channelIds } = {}) {
  const title = String(topic || "").trim();
  if (!title || !nicheId) throw new Error("topic and nicheId are required");
  const channels = resolveChannelsForTopic(nicheId, channelCount, configDir ? { configDir, channelIds, topic: title } : { channelIds, topic: title });
  return {
    topic: title,
    niche_id: nicheId,
    requested_channels: Number(channelCount),
    available_channels: channels.length,
    channels: channels.map((channel) => ({
      channel_id: channel.channel_id,
      channel_name: channel.channel_name,
      engine_type: channel.engine_type,
      compatibility_score: channel.compatibility_score,
      config_version: channel.config_version,
      config_hash: channel.config_hash,
    })),
  };
}

export async function createMatrixBatch({
  topic,
  nicheId,
  channelCount = 10,
  channelIds,
  batchId,
  dbPath,
  configDir,
  angleProvider,
  store = { syncChannelConfigs, registerTopic, createBatch, createJob },
  dryRun = false,
  log = () => {},
} = {}) {
  if (process.env.MATRIX_FACTORY_ENABLED === "0") throw new Error("Matrix factory is disabled by MATRIX_FACTORY_ENABLED=0");
  const plan = buildBatchPlan({ topic, nicheId, channelCount, configDir, channelIds });
  const channels = resolveChannelsForTopic(nicheId, channelCount, configDir ? { configDir, channelIds, topic: plan.topic } : { channelIds, topic: plan.topic });
  if (dryRun) return { dry_run: true, plan };
  const id = safeBatchId(batchId);
  const angles = await generateAngleSet(plan.topic, {
    count: channels.length, language: batchAngleLanguage(channels), provider: angleProvider,
  });
  if (angles.length !== channels.length) throw new Error(`angle generator returned ${angles.length} angles for ${channels.length} pilot channels`);
  const assignments = channels.map((channel, index) => {
    const blueprint = selectedBlueprint(channel);
    if (!blueprint) throw new Error(`channel ${channel.channel_id} has no resolved preferred blueprint`);
    const angle = angles[index];
    return { channel, blueprint, angle, outline: buildBlueprintOutline({ blueprint, angle, targetDurationSeconds: 45, pacingBeats: 12 }) };
  });
  // Ghi batch + job ngay sau lần gọi angle duy nhất. Kịch bản do bước `script` của worker
  // sinh cho từng job và lưu vào manifest của job đó: chết giữa chừng thì --resume chỉ
  // sinh tiếp các job chưa có kịch bản, không trả tiền lại cho kịch bản đã xong.
  const topicId = topicIdFor(plan.topic, nicheId);
  await store.syncChannelConfigs?.({ dbPath });
  await store.registerTopic({ topic_id: topicId, title: plan.topic, niche_id: nicheId, dbPath });
  await store.createBatch({ batch_id: id, topic_id: topicId, total_jobs: assignments.length, dbPath });
  const jobs = [];
  for (const { channel, blueprint, angle, outline } of assignments) {
    const safeChannel = channel.channel_id.toLowerCase().replace(/[^a-z0-9-]+/gu, "-");
    const shortBatch = id.replace(/[^a-z0-9]/giu, "").slice(-8).toLowerCase();
    const jobId = `job_${id}_${channel.channel_id}`;
    const slug = `${channel.engine_type}-${safeChannel}-${shortBatch}`;
    const manifest = {
      spec_version: "2.1",
      topic: { topic_id: topicId, title: plan.topic, niche_id: nicheId },
      channel,
      angle,
      blueprint,
      outline,
      versions: {
        channel_config_version: channel.config_version,
        channel_config_hash: channel.config_hash,
        blueprint_id: blueprint.blueprint_id,
        script_generator: "matrix-story-v1",
        prompt_compiler: "matrix-prompt-v1",
        renderer: "native-template-v1",
      },
    };
    jobs.push(await store.createJob({
      job_id: jobId,
      batch_id: id,
      channel_id: channel.channel_id,
      topic_id: topicId,
      engine_type: channel.engine_type,
      video_slug: slug,
      total_scenes: outline.scene_count,
      manifest,
      dbPath,
    }));
    log(`[BATCH-MATRIX] queued ${channel.channel_id} / ${channel.engine_type} / ${outline.scene_count} scenes`);
  }
  return { dry_run: false, batch_id: id, topic_id: topicId, plan, jobs };
}

async function withLeaseHeartbeat(task, { jobId, workerId, leaseSeconds, dbPath, store }) {
  let inFlight = false;
  let leaseLost = false;
  const intervalMs = Math.max(1000, Math.floor(leaseSeconds * 1000 / 3));
  const timer = setInterval(async () => {
    if (inFlight || leaseLost) return;
    inFlight = true;
    try {
      const result = await store.heartbeatJob({ job_id: jobId, worker_id: workerId, lease_seconds: leaseSeconds, dbPath });
      if (!result?.renewed) leaseLost = true;
    } catch {
      leaseLost = true;
    } finally {
      inFlight = false;
    }
  }, intervalMs);
  timer.unref?.();
  try {
    const result = await task();
    if (leaseLost) throw fail(`worker ${workerId} lost lease for job ${jobId}`, { leaseLost: true });
    return result;
  } finally {
    clearInterval(timer);
  }
}

export async function processClaimedJob(job, {
  workerId,
  dbPath,
  leaseSeconds = 300,
  renderRequested = false,
  renderApproved = false,
  handlers = {},
  store = { heartbeatJob, releaseJob, transitionJob, retryJob, deferJob, updateJobManifest },
  log = () => {},
} = {}) {
  if (!job?.job_id || !workerId) throw new Error("a claimed job and workerId are required");
  let current = job;
  while (current.state !== "READY_TO_PUBLISH") {
    if (current.state === "READY_TO_RENDER" && !(renderRequested && renderApproved)) {
      if (current.locked_by) await store.releaseJob({ job_id: current.job_id, worker_id: workerId, dbPath });
      return { job: current, preview_ready: true, render_approval_required: renderRequested && !renderApproved };
    }
    const step = FLOW[current.state];
    if (!step) throw new Error(`queue worker cannot process job state ${current.state}`);
    const handler = handlers[step.handler];
    if (typeof handler !== "function") throw new Error(`queue worker stage ${step.handler} is not configured`);
    try {
      const lease = await store.heartbeatJob({ job_id: current.job_id, worker_id: workerId, lease_seconds: leaseSeconds, dbPath });
      if (!lease?.renewed) throw fail(`worker ${workerId} no longer owns ${current.job_id}`, { leaseLost: true });
      const result = await withLeaseHeartbeat(
        () => handler(current, { workerId, dbPath, leaseSeconds, renderRequested, renderApproved }),
        { jobId: current.job_id, workerId, leaseSeconds, dbPath, store },
      );
      const manifest = result?.manifest || current.manifest || {};
      if (result?.defer) {
        await store.updateJobManifest({ job_id: current.job_id, worker_id: workerId, manifest, dbPath });
        const deferred = await store.deferJob({
          job_id: current.job_id, worker_id: workerId,
          delay_seconds: result.delay_seconds || 30,
          reason: result.reason || "waiting for external assets",
          dbPath,
        });
        log(`[MATRIX-WORKER] deferred ${current.job_id} until external assets are ready`);
        return { job: deferred, deferred: true };
      }
      if (result?.failure) throw fail(result.failure.message, result.failure);
      current = await store.transitionJob({
        job_id: current.job_id,
        worker_id: workerId,
        expected_state: current.state,
        to_state: step.next,
        manifest,
        ...(result?.current_scene_index ? { current_scene_index: result.current_scene_index } : {}),
        dbPath,
      });
      log(`[MATRIX-WORKER] ${current.job_id}: ${step.next}`);
    } catch (error) {
      if (error?.leaseLost || error?.message?.includes("lost lease") || error?.message?.includes("no longer owns") || error?.message?.includes("does not hold an active job lease")) {
        return { job: current, lease_lost: true, error: error.message };
      }
      const retried = await store.retryJob({
        job_id: current.job_id,
        worker_id: workerId,
        error_message: error.message,
        permanent: Boolean(error.permanent),
        ...(error.resumeState ? { resume_state: error.resumeState } : {}),
        dbPath,
      });
      log(`[MATRIX-WORKER] ${current.job_id}: ${retried.state} (${error.message})`);
      return { job: retried, error: error.message };
    }
  }
  if (current.locked_by) await store.releaseJob({ job_id: current.job_id, worker_id: workerId, dbPath });
  return { job: current, ready_to_publish: true };
}

export function makeHandlers({ dbPath, imageTimeoutMin = 0, angleProvider, scriptProvider, renderApproved = false, runner, jobStore }) {
  const projectDirFor = (job) => path.join(COMPARE_DIR, "projects", job.job_id);
  return {
    plan: async (job) => {
      const manifest = job.manifest || {};
      if (!manifest.channel?.config_hash || !manifest.blueprint?.blueprint_id || !(manifest.script?.scenes?.length || manifest.angle?.angle_id)) {
        throw fail(`job ${job.job_id} lacks a resolved channel snapshot, blueprint, or an angle/script`, { permanent: true });
      }
      return { manifest };
    },
    script: async (job) => {
      const manifest = job.manifest;
      const channel = channelContext(manifest.channel);
      const withExtras = (script) => attachEngineExtras({
        engineType: job.engine_type, script, topic: manifest.topic, channel,
        provider: scriptProvider, language: channel.publishing?.language || "vi",
      });
      if (manifest.script?.scenes?.length) {
        const script = await withExtras(manifest.script);
        return { manifest: script === manifest.script ? manifest : { ...manifest, script, scenes: script.scenes } };
      }
      const outline = manifest.outline || buildBlueprintOutline({
        blueprint: manifest.blueprint, angle: manifest.angle, targetDurationSeconds: 45, pacingBeats: 12,
      });
      const script = await withExtras(await generateScript({
        topic: manifest.topic, angle: manifest.angle, channel, outline,
        provider: scriptProvider, language: channel.publishing?.language || "vi",
      }));
      return { manifest: { ...manifest, outline, script, scenes: script.scenes } };
    },
    scriptQA: async (job) => {
      let manifest = job.manifest;
      const channel = channelContext(manifest.channel);
      const evaluate = (script, angle) => evaluateAndRegisterScript({
        script,
        channel,
        topicId: job.topic_id,
        jobId: job.job_id,
        engineType: job.engine_type,
        angle,
        blueprintId: manifest.blueprint.blueprint_id,
        dbPath,
      });
      let result = await evaluate(manifest.script, manifest.angle);
      const avoid = [];
      for (let attempt = 0; !result.registered && result.script_qa?.passed && attempt < 2; attempt += 1) {
        // Cho model biết cần tránh gì: angle vừa bị loại + bài trong registry mà nó trùng.
        const match = result.similarity?.match;
        avoid.push(
          [manifest.angle?.angle, manifest.angle?.hook].filter(Boolean).join(" — "),
          [match?.angle_title, match?.hook_text].filter(Boolean).join(" — "),
        );
        const alternatives = await generateAngles(manifest.topic.title, {
          maxCount: 1,
          language: channel.publishing?.language || "vi",
          provider: angleProvider,
          avoid,
        });
        const candidate = alternatives[0];
        if (normalizedAngle(candidate) === normalizedAngle(manifest.angle)) continue;
        candidate.angle_id = `angle_retry_${attempt + 1}`;
        const outline = buildBlueprintOutline({ blueprint: manifest.blueprint, angle: candidate, targetDurationSeconds: 45, pacingBeats: 12 });
        const script = await attachEngineExtras({
          engineType: job.engine_type, topic: manifest.topic, channel,
          provider: scriptProvider, language: channel.publishing?.language || "vi",
          script: await generateScript({
            topic: manifest.topic.title, angle: candidate, channel, outline,
            provider: scriptProvider, language: channel.publishing?.language || "vi",
          }),
        });
        manifest = { ...manifest, angle: candidate, outline, script, scenes: script.scenes, angle_retry_count: attempt + 1 };
        result = await evaluate(script, candidate);
      }
      if (!result.registered) {
        const qaMsg = result.script_qa?.errors?.join("; ") || result.script_qa?.status;
        const sim = result.similarity;
        const simMsg = sim ? `${sim.reason} (${sim.tier} ${sim.score} > ${sim.threshold})` : undefined;
        const details = !result.script_qa?.passed ? `QA errors: ${qaMsg}` : `similarity: ${simMsg}`;
        throw fail(`script gate rejected ${job.job_id}: ${details}`, { permanent: true });
      }
      return {
        manifest: {
          ...manifest,
          content_id: result.content_id,
          script_qa: result.script_qa,
          similarity_qa: result.similarity,
        },
      };
    },
    creative: async (job) => {
      const projectDir = projectDirFor(job);
      const channel = channelContext(job.manifest.channel);
      const assets = await prepareSceneAssets({
        jobId: job.job_id,
        manifest: { ...job.manifest, scenes: job.manifest.scenes },
        channel,
        engineType: job.engine_type,
        projectDir,
        timeoutMin: imageTimeoutMin,
        dbPath,
      });
      const audio = await orchestrateAudioForJob({
        jobId: job.job_id,
        projectDir,
        channel,
        manifest: assets.manifest,
        dbPath,
      });
      const manifest = {
        ...job.manifest,
        ...audio.manifest,
        scenes: audio.manifest.scenes,
        asset_pipeline: assets.manifest.asset_pipeline,
        audio: audio.manifest.audio,
      };
      if (assets.pending.length) {
        return {
          manifest,
          defer: true,
          delay_seconds: 30,
          reason: `${assets.pending.length} Antigravity visual asset(s) are still pending`,
        };
      }
      return { manifest };
    },
    assetQA: async (job) => {
      const artifacts = await jobStore.listSceneArtifacts({ job_id: job.job_id, dbPath });
      const result = await checkSceneAssets({
        manifest: { scenes: job.manifest.scenes },
        artifacts,
        baseDir: projectDirFor(job),
      });
      if (!result.passed) throw fail(`asset QA failed: ${JSON.stringify(result.issues)}`, { permanent: true });
      await updateSceneMask({
        job_id: job.job_id,
        mask: job.manifest.scenes.map(() => 1),
        dbPath,
      });
      return { manifest: { ...job.manifest, asset_qa: result } };
    },
    buildProject: async (job) => {
      const project = await buildNativeVideoProject({
        job,
        manifest: job.manifest,
        projectDir: projectDirFor(job),
      });
      return {
        manifest: {
          ...job.manifest,
          render_project: project,
        },
      };
    },
    renderApproval: async (job) => ({ manifest: job.manifest }),
    render: async (job) => {
      const project = job.manifest.render_project;
      if (!project) throw fail(`job ${job.job_id} has no prepared native project`, { permanent: true });
      let rendered;
      try {
        rendered = await renderNativeProject(project, { approved: renderApproved, runner });
      } catch (error) {
        // Lỗi check/render (vd chữ tràn khung): lần thử lại dựng lại project từ manifest để dùng HTML mới nhất,
        // thay vì render lại đúng HTML đã hỏng.
        throw fail(error.message, { resumeState: "ASSET_QA" });
      }
      return { manifest: { ...job.manifest, render_result: rendered } };
    },
    videoQA: async (job) => {
      const project = job.manifest.render_project;
      if (!project?.output_path) throw fail(`job ${job.job_id} has no rendered MP4`, { permanent: true });
      const qa = await checkMatrixVideo(project.output_path);
      // Dựng lại project từ manifest (ASSET_QA) thay vì render lại đúng index.html đã trượt QA:
      // HTML cũ render lần nào cũng ra y hệt (vd đoạn đen cuối vox), sửa engine không bao giờ tới được job.
      if (!qa.passed) throw fail(`video QA failed: ${qa.errors.join("; ")}`, { resumeState: "ASSET_QA" });
      await markVideoQaPassed(project, qa);
      return { manifest: { ...job.manifest, video_qa: qa, video_path: project.output_path } };
    },
  };
}

export async function runWorkerPool({
  batchId,
  workerCount = 2,
  dbPath,
  renderRequested = false,
  renderApproved = false,
  imageTimeoutMin = 0,
  angleProvider,
  scriptProvider,
  runner,
  handlers: injectedHandlers,
  store = {
    claimNextJob, heartbeatJob, releaseJob, transitionJob, retryJob, deferJob,
    updateJobManifest, updateSceneMask, listSceneArtifacts, getBatch, listBatchJobs,
  },
  log = () => {},
} = {}) {
  if (!batchId) throw new Error("batchId is required for Matrix worker execution");
  if (!Number.isInteger(Number(workerCount)) || Number(workerCount) < 1 || Number(workerCount) > 10) {
    throw new Error("workerCount must be between 1 and 10");
  }
  const workerStates = renderRequested && renderApproved ? RENDER_STATES : PRE_RENDER_STATES;
  const handlers = injectedHandlers || makeHandlers({ dbPath, imageTimeoutMin, angleProvider, scriptProvider, renderApproved, runner, jobStore: store });
  const outcomes = [];
  const worker = async (index) => {
    const workerId = `${os.hostname()}-${process.pid}-${index + 1}`;
    while (true) {
      const job = await store.claimNextJob({
        worker_id: workerId,
        lease_seconds: 300,
        states: workerStates,
        batch_id: batchId,
        dbPath,
      });
      if (!job) break;
      outcomes.push(await processClaimedJob(job, {
        workerId, dbPath, leaseSeconds: 300, renderRequested, renderApproved,
        handlers, store, log,
      }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(Number(workerCount), 10) }, (_, index) => worker(index)));
  return {
    batch: await store.getBatch({ batch_id: batchId, dbPath }),
    jobs: await store.listBatchJobs({ batch_id: batchId, dbPath }),
    outcomes,
  };
}

export async function runMatrixBatch(options = {}) {
  if (process.env.MATRIX_FACTORY_ENABLED === "0") throw new Error("Matrix factory is disabled by MATRIX_FACTORY_ENABLED=0");
  const store = options.workerStore || { getBatch, listBatchJobs };
  let batch;
  if (options.resumeBatchId) {
    const existing = await store.getBatch({ batch_id: options.resumeBatchId, dbPath: options.dbPath });
    if (!existing) throw new Error(`batch not found: ${options.resumeBatchId}`);
    batch = { ...existing, batch_id: existing.batch_id, jobs: await store.listBatchJobs({ batch_id: existing.batch_id, dbPath: options.dbPath }) };
  } else {
    batch = await createMatrixBatch(options);
  }
  if (batch.dry_run || options.run === false) return batch;
  const result = await runWorkerPool({
    batchId: batch.batch_id,
    workerCount: options.workerCount || 2,
    dbPath: options.dbPath,
    renderRequested: Boolean(options.renderRequested),
    renderApproved: Boolean(options.renderApproved),
    imageTimeoutMin: options.imageTimeoutMin ?? 0,
    angleProvider: options.angleProvider,
    scriptProvider: options.scriptProvider,
    runner: options.runner,
    store: options.workerStore,
    log: options.log,
  });
  return { ...batch, execution: result };
}
