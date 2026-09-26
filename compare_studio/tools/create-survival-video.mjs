#!/usr/bin/env node
// Generator for Survival / Progressive Escalation Tier List videos (Mr. Incredible Uncanny format).
// Supports 6 languages: vi, en, de, fr, ja, ko.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSurvivalConfig } from "./survival-languages.mjs";
import { COUNTRIES } from "./voices.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_VIDEO = path.join(REPO_ROOT, "videos", "survival-without-organs");

function run(cmd, args, cwd, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: "0" } });
    child.stdout.on("data", (c) => log(String(c).trimEnd()));
    child.stderr.on("data", (c) => log(String(c).trimEnd()));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → mã lỗi ${code}`))
    );
  });
}

export async function createSurvivalVideo(opts) {
  const log = opts.log ?? console.log;

  let cfg = null;
  if (opts.spec?.survivalConfig) {
    cfg = opts.spec.survivalConfig;
  } else if (opts.spec?.tiers) {
    cfg = opts.spec;
  } else if (opts.survivalConfig) {
    cfg = opts.survivalConfig;
  } else if (opts.specPath && fs.existsSync(opts.specPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(opts.specPath, "utf8"));
      cfg = raw.survivalConfig || (raw.tiers ? raw : null);
    } catch {}
  }

  const lang = cfg?.lang || opts.lang || "vi";
  if (!cfg) {
    cfg = getSurvivalConfig(lang);
  }

  const countryInfo = COUNTRIES.find((c) => c.code === lang) || COUNTRIES[0];
  const voice = opts.voice || opts.spec?.voice || countryInfo.defaultVoice || "vi-VN-NamMinhNeural";
  const slug = opts.slug || opts.spec?.slug || `survival-${lang}-${Date.now().toString().slice(-4)}`;
  const dir = path.join(REPO_ROOT, "videos", slug);

  if (fs.existsSync(dir)) {
    throw new Error(`videos/${slug} đã tồn tại — hãy chọn slug khác`);
  }

  log(`[1/6] Khởi tạo cấu trúc thư mục videos/${slug}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "mrincredible"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "organs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "audio", "sfx"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "vo"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
  fs.mkdirSync(path.join(dir, "snapshots"), { recursive: true });

  // package.json
  const pkg = {
    name: slug,
    private: true,
    type: "module",
    scripts: {
      dev: "npx --yes hyperframes@0.7.58 preview",
      check: "npx --yes hyperframes@0.7.58 check",
      render: "npx --yes hyperframes@0.7.58 render --workers 4 --no-low-memory-mode",
      publish: "npx --yes hyperframes@0.7.58 publish"
    },
    dependencies: {
      "edge-tts-universal": "^1.4.0"
    }
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));

  // hyperframes.json
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

  // meta.json
  const meta = {
    id: slug,
    name: cfg.title,
    type: "survival",
    lang,
    createdAt: new Date().toISOString(),
    duration: 65
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  // BRIEF.md
  const brief = `---
workflow: escalation-tier
flow: uncanny-meme
storyboard: no
message: "${cfg.title} — ${cfg.prologueSpoken}"
destination: reels
aspect: 1080x1920
language: ${lang}
length: 65s
---

## Intent

${cfg.title} (${countryInfo.country}).
Survival limits with escalating Mr. Incredible Becoming Uncanny meme faces and cyber-medical HUD visuals.
`;
  fs.writeFileSync(path.join(dir, "BRIEF.md"), brief);

  // Symlink node_modules
  const nmSrc = path.join(TEMPLATE_VIDEO, "node_modules");
  const nmDest = path.join(dir, "node_modules");
  if (fs.existsSync(nmSrc) && !fs.existsSync(nmDest)) {
    try {
      fs.symlinkSync(nmSrc, nmDest, "junction");
    } catch {}
  }

  log("[2/6] Sao chép tài nguyên đồ họa (Mr. Incredible Uncanny & Cyber Organs)");
  // Copy Mr Incredible faces
  const facesDir = path.join(TEMPLATE_VIDEO, "assets", "mrincredible");
  if (fs.existsSync(facesDir)) {
    for (const f of fs.readdirSync(facesDir)) {
      if (f.endsWith(".png")) {
        fs.copyFileSync(path.join(facesDir, f), path.join(dir, "assets", "mrincredible", f));
      }
    }
  }

  // Copy Organs SVGs
  const organsDir = path.join(TEMPLATE_VIDEO, "assets", "organs");
  if (fs.existsSync(organsDir)) {
    for (const f of fs.readdirSync(organsDir)) {
      if (f.endsWith(".svg")) {
        fs.copyFileSync(path.join(organsDir, f), path.join(dir, "assets", "organs", f));
      }
    }
  }

  // Copy Audio SFX
  const sfxDir = path.join(TEMPLATE_VIDEO, "assets", "audio", "sfx");
  if (fs.existsSync(sfxDir)) {
    for (const f of fs.readdirSync(sfxDir)) {
      fs.copyFileSync(path.join(sfxDir, f), path.join(dir, "assets", "audio", "sfx", f));
    }
  }

  // Setup 2D/3D Graphic Illustrations directory
  const imagesDir = path.join(dir, "assets", "images");
  fs.mkdirSync(imagesDir, { recursive: true });

  // Copy or download tier illustrations if provided
  for (let idx = 0; idx < (cfg.tiers || []).length; idx++) {
    const t = cfg.tiers[idx];
    const targetImg = path.join(imagesDir, `tier-${idx + 1}.jpg`);
    if (t.image && fs.existsSync(t.image)) {
      fs.copyFileSync(t.image, targetImg);
    } else if (t.imageUrl && !fs.existsSync(targetImg)) {
      try {
        const { downloadImage } = await import("./find-image.mjs");
        await downloadImage(t.imageUrl, targetImg);
      } catch (err) {
        log(`  [Cảnh báo] Không thể tải ảnh tier-${idx + 1}: ${err.message}`);
      }
    }
  }

  // Copy BGM (Default for survival: intense suspense "volatile-reaction")
  const bgmChoice = opts.spec?.bgmTrack || opts.bgm || "volatile-reaction";
  const customBgm = path.join(REPO_ROOT, "shared", "audio", "bgm", `${bgmChoice}.mp3`);
  const defaultBgm = path.join(REPO_ROOT, "shared", "audio", "bgm", "volatile-reaction.mp3");
  if (bgmChoice !== "none" && fs.existsSync(customBgm)) {
    fs.copyFileSync(customBgm, path.join(dir, "assets", "audio", "bgm.mp3"));
  } else if (fs.existsSync(defaultBgm)) {
    fs.copyFileSync(defaultBgm, path.join(dir, "assets", "audio", "bgm.mp3"));
  }

  log(`[3/6] Tạo kịch bản Voiceover cho ngôn ngữ "${lang}" (Giọng: ${voice})`);
  const linesData = [
    { id: "line-1", text: cfg.prologueSpoken },
    ...cfg.tiers.map((t, idx) => ({ id: `line-${idx + 2}`, text: t.caption })),
    { id: "line-12", text: cfg.ctaSpoken }
  ];

  const voScript = `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..", "..");

const VIDEO_LANG = "${lang}";
const EDGE_VOICE = "${voice}";
const TTS_SPEED = Number(process.env.TTS_SPEED || "1.15");

const LINES = ${JSON.stringify(linesData, null, 2)};

const OUT_DIR = path.join(ROOT, "assets", "vo");
fs.mkdirSync(OUT_DIR, { recursive: true });

function formatRate(speed) {
  const pct = Math.round((speed - 1.0) * 100);
  return pct >= 0 ? \`+\${pct}%\` : \`\${pct}%\`;
}

async function probeDuration(mp3Path) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    mp3Path,
  ]);
  const dur = Number.parseFloat(stdout.trim());
  if (Number.isNaN(dur)) throw new Error(\`ffprobe error: \${stdout}\`);
  return dur;
}

const TTS_MAX_ATTEMPTS = 5;

function cleanForTts(text) {
  return String(text || "")
    .replace(/CẤP ĐỘ/g, "Cấp độ")
    .replace(/LEVEL/g, "Level")
    .replace(/STUFE/g, "Stufe")
    .replace(/NIVEAU/g, "Niveau");
}

async function generateSpeech(text, outPath) {
  const { synthesizeAudio } = await import("../../tools/voices.mjs");
  const rate = formatRate(TTS_SPEED);
  const clean = cleanForTts(text);
  return synthesizeAudio({
    text: clean,
    voice: EDGE_VOICE,
    outPath,
    rate,
    lang: VIDEO_LANG,
  });
}

const MAX_BUDGETS = {
  "line-1": 3.6, // intro: 0.2s -> 4.2s (chừa 0.4s trước Cấp 1)
  "line-2": 4.8, // tier 1: 4.2s -> 9.7s (chừa 0.7s trước Cấp 2)
  "line-3": 4.8, // tier 2: 9.7s -> 15.2s
  "line-4": 4.8, // tier 3: 15.2s -> 20.7s
  "line-5": 4.8, // tier 4: 20.7s -> 26.2s
  "line-6": 4.8, // tier 5: 26.2s -> 31.7s
  "line-7": 4.8, // tier 6: 31.7s -> 37.2s
  "line-8": 4.8, // tier 7: 37.2s -> 42.7s
  "line-9": 4.8, // tier 8: 42.7s -> 48.2s
  "line-10": 4.8, // tier 9: 48.2s -> 53.7s
  "line-11": 4.8, // tier 10: 53.7s -> 59.2s
  "line-12": 5.0, // outro: 59.2s -> 65.0s (chừa 0.8s hold cuối)
};

async function main() {
  console.log(\`[TTS] Sinh giọng đọc \${EDGE_VOICE} (tốc độ: \${formatRate(TTS_SPEED)})...\`);
  const durations = {};

  for (let i = 0; i < LINES.length; i++) {
    const line = LINES[i];
    process.stdout.write(\`[\${i + 1}/\${LINES.length}] \${line.id}... \`);
    const outPath = path.join(OUT_DIR, \`\${line.id}.mp3\`);
    await generateSpeech(line.text, outPath);
    let dur = await probeDuration(outPath);
    const maxBudget = MAX_BUDGETS[line.id] || 4.8;
    if (dur > maxBudget) {
      // Tự động điều chỉnh tốc độ bằng ffmpeg atempo để lời thoại không đè sang scene kế
      const speedRatio = Math.min(2.0, dur / (maxBudget - 0.1));
      const tmpFitted = path.join(OUT_DIR, \`\${line.id}_fitted.mp3\`);
      await execFileAsync("ffmpeg", [
        "-y", "-i", outPath,
        "-filter:a", \`atempo=\${speedRatio.toFixed(3)}\`,
        tmpFitted
      ]);
      fs.renameSync(tmpFitted, outPath);
      dur = await probeDuration(outPath);
      process.stdout.write(\` [auto-fit \${speedRatio.toFixed(2)}x -> \${dur.toFixed(2)}s] \`);
    }
    durations[line.id] = dur;
    console.log(\`\${dur.toFixed(2)}s\`);
    await new Promise((r) => setTimeout(r, 400));
  }

  const jsonPath = path.join(OUT_DIR, "durations.json");
  fs.writeFileSync(jsonPath, JSON.stringify(durations, null, 2), "utf8");
  console.log(\`[OK] Đã lưu 12 file VO vào \${OUT_DIR}\`);
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
`;
  fs.writeFileSync(path.join(dir, "scripts", "generate-vo.mjs"), voScript);

  log("[4/6] Sinh âm thanh Voiceover thực tế...");
  await run("node", ["scripts/generate-vo.mjs"], dir, log);

  log("[5/6] Dựng composition index.html");
  const { renderSurvivalTemplatePreview } = await import("./preview-template.mjs");
  const { html: renderedHtml } = renderSurvivalTemplatePreview(cfg);
  
  // Clean base tag since index.html is now running in its own root
  let finalHtml = renderedHtml.replace(/<base href="[^"]*">/g, "");

  // Save full spec for reproducibility
  fs.writeFileSync(path.join(dir, "spec.json"), JSON.stringify({ type: "survival", slug, lang, voice, survivalConfig: cfg }, null, 2));

  // Update actual VO audio durations if available
  const durJsonPath = path.join(dir, "assets", "vo", "durations.json");
  if (fs.existsSync(durJsonPath)) {
    const durations = JSON.parse(fs.readFileSync(durJsonPath, "utf8"));
    for (const [id, rawDur] of Object.entries(durations)) {
      const lineNum = parseInt(id.replace("line-", ""), 10);
      const trackIndex = 20 + ((lineNum - 1) % 3);
      const maxBudget = lineNum === 1 ? 3.6 : lineNum === 12 ? 5.0 : 4.8;
      const dur = Math.min(rawDur, maxBudget);
      finalHtml = finalHtml.replace(
        new RegExp(`id="vo-${lineNum}" src="[^"]*" data-start="([^"]*)" data-duration="[^"]*" data-track-index="[^"]*"`, "g"),
        `id="vo-${lineNum}" src="assets/vo/${id}.mp3" data-start="$1" data-duration="${dur}" data-track-index="${trackIndex}"`
      );
    }
  }

  // Handle BGM mute or custom volume
  if (bgmChoice === "none") {
    finalHtml = finalHtml.replace(/<audio id="bgm"[\s\S]*?<\/audio>/g, "");
  } else if (opts.spec?.bgmVolume !== undefined) {
    finalHtml = finalHtml.replace(/id="bgm" src="[^"]*" data-start="0" data-duration="[^"]*" data-track-index="[^"]*" data-volume="[^"]*"/, `id="bgm" src="assets/audio/bgm.mp3" data-start="0" data-duration="65" data-track-index="2" data-volume="${opts.spec.bgmVolume}"`);
  }

  fs.writeFileSync(path.join(dir, "index.html"), finalHtml);

  log("[6/6] Kiểm tra HyperFrames Check...");
  await run("npx", ["--yes", "hyperframes@0.7.58", "check"], dir, log);

  if (opts.render) {
    log("[Render] Đang tiến hành kết xuất MP4...");
    await run("npx", ["--yes", "hyperframes@0.7.58", "render"], dir, log);
    
    // Extract thumbnail frame
    try {
      const rendersDir = path.join(dir, "renders");
      const mp4s = fs.readdirSync(rendersDir).filter((f) => f.endsWith(".mp4"));
      if (mp4s.length > 0) {
        const mp4Path = path.join(rendersDir, mp4s[0]);
        await run(
          "ffmpeg",
          ["-y", "-ss", "00:00:32", "-i", mp4Path, "-vframes", "1", "-q:v", "2", path.join(dir, "cover-frame.jpg")],
          dir,
          () => {}
        );
        await run(
          "ffmpeg",
          ["-y", "-i", mp4Path, "-vf", "fps=1/6.5,scale=270:480,tile=5x2", "-q:v", "2", path.join(dir, "snapshots", "contact-sheet.jpg")],
          dir,
          () => {}
        );
      }
    } catch {}
  }

  log(`[HOÀN TẤT] Video "${slug}" đã tạo thành công!`);
  return { slug, title: cfg.title, lang, duration: 65 };
}

// CLI direct run
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const langIdx = args.indexOf("--lang");
  const lang = langIdx !== -1 ? args[langIdx + 1] : "vi";
  const slugIdx = args.indexOf("--slug");
  const slug = slugIdx !== -1 ? args[slugIdx + 1] : undefined;
  const voiceIdx = args.indexOf("--voice");
  const voice = voiceIdx !== -1 ? args[voiceIdx + 1] : undefined;
  const specIdx = args.indexOf("--spec");
  const specPath = specIdx !== -1 ? args[specIdx + 1] : undefined;
  const render = args.includes("--render");

  createSurvivalVideo({ lang, slug, voice, specPath, render })
    .then((res) => console.log("Thành công:", res))
    .catch((err) => {
      console.error("Thất bại:", err);
      process.exit(1);
    });
}
