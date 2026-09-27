// Variant của engine chalk (Phase 2–5): registry, dựng HTML mọi variant × composition × nước (lint sạch, tất định),
// dữ liệu engine (headline, vùng tô sáng, mũi tên, ghim) phải xuất hiện và được animate trên hình.
import assert from "node:assert/strict";
import test from "node:test";
import chalkEngine from "../matrix/render/engines/chalk.mjs";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { compareVariantAxes } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";

const LANGS = ["en", "de", "ja", "ko"];
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];
const variants = () => listVariants("chalk");

function scenesFor(lines) {
  let start = 0.3;
  return lines.map((line, i) => {
    const duration = DURATIONS[i % DURATIONS.length];
    const scene = { index: i + 1, id: `scene-${i + 1}`, line, visual_intent: `beat ${i + 1}`, start: Number(start.toFixed(2)), duration, imgSrc: `assets/images/scene-${i + 1}.svg`, voSrc: `assets/vo/line-${i + 1}.mp3` };
    start += duration + 0.3;
    return scene;
  });
}

async function build(variant, composition, lang, { extras, sample = variant.sample(lang) } = {}) {
  const slug = `t-${variant.id.replace("/", "-")}-${composition}-${lang}`;
  const scenes = scenesFor(sample.lines);
  const totalDuration = Math.ceil(scenes.at(-1).start + scenes.at(-1).duration + 1.2);
  const creative = resolveCreativeContext({ variant, dna: defaultDna(variant, composition), lang, channelId: `ch_${lang}`, slug });
  return variant.renderer.buildHtml({
    slug, title: sample.title, lang, channel: { channel_id: `ch_${lang}` }, manifest: {}, totalDuration,
    extras: extras === undefined ? sample.extras : extras, sfxCues: [], bgmSegments: [], cinemaAudioHtml: "", common: { lang }, scenes, creative,
  });
}

test("chalk registers 7 active TEXT variants with 2 hand-built compositions each and ≥ 4/6 differing axes", () => {
  assert.deepEqual(validateRegistry().errors, []);
  const list = variants();
  assert.equal(list.length, 7);
  for (const variant of list) {
    assert.equal(variant.status, "active");
    assert.equal(variant.assetProfile.type, "TEXT");
    assert.equal(variant.costProfile.aiImagesPerScene, 0);
    assert.equal(Object.keys(variant.visualProfile.compositions).length, 2);
    assert.ok(Object.keys(variant.contentProfile.topicPacks).every((id) => id.startsWith("chalk_")));
    assert.ok(variant.audioProfile.fx.every((fx) => ["none", "creepy", "whisper", "radio"].includes(fx)));
    assert.deepEqual(variant.compatibility.countries, LANGS);
  }
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(compareVariantAxes(list[i], list[j]).differing >= 4, `${list[i].id} ↔ ${list[j].id}`);
});

test("the shared sample carries valid chalk extras for both map types", () => {
  const types = new Set();
  for (const lang of LANGS) {
    const sample = variants()[0].sample(lang);
    assert.equal(sample.lines.length, 6);
    assert.deepEqual(chalkEngine.extras.validate(sample.extras, sample.lines.map((line) => ({ line }))), []);
    types.add(sample.extras.map_type);
  }
  assert.deepEqual([...types].sort(), ["middle-east", "theater"]);
  assert.ok(variants()[0].sample("de").lines.some((line) => line.split(/\s+/u).some((word) => word.length >= 30)), "German sample has a very long compound");
});

test("every chalk variant × composition × country builds lint-clean, deterministic HTML showing the map data", async () => {
  for (const variant of variants()) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const where = `${variant.id}#${composition}/${lang}`;
        const a = await build(variant, composition, lang);
        const b = await build(variant, composition, lang);
        assert.equal(a.html, b.html, `${where} is not deterministic`);
        assert.deepEqual(lintVariantHtml(a.html), [], where);
        assert.ok(!/assets\/images\//u.test(a.html), `${where} must not request AI images`);
        const extras = variant.sample(lang).extras;
        extras.scenes.forEach((scene, i) => {
          const n = i + 1;
          assert.ok(a.html.includes(escapeHtml(scene.headline)), `${where} headline ${n}`);
          for (const item of scene.highlights) assert.ok(a.html.includes(`>${escapeHtml(item.label)}</text>`), `${where} highlight label ${item.label}`);
          scene.highlights.forEach((_, j) => assert.match(a.html, new RegExp(`tl\\.fromTo\\("#cm${n}-hl-${j}-edge"`, "u"), `${where} highlight ${n}.${j} animated`));
          scene.arrows.forEach((_, j) => assert.match(a.html, new RegExp(`tl\\.fromTo\\("#cm${n}-ar-${j}-reveal", \\{"strokeDashoffset":1\\}`, "u"), `${where} arrow ${n}.${j} drawn`));
          scene.markers.forEach((_, j) => assert.match(a.html, new RegExp(`tl\\.fromTo\\("#cm${n}-mk-${j}"`, "u"), `${where} marker ${n}.${j} pops`));
        });
        if (extras.map_type === "theater") for (const zone of extras.zone_labels) assert.ok(a.html.includes(escapeHtml(zone.label)), `${where} zone ${zone.label}`);
      }
    }
  }
});

test("without LLM extras the engine fallback is drawn; invalid extras fail loudly", async () => {
  for (const variant of variants()) {
    const composition = Object.keys(variant.visualProfile.compositions)[0];
    const built = await build(variant, composition, "de", { extras: null });
    assert.deepEqual(lintVariantHtml(built.html), []);
    assert.match(built.html, /id="cm1-hl-0"/u);
    await assert.rejects(build(variant, composition, "en", { extras: { map_type: "atlantis", scenes: [] } }), /chalk extras invalid/u);
  }
});
