#!/usr/bin/env node
// Automated generator for Tier List Ranking Videos (9:16 Vertical, SSS to D).
// Inspired by TikTok/Shorts viral tier ranking formats (e.g. source_videos/Telegram Web.mp4).
// Features: Dark Slate Blueprint Grid background, 6-Tier Board (SSS to D),
// dynamic contender showcase card, and GSAP physics slam placement into tier tray with SFX & camera shake.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateTierListTopic, slugify } from "./generate-tierlist-topic.mjs";
import { ensureAntigravityImages } from "./antigravity-images.mjs";
import { TIER_DEFINITIONS, TIERLIST_LANG_META, CURATED_TIERLIST_TOPICS } from "./tierlist-configs.mjs";
import { synthesizeAudio } from "./voices.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_VIDEO = path.join(REPO_ROOT, "videos", "survival-without-organs");

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
 * Creates a complete Tier List Ranking video project.
 */
export async function createTierListVideo(opts = {}) {
  const log = opts.log ?? console.log;

  let cfg = opts.spec?.tierListConfig || opts.spec || opts.tierListConfig;
  const lang = cfg?.lang || opts.lang || "vi";
  const meta = TIERLIST_LANG_META[lang] || TIERLIST_LANG_META.vi;

  if (!cfg) {
    if (opts.prompt || opts.query) {
      log(`[1/6] AI Generating Tier List topic for "${opts.prompt || opts.query}"...`);
      cfg = await generateTierListTopic({ prompt: opts.prompt || opts.query, lang, voice: opts.voice });
    } else {
      log(`[1/6] Using curated preset for lang "${lang}"...`);
      cfg = CURATED_TIERLIST_TOPICS[`tierlist-idle-games-${lang}`] || CURATED_TIERLIST_TOPICS["tierlist-idle-games-vi"];
    }
  }

  const voice = opts.voice || cfg.voice || meta.defaultVoice;
  const rawSlug = opts.slug || cfg.slug || `tierlist-${slugify(cfg.topicTitle)}-${lang}`;
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
  log("[2/6] Setting up gaming BGM & whoosh/slam SFX...");
  const bgmSrc = path.join(REPO_ROOT, "shared", "audio", "bgm", "carefree.mp3");
  const bgmDest = path.join(dir, "assets", "audio", "bgm.mp3");
  if (fs.existsSync(bgmSrc)) {
    fs.copyFileSync(bgmSrc, bgmDest);
  } else {
    fs.copyFileSync(path.join(REPO_ROOT, "shared", "audio", "bgm", "monkeys-spinning.mp3"), bgmDest);
  }

  const whooshSrc = path.join(REPO_ROOT, "shared", "audio", "sfx", "whoosh.mp3");
  if (fs.existsSync(whooshSrc)) {
    fs.copyFileSync(whooshSrc, path.join(dir, "assets", "audio", "whoosh.mp3"));
  }
  const slamSrc = path.join(REPO_ROOT, "shared", "audio", "sfx", "sub_drop.mp3");
  if (fs.existsSync(slamSrc)) {
    fs.copyFileSync(slamSrc, path.join(dir, "assets", "audio", "slam.mp3"));
  }
  const popSrc = path.join(REPO_ROOT, "shared", "audio", "sfx", "pop.mp3");
  if (fs.existsSync(popSrc)) {
    fs.copyFileSync(popSrc, path.join(dir, "assets", "audio", "pop.mp3"));
  }

  // 2. Ảnh ứng viên — icon (1:1) và ảnh giới thiệu (9:16) xin qua hàng đợi Antigravity.
  // Trước đây chép từ một thư mục Antigravity đặt cứng trên máy Mac, nên video tạo trên
  // VPS không có ảnh.
  const items = cfg.items || [];
  const imageResult = await ensureAntigravityImages({
    dir, slug, log, label: "Tier List Xếp Hạng",
    timeoutMin: Number(opts.imageTimeoutMin || opts.spec?.imageTimeoutMin || 45),
    items: items.flatMap((item, i) => {
      const subject = [item.name, item.subtitle].filter(Boolean).join(" — ");
      return [
        {
          key: `item-${i + 1}-icon`, aspect: "1:1", dest: `assets/images/item-${i + 1}-icon.jpg`,
          prompt: `${item.imagePrompt || subject}. Iconic square app-icon style artwork of this subject, bold clean shapes, vibrant colors, centered on a simple background, no text, no letters, no watermark.`,
        },
        {
          key: `item-${i + 1}-showcase`, aspect: "9:16", dest: `assets/images/item-${i + 1}-showcase.jpg`,
          prompt: `${item.showcasePrompt || subject}. Vertical 9:16 cinematic showcase scene featuring this subject, dramatic lighting, rich detail, no text, no UI, no watermark.`,
        },
      ];
    }),
  });

  // 3. Synthesize TTS Voiceover for Hook, Reviews, and Verdicts
  log(`[3/6] Synthesizing voiceover lines with Edge TTS (${voice})...`);
  const voDir = path.join(dir, "assets", "vo");
  const timedItems = [];
  let currentTime = 1.8; // intro title duration

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const voReviewFile = path.join(voDir, `item-${i + 1}-review.mp3`);
    const voVerdictFile = path.join(voDir, `item-${i + 1}-verdict.mp3`);

    // Line 1: Hook + Review
    const reviewText = `${item.hook} ${item.review}`;
    log(`  [TTS Review] Item ${i + 1} (${item.name}): "${reviewText.slice(0, 50)}..."`);
    await synthesizeAudio({
      text: reviewText,
      voice,
      outPath: voReviewFile,
    });
    const reviewDur = await getAudioDuration(voReviewFile);

    // Line 2: Verdict (Slam)
    const verdictText = item.verdict;
    log(`  [TTS Verdict] Item ${i + 1} (${item.tier}): "${verdictText}"`);
    await synthesizeAudio({
      text: verdictText,
      voice,
      outPath: voVerdictFile,
    });
    const verdictDur = await getAudioDuration(voVerdictFile);

    const itemStart = currentTime;
    const reviewStart = itemStart + 0.2;
    const verdictStart = reviewStart + reviewDur + 0.3;
    const slamTime = verdictStart + (verdictDur * 0.55); // Slam hits right as the rank is announced!
    const itemEnd = verdictStart + verdictDur + 0.8;

    timedItems.push({
      ...item,
      index: i + 1,
      itemStart,
      reviewStart,
      reviewDur,
      verdictStart,
      verdictDur,
      slamTime,
      itemEnd,
      duration: itemEnd - itemStart,
      voReviewSrc: `assets/vo/item-${i + 1}-review.mp3`,
      voVerdictSrc: `assets/vo/item-${i + 1}-verdict.mp3`,
      iconSrc: `assets/images/item-${i + 1}-icon.jpg`,
      showcaseSrc: `assets/images/item-${i + 1}-showcase.jpg`,
    });

    currentTime = itemEnd;
  }

  const totalDuration = Math.ceil(currentTime + 2.5); // 2.5s outro final board view
  log(`[4/6] Calculated total duration: ${totalDuration}s`);

  // 4. Generate HTML Composition
  log("[5/6] Generating HyperFrames index.html & GSAP animations...");
  const html = generateTierListHtml({
    slug,
    cfg,
    meta,
    timedItems,
    totalDuration,
  });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

  // 5. Generate package.json, hyperframes.json, meta.json
  const metaJson = {
    id: slug,
    name: cfg.topicTitle,
    category: "tierlist-ranking",
    template: "tierlist",
    lang,
    created: new Date().toISOString(),
    totalDuration,
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(metaJson, null, 2), "utf8");

  const specJson = {
    type: "tierlist",
    slug,
    tierListConfig: cfg,
    items: timedItems,
    topicTitle: cfg.topicTitle,
    headline: cfg.headline,
    lang,
    totalDuration,
  };
  fs.writeFileSync(path.join(dir, "spec.json"), JSON.stringify(specJson, null, 2), "utf8");

  const hyperframesJson = {
    $schema: "https://hyperframes.heygen.com/schema.json",
    compositions: [
      {
        id: slug,
        width: 1080,
        height: 1920,
        fps: 30,
        duration: totalDuration,
      }
    ]
  };
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify(hyperframesJson, null, 2), "utf8");

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
      "gsap": "^3.14.2",
      "hyperframes": "^1.1.0"
    }
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkgJson, null, 2), "utf8");

  // Symlink node_modules if needed
  if (!fs.existsSync(path.join(dir, "node_modules")) && fs.existsSync(path.join(TEMPLATE_VIDEO, "node_modules"))) {
    try {
      fs.symlinkSync(path.join(TEMPLATE_VIDEO, "node_modules"), path.join(dir, "node_modules"), "junction");
    } catch (e) {
      // ignore
    }
  }

  log(`\n🎉 Successfully created Tier List video project: videos/${slug}`);
  log(`  - Preview URL: http://localhost:4321/?v=${slug}`);
  log(`  - Run check: cd videos/${slug} && npm run check`);
  log(`  - Render MP4: cd videos/${slug} && npm run render\n`);

  if (opts.render && imageResult.pending.length) {
    log(`[6/6] Chưa render: còn ${imageResult.pending.length} ảnh chờ Antigravity. Khi ảnh về, bấm "🎨 Ảnh Antigravity" (tự render tiếp).`);
  } else if (opts.render) {
    log("[6/6] Rendering final MP4...");
    await run("npm", ["run", "render", "--", "--workers", "4", "--no-low-memory-mode"], dir, log);
    log(`✨ MP4 render finished in videos/${slug}/renders/!`);
  }

  return { slug, dir, totalDuration, cfg };
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

/**
 * Generate HyperFrames HTML for Tier List Ranking
 */
export function generateTierListHtml({ slug, cfg, meta, timedItems, totalDuration }) {
  // Coordinates mapping for each Tier tray slot:
  // Board top starts at 240px. Each row is 142px tall with 10px gap.
  const tierYMap = {
    SSS: 240,
    S: 392,
    A: 544,
    B: 696,
    C: 848,
    D: 1000,
  };

  const itemsJson = JSON.stringify(timedItems.map(item => ({
    id: item.id,
    index: item.index,
    name: item.name,
    subtitle: item.subtitle,
    tier: item.tier,
    itemStart: item.itemStart,
    reviewStart: item.reviewStart,
    verdictStart: item.verdictStart,
    slamTime: item.slamTime,
    itemEnd: item.itemEnd,
    targetY: tierYMap[item.tier] || 848,
  })));

  return `<!DOCTYPE html>
<html lang="${cfg.lang || 'vi'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${cfg.topicTitle || 'TIER LIST RANKING'}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
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
      background: #141312;
      color: #FFFFFF;
      font-family: 'Outfit', sans-serif;
      overflow: hidden;
      position: relative;
    }

    /* Blueprint / Dark Slate Grid Background (Exact match to Telegram Web.mp4) */
    .tierlist-bg {
      position: absolute;
      inset: 0;
      background-color: #141312;
      background-image:
        linear-gradient(to right, rgba(255, 255, 255, 0.08) 1.5px, transparent 1.5px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1.5px, transparent 1.5px);
      background-size: 60px 60px;
      z-index: 1;
    }

    .ambient-vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 50%, transparent 40%, rgba(0, 0, 0, 0.75) 100%);
      z-index: 2;
    }

    /* ZONE 1: TOP HEADER */
    .tierlist-header {
      position: absolute;
      top: 45px;
      left: 50px;
      width: 980px;
      height: 170px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      z-index: 10;
    }

    .header-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 18px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #FCD34D;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .header-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 38px;
      font-weight: 900;
      line-height: 1.15;
      text-transform: uppercase;
      letter-spacing: -0.5px;
      color: #FFFFFF;
      text-shadow: 0 4px 16px rgba(0, 0, 0, 0.9);
    }

    .header-headline {
      font-size: 24px;
      font-weight: 800;
      color: #38BDF8;
      letter-spacing: 1px;
      margin-top: 4px;
      text-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
    }

    /* ZONE 2: TIER BOARD (6 ROWS) */
    .tier-board {
      position: absolute;
      top: 230px;
      left: 50px;
      width: 980px;
      height: 890px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 10;
      will-change: transform;
    }

    .tier-row {
      width: 980px;
      height: 136px;
      display: flex;
      align-items: center;
      position: relative;
    }

    /* Badge on Left */
    .tier-badge {
      width: 170px;
      height: 136px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.4);
      z-index: 2;
    }

    .badge-icon {
      font-size: 32px;
      line-height: 1;
      margin-bottom: 2px;
    }

    .badge-name {
      font-family: 'Montserrat', sans-serif;
      font-size: 46px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 1px;
      text-shadow: 0 3px 8px rgba(0, 0, 0, 0.8), 0 0 2px #000;
    }

    /* Tray on Right */
    .tier-tray {
      width: 798px;
      height: 136px;
      margin-left: 12px;
      background: rgba(18, 16, 15, 0.94);
      border-radius: 16px;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 14px;
      box-shadow: inset 0 4px 12px rgba(0, 0, 0, 0.8);
      position: relative;
      overflow: hidden;
    }

    /* Individual Placed Item Thumbnail in Tray */
    .placed-item {
      width: 114px;
      height: 114px;
      border-radius: 14px;
      overflow: hidden;
      position: relative;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.8);
      opacity: 0;
      transform: scale(0.5);
    }

    .placed-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* ZONE 3: ACTIVE CONTENDER SHOWCASE STAGE (Center / Bottom) */
    .contender-stage {
      position: absolute;
      top: 1140px;
      left: 50px;
      width: 980px;
      height: 600px;
      background: rgba(22, 19, 18, 0.95);
      border: 2px solid rgba(255, 215, 0, 0.4);
      border-radius: 24px;
      padding: 24px 30px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.1);
      z-index: 20;
      position: relative;
    }

    .contender-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 14px;
    }

    .contender-meta {
      display: flex;
      flex-direction: column;
    }

    .contender-eyebrow {
      font-size: 16px;
      font-weight: 800;
      color: #94A3B8;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .contender-name {
      font-family: 'Montserrat', sans-serif;
      font-size: 34px;
      font-weight: 900;
      color: #FFFFFF;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .contender-tag {
      font-size: 20px;
      font-weight: 700;
      color: #FBBF24;
    }

    .contender-status-pill {
      background: linear-gradient(135deg, #F59E0B, #D97706);
      color: #000;
      font-weight: 900;
      font-size: 20px;
      padding: 8px 18px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
    }

    /* Showcase Display Area */
    .showcase-body {
      display: flex;
      gap: 24px;
      align-items: center;
      margin-top: 10px;
      height: 380px;
    }

    .showcase-visual {
      width: 560px;
      height: 360px;
      border-radius: 18px;
      overflow: hidden;
      border: 2px solid rgba(255, 255, 255, 0.15);
      position: relative;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
    }

    .showcase-visual img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .showcase-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
      justify-content: center;
    }

    .showcase-avatar-box {
      width: 130px;
      height: 130px;
      border-radius: 20px;
      overflow: hidden;
      border: 3px solid #FBBF24;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.6);
      margin-bottom: 4px;
    }

    .showcase-avatar-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .feature-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      font-size: 18px;
      font-weight: 700;
      color: #E2E8F0;
    }

    /* Flying Slam Proxy Element using transform (x, y) */
    .flying-card {
      position: absolute;
      top: 0;
      left: 0;
      width: 140px;
      height: 140px;
      border-radius: 16px;
      overflow: hidden;
      z-index: 50;
      opacity: 0;
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.9), 0 0 25px rgba(255, 255, 255, 0.4);
      will-change: transform, opacity;
    }

    .flying-card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* ZONE 4: NEON KINETIC SUBTITLES (BOTTOM) */
    .subtitle-zone {
      position: absolute;
      top: 1760px;
      left: 50px;
      width: 980px;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      z-index: 30;
      padding: 0 20px;
    }

    .subtitle-text {
      font-family: 'Montserrat', sans-serif;
      font-size: 34px;
      font-weight: 900;
      text-transform: uppercase;
      color: #FFFFFF;
      letter-spacing: 1px;
      line-height: 1.25;
      text-shadow: 0 0 20px rgba(0, 229, 255, 0.8), 0 0 6px #00E5FF, 0 3px 8px #000;
    }
  </style>
</head>
<body>
  <div id="composition" class="clip" data-composition-id="${slug}" data-width="1080" data-height="1920" data-start="0" data-duration="${totalDuration}" data-track-index="0">
    <!-- BACKGROUND -->
    <div class="tierlist-bg"></div>
    <div class="ambient-vignette"></div>

    <!-- ZONE 1: HEADER -->
    <div id="tierlist-header" class="tierlist-header clip" data-start="0" data-duration="${totalDuration}" data-track-index="1">
      <div class="header-eyebrow">👑 ${meta.eyebrow}</div>
      <div class="header-title">${cfg.topicTitle}</div>
      <div class="header-headline">${cfg.headline}</div>
    </div>

    <!-- ZONE 2: TIER BOARD -->
    <div id="tier-board" class="tier-board clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">
      ${TIER_DEFINITIONS.map(tier => {
        let svgIcon = '';
        if (tier.id === 'SSS') {
          svgIcon = '<svg viewBox="0 0 24 24" width="34" height="34" fill="#ffffff"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>';
        } else if (tier.id === 'S') {
          svgIcon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#ffffff"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
        } else if (tier.id === 'A') {
          svgIcon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#000000"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg>';
        } else if (tier.id === 'B') {
          svgIcon = '<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff"><circle cx="12" cy="12" r="10" stroke="#ffffff" stroke-width="2" fill="none"/><path d="M10 8h4c1.1 0 2 .9 2 2 0 .7-.4 1.3-1 1.7.8.4 1 1.1 1 1.8 0 1.1-.9 2-2 2h-4V8zm2 3h2c.55 0 1-.45 1-1s-.45-1-1-1h-2v2zm0 3.5h2.5c.55 0 1-.45 1-1s-.45-1-1-1H12v2z"/></svg>';
        } else if (tier.id === 'C') {
          svgIcon = '<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        } else {
          svgIcon = '<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>';
        }
        return `
      <div class="tier-row" id="tier-row-${tier.id}">
        <div class="tier-badge" style="background: ${tier.bgGradient}; border: 2px solid ${tier.borderColor}; color: ${tier.textColor};">
          <div class="badge-icon">${svgIcon}</div>
          <span class="badge-name">${tier.name}</span>
        </div>
        <div class="tier-tray" id="tray-${tier.id}" style="border: 2px solid ${tier.borderColor};">
          ${timedItems.filter(it => it.tier === tier.id).map(it => `
          <div class="placed-item" id="placed-${it.id}" style="border: 2px solid ${tier.borderColor};">
            <img src="${it.iconSrc}" alt="${it.name}">
          </div>
          `).join('')}
        </div>
      </div>
      `;}).join('')}
    </div>

    <!-- ZONE 3: ACTIVE CONTENDER STAGE -->
    <div id="contender-stage" class="contender-stage clip" data-start="${timedItems[0]?.itemStart || 1.8}" data-duration="${totalDuration - (timedItems[0]?.itemStart || 1.8)}" data-track-index="3">
      <div class="contender-header">
        <div class="contender-meta">
          <span class="contender-eyebrow" id="stage-eyebrow">ỨNG VIÊN #1</span>
          <span class="contender-name" id="stage-name">${timedItems[0]?.name || ''}</span>
          <span class="contender-tag" id="stage-tag">${timedItems[0]?.subtitle || ''}</span>
        </div>
        <div class="contender-status-pill" id="stage-pill">
          <span>RANK:</span>
          <span id="stage-rank-target">?</span>
        </div>
      </div>
      <div class="showcase-body">
        <div class="showcase-visual">
          <img id="stage-showcase-img" src="${timedItems[0]?.showcaseSrc || ''}" alt="Candidate Showcase Preview">
        </div>
        <div class="showcase-info">
          <div class="showcase-avatar-box">
            <img id="stage-icon-img" src="data:image/svg+xml,%3Csvg id='stage-icon-placeholder' xmlns='http://www.w3.org/2000/svg' width='100' height='100'/%3E" alt="Candidate Avatar Thumbnail">
          </div>
          <div class="feature-pill" id="feat-1">⚡ Gameplay Cuốn Hút</div>
          <div class="feature-pill" id="feat-2">🎮 Đồ Họa Độc Đáo</div>
        </div>
      </div>
    </div>

    <!-- FLYING SLAM PROXY CARD -->
    <div id="flying-card" class="flying-card">
      <img id="flying-img" src="data:image/svg+xml,%3Csvg id='flying-card-placeholder' xmlns='http://www.w3.org/2000/svg'/%3E" alt="Flying Thumbnail">
    </div>


    <!-- ZONE 4: SUBTITLE TRACK -->
    <div id="subtitle-zone" class="subtitle-zone clip" data-start="0" data-duration="${totalDuration}" data-track-index="4">
      <div class="subtitle-text" id="live-subtitle">${cfg.topicTitle}</div>
    </div>

    <!-- AUDIO TRACKS -->
    <div id="audio-tracks">
      <audio id="bgm" class="clip" src="assets/audio/bgm.mp3" data-start="0" data-duration="${totalDuration}" data-track-index="10"></audio>

      <!-- Timed SFX Clips -->
      ${timedItems.map((it, i) => `
      <audio id="tier-whoosh-${i + 1}" class="clip" src="assets/audio/whoosh.mp3" data-start="${it.itemStart}" data-duration="0.8" data-track-index="${40 + i * 2}"></audio>
      <audio id="tier-slam-${i + 1}" class="clip" src="assets/audio/slam.mp3" data-start="${it.slamTime}" data-duration="1.2" data-track-index="${41 + i * 2}"></audio>
      `).join('')}

      <!-- Voiceover segments -->
      ${timedItems.map((it, i) => `
      <audio id="vo-review-${i + 1}" class="clip" src="${it.voReviewSrc}" data-start="${it.reviewStart}" data-duration="${it.reviewDur}" data-track-index="${20 + i * 2}"></audio>
      <audio id="vo-verdict-${i + 1}" class="clip" src="${it.voVerdictSrc}" data-start="${it.verdictStart}" data-duration="${it.verdictDur}" data-track-index="${21 + i * 2}"></audio>
      `).join('')}
    </div>
  </div>

  <!-- GSAP TIMELINE ENGINE -->
  <script>
    const ITEMS = ${itemsJson};
    const TOTAL_DURATION = ${totalDuration};

    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["${slug}"] = tl;

    // 1. Initial Board & Header Entrance (Scoped selectors)
    tl.fromTo('[data-composition-id="${slug}"] #tierlist-header', { y: -50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power2.out" }, 0.2);
    tl.fromTo('[data-composition-id="${slug}"] .tier-row', { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: "power2.out" }, 0.4);

    // 2. Loop Through Each Contender
    ITEMS.forEach((it, idx) => {
      // Reveal Contender on Active Stage
      tl.call(() => {
        document.getElementById("stage-eyebrow").textContent = "ỨNG VIÊN #" + it.index + " / " + ITEMS.length;
        document.getElementById("stage-name").textContent = it.name;
        document.getElementById("stage-tag").textContent = it.subtitle;
        document.getElementById("stage-rank-target").textContent = "?";
        document.getElementById("stage-showcase-img").src = "assets/images/item-" + it.index + "-showcase.jpg";
        document.getElementById("stage-icon-img").src = "assets/images/item-" + it.index + "-icon.jpg";
        document.getElementById("live-subtitle").textContent = it.name + " - " + it.subtitle;
      }, null, it.itemStart);

      tl.fromTo("#contender-stage",
        { scale: 0.92, opacity: 0.3 },
        { scale: 1.0, opacity: 1, duration: 0.5, ease: "back.out(1.4)" },
        it.itemStart
      );

      // Subtitle update for Review
      tl.call(() => {
        document.getElementById("live-subtitle").textContent = it.name + ": Đang đánh giá trải nghiệm...";
      }, null, it.reviewStart);

      // Subtitle update for Verdict
      tl.call(() => {
        document.getElementById("stage-rank-target").textContent = it.tier;
        document.getElementById("live-subtitle").textContent = "XẾP VÀO BẬC " + it.tier + "!";
      }, null, it.verdictStart);

      // THE SLAM PLACEMENT ANIMATION using sub-pixel transforms (x, y)
      const targetTrayY = it.targetY;

      tl.call(() => {
        const flyEl = document.getElementById("flying-card");
        const flyImg = document.getElementById("flying-img");
        if (flyEl && flyImg) {
          flyImg.src = "assets/images/item-" + it.index + "-icon.jpg";
        }
      }, null, it.slamTime - 0.45);

      // Smooth Flight tween with GPU transforms
      tl.fromTo("#flying-card",
        { x: 100, y: 1250, scale: 1, opacity: 1 },
        { x: 245, y: targetTrayY + 11, scale: 0.814, opacity: 1, duration: 0.45, ease: "power3.inOut" },
        it.slamTime - 0.45
      );

      // Impact: Hide flying proxy and reveal placed item in tray
      tl.set("#flying-card", { opacity: 0 }, it.slamTime);

      tl.call(() => {
        const placedEl = document.getElementById("placed-" + it.id);
        if (placedEl) {
          placedEl.style.opacity = "1";
          placedEl.style.transform = "scale(1)";
        }
      }, null, it.slamTime);

      // Board screen shake on impact
      tl.fromTo("#tier-board",
        { y: -8 },
        { y: 0, duration: 0.3, ease: "elastic.out(1.8, 0.3)" },
        it.slamTime
      );

      // Glow effect on target tier row
      tl.fromTo("#tier-row-" + it.tier,
        { scale: 1.03, filter: "brightness(1.5)" },
        { scale: 1.0, filter: "brightness(1)", duration: 0.4, ease: "power2.out" },
        it.slamTime
      );
    });

    // 3. Outro Final Board Overview
    const outroStart = TOTAL_DURATION - 2.5;
    tl.call(() => {
      document.getElementById("live-subtitle").textContent = "BẢNG XẾP HẠNG HOÀN TẤT!";
    }, null, outroStart);

    tl.to("#contender-stage", { opacity: 0.2, scale: 0.95, duration: 0.6 }, outroStart);
    tl.to("#tier-board", { scale: 1.04, duration: 1.2, ease: "power1.inOut" }, outroStart);
  </script>
</body>
</html>`;
}


// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const promptArg = argv.find(a => !a.startsWith("--"));
  const langArg = (argv.find(a => a.startsWith("--lang=")) || "").replace("--lang=", "") || "vi";
  const renderArg = argv.includes("--render");

  console.log(`[TierList CLI] Creating Tier List video for prompt: "${promptArg || 'preset'}", lang: ${langArg}, render: ${renderArg}...`);
  createTierListVideo({
    prompt: promptArg,
    lang: langArg,
    render: renderArg,
  }).catch(err => {
    console.error("Failed to create Tier List video:", err);
    process.exit(1);
  });
}
