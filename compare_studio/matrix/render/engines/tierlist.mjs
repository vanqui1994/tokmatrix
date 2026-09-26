// Engine "Tier List" (SSS → D) cho Matrix native render — hợp đồng module xem README.md.
//
// Ánh xạ cảnh Matrix → template:
//   cảnh 1            = hook: bảng tier rỗng + thẻ mở đầu (ảnh cảnh 1, headline)
//   cảnh 2 … N-1      = các ứng viên; mỗi ứng viên phủ 1–4 cảnh liên tiếp (extras.items[].first_scene/last_scene).
//                       Ảnh của từng cảnh lần lượt hiện trong khung showcase; ảnh cảnh đầu của ứng viên là icon.
//                       Cú "slam" (bay vào khay tier + rung máy quay + SFX) rơi vào cảnh cuối của ứng viên.
//   cảnh N            = outro: bảng xếp hạng hoàn chỉnh + quán quân.
// Thời gian cảnh là thời gian đo từ TTS thật (không chia đều); mỗi cảnh một file giọng, một ảnh Antigravity.
import fs from "node:fs/promises";
import path from "node:path";
import { TIER_DEFINITIONS, TIERLIST_LANG_META } from "../../../tools/tierlist-configs.mjs";
import { escapeHtml, shortText, STRING, INTEGER } from "./common.mjs";

const TIER_IDS = TIER_DEFINITIONS.map((tier) => tier.id);
const MAX_ITEMS = 7;
const MAX_SCENES_PER_ITEM = 4;
const MAX_PER_TIER = 6; // khay 798 px chứa 6 icon 114 px
const NAME_MAX = 32;
const SUBTITLE_MAX = 64;
const HEADLINE_MAX = 64;
const SFX_FILES = { slam: "sub_drop.mp3", whoosh: "whoosh.mp3" };
const SFX_DIR = "assets/audio/tierlist";

// Chữ cố định trên màn hình theo ngôn ngữ video (không có thì tiếng Anh).
const UI = {
  candidate: { vi: "ỨNG VIÊN", en: "CONTENDER", de: "KANDIDAT", fr: "CANDIDAT", es: "CANDIDATO", ja: "候補", ko: "후보" },
  rank: { vi: "HẠNG", en: "RANK", de: "RANG", fr: "RANG", es: "RANGO", ja: "ランク", ko: "등급" },
  final: { vi: "BẢNG XẾP HẠNG CHUNG CUỘC", en: "FINAL RANKING", de: "ENDGÜLTIGE RANGLISTE", fr: "CLASSEMENT FINAL", es: "CLASIFICACIÓN FINAL", ja: "最終ランキング", ko: "최종 순위" },
  champion: { vi: "QUÁN QUÂN", en: "CHAMPION", de: "SIEGER", fr: "CHAMPION", es: "CAMPEÓN", ja: "王者", ko: "챔피언" },
  headline: {
    vi: "AI XỨNG ĐÁNG BẬC SSS?", en: "WHO EARNS SSS TIER?", de: "WER VERDIENT SSS?", fr: "QUI MÉRITE LE RANG SSS ?",
    es: "¿QUIÉN MERECE SSS?", ja: "SSSに値するのは？", ko: "SSS 등급의 주인공은?",
  },
};
const TIER_LABELS = {
  de: { SSS: "MEISTERWERK", S: "HERAUSRAGEND", A: "SEHR GUT", B: "SOLIDE", C: "DURCHSCHNITT", D: "MEIDEN" },
  fr: { SSS: "CHEF-D'ŒUVRE", S: "EXCELLENT", A: "TRÈS BIEN", B: "CORRECT", C: "MOYEN", D: "À ÉVITER" },
  es: { SSS: "OBRA MAESTRA", S: "EXCELENTE", A: "MUY BUENO", B: "DECENTE", C: "PROMEDIO", D: "EVITAR" },
};

const ui = (key, lang) => UI[key][lang] || UI[key].en;
function tierLabel(tier, lang) {
  if (TIER_LABELS[lang]) return TIER_LABELS[lang][tier.id];
  if (lang === "vi") return tier.label;
  if (lang === "en") return tier.labelEn;
  return "";
}
const langMeta = (lang) => TIERLIST_LANG_META[lang] || TIERLIST_LANG_META.en;

/** Vùng cảnh dành cho ứng viên: bỏ cảnh hook (1) và outro (N) khi đủ cảnh. */
export function candidateRange(sceneCount) {
  const n = Number(sceneCount) || 0;
  if (n < 2) return null;
  const hasOutro = n >= 4;
  return { first: 2, last: hasOutro ? n - 1 : n, hasOutro };
}

function lineOf(scene) {
  return String(scene?.line ?? "").trim();
}

// ---------------------------------------------------------------------------------------------
// extras
// ---------------------------------------------------------------------------------------------

function schema(sceneCount) {
  const range = candidateRange(sceneCount) || { first: 2, last: 2 };
  const middle = range.last - range.first + 1;
  return {
    type: "OBJECT",
    properties: {
      headline: STRING,
      items: {
        type: "ARRAY",
        minItems: Math.min(2, middle),
        maxItems: Math.min(MAX_ITEMS, middle),
        items: {
          type: "OBJECT",
          properties: {
            name: STRING,
            subtitle: STRING,
            tier: { type: "STRING", enum: TIER_IDS },
            first_scene: INTEGER,
            last_scene: INTEGER,
          },
          required: ["name", "subtitle", "tier", "first_scene", "last_scene"],
        },
      },
    },
    required: ["headline", "items"],
  };
}

function prompt({ script, topic, language, channel } = {}) {
  const scenes = script?.scenes || [];
  const range = candidateRange(scenes.length) || { first: 2, last: scenes.length, hasOutro: false };
  const list = scenes.map((scene, offset) => `${scene.scene_index ?? offset + 1}. ${lineOf(scene)} [visual: ${String(scene.visual_intent || "").trim()}]`).join("\n");
  return [
    `Topic: ${topic || script?.title || ""}. Video title: ${script?.title || ""}. Channel: ${channel?.name || channel?.channel_id || ""}.`,
    "This narration (fixed, do NOT rewrite it) will be shown as a TIER LIST video ranking contenders from SSS (best) to S, A, B, C, D (worst).",
    `Scene 1 is the hook${range.hasOutro ? ` and scene ${scenes.length} is the outro/final board` : ""}. Scenes ${range.first}–${range.last} must be split into ${Math.min(2, range.last - range.first + 1)}–${Math.min(MAX_ITEMS, range.last - range.first + 1)} ranked contenders.`,
    "Each contender covers consecutive scenes (1 to 4, ideally 2): the first scene introduces/reviews it, its last scene is the verdict where it slams into its tier.",
    `Contenders must cover scenes ${range.first}..${range.last} in order with no gap or overlap: first contender first_scene=${range.first}, each next first_scene = previous last_scene + 1, last contender last_scene=${range.last}.`,
    `Fields per contender: name (the thing being ranked, max ${NAME_MAX} characters), subtitle (short descriptor, max ${SUBTITLE_MAX} characters), tier (one of ${TIER_IDS.join(", ")}; follow what the narration implies, stronger/more important/more surprising = higher tier; at most ${MAX_PER_TIER} contenders per tier), first_scene, last_scene.`,
    `headline: a short on-screen question for the board (max ${HEADLINE_MAX} characters).`,
    `All on-screen text in language "${language}". Scenes:\n${list}`,
  ].join("\n");
}

function validate(data, scenes) {
  const errors = [];
  const count = Array.isArray(scenes) ? scenes.length : 0;
  const range = candidateRange(count);
  if (!range) return ["tier list needs at least 2 scenes"];
  if (!data || typeof data !== "object") return ["extras must be an object"];
  const headline = String(data.headline ?? "").trim();
  if (!headline) errors.push("headline is empty");
  else if (headline.length > HEADLINE_MAX) errors.push(`headline is longer than ${HEADLINE_MAX} characters`);
  if (/[<>]/u.test(headline)) errors.push("headline must not contain markup");
  const items = data.items;
  if (!Array.isArray(items) || !items.length) return [...errors, "items must be a non-empty array"];
  const middle = range.last - range.first + 1;
  const minItems = Math.min(2, middle);
  if (items.length < minItems || items.length > Math.min(MAX_ITEMS, middle)) {
    errors.push(`items must have ${minItems}–${Math.min(MAX_ITEMS, middle)} contenders (got ${items.length})`);
  }
  let expected = range.first;
  const perTier = {};
  items.forEach((item, i) => {
    const label = `items[${i}]`;
    const name = String(item?.name ?? "").trim();
    const subtitle = String(item?.subtitle ?? "").trim();
    if (!name) errors.push(`${label}.name is empty`);
    else if (name.length > NAME_MAX) errors.push(`${label}.name is longer than ${NAME_MAX} characters`);
    if (subtitle.length > SUBTITLE_MAX) errors.push(`${label}.subtitle is longer than ${SUBTITLE_MAX} characters`);
    if (/[<>]/u.test(name + subtitle)) errors.push(`${label} text must not contain markup`);
    if (!TIER_IDS.includes(item?.tier)) errors.push(`${label}.tier must be one of ${TIER_IDS.join(", ")}`);
    else perTier[item.tier] = (perTier[item.tier] || 0) + 1;
    const first = Number(item?.first_scene);
    const last = Number(item?.last_scene);
    if (!Number.isInteger(first) || !Number.isInteger(last)) {
      errors.push(`${label}.first_scene/last_scene must be integers`);
      return;
    }
    if (first !== expected) errors.push(`${label}.first_scene must be ${expected} (got ${first})`);
    if (last < first) errors.push(`${label}.last_scene must be >= first_scene`);
    else if (last - first + 1 > MAX_SCENES_PER_ITEM) errors.push(`${label} covers more than ${MAX_SCENES_PER_ITEM} scenes`);
    expected = last + 1;
  });
  if (expected !== range.last + 1) errors.push(`the last contender must end at scene ${range.last} (ends at ${expected - 1})`);
  for (const [tier, n] of Object.entries(perTier)) {
    if (n > MAX_PER_TIER) errors.push(`tier ${tier} has ${n} contenders (max ${MAX_PER_TIER})`);
  }
  return errors;
}

function namePhrase(line) {
  const words = String(line || "").replace(/[.!?…,;:"“”„«»]+/gu, " ").split(/\s+/u).filter(Boolean);
  const picked = [];
  for (const word of words) {
    if (picked.length >= 4 || [...picked, word].join(" ").length > NAME_MAX - 2) break;
    picked.push(word);
  }
  return (picked.join(" ") || shortText(line, NAME_MAX)).slice(0, NAME_MAX);
}

/** Dữ liệu suy ra xác định từ kịch bản: chia cảnh ứng viên thành nhóm ~2 cảnh, bậc tăng dần D → SSS. */
function fallback(scenes, { title, language } = {}) {
  const count = Array.isArray(scenes) ? scenes.length : 0;
  const range = candidateRange(count);
  if (!range) throw new Error("tier list needs at least 2 scenes");
  const middle = range.last - range.first + 1;
  const groups = Math.max(Math.min(2, middle), Math.min(MAX_ITEMS, middle, Math.max(1, Math.round(middle / 2))));
  const base = Math.floor(middle / groups);
  const rest = middle % groups;
  const items = [];
  let cursor = range.first;
  for (let i = 0; i < groups; i += 1) {
    const size = base + (i < rest ? 1 : 0);
    const first = cursor;
    const last = cursor + size - 1;
    cursor = last + 1;
    const rankFromWorst = groups === 1 ? 5 : Math.round((i * 5) / (groups - 1));
    items.push({
      name: namePhrase(lineOf(scenes[first - 1])) || `#${i + 1}`,
      subtitle: "", // lời đọc đã hiện ở phụ đề; không lặp lại
      tier: TIER_IDS[5 - rankFromWorst],
      first_scene: first,
      last_scene: last,
    });
  }
  const lang = language || "en";
  const headline = shortText(UI.headline[lang] || UI.headline.en || title || "", HEADLINE_MAX);
  return { headline, items };
}

// ---------------------------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------------------------

async function prepareAssets({ targetDir, compareDir }) {
  const copied = [];
  const dest = path.join(targetDir, SFX_DIR);
  await fs.mkdir(dest, { recursive: true });
  for (const file of Object.values(SFX_FILES)) {
    const source = path.join(compareDir, "shared", "audio", "sfx", file);
    const stat = await fs.stat(source).catch(() => null);
    if (!stat?.size) throw new Error(`tierlist SFX is missing: ${source}`);
    await fs.copyFile(source, path.join(dest, file));
    copied.push(path.join(dest, file));
  }
  return copied;
}

// ---------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------

const round = (value) => Math.round(Number(value) * 1000) / 1000;

/** Ước lượng cỡ chữ xác định (Node) theo số ký tự; script trong trang co tiếp theo đo thật. */
function estimateFont(text, { width, height, max, min, lineHeight = 1.18, charWidth = 0.6 }) {
  const chars = Math.max(1, [...String(text || "")].length);
  for (let size = max; size > min; size -= 1) {
    const perLine = Math.max(1, Math.floor(width / (size * charWidth)));
    const lines = Math.ceil(chars / perLine);
    if (lines * size * lineHeight <= height) return size;
  }
  return min;
}

function fitAttrs(text, box) {
  const size = estimateFont(text, box);
  return `data-fit data-fit-min="${box.min}" style="font-size:${size}px"`;
}

const TIER_SVG = {
  SSS: '<svg viewBox="0 0 24 24" width="34" height="34" fill="#ffffff"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>',
  S: '<svg viewBox="0 0 24 24" width="30" height="30" fill="#ffffff"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  A: '<svg viewBox="0 0 24 24" width="30" height="30" fill="#000000"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg>',
  B: '<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff"><circle cx="12" cy="12" r="10" stroke="#ffffff" stroke-width="2" fill="none"/><path d="M10 8h4c1.1 0 2 .9 2 2 0 .7-.4 1.3-1 1.7.8.4 1 1.1 1 1.8 0 1.1-.9 2-2 2h-4V8zm2 3h2c.55 0 1-.45 1-1s-.45-1-1-1h-2v2zm0 3.5h2.5c.55 0 1-.45 1-1s-.45-1-1-1H12v2z"/></svg>',
  C: '<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  D: '<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>',
};

// Toạ độ (px) — bảng: top 236, 6 hàng 136 + khe 10; khay bắt đầu ở x = 50 + 170 + 12 + 16.
const BOARD_TOP = 236;
const ROW_H = 136;
const ROW_GAP = 10;
const SLOT = 114;
const SLOT_GAP = 14;
const TRAY_X = 50 + 170 + 12 + 16;
const STAGE_TOP = 1122;
const ICON = { x: 50 + 30 + 540 + 24, y: STAGE_TOP + 24 + 128 + 10, size: 200 };

// Co chữ theo đo thật trong trang; xác định (không ngẫu nhiên), chạy một lần khi nạp và khi font sẵn sàng.
const FIT_SCRIPT = `<script data-tierlist-fit>
(function () {
  function fit(el) {
    if (!el.dataset.fitBase) el.dataset.fitBase = String(parseFloat(el.style.fontSize) || parseFloat(getComputedStyle(el).fontSize) || 20);
    var size = Number(el.dataset.fitBase), min = Number(el.dataset.fitMin || 14);
    el.style.fontSize = size + "px";
    if (!el.clientHeight) return;
    while (size > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }
  function fitAll() { Array.prototype.forEach.call(document.querySelectorAll("[data-fit]"), fit); }
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
})();
</script>`;

function planItems(extras, scenes) {
  const tierCounts = {};
  return extras.items.map((item, i) => {
    const covered = scenes.slice(item.first_scene - 1, item.last_scene);
    const verdict = covered[covered.length - 1];
    // Slam khi bậc được đọc ra ở cảnh verdict (như Studio: ~55 % lời verdict), không trễ quá 1.6 s.
    const slamTime = verdict.start + Math.min(verdict.duration * 0.55, 1.6);
    const slot = tierCounts[item.tier] || 0;
    tierCounts[item.tier] = slot + 1;
    const rowIndex = TIER_IDS.indexOf(item.tier);
    return {
      ...item,
      index: i + 1,
      id: `item-${i + 1}`,
      name: String(item.name).trim(),
      subtitle: String(item.subtitle || "").trim(),
      scenes: covered,
      start: covered[0].start,
      slamTime: round(slamTime),
      iconSrc: covered[0].imgSrc,
      slot,
      rowIndex,
      targetX: TRAY_X + slot * (SLOT + SLOT_GAP),
      targetY: BOARD_TOP + rowIndex * (ROW_H + ROW_GAP) + (ROW_H - SLOT) / 2,
    };
  });
}

/** Icon lặp lại (khay, avatar, thẻ bay): nền CSS thay vì <img> để media không bị phát hiện trùng. */
function iconTag(src, cls) {
  return `<div class="${cls}" style="background-image:url('${escapeHtml(src)}')"></div>`;
}

function imgTag(src, cls, alt) {
  return src ? `<img class="${cls}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` : `<div class="${cls} img-missing"></div>`;
}

async function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, extras, cinemaAudioHtml, scenes } = ctx;
  const problems = validate(extras, scenes);
  if (problems.length) throw new Error(`tierlist extras invalid: ${problems.join("; ")}`);
  if (scenes.some((scene) => !scene.voSrc)) throw new Error("tierlist: every scene needs its narration file");
  if (scenes.some((scene) => !scene.imgSrc)) throw new Error("tierlist: every scene needs its Antigravity image");
  const meta = langMeta(lang);
  const total = Number(totalDuration);
  const range = candidateRange(scenes.length);
  const items = planItems(extras, scenes);
  const intro = scenes[0];
  const outro = range.hasOutro ? scenes[scenes.length - 1] : null;
  const panelEnd = (i) => (i + 1 < items.length ? items[i + 1].start : outro ? outro.start : total);
  const champion = [...items].sort((a, b) => a.rowIndex - b.rowIndex || a.index - b.index)[0];
  const championTier = TIER_DEFINITIONS[champion.rowIndex];
  const headline = String(extras.headline).trim();
  const rootId = slug;
  const sel = (s) => `[data-composition-id="${rootId}"] ${s}`;

  const headerTitleBox = { width: 980, height: 100, max: 44, min: 22, charWidth: 0.66 };
  const nameBox = { width: 640, height: 56, max: 44, min: 20, charWidth: 0.66 };
  const subBox = { width: 640, height: 60, max: 26, min: 15, charWidth: 0.56 };
  const captionBox = { width: 960, height: 150, max: 44, min: 22, lineHeight: 1.2, charWidth: 0.62 };
  const introBox = { width: 880, height: 300, max: 84, min: 34, lineHeight: 1.12, charWidth: 0.68 };
  const champBox = { width: 560, height: 120, max: 56, min: 24, lineHeight: 1.1, charWidth: 0.66 };
  const labelBox = { width: 320, height: 34, max: 24, min: 12, charWidth: 0.62 };

  const rowsHtml = TIER_DEFINITIONS.map((tier) => `
      <div class="tier-row" id="tier-row-${tier.id}">
        <div class="tier-badge" style="background:${tier.bgGradient};border:2px solid ${tier.borderColor};color:${tier.textColor};">
          <div class="badge-icon">${TIER_SVG[tier.id]}</div>
          <span class="badge-name">${tier.name}</span>
        </div>
        <div class="tier-tray" id="tray-${tier.id}" style="border:2px solid ${tier.borderColor};">
          ${items.filter((it) => it.tier === tier.id).map((it) => `
          <div class="placed-item" id="placed-${it.id}" style="border:2px solid ${tier.borderColor};">
            ${iconTag(it.iconSrc, "placed-img")}
            <span class="placed-num">${it.index}</span>
          </div>`).join("")}
        </div>
      </div>`).join("");

  const introPanel = `
    <div id="intro-panel" class="stage-panel intro-panel clip" data-start="0" data-duration="${round(items[0].start)}" data-track-index="3">
      ${imgTag(intro.imgSrc, "panel-bg", "hook")}
      <div class="panel-shade"></div>
      <div class="intro-badge">${escapeHtml(meta.badge)}</div>
      <div class="intro-headline" ${fitAttrs(headline, introBox)}>${escapeHtml(headline)}</div>
      <div class="intro-count">${items.length} × ${escapeHtml(ui("candidate", lang))}</div>
    </div>`;

  const itemPanels = items.map((it, i) => {
    const tier = TIER_DEFINITIONS[it.rowIndex];
    const label = tierLabel(tier, lang);
    const end = panelEnd(i);
    return `
    <div id="panel-${it.id}" class="stage-panel contender-stage clip" data-start="${round(it.start)}" data-duration="${round(end - it.start)}" data-track-index="3">
      <div class="contender-header">
        <div class="contender-meta">
          <span class="contender-eyebrow">${escapeHtml(ui("candidate", lang))} #${it.index} / ${items.length}</span>
          <span class="contender-name" ${fitAttrs(it.name, nameBox)}>${escapeHtml(it.name)}</span>
          <span class="contender-tag" ${fitAttrs(it.subtitle, subBox)}>${escapeHtml(it.subtitle)}</span>
        </div>
        <div class="rank-pill">
          <span class="rank-label">${escapeHtml(ui("rank", lang))}</span>
          <span class="rank-value">
            <span class="rank-q" id="rank-q-${it.id}">?</span>
            <span class="rank-tier" id="rank-tier-${it.id}" style="color:${tier.borderColor}">${tier.name}</span>
          </span>
        </div>
      </div>
      <div class="showcase-body">
        <div class="showcase-visual">
          ${it.scenes.map((scene, k) => imgTag(scene.imgSrc, `showcase-img showcase-${it.id}-${k}`, `${it.name} ${k + 1}`).replace("<img ", `<img id="show-${it.id}-${k}" data-layout-allow-overflow `)).join("\n          ")}
        </div>
        <div class="showcase-info">
          <div class="showcase-avatar-box">${iconTag(it.iconSrc, "avatar-img")}</div>
          <div class="verdict-box" id="verdict-${it.id}" style="background:${tier.bgGradient};border:3px solid ${tier.borderColor};color:${tier.textColor};">
            <span class="verdict-tier">${tier.name}</span>
            ${label ? `<span class="verdict-label" ${fitAttrs(label, labelBox)}>${escapeHtml(label)}</span>` : ""}
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  const outroPanel = outro ? `
    <div id="outro-panel" class="stage-panel outro-panel clip" data-start="${round(outro.start)}" data-duration="${round(total - outro.start)}" data-track-index="3">
      ${imgTag(outro.imgSrc, "panel-bg", "outro")}
      <div class="panel-shade"></div>
      <div class="outro-title">${escapeHtml(ui("final", lang))}</div>
      <div class="champion-row" id="champion-row">
        <div class="champion-badge" style="background:${championTier.bgGradient};border:3px solid ${championTier.borderColor};color:${championTier.textColor};">${championTier.name}</div>
        <div class="champion-avatar">${iconTag(champion.iconSrc, "avatar-img")}</div>
        <div class="champion-text">
          <span class="champion-label">${escapeHtml(ui("champion", lang))}</span>
          <span class="champion-name" ${fitAttrs(champion.name, champBox)}>${escapeHtml(champion.name)}</span>
        </div>
      </div>
    </div>` : "";

  const flyingCards = items.map((it) => `
    <div id="fly-${it.id}" class="flying-card clip" data-start="${round(Math.max(0, it.slamTime - 0.5))}" data-duration="0.5" data-track-index="6">
      ${iconTag(it.iconSrc, "fly-img")}
    </div>`).join("");

  const captions = scenes.map((scene, i) => {
    const end = i + 1 < scenes.length ? scenes[i + 1].start : total;
    const text = lineOf(scene);
    return `
      <div id="caption-${scene.index}" class="caption clip" data-start="${round(scene.start)}" data-duration="${round(Math.max(0.1, end - scene.start))}" data-track-index="5">
        <div class="caption-text" ${fitAttrs(text, captionBox)}>${escapeHtml(text)}</div>
      </div>`;
  }).join("");

  const voHtml = scenes.map((scene) => `
      <audio id="vo-${scene.index}" class="clip" src="${escapeHtml(scene.voSrc)}" data-start="${round(scene.start)}" data-duration="${round(scene.duration)}" data-track-index="${20 + (scene.index % 2)}"></audio>`).join("");
  const sfxHtml = items.map((it, i) => `
      <audio id="tier-whoosh-${it.index}" class="clip" src="${SFX_DIR}/${SFX_FILES.whoosh}" data-start="${round(Math.max(0, it.slamTime - 0.5))}" data-duration="0.6" data-track-index="${42 + (i % 2)}" data-volume="0.35"></audio>
      <audio id="tier-slam-${it.index}" class="clip" src="${SFX_DIR}/${SFX_FILES.slam}" data-start="${it.slamTime}" data-duration="1.2" data-track-index="${40 + (i % 2)}" data-volume="0.55"></audio>`).join("");
  const bgmHtml = String(cinemaAudioHtml || "").includes("assets/audio/bgm.mp3")
    ? cinemaAudioHtml
    : `      <audio id="bgm" class="clip" src="assets/audio/bgm.mp3" data-start="0" data-duration="${total}" data-track-index="30" data-volume="0.12"></audio>\n${cinemaAudioHtml || ""}`;

  const timeline = {
    items: items.map((it) => ({
      id: it.id, tier: it.tier, start: round(it.start), slamTime: it.slamTime,
      targetX: it.targetX, targetY: it.targetY,
      shows: it.scenes.map((scene) => ({ start: round(scene.start), duration: round(scene.duration) })),
    })),
    outroStart: outro ? round(outro.start) : null,
  };

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 1080px; height: 1920px; background: #141312; overflow: hidden; }
    body { color: #fff; font-family: 'Montserrat', 'Inter', sans-serif; position: relative; }
    #tierlist-root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #141312; }
    .tierlist-bg { position: absolute; inset: 0; background-color: #141312;
      background-image: linear-gradient(to right, rgba(255,255,255,0.08) 1.5px, transparent 1.5px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1.5px, transparent 1.5px);
      background-size: 60px 60px; }
    .ambient-vignette { position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, transparent 40%, rgba(0,0,0,0.75) 100%); }
    .camera { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }

    .tierlist-header { position: absolute; top: 40px; left: 50px; width: 980px; height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .header-eyebrow { display: block; padding: 6px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #FCD34D; text-transform: uppercase; margin-bottom: 10px; max-width: 980px; white-space: nowrap; overflow: hidden; }
    .header-title { width: 980px; height: 100px; display: flex; align-items: center; justify-content: center; font-weight: 900; line-height: 1.15; text-transform: uppercase; color: #fff; text-shadow: 0 4px 16px rgba(0,0,0,0.9); overflow-wrap: anywhere; }

    .tier-board { position: absolute; top: ${BOARD_TOP}px; left: 50px; width: 980px; height: ${6 * ROW_H + 5 * ROW_GAP}px; display: flex; flex-direction: column; gap: ${ROW_GAP}px; }
    .tier-row { width: 980px; height: ${ROW_H}px; display: flex; align-items: center; position: relative; }
    .tier-badge { width: 170px; height: ${ROW_H}px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.4); }
    .badge-icon { height: 34px; line-height: 1; margin-bottom: 4px; }
    .badge-name { font-size: 46px; font-weight: 900; line-height: 1; letter-spacing: 1px; text-shadow: 0 3px 8px rgba(0,0,0,0.8), 0 0 2px #000; }
    .tier-tray { width: 798px; height: ${ROW_H}px; margin-left: 12px; background: rgba(18,16,15,0.94); border-radius: 16px; display: flex; align-items: center; padding: 0 16px; gap: ${SLOT_GAP}px; box-shadow: inset 0 4px 12px rgba(0,0,0,0.8); position: relative; overflow: hidden; }
    .placed-item { width: ${SLOT}px; height: ${SLOT}px; flex: 0 0 ${SLOT}px; border-radius: 14px; overflow: hidden; position: relative; box-shadow: 0 6px 14px rgba(0,0,0,0.8); }
    .placed-img { width: 100%; height: 100%; background-size: cover; background-position: center; display: block; }
    .placed-num { position: absolute; right: 6px; bottom: 6px; width: 34px; height: 34px; border-radius: 50%; background: rgba(0,0,0,0.78); color: #fff; font-size: 20px; font-weight: 900; line-height: 34px; text-align: center; }

    .stage-panel { position: absolute; top: ${STAGE_TOP}px; left: 50px; width: 980px; height: 600px; border-radius: 24px; overflow: hidden; background: rgba(22,19,18,0.96); border: 2px solid rgba(255,215,0,0.4); box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(255,215,0,0.1); }
    .panel-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .panel-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,9,8,0.55) 0%, rgba(10,9,8,0.82) 100%); }
    .img-missing { background: #2a2623; }
    .intro-badge { position: absolute; top: 40px; left: 50px; width: 880px; text-align: center; font-size: 26px; font-weight: 900; letter-spacing: 3px; color: #FCD34D; white-space: nowrap; overflow: hidden; }
    .intro-headline { position: absolute; top: 120px; left: 50px; width: 880px; height: 300px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 900; line-height: 1.12; text-transform: uppercase; color: #fff; text-shadow: 0 6px 24px rgba(0,0,0,0.95); overflow-wrap: anywhere; }
    .intro-count { position: absolute; top: 470px; left: 290px; width: 400px; height: 64px; border-radius: 999px; background: linear-gradient(135deg, #F59E0B, #D97706); color: #000; font-size: 28px; font-weight: 900; line-height: 64px; text-align: center; white-space: nowrap; overflow: hidden; }

    .contender-stage { padding: 24px 30px; }
    .contender-header { height: 128px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
    .contender-meta { width: 640px; display: flex; flex-direction: column; }
    .contender-eyebrow { display: block; height: 22px; font-size: 17px; font-weight: 800; color: #94A3B8; letter-spacing: 2px; text-transform: uppercase; white-space: nowrap; }
    .contender-name { display: block; width: 640px; height: 56px; font-weight: 900; color: #fff; text-transform: uppercase; line-height: 1.18; white-space: nowrap; }
    .contender-tag { display: block; width: 640px; height: 30px; font-weight: 700; color: #FBBF24; line-height: 1.15; }
    .rank-pill { width: 250px; height: 104px; border-radius: 22px; background: linear-gradient(135deg, #F59E0B, #D97706); color: #000; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; box-shadow: 0 4px 15px rgba(245,158,11,0.4); }
    .rank-label { width: 100px; font-size: 22px; font-weight: 900; white-space: nowrap; overflow: hidden; }
    .rank-value { position: relative; display: block; width: 110px; height: 80px; background: #120f0d; border-radius: 16px; }
    .rank-q, .rank-tier { position: absolute; left: 0; top: 0; display: block; width: 110px; height: 80px; line-height: 80px; text-align: center; font-size: 50px; font-weight: 900; }
    .rank-q { color: #fff; }
    .showcase-body { display: flex; gap: 24px; align-items: center; margin-top: 12px; height: 412px; }
    .showcase-visual { width: 540px; height: 400px; border-radius: 18px; overflow: hidden; border: 2px solid rgba(255,255,255,0.15); position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.7); flex: 0 0 540px; }
    .showcase-img { position: absolute; left: 0; top: 0; width: 540px; height: 400px; object-fit: cover; display: block; }
    .showcase-info { width: 352px; height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
    .showcase-avatar-box { width: ${ICON.size}px; height: ${ICON.size}px; border-radius: 22px; overflow: hidden; border: 3px solid #FBBF24; box-shadow: 0 8px 25px rgba(0,0,0,0.6); }
    .avatar-img { width: 100%; height: 100%; background-size: cover; background-position: center; display: block; }
    .verdict-box { width: 352px; height: 170px; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(0,0,0,0.7); }
    .verdict-tier { display: block; font-size: 84px; font-weight: 900; line-height: 1; text-shadow: 0 4px 12px rgba(0,0,0,0.7); }
    .verdict-label { display: block; width: 320px; height: 34px; margin-top: 8px; text-align: center; font-weight: 900; letter-spacing: 1px; white-space: nowrap; line-height: 34px; }

    .outro-title { position: absolute; top: 60px; left: 40px; width: 900px; text-align: center; font-size: 44px; font-weight: 900; color: #FCD34D; letter-spacing: 2px; white-space: nowrap; overflow: hidden; text-shadow: 0 4px 16px rgba(0,0,0,0.9); }
    .champion-row { position: absolute; top: 200px; left: 40px; width: 900px; height: 260px; display: flex; align-items: center; gap: 28px; }
    .champion-badge { width: 150px; height: 150px; flex: 0 0 150px; border-radius: 24px; font-size: 60px; font-weight: 900; line-height: 150px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.7); }
    .champion-avatar { width: 180px; height: 180px; flex: 0 0 180px; border-radius: 24px; overflow: hidden; border: 3px solid #FBBF24; }
    .champion-text { width: 500px; display: flex; flex-direction: column; }
    .champion-label { display: block; height: 34px; font-size: 26px; font-weight: 900; color: #FBBF24; letter-spacing: 2px; white-space: nowrap; }
    .champion-name { display: block; width: 500px; height: 120px; font-weight: 900; color: #fff; text-transform: uppercase; line-height: 1.1; overflow-wrap: anywhere; }

    .flying-card { position: absolute; left: 0; top: 0; width: ${SLOT}px; height: ${SLOT}px; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 35px rgba(0,0,0,0.9), 0 0 25px rgba(255,255,255,0.5); }
    .fly-img { width: 100%; height: 100%; background-size: cover; background-position: center; display: block; }

    .caption { position: absolute; top: 1738px; left: 50px; width: 980px; height: 160px; display: flex; align-items: center; justify-content: center; }
    .caption-text { width: 960px; height: 150px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 900; text-transform: uppercase; line-height: 1.2; color: #fff; letter-spacing: 0.5px; text-shadow: 0 0 18px rgba(0,229,255,0.75), 0 0 5px #00E5FF, 0 3px 8px #000; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <div id="tierlist-root" data-composition-id="${rootId}" data-width="1080" data-height="1920" data-start="0" data-duration="${total}">
    <div class="tierlist-bg"></div>
    <div class="ambient-vignette"></div>
    <div id="camera" class="camera">
      <div id="tierlist-header" class="tierlist-header clip" data-start="0" data-duration="${total}" data-track-index="1">
        <div class="header-eyebrow">${escapeHtml(meta.eyebrow)}</div>
        <div class="header-title" ${fitAttrs(title, headerTitleBox)}>${escapeHtml(title)}</div>
      </div>
      <div id="tier-board" class="tier-board clip" data-start="0" data-duration="${total}" data-track-index="2">${rowsHtml}
      </div>
      ${introPanel}
      ${itemPanels}
      ${outroPanel}
    </div>
    ${flyingCards}
    ${captions}
    <div id="audio-tracks">
${bgmHtml}
${voHtml}
${sfxHtml}
    </div>
  </div>
${FIT_SCRIPT}
  <script>
    (function () {
      var PLAN = ${JSON.stringify(timeline)};
      var ROOT = ${JSON.stringify(`[data-composition-id="${rootId}"]`)};
      function q(s) { return ROOT + " " + s; }
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });

      tl.fromTo(q("#tierlist-header"), { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }, 0.05);
      tl.fromTo(q(".tier-row"), { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: "power2.out" }, 0.15);
      tl.fromTo(q("#intro-panel"), { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.4)" }, 0);
      tl.fromTo(q("#intro-panel .intro-headline"), { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.1);

      PLAN.items.forEach(function (it) {
        var panel = q("#panel-" + it.id);
        tl.fromTo(panel, { scale: 0.94, opacity: 0.3 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.4)" }, it.start);
        tl.fromTo(q("#placed-" + it.id), { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power3.out" }, it.slamTime);
        it.shows.forEach(function (show, k) {
          var img = q("#show-" + it.id + "-" + k);
          if (k > 0) tl.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, show.start);
          tl.fromTo(img, { scale: 1 }, { scale: 1.08, duration: Math.max(0.5, show.duration), ease: "none" }, show.start);
        });
        // Bậc được công bố: "?" tắt, chữ bậc + hộp verdict đập vào.
        tl.fromTo(q("#rank-q-" + it.id), { opacity: 1 }, { opacity: 0, duration: 0.08 }, it.slamTime - 0.08);
        tl.fromTo(q("#rank-tier-" + it.id), { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.25, ease: "power3.out" }, it.slamTime - 0.05);
        tl.fromTo(q("#verdict-" + it.id), { opacity: 0, scale: 1.2 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out" }, it.slamTime - 0.05);
        // Bay từ icon trên sân khấu vào khay của bậc.
        tl.fromTo(q("#fly-" + it.id), { x: ${ICON.x}, y: ${ICON.y}, scale: ${round(ICON.size / SLOT)}, rotation: -8, transformOrigin: "0% 0%" },
          { x: it.targetX, y: it.targetY, scale: 1, rotation: 0, duration: 0.48, ease: "power3.in" }, it.slamTime - 0.5);
        // Rung máy quay + loé sáng hàng bậc khi chạm.
        tl.to(q("#camera"), { x: -14, y: 9, duration: 0.05, ease: "none" }, it.slamTime)
          .to(q("#camera"), { x: 11, y: -7, duration: 0.05, ease: "none" })
          .to(q("#camera"), { x: -6, y: 4, duration: 0.05, ease: "none" })
          .to(q("#camera"), { x: 0, y: 0, duration: 0.2, ease: "power2.out" });
        tl.to(q("#tier-row-" + it.tier), { filter: "brightness(1.7)", duration: 0.06 }, it.slamTime)
          .to(q("#tier-row-" + it.tier), { filter: "brightness(1)", duration: 0.45, ease: "power2.out" });
      });

      if (PLAN.outroStart !== null) {
        tl.fromTo(q("#outro-panel"), { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.4)" }, PLAN.outroStart);
        tl.fromTo(q("#champion-row"), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, PLAN.outroStart + 0.25);
        tl.to(q("#tier-board"), { scale: 1.02, duration: 1.2, ease: "power1.inOut" }, PLAN.outroStart);
      }
      tl.set({}, {}, ${total});
      window.__timelines[${JSON.stringify(rootId)}] = tl;
    })();
  </script>
</body>
</html>`;

  const cfg = {
    ...ctx.common,
    engine: "tierlist",
    headline,
    eyebrow: meta.eyebrow,
    hookScene: 1,
    outroScene: outro ? outro.index : null,
    items: items.map((it) => ({
      name: it.name, subtitle: it.subtitle, tier: it.tier, first_scene: it.first_scene, last_scene: it.last_scene,
      start: round(it.start), slamTime: it.slamTime, iconSrc: it.iconSrc,
    })),
    scenes: scenes.map((scene) => ({ index: scene.index, start: scene.start, duration: scene.duration, voSrc: scene.voSrc, imgSrc: scene.imgSrc })),
    totalDuration: total,
  };
  return { html, cfg };
}

export default {
  id: "tierlist",
  configKey: "tierListConfig",
  voPrefix: "line",
  // Tier list cần ảnh ứng viên: 1 ảnh Antigravity/cảnh; ảnh cảnh đầu của ứng viên dùng lại làm icon (crop vuông).
  assetType: "IMAGE_AI",
  imageName: (index, ext) => `assets/images/scene-${index}${ext}`,
  extras: { schema, prompt, validate, fallback },
  prepareAssets,
  buildHtml,
  compositionId: (slug) => slug,
};
