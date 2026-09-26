// Engine "survival" (Studio template "Sinh Tồn"): cấp độ leo thang, thanh chỉ số sinh học, mặt meme
// Mr. Incredible biến dạng dần. Cảnh 1 = mở đầu (hook), cảnh cuối = kết/CTA, các cảnh giữa = cấp độ 1…L
// (số cấp theo số cảnh, không cố định 10). Chữ lấy từ kịch bản Matrix + extras; không TTS/ảnh AI mới.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSurvivalConfig } from "../../../tools/survival-languages.mjs";
import { escapeHtml, shortText, STRING, INTEGER } from "./common.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FACE_SOURCE_DIR = ["shared", "assets", "survival", "mrincredible"];
// phase-10 của template là hình treo cổ — không dùng cho nội dung Matrix (rủi ro chính sách TikTok).
const FACE_PHASES = 9;
const FONT_DIR = ["tools", "template-kinetic", "assets"];
const METRIC_COUNT = 3;
const LIMITS = { eyebrow: 36, metricLabel: 20, label: 48, status: 24 };

const UI = {
  en: { metrics: ["HEALTH", "ENERGY", "SANITY"], status: ["SAFE", "STRAINED", "DANGER", "CRITICAL", "FATAL"], eyebrow: "SURVIVAL LEVELS", severity: "SEVERITY" },
  vi: { metrics: ["SỨC KHỎE", "NĂNG LƯỢNG", "TINH THẦN"], status: ["AN TOÀN", "CĂNG THẲNG", "NGUY HIỂM", "NGUY KỊCH", "TỬ VONG"], eyebrow: "CÁC CẤP SINH TỒN", severity: "MỨC ĐỘ" },
  de: { metrics: ["GESUNDHEIT", "ENERGIE", "VERSTAND"], status: ["SICHER", "BELASTET", "GEFAHR", "KRITISCH", "TÖDLICH"], eyebrow: "ÜBERLEBENSSTUFEN", severity: "SCHWEREGRAD" },
  fr: { metrics: ["SANTÉ", "ÉNERGIE", "MENTAL"], status: ["SÛR", "TENDU", "DANGER", "CRITIQUE", "FATAL"], eyebrow: "NIVEAUX DE SURVIE", severity: "GRAVITÉ" },
  es: { metrics: ["SALUD", "ENERGÍA", "CORDURA"], status: ["SEGURO", "TENSO", "PELIGRO", "CRÍTICO", "FATAL"], eyebrow: "NIVELES DE SUPERVIVENCIA", severity: "GRAVEDAD" },
  ja: { metrics: ["体力", "エネルギー", "精神"], status: ["安全", "負荷", "危険", "重篤", "致命的"], eyebrow: "生存レベル", severity: "深刻度" },
  ko: { metrics: ["건강", "에너지", "정신력"], status: ["안전", "긴장", "위험", "위독", "치명적"], eyebrow: "생존 단계", severity: "심각도" },
};
const LEVEL_WORDS = { es: { levelPrefix: "NIVEL", prologueTag: "PRÓLOGO", finalTag: "FINAL", reactionLabel: "REACCIÓN" } };

function ui(lang) {
  return UI[lang] || UI.en;
}

function labels(lang) {
  const base = getSurvivalConfig(lang);
  const known = base.lang === lang;
  const extra = LEVEL_WORDS[lang] || {};
  return {
    levelPrefix: extra.levelPrefix || (known ? base.levelPrefix : "LEVEL"),
    prologueTag: extra.prologueTag || (known ? base.prologueTag : "PROLOGUE"),
    finalTag: extra.finalTag || (known ? base.finalTag : "FINAL"),
    reactionLabel: extra.reactionLabel || (known ? base.reactionLabel : "REACTION: UNCANNY METER"),
  };
}

/** Vai trò mỗi cảnh: hook đầu, outro cuối (khi đủ ≥3 cảnh), còn lại là cấp độ. */
export function sceneRoles(count) {
  return Array.from({ length: count }, (_, i) => (count >= 3 && i === 0 ? "prologue" : count >= 3 && i === count - 1 ? "outro" : "level"));
}

function clean(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function statusFor(severity, lang) {
  const words = ui(lang).status;
  return words[Math.min(words.length - 1, Math.floor((severity - 1) / 2))];
}

/** Mức độ 1–10 → mặt meme 1–9. */
export function facePhase(severity) {
  return 1 + Math.round(((Math.min(10, Math.max(1, severity)) - 1) * (FACE_PHASES - 1)) / 9);
}

const SEVERITY_COLORS = ["#00FF88", "#00FF88", "#00F0FF", "#FFB800", "#FF7700", "#FF5500", "#FF003C", "#FF003C", "#E11D48", "#B56CFF"];
function severityColor(severity) {
  return SEVERITY_COLORS[Math.min(10, Math.max(1, severity)) - 1];
}

function levelLabelFromLine(line) {
  const text = clean(line).replace(/^[^:：]{1,24}\d+\s*[:：]\s*/u, "");
  const clause = text.split(/(?<=[.!?。！？])\s|[,;:，；：—–]\s/u)[0] || text;
  return shortText(clause.replace(/[.!?。！？]+$/u, ""), LIMITS.label);
}

function schema(sceneCount) {
  return {
    type: "OBJECT",
    properties: {
      eyebrow: STRING,
      metric_labels: { type: "ARRAY", minItems: METRIC_COUNT, maxItems: METRIC_COUNT, items: STRING },
      levels: {
        type: "ARRAY",
        minItems: sceneCount,
        maxItems: sceneCount,
        items: {
          type: "OBJECT",
          properties: {
            label: STRING,
            status: STRING,
            severity: INTEGER,
            metrics: { type: "ARRAY", minItems: METRIC_COUNT, maxItems: METRIC_COUNT, items: INTEGER },
          },
          required: ["label", "status", "severity", "metrics"],
        },
      },
    },
    required: ["eyebrow", "metric_labels", "levels"],
  };
}

function prompt({ script, topic, language }) {
  const scenes = script?.scenes || [];
  const roles = sceneRoles(scenes.length);
  let level = 0;
  const listing = scenes.map((scene, i) => {
    const tag = roles[i] === "level" ? `LEVEL ${++level}` : roles[i].toUpperCase();
    return `${i + 1}. [${tag}] ${clean(scene.line)} (visual: ${clean(scene.visual_intent)})`;
  }).join("\n");
  return `Topic: ${topic || script?.title || ""}
The video is an escalating "survival levels" countdown: each level is worse than the last, shown with biological status bars and a meme face that gets darker as severity rises.
Narration (fixed, do NOT rewrite it), one entry per scene:
${listing}

Return JSON with:
- "eyebrow": short series label for the header (max ${LIMITS.eyebrow} characters, uppercase).
- "metric_labels": exactly ${METRIC_COUNT} short status-bar names that fit the topic (body/biological vital signs such as oxygen, body heat, hydration, sanity; max ${LIMITS.metricLabel} characters each). Same three bars for the whole video.
- "levels": exactly ${scenes.length} items, one per scene in order, each with:
  - "label": the on-screen headline for that scene (max ${LIMITS.label} characters, a compact noun phrase, not the full narration),
  - "status": one or two words verdict (max ${LIMITS.status} characters, e.g. "STABLE", "CRITICAL"),
  - "severity": integer 1–10; for LEVEL scenes it must never decrease from one level to the next (escalation), the first level low, the last level 9 or 10,
  - "metrics": ${METRIC_COUNT} integers 0–100 (current value of each status bar; they should drop as danger rises).
For PROLOGUE use severity 1 and healthy metrics; for OUTRO repeat the last level's severity and metrics.
All on-screen text in the video language (${language}). No markup, no emoji.`;
}

function validate(data, scenes) {
  const errors = [];
  const count = scenes?.length || 0;
  const textProblem = (value, max, name) => {
    const text = clean(value);
    if (!text) return `${name} is empty`;
    if (text.length > max) return `${name} must be at most ${max} characters (got ${text.length})`;
    if (/[<>]/u.test(text)) return `${name} must not contain markup`;
    return null;
  };
  if (!data || typeof data !== "object") return ["response must be an object"];
  const eyebrow = textProblem(data.eyebrow, LIMITS.eyebrow, "eyebrow");
  if (eyebrow) errors.push(eyebrow);
  if (!Array.isArray(data.metric_labels) || data.metric_labels.length !== METRIC_COUNT) {
    errors.push(`metric_labels must have exactly ${METRIC_COUNT} items`);
  } else {
    data.metric_labels.forEach((label, i) => {
      const problem = textProblem(label, LIMITS.metricLabel, `metric_labels[${i}]`);
      if (problem) errors.push(problem);
    });
  }
  if (!Array.isArray(data.levels) || data.levels.length !== count) {
    errors.push(`levels must have exactly ${count} items (one per scene, got ${Array.isArray(data.levels) ? data.levels.length : "none"})`);
    return errors;
  }
  const roles = sceneRoles(count);
  let previous = null;
  data.levels.forEach((level, i) => {
    const name = `levels[${i}]`;
    if (!level || typeof level !== "object") {
      errors.push(`${name} must be an object`);
      return;
    }
    for (const [key, max] of [["label", LIMITS.label], ["status", LIMITS.status]]) {
      const problem = textProblem(level[key], max, `${name}.${key}`);
      if (problem) errors.push(problem);
    }
    if (!Number.isInteger(level.severity) || level.severity < 1 || level.severity > 10) errors.push(`${name}.severity must be an integer 1-10`);
    if (!Array.isArray(level.metrics) || level.metrics.length !== METRIC_COUNT
      || level.metrics.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
      errors.push(`${name}.metrics must be ${METRIC_COUNT} integers 0-100`);
    }
    if (roles[i] === "level" && Number.isInteger(level.severity)) {
      if (previous !== null && level.severity < previous) errors.push(`${name}.severity ${level.severity} must not be lower than the previous level (${previous})`);
      previous = level.severity;
    }
  });
  return errors;
}

function fallback(scenes, { title, language } = {}) {
  const lang = language || "vi";
  const words = ui(lang);
  const count = scenes?.length || 0;
  const roles = sceneRoles(count);
  const levelTotal = roles.filter((role) => role === "level").length;
  let k = -1;
  let last = null;
  const levels = (scenes || []).map((scene, i) => {
    if (roles[i] === "prologue") {
      return { label: levelLabelFromLine(scene.line) || shortText(clean(title), LIMITS.label), status: statusFor(1, lang), severity: 1, metrics: [100, 100, 98] };
    }
    if (roles[i] === "outro" && last) return { ...last, label: levelLabelFromLine(scene.line) || last.label, metrics: [...last.metrics] };
    k += 1;
    const t = levelTotal > 1 ? k / (levelTotal - 1) : 0.5;
    const severity = levelTotal > 1 ? 1 + Math.round(t * 9) : 5;
    const clamp = (value) => Math.max(3, Math.min(100, Math.round(value)));
    last = {
      label: levelLabelFromLine(scene.line) || `${labels(lang).levelPrefix} ${k + 1}`,
      status: statusFor(severity, lang),
      severity,
      metrics: [clamp(96 - t * 88), clamp(92 - t * 72 - (k % 2) * 4), clamp(90 - t * 86)],
    };
    return last;
  });
  return { eyebrow: shortText(words.eyebrow, LIMITS.eyebrow), metric_labels: [...words.metrics], levels };
}

async function prepareAssets({ targetDir, compareDir = COMPARE_DIR }) {
  const sourceDir = path.join(compareDir, ...FACE_SOURCE_DIR);
  const destDir = path.join(targetDir, "assets", "mrincredible");
  await fs.mkdir(destDir, { recursive: true });
  const copied = [];
  for (let phase = 1; phase <= FACE_PHASES; phase += 1) {
    const source = path.join(sourceDir, `phase-${phase}.png`);
    const stat = await fs.stat(source).catch(() => null);
    if (!stat?.isFile() || !stat.size) throw new Error(`survival meme face is missing: ${source}`);
    const dest = path.join(destDir, `phase-${phase}.png`);
    await fs.copyFile(source, dest);
    copied.push(dest);
  }
  return copied;
}

async function fontCss(compareDir = COMPARE_DIR) {
  const dir = path.join(compareDir, ...FONT_DIR);
  const css = await fs.readFile(path.join(dir, "fonts.css"), "utf8");
  const files = [...new Set([...css.matchAll(/url\(([^)]+)\)/gu)].map((match) => match[1]))];
  const data = Object.fromEntries(await Promise.all(files.map(async (file) => [file, (await fs.readFile(path.join(dir, file))).toString("base64")])));
  return css.replace(/url\(([^)]+)\)/gu, (_, file) => `url(data:font/woff2;base64,${data[file]})`);
}

const json = (value) => JSON.stringify(value).replace(/</gu, "\\u003c");
const round = (value) => Number(value.toFixed(3));

function cleanLevel(level, fallbackLevel) {
  const pick = level && typeof level === "object" ? level : fallbackLevel;
  const severity = Number.isInteger(pick.severity) ? Math.min(10, Math.max(1, pick.severity)) : fallbackLevel.severity;
  const metrics = Array.from({ length: METRIC_COUNT }, (_, i) => {
    const value = Number(pick.metrics?.[i]);
    return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fallbackLevel.metrics[i];
  });
  return {
    label: shortText(clean(pick.label) || fallbackLevel.label, LIMITS.label),
    status: shortText(clean(pick.status) || fallbackLevel.status, LIMITS.status),
    severity,
    metrics,
  };
}

async function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, bgmSegments = [], common, scenes } = ctx;
  if (!scenes?.length) throw new Error("survival needs at least one scene");
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) throw new Error("survival needs a positive totalDuration");
  const derived = fallback(scenes, { title, language: lang });
  const extras = ctx.extras && typeof ctx.extras === "object" ? ctx.extras : derived;
  const words = labels(lang);
  const roles = sceneRoles(scenes.length);
  const levelTotal = roles.filter((role) => role === "level").length;
  const metricLabels = Array.from({ length: METRIC_COUNT }, (_, i) => shortText(clean(extras.metric_labels?.[i]) || derived.metric_labels[i], LIMITS.metricLabel));
  const eyebrow = shortText(clean(extras.eyebrow) || derived.eyebrow, LIMITS.eyebrow);

  let levelNo = 0;
  const sections = scenes.map((scene, i) => {
    if (!Number.isFinite(scene.start) || !Number.isFinite(scene.duration) || scene.duration <= 0 || scene.start < 0) {
      throw new Error(`survival scene ${i + 1} has no measured timing`);
    }
    const begin = i === 0 ? 0 : scene.start;
    const end = i + 1 < scenes.length ? scenes[i + 1].start : totalDuration;
    if (!(end > begin) || scene.start + scene.duration > totalDuration + 0.01) throw new Error(`survival scene ${i + 1} timing overlaps or exceeds the video`);
    const role = roles[i];
    if (role === "level") levelNo += 1;
    const level = cleanLevel(extras.levels?.[i], derived.levels[i]);
    const tag = role === "prologue" ? words.prologueTag : role === "outro" ? words.finalTag : `${words.levelPrefix} ${levelNo}/${levelTotal}`;
    const progress = role === "prologue" ? 0.04 : role === "outro" ? 1 : levelNo / Math.max(1, levelTotal);
    return { ...scene, role, begin: round(begin), end: round(end), level, tag, progress, phase: facePhase(level.severity), color: severityColor(level.severity) };
  });

  const sectionHtml = sections.map((s, i) => `
      <section id="sec-${i}" class="sec clip" data-start="${s.begin}" data-duration="${round(s.end - s.begin)}" data-track-index="3" data-role="${s.role}">
        <div class="sec-glow" style="background:radial-gradient(circle, ${s.color}44 0%, transparent 70%)"></div>
        <div class="tier-tag" style="color:${s.color}"><span class="fit" data-fit-w="240" data-fit-h="44" data-fit-min="14">${escapeHtml(s.tag)}</span></div>
        <div class="scanner-card" style="border-color:${s.color}66">
          <div class="corner corner-tl"></div><div class="corner corner-tr"></div><div class="corner corner-bl"></div><div class="corner corner-br"></div>
          <div class="card-head">
            <div class="level-chip" style="background:${s.color}"><span class="fit" data-fit-w="420" data-fit-h="46" data-fit-min="16">${escapeHtml(s.tag)}</span></div>
            <div class="status-badge" style="border-color:${s.color};color:${s.color};box-shadow:0 0 26px ${s.color}55"><span class="fit" data-fit-w="330" data-fit-h="46" data-fit-min="16">${escapeHtml(s.level.status)}</span></div>
          </div>
          <div class="label-box"><h2 class="level-label fit" data-fit-w="880" data-fit-h="190" data-fit-min="26">${escapeHtml(s.level.label)}</h2></div>
          <div class="metrics">
            ${s.level.metrics.map((value, m) => `<div class="metric">
              <div class="metric-row"><span class="metric-name fit" data-fit-w="700" data-fit-h="40" data-fit-min="14">${escapeHtml(metricLabels[m])}</span><span class="metric-value">${value}%</span></div>
              <div class="bar-track"><div class="bar-fill" id="bar-${i}-${m}" style="width:${Math.max(0.5, value)}%;background:${barColor(value)}"></div></div>
            </div>`).join("\n            ")}
          </div>
        </div>
        <div class="meme-card">
          <div class="severity-panel">
            <div class="severity-name fit" data-fit-w="340" data-fit-h="36" data-fit-min="12">${escapeHtml(ui(lang).severity)}</div>
            <div class="severity-value" style="color:${s.color}">${s.level.severity}<span class="severity-max">/10</span></div>
            <div class="pips">${Array.from({ length: 10 }, (_, p) => `<span class="pip" style="background:${p < s.level.severity ? severityColor(p + 1) : "rgba(255,255,255,0.1)"}"></span>`).join("")}</div>
          </div>
          <img class="meme-img" id="face-${i}" src="assets/mrincredible/phase-${s.phase}.png" alt="">
          <div class="meme-badge"><span class="fit" data-fit-w="340" data-fit-h="30" data-fit-min="12">${escapeHtml(words.reactionLabel)}</span></div>
        </div>
        <div class="caption-zone"><p class="caption fit" data-fit-w="960" data-fit-h="176" data-fit-min="22">${escapeHtml(s.line)}</p></div>
      </section>`).join("");

  const voHtml = sections.map((s) => `      <audio id="vo-${s.index}" class="clip" src="${escapeHtml(s.voSrc)}" data-start="${round(s.start)}" data-duration="${round(s.duration)}" data-track-index="20"></audio>`).join("\n");
  const bgmHtml = bgmSegments.length ? "" : `      <audio id="bgm" class="clip" src="assets/audio/bgm.mp3" data-start="0" data-duration="${totalDuration}" data-track-index="30" data-volume="0.14"></audio>`;
  const timeline = sections.map((s, i) => ({
    begin: s.begin, end: s.end, progress: s.progress, severity: s.level.severity,
    metrics: s.level.metrics, prev: i ? sections[i - 1].level.metrics : [0, 0, 0],
  }));

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1920">
    <title>${common.topicTitle} — Survival Levels</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${await fontCss()}
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { width: 1080px; height: 1920px; background: #07090E; color: #F0F6FC; font-family: "Be Vietnam Pro", -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif; overflow: hidden; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: radial-gradient(circle at 50% 30%, #111827 0%, #07090E 80%); }
      .cyber-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(0,240,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.04) 1px, transparent 1px); background-size: 60px 60px; }
      .vignette { position: absolute; inset: 0; box-shadow: inset 0 0 160px rgba(0,0,0,0.95); }
      #shake { position: absolute; inset: 0; will-change: transform; }
      .fit { overflow-wrap: anywhere; hyphens: auto; }
      .header { position: absolute; top: 56px; left: 60px; width: 960px; height: 270px; }
      .eyebrow { position: absolute; top: 0; left: 50%; transform: translateX(-50%); max-width: 960px; height: 50px; display: flex; align-items: center; gap: 12px; padding: 0 24px; border-radius: 999px; background: rgba(0,240,255,0.12); border: 1px solid rgba(0,240,255,0.35); font: 700 20px "JetBrains Mono", monospace; letter-spacing: 2px; color: #00F0FF; white-space: nowrap; }
      .pulse-dot { width: 10px; height: 10px; border-radius: 50%; background: #00F0FF; box-shadow: 0 0 10px #00F0FF; flex: none; }
      .title-box { position: absolute; top: 66px; left: 0; width: 960px; height: 136px; display: flex; align-items: center; justify-content: center; }
      .main-title { width: 960px; font-size: 54px; line-height: 1.18; font-weight: 900; text-align: center; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 0 30px rgba(0,240,255,0.35); }
      .meter-track { position: absolute; top: 230px; left: 0; width: 690px; height: 12px; background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; }
      #meter-fill { width: 100%; height: 100%; background: linear-gradient(90deg, #00F0FF, #FF003C); transform-origin: left center; transform: scaleX(0.04); }
      .sec { position: absolute; inset: 0; opacity: 0; visibility: hidden; }
      .sec-glow { position: absolute; left: 90px; top: 380px; width: 900px; height: 900px; border-radius: 50%; filter: blur(80px); }
      .tier-tag { position: absolute; top: 268px; left: 780px; width: 240px; height: 44px; display: flex; align-items: center; justify-content: flex-end; text-align: right; font: 700 26px "JetBrains Mono", monospace; letter-spacing: 1px; }
      .scanner-card { position: absolute; top: 350px; left: 60px; width: 960px; height: 720px; padding: 36px 40px; background: #0E131F; border: 2px solid rgba(0,240,255,0.25); border-radius: 36px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); display: flex; flex-direction: column; }
      .corner { position: absolute; width: 24px; height: 24px; border-color: #00F0FF; }
      .corner-tl { top: 14px; left: 14px; border-top: 3px solid; border-left: 3px solid; }
      .corner-tr { top: 14px; right: 14px; border-top: 3px solid; border-right: 3px solid; }
      .corner-bl { bottom: 14px; left: 14px; border-bottom: 3px solid; border-left: 3px solid; }
      .corner-br { bottom: 14px; right: 14px; border-bottom: 3px solid; border-right: 3px solid; }
      .card-head { height: 70px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
      .level-chip { height: 64px; max-width: 460px; padding: 0 22px; border-radius: 16px; display: flex; align-items: center; color: #07090E; font: 700 30px "JetBrains Mono", monospace; letter-spacing: 1px; white-space: nowrap; }
      .status-badge { height: 64px; max-width: 380px; padding: 0 24px; border: 2px solid; border-radius: 16px; display: flex; align-items: center; background: rgba(0,0,0,0.55); font: 700 30px "JetBrains Mono", monospace; letter-spacing: 1px; white-space: nowrap; }
      .label-box { height: 220px; margin-top: 18px; display: flex; align-items: center; }
      .level-label { width: 880px; font-size: 68px; line-height: 1.12; font-weight: 900; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
      .metrics { margin-top: 18px; display: flex; flex-direction: column; gap: 22px; }
      .metric { height: 94px; display: flex; flex-direction: column; justify-content: space-between; }
      .metric-row { height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
      .metric-name { width: 700px; font: 700 28px "JetBrains Mono", monospace; letter-spacing: 1px; color: #C9D1D9; white-space: nowrap; }
      .metric-value { font: 700 32px "JetBrains Mono", monospace; color: #FFFFFF; }
      .bar-track { height: 26px; border-radius: 13px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); overflow: hidden; }
      .bar-fill { height: 100%; border-radius: 13px; transform-origin: left center; box-shadow: 0 0 14px rgba(255,255,255,0.25); }
      .meme-card { position: absolute; top: 1100px; left: 60px; width: 960px; height: 520px; background: #0B0E14; border: 2px solid rgba(255,255,255,0.15); border-radius: 36px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.7); }
      .meme-img { position: absolute; top: 0; right: 0; width: 520px; height: 520px; object-fit: cover; object-position: 50% 35%; }
      .severity-panel { position: absolute; top: 96px; left: 36px; width: 360px; height: 390px; display: flex; flex-direction: column; justify-content: flex-start; gap: 18px; }
      .severity-name { width: 340px; font: 700 26px "JetBrains Mono", monospace; letter-spacing: 2px; color: #8B949E; white-space: nowrap; }
      .severity-value { height: 200px; font: 900 190px/1 "Be Vietnam Pro", sans-serif; letter-spacing: -6px; }
      .severity-max { font-size: 64px; letter-spacing: 0; color: #8B949E; }
      .pips { display: flex; gap: 8px; }
      .pip { width: 26px; height: 40px; border-radius: 6px; }
      .meme-badge { position: absolute; top: 22px; left: 22px; max-width: 380px; height: 44px; padding: 0 18px; display: flex; align-items: center; background: rgba(0,0,0,0.78); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font: 700 20px "JetBrains Mono", monospace; color: #FFFFFF; letter-spacing: 1px; white-space: nowrap; }
      .caption-zone { position: absolute; top: 1648px; left: 60px; width: 960px; height: 180px; display: flex; align-items: center; justify-content: center; }
      .caption { width: 960px; font-size: 44px; line-height: 1.3; font-weight: 900; text-align: center; color: #FFFFFF; text-shadow: 0 4px 16px rgba(0,0,0,0.9), 0 0 20px rgba(0,240,255,0.35); }
      .watermark { position: absolute; top: 1852px; left: 60px; width: 960px; height: 36px; text-align: center; font: 700 20px "JetBrains Mono", monospace; color: #8B949E; letter-spacing: 2px; white-space: nowrap; overflow: hidden; }
      #fit-measure { position: absolute; left: 0; top: 0; visibility: hidden; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${escapeHtml(slug)}" data-start="0" data-duration="${totalDuration}" data-width="1080" data-height="1920" data-template="survival-levels-v1">
      <div class="cyber-grid"></div>
      <div id="shake">
        <header class="header">
          <div class="eyebrow"><span class="pulse-dot"></span><span class="fit" data-fit-w="880" data-fit-h="30" data-fit-min="12">${escapeHtml(eyebrow)}</span></div>
          <div class="title-box"><h1 class="main-title fit" data-fit-w="960" data-fit-h="136" data-fit-min="24">${common.topicTitle}</h1></div>
          <div class="meter-track"><div id="meter-fill"></div></div>
        </header>
${sectionHtml}
        <div class="watermark">${common.watermark}</div>
      </div>
      <div class="vignette"></div>
${cinemaAudioHtml || ""}
${bgmHtml}
${voHtml}
    </div>
    <script>
      // Co chữ một lần khi dựng (và sau khi font tải): đo bản sao trong khung ẩn có kích thước cố định,
      // nên không phụ thuộc cảnh nào đang hiện. Không chạy lại khi seek.
      (function () {
        function fitAll() {
          var measure = document.createElement("div");
          measure.id = "fit-measure";
          document.body.appendChild(measure);
          document.querySelectorAll(".fit").forEach(function (el) {
            var w = Number(el.dataset.fitW), h = Number(el.dataset.fitH), min = Number(el.dataset.fitMin || 14);
            el.style.fontSize = "";
            var size = parseFloat(getComputedStyle(el).fontSize);
            var probe = el.cloneNode(true);
            probe.removeAttribute("id");
            probe.style.display = "block";
            probe.style.width = w + "px";
            probe.style.maxWidth = "none";
            probe.style.whiteSpace = getComputedStyle(el).whiteSpace;
            probe.style.fontSize = size + "px";
            measure.appendChild(probe);
            while (size > min && (probe.scrollHeight > h + 1 || probe.scrollWidth > w + 1)) {
              size -= 1;
              probe.style.fontSize = size + "px";
            }
            el.style.fontSize = size + "px";
            measure.removeChild(probe);
          });
          document.body.removeChild(measure);
        }
        fitAll();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
      })();

      const SECTIONS = ${json(timeline)};
      const tl = gsap.timeline({ paused: true });
      tl.set(".sec", { autoAlpha: 0 }, 0);
      SECTIONS.forEach(function (s, i) {
        const sec = "#sec-" + i;
        const span = s.end - s.begin;
        const enter = Math.min(0.4, span * 0.2);
        tl.set(sec, { autoAlpha: 1 }, s.begin);
        tl.fromTo(sec + " .scanner-card", { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: enter, ease: "back.out(1.4)", immediateRender: false }, s.begin);
        tl.fromTo("#face-" + i, { scale: 1.12, opacity: 0 }, { scale: 1, opacity: 1, duration: enter, ease: "power2.out", immediateRender: false }, s.begin);
        tl.fromTo(sec + " .caption", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: enter, ease: "power2.out", immediateRender: false }, s.begin + enter * 0.4);
        s.metrics.forEach(function (value, m) {
          const from = Math.max(0.005, s.prev[m] / Math.max(1, value));
          tl.fromTo("#bar-" + i + "-" + m, { scaleX: Math.min(from, 3) }, { scaleX: 1, duration: Math.min(0.9, span * 0.35), ease: "power2.out", immediateRender: false }, s.begin + enter * 0.5);
        });
        tl.to("#meter-fill", { scaleX: s.progress, duration: Math.min(0.4, span * 0.2), ease: "power2.out" }, s.begin);
        if (i > 0 && s.severity >= 4) {
          const amp = 4 + s.severity * 1.2;
          tl.to("#shake", { x: -amp, y: amp * 0.5, duration: 0.05 }, s.begin);
          tl.to("#shake", { x: amp * 0.8, y: -amp * 0.4, duration: 0.05 }, s.begin + 0.05);
          tl.to("#shake", { x: -amp * 0.4, y: amp * 0.25, duration: 0.05 }, s.begin + 0.1);
          tl.to("#shake", { x: 0, y: 0, duration: 0.05 }, s.begin + 0.15);
        }
        if (i < SECTIONS.length - 1) tl.set(sec, { autoAlpha: 0 }, s.end);
      });
      tl.set({}, {}, ${totalDuration});
      window.__timelines = window.__timelines || {};
      window.__timelines[${json(slug)}] = tl;
    </script>
  </body>
</html>
`;
  const cfg = {
    lang,
    title: clean(title),
    eyebrow,
    metricLabels,
    faceSource: FACE_SOURCE_DIR.join("/"),
    levels: sections.map((s) => ({
      index: s.index, role: s.role, tag: s.tag, start: s.start, duration: s.duration, label: s.level.label,
      status: s.level.status, severity: s.level.severity, metrics: s.level.metrics, face: `assets/mrincredible/phase-${s.phase}.png`, voSrc: s.voSrc,
    })),
  };
  return { html, cfg };
}

function barColor(value) {
  return value >= 66 ? "linear-gradient(90deg,#00C46A,#00FF88)" : value >= 36 ? "linear-gradient(90deg,#E09A00,#FFB800)" : "linear-gradient(90deg,#B0002A,#FF003C)";
}

export default {
  id: "survival",
  configKey: "survivalConfig",
  voPrefix: "line",
  assetType: "TEXT",
  extras: { schema, prompt, validate, fallback },
  prepareAssets,
  buildHtml,
  compositionId: (slug) => slug,
};
