#!/usr/bin/env node
// Dựng project HyperFrames xem trước cho mọi variant × composition × nước × DNA (không cần TTS/ảnh thật/Matrix job).
// Ghi <out>/manifest.json (nhãn Creative DNA cho contact sheet) — chụp khung bằng tools/variant_contact_sheet.py.
//
//   node tools/preview-variants.mjs --out /tmp/vp [--engine mystery] [--variant mystery/x] [--langs en,de,ja,ko] [--include-reference]
//   node tools/preview-variants.mjs --out /tmp/vp --engine newspaper --channels de:3,en:2   # bộ da thật của kênh (YAML)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getVariant, listVariants } from "../matrix/render/variants/index.mjs";
import { DNA_FIELDS, defaultDna } from "../matrix/render/variants/dna.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { prepareKitAssets } from "../matrix/render/variants/kit/runtime.mjs";
import { embedFonts } from "../matrix/render/variants/kit/fonts.mjs";
import { loadChannels } from "./assign-skins.mjs";
import { extendedEngine } from "../matrix/render/engines/index.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DURATIONS = [4.6, 3.9, 5.8, 4.4, 5.1, 4.2];

function args(argv) {
  const out = { langs: ["en", "de", "ja", "ko"], includeReference: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--out") out.out = argv[++i];
    else if (key === "--engine") out.engine = argv[++i];
    else if (key === "--variant") out.variant = argv[++i];
    else if (key === "--langs") out.langs = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "--include-reference") out.includeReference = true;
    else if (key === "--channels") out.channels = argv[++i];
    else throw new Error(`unknown argument ${key}`);
  }
  if (!out.out) throw new Error("--out <dir> is required");
  return out;
}

/** DNA "alt": lựa chọn cuối của mỗi trục — cho thấy cùng composition nhưng khác DNA trông khác thế nào. */
function altDna(variant, composition) {
  const allowed = variant.visualProfile.allowed;
  return { ...defaultDna(variant, composition), typography: allowed.typography.at(-1), treatment: allowed.treatment.at(-1),
    image_motion: allowed.image_motion.at(-1), transition: allowed.transition.at(-1), tone: allowed.tone.at(-1) };
}

function placeholderSvg(index, lang) {
  const hue = (index * 53) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,38%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},40%,16%)"/></linearGradient></defs>
<rect width="1080" height="1920" fill="url(#g)"/><circle cx="540" cy="760" r="300" fill="rgba(255,255,255,.12)"/>
<text x="540" y="1000" font-size="260" text-anchor="middle" fill="rgba(255,255,255,.55)" font-family="sans-serif">${index}</text>
<text x="540" y="1180" font-size="60" text-anchor="middle" fill="rgba(255,255,255,.45)" font-family="sans-serif">PREVIEW ${lang.toUpperCase()}</text></svg>`;
}

function silentMp3(file, seconds) {
  if (fs.existsSync(file)) return;
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", String(seconds), "-q:a", "9", file]);
}

export async function buildPreview({ variant, composition, lang, dna, dnaTag, outDir, channelId }) {
  const sample = variant.sample(lang);
  const slug = (channelId ? `preview-${channelId}-${variant.engine}` : `preview-${variant.id.replace("/", "-")}-${composition}-${lang}-${dnaTag}`).replace(/_/gu, "-");
  const dir = path.join(outDir, slug);
  fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "vo"), { recursive: true });
  let start = 0.3;
  const scenes = sample.lines.map((line, i) => {
    const duration = DURATIONS[i % DURATIONS.length];
    const imgSrc = `assets/images/scene-${i + 1}.svg`;
    fs.writeFileSync(path.join(dir, imgSrc), placeholderSvg(i + 1, lang));
    const voSrc = `assets/vo/line-${i + 1}.mp3`;
    silentMp3(path.join(dir, voSrc), duration);
    const scene = { index: i + 1, id: `scene-${i + 1}`, line, visual_intent: `preview ${i + 1}`, start: Number(start.toFixed(2)), duration, imgSrc, voSrc };
    start += duration + 0.3;
    return scene;
  });
  const totalDuration = Math.ceil(start + 0.9);
  const creative = resolveCreativeContext({ variant, dna, lang, channelId: channelId || `preview_${lang}`, slug });
  const built = await variant.renderer.buildHtml({
    slug, title: sample.title, lang, channel: { channel_id: `preview_${lang}` }, manifest: {}, totalDuration, extras: sample.extras || null,
    sfxCues: [], bgmSegments: [], cinemaAudioHtml: "", common: { lang }, scenes, creative,
  });
  const problems = lintVariantHtml(built.html);
  if (problems.length) throw new Error(`${slug}: ${problems.join("; ")}`);
  const fonts = embedFonts({ html: built.html, families: [...creative.fonts.families, ...(built.fontFamilies || [])], targetDir: dir, compareDir: COMPARE_DIR });
  fs.writeFileSync(path.join(dir, "index.html"), fonts.html);
  await prepareKitAssets({ targetDir: dir, compareDir: COMPARE_DIR });
  // Engine mở rộng (tierlist SFX, survival meme…) chép asset tĩnh như adapter thật.
  await extendedEngine(variant.engine)?.prepareAssets?.({ targetDir: dir, compareDir: COMPARE_DIR });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ id: slug, name: sample.title, preview: true }, null, 2));
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" } }, null, 2));
  const o = creative.observability;
  return {
    dir, slug, duration: totalDuration, scene_durations: scenes.map((scene) => scene.duration),
    labels: {
      engine: channelId ? `${o.engine} · ${channelId}` : o.engine, variant: o.variant_id, country: o.country, composition: o.creative_dna.composition,
      motion: o.creative_dna.image_motion, typography: o.creative_dna.typography, transition: o.creative_dna.transition,
      treatment: o.creative_dna.treatment, tone: `${o.creative_dna.tone} · caption=${o.creative_dna.caption}`, voice: "n/a (preview)", signature: o.creative_signature.slice(0, 12),
    },
    dna: Object.fromEntries(DNA_FIELDS.map((key) => [key, o.creative_dna[key]])),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = args(argv);
  const variants = opts.variant
    ? [getVariant(opts.variant, { allowReference: true })].filter(Boolean)
    : listVariants(opts.engine).filter((v) => v.status === "active" || (opts.includeReference && v.status === "reference"));
  if (!variants.length) throw new Error("no variant matches (use --include-reference for the Phase 0 reference variant)");
  fs.mkdirSync(opts.out, { recursive: true });
  const entries = [];
  if (opts.channels) {
    // "--channels de:4,en:2" = N kênh đầu (theo channel_id, trải đều) mỗi nước có bộ da của engine; hoặc danh sách id.
    const engine = opts.engine || variants[0].engine;
    const all = loadChannels(path.join(COMPARE_DIR, "config", "channels"), engine).filter((c) => c.skin);
    const picked = opts.channels.split(",").flatMap((token) => {
      const [code, count] = token.split(":");
      if (!count) return all.filter((c) => c.channel_id === code);
      const pool = all.filter((c) => c.lang === code);
      const n = Math.min(Number(count), pool.length);
      return Array.from({ length: n }, (_, i) => pool[Math.floor((i * pool.length) / n)]);
    });
    for (const channel of picked) {
      const variant = getVariant(channel.skin.variant_id);
      entries.push(await buildPreview({ variant, composition: channel.skin.dna.composition, lang: channel.lang, dna: channel.skin.dna, dnaTag: "skin", outDir: opts.out, channelId: channel.channel_id }));
    }
    fs.writeFileSync(path.join(opts.out, "manifest.json"), JSON.stringify({ generated_by: "tools/preview-variants.mjs", entries }, null, 2));
    console.log(JSON.stringify({ out: opts.out, previews: entries.length }));
    return entries;
  }
  for (const variant of variants) {
    for (const composition of Object.keys(variant.visualProfile.compositions)) {
      for (const lang of opts.langs.filter((code) => variant.compatibility.countries.includes(code))) {
        entries.push(await buildPreview({ variant, composition, lang, dna: defaultDna(variant, composition), dnaTag: "a", outDir: opts.out }));
        entries.push(await buildPreview({ variant, composition, lang, dna: altDna(variant, composition), dnaTag: "b", outDir: opts.out }));
      }
    }
  }
  fs.writeFileSync(path.join(opts.out, "manifest.json"), JSON.stringify({ generated_by: "tools/preview-variants.mjs", entries }, null, 2));
  console.log(JSON.stringify({ out: opts.out, previews: entries.length }));
  return entries;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(`[preview-variants] ${error.message}`); process.exitCode = 1; });
}
