// Phase 0 của Creative Identity System (docs/MATRIX_VARIANT_SYSTEM_V2.md): registry, luật trục, DNA, dispatch
// tương thích ngược, khoá engine, validator YAML, HTML variant (lint, tất định, chữ dài, CJK).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildNativeVideoProject, duplicateMediaIds } from "../matrix/render/native-engine-adapter.mjs";
import { getVariant, getVariantCreativeCapacity, getVariantsForCountry, listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { AXES, ENGINES, compareVariantAxes, validateVariant, validateVariantSet } from "../matrix/render/variants/schema.mjs";
import { DNA_FIELDS, DNA_VERSION, accountSeed, defaultDna, dnaSignature, validateDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { countryTheme } from "../matrix/render/variants/kit/theme.mjs";
import { TYPOGRAPHY } from "../matrix/render/variants/kit/profiles.mjs";
import { KIT_VERSION } from "../matrix/render/variants/kit/VERSION.mjs";
import { FONT_PACKAGES, fontFacesFor, stackFamily } from "../matrix/render/variants/kit/fonts.mjs";
import { variantEngine } from "../matrix/planner/template-selector.mjs";
import { validateChannelCreative, validateConfigs } from "../tools/matrix-config-validator.mjs";
import { costJson, variantsJson, voicesJson } from "../tools/list-variants.mjs";
import { buildPreview } from "../tools/preview-variants.mjs";
import { createMysteryFixture } from "./variant-fixtures.mjs";

const REF = "mystery/reference-dossier";

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const restore = () => { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; };
  try {
    const out = fn();
    if (out && typeof out.then === "function") return out.finally(restore);
    restore();
    return out;
  } catch (error) { restore(); throw error; }
}

const reference = () => getVariant(REF, { allowReference: true });
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "variants-"));

async function build({ lang = "de", creative, env = {} } = {}) {
  const root = tmp();
  return withEnv(env, async () => {
    const result = await buildNativeVideoProject(createMysteryFixture(root, { lang, creative }));
    return {
      ...result,
      html: fs.readFileSync(path.join(result.video_dir, "index.html"), "utf8"),
      meta: JSON.parse(fs.readFileSync(path.join(result.video_dir, "meta.json"), "utf8")),
    };
  });
}

// --- Registry + schema -------------------------------------------------------------------------------------------
test("registry is valid, has one index per engine, and only the Phase 0 reference variant is not active", () => {
  const registry = validateRegistry();
  assert.deepEqual(registry.errors, []);
  assert.ok(registry.warnings.every((w) => w.includes(REF)), registry.warnings.join("\n"));
  const dir = path.resolve("matrix/render/variants");
  for (const engine of ENGINES) assert.ok(fs.existsSync(path.join(dir, engine, "index.mjs")), engine);
  assert.equal(ENGINES.length, 10);
  assert.ok(!ENGINES.includes("kinetic"));
  const ids = listVariants().map((v) => v.id);
  assert.ok(ids.includes(REF));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(listVariants().every((v) => v.id === REF || v.status === "active"));
  assert.equal(reference().status, "reference");
  assert.deepEqual(validateVariant(reference()), []);
});

test("reference variants are never returned for assignment unless explicitly allowed", () => {
  withEnv({ MATRIX_ALLOW_REFERENCE_VARIANTS: "0" }, () => {
    assert.equal(getVariant(REF), null);
    assert.ok(!getVariantsForCountry("de").some((v) => v.id === REF));
  });
  assert.ok(getVariant(REF, { allowReference: true }));
  assert.ok(getVariantsForCountry("de", { includeReference: true }).some((v) => v.id === REF));
  assert.deepEqual(getVariantCreativeCapacity(REF), { compositions: 2, structural: 2, combinations: 2 * 2 * 3 * 3 * 3 * 3 });
});

test("the 4/6 axis rule is enforced in code between base variants of one engine", () => {
  const base = { ...reference(), status: "active" }; // cặp có variant reference chỉ cảnh báo
  const twin = { ...base, id: "mystery/twin", visualProfile: { ...base.visualProfile, fingerprintAxes: { ...base.visualProfile.fingerprintAxes, typography: "serif", background: "paper" } } };
  assert.equal(compareVariantAxes(base, twin).differing, 2);
  const { errors } = validateVariantSet([base, twin]);
  assert.ok(errors.some((e) => e.includes("mystery/reference-dossier ↔ mystery/twin") && e.includes("2/6")), errors.join("\n"));

  const distinct = { ...twin, id: "mystery/distinct", visualProfile: { ...twin.visualProfile, fingerprintAxes: {
    composition: "radar", textPlacement: "top", background: "tv_static", transition: "cut", imageMotion: "scan_light", typography: "mono",
  } } };
  assert.equal(validateVariantSet([base, distinct]).errors.length, 0);
  // Khác engine chỉ cảnh báo (review chéo), không chặn.
  const other = { ...twin, id: "vox/twin", engine: "vox" };
  const cross = validateVariantSet([base, other]);
  assert.equal(cross.errors.length, 0);
  assert.equal(cross.warnings.length, 1);
});

test("compositions of one variant must differ in structure, not only offsets", () => {
  const base = reference();
  const compositions = { ...base.visualProfile.compositions, clone: { axes: { composition: "hero_image", textPlacement: "bottom" }, describe: "same as hero" } };
  const errors = validateVariant({ ...base, visualProfile: { ...base.visualProfile, compositions } });
  assert.ok(errors.some((e) => e.includes("hero_evidence và clone quá giống")), errors.join("\n"));
  const badAxis = validateVariant({ ...base, visualProfile: { ...base.visualProfile, fingerprintAxes: { ...base.visualProfile.fingerprintAxes, typography: "comic" } } });
  assert.ok(badAxis.some((e) => e.includes("không có trong vocabulary")));
  assert.deepEqual([...AXES], ["composition", "textPlacement", "background", "transition", "imageMotion", "typography"]);
});

// --- Creative DNA --------------------------------------------------------------------------------------------------
test("Creative DNA is deterministic, bounded by the variant and versioned", () => {
  const variant = reference();
  const dna = defaultDna(variant, "hero_evidence");
  assert.deepEqual(Object.keys(dna), DNA_FIELDS);
  assert.deepEqual(validateDna(dna, variant, "de"), []);
  const sig = dnaSignature(dna, { variantId: variant.id, country: "de" });
  assert.equal(sig, dnaSignature({ ...dna }, { variantId: variant.id, country: "DE" }), "same config → same signature");
  for (const [key, value] of [["composition", "evidence_strip"], ["typography", "serif"], ["treatment", "film_grain"], ["image_motion", "handheld"], ["transition", "cut"], ["tone", 2]]) {
    assert.notEqual(dnaSignature({ ...dna, [key]: value }, { variantId: variant.id, country: "de" }), sig, key);
  }
  assert.notEqual(dnaSignature(dna, { variantId: variant.id, country: "ja" }), sig);
  assert.notEqual(dnaSignature({ ...dna, dna_version: DNA_VERSION + 1 }, { variantId: variant.id, country: "de" }), sig);
  assert.equal(accountSeed("ch_1", variant.id), accountSeed("ch_1", variant.id));
  assert.notEqual(accountSeed("ch_1", variant.id), accountSeed("ch_2", variant.id));

  assert.ok(validateDna({ ...dna, typography: "blackletter" }, variant, "de").some((e) => e.includes("allowed")));
  assert.ok(validateDna({ ...dna, variant_version: 2 }, variant, "de").some((e) => e.includes("variant_version")));
  assert.ok(validateDna({ ...dna, composition: "nope" }, variant, "de").length);
  assert.ok(validateDna(dna, variant, "vi").some((e) => e.includes("không hỗ trợ")));
  assert.ok(validateDna({ ...dna, extra: 1 }, variant, "de").some((e) => e.includes("không phải trường DNA")));
});

test("creative context merges layers in one place: country owns palette/script, DNA owns style", () => {
  const variant = reference();
  const dna = { ...defaultDna(variant, "evidence_strip"), typography: "serif", tone: 2 };
  const de = resolveCreativeContext({ variant, dna, lang: "de", channelId: "c1", slug: "s1" });
  const ja = resolveCreativeContext({ variant, dna, lang: "ja", channelId: "c1", slug: "s1" });
  assert.equal(de.fonts.body, '"EB Garamond", serif');
  assert.match(ja.fonts.body, /Noto Serif JP/u);
  assert.equal(ja.theme.script, "ja");
  assert.notDeepEqual(de.theme.palette, ja.theme.palette);
  assert.notDeepEqual(de.theme.palette, countryTheme("de", 0).palette, "tone shifts the country palette");
  assert.equal(de.axes.composition, "split_vertical");
  assert.equal(de.axes.typography, "serif");
  assert.equal(de.observability.renderer_version, `variant:mystery/reference-dossier@1+kit@${KIT_VERSION}`);
  const again = resolveCreativeContext({ variant, dna, lang: "de", channelId: "c1", slug: "s1" });
  assert.equal(again.seeds.video, de.seeds.video);
  assert.equal(again.treatmentCss, de.treatmentCss);
  assert.throws(() => resolveCreativeContext({ variant, dna: { ...dna, tone: 5 }, lang: "de", channelId: "c1", slug: "s1" }), /invalid creative DNA/u);
});

test("font stacks name one HyperFrames-resolvable family plus a generic, never machine-specific fonts", () => {
  for (const [script, table] of Object.entries(TYPOGRAPHY.stacks)) {
    for (const [style, stack] of Object.entries(table)) {
      assert.match(stack, /^"[^"]+", (?:serif|sans-serif|monospace|cursive)$/u, `${script}.${style}`);
      assert.doesNotMatch(stack, /CJK|Hiragino|Apple|Segoe|DejaVu|Courier New|Arial/u, `${script}.${style}`);
    }
  }
  // Mọi họ font có gói offline đã cài.
  for (const table of Object.values(TYPOGRAPHY.stacks)) for (const stack of Object.values(table)) assert.ok(FONT_PACKAGES[stackFamily(stack)], stack);
  // Với chữ Latin mỗi style là một font thật khác nhau (trục typography không chỉ đổi tên).
  assert.equal(new Set(Object.values(TYPOGRAPHY.stacks.latin)).size, Object.keys(TYPOGRAPHY.stacks.latin).length);
});

test("font embedding picks only the unicode-range slices the page text needs, deterministically", () => {
  const compareDir = path.resolve(".");
  const latin = fontFacesFor(["Inter"], "<p>Straße 12</p>", { compareDir });
  const again = fontFacesFor(["Inter"], "<p>Straße 12</p>", { compareDir });
  assert.deepEqual(latin, again);
  assert.ok(latin.files.length >= 2 && latin.files.length <= 4, latin.files.join(","));
  assert.doesNotMatch(latin.css, /https?:/u);
  const ko = fontFacesFor(["Noto Sans KR"], "<p>텐트는 안쪽</p><script>var x='漢字';</script>", { compareDir });
  assert.ok(ko.files.length < 20);
  assert.ok(ko.files.every((file) => file.endsWith(".woff2")));
  assert.throws(() => fontFacesFor(["Comic Sans"], "<p>x</p>", { compareDir }), /no offline package/u);
});

// --- Dispatch + backward compatibility ----------------------------------------------------------------------------
test("legacy channels build exactly as before; MATRIX_VARIANTS=0 falls back to the same legacy HTML", async () => {
  const legacy = await build({ lang: "de" });
  assert.ok(!legacy.html.includes("matrix-creative"));
  assert.equal(legacy.meta.creative, undefined);
  assert.equal(legacy.meta.matrix.renderer_version, "native-template-v1");
  const creative = { variant_id: REF, dna: defaultDna(reference(), "hero_evidence") };
  const killed = await build({ lang: "de", creative, env: { MATRIX_VARIANTS: "0", MATRIX_ALLOW_REFERENCE_VARIANTS: "1" } });
  assert.equal(sha(killed.html), sha(legacy.html));
  assert.equal(killed.meta.creative, undefined);
});

test("a channel with a variant builds through the registry with offline, lint-clean, observable HTML", async () => {
  const variant = reference();
  const creative = { variant_id: REF, dna: defaultDna(variant, "hero_evidence") };
  const env = { MATRIX_ALLOW_REFERENCE_VARIANTS: "1", MATRIX_VARIANTS: "1" };
  const first = await build({ lang: "de", creative, env });
  const second = await build({ lang: "de", creative, env });
  assert.equal(sha(first.html), sha(second.html), "same script/assets/variant/DNA → byte-identical HTML");
  assert.deepEqual(lintVariantHtml(first.html), []);
  assert.deepEqual(duplicateMediaIds(first.html), []);
  assert.doesNotMatch(first.html, /https?:\/\/(?!www\.w3\.org)/u, "no network dependency at render time");
  assert.match(first.html, /gsap\.timeline\(\{ paused: true \}\)/u);
  assert.ok(fs.existsSync(path.join(first.video_dir, "assets", "kit", "gsap.min.js")));
  // Cảnh cuối kéo tới totalDuration (không đuôi đen); thời điểm cảnh giữ nguyên từ TTS.
  const clips = [...first.html.matchAll(/id="v-scene-(\d+)" class="clip v-scene" data-start="([\d.]+)" data-duration="([\d.]+)"/gu)];
  const last = clips.at(-1);
  assert.equal(Number((Number(last[2]) + Number(last[3])).toFixed(3)), first.meta.duration);
  assert.equal(Number(clips[1][2]), 5.2, "scene 2 starts at its measured TTS time");
  const c = first.meta.creative;
  for (const key of ["engine", "variant_id", "variant_version", "creative_dna", "creative_signature", "country", "voice", "renderer_version", "config_version", "kit_version"]) {
    assert.ok(key in c, key);
  }
  assert.equal(c.creative_signature, dnaSignature(creative.dna, { variantId: REF, country: "de" }));
  assert.equal(first.meta.matrix.renderer_version, c.renderer_version);
});

test("long German compounds and CJK lines build with fit hooks and script-specific fonts", async () => {
  const env = { MATRIX_ALLOW_REFERENCE_VARIANTS: "1" };
  const variant = reference();
  const de = await build({ lang: "de", creative: { variant_id: REF, dna: defaultDna(variant, "evidence_strip") }, env });
  assert.match(de.html, /Donaufahrtsschifffahrtsgesellschaftskapitän/u);
  assert.match(de.html, /data-fit data-fit-min/u);
  assert.match(de.html, /data-variant-fit/u);
  for (const lang of ["ja", "ko"]) {
    const built = await build({ lang, creative: { variant_id: REF, dna: defaultDna(variant, "hero_evidence") }, env });
    const family = lang === "ja" ? "Noto Sans JP" : "Noto Sans KR";
    assert.match(built.html, new RegExp(`@font-face\\{font-family:"${family}"`, "u"));
    const fonts = fs.readdirSync(path.join(built.video_dir, "assets", "kit", "fonts"));
    assert.ok(fonts.length > 0 && fonts.length < 60, `only the slices the page uses (${fonts.length})`);
    assert.deepEqual(built.meta.creative.font_families, [family]);
    assert.equal(built.meta.creative.country, lang);
    assert.deepEqual(lintVariantHtml(built.html), []);
  }
});

test("variant/engine mismatch and unknown variants fail loudly instead of falling back", async () => {
  const creative = { variant_id: "mystery/does-not-exist", dna: defaultDna(reference(), "hero_evidence") };
  await assert.rejects(build({ lang: "de", creative }), /unknown or inactive variant/u);
  await assert.rejects(build({ lang: "de", creative: { variant_id: REF, dna: defaultDna(reference()) }, env: { MATRIX_ALLOW_REFERENCE_VARIANTS: "0" } }), /unknown or inactive/u);
});

test("lint catches unseeded randomness, wall clock, network and .clip opacity tweens", () => {
  const html = '<div id="a" class="clip"></div><script src="https://cdn.jsdelivr.net/x.js"></script><script>Math.random();Date.now();tl.to("#a", {opacity:0});</script>';
  const problems = lintVariantHtml(html);
  assert.equal(problems.length, 5, problems.join("\n"));
});

// --- Engine lock --------------------------------------------------------------------------------------------------
test("a variant locks the engine: no topic/compare override, no fallback when blocked", () => {
  const resolved = { channel_id: "c1", resolved_config: { channel: { creative: { variant_id: REF } }, compatibility: { engines: [{ id: "mystery", score: 0.9 }] } } };
  withEnv({ MATRIX_ALLOW_REFERENCE_VARIANTS: "1", MATRIX_VARIANTS: "1" }, () => {
    assert.deepEqual(variantEngine(resolved, ["mystery", "compare"]), { id: "mystery", score: 0.9, variant_id: REF });
    assert.match(variantEngine(resolved, ["compare", "vox"]).skip, /blocked/u);
    assert.equal(variantEngine({ resolved_config: { channel: { creative: {} } } }, ["mystery"]), null);
  });
  withEnv({ MATRIX_VARIANTS: "0" }, () => assert.equal(variantEngine(resolved, ["mystery"]), null));
  withEnv({ MATRIX_ALLOW_REFERENCE_VARIANTS: "0" }, () => assert.match(variantEngine(resolved, ["mystery"]).skip, /inactive/u));
});

// --- Channel YAML schema + validator ------------------------------------------------------------------------------
test("the real channel configs stay valid and none carries a variant yet", () => {
  const result = validateConfigs();
  assert.deepEqual(result.errors, []);
  assert.ok(result.documents.channels.every(({ data }) => !data.creative.variant_id));
});

test("channel validator enforces variant engine, allowed DNA, language and the variant's voice fx", () => {
  const dna = defaultDna(reference(), "hero_evidence");
  const channel = { niche_id: "unsolved_mysteries", creative: { preferred_engines: ["mystery"], variant_id: REF, dna }, audio: {}, publishing: { language: "de" } };
  withEnv({ MATRIX_ALLOW_REFERENCE_VARIANTS: "1" }, () => {
    assert.deepEqual(validateChannelCreative(channel), []);
    assert.ok(validateChannelCreative({ ...channel, creative: { ...channel.creative, preferred_engines: ["mystery", "kinetic"] } }).some((e) => e.includes("exactly [mystery]")));
    assert.ok(validateChannelCreative({ ...channel, creative: { ...channel.creative, dna: { ...dna, treatment: "vhs_noise" } } }).some((e) => e.includes("allowed")));
    assert.ok(validateChannelCreative({ ...channel, publishing: { language: "vi" } }).some((e) => e.includes("không hỗ trợ")));
    assert.ok(validateChannelCreative({ ...channel, audio: { voice_fx: "creepy" } }).some((e) => e.includes("not allowed by")));
    assert.ok(validateChannelCreative({ ...channel, audio: { voice_fx: "robot" } }).some((e) => e.includes("is not one of")));
  });
  withEnv({ MATRIX_ALLOW_REFERENCE_VARIANTS: "0" }, () => assert.ok(validateChannelCreative(channel)[0].includes("not active")));
  assert.deepEqual(validateChannelCreative({ creative: { preferred_engines: ["mystery", "vox"] }, audio: { voice_fx: "none" } }), []);
});

test("channel JSON schema requires variant_id and dna together", () => {
  const dir = tmp();
  const src = path.resolve("config");
  fs.cpSync(src, dir, { recursive: true });
  const file = path.join(dir, "channels", "ancient_mythology_01.yaml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("  visual_style_id:", "  variant_id: mystery/reference-dossier\n  visual_style_id:"));
  const result = validateConfigs({ configDir: dir });
  assert.ok(result.errors.some((e) => e.includes("ancient_mythology_01.yaml") && e.includes("dna")), result.errors.join("\n"));
});

// --- Tools -------------------------------------------------------------------------------------------------------
test("list-variants exposes registry, rules and a cost estimate for Python and review", () => {
  const out = variantsJson({ includeReference: true });
  assert.equal(out.variants.length, listVariants().length);
  assert.equal(out.rules.min_axis_diff_same_engine, 4);
  assert.equal(out.variants.find((v) => v.id === REF).compositions.evidence_strip.axes.background, "paper");
  assert.ok(!variantsJson().variants.some((v) => v.id === REF), "reference variants are not assignable by default");
  const cost = costJson({ scenes: 12, includeReference: true }).variants.find((v) => v.id === REF);
  assert.equal(cost.ai_images_per_video, 12);
  assert.equal(cost.ai_images_per_100_videos, 1200);
  assert.equal(cost.measured, null);
  // Voice DNA dùng cả CapCut (không chỉ Edge); ứng viên CapCut lấy từ Voice.json, không gõ tay tên giọng.
  const voices = voicesJson();
  assert.ok(voices.voices.some((v) => v.provider === "capcut" && v.lang === "de"));
  assert.ok(voices.capcut_candidates.some((v) => v.lang === "ja"));
  const registered = new Set(voices.voices.map((v) => v.id));
  assert.ok(voices.capcut_candidates.every((v) => !registered.has(v.id)));
});

test("preview builds labelled, lint-clean projects for every composition and language", async () => {
  const out = tmp();
  const variant = reference();
  for (const lang of ["en", "de", "ja", "ko"]) {
    const entry = await buildPreview({ variant, composition: "evidence_strip", lang, dna: defaultDna(variant, "evidence_strip"), dnaTag: "a", outDir: out });
    for (const key of ["engine", "variant", "country", "composition", "motion", "typography", "voice"]) assert.ok(entry.labels[key] !== undefined, key);
    assert.equal(entry.labels.country, lang);
    assert.deepEqual(lintVariantHtml(fs.readFileSync(path.join(entry.dir, "index.html"), "utf8")), []);
  }
});
