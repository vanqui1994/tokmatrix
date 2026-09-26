#!/usr/bin/env node
// Automated generator for Style 1: Vox Motion Graphics Generator (60-70s).
// Inspired by Anil-matcha/vox-ai-motion-graphics-generator, Vox Earworm, and Johnny Harris.
// Generates HyperFrames compositions with mixed-media hand-cut paper collage,
// torn paper headline banners, halftone Ben-Day dot patterns, flat-safe camera moves
// (push_in, pull_out, pan, tilt, parallax, static), and synchronized Voiceover & Cinema Soundscape.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateVoxTopic, slugify } from "./generate-vox-topic.mjs";
import { ensureAntigravityImages } from "./antigravity-images.mjs";
import { VOX_LANG_META, CURATED_VOX_TOPICS, VOX_ASSETS_SVG, VOX_THEMES } from "./vox-configs.mjs";
import { downloadImage } from "./find-image.mjs";
import { detectSfxCues, computeDuckedBgmSegments, generateCinemaAudioHtml, copyCinemaSfxFiles } from "./auto-sfx.mjs";
import { synthesizeAudio } from "./voices.mjs";
import { generateBeatTearSystem, renderBeatShardsHtml, TEAR_PATTERNS } from "./procedural-tears.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_VIDEO = path.join(REPO_ROOT, "videos", "survival-without-organs");

function run(cmd, args, cwd, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: "0" } });
    child.stdout.on("data", (c) => log(String(c).trimEnd()));
    child.stderr.on("data", (c) => log(String(c).trimEnd()));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → error code ${code}`))
    );
  });
}

async function getAudioDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ]);
  const dur = parseFloat(stdout.trim());
  if (Number.isNaN(dur)) throw new Error(`ffprobe failed for ${filePath}`);
  return dur;
}

/**
 * Creates a complete Vox Motion Graphics video project.
 */
export async function createVoxVideo(opts = {}) {
  const log = opts.log ?? console.log;

  let cfg = opts.spec?.voxConfig || opts.spec || opts.voxConfig;
  const lang = cfg?.lang || opts.lang || "vi";
  const meta = VOX_LANG_META[lang] || VOX_LANG_META.vi;
  const themeKey = opts.theme || cfg?.theme || "american-retro";

  if (!cfg) {
    if (opts.prompt || opts.query) {
      log(`[1/6] AI Generating Vox topic for "${opts.prompt || opts.query}" (theme: ${themeKey})...`);
      cfg = await generateVoxTopic({ prompt: opts.prompt || opts.query, lang, voice: opts.voice, theme: themeKey });
    } else {
      log(`[1/6] Using curated preset for lang "${lang}"...`);
      cfg = CURATED_VOX_TOPICS[`vox-sample-coffee-${lang}`] || CURATED_VOX_TOPICS["vox-sample-coffee-vi"];
    }
  }

  const voice = opts.voice || cfg.voice || meta.defaultVoice;
  const rawSlug = opts.slug || cfg.slug || `vox-${slugify(cfg.topicTitle)}-${lang}`;
  const slug = rawSlug.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const dir = path.join(REPO_ROOT, "videos", slug);

  if (fs.existsSync(dir)) {
    log(`[1/6] Directory videos/${slug} exists, updating...`);
  } else {
    log(`[1/6] Initializing directory structure videos/${slug}...`);
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.mkdirSync(path.join(dir, "assets", "audio"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "vo"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  // 1. Copy BGM and SFX
  log("[2/6] Setting up upbeat acoustic Lo-Fi BGM & sound effects...");
  const bgmSrc = path.join(REPO_ROOT, "tools", "template-vox", "assets", "audio", "bgm.mp3");
  const bgmDest = path.join(dir, "assets", "audio", "bgm.mp3");
  if (fs.existsSync(bgmSrc)) {
    fs.copyFileSync(bgmSrc, bgmDest);
  } else {
    fs.copyFileSync(path.join(REPO_ROOT, "shared", "audio", "bgm", "sneaky-snitch.mp3"), bgmDest);
  }

  const popSrc = path.join(REPO_ROOT, "shared", "audio", "sfx", "pop.mp3");
  if (fs.existsSync(popSrc)) {
    fs.copyFileSync(popSrc, path.join(dir, "assets", "audio", "pop.mp3"));
  }

  // 2. Synthesize TTS voiceover lines with Edge TTS
  log(`[3/6] Synthesizing voiceover lines with Edge TTS (${voice})...`);
  const beats = cfg.beats || [];
  const voDir = path.join(dir, "assets", "vo");
  const timedBeats = [];
  let currentTime = 0.5;

  for (let i = 0; i < beats.length; i++) {
    const bt = beats[i];
    const voFile = path.join(voDir, `beat-${i + 1}.mp3`);
    const lineText = bt.line;

    log(`  [TTS] Beat ${i + 1}: "${lineText.slice(0, 45)}..."`);
    await synthesizeAudio({
      text: lineText,
      voice,
      outPath: voFile,
      rate: "-3%",
      lang: cfg.lang || "vi",
    });

    const dur = await getAudioDuration(voFile);
    const start = Math.round(currentTime * 100) / 100;
    const roundedDur = Math.round(dur * 100) / 100;
    // 0.5s pause between beats so sentences never overlap
    currentTime = Math.round((start + roundedDur + 0.5) * 100) / 100;

    timedBeats.push({
      ...bt,
      index: i + 1,
      start,
      duration: roundedDur,
      voSrc: `assets/vo/beat-${i + 1}.mp3`,
      imgSrc: `assets/images/sticker-${i + 1}.jpg`
    });
  }

  const totalDuration = Math.ceil(currentTime + 1.2);
  log(`  ✓ Timeline calculated: ${timedBeats.length} beats, total duration: ${totalDuration}s`);

  // 3. Sticker cắt dán — xin qua hàng đợi Antigravity (tools/antigravity-images.mjs), không Pollinations.
  log("[4/6] Preparing sticker collage visuals via Antigravity...");
  const imageResult = await ensureAntigravityImages({
    dir, slug, log, label: "Vox Collage",
    timeoutMin: Number(opts.imageTimeoutMin || opts.spec?.imageTimeoutMin || 45),
    items: timedBeats.map((bt) => ({
      key: `sticker-${bt.index}`,
      aspect: "1:1",
      dest: bt.imgSrc,
      prompt: `Single isolated cutout object: ${bt.imageSearchQuery || bt.stickerLabel || bt.headline || bt.name}. Paper-cut collage sticker on a plain white background, crisp torn-paper edge, subtle halftone print texture, editorial magazine collage style, centered, no text, no letters, no watermark.`,
    })),
  });

  // 4. Cinema Soundscape: Auto-SFX and Smart Ducking
  log("[5/6] Generating Vox Motion Graphics HTML with Cinema Soundscape...");
  const sfxCues = detectSfxCues({
    archetype: "vox",
    items: timedBeats.map((b) => ({ start: b.start, dur: b.duration, text: b.spokenText || b.text || b.line || "" })),
    totalDuration,
  });
  const bgmSegments = computeDuckedBgmSegments({
    totalDuration,
    voiceIntervals: timedBeats.map((b) => ({ start: b.start, dur: b.duration })),
    ambientVol: 0.12,
    boostVol: 0.28,
  });
  copyCinemaSfxFiles(dir, sfxCues);
  log(`  ✓ Soundscape active: ${sfxCues.length} Auto-SFX cues, ${bgmSegments.length} Ducking segments.`);

  const html = generateVoxHtml({
    slug,
    cfg,
    meta,
    timedBeats,
    totalDuration,
    sfxCues,
    bgmSegments,
  });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

  // 5. Generate package.json & meta.json
  log("[6/6] Generating package.json, meta.json and project files...");
  const metaJson = {
    id: slug,
    name: cfg.topicTitle,
    category: "vox-collage",
    template: "vox",
    lang,
    theme: themeKey,
    created: new Date().toISOString(),
    totalDuration,
    voxConfig: {
      ...cfg,
      beats: timedBeats
    }
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(metaJson, null, 2), "utf8");

  const specData = {
    type: "vox",
    slug,
    lang,
    voice,
    title: cfg.topicTitle,
    category: "vox",
    message: `${cfg.topicTitle} — ${cfg.eyebrow || meta.category}`,
    captions: timedBeats.map((b) => b.line),
    spoken: timedBeats.map((b) => b.line),
    script: cfg.fullScriptHtml,
    voxConfig: metaJson.voxConfig
  };
  fs.writeFileSync(path.join(dir, "spec.json"), JSON.stringify(specData, null, 2), "utf8");

  // Write scripts/generate-vo.mjs
  const genVoScript = `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesizeAudio } from "../../tools/voices.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const videoDir = path.resolve(__dirname, "..");

const meta = JSON.parse(fs.readFileSync(path.join(videoDir, "meta.json"), "utf8"));
const beats = meta.voxConfig?.beats || [];
const voice = meta.voxConfig?.voice || "${voice}";
const lang = meta.lang || "${lang}";
const voDir = path.join(videoDir, "assets", "vo");
fs.mkdirSync(voDir, { recursive: true });

console.log(\`Generating TTS for \${beats.length} vox beats using voice \${voice}...\`);
for (let i = 0; i < beats.length; i++) {
  const bt = beats[i];
  const voFile = path.join(voDir, \`beat-\${i + 1}.mp3\`);
  console.log(\`  [TTS \${i + 1}/\${beats.length}] \${bt.line.slice(0, 40)}...\`);
  await synthesizeAudio({
    text: bt.line,
    voice,
    outPath: voFile,
    rate: "-3%",
    lang,
  });
}
console.log("✓ Done generating vox voiceover!");
`;
  fs.writeFileSync(path.join(dir, "scripts", "generate-vo.mjs"), genVoScript, "utf8");

  const pkgJson = {
    name: slug,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      "dev": "npx --yes hyperframes@0.7.58 preview",
      "check": "npx --yes hyperframes@0.7.58 check",
      "render": "npx --yes hyperframes@0.7.58 render --workers 4 --no-low-memory-mode"
    },
    dependencies: {
      "gsap": "^3.12.5",
      "hyperframes": "^1.1.0"
    }
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkgJson, null, 2), "utf8");

  // Copy node_modules if needed
  if (!fs.existsSync(path.join(dir, "node_modules")) && fs.existsSync(path.join(TEMPLATE_VIDEO, "node_modules"))) {
    try {
      fs.symlinkSync(path.join(TEMPLATE_VIDEO, "node_modules"), path.join(dir, "node_modules"), "junction");
    } catch (e) {
      // symlink failed, will rely on hyperframes runner
    }
  }

  log(`\n🎉 Successfully created Vox Motion Graphics video: videos/${slug}`);
  log(`  - Preview URL: http://localhost:4321/?v=${slug}`);
  log(`  - Run check: cd videos/${slug} && npm run check`);
  log(`  - Render MP4: cd videos/${slug} && npm run render\n`);

  return { slug, dir, totalDuration, cfg };
}

/**
 * Generates the Vox Motion Graphics HTML code.
 */
function createSeededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function generateVoxHtml({ slug, cfg, meta, timedBeats, totalDuration, sfxCues = [], bgmSegments = [] }) {
  const cinemaAudioHtml = generateCinemaAudioHtml({ sfxCues, bgmSegments });
  const theme = VOX_THEMES[cfg.theme] || VOX_THEMES["american-retro"];
  const random = createSeededRandom(stableSeed(slug));

  // Procedural random tear pattern generation for each beat
  let patternPool = shuffled(TEAR_PATTERNS, random);
  const tearSystems = timedBeats.map((bt, i) => {
    if (patternPool.length === 0) {
      patternPool = shuffled(TEAR_PATTERNS, random);
    }
    const pat = patternPool.pop();
    return generateBeatTearSystem({
      beatIndex: i + 1,
      imgSrc: bt.imgSrc || `assets/images/beat_${i + 1}.jpg`,
      headline: bt.headline || bt.name || `HỒ SƠ #${i + 1}`,
      pattern: pat,
      seed: Math.max(1, Math.floor(random() * 100000000)),
    });
  });

  const beatsJson = JSON.stringify(timedBeats.map(b => ({
    id: b.id,
    index: b.index,
    act: b.act || `Act ${b.index}`,
    headline: b.headline || b.stickerLabel || b.name,
    cameraMove: b.cameraMove || (b.index % 2 === 1 ? "push_in" : "parallax"),
    shotSize: b.shotSize || "WIDE",
    start: b.start,
    duration: b.duration,
    label: b.stickerLabel,
    angle: b.stickerAngle || (b.index % 2 === 0 ? 3 : -3),
    x: b.stickerX || "22%",
    y: b.stickerY || "20%",
    width: b.stickerWidth || "420px",
    marker: b.markerHighlight
  })));

  return `<!DOCTYPE html>
<html lang="${cfg.lang || 'vi'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${cfg.topicTitle || 'VOX AI MOTION GRAPHICS GENERATOR'}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Plus+Jakarta+Sans:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }

    body {
      width: 1080px;
      height: 1920px;
      background: #181412;
      color: #FFFFFF;
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      overflow: hidden;
      position: relative;
    }

    #root {
      width: 1080px;
      height: 1920px;
      position: relative;
      background: #181412;
      overflow: hidden;
    }

    /* FULL-SCREEN BEAT SCENES */
    .vox-scene {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      opacity: 0;
    }

    .poster-camera-stage {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform-origin: center center;
      will-change: transform;
    }

    .poster-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* VINTAGE FILM & SCAN VIGNETTE OVERLAY */
    .vignette-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 5;
      box-shadow: inset 0 0 140px rgba(10, 8, 6, 0.65), inset 0 0 60px rgba(0, 0, 0, 0.4);
    }

    /* BEN-DAY HALFTONE DOTS TEXTURE OVERLAY */
    .halftone-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 6;
      opacity: 0.12;
      mix-blend-mode: multiply;
    }

    /* TOP PILL BADGE */
    .vox-top-badge {
      position: absolute;
      top: 50px;
      left: 50px;
      z-index: 80;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 22px;
      background: #140F0D;
      border: 2px solid #FF7043;
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }

    .badge-tag {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #FF8A65;
    }

    .badge-dot {
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
    }

    .badge-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #FFFFFF;
      text-transform: uppercase;
    }

    /* FLOATING SUBTITLE CAPTIONS AT BOTTOM */
    .vox-caption-wrapper {
      position: absolute;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      width: 960px;
      max-width: 960px;
      text-align: center;
      z-index: 90;
      pointer-events: none;
    }

    .vox-caption-pill {
      display: inline-block;
      background: #140F0D;
      border: 3px solid #FF7043;
      border-radius: 22px;
      padding: 18px 32px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 4px 12px rgba(0, 0, 0, 0.4);
      color: #FFFFFF;
      font-size: 33px;
      font-weight: 800;
      line-height: 1.4;
      letter-spacing: 0.3px;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
    }

    .hl-accent {
      color: #FFE600;
      text-decoration: underline;
      text-decoration-color: #FF7043;
      text-underline-offset: 6px;
      text-decoration-thickness: 3px;
    }

    /* WATERMARK AT BOTTOM RIGHT */
    .vox-watermark {
      position: absolute;
      bottom: 45px;
      right: 50px;
      z-index: 80;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #FFFFFF;
      background: #140F0D;
      padding: 6px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      pointer-events: none;
    }

    /* ========================================================
       TORN-FROM-IMAGE (XÉ TỪ HÌNH GỐC) SYSTEM
       ======================================================== */
    .shard-wrapper {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      will-change: transform, opacity;
      transform-origin: center center;
    }

    .poster-shard {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      background-size: 1080px 1920px;
      background-position: center top;
      background-repeat: no-repeat;
    }

    .tear-lip {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      background: #FAF6EE;
      pointer-events: none;
      filter: drop-shadow(0 18px 30px rgba(0, 0, 0, 0.65)) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.4));
    }

    .washi-tape {
      position: absolute;
      height: 42px;
      background: rgba(255, 225, 77, 0.88);
      border-left: 3px dashed rgba(180, 140, 90, 0.5);
      border-right: 3px dashed rgba(180, 140, 90, 0.5);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      clip-path: polygon(0% 0%, 97% 0%, 100% 50%, 97% 100%, 3% 100%, 0% 50%);
      z-index: 40;
      will-change: transform, opacity;
      pointer-events: none;
    }
    .washi-kraft {
      background: rgba(220, 185, 140, 0.92);
    }
    .washi-red {
      background: rgba(230, 60, 50, 0.85);
    }

    .torn-stamp-badge {
      position: absolute;
      border: 4px dashed #8B0000;
      color: #8B0000;
      background: rgba(250, 246, 238, 0.95);
      font-family: 'Anton', sans-serif;
      text-transform: uppercase;
      padding: 10px 24px;
      font-size: 28px;
      letter-spacing: 2px;
      border-radius: 8px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.5);
      z-index: 45;
      will-change: transform;
      clip-path: polygon(0% 4%, 98% 0%, 100% 96%, 2% 100%);
    }
  </style>
</head>
<body>
  <!-- SVG DEF FOR HALFTONE DOTS -->
  <svg width="0" height="0" style="position:absolute">
    <defs>
      <pattern id="vox-halftone-dots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="9" cy="9" r="2.8" fill="#1C1814" opacity="0.3"/>
        <circle cx="0" cy="0" r="1.5" fill="#1C1814" opacity="0.25"/>
        <circle cx="18" cy="0" r="1.5" fill="#1C1814" opacity="0.25"/>
        <circle cx="0" cy="18" r="1.5" fill="#1C1814" opacity="0.25"/>
        <circle cx="18" cy="18" r="1.5" fill="#1C1814" opacity="0.25"/>
      </pattern>
    </defs>
  </svg>

  <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${totalDuration}">

    <!-- GLOBAL VIGNETTE & HALFTONE PRINT OVERLAY -->
    <div class="vignette-overlay" data-layout-allow-overlap></div>
    <svg class="halftone-overlay" data-layout-allow-overlap width="100%" height="100%">
      <rect width="100%" height="100%" fill="url(#vox-halftone-dots)" />
    </svg>

    <!-- TOP HEADER PILL BADGE -->
    <div class="vox-top-badge" data-layout-allow-overlap>
      <span class="badge-tag">${cfg.seriesTitle || meta.badge}</span>
      <span class="badge-dot">•</span>
      <span class="badge-title">${cfg.topicTitle}</span>
    </div>

    <!-- WATERMARK -->
    <div class="vox-watermark" data-layout-allow-overlap>${cfg.watermark || meta.watermark}</div>

    <!-- FULL-SCREEN BEAT SCENES & FLOATING CAPTIONS -->
    ${timedBeats.map((bt, i) => {
      const sceneStart = i === 0 ? 0 : bt.start;
      // Cảnh cuối giữ tới hết video: totalDuration có thêm 1,2 s đệm, trước đây là màn hình đen
      // (Video QA chặn đoạn đen > 0,5 s nên mọi video vox đều trượt).
      const last = i === timedBeats.length - 1;
      const sceneDur = last ? Math.max(0, Number(totalDuration) - sceneStart).toFixed(2)
        : i === 0 ? (bt.duration + (bt.start || 0)).toFixed(2) : bt.duration;
      return `
    <!-- BEAT ${i + 1}: ${bt.act || bt.name} -->
    <div id="scene-${i + 1}" class="vox-scene clip" data-layout-allow-overlap data-start="${sceneStart}" data-duration="${sceneDur}" data-track-index="${i + 1}">
      <div id="cam-stage-${i + 1}" class="poster-camera-stage" data-layout-allow-overflow>
${renderBeatShardsHtml(tearSystems[i])}
      </div>
    </div>
    <div id="caption-${i + 1}" class="vox-caption-wrapper clip" data-layout-allow-overlap data-start="${bt.start}" data-duration="${bt.duration}" data-track-index="${51 + i}">
      <div class="vox-caption-pill">
        ${bt.captionHtml || bt.line}
      </div>
    </div>
    `;
    }).join('')}

    <!-- AUDIO TRACKS -->
    <div id="audio-tracks">
${cinemaAudioHtml}
      
      <!-- Voiceover Beats -->
      ${timedBeats.map((bt, i) => `
      <audio id="vo-beat-${i + 1}" class="clip" src="${bt.voSrc}" data-start="${bt.start}" data-duration="${bt.duration}" data-track-index="${20 + (i % 5)}"></audio>
      `).join('')}
    </div>
  </div>

  <!-- GSAP TIMELINE SCRIPT -->
  <script>
    const BEATS = ${beatsJson};
    const TOTAL_DURATION = ${totalDuration};
    const TEAR_SYSTEMS = ${JSON.stringify(tearSystems)};

    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["main"] = tl;

    BEATS.forEach((bt, idx) => {
      const bIdx = idx + 1;
      const sceneEl = "#scene-" + bIdx;
      const prevSceneEl = idx > 0 ? "#scene-" + idx : null;
      const camStageEl = "#cam-stage-" + bIdx;
      const captionEl = "#caption-" + bIdx;
      const sys = TEAR_SYSTEMS[idx];
      const sceneStart = idx === 0 ? 0 : bt.start;
      const sceneDur = idx === 0 ? (bt.duration + (bt.start || 0)) : bt.duration;

      // Fade out previous scene
      if (prevSceneEl) {
        tl.to(prevSceneEl, { opacity: 0, duration: 0.25 }, sceneStart);
      }

      // Fade in current scene
      tl.to(sceneEl, { opacity: 1, duration: 0.35, ease: "power2.out" }, sceneStart);

      // Subtitle caption entrance
      tl.fromTo(captionEl, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "back.out(1.4)" }, bt.start + 0.1);

      // Camera Move (Ken Burns / Parallax)
      const cam = bt.cameraMove;
      if (cam === "push_in") {
        tl.fromTo(camStageEl, { scale: 1.0 }, { scale: 1.15, duration: sceneDur, ease: "none" }, sceneStart);
      } else if (cam === "pull_out") {
        tl.fromTo(camStageEl, { scale: 1.16 }, { scale: 1.02, duration: sceneDur, ease: "none" }, sceneStart);
      } else if (cam === "pan") {
        tl.fromTo(camStageEl, { x: -30, scale: 1.08 }, { x: 25, scale: 1.08, duration: sceneDur, ease: "none" }, sceneStart);
      } else if (cam === "tilt") {
        tl.fromTo(camStageEl, { y: -25, scale: 1.08 }, { y: 25, scale: 1.08, duration: sceneDur, ease: "none" }, sceneStart);
      } else if (cam === "parallax") {
        tl.fromTo(camStageEl, { x: -20, scale: 1.04 }, { x: 20, scale: 1.12, duration: sceneDur, ease: "none" }, sceneStart);
      } else {
        tl.fromTo(camStageEl, { scale: 1.0 }, { scale: 1.12, duration: sceneDur, ease: "none" }, sceneStart);
      }

      // Procedural Shards Assembly Animations
      if (sys) {
        sys.animations.forEach(a => {
          tl.fromTo(a.target, a.from, a.to, sceneStart + a.delay);
        });

        // Washi Tapes Slap
        sys.tapes.forEach((t, tIdx) => {
          const tapeDelay = 0.65 + tIdx * 0.12;
          tl.fromTo("#" + t.id, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 0.92, duration: 0.22, ease: "power3.out" }, sceneStart + tapeDelay);
        });

        // Stamp Badge Bounce
        tl.fromTo("#" + sys.stamp.id, { scale: 2.8, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: sys.stamp.rotation, duration: 0.35, ease: "back.out(2)" }, sceneStart + 0.88);
      }
    });
  </script>
</body>
</html>`;
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const promptArg = argv.find(a => !a.startsWith("--"));
  const langArg = (argv.find(a => a.startsWith("--lang=")) || "").replace("--lang=", "") || "vi";
  
  console.log(`[Vox CLI] Creating Vox video for prompt: "${promptArg || 'preset'}", lang: ${langArg}...`);
  createVoxVideo({
    prompt: promptArg,
    lang: langArg
  }).catch(err => {
    console.error("Failed to create Vox video:", err);
    process.exit(1);
  });
}
