#!/usr/bin/env node
// Automated generator for Style 3: Dark Cyber Minimalist & Kinetic Typography videos (60-75s).
// Inspired by Kurzgesagt Dark Mode, James Jani, and high-end tech philosophy channels.
// Generates HyperFrames compositions with deep OLED black canvas, neon HUD wireframes,
// giant kinetic punchlines popping on beat, and synchronized Voiceover narration.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateKineticTopic, slugify } from "./generate-kinetic-topic.mjs";
import { KINETIC_LANG_META, CURATED_KINETIC_TOPICS } from "./kinetic-configs.mjs";
import { detectSfxCues, computeDuckedBgmSegments, copyCinemaSfxFiles } from "./auto-sfx.mjs";
import { synthesizeAudio } from "./voices.mjs";

import { generateKineticHtml } from "./kinetic-editorial.mjs";
export { generateKineticHtml } from "./kinetic-editorial.mjs";

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
 * Creates a complete Dark Cyber Minimalist & Kinetic Typography video project.
 */
export async function createKineticVideo(opts = {}) {
  const log = opts.log ?? console.log;

  let cfg = opts.spec?.kineticConfig || opts.spec || opts.kineticConfig;
  const lang = cfg?.lang || opts.lang || "vi";
  const meta = KINETIC_LANG_META[lang] || KINETIC_LANG_META.vi;

  if (!cfg) {
    if (opts.prompt || opts.query) {
      log(`[1/6] AI Generating Kinetic topic for "${opts.prompt || opts.query}"...`);
      cfg = await generateKineticTopic({ prompt: opts.prompt || opts.query, lang, voice: opts.voice });
    } else {
      log(`[1/6] Using curated preset for lang "${lang}"...`);
      cfg = CURATED_KINETIC_TOPICS[`kinetic-sample-dopamine-${lang}`] || CURATED_KINETIC_TOPICS["kinetic-sample-dopamine-vi"];
    }
  }

  const voice = opts.voice || cfg.voice || meta.defaultVoice;
  const rawSlug = opts.slug || cfg.slug || `kinetic-${slugify(cfg.topicTitle)}-${lang}`;
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
  log("[2/6] Setting up dark synthwave BGM & laser whoosh SFX...");
  const bgmSrc = path.join(REPO_ROOT, "tools", "template-kinetic", "assets", "audio", "bgm.mp3");
  const bgmDest = path.join(dir, "assets", "audio", "bgm.mp3");
  if (fs.existsSync(bgmSrc)) {
    fs.copyFileSync(bgmSrc, bgmDest);
  } else {
    fs.copyFileSync(path.join(REPO_ROOT, "shared", "audio", "bgm", "volatile-reaction.mp3"), bgmDest);
  }

  const whooshSrc = path.join(REPO_ROOT, "shared", "audio", "sfx", "whoosh.mp3");
  if (fs.existsSync(whooshSrc)) {
    fs.copyFileSync(whooshSrc, path.join(dir, "assets", "audio", "whoosh.mp3"));
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
    currentTime = Math.round((start + roundedDur + 0.5) * 100) / 100;

    timedBeats.push({
      ...bt,
      index: i + 1,
      start,
      duration: roundedDur,
      voSrc: `assets/vo/beat-${i + 1}.mp3`
    });
  }

  const totalDuration = Math.ceil(currentTime + 1.2);
  log(`  ✓ Timeline calculated: ${timedBeats.length} beats, total duration: ${totalDuration}s`);

  // 3. Cinema Soundscape: Auto-SFX and Smart Ducking
  log("[4/6] Generating Kinetic Editorial HTML with Cinema Soundscape...");
  const sfxCues = detectSfxCues({
    archetype: "kinetic",
    items: timedBeats.map((b) => ({ start: b.start, dur: b.duration, text: b.words?.join(" ") || b.punchline || "" })),
    totalDuration,
  });
  const bgmSegments = computeDuckedBgmSegments({
    totalDuration,
    voiceIntervals: timedBeats.map((b) => ({ start: b.start, dur: b.duration })),
    ambientVol: 0.12,
    boostVol: 0.32,
  });
  copyCinemaSfxFiles(dir, sfxCues);
  log(`  ✓ Soundscape active: ${sfxCues.length} Auto-SFX cues, ${bgmSegments.length} Ducking segments.`);

  const html = generateKineticHtml({
    slug,
    cfg,
    meta,
    timedBeats,
    totalDuration,
    sfxCues,
    bgmSegments,
  });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

  // 4. Generate package.json & meta.json
  log("[5/6] Generating package.json, meta.json and project files...");
  const metaJson = {
    id: slug,
    name: cfg.topicTitle,
    category: "dark-cyber-kinetic",
    template: "kinetic",
    type: "kinetic",
    lang,
    created: new Date().toISOString(),
    totalDuration,
    // Lưu kịch bản (beats) để có mô tả khi đăng và để Studio đọc lại được.
    kineticConfig: { ...cfg, beats: timedBeats },
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

  log(`\n🎉 Successfully created Kinetic Typography video: videos/${slug}`);
  log(`  - Preview URL: http://localhost:8080/?v=${slug}`);
  log(`  - Run check: cd videos/${slug} && npm run check`);
  log(`  - Render MP4: cd videos/${slug} && npm run render\n`);

  return { slug, dir, totalDuration, cfg };
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const promptArg = argv.find(a => !a.startsWith("--"));
  const langArg = (argv.find(a => a.startsWith("--lang=")) || "").replace("--lang=", "") || "vi";
  
  console.log(`[Kinetic CLI] Creating Kinetic video for prompt: "${promptArg || 'preset'}", lang: ${langArg}...`);
  createKineticVideo({
    prompt: promptArg,
    lang: langArg
  }).catch(err => {
    console.error("Failed to create Kinetic video:", err);
    process.exit(1);
  });
}
