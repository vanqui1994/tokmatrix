#!/usr/bin/env node
// Generator for "Khoa Học Nhân Hoá & Bí Mật Tự Nhiên" (Anthropomorphic Science Animation) videos.
// Multi-character comic dialogues + action interruption + micro-zoom science reveal.

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getScienceTopic } from "./generate-science-topic.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function findNodeModulesTemplate() {
  const candidates = [
    path.join(REPO_ROOT, "videos", "survival-organs-vi", "node_modules"),
    path.join(REPO_ROOT, "videos", "tcp-vs-udp", "node_modules"),
    path.join(REPO_ROOT, "videos", "pork-beef-de", "node_modules"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

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

export async function createScienceVideo(opts) {
  const log = opts.log ?? console.log;

  let topic = null;
  if (opts.scienceConfig) {
    topic = opts.scienceConfig;
  } else if (opts.spec?.scienceConfig) {
    topic = opts.spec.scienceConfig;
  } else if (opts.topicConfig) {
    topic = opts.topicConfig;
  } else if (opts.spec?.topicConfig) {
    topic = opts.spec.topicConfig;
  } else if (opts.id) {
    topic = getScienceTopic(opts.id, opts.lang || "vi");
  } else {
    topic = getScienceTopic("peanut-stomp", opts.lang || "vi");
  }

  const lang = opts.lang || topic.lang || "vi";
  const slug = opts.slug || opts.spec?.slug || `science-${topic.id || "nature"}-${lang}`;
  const dir = path.join(REPO_ROOT, "videos", slug);

  if (!fs.existsSync(dir)) {
    log(`[1/6] Khởi tạo cấu trúc thư mục videos/${slug}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "assets", "characters"), { recursive: true });
    fs.mkdirSync(path.join(dir, "assets", "audio", "sfx"), { recursive: true });
    fs.mkdirSync(path.join(dir, "assets", "vo"), { recursive: true });
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
    fs.mkdirSync(path.join(dir, "snapshots"), { recursive: true });
  }

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

  // Copy sound effects & BGM
  log("[2/6] Sao chép hiệu ứng âm thanh (SFX) và nhạc nền (BGM)");
  const sfxDir = path.join(REPO_ROOT, "shared", "audio", "sfx");
  if (fs.existsSync(sfxDir)) {
    for (const file of fs.readdirSync(sfxDir)) {
      if (file.endsWith(".mp3")) {
        fs.copyFileSync(path.join(sfxDir, file), path.join(dir, "assets", "audio", "sfx", file));
      }
    }
  }

  const bgmTrack = opts.bgmTrack || "monkeys-spinning";
  const bgmSrc = path.join(REPO_ROOT, "shared", "audio", "bgm", `${bgmTrack}.mp3`);
  if (fs.existsSync(bgmSrc)) {
    fs.copyFileSync(bgmSrc, path.join(dir, "assets", "audio", "bgm.mp3"));
  }

  // Copy cartoon chibi character assets
  const charDir = path.join(dir, "assets", "characters");
  fs.mkdirSync(charDir, { recursive: true });
  const sharedCharDir = path.join(REPO_ROOT, "shared", "assets", "science", "characters");
  if (topic.id === "chili-night-spray") {
    if (fs.existsSync(path.join(sharedCharDir, "chili-girl.png"))) {
      fs.copyFileSync(path.join(sharedCharDir, "chili-girl.png"), path.join(charDir, "char-a.png"));
    }
    if (fs.existsSync(path.join(sharedCharDir, "caterpillar-bug.png"))) {
      fs.copyFileSync(path.join(sharedCharDir, "caterpillar-bug.png"), path.join(charDir, "char-b.png"));
    }
    if (fs.existsSync(path.join(sharedCharDir, "stomp-boot.png"))) {
      fs.copyFileSync(path.join(sharedCharDir, "stomp-boot.png"), path.join(charDir, "stomp-boot.png"));
    }
  } else {
    // Default peanut chibi characters
    if (fs.existsSync(path.join(sharedCharDir, "char-a.png"))) {
      fs.copyFileSync(path.join(sharedCharDir, "char-a.png"), path.join(charDir, "char-a.png"));
    }
    if (fs.existsSync(path.join(sharedCharDir, "char-b.png"))) {
      fs.copyFileSync(path.join(sharedCharDir, "char-b.png"), path.join(charDir, "char-b.png"));
    }
    if (fs.existsSync(path.join(sharedCharDir, "stomp-boot.png"))) {
      fs.copyFileSync(path.join(sharedCharDir, "stomp-boot.png"), path.join(charDir, "stomp-boot.png"));
    }
  }

  // Check if VO was already generated in scripts/durations.json
  const durationsJsonPath = path.join(dir, "scripts", "durations.json");
  let timedDialogues = [];
  let rootDuration = 45;

  if (fs.existsSync(durationsJsonPath)) {
    log(`[3/6] Tái sử dụng audio đã tạo từ scripts/durations.json`);
    const data = JSON.parse(fs.readFileSync(durationsJsonPath, "utf8"));
    timedDialogues = data.results;
    rootDuration = data.rootDuration;
  } else {
    // Write multi-voice TTS script
    log(`[3/6] Thiết lập kịch bản Voiceover đa nhân vật (Ngôn ngữ: ${lang})`);
    const dialogues = topic.dialogues || [];
    const voices = topic.voices || {
      charA: "vi-VN-HoaiMyNeural",
      charB: "vi-VN-NamMinhNeural",
      narrator: "vi-VN-NamMinhNeural",
    };

    const voScriptPath = path.join(dir, "scripts", "generate-vo.mjs");
    const voScriptCode = `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesizeAudio, probeDuration } from "../../tools/voices.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "vo");
fs.mkdirSync(OUT_DIR, { recursive: true });

const DIALOGUES = ${JSON.stringify(dialogues, null, 2)};
const VOICES = ${JSON.stringify(voices, null, 2)};

async function synthesizeLine(text, voice, outPath) {
  return synthesizeAudio({
    text,
    voice,
    outPath,
    rate: "+15%",
    lang: "${lang || "vi"}",
  });
}

async function main() {
  console.log("[TTS] Đang sinh giọng đọc cho từng nhân vật...");
  const results = [];
  let currentTime = 0.6;

  for (let i = 0; i < DIALOGUES.length; i++) {
    const d = DIALOGUES[i];
    const lineId = "line-" + (i + 1);
    const outPath = path.join(OUT_DIR, lineId + ".mp3");
    const voice = VOICES[d.speaker] || VOICES.narrator || "vi-VN-NamMinhNeural";
    
    process.stdout.write("  [" + (i + 1) + "/" + DIALOGUES.length + "] " + d.speaker + " (" + voice + "): " + d.text.slice(0, 28) + "... ");
    await synthesizeLine(d.text, voice, outPath);
    const dur = await probeDuration(outPath);
    console.log(dur.toFixed(2) + "s");

    results.push({
      ...d,
      id: lineId,
      start: Number(currentTime.toFixed(2)),
      dur: Number(dur.toFixed(2)),
      end: Number((currentTime + dur).toFixed(2)),
    });

    currentTime += dur + 0.28;
  }

  const rootDuration = Number((currentTime + 1.2).toFixed(1));
  const outputData = { results, rootDuration };
  fs.writeFileSync(path.join(ROOT, "scripts", "durations.json"), JSON.stringify(outputData, null, 2));
  console.log("[TTS] Hoàn tất! Tổng thời lượng: " + rootDuration + "s");
}

main().catch((err) => {
  console.error("Lỗi TTS:", err);
  process.exit(1);
});
`;
    fs.writeFileSync(voScriptPath, voScriptCode);

    log(`[3/6] Đang chạy generate-vo.mjs để sinh âm thanh thực tế...`);
    await run("node", ["scripts/generate-vo.mjs"], dir, log);

    const durationsData = JSON.parse(fs.readFileSync(path.join(dir, "scripts", "durations.json"), "utf8"));
    timedDialogues = durationsData.results;
    rootDuration = durationsData.rootDuration;
  }

  // meta.json
  const meta = {
    id: slug,
    name: topic.title,
    type: "science",
    lang,
    createdAt: new Date().toISOString(),
    duration: rootDuration,
    scienceConfig: { ...topic, dialogues: timedDialogues },
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));

  // BRIEF.md
  const brief = `---
workflow: anthropomorphic-science
message: "${topic.title} — ${topic.question}"
destination: reels / tiktok / shorts
aspect: 1080x1920
language: ${lang}
length: ${rootDuration}s
---

## Topic: ${topic.title}
${topic.scienceFact}
`;
  fs.writeFileSync(path.join(dir, "BRIEF.md"), brief);

  log(`[4/6] Dựng mã nguồn HTML/GSAP index.html cho video`);
  const htmlContent = generateScienceHtml({
    slug,
    title: topic.title,
    eyebrow: topic.eyebrow,
    question: topic.question,
    scienceFact: topic.scienceFact,
    characters: topic.characters,
    timedDialogues,
    rootDuration,
    visualElements: topic.visualElements || {},
    lang,
  });

  fs.writeFileSync(path.join(dir, "index.html"), htmlContent);

  log(`[5/6] Kiểm tra mã nguồn với HyperFrames Check...`);
  await run("npx", ["--yes", "hyperframes@0.7.58", "check"], dir, log);

  if (opts.render) {
    log(`[Render] Đang kết xuất video sang MP4...`);
    await run("npx", ["--yes", "hyperframes@0.7.58", "render"], dir, log);
  }

  log(`[6/6] Hoàn tất! Video đã sẵn sàng tại: videos/${slug}`);
  return { slug, dir, rootDuration };
}

export function generateScienceHtml(opts) {
  const {
    slug,
    title,
    eyebrow,
    question,
    scienceFact,
    characters,
    timedDialogues,
    rootDuration,
    visualElements,
    cinemaAudioHtml,
    lang = "vi",
  } = opts;
  // Ngôn ngữ thật của video (trước đây ghi cứng "vi" nên video tiếng Đức bị nhận là tiếng Việt).
  const htmlLang = /^[a-z]{2}$/.test(lang) ? lang : "vi";

  // Build audio elements
  const audioElements = timedDialogues
    .map(
      (d, i) =>
        `      <audio id="vo-${i + 1}" class="clip" src="assets/vo/${d.id}.mp3" preload="auto" data-track-index="${10 + i}" data-start="${d.start}" data-duration="${d.dur}"></audio>`
    )
    .join("\n");

  const bgmVolume = 0.16;

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face {
        font-family: "Baloo 2";
        font-style: normal;
        font-weight: 800;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/baloo2/v23/wXKrE3kTposypRyd51fcAM4olXcLtA.woff2) format("woff2");
        unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
      }
      @font-face {
        font-family: "Baloo 2";
        font-style: normal;
        font-weight: 800;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/baloo2/v23/wXKrE3kTposypRyd51jcAM4olXc.woff2) format("woff2");
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
      }
      @font-face {
        font-family: "Nunito";
        font-style: normal;
        font-weight: 800;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKof4N-yGbss.woff2) format("woff2");
      }
      @font-face {
        font-family: "Nunito";
        font-style: normal;
        font-weight: 900;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKof4N-yGbss.woff2) format("woff2");
      }

      :root {
        --comic-dark: #1E293B;
        --comic-yellow: #FFD166;
        --comic-pink: #FF7597;
        --comic-blue: #38BDF8;
        --comic-green: #22C55E;
        --comic-cream: #FFFDF0;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        width: 1080px;
        height: 1920px;
        background: #38BDF8;
        color: #1E293B;
        font-family: "Nunito", "Baloo 2", -apple-system, sans-serif;
        overflow: hidden;
        user-select: none;
      }

      #root {
        position: relative;
        width: 1080px;
        height: 1920px;
        background: linear-gradient(180deg, #38BDF8 0%, #7DD3FC 28%, #BAE6FD 50%, #86EFAC 76%, #4ADE80 88%, #22C55E 100%);
        overflow: hidden;
      }

      /* Playful Cartoon Background Clouds & Sunbeams */
      .sun-glow {
        position: absolute;
        top: -120px;
        right: -120px;
        width: 480px;
        height: 480px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(254, 240, 138, 0.75) 0%, rgba(253, 224, 71, 0.35) 50%, transparent 75%);
        z-index: 1;
      }

      .bg-cloud {
        position: absolute;
        z-index: 2;
        filter: drop-shadow(0 8px 12px rgba(14, 165, 233, 0.2));
      }

      .cloud-1 {
        top: 80px;
        left: -30px;
        width: 240px;
      }

      .cloud-2 {
        top: 190px;
        right: -20px;
        width: 200px;
      }

      /* Progress Bar */
      .progress-rail {
        position: absolute;
        top: 0;
        left: 0;
        width: 1080px;
        height: 16px;
        background: rgba(30, 41, 59, 0.2);
        border-bottom: 3px solid #1E293B;
        z-index: 50;
      }

      #progress-bar {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #FF7597 0%, #FFD166 40%, #06D6A0 75%, #38BDF8 100%);
        border-right: 3px solid #1E293B;
      }

      /* ── ZONE 1: TOP HEADER (y: 55 - 270) ── */
      .header-zone {
        position: absolute;
        top: 55px;
        left: 50px;
        width: 980px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        z-index: 20;
      }

      .eyebrow-badge {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 8px 28px;
        border-radius: 9999px;
        background: var(--comic-yellow);
        border: 4px solid var(--comic-dark);
        box-shadow: 0 6px 0 var(--comic-dark);
        color: var(--comic-dark);
        font-family: "Baloo 2", "Nunito", sans-serif;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 12px;
      }

      .pulse-dot {
        font-size: 22px;
      }

      .main-title {
        font-family: "Baloo 2", "Nunito", sans-serif;
        font-size: 52px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.01em;
        text-transform: uppercase;
        color: #FFFFFF;
        text-shadow: 
          -4px -4px 0 var(--comic-dark),
           4px -4px 0 var(--comic-dark),
          -4px  4px 0 var(--comic-dark),
           4px  4px 0 var(--comic-dark),
           0    8px 0 var(--comic-dark),
           0   16px 25px rgba(0, 0, 0, 0.35);
      }

      /* ── ZONE 2: CARTOON CHIBI STAGE (y: 280 - 1070) ── */
      .stage-zone {
        position: absolute;
        top: 280px;
        left: 50px;
        width: 980px;
        height: 790px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      }

      .characters-container {
        position: relative;
        width: 930px;
        height: 750px;
        background: linear-gradient(180deg, #E0F2FE 0%, #BAE6FD 50%, #DCFCE7 78%, #86EFAC 100%);
        border: 6px solid var(--comic-dark);
        border-radius: 46px;
        box-shadow: 0 16px 0 var(--comic-dark), 0 30px 60px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: flex-end;
        justify-content: space-around;
        padding-bottom: 60px;
        overflow: hidden;
      }

      /* Stage internal scenery */
      .stage-sun {
        position: absolute;
        top: 30px;
        right: 40px;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: #FDE047;
        border: 4px solid var(--comic-dark);
        box-shadow: 0 0 25px rgba(253, 224, 71, 0.8);
        z-index: 2;
      }

      .stage-cloud {
        position: absolute;
        top: 60px;
        left: 60px;
        width: 140px;
        opacity: 0.85;
        z-index: 2;
      }

      .stage-grass {
        position: absolute;
        bottom: 50px;
        left: 0;
        width: 100%;
        height: 60px;
        background: #22C55E;
        border-top: 5px solid var(--comic-dark);
        border-radius: 36px 36px 0 0;
        z-index: 6;
      }

      .stage-soil {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 52px;
        background: linear-gradient(180deg, #78350F 0%, #451A03 100%);
        border-top: 5px solid var(--comic-dark);
        z-index: 7;
      }

      /* Manga / Chibi Comic Speech Bubble */
      #speech-bubble {
        position: absolute;
        top: 25px;
        left: 45px;
        width: 840px;
        min-height: 125px;
        background: #FFFFFF;
        border: 5px solid var(--comic-dark);
        border-radius: 32px;
        padding: 16px 26px;
        box-shadow: 0 8px 0 #CBD5E1, 0 16px 35px rgba(0, 0, 0, 0.2);
        z-index: 30;
        opacity: 0;
        will-change: transform, opacity;
      }

      /* Bubble speech pointer tail */
      #bubble-tail {
        position: absolute;
        bottom: -24px;
        left: 140px;
        width: 0;
        height: 0;
        border-left: 20px solid transparent;
        border-right: 20px solid transparent;
        border-top: 24px solid var(--comic-dark);
        transition: left 0.3s ease;
      }

      #bubble-tail::after {
        content: "";
        position: absolute;
        top: -24px;
        left: -15px;
        width: 0;
        height: 0;
        border-left: 15px solid transparent;
        border-right: 15px solid transparent;
        border-top: 18px solid #FFFFFF;
      }

      .bubble-speaker {
        display: inline-block;
        padding: 5px 20px;
        border-radius: 9999px;
        font-family: "Baloo 2", "Nunito", sans-serif;
        font-size: 20px;
        font-weight: 800;
        color: #FFFFFF;
        background: #0F172A;
        border: 3px solid #1E293B;
        margin-bottom: 6px;
      }

      .bubble-text {
        font-family: "Nunito", sans-serif;
        font-size: 32px;
        font-weight: 900;
        color: var(--comic-dark);
        line-height: 1.35;
      }

      /* Chibi Actors */
      .actor {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        z-index: 15;
        transform-origin: bottom center;
        will-change: transform;
      }

      .actor-img {
        width: 330px;
        height: 450px;
        object-fit: contain;
        filter: drop-shadow(0 16px 25px rgba(0, 0, 0, 0.4));
      }

      .actor-shadow {
        position: absolute;
        bottom: 5px;
        width: 220px;
        height: 24px;
        border-radius: 50%;
        background: rgba(30, 41, 59, 0.3);
        z-index: 8;
      }

      /* Stomp Action Overlay */
      #stomp-foot {
        position: absolute;
        top: 0;
        left: 240px;
        width: 450px;
        height: 450px;
        object-fit: contain;
        z-index: 40;
        filter: drop-shadow(0 25px 50px rgba(0, 0, 0, 0.85));
      }

      #impact-dust {
        position: absolute;
        bottom: 45px;
        left: 200px;
        width: 480px;
        height: 160px;
        opacity: 0;
        z-index: 35;
      }

      /* Comic SFX Action Burst */
      #comic-sfx {
        position: absolute;
        top: 320px;
        left: 310px;
        padding: 12px 36px;
        background: #EF4444;
        border: 5px solid var(--comic-dark);
        border-radius: 30px;
        box-shadow: 0 8px 0 var(--comic-dark);
        color: #FFFFFF;
        font-family: "Baloo 2", sans-serif;
        font-size: 48px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-shadow: 0 3px 0 var(--comic-dark);
        z-index: 45;
        opacity: 0;
        transform: scale(0.2) rotate(-10deg);
      }

      /* ── ZONE 3: CARTOON EXPLORER SCIENCE CARD (y: 1080 - 1530) ── */
      #science-card {
        position: absolute;
        bottom: 300px;
        left: 55px;
        width: 970px;
        background: var(--comic-cream);
        border: 5px solid var(--comic-dark);
        border-radius: 38px;
        padding: 24px 34px;
        box-shadow: 0 10px 0 var(--comic-dark), 0 25px 50px rgba(0, 0, 0, 0.25);
        z-index: 25;
        opacity: 0;
      }

      /* Cute washi tape sticker at top of card */
      .card-tape {
        position: absolute;
        top: -14px;
        left: 50%;
        transform: translateX(-50%);
        width: 140px;
        height: 28px;
        background: #FCA5A5;
        border: 3px solid var(--comic-dark);
        border-radius: 6px;
        box-shadow: 0 3px 0 var(--comic-dark);
      }

      .science-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 12px;
        padding-bottom: 10px;
        border-bottom: 3px dashed #CBD5E1;
      }

      .science-icon {
        font-size: 34px;
      }

      .science-badge {
        font-family: "Baloo 2", "Nunito", sans-serif;
        font-size: 22px;
        font-weight: 800;
        color: var(--comic-dark);
        background: #FDE047;
        padding: 4px 20px;
        border-radius: 9999px;
        border: 3px solid var(--comic-dark);
        letter-spacing: 0.04em;
      }

      .science-body {
        font-family: "Nunito", sans-serif;
        font-size: 27px;
        font-weight: 800;
        line-height: 1.45;
        color: var(--comic-dark);
      }

      /* ── ZONE 4: VIRAL TIKTOK CARTOON SUBTITLES (y: 1620 - 1840) ── */
      .caption-zone {
        position: absolute;
        bottom: 60px;
        left: 50px;
        width: 980px;
        min-height: 175px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        z-index: 30;
      }

      .caption-banner {
        width: 100%;
        padding: 22px 32px;
        border-radius: 32px;
        background: #0F172A;
        border: 4px solid #FFFFFF;
        box-shadow: 0 10px 0 rgba(0, 0, 0, 0.35), 0 20px 40px rgba(0, 0, 0, 0.4);
      }

      #caption-text {
        font-family: "Baloo 2", "Nunito", sans-serif;
        font-size: 38px;
        font-weight: 900;
        line-height: 1.35;
        color: #FACC15;
        text-shadow: 0 3px 0 #000000;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${slug}" data-width="1080" data-height="1920" data-start="0" data-duration="${rootDuration}">
      <!-- Sun Glow & Floating Cartoon Clouds -->
      <div class="sun-glow" data-layout-allow-overflow></div>
      <div class="bg-cloud cloud-1" data-layout-allow-overflow>
        <svg viewBox="0 0 200 80" width="240" height="96">
          <path d="M30 60 Q10 60 10 40 Q10 20 35 20 Q45 5 70 5 Q95 5 105 20 Q120 10 145 15 Q170 20 170 40 Q190 40 190 60 Z" fill="#FFFFFF" opacity="0.9" />
        </svg>
      </div>
      <div class="bg-cloud cloud-2" data-layout-allow-overflow>
        <svg viewBox="0 0 200 80" width="200" height="80">
          <path d="M30 60 Q10 60 10 40 Q10 20 35 20 Q45 5 70 5 Q95 5 105 20 Q120 10 145 15 Q170 20 170 40 Q190 40 190 60 Z" fill="#FFFFFF" opacity="0.8" />
        </svg>
      </div>

      <!-- Top Candy Progress Bar -->
      <div class="progress-rail"><div id="progress-bar"></div></div>

      <!-- Zone 1: Top Header -->
      <div class="header-zone">
        <div class="eyebrow-badge">
          <span class="pulse-dot">🌱</span>
          <span>${eyebrow}</span>
        </div>
        <h1 class="main-title">${title}</h1>
      </div>

      <!-- Zone 2: Cartoon Stage -->
      <div class="stage-zone">
        <div class="characters-container" data-layout-allow-overflow>
          <!-- Stage Background Details -->
          <div class="stage-sun"></div>
          <div class="stage-cloud" data-layout-allow-overflow>
            <svg viewBox="0 0 200 80" width="140" height="56">
              <path d="M30 60 Q10 60 10 40 Q10 20 35 20 Q45 5 70 5 Q95 5 105 20 Q120 10 145 15 Q170 20 170 40 Q190 40 190 60 Z" fill="#FFFFFF" />
            </svg>
          </div>

          <!-- Manga Speech Bubble with pointing tail -->
          <div id="speech-bubble">
            <div id="bubble-speaker" class="bubble-speaker">${characters.charA?.name || "Nhân vật"}</div>
            <div id="bubble-text" class="bubble-text">${timedDialogues[0]?.text || ""}</div>
            <div id="bubble-tail"></div>
          </div>

          <!-- Character A Chibi -->
          <div id="char-a" class="actor" data-layout-allow-overflow>
            <div class="actor-shadow"></div>
            <img id="img-char-a" class="actor-img" src="assets/characters/char-a.png" alt="${characters.charA?.name || 'Char A'}" />
          </div>

          <!-- Stomping Giant Boot (Action interruption) -->
          <img id="stomp-foot" src="assets/characters/stomp-boot.png" alt="Stomp Boot" data-layout-allow-overflow />

          <!-- Comic SFX POPUP -->
          <div id="comic-sfx" data-layout-allow-overflow>BẸP! 💥</div>

          <!-- Impact Dust -->
          <svg id="impact-dust" viewBox="0 0 480 160" data-layout-allow-overflow>
            <ellipse cx="240" cy="90" rx="200" ry="50" fill="none" stroke="#FDE047" stroke-width="12" opacity="0.75" stroke-dasharray="20 15" />
            <circle cx="80" cy="80" r="30" fill="#FDE047" opacity="0.65" />
            <circle cx="160" cy="50" r="40" fill="#FFD166" opacity="0.7" />
            <circle cx="320" cy="50" r="40" fill="#FFD166" opacity="0.7" />
            <circle cx="400" cy="80" r="30" fill="#FDE047" opacity="0.65" />
          </svg>

          <!-- Character B Chibi -->
          <div id="char-b" class="actor" data-layout-allow-overflow>
            <div class="actor-shadow"></div>
            <img id="img-char-b" class="actor-img" src="assets/characters/char-b.png" alt="${characters.charB?.name || 'Char B'}" />
          </div>

          <!-- Stage Cartoon Grass & Soil Layers -->
          <div class="stage-grass"></div>
          <div class="stage-soil"></div>
        </div>
      </div>

      <!-- Zone 3: Cartoon Explorer Science Card -->
      <div id="science-card">
        <div class="card-tape"></div>
        <div class="science-header">
          <span class="science-icon">🔬</span>
          <span class="science-badge">GIẢI MÃ KHOA HỌC THỰC VẬT</span>
        </div>
        <div class="science-body">
          ${scienceFact}
        </div>
      </div>

      <!-- Zone 4: Viral TikTok Cartoon Subtitle Banner -->
      <div class="caption-zone">
        <div class="caption-banner">
          <div id="caption-text">${timedDialogues[0]?.text || ""}</div>
        </div>
      </div>

      <!-- Audio Track Elements -->
      ${cinemaAudioHtml || `<audio id="bgm" class="clip" src="assets/audio/bgm.mp3" loop data-track-index="1" data-start="0" data-duration="${rootDuration}"></audio>
      <audio id="sfx-pop" class="clip" src="assets/audio/sfx/pop.mp3" preload="auto" data-track-index="2" data-start="0.6" data-duration="0.5"></audio>
      <audio id="sfx-ding" class="clip" src="assets/audio/sfx/ding.mp3" preload="auto" data-track-index="3" data-start="12.0" data-duration="0.8"></audio>
      <audio id="sfx-whoosh" class="clip" src="assets/audio/sfx/whoosh.mp3" preload="auto" data-track-index="4" data-start="18.0" data-duration="0.8"></audio>`}

${audioElements}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const ROOT_DURATION = ${rootDuration};
      const tl = gsap.timeline({ paused: true });

      const DIALOGUES = ${JSON.stringify(timedDialogues, null, 2)};
      const CHARACTERS = ${JSON.stringify(characters, null, 2)};

      // Global Audio Volume
      const bgmAudio = document.getElementById("bgm");
      if (bgmAudio) bgmAudio.volume = ${bgmVolume};

      // Progress bar animation
      tl.to("#progress-bar", { width: "100%", duration: ROOT_DURATION, ease: "none" }, 0);

      // Character natural breathing and cloud loop calculation (bounded within ROOT_DURATION)
      const loopCount = (dur, offset = 0) => Math.max(0, Math.floor((ROOT_DURATION - offset) / dur) - 1);

      // Background cartoon clouds floating gently
      tl.to(".cloud-1", { x: 35, duration: 4.5, repeat: loopCount(4.5, 0), yoyo: true, ease: "sine.inOut" }, 0);
      tl.to(".cloud-2", { x: -30, duration: 5.5, repeat: loopCount(5.5, 0.5), yoyo: true, ease: "sine.inOut" }, 0.5);
      tl.to(".stage-cloud", { x: 25, duration: 4.0, repeat: loopCount(4.0, 0.2), yoyo: true, ease: "sine.inOut" }, 0.2);

      // Character natural breathing finite loop
      tl.to("#char-a", { y: -10, duration: 1.3, repeat: loopCount(1.3, 0), yoyo: true, ease: "sine.inOut" }, 0);
      tl.to("#char-b", { y: -8, duration: 1.5, repeat: loopCount(1.5, 0.2), yoyo: true, ease: "sine.inOut" }, 0.2);

      // Initial positions via GSAP
      tl.set("#speech-bubble", { opacity: 1, scale: 1 }, 0.5);
      tl.set("#stomp-foot", { y: -800 }, 0);
      tl.set("#science-card", { y: 60 }, 0);

      // Sequence dialogues & chibi cartoon reactions
      DIALOGUES.forEach((d, idx) => {
        // Update bubble text & speaker & pointer tail
        tl.call(() => {
          const charInfo = CHARACTERS[d.speaker] || { name: d.speaker, color: "#E76F51" };
          const speakerBadge = document.getElementById("bubble-speaker");
          const bubbleText = document.getElementById("bubble-text");
          const captionText = document.getElementById("caption-text");
          const bubbleTail = document.getElementById("bubble-tail");

          if (speakerBadge) {
            speakerBadge.textContent = charInfo.name;
            speakerBadge.style.background = "#0F172A";
            speakerBadge.style.color = "#FFFFFF";
            speakerBadge.style.borderColor = charInfo.color || "#FFD166";
          }
          if (bubbleText) bubbleText.textContent = d.text;
          if (captionText) captionText.textContent = d.text;

          // Align tail to active speaker
          if (bubbleTail) {
            if (d.speaker === "charA") {
              bubbleTail.style.left = "160px";
            } else if (d.speaker === "charB") {
              bubbleTail.style.left = "640px";
            } else {
              bubbleTail.style.left = "400px";
            }
          }
        }, null, d.start);

        // Speech bubble bounce on new line
        tl.fromTo("#speech-bubble", 
          { scale: 0.92, y: 10 }, 
          { scale: 1, y: 0, duration: 0.25, ease: "back.out(2)" }, 
          d.start
        );

        // Chibi animated speaking reaction
        const flapRepeats = Math.max(1, Math.floor(d.dur / 0.3) * 2);
        if (d.speaker === "charA") {
          tl.to("#char-a", { scale: 1.08, rotation: 3, duration: 0.16, repeat: flapRepeats, yoyo: true, ease: "sine.inOut" }, d.start);
        } else if (d.speaker === "charB") {
          tl.to("#char-b", { scale: 1.08, rotation: -3, duration: 0.16, repeat: flapRepeats, yoyo: true, ease: "sine.inOut" }, d.start);
        }

        // Stomp Action Trigger (When narrator shouts or steps)
        if (d.emotion && d.emotion.includes("stomp")) {
          // Foot crashes down from above via y transform
          tl.to("#stomp-foot", { y: 200, duration: 0.28, ease: "power4.in" }, d.start);
          // Comic SFX burst popup
          tl.fromTo("#comic-sfx", 
            { opacity: 1, scale: 0.2, rotation: -15 }, 
            { opacity: 1, scale: 1.35, rotation: 8, duration: 0.25, ease: "back.out(3)" }, 
            d.start + 0.28
          );
          tl.to("#comic-sfx", { opacity: 0, scale: 0.8, duration: 0.35, ease: "power2.in" }, d.start + 1.2);
          // Dust explosion & screen shake
          tl.fromTo("#impact-dust", 
            { opacity: 1, scale: 0.3 }, 
            { opacity: 0, scale: 1.5, duration: 0.6, ease: "power2.out" }, 
            d.start + 0.28
          );
          tl.to("#root", { x: "+=22", yoyo: true, repeat: 7, duration: 0.04 }, d.start + 0.28);
          // Squash chibi characters flat
          tl.to(["#char-a", "#char-b"], { scaleY: 0.38, scaleX: 1.35, y: 80, duration: 0.15, ease: "power3.in" }, d.start + 0.28);
          // Foot lifts up slowly
          tl.to("#stomp-foot", { y: -800, duration: 0.8, ease: "power2.out" }, d.start + 1.6);
          // Characters bounce back up dizzily
          tl.to(["#char-a", "#char-b"], { scaleY: 1, scaleX: 1, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" }, d.start + 1.8);
        }

        // Science reveal card popup (around middle-to-end lines explaining science)
        if (d.speaker === "narrator" && idx >= Math.floor(DIALOGUES.length * 0.65)) {
          tl.to("#science-card", { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, d.start);
        }
      });

      // Register root timeline on window.__timelines
      window.__timelines["${slug}"] = tl;
    </script>
  </body>
</html>`;
}
