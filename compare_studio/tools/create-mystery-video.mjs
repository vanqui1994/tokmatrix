#!/usr/bin/env node
// Automated generator for Mystery & Unsolved Real Events videos (25-35s format).
// Inspired by the 2 reference Reels ("Sự Kiện Quá Khứ" / "Sự Kiện Có Thật Mỗi Ngày").
// Generates HyperFrames compositions with Edge TTS, Ken Burns documentary transitions,
// animated telemetry HUD, multi-color keyword highlights, and suspense synth BGM.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateMysteryTopic, slugify } from "./generate-mystery-topic.mjs";
import { ensureAntigravityImages } from "./antigravity-images.mjs";
import { MYSTERY_LANG_META, CURATED_MYSTERIES, MYSTERY_BADGE_SVG } from "./mystery-configs.mjs";
import { COUNTRIES, synthesizeAudio } from "./voices.mjs";
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
 * Creates a complete Mystery video HyperFrames project.
 */
export async function createMysteryVideo(opts = {}) {
  const log = opts.log ?? console.log;

  let cfg = opts.spec?.mysteryConfig || opts.spec || opts.mysteryConfig;
  const lang = cfg?.lang || opts.lang || "vi";
  const meta = MYSTERY_LANG_META[lang] || MYSTERY_LANG_META.vi;

  if (!cfg) {
    if (opts.prompt || opts.query) {
      log(`[1/6] AI Generating mystery topic for "${opts.prompt || opts.query}"...`);
      cfg = await generateMysteryTopic({ prompt: opts.prompt || opts.query, lang, voice: opts.voice });
    } else {
      log(`[1/6] Using curated preset for lang "${lang}"...`);
      cfg = CURATED_MYSTERIES["mystery-bermuda-triangle-vi"];
    }
  }

  const voice = opts.voice || cfg.voice || meta.defaultVoice;
  const rawSlug = opts.slug || cfg.slug || `mystery-${slugify(cfg.topicTitle)}-${lang}`;
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

  // 1. Copy Mystery BGM
  log("[2/6] Copying suspense mystery BGM and badge assets...");
  const bgmSrc = path.join(REPO_ROOT, "tools", "template-mystery", "assets", "audio", "bgm.mp3");
  const bgmDest = path.join(dir, "assets", "audio", "bgm.mp3");
  if (fs.existsSync(bgmSrc)) {
    fs.copyFileSync(bgmSrc, bgmDest);
  } else {
    // fallback to survival BGM
    const fallbackBgm = path.join(REPO_ROOT, "videos", "survival-without-organs", "assets", "audio", "bgm.mp3");
    if (fs.existsSync(fallbackBgm)) fs.copyFileSync(fallbackBgm, bgmDest);
  }

  // Save Mystery Badge SVG
  fs.writeFileSync(path.join(dir, "assets", "images", "badge.svg"), MYSTERY_BADGE_SVG, "utf8");

  // 2. Synthesize TTS voiceover lines with Edge TTS
  log(`[3/6] Synthesizing voiceover lines with Edge TTS (${voice})...`);
  const scenes = cfg.scenes || [];
  const voDir = path.join(dir, "assets", "vo");
  const timedScenes = [];
  let currentTime = 0.5; // Lead-in pause 0.5s

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const voFile = path.join(voDir, `scene-${i + 1}.mp3`);
    const lineText = sc.line;

    log(`  [TTS] Scene ${i + 1}: "${lineText.slice(0, 45)}..."`);
    await synthesizeAudio({
      text: lineText,
      voice,
      outPath: voFile,
      rate: "-4%",
      lang: cfg.lang || "vi",
    });

    const dur = await getAudioDuration(voFile);
    const start = Math.round(currentTime * 100) / 100;
    const roundedDur = Math.round(dur * 100) / 100;
    // 0.55s breathing space between scenes so voices NEVER overlap
    currentTime = Math.round((start + roundedDur + 0.55) * 100) / 100;

    timedScenes.push({
      ...sc,
      index: i + 1,
      start,
      duration: roundedDur,
      voSrc: `assets/vo/scene-${i + 1}.mp3`,
      imgSrc: `assets/images/scene-${i + 1}.jpg`
    });
  }

  const totalDuration = Math.ceil(currentTime + 1.2); // Outro buffer
  log(`  ✓ Audio timeline calculated: ${timedScenes.length} scenes, total duration: ${totalDuration}s`);

  // 3. Ảnh bằng chứng — xin qua hàng đợi Antigravity (tools/antigravity-images.mjs), không Pollinations.
  log("[4/6] Preparing scene imagery via Antigravity...");
  const imageResult = await ensureAntigravityImages({
    dir, slug, log, label: "Bí Ẩn & Kỳ Án",
    timeoutMin: Number(opts.imageTimeoutMin || opts.spec?.imageTimeoutMin || 45),
    items: timedScenes.map((sc) => ({
      key: `scene-${sc.index}`,
      aspect: "4:3",
      dest: sc.imgSrc,
      prompt: `${sc.imagePrompt || sc.line}. Cinematic documentary still photograph, dark moody atmosphere, volumetric light, subtle film grain, realistic, 4:3 frame, no text, no captions, no watermark.`,
    })),
  });

  // 4. Generate package.json, meta.json, hyperframes.json
  log("[5/6] Generating project metadata & config files...");
  const pkg = {
    name: slug,
    private: true,
    type: "module",
    scripts: {
      "dev": "npx --yes hyperframes@0.7.58 preview",
      "check": "npx --yes hyperframes@0.7.58 check",
      "render": "npx --yes hyperframes@0.7.58 render --workers 4 --no-low-memory-mode"
    }
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));

  const hf = {
    "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
    "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    "paths": {
      "blocks": "compositions",
      "components": "compositions/components",
      "assets": "assets"
    }
  };
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify(hf, null, 2));

  const metaData = {
    id: slug,
    name: cfg.topicTitle,
    type: "mystery",
    createdAt: new Date().toISOString(),
    duration: totalDuration,
    mysteryConfig: {
      ...cfg,
      slug,
      lang,
      voice,
      totalDuration,
      scenes: timedScenes
    }
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(metaData, null, 2));

  // Write spec.json for studio compatibility
  const specData = {
    type: "mystery",
    slug,
    lang,
    voice,
    title: cfg.topicTitle,
    category: "mystery",
    message: `${cfg.topicTitle} — ${cfg.eyebrow || meta.eyebrow}`,
    captions: timedScenes.map((s) => s.line),
    spoken: timedScenes.map((s) => s.line),
    script: cfg.fullScriptHtml,
    mysteryConfig: metaData.mysteryConfig
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
const scenes = meta.mysteryConfig?.scenes || [];
const voice = meta.mysteryConfig?.voice || "${voice}";
const lang = meta.lang || "${lang}";
const voDir = path.join(videoDir, "assets", "vo");
fs.mkdirSync(voDir, { recursive: true });

console.log(\`Generating TTS for \${scenes.length} mystery scenes using voice \${voice}...\`);
for (let i = 0; i < scenes.length; i++) {
  const sc = scenes[i];
  const voFile = path.join(voDir, \`scene-\${i + 1}.mp3\`);
  console.log(\`  [TTS \${i + 1}/\${scenes.length}] \${sc.line.slice(0, 40)}...\`);
  await synthesizeAudio({
    text: sc.line,
    voice,
    outPath: voFile,
    rate: "-4%",
    lang,
  });
}
console.log("✓ Done generating mystery voiceover!");
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
    archetype: "mystery",
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
  const html = generateMysteryHtml({
    slug,
    cfg,
    meta,
    timedScenes,
    totalDuration,
    sfxCues,
    bgmSegments,
  });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

  log(`✅ Created mystery video project videos/${slug} (${totalDuration}s) successfully!`);
  return {
    slug,
    dir,
    totalDuration,
    scenesCount: timedScenes.length,
    config: metaData.mysteryConfig
  };
}

/**
 * Builds the complete HyperFrames HTML for the Mystery layout.
 */
export function generateMysteryHtml({ slug, cfg, meta, timedScenes, totalDuration, sfxCues = [], bgmSegments = [] }) {
  const scenesJson = JSON.stringify(timedScenes, null, 2);
  const cinemaAudioHtml = generateCinemaAudioHtml({ sfxCues, bgmSegments });

  return `<!DOCTYPE html>
<html lang="${cfg.lang || 'vi'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920, initial-scale=1.0">
  <title>${cfg.topicTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Montserrat:wght@400;600;800;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
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
      background: #020503;
      color: #FFFFFF;
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      position: relative;
    }

    /* Ambient mystical vignette & vertical rain */
    .bg-gradient {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 15%, rgba(0, 255, 136, 0.12) 0%, transparent 60%),
                  radial-gradient(circle at 50% 85%, rgba(0, 229, 255, 0.08) 0%, transparent 55%),
                  #020503;
      z-index: 1;
    }

    .rain-streaks {
      position: absolute;
      inset: 0;
      background-image: linear-gradient(rgba(0, 255, 136, 0.04) 1px, transparent 1px);
      background-size: 100% 40px;
      opacity: 0.5;
      z-index: 2;
    }

    /* =========================================================================
       ZONE 1: HEADER (0 - 360px)
       ========================================================================= */
    .header-zone {
      position: absolute;
      top: 0;
      left: 0;
      width: 1080px;
      height: 380px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
      padding-top: 25px;
    }

    .badge-wrap {
      width: 130px;
      height: 130px;
      margin-bottom: 12px;
      filter: drop-shadow(0 0 16px rgba(0, 255, 136, 0.6));
    }

    .series-title {
      font-family: 'Cinzel', serif;
      font-size: 42px;
      font-weight: 900;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #FFDE59;
      text-shadow: 0 4px 10px rgba(0, 0, 0, 0.9), 0 0 20px rgba(255, 222, 89, 0.35);
      margin-bottom: 8px;
    }

    .eyebrow-hook {
      font-family: 'Montserrat', sans-serif;
      font-size: 58px;
      font-weight: 900;
      letter-spacing: 3px;
      color: #00FF88;
      text-transform: uppercase;
      text-shadow: 0 0 18px rgba(0, 255, 136, 0.7), 0 0 35px rgba(0, 255, 136, 0.4);
    }

    /* =========================================================================
       ZONE 2: SCRIPT STORYTELLING BOX (380px - 1050px)
       ========================================================================= */
    .script-zone {
      position: absolute;
      top: 380px;
      left: 60px;
      width: 960px;
      height: 650px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      padding: 20px 30px;
      text-align: center;
    }

    .story-card {
      font-size: 44px;
      line-height: 1.52;
      font-weight: 600;
      color: #E2E8F0;
      text-align: center;
      letter-spacing: 0.3px;
    }

    /* Contextual Highlight Classes */
    .hl-red {
      color: #FF3B30;
      font-weight: 900;
      text-shadow: 0 0 14px rgba(255, 59, 48, 0.5);
    }

    .hl-yellow {
      color: #FFD60A;
      font-weight: 900;
      text-shadow: 0 0 14px rgba(255, 214, 10, 0.5);
    }

    .hl-green {
      color: #30D158;
      font-weight: 900;
      text-shadow: 0 0 14px rgba(48, 209, 88, 0.5);
    }

    .hl-cyan {
      color: #00F0FF;
      font-weight: 900;
      text-shadow: 0 0 14px rgba(0, 240, 255, 0.5);
    }

    /* =========================================================================
       ZONE 3: EVIDENCE & FOOTAGE WINDOW (1050px - 1920px)
       ========================================================================= */
    .evidence-zone {
      position: absolute;
      top: 1070px;
      left: 60px;
      width: 960px;
      height: 720px;
      z-index: 10;
      border-radius: 20px;
      overflow: hidden;
      border: 2px solid rgba(0, 255, 136, 0.35);
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 255, 136, 0.2);
      background: #000000;
    }

    .scene-viewport {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .scene-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transform: scale(1.04);
    }

    .scene-image.active {
      opacity: 1;
    }

    /* Telemetry HUD Overlays */
    .hud-header {
      position: absolute;
      top: 18px;
      left: 20px;
      right: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Share Tech Mono', monospace;
      font-size: 22px;
      color: #00FF88;
      text-shadow: 0 0 8px rgba(0, 255, 136, 0.7);
      z-index: 5;
    }

    .rec-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #FF3B30;
      font-weight: bold;
    }

    .rec-dot {
      width: 14px;
      height: 14px;
      background: #FF3B30;
      border-radius: 50%;
      box-shadow: 0 0 10px #FF3B30;
      animation: pulse 1s infinite alternate;
    }

    @keyframes pulse {
      from { opacity: 0.3; }
      to { opacity: 1; }
    }

    .hud-footer {
      position: absolute;
      bottom: 18px;
      left: 20px;
      right: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Share Tech Mono', monospace;
      font-size: 20px;
      color: rgba(255, 255, 255, 0.85);
      z-index: 5;
    }

    .hud-telemetry {
      color: #FFD60A;
      letter-spacing: 1px;
    }

    .watermark-badge {
      color: rgba(255, 255, 255, 0.55);
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Scanlines over evidence window */
    .scanlines {
      position: absolute;
      inset: 0;
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
      background-size: 100% 4px;
      z-index: 4;
      opacity: 0.6;
      pointer-events: none;
    }

    /* Sub-timeline element clip rule */
    .clip {
      position: relative;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${slug}" data-start="0" data-width="1080" data-height="1920" data-duration="${totalDuration}">
    <div class="bg-gradient"></div>
    <div class="rain-streaks"></div>

    <!-- ZONE 1: HEADER -->
    <div id="mystery-header" class="header-zone clip" data-start="0" data-duration="${totalDuration}" data-track-index="1">
      <div class="badge-wrap">
        <img src="assets/images/badge.svg" alt="Mystery Badge" width="130" height="130">
      </div>
      <div class="series-title">${cfg.seriesTitle || 'SỰ KIỆN CÓ THẬT MỖI NGÀY'}</div>
      <div class="eyebrow-hook">${cfg.eyebrow || 'BẠN CÓ BIẾT?'}</div>
    </div>

    <!-- ZONE 2: MIDDLE SCRIPT CARD -->
    <div id="mystery-script" class="script-zone clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">
      <div class="story-card" id="story-content">
        ${cfg.fullScriptHtml}
      </div>
    </div>

    <!-- ZONE 3: EVIDENCE / FOOTAGE WINDOW -->
    <div id="mystery-evidence" class="evidence-zone clip" data-start="0" data-duration="${totalDuration}" data-track-index="3">
    <div class="scene-viewport">
      <div class="scanlines"></div>
      
      <!-- HUD Top -->
      <div class="hud-header">
        <div class="rec-indicator">
          <div class="rec-dot"></div>
          <span>REC</span>
        </div>
        <div id="live-timecode">00:00:00:00</div>
      </div>

      <!-- Scenes Images -->
      ${timedScenes.map((sc, i) => `
      <img src="${sc.imgSrc}" id="img-scene-${i + 1}" class="scene-image ${i === 0 ? 'active' : ''}" alt="Evidence ${i + 1}">
      `).join('')}

      <!-- HUD Bottom -->
      <div class="hud-footer">
        <div class="hud-telemetry" id="telemetry-text">${timedScenes[0]?.telemetry || 'CLASSIFIED DOSSIER'}</div>
        <div class="watermark-badge">${cfg.watermark || 'facebook @sukiencothat'}</div>
      </div>
    </div>
  </div>

  <!-- AUDIO TRACKS (Cinema Soundscape: Multi-Track, Ducked BGM & Auto-SFX) -->
  <div id="audio-tracks">
${cinemaAudioHtml}

    <!-- VO Clips (Track 20+) -->
    ${timedScenes.map((sc, i) => `
    <audio id="vo-${i + 1}" class="clip" src="${sc.voSrc}" data-start="${sc.start}" data-duration="${sc.duration}" data-track-index="${20 + i}"></audio>
    `).join('')}
  </div>
  </div>

  <!-- GSAP TIMELINE SCRIPT -->
  <script>
    const SCENES = ${scenesJson};
    const TOTAL_DURATION = ${totalDuration};

    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["${slug}"] = tl;

    // Timecode simulation
    tl.to({}, {
      duration: TOTAL_DURATION,
      onUpdate: function() {
        const t = this.time();
        const minutes = String(Math.floor(t / 60)).padStart(2, '0');
        const seconds = String(Math.floor(t % 60)).padStart(2, '0');
        const frames = String(Math.floor((t % 1) * 30)).padStart(2, '0');
        const tcEl = document.getElementById("live-timecode");
        if (tcEl) tcEl.textContent = "00:" + minutes + ":" + seconds + ":" + frames;
      }
    }, 0);

    // Dynamic scene visual switching & Ken Burns slow zoom
    SCENES.forEach((sc, idx) => {
      const imgId = "#img-scene-" + (idx + 1);
      const nextImgId = "#img-scene-" + (idx + 2);
      const sceneDur = (idx < SCENES.length - 1) ? (SCENES[idx + 1].start - sc.start) : (TOTAL_DURATION - sc.start);

      // Ken Burns slow pan and scale
      tl.fromTo(imgId, 
        { scale: 1.02, x: 0, y: 0 },
        { scale: 1.08, x: (idx % 2 === 0 ? 12 : -12), duration: sceneDur, ease: "none" },
        sc.start
      );

      // Update Telemetry HUD text
      tl.call(() => {
        const telEl = document.getElementById("telemetry-text");
        if (telEl) telEl.textContent = sc.telemetry;
      }, null, sc.start);

      // Crossfade to next scene
      if (idx < SCENES.length - 1) {
        tl.to(imgId, { opacity: 0, duration: 0.55, ease: "power1.inOut" }, SCENES[idx + 1].start);
        tl.to(nextImgId, { opacity: 1, duration: 0.55, ease: "power1.inOut" }, SCENES[idx + 1].start);
      }
    });
  </script>
</body>
</html>`;
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const prompt = argv.join(" ") || "Bí ẩn Tam giác quỷ Bermuda";
  console.log(`Starting create-mystery-video with prompt: "${prompt}"...`);
  createMysteryVideo({ prompt }).then((res) => {
    console.log("Finished:", res);
  }).catch((err) => {
    console.error("Failed:", err);
  });
}
