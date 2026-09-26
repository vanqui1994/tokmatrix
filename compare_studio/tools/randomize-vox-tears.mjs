#!/usr/bin/env node
// Randomizes the torn-paper shapes, angles, and assembly animations for any Vox video.
// Usage: node tools/randomize-vox-tears.mjs <video-slug> [--render]
// Example: node tools/randomize-vox-tears.mjs vox-coffee-no-energy-vn-vi --render

import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateVoxHtml } from "./create-vox-video.mjs";
import { VOX_LANG_META } from "./vox-configs.mjs";
import { detectSfxCues, computeDuckedBgmSegments } from "./auto-sfx.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

export async function randomizeVideoTears(videoSlug, opts = {}) {
  const log = opts.log || console.log;
  const videoDir = path.join(REPO_ROOT, "videos", videoSlug);

  if (!fs.existsSync(videoDir)) {
    throw new Error(`Video directory not found: ${videoDir}`);
  }

  const metaPath = path.join(videoDir, "meta.json");
  const indexPath = path.join(videoDir, "index.html");

  if (!fs.existsSync(metaPath)) {
    throw new Error(`meta.json not found: ${metaPath}`);
  }

  const metaData = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const cfg = metaData.voxConfig || metaData;
  const lang = metaData.lang || cfg.lang || "vi";
  const meta = VOX_LANG_META[lang] || VOX_LANG_META.vi;
  const timedBeats = cfg.beats || [];
  const totalDuration = metaData.totalDuration || cfg.totalDuration || 52;

  log(`🎲 Randomizing torn paper patterns for ${videoSlug} (${timedBeats.length} beats)...`);

  // Ensure each beat uses beat_X.jpg if present in assets/images/
  for (let i = 0; i < timedBeats.length; i++) {
    const bIndex = i + 1;
    const beatImgPath = `assets/images/beat_${bIndex}.jpg`;
    if (fs.existsSync(path.join(videoDir, beatImgPath))) {
      timedBeats[i].imgSrc = beatImgPath;
    }
  }

  // Audio cues
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

  // Generate completely new random torn-from-image composition
  const newHtml = generateVoxHtml({
    slug: videoSlug,
    cfg,
    meta,
    timedBeats,
    totalDuration,
    sfxCues,
    bgmSegments,
  });

  fs.writeFileSync(indexPath, newHtml, "utf8");
  log(`✓ Saved new randomized torn paper composition to index.html`);

  // Run hyperframes check
  log(`\n🔍 Running hyperframes check...`);
  const checkRes = await execFileAsync("npm", ["run", "check"], { cwd: videoDir });
  log(checkRes.stdout.trim());
  log(`✓ HyperFrames check passed with 0 errors!`);

  // Render MP4 if requested
  if (opts.render) {
    log(`\n🎬 Rendering new MP4 with random tears...`);
    await new Promise((resolve, reject) => {
      const child = spawn("npm", ["run", "render"], {
        cwd: videoDir,
        env: { ...process.env, FORCE_COLOR: "1" },
      });
      child.stdout.on("data", (d) => process.stdout.write(d));
      child.stderr.on("data", (d) => process.stderr.write(d));
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`Render failed with code ${code}`))
      );
    });
    log(`\n🎉 MP4 Render complete!`);
  }

  return { success: true };
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--")) || "vox-coffee-no-energy-vn-vi";
  const shouldRender = args.includes("--render");

  randomizeVideoTears(slug, { render: shouldRender }).catch((err) => {
    console.error("Error randomizing tears:", err);
    process.exit(1);
  });
}
