// survival/mr-incredible — format meme "Mr. Incredible Becoming Uncanny": mặt Mr. Incredible theo pha 1→9 (ảnh
// shared/assets/survival/mrincredible/, chép offline vào assets/kit/mrincredible/ của video) là nhân vật chính, pha chọn
// theo mức độ của cảnh (càng cao càng uncanny/tối); nhãn cấp (STUFE n/L) + nhãn cấp của extras + trạng thái; nền của
// cảnh tối dần theo mức độ. Dữ liệu từ skit.resolveSurvival như survival/original.
//
// OPT-IN (autoAssign: false): ảnh là của bên thứ ba (chủ repo chấp nhận rủi ro IP cho riêng variant này), nên Creative
// DNA, assign-skins và getVariantsForCountry KHÔNG BAO GIỜ gán nó; chỉ kênh ghi rõ `creative.variant_id` mới dùng.
// Đường legacy survival và 8 variant còn lại vẫn dùng reactor SVG gốc.
//
// Composition 1 (meme_classic): lời đọc trên cùng, mặt lớn giữa màn, nhãn cấp + mức độ dưới mặt.
// Composition 2 (face_card): mặt bên trái cạnh thẻ cấp độ, dải 9 pha meme (pha hiện tại sáng), 3 thanh chỉ số,
// lời đọc dưới cùng.
import fs from "node:fs/promises";
import path from "node:path";
import { getSurvivalConfig } from "../../../../tools/survival-languages.mjs";
import { NO_IMAGE_COST, TEXT_ASSET } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { survivalSample } from "./sample.mjs";
import { inkOn, resolveSurvival, t3 } from "./skit.mjs";

export const FACE_PHASES = 9;
const FACE_SOURCE = ["shared", "assets", "survival", "mrincredible"];
export const FACE_DIR = "assets/kit/mrincredible";

/** Mức độ 1–10 → pha meme 1–9 (cùng ánh xạ với engine survival cũ trước khi bỏ bộ mặt). */
export function facePhase(severity) {
  return 1 + Math.round(((Math.min(10, Math.max(1, severity)) - 1) * (FACE_PHASES - 1)) / 9);
}

const faceSrc = (phase) => `${FACE_DIR}/phase-${phase}.png`;

/** Chép 9 pha vào video (offline, không hot-link); thiếu file → lỗi rõ ràng, không lặng lẽ thay ảnh khác. */
async function prepareAssets({ targetDir, compareDir }) {
  const dest = path.join(targetDir, ...FACE_DIR.split("/"));
  await fs.mkdir(dest, { recursive: true });
  const copied = [];
  for (let phase = 1; phase <= FACE_PHASES; phase += 1) {
    const source = path.join(compareDir, ...FACE_SOURCE, `phase-${phase}.png`);
    const stat = await fs.stat(source).catch(() => null);
    if (!stat?.isFile() || !stat.size) throw new Error(`survival/mr-incredible face is missing: ${source}`);
    const file = path.join(dest, `phase-${phase}.png`);
    await fs.copyFile(source, file);
    copied.push(file);
  }
  return copied;
}

// Màu mức độ 1–10 (xanh → vàng → đỏ → tím) và nền cảnh tối dần: xám ấm ở mức 1, đen tuyền ở mức 10.
const SEVERITY_COLORS = ["#3ddc84", "#7bd84a", "#c6d93a", "#ffd23f", "#ffa53f", "#ff7a3d", "#ff4d4d", "#f0304f", "#d61f69", "#b56cff"];
const sevColor = (s) => SEVERITY_COLORS[Math.min(10, Math.max(1, s)) - 1];
function backdrop(severity) {
  const k = (Math.min(10, Math.max(1, severity)) - 1) / 9;
  const light = Math.round(34 * (1 - k) ** 1.3);
  const glow = severity >= 7 ? `radial-gradient(ellipse at 50% 45%,rgba(150,0,20,${(0.1 + (severity - 7) * 0.06).toFixed(2)}),transparent 65%),` : "";
  return `${glow}radial-gradient(ellipse at 50% 42%,hsl(215 10% ${light + 6}%) 0%,hsl(215 12% ${Math.max(0, light - 4)}%) 58%,#000 100%)`;
}

function levelWords(lang) {
  const base = getSurvivalConfig(lang);
  const known = base.lang === lang;
  return {
    levelPrefix: known ? base.levelPrefix : "LEVEL",
    prologueTag: known ? base.prologueTag : "PROLOGUE",
    finalTag: known ? base.finalTag : "FINAL",
    meter: known ? base.reactionLabel : "REACTION: UNCANNY METER",
  };
}

function tagOf(item, words) {
  if (item.role === "prologue") return words.prologueTag;
  if (item.role === "outro") return words.finalTag;
  return `${words.levelPrefix} ${item.levelNo}/${item.levelTotal}`;
}

/** Hộp cố định + chữ tự co (kit data-fit). */
function fitIn(cls, text, { size, min = 14, tag = "span", id = "", style = "" }) {
  const inner = `${cls.split(" ")[0]}-t`;
  return `<div class="${cls}"${id ? ` id="${id}"` : ""}${style ? ` style="${style}"` : ""}>${fitText(tag, `class="${inner}" style="font-size:${size}px"`, text, min)}</div>`;
}

const pips = (severity) => Array.from({ length: 10 }, (_, p) => `<i style="background:${p < severity ? sevColor(p + 1) : "rgba(255,255,255,.12)"}"></i>`).join("");

const LAYOUT = {
  meme_classic: {
    caption: { x: 60, y: 262, w: 960, h: 236 },
    face: { x: 150, y: 520, w: 780, h: 780 },
    tag: { x: 60, y: 1340, w: 960, h: 120 },
    label: { x: 60, y: 1470, w: 960, h: 150 },
    meter: { x: 150, y: 1650, w: 780, h: 150 },
  },
  face_card: {
    face: { x: 40, y: 290, w: 520, h: 520 },
    card: { x: 584, y: 290, w: 456, h: 520 },
    strip: { x: 40, y: 850, w: 1000, h: 132 },
    metrics: { x: 60, y: 1020, w: 960, h: 390 },
    caption: { x: 60, y: 1450, w: 960, h: 360 },
  },
};

const CSS = `
.v-bg-fill{background:linear-gradient(180deg,#23262c 0%,#0b0c0f 70%,#000 100%)!important}
#root{color:#f4f4f4}
.mi-bd{position:absolute;inset:0;z-index:0}
[id^='v-frame-']{z-index:2}
.f-plain{border-color:#0b0b0b!important;box-shadow:0 0 0 2px rgba(255,255,255,.08),0 30px 70px rgba(0,0,0,.75)!important;background:#000}
.mi-shake{position:absolute;inset:0}
.mi-face{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 40%}
.mi-eyebrow{position:absolute;left:50%;top:44px;transform:translateX(-50%);height:52px;max-width:960px;box-sizing:border-box;padding:0 26px;display:flex;align-items:center;border-radius:999px;background:#000;border:2px solid rgba(255,255,255,.35);white-space:nowrap}
.mi-eb{position:relative;height:32px;max-width:900px;display:flex;align-items:center}
.mi-eb-t{margin:0;letter-spacing:3px;color:#f4f4f4;white-space:nowrap}
.mi-title{position:absolute;left:60px;top:110px;width:960px;height:132px;display:flex;align-items:center;justify-content:center}
.mi-title-t{margin:0;width:100%;line-height:1.1;text-align:center;text-transform:uppercase;color:#fff;text-shadow:0 4px 0 #000,0 0 22px rgba(0,0,0,.9)}
.mi-tag{position:absolute;display:flex;align-items:center;justify-content:center;z-index:5}
.mi-tag-t{margin:0;line-height:1;letter-spacing:2px;white-space:nowrap;text-transform:uppercase;text-shadow:0 5px 0 #000,0 0 26px rgba(0,0,0,.9)}
.mi-label{position:absolute;display:flex;align-items:center;justify-content:center;z-index:5}
.mi-label-t{margin:0;width:100%;line-height:1.12;text-align:center;text-transform:uppercase;color:#fff;text-shadow:0 3px 0 #000}
.mi-meter{position:absolute;z-index:5;display:flex;flex-direction:column;gap:14px}
.mi-mrow{height:62px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.mi-status{position:relative;height:60px;flex:1;min-width:0;box-sizing:border-box;padding:0 20px;display:flex;align-items:center}
.mi-status-t{margin:0;letter-spacing:2px;white-space:nowrap}
.mi-sev{flex:none;white-space:nowrap;line-height:1;font-size:58px;color:#fff}
.mi-sev small{font-size:26px;opacity:.7}
.mi-pips{display:flex;gap:8px;height:30px}.mi-pips i{flex:1;border-radius:4px}
.mi-mname{position:relative;height:30px;width:100%;display:flex;align-items:center}
.mi-mname-t{margin:0;letter-spacing:2px;color:#cfcfcf;white-space:nowrap}
.mi-card{position:absolute;z-index:5;box-sizing:border-box;padding:28px 26px;background:rgba(0,0,0,.72);border:3px solid;border-radius:22px;display:flex;flex-direction:column;gap:16px}
.mi-card .mi-tag,.mi-card .mi-label,.mi-card .mi-mname{position:relative}
.mi-card .mi-tag{height:76px;justify-content:flex-start}
.mi-card .mi-label{flex:1;min-height:0;justify-content:flex-start}
.mi-card .mi-label-t{text-align:left}
.mi-card .mi-mrow{height:60px}
.mi-strip{position:absolute;z-index:5;display:flex;justify-content:space-between;align-items:flex-end}
.mi-thumb{position:relative;width:100px;height:100px;border-radius:12px;overflow:hidden;border:3px solid rgba(255,255,255,.15);filter:grayscale(1) brightness(.45);background:#000}
.mi-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.mi-thumb.on{width:108px;height:108px;border-color:var(--mi-sev);filter:none;box-shadow:0 0 24px var(--mi-sev)}
.mi-metrics{position:absolute;z-index:5;display:flex;flex-direction:column;justify-content:space-between}
.mi-m{height:108px;display:grid;grid-template-columns:1fr 170px;grid-template-rows:44px 34px;column-gap:16px;row-gap:10px}
.mi-m-name{position:relative;grid-column:1;grid-row:1;display:flex;align-items:center;min-width:0}
.mi-m-name-t{margin:0;letter-spacing:2px;color:#e6e6e6;white-space:nowrap}
.mi-m-val{grid-column:2;grid-row:1/3;align-self:center;text-align:right;font-size:44px;color:#fff;white-space:nowrap}
.mi-m-track{grid-column:1;grid-row:2;position:relative;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.12)}
.mi-m-fill{position:absolute;inset:0;display:block;transform-origin:0 50%}
.t-subtitle .v-line{text-transform:none}`;

/** Đầu trang xuyên suốt: eyebrow (viên thuốc đen) + tiêu đề in hoa viền đen kiểu meme. */
function header(ctx, data) {
  return {
    html: `<div class="mi-eyebrow">${fitIn("mi-eb", data.eyebrow, { size: 22 })}</div>
${fitIn("mi-title", ctx.title, { size: 58, min: 24, tag: "h1" })}`,
    tweens: [],
  };
}

/** Rung mặt khi mức độ ≥ 7 (tween tất định trên lớp bọc, không đụng #v-img mà image motion dùng). */
function shakeTweens(scene, severity) {
  if (severity < 7) return [];
  const amp = 3 + (severity - 7) * 2.5;
  const target = `#mi-shake-${scene.index}`;
  const steps = Math.min(10, Math.max(4, Math.floor((scene.visualDuration * 0.4) / 0.08)));
  return Array.from({ length: steps }, (_, k) => ({
    method: "to", target, vars: { x: k === steps - 1 ? 0 : t3(k % 2 ? -amp : amp), y: k === steps - 1 ? 0 : t3((k % 3 - 1) * amp * 0.4), duration: 0.07, ease: "none" },
    at: t3(scene.visualStart + 0.25 + k * 0.08),
  }));
}

function statusRow(item, idx, color) {
  return `<div class="mi-mrow">${fitIn("mi-status", item.status, { size: 30, min: 14, id: `mi-status-${idx}`, style: `background:${color};color:${inkOn(color)}` })}<div class="mi-sev"><b style="color:${color}">${item.severity}</b><small>/10</small></div></div>`;
}

function classicParts(scene, i, ctx, data) {
  const L = LAYOUT.meme_classic;
  const idx = scene.index;
  const item = data.items[i];
  const color = sevColor(item.severity);
  const words = levelWords(ctx.lang);
  const html = `<div class="mi-bd" style="background:${backdrop(item.severity)}"></div>
${fitIn("mi-tag", tagOf(item, words), { size: 104, min: 36, id: `mi-tag-${idx}`, style: `${regionStyle(L.tag)};color:${color}` })}
${fitIn("mi-label", item.label, { size: 54, min: 22, tag: "h2", style: regionStyle(L.label) })}
<div class="mi-meter" style="${regionStyle(L.meter)}">${fitIn("mi-mname", words.meter, { size: 24, min: 12 })}${statusRow(item, idx, color)}<div class="mi-pips">${pips(item.severity)}</div></div>`;
  const at = scene.visualStart;
  const tweens = [
    { method: "fromTo", target: `#mi-tag-${idx}`, from: { scale: 1.35 }, vars: { scale: 1, duration: 0.3, ease: "back.out(2)" }, at: t3(at + 0.05) },
    { method: "fromTo", target: `#mi-status-${idx}`, from: { scale: 0.2 }, vars: { scale: 1, duration: 0.3, ease: "back.out(2)" }, at: t3(at + 0.3) },
    ...shakeTweens(scene, item.severity),
  ];
  return { html, tweens };
}

function cardParts(scene, i, ctx, data) {
  const L = LAYOUT.face_card;
  const idx = scene.index;
  const item = data.items[i];
  const color = sevColor(item.severity);
  const words = levelWords(ctx.lang);
  const phase = facePhase(item.severity);
  const thumbs = Array.from({ length: FACE_PHASES }, (_, k) => `<div class="mi-thumb${k + 1 === phase ? " on" : ""}"><img src="${faceSrc(k + 1)}" alt=""></div>`).join("");
  const prev = i ? data.items[i - 1].metrics : item.metrics.map(() => 100);
  const metrics = item.metrics.map((value, m) => `<div class="mi-m">${fitIn("mi-m-name", data.metricLabels[m], { size: 30, min: 14 })}<div class="mi-m-val">${value}%</div><div class="mi-m-track"><i class="mi-m-fill" id="mi-fill-${idx}-${m}" style="background:${sevColor(Math.max(1, 11 - Math.ceil(value / 10)))}"></i></div></div>`).join("");
  const html = `<div class="mi-bd" style="background:${backdrop(item.severity)}"></div>
<div class="mi-card" id="mi-card-${idx}" style="${regionStyle(L.card)};border-color:${color}">
${fitIn("mi-tag", tagOf(item, words), { size: 58, min: 22, id: `mi-tag-${idx}`, style: `color:${color}` })}
${fitIn("mi-label", item.label, { size: 42, min: 18, tag: "h2" })}
${statusRow(item, idx, color)}
<div class="mi-pips">${pips(item.severity)}</div>
</div>
<div class="mi-strip" style="${regionStyle(L.strip)};--mi-sev:${color}">${thumbs}</div>
<div class="mi-metrics" style="${regionStyle(L.metrics)}">${metrics}</div>`;
  const at = scene.visualStart;
  const tweens = [
    { method: "fromTo", target: `#mi-card-${idx}`, from: { x: 40 }, vars: { x: 0, duration: 0.35, ease: "power3.out" }, at: t3(at + 0.05) },
    { method: "fromTo", target: `#mi-status-${idx}`, from: { scale: 0.2 }, vars: { scale: 1, duration: 0.3, ease: "back.out(2)" }, at: t3(at + 0.35) },
    ...item.metrics.map((value, m) => ({
      method: "fromTo", target: `#mi-fill-${idx}-${m}`, from: { scaleX: Math.max(0.005, prev[m] / 100) },
      vars: { scaleX: Math.max(0.005, value / 100), duration: t3(Math.min(0.9, scene.visualDuration * 0.3)), ease: "power2.inOut" }, at: t3(at + 0.25),
    })),
    ...shakeTweens(scene, item.severity),
  ];
  return { html, tweens };
}

function design(compId) {
  const L = LAYOUT[compId];
  return (ctx) => {
    const data = resolveSurvival(ctx);
    const parts = compId === "meme_classic" ? classicParts : cardParts;
    return {
      header: null,
      visual: { frame: "plain", region: L.face },
      panel: (scene, i) => `<div class="mi-shake" id="mi-shake-${scene.index}"><img class="mi-face" src="${faceSrc(facePhase(data.items[i].severity))}" alt=""></div>`,
      text: { style: "subtitle", region: L.caption, size: compId === "meme_classic" ? 50 : 48, align: "center", enter: "pop" },
      sceneExtra: (scene, i, sctx) => parts(scene, i, sctx, data),
      overlay: (octx) => ({ ...header(octx, data), css: "" }),
      css: CSS,
    };
  };
}

const UI = {
  en: { label: "SURVIVAL LEVELS", scene: "LEVEL" },
  vi: { label: "CÁC CẤP SINH TỒN", scene: "CẤP" },
  de: { label: "ÜBERLEBENSSTUFEN", scene: "STUFE" },
  fr: { label: "NIVEAUX DE SURVIE", scene: "NIVEAU" },
  ja: { label: "生存レベル", scene: "レベル" },
  ko: { label: "생존 단계", scene: "단계" },
};

const mrIncredible = defineVariant({
  engine: "survival",
  asset: TEXT_ASSET,
  cost: NO_IMAGE_COST,
  sample: survivalSample,
  id: "survival/mr-incredible",
  name_vi: "Mr. Incredible hoá uncanny (meme, opt-in)",
  prepareAssets,
  topicPacks: { survival_body_limits: 0.5, survival_extreme_sports: 0.25, survival_deep_ocean: 0.25 },
  layoutFamily: "uncanny_meme",
  axes: { composition: "poster", textPlacement: "top", background: "gradient", transition: "cut", imageMotion: "push_in", typography: "heavy" },
  audio: { gender: "any", fx: ["none"] },
  ui: UI,
  compositions: {
    meme_classic: {
      axes: { composition: "poster", textPlacement: "top" },
      describe: "Meme gốc: lời đọc trên cùng, mặt Mr. Incredible (pha 1–9 theo mức độ) lớn giữa màn, nhãn cấp to màu mức độ + nhãn cấp + trạng thái + vạch mức độ dưới mặt; nền tối dần, mặt rung khi mức độ ≥ 7",
      design: design("meme_classic"),
    },
    face_card: {
      axes: { composition: "split_vertical", textPlacement: "bottom" },
      describe: "Anh em: mặt bên trái cạnh thẻ cấp độ (nhãn cấp, trạng thái, N/10), dải 9 pha meme với pha hiện tại sáng, 3 thanh chỉ số, lời đọc dưới cùng",
      design: design("face_card"),
    },
  },
  allowed: {
    typography: ["heavy", "condensed", "grotesk"], treatment: ["clean", "film_grain"],
    image_motion: ["push_in", "still_grain", "ken_burns_slow"], transition: ["cut", "fade_black", "zoom_through"], tone: [0, 1, 2, 4],
  },
});

export default mrIncredible;
