// Base variant của engine wildlife (docs/MATRIX_VARIANT_SYSTEM_V2.md Phase 2–5): registry, luật trục, HTML lint sạch
// và tất định cho mọi variant × composition × en/de/ja/ko, dữ liệu HUD loài của engine (tên, Latin, IUCN, chỉ số,
// callout) phải hiện trong HTML, dữ liệu fallback của engine (không Latin/môi trường sống, IUCN NE) vẫn dựng được.
import assert from "node:assert/strict";
import test from "node:test";
import wildlifeEngine from "../matrix/render/engines/wildlife.mjs";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { compareVariantAxes } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";

const LANGS = ["en", "de", "ja", "ko"];
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];
const variants = () => listVariants("wildlife");

function sceneList(lines) {
  let start = 0.3;
  return lines.map((line, i) => {
    const duration = DURATIONS[i % DURATIONS.length];
    const scene = { index: i + 1, id: `scene-${i + 1}`, line, visual_intent: `v${i + 1}`, start: Number(start.toFixed(2)), duration, imgSrc: `assets/images/scene-${i + 1}.jpg`, voSrc: `assets/vo/scene-${i + 1}.mp3` };
    start += duration + 0.3;
    return scene;
  });
}

async function build(variant, composition, lang, { extras } = {}) {
  const sample = variant.sample(lang);
  const scenes = sceneList(sample.lines);
  const totalDuration = Math.ceil(scenes.at(-1).start + scenes.at(-1).duration + 1.2);
  const slug = `wl-test-${variant.id.replace("/", "-")}-${composition}-${lang}`;
  const creative = resolveCreativeContext({ variant, dna: defaultDna(variant, composition), lang, channelId: `test_${lang}`, slug });
  return variant.renderer.buildHtml({
    slug, title: sample.title, lang, channel: { channel_id: `test_${lang}` }, manifest: {}, totalDuration,
    extras: extras === undefined ? sample.extras : extras, sfxCues: [], bgmSegments: [], cinemaAudioHtml: "", common: { lang }, scenes, creative,
  });
}

test("wildlife registers 8 active base variants with 2 compositions each and a clean registry", () => {
  const registry = validateRegistry();
  assert.deepEqual(registry.errors, []);
  assert.ok(!registry.warnings.some((w) => w.includes("wildlife/")), registry.warnings.filter((w) => w.includes("wildlife/")).join("\n"));
  const list = variants();
  assert.equal(list.length, 8);
  for (const variant of list) {
    assert.equal(variant.status, "active");
    assert.equal(variant.assetProfile.type, "IMAGE_AI");
    assert.equal(variant.costProfile.aiImagesPerScene, 1);
    assert.equal(Object.keys(variant.visualProfile.compositions).length, 2);
    assert.deepEqual(variant.compatibility.countries, LANGS);
    assert.ok(variant.audioProfile.fx.every((fx) => ["none", "creepy", "whisper", "radio"].includes(fx)));
    for (const pack of Object.keys(variant.contentProfile.topicPacks)) assert.match(pack, /^wildlife_[a-z_]+$/u);
  }
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      assert.ok(compareVariantAxes(list[i], list[j]).differing >= 4, `${list[i].id} ↔ ${list[j].id}`);
    }
  }
  // Theo review V2 mục 20: chỉ wildlife giữ ô cửa tàu ngầm.
  assert.ok(list.some((v) => v.visualProfile.fingerprintAxes.composition === "porthole"));
});

test("samples carry engine-valid extras in every language", () => {
  for (const variant of variants()) {
    for (const lang of LANGS) {
      const sample = variant.sample(lang);
      assert.equal(sample.lines.length, 6);
      assert.deepEqual(wildlifeEngine.extras.validate(sample.extras, sample.lines.map((line) => ({ line }))), [], `${variant.id} ${lang}`);
    }
  }
  assert.ok(variants()[0].sample("de").lines.some((line) => line.split(/\s+/u).some((word) => word.length >= 30)));
});

test("every variant × composition × language builds lint-clean, deterministic HTML that shows the species HUD", async () => {
  for (const variant of variants()) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const where = `${variant.id}#${composition}/${lang}`;
        const first = await build(variant, composition, lang);
        const second = await build(variant, composition, lang);
        assert.equal(first.html, second.html, `${where} is not deterministic`);
        assert.deepEqual(lintVariantHtml(first.html), [], where);
        assert.equal(first.creative.variant_id, variant.id);
        assert.equal(first.cfg.composition, composition);
        const { extras } = variant.sample(lang);
        const html = first.html;
        assert.ok(html.includes(escapeHtml(extras.common_name)) || html.includes(escapeHtml(extras.common_name.toLocaleUpperCase(lang))), `${where}: common_name`);
        assert.ok(html.includes(extras.latin_name), `${where}: latin_name`);
        assert.ok(html.includes(escapeHtml(extras.habitat)), `${where}: habitat`);
        assert.ok(html.includes(extras.iucn_status), `${where}: iucn`);
        for (const stat of extras.stats) {
          assert.ok(html.includes(escapeHtml(stat.label)), `${where}: stat label ${stat.label}`);
          assert.ok(html.includes(escapeHtml(stat.value)), `${where}: stat value ${stat.value}`);
        }
        for (const callout of extras.callouts) assert.ok(html.includes(escapeHtml(callout.text)), `${where}: callout ${callout.text}`);
        for (const scene of variant.sample(lang).lines) assert.ok(html.includes(escapeHtml(scene)), `${where}: narration line`);
        assert.ok(!/Math\.random|Date\.now/u.test(html));
      }
    }
  }
});

test("engine fallback extras (no Latin name, no habitat, IUCN NE, 2 stats) still build every composition", async () => {
  for (const variant of variants()) {
    const sample = variant.sample("de");
    const extras = wildlifeEngine.extras.fallback(sample.lines.map((line) => ({ line })), { title: sample.title, language: "de" });
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      const built = await build(variant, composition, "de", { extras });
      assert.deepEqual(lintVariantHtml(built.html), [], `${variant.id}#${composition}`);
      assert.ok(built.html.includes("NE"), `${variant.id}#${composition}: NE badge`);
      for (const stat of extras.stats) assert.ok(built.html.includes(escapeHtml(stat.value)), `${variant.id}#${composition}: ${stat.value}`);
    }
  }
});

test("missing extras do not break the layout", async () => {
  for (const variant of variants()) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      const built = await build(variant, composition, "en", { extras: null });
      assert.deepEqual(lintVariantHtml(built.html), [], `${variant.id}#${composition}`);
    }
  }
});
