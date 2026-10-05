#!/usr/bin/env node
// Video mẫu engine vector cho một kênh: chạy đúng các bước của một job Matrix (angle → kịch bản → storyboard
// vector → TTS → dựng → render → Video QA) nhưng KHÔNG ghi DB Matrix và không đăng gì.
//
//   node tools/vector-sample.mjs --channel deep_space_01 --topic "What would a night on Mars feel like?" [--out <dir>] [--no-render]
//
// Kênh dùng giọng, nhạc nền, ngôn ngữ của chính nó; engine bị ép là `vector` (kênh không cần khai engine này).
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePilotChannelConfigs } from "../matrix/config/channel-config-resolver.mjs";
import { generateAngleSet } from "../matrix/planner/angle-generator.mjs";
import { buildBlueprintOutline } from "../matrix/story/blueprint-engine.mjs";
import { generateScript } from "../matrix/story/script-generator.mjs";
import { attachEngineExtras } from "../matrix/story/engine-extras.mjs";
import { orchestrateAudioForJob } from "../matrix/creative/audio-orchestrator.mjs";
import { buildNativeVideoProject, checkMatrixVideo, renderNativeProject } from "../matrix/render/native-engine-adapter.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function args(argv) {
  const out = { render: true };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--channel") out.channel = argv[++i];
    else if (argv[i] === "--topic") out.topic = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--no-render") out.render = false;
    else if (argv[i] === "--lines-file") out.linesFile = argv[++i];
  }
  if (!out.channel || !out.topic) throw new Error("usage: --channel <id> --topic <title> [--out dir] [--no-render]");
  return out;
}

function channelContext(channel) {
  const dna = channel?.resolved_config?.channel || channel?.channel || channel;
  return { ...channel, ...dna, channel: dna, resolved_config: channel?.resolved_config };
}

export async function vectorSample({ channelId, topic, outDir, render = true, linesFile, log = console.log }) {
  const resolved = resolvePilotChannelConfigs({}).find((item) => item.channel_id === channelId);
  if (!resolved) throw new Error(`unknown channel ${channelId}`);
  const channel = channelContext(resolved);
  const language = channel.publishing?.language;
  const blueprintIds = resolved.resolved_config?.channel?.story?.preferred_blueprints || [];
  const blueprint = (resolved.resolved_config?.blueprints || []).find((b) => b.blueprint_id === blueprintIds[0]) || resolved.resolved_config?.blueprints?.[0];
  let angle = { angle: topic }, outline = null, script;
  if (linesFile) {
    // Kịch bản viết sẵn (một câu mỗi dòng, "câu | ý hình" tuỳ chọn), không gọi LLM: storyboard dự phòng tất định.
    const lines = (await fs.readFile(linesFile, "utf8")).split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
    script = {
      title: topic, language,
      scenes: lines.map((raw, i) => { const [line, visual] = raw.split("|").map((x) => x.trim()); return { scene_index: i + 1, line, visual_intent: visual || line, asset_type: "CANVAS" }; }),
      engine_extras: { engine: "vector", source: "fallback", data: { fallback: true } },
    };
  } else {
    [angle] = await generateAngleSet(topic, { count: 1, language });
    outline = buildBlueprintOutline({ blueprint, angle, targetDurationSeconds: 45, pacingBeats: 12 });
    log(`[vector-sample] ${channelId} (${language}) angle: ${angle.angle}`);
    script = await attachEngineExtras({
      engineType: "vector", topic: { title: topic }, channel, language,
      script: await generateScript({ topic, angle, channel, outline, language }),
    });
  }
  log(`[vector-sample] script ${script.scenes.length} scenes, extras ${script.engine_extras?.source}`);
  const id = crypto.createHash("sha256").update(`${channelId}\n${topic}`).digest("hex").slice(0, 10);
  const jobId = `vecsample_${id}`;
  const projectDir = path.join(outDir, "project");
  const audio = await orchestrateAudioForJob({
    jobId, channel, projectDir, manifest: { scenes: script.scenes },
    artifactReader: async () => [], artifactWriter: async (artifact) => artifact,
  });
  const manifest = {
    spec_version: "2.1", topic: { title: topic, niche_id: channel.niche_id }, channel: resolved, angle, blueprint, outline,
    script, scenes: audio.manifest.scenes, audio: audio.manifest.audio,
  };
  const slug = `vector-${channelId.toLowerCase().replace(/[^a-z0-9-]+/gu, "-")}-${id.slice(0, 6)}`;
  const job = { job_id: jobId, batch_id: "vector-sample", channel_id: channelId, engine_type: "vector", video_slug: slug, created_at: Math.floor(Date.now() / 1000), manifest };
  const videoDir = path.join(outDir, "video");
  await fs.rm(videoDir, { recursive: true, force: true });
  const project = await buildNativeVideoProject({ job, manifest, projectDir, videoDir });
  await fs.writeFile(path.join(outDir, "script.json"), JSON.stringify(script, null, 2));
  log(`[vector-sample] project ${project.video_dir} (${project.duration_seconds}s)`);
  if (!render) return { project };
  const rendered = await renderNativeProject(project, { approved: true });
  const qa = await checkMatrixVideo(rendered.output_path);
  log(`[vector-sample] render ${rendered.output_path} QA ${qa.passed ? "passed" : `failed: ${qa.errors.join("; ")}`}`);
  return { project, rendered, qa };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = args(process.argv.slice(2));
  const outDir = path.resolve(opts.out || path.join(COMPARE_DIR, ".runtime", "vector-samples", opts.channel));
  await fs.mkdir(outDir, { recursive: true });
  vectorSample({ channelId: opts.channel, topic: opts.topic, outDir, render: opts.render, linesFile: opts.linesFile })
    .then((result) => { if (result.qa && !result.qa.passed) process.exitCode = 1; })
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
