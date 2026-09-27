// Base variant của engine vox (Phase 2–5, docs/MATRIX_VARIANT_SYSTEM_V2.md): registry, luật trục, HTML mọi
// variant × composition × en/de/ja/ko lint sạch, tất định, và dữ liệu cảnh (title + lời đọc + nhãn UI) có trong HTML.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { MIN_AXIS_DIFF_SAME_ENGINE, compareVariantAxes, validateVariant } from "../matrix/render/variants/schema.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { escapeHtml } from "../matrix/render/variants/kit/primitives.mjs";
import { upper } from "../matrix/render/variants/kit/textdata.mjs";
import { buildPreview } from "../tools/preview-variants.mjs";

const ENGINE = "vox";
const LANGS = ["en", "de", "ja", "ko", "vi"];
const variants = listVariants(ENGINE);
// Chữ hiển thị liền (bỏ thẻ và khoảng trắng): tiêu đề có thể bị tách thành mẩu (chữ cắt dán).
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/gu, "").replace(/<[^>]+>/gu, "").replace(/\s+/gu, "");

function buildFor(variant, composition, lang, dna = defaultDna(variant, composition)) {
  const sample = variant.sample(lang);
  let start = 0.3;
  const scenes = sample.lines.map((line, i) => {
    const duration = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2][i % 6];
    const scene = { index: i + 1, id: `scene-${i + 1}`, line, start: Number(start.toFixed(2)), duration, imgSrc: `assets/images/scene-${i + 1}.jpg`, voSrc: `assets/vo/line-${i + 1}.mp3` };
    start += duration + 0.3;
    return scene;
  });
  const slug = `t-${variant.id.replace("/", "-")}-${composition}-${lang}`;
  const creative = resolveCreativeContext({ variant, dna, lang, channelId: `test_${lang}`, slug });
  return {
    sample,
    built: variant.renderer.buildHtml({
      slug, title: sample.title, lang, channel: { channel_id: `test_${lang}` }, manifest: {}, totalDuration: Math.ceil(start + 0.9),
      extras: sample.extras || null, sfxCues: [], bgmSegments: [], cinemaAudioHtml: "", common: { lang }, scenes, creative,
    }),
  };
}

test("vox registers 7 valid, structurally distinct base variants", () => {
  assert.deepEqual(validateRegistry().errors, []);
  assert.equal(variants.length, 7);
  for (const v of variants) {
    assert.deepEqual(validateVariant(v), [], v.id);
    assert.equal(v.status, "active");
    assert.equal(v.assetProfile.type, "IMAGE_AI");
    assert.equal(v.costProfile.aiImagesPerScene, 1);
    assert.deepEqual(v.compatibility.countries, LANGS);
    assert.ok(Object.keys(v.contentProfile.topicPacks).every((id) => id.startsWith(`${ENGINE}_`)), v.id);
    assert.ok(v.audioProfile.fx.every((fx) => ["none", "creepy", "whisper", "radio"].includes(fx)));
  }
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      assert.ok(compareVariantAxes(variants[i], variants[j]).differing >= MIN_AXIS_DIFF_SAME_ENGINE, `${variants[i].id} ↔ ${variants[j].id}`);
    }
  }
  // Không có cảnh báo chéo engine nào dính variant của engine này.
  assert.ok(!validateRegistry().warnings.some((w) => w.includes(`${ENGINE}/`)), validateRegistry().warnings.join("\n"));
});

test("every vox variant × composition × language builds lint-clean, deterministic HTML with the script data", () => {
  for (const variant of variants) {
    const layouts = new Set();
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const { sample, built } = buildFor(variant, composition, lang);
        const where = `${variant.id}#${composition}/${lang}`;
        assert.deepEqual(lintVariantHtml(built.html), [], where);
        assert.equal(buildFor(variant, composition, lang).built.html, built.html, `${where} not deterministic`);
        assert.ok(visibleText(built.html).includes(escapeHtml(sample.title).replace(/\s+/gu, "")), `${where} title`);
        for (const line of sample.lines) assert.ok(built.html.includes(escapeHtml(line)), `${where} line ${line}`);
        assert.equal((built.html.match(/class="clip v-scene"/gu) || []).length, sample.lines.length, where);
        assert.ok(built.html.includes("data-fit"), where);
        assert.equal(built.cfg.variant_id, variant.id);
        assert.equal(built.cfg.composition, composition);
        if (lang === "en") layouts.add(JSON.stringify(built.creative.layout));
      }
    }
    assert.equal(layouts.size, Object.keys(variant.visualProfile.compositions).length, `${variant.id}: compositions share the same declared layout`);
  }
});

test("vox UI labels are localised and shown for every country", () => {
  const expected = {
    "vox/paper-collage": { en: "EXPLAINED", de: "ERKLÄRT", ja: "解説", ko: "해설", vi: "GIẢI THÍCH" },
    "vox/timeline-explainer": { en: "TIMELINE", de: "ZEITLEISTE", ja: "年表", ko: "타임라인", vi: "DÒNG THỜI GIAN" },
    "vox/map-route": { en: "THE ROUTE", de: "DIE ROUTE", ja: "ルート", ko: "경로", vi: "LỘ TRÌNH" },
    "vox/split-then-now": { en: "THEN & NOW", de: "DAMALS & HEUTE", ja: "当時と現在", ko: "그때와 지금", vi: "XƯA & NAY" },
    "vox/data-card": { en: "BY THE NUMBERS", de: "IN ZAHLEN", ja: "数字で見る", ko: "숫자로 보기", vi: "QUA CON SỐ" },
    "vox/documentary-lowerthird": { en: "DOCUMENTARY", de: "DOKUMENTATION", ja: "ドキュメンタリー", ko: "다큐멘터리", vi: "PHÓNG SỰ" },
    "vox/zine-xerox": { en: "ZINE", de: "FANZINE", ja: "ZINE", ko: "진", vi: "TẠP CHÍ PHOTO" },
  };
  assert.deepEqual(variants.map((v) => v.id).sort(), Object.keys(expected).sort());
  for (const variant of variants) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of LANGS) {
        const html = buildFor(variant, composition, lang).built.html;
        assert.ok(html.includes(escapeHtml(upper(expected[variant.id][lang], lang))), `${variant.id}#${composition}/${lang}`);
      }
    }
  }
});

test("vox previews build as HyperFrames projects (one per variant)", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "vox-variants-"));
  for (const variant of variants) {
    const composition = Object.keys(variant.visualProfile.compositions).at(-1);
    const entry = await buildPreview({ variant, composition, lang: "de", dna: defaultDna(variant, composition), dnaTag: "a", outDir: out });
    const html = fs.readFileSync(path.join(entry.dir, "index.html"), "utf8");
    assert.deepEqual(lintVariantHtml(html), []);
    assert.ok(html.includes("data-variant-fonts"));
    assert.equal(entry.labels.variant, variant.id);
  }
  fs.rmSync(out, { recursive: true, force: true });
});

test("vox data graphics show values taken from the script itself (years, numbers, route pins, ransom title)", () => {
  const get = (id) => variants.find((v) => v.id === id);
  for (const lang of LANGS) {
    const timeline = buildFor(get("vox/timeline-explainer"), "track_below", lang).built.html;
    for (const year of ["1908", "1927"]) assert.ok(timeline.includes(`>${year}</div>`), `timeline ${lang} ${year}`);
    assert.ok(timeline.includes('id="vt-ptr"') && timeline.includes('tl.to("#vt-ptr"'), `timeline pointer ${lang}`);
    const card = buildFor(get("vox/data-card"), "stat_top", lang).built.html;
    assert.ok(/class="vd-num-t"[^>]*>1908</u.test(card), `data card ${lang}`);
    const ring = buildFor(get("vox/data-card"), "ring_gauge", lang).built.html;
    assert.ok(ring.includes("strokeDashoffset"), `ring gauge ${lang}`);
    const map = buildFor(get("vox/map-route"), "route_map", lang).built.html;
    assert.equal((map.match(/class="vm-pin"/gu) || []).length, 6, `route pins ${lang}`);
    const zine = buildFor(get("vox/zine-xerox"), "xerox_page", lang).built.html;
    assert.ok((zine.match(/class="vz-p /gu) || []).length >= 2, `ransom title ${lang}`);
  }
});
