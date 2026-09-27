// Base variant của engine science (Phase 2): engine không dùng ảnh cảnh (TEXT) → panel dựng từ câu đọc. Registry, luật
// trục, HTML sạch + tất định cho mọi variant × composition × en/de/ja/ko, dữ liệu (từ khoá, con số, câu) hiện trong HTML.
import assert from "node:assert/strict";
import test from "node:test";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { compareVariantAxes } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";
import { isSkinVariant } from "./skin-variant-ids.mjs";
import { salient } from "../matrix/render/variants/kit/textdata.mjs";

const ENGINE = "science";
const LANGS = ["en", "de", "ja", "ko", "vi"];
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];
const variants = listVariants(ENGINE).filter((v) => !isSkinVariant(v)); // science/explainer-board: tests/matrix-variants-skins.test.mjs

function build(variant, composition, lang) {
  const sample = variant.sample(lang);
  let start = 0.3;
  // Như adapter thật: science không có ảnh cảnh (imgSrc = null).
  const scenes = sample.lines.map((line, i) => {
    const scene = { index: i + 1, id: `scene-${i + 1}`, line, start: Number(start.toFixed(2)), duration: DURATIONS[i], imgSrc: null, voSrc: `assets/vo/line-${i + 1}.mp3` };
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

test("science registers 7 active TEXT base variants, valid and ≥ 4/6 axes apart", () => {
  assert.deepEqual(validateRegistry().errors, []);
  assert.equal(variants.length, 7);
  for (const v of variants) {
    assert.equal(v.status, "active");
    assert.deepEqual(v.compatibility.countries, LANGS);
    assert.equal(v.assetProfile.type, "TEXT", "science uses no scene images today");
    assert.equal(v.costProfile.aiImagesPerScene, 0);
    for (const pack of Object.keys(v.contentProfile.topicPacks)) assert.match(pack, /^science_[a-z_]+$/u);
  }
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) assert.ok(compareVariantAxes(variants[i], variants[j]).differing >= 4, `${variants[i].id} ↔ ${variants[j].id}`);
  }
  for (const id of ["lab-notebook", "microscope-zoom", "space-hud", "xray", "periodic", "quiz-show"]) assert.ok(variants.some((v) => v.id === `science/${id}`), id);
  const lecture = variants.find((v) => v.id === "science/lecture-whiteboard");
  assert.equal(lecture.visualProfile.fingerprintAxes.background, "whiteboard", "chalkboards belong to the chalk engine");
});

test("every science variant × composition × language builds lint-clean, deterministic, image-free HTML with script data", () => {
  for (const variant of variants) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const where = `${variant.id}#${composition}/${lang}`;
        const { html, sample } = build(variant, composition, lang);
        assert.deepEqual(lintVariantHtml(html), [], where);
        assert.equal(build(variant, composition, lang).html, html, `${where} byte-identical`);
        assert.doesNotMatch(html, /<img\b/u, `${where} must not reference scene images`);
        assert.doesNotMatch(html, /src="null"/u, where);
        assert.ok(html.includes(escapeHtml(sample.title)), `${where} title`);
        for (const line of sample.lines) assert.ok(html.includes(escapeHtml(line)), `${where} line`);
        // Dữ liệu panel lấy từ kịch bản: từ khoá của từng cảnh phải hiện trên hình.
        for (const line of sample.lines) assert.ok(html.includes(escapeHtml(salient(line, lang))), `${where} keyword of "${line}"`);
      }
    }
  }
});

test("microscope-zoom animates through magnification levels and quiz reveals exactly one answer per scene", () => {
  const zoom = variants.find((v) => v.id === "science/microscope-zoom");
  for (const composition of Object.keys(zoom.visualProfile.compositions)) {
    const { html } = build(zoom, composition, "en");
    for (let i = 1; i <= 6; i += 1) assert.ok(html.includes(`×${(10 ** i).toLocaleString("en")}`), `level ×10^${i}`);
    assert.match(html, /tl\.fromTo\("#sc-cells-1", \{"scale":0\.45\}/u);
  }
  const quiz = variants.find((v) => v.id === "science/quiz-show");
  for (const composition of Object.keys(quiz.visualProfile.compositions)) {
    const { html } = build(quiz, composition, "de");
    const reveals = html.match(/"backgroundColor":"#1f9d55"/gu) || [];
    assert.equal(reveals.length, 6, `${composition}: one correct answer per scene`);
  }
});
