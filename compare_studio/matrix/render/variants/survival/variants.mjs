// 7 base variant của engine survival (Phase 2–5). Engine TEXT: không ảnh AI, không bộ mặt meme Mr. Incredible — mỗi
// variant có reactor SVG GỐC (reactor.mjs, một nhân vật cho mỗi (variant, nước)) và đồng hồ đo riêng dựng từ extras
// (eyebrow, metric_labels, levels[label/status/severity/metrics]). Trục gốc khác nhau ở background/transition/
// imageMotion/typography (≥ 4/6). Theo V2 mục 20: deep-sea dùng THƯỚC ĐỘ SÂU DỌC + áp kế, không ô cửa tròn (của wildlife).
import { IMAGE_ASSET, IMAGE_COST } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { upper } from "../kit/textdata.mjs";
import { CARD_CSS, METRIC_CSS, STAGE_CSS, levelCard, merge, metricBars, reactorStage, t3, tagText } from "./skit.mjs";
import { survivalSample } from "./sample.mjs";

const base = { engine: "survival", asset: IMAGE_ASSET, cost: IMAGE_COST, sample: survivalSample };
const accent = (ctx, key = "--accent-terra") => ctx.creative.theme.palette[key];
const BASE_CSS = `${CARD_CSS}${METRIC_CSS}${STAGE_CSS}.f-bleed{background:transparent!important}`;

/** Kim đồng hồ HTML (xoay quanh đáy) từ mức độ cảnh trước tới cảnh này: −120°…+120°. */
function needleTweens(target, scene, prevSeverity, severity) {
  const angle = (s) => -120 + ((s - 1) / 9) * 240;
  return [{ method: "fromTo", target, from: { rotation: angle(prevSeverity) }, vars: { rotation: angle(severity), duration: t3(Math.min(0.9, scene.visualDuration * 0.3)), ease: "back.out(1.6)" }, at: t3(scene.visualStart + 0.2) }];
}

/** Tween cho phần tử xuyên suốt (overlay): tới giá trị của mỗi cảnh ở đầu cảnh (không chồng thời gian). */
function stepTweens(target, scenes, valueOf, { prop = "scaleY", ease = "power2.inOut", initial } = {}) {
  const tweens = [{ method: "set", target, vars: { [prop]: initial ?? valueOf(0) }, at: 0 }];
  scenes.forEach((scene, i) => {
    if (i === 0) return;
    tweens.push({ method: "to", target, vars: { [prop]: valueOf(i), duration: t3(Math.min(0.8, scene.visualDuration * 0.4)), ease }, at: t3(scene.visualStart + 0.05) });
  });
  return tweens;
}

const avg = (item) => Math.round(item.metrics.reduce((a, b) => a + b, 0) / item.metrics.length);

// --- 1. Endurance: giới hạn chịu đựng — đồng hồ bấm giờ + 3 thanh sinh lực dọc -----------------------------------
const ENDURANCE_RAMP = ["#1db954", "#4cc35a", "#8bcf3f", "#c9d42c", "#f2c21b", "#f59e0b", "#f97316", "#ef4444", "#dc2626", "#991b1b"];
function stopwatch(scene, { region, cls }) {
  const id = `en-sw-${scene.index}`;
  const secs = Math.floor(scene.start);
  const time = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const ticks = Array.from({ length: 12 }, (_, k) => `<i style="transform:rotate(${k * 30}deg)"></i>`).join("");
  return {
    html: `<div class="en-sw ${cls}" id="${id}" style="${regionStyle(region, `--sw:${region.w}px`)}"><div class="en-sw-face">${ticks}<b class="en-sw-hand" id="${id}-hand"></b><span>${time}</span></div></div>`,
    tweens: [{ method: "fromTo", target: `#${id}-hand`, from: { rotation: 0 }, vars: { rotation: 360, duration: t3(Math.max(0.5, scene.visualDuration - 0.1)), ease: "none" }, at: t3(scene.visualStart) }],
  };
}
const SW_CSS = ".en-sw{position:absolute;box-sizing:border-box}.en-sw-face{position:absolute;inset:0;border-radius:50%;background:#fff;border:14px solid #1f2933;box-shadow:0 12px 30px rgba(0,0,0,.3)}.en-sw-face::before{content:'';position:absolute;left:50%;top:-44px;width:60px;height:34px;margin-left:-30px;background:#1f2933;border-radius:8px}.en-sw-face i{position:absolute;left:50%;top:6px;width:6px;height:22px;margin-left:-3px;background:#1f2933;transform-origin:50% calc((var(--sw,260px) - 28px) / 2 - 6px)}.en-sw-hand{position:absolute;left:50%;top:18%;width:8px;height:32%;margin-left:-4px;background:#e8412f;transform-origin:50% 100%;border-radius:4px}.en-sw-face span{position:absolute;left:0;right:0;bottom:20%;text-align:center;font-size:calc(var(--sw,260px) * .18);font-weight:700;color:#1f2933;letter-spacing:2px}";

const endurance = defineVariant({
  ...base,
  id: "survival/endurance",
  name_vi: "Giới hạn chịu đựng",
  topicPacks: { survival_body_limits: 0.6, survival_extreme_sports: 0.4 },
  layoutFamily: "stopwatch_track",
  axes: { composition: "split_vertical", textPlacement: "bottom", background: "gradient", transition: "slide", imageMotion: "push_in", typography: "condensed" },
  audio: { gender: "male", fx: ["none"] },
  ui: {
    en: { label: "BREAKING POINT", scene: "LEVEL", level: "LEVEL", intro: "START", final: "FINISH" }, de: { label: "BELASTUNGSGRENZE", scene: "STUFE", level: "STUFE", intro: "START", final: "ZIEL" },
    ja: { label: "限界チャレンジ", scene: "レベル", level: "レベル", intro: "スタート", final: "ゴール" }, ko: { label: "한계 도전", scene: "단계", level: "단계", intro: "출발", final: "결승" },
    vi: { label: "GIỚI HẠN CHỊU ĐỰNG", scene: "CẤP", level: "CẤP", intro: "XUẤT PHÁT", final: "VỀ ĐÍCH" }, fr: { label: "POINT DE RUPTURE", scene: "NIVEAU", level: "NIVEAU", intro: "DÉPART", final: "ARRIVÉE" },
  },
  compositions: {
    stopwatch: {
      axes: { composition: "split_vertical", textPlacement: "bottom" },
      describe: "Reactor băng đô bên trái; cột phải: đồng hồ bấm giờ (mốc thời gian thật của cảnh) + 3 thanh chỉ số dọc; thẻ cấp + mức độ; lời đọc dải ticker dưới",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "headband", accent: accent(ctx), outline: { color: "#1f1a1a", width: 5 }, stage: "background:radial-gradient(circle at 50% 70%,rgba(255,255,255,.55),transparent 70%)" });
        const colors = ["#1db954", "#f59e0b", "#3b82f6"];
        return {
          header: { style: "label_title", region: { x: 60, y: 90, w: 960, h: 180 } },
          visual: { frame: "plain", region: { x: 300, y: 290, w: 740, h: 1010 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "ticker", region: { x: 40, y: 1530, w: 1000, h: 165 }, size: 44, enter: "slide" },
          sceneExtra: (scene, i, c) => merge(
            stopwatch(scene, { region: { x: 60, y: 330, w: 200, h: 200 }, cls: "" }),
            stage.reactor(scene, i, { x: 40, y: 555, w: 240, h: 250 }, "en-rx"),
            metricBars(scene, i, { data: stage.data, region: { x: 40, y: 825, w: 240, h: 475 }, cls: "en-mx sv-wrap", orient: "v", colors }),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 40, y: 1318, w: 1000, h: 197 }, cls: "en-card", ramp: ENDURANCE_RAMP, labelSize: 48, parts: ["eyebrow", "tag", "label", "status", "severity"] }),
            { tweens: stage.tweens(scene, i) },
          ),
          vars: { "--frame-edge": "#1f2933" },
          css: `${BASE_CSS}${SW_CSS}.f-plain{background:linear-gradient(180deg,#bfe3ff,#f4f8fb)}.en-card{color:var(--fg)}.en-card .sv-tag{color:var(--accent-terra-ink)}.en-card .sv-row{position:absolute;right:0;top:0;width:440px}.en-card .sv-label-box,.en-card .sv-eyebrow,.en-card .sv-tag{margin-right:460px}.en-card .sv-eyebrow{font-size:24px;letter-spacing:2px;color:var(--fg)}.en-card{gap:8px}.en-card .sv-pips{position:absolute;right:0;bottom:0;width:440px}.en-mx .sv-m-t,.en-mx .sv-m-val{color:var(--fg)}.en-mx{--sv-track:rgba(31,41,51,.14);gap:10px}.en-rx{border:8px solid #1f2933}`,
        };
      },
    },
    race_lane: {
      axes: { composition: "timeline_track", textPlacement: "top" },
      describe: "Lời đọc ở trên; đường chạy ngang có vạch từng cấp và người chạy tiến dần; reactor trong vòng tròn trái + thẻ cấp phải; 3 thanh chỉ số ngang dưới",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "headband", accent: accent(ctx, "--accent-sage"), outline: null, stage: "background:linear-gradient(180deg,#9fd3ff,#e9f5ff)" });
        const colors = ["#16a34a", "#ea580c", "#2563eb"];
        return {
          header: { style: "centered", region: { x: 60, y: 80, w: 960, h: 170 } },
          text: { style: "panel", region: { x: 40, y: 265, w: 1000, h: 190 }, size: 44, enter: "fade_up" },
          visual: { frame: "plain", region: { x: 40, y: 585, w: 1000, h: 745 } },
          panel: (scene, i) => stage.panel(scene, i),
          sceneExtra: (scene, i, c) => merge(
            stage.reactor(scene, i, { x: 40, y: 1350, w: 245, h: 245 }, "rx-round en-rx2"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 305, y: 1348, w: 735, h: 250 }, cls: "en-card2 sv-compact", ramp: ENDURANCE_RAMP, labelSize: 46 }),
            metricBars(scene, i, { data: stage.data, region: { x: 40, y: 1612, w: 1000, h: 83 }, cls: "en-mx2 sv-row3", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          overlay: (c) => {
            const n = c.scenes.length;
            const x = (k) => Math.round(80 + (k / Math.max(1, n - 1)) * 880);
            const marks = c.scenes.map((scene, k) => `<i class="en-lane-mark" style="left:${x(k)}px"></i>`).join("");
            const html = `<div class="en-lane"><div class="en-lane-track"></div>${marks}<div class="en-runner" id="en-runner"></div></div>`;
            return { html, css: ".en-lane{position:absolute;left:40px;top:462px;width:1000px;height:110px}.en-lane-track{position:absolute;left:0;right:0;top:52px;height:34px;background:#c2410c;border-top:4px solid #fff;border-bottom:4px solid #fff}.en-lane-mark{position:absolute;top:40px;width:6px;height:58px;margin-left:-3px;background:#fff}.en-runner{position:absolute;left:0;top:20px;width:64px;height:64px;margin-left:-32px;border-radius:50%;background:#111;border:8px solid #fde047;box-sizing:border-box}", tweens: stepTweens("#en-runner", c.scenes, (k) => x(k), { prop: "x", initial: x(0) }) };
          },
          vars: { "--frame-edge": "#c2410c" },
          css: `${BASE_CSS}.f-plain{border-radius:28px}.en-rx2{border:10px solid #c2410c}.en-card2{color:var(--fg);padding:4px 0}.en-card2 .sv-tag{color:#7c2d12}.en-card2 .sv-eyebrow{color:var(--fg-dim)}.en-mx2 .sv-m-t,.en-mx2 .sv-m-val{color:var(--fg)}`,
        };
      },
    },
  },
  allowed: {
    typography: ["condensed", "heavy", "grotesk"], treatment: ["clean", "film_grain"],
    image_motion: ["push_in", "handheld", "still_grain"], transition: ["slide", "zoom_through", "cut"], tone: [0, 1, 2, 4],
  },
});

// --- 2. Deep sea: thước độ sâu DỌC + áp kế (không ô cửa tròn) -------------------------------------------------------
const DEEP_RAMP = ["#7dd3fc", "#38bdf8", "#22d3ee", "#2dd4bf", "#a3e635", "#facc15", "#fb923c", "#f87171", "#e11d48", "#c026d3"];
function pressureGauge(scene, i, stage, { region, cls, ui, lang }) {
  const id = `ds-pg-${scene.index}`;
  const item = stage.data.items[i];
  const prev = i ? stage.data.items[i - 1].severity : 1;
  const ticks = Array.from({ length: 11 }, (_, k) => `<i style="transform:rotate(${-120 + k * 24}deg)"></i>`).join("");
  return {
    html: `<div class="ds-pg ${cls}" id="${id}" style="${regionStyle(region)}"><div class="ds-pg-dial">${ticks}<b id="${id}-needle"></b><span>${escapeHtml(upper(ui.pressure, lang))}</span></div></div>`,
    tweens: needleTweens(`#${id}-needle`, scene, prev, item.severity),
  };
}
const GAUGE_CSS = ".ds-pg{position:absolute;box-sizing:border-box}.ds-pg-dial{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,#f5f1e6 0 62%,#c8b98f 63% 66%,#3a3a38 67%);box-shadow:0 10px 24px rgba(0,0,0,.45)}.ds-pg-dial i{position:absolute;left:50%;top:14%;width:4px;height:12%;margin-left:-2px;background:#222;transform-origin:50% 300%}.ds-pg-dial b{position:absolute;left:50%;top:18%;width:8px;height:32%;margin-left:-4px;background:#c81e1e;transform-origin:50% 100%;border-radius:4px}.ds-pg-dial span{position:absolute;left:18%;right:18%;top:62%;text-align:center;font-size:22px;letter-spacing:2px;color:#222;white-space:nowrap;overflow:hidden}";
function depthRuler(c, stage, { x, y, h, side = "right" }) {
  const n = c.scenes.length;
  const pos = (k) => Math.round((k / Math.max(1, n - 1)) * h);
  const ticks = Array.from({ length: 25 }, (_, k) => `<i class="ds-minor" style="top:${Math.round((k / 24) * h)}px"></i>`).join("");
  const marks = stage.data.items.map((item, k) => `<div class="ds-mark" style="top:${pos(k)}px"><span>${escapeHtml(tagText(item, c.ui, c.lang))}</span></div>`).join("");
  const html = `<div class="ds-ruler ds-${side}" style="left:${x}px;top:${y}px;height:${h}px"><div class="ds-bar"></div>${ticks}${marks}<div class="ds-cursor" id="ds-cursor"></div></div>`;
  return { html, tweens: stepTweens("#ds-cursor", c.scenes, (k) => pos(k), { prop: "y", initial: 0 }) };
}
const RULER_CSS = ".ds-ruler{position:absolute;width:0}.ds-bar{position:absolute;left:-6px;top:0;bottom:0;width:12px;background:linear-gradient(180deg,#9be7ff,#1e3a8a 60%,#0b0f2a);border-radius:6px}.ds-minor{position:absolute;left:6px;width:18px;height:2px;background:rgba(220,240,255,.6)}.ds-right .ds-minor{left:-24px}.ds-mark{position:absolute;height:40px;margin-top:-20px;display:flex;align-items:center;white-space:nowrap}.ds-mark::before{content:'';width:36px;height:4px;background:#e0f2fe;flex:none}.ds-right .ds-mark{right:0;flex-direction:row-reverse}.ds-left .ds-mark{left:0}.ds-mark span{font-size:19px;line-height:40px;color:#e0f2fe;background:rgba(3,20,40,.85);padding:0 8px}.ds-cursor{position:absolute;left:-24px;top:-18px;width:48px;height:36px;background:#facc15;clip-path:polygon(0 0,100% 50%,0 100%)}.ds-right .ds-cursor{left:-24px;clip-path:polygon(100% 0,0 50%,100% 100%)}";

const deepSea = defineVariant({
  ...base,
  id: "survival/deep-sea",
  name_vi: "Lặn sâu chưa khám phá",
  topicPacks: { survival_deep_ocean: 0.7, survival_body_limits: 0.3 },
  layoutFamily: "depth_ruler",
  axes: { composition: "scale", textPlacement: "bottom", background: "water", transition: "wipe", imageMotion: "pan_lateral", typography: "grotesk" },
  audio: { gender: "any", fx: ["none", "radio"] },
  ui: {
    en: { label: "DESCENT LOG", scene: "DEPTH", level: "DEPTH", intro: "SURFACE", final: "BOTTOM", pressure: "PRESSURE" }, de: { label: "TAUCHPROTOKOLL", scene: "TIEFE", level: "TIEFE", intro: "OBERFLÄCHE", final: "GRUND", pressure: "DRUCK" },
    ja: { label: "潜航記録", scene: "深度", level: "深度", intro: "水面", final: "海底", pressure: "水圧" }, ko: { label: "잠수 기록", scene: "수심", level: "수심", intro: "수면", final: "해저", pressure: "수압" },
    vi: { label: "NHẬT KÝ LẶN", scene: "ĐỘ SÂU", level: "ĐỘ SÂU", intro: "MẶT NƯỚC", final: "ĐÁY", pressure: "ÁP SUẤT" }, fr: { label: "JOURNAL DE PLONGÉE", scene: "PROFONDEUR", level: "PALIER", intro: "SURFACE", final: "FOND", pressure: "PRESSION" },
  },
  compositions: {
    ruler_right: {
      axes: { composition: "scale", textPlacement: "bottom" },
      describe: "Thước độ sâu dọc cao hết màn bên phải (vạch mỗi cấp, con trỏ vàng lặn dần); reactor thợ lặn trong nước; áp kế + thẻ cấp; 3 thanh chỉ số; lời đọc hộp kính",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "diving", accent: "#f59e0b", outline: { color: "#06121f", width: 4 }, stage: "background:radial-gradient(ellipse at 50% 0,rgba(125,211,252,.4),transparent 70%)" });
        const colors = ["#22d3ee", "#facc15", "#a78bfa"];
        return {
          header: { style: "label_title", region: { x: 50, y: 90, w: 740, h: 180 } },
          visual: { frame: "bleed", region: { x: 0, y: 295, w: 1080, h: 800 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "glass", region: { x: 40, y: 1535, w: 760, h: 160 }, size: 40, enter: "fade_up" },
          sceneExtra: (scene, i, c) => merge(
            stage.reactor(scene, i, { x: 815, y: 62, w: 225, h: 220 }, "ds-rx"),
            pressureGauge(scene, i, stage, { region: { x: 40, y: 1115, w: 215, h: 215 }, cls: "", ui: c.ui, lang: ctx.lang }),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 275, y: 1112, w: 525, h: 225 }, cls: "ds-card sv-compact", ramp: DEEP_RAMP, labelSize: 42 }),
            metricBars(scene, i, { data: stage.data, region: { x: 40, y: 1350, w: 760, h: 174 }, cls: "ds-mx", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          overlay: (c) => { const ruler = depthRuler(c, stage, { x: 1010, y: 1125, h: 555, side: "right" }); return { html: ruler.html, css: RULER_CSS, tweens: ruler.tweens }; },
          css: `${BASE_CSS}${GAUGE_CSS}.ds-rx{border:3px solid rgba(125,211,252,.7);background:#06243a}.ds-card .sv-pips{display:none}.ds-card .sv-eyebrow{font-size:22px}.ds-card{color:#e0f2fe}.ds-card .sv-tag{color:#7dd3fc}.ds-mx .sv-m-t,.ds-mx .sv-m-val{color:#e0f2fe}.ds-mx{--sv-track:rgba(224,242,254,.15)}.ds-mx .sv-m-h{grid-template-rows:34px 18px}`,
        };
      },
    },
    ruler_left: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Lời đọc ở trên; thước độ sâu dọc bên trái; reactor dưới vòm chuông lặn (khung vòm) bên phải; thẻ cấp + áp kế; chỉ số dưới cùng",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "diving", accent: "#22d3ee", outline: null, flat: true, stage: "background:linear-gradient(180deg,#0e7490,#082f49)" });
        const colors = ["#67e8f9", "#fde047", "#f0abfc"];
        return {
          header: { style: "label_title", region: { x: 60, y: 90, w: 960, h: 180 } },
          text: { style: "glass", region: { x: 40, y: 285, w: 1000, h: 190 }, size: 42, enter: "fade_up" },
          visual: { frame: "arch", region: { x: 250, y: 495, w: 790, h: 905 } },
          panel: (scene, i) => stage.panel(scene, i),
          sceneExtra: (scene, i, c) => merge(
            pressureGauge(scene, i, stage, { region: { x: 30, y: 1135, w: 200, h: 200 }, cls: "", ui: c.ui, lang: ctx.lang }),
            stage.reactor(scene, i, { x: 25, y: 1355, w: 210, h: 240 }, "ds-rx2"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 250, y: 1415, w: 790, h: 185 }, cls: "ds-card ds-card2", ramp: DEEP_RAMP, labelSize: 44, parts: ["eyebrow", "tag", "label", "status", "severity"] }),
            metricBars(scene, i, { data: stage.data, region: { x: 250, y: 1612, w: 790, h: 83 }, cls: "ds-mx sv-row3", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          overlay: (c) => { const ruler = depthRuler(c, stage, { x: 36, y: 515, h: 590, side: "left" }); return { html: ruler.html, css: RULER_CSS, tweens: ruler.tweens }; },
          vars: { "--frame-edge": "#f59e0b" },
          css: `${BASE_CSS}${GAUGE_CSS}.ds-rx2{border:6px solid #f59e0b;border-radius:105px 105px 14px 14px}.ds-card2{gap:6px}.ds-card2 .sv-eyebrow{font-size:22px}.ds-card2 .sv-row{position:absolute;right:0;top:0;width:330px}.ds-card2 .sv-label-box,.ds-card2 .sv-eyebrow,.ds-card2 .sv-tag{margin-right:350px}.ds-card2 .sv-pips{position:absolute;right:0;bottom:0;width:330px}.ds-card{color:#e0f2fe}.ds-card .sv-tag{color:#fde047}.ds-mx .sv-m-t,.ds-mx .sv-m-val{color:#e0f2fe}.ds-mx{--sv-track:rgba(224,242,254,.15)}.ds-mx .sv-m-h{grid-template-rows:34px 18px}`,
        };
      },
    },
  },
  allowed: {
    typography: ["grotesk", "condensed", "mono"], treatment: ["clean", "vignette_dark", "film_grain"],
    image_motion: ["pan_lateral", "parallax", "still_grain"], transition: ["wipe", "ink_bleed", "fade_black"], tone: [0, 2, 4],
  },
});

// --- 3. Space exposure: HUD mũ phi hành gia — 3 cung đo quanh mũ ---------------------------------------------------
const SPACE_RAMP = ["#e2e8f0", "#cbd5e1", "#a5f3fc", "#67e8f9", "#fde68a", "#fbbf24", "#fb923c", "#f87171", "#ef4444", "#dc2626"];
function hudArcs(scene, i, stage, { region, cls, dir = "row" }) {
  const id = `sp-hud-${scene.index}`;
  const item = stage.data.items[i];
  const prev = i ? stage.data.items[i - 1].metrics : [100, 100, 100];
  const colors = ["#67e8f9", "#fbbf24", "#f472b6"];
  const cells = item.metrics.map((value, m) => `<div class="sp-arc"><svg viewBox="0 0 120 120" data-layout-allow-overflow="true"><circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="10" pathLength="100" stroke-dasharray="75 100" transform="rotate(135 60 60)"/><circle id="${id}-${m}" cx="60" cy="60" r="48" fill="none" stroke="${colors[m]}" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="75 100" transform="rotate(135 60 60)"/></svg><b>${value}</b><div class="sp-arc-l">${fitText("span", `class="sp-arc-t" style="font-size:24px"`, stage.data.metricLabels[m], 12)}</div></div>`).join("");
  const off = (v) => t3(75 - (v / 100) * 75 + 0.001);
  const tweens = item.metrics.map((value, m) => ({ method: "fromTo", target: `#${id}-${m}`, from: { strokeDashoffset: off(prev[m]) }, vars: { strokeDashoffset: off(value), duration: t3(Math.min(0.9, scene.visualDuration * 0.3)), ease: "power2.out" }, at: t3(scene.visualStart + 0.25) }));
  return { html: `<div class="sp-hud sp-${dir} ${cls}" id="${id}" style="${regionStyle(region)}">${cells}</div>`, tweens };
}
const HUD_CSS = ".sp-hud{position:absolute;box-sizing:border-box;display:flex;gap:16px}.sp-col{flex-direction:column}.sp-arc{position:relative;flex:1;min-width:0;min-height:0}.sp-arc svg{position:absolute;left:50%;top:0;height:78%;aspect-ratio:1;transform:translateX(-50%)}.sp-arc b{position:absolute;left:0;right:0;top:26%;text-align:center;font-size:52px;line-height:1;color:#f8fafc}.sp-arc-l{position:absolute;left:0;right:0;bottom:0;height:20%;display:flex;align-items:center;justify-content:center;text-align:center}.sp-arc-t{margin:0;color:#cbd5e1;letter-spacing:2px;white-space:nowrap}";
const STARS = "background:radial-gradient(circle at 20% 30%,rgba(255,255,255,.9) 0 2px,transparent 3px),radial-gradient(circle at 70% 18%,rgba(255,255,255,.8) 0 2px,transparent 3px),radial-gradient(circle at 84% 64%,rgba(255,255,255,.7) 0 1.5px,transparent 2.5px),radial-gradient(circle at 12% 78%,rgba(255,255,255,.7) 0 1.5px,transparent 2.5px),radial-gradient(ellipse at 50% 120%,#1e3a8a,transparent 60%)";

const spaceExposure = defineVariant({
  ...base,
  id: "survival/space-exposure",
  name_vi: "Sống sót ngoài không gian",
  topicPacks: { survival_space: 0.75, survival_body_limits: 0.25 },
  layoutFamily: "helmet_hud",
  axes: { composition: "device_frame", textPlacement: "lower_third", background: "darkness", transition: "shutter", imageMotion: "still_grain", typography: "mono" },
  audio: { gender: "female", fx: ["radio", "none"] },
  ui: {
    en: { label: "SUIT TELEMETRY", scene: "STAGE", level: "STAGE", intro: "DOCKED", final: "LOST", severity: "SEVERITY" }, de: { label: "ANZUG-TELEMETRIE", scene: "PHASE", level: "PHASE", intro: "ANGEDOCKT", final: "VERLOREN", severity: "SCHWERE" },
    ja: { label: "宇宙服テレメトリ", scene: "段階", level: "段階", intro: "ドッキング", final: "喪失", severity: "深刻度" }, ko: { label: "우주복 원격측정", scene: "단계", level: "단계", intro: "도킹", final: "상실", severity: "심각도" },
    vi: { label: "CHỈ SỐ BỘ ĐỒ", scene: "GIAI ĐOẠN", level: "GIAI ĐOẠN", intro: "NEO ĐẬU", final: "MẤT TÍN HIỆU", severity: "MỨC ĐỘ" }, fr: { label: "TÉLÉMÉTRIE", scene: "PHASE", level: "PHASE", intro: "AMARRÉ", final: "PERDU", severity: "GRAVITÉ" },
  },
  compositions: {
    visor: {
      axes: { composition: "device_frame", textPlacement: "lower_third" },
      describe: "Reactor trong mũ phi hành gia giữa trời sao; hàng 3 cung đo HUD (chỉ số) dưới mũ; thẻ cấp + mức độ; lời đọc lower-third",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "helmet", accent: accent(ctx), outline: { color: "#0b1020", width: 4 }, stage: STARS });
        return {
          header: { style: "osd_bar", region: { x: 0, y: 100, w: 1080, h: 96 } },
          visual: { frame: "bleed", region: { x: 40, y: 268, w: 1000, h: 800 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "lower_third", region: { x: 40, y: 1535, w: 1000, h: 160 }, size: 40, enter: "slide" },
          sceneExtra: (scene, i, c) => merge(
            stage.reactor(scene, i, { x: 40, y: 1088, w: 250, h: 262 }, "sp-rx"),
            hudArcs(scene, i, stage, { region: { x: 310, y: 1095, w: 730, h: 250 }, cls: "" }),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 40, y: 1365, w: 1000, h: 160 }, cls: "sp-card", ramp: SPACE_RAMP, labelSize: 44, parts: ["tag", "label", "status", "severity"] }),
            { tweens: stage.tweens(scene, i) },
          ),
          overlay: () => ({ html: `<div class="sp-eyebrow">${escapeHtml(stage.data.eyebrow)}</div>`, css: ".sp-eyebrow{position:absolute;left:40px;top:208px;font-size:26px;letter-spacing:4px;color:#67e8f9;border:2px solid #67e8f9;padding:4px 12px;background:rgba(2,6,23,.8);white-space:nowrap;max-width:420px;overflow:hidden}", tweens: [] }),
          vars: { "--scope-ink": "#67e8f9", "--accent-terra": "#67e8f9" },
          css: `${BASE_CSS}${HUD_CSS}.sp-rx{border:4px solid #67e8f9;border-radius:125px 125px 20px 20px}.f-bleed{border-radius:26px}.sp-card{color:#f8fafc;gap:8px}.sp-card .sv-tag{color:#67e8f9}.sp-card .sv-row{position:absolute;right:0;top:0;width:430px}.sp-card .sv-label-box{margin-right:450px}.sp-card .sv-pips{position:absolute;right:0;bottom:0;width:430px}.t-lower_third{background:linear-gradient(90deg,rgba(2,6,23,.95),rgba(2,6,23,.85))!important}`,
        };
      },
    },
    telemetry_column: {
      axes: { composition: "ring", textPlacement: "right_column" },
      describe: "Cột trái 3 cung đo dọc; reactor mũ phi hành gia bên phải; dưới reactor là thẻ cấp và lời đọc cột phải",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "helmet", accent: "#f97316", outline: null, flat: true, stage: "background:radial-gradient(circle,#172554,#020617 70%)" });
        return {
          header: { style: "label_title", region: { x: 60, y: 90, w: 720, h: 180 } },
          visual: { frame: "plain", region: { x: 40, y: 300, w: 1000, h: 765 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "osd", region: { x: 310, y: 1360, w: 730, h: 335 }, size: 42, enter: "type" },
          sceneExtra: (scene, i, c) => merge(
            stage.reactor(scene, i, { x: 815, y: 58, w: 225, h: 225 }, "rx-round sp-rx2"),
            hudArcs(scene, i, stage, { region: { x: 40, y: 1085, w: 250, h: 610 }, cls: "", dir: "col" }),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 310, y: 1085, w: 730, h: 255 }, cls: "sp-card2 sv-compact", ramp: SPACE_RAMP, labelSize: 44 }),
            { tweens: stage.tweens(scene, i) },
          ),
          decor: [{ kind: "dust", count: 60, area: { x: 0, y: 0, w: 1080, h: 1920 } }],
          vars: { "--scope-ink": "#fbbf24", "--frame-edge": "#94a3b8" },
          css: `${BASE_CSS}${HUD_CSS}.f-plain{border-radius:30px}.sp-rx2{border:8px solid #94a3b8;box-shadow:0 0 0 6px rgba(251,191,36,.5)}.sp-card2{color:#f8fafc}.sp-card2 .sv-tag{color:#fbbf24}.sp-card2 .sv-eyebrow{color:#94a3b8}.sp-hud.sp-col{border-right:2px solid rgba(148,163,184,.4);padding-right:18px}`,
        };
      },
    },
  },
  allowed: {
    typography: ["mono", "grotesk", "condensed"], treatment: ["clean", "vignette_dark", "film_grain"],
    image_motion: ["still_grain", "push_in", "ken_burns_slow"], transition: ["shutter", "fade_black", "glitch"], tone: [0, 2, 3, 4],
  },
});

// --- 4. Extreme heat: nhiệt kế + sóng nhiệt ----------------------------------------------------------------------
const HEAT_RAMP = ["#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#f97316", "#ea580c", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"];
function thermometer(c, stage, { x, y, w, h }) {
  const n = c.scenes.length;
  const scale = Array.from({ length: 10 }, (_, k) => `<i style="bottom:${Math.round(((k + 1) / 10) * (h - w - 20))}px"><em>${k + 1}</em></i>`).join("");
  const html = `<div class="ht-th" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="ht-tube"><div class="ht-merc" id="ht-merc"></div>${scale}</div><div class="ht-bulb"></div></div>`;
  const sev = (k) => stage.data.items[k].severity;
  return {
    html,
    tweens: stepTweens("#ht-merc", c.scenes, (k) => t3(sev(k) / 10)),
    n,
  };
}
/** Lớp sóng nhiệt theo cảnh (dưới thẻ/chỉ số/lời đọc), đậm dần theo mức độ. */
function heatHaze(scene, i, stage) {
  const id = `ht-haze-${scene.index}`;
  const level = (k) => t3(0.15 + stage.data.items[k].severity * 0.085);
  return {
    html: `<div class="ht-haze" id="${id}"></div>`,
    tweens: [{ method: "fromTo", target: `#${id}`, from: { opacity: level(Math.max(0, i - 1)) }, vars: { opacity: level(i), duration: t3(Math.min(1, scene.visualDuration * 0.35)), ease: "power1.out" }, at: t3(scene.visualStart + 0.05) }],
  };
}
const THERMO_CSS = ".ht-th{position:absolute}.ht-tube{position:absolute;left:25%;right:25%;top:0;bottom:calc(var(--bulb,120px) - 30px);border-radius:40px 40px 0 0;background:rgba(255,255,255,.9);border:6px solid #3b2a1a;border-bottom:0;overflow:visible}.ht-merc{position:absolute;left:18%;right:18%;bottom:0;top:20px;background:linear-gradient(180deg,#ef4444,#b91c1c);border-radius:20px 20px 0 0;transform-origin:50% 100%}.ht-tube i{position:absolute;left:100%;width:20px;height:4px;background:#3b2a1a;margin-left:6px}.ht-tube i em{position:absolute;left:28px;top:-15px;font-style:normal;font-size:26px;line-height:30px;color:#3b2a1a;font-weight:700;background:rgba(255,248,235,.85);padding:0 4px}.ht-bulb{position:absolute;left:0;right:0;bottom:0;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fca5a5,#dc2626 50%,#7f1d1d);border:6px solid #3b2a1a}.sv-card,.sv-mx{z-index:5}.ht-haze{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(0deg,rgba(255,110,20,.45),transparent 40%),radial-gradient(ellipse at 50% 115%,rgba(255,190,60,.6),transparent 60%);mix-blend-mode:multiply}";

const extremeHeat = defineVariant({
  ...base,
  id: "survival/extreme-heat",
  name_vi: "Nóng cực độ",
  topicPacks: { survival_heat: 0.7, survival_desert: 0.3 },
  layoutFamily: "thermometer",
  axes: { composition: "poster", textPlacement: "bottom", background: "stone", transition: "zoom_through", imageMotion: "ken_burns_fast", typography: "heavy" },
  audio: { gender: "male", fx: ["none"] },
  ui: {
    en: { label: "HEAT STROKE WATCH", scene: "LEVEL", level: "LEVEL", intro: "SHADE", final: "MELTDOWN" }, de: { label: "HITZEWARNUNG", scene: "STUFE", level: "STUFE", intro: "SCHATTEN", final: "KOLLAPS" },
    ja: { label: "熱中症警報", scene: "レベル", level: "レベル", intro: "日陰", final: "限界" }, ko: { label: "폭염 경보", scene: "단계", level: "단계", intro: "그늘", final: "한계" },
    vi: { label: "CẢNH BÁO SỐC NHIỆT", scene: "CẤP", level: "CẤP", intro: "BÓNG RÂM", final: "KIỆT SỨC" }, fr: { label: "ALERTE CANICULE", scene: "NIVEAU", level: "NIVEAU", intro: "OMBRE", final: "EFFONDREMENT" },
  },
  compositions: {
    thermo_left: {
      axes: { composition: "poster", textPlacement: "bottom" },
      describe: "Nhiệt kế lớn dọc bên trái (thuỷ ngân dâng theo mức độ) + lớp sóng nhiệt đậm dần; reactor mũ rộng vành; thẻ cấp; 3 thanh chỉ số; lời đọc",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "sunhat", accent: accent(ctx), outline: { color: "#3b2a1a", width: 5 }, stage: "background:radial-gradient(circle at 70% 20%,#fff7c2,#fbbf24 30%,rgba(251,146,60,.2) 70%)" });
        const colors = ["#0ea5e9", "#ef4444", "#a855f7"];
        return {
          header: { style: "ribbon", region: { x: 60, y: 100, w: 960, h: 160 }, size: 54 },
          visual: { frame: "plain", region: { x: 250, y: 285, w: 790, h: 895 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "paper_note", region: { x: 40, y: 1525, w: 1000, h: 170 }, size: 40, enter: "fade_up" },
          sceneExtra: (scene, i, c) => merge(
            heatHaze(scene, i, stage),
            stage.reactor(scene, i, { x: 40, y: 1198, w: 220, h: 220 }, "ht-rx"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 278, y: 1196, w: 762, h: 222 }, cls: "ht-card sv-compact", ramp: HEAT_RAMP, labelSize: 46 }),
            metricBars(scene, i, { data: stage.data, region: { x: 40, y: 1430, w: 1000, h: 80 }, cls: "ht-mx sv-row3", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          overlay: (c) => { const th = thermometer(c, stage, { x: 50, y: 295, w: 150, h: 885 }); return { html: th.html, css: `${THERMO_CSS}.ht-th{--bulb:150px}`, tweens: th.tweens }; },
          vars: { "--frame-edge": "#3b2a1a" },
          css: `${BASE_CSS}.ht-rx{border:6px solid #3b2a1a}.ht-card{color:#fff8eb;text-shadow:0 2px 6px rgba(0,0,0,.6)}.ht-card .sv-tag{color:#fde68a}.ht-card .sv-eyebrow{color:#fed7aa}.ht-mx .sv-m-t,.ht-mx .sv-m-val{color:#fff8eb;text-shadow:0 2px 4px rgba(0,0,0,.6)}.ht-mx{--sv-track:rgba(0,0,0,.35)}.ht-mx .sv-m-h{grid-template-rows:36px 20px}`,
        };
      },
    },
    mirage: {
      axes: { composition: "hero_image", textPlacement: "lower_third" },
      describe: "Ảnh reactor ngang lớn trên cùng (mép giấy xé); nhiệt kế nhỏ dọc góc trái dưới, cạnh đó 3 thanh chỉ số + thẻ cấp; lời đọc lower-third cam dưới cùng",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "sunhat", accent: "#0f766e", outline: null, stage: "background:linear-gradient(180deg,#fde68a,#fb923c)" });
        const colors = ["#0284c7", "#dc2626", "#7c3aed"];
        return {
          header: { style: "label_title", region: { x: 60, y: 90, w: 960, h: 180 } },
          visual: { frame: "torn", region: { x: 40, y: 290, w: 1000, h: 810 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "lower_third", region: { x: 40, y: 1525, w: 1000, h: 170 }, size: 42, enter: "slide" },
          sceneExtra: (scene, i, c) => merge(
            heatHaze(scene, i, stage),
            metricBars(scene, i, { data: stage.data, region: { x: 180, y: 1120, w: 600, h: 168 }, cls: "ht-mx2", colors }),
            stage.reactor(scene, i, { x: 800, y: 1118, w: 240, h: 240 }, "ht-rx2"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 180, y: 1300, w: 600, h: 215 }, cls: "ht-card2 sv-compact", ramp: HEAT_RAMP, labelSize: 44 }),
            { tweens: stage.tweens(scene, i) },
          ),
          overlay: (c) => { const th = thermometer(c, stage, { x: 45, y: 1120, w: 110, h: 395 }); return { html: th.html, css: `${THERMO_CSS}.ht-th{--bulb:110px}.ht-tube i em{display:none}`, tweens: th.tweens }; },
          vars: { "--accent-terra": "#f97316" },
          css: `${BASE_CSS}.ht-card2{color:#fff8eb;text-shadow:0 2px 6px rgba(0,0,0,.6);background:rgba(44,18,6,.78);padding:10px 16px;border-radius:10px}.ht-card2 .sv-tag{color:#fde68a}.ht-card2 .sv-eyebrow{color:#fed7aa}.ht-card2 .sv-eyebrow{font-size:22px}.ht-card2 .sv-pips{display:none}.ht-rx2{border:5px solid #7c2d12;border-radius:120px 120px 16px 16px}.ht-mx2 .sv-m-t,.ht-mx2 .sv-m-val{color:#fff8eb;text-shadow:0 2px 4px rgba(0,0,0,.6)}.ht-mx2{--sv-track:rgba(0,0,0,.35)}.ht-mx2 .sv-m-val{font-size:30px}.ht-mx2 .sv-m-h{grid-template-rows:32px 16px}`,
        };
      },
    },
  },
  allowed: {
    typography: ["heavy", "condensed", "slab"], treatment: ["clean", "sepia_grain", "film_grain"],
    image_motion: ["ken_burns_fast", "handheld", "push_in"], transition: ["zoom_through", "fade_black", "cut"], tone: [0, 1, 3],
  },
});

// --- 5. Extreme cold: băng giá bò dần vào màn hình -------------------------------------------------------------------
const COLD_RAMP = ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#f43f5e"];
function frostCreep(scene, i, stage, { cls = "" } = {}) {
  // 4 lớp băng phủ góc màn (bán kính tăng dần), mỗi lớp hiện theo mức độ — băng "bò" vào khi nguy hiểm tăng.
  const id = `cd-frost-${scene.index}`;
  const level = (k, sev) => t3(Math.min(1, Math.max(0, (sev - 1 - k * 2) / 2)));
  const sev = stage.data.items[i].severity;
  const prev = i ? stage.data.items[i - 1].severity : 1;
  const layers = [0, 1, 2, 3];
  const html = layers.map((k) => `<div class="cd-frost cd-f${k}${cls ? ` ${cls}` : ""}" id="${id}-${k}"></div>`).join("");
  const tweens = layers.map((k) => ({ method: "fromTo", target: `#${id}-${k}`, from: { opacity: level(k, prev) }, vars: { opacity: level(k, sev), duration: t3(Math.min(1.2, scene.visualDuration * 0.4)), ease: "power1.out" }, at: t3(scene.visualStart + 0.05 + k * 0.08) }));
  return { html, tweens };
}
const FROST_CSS = ".sv-card,.sv-mx{z-index:5}.cd-frost{position:absolute;inset:340px 0 0 0;z-index:1;pointer-events:none;opacity:0}.cd-f0{background:radial-gradient(circle at 0 0,rgba(240,250,255,.92) 0 90px,rgba(200,230,255,.5) 150px,transparent 200px),radial-gradient(circle at 100% 0,rgba(240,250,255,.92) 0 90px,rgba(200,230,255,.5) 150px,transparent 200px),radial-gradient(circle at 0 100%,rgba(240,250,255,.92) 0 90px,rgba(200,230,255,.5) 150px,transparent 200px),radial-gradient(circle at 100% 100%,rgba(240,250,255,.92) 0 90px,rgba(200,230,255,.5) 150px,transparent 200px)}.cd-f1{background:radial-gradient(circle at 0 0,rgba(240,250,255,.92) 0 144px,rgba(200,230,255,.5) 240px,transparent 320px),radial-gradient(circle at 100% 0,rgba(240,250,255,.92) 0 144px,rgba(200,230,255,.5) 240px,transparent 320px),radial-gradient(circle at 0 100%,rgba(240,250,255,.92) 0 144px,rgba(200,230,255,.5) 240px,transparent 320px),radial-gradient(circle at 100% 100%,rgba(240,250,255,.92) 0 144px,rgba(200,230,255,.5) 240px,transparent 320px)}.cd-f2{background:radial-gradient(circle at 0 0,rgba(240,250,255,.92) 0 207px,rgba(200,230,255,.5) 345px,transparent 460px),radial-gradient(circle at 100% 0,rgba(240,250,255,.92) 0 207px,rgba(200,230,255,.5) 345px,transparent 460px),radial-gradient(circle at 0 100%,rgba(240,250,255,.92) 0 207px,rgba(200,230,255,.5) 345px,transparent 460px),radial-gradient(circle at 100% 100%,rgba(240,250,255,.92) 0 207px,rgba(200,230,255,.5) 345px,transparent 460px)}.cd-f3{background:radial-gradient(circle at 0 0,rgba(240,250,255,.92) 0 279px,rgba(200,230,255,.5) 465px,transparent 620px),radial-gradient(circle at 100% 0,rgba(240,250,255,.92) 0 279px,rgba(200,230,255,.5) 465px,transparent 620px),radial-gradient(circle at 0 100%,rgba(240,250,255,.92) 0 279px,rgba(200,230,255,.5) 465px,transparent 620px),radial-gradient(circle at 100% 100%,rgba(240,250,255,.92) 0 279px,rgba(200,230,255,.5) 465px,transparent 620px)}";

const extremeCold = defineVariant({
  ...base,
  id: "survival/extreme-cold",
  name_vi: "Lạnh cực độ",
  topicPacks: { survival_cold: 0.7, survival_mountains: 0.3 },
  layoutFamily: "frost_creep",
  axes: { composition: "hero_image", textPlacement: "bottom", background: "metal", transition: "fade_black", imageMotion: "ken_burns_slow", typography: "rounded" },
  audio: { gender: "female", fx: ["none", "whisper"] },
  ui: {
    en: { label: "FROSTBITE CLOCK", scene: "LEVEL", level: "LEVEL", intro: "WARM", final: "FROZEN" }, de: { label: "ERFRIERUNGSUHR", scene: "STUFE", level: "STUFE", intro: "WARM", final: "ERFROREN" },
    ja: { label: "凍傷カウント", scene: "レベル", level: "レベル", intro: "温かい", final: "凍結" }, ko: { label: "동상 시계", scene: "단계", level: "단계", intro: "따뜻함", final: "동결" },
    vi: { label: "ĐỒNG HỒ BĂNG GIÁ", scene: "CẤP", level: "CẤP", intro: "ẤM ÁP", final: "ĐÓNG BĂNG" }, fr: { label: "HORLOGE DU GEL", scene: "NIVEAU", level: "NIVEAU", intro: "AU CHAUD", final: "GELÉ" },
  },
  compositions: {
    frosted_glass: {
      axes: { composition: "hero_image", textPlacement: "bottom" },
      describe: "Reactor mũ len khăn quàng chiếm lớn giữa; băng giá bò vào từ 4 góc màn theo mức độ; thanh chỉ số (trái) + thẻ cấp (phải); lời đọc",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "beanie", accent: accent(ctx), outline: { color: "#1e293b", width: 5 }, stage: "background:linear-gradient(180deg,#e0f2fe,#94a3b8)" });
        const colors = ["#38bdf8", "#f87171", "#a78bfa"];
        return {
          header: { style: "label_title", region: { x: 60, y: 90, w: 960, h: 180 } },
          visual: { frame: "plain", region: { x: 60, y: 290, w: 960, h: 850 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "glass", region: { x: 60, y: 1525, w: 960, h: 170 }, size: 40, enter: "fade_up" },
          sceneExtra: (scene, i, c) => merge(
            frostCreep(scene, i, stage),
            stage.reactor(scene, i, { x: 60, y: 1158, w: 240, h: 252 }, "cd-rx"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 320, y: 1158, w: 700, h: 252 }, cls: "cd-card sv-compact", ramp: COLD_RAMP, labelSize: 44, parts: ["eyebrow", "tag", "label", "status", "severity"] }),
            metricBars(scene, i, { data: stage.data, region: { x: 60, y: 1422, w: 960, h: 92 }, cls: "cd-mx sv-row3", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          vars: { "--frame-edge": "#e0f2fe" },
          css: `${BASE_CSS}${FROST_CSS}.f-plain{border-radius:24px}.cd-rx{border:5px solid #e0f2fe}.cd-card,.cd-mx{background:rgba(15,23,42,.72);padding:14px 18px;border-radius:18px}.cd-card{color:#f0f9ff}.cd-card .sv-tag{color:#7dd3fc}.cd-card .sv-eyebrow{font-size:22px;color:#bae6fd}.cd-mx .sv-m-t,.cd-mx .sv-m-val{color:#f0f9ff}.cd-mx{--sv-track:rgba(240,249,255,.18)}.cd-mx .sv-m-h{grid-template-rows:32px 18px}.cd-mx .sv-m-val{font-size:28px}`,
        };
      },
    },
    ice_card: {
      axes: { composition: "card_stack", textPlacement: "top" },
      describe: "Lời đọc trên cùng; reactor trên thẻ băng nghiêng giữa màn, chỉ số dọc như cột băng bên trái; thẻ cấp dưới; băng giá bò từ các góc",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "beanie", accent: "#be123c", outline: null, stage: "background:radial-gradient(circle at 50% 30%,#f8fafc,#bae6fd 70%)" });
        const colors = ["#7dd3fc", "#fda4af", "#c4b5fd"];
        return {
          header: { style: "centered", region: { x: 60, y: 80, w: 960, h: 170 } },
          text: { style: "marker", region: { x: 60, y: 265, w: 960, h: 190 }, size: 42, enter: "fade_up" },
          visual: { frame: "card", region: { x: 250, y: 478, w: 790, h: 890 } },
          panel: (scene, i) => `${stage.panel(scene, i)}${frostCreep(scene, i, stage, { cls: "cd-frost-in" }).html}`,
          sceneExtra: (scene, i, c) => merge(
            { tweens: frostCreep(scene, i, stage).tweens },
            metricBars(scene, i, { data: stage.data, region: { x: 40, y: 478, w: 190, h: 890 }, cls: "cd-mx2", orient: "v", colors }),
            stage.reactor(scene, i, { x: 40, y: 1392, w: 240, h: 255 }, "cd-rx2"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 300, y: 1392, w: 740, h: 303 }, cls: "cd-card2", ramp: COLD_RAMP, labelSize: 48 }),
            { tweens: stage.tweens(scene, i) },
          ),
          vars: { "--gold": "#93c5fd" },
          css: `${BASE_CSS}${FROST_CSS}.cd-rx2{border:6px solid #93c5fd;border-radius:22px;transform:rotate(-2deg)}.cd-card2{gap:8px;background:rgba(15,23,42,.78);padding:16px 24px;border-radius:22px;color:#f0f9ff}.cd-card2 .sv-tag{color:#93c5fd}.cd-card2 .sv-eyebrow{color:#bae6fd}.cd-mx2{background:rgba(15,23,42,.72);padding:14px 8px;border-radius:18px;gap:8px}.cd-mx2 .sv-m-t,.cd-mx2 .sv-m-val{color:#f0f9ff}.cd-mx2 .sv-m-val{font-size:20px}.cd-mx2 .sv-m-v{grid-template-rows:1fr 34px 66px}.cd-mx2 .sv-m-t{white-space:normal;line-height:1.05;text-align:center;letter-spacing:0}.cd-frost.cd-frost-in{inset:0;z-index:2}.cd-frost-in.cd-f2,.cd-frost-in.cd-f3{display:none}.cd-mx2 .sv-m-v .sv-m-track{width:30px;border-radius:0 0 15px 15px}.cd-mx2{--sv-track:rgba(240,249,255,.18)}.t-marker .v-line{color:#0c4a6e!important}`,
        };
      },
    },
  },
  allowed: {
    typography: ["rounded", "grotesk", "serif"], treatment: ["clean", "vignette_dark"],
    image_motion: ["ken_burns_slow", "still_grain", "parallax"], transition: ["fade_black", "ink_bleed", "cut"], tone: [0, 2, 4],
  },
});

// --- 6. No sleep: lịch xé theo cấp + pin cạn dần ------------------------------------------------------------------
const SLEEP_RAMP = ["#a7f3d0", "#6ee7b7", "#fde68a", "#fcd34d", "#fdba74", "#fb923c", "#f87171", "#ef4444", "#dc2626", "#7f1d1d"];
function calendarPage(scene, i, stage, { region, cls, ui, lang }) {
  const id = `ns-cal-${scene.index}`;
  const item = stage.data.items[i];
  const big = item.role === "prologue" ? "0" : item.role === "outro" ? String(item.levelTotal) : String(item.levelNo);
  return {
    html: `<div class="ns-cal ${cls}" id="${id}" style="${regionStyle(region)}"><div class="ns-cal-top">${escapeHtml(upper(ui.level, lang))}</div><div class="ns-cal-num">${big}</div><div class="ns-cal-sub">${escapeHtml(tagText(item, ui, lang))}</div></div>`,
    tweens: [{ method: "fromTo", target: `#${id}`, from: { rotationX: -80, transformOrigin: "50% 0%" }, vars: { rotationX: 0, duration: 0.5, ease: "back.out(1.4)" }, at: t3(scene.visualStart + 0.1) }],
  };
}
const CAL_CSS = ".ns-cal{position:absolute;box-sizing:border-box;background:#fffdf7;border-radius:14px;box-shadow:0 14px 28px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;text-align:center}.ns-cal-top{flex:none;height:26%;background:#dc2626;color:#fff;font-size:40px;letter-spacing:4px;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden}.ns-cal-num{flex:1;display:flex;align-items:center;justify-content:center;font-size:180px;font-weight:700;color:#1c1917;line-height:1}.ns-cal-sub{flex:none;height:18%;font-size:28px;color:#57534e;letter-spacing:2px;white-space:nowrap;overflow:hidden}";
function battery(c, stage, { x, y, w, h }) {
  const val = (k) => t3(Math.max(0.03, avg(stage.data.items[k]) / 100));
  return {
    html: `<div class="ns-bat" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="ns-bat-cell"><i id="ns-bat-fill"></i></div><b></b></div>`,
    tweens: stepTweens("#ns-bat-fill", c.scenes, val, { prop: "scaleX" }),
  };
}
const BAT_CSS = ".ns-bat{position:absolute}.ns-bat-cell{position:absolute;left:0;top:0;bottom:0;right:40px;border:10px solid #1c1917;border-radius:18px;padding:10px;background:#fffdf7;box-sizing:border-box}.ns-bat-cell i{display:block;width:100%;height:100%;border-radius:6px;background:linear-gradient(90deg,#ef4444,#f59e0b 40%,#22c55e 75%);transform-origin:0 50%}.ns-bat b{position:absolute;right:0;top:32%;bottom:32%;width:34px;background:#1c1917;border-radius:0 10px 10px 0}";

const noSleep = defineVariant({
  ...base,
  id: "survival/no-sleep",
  name_vi: "Không ngủ, không ăn",
  topicPacks: { survival_deprivation: 0.7, survival_body_limits: 0.3 },
  layoutFamily: "tear_calendar",
  axes: { composition: "grid", textPlacement: "bottom", background: "wood_paper", transition: "page_turn", imageMotion: "handheld", typography: "typewriter" },
  audio: { gender: "any", fx: ["none", "whisper"] },
  ui: {
    en: { label: "RUNNING ON EMPTY", scene: "LEVEL", level: "LEVEL", intro: "RESTED", final: "EMPTY", battery: "BATTERY" }, de: { label: "AKKU LEER", scene: "STUFE", level: "STUFE", intro: "AUSGERUHT", final: "LEER", battery: "AKKU" },
    ja: { label: "限界まで起きている", scene: "レベル", level: "レベル", intro: "睡眠十分", final: "空っぽ", battery: "バッテリー" }, ko: { label: "방전 직전", scene: "단계", level: "단계", intro: "충전됨", final: "방전", battery: "배터리" },
    vi: { label: "CẠN KIỆT", scene: "CẤP", level: "CẤP", intro: "ĐỦ GIẤC", final: "CẠN SẠCH", battery: "PIN" }, fr: { label: "À BOUT DE FORCES", scene: "NIVEAU", level: "NIVEAU", intro: "REPOSÉ", final: "À PLAT", battery: "BATTERIE" },
  },
  compositions: {
    desk: {
      axes: { composition: "grid", textPlacement: "bottom" },
      describe: "Bàn gỗ: lịch xé (số cấp) và pin cạn dần bên trái, reactor mắt thâm trong polaroid bên phải; thẻ cấp; 3 thanh chỉ số; lời đọc giấy đánh máy",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "sleepy", accent: accent(ctx), outline: { color: "#1c1917", width: 4 }, stage: "background:linear-gradient(180deg,#312e81,#1e1b4b)" });
        const colors = ["#16a34a", "#d97706", "#2563eb"];
        return {
          header: { style: "tab", region: { x: 60, y: 100, w: 960, h: 180 } },
          visual: { frame: "polaroid", region: { x: 330, y: 300, w: 710, h: 920 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "typed_sheet", region: { x: 40, y: 1520, w: 1000, h: 175 }, size: 40, enter: "type" },
          sceneExtra: (scene, i, c) => merge(
            calendarPage(scene, i, stage, { region: { x: 45, y: 305, w: 260, h: 290 }, cls: "ns-cal-s", ui: c.ui, lang: ctx.lang }),
            stage.reactor(scene, i, { x: 40, y: 820, w: 270, h: 400 }, "ns-rx"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 40, y: 1242, w: 1000, h: 170 }, cls: "ns-card", ramp: SLEEP_RAMP, labelSize: 44, parts: ["eyebrow", "label", "status", "severity"] }),
            metricBars(scene, i, { data: stage.data, region: { x: 40, y: 1422, w: 1000, h: 88 }, cls: "ns-mx sv-row3", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          overlay: (c) => { const b = battery(c, stage, { x: 50, y: 625, w: 255, h: 110 }); return { html: `${b.html}<div class="ns-bat-l">${escapeHtml(upper(c.ui.battery, ctx.lang))}</div>`, css: `${BAT_CSS}.ns-bat-l{position:absolute;left:55px;top:742px;max-width:250px;overflow:hidden;font-size:26px;letter-spacing:3px;color:#fef3c7;white-space:nowrap}`, tweens: b.tweens }; },
          css: `${BASE_CSS}${CAL_CSS}.f-polaroid{padding:22px 22px 64px}.ns-cal-s .ns-cal-top{font-size:28px;letter-spacing:2px}.ns-cal-s .ns-cal-num{font-size:120px}.ns-cal-s .ns-cal-sub{font-size:22px}.ns-rx{border:8px solid #fffdf7;border-radius:10px;transform:rotate(-1.2deg)}.ns-card{gap:6px;background:rgba(28,25,23,.82);padding:12px 20px;color:#fef3c7}.ns-card .sv-row{position:absolute;right:20px;top:12px;width:400px}.ns-card .sv-label-box{margin-right:420px}.ns-card .sv-pips{position:absolute;right:20px;bottom:12px;width:400px}.ns-mx{background:rgba(254,243,199,.92);padding:10px 18px}.ns-mx .sv-m-t,.ns-mx .sv-m-val{color:#1c1917}`,
        };
      },
    },
    week_strip: {
      axes: { composition: "ledger_columns", textPlacement: "top" },
      describe: "Lời đọc giấy đánh máy trên cùng; dải lịch các cấp (trang hiện tại nổi bật); reactor trái, pin + thẻ cấp phải; chỉ số dưới",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "sleepy", accent: "#0f766e", outline: null, flat: true, stage: "background:radial-gradient(circle at 50% 20%,#fde68a,#78350f 80%)" });
        const colors = ["#15803d", "#b45309", "#1d4ed8"];
        return {
          header: { style: "tab", region: { x: 60, y: 100, w: 700, h: 180 } },
          text: { style: "typed_sheet", region: { x: 40, y: 295, w: 1000, h: 200 }, size: 42, enter: "type" },
          visual: { frame: "tape_photo", region: { x: 40, y: 690, w: 1000, h: 690 } },
          panel: (scene, i) => stage.panel(scene, i),
          sceneExtra: (scene, i, c) => {
            const n = c.scenes.length;
            const w = Math.floor((960 - (n - 1) * 12) / n);
            const days = stage.data.items.map((item, k) => `<div class="ns-day${k === i ? " on" : ""}${k < i ? " done" : ""}" style="left:${60 + k * (w + 12)}px;width:${w}px"><b>${item.role === "prologue" ? 0 : item.role === "outro" ? item.levelTotal : item.levelNo}</b></div>`).join("");
            return merge(
              { html: `<div class="ns-week">${days}</div>`, tweens: [] },
              stage.reactor(scene, i, { x: 40, y: 1402, w: 250, h: 290 }, "ns-rx2"),
              levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 310, y: 1398, w: 730, h: 205 }, cls: "ns-card2 sv-compact", ramp: SLEEP_RAMP, labelSize: 42 }),
              metricBars(scene, i, { data: stage.data, region: { x: 310, y: 1613, w: 730, h: 82 }, cls: "ns-mx2 sv-row3", colors }),
              { tweens: stage.tweens(scene, i) },
            );
          },
          overlay: (c) => { const b = battery(c, stage, { x: 790, y: 150, w: 250, h: 100 }); return { html: b.html, css: `${BAT_CSS}.ns-bat-cell{border-width:8px;padding:7px}`, tweens: b.tweens }; },
          css: `${BASE_CSS}.ns-rx2{border:10px solid #fffdf7;box-shadow:0 10px 22px rgba(0,0,0,.4)}.ns-card2.sv-compact{padding:10px 18px}.ns-card2 .sv-pips{display:none}.ns-card2 .sv-eyebrow{font-size:22px}.ns-week{position:absolute;left:0;top:522px;width:1080px;height:140px}.ns-day{position:absolute;top:0;height:140px;box-sizing:border-box;background:#fffdf7;border-top:30px solid #dc2626;border-radius:10px;text-align:center;box-shadow:0 8px 16px rgba(0,0,0,.35)}.ns-day b{display:block;font-size:64px;line-height:100px;color:#1c1917}.ns-day.done{background:#e7e0d2}.ns-day.done b{color:#57534e;text-decoration:line-through;text-decoration-color:#dc2626;text-decoration-thickness:8px}.ns-day.on{transform:translateY(-12px) scale(1.06);box-shadow:0 0 0 6px #fde047,0 12px 20px rgba(0,0,0,.4)}.ns-card2{background:rgba(28,25,23,.85);padding:16px 20px;color:#fef3c7}.ns-card2 .sv-eyebrow{color:#fcd34d}.ns-card2 .sv-tag{color:#fde68a}.ns-mx2{background:rgba(254,243,199,.92);padding:8px 16px}.ns-mx2 .sv-m-t,.ns-mx2 .sv-m-val{color:#1c1917}`,
        };
      },
    },
  },
  allowed: {
    typography: ["typewriter", "mono", "rounded"], treatment: ["paper_texture", "film_grain", "clean"],
    image_motion: ["handheld", "still_grain", "ken_burns_slow"], transition: ["page_turn", "folder_flip", "cut"], tone: [0, 1, 2, 3],
  },
});

// --- 7. Lab exposure: máy đếm Geiger (kim + màn LCD + tiếng tách nhấp nháy theo mức độ) ---------------------------------
const LAB_RAMP = ["#bef264", "#a3e635", "#d9f99d", "#fde047", "#facc15", "#f59e0b", "#f97316", "#ef4444", "#dc2626", "#9f1239"];
function geiger(scene, i, stage, { region, cls, ui, lang, horizontal = false }) {
  const id = `lb-gc-${scene.index}`;
  const item = stage.data.items[i];
  const prev = i ? stage.data.items[i - 1].severity : 1;
  const ticks = Array.from({ length: 11 }, (_, k) => `<i style="transform:rotate(${-120 + k * 24}deg)"></i>`).join("");
  const dots = Array.from({ length: 10 }, (_, k) => `<em id="${id}-c${k}"${k < item.severity ? "" : " class=\"off\""}></em>`).join("");
  const clicks = [];
  for (let k = 0; k < item.severity; k += 1) clicks.push({ method: "fromTo", target: `#${id}-c${k}`, from: { opacity: 0.15 }, vars: { opacity: 1, duration: 0.06, ease: "none" }, at: t3(scene.visualStart + 0.3 + k * 0.11) });
  return {
    html: `<div class="lb-gc ${horizontal ? "lb-h" : ""} ${cls}" id="${id}" style="${regionStyle(region)}"><div class="lb-dial">${ticks}<b id="${id}-needle"></b></div><div class="lb-lcd">${item.severity}/10</div><div class="lb-clicks">${dots}</div><div class="lb-name">${escapeHtml(upper(ui.meter, lang))}</div></div>`,
    tweens: [...needleTweens(`#${id}-needle`, scene, prev, item.severity), ...clicks],
  };
}
const GEIGER_CSS = ".lb-gc{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#facc15,#eab308);border:8px solid #1c1917;border-radius:26px;padding:22px;display:grid;grid-template-rows:auto 90px 40px 40px;gap:14px;box-shadow:0 18px 30px rgba(0,0,0,.35)}.lb-h{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 60px;column-gap:24px}.lb-h .lb-dial{grid-row:1/4}.lb-dial{position:relative;aspect-ratio:1;max-height:100%;justify-self:center;width:100%;border-radius:50%;background:radial-gradient(circle,#f8fafc 0 62%,#1c1917 64%);min-height:0}.lb-dial i{position:absolute;left:50%;top:10%;width:5px;height:10%;margin-left:-2.5px;background:#1c1917;transform-origin:50% 400%}.lb-dial b{position:absolute;left:50%;top:14%;width:8px;height:36%;margin-left:-4px;background:#dc2626;transform-origin:50% 100%;border-radius:4px}.lb-lcd{background:#1f2e1a;color:#a3e635;font-size:64px;line-height:90px;text-align:center;border-radius:10px;font-weight:700;letter-spacing:4px}.lb-clicks{display:flex;gap:8px;align-items:center}.lb-clicks em{flex:1;height:30px;border-radius:50%;background:#dc2626}.lb-clicks em.off{background:rgba(28,25,23,.25)}.lb-name{font-size:28px;letter-spacing:4px;color:#1c1917;text-align:center;white-space:nowrap;overflow:hidden;font-weight:700}";

const labExposure = defineVariant({
  ...base,
  id: "survival/lab-exposure",
  name_vi: "Phơi nhiễm phòng thí nghiệm",
  topicPacks: { survival_radiation: 0.6, survival_toxic: 0.4 },
  layoutFamily: "geiger_counter",
  axes: { composition: "split_horizontal", textPlacement: "top", background: "flat_color", transition: "glitch", imageMotion: "scan_light", typography: "slab" },
  audio: { gender: "male", fx: ["none", "radio"] },
  ui: {
    en: { label: "EXPOSURE REPORT", scene: "LEVEL", level: "LEVEL", intro: "BASELINE", final: "LETHAL", meter: "GEIGER" }, de: { label: "EXPOSITIONSBERICHT", scene: "STUFE", level: "STUFE", intro: "BASISWERT", final: "LETAL", meter: "GEIGER" },
    ja: { label: "被ばく報告", scene: "レベル", level: "レベル", intro: "基準", final: "致死", meter: "ガイガー" }, ko: { label: "피폭 보고서", scene: "단계", level: "단계", intro: "기준", final: "치사", meter: "가이거" },
    vi: { label: "BÁO CÁO PHƠI NHIỄM", scene: "CẤP", level: "CẤP", intro: "MỨC NỀN", final: "CHẾT NGƯỜI", meter: "GEIGER" }, fr: { label: "RAPPORT D'EXPOSITION", scene: "NIVEAU", level: "NIVEAU", intro: "RÉFÉRENCE", final: "LÉTAL", meter: "GEIGER" },
  },
  compositions: {
    bench: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Lời đọc bảng trên cùng; reactor kính bảo hộ áo blouse trái, máy đếm Geiger vàng (kim, LCD mức độ, đèn tách) phải; thẻ cấp; 3 thanh chỉ số",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "goggles", accent: accent(ctx), outline: { color: "#1c1917", width: 5 }, stage: "background:repeating-linear-gradient(135deg,#f1f5f9 0 40px,#e2e8f0 40px 80px)" });
        const colors = ["#65a30d", "#dc2626", "#0891b2"];
        return {
          header: { style: "label_title", region: { x: 60, y: 90, w: 960, h: 180 } },
          text: { style: "panel", region: { x: 40, y: 285, w: 1000, h: 185 }, size: 42, enter: "clip" },
          visual: { frame: "plain", region: { x: 40, y: 490, w: 740, h: 875 } },
          panel: (scene, i) => stage.panel(scene, i),
          sceneExtra: (scene, i, c) => merge(
            geiger(scene, i, stage, { region: { x: 800, y: 490, w: 240, h: 450 }, cls: "lb-gc-s", ui: c.ui, lang: ctx.lang }),
            stage.reactor(scene, i, { x: 800, y: 960, w: 240, h: 405 }, "lb-rx"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 40, y: 1393, w: 1000, h: 207 }, cls: "lb-card", ramp: LAB_RAMP, labelSize: 44, parts: ["eyebrow", "tag", "label", "status"] }),
            metricBars(scene, i, { data: stage.data, region: { x: 40, y: 1610, w: 1000, h: 85 }, cls: "lb-mx sv-row3", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          decor: [{ kind: "rule_lines", x: 40, y: 1374, w: 1000, color: "#eab308", count: 2, gap: 8 }],
          css: `${BASE_CSS}${GEIGER_CSS}.lb-gc-s{padding:16px;gap:10px;grid-template-rows:auto 70px 30px 34px;border-width:6px}.lb-gc-s .lb-lcd{font-size:48px;line-height:70px;letter-spacing:2px}.lb-gc-s .lb-clicks{gap:4px}.lb-gc-s .lb-clicks em{height:22px}.lb-gc-s .lb-name{font-size:24px;letter-spacing:2px}.lb-rx{border:6px solid #1c1917}.lb-card{color:var(--fg)}.lb-card .sv-tag{color:var(--head-ink);border-left:6px solid var(--accent-terra-ink);padding-left:10px}.lb-card .sv-eyebrow{position:absolute;right:0;top:4px}.lb-card .sv-row{position:absolute;right:0;bottom:0;width:360px;justify-content:flex-end}.lb-card .sv-label-box{margin-right:380px}.lb-mx .sv-m-t,.lb-mx .sv-m-val{color:var(--fg)}.lb-mx{--sv-track:rgba(0,0,0,.12)}`,
        };
      },
    },
    hazard_ring: {
      axes: { composition: "circle_frame", textPlacement: "bottom" },
      describe: "Reactor trong vòng tròn viền sọc cảnh báo trên cùng; máy Geiger nằm ngang giữa màn; thẻ cấp (trái) + chỉ số (phải); lời đọc dưới",
      design: (ctx) => {
        const stage = reactorStage(ctx, { gear: "goggles", accent: "#7c3aed", outline: null, stage: "background:radial-gradient(circle,#ecfccb,#84cc16 90%)" });
        const colors = ["#4d7c0f", "#b91c1c", "#0e7490"];
        return {
          header: { style: "ribbon", region: { x: 90, y: 100, w: 900, h: 140 }, size: 48 },
          visual: { frame: "circle", region: { x: 140, y: 268, w: 800, h: 800 } },
          panel: (scene, i) => stage.panel(scene, i),
          text: { style: "panel", region: { x: 40, y: 1530, w: 1000, h: 165 }, size: 42, enter: "clip" },
          sceneExtra: (scene, i, c) => merge(
            geiger(scene, i, stage, { region: { x: 40, y: 1095, w: 700, h: 218 }, cls: "lb-gc-h", ui: c.ui, lang: ctx.lang, horizontal: true }),
            stage.reactor(scene, i, { x: 760, y: 1095, w: 280, h: 218 }, "lb-rx2"),
            levelCard(scene, stage.data.items[i], { data: stage.data, ui: c.ui, lang: ctx.lang, region: { x: 40, y: 1330, w: 490, h: 188 }, cls: "lb-card2 sv-compact", ramp: LAB_RAMP, labelSize: 40, parts: ["eyebrow", "tag", "label", "status"] }),
            metricBars(scene, i, { data: stage.data, region: { x: 550, y: 1338, w: 490, h: 172 }, cls: "lb-mx2", colors }),
            { tweens: stage.tweens(scene, i) },
          ),
          vars: { "--frame-edge": "#eab308" },
          css: `${BASE_CSS}${GEIGER_CSS}.f-circle{border-style:dashed!important;border-width:18px!important;border-color:#1c1917!important;box-shadow:0 0 0 14px #eab308,0 30px 60px rgba(0,0,0,.35)!important}.lb-gc-h{padding:14px 22px;row-gap:8px}.lb-gc-h .lb-lcd{font-size:50px;line-height:70px}.lb-rx2{border:8px dashed #1c1917;box-shadow:0 0 0 6px #eab308}.lb-card2{gap:6px;color:var(--fg)}.lb-card2 .sv-eyebrow{font-size:22px}.lb-mx2 .sv-m-h{grid-template-rows:32px 16px}.lb-card2 .sv-tag{color:var(--head-ink);border-left:6px solid var(--accent-terra-ink);padding-left:10px}.lb-mx2 .sv-m-t,.lb-mx2 .sv-m-val{color:var(--fg)}.lb-mx2{--sv-track:rgba(0,0,0,.12)}`,
        };
      },
    },
  },
  allowed: {
    typography: ["slab", "mono", "grotesk"], treatment: ["clean", "halftone", "vhs_noise"],
    image_motion: ["scan_light", "still_grain", "push_in"], transition: ["glitch", "tv_noise", "cut"], tone: [0, 1, 2, 5],
  },
});

export default [endurance, deepSea, spaceExposure, extremeHeat, extremeCold, noSleep, labExposure];
