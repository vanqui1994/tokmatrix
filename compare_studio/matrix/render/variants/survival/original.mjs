// survival/original — giao diện GỐC của engine survival (engines/survival.mjs, Studio template "Sinh Tồn") dựng lại
// bằng kit: nền tối cyber-grid + vignette; đầu trang = eyebrow dạng viên thuốc (chấm sáng cyan) + tiêu đề in hoa phát
// sáng + thước tiến độ cyan→đỏ; mỗi cảnh: nhãn cấp (STUFE n/L) màu mức độ, thẻ "scanner" (4 góc cyan, chip cấp độ, huy
// hiệu trạng thái, nhãn cấp, 3 thanh chỉ số %), thẻ phản ứng (mức độ N/10 + 10 vạch, reactor SVG GỐC seed
// `survival/legacy` — reactorFace của engine, không mặt meme bên thứ ba — nhãn "REACTION METER"), lời đọc trắng dưới
// cùng; rung màn khi mức độ ≥ 4. Dữ liệu từ extras của engine (skit.resolveSurvival: thiếu/lệch → fallback tất định).
// Composition 2: lời đọc ngay dưới đầu trang, thẻ phản ứng lên trên, thẻ scanner xuống dưới.
import { getSurvivalConfig } from "../../../../tools/survival-languages.mjs";
import { reactorFace } from "../../engines/survival.mjs";
import { IMAGE_ASSET, IMAGE_COST } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { survivalSample } from "./sample.mjs";
import { inkOn, resolveSurvival, t3 } from "./skit.mjs";

// Màu mức độ 1–10 và màu thanh chỉ số của engine gốc.
const SEVERITY_COLORS = ["#00FF88", "#00FF88", "#00F0FF", "#FFB800", "#FF7700", "#FF5500", "#FF003C", "#FF003C", "#E11D48", "#B56CFF"];
const sevColor = (s) => SEVERITY_COLORS[Math.min(10, Math.max(1, s)) - 1];
const barColor = (v) => (v >= 66 ? "linear-gradient(90deg,#00C46A,#00FF88)" : v >= 36 ? "linear-gradient(90deg,#E09A00,#FFB800)" : "linear-gradient(90deg,#B0002A,#FF003C)");

// Hình học theo composition (toạ độ 1080×1920 của template gốc).
const LAYOUT = {
  scanner: { scanner: { x: 60, y: 350, w: 960, h: 720 }, meme: { x: 60, y: 1100, w: 960, h: 520 }, caption: { x: 60, y: 1648, w: 960, h: 180 }, glowY: 380 },
  reactor_top: { caption: { x: 60, y: 340, w: 960, h: 170 }, meme: { x: 60, y: 530, w: 960, h: 520 }, scanner: { x: 60, y: 1080, w: 960, h: 720 }, glowY: 600 },
};

/** Nhãn cấp của engine gốc theo nước (survival-languages: STUFE / PROLOG / FINALE…). */
function levelWords(lang) {
  const base = getSurvivalConfig(lang);
  const known = base.lang === lang;
  return {
    levelPrefix: known ? base.levelPrefix : "LEVEL",
    prologueTag: known ? base.prologueTag : "PROLOGUE",
    finalTag: known ? base.finalTag : "FINAL",
  };
}

function tagOf(item, words) {
  if (item.role === "prologue") return words.prologueTag;
  if (item.role === "outro") return words.finalTag;
  return `${words.levelPrefix} ${item.levelNo}/${item.levelTotal}`;
}

function progressOf(item) {
  if (item.role === "prologue") return 0.04;
  if (item.role === "outro") return 1;
  return item.levelNo / Math.max(1, item.levelTotal);
}

/** Hộp cố định + chữ tự co (kit data-fit co theo khung cha). */
function fitIn(cls, text, { size, min = 12, tag = "span", id = "", style = "" }) {
  const inner = `${cls.split(" ")[0]}-t`;
  return `<div class="${cls}"${id ? ` id="${id}"` : ""}${style ? ` style="${style}"` : ""}>${fitText(tag, `class="${inner}" style="font-size:${size}px"`, text, min)}</div>`;
}

const CSS = `
.v-bg-fill{background:linear-gradient(rgba(0,240,255,.04) 1px,transparent 1px) 0 0/60px 60px,linear-gradient(90deg,rgba(0,240,255,.04) 1px,transparent 1px) 0 0/60px 60px,radial-gradient(circle at 50% 30%,#111827 0%,#07090E 80%)!important;box-shadow:inset 0 0 160px rgba(0,0,0,.95)}
#root{color:#F0F6FC}
.so-mono{font-family:"JetBrains Mono",monospace}
.so-eyebrow{position:absolute;left:50%;top:56px;transform:translateX(-50%);max-width:960px;height:50px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:0 24px;border-radius:999px;background:#0b2a33;border:1px solid rgba(0,240,255,.35);white-space:nowrap}
.so-dot{width:10px;height:10px;border-radius:50%;background:#00F0FF;box-shadow:0 0 10px #00F0FF;flex:none}
.so-eb{position:relative;height:30px;max-width:880px;display:flex;align-items:center}
.so-eb-t{margin:0;font-weight:700;letter-spacing:2px;color:#00F0FF;white-space:nowrap}
.so-title{position:absolute;left:60px;top:122px;width:960px;height:136px;display:flex;align-items:center;justify-content:center}
.so-title-t{margin:0;width:100%;line-height:1.18;font-weight:700;text-align:center;text-transform:uppercase;color:#FFFFFF;text-shadow:0 0 30px rgba(0,240,255,.35)}
.so-meter{position:absolute;left:60px;top:286px;width:690px;height:12px;background:rgba(255,255,255,.1);border-radius:6px;overflow:hidden}
#so-meter-fill{width:100%;height:100%;background:linear-gradient(90deg,#00F0FF,#FF003C);transform-origin:0 50%}
.so-w{position:absolute;inset:0}
.so-glow{position:absolute;left:90px;width:900px;height:900px;border-radius:50%;filter:blur(80px)}
.so-tier{position:absolute;left:780px;top:268px;width:240px;height:44px;display:flex;align-items:center;justify-content:flex-end}
.so-tier-t{margin:0;font-weight:700;letter-spacing:1px;white-space:nowrap;text-align:right}
.so-card{position:absolute;box-sizing:border-box;padding:36px 40px;background:#0E131F;border:2px solid;border-radius:36px;box-shadow:0 20px 50px rgba(0,0,0,.6);display:flex;flex-direction:column}
.so-corner{position:absolute;width:24px;height:24px;border-color:#00F0FF}
.so-c-tl{top:14px;left:14px;border-top:3px solid;border-left:3px solid}.so-c-tr{top:14px;right:14px;border-top:3px solid;border-right:3px solid}
.so-c-bl{bottom:14px;left:14px;border-bottom:3px solid;border-left:3px solid}.so-c-br{bottom:14px;right:14px;border-bottom:3px solid;border-right:3px solid}
.so-head{height:70px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:24px}
.so-chip{position:relative;height:64px;width:420px;box-sizing:border-box;padding:0 22px;border-radius:16px;display:flex;align-items:center;flex:none}
.so-chip-t{margin:0;font-weight:700;letter-spacing:1px;white-space:nowrap}
.so-status{position:relative;height:64px;width:370px;box-sizing:border-box;padding:0 24px;border:2px solid;border-radius:16px;display:flex;align-items:center;justify-content:center;background:#05070b;flex:none}
.so-status-t{margin:0;font-weight:700;letter-spacing:1px;white-space:nowrap;text-align:center}
.so-label{position:relative;height:220px;margin-top:18px;flex:none;display:flex;align-items:center}
.so-label-t{margin:0;width:100%;line-height:1.12;font-weight:700;text-transform:uppercase;color:#FFFFFF;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.so-metrics{margin-top:18px;display:flex;flex-direction:column;gap:22px}
.so-img{position:relative;height:250px;margin-top:14px;flex:none;border-radius:18px;overflow:hidden;background:#000;border:1px solid rgba(0,240,255,.25)}
.so-img img{display:block;width:100%;height:100%;object-fit:cover}
.so-label.so-sm{height:100px;margin-top:14px}
.so-metrics.so-sm{margin-top:14px;gap:8px}.so-metrics.so-sm .so-metric{height:56px}.so-metrics.so-sm .so-mrow{height:30px}.so-metrics.so-sm .so-mname{height:30px}.so-metrics.so-sm .so-mval{font-size:26px}.so-metrics.so-sm .so-track{height:18px}
.so-metric{height:94px;display:flex;flex-direction:column;justify-content:space-between}
.so-mrow{height:40px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.so-mname{position:relative;height:40px;flex:1;min-width:0;display:flex;align-items:center}
.so-mname-t{margin:0;font-weight:700;letter-spacing:1px;color:#C9D1D9;white-space:nowrap}
.so-mval{font-weight:700;font-size:32px;color:#FFFFFF;white-space:nowrap;flex:none}
.so-track{height:26px;border-radius:13px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);overflow:hidden}
.so-fill{height:100%;border-radius:13px;transform-origin:0 50%;box-shadow:0 0 14px rgba(255,255,255,.25)}
.so-meme{position:absolute;box-sizing:border-box;background:#0B0E14;border:2px solid rgba(255,255,255,.15);border-radius:36px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.7)}
.so-face{position:absolute;top:40px;right:20px;width:480px;height:480px;background:radial-gradient(circle at 50% 60%,rgba(0,240,255,.18),transparent 70%)}
.so-face svg{display:block;width:100%;height:100%}
.so-sev{position:absolute;top:96px;left:36px;width:360px;height:390px;display:flex;flex-direction:column;gap:18px}
.so-sevname{position:relative;width:340px;height:36px;display:flex;align-items:center}
.so-sevname-t{margin:0;font-weight:700;letter-spacing:2px;color:#8B949E;white-space:nowrap}
.so-sevval{height:200px;font-weight:700;font-size:190px;line-height:1;letter-spacing:-6px;white-space:nowrap}
.so-sevval small{font-size:64px;letter-spacing:0;color:#8B949E}
.so-pips{display:flex;gap:8px}.so-pips i{width:26px;height:40px;border-radius:6px}
.so-badge{position:absolute;top:22px;left:22px;width:380px;height:44px;box-sizing:border-box;padding:0 18px;display:flex;align-items:center;background:#000000;border:1px solid rgba(255,255,255,.2);border-radius:12px}
.so-badge-t{margin:0;font-weight:700;color:#FFFFFF;letter-spacing:1px;white-space:nowrap}
.t-subtitle{justify-content:center;text-align:center}
.t-subtitle .v-line{font-weight:700;line-height:1.3;text-align:center;color:#FFFFFF;text-shadow:0 4px 16px rgba(0,0,0,.9),0 0 20px rgba(0,240,255,.35)}`;

/** Đầu trang xuyên suốt: eyebrow, tiêu đề, thước tiến độ (tới giá trị của mỗi cảnh ở đầu cảnh). */
function header(ctx, data) {
  const html = `<div class="so-eyebrow so-mono"><span class="so-dot"></span>${fitIn("so-eb", data.eyebrow, { size: 20 })}</div>
${fitIn("so-title", ctx.title, { size: 54, min: 24, tag: "h1" })}
<div class="so-meter"><div id="so-meter-fill"></div></div>`;
  const tweens = [{ method: "set", target: "#so-meter-fill", vars: { scaleX: progressOf(data.items[0]) }, at: 0 }];
  ctx.scenes.forEach((scene, i) => {
    if (i === 0) return;
    tweens.push({ method: "to", target: "#so-meter-fill", vars: { scaleX: progressOf(data.items[i]), duration: t3(Math.min(0.4, scene.visualDuration * 0.2)), ease: "power2.out" }, at: t3(scene.visualStart) });
  });
  return { html, tweens };
}

function sceneParts(scene, i, ctx, data, L) {
  const idx = scene.index;
  const item = data.items[i];
  const color = sevColor(item.severity);
  const tag = tagOf(item, levelWords(ctx.lang));
  const at = scene.visualStart;
  const enter = t3(Math.min(0.4, scene.visualDuration * 0.2));
  const prev = i ? data.items[i - 1].metrics : [0, 0, 0];
  const S = L.scanner;
  const M = L.meme;
  const metrics = item.metrics.map((value, m) => `<div class="so-metric"><div class="so-mrow">${fitIn("so-mname so-mono", data.metricLabels[m], { size: 28, min: 14 })}<span class="so-mval so-mono">${value}%</span></div><div class="so-track"><div class="so-fill" id="so-bar-${idx}-${m}" style="width:${Math.max(0.5, value)}%;background:${barColor(value)}"></div></div></div>`).join("");
  const pips = Array.from({ length: 10 }, (_, p) => `<i style="background:${p < item.severity ? sevColor(p + 1) : "rgba(255,255,255,.1)"}"></i>`).join("");
  const html = `<div class="so-w" id="so-w-${idx}">
<div class="so-glow" style="top:${L.glowY}px;background:radial-gradient(circle,${color}44 0%,transparent 70%)"></div>
${fitIn("so-tier so-mono", tag, { size: 26, min: 14, style: `color:${color}` })}
<div class="so-card" id="so-card-${idx}" style="${regionStyle(S)};border-color:${color}66">
<i class="so-corner so-c-tl"></i><i class="so-corner so-c-tr"></i><i class="so-corner so-c-bl"></i><i class="so-corner so-c-br"></i>
<div class="so-head">${fitIn("so-chip so-mono", tag, { size: 30, min: 16, style: `background:${color};color:${inkOn(color)}` })}${fitIn("so-status so-mono", item.status, { size: 30, min: 16, id: `so-status-${idx}`, style: `border-color:${color};color:${color};box-shadow:0 0 26px ${color}55` })}</div>
${scene.imgSrc ? `<div class="so-img"><img src="${escapeHtml(scene.imgSrc)}" alt=""></div>` : ""}
${fitIn(`so-label${scene.imgSrc ? " so-sm" : ""}`, item.label, { size: scene.imgSrc ? 52 : 68, min: 22, tag: "h2" })}
<div class="so-metrics${scene.imgSrc ? " so-sm" : ""}">${metrics}</div>
</div>
<div class="so-meme" style="${regionStyle(M)}">
<div class="so-sev">${fitIn("so-sevname so-mono", ctx.ui.severity, { size: 26 })}<div class="so-sevval" style="color:${color}">${item.severity}<small>/10</small></div><div class="so-pips">${pips}</div></div>
<div class="so-face" id="so-face-${idx}">${reactorFace(ctx.lang, item.severity, `rx-${idx}`)}</div>
${fitIn("so-badge so-mono", ctx.ui.reaction, { size: 20 })}
</div>
</div>`;
  // Hiện bằng dịch/scale, không mờ dần: thẻ có nền riêng mà mờ dần thì audit đo tương phản thấp.
  const tweens = [
    { method: "fromTo", target: `#so-card-${idx}`, from: { y: 34 }, vars: { y: 0, duration: enter, ease: "back.out(1.4)" }, at: t3(at) },
    { method: "fromTo", target: `#so-face-${idx}`, from: { scale: 1.12 }, vars: { scale: 1, duration: enter, ease: "power2.out" }, at: t3(at) },
  ];
  item.metrics.forEach((value, m) => {
    const from = Math.max(0.005, prev[m] / Math.max(1, value));
    tweens.push({ method: "fromTo", target: `#so-bar-${idx}-${m}`, from: { scaleX: t3(Math.min(from, 3)) }, vars: { scaleX: 1, duration: t3(Math.min(0.9, scene.visualDuration * 0.35)), ease: "power2.out" }, at: t3(at + enter * 0.5) });
  });
  if (i > 0 && item.severity >= 4) {
    const amp = 4 + item.severity * 1.2;
    const w = `#so-w-${idx}`;
    [[-amp, amp * 0.5], [amp * 0.8, -amp * 0.4], [-amp * 0.4, amp * 0.25], [0, 0]].forEach(([x, y], k) => {
      tweens.push({ method: "to", target: w, vars: { x: t3(x), y: t3(y), duration: 0.05, ease: "none" }, at: t3(at + k * 0.05) });
    });
  }
  return { html, tweens };
}

function design(compId) {
  const L = LAYOUT[compId];
  return (ctx) => {
    const data = resolveSurvival(ctx);
    return {
      header: null,
      text: { style: "subtitle", region: L.caption, size: 44, align: "center", enter: "fade_up" },
      sceneExtra: (scene, i, sctx) => sceneParts(scene, i, sctx, data, L),
      overlay: (octx) => ({ ...header(octx, data), css: "" }),
      fontFamilies: ["JetBrains Mono"],
      css: CSS,
    };
  };
}

const UI = {
  en: { label: "SURVIVAL LEVELS", scene: "LEVEL", severity: "SEVERITY", reaction: "REACTION METER" },
  vi: { label: "CÁC CẤP SINH TỒN", scene: "CẤP", severity: "MỨC ĐỘ", reaction: "THANG PHẢN ỨNG" },
  de: { label: "ÜBERLEBENSSTUFEN", scene: "STUFE", severity: "SCHWEREGRAD", reaction: "REAKTIONSSKALA" },
  fr: { label: "NIVEAUX DE SURVIE", scene: "NIVEAU", severity: "GRAVITÉ", reaction: "JAUGE DE RÉACTION" },
  ja: { label: "生存レベル", scene: "レベル", severity: "深刻度", reaction: "反応メーター" },
  ko: { label: "생존 단계", scene: "단계", severity: "심각도", reaction: "반응 미터" },
};

const original = defineVariant({
  engine: "survival",
  asset: IMAGE_ASSET,
  cost: IMAGE_COST,
  sample: survivalSample,
  id: "survival/original",
  name_vi: "Sinh tồn (giao diện gốc)",
  topicPacks: { survival_body_limits: 0.5, survival_extreme_sports: 0.25, survival_deep_ocean: 0.25 },
  layoutFamily: "scanner_levels",
  axes: { composition: "card_stack", textPlacement: "bottom", background: "darkness", transition: "cut", imageMotion: "scan_light", typography: "heavy" },
  audio: { gender: "any", fx: ["none"] },
  ui: UI,
  compositions: {
    scanner: {
      axes: { composition: "card_stack", textPlacement: "bottom" },
      describe: "Khuôn gốc: eyebrow + tiêu đề phát sáng + thước tiến độ; nhãn cấp màu mức độ; thẻ scanner (chip cấp, trạng thái, nhãn cấp, 3 thanh chỉ số %) trên thẻ phản ứng (mức độ N/10 + vạch, reactor SVG gốc); lời đọc trắng dưới cùng; rung màn khi mức độ ≥ 4",
      design: design("scanner"),
    },
    reactor_top: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Anh em của khuôn gốc: lời đọc ngay dưới đầu trang, thẻ phản ứng (reactor + mức độ) lên trên, thẻ scanner với 3 thanh chỉ số xuống nửa dưới",
      design: design("reactor_top"),
    },
  },
  allowed: {
    typography: ["heavy", "grotesk", "condensed"], treatment: ["clean"],
    image_motion: ["scan_light"], transition: ["cut", "fade_black"], tone: [0, 1, 2, 4],
  },
});

export default original;
