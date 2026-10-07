import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { buildNativeVideoProject, markVideoQaPassed, renderEncodeArgs, renderNativeProject, uiText } from "../matrix/render/native-engine-adapter.mjs";

const PILOT_ENGINES = ["mystery", "newspaper", "vox", "folklore", "kinetic", "science"];

function createFixture(root, engineType, channel) {
  const projectDir = path.join(root, `prepared-${engineType}`);
  const videoDir = path.join(root, `output-${engineType}`);
  fs.mkdirSync(path.join(projectDir, "assets", "audio"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "assets", "audio", "bgm.mp3"), "prepared background music");
  const visualType = { mystery: "IMAGE_AI", newspaper: "IMAGE_AI", vox: "SVG", folklore: "IMAGE_AI", kinetic: "TEXT", science: "CANVAS" }[engineType];
  const extension = visualType === "IMAGE_AI" ? "jpg" : visualType === "SVG" ? "svg" : "json";
  const scenes = [1, 2].map((index) => {
    const sceneDir = path.join(projectDir, "scenes", `scene_${String(index).padStart(2, "0")}`);
    fs.mkdirSync(sceneDir, { recursive: true });
    const narrationPath = path.join(sceneDir, "narration.mp3");
    const assetPath = path.join(sceneDir, `visual.${extension}`);
    fs.writeFileSync(narrationPath, `spoken line ${index}`);
    fs.writeFileSync(assetPath, visualType === "SVG" ? "<svg></svg>" : `visual scene ${index}`);
    return {
      scene_index: index,
      line: index === 1 ? "Vì sao manh mối này biến mất?" : "Dữ kiện sau đó đã thay đổi toàn bộ cách chúng ta nhìn nhận sự kiện.",
      visual_intent: `Documentary visual for scene ${index}`,
      start_seconds: index === 1 ? 0 : 26,
      duration_seconds: 26,
      narration_path: path.relative(projectDir, narrationPath),
      asset_type: visualType,
      asset_source: visualType === "IMAGE_AI" ? "antigravity" : "native_renderer",
      asset_status: "READY",
      asset_path: path.relative(projectDir, assetPath),
    };
  });
  const job = {
    job_id: `${engineType}-job`, batch_id: "batch-test", channel_id: channel.channel_id,
    engine_type: engineType, video_slug: `${engineType}-matrix-test`, created_at: 1,
  };
  const manifest = {
    topic: { title: "Một chủ đề thử nghiệm" },
    script: { title: `Giải thích ${engineType}`, scenes },
    angle: { angle_id: "angle_01", hook: "Câu hỏi mới" },
    blueprint: { blueprint_id: "mystery_reveal" },
    channel,
    scenes,
    audio: {
      duration_seconds: 52,
      bgm_segments: [{ start: 0, duration: 52, mediaStart: 0, volume: 0.12, isBoost: false }],
      sfx_cues: [],
    },
  };
  return { projectDir, videoDir, job, manifest };
}

test("all six pilot-native template adapters assemble seekable projects from prepared media without new TTS or AI", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-native-adapters-"));
  try {
    const channels = [
      ...resolveChannelsForTopic("unsolved_mysteries", 10),
      ...resolveChannelsForTopic("deep_space", 10),
    ];
    for (const engineType of PILOT_ENGINES) {
      const channel = channels.find((item) => item.engine_type === engineType);
      assert.ok(channel, `pilot channel is missing engine ${engineType}`);
      const fixture = createFixture(root, engineType, channel);
      const result = await buildNativeVideoProject(fixture);
      const html = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
      const meta = JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8"));
      const compositionId = engineType === "vox" && !meta.creative ? "main" : fixture.job.video_slug;
      assert.ok(html.includes(`data-composition-id="${compositionId}"`), `missing composition root for ${engineType}`);
      assert.ok(html.includes("assets/audio/bgm.mp3"));
      assert.ok(html.includes("assets/vo/"));
      assert.equal(meta.matrix.job_id, fixture.job.job_id);
      assert.equal(meta.type, engineType);
      if (engineType === "vox") {
        await buildNativeVideoProject(fixture);
        const second = fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8");
        assert.equal(second, html);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native renderer requires approval and reuses a passing MP4 for the same job", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-native-render-"));
  try {
    const channel = resolveChannelsForTopic("unsolved_mysteries", 1)[0];
    const fixture = createFixture(root, "mystery", channel);
    const project = await buildNativeVideoProject(fixture);
    await assert.rejects(() => renderNativeProject(project), /explicit approval/);
    let renders = 0;
    const runner = async (command, args) => {
      if (command === "npx") return { stdout: JSON.stringify({ changed: false, from: "0.7.58", to: "0.7.58" }) };
      if (args.includes("render")) {
        renders += 1;
        fs.writeFileSync(project.output_path, "mock MP4 output");
      }
      return { stdout: "", stderr: "" };
    };
    const quality = async () => ({ passed: true, errors: [] });
    const first = await renderNativeProject(project, { approved: true, runner, videoQualityCheck: quality, slot: (task) => task() });
    assert.equal(first.reused, false);
    await markVideoQaPassed(project, { passed: true, metrics: { duration_seconds: 52 } });
    const second = await renderNativeProject(project, { approved: true, runner, videoQualityCheck: quality, slot: (task) => task() });
    assert.equal(second.reused, true);
    assert.equal(renders, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("render slots cap concurrent renders machine-wide and reclaim slots of dead processes", async () => {
  const { withRenderSlot } = await import("../matrix/render/render-slots.mjs");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-slots-"));
  try {
    let active = 0;
    let peak = 0;
    const job = () => withRenderSlot(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active -= 1;
    }, { dir, slots: 2, pollMs: 5, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
    await Promise.all(Array.from({ length: 6 }, job));
    assert.equal(peak, 2);
    assert.deepEqual(fs.readdirSync(dir), []);  // slot được trả sau khi xong

    fs.writeFileSync(path.join(dir, "slot-0.lock"), "999999");  // PID không tồn tại (bị kill giữa render)
    let ran = false;
    await withRenderSlot(async () => { ran = true; }, { dir, slots: 1, pollMs: 5 });
    assert.equal(ran, true);

    await assert.rejects(withRenderSlot(async () => { throw new Error("render lỗi"); }, { dir, slots: 1 }), /render lỗi/);
    assert.deepEqual(fs.readdirSync(dir), []);  // lỗi vẫn trả slot
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Matrix layout fixes: fit script once, newspaper decorative text marked, short kinetic punchline", async () => {
  const { applyMatrixLayoutFixes, shortPunchline } = await import("../matrix/render/native-engine-adapter.mjs");
  const html = '<body><div class="caution-tape-strip" data-layout-allow-overflow>\n  <span>⚠️ FREIGEGEBEN</span></div>'
    + '<svg class="rubber-stamp" viewBox="0 0 1 1"><rect/><text x="1">TOP SECRET</text></svg></body>';
  const fixed = applyMatrixLayoutFixes(html, "newspaper");
  assert.match(fixed, /caution-tape-strip[^>]*>\s*<span data-layout-allow-occlusion>/);
  assert.match(fixed, /<text data-layout-allow-occlusion x="1">/);
  assert.equal((fixed.match(/data-matrix-layout-fit/g) || []).length, 1);
  assert.ok(fixed.indexOf("data-matrix-layout-fit") < fixed.indexOf("</body>"));
  assert.equal(applyMatrixLayoutFixes(fixed, "newspaper"), fixed);  // chạy lại không nhân đôi
  assert.doesNotMatch(applyMatrixLayoutFixes(html, "mystery"), /allow-occlusion/);
  assert.equal(shortPunchline("Nur fünfundsechzig Kilometer trennen Kaliningrad vom russischen Verbündeten."), "Nur fünfundsechzig");
  assert.equal(shortPunchline("Rain under bright sunshine?"), "Rain under bright");
  assert.equal(shortPunchline("NATO-Strategiepapiere-Grenzkorridor"), "NATO-Strategiepapiere-Grenzkorridor");  // từ đơn quá dài: script co chữ lo
});

test("on-screen fixed labels follow the video language, English for unknown ones", () => {
  assert.equal(uiText("scienceEyebrow", "de"), "WISSENSCHAFT ERKLÄRT");
  assert.equal(uiText("narrator", "vi"), "Người dẫn");
  assert.equal(uiText("info", "es"), "INFO");
});

test("render passes fps/quality from env, 24fps standard by default, rejects bad values", () => {
  assert.deepEqual(renderEncodeArgs({}), ["--fps", "24", "--quality", "standard", "--crf", "20"]);
  assert.deepEqual(renderEncodeArgs({ MATRIX_RENDER_FPS: "30", MATRIX_RENDER_QUALITY: "draft" }), ["--fps", "30", "--quality", "draft", "--crf", "20"]);
  assert.deepEqual(renderEncodeArgs({ MATRIX_RENDER_CRF: "0" }), ["--fps", "24", "--quality", "standard"]);
  assert.deepEqual(renderEncodeArgs({ MATRIX_RENDER_CRF: "23" }).slice(-2), ["--crf", "23"]);
  assert.throws(() => renderEncodeArgs({ MATRIX_RENDER_CRF: "5" }));
  assert.throws(() => renderEncodeArgs({ MATRIX_RENDER_FPS: "fast" }));
  assert.throws(() => renderEncodeArgs({ MATRIX_RENDER_QUALITY: "ultra" }));
});

test("npx cache corruption is detected only for the _npx entry named in the error", async () => {
  const { brokenNpxCacheDir, hyperframesSpecs } = await import("../matrix/render/native-engine-adapter.mjs");
  const enotempty = { message: "Command failed: npm run render -- --fps 24\nnpm error code ENOTEMPTY\nnpm error path /opt/tokmatrix/.npm/_npx/266de1d830c51487/node_modules/puppeteer-core/lib/puppeteer/common\nnpm error ENOTEMPTY: directory not empty, rmdir '/opt/tokmatrix/.npm/_npx/266de1d830c51487/node_modules/puppeteer-core/lib'" };
  assert.equal(brokenNpxCacheDir(enotempty), "/opt/tokmatrix/.npm/_npx/266de1d830c51487");
  const tar = { message: "Command failed", stderr: "npm warn tar TAR_ENTRY_ERROR ENOENT: no such file or directory, open '/opt/tokmatrix/.npm/_npx/110f701c48e68d66/node_modules/x/y.js'" };
  assert.equal(brokenNpxCacheDir(tar), "/opt/tokmatrix/.npm/_npx/110f701c48e68d66");
  assert.equal(brokenNpxCacheDir({ message: "Command failed: frame capture timed out" }), null);
  assert.equal(brokenNpxCacheDir({ message: "ENOTEMPTY: directory not empty, rmdir '/opt/tokmatrix/compare_studio/videos/x'" }), null);
  assert.deepEqual(hyperframesSpecs({ scripts: { check: "npx --yes hyperframes@0.8.77 check", render: "npx --yes hyperframes@0.8.77 render --output renders/a.mp4", dev: "vite" } }), ["hyperframes@0.8.77"]);
});

test("render pre-installs HyperFrames under the install lock and repairs a half-installed npx cache once", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-native-npx-"));
  try {
    const channel = resolveChannelsForTopic("unsolved_mysteries", 1)[0];
    const fixture = createFixture(root, "mystery", channel);
    const project = await buildNativeVideoProject(fixture);
    const broken = path.join(root, ".npm", "_npx", "266de1d830c51487");
    fs.mkdirSync(path.join(broken, "node_modules"), { recursive: true });
    const calls = [];
    let locked = 0, renders = 0;
    const runner = async (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "npx" && args.includes("upgrade")) return { stdout: JSON.stringify({ changed: false, from: "0.7.58", to: "0.7.58" }) };
      if (args.includes("render")) {
        renders += 1;
        if (renders === 1) throw Object.assign(new Error(`Command failed: npm run render\nnpm error ENOTEMPTY: directory not empty, rmdir '${broken}/node_modules/puppeteer-core'`), {});
        fs.writeFileSync(project.output_path, "mock MP4 output");
      }
      return { stdout: "", stderr: "" };
    };
    const installLock = async (task) => { locked += 1; return task(); };
    const result = await renderNativeProject(project, { approved: true, runner, videoQualityCheck: async () => ({ passed: true }), slot: (task) => task(), installLock });
    assert.equal(result.reused, false);
    assert.equal(renders, 2);
    assert.equal(fs.existsSync(broken), false);
    assert.equal(calls[0], "npx --yes hyperframes@latest --version");
    assert.ok(calls.includes("npx --yes hyperframes@0.7.58 --version"));
    assert.ok(calls.indexOf("npx --yes hyperframes@0.7.58 --version") < calls.findIndex((c) => c.startsWith("npm run render")));
    assert.ok(locked >= 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rebuild after a template fix replaces a QA-rejected render but never a QA-passed one", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-native-rejected-"));
  try {
    const channel = resolveChannelsForTopic("unsolved_mysteries", 10).find((item) => item.engine_type === "vox");
    const fixture = createFixture(root, "vox", channel);
    const project = await buildNativeVideoProject(fixture);
    const metaPath = path.join(project.video_dir, "meta.json");
    // Giả lập: bản render cũ dựng từ HTML của code engine trước khi sửa (composition khác), trượt Video QA.
    fs.writeFileSync(project.output_path, "old render with a black tail");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    fs.writeFileSync(metaPath, JSON.stringify({ ...meta, matrix: { ...meta.matrix, composition_hash: "old-template" } }));
    const rebuilt = await buildNativeVideoProject(fixture);
    assert.equal(rebuilt.composition_hash, project.composition_hash);
    assert.equal(fs.existsSync(project.output_path), false);
    assert.equal(fs.readFileSync(project.output_path.replace(/\.mp4$/u, ".rejected.mp4"), "utf8"), "old render with a black tail");

    // Bản đã qua QA thì vẫn được bảo vệ.
    fs.writeFileSync(project.output_path, "published render");
    await markVideoQaPassed(rebuilt, { passed: true, metrics: {} });
    const passed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    fs.writeFileSync(metaPath, JSON.stringify({ ...passed, matrix: { ...passed.matrix, composition_hash: "old-template" } }));
    await assert.rejects(() => buildNativeVideoProject(fixture), /different source composition/);
    assert.equal(fs.readFileSync(project.output_path, "utf8"), "published render");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
