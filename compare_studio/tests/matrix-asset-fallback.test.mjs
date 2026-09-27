// Chuỗi fallback ảnh của variant (docs/PLAN_VARIANT_V2_COMPLETION.md WS-D1): chỉ chạy khi Antigravity đã hết lượt thử,
// chỉ cho kênh có variant/bộ da, không bao giờ âm thầm; kênh legacy giữ hành vi cũ (chờ ảnh).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveChannelsForTopic } from "../matrix/planner/template-selector.mjs";
import { prepareSceneAssets, runImageFallback, variantFallbackChain } from "../matrix/creative/asset-manager.mjs";
import { getVariant } from "../matrix/render/variants/index.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";

const VARIANT = "mystery/cctv";

function channels() {
  const legacy = resolveChannelsForTopic("unsolved_mysteries", 1)[0];
  const variant = getVariant(VARIANT);
  const withVariant = { ...legacy, creative: { ...legacy.creative, preferred_engines: ["mystery"], variant_id: VARIANT, dna: defaultDna(variant) } };
  return { legacy, withVariant };
}

const EMPTY_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "account-cache-empty-"));

async function run(channel, { handlers, exhausted = true, cacheRoot = EMPTY_CACHE, intent = "A dark corridor on a security camera", ready = null } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "asset-fallback-"));
  const recorded = [];
  const result = await prepareSceneAssets({
    jobId: "job-fallback-01",
    projectDir: directory,
    channel,
    engineType: "mystery",
    manifest: { scenes: [{ scene_index: 1, asset_type: "IMAGE_AI", visual_intent: intent }] },
    imageGenerator: async ({ items, dir }) => {
      if (ready) {
        for (const item of items) {
          fs.mkdirSync(path.dirname(path.join(dir, item.dest)), { recursive: true });
          fs.writeFileSync(path.join(dir, item.dest), ready);
        }
        return { ready: items.map((i) => i.key), pending: [], exhausted: [] };
      }
      return { ready: [], pending: items.map((i) => i.key), exhausted: exhausted ? items.map((i) => i.key) : [] };
    },
    imageStateReader: () => ({ items: { "scene-01-image": { source: "antigravity" } } }),
    recordArtifact: async (args) => { recorded.push(args); return { ...args, status: "READY" }; },
    fallbackHandlers: handlers,
    accountCacheRoot: cacheRoot,
  });
  return { result, recorded, directory };
}

test("the fallback chain skips steps without a handler, uses the first that returns a file, and stops at fail", async () => {
  const scene = { scene_index: 3 };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fb-")), "x.png");
  fs.writeFileSync(file, "png");
  assert.deepEqual(
    await runImageFallback({ chain: ["reuse_account_cache", "svg", "fail"], scene, key: "k", handlers: { svg: async () => ({ file_path: file }) } }),
    { step: "svg", file_path: file, source: "svg" },
  );
  await assert.rejects(runImageFallback({ chain: ["reuse_account_cache", "fail"], scene, key: "k" }), /scene 3: AI image k failed every attempt; fallback chain reuse_account_cache > fail ended in fail/u);
  assert.equal(await runImageFallback({ chain: ["reuse_account_cache"], scene, key: "k" }), null);
});

test("only channels with a variant (or skin) get a fallback chain", () => {
  const { legacy, withVariant } = channels();
  assert.equal(variantFallbackChain(legacy, "mystery"), null);
  assert.deepEqual(variantFallbackChain(withVariant, "mystery"), getVariant(VARIANT).assetProfile.fallback);
  assert.equal(variantFallbackChain(withVariant, "vox"), null, "a job of another engine has no variant for that engine");
});

test("an exhausted AI image uses the variant's fallback and is recorded, never silently", async () => {
  const { withVariant } = channels();
  const cached = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cache-")), "same-subject.png");
  fs.writeFileSync(cached, "cached-image");
  const { result, recorded, directory } = await run(withVariant, {
    handlers: { reuse_account_cache: async () => ({ file_path: cached, source: "account_cache" }) },
  });
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.ready, [1]);
  assert.equal(result.manifest.scenes[0].asset_source, "fallback:account_cache");
  assert.deepEqual(result.manifest.asset_pipeline.fallbacks, [{ scene: 1, from: "IMAGE_AI", to: "reuse_account_cache", source: "account_cache" }]);
  assert.equal(fs.readFileSync(path.join(directory, result.manifest.scenes[0].asset_path), "utf8"), "cached-image", "same slot, same composition");
  assert.equal(recorded.length, 1);
});

test("without a usable step the variant job fails; a legacy channel keeps waiting as before", async () => {
  const { legacy, withVariant } = channels();
  await assert.rejects(run(withVariant), /fallback chain .* ended in fail/u);
  const waiting = await run(legacy);
  assert.equal(waiting.result.pending.length, 1);
  assert.deepEqual(waiting.result.manifest.asset_pipeline.fallbacks, []);
  const notYet = await run(withVariant, { exhausted: false });
  assert.equal(notYet.result.pending.length, 1, "images still in the queue are waited for, not replaced");
});

test("the account cache reuses a same-subject image of the SAME channel only", async () => {
  const { withVariant } = channels();
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "account-cache-"));
  // Job 1: Antigravity image arrives → kept in this channel's cache.
  await run(withVariant, { cacheRoot, ready: "antigravity-corridor-image", intent: "Security camera footage of a dark hospital corridor at night" });
  // Job 2, same channel, same subject, AI image exhausted → reused from the account cache.
  const reuse = await run(withVariant, { cacheRoot, intent: "The dark hospital corridor where the security camera went black" });
  assert.equal(reuse.result.manifest.scenes[0].asset_source, "fallback:account_cache");
  assert.equal(fs.readFileSync(path.join(reuse.directory, reuse.result.manifest.scenes[0].asset_path), "utf8"), "antigravity-corridor-image");
  // Another subject → no reuse → the chain ends in fail.
  await assert.rejects(run(withVariant, { cacheRoot, intent: "A red balloon over the ocean" }), /ended in fail/u);
  // Another channel never sees this cache.
  const other = { ...withVariant, channel_id: `${withVariant.channel_id}_other` };
  await assert.rejects(run(other, { cacheRoot, intent: "The dark hospital corridor where the security camera went black" }), /ended in fail/u);
});

test("legacy channels never write to the account cache", async () => {
  const { legacy } = channels();
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "account-cache-legacy-"));
  await run(legacy, { cacheRoot, ready: "legacy-image" });
  assert.deepEqual(fs.readdirSync(cacheRoot), []);
});
