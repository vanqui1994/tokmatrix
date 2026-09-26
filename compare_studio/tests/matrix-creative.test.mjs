import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { prepareSceneAssets } from "../matrix/creative/asset-manager.mjs";
import { directSceneVisual } from "../matrix/creative/visual-director.mjs";
import { compileImagePrompt } from "../matrix/creative/prompt-compiler.mjs";
import { createVoiceSynthesizer, orchestrateAudioForJob } from "../matrix/creative/audio-orchestrator.mjs";
import { checkSceneAssets } from "../matrix/qa/asset-qa.mjs";
import { renderNativeArtifact } from "../matrix/creative/native-artifact-renderer.mjs";

function channelFor(nicheId) {
  return resolveChannelsForTopic(nicheId, 1)[0];
}

test("pilot Channel DNA soundscape IDs resolve to existing local BGM tracks", () => {
  const configDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config");
  const channels = [
    ...resolveChannelsForTopic("unsolved_mysteries", 10, { configDir }),
    ...resolveChannelsForTopic("deep_space", 10, { configDir }),
  ];
  for (const channel of channels) {
    const bgm = channel.resolved_config.soundscape.defaultBgm;
    assert.ok(fs.statSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shared/audio/bgm", `${bgm}.mp3`)).size > 0);
  }
});

test("visual director and prompt compiler route AI imagery only for IMAGE_AI scenes", () => {
  const science = channelFor("deep_space");
  const photo = directSceneVisual({
    channel: science,
    engineType: "mystery",
    scene: { scene_index: 1, visual_intent: "Wide documentary view of Saturn's rings" },
  });
  assert.equal(photo.asset_type, "IMAGE_AI");
  assert.ok(photo.image_prompt.includes("vertical 9:16"));
  assert.ok(photo.negative_prompt.includes("watermark"));

  const chart = directSceneVisual({
    channel: science,
    engineType: "tierlist",
    scene: { scene_index: 2, asset_type: "CHART", visual_intent: "Compare orbital periods" },
  });
  assert.equal(chart.asset_type, "CHART");
  assert.equal(chart.image_prompt, null);
  assert.throws(() => compileImagePrompt({ scene: chart, style: science.resolved_config.style }), /IMAGE_AI/);
  const canvas = directSceneVisual({
    channel: science,
    engineType: "science",
    scene: { scene_index: 3, visual_intent: "Reveal the physical mechanism with a native science animation" },
  });
  assert.equal(canvas.asset_type, "CANVAS");
});

test("asset manager routes a mixed manifest without turning pending images into ready artifacts", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-assets-manager-"));
  const channel = channelFor("deep_space");
  const recorded = [];
  let requestedItems = [];
  try {
    const result = await prepareSceneAssets({
      jobId: "job-assets-01",
      projectDir: directory,
      channel,
      engineType: "science",
      manifest: { scenes: [
        { scene_index: 1, asset_type: "IMAGE_AI", visual_intent: "A documentary view of a nebula" },
        { scene_index: 2, asset_type: "TEXT", visual_intent: "A single large year label" },
        { scene_index: 3, asset_type: "CHART", visual_intent: "Plot a measured orbit" },
      ] },
      imageGenerator: async ({ items }) => {
        requestedItems = items;
        return { ready: [], pending: items.map((item) => item.key) };
      },
      artifactRenderer: async ({ scene, assetType, projectDir: root }) => {
        const artifactType = assetType === "TEXT" ? "text" : "chart";
        const filePath = path.join(root, `scene-${scene.scene_index}.${artifactType === "text" ? "txt" : "svg"}`);
        fs.writeFileSync(filePath, `${artifactType}:${scene.visual_intent}`);
        return { artifact_type: artifactType, file_path: filePath };
      },
      recordArtifact: async (args) => {
        const record = { ...args, status: "READY" };
        recorded.push(record);
        return record;
      },
    });
    assert.equal(requestedItems.length, 1);
    assert.deepEqual(result.ready, [2, 3]);
    assert.equal(result.pending.length, 1);
    assert.equal(result.manifest.scenes[0].asset_source, "pending");
    assert.equal(result.manifest.scenes[0].asset_status, "PENDING");
    assert.deepEqual(recorded.map((item) => item.artifact_type).sort(), ["chart", "text"]);
    assert.equal(result.manifest.asset_pipeline.scene_count, 3);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("native CANVAS and TEXT artifacts use the default renderer, while CHART data is never invented", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-native-artifacts-"));
  const channel = channelFor("deep_space");
  const artifacts = [];
  try {
    const result = await prepareSceneAssets({
      jobId: "job-native-artifacts",
      projectDir: directory,
      channel,
      engineType: "science",
      manifest: { scenes: [
        { scene_index: 1, asset_type: "CANVAS", line: "A physical process", visual_intent: "Show energy moving through the system" },
        { scene_index: 2, asset_type: "TEXT", line: "One measured question?", visual_intent: "Reveal the question in two beats" },
      ] },
      imageGenerator: async () => { throw new Error("native scenes must not enter the AI image queue"); },
      recordArtifact: async (args) => {
        const checksum = crypto.createHash("sha256").update(fs.readFileSync(args.file_path)).digest("hex");
        const item = { ...args, checksum, status: "READY" };
        artifacts.push(item);
        return item;
      },
    });
    assert.deepEqual(result.ready, [1, 2]);
    assert.deepEqual(artifacts.map((item) => item.artifact_type).sort(), ["canvas", "text"]);
    const qa = await checkSceneAssets({ manifest: result.manifest, artifacts, baseDir: directory });
    assert.equal(qa.passed, true);
    await assert.rejects(() => renderNativeArtifact({
      projectDir: directory,
      assetType: "CHART",
      scene: { scene_index: 3, visual_intent: "A graph without supplied values" },
    }), /requires chart_spec data/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("AI imagery rejects ready manual-image state instead of silently claiming Antigravity provenance", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-ai-source-"));
  try {
    await assert.rejects(() => prepareSceneAssets({
      jobId: "job-ai-source",
      projectDir: directory,
      channel: channelFor("deep_space"),
      engineType: "science",
      manifest: { scenes: [{ scene_index: 1, asset_type: "IMAGE_AI", visual_intent: "A verified astronomical image" }] },
      imageGenerator: async ({ items }) => ({ ready: items.map((item) => item.key), pending: [] }),
      imageStateReader: () => ({ items: { "scene-01-image": { source: "manual" } } }),
      recordArtifact: async () => { throw new Error("must not record manual image as AI"); },
    }), /not the AI image queue/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("AI imagery accepts the Cloudflare fallback and keeps its real source", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-ai-cf-"));
  try {
    const imageFile = path.join(directory, "scenes", "scene_01", "image.png");
    fs.mkdirSync(path.dirname(imageFile), { recursive: true });
    fs.writeFileSync(imageFile, "png bytes");
    const result = await prepareSceneAssets({
      jobId: "job-ai-cf",
      projectDir: directory,
      channel: channelFor("deep_space"),
      engineType: "science",
      manifest: { scenes: [{ scene_index: 1, asset_type: "IMAGE_AI", visual_intent: "A verified astronomical image" }] },
      imageGenerator: async ({ items }) => ({ ready: items.map((item) => item.key), pending: [] }),
      imageStateReader: () => ({ items: { "scene-01-image": { source: "cf_worker" } } }),
      recordArtifact: async (record) => ({ ...record, checksum: "x" }),
    });
    const scene = (result.manifest.storyboard?.scenes || result.manifest.scenes)[0];
    assert.equal(scene.asset_source, "cf_worker");
    assert.equal(scene.asset_status, "READY");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("all declared asset types complete dynamically without requiring 12 AI images", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-assets-ready-"));
  const channel = channelFor("deep_space");
  const records = [];
  const types = ["IMAGE_AI", "CANVAS", "SVG", "TEXT", "MAP", "CHART", "EXISTING_ASSET"];
  const existingAsset = path.join(directory, "source.bin");
  fs.writeFileSync(existingAsset, "existing source asset");
  try {
    const result = await prepareSceneAssets({
      jobId: "job-assets-ready",
      projectDir: directory,
      channel,
      engineType: "science",
      manifest: { scenes: types.map((asset_type, index) => ({
        scene_index: index + 1,
        asset_type,
        visual_intent: `Asset intent ${asset_type}`,
        ...(asset_type === "EXISTING_ASSET" ? { asset_path: existingAsset } : {}),
      })) },
      imageGenerator: async ({ dir, items }) => {
        for (const item of items) {
          const destination = path.join(dir, item.dest);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, "antigravity result");
        }
        return { ready: items.map((item) => item.key), pending: [] };
      },
      imageStateReader: () => ({ items: { "scene-01-image": { source: "antigravity" } } }),
      artifactRenderer: async ({ scene, assetType, projectDir: root }) => {
        const artifactType = assetType.toLowerCase();
        const filePath = path.join(root, `scene-${scene.scene_index}.${artifactType}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ assetType, intent: scene.visual_intent }));
        return { artifact_type: artifactType, file_path: filePath };
      },
      recordArtifact: async (args) => {
        const checksum = crypto.createHash("sha256").update(fs.readFileSync(args.file_path)).digest("hex");
        const record = { ...args, checksum, status: "READY" };
        records.push(record);
        return record;
      },
    });
    assert.deepEqual(result.ready, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(result.pending, []);
    assert.equal(records.length, 7);
    const qa = await checkSceneAssets({
      manifest: result.manifest,
      artifacts: records,
      baseDir: directory,
      imageInspector: async () => ({ width: 768, height: 1365 }),
    });
    assert.equal(qa.passed, true);
    assert.equal(qa.scene_count, types.length);
    assert.equal(result.manifest.scenes[0].asset_source, "antigravity");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("selected TTS provider failures never silently cross-fallback", async () => {
  let edgeCalls = 0;
  let capcutCalls = 0;
  const synthesize = createVoiceSynthesizer({
    edgeProvider: async () => { edgeCalls += 1; throw new Error("Edge voice unavailable"); },
    capcutProvider: async () => { capcutCalls += 1; },
    pitchProcessor: async () => {},
  });
  await assert.rejects(() => synthesize({
    text: "This must stay on Edge.", voice: { id: "en-US-AndrewNeural", provider: "edge" },
    rate: 1, pitch: 0, outPath: path.join(os.tmpdir(), "matrix-failed-voice.mp3"),
  }), /Edge voice unavailable/);
  assert.equal(edgeCalls, 1);
  assert.equal(capcutCalls, 0);
});

test("audio orchestration uses measured TTS durations, explicit providers and resumable voice artifacts", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-audio-"));
  const channel = channelFor("unsolved_mysteries");
  const records = [];
  const synthCalls = [];
  const pitchCalls = [];
  const manifest = { scenes: [
    { scene_index: 1, line: "A short opening question?", visual_intent: "A case file" },
    { scene_index: 2, line: "The measured evidence changes the timeline.", visual_intent: "Three dated documents" },
  ] };
  try {
    const run = (inputManifest) => orchestrateAudioForJob({
      jobId: "job-audio-01",
      projectDir: directory,
      channel,
      manifest: inputManifest,
      artifactReader: async () => records,
      artifactWriter: async (args) => {
        const checksum = crypto.createHash("sha256").update(fs.readFileSync(args.file_path)).digest("hex");
        const record = { ...args, checksum, status: "READY" };
        const prior = records.findIndex((item) => item.scene_index === args.scene_index && item.artifact_type === args.artifact_type);
        if (prior >= 0) records[prior] = record;
        else records.push(record);
        return record;
      },
      voiceSynthesizer: async ({ text, voice, rate, pitch, role, outPath, pitchProcessor }) => {
        synthCalls.push({ text, voice: voice.id, provider: voice.provider, rate, pitch, role });
        const raw = `${outPath}.raw`;
        fs.writeFileSync(raw, `tts:${text}`);
        await pitchProcessor(raw, outPath, pitch);
        fs.rmSync(raw, { force: true });
      },
      pitchProcessor: async (source, output, pitch) => {
        pitchCalls.push(pitch);
        fs.writeFileSync(output, `pitch:${pitch}:${fs.readFileSync(source, "utf8")}`);
      },
      durationProbe: async (filePath) => filePath.includes("scene_01") ? 2.25 : 5.5,
      sfxDetector: () => [{ id: "sfx-whoosh-1", sfxId: "whoosh", start: 0.1, duration: 1.75, volume: 0.45, track: 10, reason: "test cue" }],
    });
    const first = await run(manifest);
    assert.deepEqual(first.scenes.map((scene) => scene.start), [0, 2.25]);
    assert.deepEqual(first.scenes.map((scene) => scene.duration), [2.25, 5.5]);
    assert.equal(first.duration_seconds, 7.75);
    assert.equal(first.sfx_cues.length, 1);
    assert.equal(first.manifest.audio.soundscape_id, "mystery");
    assert.equal(first.manifest.scenes[0].required_artifacts.includes("narration"), true);
    assert.equal(first.manifest.scenes[0].required_artifacts.includes("sfx"), true);
    assert.equal(synthCalls.length, 2);
    assert.deepEqual(pitchCalls, [-1, -1]);

    await run(first.manifest);
    assert.equal(synthCalls.length, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("audio orchestration refuses a voice that speaks another language than the channel publishes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-audio-lang-"));
  const base = channelFor("deep_space");
  const dna = base.resolved_config.channel;
  const channel = {
    ...base,
    resolved_config: {
      ...base.resolved_config,
      channel: { ...dna, audio: { ...dna.audio, voice_id: "vi-VN-NamMinhNeural" }, publishing: { ...dna.publishing, language: "de" } },
    },
  };
  let synthesized = 0;
  try {
    await assert.rejects(() => orchestrateAudioForJob({
      jobId: "job-audio-lang",
      projectDir: directory,
      channel,
      manifest: { scenes: [{ scene_index: 1, line: "Wohin verschwindet Licht?", visual_intent: "A dark disc" }] },
      artifactReader: async () => [],
      artifactWriter: async (args) => args,
      voiceSynthesizer: async () => { synthesized += 1; },
    }), /speaks vi but channel .* publishes in de/);
    assert.equal(synthesized, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
