// Variant của engine survival (Phase 2–5): registry, dựng HTML mọi variant × composition × nước (lint sạch, tất định),
// dữ liệu engine (eyebrow, metric_labels, cấp/trạng thái/mức độ/chỉ số) phải hiện ra; reactor SVG gốc theo (variant, nước),
// biểu cảm theo mức độ; không dùng bộ mặt meme Mr. Incredible — trừ variant OPT-IN survival/mr-incredible (test riêng ở cuối).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import survivalEngine from "../matrix/render/engines/survival.mjs";
import { getVariant, getVariantsForCountry, listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { FACE_PHASES, facePhase } from "../matrix/render/variants/survival/mr-incredible.mjs";
import { compareVariantAxes } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";
import { EXPRESSIONS, expressionLevel, reactorIdentity, reactorSvg } from "../matrix/render/variants/survival/reactor.mjs";

const LANGS = ["en", "de", "ja", "ko", "vi"];
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];
const MRI = "survival/mr-incredible";
// Variant dùng reactor SVG gốc (mọi survival variant trừ variant opt-in mặt meme).
const variants = () => listVariants("survival").filter((variant) => variant.id !== MRI);
const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function scenesFor(lines) {
  let start = 0.3;
  return lines.map((line, i) => {
    const duration = DURATIONS[i % DURATIONS.length];
    const scene = { index: i + 1, id: `scene-${i + 1}`, line, visual_intent: `beat ${i + 1}`, start: Number(start.toFixed(2)), duration, imgSrc: `assets/images/scene-${i + 1}.svg`, voSrc: `assets/vo/line-${i + 1}.mp3` };
    start += duration + 0.3;
    return scene;
  });
}

async function build(variant, composition, lang, { extras } = {}) {
  const sample = variant.sample(lang);
  const slug = `t-${variant.id.replace("/", "-")}-${composition}-${lang}`;
  const scenes = scenesFor(sample.lines);
  const totalDuration = Math.ceil(scenes.at(-1).start + scenes.at(-1).duration + 1.2);
  const creative = resolveCreativeContext({ variant, dna: defaultDna(variant, composition), lang, channelId: `ch_${lang}`, slug });
  return variant.renderer.buildHtml({
    slug, title: sample.title, lang, channel: { channel_id: `ch_${lang}` }, manifest: {}, totalDuration,
    extras: extras === undefined ? sample.extras : extras, sfxCues: [], bgmSegments: [], cinemaAudioHtml: "", common: { lang }, scenes, creative,
  });
}

test("survival registers 9 active variants (7 base + original look TEXT, mr-incredible IMAGE_AI like the old Studio template) with 2 hand-built compositions each and ≥ 4/6 differing axes", () => {
  assert.deepEqual(validateRegistry().errors, []);
  assert.equal(variants().length, 8);
  const list = listVariants("survival");
  assert.equal(list.length, 9);
  for (const variant of list) {
    assert.equal(variant.status, "active");
    const images = variant.id === "survival/mr-incredible";
    assert.equal(variant.assetProfile.type, images ? "IMAGE_AI" : "TEXT", variant.id);
    assert.equal(variant.costProfile.aiImagesPerScene, images ? 1 : 0, variant.id);
    assert.equal(Object.keys(variant.visualProfile.compositions).length, 2);
    assert.ok(Object.keys(variant.contentProfile.topicPacks).every((id) => id.startsWith("survival_")));
    assert.ok(variant.audioProfile.fx.every((fx) => ["none", "creepy", "whisper", "radio"].includes(fx)));
    assert.deepEqual(variant.compatibility.countries, LANGS);
    assert.notEqual(variant.visualProfile.fingerprintAxes.composition, "porthole", "portholes belong to wildlife");
  }
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(compareVariantAxes(list[i], list[j]).differing >= 4, `${list[i].id} ↔ ${list[j].id}`);
});

test("the shared sample carries valid survival extras with escalating severity", () => {
  for (const lang of LANGS) {
    const sample = variants()[0].sample(lang);
    assert.equal(sample.lines.length, 6);
    assert.deepEqual(survivalEngine.extras.validate(sample.extras, sample.lines.map((line) => ({ line }))), []);
  }
  assert.ok(variants()[0].sample("de").lines.some((line) => line.split(/\s+/u).some((word) => word.length >= 30)), "German sample has a very long compound");
});

test("reactor: one original character per (variant, country), ≥ 6 expressions keyed by severity", () => {
  assert.ok(EXPRESSIONS.length >= 6);
  assert.deepEqual([...new Set(Array.from({ length: 10 }, (_, i) => expressionLevel(i + 1)))], [0, 1, 2, 3, 4, 5, 6]);
  for (let s = 2; s <= 10; s += 1) assert.ok(expressionLevel(s) >= expressionLevel(s - 1), "expression never calms down as severity rises");
  const ids = variants().map((v) => v.id);
  assert.deepEqual(reactorIdentity(ids[0], "de"), reactorIdentity(ids[0], "de"));
  const identities = new Set(ids.flatMap((id) => LANGS.map((lang) => JSON.stringify(reactorIdentity(id, lang)))));
  assert.ok(identities.size >= 24, `only ${identities.size} distinct reactors for ${ids.length * LANGS.length} (variant, country) pairs`);
  const identity = reactorIdentity(ids[0], "en");
  const faces = new Set([1, 2, 3, 5, 6, 8, 10].map((severity) => reactorSvg({ identity, severity, look: { gear: "headband", accent: "#c00", outline: null }, id: "x" })));
  assert.equal(faces.size, 7);
});

test("every survival variant × composition × country builds lint-clean, deterministic HTML showing the levels", async () => {
  for (const variant of variants()) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const where = `${variant.id}#${composition}/${lang}`;
        const a = await build(variant, composition, lang);
        const b = await build(variant, composition, lang);
        assert.equal(a.html, b.html, `${where} is not deterministic`);
        assert.deepEqual(lintVariantHtml(a.html), [], where);
        assert.ok(!/mrincredible|assets\/images\//u.test(a.html), `${where} must not use meme faces or AI images`);
        const { extras } = variant.sample(lang);
        for (const label of extras.metric_labels) assert.ok(a.html.includes(escapeHtml(label)), `${where} metric label ${label}`);
        extras.levels.forEach((level, i) => {
          const n = i + 1;
          assert.ok(a.html.includes(escapeHtml(level.label)), `${where} level label ${n}`);
          assert.ok(a.html.includes(escapeHtml(level.status)), `${where} status ${n}`);
          for (const value of level.metrics) assert.ok(a.html.includes(`${value}%`) || a.html.includes(`<b>${value}</b>`), `${where} metric value ${value}`);
          assert.match(a.html, new RegExp(`<svg class="rx-svg" id="rx-${n}"`, "u"), `${where} reactor ${n}`);
        });
        if (!/"sv-eyebrow"/u.test(a.html)) assert.ok(a.html.includes(escapeHtml(extras.eyebrow)), `${where} eyebrow`);
        assert.ok(a.html.includes(escapeHtml(extras.eyebrow)), `${where} eyebrow`);
      }
    }
  }
});

test("without LLM extras the engine fallback drives the same layout", async () => {
  for (const variant of variants()) {
    const composition = Object.keys(variant.visualProfile.compositions)[1];
    const built = await build(variant, composition, "ko", { extras: null });
    assert.deepEqual(lintVariantHtml(built.html), []);
    assert.match(built.html, /id="rx-6"/u);
  }
});

test("survival/mr-incredible is in the automatic assignment pool (owner decision 29/09)", () => {
  const variant = getVariant(MRI);
  assert.ok(variant);
  assert.equal(variant.autoAssign, true);
  for (const lang of LANGS) assert.ok(getVariantsForCountry(lang).some((v) => v.id === MRI), lang);
  assert.deepEqual(validateRegistry().warnings.filter((w) => w.includes(MRI)), []);
});

test("survival/mr-incredible: the face phase follows severity 1→9 and darkens; images copied offline", async () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => facePhase(i + 1)), [1, 2, 3, 4, 5, 5, 6, 7, 8, 9]);
  const variant = getVariant(MRI);
  const sample = variant.sample("de");
  const phases = sample.extras.levels.map((level) => facePhase(level.severity));
  for (const composition of Object.keys(variant.visualProfile.compositions)) {
    for (const lang of LANGS) {
      const where = `${MRI}#${composition}/${lang}`;
      const a = await build(variant, composition, lang);
      const b = await build(variant, composition, lang);
      assert.equal(a.html, b.html, `${where} is not deterministic`);
      assert.deepEqual(lintVariantHtml(a.html), [], where);
      assert.ok(!/https?:\/\/[^"']*phase-/u.test(a.html), `${where} must not hot-link faces`);
      assert.ok(/assets\/images\/|scene-\d/u.test(a.html), `${where} shows the scene's AI image`);
      const { extras } = variant.sample(lang);
      extras.levels.forEach((level, i) => {
        assert.ok(a.html.includes(`src="assets/kit/mrincredible/phase-${facePhase(level.severity)}.png"`), `${where} face ${i + 1}`);
        assert.ok(a.html.includes(escapeHtml(level.label)), `${where} level label ${i + 1}`);
        assert.ok(a.html.includes(escapeHtml(level.status)), `${where} status ${i + 1}`);
      });
      assert.ok(a.html.includes(escapeHtml(extras.eyebrow)), `${where} eyebrow`);
      if (lang === "de") assert.match(a.html, /STUFE 1\//u, `${where} STUFE label`);
    }
  }
  assert.ok(phases.at(-1) > phases[0], "the face gets more uncanny as severity rises");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mri-"));
  try {
    const copied = await variant.prepareAssets({ targetDir: dir, compareDir: COMPARE_DIR });
    assert.equal(copied.length, FACE_PHASES);
    for (let phase = 1; phase <= FACE_PHASES; phase += 1) assert.ok(fs.statSync(path.join(dir, "assets/kit/mrincredible", `phase-${phase}.png`)).size > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an IMAGE_AI variant on a text engine queues AI images; legacy channels and other variants keep their asset type", async () => {
  const { withVariantAssetType } = await import("../matrix/creative/asset-manager.mjs");
  const scenes = [{ scene_index: 1 }, { scene_index: 2, asset_type: "TEXT" }];
  const dna = defaultDna(getVariant(MRI), "legacy");
  const mri = { channel_id: "x", creative: { variant_id: MRI, dna } };
  assert.deepEqual(withVariantAssetType(scenes, mri, "survival").map((s) => s.asset_type), ["IMAGE_AI", "TEXT"]);
  assert.equal(withVariantAssetType(scenes, { channel_id: "legacy" }, "survival"), scenes);
  const original = { channel_id: "y", creative: { variant_id: "survival/original", dna: defaultDna(getVariant("survival/original"), "scanner") } };
  assert.equal(withVariantAssetType(scenes, original, "survival"), scenes);
});
