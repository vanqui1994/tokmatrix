#!/usr/bin/env node
// Registry variant dạng JSON cho Python (bkt_web/autopilot/creative_dna.py) và cho người review chi phí.
//
//   node tools/list-variants.mjs [--include-reference]          # variants + luật trục + DNA_VERSION
//   node tools/list-variants.mjs --voices                       # giọng đã đăng ký trong voices.mjs (validator nhận)
//   node tools/list-variants.mjs --cost [--scenes 12] [--include-reference]   # ảnh AI / clip stock ước lượng
//   node tools/list-variants.mjs --signature '<json {dna, variant_id, country}>'  # đối chiếu signature với Python
//
// Chỉ đọc: không ghi file nào.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listVariants, validateRegistry } from "../matrix/render/variants/index.mjs";
import { DNA_FIELDS, DNA_VERSION, dnaSignature, variantCreativeCapacity } from "../matrix/render/variants/dna.mjs";
import { AXES, MIN_AXIS_DIFF_COMPOSITION, MIN_AXIS_DIFF_SAME_ENGINE, effectiveAxes } from "../matrix/render/variants/schema.mjs";
import { CAPTIONS } from "../matrix/render/variants/kit/profiles.mjs";
import { COUNTRIES } from "./voices.mjs";
import { getCapCutCatalog } from "./capcut-tts.mjs";

export function variantsJson({ includeReference = false } = {}) {
  const variants = listVariants().filter((v) => v.status === "active" || (includeReference && v.status === "reference"));
  const { errors, warnings } = validateRegistry();
  return {
    dna_version: DNA_VERSION,
    dna_fields: DNA_FIELDS,
    axes: AXES,
    // Trục DNA ghi đè trục hiệu lực (schema.effectiveAxes).
    dna_axis_overrides: { transition: "transition", image_motion: "imageMotion", typography: "typography" },
    caption_placements: Object.fromEntries(Object.entries(CAPTIONS.items).map(([id, item]) => [id, item.textPlacement])),
    rules: { min_axis_diff_same_engine: MIN_AXIS_DIFF_SAME_ENGINE, min_axis_diff_composition: MIN_AXIS_DIFF_COMPOSITION },
    registry: { errors, warnings },
    variants: variants.map((v) => ({
      id: v.id, version: v.version, engine: v.engine, status: v.status, name_vi: v.name_vi,
      topic_packs: v.contentProfile.topicPacks,
      layout_family: v.visualProfile.layoutFamily,
      fingerprint_axes: v.visualProfile.fingerprintAxes,
      compositions: Object.fromEntries(Object.entries(v.visualProfile.compositions).map(([id, comp]) => [id, {
        describe: comp.describe, axes: effectiveAxes(v, id),
      }])),
      allowed: v.visualProfile.allowed,
      audio: v.audioProfile,
      asset: v.assetProfile,
      cost: v.costProfile,
      countries: v.compatibility.countries,
      niches: v.compatibility.niches ?? null,
      capacity: variantCreativeCapacity(v),
    })),
  };
}

/**
 * Giọng dùng để gán Voice DNA: Edge + CapCut đã đăng ký trong voices.mjs (validator nhận). `capcut_candidates` là
 * phần còn lại của tools/capcut_tts_api/Voice.json theo ngôn ngữ — chỉ được gán sau khi tổng hợp thử đúng ngôn ngữ
 * và đăng ký vào voices.mjs (Phase 1).
 */
export function voicesJson() {
  // `_dsp` = giọng biến âm của CapCut (trẻ em, hài, robot): giọng nhân vật, không dùng làm giọng dẫn trong Voice DNA.
  const voices = COUNTRIES.flatMap((c) => c.voices.map((v) => ({ id: v.id, lang: c.code, provider: v.provider, gender: v.gender, character: /_dsp$/u.test(v.id) })));
  const registered = new Set(voices.map((v) => v.id));
  const langs = new Set(COUNTRIES.map((c) => c.code));
  const capcut_candidates = getCapCutCatalog()
    .map((v) => ({ id: v.voice_type, lang: String(v.lang || v.lan || "").slice(0, 2).toLowerCase(), locale: v.lang, name: v.display_name }))
    .filter((v) => langs.has(v.lang) && !registered.has(v.id))
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.id.localeCompare(b.id));
  return { source: "tools/voices.mjs (registered Edge + CapCut) + tools/capcut_tts_api/Voice.json (candidates)", voices, capcut_candidates };
}

export function costJson({ scenes = 12, includeReference = false } = {}) {
  const rows = listVariants().filter((v) => v.status === "active" || (includeReference && v.status === "reference")).map((v) => {
    const c = v.costProfile;
    const aiPerVideo = Number((scenes * c.aiImagesPerScene * (1 - c.reusableAssetRatio)).toFixed(2));
    return {
      id: v.id, engine: v.engine, scenes,
      ai_images_per_video: aiPerVideo,
      ai_images_per_100_videos: Number((aiPerVideo * 100).toFixed(0)),
      stock_clips_per_video: Number((scenes * c.stockClipsPerScene).toFixed(2)),
      // Render/CPU/RAM/disk chỉ có sau khi đo trên VPS (Phase 1) — không đoán.
      measured: null,
    };
  });
  return { scenes, variants: rows };
}

function parse(argv) {
  const opts = { mode: "variants", includeReference: false, scenes: 12 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--include-reference") opts.includeReference = true;
    else if (key === "--voices") opts.mode = "voices";
    else if (key === "--cost") opts.mode = "cost";
    else if (key === "--scenes") opts.scenes = Number(argv[++i]);
    else if (key === "--signature") { opts.mode = "signature"; opts.payload = JSON.parse(argv[++i]); }
    else throw new Error(`unknown argument ${key}`);
  }
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  const opts = parse(argv);
  let out;
  if (opts.mode === "voices") out = voicesJson();
  else if (opts.mode === "cost") out = costJson(opts);
  else if (opts.mode === "signature") out = { signature: dnaSignature(opts.payload.dna, { variantId: opts.payload.variant_id, country: opts.payload.country }) };
  else out = variantsJson(opts);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) { console.error(`[list-variants] ${error.message}`); process.exitCode = 1; }
}
