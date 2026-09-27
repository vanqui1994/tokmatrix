// Base variant của engine folklore (Phase 2, docs/MATRIX_VARIANT_SYSTEM_V2.md): registry, luật trục, HTML sạch + tất định
// cho mọi variant × composition × en/de/ja/ko, dữ liệu (câu đọc, tiêu đề, ảnh cảnh) hiện trong HTML.
import assert from "node:assert/strict";
import test from "node:test";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { compareVariantAxes } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";

const ENGINE = "folklore";
const LANGS = ["en", "de", "ja", "ko", "vi"];
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];
const variants = listVariants(ENGINE);

function build(variant, composition, lang) {
  const sample = variant.sample(lang);
  let start = 0.3;
  const scenes = sample.lines.map((line, i) => {
    const scene = { index: i + 1, id: `scene-${i + 1}`, line, start: Number(start.toFixed(2)), duration: DURATIONS[i], imgSrc: `assets/images/scene-${i + 1}.jpg`, voSrc: `assets/vo/line-${i + 1}.mp3` };
    start += DURATIONS[i] + 0.3;
    return scene;
  });
  const slug = `t-${variant.id.replace("/", "-")}-${composition}-${lang}`;
  const creative = resolveCreativeContext({ variant, dna: defaultDna(variant, composition), lang, channelId: `test_${lang}`, slug });
  const built = variant.renderer.buildHtml({
    slug, title: sample.title, lang, channel: { channel_id: `test_${lang}` }, manifest: {}, totalDuration: Math.ceil(start + 0.9),
    extras: null, sfxCues: [], bgmSegments: [], cinemaAudioHtml: "", common: { lang }, scenes, creative,
  });
  return { html: built.html, sample };
}

test("folklore registers 8 active base variants, valid and ≥ 4/6 axes apart", () => {
  const registry = validateRegistry();
  assert.deepEqual(registry.errors, []);
  assert.equal(variants.length, 8);
  for (const v of variants) {
    assert.equal(v.status, "active");
    assert.deepEqual(v.compatibility.countries, LANGS);
    assert.equal(v.assetProfile.type, "IMAGE_AI", "folklore keeps one AI image per scene");
    assert.deepEqual(v.audioProfile, { gender: "any", fx: ["creepy"] });
    assert.ok(Object.keys(v.visualProfile.compositions).length >= 2);
    for (const pack of Object.keys(v.contentProfile.topicPacks)) assert.match(pack, /^folklore_[a-z_]+$/u);
  }
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) assert.ok(compareVariantAxes(variants[i], variants[j]).differing >= 4, `${variants[i].id} ↔ ${variants[j].id}`);
  }
});

test("every folklore variant × composition × language builds lint-clean, deterministic HTML showing script, title and images", () => {
  for (const variant of variants) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const where = `${variant.id}#${composition}/${lang}`;
        const { html, sample } = build(variant, composition, lang);
        assert.deepEqual(lintVariantHtml(html), [], where);
        assert.equal(build(variant, composition, lang).html, html, `${where} byte-identical`);
        assert.ok(html.includes(escapeHtml(sample.title)), `${where} title`);
        for (const line of sample.lines) assert.ok(html.includes(escapeHtml(line)), `${where} line`);
        for (let i = 1; i <= sample.lines.length; i += 1) assert.ok(html.includes(`assets/images/scene-${i}.jpg`), `${where} image ${i}`);
        assert.doesNotMatch(html, /Fraktur|UnifrakturMaguntia/u, where);
      }
    }
  }
});

test("japanese-yokai-scroll writes vertically only for ja; Latin and Korean stay horizontal", () => {
  const yokai = variants.find((v) => v.id === "folklore/japanese-yokai-scroll");
  for (const composition of Object.keys(yokai.visualProfile.compositions)) {
    assert.match(build(yokai, composition, "ja").html, /class="v-text t-vertical is-cjk"/u);
    for (const lang of ["en", "de", "ko"]) assert.doesNotMatch(build(yokai, composition, lang).html, /class="v-text t-vertical/u, `${composition}/${lang}`);
  }
});

test("haunted-vhs is one 4:3 tape frame with rewind, not a multi-camera grid", () => {
  const vhs = variants.find((v) => v.id === "folklore/haunted-vhs");
  for (const composition of Object.keys(vhs.visualProfile.compositions)) {
    const { html } = build(vhs, composition, "en");
    assert.doesNotMatch(html, /f-cctv|v-cam-/u);
    assert.match(html, /fk-rew/u);
    assert.equal((html.match(/id="v-frame-1"/gu) || []).length, 1);
  }
  assert.match(build(vhs, "tape_play", "en").html, /width:1080px;height:810px/u, "4:3 frame");
});
