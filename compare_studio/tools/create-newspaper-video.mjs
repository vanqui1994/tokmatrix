#!/usr/bin/env node
// Automated generator for Style 2: Retro Newspaper & Dossier Investigation videos (60-75s).
// Inspired by historical journalism, corporate crime exposés, and documentary archives.
// Generates HyperFrames compositions with vintage sepia newsprint, high-contrast B&W archival imagery,
// rubber stamps slamming down, and synchronized forensic narration.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateNewspaperTopic, slugify } from "./generate-newspaper-topic.mjs";
import { ensureAntigravityImages } from "./antigravity-images.mjs";
import { NEWSPAPER_LANG_META, CURATED_NEWSPAPER_TOPICS, NEWSPAPER_ASSETS_SVG } from "./newspaper-configs.mjs";
import { downloadImage } from "./find-image.mjs";
import { detectSfxCues, computeDuckedBgmSegments, generateCinemaAudioHtml, copyCinemaSfxFiles } from "./auto-sfx.mjs";
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
 * Creates a complete Retro Newspaper & Dossier Investigation video project.
 */
export async function createNewspaperVideo(opts = {}) {
  const log = opts.log ?? console.log;

  let cfg = opts.spec?.newspaperConfig || opts.spec || opts.newspaperConfig;
  const lang = cfg?.lang || opts.lang || "vi";
  const meta = NEWSPAPER_LANG_META[lang] || NEWSPAPER_LANG_META.vi;

  if (!cfg) {
    if (opts.prompt || opts.query) {
      log(`[1/6] AI Generating Newspaper topic for "${opts.prompt || opts.query}"...`);
      cfg = await generateNewspaperTopic({ prompt: opts.prompt || opts.query, lang, voice: opts.voice });
    } else {
      log(`[1/6] Using curated preset for lang "${lang}"...`);
      cfg = CURATED_NEWSPAPER_TOPICS[`newspaper-sample-enron-${lang}`] || CURATED_NEWSPAPER_TOPICS["newspaper-sample-enron-vi"];
    }
  }

  const voice = opts.voice || cfg.voice || meta.defaultVoice;
  const rawSlug = opts.slug || cfg.slug || `newspaper-${slugify(cfg.topicTitle)}-${lang}`;
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
  log("[2/6] Setting up dark cinematic suspense BGM & stamp sound effects...");
  const bgmSrc = path.join(REPO_ROOT, "tools", "template-newspaper", "assets", "audio", "bgm.mp3");
  const bgmDest = path.join(dir, "assets", "audio", "bgm.mp3");
  if (fs.existsSync(bgmSrc)) {
    fs.copyFileSync(bgmSrc, bgmDest);
  } else {
    fs.copyFileSync(path.join(REPO_ROOT, "shared", "audio", "bgm", "anxiety.mp3"), bgmDest);
  }

  const stampSrc = path.join(REPO_ROOT, "shared", "audio", "sfx", "pop.mp3");
  if (fs.existsSync(stampSrc)) {
    fs.copyFileSync(stampSrc, path.join(dir, "assets", "audio", "stamp.mp3"));
  }

  // 2. Synthesize TTS voiceover lines with Edge TTS
  log(`[3/6] Synthesizing voiceover lines with Edge TTS (${voice})...`);
  const acts = cfg.acts || [];
  const voDir = path.join(dir, "assets", "vo");
  const timedActs = [];
  let currentTime = 0.5;

  for (let i = 0; i < acts.length; i++) {
    const act = acts[i];
    const voFile = path.join(voDir, `act-${i + 1}.mp3`);
    const lineText = act.line;

    log(`  [TTS] Act ${i + 1}: "${lineText.slice(0, 45)}..."`);
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
    currentTime = Math.round((start + roundedDur + 0.5) * 100) / 100;

    timedActs.push({
      ...act,
      index: i + 1,
      start,
      duration: roundedDur,
      voSrc: `assets/vo/act-${i + 1}.mp3`,
      imgSrc: `assets/images/act-${i + 1}.jpg`
    });
  }

  const totalDuration = Math.ceil(currentTime + 1.2);
  log(`  ✓ Timeline calculated: ${timedActs.length} acts, total duration: ${totalDuration}s`);

  // 3. Ảnh tư liệu — xin qua hàng đợi Antigravity (tools/antigravity-images.mjs), không Pollinations.
  log("[4/6] Preparing archival evidence imagery via Antigravity...");
  const imageResult = await ensureAntigravityImages({
    dir, slug, log, label: "Báo Cũ Điều Tra",
    timeoutMin: Number(opts.imageTimeoutMin || opts.spec?.imageTimeoutMin || 45),
    items: timedActs.map((act) => ({
      key: `act-${act.index}`,
      aspect: "1:1",
      dest: act.imgSrc,
      prompt: `${act.imageSearchQuery || act.evidenceLabel || act.headline}. Vintage 20th-century archival press photograph, black and white or light sepia, film grain, newspaper halftone texture, documentary realism, no text, no captions, no watermark.`,
    })),
  });

  // 4. Cinema Soundscape: Auto-SFX and Smart Ducking
  log("[5/6] Generating Retro Newspaper HTML with Cinema Soundscape...");
  const sfxCues = detectSfxCues({
    archetype: "newspaper",
    items: timedActs.map((a) => ({ start: a.start, dur: a.duration, text: a.line || "" })),
    totalDuration,
  });
  const bgmSegments = computeDuckedBgmSegments({
    totalDuration,
    voiceIntervals: timedActs.map((a) => ({ start: a.start, dur: a.duration })),
    ambientVol: 0.11,
    boostVol: 0.34,
  });
  copyCinemaSfxFiles(dir, sfxCues);
  log(`  ✓ Soundscape active: ${sfxCues.length} Auto-SFX cues, ${bgmSegments.length} Ducking segments.`);

  const html = generateNewspaperHtml({
    slug,
    cfg,
    meta,
    timedActs,
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
    category: "retro-newspaper",
    template: "newspaper",
    type: "newspaper",
    lang,
    created: new Date().toISOString(),
    totalDuration,
    // Lưu kịch bản (acts[].line) để có mô tả khi đăng và để Studio đọc lại được.
    newspaperConfig: { ...cfg, acts: timedActs },
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(metaJson, null, 2), "utf8");

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
      // ignore
    }
  }

  log(`\n🎉 Successfully created Retro Newspaper video: videos/${slug}`);
  log(`  - Preview URL: http://localhost:4321/?v=${slug}`);
  log(`  - Run check: cd videos/${slug} && npm run check`);
  log(`  - Render MP4: cd videos/${slug} && npm run render\n`);

  return { slug, dir, totalDuration, cfg };
}

/**
 * Generates the Retro Newspaper & Declassified Dossier HTML code (Cinema-Grade True Crime).
 */
export function generateNewspaperHtml({ slug, cfg, meta, timedActs, totalDuration, sfxCues = [], bgmSegments = [] }) {
  const cinemaAudioHtml = generateCinemaAudioHtml({ sfxCues, bgmSegments });
  const actsJson = JSON.stringify(timedActs.map(a => ({
    id: a.id,
    index: a.index,
    start: a.start,
    duration: a.duration,
    headline: a.headline,
    evidenceLabel: a.evidenceLabel,
    stamp: a.stamp || "CONFIRMED",
    marker: a.markerHighlight
  })));

  return `<!DOCTYPE html>
<html lang="${cfg.lang || 'vi'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${cfg.topicTitle || 'RETRO NEWSPAPER INVESTIGATION'}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800;900&family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=Special+Elite&display=swap" rel="stylesheet">
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
      background: #14110F;
      color: #1A1614;
      font-family: 'Playfair Display', Georgia, serif;
      overflow: hidden;
      position: relative;
    }

    #root {
      width: 1080px;
      height: 1920px;
      position: relative;
      overflow: hidden;
    }

    /* =========================================================================
       BACKGROUND & ATMOSPHERE: DETECTIVE DESK & 35MM FILM PROJECTOR
       ========================================================================= */
    /* Dark vintage mahogany detective desk */
    .desk-wood {
      position: absolute;
      inset: 0;
      background-color: #14110F;
      background-image: 
        radial-gradient(circle at 50% 32%, rgba(55, 42, 32, 0.95) 0%, rgba(18, 14, 12, 1) 85%),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 2px, transparent 2px, transparent 12px);
      z-index: 1;
    }

    /* Ambient spotlight on the desk */
    .desk-lamp-glow {
      position: absolute;
      top: -120px;
      left: 180px;
      width: 720px;
      height: 900px;
      background: radial-gradient(ellipse at 50% 40%, rgba(255, 235, 190, 0.12) 0%, transparent 70%);
      pointer-events: none;
      z-index: 2;
    }

    /* 35mm film projector flicker & scratches */
    .film-projector-flicker {
      position: absolute;
      inset: 0;
      opacity: 0.14;
      background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 4px);
      pointer-events: none;
      z-index: 4;
      animation: filmGateFlicker 0.18s infinite alternate ease-in-out;
    }

    @keyframes filmGateFlicker {
      0% { opacity: 0.11; transform: translateY(0); }
      50% { opacity: 0.16; transform: translateY(-0.5px); }
      100% { opacity: 0.13; transform: translateY(0.5px); }
    }

    /* Vignette edge shadows */
    .vignette-overlay {
      position: absolute;
      inset: 0;
      box-shadow: inset 0 0 220px rgba(8, 6, 5, 0.9), inset 0 0 90px rgba(8, 6, 5, 0.7);
      pointer-events: none;
      z-index: 5;
    }

    /* =========================================================================
       ZONE 1: NEWSPAPER MASTHEAD & CLASSIFIED BANNER (Top 0 - 370px)
       ========================================================================= */
    .header-zone {
      position: absolute;
      top: 20px;
      left: 50px;
      width: 980px;
      height: 350px;
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      text-align: center;
    }

    /* Top Secret Dossier Manila Tab */
    .manila-case-tab {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: #D1C2A5;
      color: #3B2E21;
      border: 2px solid #9E8C70;
      border-bottom: none;
      border-radius: 8px 8px 0 0;
      padding: 6px 28px;
      font-family: 'Courier Prime', monospace;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.35);
    }

    .manila-case-tab .dot-live {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #DC2626;
      box-shadow: 0 0 8px #DC2626;
    }

    /* Authentic Vintage Newspaper Masthead Frame */
    .masthead-paper-container {
      width: 100%;
      background: #F4EFE6;
      border: 3px solid #1A1614;
      border-radius: 4px;
      padding: 16px 28px 20px 28px;
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.45);
      position: relative;
    }

    .masthead-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #1A1614;
      padding-bottom: 6px;
      margin-bottom: 10px;
      font-family: 'Courier Prime', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #3A322C;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    .masthead-title-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      border-bottom: 3px double #1A1614;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }

    .masthead-star {
      font-size: 18px;
      color: #8B1D1D;
    }

    .masthead-main-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 34px;
      font-weight: 900;
      letter-spacing: 5px;
      color: #1A1614;
      text-transform: uppercase;
    }

    .topic-headline-banner {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 36px;
      font-weight: 900;
      line-height: 1.2;
      color: #8B1D1D;
      text-transform: uppercase;
      letter-spacing: -0.5px;
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.15);
    }

    /* =========================================================================
       ZONE 2: CRIME BOARD EVIDENCE STAGE & DOSSIER (380px - 1170px)
       ========================================================================= */
    .evidence-zone {
      position: absolute;
      top: 380px;
      left: 50px;
      width: 980px;
      height: 780px;
      z-index: 10;
    }

    /* Heavy Manila Dossier Folder Base */
    .dossier-folder {
      position: relative;
      width: 100%;
      height: 100%;
      background: #D9CEBF;
      border: 2px solid #A89B86;
      border-radius: 8px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6), inset 0 0 50px rgba(120, 100, 75, 0.25);
      overflow: hidden;
    }

    /* Yellow Police / Caution Tape across corner */
    .caution-tape-strip {
      position: absolute;
      top: 28px;
      right: -60px;
      width: 320px;
      height: 32px;
      background: #FACC15;
      color: #000;
      font-family: 'Courier Prime', monospace;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(24deg);
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
      z-index: 35;
      border-top: 2px dashed #000;
      border-bottom: 2px dashed #000;
    }

    /* Metallic Binder Clip on Top-Left */
    .folder-binder-clip {
      position: absolute;
      top: 10px;
      left: 36px;
      z-index: 35;
    }

    /* Polaroid Photo Frame Stage */
    .polaroid-frame {
      position: absolute;
      top: 45px;
      left: 70px;
      width: 840px;
      height: 680px;
      background: #F8F6F0;
      border-radius: 4px;
      padding: 18px 18px 75px 18px;
      box-shadow: 
        0 20px 50px rgba(15, 12, 10, 0.55),
        0 4px 15px rgba(15, 12, 10, 0.35);
      transform: rotate(-1.5deg);
      transition: transform 0.5s ease;
      z-index: 12;
    }

    /* Push pin on polaroid */
    .polaroid-push-pin {
      position: absolute;
      top: -16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 40;
    }

    /* Masking tape on polaroid corner */
    .corner-tape {
      position: absolute;
      top: -12px;
      right: 25px;
      width: 110px;
      height: 30px;
      background: rgba(254, 243, 199, 0.65);
      border: 1px dashed rgba(180, 150, 100, 0.4);
      transform: rotate(18deg);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      z-index: 35;
      backdrop-filter: blur(1px);
    }

    /* Inner Photo Window with Ken Burns Zoom */
    .photo-viewport {
      width: 100%;
      height: 100%;
      background: #110E0C;
      border: 2px solid #28221D;
      border-radius: 2px;
      overflow: hidden;
      position: relative;
    }

    .evidence-photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: grayscale(75%) contrast(125%) sepia(20%);
      opacity: 0;
      transform: scale(1.0);
      transform-origin: center center;
    }

    .evidence-photo.active {
      opacity: 1;
    }

    /* Polaroid Bottom Chin Label */
    .polaroid-chin {
      position: absolute;
      bottom: 0;
      left: 18px;
      right: 18px;
      height: 75px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
      padding: 0 10px;
    }

    .chin-case-id {
      font-family: 'Courier Prime', monospace;
      font-size: 18px;
      font-weight: 700;
      color: #8B1D1D;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .chin-label {
      font-family: 'Special Elite', 'Courier Prime', monospace;
      font-size: 20px;
      color: #26211C;
      letter-spacing: 0.5px;
    }

    /* Rubber Stamp Overlay (Heavy slam down) */
    .stamp-container {
      position: absolute;
      top: 70px;
      right: 100px;
      z-index: 30;
      transform-origin: center center;
      transform: scale(1.6) rotate(-12deg);
      opacity: 0;
      pointer-events: none;
      filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5));
    }

    /* Hand-drawn Red Marker Markup Overlay */
    .marker-overlay {
      position: absolute;
      top: 25%;
      left: 25%;
      width: 300px;
      height: 220px;
      z-index: 25;
      opacity: 0;
      pointer-events: none;
    }

    /* Forensic Magnifying Loupe Overlay */
    .forensic-loupe {
      position: absolute;
      top: 220px;
      left: 480px;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      border: 8px solid #B45309;
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), inset 0 0 25px rgba(255, 255, 255, 0.35);
      background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.3) 0%, transparent 60%);
      z-index: 28;
      opacity: 0;
      pointer-events: none;
      backdrop-filter: contrast(140%) brightness(110%);
    }

    .forensic-loupe::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 28px;
      height: 28px;
      transform: translate(-50%, -50%);
      border: 2px dashed rgba(220, 38, 38, 0.8);
      border-radius: 50%;
    }

    /* Red Detective String SVG Layer */
    .string-overlay {
      position: absolute;
      inset: 0;
      z-index: 22;
      pointer-events: none;
    }

    /* =========================================================================
       ZONE 3: TYPEWRITER MEMO & FORENSIC HIGHLIGHTS (1180px - 1880px)
       ========================================================================= */
    .script-zone {
      position: absolute;
      top: 1180px;
      left: 50px;
      width: 980px;
      height: 680px;
      z-index: 20;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #FDFBF7;
      border: 3px solid #1E1A17;
      border-radius: 4px;
      padding: 30px 45px 25px 45px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
      position: relative;
    }

    /* Red Typewriter Margin Line */
    .script-zone::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 36px;
      width: 2px;
      background: rgba(220, 38, 38, 0.35);
    }

    /* Binder punch holes */
    .punch-hole {
      position: absolute;
      left: 14px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #14110F;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.8);
    }
    .punch-hole-1 { top: 60px; }
    .punch-hole-2 { top: 340px; }
    .punch-hole-3 { bottom: 60px; }

    /* Typewriter Memo Header */
    .memo-header {
      border-bottom: 2px solid #1E1A17;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .memo-to-from {
      font-family: 'Courier Prime', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #4A3E34;
      line-height: 1.5;
      letter-spacing: 1px;
    }

    .memo-status-badge {
      background: #8B1D1D;
      color: #FDFBF7;
      font-family: 'Cinzel', serif;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 2px;
      padding: 4px 12px;
      border-radius: 2px;
    }

    /* Typewriter Running Transcript Paragraph */
    .story-paragraph {
      font-family: 'Courier Prime', monospace;
      font-size: 24px;
      line-height: 1.65;
      font-weight: 700;
      color: #1A1614;
      text-align: justify;
      letter-spacing: -0.2px;
      position: relative;
      z-index: 5;
    }

    /* Dynamic Forensic Highlighters */
    mark.news-hl {
      color: inherit;
      padding: 3px 8px;
      border-radius: 2px;
      background-repeat: no-repeat;
      background-size: 0% 100%;
      transition: background-size 0.55s cubic-bezier(0.16, 1, 0.3, 1);
    }

    mark.news-hl.active {
      background-size: 100% 100%;
    }

    mark.news-hl-red {
      background-image: linear-gradient(to right, #FCA5A5, #EF4444);
      color: #7F1D1D;
    }

    mark.news-hl-amber {
      background-image: linear-gradient(to right, #FDE68A, #F59E0B);
      color: #78350F;
    }

    mark.news-hl-cyan {
      background-image: linear-gradient(to right, #BAE6FD, #38BDF8);
      color: #0C4A6E;
    }

    /* Forensic Fingerprint Watermark in Memo */
    .memo-fingerprint {
      position: absolute;
      bottom: 25px;
      right: 45px;
      width: 120px;
      height: 150px;
      opacity: 0.18;
      pointer-events: none;
      z-index: 1;
    }

    /* Footer Metadata Bar */
    .newspaper-footer {
      border-top: 2px solid #1A1614;
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Courier Prime', monospace;
      font-size: 14px;
      font-weight: 700;
      color: #3A322C;
      letter-spacing: 2px;
      position: relative;
      z-index: 5;
    }

    .clip {
      position: relative;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${slug}" data-start="0" data-width="1080" data-height="1920" data-duration="${totalDuration}">
    <!-- Layer 1: Detective Desk & Lighting -->
    <div class="desk-wood"></div>
    <div class="desk-lamp-glow"></div>
    <div class="film-projector-flicker"></div>
    <div class="vignette-overlay"></div>

    <!-- ZONE 1: NEWSPAPER MASTHEAD & CLASSIFIED BANNER -->
    <div id="news-header" class="header-zone clip" data-start="0" data-duration="${totalDuration}" data-track-index="1">
      <div class="manila-case-tab">
        <span class="dot-live"></span>
        <span>${cfg.breaking || meta.breaking}</span>
      </div>
      <div class="masthead-paper-container">
        <div class="masthead-meta-row">
          <span>VOL. CXXVIII NO. 42,810</span>
          <span>SPECIAL INVESTIGATION</span>
          <span>PRICE 5 CENTS</span>
        </div>
        <div class="masthead-title-row">
          <span class="masthead-star">★</span>
          <div class="masthead-main-title">${cfg.masthead || meta.masthead}</div>
          <span class="masthead-star">★</span>
        </div>
        <h1 class="topic-headline-banner">${cfg.topicTitle}</h1>
      </div>
    </div>

    <!-- ZONE 2: THE CRIME EVIDENCE BOARD & DOSSIER -->
    <div id="news-dossier" class="evidence-zone clip" data-layout-allow-overlap data-layout-allow-overflow data-layout-allow-occlusion data-start="0" data-duration="${totalDuration}" data-track-index="2">
      <!-- Manila Dossier Folder -->
      <div class="dossier-folder" data-layout-allow-overflow>
        <div class="caution-tape-strip" data-layout-allow-overflow>
          <span>⚠️ DECLASSIFIED // EVIDENCE ⚠️</span>
        </div>
        <div class="folder-binder-clip" data-layout-allow-overflow>
          ${NEWSPAPER_ASSETS_SVG.paperClip}
        </div>

        <!-- Central Polaroid Photo Frame -->
        <div class="polaroid-frame" id="polaroid-box" data-layout-allow-overlap data-layout-allow-overflow>
          <div class="polaroid-push-pin" data-layout-allow-overflow>
            ${NEWSPAPER_ASSETS_SVG.pushPin}
          </div>
          <div class="corner-tape"></div>

          <!-- Photo Viewport -->
          <div class="photo-viewport" data-layout-allow-overflow>
            ${timedActs.map((act, i) => `
            <img src="${act.imgSrc}" id="evidence-img-${i + 1}" class="evidence-photo ${i === 0 ? 'active' : ''}" alt="${act.evidenceLabel}" data-layout-allow-overflow>
            `).join('')}
          </div>

          <!-- Polaroid Bottom Chin -->
          <div class="polaroid-chin" data-layout-allow-overlap>
            <div class="chin-case-id" id="live-act-badge">EXHIBIT #E-01</div>
            <div class="chin-label" id="live-act-label">${timedActs[0]?.evidenceLabel || 'TƯ LIỆU ĐIỀU TRA'}</div>
          </div>
        </div>

        <!-- Red Marker Hand-Drawn Circle -->
        <div class="marker-overlay" id="marker-circle-wrap" data-layout-allow-overlap data-layout-allow-overflow>
          ${NEWSPAPER_ASSETS_SVG.redMarkerCircle}
        </div>

        <!-- Forensic Magnifying Loupe -->
        <div class="forensic-loupe" id="forensic-loupe" data-layout-allow-overlap data-layout-allow-overflow></div>

        <!-- Rubber Stamp Slam Overlay -->
        <div class="stamp-container" id="stamp-wrap" data-layout-allow-overlap data-layout-allow-overflow>
          ${NEWSPAPER_ASSETS_SVG.rubberStamp(timedActs[0]?.stamp || "GIẢI MẬT")}
        </div>

        <!-- Red Detective String Layer -->
        <div class="string-overlay" id="detective-string-wrap" data-layout-allow-overlap data-layout-allow-overflow>
          ${NEWSPAPER_ASSETS_SVG.detectiveString}
        </div>
      </div>
    </div>

    <!-- ZONE 3: TYPEWRITER MEMO & FORENSIC HIGHLIGHTS -->
    <div id="news-script" class="script-zone clip" data-layout-allow-overlap data-start="0" data-duration="${totalDuration}" data-track-index="3">
      <div class="punch-hole punch-hole-1"></div>
      <div class="punch-hole punch-hole-2"></div>
      <div class="punch-hole punch-hole-3"></div>

      <!-- Memo Header -->
      <div class="memo-header" data-layout-allow-overlap>
        <div class="memo-to-from">
          <div><strong>TO:</strong> FORENSIC INVESTIGATIVE UNIT</div>
          <div><strong>SUBJECT:</strong> CASE BRIEFING & AUDIT TRAIL</div>
        </div>
        <div class="memo-status-badge">CLASSIFIED FILE</div>
      </div>

      <!-- Typewriter Transcript -->
      <div class="story-paragraph" id="story-content" data-layout-allow-overlap>
        ${cfg.fullScriptHtml}
      </div>

      <!-- Fingerprint Watermark -->
      <div class="memo-fingerprint">
        ${NEWSPAPER_ASSETS_SVG.fingerprint}
      </div>

      <!-- Footer Metadata -->
      <div class="newspaper-footer">
        <span>ARCHIVE: CONFIDENTIAL</span>
        <span>EXHIBIT CASE #2001-ENR</span>
        <span>${cfg.watermark || meta.watermark}</span>
      </div>
    </div>

    <!-- AUDIO TRACKS -->
    <div id="audio-tracks">
${cinemaAudioHtml}
      
      <!-- Voiceover Acts -->
      ${timedActs.map((act, i) => `
      <audio id="vo-act-${i + 1}" class="clip" src="${act.voSrc}" data-start="${act.start}" data-duration="${act.duration}" data-track-index="${20 + (i % 4)}"></audio>
      `).join('')}
    </div>
  </div>

  <!-- GSAP TIMELINE SCRIPT -->
  <script>
    const ACTS = ${actsJson};
    const TOTAL_DURATION = ${totalDuration};

    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["${slug}"] = tl;

    // Camera and Clue Movements per Act
    ACTS.forEach((act, idx) => {
      const imgId = "#evidence-img-" + (idx + 1);
      const prevImgId = idx > 0 ? "#evidence-img-" + idx : null;

      // 1. Photographic Crossfade & Ken Burns Slow Drift
      if (prevImgId) {
        tl.to(prevImgId, { opacity: 0, duration: 0.4 }, act.start);
      }
      tl.to(imgId, { opacity: 1, duration: 0.4 }, act.start);

      // Ken Burns motion: Slow dramatic push-in on evidence photo
      const zoomX = (idx % 2 === 0 ? 8 : -8);
      const zoomY = (idx % 3 === 0 ? -10 : 8);
      tl.fromTo(imgId, 
        { scale: 1.0, x: 0, y: 0 },
        { scale: 1.10, x: zoomX, y: zoomY, duration: act.duration, ease: "none" },
        act.start
      );

      // Subtle Polaroid paper organic tilt shift per act
      const angles = [-1.8, 1.4, -2.2, 1.8, -1.2, 2.0];
      const targetAngle = angles[idx % angles.length];
      tl.to("#polaroid-box", { rotation: targetAngle, duration: 0.6, ease: "power2.out" }, act.start);

      // 2. Update Polaroid Chin Labels
      tl.call(() => {
        const bEl = document.getElementById("live-act-badge");
        const lEl = document.getElementById("live-act-label");
        if (bEl) bEl.textContent = "EXHIBIT #E-0" + (idx + 1);
        if (lEl) lEl.textContent = act.evidenceLabel || act.headline;
      }, null, act.start);

      // 3. Rubber Stamp Slam Down with Screen Shake at Act 1, 3, 5
      if (idx === 0 || idx === 2 || idx === 4) {
        tl.fromTo("#stamp-wrap", 
          { opacity: 0, scale: 1.8, rotation: -18 },
          { opacity: 0.95, scale: 1.0, rotation: -9, duration: 0.35, ease: "back.out(2)" },
          act.start + 0.3
        );
        // Micro screen shake on stamp impact
        tl.to("#root", { x: 4, y: -3, duration: 0.04, yoyo: true, repeat: 3 }, act.start + 0.42);

        tl.to("#stamp-wrap", { opacity: 0, duration: 0.35 }, act.start + 3.4);
      }

      // 4. Red Pen Circle Animation at Act 2 & 4
      if (idx === 1 || idx === 3) {
        tl.fromTo("#marker-circle-wrap",
          { opacity: 0, scale: 0.8 },
          { opacity: 1, scale: 1.0, duration: 0.25, ease: "power2.out" },
          act.start + 0.45
        );
        tl.to("#marker-circle-wrap .circle-stroke",
          { strokeDashoffset: 0, duration: 0.8, ease: "power2.out" },
          act.start + 0.45
        );
        tl.to("#marker-circle-wrap", { opacity: 0, duration: 0.3 }, act.start + 3.2);
      }

      // 5. Forensic Magnifying Loupe Glides In at Act 3
      if (idx === 2) {
        tl.fromTo("#forensic-loupe",
          { opacity: 0, scale: 1.4, x: 80 },
          { opacity: 1, scale: 1.0, x: 0, duration: 0.6, ease: "power2.out" },
          act.start + 0.8
        );
        tl.to("#forensic-loupe",
          { x: -50, y: 30, duration: 2.5, ease: "sine.inOut" },
          act.start + 1.4
        );
        tl.to("#forensic-loupe", { opacity: 0, duration: 0.4 }, act.start + 4.2);
      }

      // 6. Detective Red String Web Reveals across acts
      if (idx === 1) {
        tl.fromTo("#detective-string-wrap",
          { opacity: 0 },
          { opacity: 0.85, duration: 0.3 },
          act.start + 0.2
        );
        tl.to("#detective-string-wrap .string-line",
          { strokeDashoffset: 0, duration: 0.9, ease: "power2.out" },
          act.start + 0.2
        );
      }

      // 7. Dynamic Forensic Highlighter Sweep on Script
      tl.call(() => {
        const marks = document.querySelectorAll("mark.news-hl");
        if (marks && marks[idx]) {
          marks[idx].classList.add("active");
        }
      }, null, act.start + 0.2);
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
  
  console.log(`[Newspaper CLI] Creating Newspaper video for prompt: "${promptArg || 'preset'}", lang: ${langArg}...`);
  createNewspaperVideo({
    prompt: promptArg,
    lang: langArg
  }).catch(err => {
    console.error("Failed to create Newspaper video:", err);
    process.exit(1);
  });
}
