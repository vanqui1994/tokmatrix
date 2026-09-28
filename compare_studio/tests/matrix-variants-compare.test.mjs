// Variant của engine compare: registry, dựng HTML mọi variant × composition × nước (lint sạch, tất định), hai đối
// tượng + tiêu chí + giá trị mỗi hiệp phải hiện; chịu được nhiều hiệp / tên rất dài, fallback và extras lỗi (engine
// compare làm sạch từng hiệp thay vì từ chối).
import assert from "node:assert/strict";
import test from "node:test";
import compareEngine from "../matrix/render/engines/compare.mjs";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { compareVariantAxes } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";

const LANGS = ["en", "de", "ja", "ko", "vi"];
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];
const IDS = ["compare/boxing-ring", "compare/scale-balance", "compare/split-screen", "compare/card-game", "compare/race-track", "compare/courtroom", "compare/tier-duel", "compare/original"];
const variants = () => listVariants("compare");

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

function stressSample() {
  const names = ["Donaudampfschifffahrtsgesellschaft", "Rindfleischetikettierungsgesetz", "Kraftfahrzeughaftpflicht"];
  const lines = ["Donaudampfschiff gegen Rindfleischetikett: wer gewinnt?"];
  const rounds = [{ criterion: "Wer gewinnt?", value_a: "", value_b: "", score_a: 0, score_b: 0, winner: "NONE" }];
  const winners = ["A", "B", "TIE", "A", "B", "A", "TIE"];
  winners.forEach((winner, k) => {
    lines.push(`Runde ${k + 1}: ${names[k % 3]} im direkten Vergleich.`);
    rounds.push({ criterion: `Höchstgeschwindigkeit ${k + 1}`, value_a: "1.234.567 km/h", value_b: "Rudelkampferfahrung", score_a: winner === "A" ? 9 : winner === "B" ? 6 : 8, score_b: winner === "B" ? 9 : winner === "A" ? 6 : 8, winner });
  });
  lines.push("Am Ende gewinnt das Donaudampfschiff knapp.");
  rounds.push({ criterion: "Gesamtsieger", value_a: "Knapp vorn", value_b: "Knapp dahinter", score_a: 8, score_b: 7, winner: "A" });
  return { title: "Donaudampfschiff gegen Rindfleischetikett", lines, extras: { subject_a: { name: names[0].slice(0, 28), tag: "Sehr lange Bezeichnung" }, subject_b: { name: "Rindfleischetikett", tag: "Gesetzestext" }, rounds } };
}

test("compare registers 8 active SVG variants (7 base + original look) with 2 compositions each and ≥ 4/6 differing axes", () => {
  assert.deepEqual(validateRegistry().errors, []);
  const list = variants();
  assert.deepEqual(list.map((v) => v.id).sort(), [...IDS].sort());
  for (const variant of list) {
    assert.equal(variant.status, "active");
    assert.equal(variant.assetProfile.type, "SVG");
    assert.equal(variant.costProfile.aiImagesPerScene, 0);
    assert.equal(Object.keys(variant.visualProfile.compositions).length, 2);
    assert.ok(Object.keys(variant.contentProfile.topicPacks).every((id) => id.startsWith("compare_")));
    assert.ok(variant.audioProfile.fx.every((fx) => ["none", "creepy", "whisper", "radio"].includes(fx)));
    assert.deepEqual(variant.compatibility.countries, LANGS);
  }
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(compareVariantAxes(list[i], list[j]).differing >= 4, `${list[i].id} ↔ ${list[j].id}`);
});

test("the shared sample carries valid compare extras in every language", () => {
  for (const lang of LANGS) {
    const sample = variants()[0].sample(lang);
    assert.equal(sample.lines.length, 6);
    assert.deepEqual(compareEngine.extras.validate(sample.extras, sample.lines.map((line) => ({ line }))), [], lang);
  }
  assert.ok(variants()[0].sample("de").lines.some((line) => line.split(/\s+/u).some((word) => word.length >= 30)), "German sample has a very long compound");
});

test("every compare variant × composition × country builds lint-clean, deterministic HTML showing both subjects and every round", async () => {
  for (const variant of variants()) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const where = `${variant.id}#${composition}/${lang}`;
        const a = await build(variant, composition, lang);
        const b = await build(variant, composition, lang);
        assert.equal(a.html, b.html, `${where} is not deterministic`);
        assert.deepEqual(lintVariantHtml(a.html), [], where);
        assert.ok(!/assets\/images\//u.test(a.html), `${where} must not request AI images`);
        assert.doesNotMatch(a.html, /Math\.random|Date\.now/u);
        const extras = variant.sample(lang).extras;
        for (const subject of [extras.subject_a, extras.subject_b]) assert.ok(a.html.includes(escapeHtml(subject.name)), `${where} subject ${subject.name}`);
        extras.rounds.slice(1, -1).forEach((round, i) => {
          assert.ok(a.html.includes(escapeHtml(round.criterion)), `${where} criterion ${i + 2}`);
          assert.ok(a.html.includes(escapeHtml(round.value_a)) && a.html.includes(escapeHtml(round.value_b)), `${where} values ${i + 2}`);
        });
      }
    }
  }
});

test("many rounds with very long names, missing extras (fallback) and malformed rounds still build", async () => {
  const stress = stressSample();
  assert.deepEqual(compareEngine.extras.validate(stress.extras, stress.lines.map((line) => ({ line }))), []);
  for (const variant of variants()) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      const where = `${variant.id}#${composition}`;
      const built = await build(variant, composition, "de", { sample: stress });
      assert.deepEqual(lintVariantHtml(built.html), [], `${where} stress`);
      assert.ok(built.html.includes("Höchstgeschwindigkeit 7"), `${where} last round shown`);
      const fallback = await build(variant, composition, "en", { extras: null });
      assert.deepEqual(lintVariantHtml(fallback.html), [], `${where} fallback`);
      const broken = await build(variant, composition, "en", { extras: { subject_a: { name: "" }, rounds: [null, { winner: "?" }] } });
      assert.deepEqual(lintVariantHtml(broken.html), [], `${where} malformed extras`);
    }
  }
});
