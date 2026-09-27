// Variant của engine tierlist: registry, dựng HTML mọi variant × composition × nước (lint sạch, tất định), mọi ứng
// viên hiện đúng bậc đúng lúc cảnh đầu của nó bắt đầu; chịu được 7 ứng viên / 6 ứng viên cùng một bậc và fallback.
import assert from "node:assert/strict";
import test from "node:test";
import tierEngine from "../matrix/render/engines/tierlist.mjs";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { compareVariantAxes } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";
import { isSkinVariant } from "./skin-variant-ids.mjs";

const LANGS = ["en", "de", "ja", "ko", "vi"];
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];
const variants = () => listVariants("tierlist").filter((v) => !isSkinVariant(v)); // tierlist/ranking-board: tests/matrix-variants-skins.test.mjs
const PREFIX = { "tierlist/classic-rows": "tc", "tierlist/pyramid": "tp", "tierlist/weapon-rack": "tw", "tierlist/orbit": "to", "tierlist/podium": "tq", "tierlist/store-shelves": "th", "tierlist/unsolved-cases": "tu" };

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
  const built = await variant.renderer.buildHtml({
    slug, title: sample.title, lang, channel: { channel_id: `ch_${lang}` }, manifest: {}, totalDuration,
    extras: extras === undefined ? sample.extras : extras, sfxCues: [], bgmSegments: [], cinemaAudioHtml: "", common: { lang }, scenes, creative,
  });
  return { ...built, scenes };
}

/** Thời điểm tween hiện ứng viên (id `<prefix>-ti-N`) — phải nằm trong cảnh đầu của nó. */
function itemTweenAt(html, prefix, k) {
  const m = html.match(new RegExp(`tl\\.fromTo\\("#${prefix}-ti-${k}", [^;]*?, ([0-9.]+)\\);`, "u"));
  return m ? Number(m[1]) : null;
}

function stressSample() {
  const lines = ["Wir bewerten sieben Kandidaten, von D bis SSS."];
  const names = ["Donaudampfschifffahrtsgesellschaft", "Rindfleischetikettierungsgesetz", "Kraftfahrzeughaftpflicht"];
  const items = [];
  for (let k = 0; k < 7; k += 1) {
    lines.push(`Kandidat ${k + 1} landet in seiner Stufe.`);
    items.push({ name: names[k % 3].slice(0, 32), subtitle: "Beißkraftweltrekordhalter", tier: k === 6 ? "SSS" : "A", first_scene: k + 2, last_scene: k + 2 });
  }
  lines.push("Am Ende thront nur einer an der Spitze.");
  return { title: "Belastungstest der Rangliste", lines, extras: { headline: "Wer verdient SSS?", items } };
}

test("tierlist registers 7 active IMAGE variants with 2 compositions each and ≥ 4/6 differing axes", () => {
  assert.deepEqual(validateRegistry().errors, []);
  const list = variants();
  assert.equal(list.length, 7);
  assert.deepEqual(list.map((v) => v.id).sort(), Object.keys(PREFIX).sort());
  for (const variant of list) {
    assert.equal(variant.status, "active");
    assert.equal(variant.assetProfile.type, "IMAGE_AI");
    assert.equal(variant.costProfile.aiImagesPerScene, 1);
    assert.equal(Object.keys(variant.visualProfile.compositions).length, 2);
    assert.ok(Object.keys(variant.contentProfile.topicPacks).every((id) => id.startsWith("tierlist_")));
    assert.ok(variant.audioProfile.fx.every((fx) => ["none", "creepy", "whisper", "radio"].includes(fx)));
    assert.deepEqual(variant.compatibility.countries, LANGS);
  }
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(compareVariantAxes(list[i], list[j]).differing >= 4, `${list[i].id} ↔ ${list[j].id}`);
});

test("the shared sample carries valid tierlist extras in every language", () => {
  for (const lang of LANGS) {
    const sample = variants()[0].sample(lang);
    assert.equal(sample.lines.length, 6);
    assert.deepEqual(tierEngine.extras.validate(sample.extras, sample.lines.map((line) => ({ line }))), [], lang);
  }
  assert.ok(variants()[0].sample("de").extras.items.some((item) => item.subtitle.length >= 24), "German sample has a long compound");
});

test("every tierlist variant × composition × country builds lint-clean, deterministic HTML with each contender placed on time", async () => {
  for (const variant of variants()) {
    const prefix = PREFIX[variant.id];
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const where = `${variant.id}#${composition}/${lang}`;
        const a = await build(variant, composition, lang);
        const b = await build(variant, composition, lang);
        assert.equal(a.html, b.html, `${where} is not deterministic`);
        assert.deepEqual(lintVariantHtml(a.html), [], where);
        assert.ok(/assets\/images\/scene-2\.svg/u.test(a.html), `${where} shows the AI scene images`);
        assert.doesNotMatch(a.html, /Math\.random|Date\.now/u);
        const extras = variant.sample(lang).extras;
        assert.ok(a.html.includes(escapeHtml(extras.headline)), `${where} headline`);
        for (const tier of ["SSS", "S", "A", "B", "C", "D"]) assert.match(a.html, new RegExp(`>${tier}</(b|span)>`, "u"), `${where} tier label ${tier}`);
        extras.items.forEach((item, k) => {
          assert.ok(a.html.includes(escapeHtml(item.name)), `${where} contender ${item.name}`);
          assert.match(a.html, new RegExp(`id="${prefix}-ti-${k + 1}"`, "u"), `${where} contender ${k + 1} on the board`);
          const at = itemTweenAt(a.html, prefix, k + 1);
          const scene = a.scenes[item.first_scene - 1];
          assert.ok(at !== null && at >= scene.start && at < scene.start + scene.duration, `${where} contender ${k + 1} appears during its scene (at ${at})`);
        });
      }
    }
  }
});

test("7 contenders with 6 in one tier, and missing extras (engine fallback), still build; invalid extras fail loudly", async () => {
  const stress = stressSample();
  assert.deepEqual(tierEngine.extras.validate(stress.extras, stress.lines.map((line) => ({ line }))), []);
  for (const variant of variants()) {
    const prefix = PREFIX[variant.id];
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      const built = await build(variant, composition, "de", { sample: stress });
      assert.deepEqual(lintVariantHtml(built.html), [], `${variant.id}#${composition} stress`);
      for (let k = 1; k <= 7; k += 1) assert.match(built.html, new RegExp(`id="${prefix}-ti-${k}"`, "u"));
      const fallback = await build(variant, composition, "en", { extras: null });
      assert.deepEqual(lintVariantHtml(fallback.html), [], `${variant.id}#${composition} fallback`);
      assert.match(fallback.html, new RegExp(`id="${prefix}-ti-1"`, "u"));
    }
    const composition = Object.keys(variant.visualProfile.compositions)[0];
    await assert.rejects(build(variant, composition, "en", { extras: { headline: "x", items: [] } }), /tierlist extras invalid/u);
  }
});
