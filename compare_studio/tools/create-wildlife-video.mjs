#!/usr/bin/env node
// Automated generator for AI Wildlife Documentary & Animal Survival videos (45-65s format).
// Inspired by BBC Earth, National Geographic, and tactical animal breakdown formats (Vienhn style).
// Generates HyperFrames compositions with Edge TTS, Ken Burns cinematic animal shots,
// telephoto lens viewfinder reticles [400mm F/2.8], tactical animal spec gauges, and nature soundscapes.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateWildlifeTopic, slugify } from "./generate-wildlife-topic.mjs";
import { ensureAntigravityImages } from "./antigravity-images.mjs";
import { WILDLIFE_LANG_META, CURATED_WILDLIFE_TOPICS, WILDLIFE_SVG_DEFS } from "./wildlife-configs.mjs";
import { synthesizeAudio } from "./voices.mjs";
import { downloadImage } from "./find-image.mjs";
import {
  detectSfxCues,
  computeDuckedBgmSegments,
  generateCinemaAudioHtml,
  copyCinemaSfxFiles,
} from "./auto-sfx.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_VIDEO = path.join(REPO_ROOT, "videos", "survival-without-organs");

async function getAudioDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const dur = parseFloat(stdout.trim());
  if (Number.isNaN(dur)) throw new Error(`ffprobe failed for ${filePath}`);
  return dur;
}

/**
 * Creates a complete Wildlife Documentary HyperFrames video project.
 */
export async function createWildlifeVideo(opts = {}) {
  const log = opts.log ?? console.log;

  let cfg = opts.spec?.wildlifeConfig || opts.spec || opts.wildlifeConfig;
  const lang = cfg?.lang || opts.lang || "vi";
  const meta = WILDLIFE_LANG_META[lang] || WILDLIFE_LANG_META.vi;

  if (!cfg) {
    if (opts.prompt || opts.query) {
      log(`[1/6] AI Generating wildlife topic for "${opts.prompt || opts.query}"...`);
      cfg = await generateWildlifeTopic({ prompt: opts.prompt || opts.query, lang, voice: opts.voice });
    } else {
      log(`[1/6] Using curated preset for lang "${lang}"...`);
      cfg = CURATED_WILDLIFE_TOPICS["wildlife-orca-vi"];
    }
  }

  const voice = opts.voice || cfg.voice || meta.defaultVoice;
  const rawSlug = opts.slug || cfg.slug || `wildlife-${slugify(cfg.topicTitle)}-${lang}`;
  const slug = rawSlug.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const dir = path.join(REPO_ROOT, "videos", slug);

  if (fs.existsSync(dir)) {
    log(`[1/6] Directory videos/${slug} already exists, reusing / updating...`);
  } else {
    log(`[1/6] Initializing directory structure videos/${slug}...`);
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.mkdirSync(path.join(dir, "assets", "audio"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "vo"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  // 1. Copy Wildlife BGM (deep ocean / nature ambient)
  log("[2/6] Setting up cinematic nature soundscape BGM...");
  const bgmDest = path.join(dir, "assets", "audio", "bgm.mp3");
  // Check soundscape audio in template
  const fallbackBgm = path.join(REPO_ROOT, "videos", "survival-without-organs", "assets", "audio", "bgm.mp3");
  if (fs.existsSync(fallbackBgm)) {
    fs.copyFileSync(fallbackBgm, bgmDest);
  }

  // 2. Synthesize TTS voiceover lines with Edge TTS
  log(`[3/6] Synthesizing voiceover lines with Edge TTS (${voice})...`);
  const scenes = cfg.scenes || [];
  const voDir = path.join(dir, "assets", "vo");
  const timedScenes = [];
  let currentTime = 0.6; // Lead-in pause 0.6s

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const voFile = path.join(voDir, `scene-${i + 1}.mp3`);
    const lineText = sc.line;

    log(`  [TTS] Scene ${i + 1}: "${lineText.slice(0, 45)}..."`);
    await synthesizeAudio({
      text: lineText,
      voice,
      outPath: voFile,
      rate: "-3%",
      lang,
    });

    let duration = 6.5;
    try {
      duration = await getAudioDuration(voFile);
    } catch {
      duration = Math.max(4.0, lineText.split(/\s+/).length * 0.35);
    }

    const sceneDuration = Number((duration + 0.45).toFixed(2));
    timedScenes.push({
      ...sc,
      index: i + 1,
      start: Number(currentTime.toFixed(2)),
      duration: sceneDuration,
      voDuration: Number(duration.toFixed(2)),
      voSrc: `assets/vo/scene-${i + 1}.mp3`,
      imgSrc: `assets/images/scene-${i + 1}.jpg`,
    });

    currentTime += sceneDuration;
  }

  const totalDuration = Math.ceil(currentTime + 1.2);
  log(`  ✓ Total timed video length: ${totalDuration}s across ${timedScenes.length} scenes.`);

  // 3. Ảnh động vật — xin qua hàng đợi Antigravity (tools/antigravity-images.mjs), không Pollinations.
  log("[4/6] Preparing wildlife visual assets via Antigravity...");
  const imageResult = await ensureAntigravityImages({
    dir, slug, log, label: "Thế Giới Động Vật",
    timeoutMin: Number(opts.imageTimeoutMin || opts.spec?.imageTimeoutMin || 45),
    items: timedScenes.map((sc) => ({
      key: `scene-${sc.index}`,
      aspect: "9:16",
      dest: sc.imgSrc,
      prompt: `${sc.visualPrompt || cfg.topicTitle}. Wildlife documentary photograph in the style of a nature magazine, telephoto lens, natural light, sharp focus on the animal, vertical 9:16 composition, realistic, no text, no watermark.`,
    })),
  });

  // 4. Generate package.json, meta.json, hyperframes.json
  log("[5/6] Generating project metadata & config files...");
  const pkg = {
    name: slug,
    private: true,
    type: "module",
    scripts: {
      dev: "npx --yes hyperframes@0.7.58 preview",
      check: "npx --yes hyperframes@0.7.58 check",
      render: "npx --yes hyperframes@0.7.58 render --low-memory-mode --experimental-fast-capture=false",
    },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));

  const hf = {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: {
      blocks: "compositions",
      components: "compositions/components",
      assets: "assets",
    },
  };
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify(hf, null, 2));

  const metaData = {
    id: slug,
    name: cfg.topicTitle,
    type: "wildlife",
    createdAt: new Date().toISOString(),
    duration: totalDuration,
    wildlifeConfig: {
      ...cfg,
      slug,
      lang,
      voice,
      totalDuration,
      scenes: timedScenes,
    },
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(metaData, null, 2));

  // Write spec.json for studio compatibility
  const specData = {
    type: "wildlife",
    slug,
    lang,
    voice,
    title: cfg.topicTitle,
    latinName: cfg.latinName,
    category: cfg.category || "wildlife",
    habitat: cfg.habitat,
    stats: cfg.stats,
    message: `${cfg.topicTitle} — ${cfg.latinName || ''}`,
    captions: timedScenes.map((s) => s.line),
    spoken: timedScenes.map((s) => s.line),
    wildlifeConfig: metaData.wildlifeConfig,
  };
  fs.writeFileSync(path.join(dir, "spec.json"), JSON.stringify(specData, null, 2));

  // Write scripts/generate-vo.mjs
  const genVoScript = `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesizeAudio } from "../../tools/voices.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const videoDir = path.resolve(__dirname, "..");

const meta = JSON.parse(fs.readFileSync(path.join(videoDir, "meta.json"), "utf8"));
const scenes = meta.wildlifeConfig?.scenes || [];
const voice = meta.wildlifeConfig?.voice || "${voice}";
const lang = meta.lang || "${lang}";
const voDir = path.join(videoDir, "assets", "vo");
fs.mkdirSync(voDir, { recursive: true });

console.log(\`Generating TTS for \${scenes.length} wildlife scenes using voice \${voice}...\`);
for (let i = 0; i < scenes.length; i++) {
  const sc = scenes[i];
  const voFile = path.join(voDir, \`scene-\${i + 1}.mp3\`);
  console.log(\`  [TTS \${i + 1}/\${scenes.length}] \${sc.line.slice(0, 40)}...\`);
  await synthesizeAudio({
    text: sc.line,
    voice,
    outPath: voFile,
    rate: "-3%",
    lang,
  });
}
console.log("✓ Done generating wildlife voiceover!");
`;
  fs.writeFileSync(path.join(dir, "scripts", "generate-vo.mjs"), genVoScript, "utf8");

  // Symlink node_modules
  const nmSrc = path.join(TEMPLATE_VIDEO, "node_modules");
  const nmDest = path.join(dir, "node_modules");
  if (fs.existsSync(nmSrc) && !fs.existsSync(nmDest)) {
    try {
      fs.symlinkSync(nmSrc, nmDest, "junction");
    } catch {}
  }

  // 5. Generate Cinema Soundscape (Auto-SFX + Smart Ducking)
  const sfxCues = detectSfxCues({
    archetype: "survival",
    items: timedScenes.map((sc) => ({ start: sc.start, dur: sc.duration, text: sc.line || "" })),
    totalDuration,
  });
  const bgmSegments = computeDuckedBgmSegments({
    totalDuration,
    voiceIntervals: timedScenes.map((sc) => ({ start: sc.start, dur: sc.duration })),
    ambientVol: 0.12,
    boostVol: 0.28,
  });
  copyCinemaSfxFiles(dir, sfxCues);

  // 6. Generate index.html Composition
  log("[6/6] Generating HyperFrames composition index.html...");
  const html = generateWildlifeHtml({
    slug,
    cfg,
    meta,
    timedScenes,
    totalDuration,
    sfxCues,
    bgmSegments,
  });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

  log(`✅ Created wildlife documentary video project videos/${slug} (${totalDuration}s) successfully!`);
  return {
    slug,
    dir,
    totalDuration,
    scenesCount: timedScenes.length,
    config: metaData.wildlifeConfig,
  };
}

/**
 * Highlights keywords inside narration text
 */
function highlightKeywords(text, keywords = []) {
  if (!keywords || keywords.length === 0) return text;
  let res = text;
  for (const kw of keywords) {
    if (!kw) continue;
    const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    res = res.replace(regex, `<span class="highlight-word" data-layout-allow-overlap="true">$1</span>`);
  }
  return res;
}

/**
 * Builds the complete HyperFrames HTML for the AI Wildlife Documentary layout.
 */
export function generateWildlifeHtml({ slug, cfg, meta, timedScenes, totalDuration, sfxCues = [], bgmSegments = [] }) {
  const scenesJson = JSON.stringify(timedScenes, null, 2);
  const cinemaAudioHtml = generateCinemaAudioHtml({ sfxCues, bgmSegments });
  const stats = cfg.stats || {
    speed: "56 km/h",
    biteForce: "19,000 PSI",
    tacticalIq: "TOP 0.01%",
    successRate: "85%",
  };

  return `<!DOCTYPE html>
<html lang="${cfg.lang || 'vi'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920, initial-scale=1.0">
  <title>${cfg.topicTitle} — Wildlife Survival Dossier</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Montserrat:wght@400;600;700;800;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
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
      background: #02070b;
      color: #FFFFFF;
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      position: relative;
    }

    /* Ambient Wildlife Vignette */
    .viewport-vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 50%, transparent 45%, rgba(0, 5, 10, 0.85) 90%),
                  linear-gradient(180deg, rgba(2, 7, 12, 0.92) 0%, transparent 20%, transparent 70%, rgba(2, 7, 12, 0.95) 100%);
      pointer-events: none;
      z-index: 5;
    }

    /* Telephoto Lens Frame [400mm F/2.8] Viewfinder Grid */
    .viewfinder-grid {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 6;
    }

    .reticle-corner {
      position: absolute;
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255, 255, 255, 0.4);
    }
    .reticle-tl { top: 40px; left: 40px; border-right: none; border-bottom: none; }
    .reticle-tr { top: 40px; right: 40px; border-left: none; border-bottom: none; }
    .reticle-bl { bottom: 40px; left: 40px; border-right: none; border-top: none; }
    .reticle-br { bottom: 40px; right: 40px; border-left: none; border-top: none; }

    /* Center Crosshairs */
    .center-crosshairs {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 180px;
      height: 180px;
      border: 1.5px dashed rgba(0, 240, 255, 0.35);
      border-radius: 50%;
      pointer-events: none;
    }
    .center-crosshairs::before, .center-crosshairs::after {
      content: '';
      position: absolute;
      background: rgba(0, 240, 255, 0.6);
    }
    .center-crosshairs::before {
      top: 50%; left: -20px; width: 220px; height: 1.5px; transform: translateY(-50%);
    }
    .center-crosshairs::after {
      left: 50%; top: -20px; height: 220px; width: 1.5px; transform: translateX(-50%);
    }

    /* Visual Background Layer with Ken Burns Zoom */
    .visual-stage {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 2;
    }

    .animal-visual {
      position: absolute;
      inset: -40px;
      width: calc(100% + 80px);
      height: calc(100% + 80px);
      object-fit: cover;
      opacity: 0;
      transform: scale(1.04);
      filter: contrast(1.08) saturate(1.12);
      transition: opacity 0.5s ease;
    }
    .animal-visual.active {
      opacity: 1;
    }

    /* TOP ZONE: Telephoto HUD & Latin Taxonomy */
    .top-telemetry-zone {
      position: absolute;
      top: 54px;
      left: 60px;
      right: 60px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      z-index: 10;
    }

    .camcorder-status {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 19px;
      color: #00f0ff;
      text-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
      background: rgba(4, 15, 25, 0.7);
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid rgba(0, 240, 255, 0.3);
    }

    .rec-pulse {
      width: 12px;
      height: 12px;
      background: #ff3344;
      border-radius: 50%;
      box-shadow: 0 0 12px #ff3344;
    }

    .iucn-status-pill {
      font-family: 'Share Tech Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 8px 18px;
      border-radius: 6px;
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      border: 1px solid #10b981;
      box-shadow: 0 0 14px rgba(16, 185, 129, 0.4);
    }

    /* Animal Header Title & Binomial Name */
    .animal-title-banner {
      position: absolute;
      top: 130px;
      left: 60px;
      right: 60px;
      z-index: 10;
    }

    .animal-latin {
      font-size: 22px;
      font-style: italic;
      font-family: 'Cinzel', serif;
      color: #ffd60a;
      letter-spacing: 2px;
      margin-bottom: 4px;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
    }

    .animal-name {
      font-size: 52px;
      font-weight: 900;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      line-height: 1.05;
      background: linear-gradient(180deg, #FFFFFF 0%, #d8e8f8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.9));
    }

    .animal-habitat {
      font-family: 'Share Tech Mono', monospace;
      font-size: 18px;
      color: rgba(255, 255, 255, 0.7);
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .animal-habitat span {
      color: #00f0ff;
    }

    /* FLOATING TACTICAL ANIMAL STATS HUD (RIGHT SIDE) */
    .tactical-stats-hud {
      position: absolute;
      top: 360px;
      right: 50px;
      width: 290px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      z-index: 10;
    }

    .stat-card {
      background: rgba(3, 16, 28, 0.82);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(0, 240, 255, 0.35);
      border-radius: 12px;
      padding: 14px 18px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), inset 0 0 16px rgba(0, 240, 255, 0.08);
      position: relative;
      overflow: hidden;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: #00f0ff;
      box-shadow: 0 0 10px #00f0ff;
    }

    .stat-label {
      font-family: 'Share Tech Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #00f0ff;
      letter-spacing: 1.5px;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-value {
      font-size: 26px;
      font-weight: 900;
      font-family: 'Share Tech Mono', monospace;
      color: #FFFFFF;
      letter-spacing: 0.5px;
    }

    .stat-bar-outer {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      margin-top: 8px;
      overflow: hidden;
    }

    .stat-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #00f0ff, #ffd60a);
      border-radius: 3px;
      width: 85%;
      box-shadow: 0 0 8px #00f0ff;
    }

    /* BOTTOM ZONE: Narrative Subtitle Card & Telemetry */
    .bottom-narrative-zone {
      position: absolute;
      bottom: 70px;
      left: 50px;
      right: 50px;
      z-index: 12;
    }

    .scene-tactical-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: rgba(4, 12, 24, 0.94);
      border: 1px solid #ffd60a;
      border-radius: 6px;
      color: #ffea79;
      font-family: 'Share Tech Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 1.5px;
      margin-bottom: 12px;
      box-shadow: 0 0 16px rgba(255, 214, 10, 0.3);
    }

    .narrative-card {
      background: rgba(2, 10, 18, 0.88);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 18px;
      padding: 28px 32px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      position: relative;
    }

    .narrative-text {
      font-size: 34px;
      font-weight: 700;
      line-height: 1.38;
      color: #f1f5f9;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
    }

    .highlight-word {
      display: inline-block;
      color: #ffd60a;
      font-weight: 900;
      text-shadow: 0 0 16px rgba(255, 214, 10, 0.6);
    }

    .telemetry-bar {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Share Tech Mono', monospace;
      font-size: 16px;
      color: #00f0ff;
      letter-spacing: 1px;
    }

    .watermark-tag {
      color: #94a3b8;
      font-size: 15px;
    }

    /* Clip rule for HyperFrames timing */
    .clip {
      position: relative;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${slug}" data-start="0" data-width="1080" data-height="1920" data-duration="${totalDuration}">
    <!-- SVG Global Defs -->
    <svg width="0" height="0" style="position: absolute;">
      ${WILDLIFE_SVG_DEFS}
    </svg>

    <!-- Fullscreen Visual Stage with Dynamic Wildlife Video Footage or Zoom/Pan -->
    <div id="visual-stage" class="visual-stage" data-layout-allow-overflow="true" data-layout-allow-overlap="true">
      ${timedScenes.map((sc, i) => {
        if (sc.videoSrc) {
          const vStart = sc.videoStart !== undefined ? sc.videoStart : (i === 0 ? 0 : sc.start);
          const nextStart = timedScenes[i + 1] ? (timedScenes[i + 1].videoStart ?? timedScenes[i + 1].start) : totalDuration;
          const vDur = sc.videoDuration || Number((nextStart - vStart).toFixed(2));
          return `<video id="vid-scene-${i + 1}" class="animal-visual clip" src="${sc.videoSrc}" poster="${sc.imgSrc}" muted playsinline preload="auto" data-start="${vStart}" data-duration="${vDur}" data-media-start="0" data-track-index="1" data-layout-allow-overflow="true" data-layout-allow-overlap="true"></video>`;
        }
        return `<img src="${sc.imgSrc}" id="img-scene-${i + 1}" class="animal-visual ${i === 0 ? 'active' : ''}" alt="${sc.badge || 'Scene ' + (i + 1)}" data-layout-allow-overflow="true">`;
      }).join('\n      ')}
    </div>

    <!-- Vignette & Viewfinder Grids -->
    <div class="viewport-vignette"></div>
    <div class="viewfinder-grid">
      <div class="reticle-corner reticle-tl"></div>
      <div class="reticle-corner reticle-tr"></div>
      <div class="reticle-corner reticle-bl"></div>
      <div class="reticle-corner reticle-br"></div>
      <div class="center-crosshairs"></div>
    </div>

    <!-- TOP ZONE: Telephoto Camera Telemetry & Header -->
    <div id="wildlife-header" class="top-telemetry-zone clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">
      <div class="camcorder-status">
        <div class="rec-pulse"></div>
        <span>REC</span>
        <span>[ 400mm F/2.8 ]</span>
        <span id="live-timecode">00:00:00</span>
      </div>
      <div class="iucn-status-pill">${meta.iucnLabels?.[cfg.iucnStatus] || 'IUCN: APEX PREDATOR'}</div>
    </div>

    <div id="animal-title-banner" class="animal-title-banner clip" data-start="0" data-duration="${totalDuration}" data-track-index="3">
      <div class="animal-latin">${cfg.latinName || 'Taxonomic Animalia'}</div>
      <div class="animal-name">${cfg.topicTitle}</div>
      <div class="animal-habitat">
        <span>HABITAT:</span> ${cfg.habitat || 'GLOBAL ECOREGION'}
      </div>
    </div>

    <!-- RIGHT HUD: Tactical Animal Spec Gauges -->
    <div id="tactical-hud" class="tactical-stats-hud clip" data-start="0" data-duration="${totalDuration}" data-track-index="4">
      <div class="stat-card">
        <div class="stat-label">
          <span>⚡ ${meta.labels?.speed || 'TỐC ĐỘ'}</span>
          <span>MAX</span>
        </div>
        <div class="stat-value" id="hud-speed">${stats.speed}</div>
        <div class="stat-bar-outer"><div class="stat-bar-fill" style="width: 88%;"></div></div>
      </div>

      <div class="stat-card">
        <div class="stat-label">
          <span>🦷 ${meta.labels?.biteForce || 'LỰC CẮN'}</span>
          <span>CRUSH</span>
        </div>
        <div class="stat-value" id="hud-bite">${stats.biteForce}</div>
        <div class="stat-bar-outer"><div class="stat-bar-fill" style="width: 95%;"></div></div>
      </div>

      <div class="stat-card">
        <div class="stat-label">
          <span>🧠 ${meta.labels?.tacticalIq || 'TRÍ TUỆ'}</span>
          <span>IQ</span>
        </div>
        <div class="stat-value" style="font-size: 19px;" id="hud-iq">${stats.tacticalIq}</div>
        <div class="stat-bar-outer"><div class="stat-bar-fill" style="width: 98%;"></div></div>
      </div>

      <div class="stat-card">
        <div class="stat-label">
          <span>🎯 ${meta.labels?.successRate || 'TỈ LỆ THÀNH CÔNG'}</span>
          <span>RATE</span>
        </div>
        <div class="stat-value" id="hud-success">${stats.successRate}</div>
        <div class="stat-bar-outer"><div class="stat-bar-fill" style="width: 85%;"></div></div>
      </div>
    </div>

    <!-- BOTTOM ZONE: Subtitle Card & Telemetry -->
    <div id="wildlife-narrative" class="bottom-narrative-zone clip" data-layout-allow-overlap="true" data-layout-allow-overflow="true" data-start="0" data-duration="${totalDuration}" data-track-index="5">
      <div class="scene-tactical-badge" id="scene-badge">
        <span>●</span> <span id="badge-text" style="color: #ffea79;">${timedScenes[0]?.badge || 'HỒ SƠ BÁ CHỦ'}</span>
      </div>
      <div class="narrative-card" data-layout-allow-overlap="true">
        <div class="narrative-text" id="narrative-line" data-layout-allow-overlap="true">
          ${highlightKeywords(timedScenes[0]?.line || '', timedScenes[0]?.highlightWords)}
        </div>
        <div class="telemetry-bar">
          <div id="telemetry-display">${timedScenes[0]?.telemetry || 'TELEMETRY: ACTIVE SENSOR POD'}</div>
          <div class="watermark-tag">${meta.watermark || '@thegioidongvat.ai'}</div>
        </div>
      </div>
    </div>

    <!-- AUDIO TRACKS (Multi-Track Cinema Soundscape + Edge TTS) -->
    <div id="audio-tracks">
${cinemaAudioHtml}

      <!-- VO Clips -->
      ${timedScenes.map((sc, i) => `
      <audio id="vo-${i + 1}" class="clip" src="${sc.voSrc}" data-start="${sc.start}" data-duration="${sc.duration}" data-track-index="${20 + i}"></audio>
      `).join('')}
    </div>
  </div>

  <!-- GSAP ANIMATION TIMELINE -->
  <script>
    const SCENES = ${scenesJson};
    const TOTAL_DURATION = ${totalDuration};

    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["${slug}"] = tl;

    // Timecode simulation in Viewfinder
    tl.to({}, {
      duration: TOTAL_DURATION,
      onUpdate: function() {
        const prog = this.progress();
        const totalFrames = Math.floor(prog * TOTAL_DURATION * 30);
        const mm = String(Math.floor(totalFrames / 1800)).padStart(2, '0');
        const ss = String(Math.floor((totalFrames % 1800) / 30)).padStart(2, '0');
        const ff = String(totalFrames % 30).padStart(2, '0');
        const el = document.getElementById("live-timecode");
        if (el) el.textContent = \`00:\${mm}:\${ss}:\${ff}\`;
      }
    }, 0);

    // Dynamic Reticle Crosshair Pulse
    tl.to(".center-crosshairs", {
      scale: 1.06,
      opacity: 0.8,
      duration: 1.6,
      repeat: Math.floor(TOTAL_DURATION / 1.6) - 1,
      yoyo: true,
      ease: "sine.inOut"
    }, 0);

    // Animate Each Wildlife Scene (Subtle camera scale drift on video or Ken Burns zooms on images, telemetry updates, line swaps)
    SCENES.forEach((sc, idx) => {
      const vidEl = document.getElementById(\`vid-scene-\${idx + 1}\`);
      const imgEl = document.getElementById(\`img-scene-\${idx + 1}\`);
      const vStart = sc.videoStart !== undefined ? sc.videoStart : (idx === 0 ? 0 : sc.start);
      const vDuration = sc.videoDuration || sc.duration;

      if (vidEl) {
        tl.fromTo(vidEl, 
          { scale: 1.0 },
          { 
            scale: 1.04, 
            duration: vDuration, 
            ease: "none" 
          }, 
          vStart
        );
      } else if (imgEl) {
        if (idx > 0) {
          tl.to(imgEl, {
            opacity: 1,
            duration: 0.6,
            ease: "power2.inOut"
          }, sc.start);
          
          const prevImg = document.getElementById(\`img-scene-\${idx}\`);
          if (prevImg) {
            tl.to(prevImg, {
              opacity: 0,
              duration: 0.5,
              ease: "power2.inOut"
            }, sc.start + 0.1);
          }
        }

        tl.fromTo(imgEl, 
          { scale: 1.04, x: 0, y: 0 },
          { 
            scale: 1.15, 
            x: (idx % 2 === 0 ? 15 : -15),
            y: (idx % 3 === 0 ? -10 : 10),
            duration: sc.duration, 
            ease: "none" 
          }, 
          sc.start
        );
      }

      // Update Subtitle & Telemetry Text
      tl.call(() => {
        const badgeEl = document.getElementById("badge-text");
        if (badgeEl) badgeEl.textContent = sc.badge || "THÔNG SỐ CHIẾN THUẬT";

        const lineEl = document.getElementById("narrative-line");
        if (lineEl) {
          lineEl.innerHTML = highlightWordsInJs(sc.line, sc.highlightWords);
        }

        const telemEl = document.getElementById("telemetry-display");
        if (telemEl) telemEl.textContent = sc.telemetry || "TELEMETRY: ACTIVE";
      }, null, sc.start);
    });

    function highlightWordsInJs(text, words) {
      if (!words || !words.length) return text;
      let res = text;
      words.forEach(w => {
        if (!w) return;
        res = res.split(w).join('<span class="highlight-word" data-layout-allow-overlap="true">' + w + '</span>');
      });
      return res;
    }
  </script>
</body>
</html>`;
}
