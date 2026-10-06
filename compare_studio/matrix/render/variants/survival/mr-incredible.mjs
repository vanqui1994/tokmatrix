// survival/mr-incredible — format meme "Mr. Incredible Becoming Uncanny": mặt Mr. Incredible theo pha 1→9 (ảnh
// shared/assets/survival/mrincredible/, chép offline vào assets/kit/mrincredible/ của video) là nhân vật chính, pha chọn
// theo mức độ của cảnh (càng cao càng uncanny/tối); nhãn cấp (STUFE n/L) + nhãn cấp của extras + trạng thái; nền của
// cảnh tối dần theo mức độ. Dữ liệu từ skit.resolveSurvival như survival/original.
//
// OPT-IN (autoAssign: false): ảnh là của bên thứ ba (chủ repo chấp nhận rủi ro IP cho riêng variant này), nên Creative
// DNA, assign-skins và getVariantsForCountry KHÔNG BAO GIỜ gán nó; chỉ kênh ghi rõ `creative.variant_id` mới dùng.
// Đường legacy survival và 8 variant còn lại vẫn dùng reactor SVG gốc.
//
// Composition 1 (legacy): bố cục template Sinh Tồn cũ (videos/survival-without-organs): eyebrow + tiêu đề + thanh tiến độ
// "LEVEL n/L"; thẻ quét trên (4 góc) với ảnh AI của cảnh, tên cấp, trạng thái, ô mức độ; thẻ dưới là mặt Mr. Incredible
// với nhãn "REACTION: UNCANNY METER"; lời đọc dưới cùng. Ảnh AI 1/cảnh (IMAGE_ASSET) như bản cũ (tier-N.jpg).
// Composition 2 (face_card): mặt bên trái cạnh thẻ cấp độ, ảnh cảnh rộng ở giữa, lời đọc dưới cùng.
import fs from "node:fs/promises";
import path from "node:path";
import { getSurvivalConfig } from "../../../../tools/survival-languages.mjs";
import { IMAGE_ASSET, IMAGE_COST } from "../common.mjs";
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
  legacy: {
    scan: { x: 60, y: 300, w: 960, h: 700 },
    image: { x: 110, y: 340, w: 860, h: 400 },
    label: { x: 100, y: 758, w: 880, h: 84 },
    status: { x: 100, y: 846, w: 880, h: 46 },
    limit: { x: 150, y: 906, w: 780, h: 72 },
    faceCard: { x: 60, y: 1030, w: 960, h: 640 },
    caption: { x: 70, y: 1696, w: 940, h: 190 },
  },
  face_card: {
    face: { x: 40, y: 290, w: 520, h: 520 },
    card: { x: 584, y: 290, w: 456, h: 520 },
    image: { x: 40, y: 850, w: 1000, h: 560 },
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
.t-subtitle .v-line{text-transform:none}
.lg-head{position:absolute;left:0;top:0;width:1080px;height:290px;z-index:6}
.lg-eyebrow{position:absolute;left:50%;top:86px;transform:translateX(-50%);height:44px;max-width:900px;box-sizing:border-box;padding:0 26px;display:flex;align-items:center;gap:12px;border-radius:999px;background:rgba(0,40,40,.55);border:2px solid rgba(64,224,208,.35);white-space:nowrap}
.lg-eyebrow:before{content:"";width:10px;height:10px;border-radius:50%;background:#40e0d0;box-shadow:0 0 10px #40e0d0}
.lg-eb{position:relative;height:28px;max-width:820px;display:flex;align-items:center}
.lg-eb-t{margin:0;letter-spacing:4px;color:#40e0d0;white-space:nowrap;font-family:var(--mono-font,monospace)}
.lg-title{position:absolute;left:60px;top:140px;width:960px;height:84px;display:flex;align-items:center;justify-content:center}
.lg-title-t{margin:0;width:100%;text-align:center;text-transform:uppercase;line-height:1.05;color:#dfe9f2;text-shadow:0 0 24px rgba(120,200,255,.35)}
.lg-bar{position:absolute;left:60px;top:236px;width:810px;height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
.lg-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:linear-gradient(90deg,#40e0d0,#e0245e)}
.lg-lvl{position:absolute;right:60px;top:222px;height:36px;width:150px;display:flex;align-items:center;justify-content:flex-end}
.lg-lvl-t{margin:0;letter-spacing:2px;color:#40e0d0;white-space:nowrap;font-family:var(--mono-font,monospace)}
.lg-scan{position:absolute;z-index:1;box-sizing:border-box;border:2px solid rgba(64,224,208,.28);border-radius:30px;background:rgba(10,20,26,.72)}
.lg-scan b{position:absolute;width:24px;height:24px;border-color:#dfe9f2;border-style:solid}
.lg-scan .c1{left:18px;top:18px;border-width:3px 0 0 3px}.lg-scan .c2{right:18px;top:18px;border-width:3px 3px 0 0}
.lg-scan .c3{left:18px;bottom:18px;border-width:0 0 3px 3px}.lg-scan .c4{right:18px;bottom:18px;border-width:0 3px 3px 0}
.lg-label{position:absolute;z-index:5;display:flex;align-items:center;justify-content:center}
.lg-label-t{margin:0;width:100%;text-align:center;text-transform:uppercase;line-height:1.05;color:#fff}
.lg-status{position:absolute;z-index:5;display:flex;align-items:center;justify-content:center}
.lg-status-t{margin:0;width:100%;text-align:center;text-transform:uppercase;letter-spacing:1px;color:#9aa8b4}
.lg-limit{position:absolute;z-index:5;box-sizing:border-box;border:3px solid;border-radius:18px;background:#07090c;display:flex;align-items:center;justify-content:center;gap:18px;padding:0 26px}
.lg-limit-k{letter-spacing:3px;color:#b8c2cc;font-size:24px;white-space:nowrap;font-family:var(--mono-font,monospace)}
.lg-limit-v{position:relative;height:48px;flex:1;min-width:0;display:flex;align-items:center}
.lg-limit-v-t{margin:0;letter-spacing:2px;white-space:nowrap;font-family:var(--mono-font,monospace)}
.lg-face{position:absolute;z-index:2;box-sizing:border-box;border:2px solid rgba(255,255,255,.1);border-radius:30px;overflow:hidden;background:#000}
.lg-face .mi-shake{position:absolute;inset:0}
.lg-badge{position:absolute;left:26px;top:24px;z-index:3;height:42px;padding:0 20px;display:flex;align-items:center;border-radius:10px;background:#000;border:2px solid rgba(255,255,255,.2)}
.lg-badge-t{margin:0;letter-spacing:2px;color:#f4f4f4;white-space:nowrap;font-family:var(--mono-font,monospace)}
.lg-lvw{font-weight:800}
.fc-face{position:absolute;z-index:5;border-radius:22px;overflow:hidden;background:#000;box-shadow:0 0 0 2px rgba(255,255,255,.08),0 30px 70px rgba(0,0,0,.75)}
.fc-face .mi-shake{position:absolute;inset:0}`;

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

function legacyParts(scene, i, ctx, data) {
  const L = LAYOUT.legacy;
  const idx = scene.index;
  const item = data.items[i];
  const color = sevColor(item.severity);
  const words = levelWords(ctx.lang);
  const progress = item.levelTotal ? Math.max(0.02, Math.min(1, (item.levelNo || 0) / item.levelTotal)) : (item.role === "outro" ? 1 : 0.02);
  const html = `<div class="mi-bd" style="background:${backdrop(item.severity)}"></div>
<div class="lg-head">
  <div class="lg-eyebrow">${fitIn("lg-eb", data.eyebrow, { size: 22, min: 12 })}</div>
  ${fitIn("lg-title", ctx.title, { size: 64, min: 26, tag: "h1" })}
  <div class="lg-bar"><i style="width:${(progress * 100).toFixed(1)}%"></i></div>
  ${fitIn("lg-lvl", tagOf(item, words), { size: 26, min: 12, style: `justify-content:flex-end` })}
</div>
<div class="lg-scan" style="${regionStyle(L.scan)}"><b class="c1"></b><b class="c2"></b><b class="c3"></b><b class="c4"></b></div>
${fitIn("lg-label", item.label, { size: 72, min: 26, tag: "h2", id: `lg-label-${idx}`, style: regionStyle(L.label) })}
${fitIn("lg-status", item.status, { size: 30, min: 14, style: regionStyle(L.status) })}
<div class="lg-limit" id="lg-limit-${idx}" style="${regionStyle(L.limit)};border-color:${color};box-shadow:0 0 22px ${color}55"><span class="lg-limit-k">${escapeHtml(words.meter.split(":")[0])}</span>${fitIn("lg-limit-v", `${item.severity}/10 · ${item.status}`, { size: 34, min: 14, style: `color:${color}` })}</div>
<div class="lg-face" style="${regionStyle(L.faceCard)}"><div class="mi-shake" id="mi-shake-${idx}"><img class="mi-face" src="${faceSrc(facePhase(item.severity))}" alt=""></div><div class="lg-badge">${fitIn("lg-badge-in", words.meter, { size: 24, min: 12 })}</div></div>`;
  const at = scene.visualStart;
  const tweens = [
    { method: "fromTo", target: `#lg-label-${idx}`, from: { scale: 0.85 }, vars: { scale: 1, duration: 0.3, ease: "back.out(2)" }, at: t3(at + 0.05) },
    { method: "fromTo", target: `#lg-limit-${idx}`, from: { scale: 0.6 }, vars: { scale: 1, duration: 0.3, ease: "back.out(2)" }, at: t3(at + 0.3) },
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
  const html = `<div class="mi-bd" style="background:${backdrop(item.severity)}"></div>
<div class="mi-card" id="mi-card-${idx}" style="${regionStyle(L.card)};border-color:${color}">
${fitIn("mi-tag", tagOf(item, words), { size: 58, min: 22, id: `mi-tag-${idx}`, style: `color:${color}` })}
${fitIn("mi-label", item.label, { size: 42, min: 18, tag: "h2" })}
${statusRow(item, idx, color)}
<div class="mi-pips">${pips(item.severity)}</div>
</div>
<div class="fc-face" style="${regionStyle(L.face)}"><div class="mi-shake" id="mi-shake-${idx}"><img class="mi-face" src="${faceSrc(facePhase(item.severity))}" alt=""></div></div>`;
  const at = scene.visualStart;
  const tweens = [
    { method: "fromTo", target: `#mi-card-${idx}`, from: { x: 40 }, vars: { x: 0, duration: 0.35, ease: "power3.out" }, at: t3(at + 0.05) },
    { method: "fromTo", target: `#mi-status-${idx}`, from: { scale: 0.2 }, vars: { scale: 1, duration: 0.3, ease: "back.out(2)" }, at: t3(at + 0.35) },
    ...shakeTweens(scene, item.severity),
  ];
  return { html, tweens };
}

function design(compId) {
  const L = LAYOUT[compId];
  return (ctx) => {
    const data = resolveSurvival(ctx);
    const legacy = compId === "legacy";
    return {
      header: null,
      visual: { frame: "plain", region: L.image },
      text: {
        style: "subtitle", region: L.caption, size: legacy ? 52 : 48, align: "center", enter: "pop",
      },
      sceneExtra: (scene, i, sctx) => (legacy ? legacyParts : cardParts)(scene, i, sctx, data),
      overlay: legacy ? undefined : (octx) => ({ ...header(octx, data), css: "" }),
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

// Ảnh từng cấp như bản Studio cũ (generate-survival-topic.mjs imagePrompt, video mẫu survival-radiation-exposure-levels-en):
// minh hoạ khoa học 3D phát sáng neon trên nền đen, chủ thể ở giữa — không theo Style Bible "documentary" của niche.
export const MR_INCREDIBLE_IMAGE_STYLE = Object.freeze({
  visual_language: "detailed 3D colorful scientific graphic illustration, vibrant neon glowing colors, holographic medical-scan look, octane render, single subject centered on a clean pure black background",
  prompt_tags: ["glowing rim light", "high detail", "centered square composition", "dark empty background"],
  palette: { primary: "pure black background", accent: "neon cyan, magenta and orange glow", text: "none" },
  negative_prompt: "photograph, realistic photo, people, faces, text, letters, numbers, labels, watermark, cluttered background",
});

const mrIncredible = defineVariant({
  engine: "survival",
  asset: { ...IMAGE_ASSET, imageStyle: MR_INCREDIBLE_IMAGE_STYLE },
  cost: IMAGE_COST,
  sample: survivalSample,
  id: "survival/mr-incredible",
  name_vi: "Mr. Incredible (bố cục Sinh Tồn cũ)",
  prepareAssets,
  topicPacks: { survival_body_limits: 0.5, survival_extreme_sports: 0.25, survival_deep_ocean: 0.25 },
  layoutFamily: "uncanny_meme",
  axes: { composition: "card_stack", textPlacement: "bottom", background: "flat_color", transition: "fade_black", imageMotion: "push_in", typography: "grotesk" },
  audio: { gender: "any", fx: ["none"] },
  ui: UI,
  compositions: {
    legacy: {
      axes: { composition: "card_stack", textPlacement: "bottom" },
      describe: "Bố cục Sinh Tồn cũ: eyebrow + tiêu đề + thanh tiến độ LEVEL n/L; thẻ quét 4 góc với ảnh AI của cấp, tên cấp, trạng thái, ô mức độ; thẻ dưới là mặt Mr. Incredible (pha 1–9 theo mức độ, rung khi ≥ 7) với nhãn REACTION: UNCANNY METER; lời đọc dưới cùng",
      design: design("legacy"),
    },
    face_card: {
      axes: { composition: "split_vertical", textPlacement: "bottom", background: "darkness" },
      describe: "Anh em: mặt Mr. Incredible bên trái cạnh thẻ cấp độ (nhãn cấp, trạng thái, N/10), ảnh AI của cấp rộng ở giữa, lời đọc dưới cùng",
      design: design("face_card"),
    },
  },
  allowed: {
    typography: ["heavy", "condensed", "grotesk"], treatment: ["clean", "film_grain"],
    image_motion: ["push_in", "still_grain", "ken_burns_slow"], transition: ["cut", "fade_black", "zoom_through"], tone: [0, 1, 2, 4],
  },
});

export default mrIncredible;
