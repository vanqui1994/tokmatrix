// Engine "Động Vật AI" (phim tài liệu hoang dã, HUD chỉ số sinh tồn + radar săn mồi) cho Matrix native render
// — hợp đồng module xem README.md.
//
// Ánh xạ cảnh Matrix → template:
//   mọi cảnh        = 1 ảnh Antigravity toàn màn hình (Ken Burns, crossfade), phụ đề = lời đọc, nhãn cảnh = callout
//                     của extras (hoặc "CẢNH i/N"), 1 chấm radar loé lên, tiếng màn trập máy ảnh khi chuyển cảnh.
//   cảnh 1 (hook)   = HUD khởi động: khung ngắm, tên loài, thẻ chỉ số trượt vào, thanh chỉ số chạy.
//   cảnh N (outro)  = nhãn IUCN nhấn mạnh.
//   extras          = tên loài / tên Latin / môi trường sống / IUCN / 2–4 chỉ số HUD / callout theo cảnh.
// Thời gian cảnh là thời gian đo từ TTS thật (không chia đều). Timeline GSAP paused, không vòng lặp tự chạy.
import fs from "node:fs/promises";
import path from "node:path";
import { WILDLIFE_LANG_META } from "../../../tools/wildlife-configs.mjs";
import { escapeHtml, shortText, STRING, INTEGER } from "./common.mjs";

export const IUCN_CODES = Object.freeze(["LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD", "NE"]);
const NAME_MAX = 40;
const LATIN_MAX = 48;
const HABITAT_MAX = 48;
const STAT_LABEL_MAX = 22;
const STAT_VALUE_MAX = 14;
const CALLOUT_MAX = 40;
const MIN_STATS = 2;
const MAX_STATS = 4;
const SFX_FILE = "camera_shutter.mp3";
const SFX_DIR = "assets/audio/wildlife";
const SFX_SECONDS = 0.14; // độ dài thật của camera_shutter.mp3

const UI = {
  scene: { vi: "CẢNH", en: "SCENE", de: "SZENE", fr: "SCÈNE", es: "ESCENA", ja: "シーン", ko: "장면" },
  words: { vi: "SỐ TỪ", en: "WORDS", de: "WÖRTER", fr: "MOTS", es: "PALABRAS", ja: "語数", ko: "단어" },
  scenes: { vi: "SỐ CẢNH", en: "SCENES", de: "SZENEN", fr: "SCÈNES", es: "ESCENAS", ja: "シーン数", ko: "장면 수" },
  radar: { vi: "RADAR SĂN MỒI", en: "PREDATOR RADAR", de: "RAUBTIER-RADAR", fr: "RADAR PRÉDATEUR", es: "RADAR DE DEPREDADOR", ja: "捕食者レーダー", ko: "포식자 레이더" },
  scan: { vi: "ĐANG QUÉT", en: "SCANNING", de: "SCAN AKTIV", fr: "BALAYAGE", es: "ESCANEANDO", ja: "スキャン中", ko: "스캔 중" },
  habitat: { vi: "MÔI TRƯỜNG SỐNG", en: "HABITAT", de: "LEBENSRAUM", fr: "HABITAT", es: "HÁBITAT", ja: "生息地域", ko: "서식지" },
  unknown: { vi: "CHƯA XÁC ĐỊNH", en: "UNSPECIFIED", de: "NICHT ANGEGEBEN", fr: "NON PRÉCISÉ", es: "SIN ESPECIFICAR", ja: "未指定", ko: "미지정" },
  telemetry: { vi: "PHÂN TÍCH CHIẾN THUẬT", en: "FIELD TELEMETRY", de: "FELD-TELEMETRIE", fr: "TÉLÉMÉTRIE TERRAIN", es: "TELEMETRÍA DE CAMPO", ja: "フィールド計測", ko: "현장 원격 측정" },
};

// Nhãn IUCN đủ 9 mã (bảng Studio chỉ có LC…CR).
const IUCN_LABELS = {
  vi: { LC: "Ít quan tâm", NT: "Sắp bị đe dọa", VU: "Sắp nguy cấp", EN: "Nguy cấp", CR: "Cực kỳ nguy cấp", EW: "Tuyệt chủng ngoài tự nhiên", EX: "Tuyệt chủng", DD: "Thiếu dữ liệu", NE: "Chưa đánh giá" },
  en: { LC: "Least Concern", NT: "Near Threatened", VU: "Vulnerable", EN: "Endangered", CR: "Critically Endangered", EW: "Extinct in the Wild", EX: "Extinct", DD: "Data Deficient", NE: "Not Evaluated" },
  de: { LC: "Nicht gefährdet", NT: "Potenziell gefährdet", VU: "Gefährdet", EN: "Stark gefährdet", CR: "Vom Aussterben bedroht", EW: "In der Natur ausgestorben", EX: "Ausgestorben", DD: "Ungenügende Datenlage", NE: "Nicht bewertet" },
  fr: { LC: "Préoccupation mineure", NT: "Quasi menacé", VU: "Vulnérable", EN: "En danger", CR: "En danger critique", EW: "Éteint à l'état sauvage", EX: "Éteint", DD: "Données insuffisantes", NE: "Non évalué" },
  es: { LC: "Preocupación menor", NT: "Casi amenazado", VU: "Vulnerable", EN: "En peligro", CR: "En peligro crítico", EW: "Extinto en estado silvestre", EX: "Extinto", DD: "Datos insuficientes", NE: "No evaluado" },
  ja: { LC: "軽度懸念", NT: "準絶滅危惧", VU: "絶滅危惧II類", EN: "絶滅危惧IB類", CR: "絶滅危惧IA類", EW: "野生絶滅", EX: "絶滅", DD: "情報不足", NE: "未評価" },
  ko: { LC: "관심대상", NT: "준위협", VU: "취약", EN: "위기", CR: "위급", EW: "야생절멸", EX: "절멸", DD: "정보부족", NE: "미평가" },
};
const IUCN_COLORS = {
  LC: "#10b981", NT: "#84cc16", VU: "#facc15", EN: "#f97316", CR: "#ef4444", EW: "#a855f7", EX: "#94a3b8", DD: "#94a3b8", NE: "#94a3b8",
};

const ui = (key, lang) => UI[key][lang] || UI[key].en;
const iucnLabel = (code, lang) => `IUCN · ${(IUCN_LABELS[lang] || IUCN_LABELS.en)[code]} (${code})`;
const langMeta = (lang) => WILDLIFE_LANG_META[lang] || WILDLIFE_LANG_META.en;
const lineOf = (scene) => String(scene?.line ?? "").trim();
const hasMarkup = (text) => /[<>]/u.test(String(text ?? ""));
const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();

// ---------------------------------------------------------------------------------------------
// extras
// ---------------------------------------------------------------------------------------------

function schema(sceneCount) {
  return {
    type: "OBJECT",
    properties: {
      common_name: STRING,
      latin_name: STRING,
      habitat: STRING,
      iucn_status: { type: "STRING", enum: [...IUCN_CODES] },
      stats: {
        type: "ARRAY",
        minItems: MIN_STATS,
        maxItems: MAX_STATS,
        items: {
          type: "OBJECT",
          properties: { label: STRING, value: STRING, level: INTEGER },
          required: ["label", "value", "level"],
        },
      },
      callouts: {
        type: "ARRAY",
        maxItems: Math.max(1, Number(sceneCount) || 1),
        items: {
          type: "OBJECT",
          properties: { scene: INTEGER, text: STRING },
          required: ["scene", "text"],
        },
      },
    },
    required: ["common_name", "latin_name", "habitat", "iucn_status", "stats"],
  };
}

function prompt({ script, topic, language, channel } = {}) {
  const scenes = script?.scenes || [];
  const list = scenes.map((scene, offset) => `${scene.scene_index ?? offset + 1}. ${lineOf(scene)} [visual: ${clean(scene.visual_intent)}]`).join("\n");
  return [
    `Topic: ${topic || script?.title || ""}. Video title: ${script?.title || ""}. Channel: ${channel?.name || channel?.channel_id || ""}.`,
    "This narration (fixed, do NOT rewrite it) is shown as a wildlife documentary with a camera-viewfinder HUD: species header, IUCN badge, a panel of animal stats and a predator radar.",
    `common_name: the main animal (or group) of the video as shown in the header, max ${NAME_MAX} characters.`,
    `latin_name: its scientific binomial (e.g. "Orcinus orca"), max ${LATIN_MAX} characters; use "" if the video is about several species or you are not certain.`,
    `habitat: where it lives, short (e.g. "Arctic & temperate oceans"), max ${HABITAT_MAX} characters; "" if unknown.`,
    `iucn_status: the IUCN Red List code of that species, one of ${IUCN_CODES.join(", ")}; use "NE" if there is no single species or you are not certain, "DD" if it is data deficient.`,
    `stats: ${MIN_STATS}–${MAX_STATS} well-known, real characteristics of the animal (prefer the ones the narration mentions: speed, bite force, weight, lifespan, dive depth, hunt success…). label max ${STAT_LABEL_MAX} characters (uppercase), value max ${STAT_VALUE_MAX} characters with unit (e.g. "56 km/h"), level = integer 0–100 for the gauge bar (how extreme the value is among animals). Do not invent precise numbers you are unsure of; use a coarse range instead (e.g. "20–30 yrs").`,
    `callouts: optional, at most one per scene: { scene (1-based scene number), text } — a short HUD tag for that scene (max ${CALLOUT_MAX} characters, e.g. "HUNTING PHASE", "ECHOLOCATION"), only for scenes where it adds something.`,
    `All on-screen text in language "${language}" (latin_name stays Latin). No HTML. Scenes:\n${list}`,
  ].join("\n");
}

function checkText(errors, label, value, max, { required = true } = {}) {
  if (typeof value !== "string") {
    errors.push(`${label} must be a string`);
    return;
  }
  const text = clean(value);
  if (required && !text) errors.push(`${label} is empty`);
  if (text.length > max) errors.push(`${label} is longer than ${max} characters`);
  if (hasMarkup(text) || /[\u0000-\u001f\u007f]/u.test(value)) errors.push(`${label} must not contain markup or control characters`);
}

function validate(data, scenes) {
  const count = Array.isArray(scenes) ? scenes.length : 0;
  if (!count) return ["wildlife needs at least 1 scene"];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["extras must be an object"];
  const errors = [];
  checkText(errors, "common_name", data.common_name, NAME_MAX);
  checkText(errors, "latin_name", data.latin_name, LATIN_MAX, { required: false });
  if (typeof data.latin_name === "string" && clean(data.latin_name) && !/^[A-Za-z][A-Za-z .()\-×]*$/u.test(clean(data.latin_name))) {
    errors.push("latin_name must be a Latin binomial (letters only) or \"\"");
  }
  checkText(errors, "habitat", data.habitat, HABITAT_MAX, { required: false });
  if (!IUCN_CODES.includes(data.iucn_status)) errors.push(`iucn_status must be one of ${IUCN_CODES.join(", ")}`);
  const stats = data.stats;
  if (!Array.isArray(stats)) errors.push("stats must be an array");
  else {
    if (stats.length < MIN_STATS || stats.length > MAX_STATS) errors.push(`stats must have ${MIN_STATS}–${MAX_STATS} entries (got ${stats.length})`);
    const seen = new Set();
    stats.forEach((stat, i) => {
      const label = `stats[${i}]`;
      if (!stat || typeof stat !== "object") {
        errors.push(`${label} must be an object`);
        return;
      }
      checkText(errors, `${label}.label`, stat.label, STAT_LABEL_MAX);
      checkText(errors, `${label}.value`, stat.value, STAT_VALUE_MAX);
      if (!Number.isInteger(stat.level) || stat.level < 0 || stat.level > 100) errors.push(`${label}.level must be an integer 0–100`);
      const key = clean(stat.label).toLowerCase();
      if (key && seen.has(key)) errors.push(`${label}.label duplicates another stat`);
      seen.add(key);
    });
  }
  if (data.callouts !== undefined && data.callouts !== null) {
    if (!Array.isArray(data.callouts)) errors.push("callouts must be an array");
    else {
      const used = new Set();
      data.callouts.forEach((callout, i) => {
        const label = `callouts[${i}]`;
        if (!callout || typeof callout !== "object") {
          errors.push(`${label} must be an object`);
          return;
        }
        if (!Number.isInteger(callout.scene) || callout.scene < 1 || callout.scene > count) errors.push(`${label}.scene must be an integer 1–${count}`);
        else if (used.has(callout.scene)) errors.push(`${label}.scene ${callout.scene} already has a callout`);
        else used.add(callout.scene);
        checkText(errors, `${label}.text`, callout.text, CALLOUT_MAX);
      });
    }
  }
  return errors;
}

/**
 * Dữ liệu xác định khi LLM lỗi: không bịa sự thật — tên = tiêu đề video, không tên Latin/môi trường sống,
 * IUCN "NE" (chưa đánh giá), chỉ số chỉ đếm chính kịch bản (số cảnh, số từ).
 */
function fallback(scenes, { title, language } = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  if (!list.length) throw new Error("wildlife needs at least 1 scene");
  const lang = language || "en";
  const words = list.reduce((sum, scene) => sum + lineOf(scene).split(/\s+/u).filter(Boolean).length, 0);
  const name = shortText(String(title || "").replace(/[<>]/gu, ""), NAME_MAX) || shortText(lineOf(list[0]).replace(/[<>]/gu, ""), NAME_MAX) || "WILDLIFE";
  return {
    common_name: name,
    latin_name: "",
    habitat: "",
    iucn_status: "NE",
    stats: [
      { label: shortText(ui("scenes", lang), STAT_LABEL_MAX), value: String(list.length), level: Math.min(100, Math.round((list.length / 16) * 100)) },
      { label: shortText(ui("words", lang), STAT_LABEL_MAX), value: String(words), level: Math.min(100, Math.round((words / 160) * 100)) },
    ],
    callouts: [],
  };
}

// ---------------------------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------------------------

async function prepareAssets({ targetDir, compareDir }) {
  const source = path.join(compareDir, "shared", "audio", "sfx", SFX_FILE);
  const stat = await fs.stat(source).catch(() => null);
  if (!stat?.size) throw new Error(`wildlife SFX is missing: ${source}`);
  const dest = path.join(targetDir, SFX_DIR, SFX_FILE);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  return [dest];
}

// ---------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------

const round = (value) => Math.round(Number(value) * 1000) / 1000;

/** Ước lượng cỡ chữ xác định (Node) theo số ký tự; script trong trang co tiếp theo đo thật. */
function estimateFont(text, { width, height, max, min, lineHeight = 1.2, charWidth = 0.6 }) {
  const chars = Math.max(1, [...String(text || "")].length);
  for (let size = max; size > min; size -= 1) {
    const perLine = Math.max(1, Math.floor(width / (size * charWidth)));
    const lines = Math.ceil(chars / perLine);
    if (lines * size * lineHeight <= height) return size;
  }
  return min;
}

function fitAttrs(text, box) {
  return `data-fit data-fit-min="${box.min}" style="font-size:${estimateFont(text, box)}px"`;
}

// Co chữ theo đo thật (clip ẩn bằng visibility nên vẫn đo được); xác định, chạy khi nạp và khi font sẵn sàng.
const FIT_SCRIPT = `<script data-wildlife-fit>
(function () {
  function fit(el) {
    if (!el.dataset.fitBase) el.dataset.fitBase = String(parseFloat(el.style.fontSize) || parseFloat(getComputedStyle(el).fontSize) || 20);
    var size = Number(el.dataset.fitBase), min = Number(el.dataset.fitMin || 12);
    el.style.fontSize = size + "px";
    if (!el.clientHeight) return;
    while (size > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }
  function fitAll() { Array.prototype.forEach.call(document.querySelectorAll("#wildlife-root [data-fit]"), fit); }
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
})();
</script>`;

/** Vị trí chấm radar xác định theo số cảnh (góc vàng, bán kính 40–120 trong ô 300). */
function blipPosition(index) {
  const angle = (index * 137.508 * Math.PI) / 180;
  const radius = 40 + ((index * 37) % 81);
  return { x: round(150 + radius * Math.cos(angle)), y: round(150 + radius * Math.sin(angle)) };
}

async function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, extras, cinemaAudioHtml, scenes, common = {} } = ctx;
  const problems = validate(extras, scenes);
  if (problems.length) throw new Error(`wildlife extras invalid: ${problems.join("; ")}`);
  if (scenes.some((scene) => !scene.voSrc)) throw new Error("wildlife: every scene needs its narration file");
  if (scenes.some((scene) => !scene.imgSrc)) throw new Error("wildlife: every scene needs its Antigravity image");
  const total = Number(totalDuration);
  if (!Number.isFinite(total) || total <= 0) throw new Error("wildlife: totalDuration is missing");
  const meta = langMeta(lang);
  const n = scenes.length;
  const rootId = slug;
  const name = clean(extras.common_name);
  const latin = clean(extras.latin_name);
  const habitat = clean(extras.habitat) || ui("unknown", lang);
  const iucn = extras.iucn_status;
  const iucnText = iucnLabel(iucn, lang);
  const iucnColor = IUCN_COLORS[iucn];
  const stats = extras.stats.map((stat) => ({ label: clean(stat.label), value: clean(stat.value), level: stat.level }));
  const calloutByScene = new Map((extras.callouts || []).map((callout) => [callout.scene, clean(callout.text)]));
  const watermark = common.watermark || escapeHtml(meta.watermark);
  const sceneEnd = (i) => (i + 1 < n ? scenes[i + 1].start : total);
  const badgeOf = (scene) => calloutByScene.get(scene.index) || `${ui("scene", lang)} ${scene.index}/${n}`;

  const nameBox = { width: 960, height: 150, max: 76, min: 30, lineHeight: 1.05, charWidth: 0.72 };
  const latinBox = { width: 960, height: 40, max: 30, min: 16, charWidth: 0.56 };
  const habitatBox = { width: 960, height: 36, max: 24, min: 14, charWidth: 0.62 };
  const iucnBox = { width: 520, height: 34, max: 22, min: 12, charWidth: 0.62 };
  const statLabelBox = { width: 290, height: 26, max: 20, min: 11, charWidth: 0.66 };
  const statValueBox = { width: 290, height: 46, max: 38, min: 18, charWidth: 0.66 };
  const badgeBox = { width: 700, height: 32, max: 22, min: 12, charWidth: 0.66 };
  const captionBox = { width: 916, height: 214, max: 50, min: 24, lineHeight: 1.3, charWidth: 0.6 };
  const radarBox = { width: 280, height: 34, max: 22, min: 11, charWidth: 0.66 };
  const footBox = { width: 560, height: 28, max: 20, min: 11, charWidth: 0.62 };

  // Mỗi cảnh một <img> riêng (không trùng src); clip kéo dài 0.6 s sang cảnh sau để crossfade.
  const imagesHtml = scenes.map((scene, i) => {
    const start = i === 0 ? 0 : scene.start;
    const end = i + 1 < n ? Math.min(total, scenes[i + 1].start + 0.6) : total;
    return `<img id="wl-img-${scene.index}" class="wl-visual clip" src="${escapeHtml(scene.imgSrc)}" alt="${escapeHtml(`${name} ${scene.index}`)}" data-start="${round(start)}" data-duration="${round(end - start)}" data-track-index="${1 + (i % 2)}" data-layout-allow-overflow>`;
  }).join("\n      ");

  const statsHtml = stats.map((stat, i) => `
        <div class="wl-stat" id="wl-stat-${i + 1}">
          <div class="wl-stat-label" ${fitAttrs(stat.label, statLabelBox)}>${escapeHtml(stat.label)}</div>
          <div class="wl-stat-value" ${fitAttrs(stat.value, statValueBox)}>${escapeHtml(stat.value)}</div>
          <div class="wl-stat-bar"><div class="wl-stat-fill" id="wl-fill-${i + 1}" style="width:${stat.level}%"></div></div>
        </div>`).join("");

  const blipsHtml = scenes.map((scene) => {
    const { x, y } = blipPosition(scene.index);
    return `<circle id="wl-blip-${scene.index}" class="wl-blip" cx="${x}" cy="${y}" r="7" opacity="0"></circle>`;
  }).join("");

  const badgesHtml = scenes.map((scene, i) => {
    const text = badgeOf(scene);
    return `
      <div id="wl-badge-${scene.index}" class="wl-badge clip" data-start="${round(i === 0 ? 0 : scene.start)}" data-duration="${round(sceneEnd(i) - (i === 0 ? 0 : scene.start))}" data-track-index="6">
        <span class="wl-badge-dot"></span><span class="wl-badge-text" ${fitAttrs(text, badgeBox)}>${escapeHtml(text)}</span>
      </div>`;
  }).join("");

  const captionsHtml = scenes.map((scene, i) => {
    const text = lineOf(scene);
    const start = i === 0 ? 0 : scene.start;
    return `
        <div id="wl-caption-${scene.index}" class="wl-caption clip" data-start="${round(start)}" data-duration="${round(Math.max(0.1, sceneEnd(i) - start))}" data-track-index="5">
          <div class="wl-caption-text" ${fitAttrs(text, captionBox)}>${escapeHtml(text)}</div>
        </div>`;
  }).join("");

  const voHtml = scenes.map((scene) => `
      <audio id="vo-${scene.index}" class="clip" src="${escapeHtml(scene.voSrc)}" data-start="${round(scene.start)}" data-duration="${round(scene.duration)}" data-track-index="${20 + (scene.index % 2)}"></audio>`).join("");
  const sfxHtml = scenes.map((scene, i) => `
      <audio id="wild-shutter-${scene.index}" class="clip" src="${SFX_DIR}/${SFX_FILE}" data-start="${round(i === 0 ? 0 : Math.max(0, scene.start - 0.05))}" data-duration="${SFX_SECONDS}" data-track-index="${40 + (i % 2)}" data-volume="0.22"></audio>`).join("");
  const bgmHtml = String(cinemaAudioHtml || "").includes("assets/audio/bgm.mp3")
    ? cinemaAudioHtml
    : `      <audio id="bgm" class="clip" src="assets/audio/bgm.mp3" data-start="0" data-duration="${total}" data-track-index="30" data-volume="0.12"></audio>\n${cinemaAudioHtml || ""}`;

  const plan = {
    total,
    fps: 30,
    sweeps: Math.max(1, Math.round(total / 4)),
    stats: stats.length,
    scenes: scenes.map((scene, i) => ({
      index: scene.index,
      start: round(i === 0 ? 0 : scene.start),
      end: round(i + 1 < n ? Math.min(total, scenes[i + 1].start + 0.6) : total),
    })),
    outroStart: n > 1 ? round(scenes[n - 1].start) : null,
  };
  const R = "#wildlife-root";

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1080px; height: 1920px; background: #02070b; overflow: hidden; }
    body { color: #fff; font-family: 'Montserrat', 'Inter', sans-serif; position: relative; }
    ${R} { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #02070b; }
    ${R} .wl-stage { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; overflow: hidden; }
    ${R} .wl-visual { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; object-fit: cover; display: block; filter: contrast(1.08) saturate(1.12); }
    ${R} .wl-vignette { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px;
      background: radial-gradient(circle at 50% 48%, transparent 42%, rgba(0,5,10,0.72) 92%),
                  linear-gradient(180deg, rgba(2,7,12,0.94) 0%, rgba(2,7,12,0.82) 20%, rgba(2,7,12,0.2) 30%, transparent 40%, transparent 62%, rgba(2,7,12,0.55) 74%, rgba(2,7,12,0.95) 100%); }
    ${R} .wl-corner { position: absolute; width: 44px; height: 44px; border: 4px solid rgba(255,255,255,0.55); }
    ${R} .wl-tl { top: 30px; left: 30px; border-right: none; border-bottom: none; }
    ${R} .wl-tr { top: 30px; right: 30px; border-left: none; border-bottom: none; }
    ${R} .wl-bl { bottom: 30px; left: 30px; border-right: none; border-top: none; }
    ${R} .wl-br { bottom: 30px; right: 30px; border-left: none; border-top: none; }
    ${R} .wl-crosshair { position: absolute; left: 450px; top: 1000px; width: 180px; height: 180px; border: 2px dashed rgba(0,240,255,0.45); border-radius: 50%; }
    ${R} .wl-cross-h { position: absolute; left: 430px; top: 1089px; width: 220px; height: 2px; background: rgba(0,240,255,0.55); }
    ${R} .wl-cross-v { position: absolute; left: 539px; top: 980px; width: 2px; height: 220px; background: rgba(0,240,255,0.55); }

    ${R} .wl-top { position: absolute; top: 56px; left: 60px; width: 960px; height: 56px; display: flex; justify-content: space-between; align-items: center; }
    ${R} .wl-rec { display: flex; align-items: center; gap: 14px; height: 52px; padding: 0 18px; background: rgba(4,15,25,0.78); border: 1px solid rgba(0,240,255,0.4); border-radius: 8px; color: #00f0ff; font-size: 20px; font-weight: 700; letter-spacing: 1px; white-space: nowrap; font-variant-numeric: tabular-nums; }
    ${R} .wl-rec-dot { width: 14px; height: 14px; border-radius: 50%; background: #ff3344; box-shadow: 0 0 12px #ff3344; }
    ${R} .wl-frames { display: inline-block; width: 64px; text-align: right; }
    ${R} .wl-iucn { width: 540px; height: 52px; display: flex; align-items: center; justify-content: center; padding: 0 10px; border-radius: 8px; background: rgba(4,15,25,0.8); border: 2px solid ${iucnColor}; box-shadow: 0 0 16px ${iucnColor}66; }
    ${R} .wl-iucn-text { display: block; width: 520px; height: 34px; line-height: 34px; text-align: center; color: ${iucnColor}; font-weight: 800; letter-spacing: 1px; white-space: nowrap; overflow: hidden; }

    ${R} .wl-title { position: absolute; top: 138px; left: 60px; width: 960px; height: 240px; }
    ${R} .wl-latin { display: block; width: 960px; height: 40px; line-height: 40px; font-style: italic; font-weight: 600; color: #ffd60a; letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-shadow: 0 2px 10px rgba(0,0,0,0.85); }
    ${R} .wl-name { display: flex; align-items: center; width: 960px; height: 150px; font-weight: 900; line-height: 1.05; text-transform: uppercase; letter-spacing: 1px; color: #fff; overflow-wrap: anywhere; text-shadow: 0 4px 18px rgba(0,0,0,0.95); }
    ${R} .wl-habitat { display: block; width: 960px; height: 36px; line-height: 36px; color: rgba(255,255,255,0.85); font-weight: 600; white-space: nowrap; overflow: hidden; text-shadow: 0 2px 8px rgba(0,0,0,0.9); }
    ${R} .wl-habitat b { color: #00f0ff; font-weight: 800; }

    ${R} .wl-radar { position: absolute; top: 420px; left: 60px; width: 300px; height: 346px; }
    ${R} .wl-radar-disc { position: absolute; left: 0; top: 0; width: 300px; height: 300px; border-radius: 50%; background: rgba(3,20,24,0.72); border: 2px solid rgba(0,240,255,0.55); box-shadow: 0 0 24px rgba(0,240,255,0.25); }
    ${R} .wl-radar svg { position: absolute; left: 0; top: 0; width: 300px; height: 300px; }
    ${R} .wl-blip { fill: #ff4d5e; }
    ${R} .wl-radar-label { position: absolute; left: 0; top: 308px; width: 300px; height: 38px; line-height: 36px; padding: 0 10px; border-radius: 8px; background: rgba(3,16,28,0.9); border: 1px solid rgba(0,240,255,0.4); text-align: center; color: #00f0ff; font-weight: 800; letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-shadow: 0 2px 8px rgba(0,0,0,0.9); }

    ${R} .wl-stats { position: absolute; top: 420px; left: 680px; width: 340px; display: flex; flex-direction: column; gap: 14px; }
    ${R} .wl-stat { width: 340px; height: 124px; padding: 12px 18px 12px 26px; border-radius: 12px; background: rgba(3,16,28,0.84); border: 1px solid rgba(0,240,255,0.4); box-shadow: 0 8px 28px rgba(0,0,0,0.65); position: relative; overflow: hidden; }
    ${R} .wl-stat::before { content: ''; position: absolute; left: 0; top: 0; width: 5px; height: 124px; background: #00f0ff; }
    ${R} .wl-stat-label { display: block; width: 290px; height: 26px; line-height: 26px; color: #00f0ff; font-weight: 800; letter-spacing: 1px; white-space: nowrap; overflow: hidden; }
    ${R} .wl-stat-value { display: block; width: 290px; height: 46px; line-height: 46px; color: #fff; font-weight: 900; white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums; }
    ${R} .wl-stat-bar { width: 290px; height: 10px; margin-top: 10px; border-radius: 5px; background: rgba(255,255,255,0.16); overflow: hidden; }
    ${R} .wl-stat-fill { height: 10px; border-radius: 5px; background: linear-gradient(90deg, #00f0ff, #ffd60a); }

    ${R} .wl-bottom { position: absolute; left: 50px; top: 1436px; width: 980px; height: 414px; }
    ${R} .wl-badge { position: absolute; left: 0; top: 0; height: 48px; max-width: 760px; display: flex; align-items: center; gap: 10px; padding: 0 18px; background: rgba(4,12,24,0.94); border: 1px solid #ffd60a; border-radius: 8px; box-shadow: 0 0 16px rgba(255,214,10,0.3); }
    ${R} .wl-badge-dot { width: 12px; height: 12px; flex: 0 0 12px; border-radius: 50%; background: #ffd60a; }
    ${R} .wl-badge-text { display: block; max-width: 700px; height: 32px; line-height: 32px; color: #ffea79; font-weight: 800; letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-transform: uppercase; }
    ${R} .wl-card { position: absolute; left: 0; top: 62px; width: 980px; height: 352px; padding: 26px 32px 18px; border-radius: 18px; background: rgba(2,10,18,0.88); border: 1px solid rgba(255,255,255,0.22); box-shadow: 0 16px 48px rgba(0,0,0,0.85); }
    ${R} .wl-caption { position: absolute; left: 32px; top: 26px; width: 916px; height: 222px; }
    ${R} .wl-caption-text { width: 916px; height: 214px; display: flex; align-items: center; font-weight: 700; line-height: 1.3; color: #f1f5f9; overflow-wrap: anywhere; text-shadow: 0 2px 10px rgba(0,0,0,0.9); }
    ${R} .wl-foot { position: absolute; left: 32px; top: 276px; width: 916px; height: 48px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.14); display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    ${R} .wl-foot-left { display: block; width: 560px; height: 28px; line-height: 28px; color: #00f0ff; font-weight: 700; letter-spacing: 1px; white-space: nowrap; overflow: hidden; }
    ${R} .wl-foot-right { display: block; width: 340px; height: 28px; line-height: 28px; text-align: right; color: #94a3b8; font-weight: 600; white-space: nowrap; overflow: hidden; }
  </style>
</head>
<body>
  <div id="wildlife-root" data-composition-id="${rootId}" data-width="1080" data-height="1920" data-start="0" data-duration="${total}">
    <div id="wl-stage" class="wl-stage">
      ${imagesHtml}
    </div>
    <div class="wl-vignette"></div>
    <div id="wl-viewfinder">
      <div class="wl-corner wl-tl"></div><div class="wl-corner wl-tr"></div><div class="wl-corner wl-bl"></div><div class="wl-corner wl-br"></div>
      <div id="wl-crosshair" class="wl-crosshair"></div><div class="wl-cross-h"></div><div class="wl-cross-v"></div>
    </div>

    <div id="wl-top" class="wl-top clip" data-start="0" data-duration="${total}" data-track-index="3">
      <div class="wl-rec"><span class="wl-rec-dot" id="wl-rec-dot"></span><span>REC</span><span>400mm F/2.8</span><span>FRM <span class="wl-frames" id="wl-frames">0</span></span></div>
      <div class="wl-iucn" id="wl-iucn"><span class="wl-iucn-text" ${fitAttrs(iucnText, iucnBox)}>${escapeHtml(iucnText)}</span></div>
    </div>

    <div id="wl-title" class="wl-title clip" data-start="0" data-duration="${total}" data-track-index="4">
      <span class="wl-latin" ${fitAttrs(latin || "—", latinBox)}>${escapeHtml(latin || "—")}</span>
      <div class="wl-name" id="wl-name" ${fitAttrs(name, nameBox)}>${escapeHtml(name)}</div>
      <span class="wl-habitat" ${fitAttrs(`${ui("habitat", lang)}: ${habitat}`, habitatBox)}><b>${escapeHtml(ui("habitat", lang))}:</b> ${escapeHtml(habitat)}</span>
    </div>

    <div id="wl-radar" class="wl-radar clip" data-start="0" data-duration="${total}" data-track-index="7">
      <div class="wl-radar-disc"></div>
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <defs>
          <linearGradient id="wl-sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#00f0ff" stop-opacity="0"></stop>
            <stop offset="1" stop-color="#00f0ff" stop-opacity="0.55"></stop>
          </linearGradient>
        </defs>
        <circle cx="150" cy="150" r="50" fill="none" stroke="rgba(0,240,255,0.35)" stroke-width="1.5"></circle>
        <circle cx="150" cy="150" r="95" fill="none" stroke="rgba(0,240,255,0.35)" stroke-width="1.5"></circle>
        <circle cx="150" cy="150" r="138" fill="none" stroke="rgba(0,240,255,0.35)" stroke-width="1.5"></circle>
        <line x1="12" y1="150" x2="288" y2="150" stroke="rgba(0,240,255,0.3)" stroke-width="1"></line>
        <line x1="150" y1="12" x2="150" y2="288" stroke="rgba(0,240,255,0.3)" stroke-width="1"></line>
        <g id="wl-sweep" data-layout-allow-overflow><path d="M150 150 L288 150 A138 138 0 0 0 247.6 52.4 Z" fill="url(#wl-sweep-grad)"></path><line x1="150" y1="150" x2="288" y2="150" stroke="#00f0ff" stroke-width="3"></line></g>
        ${blipsHtml}
        <circle cx="150" cy="150" r="6" fill="#ffd60a"></circle>
      </svg>
      <div class="wl-radar-label" ${fitAttrs(ui("radar", lang), radarBox)}>${escapeHtml(ui("radar", lang))}</div>
    </div>

    <div id="wl-stats" class="wl-stats clip" data-start="0" data-duration="${total}" data-track-index="8">${statsHtml}
    </div>

    <div id="wl-bottom" class="wl-bottom">
      ${badgesHtml}
      <div id="wl-card" class="wl-card clip" data-start="0" data-duration="${total}" data-track-index="9">
        ${captionsHtml}
        <div class="wl-foot">
          <span class="wl-foot-left" ${fitAttrs(`● ${ui("scan", lang)} · ${ui("telemetry", lang)}`, footBox)}>● ${escapeHtml(ui("scan", lang))} · ${escapeHtml(ui("telemetry", lang))}</span>
          <span class="wl-foot-right">${watermark}</span>
        </div>
      </div>
    </div>

    <div id="audio-tracks">
${bgmHtml}
${voHtml}
${sfxHtml}
    </div>
  </div>
${FIT_SCRIPT}
  <script>
    (function () {
      var PLAN = ${JSON.stringify(plan)};
      var ROOT = "#wildlife-root";
      function q(s) { return ROOT + " " + s; }
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      function pulse(target, peak, base, at, duration) {
        tl.to(target, Object.assign({ duration: 0.04, ease: "none" }, peak), at)
          .to(target, Object.assign({ duration: duration, ease: "power2.out" }, base), at + 0.04);
      }

      // Bộ đếm khung hình của máy quay: tween thuộc tính (không callback) nên seek được.
      tl.fromTo(q("#wl-frames"), { innerText: 0 }, { innerText: Math.round(PLAN.total * PLAN.fps), snap: { innerText: 1 }, duration: PLAN.total, ease: "none" }, 0);
      // Radar quét: một tween xoay hữu hạn trên toàn thời lượng (không repeat vô hạn).
      tl.fromTo(q("#wl-sweep"), { rotation: 0 }, { rotation: -360 * PLAN.sweeps, svgOrigin: "150 150", duration: PLAN.total, ease: "none" }, 0);

      // Hook (cảnh 1): HUD khởi động.
      tl.fromTo(q(".wl-corner"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" }, 0);
      tl.fromTo(q("#wl-top"), { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, 0.05);
      tl.fromTo(q("#wl-title"), { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.1);
      tl.fromTo(q("#wl-radar"), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.4)" }, 0.2);
      tl.fromTo(q(".wl-stat"), { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, stagger: 0.12, ease: "power2.out" }, 0.25);
      tl.fromTo(q(".wl-stat-fill"), { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.8, stagger: 0.12, ease: "power2.out" }, 0.45);
      tl.fromTo(q("#wl-card"), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, 0.1);

      PLAN.scenes.forEach(function (sc, i) {
        var img = q("#wl-img-" + sc.index);
        if (i > 0) tl.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.inOut" }, sc.start);
        tl.fromTo(img, { scale: 1, x: 0, y: 0 }, { scale: 1.1, x: (i % 2 ? -18 : 18), y: (i % 3 ? 12 : -12), duration: Math.max(0.5, sc.end - sc.start), ease: "none" }, sc.start);
        if (i > 0) {
          tl.fromTo(q("#wl-badge-" + sc.index), { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, sc.start);
          tl.fromTo(q("#wl-caption-" + sc.index), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, sc.start);
          // Nhịp lặp trên cùng phần tử: to → về đúng giá trị gốc (không fromTo), để seek lùi/tiến đều xác định.
          pulse(q("#wl-crosshair"), { scale: 1.25, opacity: 0.4 }, { scale: 1, opacity: 1 }, sc.start, 0.45);
          pulse(q("#wl-stat-" + ((i % PLAN.stats) + 1)), { borderColor: "rgba(255,214,10,1)" }, { borderColor: "rgba(0,240,255,0.4)" }, sc.start, 0.9);
        }
        // Chấm radar của cảnh loé lên rồi mờ dần, giữ lại làm "dấu vết".
        tl.fromTo(q("#wl-blip-" + sc.index), { opacity: 0, attr: { r: 14 } }, { opacity: 1, attr: { r: 7 }, duration: 0.35, ease: "power2.out" }, sc.start + 0.1)
          .to(q("#wl-blip-" + sc.index), { opacity: 0.35, duration: 1.2, ease: "power1.out" }, sc.start + 0.6);
        pulse(q("#wl-rec-dot"), { opacity: 0.25 }, { opacity: 1 }, sc.start, 0.3);
      });

      if (PLAN.outroStart !== null) {
        pulse(q("#wl-iucn"), { scale: 1.06 }, { scale: 1 }, PLAN.outroStart, 0.5);
      }
      tl.set({}, {}, PLAN.total);
      window.__timelines[${JSON.stringify(rootId)}] = tl;
    })();
  </script>
</body>
</html>`;

  const cfg = {
    ...common,
    engine: "wildlife",
    lang,
    topicTitle: name,
    latinName: latin,
    habitat: clean(extras.habitat),
    iucnStatus: iucn,
    category: "wildlife",
    hudStats: stats,
    stats: Object.fromEntries(stats.map((stat) => [stat.label, stat.value])),
    scenes: scenes.map((scene) => ({
      index: scene.index, start: scene.start, duration: scene.duration, line: lineOf(scene),
      badge: badgeOf(scene), voSrc: scene.voSrc, imgSrc: scene.imgSrc,
    })),
    totalDuration: total,
  };
  return { html, cfg };
}

export default {
  id: "wildlife",
  configKey: "wildlifeConfig",
  voPrefix: "scene",
  // Phim tài liệu ảnh: mỗi cảnh một ảnh Antigravity toàn màn hình (như template Studio).
  assetType: "IMAGE_AI",
  imageName: (index, ext) => `assets/images/scene-${index}${ext}`,
  extras: { schema, prompt, validate, fallback },
  prepareAssets,
  buildHtml,
  compositionId: (slug) => slug,
};
