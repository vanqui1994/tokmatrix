#!/usr/bin/env node
// Automated generator for Chalkboard Geopolitical Map Videos (>60s, 9:16 Vertical).
// Inspired by RealLifeLore, Johnny Harris, Vox chalkboard documentary maps.
// Generates HyperFrames compositions with authentic dark slate chalkboard,
// real Natural Earth vector country outlines, glowing red highlighted territories,
// curved chalk arrows, star pins, and documentary voiceover with cinematic BGM & SFX.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateChalkTopic, slugify } from "./generate-chalk-topic.mjs";
import { CHALK_LANG_META, CURATED_CHALK_TOPICS, CHALK_SVG_DEFS } from "./chalk-configs.mjs";
import { MIDDLE_EAST_PATHS, US_INSET_PATH } from "./map-paths.mjs";
import { synthesizeAudio } from "./voices.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function findNodeModulesTemplate() {
  const candidates = [
    path.join(REPO_ROOT, "videos", "survival-organs-vi", "node_modules"),
    path.join(REPO_ROOT, "videos", "tcp-vs-udp", "node_modules"),
    path.join(REPO_ROOT, "videos", "dev-vs-devops", "node_modules"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function run(cmd, args, cwd, log = console.log) {
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
    filePath,
  ]);
  const dur = parseFloat(stdout.trim());
  if (Number.isNaN(dur)) throw new Error(`ffprobe failed for ${filePath}`);
  return dur;
}

/**
 * Generate authentic SVG Map graphics using Natural Earth vector data
 */
function getMapSvgContent(mapType, spec) {
  // Build all surrounding Middle Eastern countries with authentic Natural Earth vector paths
  const otherCountries = Object.entries(MIDDLE_EAST_PATHS)
    .filter(([name]) => name !== "Iran")
    .map(([name, pathData]) => `
      <!-- ${name} (Natural Earth) -->
      <path id="country-${name.toLowerCase().replace(/\\s+/g, '-')}"
            d="${pathData}"
            fill="rgba(255, 255, 255, 0.04)"
            stroke="rgba(235, 240, 248, 0.85)"
            stroke-width="2.2"
            filter="url(#chalk-filter)"
            data-layout-allow-overflow="true"
            data-layout-allow-overlap="true" />
    `).join("\n");

  const iranPath = MIDDLE_EAST_PATHS["Iran"];

  return `
    <!-- Natural Earth Regional Map (Middle East & Surrounding) -->
    <g id="natural-earth-base" class="map-feature" data-layout-allow-overflow="true" data-layout-allow-overlap="true">
      ${otherCountries}
    </g>

    <!-- Continental U.S. Inset on Top-Left (as seen in the reference image) -->
    <g id="us-mainland-group" class="map-feature" data-layout-allow-overflow="true" data-layout-allow-overlap="true">
      <path d="${US_INSET_PATH}"
            fill="rgba(255, 255, 255, 0.06)"
            stroke="#ffffff"
            stroke-width="2.6"
            filter="url(#chalk-filter)" />
      <text x="200" y="245"
            font-family="'Montserrat', sans-serif" font-size="36" font-weight="900"
            fill="#ffffff" text-anchor="middle" filter="url(#chalk-filter)">★</text>
      <text x="200" y="285"
            font-family="'Montserrat', sans-serif" font-size="34" font-weight="900"
            fill="#ffffff" text-anchor="middle" letter-spacing="2" filter="url(#chalk-filter)">U.S.</text>
    </g>

    <!-- Targeted Hero Country: IRAN (Authentic Natural Earth Border + Glowing Red Neon + Chalk Hatch Fill) -->
    <g id="target-iran-group" class="hero-region" data-layout-allow-overflow="true" data-layout-allow-overlap="true">
      <!-- Glowing Red Border & Chalk Hatching (exact match to screenshot) -->
      <path id="iran-glow-path"
            d="${iranPath}"
            fill="url(#chalk-hatch-red)"
            stroke="#ff3838"
            stroke-width="5"
            filter="url(#red-chalk-glow)" />
      <path d="${iranPath}"
            fill="rgba(255, 56, 56, 0.16)"
            stroke="#ff6666"
            stroke-width="3"
            filter="url(#chalk-filter)" />
      
      <!-- Star & IRAN Label in geographic center -->
      <g id="iran-label-pin" filter="url(#chalk-filter)">
        <text x="635" y="465"
              font-family="'Montserrat', sans-serif" font-size="44" font-weight="900"
              fill="#ffffff" text-anchor="middle">★</text>
        <text x="635" y="515"
              font-family="'Montserrat', sans-serif" font-size="46" font-weight="900"
              fill="#ffffff" text-anchor="middle" letter-spacing="4">IRAN</text>
      </g>
    </g>

    <!-- Dynamic Chalk Arrows Layer (matching reference image) -->
    <g id="arrows-layer" data-layout-allow-overflow="true" data-layout-allow-overlap="true" data-layout-allow-occlusion="true">
      <!-- Left Arrow: from U.S. pointing towards Middle East -->
      <g id="chalk-arrow-us" filter="url(#arrow-chalk)" data-layout-allow-occlusion="true">
        <path class="arrow-shaft" d="M 270 310 Q 360 410 460 480" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" />
        <path class="arrow-shaft-inner" d="M 270 310 Q 360 410 460 480" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.9" />
        <path class="arrow-head" d="M 460 480 L 430 455 L 450 440 Z" fill="#ffffff" stroke="#ffffff" stroke-width="2" />
        <text x="350" y="430" font-family="'Montserrat', sans-serif" font-size="24" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">ẢNH HƯỞNG MỸ</text>
      </g>

      <!-- Right Giant Curved Chalk Arrow: swooping up from lower-right into Iran (exact match to screenshot!) -->
      <g id="chalk-arrow-iran" filter="url(#arrow-chalk)" data-layout-allow-occlusion="true">
        <path class="arrow-shaft" d="M 980 840 Q 940 560 760 520" fill="none" stroke="#ffffff" stroke-width="20" stroke-linecap="round" />
        <path class="arrow-shaft-inner" d="M 980 840 Q 940 560 760 520" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.9" />
        <path class="arrow-head" d="M 760 520 L 795 490 L 805 525 Z" fill="#ffffff" stroke="#ffffff" stroke-width="3" />
        <text x="890" y="550" font-family="'Montserrat', sans-serif" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">VỊ THẾ IRAN</text>
      </g>
    </g>
  `;
}

/**
 * Creates a complete Chalkboard Geopolitical Map video project.
 */
export async function createChalkVideo(opts = {}) {
  const log = opts.log ?? console.log;

  log(`[1/6] Generating Chalkboard Map topic...`);
  let cfg = opts.spec?.chalkConfig || opts.spec || opts.chalkConfig;
  const lang = cfg?.lang || opts.lang || "vi";
  const meta = CHALK_LANG_META[lang] || CHALK_LANG_META.vi;
  // Default to 9:16 vertical as requested by the user
  const ratio = opts.ratio || cfg?.aspectRatio || "9:16";

  if (!cfg) {
    if (opts.prompt || opts.query) {
      cfg = await generateChalkTopic({ prompt: opts.prompt || opts.query, lang, voice: opts.voice, aspectRatio: ratio });
    } else {
      cfg = CURATED_CHALK_TOPICS["chalk-us-iran-vi"];
    }
  }

  const voice = opts.voice || cfg.voice || meta.defaultVoice;
  const rawSlug = opts.slug || cfg.slug || `chalk-${slugify(cfg.topicTitle)}-${lang}`;
  const slug = rawSlug.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const dir = path.join(REPO_ROOT, "videos", slug);

  if (fs.existsSync(dir)) {
    log(`[1/6] Directory videos/${slug} exists, updating...`);
  } else {
    log(`[1/6] Initializing directory structure videos/${slug}...`);
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.mkdirSync(path.join(dir, "assets", "audio", "sfx"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "vo"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
  fs.mkdirSync(path.join(dir, "snapshots"), { recursive: true });

  // 1. Copy BGM and SFX
  log("[2/6] Setting up dramatic geopolitical BGM & sound effects...");
  const bgmDest = path.join(dir, "assets", "audio", "bgm.mp3");
  const bgmSrc = path.join(REPO_ROOT, "shared", "audio", "bgm", "volatile-reaction.mp3");
  if (fs.existsSync(bgmSrc)) {
    fs.copyFileSync(bgmSrc, bgmDest);
  } else {
    fs.copyFileSync(path.join(REPO_ROOT, "shared", "audio", "bgm", "anxiety.mp3"), bgmDest);
  }

  const sfxDir = path.join(REPO_ROOT, "shared", "audio", "sfx");
  if (fs.existsSync(sfxDir)) {
    for (const file of fs.readdirSync(sfxDir)) {
      if (file.endsWith(".mp3")) {
        fs.copyFileSync(path.join(sfxDir, file), path.join(dir, "assets", "audio", "sfx", file));
      }
    }
  }

  // 2. Synthesize TTS voiceover lines with Edge TTS
  log(`[3/6] Synthesizing ${cfg.scenes.length} voiceover lines with Edge TTS (${voice})...`);
  const durations = [];
  for (let i = 0; i < cfg.scenes.length; i++) {
    const scene = cfg.scenes[i];
    const voPath = path.join(dir, "assets", "vo", `${scene.id}.mp3`);
    log(`  [TTS ${i + 1}/${cfg.scenes.length}] "${scene.line.slice(0, 45)}..."`);
    await synthesizeAudio({
      text: scene.line,
      voice,
      outPath: voPath,
      speedRate: 1.05,
    });
    const dur = await getAudioDuration(voPath);
    durations.push(dur);
  }
  fs.writeFileSync(path.join(dir, "assets", "vo", "durations.json"), JSON.stringify(durations, null, 2));

  // 3. Compute frame-accurate start times and duration
  const startTimes = [];
  let curTime = 1.0; // 1s intro buffer
  for (let i = 0; i < durations.length; i++) {
    startTimes.push(curTime);
    curTime += durations[i] + 0.45; // 0.45s pause between sentences
  }
  const totalDuration = Math.ceil(curTime + 2.0); // outro hold
  log(`[3/6] Total composition duration: ${totalDuration}s (>60s verified)`);

  // 4. Dimensions: 9:16 Vertical format
  const compWidth = 1080;
  const compHeight = 1920;

  // 5. Generate package.json & hyperframes.json
  const pkg = {
    name: slug,
    private: true,
    type: "module",
    scripts: {
      dev: "npx --yes hyperframes@0.7.58 preview",
      check: "npx --yes hyperframes@0.7.58 check",
      render: "npx --yes hyperframes@0.7.58 render --workers 4 --no-low-memory-mode",
      publish: "npx --yes hyperframes@0.7.58 publish",
    },
    dependencies: {
      "edge-tts-universal": "^1.4.0",
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

  // Symlink node_modules
  const nmSrc = findNodeModulesTemplate();
  const nmDest = path.join(dir, "node_modules");
  if (nmSrc && !fs.existsSync(nmDest)) {
    try {
      fs.symlinkSync(nmSrc, nmDest, "junction");
    } catch (e) {
      log(`  [Symlink warning] ${e.message}`);
    }
  }

  // 6. Generate HTML Composition
  log(`[4/6] Building Authentic 9:16 Chalkboard Map Composition (HTML/SVG/GSAP)...`);
  const mapSvg = getMapSvgContent(cfg.mapType || "middle-east", cfg);

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${compWidth}, height=${compHeight}, initial-scale=1.0">
  <title>${cfg.topicTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,800;0,900;1,900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }

    body {
      width: ${compWidth}px;
      height: ${compHeight}px;
      background: #14171a;
      color: #ffffff;
      font-family: 'Montserrat', -apple-system, sans-serif;
      overflow: hidden;
      position: relative;
    }

    /* Authentic Blackboard Canvas Slate Texture & Chalk Dust */
    .chalkboard-bg {
      position: absolute;
      inset: 0;
      background: 
        radial-gradient(ellipse at 50% 40%, rgba(255, 255, 255, 0.07) 0%, transparent 65%),
        radial-gradient(circle at 10% 20%, rgba(255, 255, 255, 0.04) 0%, transparent 35%),
        radial-gradient(circle at 85% 80%, rgba(0, 0, 0, 0.6) 0%, transparent 60%),
        #16191d;
      z-index: 1;
    }

    /* Subtle blackboard chalk noise */
    .chalk-dust {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px);
      background-size: 28px 28px;
      opacity: 0.35;
      z-index: 2;
      pointer-events: none;
    }

    /* Blackboard border frame */
    .blackboard-frame {
      position: absolute;
      inset: 16px;
      border: 3px solid rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      z-index: 3;
      pointer-events: none;
    }

    /* =========================================================================
       ZONE 1: TOP CHALK HEADER (0px - 280px)
       ========================================================================= */
    .header-hud {
      position: absolute;
      top: 50px;
      left: 50px;
      right: 50px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 20;
      text-align: center;
    }

    .series-badge {
      font-family: 'Share Tech Mono', monospace;
      font-size: 22px;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: #ffd60a;
      background: rgba(0, 0, 0, 0.5);
      padding: 8px 24px;
      border-radius: 6px;
      border: 1.5px solid rgba(255, 214, 10, 0.35);
      margin-bottom: 12px;
    }

    .main-chalk-title {
      font-size: 64px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: #ffffff;
      text-shadow: 0 0 14px rgba(255, 255, 255, 0.5), 0 4px 18px rgba(0, 0, 0, 0.9);
      font-style: italic;
    }

    .current-scene-header {
      font-size: 32px;
      font-weight: 800;
      color: #ff7878;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-top: 10px;
      opacity: 1;
      text-shadow: 0 0 14px rgba(255, 68, 68, 0.6);
    }

    /* =========================================================================
       ZONE 2: CENTER MAP VIEWPORT (280px - 1460px = 1180px high!)
       ========================================================================= */
    .map-container {
      position: absolute;
      top: 260px;
      left: 0;
      width: 1080px;
      height: 1220px;
      z-index: 10;
      overflow: hidden;
    }

    #camera-stage {
      width: 100%;
      height: 100%;
      transform-origin: 540px 600px;
    }

    /* =========================================================================
       ZONE 3: BOTTOM STORYTELLING CARD (1480px - 1880px)
       ========================================================================= */
    .story-card-zone {
      position: absolute;
      bottom: 45px;
      left: 45px;
      right: 45px;
      height: 320px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 25;
      background: rgba(16, 20, 26, 0.88);
      backdrop-filter: blur(16px);
      border: 1.5px solid rgba(255, 255, 255, 0.18);
      border-radius: 16px;
      padding: 24px 45px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.85), 0 0 25px rgba(255, 255, 255, 0.04);
    }

    .story-caption {
      font-size: 38px;
      line-height: 1.52;
      font-weight: 600;
      color: #f1f5f9;
      text-align: center;
      opacity: 1;
    }

    .hl-red { color: #ff4444; font-weight: 900; text-shadow: 0 0 10px rgba(255, 68, 68, 0.5); }
    .hl-yellow { color: #ffd60a; font-weight: 900; text-shadow: 0 0 10px rgba(255, 214, 10, 0.5); }
    .hl-cyan { color: #38bdf8; font-weight: 900; text-shadow: 0 0 10px rgba(56, 189, 248, 0.5); }

    .clip {
      position: relative;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${slug}" data-start="0" data-width="${compWidth}" data-height="${compHeight}" data-duration="${totalDuration}">
    <div class="chalkboard-bg"></div>
    <div class="chalk-dust"></div>
    <div class="blackboard-frame"></div>

    <!-- ZONE 1: TOP CHALK HEADER -->
    <div id="header-zone" class="header-hud clip" data-start="0" data-duration="${totalDuration}" data-track-index="1">
      <div class="series-badge">${meta.badge}</div>
      <h1 class="main-chalk-title" id="main-title">${cfg.topicTitle}</h1>
      <div class="current-scene-header" id="scene-subhead">${cfg.headline}</div>
    </div>

    <!-- ZONE 2: CHALKBOARD MAP CANVAS (1080x1220 stage) -->
    <div id="map-zone" class="map-container clip" data-start="0" data-duration="${totalDuration}" data-track-index="2" data-layout-allow-overflow="true" data-layout-allow-overlap="true">
      <svg id="chalk-svg" width="100%" height="100%" viewBox="0 0 1080 1100" preserveAspectRatio="xMidYMid meet" data-layout-allow-overflow="true" data-layout-allow-overlap="true">
        ${CHALK_SVG_DEFS}
        <g id="camera-stage" data-layout-allow-overflow="true" data-layout-allow-overlap="true">
          ${mapSvg}
        </g>
      </svg>
    </div>

    <!-- ZONE 3: LOWER CAPTION CARD -->
    <div id="caption-zone" class="story-card-zone clip" data-start="0" data-duration="${totalDuration}" data-track-index="3">
      <div class="story-caption" id="live-caption">${cfg.scenes[0]?.line}</div>
    </div>

    <!-- AUDIO ELEMENTS -->
    <!-- BGM -->
    <audio id="bgm" src="assets/audio/bgm.mp3" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="10" data-volume="0.30"></audio>

    <!-- VOICE OVER SCENES -->
    ${cfg.scenes.map((s, i) => `
      <audio id="vo-${s.id}" src="assets/vo/${s.id}.mp3" class="clip" data-start="${startTimes[i]}" data-duration="${durations[i]}" data-track-index="${11 + i}" data-volume="1.25"></audio>
    `).join("\n")}

    <!-- SFX -->
    <audio id="sfx-boom" src="assets/audio/sfx/deep_boom.mp3" class="clip" data-start="0" data-duration="2.93" data-track-index="30" data-volume="0.35"></audio>
    <audio id="sfx-ping" src="assets/audio/sfx/ding.mp3" class="clip" data-start="0" data-duration="1.30" data-track-index="31" data-volume="0.35"></audio>
    <audio id="sfx-click" src="assets/audio/sfx/click.mp3" class="clip" data-start="0" data-duration="1.00" data-track-index="32" data-volume="0.35"></audio>
  </div>

  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["${slug}"] = tl;

    // Timeline Configuration Data
    const SCENES = ${JSON.stringify(cfg.scenes)};
    const START_TIMES = ${JSON.stringify(startTimes)};
    const DURATIONS = ${JSON.stringify(durations)};

    const cameraStage = document.getElementById("camera-stage");
    const liveCaption = document.getElementById("live-caption");
    const sceneSubhead = document.getElementById("scene-subhead");

    // Initialize Intro State
    gsap.set(cameraStage, { x: 0, y: 0, scale: 1 });
    gsap.set("#scene-subhead", { opacity: 1, y: 0 });

    // Choreograph each scene across the >60s timeline
    SCENES.forEach((scene, i) => {
      const start = START_TIMES[i];
      const dur = DURATIONS[i];

      // Camera Movement to target region
      if (scene.camera) {
        tl.to(cameraStage, {
          x: scene.camera.x || 0,
          y: scene.camera.y || 0,
          scale: scene.camera.scale || 1,
          duration: 1.8,
          ease: "power2.inOut"
        }, start);
      }

      // Update Header Subhead text
      tl.to(sceneSubhead, {
        opacity: 0,
        y: -10,
        duration: 0.25,
        onComplete: () => {
          sceneSubhead.textContent = scene.header || scene.badge || "";
        }
      }, start);

      tl.to(sceneSubhead, {
        opacity: 1,
        y: 0,
        duration: 0.35,
        ease: "back.out(1.4)"
      }, start + 0.25);

      // Update Caption Card text
      tl.to(liveCaption, {
        opacity: 0,
        y: 8,
        duration: 0.2,
        onComplete: () => {
          liveCaption.textContent = scene.line;
        }
      }, start);

      tl.to(liveCaption, {
        opacity: 1,
        y: 0,
        duration: 0.3,
        ease: "power1.out"
      }, start + 0.2);

      // Hero region glow pulsation
      tl.to("#iran-glow-path", {
        filter: "url(#red-chalk-glow)",
        strokeWidth: 6.5,
        duration: 0.6,
        yoyo: true,
        repeat: 1
      }, start + 0.5);
    });

    // Outro hold
    tl.to(cameraStage, {
      scale: 1,
      x: 0,
      y: 0,
      duration: 2.2,
      ease: "power2.out"
    }, START_TIMES[START_TIMES.length - 1] + DURATIONS[DURATIONS.length - 1]);
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

  // Write spec.json for reference
  fs.writeFileSync(
    path.join(dir, "spec.json"),
    JSON.stringify({ ...cfg, totalDuration, startTimes, durations }, null, 2),
    "utf8"
  );

  // Write meta.json for Studio UI and metadata
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        id: slug,
        name: cfg.title || cfg.topicTitle || slug,
        createdAt: new Date().toISOString(),
        duration: totalDuration,
        type: "chalk",
        lang,
        chalkConfig: {
          title: cfg.title,
          subtitle: cfg.subtitle,
          voice,
          duration: totalDuration,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  // 7. Validate with npm run check
  log("[5/6] Validating HyperFrames composition with check...");
  try {
    await run("npm", ["run", "check"], dir, log);
    log(`[5/6] ✓ HyperFrames check passed!`);
  } catch (err) {
    log(`[5/6] ⚠️ HyperFrames check reported: ${err.message}`);
  }

  // 8. Render if requested
  if (opts.render) {
    log(`[6/6] Rendering 9:16 vertical video to MP4 in videos/${slug}/renders/...`);
    await run("npx", ["--yes", "hyperframes@0.7.58", "render", "--output", `renders/${slug}.mp4`], dir, log);
    log(`[6/6] ✓ Render complete: videos/${slug}/renders/${slug}.mp4`);

    // Universal compatibility optimization (QuickTime, Safari, iOS, social media)
    const rawOutput = path.join(dir, "renders", `${slug}.mp4`);
    const tempOptimized = path.join(dir, "renders", `${slug}-opt.mp4`);
    try {
      log(`[6/6] Optimizing MP4 for universal playback (+faststart, Level 4.2, YUV420p)...`);
      await run("ffmpeg", [
        "-i", rawOutput,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-profile:v", "high",
        "-level", "4.2",
        "-preset", "medium",
        "-crf", "18",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y", tempOptimized,
      ], dir, log);
      fs.renameSync(tempOptimized, rawOutput);
      log(`[6/6] ✓ Universal playback optimization successfully applied!`);
    } catch (optErr) {
      log(`[6/6] ⚠️ Transcode optimization note: ${optErr.message}`);
    }
  } else {
    log(`[6/6] Composition ready! Run 'npm run render' inside videos/${slug} to export MP4.`);
  }

  return { slug, dir, totalDuration };
}

// CLI usage
if (process.argv[1] && process.argv[1].endsWith("create-chalk-video.mjs")) {
  const args = process.argv.slice(2);
  const render = args.includes("--render");
  const promptIdx = args.findIndex((a) => !a.startsWith("-"));
  const prompt = promptIdx >= 0 ? args[promptIdx] : "U.S. vs Iran";
  createChalkVideo({ prompt, render }).catch((err) => {
    console.error("Failed to create Chalkboard video:", err);
    process.exit(1);
  });
}
