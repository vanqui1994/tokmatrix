// Clip stock cho variant wildlife stock-first (docs/MATRIX_VARIANT_SYSTEM_V2.md mục 9.3, AGENTS.md "Stock video"): bật thì
// cảnh lấy clip qua bkt_web.stock_video (mock ở đây, không mạng), tắt / không có clip thì dùng ảnh AI và ghi fallback;
// render ra <video class="clip"> câm không nằm trong phần tử có data-start, tất định, hash composition gồm file clip.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareSceneAssets, variantUsesStock } from "../matrix/creative/asset-manager.mjs";
import { materializeStockClip, requestStockClip, stockQueries, stockSegmentLength, stockVideoEnabled } from "../matrix/creative/stock-video.mjs";
import { sceneImageSourceOk } from "../matrix/qa/asset-qa.mjs";
import { buildNativeVideoProject, duplicateMediaIds } from "../matrix/render/native-engine-adapter.mjs";
import { getVariant, listVariants } from "../matrix/render/variants/index.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";

// Fixture riêng (không import file test wildlife: import một file test chạy lại toàn bộ test của nó).
const GERMAN_EXTRAS = {
  common_name: "Schwertwal (Orca)", latin_name: "Orcinus orca", habitat: "Alle Ozeane", iucn_status: "DD",
  stats: [
    { label: "GESCHWINDIGKEIT", value: "56 km/h", level: 80 }, { label: "GEHIRNMASSE", value: "5–6 kg", level: 92 },
    { label: "GRUPPENGRÖSSE", value: "5–30 Tiere", level: 70 },
  ],
  callouts: [{ scene: 2, text: "JAGD IM FAMILIENVERBAND" }],
};
const LINES = [
  "Orcas sind die klügsten Jäger der Meere.", "Sie jagen im Familienverband.", "Wellen spülen Robben von den Eisschollen.",
  "Ihr Gehirn wiegt mehr als fünf Kilogramm.", "Manche Gruppen ziehen keine Kälber mehr auf.", "Würdest du einem Orca begegnen wollen?",
];
const DURATIONS = [2.1, 4.6, 4.3, 4.1, 4.9, 3.6];

function channelFor(language) {
  const channel = structuredClone(resolveChannelsForTopic("unsolved_mysteries", 1)[0]);
  const inner = channel.resolved_config?.channel || channel.channel || channel;
  inner.publishing = { ...(inner.publishing || {}), language };
  return channel;
}

function createWildlifeFixture(root, { channel, extras }) {
  const projectDir = path.join(root, "prepared-wildlife");
  const videoDir = path.join(root, "output-wildlife");
  fs.mkdirSync(path.join(projectDir, "assets", "audio"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "assets", "audio", "bgm.mp3"), "prepared background music");
  let t = 0;
  const scenes = LINES.map((line, i) => {
    const index = i + 1;
    const sceneDir = path.join(projectDir, "scenes", `scene_${String(index).padStart(2, "0")}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, "narration.mp3"), `spoken line ${index}`);
    fs.writeFileSync(path.join(sceneDir, "visual.jpg"), `visual scene ${index}`);
    const scene = {
      scene_index: index, line, visual_intent: `Wildlife documentary shot ${index}`, start_seconds: Number(t.toFixed(3)), duration_seconds: DURATIONS[i],
      narration_path: path.relative(projectDir, path.join(sceneDir, "narration.mp3")),
      asset_type: "IMAGE_AI", asset_source: "antigravity", asset_status: "READY", asset_path: path.relative(projectDir, path.join(sceneDir, "visual.jpg")),
    };
    t += DURATIONS[i] + 0.15;
    return scene;
  });
  const end = Math.max(...scenes.map((scene) => scene.start_seconds + scene.duration_seconds));
  const job = { job_id: "wildlife-stock-job", batch_id: "batch-test", channel_id: channel.channel_id, engine_type: "wildlife", video_slug: "wildlife-stock-test", created_at: 1 };
  const manifest = {
    topic: { title: "Orcas" }, script: { title: "Warum Orcas die klügsten Jäger sind", scenes, engine_extras: { engine: "wildlife", source: "llm", data: extras } },
    angle: { angle_id: "angle_01", hook: "Der klügste Jäger?" }, blueprint: { blueprint_id: "documentary" }, channel, scenes,
    audio: { duration_seconds: end, bgm_segments: [{ start: 0, duration: Math.ceil(end + 1.2), mediaStart: 0, volume: 0.12, isBoost: false }], sfx_cues: [] },
  };
  return { projectDir, videoDir, job, manifest };
}

const STOCK_FIRST = ["wildlife/deep-ocean", "wildlife/field-guide", "wildlife/migration-map", "wildlife/nature-doc", "wildlife/savanna-hud", "wildlife/trail-cam"];
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function variantChannel(variantId, language = "de") {
  const channel = channelFor(language);
  const inner = channel.resolved_config?.channel || channel.channel || channel;
  // asset-manager nhận kênh đã giải (channelContext), native adapter đọc resolved_config.channel: gán cho cả hai.
  const creative = { ...inner.creative, preferred_engines: ["wildlife"], variant_id: variantId, dna: defaultDna(getVariant(variantId)) };
  inner.creative = creative;
  channel.creative = creative;
  return channel;
}

const SCENES = [
  { scene_index: 1, line: "Orcas jagen im Familienverband.", visual_intent: "Orca pod hunting a seal near an ice floe", estimated_duration_seconds: 3.1 },
  { scene_index: 2, line: "Ihr Gehirn ist riesig.", visual_intent: "Ein Orca taucht unter dem Eis", estimated_duration_seconds: 2.4 },
  { scene_index: 3, line: "Sie leben bis zu neunzig Jahre.", visual_intent: "Old orca swimming slowly in deep blue water", estimated_duration_seconds: 2.9 },
];

/** Mock của `python3 -m bkt_web.stock_video scene`: cảnh nào có clip do `hits` quyết định (theo câu tìm đầu tiên). */
function mockProvider(hits) {
  const calls = [];
  let next = 100;
  const provider = async (request) => {
    calls.push({ ...request, exclude: [...(request.exclude || [])] });
    const hit = hits(request);
    if (!hit) return { ok: false, reason: "no_clip" };
    fs.writeFileSync(request.out, `raw clip ${next}`);
    next += 1;
    return {
      ok: true,
      clip: {
        provider: "pexels", provider_clip_id: String(next), canonical_url: `https://www.pexels.com/video/${next}/`, license: "Pexels License",
        author: "Ann Author", sha256: "a".repeat(64), path: request.out, segment: [2, 2 + request.segmentLength], clip_duration: 30,
        account: 7, query: request.queries[0],
      },
    };
  };
  return { provider, calls };
}

// Cắt/poster giả (không ffmpeg): ghi bytes xác định theo đoạn.
async function fakeMaterialize({ raw, segment, clipPath, posterPath }) {
  fs.writeFileSync(clipPath, `trimmed ${fs.readFileSync(raw, "utf8")} ${segment.join("-")}`);
  fs.writeFileSync(posterPath, `poster ${segment.join("-")}`);
  return { duration: Number((segment[1] - segment[0]).toFixed(3)) };
}

async function prepare(channel, { enabled = true, hits = () => true, manifestScenes = SCENES, provider } = {}) {
  const projectDir = tmp("stock-assets-");
  const mock = provider || mockProvider(hits);
  const recorded = [];
  const imageRequests = [];
  const result = await prepareSceneAssets({
    jobId: "stock-job-01",
    projectDir,
    channel,
    engineType: "wildlife",
    manifest: { topic: { title: "Why orcas are the smartest hunters in the ocean" }, scenes: manifestScenes, script: { engine_extras: { data: GERMAN_EXTRAS } } },
    imageGenerator: async ({ items }) => { imageRequests.push(...items.map((item) => item.key)); return { ready: [], pending: items.map((i) => i.key), exhausted: [] }; },
    imageStateReader: () => ({ items: {} }),
    recordArtifact: async (args) => { recorded.push(args); return { ...args, status: "READY" }; },
    accountCacheRoot: tmp("stock-cache-"),
    stockEnabled: enabled,
    stockProvider: mock.provider,
    stockMaterializer: fakeMaterialize,
  });
  return { result, recorded, imageRequests, calls: mock.calls, projectDir };
}

test("only the realistic-footage wildlife variants are stock-first; microscope and stat-battle stay AI-first", () => {
  const stockFirst = listVariants("wildlife").filter((v) => v.assetProfile.stockVideo === true).map((v) => v.id).sort();
  assert.deepEqual(stockFirst, STOCK_FIRST);
  for (const variant of listVariants("wildlife")) {
    assert.equal(variant.assetProfile.type, "IMAGE_AI", "the image slot stays (poster or AI image), composition never changes");
    assert.equal(variant.costProfile.stockClipsPerScene, variant.assetProfile.stockVideo ? 1 : 0);
  }
  assert.equal(variantUsesStock(variantChannel("wildlife/deep-ocean"), "wildlife"), true);
  assert.equal(variantUsesStock(variantChannel("wildlife/microscope"), "wildlife"), false);
  assert.equal(variantUsesStock(channelFor("de"), "wildlife"), false, "legacy channels never fetch stock");
  assert.equal(stockVideoEnabled({}), false);
  assert.equal(stockVideoEnabled({ TOKMATRIX_STOCK_VIDEO: "1" }), true);
});

test("stock queries are English keywords: scene intent when English, then the topic, never a German intent", () => {
  assert.deepEqual(stockQueries({ scene: SCENES[0], manifest: { topic: { title: "Why orcas are the smartest hunters in the ocean" } } }),
    ["orca pod hunting seal near", "orcas smartest hunters ocean", "orcas smartest"]);
  assert.deepEqual(stockQueries({ scene: SCENES[1], manifest: { topic: { title: "Snow leopards" } } }), ["snow leopards"]);
  assert.deepEqual(stockQueries({ scene: { visual_intent: "海の中のシャチ" }, manifest: { topic: "シャチ" } }), []);
  assert.equal(stockSegmentLength({ estimated_duration_seconds: 3.1 }), 6);
  assert.equal(stockSegmentLength({ estimated_duration_seconds: 30 }), 20);
  assert.equal(stockSegmentLength({}), 7);
});

test("stock on: a stock-first scene gets a clip + poster, records both artifacts and skips the AI queue", async () => {
  const { result, recorded, imageRequests, calls, projectDir } = await prepare(variantChannel("wildlife/deep-ocean"), { hits: (r) => !r.queries[0].startsWith("orcas") });
  // Cảnh 2 có ý hình tiếng Đức → chỉ tìm theo chủ đề → mock không có clip → ảnh AI.
  assert.deepEqual(imageRequests, ["scene-02-image"]);
  const [one, two, three] = result.manifest.scenes;
  assert.equal(one.asset_source, "stock_video");
  assert.equal(one.asset_status, "READY");
  assert.equal(one.stock.provider, "pexels");
  assert.equal(one.stock.license, "Pexels License");
  assert.equal(one.stock.author, "Ann Author");
  assert.equal(one.stock.canonical_url, "https://www.pexels.com/video/101/");
  assert.deepEqual(one.stock.segment, [2, 8]);
  assert.equal(one.asset_path, one.stock.poster_path);
  assert.ok(one.required_artifacts.includes("segment_video"));
  assert.ok(fs.existsSync(path.join(projectDir, one.stock.clip_path)));
  assert.ok(!fs.existsSync(path.join(projectDir, "scenes", "scene_01", "stock-raw.mp4")), "the raw download is removed after trimming");
  assert.equal(two.asset_source, "pending");
  assert.equal(two.stock_miss, "no_clip");
  assert.equal(three.asset_source, "stock_video");
  assert.deepEqual(recorded.map((r) => [r.scene_index, r.artifact_type]), [[1, "image"], [1, "segment_video"], [3, "image"], [3, "segment_video"]]);
  // Không dùng lại clip trong cùng video: cảnh sau loại các clip cảnh trước đã lấy.
  assert.deepEqual(calls.map((c) => c.exclude), [[], ["pexels:101"], ["pexels:101"]]);
  assert.ok(calls.every((c) => c.channelId === variantChannel("wildlife/deep-ocean").channel_id));
  assert.deepEqual(result.manifest.asset_pipeline.fallbacks, [{ scene: 2, from: "stock_video", to: "IMAGE_AI", reason: "no_clip" }]);
  assert.equal(result.manifest.asset_pipeline.providers.STOCK_VIDEO, "stock_ledger");
  assert.ok(sceneImageSourceOk(one));
  assert.ok(!sceneImageSourceOk({ ...one, required_artifacts: ["image"] }), "a stock poster without its checked clip is not accepted");
});

test("a deferred job keeps its clips and does not search again for scenes that had none", async () => {
  const channel = variantChannel("wildlife/trail-cam");
  const first = await prepare(channel, { hits: (r) => !r.queries[0].startsWith("orcas") });
  // Lượt sau ở project khác: file clip cũ không còn → lấy lại clip; cảnh đã ghi stock_miss không tìm lại.
  const second = await prepare(channel, { manifestScenes: first.result.manifest.scenes });
  assert.equal(second.calls.length, 2, "scene 2 (stock_miss) is not searched again");
  assert.deepEqual(second.result.manifest.asset_pipeline.fallbacks, [{ scene: 2, from: "stock_video", to: "IMAGE_AI", reason: "no_clip" }]);
});

test("same project re-run reuses the kept clip files without calling the stock CLI", async () => {
  const channel = variantChannel("wildlife/nature-doc");
  const projectDir = tmp("stock-rerun-");
  const mock = mockProvider(() => true);
  const run = (scenes) => prepareSceneAssets({
    jobId: "stock-job-02", projectDir, channel, engineType: "wildlife", manifest: { topic: { title: "Orca hunting" }, scenes },
    imageGenerator: async ({ items }) => ({ ready: [], pending: items.map((i) => i.key), exhausted: [] }),
    imageStateReader: () => ({ items: {} }), recordArtifact: async (args) => ({ ...args, status: "READY" }),
    accountCacheRoot: tmp("stock-cache-"), stockEnabled: true, stockProvider: mock.provider, stockMaterializer: fakeMaterialize,
  });
  const first = await run(SCENES);
  assert.equal(mock.calls.length, 3);
  const second = await run(first.manifest.scenes);
  assert.equal(mock.calls.length, 3, "no new CLI call");
  assert.deepEqual(second.manifest.scenes.map((s) => s.stock?.provider_clip_id), first.manifest.scenes.map((s) => s.stock?.provider_clip_id));
  assert.deepEqual(second.pending, []);
});

test("stock off: every scene uses the AI queue and the fallback is recorded, the CLI is never called", async () => {
  const { result, imageRequests, calls } = await prepare(variantChannel("wildlife/savanna-hud"), { enabled: false });
  assert.equal(calls.length, 0);
  assert.deepEqual(imageRequests, ["scene-01-image", "scene-02-image", "scene-03-image"]);
  assert.deepEqual(result.manifest.asset_pipeline.fallbacks.map((f) => [f.scene, f.from, f.to, f.reason]),
    [[1, "stock_video", "IMAGE_AI", "disabled"], [2, "stock_video", "IMAGE_AI", "disabled"], [3, "stock_video", "IMAGE_AI", "disabled"]]);
  assert.ok(result.manifest.scenes.every((scene) => !scene.stock && !scene.stock_miss));
});

test("AI-first variants and legacy channels never touch stock and record nothing", async () => {
  for (const channel of [variantChannel("wildlife/microscope"), channelFor("de")]) {
    const { result, calls } = await prepare(channel);
    assert.equal(calls.length, 0);
    assert.deepEqual(result.manifest.asset_pipeline.fallbacks, []);
    assert.equal(result.manifest.asset_pipeline.providers.STOCK_VIDEO, undefined);
  }
});

test("requestStockClip calls the Python CLI with channel, queries and exclusions, and never throws", async () => {
  const seen = [];
  const ok = await requestStockClip({
    channelId: "extreme_wildlife_03", queries: ["orca hunting", "orca"], out: "/tmp/x.mp4", minDuration: 6, segmentLength: 6, exclude: ["pexels:1"],
    env: { TOKMATRIX_PYTHON: "python-test" },
    runner: async (cmd, args, options) => { seen.push({ cmd, args, options }); return { stdout: 'log line\n{"ok": true, "clip": {"provider": "pexels", "provider_clip_id": "9"}}\n' }; },
  });
  assert.deepEqual(ok, { ok: true, clip: { provider: "pexels", provider_clip_id: "9" } });
  assert.equal(seen[0].cmd, "python-test");
  assert.deepEqual(seen[0].args, ["-m", "bkt_web.stock_video", "scene", "--channel", "extreme_wildlife_03", "--out", "/tmp/x.mp4",
    "--min-duration", "6", "--segment-length", "6", "--query", "orca hunting", "--query", "orca", "--exclude", "pexels:1"]);
  const refused = await requestStockClip({ channelId: "x", queries: ["q"], out: "o", minDuration: 5, segmentLength: 5, runner: async () => ({ stdout: '{"ok": false, "reason": "unmapped_channel"}' }) });
  assert.deepEqual(refused, { ok: false, reason: "unmapped_channel" });
  const crashed = await requestStockClip({ channelId: "x", queries: ["q"], out: "o", minDuration: 5, segmentLength: 5, runner: async () => { throw new Error("python3: not found"); } });
  assert.match(crashed.reason, /^error: python3: not found/u);
});

// --- Render --------------------------------------------------------------------------------------------------------
function stockFixture(root, { variantId = "wildlife/deep-ocean", clipBytes = "mp4 clip bytes" } = {}) {
  const fixture = createWildlifeFixture(root, { channel: variantChannel(variantId), extras: GERMAN_EXTRAS });
  // Cảnh 1 và 3 là clip stock (poster trong slot ảnh, clip là segment_video).
  for (const index of [1, 3]) {
    const scene = fixture.manifest.scenes[index - 1];
    const sceneDir = path.join(fixture.projectDir, "scenes", `scene_${String(index).padStart(2, "0")}`);
    fs.writeFileSync(path.join(sceneDir, "stock.mp4"), `${clipBytes} ${index}`);
    fs.writeFileSync(path.join(sceneDir, "stock-poster.jpg"), `poster ${index}`);
    const sha = createHash(`${clipBytes} ${index}`);
    Object.assign(scene, {
      asset_source: "stock_video", asset_path: path.relative(fixture.projectDir, path.join(sceneDir, "stock-poster.jpg")),
      required_artifacts: ["image", "segment_video", "narration"],
      stock: {
        provider: "pexels", provider_clip_id: `55${index}`, canonical_url: `https://www.pexels.com/video/55${index}/`, license: "Pexels License",
        author: "Ann Author", source_sha256: "b".repeat(64), segment: [1, 4], source_duration: 20, duration: index === 1 ? 1.5 : 9,
        account: 7, clip_path: path.relative(fixture.projectDir, path.join(sceneDir, "stock.mp4")), file_sha256: sha,
        poster_path: path.relative(fixture.projectDir, path.join(sceneDir, "stock-poster.jpg")),
      },
    });
  }
  return fixture;
}

function createHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

test("a stock scene renders a muted <video class=clip> outside any timed wrapper; the rest stays images", async () => {
  const root = tmp("stock-render-");
  const fixture = stockFixture(root);
  const project = await buildNativeVideoProject(fixture);
  const html = fs.readFileSync(path.join(project.video_dir, "index.html"), "utf8");
  const videos = html.match(/<video\b[^>]*>/gu) || [];
  assert.equal(videos.length, 2);
  const [first, third] = videos;
  assert.match(first, /id="v-clip-1" class="clip v-clip" src="assets\/video\/scene-1\.mp4" data-start="0" data-duration="1.5" data-track-index="3" muted playsinline/u);
  assert.match(third, /id="v-clip-3"/u);
  // Cửa sổ cảnh 3 ngắn hơn đoạn clip (9 s) → video dừng ở biên cảnh.
  const scene3 = fixture.manifest.scenes[2];
  const window3 = Number((fixture.manifest.scenes[3].start_seconds - scene3.start_seconds).toFixed(3));
  assert.match(third, new RegExp(`data-start="${scene3.start_seconds}" data-duration="${window3}"`, "u"));
  assert.ok(!/crossorigin|autoplay|\sloop/u.test(videos.join("")));
  // Wrapper của cảnh stock không có data-start (HyperFrames: video_nested_in_timed_element), cảnh ảnh vẫn là clip.
  assert.match(html, /<div id="v-scene-1" class="v-scene v-scene-free" data-stock-scene="1">/u);
  assert.match(html, /<div id="v-scene-2" class="clip v-scene" data-start=/u);
  for (const match of html.matchAll(/<video\b[^>]*>/gu)) {
    const before = html.slice(0, match.index);
    const open = before.lastIndexOf('<div id="v-scene-');
    assert.ok(!/data-start/u.test(before.slice(open, before.indexOf(">", open))), "the stock scene wrapper is untimed");
  }
  assert.match(html, /tl\.set\("#v-scene-3", \{"visibility":"hidden"\}, 0\);/u);
  assert.match(html, /tl\.set\("#v-scene-3", \{"visibility":"visible","display":"block"\}, /u);
  assert.match(html, /tl\.set\("#v-scene-1", \{"display":"none"\}, /u);
  assert.ok(!html.includes('tl.set("#v-scene-1", {"visibility":"hidden"}'), "scene 1 starts at 0: never hidden first");
  assert.match(html, /<img class="v-poster" src="assets\/images\/scene-1\.jpg"/u);
  assert.deepEqual(duplicateMediaIds(html), []);
  assert.deepEqual(lintVariantHtml(html), []);
  assert.ok(!/(?:src|href)\s*=\s*["']https?:/iu.test(html), "no network URL in the HTML");
  assert.equal(fs.readFileSync(path.join(project.video_dir, "assets", "video", "scene-3.mp4"), "utf8"), "mp4 clip bytes 3");
  const meta = JSON.parse(fs.readFileSync(path.join(project.video_dir, "meta.json"), "utf8"));
  assert.deepEqual(meta.creative.stock_clips.map((c) => [c.scene, c.file, c.provider, c.provider_clip_id, c.license, c.author]),
    [[1, "assets/video/scene-1.mp4", "pexels", "551", "Pexels License", "Ann Author"], [3, "assets/video/scene-3.mp4", "pexels", "553", "Pexels License", "Ann Author"]]);
  assert.equal(meta.creative.asset_sources[0], "stock_video");
  assert.equal(meta.creative.asset_sources[1], "antigravity");
});

test("stock HTML is deterministic and the composition hash covers the clip bytes", async () => {
  const a = await buildNativeVideoProject(stockFixture(tmp("stock-det-a-")));
  const b = await buildNativeVideoProject(stockFixture(tmp("stock-det-b-")));
  assert.equal(fs.readFileSync(path.join(a.video_dir, "index.html"), "utf8"), fs.readFileSync(path.join(b.video_dir, "index.html"), "utf8"));
  assert.equal(a.composition_hash, b.composition_hash);
  const c = await buildNativeVideoProject(stockFixture(tmp("stock-det-c-"), { clipBytes: "other clip bytes" }));
  assert.equal(fs.readFileSync(path.join(a.video_dir, "index.html"), "utf8"), fs.readFileSync(path.join(c.video_dir, "index.html"), "utf8"));
  assert.notEqual(a.composition_hash, c.composition_hash, "same HTML, different clip file → different composition");
});

test("a stock clip whose bytes changed after it was fetched is refused at build time", async () => {
  const fixture = stockFixture(tmp("stock-tamper-"));
  fs.writeFileSync(path.join(fixture.projectDir, fixture.manifest.scenes[0].stock.clip_path), "swapped footage");
  await assert.rejects(buildNativeVideoProject(fixture), /source manifest or asset checksums changed|stock clip checksum changed/u);
});

test("scenes without stock keep byte-identical HTML (no stock CSS, every scene a clip)", async () => {
  const plain = createWildlifeFixture(tmp("stock-none-"), { channel: variantChannel("wildlife/deep-ocean"), extras: GERMAN_EXTRAS });
  const project = await buildNativeVideoProject(plain);
  const html = fs.readFileSync(path.join(project.video_dir, "index.html"), "utf8");
  assert.ok(!html.includes("<video"));
  assert.ok(!html.includes("v-scene-free"));
  const meta = JSON.parse(fs.readFileSync(path.join(project.video_dir, "meta.json"), "utf8"));
  assert.equal(meta.creative.stock_clips, undefined);
});

function hasFfmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
}

test("materializeStockClip cuts exactly the ledger segment into a silent 1080x1920 MP4 plus a poster", { skip: !hasFfmpeg() && "needs ffmpeg" }, async () => {
  const dir = tmp("stock-cut-");
  const raw = path.join(dir, "raw.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=25", "-f", "lavfi", "-i", "sine=frequency=440",
    "-t", "8", "-shortest", "-c:v", "libx264", "-c:a", "aac", raw]);
  const clipPath = path.join(dir, "stock.mp4");
  const posterPath = path.join(dir, "stock-poster.jpg");
  const { duration } = await materializeStockClip({ raw, segment: [2, 5], clipPath, posterPath });
  assert.ok(Math.abs(duration - 3) < 0.15, `duration ${duration}`);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", clipPath], { encoding: "utf8" }));
  assert.deepEqual(probe.streams.map((s) => s.codec_type), ["video"], "no audio track: narration + BGM only");
  assert.deepEqual([probe.streams[0].width, probe.streams[0].height], [1080, 1920]);
  assert.ok(fs.statSync(posterPath).size > 0);
});
