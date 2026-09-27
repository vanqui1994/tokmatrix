// Hệ variant + "bộ da" mỗi acc (docs/MATRIX_VARIANT_SYSTEM_V2.md, docs/PLAN_compare_per_country.md).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { getVariant, validateRegistry } from "../matrix/render/variants/index.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { MIN_SKIN_DISTANCE, assignSkins, skinDistance, skinPairOk, skinViolations } from "../matrix/render/variants/skins.mjs";
import { channelCreative } from "../matrix/render/native-engine-adapter.mjs";
import { planSkins } from "../tools/assign-skins.mjs";
import { validateConfigs } from "../tools/matrix-config-validator.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANNEL_DIR = path.join(COMPARE_DIR, "config", "channels");
const NEWSPAPER = getVariant("newspaper/front-page");

function sampleScenes(lang) {
  let start = 0.3;
  return NEWSPAPER.sample(lang).lines.map((line, i) => {
    const duration = [4.6, 3.9, 5.2, 4.1, 4.8, 3.7][i];
    const scene = { index: i + 1, line, start: Number(start.toFixed(2)), duration, imgSrc: `assets/images/scene-${i + 1}.jpg`, voSrc: `assets/vo/act-${i + 1}.mp3` };
    start += duration + 0.3;
    return scene;
  });
}

async function buildNewspaper(lang, dna, slug = "np-test") {
  const scenes = sampleScenes(lang);
  const totalDuration = Math.ceil(scenes.at(-1).start + scenes.at(-1).duration + 1);
  const creative = resolveCreativeContext({ variant: NEWSPAPER, dna, lang, channelId: `test_${lang}`, slug });
  return NEWSPAPER.renderer.buildHtml({ slug, title: NEWSPAPER.sample(lang).title, lang, totalDuration, cinemaAudioHtml: "", scenes, creative });
}

test("variant registry has no errors and newspaper/front-page is active", () => {
  assert.deepEqual(validateRegistry().errors, []);
  assert.equal(NEWSPAPER?.status, "active");
  assert.deepEqual(Object.keys(NEWSPAPER.visualProfile.compositions), ["front_page", "side_masthead", "magazine_cover"]);
});

test("newspaper builds clean, deterministic HTML for every layout × caption × country", async () => {
  for (const lang of NEWSPAPER.compatibility.countries) {
    for (const composition of Object.keys(NEWSPAPER.visualProfile.compositions)) {
      for (const caption of NEWSPAPER.visualProfile.allowed.caption) {
        const dna = { ...defaultDna(NEWSPAPER, composition), caption };
        const first = await buildNewspaper(lang, dna);
        const second = await buildNewspaper(lang, dna);
        assert.equal(first.html, second.html, `${lang}/${composition}/${caption} is not deterministic`);
        assert.deepEqual(lintVariantHtml(first.html), [], `${lang}/${composition}/${caption}`);
        assert.equal(first.cfg.composition, composition);
        assert.equal(first.cfg.caption, caption);
        assert.match(first.html, /data-text-region="caption"/u);
      }
    }
  }
});

test("country theme changes the masthead font and motif, not the layout", async () => {
  const dna = defaultDna(NEWSPAPER, "front_page");
  const de = (await buildNewspaper("de", dna)).html;
  const en = (await buildNewspaper("en", dna)).html;
  // Font tiêu đề là họ offline của kit/fonts.mjs (không font hệ thống).
  assert.match(de, /\.n-head h1\{font-family:"Oswald", sans-serif/u);
  assert.match(en, /\.n-head h1\{font-family:"Playfair Display", serif/u);
  assert.notEqual(de.match(/n-motif" style="([^"]*)"/u)[1], en.match(/n-motif" style="([^"]*)"/u)[1]);
});

test("skins of two accounts in one country differ in ≥ 4 axes including layout or colour", () => {
  const channels = Array.from({ length: 60 }, (_, i) => ({ channel_id: `ch_${String(i).padStart(2, "0")}`, lang: i % 3 ? "de" : "en" }));
  const first = assignSkins(channels, NEWSPAPER);
  const again = assignSkins([...channels].reverse(), NEWSPAPER);
  assert.deepEqual(first.rows, again.rows, "assignment must not depend on input order");
  assert.deepEqual(first.violations, []);
  const de = first.rows.filter((row) => row.country === "de");
  for (const a of de) for (const b of de) if (a !== b) assert.ok(skinDistance(a.dna, b.dna) >= MIN_SKIN_DISTANCE);
});

test("existing skins are kept and only new channels are assigned", () => {
  const base = assignSkins([{ channel_id: "a", lang: "de" }, { channel_id: "b", lang: "de" }], NEWSPAPER).rows;
  const kept = { variant_id: NEWSPAPER.id, dna: base[0].dna };
  const next = assignSkins([{ channel_id: "a", lang: "de", skin: kept }, { channel_id: "c", lang: "de" }], NEWSPAPER).rows;
  assert.equal(next[0].status, "kept");
  assert.deepEqual(next[0].dna, base[0].dna);
  assert.equal(next[1].status, "new");
  assert.ok(skinPairOk(next[0].dna, next[1].dna));
});

test("skin rule flags pairs that share layout and colour", () => {
  const a = defaultDna(NEWSPAPER, "front_page");
  const b = { ...a, typography: "slab", treatment: "halftone", image_motion: "push_in", transition: "cut" };
  assert.equal(skinDistance(a, b), 4);
  assert.equal(skinPairOk(a, b), false);
  assert.equal(skinViolations([{ channel_id: "a", country: "de", dna: a }, { channel_id: "b", country: "de", dna: b }]).length, 1);
  assert.equal(skinViolations([{ channel_id: "a", country: "de", dna: a }, { channel_id: "b", country: "en", dna: b }]).length, 0);
});

test("every channel config that uses newspaper already has a valid skin", () => {
  const plan = planSkins({ dir: CHANNEL_DIR, variantId: NEWSPAPER.id });
  assert.ok(plan.rows.length >= 80);
  assert.deepEqual(plan.rows.filter((row) => row.status !== "kept").map((row) => row.channel_id), []);
  assert.deepEqual(plan.violations, []);
});

test("render adapter uses the channel's skin for that engine only", () => {
  const skin = { variant_id: NEWSPAPER.id, dna: defaultDna(NEWSPAPER, "side_masthead") };
  const channel = { channel_id: "x", creative: { preferred_engines: ["newspaper", "vox"], skins: { newspaper: skin } } };
  const chosen = channelCreative(channel, "newspaper");
  assert.equal(chosen.variant.id, NEWSPAPER.id);
  assert.equal(chosen.dna.composition, "side_masthead");
  assert.equal(channelCreative(channel, "vox"), null, "an engine without a skin stays on the legacy renderer");
  const previous = process.env.MATRIX_VARIANTS;
  process.env.MATRIX_VARIANTS = "0";
  try { assert.equal(channelCreative(channel, "newspaper"), null); } finally {
    if (previous === undefined) delete process.env.MATRIX_VARIANTS; else process.env.MATRIX_VARIANTS = previous;
  }
  assert.throws(() => channelCreative({ channel_id: "y", creative: { skins: { vox: skin } } }, "vox"), /engine newspaper/u);
});

test("config validator rejects a skin outside preferred_engines or with an invalid DNA", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skins-config-"));
  try {
    fs.cpSync(path.join(COMPARE_DIR, "config"), tmp, { recursive: true });
    const file = path.join(tmp, "channels", "ancient_mythology_03.yaml");
    const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
    doc.setIn(["creative", "preferred_engines"], ["mystery", "kinetic"]);
    doc.setIn(["creative", "skins", "newspaper", "dna", "caption"], "sideways");
    fs.writeFileSync(file, doc.toString());
    const result = validateConfigs({ configDir: tmp });
    const messages = result.errors.join("\n");
    assert.match(messages, /skin newspaper is not in preferred_engines/u);
    assert.match(messages, /caption="sideways"/u);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
