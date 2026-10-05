import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vector, { nicheAllowed } from "../matrix/render/engines/vector.mjs";
import { extendedEngine } from "../matrix/render/engines/index.mjs";
import { RENDERABLE_ENGINES } from "../matrix/render/native-engine-adapter.mjs";

const LINES = [
  "Was wäre, wenn du eine Nacht auf dem Mars verbringen müsstest?",
  "Der Rote Planet ist eisig kalt.",
  "Seine dünne Luft besteht fast nur aus Kohlendioxid.",
  "Saturn trägt Ringe aus Eis und Gestein.",
  "Vielleicht schauen eines Tages Menschen von dort zur Erde.",
];

function ctx(lang = "de", channel = { channel_id: "deep_space_t1", niche_id: "deep_space", publishing: { language: lang } }) {
  let t = 0;
  const scenes = LINES.map((line, i) => {
    const duration = 3.5 + (i % 2);
    const scene = { scene_index: i + 1, index: i + 1, id: `scene-${i + 1}`, start: t, duration, line, visual_intent: line, voSrc: `assets/vo/vec-${i + 1}.mp3` };
    t += duration + 0.2;
    return scene;
  });
  const totalDuration = Math.ceil(t + 1.2);
  return {
    slug: "vector-test", title: "Mars", lang, channel, manifest: {}, totalDuration, extras: { fallback: true }, sfxCues: [], bgmSegments: [],
    cinemaAudioHtml: "", common: { lang, topicTitle: "Eine Nacht auf dem Mars", fullScriptHtml: "", watermark: "@test" }, scenes,
  };
}

test("vector is a ready CANVAS engine, registered and renderable", () => {
  assert.equal(extendedEngine("vector"), vector);
  assert.equal(vector.assetType, "CANVAS");
  assert.equal(vector.voPrefix, "vec");
  assert.ok(RENDERABLE_ENGINES.includes("vector"));
  assert.equal(vector.compositionId("abc"), "abc");
});

test("extras: schema, prompt per niche/language, validation and the fallback marker", () => {
  const schema = vector.extras.schema(5);
  assert.equal(schema.properties.scenes.minItems, 5);
  const prompt = vector.extras.prompt({ script: { scenes: LINES.map((line) => ({ line, visual_intent: line })) }, topic: "Mars", language: "de", channel: { niche_id: "folklore_legends" } });
  assert.match(prompt, /black_forest_village/);
  assert.match(prompt, /do NOT rewrite/);
  const good = { scenes: LINES.map((_, i) => ({ scene_index: i + 1, setting: "mars_surface", subject: i ? "planet_mars" : "none", mood: "happy", beats: [{ type: i ? "reveal" : "enter", who: i ? "subject" : "host" }] })) };
  assert.deepEqual(vector.extras.validate(good, LINES), []);
  const bad = structuredClone(good);
  bad.scenes[1].setting = "rice_paddy";
  bad.scenes[2].beats = [{ type: "dance", who: "host" }];
  bad.scenes[3].beats = [{ type: "reveal", who: "host" }];
  assert.equal(vector.extras.validate(bad, LINES).length, 3);
  assert.deepEqual(vector.extras.validate(vector.extras.fallback(), LINES), []);
  assert.deepEqual(nicheAllowed("deep_space", "ko").settings.includes("space_orbit"), true);
  assert.equal(nicheAllowed("geopolitics_maps", "en"), null);
});

test("buildHtml: offline canvas composition, captions per scene, seekable timeline, deterministic", async () => {
  const first = await vector.buildHtml(ctx());
  const second = await vector.buildHtml(ctx());
  assert.equal(first.html, second.html);
  assert.doesNotMatch(first.html, /https?:\/\/(?!www\.w3\.org)/u, "no CDN or network in the composition");
  assert.match(first.html, /<canvas id="stage" width="1080" height="1920">/u);
  assert.match(first.html, /assets\/vector\/engine\.js/u);
  assert.match(first.html, /window\.__timelines\["vector-test"\] = tl/u);
  assert.match(first.html, /scale: 1\.875/u);
  assert.equal((first.html.match(/class="cap clip"/gu) || []).length, LINES.length);
  assert.equal((first.html.match(/<audio id="vo-/gu) || []).length, LINES.length);
  assert.doesNotMatch(first.html, /requestAnimationFrame|setInterval|Math\.random|Date\.now/u);
  assert.equal(first.cfg.niche, "deep_space");
  assert.equal(first.cfg.scenes.length, LINES.length);
});

test("buildHtml refuses Vietnamese channels and niches without a vector config", async () => {
  await assert.rejects(() => vector.buildHtml(ctx("vi")), /de\/en\/ko\/ja/u);
  await assert.rejects(() => vector.buildHtml(ctx("en", { channel_id: "geo", niche_id: "geopolitics_maps", publishing: { language: "en" } })), /not configured/u);
});

test("prepareAssets bundles the engine, catalog and GSAP locally", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vector-assets-"));
  const files = await vector.prepareAssets({ targetDir: dir });
  assert.deepEqual(files.map((file) => path.relative(dir, file)).sort(), ["assets/kit/gsap.min.js", "assets/vector/catalog.js", "assets/vector/engine.js"]);
  const engine = await fs.readFile(path.join(dir, "assets/vector/engine.js"), "utf8");
  assert.match(engine, /RemakeVector\.register\(/u, "packs are bundled with the core engine");
  await fs.rm(dir, { recursive: true, force: true });
});
