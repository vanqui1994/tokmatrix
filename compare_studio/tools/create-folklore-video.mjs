#!/usr/bin/env node
// Dựng video "Tâm Linh Dân Gian" (folklore) thành một dự án HyperFrames.
//
// Bố cục theo mẫu ghost.mp4: nửa trên trời đêm + một dòng phụ đề, nửa dưới là ảnh
// cảnh (Antigravity), chuyển shot bằng mờ dần, ánh nến lung linh, giọng kể liền mạch.
// Thời điểm của từng câu lấy từ độ dài thật của file giọng — không chia đều.
//
//   node tools/create-folklore-video.mjs "chủ đề" [--lang vi] [--duration 70] [--render]
//   node tools/create-folklore-video.mjs --rebuild <slug>     # dựng lại index.html từ giọng hiện có

import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateFolkloreTopic, normalizeFolkloreScript, slugify } from "./generate-folklore-topic.mjs";
import { FOLKLORE_LANG_META, FALLBACK_FOLKLORE_TOPICS, FOLKLORE_FX } from "./folklore-configs.mjs";
import { synthesizeAudio, synthesizeEdge } from "./voices.mjs";
import { ensureFolkloreImages, shotImageRel, buildShotPrompt } from "./folklore-images.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const BGM_TEMPLATE = path.join(__dirname, "template-folklore", "assets", "audio", "bgm.mp3");
const WIND_TEMPLATE = path.join(__dirname, "template-folklore", "assets", "audio", "wind.mp3");
const SHARED_SFX = path.join(REPO_ROOT, "shared", "audio", "sfx");
// Độ dài thật của các file trong shared/audio/sfx (khai báo đúng để HyperFrames không cắt).
const SFX_DURATION = { click: 1.03, sub_drop: 2.36, glitch: 0.4, whoosh: 1.75, deep_boom: 2.93, heartbeat: 0.36, chime: 2.0 };

const LEAD_IN = 0.6; // lặng trước câu đầu
const LINE_GAP = 0.3; // giữa hai câu cùng shot — mẫu kể gần như liền mạch
const SHOT_GAP = 0.6; // thêm khi đổi shot, cho ảnh kịp mờ sang
const TAIL = 1.8; // lặng sau câu cuối

function run(cmd, args, cwd, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: "0" } });
    child.stdout.on("data", (c) => log(String(c).trimEnd()));
    child.stderr.on("data", (c) => log(String(c).trimEnd()));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → mã lỗi ${code}`))));
  });
}

async function audioDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  const dur = parseFloat(stdout.trim());
  if (!Number.isFinite(dur) || dur <= 0) throw new Error(`Không đọc được độ dài ${file}`);
  return dur;
}

const round2 = (n) => Math.round(n * 100) / 100;
const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Nhạc nền drone trầm, tạo một lần bằng ffmpeg (không phụ thuộc bản quyền). */
async function ensureBgm() {
  if (fs.existsSync(BGM_TEMPLATE)) return BGM_TEMPLATE;
  fs.mkdirSync(path.dirname(BGM_TEMPLATE), { recursive: true });
  await execFileAsync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=f=55:d=200",
    "-f", "lavfi", "-i", "sine=f=82.41:d=200",
    "-f", "lavfi", "-i", "sine=f=110.3:d=200",
    "-f", "lavfi", "-i", "anoisesrc=d=200:c=brown:a=0.25:seed=7",
    "-filter_complex",
    // Âm lượng "thở" rất chậm (0,05–0,13 Hz) bằng biểu thức — tremolo không xuống dưới 0,1 Hz.
    "[0]volume='0.30*(0.72+0.28*sin(2*PI*0.07*t))':eval=frame[a];" +
      "[1]volume='0.16*(0.65+0.35*sin(2*PI*0.11*t+1.3))':eval=frame[b];" +
      "[2]volume='0.05*(0.55+0.45*sin(2*PI*0.05*t+2.1))':eval=frame[c];" +
      "[3]lowpass=f=320,highpass=f=40,volume='0.55*(0.7+0.3*sin(2*PI*0.13*t+0.4))':eval=frame[d];" +
      "[a][b][c][d]amix=inputs=4:normalize=0,afade=t=in:d=4,afade=t=out:st=194:d=6,alimiter=limit=0.7",
    "-ac", "1", "-ar", "44100", "-b:a", "96k", BGM_TEMPLATE,
  ]);
  return BGM_TEMPLATE;
}

/** Tiếng gió rít nền cho chế độ kinh dị: nhiễu hồng lọc dải, to nhỏ chậm rãi. */
async function ensureWind() {
  if (fs.existsSync(WIND_TEMPLATE)) return WIND_TEMPLATE;
  fs.mkdirSync(path.dirname(WIND_TEMPLATE), { recursive: true });
  await execFileAsync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "anoisesrc=d=200:c=pink:a=0.5:seed=11",
    "-f", "lavfi", "-i", "anoisesrc=d=200:c=white:a=0.2:seed=23",
    "-filter_complex",
    "[0]bandpass=f=420:width_type=h:w=380,volume='0.55*(0.35+0.65*pow(sin(2*PI*0.045*t),2))':eval=frame[a];" +
      "[1]bandpass=f=1900:width_type=h:w=700,volume='0.12*(0.2+0.8*pow(sin(2*PI*0.07*t+1.1),4))':eval=frame[b];" +
      "[a][b]amix=inputs=2:normalize=0,afade=t=in:d=3,afade=t=out:st=195:d=5,alimiter=limit=0.6",
    "-ac", "1", "-ar", "44100", "-b:a", "96k", WIND_TEMPLATE,
  ]);
  return WIND_TEMPLATE;
}

/**
 * Giọng ma mị: hạ tông ~14%, chậm lại, trầm hơn, rung nhẹ, vang như trong hang,
 * lồng thêm một lớp thì thầm (dải cao) lệch pha. Áp được cho mọi giọng TTS.
 */
async function eerifyVoice(file) {
  const tmp = file.replace(/\.mp3$/, ".eerie.mp3");
  await execFileAsync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", file,
    "-filter_complex",
    "[0]aresample=44100,asplit=2[v][w];" +
      "[v]asetrate=44100*0.86,aresample=44100,atempo=1.07,bass=g=5:f=110,lowpass=f=4200,vibrato=f=4.5:d=0.08," +
      "aecho=0.8:0.6:70|140|260:0.32|0.22|0.12[main];" +
      "[w]highpass=f=2500,asetrate=44100*0.93,aresample=44100,volume=0.22,adelay=35|35,aecho=0.6:0.5:180:0.3[wh];" +
      "[main][wh]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.9,loudnorm=I=-18:TP=-2:LRA=9",
    "-ar", "44100", "-b:a", "128k", tmp,
  ]);
  fs.renameSync(tmp, file);
}

/** Tiếng thì thầm cho hiệu ứng "ghost": chính câu đó đọc ngược, lọc cao, vang xa, rất nhỏ. */
async function makeWhisper(voFile, outFile) {
  await execFileAsync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", voFile,
    "-af", "areverse,highpass=f=1200,asetrate=44100*1.06,aresample=44100,aecho=0.7:0.6:220|410:0.4|0.25,volume=0.5,afade=t=in:d=0.3,afade=t=out:st=2.2:d=0.8,atrim=0:3",
    "-ar", "44100", "-b:a", "96k", outFile,
  ]);
}

/** Nhạc nền, tiếng gió (chế độ kinh dị) và tiếng động hiệu ứng trong thư mục video. */
async function ensureAudioAssets(dir, cfg) {
  const audioDir = path.join(dir, "assets", "audio");
  fs.mkdirSync(path.join(audioDir, "sfx"), { recursive: true });
  if (!fs.existsSync(path.join(audioDir, "bgm.mp3"))) fs.copyFileSync(await ensureBgm(), path.join(audioDir, "bgm.mp3"));
  if (cfg.vfx === "horror" && !fs.existsSync(path.join(audioDir, "wind.mp3"))) fs.copyFileSync(await ensureWind(), path.join(audioDir, "wind.mp3"));
  for (const name of new Set(["chime", "deep_boom", ...Object.values(FOLKLORE_FX).map((f) => f.sfx)])) {
    const src = path.join(SHARED_SFX, `${name}.mp3`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(audioDir, "sfx", `${name}.mp3`));
  }
}

function isEdgeVoice(voice) {
  return /Neural$/.test(voice || "");
}

async function synthLine({ text, voice, lang, outPath }) {
  // synthesizeAudio ép Edge chạy +15%; giọng kể dân gian cần đều và chậm hơn.
  if (isEdgeVoice(voice)) {
    try {
      return await synthesizeEdge({ text, voice, outPath, rate: "-4%" });
    } catch (err) {
      console.warn(`[TTS] Edge lỗi (${err.message}), thử bộ tổng hợp chung`);
    }
  }
  return synthesizeAudio({ text, voice, outPath, rate: "1.0", lang });
}

/** Tính mốc thời gian từ độ dài giọng thật của từng câu. */
export function computeFolkloreTiming(scenes, durations) {
  let t = LEAD_IN;
  const timed = scenes.map((sc, i) => {
    if (i > 0 && sc.shot !== scenes[i - 1].shot) t += SHOT_GAP - LINE_GAP;
    const start = round2(t);
    const duration = round2(durations[i]);
    t = start + duration + LINE_GAP;
    return { ...sc, index: i + 1, start, duration, voSrc: `assets/vo/line-${i + 1}.mp3` };
  });
  const total = Math.ceil((t - LINE_GAP + TAIL) * 10) / 10;
  const shotIds = [...new Set(timed.map((s) => s.shot))];
  const shotTimes = shotIds.map((id, i) => {
    const first = timed.find((s) => s.shot === id);
    const nextId = shotIds[i + 1];
    const next = nextId != null ? timed.find((s) => s.shot === nextId) : null;
    const start = i === 0 ? 0 : round2(first.start - (SHOT_GAP - LINE_GAP) / 2 - 0.15);
    return { id, start, end: next ? null : total };
  });
  shotTimes.forEach((s, i) => {
    if (s.end == null) s.end = shotTimes[i + 1].start;
  });
  return { timed, shotTimes, total };
}

async function synthAll({ dir, cfg, log }) {
  const voDir = path.join(dir, "assets", "vo");
  fs.mkdirSync(voDir, { recursive: true });
  for (const f of fs.readdirSync(voDir)) if (/^(line|whisper)-\d+\.mp3$/.test(f)) fs.unlinkSync(path.join(voDir, f));
  const eerie = cfg.voiceStyle === "eerie";
  const durations = [];
  for (let i = 0; i < cfg.scenes.length; i++) {
    const out = path.join(voDir, `line-${i + 1}.mp3`);
    log(`  [TTS ${i + 1}/${cfg.scenes.length}]${eerie ? " (ma mị)" : ""} ${cfg.scenes[i].line.slice(0, 60)}`);
    await synthLine({ text: cfg.scenes[i].line, voice: cfg.voice, lang: cfg.lang, outPath: out });
    if (eerie) await eerifyVoice(out);
    if (cfg.vfx === "horror" && cfg.scenes[i].fx === "ghost") await makeWhisper(out, path.join(voDir, `whisper-${i + 1}.mp3`));
    durations.push(await audioDuration(out));
  }
  return durations;
}

async function readDurations(dir, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(dir, "assets", "vo", `line-${i + 1}.mp3`);
    if (!fs.existsSync(file)) throw new Error(`Thiếu giọng câu ${i + 1} (${file}) — chạy tác vụ giọng đọc trước`);
    out.push(await audioDuration(file));
  }
  return out;
}

/** Ghi meta.json, spec.json và index.html từ cấu hình + độ dài giọng. */
function writeProject({ dir, slug, cfg, durations, meta }) {
  const { timed, shotTimes, total } = computeFolkloreTiming(cfg.scenes, durations);
  cfg.scenes = timed.map(({ voSrc, index, ...rest }) => rest);
  cfg.totalDuration = total;
  const metaOut = {
    ...(meta || {}),
    id: slug,
    name: cfg.topicTitle,
    type: "folklore",
    template: "folklore",
    lang: cfg.lang,
    createdAt: meta?.createdAt || new Date().toISOString(),
    duration: total,
    folkloreConfig: { ...cfg, slug },
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(metaOut, null, 2));
  fs.writeFileSync(
    path.join(dir, "spec.json"),
    JSON.stringify(
      {
        type: "folklore",
        slug,
        lang: cfg.lang,
        voice: cfg.voice,
        title: cfg.topicTitle,
        category: "folklore",
        message: `${cfg.topicTitle} — ${cfg.hook || ""}`,
        captions: cfg.scenes.map((s) => s.line),
        spoken: cfg.scenes.map((s) => s.line),
        folkloreConfig: metaOut.folkloreConfig,
      },
      null,
      2,
    ),
  );
  const whispers = new Set(timed.filter((s, i) => fs.existsSync(path.join(dir, "assets", "vo", `whisper-${i + 1}.mp3`))).map((s) => s.index));
  fs.writeFileSync(path.join(dir, "index.html"), generateFolkloreHtml({ slug, cfg, timed, shotTimes, total, whispers }), "utf8");
  return metaOut;
}

/** Dựng lại index.html + meta từ giọng đã có (sau khi sửa kịch bản hoặc tạo lại giọng). */
export async function rebuildFolkloreComposition(slug, { log = console.log } = {}) {
  const dir = path.join(REPO_ROOT, "videos", slug);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const cfg = meta.folkloreConfig;
  if (!cfg) throw new Error(`${slug} không phải video Tâm Linh Dân Gian`);
  const durations = await readDurations(dir, cfg.scenes.length);
  await ensureAudioAssets(dir, cfg);
  const out = writeProject({ dir, slug, cfg, durations, meta });
  log(`✓ Dựng lại composition ${slug}: ${cfg.scenes.length} câu, ${out.duration}s`);
  return { slug, root: out.duration };
}

/** Tạo lại toàn bộ giọng đọc rồi dựng lại composition (dùng cho scripts/generate-vo.mjs). */
export async function regenerateFolkloreVoice(slug, { log = console.log } = {}) {
  const dir = path.join(REPO_ROOT, "videos", slug);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const cfg = meta.folkloreConfig;
  log(`Tạo lại giọng đọc ${cfg.scenes.length} câu (${cfg.voice})...`);
  const durations = await synthAll({ dir, cfg, log });
  await ensureAudioAssets(dir, cfg);
  const out = writeProject({ dir, slug, cfg, durations, meta });
  log(`✓ Giọng đọc mới, tổng ${out.duration}s`);
  return { slug, root: out.duration };
}

/**
 * Tạo dự án video mới.
 * opts: { spec, slug, lang, render, imageEngine, imageTimeoutMin, prompt, targetDuration, voice, log }
 */
export async function createFolkloreVideo(opts = {}) {
  const log = opts.log ?? console.log;
  let cfg = opts.spec?.folkloreConfig || (opts.spec?.scenes ? opts.spec : null);
  const lang = cfg?.lang || opts.spec?.lang || opts.lang || "vi";
  const langMeta = FOLKLORE_LANG_META[lang] || FOLKLORE_LANG_META.vi;

  if (!cfg) {
    const prompt = opts.prompt || opts.spec?.prompt || opts.spec?.title || "";
    log(`[1/6] Viết kịch bản bằng AI: "${prompt || "chủ đề ngẫu nhiên"}" (${langMeta.name})...`);
    cfg = await generateFolkloreTopic({
      prompt, lang, voice: opts.voice || opts.spec?.voice,
      targetDuration: opts.targetDuration || opts.spec?.targetDuration,
      voiceStyle: opts.voiceStyle || opts.spec?.voiceStyle, vfx: opts.vfx || opts.spec?.vfx,
    });
  } else {
    cfg = normalizeFolkloreScript(cfg, {
      lang, voice: opts.voice || opts.spec?.voice || cfg.voice, targetDuration: cfg.targetDuration,
      voiceStyle: opts.voiceStyle || opts.spec?.voiceStyle || cfg.voiceStyle, vfx: opts.vfx || opts.spec?.vfx || cfg.vfx,
    });
    log(`[1/6] Dùng kịch bản đã duyệt: "${cfg.topicTitle}" (${cfg.scenes.length} câu, ${cfg.shots.length} shot)`);
  }
  cfg.voice = opts.voice || opts.spec?.voice || cfg.voice || langMeta.defaultVoice;

  const slug = String(opts.slug || opts.spec?.slug || cfg.slug || `folklore-${slugify(cfg.topicTitle)}-${lang}`)
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  cfg.slug = slug;
  const dir = path.join(REPO_ROOT, "videos", slug);
  for (const sub of ["assets/audio/sfx", "assets/images", "assets/vo", "scripts"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });

  log("[2/6] Nhạc nền & hiệu ứng...");
  fs.copyFileSync(await ensureBgm(), path.join(dir, "assets", "audio", "bgm.mp3"));
  await ensureAudioAssets(dir, cfg);

  log(`[3/6] Giọng đọc (${cfg.voice}${cfg.voiceStyle === "eerie" ? ", ma mị" : ""}) · hiệu ứng: ${cfg.vfx === "horror" ? `kinh dị, ${cfg.scenes.filter((s) => s.fx).length} câu có FX` : "nhẹ"}...`);
  const durations = await synthAll({ dir, cfg, log });

  // Ghi dự án ngay (ảnh tạm chưa có) để meta.json lưu được task Antigravity khi chờ.
  log("[4/6] Tạo tệp dự án...");
  let meta = writeProject({ dir, slug, cfg, durations, meta: null });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    name: slug, private: true, type: "module",
    scripts: {
      dev: "npx --yes hyperframes@0.7.58 preview",
      check: "npx --yes hyperframes@0.7.58 check",
      render: "npx --yes hyperframes@0.7.58 render --workers 4 --no-low-memory-mode",
    },
  }, null, 2));
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  }, null, 2));
  fs.writeFileSync(path.join(dir, "BRIEF.md"), `---\nlanguage: ${lang}\nmessage: ${cfg.hook || cfg.topicTitle}\n---\n\n# ${cfg.topicTitle}\n\nTâm Linh Dân Gian · ${cfg.scenes.length} câu · ${cfg.shots.length} shot · giọng ${cfg.voice}\n`);
  fs.writeFileSync(path.join(dir, "scripts", "generate-vo.mjs"), `#!/usr/bin/env node
// Tạo lại giọng đọc từ meta.json rồi dựng lại index.html theo độ dài giọng mới.
import { regenerateFolkloreVoice } from "../../../tools/create-folklore-video.mjs";
await regenerateFolkloreVoice(${JSON.stringify(slug)});
`);

  const timeoutMin = Number(opts.imageTimeoutMin || opts.spec?.imageTimeoutMin || 45);
  log(`[5/6] Ảnh ${cfg.shots.length} shot qua Antigravity (chờ tối đa ${timeoutMin} phút)...`);
  const { pending } = await ensureFolkloreImages({ dir, meta, timeoutMin, log });

  log(`✅ Đã tạo videos/${slug} (${meta.duration}s, ${cfg.scenes.length} câu, ${cfg.shots.length} shot)`);
  if ((opts.render ?? opts.spec?.render) && pending.length) {
    // Không render khi còn nền tạm: video chỉ xuất MP4 khi đủ ảnh Antigravity.
    log(`[6/6] Chưa render: còn ${pending.length} ảnh chờ Antigravity. Khi ảnh về, bấm "🎨 Ảnh Antigravity" (tự render tiếp).`);
  } else if (opts.render ?? opts.spec?.render) {
    log("[6/6] Render MP4...");
    await run("npm", ["run", "render", "--", "--workers", "4", "--no-low-memory-mode"], dir, log);
  } else {
    log("[6/6] Bỏ qua render (bấm Render trong Studio khi muốn xuất MP4)");
  }
  return { slug, dir, totalDuration: meta.duration, scenesCount: cfg.scenes.length, config: meta.folkloreConfig };
}

/** HTML HyperFrames cho một video folklore. Mọi chuyển động nằm trên một timeline GSAP đã dừng. */
export function generateFolkloreHtml({ slug, cfg, timed, shotTimes, total, whispers = new Set(), cinemaAudioHtml = null }) {
  const langMeta = FOLKLORE_LANG_META[cfg.lang] || FOLKLORE_LANG_META.vi;
  const font = langMeta.font;
  const fontParam = font.replace(/ /g, "+");
  const horror = cfg.vfx === "horror";
  const data = {
    lines: timed.map((s) => ({ start: s.start, end: round2(s.start + s.duration), shot: s.shot, fx: horror ? s.fx || null : null })),
    shots: shotTimes,
  };
  const shotImgs = shotTimes
    .map((s) => `      <img id="shot-${s.id}" class="shot" src="${shotImageRel(s.id)}" alt="">` +
      (horror ? `\n      <div id="echo-${s.id}" class="shot echo" style="background-image:url('${shotImageRel(s.id)}')"></div>` : ""))
    .join("\n");
  const captions = timed
    .map((s, i) => `      <div id="cap-${i + 1}" class="caption${horror && s.fx ? " cap-fx" : ""}">${escapeHtml(s.line)}</div>`)
    .join("\n");
  const vo = timed
    .map((s, i) => `    <audio id="vo-${i + 1}" class="clip" src="${s.voSrc}" data-start="${s.start}" data-duration="${s.duration}" data-track-index="${20 + (i % 2)}"></audio>`)
    .join("\n");

  // Tiếng động theo hiệu ứng, đặt đúng lúc câu bắt đầu.
  const sfx = [];
  if (horror) {
    timed.forEach((s, i) => {
      const fx = FOLKLORE_FX[s.fx];
      if (!fx) return;
      const name = fx.sfx;
      const at = (dt) => round2(Math.min(total - 0.2, s.start + dt));
      if (s.fx === "pulse") {
        [0, 0.55, 1.1, 1.65].forEach((dt, k) =>
          sfx.push({ id: `sfx-${i + 1}-${k}`, name, start: at(dt), dur: SFX_DURATION[name], vol: 0.55 }));
      } else {
        sfx.push({ id: `sfx-${i + 1}`, name, start: at(s.fx === "blackout" ? 0 : 0.05), dur: SFX_DURATION[name] || 1, vol: s.fx === "blackout" ? 0.45 : 0.32 });
      }
      if (whispers.has(s.index)) {
        sfx.push({ id: `whisper-${i + 1}`, src: `assets/vo/whisper-${i + 1}.mp3`, start: at(0.35), dur: 3, vol: 0.5 });
      }
    });
  }
  const sfxHtml = sfx
    .map((c, k) => `    <audio id="${c.id}" class="clip" src="${c.src || `assets/audio/sfx/${c.name}.mp3`}" data-start="${c.start}" data-duration="${round2(Math.min(c.dur, total - c.start))}" data-track-index="${50 + k}" data-volume="${c.vol}"></audio>`)
    .join("\n");
  const audioTrackMarkup = cinemaAudioHtml || `<audio id="bgm" class="clip" src="assets/audio/bgm.mp3" data-start="0" data-duration="${total}" data-media-start="0" data-track-index="30" data-volume="0.55"></audio>${horror ? `
    <audio id="wind" class="clip" src="assets/audio/wind.mp3" data-start="0" data-duration="${total}" data-media-start="0" data-track-index="31" data-volume="0.45"></audio>` : ""}
    <audio id="sfx-open" class="clip" src="assets/audio/sfx/chime.mp3" data-start="0.05" data-duration="2" data-track-index="10" data-volume="0.22"></audio>
    <audio id="sfx-close" class="clip" src="assets/audio/sfx/deep_boom.mp3" data-start="${round2(Math.max(0, total - 1.6))}" data-duration="1.6" data-track-index="11" data-volume="0.18"></audio>
${sfxHtml}`;

  // Hạt bụi lơ lửng: vị trí sinh bằng seed cố định để lần render nào cũng giống nhau.
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dust = horror
    ? Array.from({ length: 34 }, (_, k) => {
        const size = round2(2 + rnd() * 4);
        return `      <span id="dust-${k}" class="dust" style="left:${Math.round(rnd() * 1060)}px;top:${Math.round(880 + rnd() * 1000)}px;width:${size}px;height:${size}px;opacity:${round2(0.15 + rnd() * 0.45)}"></span>`;
      }).join("\n")
    : "";

  const horrorCss = horror ? `
    .fog { position: absolute; left: -320px; width: 1720px; height: 760px; pointer-events: none; mix-blend-mode: screen; }
    .fog.f1 { top: 1080px; opacity: 0.55; background: radial-gradient(ellipse at 28% 55%, rgba(170, 178, 200, 0.26), transparent 58%), radial-gradient(ellipse at 72% 40%, rgba(150, 160, 185, 0.2), transparent 55%); }
    .fog.f2 { top: 1360px; opacity: 0.45; background: radial-gradient(ellipse at 60% 50%, rgba(160, 168, 190, 0.24), transparent 60%), radial-gradient(ellipse at 15% 45%, rgba(140, 150, 175, 0.18), transparent 50%); }
    .dust { position: absolute; border-radius: 50%; background: rgba(236, 226, 205, 0.9); pointer-events: none; }
    .echo { opacity: 0; background-size: cover; background-position: center; mix-blend-mode: lighten; filter: grayscale(1) brightness(0.85) contrast(1.25) blur(2px); }
    .blackout { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
    .redvig { position: absolute; inset: 0; opacity: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 58%, transparent 38%, rgba(120, 0, 0, 0.72) 100%); }
    .glitchbars { position: absolute; left: 0; top: 840px; width: 1080px; height: 1080px; opacity: 0; pointer-events: none; mix-blend-mode: screen;
      background: repeating-linear-gradient(0deg, rgba(255, 0, 60, 0.35) 0 6px, transparent 6px 22px, rgba(0, 240, 255, 0.28) 22px 26px, transparent 26px 58px); }
    .cap-fx { color: #f3e3dc; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.9), 0 0 22px rgba(170, 20, 20, 0.55); }
    .grain { opacity: 0.12 !important; }` : "";

  const horrorLayers = horror ? `
    <div id="fog1" class="fog f1 clip" data-start="0" data-duration="${total}" data-track-index="40"></div>
    <div id="fog2" class="fog f2 clip" data-start="0" data-duration="${total}" data-track-index="41"></div>
    <div id="dustfield" class="clip" data-start="0" data-duration="${total}" data-track-index="42" style="position:absolute;inset:0;pointer-events:none">
${dust}
    </div>
    <div id="glitchbars" class="glitchbars clip" data-start="0" data-duration="${total}" data-track-index="43"></div>
    <div id="blackout" class="blackout clip" data-start="0" data-duration="${total}" data-track-index="44"></div>
    <div id="redvig" class="redvig clip" data-start="0" data-duration="${total}" data-track-index="45"></div>` : "";

  const horrorTimeline = horror ? `
    // --- Lớp kinh dị luôn chạy: sương trôi, bụi bay, vignette thở, đèn chập chờn ngẫu nhiên ---
    tl.fromTo("#fog1", { x: -140 }, { x: 140, duration: TOTAL_DURATION, ease: "none" }, 0);
    tl.fromTo("#fog2", { x: 160 }, { x: -120, duration: TOTAL_DURATION, ease: "none" }, 0);
    for (let t = 0; t < TOTAL_DURATION; t += 4) {
      tl.to("#fog1", { opacity: 0.35 + rnd() * 0.35, duration: 4, ease: "sine.inOut" }, t);
      tl.to("#fog2", { opacity: 0.3 + rnd() * 0.3, duration: 4, ease: "sine.inOut" }, t);
    }
    document.querySelectorAll(".dust").forEach((el) => {
      tl.fromTo(el, { y: 0, x: 0 }, { y: -80 - rnd() * 160, x: (rnd() - 0.5) * 90, duration: TOTAL_DURATION, ease: "none" }, 0);
    });
    for (let t = 5 + rnd() * 4; t < TOTAL_DURATION - 1; t += 7 + rnd() * 6) {
      tl.to("#stage", { opacity: 0.78, duration: 0.05 }, t);
      tl.to("#stage", { opacity: 1, duration: 0.07 }, t + 0.05);
    }

    // --- Hiệu ứng theo câu (AI đánh dấu ở những nhịp đáng sợ) ---
    const jitter = (sel, amp, t0, steps, step) => {
      for (let k = 0; k < steps; k++) tl.to(sel, { x: (rnd() - 0.5) * 2 * amp, y: (rnd() - 0.5) * 2 * amp, duration: step, ease: "none" }, t0 + k * step);
      tl.to(sel, { x: 0, y: 0, duration: step }, t0 + steps * step);
    };
    FOLKLORE.lines.forEach((l, i) => {
      const t = l.start;
      const cap = "#cap-" + (i + 1);
      if (l.fx === "flicker") {
        [0.12, 1, 0.04, 1, 0.3, 0.9, 0.05, 1].forEach((o, k) => tl.to("#stage", { opacity: o, duration: 0.06, ease: "none" }, t + k * 0.07));
        [0.2, 1, 0.1, 1].forEach((o, k) => tl.to("#glow", { opacity: o, duration: 0.08 }, t + k * 0.1));
      } else if (l.fx === "shake") {
        jitter("#stage", 16, t, 10, 0.045);
        jitter(cap, 6, t, 8, 0.05);
      } else if (l.fx === "glitch") {
        [0.7, 0, 0.5, 0, 0.8, 0].forEach((o, k) => tl.to("#glitchbars", { opacity: o, duration: 0.05, ease: "none" }, t + k * 0.06));
        tl.to("#stage", { filter: "hue-rotate(70deg) saturate(2.4) contrast(1.5)", duration: 0.04 }, t);
        tl.to("#stage", { filter: "none", duration: 0.04 }, t + 0.36);
        jitter("#stage", 22, t, 6, 0.06);
        jitter(cap, 10, t, 5, 0.06);
      } else if (l.fx === "ghost") {
        const echo = "#echo-" + l.shot;
        tl.fromTo(echo, { opacity: 0, x: 0, scale: 1.02 }, { opacity: 0.32, x: 46, scale: 1.08, duration: 0.8, ease: "power2.out" }, t);
        tl.to(echo, { opacity: 0.14, x: 70, duration: 1.2, ease: "sine.inOut" }, t + 0.8);
        tl.to(echo, { opacity: 0, x: 90, duration: 0.8, ease: "power1.in" }, t + 2.0);
      } else if (l.fx === "blackout") {
        tl.to("#blackout", { opacity: 1, duration: 0.04 }, t);
        tl.to("#blackout", { opacity: 0, duration: 0.7, ease: "power2.in" }, t + 0.55);
      } else if (l.fx === "pulse") {
        [0, 0.55, 1.1, 1.65].forEach((dt, k) => {
          tl.to("#redvig", { opacity: 0.85 - k * 0.1, duration: 0.09, ease: "power2.out" }, t + dt);
          tl.to("#redvig", { opacity: 0.12, duration: 0.4, ease: "power2.in" }, t + dt + 0.09);
          tl.to("#stage", { scale: 1.025, duration: 0.09 }, t + dt);
          tl.to("#stage", { scale: 1, duration: 0.35 }, t + dt + 0.09);
        });
        tl.to("#redvig", { opacity: 0, duration: 0.8 }, t + 2.2);
      }
    });` : "";

  return `<!DOCTYPE html>
<html lang="${cfg.lang || "vi"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920, initial-scale=1.0">
  <title>${escapeHtml(cfg.topicTitle)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${fontParam}:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 1080px; height: 1920px; overflow: hidden; background: #06070c; color: #efe9dc;
      font-family: '${font}', 'Be Vietnam Pro', sans-serif; }
    #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
    .sky { position: absolute; inset: 0; background: linear-gradient(180deg, #040509 0%, #0b0c15 38%, #12131f 52%, #12131f 100%); }
    .series { position: absolute; top: 150px; left: 0; width: 1080px; text-align: center; font-size: 26px;
      font-weight: 600; letter-spacing: 8px; color: rgba(239, 233, 220, 0.46); }
    .captions { position: absolute; top: 400px; left: 70px; width: 940px; height: 380px; }
    .caption { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      text-align: center; font-size: 50px; line-height: 1.42; font-weight: 600; opacity: 0;
      text-shadow: 0 2px 14px rgba(0, 0, 0, 0.85); }
    .stage { position: absolute; left: 0; top: 840px; width: 1080px; height: 1080px; overflow: hidden;
      -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 20%); mask-image: linear-gradient(180deg, transparent 0%, #000 20%); }
    .shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0;
      transform-origin: 50% 72%; }
    .glow { position: absolute; left: 140px; top: 1180px; width: 800px; height: 620px; border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(255, 170, 80, 0.16) 0%, rgba(255, 150, 60, 0.05) 45%, transparent 70%);
      mix-blend-mode: screen; opacity: 0.6; pointer-events: none; }
    .vignette { position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(ellipse at 50% 60%, transparent 55%, rgba(0, 0, 0, 0.55) 100%); }
    .grain { position: absolute; inset: 0; pointer-events: none; opacity: 0.05; mix-blend-mode: overlay;
      background-image: radial-gradient(rgba(255, 255, 255, 0.22) 1px, transparent 1px);
      background-size: 4px 4px; }${horrorCss}
  </style>
</head>
<body>
  <div id="root" data-composition-id="${slug}" data-start="0" data-width="1080" data-height="1920" data-duration="${total}">
    <div class="sky"></div>
    <div id="series" class="series clip" data-start="0" data-duration="${total}" data-track-index="1">${escapeHtml(cfg.seriesTitle || langMeta.seriesTitle)}</div>
    <div id="stage" class="stage clip" data-layout-allow-overflow data-start="0" data-duration="${total}" data-track-index="2">
${shotImgs}
    </div>
    <div id="glow" class="glow clip" data-start="0" data-duration="${total}" data-track-index="3"></div>${horrorLayers}
    <div id="captions" class="captions clip" data-start="0" data-duration="${total}" data-track-index="4">
${captions}
    </div>
    <div class="vignette"></div>
    <div class="grain"></div>

${audioTrackMarkup}
${vo}
  </div>

  <script>
    const FOLKLORE = ${JSON.stringify(data)};
    const TOTAL_DURATION = ${total};
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["${slug}"] = tl;
    tl.set({}, {}, TOTAL_DURATION);

    // Chuỗi giả ngẫu nhiên có seed — lần render nào cũng ra đúng một kết quả.
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    // Shot: mờ dần vào/ra và đẩy máy rất chậm, như ảnh tĩnh trong mẫu.
    FOLKLORE.shots.forEach((s, i) => {
      const el = "#shot-" + s.id;
      const fadeIn = i === 0 ? 1.2 : 0.9;
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: fadeIn, ease: "power1.inOut" }, s.start);
      tl.fromTo(el, { scale: 1.0 }, { scale: 1.045, duration: Math.max(0.5, s.end - s.start + 0.9), ease: "none" }, s.start);
      if (i < FOLKLORE.shots.length - 1) {
        tl.to(el, { opacity: 0, duration: 0.9, ease: "power1.inOut" }, FOLKLORE.shots[i + 1].start);
      } else {
        tl.to(el, { opacity: 0.25, duration: 1.4, ease: "power1.in" }, Math.max(s.start, TOTAL_DURATION - 1.4));
      }
    });

    // Phụ đề: mỗi câu hiện đúng lúc giọng đọc, tắt trước câu sau.
    FOLKLORE.lines.forEach((l, i) => {
      const el = "#cap-" + (i + 1);
      const next = FOLKLORE.lines[i + 1];
      const off = next ? Math.min(l.end + 0.15, next.start - 0.05) : Math.min(TOTAL_DURATION - 0.3, l.end + 0.9);
      tl.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power1.out" }, l.start);
      tl.to(el, { opacity: 0, duration: 0.18, ease: "power1.in" }, Math.max(l.start + 0.35, off));
    });

    // Ánh nến lung linh.
    for (let t = 0; t < TOTAL_DURATION; t += 0.35) {
      tl.to("#glow", { opacity: 0.42 + rnd() * 0.36, duration: 0.35, ease: "sine.inOut" }, t);
    }
${horrorTimeline}
  </script>
</body>
</html>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const opt = (name, dflt) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : dflt);
  const valued = new Set(["--lang", "--duration", "--rebuild", "--engine", "--voice", "--voice-style", "--vfx"]);
  const words = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
  const done = (p) => p.then(() => process.exit(0)).catch((err) => { console.error(`❌ ${err.message}`); process.exit(1); });
  if (argv.includes("--rebuild")) {
    done(rebuildFolkloreComposition(opt("rebuild")));
  } else {
    const lang = opt("lang", "vi");
    let prompt = words.join(" ");
    if (!prompt) {
      const pool = FALLBACK_FOLKLORE_TOPICS[lang] || FALLBACK_FOLKLORE_TOPICS.vi;
      prompt = pool[Math.floor(Math.random() * pool.length)].prompt;
    }
    done(createFolkloreVideo({
      prompt, lang, voice: opt("voice"), targetDuration: Number(opt("duration", 70)),
      render: argv.includes("--render"),
      voiceStyle: opt("voice-style", "eerie"), vfx: opt("vfx", "horror"),
    }));
  }
}

export { buildShotPrompt };
