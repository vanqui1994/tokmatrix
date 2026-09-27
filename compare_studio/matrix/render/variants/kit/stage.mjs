// Dựng một video variant từ "design" của composition: nền (trục background), đầu trang, cảnh (khung hình + khối chữ +
// nhãn cảnh), lớp dữ liệu của engine (bảng tier, cán cân, đồng hồ sinh tồn…), đồ trang trí, âm thanh và timeline.
// Stage chỉ LẮP các mảnh; bố cục (vùng, khung, kiểu chữ) là của composition trong variant, dữ liệu là của engine.
//
// design = {
//   header:  { style, region, align? } | null
//   visual:  { frame, region, fit?, filter?, sub?(scene,i), label?(scene,i) } | null
//   text:    { style, region, size?, align?, enter? } | null
//   tag:     { style, x, y } | null
//   decor:   [{ kind, layer?: "under"|"over", ...opts }]
//   vars:    { "--scope-ink": "#…" }                 // biến vật liệu riêng variant
//   panel?:  (scene, i, ctx) → html                  // thay ảnh trong khung (engine TEXT/SVG) — nhận motion như ảnh
//   sceneExtra?: (scene, i, ctx) → { html, tweens }  // phần tử thêm trong clip cảnh
//   overlay?: (ctx) → { html, css, tweens }          // phần tử xuyên suốt (bảng tier, tỉ số…) — track 4
//   css?:    string
// }
import { backgroundCss, backgroundIsDark } from "./backgrounds.mjs";
import { decorHtml } from "./decor.mjs";
import { frameCss, frameHtml, regionStyle } from "./frames.mjs";
import { documentHtml, escapeHtml, fitText, overlayHtml, paletteCss, timelineJs, voiceClipsHtml } from "./primitives.mjs";
import { imageMotionTweens, transitionTweens } from "./profiles.mjs";
import { textCss, textHtml } from "./textstyles.mjs";
import { upper } from "./textdata.mjs";

export const W = 1080;
export const H = 1920;

/** Cửa sổ hiển thị của từng cảnh: cảnh 1 từ 0, cảnh cuối kéo tới hết video; thời điểm cảnh giữ nguyên TTS. */
export function sceneWindows(scenes, totalDuration) {
  return scenes.map((scene, i) => {
    const end = i < scenes.length - 1 ? scenes[i + 1].start : totalDuration;
    const visualStart = i === 0 ? 0 : scene.start;
    return { ...scene, visualStart, visualDuration: Number((end - visualStart).toFixed(3)) };
  });
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// --- Đầu trang -----------------------------------------------------------------------------------------------------
const HEADER_CSS = {
  label_title: ".h-label{position:absolute;padding:8px 18px;font-size:32px;letter-spacing:7px;font-weight:700;background:var(--panel);color:var(--fg-on-panel)}.h-title-box{position:absolute}.h-title{margin:0;font-size:64px;line-height:1.08;color:var(--head-ink)}",
  masthead: ".h-mast{position:absolute;box-sizing:border-box;text-align:center;border-top:8px double var(--head-ink);border-bottom:8px double var(--head-ink);padding:10px 0}.h-mast-name{font-size:30px;letter-spacing:12px;color:var(--head-ink);font-weight:700}.h-title-box{position:absolute}.h-title{margin:0;font-size:78px;line-height:1.02;color:var(--head-ink);text-align:center;font-weight:700}",
  osd_bar: ".h-osd{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:24px;padding:0 26px;background:rgba(0,0,0,.72);border-bottom:3px solid var(--scope-ink,#7dffb0)}.h-osd .h-dot{width:26px;height:26px;border-radius:50%;background:#ff3b30;flex:none}.h-osd .h-label{font-size:30px;letter-spacing:5px;color:var(--scope-ink,#7dffb0);flex:none}.h-title-box{position:relative;flex:1;height:100%;display:flex;align-items:center}.h-title{margin:0;font-size:44px;line-height:1.1;color:#f2f2f2}",
  tab: ".h-tab{position:absolute;padding:14px 34px 10px;border-radius:18px 18px 0 0;background:#d8b778;font-size:30px;letter-spacing:6px;color:#3b2a10;font-weight:700}.h-title-box{position:absolute}.h-title{margin:0;font-size:62px;line-height:1.08;color:var(--head-ink)}",
  centered: ".h-center-label{position:absolute;text-align:center;font-size:30px;letter-spacing:10px;color:var(--gold)}.h-title-box{position:absolute;text-align:center}.h-title{margin:0;font-size:70px;line-height:1.06;color:var(--head-ink);text-align:center}.h-rule{position:absolute;height:3px;background:var(--gold)}",
  plaque: ".h-plaque{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#d8b86a,#a8832f);border-radius:12px;box-shadow:0 12px 24px rgba(0,0,0,.45)}.h-plaque .h-label{position:absolute;left:30px;right:30px;top:14px;height:34px;font-size:26px;line-height:34px;letter-spacing:6px;color:#3a2806;white-space:nowrap;overflow:hidden}.h-plaque .h-title-box{position:absolute;left:30px;right:30px;top:58px;bottom:14px}.h-title{margin:0;font-size:54px;line-height:1.08;color:#241703}",
  ribbon: ".h-ribbon{position:absolute;box-sizing:border-box;padding:18px 90px;background:var(--accent-terra-ink);clip-path:polygon(0 0,100% 0,95% 50%,100% 100%,0 100%,5% 50%);display:flex;align-items:center;justify-content:center}.h-title-box{position:relative;width:100%;height:100%;display:flex;align-items:center}.h-title{margin:0;font-size:58px;line-height:1.05;color:#fff8ee;text-align:center;width:100%}",
  side: ".h-side{position:absolute;box-sizing:border-box;writing-mode:vertical-rl;transform:rotate(180deg);display:flex;align-items:center;justify-content:center;background:var(--panel)}.h-side .h-title{margin:0;padding:0 14px;font-size:54px;line-height:1.4;color:var(--fg-on-panel);white-space:nowrap;max-height:100%}",
  chalk_title: ".h-title-box{position:absolute;text-align:center}.h-title{margin:0;font-size:68px;line-height:1.08;color:#f4f6f0;text-align:center;text-shadow:0 0 10px rgba(255,255,255,.35)}.h-chalk-label{position:absolute;text-align:center;font-size:28px;letter-spacing:8px;color:#ffe08a}",
};

function headerHtml(header, { title, ui, lang }) {
  if (!header) return { html: "", css: "" };
  const r = header.region;
  const label = escapeHtml(upper(ui.label || "", lang));
  const titleFit = (size) => fitText("h1", `class="h-title" style="font-size:${size}px"`, title, 26);
  let html;
  switch (header.style) {
    case "label_title":
      html = `<div class="h-label" style="left:${r.x}px;top:${r.y}px">${label}</div><div class="h-title-box" style="${regionStyle({ x: r.x, y: r.y + 70, w: r.w, h: r.h - 70 })}">${titleFit(header.size || 64)}</div>`;
      break;
    case "masthead":
      html = `<div class="h-mast" style="${regionStyle({ x: r.x, y: r.y, w: r.w, h: 70 })}"><div class="h-mast-name">${label}</div></div><div class="h-title-box" style="${regionStyle({ x: r.x, y: r.y + 86, w: r.w, h: r.h - 86 })}">${titleFit(header.size || 78)}</div>`;
      break;
    case "osd_bar":
      html = `<div class="h-osd" style="${regionStyle(r)}"><i class="h-dot" id="h-rec-dot"></i><span class="h-label">${label}</span><div class="h-title-box">${titleFit(header.size || 44)}</div></div>`;
      break;
    case "tab":
      html = `<div class="h-tab" style="left:${r.x}px;top:${r.y}px">${label}</div><div class="h-title-box" style="${regionStyle({ x: r.x, y: r.y + 76, w: r.w, h: r.h - 76 })}">${titleFit(header.size || 62)}</div>`;
      break;
    case "centered":
      html = `<div class="h-center-label" style="${regionStyle({ x: r.x, y: r.y, w: r.w, h: 40 })}">${label}</div><div class="h-rule" style="left:${r.x + r.w * 0.3}px;top:${r.y + 50}px;width:${r.w * 0.4}px"></div><div class="h-title-box" style="${regionStyle({ x: r.x, y: r.y + 64, w: r.w, h: r.h - 64 })}">${titleFit(header.size || 70)}</div>`;
      break;
    case "plaque":
      html = `<div class="h-plaque" style="${regionStyle(r)}"><div class="h-label">${label}</div><div class="h-title-box">${titleFit(header.size || 54)}</div></div>`;
      break;
    case "ribbon":
      html = `<div class="h-ribbon" style="${regionStyle(r)}"><div class="h-title-box">${titleFit(header.size || 58)}</div></div>`;
      break;
    case "side":
      html = `<div class="h-side" style="${regionStyle(r)}">${fitText("h1", `class="h-title" style="font-size:${header.size || 54}px"`, title, 24)}</div>`;
      break;
    case "chalk_title":
      html = `<div class="h-chalk-label" style="${regionStyle({ x: r.x, y: r.y, w: r.w, h: 40 })}">${label}</div><div class="h-title-box" style="${regionStyle({ x: r.x, y: r.y + 52, w: r.w, h: r.h - 52 })}">${titleFit(header.size || 68)}</div>`;
      break;
    default:
      throw new Error(`unknown header style ${header.style}`);
  }
  return { html, css: HEADER_CSS[header.style] };
}

// --- Nhãn cảnh -----------------------------------------------------------------------------------------------------
const TAG_CSS = {
  chip: ".g-chip{position:absolute;padding:6px 16px;font-size:30px;letter-spacing:4px;background:var(--panel);color:var(--fg-on-panel);white-space:nowrap}",
  stamp: ".g-stamp{position:absolute;padding:4px 16px;font-size:34px;letter-spacing:5px;border:5px solid var(--accent-terra-ink);background:#fbf8ef;color:var(--accent-terra-ink);transform:rotate(-8deg);white-space:nowrap;font-weight:700}",
  counter: ".g-counter{position:absolute;font-size:150px;line-height:1;font-weight:700;color:var(--gold);opacity:.9;white-space:nowrap}",
  osd: ".g-osd{position:absolute;font-size:30px;letter-spacing:3px;color:var(--scope-ink,#7dffb0);background:rgba(0,0,0,.82);padding:4px 12px;white-space:nowrap}",
  chalk: ".g-chalkn{position:absolute;font-size:46px;color:#ffe08a;white-space:nowrap}",
};

function tagHtml(tag, { i, n, ui, lang, id }) {
  if (!tag) return "";
  const text = tag.format ? tag.format(i, n, ui) : `${upper(ui.scene || "", lang)} ${pad2(i + 1)}/${pad2(n)}`;
  const cls = { chip: "g-chip", stamp: "g-stamp", counter: "g-counter", osd: "g-osd", chalk: "g-chalkn" }[tag.style];
  if (!cls) throw new Error(`unknown tag style ${tag.style}`);
  return `<div class="${cls}" id="${id}" style="left:${tag.x}px;top:${tag.y}px">${escapeHtml(text)}</div>`;
}

// --- Chữ vào cảnh --------------------------------------------------------------------------------------------------
function textEnterTweens(kind, { lineId, boxId, at, duration }) {
  const span = Number(Math.min(1.4, Math.max(0.3, duration * 0.35)).toFixed(3));
  const t = Number((at + 0.08).toFixed(3));
  switch (kind || "fade_up") {
    case "none": return [];
    case "fade_up": return [{ method: "fromTo", target: `#${lineId}`, from: { y: 26, autoAlpha: 0 }, vars: { y: 0, autoAlpha: 1, duration: 0.45, ease: "power2.out" }, at: t }];
    case "clip": return [{ method: "fromTo", target: `#${lineId}`, from: { clipPath: "inset(0% 100% 0% 0%)" }, vars: { clipPath: "inset(0% 0% 0% 0%)", duration: span, ease: "power1.inOut" }, at: t }];
    case "type": return [{ method: "fromTo", target: `#${lineId}`, from: { clipPath: "inset(0% 100% 0% 0%)" }, vars: { clipPath: "inset(0% 0% 0% 0%)", duration: span, ease: "steps(28)" }, at: t }];
    case "drop": return [{ method: "fromTo", target: `#${lineId}`, from: { clipPath: "inset(0% 0% 100% 0%)" }, vars: { clipPath: "inset(0% 0% 0% 0%)", duration: span, ease: "power2.out" }, at: t }];
    case "pop": return [{ method: "fromTo", target: `#${boxId}`, from: { scale: 0.86 }, vars: { scale: 1, duration: 0.4, ease: "back.out(2)" }, at: t }];
    case "slide": return [{ method: "fromTo", target: `#${boxId}`, from: { xPercent: -8 }, vars: { xPercent: 0, duration: 0.45, ease: "power3.out" }, at: t }];
    default: throw new Error(`unknown text enter ${kind}`);
  }
}

/** Vùng bố cục khai báo (tỉ lệ 0..1 của khung 1080×1920) — tín hiệu "declared" của bkt_web.creative_similarity. */
export function layoutRegions(design) {
  const norm = (r) => (r ? [r.x / W, r.y / H, r.w / W, r.h / H].map((v) => Number(v.toFixed(4))) : null);
  const out = {};
  for (const key of ["visual", "text", "header"]) {
    const region = norm(design[key]?.region);
    if (region) out[key] = region;
  }
  return out;
}

/**
 * @param {object} ctx   ctx của buildHtml (scenes đã có index/start/duration/voSrc/imgSrc)
 * @param {object} design design của composition (xem đầu file)
 * @param {object} opts  { ui: {label, scene, …} theo ngôn ngữ, cfg?: dữ liệu ghi vào meta }
 */
export function buildStage(ctx, design, { ui, cfg = {} }) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, creative } = ctx;
  const scenes = sceneWindows(ctx.scenes, totalDuration);
  const rng = creative.rng;
  const script = creative.theme.script;
  const n = scenes.length;
  const bg = creative.axes.background;
  const headInk = backgroundIsDark(bg) ? "#f4f1ea" : "var(--fg)";

  const frames = design.visual ? [design.visual.frame] : [];
  const textStyles = design.text ? [design.text.style] : [];
  const header = headerHtml(design.header, { title, ui, lang });
  const under = decorHtml((design.decor || []).filter((item) => item.layer !== "over"), rng, "du");
  const over = decorHtml((design.decor || []).filter((item) => item.layer === "over"), rng, "do");
  const overlay = design.overlay ? design.overlay({ ...ctx, scenes, ui }) : null;

  const tweens = [];
  const scenesHtml = scenes.map((scene, i) => {
    const idx = scene.index;
    let visual = "";
    if (design.visual) {
      const inner = design.panel
        ? `<div class="v-panel" id="v-img-${idx}">${design.panel(scene, i, { ...ctx, scenes, ui })}</div>`
        : `<img class="v-img" id="v-img-${idx}" src="${escapeHtml(scene.imgSrc)}" alt="" style="${design.visual.filter ? `filter:${design.visual.filter}` : ""}">${overlayHtml(`v-tr-${idx}`, creative.treatmentCss)}`;
      visual = frameHtml(design.visual.frame, {
        id: `v-frame-${idx}`, region: design.visual.region, inner, rng,
        sub: design.visual.sub ? escapeHtml(design.visual.sub(scene, i, ui)) : "",
        label: design.visual.label ? escapeHtml(design.visual.label(scene, i, ui)) : "",
      });
      tweens.push(...imageMotionTweens(creative.dna.image_motion, rng, { target: `#v-img-${idx}`, start: scene.visualStart, duration: scene.visualDuration }));
      if (design.visual.frame === "radar") {
        tweens.push({ method: "fromTo", target: `#v-frame-${idx}-sweep`, from: { rotation: 0 }, vars: { rotation: 360 * Math.max(1, Math.round(scene.visualDuration / 3)), duration: scene.visualDuration, ease: "none" }, at: scene.visualStart });
      }
    }
    const text = design.text
      ? textHtml(design.text.style, { id: `v-text-${idx}`, region: design.text.region, text: scene.line, rng, script, size: design.text.size, align: design.text.align })
      : "";
    if (design.text) tweens.push(...textEnterTweens(design.text.enter, { lineId: `v-text-${idx}-line`, boxId: `v-text-${idx}`, at: scene.visualStart, duration: scene.visualDuration }));
    const tag = tagHtml(design.tag, { i, n, ui, lang, id: `v-tag-${idx}` });
    const extra = design.sceneExtra ? design.sceneExtra(scene, i, { ...ctx, scenes, ui }) : null;
    if (extra?.tweens) tweens.push(...extra.tweens);
    if (i > 0) {
      tweens.push(...transitionTweens(creative.dna.transition, {
        prev: `#v-inner-${scenes[i - 1].index}`, next: `#v-inner-${idx}`, at: scene.visualStart,
        prevStart: scenes[i - 1].visualStart, nextDuration: scene.visualDuration,
      }));
    }
    return `
<div id="v-scene-${idx}" class="clip v-scene" data-start="${scene.visualStart}" data-duration="${scene.visualDuration}" data-track-index="3">
  <div class="v-inner" id="v-inner-${idx}">${visual}${text}${tag}${extra?.html || ""}</div>
</div>`;
  }).join("");
  if (overlay?.tweens) tweens.push(...overlay.tweens);
  if (design.header?.style === "osd_bar") {
    // Chấm REC nhấp nháy: tween tất định theo nhịp 1 s (không vòng lặp tự chạy).
    for (let t = 0; t < totalDuration; t += 1) tweens.push({ method: "set", target: "#h-rec-dot", vars: { opacity: t % 2 ? 0.25 : 1 }, at: t });
  }

  const vars = Object.entries({ "--head-ink": headInk, ...(design.vars || {}) }).map(([k, v]) => `${k}:${v}`).join(";");
  const body = `
<div id="v-bg" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="1"><div class="v-bg-fill"></div>${overlayHtml("v-tr-bg", creative.treatmentCss)}${under.html}</div>
<div id="v-head" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">${header.html}</div>
${scenesHtml}
${overlay ? `<div id="v-overlay" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="4">${overlay.html}</div>` : ""}
${over.html ? `<div id="v-decor-top" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="5">${over.html}</div>` : ""}`;

  const css = `${paletteCss(creative.theme.palette)}
:root{${vars}}
#root{font-family:${creative.fonts.body};color:var(--fg);background:var(--bg)}
${backgroundCss(bg, creative.seeds.video)}
#v-head,#v-overlay,#v-decor-top{pointer-events:none}
#v-overlay{z-index:15}#v-decor-top{z-index:18}#v-head{z-index:20}
.v-inner{position:absolute;inset:0}
.v-img{width:100%;height:100%;object-fit:${design.visual?.fit || "cover"};transform-origin:50% 50%;display:block}
.v-panel{position:absolute;inset:0;transform-origin:50% 50%}
.v-text{z-index:8}.g-chip,.g-stamp,.g-counter,.g-osd,.g-chalkn{z-index:9}
${header.css}
${frameCss(frames)}
${textCss(textStyles)}
${design.tag ? TAG_CSS[design.tag.style] : ""}
${under.css}
${over.css}
${overlay?.css || ""}
${design.css || ""}`;

  const observability = { ...creative.observability, layout: layoutRegions(design) };
  const html = documentHtml({
    slug, lang, totalDuration, css, body,
    audioHtml: `${cinemaAudioHtml || ""}\n${voiceClipsHtml(scenes)}`,
    timelineJs: timelineJs(tweens),
    creative: observability,
  });
  return { html, creative: observability, cfg: { variant_id: creative.variant.id, composition: creative.composition.id, scenes: n, ...cfg } };
}
